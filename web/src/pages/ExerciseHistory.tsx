import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { LineChart } from '../components/charts.js'
import { ReportSetRow } from '../components/TrainingReportView.js'
import { Card, Empty } from '../components/ui.js'
import {
  availableMetrics, exerciseSessionHistory, historySeries, pageByMonth,
  type ExerciseSessionHistory, type HistoryMetric, type HistoryRange,
} from '../lib/domain/exercise-history.js'
import { estimateOneRepMax, kgToLb, type Unit } from '../lib/domain/load.js'
import { personalRecords, type RecordBaseline, type RecordKind } from '../lib/domain/records.js'
import { historyRoute, routes } from '../lib/routes.js'
import { useEquipment, useExercises, useSessions, useSetLogs, useSettings } from '../lib/repo.js'

const PAGE_SIZE = 10

/** Tudo o que já foi registrado de um exercício, com a evolução no tempo. Só leitura, e offline. */
export function ExerciseHistory() {
  const { t, i18n } = useTranslation()
  const { exerciseId = '' } = useParams()
  const exercise = useExercises().find((entry) => entry.id === exerciseId) ?? null
  const sessions = useSessions()
  const sets = useSetLogs()
  const equipment = useEquipment()
  const settings = useSettings()
  const history = exerciseSessionHistory(exerciseId, exercise, sessions, sets, equipment)
  // Exercício apagado continua com histórico: o nome vem do plano da sessão mais recente.
  const capturedName = history
    .map((entry) => sessions.find((session) => session.id === entry.sessionId)?.planSnapshot?.items
      .find((item) => item.exerciseId === exerciseId)?.exerciseName)
    .find(Boolean)
  const name = exercise?.name ?? capturedName ?? t('library.gone')
  const workingSets = history.reduce((total, entry) => total + entry.workingSets, 0)
  const records = personalRecords(history)
  const since = history.at(-1) && new Date(history.at(-1)!.startedAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' })

  return (
    <div className="page">
      <Link className="button button--ghost" to={routes.exercises}>← {t('common.back')}</Link>
      <header className="page__title">
        <span className="eyebrow">{t('exercise_history.eyebrow')}</span>
        <h1>{name}</h1>
        {since && <p className="page__description">{t('exercise_history.summary', { count: history.length, sets: workingSets, since })}</p>}
      </header>
      {history.length === 0 ? <Empty message={t('exercise_history.empty')} /> : (
        <>
          <ProgressCard history={history} unit={settings?.unit ?? 'kg'} perSide={exercise?.loadPerSide ?? false} />
          <RecordsCard records={records.baseline} unit={settings?.unit ?? 'kg'} perSide={exercise?.loadPerSide ?? false}
            bodyweight={history.some((entry) => entry.sets.some((set) => set.bodyweight))} />
          <SessionList history={history} unit={settings?.unit ?? 'kg'} flags={records.flagsBySetId} />
        </>
      )}
    </div>
  )
}

function OptionSwitch<T extends string>({ label, options, value, onChange, labelOf }: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  labelOf: (option: T) => string
}) {
  return (
    <div className="view-switch" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>
          {labelOf(option)}
        </button>
      ))}
    </div>
  )
}

/**
 * Carga e 1RM aparecem no modo de carga de hoje: por lado, a metade do total,
 * como o usuário lê na máquina. Volume é sempre o total movido.
 */
function chartValue(value: number, metric: HistoryMetric, unit: Unit, perSide: boolean): number {
  if (metric !== 'top_load' && metric !== 'e1rm') return Math.round(value)
  const load = perSide ? value / 2 : value
  return Number((unit === 'lb' ? kgToLb(load) : load).toFixed(1))
}

function ProgressCard({ history, unit, perSide }: { history: ExerciseSessionHistory[]; unit: Unit; perSide: boolean }) {
  const { t, i18n } = useTranslation()
  const metrics = availableMetrics(history)
  const [chosen, setChosen] = useState<HistoryMetric>('top_load')
  const [range, setRange] = useState<HistoryRange>('recent')
  const metric = metrics.includes(chosen) ? chosen : metrics[0]
  if (!metric) return null

  const series = historySeries(history, metric, range)
  const spansYears = new Set(series.map((point) => point.key.slice(0, 4))).size > 1
  const format: Intl.DateTimeFormatOptions = range === 'all'
    ? { month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short', ...(spansYears ? { year: '2-digit' } : {}) }
  const points = series.map((point) => ({
    label: new Date(point.at).toLocaleDateString(i18n.language, format),
    value: chartValue(point.value, metric, unit, perSide),
  }))
  const loadUnit = perSide ? `${unit}/${t('session.per_side_short')}` : unit
  const chartUnit = { top_load: loadUnit, e1rm: loadUnit, volume: 'kg·rep', best_reps: t('session.reps'), best_seconds: 's' }[metric]

  return (
    <Card title={t('exercise_history.progress')}>
      <OptionSwitch label={t('exercise_history.metric_label')} options={metrics} value={metric} onChange={setChosen} labelOf={(option) => t(`exercise_history.metric_${option}`)} />
      <OptionSwitch label={t('exercise_history.range_label')} options={['recent', 'all'] as const} value={range} onChange={setRange} labelOf={(option) => t(`exercise_history.range_${option}`)} />
      <LineChart points={points} unit={chartUnit} height={140} />
      {metric === 'e1rm' && <p className="mono muted">{t('exercise_history.e1rm_hint')}</p>}
    </Card>
  )
}

function RecordsCard({ records, unit, perSide, bodyweight }: { records: RecordBaseline; unit: Unit; perSide: boolean; bodyweight: boolean }) {
  const { t } = useTranslation()
  const loadUnit = perSide ? `${unit}/${t('session.per_side_short')}` : unit
  const load = (kg: number | null) => (kg === null ? null : `${chartValue(kg, 'top_load', unit, perSide)} ${loadUnit}`)
  const stats: Array<{ kind: RecordKind; value: string | null }> = [
    { kind: 'top_load', value: load(records.topLoadKg) },
    { kind: 'e1rm', value: load(records.e1rmKg) },
    { kind: 'session_volume', value: records.sessionVolumeKg === null ? null : `${Math.round(records.sessionVolumeKg)} kg·rep` },
    { kind: 'longest_set', value: records.longestSeconds === null ? null : `${records.longestSeconds} s` },
  ]

  return (
    <Card title={t('records.title')}>
      {records.sessions < 2 && <p className="mono muted">{t('records.none')}</p>}
      <div className="report__stats">{stats.filter((stat) => stat.value !== null).map((stat) => (
        <div className="report-metric" key={stat.kind}><span>{t(`records.kind_${stat.kind}`)}</span><strong>{stat.value}</strong></div>
      ))}</div>
      {records.frontier.length > 0 && <RepTable records={records} unit={unit} perSide={perSide} loadUnit={loadUnit} bodyweight={bodyweight} />}
    </Card>
  )
}

/** Melhor carga em cada número de repetições — a fronteira que um recorde de repetições precisa furar. */
function RepTable({ records, unit, perSide, loadUnit, bodyweight }: {
  records: RecordBaseline; unit: Unit; perSide: boolean; loadUnit: string; bodyweight: boolean
}) {
  const { t, i18n } = useTranslation()
  return (
    <table className="viz-table">
      <caption className="card__title">{t('records.rep_table')}</caption>
      <thead><tr>
        <th scope="col">{t('records.col_reps')}</th>
        <th scope="col">{t('records.col_load')} ({loadUnit})</th>
        {!bodyweight && <th scope="col">{t('records.col_e1rm')}</th>}
        <th scope="col">{t('records.col_date')}</th>
      </tr></thead>
      <tbody>{[...records.frontier].sort((a, b) => a.reps - b.reps).map((point) => {
        const e1rm = estimateOneRepMax(point.totalKg, point.reps)
        return (
          <tr key={`${point.reps}:${point.totalKg}`}>
            <th scope="row">{point.reps}</th>
            <td>{chartValue(point.totalKg, 'top_load', unit, perSide)}</td>
            {!bodyweight && <td>{e1rm === null ? '—' : chartValue(e1rm, 'e1rm', unit, perSide)}</td>}
            <td><Link to={historyRoute(point.sessionId)}>{new Date(point.at).toLocaleDateString(i18n.language, { dateStyle: 'medium' })}</Link></td>
          </tr>
        )
      })}</tbody>
    </table>
  )
}

function SessionList({ history, unit, flags }: { history: ExerciseSessionHistory[]; unit: Unit; flags: Map<string, RecordKind[]> }) {
  const { t, i18n } = useTranslation()
  const [visible, setVisible] = useState(PAGE_SIZE)
  const { months, hasMore } = pageByMonth(history, visible)
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 })
  const load = (kg: number) => `${number.format(unit === 'lb' ? kgToLb(kg) : kg)} ${unit}`

  return (
    <Card title={t('exercise_history.sessions')}>
      {months.map((month) => (
        <section className="exercise-history__month" key={month.monthKey}>
          <h3 className="card__title">
            {new Date(`${month.monthKey}-15T12:00:00`).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}
          </h3>
          <div className="report-series exercise-history__series">
            {month.sessions.map((session) => (
              <section className="report-series__session" key={session.sessionId}>
                <header>
                  <div>
                    <strong>{session.sessionName || t('history.gone_template')}</strong>
                    <span className="mono muted">
                      {new Date(session.startedAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' })} · {t(`history.${session.status}`)}
                    </span>
                  </div>
                  <Link to={historyRoute(session.sessionId)}>{t('reports.open_session')}</Link>
                </header>
                <ol>{session.sets.map((set) => <ReportSetRow key={set.id} set={set} load={load} locale={i18n.language} recordKinds={flags.get(set.id)} />)}</ol>
              </section>
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <button type="button" className="button button--quiet" onClick={() => setVisible((count) => count + PAGE_SIZE)}>
          {t('exercise_history.show_older')}
        </button>
      )}
    </Card>
  )
}
