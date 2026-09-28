import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Conflicts } from '../src/pages/Conflicts.js'
import '../src/lib/i18n.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('does not describe a failed request as an empty conflict list', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValue(new Response(JSON.stringify({ conflicts: [] })))
  vi.stubGlobal('fetch', fetch)
  render(<Conflicts />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar')
  expect(screen.queryByText('Nenhum conflito pendente.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  expect(await screen.findByText('Nenhum conflito pendente.')).toBeVisible()
})

it('exposes selected values and retains choices when saving fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (init?.method === 'POST') throw new TypeError('offline')
    return new Response(JSON.stringify({ conflicts: [{ id: 'conflict', entity: 'gyms', entityId: 'gym',
      localRow: { name: 'Local' }, remoteRow: { name: 'Remote' }, conflictingFields: ['name'] }] }))
  }))
  render(<Conflicts />)
  const choice = await screen.findByRole('button', { name: 'Este dispositivo Local' })
  fireEvent.click(choice)
  expect(choice).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Resolver' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resolver' })).toBeEnabled())
  expect(choice).toHaveAttribute('aria-pressed', 'true')
})
