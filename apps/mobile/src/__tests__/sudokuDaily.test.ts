import { describe, expect, it } from "vitest";

import { formatLocalDailyDate, getLocalDailySudokuDescriptor } from "../sudokuDaily";

describe("local daily Sudoku descriptor", () => {
  it("formats a local calendar date with stable zero padding", () => {
    expect(formatLocalDailyDate(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
    expect(formatLocalDailyDate(new Date(2026, 10, 28, 12, 0, 0))).toBe("2026-11-28");
  });

  it("builds a deterministic seed and game id for the day", () => {
    const descriptor = getLocalDailySudokuDescriptor(new Date(2026, 5, 28, 12, 0, 0), "medium");

    expect(descriptor).toEqual({
      date: "2026-06-28",
      difficulty: "medium",
      gameId: "sudoku:sudoku-v1:medium:local-daily:sudoku:2026-06-28:medium",
      seed: "local-daily:sudoku:2026-06-28:medium",
    });
  });

  it("uses a different seed for a different day", () => {
    const today = getLocalDailySudokuDescriptor(new Date(2026, 5, 28, 12, 0, 0));
    const tomorrow = getLocalDailySudokuDescriptor(new Date(2026, 5, 29, 12, 0, 0));

    expect(today.seed).not.toBe(tomorrow.seed);
    expect(today.gameId).not.toBe(tomorrow.gameId);
  });
});
