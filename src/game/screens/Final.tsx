import { motion } from "framer-motion";
import { RotateCcw, Home } from "lucide-react";
import { Podium } from "../components/Podium";
import { Leaderboard } from "../components/Leaderboard";
import { useGame } from "../state/store";
import { useEffect, useMemo } from "react";

// Simple SVG confetti
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 2,
        color: ["#8B5CF6", "#F59E0B", "#22D3EE", "#EC4899", "#84CC16"][i % 5],
        r: 4 + Math.random() * 6,
        dur: 3 + Math.random() * 3,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{ y: "110vh", opacity: [0, 1, 1, 0], rotate: 720 }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "linear" }}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            width: p.r,
            height: p.r * 1.5,
            background: p.color,
          }}
        />
      ))}
    </div>
  );
}

export function Final() {
  const players = useGame((s) => s.players);
  const youId = useGame((s) => s.youId);
  const resetGame = useGame((s) => s.resetGame);

  useEffect(() => {
    // no-op; sfx.reveal already fired on last reveal
  }, []);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 py-12">
      <Confetti />
      <div className="relative">
        <div className="text-center text-xs uppercase tracking-[0.4em] text-primary">Game over</div>
        <h1 className="mt-2 text-center font-display text-5xl font-black md:text-6xl">
          <span className="text-shimmer">The final call</span>
        </h1>
      </div>

      <div className="relative mt-12 w-full">
        <Podium players={players} />
      </div>

      <div className="relative mt-12 w-full max-w-lg">
        <Leaderboard players={players} youId={youId} />
      </div>

      <div className="relative mt-10 flex flex-wrap justify-center gap-3">
        <button
          onClick={resetGame}
          className="inline-flex items-center gap-2 rounded-full bg-primary-gradient px-6 py-3 font-display font-bold uppercase tracking-widest text-primary-foreground shadow-lock"
        >
          <RotateCcw className="h-4 w-4" /> Play again
        </button>
        <button
          onClick={resetGame}
          className="inline-flex items-center gap-2 rounded-full border px-6 py-3 font-display font-semibold uppercase tracking-widest hover:bg-card"
        >
          <Home className="h-4 w-4" /> Back to home
        </button>
      </div>
    </div>
  );
}
