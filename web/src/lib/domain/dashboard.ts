import type { Exercise, SetLog, WorkoutSession } from '../types.js'
import { assignCycleNumbers } from './cycle.js'

export interface LoadTrend {
  exerciseId: string
  name: string
  points: Array<{ at: string; value: number }>
  direction: 'up' | 'flat' | 'down'
}

export interface WeeklySessions {
  weekStart: string
  value: number
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

/** Conta sessões encerradas nas últimas semanas civis, incluindo semanas vazias. */
export function sessionsByWeek(
  sessions: WorkoutSession[],
  weeks = 8,
  today = new Date(),
): WeeklySessions[] {
  const currentMonday = startOfWeek(today)
  const firstMonday = new Date(currentMonday)
  firstMonday.setUTCDate(firstMonday.getUTCDate() - (weeks - 1) * 7)

  const result = Array.from({ length: weeks }, (_, index) => {
    const date = new Date(firstMonday)
    date.setUTCDate(date.getUTCDate() + index * 7)
    return { weekStart: date.toISOString().slice(0, 10), value: 0 }
  })
  const byWeek = new Map(result.map((entry) => [entry.weekStart, entry]))

  for (const session of sessions) {
    if (session.status === 'em_andamento') continue
    const weekStart = startOfWeek(new Date(session.startedAt)).toISOString().slice(0, 10)
    const bucket = byWeek.get(weekStart)
    if (bucket) bucket.value += 1
  }

  return result
}

function startOfWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayFromMonday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - dayFromMonday)
  return start
}

/** Resume as oito últimas exposições de carga de cada exercício. */
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
    const points = history.sort((a, b) => a.at.localeCompare(b.at)).slice(-8)
    const delta = points.at(-1)!.value - points[0]!.value
    return [{
      exerciseId: exercise.id,
      name: exercise.name,
      points,
      direction: delta > 0 ? 'up' as const : delta < 0 ? 'down' as const : 'flat' as const,
    }]
  }).sort((a, b) => {
    const rank = { up: 0, flat: 1, down: 2 }
    return rank[a.direction] - rank[b.direction] || a.name.localeCompare(b.name)
  }).slice(0, limit)
}
