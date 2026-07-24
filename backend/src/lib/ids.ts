import { nanoid } from 'nanoid'

export function generateId(): string {
  return nanoid(21)
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function generateTicket(): string {
  return nanoid(32)
}

export function generateMagicToken(): string {
  return nanoid(48)
}
