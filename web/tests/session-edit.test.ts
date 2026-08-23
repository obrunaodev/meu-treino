import { beforeEach, describe, expect, it } from 'vitest'
import { localDb } from '../src/lib/db'
import { mutate } from '../src/lib/outbox'
import { makeActions } from '../src/lib/actions'
import type { SetLog, WorkoutSession } from '../src/lib/types'

/**
 * Apagar uma sessão sem levar junto o que pendura nela deixaria séries órfãs:
 * elas continuariam no export CSV e no volume por ciclo, presas a uma sessão
 * que não existe mais.
 */

const OWNER = '00000000-0000-7000-8000-000000000002'
const actions = makeActions(OWNER)

async function seedSession() {
  const session = await mutate('workout_sessions', {
    ownerId: OWNER,
    programId: 'p1',
    templateId: 't1',
    status: 'concluida',
    startedAt: new Date('2026-08-20T10:00:00Z').toISOString(),
  }) as unknown as WorkoutSession

  for (let index = 0; index < 3; index++) {
    await actions.logSet({ sessionId: session.id, exerciseId: 'e1', setIndex: index, reps: 10, weightKg: 60 })
  }
  await actions.logCardio({ sessionId: session.id, durationSeconds: 1200 })
  await actions.logPain({ regionSlug: 'joelho_d', level: 3, sessionId: session.id })

  return session
}

const alive = async (entity: Parameters<typeof localDb.table_>[0]) =>
  (await localDb.table_(entity).toArray()).filter((row) => !row.deletedAt)

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('deleteSession', () => {
  it('leva junto séries, cardio e dor da sessão', async () => {
    const session = await seedSession()
    await actions.deleteSession(session.id)

    expect(await alive('workout_sessions')).toHaveLength(0)
    expect(await alive('set_logs')).toHaveLength(0)
    expect(await alive('cardio_logs')).toHaveLength(0)
    expect(await alive('pain_events')).toHaveLength(0)
  })

  it('não toca no que pertence a outra sessão', async () => {
    const first = await seedSession()
    const second = await seedSession()

    await actions.deleteSession(first.id)

    const sets = (await alive('set_logs')) as unknown as SetLog[]
    expect(sets).toHaveLength(3)
    expect(sets.every((s) => s.sessionId === second.id)).toBe(true)
  })

  it('enfileira cada remoção, para o servidor receber a cascata', async () => {
    const session = await seedSession()
    await actions.deleteSession(session.id)

    const deletes = (await localDb.outbox.toArray()).filter((o) => o.op === 'delete')
    const entities = new Set(deletes.map((o) => o.entity))
    expect(entities).toEqual(new Set(['set_logs', 'cardio_logs', 'pain_events', 'workout_sessions']))
    // 3 séries + 1 cardio + 1 dor + a própria sessão.
    expect(deletes).toHaveLength(6)
  })
})

describe('edição de série', () => {
  it('corrige carga e reps sem criar registro novo', async () => {
    await seedSession()
    const [first] = (await alive('set_logs')) as unknown as SetLog[]

    await actions.updateSet(first!.id, { weightKg: 65, reps: 8 })

    const sets = (await alive('set_logs')) as unknown as SetLog[]
    expect(sets).toHaveLength(3)
    expect(sets.find((s) => s.id === first!.id)).toMatchObject({ weightKg: 65, reps: 8 })
  })

  it('marcar como aquecimento tira a série do volume de trabalho', async () => {
    await seedSession()
    const [first] = (await alive('set_logs')) as unknown as SetLog[]

    await actions.updateSet(first!.id, { isWarmup: true })

    const working = ((await alive('set_logs')) as unknown as SetLog[])
      .filter((s) => !s.isWarmup && !s.skipped)
    expect(working).toHaveLength(2)
  })

  it('apagar uma série não afeta as outras', async () => {
    await seedSession()
    const sets = (await alive('set_logs')) as unknown as SetLog[]

    await actions.removeSet(sets[1]!.id)

    expect(await alive('set_logs')).toHaveLength(2)
  })
})
