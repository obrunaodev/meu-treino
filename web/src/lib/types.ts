/**
 * Espelho tipado do schema do servidor (api/src/db/schema.ts) para as
 * entidades sincronizadas. O Dexie guarda os registros como vieram do pull, e
 * é aqui que a UI ganha tipo em cima deles.
 */

export interface Base {
  id: string
  ownerId: string
  rev?: number
  createdAt?: string
  updatedAt: string
  deletedAt?: string | null
}

export interface Gym extends Base {
  name: string
  isActive: boolean
}

export interface Equipment extends Base {
  gymId: string | null
  catalogStationCode: string | null
  name: string
  loadType: string
  incrementKg: number | null
  plateTable: number[]
  notes: string | null
}

export interface CardioOption extends Base {
  gymId: string | null
  name: string
  notes: string | null
}

export interface Exercise extends Base {
  catalogExerciseId: number | null
  equipmentId: string | null
  name: string
  laterality: string
  unilateralAsymmetric: boolean
  /** Máquina articulada de anilha: o peso registrado é o de um lado só. */
  loadPerSide: boolean
  cues: string[]
  notes: string | null
}

export interface ExerciseMedia extends Base {
  exerciseId: string
  s3Key: string
  thumbKey: string
  mime: string
  bytes: number
  width: number | null
  height: number | null
  position: number
}

export interface ExerciseSubstitution extends Base {
  exerciseId: string
  substituteExerciseId: string
  reason: string
  painRegion: string | null
}

export interface Program extends Base {
  name: string
  scheduleMode: 'continuous' | 'weekly'
  sessionsPerCycle: number
  cyclesPerBlock: number
  rirDeltaPerBlock: number
  defaultRestSeconds: number
  reminderLeadMinutes: number
  weekdays: number[]
  isActive: boolean
  startedAt: string | null
}

export interface Template extends Base {
  programId: string
  position: number
  name: string
  focus: string | null
  cardioOptionId: string | null
  cardioDurationSeconds: number | null
  cardioIntensity: 'leve' | 'moderado' | 'forte' | null
}

export interface TemplateItem extends Base {
  templateId: string
  position: number
  exerciseId: string
  sets: number
  repMin: number | null
  repMax: number | null
  isTimeBased: boolean
  rirTarget: number | null
  restSeconds: number | null
  notes: string | null
}

export type SessionStatus = 'em_andamento' | 'concluida' | 'incompleta'

export interface WorkoutSession extends Base {
  programId: string
  templateId: string
  planSnapshot: PlanSnapshot | null
  cycleNumber: number
  blockNumber: number
  status: SessionStatus
  startedAt: string
  endedAt: string | null
  autoClosedAt: string | null
  notes: string | null
}

export interface PlanSnapshotEquipment {
  id: string
  name: string
  loadType: string
  incrementKg: number | null
  plateTable: number[]
}

export interface PlanSnapshotItem extends TemplateItem {
  exerciseName: string
  laterality: string
  unilateralAsymmetric: boolean
  loadPerSide: boolean
  equipment: PlanSnapshotEquipment | null
}

export interface PlanSnapshot {
  version: 1
  capturedAt: string
  templateId: string
  templateName: string
  items: PlanSnapshotItem[]
}

export interface SetLog extends Base {
  sessionId: string
  templateItemId: string | null
  exerciseId: string
  setIndex: number
  isWarmup: boolean
  side: 'ambos' | 'D' | 'E'
  weightKg: number | null
  plateCount: number | null
  reps: number | null
  seconds: number | null
  rir: number | null
  skipped: boolean
  hadPain: boolean
  completedAt: string | null
}

export interface CardioLog extends Base {
  sessionId: string
  cardioOptionId: string | null
  modality: string | null
  durationSeconds: number
  perceivedIntensity: 'leve' | 'moderado' | 'forte' | null
  distanceKm: number | null
  avgHeartRate: number | null
  notes: string | null
}

export interface PainEvent extends Base {
  sessionId: string | null
  setLogId: string | null
  regionSlug: string
  level: number
  note: string | null
  occurredAt: string
}

export interface FunctionalTest extends Base {
  name: string
  unit: string
  frequencyDays: number
  higherIsBetter: boolean
}

export interface TestResult extends Base {
  testId: string
  value: number
  side: 'ambos' | 'D' | 'E'
  measuredAt: string
  note: string | null
}

export interface UserSettings extends Base {
  unit: 'kg' | 'lb'
  showPlates: boolean
  theme: string
  locale: string
  remindersEnabled: boolean
  onboardedAt: string | null
}

/** Catálogo global, servido pela API — não sincroniza, não pertence a ninguém. */
export interface CatalogExercise {
  id: number
  name: string
  slug: string
  nameI18n: Record<string, string>
  groupId: number | null
  stationCode: string | null
  level: string | null
  laterality: string | null
  grip: string | null
  description: Record<string, string>
  video: Record<string, string>
  loadType: string | null
  loadInferred: boolean
}

export interface CatalogStation {
  code: string
  name: string
  category: string | null
  loadType: string | null
}

export interface CatalogGroup {
  id: number
  slug: string
  name: string
  region: string | null
}

export interface PainRegion {
  slug: string
  namePt: string
  nameEn: string
  side: string | null
  catalogSlug: string | null
}

export interface CatalogPainSwap {
  exerciseId: number
  painSlug: string
  substituteId: number | null
  source: string
  status: 'ok' | 'invalido' | 'pendente'
  note: string | null
}
