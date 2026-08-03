import type {
  ApiCategory,
  ApiDeck,
  ApiDeckDetail,
  ApiStatementCard,
  ApiPendingCard,
  ApiUser,
  ApiRoom,
  ApiRoomHistory,
  ApiUserStats,
} from './types'

const API_BASE = 'https://relfi-games.alphamindsdev.workers.dev/api'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)token=([^;]+)/)
  if (match) return match[1]
  return localStorage.getItem('relfi_token')
}

function setToken(token: string) {
  localStorage.setItem('relfi_token', token)
  document.cookie = `token=${token}; path=/; max-age=86400; SameSite=Lax; Secure`
}

function clearToken() {
  localStorage.removeItem('relfi_token')
  document.cookie = 'token=; path=/; max-age=0'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new ApiError(res.status, body.code || 'API_ERROR', body.error || 'Request failed')
  }

  return res.json()
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ===== Auth =====

export async function signup(email: string, password: string, displayName: string) {
  const data = await request<{ token: string; user: ApiUser }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name: displayName }),
  })
  setToken(data.token)
  return data
}

export async function login(email: string, password: string) {
  const data = await request<{ token: string; user: ApiUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.token)
  return data
}

export async function requestMagicLink(email: string) {
  return request<{ message: string }>('/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function exchangeMagicLink(token: string) {
  const data = await request<{ token: string }>(`/auth/magic-link/verify?token=${token}`)
  setToken(data.token)
  return data
}

export function logout() {
  clearToken()
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

// ===== Categories =====

export async function getCategories(): Promise<ApiCategory[]> {
  return request('/categories')
}

export async function getCategory(id: string): Promise<ApiCategory> {
  return request(`/categories/${id}`)
}

export async function createCategory(data: Partial<ApiCategory>): Promise<ApiCategory> {
  return request('/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateCategory(id: string, data: Partial<ApiCategory>): Promise<ApiCategory> {
  return request(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteCategory(id: string): Promise<void> {
  await request(`/categories/${id}`, { method: 'DELETE' })
}

// ===== Decks =====

export async function getDecks(published?: boolean): Promise<ApiDeck[]> {
  const qs = published ? '?published=true' : ''
  return request(`/decks${qs}`)
}

export async function getDeck(id: string): Promise<ApiDeckDetail> {
  return request(`/decks/${id}`)
}

export async function createDeck(data: { title: string; description?: string; category_ids?: string[] }): Promise<ApiDeck> {
  return request('/decks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateDeck(id: string, data: Partial<ApiDeck>): Promise<ApiDeck> {
  return request(`/decks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteDeck(id: string): Promise<void> {
  await request(`/decks/${id}`, { method: 'DELETE' })
}

export async function publishDeck(id: string): Promise<void> {
  await request(`/decks/${id}/publish`, { method: 'POST' })
}

// ===== Statement Cards =====

export async function createCard(deckId: string, data: {
  statement_text?: string
  statement_image_url?: string
  correct_category_id: string
  friction_explanation?: string
  clue_variant?: string
  clue_payload?: string
  clue_type?: string
  clue_content?: string
  difficulty?: string
}): Promise<ApiStatementCard> {
  return request(`/decks/${deckId}/cards`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateCard(deckId: string, cardId: string, data: Partial<ApiStatementCard>): Promise<ApiStatementCard> {
  return request(`/decks/${deckId}/cards/${cardId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function uploadClueImage(file: File): Promise<{ url: string; key: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const token = getToken()
  const res = await fetch(`${API_BASE}/upload/clue-image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new ApiError(res.status, 'UPLOAD_FAILED', body.error || 'Upload failed')
  }
  return res.json()
}

export async function uploadTutorial(file: File): Promise<{ url: string; uploadedAt: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const token = getToken()
  const res = await fetch(`${API_BASE}/upload/tutorial`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new ApiError(res.status, 'UPLOAD_FAILED', body.error || 'Upload failed')
  }
  return res.json()
}

export async function getTutorialInfo(): Promise<{ exists: boolean; url?: string; filename?: string; uploadedAt?: number }> {
  const res = await fetch(`${API_BASE}/tutorial/info`)
  if (!res.ok) return { exists: false }
  const data = await res.json()
  if (data.exists) {
    data.url = `${API_BASE}/tutorial/video`
  }
  return data
}

export const TUTORIAL_VIDEO_URL = `${API_BASE.replace('/api', '')}/api/tutorial/video`

export async function deleteCard(deckId: string, cardId: string): Promise<void> {
  await request(`/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' })
}

// ===== Statement image uploads & pending cards =====

export async function uploadStatementImage(file: File): Promise<{ url: string; key: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const token = getToken()
  const res = await fetch(`${API_BASE}/upload/statement-image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new ApiError(res.status, 'UPLOAD_FAILED', body.error || 'Upload failed')
  }
  return res.json()
}

export async function uploadBulkStatementImages(deckId: string, files: File[]): Promise<{ success: boolean; imported: number; cards: ApiPendingCard[] }> {
  const formData = new FormData()
  files.forEach((f) => formData.append('files', f))
  const token = getToken()
  const res = await fetch(`${API_BASE}/decks/${deckId}/cards/bulk-images`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new ApiError(res.status, 'IMPORT_FAILED', body.error || 'Upload failed')
  }
  return res.json()
}

export async function getPendingCards(deckId: string): Promise<ApiPendingCard[]> {
  return request(`/decks/${deckId}/cards/pending`)
}

export async function convertPendingCard(deckId: string, pendingId: string, data: Partial<ApiStatementCard>): Promise<ApiStatementCard> {
  return request(`/decks/${deckId}/cards/pending/${pendingId}/convert`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deletePendingCard(deckId: string, pendingId: string): Promise<void> {
  await request(`/decks/${deckId}/cards/pending/${pendingId}`, { method: 'DELETE' })
}

export async function bulkImportCards(deckId: string, file: File): Promise<{ success: boolean; imported: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const token = getToken()
  const res = await fetch(`${API_BASE}/decks/${deckId}/cards/bulk-import`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) throw new ApiError(res.status, 'IMPORT_FAILED', 'Import failed')
  return res.json()
}

// ===== Rooms =====

export async function createRoom(deckId: string, mode: string): Promise<{ room_id: string; room_code: string }> {
  return request('/rooms', {
    method: 'POST',
    body: JSON.stringify({ deck_id: deckId, mode }),
  })
}

export async function getRoom(code: string): Promise<ApiRoom> {
  return request(`/rooms/${code}`)
}

export async function joinRoom(code: string): Promise<{ room_id: string; ticket: string }> {
  return request(`/rooms/${code}/join`, { method: 'POST' })
}

export async function getRoomHistory(roomId: string): Promise<ApiRoomHistory[]> {
  return request(`/rooms/${roomId}/history`)
}

// ===== Users =====

export async function getMe(): Promise<ApiUser> {
  return request('/users/me')
}

export async function updateMe(data: { display_name?: string; avatar_url?: string }): Promise<ApiUser> {
  return request('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function getMyStats(): Promise<ApiUserStats> {
  return request('/users/me/stats')
}
