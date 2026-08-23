import { beforeEach, describe, expect, it } from 'vitest'
import { localDb } from '../src/lib/db'
import { mutate, pendingCount, remove } from '../src/lib/outbox'

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('outbox', () => {
  it('grava no store local e enfileira a operação numa transação só', async () => {
    const row = await mutate('equipment', { ownerId: 'u1', name: 'Leg press', plateTable: [10, 15] })

    expect(await localDb.table_('equipment').get(row.id)).toMatchObject({ name: 'Leg press' })
    expect(await pendingCount()).toBe(1)
  })

  it('gera id no cliente, para a referência sobreviver ao sync', async () => {
    const row = await mutate('equipment', { ownerId: 'u1', name: 'Extensora' })
    const child = await mutate('exercises', { ownerId: 'u1', equipmentId: row.id, name: 'Extensora uni' })

    expect(child.equipmentId).toBe(row.id)
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/)
  })

  it('primeira criação vai sem base — o servidor trata como escrita inicial', async () => {
    await mutate('equipment', { ownerId: 'u1', name: 'Leg press' })
    const [entry] = await localDb.outbox.toArray()

    expect(entry?.base).toBeNull()
  })

  it('edição de linha já sincronizada carrega a base do último pull', async () => {
    const synced = {
      id: 'aaaaaaaa-0000-7000-8000-000000000000',
      ownerId: 'u1',
      name: 'Leg press',
      rev: 42,
      updatedAt: new Date().toISOString(),
    }
    await localDb.table_('equipment').put(synced)

    await mutate('equipment', { id: synced.id, ownerId: 'u1', name: 'Leg press 45' })
    const [entry] = await localDb.outbox.toArray()

    expect(entry?.base).toMatchObject({ name: 'Leg press', rev: 42 })
    expect(entry?.data).toMatchObject({ name: 'Leg press 45' })
  })

  it('delete é soft e mantém a linha legível offline', async () => {
    const row = await mutate('equipment', { ownerId: 'u1', name: 'Leg press' })
    await remove('equipment', row.id)

    const stored = await localDb.table_('equipment').get(row.id)
    expect(stored?.deletedAt).toBeTruthy()

    const ops = await localDb.outbox.toArray()
    expect(ops.at(-1)?.op).toBe('delete')
  })

  it('duas edições seguidas geram duas operações distintas', async () => {
    const row = await mutate('equipment', { ownerId: 'u1', name: 'A' })
    await mutate('equipment', { id: row.id, ownerId: 'u1', name: 'B' })

    const ops = await localDb.outbox.toArray()
    expect(ops).toHaveLength(2)
    expect(new Set(ops.map((o) => o.opId)).size).toBe(2)
  })
})
