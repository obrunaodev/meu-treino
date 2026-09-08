import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../lib/api.js'
import { localizedPresetText, type PresetPreview } from '../lib/presets.js'
import { Select } from './ui.js'

export function PresetReview({ slug, stations, choices, onChoices, onReady }: {
  slug: string
  stations: string[]
  choices: Record<string, number>
  onChoices: (choices: Record<string, number>) => void
  onReady: (ready: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const [preview, setPreview] = useState<PresetPreview | null>(null)

  useEffect(() => {
    setPreview(null)
    void apiFetch<PresetPreview>(`/api/presets/${slug}?stations=${stations.join(',')}`)
      .then((result) => {
        setPreview(result)
        onReady(result.workouts.every((workout) => workout.items.every((item) =>
          item.match.status !== 'unavailable'
          && (item.match.status !== 'choice_required' || Boolean(choices[item.id])),
        )))
      })
      .catch(() => onReady(false))
  }, [slug, stations.join(',')])

  useEffect(() => {
    if (!preview) return
    onReady(preview.workouts.every((workout) => workout.items.every((item) =>
      item.match.status !== 'unavailable'
      && (item.match.status !== 'choice_required' || Boolean(choices[item.id])),
    )))
  }, [choices, preview])

  if (!preview) return <span className="mono muted">{t('common.loading')}</span>

  return <div className="preset-review">
    {preview.workouts.map((workout) => <section key={workout.id} className="preset-review__workout">
      <header>
        <strong>{localizedPresetText(workout.name, i18n.language)}</strong>
        <span>{localizedPresetText(workout.focus, i18n.language)}</span>
      </header>
      <ol>
        {workout.items.map((item) => <li key={item.id}>
          <div>
            <strong>{item.exercise.name}</strong>
            <span>{item.sets}×{item.repMin}–{item.repMax} · {t('rir.moderate')} · {item.restSeconds}s</span>
          </div>
          {item.match.status === 'substituted' && <span className="preset-review__ok">{t('onboarding.preset.auto_swap')}</span>}
          {item.match.status === 'unavailable' && <span className="preset-review__warning">{t('onboarding.preset.unavailable')}</span>}
          {item.match.status === 'choice_required' && <Select
            label={t('onboarding.preset.choose_swap')}
            value={String(choices[item.id] ?? '')}
            onChange={(value) => onChoices({ ...choices, [item.id]: Number(value) })}
          >
            <option value="">{t('common.select')}</option>
            {item.alternatives.map((alternative) => <option key={alternative.id} value={alternative.id}>{alternative.name}</option>)}
          </Select>}
        </li>)}
      </ol>
    </section>)}
  </div>
}
