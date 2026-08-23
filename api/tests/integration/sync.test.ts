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
  cursors: Record<string, number>
  hasMore: boolean
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
      cursors: {},
      operations: [{ opId: op(1), entity: 'equipment', entityId: EQUIP, op: 'upsert', base: null, data: criacao }],
    })
    expect(res.results[0]?.status).toBe('created')
    expect(res.cursors.equipment).toBeGreaterThan(0)
  })

  it('reenvio do mesmo opId não duplica', async () => {
    const res = await sync({
      deviceId: DEVICE_A,
      cursors: {},
      operations: [{ opId: op(1), entity: 'equipment', entityId: EQUIP, op: 'upsert', base: null, data: criacao }],
    })
    expect(res.results[0]?.status).toBe('duplicate')
  })

  it('outro dispositivo puxa do zero e recebe rev serializável', async () => {
    const res = await sync({ deviceId: DEVICE_B, cursors: {}, operations: [] })
    const row = res.changes.equipment?.[0]
    expect(row).toMatchObject({ name: 'Leg press horizontal', plateTable: [10, 15, 22] })
    expect(typeof row?.rev).toBe('number')
  })

  it('edições em campos distintos fazem auto-merge sem conflito', async () => {
    const base = { ...criacao }
    await sync({
      deviceId: DEVICE_A,
      cursors: {},
      operations: [{
        opId: op(2), entity: 'equipment', entityId: EQUIP, op: 'upsert', base,
        data: { ...base, name: 'Leg press 45', updatedAt: new Date().toISOString() },
      }],
    })
    const res = await sync({
      deviceId: DEVICE_B,
      cursors: {},
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
      cursors: {},
      operations: [{
        opId: op(4), entity: 'equipment', entityId: EQUIP, op: 'upsert', base,
        data: { ...base, name: 'Leg press linear', updatedAt: new Date().toISOString() },
      }],
    })
    const res = await sync({
      deviceId: DEVICE_B,
      cursors: {},
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

    const after = await sync({ deviceId: DEVICE_B, cursors: {}, operations: [] })
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
      cursors: {},
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
        cursors: {},
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

/**
 * O pull pagina por entidade, e é isso que o cursor precisa respeitar.
 *
 * Com um cursor global — o maior `rev` de todas as entidades — bastava uma
 * delas encher a página para as linhas que sobraram ficarem ABAIXO do cursor
 * que o cliente guardava. Elas não voltam sozinhas: o pull só pede o que está
 * acima. O caso real é o aparelho novo, que começa em zero e tem histórico
 * maior que uma página.
 */
suite('paginação do pull não pula linhas', () => {
  const pool = new pg.Pool({ connectionString: DB })
  const PULL_LIMIT = 500
  const TOTAL = PULL_LIMIT + 100
  let token = ''
  let ownerId = ''

  const sync = async (cursors: Record<string, number>): Promise<SyncResponse> => {
    const res = await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'cccccccc-0000-7000-8000-00000000000c',
        cursors,
        operations: [],
      }),
    })
    expect(res.status, await res.clone().text()).toBe(200)
    return res.json() as Promise<SyncResponse>
  }

  beforeAll(async () => {
    const { rows } = await pool.query(
      `insert into users (google_sub, email, name) values ('vitest-page','page@exemplo.com','Page')
       on conflict (google_sub) do update set email = excluded.email returning id`,
    )
    ownerId = rows[0].id
    token = await new SignJWT({ sub: ownerId })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m')
      .sign(new TextEncoder().encode(SECRET))
    await pool.query('delete from gyms where owner_id=$1', [ownerId])

    // Uma entidade acima do teto de página...
    await pool.query(
      `insert into gyms (id, owner_id, name)
       select gen_random_uuid(), $1, 'academia-' || g from generate_series(1,$2) g`,
      [ownerId, TOTAL],
    )
    // ...e outra com rev MAIOR que todos eles, que é o que empurrava o cursor
    // global por cima da cauda de gyms.
    await pool.query(
      `insert into user_settings (id, owner_id) values (gen_random_uuid(), $1)
       on conflict (owner_id) do update set theme='dark', updated_at=now()`,
      [ownerId],
    )
  })

  afterAll(async () => {
    await pool.query('delete from gyms where owner_id=$1', [ownerId])
    await pool.query("delete from users where google_sub='vitest-page'")
    await pool.end()
  })

  it('um aparelho novo recebe todas as linhas, não só a primeira página', async () => {
    const vistos = new Set<string>()
    let cursors: Record<string, number> = {}
    let rodadas = 0

    // Mesmo laço do cliente: repete enquanto o servidor disser que há mais.
    for (;;) {
      const res = await sync(cursors)
      for (const row of res.changes.gyms ?? []) vistos.add(row.id as string)
      cursors = res.cursors
      rodadas += 1
      if (!res.hasMore || rodadas > 10) break
    }

    expect(rodadas).toBeGreaterThan(1)
    expect(vistos.size).toBe(TOTAL)
  })

  it('o rev de uma entidade alta não empurra o cursor de outra truncada', async () => {
    const primeira = await sync({})

    expect(primeira.changes.gyms).toHaveLength(PULL_LIMIT)
    expect(primeira.hasMore).toBe(true)
    // O cursor de gyms para na última linha entregue por gyms — não no rev de
    // user_settings, que é mais alto e não diz nada sobre o que gyms deve.
    expect(primeira.cursors.gyms).toBeLessThan(primeira.cursors.user_settings!)

    const segunda = await sync(primeira.cursors)
    expect(segunda.changes.gyms).toHaveLength(TOTAL - PULL_LIMIT)
  })
})

/**
 * `/historico/:id` corrige série já registrada. Enquanto `set_logs` era
 * append-only, o servidor respondia `noop` a esses upserts: a UI é local-first
 * e mostrava o valor novo, a fila esvaziava normalmente, e o banco continuava
 * com o valor velho. Nenhum erro em lugar nenhum — só divergência no próximo
 * aparelho.
 */
suite('correção de série já registrada', () => {
  const pool = new pg.Pool({ connectionString: DB })
  const SET = '99999999-9999-7999-8999-999999999999'
  const SESSION = '12121212-1212-7121-8121-121212121212'
  const EXERCISE = '13131313-1313-7131-8131-131313131313'
  let token = ''
  let ownerId = ''

  const sync = async (operations: unknown[]): Promise<SyncResponse> => {
    const res = await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: 'dddddddd-0000-7000-8000-00000000000d',
        cursors: {},
        operations,
      }),
    })
    expect(res.status, await res.clone().text()).toBe(200)
    return res.json() as Promise<SyncResponse>
  }

  const serie = {
    id: SET,
    sessionId: SESSION,
    exerciseId: EXERCISE,
    setIndex: 1,
    isWarmup: false,
    skipped: false,
    side: 'ambos',
    weightKg: 60,
    reps: 10,
    rir: 2,
    updatedAt: new Date().toISOString(),
  }

  beforeAll(async () => {
    const { rows } = await pool.query(
      `insert into users (google_sub, email, name) values ('vitest-edit','edit@exemplo.com','Edit')
       on conflict (google_sub) do update set email = excluded.email returning id`,
    )
    ownerId = rows[0].id
    token = await new SignJWT({ sub: ownerId })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m')
      .sign(new TextEncoder().encode(SECRET))
    await pool.query('delete from set_logs where owner_id=$1', [ownerId])
    await pool.query('delete from sync_operations where owner_id=$1', [ownerId])
  })

  afterAll(async () => {
    await pool.query('delete from set_logs where owner_id=$1', [ownerId])
    await pool.query('delete from sync_operations where owner_id=$1', [ownerId])
    await pool.query("delete from users where google_sub='vitest-edit'")
    await pool.end()
  })

  it('a correção de carga e reps chega ao banco', async () => {
    const criada = await sync([{
      opId: '00000000-0000-7000-8000-0000000000e1',
      entity: 'set_logs', entityId: SET, op: 'upsert', base: null, data: serie,
    }])
    expect(criada.results[0]?.status).toBe('created')

    const editada = await sync([{
      opId: '00000000-0000-7000-8000-0000000000e2',
      entity: 'set_logs', entityId: SET, op: 'upsert', base: serie,
      data: { ...serie, weightKg: 80, reps: 12, updatedAt: new Date().toISOString() },
    }])
    expect(editada.results[0]?.status).toBe('applied')

    const { rows } = await pool.query('select weight_kg, reps from set_logs where id=$1', [SET])
    expect(Number(rows[0].weight_kg)).toBe(80)
    expect(rows[0].reps).toBe(12)
  })

  it('marcar como aquecimento e como pulada também persiste', async () => {
    const base = { ...serie, weightKg: 80, reps: 12 }
    const res = await sync([{
      opId: '00000000-0000-7000-8000-0000000000e3',
      entity: 'set_logs', entityId: SET, op: 'upsert', base,
      data: { ...base, isWarmup: true, skipped: true, updatedAt: new Date().toISOString() },
    }])
    expect(res.results[0]?.status).toBe('applied')

    const { rows } = await pool.query('select is_warmup, skipped from set_logs where id=$1', [SET])
    expect(rows[0]).toMatchObject({ is_warmup: true, skipped: true })
  })

  it('a união entre dispositivos continua correta: séries distintas não colidem', async () => {
    const outra = '14141414-1414-7141-8141-141414141414'
    await sync([{
      opId: '00000000-0000-7000-8000-0000000000e4',
      entity: 'set_logs', entityId: outra, op: 'upsert', base: null,
      data: { ...serie, id: outra, setIndex: 2, weightKg: 65 },
    }])

    const { rows } = await pool.query(
      'select count(*)::int as n from set_logs where owner_id=$1 and deleted_at is null', [ownerId],
    )
    expect(rows[0].n).toBe(2)
  })
})
