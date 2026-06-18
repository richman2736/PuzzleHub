import { describe, expect, it } from "vitest";
import type { SyncOpInput } from "@puzzlehub/validation";

import { applySyncBatch, InMemorySyncStore, listOpsSince } from "./sync";

function op(overrides: Partial<SyncOpInput> & Pick<SyncOpInput, "opId">): SyncOpInput {
  return {
    opId: overrides.opId,
    deviceId: overrides.deviceId ?? "device-a",
    localSeq: overrides.localSeq ?? 0,
    baseRev: overrides.baseRev ?? 0,
    gameId: overrides.gameId ?? "game-1",
    type: overrides.type ?? "move",
    payload: overrides.payload ?? { row: 0, col: 0, value: 5 },
    createdAt: overrides.createdAt ?? "2026-06-17T00:00:00.000Z",
  };
}

describe("applySyncBatch", () => {
  it("applies sequential ops from one device and advances the revision", async () => {
    const store = new InMemorySyncStore();

    const { results, cursor } = await applySyncBatch(store, [
      op({ opId: "o1", baseRev: 0, localSeq: 1 }),
      op({ opId: "o2", baseRev: 1, localSeq: 2 }),
      op({ opId: "o3", baseRev: 2, localSeq: 3 }),
    ]);

    expect(results.map((r) => r.status)).toEqual(["applied", "applied", "applied"]);
    expect(results.map((r) => r.rev)).toEqual([1, 2, 3]);
    expect(cursor).toBe(3);
  });

  it("is idempotent: re-sending the same op does not duplicate state", async () => {
    const store = new InMemorySyncStore();
    const ops = [op({ opId: "o1", baseRev: 0 })];

    const first = await applySyncBatch(store, ops);
    const second = await applySyncBatch(store, ops);

    expect(first.results[0]?.status).toBe("applied");
    expect(second.results[0]?.status).toBe("duplicate");
    expect(second.results[0]?.serverSeq).toBe(first.results[0]?.serverSeq);
    expect(second.results[0]?.rev).toBe(1);

    // Only one op persisted; revision did not advance on replay.
    const state = await store.getGameState("game-1");
    expect(state?.rev).toBe(1);
  });

  it("detects a conflict when a second device pushes against a stale revision", async () => {
    const store = new InMemorySyncStore();

    await applySyncBatch(store, [op({ opId: "a1", deviceId: "device-a", baseRev: 0 })]);
    const { results } = await applySyncBatch(store, [
      op({ opId: "b1", deviceId: "device-b", baseRev: 0 }),
    ]);

    expect(results[0]?.status).toBe("conflict");
    expect(results[0]?.serverSeq).toBeNull();
    expect(results[0]?.rev).toBe(1);

    // Owner is unchanged and no op was appended for device-b.
    const replayB = await store.getOpByOpId("b1");
    expect(replayB).toBeNull();
  });

  it("lets the owning device win even with a stale base revision", async () => {
    const store = new InMemorySyncStore();

    await applySyncBatch(store, [op({ opId: "a1", deviceId: "device-a", baseRev: 0 })]);
    const { results } = await applySyncBatch(store, [
      // device-a is the owner; a stale baseRev still applies (active device wins).
      op({ opId: "a2", deviceId: "device-a", baseRev: 0 }),
    ]);

    expect(results[0]?.status).toBe("applied");
    expect(results[0]?.rev).toBe(2);
  });
});

describe("listOpsSince", () => {
  it("returns a device's ops after a cursor and reports the next cursor", async () => {
    const store = new InMemorySyncStore();
    await applySyncBatch(store, [
      op({ opId: "o1", deviceId: "device-a", baseRev: 0, gameId: "g1" }),
      op({ opId: "o2", deviceId: "device-a", baseRev: 1, gameId: "g1" }),
    ]);

    const all = await listOpsSince(store, "device-a", 0, 100);
    expect(all.ops.map((o) => o.opId)).toEqual(["o1", "o2"]);
    expect(all.cursor).toBe(2);
    expect(all.hasMore).toBe(false);

    const afterFirst = await listOpsSince(store, "device-a", 1, 100);
    expect(afterFirst.ops.map((o) => o.opId)).toEqual(["o2"]);
  });

  it("scopes ops to the requesting device", async () => {
    const store = new InMemorySyncStore();
    await applySyncBatch(store, [
      op({ opId: "a1", deviceId: "device-a", gameId: "ga" }),
      op({ opId: "b1", deviceId: "device-b", gameId: "gb" }),
    ]);

    const forB = await listOpsSince(store, "device-b", 0, 100);
    expect(forB.ops.map((o) => o.opId)).toEqual(["b1"]);
  });

  it("paginates with hasMore when the limit is reached", async () => {
    const store = new InMemorySyncStore();
    await applySyncBatch(store, [
      op({ opId: "o1", baseRev: 0 }),
      op({ opId: "o2", baseRev: 1 }),
      op({ opId: "o3", baseRev: 2 }),
    ]);

    const page = await listOpsSince(store, "device-a", 0, 2);
    expect(page.ops.map((o) => o.opId)).toEqual(["o1", "o2"]);
    expect(page.cursor).toBe(2);
    expect(page.hasMore).toBe(true);
  });
});
