# READINESS_REIMAGINE_ROADMAP.md

> **30-item engineering plan to reimagine the Play Readiness scoring system.**  
> Audit date: 2026-06-24 · Starting SW: v675

---

## Audit Summary — What's Wrong Today

The current system has **two parallel and disconnected scoring actions** that coaches must mentally distinguish:

| Action | What it logs | When to use |
|---|---|---|
| **Add Rep** | Rep type (11 options) × rep count → weighted points | After *any* practice period |
| **Action Report** | 1–5 score + yards + 7 checkboxes + coach confidence | After a *live/game* rep |
| **Quick Score (1–5)** | *Secretly creates both* a rep entry and an action report | Tapping inline score buttons |

The result is three entry points that silently produce different data shapes, an opaque confidence formula (`60% weighted-rep progress + 30% live score + 10% mistake penalty`), concepts the coach never asked for (install status × 4 options, complexity, weekly sweet spot, weighted rep accumulation), and a badge that shows a mix of percent, weighted numbers, and a confidence label — none of which map to an intuitive mental model.

**The fix:** One action, one concept — **Log a Rep**. Tap 1–5 to grade it. Add optional context. Done.

---

## Design Principles for the New System

1. **One logging action** — "Log a Rep" covers everything. No "Add Rep" vs "Action Report" split.
2. **Score first** — 1–5 execution grade is always step 1. Context (type, notes) is always optional step 2.
3. **No hidden math** — Readiness Score = transparent function of rep count + average score + recency. Coach can verify it in their head.
4. **4 confidence tiers** instead of 5 — "Not Ready / Building / Game Ready / Automatic" mapped directly to the score.
5. **Plain language everywhere** — "12 reps · avg 3.8" instead of "11.5 weighted pts (82% of target)".

---

## New Data Model

```js
// Unified log entry (replaces separate reps[] + actionReports[])
{
  id: "log_...",
  date: "2026-06-24",
  score: 4,              // 1–5 execution grade — always present
  type: "team_scout",    // practice intensity (5 options) — drives rep weight
  notes: "",             // optional free text
  situation: "",         // optional: "3rd short", "red zone", etc.
  defense: "",           // optional: "Cover 2 press", etc.
  explosive: false,      // optional outcome flags
  turnover: false,
  penalty: false,
  createdAt: "..."
}
```

```js
// Simplified record shape
{
  installTier: "installed", // "new" | "installed" | "core"
  notes: "",
  playSnapshot: {},
  logs: [],               // ← unified, replaces reps[] + actionReports[]
  updatedAt: "..."
}
```

### New Confidence Formula

```
repScore       = sum(log.score × typeWeight) / sum(typeWeight)   // weighted average execution
recencyBoost   = (logs from last 14 days).length / total logs    // freshness factor (0–1)
volumeProgress = min(1, totalReps / tierTarget)                  // 0–1 toward tier target
readinessScore = round(repScore/5 × 60 + volumeProgress × 30 + recencyBoost × 10) × 100 / 100
```

Everything maps to a 0–100 score. The four thresholds:

| Score | Label | Meaning |
|---|---|---|
| 0–39 | Not Ready | Don't call in a game |
| 40–64 | Building | Practice only |
| 65–84 | Game Ready | Safe to call |
| 85–100 | Automatic | Call with confidence |

---

## Section 1 — Simplified Data Model (items 1–6)

### 1. 🔴 P0 L — Unify `reps[]` + `actionReports[]` into `logs[]`
**File:** `js/play-readiness.js`, `js/storage.js`  
Add a migration in `runMigrations()` that converts each existing record's `reps[]` and `actionReports[]` into the new `logs[]` shape, matching on `date` ± 1 day if a quick score created both. Run migration at storage version 4. Keep the old fields as `_repsLegacy` / `_actionReportsLegacy` for one version for rollback safety.

---

### 2. 🔴 P0 M — Simplify rep types from 11 to 5 intensity tiers
**File:** `js/play-readiness.js`  
Replace `PLAY_READINESS_REP_TYPES` (11 entries) with 5 clear options that coaches immediately recognize:

| id | Label | Weight |
|---|---|---|
| `mental` | Mental / Film | 0.25 |
| `walkthrough` | Walkthrough / Indy | 0.5 |
| `air` | On Air / Position Group | 0.75 |
| `scout` | vs Scout / Half-Line | 1.0 |
| `live` | Live / Game Rep | 1.5 |

---

### 3. 🔴 P0 M — Drop `complexity` field from the data model and UI
**File:** `js/play-readiness.js`, `index.html`  
`complexity` is stored but never shown to the coach in a meaningful way and doesn't affect the score. Remove from `createPlayReadinessRecord()`, modal forms, and display.

---

### 4. 🔴 P0 M — Collapse install status to 3 tiers: "New / Installed / Core"
**File:** `js/play-readiness.js`  
Replace `PLAY_READINESS_INSTALL_STATUSES` (4 options: New Play / Tag Variation / Base Play / Identity Play) with 3 clear tiers:

| Tier | Rep target | Use for |
|---|---|---|
| `new` | 15 reps | Just installed plays |
| `installed` | 40 reps | Standard playbook calls |
| `core` | 80 reps | Identity / staple calls |

Update `PLAY_READINESS_THRESHOLDS` to match.

---

### 5. 🔴 P0 M — Replace confidence formula with the new transparent 3-part model
**File:** `js/play-readiness.js`  
Replace the opaque `readinessPercent * 0.6 + liveScore * 0.3 + mistakeScore * 0.1` formula in `getPlayReadinessSummary()` with the new formula described in the design section above. Readiness Score is a 0–100 integer.

---

### 6. 🔴 P0 S — Replace 5 confidence labels with 4 tiers
**File:** `js/play-readiness.js`  
Update `getPlayReadinessConfidenceLabel()`:

```js
function getPlayReadinessConfidenceLabel(score) {
  if (score < 40) return "Not Ready";
  if (score < 65) return "Building";
  if (score < 85) return "Game Ready";
  return "Automatic";
}
```

---

## Section 2 — Single Logging Action (items 7–12)

### 7. 🔴 P0 L — Replace "Add Rep" + "Action Report" with a single "Log a Rep" modal
**File:** `js/play-readiness.js`  
Delete `openPlayReadinessRepModalForPlay()` and `openPlayReadinessActionModalForPlay()`. Replace with a single `openPlayReadinessLogModal(play, context)` that shows:

**Step 1 (always visible):** Score 1–5 large tap targets + intensity type selector (5 options)  
**Step 2 (expandable "More detail"):** Date, Notes, Situation, Defense, Explosive/Turnover/Penalty toggles

On submit, save a single `log` entry to `record.logs[]`. The step 2 section starts collapsed so the default flow is 2 taps: score + save.

---

### 8. 🔴 P0 M — Remove "Yards" field from logging modal
**File:** `js/play-readiness.js`  
Remove `yards` from the Action Report modal and from the data model. It is not used in any confidence calculation and adds friction with no payoff.

---

### 9. 🔴 P0 M — Remove "Coach Confidence" manual dropdown
**File:** `js/play-readiness.js`  
Remove the `coachConfidence: "Low/Medium/High"` field from the Action Report modal. Confidence is now *calculated*, not manually stated. Remove from storage model and all display surfaces.

---

### 10. 🔴 P0 S — Remove "Explosive / TD / Turnover / Sack / TFL / Missed Assignment / Penalty" checkboxes
**File:** `js/play-readiness.js`  
The 7 outcome checkboxes add cognitive load and are not referenced in the new confidence formula. Reduce to 3 outcome toggles in the "More detail" section: **Explosive**, **Turnover**, **Penalty**. These are the only ones that meaningfully affect game-call decisions.

---

### 11. 🔴 P0 M — Quick-score (1–5 tap) should fire a minimal log entry immediately
**File:** `js/play-readiness.js`  
Redesign `quickScorePlayReadiness()` to write a single `log` entry with `type: "scout"` (default intensity) and the selected score. No longer secretly creates two records. Shows an undo toast so the coach can reverse a mis-tap.

---

### 12. 🟡 P1 S — Add "Log Rep" shortcut directly from score buttons via long-press
**File:** `js/play-readiness.js`  
Wire `addLongPress()` on each 1–5 score button to open the full Log Rep modal pre-filled with that score, instead of just auto-submitting. Short tap = quick log, long press = full modal with context.

---

## Section 3 — Script Widget UX (items 13–18)

### 13. 🔴 P0 M — Redesign script widget layout: score buttons front-center, one CTA
**File:** `js/play-readiness.js`, `css/script.css`  
Current widget has: label + confidence text + small score buttons + close btn + track bar + rep chips + 4 action buttons (Edit Play / Add Rep / Action Report / History).

New layout:
- Row 1: Large score buttons (1–5) spanning full width
- Row 2: Confidence chip (color-coded) + rep count + avg score in plain text
- Row 3: "Log Rep" button (opens full modal) + "History" link

Remove "Add Rep" and "Action Report" as separate buttons — they no longer exist.

---

### 14. 🔴 P0 S — Enlarge score buttons in the script widget for touch
**File:** `css/script.css`  
Score buttons are currently 28–32px. Increase to `min-height: 44px; flex: 1 1 auto` so the 5 buttons fill the widget width. Touch-friendly minimum target.

---

### 15. 🔴 P0 S — Replace "weighted rep" chip with plain language
**File:** `js/play-readiness.js`  
Replace:  
`"11.5 pts · 8 reps · Confident band"`  
With:  
`"12 reps · avg 3.8 · Game Ready"`  
No decimal weighted math visible to the coach.

---

### 16. 🟡 P1 S — Show last rep result inline in the script widget header
**File:** `js/play-readiness.js`  
After the confidence chip, show a small "Last: Jun 22 · 4/5" span using the most recent log entry so the coach sees recency without opening history.

---

### 17. 🟡 P1 S — Animate score button selection in the widget
**File:** `css/script.css`  
When a score button is tapped and the quick log fires, briefly pulse the active button (CSS `@keyframes pr-pulse`) and update the confidence chip in place rather than re-rendering the whole widget.

---

### 18. 🟡 P1 S — Remove "Seed Sample Data" button from script widget
**File:** `js/play-readiness.js`  
The seed button is conditionally shown in every empty widget row. It's a dev/demo tool. Move it to a dedicated "Reset / Seed" button inside the History modal only.

---

## Section 4 — Playbook Panel (items 19–22)

### 19. 🟡 P1 M — Redesign playbook readiness panel to lead with the Readiness Score
**File:** `js/play-readiness.js`  
Current panel leads with compact badge + weighted metrics. New layout:
- Big number: Readiness Score (0–100) with confidence label below it
- Subrow: "X reps · avg Y/5 · last rep Z days ago"
- Progress bar (simple, no sweet-spot overlay)
- "Log a Rep" primary button
- Last 5 reps log list (date, type, score)
- "All history" link

---

### 20. 🟡 P1 S — Remove weighted rep math from the playbook panel completely
**File:** `js/play-readiness.js`  
Remove display of `weightedReps`, `weeklyWeightedReps`, `readinessPercent`, and `sweet` zone from the playbook panel. Replace with the simplified "X reps · avg Y" format.

---

### 21. 🟡 P1 S — Remove sweet-spot zone from the progress bar
**File:** `js/play-readiness.js`, `css/script.css`  
The sweet-spot overlay (green zone on the progress bar) is confusing without understanding the weighted threshold system. Remove `--pr-sweet-start` and `--pr-sweet-width` CSS vars. Plain fill-bar only.

---

### 22. 🟡 P1 S — Add a mini rep log list to the playbook panel
**File:** `js/play-readiness.js`  
Below the score/metrics row, render the last 5 `logs[]` entries as compact rows:  
`Jun 22 · Scout · 4/5 · "Good clean look vs Cover 2"`  
Tap a row to open History.

---

## Section 5 — Compact Badge (items 23–25)

### 23. 🟡 P1 S — Redesign compact badge to show Score + label only
**File:** `js/play-readiness.js`  
Current badge shows tone color + label + readiness% or score. Simplify to: `[SCORE] Label` — e.g. `[78] Game Ready`. No weighted math, no percent.

---

### 24. 🟡 P1 S — Color-code confidence label chip by tier
**File:** `css/script.css`, `css/playbook.css`  
Use 4 distinct CSS token-based colors for the confidence chip:
- Not Ready → `var(--color-danger)`
- Building → `var(--color-warning)`
- Game Ready → `var(--color-success)`
- Automatic → `var(--color-primary)` (blue/brand)

---

### 25. 🟢 P2 S — Add confidence chip to the script play row (outside the widget)
**File:** `js/play-readiness.js`, `css/script.css`  
Show a small pill on each script play row (next to the rep score widget toggle button) so the coach sees confidence tier at a glance without opening the widget.

---

## Section 6 — History & Presentation (items 26–27)

### 26. 🟡 P1 M — Redesign History modal to show unified log list
**File:** `js/play-readiness.js`  
Current history shows two separate sections: "Rep Log" and "Action Reports". Unify into a single timeline of `logs[]` entries sorted by date descending. Each row: date chip, type icon, score stars (1–5 filled), optional notes.

---

### 27. 🟡 P1 S — Redesign presentation coach card to match new model
**File:** `js/play-readiness.js`  
Replace the presentation coach card's weighted-rep metrics section with: big Readiness Score, confidence label, "X reps · avg Y", last rep date. Add "Log Rep" button. Remove separate Action Report / Add Rep buttons.

---

## Section 7 — Cleanup & Polish (items 28–30)

### 28. 🟢 P2 M — Remove `getPlayReadinessSweetSpot()`, `getPlayReadinessWeeklyWeighted()`, `getPlayReadinessActionMetrics()` dead paths
**File:** `js/play-readiness.js`  
After the new formula is live, the sweet-spot logic, weekly window, and separate action metrics are no longer needed. Delete functions and all callers. Expect ~200 lines removed.

---

### 29. 🟢 P2 S — Update score button labels to match new 4-tier language
**File:** `js/play-readiness.js`  
Update `_SCORE_LABELS`:

```js
const _SCORE_LABELS = ["", "Not Ready", "Developing", "Functional", "Sharp", "Automatic"];
```

Update all `title` and `aria-label` attrs that reference old labels.

---

### 30. 🟢 P2 S — Update help text and tooltips across all surfaces
**File:** `js/help.js`, `js/play-readiness.js`  
Update any help panel content, tooltip text, or empty-state copy that references "weighted reps", "install status", "sweet spot", "Add Rep", or "Action Report". Replace with new vocabulary: "Log a Rep", "Readiness Score", "rep count", "Not Ready / Building / Game Ready / Automatic".

---

## Progress Tracker

| # | Status | Size | Description |
|---|--------|------|-------------|
| 1 | ☐ | L | Unify `reps[]` + `actionReports[]` into `logs[]` with migration |
| 2 | ☐ | M | Simplify rep types from 11 to 5 intensity tiers |
| 3 | ☐ | M | Drop `complexity` field |
| 4 | ☐ | M | Collapse install status to 3 tiers: New / Installed / Core |
| 5 | ☐ | M | Replace confidence formula with transparent 3-part model |
| 6 | ☐ | S | Replace 5 confidence labels with 4 tiers |
| 7 | ☐ | L | Single "Log a Rep" modal replaces Add Rep + Action Report |
| 8 | ☐ | M | Remove Yards field |
| 9 | ☐ | M | Remove Coach Confidence dropdown |
| 10 | ☐ | S | Reduce outcome checkboxes to 3 (Explosive, Turnover, Penalty) |
| 11 | ☐ | M | Quick-score writes one log entry, shows undo toast |
| 12 | ☐ | S | Long-press score button opens full modal pre-filled |
| 13 | ☐ | M | Redesign script widget: large score buttons + single CTA |
| 14 | ☐ | S | Enlarge score buttons (44px min) for touch |
| 15 | ☐ | S | Replace weighted chip text with plain language |
| 16 | ☐ | S | Show last rep result inline in widget header |
| 17 | ☐ | S | Animate score button selection |
| 18 | ☐ | S | Move seed button to History modal only |
| 19 | ☐ | M | Playbook panel leads with Readiness Score (big number) |
| 20 | ☐ | S | Remove weighted math from playbook panel |
| 21 | ☐ | S | Remove sweet-spot overlay from progress bar |
| 22 | ☐ | S | Add mini rep log list to playbook panel |
| 23 | ☐ | S | Compact badge: Score + label only |
| 24 | ☐ | S | Color-code confidence chip by tier |
| 25 | ☐ | S | Confidence pill on script play row (outside widget) |
| 26 | ☐ | M | Unified log timeline in History modal |
| 27 | ☐ | S | Presentation coach card matches new model |
| 28 | ☐ | M | Delete dead helper functions (~200 lines removed) |
| 29 | ☐ | S | Update score button labels to 4-tier language |
| 30 | ☐ | S | Update help text and tooltips across all surfaces |

---

*Audit completed 2026-06-24. Targeting SW v676+.*
