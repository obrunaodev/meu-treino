import { createApp } from './app.js'
import { env, hasGoogleOAuth, isProd } from './lib/env.js'
import { logger } from './lib/logger.js'
import { pool } from './db/index.js'
import { startJobs } from './jobs/index.js'

// Ligado em produção, isto é uma porta aberta esperando ser esquecida.
// O aviso sai a cada boot justamente para não virar paisagem.
if (env.DEV_LOGIN_ENABLED) {
  logger.warn(
    { google: hasGoogleOAuth, producao: isProd, consentido: env.DEV_LOGIN_ALLOW_IN_PRODUCTION },
    'LOGIN PROVISÓRIO ATIVO — qualquer um com DEV_LOGIN_TOKEN entra como qualquer usuário. ' +
      'Desligue com DEV_LOGIN_ENABLED=false assim que o OAuth do Google estiver configurado.',
  )
}

const server = createApp().listen(env.PORT, () => {
  logger.info({ porta: env.PORT, ambiente: env.NODE_ENV }, 'api no ar')
})

const stopJobs = startJobs()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'encerrando')
    stopJobs()
    server.close(() => pool.end().then(() => process.exit(0)))
  })
}
