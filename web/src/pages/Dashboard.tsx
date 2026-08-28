import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  useActiveProgram, useOpenSession, useSessions, useTemplateItems, useTemplates,
} from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { blockJustClosed, currentStreak, cyclePosition, nextTemplate } from '../lib/domain/cycle.js'
import { sessionsByWeek, weeksToBlockEnd } from '../lib/domain/dashboard.js'
import { Card, Empty } from '../components/ui.js'
import { DashboardAnalytics } from '../components/DashboardAnalytics.js'

export function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const program = useActiveProgram()
  const templates = useTemplates(program?.id)
  const sessions = useSessions()
  const openSession = useOpenSession()
  const { startSession } = useActions()

  const [dismissedBlock, setDismissedBlock] = useState<number | null>(null)
  const finished = sessions.filter((s) => s.status !== 'em_andamento')
  const upcoming = nextTemplate(templates, sessions)
  const currentItems = useTemplateItems(upcoming?.id)
  const items = openSession?.planSnapshot?.items ?? currentItems
  const position = cyclePosition(
    program?.sessionsPerCycle ?? 1,
    program?.cyclesPerBlock ?? 1,
    finished.length,
  )

  const completed = finished.filter((session) => session.status === 'concluida').length
  const adherence = finished.length === 0 ? 0 : Math.round((completed / finished.length) * 100)
  const streak = currentStreak(sessions)
  const sessionsInCycle = finished.length % (program?.sessionsPerCycle ?? 1)
  const blockWeeks = weeksToBlockEnd(position.sessionsToBlockEnd, sessions)
  const sessionsPerBlock = (program?.sessionsPerCycle ?? 1) * (program?.cyclesPerBlock ?? 1)
  const blockDone = sessionsPerBlock - position.sessionsToBlockEnd
  const currentWeekSessions = sessionsByWeek(sessions).at(-1)?.value ?? 0

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
          <p className="page__description">{t('pages.dashboard')}</p>
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
            <DashboardMetric label={t('dashboard.week_sessions')} value={currentWeekSessions} hint={t('dashboard.current_week')} tone="good" />
            <DashboardMetric label={t('dashboard.streak')} value={streak} hint={t('dashboard.adherence_value', { value: adherence })} />
            <DashboardMetric label={t('dashboard.cycle_progress')} value={`${sessionsInCycle}/${program.sessionsPerCycle}`} hint={t('dashboard.cycle_progress_hint')} />
            <DashboardMetric
              label={t('dashboard.block_review')}
              value={blockWeeks === null ? '—' : t('dashboard.weeks_value', { count: blockWeeks })}
              hint={blockWeeks === null
                ? t('dashboard.block_no_pace')
                : t('dashboard.block_remaining', { count: position.sessionsToBlockEnd })}
              tone="quiet"
              progress={{ value: blockDone, max: sessionsPerBlock }}
            />
          </div>

          <DashboardAnalytics />
        </>
      )}
    </div>
  )
}

function DashboardMetric({ label, value, hint, tone, progress }: {
  label: string
  value: string | number
  hint: string
  tone?: 'good' | 'quiet'
  progress?: { value: number; max: number }
}) {
  return (
    <section className={`dashboard__metric${tone ? ` dashboard__metric--${tone}` : ''}`}>
      <h2>{label}</h2>
      <strong>{value}</strong>
      <span>{hint}</span>
      {progress && (
        <div className="dashboard__metric-progress" aria-hidden="true">
          <span style={{ width: `${(progress.value / progress.max) * 100}%` }} />
        </div>
      )}
    </section>
  )
}
