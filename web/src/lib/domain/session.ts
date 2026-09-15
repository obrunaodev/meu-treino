/**
 * Máquina de estados da sessão ao vivo.
 *
 * Nenhuma fase guarda contador regressivo: tudo é derivado de um instante
 * absoluto (`phaseStartedAt`). O usuário sai para o Spotify, o navegador
 * descarta o timer, ele volta — e o tempo continua certo. Contador em memória
 * mentiria em toda troca de app.
 */

import { planBlocks, supersetRounds } from './supersets.js'

export type SessionPhase = 'exercicios' | 'descanso' | 'cardio' | 'encerrada'

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
  supersetGroup?: string | null
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

/** Progresso da interface de checklist: um exercício só conta quando foi todo resolvido. */
export function exerciseProgress(items: SessionItem[], logged: LoggedSet[]) {
  const done = items.filter((item) => (
    logged.filter((set) => set.templateItemId === item.id && !set.isWarmup && !set.skipped).length >= item.sets
  )).length

  return { done, planned: items.length, remaining: items.length - done }
}

/** Distinguishes skipped exercises from completed ones in the live overview. */
export function exerciseExecutionStatus(item: SessionItem, logged: LoggedSet[]): 'pending' | 'skipped' | 'done' {
  const itemSets = logged.filter((set) => set.templateItemId === item.id && !set.isWarmup)
  if (itemSets.filter((set) => !set.skipped).length >= item.sets) return 'done'
  if (itemSets.some((set) => set.skipped)) return 'skipped'
  return 'pending'
}

/** Valor fixo gravado ao concluir uma prescrição sem editar repetições na sessão. */
export function prescribedResult(repMin: number | null, repMax: number | null): number | null {
  return repMax ?? repMin
}

/** Chooses defaults for the next set without overriding work already done today. */
export function previousSetForDraft<T extends { setIndex: number }>(
  currentSets: T[],
  previousSessionSets: T[],
  nextSetIndex: number,
  trackingMode: 'compact' | 'full',
): T | null {
  const current = currentSets.at(-1)
  if (current) return current
  if (trackingMode === 'full') {
    return previousSessionSets.find((set) => set.setIndex === nextSetIndex) ?? previousSessionSets.at(-1) ?? null
  }
  return previousSessionSets.at(-1) ?? null
}

interface SessionReference {
  id: string
  templateId: string
  startedAt: string
}

interface HistoryLog {
  sessionId: string
  exerciseId: string
  setIndex: number
  isWarmup: boolean
  skipped: boolean
}

export interface PrefillSource<S, L> {
  /** `template`: histórico do mesmo treino. `other_workout`: outro treino, e só a carga vale. */
  origin: 'template' | 'other_workout'
  session: S
  /** Séries de trabalho do exercício nessa sessão, em ordem. */
  sets: L[]
  /** O mesmo na sessão anterior do mesmo treino com o exercício — base do conselho de progressão. */
  earlierSets: L[]
}

/**
 * De onde vêm os valores pré-preenchidos de um exercício.
 *
 * Primeiro o mesmo treino, pulando sessões em que o exercício não foi feito:
 * um pulo não pode apagar o histórico. Sem nenhuma, a última vez em qualquer
 * treino. Sempre antes da sessão atual, pela data do treino e não da edição.
 *
 * Não é simplesmente "a mais recente": Treino A com 80 kg × 6 e Treino B com
 * 60 kg × 12 no mesmo exercício sobrescreveriam um ao outro a cada sessão.
 */
export function prefillSource<S extends SessionReference, L extends HistoryLog>(
  current: S,
  sessions: S[],
  logs: L[],
  exerciseId: string,
): PrefillSource<S, L> | null {
  const bySession = workingSetsBySession(logs, exerciseId)
  const earlier = sessions
    .filter((session) => session.id !== current.id && session.startedAt < current.startedAt && bySession.has(session.id))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const [latest, older] = earlier.filter((session) => session.templateId === current.templateId)
  if (latest) {
    return { origin: 'template', session: latest, sets: bySession.get(latest.id)!, earlierSets: older ? bySession.get(older.id)! : [] }
  }
  const other = earlier[0]
  return other ? { origin: 'other_workout', session: other, sets: bySession.get(other.id)!, earlierSets: [] } : null
}

function workingSetsBySession<L extends HistoryLog>(logs: L[], exerciseId: string): Map<string, L[]> {
  const bySession = new Map<string, L[]>()
  for (const log of logs) {
    if (log.exerciseId !== exerciseId || log.isWarmup || log.skipped) continue
    bySession.set(log.sessionId, [...(bySession.get(log.sessionId) ?? []), log])
  }
  for (const sets of bySession.values()) sets.sort((a, b) => a.setIndex - b.setIndex)
  return bySession
}

export interface SetDraft { kg: number | null; plate: number | null; result: number | null; rir: number | null; checked: boolean }

interface DraftItem {
  repMin: number | null
  repMax: number | null
  rirTarget: number | null
  isTimeBased: boolean
  trackingMode?: 'compact' | 'full'
}

interface DraftLog {
  setIndex: number
  weightKg: number | null
  plateCount: number | null
  reps: number | null
  seconds: number | null
  rir: number | null
}

/**
 * Rascunho de uma série ao abrir o exercício.
 *
 * O que já foi feito hoje vence. Do mesmo treino vêm carga, resultado e
 * esforço, como sempre. De outro treino vem só a carga: repetições e esforço
 * de outra prescrição — outra faixa, outro alvo — pareceriam um histórico que
 * nunca existiu, e salvar sem editar os gravaria.
 */
export function initialSetDraft(
  item: DraftItem,
  setIndex: number,
  current: DraftLog | undefined,
  source: PrefillSource<unknown, DraftLog> | null,
): SetDraft {
  const prescribed = prescribedResult(item.repMin, item.repMax)
  if (current) return draftFromLog(item, current, prescribed, true)
  if (source?.origin === 'other_workout') {
    const last = source.sets.at(-1)!
    return { kg: last.weightKg, plate: last.plateCount, result: prescribed, rir: item.rirTarget, checked: false }
  }
  const previous = source ? previousSetForDraft([], source.sets, setIndex, item.trackingMode ?? 'compact') : null
  if (previous) return draftFromLog(item, previous, prescribed, false)
  return { kg: null, plate: null, result: prescribed, rir: item.rirTarget, checked: false }
}

function draftFromLog(item: DraftItem, log: DraftLog, prescribed: number | null, checked: boolean): SetDraft {
  return {
    kg: log.weightKg,
    plate: log.plateCount,
    result: (item.isTimeBased ? log.seconds : log.reps) ?? prescribed,
    rir: log.rir ?? item.rirTarget,
    checked,
  }
}

/**
 * Próximo slot a executar: a primeira série de trabalho ainda não registrada,
 * na ordem em que o treino roda. Dentro de um bi-set a ordem alterna entre os
 * membros (A1, B1, A2, B2…); fora dele um bloco tem um membro só e a alternância
 * vira a fila de sempre. Pular um exercício não trava a sessão — o item pulado
 * sai da fila com todas as séries marcadas como `skipped`.
 */
export function nextSlot(
  items: SessionItem[],
  logged: LoggedSet[],
): { itemIndex: number; setIndex: number } | null {
  const done = new Map(items.map((item) =>
    [item.id, logged.filter((s) => s.templateItemId === item.id && !s.isWarmup).length]))
  for (const block of planBlocks(items)) {
    for (const entry of supersetRounds(block.items).flat()) {
      if (entry.setIndex >= done.get(entry.itemId)!) {
        return { itemIndex: items.findIndex((item) => item.id === entry.itemId), setIndex: entry.setIndex }
      }
    }
  }
  return null
}

export type RestCommand = { kind: 'start'; afterSetIndex: number } | { kind: 'stop' } | null

/**
 * O que o descanso faz quando uma série é marcada ou desmarcada.
 *
 * Só com a preferência ligada — o início manual é o padrão. Depois da última
 * série não há intervalo: o descanso existe entre séries, e sair do exercício
 * já o cancela. Marcar outra série mais adiante reinicia a contagem para ela,
 * porque o intervalo anterior virou passado; marcar a própria série que já
 * está descansando não reinicia nada, para não atropelar um início manual.
 */
export function restCommandForToggle(input: {
  setIndex: number
  sets: number
  nextChecked: boolean
  nextSetChecked: boolean
  activeRestAfter: number | null
  autoStart: boolean
}): RestCommand {
  const { setIndex, sets, nextChecked, nextSetChecked, activeRestAfter, autoStart } = input
  if (!autoStart) return null
  const resting = activeRestAfter !== null
  if (!nextChecked) return activeRestAfter === setIndex ? { kind: 'stop' } : null
  if (setIndex >= sets - 1) return resting ? { kind: 'stop' } : null
  if (nextSetChecked || activeRestAfter === setIndex) return null
  return { kind: 'start', afterSetIndex: setIndex }
}

/** O mesmo default da coluna `programs.default_rest_seconds`, para quando o programa ainda não carregou. */
export const DEFAULT_REST_SECONDS = 90

export function restFor(item: SessionItem | undefined, programDefault: number): number {
  return item?.restSeconds ?? programDefault
}

/**
 * Uma sessão só é "concluída" se todo item foi resolvido — feito ou pulado
 * explicitamente. Fechar com séries pendentes é `incompleta`, e é isso que o
 * calendário desenha diferente.
 */
export function finalStatus(items: SessionItem[], logged: LoggedSet[]): 'concluida' | 'incompleta' {
  const completed = items.every((item) => (
    logged.filter((set) => set.templateItemId === item.id && !set.isWarmup && !set.skipped).length >= item.sets
  ))
  return completed ? 'concluida' : 'incompleta'
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
    .sort((a, b) => checkedAt(a.logs).localeCompare(checkedAt(b.logs)))
}

function checkedAt(logs: ReviewedSet[]): string {
  const working = logs.filter((log) => !log.isWarmup)
  const candidates = working.length > 0 ? working : logs
  return candidates.reduce((earliest, log) => {
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
