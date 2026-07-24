import { create } from 'zustand'
import { relfiSocket } from '../lib/ws'
import * as api from '../lib/api'
import { apiCategoryToCategory } from '../lib/types'
import { useAuth } from './auth-store'
import type { Category, StatementCard, Player, PlayerRound, Phase, Role, WsPlayer, WsServerEvent } from '../lib/types'

type Store = {
  phase: Phase
  roomCode: string
  roomId: string
  mode: 'solo' | 'seer_skeptic' | 'multiplayer_seer' | ''
  deckId: string
  statementText: string
  categories: Category[]
  players: Player[]
  youId: string
  youRole: Role | null
  roundIndex: number
  cardId?: string
  round: Record<string, PlayerRound>
  soundOn: boolean
  clue: { variant: string; payload?: string } | null
  timerSeconds: number
  frictionExplanation: string
  revealData: any
  standings: any[]
  finalStandings: any[]
  connected: boolean
  error: string | null

  setPhase: (p: Phase) => void
  toggleSound: () => void
  connect: (roomId: string, ticket: string) => void
  disconnect: () => void
  createAndHost: (deckId: string, mode: string) => Promise<void>
  joinByCode: (code: string) => Promise<void>
  startLocalGame: () => void
  startGame: () => void
  setPick: (playerId: string, categoryId: string) => void
  lockIn: (playerId: string, categoryId: string) => void
  hostStartGame: () => void
  hostAdvanceRound: () => void
  hostNextSpeaker: (userId: string) => void
  skepticDecision: (decision: 'follow' | 'bluff' | 'solo', trustedSeerId?: string) => void
  playerReady: () => void
  resetGame: () => void
  applyWsEvent: (event: WsServerEvent) => void
}

export const useGame = create<Store>((set, get) => ({
  phase: 'landing',
  roomCode: '',
  roomId: '',
  mode: '',
  deckId: '',
  statementText: '',
  categories: [],
  players: [],
  youId: '',
  youRole: null,
  roundIndex: 0,
  cardId: undefined,
  round: {},
  soundOn: false,
  clue: null,
  timerSeconds: 45,
  frictionExplanation: '',
  revealData: null,
  standings: [],
  finalStandings: [],
  connected: false,
  error: null,

  setPhase: (p) => set({ phase: p }),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),

  connect: (roomId, ticket) => {
    set({ roomId, connected: false, error: null })
    relfiSocket.connect(roomId, ticket)
  },

  disconnect: () => {
    relfiSocket.disconnect()
    set({ connected: false, players: [], round: {}, phase: 'landing', roomCode: '', roomId: '' })
  },

  createAndHost: async (deckId, mode) => {
    const { room_id, room_code } = await api.createRoom(deckId, mode)
    const { ticket } = await api.joinRoom(room_code)
    const user = useAuth.getState().user
    set({ roomCode: room_code, roomId: room_id, deckId, mode: mode as any, phase: 'lobby', youId: user?.id || '' })
    relfiSocket.connect(room_id, ticket)
  },

  joinByCode: async (code) => {
    const upper = code.toUpperCase()
    const room = await api.getRoom(upper)
    const { room_id, ticket } = await api.joinRoom(upper)
    const user = useAuth.getState().user
    set({ roomCode: upper, roomId: room_id, mode: room.mode as any, phase: 'lobby', youId: user?.id || '' })
    relfiSocket.connect(room_id, ticket)
  },

  startLocalGame: () => set({ phase: 'lobby' }),
  startGame: () => set({ phase: 'lobby', roomCode: 'LOCAL' }),

  setPick: (playerId, categoryId) => {
    set((s) => ({ round: { ...s.round, [playerId]: { ...s.round[playerId], pick: categoryId } } }))
  },

  lockIn: (playerId, categoryId) => {
    set((s) => ({
      round: { ...s.round, [playerId]: { ...s.round[playerId], pick: categoryId, locked: true } },
    }))
    relfiSocket.send({ type: 'player:lock_answer', category_id: categoryId })
  },

  hostStartGame: () => relfiSocket.send({ type: 'host:start_game' }),
  hostAdvanceRound: () => relfiSocket.send({ type: 'host:advance_round' }),
  hostNextSpeaker: (userId) => relfiSocket.send({ type: 'host:next_speaker', userId }),

  skepticDecision: (decision, trustedSeerId) => {
    relfiSocket.send({ type: 'skeptic:decision', decision, trusted_seer_id: trustedSeerId })
  },

  playerReady: () => relfiSocket.send({ type: 'player:ready' }),

  resetGame: () => {
    relfiSocket.disconnect()
    set({
      phase: 'landing', roomCode: '', roomId: '', connected: false,
      players: [], round: {}, categories: [], youRole: null, clue: null,
      roundIndex: 0, standings: [], finalStandings: [], error: null,
    })
  },

  applyWsEvent: (event: WsServerEvent) => {
    switch (event.type) {
      case 'room:state': {
        const s = event.state
        const players: Player[] = (s.players || []).map((p: WsPlayer, i: number) => ({
          id: p.userId, name: p.displayName, avatarHue: (i * 60) % 360,
          tokens: p.tokens || 0, connected: p.connected, ready: p.ready,
        }))
        set({
          roomCode: s.code, roomId: s.roomId, mode: s.mode, deckId: s.deckId,
          players, phase: mapPhase(s.phase), roundIndex: s.roundIndex || 0,
          categories: (s.categoryOptions || []).map(apiCategoryToCategory), connected: true,
        })
        break
      }

      case 'player:joined': {
        const state = get()
        if (!state.players.find((p) => p.id === event.userId)) {
          set({ players: [...state.players, { id: event.userId, name: event.displayName, avatarHue: (state.players.length * 60) % 360, tokens: 0, connected: true, ready: false }] })
        }
        break
      }

      case 'player:left':
        set((s) => ({ players: s.players.filter((p) => p.id !== event.userId) }))
        break

      case 'player:connection':
        set((s) => ({ players: s.players.map((p) => p.id === event.userId ? { ...p, connected: event.status === 'connected' } : p) }))
        break

      case 'player:ready_state':
        set((s) => ({ players: s.players.map((p) => p.id === event.userId ? { ...p, ready: event.ready } : p) }))
        break

      case 'round:role_assigned':
        set({ youRole: event.role })
        break

      case 'round:started': {
        const cats = (event.categoryOptions || []).map(apiCategoryToCategory)
        const round: Record<string, PlayerRound> = {}
        get().players.forEach((p) => {
          round[p.id] = { playerId: p.id, role: 'solo', locked: false, awarded: 0 }
        })
        set({ phase: 'statement', cardId: undefined, statementText: event.statementText, roundIndex: event.roundNumber - 1, categories: cats, timerSeconds: event.timerSeconds, round, clue: null, frictionExplanation: '', revealData: null })
        break
      }

      case 'seer:clue':
        set({ clue: { variant: event.clueVariant, payload: event.cluePayload } })
        break

      case 'round:timer_tick':
        set({ timerSeconds: event.secondsRemaining })
        break

      case 'round:reveal': {
        const round = { ...get().round }
        event.perPlayerAnswers.forEach((a: any) => {
          if (round[a.userId]) {
            round[a.userId] = { ...round[a.userId], pick: a.pick, awarded: a.tokensAwarded, locked: true }
          }
        })
        set({
          phase: 'reveal', round, frictionExplanation: event.frictionExplanation || '', revealData: event,
          players: get().players.map((p) => ({ ...p, tokens: p.tokens + (event.tokensAwarded[p.id] || 0) })),
        })
        break
      }

      case 'leaderboard:update':
        set({
          phase: 'leaderboard', standings: event.standings,
          players: get().players.map((p) => {
            const e = event.standings.find((s: any) => s.userId === p.id)
            return e ? { ...p, tokens: e.tokens } : p
          }),
        })
        break

      case 'game:ended':
        set({
          phase: 'final', finalStandings: event.finalStandings,
          players: event.finalStandings.map((s: any, i: number) => ({ id: s.userId, name: s.displayName, avatarHue: (i * 60) % 360, tokens: s.tokens, connected: true, ready: false })),
        })
        break

      case 'error':
        set({ error: event.message })
        break
    }
  },
}))

function mapPhase(backendPhase: string): Phase {
  const map: Record<string, Phase> = {
    lobby: 'lobby',
    role_assignment: 'role-reveal',
    statement_revealed: 'statement',
    persuasion: 'persuasion',
    decision: 'lockin',
    reveal: 'reveal',
    leaderboard: 'leaderboard',
    game_ended: 'final',
  }
  return map[backendPhase] || 'landing'
}

export function useYouRound() {
  const round = useGame((s) => s.round)
  const youId = useGame((s) => s.youId)
  return round[youId]
}

export function useCurrentCard(): StatementCard | undefined {
  return undefined
}
