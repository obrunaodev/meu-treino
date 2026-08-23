import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useSyncState } from '../lib/sync-context.js'

/** Estado de sincronização em um toast que não desloca o conteúdo da tela. */
export function SyncBar() {
  const { conflicts, pending, online } = useSyncState()
  return <SyncNotice conflicts={conflicts} pending={pending} online={online} />
}

export function SyncNotice({ conflicts, pending, online }: {
  conflicts: number
  pending: number
  online: boolean
}) {
  const { t } = useTranslation()

  if (conflicts > 0) {
    return (
      <Link to="/conflitos" className="sync-toast sync-toast--conflict" role="alert">
        <span className="sync-toast__dot" aria-hidden="true" />
        <span className="sync-toast__copy">
          <strong>{t('sync.conflict', { count: conflicts })}</strong>
          <span>{t('sync.resolve')}</span>
        </span>
        <span className="sync-toast__arrow" aria-hidden="true">→</span>
      </Link>
    )
  }

  if (!online) {
    return (
      <div className="sync-toast sync-toast--offline" role="status">
        <span className="sync-toast__dot" aria-hidden="true" />
        <span className="sync-toast__copy">{t('sync.offline')}</span>
      </div>
    )
  }
  if (pending > 0) {
    return (
      <div className="sync-toast sync-toast--pending" role="status">
        <span className="sync-toast__dot" aria-hidden="true" />
        <span className="sync-toast__copy">{t('sync.pending', { count: pending })}</span>
      </div>
    )
  }
  return null
}
