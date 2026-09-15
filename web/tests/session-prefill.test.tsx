import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const OWNER = '00000000-0000-7000-8000-000000000021'

// Só a identidade vem simulada; sessões, séries e exercícios são o IndexedDB real.
vi.mock('../src/lib/auth.js', () => ({ useAuth: () => ({ user: { id: OWNER } }) }))

const { localDb } = await import('../src/lib/db.js')
const { SessionExerciseChecklist, SessionExerciseFlow } = await import('../src/components/SessionExerciseChecklist.js')

const threeDaysAgo = () => {
  const date = new Date()
  date.setDate(date.getDate() - 3)
  date.setHours(12, 0, 0, 0)
  return date.toISOString()
}

const base = { ownerId: OWNER, updatedAt: new Date().toISOString(), deletedAt: null }
const item = {
  ...base, id: 'item-a', templateId: 'treino-a', exerciseId: 'supino', position: 0, sets: 3,
  repMin: 10, repMax: 12, rirTarget: 2, isTimeBased: false, trackingMode: 'compact' as const,
  restSeconds: null, notes: null,
}

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
  await localDb.table_('exercises').put({
    ...base, id: 'supino', name: 'Supino reto', cues: [], equipmentId: null, catalogExerciseId: null, loadPerSide: false,
  } as never)
  await localDb.table_('workout_sessions').bulkPut([
    {
      ...base, id: 'b1', programId: 'p', templateId: 'treino-b', status: 'concluida', startedAt: threeDaysAgo(),
      planSnapshot: { version: 1, capturedAt: threeDaysAgo(), templateId: 'treino-b', templateName: 'Treino B', items: [] },
    },
    { ...base, id: 'hoje', programId: 'p', templateId: 'treino-a', status: 'em_andamento', startedAt: new Date().toISOString(), planSnapshot: null },
  ] as never)
  await localDb.table_('set_logs').put({
    ...base, id: 'serie-b', sessionId: 'b1', templateItemId: null, exerciseId: 'supino', setIndex: 0,
    isWarmup: false, side: 'ambos', weightKg: 80, plateCount: null, reps: 5, seconds: null, rir: 0, skipped: false,
  } as never)
})

afterEach(() => cleanup())

describe('pré-preenchimento vindo de outro treino', () => {
  it('abre com a carga do outro treino, a repetição prescrita e a origem escrita', async () => {
    render(
      <SessionExerciseFlow
        sessionId="hoje" item={item} index={0} logs={[]} activeRestAfter={null}
        restSeconds={90} restRemaining={0} onRest={vi.fn()} onContinue={vi.fn()} onDone={vi.fn()}
      />,
    )

    expect(await screen.findByText('Carga de Treino B · há 3 dias')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('spinbutton', { name: /carga/i })[0]).toHaveValue(80))
    // 5 repetições pertencem à prescrição do Treino B; aqui vale o topo da faixa deste.
    expect(screen.getAllByRole('spinbutton', { name: /^reps$/i })[0]).toHaveValue(12)
  })

  it('na lista mostra a origem e não dá conselho de progressão com outra faixa', async () => {
    render(<SessionExerciseChecklist sessionId="hoje" items={[item]} logs={[]} onSelect={vi.fn()} />)

    expect(await screen.findByText('Carga de Treino B · há 3 dias')).toBeInTheDocument()
    expect(screen.queryByText(/sugestão/i)).not.toBeInTheDocument()
  })
})
