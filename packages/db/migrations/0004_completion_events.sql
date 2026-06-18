-- Append-only log of server-validated game completions. This is the source of
-- truth that stats, streaks, achievements, and leaderboards are replayed from.
-- UNIQUE (device_id, progress_id) makes a re-submitted completion a no-op.
CREATE TABLE IF NOT EXISTS completion_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'master')),
  progress_id TEXT NOT NULL,
  elapsed_seconds INTEGER NOT NULL,
  mistakes INTEGER NOT NULL,
  hints_used INTEGER NOT NULL,
  score INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  flags TEXT NOT NULL CHECK (json_valid(flags)),
  completed_at TEXT NOT NULL,
  UNIQUE (device_id, progress_id)
);

CREATE INDEX IF NOT EXISTS completion_events_device_idx ON completion_events (device_id, completed_at);
