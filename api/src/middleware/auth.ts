import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from '../lib/tokens.js'
import { unauthorized } from '../lib/http-error.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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
