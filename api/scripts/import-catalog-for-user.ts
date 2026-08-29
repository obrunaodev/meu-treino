import { and, eq, ilike, isNull } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { db, pool } from '../src/db/index.js'
import { catalogExercises, catalogStations, equipment, exercises, gyms, users } from '../src/db/schema.js'
import { preferAlive } from '../src/lib/catalog-user.js'
import { logger } from '../src/lib/logger.js'

async function main() {
  const email = process.env.TARGET_USER_EMAIL?.trim()
  if (!email) throw new Error('TARGET_USER_EMAIL é obrigatório')

  const accounts = await db.select().from(users).where(ilike(users.email, email))
  if (accounts.length !== 1) {
    throw new Error(`esperava uma conta para ${email}, encontrei ${accounts.length}`)
  }
  const ownerId = accounts[0]!.id

  const result = await db.transaction(async (tx) => {
    const catalogGear = await tx.select().from(catalogStations)
    const catalogMovements = await tx.select().from(catalogExercises)
    if (catalogGear.length === 0 || catalogMovements.length === 0) {
      throw new Error('catálogo global vazio; execute catalog:import primeiro')
    }

    const ownedGyms = await tx.select().from(gyms).where(and(eq(gyms.ownerId, ownerId), isNull(gyms.deletedAt)))
    let gym = ownedGyms.find((entry) => entry.isActive) ?? ownedGyms[0]
    if (!gym) {
      const inserted = await tx.insert(gyms).values({
        id: uuidv7(), ownerId, name: 'Minha academia', isActive: true,
      }).returning()
      gym = inserted[0]!
    }

    const ownedEquipment = await tx.select().from(equipment).where(eq(equipment.ownerId, ownerId))
    const equipmentByStation = preferAlive(ownedEquipment, (entry) => entry.catalogStationCode)
    let equipmentCreated = 0
    let equipmentRestored = 0

    for (const station of catalogGear) {
      const existing = equipmentByStation.get(station.code)
      if (existing) {
        if (existing.deletedAt !== null) {
          await tx.update(equipment).set({ deletedAt: null, gymId: gym.id }).where(eq(equipment.id, existing.id))
          equipmentRestored++
        }
        continue
      }
      const inserted = await tx.insert(equipment).values({
        id: uuidv7(), ownerId, gymId: gym.id, catalogStationCode: station.code,
        name: station.name, loadType: station.loadType ?? 'pino', plateTable: [],
      }).returning()
      equipmentByStation.set(station.code, inserted[0]!)
      equipmentCreated++
    }

    const ownedExercises = await tx.select().from(exercises).where(eq(exercises.ownerId, ownerId))
    const exerciseByCatalog = preferAlive(ownedExercises, (entry) => entry.catalogExerciseId)
    let exercisesCreated = 0
    let exercisesUpdated = 0
    let linkedToEquipment = 0

    for (const catalog of catalogMovements) {
      const equipmentId = catalog.stationCode
        ? equipmentByStation.get(catalog.stationCode)?.id ?? null
        : null
      const existing = exerciseByCatalog.get(catalog.id)
      if (existing) {
        const needsUpdate = existing.deletedAt !== null || existing.equipmentId !== equipmentId
        if (needsUpdate) {
          await tx.update(exercises).set({ deletedAt: null, equipmentId }).where(eq(exercises.id, existing.id))
          exercisesUpdated++
        }
      } else {
        await tx.insert(exercises).values({
          id: uuidv7(), ownerId, catalogExerciseId: catalog.id, equipmentId,
          name: catalog.name, laterality: catalog.laterality ?? 'bilateral',
          unilateralAsymmetric: false, loadPerSide: false, cues: [],
        })
        exercisesCreated++
      }
      if (equipmentId) linkedToEquipment++
    }

    return {
      email, ownerId, gym: gym.name,
      catalogStations: catalogGear.length,
      catalogExercises: catalogMovements.length,
      equipmentCreated, equipmentRestored,
      exercisesCreated, exercisesUpdated, linkedToEquipment,
    }
  })

  logger.info(result, 'catálogo copiado para a conta')
  await pool.end()
}

main().catch(async (error) => {
  logger.error(error, 'falha ao copiar catálogo para a conta')
  await pool.end()
  process.exit(1)
})
