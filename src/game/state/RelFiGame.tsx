import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SoundToggle } from "../components/SoundToggle";
import { Landing } from "../screens/Landing";
import { Lobby } from "../screens/Lobby";
import { RoleReveal } from "../screens/RoleReveal";
import { Statement } from "../screens/Statement";
import { Reveal } from "../screens/Reveal";
import { LeaderboardScreen } from "../screens/LeaderboardScreen";
import { Final } from "../screens/Final";
import { useGame } from "./store";
import { useAuth } from "./auth-store";
import { relfiSocket } from "../lib/ws";
import { cn } from "@/game/lib/utils";
import { Avatar } from "../components/Avatar";

export type RelFiGameProps = {
  mode?: "standalone" | "embedded";
  containerMode?: "fullscreen" | "contained";
  authToken?: string;
};

export function RelFiGame({ mode = "standalone", containerMode = "fullscreen" }: RelFiGameProps) {
  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const applyWsEvent = useGame((s) => s.applyWsEvent);
  const resetGame = useGame((s) => s.resetGame);
  const tryReconnect = useGame((s) => s.tryReconnect);
  const user = useAuth((s) => s.user);
  const loadSession = useAuth((s) => s.loadSession);
  const initialized = useAuth((s) => s.initialized);

  useEffect(() => {
    loadSession().catch(() => {})
  }, [loadSession])

  useEffect(() => {
    if (initialized && phase === 'landing') {
      tryReconnect()
    }
  }, [initialized])

  useEffect(() => {
    const unsub = relfiSocket.onServerEvent((event) => {
      applyWsEvent(event)
    })
    return unsub
  }, [applyWsEvent])

  useEffect(() => {
    if (mode === "embedded" && phase === "landing" && initialized) setPhase("lobby");
  }, [mode, phase, setPhase, initialized]);

  return (
    <div
      className={cn(
        "relfi-root relative isolate overflow-hidden",
        containerMode === "fullscreen" ? "min-h-screen" : "min-h-[720px] rounded-3xl"
      )}
    >
      <div className="absolute inset-0 -z-10 bg-hero" />

      <div className="fixed left-4 top-4 z-40 flex items-center gap-2">
        {user && (
          <Avatar
            name={user.display_name}
            hue={user.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360}
            size={32}
            avatarUrl={user.avatar_url}
          />
        )}
        <SoundToggle />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.2, 0.9, 0.3, 1] }}
        >
          {phase === "landing" && <Landing />}
          {phase === "lobby" && <Lobby />}
          {phase === "role-reveal" && <RoleReveal />}
          {phase === "statement" && <Statement />}
          {phase === "reveal" && <Reveal />}
          {phase === "leaderboard" && <LeaderboardScreen />}
          {phase === "final" && <Final />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
