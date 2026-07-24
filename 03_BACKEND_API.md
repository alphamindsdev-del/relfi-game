# Rel-Fi Games — Backend API & Realtime Protocol (Cloudflare)

## Components

- **Workers (REST)** — auth, deck/category CRUD, room creation, historical reads
- **Durable Object `RoomState`** — one instance per active room, owns the WebSocket connections and all live round logic
- **D1** — persistent storage (see `02_BACKEND_SCHEMA.md`)
- **KV** — `room_code -> durable_object_id` lookup (fast, cheap, TTL'd), rate limiting counters
- **R2** — sound assets, category icons/art, avatar uploads

---

## Auth

### Standalone
- `POST /api/auth/signup` — `{email, password, display_name}` → creates `users` row, returns JWT
- `POST /api/auth/login` — `{email, password}` → returns JWT
- `POST /api/auth/magic-link` — `{email}` → sends login link (KV-stored one-time token, 15 min TTL)
- `GET /api/auth/magic-link/verify?token=...` → exchanges for JWT

JWT stored as an HttpOnly, Secure, SameSite=Lax cookie. Payload: `{user_id, role, exp}`.

### Embedded (AlphaMinds)
- AlphaMinds passes its own session token via a short-lived handoff: `GET /api/auth/embed-exchange?alphaminds_token=...`
- Worker calls AlphaMinds' auth verification endpoint (server-to-server) to validate the token
- On success: look up `users` by `(external_auth_source='alphaminds', external_auth_id)`; auto-provision a row if this is the user's first time; issue a Rel-Fi JWT the same shape as standalone, so everything downstream is identical
- This means every other endpoint below doesn't care which door the user came through — it just sees a valid JWT

---

## REST Endpoints

### Categories & Decks (admin role required for writes; reads open to any authenticated user)
```
GET    /api/categories
POST   /api/categories                 { name, short_code, color_hex, icon_key, definition }
PATCH  /api/categories/:id
DELETE /api/categories/:id

GET    /api/decks?published=true
POST   /api/decks                      { title, description, category_ids: [] }
PATCH  /api/decks/:id
DELETE /api/decks/:id
POST   /api/decks/:id/publish
POST   /api/decks/:id/cards            { statement_text, correct_category_id, clue_variant, clue_payload, friction_explanation, difficulty }
POST   /api/decks/:id/cards/bulk-import  (CSV upload, multipart)
PATCH  /api/decks/:id/cards/:cardId
DELETE /api/decks/:id/cards/:cardId
```

### Rooms
```
POST   /api/rooms                      { deck_id, mode } → creates Durable Object, D1 row, room_code
                                        response: { room_id, room_code }
GET    /api/rooms/:code                → basic room metadata for the join screen (does NOT require auth to preview)
POST   /api/rooms/:code/join           → authenticated; returns a WebSocket connection ticket
GET    /api/rooms/:id/history          → past rounds/results (post-game recap, requires having been a participant)
```

### Users
```
GET    /api/users/me
PATCH  /api/users/me                   { display_name, avatar_url }
GET    /api/users/me/stats             → lifetime tokens, games played, win rate
```

---

## Realtime: Durable Object `RoomState`

Client connects via `wss://.../api/rooms/:id/ws?ticket=...` after obtaining a short-lived connection ticket from the join REST call (prevents unauthenticated WebSocket hijacking). Use **WebSocket Hibernation API** so idle lobbies cost near-nothing.

### Server → Client events
```
room:state          full snapshot on connect/reconnect — { players[], status, mode, deck_meta }
player:joined        { user_id, display_name, avatar_url }
player:left          { user_id }
player:connection    { user_id, status: 'connected'|'reconnecting' }
round:role_assigned  PRIVATE, sent only to the relevant socket — { role: 'seer'|'skeptic'|'solo' }
round:started        { round_number, statement_text, category_options[], timer_seconds }
seer:clue            PRIVATE, sent only to the Seer's socket — { clue_variant, clue_payload }
round:turn           { speaking_user_id }                     -- persuasion turn indicator
round:timer_tick      { seconds_remaining }                    -- throttled, e.g. every 1s or every 5s
player:locked         { user_id }                              -- NOT their answer, just that they locked
round:reveal          { correct_category_id, per_player_answers[], friction_explanation, tokens_awarded[] }
leaderboard:update     { standings[] }
game:ended             { final_standings[] }
error                   { code, message }
```

### Client → Server events
```
host:start_game        { }                       -- host only
host:next_speaker       { user_id }                -- host advances persuasion turn manually
host:advance_round      { }                        -- host only, moves lobby->round or reveal->next round
skeptic:decision         { decision: 'follow'|'bluff'|'solo', trusted_seer_id? }
player:lock_answer        { category_id }
player:ready               { }                      -- lobby ready-up toggle
```

### Round lifecycle inside the Durable Object (state machine)
```
LOBBY
  → all players ready + host starts → ROLE_ASSIGNMENT
ROLE_ASSIGNMENT
  → roles computed server-side (rotate Skeptic per §Role Rotation below), private events sent → STATEMENT_REVEALED
STATEMENT_REVEALED
  → timer starts, Seer(s) may open Secret Room (server sends seer:clue only to their socket) → PERSUASION
PERSUASION
  → host or auto-timer advances turns between Seers → DECISION
DECISION
  → Skeptic/Solo players lock in via player:lock_answer → once all required locks received → REVEAL
REVEAL
  → server computes correctness + tokens (see scoring rules below), broadcasts round:reveal, writes round + round_answers rows to D1 → LEADERBOARD
LEADERBOARD
  → host clicks advance → next ROLE_ASSIGNMENT, or GAME_ENDED if deck exhausted
```

### Role rotation
- **Solo mode**: every player independently answers every round, no rotation needed
- **Seer & Skeptic (2p)**: roles swap each round
- **Multiplayer Seer (3-6p)**: Skeptic role rotates round-robin; all non-Skeptics are Seers that round — Durable Object keeps a simple `skeptic_index` counter in its storage, increments each round

### Scoring (configurable constants, not hardcoded logic — store as room/deck settings so a client could tune payouts later)
```
Solo:                    correct=2, incorrect=0
Seer&Skeptic — followed & correct:     seer=2, skeptic=2
Seer&Skeptic — followed & incorrect:   seer=1, skeptic=0
Seer&Skeptic — bluff called, correct:  seer=0, skeptic=2
Seer&Skeptic — bluff called, incorrect: seer=0, skeptic=0
Multiplayer  — same logic per trusted Seer; untrusted Seers get 0 that round
```

### Reconnection handling
- Client reconnects with the same `ticket` (short grace window, e.g. 60s) → DO restores their socket into current state via `room:state`, re-sends any private payload appropriate to their current role (e.g. re-send `seer:clue` if they're mid-Secret-Room and reconnecting)
- If a player doesn't reconnect before the grace window, mark them `left_at` in D1 and continue the game without them (host can also manually kick)

---

## Content Security Note

`seer:clue` payloads must **never** be included in `room:state` broadcasts or any event sent to non-Seer sockets — this is the one piece of state that must stay strictly per-connection. Test this explicitly: a Skeptic's browser dev tools/network tab should never show another player's clue payload, even encrypted-in-transit-but-visible-in-payload. Route it as a genuinely separate, filtered send, not a broadcast-then-hide-in-UI.
