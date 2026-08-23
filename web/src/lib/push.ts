import { apiFetch } from './api.js'

export type PushState = 'ok' | 'unsupported' | 'denied' | 'needs-install' | 'error'

const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && Boolean((navigator as { standalone?: boolean }).standalone))

/**
 * No iOS o Web Push só existe para PWA instalado na tela de início — no Safari
 * comum a API nem aparece. Detectar isso antes de pedir permissão evita
 * prometer lembrete que nunca chegaria.
 */
export function pushSupport(): PushState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  if (isIOS() && !isStandalone()) return 'needs-install'
  return 'ok'
}

/** base64url → ArrayBuffer, formato que o PushManager exige da chave VAPID. */
function decodeVapidKey(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

export async function subscribeToPush(): Promise<PushState> {
  const support = pushSupport()
  if (support !== 'ok') return support

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  try {
    const { publicKey } = await apiFetch<{ publicKey: string }>('/api/push/key')
    if (!publicKey) return 'unsupported'

    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(publicKey),
    })

    await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription.toJSON()),
    })
    return 'ok'
  } catch {
    return 'error'
  }
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await apiFetch('/api/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined)
  await subscription.unsubscribe()
}
