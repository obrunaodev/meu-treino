import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { db, pool } from './index.js'
import { SYNC_ENTITIES } from './sync-tables.js'
import { installRevTriggers } from './revisions.js'
import { logger } from '../lib/logger.js'

/**
 * A sequence precisa existir antes das migrations, porque as tabelas
 * sincronizadas usam `nextval('sync_rev_seq')` como default de `rev`.
 */
async function createRevSequence() {
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS sync_rev_seq AS bigint START 1`)
}

async function main() {
  await createRevSequence()
  await migrate(db, { migrationsFolder: './drizzle' })
  await installRevTriggers()
  logger.info({ tabelas: SYNC_ENTITIES.length }, 'migrations aplicadas, triggers de rev instalados')
  await pool.end()
}

main().catch((err) => {
  logger.error(err, 'falha na migration')
  process.exit(1)
})
