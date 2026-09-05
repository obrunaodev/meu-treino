import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from './db.js'
import type { ExerciseEntry } from './parser.js'
import { calendarCadence } from './cadence.js'

export interface WorkoutItem {
  id: string
  exerciseId: string
  name: string
  position: number
  sets: number
  repMin: number | null
  repMax: number | null
  rirTarget: number | null
  restSeconds: number | null
  isTimeBased: boolean
  laterality: string
  unilateralAsymmetric: boolean
  loadPerSide: boolean
  equipment: {
    id: string
    name: string
    loadType: string
    incrementKg: number | null
    plateTable: number[]
  } | null
  previousWeightKg: number | null
  videoUrl: string | null
}

export interface WorkoutPlan {
  templateName: string
  items: WorkoutItem[]
}

export interface ActiveWorkout extends WorkoutPlan { sessionId: string }
export interface ExpectedWorkout extends WorkoutPlan { alreadyStarted: boolean }

/** Mostra o treino esperado sem criar uma sessão. */
export async function previewTodayWorkout(ownerId: string): Promise<ExpectedWorkout | null> {
  const client = await pool.connect()
  try {
    const open = (await client.query(`select s.template_id,t.name as template_name,s.plan_snapshot
      from workout_sessions s join templates t on t.id=s.template_id
      where s.owner_id=$1 and s.status='em_andamento' and s.deleted_at is null
      order by s.started_at desc limit 1`, [ownerId])).rows[0]
    const slot = open ?? await nextWorkoutSlot(client, ownerId)
    if (!slot) return null
    return {
      templateName: open?.plan_snapshot?.templateName ?? slot.template_name,
      items: open ? itemsForSession(open, await loadItems(client, ownerId, slot.template_id)) : await loadItems(client, ownerId, slot.template_id),
      alreadyStarted: Boolean(open),
    }
  } finally {
    client.release()
  }
}

/** Abre o próximo slot do ciclo ou devolve a sessão que já está em andamento. */
export async function startTodayWorkout(ownerId: string): Promise<ActiveWorkout | null> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const open = await findOpenSession(client, ownerId)
    const session = open ?? await createNextSession(client, ownerId)
    if (!session) {
      await client.query('rollback')
      return null
    }
    const items = itemsForSession(session, await loadItems(client, ownerId, session.template_id))
    await client.query('commit')
    return { sessionId: session.id, templateName: session.plan_snapshot?.templateName ?? session.template_name, items }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/** Registra todas as séries do exercício e fecha a sessão quando a lista acaba. */
export async function recordExercise(ownerId: string, entry: ExerciseEntry) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const session = await findOpenSession(client, ownerId) ?? await findRevisableSession(client, ownerId)
    if (!session) return await rollback(client, { status: 'no_session' as const })
    const items = itemsForSession(session, await loadItems(client, ownerId, session.template_id))
    const item = items[entry.exerciseNumber - 1]
    if (!item) return await rollback(client, { status: 'bad_exercise' as const, count: items.length })
    const state = await loggedState(client, session.id, item.id)
    if (state === 'logged') {
      return await rollback(client, { status: 'already_logged' as const, item })
    }

    if (state === 'skipped') await removeSkip(client, session.id, item.id)
    await insertSets(client, ownerId, session.id, item, entry)
    const completion = await completeIfAllExercisesLogged(client, session.id, ownerId, items)
    await client.query('commit')
    return { status: 'saved' as const, item, ...completion }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/** Marca um item como pulado sem criar séries executadas. */
export async function skipExercise(ownerId: string, exerciseNumber: number) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const session = await findOpenSession(client, ownerId)
    if (!session) return await rollback(client, { status: 'no_session' as const })
    const items = itemsForSession(session, await loadItems(client, ownerId, session.template_id))
    const item = items[exerciseNumber - 1]
    if (!item) return await rollback(client, { status: 'bad_exercise' as const, count: items.length })
    const state = await loggedState(client, session.id, item.id)
    if (state === 'logged') return await rollback(client, { status: 'already_logged' as const, item })
    if (state === 'skipped') return await rollback(client, { status: 'already_skipped' as const, item })

    await insertSkip(client, ownerId, session.id, item)
    const completion = await completeIfAllExercisesLogged(client, session.id, ownerId, items)
    await client.query('commit')
    return { status: 'skipped' as const, item, ...completion }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function findOpenSession(client: PoolClient, ownerId: string) {
  const { rows } = await client.query(`
    select s.id, s.template_id, t.name as template_name, s.plan_snapshot
    from workout_sessions s join templates t on t.id = s.template_id
    where s.owner_id = $1 and s.status = 'em_andamento' and s.deleted_at is null
    order by s.started_at desc limit 1 for update of s`, [ownerId])
  return rows[0] as SessionRow | undefined
}

async function findRevisableSession(client: PoolClient, ownerId: string) {
  const { rows } = await client.query(`
    select s.id, s.template_id, t.name as template_name, s.plan_snapshot
    from workout_sessions s join templates t on t.id=s.template_id
    where s.owner_id=$1 and s.status in ('concluida','incompleta') and s.deleted_at is null
      and s.ended_at >= now() - interval '6 hours'
      and exists (select 1 from set_logs l where l.session_id=s.id and l.skipped=true and l.deleted_at is null)
    order by s.ended_at desc limit 1 for update of s`, [ownerId])
  return rows[0] as SessionRow | undefined
}

async function createNextSession(client: PoolClient, ownerId: string) {
  const slot = await nextWorkoutSlot(client, ownerId)
  if (!slot) return null
  const id = randomUUID()
  const items = await loadItems(client, ownerId, slot.template_id)
  const snapshot = createPlanSnapshot(slot.template_id, slot.template_name, ownerId, items)
  await client.query(`insert into workout_sessions
    (id,owner_id,program_id,template_id,plan_snapshot,cycle_number,block_number,period_number,status,started_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,'em_andamento',now())`,
  [id, ownerId, slot.program_id, slot.template_id, JSON.stringify(snapshot),
    slot.cycle_number, slot.block_number, slot.period_number])
  return { id, template_id: slot.template_id, template_name: slot.template_name, plan_snapshot: snapshot }
}

async function nextWorkoutSlot(client: PoolClient, ownerId: string) {
  const program = (await client.query(`select * from programs where owner_id=$1 and is_active=true and deleted_at is null limit 1`, [ownerId])).rows[0]
  if (!program) return null
  const templates = (await client.query(`select id,name from templates where owner_id=$1 and program_id=$2 and deleted_at is null order by position`, [ownerId, program.id])).rows
  if (!templates.length) return null
  const history = (await client.query(`select template_id from workout_sessions where owner_id=$1 and program_id=$2 and status in ('concluida','incompleta') and deleted_at is null order by started_at`, [ownerId, program.id])).rows
  const lastIndex = templates.findIndex((template) => template.id === history.at(-1)?.template_id)
  const template = templates[(lastIndex + 1) % templates.length]!
  const cycleNumber = Math.floor(history.length / Math.max(1, program.sessions_per_cycle)) + 1
  const cadence = calendarCadence(
    new Date(program.started_at ?? program.created_at),
    Math.max(1, program.block_duration_weeks),
    Math.max(1, program.period_duration_months),
    new Date(),
  )
  return {
    program_id: program.id, template_id: template.id, template_name: template.name,
    cycle_number: cycleNumber, block_number: cadence.blockNumber, period_number: cadence.periodNumber,
  }
}

async function loadItems(client: PoolClient, ownerId: string, templateId: string): Promise<WorkoutItem[]> {
  const { rows } = await client.query(`
    select i.id, i.exercise_id, i.updated_at, e.name, i.position, i.sets, i.rep_min, i.rep_max,
           i.rir_target, i.rest_seconds, i.is_time_based, e.laterality,
           e.unilateral_asymmetric, e.load_per_side, c.video, previous.previous_weight_kg,
           gear.id as equipment_id, gear.name as equipment_name, gear.load_type,
           gear.increment_kg, gear.plate_table
    from template_items i join exercises e on e.id=i.exercise_id
    left join equipment gear on gear.id=e.equipment_id and gear.deleted_at is null
    left join catalog_exercises c on c.id=e.catalog_exercise_id
    left join lateral (
      select max(sl.weight_kg::numeric) as previous_weight_kg
      from set_logs sl join workout_sessions ws on ws.id=sl.session_id
      where sl.owner_id=$1 and sl.exercise_id=e.id and sl.deleted_at is null
        and sl.is_warmup=false and sl.skipped=false and sl.weight_kg is not null
        and ws.status in ('concluida','incompleta') and ws.deleted_at is null
      group by ws.started_at order by ws.started_at desc limit 1
    ) previous on true
    where i.owner_id=$1 and i.template_id=$2 and i.deleted_at is null and e.deleted_at is null
    order by i.position`, [ownerId, templateId])
  return rows.map((row) => ({
    id: row.id, exerciseId: row.exercise_id, name: row.name, position: row.position,
    sets: row.sets, repMin: row.rep_min, repMax: row.rep_max,
    rirTarget: row.rir_target, restSeconds: row.rest_seconds, isTimeBased: row.is_time_based,
    laterality: row.laterality, unilateralAsymmetric: row.unilateral_asymmetric,
    loadPerSide: row.load_per_side,
    equipment: row.equipment_id ? {
      id: row.equipment_id, name: row.equipment_name, loadType: row.load_type,
      incrementKg: row.increment_kg === null ? null : Number(row.increment_kg),
      plateTable: row.plate_table,
    } : null,
    previousWeightKg: row.previous_weight_kg === null ? null : Number(row.previous_weight_kg),
    videoUrl: preferredVideo(row.video),
  }))
}

function preferredVideo(video: Record<string, string> | null): string | null {
  if (!video) return null
  return video.pt ?? video['pt-BR'] ?? video.en ?? Object.values(video)[0] ?? null
}

async function insertSets(client: PoolClient, ownerId: string, sessionId: string, item: WorkoutItem, entry: ExerciseEntry) {
  for (let index = 1; index <= entry.sets; index++) {
    await client.query(`insert into set_logs
      (id,owner_id,session_id,template_item_id,exercise_id,set_index,is_warmup,side,weight_kg,reps,rir,skipped,had_pain,completed_at)
      values ($1,$2,$3,$4,$5,$6,false,'ambos',$7,$8,$9,false,false,now())`,
    [randomUUID(), ownerId, sessionId, item.id, item.exerciseId, index, entry.weightKg, entry.reps, entry.rir])
  }
}

async function insertSkip(client: PoolClient, ownerId: string, sessionId: string, item: WorkoutItem) {
  await client.query(`insert into set_logs
    (id,owner_id,session_id,template_item_id,exercise_id,set_index,is_warmup,side,skipped,had_pain,completed_at)
    values ($1,$2,$3,$4,$5,1,false,'ambos',true,false,now())`,
  [randomUUID(), ownerId, sessionId, item.id, item.exerciseId])
}

async function loggedState(client: PoolClient, sessionId: string, itemId: string) {
  const { rows } = await client.query(`select skipped from set_logs
    where session_id=$1 and template_item_id=$2 and deleted_at is null
    order by skipped asc limit 1`, [sessionId, itemId])
  if (!rows[0]) return 'empty' as const
  return rows[0].skipped ? 'skipped' as const : 'logged' as const
}

async function removeSkip(client: PoolClient, sessionId: string, itemId: string) {
  await client.query(`update set_logs set deleted_at=now(),updated_at=now()
    where session_id=$1 and template_item_id=$2 and skipped=true and deleted_at is null`, [sessionId, itemId])
}

async function completeIfAllExercisesLogged(
  client: PoolClient, sessionId: string, ownerId: string, items: WorkoutItem[],
) {
  if (items.length === 0) return { finished: false, incomplete: false }
  const { rows } = await client.query(`select template_item_id,bool_or(skipped) as skipped from set_logs
    where session_id=$1 and deleted_at is null and (skipped=true or (skipped=false and is_warmup=false))
    group by template_item_id`, [sessionId])
  const resolved = new Set(rows.map((row) => row.template_item_id))
  if (items.some((item) => !resolved.has(item.id))) return { finished: false, incomplete: false }
  const incomplete = rows.some((row) => row.skipped)
  const result = await client.query(`update workout_sessions set status=$3,ended_at=now(),updated_at=now()
    where id=$1 and owner_id=$2 and status in ('em_andamento','incompleta') returning id`, [sessionId, ownerId, incomplete ? 'incompleta' : 'concluida'])
  return { finished: result.rowCount === 1, incomplete }
}

interface SessionRow {
  id: string
  template_id: string
  template_name: string
  plan_snapshot: { templateName: string; items: WorkoutItem[] } | null
}

function itemsForSession(session: { plan_snapshot?: SessionRow['plan_snapshot'] }, fallback: WorkoutItem[]) {
  return session.plan_snapshot?.items ?? fallback
}

function createPlanSnapshot(templateId: string, templateName: string, ownerId: string, items: WorkoutItem[]) {
  const capturedAt = new Date().toISOString()
  return {
    version: 1, capturedAt, templateId, templateName,
    items: items.map((item) => ({
      ...item,
      templateId,
      ownerId,
      updatedAt: capturedAt,
      exerciseName: item.name,
      notes: null,
    })),
  }
}

async function rollback<T>(client: PoolClient, value: T): Promise<T> {
  await client.query('rollback')
  return value
}
