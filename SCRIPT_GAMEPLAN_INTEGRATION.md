# Script ↔ Game Plan Integration Roadmap

> Plan for tightening the loop between the **Game Plan board** and downstream
> tabs (script, wristband, call sheet, playbook). Captures what shipped in
> v405 and what is still on deck.

---

## Concept

The Game Plan board is the **source of truth** for the plays we plan to call
this week. Every other surface should be able to ask:

1. _Is this play in the game plan for this opponent?_
2. _Is it marked for the wristband?_
3. _Is it a JV / freshmen play?_

Plays in `board.assignments[boxId]` carry an optional `_gpFlags` object:

```js
play._gpFlags = { wb: true, jv: true };
```

`_gpFlags` is **excluded from `_gpPlaySignature`** so it never breaks
matching, drag-and-drop, or downstream pushes.

---

## Cross-page filter helpers (shipped v405, in `gameplan.js`)

| Function                                  | Purpose                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| `getGamePlanBoardSignatures()`            | `Set<sig>` of every play assigned to the current board    |
| `isPlayInGamePlanBoard(play)`             | `true` if play matches any board assignment               |
| `isPlayFlaggedInGamePlan(play, "wb"\|"jv")` | `true` if any board copy has the flag set              |
| `getGamePlanFlaggedPlays("wb"\|"jv")`     | Array of unique flagged play snapshots (flags stripped)   |
| `getGamePlanFlaggedCount("wb"\|"jv")`     | Count of unique flagged signatures                        |

These are intentionally global — any tab can call them without a dependency.

---

## Shipped in v405

- **Game plan chips** now show two small toggle buttons (📋 / 🟡). Tapping
  toggles the WB or JV flag on that assignment.
- **`📋 Build WB Card (N)`** button in the gameplan header creates a new
  wristband card named `vs <Opponent> (Game Plan)` filled with WB-flagged plays.
- **Playbook** has a `🟡 JV Only` checkbox next to the existing `🎯 Game Plan
  Only` filter.
- **Script (Available Plays)** strip has new `🎯 Game Plan` and `🟡 JV` chips
  that filter by board membership / JV flag respectively.

## Shipped in v406

- **Call sheet picker** has `🎯 Game Plan` + `🟡 JV` checkboxes that filter the
  source list (cleared on `Clear Filters`).
- **Script Available toolbar** has `🎯 Load Game Plan` and `🟡 Load JV` bulk
  buttons that drop board / JV-marked plays directly into a chosen period.
- **Game plan print modal** has a `🟡 JV only` toggle that prints only the
  JV-marked plays and auto-hides empty boxes.
- **Dashboard game plan card** shows `🎯 / 📋 / 🟡` counters for on-board,
  wristband-marked, and JV-marked totals.

## Shipped in v407

- **Playbook** rows show small `🟡` and `📋` overlay badges when a play is
  marked JV / wristband in the Game Plan.
- **Playbook empty state** for the JV filter explains how to mark plays when
  none exist yet.
- **Build WB Card** prompts to apply the current wristband sort to the new
  card when sort criteria are configured.

---

## Shipped in v408

- **Period-from-box** — every game plan box header has a `📋 To Period` button
  that pulls just that box's plays into a chosen script period (honors box
  sort, prefers fresh playbook copies, falls back to snapshots).
- **From-game-plan card color** — `Build WB Card` now pre-picks light blue
  (`#cce5ff`) so the new card reads visually as "from the game plan."
- **Call sheet picker** chips show live count badges (e.g. `🎯 Game Plan (12)`,
  `🟡 JV (4)`) updated every time the picker repopulates.

---

## On deck (not yet shipped)

### Script editing with game plan plays

- **"JV Period" smart fill** — auto-add a period at the end of the script
  filled with all `_gpFlags.jv` plays for travel-up freshmen reps.

---

## Data integrity

- `_gpFlags` is stripped on push to:
  - Wristband (via `sendGamePlanToWristbandCard`)
  - Script (existing `pushGamePlanToScript` already shallow-copies; no flag
    leakage in practice but verify when adding JV-period auto-fill)
  - Call sheet (existing `pushGamePlanToCallSheet`; same)
- Snapshots (`gameplan-snapshots.js`) preserve `_gpFlags` because they
  serialize the entire `assignments` object verbatim. Loading a snapshot
  restores the marks — intended.
- `compareGamePlans` ignores `_gpFlags` because the diff hashes by signature.

---

## Acceptance check (manual)

1. Open Game Plan, drop a few plays into a couple of boxes.
2. Tap 📋 on three plays. Header button reads `📋 Build WB Card (3)`.
3. Tap it → new card appears in Wristband tab named `vs <opp> (Game Plan)`
   with those three plays in cells 0–2.
4. Tap 🟡 on two plays. Switch to Script tab → tick `🟡 JV` → only those
   two plays appear in Available.
5. Switch to Playbook tab → tick `🟡 JV Only` → same two plays appear.
6. Reload page → flags persist (stored under `STORAGE_KEYS.GAME_PLAN_BOARDS`).
