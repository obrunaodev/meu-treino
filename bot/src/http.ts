import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { chooseGroup, connectOwner, disconnectOwner, groupsFor, statusFor } from './manager.js'
import { env } from './env.js'

const ownerRoute = /^\/owners\/([0-9a-f-]{36})\/(status|connect|disconnect|groups|group)$/

/** API interna mínima; não é publicada pelo Compose e exige segredo próprio. */
export function createInternalServer() {
  return createServer(async (request, response) => {
    try {
      if (request.headers.authorization !== `Bearer ${env.internalToken}`) return json(response, 401, { code: 'unauthorized' })
      const match = request.url?.match(ownerRoute)
      if (!match) return json(response, 404, { code: 'not_found' })
      const [, ownerId, action] = match

      if (request.method === 'GET' && action === 'status') return json(response, 200, statusFor(ownerId!))
      if (request.method === 'POST' && action === 'connect') return json(response, 202, await connectOwner(ownerId!))
      if (request.method === 'POST' && action === 'disconnect') {
        await disconnectOwner(ownerId!)
        return json(response, 204)
      }
      if (request.method === 'GET' && action === 'groups') return json(response, 200, { groups: await groupsFor(ownerId!) })
      if (request.method === 'POST' && action === 'group') {
        const body = await readJson(request)
        if (typeof body.jid !== 'string' || !body.jid.endsWith('@g.us') || typeof body.name !== 'string') {
          return json(response, 400, { code: 'invalid_group' })
        }
        await chooseGroup(ownerId!, body.jid, body.name)
        return json(response, 204)
      }
      return json(response, 405, { code: 'method_not_allowed' })
    } catch (error) {
      console.error(error)
      return json(response, 500, { code: 'internal_error' })
    }
  })
}

function json(response: ServerResponse, status: number, body?: unknown) {
  response.statusCode = status
  if (body === undefined) return response.end()
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 16_384) throw new Error('payload too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}
