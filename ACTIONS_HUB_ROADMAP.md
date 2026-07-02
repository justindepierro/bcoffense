# Actions Hub Roadmap — "One door for the verbs you repeat"

> Goal: kill the "I can't find the action I want" problem without a rebuild.
> Every content page gets **one consistent Actions button** in the same spot,
> opening the same short menu of verbs: **Load · Save · Print · Display**
> (+ a small "More / Send to…" section). The location and grammar never change;
> only the contents change per page. Verbs call **existing** global functions —
> this is wiring, not re-architecture.

## Why

Awesome features are buried in modals, dropdowns, drawers, and `⋯ More`
menus. Coaches (and any coach who didn't build the app) can't find them.
Example pain: loading a practice script = Tools drawer → scroll → hidden
"Saved Scripts" section. The Actions hub gives every utility verb a stable,
obvious front door.

## Design principles (borrowed from game/console UIs)

1. **One door per page** — same button, same place, every page.
2. **Stable verb grammar** — Load / Save / Print / Display always mean the same
   category of thing; muscle memory transfers across pages.
3. **Labels over spatial memory** — findability first, so a labeled sheet beats
   a radial wheel (a hold-to-open radial can come later as a speed accelerator).
4. **Route, don't rebuild** — verbs call functions that already exist.
5. **Show state** — Display should tell you the active preset and warn on
   unsaved changes (Phase 3).

## The verb set (canonical)

| Verb       | Meaning                                 |
| ---------- | --------------------------------------- |
| 📂 Load    | Open saved items **and** templates      |
| 💾 Save    | Save current / save as template         |
| 🖨️ Print   | Print / export for this page            |
| ⚙️ Display | Display & format options for this page  |
| ➕ More    | Present, packet, Send to…, Print Studio |

## Phases

### Phase 1 — Shared hub + Script page (PROOF) ✅ shipped (SW v856)

- Add `js/page-actions.js`: shared `openPageActions()` sheet + per-page verb
  registry, calling existing globals.
- Add shared `#pageActionsSheet` overlay + `.page-actions-*` styles.
- Add one **⚡ Actions** button to the Script header (consistent spot).
- Wire Script verbs to existing functions:
  - Load → saved scripts list + Day Templates (`loadScript`, `openScriptTemplatesMenu`)
  - Save → `saveScript`
  - Print → `generatePDF`
  - Display → `toggleScriptDisplayPanel`
  - More → packet, present, Send to Game Plan/Wristband/Call Sheet, Print Studio
- **Acceptance:** load a saved practice script in 2 taps, no drawer, no scroll.

### Phase 2 — Roll the hub to Call Sheet + Wristband ✅ shipped (SW v857)

- Register Call Sheet verbs: Load (built-in 7-on-7/Standard + saved), Save
  (`saveCallSheetTemplate`), Print (`printCallSheet`), Display (`openDisplayPanel`).
- Register Wristband verbs: Load (`loadWristband`/manager), Save (templates),
  Print (print preview), Display (appearance/scheme).
- Same shell, same order — just registration.

### Phase 3 — Display state clarity ✅ shipped (SW v858)

- Display tile/menu shows active preset name + "unsaved changes" hint.
- Toggling a display option fires a short toast ("Wristband: showing personnel").
- Fixes "sometimes I don't know when I'm changing display options."

### Phase 4 — Consolidate + declutter ✅ first pass shipped (SW v859)

- Once the hub proves itself, retire duplicate scattered buttons and thin the
  `⋯ More` menus (their contents now live in Load/Save/Print/Display + More).
- Keep task modals (edit play, print dialog); remove _hidden action homes_.

### Phase 5 — Command palette as the universal spine (desktop) + mobile pill

- Feed every hub verb into the command palette so typing "load", "print",
  "templates" jumps straight there.
- Persistent mobile "search actions" affordance.

### Phase 6 (optional) — Swipe view upgrades (separate track)

- Comment/questions in swipe/present view for players.
- Player-facing action set in swipe view (bigger, fewer, "what do I do next").

## Guardrails

- Bump SW + restamp `?v=` when touching cached assets.
- New file → add to `index.html` script order **and** `LOCAL_ASSETS` in `sw.js`.
- Verbs must call existing globals; no behavior forks.
- Run `./scripts/static-ui-audit.sh` before shipping each phase.
