import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useActiveProgram, useExercises, usePainEvents, useSessions, useSetLogs,
  useSettings, useTemplates,
} from '../lib/repo.js'
import { useCatalogTaxonomy } from '../lib/catalog-taxonomy.js'
import {
  muscleGroupsForWeek, painByWeek, recentLoadTrends, sessionsByWeek, sessionsForWeek,
  type LoadTrend, type MuscleGroupWork, type WeeklySessions,
} from '../lib/domain/dashboard.js'
import { formatLoad } from '../lib/domain/load.js'
import { sideLabel } from '../lib/labels.js'
import type { PainEvent, WorkoutSession } from '../lib/types.js'
import { Card, Select } from './ui.js'
import { ColumnChart, HorizontalBarChart, LineChart } from './charts.js'

type Metric = 'weight' | 'volume'
type ChartPoint = { label: string; value: number }

/** Painel analítico semanal e interativo do dashboard. */
export function DashboardAnalytics() {
  const { t, i18n } = useTranslation()
  const program = useActiveProgram()
  const sessions = useSessions()
  const templates = useTemplates(program?.id)
  const exercises = useExercises()
  const sets = useSetLogs()
  const painEvents = usePainEvents()
  const settings = useSettings()
  const taxonomy = useCatalogTaxonomy()
  const [weekIndex, setWeekIndex] = useState(7)
  const [exerciseId, setExerciseId] = useState('')
  const [metric, setMetric] = useState<Metric>('weight')

  const dateLabel = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit' })
  const weeks = sessionsByWeek(sessions)
  const selectedWeek = weeks[weekIndex] ?? weeks.at(-1)!
  const weekSessions = sessionsForWeek(sessions, selectedWeek.weekStart)
  const trends = recentLoadTrends(exercises, sessions, sets)
  const trend = trends.find((item) => item.exerciseId === exerciseId) ?? trends[0]
  const muscleGroups = muscleGroupsForWeek(
    weekSessions, sets, exercises, taxonomy, t('dashboard.group_unknown'),
  )
  const selectedPain = eventsInWeek(painEvents, selectedWeek.weekStart)
  const labels = { dateLabel, locale: i18n.language }

  return (
    <div className="dashboard__analytics">
      <WeeklyTrainingCard
        weeks={weeks} selectedIndex={weekIndex} sessions={weekSessions}
        templateNames={new Map(templates.map((item) => [item.id, item.name]))}
        dateLabel={dateLabel} onSelect={setWeekIndex}
      />
      <ExerciseProgressCard
        trends={trends} selected={trend} metric={metric} unit={settings?.unit ?? 'kg'}
        exerciseId={exerciseId} labels={labels} exercises={exercises}
        onExercise={setExerciseId} onMetric={setMetric}
      />
      <MuscleGroupsCard points={muscleGroups} />
      <PainHistoryCard
        points={painByWeek(painEvents).map((week) => weekPoint(week, dateLabel))}
        selectedEvents={selectedPain}
      />
    </div>
  )
}

function WeeklyTrainingCard({ weeks, selectedIndex, sessions, templateNames, dateLabel, onSelect }: {
  weeks: WeeklySessions[]
  selectedIndex: number
  sessions: WorkoutSession[]
  templateNames: Map<string, string>
  dateLabel: Intl.DateTimeFormat
  onSelect: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <Card title={t('dashboard.frequency')}>
      <ColumnChart
        points={weeks.map((week) => weekPoint(week, dateLabel))}
        unit={t('dashboard.sessions_unit')} height={120}
        selectedIndex={selectedIndex} onSelect={onSelect}
      />
      <div className="dashboard__week-detail">
        <span className="eyebrow">{t('dashboard.selected_week')}</span>
        {sessions.length ? <ul>{sessions.map((session) => (
          <li key={session.id}>
            <span>{session.planSnapshot?.templateName ?? templateNames.get(session.templateId) ?? '—'}</span>
            <time>{dateLabel.format(new Date(session.startedAt))}</time>
          </li>
        ))}</ul> : <p className="muted">{t('dashboard.week_empty')}</p>}
      </div>
    </Card>
  )
}

function ExerciseProgressCard({ trends, selected, metric, unit, exerciseId, labels, exercises, onExercise, onMetric }: {
  trends: LoadTrend[]
  selected: LoadTrend | undefined
  metric: Metric
  unit: 'kg' | 'lb'
  exerciseId: string
  labels: { dateLabel: Intl.DateTimeFormat; locale: string }
  exercises: ReturnType<typeof useExercises>
  onExercise: (id: string) => void
  onMetric: (metric: Metric) => void
}) {
  const { t } = useTranslation()
  if (!selected) return <Card title={t('dashboard.load')}><p className="muted">{t('dashboard.load_empty')}</p></Card>
  const values = selected.points.map((point) => point[metric])
  const delta = values.at(-1)! - values[0]!
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const points = selected.points.map((point) => ({
    label: labels.dateLabel.format(new Date(point.at)), value: point[metric],
  }))
  const exercise = exercises.find((item) => item.id === selected.exerciseId)
  const deltaLabel = metric === 'weight'
    ? formatLoad(delta, null, unit, false, sideLabel(exercise, t))
    : `${Math.round(delta).toLocaleString(labels.locale)} kg·rep`

  return (
    <Card title={t('dashboard.load')}>
      <div className="dashboard__chart-head">
        <Select label={t('dashboard.exercise')} value={exerciseId || selected.exerciseId} onChange={onExercise}>
          {trends.map((trend) => <option key={trend.exerciseId} value={trend.exerciseId}>{trend.name}</option>)}
        </Select>
        <strong className={`dashboard__delta dashboard__delta--${direction}`}>
          {direction === 'up' ? '↑' : direction === 'down' ? '↓' : '='} {deltaLabel}
        </strong>
      </div>
      <MetricSwitch selected={metric} onSelect={onMetric} />
      <LineChart points={points} unit={metric === 'weight' ? unit : 'kg·rep'} height={120} />
    </Card>
  )
}

function MetricSwitch({ selected, onSelect }: { selected: Metric; onSelect: (metric: Metric) => void }) {
  const { t } = useTranslation()
  return <div className="pills dashboard__metric-switch">{(['weight', 'volume'] as const).map((metric) => (
    <button key={metric} type="button" className={`pill${selected === metric ? ' pill--on' : ''}`} onClick={() => onSelect(metric)}>
      {t(`dashboard.metric_${metric}`)}
    </button>
  ))}</div>
}

function MuscleGroupsCard({ points }: { points: MuscleGroupWork[] }) {
  const { t } = useTranslation()
  return <Card title={t('dashboard.muscle_groups')}>
    <p className="dashboard__chart-copy">{t('dashboard.muscle_hint')}</p>
    {points.length
      ? <HorizontalBarChart points={points} unit={t('dashboard.work_sets')} />
      : <p className="muted">{t('dashboard.muscle_empty')}</p>}
  </Card>
}

function PainHistoryCard({ points, selectedEvents }: { points: ChartPoint[]; selectedEvents: PainEvent[] }) {
  const { t } = useTranslation()
  const worst = selectedEvents.length ? Math.max(...selectedEvents.map((event) => event.level)) : 0
  return <Card title={t('dashboard.pain_history')}>
    <div className="dashboard__pain-summary">
      <span>{t('dashboard.pain_occurrences', { count: selectedEvents.length })}</span>
      <strong>{worst}/10</strong>
    </div>
    <LineChart points={points} unit={t('dashboard.pain_level')} height={120} />
  </Card>
}

function weekPoint(week: WeeklySessions, formatter: Intl.DateTimeFormat) {
  return { label: formatter.format(new Date(`${week.weekStart}T12:00:00Z`)), value: week.value }
}

function eventsInWeek(events: PainEvent[], weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return events.filter((event) => {
    const occurredAt = new Date(event.occurredAt)
    return occurredAt >= start && occurredAt < end
  })
}
