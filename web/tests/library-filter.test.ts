import { describe, expect, it } from 'vitest'
import { filterLibraryExercises } from '../src/pages/Library'
import type { Exercise } from '../src/lib/types'

const exercise = (id: string, name: string): Exercise => ({
  id,
  name,
  ownerId: 'owner',
  catalogExerciseId: null,
  equipmentId: null,
  laterality: 'bilateral',
  unilateralAsymmetric: false,
  loadPerSide: false,
  cues: [],
  rev: 1,
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  deletedAt: null,
})

describe('exercise library filters', () => {
  const exercises = [exercise('press', 'Supino reto'), exercise('row', 'Remada baixa')]
  const illustrated = new Set(['press'])

  it('combines name search with image presence', () => {
    expect(filterLibraryExercises(exercises, illustrated, 'with', 'SUPINO')).toEqual([exercises[0]])
    expect(filterLibraryExercises(exercises, illustrated, 'without', 'remada')).toEqual([exercises[1]])
  })

  it('returns every exercise when controls are clear', () => {
    expect(filterLibraryExercises(exercises, illustrated, 'all', '  ')).toEqual(exercises)
  })
})
