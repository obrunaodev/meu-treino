import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../lib/env.js'
import * as schema from './schema.js'

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  // A VPS alvo tem 1 GB; Postgres roda com max_connections=40. Um pool
  // pequeno evita que a API sozinha esgote o servidor.
  max: 8,
  idleTimeoutMillis: 30_000,
})

export const db = drizzle(pool, { schema })
export { schema }
