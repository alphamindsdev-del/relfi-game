-- ============ USERS ============
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  external_auth_source TEXT,
  external_auth_id TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'player',
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(external_auth_source, external_auth_id)
);

-- ============ CATEGORIES ============
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_code TEXT,
  color_hex TEXT NOT NULL,
  icon_key TEXT,
  definition TEXT,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

-- ============ DECKS ============
CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

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
  friction_explanation TEXT,
  clue_variant TEXT NOT NULL DEFAULT 'none',
  clue_payload TEXT,
  difficulty TEXT DEFAULT 'medium',
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- ============ ROOMS ============
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,
  deck_id TEXT NOT NULL REFERENCES decks(id),
  host_user_id TEXT NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby',
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

-- ============ ROUNDS ============
CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  statement_card_id TEXT NOT NULL REFERENCES statement_cards(id),
  round_number INTEGER NOT NULL,
  seer_user_id TEXT REFERENCES users(id),
  skeptic_user_id TEXT REFERENCES users(id),
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE round_answers (
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  chosen_category_id TEXT REFERENCES categories(id),
  decision_type TEXT,
  trusted_seer_id TEXT REFERENCES users(id),
  is_correct INTEGER,
  tokens_awarded INTEGER NOT NULL DEFAULT 0,
  locked_at INTEGER NOT NULL,
  PRIMARY KEY (round_id, user_id)
);

-- ============ INDEXES ============
CREATE INDEX idx_statement_cards_deck ON statement_cards(deck_id);
CREATE INDEX idx_rooms_code ON rooms(room_code);
CREATE INDEX idx_rounds_room ON rounds(room_id);
CREATE INDEX idx_round_answers_round ON round_answers(round_id);
