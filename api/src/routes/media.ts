import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { exerciseMedia, exercises } from '../db/schema.js'
import { requireAuth } from '../middleware/auth.js'
import { MAX_UPLOAD_BYTES, processUpload } from '../lib/image.js'
import { deleteObject, getObjectStream, putObject } from '../lib/storage.js'
import { badRequest, notFound } from '../lib/http-error.js'
import { serializeRow } from '../lib/coerce.js'
import { uuidParam } from '../lib/params.js'
import { rateLimit } from '../middleware/rate-limit.js'

export const mediaRouter = Router()
mediaRouter.use(requireAuth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
})

/**
 * Só o upload tem teto. O GET é o stream da biblioteca — uma tela com dezenas
 * de fotos faria dezenas de pedidos legítimos de uma vez.
 */
const uploadLimit = rateLimit({ windowMs: 60_000, max: 20, code: 'muitos_uploads' })

mediaRouter.post('/exercises/:exerciseId', uploadLimit, upload.single('file'), async (req, res) => {
  const ownerId = req.userId!
  const exerciseId = uuidParam(req, 'exerciseId')
  if (!req.file) throw badRequest('arquivo_ausente')

  const [exercise] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.ownerId, ownerId)))
    .limit(1)

  if (!exercise) throw notFound('exercicio_nao_encontrado')

  const { full, thumb, width, height } = await processUpload(req.file.buffer)
  const mediaId = randomUUID()
  const prefix = `users/${ownerId}/exercises/${exerciseId}/${mediaId}`
  const s3Key = `${prefix}.webp`
  const thumbKey = `${prefix}.thumb.webp`

  await Promise.all([
    putObject(s3Key, full, 'image/webp'),
    putObject(thumbKey, thumb, 'image/webp'),
  ])

  let row: typeof exerciseMedia.$inferSelect
  let replaced: (typeof exerciseMedia.$inferSelect)[] = []
  try {
    ;({ row, replaced } = await db.transaction(async (tx) => {
      // A trava por exercício impede dois uploads simultâneos de atravessarem
      // o UPDATE juntos e disputarem o índice de imagem ativa.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${ownerId}:${exerciseId}`}))`)
      const oldRows = await tx
        .update(exerciseMedia)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(exerciseMedia.ownerId, ownerId),
          eq(exerciseMedia.exerciseId, exerciseId),
          isNull(exerciseMedia.deletedAt),
        ))
        .returning()
      const [inserted] = await tx
        .insert(exerciseMedia)
        .values({
          id: mediaId,
          ownerId,
          exerciseId,
          s3Key,
          thumbKey,
          mime: 'image/webp',
          bytes: full.byteLength,
          width,
          height,
        })
        .returning()
      return { row: inserted!, replaced: oldRows }
    }))
  } catch (error) {
    // O upload ao S3 acontece antes da transação; se o banco recusar, estes
    // objetos ainda não têm linha para o job de limpeza encontrar.
    await Promise.allSettled([deleteObject(s3Key), deleteObject(thumbKey)])
    throw error
  }

  // A linha apagada fica para o sync, mas os objetos privados já podem sair.
  // Falha aqui não invalida a troca: o job de purge tenta novamente depois.
  await Promise.allSettled(replaced.flatMap((item) => [
    deleteObject(item.s3Key), deleteObject(item.thumbKey),
  ]))

  // Mesma conversão do pull: esta resposta também vai direto para o
  // IndexedDB, e é o outro caminho por onde uma linha do banco chega ao
  // cliente. Hoje `exercise_media` não tem coluna numeric, mas passar por aqui
  // impede que uma coluna nova reabra o mesmo bug só neste caminho.
  res.status(201).json(serializeRow('exercise_media', row as Record<string, unknown>))
})

/**
 * O bucket é privado e sem rota pública: o browser nunca fala com o MinIO.
 * O custo disso é este stream passar pelo Node, então ETag e Cache-Control
 * fazem o trabalho pesado — a segunda visita à biblioteca não sai da rede.
 */
mediaRouter.get('/:mediaId', async (req, res) => {
  const variant = req.query.variant === 'thumb' ? 'thumb' : 'full'

  const [media] = await db
    .select()
    .from(exerciseMedia)
    .where(and(eq(exerciseMedia.id, uuidParam(req, 'mediaId')), eq(exerciseMedia.ownerId, req.userId!)))
    .limit(1)

  if (!media || media.deletedAt) throw notFound('midia_nao_encontrada')

  const key = variant === 'thumb' ? media.thumbKey : media.s3Key
  const range = req.headers.range
  const object = await getObjectStream(key, range)

  if (object.etag && req.headers['if-none-match'] === object.etag) {
    return res.status(304).end()
  }

  res.setHeader('Content-Type', object.contentType)
  // Imutável: o id da mídia nunca é reaproveitado, então o cache pode ser eterno.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  if (object.etag) res.setHeader('ETag', object.etag)
  if (object.contentLength) res.setHeader('Content-Length', String(object.contentLength))
  if (object.contentRange) {
    res.status(206).setHeader('Content-Range', object.contentRange)
  }
  res.setHeader('Accept-Ranges', 'bytes')

  object.body.pipe(res)
})

mediaRouter.delete('/:mediaId', async (req, res) => {
  const [media] = await db
    .select()
    .from(exerciseMedia)
    .where(and(eq(exerciseMedia.id, uuidParam(req, 'mediaId')), eq(exerciseMedia.ownerId, req.userId!)))
    .limit(1)

  if (!media) throw notFound('midia_nao_encontrada')

  await db
    .update(exerciseMedia)
    .set({ deletedAt: new Date() })
    .where(eq(exerciseMedia.id, media.id))

  await Promise.all([deleteObject(media.s3Key), deleteObject(media.thumbKey)])
  res.status(204).end()
})
