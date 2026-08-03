import { createMiddleware } from 'hono/factory'
import type { Env } from '../index'

export const AdminOnly = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, 401)
  }

  const dbUser = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?')
    .bind(user.user_id)
    .first<{ role: string }>()

  if (!dbUser || dbUser.role !== 'admin') {
    return c.json({ error: 'Admin access required', code: 'FORBIDDEN' }, 403)
  }

  await next()
})
