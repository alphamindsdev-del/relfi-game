import { motion } from "framer-motion";
import { Lock, Check } from "lucide-react";
import { sfx } from "../audio/sound";
import { useGame } from "../state/store";
import { cn } from "@/lib/utils";

export function LockInButton({
  disabled,
  locked,
  onLock,
}: {
  disabled?: boolean;
  locked?: boolean;
  onLock: () => void;
}) {
  const soundOn = useGame((s) => s.soundOn);
  return (
    <motion.button
      whileTap={disabled || locked ? undefined : { scale: 0.92 }}
      onClick={() => {
        if (disabled || locked) return;
        if (soundOn) sfx.lock();
        onLock();
      }}
      disabled={disabled || locked}
      className={cn(
        "group relative inline-flex items-center gap-3 rounded-full px-10 py-5 text-lg font-display font-bold uppercase tracking-widest transition-all",
        locked
          ? "bg-[oklch(0.75_0.18_155)] text-black shadow-lock cursor-default"
          : disabled
          ? "bg-muted text-muted-foreground cursor-not-allowed"
          : "bg-primary-gradient text-primary-foreground shadow-lock hover:brightness-110"
      )}
    >
      {locked ? <Check className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
      {locked ? "Locked in" : "Lock it in"}
      {!locked && !disabled && (
        <span className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100" style={{ boxShadow: "0 0 40px var(--primary)" }} />
      )}
    </motion.button>
  );
}
