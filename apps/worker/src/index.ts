import { createAuth, type PuzzleHubAuth } from "@puzzlehub/auth";
import { gameCatalog } from "@puzzlehub/config";
import { createAuthDb } from "@puzzlehub/db";
import { difficulties, type Difficulty, type GameType } from "@puzzlehub/game-core";
import {
  calculateSudokuScore,
  generateSudoku,
  type GeneratedSudoku,
  type SudokuGrid,
} from "@puzzlehub/sudoku-engine";
import {
  adminDailyStatusQuerySchema,
  adminPublishDailySchema,
  completeGameSchema,
  dailyChallengeQuerySchema,
  leaderboardQuerySchema,
  recordMoveSchema,
  startGameSchema,
  sudokuMoveSchema,
  syncPullQuerySchema,
  syncPushSchema,
} from "@puzzlehub/validation";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import {
  calculateXp,
  completionMessageType,
  D1CompletionStore,
  flagCompletion,
  QueueCompletionPublisher,
  recordCompletion,
  type CompletionPublisher,
  type CompletionQueueMessage,
  type CompletionStore,
} from "./completion";
import {
  D1DailyStore,
  getDailyStatus,
  publishDailyRange,
  type DailyGenerator,
  type DailyPuzzleData,
  type DailyStore,
} from "./dailyPublishing";
import {
  achievementCatalog,
  D1AchievementStore,
  evaluateAndPersistAchievements,
  type AchievementStore,
} from "./achievements";
import { D1LeaderboardStore, rebuildLeaderboards, type LeaderboardStore } from "./leaderboard";
import { aggregateDeviceStats, D1StatsStore, type StatsStore } from "./statsAggregation";
import {
  applySyncBatch,
  D1SyncStore,
  listOpsSince,
  type StoredSyncOp,
  type SyncStore,
} from "./sync";

const apiVersion = "0.1.0";

// Hono environment: the runtime bindings plus per-request variables set by
// middleware. `userId` is populated by requireAuth once a session is verified.
type AppVariables = { userId: string };
type AppEnv = { Bindings: Env; Variables: AppVariables };

interface PublicSudokuData {
  grid: SudokuGrid;
  givens: boolean[][];
  clueCount: number;
}

interface PublicPuzzleEnvelope<TPuzzleData = unknown> {
  id: string;
  gameType: GameType;
  difficulty: Difficulty;
  puzzleData: TPuzzleData;
  createdAt: string;
}

// --- Structured logging with redaction -----------------------------------
// Never let tokens, grids, notes, or solution data reach logs. Logs only ever
// carry the small allowlisted records built below, but redactForLog defends any
// future structured logging too.
const sensitiveLogKeys = new Set([
  "authorization",
  "answer",
  "accesstoken",
  "candidates",
  "givens",
  "grid",
  "notes",
  "password",
  "refreshtoken",
  "seed",
  "sessiontoken",
  "solution",
  "solutiondata",
  "solutionhash",
  "solvedgrid",
  "token",
]);

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) =>
      sensitiveLogKeys.has(key.toLowerCase())
        ? [key, "[redacted]"]
        : [key, redactForLog(child, depth + 1)],
    ),
  );
}

function logEvent(record: Record<string, unknown>): void {
  console.log(JSON.stringify(redactForLog(record)));
}

// --- Rate limiting -------------------------------------------------------
// Applied to sensitive write/auth endpoints. Fails open if the binding is
// missing (e.g. unit tests without env) or the limiter errors, so a limiter
// outage degrades to "unlimited" rather than a hard outage.
function rateLimit(name: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const limiter = c.env?.API_RATE_LIMITER;

    if (limiter) {
      const clientIp = c.req.header("CF-Connecting-IP") ?? "anonymous";

      try {
        const { success } = await limiter.limit({ key: `${name}:${clientIp}` });

        if (!success) {
          return c.json(
            { error: "rate_limited", message: "Too many requests. Please slow down and retry." },
            429,
          );
        }
      } catch (error) {
        logEvent({
          level: "warn",
          route: c.req.path,
          message: "rate_limiter_unavailable",
          name: (error as Error).name,
        });
      }
    }

    return next();
  };
}

// Sync store resolution. Production uses the D1-backed store; tests inject an
// in-memory store through this seam so the HTTP contract is exercised end-to-end
// without a live database.
let syncStoreOverride: SyncStore | null = null;

export function __setSyncStoreForTests(store: SyncStore | null): void {
  syncStoreOverride = store;
}

function resolveSyncStore(env: Env): SyncStore {
  return syncStoreOverride ?? new D1SyncStore(env.PUZZLEHUB_DB);
}

// Daily publishing store resolution. Tests inject an in-memory store; production
// uses D1. Returns null when no database is bound so the public daily endpoint
// can fall back to on-the-fly generation.
let dailyStoreOverride: DailyStore | null = null;

export function __setDailyStoreForTests(store: DailyStore | null): void {
  dailyStoreOverride = store;
}

function resolveDailyStore(env: Env): DailyStore | null {
  if (dailyStoreOverride) {
    return dailyStoreOverride;
  }

  return env?.PUZZLEHUB_DB ? new D1DailyStore(env.PUZZLEHUB_DB) : null;
}

// Completion store + queue publisher resolution. Tests inject in-memory/fake
// implementations through this seam; production uses D1 + the events queue.
let completionStoreOverride: CompletionStore | null = null;
let completionPublisherOverride: CompletionPublisher | null = null;

export function __setCompletionDepsForTests(
  store: CompletionStore | null,
  publisher: CompletionPublisher | null,
): void {
  completionStoreOverride = store;
  completionPublisherOverride = publisher;
}

function resolveCompletionStore(env: Env): CompletionStore | null {
  if (completionStoreOverride) {
    return completionStoreOverride;
  }

  return env?.PUZZLEHUB_DB ? new D1CompletionStore(env.PUZZLEHUB_DB) : null;
}

function resolveCompletionPublisher(env: Env): CompletionPublisher | null {
  if (completionPublisherOverride) {
    return completionPublisherOverride;
  }

  return env?.PUZZLEHUB_EVENTS ? new QueueCompletionPublisher(env.PUZZLEHUB_EVENTS) : null;
}

let statsStoreOverride: StatsStore | null = null;

export function __setStatsStoreForTests(store: StatsStore | null): void {
  statsStoreOverride = store;
}

function resolveStatsStore(env: Env): StatsStore | null {
  if (statsStoreOverride) {
    return statsStoreOverride;
  }

  return env?.PUZZLEHUB_DB ? new D1StatsStore(env.PUZZLEHUB_DB) : null;
}

let achievementStoreOverride: AchievementStore | null = null;

export function __setAchievementStoreForTests(store: AchievementStore | null): void {
  achievementStoreOverride = store;
}

function resolveAchievementStore(env: Env): AchievementStore | null {
  if (achievementStoreOverride) {
    return achievementStoreOverride;
  }

  return env?.PUZZLEHUB_DB ? new D1AchievementStore(env.PUZZLEHUB_DB) : null;
}

let leaderboardStoreOverride: LeaderboardStore | null = null;

export function __setLeaderboardStoreForTests(store: LeaderboardStore | null): void {
  leaderboardStoreOverride = store;
}

function resolveLeaderboardStore(env: Env): LeaderboardStore | null {
  if (leaderboardStoreOverride) {
    return leaderboardStoreOverride;
  }

  return env?.PUZZLEHUB_DB ? new D1LeaderboardStore(env.PUZZLEHUB_DB) : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Deterministic daily generator: the seed is a pure function of date/game/
// difficulty, so a given date always yields the same puzzle.
const generateDailyRecord: DailyGenerator = (challengeDate, gameType, difficulty) => {
  const seed = `daily:${gameType}:${challengeDate}:${difficulty}`;
  const generated = generateSudoku({ difficulty, seed });

  return {
    id: `${challengeDate}:${gameType}:${difficulty}`,
    challengeDate,
    gameType,
    difficulty,
    seed,
    generatorVersion: generated.puzzle.algorithmVersion,
    puzzleData: {
      grid: generated.puzzle.grid,
      givens: generated.puzzle.givens,
      clueCount: generated.puzzle.clueCount,
    },
    solutionData: { grid: generated.solution.grid },
  };
};

function dailyPuzzleEnvelope(
  challengeDate: string,
  difficulty: Difficulty,
  puzzleData: DailyPuzzleData,
  createdAt: string,
): PublicPuzzleEnvelope<PublicSudokuData> {
  return {
    id: `sudoku:daily:${challengeDate}:${difficulty}`,
    gameType: "sudoku",
    difficulty,
    puzzleData: {
      grid: puzzleData.grid as unknown as SudokuGrid,
      givens: puzzleData.givens,
      clueCount: puzzleData.clueCount,
    },
    createdAt,
  };
}

// Admin endpoints require a bearer token matching the ADMIN_TOKEN secret. With
// no token configured the surface stays closed (503) rather than open.
function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const adminToken = (c.env as Env & { ADMIN_TOKEN?: string })?.ADMIN_TOKEN;

    if (!adminToken) {
      return c.json({ error: "admin_not_configured" }, 503);
    }

    if (c.req.header("Authorization") !== `Bearer ${adminToken}`) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return next();
  };
}

// --- Authentication ------------------------------------------------------
// Better Auth instance, memoized per D1 binding so it is built once per isolate.
// Returns null when auth is unconfigured (no secret or DB) so protected routes
// fail closed (deny) rather than open.
const authByDb = new WeakMap<D1Database, PuzzleHubAuth>();

interface AuthEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
}

function resolveAuth(env: Env): PuzzleHubAuth | null {
  const authEnv = env as Env & AuthEnv;
  const secret = authEnv?.BETTER_AUTH_SECRET;
  const db = env?.PUZZLEHUB_DB;

  if (!secret || !db) {
    return null;
  }

  const existing = authByDb.get(db);

  if (existing) {
    return existing;
  }

  const trustedOrigins = authEnv.BETTER_AUTH_TRUSTED_ORIGINS
    ? authEnv.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => origin.trim())
    : ["http://localhost:8081", "http://localhost:5173"];

  const auth = createAuth({
    db: createAuthDb(db),
    secret,
    baseUrl: authEnv.BETTER_AUTH_URL ?? "http://localhost:8787",
    trustedOrigins,
    sendMagicLink: ({ email }) => {
      // Email delivery is wired in the email milestone; for now we only record
      // that a link was issued. The link and token are never logged.
      logEvent({
        level: "info",
        message: "magic_link_issued",
        emailDomain: email.split("@")[1] ?? "unknown",
      });

      return Promise.resolve();
    },
  });

  authByDb.set(db, auth);

  return auth;
}

// Session resolution seam: production reads the Better Auth session from the
// request; tests inject a fake identity so the HTTP contract is exercised without
// a live auth database.
export interface AuthIdentity {
  userId: string;
}

export interface SessionResolver {
  resolve(request: Request, env: Env): Promise<AuthIdentity | null>;
}

let sessionResolverOverride: SessionResolver | null = null;

export function __setSessionResolverForTests(resolver: SessionResolver | null): void {
  sessionResolverOverride = resolver;
}

function resolveSessionResolver(): SessionResolver {
  return (
    sessionResolverOverride ?? {
      async resolve(request, env) {
        const auth = resolveAuth(env);

        if (!auth) {
          return null;
        }

        const session = await auth.api.getSession({ headers: request.headers });

        return session?.user?.id ? { userId: session.user.id } : null;
      },
    }
  );
}

// Gate for endpoints that must be tied to an authenticated user. Denies with 401
// when no valid session is present and otherwise sets `userId` on the context.
function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const identity = await resolveSessionResolver().resolve(c.req.raw, c.env);

    if (!identity) {
      return c.json(
        { error: "unauthorized", message: "Authentication is required for this request." },
        401,
      );
    }

    c.set("userId", identity.userId);

    return next();
  };
}

function toPublicSyncOp(op: StoredSyncOp): StoredSyncOp {
  // Explicit allowlist of relayable op fields. Payloads are client-authored
  // move/complete state; no server solution data ever lives here.
  return {
    serverSeq: op.serverSeq,
    opId: op.opId,
    deviceId: op.deviceId,
    gameId: op.gameId,
    type: op.type,
    localSeq: op.localSeq,
    baseRev: op.baseRev,
    appliedRev: op.appliedRev,
    payload: op.payload,
    createdAt: op.createdAt,
  };
}

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.onError((error, c) => {
  // Allowlisted fields only — no request body, headers, or tokens.
  logEvent({
    level: "error",
    route: c.req.path,
    method: c.req.method,
    name: error.name,
    message: error.message,
  });

  return c.json(
    { error: "internal_error", message: "The API could not complete this request." },
    500,
  );
});

app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

// Health stays unversioned by convention.
app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "puzzlehub-api",
    version: apiVersion,
    timestamp: new Date().toISOString(),
  }),
);

const v1 = new Hono<AppEnv>();

v1.get("/me", (c) =>
  c.json({
    user: null,
    mode: "guest",
    syncEnabled: false,
  }),
);

v1.get("/games", (c) =>
  c.json({
    games: gameCatalog,
    firstMilestone: "sudoku",
  }),
);

v1.get("/daily", async (c) => {
  const parsed = dailyChallengeQuerySchema.safeParse({
    date: c.req.query("date") ?? undefined,
    gameType: c.req.query("gameType") ?? undefined,
    difficulty: c.req.query("difficulty") ?? undefined,
  });

  if (!parsed.success) {
    return c.json({ error: "invalid_daily_query", issues: parsed.error.issues }, 400);
  }

  if (parsed.data.gameType !== "sudoku") {
    return c.json(
      {
        error: "game_not_ready",
        message: "Daily challenges for this game are planned after the Sudoku milestone.",
      },
      501,
    );
  }

  const challengeDate = parsed.data.date ?? today();
  const difficulty = parsed.data.difficulty;
  const dailyId = `daily:${challengeDate}:${difficulty}`;
  const store = resolveDailyStore(c.env);
  const published = store ? await store.get(challengeDate, "sudoku", difficulty) : null;

  if (published) {
    // Immutable: serve the canonical stored puzzle so it never changes for users.
    return c.json({
      dailyChallenge: {
        id: dailyId,
        date: challengeDate,
        published: true,
        publishedAt: published.publishedAt,
        puzzle: dailyPuzzleEnvelope(
          challengeDate,
          difficulty,
          published.puzzleData,
          published.publishedAt,
        ),
      },
    });
  }

  // Not yet published: generate the deterministic puzzle on the fly.
  const generated = generateDailyRecord(challengeDate, "sudoku", difficulty);

  return c.json({
    dailyChallenge: {
      id: dailyId,
      date: challengeDate,
      published: false,
      puzzle: dailyPuzzleEnvelope(challengeDate, difficulty, generated.puzzleData, today()),
    },
  });
});

v1.post("/game/start", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = startGameSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "invalid_start_payload", issues: parsed.error.issues }, 400);
  }

  if (parsed.data.gameType !== "sudoku") {
    return c.json(
      {
        error: "game_not_ready",
        message: "The MVP starts with Sudoku. Other games are scaffolded but not playable yet.",
      },
      501,
    );
  }

  const progressId = crypto.randomUUID();
  const seed =
    parsed.data.puzzleId ?? `start:sudoku:${parsed.data.difficulty}:${crypto.randomUUID()}`;
  const generated = generateSudoku({ difficulty: parsed.data.difficulty, seed });

  return c.json(
    {
      progressId,
      puzzle: toPublicSudokuPuzzle(`sudoku:${progressId}`, generated),
      state: {
        status: "active",
        startedAt: new Date().toISOString(),
        syncStatus: "local_first",
      },
    },
    201,
  );
});

v1.post("/game/move", rateLimit("move"), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = recordMoveSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "invalid_move_payload", issues: parsed.error.issues }, 400);
  }

  if (parsed.data.gameType !== "sudoku") {
    return c.json(
      {
        error: "game_not_ready",
        message: "The MVP starts with Sudoku. Other games are scaffolded but not playable yet.",
      },
      501,
    );
  }

  // Confirmed Sudoku: re-validate the move strictly (the envelope union is
  // permissive so non-Sudoku games can reach the 501 above).
  const move = sudokuMoveSchema.safeParse(parsed.data.move);

  if (!move.success) {
    return c.json({ error: "invalid_move_payload", issues: move.error.issues }, 400);
  }

  return c.json({
    accepted: true,
    progressId: parsed.data.progressId,
    serverSequence: crypto.randomUUID(),
    syncStatus: "queued",
  });
});

v1.post("/game/complete", rateLimit("complete"), requireAuth(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = completeGameSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "invalid_complete_payload", issues: parsed.error.issues }, 400);
  }

  if (parsed.data.gameType !== "sudoku") {
    return c.json(
      {
        error: "game_not_ready",
        message: "The MVP starts with Sudoku. Other games are scaffolded but not playable yet.",
      },
      501,
    );
  }

  // Score is always recomputed server-side; the client value is ignored.
  const score = calculateSudokuScore({
    difficulty: parsed.data.difficulty,
    elapsedSeconds: parsed.data.elapsedSeconds,
    mistakes: parsed.data.mistakes,
    hintsUsed: parsed.data.hintsUsed,
  }).score;

  const deviceId = parsed.data.deviceId ?? "anonymous";
  const completedAt = new Date().toISOString();
  const store = resolveCompletionStore(c.env);
  const publisher = resolveCompletionPublisher(c.env);

  let xp: number;
  let flags: string[];
  let queued = false;
  let duplicate = false;

  if (store && publisher) {
    const result = await recordCompletion(store, publisher, {
      id: crypto.randomUUID(),
      deviceId,
      gameType: "sudoku",
      difficulty: parsed.data.difficulty,
      progressId: parsed.data.progressId,
      elapsedSeconds: parsed.data.elapsedSeconds,
      mistakes: parsed.data.mistakes,
      hintsUsed: parsed.data.hintsUsed,
      score,
      isDaily: parsed.data.isDaily,
      completedAt,
    });
    xp = result.event.xp;
    flags = result.event.flags;
    queued = result.recorded;
    duplicate = result.duplicate;
  } else {
    // No persistence bound (e.g. local/test without bindings): still return the
    // authoritative score and XP, just do not record or queue.
    xp = calculateXp(parsed.data.difficulty, score, parsed.data.hintsUsed);
    flags = flagCompletion({
      difficulty: parsed.data.difficulty,
      elapsedSeconds: parsed.data.elapsedSeconds,
      mistakes: parsed.data.mistakes,
      hintsUsed: parsed.data.hintsUsed,
      isDuplicate: false,
    });
  }

  // Coarse response: authoritative score/XP only, never which cells were wrong.
  return c.json({
    progressId: parsed.data.progressId,
    completedAt,
    score,
    xp,
    flagged: flags.length > 0,
    duplicate,
    statsQueued: queued,
    achievementsQueued: queued,
  });
});

// Better Auth owns every method under its base path; the rate limiter still
// fronts it so credential-stuffing is throttled before the handler runs.
v1.on(["GET", "POST"], "/auth/*", rateLimit("auth"), async (c) => {
  const auth = resolveAuth(c.env);

  if (!auth) {
    return c.json({ error: "auth_not_configured" }, 503);
  }

  return auth.handler(c.req.raw);
});

v1.get("/admin/daily/preview", requireAdmin(), (c) => {
  const parsed = dailyChallengeQuerySchema.safeParse({
    date: c.req.query("date") ?? undefined,
    gameType: "sudoku",
    difficulty: c.req.query("difficulty") ?? undefined,
  });

  if (!parsed.success) {
    return c.json({ error: "invalid_daily_query", issues: parsed.error.issues }, 400);
  }

  const challengeDate = parsed.data.date ?? today();
  const generated = generateDailyRecord(challengeDate, "sudoku", parsed.data.difficulty);

  // Preview does not persist; it returns the same public envelope users would see.
  return c.json({
    preview: {
      date: challengeDate,
      difficulty: parsed.data.difficulty,
      generatorVersion: generated.generatorVersion,
      puzzle: dailyPuzzleEnvelope(
        challengeDate,
        parsed.data.difficulty,
        generated.puzzleData,
        today(),
      ),
    },
  });
});

v1.post("/admin/daily/publish", requireAdmin(), rateLimit("admin"), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = adminPublishDailySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "invalid_publish_payload", issues: parsed.error.issues }, 400);
  }

  const store = resolveDailyStore(c.env);

  if (!store) {
    return c.json({ error: "storage_unavailable" }, 503);
  }

  const summary = await publishDailyRange(store, generateDailyRecord, {
    startDate: parsed.data.startDate ?? today(),
    days: parsed.data.days,
    gameType: "sudoku",
    difficulties: parsed.data.difficulties ?? [...difficulties],
    regenerate: parsed.data.regenerate,
    actor: "admin",
    publishedAt: new Date().toISOString(),
  });

  return c.json({ summary });
});

v1.get("/admin/daily/status", requireAdmin(), async (c) => {
  const parsed = adminDailyStatusQuerySchema.safeParse({
    startDate: c.req.query("startDate") ?? undefined,
    days: c.req.query("days") ?? undefined,
  });

  if (!parsed.success) {
    return c.json({ error: "invalid_status_query", issues: parsed.error.issues }, 400);
  }

  const store = resolveDailyStore(c.env);

  if (!store) {
    return c.json({ error: "storage_unavailable" }, 503);
  }

  const status = await getDailyStatus(store, {
    startDate: parsed.data.startDate ?? today(),
    days: parsed.data.days,
    gameType: "sudoku",
    difficulties: [...difficulties],
  });

  return c.json({ status });
});

v1.post("/sync", rateLimit("sync"), requireAuth(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = syncPushSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "invalid_sync_payload", issues: parsed.error.issues }, 400);
  }

  const { results, cursor } = await applySyncBatch(resolveSyncStore(c.env), parsed.data.ops);

  return c.json({ deviceId: parsed.data.deviceId, cursor, results });
});

v1.get("/sync", rateLimit("sync"), requireAuth(), async (c) => {
  const parsed = syncPullQuerySchema.safeParse({
    deviceId: c.req.query("deviceId"),
    since: c.req.query("since") ?? undefined,
    limit: c.req.query("limit") ?? undefined,
  });

  if (!parsed.success) {
    return c.json({ error: "invalid_sync_query", issues: parsed.error.issues }, 400);
  }

  const { ops, cursor, hasMore } = await listOpsSince(
    resolveSyncStore(c.env),
    parsed.data.deviceId,
    parsed.data.since,
    parsed.data.limit,
  );

  return c.json({ deviceId: parsed.data.deviceId, cursor, hasMore, ops: ops.map(toPublicSyncOp) });
});

v1.get("/stats", async (c) => {
  const deviceId = c.req.query("deviceId");
  const statsStore = resolveStatsStore(c.env);
  const stats = deviceId && statsStore ? await statsStore.get(deviceId, "sudoku") : null;

  return c.json({
    deviceId: deviceId ?? null,
    summary: {
      gamesCompleted: stats?.gamesCompleted ?? 0,
      totalScore: stats?.totalScore ?? 0,
      totalXp: stats?.totalXp ?? 0,
      bestTimeSeconds: stats?.bestTimeSeconds ?? null,
      currentStreak: stats?.currentStreak ?? 0,
      longestStreak: stats?.longestStreak ?? 0,
    },
  });
});

v1.get("/achievements", async (c) => {
  const deviceId = c.req.query("deviceId");
  const achievementStore = resolveAchievementStore(c.env);
  const unlocked =
    deviceId && achievementStore ? await achievementStore.listByDevice(deviceId) : [];
  const unlockedById = new Map(unlocked.map((entry) => [entry.achievementId, entry.unlockedAt]));

  return c.json({
    deviceId: deviceId ?? null,
    achievements: achievementCatalog.map((definition) => ({
      ...definition,
      unlocked: unlockedById.has(definition.id),
      unlockedAt: unlockedById.get(definition.id) ?? null,
    })),
  });
});

v1.get("/leaderboard", async (c) => {
  const parsed = leaderboardQuerySchema.safeParse({
    gameType: c.req.query("gameType") ?? undefined,
    difficulty: c.req.query("difficulty") ?? undefined,
    period: c.req.query("period") ?? undefined,
  });

  if (!parsed.success) {
    return c.json({ error: "invalid_leaderboard_query", issues: parsed.error.issues }, 400);
  }

  const store = resolveLeaderboardStore(c.env);
  const entries = store ? await store.get(parsed.data) : [];

  return c.json({
    gameType: parsed.data.gameType,
    difficulty: parsed.data.difficulty,
    period: parsed.data.period,
    leaderboard: entries,
  });
});

v1.get("/puzzle-pack/:id", (c) =>
  c.json({
    id: c.req.param("id"),
    status: "planned",
    puzzles: [],
  }),
);

app.route("/v1", v1);

// Number of upcoming days the cron keeps published, so a missed manual publish
// never leaves users without a daily.
const dailyMaintenanceDays = 7;

async function runScheduledDailyMaintenance(env: Env): Promise<void> {
  const store = resolveDailyStore(env);

  if (!store) {
    logEvent({ level: "warn", message: "daily_maintenance_skipped_no_store" });
    return;
  }

  // Idempotent: publishDailyRange skips dates that already exist, so the cron
  // only fills genuine gaps and never overwrites a published daily.
  const summary = await publishDailyRange(store, generateDailyRecord, {
    startDate: today(),
    days: dailyMaintenanceDays,
    gameType: "sudoku",
    difficulties: [...difficulties],
    regenerate: false,
    actor: "cron",
    publishedAt: new Date().toISOString(),
  });

  logEvent({
    level: "info",
    message: "daily_maintenance",
    published: summary.published,
    skipped: summary.skipped,
  });
}

// Cron entrypoint: keep the next week of dailies published.
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (_controller, env) => {
  await runScheduledDailyMaintenance(env);
};

// Consumer of the events queue. Completions are validated and persisted before
// publishing; the consumer replays the event log to rebuild stats, streaks,
// achievements, and leaderboards — all idempotent under at-least-once delivery.
export const queue: ExportedHandlerQueueHandler<Env> = async (batch, env) => {
  const completionStore = resolveCompletionStore(env);
  const statsStore = resolveStatsStore(env);
  const achievementStore = resolveAchievementStore(env);
  const leaderboardStore = resolveLeaderboardStore(env);

  for (const message of batch.messages) {
    try {
      const body = message.body as Partial<CompletionQueueMessage>;

      if (body.type === completionMessageType && body.event && completionStore) {
        const deviceId = body.event.deviceId;
        const { gameType, difficulty } = body.event;

        // Replay the device's events to recompute stats and re-evaluate
        // achievements — idempotent under at-least-once delivery and always
        // reproducible from the event log.
        if (statsStore) {
          const stats = await aggregateDeviceStats(
            completionStore,
            statsStore,
            deviceId,
            body.event.gameType,
            new Date().toISOString(),
          );

          logEvent({
            level: "info",
            message: "stats_aggregated",
            deviceId: stats.deviceId,
            gamesCompleted: stats.gamesCompleted,
            currentStreak: stats.currentStreak,
          });
        }

        if (achievementStore) {
          const unlocked = await evaluateAndPersistAchievements(
            completionStore,
            achievementStore,
            deviceId,
          );

          logEvent({
            level: "info",
            message: "achievements_evaluated",
            deviceId,
            unlocked: unlocked.length,
          });
        }

        if (leaderboardStore) {
          // Rebuild from the validated event log — never from client scores.
          await rebuildLeaderboards(
            completionStore,
            leaderboardStore,
            gameType,
            difficulty,
            body.event.completedAt.slice(0, 10),
            new Date().toISOString(),
          );
        }
      }

      message.ack();
    } catch (error) {
      logEvent({
        level: "error",
        message: "completion_consume_failed",
        name: (error as Error).name,
      });
      message.retry();
    }
  }
};

function toPublicSudokuPuzzle(
  id: string,
  generated: GeneratedSudoku,
): PublicPuzzleEnvelope<PublicSudokuData> {
  // Explicit allowlist: only player-visible fields are copied out of the
  // generated puzzle. Solution, seed, and rating internals never cross here.
  return {
    id,
    gameType: "sudoku",
    difficulty: generated.puzzle.difficulty,
    puzzleData: {
      grid: generated.puzzle.grid,
      givens: generated.puzzle.givens,
      clueCount: generated.puzzle.clueCount,
    },
    createdAt: new Date().toISOString(),
  };
}

export { app };

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  scheduled,
  queue,
} satisfies ExportedHandler<Env>;
