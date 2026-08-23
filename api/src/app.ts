import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { pinoHttp } from 'pino-http'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { errorHandler } from './middleware/error.js'
import { authRouter } from './routes/auth.js'
import { syncRouter } from './routes/sync.js'
import { mediaRouter } from './routes/media.js'
import { catalogRouter } from './routes/catalog.js'
import { pushRouter } from './routes/push.js'
import { whatsappRouter } from './routes/whatsapp.js'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(pinoHttp({ logger }))
  // credentials: o cookie de refresh precisa atravessar a origem do Vite em dev.
  app.use(cors({ origin: env.APP_ORIGIN, credentials: true }))
  app.use(cookieParser())
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.use('/auth', authRouter)
  app.use('/api/sync', syncRouter)
  app.use('/api/media', mediaRouter)
  app.use('/api/catalog', catalogRouter)
  app.use('/api/push', pushRouter)
  app.use('/api/whatsapp', whatsappRouter)

  app.use(errorHandler)
  return app
}
