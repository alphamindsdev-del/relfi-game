import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Eye, Users, MessageCircle, Trophy, Check, X } from "lucide-react";
import { Avatar } from "../components/Avatar";
import { TokenCounter } from "../components/TokenCounter";
import { CategoryChip } from "../components/CategoryChip";
import type { WsServerEvent, Category, Player as PlayerType } from "../lib/types";

const WS_BASE = 'wss://relfi-games.alphamindsdev.workers.dev/api/rooms'

function mapPhase(backendPhase: string): string {
  const map: Record<string, string> = {
    lobby: 'lobby',
    role_assignment: 'role-reveal',
    statement_revealed: 'statement',
    reveal: 'reveal',
    leaderboard: 'leaderboard',
    game_ended: 'final',
  }
  return map[backendPhase] || backendPhase
}

type BroadcastState = {
  phase: string
  statementText: string
  statementImageUrl: string
  players: PlayerType[]
  categories: Category[]
  roundIndex: number
  timerSeconds: number
  seerPick: { userId: string; name: string; pick: string } | null
  revealData: any
  standings: any[]
  finalStandings: any[]
}

export const Route = createFileRoute("/broadcast/$code")({
  head: () => ({
    meta: [
      { title: "Rel-Fi: Broadcast View" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BroadcastPage,
});

function BroadcastPage() {
  const { code } = Route.useParams()
  const [state, setState] = useState<BroadcastState | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/${code}/spectate?code=${code}`)
    wsRef.current = ws

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as WsServerEvent
        handleEvent(event)
      } catch {}
    }

    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current === ws) {
          const newWs = new WebSocket(`${WS_BASE}/${code}/spectate?code=${code}`)
          wsRef.current = newWs
        }
      }, 2000)
    }

    return () => { ws.close() }
  }, [code])

  function handleEvent(event: WsServerEvent) {
    setState((prev) => {
      const base = prev || {
        phase: 'lobby',
        statementText: '',
        statementImageUrl: '',
        players: [],
        categories: [],
        roundIndex: 0,
        timerSeconds: 45,
        seerPick: null,
        revealData: null,
        standings: [],
        finalStandings: [],
      }

      switch (event.type) {
        case 'room:state': {
          const s = event.state
          return {
            ...base,
            phase: mapPhase(s.phase),
            statementText: s.statementText || '',
            statementImageUrl: s.statementImageUrl || '',
            players: (s.players || []).map((p: any, i: number) => ({
              id: p.userId,
              name: p.displayName,
              avatarHue: (i * 60) % 360,
              tokens: p.tokens || 0,
              connected: p.connected,
              ready: false,
            })),
            categories: (s.categoryOptions || []).map((c: any) => ({
              id: c.id,
              name: c.name,
              color: c.color_hex,
              icon: 'Circle',
              definition: '',
            })),
            roundIndex: s.roundIndex || 0,
            timerSeconds: s.timerSeconds || 45,
            seerPick: (() => {
              const seer = (s.players || []).find((p: any) => p.role === 'seer' && p.pick)
              return seer
                ? { userId: seer.userId, name: seer.displayName, pick: seer.pick }
                : null
            })(),
          }
        }
        case 'round:started':
          return {
            ...base,
            phase: 'statement',
            statementText: event.statementText,
            statementImageUrl: event.statementImageUrl || '',
            revealData: null,
            seerPick: null,
            categories: (event.categoryOptions || []).map((c: any) => ({
              id: c.id,
              name: c.name,
              color: c.color_hex,
              icon: 'Circle',
              definition: '',
            })),
            timerSeconds: event.timerSeconds,
          }
        case 'round:reveal':
          return { ...base, phase: 'reveal', revealData: event, seerPick: null }
        case 'phase:changed':
          return { ...base, phase: mapPhase(event.phase) }
        case 'round:timer_tick':
          return { ...base, timerSeconds: event.secondsRemaining }
        case 'leaderboard:update':
          return {
            ...base,
            phase: 'leaderboard',
            standings: event.standings,
            players: event.standings.map((s: any, i: number) => ({
              id: s.userId,
              name: s.displayName,
              avatarHue: (i * 60) % 360,
              tokens: s.tokens,
              connected: true,
              ready: false,
            })),
          }
        case 'game:ended':
          return {
            ...base,
            phase: 'final',
            finalStandings: event.finalStandings,
            players: event.finalStandings.map((s: any, i: number) => ({
              id: s.userId,
              name: s.displayName,
              avatarHue: (i * 60) % 360,
              tokens: s.tokens,
              connected: true,
              ready: false,
            })),
          }
        default:
          return base
      }
    })
  }

  if (!state) {
    return (
      <div className="relfi-root flex min-h-screen items-center justify-center bg-hero">
        <div className="text-center">
          <Eye className="mx-auto h-10 w-10 text-primary animate-pulse" />
          <p className="mt-4 text-sm text-muted-foreground">Connecting to broadcast...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relfi-root min-h-screen bg-hero">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-8 py-6">
        <header className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-bold">Rel-Fi Broadcast</span>
            <span className="rounded-full bg-primary/20 px-3 py-0.5 text-xs font-semibold text-primary">
              {code}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{state.players.length} watching</span>
            <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold uppercase">
              {state.phase}
            </span>
          </div>
        </header>

        {state.phase === 'lobby' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <Eye className="h-16 w-16 text-primary/40" />
            <h2 className="font-display text-3xl font-bold">Waiting for game to start</h2>
            <div className="flex flex-wrap justify-center gap-3">
              {state.players.map((p) => (
                <div key={p.id} className="flex flex-col items-center gap-2">
                  <Avatar name={p.name} hue={p.avatarHue} size={56} />
                  <span className="text-sm font-semibold">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {state.phase === 'role-reveal' && (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="font-display text-5xl font-black">Roles Revealed</div>
              <p className="mt-4 text-muted-foreground">Players are receiving their roles...</p>
            </div>
          </div>
        )}

        {state.phase === 'statement' && (
          <div className="flex flex-1 flex-col items-center gap-8">
            <div className="w-full max-w-2xl rounded-2xl border bg-card-elevated p-8 text-center">
              <div className="text-xs uppercase tracking-[0.2em] text-primary mb-3">Statement</div>
              {state.statementImageUrl ? (
                <img src={state.statementImageUrl} alt="Statement" className="mx-auto max-h-[55vh] w-auto max-w-full rounded-2xl object-contain" />
              ) : (
                <p className="font-display text-2xl leading-relaxed md:text-3xl">
                  {state.statementText}
                </p>
              )}
            </div>
            {state.seerPick ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-8 text-center">
                <div className="text-xs uppercase tracking-widest text-primary mb-2">The Seer has picked</div>
                <div className="flex flex-col items-center gap-3">
                  <Avatar name={state.seerPick.name} hue={(state.players.find((p) => p.id === state.seerPick?.userId)?.avatarHue) || 0} size={64} />
                  <div className="font-display text-xl font-bold">{state.seerPick.name}</div>
                  {(() => {
                    const cat = state.categories.find((c) => c.id === state.seerPick?.pick)
                    return cat ? <CategoryChip category={cat} selected /> : null
                  })()}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">Others are choosing to follow the Seer or go solo</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageCircle className="h-4 w-4" />
                The Seer is analyzing in the Secret Room
              </div>
            )}
          </div>
        )}

        {state.phase === 'reveal' && state.revealData && (
          <div className="flex flex-1 flex-col items-center gap-6">
            <div className="text-xs uppercase tracking-[0.4em] text-primary">The Answer</div>
            <RevealContent revealData={state.revealData} players={state.players} />
          </div>
        )}

        {(state.phase === 'leaderboard' || state.phase === 'final') && (
          <div className="flex flex-1 flex-col items-center gap-6">
            <Trophy className="h-10 w-10 text-primary" />
            <h2 className="font-display text-4xl font-black">
              {state.phase === 'final' ? 'Final Standings' : 'Standings'}
            </h2>
            <div className="w-full max-w-lg space-y-2">
              {[...state.players]
                .sort((a, b) => b.tokens - a.tokens)
                .map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 rounded-2xl border bg-card p-4"
                  >
                    <div className="w-8 text-center font-display text-2xl font-bold text-muted-foreground">
                      {i + 1}
                    </div>
                    <Avatar name={p.name} hue={p.avatarHue} size={48} />
                    <div className="flex-1 font-display text-xl font-bold">{p.name}</div>
                    <TokenCounter value={p.tokens} />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RevealContent({ revealData, players }: { revealData: any; players: PlayerType[] }) {
  const correctCat = {
    id: revealData.correctCategoryId,
    name: revealData.correctCategoryName || 'Correct',
    color: '#8B5CF6',
    icon: 'Circle',
    definition: '',
  }

  return (
    <div className="w-full max-w-lg space-y-3">
      {revealData.perPlayerAnswers?.map((a: any, i: number) => {
        const player = players.find((p) => p.id === a.userId)
        const right = a.isCorrect
        return (
          <motion.div
            key={a.userId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-3 rounded-2xl border bg-card p-4"
          >
            <Avatar
              name={player?.name || a.displayName}
              hue={player?.avatarHue || (i * 60) % 360}
              size={40}
            />
            <div className="flex-1">
              <div className="font-semibold">{player?.name || a.displayName}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{a.role}</div>
            </div>
            <div className={`w-8 grid place-items-center`}>
              {right ? (
                <Check className="h-6 w-6" style={{ color: 'var(--success)' }} />
              ) : (
                <X className="h-6 w-6 text-destructive" />
              )}
            </div>
            <div className="text-right">
              <span className="font-display text-lg font-bold">{a.tokensAwarded || 0}</span>
              <div className="text-[10px] text-muted-foreground">tokens</div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
