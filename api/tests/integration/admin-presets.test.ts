import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const API = process.env.API_URL ?? 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? 'postgres://treino:change-me@localhost:5432/treino'
const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''
const EMAIL = 'preset-admin@exemplo.com'
const SLUG = 'admin-test-ab-strength-30'
const up = await fetch(`${API}/health`).then((response) => response.ok).catch(() => false)
const suite = up && TOKEN ? describe : describe.skip

function auth(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

function body(name = 'Admin test') {
  return {
    slug: SLUG, name: { 'pt-BR': name, 'en-US': name }, split: 'ab', focus: 'strength',
    durationMinutes: 30, level: 'beginner', isPublished: false,
    workouts: [{
      name: { 'pt-BR': 'Treino A', 'en-US': 'Workout A' },
      focus: { 'pt-BR': 'Superior', 'en-US': 'Upper body' },
      items: [{
        catalogExerciseId: 165, sets: 3, repMin: 4, repMax: 6,
        rirTarget: 2, restSeconds: 120, trackingMode: 'compact', loadPerSide: false,
      }],
    }],
  }
}

suite('administrator preset CRUD', () => {
  const pool = new pg.Pool({ connectionString: DB })
  let token = ''

  beforeAll(async () => {
    await pool.query('delete from training_presets where slug=$1', [SLUG])
    const login = await fetch(`${API}/auth/dev-login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, email: EMAIL }),
    })
    token = ((await login.json()) as { accessToken: string }).accessToken
    const { rows } = await pool.query('select id from users where email=$1', [EMAIL])
    await pool.query("insert into user_roles (user_id, role_code) values ($1, 'admin') on conflict do nothing", [rows[0].id])
  })

  afterAll(async () => {
    await pool.query('delete from training_presets where slug=$1', [SLUG])
    await pool.query('delete from users where email=$1', [EMAIL])
    await pool.end()
  })

  it('creates, updates, reads, and deletes a complete preset', async () => {
    const created = await fetch(`${API}/api/admin/presets`, {
      method: 'POST', headers: auth(token), body: JSON.stringify(body()),
    })
    expect(created.status).toBe(201)
    const preset = await created.json() as { id: string; workouts: Array<{ items: unknown[] }> }
    expect(preset.workouts[0]!.items).toHaveLength(1)

    const updated = await fetch(`${API}/api/admin/presets/${preset.id}`, {
      method: 'PUT', headers: auth(token), body: JSON.stringify(body('Updated preset')),
    })
    expect(updated.status).toBe(200)
    expect((await updated.json() as { name: Record<string, string> }).name['en-US']).toBe('Updated preset')

    const removed = await fetch(`${API}/api/admin/presets/${preset.id}`, {
      method: 'DELETE', headers: auth(token),
    })
    expect(removed.status).toBe(204)
  })
})
