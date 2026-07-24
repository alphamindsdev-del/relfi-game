import { AnimatePresence, motion } from "framer-motion";
import { EyeOff, Lock } from "lucide-react";
import { CategoryChip } from "./CategoryChip";
import type { Category, ClueVariant } from "../lib/types";

export function SecretRoomModal({
  open,
  onClose,
  clue,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  clue: ClueVariant;
  categories: Category[];
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            initial={{ y: 60, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 60, scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.9, 0.3, 1] }}
            className="relative m-4 w-full max-w-lg rounded-3xl border p-6 md:p-8 glass-panel"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary">
              <Lock className="h-3.5 w-3.5" />
              Secret Room — Seers only
            </div>
            <h3 className="mt-3 font-display text-2xl font-bold">Your clue</h3>

            <div className="mt-6 space-y-4">
              {clue.kind === "none" && (
                <p className="rounded-2xl border bg-muted/50 p-4 text-sm text-muted-foreground">
                  No clue this round. You're operating on instinct — sell it anyway.
                </p>
              )}
              {clue.kind === "narrowed" && (
                <div>
                  <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Narrowed to</div>
                  <div className="flex flex-wrap gap-2">
                    {categories
                      .filter((c) => clue.categoryIds.includes(c.id))
                      .map((c) => (
                        <CategoryChip key={c.id} category={c} selected size="sm" />
                      ))}
                  </div>
                </div>
              )}
              {clue.kind === "partial" && (
                <div>
                  <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Partial intel</div>
                  <p className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm italic">
                    &ldquo;{clue.text}&rdquo;
                  </p>
                </div>
              )}
              {clue.kind === "exact" && (
                <div>
                  <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">The answer is</div>
                  <div className="flex">
                    <CategoryChip category={categories.find((c) => c.id === clue.categoryId)!} selected size="lg" />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    You know the truth. Don't be too obvious — you have to convince the Skeptic.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-gradient px-6 py-3 font-display text-sm font-bold uppercase tracking-widest text-primary-foreground"
            >
              <EyeOff className="h-4 w-4" />
              Return to the group
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
