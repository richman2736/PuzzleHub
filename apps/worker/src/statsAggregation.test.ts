import { describe, expect, it } from "vitest";

import { InMemoryCompletionStore, type CompletionEvent } from "./completion";
import {
  aggregateDeviceStats,
  applyCompletionToStats,
  InMemoryStatsStore,
  replayStats,
  streakDate,
} from "./statsAggregation";

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
    completedAt: overrides.completedAt ?? "2026-06-17T12:00:00.000Z",
  };
}

const NOW = "2026-06-20T00:00:00.000Z";

describe("streakDate", () => {
  it("uses the UTC calendar day of the completion", () => {
    expect(streakDate("2026-06-17T23:59:59.000Z")).toBe("2026-06-17");
  });
});

describe("applyCompletionToStats", () => {
  it("accumulates totals and starts a streak on the first completion", () => {
    const stats = applyCompletionToStats(
      null,
      event({ score: 400, xp: 30, elapsedSeconds: 250 }),
      NOW,
    );

    expect(stats.gamesCompleted).toBe(1);
    expect(stats.totalScore).toBe(400);
    expect(stats.totalXp).toBe(30);
    expect(stats.bestTimeSeconds).toBe(250);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);
  });

  it("extends the streak on the next UTC day and keeps the best time", () => {
    const day1 = applyCompletionToStats(
      null,
      event({ completedAt: "2026-06-17T10:00:00.000Z", elapsedSeconds: 300 }),
      NOW,
    );
    const day2 = applyCompletionToStats(
      day1,
      event({ completedAt: "2026-06-18T10:00:00.000Z", elapsedSeconds: 200 }),
      NOW,
    );

    expect(day2.currentStreak).toBe(2);
    expect(day2.longestStreak).toBe(2);
    expect(day2.bestTimeSeconds).toBe(200);
  });

  it("does not change the streak for a second completion on the same day", () => {
    const first = applyCompletionToStats(
      null,
      event({ completedAt: "2026-06-17T08:00:00.000Z" }),
      NOW,
    );
    const same = applyCompletionToStats(
      first,
      event({ completedAt: "2026-06-17T20:00:00.000Z" }),
      NOW,
    );

    expect(same.currentStreak).toBe(1);
    expect(same.gamesCompleted).toBe(2);
  });

  it("resets the streak after a gap but keeps the longest", () => {
    const day1 = applyCompletionToStats(
      null,
      event({ completedAt: "2026-06-17T10:00:00.000Z" }),
      NOW,
    );
    const day2 = applyCompletionToStats(
      day1,
      event({ completedAt: "2026-06-18T10:00:00.000Z" }),
      NOW,
    );
    const day5 = applyCompletionToStats(
      day2,
      event({ completedAt: "2026-06-21T10:00:00.000Z" }),
      NOW,
    );

    expect(day5.currentStreak).toBe(1);
    expect(day5.longestStreak).toBe(2);
  });
});

describe("replayStats", () => {
  it("reproduces stats deterministically from the event log", () => {
    const events = [
      event({ id: "e1", progressId: "p1", completedAt: "2026-06-17T10:00:00.000Z", score: 100 }),
      event({ id: "e2", progressId: "p2", completedAt: "2026-06-18T10:00:00.000Z", score: 200 }),
      event({ id: "e3", progressId: "p3", completedAt: "2026-06-21T10:00:00.000Z", score: 300 }),
    ];

    const stats = replayStats("device-a", "sudoku", events, NOW);

    expect(stats.gamesCompleted).toBe(3);
    expect(stats.totalScore).toBe(600);
    expect(stats.currentStreak).toBe(1); // gap before 06-21
    expect(stats.longestStreak).toBe(2); // 06-17 -> 06-18
  });

  it("ignores other game types", () => {
    const events = [
      event({ id: "e1", gameType: "sudoku", score: 100 }),
      event({ id: "e2", gameType: "block", score: 999 }),
    ];

    expect(replayStats("device-a", "sudoku", events, NOW).totalScore).toBe(100);
  });
});

describe("aggregateDeviceStats", () => {
  it("replays the device's events and persists the result", async () => {
    const completionStore = new InMemoryCompletionStore();
    const statsStore = new InMemoryStatsStore();
    await completionStore.append(event({ id: "e1", progressId: "p1", score: 100 }));
    await completionStore.append(event({ id: "e2", progressId: "p2", score: 250 }));

    const stats = await aggregateDeviceStats(
      completionStore,
      statsStore,
      "device-a",
      "sudoku",
      NOW,
    );

    expect(stats.gamesCompleted).toBe(2);
    expect(stats.totalScore).toBe(350);
    expect(await statsStore.get("device-a", "sudoku")).toEqual(stats);
  });

  it("is idempotent when run twice", async () => {
    const completionStore = new InMemoryCompletionStore();
    const statsStore = new InMemoryStatsStore();
    await completionStore.append(event({ id: "e1", progressId: "p1", score: 100 }));

    const first = await aggregateDeviceStats(
      completionStore,
      statsStore,
      "device-a",
      "sudoku",
      NOW,
    );
    const second = await aggregateDeviceStats(
      completionStore,
      statsStore,
      "device-a",
      "sudoku",
      NOW,
    );

    expect(second).toEqual(first);
    expect(second.gamesCompleted).toBe(1);
  });
});
