import { describe, expect, it } from 'vitest'
import { DELOAD_RULES, blockEffort, blockSessions, deloadSignal, isNextBlock } from '../src/lib/domain/deload'
import type { PainEvent, SetLog, WorkoutSession } from '../src/lib/types'

const session = (id: string, extra: Partial<WorkoutSession> = {}) => ({
  id, programId: 'p', templateId: 't', status: 'concluida', startedAt: '2026-08-01T12:00:00Z',
  periodNumber: 1, blockNumber: 1, planSnapshot: null, ...extra,
}) as WorkoutSession

const set = (sessionId: string, rir: number | null, extra: Partial<SetLog> = {}) => ({
  id: `${sessionId}-${Math.random()}`, sessionId, exerciseId: 'e', templateItemId: null, setIndex: 0,
  isWarmup: false, skipped: false, rir, hadPain: false, weightKg: 60, reps: 10, ...extra,
}) as SetLog

const pain = (sessionId: string | null, level: number) => ({ id: `${sessionId}-${level}`, sessionId, level }) as PainEvent

const twoSessions = [session('s1'), session('s2')]
const ratedSets = (count: number, rir: number) => Array.from({ length: count }, (_, index) => set(index % 2 ? 's2' : 's1', rir))

describe('blockSessions', () => {
  it('pega só as sessões encerradas daquele bloco e programa', () => {
    const sessions = [
      session('a'), session('b', { blockNumber: 2 }), session('c', { periodNumber: 2 }),
      session('d', { programId: 'outro' }), session('e', { status: 'em_andamento' }),
    ]
    expect(blockSessions(sessions, 'p', { periodNumber: 1, blockNumber: 1 }).map((entry) => entry.id)).toEqual(['a'])
  })

  it('trata período ausente como o primeiro', () => {
    const sessions = [session('a', { periodNumber: undefined })]
    expect(blockSessions(sessions, 'p', { periodNumber: 1, blockNumber: 1 })).toHaveLength(1)
  })
})

describe('isNextBlock', () => {
  it('só o bloco imediatamente seguinte conta', () => {
    expect(isNextBlock({ periodNumber: 1, blockNumber: 2 }, { periodNumber: 1, blockNumber: 3 })).toBe(true)
    expect(isNextBlock({ periodNumber: 1, blockNumber: 4 }, { periodNumber: 2, blockNumber: 1 })).toBe(true)
    expect(isNextBlock({ periodNumber: 1, blockNumber: 2 }, { periodNumber: 1, blockNumber: 4 })).toBe(false)
    expect(isNextBlock({ periodNumber: 1, blockNumber: 4 }, { periodNumber: 2, blockNumber: 2 })).toBe(false)
    expect(isNextBlock({ periodNumber: 1, blockNumber: 2 }, { periodNumber: 1, blockNumber: 2 })).toBe(false)
  })
})

describe('blockEffort e deloadSignal', () => {
  it('um bloco de uma sessão só não é julgado', () => {
    expect(blockEffort([session('s1')], ratedSets(20, 0), [])).toBeNull()
    expect(deloadSignal(null).suggest).toBe(false)
  })

  it('poucas séries avaliadas não bastam, mesmo todas pesadas', () => {
    const effort = blockEffort(twoSessions, ratedSets(DELOAD_RULES.minRatedSets - 1, 1), [])
    expect(effort?.heavyShare).toBe(1)
    expect(deloadSignal(effort).reasons).not.toContain('effort')
  })

  it('metade das séries acima do alvo já sugere', () => {
    const sets = [...ratedSets(6, 1), ...ratedSets(6, 3)]
    const effort = blockEffort(twoSessions, sets, [])
    expect(effort).toMatchObject({ ratedSets: 12, heavySets: 6 })
    expect(deloadSignal(effort).reasons).toContain('effort')
  })

  it('49% não sugere', () => {
    const sets = [...ratedSets(49, 1), ...ratedSets(51, 3)]
    expect(deloadSignal(blockEffort(twoSessions, sets, [])).suggest).toBe(false)
  })

  it('o alvo do próprio item manda: RIR 1 num plano que mira 1 não é pesado', () => {
    const sessions = [
      session('s1', { planSnapshot: { items: [{ id: 'i1', rirTarget: 1 }] } as WorkoutSession['planSnapshot'] }),
      session('s2', { planSnapshot: { items: [{ id: 'i1', rirTarget: 1 }] } as WorkoutSession['planSnapshot'] }),
    ]
    const sets = Array.from({ length: 12 }, (_, index) => set(index % 2 ? 's2' : 's1', 1, { templateItemId: 'i1' }))
    expect(blockEffort(sessions, sets, [])?.heavySets).toBe(0)
    const toFailure = sets.map((entry) => ({ ...entry, rir: 0 }))
    expect(blockEffort(sessions, toFailure, [])?.heavySets).toBe(12)
  })

  it('aquecimento, série pulada e série sem esforço ficam fora da conta', () => {
    const sets = [
      ...ratedSets(12, 3),
      set('s1', 0, { isWarmup: true }), set('s1', 0, { skipped: true }), set('s1', null),
    ]
    expect(blockEffort(twoSessions, sets, [])).toMatchObject({ ratedSets: 12, heavySets: 0 })
  })

  it('dor forte em duas sessões do bloco sugere; numa só, não', () => {
    const sets = ratedSets(12, 3)
    const twoPainful = [pain('s1', DELOAD_RULES.painLevel), pain('s2', DELOAD_RULES.painLevel)]
    expect(deloadSignal(blockEffort(twoSessions, sets, twoPainful)).reasons).toContain('pain')

    const samePlace = [pain('s1', 5), pain('s1', 6)]
    expect(deloadSignal(blockEffort(twoSessions, sets, samePlace)).suggest).toBe(false)
    const mild = [pain('s1', DELOAD_RULES.painLevel - 1), pain('s2', DELOAD_RULES.painLevel - 1)]
    expect(deloadSignal(blockEffort(twoSessions, sets, mild)).suggest).toBe(false)
  })

  it('dor sem sessão, ou de outro bloco, é ignorada', () => {
    const outside = [pain(null, 8), pain('fora', 8)]
    expect(blockEffort(twoSessions, ratedSets(12, 3), outside)?.painSessions).toBe(0)
  })

  it('a marca de dor na série conta como sessão com dor', () => {
    const sets = [...ratedSets(12, 3), set('s1', 3, { hadPain: true }), set('s2', 3, { hadPain: true })]
    expect(deloadSignal(blockEffort(twoSessions, sets, [])).reasons).toContain('pain')
  })
})
