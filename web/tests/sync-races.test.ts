import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { localDb, setMeta } from '../src/lib/db.js'
import { mutate } from '../src/lib/outbox.js'
import { runSync } from '../src/lib/sync.js'

const row = { id: '00000000-0000-7000-8000-000000000001', ownerId: 'owner', name: 'A', rev: 1, updatedAt: '2026-09-01T00:00:00Z' }
beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
  await localDb.table_('gyms').put(row)
})
afterEach(() => vi.unstubAllGlobals())

it('preserves an edit made during the request and uses it for the next edit', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    await mutate('gyms', { id: row.id, name: 'B' })
    return new Response(JSON.stringify({ results: [], changes: { gyms: [{ ...row, notes: 'remote note' }] }, cursors: { gyms: 1 }, pendingConflicts: 0, hasMore: false }))
  }))
  await runSync()
  expect((await localDb.table_('gyms').get(row.id))?.name).toBe('B')
  expect((await localDb.table_('gyms').get(row.id))?.notes).toBe('remote note')
  await mutate('gyms', { id: row.id, notes: 'next edit' })
  expect((await localDb.outbox.toArray()).at(-1)?.data.name).toBe('B')
})

it('applies the final server merge after all pending operations are acknowledged', async () => {
  await mutate('gyms', { id: row.id, name: 'B' })
  const [op] = await localDb.outbox.toArray()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    results: [{ opId: op!.opId, status: 'applied' }], changes: { gyms: [{ ...row, name: 'B', notes: 'remote', rev: 2 }] },
    cursors: { gyms: 2 }, pendingConflicts: 0, hasMore: false,
  }))))
  await runSync()
  expect(await localDb.outbox.count()).toBe(0)
  expect(await localDb.table_('gyms').get(row.id)).toMatchObject({ name: 'B', notes: 'remote' })
})

it('retains rejected operations instead of treating them as saved', async () => {
  await mutate('gyms', { id: row.id, name: 'B' })
  const [op] = await localDb.outbox.toArray()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    results: [{ opId: op!.opId, status: 'rejected' }], changes: {}, cursors: {}, pendingConflicts: 0, hasMore: false,
  }))))
  await expect(runSync()).rejects.toThrow('sync_rejected')
  expect(await localDb.outbox.count()).toBe(1)
})

it('keeps a pending edit visible when another device deletes its row', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    await mutate('gyms', { id: row.id, name: 'B' })
    return new Response(JSON.stringify({ results: [], changes: { gyms: [{ ...row, deletedAt: '2026-09-27T00:00:00Z' }] }, cursors: { gyms: 2 }, pendingConflicts: 0, hasMore: false }))
  }))
  await runSync()
  expect(await localDb.table_('gyms').get(row.id)).toMatchObject({ name: 'B', deletedAt: null })
})

it('replays old cursors once to recover rows skipped by pre-fix revisions', async () => {
  await setMeta('cursors', { gyms: 99 })
  const requests: Array<{ cursors: object }> = []
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    requests.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ results: [], changes: {}, cursors: { gyms: 100 }, pendingConflicts: 0, hasMore: false }))
  }))
  await runSync()
  await runSync()
  expect(requests.map((request) => request.cursors)).toEqual([{}, { gyms: 100 }])
})
