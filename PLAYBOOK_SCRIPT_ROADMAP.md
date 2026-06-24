# Playbook & Practice Script — 30-Point Engineering Roadmap

> Deep audit completed 2026-06-24. Scope: `index.html`, `css/playbook.css`,
> `css/script.css`, `js/playbook-render.js`, `js/script-render.js`, and all
> split-runtime files that touch these two pages.
>
> **Legend:** 🔴 Bug · 🟡 Enhancement · 🔵 Cohesion · 🟢 Refactor · ⚡ Perf
> **Priority:** P1 = now · P2 = next · P3 = backlog
> **Size:** S (< 30 min) · M (30–90 min) · L (half day+)

---

## Audit Summary

| Area | Finding |
|---|---|
| **Wiring** | ✅ All 70+ `data-action` handlers resolve to real global functions. Zero dead buttons. |
| **Inline handlers** | ✅ Zero `onclick`/`onchange`/`oninput` violations. All 145 input handlers use correct `data-onchange`/`data-oninput` pattern. |
| **Dead JS** | ✅ No dead global functions found in playbook or script runtimes. |
| **Dead CSS (IDs)** | ⚠️ `#catCleanupSummary` in `playbook.css` has no matching DOM element — dead block. |
| **Duplicate CSS** | ⚠️ `script.css` has `~30` selector repetitions. Most are normal (grouped + individual, base + @media). 3–4 are genuinely redundant (see items 23–26). |
| **Dark mode contrast** | 🔴 Pass chip invisible: `--color-bg-blue-tint: #1c2640` nearly matches dark table background. RPO chip jarring: `--color-purple-light` not overridden in dark theme (inherits light-mode `#f0e6f6`). |
| **Performance** | ⚡ `backdrop-filter: blur()` radii up to 18px cause heavy GPU load. Documented in `UIUX_PERF_ROADMAP.md`. |
| **Accessibility** | ⚠️ Context menu `(•••)` button has no `aria-label`. Type chip cells have no `aria-label`. Empty readiness dot has no screen reader text. |
| **Cohesion** | 🔵 Type chips use different sizes on playbook vs. script. No shared `--color-type-*` token family. Filter interactions differ per page. |

---

## Section 1 — Immediate Visual Bugs

### 1. 🔴 P1 S — Fix Pass chip dark mode contrast
**File:** `css/base.css`  
`--color-bg-blue-tint` resolves to `#1c2640` in dark mode — identical to most dark table-row backgrounds, making the Pass chip invisible. Add a dedicated dark-mode override or replace the background approach with a `border` accent for the Pass variant.

```css
/* base.css [data-theme="dark"] */
--color-bg-blue-tint: #1e3060;  /* slightly lighter/more saturated than current #1c2640 */
```

---

### 2. 🔴 P1 S — Fix RPO chip dark mode contrast
**File:** `css/base.css`  
`--color-purple-light` is **not defined** in `[data-theme="dark"]`, so it falls back to the light-mode value `#f0e6f6` — a bright lilac that renders jarringly on dark backgrounds. Add a dark-mode value.

```css
/* base.css [data-theme="dark"] */
--color-purple-light: #2a1f3d;
--color-purple: #9b72d0; /* bump contrast so text is legible on dark bg */
```

---

### 3. 🔴 P1 S — Remove dead `#catCleanupSummary` CSS
**File:** `css/playbook.css` line ~3685  
A `#catCleanupSummary` rule exists with no matching element in `index.html` or in any JS that creates it. Remove the dead block (~6 lines).

---

### 4. 🔴 P1 S — Add `aria-label` to context menu `(•••)` button
**File:** `js/playbook-render.js`  
The row context menu button renders as `<button>(•••)</button>` with no label. Screen readers announce "dot dot dot". Add `aria-label="Play options for [play name]"` using `escapeHtml(play.play)`.

---

### 5. 🟡 P2 S — Make `(•••)` button hover-only (matches ▶ pattern)
**File:** `css/playbook.css`  
The present button ▶ is already opacity-0-until-hover. The context menu `(•••)` is always visible and adds visual noise to every row. Apply the same `opacity: 0 → 1 on tr:hover` pattern. Keep visible on keyboard focus with `:focus-within`.

---

## Section 2 — Type Color System Cohesion

### 6. 🔵 P2 M — Create `--color-type-*` token family
**File:** `css/base.css`, `css/playbook.css`, `css/script.css`  
Type chip colors are hardcoded per-module with no shared tokens. Both `playbook.css` and `script.css` duplicate the same 7 type-color rules. Extract into `base.css`:

```css
:root {
  --color-type-run-bg:        var(--color-success-light);
  --color-type-run-text:      var(--color-success);
  --color-type-pass-bg:       var(--color-bg-blue-tint);
  --color-type-pass-text:     var(--color-primary);
  --color-type-rpo-bg:        var(--color-purple-light);
  --color-type-rpo-text:      var(--color-purple);
  --color-type-screen-bg:     var(--color-info-light);
  --color-type-screen-text:   var(--color-info);
  --color-type-quick-bg:      var(--color-warning-light);
  --color-type-quick-text:    var(--color-warning);
  --color-type-pa-bg:         var(--color-danger-light);
  --color-type-pa-text:       var(--color-danger);
  --color-type-movement-bg:   var(--color-accent-light);
  --color-type-movement-text: var(--color-primary);
}
```

Then both CSS files reference the same tokens — one source of truth for all 4 pages.

---

### 7. 🔵 P2 S — Standardize chip font size across pages
**File:** `css/playbook.css`, `css/script.css`  
Playbook chips use `font-size-2xs`; script chips use `font-size-xs`. Standardize both to `font-size-2xs` (the denser, more scannable size matches the table context).

---

### 8. 🔵 P2 S — Add type chip to `play-item` available-plays cards in wristband and callsheet picker
**Files:** `css/wristband.css`, `css/callsheet.css`  
Available-play cards in the wristband and call sheet picker show no type indicator. The script available-plays drawer already has the color chip system. Extend `.play-type-chip` color rules into the other two modules' available-play surfaces.

---

### 9. 🔵 P3 S — Type legend tooltip on column header
**File:** `index.html`, `css/playbook.css`  
New users don't know what the colors mean. Add a `title="Run=green, Pass=blue, Quick=amber…"` tooltip on the TYPE `<th>` column header. No JS needed.

---

## Section 3 — Playbook Page Interactions

### 10. 🟡 P2 M — Stats chips → click to filter by type
**Files:** `js/playbook-chrome.js`, `css/playbook.css`  
The stats bar chips (e.g., "10 Run") are purely decorative. They should be clickable: clicking "10 Run" activates the Type = Run chip filter. This removes a redundant step and provides the most direct filter affordance. Pattern: `data-action="filterByTypeStat" data-arg="Run"`.

---

### 11. 🟡 P2 S — Filter drawer: active filter count badge on toggle button
**Files:** `js/playbook-chrome.js` or `playbook-filters.js`, `css/playbook.css`  
When filters are active, the Filters toggle button shows no indication. Add a count badge: "≡ Filters [3]" when 3 filters are active. Update badge on every `filterPlays()` call by counting non-empty filter state.

---

### 12. 🟡 P2 S — Filter drawer: one-click "Clear This Filter" on active pills
**File:** `css/playbook.css`  
Active filter pills already render. Verify each pill has a visible ×/remove button that clears just that one filter (not all). If the ×button requires two clicks or is too small (< 20px), enlarge the hit target.

---

### 13. 🟡 P3 M — Table row click → row highlight + details
**Files:** `js/playbook-actions.js`, `css/playbook.css`  
Currently, clicking a row does nothing unless you use the `(•••)` context menu. Add a `selected` class on single-click so users can see which play they're focused on, and pair it with showing the readiness panel for that play.

---

### 14. 🟡 P3 M — Column menu: "Reset to Default" button
**Files:** `js/playbook-chrome.js`, `index.html`  
The column visibility menu has no way to reset to defaults without manually toggling each column back. Add a "Reset Columns" button that calls `resetColumnVisibility()`.

---

## Section 4 — Practice Script Page Interactions

### 15. 🟡 P2 S — Flash-highlight newly added play in script list
**Files:** `js/script-add.js`, `css/script.css`  
When a play is added to the script, there's no visual feedback showing which period it landed in. After adding, add a `script-item--just-added` class, scroll the new item into view, and animate it with the existing `flashAdd` keyframe for 1.5s.

---

### 16. 🔵 P2 M — Period headers: live rep count + run/pass mini ratio bar
**Files:** `js/script-periods.js` or `script-render.js`, `css/script.css`  
Period headers show the period name. Add a compact meta row showing:  
- Total reps in period  
- Run/Pass ratio mini-bar (same `ratio-bar-run`/`ratio-bar-pass` pattern already in script.css)  
This gives coaches an instant health check per period without opening any modal.

---

### 17. 🟡 P2 S — "Period picker" modal when sending filtered plays from playbook
**Files:** `js/playbook-actions.js` (or `playbook-chrome.js`)  
`sendFilteredToScript` currently adds all filtered plays to the end of the last period. Add a lightweight period picker modal (`showListPicker`) so coaches choose which period before adding. This prevents the common workflow break of "where did my plays go?"

---

### 18. 🔵 P2 S — Script toolbar sections: show active state badge
**Files:** `css/script.css`  
The "Selection" toolbar section shows no indicator when plays are checked. The section label `::before` content (already positioned absolutely) should conditionally show a count badge when `bulkSelectedIndices.length > 0`. Wire via a CSS custom property or a `.has-selection` class on the toolbar root.

---

### 19. 🟡 P3 M — Script item context menu → "Jump to Play in Playbook"
**Files:** `js/script-render.js`, `js/app-navigation.js`  
Script item context menus offer delete, move, duplicate, etc. but no way to navigate to the canonical play definition in the Playbook tab. Add a "View in Playbook" action that calls `showTab('playbook')` and then `filterToPlay(play)` to highlight/scroll to the matching row.

---

## Section 5 — Cross-Page Cohesion & Workflow

### 20. 🔵 P2 M — Unified `.empty-state` component
**Files:** `css/components.css`, `css/playbook.css`, `css/script.css`  
Both pages have their own empty state styles (`.pb-empty`, `.script-empty-guide`, etc.) with different markup, icons, copy, and spacing. Define a single `.empty-state` pattern in `components.css`:

```html
<div class="empty-state">
  <div class="empty-state-icon">⚙️</div>
  <p class="empty-state-title">No plays match your filters</p>
  <p class="empty-state-body">Try clearing the Formation filter.</p>
  <button class="btn btn-sm" data-action="clearFilters">Clear Filters</button>
</div>
```

---

### 21. 🔵 P2 S — Consistent filter-active indicator pattern
**Files:** `css/playbook.css`, `css/script.css`  
Playbook uses active-pill bar; script uses highlight on the search input. Both should show the same pattern: a small colored bar under the filter controls when any filter is active. One CSS rule in `components.css`, referenced by both pages.

---

### 22. 🔵 P3 M — Unified sort-state persistence
**Files:** `js/playbook-state.js`, `js/script-state.js`  
Playbook persists filter state. Script persists display options. Neither restores the last-used sort when you return to the tab. Store sort state (primary + secondary field + direction) in `STORAGE_KEYS.PLAYBOOK_STATE` and `STORAGE_KEYS.SCRIPT_STATE` respectively, and reapply on tab activation.

---

### 23. 🔵 P3 S — Add "Last Modified" or "Added" timestamp to play objects
**File:** `js/playbook-editor.js`, `js/playbook-import.js`  
The Play data model has no `createdAt` or `updatedAt` field. Adding them unlocks: "Recently Added" sort key, "Edited Today" filter chip, and "New This Week" badge. Populate on save in the editor; set to `Date.now()` on CSV import if not present.

---

### 24. 🔵 P3 M — Script ↔ Playbook breadcrumb integration
**Files:** `js/script-render.js`, `js/playbook-render.js`  
When a script item was sourced from the playbook, show a subtle "📖 In Playbook" link/chip on the script item that navigates and highlights the source play. Useful for coaches who want to edit the base play definition after scripting.

---

## Section 6 — Dead Code & Architecture Cleanup

### 25. 🟢 P2 S — Remove `#catCleanupSummary` dead block from `playbook.css`
*(Listed again as an isolated fix — see item 3 for detail. Separate PR.)*

---

### 26. 🟢 P2 M — Consolidate `script.css` duplicate play-readiness base blocks
**File:** `css/script.css`  
Three selector groups each appear as both a comma-grouped rule AND a standalone rule within the same non-media-query scope:  
- `.play-readiness-actions` (lines 942 and 1071 context)  
- `.play-readiness-sweet` (lines 980 and 994 context)  
- `.play-readiness-badge-detail span` (lines 626 and 652)  

Merge each into one canonical rule, keeping all properties. No visual change; eliminates silent specificity confusion.

---

### 27. 🟢 P3 L — Split `playbook-sanitize.js` (2,726 lines, 3 unrelated tools)
**File:** `js/playbook-sanitize.js`  
This file contains: CSV sanitizer, Balance/Analytics report, and Identity Alignment checker. These are independent tools with no shared state. Split into:  
- `playbook-sanitize.js` — CSV cleanup tool only  
- `playbook-analytics.js` — Balance report + Situation coverage  
- `playbook-identity.js` — Identity alignment checker  

Update `index.html` load order and `sw.js` `LOCAL_ASSETS`.

---

### 28. 🟢 P3 L — Split `script-render.js` (1,777 lines)
**File:** `js/script-render.js`  
High-frequency render functions (item, period header, compact call) are mixed with widget modals and readiness sub-renders. The file renders as a monolith during every re-render call. Extract `script-readiness-widget.js` for all `play-readiness-*` widget render functions, reducing the critical-path file size.

---

### 29. 🟢 P3 M — Move `@media print` rules from `script.css` to `print.css`
**File:** `css/script.css`, `css/print.css`  
All `.script-packet-*` print rules live in `script.css`. Moving them to `print.css` follows the established file responsibility contract (from `AGENTS.md`) and reduces the non-print parse surface of `script.css`.

---

## Section 7 — Performance

### 30. ⚡ P1 M — Reduce all `backdrop-filter: blur()` radii
**Files:** `js/auth.js` (radius 18px inline style), `css/components.css` (16px), `css/script.css` overlay (12px)  
A full-viewport blur forces the GPU to re-composite the entire painted layer on every frame while the modal is open. Reduce to max 8px — visually near-identical at normal viewing distances, ~50% cheaper in GPU cost. Especially impactful on M-series Macs where the integrated GPU is shared.

```css
/* Before */
backdrop-filter: blur(18px);
/* After  */
backdrop-filter: blur(8px);
```

See `UIUX_PERF_ROADMAP.md` Phase 1 for full context.

---

## Quick-Win Implementation Order

Run these as a single batch commit — all are CSS-only, no smoke-check risk:

| # | Fix | File | Time |
|---|---|---|---|
| 1 | Pass chip dark mode | `base.css` | 5 min |
| 2 | RPO dark mode token | `base.css` | 5 min |
| 3 | Dead `#catCleanupSummary` | `playbook.css` | 2 min |
| 5 | `(•••)` hover-only | `playbook.css` | 5 min |
| 7 | Chip font size standardize | `playbook.css`, `script.css` | 5 min |
| 30 | Blur radius reduction | `auth.js`, `components.css`, `script.css` | 15 min |

**Total batch: ~37 minutes for 6 visible improvements + one performance win.**

---

## Deferred (Needs Deeper Design Discussion)

- **Virtual/windowed rendering** for playbooks > 300 plays. Requires structural change to pagination or intersection-observer rendering. Not worth the complexity until a real user has > 200 plays.
- **Unified search syntax** (`formation:Gun type:run`) — requires a query parser and would change the UX contract for existing filter chips.
- **`play.createdAt` field** (item 23) — harmless to add, but needs CSV import logic update and a migration pass for existing stored data.

---

*Cross-reference: `UIUX_PERF_ROADMAP.md` covers GPU performance (Phase 1), drag-and-drop optimization (Phase 2), and broader cross-app consistency (Phases 3–6).*
