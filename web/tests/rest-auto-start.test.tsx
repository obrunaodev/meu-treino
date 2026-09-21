import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const OWNER = '00000000-0000-7000-8000-000000000051'

vi.mock('../src/lib/auth.js', () => ({ useAuth: () => ({ user: { id: OWNER } }) }))

const { localDb } = await import('../src/lib/db.js')
const { SessionExerciseFlow } = await import('../src/components/SessionExerciseChecklist.js')

const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }
const item = {
  ...base, id: 'item-a', templateId: 'treino-a', exerciseId: 'supino', position: 0, sets: 3,
  repMin: 8, repMax: 12, rirTarget: 2, isTimeBased: false, trackingMode: 'compact' as const,
  restSeconds: null, notes: null,
}

async function seed(restAutoStart: boolean) {
  await localDb.table_('exercises').put({
    ...base, id: 'supino', name: 'Supino reto', cues: [], equipmentId: null, catalogExerciseId: null, loadPerSide: false,
  } as never)
  await localDb.table_('workout_sessions').put({
    ...base, id: 'hoje', programId: 'p', templateId: 'treino-a', status: 'em_andamento',
    startedAt: new Date().toISOString(), planSnapshot: null,
  } as never)
  await localDb.table_('user_settings').put({
    // A unidade é o que a preferência muda na tela, e é por ela que o teste
    // sabe que ela chegou. 'kg' seria indistinguível do padrão de antes dela.
    ...base, id: 'settings', unit: 'lb', showPlates: true, theme: 'dark', locale: 'pt-BR',
    remindersEnabled: false, restAutoStart, onboardedAt: null,
  } as never)
}

const onRest = vi.fn()
const onContinue = vi.fn()

function renderFlow(activeRestAfter: number | null = null) {
  render(
    <SessionExerciseFlow
      sessionId="hoje" item={item} index={0} logs={[]} activeRestAfter={activeRestAfter}
      restSeconds={90} restRemaining={0} onRest={onRest} onContinue={onContinue} onDone={vi.fn()}
    />,
  )
}

const check = (n: number) => fireEvent.click(screen.getByRole('button', { name: `Marcar série ${n} como concluída` }))

/**
 * A preferência vem do IndexedDB por consulta viva: sem esperar, o clique
 * acontece antes dela chegar. Um tempo fixo perde essa corrida quando a suíte
 * roda sob carga, então o teste espera o valor aparecer de verdade — o sufixo
 * da carga só vira 'lb' depois que a preferência chega.
 */
const settingsLoaded = () => screen.findAllByText('lb')

beforeEach(async () => {
  onRest.mockClear()
  onContinue.mockClear()
  await localDb.delete()
  await localDb.open()
})

afterEach(() => cleanup())

describe('descanso automático ao marcar a série', () => {
  it('ligado: marcar uma série do meio inicia o intervalo dela', async () => {
    await seed(true)
    renderFlow()
    await settingsLoaded()

    check(1)
    expect(onRest).toHaveBeenCalledWith(0)
  })

  it('ligado: a última série não abre intervalo', async () => {
    await seed(true)
    renderFlow()
    await settingsLoaded()

    check(3)
    expect(onRest).not.toHaveBeenCalled()
  })

  it('ligado: desmarcar a série que está descansando encerra o intervalo', async () => {
    await seed(true)
    renderFlow(0)
    await settingsLoaded()

    check(1)
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar série 1' }))
    expect(onContinue).toHaveBeenCalled()
  })

  it('desligado: marcar não mexe no descanso', async () => {
    await seed(false)
    renderFlow()
    await settingsLoaded()

    check(1)
    expect(onRest).not.toHaveBeenCalled()
    expect(onContinue).not.toHaveBeenCalled()
  })
})
