import { motion } from "framer-motion";
import { Eye, Shield, User } from "lucide-react";
import type { Role } from "../lib/types";

const roleMeta: Record<Role, { title: string; blurb: string; color: string; Icon: any }> = {
  seer: {
    title: "Seer",
    blurb: "You've been slipped a private clue. Convince the group without giving yourself away.",
    color: "#8B5CF6",
    Icon: Eye,
  },
  skeptic: {
    title: "Skeptic",
    blurb: "Trust no one. Read the room. Call the bluff, or don't.",
    color: "#F59E0B",
    Icon: Shield,
  },
  solo: {
    title: "Solo",
    blurb: "It's on you. Read the card. Trust your gut. Lock in.",
    color: "#22D3EE",
    Icon: User,
  },
};

export function RoleRevealCard({ role }: { role: Role }) {
  const m = roleMeta[role];
  return (
    <motion.div
      initial={{ rotateY: 180, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: [0.2, 0.9, 0.3, 1] }}
      style={{ transformStyle: "preserve-3d" }}
      className="relative w-full max-w-md overflow-hidden rounded-3xl border p-10 text-center bg-card-elevated shadow-elevated"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${m.color}33, transparent 60%)`,
        }}
      />
      <div className="relative">
        <div
          className="mx-auto grid h-20 w-20 place-items-center rounded-full"
          style={{
            background: `linear-gradient(135deg, ${m.color}, color-mix(in oklab, ${m.color} 60%, black))`,
            boxShadow: `0 20px 40px -12px ${m.color}`,
          }}
        >
          <m.Icon className="h-10 w-10 text-white" />
        </div>
        <div className="mt-4 text-xs uppercase tracking-[0.3em] text-muted-foreground">This round you are the</div>
        <h2 className="mt-1 font-display text-5xl font-bold" style={{ color: m.color }}>
          {m.title}
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">{m.blurb}</p>
      </div>
    </motion.div>
  );
}
