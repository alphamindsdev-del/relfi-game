import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "./Avatar";
import { TokenCounter } from "./TokenCounter";
import type { Player } from "../lib/types";

export function Leaderboard({ players, youId }: { players: Player[]; youId: string }) {
  const sorted = [...players].sort((a, b) => b.tokens - a.tokens);
  return (
    <div className="w-full max-w-lg space-y-2">
      <AnimatePresence initial={false}>
        {sorted.map((p, i) => (
          <motion.div
            layout
            key={p.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ layout: { duration: 0.5, ease: [0.2, 0.9, 0.3, 1] } }}
            className={`flex items-center gap-3 rounded-2xl border p-3 pr-4 ${
              p.id === youId ? "bg-primary/10 border-primary/40" : "bg-card"
            }`}
          >
            <div className="w-6 text-center font-display text-lg font-bold text-muted-foreground">{i + 1}</div>
            <Avatar name={p.name} hue={p.avatarHue} size={40} connected={p.connected} />
            <div className="flex-1 min-w-0">
              <div className="truncate font-semibold">
                {p.name} {p.id === youId && <span className="text-xs text-primary">(you)</span>}
              </div>
            </div>
            <TokenCounter value={p.tokens} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
