import { randomUUID } from 'node:crypto'
import { pool } from './db.js'
import type { ExerciseEntry } from './parser.js'

export interface WorkoutReviewItem {
  id: string
  exerciseId: string
  name: string
  skipped: boolean
  weightKg: number | null
  sets: number
  reps: number | null
  rir: number | null
}

export interface WorkoutReview {
  sessionId: string
  templateName: string
  status: string
  startedAt: Date
  items: WorkoutReviewItem[]
}

/** Resume a sessão aberta sem criar uma nova sessão. */
export async function openWorkoutReview(ownerId: string): Promise<WorkoutReview | null> {
  const session = (await pool.query(`select s.id,t.name as template_name,s.status,s.started_at,s.plan_snapshot
    from workout_sessions s join templates t on t.id=s.template_id
    where s.owner_id=$1 and s.status='em_andamento' and s.deleted_at is null
    order by s.started_at desc limit 1`, [ownerId])).rows[0]
  return session ? reviewForSession(ownerId, session) : null
}

/** Resume o treino encerrado mais recente para orientar uma correção. */
export async function lastWorkoutReview(ownerId: string): Promise<WorkoutReview | null> {
  const session = (await pool.query(`select s.id,t.name as template_name,s.status,s.started_at,s.plan_snapshot
    from workout_sessions s join templates t on t.id=s.template_id
    where s.owner_id=$1 and s.status in ('concluida','incompleta') and s.deleted_at is null
    order by s.started_at desc limit 1`, [ownerId])).rows[0]
  return session ? reviewForSession(ownerId, session) : null
}

/** Sessão mais recente pelo início, aberta ou encerrada, que `/edit` alterará. */
export async function editableWorkoutReview(ownerId: string): Promise<WorkoutReview | null> {
  const session = (await pool.query(`select s.id,t.name as template_name,s.status,s.started_at,s.plan_snapshot
    from workout_sessions s join templates t on t.id=s.template_id
    where s.owner_id=$1 and s.status in ('em_andamento','concluida','incompleta') and s.deleted_at is null
    order by s.started_at desc limit 1`, [ownerId])).rows[0]
  return session ? reviewForSession(ownerId, session) : null
}

/** Encerra a sessão aberta como incompleta e preserva os registros existentes. */
export async function endOpenWorkout(ownerId: string) {
  const result = await pool.query(`update workout_sessions
    set status='incompleta',ended_at=now(),updated_at=now()
    where id=(select id from workout_sessions where owner_id=$1 and status='em_andamento'
      and deleted_at is null order by started_at desc limit 1)
    returning id`, [ownerId])
  return result.rowCount === 1
}

/** Substitui o registro de um exercício no último treino encerrado. */
export async function editTargetWorkout(ownerId: string, entry: ExerciseEntry) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const session = (await client.query(`select id,template_id,status,plan_snapshot from workout_sessions
      where owner_id=$1 and status in ('em_andamento','concluida','incompleta') and deleted_at is null
      order by started_at desc limit 1 for update`, [ownerId])).rows[0]
    if (!session) return await rollback(client, { status: 'no_history' as const })
    const items = session.plan_snapshot?.items?.map((item: SnapshotItem) => ({
      id: item.id, exercise_id: item.exerciseId, name: item.exerciseName, load_per_side: item.loadPerSide,
    })) ?? (await client.query(`select i.id,i.exercise_id,e.name,e.load_per_side
      from template_items i join exercises e on e.id=i.exercise_id
      where i.owner_id=$1 and i.template_id=$2 and i.deleted_at is null and e.deleted_at is null
      order by i.position`, [ownerId, session.template_id])).rows
    const item = items[entry.exerciseNumber - 1]
    if (!item) return await rollback(client, { status: 'bad_exercise' as const, count: items.length })

    await client.query(`update set_logs log set deleted_at=now(),updated_at=now()
      where log.session_id=$1 and log.deleted_at is null
        and (log.template_item_id=$2 or (
          log.exercise_id=$3 and not exists (
            select 1 from set_logs exact where exact.session_id=$1
              and exact.template_item_id=$2 and exact.deleted_at is null
          )
        ))`, [session.id, item.id, item.exercise_id])
    for (let index = 1; index <= entry.sets; index++) {
      await client.query(`insert into set_logs
        (id,owner_id,session_id,template_item_id,exercise_id,set_index,is_warmup,side,weight_kg,reps,rir,skipped,had_pain,completed_at)
        values ($1,$2,$3,$4,$5,$6,false,'ambos',$7,$8,$9,false,false,now())`,
      [randomUUID(), ownerId, session.id, item.id, item.exercise_id, index, entry.weightKg, entry.reps, entry.rir])
    }
    if (session.status === 'em_andamento') await completeEditedSession(client, session.id, ownerId, items)
    await client.query('commit')
    return { status: 'saved' as const, item: { name: item.name, loadPerSide: item.load_per_side } }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function completeEditedSession(
  client: import('pg').PoolClient,
  sessionId: string,
  ownerId: string,
  items: Array<{ id: string }>,
) {
  const { rows } = await client.query(`select distinct template_item_id from set_logs
    where session_id=$1 and deleted_at is null and (skipped=true or not is_warmup)`, [sessionId])
  const resolved = new Set(rows.map((row) => row.template_item_id))
  if (items.some((item) => !resolved.has(item.id))) return
  await client.query(`update workout_sessions set status='concluida',ended_at=now(),updated_at=now()
    where id=$1 and owner_id=$2 and status='em_andamento'`, [sessionId, ownerId])
}

async function reviewForSession(ownerId: string, session: SessionReviewRow) {
  if (session.plan_snapshot?.items) return reviewFromSnapshot(ownerId, session)
  const { rows } = await pool.query(`select i.id,i.exercise_id,e.name,
      coalesce(bool_or(l.skipped) filter (where l.deleted_at is null),false) as skipped,
      max(l.weight_kg::numeric) filter (where l.deleted_at is null and not l.skipped and not l.is_warmup) as weight_kg,
      count(distinct l.set_index) filter (where l.deleted_at is null and not l.skipped and not l.is_warmup)::int as sets,
      max(l.reps) filter (where l.deleted_at is null and not l.skipped and not l.is_warmup) as reps,
      max(l.rir) filter (where l.deleted_at is null and not l.skipped and not l.is_warmup) as rir
    from workout_sessions s join template_items i on i.template_id=s.template_id and i.deleted_at is null
    join exercises e on e.id=i.exercise_id and e.deleted_at is null
    left join lateral (
      select log.* from set_logs log
      where log.session_id=s.id and (
        log.template_item_id=i.id or (
          log.exercise_id=i.exercise_id and not exists (
            select 1 from set_logs exact where exact.session_id=s.id
              and exact.template_item_id=i.id and exact.deleted_at is null
          )
        )
      )
    ) l on true
    where s.id=$1 and s.owner_id=$2 group by i.id,i.exercise_id,e.name,i.position order by i.position`,
  [session.id, ownerId])
  return {
    sessionId: session.id, templateName: session.template_name, status: session.status,
    startedAt: session.started_at,
    items: rows.map((row) => ({
      id: row.id, exerciseId: row.exercise_id, name: row.name, skipped: row.skipped,
      weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
      sets: row.sets, reps: row.reps, rir: row.rir,
    })),
  }
}

async function reviewFromSnapshot(ownerId: string, session: SessionReviewRow): Promise<WorkoutReview> {
  const { rows } = await pool.query(`select template_item_id,exercise_id,
      coalesce(bool_or(skipped),false) as skipped,
      max(weight_kg::numeric) filter (where not skipped and not is_warmup) as weight_kg,
      count(distinct set_index) filter (where not skipped and not is_warmup)::int as sets,
      max(reps) filter (where not skipped and not is_warmup) as reps,
      max(rir) filter (where not skipped and not is_warmup) as rir
    from set_logs where session_id=$1 and owner_id=$2 and deleted_at is null
    group by template_item_id,exercise_id`, [session.id, ownerId])
  const exact = new Map(rows.filter((row) => row.template_item_id).map((row) => [row.template_item_id, row]))
  const byExercise = new Map(rows.map((row) => [row.exercise_id, row]))
  return {
    sessionId: session.id,
    templateName: session.plan_snapshot!.templateName,
    status: session.status,
    startedAt: session.started_at,
    items: session.plan_snapshot!.items.map((item) => {
      const row = exact.get(item.id) ?? byExercise.get(item.exerciseId)
      return {
        id: item.id, exerciseId: item.exerciseId, name: item.exerciseName,
        skipped: row?.skipped ?? false,
        weightKg: row?.weight_kg === null || row?.weight_kg === undefined ? null : Number(row.weight_kg),
        sets: row?.sets ?? 0, reps: row?.reps ?? null, rir: row?.rir ?? null,
      }
    }),
  }
}

interface SnapshotItem {
  id: string
  exerciseId: string
  exerciseName: string
  loadPerSide: boolean
}

interface SessionReviewRow {
  id: string
  template_name: string
  status: string
  started_at: Date
  plan_snapshot: { templateName: string; items: SnapshotItem[] } | null
}

async function rollback<T>(client: import('pg').PoolClient, value: T): Promise<T> {
  await client.query('rollback')
  return value
}
