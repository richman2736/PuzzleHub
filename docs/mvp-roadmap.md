# PuzzleHub MVP Roadmap

## Phase 1: Foundation

- Bun workspace
- Expo mobile app
- Cloudflare Worker API
- Drizzle schema
- shared Zod validation
- local development services
- CI checks

## Phase 2: Production Sudoku

- polished mobile Sudoku UI
- generator and solver
- unique-solution validation
- notes, undo, hints, mistakes, timer, pause
- daily Sudoku seeds
- local SQLite persistence
- sync queue

## Phase 3: Retention

- daily challenges
- streaks
- XP
- achievements
- statistics
- leaderboard

## Phase 4: Expand Games

Add games in this order:

1. Block Puzzle
2. Sort Puzzle
3. Word Search
4. Nonogram

Each game should implement the shared `GameEngine` shape from `packages/game-core`.

## Deferred

- advanced sync engines
- Vipps login
- Twilio
- PostHog
- full admin platform
- complex monetization
- multiplayer
