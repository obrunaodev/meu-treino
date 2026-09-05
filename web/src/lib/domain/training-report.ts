import type { CardioLog, PainEvent, SetLog, WorkoutSession } from '../types.js'

export interface ExerciseReport {
  exerciseId: string
  name: string
  plannedSets: number
  workingSets: number
  warmupSets: number
  skipped: boolean
  targets: string[]
  targetRir: number[]
  equipment: string[]
  maxWeightKg: number | null
  repetitions: number
  averageRir: number | null
  volumeKg: number
}

export interface TrainingReport {
  sessions: number
  completedSessions: number
  durationSeconds: number
  plannedExercises: number
  completedExercises: number
  adherence: number
  workingSets: number
  warmupSets: number
  volumeKg: number
  cardioSeconds: number
  cardioDistanceKm: number
  painEvents: number
  worstPain: number
  exercises: ExerciseReport[]
}

/** Consolida sessões e registros sem depender da tela que apresentará o relatório. */
export function buildTrainingReport(
  sessions: WorkoutSession[],
  sets: SetLog[],
  cardio: CardioLog[],
  pain: PainEvent[],
  exerciseNames = new Map<string, string>(),
  now = new Date(),
): TrainingReport {
  const sessionIds = new Set(sessions.map((session) => session.id))
  const scopedSets = sets.filter((set) => sessionIds.has(set.sessionId))
  const scopedCardio = cardio.filter((entry) => sessionIds.has(entry.sessionId))
  const scopedPain = pain.filter((event) => event.sessionId && sessionIds.has(event.sessionId))
  const exercises = exerciseReports(sessions, scopedSets, exerciseNames)
  const completedExercises = new Set(scopedSets
    .filter((set) => !set.isWarmup && !set.skipped)
    .map((set) => `${set.sessionId}:${set.exerciseId}`)).size
  const plannedExercises = sessions.reduce(
    (total, session) => total + (session.planSnapshot?.items.length ?? 0), 0,
  )

  return {
    sessions: sessions.length,
    completedSessions: sessions.filter((session) => session.status === 'concluida').length,
    durationSeconds: sessions.reduce((total, session) => total + sessionDuration(session, now), 0),
    plannedExercises,
    completedExercises,
    adherence: plannedExercises === 0 ? 0 : Math.round((completedExercises / plannedExercises) * 100),
    workingSets: scopedSets.filter((set) => !set.isWarmup && !set.skipped).length,
    warmupSets: scopedSets.filter((set) => set.isWarmup && !set.skipped).length,
    volumeKg: exercises.reduce((total, exercise) => total + exercise.volumeKg, 0),
    cardioSeconds: scopedCardio.reduce((total, entry) => total + entry.durationSeconds, 0),
    cardioDistanceKm: scopedCardio.reduce((total, entry) => total + (entry.distanceKm ?? 0), 0),
    painEvents: scopedPain.length,
    worstPain: scopedPain.reduce((worst, event) => Math.max(worst, event.level), 0),
    exercises,
  }
}

function exerciseReports(sessions: WorkoutSession[], sets: SetLog[], exerciseNames: Map<string, string>): ExerciseReport[] {
  const reports = new Map<string, ExerciseReport>()
  const perSide = new Map<string, boolean>()

  for (const session of sessions) {
    for (const item of session.planSnapshot?.items ?? []) {
      const report = reports.get(item.exerciseId) ?? emptyExercise(item.exerciseId, item.exerciseName)
      report.plannedSets += item.sets
      const repetitions = item.repMin === item.repMax || item.repMax === null
        ? `${item.repMin ?? '—'}`
        : `${item.repMin ?? 0}–${item.repMax}`
      const target = `${item.sets}×${repetitions}${item.isTimeBased ? 's' : ''}`
      if (!report.targets.includes(target)) report.targets.push(target)
      if (item.rirTarget !== null && !report.targetRir.includes(item.rirTarget)) report.targetRir.push(item.rirTarget)
      if (item.equipment && !report.equipment.includes(item.equipment.name)) report.equipment.push(item.equipment.name)
      reports.set(item.exerciseId, report)
      perSide.set(`${session.id}:${item.exerciseId}`, item.loadPerSide)
    }
  }

  const rirValues = new Map<string, number[]>()
  for (const set of sets) {
    const report = reports.get(set.exerciseId) ?? emptyExercise(
      set.exerciseId, exerciseNames.get(set.exerciseId) ?? set.exerciseId,
    )
    if (set.skipped) report.skipped = true
    else if (set.isWarmup) report.warmupSets += 1
    else {
      report.workingSets += 1
      report.repetitions += set.reps ?? 0
      if (set.weightKg !== null) report.maxWeightKg = Math.max(report.maxWeightKg ?? 0, set.weightKg)
      report.volumeKg += (set.weightKg ?? 0) * (set.reps ?? 0) * (perSide.get(`${set.sessionId}:${set.exerciseId}`) ? 2 : 1)
      if (set.rir !== null) rirValues.set(set.exerciseId, [...(rirValues.get(set.exerciseId) ?? []), set.rir])
    }
    reports.set(set.exerciseId, report)
  }

  for (const [exerciseId, values] of rirValues) {
    reports.get(exerciseId)!.averageRir = values.reduce((sum, value) => sum + value, 0) / values.length
  }
  return [...reports.values()]
}

function emptyExercise(exerciseId: string, name: string): ExerciseReport {
  return {
    exerciseId, name, plannedSets: 0, workingSets: 0, warmupSets: 0, skipped: false,
    targets: [], targetRir: [], equipment: [], maxWeightKg: null, repetitions: 0, averageRir: null, volumeKg: 0,
  }
}

function sessionDuration(session: WorkoutSession, now: Date) {
  const end = session.endedAt ? new Date(session.endedAt) : now
  return Math.max(0, Math.round((end.getTime() - new Date(session.startedAt).getTime()) / 1000))
}
