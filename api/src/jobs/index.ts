import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { programs, setLogs, users, workoutSessions } from '../db/schema.js'
import { AUTO_CLOSE_AFTER_MS } from '../lib/session-rules.js'
import { notifyUser, pushEnabled } from '../lib/notifier.js'
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

  const run = async () => {
    try {
      await closeStaleSessions()
    } catch (error) {
      logger.error(error, 'falha ao fechar sessões antigas')
    }
  }

  void run()
  const handle = setInterval(() => void run(), HOUR)
  // unref: um job pendente não pode segurar o processo no shutdown.
  handle.unref?.()
  return () => clearInterval(handle)
}
