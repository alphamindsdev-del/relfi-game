import { DurableObject } from 'cloudflare:workers'
import { computeScores, type Mode, type Decision } from './scoring'

export type Phase = 'lobby' | 'role_assignment' | 'statement_revealed' | 'persuasion' | 'decision' | 'reveal' | 'leaderboard' | 'game_ended'

interface PlayerState {
  userId: string
  displayName: string
  avatarUrl?: string
  connected: boolean
  ready: boolean
  role?: 'seer' | 'skeptic' | 'solo'
  locked: boolean
  pick?: string
  decision?: Decision
  trustedSeerId?: string
  tokens: number
  disconnectedAt?: number
}

interface CardData {
  id: string
  statement_text: string
  statement_image_url?: string
  correct_category_id: string
  clue_variant: string
  clue_payload?: string
  clue_type: string
  clue_content?: string
  friction_explanation?: string
}

interface RoomStorage {
  roomId: string
  deckId: string
  mode: Mode
  hostUserId: string
  code: string
  phase: Phase
  players: PlayerState[]
  roundIndex: number
  maxRounds: number
  cardIds: string[]
  currentCardId?: string
  statementText?: string
  statementImageUrl?: string
  correctCategoryId?: string
  categoryOptions: { id: string; name: string; color_hex: string; icon_key?: string; short_code?: string }[]
  skepticIndex: number
  currentSpeakerIndex: number
  timerEnd?: number
  roundStartTime?: number
  initialized: boolean
  timerSeconds: number
}

type ServerEvent =
  | { type: 'room:state'; state: any }
  | { type: 'player:joined'; userId: string; displayName: string; avatarUrl?: string }
  | { type: 'player:left'; userId: string }
  | { type: 'player:connection'; userId: string; status: 'connected' | 'disconnected' | 'reconnecting' }
  | { type: 'player:ready_state'; userId: string; ready: boolean }
  | { type: 'round:role_assigned'; role: 'seer' | 'skeptic' | 'solo' }
  | { type: 'round:started'; roundNumber: number; statementText: string; statementImageUrl?: string; categoryOptions: any[]; timerSeconds: number; timerEnd?: number; roles?: Record<string, 'seer' | 'skeptic' | 'solo'> }
  | { type: 'seer:clue'; clueVariant: string; cluePayload?: string; clueType?: string; clueContent?: string }
  | { type: 'round:turn'; speakingUserId: string }
  | { type: 'round:timer_tick'; secondsRemaining: number }
  | { type: 'player:locked'; userId: string; pick?: string }
  | { type: 'seer:pick_revealed'; userId: string; pick: string }
  | { type: 'round:reveal'; correctCategoryId: string; perPlayerAnswers: any[]; frictionExplanation?: string; tokensAwarded: Record<string, number> }
  | { type: 'leaderboard:update'; standings: any[] }
  | { type: 'game:ended'; finalStandings: any[] }
  | { type: 'lobby:countdown'; seconds: number }
  | { type: 'host:changed'; hostUserId: string }
  | { type: 'phase:changed'; phase: Phase; seconds?: number; timerEnd?: number }
  | { type: 'error'; code: string; message: string }

export class RoomState extends DurableObject {
  storage: RoomStorage
  env: any
  private sockets: Map<string, WebSocket> = new Map()
  private spectatorSockets: Set<WebSocket> = new Set()

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env)
    this.env = env
    this.storage = {
      roomId: '',
      deckId: '',
      mode: 'seer_skeptic',
      hostUserId: '',
      code: '',
      phase: 'lobby',
      players: [],
      roundIndex: 0,
      maxRounds: 10,
      cardIds: [],
      categoryOptions: [],
      skepticIndex: 0,
      currentSpeakerIndex: 0,
      initialized: false,
      timerSeconds: 45,
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/spectate') && request.headers.get('Upgrade') === 'websocket') {
      return this.handleSpectatorWebSocket(request)
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request)
    }

    return new Response('Not found', { status: 404 })
  }

  async initializeFromD1(roomId: string) {
    if (this.storage.initialized) return

    // If the DO was evicted and cold-started, restore the full in-memory
    // game state (phase, roles, picks, skepticIndex, ...) from durable
    // storage so a live game never silently resets to the lobby.
    await this.restore(roomId)
    if (this.storage.initialized) return

    const db = this.env.DB
    const room = await db.prepare(
      `SELECT r.*, d.title as deck_title FROM rooms r JOIN decks d ON r.deck_id = d.id WHERE r.id = ?`
    ).bind(roomId).first() as any

    if (!room) throw new Error('Room not found')

    const deckCats = await db.prepare(
      `SELECT c.id, c.name, c.color_hex, c.icon_key, c.short_code FROM categories c
       JOIN deck_categories dc ON c.id = dc.category_id
       WHERE dc.deck_id = ? AND c.is_active = 1`
    ).bind(room.deck_id).all()

    const deckCards = await db.prepare(
      'SELECT id FROM statement_cards WHERE deck_id = ? AND is_active = 1 ORDER BY sort_order ASC'
    ).bind(room.deck_id).all()

    const existingPlayers = await db.prepare(
      'SELECT user_id, total_tokens FROM room_players WHERE room_id = ? AND left_at IS NULL'
    ).bind(roomId).all()

    this.storage.roomId = room.id
    this.storage.deckId = room.deck_id
    this.storage.mode = room.mode as Mode
    this.storage.hostUserId = room.host_user_id
    this.storage.code = room.room_code
    this.storage.categoryOptions = (deckCats.results || []) as any[]
    this.storage.cardIds = (deckCards.results || []).map((r: any) => r.id)

    // Fisher-Yates shuffle so card order is unpredictable
    for (let i = this.storage.cardIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.storage.cardIds[i], this.storage.cardIds[j]] = [this.storage.cardIds[j], this.storage.cardIds[i]]
    }

    this.storage.maxRounds = Math.min(this.storage.cardIds.length, 10)

    for (const p of (existingPlayers.results || []) as any[]) {
      this.storage.players.push({
        userId: p.user_id,
        displayName: `Player ${p.user_id.slice(0, 4)}`,
        connected: false,
        ready: false,
        locked: false,
        tokens: p.total_tokens || 0,
      })
      this.fetchAndSetUserInfo(p.user_id).then((info) => {
        const player = this.storage.players.find((pl) => pl.userId === p.user_id)
        if (player && info) {
          player.displayName = info.displayName
          player.avatarUrl = info.avatarUrl
        }
      })
    }

    this.storage.initialized = true
    await this.persist()
  }

  private async persist() {
    try {
      await this.ctx.storage.put('state', JSON.stringify(this.storage))
    } catch {}
  }

  private async restore(roomId: string) {
    try {
      const saved = await this.ctx.storage.get<string>('state')
      if (!saved) return
      const parsed = JSON.parse(saved) as RoomStorage
      // Only restore state belonging to this room. Sockets are fresh after a
      // wakeup, so connection flags must be reset for the clients to rejoin.
      if (!parsed.roomId || parsed.roomId !== roomId) return
      for (const p of parsed.players) {
        p.connected = false
        p.disconnectedAt = undefined
      }
      this.storage = { ...this.storage, ...parsed }
    } catch {}
  }

  async handleSpectatorWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()

    const url = new URL(request.url)
    const code = url.searchParams.get('code') || ''
    const roomId = await this.env.RELFI_ROOM_CODES.get(`code:${code.toUpperCase()}`)
    if (!roomId) {
      server.close(4001, 'Room not found')
      return new Response(null, { status: 101, webSocket: client })
    }

    try {
      await this.initializeFromD1(roomId)
    } catch {
      server.close(4001, 'Room not found')
      return new Response(null, { status: 101, webSocket: client })
    }

    this.spectatorSockets.add(server)

    this.sendTo(server, { type: 'room:state', state: this.getSpectatorState() })

    server.addEventListener('close', () => {
      this.spectatorSockets.delete(server)
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()

    const ticket = new URL(request.url).searchParams.get('ticket')
    let userId = ''
    let roomId = ''

    if (ticket) {
      const ticketData = await this.env.RELFI_WS_TICKETS?.get(`ticket:${ticket}`)
      if (ticketData) {
        const parsed = JSON.parse(ticketData)
        userId = parsed.user_id
        roomId = parsed.room_id
        await this.env.RELFI_WS_TICKETS?.delete(`ticket:${ticket}`)
      }
    }

    if (!userId || !roomId) {
      server.close(4001, 'Invalid ticket')
      return new Response(null, { status: 101, webSocket: client })
    }

    try {
      await this.initializeFromD1(roomId)
    } catch (e) {
      server.close(4001, 'Room not found')
      return new Response(null, { status: 101, webSocket: client })
    }

    let seerNeedsClue = false

    this.ctx.storage.transactionSync(() => {
      const existing = this.storage.players.find((p) => p.userId === userId)

      if (existing) {
        existing.connected = true
        existing.disconnectedAt = undefined
        this.broadcast({ type: 'player:connection', userId, status: 'reconnecting' })

        if (existing.role === 'seer' && this.storage.phase === 'statement_revealed') {
          seerNeedsClue = true
        }
      } else {
        const player: PlayerState = {
          userId,
          displayName: `Player ${this.storage.players.length + 1}`,
          connected: true,
          ready: false,
          locked: false,
          tokens: 0,
        }
        this.storage.players.push(player)
        this.fetchAndSetUserInfo(userId).then((info) => {
          if (info) {
            player.displayName = info.displayName
            player.avatarUrl = info.avatarUrl
          }
        })
        this.broadcast({ type: 'player:joined', userId, displayName: player.displayName, avatarUrl: player.avatarUrl })
      }
    })

    await this.persist()

    if (seerNeedsClue) {
      await this.sendSeerClue(server)
    }

    const oldSocket = this.sockets.get(userId)
    if (oldSocket && oldSocket.readyState !== WebSocket.CLOSED && oldSocket.readyState !== WebSocket.CLOSING) {
      try { oldSocket.close(1000, 'Replaced by new connection') } catch {}
    }

    this.sockets.set(userId, server)

    this.sendTo(server, { type: 'room:state', state: this.getSanitizedState() })

    server.addEventListener('message', async (msg: MessageEvent) => {
      try {
        const event = JSON.parse(msg.data as string)
        await this.handleClientEvent(event, userId, server)
      } catch {
        this.sendTo(server, { type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid message format' })
      }
    })

    server.addEventListener('close', () => {
      if (this.sockets.get(userId) === server) {
        this.sockets.delete(userId)
        this.handleDisconnect(userId)
      }
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  async handleClientEvent(event: any, userId: string, server: WebSocket) {
    switch (event.type) {
      case 'player:ready': {
        const player = this.storage.players.find((p) => p.userId === userId)
        if (player) {
          player.ready = !player.ready
          this.broadcast({ type: 'player:ready_state', userId, ready: player.ready })
        }
        break
      }

      case 'host:start_game': {
        if (userId !== this.storage.hostUserId) {
          this.sendTo(server, { type: 'error', code: 'FORBIDDEN', message: 'Only host can start the game' })
          return
        }
        const connectedPlayers = this.storage.players.filter((p) => p.connected)
        const count = connectedPlayers.length
        const mode = this.storage.mode

        if (mode === 'solo') {
          if (count < 1) {
            this.sendTo(server, { type: 'error', code: 'NOT_ENOUGH_PLAYERS', message: 'Need at least 1 connected player for Solo mode' })
            return
          }
        } else if (mode === 'seer_skeptic') {
          if (count !== 2) {
            this.sendTo(server, { type: 'error', code: 'WRONG_PLAYER_COUNT', message: 'Seer & Skeptic mode requires exactly 2 players' })
            return
          }
        } else if (mode === 'multiplayer_seer') {
          if (count < 3 || count > 6) {
            this.sendTo(server, { type: 'error', code: 'WRONG_PLAYER_COUNT', message: 'Multiplayer Seer mode requires between 3 and 6 players' })
            return
          }
        }

        const nonHostReady = connectedPlayers.filter((p) => p.userId !== this.storage.hostUserId).every((p) => p.ready)
        if (mode !== 'solo' && !nonHostReady) {
          this.sendTo(server, { type: 'error', code: 'NOT_READY', message: 'All players must be ready to start' })
          return
        }
        await this.startGame()
        break
      }

      case 'host:set_timer': {
        if (userId !== this.storage.hostUserId) return
        const secs = Math.max(10, Math.min(120, event.seconds || 45))
        this.storage.timerSeconds = secs
        this.broadcast({ type: 'phase:changed', phase: this.storage.phase, seconds: secs })
        break
      }

      case 'host:start_persuasion': {
        if (userId !== this.storage.hostUserId) return
        if (this.storage.phase !== 'statement_revealed') return
        this.ctx.storage.deleteAlarm() // cancel pending alarm from statement phase
        this.storage.phase = 'persuasion'
        this.storage.currentSpeakerIndex = 0
        this.storage.timerEnd = Date.now() + this.storage.timerSeconds * 1000
        this.broadcast({ type: 'phase:changed', phase: 'persuasion', timerEnd: this.storage.timerEnd })

        const seers = this.storage.players.filter((p) => p.role === 'seer')
        if (seers.length > 0) {
          this.broadcast({ type: 'round:turn', speakingUserId: seers[0].userId })
        }
        this.ctx.storage.setAlarm(this.storage.timerEnd)
        break
      }

      case 'host:start_lockin': {
        if (userId !== this.storage.hostUserId) return
        if (this.storage.phase !== 'persuasion') return
        this.ctx.storage.deleteAlarm() // cancel pending alarm
        this.storage.phase = 'decision'
        this.storage.timerEnd = Date.now() + this.storage.timerSeconds * 1000
        this.broadcast({ type: 'phase:changed', phase: 'decision', timerEnd: this.storage.timerEnd })
        this.ctx.storage.setAlarm(this.storage.timerEnd)
        break
      }

      case 'host:next_speaker': {
        if (userId !== this.storage.hostUserId) return
        const seers = this.storage.players.filter((p) => p.role === 'seer')
        this.storage.currentSpeakerIndex =
          (this.storage.currentSpeakerIndex + 1) % (seers.length || 1)
        const speaker = seers[this.storage.currentSpeakerIndex]
        if (speaker) this.broadcast({ type: 'round:turn', speakingUserId: speaker.userId })
        break
      }

      case 'host:advance_round': {
        if (userId !== this.storage.hostUserId) return
        if (this.storage.phase === 'reveal') await this.goToLeaderboard()
        else if (this.storage.phase === 'leaderboard') await this.startNextRound()
        break
      }

      case 'host:force_reveal': {
        if (userId !== this.storage.hostUserId) return
        if (this.storage.phase !== 'decision') return
        this.ctx.storage.deleteAlarm()
        for (const p of this.storage.players) {
          if (!p.locked && p.connected) {
            p.locked = true
            p.pick = p.pick || this.storage.categoryOptions[0]?.id
          }
        }
        await this.doReveal()
        break
      }

      case 'host:end_game': {
        if (userId !== this.storage.hostUserId) return
        this.storage.phase = 'game_ended'
        const standings = this.getStandings()
        this.broadcast({ type: 'game:ended', finalStandings: standings })
        await this.flushToD1()
        break
      }

      case 'player:lock_answer': {
        const player = this.storage.players.find((p) => p.userId === userId)
        if (!player || player.locked) return
        // Only allow locks during statement (seer) or decision (everyone else)
        if (this.storage.phase !== 'statement_revealed' && this.storage.phase !== 'decision') return
        player.locked = true
        player.pick = event.category_id
        this.broadcast({ type: 'player:locked', userId, pick: event.category_id })

        // If a seer locks, reveal their pick to all (in any valid phase)
        if (player.role === 'seer') {
          this.broadcast({ type: 'seer:pick_revealed', userId, pick: event.category_id })
        }

        // If skeptic follows, ensure pick matches trusted seer's pick
        if (player.role === 'skeptic' && player.decision === 'follow' && player.trustedSeerId) {
          const trustedSeer = this.storage.players.find((p) => p.userId === player.trustedSeerId)
          if (trustedSeer?.pick) {
            player.pick = trustedSeer.pick
          }
        }

        const connected = this.storage.players.filter((p) => p.connected)
        const allLocked = connected.length === 0 || connected.every((p) => p.locked)
        if (allLocked || this.storage.mode === 'solo') await this.doReveal()

        // Pacing: once every Seer has locked their pick, don't make everyone
        // wait out the rest of the statement timer. Move straight to persuasion.
        if (this.storage.phase === 'statement_revealed' && this.storage.mode !== 'solo') {
          const seers = this.storage.players.filter((p) => p.role === 'seer')
          const allSeersLocked = seers.length > 0 && seers.every((p) => p.locked)
          if (allSeersLocked) {
            this.ctx.storage.deleteAlarm()
            this.storage.phase = 'persuasion'
            this.storage.currentSpeakerIndex = 0
            this.storage.timerEnd = Date.now() + this.storage.timerSeconds * 1000
            this.broadcast({ type: 'phase:changed', phase: 'persuasion', timerEnd: this.storage.timerEnd })
            const firstSeer = seers[0]
            if (firstSeer) this.broadcast({ type: 'round:turn', speakingUserId: firstSeer.userId })
            this.ctx.storage.setAlarm(this.storage.timerEnd)
          }
        }
        break
      }

      case 'skeptic:decision': {
        const player = this.storage.players.find((p) => p.userId === userId)
        if (!player || player.role !== 'skeptic') return
        // Only allow decision during persuasion or decision phases
        if (this.storage.phase !== 'persuasion' && this.storage.phase !== 'decision') return
        player.decision = event.decision
        player.trustedSeerId = event.trusted_seer_id
        break
      }
    }

    await this.persist()
  }

  async startGame() {
    if (this.storage.cardIds.length === 0) {
      this.broadcast({ type: 'error', code: 'NO_CARDS', message: 'Deck has no cards' })
      return
    }
    this.storage.roundIndex = 0
    await this.startNextRound()
  }

  private transferHostIfNeeded() {
    const hostConnected = this.storage.players.some((p) => p.userId === this.storage.hostUserId && p.connected)
    if (hostConnected || this.storage.phase === 'game_ended') return
    const replacement = this.storage.players.find((p) => p.connected)
    if (replacement) {
      this.storage.hostUserId = replacement.userId
      this.broadcast({ type: 'host:changed', hostUserId: replacement.userId })
      this.env.DB.prepare('UPDATE rooms SET host_user_id = ? WHERE id = ?')
        .bind(replacement.userId, this.storage.roomId).run().catch(() => {})
    }
  }

  async startNextRound() {
    if (this.storage.roundIndex >= this.storage.maxRounds) {
      this.storage.phase = 'game_ended'
      const standings = this.getStandings()
      this.broadcast({ type: 'game:ended', finalStandings: standings })
      await this.flushToD1()
      return
    }

    const cardId = this.storage.cardIds[this.storage.roundIndex]
    this.storage.currentCardId = cardId
    this.storage.currentSpeakerIndex = 0

    const db = this.env.DB
    const card = await db.prepare(
      'SELECT * FROM statement_cards WHERE id = ?'
    ).bind(cardId).first() as CardData | null

    if (!card) return

    this.storage.statementText = card.statement_text
    this.storage.statementImageUrl = card.statement_image_url || ''
    this.storage.correctCategoryId = card.correct_category_id

    for (const player of this.storage.players) {
      player.locked = false
      player.pick = undefined
      player.decision = undefined
      player.trustedSeerId = undefined
      player.role = undefined
    }

    this.storage.phase = 'role_assignment'
    this.assignRoles()

    for (const player of this.storage.players) {
      if (!player.connected) continue
      const ws = this.sockets.get(player.userId)
      if (ws && player.role) {
        this.sendTo(ws, { type: 'round:role_assigned', role: player.role })
      }
    }

    this.storage.phase = 'statement_revealed'
    this.storage.roundStartTime = Date.now()
    this.storage.timerEnd = Date.now() + this.storage.timerSeconds * 1000

    this.broadcast({
      type: 'round:started',
      roundNumber: this.storage.roundIndex + 1,
      statementText: card.statement_text,
      statementImageUrl: card.statement_image_url || '',
      categoryOptions: this.storage.categoryOptions,
      timerSeconds: this.storage.timerSeconds,
      timerEnd: this.storage.timerEnd,
      roles: Object.fromEntries(
        this.storage.players
          .filter((p) => p.role !== undefined)
          .map((p) => [p.userId, p.role as 'seer' | 'skeptic' | 'solo'])
      ),
    })

    for (const player of this.storage.players) {
      if (player.role === 'seer' && player.connected) {
        const ws = this.sockets.get(player.userId)
        if (ws) {
          this.sendTo(ws, {
            type: 'seer:clue',
            clueVariant: card.clue_variant,
            cluePayload: card.clue_payload,
            clueType: card.clue_type,
            clueContent: card.clue_content,
          })
        }
      }
    }

    this.ctx.storage.setAlarm(this.storage.timerEnd)
    this.storage.roundIndex++
    await this.persist()
  }

  assignRoles() {
    const connectedPlayers = this.storage.players.filter((p) => p.connected)
    if (connectedPlayers.length === 0) return

    if (this.storage.mode === 'solo') {
      for (const p of connectedPlayers) p.role = 'solo'
      return
    }

    const skepticIdx = this.storage.skepticIndex % connectedPlayers.length
    this.storage.skepticIndex++

    if (this.storage.mode === 'seer_skeptic') {
      // Seer & Skeptic mode supports exactly one skeptic and one seer.
      // Any extra connected players (e.g. a mid-game join) are marked
      // 'solo' so a 2p game can never end up with multiple seers.
      const seerIdx = connectedPlayers.length > 1 ? (skepticIdx + 1) % connectedPlayers.length : -1
      for (let i = 0; i < connectedPlayers.length; i++) {
        if (i === skepticIdx) connectedPlayers[i].role = 'skeptic'
        else if (i === seerIdx) connectedPlayers[i].role = 'seer'
        else connectedPlayers[i].role = 'solo'
      }
      return
    }

    for (let i = 0; i < connectedPlayers.length; i++) {
      connectedPlayers[i].role = i === skepticIdx ? 'skeptic' : 'seer'
    }
  }

  async doReveal() {
    this.storage.phase = 'reveal'
    const correctCategoryId = this.storage.correctCategoryId!
    const tokensAwarded: Record<string, number> = {}
    const isCorrectMap: Record<string, boolean> = {}
    const decisions: Record<string, Decision> = {}
    const seerIds: string[] = []
    let skepticId: string | undefined

    const activePlayers = this.storage.players.filter((p) =>
      p.connected || p.pick !== undefined || p.tokens > 0
    )

    for (const p of activePlayers) {
      isCorrectMap[p.userId] = p.pick === correctCategoryId
      if (p.decision) decisions[p.userId] = p.decision
      if (p.role === 'seer') seerIds.push(p.userId)
      if (p.role === 'skeptic') skepticId = p.userId
    }

    const skeptic = this.storage.players.find((p) => p.role === 'skeptic')
    const result = computeScores({
      mode: this.storage.mode,
      isCorrect: isCorrectMap,
      decisions,
      trustedSeerId: skeptic?.trustedSeerId,
      seerIds,
      skepticId,
      allPlayerIds: activePlayers.map((p) => p.userId),
    })

    for (const p of activePlayers) {
      const earned = result.tokens[p.userId] || 0
      p.tokens += earned
      tokensAwarded[p.userId] = earned
    }

    const perPlayerAnswers = activePlayers
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        role: p.role,
        pick: p.pick,
        isCorrect: p.pick === correctCategoryId,
        tokensAwarded: tokensAwarded[p.userId] || 0,
        decision: p.decision,
        trustedSeerId: p.trustedSeerId,
      }))

    this.broadcast({
      type: 'round:reveal',
      correctCategoryId,
      perPlayerAnswers,
      frictionExplanation: '',
      tokensAwarded,
    })

    await this.saveRoundToD1(correctCategoryId, tokensAwarded)
    this.storage.timerEnd = Date.now() + 5000
    this.ctx.storage.setAlarm(this.storage.timerEnd)
    await this.persist()
  }

  async goToLeaderboard() {
    this.storage.phase = 'leaderboard'
    this.broadcast({ type: 'leaderboard:update', standings: this.getStandings() })
    this.storage.timerEnd = Date.now() + 8000
    this.ctx.storage.setAlarm(this.storage.timerEnd)
    await this.persist()
  }

  getStandings() {
    return [...this.storage.players]
      .filter((p) => p.connected || p.tokens > 0 || p.pick !== undefined)
      .sort((a, b) => b.tokens - a.tokens)
      .map((p) => ({ userId: p.userId, displayName: p.displayName, tokens: p.tokens, role: p.role }))
  }

  async saveRoundToD1(correctCategoryId: string, tokensAwarded: Record<string, number>) {
    try {
      const db = this.env.DB
      const roundId = crypto.randomUUID()
      const timestamp = Math.floor(Date.now() / 1000)
      const seer = this.storage.players.find((p) => p.role === 'seer')
      const skeptic = this.storage.players.find((p) => p.role === 'skeptic')

      await db.prepare(
        `INSERT INTO rounds (id, room_id, statement_card_id, round_number, seer_user_id, skeptic_user_id, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(roundId, this.storage.roomId, this.storage.currentCardId, this.storage.roundIndex,
        seer?.userId || null, skeptic?.userId || null,
        Math.floor((this.storage.roundStartTime || Date.now()) / 1000), timestamp
      ).run()

      for (const p of this.storage.players) {
        if (!p.connected && p.pick === undefined && tokensAwarded[p.userId] === undefined) continue
        const decisionMap: Record<string, string> = { follow: 'followed_seer', bluff: 'called_bluff', solo: 'went_solo' }
        await db.prepare(
          `INSERT INTO round_answers (round_id, user_id, chosen_category_id, decision_type, trusted_seer_id, is_correct, tokens_awarded, locked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(roundId, p.userId, p.pick || null, p.decision ? (decisionMap[p.decision] || p.decision) : null, p.trustedSeerId || null,
          p.pick === correctCategoryId ? 1 : 0, tokensAwarded[p.userId] || 0, timestamp
        ).run()
      }

      for (const p of this.storage.players) {
        if (!p.connected && p.tokens === 0 && p.pick === undefined) continue
        await db.prepare('UPDATE room_players SET total_tokens = ? WHERE room_id = ? AND user_id = ?')
          .bind(p.tokens, this.storage.roomId, p.userId).run()
      }
    } catch (e) {
      console.error('Failed to save round to D1:', e)
    }
  }

  async flushToD1() {
    try {
      await this.env.DB.prepare('UPDATE rooms SET status = ?, ended_at = ? WHERE id = ?')
        .bind('completed', Math.floor(Date.now() / 1000), this.storage.roomId).run()
    } catch (e) {
      console.error('Failed to flush room to D1:', e)
    }
  }

  handleDisconnect(userId: string) {
    const player = this.storage.players.find((p) => p.userId === userId)
    if (player) {
      player.connected = false
      player.disconnectedAt = Date.now()
      this.broadcast({ type: 'player:connection', userId, status: 'disconnected' })
    }
    this.transferHostIfNeeded()
    this.persist()
  }

  async alarm() {
    if (this.storage.phase === 'statement_revealed') {
      if (this.storage.timerEnd && Date.now() >= this.storage.timerEnd) {
        if (this.storage.mode === 'solo') {
          for (const p of this.storage.players) {
            if (!p.locked && p.connected) {
              p.locked = true
              p.pick = p.pick || this.storage.categoryOptions[0]?.id
            }
          }
          await this.doReveal()
        } else {
          this.storage.phase = 'persuasion'
          this.storage.currentSpeakerIndex = 0
          this.storage.timerEnd = Date.now() + this.storage.timerSeconds * 1000
          this.broadcast({ type: 'phase:changed', phase: 'persuasion', timerEnd: this.storage.timerEnd })
          const seers = this.storage.players.filter((p) => p.role === 'seer')
          if (seers.length > 0) {
            this.broadcast({ type: 'round:turn', speakingUserId: seers[0].userId })
          }
          this.ctx.storage.setAlarm(this.storage.timerEnd)
        }
      }
    } else if (this.storage.phase === 'persuasion') {
      if (this.storage.timerEnd && Date.now() >= this.storage.timerEnd) {
        this.storage.phase = 'decision'
        this.storage.timerEnd = Date.now() + this.storage.timerSeconds * 1000
        this.broadcast({ type: 'phase:changed', phase: 'decision', timerEnd: this.storage.timerEnd })
        this.ctx.storage.setAlarm(this.storage.timerEnd)
      }
    } else if (this.storage.phase === 'decision') {
      if (this.storage.timerEnd && Date.now() >= this.storage.timerEnd) {
        for (const p of this.storage.players) {
          if (!p.locked && p.connected) {
            p.locked = true
            p.pick = p.pick || this.storage.categoryOptions[0]?.id
          }
        }
        await this.doReveal()
      }
    } else if (this.storage.phase === 'reveal') {
      if (this.storage.timerEnd && Date.now() >= this.storage.timerEnd) {
        await this.goToLeaderboard()
      }
    } else if (this.storage.phase === 'leaderboard') {
      if (this.storage.timerEnd && Date.now() >= this.storage.timerEnd) {
        await this.startNextRound()
      }
    }

    for (const p of [...this.storage.players]) {
      if (!p.connected && p.disconnectedAt && (Date.now() - p.disconnectedAt) > 60000) {
        this.broadcast({ type: 'player:left', userId: p.userId })
        this.storage.players = this.storage.players.filter((pl) => pl.userId !== p.userId)
        this.env.DB.prepare(
          'UPDATE room_players SET left_at = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL'
        ).bind(Math.floor(Date.now() / 1000), this.storage.roomId, p.userId).run().catch(() => {})
      }
    }
    this.transferHostIfNeeded()

    await this.persist()
  }

  private sendTo(ws: WebSocket, event: ServerEvent) {
    try { ws.send(JSON.stringify(event)) } catch {}
  }

  private broadcast(event: ServerEvent) {
    if (event.type === 'seer:clue' || event.type === 'round:role_assigned') return
    for (const [userId, ws] of this.sockets.entries()) {
      const player = this.storage.players.find((p) => p.userId === userId)
      if (player?.connected) this.sendTo(ws, event)
    }
    for (const ws of this.spectatorSockets) {
      this.sendTo(ws, this.stripSecrets(event))
    }
  }

  private stripSecrets(event: ServerEvent): ServerEvent {
    if (event.type === 'round:reveal') {
      return { ...event, perPlayerAnswers: event.perPlayerAnswers.map((a: any) => ({ ...a, trustedSeerId: undefined })) }
    }
    return event
  }

  private async sendSeerClue(ws: WebSocket) {
    if (this.storage.currentCardId) {
      const card = await this.env.DB.prepare(
        'SELECT clue_variant, clue_payload, clue_type, clue_content FROM statement_cards WHERE id = ?'
      ).bind(this.storage.currentCardId).first() as any
      if (card) {
        this.sendTo(ws, {
          type: 'seer:clue',
          clueVariant: card.clue_variant || 'none',
          cluePayload: card.clue_payload || undefined,
          clueType: card.clue_type || 'none',
          clueContent: card.clue_content || undefined,
        })
        return
      }
    }
    this.sendTo(ws, { type: 'seer:clue', clueVariant: 'none', clueType: 'none' })
  }

  private async fetchAndSetUserInfo(userId: string) {
    try {
      const user = await this.env.DB.prepare(
        'SELECT display_name, avatar_url FROM users WHERE id = ?'
      ).bind(userId).first() as { display_name: string; avatar_url?: string } | null
      return user ? { displayName: user.display_name, avatarUrl: user.avatar_url } : null
    } catch { return null }
  }

  private getSanitizedState() {
    const afterReveal = this.storage.phase === 'reveal' || this.storage.phase === 'leaderboard' || this.storage.phase === 'game_ended'
    const pickVisible = afterReveal || this.storage.phase === 'persuasion' || this.storage.phase === 'decision'
    return {
      roomId: this.storage.roomId,
      code: this.storage.code,
      phase: this.storage.phase,
      mode: this.storage.mode,
      hostUserId: this.storage.hostUserId,
      players: this.storage.players.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        connected: p.connected,
        ready: p.ready,
        role: p.role,
        locked: p.locked,
        tokens: p.tokens,
        pick: pickVisible ? p.pick : undefined,
        decision: afterReveal ? p.decision : undefined,
      })),
      roundIndex: this.storage.roundIndex,
      currentCardId: this.storage.currentCardId,
      statementText: this.storage.statementText,
      statementImageUrl: this.storage.statementImageUrl || '',
      categoryOptions: this.storage.categoryOptions,
      deckId: this.storage.deckId,
      timerSeconds: this.storage.timerSeconds,
      timerEnd: this.storage.timerEnd,
      speakingUserId: this.storage.phase === 'persuasion'
        ? this.storage.players.filter((p) => p.role === 'seer')[this.storage.currentSpeakerIndex]?.userId
        : undefined,
    }
  }

  private getSpectatorState() {
    const s = this.getSanitizedState()
    return {
      ...s,
      isSpectator: true,
      players: s.players.map((p: any) => ({
        ...p,
        ready: false,
        pick: s.phase === 'reveal' || s.phase === 'leaderboard' || s.phase === 'game_ended' ? p.pick : undefined,
        decision: s.phase === 'reveal' || s.phase === 'leaderboard' || s.phase === 'game_ended' ? p.decision : undefined,
      })),
    }
  }
}
