import { createMiddleware } from 'hono/factory'
import type { Env } from '../index'

export const AdminOnly = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const user = c.get('user')
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Admin access required', code: 'FORBIDDEN' }, 403)
  }
  await next()
})
