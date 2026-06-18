import type { Difficulty } from "@puzzlehub/game-core";
import type { SudokuGrid, SudokuRatingTechnique } from "../index";

export const validPuzzleFixture: SudokuGrid = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
];

export const invalidPuzzleFixture: SudokuGrid = [
  [5, 3, 5, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
];

export const noSolutionPuzzleFixture: SudokuGrid = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [9, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

export const multiSolutionPuzzleFixture: SudokuGrid = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

export const difficultyPuzzleFixtures = {
  easy: {
    clueCount: 42,
    difficulty: "easy",
    grid: [
      [0, 2, 0, 8, 0, 0, 0, 0, 7],
      [1, 3, 4, 6, 0, 0, 2, 8, 5],
      [7, 8, 0, 0, 2, 3, 6, 9, 4],
      [5, 9, 0, 4, 7, 0, 0, 6, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 7, 3, 0, 0, 5, 0, 0],
      [3, 0, 0, 7, 0, 0, 4, 2, 0],
      [0, 0, 0, 9, 0, 6, 7, 5, 0],
      [9, 7, 8, 2, 5, 0, 0, 1, 0],
    ] satisfies SudokuGrid,
    maxTechnique: "naked-single",
    seed: "fixture-easy",
  },
  medium: {
    clueCount: 36,
    difficulty: "medium",
    grid: [
      [0, 2, 7, 6, 0, 4, 5, 3, 0],
      [0, 0, 0, 0, 2, 9, 0, 4, 0],
      [6, 0, 5, 0, 0, 0, 1, 9, 0],
      [8, 0, 2, 7, 4, 0, 3, 0, 1],
      [3, 0, 0, 9, 0, 0, 2, 0, 7],
      [0, 1, 6, 0, 3, 0, 9, 0, 4],
      [2, 7, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 3, 5, 0, 0, 0, 9],
      [0, 0, 0, 0, 0, 7, 0, 0, 3],
    ] satisfies SudokuGrid,
    maxTechnique: "naked-single",
    seed: "fixture-medium",
  },
  hard: {
    clueCount: 31,
    difficulty: "hard",
    grid: [
      [0, 7, 2, 3, 0, 0, 0, 8, 0],
      [8, 0, 0, 0, 6, 0, 7, 0, 4],
      [0, 3, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 3, 8, 0, 9, 0, 5, 6],
      [0, 0, 4, 0, 0, 0, 0, 7, 0],
      [0, 0, 6, 0, 0, 7, 0, 2, 8],
      [0, 0, 7, 4, 0, 6, 0, 0, 0],
      [3, 4, 8, 0, 0, 1, 0, 0, 0],
      [2, 0, 0, 5, 7, 0, 8, 0, 0],
    ] satisfies SudokuGrid,
    maxTechnique: "hidden-single",
    seed: "fixture-hard",
  },
  expert: {
    clueCount: 27,
    difficulty: "expert",
    grid: [
      [0, 0, 0, 2, 0, 0, 0, 4, 0],
      [6, 3, 0, 0, 0, 0, 0, 0, 2],
      [0, 0, 0, 6, 7, 0, 5, 0, 0],
      [0, 0, 0, 0, 0, 7, 0, 1, 0],
      [0, 0, 0, 0, 9, 0, 0, 2, 7],
      [7, 2, 1, 0, 0, 0, 8, 0, 5],
      [1, 0, 6, 7, 0, 0, 0, 0, 0],
      [3, 0, 0, 0, 0, 8, 0, 0, 0],
      [0, 0, 2, 5, 0, 9, 0, 3, 0],
    ] satisfies SudokuGrid,
    maxTechnique: "hidden-single",
    seed: "fixture-expert",
  },
  master: {
    clueCount: 25,
    difficulty: "master",
    grid: [
      [0, 3, 2, 0, 0, 0, 0, 0, 0],
      [0, 0, 7, 0, 3, 0, 0, 8, 1],
      [0, 0, 1, 0, 0, 2, 4, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 7, 0],
      [0, 0, 0, 0, 0, 4, 0, 0, 6],
      [0, 0, 0, 1, 6, 5, 0, 4, 0],
      [0, 7, 0, 9, 0, 3, 0, 0, 0],
      [0, 9, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 0, 6, 1, 0, 3, 0, 9],
    ] satisfies SudokuGrid,
    maxTechnique: "locked-candidates",
    seed: "fixture-master",
  },
} satisfies Record<
  Difficulty,
  {
    clueCount: number;
    difficulty: Difficulty;
    grid: SudokuGrid;
    maxTechnique: SudokuRatingTechnique;
    seed: string;
  }
>;
