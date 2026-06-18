-- Immutable published daily puzzles. Keyed uniquely by (date, game, difficulty)
-- so a published daily is canonical and never changes for players, independent
-- of later generator-algorithm changes. Solution data is stored for server-side
-- validation but is never exposed in public responses.
CREATE TABLE IF NOT EXISTS published_dailies (
  id TEXT PRIMARY KEY,
  challenge_date TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'master')),
  seed TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  puzzle_data TEXT NOT NULL CHECK (json_valid(puzzle_data)),
  solution_data TEXT NOT NULL CHECK (json_valid(solution_data)),
  published_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE (challenge_date, game_type, difficulty)
);

CREATE INDEX IF NOT EXISTS published_dailies_date_idx ON published_dailies (game_type, challenge_date);

-- Append-only audit of publish and override actions.
CREATE TABLE IF NOT EXISTS daily_publish_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_date TEXT NOT NULL,
  game_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('publish', 'override')),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS daily_publish_audit_date_idx ON daily_publish_audit (challenge_date, game_type);
