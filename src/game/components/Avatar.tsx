import { cn } from "@/lib/utils";

export function Avatar({
  name,
  hue,
  size = 40,
  connected = true,
  avatarUrl,
  className,
}: {
  name: string;
  hue: number;
  size?: number;
  connected?: boolean;
  avatarUrl?: string;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full rounded-full object-cover"
          style={{ boxShadow: `0 6px 20px -6px hsl(${hue} 70% 40% / 0.6)` }}
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center rounded-full font-display font-semibold"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 80% 40%))`,
            color: "white",
            fontSize: size * 0.4,
            boxShadow: `0 6px 20px -6px hsl(${hue} 70% 40% / 0.6)`,
          }}
        >
          {initials}
        </div>
      )}
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2",
          connected ? "bg-[oklch(0.75_0.18_155)]" : "bg-muted-foreground animate-pulse"
        )}
        style={{ borderColor: "var(--background)" }}
      />
    </div>
  );
}

export function AvatarStack({
  players,
  max = 5,
  size = 36,
}: {
  players: { id: string; name: string; avatarHue: number; connected: boolean }[];
  max?: number;
  size?: number;
}) {
  const shown = players.slice(0, max);
  const extra = players.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar name={p.name} hue={p.avatarHue} size={size} connected={p.connected} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="ml-[-10px] grid place-items-center rounded-full border-2 bg-muted text-xs font-semibold text-muted-foreground"
          style={{ width: size, height: size, borderColor: "var(--background)" }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
