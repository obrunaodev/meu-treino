import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackup, parseBackup, restoreBackup } from '../src/lib/backup.js'
import { localDb } from '../src/lib/db.js'
import { mutate } from '../src/lib/outbox.js'

const SOURCE = '00000000-0000-7000-8000-000000000001'
const TARGET = '00000000-0000-7000-8000-000000000002'

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('personal backup', () => {
  it('round-trips active records and assigns them to the importing account', async () => {
    const equipment = await mutate('equipment', {
      ownerId: SOURCE,
      name: 'Leg press',
      gymId: null,
      catalogStationCode: null,
      loadType: 'pino',
      incrementKg: null,
      plateTable: [10, 20],
      notes: null,
    })
    await localDb.outbox.clear()

    const exported = await buildBackup()
    const backup = parseBackup(await readBlob(exported.blob))
    await localDb.delete()
    await localDb.open()
    const summary = await restoreBackup(backup, TARGET, 'merge')

    expect(summary).toMatchObject({ rows: 1, images: 0 })
    expect(await localDb.table_('equipment').get(equipment.id)).toMatchObject({
      ownerId: TARGET,
      name: 'Leg press',
      plateTable: [10, 20],
      deletedAt: null,
    })
    expect(await localDb.outbox.count()).toBe(1)
  })

  it('replace soft-deletes active records absent from the backup', async () => {
    const exported = await buildBackup()
    const backup = parseBackup(await readBlob(exported.blob))
    const existing = await mutate('gyms', { ownerId: TARGET, name: 'Old gym', isActive: true })

    await restoreBackup(backup, TARGET, 'replace')

    expect((await localDb.table_('gyms').get(existing.id))?.deletedAt).toBeTruthy()
  })

  it('validates and queues an embedded exercise image on restore', async () => {
    const exerciseId = '00000000-0000-7000-8000-000000000003'
    const exported = await buildBackup()
    const base = JSON.parse(await readBlob(exported.blob)) as Record<string, unknown>
    base.media = [{
      exerciseId,
      filename: 'exercise.png',
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
    }]
    const backup = parseBackup(JSON.stringify(base))

    await restoreBackup(backup, TARGET, 'merge')

    expect(backup.media).toEqual([
      expect.objectContaining({ exerciseId, filename: 'exercise.png', mime: 'image/png' }),
    ])
    expect(await localDb.uploads.toArray()).toEqual([
      expect.objectContaining({ exerciseId, filename: 'exercise.png' }),
    ])
  })

  it('rejects unknown formats before importing any record', () => {
    expect(() => parseBackup(JSON.stringify({ format: 'other', version: 1 })))
      .toThrow('backup_invalid_format')
    expect(() => parseBackup('{broken')).toThrow('backup_invalid_json')
  })
})

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}
