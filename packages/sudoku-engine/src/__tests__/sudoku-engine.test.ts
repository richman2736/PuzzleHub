import { describe, expect, it } from "vitest";
import {
  applySudokuMove,
  checkSudokuWin,
  countSudokuClues,
  countSolutions,
  createInitialSudokuState,
  createSudokuSeedContract,
  generateSudoku,
  getSudokuHint,
  isGridConsistent,
  isSolvedGrid,
  isSudokuDigit,
  pauseSudokuState,
  rateSudokuPuzzle,
  resumeSudokuState,
  solveSudoku,
  sudokuAlgorithmVersion,
  sudokuDigits,
  sudokuRuleVersion,
  tickSudokuTimer,
  type SudokuDigit,
} from "../index";
import {
  difficultyPuzzleFixtures,
  invalidPuzzleFixture,
  multiSolutionPuzzleFixture,
  noSolutionPuzzleFixture,
  validPuzzleFixture,
} from "./sudoku-fixtures";

describe("sudoku engine", () => {
  it("solves a known puzzle with one solution", () => {
    const result = solveSudoku(validPuzzleFixture, 2);

    expect(result.solutionCount).toBe(1);
    expect(countSolutions(validPuzzleFixture, 2)).toBe(1);
    expect(result.solution).not.toBeNull();
    expect(result.solution?.[0]?.[0]).toBe(5);
    expect(result.solution?.[8]?.[8]).toBe(9);
    expect(isSolvedGrid(result.solution!)).toBe(true);
  });

  it("rejects invalid complete grids instead of counting them as solved", () => {
    const solved = solveSudoku(validPuzzleFixture).solution!;
    const invalidCompleteGrid = solved.map((row) => [...row]);

    invalidCompleteGrid[0]![0] = invalidCompleteGrid[0]![1]!;

    expect(isGridConsistent(invalidCompleteGrid)).toBe(false);
    expect(isSolvedGrid(invalidCompleteGrid)).toBe(false);
    expect(solveSudoku(invalidCompleteGrid, 2)).toEqual({
      solution: null,
      solutionCount: 0,
    });
    expect(countSolutions(invalidCompleteGrid, 2)).toBe(0);
  });

  it("does not solve grids that already contain placement conflicts", () => {
    const invalidPuzzle = validPuzzleFixture.map((row) => [...row]);

    invalidPuzzle[0]![2] = 5;

    expect(isGridConsistent(invalidPuzzle)).toBe(false);
    expect(solveSudoku(invalidPuzzle, 2)).toEqual({
      solution: null,
      solutionCount: 0,
    });
  });

  it("keeps explicit fixtures for invalid, no-solution, and multi-solution puzzles", () => {
    expect(isGridConsistent(validPuzzleFixture)).toBe(true);
    expect(countSolutions(validPuzzleFixture, 2)).toBe(1);

    expect(isGridConsistent(invalidPuzzleFixture)).toBe(false);
    expect(solveSudoku(invalidPuzzleFixture, 2)).toEqual({
      solution: null,
      solutionCount: 0,
    });

    expect(isGridConsistent(noSolutionPuzzleFixture)).toBe(true);
    expect(solveSudoku(noSolutionPuzzleFixture, 2)).toEqual({
      solution: null,
      solutionCount: 0,
    });

    expect(isGridConsistent(multiSolutionPuzzleFixture)).toBe(true);
    expect(countSolutions(multiSolutionPuzzleFixture, 2)).toBe(2);
  });

  it("generates a deterministic versioned puzzle with a unique solution", () => {
    const generated = generateSudoku({ difficulty: "easy", seed: "puzzlehub-test" });
    const generatedAgain = generateSudoku({ difficulty: "easy", seed: "puzzlehub-test" });
    const solved = solveSudoku(generated.puzzle.grid, 2);

    expect(generated.puzzle.grid).toHaveLength(9);
    expect(generatedAgain.puzzle.grid).toEqual(generated.puzzle.grid);
    expect(generatedAgain.solution.grid).toEqual(generated.solution.grid);
    expect(generated.puzzle.algorithmVersion).toBe(sudokuAlgorithmVersion);
    expect(generated.puzzle.ruleVersion).toBe(sudokuRuleVersion);
    expect(generated.puzzle.clueCount).toBeLessThan(81);
    expect(generated.puzzle.clueCount).toBeGreaterThanOrEqual(42);
    expect(generated.puzzle.rating.initialClueCount).toBe(generated.puzzle.clueCount);
    expect(generated.puzzle.rating.score).toBeGreaterThan(0);
    expect(solved.solutionCount).toBe(1);
    expect(isSolvedGrid(generated.solution.grid)).toBe(true);
  });

  for (const fixture of Object.values(difficultyPuzzleFixtures)) {
    it(`keeps the ${fixture.difficulty} difficulty fixture deterministic and unique`, () => {
      const generated = generateSudoku({
        difficulty: fixture.difficulty,
        seed: fixture.seed,
      });
      const rating = rateSudokuPuzzle(fixture.grid);

      expect(generated.puzzle.grid).toEqual(fixture.grid);
      expect(generated.puzzle.clueCount).toBe(fixture.clueCount);
      expect(countSudokuClues(fixture.grid)).toBe(fixture.clueCount);
      expect(countSolutions(fixture.grid, 2)).toBe(1);
      expect(rating.solvedByLogic).toBe(true);
      expect(rating.maxTechnique).toBe(fixture.maxTechnique);
      expect(rating.unresolvedCells).toBe(0);
    });
  }

  it("creates an explicit seed contract for generator reproducibility", () => {
    const contract = createSudokuSeedContract({
      difficulty: "medium",
      seed: "contract-test",
    });

    expect(contract).toEqual({
      gameType: "sudoku",
      algorithmVersion: sudokuAlgorithmVersion,
      difficulty: "medium",
      seed: "contract-test",
    });
  });

  it("rates a one-missing-cell puzzle as solvable by a naked single", () => {
    const solution = solveSudoku(validPuzzleFixture).solution!;
    const oneMissing = solution.map((row) => [...row]);

    oneMissing[0]![0] = 0;

    const rating = rateSudokuPuzzle(oneMissing);

    expect(rating.solvedByLogic).toBe(true);
    expect(rating.maxTechnique).toBe("naked-single");
    expect(rating.unresolvedCells).toBe(0);
    expect(rating.steps).toEqual([
      {
        technique: "naked-single",
        row: 0,
        col: 0,
        value: 5,
      },
    ]);
  });

  it("uses locked candidates as eliminations in the human-style rating", () => {
    const generated = generateSudoku({
      difficulty: "medium",
      seed: "locked-logic-medium-84",
    });
    const lockedStep = generated.puzzle.rating.steps.find(
      (step) => step.technique === "locked-candidates",
    );

    expect(generated.puzzle.grid).toEqual([
      [0, 6, 8, 0, 5, 0, 0, 0, 9],
      [0, 0, 0, 0, 0, 0, 5, 1, 6],
      [1, 0, 9, 0, 0, 0, 0, 0, 3],
      [5, 0, 2, 8, 0, 0, 0, 3, 7],
      [0, 0, 1, 0, 0, 0, 8, 0, 4],
      [0, 0, 0, 7, 1, 0, 0, 5, 0],
      [9, 0, 5, 0, 0, 0, 2, 7, 0],
      [8, 0, 0, 3, 9, 2, 6, 4, 5],
      [4, 0, 0, 0, 0, 1, 0, 9, 8],
    ]);
    expect(generated.puzzle.rating.solvedByLogic).toBe(true);
    expect(generated.puzzle.rating.maxTechnique).toBe("locked-candidates");
    expect(generated.puzzle.rating.unresolvedCells).toBe(0);
    expect(lockedStep).toMatchObject({
      technique: "locked-candidates",
      row: 1,
      col: 3,
      value: 4,
      unit: "box",
      unitIndex: 0,
      eliminations: [
        { row: 1, col: 3, value: 4 },
        { row: 1, col: 4, value: 4 },
        { row: 1, col: 5, value: 4 },
      ],
    });
  });

  it("uses a naked pair to eliminate candidates in the human-style rating", () => {
    const generated = generateSudoku({ difficulty: "master", seed: "tech-master-25" });
    const rating = generated.puzzle.rating;
    const step = rating.steps.find((candidate) => candidate.technique === "naked-pair");

    expect(rating.solvedByLogic).toBe(true);
    expect(rating.unresolvedCells).toBe(0);
    expect(rating.maxTechnique).toBe("naked-pair");
    expect(step).toMatchObject({
      technique: "naked-pair",
      unit: "row",
      unitIndex: 5,
      eliminations: [
        { row: 5, col: 0, value: 3 },
        { row: 5, col: 1, value: 1 },
        { row: 5, col: 6, value: 3 },
      ],
    });
  });

  it("uses a naked triple to eliminate candidates in the human-style rating", () => {
    const generated = generateSudoku({ difficulty: "master", seed: "tech-master-45" });
    const rating = generated.puzzle.rating;
    const step = rating.steps.find((candidate) => candidate.technique === "naked-triple");

    expect(rating.solvedByLogic).toBe(true);
    expect(rating.unresolvedCells).toBe(0);
    expect(rating.maxTechnique).toBe("naked-triple");
    expect(step).toMatchObject({
      technique: "naked-triple",
      unit: "column",
      unitIndex: 6,
      eliminations: [
        { row: 1, col: 6, value: 1 },
        { row: 1, col: 6, value: 3 },
        { row: 1, col: 6, value: 5 },
      ],
    });
  });

  it("uses a hidden pair to eliminate candidates in the human-style rating", () => {
    const generated = generateSudoku({ difficulty: "hard", seed: "tech-hard-129" });
    const rating = generated.puzzle.rating;
    const step = rating.steps.find((candidate) => candidate.technique === "hidden-pair");

    expect(rating.solvedByLogic).toBe(true);
    expect(rating.unresolvedCells).toBe(0);
    expect(rating.maxTechnique).toBe("hidden-pair");
    expect(step).toMatchObject({
      technique: "hidden-pair",
      unit: "column",
      unitIndex: 0,
      eliminations: [
        { row: 6, col: 0, value: 3 },
        { row: 6, col: 0, value: 9 },
        { row: 7, col: 0, value: 4 },
      ],
    });
  });

  it("uses a hidden triple to eliminate candidates in the human-style rating", () => {
    const generated = generateSudoku({ difficulty: "master", seed: "tech-master-452" });
    const rating = generated.puzzle.rating;
    const step = rating.steps.find((candidate) => candidate.technique === "hidden-triple");

    expect(rating.solvedByLogic).toBe(true);
    expect(rating.unresolvedCells).toBe(0);
    expect(rating.maxTechnique).toBe("hidden-triple");
    expect(step).toMatchObject({
      technique: "hidden-triple",
      unit: "column",
      unitIndex: 3,
      eliminations: [
        { row: 5, col: 3, value: 1 },
        { row: 5, col: 3, value: 5 },
        { row: 6, col: 3, value: 3 },
        { row: 6, col: 3, value: 5 },
        { row: 6, col: 3, value: 9 },
        { row: 7, col: 3, value: 3 },
        { row: 7, col: 3, value: 9 },
      ],
    });
  });

  it("uses an X-wing to eliminate candidates in the human-style rating", () => {
    const generated = generateSudoku({ difficulty: "master", seed: "tech-master-66" });
    const rating = generated.puzzle.rating;
    const step = rating.steps.find((candidate) => candidate.technique === "x-wing");

    expect(rating.solvedByLogic).toBe(true);
    expect(rating.unresolvedCells).toBe(0);
    expect(rating.maxTechnique).toBe("x-wing");
    expect(step).toMatchObject({
      technique: "x-wing",
      eliminations: [
        { row: 1, col: 0, value: 6 },
        { row: 1, col: 6, value: 6 },
        { row: 1, col: 7, value: 6 },
        { row: 4, col: 2, value: 6 },
      ],
    });
  });

  it("rates difficulty by the hardest required technique, not clue count", () => {
    // A 25-clue puzzle (fewer clues than the 42-clue easy profile) that the
    // solver clears with naked singles alone must still rate "easy": difficulty
    // follows the solving profile, not how many clues were removed.
    const lowClueButEasy = generateSudoku({ difficulty: "master", seed: "hunt-2" }).puzzle;

    expect(lowClueButEasy.clueCount).toBeLessThan(30);
    expect(lowClueButEasy.rating.maxTechnique).toBe("naked-single");
    expect(lowClueButEasy.rating.solvedByLogic).toBe(true);
    expect(lowClueButEasy.rating.difficulty).toBe("easy");

    // A 36-clue puzzle that needs locked candidates rates harder despite having
    // more clues, confirming the rating is driven by technique, not clue count.
    const moreCluesButHarder = generateSudoku({
      difficulty: "medium",
      seed: "locked-logic-medium-84",
    }).puzzle;

    expect(moreCluesButHarder.clueCount).toBeGreaterThan(lowClueButEasy.clueCount);
    expect(moreCluesButHarder.rating.difficulty).toBe("medium");
  });

  it("maps each hardest-required technique to its difficulty band", () => {
    const cases: Array<{
      seed: string;
      requested: "medium" | "master";
      technique: string;
      difficulty: string;
    }> = [
      { seed: "hunt-2", requested: "master", technique: "naked-single", difficulty: "easy" },
      {
        seed: "locked-logic-medium-84",
        requested: "medium",
        technique: "locked-candidates",
        difficulty: "medium",
      },
      { seed: "tech-master-25", requested: "master", technique: "naked-pair", difficulty: "hard" },
      {
        seed: "tech-master-452",
        requested: "master",
        technique: "hidden-triple",
        difficulty: "expert",
      },
      { seed: "tech-master-66", requested: "master", technique: "x-wing", difficulty: "master" },
      { seed: "hunt-0", requested: "master", technique: "search", difficulty: "master" },
    ];

    for (const { seed, requested, technique, difficulty } of cases) {
      const rating = generateSudoku({ difficulty: requested, seed }).puzzle.rating;

      expect(rating.maxTechnique).toBe(technique);
      expect(rating.difficulty).toBe(difficulty);
    }
  });

  it("scores a search-fallback puzzle above any logic-only puzzle and stays positive", () => {
    const searchRating = generateSudoku({ difficulty: "master", seed: "hunt-0" }).puzzle.rating;
    const logicRating = generateSudoku({ difficulty: "master", seed: "tech-master-66" }).puzzle
      .rating;

    expect(searchRating.solvedByLogic).toBe(false);
    expect(searchRating.unresolvedCells).toBeGreaterThan(0);
    expect(searchRating.score).toBeGreaterThan(logicRating.score);
    expect(logicRating.score).toBeGreaterThan(0);
  });

  it("applies hints and detects a completed board", () => {
    const generated = generateSudoku({ difficulty: "easy", seed: "puzzlehub-move-test" });
    let state = createInitialSudokuState(generated.puzzle);
    const hint = getSudokuHint(generated.puzzle, generated.solution, state);

    expect(hint).not.toBeNull();

    const result = applySudokuMove(generated.puzzle, generated.solution, state, hint!.move);

    expect(result.accepted).toBe(true);
    expect(result.correct).toBe(true);

    state = {
      ...result.state,
      grid: generated.solution.grid.map((row) => [...row]),
    };

    expect(checkSudokuWin(generated.solution, state)).toBe(true);
  });

  it("tracks active timer seconds but not paused seconds", () => {
    const generated = generateSudoku({ difficulty: "easy", seed: "puzzlehub-timer-test" });
    const state = createInitialSudokuState(generated.puzzle);
    const ticked = tickSudokuTimer(state, 5);
    const paused = pauseSudokuState(ticked, "2026-06-16T12:00:00.000Z");
    const pausedTick = tickSudokuTimer(paused, 5);
    const resumed = resumeSudokuState(pausedTick);

    expect(ticked.elapsedSeconds).toBe(5);
    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).toBe("2026-06-16T12:00:00.000Z");
    expect(pausedTick.elapsedSeconds).toBe(5);
    expect(resumed.status).toBe("active");
    expect(resumed.pausedAt).toBeUndefined();
  });

  it("rejects moves while paused", () => {
    const generated = generateSudoku({ difficulty: "easy", seed: "puzzlehub-paused-move-test" });
    const state = pauseSudokuState(createInitialSudokuState(generated.puzzle));
    const result = applySudokuMove(generated.puzzle, generated.solution, state, {
      row: 0,
      col: 0,
      value: 1,
      mode: "answer",
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("Cannot move while paused.");
    expect(result.state).toBe(state);
  });

  it("counts incorrect answers without storing them on the board", () => {
    const generated = generateSudoku({ difficulty: "easy", seed: "puzzlehub-wrong-answer-test" });
    const state = createInitialSudokuState(generated.puzzle);
    let moveCell: { row: number; col: number } | null = null;

    for (let row = 0; row < generated.puzzle.grid.length; row += 1) {
      for (let col = 0; col < (generated.puzzle.grid[row]?.length ?? 0); col += 1) {
        if (!generated.puzzle.givens[row]?.[col]) {
          moveCell = { row, col };
          break;
        }
      }

      if (moveCell !== null) {
        break;
      }
    }

    expect(moveCell).not.toBeNull();

    const correctValue = generated.solution.grid[moveCell!.row]?.[moveCell!.col];
    const wrongValue = sudokuDigits.find((digit) => digit !== correctValue);

    expect(wrongValue).toBeDefined();

    const result = applySudokuMove(generated.puzzle, generated.solution, state, {
      ...moveCell!,
      value: wrongValue!,
      mode: "answer",
    });

    expect(result.accepted).toBe(true);
    expect(result.correct).toBe(false);
    expect(result.reason).toBe("Incorrect answer.");
    expect(result.state.mistakes).toBe(1);
    expect(result.state.grid[moveCell!.row]?.[moveCell!.col]).toBe(0);
  });

  it("rejects notes on filled cells", () => {
    const generated = generateSudoku({ difficulty: "easy", seed: "puzzlehub-note-test" });
    const state = createInitialSudokuState(generated.puzzle);
    const editableCell = generated.puzzle.grid
      .flatMap((row, rowIndex) =>
        row.map((value, colIndex) => ({
          row: rowIndex,
          col: colIndex,
          value,
          given: generated.puzzle.givens[rowIndex]?.[colIndex] ?? false,
        })),
      )
      .find((cell) => !cell.given);

    expect(editableCell).toBeDefined();

    const correctValue = generated.solution.grid[editableCell!.row]?.[editableCell!.col];
    expect(correctValue).toSatisfy(isSudokuDigit);

    const filled = applySudokuMove(generated.puzzle, generated.solution, state, {
      row: editableCell!.row,
      col: editableCell!.col,
      value: correctValue as SudokuDigit,
      mode: "answer",
    });

    const noteResult = applySudokuMove(generated.puzzle, generated.solution, filled.state, {
      row: editableCell!.row,
      col: editableCell!.col,
      value: 1,
      mode: "note",
    });

    expect(noteResult.accepted).toBe(false);
    expect(noteResult.reason).toBe("Cannot add notes to a filled cell.");
    expect(noteResult.state.notes[editableCell!.row]?.[editableCell!.col]).toEqual([]);
  });

  it("toggles notes in order and clears them when a cell is answered or erased", () => {
    const generated = generateSudoku({ difficulty: "easy", seed: "puzzlehub-note-toggle-test" });
    const state = createInitialSudokuState(generated.puzzle);
    const editableCell = generated.puzzle.grid
      .flatMap((row, rowIndex) =>
        row.map((value, colIndex) => ({
          row: rowIndex,
          col: colIndex,
          value,
          given: generated.puzzle.givens[rowIndex]?.[colIndex] ?? false,
        })),
      )
      .find((cell) => !cell.given);

    expect(editableCell).toBeDefined();

    const withFive = applySudokuMove(generated.puzzle, generated.solution, state, {
      row: editableCell!.row,
      col: editableCell!.col,
      value: 5,
      mode: "note",
    });
    const withTwo = applySudokuMove(generated.puzzle, generated.solution, withFive.state, {
      row: editableCell!.row,
      col: editableCell!.col,
      value: 2,
      mode: "note",
    });
    const withoutFive = applySudokuMove(generated.puzzle, generated.solution, withTwo.state, {
      row: editableCell!.row,
      col: editableCell!.col,
      value: 5,
      mode: "note",
    });

    expect(withFive.accepted).toBe(true);
    expect(withTwo.state.notes[editableCell!.row]?.[editableCell!.col]).toEqual([2, 5]);
    expect(withoutFive.state.notes[editableCell!.row]?.[editableCell!.col]).toEqual([2]);

    const correctValue = generated.solution.grid[editableCell!.row]?.[editableCell!.col];
    expect(correctValue).toSatisfy(isSudokuDigit);

    const answered = applySudokuMove(generated.puzzle, generated.solution, withoutFive.state, {
      row: editableCell!.row,
      col: editableCell!.col,
      value: correctValue as SudokuDigit,
      mode: "answer",
    });
    const erased = applySudokuMove(generated.puzzle, generated.solution, answered.state, {
      row: editableCell!.row,
      col: editableCell!.col,
      value: null,
      mode: "answer",
    });

    expect(answered.state.grid[editableCell!.row]?.[editableCell!.col]).toBe(correctValue);
    expect(answered.state.notes[editableCell!.row]?.[editableCell!.col]).toEqual([]);
    expect(erased.state.grid[editableCell!.row]?.[editableCell!.col]).toBe(0);
    expect(erased.state.notes[editableCell!.row]?.[editableCell!.col]).toEqual([]);
  });

  it("rejects moves after completion", () => {
    const generated = generateSudoku({
      difficulty: "easy",
      seed: "puzzlehub-completed-move-test",
    });
    const completedState = {
      ...createInitialSudokuState(generated.puzzle),
      grid: generated.solution.grid.map((row) => [...row]),
      status: "completed" as const,
      completedAt: "2026-06-16T12:00:00.000Z",
    };
    const result = applySudokuMove(generated.puzzle, generated.solution, completedState, {
      row: 0,
      col: 0,
      value: null,
      mode: "answer",
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("Cannot move after completion.");
    expect(result.state).toBe(completedState);
  });
});
