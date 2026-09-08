import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  cardioOptions, catalogExercises, catalogRelated, catalogStations, equipment, exercises, gyms, presetItems,
  presetWorkouts, programs, templateItems, templates, trainingPresets, userSettings,
} from '../db/schema.js'
import { badRequest, notFound } from './http-error.js'
import { matchPresetExercise } from './preset-matching.js'

export interface MaterializePresetInput {
  ownerId: string
  slug: string
  programName: string
  gymName: string
  stationCodes: string[]
  cardioNames: string[]
  choices: Record<string, number>
  scheduleMode: 'continuous' | 'weekly'
  weekdays: number[]
  blockDurationWeeks: number
  periodDurationMonths: number
  defaultRestSeconds: number
  reminderLeadMinutes: number
  remindersEnabled: boolean
}

async function loadSource(slug: string) {
  const [preset] = await db.select().from(trainingPresets)
    .where(and(eq(trainingPresets.slug, slug), eq(trainingPresets.isPublished, true))).limit(1)
  if (!preset) throw notFound('preset_not_found')
  const workouts = await db.select().from(presetWorkouts)
    .where(eq(presetWorkouts.presetId, preset.id)).orderBy(presetWorkouts.position)
  const items = workouts.length === 0 ? [] : await db.select().from(presetItems)
    .where(inArray(presetItems.workoutId, workouts.map((workout) => workout.id)))
    .orderBy(presetItems.position)
  const requiredIds = items.map((item) => item.catalogExerciseId)
  const related = requiredIds.length === 0 ? [] : await db.select().from(catalogRelated)
    .where(inArray(catalogRelated.exerciseId, requiredIds))
  const ids = [...new Set([...requiredIds, ...related.map((row) => row.relatedId)])]
  const catalog = ids.length === 0 ? [] : await db.select().from(catalogExercises)
    .where(inArray(catalogExercises.id, ids))
  return { preset, workouts, items, related, catalog }
}

function resolveCatalogIds(source: Awaited<ReturnType<typeof loadSource>>, input: MaterializePresetInput) {
  const byId = new Map(source.catalog.map((exercise) => [exercise.id, exercise]))
  const stations = new Set(input.stationCodes)
  return new Map(source.items.map((item) => {
    const required = byId.get(item.catalogExerciseId)!
    const candidates = source.related.filter((row) => row.exerciseId === required.id)
      .map((row) => byId.get(row.relatedId)!).filter(Boolean)
    const match = matchPresetExercise(required, candidates, stations)
    const selected = input.choices[item.id] ?? match.selectedExerciseId
    if (!selected || (selected !== required.id && !match.alternatives.includes(selected))) {
      throw badRequest('preset_choice_required', { presetItemId: item.id })
    }
    const exercise = byId.get(selected)!
    if (exercise.stationCode && !stations.has(exercise.stationCode)) {
      throw badRequest('preset_equipment_unavailable', { presetItemId: item.id, stationCode: exercise.stationCode })
    }
    return [item.id, selected]
  }))
}

/** Atomically copies a global preset into user-owned synchronized records. */
export async function materializePreset(input: MaterializePresetInput) {
  const source = await loadSource(input.slug)
  const resolved = resolveCatalogIds(source, input)
  const selectedIds = [...new Set(resolved.values())]
  const selectedCatalog = source.catalog.filter((exercise) => selectedIds.includes(exercise.id))
  const stations = input.stationCodes.length === 0 ? [] : await db.select().from(catalogStations)
    .where(inArray(catalogStations.code, input.stationCodes))
  if (stations.length !== new Set(input.stationCodes).size) throw badRequest('unknown_equipment')
  const [settings] = await db.select({ locale: userSettings.locale }).from(userSettings)
    .where(eq(userSettings.ownerId, input.ownerId)).limit(1)
  const locale = settings?.locale === 'en-US' ? 'en-US' : 'pt-BR'

  return db.transaction(async (tx) => {
    const [gym] = await tx.insert(gyms).values({ id: randomUUID(), ownerId: input.ownerId, name: input.gymName })
      .returning({ id: gyms.id })
    const existingEquipment = await tx.select().from(equipment).where(and(
      eq(equipment.ownerId, input.ownerId), isNull(equipment.deletedAt),
    ))
    const equipmentByStation = new Map(existingEquipment
      .filter((item) => item.catalogStationCode).map((item) => [item.catalogStationCode!, item.id]))
    for (const station of stations) {
      if (equipmentByStation.has(station.code)) continue
      const [created] = await tx.insert(equipment).values({
        id: randomUUID(), ownerId: input.ownerId, gymId: gym!.id,
        catalogStationCode: station.code, name: station.name,
        loadType: station.loadType ?? 'pino', plateTable: [],
      }).returning({ id: equipment.id })
      equipmentByStation.set(station.code, created!.id)
    }
    if (input.cardioNames.length > 0) {
      await tx.insert(cardioOptions).values(input.cardioNames.map((name) => ({
        id: randomUUID(), ownerId: input.ownerId, gymId: gym!.id, name,
      })))
    }

    const existingExercises = await tx.select().from(exercises).where(and(
      eq(exercises.ownerId, input.ownerId), isNull(exercises.deletedAt),
    ))
    const exerciseByCatalog = new Map(existingExercises
      .filter((item) => item.catalogExerciseId).map((item) => [item.catalogExerciseId!, item.id]))
    const perSideByCatalog = new Map<number, boolean>()
    for (const item of source.items) {
      const catalogId = resolved.get(item.id)!
      perSideByCatalog.set(catalogId, (perSideByCatalog.get(catalogId) ?? false) || item.loadPerSide)
    }
    for (const catalog of selectedCatalog) {
      if (exerciseByCatalog.has(catalog.id)) continue
      const [created] = await tx.insert(exercises).values({
        id: randomUUID(), ownerId: input.ownerId, catalogExerciseId: catalog.id,
        equipmentId: catalog.stationCode ? equipmentByStation.get(catalog.stationCode) ?? null : null,
        name: catalog.name, laterality: catalog.laterality ?? 'bilateral', cues: [],
        loadPerSide: perSideByCatalog.get(catalog.id) ?? false,
      }).returning({ id: exercises.id })
      exerciseByCatalog.set(catalog.id, created!.id)
    }

    await tx.update(programs).set({ isActive: false }).where(and(
      eq(programs.ownerId, input.ownerId), eq(programs.isActive, true), isNull(programs.deletedAt),
    ))
    const [program] = await tx.insert(programs).values({
      id: randomUUID(), ownerId: input.ownerId, name: input.programName,
      sourcePresetSlug: source.preset.slug, sourcePresetVersion: source.preset.version,
      scheduleMode: input.scheduleMode, weekdays: input.weekdays,
      sessionsPerCycle: source.workouts.length, blockDurationWeeks: input.blockDurationWeeks,
      periodDurationMonths: input.periodDurationMonths,
      cyclesPerBlock: 4,
      defaultRestSeconds: input.defaultRestSeconds, reminderLeadMinutes: input.reminderLeadMinutes,
      startedAt: new Date(),
    }).returning({ id: programs.id })

    for (const workout of source.workouts) {
      const [template] = await tx.insert(templates).values({
        id: randomUUID(), ownerId: input.ownerId, programId: program!.id,
        position: workout.position, name: workout.name[locale] ?? Object.values(workout.name)[0]!,
        focus: workout.focus[locale] ?? null,
      }).returning({ id: templates.id })
      const workoutItems = source.items.filter((item) => item.workoutId === workout.id)
      await tx.insert(templateItems).values(workoutItems.map((item) => ({
        id: randomUUID(), ownerId: input.ownerId, templateId: template!.id,
        position: item.position, exerciseId: exerciseByCatalog.get(resolved.get(item.id)!)!,
        sets: item.sets, repMin: item.repMin, repMax: item.repMax,
        trackingMode: item.trackingMode, rirTarget: item.rirTarget, restSeconds: item.restSeconds,
      })))
    }
    await tx.update(userSettings).set({
      remindersEnabled: input.remindersEnabled, onboardedAt: new Date(),
    }).where(eq(userSettings.ownerId, input.ownerId))
    return { programId: program!.id }
  })
}
