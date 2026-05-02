# BCOffense — GitHub Copilot Instructions

> These rules apply to every AI suggestion, completion, and chat response in this repo.
> Read AGENTS.md for the full reference. This file is the enforced shortlist.

---

## What This Project Is

**BCOffense** is a football practice management PWA. It is a **single-page app** served statically from GitHub Pages.

- **Stack:** Vanilla HTML / CSS / JS only — zero build tools, no bundler, no npm, no TypeScript
- **Entry point:** `index.html` (all markup lives here, ~3300 lines)
- **Scripts load with `defer` in order** — all share the global scope, no modules
- **Data persistence:** `localStorage` only via `storageManager` — no backend, no fetch calls to APIs
- **Offline support:** Service worker (`sw.js`) with stale-while-revalidate caching

---

## Absolute Rules — Never Break These

### JavaScript

- **NO inline `onclick`/`onchange`/`oninput`** — always use `data-action` / `data-onchange` / `data-oninput` attributes
- **NO `import` / `export`** — this is a global-scope, no-module project
- **NO build step** — no webpack, vite, rollup, babel, npm scripts
- **NO `package.json`** — intentionally dependency-free
- **NO `innerHTML` with unsanitized user content** — always use `escapeHtml()`, `setInnerHTML()`, or `sanitizeHTML()`
- **NEVER double-escape** `getFullCall()` output — it already escapes internally
- **ALL persistence** goes through `storageManager.get()` / `storageManager.set()` — never raw `localStorage`
- **ALL modals** are async Promise-based: `showModal()`, `showConfirm()`, `showPrompt()`, `showChoice()`, `showListPicker()`
- **ALL toasts** via `showToast()` or `showUndoToast()`

### CSS

- **NO hardcoded colors** — always use CSS custom properties from `base.css` (e.g., `var(--color-primary)`)
- **NO hardcoded spacing** — use `var(--space-xs)` through `var(--space-xl)`
- **Module CSS prefix:** call sheet → `cs-*`, constraints → `cr-*`, wristband → `wb-*`
- Dark mode: `[data-theme="dark"]` selector — never use JS to detect dark mode

### Service Worker (CRITICAL — do not forget)

- **ALWAYS bump `CACHE_NAME`** version in `sw.js` after ANY change to HTML, CSS, or JS files
- Current version: `bcoffense-v280` — next version will be `bcoffense-v281`
- **NEW files** must be added to `LOCAL_ASSETS` array in `sw.js` AND the `<script>` tag in `index.html`

---

## Event Delegation Pattern

All interactions use `data-action`. The central delegated dispatcher is in `app-events.js`.

```html
<!-- No-arg action -->
<button data-action="saveScript">Save</button>

<!-- With argument -->
<button data-action="showTab" data-arg="callsheet">Call Sheet</button>

<!-- Overlay close (backdrop click only) -->
<div class="my-overlay" data-action="closeMyPanelOverlay">
  <div class="my-panel">...</div>
</div>
```

The generic fallback: `window[action](arg)` — so the function **must be global** (top-level in any JS file).

Special function sets in `app-events.js`:

- `_ELEMENT_FNS` — receives the DOM element: `toggleFilterSection`, `toggleCollapsiblePanel`, `setHeaderColor`, `switchDisplayTab`
- `_BOOL_FNS` — receives boolean: `toggleAllPbPrintOptions`, `csSelectAllFields`

Change/input delegation:

```html
<select data-onchange="myHandler" data-pass="value">
  <input data-oninput="handlerA;handlerB" data-pass="value" />
</select>
```

---

## HTML Safety

```js
// User text in template literals:
`<td>${escapeHtml(play.formation)}</td>`;

// User HTML content (preserve formatting):
setInnerHTML(el, userHtml); // calls sanitizeHTML internally
sanitizeHTML(html); // strips dangerous tags/attrs

// Play display (already escaped internally — do NOT wrap in escapeHtml):
getFullCall(play, options); // returns safe HTML string
buildCallSheetPlayParts(play, opts); // returns array of safe HTML parts
```

---

## Storage Pattern

```js
// Reading (always provide a default):
const data = storageManager.get(STORAGE_KEYS.MY_KEY, []);

// Writing:
storageManager.set(STORAGE_KEYS.MY_KEY, data);

// New key → add to STORAGE_KEYS object in storage.js first
```

---

## Script Load Order

New JS files must be inserted in the correct position in `index.html`:

```
utils.js → history.js → dom-helpers.js → storage.js → storage-ui.js → team-settings.js → playbook.js → playbook-collections.js
→ playbook-print.js → playbook-editor.js → playbook-import.js
→ playbook-export.js → playbook-chrome.js → playbook-state.js
→ playbook-filters.js → playbook-navigation.js → playbook-actions.js
→ playbook-render.js → script-state.js → script-shared.js → script-players.js
→ script-display-options.js → script-add.js → script-sort.js → script-export.js
→ script-available.js → script-selection.js → script-render.js
→ script-periods.js → script-period-sync.js → script-smart.js → script-storage.js
→ wristband.js → wristband-library.js → wristband-render.js → wristband-cards.js
→ wristband-export.js → wristband-search.js → wristband-modals.js
→ wristband-cell-popup.js → wristband-cell-actions.js → wristband-sort.js
→ wristband-storage.js → wristband-runtime.js → callsheet.js → callsheet-categories.js
→ callsheet-metadata.js → callsheet-layout.js → callsheet-picker-runtime.js → constraints.js
→ tendencies.js → installation.js → offensebuilder.js → help.js → dashboard.js
→ app-events.js → app-shell.js → app-session.js → app-navigation.js
→ app-module-init.js → app-bootstrap.js → app-init.js → app.js (LAST)
```

---

## Commit Message Format

```
feat: description of feature (SW v55)
fix: description of bug fix
perf: performance improvement
style: formatting only, no logic changes
refactor: restructure, no behavior change
```

- Always include `(SW vN)` when bumping service worker version
- Body: bullet list with `-` prefix

---

## Data Model Quick Reference

### Play Object key fields

`type`, `personnel`, `formation`, `formTag1`, `formTag2`, `under`, `back`, `shift`, `motion`,
`protection`, `lineCall`, `play`, `playTag1`, `playTag2`, `basePlay`, `oneWord`,
`preferredSituation`, `preferredDown`, `preferredDistance`, `preferredHash`, `preferredFieldPosition`,
`tempo`, `practiceFront`, `practiceDefense`, `practiceCoverage`, `practiceBlitz`, `practiceStunt`,
`keyPlayer1-3`, `keyPlayerName1-3`, `constraint1-3`, `hitChart1-3`, `deadVs`, `opponent`, `notes`

### Tab names (TAB_INDEX_MAP)

`playbook(0)`, `script(1)`, `wristband(2)`, `tendencies(3)`, `callsheet(4)`,
`installation(5)`, `offensebuilder(6)`, `dashboard(7)`

### Global variables

- `plays[]` — master playbook (app.js)
- `script[]` — working practice script (app.js)
- `filteredPlays[]` — filtered subset (app.js)
- `callSheet{}` — call sheet data (callsheet.js)
- `wristbandCards[]` — wristband cards (shared across wristband\*.js)
- `currentActiveTab` — active tab name (help.js)

## Current Runtime Split

- `playbook.js` is now a shared compatibility surface; playbook ownership is split across `playbook-collections.js`, `playbook-print.js`, `playbook-editor.js`, `playbook-import.js`, `playbook-export.js`, `playbook-chrome.js`, `playbook-state.js`, `playbook-filters.js`, `playbook-navigation.js`, `playbook-actions.js`, and `playbook-render.js`.
- `history.js` owns the shared `historyManager` undo/redo runtime.
- `playbook-import.js` owns CSV import, parser logic, imported state hydration, and import loading overlay UI.
- `playbook-state.js` owns shared state helpers, reset logic, and playbook filter cache.
- `dom-helpers.js` owns shared DOM sanitization, long-press, context menu, and reorder modal helpers.
- `storage.js` owns storage keys, migrations, backup/restore state, storage info data, and draft persistence helpers.
- `storage-ui.js` owns backup export/import UI and the storage info modal.
- `app.js` now only holds shared global state.
- `app-init.js` owns top-level startup and backup wrappers.
- `app-bootstrap.js` owns stored-session restore and one-time DOM bootstrap.
- `app-module-init.js` owns shared module initialization after playbook load.
- `app-navigation.js` owns `showTab()` and `TAB_INDEX_MAP`.
- `app-session.js` owns dirty-state and draft-restore helpers.
- `app-shell.js` owns theme, chrome, keyboard shortcuts, and page-level runtime.
- `app-events.js` owns delegated click/change/input routing.
- `callsheet.js` now owns the core call sheet state, rendering, and sort helpers.
- `callsheet-categories.js` owns category display names/colors and custom-category CRUD.
- `callsheet-metadata.js` owns category notes, target counts, clear actions, and category metadata menus.
- `callsheet-layout.js` owns category ordering persistence, layout modal draft state, and layout drag/drop helpers.
- `callsheet-picker-runtime.js` owns picker search/filter flows, wristband loading, call sheet play drag/drop, and callsheet-specific runtime listeners.
- `wristband.js` is now the wristband foundation layer; ownership is split across `wristband-library.js`, `wristband-render.js`, `wristband-cards.js`, `wristband-export.js`, `wristband-search.js`, `wristband-modals.js`, `wristband-cell-popup.js`, `wristband-cell-actions.js`, `wristband-sort.js`, `wristband-storage.js`, and `wristband-runtime.js`.

## Refactor Rules

- Prefer the owning split file over adding new logic back into `playbook.js` or `wristband.js`.
- Functions used by delegated events may also be called directly; optional event parameters must stay optional.
- Wristband UI mutations that should survive reloads must call both `markWristbandDirty()` and `scheduleWristbandAutosave()`.
- When adding a split runtime file, update `index.html`, `sw.js`, and the instruction docs in the same change.

---

## New Feature Checklist

1. Identify the owning JS file (or create a new one)
2. Use `data-action` for all interactive elements
3. `escapeHtml()` on all user text in template literals
4. CSS custom properties — no hardcoded values
5. `storageManager` for persistence — add key to `STORAGE_KEYS` in storage.js
6. If new file: add to `LOCAL_ASSETS` in sw.js + `<script defer>` in index.html (correct order)
7. **Bump `CACHE_NAME` version in sw.js**
8. Commit with conventional message including `(SW vN)`
