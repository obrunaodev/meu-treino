import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { kgToLb, type Unit } from '../lib/domain/load.js'
import type { RecordKind } from '../lib/domain/records.js'
import type { SetDraft, SetSide, SideDraft } from '../lib/domain/session.js'
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
export function SetCard({ item, eyebrow, checkLabel, draft, unit, loadPerSide, recordKinds, onToggle, onTypeLoad, onStepLoad, onResult, onUpdate }: {
  item: SetCardItem
  eyebrow: string
  checkLabel: string
  draft: SetDraft
  unit: Unit
  loadPerSide: boolean
  recordKinds: RecordKind[] | undefined
  onToggle: () => void
  onTypeLoad: (displayValue: number | null, side: SetSide) => void
  onStepLoad: (direction: 1 | -1, side: SetSide) => void
  onResult: (value: number | null, side: SetSide) => void
  onUpdate: (patch: Partial<SetDraft>) => void
}) {
  const { t } = useTranslation()
  const resultMin = item.repMin ?? 0
  const resultMax = item.repMax ?? Number.POSITIVE_INFINITY
  const clamp = (value: number) => Math.min(resultMax, Math.max(resultMin, value))
  const step = item.isTimeBased ? 5 : 1
  // Um cartão por série, uma linha de campos por lado. O nome do lado entra no
  // rótulo de cada campo: são dois "carga" no mesmo cartão, e sem ele o leitor
  // de tela anunciaria os dois igual.
  const sides: Array<{ side: SetSide; values: SideDraft; name: string | null }> = draft.left === null
    ? [{ side: 'ambos', values: draft, name: null }]
    : [{ side: 'D', values: draft, name: t('session.side_right') },
       { side: 'E', values: draft.left, name: t('session.side_left') }]
  const withSide = (label: string, name: string | null) => (name === null ? label : `${label} · ${name}`)

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
        {sides.map(({ side, values, name }) => <Fragment key={side}>
          <NumberStepper
            label={withSide(loadPerSide ? `${t('session.load')} · ${t('session.per_side_short')}` : t('session.load'), name)}
            value={values.kg === null ? null : unit === 'lb' ? Number(kgToLb(values.kg).toFixed(1)) : values.kg}
            suffix={loadPerSide ? `${unit}/${t('session.per_side_short')}` : unit}
            step={0.5}
            max={unit === 'lb' ? 2202 : 999}
            onChange={(value) => onTypeLoad(value, side)}
            onStep={(direction) => onStepLoad(direction, side)}
          />
          <NumberStepper
            label={withSide(item.isTimeBased ? t('session.seconds') : t('session.reps'), name)}
            value={values.result}
            min={resultMin}
            max={Number.isFinite(resultMax) ? resultMax : undefined}
            step={step}
            onChange={(result) => onResult(result === null ? null : clamp(result), side)}
            onStep={(direction) => onResult(clamp((values.result ?? resultMin) + direction * step), side)}
          />
        </Fragment>)}
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
