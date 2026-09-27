import { getTableName, sql } from 'drizzle-orm'
import { db } from './index.js'
import { SYNC_ENTITIES, SYNC_TABLES } from './sync-tables.js'

/** Installs commit-ordered revision allocation for every synchronized writer. */
export async function installRevTriggers() {
  await db.transaction(async (tx) => {
    // Statement triggers take the transaction lock before row locks/defaults.
    // Holding it until commit prevents a later revision being published first.
    // A durable change-log/CDC stream would avoid serialization but adds a
    // second replication system for this small, single-VPS workload.
    await tx.execute(sql`
      CREATE OR REPLACE FUNCTION lock_sync_revision() RETURNS trigger AS $fn$
      BEGIN
        PERFORM pg_advisory_xact_lock(1937337955, 1);
        RETURN NULL;
      END;
      $fn$ LANGUAGE plpgsql;
    `)
    await tx.execute(sql`
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
      const lock = sql.identifier(`${table}_lock_rev`)
      const bump = sql.identifier(`${table}_bump_rev`)
      const name = sql.identifier(table)
      await tx.execute(sql`DROP TRIGGER IF EXISTS ${lock} ON ${name}`)
      await tx.execute(sql`DROP TRIGGER IF EXISTS ${bump} ON ${name}`)
      await tx.execute(sql`CREATE TRIGGER ${lock} BEFORE INSERT OR UPDATE OR DELETE ON ${name}
        FOR EACH STATEMENT EXECUTE FUNCTION lock_sync_revision()`)
      await tx.execute(sql`CREATE TRIGGER ${bump} BEFORE INSERT OR UPDATE ON ${name}
        FOR EACH ROW EXECUTE FUNCTION bump_sync_rev()`)
    }
  })
}
