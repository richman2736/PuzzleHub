import { hashSeed } from "@puzzlehub/game-core";
import {
  type GeneratedSudoku,
  generateSudoku,
  sudokuAlgorithmVersion,
} from "@puzzlehub/sudoku-engine";

// Test-only Worker entry (never imported by the production worker, so it is not
// in the deploy graph). The nightly `sudoku-determinism.stress.ts` boots this in
// workerd and asserts the digests match the Node-generated golden fixture.
//
// The digest logic and case list below MUST mirror
// `packages/sudoku-engine/src/__tests__/sudoku-determinism-fixtures.ts`; any
// drift surfaces immediately as a digest mismatch in that test.

const difficulties = ["easy", "medium", "hard", "expert", "master"] as const;
const seeds = ["alpha", "bravo", "charlie", "delta", "echo"] as const;

function puzzleDigest(generated: GeneratedSudoku): number {
  return hashSeed(
    JSON.stringify([
      sudokuAlgorithmVersion,
      generated.puzzle.grid,
      generated.puzzle.clueCount,
      generated.puzzle.rating.score,
      generated.puzzle.rating.maxTechnique,
      generated.solution.grid,
    ]),
  );
}

export default {
  fetch(): Response {
    const digests = difficulties.flatMap((difficulty) =>
      seeds.map((seed) => ({
        difficulty,
        seed,
        digest: puzzleDigest(generateSudoku({ difficulty, seed })),
      })),
    );

    return Response.json(digests);
  },
};
