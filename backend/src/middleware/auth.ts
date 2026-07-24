import { createMiddleware } from 'hono/factory'
import { verifyToken } from '../lib/jwt'
import type { Env } from '../index'

export const AuthMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const cookieToken = c.req.header('Cookie')?.match(/token=([^;]+)/)?.[1]

  const token = authHeader?.replace('Bearer ', '') || cookieToken

  if (!token) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, 401)
  }

  try {
    const payload = await verifyToken(token, c.env)
    c.set('user', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' }, 401)
  }
})

export const OptionalAuthMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const cookieToken = c.req.header('Cookie')?.match(/token=([^;]+)/)?.[1]
  const token = authHeader?.replace('Bearer ', '') || cookieToken

  if (token) {
    try {
      const payload = await verifyToken(token, c.env)
      c.set('user', payload)
    } catch {
      // token invalid, proceed without user
    }
  }
  await next()
})
