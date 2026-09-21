import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const OWNER = '00000000-0000-7000-8000-000000000101'

// Só a identidade vem simulada: o que a sessão grava é o IndexedDB real.
vi.mock('../src/lib/auth.js', () => ({ useAuth: () => ({ user: { id: OWNER } }) }))

const { localDb } = await import('../src/lib/db.js')
const { SessionExerciseFlow } = await import('../src/components/SessionExerciseChecklist.js')

const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }
const item = {
  ...base, id: 'item-a', templateId: 'treino-a', exerciseId: 'extensora', position: 0, sets: 2,
  repMin: 8, repMax: 12, rirTarget: 2, isTimeBased: false, trackingMode: 'compact' as const,
  restSeconds: null, notes: null,
}

async function seed({ asymmetric = true } = {}) {
  await localDb.table_('exercises').put({
    ...base, id: 'extensora', name: 'Extensora', cues: [], equipmentId: null, catalogExerciseId: null,
    loadPerSide: false, laterality: 'unilateral', unilateralAsymmetric: asymmetric,
  } as never)
  await localDb.table_('workout_sessions').put({
    ...base, id: 'hoje', programId: 'p', templateId: 'treino-a', status: 'em_andamento',
    startedAt: new Date().toISOString(), planSnapshot: null,
  } as never)
  await localDb.table_('user_settings').put({
    ...base, id: 'settings', unit: 'kg', showPlates: true, theme: 'dark', locale: 'pt-BR',
    remindersEnabled: false, restAutoStart: false, onboardedAt: null,
  } as never)
}

async function seedPrevious(right: number, left: number) {
  await localDb.table_('workout_sessions').put({
    ...base, id: 'antes', programId: 'p', templateId: 'treino-a', status: 'concluida',
    startedAt: '2026-08-01T12:00:00.000Z', planSnapshot: null,
  } as never)
  for (const [side, weightKg] of [['D', right], ['E', left]] as const) {
    await localDb.table_('set_logs').put({
      ...base, id: `antes-${side}`, sessionId: 'antes', templateItemId: 'item-a', exerciseId: 'extensora',
      setIndex: 0, isWarmup: false, side, weightKg, plateCount: null, reps: 10, seconds: null, rir: 2,
      skipped: false, hadPain: false, completedAt: '2026-08-01T12:30:00.000Z',
    } as never)
  }
}

function renderFlow() {
  render(
    <SessionExerciseFlow
      sessionId="hoje" item={item} index={0} logs={[]} activeRestAfter={null}
      restSeconds={90} restRemaining={0} onRest={vi.fn()} onContinue={vi.fn()} onDone={vi.fn()}
    />,
  )
}

const rows = async () => (await localDb.table_('set_logs').toArray()) as unknown as Array<{
  setIndex: number; side: string; weightKg: number | null; reps: number | null; rir: number | null; isWarmup: boolean
}>

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

afterEach(() => cleanup())

describe('exercício que registra lados separados', () => {
  it('cada série traz carga e resultado dos dois lados, e um esforço só', async () => {
    await seed()
    renderFlow()

    await screen.findAllByRole('spinbutton', { name: /carga · direito/i })
    expect(screen.getAllByRole('spinbutton', { name: /carga · direito/i })).toHaveLength(2)
    expect(screen.getAllByRole('spinbutton', { name: /carga · esquerdo/i })).toHaveLength(2)
    expect(screen.getAllByRole('spinbutton', { name: /reps · esquerdo/i })).toHaveLength(2)
    // Duas séries prescritas, dois cartões: o lado não vira uma série a mais.
    expect(screen.getAllByRole('button', { name: /^Marcar série/ })).toHaveLength(2)
  })

  it('grava duas linhas por série, com o mesmo índice e lados opostos', async () => {
    await seed()
    renderFlow()
    const right = await screen.findAllByRole('spinbutton', { name: /carga · direito/i })
    const left = screen.getAllByRole('spinbutton', { name: /carga · esquerdo/i })
    const leftReps = screen.getAllByRole('spinbutton', { name: /reps · esquerdo/i })

    fireEvent.change(right[0]!, { target: { value: '40' } })
    fireEvent.change(left[0]!, { target: { value: '35' } })
    fireEvent.change(leftReps[0]!, { target: { value: '10' } })
    for (const check of screen.getAllByRole('button', { name: /^Marcar série/ })) fireEvent.click(check)
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar exercício' }))

    await waitFor(async () => expect(await rows()).toHaveLength(4))
    const logged = (await rows()).sort((a, b) => a.setIndex - b.setIndex || a.side.localeCompare(b.side))
    expect(logged.map((row) => [row.setIndex, row.side, row.weightKg, row.reps])).toEqual([
      [0, 'D', 40, 12], [0, 'E', 35, 10],
      [1, 'D', 40, 12], [1, 'E', 35, 12],
    ])
    // O esforço é da série: as duas linhas levam o mesmo.
    expect(logged.every((row) => row.rir === 2)).toBe(true)
  })

  it('cada lado volta pré-preenchido com a carga dele, não com a do lado forte', async () => {
    await seed()
    await seedPrevious(40, 32.5)
    renderFlow()

    const right = await screen.findAllByRole('spinbutton', { name: /carga · direito/i })
    await waitFor(() => expect(right[0]!).toHaveValue(40))
    expect(screen.getAllByRole('spinbutton', { name: /carga · esquerdo/i })[0]!).toHaveValue(32.5)
  })

  it('exercício unilateral sem lados separados continua com um campo por série', async () => {
    await seed({ asymmetric: false })
    renderFlow()

    await screen.findAllByRole('spinbutton', { name: /^carga$/i })
    expect(screen.queryByRole('spinbutton', { name: /carga · direito/i })).not.toBeInTheDocument()
  })

  it('o aquecimento também grava os dois lados, no mesmo índice', async () => {
    await seed()
    renderFlow()
    const right = await screen.findAllByRole('spinbutton', { name: /carga · direito/i })
    fireEvent.change(right[0]!, { target: { value: '20' } })

    fireEvent.click(screen.getByRole('button', { name: '+ aquecimento' }))

    await waitFor(async () => expect(await rows()).toHaveLength(2))
    const warmup = await rows()
    expect(warmup.every((row) => row.isWarmup && row.setIndex === 0)).toBe(true)
    expect(warmup.map((row) => row.side).sort()).toEqual(['D', 'E'])
  })
})
