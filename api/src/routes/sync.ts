import { Router } from 'express'
import { z } from 'zod'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { syncConflicts, syncDevices, syncOperations } from '../db/schema.js'
import { SYNC_ENTITIES, SYNC_TABLES, isSyncEntity, type SyncEntity } from '../db/sync-tables.js'
import { requireAuth } from '../middleware/auth.js'
import { threeWayMerge, resolveDeleteVsEdit, type Row } from '../lib/merge.js'
import { badRequest, notFound } from '../lib/http-error.js'
import { coerceBase, coerceRow, serializeRow } from '../lib/coerce.js'
import { uuidParam } from '../lib/params.js'

export const syncRouter = Router()
syncRouter.use(requireAuth)

/** Teto por página do pull. Mantém a resposta pequena numa VPS de 1 GB. */
const PULL_LIMIT = 500

const operation = z.object({
  opId: z.string().uuid(),
  entity: z.string().refine(isSyncEntity, 'entidade_desconhecida'),
  entityId: z.string().uuid(),
  op: z.enum(['upsert', 'delete']),
  /** A versão que o cliente tinha ao editar. Ausente = criação offline. */
  base: z.record(z.unknown()).nullable().default(null),
  data: z.record(z.unknown()),
})

const pushBody = z.object({
  deviceId: z.string().uuid(),
  /**
   * Um cursor por entidade, não um só para todas.
   *
   * Com cursor global, uma entidade truncada em PULL_LIMIT ficava para trás
   * enquanto outra, com `rev` mais alto, empurrava o cursor por cima dela — e
   * as linhas que não couberam na página nunca mais apareciam, porque o pull
   * seguinte já pedia acima delas. Chaves desconhecidas são ignoradas na
   * leitura; a resposta devolve só as entidades que existem.
   */
  cursors: z.record(z.coerce.number().int().min(0)).default({}),
  operations: z.array(operation).max(1000),
})

type Operation = z.infer<typeof operation>

/** `db` ou a transação — as duas expõem a mesma API de query no Drizzle. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

async function loadRow(
  tx: Executor, entity: SyncEntity, ownerId: string, id: string,
): Promise<Row | null> {
  const { table } = SYNC_TABLES[entity]
  const [row] = await tx
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.ownerId, ownerId)))
    .limit(1)
  return (row as Row | undefined) ?? null
}

async function applyOperation(tx: Executor, op: Operation, ownerId: string) {
  const entity = op.entity as SyncEntity
  const { table, mergeStrategy } = SYNC_TABLES[entity]
  const incoming: Row = { ...coerceRow(entity, op.data), id: op.entityId, ownerId }
  const base = coerceBase(entity, op.base)
  const current = await loadRow(tx, entity, ownerId, op.entityId)

  if (!current) {
    await tx.insert(table).values(incoming as never).onConflictDoNothing()
    return { entityId: op.entityId, status: 'created' as const }
  }

  if (op.op === 'delete') {
    const verdict = resolveDeleteVsEdit(Boolean(current.deletedAt), true, 0)
    if (verdict === 'delete') {
      await tx.update(table).set({ deletedAt: new Date() } as never).where(eq(table.id, op.entityId))
    }
    return { entityId: op.entityId, status: 'deleted' as const }
  }

  // Edit ressuscita: o cliente editou algo que outro dispositivo tinha apagado.
  const resurrect = current.deletedAt !== null && current.deletedAt !== undefined

  if (mergeStrategy === 'append-only') {
    // A linha não muda depois de criada; existir já significa que está em dia.
    return { entityId: op.entityId, status: 'noop' as const }
  }

  if (mergeStrategy === 'lww') {
    await tx
      .update(table)
      .set({ ...incoming, deletedAt: null } as never)
      .where(eq(table.id, op.entityId))
    return { entityId: op.entityId, status: 'applied' as const }
  }

  const outcome = threeWayMerge(base, current, incoming)

  if (outcome.kind === 'noop') {
    if (!resurrect) return { entityId: op.entityId, status: 'noop' as const }
    await tx.update(table).set({ deletedAt: null } as never).where(eq(table.id, op.entityId))
    return { entityId: op.entityId, status: 'resurrected' as const }
  }

  if (outcome.kind === 'conflict') {
    // Aplica o que não conflitou para o usuário não perder o resto do trabalho.
    if (Object.keys(outcome.row).length > 0 || resurrect) {
      await tx
        .update(table)
        .set({ ...outcome.row, ...(resurrect ? { deletedAt: null } : {}) } as never)
        .where(eq(table.id, op.entityId))
    }
    await tx.insert(syncConflicts).values({
      ownerId,
      entity: op.entity,
      entityId: op.entityId,
      baseRow: op.base,
      localRow: incoming,
      remoteRow: current,
      conflictingFields: outcome.conflictingFields,
    })
    return {
      entityId: op.entityId,
      status: 'conflict' as const,
      conflictingFields: outcome.conflictingFields,
    }
  }

  await tx
    .update(table)
    .set({ ...outcome.row, ...(resurrect ? { deletedAt: null } : {}) } as never)
    .where(eq(table.id, op.entityId))

  return { entityId: op.entityId, status: 'applied' as const }
}

/**
 * Push do outbox + pull incremental na mesma viagem: a rede da academia é ruim
 * e cada round-trip a menos conta.
 */
syncRouter.post('/', async (req, res) => {
  const { deviceId, cursors, operations } = pushBody.parse(req.body)
  const ownerId = req.userId!

  await db
    .insert(syncDevices)
    .values({ id: deviceId, ownerId })
    .onConflictDoUpdate({ target: syncDevices.id, set: { lastSeenAt: new Date() } })

  const results: unknown[] = []

  for (const op of operations) {
    /**
     * Idempotência atômica.
     *
     * Consultar `sync_operations` antes de aplicar seria check-then-act: duas
     * chamadas concorrentes com o mesmo opId — o loop periódico e o disparo do
     * evento `online`, por exemplo — passariam as duas pela checagem e a
     * segunda estouraria na chave primária. Aqui a reserva É o INSERT, e a
     * transação garante que uma falha ao aplicar devolva o opId para a fila
     * em vez de deixá-lo marcado como feito sem ter sido.
     */
    const outcome = await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(syncOperations)
        .values({
          id: op.opId,
          ownerId,
          deviceId,
          entity: op.entity,
          entityId: op.entityId,
          op: op.op,
        })
        .onConflictDoNothing({ target: syncOperations.id })
        .returning({ id: syncOperations.id })

      if (claimed.length === 0) {
        return { entityId: op.entityId, status: 'duplicate' as const }
      }
      return applyOperation(tx, op, ownerId)
    })

    results.push({ opId: op.opId, ...outcome })
  }

  const changes: Record<string, unknown[]> = {}
  const nextCursors: Record<string, number> = {}
  for (const entity of SYNC_ENTITIES) nextCursors[entity] = cursors[entity] ?? 0
  let hasMore = false

  for (const entity of SYNC_ENTITIES) {
    const { table } = SYNC_TABLES[entity]
    const from = nextCursors[entity]!
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(table.ownerId, ownerId), gt(table.rev, from)))
      .orderBy(asc(table.rev))
      .limit(PULL_LIMIT)

    if (rows.length === 0) continue
    changes[entity] = rows.map((row) => serializeRow(entity, row as Record<string, unknown>))
    // Avança só sobre o que ESTA entidade entregou: as linhas vêm ordenadas
    // por rev, então a última é exatamente até onde o cliente está em dia.
    nextCursors[entity] = (rows.at(-1) as { rev: number }).rev
    if (rows.length === PULL_LIMIT) hasMore = true
  }

  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncConflicts)
    .where(and(eq(syncConflicts.ownerId, ownerId), eq(syncConflicts.status, 'pendente')))

  // Só observabilidade: nada lê esta coluna para decidir o que enviar.
  const maxRev = Math.max(0, ...Object.values(nextCursors))
  await db.update(syncDevices).set({ lastRev: maxRev }).where(eq(syncDevices.id, deviceId))

  res.json({
    results,
    changes,
    cursors: nextCursors,
    // Alimenta o topbar de conflito: some quando zera.
    pendingConflicts: pending?.count ?? 0,
    // O pull é paginado; o cliente repete enquanto isto for true.
    hasMore,
  })
})

syncRouter.get('/conflicts', async (req, res) => {
  const rows = await db
    .select()
    .from(syncConflicts)
    .where(and(eq(syncConflicts.ownerId, req.userId!), eq(syncConflicts.status, 'pendente')))
    .orderBy(asc(syncConflicts.createdAt))
  res.json({ conflicts: rows })
})

const resolveBody = z.object({
  /** 'local' e 'remote' escolhem um lado inteiro; 'fields' decide campo a campo. */
  resolution: z.enum(['local', 'remote', 'fields']),
  fields: z.record(z.enum(['local', 'remote'])).default({}),
})

syncRouter.post('/conflicts/:id/resolve', async (req, res) => {
  const { resolution, fields } = resolveBody.parse(req.body)
  const [conflict] = await db
    .select()
    .from(syncConflicts)
    .where(and(eq(syncConflicts.id, uuidParam(req, 'id')), eq(syncConflicts.ownerId, req.userId!)))
    .limit(1)

  if (!conflict) throw notFound('conflito_nao_encontrado')
  if (conflict.status !== 'pendente') throw badRequest('conflito_ja_resolvido')
  if (!isSyncEntity(conflict.entity)) throw badRequest('entidade_desconhecida')

  const local = conflict.localRow as Row
  const remote = conflict.remoteRow as Row
  const patch: Row = {}

  for (const field of conflict.conflictingFields) {
    const side = resolution === 'fields' ? fields[field] : resolution
    if (!side) throw badRequest('campo_sem_escolha', { field })
    patch[field] = side === 'local' ? local[field] : remote[field]
  }

  const { table } = SYNC_TABLES[conflict.entity]
  await db
    .update(table)
    .set(coerceRow(conflict.entity, patch) as never)
    .where(eq(table.id, conflict.entityId))
  await db
    .update(syncConflicts)
    .set({ status: 'resolvido', resolution, resolvedAt: new Date() })
    .where(eq(syncConflicts.id, conflict.id))

  res.json({ ok: true })
})
