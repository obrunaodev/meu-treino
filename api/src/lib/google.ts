import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { env } from './env.js'
import { badRequest } from './http-error.js'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const ISSUER = 'https://accounts.google.com'

const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

/** Escopos não-sensíveis: dispensam verificação do consent screen no Google. */
const SCOPES = 'openid email profile'

export function buildAuthUrl(state: string, codeChallenge: string) {
  const url = new URL(AUTH_ENDPOINT)
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  // Sem isto o Google pula a tela de seleção quando só há uma conta logada.
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

const tokenResponse = z.object({ id_token: z.string() })

export async function exchangeCode(code: string, codeVerifier: string) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) throw badRequest('troca_de_codigo_falhou', await res.text())
  return tokenResponse.parse(await res.json())
}

const idTokenClaims = z.object({
  sub: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
  locale: z.string().optional(),
})

export type GoogleIdentity = z.infer<typeof idTokenClaims>

export async function verifyIdToken(idToken: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ISSUER,
    audience: env.GOOGLE_CLIENT_ID,
  })
  return idTokenClaims.parse(payload)
}
