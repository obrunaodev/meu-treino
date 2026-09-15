import { describe, expect, it } from 'vitest'
import {
  availableMetrics, exerciseSessionHistory, historySeries, pageByMonth,
} from '../src/lib/domain/exercise-history'
import { calendarDayKey } from '../src/lib/domain/calendar'
import type { Equipment, Exercise, SetLog, WorkoutSession } from '../src/lib/types'

const exercise = (extra: Partial<Exercise> = {}) => ({
  id: 'supino', name: 'Supino', loadPerSide: false, equipmentId: null, ...extra,
}) as Exercise

const session = (id: string, startedAt: string, extra: Partial<WorkoutSession> = {}) => ({
  id, templateId: 't', programId: 'p', status: 'concluida', startedAt, planSnapshot: null, ...extra,
}) as WorkoutSession

const set = (id: string, sessionId: string, extra: Partial<SetLog> = {}) => ({
  id, sessionId, exerciseId: 'supino', setIndex: 0, isWarmup: false, side: 'ambos', weightKg: 60,
  plateCount: null, reps: 10, seconds: null, rir: 2, skipped: false, hadPain: false,
  completedAt: null, updatedAt: '2026-08-01T00:00:00.000Z', ...extra,
}) as SetLog

const snapshotWith = (loadPerSide: boolean, loadType = 'anilha') => ({
  version: 1, capturedAt: '', templateId: 't', templateName: 'Treino A',
  items: [{ exerciseId: 'supino', loadPerSide, equipment: { id: 'g', name: 'Máquina', loadType, incrementKg: null, plateTable: [] } }],
}) as unknown as WorkoutSession['planSnapshot']

describe('exerciseSessionHistory', () => {
  it('reúne só o exercício pedido, da sessão mais recente para a mais antiga', () => {
    const sessions = [session('s1', '2026-08-01T10:00:00Z'), session('s2', '2026-08-08T10:00:00Z')]
    const sets = [set('a', 's1'), set('b', 's2'), set('c', 's2', { exerciseId: 'remada' }), set('d', 'apagada')]

    const history = exerciseSessionHistory('supino', exercise(), sessions, sets, [])
    expect(history.map((entry) => entry.sessionId)).toEqual(['s2', 's1'])
    expect(history[0]?.sets.map((entry) => entry.id)).toEqual(['b'])
  })

  it('mantém aquecimento e série pulada nas linhas, fora das estatísticas', () => {
    const sets = [
      set('w', 's1', { isWarmup: true, weightKg: 100 }),
      set('p', 's1', { setIndex: 1, skipped: true, weightKg: 200 }),
      set('t', 's1', { setIndex: 0, weightKg: 60, reps: 10 }),
    ]
    const [entry] = exerciseSessionHistory('supino', exercise(), [session('s1', '2026-08-01T10:00:00Z')], sets, [])

    expect(entry?.sets.map((row) => row.id)).toEqual(['w', 't', 'p'])
    expect(entry).toMatchObject({ topLoadKg: 60, volumeKg: 600, workingSets: 1 })
  })

  it('usa o modo por lado do snapshot da sessão, não o do exercício hoje', () => {
    const sessions = [session('s1', '2026-08-01T10:00:00Z', { planSnapshot: snapshotWith(true) })]
    const [entry] = exerciseSessionHistory('supino', exercise({ loadPerSide: false }), sessions, [set('a', 's1', { weightKg: 40, reps: 5 })], [])

    expect(entry).toMatchObject({ topLoadKg: 80, volumeKg: 400 })
    expect(entry?.e1rmKg).toBeCloseTo(93.33, 2)
  })

  it('sem snapshot, cai no modo atual do exercício', () => {
    const [entry] = exerciseSessionHistory('supino', exercise({ loadPerSide: true }), [session('s1', '2026-08-01T10:00:00Z')], [set('a', 's1', { weightKg: 40 })], [])
    expect(entry?.topLoadKg).toBe(80)
  })

  it('série por tempo não tem e1RM nem volume, mas tem o melhor tempo', () => {
    const [entry] = exerciseSessionHistory('supino', exercise(), [session('s1', '2026-08-01T10:00:00Z')], [
      set('a', 's1', { weightKg: null, reps: null, seconds: 45 }),
      set('b', 's1', { setIndex: 1, weightKg: null, reps: null, seconds: 60 }),
    ], [])
    expect(entry).toMatchObject({ e1rmKg: null, volumeKg: 0, bestSeconds: 60 })
  })

  it('peso corporal não estima 1RM; carga extra conta como carga', () => {
    const gear = { id: 'barra', loadType: 'corporal' } as Equipment
    const sessions = [session('s1', '2026-08-01T10:00:00Z')]
    const [bodyweight] = exerciseSessionHistory('supino', exercise({ equipmentId: 'barra' }), sessions, [
      set('a', 's1', { weightKg: null, reps: 12 }),
      set('b', 's1', { setIndex: 1, weightKg: 10, reps: 8 }),
    ], [gear])
    expect(bodyweight).toMatchObject({ e1rmKg: null, topLoadKg: 10, bestReps: 12 })
  })

  it('séries dos dois lados ficam separadas e somam volume', () => {
    const [entry] = exerciseSessionHistory('supino', exercise(), [session('s1', '2026-08-01T10:00:00Z')], [
      set('d', 's1', { side: 'D', weightKg: 20, reps: 10 }),
      set('e', 's1', { side: 'E', weightKg: 20, reps: 10 }),
    ], [])
    expect(entry?.sets.map((row) => row.side)).toEqual(['D', 'E'])
    expect(entry?.volumeKg).toBe(400)
  })
})

describe('availableMetrics e historySeries', () => {
  const sessions = [
    session('s1', '2026-07-30T10:00:00Z'),
    session('s2', '2026-08-02T11:00:00Z'),
    session('s3', '2026-08-02T13:00:00Z'),
    session('s4', '2026-08-09T10:00:00Z', { status: 'em_andamento' }),
  ]
  const history = exerciseSessionHistory('supino', exercise(), sessions, [
    set('a', 's1', { weightKg: 50 }), set('b', 's2', { weightKg: 55 }),
    set('c', 's3', { weightKg: 52 }), set('d', 's4', { weightKg: 90 }),
  ], [])

  it('oferece só métricas com dados', () => {
    expect(availableMetrics(history)).toEqual(['top_load', 'e1rm', 'volume', 'best_reps'])
  })

  it('recente: um ponto por dia com o melhor valor, sem a sessão aberta', () => {
    // Dia de calendário local, como na tela: a chave depende do fuso de quem vê.
    const day = (iso: string) => calendarDayKey(new Date(iso))
    expect(historySeries(history, 'top_load', 'recent').map((point) => [point.key, point.value])).toEqual([
      [day('2026-07-30T10:00:00Z'), 50], [day('2026-08-02T11:00:00Z'), 55],
    ])
  })

  it('tudo: um ponto por mês com o melhor do mês', () => {
    expect(historySeries(history, 'top_load', 'all').map((point) => [point.key, point.value])).toEqual([
      ['2026-07', 50], ['2026-08', 55],
    ])
  })

  it('recente guarda só os 12 últimos dias', () => {
    const many = Array.from({ length: 15 }, (_, day) => session(`d${day}`, `2026-06-${String(day + 1).padStart(2, '0')}T10:00:00Z`))
    const longHistory = exerciseSessionHistory('supino', exercise(), many, many.map((entry, index) => set(`x${index}`, entry.id, { weightKg: index })), [])
    const series = historySeries(longHistory, 'top_load', 'recent')
    expect(series).toHaveLength(12)
    expect(series.at(-1)?.value).toBe(14)
  })
})

describe('pageByMonth', () => {
  it('agrupa as sessões visíveis por mês e avisa quando há mais', () => {
    const sessions = ['2026-08-20', '2026-08-02', '2026-07-15'].map((day, index) => session(`s${index}`, `${day}T10:00:00Z`))
    const history = exerciseSessionHistory('supino', exercise(), sessions, sessions.map((entry) => set(`x${entry.id}`, entry.id)), [])

    const page = pageByMonth(history, 2)
    expect(page.months.map((month) => [month.monthKey, month.sessions.length])).toEqual([['2026-08', 2]])
    expect(page.hasMore).toBe(true)
    expect(pageByMonth(history, 10).hasMore).toBe(false)
  })
})
