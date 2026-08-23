import { Router } from 'express'
import { z } from 'zod'
import { env } from '../lib/env.js'
import { HttpError } from '../lib/http-error.js'
import { requireAuth } from '../middleware/auth.js'

export const whatsappRouter = Router()
whatsappRouter.use(requireAuth)

whatsappRouter.get('/status', async (req, res) => res.json(await bot(req.userId!, 'status')))
whatsappRouter.post('/connect', async (req, res) => res.status(202).json(await bot(req.userId!, 'connect', 'POST')))
whatsappRouter.get('/groups', async (req, res) => res.json(await bot(req.userId!, 'groups')))

whatsappRouter.post('/group', async (req, res) => {
  const body = z.object({ jid: z.string().endsWith('@g.us'), name: z.string().min(1).max(200) }).parse(req.body)
  await bot(req.userId!, 'group', 'POST', body)
  res.status(204).end()
})

whatsappRouter.post('/disconnect', async (req, res) => {
  await bot(req.userId!, 'disconnect', 'POST')
  res.status(204).end()
})

async function bot(ownerId: string, action: string, method = 'GET', body?: unknown) {
  let response: Response
  try {
    response = await fetch(`${env.WHATSAPP_BOT_URL}/owners/${ownerId}/${action}`, {
      method,
      headers: {
        authorization: `Bearer ${env.WHATSAPP_INTERNAL_TOKEN}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new HttpError(503, 'whatsapp_indisponivel')
  }
  if (!response.ok) throw new HttpError(response.status, 'whatsapp_erro')
  return response.status === 204 ? undefined : response.json()
}
