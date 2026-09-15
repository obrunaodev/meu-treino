import { describe, expect, it } from 'vitest'
import { progressionAction, progressionMessageKey, type ProgressionSet } from '../src/lib/domain/progression.js'

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

describe('timed exercise progression', () => {
  const hold = (seconds: number, rir: number): ProgressionSet => ({ reps: null, seconds, rir, skipped: false, isWarmup: false })

  it('mede segundos quando o exercício é por tempo', () => {
    expect(progressionAction([hold(60, 2), hold(60, 3)], [], 60, 'seconds')).toBe('increase')
    expect(progressionAction([hold(59, 2)], [], 60, 'seconds')).toBe('progress_reps')
    expect(progressionAction([hold(45, 0)], [], 60, 'seconds')).toBe('reduce')
  })

  it('sem a métrica de tempo, série por tempo segue sem sugestão', () => {
    expect(progressionAction([hold(60, 2)], [], 60)).toBeNull()
  })

  it('a frase muda para duração, e volta a falar de carga quando há lastro', () => {
    expect(progressionMessageKey('increase', 'reps', [])).toBe('progression.increase')
    expect(progressionMessageKey('increase', 'seconds', [hold(60, 2)])).toBe('progression.timed_raise_target')
    expect(progressionMessageKey('progress_reps', 'seconds', [hold(50, 2)])).toBe('progression.timed_progress')
    expect(progressionMessageKey('maintain', 'seconds', [hold(50, 1)])).toBe('progression.timed_maintain')

    const loaded = { ...hold(60, 2), weightKg: 10 }
    expect(progressionMessageKey('increase', 'seconds', [loaded])).toBe('progression.increase')
    expect(progressionMessageKey('reduce', 'seconds', [loaded])).toBe('progression.reduce')
    expect(progressionMessageKey('reduce', 'seconds', [hold(60, 0)])).toBe('progression.timed_reduce')
  })

  it('aquecimento com lastro não faz a série contar como carregada', () => {
    const warmup = { ...hold(30, 4), weightKg: 10, isWarmup: true }
    expect(progressionMessageKey('increase', 'seconds', [warmup, hold(60, 2)])).toBe('progression.timed_raise_target')
  })
})
