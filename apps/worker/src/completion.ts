import type { Difficulty, GameType } from "@puzzlehub/game-core";

// Server-side completion processing. A completion is validated, scored, given
// XP, anti-cheat flagged, persisted to the append-only event log, and published
// to the events queue for async stats/streak/achievement/leaderboard work. All
// logic runs against injected interfaces so it is unit-testable without D1 or a
// live queue.

export interface CompletionEvent {
  id: string;
  deviceId: string;
  gameType: GameType;
  difficulty: Difficulty;
  progressId: string;
  elapsedSeconds: number;
  mistakes: number;
  hintsUsed: number;
  score: number;
  xp: number;
  flags: string[];
  isDaily: boolean;
  completedAt: string;
}

export interface CompletionStore {
  // Append a completion; idempotent on (deviceId, progressId). Returns true if a
  // new row was written, false if it was a duplicate.
  append(event: CompletionEvent): Promise<boolean>;
  exists(deviceId: string, progressId: string): Promise<boolean>;
  // Replay: all of a device's completions, oldest first.
  listByDevice(deviceId: string): Promise<CompletionEvent[]>;
  // Cross-device completions for a leaderboard scope. `datePrefix` (YYYY-MM-DD)
  // narrows to a single day for daily boards.
  listForLeaderboard(
    gameType: GameType,
    difficulty: Difficulty,
    datePrefix?: string,
  ): Promise<CompletionEvent[]>;
}

export interface CompletionPublisher {
  publish(event: CompletionEvent): Promise<void>;
}

// XP rule: a deterministic base per difficulty plus a score bonus, lightly
// reduced by hint use. Never negative.
const xpBaseByDifficulty: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 35,
  expert: 55,
  master: 80,
};

export function calculateXp(difficulty: Difficulty, score: number, hintsUsed: number): number {
  const base = xpBaseByDifficulty[difficulty];
  const scoreBonus = Math.floor(Math.max(0, score) / 100);
  return Math.max(0, base + scoreBonus - hintsUsed * 2);
}

// Minimum plausible solve time (seconds) per difficulty; faster than this is
// almost certainly automated.
const minPlausibleSeconds: Record<Difficulty, number> = {
  easy: 20,
  medium: 35,
  hard: 50,
  expert: 75,
  master: 100,
};

export interface FlagCompletionInput {
  difficulty: Difficulty;
  elapsedSeconds: number;
  mistakes: number;
  hintsUsed: number;
  isDuplicate: boolean;
}

// Anti-cheat flags. Pure function of the submission; flags are advisory signals
// for downstream review, not hard rejections (except duplicates, which are not
// re-recorded).
export function flagCompletion(input: FlagCompletionInput): string[] {
  const flags: string[] = [];

  if (input.elapsedSeconds < minPlausibleSeconds[input.difficulty]) {
    flags.push("unrealistic_time");
  }

  if (input.mistakes > 20) {
    flags.push("excessive_mistakes");
  }

  if (input.hintsUsed > 10) {
    flags.push("excessive_hints");
  }

  if (input.isDuplicate) {
    flags.push("duplicate_submission");
  }

  return flags;
}

export interface RecordCompletionInput {
  id: string;
  deviceId: string;
  gameType: GameType;
  difficulty: Difficulty;
  progressId: string;
  elapsedSeconds: number;
  mistakes: number;
  hintsUsed: number;
  score: number;
  isDaily: boolean;
  completedAt: string;
}

export interface RecordCompletionResult {
  event: CompletionEvent;
  recorded: boolean;
  duplicate: boolean;
}

// Build, persist, and publish a completion. A duplicate (same device+progress)
// is flagged and returned but neither re-stored nor re-published, so stats stay
// replayable from a single canonical event per attempt.
export async function recordCompletion(
  store: CompletionStore,
  publisher: CompletionPublisher,
  input: RecordCompletionInput,
): Promise<RecordCompletionResult> {
  const duplicate = await store.exists(input.deviceId, input.progressId);

  const event: CompletionEvent = {
    id: input.id,
    deviceId: input.deviceId,
    gameType: input.gameType,
    difficulty: input.difficulty,
    progressId: input.progressId,
    elapsedSeconds: input.elapsedSeconds,
    mistakes: input.mistakes,
    hintsUsed: input.hintsUsed,
    score: input.score,
    xp: calculateXp(input.difficulty, input.score, input.hintsUsed),
    flags: flagCompletion({
      difficulty: input.difficulty,
      elapsedSeconds: input.elapsedSeconds,
      mistakes: input.mistakes,
      hintsUsed: input.hintsUsed,
      isDuplicate: duplicate,
    }),
    isDaily: input.isDaily,
    completedAt: input.completedAt,
  };

  if (duplicate) {
    return { event, recorded: false, duplicate: true };
  }

  const recorded = await store.append(event);

  if (recorded) {
    await publisher.publish(event);
  }

  return { event, recorded, duplicate: false };
}

interface CompletionRow {
  id: string;
  device_id: string;
  game_type: string;
  difficulty: string;
  progress_id: string;
  elapsed_seconds: number;
  mistakes: number;
  hints_used: number;
  score: number;
  xp: number;
  flags: string;
  is_daily: number;
  completed_at: string;
}

function rowToEvent(row: CompletionRow): CompletionEvent {
  return {
    id: row.id,
    deviceId: row.device_id,
    gameType: row.game_type as GameType,
    difficulty: row.difficulty as Difficulty,
    progressId: row.progress_id,
    elapsedSeconds: row.elapsed_seconds,
    mistakes: row.mistakes,
    hintsUsed: row.hints_used,
    score: row.score,
    xp: row.xp,
    flags: JSON.parse(row.flags) as string[],
    isDaily: row.is_daily === 1,
    completedAt: row.completed_at,
  };
}

export class InMemoryCompletionStore implements CompletionStore {
  readonly events: CompletionEvent[] = [];
  private readonly keys = new Set<string>();

  append(event: CompletionEvent): Promise<boolean> {
    const key = `${event.deviceId}:${event.progressId}`;

    if (this.keys.has(key)) {
      return Promise.resolve(false);
    }

    this.keys.add(key);
    this.events.push(event);
    return Promise.resolve(true);
  }

  exists(deviceId: string, progressId: string): Promise<boolean> {
    return Promise.resolve(this.keys.has(`${deviceId}:${progressId}`));
  }

  listByDevice(deviceId: string): Promise<CompletionEvent[]> {
    return Promise.resolve(this.events.filter((event) => event.deviceId === deviceId));
  }

  listForLeaderboard(
    gameType: GameType,
    difficulty: Difficulty,
    datePrefix?: string,
  ): Promise<CompletionEvent[]> {
    return Promise.resolve(
      this.events.filter(
        (event) =>
          event.gameType === gameType &&
          event.difficulty === difficulty &&
          (datePrefix === undefined || event.completedAt.startsWith(datePrefix)),
      ),
    );
  }
}

export class D1CompletionStore implements CompletionStore {
  constructor(private readonly db: D1Database) {}

  async append(event: CompletionEvent): Promise<boolean> {
    const result = await this.db
      .prepare(
        "INSERT OR IGNORE INTO completion_events (id, device_id, game_type, difficulty, progress_id, elapsed_seconds, mistakes, hints_used, score, xp, flags, is_daily, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        event.id,
        event.deviceId,
        event.gameType,
        event.difficulty,
        event.progressId,
        event.elapsedSeconds,
        event.mistakes,
        event.hintsUsed,
        event.score,
        event.xp,
        JSON.stringify(event.flags),
        event.isDaily ? 1 : 0,
        event.completedAt,
      )
      .run();

    return result.meta.changes > 0;
  }

  async exists(deviceId: string, progressId: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 AS hit FROM completion_events WHERE device_id = ? AND progress_id = ?")
      .bind(deviceId, progressId)
      .first<{ hit: number }>();

    return row !== null;
  }

  async listByDevice(deviceId: string): Promise<CompletionEvent[]> {
    const { results } = await this.db
      .prepare(
        "SELECT id, device_id, game_type, difficulty, progress_id, elapsed_seconds, mistakes, hints_used, score, xp, flags, is_daily, completed_at FROM completion_events WHERE device_id = ? ORDER BY completed_at ASC",
      )
      .bind(deviceId)
      .all<CompletionRow>();

    return results.map(rowToEvent);
  }

  async listForLeaderboard(
    gameType: GameType,
    difficulty: Difficulty,
    datePrefix?: string,
  ): Promise<CompletionEvent[]> {
    const columns =
      "id, device_id, game_type, difficulty, progress_id, elapsed_seconds, mistakes, hints_used, score, xp, flags, is_daily, completed_at";
    const statement =
      datePrefix === undefined
        ? this.db
            .prepare(
              `SELECT ${columns} FROM completion_events WHERE game_type = ? AND difficulty = ?`,
            )
            .bind(gameType, difficulty)
        : this.db
            .prepare(
              `SELECT ${columns} FROM completion_events WHERE game_type = ? AND difficulty = ? AND completed_at LIKE ?`,
            )
            .bind(gameType, difficulty, `${datePrefix}%`);

    const { results } = await statement.all<CompletionRow>();
    return results.map(rowToEvent);
  }
}

export const completionMessageType = "sudoku.completed" as const;

export interface CompletionQueueMessage {
  type: typeof completionMessageType;
  event: CompletionEvent;
}

// Queue producer backed by the Cloudflare Queue binding.
export class QueueCompletionPublisher implements CompletionPublisher {
  constructor(private readonly queue: Queue<CompletionQueueMessage>) {}

  async publish(event: CompletionEvent): Promise<void> {
    await this.queue.send({ type: completionMessageType, event });
  }
}
