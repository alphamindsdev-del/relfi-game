import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { deckSchema } from '../lib/validation'
import { generateId } from '../lib/ids'
import { now } from '../lib/db'
import { AuthMiddleware } from '../middleware/auth'
import { AdminOnly } from '../middleware/admin-only'
import type { Env } from '../index'

export const decksRoutes = new Hono<{ Bindings: Env }>()

decksRoutes.get('/', async (c) => {
  const published = c.req.query('published')
  let query = `
    SELECT d.*, 
      (SELECT COUNT(*) FROM statement_cards WHERE deck_id = d.id AND is_active = 1) as card_count,
      (SELECT COUNT(*) FROM deck_categories WHERE deck_id = d.id) as category_count
    FROM decks d
  `
  const params: unknown[] = []

  if (published === 'true') {
    query += ' WHERE d.is_published = 1'
  }

  query += ' ORDER BY d.created_at DESC'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})

decksRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const deck = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(id).first()
  if (!deck) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  const { results: categories } = await c.env.DB.prepare(
    `SELECT c.* FROM categories c
     JOIN deck_categories dc ON c.id = dc.category_id
     WHERE dc.deck_id = ? AND c.is_active = 1`
  ).bind(id).all()

  const { results: cards } = await c.env.DB.prepare(
    'SELECT * FROM statement_cards WHERE deck_id = ? AND is_active = 1 ORDER BY sort_order ASC'
  ).bind(id).all()

  return c.json({ ...deck, categories, cards })
})

decksRoutes.post('/', AuthMiddleware, AdminOnly, zValidator('json', deckSchema), async (c) => {
  const data = c.req.valid('json')
  const user = c.get('user')
  const id = generateId()
  const timestamp = now()

  await c.env.DB.prepare(
    `INSERT INTO decks (id, title, description, is_published, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  ).bind(id, data.title, data.description || null, user.user_id, timestamp, timestamp).run()

  if (data.category_ids && data.category_ids.length > 0) {
    const stmt = c.env.DB.prepare(
      'INSERT OR IGNORE INTO deck_categories (deck_id, category_id) VALUES (?, ?)'
    )
    for (const categoryId of data.category_ids) {
      await stmt.bind(id, categoryId).run()
    }
  }

  const deck = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(id).first()
  return c.json(deck, 201)
})

decksRoutes.patch('/:id', AuthMiddleware, AdminOnly, zValidator('json', deckSchema.partial()), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  const existing = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  const updates: string[] = ['updated_at = ?']
  const values: unknown[] = [now()]

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && key !== 'category_ids') {
      updates.push(`${key} = ?`)
      values.push(value)
    }
  }

  values.push(id)
  await c.env.DB.prepare(`UPDATE decks SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

  if (data.category_ids) {
    await c.env.DB.prepare('DELETE FROM deck_categories WHERE deck_id = ?').bind(id).run()
    const stmt = c.env.DB.prepare('INSERT INTO deck_categories (deck_id, category_id) VALUES (?, ?)')
    for (const categoryId of data.category_ids) {
      await stmt.bind(id, categoryId).run()
    }
  }

  const deck = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(id).first()
  return c.json(deck)
})

decksRoutes.delete('/:id', AuthMiddleware, AdminOnly, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  await c.env.DB.prepare('DELETE FROM decks WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

decksRoutes.post('/:id/publish', AuthMiddleware, AdminOnly, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  await c.env.DB.prepare('UPDATE decks SET is_published = 1, updated_at = ? WHERE id = ?')
    .bind(now(), id).run()

  return c.json({ success: true, published: true })
})
