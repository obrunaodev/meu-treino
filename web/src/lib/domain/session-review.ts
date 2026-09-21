/**
 * A leitura que decide a próxima sessão.
 *
 * O relatório de uma sessão responde "o que eu fiz"; sozinho ele não responde
 * "o que faço da próxima vez". A dupla progressão se decide comparando hoje com
 * a última vez que o mesmo treino rodou, e é essa comparação que vira conselho.
 *
 * Fica fora de `training-report.ts` porque só existe para UMA sessão: no
 * relatório de bloco o mesmo exercício atravessa várias, e "a anterior" deixa
 * de ter um significado único.
 */

import type { PlanSnapshotItem, SetLog, WorkoutSession } from '../types.js'
import { nextLoadStep } from './load.js'
import { progressionAction, progressionMessageKey, type ProgressionAction, type ProgressionMetric } from './progression.js'
import { prefillSource } from './session.js'

export interface ExerciseExposure {
  startedAt: string
  workingSets: number
  /** Carga da série mais pesada, na base em que foi registrada. */
  topLoadKg: number | null
  plate: number | null
  /** Menor e maior resultado das séries; iguais quando todas fecharam o mesmo número. */
  low: number | null
  high: number | null
  /** O menor RIR. A série mais dura é a que decide o ajuste, e a média a esconde. */
  worstRir: number | null
}

export interface ExerciseProgress {
  exerciseId: string
  metric: ProgressionMetric
  loadPerSide: boolean
  current: ExerciseExposure
  previous: ExerciseExposure | null
  action: ProgressionAction | null
  /** A frase da decisão; o módulo não conhece idioma, então devolve a chave. */
  messageKey: string | null
  /** Carga da próxima vez, na mesma base do registro; null quando a decisão não mexe nela. */
  suggested: { kg: number | null; plate: number | null } | null
}

const nonNull = (value: number | null): value is number => value !== null

function exposure(startedAt: string, sets: SetLog[], metric: ProgressionMetric): ExerciseExposure | null {
  if (sets.length === 0) return null
  const measures = sets.map((set) => (metric === 'seconds' ? set.seconds : set.reps)).filter(nonNull)
  const efforts = sets.map((set) => set.rir).filter(nonNull)
  const heaviest = sets.reduce<SetLog | null>((best, set) => (
    set.weightKg !== null && (best === null || set.weightKg > best.weightKg!) ? set : best
  ), null)

  return {
    startedAt,
    workingSets: sets.length,
    topLoadKg: heaviest?.weightKg ?? null,
    plate: heaviest?.plateCount ?? null,
    low: measures.length ? Math.min(...measures) : null,
    high: measures.length ? Math.max(...measures) : null,
    worstRir: efforts.length ? Math.min(...efforts) : null,
  }
}

/**
 * Só sugere número quando a decisão mexe na carga: "manter" e "avançar nas
 * repetições" não mudam o peso, e repetir o valor de hoje seria ruído. O passo
 * vem do equipamento daquele dia — em máquina de pino subir é ir para a próxima
 * placa —, e sem equipamento cadastrado não há passo que a máquina aceite.
 */
function suggestedLoad(item: PlanSnapshotItem, current: ExerciseExposure, action: ProgressionAction | null) {
  if (action !== 'increase' && action !== 'reduce') return null
  if (!item.equipment || current.topLoadKg === null) return null
  return nextLoadStep(item.equipment, { plate: current.plate, kg: current.topLoadKg }, action === 'increase' ? 1 : -1)
}

function workingSets(logs: SetLog[], sessionId: string, exerciseId: string): SetLog[] {
  return logs
    .filter((log) => log.sessionId === sessionId && log.exerciseId === exerciseId && !log.isWarmup && !log.skipped)
    .sort((a, b) => a.setIndex - b.setIndex)
}

/**
 * Um registro por exercício do plano, achável pelo id do exercício.
 *
 * A chave é o exercício e não o item do plano: o pré-preenchimento já agrupa o
 * histórico assim, e o detalhamento do relatório também. Prescrever o mesmo
 * exercício duas vezes no mesmo treino renderia duas linhas idênticas.
 */
export function progressReview(
  session: WorkoutSession,
  sessions: WorkoutSession[],
  logs: SetLog[],
): Map<string, ExerciseProgress> {
  const review = new Map<string, ExerciseProgress>()

  for (const item of session.planSnapshot?.items ?? []) {
    if (review.has(item.exerciseId)) continue
    const metric: ProgressionMetric = item.isTimeBased ? 'seconds' : 'reps'
    const today = workingSets(logs, session.id, item.exerciseId)
    const current = exposure(session.startedAt, today, metric)
    if (!current) continue

    // Só o mesmo treino: a faixa deste item é que dá sentido ao conselho.
    const source = prefillSource(session, sessions, logs, item.exerciseId)
    const earlier = source?.origin === 'template' ? source : null
    const action = progressionAction(today, earlier?.sets ?? [], item.repMax, metric)

    review.set(item.exerciseId, {
      exerciseId: item.exerciseId,
      metric,
      loadPerSide: item.loadPerSide,
      current,
      previous: earlier ? exposure(earlier.session.startedAt, earlier.sets, metric) : null,
      action,
      messageKey: action ? progressionMessageKey(action, metric, today) : null,
      suggested: suggestedLoad(item, current, action),
    })
  }

  return review
}
