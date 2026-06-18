import type { GameType } from "@puzzlehub/game-core";

import type { CompletionEvent, CompletionStore } from "./completion";

// Stats + streak aggregation. Stats are a pure fold over the completion-event
// log, so they are always reproducible: the queue consumer replays a device's
// events to recompute the row, which makes aggregation idempotent under
// at-least-once queue delivery.

export interface DeviceStats {
  deviceId: string;
  gameType: GameType;
  gamesCompleted: number;
  totalScore: number;
  totalXp: number;
  bestTimeSeconds: number | null;
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
  updatedAt: string;
}

export interface StatsStore {
  get(deviceId: string, gameType: GameType): Promise<DeviceStats | null>;
  upsert(stats: DeviceStats): Promise<void>;
}

// Streak timezone rule (MVP): a streak day is the UTC calendar day of the
// completion timestamp. completedAt is an ISO-8601 UTC instant, so the day is
// its date prefix.
export function streakDate(completedAt: string): string {
  return completedAt.slice(0, 10);
}

function addUtcDay(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function emptyStats(deviceId: string, gameType: GameType, updatedAt: string): DeviceStats {
  return {
    deviceId,
    gameType,
    gamesCompleted: 0,
    totalScore: 0,
    totalXp: 0,
    bestTimeSeconds: null,
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedDate: null,
    updatedAt,
  };
}

// Advance the streak for a play on `playedDate`:
//   - first ever play -> 1
//   - same UTC day as the last play -> unchanged
//   - exactly the next UTC day -> +1
//   - a later day with a gap -> reset to 1
//   - an earlier day (out-of-order replay) -> unchanged
function nextStreak(
  stats: Pick<DeviceStats, "currentStreak" | "longestStreak" | "lastPlayedDate">,
  playedDate: string,
): { currentStreak: number; longestStreak: number } {
  let currentStreak: number;

  if (stats.lastPlayedDate === null) {
    currentStreak = 1;
  } else if (playedDate === stats.lastPlayedDate) {
    currentStreak = stats.currentStreak;
  } else if (playedDate < stats.lastPlayedDate) {
    currentStreak = stats.currentStreak;
  } else if (playedDate === addUtcDay(stats.lastPlayedDate)) {
    currentStreak = stats.currentStreak + 1;
  } else {
    currentStreak = 1;
  }

  return { currentStreak, longestStreak: Math.max(stats.longestStreak, currentStreak) };
}

export function applyCompletionToStats(
  current: DeviceStats | null,
  event: CompletionEvent,
  updatedAt: string,
): DeviceStats {
  const base = current ?? emptyStats(event.deviceId, event.gameType, updatedAt);
  const playedDate = streakDate(event.completedAt);
  const { currentStreak, longestStreak } = nextStreak(base, playedDate);

  return {
    deviceId: base.deviceId,
    gameType: base.gameType,
    gamesCompleted: base.gamesCompleted + 1,
    totalScore: base.totalScore + event.score,
    totalXp: base.totalXp + event.xp,
    bestTimeSeconds:
      base.bestTimeSeconds === null
        ? event.elapsedSeconds
        : Math.min(base.bestTimeSeconds, event.elapsedSeconds),
    currentStreak,
    longestStreak,
    lastPlayedDate:
      base.lastPlayedDate === null || playedDate > base.lastPlayedDate
        ? playedDate
        : base.lastPlayedDate,
    updatedAt,
  };
}

// Rebuild a device's stats from scratch by folding its completion events. Events
// are expected oldest-first (as the store returns them).
export function replayStats(
  deviceId: string,
  gameType: GameType,
  events: CompletionEvent[],
  updatedAt: string,
): DeviceStats {
  return (
    events
      .filter((event) => event.gameType === gameType)
      .reduce<DeviceStats | null>(
        (stats, event) => applyCompletionToStats(stats, event, updatedAt),
        null,
      ) ?? emptyStats(deviceId, gameType, updatedAt)
  );
}

// Consumer entrypoint: replay the device's events and persist the result.
export async function aggregateDeviceStats(
  completionStore: CompletionStore,
  statsStore: StatsStore,
  deviceId: string,
  gameType: GameType,
  updatedAt: string,
): Promise<DeviceStats> {
  const events = await completionStore.listByDevice(deviceId);
  const stats = replayStats(deviceId, gameType, events, updatedAt);
  await statsStore.upsert(stats);
  return stats;
}

interface DeviceStatsRow {
  device_id: string;
  game_type: string;
  games_completed: number;
  total_score: number;
  total_xp: number;
  best_time_seconds: number | null;
  current_streak: number;
  longest_streak: number;
  last_played_date: string | null;
  updated_at: string;
}

function rowToStats(row: DeviceStatsRow): DeviceStats {
  return {
    deviceId: row.device_id,
    gameType: row.game_type as GameType,
    gamesCompleted: row.games_completed,
    totalScore: row.total_score,
    totalXp: row.total_xp,
    bestTimeSeconds: row.best_time_seconds,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    lastPlayedDate: row.last_played_date,
    updatedAt: row.updated_at,
  };
}

export class InMemoryStatsStore implements StatsStore {
  private readonly rows = new Map<string, DeviceStats>();

  get(deviceId: string, gameType: GameType): Promise<DeviceStats | null> {
    return Promise.resolve(this.rows.get(`${deviceId}:${gameType}`) ?? null);
  }

  upsert(stats: DeviceStats): Promise<void> {
    this.rows.set(`${stats.deviceId}:${stats.gameType}`, stats);
    return Promise.resolve();
  }
}

export class D1StatsStore implements StatsStore {
  constructor(private readonly db: D1Database) {}

  async get(deviceId: string, gameType: GameType): Promise<DeviceStats | null> {
    const row = await this.db
      .prepare(
        "SELECT device_id, game_type, games_completed, total_score, total_xp, best_time_seconds, current_streak, longest_streak, last_played_date, updated_at FROM device_stats WHERE device_id = ? AND game_type = ?",
      )
      .bind(deviceId, gameType)
      .first<DeviceStatsRow>();

    return row ? rowToStats(row) : null;
  }

  async upsert(stats: DeviceStats): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO device_stats (device_id, game_type, games_completed, total_score, total_xp, best_time_seconds, current_streak, longest_streak, last_played_date, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device_id, game_type) DO UPDATE SET games_completed = excluded.games_completed, total_score = excluded.total_score, total_xp = excluded.total_xp, best_time_seconds = excluded.best_time_seconds, current_streak = excluded.current_streak, longest_streak = excluded.longest_streak, last_played_date = excluded.last_played_date, updated_at = excluded.updated_at",
      )
      .bind(
        stats.deviceId,
        stats.gameType,
        stats.gamesCompleted,
        stats.totalScore,
        stats.totalXp,
        stats.bestTimeSeconds,
        stats.currentStreak,
        stats.longestStreak,
        stats.lastPlayedDate,
        stats.updatedAt,
      )
      .run();
  }
}
