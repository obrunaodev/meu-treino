import type { CardioLog, PainEvent, PlanSnapshotItem, SetLog, WorkoutSession } from '../types.js'
import { totalLoadKg } from './load.js'
import { countSets, setKey } from './sets.js'

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
  /** Se a carga mais pesada foi registrada por lado: "60 kg" e "60 kg/lado" não são o mesmo peso. */
  maxLoadPerSide: boolean
  repetitions: number
  /** O menor RIR de todas as séries. Uma média de percepção esconde justamente a série que decide o ajuste. */
  worstRir: number | null
  /** Séries de trabalho cujo resultado caiu fora da faixa prescrita naquele dia. */
  offPrescriptionSets: number
  volumeKg: number
  sets: ExerciseSetReport[]
}

export interface ExerciseSetReport {
  id: string
  sessionId: string
  sessionName: string
  sessionStartedAt: string
  setIndex: number
  isWarmup: boolean
  side: SetLog['side']
  weightKg: number | null
  plateCount: number | null
  loadPerSide: boolean
  reps: number | null
  seconds: number | null
  rir: number | null
  skipped: boolean
  hadPain: boolean
  completedAt: string | null
}

export interface TrainingReport {
  sessions: number
  completedSessions: number
  durationSeconds: number
  plannedExercises: number
  completedExercises: number
  adherence: number
  /** Exercícios planejados que saíram como prescritos: séries completas e resultados dentro da faixa. */
  onPrescription: number
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
    onPrescription: onPrescriptionCount(sessions, scopedSets),
    workingSets: countSets(scopedSets.filter((set) => !set.isWarmup && !set.skipped)),
    warmupSets: countSets(scopedSets.filter((set) => set.isWarmup && !set.skipped)),
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
  const planned = plannedItems(sessions)
  const sessionById = new Map(sessions.map((session) => [session.id, session]))

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

  for (const set of sets) {
    const report = reports.get(set.exerciseId) ?? emptyExercise(
      set.exerciseId, exerciseNames.get(set.exerciseId) ?? set.exerciseId,
    )
    const loadPerSide = perSide.get(`${set.sessionId}:${set.exerciseId}`) ?? false
    if (set.skipped) report.skipped = true
    else if (!set.isWarmup) {
      // Repetições e volume somam as duas linhas de uma série com lados
      // separados: o trabalho foi feito duas vezes, uma por lado.
      report.repetitions += set.reps ?? 0
      topLoad(report, set.weightKg, loadPerSide)
      report.volumeKg += (set.weightKg ?? 0) * (set.reps ?? 0) * (loadPerSide ? 2 : 1)
      if (set.rir !== null) report.worstRir = Math.min(report.worstRir ?? set.rir, set.rir)
    }
    report.sets.push(setReport(set, sessionById.get(set.sessionId), loadPerSide))
    reports.set(set.exerciseId, report)
  }

  const counted = setCounts(sets, planned)
  for (const [exerciseId, report] of reports) {
    report.workingSets = counted.working.get(exerciseId)?.size ?? 0
    report.warmupSets = counted.warmup.get(exerciseId)?.size ?? 0
    report.offPrescriptionSets = counted.offRange.get(exerciseId)?.size ?? 0
  }
  return [...reports.values()]
}

/**
 * O que se conta por série e não por linha. Uma série com lados separados
 * grava duas linhas, e contá-las diria o dobro de séries — e diria "2 séries
 * fora da faixa" quando foi uma só, com os dois lados curtos.
 */
function setCounts(sets: SetLog[], planned: Map<string, PlanSnapshotItem>) {
  const working = new Map<string, Set<string>>()
  const warmup = new Map<string, Set<string>>()
  const offRange = new Map<string, Set<string>>()
  const add = (into: Map<string, Set<string>>, set: SetLog) => {
    const keys = into.get(set.exerciseId) ?? new Set<string>()
    into.set(set.exerciseId, keys.add(setKey(set)))
  }

  for (const set of sets) {
    if (set.skipped) continue
    if (set.isWarmup) { add(warmup, set); continue }
    add(working, set)
    const item = planned.get(`${set.sessionId}:${set.templateItemId}`)
    if (item && !withinRange(set, item)) add(offRange, set)
  }
  return { working, warmup, offRange }
}

/** Uma série como os relatórios a mostram; a história de um exercício usa a mesma linha. */
export function setReport(set: SetLog, session: WorkoutSession | undefined, loadPerSide: boolean): ExerciseSetReport {
  return {
    id: set.id,
    sessionId: set.sessionId,
    sessionName: session?.planSnapshot?.templateName ?? '',
    sessionStartedAt: session?.startedAt ?? set.createdAt ?? set.updatedAt,
    setIndex: set.setIndex,
    isWarmup: set.isWarmup,
    side: set.side,
    weightKg: set.weightKg,
    plateCount: set.plateCount,
    loadPerSide,
    reps: set.reps,
    seconds: set.seconds,
    rir: set.rir,
    skipped: set.skipped,
    hadPain: set.hadPain,
    completedAt: set.completedAt,
  }
}

function emptyExercise(exerciseId: string, name: string): ExerciseReport {
  return {
    exerciseId, name, plannedSets: 0, workingSets: 0, warmupSets: 0, skipped: false,
    targets: [], targetRir: [], equipment: [], maxWeightKg: null, maxLoadPerSide: false, repetitions: 0,
    worstRir: null, offPrescriptionSets: 0, volumeKg: 0,
    sets: [],
  }
}

/** Item prescrito de cada série, por sessão: é ele que diz a faixa daquele dia. */
function plannedItems(sessions: WorkoutSession[]): Map<string, PlanSnapshotItem> {
  const items = new Map<string, PlanSnapshotItem>()
  for (const session of sessions) {
    for (const item of session.planSnapshot?.items ?? []) items.set(`${session.id}:${item.id}`, item)
  }
  return items
}

/**
 * A carga mais pesada se decide pelo peso movido, não pelo número registrado:
 * 60 kg por lado são 120 kg, e num relatório de bloco perderiam para 100 kg
 * totais de outra sessão se a comparação fosse pelo valor cru. O que fica
 * guardado continua sendo o número como foi registrado, com a sua base.
 */
function topLoad(report: ExerciseReport, weightKg: number | null, loadPerSide: boolean) {
  if (weightKg === null) return
  const moved = totalLoadKg(weightKg, loadPerSide)!
  const best = totalLoadKg(report.maxWeightKg, report.maxLoadPerSide)
  if (best !== null && best >= moved) return
  report.maxWeightKg = weightKg
  report.maxLoadPerSide = loadPerSide
}

/** Dentro da faixa do plano: repetições, ou segundos quando o exercício é por tempo. */
function withinRange(set: SetLog, item: PlanSnapshotItem): boolean {
  const measure = item.isTimeBased ? set.seconds : set.reps
  if (measure === null) return false
  return measure >= (item.repMin ?? -Infinity) && measure <= (item.repMax ?? Infinity)
}

/**
 * Exercícios que saíram como prescritos.
 *
 * "Aderência 100%" só diz que os exercícios aconteceram; não diz se a
 * prescrição foi respeitada. Aqui um exercício conta quando fechou as séries
 * planejadas e nenhuma delas caiu fora da faixa. A carga fica de fora de
 * propósito: o plano prescreve séries, faixa e esforço — nunca um peso —,
 * então subir a carga entre as séries não é desvio de prescrição.
 */
function onPrescriptionCount(sessions: WorkoutSession[], sets: SetLog[]): number {
  const done = new Map<string, SetLog[]>()
  for (const set of sets) {
    if (set.isWarmup || set.skipped || set.templateItemId === null) continue
    const key = `${set.sessionId}:${set.templateItemId}`
    done.set(key, [...(done.get(key) ?? []), set])
  }

  let count = 0
  for (const session of sessions) {
    for (const item of session.planSnapshot?.items ?? []) {
      const logged = done.get(`${session.id}:${item.id}`) ?? []
      if (countSets(logged) >= item.sets && logged.every((set) => withinRange(set, item))) count += 1
    }
  }
  return count
}

function sessionDuration(session: WorkoutSession, now: Date) {
  const end = session.endedAt ? new Date(session.endedAt) : now
  return Math.max(0, Math.round((end.getTime() - new Date(session.startedAt).getTime()) / 1000))
}
