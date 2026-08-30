import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { routes } from '../lib/routes.js'
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
  const kind = conflicts > 0 ? 'conflict' : !online ? 'offline' : pending > 0 ? 'pending' : null
  const [dismissed, setDismissed] = useState<typeof kind>(null)
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)
  const currentDragY = useRef(0)

  useEffect(() => {
    if (kind === null) setDismissed(null)
  }, [kind])

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    startY.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return
    currentDragY.current = Math.max(0, event.clientY - startY.current)
    setDragY(currentDragY.current)
  }

  function pointerEnd() {
    startY.current = null
    if (currentDragY.current >= 48) setDismissed(kind)
    currentDragY.current = 0
    setDragY(0)
  }

  if (kind === null || dismissed === kind) return null

  const content = kind === 'conflict' ? (
    <Link to={routes.conflicts} className="sync-toast__link">
      <span className="sync-toast__dot" aria-hidden="true" />
      <span className="sync-toast__copy">
        <strong>{t('sync.conflict', { count: conflicts })}</strong>
        <span>{t('sync.resolve')}</span>
      </span>
      <span className="sync-toast__arrow" aria-hidden="true">→</span>
    </Link>
  ) : (
    <>
      <span className="sync-toast__dot" aria-hidden="true" />
      <span className="sync-toast__copy">
        {kind === 'offline' ? t('sync.offline') : t('sync.pending', { count: pending })}
      </span>
    </>
  )

  return (
    <div
      className={`sync-toast sync-toast--${kind}`}
      role={kind === 'conflict' ? 'alert' : 'status'}
      style={{ transform: `translateY(${dragY}px)` }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
    >
      {content}
      <button
        type="button"
        className="sync-toast__close"
        aria-label={t('sync.dismiss')}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setDismissed(kind)}
      >×</button>
    </div>
  )
}
