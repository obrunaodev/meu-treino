import { describe, expect, it } from 'vitest'
import { progressionAction, type ProgressionSet } from '../src/lib/domain/progression.js'

const set = (reps: number, rir: number): ProgressionSet => ({ reps, rir, skipped: false, isWarmup: false })

describe('manual progression guidance', () => {
  it('increases only after every set reaches the range top at moderate or lighter effort', () => {
    expect(progressionAction([set(12, 2), set(12, 3), set(12, 2)], [], 12)).toBe('increase')
    expect(progressionAction([set(12, 2), set(10, 2)], [], 12)).toBe('progress_reps')
  })

  it('reduces after very heavy effort or heavy effort in two consecutive sessions', () => {
    expect(progressionAction([set(8, 0)], [], 12)).toBe('reduce')
    expect(progressionAction([set(8, 1)], [set(9, 1)], 12)).toBe('reduce')
    expect(progressionAction([set(8, 1)], [set(9, 2)], 12)).toBe('maintain')
  })

  it('ignores skipped and warm-up rows', () => {
    expect(progressionAction([
      { ...set(1, 0), skipped: true },
      { ...set(1, 0), isWarmup: true },
    ], [], 12)).toBeNull()
  })
})
