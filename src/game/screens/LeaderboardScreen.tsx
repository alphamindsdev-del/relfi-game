import { useState } from "react";
import { Leaderboard } from "../components/Leaderboard";
import { useGame } from "../state/store";
import { useAuth } from "../state/auth-store";
import { ArrowRight, LogOut, XCircle } from "lucide-react";
import { ConfirmModal } from "../components/ConfirmModal";

export function LeaderboardScreen() {
  const players = useGame((s) => s.players);
  const youId = useGame((s) => s.youId);
  const roundIndex = useGame((s) => s.roundIndex);
  const hostAdvanceRound = useGame((s) => s.hostAdvanceRound);
  const hostEndGame = useGame((s) => s.hostEndGame);
  const resetGame = useGame((s) => s.resetGame);
  const hostUserId = useGame((s) => s.hostUserId);
  const mode = useGame((s) => s.mode);
  const revealData = useGame((s) => s.revealData);
  const user = useAuth((s) => s.user);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const youGotItRight = !!revealData?.perPlayerAnswers?.find((a: any) => a.userId === youId)?.isCorrect;

  const handleNextRound = () => {
    hostAdvanceRound()
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 pt-16 pb-12">
      <div className="flex w-full items-center justify-between">
        <button
          onClick={() => setConfirmLeave(true)}
          className="rounded-full border p-1.5 text-muted-foreground hover:text-foreground hover:bg-card"
          title="Leave game"
        >
          <LogOut className="h-4 w-4" />
        </button>
        {user && hostUserId && user.id === hostUserId && (
          <button
            onClick={() => setConfirmEnd(true)}
            className="rounded-full border p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive"
            title="End game"
          >
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">After round {roundIndex}</div>
      <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">Standings</h1>

      <div className="mt-10 w-full max-w-lg">
        {mode === 'solo' ? (
          !youGotItRight && (
            <p className="mb-4 text-center text-sm text-muted-foreground">You didn't get it right this round.</p>
          )
        ) : (
          players.length > 0 && players.every((p) => p.tokens === 0) && (
            <p className="mb-4 text-center text-sm text-muted-foreground">No one got it right. No winners this round.</p>
          )
        )}
        <Leaderboard players={players} youId={youId} />
      </div>

      {user && hostUserId && user.id === hostUserId ? (
        <button
          onClick={handleNextRound}
          className="mt-12 inline-flex items-center gap-2 rounded-full bg-primary-gradient px-8 py-4 font-display font-bold uppercase tracking-widest text-primary-foreground shadow-lock"
        >
          Next round <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <p className="mt-12 text-sm text-muted-foreground">Next round starting…</p>
      )}

      <ConfirmModal
        open={confirmLeave}
        title="Leave game?"
        message="You will be disconnected and return to the home screen."
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
