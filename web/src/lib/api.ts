const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

/**
 * O refresh vive num cookie httpOnly de 30 dias. Chamadas concorrentes
 * compartilham a mesma promise — senão o app dispara N refreshes na volta da
 * rede e a rotação de token invalida os próprios pedidos em andamento.
 */
export async function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return null
      const body = (await res.json()) as { accessToken: string }
      accessToken = body.accessToken
      return accessToken
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly details?: unknown) {
    super(code)
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await authenticatedFetch(path, init)

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

async function authenticatedFetch(path: string, init: RequestInit) {
  const send = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body && !(init.body instanceof FormData)
          ? { 'content-type': 'application/json' }
          : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })

  let res = await send(accessToken)

  if (res.status === 401) {
    const token = await refreshAccessToken()
    if (!token) throw new ApiError(401, 'nao_autenticado')
    res = await send(token)
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; details?: unknown }
    throw new ApiError(res.status, body.code ?? 'erro_desconhecido', body.details)
  }
  return res
}

/** Baixa mídia privada com o mesmo Bearer e a mesma rotação usados pela API. */
export async function fetchMediaBlob(mediaId: string, variant: 'full' | 'thumb' = 'full', signal?: AbortSignal) {
  const query = variant === 'thumb' ? '?variant=thumb' : ''
  const response = await authenticatedFetch(`/api/media/${mediaId}${query}`, { signal })
  return response.blob()
}

export const loginUrl = `${API_URL}/auth/google`

export interface AuthConfig {
  google: boolean
  devLogin: boolean
}

/** Quais caminhos de login a API expõe. Evita hardcodar isso no bundle. */
export function fetchAuthConfig() {
  return apiFetch<AuthConfig>('/auth/config')
}

export function devLogin(token: string, email: string) {
  return apiFetch<{ accessToken: string }>('/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ token, email }),
  }).then((body) => {
    setAccessToken(body.accessToken)
    return body
  })
}
