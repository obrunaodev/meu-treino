import type { Exercise, PainEvent, SetLog, WorkoutSession } from '../types.js'
import { assignCycleNumbers, averageIntervalDays } from './cycle.js'

export interface LoadTrend {
  exerciseId: string
  name: string
  points: Array<{ at: string; weight: number; volume: number }>
  direction: 'up' | 'flat' | 'down'
}

export interface WeeklySessions {
  weekStart: string
  value: number
}

export interface MuscleGroupWork {
  label: string
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
  firstMonday.setDate(firstMonday.getDate() - (weeks - 1) * 7)

  const result = Array.from({ length: weeks }, (_, index) => {
    const date = new Date(firstMonday)
    date.setDate(date.getDate() + index * 7)
    return { weekStart: dateKey(date), value: 0 }
  })
  const byWeek = new Map(result.map((entry) => [entry.weekStart, entry]))

  for (const session of sessions) {
    if (session.status === 'em_andamento') continue
    const weekStart = dateKey(startOfWeek(new Date(session.startedAt)))
    const bucket = byWeek.get(weekStart)
    if (bucket) bucket.value += 1
  }

  return result
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayFromMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - dayFromMonday)
  return start
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Sessões do intervalo semanal escolhido no gráfico. */
export function sessionsForWeek(sessions: WorkoutSession[], weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return sessions.filter((session) => {
    const at = new Date(session.startedAt)
    return session.status !== 'em_andamento' && at >= start && at < end
  })
}

/** Maior intensidade de dor por semana; zero preserva semanas sem ocorrência. */
export function painByWeek(events: PainEvent[], weeks = 8, today = new Date()) {
  const buckets = sessionsByWeek([], weeks, today)
  const byWeek = new Map(buckets.map((entry) => [entry.weekStart, entry]))
  for (const event of events) {
    const bucket = byWeek.get(dateKey(startOfWeek(new Date(event.occurredAt))))
    if (bucket) bucket.value = Math.max(bucket.value, event.level)
  }
  return buckets
}

/** Séries de trabalho por grupo muscular dentro da semana selecionada. */
export function muscleGroupsForWeek(
  weekSessions: WorkoutSession[],
  sets: SetLog[],
  exercises: Exercise[],
  groupByCatalogId: Map<number, string>,
  unknownLabel: string,
): MuscleGroupWork[] {
  const sessionIds = new Set(weekSessions.map((session) => session.id))
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const totals = new Map<string, number>()

  for (const set of sets) {
    if (!sessionIds.has(set.sessionId) || set.isWarmup || set.skipped) continue
    const catalogId = exerciseById.get(set.exerciseId)?.catalogExerciseId
    const group = catalogId === null || catalogId === undefined
      ? unknownLabel
      : groupByCatalogId.get(catalogId) ?? unknownLabel
    totals.set(group, (totals.get(group) ?? 0) + 1)
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

/** Projeta o fechamento do bloco pelo intervalo observado entre treinos. */
export function weeksToBlockEnd(sessionsToBlockEnd: number, sessions: WorkoutSession[]) {
  const intervalDays = averageIntervalDays(sessions)
  if (intervalDays === null) return null
  return Math.max(1, Math.ceil((sessionsToBlockEnd * intervalDays) / 7))
}

/** Resume as oito últimas exposições de carga de cada exercício. */
export function recentLoadTrends(
  exercises: Exercise[],
  sessions: WorkoutSession[],
  sets: SetLog[],
  limit = 5,
): LoadTrend[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const exposureBySession = new Map<string, {
    exerciseId: string
    at: string
    weight: number
    volume: number
  }>()
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))

  for (const set of sets) {
    if (set.isWarmup || set.skipped || set.weightKg === null) continue
    const session = sessionById.get(set.sessionId)
    if (!session || session.status === 'em_andamento') continue
    const key = `${set.exerciseId}:${set.sessionId}`
    const current = exposureBySession.get(key) ?? {
      exerciseId: set.exerciseId, at: session.startedAt, weight: 0, volume: 0,
    }
    const multiplier = exerciseById.get(set.exerciseId)?.loadPerSide ? 2 : 1
    current.weight = Math.max(current.weight, set.weightKg)
    current.volume += set.weightKg * (set.reps ?? 0) * multiplier
    exposureBySession.set(key, current)
  }

  const valuesByExercise = new Map<string, Array<{ at: string; weight: number; volume: number }>>()
  for (const exposure of exposureBySession.values()) {
    const values = valuesByExercise.get(exposure.exerciseId) ?? []
    values.push({ at: exposure.at, weight: exposure.weight, volume: exposure.volume })
    valuesByExercise.set(exposure.exerciseId, values)
  }

  return exercises.flatMap((exercise) => {
    const history = valuesByExercise.get(exercise.id)
    if (!history?.length) return []
    const points = history.sort((a, b) => a.at.localeCompare(b.at)).slice(-8)
    const delta = points.at(-1)!.weight - points[0]!.weight
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
