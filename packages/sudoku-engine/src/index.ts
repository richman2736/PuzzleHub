import {
  calculateScore,
  createSeededRng,
  type Difficulty,
  type GameEngine,
  type Hint,
  type MoveResult,
  type RandomSource,
  shuffle,
  type ScoreBreakdown,
  type ScoreInput,
} from "@puzzlehub/game-core";

export const sudokuDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const sudokuAlgorithmVersion = "sudoku-v1" as const;
export const sudokuRuleVersion = "classic-9x9-v1" as const;

export type SudokuDigit = (typeof sudokuDigits)[number];
export type SudokuCell = SudokuDigit | 0;
export type SudokuGrid = SudokuCell[][];
export type SudokuRatingTechnique =
  | "naked-single"
  | "hidden-single"
  | "locked-candidates"
  | "naked-pair"
  | "naked-triple"
  | "hidden-pair"
  | "hidden-triple"
  | "x-wing"
  | "search";
export type SudokuUnitType = "row" | "column" | "box";

export interface SudokuSeedContract {
  gameType: "sudoku";
  algorithmVersion: typeof sudokuAlgorithmVersion;
  difficulty: Difficulty;
  seed: string;
}

export interface SudokuRatingStep {
  technique: SudokuRatingTechnique;
  row: number;
  col: number;
  value: SudokuDigit;
  unit?: SudokuUnitType;
  unitIndex?: number;
  eliminations?: SudokuCandidateElimination[];
}

export interface SudokuCandidateElimination {
  row: number;
  col: number;
  value: SudokuDigit;
}

export interface SudokuRating {
  difficulty: Difficulty;
  score: number;
  maxTechnique: SudokuRatingTechnique;
  solvedByLogic: boolean;
  steps: SudokuRatingStep[];
  initialClueCount: number;
  unresolvedCells: number;
}

export interface SudokuPuzzle {
  grid: SudokuGrid;
  givens: boolean[][];
  difficulty: Difficulty;
  seed: string;
  algorithmVersion: typeof sudokuAlgorithmVersion;
  ruleVersion: typeof sudokuRuleVersion;
  clueCount: number;
  rating: SudokuRating;
}

export interface SudokuSolution {
  grid: SudokuGrid;
}

export interface SudokuState {
  grid: SudokuGrid;
  notes: SudokuDigit[][][];
  status: "active" | "paused" | "completed";
  mistakes: number;
  hintsUsed: number;
  elapsedSeconds: number;
  startedAt: string;
  pausedAt?: string;
  completedAt?: string;
}

export interface SudokuMove {
  row: number;
  col: number;
  value: SudokuDigit | null;
  mode: "answer" | "note";
}

export interface GeneratedSudoku {
  puzzle: SudokuPuzzle;
  solution: SudokuSolution;
}

export interface SudokuSolveResult {
  solution: SudokuGrid | null;
  solutionCount: number;
}

export interface SudokuGenerationOptions {
  difficulty?: Difficulty;
  seed?: string;
  algorithmVersion?: typeof sudokuAlgorithmVersion;
}

const gridSize = 9;
const boxSize = 3;

type SudokuCandidateGrid = SudokuDigit[][][];

const difficultyProfiles: Record<Difficulty, { targetClues: number }> = {
  easy: { targetClues: 42 },
  medium: { targetClues: 36 },
  hard: { targetClues: 31 },
  expert: { targetClues: 27 },
  master: { targetClues: 24 },
};

export function createEmptyGrid(): SudokuGrid {
  return Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => 0 as SudokuCell),
  );
}

export function cloneGrid(grid: SudokuGrid): SudokuGrid {
  return grid.map((row) => [...row]);
}

export function countSudokuClues(grid: SudokuGrid): number {
  validateGridShape(grid);

  return grid.reduce((total, row) => total + row.filter((value) => value !== 0).length, 0);
}

export function countSudokuEmptyCells(grid: SudokuGrid): number {
  validateGridShape(grid);

  return grid.reduce((total, row) => total + row.filter((value) => value === 0).length, 0);
}

export function createNotesGrid(): SudokuDigit[][][] {
  return Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => [] as SudokuDigit[]),
  );
}

export function isSudokuDigit(value: number): value is SudokuDigit {
  return sudokuDigits.includes(value as SudokuDigit);
}

export function validateGridShape(grid: SudokuGrid): void {
  if (grid.length !== gridSize) {
    throw new Error("Sudoku grid must have 9 rows.");
  }

  for (const row of grid) {
    if (row.length !== gridSize) {
      throw new Error("Each Sudoku row must have 9 cells.");
    }

    for (const value of row) {
      if (value !== 0 && !isSudokuDigit(value)) {
        throw new Error("Sudoku cells must be empty or a digit from 1 to 9.");
      }
    }
  }
}

export function isPlacementValid(
  grid: SudokuGrid,
  row: number,
  col: number,
  value: SudokuDigit,
): boolean {
  for (let index = 0; index < gridSize; index += 1) {
    if (index !== col && grid[row]?.[index] === value) {
      return false;
    }

    if (index !== row && grid[index]?.[col] === value) {
      return false;
    }
  }

  const boxRow = Math.floor(row / boxSize) * boxSize;
  const boxCol = Math.floor(col / boxSize) * boxSize;

  for (let rowOffset = 0; rowOffset < boxSize; rowOffset += 1) {
    for (let colOffset = 0; colOffset < boxSize; colOffset += 1) {
      const checkRow = boxRow + rowOffset;
      const checkCol = boxCol + colOffset;

      if ((checkRow !== row || checkCol !== col) && grid[checkRow]?.[checkCol] === value) {
        return false;
      }
    }
  }

  return true;
}

export function isGridConsistent(grid: SudokuGrid): boolean {
  validateGridShape(grid);

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const value = grid[row]?.[col];

      if (value !== undefined && value !== 0 && !isPlacementValid(grid, row, col, value)) {
        return false;
      }
    }
  }

  return true;
}

export function getCandidates(grid: SudokuGrid, row: number, col: number): SudokuDigit[] {
  if (grid[row]?.[col] !== 0) {
    return [];
  }

  return sudokuDigits.filter((digit) => isPlacementValid(grid, row, col, digit));
}

function createCandidateGrid(grid: SudokuGrid): SudokuCandidateGrid {
  return Array.from({ length: gridSize }, (_, row) =>
    Array.from({ length: gridSize }, (_, col) => getCandidates(grid, row, col)),
  );
}

function getBoxIndex(row: number, col: number): number {
  return Math.floor(row / boxSize) * boxSize + Math.floor(col / boxSize);
}

function removeCandidate(
  candidateGrid: SudokuCandidateGrid,
  row: number,
  col: number,
  value: SudokuDigit,
): boolean {
  const candidates = candidateGrid[row]?.[col];

  if (candidates === undefined || !candidates.includes(value)) {
    return false;
  }

  candidateGrid[row]![col] = candidates.filter((candidate) => candidate !== value);
  return true;
}

function findBestEmptyCell(
  grid: SudokuGrid,
): { row: number; col: number; candidates: SudokuDigit[] } | null {
  let best: { row: number; col: number; candidates: SudokuDigit[] } | null = null;

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      if (grid[row]?.[col] !== 0) {
        continue;
      }

      const candidates = getCandidates(grid, row, col);

      if (candidates.length === 0) {
        return { row, col, candidates };
      }

      if (best === null || candidates.length < best.candidates.length) {
        best = { row, col, candidates };
      }
    }
  }

  return best;
}

export function solveSudoku(inputGrid: SudokuGrid, maxSolutions = 1): SudokuSolveResult {
  validateGridShape(inputGrid);

  if (!isGridConsistent(inputGrid)) {
    return { solution: null, solutionCount: 0 };
  }

  const grid = cloneGrid(inputGrid);
  let solution: SudokuGrid | null = null;
  let solutionCount = 0;

  const search = (): void => {
    if (solutionCount >= maxSolutions) {
      return;
    }

    const cell = findBestEmptyCell(grid);

    if (cell === null) {
      solutionCount += 1;
      solution ??= cloneGrid(grid);
      return;
    }

    if (cell.candidates.length === 0) {
      return;
    }

    for (const candidate of cell.candidates) {
      grid[cell.row]![cell.col] = candidate;
      search();
      grid[cell.row]![cell.col] = 0;

      if (solutionCount >= maxSolutions) {
        return;
      }
    }
  };

  search();

  return { solution, solutionCount };
}

export function countSolutions(inputGrid: SudokuGrid, limit = 2): number {
  return solveSudoku(inputGrid, limit).solutionCount;
}

export function hasUniqueSudokuSolution(inputGrid: SudokuGrid): boolean {
  return countSolutions(inputGrid, 2) === 1;
}

function fillGrid(grid: SudokuGrid, rng: RandomSource): boolean {
  const cell = findBestEmptyCell(grid);

  if (cell === null) {
    return true;
  }

  if (cell.candidates.length === 0) {
    return false;
  }

  for (const candidate of shuffle(cell.candidates, rng)) {
    grid[cell.row]![cell.col] = candidate;

    if (fillGrid(grid, rng)) {
      return true;
    }

    grid[cell.row]![cell.col] = 0;
  }

  return false;
}

export function generateSolvedGrid(seed: string): SudokuGrid {
  const rng = createSeededRng(seed);
  const grid = createEmptyGrid();

  if (!fillGrid(grid, rng)) {
    throw new Error("Unable to generate a solved Sudoku grid.");
  }

  return grid;
}

export function createSudokuSeedContract(
  options: SudokuGenerationOptions = {},
): SudokuSeedContract {
  return {
    gameType: "sudoku",
    algorithmVersion: options.algorithmVersion ?? sudokuAlgorithmVersion,
    difficulty: options.difficulty ?? "easy",
    seed: options.seed ?? createDefaultSeed(),
  };
}

export function createSudokuSeedKey(
  contract: SudokuSeedContract,
  scope: "solution" | "remove",
): string {
  return `${contract.gameType}:${contract.algorithmVersion}:${contract.difficulty}:${contract.seed}:${scope}`;
}

function findNakedSingle(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
): SudokuRatingStep | null {
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      if (grid[row]?.[col] !== 0) {
        continue;
      }

      const candidates = candidateGrid[row]?.[col] ?? [];

      if (candidates.length !== 1) {
        continue;
      }

      const value = candidates[0];

      if (value === undefined) {
        continue;
      }

      return {
        technique: "naked-single",
        row,
        col,
        value,
      };
    }
  }

  return null;
}

function getUnitCells(
  unit: SudokuUnitType,
  unitIndex: number,
): Array<{ row: number; col: number }> {
  if (unit === "row") {
    return Array.from({ length: gridSize }, (_, col) => ({ row: unitIndex, col }));
  }

  if (unit === "column") {
    return Array.from({ length: gridSize }, (_, row) => ({ row, col: unitIndex }));
  }

  const boxRow = Math.floor(unitIndex / boxSize) * boxSize;
  const boxCol = (unitIndex % boxSize) * boxSize;
  const cells: Array<{ row: number; col: number }> = [];

  for (let rowOffset = 0; rowOffset < boxSize; rowOffset += 1) {
    for (let colOffset = 0; colOffset < boxSize; colOffset += 1) {
      cells.push({ row: boxRow + rowOffset, col: boxCol + colOffset });
    }
  }

  return cells;
}

function findHiddenSingleInUnit(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
  unit: SudokuUnitType,
  unitIndex: number,
): SudokuRatingStep | null {
  const cells = getUnitCells(unit, unitIndex);

  for (const digit of sudokuDigits) {
    let match: { row: number; col: number } | null = null;
    let matchCount = 0;

    for (const cell of cells) {
      if (grid[cell.row]?.[cell.col] !== 0) {
        continue;
      }

      if (!(candidateGrid[cell.row]?.[cell.col] ?? []).includes(digit)) {
        continue;
      }

      match = cell;
      matchCount += 1;

      if (matchCount > 1) {
        break;
      }
    }

    if (matchCount === 1 && match !== null) {
      return {
        technique: "hidden-single",
        row: match.row,
        col: match.col,
        value: digit,
        unit,
        unitIndex,
      };
    }
  }

  return null;
}

function findHiddenSingle(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
): SudokuRatingStep | null {
  const units = ["row", "column", "box"] as const;

  for (const unit of units) {
    for (let unitIndex = 0; unitIndex < gridSize; unitIndex += 1) {
      const step = findHiddenSingleInUnit(grid, candidateGrid, unit, unitIndex);

      if (step !== null) {
        return step;
      }
    }
  }

  return null;
}

function findCandidateCellsInUnit(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
  cells: Array<{ row: number; col: number }>,
  digit: SudokuDigit,
): Array<{ row: number; col: number }> {
  return cells.filter(
    (cell) =>
      grid[cell.row]?.[cell.col] === 0 &&
      (candidateGrid[cell.row]?.[cell.col] ?? []).includes(digit),
  );
}

function createLockedCandidateStep({
  digit,
  eliminations,
  unit,
  unitIndex,
}: {
  digit: SudokuDigit;
  eliminations: SudokuCandidateElimination[];
  unit: SudokuUnitType;
  unitIndex: number;
}): SudokuRatingStep | null {
  const firstElimination = eliminations[0];

  if (firstElimination === undefined) {
    return null;
  }

  return {
    technique: "locked-candidates",
    row: firstElimination.row,
    col: firstElimination.col,
    value: digit,
    unit,
    unitIndex,
    eliminations,
  };
}

function findLockedCandidatesFromBox(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
): SudokuRatingStep | null {
  for (let boxIndex = 0; boxIndex < gridSize; boxIndex += 1) {
    const boxCells = getUnitCells("box", boxIndex);

    for (const digit of sudokuDigits) {
      const matches = findCandidateCellsInUnit(grid, candidateGrid, boxCells, digit);

      if (matches.length < 2) {
        continue;
      }

      const firstRow = matches[0]?.row;
      const firstCol = matches[0]?.col;

      if (firstRow !== undefined && matches.every((cell) => cell.row === firstRow)) {
        const eliminations = getUnitCells("row", firstRow)
          .filter((cell) => getBoxIndex(cell.row, cell.col) !== boxIndex)
          .filter((cell) => (candidateGrid[cell.row]?.[cell.col] ?? []).includes(digit))
          .map((cell) => ({ ...cell, value: digit }));
        const step = createLockedCandidateStep({
          digit,
          eliminations,
          unit: "box",
          unitIndex: boxIndex,
        });

        if (step !== null) {
          return step;
        }
      }

      if (firstCol !== undefined && matches.every((cell) => cell.col === firstCol)) {
        const eliminations = getUnitCells("column", firstCol)
          .filter((cell) => getBoxIndex(cell.row, cell.col) !== boxIndex)
          .filter((cell) => (candidateGrid[cell.row]?.[cell.col] ?? []).includes(digit))
          .map((cell) => ({ ...cell, value: digit }));
        const step = createLockedCandidateStep({
          digit,
          eliminations,
          unit: "box",
          unitIndex: boxIndex,
        });

        if (step !== null) {
          return step;
        }
      }
    }
  }

  return null;
}

function findLockedCandidatesFromLine(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
  unit: "row" | "column",
): SudokuRatingStep | null {
  for (let unitIndex = 0; unitIndex < gridSize; unitIndex += 1) {
    const lineCells = getUnitCells(unit, unitIndex);

    for (const digit of sudokuDigits) {
      const matches = findCandidateCellsInUnit(grid, candidateGrid, lineCells, digit);

      if (matches.length < 2) {
        continue;
      }

      const firstMatch = matches[0];

      if (
        firstMatch === undefined ||
        !matches.every(
          (cell) => getBoxIndex(cell.row, cell.col) === getBoxIndex(firstMatch.row, firstMatch.col),
        )
      ) {
        continue;
      }

      const boxIndex = getBoxIndex(firstMatch.row, firstMatch.col);
      const eliminations = getUnitCells("box", boxIndex)
        .filter((cell) => (unit === "row" ? cell.row !== unitIndex : cell.col !== unitIndex))
        .filter((cell) => (candidateGrid[cell.row]?.[cell.col] ?? []).includes(digit))
        .map((cell) => ({ ...cell, value: digit }));
      const step = createLockedCandidateStep({
        digit,
        eliminations,
        unit,
        unitIndex,
      });

      if (step !== null) {
        return step;
      }
    }
  }

  return null;
}

function findLockedCandidates(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
): SudokuRatingStep | null {
  return (
    findLockedCandidatesFromBox(grid, candidateGrid) ??
    findLockedCandidatesFromLine(grid, candidateGrid, "row") ??
    findLockedCandidatesFromLine(grid, candidateGrid, "column")
  );
}

const subsetUnits = ["row", "column", "box"] as const;

function combinations<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [[]];
  }

  if (items.length < size) {
    return [];
  }

  const result: T[][] = [];
  const combo: T[] = [];

  const recurse = (start: number): void => {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }

    for (let index = start; index < items.length; index += 1) {
      combo.push(items[index]!);
      recurse(index + 1);
      combo.pop();
    }
  };

  recurse(0);
  return result;
}

function createEliminationStep(
  technique: SudokuRatingTechnique,
  eliminations: SudokuCandidateElimination[],
  unit: SudokuUnitType,
  unitIndex: number,
): SudokuRatingStep | null {
  const firstElimination = eliminations[0];

  if (firstElimination === undefined) {
    return null;
  }

  return {
    technique,
    row: firstElimination.row,
    col: firstElimination.col,
    value: firstElimination.value,
    unit,
    unitIndex,
    eliminations,
  };
}

function emptyUnitCells(
  grid: SudokuGrid,
  unit: SudokuUnitType,
  unitIndex: number,
): Array<{ row: number; col: number }> {
  return getUnitCells(unit, unitIndex).filter((cell) => grid[cell.row]?.[cell.col] === 0);
}

// Naked pair/triple: `size` cells whose combined candidates are exactly `size`
// digits, letting those digits be eliminated from the rest of the unit. Runs
// after naked singles, so every empty cell already has at least two candidates.
function findNakedSubset(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
  size: number,
): SudokuRatingStep | null {
  const technique: SudokuRatingTechnique = size === 2 ? "naked-pair" : "naked-triple";

  for (const unit of subsetUnits) {
    for (let unitIndex = 0; unitIndex < gridSize; unitIndex += 1) {
      const cells = emptyUnitCells(grid, unit, unitIndex);

      for (const combo of combinations(cells, size)) {
        const union = new Set<SudokuDigit>();

        for (const cell of combo) {
          for (const candidate of candidateGrid[cell.row]?.[cell.col] ?? []) {
            union.add(candidate);
          }
        }

        if (union.size !== size) {
          continue;
        }

        const comboKeys = new Set(combo.map((cell) => `${cell.row},${cell.col}`));
        const eliminations: SudokuCandidateElimination[] = [];

        for (const cell of cells) {
          if (comboKeys.has(`${cell.row},${cell.col}`)) {
            continue;
          }

          for (const value of candidateGrid[cell.row]?.[cell.col] ?? []) {
            if (union.has(value)) {
              eliminations.push({ row: cell.row, col: cell.col, value });
            }
          }
        }

        const step = createEliminationStep(technique, eliminations, unit, unitIndex);

        if (step !== null) {
          return step;
        }
      }
    }
  }

  return null;
}

// Hidden pair/triple: `size` digits confined to exactly `size` cells in a unit,
// letting every other candidate be eliminated from those cells. Runs after
// hidden singles, so each remaining candidate digit appears in at least two cells.
function findHiddenSubset(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
  size: number,
): SudokuRatingStep | null {
  const technique: SudokuRatingTechnique = size === 2 ? "hidden-pair" : "hidden-triple";

  for (const unit of subsetUnits) {
    for (let unitIndex = 0; unitIndex < gridSize; unitIndex += 1) {
      const cells = emptyUnitCells(grid, unit, unitIndex);
      const digitCells = new Map<SudokuDigit, Array<{ row: number; col: number }>>();

      for (const digit of sudokuDigits) {
        const matches = findCandidateCellsInUnit(grid, candidateGrid, cells, digit);

        if (matches.length > 0) {
          digitCells.set(digit, matches);
        }
      }

      const digits = [...digitCells.keys()];

      for (const combo of combinations(digits, size)) {
        const comboDigits = new Set<SudokuDigit>(combo);
        const cellKeys = new Set<string>();

        for (const digit of combo) {
          for (const cell of digitCells.get(digit) ?? []) {
            cellKeys.add(`${cell.row},${cell.col}`);
          }
        }

        if (cellKeys.size !== size) {
          continue;
        }

        const eliminations: SudokuCandidateElimination[] = [];

        for (const key of cellKeys) {
          const [rowText, colText] = key.split(",");
          const row = Number(rowText);
          const col = Number(colText);

          for (const value of candidateGrid[row]?.[col] ?? []) {
            if (!comboDigits.has(value)) {
              eliminations.push({ row, col, value });
            }
          }
        }

        const step = createEliminationStep(technique, eliminations, unit, unitIndex);

        if (step !== null) {
          return step;
        }
      }
    }
  }

  return null;
}

// X-wing: a digit confined to the same two cross-lines across two parallel
// lines, letting it be eliminated from those cross-lines elsewhere.
function findXWingForOrientation(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
  orientation: "row" | "column",
): SudokuRatingStep | null {
  const crossUnit: "row" | "column" = orientation === "row" ? "column" : "row";
  const linePositions: Array<{ lineIndex: number; crossIndices: number[] }> = [];

  for (const digit of sudokuDigits) {
    linePositions.length = 0;

    for (let lineIndex = 0; lineIndex < gridSize; lineIndex += 1) {
      const crossIndices: number[] = [];

      for (const cell of getUnitCells(orientation, lineIndex)) {
        if (grid[cell.row]?.[cell.col] !== 0) {
          continue;
        }

        if (!(candidateGrid[cell.row]?.[cell.col] ?? []).includes(digit)) {
          continue;
        }

        crossIndices.push(orientation === "row" ? cell.col : cell.row);
      }

      if (crossIndices.length === 2) {
        linePositions.push({ lineIndex, crossIndices });
      }
    }

    for (const [first, second] of combinations(linePositions, 2)) {
      if (first === undefined || second === undefined) {
        continue;
      }

      if (
        first.crossIndices[0] !== second.crossIndices[0] ||
        first.crossIndices[1] !== second.crossIndices[1]
      ) {
        continue;
      }

      const lineIndices = new Set([first.lineIndex, second.lineIndex]);
      const eliminations: SudokuCandidateElimination[] = [];

      for (const crossIndex of first.crossIndices) {
        for (const cell of getUnitCells(crossUnit, crossIndex)) {
          const cellLineIndex = orientation === "row" ? cell.row : cell.col;

          if (lineIndices.has(cellLineIndex)) {
            continue;
          }

          if (grid[cell.row]?.[cell.col] !== 0) {
            continue;
          }

          if (!(candidateGrid[cell.row]?.[cell.col] ?? []).includes(digit)) {
            continue;
          }

          eliminations.push({ row: cell.row, col: cell.col, value: digit });
        }
      }

      const step = createEliminationStep("x-wing", eliminations, orientation, first.lineIndex);

      if (step !== null) {
        return step;
      }
    }
  }

  return null;
}

function findXWing(grid: SudokuGrid, candidateGrid: SudokuCandidateGrid): SudokuRatingStep | null {
  return (
    findXWingForOrientation(grid, candidateGrid, "row") ??
    findXWingForOrientation(grid, candidateGrid, "column")
  );
}

function applyRatingPlacement(
  grid: SudokuGrid,
  candidateGrid: SudokuCandidateGrid,
  step: SudokuRatingStep,
): void {
  grid[step.row]![step.col] = step.value;
  candidateGrid[step.row]![step.col] = [];

  for (const cell of [
    ...getUnitCells("row", step.row),
    ...getUnitCells("column", step.col),
    ...getUnitCells("box", getBoxIndex(step.row, step.col)),
  ]) {
    if (grid[cell.row]?.[cell.col] !== 0) {
      continue;
    }

    removeCandidate(candidateGrid, cell.row, cell.col, step.value);
  }
}

function applyCandidateEliminations(
  candidateGrid: SudokuCandidateGrid,
  eliminations: SudokuCandidateElimination[],
): void {
  for (const elimination of eliminations) {
    removeCandidate(candidateGrid, elimination.row, elimination.col, elimination.value);
  }
}

// Difficulty bands keyed to the hardest required technique (see
// `computeRatingScore`). Each technique rank contributes a 100-point base, and
// the bounded detail term keeps a puzzle inside the band its hardest technique
// dictates, so difficulty tracks the solving profile rather than clue count:
//   naked-single                  -> easy
//   hidden-single, locked-cands   -> medium
//   naked pair/triple             -> hard
//   hidden pair/triple            -> expert
//   X-wing, search fallback       -> master
function scoreToDifficulty(score: number): Difficulty {
  if (score < 80) {
    return "easy";
  }

  if (score < 280) {
    return "medium";
  }

  if (score < 480) {
    return "hard";
  }

  if (score < 680) {
    return "expert";
  }

  return "master";
}

// Single difficulty ordering for every solving technique, easiest (0) to
// hardest. `search` is the brute-force fallback used when the implemented logic
// cannot finish, so it ranks above every logical technique. This rank drives
// both the max-technique selection and the numeric rating score.
const techniqueRank: Record<SudokuRatingTechnique, number> = {
  "naked-single": 0,
  "hidden-single": 1,
  "locked-candidates": 2,
  "naked-pair": 3,
  "naked-triple": 4,
  "hidden-pair": 5,
  "hidden-triple": 6,
  "x-wing": 7,
  search: 8,
};

// The first rank that counts as an "advanced" (non-single) technique. Steps at
// or above this rank reflect real solving effort; singles are baseline filler.
const advancedTechniqueRank = techniqueRank["locked-candidates"];

function getMaxRatingTechnique(
  steps: SudokuRatingStep[],
  unresolvedCells: number,
): SudokuRatingTechnique {
  if (unresolvedCells > 0) {
    return "search";
  }

  let maxTechnique: SudokuRatingTechnique = "naked-single";

  for (const step of steps) {
    if (techniqueRank[step.technique] > techniqueRank[maxTechnique]) {
      maxTechnique = step.technique;
    }
  }

  return maxTechnique;
}

// Numeric rating derived from the solving profile, not clue count:
//   base       - the hardest required technique anchors the difficulty band
//                (rank * 100, so each technique tier owns a 100-point band).
//   detail     - bounded effort term from how many advanced steps and singles
//                were needed; capped below half the band gap so step count only
//                breaks ties inside a band, never promotes to a harder one.
//   branching  - when logic stalls, each cell left for brute-force search adds
//                cost, capturing dependency/branching depth at the top end.
function computeRatingScore(
  steps: SudokuRatingStep[],
  maxTechnique: SudokuRatingTechnique,
  unresolvedCells: number,
): number {
  const base = techniqueRank[maxTechnique] * 100;

  let advancedStepCount = 0;
  let singleStepCount = 0;

  for (const step of steps) {
    if (techniqueRank[step.technique] >= advancedTechniqueRank) {
      advancedStepCount += 1;
    } else {
      singleStepCount += 1;
    }
  }

  const detail = Math.min(49, advancedStepCount * 4 + Math.min(20, singleStepCount));
  const branching = unresolvedCells * 6;

  return base + detail + branching;
}

export function rateSudokuPuzzle(inputGrid: SudokuGrid): SudokuRating {
  validateGridShape(inputGrid);

  const grid = cloneGrid(inputGrid);
  const candidateGrid = createCandidateGrid(grid);
  const initialClueCount = countSudokuClues(grid);
  const steps: SudokuRatingStep[] = [];

  while (true) {
    const placementStep =
      findNakedSingle(grid, candidateGrid) ?? findHiddenSingle(grid, candidateGrid);

    if (placementStep !== null) {
      applyRatingPlacement(grid, candidateGrid, placementStep);
      steps.push(placementStep);
      continue;
    }

    const eliminationStep =
      findLockedCandidates(grid, candidateGrid) ??
      findNakedSubset(grid, candidateGrid, 2) ??
      findNakedSubset(grid, candidateGrid, 3) ??
      findHiddenSubset(grid, candidateGrid, 2) ??
      findHiddenSubset(grid, candidateGrid, 3) ??
      findXWing(grid, candidateGrid);

    if (eliminationStep !== null) {
      applyCandidateEliminations(candidateGrid, eliminationStep.eliminations ?? []);
      steps.push(eliminationStep);
      continue;
    }

    break;
  }

  const unresolvedCells = countSudokuEmptyCells(grid);
  const maxTechnique = getMaxRatingTechnique(steps, unresolvedCells);
  const score = computeRatingScore(steps, maxTechnique, unresolvedCells);

  return {
    difficulty: scoreToDifficulty(score),
    score,
    maxTechnique,
    solvedByLogic: unresolvedCells === 0 && isSolvedGrid(grid),
    steps,
    initialClueCount,
    unresolvedCells,
  };
}

function createDefaultSeed(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;

  if (typeof cryptoApi?.randomUUID === "function") {
    return `sudoku-${cryptoApi.randomUUID()}`;
  }

  return `sudoku-${Date.now()}`;
}

export function generateSudoku(options: SudokuGenerationOptions = {}): GeneratedSudoku {
  const seedContract = createSudokuSeedContract(options);
  const difficulty = seedContract.difficulty;
  const seed = seedContract.seed;
  const rng = createSeededRng(createSudokuSeedKey(seedContract, "remove"));
  const solutionGrid = generateSolvedGrid(createSudokuSeedKey(seedContract, "solution"));
  const puzzleGrid = cloneGrid(solutionGrid);
  const targetClues = difficultyProfiles[difficulty].targetClues;
  const positions = shuffle(
    Array.from({ length: gridSize * gridSize }, (_, index) => index),
    rng,
  );
  let clueCount = gridSize * gridSize;

  for (const position of positions) {
    if (clueCount <= targetClues) {
      break;
    }

    const row = Math.floor(position / gridSize);
    const col = position % gridSize;
    const previous = puzzleGrid[row]![col]!;

    puzzleGrid[row]![col] = 0;

    if (!hasUniqueSudokuSolution(puzzleGrid)) {
      puzzleGrid[row]![col] = previous;
      continue;
    }

    clueCount -= 1;
  }

  return {
    puzzle: {
      grid: puzzleGrid,
      givens: puzzleGrid.map((row) => row.map((value) => value !== 0)),
      difficulty,
      seed,
      algorithmVersion: seedContract.algorithmVersion,
      ruleVersion: sudokuRuleVersion,
      clueCount,
      rating: rateSudokuPuzzle(puzzleGrid),
    },
    solution: {
      grid: solutionGrid,
    },
  };
}

export function createInitialSudokuState(puzzle: SudokuPuzzle): SudokuState {
  return {
    grid: cloneGrid(puzzle.grid),
    notes: createNotesGrid(),
    status: "active",
    mistakes: 0,
    hintsUsed: 0,
    elapsedSeconds: 0,
    startedAt: new Date().toISOString(),
  };
}

export function applySudokuMove(
  puzzle: SudokuPuzzle,
  solution: SudokuSolution,
  state: SudokuState,
  move: SudokuMove,
): MoveResult<SudokuState> {
  if (state.status === "paused") {
    return { accepted: false, reason: "Cannot move while paused.", state };
  }

  if (state.status === "completed") {
    return { accepted: false, reason: "Cannot move after completion.", state };
  }

  if (move.row < 0 || move.row >= gridSize || move.col < 0 || move.col >= gridSize) {
    return { accepted: false, reason: "Move is outside the board.", state };
  }

  if (puzzle.givens[move.row]?.[move.col]) {
    return { accepted: false, reason: "Cannot edit a given cell.", state };
  }

  const nextState: SudokuState = {
    ...state,
    grid: cloneGrid(state.grid),
    notes: state.notes.map((row) => row.map((notes) => [...notes])),
  };

  if (move.mode === "note") {
    if (state.grid[move.row]?.[move.col] !== 0) {
      return { accepted: false, reason: "Cannot add notes to a filled cell.", state };
    }

    if (move.value === null) {
      nextState.notes[move.row]![move.col] = [];
      return { accepted: true, state: nextState };
    }

    const notes = new Set(nextState.notes[move.row]![move.col]);

    if (notes.has(move.value)) {
      notes.delete(move.value);
    } else {
      notes.add(move.value);
    }

    nextState.notes[move.row]![move.col] = [...notes].sort((left, right) => left - right);
    return { accepted: true, state: nextState };
  }

  const correct = move.value === null || solution.grid[move.row]?.[move.col] === move.value;

  if (!correct) {
    nextState.mistakes += 1;
    return { accepted: true, correct, reason: "Incorrect answer.", state: nextState };
  }

  nextState.grid[move.row]![move.col] = move.value ?? 0;
  nextState.notes[move.row]![move.col] = [];

  if (checkSudokuWin(solution, nextState)) {
    nextState.status = "completed";
    nextState.completedAt = new Date().toISOString();
  }

  return { accepted: true, correct, state: nextState };
}

export function tickSudokuTimer(state: SudokuState, seconds = 1): SudokuState {
  if (state.status !== "active" || seconds <= 0) {
    return state;
  }

  return {
    ...state,
    elapsedSeconds: state.elapsedSeconds + Math.floor(seconds),
  };
}

export function pauseSudokuState(
  state: SudokuState,
  pausedAt = new Date().toISOString(),
): SudokuState {
  if (state.status !== "active") {
    return state;
  }

  return {
    ...state,
    status: "paused",
    pausedAt,
  };
}

export function resumeSudokuState(state: SudokuState): SudokuState {
  if (state.status !== "paused") {
    return state;
  }

  const { pausedAt: _pausedAt, ...rest } = state;

  return {
    ...rest,
    status: "active",
  };
}

export function getSudokuHint(
  puzzle: SudokuPuzzle,
  solution: SudokuSolution,
  state: SudokuState,
): Hint<SudokuMove> | null {
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      if (puzzle.givens[row]?.[col]) {
        continue;
      }

      if (state.grid[row]?.[col] !== solution.grid[row]?.[col]) {
        const value = solution.grid[row]?.[col];

        if (value === undefined || value === 0) {
          return null;
        }

        return {
          move: { row, col, value, mode: "answer" },
          reason: "Next unresolved cell",
        };
      }
    }
  }

  return null;
}

export function checkSudokuWin(solution: SudokuSolution, state: SudokuState): boolean {
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      if (state.grid[row]?.[col] !== solution.grid[row]?.[col]) {
        return false;
      }
    }
  }

  return true;
}

export function isSolvedGrid(grid: SudokuGrid): boolean {
  validateGridShape(grid);

  if (!isGridConsistent(grid)) {
    return false;
  }

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const value = grid[row]?.[col];

      if (value === undefined || value === 0) {
        return false;
      }
    }
  }

  return true;
}

export function calculateSudokuScore(input: ScoreInput): ScoreBreakdown {
  return calculateScore(input);
}

export const sudokuEngine: GameEngine<SudokuPuzzle, SudokuSolution, SudokuState, SudokuMove> = {
  generatePuzzle: generateSudoku,
  createInitialState: createInitialSudokuState,
  validateMove: applySudokuMove,
  getHint: getSudokuHint,
  checkWin: checkSudokuWin,
  calculateScore: calculateSudokuScore,
};
