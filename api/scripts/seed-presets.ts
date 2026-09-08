import { db, pool } from '../src/db/index.js'
import { presetItems, presetWorkouts, trainingPresets } from '../src/db/schema.js'
import { PRESET_DEFINITIONS } from '../src/lib/preset-definitions.js'

async function main() {
  let created = 0
  for (const definition of PRESET_DEFINITIONS) {
    created += await db.transaction(async (tx) => {
      const inserted = await tx.insert(trainingPresets).values({
        slug: definition.slug,
        name: definition.name,
        split: definition.split,
        focus: definition.focus,
        durationMinutes: definition.durationMinutes,
        level: 'beginner',
        version: 1,
      }).onConflictDoNothing({ target: trainingPresets.slug }).returning({ id: trainingPresets.id })
      const preset = inserted[0]
      if (!preset) return 0

      for (const [position, workout] of definition.workouts.entries()) {
        const [row] = await tx.insert(presetWorkouts).values({
          presetId: preset.id,
          position,
          name: workout.name,
          focus: workout.focus,
        }).returning({ id: presetWorkouts.id })
        await tx.insert(presetItems).values(workout.items.map((item, itemPosition) => ({
          workoutId: row!.id,
          position: itemPosition,
          ...item,
        })))
      }
      return 1
    })
  }
  process.stdout.write(`${created} presets created; ${PRESET_DEFINITIONS.length - created} already existed\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}).finally(() => pool.end())
