import type { Env } from '../index'

const ALLOWED_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

export async function uploadImage(env: Env, folder: string, file: File): Promise<{ url: string; key: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  if (!ALLOWED_IMAGE_EXT.includes(ext)) {
    throw new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_EXT.join(', ')}`)
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('File too large. Max 5MB')
  }

  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  await env.ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  const url = `https://relfi-games.alphamindsdev.workers.dev/api/assets/${key}`
  return { url, key }
}
