# PuzzleHub

PuzzleHub is a premium daily brain-puzzle app foundation. The first product slice is Sudoku with local-first play, daily challenges, stats, streaks, and sync added before the other game types.

## Workspace

- `apps/mobile` - Expo/React Native app. The current screen is a usable Sudoku MVP shell.
- `apps/worker` - Cloudflare Worker API with Hono and Zod route validation.
- `apps/web` - Web/admin operations shell for daily puzzle management.
- `packages/game-core` - Shared game contracts, deterministic RNG, and score calculation.
- `packages/sudoku-engine` - Sudoku generator, solver, unique-solution checks, hints, moves, and tests.
- `packages/db` - Drizzle schema for users, puzzles, dailies, progress, stats, achievements, leaderboards, and packs.
- `packages/validation` - Shared API schemas.
- `packages/config` - Shared game catalog, themes, and milestones.

## First Milestone

Build one production-quality Sudoku module before expanding to Block Puzzle, Sort Puzzle, Word Search, and Nonogram.

The MVP target is:

- automatic Sudoku generation
- unique solution checks
- notes, hints, mistakes, timer, pause
- daily Sudoku
- local storage
- account and sync API
- stats, streaks, XP, achievements

## Commands

```bash
bun install
bun run test
bun run typecheck
bun run dev:worker
bun run dev:mobile
bun run dev:web
```

Local services:

```bash
docker compose -f infra/docker-compose.yml up
```

## Notes

The later engines are intentionally stubs. The attached plan is explicit about not building all five games at once; the code follows that by making Sudoku real first and leaving clear package boundaries for the rest.
