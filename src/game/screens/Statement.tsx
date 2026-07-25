import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Eye, LogOut, XCircle } from "lucide-react";
import { StatementCard } from "../components/StatementCard";
import { CategoryChip } from "../components/CategoryChip";
import { CountdownRing } from "../components/CountdownRing";
import { SecretRoomModal } from "../components/SecretRoomModal";
import { LockInButton } from "../components/LockInButton";
import { AvatarStack } from "../components/Avatar";
import { ConfirmModal } from "../components/ConfirmModal";
import { useGame, useYouRound } from "../state/store";
import { useAuth } from "../state/auth-store";
import { sfx } from "../audio/sound";
import { parseClueVariant, apiCardToStatementCard } from "../lib/types";
import type { StatementCard as StatementCardType } from "../lib/types";

export function Statement() {
  const you = useYouRound();
  const categories = useGame((s) => s.categories);
  const players = useGame((s) => s.players);
  const youId = useGame((s) => s.youId);
  const round = useGame((s) => s.round);
  const roundIndex = useGame((s) => s.roundIndex);
  const clue = useGame((s) => s.clue);
  const timerSeconds = useGame((s) => s.timerSeconds);
  const soundOn = useGame((s) => s.soundOn);
  const setPick = useGame((s) => s.setPick);
  const lockIn = useGame((s) => s.lockIn);
  const youRole = useGame((s) => s.youRole);
  const hostEndGame = useGame((s) => s.hostEndGame);
  const resetGame = useGame((s) => s.resetGame);
  const hostUserId = useGame((s) => s.hostUserId);
  const user = useAuth((s) => s.user);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const [secretOpen, setSecretOpen] = useState(false);

  const clueVariant = useMemo(() => {
    if (!clue) return { kind: 'none' as const }
    return parseClueVariant(clue.variant, clue.payload)
  }, [clue])

  if (!you) return null;
  const locked = you.locked;
  const waitingOthers = Object.values(round).filter((r) => !r.locked);

  const handleLock = () => {
    if (!you.pick) return
    lockIn(youId, you.pick)
    if (soundOn) sfx.lock()
  }

  const handlePick = (categoryId: string) => {
    if (locked) return
    if (soundOn) sfx.select()
    setPick(youId, categoryId)
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 py-8">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmLeave(true)}
            className="rounded-full border p-1.5 text-muted-foreground hover:text-foreground hover:bg-card"
            title="Leave game"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Round {roundIndex + 1}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user && hostUserId && user.id === hostUserId && (
            <button
              onClick={() => setConfirmEnd(true)}
              className="rounded-full border p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive"
              title="End game"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
          <CountdownRing seconds={timerSeconds} size={72} />
        </div>
      </div>

      <div className="mt-8 w-full">
        <div className="rounded-2xl border bg-card-elevated p-6 md:p-8">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Statement</div>
          <p className="mt-3 font-display text-xl leading-relaxed md:text-2xl">
            {useGame.getState().statementText || 'Analyze the statement and choose the correct category.'}
          </p>
          <div className="mt-4 text-xs text-muted-foreground">
            What kind of statement is this?
          </div>
        </div>
      </div>

      {youRole === "seer" && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={() => setSecretOpen(true)}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20"
        >
          <Eye className="h-4 w-4" />
          Enter Secret Room
        </motion.button>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-2 md:gap-3">
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            category={c}
            selected={you.pick === c.id}
            disabled={locked}
            onClick={() => handlePick(c.id)}
          />
        ))}
      </div>

      <div className="mt-10">
        <LockInButton disabled={!you.pick} locked={locked} onLock={handleLock} />
      </div>

      {locked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-8 flex items-center gap-3 text-sm text-muted-foreground"
        >
          <span className="animate-heartbeat">Waiting for {waitingOthers.length}…</span>
          <AvatarStack
            players={players.filter((p) => waitingOthers.some((r) => r.playerId === p.id))}
            size={28}
          />
        </motion.div>
      )}

      <SecretRoomModal
        open={secretOpen}
        onClose={() => setSecretOpen(false)}
        clue={clueVariant}
        categories={categories}
      />

      <ConfirmModal
        open={confirmLeave}
        title="Leave game?"
        message="You will be disconnected from this round."
        onConfirm={() => { setConfirmLeave(false); resetGame() }}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmModal
        open={confirmEnd}
        title="End game now?"
        message="The game will end immediately and final standings will be shown."
        confirmLabel="End Game"
        onConfirm={() => { setConfirmEnd(false); hostEndGame() }}
        onCancel={() => setConfirmEnd(false)}
      />
    </div>
  );
}
