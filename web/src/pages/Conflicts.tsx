import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../lib/api.js'
import { runSync } from '../lib/sync.js'
import { Card, Empty, ErrorState, Loading } from '../components/ui.js'

interface Conflict {
  id: string
  entity: string
  entityId: string
  localRow: Record<string, unknown>
  remoteRow: Record<string, unknown>
  conflictingFields: string[]
}

/** Valor cru vira algo legível sem inventar formatação por tipo de campo. */
function show(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function Conflicts() {
  const { t } = useTranslation()
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const body = await apiFetch<{ conflicts: Conflict[] }>('/api/sync/conflicts')
      setConflicts(body.conflicts)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function resolve(conflict: Conflict, choices: Record<string, 'local' | 'remote'>) {
    await apiFetch(`/api/sync/conflicts/${conflict.id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution: 'fields', fields: choices }),
    })
    // Puxa o valor resolvido de volta na hora, senão o local segue divergente.
    await runSync().catch(() => undefined)
    await load()
  }

  return (
    <div className="page">
      <header className="page__title">
        <h1>{t('conflicts.title')}</h1>
        <p className="page__description">{t('conflicts.explain')}</p>
      </header>

      {loading ? <Loading /> : failed ? <ErrorState message={t('common.load_error')} onRetry={() => void load()} /> : conflicts.length === 0 ? (
        <Empty message={t('conflicts.empty')} />
      ) : (
        <>
          {conflicts.map((conflict) => (
            <ConflictCard key={conflict.id} conflict={conflict} onResolve={resolve} />
          ))}
        </>
      )}
    </div>
  )
}

function ConflictCard({ conflict, onResolve }: {
  conflict: Conflict
  onResolve: (conflict: Conflict, choices: Record<string, 'local' | 'remote'>) => Promise<void>
}) {
  const { t } = useTranslation()
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const complete = conflict.conflictingFields.every((field) => choices[field])

  return (
    <Card title={`${t('conflicts.entity')} · ${conflict.entity}`}>
      {conflict.conflictingFields.map((field) => (
        <div key={field} className="stack stack--tight">
          <span className="eyebrow">{field}</span>
          <div className="conflict">
            {(['local', 'remote'] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={`conflict__side${choices[field] === side ? ' conflict__side--on' : ''}`}
                aria-pressed={choices[field] === side}
                disabled={busy}
                onClick={() => setChoices((c) => ({ ...c, [field]: side }))}
              >
                <span className="mono muted">{t(`conflicts.${side}`)}</span>
                <strong>{show((side === 'local' ? conflict.localRow : conflict.remoteRow)[field])}</strong>
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="button button--primary"
        disabled={!complete || busy}
        onClick={async () => {
          setBusy(true)
          setFailed(false)
          try { await onResolve(conflict, choices) } catch { setFailed(true) } finally { setBusy(false) }
        }}
      >
        {t(busy ? 'common.saving' : 'conflicts.resolve')}
      </button>
      {failed && <ErrorState message={t('common.save_error')} />}
    </Card>
  )
}
