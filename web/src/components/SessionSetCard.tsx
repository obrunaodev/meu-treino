import { useTranslation } from 'react-i18next'
import { kgToLb, type Unit } from '../lib/domain/load.js'
import type { RecordKind } from '../lib/domain/records.js'
import type { SetDraft } from '../lib/domain/session.js'
import { RecordFlag } from './RecordFlag.js'
import { RirSelector } from './RirSelector.js'
import { NumberStepper } from './ui.js'

export interface SetCardItem {
  repMin: number | null
  repMax: number | null
  isTimeBased: boolean
}

/**
 * Cartão de uma série: marcar, carga, resultado e esforço.
 *
 * O mesmo cartão serve ao exercício sozinho e ao bi-set — no grupo o nome
 * acessível carrega o exercício, porque as séries de dois exercícios se
 * alternam na mesma lista e "série 2" sozinho seria ambíguo.
 */
export function SetCard({ item, eyebrow, checkLabel, draft, unit, loadPerSide, recordKinds, onToggle, onTypeLoad, onStepLoad, onUpdate }: {
  item: SetCardItem
  eyebrow: string
  checkLabel: string
  draft: SetDraft
  unit: Unit
  loadPerSide: boolean
  recordKinds: RecordKind[] | undefined
  onToggle: () => void
  onTypeLoad: (displayValue: number | null) => void
  onStepLoad: (direction: 1 | -1) => void
  onUpdate: (patch: Partial<SetDraft>) => void
}) {
  const { t } = useTranslation()
  const resultMin = item.repMin ?? 0
  const resultMax = item.repMax ?? Number.POSITIVE_INFINITY
  const clamp = (value: number) => Math.min(resultMax, Math.max(resultMin, value))

  return (
    <li className={`session-focus__set${draft.checked ? ' session-focus__set--checked' : ''}`}>
      <div className="session-focus__set-head">
        <button
          type="button"
          className="session-exercise__check"
          aria-pressed={draft.checked}
          aria-label={checkLabel}
          onClick={onToggle}
        >✓</button>
        <span className="eyebrow">{eyebrow}</span>
        <RecordFlag kinds={recordKinds} />
      </div>
      <div className="session-focus__fields">
        <NumberStepper
          label={loadPerSide ? `${t('session.load')} · ${t('session.per_side_short')}` : t('session.load')}
          value={draft.kg === null ? null : unit === 'lb' ? Number(kgToLb(draft.kg).toFixed(1)) : draft.kg}
          suffix={loadPerSide ? `${unit}/${t('session.per_side_short')}` : unit}
          step={0.5}
          max={unit === 'lb' ? 2202 : 999}
          onChange={onTypeLoad}
          onStep={onStepLoad}
        />
        <NumberStepper
          label={item.isTimeBased ? t('session.seconds') : t('session.reps')}
          value={draft.result}
          min={resultMin}
          max={Number.isFinite(resultMax) ? resultMax : undefined}
          step={item.isTimeBased ? 5 : 1}
          onChange={(result) => onUpdate({ result: result === null ? null : clamp(result) })}
          onStep={(direction) => onUpdate({ result: clamp((draft.result ?? resultMin) + direction * (item.isTimeBased ? 5 : 1)) })}
        />
        <RirSelector value={draft.rir} onChange={(rir) => onUpdate({ rir })} />
      </div>
    </li>
  )
}

/** Relógio opcional entre séries — ou entre rodadas, no bi-set. */
export function RestCard({ active, label, ariaLabel, onToggle }: {
  active: boolean
  label: string
  ariaLabel: string
  onToggle: () => void
}) {
  return (
    <li className={`session-rest-card${active ? ' session-rest-card--active' : ''}`}>
      <button type="button" aria-label={ariaLabel} onClick={onToggle}>
        <span aria-hidden="true">◷</span>
        <strong>{label}</strong>
      </button>
    </li>
  )
}
