import { v7 as uuidv7 } from 'uuid'
import { localDb, type SyncEntity, type SyncRow } from './db.js'

/**
 * Toda mutação passa por aqui: grava no store local e enfileira a operação.
 * O id é gerado no cliente (UUIDv7, ordenável por tempo) para que um registro
 * criado offline não mude de identidade ao subir — sem isso, nenhuma
 * referência feita offline sobreviveria ao sync.
 */
export async function mutate(entity: SyncEntity, patch: Partial<SyncRow> & { id?: string }) {
  const id = patch.id ?? uuidv7()
  const table = localDb.table_(entity)
  const existing = await table.get(id)

  const row: SyncRow = {
    ...(existing ?? {}),
    ...patch,
    id,
    ownerId: (patch.ownerId ?? existing?.ownerId ?? '') as string,
    updatedAt: new Date().toISOString(),
  } as SyncRow

  await localDb.transaction('rw', table, localDb.outbox, async () => {
    await table.put(row)
    await localDb.outbox.put({
      opId: uuidv7(),
      entity,
      entityId: id,
      op: 'upsert',
      /**
       * A base é a linha local como está AGORA — que numa segunda edição
       * offline já inclui a primeira, não o que veio do último pull.
       *
       * Serve mesmo assim porque as operações sobem em ordem: quando a segunda
       * chega, a primeira já moveu o servidor para o mesmo valor, e o campo sai
       * do diff por estar igual dos dois lados. `rev` ausente significa que o
       * servidor nunca viu esta linha — aí não há base, e é criação.
       */
      base: existing?.rev ? (existing as SyncRow) : null,
      data: row,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    })
  })

  return row
}

export async function remove(entity: SyncEntity, id: string) {
  const table = localDb.table_(entity)
  const existing = await table.get(id)
  if (!existing) return

  const row = { ...existing, deletedAt: new Date().toISOString() }

  await localDb.transaction('rw', table, localDb.outbox, async () => {
    await table.put(row)
    await localDb.outbox.put({
      opId: uuidv7(),
      entity,
      entityId: id,
      op: 'delete',
      base: existing,
      data: row,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    })
  })
}

export function pendingCount() {
  return localDb.outbox.count()
}
