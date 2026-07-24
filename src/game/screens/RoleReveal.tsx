import { useEffect } from "react";
import { motion } from "framer-motion";
import { RoleRevealCard } from "../components/RoleRevealCard";
import { useGame, useYouRound } from "../state/store";
import { sfx } from "../audio/sound";

export function RoleReveal() {
  const you = useYouRound();
  const soundOn = useGame((s) => s.soundOn);
  const phase = useGame((s) => s.phase);

  useEffect(() => {
    if (soundOn) sfx.roleReveal();
  }, [soundOn]);

  // Wait for round:started server event to transition to statement phase
  if (phase !== 'role-reveal') return null;

  if (!you) return null;
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <RoleRevealCard role={you.role} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="mt-6 text-xs uppercase tracking-[0.3em] text-muted-foreground animate-heartbeat"
      >
        Preparing statement…
      </motion.div>
    </div>
  );
}
