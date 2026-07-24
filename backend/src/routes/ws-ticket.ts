import { Hono } from 'hono'
import type { Env } from '../index'

export const wsTicketRoute = new Hono<{ Bindings: Env }>()

wsTicketRoute.get('/:id/ws', async (c) => {
  const ticket = c.req.query('ticket')
  if (!ticket) {
    return c.json({ error: 'Missing ticket', code: 'INVALID_REQUEST' }, 400)
  }

  const data = await c.env.RELFI_WS_TICKETS.get(`ticket:${ticket}`)
  if (!data) {
    return c.json({ error: 'Invalid or expired ticket', code: 'INVALID_TICKET' }, 401)
  }

  await c.env.RELFI_WS_TICKETS.delete(`ticket:${ticket}`)

  const { room_id, user_id } = JSON.parse(data)

  const doId = c.env.ROOM_STATE.idFromName(room_id)
  const stub = c.env.ROOM_STATE.get(doId)

  return stub.fetch(c.req.raw)
})
