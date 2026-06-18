import { describe, expect, it } from "vitest";

import { InMemoryCompletionStore, type CompletionEvent } from "./completion";
import {
  allTimePeriod,
  buildLeaderboard,
  InMemoryLeaderboardStore,
  pseudonymForDevice,
  rebuildLeaderboards,
} from "./leaderboard";

function event(overrides: Partial<CompletionEvent> = {}): CompletionEvent {
  return {
    id: overrides.id ?? "e1",
    deviceId: overrides.deviceId ?? "device-a",
    gameType: overrides.gameType ?? "sudoku",
    difficulty: overrides.difficulty ?? "medium",
    progressId: overrides.progressId ?? "p1",
    elapsedSeconds: overrides.elapsedSeconds ?? 300,
    mistakes: overrides.mistakes ?? 0,
    hintsUsed: overrides.hintsUsed ?? 0,
    score: overrides.score ?? 500,
    xp: overrides.xp ?? 25,
    flags: overrides.flags ?? [],
    isDaily: overrides.isDaily ?? false,
    completedAt: overrides.completedAt ?? "2026-06-18T12:00:00.000Z",
  };
}

describe("pseudonymForDevice", () => {
  it("is stable, prefixed, and never contains the device id", () => {
    const name = pseudonymForDevice("device-secret-123");
    expect(name).toBe(pseudonymForDevice("device-secret-123"));
    expect(name.startsWith("Player-")).toBe(true);
    expect(name).not.toContain("secret");
    expect(pseudonymForDevice("device-a")).not.toBe(pseudonymForDevice("device-b"));
  });
});

describe("buildLeaderboard", () => {
  it("ranks by score and exposes pseudonyms, never device ids", () => {
    const board = buildLeaderboard([
      event({ id: "e1", deviceId: "device-a", score: 700 }),
      event({ id: "e2", deviceId: "device-b", score: 900 }),
    ]);

    expect(board.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(board[0]?.score).toBe(900);
    expect(board[0]?.displayName).toBe(pseudonymForDevice("device-b"));
    expect(JSON.stringify(board)).not.toContain("device-");
  });

  it("keeps only each device's best clean completion", () => {
    const board = buildLeaderboard([
      event({ id: "e1", deviceId: "device-a", progressId: "p1", score: 400 }),
      event({ id: "e2", deviceId: "device-a", progressId: "p2", score: 800 }),
    ]);

    expect(board).toHaveLength(1);
    expect(board[0]?.score).toBe(800);
  });

  it("excludes flagged (anti-cheat) completions", () => {
    const board = buildLeaderboard([
      event({ id: "e1", deviceId: "device-a", score: 999, flags: ["unrealistic_time"] }),
      event({ id: "e2", deviceId: "device-b", score: 500 }),
    ]);

    expect(board).toHaveLength(1);
    expect(board[0]?.displayName).toBe(pseudonymForDevice("device-b"));
  });

  it("breaks score ties by faster time", () => {
    const board = buildLeaderboard([
      event({ id: "e1", deviceId: "device-a", score: 600, elapsedSeconds: 400 }),
      event({ id: "e2", deviceId: "device-b", score: 600, elapsedSeconds: 200 }),
    ]);

    expect(board[0]?.displayName).toBe(pseudonymForDevice("device-b"));
  });
});

describe("rebuildLeaderboards", () => {
  it("rebuilds all-time and daily boards from the event log", async () => {
    const completionStore = new InMemoryCompletionStore();
    const leaderboardStore = new InMemoryLeaderboardStore();
    await completionStore.append(
      event({
        id: "e1",
        deviceId: "device-a",
        score: 700,
        completedAt: "2026-06-18T10:00:00.000Z",
      }),
    );
    await completionStore.append(
      event({
        id: "e2",
        deviceId: "device-b",
        progressId: "p2",
        score: 900,
        completedAt: "2026-06-17T10:00:00.000Z",
      }),
    );

    await rebuildLeaderboards(
      completionStore,
      leaderboardStore,
      "sudoku",
      "medium",
      "2026-06-18",
      "2026-06-18T12:00:00.000Z",
    );

    const allTime = await leaderboardStore.get({
      gameType: "sudoku",
      difficulty: "medium",
      period: allTimePeriod,
    });
    expect(allTime).toHaveLength(2);
    expect(allTime[0]?.score).toBe(900);

    const daily = await leaderboardStore.get({
      gameType: "sudoku",
      difficulty: "medium",
      period: "2026-06-18",
    });
    expect(daily).toHaveLength(1); // only the 06-18 completion
    expect(daily[0]?.score).toBe(700);
  });
});
