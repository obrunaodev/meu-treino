import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { authorizationAuditEvents, userRoles, users } from '../db/schema.js'
import { forbidden, notFound } from './http-error.js'

export const ADMIN_ROLE = 'admin'

interface RoleChange {
  targetUserId: string
  actorUserId: string | null
  source: 'admin_api' | 'server_cli'
}

/** Returns whether a user currently holds the requested authorization role. */
export async function userHasRole(userId: string, roleCode: string): Promise<boolean> {
  const [assignment] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleCode, roleCode)))
    .limit(1)
  return Boolean(assignment)
}

/** Assigns administrator access idempotently and records a security audit event. */
export async function grantAdmin(change: RoleChange): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('admin-role-management'))`)
    const [target] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.id, change.targetUserId)).limit(1)
    if (!target) throw notFound('user_not_found')

    const inserted = await tx.insert(userRoles).values({
      userId: change.targetUserId,
      roleCode: ADMIN_ROLE,
      assignedBy: change.actorUserId,
    }).onConflictDoNothing().returning({ userId: userRoles.userId })
    if (inserted.length === 0) return false

    await tx.insert(authorizationAuditEvents).values({
      actorUserId: change.actorUserId,
      targetUserId: change.targetUserId,
      action: 'admin.granted',
      metadata: { source: change.source },
    })
    return true
  })
}

/** Revokes administrator access while ensuring one active administrator remains. */
export async function revokeAdmin(change: RoleChange): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('admin-role-management'))`)
    const [assignment] = await tx.select({ userId: userRoles.userId }).from(userRoles)
      .where(and(eq(userRoles.userId, change.targetUserId), eq(userRoles.roleCode, ADMIN_ROLE)))
      .limit(1)
    if (!assignment) return false

    const [total] = await tx.select({ count: sql<number>`count(*)::int` }).from(userRoles)
      .where(eq(userRoles.roleCode, ADMIN_ROLE))
    if (total!.count <= 1) throw forbidden('last_admin_cannot_be_removed')

    await tx.delete(userRoles).where(and(
      eq(userRoles.userId, change.targetUserId),
      eq(userRoles.roleCode, ADMIN_ROLE),
    ))
    await tx.insert(authorizationAuditEvents).values({
      actorUserId: change.actorUserId,
      targetUserId: change.targetUserId,
      action: 'admin.revoked',
      metadata: { source: change.source },
    })
    return true
  })
}
