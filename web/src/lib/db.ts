import Dexie, { type EntityTable } from 'dexie'

/**
 * O IndexedDB é a fonte de verdade da UI. Nada na tela lê da rede direto —
 * é isso que faz a academia sem sinal se comportar igual ao desktop.
 */

export type SyncEntity =
  | 'gyms' | 'equipment' | 'cardio_options' | 'exercises' | 'exercise_media' | 'exercise_substitutions'
  | 'programs' | 'templates' | 'template_items' | 'workout_sessions' | 'set_logs'
  | 'cardio_logs' | 'pain_events' | 'functional_tests' | 'test_results' | 'user_settings'

export interface SyncRow {
  id: string
  ownerId: string
  rev?: number
  updatedAt: string
  createdAt?: string
  deletedAt?: string | null
  [key: string]: unknown
}

export interface OutboxEntry {
  opId: string
  entity: SyncEntity
  entityId: string
  op: 'upsert' | 'delete'
  /** Snapshot de como o registro estava no último pull — a base do merge. */
  base: SyncRow | null
  data: SyncRow
  queuedAt: string
  attempts: number
}

export interface PendingUpload {
  id: string
  exerciseId: string
  blob: Blob
  filename: string
  queuedAt: string
}

export interface MetaEntry {
  key: string
  value: unknown
}

const SYNC_STORES: SyncEntity[] = [
  'gyms', 'equipment', 'cardio_options', 'exercises', 'exercise_media', 'exercise_substitutions',
  'programs', 'templates', 'template_items', 'workout_sessions', 'set_logs',
  'cardio_logs', 'pain_events', 'functional_tests', 'test_results', 'user_settings',
]

class TreinoDB extends Dexie {
  outbox!: EntityTable<OutboxEntry, 'opId'>
  uploads!: EntityTable<PendingUpload, 'id'>
  meta!: EntityTable<MetaEntry, 'key'>

  constructor() {
    super('meu-treino')

    const stores: Record<string, string> = {
      outbox: 'opId, entity, entityId, queuedAt',
      uploads: 'id, exerciseId, queuedAt',
      meta: 'key',
    }
    for (const store of SYNC_STORES) stores[store] = 'id, updatedAt, deletedAt'

    this.version(1).stores(stores)

    /**
     * v2 não muda índice nenhum: existe só para zerar o cursor.
     *
     * Até aqui o servidor devolvia os campos `numeric` como string ("60.00"),
     * então há registros no dispositivo com o tipo errado — e eles não voltam
     * sozinhos, porque o pull incremental só traz linha com rev acima do
     * cursor. Zerar força um pull completo, que reescreve tudo já convertido.
     */
    this.version(2).stores(stores).upgrade(async (tx) => {
      await tx.table('meta').delete('cursor')
    })

    // Novo store offline para o catálogo de aparelhos de cardio da academia.
    this.version(3).stores(stores)
  }

  table_(entity: SyncEntity) {
    return this.table<SyncRow, string>(entity)
  }
}

export const localDb = new TreinoDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await localDb.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown) {
  await localDb.meta.put({ key, value })
}
