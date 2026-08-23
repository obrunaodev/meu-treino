import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../lib/api.js'
import { runSync } from '../lib/sync.js'
import { Card, Empty } from '../components/ui.js'

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const body = await apiFetch<{ conflicts: Conflict[] }>('/api/sync/conflicts')
      setConflicts(body.conflicts)
    } catch {
      setConflicts([])
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

  if (loading) return <p className="muted">{t('common.loading')}</p>

  return (
    <div className="page">
      <h1>{t('conflicts.title')}</h1>

      {conflicts.length === 0 ? (
        <Empty message={t('conflicts.empty')} />
      ) : (
        <>
          <p className="muted">{t('conflicts.explain')}</p>
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
          try { await onResolve(conflict, choices) } finally { setBusy(false) }
        }}
      >
        {t('conflicts.resolve')}
      </button>
    </Card>
  )
}
