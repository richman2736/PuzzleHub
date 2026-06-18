import type { TranslationKey } from "@puzzlehub/i18n";
import type { SudokuDigit, SudokuGrid } from "@puzzlehub/sudoku-engine";

export interface SudokuCellPosition {
  row: number;
  col: number;
}

export interface SudokuCellUiState {
  accessibilityLabel: string;
  isGiven: boolean;
  isIncorrect: boolean;
  isSelected: boolean;
  testID: string;
}

export interface SudokuDigitUiState {
  accessibilityLabel: string;
  digit: SudokuDigit;
  isActiveDigit: boolean;
  isComplete: boolean;
  testID: string;
}

export type SudokuSyncTone = "synced" | "pending" | "waiting" | "conflict";

export interface SudokuSyncStatus {
  tone: SudokuSyncTone;
  messageKey: TranslationKey;
  count: number;
  hasConflict: boolean;
}

// Single source of truth for the sync indicator. Conflicts take priority so the
// player always sees them; otherwise it reports synced / offline-waiting /
// pending. The count feeds the `{count}` interpolation of the chosen key.
export function deriveSudokuSyncStatus({
  pendingCount,
  conflictCount,
  offline,
}: {
  pendingCount: number;
  conflictCount: number;
  offline: boolean;
}): SudokuSyncStatus {
  if (conflictCount > 0) {
    return {
      tone: "conflict",
      messageKey: "status.conflict",
      count: conflictCount,
      hasConflict: true,
    };
  }

  if (pendingCount === 0) {
    return { tone: "synced", messageKey: "status.synced", count: 0, hasConflict: false };
  }

  return offline
    ? { tone: "waiting", messageKey: "status.waiting", count: pendingCount, hasConflict: false }
    : { tone: "pending", messageKey: "status.pending", count: pendingCount, hasConflict: false };
}

export function getSudokuCellTestID(row: number, col: number): string {
  return `sudoku-cell-${row}-${col}`;
}

export function getSudokuDigitTestID(digit: SudokuDigit): string {
  return `sudoku-digit-${digit}`;
}

export function getSudokuCellUiState({
  col,
  givens,
  incorrectCell,
  row,
  selectedCell,
}: {
  col: number;
  givens: boolean[][];
  incorrectCell: SudokuCellPosition | null;
  row: number;
  selectedCell: SudokuCellPosition | null;
}): SudokuCellUiState {
  return {
    accessibilityLabel: `Sudoku cell ${row + 1} ${col + 1}`,
    isGiven: givens[row]?.[col] ?? false,
    isIncorrect: incorrectCell?.row === row && incorrectCell.col === col,
    isSelected: selectedCell?.row === row && selectedCell.col === col,
    testID: getSudokuCellTestID(row, col),
  };
}

export function getSudokuDigitUiState({
  digit,
  grid,
  isNoteMode,
  selectedCellNotes,
  selectedCellValue,
}: {
  digit: SudokuDigit;
  grid: SudokuGrid;
  isNoteMode: boolean;
  selectedCellNotes: SudokuDigit[];
  selectedCellValue: number;
}): SudokuDigitUiState {
  const placed = grid.reduce(
    (total, row) => total + row.filter((value) => value === digit).length,
    0,
  );

  return {
    accessibilityLabel: `Sudoku digit ${digit}`,
    digit,
    isActiveDigit: selectedCellValue === digit || (isNoteMode && selectedCellNotes.includes(digit)),
    isComplete: placed >= 9,
    testID: getSudokuDigitTestID(digit),
  };
}
