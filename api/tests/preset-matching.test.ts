import { describe, expect, it } from 'vitest'
import { matchPresetExercise } from '../src/lib/preset-matching.js'

const exercise = (id: number, stationCode: string | null) => ({ id, stationCode })

describe('preset equipment matching', () => {
  it('keeps exercises supported by the selected gym', () => {
    expect(matchPresetExercise(exercise(1, '10'), [], new Set(['10']))).toEqual({
      status: 'direct', selectedExerciseId: 1, alternatives: [],
    })
  })

  it('automatically uses the sole compatible related exercise', () => {
    expect(matchPresetExercise(
      exercise(1, '10'), [exercise(2, '20'), exercise(3, '30')], new Set(['20']),
    )).toEqual({ status: 'substituted', selectedExerciseId: 2, alternatives: [2] })
  })

  it('requires a choice when several compatible alternatives exist', () => {
    expect(matchPresetExercise(
      exercise(1, '10'), [exercise(2, null), exercise(3, '20')], new Set(['20']),
    )).toEqual({ status: 'choice_required', selectedExerciseId: null, alternatives: [2, 3] })
  })

  it('reports every known alternative when none matches the gym', () => {
    expect(matchPresetExercise(
      exercise(1, '10'), [exercise(2, '20')], new Set(['30']),
    )).toEqual({ status: 'unavailable', selectedExerciseId: null, alternatives: [2] })
  })
})
