import { Leaderboard } from "../components/Leaderboard";
import { useGame } from "../state/store";
import { ArrowRight } from "lucide-react";

export function LeaderboardScreen() {
  const players = useGame((s) => s.players);
  const youId = useGame((s) => s.youId);
  const roundIndex = useGame((s) => s.roundIndex);
  const hostAdvanceRound = useGame((s) => s.hostAdvanceRound);

  const handleNextRound = () => {
    hostAdvanceRound()
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center px-6 py-12">
      <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">After round {roundIndex}</div>
      <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">Standings</h1>

      <div className="mt-10 w-full max-w-lg">
        <Leaderboard players={players} youId={youId} />
      </div>

      <button
        onClick={handleNextRound}
        className="mt-12 inline-flex items-center gap-2 rounded-full bg-primary-gradient px-8 py-4 font-display font-bold uppercase tracking-widest text-primary-foreground shadow-lock"
      >
        Next round <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
