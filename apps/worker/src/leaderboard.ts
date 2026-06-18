import { hashSeed } from "@puzzlehub/game-core";
import type { Difficulty, GameType } from "@puzzlehub/game-core";

import type { CompletionEvent, CompletionStore } from "./completion";

// Leaderboard built only from server-validated completions (the completion-event
// log). Client-reported scores are never used. Entries expose a stable pseudonym
// derived from the device id — never the device id itself, so no PII leaks.

export const allTimePeriod = "all-time" as const;

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  score: number;
  elapsedSeconds: number;
  completedAt: string;
}

export interface LeaderboardScope {
  gameType: GameType;
  difficulty: Difficulty;
  period: string; // "all-time" or a YYYY-MM-DD daily board
}

export interface LeaderboardStore {
  save(scope: LeaderboardScope, entries: LeaderboardEntry[], updatedAt: string): Promise<void>;
  get(scope: LeaderboardScope): Promise<LeaderboardEntry[]>;
}

// Stable, non-reversible-looking handle for a device. Deterministic so a device
// keeps the same name across rebuilds, but carries no device id or PII.
export function pseudonymForDevice(deviceId: string): string {
  const handle = hashSeed(`pseudonym:${deviceId}`).toString(36).toUpperCase().padStart(5, "0");
  return `Player-${handle.slice(0, 5)}`;
}

// Best clean completion per device wins. Flagged completions (anti-cheat) are
// excluded so only trustworthy results appear. Ties break on faster time, then
// earliest completion.
function isBetter(candidate: CompletionEvent, current: CompletionEvent): boolean {
  if (candidate.score !== current.score) {
    return candidate.score > current.score;
  }

  if (candidate.elapsedSeconds !== current.elapsedSeconds) {
    return candidate.elapsedSeconds < current.elapsedSeconds;
  }

  return candidate.completedAt < current.completedAt;
}

export function buildLeaderboard(events: CompletionEvent[], limit = 100): LeaderboardEntry[] {
  const bestByDevice = new Map<string, CompletionEvent>();

  for (const event of events) {
    if (event.flags.length > 0) {
      continue;
    }

    const current = bestByDevice.get(event.deviceId);

    if (current === undefined || isBetter(event, current)) {
      bestByDevice.set(event.deviceId, event);
    }
  }

  return [...bestByDevice.values()]
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      if (a.elapsedSeconds !== b.elapsedSeconds) {
        return a.elapsedSeconds - b.elapsedSeconds;
      }
      return a.completedAt < b.completedAt ? -1 : 1;
    })
    .slice(0, limit)
    .map((event, index) => ({
      rank: index + 1,
      displayName: pseudonymForDevice(event.deviceId),
      score: event.score,
      elapsedSeconds: event.elapsedSeconds,
      completedAt: event.completedAt,
    }));
}

// Rebuild the all-time and daily boards for a (gameType, difficulty) from the
// event log. Called by the queue consumer after each completion.
export async function rebuildLeaderboards(
  completionStore: CompletionStore,
  leaderboardStore: LeaderboardStore,
  gameType: GameType,
  difficulty: Difficulty,
  date: string,
  updatedAt: string,
): Promise<void> {
  const allTimeEvents = await completionStore.listForLeaderboard(gameType, difficulty);
  await leaderboardStore.save(
    { gameType, difficulty, period: allTimePeriod },
    buildLeaderboard(allTimeEvents),
    updatedAt,
  );

  const dailyEvents = await completionStore.listForLeaderboard(gameType, difficulty, date);
  await leaderboardStore.save(
    { gameType, difficulty, period: date },
    buildLeaderboard(dailyEvents),
    updatedAt,
  );
}

export class InMemoryLeaderboardStore implements LeaderboardStore {
  private readonly boards = new Map<string, LeaderboardEntry[]>();

  private key(scope: LeaderboardScope): string {
    return `${scope.gameType}:${scope.difficulty}:${scope.period}`;
  }

  save(scope: LeaderboardScope, entries: LeaderboardEntry[]): Promise<void> {
    this.boards.set(this.key(scope), entries);
    return Promise.resolve();
  }

  get(scope: LeaderboardScope): Promise<LeaderboardEntry[]> {
    return Promise.resolve(this.boards.get(this.key(scope)) ?? []);
  }
}

export class D1LeaderboardStore implements LeaderboardStore {
  constructor(private readonly db: D1Database) {}

  async save(
    scope: LeaderboardScope,
    entries: LeaderboardEntry[],
    updatedAt: string,
  ): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO leaderboards (id, game_type, difficulty, period, entries, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(game_type, difficulty, period) DO UPDATE SET entries = excluded.entries, updated_at = excluded.updated_at",
      )
      .bind(
        `${scope.gameType}:${scope.difficulty}:${scope.period}`,
        scope.gameType,
        scope.difficulty,
        scope.period,
        JSON.stringify(entries),
        updatedAt,
      )
      .run();
  }

  async get(scope: LeaderboardScope): Promise<LeaderboardEntry[]> {
    const row = await this.db
      .prepare(
        "SELECT entries FROM leaderboards WHERE game_type = ? AND difficulty = ? AND period = ?",
      )
      .bind(scope.gameType, scope.difficulty, scope.period)
      .first<{ entries: string }>();

    return row ? (JSON.parse(row.entries) as LeaderboardEntry[]) : [];
  }
}
