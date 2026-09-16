import { beforeEach, describe, expect, it } from 'vitest'
import { localDb } from '../src/lib/db'
import { buildSetLogCsv } from '../src/lib/export'
import { SET_LOG_HEADERS } from '../src/lib/domain/csv'

const OWNER = '00000000-0000-7000-8000-000000000081'
const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }

const planItem = (id: string, exerciseId: string, name: string, supersetGroup: string | null, position: number) => ({
  ...base, id, templateId: 'treino-a', exerciseId, position, sets: 1, repMin: 8, repMax: 12,
  rirTarget: 2, isTimeBased: false, trackingMode: 'compact', restSeconds: null, notes: null,
  supersetGroup, exerciseName: name, equipment: null, loadPerSide: false,
})

/** Quatro exercícios: um bi-set, um solto, e outro bi-set depois dele. */
async function seed() {
  const items = [
    planItem('item-a', 'ex-a', 'Supino', 'item-a', 0),
    planItem('item-b', 'ex-b', 'Remada', 'item-a', 1),
    planItem('item-c', 'ex-c', 'Agachamento', null, 2),
    planItem('item-d', 'ex-d', 'Rosca', 'item-d', 3),
    planItem('item-e', 'ex-e', 'Tríceps', 'item-d', 4),
  ]
  await localDb.table_('workout_sessions').put({
    ...base, id: 'sessao', programId: 'p', templateId: 'treino-a', status: 'concluida',
    startedAt: '2026-09-10T12:00:00.000Z', periodNumber: 1, blockNumber: 1, cycleNumber: 1,
    planSnapshot: { templateName: 'Treino A', items },
  } as never)
  for (const [index, item] of items.entries()) {
    await localDb.table_('set_logs').put({
      ...base, id: `serie-${index}`, sessionId: 'sessao', templateItemId: item.id, exerciseId: item.exerciseId,
      setIndex: 0, isWarmup: false, side: 'ambos', weightKg: 50, plateCount: null, reps: 10,
      seconds: null, rir: 2, skipped: false, hadPain: false, completedAt: null,
    } as never)
  }
}

const columnOf = (line: string, header: string) => line.split(',')[SET_LOG_HEADERS.indexOf(header)]

/** O Blob do jsdom não tem `.text()`; o FileReader tem. */
const blobText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsText(blob)
})

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
  await seed()
})

describe('coluna do bi-set no CSV', () => {
  it('numera os grupos do treino e deixa o exercício solto vazio', async () => {
    const text = await blobText(await buildSetLogCsv())
    const [header, ...lines] = text.split('\r\n')

    expect(header).toContain('bi_set')
    expect(lines.map((line) => columnOf(line, 'bi_set'))).toEqual(['1', '1', '', '2', '2'])
  })

  it('a coluna acompanha o exercício, não a posição da linha', async () => {
    const text = await blobText(await buildSetLogCsv())
    const lines = text.split('\r\n').slice(1)

    const supino = lines.find((line) => columnOf(line, 'exercicio') === 'Supino')!
    const agacho = lines.find((line) => columnOf(line, 'exercicio') === 'Agachamento')!
    expect(columnOf(supino, 'bi_set')).toBe('1')
    expect(columnOf(agacho, 'bi_set')).toBe('')
  })
})
