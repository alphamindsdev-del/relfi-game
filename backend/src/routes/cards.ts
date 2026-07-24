import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { cardSchema } from '../lib/validation'
import { generateId } from '../lib/ids'
import { now } from '../lib/db'
import { AdminOnly } from '../middleware/admin-only'
import { AuthMiddleware } from '../middleware/auth'
import type { Env } from '../index'

export const cardsRoutes = new Hono<{ Bindings: Env }>()

cardsRoutes.post('/:id/cards', AuthMiddleware, AdminOnly, zValidator('json', cardSchema), async (c) => {
  const deckId = c.req.param('id')
  const data = c.req.valid('json')

  const deck = await c.env.DB.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return c.json({ error: 'Deck not found', code: 'NOT_FOUND' }, 404)

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO statement_cards (id, deck_id, statement_text, correct_category_id, friction_explanation, clue_variant, clue_payload, difficulty, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, deckId, data.statement_text, data.correct_category_id,
    data.friction_explanation || null, data.clue_variant,
    data.clue_payload || null, data.difficulty, 0, now()
  ).run()

  const card = await c.env.DB.prepare('SELECT * FROM statement_cards WHERE id = ?').bind(id).first()
  return c.json(card, 201)
})

cardsRoutes.patch('/:id/cards/:cardId', AuthMiddleware, AdminOnly, zValidator('json', cardSchema.partial()), async (c) => {
  const { id: deckId, cardId } = c.req.param()
  const data = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    'SELECT * FROM statement_cards WHERE id = ? AND deck_id = ?'
  ).bind(cardId, deckId).first()
  if (!existing) return c.json({ error: 'Card not found', code: 'NOT_FOUND' }, 404)

  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = ?`)
      values.push(value)
    }
  }

  if (updates.length > 0) {
    values.push(cardId)
    await c.env.DB.prepare(
      `UPDATE statement_cards SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run()
  }

  const card = await c.env.DB.prepare('SELECT * FROM statement_cards WHERE id = ?').bind(cardId).first()
  return c.json(card)
})

cardsRoutes.delete('/:id/cards/:cardId', AuthMiddleware, AdminOnly, async (c) => {
  const { id: deckId, cardId } = c.req.param()
  const existing = await c.env.DB.prepare(
    'SELECT * FROM statement_cards WHERE id = ? AND deck_id = ?'
  ).bind(cardId, deckId).first()
  if (!existing) return c.json({ error: 'Card not found', code: 'NOT_FOUND' }, 404)

  await c.env.DB.prepare('DELETE FROM statement_cards WHERE id = ?').bind(cardId).run()
  return c.json({ success: true })
})

cardsRoutes.post('/:id/cards/bulk-import', AuthMiddleware, AdminOnly, async (c) => {
  const deckId = c.req.param('id')
  const deck = await c.env.DB.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return c.json({ error: 'Deck not found', code: 'NOT_FOUND' }, 404)

  const formData = await c.req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return c.json({ error: 'CSV file required', code: 'INVALID_REQUEST' }, 400)
  }

  const text = await file.text()
  const lines = text.trim().split('\n')
  const header = lines[0].split(',').map((h: string) => h.trim().toLowerCase())

  const required = ['statement_text', 'correct_category_id']
  for (const col of required) {
    if (!header.includes(col)) {
      return c.json({ error: `Missing required column: ${col}`, code: 'INVALID_CSV' }, 400)
    }
  }

  let imported = 0
  const stmt = c.env.DB.prepare(
    `INSERT INTO statement_cards (id, deck_id, statement_text, correct_category_id, friction_explanation, clue_variant, clue_payload, difficulty, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c: string) => c.trim())
    if (cols.length < 2) continue

    const row: Record<string, string> = {}
    header.forEach((h: string, idx: number) => {
      row[h] = cols[idx] || ''
    })

    await stmt.bind(
      generateId(), deckId, row.statement_text, row.correct_category_id,
      row.friction_explanation || null,
      row.clue_variant || 'none',
      row.clue_payload || null,
      row.difficulty || 'medium',
      i, now()
    ).run()
    imported++
  }

  return c.json({ success: true, imported })
})
