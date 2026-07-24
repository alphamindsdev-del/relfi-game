# Rel-Fi Games — Implementation Plan

## Current State Assessment

The project is a **frontend-only prototype** built by Lovable with TanStack Start + React 19 + Vite + Tailwind CSS v4 + shadcn/ui + Zustand + Framer Motion.

### What Exists

| Layer | Status |
|---|---|
| Screens (7) | Landing, Lobby, RoleReveal, Statement (serves persuasion+lockin too), Reveal, LeaderboardScreen, Final |
| Components (12) | Avatar+AvatarStack, CategoryChip, CountdownRing, Leaderboard, LockInButton, Podium, RoleRevealCard, RoomCodeDisplay, SecretRoomModal, SoundToggle, StatementCard, TokenCounter |
| Game Store | Zustand store with full mock-driven state machine through all phases |
| Mock Data | 6 categories, 6 statement cards, 5 players, 1 deck |
| CSS | Premium dark theme, `.relfi-root` scoped for embed, Tailwind v4, Google Fonts |
| Audio | Web Audio API synthesizer (8 sound effects, no assets), with `unlockAudio()` for user-gesture context resume |
| Routing | TanStack Router: `/` → game, `/admin` → admin panel |
| Admin Page | Local-only CRUD for categories/cards/decks (no persistence) |
| ssr/error | Error boundaries, SSR error capture, Lovable error reporting |
| Utilities | 49 shadcn/ui primitives, `cn()` tailwind-merge helper |
| Infrastructure | Vite config pointing at `game/routes/`, bunfig.toml with supply-chain guard, eslint config |

### What's Missing (to be production-ready)

| Area | Gap |
|---|---|
| **Backend** | No server, no API, no database, no real-time |
| **Auth** | No user accounts, no login/signup, no JWT |
| **Multiplayer** | All state is local mock — no WebSocket, no Durable Objects, no real player connections |
| **Admin** | Local-only, no persistence, no CSV import, no publish workflow |
| **Admin roles** | No admin/moderator tooling for content management beyond basic CRUD |
| **Deck/Statement content** | Only 6 mock cards — needs a real content library and management workflow |
| **Room system** | No room codes, no join flow, no lobby with real players |
| **Reconnection** | No concept of dropped connections or state recovery |
| **Security** | No rate limiting, no CSRF, no per-socket private event enforcement |
| **Testing** | Zero tests |
| **CI/CD** | No deployment pipeline |
| **Scoring** | Mock scoring doesn't match the official rules in the Player's Guide |

---

## Phase 1: Backend — Cloudflare Workers + Durable Objects + D1 + KV + R2

### 1.1 Project Structure

```
backend/
  wrangler.toml
  package.json
  tsconfig.json
  migrations/
    001_init.sql                    # Full D1 schema
  src/
    index.ts                        # Worker entry — route dispatcher
    lib/
      db.ts                         # D1 query helpers
      kv.ts                         # KV helpers (room codes, tickets, rate limits)
      r2.ts                         # R2 asset helpers
      jwt.ts                        # JWT sign/verify (standalone mode)
      validation.ts                 # Zod schemas for all request bodies
      ids.ts                        # ULID/nanoid generation
      errors.ts                     # Typed error responses
    middleware/
      auth.ts                       # JWT verification middleware (standalone + AlphaMinds)
      cors.ts                       # CORS headers
      admin-only.ts                 # Role check for admin endpoints
    routes/
      auth.ts                       # Signup, login, magic link, embed-exchange
      categories.ts                 # Admin CRUD
      decks.ts                      # Admin CRUD + publish + bulk import
      cards.ts                      # Admin CRUD per deck
      rooms.ts                      # Create, join, history, metadata lookup
      users.ts                      # Profile, stats
      ws-ticket.ts                  # Issue short-lived WS ticket
    durable/
      RoomState.ts                  # Durable Object class — WebSocket server + game state machine
      scoring.ts                    # Pure functions for token computation
```

### 1.2 D1 Schema

Execute `migrations/001_init.sql` from `02_BACKEND_SCHEMA.md` verbatim:

- **users** — id, display_name, email (nullable for SSO), external_auth_source/external_auth_id, avatar_url, role ('player'|'admin'), password_hash, created_at
- **categories** — id, name, short_code, color_hex, icon_key, definition, created_by, created_at
- **decks** — id, title, description, is_published, created_by, created_at, updated_at
- **deck_categories** — deck_id, category_id (many-to-many)
- **statement_cards** — id, deck_id, statement_text, correct_category_id, friction_explanation, clue_variant, clue_payload (JSON), difficulty, sort_order, created_at
- **rooms** — id, room_code, deck_id, host_user_id, mode, status, created_at, ended_at
- **room_players** — room_id, user_id, total_tokens, joined_at, left_at
- **rounds** — id, room_id, statement_card_id, round_number, seer_user_id, skeptic_user_id, started_at, completed_at
- **round_answers** — round_id, user_id, chosen_category_id, decision_type, trusted_seer_id, is_correct, tokens_awarded, locked_at

Indexes: statement_cards(deck_id), rooms(room_code), rounds(room_id), round_answers(round_id)

### 1.3 KV Namespaces

| Namespace | Key | Value | TTL |
|---|---|---|---|
| `ROOM_CODES` | `code:{5-char code}` | `room_id` | 24h (released on game end) |
| `WS_TICKETS` | `ticket:{uuid}` | `{ room_id, user_id }` | 60s |
| `MAGIC_TOKENS` | `magic:{token}` | `{ email }` | 15min |
| `RATE_LIMITS` | `rl:{ip}:{endpoint}` | counter | sliding 60s |

### 1.4 Durable Object: `RoomState`

One DO instance per active room. DO id = `room_id` (same UUID as the D1 rooms row).

**State Machine (stored in DO storage `state.phase`):**
```
LOBBY → ROLE_ASSIGNMENT → STATEMENT_REVEALED → PERSUASION → DECISION → REVEAL → LEADERBOARD → [next round or GAME_ENDED]
```

**DO Storage Schema:**
```
{
  roomId, deckId, mode, hostUserId, code,
  phase,
  players: Map<userId, { displayName, avatarUrl, connected, ready, role?, locked?, pick?, decision? }>,
  roundIndex, cardId, statementText, correctCategoryId, categories,
  skepticIndex, seerUserIds, skepticUserId,
  clueVariant, cluePayload,
  timerSeconds, timerStart,
  currentSpeakerIndex
}
```

**WebSocket Protocol** (from `03_BACKEND_API.md`):

Server → Client: `room:state`, `player:joined`, `player:left`, `player:connection`, `round:role_assigned` (private), `round:started`, `seer:clue` (private), `round:turn`, `round:timer_tick`, `player:locked`, `round:reveal`, `leaderboard:update`, `game:ended`, `error`

Client → Server: `host:start_game`, `host:next_speaker`, `host:advance_round`, `skeptic:decision`, `player:lock_answer`, `player:ready`

**Security-critical rule:** `seer:clue` and `round:role_assigned` use `webSocket.send()` directly on the specific connection, NOT `webSockets.broadcast()`. Must be verified in tests.

**Role rotation:** The DO maintains `skepticIndex` in storage. Each round: compute skeptic = `players[skepticIndex % playerCount]`, all others = seers. Solo mode (1 player) has no roles.

**Scoring** (hardcoded constants, configurable per-deck for v2):
- Solo: correct=2, incorrect=0
- Seer&Skeptic followed & correct: seer=2, skeptic=2
- Seer&Skeptic followed & incorrect: seer=1, skeptic=0
- Seer&Skeptic bluff called & correct: seer=0, skeptic=2
- Seer&Skeptic bluff called & incorrect: seer=0, skeptic=0
- Multiplayer: same logic per trusted Seer; untrusted Seers get 0

**Reconnection:** If a player's WebSocket disconnects, start a 60s grace timer. If they reconnect with a valid ticket within the window, re-send `room:state` plus any private role/clue data. If they don't reconnect, mark them as disconnected and continue. If host disconnects for >60s, assign new host via `player:connection { status: 'reconnecting' }`.

### 1.5 REST API Endpoints

**Auth (`/api/auth`):**
- `POST /signup` — `{ email, password, display_name }` → JWT in HttpOnly cookie + body
- `POST /login` — `{ email, password }` → JWT
- `POST /magic-link` — `{ email }` → sends email via transactional email API
- `GET /magic-link/verify?token=...` — exchanges magic token for JWT
- `GET /embed-exchange?alphaminds_token=...` — server-to-server AlphaMinds auth verification

**Categories (`/api/categories`) — `role=admin` required for writes:**
- `GET /` — list all
- `POST /` — create
- `PATCH /:id` — update
- `DELETE /:id` — delete

**Decks (`/api/decks`) — `role=admin` required for writes:**
- `GET /` — list (filter by `?published=true`)
- `POST /` — create with `{ title, description, category_ids }`
- `PATCH /:id` — update
- `DELETE /:id` — delete
- `POST /:id/publish` — set `is_published = 1`

**Cards (`/api/decks/:id/cards`) — `role=admin` required:**
- `POST /` — create card
- `POST /bulk-import` — CSV upload (multipart)
- `PATCH /:cardId` — update card
- `DELETE /:cardId` — delete card

**Rooms (`/api/rooms`):**
- `POST /` — `{ deck_id, mode }` → creates DO, D1 row, room code → `{ room_id, room_code }`
- `GET /:code` — room metadata (no auth required)
- `POST /:code/join` — auth required → returns `{ room_id, ticket }`
- `GET /:id/history` — past rounds/results (must have been participant)

**Users (`/api/users`):**
- `GET /me` — current user profile
- `PATCH /me` — update display_name, avatar_url
- `GET /me/stats` — lifetime tokens, games played, win rate

### 1.6 wrangler.toml Configuration

```toml
name = "relfi-games"
main = "src/index.ts"
compatibility_date = "2025-02-01"

[[d1_databases]]
binding = "DB"
database_id = "..."
database_name = "relfi-db"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "ROOM_CODES"
id = "..."

[[kv_namespaces]]
binding = "WS_TICKETS"
id = "..."

[[kv_namespaces]]
binding = "MAGIC_TOKENS"
id = "..."

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "..."

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "relfi-assets"

[[durable_objects.bindings]]
name = "ROOM_STATE"
class_name = "RoomState"

[[migrations]]
tag = "v1"
new_classes = ["RoomState"]
```

---

## Phase 2: Frontend — Real Data Integration

### 2.1 New Library Files

**`src/game/lib/api.ts`** — RelFiApi class with methods for all REST endpoints above. Uses `fetch()`, reads JWT from cookie/localStorage, attaches `Authorization` header. Returns typed responses.

**`src/game/lib/ws.ts`** — RelFiSocket class:
- `connect(roomId, ticket)` — opens WebSocket to `wss://{host}/api/rooms/{roomId}/ws?ticket={ticket}`
- `disconnect()`, `send(event)`, `onServerEvent(handler)`, `reconnect()`
- Auto heartbeat (ping every 15s)
- Reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Dispatches typed events to subscribers

**`src/game/lib/types.ts`** — All shared types. Pull from Zod schemas on backend, define client-side mirrors:
```typescript
Phase, Role, Category, Deck, StatementCard, Player, RoomMeta,
ServerEvent, ClientEvent, RoundHistory, UserProfile, UserStats
```

### 2.2 Auth Store & UI

**`src/game/state/auth-store.ts`** — Zustand store:
- `token`, `user`, `isAuthenticated`
- `login()`, `signup()`, `logout()`, `checkSession()` (reads existing cookie on mount)

**New screens:**
- **`src/game/screens/Login.tsx`** — Tabbed form: Sign Up / Log In. Email + password fields. Links to magic link flow. Redirects to lobby after success.
- **`src/game/screens/CreateRoom.tsx`** — Step 1: select published deck (fetched from API). Step 2: choose mode (solo / seer_skeptic / multiplayer_seer). Step 3: host navigates to lobby.
- **`src/game/screens/JoinRoom.tsx`** — 5-char code input. Validates via `GET /api/rooms/:code`. Shows room preview (title, player count, mode). Join button calls `POST /api/rooms/:code/join`, then WS connect.

### 2.3 Game Store Refactoring

**`src/game/state/game-store.ts`** — Replaces the mock-only store. Maintains same public interface (`phase`, `players`, `youId`, `round`, etc.) but is populated from WebSocket events:

```typescript
// On connect: store receives room:state → populates roomCode, deck, categories, players
// On player:joined → adds to players array
// On player:left → removes from players
// On round:role_assigned → sets youRound.role
// On round:started → sets phase='statement', cardId, roundIndex, timer
// On seer:clue → stores clue for SecretRoomModal
// On round:timer_tick → updates timer display
// On player:locked → marks that player as locked
// On round:reveal → sets phase='reveal', populates all answers and awards
// On leaderboard:update → updates player tokens
// On game:ended → sets phase='final', final standings
```

The store subscribes to `RelFiSocket.onServerEvent` in a `useEffect` inside `RelFiGame.tsx`.

### 2.4 Screen Updates

| Screen | Changes |
|---|---|
| **Landing** | Keep visual design. Replace mock `startGame()` with navigation to `CreateRoom` or `JoinRoom`. Add auth prompts. |
| **Lobby** | Real player list from WS `player:joined`/`player:left`. Host sees "Start" (sends `host:start_game`). Non-hosts see ready toggle (sends `player:ready`). Room code and QR from real data. |
| **RoleReveal** | Minimal changes — already reads from store. Store is now WS-driven. |
| **Statement** | Real timer from `round:timer_tick`. Real category options from `round:started`. Lock answer sends `player:lock_answer`. Seer opens SecretRoom from `seer:clue`. Remove `simulateOthersLockIn()` — replaced by real WS events. |
| **Reveal** | Real data from `round:reveal`. Friction explanation. No mock computation. |
| **LeaderboardScreen** | Real standings from `leaderboard:update`. Advance sends `host:advance_round`. |
| **Final** | Real final standings from `game:ended`. Play again creates new room. |

### 2.5 Admin Page Upgrade

Current admin uses local `MOCK_CATEGORIES` / `MOCK_DECK`. Upgrade to:
- Authenticated API calls for all CRUD
- Bulk CSV import for statement cards
- Category color/icon picker
- Deck publish/unpublish
- Real-time preview of cards

### 2.6 Routing Updates

```
/          → Landing (standalone) or redirect to lobby (embedded)
/login     → Login screen
/create    → CreateRoom screen
/join      → JoinRoom screen
/game      → Lobby → game flow (or use query param)
/admin     → Admin panel (requires auth + admin role)
```

Use TanStack Router navigation instead of Zustand phase-based rendering for top-level routing, OR keep the current phase machine inside `/game` route. Recommend: keep the phase machine approach within the game route, use real router for top-level (landing, login, create, join, admin, game).

---

## Phase 3: Content & Admin Tooling

### 3.1 Pre-populate Categories

Create a seed migration with the AROPE categories from the Player's Guide:
| Short Code | Name | Hex | Icon |
|---|---|---|---|
| F1 | Authority Dependence | `#8B5CF6` | `Scale` |
| F2 | Rigidity | `#F59E0B` | `Lock` |
| F3 | Oversimplification | `#EC4899` | `Zap` |
| F4 | Power Imbalance | `#06B6D4` | `Swords` |
| F5 | Evidence Strain | `#10B981` | `Search` |

### 3.2 Sample Deck

Create a first published deck "The AROPE Primer" with 10-20 statement cards spanning all 5 categories with varying difficulty + clue variants. This gives the game playable content out of the box.

### 3.3 Admin Workflow for Your Client's Content Team

- `POST /api/categories` — add custom fiction pattern
- `POST /api/decks` — create a themed deck
- `POST /api/decks/:id/cards/bulk-import` — CSV upload with columns: `statement_text, correct_category_id, clue_variant, clue_payload, friction_explanation, difficulty`
- `POST /api/decks/:id/publish` — make it available to hosts
- Hosts see only published decks when creating rooms

---

## Phase 4: Production Hardening

### 4.1 Error Handling
- Unified API error responses: `{ error: string, code: string, details?: any }`
- WebSocket reconnection with exponential backoff
- Client error boundary per screen (keep existing)
- Logging: structured console + optional R2 log archive

### 4.2 Rate Limiting
- KV-based sliding window: 100 req/min per IP for REST, 20 connects/min for WS
- Room creation: 5/hour per user
- Magic link requests: 3/hour per email

### 4.3 Security
- `seer:clue` strictly per-socket send (NEVER in `room:state` or broadcast)
- WS tickets: single-use, 60s TTL, tied to specific room+user
- JWT: 24h expiry, HttpOnly+Secure+SameSite=Lax cookie
- Input validation: Zod schemas on all endpoints
- CORS: restrict to known origins (relfigames.com, AlphaMinds domain)
- CSRF: SameSite cookie + custom `X-RelFi-CSRF` header

### 4.4 Tests

**Unit tests (Vitest, in `backend/src/__tests__/`):**
- `scoring.test.ts` — all 8 scoring permutations
- `validation.test.ts` — Zod schema validation
- `room-machine.test.ts` — state machine transitions (mock DO storage)

**Integration tests:**
- Durable Object with simulated WebSocket messages (use `wrangler dev --remote` or miniflare)
- Test full round flow: lobby → start → role assign → statement → lock → reveal → leaderboard

**E2E tests (Playwright, in `e2e/`):**
- Create room → join → play round → see reveal → see leaderboard
- Auth flow: signup → login → create room
- Reconnection: player drops and reconnects mid-round

**Security tests:**
- Verify clue payload never appears in non-Seer WebSocket messages
- Verify unauthenticated join rejection

### 4.5 CI/CD (GitHub Actions)

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx wrangler deploy
      - run: npx wrangler d1 migrations apply relfi-db
```

---

## Phase 5: AlphaMinds Embedding

### 5.1 Embedded Mode Flow

Current `RelFiGame.tsx` accepts `mode="embedded"` which skips landing. Enhance:

1. Host app passes `authToken` prop (AlphaMinds session token)
2. On mount, call `GET /api/auth/embed-exchange?alphaminds_token=...`
3. Worker validates token against AlphaMinds auth service (server-to-server)
4. On success: look up or auto-provision user row, issue Rel-Fi JWT
5. Game proceeds as standalone from here — all downstream logic identical
6. If token invalid/expired: show error "Please log in to AlphaMinds first"

### 5.2 postMessage Bridge

**Game → Host:**
```typescript
{ type: "GAME_STATE", payload: { phase, roundNumber, playerCount } }
{ type: "TOKEN_EARNED", payload: { amount, total, round } }
{ type: "NAVIGATION_REQUEST", payload: { path: string } }
```

**Host → Game:**
```typescript
{ type: "NAVIGATE", payload: { path: string } }
{ type: "LOGOUT" }
```

### 5.3 CSS Compatibility

Already done: `.relfi-root` scoping, dark theme, z-index management. Verify:
- No z-index conflicts with host app
- All fonts load correctly in embedded context
- Animations don't cause scroll issues inside iframe/container

---

## Phase 6: Post-MVP Enhancements

| Feature | Notes |
|---|---|
| User-generated decks | Allow hosts to create custom decks from UI (v2) |
| Spectator mode | Read-only room observers |
| Game replay | Replay from D1 round history |
| Sound assets | Replace Web Audio API with real sound files in R2 |
| Mobile PWA | Service worker, offline manifest, install prompt |
| Tournament mode | Bracket elimination, automated room creation |
| Achievements | Milestone rewards tied to AlphaMinds profile |
| Analytics | Game completion rates, popular decks, retention |

---

## Implementation Order

| # | Step | Depends On | Estimated Effort |
|---|---|---|---|
| 1 | Scaffold Cloudflare project (wrangler.toml, D1, KV, R2, DO bindings) | — | 1 day |
| 2 | Create D1 schema migration + seed AROPE categories | 1 | 0.5 day |
| 3 | Build auth system (signup, login, magic link, JWT, embed-exchange) | 1, 2 | 2 days |
| 4 | Build admin CRUD API (categories, decks, cards, CSV import) | 1, 2, 3 | 2 days |
| 5 | Build room CRUD API (create, join, history, code gen) | 1, 2, 3 | 1 day |
| 6 | Build Durable Object `RoomState` — full state machine + WS protocol | 1, 5 | 4 days |
| 7 | Build scoring engine (pure functions, all permutations) | 6 | 0.5 day |
| 8 | Create frontend API client (`api.ts`) | 3, 4, 5 | 1 day |
| 9 | Create frontend WebSocket client (`ws.ts`) | 6 | 1 day |
| 10 | Refactor game store to use real WS events | 8, 9 | 2 days |
| 11 | Update all 7 screens to use real data (remove mock dependencies) | 10 | 2 days |
| 12 | Build auth UI (Login + signup forms, session management) | 3, 8 | 1 day |
| 13 | Build CreateRoom + JoinRoom screens | 5, 9 | 1 day |
| 14 | Upgrade admin page to use real API | 4, 8 | 1 day |
| 15 | Create sample deck with 20 statement cards (the "AROPE Primer") | 4 | 1 day |
| 16 | Test multiplayer end-to-end (2-6 players, all modes) | 11 | 2 days |
| 17 | Add reconnection logic (60s grace window, state recovery) | 10 | 1 day |
| 18 | Error handling, rate limiting, security audit | 16 | 2 days |
| 19 | AlphaMinds embedding (postMessage bridge, embed-exchange polish) | 3, 10 | 1 day |
| 20 | CI/CD pipeline (GitHub Actions → Cloudflare deploy) | 18 | 1 day |
| 21 | Write tests (unit: scoring/validation/machine, integration: DO, E2E: Playwright) | 18 | 3 days |
| 22 | Production deploy + monitoring | 20, 21 | 1 day |

**Total estimated effort: ~30 days for a single developer**

---

## Key Architectural Decisions

1. **Durable Object per room** — the correct primitive. Strongly-consistent single-threaded state, WebSocket hibernation for idle rooms, per-room isolated failure domain.

2. **Live state = DO in-memory, history = D1** — DO never writes to D1 during gameplay. On round completion (reveal phase), flush round data to D1 in a single `await ctx.storage.transaction()` + `DB.prepare()` batch. This keeps gameplay fast and D1 as cold/analytical storage.

3. **Private events are strictly per-socket sends** — `seer:clue` and `round:role_assigned` use `webSocket.send()` directly, never `webSockets.broadcast()`. The DO maintains `Map<webSocket, userId>` for routing.

4. **Timer runs server-side in DO** — clients receive `round:timer_tick` events. Prevents clock drift and cheating.

5. **CockroachDB for embedding** — the codebase is pre-structured for this with `.relfi-root` scoping, the `RelFiGameProps` interface, and the `mode="embedded"` prop. Adding the full embed flow is low-effort once the standalone game is solid.

6. **Zustand as client store** — keeps current architecture. Store is populated by WebSocket events instead of local mock data. Minimizes client logic; DO is source of truth.
