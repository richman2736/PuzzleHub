PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_account_idx ON accounts (provider_id, account_id);

CREATE TABLE IF NOT EXISTS games (
  type TEXT PRIMARY KEY CHECK (type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'master')),
  seed TEXT NOT NULL,
  puzzle_data TEXT NOT NULL CHECK (json_valid(puzzle_data)),
  solution_data TEXT NOT NULL CHECK (json_valid(solution_data)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS puzzles_game_type_difficulty_idx ON puzzles (game_type, difficulty);
CREATE UNIQUE INDEX IF NOT EXISTS puzzles_game_type_seed_idx ON puzzles (game_type, seed);

CREATE TABLE IF NOT EXISTS daily_challenges (
  id TEXT PRIMARY KEY,
  challenge_date TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  puzzle_id TEXT NOT NULL REFERENCES puzzles (id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'master')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_challenges_date_game_type_idx ON daily_challenges (challenge_date, game_type);
CREATE INDEX IF NOT EXISTS daily_challenges_puzzle_id_idx ON daily_challenges (puzzle_id);

CREATE TABLE IF NOT EXISTS user_game_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  puzzle_id TEXT NOT NULL REFERENCES puzzles (id) ON DELETE CASCADE,
  state_data TEXT NOT NULL CHECK (json_valid(state_data)),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  mistakes INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_game_progress_user_id_idx ON user_game_progress (user_id);
CREATE INDEX IF NOT EXISTS user_game_progress_puzzle_id_idx ON user_game_progress (puzzle_id);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  games_played INTEGER NOT NULL DEFAULT 0,
  games_completed INTEGER NOT NULL DEFAULT 0,
  best_time INTEGER,
  average_time INTEGER,
  total_score INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, game_type)
);

CREATE TABLE IF NOT EXISTS user_streaks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  current_count INTEGER NOT NULL DEFAULT 0,
  longest_count INTEGER NOT NULL DEFAULT 0,
  last_played_date TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_streaks_user_game_idx ON user_streaks (user_id, game_type);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  game_type TEXT CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS leaderboards (
  id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'master')),
  period TEXT NOT NULL,
  entries TEXT NOT NULL CHECK (json_valid(entries)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS leaderboards_scope_idx ON leaderboards (game_type, difficulty, period);

CREATE TABLE IF NOT EXISTS puzzle_packs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  game_type TEXT NOT NULL CHECK (game_type IN ('sudoku', 'block', 'word', 'sort', 'nonogram')),
  manifest TEXT NOT NULL CHECK (json_valid(manifest)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS puzzle_packs_game_type_idx ON puzzle_packs (game_type);
