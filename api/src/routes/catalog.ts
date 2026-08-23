import { Router } from 'express'
import { asc, eq, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  catalogExercises, catalogGroups, catalogPainSwaps, catalogStations, painRegions,
} from '../db/schema.js'
import { requireAuth } from '../middleware/auth.js'
import { notFound } from '../lib/http-error.js'
import { intParam } from '../lib/params.js'

export const catalogRouter = Router()
catalogRouter.use(requireAuth)

const listQuery = z.object({
  q: z.string().trim().min(1).optional(),
  group: z.coerce.number().int().optional(),
  station: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(300).default(60),
  offset: z.coerce.number().int().min(0).default(0),
})

catalogRouter.get('/exercises', async (req, res) => {
  const { q, group, station, limit, offset } = listQuery.parse(req.query)
  const filters = []
  if (q) filters.push(or(ilike(catalogExercises.name, `%${q}%`), eq(catalogExercises.slug, q)))
  if (group) filters.push(eq(catalogExercises.groupId, group))
  if (station) filters.push(eq(catalogExercises.stationCode, station))

  const rows = await db
    .select()
    .from(catalogExercises)
    .where(filters.length ? sql.join(filters, sql` and `) : undefined)
    .orderBy(asc(catalogExercises.name))
    .limit(limit)
    .offset(offset)

  res.json({ exercises: rows, limit, offset })
})

catalogRouter.get('/exercises/:id', async (req, res) => {
  const id = intParam(req, 'id')
  const [exercise] = await db.select().from(catalogExercises).where(eq(catalogExercises.id, id))
  if (!exercise) throw notFound('exercicio_nao_encontrado')

  const swaps = await db.select().from(catalogPainSwaps).where(eq(catalogPainSwaps.exerciseId, id))
  res.json({ ...exercise, painSwaps: swaps })
})

/** As 40 estações. É por aqui que o onboarding pergunta o que a academia tem. */
catalogRouter.get('/stations', async (_req, res) => {
  res.json({ stations: await db.select().from(catalogStations).orderBy(asc(catalogStations.name)) })
})

catalogRouter.get('/groups', async (_req, res) => {
  res.json({ groups: await db.select().from(catalogGroups).orderBy(asc(catalogGroups.name)) })
})

catalogRouter.get('/pain-regions', async (_req, res) => {
  res.json({ regions: await db.select().from(painRegions).orderBy(asc(painRegions.slug)) })
})
