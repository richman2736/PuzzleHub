import * as SQLite from "expo-sqlite";
import {
  createNotesGrid,
  sudokuDigits,
  type SudokuDigit,
  type SudokuMove,
  type SudokuPuzzle,
  type SudokuState,
} from "@puzzlehub/sudoku-engine";
import { runExclusiveWrite } from "./sqliteWriteQueue";
import type { OutboxOp, OutboxStore } from "./syncClient";

const databaseName = "puzzlehub-mobile.db";
const databaseVersion = 2;

// Outbox ops that fail this many times stop being re-sent, so a poison op cannot
// loop forever (e.g. a 4xx from a client-side bug).
const maxOutboxAttempts = 10;

export interface SavedSudokuGame {
  gameId: string;
  puzzle: SudokuPuzzle;
  state: SudokuState;
  updatedAt: string;
  localSeq: number;
}

export interface RecordSudokuMoveInput {
  gameId: string;
  puzzle: SudokuPuzzle;
  nextState: SudokuState;
  move: SudokuMove;
  accepted: boolean;
  correct?: boolean;
  reason?: string;
  action: "answer" | "erase" | "hint" | "note";
}

export interface SaveSudokuSnapshotInput {
  gameId: string;
  puzzle: SudokuPuzzle;
  state: SudokuState;
  action: "create" | "reset";
}

export interface UndoSudokuMoveInput {
  gameId: string;
  puzzle: SudokuPuzzle;
  initialState: SudokuState;
}

export interface UndoSudokuMoveResult {
  undone: boolean;
  state: SudokuState;
  localSeq: number;
}

export interface SudokuSyncSummary {
  pendingCount: number;
  conflictCount: number;
}

interface SudokuGameRow {
  game_id: string;
  puzzle_json: string;
  state_json: string;
  updated_at: string;
  local_seq: number;
}

interface SudokuMoveStateRow {
  local_seq: number;
  state_json: string;
}

interface SyncSummaryRow {
  pending_count: number;
  conflict_count: number;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openAndMigrateDatabase();

  return databasePromise;
}

async function openAndMigrateDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(databaseName);

  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await ensureSudokuTables(db);

  const version = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");

  if ((version?.user_version ?? 0) < databaseVersion) {
    await db.execAsync(`PRAGMA user_version = ${databaseVersion};`);
  }

  return db;
}

async function ensureSudokuTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sudoku_games (
      game_id TEXT PRIMARY KEY,
      puzzle_json TEXT NOT NULL,
      state_json TEXT NOT NULL,
      status TEXT NOT NULL,
      local_seq INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sudoku_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES sudoku_games(game_id) ON DELETE CASCADE,
      local_seq INTEGER NOT NULL,
      action TEXT NOT NULL,
      row INTEGER,
      col INTEGER,
      value INTEGER,
      mode TEXT,
      accepted INTEGER NOT NULL,
      correct INTEGER,
      reason TEXT,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(game_id, local_seq)
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op_id TEXT NOT NULL UNIQUE,
      game_id TEXT NOT NULL,
      local_seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      game_id TEXT PRIMARY KEY,
      base_rev INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sudoku_moves_game_idx
      ON sudoku_moves(game_id, local_seq);

    CREATE INDEX IF NOT EXISTS sync_outbox_status_idx
      ON sync_outbox(status, created_at);
  `);
}

export async function loadSavedSudokuGame(gameId: string): Promise<SavedSudokuGame | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SudokuGameRow>(
    `SELECT game_id, puzzle_json, state_json, updated_at, local_seq
     FROM sudoku_games
     WHERE game_id = ?`,
    gameId,
  );

  if (row === null) {
    return null;
  }

  return {
    gameId: row.game_id,
    puzzle: JSON.parse(row.puzzle_json) as SudokuPuzzle,
    state: normalizeSudokuState(JSON.parse(row.state_json) as Partial<SudokuState>),
    updatedAt: row.updated_at,
    localSeq: row.local_seq,
  };
}

export async function saveSudokuSnapshot(input: SaveSudokuSnapshotInput): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await runExclusiveWrite(db, async (tx) => {
    const existing = await tx.getFirstAsync<SudokuGameRow>(
      `SELECT game_id, puzzle_json, state_json, updated_at, local_seq
       FROM sudoku_games
       WHERE game_id = ?`,
      input.gameId,
    );
    const nextState =
      input.action === "create" && existing !== null
        ? mergeSudokuSnapshotState(
            normalizeSudokuState(JSON.parse(existing.state_json) as Partial<SudokuState>),
            input.state,
          )
        : input.state;

    await tx.runAsync(
      `INSERT INTO sudoku_games (
        game_id,
        puzzle_json,
        state_json,
        status,
        local_seq,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(game_id) DO UPDATE SET
        puzzle_json = excluded.puzzle_json,
        state_json = excluded.state_json,
        status = excluded.status,
        updated_at = excluded.updated_at`,
      input.gameId,
      JSON.stringify(input.puzzle),
      JSON.stringify(nextState),
      getGameStatus(nextState),
      now,
      now,
    );

    if (input.action === "reset") {
      await tx.runAsync("DELETE FROM sudoku_moves WHERE game_id = ?", input.gameId);
      await tx.runAsync("DELETE FROM sync_outbox WHERE game_id = ?", input.gameId);
    }
  });
}

export async function recordSudokuMove(input: RecordSudokuMoveInput): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await runExclusiveWrite(db, async (tx) => {
    const row = await tx.getFirstAsync<{ local_seq: number }>(
      "SELECT local_seq FROM sudoku_games WHERE game_id = ?",
      input.gameId,
    );
    const localSeq = (row?.local_seq ?? 0) + 1;
    const stateJson = JSON.stringify(input.nextState);
    const payload = {
      gameId: input.gameId,
      localSeq,
      action: input.action,
      move: input.move,
      accepted: input.accepted,
      correct: input.correct ?? null,
      reason: input.reason ?? null,
      state: input.nextState,
    };

    await tx.runAsync(
      `INSERT INTO sudoku_games (
        game_id,
        puzzle_json,
        state_json,
        status,
        local_seq,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(game_id) DO UPDATE SET
        puzzle_json = excluded.puzzle_json,
        state_json = excluded.state_json,
        status = excluded.status,
        local_seq = excluded.local_seq,
        updated_at = excluded.updated_at`,
      input.gameId,
      JSON.stringify(input.puzzle),
      stateJson,
      getGameStatus(input.nextState),
      localSeq,
      now,
      now,
    );

    await tx.runAsync(
      `INSERT INTO sudoku_moves (
        game_id,
        local_seq,
        action,
        row,
        col,
        value,
        mode,
        accepted,
        correct,
        reason,
        state_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.gameId,
      localSeq,
      input.action,
      input.move.row,
      input.move.col,
      input.move.value,
      input.move.mode,
      input.accepted ? 1 : 0,
      input.correct === undefined ? null : input.correct ? 1 : 0,
      input.reason ?? null,
      stateJson,
      now,
    );

    await tx.runAsync(
      `INSERT INTO sync_outbox (
        op_id,
        game_id,
        local_seq,
        type,
        payload_json,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      `${input.gameId}:${localSeq}`,
      input.gameId,
      localSeq,
      `sudoku.${input.action}`,
      JSON.stringify(payload),
      now,
      now,
    );
  });
}

export async function undoLastSudokuMove(
  input: UndoSudokuMoveInput,
): Promise<UndoSudokuMoveResult> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  let result: UndoSudokuMoveResult = {
    undone: false,
    state: input.initialState,
    localSeq: 0,
  };

  await runExclusiveWrite(db, async (tx) => {
    const lastMove = await tx.getFirstAsync<SudokuMoveStateRow>(
      `SELECT local_seq, state_json
       FROM sudoku_moves
       WHERE game_id = ?
       ORDER BY local_seq DESC
       LIMIT 1`,
      input.gameId,
    );

    if (lastMove === null) {
      result = {
        undone: false,
        state: input.initialState,
        localSeq: 0,
      };
      return;
    }

    const previousMove = await tx.getFirstAsync<SudokuMoveStateRow>(
      `SELECT local_seq, state_json
       FROM sudoku_moves
       WHERE game_id = ? AND local_seq < ?
       ORDER BY local_seq DESC
       LIMIT 1`,
      input.gameId,
      lastMove.local_seq,
    );
    const nextState =
      previousMove === null
        ? input.initialState
        : (JSON.parse(previousMove.state_json) as SudokuState);
    const nextSeq = previousMove?.local_seq ?? 0;
    const stateJson = JSON.stringify(nextState);

    await tx.runAsync(
      `DELETE FROM sudoku_moves
       WHERE game_id = ? AND local_seq >= ?`,
      input.gameId,
      lastMove.local_seq,
    );
    await tx.runAsync(
      `DELETE FROM sync_outbox
       WHERE game_id = ? AND local_seq >= ?`,
      input.gameId,
      lastMove.local_seq,
    );
    await tx.runAsync(
      `UPDATE sudoku_games
       SET state_json = ?,
           status = ?,
           local_seq = ?,
           updated_at = ?
       WHERE game_id = ?`,
      stateJson,
      getGameStatus(nextState),
      nextSeq,
      now,
      input.gameId,
    );

    result = {
      undone: true,
      state: nextState,
      localSeq: nextSeq,
    };
  });

  return result;
}

export async function loadSudokuSyncSummary(gameId: string): Promise<SudokuSyncSummary> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SyncSummaryRow>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
       COUNT(*) FILTER (WHERE status = 'conflict') AS conflict_count
     FROM sync_outbox
     WHERE game_id = ?`,
    gameId,
  );

  return {
    pendingCount: row?.pending_count ?? 0,
    conflictCount: row?.conflict_count ?? 0,
  };
}

// Dismiss conflict ops for a game: the active local device keeps its state
// (MVP rule), so acknowledging a conflict simply drops the rejected ops.
export async function acknowledgeSudokuConflicts(gameId: string): Promise<number> {
  const db = await getDatabase();
  let removed = 0;

  await runExclusiveWrite(db, async (tx) => {
    const result = await tx.runAsync(
      "DELETE FROM sync_outbox WHERE game_id = ? AND status = 'conflict'",
      gameId,
    );
    removed = result.changes;
  });

  return removed;
}

interface OutboxRow {
  op_id: string;
  game_id: string;
  local_seq: number;
  type: string;
  payload_json: string;
  created_at: string;
  attempts: number;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

// expo-sqlite-backed OutboxStore consumed by the sync client. Reads are direct;
// writes go through the shared exclusive write queue so they never interleave
// with gameplay persistence.
export class SqliteOutboxStore implements OutboxStore {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async listPending(limit: number): Promise<OutboxOp[]> {
    const rows = await this.db.getAllAsync<OutboxRow>(
      `SELECT op_id, game_id, local_seq, type, payload_json, created_at, attempts
       FROM sync_outbox
       WHERE status = 'pending' AND attempts < ?
       ORDER BY id ASC
       LIMIT ?`,
      maxOutboxAttempts,
      limit,
    );

    return rows.map((row) => ({
      opId: row.op_id,
      gameId: row.game_id,
      localSeq: row.local_seq,
      type: row.type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
      attempts: row.attempts,
    }));
  }

  async getBaseRev(gameId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ base_rev: number }>(
      "SELECT base_rev FROM sync_meta WHERE game_id = ?",
      gameId,
    );

    return row?.base_rev ?? 0;
  }

  async markApplied(opIds: string[], revByGame: Record<string, number>): Promise<void> {
    if (opIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();

    await runExclusiveWrite(this.db, async (tx) => {
      await tx.runAsync(
        `DELETE FROM sync_outbox WHERE op_id IN (${placeholders(opIds.length)})`,
        ...opIds,
      );

      for (const [gameId, rev] of Object.entries(revByGame)) {
        await tx.runAsync(
          `INSERT INTO sync_meta (game_id, base_rev, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(game_id) DO UPDATE SET
             base_rev = MAX(base_rev, excluded.base_rev),
             updated_at = excluded.updated_at`,
          gameId,
          rev,
          now,
        );
      }
    });
  }

  async recordAttempt(opIds: string[]): Promise<void> {
    if (opIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();

    await runExclusiveWrite(this.db, async (tx) => {
      await tx.runAsync(
        `UPDATE sync_outbox
         SET attempts = attempts + 1, updated_at = ?
         WHERE op_id IN (${placeholders(opIds.length)})`,
        now,
        ...opIds,
      );
    });
  }

  async markConflict(opIds: string[]): Promise<void> {
    if (opIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();

    await runExclusiveWrite(this.db, async (tx) => {
      await tx.runAsync(
        `UPDATE sync_outbox
         SET status = 'conflict', updated_at = ?
         WHERE op_id IN (${placeholders(opIds.length)})`,
        now,
        ...opIds,
      );
    });
  }
}

export async function createSqliteOutboxStore(): Promise<SqliteOutboxStore> {
  return new SqliteOutboxStore(await getDatabase());
}

// Stable per-install device id, persisted in the `devices` table. Generated from
// a timestamp plus randomness (no WebCrypto dependency); once stored it never
// changes, so collisions are not a concern.
export async function getOrCreateDeviceId(): Promise<string> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ device_id: string }>(
    "SELECT device_id FROM devices LIMIT 1",
  );

  if (existing) {
    return existing.device_id;
  }

  const now = new Date().toISOString();
  const deviceId = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  await runExclusiveWrite(db, async (tx) => {
    await tx.runAsync(
      "INSERT OR IGNORE INTO devices (device_id, created_at) VALUES (?, ?)",
      deviceId,
      now,
    );
  });

  const stored = await db.getFirstAsync<{ device_id: string }>(
    "SELECT device_id FROM devices LIMIT 1",
  );

  return stored?.device_id ?? deviceId;
}

function getGameStatus(state: SudokuState): "active" | "paused" | "completed" {
  return state.status;
}

function mergeSudokuSnapshotState(current: SudokuState, incoming: SudokuState): SudokuState {
  const status = current.status === "completed" ? "completed" : incoming.status;
  const merged: SudokuState = {
    ...current,
    status,
    elapsedSeconds: Math.max(current.elapsedSeconds, incoming.elapsedSeconds),
    startedAt: current.startedAt,
  };

  if (status === "paused" && incoming.pausedAt !== undefined) {
    merged.pausedAt = incoming.pausedAt;
  } else {
    delete merged.pausedAt;
  }

  if (status === "completed") {
    merged.completedAt = current.completedAt ?? incoming.completedAt ?? new Date().toISOString();
  } else {
    delete merged.completedAt;
  }

  return merged;
}

function normalizeSudokuState(state: Partial<SudokuState>): SudokuState {
  return {
    grid: state.grid ?? [],
    notes: normalizeNotesGrid(state.notes),
    status: state.status ?? (state.completedAt === undefined ? "active" : "completed"),
    mistakes: state.mistakes ?? 0,
    hintsUsed: state.hintsUsed ?? 0,
    elapsedSeconds: state.elapsedSeconds ?? 0,
    startedAt: state.startedAt ?? new Date().toISOString(),
    ...(state.pausedAt === undefined ? {} : { pausedAt: state.pausedAt }),
    ...(state.completedAt === undefined ? {} : { completedAt: state.completedAt }),
  };
}

function normalizeNotesGrid(notes: Partial<SudokuDigit[][][]> | undefined): SudokuDigit[][][] {
  const normalized = createNotesGrid();

  if (!Array.isArray(notes)) {
    return normalized;
  }

  for (let row = 0; row < normalized.length; row += 1) {
    const noteRow = notes[row];

    if (!Array.isArray(noteRow)) {
      continue;
    }

    for (let col = 0; col < (normalized[row]?.length ?? 0); col += 1) {
      const noteCell = noteRow[col];

      if (!Array.isArray(noteCell)) {
        continue;
      }

      normalized[row]![col] = noteCell
        .filter((note): note is SudokuDigit => sudokuDigits.includes(note as SudokuDigit))
        .filter((note, index, list) => list.indexOf(note) === index)
        .sort((left, right) => left - right);
    }
  }

  return normalized;
}
