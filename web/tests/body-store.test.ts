import { beforeEach, describe, expect, it } from 'vitest'
import { makeActions } from '../src/lib/actions'
import { buildBackup, parseBackup, restoreBackup } from '../src/lib/backup'
import { localDb } from '../src/lib/db'
import type { BodyMeasurement } from '../src/lib/types'

const OWNER = '00000000-0000-7000-8000-000000000091'
const OTHER = '00000000-0000-7000-8000-000000000092'
const actions = makeActions(OWNER)

const rows = async () =>
  (await localDb.table_('body_measurements').toArray()) as unknown as BodyMeasurement[]

const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsText(blob)
})

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('medidas corporais no dispositivo', () => {
  it('grava com os padrões e enfileira para o sync', async () => {
    const saved = await actions.saveBodyMeasurement({ kind: 'peso', value: 82.4, measuredOn: '2026-09-15' })

    expect(await rows()).toEqual([expect.objectContaining({
      kind: 'peso', value: 82.4, measuredOn: '2026-09-15', side: 'ambos', note: null, ownerId: OWNER,
    })])
    expect(await localDb.outbox.toArray()).toEqual([expect.objectContaining({
      entity: 'body_measurements', entityId: saved.id, op: 'upsert',
    })])
  })

  it('duas medidas do mesmo dia convivem, cada uma com o seu id', async () => {
    await actions.saveBodyMeasurement({ kind: 'coxa', side: 'D', value: 58, measuredOn: '2026-09-15' })
    await actions.saveBodyMeasurement({ kind: 'coxa', side: 'E', value: 57.5, measuredOn: '2026-09-15' })

    expect((await rows()).map((row) => row.side).sort()).toEqual(['D', 'E'])
  })

  it('corrigir o valor reescreve a mesma linha', async () => {
    const saved = await actions.saveBodyMeasurement({ kind: 'peso', value: 82.4, measuredOn: '2026-09-15' })

    await actions.saveBodyMeasurement({ id: saved.id, value: 82.9 })

    expect(await rows()).toEqual([expect.objectContaining({ id: saved.id, value: 82.9, kind: 'peso' })])
  })

  it('apagar é soft delete, como todo o resto do sync', async () => {
    const saved = await actions.saveBodyMeasurement({ kind: 'peso', value: 82.4, measuredOn: '2026-09-15' })

    await actions.removeBodyMeasurement(saved.id)

    expect((await rows())[0]?.deletedAt).toBeTruthy()
  })

  it('o backup leva as medidas e as devolve na conta que importa', async () => {
    await actions.saveBodyMeasurement({ kind: 'cintura', value: 84, measuredOn: '2026-09-15' })
    const exported = await buildBackup()
    const backup = parseBackup(await readBlob(exported.blob))
    await localDb.delete()
    await localDb.open()

    await restoreBackup(backup, OTHER, 'merge')

    expect(await rows()).toEqual([expect.objectContaining({
      kind: 'cintura', value: 84, measuredOn: '2026-09-15', ownerId: OTHER,
    })])
  })
})
