import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { exerciseMedia, programs, setLogs, users, workoutSessions } from '../db/schema.js'
import { AUTO_CLOSE_AFTER_MS, MEDIA_PURGE_AFTER_MS } from '../lib/session-rules.js'
import { notifyUser, pushEnabled } from '../lib/notifier.js'
import { deleteObject } from '../lib/storage.js'
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
 * Lembretes dos dias de treino.
 *
 * Só o modo semanal tem dia para mirar. No contínuo não existe treino agendado
 * — lembrar "hoje é dia" seria inventar um calendário que o app deliberadamente
 * não tem.
 */
export async function sendWorkoutReminders(now = new Date()): Promise<number> {
  if (!pushEnabled) return 0

  const rows = await db
    .select({
      userId: programs.ownerId,
      weekdays: programs.weekdays,
      lead: programs.reminderLeadMinutes,
      name: programs.name,
    })
    .from(programs)
    .innerJoin(users, eq(users.id, programs.ownerId))
    .where(and(
      eq(programs.isActive, true),
      eq(programs.scheduleMode, 'weekly'),
      isNull(programs.deletedAt),
    ))

  let sent = 0
  for (const row of rows) {
    if (!row.weekdays.includes(now.getDay())) continue
    sent += await notifyUser(row.userId, {
      title: row.name,
      body: `Treino em ${row.lead} min`,
      url: '/sessao',
    })
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

  void faxina()
  const handles = [setInterval(() => void faxina(), HOUR)]
  // unref: um job pendente não pode segurar o processo no shutdown.
  for (const handle of handles) handle.unref?.()
  return () => { for (const handle of handles) clearInterval(handle) }
}
