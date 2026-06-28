import { describe, expect, it } from "vitest";

import {
  applyLocalSudokuCompletion,
  calculateLocalSudokuXp,
  calculateSudokuMedal,
  createLocalSudokuCompletion,
  evaluateLocalSudokuAchievements,
  replayLocalSudokuStats,
  summarizeLocalSudokuProgress,
  type LocalSudokuCompletion,
  type LocalSudokuCompletionInput,
} from "../sudokuRewards";

function completionInput(
  overrides: Partial<LocalSudokuCompletionInput> = {},
): LocalSudokuCompletionInput {
  return {
    gameId: overrides.gameId ?? "game-1",
    difficulty: overrides.difficulty ?? "medium",
    score: overrides.score ?? 9000,
    elapsedSeconds: overrides.elapsedSeconds ?? 300,
    mistakes: overrides.mistakes ?? 0,
    hintsUsed: overrides.hintsUsed ?? 0,
    completedAt: overrides.completedAt ?? "2026-06-17T12:00:00.000Z",
    isDaily: overrides.isDaily ?? false,
  };
}

function completion(overrides: Partial<LocalSudokuCompletionInput> = {}): LocalSudokuCompletion {
  return createLocalSudokuCompletion(completionInput(overrides));
}

describe("local Sudoku XP", () => {
  it("calculates deterministic XP from difficulty, score, and hints", () => {
    expect(calculateLocalSudokuXp({ difficulty: "easy", score: 8500, hintsUsed: 0 })).toBe(95);
    expect(calculateLocalSudokuXp({ difficulty: "hard", score: 8500, hintsUsed: 2 })).toBe(116);
    expect(calculateLocalSudokuXp({ difficulty: "easy", score: 0, hintsUsed: 20 })).toBe(0);
  });
});

describe("local Sudoku medals", () => {
  it("awards gold for strong clean completions", () => {
    expect(
      calculateSudokuMedal({ difficulty: "easy", score: 9300, mistakes: 0, hintsUsed: 0 }),
    ).toBe("gold");
  });

  it("awards silver for solid completions and bronze otherwise", () => {
    expect(
      calculateSudokuMedal({ difficulty: "medium", score: 9000, mistakes: 1, hintsUsed: 1 }),
    ).toBe("silver");
    expect(
      calculateSudokuMedal({ difficulty: "medium", score: 3000, mistakes: 5, hintsUsed: 3 }),
    ).toBe("bronze");
  });
});

describe("local Sudoku stats", () => {
  it("replays totals, bests, and streaks from completions", () => {
    const stats = replayLocalSudokuStats([
      completion({
        gameId: "g1",
        score: 7000,
        elapsedSeconds: 500,
        completedAt: "2026-06-17T10:00:00.000Z",
      }),
      completion({
        gameId: "g2",
        score: 8000,
        elapsedSeconds: 400,
        completedAt: "2026-06-18T10:00:00.000Z",
      }),
      completion({
        gameId: "g3",
        score: 7500,
        elapsedSeconds: 450,
        completedAt: "2026-06-18T13:00:00.000Z",
      }),
    ]);

    expect(stats.gamesCompleted).toBe(3);
    expect(stats.bestScore).toBe(8000);
    expect(stats.bestTimeSeconds).toBe(400);
    expect(stats.currentStreak).toBe(2);
    expect(stats.longestStreak).toBe(2);
    expect(stats.lastPlayedDate).toBe("2026-06-18");
  });

  it("resets the current streak after a date gap", () => {
    const stats = replayLocalSudokuStats([
      completion({ gameId: "g1", completedAt: "2026-06-17T10:00:00.000Z" }),
      completion({ gameId: "g2", completedAt: "2026-06-19T10:00:00.000Z" }),
    ]);

    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);
  });
});

describe("local Sudoku achievements", () => {
  it("unlocks the first local achievement set from completion history", () => {
    const unlocked = evaluateLocalSudokuAchievements([
      completion({
        gameId: "g1",
        difficulty: "hard",
        mistakes: 0,
        isDaily: true,
        completedAt: "2026-06-17T10:00:00.000Z",
      }),
      completion({ gameId: "g2", completedAt: "2026-06-18T10:00:00.000Z" }),
      completion({ gameId: "g3", completedAt: "2026-06-19T10:00:00.000Z" }),
    ]).map((achievement) => achievement.achievementId);

    expect(unlocked).toEqual([
      "first_solve",
      "first_daily",
      "no_mistake_solve",
      "hard_completed",
      "streak_3",
    ]);
  });

  it("unlocks the seven-day streak once the streak reaches seven days", () => {
    const unlocked = evaluateLocalSudokuAchievements(
      Array.from({ length: 7 }, (_, index) =>
        completion({
          gameId: `g${index}`,
          completedAt: `2026-06-${String(17 + index).padStart(2, "0")}T10:00:00.000Z`,
        }),
      ),
    ).map((achievement) => achievement.achievementId);

    expect(unlocked).toContain("streak_7");
  });
});

describe("local Sudoku progress", () => {
  it("summarizes stats, achievements, latest completion, and medal counts", () => {
    const first = completion({
      gameId: "g1",
      difficulty: "easy",
      completedAt: "2026-06-17T10:00:00.000Z",
      mistakes: 0,
      score: 9300,
      isDaily: true,
    });
    const second = completion({
      gameId: "g2",
      completedAt: "2026-06-18T10:00:00.000Z",
      mistakes: 4,
      score: 3000,
    });

    const progress = summarizeLocalSudokuProgress([second, first]);

    expect(progress.completions.map((item) => item.gameId)).toEqual(["g1", "g2"]);
    expect(progress.latestCompletion?.gameId).toBe("g2");
    expect(progress.stats.gamesCompleted).toBe(2);
    expect(progress.medalCounts.gold).toBe(1);
    expect(progress.medalCounts.bronze).toBe(1);
    expect(progress.achievements.map((achievement) => achievement.achievementId)).toEqual([
      "first_solve",
      "first_daily",
      "no_mistake_solve",
    ]);
  });
});

describe("applyLocalSudokuCompletion", () => {
  it("returns new rewards and personal records for a first completion", () => {
    const result = applyLocalSudokuCompletion(
      [],
      completionInput({ gameId: "g1", mistakes: 0, isDaily: true }),
    );

    expect(result.recorded).toBe(true);
    expect(result.personalRecords).toMatchObject({
      firstCompletion: true,
      flawless: true,
      newBestScore: true,
      newBestTime: true,
      newLongestStreak: true,
    });
    expect(result.unlockedAchievementIds).toEqual([
      "first_solve",
      "first_daily",
      "no_mistake_solve",
    ]);
  });

  it("does not award XP or unlocks twice for the same game id", () => {
    const existing = completion({ gameId: "g1", score: 9000 });
    const result = applyLocalSudokuCompletion(
      [existing],
      completionInput({ gameId: "g1", score: 9999 }),
    );

    expect(result.recorded).toBe(false);
    expect(result.completion.score).toBe(9000);
    expect(result.unlockedAchievementIds).toEqual([]);
    expect(result.personalRecords.firstCompletion).toBe(false);
  });

  it("detects new best score and time against prior completions", () => {
    const result = applyLocalSudokuCompletion(
      [completion({ gameId: "g1", score: 8000, elapsedSeconds: 400 })],
      completionInput({ gameId: "g2", score: 9000, elapsedSeconds: 300 }),
    );

    expect(result.personalRecords.newBestScore).toBe(true);
    expect(result.personalRecords.newBestTime).toBe(true);
    expect(result.personalRecords.firstCompletion).toBe(false);
  });
});
