import type { Difficulty, GameType } from "@puzzlehub/game-core";

// Daily publishing engine. Correctness lives here against the DailyStore
// interface, so it is unit-testable with the in-memory store; the D1 store is a
// thin adapter. Published records are immutable: a normal publish never
// overwrites an existing date, and a regenerate is recorded as an audited
// override.

export interface DailyPuzzleData {
  grid: number[][];
  givens: boolean[][];
  clueCount: number;
}

export interface DailyRecord {
  id: string;
  challengeDate: string;
  gameType: GameType;
  difficulty: Difficulty;
  seed: string;
  generatorVersion: string;
  puzzleData: DailyPuzzleData;
  solutionData: { grid: number[][] };
  publishedAt: string;
  revision: number;
}

export interface DailyAuditEntry {
  challengeDate: string;
  gameType: GameType;
  difficulty: Difficulty;
  action: "publish" | "override";
  actor: string;
  createdAt: string;
}

// A freshly generated (not yet persisted) daily, produced by the injected
// generator. Excludes persistence-only fields (publishedAt, revision).
export type GeneratedDaily = Omit<DailyRecord, "publishedAt" | "revision">;

export type DailyGenerator = (
  challengeDate: string,
  gameType: GameType,
  difficulty: Difficulty,
) => GeneratedDaily;

export interface DailyStore {
  get(
    challengeDate: string,
    gameType: GameType,
    difficulty: Difficulty,
  ): Promise<DailyRecord | null>;
  insert(record: DailyRecord): Promise<void>;
  replace(record: DailyRecord): Promise<void>;
  list(startDate: string, endDate: string, gameType: GameType): Promise<DailyRecord[]>;
  appendAudit(entry: DailyAuditEntry): Promise<void>;
}

export function addUtcDays(challengeDate: string, days: number): string {
  const date = new Date(`${challengeDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function enumerateDates(startDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, offset) => addUtcDays(startDate, offset));
}

export interface PublishDailyOptions {
  startDate: string;
  days: number;
  gameType: GameType;
  difficulties: Difficulty[];
  regenerate: boolean;
  actor: string;
  publishedAt: string;
}

export interface PublishDailyEntry {
  challengeDate: string;
  difficulty: Difficulty;
  status: "published" | "republished" | "skipped";
  revision: number;
}

export interface PublishDailySummary {
  published: number;
  republished: number;
  skipped: number;
  entries: PublishDailyEntry[];
}

export async function publishDailyRange(
  store: DailyStore,
  generate: DailyGenerator,
  options: PublishDailyOptions,
): Promise<PublishDailySummary> {
  const summary: PublishDailySummary = { published: 0, republished: 0, skipped: 0, entries: [] };

  for (const challengeDate of enumerateDates(options.startDate, options.days)) {
    for (const difficulty of options.difficulties) {
      const existing = await store.get(challengeDate, options.gameType, difficulty);

      if (existing && !options.regenerate) {
        summary.skipped += 1;
        summary.entries.push({
          challengeDate,
          difficulty,
          status: "skipped",
          revision: existing.revision,
        });
        continue;
      }

      const generated = generate(challengeDate, options.gameType, difficulty);

      if (existing) {
        const record: DailyRecord = {
          ...generated,
          publishedAt: options.publishedAt,
          revision: existing.revision + 1,
        };
        await store.replace(record);
        await store.appendAudit({
          challengeDate,
          gameType: options.gameType,
          difficulty,
          action: "override",
          actor: options.actor,
          createdAt: options.publishedAt,
        });
        summary.republished += 1;
        summary.entries.push({
          challengeDate,
          difficulty,
          status: "republished",
          revision: record.revision,
        });
        continue;
      }

      const record: DailyRecord = { ...generated, publishedAt: options.publishedAt, revision: 1 };
      await store.insert(record);
      await store.appendAudit({
        challengeDate,
        gameType: options.gameType,
        difficulty,
        action: "publish",
        actor: options.actor,
        createdAt: options.publishedAt,
      });
      summary.published += 1;
      summary.entries.push({ challengeDate, difficulty, status: "published", revision: 1 });
    }
  }

  return summary;
}

export interface DailyStatusEntry {
  challengeDate: string;
  difficulty: Difficulty;
  published: boolean;
  publishedAt: string | null;
  revision: number | null;
}

export interface DailyStatusReport {
  startDate: string;
  endDate: string;
  entries: DailyStatusEntry[];
  missing: DailyStatusEntry[];
}

export async function getDailyStatus(
  store: DailyStore,
  options: { startDate: string; days: number; gameType: GameType; difficulties: Difficulty[] },
): Promise<DailyStatusReport> {
  const dates = enumerateDates(options.startDate, options.days);
  const endDate = dates[dates.length - 1] ?? options.startDate;
  const published = await store.list(options.startDate, endDate, options.gameType);

  const byKey = new Map<string, DailyRecord>();
  for (const record of published) {
    byKey.set(`${record.challengeDate}:${record.difficulty}`, record);
  }

  const entries: DailyStatusEntry[] = [];
  for (const challengeDate of dates) {
    for (const difficulty of options.difficulties) {
      const record = byKey.get(`${challengeDate}:${difficulty}`);
      entries.push({
        challengeDate,
        difficulty,
        published: record !== undefined,
        publishedAt: record?.publishedAt ?? null,
        revision: record?.revision ?? null,
      });
    }
  }

  return {
    startDate: options.startDate,
    endDate,
    entries,
    missing: entries.filter((e) => !e.published),
  };
}

export class InMemoryDailyStore implements DailyStore {
  private readonly records = new Map<string, DailyRecord>();
  readonly audit: DailyAuditEntry[] = [];

  private key(challengeDate: string, gameType: GameType, difficulty: Difficulty): string {
    return `${challengeDate}:${gameType}:${difficulty}`;
  }

  get(
    challengeDate: string,
    gameType: GameType,
    difficulty: Difficulty,
  ): Promise<DailyRecord | null> {
    return Promise.resolve(this.records.get(this.key(challengeDate, gameType, difficulty)) ?? null);
  }

  insert(record: DailyRecord): Promise<void> {
    const key = this.key(record.challengeDate, record.gameType, record.difficulty);

    if (this.records.has(key)) {
      throw new Error(`daily already published: ${key}`);
    }

    this.records.set(key, record);
    return Promise.resolve();
  }

  replace(record: DailyRecord): Promise<void> {
    this.records.set(this.key(record.challengeDate, record.gameType, record.difficulty), record);
    return Promise.resolve();
  }

  list(startDate: string, endDate: string, gameType: GameType): Promise<DailyRecord[]> {
    const matching = [...this.records.values()].filter(
      (record) =>
        record.gameType === gameType &&
        record.challengeDate >= startDate &&
        record.challengeDate <= endDate,
    );

    return Promise.resolve(matching);
  }

  appendAudit(entry: DailyAuditEntry): Promise<void> {
    this.audit.push(entry);
    return Promise.resolve();
  }
}

interface DailyRow {
  id: string;
  challenge_date: string;
  game_type: string;
  difficulty: string;
  seed: string;
  generator_version: string;
  puzzle_data: string;
  solution_data: string;
  published_at: string;
  revision: number;
}

function rowToRecord(row: DailyRow): DailyRecord {
  return {
    id: row.id,
    challengeDate: row.challenge_date,
    gameType: row.game_type as GameType,
    difficulty: row.difficulty as Difficulty,
    seed: row.seed,
    generatorVersion: row.generator_version,
    puzzleData: JSON.parse(row.puzzle_data) as DailyPuzzleData,
    solutionData: JSON.parse(row.solution_data) as { grid: number[][] },
    publishedAt: row.published_at,
    revision: row.revision,
  };
}

export class D1DailyStore implements DailyStore {
  constructor(private readonly db: D1Database) {}

  async get(
    challengeDate: string,
    gameType: GameType,
    difficulty: Difficulty,
  ): Promise<DailyRecord | null> {
    const row = await this.db
      .prepare(
        "SELECT id, challenge_date, game_type, difficulty, seed, generator_version, puzzle_data, solution_data, published_at, revision FROM published_dailies WHERE challenge_date = ? AND game_type = ? AND difficulty = ?",
      )
      .bind(challengeDate, gameType, difficulty)
      .first<DailyRow>();

    return row ? rowToRecord(row) : null;
  }

  async insert(record: DailyRecord): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO published_dailies (id, challenge_date, game_type, difficulty, seed, generator_version, puzzle_data, solution_data, published_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.id,
        record.challengeDate,
        record.gameType,
        record.difficulty,
        record.seed,
        record.generatorVersion,
        JSON.stringify(record.puzzleData),
        JSON.stringify(record.solutionData),
        record.publishedAt,
        record.revision,
      )
      .run();
  }

  async replace(record: DailyRecord): Promise<void> {
    await this.db
      .prepare(
        "UPDATE published_dailies SET seed = ?, generator_version = ?, puzzle_data = ?, solution_data = ?, published_at = ?, revision = ? WHERE challenge_date = ? AND game_type = ? AND difficulty = ?",
      )
      .bind(
        record.seed,
        record.generatorVersion,
        JSON.stringify(record.puzzleData),
        JSON.stringify(record.solutionData),
        record.publishedAt,
        record.revision,
        record.challengeDate,
        record.gameType,
        record.difficulty,
      )
      .run();
  }

  async list(startDate: string, endDate: string, gameType: GameType): Promise<DailyRecord[]> {
    const { results } = await this.db
      .prepare(
        "SELECT id, challenge_date, game_type, difficulty, seed, generator_version, puzzle_data, solution_data, published_at, revision FROM published_dailies WHERE game_type = ? AND challenge_date >= ? AND challenge_date <= ? ORDER BY challenge_date ASC",
      )
      .bind(gameType, startDate, endDate)
      .all<DailyRow>();

    return results.map(rowToRecord);
  }

  async appendAudit(entry: DailyAuditEntry): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO daily_publish_audit (challenge_date, game_type, difficulty, action, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        entry.challengeDate,
        entry.gameType,
        entry.difficulty,
        entry.action,
        entry.actor,
        entry.createdAt,
      )
      .run();
  }
}
