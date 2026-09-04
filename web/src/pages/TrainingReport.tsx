import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { TrainingReportView } from '../components/TrainingReportView.js'
import { buildTrainingReport } from '../lib/domain/training-report.js'
import { historyRoute, routes } from '../lib/routes.js'
import { useCardioLogs, useExercises, usePainEvents, useSessions, useSetLogs, useSettings } from '../lib/repo.js'
import { Card, Empty } from '../components/ui.js'

export function TrainingReport({ scope }: { scope: 'cycle' | 'block' }) {
  const { t, i18n } = useTranslation()
  const { programId, cycleNumber, periodNumber, blockNumber } = useParams()
  const sessions = useSessions().filter((session) => {
    if (session.programId !== programId) return false
    if (scope === 'cycle') return session.cycleNumber === Number(cycleNumber)
    return (session.periodNumber ?? 1) === Number(periodNumber) && session.blockNumber === Number(blockNumber)
  })
  const sets = useSetLogs()
  const cardio = useCardioLogs()
  const pain = usePainEvents()
  const exercises = useExercises()
  const settings = useSettings()

  if (sessions.length === 0) return <Empty message={t('reports.not_found')} />
  const report = buildTrainingReport(
    sessions, sets, cardio, pain, new Map(exercises.map((exercise) => [exercise.id, exercise.name])),
  )
  const number = scope === 'cycle' ? cycleNumber : blockNumber

  return (
    <div className="page">
      <Link className="button button--ghost" to={routes.history}>← {t('common.back')}</Link>
      <header className="page__title">
        {scope === 'block' && <span className="eyebrow">{t('history.period', { number: periodNumber })}</span>}
        <h1>{t(`reports.${scope}_title`, { number })}</h1>
        <p className="page__description">{t(`reports.${scope}_description`)}</p>
      </header>

      <TrainingReportView report={report} unit={settings?.unit ?? 'kg'} />

      <Card title={t('reports.included_sessions')}>
        <ul className="history-sessions">
          {[...sessions].reverse().map((session) => (
            <li key={session.id}>
              <Link className="loglist__link" to={historyRoute(session.id)}>
                {session.planSnapshot?.templateName ?? t('history.gone_template')}
              </Link>
              <span className="mono muted">
                {new Date(session.startedAt).toLocaleDateString(i18n.language)} · {t(`history.${session.status}`)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
