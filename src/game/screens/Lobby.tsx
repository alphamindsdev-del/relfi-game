import { motion } from "framer-motion";
import { Play, Users, LogOut } from "lucide-react";
import { useGame } from "../state/store";
import { useAuth } from "../state/auth-store";
import { RoomCodeDisplay } from "../components/RoomCodeDisplay";
import { Avatar } from "../components/Avatar";

export function Lobby() {
  const roomCode = useGame((s) => s.roomCode);
  const players = useGame((s) => s.players);
  const connected = useGame((s) => s.connected);
  const hostStartGame = useGame((s) => s.hostStartGame);
  const playerReady = useGame((s) => s.playerReady);
  const user = useAuth((s) => s.user);
  const youReady = players.find((p) => user && p.id === user.id)?.ready ?? false;
  const canStart = players.length >= 2 && connected;

  const resetGame = useGame((s) => s.resetGame);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Waiting room</div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">Get everyone in</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={resetGame}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-card"
          >
            <LogOut className="h-3.5 w-3.5" /> Leave
          </button>
          <div className="hidden text-right md:block">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Mode</div>
            <div className="font-display text-lg">Online</div>
            <div className="text-xs text-muted-foreground">{players.length} {players.length === 1 ? 'player' : 'players'}</div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <RoomCodeDisplay code={roomCode} />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> Players ({players.length})
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {players.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 rounded-2xl border bg-card p-3"
            >
              <Avatar name={p.name} hue={p.avatarHue} connected={p.connected} />
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {p.name}
                  {user && p.id === user.id && <span className="ml-1 text-xs text-primary">(you)</span>}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {p.ready ? "ready" : "getting ready"}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-10 flex gap-3">
        <button
          onClick={playerReady}
          className={`inline-flex flex-1 items-center justify-center gap-3 rounded-2xl border px-8 py-5 font-display text-base font-bold ${
            youReady ? "bg-primary/20 border-primary text-primary" : "hover:bg-card"
          }`}
        >
          {youReady ? "Ready!" : "Ready up"}
        </button>
        <button
          onClick={hostStartGame}
          disabled={!canStart}
          className="inline-flex flex-1 items-center justify-center gap-3 rounded-2xl bg-primary-gradient px-8 py-5 font-display text-lg font-bold text-primary-foreground shadow-lock transition-transform hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          <Play className="h-5 w-5" fill="currentColor" />
          Start the game
        </button>
      </div>
    </div>
  );
}
