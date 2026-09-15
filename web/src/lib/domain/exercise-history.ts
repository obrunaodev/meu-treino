import type { Equipment, Exercise, SetLog, WorkoutSession } from '../types.js'
import { calendarDayKey } from './calendar.js'
import { estimateOneRepMax, totalLoadKg } from './load.js'
import { setReport, type ExerciseSetReport } from './training-report.js'

export interface HistorySet extends ExerciseSetReport {
  /** Carga total movida (o lado registrado × 2 quando é por lado): base de e1RM e volume. */
  totalKg: number | null
  e1rmKg: number | null
}

export interface ExerciseSessionHistory {
  sessionId: string
  sessionName: string
  startedAt: string
  status: WorkoutSession['status']
  sets: HistorySet[]
  topLoadKg: number | null
  e1rmKg: number | null
  volumeKg: number
  bestReps: number | null
  bestSeconds: number | null
  workingSets: number
}

export type HistoryMetric = 'top_load' | 'e1rm' | 'volume' | 'best_reps' | 'best_seconds'
export type HistoryRange = 'recent' | 'all'

interface LoadMode {
  loadPerSide: boolean
  bodyweight: boolean
}

/**
 * O modo de carga vale como era na sessão: o snapshot do plano guarda se a
 * carga era por lado e o tipo do equipamento. Ler do exercício atual faria
 * ligar "por lado" hoje dobrar ou cortar pela metade todo o passado.
 */
function loadModeFor(session: WorkoutSession, exerciseId: string, exercise: Exercise | null, equipment: Equipment[]): LoadMode {
  const captured = session.planSnapshot?.items.find((item) => item.exerciseId === exerciseId)
  if (captured) return { loadPerSide: captured.loadPerSide, bodyweight: captured.equipment?.loadType === 'corporal' }
  const gear = equipment.find((entry) => entry.id === exercise?.equipmentId)
  return { loadPerSide: exercise?.loadPerSide ?? false, bodyweight: gear?.loadType === 'corporal' }
}

/** Aquecimento antes do trabalho, depois a ordem da série e a hora do registro. */
function compareHistorySets(a: HistorySet, b: HistorySet) {
  return Number(b.isWarmup) - Number(a.isWarmup) || a.setIndex - b.setIndex
    || (a.completedAt ?? '').localeCompare(b.completedAt ?? '')
}

function maxOf(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null)
  return present.length ? Math.max(...present) : null
}

function summarize(session: WorkoutSession, sets: HistorySet[]): ExerciseSessionHistory {
  // Aquecimento e série pulada ficam nas linhas, mas fora de toda estatística.
  const working = sets.filter((set) => !set.isWarmup && !set.skipped)
  return {
    sessionId: session.id,
    sessionName: session.planSnapshot?.templateName ?? '',
    startedAt: session.startedAt,
    status: session.status,
    sets,
    topLoadKg: maxOf(working.map((set) => set.totalKg)),
    e1rmKg: maxOf(working.map((set) => set.e1rmKg)),
    volumeKg: working.reduce((total, set) => total + (set.totalKg ?? 0) * (set.reps ?? 0), 0),
    bestReps: maxOf(working.map((set) => set.reps)),
    bestSeconds: maxOf(working.map((set) => set.seconds)),
    workingSets: working.length,
  }
}

/** Toda sessão com registro do exercício, da mais recente para a mais antiga. */
export function exerciseSessionHistory(
  exerciseId: string,
  exercise: Exercise | null,
  sessions: WorkoutSession[],
  sets: SetLog[],
  equipment: Equipment[],
): ExerciseSessionHistory[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const bySession = new Map<string, SetLog[]>()
  for (const set of sets) {
    // Série cuja sessão foi apagada some junto com ela.
    if (set.exerciseId !== exerciseId || !sessionById.has(set.sessionId)) continue
    bySession.set(set.sessionId, [...(bySession.get(set.sessionId) ?? []), set])
  }

  return [...bySession].map(([sessionId, sessionSets]) => {
    const session = sessionById.get(sessionId)!
    const mode = loadModeFor(session, exerciseId, exercise, equipment)
    const history = sessionSets.map((set): HistorySet => {
      const totalKg = totalLoadKg(set.weightKg, mode.loadPerSide)
      return {
        ...setReport(set, session, mode.loadPerSide),
        totalKg,
        // Peso corporal não é guardado: a carga registrada ali é só o lastro extra.
        e1rmKg: mode.bodyweight ? null : estimateOneRepMax(totalKg, set.reps),
      }
    }).sort(compareHistorySets)
    return summarize(session, history)
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

function metricValue(session: ExerciseSessionHistory, metric: HistoryMetric): number | null {
  if (metric === 'top_load') return session.topLoadKg
  if (metric === 'e1rm') return session.e1rmKg
  if (metric === 'volume') return session.volumeKg > 0 ? session.volumeKg : null
  if (metric === 'best_reps') return session.bestSeconds === null ? session.bestReps : null
  return session.bestSeconds
}

const METRICS: HistoryMetric[] = ['top_load', 'e1rm', 'volume', 'best_reps', 'best_seconds']

/** Só as métricas que o histórico consegue desenhar: peso corporal não tem carga, tempo não tem repetição. */
export function availableMetrics(history: ExerciseSessionHistory[]): HistoryMetric[] {
  return METRICS.filter((metric) => history.some((session) => metricValue(session, metric) !== null))
}

/**
 * Série do gráfico, em ordem cronológica. Sessão aberta fica de fora — o
 * número ainda está mudando. `recent` guarda o melhor de cada dia e os 12
 * últimos dias; `all` agrupa por mês, com o melhor do mês.
 */
export function historySeries(
  history: ExerciseSessionHistory[],
  metric: HistoryMetric,
  range: HistoryRange,
): Array<{ key: string; at: string; value: number }> {
  const best = new Map<string, { key: string; at: string; value: number }>()
  const chronological = [...history].reverse()
  for (const session of chronological) {
    const value = metricValue(session, metric)
    if (value === null || session.status === 'em_andamento') continue
    const day = calendarDayKey(new Date(session.startedAt))
    const key = range === 'all' ? day.slice(0, 7) : day
    const current = best.get(key)
    if (!current || value > current.value) best.set(key, { key, at: current?.at ?? session.startedAt, value })
  }
  const points = [...best.values()]
  return range === 'recent' ? points.slice(-12) : points
}

/** Sessões visíveis agrupadas por mês, e se ainda há sessões mais antigas para mostrar. */
export function pageByMonth(history: ExerciseSessionHistory[], visibleCount: number) {
  const months: Array<{ monthKey: string; sessions: ExerciseSessionHistory[] }> = []
  for (const session of history.slice(0, visibleCount)) {
    const monthKey = calendarDayKey(new Date(session.startedAt)).slice(0, 7)
    const last = months.at(-1)
    if (last?.monthKey === monthKey) last.sessions.push(session)
    else months.push({ monthKey, sessions: [session] })
  }
  return { months, hasMore: history.length > visibleCount }
}
