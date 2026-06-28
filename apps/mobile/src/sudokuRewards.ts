import { difficultyMultipliers, type Difficulty } from "@puzzlehub/game-core";

export type SudokuMedal = "bronze" | "silver" | "gold";

export const sudokuAchievementIds = [
  "first_solve",
  "first_daily",
  "no_mistake_solve",
  "streak_3",
  "streak_7",
  "hard_completed",
] as const;

export type SudokuAchievementId = (typeof sudokuAchievementIds)[number];

export interface LocalSudokuCompletionInput {
  gameId: string;
  difficulty: Difficulty;
  score: number;
  elapsedSeconds: number;
  mistakes: number;
  hintsUsed: number;
  completedAt: string;
  isDaily: boolean;
}

export interface LocalSudokuCompletion extends LocalSudokuCompletionInput {
  completionId: string;
  xp: number;
  medal: SudokuMedal;
}

export interface LocalSudokuStats {
  gamesCompleted: number;
  totalXp: number;
  totalScore: number;
  bestScore: number | null;
  bestTimeSeconds: number | null;
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
}

export interface LocalSudokuAchievement {
  achievementId: SudokuAchievementId;
  unlockedAt: string;
}

export interface LocalSudokuPersonalRecords {
  firstCompletion: boolean;
  newBestScore: boolean;
  newBestTime: boolean;
  flawless: boolean;
  newLongestStreak: boolean;
}

export interface LocalSudokuRewardResult {
  completion: LocalSudokuCompletion;
  stats: LocalSudokuStats;
  unlockedAchievementIds: SudokuAchievementId[];
  personalRecords: LocalSudokuPersonalRecords;
  recorded: boolean;
}

export interface LocalSudokuProgress {
  achievements: LocalSudokuAchievement[];
  completions: LocalSudokuCompletion[];
  latestCompletion: LocalSudokuCompletion | null;
  medalCounts: Record<SudokuMedal, number>;
  stats: LocalSudokuStats;
}

const xpBaseByDifficulty: Record<Difficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 35,
  expert: 55,
  master: 80,
};

const hardDifficulties = new Set<Difficulty>(["hard", "expert", "master"]);

const emptyPersonalRecords: LocalSudokuPersonalRecords = {
  firstCompletion: false,
  flawless: false,
  newBestScore: false,
  newBestTime: false,
  newLongestStreak: false,
};

export function calculateLocalSudokuXp(input: {
  difficulty: Difficulty;
  score: number;
  hintsUsed: number;
}): number {
  const base = xpBaseByDifficulty[input.difficulty];
  const scoreBonus = Math.floor(Math.max(0, input.score) / 100);

  return Math.max(0, base + scoreBonus - input.hintsUsed * 2);
}

export function calculateSudokuMedal(input: {
  difficulty: Difficulty;
  score: number;
  mistakes: number;
  hintsUsed: number;
}): SudokuMedal {
  const maxScore = 10000 * difficultyMultipliers[input.difficulty];
  const scoreRatio = maxScore <= 0 ? 0 : input.score / maxScore;

  if (scoreRatio >= 0.85 && input.mistakes === 0 && input.hintsUsed === 0) {
    return "gold";
  }

  if (scoreRatio >= 0.65 && input.mistakes <= 2 && input.hintsUsed <= 1) {
    return "silver";
  }

  return "bronze";
}

export function createLocalSudokuCompletion(
  input: LocalSudokuCompletionInput,
): LocalSudokuCompletion {
  const xp = calculateLocalSudokuXp({
    difficulty: input.difficulty,
    score: input.score,
    hintsUsed: input.hintsUsed,
  });
  const medal = calculateSudokuMedal({
    difficulty: input.difficulty,
    score: input.score,
    mistakes: input.mistakes,
    hintsUsed: input.hintsUsed,
  });

  return {
    ...input,
    completionId: `sudoku-completion:${input.gameId}`,
    medal,
    xp,
  };
}

function byCompletedAt(left: LocalSudokuCompletion, right: LocalSudokuCompletion): number {
  return left.completedAt.localeCompare(right.completedAt);
}

function addUtcDay(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);

  return next.toISOString().slice(0, 10);
}

function streakDate(completedAt: string): string {
  return completedAt.slice(0, 10);
}

export function replayLocalSudokuStats(completions: LocalSudokuCompletion[]): LocalSudokuStats {
  const sorted = [...completions].sort(byCompletedAt);
  let currentStreak = 0;
  let longestStreak = 0;
  let lastPlayedDate: string | null = null;

  for (const completion of sorted) {
    const playedDate = streakDate(completion.completedAt);

    if (lastPlayedDate === null) {
      currentStreak = 1;
      lastPlayedDate = playedDate;
    } else if (playedDate === lastPlayedDate) {
      // Multiple completions on the same day count as progress, but do not
      // advance the streak.
    } else if (playedDate === addUtcDay(lastPlayedDate)) {
      currentStreak += 1;
      lastPlayedDate = playedDate;
    } else if (playedDate > lastPlayedDate) {
      currentStreak = 1;
      lastPlayedDate = playedDate;
    }

    longestStreak = Math.max(longestStreak, currentStreak);
  }

  return {
    gamesCompleted: sorted.length,
    totalXp: sorted.reduce((total, completion) => total + completion.xp, 0),
    totalScore: sorted.reduce((total, completion) => total + completion.score, 0),
    bestScore:
      sorted.length === 0 ? null : Math.max(...sorted.map((completion) => completion.score)),
    bestTimeSeconds:
      sorted.length === 0
        ? null
        : Math.min(...sorted.map((completion) => completion.elapsedSeconds)),
    currentStreak,
    longestStreak,
    lastPlayedDate,
  };
}

export function evaluateLocalSudokuAchievements(
  completions: LocalSudokuCompletion[],
): LocalSudokuAchievement[] {
  const unlocked = new Map<SudokuAchievementId, string>();
  const unlock = (achievementId: SudokuAchievementId, unlockedAt: string): void => {
    if (!unlocked.has(achievementId)) {
      unlocked.set(achievementId, unlockedAt);
    }
  };

  let streak = 0;
  let lastPlayedDate: string | null = null;

  for (const completion of [...completions].sort(byCompletedAt)) {
    const playedDate = streakDate(completion.completedAt);

    if (lastPlayedDate === null || playedDate > lastPlayedDate) {
      if (lastPlayedDate !== null && playedDate === addUtcDay(lastPlayedDate)) {
        streak += 1;
      } else {
        streak = 1;
      }
      lastPlayedDate = playedDate;
    }

    unlock("first_solve", completion.completedAt);

    if (completion.isDaily) {
      unlock("first_daily", completion.completedAt);
    }

    if (completion.mistakes === 0) {
      unlock("no_mistake_solve", completion.completedAt);
    }

    if (hardDifficulties.has(completion.difficulty)) {
      unlock("hard_completed", completion.completedAt);
    }

    if (streak >= 3) {
      unlock("streak_3", completion.completedAt);
    }

    if (streak >= 7) {
      unlock("streak_7", completion.completedAt);
    }
  }

  return [...unlocked.entries()].map(([achievementId, unlockedAt]) => ({
    achievementId,
    unlockedAt,
  }));
}

export function summarizeLocalSudokuProgress(
  completions: LocalSudokuCompletion[],
): LocalSudokuProgress {
  const sorted = [...completions].sort(byCompletedAt);
  const medalCounts: Record<SudokuMedal, number> = {
    bronze: 0,
    gold: 0,
    silver: 0,
  };

  for (const completion of sorted) {
    medalCounts[completion.medal] += 1;
  }

  return {
    achievements: evaluateLocalSudokuAchievements(sorted),
    completions: sorted,
    latestCompletion: sorted.at(-1) ?? null,
    medalCounts,
    stats: replayLocalSudokuStats(sorted),
  };
}

export function applyLocalSudokuCompletion(
  existingCompletions: LocalSudokuCompletion[],
  input: LocalSudokuCompletionInput,
): LocalSudokuRewardResult {
  const duplicate = existingCompletions.find((completion) => completion.gameId === input.gameId);

  if (duplicate) {
    return {
      completion: duplicate,
      stats: replayLocalSudokuStats(existingCompletions),
      unlockedAchievementIds: [],
      personalRecords: emptyPersonalRecords,
      recorded: false,
    };
  }

  const previousStats = replayLocalSudokuStats(existingCompletions);
  const previousAchievements = new Set(
    evaluateLocalSudokuAchievements(existingCompletions).map(
      (achievement) => achievement.achievementId,
    ),
  );
  const completion = createLocalSudokuCompletion(input);
  const nextCompletions = [...existingCompletions, completion];
  const stats = replayLocalSudokuStats(nextCompletions);
  const achievements = evaluateLocalSudokuAchievements(nextCompletions);

  return {
    completion,
    stats,
    unlockedAchievementIds: achievements
      .map((achievement) => achievement.achievementId)
      .filter((achievementId) => !previousAchievements.has(achievementId)),
    personalRecords: {
      firstCompletion: previousStats.gamesCompleted === 0,
      flawless: completion.mistakes === 0,
      newBestScore: previousStats.bestScore === null || completion.score > previousStats.bestScore,
      newBestTime:
        previousStats.bestTimeSeconds === null ||
        completion.elapsedSeconds < previousStats.bestTimeSeconds,
      newLongestStreak: stats.longestStreak > previousStats.longestStreak,
    },
    recorded: true,
  };
}
