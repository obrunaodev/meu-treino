import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../src/lib/auth.js'
import { localDb, setMeta } from '../src/lib/db.js'
import { apiFetch, setAccessToken } from '../src/lib/api.js'

const user = { id: 'owner', name: 'Bruno', email: 'b@example.com', roles: [], locale: 'pt-BR', pictureUrl: null, onboardedAt: null }
function Identity() {
  const auth = useAuth()
  return <p>{auth.status}:{auth.user?.name}</p>
}
beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
  await setMeta('ownerId', user.id)
  await setMeta('currentUser', user)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('opens the verified local account when the network is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')))
  render(<AuthProvider><Identity /></AuthProvider>)
  expect(await screen.findByText('autenticado:Bruno')).toBeInTheDocument()
})

it('does not use cached access after the server rejects authentication', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
  render(<AuthProvider><Identity /></AuthProvider>)
  expect(await screen.findByText('anonimo:')).toBeInTheDocument()
  expect(await localDb.meta.get('currentUser')).toBeUndefined()
})

it('does not open a cache belonging to another account', async () => {
  await setMeta('ownerId', 'another-owner')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')))
  render(<AuthProvider><Identity /></AuthProvider>)
  expect(await screen.findByText('anonimo:')).toBeInTheDocument()
})

it('opens cached data during a server outage without treating it as a logout', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
  render(<AuthProvider><Identity /></AuthProvider>)
  expect(await screen.findByText('autenticado:Bruno')).toBeInTheDocument()
})

it('never pushes the offline replica with a different account after reconnecting', async () => {
  setAccessToken('new-account-token')
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    requests.push(String(url))
    return new Response(JSON.stringify({ id: 'another-owner' }))
  }))
  await expect(apiFetch('/api/sync', { method: 'POST', body: '{}' })).rejects.toThrow('conta_divergente')
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatch(/\/auth\/me$/)
  setAccessToken(null)
})

it('clears cached access when the identity endpoint refuses the refreshed token', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => String(url).endsWith('/auth/refresh')
    ? new Response(JSON.stringify({ accessToken: 'test-token' }))
    : new Response('{}', { status: 403 })))
  render(<AuthProvider><Identity /></AuthProvider>)
  expect(await screen.findByText('anonimo:')).toBeInTheDocument()
  expect(await localDb.meta.get('currentUser')).toBeUndefined()
})

it('requires explicit confirmation to log out with persisted workout drafts', async () => {
  await setMeta('session-drafts:session', { exercise: [{ checked: true, kg: 65 }] })
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify(
    String(url).endsWith('/auth/refresh') ? { accessToken: 'test-token' } : user,
  ))))
  const auth = renderHook(() => useAuth(), { wrapper: AuthProvider })
  await waitFor(() => expect(auth.result.current.status).toBe('autenticado'))
  await act(async () => expect(await auth.result.current.logout()).toEqual({ ok: false, pendente: 1 }))
  expect(await localDb.meta.get('session-drafts:session')).toBeDefined()
})
