# PuzzleHub Context

PuzzleHub is a monorepo for a premium daily puzzle app. The first concrete goal is one excellent Sudoku module.

Primary stack:

- Expo SDK 56 and React Native for mobile
- Cloudflare Workers, Hono, Zod for API
- Drizzle and Postgres schema for persistence
- Bun workspace and Vitest for shared TypeScript packages

Do not implement all puzzle games at once. Add each new engine behind the shared game-core contract.
