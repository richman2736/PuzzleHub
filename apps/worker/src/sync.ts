import type { SyncOpInput, SyncOpType } from "@puzzlehub/validation";

// Server-side sync engine. All correctness lives here against the SyncStore
// interface, so it is exhaustively unit-testable with the in-memory store; the
// D1-backed store is a thin CRUD adapter used in production.

export type SyncOpStatus = "applied" | "duplicate" | "conflict";

export interface StoredSyncOp {
  serverSeq: number;
  opId: string;
  deviceId: string;
  gameId: string;
  type: SyncOpType;
  localSeq: number;
  baseRev: number;
  appliedRev: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface GameSyncState {
  gameId: string;
  rev: number;
  ownerDeviceId: string;
}

export interface SyncOpResult {
  opId: string;
  gameId: string;
  status: SyncOpStatus;
  rev: number;
  serverSeq: number | null;
}

export interface SyncStore {
  getOpByOpId(opId: string): Promise<StoredSyncOp | null>;
  getGameState(gameId: string): Promise<GameSyncState | null>;
  // Atomically append an applied op (assigning the next monotonic serverSeq)
  // and upsert the game's revision/owner. Returns the assigned serverSeq.
  appendAppliedOp(op: SyncOpInput, appliedRev: number, ownerDeviceId: string): Promise<number>;
  // Ops for a device with serverSeq > since, ascending, capped at limit.
  listOpsSince(deviceId: string, since: number, limit: number): Promise<StoredSyncOp[]>;
}

export interface SyncBatchResult {
  results: SyncOpResult[];
  cursor: number;
}

// Apply a batch of ops idempotently with revision checks. MVP conflict rule:
// the active local device (the game's owner) always wins; a different device
// pushing against a stale revision gets an explicit conflict so the client can
// surface a manual choice on account recovery.
export async function applySyncBatch(
  store: SyncStore,
  ops: SyncOpInput[],
): Promise<SyncBatchResult> {
  const results: SyncOpResult[] = [];
  let cursor = 0;

  for (const op of ops) {
    const existing = await store.getOpByOpId(op.opId);

    if (existing) {
      // Idempotent replay: return the original outcome, change nothing.
      results.push({
        opId: op.opId,
        gameId: existing.gameId,
        status: "duplicate",
        rev: existing.appliedRev,
        serverSeq: existing.serverSeq,
      });
      cursor = Math.max(cursor, existing.serverSeq);
      continue;
    }

    const state = await store.getGameState(op.gameId);

    if (state === null) {
      // First op for this game establishes ownership.
      const serverSeq = await store.appendAppliedOp(op, 1, op.deviceId);
      results.push({ opId: op.opId, gameId: op.gameId, status: "applied", rev: 1, serverSeq });
      cursor = Math.max(cursor, serverSeq);
      continue;
    }

    const inSync = op.baseRev === state.rev;
    const isOwner = op.deviceId === state.ownerDeviceId;

    if (inSync || isOwner) {
      // In-sync ops apply; a stale-but-owner op still wins (active device wins).
      const appliedRev = state.rev + 1;
      const serverSeq = await store.appendAppliedOp(op, appliedRev, state.ownerDeviceId);
      results.push({
        opId: op.opId,
        gameId: op.gameId,
        status: "applied",
        rev: appliedRev,
        serverSeq,
      });
      cursor = Math.max(cursor, serverSeq);
      continue;
    }

    // Different device against a stale revision: conflict, not applied.
    results.push({
      opId: op.opId,
      gameId: op.gameId,
      status: "conflict",
      rev: state.rev,
      serverSeq: null,
    });
  }

  return { results, cursor };
}

export interface SyncPullResult {
  ops: StoredSyncOp[];
  cursor: number;
  hasMore: boolean;
}

export async function listOpsSince(
  store: SyncStore,
  deviceId: string,
  since: number,
  limit: number,
): Promise<SyncPullResult> {
  const ops = await store.listOpsSince(deviceId, since, limit);
  const cursor = ops.length > 0 ? ops[ops.length - 1]!.serverSeq : since;

  return { ops, cursor, hasMore: ops.length === limit };
}

// Reference store used by tests and as the semantics specification for the D1
// adapter. Append assigns serverSeq from a monotonic counter (no Date/random).
export class InMemorySyncStore implements SyncStore {
  private readonly opsByOpId = new Map<string, StoredSyncOp>();
  private readonly ops: StoredSyncOp[] = [];
  private readonly games = new Map<string, GameSyncState>();
  private seq = 0;

  getOpByOpId(opId: string): Promise<StoredSyncOp | null> {
    return Promise.resolve(this.opsByOpId.get(opId) ?? null);
  }

  getGameState(gameId: string): Promise<GameSyncState | null> {
    return Promise.resolve(this.games.get(gameId) ?? null);
  }

  appendAppliedOp(op: SyncOpInput, appliedRev: number, ownerDeviceId: string): Promise<number> {
    this.seq += 1;
    const stored: StoredSyncOp = {
      serverSeq: this.seq,
      opId: op.opId,
      deviceId: op.deviceId,
      gameId: op.gameId,
      type: op.type,
      localSeq: op.localSeq,
      baseRev: op.baseRev,
      appliedRev,
      payload: op.payload,
      createdAt: op.createdAt,
    };

    this.opsByOpId.set(op.opId, stored);
    this.ops.push(stored);
    this.games.set(op.gameId, { gameId: op.gameId, rev: appliedRev, ownerDeviceId });

    return Promise.resolve(this.seq);
  }

  listOpsSince(deviceId: string, since: number, limit: number): Promise<StoredSyncOp[]> {
    const matching = this.ops
      .filter((stored) => stored.serverSeq > since && stored.deviceId === deviceId)
      .slice(0, limit);

    return Promise.resolve(matching);
  }
}

interface SyncOpRow {
  server_seq: number;
  op_id: string;
  device_id: string;
  game_id: string;
  type: string;
  local_seq: number;
  base_rev: number;
  applied_rev: number;
  payload: string;
  created_at: string;
}

function rowToStoredOp(row: SyncOpRow): StoredSyncOp {
  return {
    serverSeq: row.server_seq,
    opId: row.op_id,
    deviceId: row.device_id,
    gameId: row.game_id,
    type: row.type as SyncOpType,
    localSeq: row.local_seq,
    baseRev: row.base_rev,
    appliedRev: row.applied_rev,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

// D1-backed store. server_seq is an AUTOINCREMENT primary key, so it is a
// monotonic cursor; op_id is UNIQUE for idempotency.
export class D1SyncStore implements SyncStore {
  constructor(private readonly db: D1Database) {}

  async getOpByOpId(opId: string): Promise<StoredSyncOp | null> {
    const row = await this.db
      .prepare(
        "SELECT server_seq, op_id, device_id, game_id, type, local_seq, base_rev, applied_rev, payload, created_at FROM sync_ops WHERE op_id = ?",
      )
      .bind(opId)
      .first<SyncOpRow>();

    return row ? rowToStoredOp(row) : null;
  }

  async getGameState(gameId: string): Promise<GameSyncState | null> {
    const row = await this.db
      .prepare("SELECT rev, owner_device_id FROM game_sync_state WHERE game_id = ?")
      .bind(gameId)
      .first<{ rev: number; owner_device_id: string }>();

    return row ? { gameId, rev: row.rev, ownerDeviceId: row.owner_device_id } : null;
  }

  async appendAppliedOp(
    op: SyncOpInput,
    appliedRev: number,
    ownerDeviceId: string,
  ): Promise<number> {
    const batchResults = await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO sync_ops (op_id, device_id, game_id, type, local_seq, base_rev, applied_rev, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          op.opId,
          op.deviceId,
          op.gameId,
          op.type,
          op.localSeq,
          op.baseRev,
          appliedRev,
          JSON.stringify(op.payload),
          op.createdAt,
        ),
      this.db
        .prepare(
          "INSERT INTO game_sync_state (game_id, rev, owner_device_id, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(game_id) DO UPDATE SET rev = excluded.rev, owner_device_id = excluded.owner_device_id, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(op.gameId, appliedRev, ownerDeviceId),
    ]);

    const lastRowId = batchResults[0]?.meta.last_row_id;

    if (lastRowId === undefined || lastRowId === null) {
      throw new Error("sync_ops insert did not return a server_seq");
    }

    return Number(lastRowId);
  }

  async listOpsSince(deviceId: string, since: number, limit: number): Promise<StoredSyncOp[]> {
    const { results } = await this.db
      .prepare(
        "SELECT server_seq, op_id, device_id, game_id, type, local_seq, base_rev, applied_rev, payload, created_at FROM sync_ops WHERE device_id = ? AND server_seq > ? ORDER BY server_seq ASC LIMIT ?",
      )
      .bind(deviceId, since, limit)
      .all<SyncOpRow>();

    return results.map(rowToStoredOp);
  }
}
