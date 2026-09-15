import type { PainEvent, SetLog, WorkoutSession } from '../types.js'

export interface BlockPosition {
  periodNumber: number
  blockNumber: number
}

export interface BlockEffort {
  sessions: number
  ratedSets: number
  heavySets: number
  /** Fração das séries avaliadas que passaram do esforço-alvo do próprio item. */
  heavyShare: number
  painSessions: number
}

export type DeloadReason = 'effort' | 'pain'

export interface DeloadSignal {
  suggest: boolean
  reasons: DeloadReason[]
}

/**
 * Limites do aviso de semana leve.
 *
 * São um ponto de partida, não uma verdade: ficam juntos aqui para serem
 * ajustados num lugar só depois de alguns blocos de uso real.
 */
export const DELOAD_RULES = {
  /** Abaixo disso não há bloco para julgar. */
  minSessions: 2,
  /** Abaixo disso a amostra é pequena demais para falar de esforço. */
  minRatedSets: 12,
  heavyShare: 0.5,
  painLevel: 4,
  painSessions: 2,
}

const positionOf = (session: WorkoutSession): BlockPosition => ({
  periodNumber: session.periodNumber ?? 1,
  blockNumber: session.blockNumber,
})

/** Sessões encerradas de um bloco do programa — o mesmo recorte do relatório de bloco. */
export function blockSessions(sessions: WorkoutSession[], programId: string, block: BlockPosition): WorkoutSession[] {
  return sessions.filter((session) => session.programId === programId
    && session.status !== 'em_andamento'
    && positionOf(session).periodNumber === block.periodNumber
    && positionOf(session).blockNumber === block.blockNumber)
}

/**
 * O bloco atual vem logo depois do que fechou?
 *
 * Depois de um intervalo maior — férias, lesão, meses parado — o descanso já
 * aconteceu, e sugerir semana leve não faz sentido.
 */
export function isNextBlock(closed: BlockPosition, current: BlockPosition): boolean {
  if (closed.periodNumber === current.periodNumber) return current.blockNumber === closed.blockNumber + 1
  return current.periodNumber === closed.periodNumber + 1 && current.blockNumber === 1
}

/**
 * Esforço registrado no bloco.
 *
 * Pesado é a série que ficou abaixo do RIR alvo do próprio item e no máximo a
 * uma repetição da falha: um plano que já mira RIR 1 não pode disparar aviso
 * todo bloco. Dor vem dos registros ligados à sessão — a marca de dor na série
 * nunca é gravada hoje.
 */
export function blockEffort(sessions: WorkoutSession[], sets: SetLog[], pain: PainEvent[]): BlockEffort | null {
  if (sessions.length < DELOAD_RULES.minSessions) return null
  const ids = new Set(sessions.map((session) => session.id))
  const targetByItem = new Map<string, number>()
  for (const session of sessions) {
    for (const item of session.planSnapshot?.items ?? []) targetByItem.set(item.id, item.rirTarget ?? 2)
  }

  const rated = sets.filter((set) => ids.has(set.sessionId) && !set.isWarmup && !set.skipped && set.rir !== null)
  const heavy = rated.filter((set) => {
    const target = set.templateItemId === null ? 2 : targetByItem.get(set.templateItemId) ?? 2
    return set.rir! <= 1 && set.rir! < target
  })
  const painSessions = new Set(pain
    .filter((event) => event.sessionId && ids.has(event.sessionId) && event.level >= DELOAD_RULES.painLevel)
    .map((event) => event.sessionId))
  for (const set of sets) {
    if (ids.has(set.sessionId) && set.hadPain) painSessions.add(set.sessionId)
  }

  return {
    sessions: sessions.length,
    ratedSets: rated.length,
    heavySets: heavy.length,
    heavyShare: rated.length === 0 ? 0 : heavy.length / rated.length,
    painSessions: painSessions.size,
  }
}

/** O bloco fechou pesado? Sugestão apenas: nada muda no plano. */
export function deloadSignal(effort: BlockEffort | null, rules = DELOAD_RULES): DeloadSignal {
  if (!effort) return { suggest: false, reasons: [] }
  const reasons: DeloadReason[] = []
  if (effort.ratedSets >= rules.minRatedSets && effort.heavyShare >= rules.heavyShare) reasons.push('effort')
  if (effort.painSessions >= rules.painSessions) reasons.push('pain')
  return { suggest: reasons.length > 0, reasons }
}
