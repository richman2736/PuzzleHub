import { describe, expect, it } from "vitest";

import {
  evaluateAchievements,
  evaluateAndPersistAchievements,
  InMemoryAchievementStore,
} from "./achievements";
import { InMemoryCompletionStore, type CompletionEvent } from "./completion";

function event(overrides: Partial<CompletionEvent> = {}): CompletionEvent {
  return {
    id: overrides.id ?? "e1",
    deviceId: overrides.deviceId ?? "device-a",
    gameType: overrides.gameType ?? "sudoku",
    difficulty: overrides.difficulty ?? "medium",
    progressId: overrides.progressId ?? "p1",
    elapsedSeconds: overrides.elapsedSeconds ?? 300,
    mistakes: overrides.mistakes ?? 2,
    hintsUsed: overrides.hintsUsed ?? 0,
    score: overrides.score ?? 500,
    xp: overrides.xp ?? 25,
    flags: overrides.flags ?? [],
    isDaily: overrides.isDaily ?? false,
    completedAt: overrides.completedAt ?? "2026-06-17T12:00:00.000Z",
  };
}

function ids(events: CompletionEvent[]): string[] {
  return evaluateAchievements(events)
    .map((entry) => entry.achievementId)
    .sort();
}

function consecutiveDays(count: number): CompletionEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const day = String(17 + index).padStart(2, "0");
    return event({
      id: `e${index}`,
      progressId: `p${index}`,
      completedAt: `2026-06-${day}T10:00:00.000Z`,
    });
  });
}

describe("evaluateAchievements", () => {
  it("unlocks first solve at the first completion's timestamp", () => {
    const result = evaluateAchievements([
      event({ completedAt: "2026-06-17T10:00:00.000Z" }),
      event({ id: "e2", progressId: "p2", completedAt: "2026-06-18T10:00:00.000Z" }),
    ]);
    const firstSolve = result.find((entry) => entry.achievementId === "first_solve");
    expect(firstSolve?.unlockedAt).toBe("2026-06-17T10:00:00.000Z");
  });

  it("unlocks the daily, no-mistake, and hard achievements from their events", () => {
    expect(ids([event({ isDaily: true })])).toContain("first_daily");
    expect(ids([event({ mistakes: 0 })])).toContain("no_mistake_solve");
    expect(ids([event({ difficulty: "expert" })])).toContain("hard_completed");
    expect(ids([event({ difficulty: "easy", mistakes: 3, isDaily: false })])).toEqual([
      "first_solve",
    ]);
  });

  it("unlocks 3-day and 7-day streak achievements", () => {
    expect(ids(consecutiveDays(3))).toContain("streak_3");
    expect(ids(consecutiveDays(3))).not.toContain("streak_7");
    expect(ids(consecutiveDays(7))).toContain("streak_7");
  });

  it("does not award streak achievements when days are not consecutive", () => {
    const gapped = [
      event({ id: "a", completedAt: "2026-06-17T10:00:00.000Z" }),
      event({ id: "b", progressId: "p2", completedAt: "2026-06-19T10:00:00.000Z" }),
      event({ id: "c", progressId: "p3", completedAt: "2026-06-21T10:00:00.000Z" }),
    ];
    expect(ids(gapped)).not.toContain("streak_3");
  });

  it("is deterministic: the same events produce the same unlocks and timestamps", () => {
    const events = consecutiveDays(3);
    expect(evaluateAchievements(events)).toEqual(evaluateAchievements(events));
  });
});

describe("evaluateAndPersistAchievements", () => {
  it("persists unlocked achievements idempotently", async () => {
    const completionStore = new InMemoryCompletionStore();
    const achievementStore = new InMemoryAchievementStore();
    await completionStore.append(event({ id: "e1", progressId: "p1", mistakes: 0 }));

    await evaluateAndPersistAchievements(completionStore, achievementStore, "device-a");
    await evaluateAndPersistAchievements(completionStore, achievementStore, "device-a");

    const unlocked = await achievementStore.listByDevice("device-a");
    const unlockedIds = unlocked.map((entry) => entry.achievementId).sort();
    expect(unlockedIds).toContain("first_solve");
    expect(unlockedIds).toContain("no_mistake_solve");
    // No duplicates after running twice.
    expect(new Set(unlockedIds).size).toBe(unlockedIds.length);
  });
});
