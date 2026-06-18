import type { Difficulty } from "@puzzlehub/game-core";
import { hashSeed } from "@puzzlehub/game-core";

import { type GeneratedSudoku, sudokuAlgorithmVersion, type SudokuRatingTechnique } from "../index";

// Cross-runtime determinism contract. The same { seed, algorithmVersion,
// difficulty } must yield a byte-identical puzzle on every supported runtime
// (Node, the Cloudflare Workers runtime, and the React Native / Hermes mobile
// bundle). These golden digests are the canonical reference: the Node suite
// reproduces them in-process and the nightly Worker suite reproduces them inside
// workerd. Regenerate intentionally (and bump the algorithm version) if the
// generator output legitimately changes.

export interface DeterminismCase {
  difficulty: Difficulty;
  seed: string;
}

export interface DeterminismGolden extends DeterminismCase {
  clueCount: number;
  score: number;
  maxTechnique: SudokuRatingTechnique;
  digest: number;
}

// A stable digest over exactly the fields a player-visible puzzle exposes plus
// its solution, hashed with the shared FNV-1a primitive so Node and workerd
// compute it identically. JSON.stringify over number arrays is order-stable.
export function puzzleDigest(generated: GeneratedSudoku): number {
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

export const determinismGolden: DeterminismGolden[] = [
  {
    difficulty: "easy",
    seed: "alpha",
    clueCount: 42,
    score: 20,
    maxTechnique: "naked-single",
    digest: 3099187207,
  },
  {
    difficulty: "easy",
    seed: "bravo",
    clueCount: 42,
    score: 20,
    maxTechnique: "naked-single",
    digest: 347432105,
  },
  {
    difficulty: "easy",
    seed: "charlie",
    clueCount: 42,
    score: 20,
    maxTechnique: "naked-single",
    digest: 1685239831,
  },
  {
    difficulty: "easy",
    seed: "delta",
    clueCount: 42,
    score: 20,
    maxTechnique: "naked-single",
    digest: 3150213355,
  },
  {
    difficulty: "easy",
    seed: "echo",
    clueCount: 42,
    score: 20,
    maxTechnique: "naked-single",
    digest: 527902146,
  },
  {
    difficulty: "medium",
    seed: "alpha",
    clueCount: 36,
    score: 20,
    maxTechnique: "naked-single",
    digest: 2030163563,
  },
  {
    difficulty: "medium",
    seed: "bravo",
    clueCount: 36,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 976889878,
  },
  {
    difficulty: "medium",
    seed: "charlie",
    clueCount: 36,
    score: 20,
    maxTechnique: "naked-single",
    digest: 2994858775,
  },
  {
    difficulty: "medium",
    seed: "delta",
    clueCount: 36,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 1448408657,
  },
  {
    difficulty: "medium",
    seed: "echo",
    clueCount: 36,
    score: 20,
    maxTechnique: "naked-single",
    digest: 907708321,
  },
  {
    difficulty: "hard",
    seed: "alpha",
    clueCount: 31,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 3972203538,
  },
  {
    difficulty: "hard",
    seed: "bravo",
    clueCount: 31,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 2819359578,
  },
  {
    difficulty: "hard",
    seed: "charlie",
    clueCount: 31,
    score: 20,
    maxTechnique: "naked-single",
    digest: 636907989,
  },
  {
    difficulty: "hard",
    seed: "delta",
    clueCount: 31,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 1972258699,
  },
  {
    difficulty: "hard",
    seed: "echo",
    clueCount: 31,
    score: 20,
    maxTechnique: "naked-single",
    digest: 2676340159,
  },
  {
    difficulty: "expert",
    seed: "alpha",
    clueCount: 27,
    score: 1107,
    maxTechnique: "search",
    digest: 1943781834,
  },
  {
    difficulty: "expert",
    seed: "bravo",
    clueCount: 27,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 1130319600,
  },
  {
    difficulty: "expert",
    seed: "charlie",
    clueCount: 27,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 663993903,
  },
  {
    difficulty: "expert",
    seed: "delta",
    clueCount: 27,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 3846612385,
  },
  {
    difficulty: "expert",
    seed: "echo",
    clueCount: 27,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 3131919143,
  },
  {
    difficulty: "master",
    seed: "alpha",
    clueCount: 26,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 2312093791,
  },
  {
    difficulty: "master",
    seed: "bravo",
    clueCount: 27,
    score: 1096,
    maxTechnique: "search",
    digest: 2636090861,
  },
  {
    difficulty: "master",
    seed: "charlie",
    clueCount: 24,
    score: 240,
    maxTechnique: "locked-candidates",
    digest: 3441832485,
  },
  {
    difficulty: "master",
    seed: "delta",
    clueCount: 25,
    score: 1065,
    maxTechnique: "search",
    digest: 1157866338,
  },
  {
    difficulty: "master",
    seed: "echo",
    clueCount: 25,
    score: 120,
    maxTechnique: "hidden-single",
    digest: 3088143214,
  },
];

export const determinismCases: DeterminismCase[] = determinismGolden.map(
  ({ difficulty, seed }) => ({ difficulty, seed }),
);

// Golden outputs of the shared cross-runtime primitives in @puzzlehub/game-core.
export const goldenRngVectors = {
  hashSeed: 3272560724,
  rngInts: [767824, 957255, 34243, 565909, 426473, 98100, 465177, 832957],
  shuffle: [4, 0, 8, 9, 1, 3, 2, 5, 7, 6],
} as const;
