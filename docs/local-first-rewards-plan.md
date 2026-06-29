# Local-First Rewards Plan

Status: implemented for the first local Sudoku rewards slice, local daily seed
rotation, and local progress view
Scope: Sudoku MVP

## Decision

PuzzleHub should not depend on server-side rewards for the first complete player
experience. For the MVP, the player competes against themselves. XP, medals,
personal records, stats, streaks, and achievements are awarded locally and work
offline.

The existing server-side completion, stats, achievement, and leaderboard code is
kept as future infrastructure, but it is not required for the first rewards
experience.

## Goal

When a player completes a Sudoku puzzle, the app should immediately show a
complete local reward summary:

- XP earned
- Medal
- Score, time, mistakes, and hints
- New personal records
- Updated streak
- Newly unlocked achievements

Everything must be stored locally on the device and survive app restarts.

## Not In This Slice

- Global leaderboard
- Competition against other players
- Server-validated completion
- Required login
- Server-confirmed XP
- "Waiting for sync" reward state
- Anti-cheat
- Account-level progression

These can be added later once the local experience feels complete.

## Product Behavior

The player gets rewarded immediately after finishing a puzzle. The app does not
wait for a network request and does not require an account.

If the device is offline, nothing changes for the player. Completion, XP,
achievements, streaks, and personal stats are all saved locally.

Server sync, if added later, should behave as backup and cross-device restore,
not as a blocker for the reward moment.

The mobile app should generate the local daily Sudoku from the current local
calendar date. This gives the player a new daily puzzle without requiring a
server request.

The player can also open a local progress view from the Sudoku screen to see
total games, XP, records, streaks, and locked or unlocked achievements.

## Visual Quality Sprint 1

Status: implemented for the first board interaction and visual hierarchy pass
Goal: make the Sudoku screen feel like a calm, premium daily puzzle experience
before the next TestFlight build.

This sprint should improve visual quality without adding new product scope.
Sudoku remains the focus, and the board should feel like the primary object on
the screen.

### Direction

- Calm premium daily puzzle.
- Less dashboard, less technical surface.
- The Sudoku board is the visual anchor.
- Controls should feel native, touch-friendly, and quiet.
- Progress and settings should remain available, but not compete with gameplay.

### Priorities

1. Improve board interaction quality:
   - selected cell
   - related row, column, and box highlight
   - same-number highlight
   - clearer given/input/notes contrast
   - calmer incorrect-cell feedback
2. Refine visual hierarchy:
   - smaller header
   - more discreet stats
   - less dominant trophy/settings controls
   - no normal sync/status noise unless the player needs to know
3. Lighten the bottom control area:
   - keep the 2-row number pad
   - reduce heavy panel framing
   - make hint, undo, notes, and erase feel polished rather than utilitarian
   - preserve one-handed thumb usability
4. Improve theme tokens:
   - add explicit tokens for selected, related, same-digit, pressed, raised,
     success, warning, and danger states
   - avoid a one-note teal interface
   - make dark mode premium, but consider light mode as the default feel later
5. Screenshot-review loop:
   - take simulator screenshots after each meaningful visual pass
   - review dark mode first
   - check light mode before TestFlight
   - verify that text and controls do not overlap on the iPhone simulator

### Definition Of Done

- The main Sudoku screen looks polished enough for TestFlight review.
- Empty space is intentional, not leftover.
- The board is easier to scan because selected, related, and same-number cells
  are visually distinct.
- The bottom controls feel lighter while remaining easy to tap.
- A fresh simulator screenshot is attached to the implementation summary.

### Implemented In First Pass

- Added selected, related row/column/box, and same-number cell states to the
  mobile Sudoku UI model.
- Added tests for related-cell and same-number highlighting.
- Applied the new board states in the mobile Sudoku board.
- Reduced normal technical status noise on the main screen.
- Reduced top header/control weight.
- Lightened the bottom control area while keeping the 2-row number pad.

### Implemented In Second Pass

- Increased dark-mode related-cell and same-number highlight contrast.
- Added a subtle selected-cell outline.
- Reduced header, icon, and stats visual weight further.
- Tuned the dark palette away from a flat teal-heavy interface.
- Confirmed the large floating gear in simulator screenshots is the Expo
  development menu overlay, not production app UI.

### Implemented In QA Polish Pass

- Checked light mode from the simulator by switching the local app theme
  preference.
- Updated the Maestro smoke flow to match the current native bundle id and the
  new settings-to-game-menu route.
- Gave completion, progress, settings, and game-menu modals the same calmer
  bordered surface treatment as the main screen.
- Verified Maestro with Homebrew OpenJDK 17 and ran the mobile Sudoku smoke
  flow successfully.

## Local Data Model

Add local storage for completion history, for example a `sudoku_completions`
table in the mobile SQLite database.

Suggested fields:

- `completion_id`
- `game_id`
- `difficulty`
- `score`
- `xp`
- `elapsed_seconds`
- `mistakes`
- `hints_used`
- `completed_at`
- `is_daily`
- `medal`

Completion should be idempotent per completed game. The same `game_id` should
not award XP twice.

## Local XP Rule

Use a deterministic local XP rule. It can mirror the current server-side rule:

- easy: 10 base XP
- medium: 20 base XP
- hard: 35 base XP
- expert: 55 base XP
- master: 80 base XP
- score bonus: `floor(score / 100)`
- hint penalty: `2 XP` per hint
- final XP never below 0

The rule should live in a pure function with tests, preferably in shared code if
it is likely to be reused later.

## Local Stats

Track local Sudoku stats from the completion log:

- games completed
- total XP
- total score
- best score
- best time
- current streak
- longest streak
- last played date

Stats should be rebuildable from the completion log where practical, so future
sync/import work can replay history safely.

## Personal Records

On completion, detect and surface:

- first completion
- new best score
- new best time
- flawless completion
- new longest streak

These are personal-only signals and do not require server validation.

## Achievements

First local achievement set:

- First Solve: complete the first puzzle.
- Daily Debut: complete a daily puzzle.
- Flawless: complete a puzzle with no mistakes.
- On a Roll: reach a 3-day streak.
- Unstoppable: reach a 7-day streak.
- Hard Mode: complete a hard, expert, or master puzzle.

Achievements should unlock once and remain unlocked locally.

## Medal Rule

Add a local medal for completion feedback:

- Gold: strong score, low time, no or few mistakes, no or few hints.
- Silver: solid completion.
- Bronze: completed.

Medals are personal feedback only. They should not affect global ranking because
there is no global ranking in this slice.

## Completion Modal

Update the completion modal to show:

- Completed
- Score
- Time
- Mistakes
- Hints
- `+X XP`
- Medal
- New personal record messages
- Newly unlocked achievements

The modal should not show server sync status as part of the reward moment.

## Technical Plan

1. Add local completion/reward repository code.
2. Add pure functions for XP, medals, stats, streaks, and achievements.
3. Persist completion exactly once when Sudoku state becomes `completed`.
4. Update the completion modal to read from the local reward result.
5. Add focused tests for all pure reward logic.
6. Add repository tests where local persistence can be tested without a device.
7. Run the standard verification chain.

## Test Plan

Required tests:

- Completing a game writes one completion record.
- Re-submitting the same completed `game_id` does not award XP twice.
- XP calculation is deterministic.
- Medal calculation is deterministic.
- Stats update correctly after one and many completions.
- Streaks handle same-day, consecutive-day, and gap cases.
- Achievements unlock once.
- Personal records are detected correctly.

Recommended mobile checks:

- Complete a puzzle offline and see XP immediately.
- Close and reopen the app; completion history and stats remain.
- Restarting a puzzle does not erase completion history.

## Future Server Phase

After the local experience is complete, server work can be added as a separate
phase:

- sync local completion log
- account login
- restore on a new device
- server-validated daily puzzles
- global leaderboard
- anti-cheat
- cross-device stats and achievements

The future server phase should consume the local completion log instead of
replacing the local-first experience.

## Definition Of Done

A player can complete a Sudoku puzzle offline and immediately receive XP, a
medal, updated personal stats, streak progress, and any newly unlocked
achievements. The data is stored locally and remains available after restarting
the app.
