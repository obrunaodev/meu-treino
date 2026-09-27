import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const available = await pool.query('select 1').then(() => true).catch(() => false)
const owner = randomUUID()
const otherOwner = randomUUID()
const device = randomUUID()
let token = ''
const API = process.env.API_URL ?? 'http://localhost:3000'

async function push(entity: string, id: string, data: object, opId = randomUUID()) {
  const response = await fetch(`${API}/api/sync`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ deviceId: device, cursors: {}, operations: [{ opId, entity, entityId: id, op: 'upsert', base: null, data }] }),
  })
  expect(response.status).toBe(200)
  return response.json() as Promise<{
    results: Array<{ status: string }>
    changes: Record<string, Array<{ id: string; deletedAt: string | null }>>
  }>
}

describe.skipIf(!available)('sync recovery and commit ordering', () => {
  beforeAll(async () => {
    for (const id of [owner, otherOwner]) {
      await pool.query("insert into users (id,google_sub,email,name) values ($1,$2,$3,'Audit test')", [id, `audit-${id}`, `${id}@example.com`])
    }
    token = await new SignJWT({ sub: owner }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
      .setExpirationTime('10m').sign(new TextEncoder().encode(process.env.SESSION_SECRET))
  })

  it('does not acknowledge global ID collisions, including retries', async () => {
    const id = randomUUID()
    const opId = randomUUID()
    await pool.query('insert into gyms (id,owner_id,name) values ($1,$2,$3)', [id, otherOwner, 'Original'])
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await push('gyms', id, { name: 'Imported' }, opId)
      expect(response.results[0]?.status).toBe('rejected')
    }
    expect((await pool.query('select owner_id,name from gyms where id=$1', [id])).rows[0])
      .toEqual({ owner_id: otherOwner, name: 'Original' })
    expect((await pool.query('select id from sync_operations where id=$1', [opId])).rowCount).toBe(0)
  })

  it('restores tombstoned observations without changing their immutable content', async () => {
    const pain = randomUUID()
    const result = randomUUID()
    await pool.query("insert into pain_events (id,owner_id,region_slug,level,occurred_at,deleted_at) values ($1,$2,'knee',3,now(),now())", [pain, owner])
    await pool.query('insert into test_results (id,owner_id,test_id,value,measured_at,deleted_at) values ($1,$2,$3,42,now(),now())', [result, owner, randomUUID()])
    for (const [entity, id] of [['pain_events', pain], ['test_results', result]]) {
      const response = await push(entity!, id!, { deletedAt: null, value: 999, level: 9 })
      expect(response.results[0]?.status).toBe('resurrected')
      expect(response.changes[entity!]?.find((row) => row.id === id)?.deletedAt).toBeNull()
    }
    expect((await pool.query('select level from pain_events where id=$1', [pain])).rows[0].level).toBe(3)
    expect(Number((await pool.query('select value from test_results where id=$1', [result])).rows[0].value)).toBe(42)
  })

  it.each(['insert', 'update'])('publishes %s revisions in transaction commit order', async (operation) => {
    const first = await pool.connect()
    const second = await pool.connect()
    const a = randomUUID()
    const b = randomUUID()
    if (operation === 'update') {
      for (const id of [a, b]) await pool.query("insert into gyms (id,owner_id,name) values ($1,$2,'before')", [id, owner])
    }
    const query = operation === 'insert'
      ? "insert into gyms (id,owner_id,name) values ($1,$2,'after') returning rev"
      : "update gyms set name='after' where id=$1 and owner_id=$2 returning rev"
    try {
      await first.query('begin')
      await second.query('begin')
      const pid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid
      const earlier = (await first.query(query, [a, owner])).rows[0].rev
      const waiting = second.query(query, [b, owner])
      const deadline = Date.now() + 3000
      let blocked = false
      while (Date.now() < deadline) {
        const state = (await pool.query('select wait_event from pg_stat_activity where pid=$1', [pid])).rows[0]
        if (state.wait_event === 'advisory') { blocked = true; break }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(blocked).toBe(true)
      await first.query('commit')
      const later = (await waiting).rows[0].rev
      expect(Number(later)).toBeGreaterThan(Number(earlier))
      await second.query('commit')
      const pulled = await pool.query('select id from gyms where owner_id=$1 and rev>$2', [owner, earlier])
      expect(pulled.rows.map((row) => row.id)).toContain(b)
    } finally {
      await first.query('rollback')
      await second.query('rollback')
      first.release()
      second.release()
    }
  })
})

afterAll(async () => {
  if (available) {
    for (const table of ['gyms', 'pain_events', 'test_results']) {
      await pool.query(`delete from ${table} where owner_id = any($1::uuid[])`, [[owner, otherOwner]])
    }
    await pool.query('delete from users where id = any($1::uuid[])', [[owner, otherOwner]])
  }
  await pool.end()
})
