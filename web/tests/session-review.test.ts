import { describe, expect, it } from 'vitest'
import { progressReview } from '../src/lib/domain/session-review.js'
import type { PlanSnapshotItem, SetLog, WorkoutSession } from '../src/lib/types.js'

const base = { ownerId: 'owner', updatedAt: '2026-09-01T00:00:00Z', deletedAt: null }

const PINO = { id: 'pino', name: 'Leg horizontal', loadType: 'pino', incrementKg: null, plateTable: [45, 50, 55, 60, 65, 70] }

const item = (patch: Partial<PlanSnapshotItem> = {}): PlanSnapshotItem => ({
  ...base, id: 'item', templateId: 'a', position: 0, exerciseId: 'leg', sets: 3,
  repMin: 8, repMax: 12, isTimeBased: false, trackingMode: 'compact', rirTarget: 2,
  restSeconds: 90, notes: null, exerciseName: 'Leg horizontal', laterality: 'bilateral',
  unilateralAsymmetric: false, loadPerSide: true, equipment: PINO, ...patch,
})

const session = (id: string, startedAt: string, items = [item()]): WorkoutSession => ({
  ...base, id, programId: 'p', templateId: 'a', cycleNumber: 1, blockNumber: 1, periodNumber: 1,
  status: 'concluida', startedAt, endedAt: null, autoClosedAt: null, notes: null,
  planSnapshot: { version: 1, capturedAt: startedAt, templateId: 'a', templateName: 'Treino A', items },
})

const set = (sessionId: string, setIndex: number, patch: Partial<SetLog> = {}): SetLog => ({
  ...base, id: `${sessionId}-${setIndex}-${patch.exerciseId ?? 'leg'}`, sessionId, templateItemId: 'item',
  exerciseId: 'leg', setIndex, isWarmup: false, side: 'ambos', weightKg: 60, plateCount: 4, reps: 12,
  seconds: null, rir: 2, skipped: false, hadPain: false, completedAt: null, ...patch,
})

const today = session('hoje', '2026-09-20T10:00:00Z')
const before = session('antes', '2026-09-13T10:00:00Z')

const threeSets = (sessionId: string, patch: Partial<SetLog> = {}) =>
  [0, 1, 2].map((index) => set(sessionId, index, patch))

describe('comparação com a sessão anterior do mesmo treino', () => {
  it('resume hoje e a última vez, cada uma com a sua carga e esforço', () => {
    const review = progressReview(today, [before, today], [
      ...threeSets('hoje'),
      ...threeSets('antes', { weightKg: 55, plateCount: 3, rir: 4 }),
    ])

    expect(review.get('leg')).toMatchObject({
      loadPerSide: true,
      current: { startedAt: '2026-09-20T10:00:00Z', workingSets: 3, topLoadKg: 60, plate: 4, low: 12, high: 12, worstRir: 2 },
      previous: { startedAt: '2026-09-13T10:00:00Z', workingSets: 3, topLoadKg: 55, plate: 3, worstRir: 4 },
    })
  })

  it('a faixa das repetições guarda o mínimo e o máximo, não a média', () => {
    const review = progressReview(today, [today], [
      set('hoje', 0, { reps: 12 }), set('hoje', 1, { reps: 10 }), set('hoje', 2, { reps: 11 }),
    ])

    expect(review.get('leg')!.current).toMatchObject({ low: 10, high: 12 })
  })

  it('o pior esforço vence a média: uma série em muito pesado aparece', () => {
    const review = progressReview(today, [today], [
      set('hoje', 0, { rir: 4 }), set('hoje', 1, { rir: 4 }), set('hoje', 2, { rir: 0 }),
    ])

    expect(review.get('leg')!.current.worstRir).toBe(0)
  })

  it('sessão de outro treino não vira "a anterior"', () => {
    const other = { ...session('outro', '2026-09-18T10:00:00Z'), templateId: 'b' }
    const review = progressReview(today, [other, today], [...threeSets('hoje'), ...threeSets('outro')])

    expect(review.get('leg')!.previous).toBeNull()
  })

  it('exercício sem registro hoje fica de fora da decisão', () => {
    const review = progressReview(today, [before, today], threeSets('antes'))

    expect(review.has('leg')).toBe(false)
  })

  it('aquecimento e série pulada não entram na exposição', () => {
    const review = progressReview(today, [today], [
      set('hoje', 0, { isWarmup: true, weightKg: 100 }),
      set('hoje', 1, { skipped: true, weightKg: 100 }),
      set('hoje', 2, { weightKg: 60 }),
    ])

    expect(review.get('leg')!.current).toMatchObject({ workingSets: 1, topLoadKg: 60 })
  })
})

describe('decisão de progressão e carga da próxima vez', () => {
  it('fechou o topo da faixa em moderado: sobe para a próxima placa', () => {
    const review = progressReview(today, [before, today], [
      ...threeSets('hoje', { reps: 12, rir: 2 }),
      ...threeSets('antes', { reps: 12, rir: 2, weightKg: 55, plateCount: 3 }),
    ])

    expect(review.get('leg')).toMatchObject({ action: 'increase', suggested: { plate: 5, kg: 65 } })
  })

  it('pesado em duas sessões seguidas: reduz uma placa', () => {
    const review = progressReview(today, [before, today], [
      ...threeSets('hoje', { rir: 1 }),
      ...threeSets('antes', { rir: 1 }),
    ])

    expect(review.get('leg')).toMatchObject({ action: 'reduce', suggested: { plate: 3, kg: 55 } })
  })

  it('manter não sugere carga: repetir o número de hoje só seria ruído', () => {
    const review = progressReview(today, [before, today], [
      ...threeSets('hoje', { reps: 10, rir: 2 }),
      ...threeSets('antes', { reps: 10, rir: 2 }),
    ])

    expect(review.get('leg')).toMatchObject({ action: 'progress_reps', suggested: null })
  })

  it('sem equipamento cadastrado não inventa carga que a máquina não tem', () => {
    const plan = [item({ equipment: null })]
    const naked = { ...today, planSnapshot: { ...today.planSnapshot!, items: plan } }
    const review = progressReview(naked, [naked], threeSets('hoje', { reps: 12, rir: 2 }))

    expect(review.get('leg')).toMatchObject({ action: 'increase', suggested: null })
  })

  it('exercício por tempo decide pelos segundos, não pelas repetições', () => {
    const plan = [item({ isTimeBased: true, repMin: 30, repMax: 45, equipment: null })]
    const timed = { ...today, planSnapshot: { ...today.planSnapshot!, items: plan } }
    const review = progressReview(timed, [timed], threeSets('hoje', { reps: null, seconds: 45, rir: 2 }))

    expect(review.get('leg')).toMatchObject({ metric: 'seconds', action: 'increase', current: { low: 45, high: 45 } })
  })

  it('o mesmo exercício prescrito duas vezes rende uma linha só', () => {
    const plan = [item(), item({ id: 'item-again', position: 1 })]
    const twice = { ...today, planSnapshot: { ...today.planSnapshot!, items: plan } }
    const review = progressReview(twice, [twice], threeSets('hoje'))

    expect([...review.keys()]).toEqual(['leg'])
  })
})
