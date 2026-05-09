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

---

## On deck (not yet shipped)

### Script editing with game plan plays

- **"Load Game Plan into Script"** bulk action on the script tab. Pulls every
  play from the current game plan board into the available list as a single
  selection — one click to send all to the script.
- **"JV Period" smart fill** — auto-add a period at the end of the script
  filled with all `_gpFlags.jv` plays for travel-up freshmen reps.
- **Period-from-box** — drag a single gameplan box (e.g. `2-minute`) into a
  script period. We already render box content; the drop target needs to
  read the box, sort by gameplan order, and append.

### Call sheet picker

- Add the same `🎯 Game Plan` / `🟡 JV` toggle chips to the call sheet picker
  toolbar (`callsheet-picker-runtime.js`). Use `isPlayInGamePlanBoard` and
  `isPlayFlaggedInGamePlan(play, "jv")`.
- Show a count badge in the picker header when active.

### Playbook polish

- When the `🟡 JV Only` filter is active without a game plan present, show
  an empty-state hint: _"Mark plays as JV in the Game Plan tab to see them
  here."_
- Optional: `🟡 JV` overlay badge on playbook rows so you can spot them
  without filtering.

### Wristband

- After `sendGamePlanToWristbandCard()` builds the new card, allow a follow-up
  prompt: _"Sort wristband automatically?"_ — call existing wristband sort
  helpers with a default tier.
- Honor card color picker: pre-pick a card color matching `--color-info` so
  the new card visually reads as "from game plan."

### Dashboard

- Surface counters: `# WB-marked` and `# JV-marked` on the dashboard game-plan
  card so you can see at a glance whether the marks are filled in for the
  week.

### Print

- JV-only print of the game plan: `printGamePlan({ jvOnly: true })` — a single
  short page of the freshmen package for travel days.

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
