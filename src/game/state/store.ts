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
  hostUserId: string
  mode: 'solo' | 'seer_skeptic' | 'multiplayer_seer' | ''
  deckId: string
  statementText: string
  statementImageUrl: string
  categories: Category[]
  players: Player[]
  youId: string
  youRole: Role | null
  roundIndex: number
  cardId?: string
  round: Record<string, PlayerRound>
  soundOn: boolean
  clue: { variant: string; payload?: string; clueType?: string; clueContent?: string } | null
  timerSeconds: number
  timerEnd: number
  lobbyCountdown: number
  frictionExplanation: string
  revealData: any
  standings: any[]
  finalStandings: any[]
  speakingUserId: string | null
  seerPicks: Record<string, string>
  connected: boolean
  error: string | null

  setPhase: (p: Phase) => void
  toggleSound: () => void
  connect: (roomId: string, ticket: string, roomCode?: string) => void
  disconnect: () => void
  tryReconnect: () => Promise<boolean>
  createAndHost: (deckId: string, mode: string) => Promise<void>
  joinByCode: (code: string) => Promise<void>
  startLocalGame: () => void
  startGame: () => void
  setPick: (playerId: string, categoryId: string) => void
  lockIn: (playerId: string, categoryId: string) => void
  hostStartGame: () => void
  hostSetTimer: (seconds: number) => void
  hostStartPersuasion: () => void
  hostStartLockin: () => void
  hostAdvanceRound: () => void
  hostForceReveal: () => void
  hostEndGame: () => void
  hostNextSpeaker: () => void
  skepticDecision: (decision: 'follow' | 'bluff' | 'solo', trustedSeerId?: string) => void
  playerReady: () => void
  resetGame: () => void
  applyWsEvent: (event: WsServerEvent) => void
}

export const useGame = create<Store>((set, get) => ({
  phase: 'landing',
  roomCode: '',
  roomId: '',
  hostUserId: '',
  mode: '',
  deckId: '',
  statementText: '',
  statementImageUrl: '',
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
  timerEnd: 0,
  lobbyCountdown: 0,
  frictionExplanation: '',
  revealData: null,
  standings: [],
  finalStandings: [],
  speakingUserId: null as string | null,
  seerPicks: {},
  connected: false,
  error: null,

  setPhase: (p) => set({ phase: p }),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),

  connect: (roomId, ticket, roomCode?) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('relfi_room_id', roomId)
      localStorage.setItem('relfi_ticket', ticket)
      if (roomCode) localStorage.setItem('relfi_room_code', roomCode)
      const user = useAuth.getState().user
      if (user) localStorage.setItem('relfi_you_id', user.id)
    }
    set({ roomId, connected: false, error: null })
    relfiSocket.setReconnectHandler(async (code) => {
      const { ticket } = await api.joinRoom(code)
      localStorage.setItem('relfi_ticket', ticket)
      return ticket
    })
    relfiSocket.connect(roomId, ticket, roomCode)
  },

  disconnect: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('relfi_room_id')
      localStorage.removeItem('relfi_ticket')
      localStorage.removeItem('relfi_room_code')
      localStorage.removeItem('relfi_you_id')
    }
    relfiSocket.disconnect()
    set({ connected: false, players: [], round: {}, phase: 'landing', roomCode: '', roomId: '', hostUserId: '' })
  },

  tryReconnect: async () => {
    if (typeof window === 'undefined') return false
    const roomId = localStorage.getItem('relfi_room_id') || ''
    const roomCode = localStorage.getItem('relfi_room_code') || ''
    const youId = localStorage.getItem('relfi_you_id') || ''
    const oldTicket = localStorage.getItem('relfi_ticket') || ''
    if ((!roomId || roomId.length === 0) && (!roomCode || roomCode.length === 0)) return false

    set({ youId, connected: false, error: null, phase: 'lobby' })

    try {
      if (roomCode && roomCode.length > 0) {
        const { room_id, ticket } = await api.joinRoom(roomCode)
        get().connect(room_id, ticket, roomCode)
        return true
      }
      if (oldTicket && oldTicket.length > 0) {
        get().connect(roomId, oldTicket)
        return true
      }
    } catch {
      localStorage.removeItem('relfi_room_id')
      localStorage.removeItem('relfi_ticket')
      localStorage.removeItem('relfi_room_code')
    }
    return false
  },

  createAndHost: async (deckId, mode) => {
    const { room_id, room_code } = await api.createRoom(deckId, mode)
    const { ticket } = await api.joinRoom(room_code)
    const user = useAuth.getState().user
    const youId = user?.id || ''
    if (typeof window !== 'undefined') {
      localStorage.setItem('relfi_you_id', youId)
      localStorage.setItem('relfi_host_user_id', youId)
    }
    set({ roomCode: room_code, roomId: room_id, hostUserId: youId, deckId, mode: mode as any, phase: 'lobby', youId })
    const timer = get().timerSeconds
    get().connect(room_id, ticket, room_code)
    if (timer !== 45) {
      setTimeout(() => relfiSocket.send({ type: 'host:set_timer', seconds: timer }), 2000)
    }
  },

  joinByCode: async (code) => {
    const upper = code.toUpperCase()
    const room = await api.getRoom(upper)
    const { room_id, ticket } = await api.joinRoom(upper)
    const user = useAuth.getState().user
    const youId = user?.id || ''
    if (typeof window !== 'undefined') {
      localStorage.setItem('relfi_you_id', youId)
    }
    set({ roomCode: upper, roomId: room_id, mode: room.mode as any, phase: 'lobby', youId })
    get().connect(room_id, ticket, upper)
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
  hostSetTimer: (seconds) => relfiSocket.send({ type: 'host:set_timer', seconds }),
  hostStartPersuasion: () => relfiSocket.send({ type: 'host:start_persuasion' }),
  hostStartLockin: () => relfiSocket.send({ type: 'host:start_lockin' }),
  hostAdvanceRound: () => relfiSocket.send({ type: 'host:advance_round' }),
  hostForceReveal: () => relfiSocket.send({ type: 'host:force_reveal' }),
  hostEndGame: () => relfiSocket.send({ type: 'host:end_game' }),
  hostNextSpeaker: () => relfiSocket.send({ type: 'host:next_speaker' }),

  skepticDecision: (decision, trustedSeerId) => {
    relfiSocket.send({ type: 'skeptic:decision', decision, trusted_seer_id: trustedSeerId })
    set((s) => ({
      round: {
        ...s.round,
        [s.youId]: { ...s.round[s.youId], decision, trustedSeerId },
      },
    }))
  },

  playerReady: () => relfiSocket.send({ type: 'player:ready' }),

  resetGame: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('relfi_room_id')
      localStorage.removeItem('relfi_ticket')
      localStorage.removeItem('relfi_room_code')
      localStorage.removeItem('relfi_you_id')
    }
    relfiSocket.disconnect()
    set({
      phase: 'landing', roomCode: '', roomId: '', hostUserId: '', connected: false,
      players: [], round: {}, categories: [], youRole: null, clue: null,
      roundIndex: 0, standings: [], finalStandings: [], speakingUserId: null, seerPicks: {}, error: null,
      statementText: '', statementImageUrl: '',
    })
  },

  applyWsEvent: (event: WsServerEvent) => {
    switch (event.type) {
      case 'room:state': {
        const s = event.state
        const youId = localStorage.getItem('relfi_you_id') || ''
        const players: Player[] = (s.players || []).map((p: WsPlayer, i: number) => ({
          id: p.userId, name: p.displayName, avatarHue: (i * 60) % 360,
          tokens: p.tokens || 0, connected: p.connected, ready: p.ready,
        }))
        const me = s.players?.find((p: any) => p.userId === youId)
        const mappedPhase = mapPhase(s.phase)
        const round: Record<string, PlayerRound> = {}
        if (mappedPhase === 'statement' || mappedPhase === 'persuasion' || mappedPhase === 'lockin') {
          players.forEach((p) => {
            const serverP = s.players?.find((sp: any) => sp.userId === p.id)
            round[p.id] = {
              playerId: p.id,
              role: serverP?.role || 'solo',
              locked: serverP?.locked || false,
              pick: serverP?.pick,
              awarded: 0,
              decision: serverP?.decision,
              trustedSeerId: serverP?.trustedSeerId,
            }
          })
        }
        set({
          roomCode: s.code, roomId: s.roomId, hostUserId: s.hostUserId || '',
          mode: s.mode, deckId: s.deckId,
          players, phase: mappedPhase, roundIndex: s.roundIndex || 0,
          categories: (s.categoryOptions || []).map(apiCategoryToCategory),
          connected: true, youId,
          youRole: me?.role || null,
          statementText: s.statementText || '',
          statementImageUrl: s.statementImageUrl || '',
          timerSeconds: s.timerSeconds || 45,
          timerEnd: s.timerEnd || 0,
          speakingUserId: s.speakingUserId || null,
          seerPicks: s.players?.reduce((acc: Record<string, string>, p: any) => {
            if (p.role === 'seer' && p.pick) acc[p.userId] = p.pick
            return acc
          }, {}),
          round,
        })
        localStorage.setItem('relfi_you_id', youId)
        if (s.hostUserId) localStorage.setItem('relfi_host_user_id', s.hostUserId)
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
        const roles: Record<string, Role> = (event as any).roles || {}
        const round: Record<string, PlayerRound> = {}
        get().players.forEach((p) => {
          const role = roles[p.id] || 'solo'
          round[p.id] = { playerId: p.id, role, locked: false, awarded: 0 }
        })
        const serverYouRole = roles[get().youId]
        set({ phase: 'statement', cardId: undefined, statementText: event.statementText, statementImageUrl: event.statementImageUrl || '', roundIndex: event.roundNumber - 1, categories: cats, timerSeconds: event.timerSeconds, timerEnd: event.timerEnd || 0, round, clue: null, frictionExplanation: '', revealData: null, speakingUserId: null, seerPicks: {}, lobbyCountdown: 0, youRole: serverYouRole || get().youRole })
        break
      }

      case 'seer:clue':
        set({
          clue: {
            variant: event.clueVariant,
            payload: event.cluePayload,
            clueType: (event as any).clueType,
            clueContent: (event as any).clueContent,
          }
        })
        break

      case 'round:turn':
        set({ speakingUserId: event.speakingUserId || null })
        break

      case 'player:locked':
        set((s) => ({
          round: {
            ...s.round,
            [event.userId]: {
              ...s.round[event.userId],
              locked: true,
              pick: (event as any).pick || s.round[event.userId]?.pick,
            },
          },
        }))
        break

      case 'seer:pick_revealed':
        set((s) => ({ seerPicks: { ...s.seerPicks, [event.userId]: event.pick } }))
        break

      case 'round:timer_tick':
        set({ timerSeconds: event.secondsRemaining })
        break

      case 'round:reveal': {
        const round = { ...get().round }
        const existingPlayers = [...get().players]
        for (const a of event.perPlayerAnswers) {
          if (round[a.userId]) {
            round[a.userId] = { ...round[a.userId], role: a.role || round[a.userId].role || 'solo', pick: a.pick, awarded: a.tokensAwarded, locked: true }
          } else {
            round[a.userId] = { playerId: a.userId, role: a.role || 'solo', pick: a.pick, locked: true, awarded: a.tokensAwarded }
          }
          if (!existingPlayers.find((p) => p.id === a.userId)) {
            existingPlayers.push({
              id: a.userId, name: a.displayName, avatarHue: (existingPlayers.length * 60) % 360,
              tokens: 0, connected: true, ready: false,
            })
          }
        }
        set({
          phase: 'reveal', round, frictionExplanation: event.frictionExplanation || '', revealData: event,
          players: existingPlayers.map((p) => ({ ...p, tokens: p.tokens + (event.tokensAwarded[p.id] || 0) })),
        })
        break
      }

      case 'leaderboard:update': {
        const existing = get().players
        const merged = [...existing]
        for (const s of event.standings) {
          const idx = merged.findIndex((p) => p.id === s.userId)
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], tokens: s.tokens }
          } else {
            merged.push({
              id: s.userId,
              name: s.displayName,
              avatarHue: (merged.length * 60) % 360,
              tokens: s.tokens,
              connected: true,
              ready: false,
            })
          }
        }
        set({ phase: 'leaderboard', standings: event.standings, players: merged })
        break
      }

      case 'game:ended':
        set({
          phase: 'final', finalStandings: event.finalStandings,
          players: event.finalStandings.map((s: any, i: number) => ({ id: s.userId, name: s.displayName, avatarHue: (i * 60) % 360, tokens: s.tokens, connected: true, ready: false })),
        })
        break

      case 'lobby:countdown':
        set({ lobbyCountdown: event.seconds })
        break

      case 'host:changed':
        set({ hostUserId: event.hostUserId })
        if (typeof window !== 'undefined') localStorage.setItem('relfi_host_user_id', event.hostUserId)
        break

      case 'phase:changed': {
        const mapped = mapPhase(event.phase)
        const update: Partial<Store> = { phase: mapped }
        if ((event as any).seconds) update.timerSeconds = (event as any).seconds
        if ((event as any).timerEnd) update.timerEnd = (event as any).timerEnd
        set(update)
        if (mapped === 'persuasion' || mapped === 'lockin') {
          const round: Record<string, PlayerRound> = {}
          get().players.forEach((p) => {
            const existing = get().round[p.id]
            round[p.id] = existing || {
              playerId: p.id,
              role: 'solo',
              locked: false,
              awarded: 0,
            }
          })
          set({ round })
        }
        break
      }

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
