import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createRoomSchema } from '../lib/validation'
import { generateId, generateRoomCode } from '../lib/ids'
import { now } from '../lib/db'
import { AuthMiddleware } from '../middleware/auth'
import { OptionalAuthMiddleware } from '../middleware/auth'
import type { Env } from '../index'

export const roomsRoutes = new Hono<{ Bindings: Env }>()

roomsRoutes.post('/', AuthMiddleware, zValidator('json', createRoomSchema), async (c) => {
  const { deck_id, mode } = c.req.valid('json')
  const user = c.get('user')

  const deck = await c.env.DB.prepare('SELECT * FROM decks WHERE id = ? AND is_published = 1')
    .bind(deck_id).first()
  if (!deck) {
    return c.json({ error: 'Deck not found or not published', code: 'NOT_FOUND' }, 404)
  }

  const roomId = generateId()
  let roomCode = generateRoomCode()

  // Ensure unique room code
  let retries = 0
  while (retries < 5) {
    const existing = await c.env.RELFI_ROOM_CODES.get(`code:${roomCode}`)
    if (!existing) break
    roomCode = generateRoomCode()
    retries++
  }

  await c.env.RELFI_ROOM_CODES.put(`code:${roomCode}`, roomId, { expirationTtl: 86400 })

  await c.env.DB.prepare(
    `INSERT INTO rooms (id, room_code, deck_id, host_user_id, mode, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'lobby', ?)`
  ).bind(roomId, roomCode, deck_id, user.user_id, mode, now()).run()

  await c.env.DB.prepare(
    `INSERT INTO room_players (room_id, user_id, total_tokens, joined_at)
     VALUES (?, ?, 0, ?)`
  ).bind(roomId, user.user_id, now()).run()

  return c.json({ room_id: roomId, room_code: roomCode }, 201)
})

roomsRoutes.get('/:code', OptionalAuthMiddleware, async (c) => {
  const code = c.req.param('code').toUpperCase()
  const roomId = await c.env.RELFI_ROOM_CODES.get(`code:${code}`)
  if (!roomId) {
    return c.json({ error: 'Room not found', code: 'NOT_FOUND' }, 404)
  }

  const room = await c.env.DB.prepare(
    `SELECT r.id, r.room_code, r.mode, r.status, r.created_at, r.deck_id, r.host_user_id,
            d.title as deck_title, d.description as deck_description
     FROM rooms r JOIN decks d ON r.deck_id = d.id
     WHERE r.id = ?`
  ).bind(roomId).first()

  if (!room) {
    return c.json({ error: 'Room not found', code: 'NOT_FOUND' }, 404)
  }

  const { results: players } = await c.env.DB.prepare(
    'SELECT user_id, total_tokens FROM room_players WHERE room_id = ? AND left_at IS NULL'
  ).bind(roomId).all()

  return c.json({ ...room, player_count: players.length, players })
})

roomsRoutes.post('/:code/join', AuthMiddleware, async (c) => {
  const code = c.req.param('code').toUpperCase()
  const user = c.get('user')

  const roomId = await c.env.RELFI_ROOM_CODES.get(`code:${code}`)
  if (!roomId) {
    return c.json({ error: 'Room not found', code: 'NOT_FOUND' }, 404)
  }

  const room = await c.env.DB.prepare(
    'SELECT id, status, mode, deck_id FROM rooms WHERE id = ?'
  ).bind(roomId).first()

  if (!room || (room.status as string) !== 'lobby') {
    return c.json({ error: 'Room is not accepting players', code: 'ROOM_CLOSED' }, 400)
  }

  const existingPlayer = await c.env.DB.prepare(
    'SELECT * FROM room_players WHERE room_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(roomId, user.user_id).first()

  if (!existingPlayer) {
    await c.env.DB.prepare(
      'INSERT INTO room_players (room_id, user_id, total_tokens, joined_at) VALUES (?, ?, 0, ?)'
    ).bind(roomId, user.user_id, now()).run()
  }

  const ticketId = generateId()
  const ticketData = JSON.stringify({ room_id: roomId, user_id: user.user_id })
  await c.env.RELFI_WS_TICKETS.put(`ticket:${ticketId}`, ticketData, { expirationTtl: 60 })

  return c.json({ room_id: roomId, ticket: ticketId })
})

roomsRoutes.get('/:id/history', AuthMiddleware, async (c) => {
  const roomId = c.req.param('id')
  const user = c.get('user')

  const participant = await c.env.DB.prepare(
    'SELECT * FROM room_players WHERE room_id = ? AND user_id = ?'
  ).bind(roomId, user.user_id).first()

  if (!participant) {
    return c.json({ error: 'Access denied', code: 'FORBIDDEN' }, 403)
  }

  const { results: rounds } = await c.env.DB.prepare(
    `SELECT r.*, sc.statement_text, sc.correct_category_id, c.name as correct_category_name
     FROM rounds r
     JOIN statement_cards sc ON r.statement_card_id = sc.id
     JOIN categories c ON sc.correct_category_id = c.id
     WHERE r.room_id = ?
     ORDER BY r.round_number ASC`
  ).bind(roomId).all()

  for (const round of rounds) {
    const { results: answers } = await c.env.DB.prepare(
      `SELECT ra.*, u.display_name as user_name, ca.name as chosen_category_name
       FROM round_answers ra
       JOIN users u ON ra.user_id = u.id
       LEFT JOIN categories ca ON ra.chosen_category_id = ca.id
       WHERE ra.round_id = ?
       ORDER BY ra.locked_at ASC`
    ).bind(round.id).all()
    round.answers = answers
  }

  return c.json(rounds)
})
