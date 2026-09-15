import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
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
  // Erro do multer é culpa do arquivo, não do servidor. Como 500, a fila de
  // upload do cliente tentava de novo para sempre e travava as fotos seguintes.
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? res.status(413).json({ code: 'arquivo_grande_demais' })
      : res.status(400).json({ code: 'upload_invalido', details: { reason: err.code } })
  }
  logger.error(err, 'erro não tratado')
  res.status(500).json({ code: 'erro_interno' })
}
