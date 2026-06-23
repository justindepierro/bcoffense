# UI/UX + Performance Roadmap

> Living plan from the 2026-06-23 full-app audit. Emphasis on **Playbook** and
> **Practice Script** pages, plus a cross-app performance pass (laptop heat).
> Goal: modernize + professionalize the UI, make it solid on desktop **and**
> mobile, keep every feature, and stop the app from heating the machine.

---

## Audit Summary (what's actually true)

| Area | Verdict |
| --- | --- |
| **Wiring** | ✅ Clean. Every `data-action` resolves to a real global function. No dead buttons. The handlers two scans flagged as "missing" (`quickPlayReadinessScriptScore`, `updatePlayReadinessReportScore`, `deletePlayReadinessReport`, `openSelectedPlaybookPresentation`) **all exist** and are wired. |
| **Dead code** | ⚠️ Minimal. Main offenders are dead **CSS** (player-view styles + print styles living in `script.css`), not dead JS. `playbook-sanitize.js` (2,726 lines) is real and used (3 tools in one file). |
| **Duplicate globals** | ✅ None found. |
| **Performance / heat** | 🔥 Real. No idle `setInterval` polling, but infinite CSS paint-animations + fullscreen `backdrop-filter` blurs + `getBoundingClientRect` thrash in drag. |
| **Mobile** | ⚠️ Inconsistent. Game Plan has **no** mobile rules; playbook table + script toolbar don't reflow well; touch targets undersized (28px). |
| **Consistency** | ⚠️ 12+ modal patterns, mixed visibility states, ~200 hardcoded spacing values, a few hardcoded colors + out-of-scale z-index. |

---

## The heat problem — root causes (ranked)

1. **Fullscreen `backdrop-filter: blur()` while a modal is open.** A blurred overlay forces the GPU to re-composite/re-blur the entire page **every frame** for as long as it's visible. Worst radii: 18px (auth), 16px (responsive overlay), 12px (script overlay/modal). Blur cost scales with radius.
2. **Infinite CSS animations on _paint_ properties.** `td-pulse` animates `box-shadow` forever (`tendencies.css`) — box-shadow is a paint property, so it repaints every frame. `deadVsPulse` animates opacity (cheaper, composited).
3. **`will-change` on always-present elements.** `will-change: box-shadow` and `will-change: width` (×4) keep elements permanently promoted to their own GPU layer — wasted memory + compositing with zero benefit (width isn't compositable).
4. **The combo:** when a modal is open _and_ a pulse animates behind it, the blurred overlay re-blurs the whole screen on every pulse frame. This is the most likely "heats up at points" trigger.
5. **`getBoundingClientRect()` inside drag-over loops** (`gameplan-dnd.js` 302/317/326) forces synchronous layout on every mousemove (~60Hz) during drags.

---

## Phased plan

### ✅ Phase 1 — Performance quick wins (low risk, no UX change) — IN PROGRESS
- Remove harmful `will-change` (`box-shadow` ×1, `width` ×4).
- Reduce extreme blur radii (18→10, 16→10, 12→8) — visually near-identical, ~40% cheaper.
- Keep `prefers-reduced-motion` honored.
- **Outcome:** lower idle + modal-open GPU load with zero feature/visual loss.

### Phase 2 — Drag + render performance ✅ DONE (v637)
- ✅ Memoized `.gp-box-play` row geometry per drag in `gameplan-dnd.js` (was `getBoundingClientRect()` for every row on every dragover ~60Hz; now built once, invalidated on scroll/dragend).
- ✅ Audited render paths — already well-engineered: `createRAFRenderer` coalesces `renderCallSheet`; script field updates (`updateNotes`/`updateDefField`/etc.) do targeted DOM updates, not full re-renders; `play-presentation.js` resize observer already guards with size-key + rAF coalescing. No changes needed.
- 🔎 Found (deferred to Phase 6): duplicate top-level `renderCallSheet` — `callsheet-render.js:603` is shadowed by `callsheet.js:1254` (later load wins). The render-layer copy is dead.

### Phase 3 — Playbook page modernization ✅ DONE (v638)
- ✅ Print options + Saved Collections converted from inline collapsible panels into proper right-side **drawers** (backdrop overlay + slide-in + close button + scrollable body + sticky footer). Drawers moved **outside** `.panel` because `.panel.active` keeps a `transform` (panelFadeIn fill `both`), which would otherwise trap `position: fixed`.
- ✅ Reused existing toggle functions; `aria-hidden` now syncs with open state; backdrop-click closes via `*Overlay` data-action.
- ✅ Mobile: drawer width `min(460px, 92vw)` → near-full-width on phones.
- 🔎 **Floating FAB/toolbar audit:** the bottom-right FABs (help / script-display / scroll-top) are **already consolidated** into one "Tools" tray (`.quick-tools`) — individual buttons are `position: static` inside the expandable menu, so there is no FAB overlap. Sticky module bars (`.script-toolbar` z6, `.gp-header` z5, `.gp-library` z2, `.dash-opponent-bar` z6) are sticky **within their own scroll panel**, in separate stacking contexts from the global tab bar — no real conflict. Z-index token unification stays in Phase 5.
- ⏭️ Forced mobile column-hiding deferred: it conflicts with the existing column-visibility menu (which already lets users trim columns) and the table already scrolls horizontally.

### Phase 4 — Practice Script page modernization ✅ DONE (v639)
- ✅ **Fixed a real layout bug:** the entire `.script-toolbar` base layout (`-left`/`-center`/`-right`, search box, sort status, etc.) was trapped inside an `@media (max-width: 1280px)` block, so on any screen **wider than 1280px** the toolbar lost all flex layout and its controls stacked vertically. Un-wrapped it so the layout applies at every width (purely additive for ≤1280px).
- ✅ **Mutual-exclusion guard:** opening the script Tools drawer now closes the Display panel and vice-versa, so the two overlays can't stack.
- ✅ Mobile touch targets already handled (existing ≤640px block bumps toolbar buttons/selects/search to 42px and stacks the three sections full-width). No change needed.
- ⚠️ **Roadmap correction:** `.player-script-*` is **NOT dead** — it's used by the player-role launcher + "now" bar in `index.html` (`#playerScriptLauncherSection`, `#playerScriptNowBar`). Removed from the Phase 6 cull list.
- ⏭️ Deferred (lower value / higher risk): moving `.script-packet-*` print rules to `print.css` and consolidating the `.script-item--detail` grid redefinitions — mechanical CSS moves with little visible payoff; revisit in Phase 6.

### Phase 5 — Cross-app consistency
- Unify modal system: one `.visible` state convention + one backdrop/blur rule; document in `components.css`.
- Move hardcoded z-index (callsheet 1100/1099, gameplan bare numbers) onto the token scale.
- Add Game Plan mobile rules.
- Replace hardcoded picture-pill colors with `--color-picture-*` tokens; sweep hardcoded spacing → `--space-*`.
- Centralize breakpoints.

### Phase 6 — Dead CSS + bloat cull
- Remove confirmed-dead selectors (`.script-item--printlike` — verify first).
- Remove the shadowed dead `renderCallSheet` (+ its helpers) in `callsheet-render.js` once confirmed nothing else in that file is uniquely used.
- Consolidate duplicate responsive rules (incl. the `.script-item--detail` grid across ~9 media blocks).
- Re-run `scripts/smoke-check.js` after each phase.
- NOTE: `.player-script-*` is **live** (player launcher/now bar) — do NOT remove.

---

## Working rules for this roadmap
- Bump `sw.js` `CACHE_NAME` after every CSS/JS/HTML change.
- One phase = one (or few) commits; deploy + verify via `./scripts/deploy-cloudflare.sh`.
- No feature removal. No build tools. Keep `data-action` + `escapeHtml` + design-token discipline.
- Validate with `scripts/smoke-check.js` where applicable.
