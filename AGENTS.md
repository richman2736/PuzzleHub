# Agent Notes

Start with Sudoku quality before expanding the surface area.

- Keep shared game rules in `packages/game-core`.
- Put Sudoku-specific generation and solving in `packages/sudoku-engine`.
- Do not expose puzzle solutions from public Worker responses.
- Prefer local-first mobile behavior; sync is backup and reconciliation.
- Add tests for every puzzle generator before wiring it into the app.
