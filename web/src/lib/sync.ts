import { useLiveQuery } from 'dexie-react-hooks'
import { v7 as uuidv7 } from 'uuid'
import { apiFetch } from './api.js'
import { getMeta, localDb, setMeta, type SyncEntity, type SyncRow } from './db.js'

const DEVICE_KEY = 'deviceId'
/** Um rev por entidade. Ver o comentário de `cursors` em api/src/routes/sync.ts. */
const CURSORS_KEY = 'cursors'
const BOOTSTRAP_KEY = 'bootstrappedAt'
const BATCH = 200

/**
 * Se a primeira sincronização já aconteceu neste dispositivo.
 *
 * Num aparelho novo o IndexedDB começa vazio, e "sem programa" é
 * indistinguível de "programa ainda não baixado". Sem esta marca o app mandaria
 * o usuário para o onboarding e ele criaria um segundo programa por cima do que
 * já tem.
 */
export function useBootstrapped(): boolean | undefined {
  return useLiveQuery(async () => Boolean(await getMeta<string | null>(BOOTSTRAP_KEY, null)), [])
}

export interface SyncResult {
  pushed: number
  pulled: number
  conflicts: number
}

async function deviceId(): Promise<string> {
  const existing = await getMeta<string | null>(DEVICE_KEY, null)
  if (existing) return existing
  const id = uuidv7()
  await setMeta(DEVICE_KEY, id)
  return id
}

type SyncResponse = {
  results: Array<{ opId: string; status: string }>
  changes: Partial<Record<SyncEntity, SyncRow[]>>
  cursors: Record<string, number>
  pendingConflicts: number
  hasMore: boolean
}

/**
 * Push do outbox e pull incremental na mesma chamada. Uma viagem por rodada
 * importa: a rede da academia é ruim e cada round-trip a mais é uma chance de
 * falhar no meio.
 */
let inFlight: Promise<SyncResult> | null = null

/**
 * Uma sincronização por vez no processo inteiro. Sem isso, o tick do intervalo,
 * o evento `online` e uma chamada manual disparam juntos e mandam o mesmo
 * outbox três vezes. O servidor é idempotente e aguenta, mas é tráfego jogado
 * fora numa rede que já é ruim.
 */
export function runSync(): Promise<SyncResult> {
  inFlight ??= execute().finally(() => { inFlight = null })
  return inFlight
}

async function execute(): Promise<SyncResult> {
  if (!navigator.onLine) return { pushed: 0, pulled: 0, conflicts: 0 }

  const device = await deviceId()
  let cursors = await getMeta<Record<string, number>>(CURSORS_KEY, {})
  let pushed = 0
  let pulled = 0
  let conflicts = 0
  let hasMore = true

  while (hasMore) {
    const batch = await localDb.outbox.orderBy('queuedAt').limit(BATCH).toArray()

    const response = await apiFetch<SyncResponse>('/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: device,
        cursors,
        operations: batch.map((entry) => ({
          opId: entry.opId,
          entity: entry.entity,
          entityId: entry.entityId,
          op: entry.op,
          base: entry.base,
          data: entry.data,
        })),
      }),
    })

    // Só limpa o que o servidor confirmou. Uma resposta parcial deixa o resto
    // na fila, e o opId garante que reenviar não duplica.
    const settled = response.results.map((r) => r.opId)
    if (settled.length) {
      await localDb.outbox.bulkDelete(settled)
      pushed += settled.length
    }

    for (const [entity, rows] of Object.entries(response.changes)) {
      if (!rows?.length) continue
      await localDb.table_(entity as SyncEntity).bulkPut(rows)
      pulled += rows.length
    }

    cursors = response.cursors
    conflicts = response.pendingConflicts
    await setMeta(CURSORS_KEY, cursors)

    hasMore = response.hasMore || (batch.length === BATCH && settled.length > 0)
  }

  await setMeta(BOOTSTRAP_KEY, new Date().toISOString())
  return { pushed, pulled, conflicts }
}

/** Sincroniza ao voltar a rede e a cada 60s enquanto online. */
export function startSyncLoop(onResult: (result: SyncResult) => void) {
  let running = false

  const tick = async () => {
    if (running || !navigator.onLine) return
    running = true
    try {
      onResult(await runSync())
    } catch {
      // Offline ou servidor fora: a fila fica intacta para a próxima rodada.
    } finally {
      running = false
    }
  }

  const interval = window.setInterval(tick, 60_000)
  window.addEventListener('online', tick)
  void tick()

  return () => {
    window.clearInterval(interval)
    window.removeEventListener('online', tick)
  }
}
