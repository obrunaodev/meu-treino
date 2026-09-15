import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { routes } from '../lib/routes.js'
import { Card } from './ui.js'

/** Aviso do bloco que fechou, entre a última sessão dele e a primeira do seguinte. */
export function BlockReviewCard({ blockNumber, onDismiss }: { blockNumber: number; onDismiss: () => void }) {
  const { t } = useTranslation()
  return (
    <Card tone="quiet">
      <p>{t('dashboard.block_closed', { block: blockNumber })}</p>
      <div className="row">
        <Link className="button button--primary" to={routes.workouts}>{t('dashboard.block_apply')}</Link>
        <button type="button" className="button button--ghost" onClick={onDismiss}>{t('dashboard.block_dismiss')}</button>
      </div>
    </Card>
  )
}
