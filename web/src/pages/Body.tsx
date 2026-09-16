import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart } from '../components/charts.js'
import { Card, Empty, Select } from '../components/ui.js'
import { useActions } from '../lib/actions.js'
import { calendarDayKey } from '../lib/domain/calendar.js'
import {
  MEASUREMENT_KINDS, latestPerDay, measurementKind, measurementSeries, measurementSummary,
  toCanonical, toDisplay, unitLabel, type MeasurementKind,
} from '../lib/domain/body.js'
import { useBodyMeasurements, useSettings } from '../lib/repo.js'
import type { BodyMeasurement } from '../lib/types.js'

const SIDES = ['ambos', 'D', 'E'] as const
const SIDE_LABEL = { ambos: 'session.side_both', D: 'session.side_right', E: 'session.side_left' } as const

/**
 * Peso, gordura e circunferências: registrar e ver a evolução.
 *
 * A medida vale pelo dia, não pela hora: o campo é uma data, e é o usuário
 * quem diz qual dia — corrigir uma pesagem de ontem não pode exigir mudar o
 * relógio do aparelho.
 */
export function Body() {
  const { t } = useTranslation()
  const measurements = useBodyMeasurements()
  const settings = useSettings()
  const preference = settings?.unit ?? 'kg'
  const [viewing, setViewing] = useState(MEASUREMENT_KINDS[0]!.slug)

  const kind = measurementKind(viewing) ?? MEASUREMENT_KINDS[0]!
  const recorded = new Set(measurements.map((row) => row.kind))
  const sidesWithData = SIDES.filter((side) =>
    measurements.some((row) => row.kind === kind.slug && row.side === side))

  return (
    <div className="page">
      <div className="page__title">
        <h1>{t('body.title')}</h1>
        <p className="page__description">{t('pages.body')}</p>
      </div>

      <MeasurementForm preference={preference} />

      <div className="pills">
        {MEASUREMENT_KINDS.map((entry) => (
          <button
            key={entry.slug}
            type="button"
            className={`pill${entry.slug === kind.slug ? ' pill--on' : ''}`}
            onClick={() => setViewing(entry.slug)}
          >
            {t(`body.kinds.${entry.slug}`)}
            {recorded.has(entry.slug) && <span aria-hidden="true"> ·</span>}
          </button>
        ))}
      </div>

      {sidesWithData.length === 0
        ? <Empty message={t('body.no_data')} />
        : sidesWithData.map((side) => (
          <MeasurementHistory
            key={side}
            kind={kind}
            side={side}
            rows={measurements}
            preference={preference}
          />
        ))}
    </div>
  )
}

function MeasurementForm({ preference }: { preference: 'kg' | 'lb' }) {
  const { t } = useTranslation()
  const { saveBodyMeasurement } = useActions()
  const [kindSlug, setKindSlug] = useState(MEASUREMENT_KINDS[0]!.slug)
  const [side, setSide] = useState<(typeof SIDES)[number]>('ambos')
  const [value, setValue] = useState('')
  const [day, setDay] = useState(() => calendarDayKey(new Date()))

  const kind = measurementKind(kindSlug) ?? MEASUREMENT_KINDS[0]!
  const parsed = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0

  return (
    <Card heading={t('body.record')}>
      <form
        className="body-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid) return
          await saveBodyMeasurement({
            kind: kind.slug,
            side: kind.sided ? side : 'ambos',
            value: toCanonical(parsed, kind.unit, preference),
            measuredOn: day,
          })
          setValue('')
        }}
      >
        <Select
          label={t('body.kind')}
          value={kindSlug}
          onChange={(next) => {
            setKindSlug(next)
            if (!measurementKind(next)?.sided) setSide('ambos')
          }}
        >
          {MEASUREMENT_KINDS.map((entry) => (
            <option key={entry.slug} value={entry.slug}>{t(`body.kinds.${entry.slug}`)}</option>
          ))}
        </Select>

        {kind.sided && (
          <Select label={t('session.side')} value={side} onChange={(next) => setSide(next as (typeof SIDES)[number])}>
            {SIDES.map((entry) => (
              <option key={entry} value={entry}>{t(SIDE_LABEL[entry])}</option>
            ))}
          </Select>
        )}

        <label className="field">
          {`${t('body.value')} (${unitLabel(kind.unit, preference)})`}
          <input
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>

        <label className="field">
          {t('body.day')}
          <input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        </label>

        <button type="submit" className="button button--primary" disabled={!valid}>{t('common.save')}</button>
      </form>
    </Card>
  )
}

function MeasurementHistory({ kind, side, rows, preference }: {
  kind: MeasurementKind
  side: string
  rows: BodyMeasurement[]
  preference: 'kg' | 'lb'
}) {
  const { t, i18n } = useTranslation()
  const { removeBodyMeasurement } = useActions()
  const series = measurementSeries(rows, kind.slug, side)
  const summary = measurementSummary(series)
  const unit = unitLabel(kind.unit, preference)
  const shown = (value: number) => toDisplay(value, kind.unit, preference)
  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' })

  return (
    <Card
      heading={kind.sided ? `${t(`body.kinds.${kind.slug}`)} · ${t(SIDE_LABEL[side as keyof typeof SIDE_LABEL])}` : t(`body.kinds.${kind.slug}`)}
      action={summary && (
        <span className="mono muted">
          {shown(summary.latest.value)} {unit}
          {summary.delta !== null && summary.delta !== 0 && (
            <span className="body-delta">
              {` ${summary.delta > 0 ? '+' : '−'}${Math.abs(shown(summary.delta))} ${unit}`}
            </span>
          )}
        </span>
      )}
    >
      <LineChart points={series.map((point) => ({ label: dayLabel(point.day), value: shown(point.value) }))} unit={unit} />

      <ul className="loglist">
        {[...latestPerDay(rows.filter((row) => row.kind === kind.slug && row.side === side))].reverse().map((row) => (
          <li key={row.id} className="loglist__row">
            <span className="mono muted">{dayLabel(row.measuredOn)}</span>
            <span className="row">
              <span className="mono">{shown(row.value)} {unit}</span>
              <button
                type="button"
                className="button button--ghost"
                aria-label={t('body.remove_measurement', { day: dayLabel(row.measuredOn) })}
                onClick={() => void removeBodyMeasurement(row.id)}
              >
                {t('common.delete')}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
