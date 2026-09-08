export interface MatchExercise {
  id: number
  stationCode: string | null
}

export interface PresetMatch {
  status: 'direct' | 'substituted' | 'choice_required' | 'unavailable'
  selectedExerciseId: number | null
  alternatives: number[]
}

/** Resolves a preset exercise against the machines selected for one gym. */
export function matchPresetExercise(
  required: MatchExercise,
  related: MatchExercise[],
  availableStations: Set<string>,
): PresetMatch {
  if (!required.stationCode || availableStations.has(required.stationCode)) {
    return { status: 'direct', selectedExerciseId: required.id, alternatives: [] }
  }

  const available = related.filter((candidate) =>
    !candidate.stationCode || availableStations.has(candidate.stationCode),
  )
  if (available.length === 1) {
    return { status: 'substituted', selectedExerciseId: available[0]!.id, alternatives: [available[0]!.id] }
  }
  if (available.length > 1) {
    return { status: 'choice_required', selectedExerciseId: null, alternatives: available.map((item) => item.id) }
  }
  return { status: 'unavailable', selectedExerciseId: null, alternatives: related.map((item) => item.id) }
}
