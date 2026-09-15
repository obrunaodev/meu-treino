import { describe, expect, it } from 'vitest'
import { exerciseSessionHistory } from '../src/lib/domain/exercise-history'
import {
  EMPTY_BASELINE, SESSION_RECORD_KEY, foldSession, personalRecords, recordBaseline, sessionRecordKinds,
  type ComparableSet,
} from '../src/lib/domain/records'
import type { Exercise, SetLog, WorkoutSession } from '../src/lib/types'

const set = (key: string, totalKg: number | null, reps: number | null, extra: Partial<ComparableSet> = {}): ComparableSet => ({
  key, setIndex: 0, totalKg, reps, seconds: null, bodyweight: false, ...extra,
})

/** Linha de base a partir de sessões encerradas, na ordem dada. */
const baselineFrom = (...sessions: ComparableSet[][]) => sessions.reduce(
  (baseline, sets, index) => foldSession(baseline, sets, `s${index}`, `2026-08-0${index + 1}T12:00:00Z`),
  EMPTY_BASELINE,
)

const kindsOf = (baseline: ReturnType<typeof baselineFrom>, sets: ComparableSet[]) => Object.fromEntries(sessionRecordKinds(baseline, sets))

describe('sessionRecordKinds', () => {
  it('na primeira sessão do exercício não há recorde nenhum', () => {
    expect(kindsOf(EMPTY_BASELINE, [set('a', 200, 5)])).toEqual({})
  })

  it('carga estritamente maior é recorde; igual, não — nem com o arredondamento de lb', () => {
    const baseline = baselineFrom([set('x', 45.36, 5)])
    expect(kindsOf(baseline, [set('a', 50, 5)])).toMatchObject({ a: expect.arrayContaining(['top_load']) })
    expect(kindsOf(baseline, [set('a', 45.359, 5)])).toEqual({})
  })

  it('1RM estimado maior sem carga maior é só recorde de 1RM', () => {
    // 90 × 8 ≈ 114 contra 100 × 3 = 110.
    expect(kindsOf(baselineFrom([set('x', 100, 3)]), [set('a', 90, 8)]).a).toEqual(['e1rm'])
  })

  it('não estima 1RM acima de 12 repetições', () => {
    const kinds = kindsOf(baselineFrom([set('x', 60, 12)]), [set('a', 55, 13)])
    expect(kinds.a).not.toContain('e1rm')
  })

  describe('repetições numa carga (fronteira)', () => {
    // O single pesado segura o 1RM estimado em 130, para isolar o recorde de repetições.
    const baseline = baselineFrom([set('z', 130, 1), set('x', 100, 5), set('y', 90, 10)])

    it('mais repetições do que qualquer série com carga igual ou maior', () => {
      expect(kindsOf(baseline, [set('a', 95, 8)])).toEqual({ a: ['rep_max'] })
      expect(kindsOf(baseline, [set('a', 90, 11)])).toEqual({ a: ['rep_max'] })
    })

    it('série superada em carga e repetições não é recorde', () => {
      expect(kindsOf(baseline, [set('a', 85, 10)])).toEqual({})
    })
  })

  it('peso corporal: mais repetições é recorde, sem 1RM', () => {
    const baseline = baselineFrom([set('x', null, 12, { bodyweight: true })])
    expect(kindsOf(baseline, [set('a', null, 15, { bodyweight: true })])).toEqual({ a: ['rep_max'] })
    const withLoad = kindsOf(baselineFrom([set('x', 5, 8, { bodyweight: true })]), [set('a', 10, 8, { bodyweight: true })])
    expect(withLoad.a).toEqual(['top_load'])
  })

  it('série por tempo: maior tempo é recorde', () => {
    const baseline = baselineFrom([set('x', null, null, { seconds: 45 })])
    expect(kindsOf(baseline, [set('a', null, null, { seconds: 60 })])).toEqual({ a: ['longest_set'] })
  })

  it('volume da sessão maior que o de qualquer sessão anterior', () => {
    const baseline = baselineFrom([set('x', 60, 10), set('y', 60, 10, { setIndex: 1 })])
    expect(kindsOf(baseline, [set('a', 60, 10), set('b', 60, 12, { setIndex: 1 })])[SESSION_RECORD_KEY]).toEqual(['session_volume'])
  })

  it('duas séries iguais batendo o histórico: só a primeira leva a marca', () => {
    const kinds = kindsOf(baselineFrom([set('x', 90, 5)]), [set('b', 100, 5, { setIndex: 1 }), set('a', 100, 5, { setIndex: 0 })])
    expect(Object.keys(kinds).filter((key) => key !== SESSION_RECORD_KEY)).toEqual(['a'])
  })

  it('numa sessão com recorde de carga, outra série ainda pode levar o de repetições', () => {
    const kinds = kindsOf(baselineFrom([set('z', 130, 1), set('x', 100, 5)]), [set('a', 140, 1), set('b', 60, 20, { setIndex: 1 })])
    expect(kinds.a).toContain('top_load')
    expect(kinds.b).toEqual(['rep_max'])
  })
})

const exercise = { id: 'supino', name: 'Supino', loadPerSide: false, equipmentId: null } as Exercise
const session = (id: string, day: number, extra: Partial<WorkoutSession> = {}) => ({
  id, templateId: 't', programId: 'p', status: 'concluida', planSnapshot: null,
  startedAt: `2026-08-${String(day).padStart(2, '0')}T12:00:00Z`, ...extra,
}) as WorkoutSession
const log = (id: string, sessionId: string, weightKg: number, extra: Partial<SetLog> = {}) => ({
  id, sessionId, exerciseId: 'supino', setIndex: 0, isWarmup: false, side: 'ambos', weightKg, plateCount: null,
  reps: 5, seconds: null, rir: 2, skipped: false, hadPain: false, completedAt: null, updatedAt: '', ...extra,
}) as SetLog

describe('recordBaseline', () => {
  it('só conta sessões encerradas antes da atual, ignorando aquecimento e série pulada', () => {
    const sessions = [session('s1', 1), session('s2', 5), session('aberta', 6, { status: 'em_andamento' }), session('hoje', 10), session('depois', 12)]
    const history = exerciseSessionHistory('supino', exercise, sessions, [
      log('a', 's1', 80), log('b', 's2', 90), log('w', 's2', 150, { isWarmup: true }), log('p', 's2', 160, { skipped: true }),
      log('c', 'aberta', 200), log('d', 'depois', 300),
    ], [])

    const baseline = recordBaseline(history, sessions[3]!)
    expect(baseline).toMatchObject({ sessions: 2, topLoadKg: 90 })
  })
})

describe('personalRecords', () => {
  const sessions = [session('s1', 1), session('s2', 5), session('s3', 9)]

  it('marca cada série pelo que veio antes dela, em ordem de data', () => {
    const history = exerciseSessionHistory('supino', exercise, sessions, [log('a', 's1', 80), log('b', 's2', 90), log('c', 's3', 85)], [])
    const { flagsBySetId } = personalRecords(history)
    expect([...flagsBySetId.keys()]).toEqual(['b'])
  })

  it('editar uma sessão antiga para cima tira o recorde de uma posterior', () => {
    const history = exerciseSessionHistory('supino', exercise, sessions, [log('a', 's1', 95), log('b', 's2', 90), log('c', 's3', 85)], [])
    expect(personalRecords(history).flagsBySetId.size).toBe(0)
  })

  it('sem a sessão do melhor, o próximo melhor vira recorde', () => {
    const history = exerciseSessionHistory('supino', exercise, [sessions[0]!, sessions[2]!], [log('a', 's1', 80), log('b', 's2', 90), log('c', 's3', 85)], [])
    expect([...personalRecords(history).flagsBySetId.keys()]).toEqual(['c'])
  })
})
