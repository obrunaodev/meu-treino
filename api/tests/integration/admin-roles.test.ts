import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const API = process.env.API_URL ?? 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? 'postgres://treino:change-me@localhost:5432/treino'
const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''
const up = await fetch(`${API}/health`).then((response) => response.ok).catch(() => false)
const config = up
  ? await fetch(`${API}/auth/config`).then((response) => response.json()) as { devLogin: boolean }
  : { devLogin: false }
const suite = up && config.devLogin && TOKEN ? describe : describe.skip

const adminEmail = 'rbac-admin@exemplo.com'
const memberEmail = 'rbac-member@exemplo.com'

async function login(email: string): Promise<string> {
  const response = await fetch(`${API}/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, email }),
  })
  return ((await response.json()) as { accessToken: string }).accessToken
}

const authorization = (token: string) => ({ authorization: `Bearer ${token}` })

suite('admin role authorization', () => {
  const pool = new pg.Pool({ connectionString: DB })
  let adminId = ''
  let memberId = ''
  let adminToken = ''
  let memberToken = ''

  beforeAll(async () => {
    await pool.query('delete from users where email = any($1)', [[adminEmail, memberEmail]])
    adminToken = await login(adminEmail)
    memberToken = await login(memberEmail)
    const { rows } = await pool.query('select id, email from users where email = any($1)', [[adminEmail, memberEmail]])
    adminId = rows.find((row) => row.email === adminEmail).id
    memberId = rows.find((row) => row.email === memberEmail).id
    await pool.query('insert into user_roles (user_id, role_code) values ($1, $2)', [adminId, 'admin'])
  })

  afterAll(async () => {
    await pool.query('delete from users where email = any($1)', [[adminEmail, memberEmail]])
    await pool.end()
  })

  it('denies a normal authenticated user', async () => {
    const response = await fetch(`${API}/api/admin/users`, { headers: authorization(memberToken) })
    expect(response.status).toBe(403)
  })

  it('allows an admin to grant access with an audit event', async () => {
    const response = await fetch(`${API}/api/admin/users/${memberId}/roles/admin`, {
      method: 'PUT',
      headers: authorization(adminToken),
    })
    expect(response.status).toBe(201)

    const list = await fetch(`${API}/api/admin/users?q=${memberEmail}`, {
      headers: authorization(memberToken),
    })
    expect(list.status).toBe(200)
    const body = await list.json() as { users: Array<{ email: string; roles: string[] }> }
    expect(body.users).toHaveLength(1)
    expect(body.users[0]).toMatchObject({ email: memberEmail })
    expect(body.users[0]!.roles).toEqual(expect.arrayContaining(['user', 'admin']))

    const { rows } = await pool.query(
      'select action, actor_user_id, metadata from authorization_audit_events where target_user_id=$1',
      [memberId],
    )
    expect(rows).toContainEqual(expect.objectContaining({
      action: 'admin.granted',
      actor_user_id: adminId,
      metadata: { source: 'admin_api' },
    }))
  })

  it('applies revocation immediately and protects the final admin', async () => {
    const revokeOriginal = await fetch(`${API}/api/admin/users/${adminId}/roles/admin`, {
      method: 'DELETE',
      headers: authorization(memberToken),
    })
    expect(revokeOriginal.status).toBe(204)

    const denied = await fetch(`${API}/api/admin/users`, { headers: authorization(adminToken) })
    expect(denied.status).toBe(403)

    const revokeLast = await fetch(`${API}/api/admin/users/${memberId}/roles/admin`, {
      method: 'DELETE',
      headers: authorization(memberToken),
    })
    expect(revokeLast.status).toBe(403)
    expect(await revokeLast.json()).toMatchObject({ code: 'last_admin_cannot_be_removed' })
  })
})
