/**
 * O ciclo é o eixo do app, não o calendário: a próxima sessão é decidida pelo
 * que foi feito por último, nunca pelo dia da semana. Treinar numa quarta fora
 * do plano avança o ciclo igual — "faça o que você não fez da última vez".
 */

export interface CycleTemplate {
  id: string
  position: number
  name: string
}

export interface CycleSession {
  templateId: string
  status: string
  startedAt: string
}

export interface CyclePosition {
  cycleNumber: number
  blockNumber: number
  /** Quantas sessões faltam para fechar o bloco corrente. */
  sessionsToBlockEnd: number
}

const CONTA_PARA_O_CICLO = new Set(['concluida', 'incompleta'])

/** Sessões que avançam o ciclo, da mais antiga para a mais nova. */
export function advancingSessions(sessions: CycleSession[]): CycleSession[] {
  return sessions
    .filter((s) => CONTA_PARA_O_CICLO.has(s.status))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/**
 * Uma sessão incompleta ainda avança o ciclo: ela ocupou o slot. Repetir o
 * mesmo treino porque ele foi interrompido é decisão do usuário, não default —
 * senão uma sessão abandonada trava o rodízio para sempre.
 */
export function nextTemplate(
  templates: CycleTemplate[],
  sessions: CycleSession[],
): CycleTemplate | null {
  if (templates.length === 0) return null

  const ordered = [...templates].sort((a, b) => a.position - b.position)
  const last = advancingSessions(sessions).at(-1)
  if (!last) return ordered[0]!

  const lastIndex = ordered.findIndex((t) => t.id === last.templateId)
  // Template apagado depois de usado: recomeça o ciclo em vez de travar.
  if (lastIndex === -1) return ordered[0]!

  return ordered[(lastIndex + 1) % ordered.length]!
}

export function cyclePosition(
  sessionsPerCycle: number,
  cyclesPerBlock: number,
  completedSessions: number,
): CyclePosition {
  const perCycle = Math.max(1, sessionsPerCycle)
  const perBlock = Math.max(1, cyclesPerBlock)

  const cycleNumber = Math.floor(completedSessions / perCycle) + 1
  const blockNumber = Math.floor((cycleNumber - 1) / perBlock) + 1
  const sessionsPerBlock = perCycle * perBlock
  const sessionsToBlockEnd = sessionsPerBlock - (completedSessions % sessionsPerBlock)

  return { cycleNumber, blockNumber, sessionsToBlockEnd }
}

/**
 * O bloco fechou quando a próxima sessão abre um bloco novo. Só sinaliza —
 * quem aplica a mudança de RIR é o usuário, nunca o app sozinho.
 */
export function blockJustClosed(
  sessionsPerCycle: number,
  cyclesPerBlock: number,
  completedSessions: number,
): boolean {
  if (completedSessions === 0) return false
  const sessionsPerBlock = Math.max(1, sessionsPerCycle) * Math.max(1, cyclesPerBlock)
  return completedSessions % sessionsPerBlock === 0
}

/**
 * Ciclo e bloco de cada sessão, derivados da ordem cronológica.
 *
 * A sessão grava esses números quando começa, mas apagar uma sessão do meio
 * deixaria os gravados com buraco — e o gráfico de volume agrupa por ciclo.
 * Derivar na leitura mantém tudo coerente sem reescrever o histórico: a sessão
 * apagada simplesmente não aconteceu, e as seguintes ocupam o lugar dela.
 */
export function assignCycleNumbers(
  sessions: CycleSession[],
  sessionsPerCycle: number,
  cyclesPerBlock: number,
): Map<CycleSession, CyclePosition> {
  const out = new Map<CycleSession, CyclePosition>()
  advancingSessions(sessions).forEach((session, index) => {
    out.set(session, cyclePosition(sessionsPerCycle, cyclesPerBlock, index))
  })
  return out
}

/** Sequência de sessões sem furo, para o cartão de "sequência" do dashboard. */
export function currentStreak(sessions: CycleSession[]): number {
  let streak = 0
  for (const session of [...advancingSessions(sessions)].reverse()) {
    if (session.status !== 'concluida') break
    streak += 1
  }
  return streak
}

/**
 * No modo semanal o programa tem dias marcados; a projeção do calendário sai
 * daí. No contínuo não existe dia planejado, então projetamos pelo intervalo
 * médio observado — sem isso o calendário não teria o que desenhar à frente.
 */
export function averageIntervalDays(sessions: CycleSession[]): number | null {
  const done = advancingSessions(sessions)
  if (done.length < 2) return null

  const gaps: number[] = []
  for (let i = 1; i < done.length; i++) {
    const previous = new Date(done[i - 1]!.startedAt).getTime()
    const current = new Date(done[i]!.startedAt).getTime()
    gaps.push((current - previous) / 86_400_000)
  }
  return gaps.reduce((a, b) => a + b, 0) / gaps.length
}
