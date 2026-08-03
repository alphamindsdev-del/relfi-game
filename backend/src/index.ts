import { Hono } from 'hono'
import { cors } from 'hono/cors'
// import { csrf } from 'hono/csrf'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth'
import { categoriesRoutes } from './routes/categories'
import { decksRoutes } from './routes/decks'
import { cardsRoutes } from './routes/cards'
import { roomsRoutes } from './routes/rooms'
import { usersRoutes } from './routes/users'
import { wsTicketRoute } from './routes/ws-ticket'
import { uploadRoutes } from './routes/upload'
import type { JwtPayload } from './lib/jwt'

export type Env = {
  DB: D1Database
  RELFI_ROOM_CODES: KVNamespace
  RELFI_WS_TICKETS: KVNamespace
  RELFI_MAGIC_TOKENS: KVNamespace
  RELFI_RATE_LIMITS: KVNamespace
  ASSETS: R2Bucket
  ROOM_STATE: DurableObjectNamespace<import('./durable/RoomState').RoomState>
  JWT_SECRET: string
  ALPHAMINDS_AUTH_URL?: string
  ENVIRONMENT: 'development' | 'production'
}

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload
  }
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', logger())
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*'
    const allowed = [
      'https://relfigames.com',
      'https://*.alphaminds.com',
      'https://*.workers.dev',
      'https://*.pages.dev',
      'http://localhost:5173',
      'http://localhost:8080',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
    ]
    if (allowed.some((a) => {
      if (a.includes('*')) {
        const suffix = a.split('*')[1]
        return origin.endsWith(suffix)
      }
      return origin === a
    })) return origin
    return null
  },
  credentials: true,
}))
// app.use('*', csrf({ origin: (o) => true }))  // enable for production

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

app.route('/api/auth', authRoutes)
app.route('/api/categories', categoriesRoutes)
app.route('/api/decks', decksRoutes)
app.route('/api/decks', cardsRoutes)
app.route('/api/rooms', roomsRoutes)
app.route('/api/rooms', wsTicketRoute)
app.route('/api/users', usersRoutes)
app.route('/api', uploadRoutes)

export default app

export { RoomState } from './durable/RoomState'
