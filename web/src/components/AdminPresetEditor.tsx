import { useTranslation } from 'react-i18next'
import type { AdminPreset, AdminPresetItem, AdminPresetWorkout } from '../lib/admin-presets.js'
import { Select } from './ui.js'

interface CatalogChoice { id: number; name: string }

const blankItem = (exerciseId: number): AdminPresetItem => ({
  catalogExerciseId: exerciseId, sets: 3, repMin: 8, repMax: 12,
  rirTarget: 2, restSeconds: 90, trackingMode: 'compact', loadPerSide: false,
})

export function AdminPresetEditor({ value, catalog, saving, onChange, onSave, onCancel }: {
  value: AdminPreset
  catalog: CatalogChoice[]
  saving: boolean
  onChange: (value: AdminPreset) => void
  onSave: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const patch = (values: Partial<AdminPreset>) => onChange({ ...value, ...values })
  const patchWorkout = (index: number, values: Partial<AdminPresetWorkout>) => patch({
    workouts: value.workouts.map((workout, current) => current === index ? { ...workout, ...values } : workout),
  })
  const patchItem = (workoutIndex: number, itemIndex: number, values: Partial<AdminPresetItem>) => {
    const workout = value.workouts[workoutIndex]!
    patchWorkout(workoutIndex, {
      items: workout.items.map((item, current) => current === itemIndex ? { ...item, ...values } : item),
    })
  }

  return <form className="admin-preset-editor stack" onSubmit={(event) => { event.preventDefault(); onSave() }}>
    <div className="form-grid">
      <label className="field">{t('admin_presets.slug')}<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        value={value.slug} onChange={(event) => patch({ slug: event.target.value })} /></label>
      <label className="field">{t('admin_presets.name_pt')}<input required value={value.name['pt-BR']}
        onChange={(event) => patch({ name: { ...value.name, 'pt-BR': event.target.value } })} /></label>
      <label className="field">{t('admin_presets.name_en')}<input required value={value.name['en-US']}
        onChange={(event) => patch({ name: { ...value.name, 'en-US': event.target.value } })} /></label>
      <Select label={t('admin_presets.split')} value={value.split}
        onChange={(split) => patch({ split: split as AdminPreset['split'] })}>
        <option value="ab">AB</option><option value="abc">ABC</option><option value="abcd">ABCD</option>
      </Select>
      <Select label={t('admin_presets.focus')} value={value.focus}
        onChange={(focus) => patch({ focus: focus as AdminPreset['focus'] })}>
        <option value="strength">{t('onboarding.preset.strength')}</option>
        <option value="hypertrophy">{t('onboarding.preset.hypertrophy')}</option>
      </Select>
      <Select label={t('admin_presets.duration')} value={String(value.durationMinutes)}
        onChange={(duration) => patch({ durationMinutes: Number(duration) as AdminPreset['durationMinutes'] })}>
        <option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option>
      </Select>
    </div>
    <label className="checkitem admin-preset-editor__published">
      <span>{t('admin_presets.published')}</span>
      <input type="checkbox" checked={value.isPublished}
        onChange={(event) => patch({ isPublished: event.target.checked })} />
    </label>

    {value.workouts.map((workout, workoutIndex) => <section className="admin-preset-workout" key={workout.id ?? workoutIndex}>
      <header className="row-between">
        <strong>{t('admin_presets.workout', { number: workoutIndex + 1 })}</strong>
        {value.workouts.length > 1 && <button type="button" className="text-action" onClick={() => patch({
          workouts: value.workouts.filter((_, current) => current !== workoutIndex),
        })}>{t('common.delete')}</button>}
      </header>
      <div className="form-grid">
        <label className="field">{t('admin_presets.name_pt')}<input required value={workout.name['pt-BR']}
          onChange={(event) => patchWorkout(workoutIndex, { name: { ...workout.name, 'pt-BR': event.target.value } })} /></label>
        <label className="field">{t('admin_presets.name_en')}<input required value={workout.name['en-US']}
          onChange={(event) => patchWorkout(workoutIndex, { name: { ...workout.name, 'en-US': event.target.value } })} /></label>
        <label className="field">{t('admin_presets.focus_pt')}<input required value={workout.focus['pt-BR']}
          onChange={(event) => patchWorkout(workoutIndex, { focus: { ...workout.focus, 'pt-BR': event.target.value } })} /></label>
        <label className="field">{t('admin_presets.focus_en')}<input required value={workout.focus['en-US']}
          onChange={(event) => patchWorkout(workoutIndex, { focus: { ...workout.focus, 'en-US': event.target.value } })} /></label>
      </div>
      <div className="admin-preset-items">
        {workout.items.map((item, itemIndex) => <div className="admin-preset-item" key={item.id ?? itemIndex}>
          <Select label={t('admin_presets.exercise')} value={String(item.catalogExerciseId)}
            onChange={(id) => patchItem(workoutIndex, itemIndex, { catalogExerciseId: Number(id) })}>
            {catalog.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
          </Select>
          <label className="field">{t('admin_presets.sets')}<input type="number" min="1" max="10" required value={item.sets}
            onChange={(event) => patchItem(workoutIndex, itemIndex, { sets: Number(event.target.value) })} /></label>
          <label className="field">{t('admin_presets.rep_min')}<input type="number" min="1" max="100" required value={item.repMin}
            onChange={(event) => patchItem(workoutIndex, itemIndex, { repMin: Number(event.target.value) })} /></label>
          <label className="field">{t('admin_presets.rep_max')}<input type="number" min="1" max="100" required value={item.repMax}
            onChange={(event) => patchItem(workoutIndex, itemIndex, { repMax: Number(event.target.value) })} /></label>
          <label className="field">{t('admin_presets.rest')}<input type="number" min="15" max="600" step="15" required value={item.restSeconds}
            onChange={(event) => patchItem(workoutIndex, itemIndex, { restSeconds: Number(event.target.value) })} /></label>
          <Select label={t('admin_presets.effort')} value={String(item.rirTarget)}
            onChange={(rir) => patchItem(workoutIndex, itemIndex, { rirTarget: Number(rir) })}>
            <option value="4">{t('rir.light')}</option><option value="2">{t('rir.moderate')}</option>
            <option value="1">{t('rir.heavy')}</option><option value="0">{t('rir.very_heavy')}</option>
          </Select>
          <Select label={t('admin_presets.tracking')} value={item.trackingMode}
            onChange={(mode) => patchItem(workoutIndex, itemIndex, { trackingMode: mode as AdminPresetItem['trackingMode'] })}>
            <option value="compact">{t('templates.tracking_compact')}</option>
            <option value="full">{t('templates.tracking_full')}</option>
          </Select>
          <label className="field field--row">{t('admin_presets.per_side')}<input type="checkbox" checked={item.loadPerSide}
            onChange={(event) => patchItem(workoutIndex, itemIndex, { loadPerSide: event.target.checked })} /></label>
          <button type="button" className="text-action" onClick={() => patchWorkout(workoutIndex, {
            items: workout.items.filter((_, current) => current !== itemIndex),
          })}>{t('common.delete')}</button>
        </div>)}
      </div>
      <button type="button" className="text-action" disabled={catalog.length === 0}
        onClick={() => patchWorkout(workoutIndex, { items: [...workout.items, blankItem(catalog[0]!.id)] })}>
        {t('admin_presets.add_exercise')}
      </button>
    </section>)}
    <button type="button" className="text-action" onClick={() => patch({ workouts: [...value.workouts, {
      name: { 'pt-BR': `Treino ${String.fromCharCode(65 + value.workouts.length)}`, 'en-US': `Workout ${String.fromCharCode(65 + value.workouts.length)}` },
      focus: { 'pt-BR': '', 'en-US': '' }, items: [],
    }] })}>{t('admin_presets.add_workout')}</button>
    <div className="row-actions">
      <button type="button" className="button button--ghost" onClick={onCancel}>{t('common.cancel')}</button>
      <button type="submit" className="button button--primary" disabled={saving || value.workouts.some((workout) => workout.items.length === 0)}>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  </form>
}
