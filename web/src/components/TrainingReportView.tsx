import { useTranslation } from 'react-i18next'
import { kgToLb, type Unit } from '../lib/domain/load.js'
import type { TrainingReport } from '../lib/domain/training-report.js'
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
  const { t } = useTranslation()
  return <Card title={t('reports.exercise_breakdown')}>
    {report.exercises.length === 0 ? <p className="muted">{t('reports.no_exercises')}</p> : (
      <ul className="report-exercises">{report.exercises.map((exercise) => <li key={exercise.exerciseId}>
        <div className="report-exercises__head">
          <strong>{exercise.name}</strong>
          <span className={`badge${exercise.workingSets ? '' : ' badge--muted'}`}>
            {t(exercise.workingSets ? 'reports.recorded' : exercise.skipped ? 'reports.skipped' : 'reports.pending')}
          </span>
        </div>
        <p className="report-exercises__target">
          {exercise.targets.join(' · ') || '—'}
          {exercise.targetRir.length ? ` · ${exercise.targetRir.map((rir) => t(rirLabelKey(rir)!)).join(' / ')}` : ''}
          {exercise.equipment.length ? ` · ${exercise.equipment.join(', ')}` : ''}
        </p>
        <dl>
          <Datum label={t('reports.sets')} value={`${exercise.workingSets}/${exercise.plannedSets || '—'}`} />
          <Datum label={t('reports.repetitions')} value={number.format(exercise.repetitions)} />
          <Datum label={t('reports.top_load')} value={exercise.maxWeightKg === null ? '—' : load(exercise.maxWeightKg)} />
          <Datum label={t('reports.average_effort')} value={exercise.averageRir === null ? '—' : t(rirLabelKey(Math.round(exercise.averageRir))!)} />
          <Datum label={t('reports.volume')} value={volume(exercise.volumeKg)} />
        </dl>
      </li>)}</ul>
    )}
  </Card>
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
