import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDb } from './db.js'
import { runSync, startSyncLoop, type SyncResult } from './sync.js'
import { flushUploads } from './uploads.js'

interface SyncState {
  conflicts: number
  pending: number
  online: boolean
}

const SyncContext = createContext<SyncState>({ conflicts: 0, pending: 0, online: true })

/** Agrupa a rajada de escritas de uma ação só — o onboarding cria 5+ linhas. */
const DEBOUNCE_MS = 1200

/**
 * O loop de sync fica acima de qualquer tela.
 *
 * Ele já morou dentro da barra de status, que só renderiza depois que existe um
 * programa — e como o programa só chega pelo sync, o app travava esperando a si
 * mesmo num dispositivo novo.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [conflicts, setConflicts] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const pending = useLiveQuery(() => localDb.outbox.count(), [], 0)

  useEffect(() => {
    const stop = startSyncLoop((result: SyncResult) => {
      setConflicts(result.conflicts)
      void flushUploads()
    })

    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)

    /**
     * Sai da tela: sincroniza já, sem esperar o debounce.
     *
     * Encerrar o treino e trocar de app na mesma respiração é o comportamento
     * normal, e nesse intervalo o que acabou de ser registrado ainda está na
     * fila. O dado não se perde — o IndexedDB segura —, mas o servidor ficaria
     * desatualizado até o app abrir de novo.
     */
    const flush = () => {
      if (document.visibilityState === 'hidden') void runSync().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)

    return () => {
      stop()
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  /**
   * Dispara pelo conteúdo da fila, não só pelo relógio.
   *
   * Com apenas o heartbeat de 60s, o que o usuário acabou de criar ficava até
   * um minuto parado no dispositivo — e sumia de vez se ele fechasse a aba
   * antes do próximo tick. O debounce evita uma chamada por linha escrita.
   */
  useEffect(() => {
    if (!pending || !online) return
    const handle = window.setTimeout(() => {
      void runSync()
        .then((result) => {
          setConflicts(result.conflicts)
          return flushUploads()
        })
        .catch(() => undefined)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [pending, online])

  const value = useMemo(() => ({ conflicts, pending: pending ?? 0, online }), [conflicts, pending, online])
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSyncState() {
  return useContext(SyncContext)
}
