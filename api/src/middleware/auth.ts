import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from '../lib/tokens.js'
import { forbidden, unauthorized } from '../lib/http-error.js'
import { userHasRole } from '../lib/admin-roles.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next(unauthorized())

  try {
    req.userId = await verifyAccessToken(header.slice('Bearer '.length))
    next()
  } catch {
    next(unauthorized('token_invalido'))
  }
}

/** Authorizes an authenticated request against a current database role assignment. */
export function requireRole(roleCode: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userId) return next(unauthorized())
    if (!await userHasRole(req.userId, roleCode)) return next(forbidden())
    next()
  }
}
