-- Sync op log for idempotent local-first synchronization.
-- server_seq is an AUTOINCREMENT primary key, giving a monotonic pull cursor;
-- op_id is UNIQUE so re-sending the same op is a no-op (idempotency).
CREATE TABLE IF NOT EXISTS sync_ops (
  server_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('move', 'complete', 'reset')),
  local_seq INTEGER NOT NULL,
  base_rev INTEGER NOT NULL,
  applied_rev INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_ops_device_seq_idx ON sync_ops (device_id, server_seq);
CREATE INDEX IF NOT EXISTS sync_ops_game_idx ON sync_ops (game_id);

-- Per-game revision and current owner device (the active local device that wins
-- conflicts under the MVP rule).
CREATE TABLE IF NOT EXISTS game_sync_state (
  game_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  owner_device_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
