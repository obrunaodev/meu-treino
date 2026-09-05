import { useTranslation } from 'react-i18next'
import { RIR_LEVELS, rirLevel } from '../lib/domain/rir.js'

/** Four-level perceived-effort control backed by legacy numeric RIR values. */
export function RirSelector({ value, onChange, disabled = false, label }: {
  value: number | null
  onChange: (value: number) => void
  disabled?: boolean
  label?: string
}) {
  const { t } = useTranslation()
  const selected = rirLevel(value)

  return (
    <fieldset className="rir-selector" disabled={disabled}>
      <legend>{label ?? t('rir.label')}</legend>
      <div className="rir-scale">
        {RIR_LEVELS.map((option) => (
          <button
            key={option.level}
            type="button"
            className={`pill${selected === option.level ? ' pill--on' : ''}`}
            aria-pressed={selected === option.level}
            onClick={() => onChange(option.value)}
          >
            {t(`rir.${option.level}`)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
