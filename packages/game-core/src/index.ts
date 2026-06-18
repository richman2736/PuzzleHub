export const gameTypes = ["sudoku", "block", "word", "sort", "nonogram"] as const;
export type GameType = (typeof gameTypes)[number];

export const difficulties = ["easy", "medium", "hard", "expert", "master"] as const;
export type Difficulty = (typeof difficulties)[number];

export type GameStatus = "not_started" | "active" | "paused" | "completed" | "abandoned";

export interface PuzzleEnvelope<TPuzzleData = unknown> {
  id: string;
  gameType: GameType;
  difficulty: Difficulty;
  seed: string;
  puzzleData: TPuzzleData;
  createdAt: string;
}

export interface MoveResult<TState = unknown> {
  accepted: boolean;
  correct?: boolean;
  reason?: string;
  state: TState;
}

export interface Hint<TMove = unknown> {
  move: TMove;
  reason: string;
}

export interface ScoreInput {
  difficulty: Difficulty;
  elapsedSeconds: number;
  mistakes: number;
  hintsUsed: number;
}

export interface ScoreBreakdown {
  score: number;
  baseScore: number;
  timePenalty: number;
  mistakePenalty: number;
  hintPenalty: number;
  difficultyMultiplier: number;
}

export interface GameEngine<TPuzzle, TSolution, TState, TMove> {
  generatePuzzle(options?: { difficulty?: Difficulty; seed?: string }): {
    puzzle: TPuzzle;
    solution: TSolution;
  };
  createInitialState(puzzle: TPuzzle): TState;
  validateMove(
    puzzle: TPuzzle,
    solution: TSolution,
    state: TState,
    move: TMove,
  ): MoveResult<TState>;
  getHint(puzzle: TPuzzle, solution: TSolution, state: TState): Hint<TMove> | null;
  checkWin(solution: TSolution, state: TState): boolean;
  calculateScore(input: ScoreInput): ScoreBreakdown;
}

export interface RandomSource {
  (): number;
}

export function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createSeededRng(seed: string): RandomSource {
  let state = hashSeed(seed);

  if (state === 0) {
    state = 0x6d2b79f5;
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: RandomSource): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = copy[index];
    const swap = copy[swapIndex];

    if (current === undefined || swap === undefined) {
      continue;
    }

    copy[index] = swap;
    copy[swapIndex] = current;
  }

  return copy;
}

export const difficultyMultipliers: Record<Difficulty, number> = {
  easy: 1,
  medium: 1.25,
  hard: 1.6,
  expert: 2.1,
  master: 2.8,
};

export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const baseScore = 10000;
  const difficultyMultiplier = difficultyMultipliers[input.difficulty];
  const timePenalty = Math.max(0, Math.floor(input.elapsedSeconds * 4));
  const mistakePenalty = Math.max(0, input.mistakes * 250);
  const hintPenalty = Math.max(0, input.hintsUsed * 500);
  const rawScore = baseScore * difficultyMultiplier - timePenalty - mistakePenalty - hintPenalty;

  return {
    score: Math.max(100, Math.round(rawScore)),
    baseScore,
    timePenalty,
    mistakePenalty,
    hintPenalty,
    difficultyMultiplier,
  };
}
