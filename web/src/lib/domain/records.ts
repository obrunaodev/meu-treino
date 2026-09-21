import type { ExerciseSessionHistory } from './exercise-history.js'
import { estimateOneRepMax } from './load.js'

export type RecordKind = 'top_load' | 'e1rm' | 'rep_max' | 'session_volume' | 'longest_set'

/**
 * Carga digitada em lb vira kg sem arredondar, e o Postgres guarda com duas
 * casas. Sem folga, repetir exatamente a mesma carga pareceria recorde.
 */
export const LOAD_EPSILON_KG = 0.01

/** Chave do recorde que é da sessão inteira, não de uma série. */
export const SESSION_RECORD_KEY = 'session'

/**
 * Chave do recorde de um lado dentro da série ao vivo. Cada lado de um
 * exercício com lados separados concorre por conta própria — 40 kg na perna
 * direita são 40 kg —, mas o direito usa a chave da própria série para que o
 * exercício comum, de um lado só, continue com a chave que sempre teve.
 */
export const liveRecordKey = (setIndex: number, side: 'ambos' | 'D' | 'E') =>
  (side === 'E' ? `${setIndex}|E` : String(setIndex))

export interface ComparableSet {
  key: string
  setIndex: number
  totalKg: number | null
  reps: number | null
  seconds: number | null
  bodyweight: boolean
}

export interface FrontierPoint {
  reps: number
  totalKg: number
  sessionId: string
  at: string
}

export interface RecordBaseline {
  /** Sessões encerradas com série de trabalho: sem nenhuma, não há o que bater. */
  sessions: number
  topLoadKg: number | null
  e1rmKg: number | null
  sessionVolumeKg: number | null
  longestSeconds: number | null
  /** Melhor carga em cada número de repetições: nenhum ponto supera outro nas duas coisas. */
  frontier: FrontierPoint[]
}

export const EMPTY_BASELINE: RecordBaseline = {
  sessions: 0, topLoadKg: null, e1rmKg: null, sessionVolumeKg: null, longestSeconds: null, frontier: [],
}

const e1rmOf = (set: ComparableSet) => (set.bodyweight ? null : estimateOneRepMax(set.totalKg, set.reps))
const maxOrNull = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b))
const dominates = (a: { reps: number; totalKg: number }, b: { reps: number; totalKg: number }) =>
  a.reps >= b.reps && a.totalKg >= b.totalKg - LOAD_EPSILON_KG

export function volumeOf(sets: ComparableSet[]): number {
  return sets.reduce((total, set) => total + (set.totalKg ?? 0) * (set.reps ?? 0), 0)
}

function addToFrontier(frontier: FrontierPoint[], point: FrontierPoint): FrontierPoint[] {
  if (frontier.some((existing) => dominates(existing, point))) return frontier
  return [...frontier.filter((existing) => !dominates(point, existing)), point]
}

/** Soma uma sessão encerrada ao que servirá de comparação para as seguintes. */
export function foldSession(baseline: RecordBaseline, sets: ComparableSet[], sessionId: string, at: string): RecordBaseline {
  if (sets.length === 0) return baseline
  const volume = volumeOf(sets)
  // Peso corporal entra na fronteira com carga zero: mais repetições ainda é recorde.
  const frontier = sets.reduce((points, set) => (set.reps === null ? points : addToFrontier(points, {
    reps: set.reps, totalKg: set.totalKg ?? 0, sessionId, at,
  })), baseline.frontier)
  return {
    sessions: baseline.sessions + 1,
    topLoadKg: sets.reduce((best, set) => maxOrNull(best, set.totalKg), baseline.topLoadKg),
    e1rmKg: sets.reduce((best, set) => maxOrNull(best, e1rmOf(set)), baseline.e1rmKg),
    sessionVolumeKg: volume > 0 ? maxOrNull(baseline.sessionVolumeKg, volume) : baseline.sessionVolumeKg,
    longestSeconds: sets.reduce((best, set) => maxOrNull(best, set.seconds), baseline.longestSeconds),
    frontier,
  }
}

/** Melhor série acima do limite; empate fica com a primeira. Sem limite, não há o que bater. */
function bestAbove(sets: ComparableSet[], value: (set: ComparableSet) => number | null, threshold: number | null) {
  if (threshold === null) return null
  let winner: ComparableSet | null = null
  let best = threshold + LOAD_EPSILON_KG
  for (const set of [...sets].sort((a, b) => a.setIndex - b.setIndex)) {
    const candidate = value(set)
    if (candidate !== null && candidate > best) {
      winner = set
      best = candidate
    }
  }
  return winner
}

const asPoint = (set: ComparableSet) => ({ reps: set.reps ?? 0, totalKg: set.totalKg ?? 0 })

/** Recorde de repetições entre as séries que ainda não levaram outro, e que nenhuma premiada iguala. */
function bestRepRecord(sets: ComparableSet[], frontier: FrontierPoint[], awarded: ComparableSet[]) {
  if (frontier.length === 0) return null
  const candidates = sets.filter((set) => set.reps !== null
    && !awarded.includes(set)
    && !awarded.some((winner) => winner.reps !== null && dominates(asPoint(winner), asPoint(set)))
    && !frontier.some((point) => dominates(point, asPoint(set))))
  return candidates.sort((a, b) => (b.totalKg ?? 0) - (a.totalKg ?? 0) || b.reps! - a.reps! || a.setIndex - b.setIndex)[0] ?? null
}

/**
 * Quais séries da sessão batem tudo o que veio antes.
 *
 * Só a melhor série leva cada recorde — duas séries iguais não dividem a
 * marca. Repetição vira recorde próprio só quando a série não levou outro:
 * carga maior que todas sempre está na fronteira, e dizer os dois é ruído.
 */
export function sessionRecordKinds(baseline: RecordBaseline, sets: ComparableSet[]): Map<string, RecordKind[]> {
  const kinds = new Map<string, RecordKind[]>()
  if (baseline.sessions === 0) return kinds
  const award = (kind: RecordKind, winner: ComparableSet | null) => {
    if (winner) kinds.set(winner.key, [...(kinds.get(winner.key) ?? []), kind])
  }
  award('top_load', bestAbove(sets, (set) => set.totalKg, baseline.topLoadKg))
  award('e1rm', bestAbove(sets, e1rmOf, baseline.e1rmKg))
  award('longest_set', bestAbove(sets, (set) => set.seconds, baseline.longestSeconds))
  award('rep_max', bestRepRecord(sets, baseline.frontier, sets.filter((set) => kinds.has(set.key))))
  if (baseline.sessionVolumeKg !== null && volumeOf(sets) > baseline.sessionVolumeKg + LOAD_EPSILON_KG) {
    kinds.set(SESSION_RECORD_KEY, ['session_volume'])
  }
  return kinds
}

/** Séries de trabalho de uma sessão, no formato de comparação. */
export function comparableSets(session: ExerciseSessionHistory): ComparableSet[] {
  return session.sets
    .filter((set) => !set.isWarmup && !set.skipped)
    .map((set) => ({ key: set.id, setIndex: set.setIndex, totalKg: set.totalKg, reps: set.reps, seconds: set.seconds, bodyweight: set.bodyweight }))
}

/**
 * O que a sessão atual precisa bater: sessões encerradas antes dela, pela
 * data do treino. A sessão atual e as abertas ficam de fora.
 */
export function recordBaseline(history: ExerciseSessionHistory[], current: { id: string; startedAt: string }): RecordBaseline {
  return [...history].reverse()
    .filter((session) => session.sessionId !== current.id && session.status !== 'em_andamento' && session.startedAt < current.startedAt)
    .reduce((baseline, session) => foldSession(baseline, comparableSets(session), session.sessionId, session.startedAt), EMPTY_BASELINE)
}

/**
 * Recordes ao longo de todo o histórico, recalculados do zero: editar ou
 * apagar uma sessão antiga muda quais séries seguintes foram recorde.
 */
export function personalRecords(history: ExerciseSessionHistory[]) {
  let baseline = EMPTY_BASELINE
  const flagsBySetId = new Map<string, RecordKind[]>()
  const volumeRecordSessions = new Set<string>()
  for (const session of [...history].reverse()) {
    if (session.status === 'em_andamento') continue
    const sets = comparableSets(session)
    for (const [key, kinds] of sessionRecordKinds(baseline, sets)) {
      if (key === SESSION_RECORD_KEY) volumeRecordSessions.add(session.sessionId)
      else flagsBySetId.set(key, kinds)
    }
    baseline = foldSession(baseline, sets, session.sessionId, session.startedAt)
  }
  return { baseline, flagsBySetId, volumeRecordSessions }
}
