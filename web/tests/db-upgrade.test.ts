import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

/**
 * O IndexedDB é a fonte de verdade da UI, então uma versão nova do schema que
 * apagasse o banco levaria junto tudo o que ainda não subiu. Este teste abre um
 * banco na versão anterior, com dados, e confere que a versão atual só
 * acrescenta.
 */

/** O schema como estava antes do store das medidas corporais. */
const V5_SYNC_STORES = [
  'gyms', 'equipment', 'cardio_options', 'exercises', 'exercise_media', 'exercise_substitutions',
  'programs', 'templates', 'template_items', 'workout_sessions', 'set_logs',
  'cardio_logs', 'pain_events', 'functional_tests', 'test_results', 'user_settings',
]

async function seedVersion5() {
  const stores: Record<string, string> = {
    outbox: 'opId, entity, entityId, queuedAt',
    uploads: 'id, exerciseId, queuedAt',
    meta: 'key',
  }
  for (const store of V5_SYNC_STORES) stores[store] = 'id, updatedAt, deletedAt'

  const old = new Dexie('meu-treino')
  for (const version of [1, 2, 3, 4, 5]) old.version(version).stores(stores)
  await old.open()
  await old.table('set_logs').put({
    id: '00000000-0000-7000-8000-0000000000a1', ownerId: 'dono', sessionId: 's', exerciseId: 'e',
    setIndex: 0, weightKg: 60, reps: 10, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null,
  })
  await old.table('outbox').put({
    opId: 'op-1', entity: 'set_logs', entityId: '00000000-0000-7000-8000-0000000000a1',
    op: 'upsert', base: null, data: {}, queuedAt: '2026-09-01T00:00:00.000Z', attempts: 0,
  })
  await old.table('meta').put({ key: 'cursors', value: { set_logs: 42 } })
  old.close()
}

describe('subir da v5 para a v6', () => {
  // Uma asserção só, num teste só: `localDb` é singleton e abre uma vez, então
  // um segundo `open()` não repetiria a migração e o teste mentiria.
  it('mantém dados, fila e cursor, e abre o store novo vazio', async () => {
    await seedVersion5()

    const { localDb } = await import('../src/lib/db.js')
    await localDb.open()

    expect(await localDb.table_('set_logs').get('00000000-0000-7000-8000-0000000000a1'))
      .toMatchObject({ weightKg: 60, reps: 10 })
    // A fila do outbox é o que ainda não subiu: perdê-la perde o treino.
    expect(await localDb.outbox.count()).toBe(1)
    // O cursor fica: a entidade nova puxa do zero por não ter cursor próprio.
    expect(await localDb.meta.get('cursors')).toMatchObject({ value: { set_logs: 42 } })
    expect(await localDb.table_('body_measurements').count()).toBe(0)
  })
})
