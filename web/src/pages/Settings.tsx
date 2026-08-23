import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useActiveProgram, useEquipment, useSettings } from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { buildSetLogCsv, downloadBlob } from '../lib/export.js'
import { localDb } from '../lib/db.js'
import { remove } from '../lib/outbox.js'
import { subscribeToPush, pushSupport } from '../lib/push.js'
import { Card, Select } from '../components/ui.js'

export function Settings() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const program = useActiveProgram()
  const equipment = useEquipment()
  const { saveSettings, updateProgram } = useActions()
  const [confirming, setConfirming] = useState(false)
  const [pushState, setPushState] = useState(pushSupport())

  useEffect(() => {
    if (settings?.theme) document.documentElement.dataset.theme = settings.theme
  }, [settings?.theme])

  async function clearHistory() {
    // Soft delete via outbox: apagar direto do IndexedDB deixaria os registros
    // vivos no servidor e eles voltariam no próximo pull.
    for (const entity of ['workout_sessions', 'set_logs', 'cardio_logs', 'pain_events', 'test_results'] as const) {
      const rows = await localDb.table_(entity).toArray()
      for (const row of rows) await remove(entity, row.id)
    }
    setConfirming(false)
  }

  return (
    <div className="page">
      <h1>{t('settings.title')}</h1>

      <Card title={t('settings.title')}>
        <Select
          label={t('settings.unit')}
          value={settings?.unit ?? 'kg'}
          onChange={(value) => void saveSettings({ unit: value })}
        >
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </Select>

        <label className="field field--inline">
          <input
            type="checkbox"
            checked={settings?.showPlates ?? true}
            onChange={(e) => void saveSettings({ showPlates: e.target.checked })}
          />
          {t('settings.plates')}
        </label>

        <Select
          label={t('settings.theme')}
          value={settings?.theme ?? 'dark'}
          onChange={(value) => void saveSettings({ theme: value })}
        >
          <option value="dark">dark</option>
          <option value="light">light</option>
        </Select>

        <Select
          label={t('settings.language')}
          value={i18n.language}
          onChange={(value) => {
            void i18n.changeLanguage(value)
            void saveSettings({ locale: value })
          }}
        >
          <option value="pt-BR">Português (BR)</option>
          <option value="en-US">English (US)</option>
        </Select>
      </Card>

      {program && (
        <Card title={t('settings.program')}>
          <label className="field">
            {t('settings.rest')}
            <input
              type="number"
              min={15}
              step={15}
              value={program.defaultRestSeconds}
              onChange={(e) =>
                void updateProgram(program.id, { defaultRestSeconds: Math.max(15, Number(e.target.value)) })
              }
            />
          </label>

          <label className="field field--inline">
            <input
              type="checkbox"
              checked={settings?.remindersEnabled ?? false}
              onChange={async (e) => {
                if (e.target.checked) {
                  const result = await subscribeToPush()
                  setPushState(result)
                  if (result !== 'ok') return
                }
                await saveSettings({ remindersEnabled: e.target.checked })
              }}
            />
            {t('settings.reminders')}
          </label>

          {pushState === 'denied' && <span className="mono muted">{t('settings.reminders_blocked')}</span>}
          {pushState === 'needs-install' && <span className="mono muted">{t('settings.reminders_ios')}</span>}

          {settings?.remindersEnabled && (
            <label className="field">
              {t('settings.reminders_lead')}
              <input
                type="number"
                min={5}
                step={5}
                value={program.reminderLeadMinutes}
                onChange={(e) =>
                  void updateProgram(program.id, { reminderLeadMinutes: Math.max(5, Number(e.target.value)) })
                }
              />
            </label>
          )}
        </Card>
      )}

      <Card title={t('settings.equipment')} action={
        <span className="mono muted">{equipment.length}</span>
      }>
        <Link className="button button--quiet" to="/equipamentos">{t('settings.equipment')}</Link>
      </Card>

      <Card title={t('settings.export')}>
        <span className="mono muted">{t('settings.export_hint')}</span>
        <button
          type="button"
          className="button button--quiet"
          onClick={async () => downloadBlob(await buildSetLogCsv(), 'meu-treino-series.csv')}
        >
          {t('settings.export_csv')}
        </button>
      </Card>

      <Card title={t('settings.danger')} tone="quiet">
        <Link className="button button--quiet" to="/onboarding">{t('settings.redo_onboarding')}</Link>
        <span className="mono muted">{t('settings.clear_hint')}</span>
        {confirming ? (
          <div className="row">
            <button type="button" className="button button--danger" onClick={() => void clearHistory()}>
              {t('settings.clear_confirm')}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button type="button" className="button button--ghost" onClick={() => setConfirming(true)}>
            {t('settings.clear')}
          </button>
        )}
      </Card>
    </div>
  )
}
