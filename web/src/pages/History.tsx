import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { blockReportRoute, cycleReportRoute, historyRoute } from '../lib/routes.js'
import { Link } from 'react-router-dom'
import { usePrograms, useSessions, useSetLogs, useTemplatesEver } from '../lib/repo.js'
import { Card, Empty } from '../components/ui.js'
import { groupSessionsByBlock } from '../lib/domain/cycle.js'
import { calendarMonthDays } from '../lib/domain/calendar.js'

/**
 * Calendário mensal. Ele registra o que aconteceu — não é ele que decide o
 * próximo treino, isso é do ciclo. Cada dia com sessão abre o detalhe, que é
 * onde a sessão é corrigida ou apagada.
 */
export function History() {
  const { t, i18n } = useTranslation()
  const sessions = useSessions()
  const programs = usePrograms()
  // Inclui treinos apagados: o calendário conta o que aconteceu, e um treino
  // removido depois não pode apagar a letra das sessões antigas.
  const templates = useTemplatesEver()
  const allSets = useSetLogs()
  const [monthOffset, setMonthOffset] = useState(0)

  const cursor = useMemo(() => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() + monthOffset)
    return date
  }, [monthOffset])

  const byDay = useMemo(() => {
    const map = new Map<string, { id: string; status: string; letter: string; sets: number }>()
    const setsBySession = new Map<string, number>()
    for (const set of allSets) {
      if (set.isWarmup || set.skipped) continue
      setsBySession.set(set.sessionId, (setsBySession.get(set.sessionId) ?? 0) + 1)
    }
    for (const session of sessions) {
      const key = localDayKey(session.startedAt)
      const template = templates.find((x) => x.id === session.templateId)
      const name = session.planSnapshot?.templateName ?? template?.name
      map.set(key, {
        id: session.id,
        status: session.status,
        letter: name?.replace(/[^A-Za-z0-9]/g, '').slice(-1) ?? '·',
        sets: setsBySession.get(session.id) ?? 0,
      })
    }
    return map
  }, [sessions, templates, allSets])

  const sessionGroups = useMemo(() => {
    const byProgram = new Map<string, typeof sessions>()
    for (const session of sessions) {
      const entries = byProgram.get(session.programId) ?? []
      entries.push(session)
      byProgram.set(session.programId, entries)
    }

    return [...byProgram.entries()].map(([programId, entries]) => {
      const program = programs.find((candidate) => candidate.id === programId)
      return {
        id: programId,
        name: program?.name ?? t('history.gone_program'),
        latestAt: entries.at(-1)?.startedAt ?? '',
        periods: [...new Set(entries.map((entry) => entry.periodNumber ?? 1))]
          .sort((a, b) => b - a)
          .map((periodNumber) => ({
            periodNumber,
            blocks: groupSessionsByBlock(
              entries.filter((entry) => (entry.periodNumber ?? 1) === periodNumber),
              program?.sessionsPerCycle ?? 1,
              program?.cyclesPerBlock ?? 1,
            ),
          })),
      }
    }).sort((a, b) => b.latestAt.localeCompare(a.latestAt))
  }, [programs, sessions, t])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const cells = calendarMonthDays(year, month)

  const monthLabel = cursor.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
  const weekdayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

  return (
    <div className="page">
      <header className="page__title">
        <h1>{t('history.title')}</h1>
        <p className="page__description">{t('pages.history')}</p>
      </header>

      {sessions.length === 0 ? (
        <Empty message={t('history.empty')} />
      ) : (
        <>
          <Card
            title={monthLabel}
            action={
              <nav className="calendar-nav" aria-label={t('history.calendar_navigation')}>
                <button
                  type="button"
                  className="button button--ghost"
                  aria-label={t('history.previous_month')}
                  onClick={() => setMonthOffset((value) => value - 1)}
                >
                  <span aria-hidden="true">←</span>
                  <span>{t('history.previous')}</span>
                </button>
                {monthOffset !== 0 && (
                  <button
                    type="button"
                    className="button button--ghost calendar-nav__today"
                    onClick={() => setMonthOffset(0)}
                  >
                    {t('history.current_month')}
                  </button>
                )}
                <button
                  type="button"
                  className="button button--ghost"
                  aria-label={t('history.next_month')}
                  onClick={() => setMonthOffset((value) => value + 1)}
                >
                  <span>{t('history.next')}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </nav>
            }
          >
            <div className="calendar">
              {weekdayKeys.map((key) => (
                <span key={key} className="calendar__head">{t(`weekday.${key}`)}</span>
              ))}
              {cells.map((cell) => {
                const entry = byDay.get(cell.key)
                const content = (
                  <>
                    <span className="calendar__n">{cell.day}</span>
                    {entry && <span className="calendar__letter">{entry.letter}</span>}
                  </>
                )

                if (!entry) {
                  return <span key={cell.key} className={`calendar__day${cell.inCurrentMonth ? '' : ' calendar__day--outside'}`}>{content}</span>
                }
                return (
                  <Link
                    key={cell.key}
                    to={historyRoute(entry.id)}
                    className={`calendar__day calendar__day--${entry.status} calendar__day--link${cell.inCurrentMonth ? '' : ' calendar__day--outside'}`}
                    title={t('history.sets', { count: entry.sets })}
                  >
                    {content}
                  </Link>
                )
              })}
            </div>

            <div className="row mono muted">
              <span className="legend legend--concluida" /> {t('history.done')}
              <span className="legend legend--incompleta" /> {t('history.missed')}
            </div>
          </Card>

          <Card title={t('history.by_cycle')}>
            <div className="history-groups">
              {sessionGroups.map((programGroup) => (
                <section key={programGroup.id} className="history-program">
                  {sessionGroups.length > 1 && <h3 className="history-program__name">{programGroup.name}</h3>}
                  {programGroup.periods.map((period, periodIndex) => (
                    <section key={period.periodNumber} className="history-period">
                      <h3>{t('history.period', { number: period.periodNumber })}</h3>
                      {period.blocks.map((block, blockIndex) => (
                        <details key={block.blockNumber} className="history-block" open={periodIndex === 0 && blockIndex === 0}>
                          <summary>
                            <span>{t('history.block', { number: block.blockNumber })}</span>
                            <span className="history-block__actions">
                              <Link
                                to={blockReportRoute(programGroup.id, period.periodNumber, block.blockNumber)}
                                onClick={(event) => event.stopPropagation()}
                                aria-label={t('reports.open_block', { number: block.blockNumber })}
                              >
                                {t('reports.view')}
                              </Link>
                              <span className="mono muted">{t('history.cycles_count', { count: block.cycles.length })}</span>
                            </span>
                          </summary>
                          <div className="history-block__body">
                            {block.cycles.map((cycle) => (
                              <section key={cycle.cycleNumber} className="history-cycle">
                                <div className="history-cycle__head">
                                  <h4>{t('history.cycle', { number: cycle.cycleNumber })}</h4>
                                  <Link
                                    to={cycleReportRoute(programGroup.id, cycle.cycleNumber)}
                                    aria-label={t('reports.open_cycle', { number: cycle.cycleNumber })}
                                  >
                                    {t('reports.view')}
                                  </Link>
                                </div>
                            <ul className="history-sessions">
                              {cycle.sessions.map((session) => {
                                const template = templates.find((candidate) => candidate.id === session.templateId)
                                return (
                                  <li key={session.id}>
                                    <Link to={historyRoute(session.id)} className="loglist__link">
                                      {session.planSnapshot?.templateName ?? template?.name ?? t('history.gone_template')}
                                    </Link>
                                    <span className="mono muted">
                                      {new Date(session.startedAt).toLocaleDateString(i18n.language)}
                                      {' · '}
                                      {t(`history.${session.status}`)}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                              </section>
                            ))}
                          </div>
                        </details>
                      ))}
                    </section>
                  ))}
                </section>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Chave do dia no fuso local. Usar a data UTC jogaria um treino da noite para
 * o dia seguinte no calendário de quem está a oeste de Greenwich.
 */
function localDayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
