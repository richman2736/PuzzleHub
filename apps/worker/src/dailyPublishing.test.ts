import { describe, expect, it } from "vitest";
import type { Difficulty, GameType } from "@puzzlehub/game-core";

import {
  addUtcDays,
  enumerateDates,
  getDailyStatus,
  InMemoryDailyStore,
  publishDailyRange,
  type DailyGenerator,
} from "./dailyPublishing";

const generate: DailyGenerator = (challengeDate, gameType, difficulty) => ({
  id: `${challengeDate}:${gameType}:${difficulty}`,
  challengeDate,
  gameType,
  difficulty,
  seed: `seed:${challengeDate}:${difficulty}`,
  generatorVersion: "test-v1",
  puzzleData: { grid: [[0]], givens: [[false]], clueCount: 1 },
  solutionData: { grid: [[5]] },
});

const baseOptions = {
  gameType: "sudoku" as GameType,
  difficulties: ["easy"] as Difficulty[],
  regenerate: false,
  actor: "tester",
  publishedAt: "2026-07-01T00:00:00.000Z",
};

describe("date helpers", () => {
  it("adds UTC days and enumerates a range across a month boundary", () => {
    expect(addUtcDays("2026-06-29", 3)).toBe("2026-07-02");
    expect(enumerateDates("2026-06-30", 3)).toEqual(["2026-06-30", "2026-07-01", "2026-07-02"]);
  });
});

describe("publishDailyRange", () => {
  it("publishes a range of missing dates and audits each publish", async () => {
    const store = new InMemoryDailyStore();

    const summary = await publishDailyRange(store, generate, {
      ...baseOptions,
      startDate: "2026-07-01",
      days: 7,
    });

    expect(summary.published).toBe(7);
    expect(summary.skipped).toBe(0);
    expect(store.audit).toHaveLength(7);
    expect(store.audit.every((entry) => entry.action === "publish")).toBe(true);
  });

  it("never overwrites a published daily without regenerate (immutable)", async () => {
    const store = new InMemoryDailyStore();
    const options = { ...baseOptions, startDate: "2026-07-01", days: 1 };

    await publishDailyRange(store, generate, options);
    const second = await publishDailyRange(store, generate, options);

    expect(second.skipped).toBe(1);
    expect(second.published).toBe(0);
    const record = await store.get("2026-07-01", "sudoku", "easy");
    expect(record?.revision).toBe(1);
    expect(store.audit).toHaveLength(1); // no new audit entry on a skip
  });

  it("regenerates as an audited override that bumps the revision", async () => {
    const store = new InMemoryDailyStore();
    const options = { ...baseOptions, startDate: "2026-07-01", days: 1 };

    await publishDailyRange(store, generate, options);
    const overridden = await publishDailyRange(store, generate, { ...options, regenerate: true });

    expect(overridden.republished).toBe(1);
    const record = await store.get("2026-07-01", "sudoku", "easy");
    expect(record?.revision).toBe(2);
    expect(store.audit.map((entry) => entry.action)).toEqual(["publish", "override"]);
  });
});

describe("getDailyStatus", () => {
  it("reports which dates are published and which are missing", async () => {
    const store = new InMemoryDailyStore();
    await publishDailyRange(store, generate, { ...baseOptions, startDate: "2026-07-01", days: 1 });

    const report = await getDailyStatus(store, {
      startDate: "2026-07-01",
      days: 3,
      gameType: "sudoku",
      difficulties: ["easy"],
    });

    expect(report.entries).toHaveLength(3);
    expect(report.entries[0]).toMatchObject({ challengeDate: "2026-07-01", published: true });
    expect(report.missing.map((entry) => entry.challengeDate)).toEqual([
      "2026-07-02",
      "2026-07-03",
    ]);
  });
});
