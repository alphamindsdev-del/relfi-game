ALTER TABLE statement_cards ADD COLUMN statement_image_url TEXT;

CREATE TABLE pending_cards (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  statement_image_url TEXT NOT NULL,
  filename TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_pending_cards_deck ON pending_cards(deck_id);
