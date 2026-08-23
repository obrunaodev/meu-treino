import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { authSessions, users, userSettings } from '../db/schema.js'
import { buildAuthUrl, exchangeCode, verifyIdToken } from '../lib/google.js'
import {
  ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS, hashRefreshToken, newRefreshToken, signAccessToken,
} from '../lib/tokens.js'
import { env, hasGoogleOAuth, isProd } from '../lib/env.js'
import { logger } from '../lib/logger.js'
import { badRequest, forbidden, unauthorized } from '../lib/http-error.js'
import { requireAuth } from '../middleware/auth.js'

export const authRouter = Router()

const REFRESH_COOKIE = 'treino_refresh'
const PKCE_COOKIE = 'treino_pkce'

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/auth',
  maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
}

function base64url(buf: Buffer) {
  return buf.toString('base64url')
}

interface Identity {
  googleSub: string
  email: string
  name: string
  pictureUrl: string | null
  locale: string
}

/** Cadastro aberto: qualquer identidade válida entra e vira usuário na hora. */
async function upsertUser(identity: Identity) {
  const [user] = await db
    .insert(users)
    .values(identity)
    .onConflictDoUpdate({
      target: users.googleSub,
      set: {
        email: identity.email,
        name: identity.name,
        pictureUrl: identity.pictureUrl,
        updatedAt: new Date(),
      },
    })
    .returning()

  if (!user) throw badRequest('falha_ao_criar_usuario')

  await db
    .insert(userSettings)
    .values({ id: randomUUID(), ownerId: user.id, locale: user.locale })
    .onConflictDoNothing({ target: userSettings.ownerId })

  return user
}

/**
 * Ponto único de emissão de sessão. Google e login provisório passam por aqui
 * para que os dois caminhos tenham exatamente as mesmas propriedades de
 * cookie, TTL e rotação — e para que remover o provisório seja apagar a rota,
 * sem tocar em nada de segurança.
 */
async function issueSession(req: Request, res: Response, userId: string) {
  const refresh = newRefreshToken()
  await db.insert(authSessions).values({
    userId,
    refreshTokenHash: hashRefreshToken(refresh),
    userAgent: req.headers['user-agent'] ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
  })
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions)
}

/** Diz ao frontend quais caminhos de login existem, em vez de ele adivinhar. */
authRouter.get('/config', (_req, res) => {
  res.json({ google: hasGoogleOAuth, devLogin: env.DEV_LOGIN_ENABLED })
})

authRouter.get('/google', (_req, res) => {
  if (!hasGoogleOAuth) throw badRequest('google_oauth_nao_configurado')

  const state = base64url(randomBytes(16))
  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())

  // state e verifier viajam juntos num cookie curto; o callback confere os dois.
  res.cookie(PKCE_COOKIE, JSON.stringify({ state, codeVerifier }), {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 10 * 60 * 1000,
  })
  res.redirect(buildAuthUrl(state, codeChallenge))
})

authRouter.get('/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null
  const state = typeof req.query.state === 'string' ? req.query.state : null
  const raw = req.cookies?.[PKCE_COOKIE]
  if (!code || !state || !raw) throw badRequest('callback_incompleto')

  const pkce = JSON.parse(raw) as { state: string; codeVerifier: string }
  if (pkce.state !== state) throw badRequest('state_divergente')
  res.clearCookie(PKCE_COOKIE, { path: '/auth' })

  const { id_token } = await exchangeCode(code, pkce.codeVerifier)
  const identity = await verifyIdToken(id_token)

  const user = await upsertUser({
    googleSub: identity.sub,
    email: identity.email,
    name: identity.name ?? identity.email,
    pictureUrl: identity.picture ?? null,
    locale: identity.locale?.startsWith('pt') ? 'pt-BR' : 'en-US',
  })

  await issueSession(req, res, user.id)
  res.redirect(`${env.APP_ORIGIN}/auth/callback`)
})

const devLoginBody = z.object({
  token: z.string(),
  email: z.string().email(),
  name: z.string().trim().min(1).max(80).optional(),
})

/**
 * Login provisório, enquanto o OAuth do Google não está configurado.
 *
 * É um bypass de autenticação de propósito, então o token é a única barreira:
 * comparado em tempo constante e exigido com 32+ caracteres pelo boot (ver
 * lib/env.ts). O `googleSub` recebe o prefixo `dev:` para que essas contas
 * fiquem distinguíveis no banco e removíveis com um DELETE só.
 *
 * Para desligar: DEV_LOGIN_ENABLED=false. Para remover de vez, apague esta
 * rota — nenhuma outra parte do sistema depende dela.
 */
authRouter.post('/dev-login', async (req, res) => {
  if (!env.DEV_LOGIN_ENABLED) throw forbidden('login_provisorio_desativado')

  const { token, email, name } = devLoginBody.parse(req.body)

  const provided = Buffer.from(token)
  const expected = Buffer.from(env.DEV_LOGIN_TOKEN)
  // timingSafeEqual exige mesmo comprimento; o teste de tamanho vem antes e
  // não vaza mais do que o próprio erro já vazaria.
  const ok = provided.length === expected.length && timingSafeEqual(provided, expected)

  if (!ok) {
    logger.warn({ email, ip: req.ip }, 'login provisório recusado: token inválido')
    throw unauthorized('token_invalido')
  }

  const user = await upsertUser({
    googleSub: `dev:${email}`,
    email,
    name: name ?? email.split('@')[0]!,
    pictureUrl: null,
    locale: 'pt-BR',
  })

  logger.warn({ email, userId: user.id }, 'sessão criada por login provisório')
  await issueSession(req, res, user.id)
  res.json({ accessToken: await signAccessToken(user.id), expiresIn: ACCESS_TTL_SECONDS })
})

/**
 * Troca o cookie de refresh por um access token. Rotaciona o refresh a cada
 * chamada — um token roubado só vale até o dono usar o dele.
 */
authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (!token) throw unauthorized('sem_refresh')

  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(
      eq(authSessions.refreshTokenHash, hashRefreshToken(token)),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date()),
    ))
    .limit(1)

  if (!session) throw unauthorized('refresh_invalido')

  const next = newRefreshToken()
  await db
    .update(authSessions)
    .set({
      refreshTokenHash: hashRefreshToken(next),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    })
    .where(eq(authSessions.id, session.id))

  res.cookie(REFRESH_COOKIE, next, refreshCookieOptions)
  res.json({
    accessToken: await signAccessToken(session.userId),
    expiresIn: ACCESS_TTL_SECONDS,
  })
})

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (token) {
    await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(authSessions.refreshTokenHash, hashRefreshToken(token)))
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/auth' })
  res.status(204).end()
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1)
  if (!user) throw unauthorized()
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.ownerId, user.id))
    .limit(1)

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    pictureUrl: user.pictureUrl,
    locale: user.locale,
    onboardedAt: settings?.onboardedAt ?? null,
  })
})
