import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app, __setSessionResolverForTests } from "./index";

const completeBody = JSON.stringify({
  progressId: "p-auth",
  gameType: "sudoku",
  difficulty: "easy",
  elapsedSeconds: 120,
  mistakes: 0,
  hintsUsed: 0,
});

const pushBody = JSON.stringify({
  deviceId: "device-a",
  ops: [
    {
      opId: "op-auth-1",
      deviceId: "device-a",
      localSeq: 1,
      baseRev: 0,
      gameId: "game-1",
      type: "move",
      payload: { row: 0, col: 0, value: 5 },
      createdAt: "2026-06-17T00:00:00.000Z",
    },
  ],
});

describe("worker auth gate", () => {
  afterEach(() => {
    __setSessionResolverForTests(null);
  });

  describe("without a session", () => {
    beforeEach(() => {
      __setSessionResolverForTests({ resolve: () => Promise.resolve(null) });
    });

    it("rejects completion with 401", async () => {
      const response = await app.request("/v1/game/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: completeBody,
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("unauthorized");
    });

    it("rejects a sync push with 401", async () => {
      const response = await app.request("/v1/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pushBody,
      });

      expect(response.status).toBe(401);
    });

    it("rejects a sync pull with 401", async () => {
      const response = await app.request("/v1/sync?deviceId=device-a&since=0");

      expect(response.status).toBe(401);
    });
  });

  describe("with a session", () => {
    beforeEach(() => {
      __setSessionResolverForTests({
        resolve: () => Promise.resolve({ userId: "user-1" }),
      });
    });

    it("lets an authenticated completion through the gate", async () => {
      const response = await app.request("/v1/game/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: completeBody,
      });

      expect(response.status).toBe(200);
    });
  });
});

describe("worker auth handler mount", () => {
  afterEach(() => {
    __setSessionResolverForTests(null);
  });

  it("returns 503 when auth is unconfigured (no secret or database bound)", async () => {
    const response = await app.request("/v1/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "player@example.com" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("auth_not_configured");
  });
});
