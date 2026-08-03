import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { LogOut, XCircle, MessageCircle, ArrowRight, Eye } from "lucide-react";
import { CategoryChip } from "../components/CategoryChip";
import { useGame } from "../state/store";
import { useAuth } from "../state/auth-store";
import { Avatar } from "../components/Avatar";
import { CountdownRing } from "../components/CountdownRing";
import { SecretRoomModal } from "../components/SecretRoomModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { parseClueVariant } from "../lib/types";

export function Persuasion() {
  const players = useGame((s) => s.players);
  const youId = useGame((s) => s.youId);
  const youRole = useGame((s) => s.youRole);
  const speakingUserId = useGame((s) => s.speakingUserId);
  const phase = useGame((s) => s.phase);
  const hostUserId = useGame((s) => s.hostUserId);
  const clue = useGame((s) => s.clue);
  const timerSeconds = useGame((s) => s.timerSeconds);
  const timerEnd = useGame((s) => s.timerEnd);
  const seerPicks = useGame((s) => s.seerPicks);
  const categories = useGame((s) => s.categories);
  const statementImageUrl = useGame((s) => s.statementImageUrl);
  const user = useAuth((s) => s.user);

  const hostStartPersuasion = useGame((s) => s.hostStartPersuasion);
  const hostStartLockin = useGame((s) => s.hostStartLockin);
  const hostNextSpeaker = useGame((s) => s.hostNextSpeaker);
  const hostEndGame = useGame((s) => s.hostEndGame);
  const resetGame = useGame((s) => s.resetGame);

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);

  const isHost = user && hostUserId === user.id;
  const currentSpeaker = players.find((p) => p.id === speakingUserId);

  const clueVariant = useMemo(() => {
    if (!clue) return { kind: 'none' as const }
    return parseClueVariant(clue.variant, clue.payload, clue.clueType, clue.clueContent)
  }, [clue])

  const revealedSeers = players.filter((p) => seerPicks[p.id])
  const currentCategory = (id: string) => categories.find((c) => c.id === id)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 pt-16 pb-8">
      <div className="flex w-full items-center justify-between">
        <button
          onClick={() => setConfirmLeave(true)}
          className="rounded-full border p-1.5 text-muted-foreground hover:text-foreground hover:bg-card"
          title="Leave game"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Persuasion Phase</div>
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

      <div className="mt-6 w-full">
        <div className="rounded-2xl border bg-card-elevated p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Statement</div>
          {statementImageUrl ? (
            <div className="mt-4 flex justify-center">
              <img
                src={statementImageUrl}
                alt="Statement"
                className="max-h-[55vh] w-auto max-w-full rounded-2xl object-contain"
              />
            </div>
          ) : (
            <p className="mt-3 font-display text-xl leading-relaxed md:text-2xl">
              {useGame.getState().statementText}
            </p>
          )}
        </div>
      </div>

      {/* Revealed seer picks */}
      {revealedSeers.length > 0 && (
        <div className="mt-6 w-full space-y-2">
          <div className="text-xs uppercase tracking-widest text-primary">Seer Mappings</div>
          {revealedSeers.map((seer) => {
            const cat = currentCategory(seerPicks[seer.id])
            return (
              <div key={seer.id} className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <Avatar name={seer.name} hue={seer.avatarHue} size={36} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{seer.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {seer.id === speakingUserId ? 'Currently pitching' : 'Seer'}
                  </div>
                </div>
                {cat && <CategoryChip category={cat} selected disabled />}
              </div>
            )
          })}
        </div>
      )}

      {/* Current speaker indicator */}
      {currentSpeaker && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-6 flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4"
        >
          <Avatar name={currentSpeaker.name} hue={currentSpeaker.avatarHue} size={48} />
          <div>
            <div className="font-semibold">{currentSpeaker.name}</div>
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary">
              <MessageCircle className="h-3 w-3" />
              Currently pitching
            </div>
          </div>
        </motion.div>
      )}

      {/* Secret Room for seers */}
      {youRole === 'seer' && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setSecretOpen(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20"
        >
          <Eye className="h-4 w-4" />
          View Secret Room
        </motion.button>
      )}

      {/* Host controls */}
      {isHost && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={hostNextSpeaker}
            className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold hover:bg-card"
          >
            Next Speaker
          </button>
          <button
            onClick={hostStartLockin}
            className="inline-flex items-center gap-2 rounded-full bg-primary-gradient px-6 py-3 font-bold text-primary-foreground shadow-lock"
          >
            <ArrowRight className="h-4 w-4" /> Start Lock-in
          </button>
        </div>
      )}

      {/* Non-host waiting */}
      {!isHost && (
        <p className="mt-8 text-sm text-muted-foreground animate-heartbeat">
          {currentSpeaker ? `Listening to ${currentSpeaker.name}...` : 'Waiting for the host to start...'}
        </p>
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