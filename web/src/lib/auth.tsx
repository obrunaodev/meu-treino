import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, refreshAccessToken, setAccessToken } from './api.js'
import { getMeta, localDb, setMeta } from './db.js'
import { pendingCount } from './outbox.js'

export interface CurrentUser {
  id: string
  email: string
  name: string
  pictureUrl: string | null
  locale: string
  onboardedAt: string | null
}

interface AuthState {
  user: CurrentUser | null
  status: 'carregando' | 'autenticado' | 'anonimo'
  /**
   * Sair apaga o banco local. Com fila pendente isso descarta treino que o
   * servidor nunca viu, então `force` é obrigatório nesse caso — quem chama
   * precisa ter perguntado antes. Devolve `pendente` quando recusa.
   */
  logout: (force?: boolean) => Promise<{ ok: true } | { ok: false; pendente: number }>
  reload: () => Promise<void>
}

const OWNER_KEY = 'ownerId'

/**
 * Apaga tudo que é do usuário neste aparelho.
 *
 * O Dexie não é o único lugar: o service worker guarda a mídia privada em
 * Cache Storage, indexada por URL. Sem limpar aqui, as fotos da conta anterior
 * continuam servíveis para quem souber o id — e o id some junto com o Dexie,
 * mas o objeto no cache não.
 */
async function wipeLocalData() {
  await localDb.delete()
  if (!('caches' in window)) return
  const nomes = await caches.keys()
  await Promise.all(nomes.map((nome) => caches.delete(nome)))
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [status, setStatus] = useState<AuthState['status']>('carregando')

  const reload = useCallback(async () => {
    // O access token vive só em memória, então todo boot começa pelo refresh.
    const token = await refreshAccessToken()
    if (!token) {
      setUser(null)
      setStatus('anonimo')
      return
    }
    try {
      const atual = await apiFetch<CurrentUser>('/auth/me')

      /**
       * Cerca de conta.
       *
       * Só o logout limpava o banco local. Uma sessão que expira e um login com
       * OUTRA conta em seguida deixavam o IndexedDB com os dados do anterior,
       * misturados aos novos — e o `ownerId` gravado nas linhas não é conferido
       * em lugar nenhum da leitura.
       */
      const anterior = await getMeta<string | null>(OWNER_KEY, null)
      if (anterior && anterior !== atual.id) {
        await wipeLocalData()
        window.location.reload()
        return
      }
      await setMeta(OWNER_KEY, atual.id)

      setUser(atual)
      setStatus('autenticado')
    } catch {
      setUser(null)
      setStatus('anonimo')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const logout = useCallback(async (force = false) => {
    // A fila é a única cópia do que ainda não subiu. Apagar sem avisar perde
    // treino registrado offline, que é justamente o caso de uso do app.
    const pendente = await pendingCount()
    if (pendente > 0 && !force) return { ok: false as const, pendente }

    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAccessToken(null)
    // Sem isto, o próximo login no mesmo navegador herdaria dados de outra conta.
    await wipeLocalData()
    setUser(null)
    setStatus('anonimo')
    window.location.href = '/'
    return { ok: true as const }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, status, logout, reload }),
    [user, status, logout, reload],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider')
  return ctx
}
