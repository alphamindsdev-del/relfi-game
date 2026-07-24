# Rel-Fi Games — D1 Schema

All tables live in one D1 database. Room *live* state (current round, timer, who's locked in) is NOT stored here — that lives only in the Durable Object's in-memory/transactional storage while the room is active, and gets flushed to D1 (`rounds`, `round_answers`) once a round completes, for history/analytics.

```sql
-- ============ USERS ============
CREATE TABLE users (
  id TEXT PRIMARY KEY,               -- uuid
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,                 -- null if provisioned via embedded/AlphaMinds SSO
  external_auth_source TEXT,         -- 'standalone' | 'alphaminds'
  external_auth_id TEXT,             -- id from AlphaMinds' auth system, if applicable
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'player', -- 'player' | 'admin'
  password_hash TEXT,                -- null if external_auth_source != 'standalone'
  created_at INTEGER NOT NULL,
  UNIQUE(external_auth_source, external_auth_id)
);

-- ============ CATEGORIES ============
-- The "fiction pattern" types — fully admin-defined, no hardcoded content
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                -- e.g. "F5 — Evidence Strain" (admin-authored)
  short_code TEXT,                   -- e.g. "F5"
  color_hex TEXT NOT NULL,
  icon_key TEXT,                     -- maps to a frontend icon set
  definition TEXT,                   -- shown on reveal / reference sheet
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

-- ============ DECKS ============
CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_published INTEGER NOT NULL DEFAULT 0, -- 0/1, only published decks are host-selectable
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Which categories a deck uses (many-to-many)
CREATE TABLE deck_categories (
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (deck_id, category_id)
);

-- ============ STATEMENT CARDS ============
CREATE TABLE statement_cards (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  statement_text TEXT NOT NULL,
  correct_category_id TEXT NOT NULL REFERENCES categories(id),
  friction_explanation TEXT,          -- shown on reveal screen
  clue_variant TEXT NOT NULL DEFAULT 'none', -- 'none' | 'narrowed_list' | 'partial_text' | 'exact_answer'
  clue_payload TEXT,                  -- JSON: e.g. {"narrowed_ids":["cat_1","cat_3"]} or {"text":"..."}
  difficulty TEXT DEFAULT 'medium',   -- 'easy' | 'medium' | 'hard'
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- ============ ROOMS (historical record) ============
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,                -- also the Durable Object id
  room_code TEXT UNIQUE NOT NULL,     -- 5-char shareable code, active rooms only
  deck_id TEXT NOT NULL REFERENCES decks(id),
  host_user_id TEXT NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL,                 -- 'solo' | 'seer_skeptic' | 'multiplayer_seer'
  status TEXT NOT NULL DEFAULT 'lobby', -- 'lobby' | 'in_progress' | 'completed' | 'abandoned'
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE room_players (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  total_tokens INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (room_id, user_id)
);

-- ============ ROUNDS (historical record, flushed from Durable Object) ============
CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  statement_card_id TEXT NOT NULL REFERENCES statement_cards(id),
  round_number INTEGER NOT NULL,
  seer_user_id TEXT REFERENCES users(id),      -- null in solo mode
  skeptic_user_id TEXT REFERENCES users(id),   -- null in solo mode
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE round_answers (
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  chosen_category_id TEXT REFERENCES categories(id),
  decision_type TEXT,                 -- 'solo' | 'followed_seer' | 'called_bluff' | 'went_solo'
  trusted_seer_id TEXT REFERENCES users(id), -- which seer they followed, multiplayer mode
  is_correct INTEGER,                 -- 0/1
  tokens_awarded INTEGER NOT NULL DEFAULT 0,
  locked_at INTEGER NOT NULL,
  PRIMARY KEY (round_id, user_id)
);

-- Indexes
CREATE INDEX idx_statement_cards_deck ON statement_cards(deck_id);
CREATE INDEX idx_rooms_code ON rooms(room_code);
CREATE INDEX idx_rounds_room ON rounds(room_id);
CREATE INDEX idx_round_answers_round ON round_answers(round_id);
```

## Notes

- `clue_payload` is stored as JSON text since D1/SQLite has no native JSON column type — parse in the Worker before sending to the client, and **only ever send it to the Seer's own connection**, never broadcast.
- `room_code` should be released back to the pool (or just left to expire/collide-check) once `status` moves to `completed`/`abandoned` — enforce uniqueness only among rooms with `status IN ('lobby','in_progress')` at the application layer, or clear the code on completion.
- Token totals live in both `room_players.total_tokens` (running total for the leaderboard) and are derivable from summing `round_answers.tokens_awarded` — keep the running total for fast reads, treat the sum as the source of truth for reconciliation/audits.
