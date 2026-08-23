import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  useActiveProgram, useAllTemplateItems, useOpenSession, useSessions, useTemplates,
} from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { cyclePosition, nextTemplate } from '../lib/domain/cycle.js'
import { Empty, Modal } from '../components/ui.js'

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
  const open = useOpenSession()
  const { startSession } = useActions()
  const [choosing, setChoosing] = useState(false)

  if (open) return <Navigate to={`/sessao/${open.id}`} replace />
  if (!program) return <Empty message={t('dashboard.no_program')} />

  const upcoming = nextTemplate(templates, sessions)
  const finished = sessions.filter((s) => s.status !== 'em_andamento')
  const position = cyclePosition(program.sessionsPerCycle, program.cyclesPerBlock, finished.length)

  async function begin(templateId: string) {
    const session = await startSession(
      program!.id, templateId, position.cycleNumber, position.blockNumber,
    )
    navigate(`/sessao/${session.id}`, { replace: true })
  }

  return (
    <>
      <Empty
        message={t('session.no_open')}
        action={
          <button
            type="button"
            className="button button--primary"
            disabled={templates.length === 0}
            onClick={() => setChoosing(true)}
          >
            {t('session.start_now')}
          </button>
        }
      />

      {choosing && (
        <Modal
          title={t('session.choose_title')}
          closeLabel={t('common.close')}
          onClose={() => setChoosing(false)}
        >
          <p className="mono muted">
            {t('dashboard.cycle', { cycle: position.cycleNumber, block: position.blockNumber })}
          </p>

          <div className="checklist">
            {templates.map((template) => {
              const count = items.filter((i) => i.templateId === template.id).length
              return (
                <button
                  key={template.id}
                  type="button"
                  className="checkitem"
                  onClick={() => void begin(template.id)}
                >
                  <span>
                    {template.name}
                    {template.id === upcoming?.id && (
                      <span className="badge">{t('session.suggested')}</span>
                    )}
                  </span>
                  <span className="mono muted">{t('session.exercise_count', { count })}</span>
                </button>
              )
            })}
          </div>
        </Modal>
      )}
    </>
  )
}
