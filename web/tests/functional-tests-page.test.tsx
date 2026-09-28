import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Tests } from '../src/pages/Tests.js'
import { AuthProvider } from '../src/lib/auth.js'
import { localDb } from '../src/lib/db.js'
import { setAccessToken } from '../src/lib/api.js'
import '../src/lib/i18n.js'

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
  await localDb.table_('functional_tests').put({ id: 'test', ownerId: 'owner', name: 'Equilíbrio',
    unit: 's', frequencyDays: 14, higherIsBetter: true })
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify(String(url).endsWith('/auth/refresh')
    ? { accessToken: 'token' } : { id: 'owner', name: 'Tester', email: 'test@example.com', roles: [] }))))
})
afterEach(() => { cleanup(); setAccessToken(null); vi.unstubAllGlobals() })

it('labels the result with its unit and never records a blank value as zero', async () => {
  render(<AuthProvider><Tests /></AuthProvider>)
  const value = await screen.findByRole('spinbutton', { name: 'Resultado (s)' })
  const save = screen.getByRole('button', { name: 'Registrar resultado' })
  expect(save).toBeDisabled()
  fireEvent.change(value, { target: { value: '20' } })
  expect(save).toBeEnabled()
  fireEvent.change(value, { target: { value: '' } })
  expect(save).toBeDisabled()
  expect(await localDb.table_('test_results').count()).toBe(0)
})

it('requires confirmation before removing a functional test', async () => {
  render(<AuthProvider><Tests /></AuthProvider>)
  fireEvent.click(await screen.findByRole('button', { name: 'Apagar' }))
  expect((await localDb.table_('functional_tests').get('test'))?.deletedAt).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Apagar' })).toBeVisible())
  expect((await localDb.table_('functional_tests').get('test'))?.deletedAt).toBeUndefined()
})
