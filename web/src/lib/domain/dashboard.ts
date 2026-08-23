import type { Exercise, SetLog, WorkoutSession } from '../types.js'
import { assignCycleNumbers } from './cycle.js'

export interface LoadTrend {
  exerciseId: string
  name: string
  values: number[]
  direction: 'up' | 'flat' | 'down'
}

/** Agrupa séries de trabalho pelo ciclo derivado do histórico atual. */
export function workingSetsByCycle(
  sessions: WorkoutSession[],
  sets: SetLog[],
  sessionsPerCycle: number,
  cyclesPerBlock: number,
) {
  const positions = assignCycleNumbers(sessions, sessionsPerCycle, cyclesPerBlock)
  const cycleBySession = new Map(sessions.map((session) => [session.id, positions.get(session)?.cycleNumber]))
  const totals = new Map<number, number>()

  for (const set of sets) {
    if (set.isWarmup || set.skipped) continue
    const cycle = cycleBySession.get(set.sessionId)
    if (cycle === undefined) continue
    totals.set(cycle, (totals.get(cycle) ?? 0) + 1)
  }

  return [...totals.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-8)
    .map(([cycle, value]) => ({ label: `C${cycle}`, value }))
}

/** Resume as três últimas exposições de carga de cada exercício. */
export function recentLoadTrends(
  exercises: Exercise[],
  sessions: WorkoutSession[],
  sets: SetLog[],
  limit = 5,
): LoadTrend[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const topByExposure = new Map<string, { exerciseId: string; at: string; value: number }>()

  for (const set of sets) {
    if (set.isWarmup || set.skipped || set.weightKg === null) continue
    const session = sessionById.get(set.sessionId)
    if (!session || session.status === 'em_andamento') continue
    const key = `${set.exerciseId}:${set.sessionId}`
    const current = topByExposure.get(key)
    if (!current || set.weightKg > current.value) {
      topByExposure.set(key, { exerciseId: set.exerciseId, at: session.startedAt, value: set.weightKg })
    }
  }

  const valuesByExercise = new Map<string, Array<{ at: string; value: number }>>()
  for (const exposure of topByExposure.values()) {
    const values = valuesByExercise.get(exposure.exerciseId) ?? []
    values.push({ at: exposure.at, value: exposure.value })
    valuesByExercise.set(exposure.exerciseId, values)
  }

  return exercises.flatMap((exercise) => {
    const history = valuesByExercise.get(exercise.id)
    if (!history?.length) return []
    const values = history.sort((a, b) => a.at.localeCompare(b.at)).slice(-3).map((entry) => entry.value)
    const delta = values.at(-1)! - values[0]!
    return [{
      exerciseId: exercise.id,
      name: exercise.name,
      values,
      direction: delta > 0 ? 'up' as const : delta < 0 ? 'down' as const : 'flat' as const,
    }]
  }).sort((a, b) => {
    const rank = { up: 0, flat: 1, down: 2 }
    return rank[a.direction] - rank[b.direction] || a.name.localeCompare(b.name)
  }).slice(0, limit)
}
