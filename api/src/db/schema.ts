import { sql } from 'drizzle-orm'
import {
  bigint, boolean, index, integer, jsonb, numeric, pgTable, primaryKey,
  smallint, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core'

/**
 * Colunas obrigatórias em toda tabela que participa do sync.
 *
 * `rev` vem de uma sequence global e é reatribuída por trigger em todo UPDATE
 * (ver `src/db/migrate.ts`). É o cursor do pull: o cliente guarda o maior rev
 * que viu e pede tudo acima disso, sem depender de relógio.
 *
 * `deletedAt` existe porque hard delete é invisível para um cliente offline —
 * a linha simplesmente não volta no pull e ele nunca sabe que sumiu.
 */
/**
 * Atenção a `numeric`: o driver do Postgres entrega esses campos como STRING
 * para não perder precisão, e esta versão do Drizzle não expõe `mode: 'number'`
 * para convertê-los. A conversão acontece na saída do sync
 * (`serializeRow` em src/lib/coerce.ts) — sem ela o cliente recebe "60.00"
 * onde gravou 60 e quebra na primeira conta.
 */

const syncCols = {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  // mode 'number': o cursor precisa atravessar JSON, e BigInt não serializa.
  // 2^53 revisões é inalcançável para um app de treino de usuário único.
  rev: bigint('rev', { mode: 'number' }).notNull().default(sql`nextval('sync_rev_seq')`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

// ─── identidade ────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  pictureUrl: text('picture_url'),
  locale: text('locale').notNull().default('pt-BR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull().unique(),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('auth_sessions_user_idx').on(t.userId)])

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Um vínculo de WhatsApp por usuário; as chaves Signal ficam no volume do bot. */
export const whatsappSettings = pgTable('whatsapp_settings', {
  ownerId: uuid('owner_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  selectedGroupJid: text('selected_group_jid'),
  selectedGroupName: text('selected_group_name'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const whatsappAuthState = pgTable('whatsapp_auth_state', {
  ownerId: uuid('owner_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  credentials: text('credentials').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const whatsappAuthKeys = pgTable('whatsapp_auth_keys', {
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  keyId: text('key_id').notNull(),
  value: text('value').notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.category, t.keyId] })])

/** Chaves necessárias para o administrador revogar mensagens do grupo. */
export const whatsappGroupMessages = pgTable('whatsapp_group_messages', {
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  remoteJid: text('remote_jid').notNull(),
  messageId: text('message_id').notNull(),
  fromMe: boolean('from_me').notNull(),
  participant: text('participant'),
  messageTimestamp: bigint('message_timestamp', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.remoteJid, t.messageId] })])

// ─── catálogo global (só-leitura, fora do sync) ────────────────────────────

export const catalogGroups = pgTable('catalog_groups', {
  id: integer('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  region: text('region'),
})

export const catalogStations = pgTable('catalog_stations', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  category: text('category'),
  loadType: text('load_type'),
})

export const catalogExercises = pgTable('catalog_exercises', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  nameI18n: jsonb('name_i18n').$type<Record<string, string>>().notNull().default({}),
  groupId: integer('group_id').references(() => catalogGroups.id),
  stationCode: text('station_code').references(() => catalogStations.code),
  level: text('level'),
  laterality: text('laterality'),
  grip: text('grip'),
  description: jsonb('description').$type<Record<string, string>>().notNull().default({}),
  video: jsonb('video').$type<Record<string, string>>().notNull().default({}),
  loadType: text('load_type'),
  loadInferred: boolean('load_inferred').notNull().default(false),
}, (t) => [index('catalog_exercises_group_idx').on(t.groupId)])

export const catalogRelated = pgTable('catalog_related', {
  exerciseId: integer('exercise_id').notNull().references(() => catalogExercises.id),
  relatedId: integer('related_id').notNull().references(() => catalogExercises.id),
}, (t) => [primaryKey({ columns: [t.exerciseId, t.relatedId] })])

/**
 * Substituição por dor, derivada do campo `exclui` do catálogo bruto
 * (`exercicio_exclusao`). O nome do campo original engana: o valor é o
 * exercício SUBSTITUTO, não algo a evitar.
 *
 * `status` existe porque a origem não é confiável por igual: ombro e lombar
 * batem em ~100% dos casos, joelho e quadril apontam para alvos inexistentes
 * ou contraindicados para a mesma dor em ~80%. Ver scripts/import-catalog.ts.
 */
export const catalogPainSwaps = pgTable('catalog_pain_swaps', {
  exerciseId: integer('exercise_id').notNull().references(() => catalogExercises.id),
  painSlug: text('pain_slug').notNull(),
  substituteId: integer('substitute_id').references(() => catalogExercises.id),
  source: text('source').notNull().default('academia'),
  status: text('status').notNull().default('ok'),
  note: text('note'),
}, (t) => [primaryKey({ columns: [t.exerciseId, t.painSlug] })])

/** 12 regiões com lado, mapeadas para as 4 regiões sem lado do catálogo. */
export const painRegions = pgTable('pain_regions', {
  slug: text('slug').primaryKey(),
  namePt: text('name_pt').notNull(),
  nameEn: text('name_en').notNull(),
  side: text('side'),
  catalogSlug: text('catalog_slug'),
})

// ─── dados do usuário (sincronizados) ──────────────────────────────────────

export const gyms = pgTable('gyms', {
  ...syncCols,
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => [index('gyms_owner_rev_idx').on(t.ownerId, t.rev)])

/**
 * `plateTable` guarda os kg ACUMULADOS por posição de pino, na ordem física:
 * [10, 15, 22, 30, ...]. Máquina de pino é quase sempre não-linear, então não
 * dá para derivar de um incremento. `incrementKg` só é usado quando linear.
 */
export const equipment = pgTable('equipment', {
  ...syncCols,
  gymId: uuid('gym_id'),
  catalogStationCode: text('catalog_station_code'),
  name: text('name').notNull(),
  loadType: text('load_type').notNull().default('pino'),
  incrementKg: numeric('increment_kg', { precision: 6, scale: 2 }),
  plateTable: jsonb('plate_table').$type<number[]>().notNull().default([]),
  notes: text('notes'),
}, (t) => [index('equipment_owner_rev_idx').on(t.ownerId, t.rev)])

/** Aparelhos de cardio que existem na academia do usuário. */
export const cardioOptions = pgTable('cardio_options', {
  ...syncCols,
  gymId: uuid('gym_id'),
  name: text('name').notNull(),
  notes: text('notes'),
}, (t) => [index('cardio_options_owner_rev_idx').on(t.ownerId, t.rev)])

export const exercises = pgTable('exercises', {
  ...syncCols,
  catalogExerciseId: integer('catalog_exercise_id'),
  equipmentId: uuid('equipment_id'),
  name: text('name').notNull(),
  laterality: text('laterality').notNull().default('bilateral'),
  /** Unilateral costuma ser simétrico; assimétrico grava carga/reps por lado. */
  unilateralAsymmetric: boolean('unilateral_asymmetric').notNull().default(false),
  /**
   * Máquina articulada de anilha: a carga entra em cada lado, mas a execução é
   * bilateral. O que se registra é o peso de UM lado — que é o que está escrito
   * na anilha e o que a pessoa monta. Sem essa marca, "40 kg" no histórico não
   * diz se foram 40 ou 80, e a carga vira adivinhação na próxima sessão.
   */
  loadPerSide: boolean('load_per_side').notNull().default(false),
  cues: jsonb('cues').$type<string[]>().notNull().default([]),
  notes: text('notes'),
}, (t) => [index('exercises_owner_rev_idx').on(t.ownerId, t.rev)])

export const exerciseMedia = pgTable('exercise_media', {
  ...syncCols,
  exerciseId: uuid('exercise_id').notNull(),
  s3Key: text('s3_key').notNull(),
  thumbKey: text('thumb_key').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  position: smallint('position').notNull().default(0),
  /**
   * Quando os dois WebP saíram do bucket. A linha continua aqui depois disso:
   * é o soft delete que ensina o cliente offline que a mídia sumiu, e apagá-la
   * de vez a tornaria invisível para quem ainda não sincronizou.
   */
  purgedAt: timestamp('purged_at', { withTimezone: true }),
}, (t) => [index('exercise_media_owner_rev_idx').on(t.ownerId, t.rev)])

/** `reason`: 'equipamento' (a academia não tem), 'dor', 'preferencia'. */
export const exerciseSubstitutions = pgTable('exercise_substitutions', {
  ...syncCols,
  exerciseId: uuid('exercise_id').notNull(),
  substituteExerciseId: uuid('substitute_exercise_id').notNull(),
  reason: text('reason').notNull().default('equipamento'),
  painRegion: text('pain_region'),
}, (t) => [index('exercise_subs_owner_rev_idx').on(t.ownerId, t.rev)])

/**
 * O ciclo é o eixo do app, não o calendário. `sessionsPerCycle` é o tamanho da
 * lista ordenada de templates; `cyclesPerBlock` fecha o bloco, e ao fechar o
 * app SUGERE `rirDeltaPerBlock` (o usuário confirma, nunca aplica sozinho).
 *
 * `scheduleMode`:
 *   'continuous' — o ciclo avança a cada sessão concluída, sem data.
 *   'weekly'     — o mesmo ciclo, amarrado aos dias em `weekdays`.
 */
export const programs = pgTable('programs', {
  ...syncCols,
  name: text('name').notNull(),
  scheduleMode: text('schedule_mode').notNull().default('continuous'),
  sessionsPerCycle: smallint('sessions_per_cycle').notNull().default(2),
  cyclesPerBlock: smallint('cycles_per_block').notNull().default(4),
  rirDeltaPerBlock: smallint('rir_delta_per_block').notNull().default(-1),
  defaultRestSeconds: integer('default_rest_seconds').notNull().default(90),
  reminderLeadMinutes: integer('reminder_lead_minutes').notNull().default(60),
  /**
   * Hora do treino, 'HH:MM' no fuso do install. É o alvo de que
   * `reminderLeadMinutes` é subtraído — sem ela, "avisar 60 min antes" não tem
   * de quê. Tem default para que ligar o lembrete já funcione: silêncio depois
   * de ligar um botão é pior que um horário que o usuário ainda vai ajustar.
   */
  workoutTime: text('workout_time').notNull().default('18:00'),
  /** Último lembrete enviado, para não repetir a cada tick do mesmo dia. */
  lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
  weekdays: jsonb('weekdays').$type<number[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  startedAt: timestamp('started_at', { withTimezone: true }),
}, (t) => [index('programs_owner_rev_idx').on(t.ownerId, t.rev)])

export const templates = pgTable('templates', {
  ...syncCols,
  programId: uuid('program_id').notNull(),
  position: smallint('position').notNull(),
  name: text('name').notNull(),
  focus: text('focus'),
  cardioOptionId: uuid('cardio_option_id'),
  cardioDurationSeconds: integer('cardio_duration_seconds'),
  cardioIntensity: text('cardio_intensity'),
}, (t) => [index('templates_owner_rev_idx').on(t.ownerId, t.rev)])

export const templateItems = pgTable('template_items', {
  ...syncCols,
  templateId: uuid('template_id').notNull(),
  position: smallint('position').notNull(),
  exerciseId: uuid('exercise_id').notNull(),
  sets: smallint('sets').notNull().default(3),
  repMin: smallint('rep_min'),
  repMax: smallint('rep_max'),
  /** Exercício por tempo (prancha, ponte lateral): rep_min/max viram segundos. */
  isTimeBased: boolean('is_time_based').notNull().default(false),
  /** `compact`: um valor replica nas séries; `full`: cada série tem valores próprios. */
  trackingMode: text('tracking_mode').notNull().default('compact'),
  rirTarget: smallint('rir_target'),
  restSeconds: integer('rest_seconds'),
  notes: text('notes'),
}, (t) => [index('template_items_owner_rev_idx').on(t.ownerId, t.rev)])

/** `status`: 'em_andamento' | 'concluida' | 'incompleta'. */
export const workoutSessions = pgTable('workout_sessions', {
  ...syncCols,
  programId: uuid('program_id').notNull(),
  templateId: uuid('template_id').notNull(),
  /** Cópia imutável do plano no início; edições futuras não reescrevem o passado. */
  planSnapshot: jsonb('plan_snapshot'),
  cycleNumber: integer('cycle_number').notNull().default(1),
  blockNumber: integer('block_number').notNull().default(1),
  status: text('status').notNull().default('em_andamento'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  /** Preenchido quando o job de 6h de inatividade fecha a sessão sozinho. */
  autoClosedAt: timestamp('auto_closed_at', { withTimezone: true }),
  notes: text('notes'),
}, (t) => [index('sessions_owner_rev_idx').on(t.ownerId, t.rev)])

/**
 * Append-only na prática, o que torna o auto-merge do sync trivial: dois
 * dispositivos offline geram séries com ids diferentes e a união é correta.
 */
export const setLogs = pgTable('set_logs', {
  ...syncCols,
  sessionId: uuid('session_id').notNull(),
  templateItemId: uuid('template_item_id'),
  exerciseId: uuid('exercise_id').notNull(),
  setIndex: smallint('set_index').notNull(),
  /** Aquecimento é registrado mas fica fora do volume e dos gráficos. */
  isWarmup: boolean('is_warmup').notNull().default(false),
  side: text('side').notNull().default('ambos'),
  weightKg: numeric('weight_kg', { precision: 7, scale: 2 }),
  plateCount: smallint('plate_count'),
  reps: smallint('reps'),
  seconds: integer('seconds'),
  rir: smallint('rir'),
  skipped: boolean('skipped').notNull().default(false),
  hadPain: boolean('had_pain').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  index('set_logs_owner_rev_idx').on(t.ownerId, t.rev),
  index('set_logs_session_idx').on(t.sessionId),
  index('set_logs_exercise_idx').on(t.exerciseId, t.completedAt),
])

export const cardioLogs = pgTable('cardio_logs', {
  ...syncCols,
  sessionId: uuid('session_id').notNull(),
  cardioOptionId: uuid('cardio_option_id'),
  modality: text('modality'),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  perceivedIntensity: text('perceived_intensity'),
  distanceKm: numeric('distance_km', { precision: 6, scale: 2 }),
  avgHeartRate: smallint('avg_heart_rate'),
  notes: text('notes'),
}, (t) => [index('cardio_logs_owner_rev_idx').on(t.ownerId, t.rev)])

export const painEvents = pgTable('pain_events', {
  ...syncCols,
  sessionId: uuid('session_id'),
  setLogId: uuid('set_log_id'),
  regionSlug: text('region_slug').notNull(),
  level: smallint('level').notNull(),
  note: text('note'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
}, (t) => [index('pain_events_owner_rev_idx').on(t.ownerId, t.rev)])

export const functionalTests = pgTable('functional_tests', {
  ...syncCols,
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  frequencyDays: integer('frequency_days').notNull().default(14),
  higherIsBetter: boolean('higher_is_better').notNull().default(true),
}, (t) => [index('functional_tests_owner_rev_idx').on(t.ownerId, t.rev)])

export const testResults = pgTable('test_results', {
  ...syncCols,
  testId: uuid('test_id').notNull(),
  value: numeric('value', { precision: 8, scale: 2 }).notNull(),
  side: text('side').notNull().default('ambos'),
  measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
  note: text('note'),
}, (t) => [index('test_results_owner_rev_idx').on(t.ownerId, t.rev)])

export const userSettings = pgTable('user_settings', {
  ...syncCols,
  unit: text('unit').notNull().default('kg'),
  showPlates: boolean('show_plates').notNull().default(true),
  theme: text('theme').notNull().default('dark'),
  locale: text('locale').notNull().default('pt-BR'),
  remindersEnabled: boolean('reminders_enabled').notNull().default(false),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
}, (t) => [unique('user_settings_owner_uniq').on(t.ownerId)])

// ─── sync ──────────────────────────────────────────────────────────────────

/**
 * Só chega aqui o que o auto-merge não resolveu. Guardamos as três pontas do
 * merge para a UI mostrar o diff e o usuário escolher — o topbar de conflito
 * lê a contagem de `status = 'pendente'`.
 */
export const syncConflicts = pgTable('sync_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id').notNull(),
  baseRow: jsonb('base_row'),
  localRow: jsonb('local_row').notNull(),
  remoteRow: jsonb('remote_row').notNull(),
  conflictingFields: jsonb('conflicting_fields').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('pendente'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [index('sync_conflicts_pending_idx').on(t.ownerId, t.status)])

export const syncDevices = pgTable('sync_devices', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label'),
  lastRev: bigint('last_rev', { mode: 'number' }).notNull().default(sql`0`),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Idempotência do push: reenviar o outbox depois de timeout não duplica nada. */
export const syncOperations = pgTable('sync_operations', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').notNull(),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id').notNull(),
  op: text('op').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sync_operations_owner_idx').on(t.ownerId, t.appliedAt)])
