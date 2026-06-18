import { describe, expect, it } from "vitest";

import { createSeededRng, hashSeed, shuffle } from "@puzzlehub/game-core";

import { generateSudoku } from "../index";
import { determinismGolden, goldenRngVectors, puzzleDigest } from "./sudoku-determinism-fixtures";

// Node side of the cross-runtime determinism contract. The same golden digests
// are reproduced inside the Cloudflare Workers runtime by the nightly
// `sudoku-determinism.stress.ts` suite; together they prove a seed yields a
// byte-identical puzzle across runtimes. The mobile (Hermes) bundle imports the
// same package and is covered by the same golden reference.
describe("sudoku cross-runtime determinism", () => {
  it("reproduces the golden determinism digests in Node", () => {
    for (const expected of determinismGolden) {
      const generated = generateSudoku({ difficulty: expected.difficulty, seed: expected.seed });

      expect(generated.puzzle.clueCount, `${expected.difficulty}/${expected.seed} clueCount`).toBe(
        expected.clueCount,
      );
      expect(generated.puzzle.rating.score, `${expected.difficulty}/${expected.seed} score`).toBe(
        expected.score,
      );
      expect(
        generated.puzzle.rating.maxTechnique,
        `${expected.difficulty}/${expected.seed} maxTechnique`,
      ).toBe(expected.maxTechnique);
      expect(puzzleDigest(generated), `${expected.difficulty}/${expected.seed} digest`).toBe(
        expected.digest,
      );
    }
  });

  it("generates byte-identical puzzles for repeated seeds", () => {
    for (const { difficulty, seed } of determinismGolden) {
      const first = generateSudoku({ difficulty, seed });
      const second = generateSudoku({ difficulty, seed });

      expect(second.puzzle.grid).toEqual(first.puzzle.grid);
      expect(second.solution.grid).toEqual(first.solution.grid);
      expect(puzzleDigest(second)).toBe(puzzleDigest(first));
    }
  });

  it("pins the shared seeded RNG primitives", () => {
    expect(hashSeed("puzzlehub")).toBe(goldenRngVectors.hashSeed);

    const rng = createSeededRng("puzzlehub-rng");
    const rngInts = Array.from({ length: goldenRngVectors.rngInts.length }, () =>
      Math.floor(rng() * 1_000_000),
    );
    expect(rngInts).toEqual([...goldenRngVectors.rngInts]);

    expect(shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], createSeededRng("shuffle-seed"))).toEqual([
      ...goldenRngVectors.shuffle,
    ]);
  });
});
