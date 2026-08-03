import { useEffect } from "react";
import { motion } from "framer-motion";
import { RoleRevealCard } from "../components/RoleRevealCard";
import { useGame } from "../state/store";
import { sfx } from "../audio/sound";

export function RoleReveal() {
  const youRole = useGame((s) => s.youRole);
  const soundOn = useGame((s) => s.soundOn);
  const phase = useGame((s) => s.phase);

  useEffect(() => {
    if (soundOn) sfx.roleReveal();
  }, [soundOn]);

  if (phase !== 'role-reveal') return null;
  if (!youRole) return null;
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <RoleRevealCard role={youRole} />
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
