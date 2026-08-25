import { describe, expect, it } from 'vitest'
import type { Exercise, PainEvent, SetLog, WorkoutSession } from '../src/lib/types'
import {
  muscleGroupsForWeek, painByWeek, recentLoadTrends, sessionsByWeek,
  workingSetsByCycle, weeksToBlockEnd,
} from '../src/lib/domain/dashboard'

const session = (id: string, startedAt: string, status = 'concluida') => ({
  id, templateId: id, startedAt, status,
}) as WorkoutSession

const set = (sessionId: string, exerciseId: string, weightKg: number, extras = {}) => ({
  sessionId, exerciseId, weightKg, reps: 10, isWarmup: false, skipped: false, ...extras,
}) as SetLog

const exercise = (id: string, name: string, extras = {}) => ({
  id, name, catalogExerciseId: null, loadPerSide: false, ...extras,
}) as Exercise

describe('workingSetsByCycle', () => {
  it('exclui aquecimento, série pulada e sessão ainda aberta', () => {
    const sessions = [session('a', '2026-08-01'), session('b', '2026-08-02', 'em_andamento')]
    const sets = [
      set('a', 'leg', 50),
      set('a', 'leg', 30, { isWarmup: true }),
      set('a', 'leg', 50, { skipped: true }),
      set('b', 'leg', 50),
    ]

    expect(workingSetsByCycle(sessions, sets, 2, 4)).toEqual([{ label: 'C1', value: 1 }])
  })
})

describe('recentLoadTrends', () => {
  it('usa a maior carga da sessão e mantém a data das exposições', () => {
    const sessions = [1, 2, 3, 4].map((day) => session(`s${day}`, `2026-08-0${day}`))
    const sets = [
      set('s1', 'leg', 40), set('s2', 'leg', 50), set('s2', 'leg', 45),
      set('s3', 'leg', 55), set('s4', 'leg', 60),
    ]

    expect(recentLoadTrends([exercise('leg', 'Leg press')], sessions, sets)).toEqual([{
      exerciseId: 'leg', name: 'Leg press',
      points: [
        { at: '2026-08-01', weight: 40, volume: 400 },
        { at: '2026-08-02', weight: 50, volume: 950 },
        { at: '2026-08-03', weight: 55, volume: 550 },
        { at: '2026-08-04', weight: 60, volume: 600 },
      ],
      direction: 'up',
    }])
  })

  it('classifica platô e ignora séries em andamento', () => {
    const sessions = [session('s1', '2026-08-01'), session('s2', '2026-08-02', 'em_andamento')]
    const sets = [set('s1', 'leg', 40), set('s2', 'leg', 80)]

    expect(recentLoadTrends([exercise('leg', 'Leg press')], sessions, sets)[0]).toMatchObject({
      points: [{ at: '2026-08-01', weight: 40, volume: 400 }], direction: 'flat',
    })
  })

  it('dobra o volume de máquina com carga registrada por lado', () => {
    const result = recentLoadTrends(
      [exercise('chest', 'Supino articulado', { loadPerSide: true })],
      [session('s1', '2026-08-01')],
      [set('s1', 'chest', 20, { reps: 12 })],
    )

    expect(result[0]?.points[0]?.volume).toBe(480)
  })
})

describe('painByWeek', () => {
  it('mostra a pior intensidade e mantém semana sem dor em zero', () => {
    const events = [
      { occurredAt: '2026-08-18T12:00:00Z', level: 3 },
      { occurredAt: '2026-08-20T12:00:00Z', level: 6 },
    ] as PainEvent[]

    expect(painByWeek(events, 2, new Date('2026-08-24T12:00:00Z'))).toEqual([
      { weekStart: '2026-08-17', value: 6 },
      { weekStart: '2026-08-24', value: 0 },
    ])
  })
})

describe('muscleGroupsForWeek', () => {
  it('conta só séries de trabalho e agrupa exercício sem catálogo', () => {
    const sessions = [session('s1', '2026-08-24')]
    const exercises = [
      exercise('leg', 'Leg press', { catalogExerciseId: 10 }),
      exercise('custom', 'Livre'),
    ]
    const sets = [
      set('s1', 'leg', 100),
      set('s1', 'leg', 100, { isWarmup: true }),
      set('s1', 'custom', 20),
    ]

    expect(muscleGroupsForWeek(sessions, sets, exercises, new Map([[10, 'Quadríceps']]), 'Outro')).toEqual([
      { label: 'Outro', value: 1 },
      { label: 'Quadríceps', value: 1 },
    ])
  })
})

describe('weeksToBlockEnd', () => {
  it('estima pelo intervalo real e não inventa ritmo com uma sessão', () => {
    expect(weeksToBlockEnd(4, [session('s1', '2026-08-01')])).toBeNull()
    expect(weeksToBlockEnd(4, [
      session('s1', '2026-08-01'),
      session('s2', '2026-08-04'),
      session('s3', '2026-08-07'),
    ])).toBe(2)
  })
})

describe('sessionsByWeek', () => {
  it('inclui semanas vazias e ignora sessão aberta', () => {
    const sessions = [
      session('s1', '2026-08-10T12:00:00Z'),
      session('s2', '2026-08-16T12:00:00Z'),
      session('s3', '2026-08-17T12:00:00Z', 'em_andamento'),
      session('s4', '2026-08-24T12:00:00Z'),
    ]

    expect(sessionsByWeek(sessions, 3, new Date('2026-08-24T12:00:00Z'))).toEqual([
      { weekStart: '2026-08-10', value: 2 },
      { weekStart: '2026-08-17', value: 0 },
      { weekStart: '2026-08-24', value: 1 },
    ])
  })
})
