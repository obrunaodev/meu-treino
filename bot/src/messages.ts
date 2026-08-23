import type { ExerciseEntry } from './parser.js'
import type { ExpectedWorkout, WorkoutItem, WorkoutPlan } from './workout.js'
import type { WorkoutReview } from './workout-history.js'
import type { WeeklySession } from './weekly-history.js'

export function workoutMessage(workout: WorkoutPlan, options: { includeLinks?: boolean } = {}) {
  const list = workout.items.map((item, index) => {
    const reps = item.repMin === item.repMax ? item.repMin : `${item.repMin ?? '—'}–${item.repMax ?? '—'}`
    const side = item.loadPerSide ? '/lado' : ''
    const load = item.previousWeightKg === null
      ? 'Carga: definir'
      : `Carga: ${Number(item.previousWeightKg.toFixed(1))} kg${side}`
    const video = options.includeLinks && item.videoUrl ? `\n   Link: ${item.videoUrl}` : ''
    return `${index + 1}. *${item.name}* · ${item.sets}×${reps} · RIR ${item.rirTarget ?? '—'} · ${load}${video}`
  }).join('\n\n')
  return `🏋️ *${workout.templateName.toUpperCase()}*\n\n${list}\n\n_Responda: exercício peso séries×reps RIR_\nEx.: \`1 100kg 3x15 1rir\`\nPular: \`/skip 1\``
}

export function todayMessage(
  workout: ExpectedWorkout,
  options: { includeLinks?: boolean } = {},
  review: WorkoutReview | null = null,
) {
  if (!workout.alreadyStarted) {
    return `👀 Apenas prévia — nenhuma sessão foi iniciada.\n\n${workoutMessage(workout, options)}\n\nPara iniciar, envie */start*.`
  }

  const resolved = review?.items.filter((item) => item.sets > 0 || item.skipped).length ?? 0
  const total = review?.items.length ?? workout.items.length
  const nextIndex = review?.items.findIndex((item) => item.sets === 0 && !item.skipped) ?? -1
  const next = nextIndex >= 0 ? `Próximo: *${nextIndex + 1}. ${review!.items[nextIndex]!.name}*` : 'Nenhum exercício pendente.'
  const progress = review ? `\n\n📊 *ESTADO ATUAL · ${resolved}/${total} resolvidos*\n${next}\n${reviewLines(review)}` : ''

  return `▶️ Esta sessão já está em andamento.\n\n${workoutMessage(workout, options)}${progress}\n\nContinue registrando os exercícios ou envie */end* para encerrar.`
}

export function savedMessage(index: number, item: WorkoutItem, entry: ExerciseEntry, finished: boolean) {
  const weight = Number(entry.weightKg.toFixed(1))
  const side = item.loadPerSide ? '/lado' : ''
  const done = `✅ *${index}. ${item.name}*\n${weight} kg${side} · ${entry.sets}×${entry.reps} · RIR ${entry.rir}`
  return finished ? `${done}\n\n🏁 *Treino concluído!* O histórico já foi atualizado.` : done
}

export function skippedMessage(index: number, item: WorkoutItem, finished: boolean) {
  const skipped = `⏭️ *${index}. ${item.name}* foi pulado.`
  return finished ? `${skipped}\n\n🏁 *Treino concluído!* O histórico já foi atualizado.` : skipped
}

export function editReviewMessage(review: WorkoutReview) {
  const target = review.status === 'em_andamento' ? 'SESSÃO ATUAL' : 'ÚLTIMA SESSÃO'
  return `✏️ *EDITAR ${target} · ${review.templateName.toUpperCase()}*\n` +
    `📅 ${formatSessionDate(review.startedAt)}\n\n${reviewLines(review)}\n\n` +
    '_O comando altera exatamente esta sessão._\n' +
    '_Formato: /edit exercício carga séries×repetições RIR_\n' +
    'Ex.: `/edit 1 70kg 3x15 3r`'
}

export function lastWorkoutMessage(review: WorkoutReview) {
  const target = review.status === 'em_andamento' ? 'SESSÃO ATUAL' : 'ÚLTIMO TREINO'
  return `📋 *${target} · ${review.templateName.toUpperCase()}*\n` +
    `📅 ${formatSessionDate(review.startedAt)}\n\n${reviewLines(review)}\n\n` +
    '_Para corrigir um exercício: /edit número carga séries×repetições RIR_\n' +
    'Ex.: `/edit 1 70kg 3x15 3r`'
}

export function openSessionMessage(review: WorkoutReview) {
  const pending = review.items
    .map((item, index) => ({ item, index: index + 1 }))
    .filter(({ item }) => item.sets === 0 && !item.skipped)
    .map(({ item, index }) => `${index}. ${item.name}`)
  const remaining = pending.length ? pending.join('\n') : 'Nenhum exercício pendente.'
  return `⚠️ Há um treino em andamento: *${review.templateName}*.\n` +
    `📅 ${formatSessionDate(review.startedAt)}\n\n${reviewLines(review)}\n\n` +
    `*Falta finalizar:*\n${remaining}\n\nFinalize os exercícios ou envie */end* para encerrar como incompleto.`
}

export function helpMessage(review: WorkoutReview | null) {
  if (!review) {
    return `🤖 *COMANDOS DISPONÍVEIS*\n\n` +
      '*/start* — iniciar ou mostrar o treino de hoje\n' +
      '*/start --link* — iniciar e incluir links de execução\n' +
      '*/edit* — revisar o último treino encerrado\n' +
      '*/edit 1 70kg 3x15 3r* — corrigir a sessão mais recente\n' +
      '*/last* ou */ultimo* — mostrar a sessão mais recente\n' +
      '*/today* — prévia do treino esperado sem iniciar sessão\n' +
      '*/today --link* — prévia com links de execução\n' +
      '*/history* — mostrar os treinos desta semana\n' +
      '*/clear* — apagar as mensagens conhecidas deste grupo\n' +
      '*/help* — mostrar esta ajuda'
  }

  const resolved = review.items.filter((item) => item.sets > 0 || item.skipped).length
  const pending = review.items
    .map((item, index) => ({ item, number: index + 1 }))
    .filter(({ item }) => item.sets === 0 && !item.skipped)
  const next = pending[0]
  const stage = next
    ? `Próximo: *${next.number}. ${next.item.name}*`
    : 'Todos os exercícios foram resolvidos; envie */end* se a sessão ainda estiver aberta.'

  return `🏋️ *TREINO EM ANDAMENTO · ${review.templateName.toUpperCase()}*\n` +
    `${resolved}/${review.items.length} exercícios resolvidos\n${stage}\n\n${reviewLines(review)}\n\n` +
    '*COMANDOS NESTA ETAPA*\n' +
    '`1 100kg 3x15 1rir` — registrar séries×repetições\n' +
    '`/skip 1` ou `/pular 1` — pular um exercício\n' +
    '*/start* — mostrar novamente o treino atual\n' +
    '*/start --link* — mostrar o treino com links de execução\n' +
    '*/edit* — revisar ou corrigir esta sessão\n' +
    '*/last* ou */ultimo* — mostrar esta sessão\n' +
    '*/today* — mostrar o treino esperado sem criar outra sessão\n' +
    '*/today --link* — mostrar a prévia com links de execução\n' +
    '*/end* — encerrar agora como incompleto\n' +
    '*/history* — mostrar os treinos desta semana\n' +
    '*/clear* — apagar as mensagens conhecidas deste grupo\n' +
    '*/help* — atualizar este status'
}

export function weeklyHistoryMessage(sessions: WeeklySession[]) {
  if (sessions.length === 0) return '📅 Nenhum treino registrado nesta semana.'
  const completed = sessions.filter((session) => session.status === 'concluida').length
  const totalVolume = sessions.reduce((sum, session) => sum + session.volumeKg, 0)
  const lines = sessions.map((session) => {
    const status = session.status === 'concluida' ? '✅ concluído'
      : session.status === 'incompleta' ? '⚠️ incompleto' : '▶️ em andamento'
    const duration = session.endedAt
      ? ` · ${Math.max(0, Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000))} min`
      : ''
    return `*${formatSessionDate(session.startedAt)} · ${session.templateName}*\n` +
      `${status} · ${session.exercises} exercícios · ${session.sets} séries · ${formatKg(session.volumeKg)}${duration}`
  }).join('\n\n')
  return `📊 *HISTÓRICO DA SEMANA*\n${completed}/${sessions.length} concluídos · ${formatKg(totalVolume)}\n\n${lines}`
}

export function editedMessage(index: number, name: string, entry: ExerciseEntry, loadPerSide: boolean) {
  const side = loadPerSide ? '/lado' : ''
  return `✅ *${index}. ${name}* atualizado\n${Number(entry.weightKg.toFixed(1))} kg${side} · ${entry.sets}×${entry.reps} · RIR ${entry.rir}`
}

function reviewLines(review: WorkoutReview) {
  return review.items.map((item, index) => {
    if (item.skipped) return `${index + 1}. ⏭️ *${item.name}* · pulado`
    if (item.sets === 0) return `${index + 1}. ⏳ *${item.name}* · pendente`
    const load = item.weightKg === null ? 'sem carga' : `${Number(item.weightKg.toFixed(1))} kg`
    return `${index + 1}. ✅ *${item.name}* — ${item.sets} séries · ${item.reps} reps · ${load} · RIR ${item.rir ?? '—'}`
  }).join('\n')
}

function formatSessionDate(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(value)
}

function formatKg(value: number) {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)} kg de volume`
}

export const parserHelp = (reason: string) => {
  const labels: Record<string, string> = {
    exercise: 'Não encontrei o número do exercício.',
    weight: 'Não encontrei a carga e a unidade.',
    sets_reps: 'Não encontrei séries × repetições.',
    rir: 'Não encontrei o RIR.',
    weight_range: 'Essa carga passou de 999 kg — faltou vírgula ou sobrou um zero?',
    sets_range: 'Séries fora da faixa: registro de 1 a 20 por vez.',
  }
  return `⚠️ ${labels[reason] ?? 'Não entendi o registro'}\nUse algo como: \`1 100kg 3x15 1rir\``
}
