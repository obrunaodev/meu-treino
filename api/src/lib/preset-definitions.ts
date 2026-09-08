export type PresetFocus = 'strength' | 'hypertrophy'
export type PresetSplit = 'ab' | 'abc' | 'abcd'

interface WorkoutSeed {
  key: string
  name: Record<string, string>
  focus: Record<string, string>
  exercises: number[]
}

export interface PresetDefinition {
  slug: string
  name: Record<string, string>
  split: PresetSplit
  focus: PresetFocus
  durationMinutes: 30 | 45 | 60
  workouts: Array<WorkoutSeed & {
    items: Array<{ catalogExerciseId: number; sets: number; repMin: number; repMax: number; rirTarget: number; restSeconds: number }>
  }>
}

const SPLITS: Record<PresetSplit, WorkoutSeed[]> = {
  ab: [
    { key: 'a', name: { 'pt-BR': 'Treino A · Superior', 'en-US': 'Workout A · Upper' }, focus: { 'pt-BR': 'Peito, costas, ombros e braços', 'en-US': 'Chest, back, shoulders and arms' }, exercises: [165, 95, 240, 111, 180, 200] },
    { key: 'b', name: { 'pt-BR': 'Treino B · Inferior', 'en-US': 'Workout B · Lower' }, focus: { 'pt-BR': 'Quadríceps, posteriores, glúteos e panturrilhas', 'en-US': 'Quads, hamstrings, glutes and calves' }, exercises: [83, 46, 44, 43, 86, 195] },
  ],
  abc: [
    { key: 'a', name: { 'pt-BR': 'Treino A · Empurrar', 'en-US': 'Workout A · Push' }, focus: { 'pt-BR': 'Peito, ombros e tríceps', 'en-US': 'Chest, shoulders and triceps' }, exercises: [165, 240, 55, 180, 184, 219] },
    { key: 'b', name: { 'pt-BR': 'Treino B · Puxar', 'en-US': 'Workout B · Pull' }, focus: { 'pt-BR': 'Costas, deltoide posterior e bíceps', 'en-US': 'Back, rear delts and biceps' }, exercises: [95, 111, 190, 200, 150, 52] },
    { key: 'c', name: { 'pt-BR': 'Treino C · Pernas', 'en-US': 'Workout C · Legs' }, focus: { 'pt-BR': 'Pernas e glúteos', 'en-US': 'Legs and glutes' }, exercises: [83, 46, 44, 43, 86, 195] },
  ],
  abcd: [
    { key: 'a', name: { 'pt-BR': 'Treino A · Peito e tríceps', 'en-US': 'Workout A · Chest and triceps' }, focus: { 'pt-BR': 'Peito e tríceps', 'en-US': 'Chest and triceps' }, exercises: [165, 55, 156, 180, 184, 63] },
    { key: 'b', name: { 'pt-BR': 'Treino B · Costas e bíceps', 'en-US': 'Workout B · Back and biceps' }, focus: { 'pt-BR': 'Costas e bíceps', 'en-US': 'Back and biceps' }, exercises: [95, 111, 190, 200, 150, 52] },
    { key: 'c', name: { 'pt-BR': 'Treino C · Pernas', 'en-US': 'Workout C · Legs' }, focus: { 'pt-BR': 'Pernas e glúteos', 'en-US': 'Legs and glutes' }, exercises: [83, 46, 44, 43, 86, 195] },
    { key: 'd', name: { 'pt-BR': 'Treino D · Ombros', 'en-US': 'Workout D · Shoulders' }, focus: { 'pt-BR': 'Ombros e estabilidade escapular', 'en-US': 'Shoulders and scapular stability' }, exercises: [240, 219, 211, 190, 221, 58] },
  ],
}

const DURATIONS = [30, 45, 60] as const
const FOCUSES = ['strength', 'hypertrophy'] as const

function prescription(focus: PresetFocus, duration: 30 | 45 | 60) {
  if (focus === 'strength') {
    return { sets: duration === 60 ? 4 : 3, repMin: 4, repMax: 6, rirTarget: 2, restSeconds: 120 }
  }
  return { sets: duration === 30 ? 3 : 4, repMin: 8, repMax: 12, rirTarget: 2, restSeconds: 75 }
}

/** Canonical beginner presets generated from curated split exercise pools. */
export const PRESET_DEFINITIONS: PresetDefinition[] = (Object.keys(SPLITS) as PresetSplit[]).flatMap((split) =>
  FOCUSES.flatMap((focus) => DURATIONS.map((durationMinutes) => {
    const exerciseCount = durationMinutes === 30 ? 4 : durationMinutes === 45 ? 5 : 6
    const focusName = focus === 'strength'
      ? { 'pt-BR': 'Força', 'en-US': 'Strength' }
      : { 'pt-BR': 'Hipertrofia', 'en-US': 'Hypertrophy' }
    return {
      slug: `${split}-${focus}-${durationMinutes}-beginner-v1`,
      name: {
        'pt-BR': `${split.toUpperCase()} · ${focusName['pt-BR']} · ${durationMinutes} min`,
        'en-US': `${split.toUpperCase()} · ${focusName['en-US']} · ${durationMinutes} min`,
      },
      split,
      focus,
      durationMinutes,
      workouts: SPLITS[split].map((workout) => ({
        ...workout,
        items: workout.exercises.slice(0, exerciseCount).map((catalogExerciseId) => ({
          catalogExerciseId,
          ...prescription(focus, durationMinutes),
        })),
      })),
    }
  })),
)
