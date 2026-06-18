import { difficulties, gameTypes } from "@puzzlehub/game-core";
import { z } from "zod";

export const gameTypeSchema = z.enum(gameTypes);
export const difficultySchema = z.enum(difficulties);

// All request schemas are strict objects so unknown fields are rejected rather
// than silently accepted (OWASP API8: mass assignment / unexpected input).
// Clients must send exactly the documented shape.
export const sudokuMoveSchema = z.strictObject({
  row: z.number().int().min(0).max(8),
  col: z.number().int().min(0).max(8),
  value: z.number().int().min(1).max(9).nullable(),
  mode: z.enum(["answer", "note"]).default("answer"),
});

export const dailyChallengeQuerySchema = z.strictObject({
  date: z.iso.date().optional(),
  gameType: gameTypeSchema.default("sudoku"),
  difficulty: difficultySchema.default("medium"),
});

export const startGameSchema = z.strictObject({
  gameType: gameTypeSchema,
  difficulty: difficultySchema.default("medium"),
  puzzleId: z.string().min(1).optional(),
});

export const recordMoveSchema = z.strictObject({
  progressId: z.string().min(1),
  gameType: gameTypeSchema,
  // Non-Sudoku games are rejected with 501 before the move shape matters, so the
  // envelope stays permissive here; confirmed Sudoku moves are re-validated
  // strictly against `sudokuMoveSchema`.
  move: z.union([sudokuMoveSchema, z.record(z.string(), z.unknown())]),
});

export const completeGameSchema = z.strictObject({
  progressId: z.string().min(1),
  gameType: gameTypeSchema,
  difficulty: difficultySchema,
  elapsedSeconds: z.number().int().nonnegative(),
  mistakes: z.number().int().nonnegative().default(0),
  hintsUsed: z.number().int().nonnegative().default(0),
  // Attribution for the completion event log; anonymous when absent.
  deviceId: z.string().min(1).max(200).optional(),
  // Whether this completion was the published daily challenge (for achievements).
  isDaily: z.boolean().default(false),
  // Accepted but never trusted; the server recomputes the score authoritatively.
  score: z.number().int().nonnegative().optional(),
});

// --- Sync ---------------------------------------------------------------
// Op types the sync log accepts. Payloads are opaque to the server (it stores
// and relays them); the server only reasons about revisions and idempotency.
export const syncOpTypes = ["move", "complete", "reset"] as const;
export const syncOpTypeSchema = z.enum(syncOpTypes);

export const syncOpSchema = z.strictObject({
  // Client-generated, globally unique: the idempotency key.
  opId: z.string().min(1).max(200),
  deviceId: z.string().min(1).max(200),
  // Per-device monotonic counter, for client-side ordering/debugging.
  localSeq: z.number().int().nonnegative(),
  // Revision the client believed the game was at when it created this op.
  baseRev: z.number().int().nonnegative(),
  gameId: z.string().min(1).max(200),
  type: syncOpTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const syncPushSchema = z.strictObject({
  deviceId: z.string().min(1).max(200),
  ops: z.array(syncOpSchema).min(1).max(200),
});

export const syncPullQuerySchema = z.strictObject({
  deviceId: z.string().min(1).max(200),
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// --- Admin: daily publishing -------------------------------------------
export const adminPublishDailySchema = z.strictObject({
  // Defaults to "today" (filled by the route) when omitted.
  startDate: z.iso.date().optional(),
  days: z.number().int().min(1).max(60).default(7),
  difficulties: z.array(difficultySchema).min(1).max(5).optional(),
  // Re-generate and overwrite already-published records (audited as overrides).
  regenerate: z.boolean().default(false),
});

export const adminDailyStatusQuerySchema = z.strictObject({
  startDate: z.iso.date().optional(),
  days: z.coerce.number().int().min(1).max(60).default(7),
});

export type AdminPublishDailyInput = z.infer<typeof adminPublishDailySchema>;
export type AdminDailyStatusQuery = z.infer<typeof adminDailyStatusQuerySchema>;

// --- Leaderboard --------------------------------------------------------
export const leaderboardQuerySchema = z.strictObject({
  gameType: gameTypeSchema.default("sudoku"),
  difficulty: difficultySchema.default("medium"),
  // "all-time" or a specific YYYY-MM-DD daily board.
  period: z.union([z.literal("all-time"), z.iso.date()]).default("all-time"),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export type DailyChallengeQuery = z.infer<typeof dailyChallengeQuerySchema>;
export type StartGameInput = z.infer<typeof startGameSchema>;
export type RecordMoveInput = z.infer<typeof recordMoveSchema>;
export type CompleteGameInput = z.infer<typeof completeGameSchema>;
export type SudokuMoveInput = z.infer<typeof sudokuMoveSchema>;
export type SyncOpType = z.infer<typeof syncOpTypeSchema>;
export type SyncOpInput = z.infer<typeof syncOpSchema>;
export type SyncPushInput = z.infer<typeof syncPushSchema>;
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;
