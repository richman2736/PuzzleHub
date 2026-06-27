import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calculateSudokuScore } from "@puzzlehub/sudoku-engine";
import {
  app,
  __setAchievementStoreForTests,
  __setCompletionDepsForTests,
  __setDailyStoreForTests,
  __setLeaderboardStoreForTests,
  __setSessionResolverForTests,
  __setStatsStoreForTests,
  __setSyncStoreForTests,
  queue,
  redactForLog,
  scheduled,
} from "./index";
import { InMemoryAchievementStore } from "./achievements";
import { InMemoryLeaderboardStore } from "./leaderboard";
import {
  completionMessageType,
  InMemoryCompletionStore,
  type CompletionEvent,
  type CompletionPublisher,
} from "./completion";
import { InMemoryDailyStore } from "./dailyPublishing";
import { InMemoryStatsStore } from "./statsAggregation";
import { InMemorySyncStore } from "./sync";

const forbiddenPublicPuzzleKeys = new Set([
  "answer",
  "candidates",
  "debug",
  "seed",
  "solution",
  "solutionData",
  "solutionHash",
  "solvedGrid",
]);

function findForbiddenKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`));
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const matches = forbiddenPublicPuzzleKeys.has(key) ? [childPath] : [];

    return [...matches, ...findForbiddenKeys(child, childPath)];
  });
}

// A limiter stub so the 429 path can be exercised without the real binding.
function envWithRateLimiter(success: boolean): Env {
  return {
    API_RATE_LIMITER: { limit: async () => ({ success }) },
  } as unknown as Env;
}

// Protected routes require a session; inject a fixed test identity so the existing
// HTTP-contract tests exercise the handlers behind requireAuth without a live auth
// database. The unauthenticated (401) cases live in auth.test.ts.
beforeEach(() => {
  __setSessionResolverForTests({
    resolve: () => Promise.resolve({ userId: "test-user" }),
  });
});

afterEach(() => {
  __setSessionResolverForTests(null);
});

describe("worker API versioning", () => {
  it("serves health unversioned and functional routes under /v1", async () => {
    const health = await app.request("/health");
    expect(health.status).toBe(200);

    const versioned = await app.request("/v1/games");
    expect(versioned.status).toBe(200);
  });

  it("does not serve the legacy unversioned routes", async () => {
    const legacy = await app.request("/game/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "sudoku", difficulty: "easy" }),
    });
    expect(legacy.status).toBe(404);
  });
});

describe("worker public puzzle responses", () => {
  it("does not expose solution-like fields for daily Sudoku", async () => {
    const response = await app.request("/v1/daily?gameType=sudoku&difficulty=easy&date=2026-06-16");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(findForbiddenKeys(body)).toEqual([]);
    expect(body.dailyChallenge.id).toBe("daily:2026-06-16:easy");
    expect(body.dailyChallenge.puzzle.id).toBe("sudoku:daily:2026-06-16:easy");
    expect(JSON.stringify(body)).not.toContain("daily:sudoku:2026-06-16:easy");
    expect(body.dailyChallenge.puzzle.puzzleData.grid).toHaveLength(9);
    expect(body.dailyChallenge.puzzle.puzzleData.givens).toHaveLength(9);
  });

  it("returns only the allowlisted public puzzle envelope fields", async () => {
    const response = await app.request("/v1/daily?gameType=sudoku&difficulty=easy&date=2026-06-16");
    const body = await response.json();
    const envelope = body.dailyChallenge.puzzle;

    expect(Object.keys(envelope).sort()).toEqual([
      "createdAt",
      "difficulty",
      "gameType",
      "id",
      "puzzleData",
    ]);
    expect(Object.keys(envelope.puzzleData).sort()).toEqual(["clueCount", "givens", "grid"]);
  });

  it("does not expose solution-like fields when starting a Sudoku game", async () => {
    const response = await app.request("/v1/game/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "sudoku", difficulty: "easy" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(findForbiddenKeys(body)).toEqual([]);
    expect(body.puzzle.puzzleData.grid).toHaveLength(9);
    expect(body.puzzle.puzzleData.givens).toHaveLength(9);
  });
});

describe("worker request validation", () => {
  it("rejects unknown fields in the start payload", async () => {
    const response = await app.request("/v1/game/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "sudoku", difficulty: "easy", isAdmin: true }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_start_payload");
  });

  it("rejects unknown fields inside a Sudoku move", async () => {
    const response = await app.request("/v1/game/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progressId: "p1",
        gameType: "sudoku",
        move: { row: 0, col: 0, value: 5, mode: "answer", injected: "x" },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_move_payload");
  });
});

describe("worker game lifecycle responses", () => {
  it("computes completion score server-side instead of trusting client score", async () => {
    const response = await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progressId: "progress-score-test",
        gameType: "sudoku",
        difficulty: "easy",
        elapsedSeconds: 120,
        mistakes: 2,
        hintsUsed: 1,
        score: 999999,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBe(
      calculateSudokuScore({
        difficulty: "easy",
        elapsedSeconds: 120,
        mistakes: 2,
        hintsUsed: 1,
      }).score,
    );
    expect(body.score).not.toBe(999999);
  });

  it("returns a coarse completion response that never reveals cell or solution data", async () => {
    const response = await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progressId: "progress-coarse-test",
        gameType: "sudoku",
        difficulty: "easy",
        elapsedSeconds: 90,
        mistakes: 0,
        hintsUsed: 0,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(findForbiddenKeys(body)).toEqual([]);
    expect(Object.keys(body).sort()).toEqual([
      "achievementsQueued",
      "completedAt",
      "duplicate",
      "flagged",
      "progressId",
      "score",
      "statsQueued",
      "xp",
    ]);
  });

  it("rejects move recording for games that are not playable yet", async () => {
    const response = await app.request("/v1/game/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progressId: "progress-block-test", gameType: "block", move: {} }),
    });
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.error).toBe("game_not_ready");
  });

  it("rejects completion for games that are not playable yet", async () => {
    const response = await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progressId: "progress-block-complete-test",
        gameType: "block",
        difficulty: "easy",
        elapsedSeconds: 120,
        mistakes: 0,
        hintsUsed: 0,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.error).toBe("game_not_ready");
  });
});

describe("worker rate limiting", () => {
  const completeBody = JSON.stringify({
    progressId: "progress-rate-test",
    gameType: "sudoku",
    difficulty: "easy",
    elapsedSeconds: 60,
    mistakes: 0,
    hintsUsed: 0,
  });

  it("returns 429 when the limiter denies a sensitive write", async () => {
    const response = await app.request(
      "/v1/game/complete",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: completeBody },
      envWithRateLimiter(false),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("rate_limited");
  });

  it("allows the request when the limiter permits it", async () => {
    const response = await app.request(
      "/v1/game/complete",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: completeBody },
      envWithRateLimiter(true),
    );

    expect(response.status).toBe(200);
  });

  it("rate-limits the auth surface", async () => {
    const response = await app.request(
      "/v1/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      envWithRateLimiter(false),
    );

    expect(response.status).toBe(429);
  });
});

describe("worker sync endpoints", () => {
  beforeEach(() => {
    __setSyncStoreForTests(new InMemorySyncStore());
  });

  afterEach(() => {
    __setSyncStoreForTests(null);
  });

  const pushBody = (opId: string, baseRev: number) =>
    JSON.stringify({
      deviceId: "device-a",
      ops: [
        {
          opId,
          deviceId: "device-a",
          localSeq: baseRev + 1,
          baseRev,
          gameId: "game-1",
          type: "move",
          payload: { row: 0, col: 0, value: 5 },
          createdAt: "2026-06-17T00:00:00.000Z",
        },
      ],
    });

  it("accepts a push and is idempotent on replay", async () => {
    const first = await app.request("/v1/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: pushBody("op-1", 0),
    });
    const firstBody = await first.json();

    expect(first.status).toBe(200);
    expect(firstBody.results[0].status).toBe("applied");
    expect(firstBody.cursor).toBe(1);

    const replay = await app.request("/v1/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: pushBody("op-1", 0),
    });
    const replayBody = await replay.json();

    expect(replayBody.results[0].status).toBe("duplicate");
    expect(replayBody.results[0].serverSeq).toBe(firstBody.results[0].serverSeq);
  });

  it("pulls a device's ops since a cursor without leaking solution data", async () => {
    await app.request("/v1/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: pushBody("op-1", 0),
    });

    const response = await app.request("/v1/sync?deviceId=device-a&since=0");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(findForbiddenKeys(body)).toEqual([]);
    expect(body.ops).toHaveLength(1);
    expect(body.ops[0].opId).toBe("op-1");
    expect(body.cursor).toBe(1);
    expect(body.hasMore).toBe(false);
  });

  it("rejects a malformed sync payload", async () => {
    const response = await app.request("/v1/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "device-a", ops: [] }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_sync_payload");
  });

  it("rate-limits sync writes", async () => {
    const response = await app.request(
      "/v1/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pushBody("op-1", 0),
      },
      envWithRateLimiter(false),
    );

    expect(response.status).toBe(429);
  });
});

describe("worker daily publishing", () => {
  let store: InMemoryDailyStore;

  beforeEach(() => {
    store = new InMemoryDailyStore();
    __setDailyStoreForTests(store);
  });

  afterEach(() => {
    __setDailyStoreForTests(null);
  });

  const adminEnv = {
    ADMIN_TOKEN: "test-admin",
    API_RATE_LIMITER: { limit: async () => ({ success: true }) },
  } as unknown as Env;
  const adminHeaders = { Authorization: "Bearer test-admin", "Content-Type": "application/json" };

  it("guards admin publish behind a valid bearer token", async () => {
    const unconfigured = await app.request("/v1/admin/daily/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7 }),
    });
    expect(unconfigured.status).toBe(503);

    const wrongToken = await app.request(
      "/v1/admin/daily/publish",
      {
        method: "POST",
        headers: { Authorization: "Bearer nope", "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      },
      adminEnv,
    );
    expect(wrongToken.status).toBe(401);
  });

  it("publishes a 7-day range, serves it immutably, and skips a re-publish", async () => {
    const published = await app.request(
      "/v1/admin/daily/publish",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ startDate: "2026-07-01", days: 7, difficulties: ["easy"] }),
      },
      adminEnv,
    );
    const publishedBody = await published.json();

    expect(published.status).toBe(200);
    expect(publishedBody.summary.published).toBe(7);

    // The public daily now serves the stored, immutable puzzle with no leak.
    const daily = await app.request("/v1/daily?gameType=sudoku&difficulty=easy&date=2026-07-01");
    const dailyBody = await daily.json();

    expect(daily.status).toBe(200);
    expect(dailyBody.dailyChallenge.published).toBe(true);
    expect(findForbiddenKeys(dailyBody)).toEqual([]);
    expect(dailyBody.dailyChallenge.puzzle.puzzleData.grid).toHaveLength(9);

    // Re-publishing the same range without regenerate changes nothing.
    const again = await app.request(
      "/v1/admin/daily/publish",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ startDate: "2026-07-01", days: 7, difficulties: ["easy"] }),
      },
      adminEnv,
    );
    expect((await again.json()).summary.skipped).toBe(7);
  });

  it("regenerates a published daily as an audited override", async () => {
    const body = JSON.stringify({ startDate: "2026-07-01", days: 1, difficulties: ["easy"] });
    await app.request(
      "/v1/admin/daily/publish",
      { method: "POST", headers: adminHeaders, body },
      adminEnv,
    );

    const overridden = await app.request(
      "/v1/admin/daily/publish",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          startDate: "2026-07-01",
          days: 1,
          difficulties: ["easy"],
          regenerate: true,
        }),
      },
      adminEnv,
    );

    expect((await overridden.json()).summary.republished).toBe(1);
    expect(store.audit.some((entry) => entry.action === "override")).toBe(true);
  });

  it("reports publish status including missing dates", async () => {
    await app.request(
      "/v1/admin/daily/publish",
      {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ startDate: "2026-07-01", days: 1, difficulties: ["easy"] }),
      },
      adminEnv,
    );

    const status = await app.request(
      "/v1/admin/daily/status?startDate=2026-07-01&days=2",
      { headers: adminHeaders },
      adminEnv,
    );
    const statusBody = await status.json();

    expect(status.status).toBe(200);
    const easyDayOne = statusBody.status.entries.find(
      (entry: { challengeDate: string; difficulty: string }) =>
        entry.challengeDate === "2026-07-01" && entry.difficulty === "easy",
    );
    expect(easyDayOne.published).toBe(true);
    expect(statusBody.status.missing.length).toBeGreaterThan(0);
  });

  it("previews a daily without persisting or leaking the solution", async () => {
    const preview = await app.request(
      "/v1/admin/daily/preview?date=2026-07-01&difficulty=hard",
      { headers: adminHeaders },
      adminEnv,
    );
    const previewBody = await preview.json();

    expect(preview.status).toBe(200);
    expect(previewBody.preview.puzzle.puzzleData.grid).toHaveLength(9);
    expect(findForbiddenKeys(previewBody)).toEqual([]);

    // Preview must not have persisted anything.
    const record = await store.get("2026-07-01", "sudoku", "hard");
    expect(record).toBeNull();
  });

  it("fills the next week of dailies on the cron schedule, idempotently", async () => {
    await scheduled({} as ScheduledController, {} as Env, {} as ExecutionContext);

    const todayDate = new Date().toISOString().slice(0, 10);
    const todayEasy = await store.get(todayDate, "sudoku", "easy");
    expect(todayEasy?.revision).toBe(1);
    // 7 days x 5 difficulties.
    expect(store.audit).toHaveLength(35);

    // A second run is a no-op (idempotent): no new publishes, no overrides.
    await scheduled({} as ScheduledController, {} as Env, {} as ExecutionContext);
    expect(store.audit).toHaveLength(35);
  });
});

describe("worker completion events", () => {
  let store: InMemoryCompletionStore;
  let published: CompletionEvent[];

  beforeEach(() => {
    store = new InMemoryCompletionStore();
    published = [];
    const publisher: CompletionPublisher = {
      publish: (event) => {
        published.push(event);
        return Promise.resolve();
      },
    };
    __setCompletionDepsForTests(store, publisher);
  });

  afterEach(() => {
    __setCompletionDepsForTests(null, null);
  });

  const completeBody = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      progressId: "progress-1",
      gameType: "sudoku",
      difficulty: "medium",
      elapsedSeconds: 300,
      mistakes: 1,
      hintsUsed: 0,
      deviceId: "device-a",
      ...overrides,
    });

  it("persists a completion event and publishes it to the queue", async () => {
    const response = await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: completeBody(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.statsQueued).toBe(true);
    expect(typeof body.xp).toBe("number");
    expect(store.events).toHaveLength(1);
    expect(store.events[0]?.deviceId).toBe("device-a");
    expect(published).toHaveLength(1);
  });

  it("does not double-record a duplicate completion submission", async () => {
    await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: completeBody(),
    });
    const second = await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: completeBody(),
    });
    const secondBody = await second.json();

    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.statsQueued).toBe(false);
    expect(store.events).toHaveLength(1);
    expect(published).toHaveLength(1);
  });

  it("flags an unrealistically fast completion", async () => {
    const response = await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: completeBody({ difficulty: "master", elapsedSeconds: 3, progressId: "fast-1" }),
    });
    const body = await response.json();

    expect(body.flagged).toBe(true);
    expect(store.events[0]?.flags).toContain("unrealistic_time");
  });
});

describe("worker stats and achievement aggregation", () => {
  let completionStore: InMemoryCompletionStore;
  let statsStore: InMemoryStatsStore;
  let achievementStore: InMemoryAchievementStore;
  let leaderboardStore: InMemoryLeaderboardStore;
  let published: CompletionEvent[];

  beforeEach(() => {
    completionStore = new InMemoryCompletionStore();
    statsStore = new InMemoryStatsStore();
    achievementStore = new InMemoryAchievementStore();
    leaderboardStore = new InMemoryLeaderboardStore();
    published = [];
    __setCompletionDepsForTests(completionStore, {
      publish: (event) => {
        published.push(event);
        return Promise.resolve();
      },
    });
    __setStatsStoreForTests(statsStore);
    __setAchievementStoreForTests(achievementStore);
    __setLeaderboardStoreForTests(leaderboardStore);
  });

  afterEach(() => {
    __setCompletionDepsForTests(null, null);
    __setStatsStoreForTests(null);
    __setAchievementStoreForTests(null);
    __setLeaderboardStoreForTests(null);
  });

  async function drainQueue(): Promise<void> {
    await queue(
      {
        queue: "puzzlehub-events-dev",
        messages: published.map((event, index) => ({
          id: `m${index}`,
          timestamp: new Date(0),
          attempts: 1,
          body: { type: completionMessageType, event },
          ack: () => {},
          retry: () => {},
        })),
        ackAll: () => {},
        retryAll: () => {},
      } as unknown as Parameters<typeof queue>[0],
      {} as Env,
      {} as ExecutionContext,
    );
  }

  it("aggregates completion events into device stats and serves them at /v1/stats", async () => {
    await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progressId: "p1",
        gameType: "sudoku",
        difficulty: "medium",
        elapsedSeconds: 300,
        mistakes: 0,
        hintsUsed: 0,
        deviceId: "device-a",
      }),
    });

    expect(published).toHaveLength(1);
    await drainQueue();

    const stats = await statsStore.get("device-a", "sudoku");
    expect(stats?.gamesCompleted).toBe(1);
    expect(stats?.currentStreak).toBe(1);

    const response = await app.request("/v1/stats?deviceId=device-a");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.summary.gamesCompleted).toBe(1);
    expect(body.summary.totalScore).toBeGreaterThan(0);
  });

  it("unlocks deterministic achievements and serves them at /v1/achievements", async () => {
    await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progressId: "p1",
        gameType: "sudoku",
        difficulty: "hard",
        elapsedSeconds: 600,
        mistakes: 0,
        hintsUsed: 0,
        deviceId: "device-a",
        isDaily: true,
      }),
    });

    await drainQueue();

    const response = await app.request("/v1/achievements?deviceId=device-a");
    const body = await response.json();

    expect(response.status).toBe(200);
    const unlocked = body.achievements
      .filter((entry: { unlocked: boolean }) => entry.unlocked)
      .map((entry: { id: string }) => entry.id)
      .sort();
    expect(unlocked).toEqual(["first_daily", "first_solve", "hard_completed", "no_mistake_solve"]);
  });

  it("rebuilds the leaderboard from validated completions with pseudonyms only", async () => {
    await app.request("/v1/game/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progressId: "p1",
        gameType: "sudoku",
        difficulty: "medium",
        elapsedSeconds: 300,
        mistakes: 0,
        hintsUsed: 0,
        deviceId: "device-a",
      }),
    });

    await drainQueue();

    const response = await app.request("/v1/leaderboard?gameType=sudoku&difficulty=medium");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.period).toBe("all-time");
    expect(body.leaderboard).toHaveLength(1);
    expect(body.leaderboard[0].rank).toBe(1);
    expect(body.leaderboard[0].displayName).toMatch(/^Player-/);
    expect(body.leaderboard[0].score).toBeGreaterThan(0);
    // No device id ever leaks into the leaderboard.
    expect(JSON.stringify(body)).not.toContain("device-a");
  });
});

describe("worker completion queue consumer", () => {
  it("acknowledges completion messages it consumes", () => {
    const event = {
      id: "evt-1",
      deviceId: "device-a",
      difficulty: "medium",
      score: 500,
      xp: 25,
      flags: [],
    };
    let acked = 0;
    let retried = 0;
    const batch = {
      queue: "puzzlehub-events-dev",
      messages: [
        {
          id: "m1",
          timestamp: new Date(0),
          attempts: 1,
          body: { type: completionMessageType, event },
          ack: () => {
            acked += 1;
          },
          retry: () => {
            retried += 1;
          },
        },
      ],
      ackAll: () => {},
      retryAll: () => {},
    } as unknown as Parameters<typeof queue>[0];

    queue(batch, {} as Env, {} as ExecutionContext);

    expect(acked).toBe(1);
    expect(retried).toBe(0);
  });
});

describe("redactForLog", () => {
  it("redacts sensitive keys while preserving safe values, including when nested", () => {
    const redacted = redactForLog({
      route: "/v1/game/complete",
      authorization: "Bearer secret-token",
      token: "abc",
      score: 42,
      nested: { refreshToken: "r", grid: [[1, 2, 3]], note: "ok" },
      list: [{ solution: [1, 2], keep: true }],
    }) as Record<string, unknown>;

    expect(redacted.route).toBe("/v1/game/complete");
    expect(redacted.authorization).toBe("[redacted]");
    expect(redacted.token).toBe("[redacted]");
    expect(redacted.score).toBe(42);

    const nested = redacted.nested as Record<string, unknown>;
    expect(nested.refreshToken).toBe("[redacted]");
    expect(nested.grid).toBe("[redacted]");
    expect(nested.note).toBe("ok");

    const list = redacted.list as Array<Record<string, unknown>>;
    expect(list[0]?.solution).toBe("[redacted]");
    expect(list[0]?.keep).toBe(true);
  });
});
