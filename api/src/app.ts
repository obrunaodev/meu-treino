import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { pinoHttp } from 'pino-http'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { errorHandler } from './middleware/error.js'
import { securityHeaders } from './middleware/security.js'
import { rateLimit } from './middleware/rate-limit.js'
import { authRouter } from './routes/auth.js'
import { syncRouter } from './routes/sync.js'
import { mediaRouter } from './routes/media.js'
import { catalogRouter } from './routes/catalog.js'
import { pushRouter } from './routes/push.js'
import { whatsappRouter } from './routes/whatsapp.js'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  // Não anuncia o stack para quem está procurando alvo por versão.
  app.disable('x-powered-by')
  app.use(securityHeaders)
  app.use(pinoHttp({ logger }))
  // credentials: o cookie de refresh precisa atravessar a origem do Vite em dev.
  app.use(cors({ origin: env.APP_ORIGIN, credentials: true }))
  app.use(cookieParser())
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  /**
   * Os tetos ficam nas rotas, não nos routers.
   *
   * Um teto em `/auth` inteiro pegaria `/auth/refresh`, que o app chama a cada
   * boot e a cada expiração — recusá-lo desloga um usuário legítimo. Em
   * `/api/media` pegaria o GET, e uma biblioteca com 60 fotos estoura na
   * primeira abertura. E o sync fica de fora inteiro: ao voltar de um treino
   * offline o cliente empurra o outbox em lotes seguidos, que é exatamente a
   * sincronização que mais importa não recusar.
   *
   * Ver `routes/auth.ts` e `routes/media.ts` para os tetos que existem.
   */
  app.use('/auth', authRouter)
  app.use('/api/sync', syncRouter)
  app.use('/api/media', mediaRouter)
  app.use('/api/catalog', catalogRouter)
  app.use('/api/push', pushRouter)
  // A tela do WhatsApp faz polling de 2s enquanto espera o QR; o teto precisa
  // caber nisso e ainda assim barrar quem martela connect/disconnect.
  app.use('/api/whatsapp', rateLimit({ windowMs: 60_000, max: 120 }), whatsappRouter)

  app.use(errorHandler)
  return app
}
