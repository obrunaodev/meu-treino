import { describe, expect, it } from 'vitest'
import { MAX_E1RM_REPS, entryRecords, estimateOneRepMax, type PriorSet } from '../src/records.js'

/** Os mesmos números de web/tests/load.test.ts e web/tests/records.test.ts: a regra é gêmea. */

const prior = (sessionId: string, totalKg: number | null, reps: number | null): PriorSet => ({ sessionId, totalKg, reps })

describe('estimateOneRepMax (gêmeo do app)', () => {
  it('uma repetição é a própria carga; Epley até 12', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100)
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 2)
    expect(estimateOneRepMax(100, MAX_E1RM_REPS)).toBeCloseTo(140, 6)
    expect(estimateOneRepMax(100, MAX_E1RM_REPS + 1)).toBeNull()
  })
})

describe('entryRecords', () => {
  it('sem sessão anterior, nenhum recorde', () => {
    expect(entryRecords([], { totalKg: 200, reps: 5, sets: 3 }, false)).toEqual([])
  })

  it('carga estritamente maior; igual (com arredondamento de lb) não', () => {
    expect(entryRecords([prior('a', 45.36, 5)], { totalKg: 50, reps: 5, sets: 1 }, false)).toContain('top_load')
    expect(entryRecords([prior('a', 45.36, 5)], { totalKg: 45.359, reps: 5, sets: 1 }, false)).toEqual([])
  })

  it('1RM maior sem carga maior: e1rm, não carga', () => {
    const kinds = entryRecords([prior('a', 100, 3)], { totalKg: 90, reps: 8, sets: 1 }, false)
    expect(kinds).toContain('e1rm')
    expect(kinds).not.toContain('top_load')
  })

  it('repetições pela fronteira, só quando não levou outro recorde', () => {
    const history = [prior('a', 130, 1), prior('a', 100, 5), prior('a', 90, 10)]
    expect(entryRecords(history, { totalKg: 95, reps: 8, sets: 1 }, false)).toEqual(['rep_max'])
    expect(entryRecords(history, { totalKg: 85, reps: 10, sets: 1 }, false)).toEqual([])
  })

  it('carga por lado chega já dobrada; peso corporal não estima 1RM', () => {
    const kinds = entryRecords([prior('a', 80, 10)], { totalKg: 84, reps: 10, sets: 1 }, true)
    expect(kinds).toContain('top_load')
    expect(kinds).not.toContain('e1rm')
  })

  it('volume da entrada contra a melhor sessão anterior', () => {
    const history = [prior('a', 60, 10), prior('a', 60, 10), prior('b', 50, 10)]
    expect(entryRecords(history, { totalKg: 60, reps: 10, sets: 3 }, false)).toContain('session_volume')
  })
})
