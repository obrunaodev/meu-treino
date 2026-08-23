import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePainEvents } from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { BodyMap, PainCapture, toneForLevel, usePainRegions } from '../components/PainCapture.js'
import { Card, Empty } from '../components/ui.js'
import { Meter } from '../components/charts.js'

export function Pain() {
  const { t, i18n } = useTranslation()
  const events = usePainEvents()
  const regions = usePainRegions()
  const { logPain, removePain } = useActions()
  const [view, setView] = useState<'lista' | 'regiao'>('lista')
  const [adding, setAdding] = useState(false)

  const nameOf = (slug: string) => {
    const region = regions.find((r) => r.slug === slug)
    if (!region) return slug
    return i18n.language.startsWith('pt') ? region.namePt : region.nameEn
  }

  /** Pior nível por região — é o que o mapa colore. */
  const worstByRegion = useMemo(() => {
    const worst: Record<string, number> = {}
    for (const event of events) {
      worst[event.regionSlug] = Math.max(worst[event.regionSlug] ?? 0, event.level)
    }
    return worst
  }, [events])

  const perRegion = useMemo(() => {
    const counts = new Map<string, { count: number; worst: number }>()
    for (const event of events) {
      const current = counts.get(event.regionSlug) ?? { count: 0, worst: 0 }
      counts.set(event.regionSlug, {
        count: current.count + 1,
        worst: Math.max(current.worst, event.level),
      })
    }
    return [...counts.entries()].sort((a, b) => b[1].worst - a[1].worst)
  }, [events])

  return (
    <div className="page">
      <div className="page__head">
        <h1>{t('pain.title')}</h1>
        <button type="button" className="button button--primary" onClick={() => setAdding((v) => !v)}>
          {t('pain.add')}
        </button>
      </div>

      {adding && (
        <Card>
          <PainCapture
            onCancel={() => setAdding(false)}
            onSave={async (regionSlug, level) => {
              await logPain({ regionSlug, level })
              setAdding(false)
            }}
          />
        </Card>
      )}

      <Card title={t('pain.scale')}>
        <BodyMap levels={worstByRegion} />
      </Card>

      <div className="pills">
        {(['lista', 'regiao'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`pill${view === mode ? ' pill--on' : ''}`}
            onClick={() => setView(mode)}
          >
            {t(mode === 'lista' ? 'pain.list' : 'pain.by_region')}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <Empty message={t('pain.empty')} />
      ) : view === 'lista' ? (
        <Card>
          <ul className="loglist">
            {events.map((event) => (
              <li key={event.id} className="loglist__row">
                <span>
                  {nameOf(event.regionSlug)}
                  {event.note && <span className="muted"> · {event.note}</span>}
                </span>
                <span className="row">
                  <span className="mono muted">
                    {new Date(event.occurredAt).toLocaleDateString(i18n.language)}
                  </span>
                  <strong className="mono">{event.level}</strong>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void removePain(event.id)}
                    aria-label={t('history.delete_pain')}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <ul className="loglist">
            {perRegion.map(([slug, stats]) => (
              <li key={slug} className="region-row">
                <div className="row-between">
                  <span>{nameOf(slug)}</span>
                  <span className="mono muted">
                    {t('pain.occurrences', { count: stats.count })} · {t('pain.worst', { level: stats.worst })}
                  </span>
                </div>
                <Meter value={stats.worst} max={10} tone={toneForLevel(stats.worst)} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
