import { defineConfig } from "vitest/config";

// Slow nightly stress suite, kept separate from the fast PR `vitest run`.
// Run with `bun run test:stress`.
export default defineConfig({
  test: {
    include: ["packages/**/*.stress.ts"],
    testTimeout: 10 * 60 * 1000,
    hookTimeout: 10 * 60 * 1000,
    // Let the per-difficulty distribution logs reach stdout so a nightly run
    // surfaces a maxTechnique shift even when every assertion still passes.
    disableConsoleIntercept: true,
  },
});
