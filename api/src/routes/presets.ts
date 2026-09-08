import { and, asc, eq, inArray } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../db/index.js'
import {
  catalogExercises, catalogRelated, presetItems, presetWorkouts, trainingPresets,
} from '../db/schema.js'
import { notFound } from '../lib/http-error.js'
import { matchPresetExercise } from '../lib/preset-matching.js'
import { param } from '../lib/params.js'
import { requireAuth } from '../middleware/auth.js'
import { z } from 'zod'
import { materializePreset } from '../lib/materialize-preset.js'

export const presetsRouter = Router()
presetsRouter.use(requireAuth)

presetsRouter.get('/', async (_req, res) => {
  const presets = await db.select().from(trainingPresets)
    .where(eq(trainingPresets.isPublished, true))
    .orderBy(trainingPresets.split, trainingPresets.focus, trainingPresets.durationMinutes)
  res.json({ presets })
})

presetsRouter.get('/:slug', async (req, res) => {
  const [preset] = await db.select().from(trainingPresets).where(and(
    eq(trainingPresets.slug, param(req, 'slug')),
    eq(trainingPresets.isPublished, true),
  )).limit(1)
  if (!preset) throw notFound('preset_not_found')

  const workouts = await db.select().from(presetWorkouts)
    .where(eq(presetWorkouts.presetId, preset.id)).orderBy(asc(presetWorkouts.position))
  const items = workouts.length === 0 ? [] : await db.select().from(presetItems)
    .where(inArray(presetItems.workoutId, workouts.map((workout) => workout.id)))
    .orderBy(asc(presetItems.position))
  const exerciseIds = items.map((item) => item.catalogExerciseId)
  const relationships = exerciseIds.length === 0 ? [] : await db.select().from(catalogRelated)
    .where(inArray(catalogRelated.exerciseId, exerciseIds))
  const relatedIds = relationships.map((relationship) => relationship.relatedId)
  const allIds = [...new Set([...exerciseIds, ...relatedIds])]
  const exercises = allIds.length === 0 ? [] : await db.select().from(catalogExercises)
    .where(inArray(catalogExercises.id, allIds))
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const stations = new Set(String(req.query.stations ?? '').split(',').filter(Boolean))

  res.json({
    preset,
    workouts: workouts.map((workout) => ({
      ...workout,
      items: items.filter((item) => item.workoutId === workout.id).map((item) => {
        const exercise = byId.get(item.catalogExerciseId)!
        const related = relationships.filter((entry) => entry.exerciseId === exercise.id)
          .map((entry) => byId.get(entry.relatedId)!)
          .filter(Boolean)
        const match = matchPresetExercise(exercise, related, stations)
        return {
          ...item,
          exercise,
          match,
          alternatives: match.alternatives.map((id) => byId.get(id)).filter(Boolean),
        }
      }),
    })),
  })
})

const materializeBody = z.object({
  programName: z.string().trim().min(1).max(120),
  gymName: z.string().trim().min(1).max(120),
  stationCodes: z.array(z.string().min(1).max(20)).max(200),
  cardioNames: z.array(z.string().trim().min(1).max(80)).max(30),
  choices: z.record(z.string().uuid(), z.number().int().positive()).default({}),
  scheduleMode: z.enum(['continuous', 'weekly']),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  blockDurationWeeks: z.number().int().min(1).max(12),
  periodDurationMonths: z.number().int().min(1).max(12),
  defaultRestSeconds: z.number().int().min(15).max(600),
  reminderLeadMinutes: z.number().int().min(5).max(1440),
  remindersEnabled: z.boolean(),
})

presetsRouter.post('/:slug/materialize', async (req, res) => {
  const input = materializeBody.parse(req.body)
  const result = await materializePreset({
    ...input,
    slug: param(req, 'slug'),
    ownerId: req.userId!,
  })
  res.status(201).json(result)
})
