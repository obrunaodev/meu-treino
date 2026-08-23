import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, refreshAccessToken, setAccessToken } from './api.js'
import { localDb } from './db.js'

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
  logout: () => Promise<void>
  reload: () => Promise<void>
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
      setUser(await apiFetch<CurrentUser>('/auth/me'))
      setStatus('autenticado')
    } catch {
      setUser(null)
      setStatus('anonimo')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAccessToken(null)
    // Sem isto, o próximo login no mesmo navegador herdaria dados de outra conta.
    await localDb.delete()
    setUser(null)
    setStatus('anonimo')
    window.location.href = '/'
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
