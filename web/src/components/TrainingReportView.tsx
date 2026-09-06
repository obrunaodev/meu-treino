import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { kgToLb, type Unit } from '../lib/domain/load.js'
import type { ExerciseSetReport, TrainingReport } from '../lib/domain/training-report.js'
import { historyRoute } from '../lib/routes.js'
import { Card } from './ui.js'
import { rirLabelKey } from '../lib/domain/rir.js'

/** Resumo numérico e detalhamento por exercício compartilhado pelos três relatórios. */
export function TrainingReportView({ report, unit }: { report: TrainingReport; unit: Unit }) {
  const { t, i18n } = useTranslation()
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 })
  const load = (kg: number) => `${number.format(unit === 'lb' ? kgToLb(kg) : kg)} ${unit}`
  const volume = (kg: number) => `${load(kg)}·rep`

  return (
    <div className="report">
      <ReportSummary report={report} number={number} volume={volume} />
      <ExerciseBreakdown report={report} number={number} load={load} volume={volume} />
    </div>
  )
}

function ReportSummary({ report, number, volume }: {
  report: TrainingReport
  number: Intl.NumberFormat
  volume: (kg: number) => string
}) {
  const { t } = useTranslation()
  return <Card title={t('reports.summary')}><div className="report__stats">
    <Metric label={t('reports.adherence')} value={`${report.adherence}%`} hint={t('reports.exercises_done', { done: report.completedExercises, total: report.plannedExercises })} />
    <Metric label={t('reports.duration')} value={duration(report.durationSeconds)} hint={t('reports.sessions', { count: report.sessions })} />
    <Metric label={t('reports.working_sets')} value={report.workingSets} hint={t('reports.warmups', { count: report.warmupSets })} />
    <Metric label={t('reports.volume')} value={volume(report.volumeKg)} hint={t('reports.total_load')} />
    <Metric label={t('reports.cardio')} value={duration(report.cardioSeconds)} hint={t('reports.distance', { value: number.format(report.cardioDistanceKm) })} />
    <Metric label={t('reports.pain')} value={report.painEvents} hint={t('reports.worst_pain', { value: report.worstPain })} />
  </div></Card>
}

function ExerciseBreakdown({ report, number, load, volume }: {
  report: TrainingReport
  number: Intl.NumberFormat
  load: (kg: number) => string
  volume: (kg: number) => string
}) {
  const { t, i18n } = useTranslation()
  return <section className="report-breakdown" aria-labelledby="report-breakdown-title">
    <header className="report-breakdown__title">
      <span className="eyebrow">{t('reports.series_detail')}</span>
      <h2 id="report-breakdown-title">{t('reports.exercise_breakdown')}</h2>
      <p className="muted">{t('reports.exercise_breakdown_hint')}</p>
    </header>
    {report.exercises.length === 0 ? <p className="muted">{t('reports.no_exercises')}</p> : (
      <ol className="report-exercises">{report.exercises.map((exercise, index) => <li key={exercise.exerciseId}>
        <div className="report-exercises__head">
          <span className="report-exercises__index mono">{String(index + 1).padStart(2, '0')}</span>
          <div><h3>{exercise.name}</h3><p className="report-exercises__target">
            {exercise.targets.join(' · ') || '—'}
            {exercise.targetRir.length ? ` · ${exercise.targetRir.map((rir) => t(rirLabelKey(rir)!)).join(' / ')}` : ''}
            {exercise.equipment.length ? ` · ${exercise.equipment.join(', ')}` : ''}
          </p></div>
          <span className={`badge${exercise.workingSets ? '' : ' badge--muted'}`}>
            {t(exercise.workingSets ? 'reports.recorded' : exercise.skipped ? 'reports.skipped' : 'reports.pending')}
          </span>
        </div>
        <dl className="report-exercises__totals">
          <Datum label={t('reports.sets')} value={`${exercise.workingSets}/${exercise.plannedSets || '—'}`} />
          <Datum label={t('reports.repetitions')} value={number.format(exercise.repetitions)} />
          <Datum label={t('reports.top_load')} value={exercise.maxWeightKg === null ? '—' : load(exercise.maxWeightKg)} />
          <Datum label={t('reports.average_effort')} value={exercise.averageRir === null ? '—' : t(rirLabelKey(Math.round(exercise.averageRir))!)} />
          <Datum label={t('reports.volume')} value={volume(exercise.volumeKg)} />
        </dl>
        <ExerciseSets sets={exercise.sets} load={load} locale={i18n.language} />
      </li>)}</ol>
    )}
  </section>
}

function ExerciseSets({ sets, load, locale }: {
  sets: ExerciseSetReport[]
  load: (kg: number) => string
  locale: string
}) {
  const { t } = useTranslation()
  const bySession = new Map<string, ExerciseSetReport[]>()
  for (const set of [...sets].sort((a, b) => (
    a.sessionStartedAt.localeCompare(b.sessionStartedAt) || a.setIndex - b.setIndex
  ))) {
    bySession.set(set.sessionId, [...(bySession.get(set.sessionId) ?? []), set])
  }

  return <div className="report-series">
    {[...bySession.values()].map((sessionSets) => {
      const first = sessionSets[0]!
      return <section className="report-series__session" key={first.sessionId}>
        <header>
          <div>
            <strong>{first.sessionName || t('history.gone_template')}</strong>
            <span className="mono muted">{new Date(first.sessionStartedAt).toLocaleDateString(locale, { dateStyle: 'medium' })}</span>
          </div>
          <Link to={historyRoute(first.sessionId)}>{t('reports.open_session')}</Link>
        </header>
        <ol>{sessionSets.map((set) => <li className={set.skipped ? 'report-series__row report-series__row--off' : 'report-series__row'} key={set.id}>
          <div className="report-series__set">
            <strong>{set.isWarmup ? t('reports.warmup_set', { number: set.setIndex + 1 }) : t('session.set', { n: set.setIndex + 1 })}</strong>
            <span className="mono muted">{set.completedAt ? new Date(set.completedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
          </div>
          <Datum label={t('session.load')} value={set.weightKg === null ? '—' : `${load(set.weightKg)}${set.loadPerSide ? `/${t('session.per_side_short')}` : ''}${set.plateCount !== null ? ` · ${t('reports.plate_position', { number: set.plateCount })}` : ''}`} />
          <Datum label={set.seconds !== null ? t('session.seconds') : t('session.reps')} value={set.seconds ?? set.reps ?? '—'} />
          <Datum label={t('rir.label')} value={set.rir === null ? '—' : t(rirLabelKey(set.rir)!)} />
          <Datum label={t('session.side')} value={t(`session.side_${set.side === 'ambos' ? 'both' : set.side === 'D' ? 'right' : 'left'}`)} />
          <div className="report-series__flags">
            {set.skipped && <span>{t('reports.skipped')}</span>}
            {set.hadPain && <span>{t('reports.pain_marked')}</span>}
          </div>
        </li>)}</ol>
      </section>
    })}
  </div>
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <div className="report-metric"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>
}

function Datum({ label, value }: { label: string; value: string | number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function duration(seconds: number) {
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${String(minutes).padStart(2, '0')}min` : `${minutes}min`
}
