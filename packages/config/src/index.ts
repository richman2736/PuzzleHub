import type { Difficulty, GameType } from "@puzzlehub/game-core";

export interface GameCatalogItem {
  type: GameType;
  name: string;
  status: "mvp" | "planned";
  defaultDifficulty: Difficulty;
  dailyChallenge: boolean;
}

export const gameCatalog: GameCatalogItem[] = [
  {
    type: "sudoku",
    name: "Classic Sudoku",
    status: "mvp",
    defaultDifficulty: "medium",
    dailyChallenge: true,
  },
  {
    type: "block",
    name: "Block Puzzle",
    status: "planned",
    defaultDifficulty: "easy",
    dailyChallenge: true,
  },
  {
    type: "sort",
    name: "Sort Puzzle",
    status: "planned",
    defaultDifficulty: "easy",
    dailyChallenge: true,
  },
  {
    type: "word",
    name: "Word Search",
    status: "planned",
    defaultDifficulty: "medium",
    dailyChallenge: true,
  },
  {
    type: "nonogram",
    name: "Nonogram",
    status: "planned",
    defaultDifficulty: "medium",
    dailyChallenge: true,
  },
];

export const themes = ["classic", "dark", "ocean", "forest", "nordic", "neon", "paper"] as const;
export type PuzzleHubTheme = (typeof themes)[number];

export const mvpMilestones = [
  "monorepo",
  "expo-app",
  "worker-api",
  "database-schema",
  "local-storage",
  "sudoku-engine",
  "daily-sudoku",
  "stats-and-streaks",
  "sync",
] as const;
