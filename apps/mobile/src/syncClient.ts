import type { SyncOpType } from "@puzzlehub/validation";

// Mobile sync client. All logic operates on injected interfaces (an OutboxStore
// and a SyncTransport) so it is unit-testable without expo-sqlite, react-native,
// or a live server. The native adapters live in sudokuSync.ts.

export interface OutboxOp {
  opId: string;
  gameId: string;
  localSeq: number;
  // Mobile op type, e.g. "sudoku.answer" / "sudoku.reset".
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
}

export interface OutboxStore {
  listPending(limit: number): Promise<OutboxOp[]>;
  // Last server revision the client has acknowledged for a game (0 if none).
  getBaseRev(gameId: string): Promise<number>;
  // Mark ops accepted by the server and advance each game's base revision.
  markApplied(opIds: string[], revByGame: Record<string, number>): Promise<void>;
  // Bump the attempt counter after a retryable failure (for backoff/observability).
  recordAttempt(opIds: string[]): Promise<void>;
  // Flag ops the server rejected as conflicts so the UI can surface them.
  markConflict(opIds: string[]): Promise<void>;
}

export interface SyncOpWire {
  opId: string;
  deviceId: string;
  localSeq: number;
  baseRev: number;
  gameId: string;
  type: SyncOpType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SyncResultEntry {
  opId: string;
  gameId: string;
  status: "applied" | "duplicate" | "conflict";
  rev: number;
  serverSeq: number | null;
}

export interface SyncPushResponse {
  cursor: number;
  results: SyncResultEntry[];
}

export interface SyncTransport {
  push(body: {
    deviceId: string;
    ops: SyncOpWire[];
  }): Promise<{ ok: boolean; status: number; body: SyncPushResponse | null }>;
}

export interface FlushResult {
  attempted: number;
  applied: number;
  duplicate: number;
  conflict: number;
  failed: boolean;
  retryable: boolean;
  cursor: number | null;
}

const emptyFlush: FlushResult = {
  attempted: 0,
  applied: 0,
  duplicate: 0,
  conflict: 0,
  failed: false,
  retryable: false,
  cursor: null,
};

// Map a mobile outbox op type onto the server's op-type enum. Snapshot resets
// map to "reset"; everything else is a "move" carrying its state payload.
export function toServerOpType(mobileType: string): SyncOpType {
  const action = mobileType.startsWith("sudoku.") ? mobileType.slice("sudoku.".length) : mobileType;

  if (action === "reset" || action === "create") {
    return "reset";
  }

  if (action === "complete") {
    return "complete";
  }

  return "move";
}

// Push pending outbox ops to the server in one batch. Idempotent by op id on the
// server, so a partial-failure retry is always safe. Retryable failures (network
// error, 429, 5xx) leave ops pending and bump their attempt count; a 4xx is
// treated as non-retryable so a poison op cannot loop forever.
export async function flushSyncOutbox(
  store: OutboxStore,
  transport: SyncTransport,
  options: { deviceId: string; batchSize?: number },
): Promise<FlushResult> {
  const pending = await store.listPending(options.batchSize ?? 100);

  if (pending.length === 0) {
    return emptyFlush;
  }

  // Assign each op a base revision: a game's stored revision plus its index
  // within this batch, so sequential ops apply in order on the server.
  const baseRevByGame = new Map<string, number>();
  const offsetByGame = new Map<string, number>();
  const ops: SyncOpWire[] = [];

  for (const op of pending) {
    let base = baseRevByGame.get(op.gameId);

    if (base === undefined) {
      base = await store.getBaseRev(op.gameId);
      baseRevByGame.set(op.gameId, base);
    }

    const offset = offsetByGame.get(op.gameId) ?? 0;

    ops.push({
      opId: op.opId,
      deviceId: options.deviceId,
      localSeq: op.localSeq,
      baseRev: base + offset,
      gameId: op.gameId,
      type: toServerOpType(op.type),
      payload: op.payload,
      createdAt: op.createdAt,
    });
    offsetByGame.set(op.gameId, offset + 1);
  }

  const opIds = pending.map((op) => op.opId);
  let response: { ok: boolean; status: number; body: SyncPushResponse | null };

  try {
    response = await transport.push({ deviceId: options.deviceId, ops });
  } catch {
    await store.recordAttempt(opIds);
    return { ...emptyFlush, attempted: pending.length, failed: true, retryable: true };
  }

  if (!response.ok || response.body === null) {
    await store.recordAttempt(opIds);
    const retryable = response.status === 429 || response.status >= 500;
    return { ...emptyFlush, attempted: pending.length, failed: true, retryable };
  }

  const results = response.body.results;
  const accepted = results.filter((r) => r.status === "applied" || r.status === "duplicate");
  const conflicts = results.filter((r) => r.status === "conflict");

  const revByGame: Record<string, number> = {};
  for (const result of accepted) {
    revByGame[result.gameId] = Math.max(revByGame[result.gameId] ?? 0, result.rev);
  }

  if (accepted.length > 0) {
    await store.markApplied(
      accepted.map((r) => r.opId),
      revByGame,
    );
  }

  if (conflicts.length > 0) {
    await store.markConflict(conflicts.map((r) => r.opId));
  }

  return {
    attempted: pending.length,
    applied: results.filter((r) => r.status === "applied").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    conflict: conflicts.length,
    failed: false,
    retryable: false,
    cursor: response.body.cursor,
  };
}

export interface SyncScheduler {
  flushNow(): Promise<void>;
  stop(): void;
}

export interface SyncSchedulerOptions {
  flush: () => Promise<FlushResult>;
  // Subscribe to flush triggers (app foreground + network restoration). Returns
  // an unsubscribe function.
  onTrigger: (callback: () => void) => () => void;
  // Schedule a delayed retry; returns a cancel function.
  schedule: (callback: () => void, delayMs: number) => () => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

// Drives flushes from triggers with exponential backoff on retryable failures.
// A single flush runs at a time; success resets the backoff.
export function createSyncScheduler(options: SyncSchedulerOptions): SyncScheduler {
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;

  let failures = 0;
  let running = false;
  let cancelRetry: (() => void) | null = null;

  function clearPendingRetry(): void {
    if (cancelRetry) {
      cancelRetry();
      cancelRetry = null;
    }
  }

  function scheduleRetry(): void {
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (failures - 1));
    cancelRetry = options.schedule(() => {
      cancelRetry = null;
      void run();
    }, delay);
  }

  async function run(): Promise<void> {
    if (running) {
      return;
    }

    clearPendingRetry();
    running = true;

    try {
      const result = await options.flush();

      if (result.failed && result.retryable) {
        failures += 1;
        scheduleRetry();
      } else {
        failures = 0;
      }
    } catch {
      failures += 1;
      scheduleRetry();
    } finally {
      running = false;
    }
  }

  const unsubscribe = options.onTrigger(() => {
    void run();
  });

  return {
    flushNow: run,
    stop: () => {
      unsubscribe();
      clearPendingRetry();
    },
  };
}

// Fetch-based transport pointing at the worker's POST /v1/sync.
export function createFetchSyncTransport(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): SyncTransport {
  return {
    async push(body) {
      const response = await fetchImpl(`${baseUrl}/v1/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let parsed: SyncPushResponse | null = null;

      try {
        parsed = (await response.json()) as SyncPushResponse;
      } catch {
        parsed = null;
      }

      return { ok: response.ok, status: response.status, body: parsed };
    },
  };
}
