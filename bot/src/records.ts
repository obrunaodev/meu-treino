/**
 * Recordes de uma entrada do WhatsApp, com a mesma regra do app
 * (web/src/lib/domain/records.ts). O bot não compartilha código com o web — a
 * imagem só copia bot/src —, então a regra é gêmea e os testes usam os mesmos
 * números dos dois lados para que não se afastem.
 */

export type RecordKind = 'top_load' | 'e1rm' | 'rep_max' | 'session_volume'

export const MAX_E1RM_REPS = 12
const LOAD_EPSILON_KG = 0.01

/** Série de trabalho de uma sessão anterior, com a carga total já dobrada quando é por lado. */
export interface PriorSet {
  sessionId: string
  totalKg: number | null
  reps: number | null
}

/** Uma entrada do bot são N séries iguais. */
export interface EntrySets {
  totalKg: number
  reps: number
  sets: number
}

export function estimateOneRepMax(totalKg: number | null, reps: number | null): number | null {
  if (totalKg === null || reps === null || totalKg <= 0 || reps < 1 || reps > MAX_E1RM_REPS) return null
  return reps === 1 ? totalKg : totalKg * (1 + reps / 30)
}

function maxOf(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null)
  return present.length ? Math.max(...present) : null
}

function bestSessionVolume(prior: PriorSet[]): number | null {
  const bySession = new Map<string, number>()
  for (const set of prior) bySession.set(set.sessionId, (bySession.get(set.sessionId) ?? 0) + (set.totalKg ?? 0) * (set.reps ?? 0))
  return maxOf([...bySession.values()].filter((volume) => volume > 0))
}

/** Quais recordes a entrada bate. Sem sessão anterior, nenhum; repetição só quando não levou outro. */
export function entryRecords(prior: PriorSet[], entry: EntrySets, bodyweight: boolean): RecordKind[] {
  if (prior.length === 0) return []
  const kinds: RecordKind[] = []
  const above = (mine: number | null, best: number | null) => mine !== null && best !== null && mine > best + LOAD_EPSILON_KG

  if (above(entry.totalKg, maxOf(prior.map((set) => set.totalKg)))) kinds.push('top_load')
  if (!bodyweight && above(estimateOneRepMax(entry.totalKg, entry.reps), maxOf(prior.map((set) => estimateOneRepMax(set.totalKg, set.reps))))) {
    kinds.push('e1rm')
  }
  const withReps = prior.filter((set) => set.reps !== null)
  const beaten = withReps.some((set) => set.reps! >= entry.reps && (set.totalKg ?? 0) >= entry.totalKg - LOAD_EPSILON_KG)
  if (kinds.length === 0 && withReps.length > 0 && !beaten) kinds.push('rep_max')
  if (above(entry.sets * entry.totalKg * entry.reps, bestSessionVolume(prior))) kinds.push('session_volume')
  return kinds
}
