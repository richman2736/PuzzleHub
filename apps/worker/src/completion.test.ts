import { describe, expect, it } from "vitest";

import {
  calculateXp,
  flagCompletion,
  InMemoryCompletionStore,
  recordCompletion,
  type CompletionEvent,
  type CompletionPublisher,
  type RecordCompletionInput,
} from "./completion";

class CapturingPublisher implements CompletionPublisher {
  readonly published: CompletionEvent[] = [];

  publish(event: CompletionEvent): Promise<void> {
    this.published.push(event);
    return Promise.resolve();
  }
}

function input(overrides: Partial<RecordCompletionInput> = {}): RecordCompletionInput {
  return {
    id: overrides.id ?? "evt-1",
    deviceId: overrides.deviceId ?? "device-a",
    gameType: overrides.gameType ?? "sudoku",
    difficulty: overrides.difficulty ?? "medium",
    progressId: overrides.progressId ?? "progress-1",
    elapsedSeconds: overrides.elapsedSeconds ?? 300,
    mistakes: overrides.mistakes ?? 1,
    hintsUsed: overrides.hintsUsed ?? 0,
    score: overrides.score ?? 500,
    isDaily: overrides.isDaily ?? false,
    completedAt: overrides.completedAt ?? "2026-06-17T00:00:00.000Z",
  };
}

describe("calculateXp", () => {
  it("scales with difficulty and score and is reduced by hints, never negative", () => {
    expect(calculateXp("easy", 0, 0)).toBe(10);
    expect(calculateXp("master", 500, 0)).toBe(85); // 80 + floor(500/100)
    expect(calculateXp("easy", 0, 100)).toBe(0); // floored at 0
  });
});

describe("flagCompletion", () => {
  it("flags unrealistic times, excessive mistakes/hints, and duplicates", () => {
    expect(
      flagCompletion({
        difficulty: "master",
        elapsedSeconds: 5,
        mistakes: 0,
        hintsUsed: 0,
        isDuplicate: false,
      }),
    ).toContain("unrealistic_time");

    expect(
      flagCompletion({
        difficulty: "easy",
        elapsedSeconds: 600,
        mistakes: 50,
        hintsUsed: 50,
        isDuplicate: true,
      }),
    ).toEqual(["excessive_mistakes", "excessive_hints", "duplicate_submission"]);

    expect(
      flagCompletion({
        difficulty: "easy",
        elapsedSeconds: 600,
        mistakes: 0,
        hintsUsed: 0,
        isDuplicate: false,
      }),
    ).toEqual([]);
  });
});

describe("recordCompletion", () => {
  it("persists and publishes a new completion with score-derived XP", async () => {
    const store = new InMemoryCompletionStore();
    const publisher = new CapturingPublisher();

    const result = await recordCompletion(
      store,
      publisher,
      input({ score: 600, difficulty: "hard" }),
    );

    expect(result.recorded).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.event.xp).toBe(calculateXp("hard", 600, 0));
    expect(store.events).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
  });

  it("does not re-store or re-publish a duplicate completion", async () => {
    const store = new InMemoryCompletionStore();
    const publisher = new CapturingPublisher();

    await recordCompletion(store, publisher, input({ id: "evt-1" }));
    const second = await recordCompletion(store, publisher, input({ id: "evt-2" }));

    expect(second.duplicate).toBe(true);
    expect(second.recorded).toBe(false);
    expect(second.event.flags).toContain("duplicate_submission");
    expect(store.events).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
  });

  it("supports replaying a device's completions in order", async () => {
    const store = new InMemoryCompletionStore();
    const publisher = new CapturingPublisher();

    await recordCompletion(store, publisher, input({ id: "e1", progressId: "p1" }));
    await recordCompletion(store, publisher, input({ id: "e2", progressId: "p2" }));

    const replay = await store.listByDevice("device-a");
    expect(replay.map((event) => event.progressId)).toEqual(["p1", "p2"]);
  });
});
