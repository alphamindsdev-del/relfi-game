import { Hono } from 'hono'
import { AuthMiddleware } from '../middleware/auth'
import { AdminOnly } from '../middleware/admin-only'
import { uploadImage } from '../lib/uploads'
import type { Env } from '../index'

export const uploadRoutes = new Hono<{ Bindings: Env }>()

uploadRoutes.post('/upload/clue-image', AuthMiddleware, AdminOnly, async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return c.json({ error: 'Image file required', code: 'INVALID_REQUEST' }, 400)
  }

  try {
    const { url, key } = await uploadImage(c.env, 'clues', file)
    return c.json({ url, key })
  } catch (e: any) {
    return c.json({ error: e.message, code: 'INVALID_REQUEST' }, 400)
  }
})

uploadRoutes.post('/upload/statement-image', AuthMiddleware, AdminOnly, async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return c.json({ error: 'Image file required', code: 'INVALID_REQUEST' }, 400)
  }

  try {
    const { url, key } = await uploadImage(c.env, 'statements', file)
    return c.json({ url, key })
  } catch (e: any) {
    return c.json({ error: e.message, code: 'INVALID_REQUEST' }, 400)
  }
})

uploadRoutes.post('/upload/tutorial', AuthMiddleware, AdminOnly, async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return c.json({ error: 'Video file required', code: 'INVALID_REQUEST' }, 400)
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4'
  const allowed = ['mp4', 'webm', 'mov', 'avi']
  if (!allowed.includes(ext)) {
    return c.json({ error: `Invalid file type. Allowed: ${allowed.join(', ')}` }, 400)
  }

  if (file.size > 99 * 1024 * 1024) {
    return c.json({ error: 'File too large. Max 99MB' }, 400)
  }

  const key = `tutorial/latest.${ext}`
  const contentType = file.type || 'video/mp4'

  const buffer = await file.arrayBuffer()
  await c.env.ASSETS.put(key, buffer, {
    httpMetadata: { contentType },
  })

  // verify
  const head = await c.env.ASSETS.head(key)
  if (!head) {
    return c.json({ error: 'R2 put succeeded but object not found after write', code: 'R2_VERIFY_FAILED' }, 500)
  }

  const url = `https://relfi-games.alphamindsdev.workers.dev/api/tutorial/video`
  await c.env.RELFI_ROOM_CODES.put(`tutorial_meta`, JSON.stringify({
    url,
    r2key: key,
    filename: file.name,
    uploadedAt: Date.now(),
    size: buffer.byteLength,
  }))

  return c.json({ url, uploadedAt: Date.now(), size: buffer.byteLength })
})

uploadRoutes.get('/tutorial/video', async (c) => {
  const object = await c.env.ASSETS.get('tutorial/latest.mp4')
  if (!object) {
    return c.json({ error: 'Video not found in storage', debug: true }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')

  return new Response(object.body, {
    headers,
  })
})

uploadRoutes.get('/assets/:key{.+}', async (c) => {
  const key = c.req.param('key')
  if (!key) return c.json({ error: 'Asset not found', code: 'NOT_FOUND' }, 404)

  const object = await c.env.ASSETS.get(key)
  if (!object) return c.json({ error: 'Asset not found', code: 'NOT_FOUND' }, 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')

  return new Response(object.body, { headers })
})

uploadRoutes.get('/tutorial/info', async (c) => {
  try {
    const meta = await c.env.RELFI_ROOM_CODES.get(`tutorial_meta`)
    if (!meta) {
      return c.json({ exists: false })
    }
    return c.json({ exists: true, ...JSON.parse(meta) })
  } catch {
    return c.json({ exists: false })
  }
})
