import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { updateProfileSchema } from '../lib/validation'
import { AuthMiddleware } from '../middleware/auth'
import type { Env } from '../index'

export const usersRoutes = new Hono<{ Bindings: Env }>()

usersRoutes.get('/me', AuthMiddleware, async (c) => {
  const user = c.get('user')
  const profile = await c.env.DB.prepare(
    'SELECT id, display_name, email, avatar_url, role, created_at FROM users WHERE id = ?'
  ).bind(user.user_id).first()

  if (!profile) return c.json({ error: 'User not found', code: 'NOT_FOUND' }, 404)
  return c.json(profile)
})

usersRoutes.patch('/me', AuthMiddleware, zValidator('json', updateProfileSchema), async (c) => {
  const user = c.get('user')
  const data = c.req.valid('json')

  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = ?`)
      values.push(value)
    }
  }

  if (updates.length > 0) {
    values.push(user.user_id)
    await c.env.DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
  }

  const profile = await c.env.DB.prepare(
    'SELECT id, display_name, email, avatar_url, role, created_at FROM users WHERE id = ?'
  ).bind(user.user_id).first()

  return c.json(profile)
})

usersRoutes.get('/me/stats', AuthMiddleware, async (c) => {
  const user = c.get('user')

  const stats = await c.env.DB.prepare(
    `SELECT
       COUNT(DISTINCT r.room_id) as games_played,
       COALESCE(SUM(rp.total_tokens), 0) as lifetime_tokens,
       COALESCE(AVG(rp.total_tokens), 0) as avg_tokens_per_game,
       SUM(CASE WHEN ra.is_correct = 1 THEN 1 ELSE 0 END) as correct_answers,
       COUNT(ra.id) as total_answers
     FROM room_players rp
     LEFT JOIN rooms r ON rp.room_id = r.id
     LEFT JOIN round_answers ra ON ra.user_id = rp.user_id
     WHERE rp.user_id = ?`
  ).bind(user.user_id).first()

  return c.json(stats || { games_played: 0, lifetime_tokens: 0, avg_tokens_per_game: 0, correct_answers: 0, total_answers: 0 })
})
