import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { useState } from "react";

export function RoomCodeDisplay({ code, joinUrl }: { code: string; joinUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const url = joinUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/?join=${code}` : `/?join=${code}`);
  return (
    <div className="flex flex-col items-center gap-6 rounded-3xl border bg-card-elevated p-6 md:flex-row md:p-8">
      <div className="rounded-2xl bg-white p-3">
        <QRCodeSVG value={url} size={140} bgColor="#ffffff" fgColor="#0B0B0D" level="M" />
      </div>
      <div className="flex flex-col items-center md:items-start">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Room code</div>
        <div className="mt-1 font-mono text-5xl font-bold tracking-[0.3em] text-shimmer md:text-6xl">{code}</div>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
    </div>
  );
}
