import { Router } from 'express'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { requireAuth } from '../middleware/auth.js'
import { env } from '../lib/env.js'

export const pushRouter = Router()
pushRouter.use(requireAuth)

/** Chave pública VAPID. Vazia significa push desligado, e o cliente entende. */
pushRouter.get('/key', (_req, res) => {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY })
})

const subscription = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

pushRouter.post('/subscribe', async (req, res) => {
  const parsed = subscription.parse(req.body)

  // O endpoint é único por dispositivo; reinscrever só atualiza as chaves.
  await db
    .insert(pushSubscriptions)
    .values({
      userId: req.userId!,
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: req.userId!, p256dh: parsed.keys.p256dh, auth: parsed.keys.auth },
    })

  res.status(201).json({ ok: true })
})

pushRouter.delete('/subscribe', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body)
  await db
    .delete(pushSubscriptions)
    .where(and(
      eq(pushSubscriptions.endpoint, endpoint),
      eq(pushSubscriptions.userId, req.userId!),
    ))
  res.status(204).end()
})
