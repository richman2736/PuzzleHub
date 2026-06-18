import { describe, expect, it } from "vitest";

import { generateSudoku, rateSudokuPuzzle, solveSudoku } from "../index";
import type { Difficulty } from "@puzzlehub/game-core";

// Generator/solver performance budgets. Lives in the nightly stress run (see
// `vitest.stress.config.ts`), never the fast PR run, so timing variance can
// never gate a PR. Budgets are documented medians set well above observed dev
// timings: they catch catastrophic algorithmic regressions, not micro-jitter.

const difficulties: Difficulty[] = ["easy", "medium", "hard", "expert", "master"];

const sampleSize = Math.max(20, Number(process.env.SUDOKU_PERF_SAMPLE ?? "60"));

// Budgeted median wall-clock per generated puzzle (ms). Roughly 6-9x the median
// observed locally, leaving headroom for slower shared CI runners while still
// flagging a multiple-x regression. Generation dominates; solve/rate are cheap.
const generationBudgetMs: Record<Difficulty, number> = {
  easy: 25,
  medium: 40,
  hard: 60,
  expert: 120,
  master: 250,
};

// Single-solution solve and full re-rate budgets (median ms), difficulty-agnostic.
const solveBudgetMs = 20;
const rateBudgetMs = 15;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

describe("sudoku generator/solver performance budgets", () => {
  for (const difficulty of difficulties) {
    it(`generates, solves, and rates ${difficulty} within budget`, () => {
      // Warm up the JIT so the first compiled run does not skew the median.
      for (let index = 0; index < 8; index += 1) {
        generateSudoku({ difficulty, seed: `perf-warmup-${difficulty}-${index}` });
      }

      const generationMs: number[] = [];
      const solveMs: number[] = [];
      const rateMs: number[] = [];

      for (let index = 0; index < sampleSize; index += 1) {
        const seed = `perf-${difficulty}-${index}`;

        let start = performance.now();
        const { puzzle } = generateSudoku({ difficulty, seed });
        generationMs.push(performance.now() - start);

        start = performance.now();
        solveSudoku(puzzle.grid, 1);
        solveMs.push(performance.now() - start);

        start = performance.now();
        rateSudokuPuzzle(puzzle.grid);
        rateMs.push(performance.now() - start);
      }

      const generationMedian = median(generationMs);
      const solveMedian = median(solveMs);
      const rateMedian = median(rateMs);

      console.log(
        `[perf] ${difficulty}: gen med=${generationMedian.toFixed(2)}ms ` +
          `p95=${percentile(generationMs, 95).toFixed(2)}ms ` +
          `solve med=${solveMedian.toFixed(2)}ms rate med=${rateMedian.toFixed(2)}ms ` +
          `(budget gen=${generationBudgetMs[difficulty]} solve=${solveBudgetMs} rate=${rateBudgetMs})`,
      );

      expect(
        generationMedian,
        `${difficulty} generation median ${generationMedian.toFixed(2)}ms exceeded budget`,
      ).toBeLessThan(generationBudgetMs[difficulty]);
      expect(solveMedian, `${difficulty} solve median exceeded budget`).toBeLessThan(solveBudgetMs);
      expect(rateMedian, `${difficulty} rate median exceeded budget`).toBeLessThan(rateBudgetMs);
    });
  }
});
