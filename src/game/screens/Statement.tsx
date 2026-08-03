import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Eye, LogOut, XCircle, ArrowRight, ThumbsUp } from "lucide-react";
import { CategoryChip } from "../components/CategoryChip";
import { CountdownRing } from "../components/CountdownRing";
import { SecretRoomModal } from "../components/SecretRoomModal";
import { LockInButton } from "../components/LockInButton";
import { AvatarStack } from "../components/Avatar";
import { ConfirmModal } from "../components/ConfirmModal";
import { useGame, useYouRound } from "../state/store";
import { useAuth } from "../state/auth-store";
import { sfx } from "../audio/sound";
import { parseClueVariant } from "../lib/types";

export function Statement() {
  const you = useYouRound();
  const categories = useGame((s) => s.categories);
  const players = useGame((s) => s.players);
  const youId = useGame((s) => s.youId);
  const round = useGame((s) => s.round);
  const roundIndex = useGame((s) => s.roundIndex);
  const clue = useGame((s) => s.clue);
  const timerSeconds = useGame((s) => s.timerSeconds);
  const timerEnd = useGame((s) => s.timerEnd);
  const soundOn = useGame((s) => s.soundOn);
  const youRole = useGame((s) => s.youRole);
  const mode = useGame((s) => s.mode);
  const maxRounds = useGame((s) => s.maxRounds);
  const hostUserId = useGame((s) => s.hostUserId);
  const seerPicks = useGame((s) => s.seerPicks);
  const statementImageUrl = useGame((s) => s.statementImageUrl);
  const user = useAuth((s) => s.user);
  const isHost = user && hostUserId === user.id;

  const setPick = useGame((s) => s.setPick);
  const lockIn = useGame((s) => s.lockIn);
  const hostForceReveal = useGame((s) => s.hostForceReveal);
  const hostEndGame = useGame((s) => s.hostEndGame);
  const resetGame = useGame((s) => s.resetGame);

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);

  const clueVariant = useMemo(() => {
    if (!clue) return { kind: 'none' as const }
    return parseClueVariant(clue.variant, clue.payload, clue.clueType, clue.clueContent)
  }, [clue])

  const isSeer = youRole === 'seer';
  const isSoloMode = mode === 'solo';

  if (!you) return null;
  const locked = you.locked;
  const waitingOthers = Object.values(round).filter((r) => !r.locked && r.playerId !== youId);

  // There is exactly one seer per round; find them if they have revealed their pick.
  const revealedSeer = players.find((p) => seerPicks[p.id]);
  const seerPick = revealedSeer ? seerPicks[revealedSeer.id] : undefined;
  const currentCategory = (id: string) => categories.find((c) => c.id === id);

  const handleLock = () => {
    if (!you.pick) return
    lockIn(youId, you.pick)
  }

  const handlePick = (categoryId: string) => {
    if (locked) return
    if (soundOn) sfx.select()
    setPick(youId, categoryId)
  }

  const handleFollow = () => {
    if (!revealedSeer || !seerPick) return
    lockIn(youId, seerPick, 'follow', revealedSeer.id)
  }

  const handleSolo = () => {
    if (!you.pick) return
    lockIn(youId, you.pick, 'solo')
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 pt-16 pb-8">
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
            Round {roundIndex + 1}{maxRounds > 0 ? ` of ${maxRounds}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isHost && (
            <button
              onClick={() => setConfirmEnd(true)}
              className="rounded-full border p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive"
              title="End game"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
          <CountdownRing seconds={timerSeconds} endsAt={timerEnd || undefined} size={72} />
        </div>
      </div>

      <div className="mt-8 w-full">
        <div className="rounded-2xl border bg-card-elevated p-6 md:p-8">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Statement</div>
          {statementImageUrl ? (
            <div className="mt-4 flex justify-center">
              <img
                src={statementImageUrl}
                alt="Statement"
                className="max-h-[55vh] w-auto max-w-full rounded-2xl object-contain shadow-elevated"
              />
            </div>
          ) : (
            <p className="mt-3 font-display text-xl leading-relaxed md:text-2xl">
              {useGame.getState().statementText || 'Analyze the statement and choose the correct category.'}
            </p>
          )}
          <div className="mt-4 text-xs text-muted-foreground">
            What kind of statement is this?
          </div>
        </div>
      </div>

      {isSeer && (
        <div className="mt-6 w-full">
          {!locked && (
            <div className="mb-3 text-xs uppercase tracking-widest text-primary">Pick your mapping</div>
          )}
          {!locked ? (
            <>
              <div className="flex flex-wrap justify-center gap-2 md:gap-3">
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
              <div className="mt-6 text-center">
                <LockInButton disabled={!you.pick} locked={locked} onLock={handleLock} />
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-primary/30 bg-primary/10 p-6 text-center"
            >
              <Eye className="mx-auto h-6 w-6 text-primary" />
              <div className="mt-2 font-display text-lg font-bold">Your pick is locked</div>
              <div className="text-xs text-muted-foreground">
                The others can now follow your pick or go solo.
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Non-seer answering: wait for the Seer to map first, then follow or go solo */}
      {!isSeer && isSoloMode && (
        <div className="mt-8 w-full">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Pick your mapping</div>
          <div className="flex flex-wrap justify-center gap-2 md:gap-3">
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
          <div className="mt-6">
            <LockInButton disabled={!you.pick} locked={locked} onLock={handleLock} />
          </div>
        </div>
      )}

      {!isSeer && !isSoloMode && (
        <div className="mt-8 w-full">
          {!revealedSeer && (
            <>
              <p className="mb-4 text-center text-sm text-muted-foreground animate-heartbeat">
                Waiting for the Seer to map first...
              </p>
              <div className="flex flex-wrap justify-center gap-2 md:gap-3 opacity-60">
                {categories.map((c) => (
                  <CategoryChip key={c.id} category={c} disabled />
                ))}
              </div>
            </>
          )}

          {revealedSeer && seerPick && (
            <>
              <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">The Seer mapped</div>
                <div className="mt-1 flex items-center gap-3">
                  <div className="text-sm font-semibold">{revealedSeer.name}</div>
                  {currentCategory(seerPick) && (
                    <CategoryChip category={currentCategory(seerPick)!} selected disabled />
                  )}
                </div>
              </div>

              {!locked ? (
                <>
                  <button
                    onClick={handleFollow}
                    className="mt-2 flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:bg-card"
                  >
                    <ThumbsUp className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-semibold">Follow the Seer</div>
                      <div className="text-xs text-muted-foreground">
                        Lock the Seer&apos;s pick. If the Seer is right, you both earn.
                      </div>
                    </div>
                  </button>

                  <div className="mb-3 mt-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
                    Or go solo — choose your own mapping
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 md:gap-3">
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
                  <div className="mt-6">
                    <LockInButton disabled={!you.pick} locked={locked} onLock={handleSolo} />
                  </div>
                </>
              ) : (
                <p className="mt-4 text-center text-sm text-muted-foreground">Your pick is locked.</p>
              )}
            </>
          )}
        </div>
      )}

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

      {/* Secret Room button for the seer */}
      {isSeer && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={() => setSecretOpen(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20"
        >
          <Eye className="h-4 w-4" />
          View Secret Room
        </motion.button>
      )}

      {/* Host: reveal now */}
      {isHost && !locked && (
        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            onClick={hostForceReveal}
            className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-primary/10 px-8 py-4 font-display font-bold uppercase tracking-widest text-primary hover:bg-primary/20 shadow-lock"
          >
            <ArrowRight className="h-4 w-4" /> Reveal Now
          </button>
        </div>
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