import { type Difficulty } from "@puzzlehub/game-core";
import { sudokuAlgorithmVersion } from "@puzzlehub/sudoku-engine";

export interface LocalDailySudokuDescriptor {
  date: string;
  difficulty: Difficulty;
  gameId: string;
  seed: string;
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatLocalDailyDate(date: Date): string {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1), padDatePart(date.getDate())].join(
    "-",
  );
}

export function getLocalDailySudokuDescriptor(
  date = new Date(),
  difficulty: Difficulty = "easy",
): LocalDailySudokuDescriptor {
  const day = formatLocalDailyDate(date);
  const seed = `local-daily:sudoku:${day}:${difficulty}`;

  return {
    date: day,
    difficulty,
    gameId: `sudoku:${sudokuAlgorithmVersion}:${difficulty}:${seed}`,
    seed,
  };
}
