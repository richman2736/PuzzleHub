import { difficulties, gameTypes, type Difficulty, type GameType } from "@puzzlehub/game-core";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  text(name)
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`);
const nullableTimestamp = (name: string) => text(name);
const gameType = (name: string) => text(name, { enum: gameTypes }).$type<GameType>();
const difficulty = (name: string) => text(name, { enum: difficulties }).$type<Difficulty>();
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name"),
    image: text("image"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    uniqueIndex("accounts_provider_account_idx").on(table.providerId, table.accountId),
  ],
);

export const games = sqliteTable("games", {
  type: gameType("type").primaryKey(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: timestamp("created_at"),
});

export const puzzles = sqliteTable(
  "puzzles",
  {
    id: text("id").primaryKey(),
    gameType: gameType("game_type").notNull(),
    difficulty: difficulty("difficulty").notNull(),
    seed: text("seed").notNull(),
    puzzleData: json<Record<string, unknown>>("puzzle_data").notNull(),
    solutionData: json<Record<string, unknown>>("solution_data").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("puzzles_game_type_difficulty_idx").on(table.gameType, table.difficulty),
    uniqueIndex("puzzles_game_type_seed_idx").on(table.gameType, table.seed),
  ],
);

export const dailyChallenges = sqliteTable(
  "daily_challenges",
  {
    id: text("id").primaryKey(),
    challengeDate: text("challenge_date").notNull(),
    gameType: gameType("game_type").notNull(),
    puzzleId: text("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "cascade" }),
    difficulty: difficulty("difficulty").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("daily_challenges_date_game_type_idx").on(table.challengeDate, table.gameType),
    index("daily_challenges_puzzle_id_idx").on(table.puzzleId),
  ],
);

export const userGameProgress = sqliteTable(
  "user_game_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    puzzleId: text("puzzle_id")
      .notNull()
      .references(() => puzzles.id, { onDelete: "cascade" }),
    stateData: json<Record<string, unknown>>("state_data").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: nullableTimestamp("completed_at"),
    mistakes: integer("mistakes").default(0).notNull(),
    hintsUsed: integer("hints_used").default(0).notNull(),
    score: integer("score").default(0).notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("user_game_progress_user_id_idx").on(table.userId),
    index("user_game_progress_puzzle_id_idx").on(table.puzzleId),
  ],
);

export const userStats = sqliteTable(
  "user_stats",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameType: gameType("game_type").notNull(),
    gamesPlayed: integer("games_played").default(0).notNull(),
    gamesCompleted: integer("games_completed").default(0).notNull(),
    bestTime: integer("best_time"),
    averageTime: integer("average_time"),
    totalScore: integer("total_score").default(0).notNull(),
    currentStreak: integer("current_streak").default(0).notNull(),
    longestStreak: integer("longest_streak").default(0).notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.gameType] })],
);

export const userStreaks = sqliteTable(
  "user_streaks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameType: gameType("game_type").notNull(),
    currentCount: integer("current_count").default(0).notNull(),
    longestCount: integer("longest_count").default(0).notNull(),
    lastPlayedDate: text("last_played_date"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("user_streaks_user_game_idx").on(table.userId, table.gameType)],
);

export const achievements = sqliteTable("achievements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  gameType: gameType("game_type"),
  xp: integer("xp").default(0).notNull(),
  createdAt: timestamp("created_at"),
});

export const userAchievements = sqliteTable(
  "user_achievements",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    unlockedAt: timestamp("unlocked_at"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.achievementId] })],
);

export const leaderboards = sqliteTable(
  "leaderboards",
  {
    id: text("id").primaryKey(),
    gameType: gameType("game_type").notNull(),
    difficulty: difficulty("difficulty").notNull(),
    period: text("period").notNull(),
    entries: json<Array<Record<string, unknown>>>("entries").notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("leaderboards_scope_idx").on(table.gameType, table.difficulty, table.period),
  ],
);

export const puzzlePacks = sqliteTable(
  "puzzle_packs",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    gameType: gameType("game_type").notNull(),
    manifest: json<Record<string, unknown>>("manifest").notNull(),
    createdAt: timestamp("created_at"),
    publishedAt: nullableTimestamp("published_at"),
  },
  (table) => [index("puzzle_packs_game_type_idx").on(table.gameType)],
);

export const syncOps = sqliteTable(
  "sync_ops",
  {
    serverSeq: integer("server_seq").primaryKey({ autoIncrement: true }),
    opId: text("op_id").notNull().unique(),
    deviceId: text("device_id").notNull(),
    gameId: text("game_id").notNull(),
    type: text("type", { enum: ["move", "complete", "reset"] }).notNull(),
    localSeq: integer("local_seq").notNull(),
    baseRev: integer("base_rev").notNull(),
    appliedRev: integer("applied_rev").notNull(),
    payload: json<Record<string, unknown>>("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("sync_ops_device_seq_idx").on(table.deviceId, table.serverSeq),
    index("sync_ops_game_idx").on(table.gameId),
  ],
);

export const gameSyncState = sqliteTable("game_sync_state", {
  gameId: text("game_id").primaryKey(),
  rev: integer("rev").notNull(),
  ownerDeviceId: text("owner_device_id").notNull(),
  updatedAt: timestamp("updated_at"),
});

export const publishedDailies = sqliteTable(
  "published_dailies",
  {
    id: text("id").primaryKey(),
    challengeDate: text("challenge_date").notNull(),
    gameType: gameType("game_type").notNull(),
    difficulty: difficulty("difficulty").notNull(),
    seed: text("seed").notNull(),
    generatorVersion: text("generator_version").notNull(),
    puzzleData: json<Record<string, unknown>>("puzzle_data").notNull(),
    solutionData: json<Record<string, unknown>>("solution_data").notNull(),
    publishedAt: text("published_at").notNull(),
    revision: integer("revision").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("published_dailies_scope_idx").on(
      table.challengeDate,
      table.gameType,
      table.difficulty,
    ),
    index("published_dailies_date_idx").on(table.gameType, table.challengeDate),
  ],
);

export const dailyPublishAudit = sqliteTable(
  "daily_publish_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    challengeDate: text("challenge_date").notNull(),
    gameType: gameType("game_type").notNull(),
    difficulty: difficulty("difficulty").notNull(),
    action: text("action", { enum: ["publish", "override"] }).notNull(),
    actor: text("actor").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("daily_publish_audit_date_idx").on(table.challengeDate, table.gameType)],
);

export const completionEvents = sqliteTable(
  "completion_events",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    gameType: gameType("game_type").notNull(),
    difficulty: difficulty("difficulty").notNull(),
    progressId: text("progress_id").notNull(),
    elapsedSeconds: integer("elapsed_seconds").notNull(),
    mistakes: integer("mistakes").notNull(),
    hintsUsed: integer("hints_used").notNull(),
    score: integer("score").notNull(),
    xp: integer("xp").notNull(),
    flags: json<string[]>("flags").notNull(),
    isDaily: integer("is_daily", { mode: "boolean" }).default(false).notNull(),
    completedAt: text("completed_at").notNull(),
  },
  (table) => [
    uniqueIndex("completion_events_device_progress_idx").on(table.deviceId, table.progressId),
    index("completion_events_device_idx").on(table.deviceId, table.completedAt),
  ],
);

export const deviceAchievements = sqliteTable(
  "device_achievements",
  {
    deviceId: text("device_id").notNull(),
    achievementId: text("achievement_id").notNull(),
    unlockedAt: text("unlocked_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.achievementId] }),
    index("device_achievements_device_idx").on(table.deviceId),
  ],
);

export const deviceStats = sqliteTable(
  "device_stats",
  {
    deviceId: text("device_id").notNull(),
    gameType: gameType("game_type").notNull(),
    gamesCompleted: integer("games_completed").default(0).notNull(),
    totalScore: integer("total_score").default(0).notNull(),
    totalXp: integer("total_xp").default(0).notNull(),
    bestTimeSeconds: integer("best_time_seconds"),
    currentStreak: integer("current_streak").default(0).notNull(),
    longestStreak: integer("longest_streak").default(0).notNull(),
    lastPlayedDate: text("last_played_date"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.gameType] })],
);
