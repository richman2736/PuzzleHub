# Mobile Testing

This project uses two layers for Sudoku mobile quality:

1. Pure TypeScript regression tests for rules and UI state that do not need a simulator.
2. Maestro smoke tests against the installed iOS development app.

## Commands

Run all repository-level logic tests:

```sh
bun run test
```

Run the iOS simulator smoke test:

```sh
bun run test:mobile:e2e
```

The smoke test targets the development bundle id:

```text
app.puzzlehub.mobile.dev
```

## Simulator Prerequisites

- `PuzzleHub Dev` must be installed on the simulator.
- Metro/dev-client must be running for the development build.
- Maestro CLI must be installed and available on `PATH`.
- `apps/mobile/scripts/run-maestro-ios.sh` auto-detects Homebrew Java (`openjdk` or
  `openjdk@17`) and sets `JAVA_HOME` for Maestro without requiring a system Java symlink.

Official Maestro docs currently describe React Native support through accessibility-layer
automation, `testID` selectors, Expo development build support, and local simulator execution:

- https://docs.maestro.dev/get-started/supported-platform/react-native
- https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli
- https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options

On macOS, Maestro's documented install options are Homebrew or the install script. It also
requires Java 17 or newer.

## Smoke Coverage

`apps/mobile/.maestro/sudoku-smoke.yaml` verifies:

- The Sudoku screen and board render.
- Settings opens.
- Light/dark appearance controls are reachable.
- Norwegian language selection is reachable.
- Restart from settings returns to the board.
- A cell can be selected.
- Notes mode can enter a candidate.
- Answer mode can submit a digit.
- Undo and erase actions are reachable.
- Game menu opens and closes.
- Pause can be toggled.

## Regression Coverage

`apps/mobile/src/__tests__/sudokuUiModel.test.ts` verifies:

- Selecting one cell does not select the same row, column, or 3x3 box.
- Incorrect-answer feedback stays scoped to the mistake cell.
- Cell and digit automation ids are stable.
- Keypad digit state does not expose remaining-count labels or badges.
- Candidate digits only activate the keypad while note mode is active.

## Remaining Test Gaps

- Add a dedicated local-storage resume test that closes and relaunches the app.
- Add an offline/sync reconciliation E2E after real sync flushing exists.
- Add CI artifacts for Maestro screenshots and HTML output.
- Add Playwright coverage for web/admin surfaces later.
