import { describe, expect, it } from 'vitest'
import { rirLevel } from '../src/lib/domain/rir.js'

describe('rirLevel', () => {
  it.each([[0, 'very_heavy'], [1, 'heavy'], [2, 'moderate'], [3, 'moderate'], [4, 'light'], [8, 'light']])(
    'maps legacy RIR %s to %s', (value, level) => expect(rirLevel(value)).toBe(level),
  )

  it('keeps an absent effort unset', () => {
    expect(rirLevel(null)).toBeNull()
    expect(rirLevel(undefined)).toBeNull()
  })
})
