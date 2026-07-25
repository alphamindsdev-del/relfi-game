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
  correct_category_id: string
  clue_variant: string
  clue_payload?: string
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
  correctCategoryId?: string
  categoryOptions: { id: string; name: string; color_hex: string; icon_key?: string }[]
  skepticIndex: number
  currentSpeakerIndex: number
  timerEnd?: number
  roundStartTime?: number
  initialized: boolean
}

type ServerEvent =
  | { type: 'room:state'; state: any }
  | { type: 'player:joined'; userId: string; displayName: string; avatarUrl?: string }
  | { type: 'player:left'; userId: string }
  | { type: 'player:connection'; userId: string; status: 'connected' | 'reconnecting' }
  | { type: 'player:ready_state'; userId: string; ready: boolean }
  | { type: 'round:role_assigned'; role: 'seer' | 'skeptic' | 'solo' }
  | { type: 'round:started'; roundNumber: number; statementText: string; categoryOptions: any[]; timerSeconds: number }
  | { type: 'seer:clue'; clueVariant: string; cluePayload?: string }
  | { type: 'round:turn'; speakingUserId: string }
  | { type: 'round:timer_tick'; secondsRemaining: number }
  | { type: 'player:locked'; userId: string }
  | { type: 'round:reveal'; correctCategoryId: string; perPlayerAnswers: any[]; frictionExplanation?: string; tokensAwarded: Record<string, number> }
  | { type: 'leaderboard:update'; standings: any[] }
  | { type: 'game:ended'; finalStandings: any[] }
  | { type: 'error'; code: string; message: string }

export class RoomState extends DurableObject {
  storage: RoomStorage
  env: any
  private sockets: Map<string, WebSocket> = new Map()

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
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request)
    }
    return new Response('Not found', { status: 404 })
  }

  async initializeFromD1(roomId: string) {
    if (this.storage.initialized) return

    const db = this.env.DB
    const room = await db.prepare(
      `SELECT r.*, d.title as deck_title FROM rooms r JOIN decks d ON r.deck_id = d.id WHERE r.id = ?`
    ).bind(roomId).first() as any

    if (!room) throw new Error('Room not found')

    const deckCats = await db.prepare(
      `SELECT c.id, c.name, c.color_hex, c.icon_key FROM categories c
       JOIN deck_categories dc ON c.id = dc.category_id
       WHERE dc.deck_id = ?`
    ).bind(room.deck_id).all()

    const deckCards = await db.prepare(
      'SELECT id FROM statement_cards WHERE deck_id = ? ORDER BY sort_order ASC'
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

    this.ctx.storage.transactionSync(() => {
      const existing = this.storage.players.find((p) => p.userId === userId)

      if (existing) {
        existing.connected = true
        existing.disconnectedAt = undefined
        this.broadcast({ type: 'player:connection', userId, status: 'reconnecting' })

        if (existing.role === 'seer' && this.storage.phase === 'statement_revealed') {
          this.sendSeerClue(server)
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

    this.sockets.set(userId, server)

    // Every connecting player gets the full room state
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
      this.sockets.delete(userId)
      this.handleDisconnect(userId)
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
        const allReady = connectedPlayers.every((p) => p.ready)
        if (!allReady) {
          this.sendTo(server, { type: 'error', code: 'NOT_READY', message: 'All players must be ready to start' })
          return
        }
        await this.startGame()
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
        player.locked = true
        player.pick = event.category_id
        this.broadcast({ type: 'player:locked', userId })

        const connected = this.storage.players.filter((p) => p.connected)
        const allLocked = connected.length === 0 || connected.every((p) => p.locked)
        if (allLocked || this.storage.mode === 'solo') await this.doReveal()
        break
      }

      case 'skeptic:decision': {
        const player = this.storage.players.find((p) => p.userId === userId)
        if (!player || player.role !== 'skeptic') return
        player.decision = event.decision
        player.trustedSeerId = event.trusted_seer_id
        break
      }
    }
  }

  async startGame() {
    if (this.storage.cardIds.length === 0) {
      this.broadcast({ type: 'error', code: 'NO_CARDS', message: 'Deck has no cards' })
      return
    }
    this.storage.roundIndex = 0
    await this.startNextRound()
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

    this.broadcast({
      type: 'round:started',
      roundNumber: this.storage.roundIndex + 1,
      statementText: card.statement_text,
      categoryOptions: this.storage.categoryOptions,
      timerSeconds: 45,
    })

    for (const player of this.storage.players) {
      if (player.role === 'seer' && player.connected) {
        const ws = this.sockets.get(player.userId)
        if (ws) {
          this.sendTo(ws, {
            type: 'seer:clue',
            clueVariant: card.clue_variant,
            cluePayload: card.clue_payload,
          })
        }
      }
    }

    this.storage.timerEnd = Date.now() + 45000
    this.ctx.storage.setAlarm(this.storage.timerEnd)
    this.storage.roundIndex++
  }

  assignRoles() {
    const connectedPlayers = this.storage.players.filter((p) => p.connected)
    if (this.storage.mode === 'solo' || connectedPlayers.length <= 1) {
      for (const p of connectedPlayers) p.role = 'solo'
      return
    }
    const skepticIdx = this.storage.skepticIndex % connectedPlayers.length
    this.storage.skepticIndex++
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

    for (const p of this.storage.players) {
      if (!p.connected) continue
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
      allPlayerIds: this.storage.players.filter((p) => p.connected).map((p) => p.userId),
    })

    for (const p of this.storage.players) {
      const earned = result.tokens[p.userId] || 0
      p.tokens += earned
      tokensAwarded[p.userId] = earned
    }

    const perPlayerAnswers = this.storage.players
      .filter((p) => p.connected)
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
    this.storage.phase = 'leaderboard'
    this.broadcast({ type: 'leaderboard:update', standings: this.getStandings() })
  }

  async goToLeaderboard() {
    this.broadcast({ type: 'leaderboard:update', standings: this.getStandings() })
  }

  getStandings() {
    return [...this.storage.players]
      .filter((p) => p.connected)
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
        if (!p.connected) continue
        const decisionMap: Record<string, string> = { follow: 'followed_seer', bluff: 'called_bluff', solo: 'went_solo' }
        await db.prepare(
          `INSERT INTO round_answers (round_id, user_id, chosen_category_id, decision_type, trusted_seer_id, is_correct, tokens_awarded, locked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(roundId, p.userId, p.pick || null, p.decision ? (decisionMap[p.decision] || p.decision) : null, p.trustedSeerId || null,
          p.pick === correctCategoryId ? 1 : 0, tokensAwarded[p.userId] || 0, timestamp
        ).run()
      }

      for (const p of this.storage.players) {
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
      this.broadcast({ type: 'player:connection', userId, status: 'reconnecting' })
    }
  }

  async alarm() {
    if (this.storage.phase === 'statement_revealed' || this.storage.phase === 'persuasion') {
      if (this.storage.timerEnd && Date.now() >= this.storage.timerEnd) {
        for (const p of this.storage.players) {
          if (!p.locked && p.connected) {
            p.locked = true
            p.pick = p.pick || this.storage.categoryOptions[0]?.id
          }
        }
        await this.doReveal()
      }
    }
    for (const p of this.storage.players) {
      if (!p.connected && p.disconnectedAt && (Date.now() - p.disconnectedAt) > 60000) {
        this.broadcast({ type: 'player:left', userId: p.userId })
      }
    }
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
  }

  private sendSeerClue(ws: WebSocket) {
    this.sendTo(ws, { type: 'seer:clue', clueVariant: 'none' })
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
        pick: afterReveal ? p.pick : undefined,
        decision: afterReveal ? p.decision : undefined,
      })),
      roundIndex: this.storage.roundIndex,
      currentCardId: this.storage.currentCardId,
      statementText: this.storage.statementText,
      categoryOptions: this.storage.categoryOptions,
      deckId: this.storage.deckId,
    }
  }
}
