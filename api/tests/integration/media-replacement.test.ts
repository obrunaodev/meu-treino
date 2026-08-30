import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import sharp from 'sharp'

const API = process.env.API_URL ?? 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? 'postgres://treino:change-me@localhost:5432/treino'
const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''
const EMAIL = 'media-replacement@exemplo.com'
const up = await fetch(`${API}/health`).then((response) => response.ok).catch(() => false)
const config = up
  ? await fetch(`${API}/auth/config`).then((response) => response.json()) as { devLogin: boolean }
  : { devLogin: false }
const suite = up && config.devLogin && TOKEN ? describe : describe.skip

suite('exercise media replacement', () => {
  const pool = new pg.Pool({ connectionString: DB })
  const exerciseId = randomUUID()
  let ownerId = ''
  let accessToken = ''
  let activeMediaId = ''

  beforeAll(async () => {
    const login = await fetch(`${API}/auth/dev-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, email: EMAIL }),
    })
    ;({ accessToken } = await login.json() as { accessToken: string })
    const { rows } = await pool.query('select id from users where email=$1', [EMAIL])
    ownerId = rows[0].id
    await pool.query('delete from exercise_media where owner_id=$1', [ownerId])
    await pool.query('delete from exercises where owner_id=$1', [ownerId])
    await pool.query(
      `insert into exercises (id, owner_id, name) values ($1,$2,'Imagem única')`,
      [exerciseId, ownerId],
    )
  })

  afterAll(async () => {
    if (activeMediaId) {
      await fetch(`${API}/api/media/${activeMediaId}`, {
        method: 'DELETE', headers: { authorization: `Bearer ${accessToken}` },
      })
    }
    await pool.query('delete from exercise_media where owner_id=$1', [ownerId])
    await pool.query('delete from exercises where owner_id=$1', [ownerId])
    await pool.query('delete from auth_sessions where user_id=$1', [ownerId])
    await pool.query('delete from users where id=$1', [ownerId])
    await pool.end()
  })

  async function upload(color: string) {
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: color },
    }).png().toBuffer()
    const form = new FormData()
    form.append('file', new Blob([image], { type: 'image/png' }), `${color}.png`)
    return fetch(`${API}/api/media/exercises/${exerciseId}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      body: form,
    })
  }

  it('soft-deletes the previous image when a new one succeeds', async () => {
    const firstResponse = await upload('red')
    expect(firstResponse.status).toBe(201)
    const first = await firstResponse.json() as { id: string }

    const secondResponse = await upload('blue')
    expect(secondResponse.status).toBe(201)
    const second = await secondResponse.json() as { id: string }
    activeMediaId = second.id

    const { rows } = await pool.query(
      `select id, deleted_at from exercise_media where owner_id=$1 and exercise_id=$2`,
      [ownerId, exerciseId],
    )
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.id === first.id).deleted_at).not.toBeNull()
    expect(rows.find((row) => row.id === second.id).deleted_at).toBeNull()

    const oldImage = await fetch(`${API}/api/media/${first.id}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(oldImage.status).toBe(404)
  })
})
