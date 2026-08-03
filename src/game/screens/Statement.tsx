import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Eye, LogOut, XCircle, ArrowRight, ThumbsUp, UserX } from "lucide-react";
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
  const phase = useGame((s) => s.phase);
  const youRole = useGame((s) => s.youRole);
  const hostUserId = useGame((s) => s.hostUserId);
  const seerPicks = useGame((s) => s.seerPicks);
  const statementImageUrl = useGame((s) => s.statementImageUrl);
  const user = useAuth((s) => s.user);
  const isHost = user && hostUserId === user.id;

  const setPick = useGame((s) => s.setPick);
  const lockIn = useGame((s) => s.lockIn);
  const hostStartPersuasion = useGame((s) => s.hostStartPersuasion);
  const hostForceReveal = useGame((s) => s.hostForceReveal);
  const hostEndGame = useGame((s) => s.hostEndGame);
  const skepticDecision = useGame((s) => s.skepticDecision);
  const resetGame = useGame((s) => s.resetGame);

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [skepticChosen, setSkepticChosen] = useState<'follow' | 'solo' | null>(null);
  const [trustedSeerId, setTrustedSeerId] = useState<string | undefined>(undefined);

  const clueVariant = useMemo(() => {
    if (!clue) return { kind: 'none' as const }
    return parseClueVariant(clue.variant, clue.payload, clue.clueType, clue.clueContent)
  }, [clue])

  const isLockin = phase === 'lockin';
  const isStatement = phase === 'statement';
  const isSeer = youRole === 'seer';

  if (!you) return null;
  const locked = you.locked;
  const waitingOthers = Object.values(round).filter((r) => !r.locked && r.playerId !== youId);

  // Find seers who have revealed their picks
  const revealedSeers = players.filter((p) => seerPicks[p.id])
  const currentCategory = (id: string) => categories.find((c) => c.id === id)

  const handleLock = () => {
    if (!you.pick) return
    lockIn(youId, you.pick)
  }

  const handlePick = (categoryId: string) => {
    if (locked) return
    if (soundOn) sfx.select()
    setPick(youId, categoryId)
  }

  const handleSkepticFollow = () => {
    if (!trustedSeerId || !seerPicks[trustedSeerId]) return
    const seerPick = seerPicks[trustedSeerId]
    skepticDecision('follow', trustedSeerId)
    setPick(youId, seerPick)
    lockIn(youId, seerPick)
  }

  const handleSkepticSolo = () => {
    if (!you.pick) return
    skepticDecision('solo', undefined)
    lockIn(youId, you.pick)
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
            Round {roundIndex + 1} {isLockin ? ': Lock in' : ''}
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

      {/* Seer: reveal picks from seers who have locked */}
      {revealedSeers.length > 0 && (
        <div className="mt-6 w-full space-y-2">
          <div className="text-xs uppercase tracking-widest text-primary">Seer Picks Revealed</div>
          {revealedSeers.map((seer) => {
            const cat = currentCategory(seerPicks[seer.id])
            return (
              <div key={seer.id} className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold">{seer.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Seer</div>
                </div>
                {cat && (
                  <CategoryChip category={cat} selected disabled />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Seer: pick during statement phase (before persuasion) */}
      {isStatement && isSeer && !locked && (
        <div className="mt-8 w-full">
          <div className="mb-3 text-xs uppercase tracking-widest text-primary">Pick your mapping</div>
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
        </div>
      )}

      {/* Seer: already locked during statement */}
      {isStatement && isSeer && locked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-8 rounded-2xl border border-primary/30 bg-primary/10 p-6 text-center"
        >
          <Eye className="mx-auto h-6 w-6 text-primary" />
          <div className="mt-2 font-display text-lg font-bold">Your pick is locked</div>
          <div className="text-xs text-muted-foreground">Other players can see your mapping</div>
        </motion.div>
      )}

      {/* Secret Room button for seers */}
      {isSeer && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={() => setSecretOpen(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20"
        >
          <Eye className="h-4 w-4" />
          {isStatement ? 'Open Secret Room' : 'View Secret Room'}
        </motion.button>
      )}

      {/* Non-seer: waiting during statement phase */}
      {isStatement && !isSeer && (
        <div className="mt-10 text-center text-sm text-muted-foreground animate-heartbeat">
          Seers are analyzing the statement...
        </div>
      )}

      {/* Host: start persuasion button (only in statement phase) */}
      {isStatement && isHost && (
        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            onClick={hostStartPersuasion}
            className="inline-flex items-center gap-2 rounded-full bg-primary-gradient px-8 py-4 font-display font-bold uppercase tracking-widest text-primary-foreground shadow-lock"
          >
            <ArrowRight className="h-4 w-4" /> Start Persuasion
          </button>
        </div>
      )}

      {/* Host: skip the lock-in countdown and reveal now */}
      {isLockin && isHost && (
        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            onClick={hostForceReveal}
            className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-primary/10 px-8 py-4 font-display font-bold uppercase tracking-widest text-primary hover:bg-primary/20 shadow-lock"
          >
            <ArrowRight className="h-4 w-4" /> Reveal Now
          </button>
        </div>
      )}

      {/* Lock-in phase: skeptic decision */}
      {isLockin && youRole === 'skeptic' && !locked && !skepticChosen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 w-full max-w-md"
        >
          <div className="mb-4 text-center text-xs uppercase tracking-widest text-primary">
            Make your decision
          </div>

          <div className="space-y-2">
            {revealedSeers.map((seer) => {
              const cat = currentCategory(seerPicks[seer.id])
              return (
                <button
                  key={seer.id}
                  onClick={() => { setTrustedSeerId(seer.id); setSkepticChosen('follow') }}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    trustedSeerId === seer.id ? 'border-primary bg-primary/10' : 'hover:bg-card'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ThumbsUp className={`h-5 w-5 ${trustedSeerId === seer.id ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <div className="font-semibold">Follow {seer.name}</div>
                      {cat && <div className="text-xs text-muted-foreground">Lock {cat.name}</div>}
                    </div>
                  </div>
                </button>
              )
            })}
            <button
              onClick={() => { setTrustedSeerId(undefined); setSkepticChosen('solo') }}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                skepticChosen === 'solo' && !trustedSeerId ? 'border-muted-foreground bg-muted/30' : 'hover:bg-card'
              }`}
            >
              <div className="flex items-center gap-3">
                <UserX className="h-6 w-6 text-muted-foreground" />
                <div>
                  <div className="font-semibold">Go Solo</div>
                  <div className="text-xs text-muted-foreground">Pick your own category</div>
                </div>
              </div>
            </button>
          </div>

          {skepticChosen === 'follow' && trustedSeerId && (
            <button
              onClick={handleSkepticFollow}
              className="mt-4 w-full rounded-2xl bg-primary-gradient px-6 py-4 font-bold text-primary-foreground shadow-lock"
            >
              Confirm: Follow the Seer
            </button>
          )}

          {skepticChosen === 'solo' && (
            <div className="mt-6">
              <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Pick your category</div>
              <div className="flex flex-wrap justify-center gap-2">
                {categories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    category={c}
                    selected={you.pick === c.id}
                    onClick={() => handlePick(c.id)}
                  />
                ))}
              </div>
              <button
                onClick={handleSkepticSolo}
                disabled={!you.pick}
                className="mt-4 w-full rounded-2xl bg-primary-gradient px-6 py-4 font-bold text-primary-foreground shadow-lock disabled:opacity-50"
              >
                Lock Solo Pick
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Skeptic locked confirmation */}
      {isLockin && youRole === 'skeptic' && locked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center"
        >
          <div className="text-xs uppercase tracking-widest text-primary">Decision Locked</div>
          <div className="mt-2 font-display text-2xl font-bold capitalize">
            {you.decision === 'follow' ? 'Following the Seer' : 'Going Solo'}
          </div>
        </motion.div>
      )}

      {/* Lock-in phase: non-skeptics pick normally */}
      {isLockin && youRole !== 'skeptic' && (
        <>
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
        </>
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