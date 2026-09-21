import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '../src/lib/i18n'
import { localDb } from '../src/lib/db.js'
import { SessionDetail } from '../src/pages/SessionDetail.js'

const OWNER = '00000000-0000-7000-8000-000000000081'
const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }

/** Leg horizontal numa coluna de pino: subir é ir para a placa seguinte. */
const PINO = { id: 'pino', name: 'Leg horizontal', loadType: 'pino', incrementKg: null, plateTable: [45, 50, 55, 60, 65, 70] }

const planItem = {
  ...base, id: 'item', templateId: 't', position: 0, exerciseId: 'leg', sets: 3, repMin: 8, repMax: 12,
  isTimeBased: false, trackingMode: 'compact', rirTarget: 2, restSeconds: 90, notes: null,
  exerciseName: 'Leg horizontal', laterality: 'bilateral', unilateralAsymmetric: false,
  loadPerSide: true, equipment: PINO,
}

async function seedSession(id: string, startedAt: string, sets: Array<Record<string, unknown>>) {
  await localDb.table_('workout_sessions').put({
    ...base, id, programId: 'p', templateId: 't', cycleNumber: 1, blockNumber: 1, periodNumber: 1,
    status: 'concluida', startedAt, endedAt: startedAt, autoClosedAt: null, notes: null,
    planSnapshot: { version: 1, capturedAt: startedAt, templateId: 't', templateName: 'Treino A', items: [planItem] },
  } as never)
  for (const [index, patch] of sets.entries()) {
    await localDb.table_('set_logs').put({
      ...base, id: `${id}-${index}`, sessionId: id, templateItemId: 'item', exerciseId: 'leg', setIndex: index,
      isWarmup: false, side: 'ambos', weightKg: 60, plateCount: 4, reps: 12, seconds: null, rir: 2,
      skipped: false, hadPain: false, completedAt: startedAt, ...patch,
    } as never)
  }
}

async function seed() {
  await localDb.table_('programs').put({
    ...base, id: 'p', name: 'Programa', scheduleMode: 'weekly', sessionsPerCycle: 2, cyclesPerBlock: 2,
    weekdays: [1, 3, 5], isActive: true, defaultRestSeconds: 90, startedAt: '2026-08-01T00:00:00.000Z',
  } as never)
  await localDb.table_('exercises').put({
    ...base, id: 'leg', name: 'Leg horizontal', cues: [], equipmentId: 'pino',
    catalogExerciseId: null, loadPerSide: true,
  } as never)
  await localDb.table_('user_settings').put({
    ...base, id: 'settings', unit: 'kg', showPlates: true, theme: 'dark', locale: 'pt-BR',
    remindersEnabled: false, restAutoStart: false, onboardedAt: null,
  } as never)
}

function renderReport() {
  return render(
    <MemoryRouter initialEntries={['/history/hoje']}>
      <Routes><Route path="/history/:sessionId" element={<SessionDetail />} /></Routes>
    </MemoryRouter>,
  )
}

const progressBlock = async () => (await screen.findByText('Hoje')).closest('.report-progress') as HTMLElement

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
  await seed()
})

afterEach(() => cleanup())

describe('relatório da sessão como instrumento de decisão', () => {
  it('compara hoje com a última vez do mesmo treino e sugere a carga seguinte', async () => {
    const lastTime = Array.from({ length: 3 }, () => ({ weightKg: 55, plateCount: 3 }))
    await seedSession('antes', '2026-09-14T10:00:00.000Z', lastTime)
    await seedSession('hoje', '2026-09-21T10:00:00.000Z', [{}, {}, {}])
    renderReport()

    const block = await progressBlock()
    expect(within(block).getByText(/60 kg\/lado · 3×12 · Moderado/)).toBeInTheDocument()
    expect(within(block).getByText(/55 kg\/lado · 3×12 · Moderado/)).toBeInTheDocument()
    expect(within(block).getByText(/Sugestão: subir a carga → 65 kg\/lado · placa 5/)).toBeInTheDocument()
  })

  it('primeira vez no treino não inventa uma comparação', async () => {
    await seedSession('hoje', '2026-09-21T10:00:00.000Z', [{}, {}, {}])
    renderReport()

    const block = await progressBlock()
    expect(within(block).getByText('primeira vez neste treino')).toBeInTheDocument()
  })

  it('o pior esforço aparece, e a série em muito pesado fica marcada', async () => {
    await seedSession('hoje', '2026-09-21T10:00:00.000Z', [{}, {}, { rir: 0 }])
    renderReport()

    const totals = (await screen.findByText('Pior esforço')).closest('div')!
    expect(within(totals).getByText('Muito pesado')).toBeInTheDocument()
    expect(screen.getAllByText('Muito pesado').length).toBeGreaterThan(1)
  })

  it('repetição acima da faixa derruba a prescrição sem mexer na aderência', async () => {
    await seedSession('hoje', '2026-09-21T10:00:00.000Z', [{}, {}, { reps: 20 }])
    renderReport()

    const prescription = (await screen.findByText('Na prescrição')).closest('.report-metric')!
    expect(within(prescription).getByText('0/1')).toBeInTheDocument()
    expect(screen.getByText('1 série fora da faixa', { exact: false })).toBeInTheDocument()
    const adherence = screen.getByText('Aderência').closest('.report-metric')!
    expect(within(adherence).getByText('100%')).toBeInTheDocument()
  })

  it('o cabeçalho diz a posição no bloco, o intervalo e a semana', async () => {
    await seedSession('antes', '2026-09-14T10:00:00.000Z', [{}, {}, {}])
    await seedSession('hoje', '2026-09-21T10:00:00.000Z', [{}, {}, {}])
    renderReport()

    expect(await screen.findByText('Bloco 1 · sessão 2 de 4')).toBeInTheDocument()
    expect(screen.getByText(/7 dias desde o treino anterior · 1 de 3 nesta semana/)).toBeInTheDocument()
  })
})
