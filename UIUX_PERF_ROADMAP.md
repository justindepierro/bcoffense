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

### Phase 2 — Drag + render performance
- Memoize row rects at `dragstart` in `gameplan-dnd.js`; reuse during drag-over.
- Audit `renderCallSheet` / `renderScript` for redundant full rebuilds; debounce field-input renders.
- Throttle canvas redraws in `play-presentation.js` resize observer.

### Phase 3 — Playbook page modernization
- Convert inline **print panel** + **collections panel** into proper side drawers (overlay + backdrop + close affordance + `max-height`), matching one modal pattern.
- Toolbar: group Analytics/Tools/Print/Collections into a single overflow menu; reflow on mobile.
- Mobile: horizontal-scroll table with sticky header + hide low-priority columns < 768px.
- Fix Play Editor ↔ Sanitize nesting (return path + correct z-index).

### Phase 4 — Practice Script page modernization
- Split `script.css` (5,795 lines): move `.script-packet-*` print rules to `print.css`; delete dead `.player-script-*` block.
- Toolbar reflow < 640px; bump touch targets to 44px (`available-add-menu-btn`, `script-move-menu-btn`, checkboxes).
- Consolidate the repeated `.script-item--detail` grid redefinitions across 9 media blocks.
- Convert period template picker from inline `<select>` to a floating overlay.
- Add mutual-exclusion guard so the tools drawer and display panel can't stack.

### Phase 5 — Cross-app consistency
- Unify modal system: one `.visible` state convention + one backdrop/blur rule; document in `components.css`.
- Move hardcoded z-index (callsheet 1100/1099, gameplan bare numbers) onto the token scale.
- Add Game Plan mobile rules.
- Replace hardcoded picture-pill colors with `--color-picture-*` tokens; sweep hardcoded spacing → `--space-*`.
- Centralize breakpoints.

### Phase 6 — Dead CSS + bloat cull
- Remove confirmed-dead selectors (`.player-script-*`, `.script-item--printlike`).
- Consolidate duplicate responsive rules.
- Re-run `scripts/smoke-check.js` after each phase.

---

## Working rules for this roadmap
- Bump `sw.js` `CACHE_NAME` after every CSS/JS/HTML change.
- One phase = one (or few) commits; deploy + verify via `./scripts/deploy-cloudflare.sh`.
- No feature removal. No build tools. Keep `data-action` + `escapeHtml` + design-token discipline.
- Validate with `scripts/smoke-check.js` where applicable.
