import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  useActiveProgram, useAllTemplateItems, useExercises, useOpenSession, useSessions, useTemplates,
} from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { cyclePosition, nextTemplate } from '../lib/domain/cycle.js'
import { Card, Empty } from '../components/ui.js'

/**
 * `/sessao` sem id: retoma a sessão aberta, ou abre a próxima do ciclo. Existe
 * para a aba do rodapé ter um destino único, sem o usuário precisar saber que
 * sessão tem id.
 */
export function SessionGate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const program = useActiveProgram()
  const templates = useTemplates(program?.id)
  const sessions = useSessions()
  const items = useAllTemplateItems()
  const exercises = useExercises()
  const open = useOpenSession()
  const { startSession } = useActions()
  const [choosing, setChoosing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const upcomingPosition = nextTemplate(templates, sessions)
  const upcoming = templates.find((template) => template.id === upcomingPosition?.id) ?? null
  useEffect(() => {
    if (!selectedId && upcoming) setSelectedId(upcoming.id)
  }, [selectedId, upcoming?.id])

  if (open) return <Navigate to={`/sessao/${open.id}`} replace />
  if (!program) return <Empty message={t('dashboard.no_program')} />

  const selected = templates.find((template) => template.id === selectedId) ?? upcoming ?? templates[0] ?? null
  const selectedItems = items
    .filter((item) => item.templateId === selected?.id)
    .sort((a, b) => a.position - b.position)
  const exerciseNames = new Map(exercises.map((exercise) => [exercise.id, exercise.name]))
  const finished = sessions.filter((s) => s.status !== 'em_andamento')
  const position = cyclePosition(program.sessionsPerCycle, program.cyclesPerBlock, finished.length)

  async function begin(templateId: string) {
    const session = await startSession(
      program!.id, templateId, position.cycleNumber, position.blockNumber,
    )
    navigate(`/sessao/${session.id}`, { replace: true })
  }

  if (!selected) return <Empty message={t('templates.empty')} />

  return (
    <div className="page session-preview">
      <header className="stack stack--tight">
        <span className="eyebrow">{t('session.today_preview')}</span>
        <h1>{t('session.title')}</h1>
        <p className="page__description">{t('pages.session')}</p>
        <div className="row-between">
          <h2>{selected.name}</h2>
          {selected.id === upcoming?.id && <span className="badge">{t('session.suggested')}</span>}
        </div>
        {selected.focus && <p className="muted">{selected.focus}</p>}
        <p className="mono muted">
          {t('dashboard.cycle', { cycle: position.cycleNumber, block: position.blockNumber })}
        </p>
      </header>

      <Card title={t('session.exercise_list')}>
        <ol className="session-preview__exercises">
          {selectedItems.map((item, index) => {
            const range = item.repMin === item.repMax || item.repMax === null
              ? `${item.repMin ?? '—'}`
              : `${item.repMin ?? 0}–${item.repMax}`
            return (
              <li key={item.id}>
                <span className="mono muted">{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{exerciseNames.get(item.exerciseId) ?? t('library.gone')}</strong>
                  <small>{t('session.target', {
                    sets: item.sets,
                    range: item.isTimeBased ? `${range}s` : range,
                    rir: item.rirTarget ?? '—',
                  })}</small>
                </span>
              </li>
            )
          })}
        </ol>
      </Card>

      {choosing && (
        <Card title={t('session.choose_title')}>
          <div className="checklist">
            {templates.map((template) => {
              const count = items.filter((item) => item.templateId === template.id).length
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`checkitem${template.id === selected.id ? ' checkitem--on' : ''}`}
                  onClick={() => { setSelectedId(template.id); setChoosing(false) }}
                >
                  <span>{template.name}</span>
                  <span className="mono muted">{t('session.exercise_count', { count })}</span>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      <div className="session-preview__actions">
        <button type="button" className="button button--ghost" onClick={() => setChoosing(!choosing)}>
          {t('session.choose_other')}
        </button>
        <button type="button" className="button button--primary" onClick={() => void begin(selected.id)}>
          {t('session.start_selected', { name: selected.name })}
        </button>
      </div>
    </div>
  )
}
