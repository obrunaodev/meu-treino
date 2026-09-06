import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth.js'
import {
  buildBackup, parseBackup, restoreBackup,
  type BackupDocument, type BackupSummary,
} from '../lib/backup.js'
import { buildSetLogCsv, downloadBlob } from '../lib/export.js'
import { runSync } from '../lib/sync.js'
import { flushUploads } from '../lib/uploads.js'
import { Card } from './ui.js'

type SelectedBackup = { document: BackupDocument; summary: BackupSummary; name: string }
type BackupState = 'idle' | 'working' | 'done' | 'error'

/** Portable personal backup controls with an explicit destructive restore step. */
export function BackupCard() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [backup, setBackup] = useState<SelectedBackup | null>(null)
  const [state, setState] = useState<BackupState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function exportBackup() {
    setState('working')
    setError(null)
    setSuccess(null)
    try {
      const result = await buildBackup()
      const day = new Date().toISOString().slice(0, 10)
      downloadBlob(result.blob, `meu-treino-backup-${day}.json`)
      setSuccess('backup_export_done')
      setState('done')
    } catch {
      setError('backup_export_error')
      setState('error')
    }
  }

  async function readBackup(file: File | undefined) {
    if (!file) return
    setState('working')
    setError(null)
    setSuccess(null)
    setConfirmReplace(false)
    try {
      const document = parseBackup(await file.text(), file.size)
      const rows = Object.values(document.entities)
        .reduce((total, entries) => total + (entries?.length ?? 0), 0)
      setBackup({
        document,
        name: file.name,
        summary: { rows, images: document.media.length, exportedAt: document.exportedAt },
      })
      setState('idle')
    } catch (cause) {
      setBackup(null)
      setError(backupErrorKey(cause))
      setState('error')
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function importBackup(mode: 'merge' | 'replace') {
    if (!backup || !user) return
    setState('working')
    setError(null)
    setSuccess(null)
    try {
      await restoreBackup(backup.document, user.id, mode)
      await runSync()
      await flushUploads()
      setSuccess('backup_import_done')
      setState('done')
      setBackup(null)
      setConfirmReplace(false)
    } catch {
      setError('backup_import_error')
      setState('error')
    }
  }

  return <Card title={t('settings.backup')}>
    <p className="mono muted">{t('settings.backup_hint')}</p>
    <div className="backup-actions">
      <button type="button" className="button button--quiet" disabled={state === 'working'} onClick={() => void exportBackup()}>
        {t('settings.backup_export')}
      </button>
      <button type="button" className="button button--ghost" disabled={state === 'working'} onClick={() => input.current?.click()}>
        {t('settings.backup_choose')}
      </button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(event) => void readBackup(event.target.files?.[0])} />
    </div>

    {backup && <SelectedBackupView
      backup={backup}
      confirmReplace={confirmReplace}
      locale={i18n.language}
      onMerge={() => void importBackup('merge')}
      onReplace={() => void importBackup('replace')}
      onConfirmReplace={() => setConfirmReplace(true)}
      onCancelReplace={() => setConfirmReplace(false)}
    />}

    {state === 'working' && <span className="mono muted" role="status">{t('settings.backup_working')}</span>}
    {state === 'done' && success && <span className="backup-status" role="status">{t(`settings.${success}`)}</span>}
    {error && <span className="backup-error" role="alert">{t(`settings.${error}`)}</span>}

    <div className="backup-csv">
      <span className="mono muted">{t('settings.export_hint')}</span>
      <button type="button" className="button button--ghost" onClick={async () => downloadBlob(await buildSetLogCsv(), 'meu-treino-series.csv')}>
        {t('settings.export_csv')}
      </button>
    </div>
  </Card>
}

function SelectedBackupView({ backup, confirmReplace, locale, onMerge, onReplace, onConfirmReplace, onCancelReplace }: {
  backup: SelectedBackup
  confirmReplace: boolean
  locale: string
  onMerge: () => void
  onReplace: () => void
  onConfirmReplace: () => void
  onCancelReplace: () => void
}) {
  const { t } = useTranslation()
  return <div className="backup-file">
    <strong>{backup.name}</strong>
    <span className="mono muted">
      {t('settings.backup_summary', { rows: backup.summary.rows, images: backup.summary.images })}
      {' · '}
      {new Date(backup.summary.exportedAt).toLocaleString(locale)}
    </span>
    <p>{t('settings.backup_merge_hint')}</p>
    <div className="backup-actions">
      <button type="button" className="button button--quiet" onClick={onMerge}>{t('settings.backup_merge')}</button>
      {confirmReplace ? <>
        <button type="button" className="button button--danger" onClick={onReplace}>{t('settings.backup_replace_confirm')}</button>
        <button type="button" className="button button--ghost" onClick={onCancelReplace}>{t('common.cancel')}</button>
      </> : <button type="button" className="button button--ghost" onClick={onConfirmReplace}>{t('settings.backup_replace')}</button>}
    </div>
  </div>
}

function backupErrorKey(error: unknown): string {
  if (!(error instanceof Error)) return 'backup_invalid_format'
  return [
    'backup_too_large', 'backup_invalid_json', 'backup_invalid_format',
    'backup_invalid_row', 'backup_invalid_media',
  ].includes(error.message) ? error.message : 'backup_invalid_format'
}
