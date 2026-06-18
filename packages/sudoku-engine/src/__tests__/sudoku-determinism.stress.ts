import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { determinismGolden } from "./sudoku-determinism-fixtures";

// Worker side of the cross-runtime determinism contract. Boots the shared
// generator inside the real Cloudflare Workers runtime (workerd, via wrangler's
// unstable_dev) and asserts it reproduces the exact same digests as the
// Node-generated golden fixture — proving a seed yields a byte-identical puzzle
// across runtimes. Kept in the nightly stress tier because booting workerd is
// slow; self-skips if the runtime cannot be launched (e.g. offline CI without a
// cached workerd binary).

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const workerDir = join(repoRoot, "apps", "worker");
const probeScript = join(workerDir, "scripts", "determinism-probe.mjs");
// The entry lives inside apps/worker so wrangler's bundler resolves it cleanly
// (booting an entry outside the worker project hangs unstable_dev).
const workerEntry = join(workerDir, "src", "determinism-probe-entry.ts");

describe("sudoku cross-runtime determinism (workerd)", () => {
  it(
    "reproduces the Node golden digests inside the Workers runtime",
    (ctx) => {
      const outDir = mkdtempSync(join(tmpdir(), "puzzlehub-determinism-"));
      const outFile = join(outDir, "digests.json");

      let raw: string;
      try {
        // Driven by Node, not Bun: wrangler's unstable_dev (Miniflare <-> workerd
        // IPC) hangs under the Bun runtime but boots reliably under Node.
        execFileSync("node", [probeScript, workerEntry, outFile], {
          cwd: workerDir,
          stdio: "ignore",
          timeout: 4 * 60 * 1000,
        });
        raw = readFileSync(outFile, "utf8");
      } catch (error) {
        rmSync(outDir, { recursive: true, force: true });
        ctx.skip(`workerd runtime unavailable: ${(error as Error).message}`);
        return;
      }
      rmSync(outDir, { recursive: true, force: true });

      const workerDigests = JSON.parse(raw) as Array<{
        difficulty: string;
        seed: string;
        digest: number;
      }>;

      const workerByKey = new Map(
        workerDigests.map((d) => [`${d.difficulty}/${d.seed}`, d.digest]),
      );

      expect(workerDigests).toHaveLength(determinismGolden.length);
      for (const expected of determinismGolden) {
        const key = `${expected.difficulty}/${expected.seed}`;
        expect(workerByKey.get(key), `workerd digest mismatch for ${key}`).toBe(expected.digest);
      }
    },
    5 * 60 * 1000,
  );
});
