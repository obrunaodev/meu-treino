import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, localDb } from './db.js'
import type { SetDraft } from './domain/session.js'

type Drafts = Record<string, SetDraft[]>

/** Keeps unfinished sets in the account's local database across navigation and reloads. */
export function useSessionDrafts(sessionId: string, defaults: Drafts) {
  const key = `session-drafts:${sessionId}`
  const stored = useLiveQuery(() => getMeta<Drafts>(key, {}), [key])
  const optimistic = useRef<{ key: string; value: Drafts } | null>(null)
  const [, render] = useState(0)
  const [storageError, setStorageError] = useState<Error | null>(null)
  const saved = optimistic.current?.key === key ? optimistic.current.value : stored ?? {}
  const drafts = { ...defaults }
  for (const [id, sets] of Object.entries(saved)) {
    if (defaults[id]?.length === sets.length) drafts[id] = sets
  }

  function update(change: (current: Drafts) => Drafts) {
    const current = { ...defaults, ...(optimistic.current?.key === key ? optimistic.current.value : stored) }
    const next = change(current)
    const changed = Object.fromEntries(Object.entries(next).filter(([id, sets]) => sets !== current[id]))
    const latest = optimistic.current?.key === key ? optimistic.current.value : saved
    optimistic.current = { key, value: { ...latest, ...changed } }
    render((value) => value + 1)
    // Merge only the edited members, so another open block or tab cannot erase
    // unrelated drafts. IndexedDB serializes these read/write transactions.
    void localDb.transaction('rw', localDb.meta, async () => {
      await localDb.meta.put({ key, value: { ...await getMeta<Drafts>(key, {}), ...changed } })
    }).catch((error: Error) => setStorageError(error))
  }

  async function clear(ids: string[]) {
    const without = (value: Drafts) => Object.fromEntries(Object.entries(value).filter(([id]) => !ids.includes(id)))
    optimistic.current = { key, value: without(optimistic.current?.key === key ? optimistic.current.value : saved) }
    render((value) => value + 1)
    await localDb.transaction('rw', localDb.meta, async () => {
      await localDb.meta.put({ key, value: without(await getMeta<Drafts>(key, {})) })
    })
  }

  if (storageError) throw storageError
  return { drafts, update, clear, ready: stored !== undefined }
}
