import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../lib/api.js'
import type { PainRegion } from '../lib/types.js'

/**
 * Mapa corporal esquemático. Regiões são alvos de toque generosos, não o
 * desenho anatômico — o usuário está em pé na academia, com a mão suada.
 * A dor é magnitude, então a cor vem da rampa sequencial de uma hue só.
 */
const FIGURE: Array<{ slug: string; cx: number; cy: number; r: number }> = [
  { slug: 'cervical', cx: 50, cy: 12, r: 6 },
  { slug: 'ombro_e', cx: 34, cy: 24, r: 7 },
  { slug: 'ombro_d', cx: 66, cy: 24, r: 7 },
  { slug: 'cotovelo_e', cx: 26, cy: 44, r: 6 },
  { slug: 'cotovelo_d', cx: 74, cy: 44, r: 6 },
  { slug: 'lombar', cx: 50, cy: 45, r: 8 },
  { slug: 'quadril_e', cx: 41, cy: 58, r: 7 },
  { slug: 'quadril_d', cx: 59, cy: 58, r: 7 },
  { slug: 'joelho_e', cx: 42, cy: 78, r: 7 },
  { slug: 'joelho_d', cx: 58, cy: 78, r: 7 },
  { slug: 'tornozelo_e', cx: 43, cy: 94, r: 5 },
  { slug: 'tornozelo_d', cx: 57, cy: 94, r: 5 },
]

/** Nível 0–10 em cinco degraus da rampa validada. */
export function toneForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level <= 1) return 1
  if (level <= 3) return 2
  if (level <= 5) return 3
  if (level <= 7) return 4
  return 5
}

export function usePainRegions(): PainRegion[] {
  const [regions, setRegions] = useState<PainRegion[]>([])
  useEffect(() => {
    void apiFetch<{ regions: PainRegion[] }>('/api/catalog/pain-regions')
      .then((body) => setRegions(body.regions))
      .catch(() => setRegions([]))
  }, [])
  return regions
}

export function BodyMap({ levels, selected, onSelect }: {
  levels?: Record<string, number>
  selected?: string | null
  onSelect?: (slug: string) => void
}) {
  const regions = usePainRegions()
  const { t, i18n } = useTranslation()
  const nameOf = (slug: string) => {
    const region = regions.find((r) => r.slug === slug)
    if (!region) return slug
    return i18n.language.startsWith('pt') ? region.namePt : region.nameEn
  }

  return (
    <svg viewBox="0 0 100 104" className="bodymap" role="group" aria-label={t('pain.select_region')}>
      {/* Silhueta só para orientar; nenhuma informação depende dela. */}
      <g className="bodymap__figure" aria-hidden="true">
        <circle cx="50" cy="8" r="6" />
        <rect x="38" y="16" width="24" height="34" rx="9" />
        <rect x="26" y="20" width="9" height="28" rx="4.5" />
        <rect x="65" y="20" width="9" height="28" rx="4.5" />
        <rect x="39" y="52" width="9" height="46" rx="4.5" />
        <rect x="52" y="52" width="9" height="46" rx="4.5" />
      </g>

      {FIGURE.map((spot) => {
        const level = levels?.[spot.slug]
        const tone = level === undefined ? null : toneForLevel(level)
        return (
          <g key={spot.slug}>
            <circle
              cx={spot.cx}
              cy={spot.cy}
              r={spot.r}
              className={[
                'bodymap__spot',
                tone ? `bodymap__spot--${tone}` : '',
                selected === spot.slug ? 'bodymap__spot--on' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect?.(spot.slug)}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect?.(spot.slug)
              }}
            >
              <title>{level === undefined ? nameOf(spot.slug) : `${nameOf(spot.slug)} · ${level}`}</title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}

/** Captura rápida: acionada pelo toggle "dor" durante a série. */
export function PainCapture({ onSave, onCancel }: {
  onSave: (regionSlug: string, level: number) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [region, setRegion] = useState<string | null>(null)
  const [level, setLevel] = useState(3)

  return (
    <div className="capture">
      <span className="eyebrow">{t('session.pain_prompt')}</span>
      <BodyMap selected={region} onSelect={setRegion} />

      <label className="field">
        {t('session.pain_level')} · {level}
        <input type="range" min={0} max={10} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
      </label>

      <div className="row">
        <button
          type="button"
          className="button button--primary"
          disabled={!region}
          onClick={() => region && onSave(region, level)}
        >
          {t('session.pain_save')}
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
