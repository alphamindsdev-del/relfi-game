// ===== API Response Types (matches backend exactly) =====

export type ApiCategory = {
  id: string
  name: string
  short_code?: string
  color_hex: string
  icon_key?: string
  definition?: string
  created_by?: string
  created_at: number
}

export type ApiDeck = {
  id: string
  title: string
  description?: string
  is_published: number
  created_by: string
  created_at: number
  updated_at: number
  card_count?: number
  category_count?: number
}

export type ApiDeckDetail = ApiDeck & {
  categories: ApiCategory[]
  cards: ApiStatementCard[]
}

export type ApiStatementCard = {
  id: string
  deck_id: string
  statement_text: string
  statement_image_url?: string
  correct_category_id: string
  friction_explanation?: string
  clue_variant: 'none' | 'narrowed_list' | 'partial_text' | 'exact_answer' | 'image_clue'
  clue_payload?: string
  clue_type: 'none' | 'text' | 'image'
  clue_content?: string
  difficulty: 'easy' | 'medium' | 'hard'
  sort_order: number
  created_at: number
}

export type ApiPendingCard = {
  id: string
  deck_id: string
  statement_image_url: string
  filename?: string
  created_at: number
}

export type ApiUser = {
  id: string
  display_name: string
  email?: string
  avatar_url?: string
  role: 'player' | 'admin'
  created_at?: number
}

export type ApiRoom = {
  id: string
  room_code: string
  deck_id: string
  host_user_id: string
  mode: 'solo' | 'seer_skeptic' | 'multiplayer_seer'
  status: 'lobby' | 'in_progress' | 'completed' | 'abandoned'
  created_at: number
  ended_at?: number
  deck_title?: string
  deck_description?: string
  player_count?: number
}

export type ApiRoomPlayer = {
  user_id: string
  total_tokens: number
}

export type ApiRoomHistory = {
  id: string
  room_id: string
  statement_card_id: string
  round_number: number
  statement_text: string
  correct_category_id: string
  correct_category_name: string
  seer_user_id?: string
  skeptic_user_id?: string
  started_at: number
  completed_at?: number
  answers: ApiRoundAnswer[]
}

export type ApiRoundAnswer = {
  round_id: string
  user_id: string
  user_name: string
  chosen_category_id?: string
  chosen_category_name?: string
  decision_type?: string
  trusted_seer_id?: string
  is_correct?: number
  tokens_awarded: number
  locked_at: number
}

export type ApiUserStats = {
  games_played: number
  lifetime_tokens: number
  avg_tokens_per_game: number
  correct_answers: number
  total_answers: number
}

// ===== WebSocket Event Types =====

export type Phase =
  | 'landing'
  | 'lobby'
  | 'role-reveal'
  | 'statement'
  | 'reveal'
  | 'leaderboard'
  | 'final'

export type Role = 'seer' | 'skeptic' | 'solo'

export type WsServerEvent =
  | { type: 'room:state'; state: any }
  | { type: 'player:joined'; userId: string; displayName: string; avatarUrl?: string }
  | { type: 'player:left'; userId: string }
  | { type: 'player:connection'; userId: string; status: 'connected' | 'reconnecting' }
  | { type: 'player:ready_state'; userId: string; ready: boolean }
  | { type: 'round:role_assigned'; role: Role }
  | { type: 'round:started'; roundNumber: number; statementText: string; statementImageUrl?: string; categoryOptions: ApiCategory[]; timerSeconds: number; timerEnd?: number; roles?: Record<string, Role> }
  | { type: 'seer:clue'; clueVariant: string; cluePayload?: string; clueType?: string; clueContent?: string }
  | { type: 'round:timer_tick'; secondsRemaining: number }
  | { type: 'player:locked'; userId: string }
  | { type: 'seer:pick_revealed'; userId: string; pick: string }
  | { type: 'round:reveal'; correctCategoryId: string; perPlayerAnswers: RoundPlayerAnswer[]; frictionExplanation?: string; tokensAwarded: Record<string, number> }
  | { type: 'leaderboard:update'; standings: LeaderboardEntry[] }
  | { type: 'game:ended'; finalStandings: LeaderboardEntry[] }
  | { type: 'lobby:countdown'; seconds: number }
  | { type: 'host:changed'; hostUserId: string }
  | { type: 'phase:changed'; phase: string; timerEnd?: number }
  | { type: 'error'; code: string; message: string }

export type WsClientEvent =
  | { type: 'player:ready' }
  | { type: 'host:start_game' }
  | { type: 'host:set_timer'; seconds: number }
  | { type: 'host:set_max_rounds'; rounds: number }
  | { type: 'host:advance_round' }
  | { type: 'host:force_reveal' }
  | { type: 'host:end_game' }
  | { type: 'player:lock_answer'; category_id: string; decision?: 'follow' | 'solo'; trusted_seer_id?: string }

export type RoundPlayerAnswer = {
  userId: string
  displayName: string
  role?: Role
  pick?: string
  isCorrect: boolean
  tokensAwarded: number
  decision?: 'follow' | 'solo'
  trustedSeerId?: string
}

export type LeaderboardEntry = {
  userId: string
  displayName: string
  tokens: number
  role?: Role
}

export type WsPlayer = {
  userId: string
  displayName: string
  avatarUrl?: string
  connected: boolean
  ready: boolean
  role?: Role
  locked: boolean
  pick?: string
  decision?: 'follow' | 'solo'
  trustedSeerId?: string
  tokens: number
}

// ===== Frontend Display Types =====

export type Category = {
  id: string
  name: string
  color: string
  icon: string
  definition: string
  shortCode?: string
}

export type StatementCard = {
  id: string
  text: string
  correctCategoryId: string
  clue: ClueVariant
  friction?: string
  difficulty?: string
}

export type ClueVariant =
  | { kind: 'none' }
  | { kind: 'narrowed'; categoryIds: string[] }
  | { kind: 'partial'; text: string }
  | { kind: 'exact'; categoryId: string }
  | { kind: 'image'; url: string }

export type Player = {
  id: string
  name: string
  avatarHue: number
  tokens: number
  connected: boolean
  ready: boolean
}

export type PlayerRound = {
  playerId: string
  role: Role
  pick?: string
  locked: boolean
  awarded: number
  decision?: 'follow' | 'solo'
  trustedSeerId?: string
}

// ===== Converters =====

export function apiCategoryToCategory(api: ApiCategory): Category {
  return {
    id: api.id,
    name: api.name,
    color: api.color_hex,
    icon: iconKeyToLucide(api.icon_key || 'circle'),
    definition: api.definition || '',
    shortCode: api.short_code,
  }
}

export function apiCardToStatementCard(api: ApiStatementCard): StatementCard {
  return {
    id: api.id,
    text: api.statement_text,
    correctCategoryId: api.correct_category_id,
    clue: parseClueVariant(api.clue_variant, api.clue_payload),
    friction: api.friction_explanation,
    difficulty: api.difficulty,
  }
}

export function parseClueVariant(variant: string, payload?: string, clueType?: string, clueContent?: string): ClueVariant {
  if (clueType === 'image' || variant === 'image_clue') {
    return { kind: 'image', url: clueContent || payload || '' }
  }
  if (clueType === 'text') {
    return { kind: 'partial', text: clueContent || (payload ? JSON.parse(payload).text || '' : '') }
  }
  switch (variant) {
    case 'narrowed_list':
      return { kind: 'narrowed', categoryIds: payload ? JSON.parse(payload).narrowed_ids || [] : [] }
    case 'partial_text':
      return { kind: 'partial', text: payload ? JSON.parse(payload).text || '' : '' }
    case 'exact_answer':
      return { kind: 'exact', categoryId: payload ? JSON.parse(payload) : '' }
    default:
      return { kind: 'none' }
  }
}

export function iconKeyToLucide(key: string): string {
  const map: Record<string, string> = {
    scale: 'Scale',
    lock: 'Lock',
    zap: 'Zap',
    swords: 'Swords',
    search: 'Search',
    scroll: 'ScrollText',
    flame: 'Flame',
    messages: 'MessagesSquare',
    sparkles: 'Sparkles',
    wind: 'Wind',
    skull: 'Skull',
    circle: 'Circle',
  }
  return map[key.toLowerCase()] || 'Circle'
}
