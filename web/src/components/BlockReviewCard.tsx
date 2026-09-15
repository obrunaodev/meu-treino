import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DELOAD_RULES, type BlockEffort, type DeloadSignal } from '../lib/domain/deload.js'
import { routes } from '../lib/routes.js'
import { Card } from './ui.js'

/**
 * Aviso do bloco que fechou, entre a última sessão dele e a primeira do
 * seguinte. Quando o bloco fechou pesado, diz também o porquê — com os números
 * que levaram à sugestão, nunca só o veredito. Nada muda no plano.
 */
export function BlockReviewCard({ blockNumber, effort, signal, reportHref, onDismiss }: {
  blockNumber: number
  effort: BlockEffort | null
  signal: DeloadSignal
  reportHref: string
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  return (
    <Card tone="quiet">
      <p>{t('dashboard.block_closed', { block: blockNumber })}</p>
      {signal.suggest && <>
        <p>{t('dashboard.deload_hint', { block: blockNumber })}</p>
        <ul className="deload-reasons">
          {signal.reasons.includes('effort') && effort && <li className="mono muted">
            {t('deload.reason_effort', {
              percent: Math.round(effort.heavyShare * 100),
              limit: Math.round(DELOAD_RULES.heavyShare * 100),
            })}
          </li>}
          {signal.reasons.includes('pain') && effort && <li className="mono muted">
            {t('deload.reason_pain', { count: effort.painSessions, level: DELOAD_RULES.painLevel })}
          </li>}
        </ul>
      </>}
      <div className="row">
        <Link className="button button--primary" to={routes.workouts}>{t('dashboard.block_apply')}</Link>
        <Link className="button button--quiet" to={reportHref}>{t('deload.open_report')}</Link>
        <button type="button" className="button button--ghost" onClick={onDismiss}>{t('dashboard.block_dismiss')}</button>
      </div>
    </Card>
  )
}
