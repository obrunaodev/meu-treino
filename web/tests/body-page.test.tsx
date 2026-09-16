import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const OWNER = '00000000-0000-7000-8000-000000000093'

vi.mock('../src/lib/auth.js', () => ({ useAuth: () => ({ user: { id: OWNER } }) }))

// ResizeObserver, que o jsdom não tem — é a única API do navegador simulada.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

const { localDb } = await import('../src/lib/db.js')
const { Body } = await import('../src/pages/Body.js')

const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }

async function seedSettings(unit: 'kg' | 'lb') {
  await localDb.table_('user_settings').put({
    ...base, id: 'settings', unit, showPlates: true, theme: 'dark', locale: 'pt-BR',
    remindersEnabled: false, restAutoStart: false, onboardedAt: null,
  } as never)
}

const rows = async () => (await localDb.table_('body_measurements').toArray()) as unknown as Array<{
  kind: string; side: string; value: number; measuredOn: string
}>

async function renderPage() {
  render(<MemoryRouter><Body /></MemoryRouter>)
  await screen.findByRole('button', { name: /salvar/i })
}

const typeValue = (value: string) =>
  fireEvent.change(screen.getByLabelText(/^valor/i), { target: { value } })

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

afterEach(() => cleanup())

describe('página do corpo', () => {
  it('grava o peso do dia escolhido', async () => {
    await seedSettings('kg')
    await renderPage()

    typeValue('82.4')
    fireEvent.change(screen.getByLabelText(/^dia/i), { target: { value: '2026-09-10' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(async () => {
      expect(await rows()).toEqual([expect.objectContaining({
        kind: 'peso', value: 82.4, measuredOn: '2026-09-10', side: 'ambos',
      })])
    })
  })

  it('em lb, o que se digita é convertido antes de gravar', async () => {
    await seedSettings('lb')
    await renderPage()
    // O rótulo do campo tem que dizer em que unidade o número está; a
    // preferência chega do IndexedDB depois do primeiro render.
    await screen.findByLabelText(/valor \(lb\)/i)

    typeValue('180')
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(async () => {
      expect((await rows())[0]?.value).toBeCloseTo(81.6, 1)
    })
  })

  it('medida com lado pede o lado; peso não', async () => {
    await seedSettings('kg')
    await renderPage()

    expect(screen.queryByLabelText(/^lado/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^medida/i), { target: { value: 'coxa' } })

    expect(screen.getByLabelText(/^lado/i)).toBeInTheDocument()
  })

  it('a lista mostra o que já foi medido e permite apagar', async () => {
    await seedSettings('kg')
    await localDb.table_('body_measurements').put({
      ...base, id: '11111111-1111-7111-8111-111111111111', kind: 'peso', side: 'ambos',
      value: 83, measuredOn: '2026-09-12', note: null,
    } as never)
    await renderPage()

    const remove = await screen.findByRole('button', { name: /apagar a medida/i })
    fireEvent.click(remove)

    await waitFor(async () => {
      expect((await localDb.table_('body_measurements').toArray())[0]?.deletedAt).toBeTruthy()
    })
  })
})
