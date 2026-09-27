import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { localDb } from '../src/lib/db.js'
import { useSessionDrafts } from '../src/lib/session-drafts.js'
import type { SetDraft } from '../src/lib/domain/session.js'

const draft: SetDraft = { kg: 50, plate: null, result: 10, rir: 2, checked: false, left: null }
beforeEach(async () => { await localDb.delete(); await localDb.open() })
afterEach(cleanup)

it('restores loads, checks and both sides after remount without using new history', async () => {
  const initial = { a: [draft] }
  const first = renderHook(() => useSessionDrafts('s1', initial))
  await waitFor(() => expect(first.result.current.ready).toBe(true))
  act(() => first.result.current.update((current) => ({ ...current, a: [{ ...draft, kg: 60, checked: true, left: { kg: 55, plate: null, result: 9 } }] })))
  await waitFor(async () => expect((await localDb.meta.get('session-drafts:s1'))?.value).toMatchObject({ a: [{ kg: 60, checked: true }] }))
  first.unmount()
  const restored = renderHook(() => useSessionDrafts('s1', { a: [{ ...draft, kg: 90 }] }))
  await waitFor(() => expect(restored.result.current.ready).toBe(true))
  expect(restored.result.current.drafts.a![0]).toMatchObject({ kg: 60, checked: true, left: { kg: 55, result: 9 } })
})

it('keeps a superset member when another is cleared and isolates sessions', async () => {
  const flow = renderHook(() => useSessionDrafts('s1', { a: [draft], b: [draft] }))
  await waitFor(() => expect(flow.result.current.ready).toBe(true))
  act(() => flow.result.current.update((current) => ({ a: [{ ...current.a![0]!, checked: true }], b: [{ ...current.b![0]!, kg: 70 }] })))
  await act(() => flow.result.current.clear(['a']))
  expect(flow.result.current.drafts.a![0]!.checked).toBe(false)
  expect(flow.result.current.drafts.b![0]!.kg).toBe(70)
  const another = renderHook(() => useSessionDrafts('s2', { b: [draft] }))
  await waitFor(() => expect(another.result.current.ready).toBe(true))
  expect(another.result.current.drafts.b![0]!.kg).toBe(50)
})

it('does not reset a touched member when history changes', async () => {
  const flow = renderHook(({ kg }) => useSessionDrafts('s1', { a: [{ ...draft, kg }] }), { initialProps: { kg: 50 } })
  await waitFor(() => expect(flow.result.current.ready).toBe(true))
  act(() => flow.result.current.update((current) => ({ a: [{ ...current.a![0]!, kg: 65, checked: true }] })))
  flow.rerender({ kg: 100 })
  expect(flow.result.current.drafts.a![0]).toMatchObject({ kg: 65, checked: true })
})
