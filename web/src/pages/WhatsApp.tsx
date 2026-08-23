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

const commandGroups = [
  { title: 'whatsapp.commands_plan', commands: ['today', 'start', 'last', 'history'] },
  { title: 'whatsapp.commands_session', commands: ['log', 'skip', 'end'] },
  { title: 'whatsapp.commands_manage', commands: ['edit_review', 'edit_value', 'help', 'clear'] },
] as const

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
                {status.selectedGroupName && (
                  <p className="whatsapp__authorized">
                    <span>{t('whatsapp.active_group')}</span>
                    <strong>{status.selectedGroupName}</strong>
                  </p>
                )}
                <button type="button" className="button button--ghost" disabled={busy} onClick={() => void disconnect()}>
                  {t('whatsapp.disconnect')}
                </button>
              </>
            )}
          </Card>

          <Card title={t('whatsapp.setup_title')}>
            <ol className="whatsapp__steps">
              {[1, 2, 3, 4].map((step) => (
                <li key={step}>
                  <span>{step}</span>
                  <p>{t(`whatsapp.setup_${step}`)}</p>
                </li>
              ))}
            </ol>
            <div className="whatsapp__notice">
              <strong>{t('whatsapp.private_title')}</strong>
              <p>{t('whatsapp.restriction')}</p>
            </div>
          </Card>
        </div>
      )}

      <section className="whatsapp__guide" aria-labelledby="whatsapp-guide-title">
        <header className="whatsapp__guide-head">
          <span className="eyebrow">{t('whatsapp.guide_eyebrow')}</span>
          <h2 id="whatsapp-guide-title">{t('whatsapp.guide_title')}</h2>
          <p>{t('whatsapp.guide_intro')}</p>
        </header>

        <div className="whatsapp__flow" aria-label={t('whatsapp.flow_label')}>
          {['preview', 'start', 'record', 'complete'].map((stage, index) => (
            <div className="whatsapp__flow-step" key={stage}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{t(`whatsapp.flow_${stage}_title`)}</strong>
              <p>{t(`whatsapp.flow_${stage}_body`)}</p>
            </div>
          ))}
        </div>

        <div className="whatsapp__commands">
          {commandGroups.map((group) => (
            <Card title={t(group.title)} key={group.title}>
              <dl className="whatsapp__command-list">
                {group.commands.map((command) => (
                  <div key={command}>
                    <dt><code>{t(`whatsapp.command_${command}_syntax`)}</code></dt>
                    <dd>
                      <strong>{t(`whatsapp.command_${command}_title`)}</strong>
                      <p>{t(`whatsapp.command_${command}_body`)}</p>
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>

        <Card title={t('whatsapp.format_title')}>
          <div className="whatsapp__format">
            <div>
              <code>1 100kg 3x15 1rir</code>
              <p>{t('whatsapp.format_breakdown')}</p>
            </div>
            <ul>
              <li>{t('whatsapp.format_fuzzy')}</li>
              <li>{t('whatsapp.format_units')}</li>
              <li>{t('whatsapp.format_order')}</li>
              <li>{t('whatsapp.format_limits')}</li>
            </ul>
          </div>
        </Card>

        <div className="whatsapp__notes">
          <Card title={t('whatsapp.rules_title')}>
            <ul>
              <li>{t('whatsapp.rule_session')}</li>
              <li>{t('whatsapp.rule_edit')}</li>
              <li>{t('whatsapp.rule_skip')}</li>
              <li>{t('whatsapp.rule_links')}</li>
            </ul>
          </Card>
          <Card title={t('whatsapp.cleanup_title')} tone="quiet">
            <p>{t('whatsapp.cleanup_body')}</p>
          </Card>
        </div>
      </section>
    </div>
  )
}

const errorCode = (cause: unknown) => cause instanceof ApiError ? cause.code : 'erro_interno'
