import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useSessions, useSetLogs, useTemplatesEver } from '../lib/repo.js'
import { Card, Empty } from '../components/ui.js'

/**
 * Calendário mensal. Ele registra o que aconteceu — não é ele que decide o
 * próximo treino, isso é do ciclo. Cada dia com sessão abre o detalhe, que é
 * onde a sessão é corrigida ou apagada.
 */
export function History() {
  const { t, i18n } = useTranslation()
  const sessions = useSessions()
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

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: Array<{ key: string; day: number | null }> = []
  for (let i = 0; i < firstWeekday; i++) cells.push({ key: `blank-${i}`, day: null })
  for (let day = 1; day <= daysInMonth; day++) cells.push({ key: `d-${day}`, day })

  const monthLabel = cursor.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
  const weekdayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

  return (
    <div className="page">
      <h1>{t('history.title')}</h1>

      {sessions.length === 0 ? (
        <Empty message={t('history.empty')} />
      ) : (
        <>
          <Card
            title={monthLabel}
            action={
              <span className="row">
                <button type="button" className="button button--ghost" onClick={() => setMonthOffset((v) => v - 1)}>‹</button>
                <button type="button" className="button button--ghost" onClick={() => setMonthOffset((v) => v + 1)}>›</button>
              </span>
            }
          >
            <div className="calendar">
              {weekdayKeys.map((key) => (
                <span key={key} className="calendar__head">{t(`weekday.${key}`)}</span>
              ))}
              {cells.map((cell) => {
                if (cell.day === null) return <span key={cell.key} />
                const entry = byDay.get(`${year}-${pad(month + 1)}-${pad(cell.day)}`)
                const content = (
                  <>
                    <span className="calendar__n">{cell.day}</span>
                    {entry && <span className="calendar__letter">{entry.letter}</span>}
                  </>
                )

                if (!entry) {
                  return <span key={cell.key} className="calendar__day">{content}</span>
                }
                return (
                  <Link
                    key={cell.key}
                    to={`/historico/${entry.id}`}
                    className={`calendar__day calendar__day--${entry.status} calendar__day--link`}
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

          <Card title={t('history.list')}>
            <ul className="loglist">
              {[...sessions].reverse().map((session) => {
                const template = templates.find((x) => x.id === session.templateId)
                return (
                  <li key={session.id} className="loglist__row">
                    <Link to={`/historico/${session.id}`} className="loglist__link">
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
