import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { getTableName, sql } from 'drizzle-orm'
import { db, pool } from './index.js'
import { SYNC_ENTITIES, SYNC_TABLES } from './sync-tables.js'
import { logger } from '../lib/logger.js'

/**
 * A sequence precisa existir antes das migrations, porque as tabelas
 * sincronizadas usam `nextval('sync_rev_seq')` como default de `rev`.
 */
async function createRevSequence() {
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS sync_rev_seq AS bigint START 1`)
}

/**
 * Sem isto, `rev` só seria atribuído no INSERT e um UPDATE ficaria invisível
 * para o pull incremental — o cliente nunca veria a edição.
 */
async function installRevTriggers() {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION bump_sync_rev() RETURNS trigger AS $fn$
    BEGIN
      NEW.rev := nextval('sync_rev_seq');
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `)

  for (const entity of SYNC_ENTITIES) {
    const table = getTableName(SYNC_TABLES[entity].table)
    const trigger = `${table}_bump_rev`
    await db.execute(
      sql`DROP TRIGGER IF EXISTS ${sql.identifier(trigger)} ON ${sql.identifier(table)}`,
    )
    await db.execute(sql`
      CREATE TRIGGER ${sql.identifier(trigger)}
        BEFORE UPDATE ON ${sql.identifier(table)}
        FOR EACH ROW EXECUTE FUNCTION bump_sync_rev()
    `)
  }
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
