import { useEffect, useRef, useState } from "react";
import { sfx } from "../audio/sound";
import { useGame } from "../state/store";

export function CountdownRing({
  seconds,
  onDone,
  size = 96,
}: {
  seconds: number;
  onDone?: () => void;
  size?: number;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const soundOn = useGame((s) => s.soundOn);
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    setRemaining(seconds);
    const start = Date.now();
    const iv = window.setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const r = Math.max(0, seconds - elapsed);
      setRemaining(r);
      if (soundOn && r > 0 && r <= 5 && Math.floor(r * 10) % 10 === 0) sfx.tick();
      if (r <= 0 && !doneRef.current) {
        doneRef.current = true;
        window.clearInterval(iv);
        onDone?.();
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, [seconds, onDone, soundOn]);

  const pct = remaining / seconds;
  const stroke = 6;
  const r = size / 2 - stroke;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);
  const color =
    pct > 0.5 ? "var(--primary)" : pct > 0.2 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-white/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          className="fill-none transition-[stroke-dashoffset]"
          style={{
            stroke: color,
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            filter: `drop-shadow(0 0 8px ${color})`,
          }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span
          className="font-mono font-bold tabular-nums"
          style={{ fontSize: size * 0.28, color }}
        >
          {Math.ceil(remaining)}
        </span>
      </div>
    </div>
  );
}
