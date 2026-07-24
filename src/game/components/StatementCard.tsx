import { motion } from "framer-motion";
import type { StatementCard as Card } from "../lib/types";

export function StatementCard({ card, index }: { card: Card; index?: number }) {
  return (
    <motion.div
      key={card.id}
      initial={{ y: 40, opacity: 0, rotateX: 12, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, rotateX: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.2, 0.9, 0.3, 1] }}
      className="relative w-full max-w-2xl overflow-hidden rounded-3xl border p-8 md:p-10 bg-card-elevated shadow-elevated"
      style={{ perspective: 1000 }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        Statement {typeof index === "number" ? `#${index + 1}` : ""}
      </div>
      <p className="mt-6 font-display text-2xl leading-tight md:text-4xl md:leading-[1.15]">
        &ldquo;{card.text}&rdquo;
      </p>
      <div className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">
        What kind of statement is this?
      </div>
    </motion.div>
  );
}
