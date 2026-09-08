import { sql } from 'drizzle-orm'
import { db, pool } from '../src/db/index.js'
import { users } from '../src/db/schema.js'
import { grantAdmin, revokeAdmin } from '../src/lib/admin-roles.js'

async function main() {
  const operation = process.argv[2]
  const email = process.argv[3]?.trim().toLowerCase()
  if (!email || (operation !== 'grant' && operation !== 'revoke')) {
    throw new Error('usage: admin-role <grant|revoke> <registered-email>')
  }

  const matches = await db.select({ id: users.id, email: users.email }).from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(2)
  if (matches.length === 0) throw new Error(`registered user not found: ${email}`)
  if (matches.length > 1) throw new Error(`email is ambiguous: ${email}`)

  const change = { targetUserId: matches[0]!.id, actorUserId: null, source: 'server_cli' as const }
  const changed = operation === 'grant' ? await grantAdmin(change) : await revokeAdmin(change)
  process.stdout.write(`${email}: admin ${operation === 'grant' ? 'granted' : 'revoked'}${changed ? '' : ' (unchanged)'}\n`)
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => pool.end())
