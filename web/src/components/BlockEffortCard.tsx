import { useTranslation } from 'react-i18next'
import { DELOAD_RULES, deloadSignal, type BlockEffort } from '../lib/domain/deload.js'
import { Card } from './ui.js'

/**
 * Leitura de esforço do bloco, sempre visível no relatório.
 *
 * O aviso do dashboard aparece e some; aqui ficam os números e os limites que
 * o produzem, para conferir a conta mesmo quando nada é sugerido.
 */
export function BlockEffortCard({ effort }: { effort: BlockEffort | null }) {
  const { t } = useTranslation()
  const signal = deloadSignal(effort)

  return (
    <Card title={t('reports.effort_title')}>
      {effort === null ? <p className="muted">{t('reports.effort_insufficient', { sessions: DELOAD_RULES.minSessions })}</p> : (
        <>
          <div className="report__stats">
            <div className="report-metric">
              <span>{t('reports.effort_heavy')}</span>
              <strong>{Math.round(effort.heavyShare * 100)}%</strong>
              <small>{t('reports.effort_heavy_hint', { heavy: effort.heavySets, rated: effort.ratedSets, limit: Math.round(DELOAD_RULES.heavyShare * 100) })}</small>
            </div>
            <div className="report-metric">
              <span>{t('reports.effort_pain')}</span>
              <strong>{effort.painSessions}</strong>
              <small>{t('reports.effort_pain_hint', { level: DELOAD_RULES.painLevel, sessions: DELOAD_RULES.painSessions })}</small>
            </div>
          </div>
          <p className="mono muted">{t(signal.suggest ? 'reports.effort_suggests' : 'reports.effort_ok')}</p>
        </>
      )}
    </Card>
  )
}
