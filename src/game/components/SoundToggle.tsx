import { Volume2, VolumeX } from "lucide-react";
import { useGame } from "../state/store";
import { unlockAudio } from "../audio/sound";

export function SoundToggle() {
  const soundOn = useGame((s) => s.soundOn);
  const toggle = useGame((s) => s.toggleSound);
  return (
    <button
      onClick={() => {
        unlockAudio();
        toggle();
      }}
      aria-label={soundOn ? "Mute" : "Unmute"}
      className="grid h-10 w-10 place-items-center rounded-full border bg-card/60 backdrop-blur transition-colors hover:bg-card"
    >
      {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}
