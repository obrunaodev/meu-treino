import { pool } from './db.js'
import { env } from './env.js'
import { createInternalServer } from './http.js'
import { restoreConnections } from './manager.js'

const server = createInternalServer().listen(env.port, () => {
  console.info(`bot WhatsApp interno na porta ${env.port}`)
  void restoreConnections().catch(console.error)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)))
  })
}
