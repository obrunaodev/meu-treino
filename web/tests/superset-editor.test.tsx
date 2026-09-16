import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const OWNER = '00000000-0000-7000-8000-000000000071'

vi.mock('../src/lib/auth.js', () => ({ useAuth: () => ({ user: { id: OWNER } }) }))

const { localDb } = await import('../src/lib/db.js')
const { Templates } = await import('../src/pages/Templates.js')

const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }
const NAMES = ['Supino reto', 'Remada curvada', 'Agachamento']

async function seed() {
  await localDb.table_('programs').put({
    ...base, id: 'p', name: 'Programa', scheduleMode: 'continuous', sessionsPerCycle: 1,
    cyclesPerBlock: 4, isActive: true, defaultRestSeconds: 90,
  } as never)
  await localDb.table_('templates').put({
    ...base, id: 'treino-a', programId: 'p', position: 0, name: 'Treino A',
    cardioOptionId: null, cardioIntensity: null,
  } as never)
  for (const [position, name] of NAMES.entries()) {
    const id = `ex-${position}`
    await localDb.table_('exercises').put({
      ...base, id, name, cues: [], equipmentId: null, catalogExerciseId: null, loadPerSide: false,
    } as never)
    await localDb.table_('template_items').put({
      ...base, id: `item-${position}`, templateId: 'treino-a', exerciseId: id, position,
      sets: 3, repMin: 8, repMax: 12, rirTarget: 2, isTimeBased: false, trackingMode: 'compact',
      restSeconds: null, notes: null, supersetGroup: null,
    } as never)
  }
}

async function renderPage() {
  render(<MemoryRouter><Templates /></MemoryRouter>)
  // Os exercícios chegam do IndexedDB por consulta viva, depois do primeiro render.
  await screen.findByRole('button', { name: new RegExp(NAMES[0]!) })
}

/** As ações de um exercício ficam dentro da linha, que abre ao clicar no nome. */
function openRow(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
}

const itemsNow = async () => ((await localDb.table_('template_items').toArray()) as unknown as Array<{
  id: string; position: number; supersetGroup: string | null
}>).sort((a, b) => a.position - b.position)

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
  await seed()
})

afterEach(() => cleanup())

describe('montar um bi-set no editor', () => {
  it('unir ao próximo põe os dois na mesma chave', async () => {
    await renderPage()
    openRow('Supino reto')

    fireEvent.click(screen.getByRole('button', { name: 'Unir ao próximo' }))

    await waitFor(async () => {
      const items = await itemsNow()
      expect(items[0]!.supersetGroup).toBe('item-0')
      expect(items[1]!.supersetGroup).toBe('item-0')
    })
    expect((await itemsNow())[2]!.supersetGroup).toBeNull()
    expect(await screen.findByText('Bi-set')).toBeInTheDocument()
  })

  it('o terceiro entra no grupo existente, e o quarto não caberia', async () => {
    await renderPage()
    openRow('Supino reto')
    fireEvent.click(screen.getByRole('button', { name: 'Unir ao próximo' }))
    await screen.findByText('Bi-set')

    openRow('Remada curvada')
    fireEvent.click(screen.getByRole('button', { name: 'Unir ao próximo' }))

    expect(await screen.findByText('Tri-set')).toBeInTheDocument()
    const items = await itemsNow()
    expect(items.map((item) => item.supersetGroup)).toEqual(['item-0', 'item-0', 'item-0'])
    openRow('Agachamento')
    expect(screen.queryByRole('button', { name: 'Unir ao próximo' })).not.toBeInTheDocument()
  })

  it('sair do bloco solta a chave e joga o exercício para depois do grupo', async () => {
    await renderPage()
    openRow('Supino reto')
    fireEvent.click(screen.getByRole('button', { name: 'Unir ao próximo' }))
    await screen.findByText('Bi-set')

    // Entrar no bloco remonta a linha, que volta fechada.
    openRow('Supino reto')
    fireEvent.click(screen.getByRole('button', { name: 'Sair do bloco' }))

    await waitFor(async () => {
      const items = await itemsNow()
      expect(items.map((item) => item.id)).toEqual(['item-1', 'item-0', 'item-2'])
    })
    expect((await itemsNow()).find((item) => item.id === 'item-0')!.supersetGroup).toBeNull()
  })

  it('desfazer o bloco limpa todos os membros', async () => {
    await renderPage()
    openRow('Supino reto')
    fireEvent.click(screen.getByRole('button', { name: 'Unir ao próximo' }))
    await screen.findByText('Bi-set')

    fireEvent.click(screen.getByRole('button', { name: 'desfazer bloco' }))

    await waitFor(async () => {
      const items = await itemsNow()
      expect(items.every((item) => item.supersetGroup === null)).toBe(true)
    })
    expect(screen.queryByText('Bi-set')).not.toBeInTheDocument()
  })

  it('mover o bloco leva os dois membros juntos', async () => {
    await renderPage()
    openRow('Supino reto')
    fireEvent.click(screen.getByRole('button', { name: 'Unir ao próximo' }))
    await screen.findByText('Bi-set')

    fireEvent.click(screen.getByRole('button', { name: 'Mover bloco para baixo' }))

    await waitFor(async () => {
      const items = await itemsNow()
      expect(items.map((item) => item.id)).toEqual(['item-2', 'item-0', 'item-1'])
    })
  })
})
