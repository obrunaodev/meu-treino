import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api.js'
import { routes } from '../lib/routes.js'
import { useActions, type ProgramDraft } from '../lib/actions.js'
import { Card } from '../components/ui.js'
import type { CatalogStation } from '../lib/types.js'

const STEPS = ['programa', 'ritmo', 'ciclo', 'bloco', 'academia', 'lembretes'] as const
type Step = (typeof STEPS)[number]

const WEEKDAY_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']
const CARDIO_KEYS = ['esteira', 'bicicleta', 'eliptico', 'escada', 'remo', 'air_bike'] as const

/** Nomes default do ciclo: A, B, C… O usuário renomeia se quiser. */
function defaultTemplateNames(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${String.fromCharCode(65 + i)}`)
}

export function Onboarding() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { createProgram } = useActions()

  const [step, setStep] = useState<Step>('programa')
  const [saving, setSaving] = useState(false)
  const [stations, setStations] = useState<CatalogStation[]>([])
  const [stationsError, setStationsError] = useState(false)

  const [draft, setDraft] = useState<ProgramDraft>({
    name: t('onboarding.program.default'),
    scheduleMode: 'continuous',
    weekdays: [2, 4, 6],
    templateNames: defaultTemplateNames(2, t('onboarding.cycle.prefix')),
    cyclesPerBlock: 4,
    rirDeltaPerBlock: -1,
    defaultRestSeconds: 90,
    reminderLeadMinutes: 60,
    remindersEnabled: false,
    gymName: t('onboarding.gym.default'),
    stations: [],
    cardioNames: [],
  })

  useEffect(() => {
    void apiFetch<{ stations: CatalogStation[] }>('/api/catalog/stations')
      .then((body) => setStations(body.stations))
      .catch(() => setStationsError(true))
  }, [])

  const index = STEPS.indexOf(step)
  const patch = (values: Partial<ProgramDraft>) => setDraft((d) => ({ ...d, ...values }))

  const selected = useMemo(
    () => new Set(draft.stations.map((s) => s.code)),
    [draft.stations],
  )

  function toggleStation(station: CatalogStation) {
    patch({
      stations: selected.has(station.code)
        ? draft.stations.filter((s) => s.code !== station.code)
        : [...draft.stations, station],
    })
  }

  function toggleCardio(name: string) {
    patch({
      cardioNames: draft.cardioNames.includes(name)
        ? draft.cardioNames.filter((item) => item !== name)
        : [...draft.cardioNames, name],
    })
  }

  function setCycleSize(size: number) {
    const count = Math.min(7, Math.max(1, size))
    const names = defaultTemplateNames(count, t('onboarding.cycle.prefix'))
    // Preserva os nomes que o usuário já editou ao mudar o tamanho do ciclo.
    patch({ templateNames: names.map((fallback, i) => draft.templateNames[i] ?? fallback) })
  }

  async function finish() {
    setSaving(true)
    try {
      await createProgram(draft)
      navigate(routes.dashboard, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="onboarding">
      <header className="onboarding__head">
        <span className="eyebrow">
          {t('onboarding.step', { current: index + 1, total: STEPS.length })}
        </span>
        <h1>{t(`onboarding.${step}.title`)}</h1>
        <p className="muted">{t(`onboarding.${step}.desc`)}</p>
        <div className="progress">
          <div className="progress__fill" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <Card>
        {step === 'programa' && (
          <label className="field">
            {t('onboarding.program.label')}
            <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </label>
        )}

        {step === 'ritmo' && (
          <div className="stack">
            <div className="choices">
              {(['continuous', 'weekly'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`choice${draft.scheduleMode === mode ? ' choice--on' : ''}`}
                  onClick={() => patch({ scheduleMode: mode })}
                >
                  <strong>{t(`onboarding.ritmo.${mode}`)}</strong>
                  <span className="muted">{t(`onboarding.ritmo.${mode}_desc`)}</span>
                </button>
              ))}
            </div>

            {draft.scheduleMode === 'weekly' && (
              <div className="weekdays">
                {WEEKDAY_KEYS.map((key, day) => (
                  <button
                    key={key}
                    type="button"
                    className={`pill${draft.weekdays.includes(day) ? ' pill--on' : ''}`}
                    onClick={() =>
                      patch({
                        weekdays: draft.weekdays.includes(day)
                          ? draft.weekdays.filter((d) => d !== day)
                          : [...draft.weekdays, day].sort(),
                      })
                    }
                  >
                    {t(`weekday.${key}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'ciclo' && (
          <div className="stack">
            <label className="field">
              {t('onboarding.cycle.size')}
              <input
                type="number"
                min={1}
                max={7}
                value={draft.templateNames.length}
                onChange={(e) => setCycleSize(Number(e.target.value))}
              />
            </label>
            <span className="mono muted">{t('onboarding.cycle.hint')}</span>
            <div className="stack stack--tight">
              {draft.templateNames.map((name, i) => (
                <label key={i} className="field field--row">
                  <span className="mono muted">{i + 1}</span>
                  <input
                    value={name}
                    onChange={(e) =>
                      patch({
                        templateNames: draft.templateNames.map((n, j) => (j === i ? e.target.value : n)),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 'bloco' && (
          <div className="stack">
            <label className="field">
              {t('onboarding.block.cycles')}
              <input
                type="number"
                min={1}
                max={24}
                value={draft.cyclesPerBlock}
                onChange={(e) => patch({ cyclesPerBlock: Math.max(1, Number(e.target.value)) })}
              />
            </label>
            <label className="field">
              {t('onboarding.block.rir')}
              <input
                type="number"
                min={-3}
                max={3}
                value={draft.rirDeltaPerBlock}
                onChange={(e) => patch({ rirDeltaPerBlock: Number(e.target.value) })}
              />
            </label>
            <span className="mono muted">{t('onboarding.block.rir_hint')}</span>
            <label className="field">
              {t('onboarding.block.rest')}
              <input
                type="number"
                min={15}
                max={600}
                step={15}
                value={draft.defaultRestSeconds}
                onChange={(e) => patch({ defaultRestSeconds: Math.max(15, Number(e.target.value)) })}
              />
            </label>
          </div>
        )}

        {step === 'academia' && (
          <div className="stack">
            <label className="field">
              {t('onboarding.gym.label')}
              <input value={draft.gymName} onChange={(e) => patch({ gymName: e.target.value })} />
            </label>

            {stationsError ? (
              <p className="muted">{t('onboarding.gym.offline')}</p>
            ) : (
              <>
                <div className="row-between">
                  <span className="mono muted">
                    {t('onboarding.gym.selected', { count: draft.stations.length })}
                  </span>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => patch({ stations: draft.stations.length === stations.length ? [] : stations })}
                  >
                    {draft.stations.length === stations.length
                      ? t('onboarding.gym.none')
                      : t('onboarding.gym.all')}
                  </button>
                </div>
                <div className="checklist">
                  {stations.map((station) => (
                    <button
                      key={station.code}
                      type="button"
                      className={`checkitem${selected.has(station.code) ? ' checkitem--on' : ''}`}
                      onClick={() => toggleStation(station)}
                    >
                      <span>{station.name}</span>
                      <span className="mono muted">{station.loadType ?? '—'}</span>
                    </button>
                  ))}
                </div>
                <div className="stack stack--tight">
                  <span className="eyebrow">{t('onboarding.gym.cardio')}</span>
                  <span className="mono muted">{t('onboarding.gym.cardio_hint')}</span>
                  <div className="checklist">
                    {CARDIO_KEYS.map((key) => {
                      const name = t(`cardio_options.${key}`)
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`checkitem${draft.cardioNames.includes(name) ? ' checkitem--on' : ''}`}
                          onClick={() => toggleCardio(name)}
                        >
                          <span>{name}</span>
                          <span className="mono muted">{draft.cardioNames.includes(name) ? '✓' : '+'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'lembretes' && (
          <div className="stack">
            <div className="choices">
              {[true, false].map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  className={`choice${draft.remindersEnabled === on ? ' choice--on' : ''}`}
                  onClick={() => patch({ remindersEnabled: on })}
                >
                  <strong>{t(on ? 'onboarding.reminders.on' : 'onboarding.reminders.off')}</strong>
                </button>
              ))}
            </div>
            {draft.remindersEnabled && (
              <label className="field">
                {t('onboarding.reminders.lead')}
                <input
                  type="number"
                  min={5}
                  max={1440}
                  step={5}
                  value={draft.reminderLeadMinutes}
                  onChange={(e) => patch({ reminderLeadMinutes: Math.max(5, Number(e.target.value)) })}
                />
              </label>
            )}
          </div>
        )}
      </Card>

      <footer className="onboarding__foot">
        <button
          type="button"
          className="button button--ghost"
          disabled={index === 0}
          onClick={() => setStep(STEPS[index - 1]!)}
        >
          {t('common.back')}
        </button>

        {index < STEPS.length - 1 ? (
          <button type="button" className="button button--primary" onClick={() => setStep(STEPS[index + 1]!)}>
            {t('common.next')}
          </button>
        ) : (
          <button type="button" className="button button--primary" onClick={() => void finish()} disabled={saving}>
            {saving ? t('common.saving') : t('onboarding.finish')}
          </button>
        )}
      </footer>
    </main>
  )
}
