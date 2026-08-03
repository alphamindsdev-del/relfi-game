ALTER TABLE statement_cards ADD COLUMN clue_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE statement_cards ADD COLUMN clue_content TEXT;
