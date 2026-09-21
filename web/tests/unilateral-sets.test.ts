import { describe, expect, it } from 'vitest'
import { workingSetsByCycle } from '../src/lib/domain/dashboard'
import { exerciseSessionHistory } from '../src/lib/domain/exercise-history'
import {
  exerciseExecutionStatus, exerciseProgress, nextSlot, sessionProgress,
} from '../src/lib/domain/session'
import { progressReview } from '../src/lib/domain/session-review'
import { countSets } from '../src/lib/domain/sets'
import { buildTrainingReport } from '../src/lib/domain/training-report'
import type { PlanSnapshotItem, SetLog, WorkoutSession } from '../src/lib/types'

/**
 * Um exercício que registra lados separados grava duas linhas por série.
 * Tudo que conta série tem de continuar contando série.
 */

const base = { ownerId: 'owner', updatedAt: '2026-09-01T00:00:00Z', deletedAt: null }

const item = (patch: Partial<PlanSnapshotItem> = {}): PlanSnapshotItem => ({
  ...base, id: 'item', templateId: 't', position: 0, exerciseId: 'extensora', sets: 3,
  repMin: 8, repMax: 12, isTimeBased: false, trackingMode: 'compact', rirTarget: 2,
  restSeconds: 90, notes: null, exerciseName: 'Extensora', laterality: 'unilateral',
  unilateralAsymmetric: true, loadPerSide: false, equipment: null, ...patch,
})

const session = (id: string, startedAt: string, items = [item()]): WorkoutSession => ({
  ...base, id, programId: 'p', templateId: 't', cycleNumber: 1, blockNumber: 1, periodNumber: 1,
  status: 'concluida', startedAt, endedAt: startedAt, autoClosedAt: null, notes: null,
  planSnapshot: { version: 1, capturedAt: startedAt, templateId: 't', templateName: 'Treino A', items },
})

/** Uma série com os dois lados: duas linhas, o mesmo índice. */
const bothSides = (sessionId: string, setIndex: number, patch: Partial<SetLog> = {}): SetLog[] =>
  (['D', 'E'] as const).map((side) => ({
    ...base, id: `${sessionId}-${setIndex}-${side}`, sessionId, templateItemId: 'item',
    exerciseId: 'extensora', setIndex, isWarmup: false, side, weightKg: 30, plateCount: null,
    reps: 12, seconds: null, rir: 2, skipped: false, hadPain: false, completedAt: startedAtOf(sessionId),
    ...patch,
  }))

const startedAtOf = (sessionId: string) => (sessionId === 'hoje' ? '2026-09-21T10:00:00Z' : '2026-09-14T10:00:00Z')

const threeSets = (sessionId: string, patch: Partial<SetLog> = {}) =>
  [0, 1, 2].flatMap((setIndex) => bothSides(sessionId, setIndex, patch))

const logged = (sets: SetLog[]) => sets.map((set) => ({
  templateItemId: set.templateItemId, setIndex: set.setIndex, isWarmup: set.isWarmup, skipped: set.skipped,
}))

const plan = [{ id: 'item', sets: 3, restSeconds: null }]

describe('contagem na sessão ao vivo', () => {
  it('seis linhas de três séries continuam sendo três séries', () => {
    expect(countSets(threeSets('hoje'))).toBe(3)
    expect(sessionProgress(plan, logged(threeSets('hoje')))).toEqual({ done: 3, planned: 3, remaining: 0 })
  })

  it('o exercício só fecha quando as três séries têm os dois lados', () => {
    const twoSets = [0, 1].flatMap((index) => bothSides('hoje', index))
    expect(exerciseExecutionStatus(plan[0]!, logged(twoSets))).toBe('pending')
    expect(exerciseProgress(plan, logged(twoSets))).toMatchObject({ done: 0, remaining: 1 })
    expect(exerciseExecutionStatus(plan[0]!, logged(threeSets('hoje')))).toBe('done')
  })

  it('a próxima série é a seguinte, não a metade do caminho', () => {
    const twoSets = [0, 1].flatMap((index) => bothSides('hoje', index))
    expect(nextSlot(plan, logged(twoSets))).toEqual({ itemIndex: 0, setIndex: 2 })
    expect(nextSlot(plan, logged(threeSets('hoje')))).toBeNull()
  })
})

describe('contagem nos relatórios', () => {
  const today = session('hoje', '2026-09-21T10:00:00Z')

  it('séries de trabalho e prescrição contam séries, não linhas', () => {
    const report = buildTrainingReport([today], threeSets('hoje'), [], [])
    expect(report).toMatchObject({ workingSets: 3, onPrescription: 1 })
    expect(report.exercises[0]).toMatchObject({ workingSets: 3, plannedSets: 3 })
  })

  it('metade das séries não passa como prescrição cumprida', () => {
    const twoSets = [0, 1].flatMap((index) => bothSides('hoje', index))
    expect(buildTrainingReport([today], twoSets, [], []).onPrescription).toBe(0)
  })

  it('os dois lados fora da faixa são uma série fora da faixa', () => {
    const sets = [...bothSides('hoje', 0, { reps: 20 }), ...bothSides('hoje', 1), ...bothSides('hoje', 2)]
    expect(buildTrainingReport([today], sets, [], []).exercises[0]!.offPrescriptionSets).toBe(1)
  })

  it('repetições e volume somam os dois lados: o trabalho foi feito duas vezes', () => {
    const report = buildTrainingReport([today], threeSets('hoje'), [], [])
    expect(report.exercises[0]).toMatchObject({ repetitions: 72, volumeKg: 2160 })
  })

  it('a comparação com a última vez diz 3×12, não 6×12', () => {
    const before = session('antes', '2026-09-14T10:00:00Z')
    const review = progressReview(today, [before, today], [...threeSets('hoje'), ...threeSets('antes')])
    expect(review.get('extensora')!.current).toMatchObject({ workingSets: 3, low: 12, high: 12 })
    expect(review.get('extensora')!.previous).toMatchObject({ workingSets: 3 })
  })

  it('a assimetria aparece na faixa da comparação', () => {
    const sets = [0, 1, 2].flatMap((index) => [
      ...bothSides('hoje', index).slice(0, 1),
      { ...bothSides('hoje', index)[1]!, reps: 9 },
    ])
    expect(progressReview(today, [today], sets).get('extensora')!.current)
      .toMatchObject({ workingSets: 3, low: 9, high: 12 })
  })

  it('a história do exercício e o gráfico do ciclo contam séries', () => {
    const history = exerciseSessionHistory('extensora', null, [today], threeSets('hoje'), [])
    expect(history[0]).toMatchObject({ workingSets: 3, bestReps: 12 })
    expect(workingSetsByCycle([today], threeSets('hoje'), 2, 2)).toEqual([{ label: 'C1', value: 3 }])
  })
})
