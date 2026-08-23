import { describe, expect, it } from 'vitest'
import type { Exercise, SetLog, WorkoutSession } from '../src/lib/types'
import { recentLoadTrends, workingSetsByCycle } from '../src/lib/domain/dashboard'

const session = (id: string, startedAt: string, status = 'concluida') => ({
  id, templateId: id, startedAt, status,
}) as WorkoutSession

const set = (sessionId: string, exerciseId: string, weightKg: number, extras = {}) => ({
  sessionId, exerciseId, weightKg, isWarmup: false, skipped: false, ...extras,
}) as SetLog

const exercise = (id: string, name: string) => ({ id, name }) as Exercise

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
  it('usa a maior carga da sessão e só as três últimas exposições', () => {
    const sessions = [1, 2, 3, 4].map((day) => session(`s${day}`, `2026-08-0${day}`))
    const sets = [
      set('s1', 'leg', 40), set('s2', 'leg', 50), set('s2', 'leg', 45),
      set('s3', 'leg', 55), set('s4', 'leg', 60),
    ]

    expect(recentLoadTrends([exercise('leg', 'Leg press')], sessions, sets)).toEqual([{
      exerciseId: 'leg', name: 'Leg press', values: [50, 55, 60], direction: 'up',
    }])
  })

  it('classifica platô e ignora séries em andamento', () => {
    const sessions = [session('s1', '2026-08-01'), session('s2', '2026-08-02', 'em_andamento')]
    const sets = [set('s1', 'leg', 40), set('s2', 'leg', 80)]

    expect(recentLoadTrends([exercise('leg', 'Leg press')], sessions, sets)[0]).toMatchObject({
      values: [40], direction: 'flat',
    })
  })
})
