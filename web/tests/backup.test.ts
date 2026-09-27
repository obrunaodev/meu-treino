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
    const [imported] = await localDb.table_('equipment').toArray()
    expect(imported!.id).not.toBe(equipment.id)
    expect(imported).toMatchObject({
      ownerId: TARGET,
      name: 'Leg press',
      plateTable: [10, 20],
      deletedAt: null,
    })
    expect(await localDb.outbox.count()).toBe(1)
    await restoreBackup(backup, TARGET, 'merge')
    expect(await localDb.table_('equipment').count()).toBe(1)
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
      expect.objectContaining({ exerciseId: expect.not.stringMatching(exerciseId), filename: 'exercise.png' }),
    ])
  })

  it('rejects unknown formats before importing any record', () => {
    expect(() => parseBackup(JSON.stringify({ format: 'other', version: 1 })))
      .toThrow('backup_invalid_format')
    expect(() => parseBackup('{broken')).toThrow('backup_invalid_json')
  })

  it('substituir não apaga e recria o que o arquivo traz', async () => {
    // Dor é append-only: recriar um id apagado vira noop no servidor, e a
    // linha voltaria apagada no próximo pull.
    const dor = await mutate('pain_events', {
      ownerId: SOURCE, regionSlug: 'joelho-d', level: 3, note: null,
      occurredAt: '2026-09-10T12:00:00.000Z', sessionId: null, setLogId: null,
    })
    const exported = await buildBackup()
    const backup = parseBackup(await readBlob(exported.blob))
    await localDb.outbox.clear()

    await restoreBackup(backup, SOURCE, 'replace')

    const ops = await localDb.outbox.toArray()
    expect(ops.filter((op) => op.entityId === dor.id).map((op) => op.op)).toEqual(['upsert'])
    expect(await localDb.table_('pain_events').get(dor.id)).toMatchObject({ deletedAt: null })
  })

  it('substituir continua apagando o que o arquivo não traz', async () => {
    const backup = parseBackup(await readBlob((await buildBackup()).blob))
    const sobrando = await mutate('pain_events', {
      ownerId: SOURCE, regionSlug: 'ombro-e', level: 2, note: null,
      occurredAt: '2026-09-11T12:00:00.000Z', sessionId: null, setLogId: null,
    })

    await restoreBackup(backup, SOURCE, 'replace')

    expect((await localDb.table_('pain_events').get(sobrando.id))?.deletedAt).toBeTruthy()
  })

  it('arquivo anterior a uma tabela nova continua restaurando', async () => {
    await mutate('gyms', { ownerId: SOURCE, name: 'Academia', isActive: true })
    const exported = await buildBackup()
    const raw = JSON.parse(await readBlob(exported.blob))
    // Como um arquivo escrito antes de a entidade existir: a lista some.
    raw.version = 1
    delete raw.sourceOwnerId
    delete raw.entities.body_measurements
    await localDb.delete()
    await localDb.open()

    const summary = await restoreBackup(parseBackup(JSON.stringify(raw)), TARGET, 'merge')

    expect(summary.rows).toBeGreaterThan(0)
    expect((await localDb.table_('gyms').toArray())[0]).toMatchObject({ name: 'Academia', ownerId: TARGET })
  })

  it('lista presente com outra coisa dentro ainda é arquivo corrompido', async () => {
    const exported = await buildBackup()
    const raw = JSON.parse(await readBlob(exported.blob))
    raw.entities.test_results = 'nao-e-lista'

    expect(() => parseBackup(JSON.stringify(raw))).toThrow('backup_invalid_format')
  })

  it('rejects missing required tables before Replace can remove anything', async () => {
    const gym = await mutate('gyms', { ownerId: SOURCE, name: 'Keep me' })
    const raw = JSON.parse(await readBlob((await buildBackup()).blob))
    delete raw.entities.gyms
    expect(() => parseBackup(JSON.stringify(raw))).toThrow('backup_invalid_format')
    raw.version = 1
    expect(() => parseBackup(JSON.stringify(raw))).toThrow('backup_invalid_format')
    expect((await localDb.table_('gyms').get(gym.id))?.deletedAt).toBeUndefined()
  })

  it('keeps measurements when replacing from a legacy file without that table', async () => {
    const raw = JSON.parse(await readBlob((await buildBackup()).blob))
    raw.version = 1
    delete raw.sourceOwnerId
    delete raw.entities.body_measurements
    const measurement = await mutate('body_measurements', { ownerId: TARGET, kind: 'weight', value: 80 })
    await restoreBackup(parseBackup(JSON.stringify(raw)), TARGET, 'replace')
    expect((await localDb.table_('body_measurements').get(measurement.id))?.deletedAt).toBeUndefined()
  })

  it('remaps relationships and immutable snapshots together across accounts', async () => {
    const gym = await mutate('gyms', { ownerId: SOURCE, name: 'Gym' })
    const gear = await mutate('equipment', { ownerId: SOURCE, name: 'Bar', gymId: gym.id })
    const exercise = await mutate('exercises', { ownerId: SOURCE, name: 'Squat', equipmentId: gear.id })
    const item = await mutate('template_items', { ownerId: SOURCE, exerciseId: exercise.id })
    await mutate('workout_sessions', { ownerId: SOURCE, planSnapshot: { items: [{ id: item.id, exerciseId: exercise.id, equipment: { id: gear.id } }] } })
    const backup = parseBackup(await readBlob((await buildBackup()).blob))
    await localDb.delete()
    await localDb.open()
    await restoreBackup(backup, TARGET, 'merge')
    const [newGym] = await localDb.table_('gyms').toArray()
    const [newGear] = await localDb.table_('equipment').toArray()
    const [newExercise] = await localDb.table_('exercises').toArray()
    const [newItem] = await localDb.table_('template_items').toArray()
    const [session] = await localDb.table_('workout_sessions').toArray()
    expect(newGear!.gymId).toBe(newGym!.id)
    expect(newExercise!.equipmentId).toBe(newGear!.id)
    expect(newItem!.exerciseId).toBe(newExercise!.id)
    expect(session!.planSnapshot).toMatchObject({ items: [{ id: newItem!.id, exerciseId: newExercise!.id, equipment: { id: newGear!.id } }] })
  })

  it('restaurar um backup anterior ao bi-set desfaz o grupo de hoje', async () => {
    const item = await mutate('template_items', {
      ownerId: SOURCE, templateId: 't', exerciseId: 'e', position: 0, sets: 3,
      repMin: 8, repMax: 12, isTimeBased: false, rirTarget: 2, restSeconds: null, notes: null,
    })
    await localDb.outbox.clear()
    const exported = await buildBackup()
    const backup = parseBackup(await readBlob(exported.blob))

    // O arquivo é de antes da coluna existir; o item local já está agrupado.
    await mutate('template_items', { id: item.id, ownerId: SOURCE, supersetGroup: 'g1' })
    await restoreBackup(backup, SOURCE, 'replace')

    expect(await localDb.table_('template_items').get(item.id)).toMatchObject({ supersetGroup: null })
  })

  it('leva a preferência nova no arquivo, e um backup anterior a ela não a desliga', async () => {
    await mutate('user_settings', {
      ownerId: SOURCE, unit: 'kg', showPlates: true, theme: 'dark', locale: 'pt-BR',
      remindersEnabled: false, restAutoStart: true, onboardedAt: null,
    })
    await localDb.outbox.clear()

    const exported = await buildBackup()
    const backup = parseBackup(await readBlob(exported.blob))
    const settings = backup.entities.user_settings![0]!
    expect(settings).toMatchObject({ restAutoStart: true })

    // Arquivo gerado antes da coluna existir: restaurar não pode desligar o que está ligado.
    const before = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== 'restAutoStart'))
    await restoreBackup({ ...backup, entities: { ...backup.entities, user_settings: [before] } }, SOURCE, 'merge')

    expect((await localDb.table_('user_settings').toArray())[0]).toMatchObject({ restAutoStart: true })
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
