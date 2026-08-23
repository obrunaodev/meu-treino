import { pool } from './db.js'

export interface WeeklySession {
  id: string
  templateName: string
  status: string
  startedAt: Date
  endedAt: Date | null
  exercises: number
  sets: number
  volumeKg: number
}

/** Lista as sessões iniciadas na semana corrente de São Paulo. */
export async function weeklyHistory(ownerId: string): Promise<WeeklySession[]> {
  const { rows } = await pool.query(`
    select s.id,coalesce(s.plan_snapshot->>'templateName',t.name) as template_name,s.status,s.started_at,s.ended_at,
      count(distinct l.exercise_id) filter (
        where l.deleted_at is null and not l.skipped and not l.is_warmup
      )::int as exercises,
      count(l.id) filter (
        where l.deleted_at is null and not l.skipped and not l.is_warmup
      )::int as sets,
      coalesce(sum(l.weight_kg::numeric * l.reps) filter (
        where l.deleted_at is null and not l.skipped and not l.is_warmup
          and l.weight_kg is not null and l.reps is not null
      ),0) as volume_kg
    from workout_sessions s join templates t on t.id=s.template_id
    left join set_logs l on l.session_id=s.id
    where s.owner_id=$1 and s.deleted_at is null
      and s.started_at >= date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
      and s.started_at < (date_trunc('week',now() at time zone 'America/Sao_Paulo') + interval '7 days') at time zone 'America/Sao_Paulo'
    group by s.id,t.name order by s.started_at desc`, [ownerId])
  return rows.map((row) => ({
    id: row.id, templateName: row.template_name, status: row.status,
    startedAt: row.started_at, endedAt: row.ended_at,
    exercises: row.exercises, sets: row.sets, volumeKg: Number(row.volume_kg),
  }))
}
