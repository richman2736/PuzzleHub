-- Per-device, per-game aggregated stats (including streaks). Derived from the
-- completion_events log: the queue consumer replays a device's events to
-- recompute this row, so it is always reproducible and safe to rebuild.
-- Streaks use UTC calendar days (the documented MVP streak timezone).
CREATE TABLE IF NOT EXISTS device_stats (
  device_id TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  games_completed INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  total_xp INTEGER NOT NULL DEFAULT 0,
  best_time_seconds INTEGER,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_played_date TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, game_type)
);
