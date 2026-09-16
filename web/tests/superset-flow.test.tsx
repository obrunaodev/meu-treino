import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const OWNER = '00000000-0000-7000-8000-000000000061'

// Só a identidade vem simulada: o que o bloco grava é o IndexedDB real.
vi.mock('../src/lib/auth.js', () => ({ useAuth: () => ({ user: { id: OWNER } }) }))

const { localDb } = await import('../src/lib/db.js')
const { SessionSupersetFlow } = await import('../src/components/SessionSupersetFlow.js')
const { SessionExerciseChecklist } = await import('../src/components/SessionExerciseChecklist.js')

const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }
const itemBase = {
  ...base, templateId: 'treino-a', position: 0, repMin: 8, repMax: 12, rirTarget: 2,
  isTimeBased: false, trackingMode: 'compact' as const, restSeconds: null, notes: null,
  supersetGroup: 'item-a',
}
const supino = { ...itemBase, id: 'item-a', exerciseId: 'supino', sets: 2 }
const remada = { ...itemBase, id: 'item-b', exerciseId: 'remada', position: 1, sets: 2 }
const agacho = { ...itemBase, id: 'item-c', exerciseId: 'agacho', position: 2, sets: 2, supersetGroup: null }

async function seed() {
  for (const [id, name] of [['supino', 'Supino reto'], ['remada', 'Remada curvada'], ['agacho', 'Agachamento']]) {
    await localDb.table_('exercises').put({
      ...base, id, name, cues: [], equipmentId: null, catalogExerciseId: null, loadPerSide: false,
    } as never)
  }
  await localDb.table_('workout_sessions').put({
    ...base, id: 'hoje', programId: 'p', templateId: 'treino-a', status: 'em_andamento',
    startedAt: new Date().toISOString(), planSnapshot: null,
  } as never)
  await localDb.table_('user_settings').put({
    ...base, id: 'settings', unit: 'kg', showPlates: true, theme: 'dark', locale: 'pt-BR',
    remindersEnabled: false, restAutoStart: false, onboardedAt: null,
  } as never)
}

const onDone = vi.fn()

async function renderFlow(logs: unknown[] = []) {
  render(
    <SessionSupersetFlow
      sessionId="hoje" items={[supino, remada]} index={0} logs={logs as never} activeRound={null}
      restSeconds={90} restRemaining={0} onRest={vi.fn()} onContinue={vi.fn()} onDone={onDone}
    />,
  )
  // As preferências e o histórico chegam do IndexedDB depois do primeiro render.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
}

const checkNames = () => screen.getAllByRole('button', { name: /^Marcar série/ }).map((button) => button.getAttribute('aria-label'))

const skippedLogs = (itemId: string, sets: number) => Array.from({ length: sets }, (_, setIndex) => ({
  ...base, id: `${itemId}-pulada-${setIndex}`, sessionId: 'hoje', templateItemId: itemId, exerciseId: 'x',
  setIndex, isWarmup: false, side: 'ambos', weightKg: null, plateCount: null, reps: null, seconds: null,
  rir: null, skipped: true,
}))

beforeEach(async () => {
  onDone.mockClear()
  await localDb.delete()
  await localDb.open()
  await seed()
})

afterEach(() => cleanup())

describe('bi-set ao vivo', () => {
  it('as séries dos dois exercícios se alternam, rodada a rodada', async () => {
    await renderFlow()

    expect(checkNames()).toEqual([
      'Marcar série 1 de Supino reto como concluída',
      'Marcar série 1 de Remada curvada como concluída',
      'Marcar série 2 de Supino reto como concluída',
      'Marcar série 2 de Remada curvada como concluída',
    ])
  })

  it('o intervalo fica no fim da rodada, não entre os dois exercícios', async () => {
    await renderFlow()

    expect(screen.getAllByRole('button', { name: /Iniciar intervalo/ }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['Iniciar intervalo após a rodada 1'])
  })

  it('finalizar grava as séries dos dois membros de uma vez', async () => {
    await renderFlow()
    for (const label of checkNames()) fireEvent.click(screen.getByRole('button', { name: label! }))

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar bloco' }))

    await waitFor(async () => {
      const logs = await localDb.table_('set_logs').toArray()
      expect(logs).toHaveLength(4)
    })
    const logs = await localDb.table_('set_logs').toArray()
    expect(logs.filter((log: never) => (log as { templateItemId: string }).templateItemId === 'item-a')).toHaveLength(2)
    expect(logs.filter((log: never) => (log as { templateItemId: string }).templateItemId === 'item-b')).toHaveLength(2)
    expect(onDone).toHaveBeenCalled()
  })

  it('membro pulado sai das rodadas e o outro segue sozinho', async () => {
    await renderFlow(skippedLogs('item-b', 2))

    expect(checkNames()).toEqual([
      'Marcar série 1 de Supino reto como concluída',
      'Marcar série 2 de Supino reto como concluída',
    ])
    expect(screen.getByText('Remada curvada').closest('li')).toHaveClass('session-superset__member--skipped')
  })

  it('pular um membro não apaga o que o outro já tinha registrado', async () => {
    await renderFlow()

    fireEvent.click(screen.getByRole('button', { name: 'pular Remada curvada' }))

    await waitFor(async () => {
      const logs = await localDb.table_('set_logs').toArray()
      expect(logs).toHaveLength(2)
    })
    const logs = await localDb.table_('set_logs').toArray()
    expect(logs.every((log: never) => (log as { skipped: boolean; templateItemId: string }).skipped
      && (log as { templateItemId: string }).templateItemId === 'item-b')).toBe(true)
  })
})

describe('bi-set na lista de exercícios', () => {
  const renderList = async (logs: unknown[] = []) => {
    render(<SessionExerciseChecklist sessionId="hoje" items={[supino, remada, agacho]} logs={logs as never} onSelect={vi.fn()} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
  }

  it('os membros do grupo ficam juntos, sob o rótulo do bloco', async () => {
    await renderList()

    const block = screen.getByText('Bi-set').closest('li')!
    expect(within(block).getByText('Supino reto')).toBeInTheDocument()
    expect(within(block).getByText('Remada curvada')).toBeInTheDocument()
    expect(within(block).queryByText('Agachamento')).not.toBeInTheDocument()
  })

  it('membro pulado vai para a sua seção sem perder o rótulo do bloco', async () => {
    await renderList(skippedLogs('item-b', 2))

    const labels = screen.getAllByText('Bi-set')
    expect(labels).toHaveLength(2)
    expect(within(labels[0]!.closest('li')!).getByText('Supino reto')).toBeInTheDocument()
    expect(within(labels[1]!.closest('li')!).getByText('Remada curvada')).toBeInTheDocument()
  })
})
