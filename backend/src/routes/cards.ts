import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { cardSchema } from '../lib/validation'
import { generateId } from '../lib/ids'
import { now } from '../lib/db'
import { uploadImage } from '../lib/uploads'
import { AdminOnly } from '../middleware/admin-only'
import { AuthMiddleware } from '../middleware/auth'
import type { Env } from '../index'

export const cardsRoutes = new Hono<{ Bindings: Env }>()

function computeClueFields(data: {
  clue_type?: string; clue_content?: string;
  clue_variant?: string; clue_payload?: string | null;
}): { clue_variant: string; clue_payload: string | null; clue_type: string; clue_content: string | null } {
  const clueType = data.clue_type || 'none'
  let clueVariant = data.clue_variant || 'none'
  let cluePayload = data.clue_payload ?? null

  if (clueType === 'text' && !clueVariant.startsWith('partial')) {
    clueVariant = 'partial_text'
    cluePayload = JSON.stringify({ text: data.clue_content || '' })
  } else if (clueType === 'image') {
    clueVariant = 'image_clue'
    cluePayload = data.clue_content || null
  } else if (clueType === 'none') {
    clueVariant = 'none'
    cluePayload = null
  }

  return { clue_variant: clueVariant, clue_payload: cluePayload, clue_type: clueType, clue_content: data.clue_content || null }
}

cardsRoutes.post('/:id/cards', AuthMiddleware, AdminOnly, zValidator('json', cardSchema), async (c) => {
  const deckId = c.req.param('id')
  const data = c.req.valid('json')

  const deck = await c.env.DB.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return c.json({ error: 'Deck not found', code: 'NOT_FOUND' }, 404)

  const hasText = (data.statement_text || '').trim().length > 0
  const hasImage = !!data.statement_image_url
  if (!hasText && !hasImage) {
    return c.json({ error: 'Provide a statement text or statement image', code: 'INVALID_REQUEST' }, 400)
  }

  const { clue_variant, clue_payload, clue_type, clue_content } = computeClueFields(data)
  const id = generateId()

  const nextRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM statement_cards WHERE deck_id = ?'
  ).bind(deckId).first<{ next_order: number }>()
  const sortOrder = nextRow?.next_order || 1

  await c.env.DB.prepare(
    `INSERT INTO statement_cards (id, deck_id, statement_text, statement_image_url, correct_category_id, friction_explanation, clue_variant, clue_payload, clue_type, clue_content, difficulty, sort_order, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(
    id, deckId, data.statement_text || '', data.statement_image_url || null,
    data.correct_category_id, data.friction_explanation || null, clue_variant,
    clue_payload, clue_type, clue_content, data.difficulty, sortOrder, now()
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

  const { clue_variant, clue_payload, clue_type, clue_content } = computeClueFields(data)
  const merged = {
    ...data,
    statement_image_url: data.statement_image_url === '' ? null : data.statement_image_url,
    clue_variant,
    clue_payload,
    clue_type,
    clue_content,
  }

  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(merged)) {
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

  await c.env.DB.prepare('UPDATE statement_cards SET is_active = 0 WHERE id = ?').bind(cardId).run()
  return c.json({ success: true })
})

cardsRoutes.post('/:id/cards/bulk-images', AuthMiddleware, AdminOnly, async (c) => {
  const deckId = c.req.param('id')
  const deck = await c.env.DB.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return c.json({ error: 'Deck not found', code: 'NOT_FOUND' }, 404)

  const formData = await c.req.formData()
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return c.json({ error: 'At least one image required', code: 'INVALID_REQUEST' }, 400)
  }

  const created: any[] = []
  const stmt = c.env.DB.prepare(
    'INSERT INTO pending_cards (id, deck_id, statement_image_url, filename, created_at) VALUES (?, ?, ?, ?, ?)'
  )

  for (const file of files) {
    let url: string
    try {
      const result = await uploadImage(c.env, 'statements', file)
      url = result.url
    } catch (e: any) {
      return c.json({ error: `${file.name || 'image'}: ${e.message}`, code: 'INVALID_REQUEST' }, 400)
    }
    const id = generateId()
    await stmt.bind(id, deckId, url, file.name || null, now()).run()
    created.push({ id, deck_id: deckId, statement_image_url: url, filename: file.name || null })
  }

  return c.json({ success: true, imported: created.length, cards: created })
})

cardsRoutes.get('/:id/cards/pending', AuthMiddleware, AdminOnly, async (c) => {
  const deckId = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM pending_cards WHERE deck_id = ? ORDER BY created_at DESC'
  ).bind(deckId).all()
  return c.json(results)
})

cardsRoutes.delete('/:id/cards/pending/:pendingId', AuthMiddleware, AdminOnly, async (c) => {
  const { id: deckId, pendingId } = c.req.param()
  const existing = await c.env.DB.prepare(
    'SELECT id FROM pending_cards WHERE id = ? AND deck_id = ?'
  ).bind(pendingId, deckId).first()
  if (!existing) return c.json({ error: 'Pending card not found', code: 'NOT_FOUND' }, 404)

  await c.env.DB.prepare('DELETE FROM pending_cards WHERE id = ?').bind(pendingId).run()
  return c.json({ success: true })
})

cardsRoutes.post('/:id/cards/pending/:pendingId/convert', AuthMiddleware, AdminOnly, zValidator('json', cardSchema), async (c) => {
  const { id: deckId, pendingId } = c.req.param()
  const data = c.req.valid('json')

  const pending = await c.env.DB.prepare(
    'SELECT * FROM pending_cards WHERE id = ? AND deck_id = ?'
  ).bind(pendingId, deckId).first()
  if (!pending) return c.json({ error: 'Pending card not found', code: 'NOT_FOUND' }, 404)

  const { clue_variant, clue_payload, clue_type, clue_content } = computeClueFields(data)
  const id = generateId()

  const nextRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM statement_cards WHERE deck_id = ?'
  ).bind(deckId).first<{ next_order: number }>()
  const sortOrder = nextRow?.next_order || 1

  await c.env.DB.prepare(
    `INSERT INTO statement_cards (id, deck_id, statement_text, statement_image_url, correct_category_id, friction_explanation, clue_variant, clue_payload, clue_type, clue_content, difficulty, sort_order, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(
    id, deckId, data.statement_text || '', pending.statement_image_url,
    data.correct_category_id, data.friction_explanation || null, clue_variant,
    clue_payload, clue_type, clue_content, data.difficulty, sortOrder, now()
  ).run()

  await c.env.DB.prepare('DELETE FROM pending_cards WHERE id = ?').bind(pendingId).run()

  const card = await c.env.DB.prepare('SELECT * FROM statement_cards WHERE id = ?').bind(id).first()
  return c.json(card, 201)
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
    `INSERT INTO statement_cards (id, deck_id, statement_text, correct_category_id, friction_explanation, clue_variant, clue_payload, clue_type, clue_content, difficulty, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c: string) => c.trim())
    if (cols.length < 2) continue

    const row: Record<string, string> = {}
    header.forEach((h: string, idx: number) => {
      row[h] = cols[idx] || ''
    })

    const clueType = row.clue_type || 'none'
    const clueContent = row.clue_content || null
    let clueVariant = row.clue_variant || 'none'
    let cluePayload = row.clue_payload || null

    if (clueType === 'text') {
      clueVariant = 'partial_text'
      cluePayload = JSON.stringify({ text: clueContent || '' })
    } else if (clueType === 'image') {
      clueVariant = 'image_clue'
      cluePayload = clueContent
    }

    await stmt.bind(
      generateId(), deckId, row.statement_text, row.correct_category_id,
      row.friction_explanation || null,
      clueVariant, cluePayload,
      clueType, clueContent,
      row.difficulty || 'medium',
      i, now()
    ).run()
    imported++
  }

  return c.json({ success: true, imported })
})
