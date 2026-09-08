import { asc, eq, ilike, inArray } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  catalogExercises, presetItems, presetWorkouts, trainingPresets, userRoles, users,
} from '../db/schema.js'
import { ADMIN_ROLE, grantAdmin, revokeAdmin } from '../lib/admin-roles.js'
import { notFound } from '../lib/http-error.js'
import { uuidParam } from '../lib/params.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

export const adminRouter = Router()

adminRouter.use(requireAuth, requireRole(ADMIN_ROLE))

const listQuery = z.object({ q: z.string().trim().max(120).optional() })

adminRouter.get('/users', async (req, res) => {
  const { q } = listQuery.parse(req.query)
  const found = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    pictureUrl: users.pictureUrl,
    createdAt: users.createdAt,
  }).from(users)
    .where(q ? ilike(users.email, `%${q}%`) : undefined)
    .orderBy(users.email)
    .limit(100)

  const assignments = found.length === 0 ? [] : await db
    .select({ userId: userRoles.userId, roleCode: userRoles.roleCode })
    .from(userRoles)
    .where(inArray(userRoles.userId, found.map((user) => user.id)))
  const rolesByUser = new Map<string, string[]>()
  for (const assignment of assignments) {
    const roles = rolesByUser.get(assignment.userId) ?? []
    roles.push(assignment.roleCode)
    rolesByUser.set(assignment.userId, roles)
  }

  res.json({ users: found.map((user) => ({ ...user, roles: rolesByUser.get(user.id) ?? [] })) })
})

adminRouter.put('/users/:userId/roles/admin', async (req, res) => {
  const changed = await grantAdmin({
    targetUserId: uuidParam(req, 'userId'),
    actorUserId: req.userId!,
    source: 'admin_api',
  })
  res.status(changed ? 201 : 200).json({ role: ADMIN_ROLE, assigned: true })
})

adminRouter.delete('/users/:userId/roles/admin', async (req, res) => {
  await revokeAdmin({
    targetUserId: uuidParam(req, 'userId'),
    actorUserId: req.userId!,
    source: 'admin_api',
  })
  res.status(204).end()
})

const localizedText = z.object({ 'pt-BR': z.string().trim().min(1).max(120), 'en-US': z.string().trim().min(1).max(120) })
const presetBody = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  name: localizedText,
  split: z.enum(['ab', 'abc', 'abcd']),
  focus: z.enum(['strength', 'hypertrophy']),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  level: z.literal('beginner').default('beginner'),
  isPublished: z.boolean(),
  workouts: z.array(z.object({
    name: localizedText,
    focus: localizedText,
    items: z.array(z.object({
      catalogExerciseId: z.number().int().positive(),
      sets: z.number().int().min(1).max(10),
      repMin: z.number().int().min(1).max(100),
      repMax: z.number().int().min(1).max(100),
      rirTarget: z.number().int().min(0).max(4),
      restSeconds: z.number().int().min(15).max(600),
      trackingMode: z.enum(['compact', 'full']).default('compact'),
      loadPerSide: z.boolean().default(false),
    }).refine((item) => item.repMax >= item.repMin, 'invalid_rep_range')).min(1).max(20),
  })).min(1).max(7),
})

async function loadAdminPreset(id: string) {
  const [preset] = await db.select().from(trainingPresets).where(eq(trainingPresets.id, id)).limit(1)
  if (!preset) throw notFound('preset_not_found')
  const workouts = await db.select().from(presetWorkouts)
    .where(eq(presetWorkouts.presetId, id)).orderBy(asc(presetWorkouts.position))
  const items = workouts.length === 0 ? [] : await db.select().from(presetItems)
    .where(inArray(presetItems.workoutId, workouts.map((workout) => workout.id)))
    .orderBy(asc(presetItems.position))
  return { ...preset, workouts: workouts.map((workout) => ({
    ...workout,
    items: items.filter((item) => item.workoutId === workout.id),
  })) }
}

async function savePreset(id: string, input: z.infer<typeof presetBody>, create: boolean) {
  const exerciseIds = [...new Set(input.workouts.flatMap((workout) => workout.items.map((item) => item.catalogExerciseId)))]
  const found = await db.select({ id: catalogExercises.id }).from(catalogExercises)
    .where(inArray(catalogExercises.id, exerciseIds))
  if (found.length !== exerciseIds.length) throw notFound('catalog_exercise_not_found')

  await db.transaction(async (tx) => {
    const values = {
      slug: input.slug, name: input.name, split: input.split, focus: input.focus,
      durationMinutes: input.durationMinutes, level: input.level,
      isPublished: input.isPublished, updatedAt: new Date(),
    }
    if (create) await tx.insert(trainingPresets).values({ id, ...values })
    else {
      await tx.update(trainingPresets).set(values).where(eq(trainingPresets.id, id))
      await tx.delete(presetWorkouts).where(eq(presetWorkouts.presetId, id))
    }
    for (const [workoutIndex, workout] of input.workouts.entries()) {
      const [created] = await tx.insert(presetWorkouts).values({
        presetId: id, position: workoutIndex, name: workout.name, focus: workout.focus,
      }).returning({ id: presetWorkouts.id })
      await tx.insert(presetItems).values(workout.items.map((item, itemIndex) => ({
        ...item, workoutId: created!.id, position: itemIndex,
      })))
    }
  })
}

adminRouter.get('/presets', async (_req, res) => {
  const presets = await db.select().from(trainingPresets)
    .orderBy(trainingPresets.split, trainingPresets.focus, trainingPresets.durationMinutes)
  res.json({ presets })
})

adminRouter.get('/presets/:presetId', async (req, res) => {
  res.json(await loadAdminPreset(uuidParam(req, 'presetId')))
})

adminRouter.post('/presets', async (req, res) => {
  const input = presetBody.parse(req.body)
  const id = crypto.randomUUID()
  await savePreset(id, input, true)
  res.status(201).json(await loadAdminPreset(id))
})

adminRouter.put('/presets/:presetId', async (req, res) => {
  const id = uuidParam(req, 'presetId')
  const input = presetBody.parse(req.body)
  const [exists] = await db.select({ id: trainingPresets.id }).from(trainingPresets)
    .where(eq(trainingPresets.id, id)).limit(1)
  if (!exists) throw notFound('preset_not_found')
  await savePreset(id, input, false)
  res.json(await loadAdminPreset(id))
})

adminRouter.delete('/presets/:presetId', async (req, res) => {
  const deleted = await db.delete(trainingPresets).where(eq(trainingPresets.id, uuidParam(req, 'presetId')))
    .returning({ id: trainingPresets.id })
  if (deleted.length === 0) throw notFound('preset_not_found')
  res.status(204).end()
})
