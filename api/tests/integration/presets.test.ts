import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const API = process.env.API_URL ?? 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? 'postgres://treino:change-me@localhost:5432/treino'
const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''
const EMAIL = 'preset-reader@exemplo.com'
const up = await fetch(`${API}/health`).then((response) => response.ok).catch(() => false)
const suite = up && TOKEN ? describe : describe.skip

suite('training preset API', () => {
  const pool = new pg.Pool({ connectionString: DB })
  let accessToken = ''

  beforeAll(async () => {
    const response = await fetch(`${API}/auth/dev-login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, email: EMAIL }),
    })
    accessToken = ((await response.json()) as { accessToken: string }).accessToken
  })

  afterAll(async () => {
    await pool.query('delete from users where email=$1', [EMAIL])
    await pool.end()
  })

  it('requires authentication and lists the 18 published presets', async () => {
    expect((await fetch(`${API}/api/presets`)).status).toBe(401)
    const response = await fetch(`${API}/api/presets`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
    const body = await response.json() as { presets: Array<{ slug: string }> }
    expect(body.presets).toHaveLength(18)
  })

  it('returns an ordered preview with equipment matching', async () => {
    const response = await fetch(`${API}/api/presets/ab-strength-30-beginner-v1?stations=35,26,15,28`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      workouts: Array<{ items: Array<{ exercise: { id: number }; match: { status: string } }> }>
    }
    expect(body.workouts).toHaveLength(2)
    expect(body.workouts[0]!.items.map((item) => item.exercise.id)).toEqual([165, 95, 240, 111])
    expect(body.workouts[0]!.items.every((item) => item.match.status === 'direct')).toBe(true)
  })

  it('atomically materializes a preset as user-owned training data', async () => {
    const response = await fetch(`${API}/api/presets/ab-strength-30-beginner-v1/materialize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        programName: 'Meu AB', gymName: 'Academia do teste',
        stationCodes: ['35', '26', '15', '28', '21', '11', '08'],
        cardioNames: ['Esteira'], choices: {}, scheduleMode: 'continuous', weekdays: [],
        blockDurationWeeks: 2, periodDurationMonths: 1, defaultRestSeconds: 90,
        reminderLeadMinutes: 60, remindersEnabled: false,
      }),
    })
    expect(response.status).toBe(201)
    const { programId } = await response.json() as { programId: string }
    const { rows } = await pool.query(
      `select p.source_preset_slug,
        (select count(*)::int from templates t where t.program_id=p.id) templates,
        (select count(*)::int from template_items i join templates t on t.id=i.template_id where t.program_id=p.id) items
       from programs p where p.id=$1`,
      [programId],
    )
    expect(rows[0]).toMatchObject({
      source_preset_slug: 'ab-strength-30-beginner-v1', templates: 2, items: 8,
    })
  })
})
