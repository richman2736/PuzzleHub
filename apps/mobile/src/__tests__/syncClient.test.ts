import { describe, expect, it, vi } from "vitest";

import {
  createSyncScheduler,
  flushSyncOutbox,
  toServerOpType,
  type FlushResult,
  type OutboxOp,
  type OutboxStore,
  type SyncPushResponse,
  type SyncTransport,
} from "../syncClient";

function makeOp(overrides: Partial<OutboxOp> & Pick<OutboxOp, "opId">): OutboxOp {
  return {
    opId: overrides.opId,
    gameId: overrides.gameId ?? "game-1",
    localSeq: overrides.localSeq ?? 1,
    type: overrides.type ?? "sudoku.answer",
    payload: overrides.payload ?? { row: 0, col: 0, value: 5 },
    createdAt: overrides.createdAt ?? "2026-06-17T00:00:00.000Z",
    attempts: overrides.attempts ?? 0,
  };
}

class FakeOutboxStore implements OutboxStore {
  pending: OutboxOp[] = [];
  baseRev = new Map<string, number>();
  applied: { opIds: string[]; revByGame: Record<string, number> }[] = [];
  attempts: string[][] = [];
  conflicts: string[][] = [];

  listPending(limit: number): Promise<OutboxOp[]> {
    return Promise.resolve(this.pending.slice(0, limit));
  }
  getBaseRev(gameId: string): Promise<number> {
    return Promise.resolve(this.baseRev.get(gameId) ?? 0);
  }
  markApplied(opIds: string[], revByGame: Record<string, number>): Promise<void> {
    this.applied.push({ opIds, revByGame });
    return Promise.resolve();
  }
  recordAttempt(opIds: string[]): Promise<void> {
    this.attempts.push(opIds);
    return Promise.resolve();
  }
  markConflict(opIds: string[]): Promise<void> {
    this.conflicts.push(opIds);
    return Promise.resolve();
  }
}

function transportReturning(
  response: { ok: boolean; status: number; body: SyncPushResponse | null },
  capture?: (body: { deviceId: string; ops: unknown[] }) => void,
): SyncTransport {
  return {
    push(body) {
      capture?.(body);
      return Promise.resolve(response);
    },
  };
}

describe("toServerOpType", () => {
  it("maps mobile actions onto the server op-type enum", () => {
    expect(toServerOpType("sudoku.answer")).toBe("move");
    expect(toServerOpType("sudoku.erase")).toBe("move");
    expect(toServerOpType("sudoku.note")).toBe("move");
    expect(toServerOpType("sudoku.hint")).toBe("move");
    expect(toServerOpType("sudoku.reset")).toBe("reset");
    expect(toServerOpType("sudoku.create")).toBe("reset");
    expect(toServerOpType("sudoku.complete")).toBe("complete");
  });
});

describe("flushSyncOutbox", () => {
  it("no-ops when the outbox is empty", async () => {
    const store = new FakeOutboxStore();
    const result = await flushSyncOutbox(
      store,
      transportReturning({ ok: true, status: 200, body: null }),
      {
        deviceId: "device-a",
      },
    );

    expect(result.attempted).toBe(0);
    expect(result.failed).toBe(false);
  });

  it("assigns per-game base revisions with an in-batch offset", async () => {
    const store = new FakeOutboxStore();
    store.baseRev.set("game-1", 3);
    store.pending = [
      makeOp({ opId: "o1", gameId: "game-1", localSeq: 4 }),
      makeOp({ opId: "o2", gameId: "game-1", localSeq: 5 }),
      makeOp({ opId: "o3", gameId: "game-2", localSeq: 1 }),
    ];

    let sent: { deviceId: string; ops: Array<{ gameId: string; baseRev: number }> } | null = null;
    const transport = transportReturning(
      {
        ok: true,
        status: 200,
        body: {
          cursor: 3,
          results: [
            { opId: "o1", gameId: "game-1", status: "applied", rev: 4, serverSeq: 1 },
            { opId: "o2", gameId: "game-1", status: "applied", rev: 5, serverSeq: 2 },
            { opId: "o3", gameId: "game-2", status: "applied", rev: 1, serverSeq: 3 },
          ],
        },
      },
      (body) => {
        sent = body as typeof sent;
      },
    );

    const result = await flushSyncOutbox(store, transport, { deviceId: "device-a" });

    expect(sent!.ops.map((o) => o.baseRev)).toEqual([3, 4, 0]);
    expect(result.applied).toBe(3);
    expect(store.applied[0]?.revByGame).toEqual({ "game-1": 5, "game-2": 1 });
  });

  it("marks duplicates as accepted and advances the revision (idempotent replay)", async () => {
    const store = new FakeOutboxStore();
    store.pending = [makeOp({ opId: "o1" })];

    const result = await flushSyncOutbox(
      store,
      transportReturning({
        ok: true,
        status: 200,
        body: {
          cursor: 1,
          results: [{ opId: "o1", gameId: "game-1", status: "duplicate", rev: 1, serverSeq: 1 }],
        },
      }),
      { deviceId: "device-a" },
    );

    expect(result.duplicate).toBe(1);
    expect(store.applied[0]?.opIds).toEqual(["o1"]);
    expect(store.applied[0]?.revByGame).toEqual({ "game-1": 1 });
  });

  it("flags conflicts without marking them applied", async () => {
    const store = new FakeOutboxStore();
    store.pending = [makeOp({ opId: "o1" })];

    const result = await flushSyncOutbox(
      store,
      transportReturning({
        ok: true,
        status: 200,
        body: {
          cursor: 0,
          results: [{ opId: "o1", gameId: "game-1", status: "conflict", rev: 2, serverSeq: null }],
        },
      }),
      { deviceId: "device-a" },
    );

    expect(result.conflict).toBe(1);
    expect(store.conflicts[0]).toEqual(["o1"]);
    expect(store.applied).toHaveLength(0);
  });

  it("treats a network error as a retryable failure and bumps attempts", async () => {
    const store = new FakeOutboxStore();
    store.pending = [makeOp({ opId: "o1" })];
    const transport: SyncTransport = {
      push: () => Promise.reject(new Error("offline")),
    };

    const result = await flushSyncOutbox(store, transport, { deviceId: "device-a" });

    expect(result.failed).toBe(true);
    expect(result.retryable).toBe(true);
    expect(store.attempts[0]).toEqual(["o1"]);
  });

  it("treats 4xx as non-retryable and 429/5xx as retryable", async () => {
    const store = new FakeOutboxStore();
    store.pending = [makeOp({ opId: "o1" })];

    const badRequest = await flushSyncOutbox(
      store,
      transportReturning({ ok: false, status: 400, body: null }),
      { deviceId: "device-a" },
    );
    expect(badRequest.retryable).toBe(false);

    const rateLimited = await flushSyncOutbox(
      store,
      transportReturning({ ok: false, status: 429, body: null }),
      { deviceId: "device-a" },
    );
    expect(rateLimited.retryable).toBe(true);

    const serverError = await flushSyncOutbox(
      store,
      transportReturning({ ok: false, status: 503, body: null }),
      { deviceId: "device-a" },
    );
    expect(serverError.retryable).toBe(true);
  });
});

describe("createSyncScheduler", () => {
  function harness(flush: () => Promise<FlushResult>) {
    let trigger: (() => void) | null = null;
    const scheduled: { callback: () => void; delayMs: number }[] = [];

    const scheduler = createSyncScheduler({
      flush,
      onTrigger: (callback) => {
        trigger = callback;
        return () => {
          trigger = null;
        };
      },
      schedule: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return () => {};
      },
      baseDelayMs: 1000,
      maxDelayMs: 10_000,
    });

    return { scheduler, fire: () => trigger?.(), scheduled };
  }

  const ok: FlushResult = {
    attempted: 1,
    applied: 1,
    duplicate: 0,
    conflict: 0,
    failed: false,
    retryable: false,
    cursor: 1,
  };
  const retryable: FlushResult = { ...ok, applied: 0, failed: true, retryable: true };

  it("flushes when a trigger fires", async () => {
    const flush = vi.fn(() => Promise.resolve(ok));
    const { fire } = harness(flush);

    fire();
    await Promise.resolve();

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("schedules exponential backoff on retryable failures and resets on success", async () => {
    const flush = vi.fn(() => Promise.resolve(retryable));
    const { scheduler, scheduled } = harness(flush);

    await scheduler.flushNow();
    expect(scheduled[0]?.delayMs).toBe(1000); // 1000 * 2^0

    await scheduler.flushNow();
    expect(scheduled[1]?.delayMs).toBe(2000); // 1000 * 2^1

    await scheduler.flushNow();
    expect(scheduled[2]?.delayMs).toBe(4000); // 1000 * 2^2

    // A success resets the backoff; the next failure starts at the base delay again.
    flush.mockReturnValueOnce(Promise.resolve(ok));
    await scheduler.flushNow();
    await scheduler.flushNow();
    expect(scheduled[3]?.delayMs).toBe(1000);
  });

  it("caps the backoff at maxDelayMs", async () => {
    const flush = vi.fn(() => Promise.resolve(retryable));
    const { scheduler, scheduled } = harness(flush);

    for (let i = 0; i < 8; i += 1) {
      await scheduler.flushNow();
    }

    expect(scheduled[scheduled.length - 1]?.delayMs).toBe(10_000);
  });

  it("does not schedule a retry after a successful flush", async () => {
    const flush = vi.fn(() => Promise.resolve(ok));
    const { scheduler, scheduled } = harness(flush);

    await scheduler.flushNow();

    expect(scheduled).toHaveLength(0);
  });
});
