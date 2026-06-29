# Sudoku Positive Feedback Plan

## Status

Draft for implementation.

## Goal

When a player enters a correct Sudoku digit, PuzzleHub should give a short, premium-feeling confirmation that supports mastery without interrupting solving flow.

The feedback should feel like:

- "That move landed."
- "I am making progress."
- "The app is polished and responsive."

It should not feel like:

- A casino/gamey reward loop.
- A popup for every small action.
- The app is solving the puzzle for the player.

## Product Decision

Add subtle positive feedback for correct entries.

Do not add XP, medal, achievement, confetti, modal, leaderboard movement, or text praise per cell. Those rewards remain reserved for meaningful milestones, especially puzzle completion.

## Design Principles

1. Support competence.
   - Correct input should feel acknowledged.
   - The player should feel more confident, not distracted.

2. Preserve autonomy.
   - Feedback should be configurable.
   - Advanced players should be able to reduce or disable correctness feedback.

3. Keep feedback informational.
   - The feedback says "your action succeeded".
   - It should not pressure the player, grade them loudly, or over-celebrate routine moves.

4. Make bigger moments feel bigger.
   - Single correct digit: tiny feedback.
   - Completed row/column/box/digit set: stronger feedback.
   - Completed puzzle: full reward modal.

## Recommended UX

### Correct Digit

Trigger when the user enters a correct answer digit in an empty playable cell.

Visual:

- Cell gets a short accent pulse/glow.
- Duration: 120-180ms.
- No text.
- No modal.
- No score flyout.
- No layout movement.

Haptic:

- Very light selection haptic.
- Do not use strong success haptic per digit.

### Incorrect Digit

Keep current incorrect-cell feedback.

Future setting:

- Auto-check on: show wrong-entry feedback immediately.
- Auto-check off: allow pencil-and-paper mode with no correctness reveal until completion or manual check.

### Completed House

Trigger when a move completes one or more of:

- Row.
- Column.
- 3x3 box.

Visual:

- Subtle sweep or soft highlight across the completed house.
- Duration: 220-320ms.
- If multiple houses complete from one digit, animate them together, not sequentially.

Haptic:

- Light success haptic, but only if haptics are enabled.

### Completed Digit Set

Trigger when all nine instances of a digit are complete.

Visual:

- Brief accent state on that digit in the number pad.
- Optional tiny "complete" marker state, not a popup.

Haptic:

- Same as completed house or no extra haptic if a house completion already fired.

### Completed Puzzle

Keep this as the real reward moment.

Visual:

- Completion modal.
- XP.
- Medal.
- Streak.
- Personal records.
- Achievements.

## Settings

Add a new player preference later in the settings modal:

`Move feedback`

Options:

- `Subtle` default.
- `Off`.
- `Full`.

First implementation can ship with only the default behavior if we keep it subtle. Add the setting before introducing stronger animations or if user testing shows some players find correctness feedback intrusive.

## Implementation Plan

### Phase 1: Minimal Correct Digit Feedback

Scope:

- Add transient state for the last correct cell.
- Apply a short visual style to that cell.
- Clear the state automatically after the animation window.
- Keep existing wrong-entry behavior unchanged.

Likely files:

- `apps/mobile/App.tsx`
- `apps/mobile/src/sudokuUiModel.ts`
- `apps/mobile/src/__tests__/sudokuUiModel.test.ts`

Implementation notes:

- Use the existing `applySudokuMove` result.
- Only trigger for `mode: "answer"` and `result.correct === true`.
- Do not trigger for notes.
- Do not trigger for erase.
- Do not trigger for hint in the first version, because hints are help, not player mastery.
- Do not show feedback when state is paused/completed.
- Keep feedback local UI state only; do not store it in SQLite.

Acceptance criteria:

- Correct manual digit gives visible but subtle cell feedback.
- Incorrect digit still shows current incorrect feedback.
- Notes mode does not trigger correct feedback.
- Hint does not trigger correct feedback.
- No layout shift.
- `bun run test` passes.
- `bun run test:mobile:e2e` passes.

### Phase 2: Completed House Feedback

Scope:

- Detect when a correct move completes a row, column, or box.
- Highlight the completed house briefly.
- Avoid multiple competing animations.

Likely helper:

- `getCompletedSudokuHousesBeforeAfter(previousGrid, nextGrid, move)`

Placement:

- Prefer `apps/mobile/src/sudokuUiModel.ts` because this is presentation state derived from game state.
- Keep core Sudoku rules in `packages/sudoku-engine`; do not move visual event logic there unless it becomes shared game behavior.

Acceptance criteria:

- Completing a row highlights that row.
- Completing a column highlights that column.
- Completing a box highlights that box.
- Completing multiple houses in one move does not create noisy repeated effects.
- Existing board highlights still work.

### Phase 3: Completed Digit Feedback

Scope:

- Detect when the final copy of a digit is placed.
- Add a calmer completed state to the number pad.

Design:

- The number pad button can dim slightly or show a small completion mark.
- Do not remove the digit button entirely; stable layout is more important.

Acceptance criteria:

- Completed digit remains visible but clearly inactive.
- Number pad does not resize.
- Accessibility state still reports disabled when complete.

### Phase 4: Preferences

Scope:

- Add feedback preference to app preferences.
- Add UI in settings.
- Respect preference in all move-feedback triggers.

Possible values:

```ts
type SudokuMoveFeedbackPreference = "off" | "subtle" | "full";
```

Acceptance criteria:

- Preference persists locally.
- `off` disables correct and completion micro-feedback.
- `subtle` keeps default behavior.
- `full` can later enable stronger house/digit effects.

## Technical Notes

- Keep all feedback local-first and UI-only.
- Do not add backend events for per-cell feedback.
- Do not store feedback events in the outbox.
- Do not expose puzzle solutions from Worker responses.
- Avoid new animation dependencies. Use existing React Native/Reanimated capabilities if needed.
- Keep animation durations short enough that fast solvers can continue tapping without waiting.

## Test Plan

Unit tests:

- Correct-cell UI flag is derived correctly.
- Completed row/column/box detection works.
- Notes/hints/erase do not trigger manual correct feedback.

Mobile smoke:

- Start daily Sudoku.
- Select a cell.
- Enter a digit.
- Switch notes mode.
- Enter a note.
- Use erase.
- Open settings.

Manual visual QA:

- Dark mode.
- Light mode.
- iPhone 17 simulator.
- A small screen if available.
- Fast repeated inputs.
- Completed row/column/box scenario.

## Rollout Recommendation

Implement Phase 1 first.

Then test on-device for feel before adding completed-house feedback. If Phase 1 already makes the game feel more responsive, keep Phase 2 very restrained.

Do not implement XP or achievements per move.

## Open Questions

- Should correct feedback be disabled when future "auto-check" is off?
  - Recommendation: yes.

- Should hint-filled cells get the same positive feedback?
  - Recommendation: no. A hint should feel helpful, not like player mastery.

- Should completed house feedback trigger on hints?
  - Recommendation: no in first version.

- Should we add sound?
  - Recommendation: no for now. Haptic plus visual feedback is enough.

## References

- Sudoku.com app listing: highlights hints, auto-check, and duplicate highlighting as support tools rather than per-cell rewards.  
  https://play.google.com/store/apps/details?hl=en_US&id=com.easybrain.sudoku.android

- Good Sudoku: positions its value around elegant layout, intelligent hints, and reduced busywork.  
  https://www.playgoodsudoku.com/

- Logic Wiz: emphasizes smart hints, performance tracking, statistics, accomplishments, and a polished interface.  
  https://logic-wiz.com/

- Self-Determination Theory: motivation is supported by competence, autonomy, and relatedness; this supports subtle informational feedback over controlling rewards.  
  https://selfdeterminationtheory.org/theory/

- Deci and Ryan, "The What and Why of Goal Pursuits": positive feedback can support intrinsic motivation when it signals competence.  
  https://selfdeterminationtheory.org/SDT/documents/2000_DeciRyan_PIWhatWhy.pdf

- Sailer and Homner, "The Gamification of Learning: A Meta-Analysis": gamification has small positive effects on motivational outcomes, but design quality matters.  
  https://eric.ed.gov/?id=EJ1245270

- Apple Human Interface Guidelines, Feedback: feedback should help people understand results of actions and avoid mistakes.  
  https://developer.apple.com/design/human-interface-guidelines/feedback

- Apple Human Interface Guidelines, Playing Haptics: haptics should be purposeful and aligned with the action.  
  https://developer.apple.com/design/human-interface-guidelines/playing-haptics
