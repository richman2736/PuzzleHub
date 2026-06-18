// Boots the cross-runtime determinism worker entry inside workerd (via
// wrangler's unstable_dev) and writes the generated digests to a file. Lives in
// apps/worker so `wrangler` resolves; invoked by the engine's nightly
// `sudoku-determinism.stress.ts`. Usage: bun determinism-probe.mjs <entry> <out>
import { unstable_dev } from "wrangler";
import { writeFileSync } from "node:fs";

const [entry, outFile] = process.argv.slice(2);

if (!entry || !outFile) {
  console.error("usage: determinism-probe.mjs <entry> <outFile>");
  process.exit(2);
}

const worker = await unstable_dev(entry, {
  local: true,
  experimental: { disableExperimentalWarning: true },
});

try {
  const response = await worker.fetch("http://localhost/digests");
  writeFileSync(outFile, await response.text());
} finally {
  await worker.stop();
}
