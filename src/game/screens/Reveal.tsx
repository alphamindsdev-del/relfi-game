import { useEffect } from "react";
import { motion } from "framer-motion";
import { Check, X, ArrowRight, LogOut, XCircle } from "lucide-react";
import { CategoryChip } from "../components/CategoryChip";
import { Avatar } from "../components/Avatar";
import { TokenCounter } from "../components/TokenCounter";
import { useGame } from "../state/store";
import { useAuth } from "../state/auth-store";
import { sfx } from "../audio/sound";

export function Reveal() {
  const categories = useGame((s) => s.categories);
  const players = useGame((s) => s.players);
  const round = useGame((s) => s.round);
  const hostAdvanceRound = useGame((s) => s.hostAdvanceRound);
  const hostEndGame = useGame((s) => s.hostEndGame);
  const resetGame = useGame((s) => s.resetGame);
  const hostUserId = useGame((s) => s.hostUserId);
  const soundOn = useGame((s) => s.soundOn);
  const revealData = useGame((s) => s.revealData);
  const frictionExplanation = useGame((s) => s.frictionExplanation);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    if (!soundOn) return;
    const t = setTimeout(() => {
      const anyBig = Object.values(round).some((r) => r.awarded >= 3);
      if (anyBig) sfx.tokenBig();
      else sfx.tokenSmall();
    }, 900);
    return () => clearTimeout(t);
  }, [round, soundOn]);

  if (!revealData) return null;
  const correctCategoryId: string = revealData.correctCategoryId;
  const correct = categories.find((c) => c.id === correctCategoryId)!;

  const handleContinue = () => {
    hostAdvanceRound()
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 py-10">
      <div className="flex w-full items-center justify-between">
        <button
          onClick={resetGame}
          className="rounded-full border p-1.5 text-muted-foreground hover:text-foreground hover:bg-card"
          title="Leave game"
        >
          <LogOut className="h-4 w-4" />
        </button>
        {user && hostUserId && user.id === hostUserId && (
          <button
            onClick={hostEndGame}
            className="rounded-full border p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive"
            title="End game"
          >
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="text-xs uppercase tracking-[0.4em] text-primary">The answer is</div>
      <motion.div
        initial={{ rotateX: 90, opacity: 0, scale: 0.9 }}
        animate={{ rotateX: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.9, 0.3, 1] }}
        className="mt-4"
      >
        {correct && <CategoryChip category={correct} selected size="lg" />}
      </motion.div>

      {frictionExplanation && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-4 max-w-xl rounded-2xl border bg-card p-4 text-center text-sm text-muted-foreground"
        >
          {frictionExplanation}
        </motion.p>
      )}

      <div className="mt-10 w-full max-w-lg space-y-2">
        {players.map((p, i) => {
          const r = round[p.id];
          const pick = categories.find((c) => c.id === r?.pick);
          const right = r?.pick === correctCategoryId;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-3 rounded-2xl border bg-card p-3"
            >
              <Avatar name={p.name} hue={p.avatarHue} size={36} />
              <div className="flex-1">
                <div className="font-semibold">{p.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{r?.role}</div>
              </div>
              {pick && <CategoryChip category={pick} size="sm" showLabel={false} />}
              <div className="w-8 grid place-items-center">
                {right ? (
                  <Check className="h-5 w-5" style={{ color: "var(--success)" }} />
                ) : (
                  <X className="h-5 w-5 text-destructive" />
                )}
              </div>
              <div className="w-16 text-right">
                {r?.awarded ? <TokenCounter value={r.awarded} size="sm" /> : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </motion.div>
          );
        })}
      </div>

      {user && hostUserId && user.id === hostUserId ? (
        <button
          onClick={handleContinue}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-primary-gradient px-8 py-4 font-display font-bold uppercase tracking-widest text-primary-foreground shadow-lock"
        >
          Standings <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <p className="mt-10 text-sm text-muted-foreground">Waiting for host to continue…</p>
      )}
    </div>
  );
}
