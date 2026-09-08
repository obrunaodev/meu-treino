export interface AdminPresetItem {
  id?: string
  catalogExerciseId: number
  sets: number
  repMin: number
  repMax: number
  rirTarget: number
  restSeconds: number
  trackingMode: 'compact' | 'full'
  loadPerSide: boolean
}

export interface AdminPresetWorkout {
  id?: string
  name: Record<'pt-BR' | 'en-US', string>
  focus: Record<'pt-BR' | 'en-US', string>
  items: AdminPresetItem[]
}

export interface AdminPreset {
  id?: string
  slug: string
  name: Record<'pt-BR' | 'en-US', string>
  split: 'ab' | 'abc' | 'abcd'
  focus: 'strength' | 'hypertrophy'
  durationMinutes: 30 | 45 | 60
  level: 'beginner'
  isPublished: boolean
  workouts: AdminPresetWorkout[]
}

export function blankAdminPreset(): AdminPreset {
  return {
    slug: '', name: { 'pt-BR': '', 'en-US': '' }, split: 'ab', focus: 'hypertrophy',
    durationMinutes: 45, level: 'beginner', isPublished: false,
    workouts: [{
      name: { 'pt-BR': 'Treino A', 'en-US': 'Workout A' },
      focus: { 'pt-BR': '', 'en-US': '' }, items: [],
    }],
  }
}

export function presetPayload(preset: AdminPreset) {
  return {
    ...preset,
    workouts: preset.workouts.map(({ id: _workoutId, ...workout }) => ({
      ...workout,
      items: workout.items.map(({ id: _itemId, ...item }) => item),
    })),
  }
}
