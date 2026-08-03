import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Play, LogIn, UserPlus, Mail, ArrowLeft, Loader2, Send, Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useGame } from "../state/store";
import { useAuth } from "../state/auth-store";
import { unlockAudio } from "../audio/sound";
import * as api from "../lib/api";
import type { ApiDeck } from "../lib/types";

export function Landing() {
  const startGame = useGame((s) => s.startGame);
  const createAndHost = useGame((s) => s.createAndHost);
  const joinByCode = useGame((s) => s.joinByCode);
  const user = useAuth((s) => s.user);
  const login = useAuth((s) => s.login);
  const signup = useAuth((s) => s.signup);
  const logout = useAuth((s) => s.logout);
  const authLoading = useAuth((s) => s.loading);

  const [mode, setMode] = useState<"idle" | "host" | "join" | "login" | "signup" | "magic-link" | "profile">("idle");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [authError, setAuthError] = useState("");
  const [decks, setDecks] = useState<ApiDeck[]>([]);
  const [deckError, setDeckError] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedMode, setSelectedMode] = useState<"seer_skeptic" | "multiplayer_seer" | "solo">("seer_skeptic");
  const [timerSeconds, setTimerSeconds] = useState(45);
  const [loading, setLoading] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [pendingJoinCode, setPendingJoinCode] = useState("");
  const initialized = useAuth((s) => s.initialized);

  useEffect(() => {
    if (mode === "host" && user) {
      api.getDecks(true).then(setDecks).catch(() => setDeckError('Failed to load decks. Check your connection.'))
    }
  }, [mode, user])

  useEffect(() => {
    if (!initialized) return
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const joinCode = params.get('join')
    if (joinCode && joinCode.length === 5) {
      if (user) {
        joinByCode(joinCode).catch(() => setMode('join'))
      } else {
        setPendingJoinCode(joinCode)
        setMode('login')
      }
    }
  }, [initialized])

  function handleHost() {
    unlockAudio()
    if (!user) {
      setMode("login")
      return
    }
    setMode("host")
  }

  async function handleCreateGame() {
    if (!selectedDeckId) return
    setLoading(true)
    try {
      await createAndHost(selectedDeckId, selectedMode)
    } catch (e: any) {
      setAuthError(e.message || "Failed to create room")
    }
    setLoading(false)
  }

  useEffect(() => {
    useGame.setState({ timerSeconds })
  }, [timerSeconds])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 5) return
    setLoading(true)
    setJoinError("")
    if (!user) {
      setMode("login")
      setLoading(false)
      return
    }
    try {
      await joinByCode(code)
    } catch (e: any) {
      setJoinError(e.message || "Room not found")
    }
    setLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthError("")
    try {
      await login(email, password)
      if (pendingJoinCode) {
        const code = pendingJoinCode
        setPendingJoinCode("")
        await joinByCode(code)
      } else {
        setMode("idle")
      }
    } catch (e: any) {
      setAuthError(e.message || "Login failed")
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setAuthError("")
    try {
      await signup(email, password, displayName)
      if (pendingJoinCode) {
        const code = pendingJoinCode
        setPendingJoinCode("")
        await joinByCode(code)
      } else {
        setMode("idle")
      }
    } catch (e: any) {
      setAuthError(e.message || "Signup failed")
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="absolute inset-0 -z-10 bg-hero" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center"
      >
        <div className="text-xs uppercase tracking-[0.4em] text-primary">Rel-Fi</div>
        <h1 className="mt-3 font-display text-6xl font-black leading-none md:text-8xl">
          Read the card.<br />
          <span className="text-shimmer">Map the fiction.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-sm text-muted-foreground md:text-base">
          A live social deduction party game. Bluff, decode, and lock in one statement at a time.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8 }}
        className="mt-12 w-full max-w-md rounded-3xl border p-6 md:p-8 bg-card-elevated"
      >
        {mode === "idle" && (
          <div className="flex flex-col gap-3">
            {user && (
              <div className="mb-2 text-center text-xs text-muted-foreground">
                Logged in as <span className="text-foreground">{user.display_name}</span>
                <button onClick={logout} className="ml-2 underline hover:text-primary">sign out</button>
                <button onClick={() => { setProfileName(user.display_name); setProfileAvatar(user.avatar_url || ''); setProfileError(""); setProfileSuccess(""); setMode("profile") }} className="ml-2 underline hover:text-primary">edit profile</button>
              </div>
            )}
            <button
              onClick={handleHost}
              className="group inline-flex items-center justify-between rounded-2xl bg-primary-gradient px-6 py-5 font-display text-lg font-bold text-primary-foreground shadow-lock transition-transform hover:scale-[1.02]"
            >
              <span className="inline-flex items-center gap-3">
                <Play className="h-5 w-5" fill="currentColor" />
                Host a game
              </span>
              <span className="text-sm opacity-70 group-hover:opacity-100">→</span>
            </button>
            <button
              onClick={() => { unlockAudio(); setMode("join"); }}
              className="inline-flex items-center justify-between rounded-2xl border px-6 py-5 font-display text-lg font-semibold hover:bg-card"
            >
              <span className="inline-flex items-center gap-3">
                <LogIn className="h-5 w-5" />
                Join with code
              </span>
              <span className="text-sm text-muted-foreground">→</span>
            </button>
            {!user && (
              <button
                onClick={() => setMode("login")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border px-6 py-4 text-sm font-semibold hover:bg-card"
              >
                <UserPlus className="h-4 w-4" />
                Sign in / Create account
              </button>
            )}
            <Link
              to="/tutorial"
              className="mt-2 inline-flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Play className="h-3 w-3" />
              How to play: watch the tutorial
            </Link>
          </div>
        )}

        {mode === "host" && user && (
          <div className="flex flex-col gap-4">
            <h3 className="text-center font-display text-lg font-bold">Host a Game</h3>

            {decks.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">Loading decks...</p>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Choose a Deck</label>
                {decks.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDeckId(d.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${selectedDeckId === d.id ? "border-primary bg-primary/10" : "hover:bg-card"}`}
                  >
                    <div className="font-semibold">{d.title}</div>
                    {d.description && <div className="text-xs text-muted-foreground">{d.description}</div>}
                  </button>
                ))}
              </div>
            )}

            {selectedDeckId && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Game Mode</label>
                  <select
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value as any)}
                    className="rounded-xl border bg-background/50 px-4 py-3"
                  >
                    <option value="seer_skeptic">Seer & Skeptic (2 players)</option>
                    <option value="multiplayer_seer">Multiplayer Seer (3-6 players)</option>
                    <option value="solo">Solo Mode (1 player)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">
                    Round Timer: {timerSeconds}s
                  </label>
                  <input
                    type="range"
                    min={15}
                    max={120}
                    step={5}
                    value={timerSeconds}
                    onChange={(e) => setTimerSeconds(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>15s</span>
                    <span>120s</span>
                  </div>
                </div>
              </>
            )}

            {authError && <p className="text-xs text-destructive">{authError}</p>}

            <button
              onClick={handleCreateGame}
              disabled={!selectedDeckId || loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-gradient px-6 py-4 font-display text-base font-bold text-primary-foreground disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Room
            </button>

            <button type="button" onClick={() => setMode("idle")} className="text-xs text-muted-foreground hover:text-foreground">← back</button>
          </div>
        )}

        {mode === "join" && (
          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Room code</label>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="ABC42"
              className="rounded-2xl border bg-background/50 px-6 py-5 text-center font-mono text-3xl tracking-[0.4em] outline-none focus:border-primary"
            />
            {joinError && <p className="text-xs text-destructive">{joinError}</p>}
            <button
              type="submit"
              disabled={code.length !== 5 || loading}
              className="rounded-2xl bg-primary-gradient px-6 py-4 font-display text-base font-bold text-primary-foreground disabled:opacity-50"
            >
              {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Join room"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className="text-xs text-muted-foreground hover:text-foreground">← back</button>
          </form>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <h3 className="text-center font-display text-lg font-bold">Sign In</h3>
            <input
              type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border bg-background/50 px-4 py-3 outline-none focus:border-primary"
              required
            />
            <input
              type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border bg-background/50 px-4 py-3 outline-none focus:border-primary"
              required
            />
            {authError && <p className="text-xs text-destructive">{authError}</p>}
            <button
              type="submit" disabled={authLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-gradient px-6 py-4 font-display text-base font-bold text-primary-foreground"
            >
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Sign In
            </button>
            <button type="button" onClick={() => setMode("signup")} className="text-xs text-muted-foreground hover:text-foreground">No account? Create one</button>
            <button type="button" onClick={() => setMode("magic-link")} className="text-xs text-muted-foreground hover:text-foreground">Send magic link instead</button>
            <button type="button" onClick={() => setMode("idle")} className="text-xs text-muted-foreground hover:text-foreground">← back</button>
          </form>
        )}

        {mode === "magic-link" && (
          <form onSubmit={async (e) => { e.preventDefault(); setAuthError(""); try { await api.requestMagicLink(email); setAuthError("Magic link sent! Check your email."); } catch (err: any) { setAuthError(err.message) } }} className="flex flex-col gap-3">
            <h3 className="text-center font-display text-lg font-bold">Magic Link</h3>
            <p className="text-center text-xs text-muted-foreground">Enter your email and we'll send you a sign-in link.</p>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border bg-background/50 px-4 py-3 outline-none focus:border-primary" required />
            {authError && <p className="text-xs text-destructive">{authError}</p>}
            <button type="submit" disabled={!email} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-gradient px-6 py-4 font-display text-base font-bold text-primary-foreground"><Send className="h-4 w-4" /> Send Magic Link</button>
            <button type="button" onClick={() => setMode("login")} className="text-xs text-muted-foreground hover:text-foreground">← back to sign in</button>
          </form>
        )}

        {mode === "signup" && (
          <form onSubmit={handleSignup} className="flex flex-col gap-3">
            <h3 className="text-center font-display text-lg font-bold">Create Account</h3>
            <input
              type="text" placeholder="Display name" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded-xl border bg-background/50 px-4 py-3 outline-none focus:border-primary"
              required
            />
            <input
              type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border bg-background/50 px-4 py-3 outline-none focus:border-primary"
              required
            />
            <input
              type="password" placeholder="Password (min 8 chars)" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border bg-background/50 px-4 py-3 outline-none focus:border-primary"
              required minLength={8}
            />
            {authError && <p className="text-xs text-destructive">{authError}</p>}
            <button
              type="submit" disabled={authLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-gradient px-6 py-4 font-display text-base font-bold text-primary-foreground"
            >
              {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create Account
            </button>
            <button type="button" onClick={() => setMode("login")} className="text-xs text-muted-foreground hover:text-foreground">Already have an account? Sign in</button>
            <button type="button" onClick={() => setMode("idle")} className="text-xs text-muted-foreground hover:text-foreground">← back</button>
          </form>
        )}

        {mode === "profile" && user && (
          <form onSubmit={async (e) => { e.preventDefault(); setProfileError(""); setProfileSuccess(""); setProfileLoading(true); try { await api.updateMe({ display_name: profileName, avatar_url: profileAvatar || undefined }); setProfileSuccess("Profile updated!"); } catch (err: any) { setProfileError(err.message || "Failed to update profile"); } setProfileLoading(false); }} className="flex flex-col gap-3">
            <h3 className="text-center font-display text-lg font-bold">Edit Profile</h3>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Display name</label>
            <input
              type="text" value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="rounded-xl border bg-background/50 px-4 py-3 outline-none focus:border-primary"
              required minLength={1} maxLength={50}
            />
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Avatar URL (optional)</label>
            <input
              type="url" value={profileAvatar} placeholder="https://example.com/avatar.jpg"
              onChange={(e) => setProfileAvatar(e.target.value)}
              className="rounded-xl border bg-background/50 px-4 py-3 outline-none focus:border-primary"
            />
            {profileError && <p className="text-xs text-destructive">{profileError}</p>}
            {profileSuccess && <p className="text-xs text-primary">{profileSuccess}</p>}
            <button
              type="submit" disabled={profileLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-gradient px-6 py-4 font-display text-base font-bold text-primary-foreground"
            >
              {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
              Save Changes
            </button>
            <button type="button" onClick={() => setMode("idle")} className="text-xs text-muted-foreground hover:text-foreground">← back</button>
          </form>
        )}
      </motion.div>

      <div className="mt-10 flex items-center gap-6 text-xs text-muted-foreground">
        {user?.role === 'admin' ? (
          <a href="/admin" className="hover:text-foreground">Admin</a>
        ) : (
          <span>Player</span>
        )}
        <span>·</span>
        <span>v0.1 prototype</span>
      </div>
    </div>
  );
}
