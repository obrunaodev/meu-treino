import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const OWNER = '00000000-0000-7000-8000-000000000041'

// Só a identidade vem simulada; o histórico que o recorde precisa bater é o IndexedDB real.
vi.mock('../src/lib/auth.js', () => ({ useAuth: () => ({ user: { id: OWNER } }) }))

const { localDb } = await import('../src/lib/db.js')
const { SessionExerciseFlow } = await import('../src/components/SessionExerciseChecklist.js')

const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }
const item = {
  ...base, id: 'item-a', templateId: 'treino-a', exerciseId: 'supino', position: 0, sets: 2,
  repMin: 8, repMax: 12, rirTarget: 2, isTimeBased: false, trackingMode: 'compact' as const,
  restSeconds: null, notes: null,
}

async function seed({ withHistory }: { withHistory: boolean }) {
  await localDb.table_('exercises').put({
    ...base, id: 'supino', name: 'Supino reto', cues: [], equipmentId: null, catalogExerciseId: null, loadPerSide: false,
  } as never)
  await localDb.table_('workout_sessions').put({
    ...base, id: 'hoje', programId: 'p', templateId: 'treino-a', status: 'em_andamento', startedAt: new Date().toISOString(), planSnapshot: null,
  } as never)
  if (!withHistory) return
  await localDb.table_('workout_sessions').put({
    ...base, id: 'antes', programId: 'p', templateId: 'treino-a', status: 'concluida', startedAt: '2026-08-01T12:00:00.000Z', planSnapshot: null,
  } as never)
  await localDb.table_('set_logs').put({
    ...base, id: 'serie-antes', sessionId: 'antes', templateItemId: 'item-a', exerciseId: 'supino', setIndex: 0,
    isWarmup: false, side: 'ambos', weightKg: 70, plateCount: null, reps: 10, seconds: null, rir: 2, skipped: false,
  } as never)
}

function renderFlow() {
  render(
    <SessionExerciseFlow
      sessionId="hoje" item={item} index={0} logs={[]} activeRestAfter={null}
      restSeconds={90} restRemaining={0} onRest={vi.fn()} onContinue={vi.fn()} onDone={vi.fn()}
    />,
  )
}

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

afterEach(() => cleanup())

describe('recorde durante o registro', () => {
  it('marca a série que passa da carga de sempre, só depois de marcada', async () => {
    await seed({ withHistory: true })
    renderFlow()
    const [firstLoad] = await screen.findAllByRole('spinbutton', { name: /carga/i })
    await waitFor(() => expect(firstLoad).toHaveValue(70))

    fireEvent.change(firstLoad!, { target: { value: '72.5' } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar série 1 como concluída' }))
    expect(await screen.findByText('Recorde: maior carga · 1RM estimado')).toBeInTheDocument()
  })

  it('com todas as séries marcadas acima do volume anterior, anuncia o recorde de volume', async () => {
    await seed({ withHistory: true })
    renderFlow()
    await waitFor(() => expect(screen.getAllByRole('spinbutton', { name: /carga/i })[0]).toHaveValue(70))

    fireEvent.click(screen.getByRole('button', { name: 'Marcar série 1 como concluída' }))
    fireEvent.click(screen.getByRole('button', { name: 'Marcar série 2 como concluída' }))
    // 2 × 70 kg × 12 reps prescritas = 1680, contra 700 da sessão anterior.
    expect(await screen.findByText('Recorde: maior volume numa sessão')).toBeInTheDocument()
  })

  it('na primeira vez do exercício não há recorde', async () => {
    await seed({ withHistory: false })
    renderFlow()
    const [firstLoad] = await screen.findAllByRole('spinbutton', { name: /carga/i })

    fireEvent.change(firstLoad!, { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar série 1 como concluída' }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText(/recorde/i)).not.toBeInTheDocument()
  })
})
