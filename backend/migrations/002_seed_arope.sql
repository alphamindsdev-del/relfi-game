-- Seed the 5 AROPE categories from the Player's Guide
INSERT INTO categories (id, name, short_code, color_hex, icon_key, definition, created_at)
VALUES
  ('cat_f1', 'Authority Dependence', 'F1', '#8B5CF6', 'scale', 'Belief based on recognized hierarchy or legitimacy rather than evidence.', 1710000000),
  ('cat_f2', 'Rigidity', 'F2', '#F59E0B', 'lock', 'Ideas presented as fixed, absolute, and not open to questioning.', 1710000000),
  ('cat_f3', 'Oversimplification', 'F3', '#EC4899', 'zap', 'Complex realities reduced to neat, single-cause explanations.', 1710000000),
  ('cat_f4', 'Power Imbalance', 'F4', '#06B6D4', 'swords', 'Unequal control between people who are natural or social equals.', 1710000000),
  ('cat_f5', 'Evidence Strain', 'F5', '#10B981', 'search', 'Claims presented as factual without adequate support or verification.', 1710000000);
