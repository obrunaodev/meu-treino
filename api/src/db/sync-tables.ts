import * as s from './schema.js'

/**
 * Registro único das entidades sincronizadas. O nome da chave é o que o
 * cliente manda no outbox e o que aparece em `sync_conflicts.entity`.
 *
 * `mergeStrategy`:
 *   'append-only' — a linha nunca é editada depois de criada, então a união
 *                   entre dispositivos é sempre correta e não gera conflito.
 *                   Vale só para o que a UI de fato não deixa editar: um
 *                   upsert numa linha existente é DESCARTADO em silêncio, e
 *                   marcar aqui algo que a tela edita perde a edição sem erro.
 *   'field-merge' — merge campo a campo contra a base comum; só os campos que
 *                   divergiram dos DOIS lados viram conflito manual.
 *   'lww'         — preferência do usuário, o último a escrever ganha.
 */
export const SYNC_TABLES = {
  gyms: { table: s.gyms, mergeStrategy: 'field-merge' },
  equipment: { table: s.equipment, mergeStrategy: 'field-merge' },
  cardio_options: { table: s.cardioOptions, mergeStrategy: 'field-merge' },
  exercises: { table: s.exercises, mergeStrategy: 'field-merge' },
  exercise_media: { table: s.exerciseMedia, mergeStrategy: 'append-only' },
  exercise_substitutions: { table: s.exerciseSubstitutions, mergeStrategy: 'field-merge' },
  programs: { table: s.programs, mergeStrategy: 'field-merge' },
  templates: { table: s.templates, mergeStrategy: 'field-merge' },
  template_items: { table: s.templateItems, mergeStrategy: 'field-merge' },
  workout_sessions: { table: s.workoutSessions, mergeStrategy: 'field-merge' },
  // field-merge, não append-only: /history/:id corrige carga, reps, RIR,
  // lado, aquecimento e pulada de uma série já registrada.
  set_logs: { table: s.setLogs, mergeStrategy: 'field-merge' },
  cardio_logs: { table: s.cardioLogs, mergeStrategy: 'field-merge' },
  pain_events: { table: s.painEvents, mergeStrategy: 'append-only' },
  functional_tests: { table: s.functionalTests, mergeStrategy: 'field-merge' },
  test_results: { table: s.testResults, mergeStrategy: 'append-only' },
  user_settings: { table: s.userSettings, mergeStrategy: 'lww' },
} as const

export type SyncEntity = keyof typeof SYNC_TABLES

export const SYNC_ENTITIES = Object.keys(SYNC_TABLES) as SyncEntity[]

export function isSyncEntity(value: string): value is SyncEntity {
  return value in SYNC_TABLES
}

/** Campos controlados pelo servidor — o cliente não pode sobrescrever. */
export const SERVER_OWNED_FIELDS = new Set(['rev', 'ownerId', 'createdAt'])
