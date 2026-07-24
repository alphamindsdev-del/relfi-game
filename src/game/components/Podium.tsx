import { motion } from "framer-motion";
import { Crown, Medal } from "lucide-react";
import { Avatar } from "./Avatar";
import { TokenCounter } from "./TokenCounter";
import type { Player } from "../lib/types";

export function Podium({ players }: { players: Player[] }) {
  const top = [...players].sort((a, b) => b.tokens - a.tokens).slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = [140, 200, 100];
  return (
    <div className="flex items-end justify-center gap-4">
      {order.map((p, i) => {
        const rank = i === 0 ? 2 : i === 1 ? 1 : 3;
        return (
          <motion.div
            key={p.id}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.15, duration: 0.7, ease: [0.2, 0.9, 0.3, 1] }}
            className="flex w-24 flex-col items-center gap-3 md:w-32"
          >
            <div className="relative">
              <Avatar name={p.name} hue={p.avatarHue} size={rank === 1 ? 80 : 60} />
              {rank === 1 && (
                <Crown className="absolute -top-6 left-1/2 h-7 w-7 -translate-x-1/2" style={{ color: "#F59E0B" }} />
              )}
              {rank === 2 && <Medal className="absolute -top-3 -right-2 h-5 w-5 text-slate-300" />}
              {rank === 3 && <Medal className="absolute -top-3 -right-2 h-5 w-5" style={{ color: "#CD7F32" }} />}
            </div>
            <div className="text-center">
              <div className="font-display text-lg font-bold">{p.name}</div>
              <TokenCounter value={p.tokens} size="sm" />
            </div>
            <div
              className="w-full rounded-t-2xl border border-b-0"
              style={{
                height: heights[i],
                background:
                  rank === 1
                    ? "linear-gradient(180deg, var(--primary), color-mix(in oklab, var(--primary) 60%, black))"
                    : "linear-gradient(180deg, var(--card), color-mix(in oklab, var(--card) 60%, black))",
                boxShadow: rank === 1 ? "var(--shadow-elevated)" : "var(--shadow-card)",
              }}
            >
              <div className="grid h-full place-items-center font-display text-4xl font-black text-white/60">
                {rank}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
