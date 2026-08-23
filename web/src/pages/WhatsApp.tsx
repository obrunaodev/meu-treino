import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, apiFetch } from '../lib/api.js'
import { Card, Empty, Select } from '../components/ui.js'

interface WhatsAppStatus {
  state: 'disconnected' | 'connecting' | 'qr' | 'connected'
  qrDataUrl: string | null
  phone: string | null
  selectedGroupJid: string | null
  selectedGroupName: string | null
}

interface WhatsAppGroup { jid: string; name: string; size: number }

export function WhatsApp() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [groups, setGroups] = useState<WhatsAppGroup[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<WhatsAppStatus>('/api/whatsapp/status')
      setStatus(next)
      setError(null)
      if (next.state === 'connected') {
        const result = await apiFetch<{ groups: WhatsAppGroup[] }>('/api/whatsapp/groups')
        setGroups(result.groups)
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.code : 'erro_interno')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handle = window.setInterval(() => void refresh(), status?.state === 'connected' ? 10_000 : 2_000)
    return () => window.clearInterval(handle)
  }, [refresh, status?.state])

  async function connect() {
    setBusy(true)
    try {
      setStatus(await apiFetch<WhatsAppStatus>('/api/whatsapp/connect', { method: 'POST' }))
      setError(null)
    } catch (cause) {
      setError(errorCode(cause))
    } finally {
      setBusy(false)
    }
  }

  async function selectGroup(jid: string) {
    const group = groups.find((entry) => entry.jid === jid)
    if (!group) return
    try {
      await apiFetch('/api/whatsapp/group', { method: 'POST', body: JSON.stringify(group) })
      await refresh()
    } catch (cause) {
      setError(errorCode(cause))
    }
  }

  async function disconnect() {
    if (!window.confirm(t('whatsapp.disconnect_confirm'))) return
    setBusy(true)
    try {
      await apiFetch('/api/whatsapp/disconnect', { method: 'POST' })
      setStatus((current) => current ? { ...current, state: 'disconnected', qrDataUrl: null, phone: null } : current)
      setGroups([])
      setError(null)
    } catch (cause) {
      setError(errorCode(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page whatsapp">
      <header className="page__title">
        <span className="eyebrow">{t('whatsapp.eyebrow')}</span>
        <h1>{t('whatsapp.title')}</h1>
      </header>

      {error && <div className="whatsapp__error" role="alert">{t(`errors.${error}`)}</div>}

      {!status ? <Empty message={t('common.loading')} /> : (
        <div className="whatsapp__layout">
          <Card title={t('whatsapp.connection')}>
            <div className={`whatsapp__state whatsapp__state--${status.state}`}>
              <span aria-hidden="true" />
              {t(`whatsapp.state_${status.state}`)}
            </div>

            {status.qrDataUrl && (
              <div className="whatsapp__qr">
                <img src={status.qrDataUrl} alt={t('whatsapp.qr_alt')} width={320} height={320} />
                <p>{t('whatsapp.qr_help')}</p>
              </div>
            )}

            {status.state === 'disconnected' && (
              <button type="button" className="button button--primary" disabled={busy} onClick={() => void connect()}>
                {t('whatsapp.connect')}
              </button>
            )}

            {status.state === 'connected' && (
              <>
                <Select label={t('whatsapp.group')} value={status.selectedGroupJid ?? ''} onChange={(value) => void selectGroup(value)}>
                    <option value="">{t('whatsapp.choose_group')}</option>
                    {groups.map((group) => <option key={group.jid} value={group.jid}>{group.name} · {group.size}</option>)}
                </Select>
                <button type="button" className="button button--ghost" disabled={busy} onClick={() => void disconnect()}>
                  {t('whatsapp.disconnect')}
                </button>
              </>
            )}
          </Card>

          <Card title={t('whatsapp.commands')}>
            <div className="whatsapp__example">
              <span>/start</span>
              <p>{t('whatsapp.start_help')}</p>
            </div>
            <div className="whatsapp__example">
              <span>1 100kg 3x15 1rir</span>
              <p>{t('whatsapp.log_help')}</p>
            </div>
            <p className="mono muted">{t('whatsapp.restriction')}</p>
          </Card>
        </div>
      )}
    </div>
  )
}

const errorCode = (cause: unknown) => cause instanceof ApiError ? cause.code : 'erro_interno'
