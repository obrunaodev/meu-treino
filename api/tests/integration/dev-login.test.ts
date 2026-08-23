import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

/**
 * O login provisório é um bypass de autenticação deliberado. O que precisa
 * ficar provado não é que ele funciona — é que ele NÃO funciona sem o token,
 * e que a sessão que ele emite é indistinguível da do Google.
 */

const API = process.env.API_URL ?? 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? 'postgres://treino:change-me@localhost:5432/treino'

const up = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false)
const config = up
  ? ((await fetch(`${API}/auth/config`).then((r) => r.json())) as { google: boolean; devLogin: boolean })
  : { google: false, devLogin: false }

const suite = up && config.devLogin ? describe : describe.skip
const EMAIL = 'provisorio@exemplo.com'

const post = (body: unknown) =>
  fetch(`${API}/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

suite('login provisório', () => {
  const pool = new pg.Pool({ connectionString: DB })
  const token = process.env.DEV_LOGIN_TOKEN ?? ''

  beforeAll(async () => {
    await pool.query("delete from users where google_sub = $1", [`dev:${EMAIL}`])
  })

  afterAll(async () => {
    await pool.query("delete from users where google_sub = $1", [`dev:${EMAIL}`])
    await pool.end()
  })

  it('recusa sem token', async () => {
    const res = await post({ token: '', email: EMAIL })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'token_invalido' })
  })

  it('recusa com token errado do mesmo comprimento', async () => {
    const res = await post({ token: 'x'.repeat(token.length), email: EMAIL })
    expect(res.status).toBe(401)
  })

  it('recusa e-mail malformado antes de olhar o token', async () => {
    const res = await post({ token, email: 'nao-e-email' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'payload_invalido' })
  })

  it('com o token certo, cria o usuário e emite sessão completa', async () => {
    const res = await post({ token, email: EMAIL })
    expect(res.status).toBe(200)

    const body = (await res.json()) as { accessToken: string; expiresIn: number }
    expect(body.accessToken).toMatch(/^ey/)
    expect(body.expiresIn).toBeGreaterThan(0)

    // O cookie de refresh precisa ter as mesmas defesas do fluxo do Google.
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('treino_refresh=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Path=/auth')

    const { rows } = await pool.query('select google_sub, email from users where email=$1', [EMAIL])
    // Prefixo dev: mantém as contas provisórias apagáveis num DELETE só.
    expect(rows[0]).toMatchObject({ google_sub: `dev:${EMAIL}`, email: EMAIL })
  })

  it('o access token emitido abre as rotas autenticadas', async () => {
    const { accessToken } = (await post({ token, email: EMAIL }).then((r) => r.json())) as {
      accessToken: string
    }
    const me = await fetch(`${API}/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ email: EMAIL })
  })

  it('logar duas vezes reaproveita o mesmo usuário', async () => {
    await post({ token, email: EMAIL })
    const { rows } = await pool.query('select count(*)::int as n from users where email=$1', [EMAIL])
    expect(rows[0].n).toBe(1)
  })
})

describe('/auth/config', () => {
  it.skipIf(!up)('declara os caminhos de login disponíveis', async () => {
    const res = await fetch(`${API}/auth/config`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      google: expect.any(Boolean),
      devLogin: expect.any(Boolean),
    })
  })
})
