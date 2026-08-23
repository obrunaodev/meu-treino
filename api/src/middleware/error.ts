import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ code: err.code, details: err.details })
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ code: 'payload_invalido', details: err.issues })
  }
  logger.error(err, 'erro não tratado')
  res.status(500).json({ code: 'erro_interno' })
}
