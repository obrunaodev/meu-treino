import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import pg from 'pg'

/**
 * Integração de verdade: API no ar, Postgres real, sem mock nenhum.
 *
 * O merge unitário em tests/merge.test.ts prova a lógica; aqui provamos o
 * caminho completo — coerção de tipos no boundary, trigger de rev,
 * idempotência por opId e o ciclo de conflito. Os três bugs que só apareceram
 * neste nível (timestamp como string ISO, BigInt não serializável e updatedAt
 * envenenando o diff) são a razão deste arquivo existir.
 */

const API = process.env.API_URL ?? 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? 'postgres://treino:change-me@localhost:5432/treino'
const SECRET = process.env.SESSION_SECRET ?? 'dev-only-insecure-secret-change-in-prod'

const EQUIP = '22222222-2222-7222-8222-222222222222'
const DEVICE_A = 'aaaaaaaa-0000-7000-8000-00000000000a'
const DEVICE_B = 'bbbbbbbb-0000-7000-8000-00000000000b'
const op = (n: number) => `00000000-0000-7000-8000-00000000000${n.toString(16)}`

const up = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false)
const suite = up ? describe : describe.skip

interface SyncResponse {
  results: Array<{ opId: string; status: string; conflictingFields?: string[] }>
  changes: Record<string, Array<Record<string, unknown>>>
  cursor: number
  pendingConflicts: number
}

suite('sync ponta a ponta', () => {
  const pool = new pg.Pool({ connectionString: DB })
  let token = ''
  let ownerId = ''

  const sync = async (body: unknown): Promise<SyncResponse> => {
    const res = await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    expect(res.status, await res.clone().text()).toBe(200)
    return res.json() as Promise<SyncResponse>
  }

  beforeAll(async () => {
    const { rows } = await pool.query(
      `insert into users (google_sub, email, name) values ('vitest-e2e','vitest@exemplo.com','Vitest')
       on conflict (google_sub) do update set email = excluded.email returning id`,
    )
    ownerId = rows[0].id
    token = await new SignJWT({ sub: ownerId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(SECRET))

    await pool.query('delete from sync_conflicts where owner_id=$1', [ownerId])
    await pool.query('delete from sync_operations where owner_id=$1', [ownerId])
    await pool.query('delete from equipment where owner_id=$1', [ownerId])
  })

  afterAll(async () => {
    await pool.query('delete from equipment where owner_id=$1', [ownerId])
    await pool.query("delete from users where google_sub='vitest-e2e'")
    await pool.end()
  })

  const criacao = {
    id: EQUIP,
    name: 'Leg press horizontal',
    plateTable: [10, 15, 22],
    updatedAt: new Date().toISOString(),
  }

  it('aceita criação offline com timestamp em ISO e id gerado no cliente', async () => {
    const res = await sync({
      deviceId: DEVICE_A,
      cursor: 0,
      operations: [{ opId: op(1), entity: 'equipment', entityId: EQUIP, op: 'upsert', base: null, data: criacao }],
    })
    expect(res.results[0]?.status).toBe('created')
    expect(res.cursor).toBeGreaterThan(0)
  })

  it('reenvio do mesmo opId não duplica', async () => {
    const res = await sync({
      deviceId: DEVICE_A,
      cursor: 0,
      operations: [{ opId: op(1), entity: 'equipment', entityId: EQUIP, op: 'upsert', base: null, data: criacao }],
    })
    expect(res.results[0]?.status).toBe('duplicate')
  })

  it('outro dispositivo puxa do zero e recebe rev serializável', async () => {
    const res = await sync({ deviceId: DEVICE_B, cursor: 0, operations: [] })
    const row = res.changes.equipment?.[0]
    expect(row).toMatchObject({ name: 'Leg press horizontal', plateTable: [10, 15, 22] })
    expect(typeof row?.rev).toBe('number')
  })

  it('edições em campos distintos fazem auto-merge sem conflito', async () => {
    const base = { ...criacao }
    await sync({
      deviceId: DEVICE_A,
      cursor: 0,
      operations: [{
        opId: op(2), entity: 'equipment', entityId: EQUIP, op: 'upsert', base,
        data: { ...base, name: 'Leg press 45', updatedAt: new Date().toISOString() },
      }],
    })
    const res = await sync({
      deviceId: DEVICE_B,
      cursor: 0,
      operations: [{
        opId: op(3), entity: 'equipment', entityId: EQUIP, op: 'upsert', base,
        data: { ...base, plateTable: [10, 15, 22, 30], updatedAt: new Date().toISOString() },
      }],
    })

    expect(res.results[0]?.status).toBe('applied')
    expect(res.pendingConflicts).toBe(0)

    const { rows } = await pool.query('select name, plate_table from equipment where id=$1', [EQUIP])
    expect(rows[0]).toMatchObject({ name: 'Leg press 45', plate_table: [10, 15, 22, 30] })
  })

  it('mesmo campo dos dois lados vira conflito manual, e só ele', async () => {
    const base = { ...criacao, name: 'Leg press 45', plateTable: [10, 15, 22, 30] }
    await sync({
      deviceId: DEVICE_A,
      cursor: 0,
      operations: [{
        opId: op(4), entity: 'equipment', entityId: EQUIP, op: 'upsert', base,
        data: { ...base, name: 'Leg press linear', updatedAt: new Date().toISOString() },
      }],
    })
    const res = await sync({
      deviceId: DEVICE_B,
      cursor: 0,
      operations: [{
        opId: op(5), entity: 'equipment', entityId: EQUIP, op: 'upsert', base,
        data: { ...base, name: 'Leg press 90', updatedAt: new Date().toISOString() },
      }],
    })

    expect(res.results[0]?.status).toBe('conflict')
    // updatedAt difere sempre; se vazasse para o diff, todo merge conflitaria.
    expect(res.results[0]?.conflictingFields).toEqual(['name'])
    expect(res.pendingConflicts).toBe(1)
  })

  it('resolver o conflito aplica o lado escolhido e zera a pendência', async () => {
    const listed = await fetch(`${API}/api/sync/conflicts`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const { conflicts } = (await listed.json()) as { conflicts: Array<{ id: string }> }
    expect(conflicts).toHaveLength(1)

    const res = await fetch(`${API}/api/sync/conflicts/${conflicts[0]!.id}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ resolution: 'local' }),
    })
    expect(res.status).toBe(200)

    const { rows } = await pool.query('select name from equipment where id=$1', [EQUIP])
    expect(rows[0].name).toBe('Leg press 90')

    const after = await sync({ deviceId: DEVICE_B, cursor: 0, operations: [] })
    expect(after.pendingConflicts).toBe(0)
  })
})

/**
 * A idempotência precisa aguentar concorrência, não só reenvio sequencial: o
 * tick do loop e o evento `online` disparam juntos com o mesmo outbox.
 */
suite('idempotência sob concorrência', () => {
  const pool = new pg.Pool({ connectionString: DB })
  const ENTITY = '33333333-3333-7333-8333-333333333333'
  const OP = '00000000-0000-7000-8000-0000000000ff'
  let token = ''
  let ownerId = ''

  beforeAll(async () => {
    const { rows } = await pool.query(
      `insert into users (google_sub, email, name) values ('vitest-race','race@exemplo.com','Race')
       on conflict (google_sub) do update set email = excluded.email returning id`,
    )
    ownerId = rows[0].id
    token = await new SignJWT({ sub: ownerId })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m')
      .sign(new TextEncoder().encode(SECRET))
    await pool.query('delete from sync_operations where owner_id=$1', [ownerId])
    await pool.query('delete from equipment where owner_id=$1', [ownerId])
  })

  afterAll(async () => {
    await pool.query('delete from sync_operations where owner_id=$1', [ownerId])
    await pool.query('delete from equipment where owner_id=$1', [ownerId])
    await pool.query("delete from users where google_sub='vitest-race'")
    await pool.end()
  })

  it('a mesma operação enviada em paralelo é aplicada uma vez só, sem 500', async () => {
    const body = {
      deviceId: '99999999-0000-7000-8000-000000000099',
      cursor: 0,
      operations: [{
        opId: OP,
        entity: 'equipment',
        entityId: ENTITY,
        op: 'upsert',
        base: null,
        data: { id: ENTITY, name: 'Corrida', plateTable: [5], updatedAt: new Date().toISOString() },
      }],
    }

    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(`${API}/api/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }),
      ),
    )

    // Nenhuma pode falhar: a corrida antes estourava a chave primária.
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200])

    const bodies = (await Promise.all(responses.map((r) => r.json()))) as SyncResponse[]
    const statuses = bodies.map((b) => b.results[0]?.status)
    expect(statuses.filter((s) => s === 'created')).toHaveLength(1)
    expect(statuses.filter((s) => s === 'duplicate')).toHaveLength(5)

    const { rows } = await pool.query('select count(*)::int as n from sync_operations where id=$1', [OP])
    expect(rows[0].n).toBe(1)
  })
})

/**
 * `numeric` sai do driver do Postgres como string. O cliente grava esses campos
 * como número e faz conta com eles direto — se voltarem string, a primeira
 * formatação de carga derruba a tela.
 */
suite('tipos numéricos na volta do sync', () => {
  const pool = new pg.Pool({ connectionString: DB })
  const ENTITY = '44444444-4444-7444-8444-444444444444'
  let token = ''
  let ownerId = ''

  beforeAll(async () => {
    const { rows } = await pool.query(
      `insert into users (google_sub, email, name) values ('vitest-num','num@exemplo.com','Num')
       on conflict (google_sub) do update set email = excluded.email returning id`,
    )
    ownerId = rows[0].id
    token = await new SignJWT({ sub: ownerId })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m')
      .sign(new TextEncoder().encode(SECRET))
    await pool.query('delete from set_logs where owner_id=$1', [ownerId])
    await pool.query('delete from equipment where owner_id=$1', [ownerId])
  })

  afterAll(async () => {
    await pool.query('delete from set_logs where owner_id=$1', [ownerId])
    await pool.query('delete from equipment where owner_id=$1', [ownerId])
    await pool.query("delete from users where google_sub='vitest-num'")
    await pool.end()
  })

  it('carga e incremento voltam como número, não string', async () => {
    await pool.query(
      `insert into set_logs (id, owner_id, session_id, exercise_id, set_index, weight_kg, reps)
       values ($1,$2,$3,$4,0,60,10)`,
      [ENTITY, ownerId, '55555555-5555-7555-8555-555555555555', '66666666-6666-7666-8666-666666666666'],
    )
    await pool.query(
      `insert into equipment (id, owner_id, name, increment_kg)
       values ($1,$2,'Anilha',2.5)`,
      ['77777777-7777-7777-8777-777777777777', ownerId],
    )

    const res = await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: '88888888-0000-7000-8000-000000000088',
        cursor: 0,
        operations: [],
      }),
    })
    const body = (await res.json()) as SyncResponse

    const set = body.changes.set_logs?.find((r) => r.id === ENTITY)
    expect(typeof set?.weightKg).toBe('number')
    expect(set?.weightKg).toBe(60)

    const gear = body.changes.equipment?.[0]
    expect(typeof gear?.incrementKg).toBe('number')
    expect(gear?.incrementKg).toBe(2.5)
  })
})
