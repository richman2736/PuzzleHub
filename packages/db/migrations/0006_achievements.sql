-- Flag completions that were the published daily challenge (for the
-- first-daily achievement). Existing rows default to non-daily.
ALTER TABLE completion_events ADD COLUMN is_daily INTEGER NOT NULL DEFAULT 0;

-- Unlocked achievements per device. Achievements are evaluated deterministically
-- by replaying completion_events, so this table is a derived, rebuildable cache.
-- INSERT OR IGNORE on the composite key keeps the first unlock immutable.
CREATE TABLE IF NOT EXISTS device_achievements (
  device_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (device_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS device_achievements_device_idx ON device_achievements (device_id);
