import { describe, expect, it } from 'vitest'
import { buildTrainingReport } from '../src/lib/domain/training-report.js'
import type { SetLog, WorkoutSession } from '../src/lib/types.js'

const base = { ownerId: 'owner', updatedAt: '2026-09-01T00:00:00Z' }
const session = {
  ...base, id: 'session', programId: 'program', templateId: 'a', cycleNumber: 1,
  blockNumber: 1, periodNumber: 1, status: 'concluida', startedAt: '2026-09-01T10:00:00Z',
  endedAt: '2026-09-01T11:00:00Z', autoClosedAt: null, notes: null,
  planSnapshot: {
    version: 1, capturedAt: '2026-09-01T10:00:00Z', templateId: 'a', templateName: 'Treino A',
    items: [{ ...base, id: 'item', templateId: 'a', position: 0, exerciseId: 'exercise', sets: 2,
      repMin: 10, repMax: 12, isTimeBased: false, trackingMode: 'full', rirTarget: 2,
      restSeconds: 60, notes: null, exerciseName: 'Supino', laterality: 'bilateral',
      unilateralAsymmetric: false, loadPerSide: true, equipment: null }],
  },
} satisfies WorkoutSession

const set = (id: string, patch: Partial<SetLog> = {}): SetLog => ({
  ...base, id, sessionId: 'session', templateItemId: 'item', exerciseId: 'exercise', setIndex: 0,
  isWarmup: false, side: 'ambos', weightKg: 50, plateCount: null, reps: 10, seconds: null,
  rir: 2, skipped: false, hadPain: false, completedAt: '2026-09-01T10:30:00Z', ...patch,
})

describe('buildTrainingReport', () => {
  it('resume duração, aderência, volume bilateral e esforço', () => {
    const report = buildTrainingReport([session], [set('one'), set('two', { setIndex: 1, reps: 12, rir: 1 })], [], [])
    expect(report).toMatchObject({ durationSeconds: 3600, adherence: 100, workingSets: 2, volumeKg: 2200 })
    expect(report.exercises[0]).toMatchObject({ name: 'Supino', repetitions: 22, worstRir: 1 })
    expect(report.exercises[0].sets).toEqual([
      expect.objectContaining({ id: 'one', sessionName: 'Treino A', setIndex: 0, reps: 10, weightKg: 50 }),
      expect.objectContaining({ id: 'two', sessionName: 'Treino A', setIndex: 1, reps: 12, rir: 1 }),
    ])
  })

  it('separa aquecimento, cardio e dor do volume de trabalho', () => {
    const report = buildTrainingReport(
      [session], [set('warmup', { isWarmup: true }), set('skip', { skipped: true })],
      [{ ...base, id: 'cardio', sessionId: 'session', cardioOptionId: null, modality: 'Esteira',
        durationSeconds: 1200, perceivedIntensity: 'leve', distanceKm: 2.5, avgHeartRate: null, notes: null }],
      [{ ...base, id: 'pain', sessionId: 'session', setLogId: null, regionSlug: 'ombro', level: 4,
        note: null, occurredAt: '2026-09-01T10:30:00Z' }],
    )
    expect(report).toMatchObject({ workingSets: 0, warmupSets: 1, volumeKg: 0, cardioSeconds: 1200, painEvents: 1, worstPain: 4 })
  })

  it('mede aderência por exercício planejado em cada sessão', () => {
    const second = { ...session, id: 'second', startedAt: '2026-09-03T10:00:00Z', endedAt: '2026-09-03T11:00:00Z' }
    const report = buildTrainingReport([session, second], [set('only-first')], [], [])
    expect(report).toMatchObject({ plannedExercises: 2, completedExercises: 1, adherence: 50 })
  })
})

describe('sinais que decidem o ajuste', () => {
  it('o pior esforço vence a média: uma série em muito pesado não some', () => {
    const report = buildTrainingReport([session], [set('one', { rir: 4 }), set('two', { setIndex: 1, rir: 0 })], [], [])
    expect(report.exercises[0]!.worstRir).toBe(0)
  })

  it('conta as séries fora da faixa prescrita', () => {
    const report = buildTrainingReport([session], [set('one', { reps: 10 }), set('two', { setIndex: 1, reps: 20 })], [], [])
    expect(report.exercises[0]!.offPrescriptionSets).toBe(1)
  })

  it('a carga mais pesada guarda a base em que foi registrada', () => {
    const report = buildTrainingReport([session], [set('one')], [], [])
    expect(report.exercises[0]).toMatchObject({ maxWeightKg: 50, maxLoadPerSide: true })
  })

  it('entre sessões, a mais pesada é a que moveu mais peso', () => {
    const plan = session.planSnapshot.items[0]!
    const bilateral = {
      ...session, id: 'second', startedAt: '2026-09-03T10:00:00Z', endedAt: '2026-09-03T11:00:00Z',
      planSnapshot: { ...session.planSnapshot, items: [{ ...plan, loadPerSide: false }] },
    }
    // 50/lado são 100 kg movidos e vencem os 80 kg totais da outra sessão.
    const report = buildTrainingReport([session, bilateral], [
      set('per-side'), set('total', { id: 'total', sessionId: 'second', weightKg: 80 }),
    ], [], [])
    expect(report.exercises[0]).toMatchObject({ maxWeightKg: 50, maxLoadPerSide: true })
  })
})

describe('aderência à prescrição', () => {
  it('fechar as séries dentro da faixa conta como prescrito', () => {
    const report = buildTrainingReport([session], [set('one'), set('two', { setIndex: 1, reps: 12 })], [], [])
    expect(report).toMatchObject({ adherence: 100, onPrescription: 1, plannedExercises: 1 })
  })

  it('repetição acima da faixa não conta, mesmo com aderência cheia', () => {
    const report = buildTrainingReport([session], [set('one'), set('two', { setIndex: 1, reps: 20 })], [], [])
    expect(report).toMatchObject({ adherence: 100, onPrescription: 0 })
  })

  it('série a menos não conta: a prescrição pedia duas', () => {
    const report = buildTrainingReport([session], [set('one')], [], [])
    expect(report).toMatchObject({ adherence: 100, onPrescription: 0 })
  })

  it('exercício por tempo é medido em segundos', () => {
    const plan = session.planSnapshot.items[0]!
    const timed = {
      ...session,
      planSnapshot: { ...session.planSnapshot, items: [{ ...plan, isTimeBased: true, repMin: 30, repMax: 45 }] },
    }
    const held = (id: string, seconds: number, setIndex = 0) => set(id, { setIndex, reps: null, seconds })
    expect(buildTrainingReport([timed], [held('one', 40), held('two', 45, 1)], [], []).onPrescription).toBe(1)
    expect(buildTrainingReport([timed], [held('one', 40), held('two', 60, 1)], [], []).onPrescription).toBe(0)
  })
})
