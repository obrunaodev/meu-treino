import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  useActiveProgram, useExercises, useOpenSession, useSessions,
  useSetLogs, useSettings, useTemplateItems, useTemplates,
} from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { blockJustClosed, currentStreak, cyclePosition, nextTemplate } from '../lib/domain/cycle.js'
import { recentLoadTrends, sessionsByWeek } from '../lib/domain/dashboard.js'
import { formatLoad } from '../lib/domain/load.js'
import { sideLabel } from '../lib/labels.js'
import { Card, Empty, Select } from '../components/ui.js'
import { ColumnChart, LineChart } from '../components/charts.js'

export function Dashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const program = useActiveProgram()
  const templates = useTemplates(program?.id)
  const sessions = useSessions()
  const openSession = useOpenSession()
  const settings = useSettings()
  const exercises = useExercises()
  const allSets = useSetLogs()
  const { startSession } = useActions()

  const [dismissedBlock, setDismissedBlock] = useState<number | null>(null)
  const [selectedExerciseId, setSelectedExerciseId] = useState('')
  const finished = sessions.filter((s) => s.status !== 'em_andamento')
  const upcoming = nextTemplate(templates, sessions)
  const currentItems = useTemplateItems(upcoming?.id)
  const items = openSession?.planSnapshot?.items ?? currentItems
  const position = cyclePosition(
    program?.sessionsPerCycle ?? 1,
    program?.cyclesPerBlock ?? 1,
    finished.length,
  )

  const loadTrends = recentLoadTrends(exercises, sessions, allSets)
  const selectedTrend = loadTrends.find((trend) => trend.exerciseId === selectedExerciseId) ?? loadTrends[0]
  const dateLabel = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit' })
  const weeklySessions = sessionsByWeek(sessions).map((week) => ({
    label: dateLabel.format(new Date(`${week.weekStart}T12:00:00Z`)),
    value: week.value,
  }))
  const loadPoints = selectedTrend?.points.map((point) => ({
    label: dateLabel.format(new Date(point.at)),
    value: point.value,
  })) ?? []
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const completed = finished.filter((session) => session.status === 'concluida').length
  const adherence = finished.length === 0 ? 0 : Math.round((completed / finished.length) * 100)
  const streak = currentStreak(sessions)
  const sessionsInCycle = finished.length % (program?.sessionsPerCycle ?? 1)

  const blockClosed =
    program &&
    blockJustClosed(program.sessionsPerCycle, program.cyclesPerBlock, finished.length) &&
    dismissedBlock !== position.blockNumber

  async function begin() {
    if (!program || !upcoming) return
    const session = await startSession(
      program.id,
      upcoming.id,
      position.cycleNumber,
      position.blockNumber,
    )
    navigate(`/sessao/${session.id}`)
  }

  if (!program) {
    return (
      <Empty
        message={t('dashboard.no_program')}
        action={
          <Link className="button button--primary" to="/onboarding">
            {t('dashboard.create_program')}
          </Link>
        }
      />
    )
  }

  return (
    <div className="page dashboard">
      <header className="dashboard__head">
        <div className="page__title">
          <span className="eyebrow">
            {t('dashboard.cycle', { cycle: position.cycleNumber, block: position.blockNumber })}
          </span>
          <h1>{t('dashboard.title')}</h1>
        </div>
        <Link className="button button--quiet dashboard__history" to="/historico">
          {t('dashboard.view_history')}
        </Link>
      </header>

      {blockClosed && (
        <Card tone="quiet">
          <p>
            {t('dashboard.block_closed', {
              block: position.blockNumber - 1,
              delta: program.rirDeltaPerBlock > 0 ? `+${program.rirDeltaPerBlock}` : program.rirDeltaPerBlock,
            })}
          </p>
          <div className="row">
            <Link className="button button--primary" to="/treinos">
              {t('dashboard.block_apply')}
            </Link>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setDismissedBlock(position.blockNumber)}
            >
              {t('dashboard.block_dismiss')}
            </button>
          </div>
        </Card>
      )}

      <section className="dashboard__next" aria-labelledby="dashboard-next-title">
        <div>
          <h2 id="dashboard-next-title" className="card__title">{t('dashboard.next')}</h2>
          <strong>{openSession
            ? openSession.planSnapshot?.templateName ?? templates.find((x) => x.id === openSession.templateId)?.name
            : upcoming?.name}</strong>
          <span>{t('dashboard.exercises', { count: items.length })}</span>
        </div>
        {openSession ? (
          <Link className="button button--primary" to={`/sessao/${openSession.id}`}>
            {t('dashboard.resume')}
          </Link>
        ) : (
          <button type="button" className="button button--primary" onClick={() => void begin()} disabled={!upcoming}>
            {t('dashboard.start')}
          </button>
        )}
      </section>

      {finished.length === 0 ? (
        <Empty message={t('dashboard.empty')} />
      ) : (
        <>
          <div className="dashboard__stats">
            <DashboardMetric label={t('dashboard.sessions')} value={`${completed}/${finished.length}`} hint={t('dashboard.adherence_value', { value: adherence })} tone="good" />
            <DashboardMetric label={t('dashboard.streak')} value={streak} hint={t('dashboard.streak_value', { count: streak })} />
            <DashboardMetric label={t('dashboard.cycle_progress')} value={`${sessionsInCycle}/${program.sessionsPerCycle}`} hint={t('dashboard.cycle_progress_hint')} />
            <DashboardMetric label={t('dashboard.block_progress')} value={position.sessionsToBlockEnd} hint={t('dashboard.block_remaining', { count: position.sessionsToBlockEnd })} tone="quiet" />
          </div>

          <div className="dashboard__data">
            <Card title={t('dashboard.frequency')}>
              <p className="dashboard__chart-copy">{t('dashboard.frequency_hint')}</p>
              <ColumnChart points={weeklySessions} unit={t('dashboard.sessions_unit')} height={180} />
            </Card>
            <Card title={t('dashboard.load')}>
              {selectedTrend ? (
                <>
                  <div className="dashboard__chart-head">
                    <Select
                      label={t('dashboard.exercise')}
                      value={selectedTrend.exerciseId}
                      onChange={setSelectedExerciseId}
                    >
                      {loadTrends.map((trend) => (
                        <option key={trend.exerciseId} value={trend.exerciseId}>{trend.name}</option>
                      ))}
                    </Select>
                    <strong className={`dashboard__delta dashboard__delta--${selectedTrend.direction}`}>
                      {selectedTrend.direction === 'up' ? '↑' : selectedTrend.direction === 'down' ? '↓' : '='}
                      {' '}
                      {formatLoad(
                        selectedTrend.points.at(-1)!.value - selectedTrend.points[0]!.value,
                        null,
                        settings?.unit ?? 'kg',
                        false,
                        sideLabel(exerciseById.get(selectedTrend.exerciseId), t),
                      )}
                    </strong>
                  </div>
                  <LineChart points={loadPoints} unit={settings?.unit ?? 'kg'} height={180} />
                </>
              ) : <p className="muted">{t('dashboard.load_empty')}</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function DashboardMetric({ label, value, hint, tone }: {
  label: string
  value: string | number
  hint: string
  tone?: 'good' | 'quiet'
}) {
  return (
    <section className={`dashboard__metric${tone ? ` dashboard__metric--${tone}` : ''}`}>
      <h2>{label}</h2>
      <strong>{value}</strong>
      <span>{hint}</span>
    </section>
  )
}
