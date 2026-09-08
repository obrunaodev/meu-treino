import { ilike, inArray } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/index.js'
import { userRoles, users } from '../db/schema.js'
import { ADMIN_ROLE, grantAdmin, revokeAdmin } from '../lib/admin-roles.js'
import { uuidParam } from '../lib/params.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

export const adminRouter = Router()

adminRouter.use(requireAuth, requireRole(ADMIN_ROLE))

const listQuery = z.object({ q: z.string().trim().max(120).optional() })

adminRouter.get('/users', async (req, res) => {
  const { q } = listQuery.parse(req.query)
  const found = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    pictureUrl: users.pictureUrl,
    createdAt: users.createdAt,
  }).from(users)
    .where(q ? ilike(users.email, `%${q}%`) : undefined)
    .orderBy(users.email)
    .limit(100)

  const assignments = found.length === 0 ? [] : await db
    .select({ userId: userRoles.userId, roleCode: userRoles.roleCode })
    .from(userRoles)
    .where(inArray(userRoles.userId, found.map((user) => user.id)))
  const rolesByUser = new Map<string, string[]>()
  for (const assignment of assignments) {
    const roles = rolesByUser.get(assignment.userId) ?? []
    roles.push(assignment.roleCode)
    rolesByUser.set(assignment.userId, roles)
  }

  res.json({ users: found.map((user) => ({ ...user, roles: rolesByUser.get(user.id) ?? [] })) })
})

adminRouter.put('/users/:userId/roles/admin', async (req, res) => {
  const changed = await grantAdmin({
    targetUserId: uuidParam(req, 'userId'),
    actorUserId: req.userId!,
    source: 'admin_api',
  })
  res.status(changed ? 201 : 200).json({ role: ADMIN_ROLE, assigned: true })
})

adminRouter.delete('/users/:userId/roles/admin', async (req, res) => {
  await revokeAdmin({
    targetUserId: uuidParam(req, 'userId'),
    actorUserId: req.userId!,
    source: 'admin_api',
  })
  res.status(204).end()
})
