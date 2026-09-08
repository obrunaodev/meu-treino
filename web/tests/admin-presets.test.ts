import { describe, expect, it } from 'vitest'
import { blankAdminPreset, presetPayload } from '../src/lib/admin-presets.js'

describe('admin preset editor data', () => {
  it('starts unpublished and strips database child ids from writes', () => {
    const preset = blankAdminPreset()
    preset.workouts[0]!.id = 'workout-id'
    preset.workouts[0]!.items.push({
      id: 'item-id', catalogExerciseId: 165, sets: 3, repMin: 8, repMax: 12,
      rirTarget: 2, restSeconds: 90, trackingMode: 'compact', loadPerSide: false,
    })

    expect(preset.isPublished).toBe(false)
    expect(presetPayload(preset).workouts[0]).not.toHaveProperty('id')
    expect(presetPayload(preset).workouts[0]!.items[0]).not.toHaveProperty('id')
  })
})
