import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, Play, Loader2, AlertCircle, Eye } from "lucide-react";
import { getTutorialInfo } from "../lib/api";

export const Route = createFileRoute("/tutorial")({
  head: () => ({
    meta: [
      { title: "Rel-Fi: How to Play" },
      { name: "robots", content: "index" },
    ],
  }),
  component: TutorialPage,
});

function TutorialPage() {
  const [info, setInfo] = useState<{ exists: boolean; url?: string; filename?: string; uploadedAt?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getTutorialInfo()
      .then(setInfo)
      .catch(() => setError("Failed to load tutorial"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="relfi-root flex min-h-screen items-center justify-center bg-hero">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="relfi-root min-h-screen bg-hero">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8">
        <header className="mb-8 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to game
          </Link>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-bold">Rel-Fi Tutorial</span>
          </div>
        </header>

        {error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link to="/" className="text-sm text-primary underline">Go home</Link>
          </div>
        )}

        {!error && info && !info.exists && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Play className="h-16 w-16 text-muted-foreground/40" />
            <h2 className="font-display text-2xl font-bold">No tutorial available yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              The tutorial video hasn't been uploaded yet. Check back later or start a game to learn as you play.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-primary-gradient px-6 py-3 font-bold text-primary-foreground shadow-lock"
            >
              <Play className="h-4 w-4" fill="currentColor" />
              Start playing
            </Link>
          </div>
        )}

        {!error && info && info.exists && info.url && (
          <div className="flex flex-1 flex-col gap-6">
              <div className="rounded-2xl overflow-hidden border bg-black aspect-video">
              <video
                key={info.url}
                className="h-full w-full"
                controls
                autoPlay
                playsInline
              >
                <source src={info.url} type={info.url!.endsWith('.webm') ? 'video/webm' : info.url!.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'} />
                Your browser does not support video playback.
              </video>
            </div>
            <div className="rounded-2xl border bg-card-elevated p-6">
              <h3 className="font-display text-lg font-bold">Welcome to Rel-Fi</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                This tutorial walks you through everything you need to know: the five AROPE fiction patterns,
                how each round works, how to be a Seer, how to think like a Skeptic, and how to win.
                Watch the video above, then jump into a game to practice.
              </p>
              <div className="mt-4 flex gap-3">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-full bg-primary-gradient px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lock"
                >
                  <Play className="h-4 w-4" fill="currentColor" />
                  Play now
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}