export type RirLevel = 'light' | 'moderate' | 'heavy' | 'very_heavy'

export const RIR_LEVELS: ReadonlyArray<{ level: RirLevel; value: number }> = [
  { level: 'light', value: 4 },
  { level: 'moderate', value: 2 },
  { level: 'heavy', value: 1 },
  { level: 'very_heavy', value: 0 },
]

/** Maps legacy numeric RIR values to the four-level perceived-effort scale. */
export function rirLevel(value: number | null | undefined): RirLevel | null {
  if (value === null || value === undefined) return null
  if (value >= 4) return 'light'
  if (value >= 2) return 'moderate'
  if (value >= 1) return 'heavy'
  return 'very_heavy'
}

/** Returns the translation key for a stored RIR value. */
export function rirLabelKey(value: number | null | undefined) {
  const level = rirLevel(value)
  return level ? `rir.${level}` as const : null
}
