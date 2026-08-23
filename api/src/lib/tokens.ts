import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { env } from './env.js'

const secret = new TextEncoder().encode(env.SESSION_SECRET)

/**
 * Access token curto, guardado só em memória no cliente. O refresh vive num
 * cookie httpOnly de 30 dias porque o app precisa continuar utilizável offline
 * por dias sem que o usuário seja deslogado ao voltar.
 */
export const ACCESS_TTL_SECONDS = 15 * 60
export const REFRESH_TTL_DAYS = 30

export async function signAccessToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret)
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
  if (!payload.sub) throw new Error('token sem sub')
  return payload.sub
}

export function newRefreshToken() {
  return randomBytes(32).toString('base64url')
}

/** Só o hash vai para o banco: vazamento do dump não vira sessão válida. */
export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
