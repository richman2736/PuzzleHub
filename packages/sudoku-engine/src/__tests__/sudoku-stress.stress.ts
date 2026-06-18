import { describe, expect, it } from "vitest";

import {
  countSolutions,
  countSudokuClues,
  generateSudoku,
  isGridConsistent,
  sudokuAlgorithmVersion,
  type SudokuRatingTechnique,
} from "../index";
import type { Difficulty } from "@puzzlehub/game-core";

// Nightly generator stress. This suite is intentionally excluded from the fast
// `bun run test` run (see `vitest.stress.config.ts`) because it generates
// thousands of puzzles. It guards against difficulty and uniqueness regressions
// at scale, per the Phase 1 acceptance criteria.

const difficulties: Difficulty[] = ["easy", "medium", "hard", "expert", "master"];

// Default to 1,000 seeds per difficulty; override with STRESS_SEEDS_PER_DIFFICULTY
// for a faster local smoke run (e.g. STRESS_SEEDS_PER_DIFFICULTY=50).
const seedsPerDifficulty = Math.max(1, Number(process.env.STRESS_SEEDS_PER_DIFFICULTY ?? "1000"));

// The hardest required technique must always land a puzzle in exactly one
// difficulty band. This is the contract `computeRatingScore` + `scoreToDifficulty`
// encode; the stress run proves it holds across thousands of generated puzzles.
const expectedBandForTechnique: Record<SudokuRatingTechnique, Difficulty> = {
  "naked-single": "easy",
  "hidden-single": "medium",
  "locked-candidates": "medium",
  "naked-pair": "hard",
  "naked-triple": "hard",
  "hidden-pair": "expert",
  "hidden-triple": "expert",
  "x-wing": "master",
  search: "master",
};

describe("sudoku generator stress", () => {
  for (const requested of difficulties) {
    it(
      `generates ${seedsPerDifficulty} unique, well-rated ${requested} puzzles`,
      () => {
        const techniqueDistribution: Partial<Record<SudokuRatingTechnique, number>> = {};
        let solvedByLogic = 0;

        for (let index = 0; index < seedsPerDifficulty; index += 1) {
          const seed = `stress-${sudokuAlgorithmVersion}-${requested}-${index}`;
          const { puzzle } = generateSudoku({ difficulty: requested, seed });
          const rating = puzzle.rating;

          // Uniqueness contract: every generated puzzle has exactly one solution.
          expect(countSolutions(puzzle.grid, 2), `non-unique solution for seed ${seed}`).toBe(1);

          // Structural integrity.
          expect(isGridConsistent(puzzle.grid), `inconsistent grid for seed ${seed}`).toBe(true);
          expect(puzzle.clueCount).toBe(countSudokuClues(puzzle.grid));
          expect(rating.initialClueCount).toBe(puzzle.clueCount);

          // Rating self-consistency.
          expect(rating.solvedByLogic).toBe(rating.unresolvedCells === 0);
          if (rating.unresolvedCells > 0) {
            expect(
              rating.maxTechnique,
              `unsolved puzzle must fall back to search for ${seed}`,
            ).toBe("search");
          }

          // No band crossing: difficulty is a pure function of the hardest technique.
          expect(rating.difficulty, `band mismatch for seed ${seed} (${rating.maxTechnique})`).toBe(
            expectedBandForTechnique[rating.maxTechnique],
          );

          techniqueDistribution[rating.maxTechnique] =
            (techniqueDistribution[rating.maxTechnique] ?? 0) + 1;
          if (rating.solvedByLogic) {
            solvedByLogic += 1;
          }
        }

        // Surface the profile for nightly logs so a distribution shift is visible
        // even when every hard assertion still passes.
        console.log(
          `[stress] ${requested}: solvedByLogic=${solvedByLogic}/${seedsPerDifficulty} ` +
            `maxTechnique=${JSON.stringify(techniqueDistribution)}`,
        );
      },
      // Generous per-difficulty timeout: thousands of generate + solve passes.
      10 * 60 * 1000,
    );
  }

  it("produces identical puzzles for repeated seeds at scale", () => {
    const sample = Math.min(50, seedsPerDifficulty);

    for (const requested of difficulties) {
      for (let index = 0; index < sample; index += 1) {
        const seed = `stress-determinism-${requested}-${index}`;
        const first = generateSudoku({ difficulty: requested, seed }).puzzle;
        const second = generateSudoku({ difficulty: requested, seed }).puzzle;

        expect(second.grid).toEqual(first.grid);
        expect(second.rating.score).toBe(first.rating.score);
        expect(second.rating.maxTechnique).toBe(first.rating.maxTechnique);
      }
    }
  });
});
