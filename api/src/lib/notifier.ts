import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { env } from './env.js'
import { logger } from './logger.js'

export const pushEnabled = env.VAPID_PUBLIC_KEY !== '' && env.VAPID_PRIVATE_KEY !== ''

if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
}

export interface Notification {
  title: string
  body: string
  url?: string
}

/**
 * Envia para todos os dispositivos do usuário. Inscrição morta (404/410) é
 * apagada na hora — senão a tabela vira um cemitério que só cresce e cada
 * lembrete gasta tempo tentando entregar para navegador que não existe mais.
 */
export async function notifyUser(userId: string, notification: Notification) {
  if (!pushEnabled) return 0

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  let delivered = 0

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(notification),
      )
      delivered += 1
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
        logger.info({ endpoint: subscription.endpoint }, 'inscrição de push removida')
      } else {
        logger.warn({ err: error, userId }, 'falha ao enviar push')
      }
    }
  }

  return delivered
}
