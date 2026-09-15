export interface ProgressionSet {
  reps: number | null
  seconds?: number | null
  weightKg?: number | null
  rir: number | null
  skipped: boolean
  isWarmup: boolean
}

export type ProgressionAction = 'increase' | 'progress_reps' | 'maintain' | 'reduce'
/** Exercício por tempo guarda segundos, e `repMin`/`repMax` do item são a faixa de duração. */
export type ProgressionMetric = 'reps' | 'seconds'

/** Suggests a next action without ever mutating the user's planned or recorded load. */
export function progressionAction(
  latest: ProgressionSet[],
  previous: ProgressionSet[],
  repMax: number | null,
  metric: ProgressionMetric = 'reps',
): ProgressionAction | null {
  // As regras de esforço são as mesmas; só muda o que é medido em cada série.
  const measure = (set: ProgressionSet) => (metric === 'seconds' ? set.seconds ?? null : set.reps)
  const work = latest.filter((set) => !set.skipped && !set.isWarmup && measure(set) !== null && set.rir !== null)
  if (work.length === 0) return null
  if (work.some((set) => set.rir === 0)) return 'reduce'

  const previousWork = previous.filter((set) => !set.skipped && !set.isWarmup && set.rir !== null)
  const latestHeavy = work.some((set) => set.rir === 1)
  const previousHeavy = previousWork.some((set) => set.rir === 1)
  if (latestHeavy && previousHeavy) return 'reduce'
  if (latestHeavy) return 'maintain'

  const reachedTop = repMax !== null && work.every((set) => measure(set)! >= repMax)
  if (reachedTop && work.every((set) => set.rir! >= 2)) return 'increase'
  if (!reachedTop && work.every((set) => set.rir! >= 2)) return 'progress_reps'
  return 'maintain'
}

/**
 * A frase que acompanha a ação. Para tempo, o que avança é a duração — e no
 * topo da faixa não há o que subir na sessão: o campo trava no teto, então a
 * sugestão é aumentar a duração-alvo no treino. Com lastro, subir carga volta
 * a fazer sentido e a frase é a mesma da musculação.
 */
export function progressionMessageKey(
  action: ProgressionAction,
  metric: ProgressionMetric,
  latest: ProgressionSet[],
): string {
  if (metric === 'reps') return `progression.${action}`
  const loaded = latest.some((set) => !set.skipped && !set.isWarmup && (set.weightKg ?? 0) > 0)
  if (action === 'increase') return loaded ? 'progression.increase' : 'progression.timed_raise_target'
  if (action === 'reduce') return loaded ? 'progression.reduce' : 'progression.timed_reduce'
  if (action === 'maintain') return 'progression.timed_maintain'
  return 'progression.timed_progress'
}
