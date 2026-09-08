export interface ProgressionSet {
  reps: number | null
  rir: number | null
  skipped: boolean
  isWarmup: boolean
}

export type ProgressionAction = 'increase' | 'progress_reps' | 'maintain' | 'reduce'

/** Suggests a next action without ever mutating the user's planned or recorded load. */
export function progressionAction(
  latest: ProgressionSet[],
  previous: ProgressionSet[],
  repMax: number | null,
): ProgressionAction | null {
  const work = latest.filter((set) => !set.skipped && !set.isWarmup && set.reps !== null && set.rir !== null)
  if (work.length === 0) return null
  if (work.some((set) => set.rir === 0)) return 'reduce'

  const previousWork = previous.filter((set) => !set.skipped && !set.isWarmup && set.rir !== null)
  const latestHeavy = work.some((set) => set.rir === 1)
  const previousHeavy = previousWork.some((set) => set.rir === 1)
  if (latestHeavy && previousHeavy) return 'reduce'
  if (latestHeavy) return 'maintain'

  const reachedTop = repMax !== null && work.every((set) => set.reps! >= repMax)
  if (reachedTop && work.every((set) => set.rir! >= 2)) return 'increase'
  if (!reachedTop && work.every((set) => set.rir! >= 2)) return 'progress_reps'
  return 'maintain'
}
