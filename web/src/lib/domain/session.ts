/**
 * Máquina de estados da sessão ao vivo.
 *
 * Nenhuma fase guarda contador regressivo: tudo é derivado de um instante
 * absoluto (`phaseStartedAt`). O usuário sai para o Spotify, o navegador
 * descarta o timer, ele volta — e o tempo continua certo. Contador em memória
 * mentiria em toda troca de app.
 */

export type SessionPhase = 'preparacao' | 'exercicios' | 'descanso' | 'cardio' | 'encerrada'

export interface SessionState {
  phase: SessionPhase
  phaseStartedAt: string
  /** Índice do item do template em execução. */
  itemIndex: number
  setIndex: number
  restSeconds: number
}

/** 6h sem nenhum registro: a sessão fecha sozinha e é marcada incompleta. */
export const AUTO_CLOSE_AFTER_MS = 6 * 60 * 60 * 1000

export const PREP_SECONDS = 120
export const CARDIO_SECONDS = 20 * 60

export function elapsedSeconds(since: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
}

export function remainingSeconds(since: string, total: number, now: number = Date.now()): number {
  return Math.max(0, total - elapsedSeconds(since, now))
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export interface SessionItem {
  id: string
  sets: number
  restSeconds: number | null
}

export interface LoggedSet {
  templateItemId: string | null
  setIndex: number
  isWarmup: boolean
  skipped: boolean
}

/**
 * Quantas séries de trabalho faltam. Aquecimento não entra na conta porque não
 * conta como série de trabalho — mas séries extras adicionadas na hora entram,
 * já que o usuário decidiu fazê-las.
 */
export function sessionProgress(items: SessionItem[], logged: LoggedSet[]) {
  const planned = items.reduce((total, item) => total + item.sets, 0)
  const done = logged.filter((s) => !s.isWarmup).length
  const extra = Math.max(0, done - planned)

  return { done, planned: planned + extra, remaining: Math.max(0, planned - done) }
}

/**
 * Próximo slot a executar: o primeiro item cujas séries de trabalho ainda não
 * fecharam. Pular um exercício não trava a sessão — o item pulado sai da fila
 * com todas as séries marcadas como `skipped`.
 */
export function nextSlot(
  items: SessionItem[],
  logged: LoggedSet[],
): { itemIndex: number; setIndex: number } | null {
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!
    const done = logged.filter((s) => s.templateItemId === item.id && !s.isWarmup).length
    if (done < item.sets) return { itemIndex: index, setIndex: done }
  }
  return null
}

export function restFor(item: SessionItem | undefined, programDefault: number): number {
  return item?.restSeconds ?? programDefault
}

/**
 * Uma sessão só é "concluída" se todo item foi resolvido — feito ou pulado
 * explicitamente. Fechar com séries pendentes é `incompleta`, e é isso que o
 * calendário desenha diferente.
 */
export function finalStatus(items: SessionItem[], logged: LoggedSet[]): 'concluida' | 'incompleta' {
  return nextSlot(items, logged) === null ? 'concluida' : 'incompleta'
}

export function shouldAutoClose(lastActivityAt: string, now: number = Date.now()): boolean {
  return now - new Date(lastActivityAt).getTime() >= AUTO_CLOSE_AFTER_MS
}

/**
 * Uma série como ela é lida depois, na revisão da sessão — não a que está sendo
 * executada. Estrutural de propósito: quem chama passa a linha do IndexedDB
 * inteira e recebe ela de volta, sem o domínio conhecer o schema.
 */
export interface ReviewedSet {
  exerciseId: string
  setIndex: number
  isWarmup: boolean
  skipped: boolean
  weightKg: number | null
  completedAt: string | null
  createdAt?: string
}

/**
 * Agrupa as séries por exercício, na ordem em que os exercícios foram feitos.
 *
 * `setIndex` conta dentro de um exercício, então ordenar a lista plana por ele
 * embaralha exercícios diferentes; e ordenar por nome contaria uma sessão que
 * não aconteceu naquela ordem. O que ordena é quando cada exercício começou.
 */
export function groupByExercise<T extends ReviewedSet>(logs: T[]): Array<{ exerciseId: string; logs: T[] }> {
  const groups = new Map<string, T[]>()
  for (const log of logs) {
    const bucket = groups.get(log.exerciseId)
    if (bucket) bucket.push(log)
    else groups.set(log.exerciseId, [log])
  }

  return [...groups.entries()]
    .map(([exerciseId, rows]) => ({
      exerciseId,
      logs: [...rows].sort((a, b) => a.setIndex - b.setIndex),
    }))
    .sort((a, b) => startedAt(a.logs).localeCompare(startedAt(b.logs)))
}

function startedAt(logs: ReviewedSet[]): string {
  return logs.reduce((earliest, log) => {
    const at = log.completedAt ?? log.createdAt ?? ''
    if (at === '') return earliest
    return earliest === '' || at < earliest ? at : earliest
  }, '')
}

/** A série que representa o exercício num resumo é a mais pesada de trabalho. */
export function topWorkingSet<T extends ReviewedSet>(logs: T[]): T | null {
  const working = logs.filter((l) => !l.isWarmup && !l.skipped && l.weightKg !== null)
  if (working.length === 0) return null
  return working.reduce((top, log) => (log.weightKg! > top.weightKg! ? log : top))
}
