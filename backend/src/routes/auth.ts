import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { signToken, verifyToken } from '../lib/jwt'
import { generateId, generateMagicToken } from '../lib/ids'
import { now, getUserByEmail, getUserByExternalAuth, createUser, getUserById } from '../lib/db'
import { signupSchema, loginSchema, magicLinkSchema } from '../lib/validation'
import { AppError } from '../lib/errors'
import type { Env } from '../index'

export const authRoutes = new Hono<{ Bindings: Env }>()

authRoutes.post('/signup', zValidator('json', signupSchema), async (c) => {
  const { email, password, display_name } = c.req.valid('json')

  const existing = await getUserByEmail(c.env.DB, email)
  if (existing) {
    return c.json({ error: 'Email already registered', code: 'EMAIL_EXISTS' }, 409)
  }

  const id = generateId()
  const passwordHash = await hashPassword(password, c.env)
  const createdAt = now()

  await createUser(c.env.DB, {
    id,
    display_name,
    email,
    role: 'player',
    external_auth_source: 'standalone',
    password_hash: passwordHash,
    created_at: createdAt,
  })

  const token = await signToken({ user_id: id, role: 'player' }, c.env)

  return c.json({ token, user: { id, display_name, email, role: 'player' } }, 201)
})

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')

  const user = await getUserByEmail(c.env.DB, email)
  if (!user || !user.password_hash) {
    return c.json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }, 401)
  }

  const valid = await verifyPassword(password, user.password_hash as string, c.env)
  if (!valid) {
    return c.json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }, 401)
  }

  const token = await signToken({ user_id: user.id as string, role: (user.role as 'player' | 'admin') || 'player' }, c.env)

  return c.json({
    token,
    user: {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
    },
  })
})

authRoutes.post('/magic-link', zValidator('json', magicLinkSchema), async (c) => {
  const { email } = c.req.valid('json')

  const user = await getUserByEmail(c.env.DB, email)
  if (!user) {
    return c.json({ error: 'No account with that email', code: 'NOT_FOUND' }, 404)
  }

  const token = generateMagicToken()
  await c.env.RELFI_MAGIC_TOKENS.put(`magic:${token}`, JSON.stringify({ email }), {
    expirationTtl: 900,
  })

  // In production, send email via transactional email API
  const magicUrl = `https://relfigames.com/api/auth/magic-link/verify?token=${token}`
  console.log(`Magic link for ${email}: ${magicUrl}`)

  return c.json({ message: 'Magic link sent if email exists' })
})

authRoutes.get('/magic-link/verify', async (c) => {
  const token = c.req.query('token')
  if (!token) {
    return c.json({ error: 'Missing token', code: 'INVALID_REQUEST' }, 400)
  }

  const data = await c.env.RELFI_MAGIC_TOKENS.get(`magic:${token}`)
  if (!data) {
    return c.json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' }, 401)
  }

  await c.env.RELFI_MAGIC_TOKENS.delete(`magic:${token}`)

  const { email } = JSON.parse(data)
  const user = await getUserByEmail(c.env.DB, email)
  if (!user) {
    return c.json({ error: 'User not found', code: 'NOT_FOUND' }, 404)
  }

  const jwt = await signToken({ user_id: user.id as string, role: (user.role as 'player' | 'admin') || 'player' }, c.env)
  return c.json({ token: jwt })
})

authRoutes.get('/embed-exchange', async (c) => {
  const alphamindsToken = c.req.query('alphaminds_token')
  if (!alphamindsToken) {
    return c.json({ error: 'Missing alphaminds_token', code: 'INVALID_REQUEST' }, 400)
  }

  const authUrl = c.env.ALPHAMINDS_AUTH_URL
  if (!authUrl) {
    return c.json({ error: 'AlphaMinds auth not configured', code: 'NOT_CONFIGURED' }, 500)
  }

  const response = await fetch(`${authUrl}/verify?token=${alphamindsToken}`, {
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    return c.json({ error: 'Invalid AlphaMinds token', code: 'INVALID_TOKEN' }, 401)
  }

  const alphaUser = await response.json() as { id: string; email?: string; display_name: string }

  let user = await getUserByExternalAuth(c.env.DB, 'alphaminds', alphaUser.id)
  if (!user) {
    const id = generateId()
    await createUser(c.env.DB, {
      id,
      display_name: alphaUser.display_name || 'AlphaMinds User',
      email: alphaUser.email || null,
      external_auth_source: 'alphaminds',
      external_auth_id: alphaUser.id,
      role: 'player',
      created_at: now(),
    })
    user = await getUserById(c.env.DB, id)
  }

  const jwt = await signToken({ user_id: user!.id as string, role: (user!.role as 'player' | 'admin') || 'player' }, c.env)
  return c.json({ token: jwt, user: { id: user!.id, display_name: user!.display_name, role: user!.role } })
})

async function hashPassword(password: string, env: Env): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + env.JWT_SECRET)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifyPassword(password: string, storedHash: string, env: Env): Promise<boolean> {
  const hash = await hashPassword(password, env)
  return hash === storedHash
}
