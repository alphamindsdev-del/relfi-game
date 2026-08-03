import type { WsServerEvent, WsClientEvent } from './types'

type EventHandler = (event: WsServerEvent) => void

const WS_BASE = 'wss://relfi-games.alphamindsdev.workers.dev/api/rooms'

export class RelFiSocket {
  private ws: WebSocket | null = null
  private handlers: Set<EventHandler> = new Set()
  private roomId: string = ''
  private roomCode: string = ''
  private ticket: string = ''
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private intentionalClose = false
  private onReconnectHandler: ((roomCode: string) => Promise<string>) | null = null

  setReconnectHandler(handler: (roomCode: string) => Promise<string>) {
    this.onReconnectHandler = handler
  }

  connect(roomId: string, ticket: string, roomCode?: string) {
    this.roomId = roomId
    this.ticket = ticket
    this.roomCode = roomCode || ''
    this.intentionalClose = false
    this.reconnectAttempts = 0
    this.open()
  }

  private open() {
    if (this.ws) {
      this.ws.close()
    }

    this.ws = new WebSocket(`${WS_BASE}/${this.roomId}/ws?ticket=${this.ticket}`)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.startHeartbeat()
    }

    this.ws.onmessage = (msg: MessageEvent) => {
      try {
        const event = JSON.parse(msg.data) as WsServerEvent
        this.handlers.forEach((handler) => handler(event))

        if (event.type === 'room:state') {
          if (event.state.roomId) {
            this.roomId = event.state.roomId
          }
        }
      } catch {
        // Ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      if (!this.intentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
        this.reconnectTimeout = setTimeout(() => this.attemptReconnect(), delay)
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after this
    }
  }

  private async attemptReconnect() {
    if (this.intentionalClose) return
    if (this.onReconnectHandler && this.roomCode) {
      try {
        const newTicket = await this.onReconnectHandler(this.roomCode)
        this.ticket = newTicket
      } catch {
        this.reconnectAttempts++
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
          this.reconnectTimeout = setTimeout(() => this.attemptReconnect(), delay)
        }
        return
      }
    }
    this.reconnectAttempts++
    this.open()
  }

  disconnect() {
    this.intentionalClose = true
    this.stopHeartbeat()
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(event: WsClientEvent) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event))
    }
  }

  onServerEvent(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }

  reconnect() {
    if (this.roomId && this.ticket) {
      this.intentionalClose = false
      this.reconnectAttempts = 0
      this.open()
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 15000)
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }
}

// Singleton
export const relfiSocket = new RelFiSocket()
