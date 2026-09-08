import { describe, expect, it } from 'vitest'
import { PRESET_DEFINITIONS } from '../src/lib/preset-definitions.js'

describe('beginner training presets', () => {
  it('covers every supported split, focus, and duration combination once', () => {
    expect(PRESET_DEFINITIONS).toHaveLength(18)
    expect(new Set(PRESET_DEFINITIONS.map((preset) => preset.slug)).size).toBe(18)
    for (const split of ['ab', 'abc', 'abcd']) {
      for (const focus of ['strength', 'hypertrophy']) {
        for (const duration of [30, 45, 60]) {
          expect(PRESET_DEFINITIONS).toContainEqual(expect.objectContaining({ split, focus, durationMinutes: duration }))
        }
      }
    }
  })

  it('uses the split size and increases exercise count with duration', () => {
    for (const preset of PRESET_DEFINITIONS) {
      expect(preset.workouts).toHaveLength({ ab: 2, abc: 3, abcd: 4 }[preset.split])
      const expected = preset.durationMinutes === 30 ? 4 : preset.durationMinutes === 45 ? 5 : 6
      expect(preset.workouts.every((workout) => workout.items.length === expected)).toBe(true)
    }
  })

  it('keeps beginner effort moderate and distinguishes focus prescriptions', () => {
    for (const preset of PRESET_DEFINITIONS) {
      for (const item of preset.workouts.flatMap((workout) => workout.items)) {
        expect(item.rirTarget).toBe(2)
        expect(item.repMax).toBe(preset.focus === 'strength' ? 6 : 12)
      }
    }
  })
})
