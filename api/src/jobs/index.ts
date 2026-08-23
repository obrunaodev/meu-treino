import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { exerciseMedia, programs, setLogs, userSettings, workoutSessions } from '../db/schema.js'
import { AUTO_CLOSE_AFTER_MS, MEDIA_PURGE_AFTER_MS } from '../lib/session-rules.js'
import { notifyUser, pushEnabled } from '../lib/notifier.js'
import { deleteObject } from '../lib/storage.js'
import { env } from '../lib/env.js'
import { logger } from '../lib/logger.js'

/**
 * Fecha sessões abandonadas.
 *
 * A regra é 6h sem NENHUM registro, não 6h desde o início: uma sessão longa e
 * ativa não pode ser fechada debaixo do usuário. Por isso a inatividade é
 * medida pela última série, com o início como piso quando não há nenhuma.
 */
export async function closeStaleSessions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTO_CLOSE_AFTER_MS)
  const lastActivity = sql<string>`greatest(
    ${workoutSessions.startedAt},
    coalesce(max(${setLogs.completedAt}), ${workoutSessions.startedAt})
  )`

  const stale = await db
    .select({ id: workoutSessions.id, lastActivity })
    .from(workoutSessions)
    .leftJoin(setLogs, eq(setLogs.sessionId, workoutSessions.id))
    .where(and(eq(workoutSessions.status, 'em_andamento'), isNull(workoutSessions.deletedAt)))
    .groupBy(workoutSessions.id, workoutSessions.startedAt)
    .having(sql`${lastActivity} < ${cutoff}`)

  for (const session of stale) {
    await db
      .update(workoutSessions)
      .set({
        status: 'incompleta',
        endedAt: new Date(session.lastActivity),
        autoClosedAt: now,
      })
      .where(eq(workoutSessions.id, session.id))
  }

  if (stale.length > 0) logger.info({ quantidade: stale.length }, 'sessões fechadas por inatividade')
  return stale.length
}

/** Teto por rodada: o job roda de hora em hora e não precisa esvaziar de uma vez. */
const PURGE_BATCH = 200

/**
 * Tira do bucket a mídia que já foi apagada.
 *
 * O soft delete é obrigatório — é ele que ensina o cliente offline que a linha
 * sumiu —, então a LINHA fica. Os dois WebP não precisam ficar com ela: sem
 * esta limpeza o bucket só cresce, e numa VPS de 1 GB o disco acaba antes da
 * memória. `purgedAt` marca o que já foi, para não tentar de novo a cada hora.
 */
export async function purgeDeletedMedia(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MEDIA_PURGE_AFTER_MS)

  const rows = await db
    .select({ id: exerciseMedia.id, s3Key: exerciseMedia.s3Key, thumbKey: exerciseMedia.thumbKey })
    .from(exerciseMedia)
    .where(and(
      isNotNull(exerciseMedia.deletedAt),
      lt(exerciseMedia.deletedAt, cutoff),
      isNull(exerciseMedia.purgedAt),
    ))
    .limit(PURGE_BATCH)

  let purged = 0

  for (const media of rows) {
    try {
      await Promise.all([deleteObject(media.s3Key), deleteObject(media.thumbKey)])
    } catch (error) {
      // Falha de rede no S3 não pode marcar como purgado: a linha volta na
      // próxima rodada e o objeto não fica órfão sem ninguém para cobrá-lo.
      logger.warn({ err: error, mediaId: media.id }, 'falha ao apagar mídia do bucket')
      continue
    }
    await db.update(exerciseMedia).set({ purgedAt: now }).where(eq(exerciseMedia.id, media.id))
    purged += 1
  }

  if (purged > 0) logger.info({ quantidade: purged }, 'mídia apagada do bucket')
  return purged
}

/**
 * Janela depois do horário-alvo em que o lembrete ainda vale a pena.
 *
 * Sem ela, um restart em cima do minuto certo perderia o dia inteiro. Com ela,
 * o próximo tick ainda alcança — e `lastReminderAt` garante que só sai uma vez.
 */
const REMINDER_GRACE_MINUTES = 30

interface LocalMoment {
  /** 0 = domingo, como em `Date.getDay()` e em `programs.weekdays`. */
  weekday: number
  /** Minutos desde a meia-noite local. */
  minutes: number
  /** 'YYYY-MM-DD' local, a chave de "já mandei hoje". */
  date: string
}

/**
 * O instante visto do fuso do usuário.
 *
 * O container roda em UTC: `now.getDay()` vira o dia errado por três horas
 * todo fim de tarde no Brasil, e a hora local não bate nunca.
 */
function inZone(now: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>

  const date = `${at.year}-${at.month}-${at.day}`
  return {
    // Meia-noite daquela data em UTC devolve o dia da semana local sem que o
    // fuso do processo interfira.
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    minutes: Number(at.hour) * 60 + Number(at.minute),
    date,
  }
}

/** 'HH:MM' em minutos desde a meia-noite; null se o formato não bater. */
function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Lembretes dos dias de treino.
 *
 * Só o modo semanal tem dia para mirar. No contínuo não existe treino agendado
 * — lembrar "hoje é dia" seria inventar um calendário que o app deliberadamente
 * não tem.
 *
 * Manda `reminderLeadMinutes` antes de `workoutTime`, e só para quem ligou o
 * lembrete em Configurações: enviar a quem desligou é o tipo de coisa que faz o
 * usuário revogar a permissão de push e nunca mais voltar.
 */
export async function sendWorkoutReminders(
  now = new Date(),
  timeZone = env.REMINDER_TIMEZONE,
): Promise<number> {
  if (!pushEnabled) return 0

  const rows = await db
    .select({
      programId: programs.id,
      userId: programs.ownerId,
      weekdays: programs.weekdays,
      lead: programs.reminderLeadMinutes,
      name: programs.name,
      workoutTime: programs.workoutTime,
      lastReminderAt: programs.lastReminderAt,
    })
    .from(programs)
    .innerJoin(userSettings, eq(userSettings.ownerId, programs.ownerId))
    .where(and(
      eq(programs.isActive, true),
      eq(programs.scheduleMode, 'weekly'),
      isNull(programs.deletedAt),
      eq(userSettings.remindersEnabled, true),
    ))

  const local = inZone(now, timeZone)
  let sent = 0

  for (const row of rows) {
    if (!row.weekdays.includes(local.weekday)) continue

    const workoutAt = parseHhMm(row.workoutTime)
    if (workoutAt === null) {
      logger.warn({ programId: row.programId, workoutTime: row.workoutTime }, 'horário de treino inválido')
      continue
    }

    // Antecedência que atravessaria a meia-noite vira "assim que o dia começa",
    // em vez de virar lembrete na véspera — treino de madrugada não existe aqui.
    const target = Math.max(0, workoutAt - row.lead)
    if (local.minutes < target || local.minutes >= target + REMINDER_GRACE_MINUTES) continue
    if (row.lastReminderAt && inZone(row.lastReminderAt, timeZone).date === local.date) continue

    sent += await notifyUser(row.userId, {
      title: row.name,
      body: `Treino em ${row.lead} min`,
      url: '/sessao',
    })
    // Marca mesmo sem entrega: sem inscrição de push, repetir a cada tick só
    // gastaria consulta o dia inteiro.
    await db
      .update(programs)
      .set({ lastReminderAt: now })
      .where(eq(programs.id, row.programId))
  }

  return sent
}

/**
 * Agendador em processo. Não vale um container de cron numa VPS de 1 GB para
 * alguns segundos de trabalho por hora.
 */
export function startJobs() {
  const HOUR = 60 * 60 * 1000
  // O lembrete mira um horário; um tick de hora em hora erraria por até 60 min.
  const REMINDER_TICK = 5 * 60 * 1000

  const faxina = async () => {
    try {
      await closeStaleSessions()
    } catch (error) {
      logger.error(error, 'falha ao fechar sessões antigas')
    }
    try {
      await purgeDeletedMedia()
    } catch (error) {
      logger.error(error, 'falha ao apagar mídia removida')
    }
  }

  const lembretes = async () => {
    try {
      await sendWorkoutReminders()
    } catch (error) {
      logger.error(error, 'falha ao enviar lembretes')
    }
  }

  void faxina()
  const handles = [
    setInterval(() => void faxina(), HOUR),
    setInterval(() => void lembretes(), REMINDER_TICK),
  ]
  // unref: um job pendente não pode segurar o processo no shutdown.
  for (const handle of handles) handle.unref?.()
  return () => { for (const handle of handles) clearInterval(handle) }
}
