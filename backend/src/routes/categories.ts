import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { categorySchema } from '../lib/validation'
import { generateId } from '../lib/ids'
import { now } from '../lib/db'
import { AuthMiddleware } from '../middleware/auth'
import { AdminOnly } from '../middleware/admin-only'
import type { Env } from '../index'

export const categoriesRoutes = new Hono<{ Bindings: Env }>()

categoriesRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM categories ORDER BY short_code ASC'
  ).all()
  return c.json(results)
})

categoriesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const category = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE id = ?'
  ).bind(id).first()
  if (!category) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  return c.json(category)
})

categoriesRoutes.post('/', AuthMiddleware, AdminOnly, zValidator('json', categorySchema), async (c) => {
  const data = c.req.valid('json')
  const user = c.get('user')
  const id = generateId()

  await c.env.DB.prepare(
    `INSERT INTO categories (id, name, short_code, color_hex, icon_key, definition, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, data.name, data.short_code || null, data.color_hex, data.icon_key || null, data.definition || null, user.user_id, now()).run()

  const category = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first()
  return c.json(category, 201)
})

categoriesRoutes.patch('/:id', AuthMiddleware, AdminOnly, zValidator('json', categorySchema.partial()), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  const existing = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = ?`)
      values.push(value)
    }
  }

  if (updates.length > 0) {
    values.push(id)
    await c.env.DB.prepare(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
  }

  const category = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first()
  return c.json(category)
})

categoriesRoutes.delete('/:id', AuthMiddleware, AdminOnly, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})
