export interface PresetSummary {
  slug: string
  name: Record<string, string>
  split: 'ab' | 'abc' | 'abcd'
  focus: 'strength' | 'hypertrophy'
  durationMinutes: 30 | 45 | 60
}

export interface PresetPreview {
  preset: PresetSummary
  workouts: Array<{
    id: string
    name: Record<string, string>
    focus: Record<string, string>
    items: Array<{
      id: string
      sets: number
      repMin: number
      repMax: number
      rirTarget: number
      restSeconds: number
      exercise: { id: number; name: string }
      match: { status: 'direct' | 'substituted' | 'choice_required' | 'unavailable'; selectedExerciseId: number | null }
      alternatives: Array<{ id: number; name: string }>
    }>
  }>
}

export function localizedPresetText(value: Record<string, string>, locale: string): string {
  return value[locale] ?? value[locale.startsWith('pt') ? 'pt-BR' : 'en-US'] ?? Object.values(value)[0] ?? ''
}
