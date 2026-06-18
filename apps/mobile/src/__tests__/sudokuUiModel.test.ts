import { describe, expect, it } from "vitest";
import type { SudokuGrid } from "@puzzlehub/sudoku-engine";
import {
  deriveSudokuSyncStatus,
  getSudokuCellUiState,
  getSudokuDigitUiState,
} from "../sudokuUiModel";

const emptyGivens = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => false));

describe("deriveSudokuSyncStatus", () => {
  it("prioritises conflicts over pending and offline state", () => {
    expect(deriveSudokuSyncStatus({ pendingCount: 3, conflictCount: 2, offline: true })).toEqual({
      tone: "conflict",
      messageKey: "status.conflict",
      count: 2,
      hasConflict: true,
    });
  });

  it("reports synced when nothing is pending or conflicting", () => {
    expect(deriveSudokuSyncStatus({ pendingCount: 0, conflictCount: 0, offline: false })).toEqual({
      tone: "synced",
      messageKey: "status.synced",
      count: 0,
      hasConflict: false,
    });
  });

  it("distinguishes offline waiting from online pending", () => {
    expect(
      deriveSudokuSyncStatus({ pendingCount: 4, conflictCount: 0, offline: true }),
    ).toMatchObject({ tone: "waiting", messageKey: "status.waiting", count: 4 });
    expect(
      deriveSudokuSyncStatus({ pendingCount: 4, conflictCount: 0, offline: false }),
    ).toMatchObject({ tone: "pending", messageKey: "status.pending", count: 4 });
  });
});

describe("sudoku UI model", () => {
  it("marks only the selected cell, not the whole row, column, or box", () => {
    const selectedCell = { row: 4, col: 4 };

    expect(
      getSudokuCellUiState({
        col: 4,
        givens: emptyGivens,
        incorrectCell: null,
        row: 4,
        selectedCell,
      }).isSelected,
    ).toBe(true);
    expect(
      getSudokuCellUiState({
        col: 1,
        givens: emptyGivens,
        incorrectCell: null,
        row: 4,
        selectedCell,
      }).isSelected,
    ).toBe(false);
    expect(
      getSudokuCellUiState({
        col: 4,
        givens: emptyGivens,
        incorrectCell: null,
        row: 1,
        selectedCell,
      }).isSelected,
    ).toBe(false);
    expect(
      getSudokuCellUiState({
        col: 3,
        givens: emptyGivens,
        incorrectCell: null,
        row: 3,
        selectedCell,
      }).isSelected,
    ).toBe(false);
  });

  it("keeps incorrect feedback scoped to the current mistake cell", () => {
    const incorrectCell = { row: 8, col: 0 };

    expect(
      getSudokuCellUiState({
        col: 0,
        givens: emptyGivens,
        incorrectCell,
        row: 8,
        selectedCell: null,
      }).isIncorrect,
    ).toBe(true);
    expect(
      getSudokuCellUiState({
        col: 1,
        givens: emptyGivens,
        incorrectCell,
        row: 8,
        selectedCell: null,
      }).isIncorrect,
    ).toBe(false);
  });

  it("builds stable cell automation ids", () => {
    const cellState = getSudokuCellUiState({
      col: 6,
      givens: emptyGivens,
      incorrectCell: null,
      row: 2,
      selectedCell: null,
    });

    expect(cellState.testID).toBe("sudoku-cell-2-6");
    expect(cellState.accessibilityLabel).toBe("Sudoku cell 3 7");
  });

  it("does not expose keypad remaining labels or badges", () => {
    const grid: SudokuGrid = [
      [5, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 5, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 5, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 5, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 5, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 5, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 5, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 5],
    ];

    const digitState = getSudokuDigitUiState({
      digit: 5,
      grid,
      isNoteMode: false,
      selectedCellNotes: [],
      selectedCellValue: 5,
    });

    expect(digitState).toMatchObject({
      accessibilityLabel: "Sudoku digit 5",
      digit: 5,
      isActiveDigit: true,
      isComplete: true,
      testID: "sudoku-digit-5",
    });
    expect("remaining" in digitState).toBe(false);
  });

  it("uses notes to activate a keypad digit only while note mode is active", () => {
    const grid: SudokuGrid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));

    expect(
      getSudokuDigitUiState({
        digit: 7,
        grid,
        isNoteMode: true,
        selectedCellNotes: [7],
        selectedCellValue: 0,
      }).isActiveDigit,
    ).toBe(true);
    expect(
      getSudokuDigitUiState({
        digit: 7,
        grid,
        isNoteMode: false,
        selectedCellNotes: [7],
        selectedCellValue: 0,
      }).isActiveDigit,
    ).toBe(false);
  });
});
