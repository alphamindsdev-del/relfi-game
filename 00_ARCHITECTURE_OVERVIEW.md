# Rel-Fi Games — System Architecture Overview

## What this is

A **content-agnostic social deduction / persuasion game engine**. Admins (any host, not just AlphaMinds) create Rooms, load in Categories, and load in Statement Cards (statement + clue + correct category). Players join, get assigned roles each round (Solo / Seer / Skeptic), argue, lock answers, and earn tokens. The engine has zero hardcoded game content — everything is data the admin controls through the Admin/Host Panel.

This ships as **two deployment targets sharing one backend**:

1. **Standalone PWA** (`relfigames.com` or similar) — open to anyone, self-serve host + join, own auth.
2. **Embedded module inside the AlphaMinds webapp** — same game engine, mounted as a route/page inside the existing AlphaMinds React app, inheriting the AlphaMinds session (no second login).

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend (standalone) | React + Vite PWA (built by Lovable from `01_LOVABLE_FRONTEND_PROMPT.md`) |
| Frontend (embedded) | Same component library, mounted as a route inside the existing AlphaMinds React/Vite app |
| Realtime | Cloudflare Durable Objects (one DO instance per active Room = the source of truth for round state) |
| Edge API | Cloudflare Workers (REST, auth, admin CRUD) |
| Database | Cloudflare D1 (SQLite) — persistent data: users, rooms history, categories, statements, tokens |
| Session/cache | Cloudflare KV — short-lived room codes, rate limiting, presence pings |
| Assets | Cloudflare R2 — sound effects, category art, avatar images |
| Auth (standalone) | Self-contained: email/password or magic link, issued JWT, stored in Worker-signed cookie |
| Auth (embedded) | Inherits AlphaMinds' existing session token; Worker validates it against AlphaMinds' auth service instead of issuing its own |

## Why Durable Objects

Each live Room needs a single consistent source of truth for: whose turn it is, what the Seer currently sees vs. what the Skeptic sees, the countdown timer, and lock-in state — synced instantly across every connected player. A Durable Object gives you exactly one strongly-consistent instance per room, with WebSocket hibernation so idle rooms cost near-zero. This is the correct tool here — plain polling would introduce lag exactly where the game's tension lives (the reveal moment).

## Two Auth Modes, One Backend

- **Standalone**: user signs up with email/password or a passwordless magic link. Worker issues a signed JWT. Anyone can register and immediately host or join a room — no gatekeeping, no organization required.
- **Embedded**: the AlphaMinds app passes its existing session token to the game module on mount (via a shared cookie or a short-lived handoff token in the URL). The Worker verifies this token against AlphaMinds' existing auth backend rather than its own user table, and maps it to a Rel-Fi user record on first entry (auto-provisioned, no separate signup screen).

Both paths converge on the same `users` table and the same Durable Object room logic — a user is a user regardless of which door they came through.

## Hosting Model

Anyone can create a room, from either surface. No admin approval needed to host a casual game with friends. A **separate, higher-privilege Admin role** exists only for managing the global Category/Statement library (the content bank rooms pull from) — this is what your client's team uses to load in their proprietary statement decks. Regular hosts pick from published decks; they don't author decks themselves (v1) — that can be a v2 feature (user-generated decks) if you want to open it up later.

## File Map

- `01_LOVABLE_FRONTEND_PROMPT.md` — paste this into Lovable to generate the entire frontend (standalone + embeddable component library)
- `02_BACKEND_SCHEMA.md` — D1 table definitions
- `03_BACKEND_API.md` — Worker REST endpoints + Durable Object WebSocket protocol
