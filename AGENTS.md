# AGENTS.md — BCOffense Codebase Guide

> **For AI coding agents** — conventions, architecture, data models, and patterns  
> needed to make correct changes to this project on the first attempt.

---

## Project Overview

**BCOffense** is a football practice management PWA (Progressive Web App) for building practice scripts, wristbands, call sheets, defensive tendency reports, and game plans. It runs entirely client-side with no backend — data lives in `localStorage`, playbook data is imported via CSV, and the app is served from GitHub Pages.

- **Repo:** `justindepierro/bcoffense` on GitHub
- **Stack:** Vanilla HTML / CSS / JS — zero build tools, no bundler, no npm, no TypeScript
- **Hosting:** GitHub Pages (static)
- **Offline:** Service Worker (`sw.js`) with stale-while-revalidate caching
- **Entry point:** `index.html` (single-page app, all tabs exist in the DOM)

---

## File Structure

```
index.html              ← Single HTML file (all markup, ~3300 lines)
manifest.json           ← PWA manifest
sw.js                   ← Service worker (cache name: bcoffense-vN)
offline.html            ← Offline fallback page

css/
  base.css              ← Design tokens (:root vars), reset, form inputs
  layout.css            ← Header, tab bar, panels, upload screen
  components.css        ← Buttons, modals, toast, badges, utilities
  playbook.css          ← Playbook table, collections, print panel
  script.css            ← Practice script builder
  wristband.css         ← Wristband maker, cards, grid
  callsheet.css         ← Call sheet grid, columns, constraints panel
  tendencies.css        ← Defensive tendencies analysis
  offense-builder.css   ← Offense builder module
  dashboard.css         ← Dashboard, stats, game plan
  installation.css      ← Installation guide
  print.css             ← All @media print blocks
  responsive.css        ← Global breakpoints

js/
  utils.js              ← Shared utilities, constants, storage, modals, CSV parser
  team-settings.js      ← Team identity, roster, packages, depth chart runtime
  playbook.js           ← Shared playbook helpers and compatibility surface
  playbook-collections.js ← Saved collections and collection UI
  playbook-print.js     ← Playbook print/export panel
  playbook-editor.js    ← Play editor modal and edit actions
  playbook-import.js    ← CSV import and hydration
  playbook-export.js    ← Playbook export helpers
  playbook-chrome.js    ← Playbook toolbar, badges, and chrome actions
  playbook-state.js     ← Shared playbook state helpers
  playbook-filters.js   ← Playbook filter state and matching
  playbook-navigation.js ← Pagination and table navigation
  playbook-actions.js   ← Row actions and play mutations
  playbook-render.js    ← Playbook table rendering
  script-*.js           ← Practice script runtime split by concern (state, add, render, storage, etc.)
  wristband.js          ← Wristband core state, display helpers, and history helpers
  wristband-library.js  ← Wristband library filters, counts, and available plays
  wristband-render.js   ← Wristband grid rendering, colors, clear, auto-fill
  wristband-cards.js    ← Card tabs and card lifecycle
  wristband-export.js   ← Wristband print and CSV export
  wristband-search.js   ← Quick search, favorites, and smart fill
  wristband-modals.js   ← Wristband help and find/replace modals
  wristband-cell-popup.js ← Cell popup editor and pending tag state
  wristband-cell-actions.js ← Cell-level actions, swaps, batch edits, copy/paste
  wristband-sort.js     ← Wristband sorting and reorder helpers
  wristband-storage.js  ← Save/load/draft hydration helpers
  wristband-runtime.js  ← DOMContentLoaded bindings and delegated runtime wiring
  callsheet.js          ← Core call sheet state, rendering, picker, sort, and runtime
  callsheet-categories.js ← Call sheet category names, colors, and custom-category CRUD
  callsheet-metadata.js ← Call sheet notes, targets, and category metadata menus
  constraints.js        ← Game plan constraints evaluation engine
  tendencies.js         ← Defensive tendencies (opponents, wizard, analysis)
  installation.js       ← Installation/help guide
  offensebuilder.js     ← Offense builder tool
  help.js               ← Context-sensitive help content and panel runtime
  dashboard.js          ← Dashboard and game-week runtime
  app-events.js         ← Central delegated event routing and DOM listeners
  app-shell.js          ← Theme, chrome, keyboard shortcuts, page-level runtime
  app-session.js        ← Dirty-state and draft-restore session helpers
  app-navigation.js     ← Tab routing and tab index mapping
  app-module-init.js    ← Shared module initialization after playbook load
  app-bootstrap.js      ← Stored-session restore and one-time DOM bootstrap helpers
  app-init.js           ← Top-level app boot and backup wrapper runtime
  app.js                ← Shared global state only

icons/                  ← PWA icons (192px, 512px)
```

---

## Script Load Order (Critical)

All scripts use `defer` and load in this exact order from index.html:

```
1. js/utils.js          ← Must be first (constants, storageManager, modals, escapeHtml)
2. js/team-settings.js
3. js/playbook.js
4. js/playbook-collections.js
5. js/playbook-print.js
6. js/playbook-editor.js
7. js/playbook-import.js
8. js/playbook-export.js
9. js/playbook-chrome.js
10. js/playbook-state.js
11. js/playbook-filters.js
12. js/playbook-navigation.js
13. js/playbook-actions.js
14. js/playbook-render.js
15. js/script-state.js
16. js/script-shared.js
17. js/script-players.js
18. js/script-display-options.js
19. js/script-add.js
20. js/script-sort.js
21. js/script-export.js
22. js/script-available.js
23. js/script-selection.js
24. js/script-render.js
25. js/script-periods.js
26. js/script-period-sync.js
27. js/script-smart.js
28. js/script-storage.js
29. js/wristband.js
30. js/wristband-library.js
31. js/wristband-render.js
32. js/wristband-cards.js
33. js/wristband-export.js
34. js/wristband-search.js
35. js/wristband-modals.js
36. js/wristband-cell-popup.js
37. js/wristband-cell-actions.js
38. js/wristband-sort.js
39. js/wristband-storage.js
40. js/wristband-runtime.js
41. js/callsheet.js
42. js/callsheet-categories.js
43. js/callsheet-metadata.js
44. js/constraints.js    ← Depends on callsheet.js globals (callSheet, CALLSHEET_CATEGORIES)
45. js/tendencies.js
46. js/installation.js
47. js/offensebuilder.js
48. js/help.js
49. js/dashboard.js
50. js/app-events.js
51. js/app-shell.js
52. js/app-session.js
53. js/app-navigation.js
54. js/app-module-init.js
55. js/app-bootstrap.js
56. js/app-init.js
57. js/app.js           ← Must be last; shared global state only
```

All files share the **global scope** — there are no modules, imports, or bundling. Any function or variable declared at the top level of any file is accessible from any other file, but only after that file's script has executed. If you create a new JS file, you must add it to both `index.html` (in the correct position) and the `LOCAL_ASSETS` array in `sw.js`.

---

## Event Delegation Pattern

**No inline `onclick` attributes.** All interactive elements use `data-action` attributes dispatched through the central delegated listeners in `app-events.js`.

### Click Delegation

```html
<!-- Basic action (no args) -->
<button data-action="saveScript">Save</button>

<!-- Action with argument -->
<button data-action="showTab" data-arg="playbook">Playbook</button>

<!-- Overlay close (only fires when clicking backdrop, not children) -->
<div data-action="closeModalOverlay" class="overlay">...</div>
```

**Dispatch priority order:**

1. **Overlay close** — action ending in `"Overlay"` → strips suffix, calls `window[action.slice(0,-7)]()`; only fires on backdrop click (`e.target === el`)
2. **Click proxy** — `data-action="triggerClick"` + `data-target="elementId"` → clicks that element
3. **Inline DOM toggles** — `toggleParentOpen`, `removeParentOpen`, `reloadPage`
4. **Explicit switch/case** — Actions needing `data-idx`, `data-sid`, `data-layer`, `data-preset`, etc.
5. **Generic fallback** — `window[action](arg)` with smart argument handling:

| Condition                               | Call                 |
| --------------------------------------- | -------------------- |
| `data-arg` + action in `_ELEMENT_FNS`   | `fn(arg, element)`   |
| `data-arg` + action in `_BOOL_FNS`      | `fn(arg === "true")` |
| `data-arg` present                      | `fn(arg)`            |
| No `data-arg`, action in `_ELEMENT_FNS` | `fn(element)`        |
| No `data-arg`                           | `fn()`               |

**Special sets:**

```js
const _ELEMENT_FNS = new Set([
  "toggleFilterSection",
  "toggleCollapsiblePanel",
  "setHeaderColor",
  "switchDisplayTab",
]);
const _BOOL_FNS = new Set(["toggleAllPbPrintOptions", "csSelectAllFields"]);
```

### Container-Scoped Delegation

Some containers (`#scriptPlays`, `#availablePlays`, `#playbookTable tbody`) have their own event listeners that dispatch by `data-action` or `data-field` within `DOMContentLoaded`.

### Change/Input Delegation

```html
<select data-onchange="handleSort" data-pass="value">
  ...
</select>
<input data-oninput="filterPlays;updateCount" data-pass="value" />
```

- `data-onchange` / `data-oninput` → semicolon-separated function names
- `data-pass="value"` → passes `el.value`
- `data-pass="event"` → passes the event object
- `data-arg="x"` → passes string `"x"`
- No modifier → calls `fn()` with no arguments

---

## Storage System

All persistent data uses `localStorage` via the `storageManager` singleton.

### storageManager API

```js
storageManager.get(key, (defaultValue = null)); // JSON.parse; returns default on miss/error
storageManager.set(key, value); // JSON.stringify; shows quota modal on overflow
storageManager.remove(key); // localStorage.removeItem
storageManager.getAllData(); // Full backup object for export
storageManager.restoreAllData(backup, options); // Restore from backup (async)
storageManager.getStorageInfo(); // { totalSize, totalSizeFormatted, itemSizes, itemCount }
storageManager.clearAll((confirmFirst = true)); // Wipe all keys (async)
```

### STORAGE_KEYS (complete list)

```js
PLAYBOOK                   → "playbook"
SAVED_SCRIPTS              → "savedScripts"
SAVED_WRISTBANDS           → "savedWristbands"
SORT_PRESETS               → "sortPresets"
CUSTOM_SORT_ORDERS         → "customSortOrders"
SCRIPT_CUSTOM_SORT_ORDERS  → "scriptCustomSortOrders"
PERIOD_TEMPLATES           → "periodTemplates"
CALL_SHEET                 → "callSheet"
CALL_SHEET_SETTINGS        → "callSheetSettings"
COLUMN_VISIBILITY          → "columnVisibility"
PLAYBOOK_STATE             → "playbookState"
SCRIPT_DISPLAY_OPTIONS     → "scriptDisplayOptions"
SCRIPT_DRAFT               → "scriptDraft"
WRISTBAND_DRAFT            → "wristbandDraft"
CALLSHEET_DISPLAY_OPTIONS  → "callSheetDisplayOptions"
CALLSHEET_DISPLAY_PRESETS  → "callSheetDisplayPresets"
CALLSHEET_DRAFT            → "callSheetDraft"
CALLSHEET_TEMPLATES        → "callSheetTemplates"
CALLSHEET_CATEGORY_ORDER   → "callSheetCategoryOrder"
CALLSHEET_NOTES            → "callSheetNotes"
CALLSHEET_TARGETS          → "callSheetTargets"
CALLSHEET_COLLAPSED        → "callSheetCollapsed"
DEFENSIVE_TENDENCIES       → "defensiveTendencies"
TENDENCIES_DRAFT           → "tendenciesDraft"
TENDENCIES_SETTINGS        → "tendenciesSettings"
GAME_WEEK                  → "gameWeek"
INSTALLATION               → "installationData"
CS_SCOUTING_OVERLAY        → "csScoutingOverlay"
PLAY_COLLECTIONS           → "playCollections"
CALLSHEET_CONSTRAINTS      → "callSheetConstraints"
```

### Autosave / Draft Pattern

- **Debounce:** `AUTOSAVE_DEBOUNCE_MS = 3000` (3 seconds)
- **Draft expiry:** `DRAFT_EXPIRY_MS = 86400000` (24 hours)
- Each module has its own timer: `scriptAutosaveTimer`, `callSheetAutosaveTimer`, `wristbandAutosaveTimer`, `tendenciesAutosaveTimer`
- Dirty tracking: `scriptDirty` / `wristbandDirty` booleans with `markScriptDirty()` / `markScriptClean()` etc.
- `beforeunload` warns if any dirty flag is set

### Undo/Redo (historyManager)

```js
historyManager.saveState(type, state); // type: "script" | "wristband" | "tendencies"
historyManager.undo(type, currentState); // Returns previous state or null
historyManager.redo(type, currentState); // Returns next state or null
historyManager.clear(type);
historyManager.canUndo(type); // boolean
historyManager.canRedo(type); // boolean
historyManager.updateButtons(type); // Enable/disable #<type>UndoBtn / #<type>RedoBtn
// maxHistory: 25 snapshots per type
```

### Storage Migrations

- `STORAGE_VERSION = 2` stored in `localStorage._storageVersion`
- `runMigrations()` applies version-keyed transforms on app init

---

## Data Models

### Play Object (Playbook)

Imported from CSV via `parseCSV()`. This is the core data shape used everywhere:

```js
{
  type: "",                  // "Run", "Pass", "RPO", "Screen", "Quick", "Play Action", "Run Option", "Movement"
  personnel: "",             // Personnel grouping
  formation: "",             // Formation name
  formTag1: "",              // Formation tag 1
  formTag2: "",              // Formation tag 2
  under: "",                 // Under center indicator
  back: "",                  // Backfield alignment
  shift: "",                 // Pre-snap shift
  motion: "",                // Motion call
  protection: "",            // Protection call
  lineCall: "",              // Line call
  play: "",                  // Play name
  playTag1: "",              // Play tag 1
  playTag2: "",              // Play tag 2
  basePlay: "",              // Base play family
  oneWord: "",               // One-word call
  preferredSituation: "",    // "Short Yardage" | "2 Minute" | "4 Minute"
  preferredDown: "",         // "1" | "2" | "3" | "4"
  preferredDistance: "",     // "Short" | "Medium" | "Long"
  preferredHash: "",         // Hash preference
  preferredFieldPosition: "", // "Green" | "Lo-RZ" | "Hi-RZ" | "Goal Line" | "Backed Up" | "Saigon"
  tempo: "",                 // Tempo designation
  practiceFront: "",         // Practice defensive front
  practiceDefense: "",       // Practice defense
  practiceCoverage: "",      // Practice coverage
  practiceBlitz: "",         // Practice blitz
  practiceStunt: "",         // Practice stunt
  keyPlayer1: "",            // Key player 1 position code
  keyPlayer2: "",            // Key player 2 position code
  keyPlayer3: "",            // Key player 3 position code
  keyPlayerName1: "",        // Key player 1 name
  keyPlayerName2: "",        // Key player 2 name
  keyPlayerName3: "",        // Key player 3 name
  constraint1: "",           // Constraint / complement 1
  constraint2: "",           // Constraint / complement 2
  constraint3: "",           // Constraint / complement 3
  hitChart1: "",             // Hit chart target 1
  hitChart2: "",             // Hit chart target 2
  hitChart3: "",             // Hit chart target 3
  deadVs: "",                // Dead vs (defensive looks to avoid)
  opponent: "",              // Opponent-specific
  notes: "",                 // Free-text notes
}
```

### Call Sheet Category

```js
{
  id: "category-slug",        // Unique key (e.g. "1st-down", "rz-20", "player2")
  name: "Display Name",       // Human label
  color: "#hex",               // From CS_COLORS palette
  // Filter criteria (optional, varies):
  down: "1"|"2"|"3"|"4",
  distance: "Short"|"Medium"|"Long",
  position: "Green"|"Lo-RZ"|"Hi-RZ"|"Goal Line"|"Backed Up"|"Saigon"|null,
  situation: "Short Yardage"|"2 Minute"|"4 Minute"|null,
  playType: "Run"|"Pass"|"Screen"|"Quick"|"Play Action"|"RPO"|"Run Option"|"Movement"|"Opener",
  playerSpecific: true,        // Player-specific buckets (player1-player5)
  manual: true|false,          // If true, no auto-populate from playbook
}
```

**CALLSHEET_FRONT** — 21 situation/down-based buckets (front page):
`2nd-medium`, `2nd-long`, `3rd-short-1-3`, `short-yardage`, `gbot`, `3rd-short-2down`, `rz-20`, `4th-down`, `3rd-medium`, `rz-10`, `4-minute`, `3rd-long`, `rz-5`, `2-minute`, `backed-up`, `goal-line`, `last-plays`, `saigon`, `must-haves`

**CALLSHEET_BACK** — 18 type/player-based buckets (back page):
`openers`, `1st-down`, `perimeter-screens`, `screen`, `p-and-10`, `2-point`, `base-run`, `run-options`, `base-pass`, `quick`, `play-action`, `rpos`, `player1`–`player5`, `movement`

**Runtime structure:**

```js
callSheet = {
  "1st-down": { left: [play, play, ...], right: [play, ...], customName: "..." },
  "rz-20":    { left: [...], right: [...] },
  // ...one entry per populated category
}
```

---

## Key Global Variables

### app.js

```js
let plays = []; // Master playbook array (all imported plays)
let script = []; // Current working practice script
let scriptWristband = null; // Currently linked wristband
let filteredPlays = []; // Filtered playbook subset
```

### help.js

```js
let currentActiveTab = "playbook"; // Active UI tab name for help + navigation state
```

### callsheet.js

```js
let callSheet = {}; // The call sheet data (see structure above)
let callSheetSettings = {}; // Orientation, current page, custom names
const CALLSHEET_CATEGORIES = []; // All 39 category definitions
```

### script runtime (script-\*.js)

```js
let collapsedPeriods = new Set(); // Collapsed period IDs
let periodTemplates = []; // Saved period templates
let bulkSelectedIndices = []; // Multi-selected play indices
let selectedAvailablePlays = []; // Checked available plays
```

### wristband runtime (wristband*.js)

```js
let wristbandCards = []; // Array of card objects
let currentCardIndex = 0; // Active card tab
const WB_ROWS = 20; // Rows per card
const MAX_CARDS = 5; // Maximum cards
const CELLS_PER_CARD = 40; // Total cells per card (2 columns × 20 rows)
```

---

## Key Utility Functions

### HTML Safety

```js
escapeHtml(text); // Escapes & < > " ' — use for text interpolation
sanitizeHTML(html); // Strips dangerous tags/attrs — use for innerHTML
setInnerHTML(el, html); // el.innerHTML = sanitizeHTML(html)
```

**Rule:** Always `escapeHtml()` user-provided text in template literals. Use `sanitizeHTML()` only when you need to preserve safe HTML formatting. `getFullCall()` already calls `escapeHtml()` internally — never double-escape its output.

### Play Display

```js
getFullCall(play, (options = {})); // Returns HTML string with formatted play call
// Options: showEmoji, useSquares, underEmoji, boldShifts, redShifts,
//          italicMotions, redMotions, noVowels, showLineCall,
//          highlightHuddle, highlightCandy

buildCallSheetPlayParts(play, options); // Returns array of HTML part strings (call sheet specific)
```

### Modals (async, Promise-based)

```js
showModal(message, { title, icon }); // Alert → Promise<void>
showConfirm(message, { title, icon, confirmText, cancelText, danger }); // → Promise<boolean>
showPrompt(message, defaultValue, { title, icon, placeholder }); // → Promise<string|null>
showChoice(message, { title, icon, option1, option2 }); // → Promise<"option1"|"option2"|null>
showListPicker(message, items, { title, icon }); // → Promise<value|null>
```

### Notifications

```js
showToast(message, durationOrOpts); // durationOrOpts: number | { duration, type }
showUndoToast(message, undoCallback, duration); // Toast with undo button (default 5s)
```

### Other Important Utils

```js
debounce(fn, (wait = 150));
safeJSONParse(str, fallback);
safeDeepClone(obj); // structuredClone with JSON fallback
parseCSV(text); // → { plays: [], skipped: [] }
removeVowels(str); // Strip vowels for compressed display
playsMatch(p1, p2); // Compare two play objects by key fields
showContextMenu(event, menuItems); // Right-click context menus
showReorderModal(values, opts); // Drag-to-reorder modal
trapFocus(overlay); // Focus trap for accessibility
addLongPress(element, callback, duration); // Mobile long-press handler
```

---

## CSS Architecture

### Design Tokens

All colors, spacing, typography, shadows, and z-indexes are defined as CSS custom properties in `:root` (base.css). Always use tokens rather than hardcoded values.

**Key token families:**

| Category    | Examples                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Brand       | `--color-primary`, `--color-accent`, `--color-primary-dark`                                                      |
| Functional  | `--color-success`, `--color-danger`, `--color-warning`, `--color-info` (each has `-hover`, `-light` variants)    |
| Backgrounds | `--color-bg-body`, `--color-bg-light`, `--color-bg-lighter`, `--color-bg-input`, `--color-bg-hover-row`          |
| Borders     | `--color-border`, `--color-border-light`, `--color-border-med`, `--color-border-input`                           |
| Text        | `--color-text`, `--color-text-muted`, `--color-text-secondary`, `--color-text-light`                             |
| Spacing     | `--space-xs` (4px) through `--space-xl` (32px)                                                                   |
| Radius      | `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (14px), `--radius-pill` (999px)                         |
| Shadows     | `--shadow-xs` through `--shadow-lg`, `--shadow-focus`                                                            |
| Z-index     | `--z-base` (1) → `--z-toast` (10000) → `--z-skip-link` (100000)                                                  |
| Typography  | `--font-sans` (Inter stack), `--font-mono` (IBM Plex Mono), `--font-size-micro` (8px) → `--font-size-5xl` (48px) |
| Transitions | `--transition-fast` (0.15s), `--transition-normal` (0.25s)                                                       |

### Dark Mode

Supported via `[data-theme="dark"]` selector overriding all token values. Never use hardcoded colors in JS-generated HTML — use CSS classes or design tokens.

### Accessibility

- `prefers-reduced-motion: reduce` disables all animations
- `:focus-visible` ring on interactive elements
- `.sr-only` for screen-reader-only text
- `.skip-link` for skip-to-content
- `#liveAnnouncer` for ARIA live region announcements

### File Responsibilities

| File             | Scope                                                           |
| ---------------- | --------------------------------------------------------------- |
| `base.css`       | Tokens, reset, form elements, selections                        |
| `layout.css`     | Page structure, header, tab bar, panels                         |
| `components.css` | Reusable: `.btn-*`, `.modal-*`, `.toast`, `.badge-*`, utilities |
| `print.css`      | All `@media print` rules (centralized)                          |
| `responsive.css` | All `@media` breakpoints (centralized)                          |
| `[module].css`   | Module-specific styles (callsheet.css, script.css, etc.)        |

### Naming Conventions

- **Module prefix:** Call sheet uses `cs-*`, constraints panel uses `cr-*`, wristband uses `wb-*`
- **BEM-lite:** Mostly flat class names with dashes (`cs-cell-format-dot`, `cr-bucket-row`)
- **State classes:** `active`, `open`, `visible`, `highlighted`, `collapsed`
- **Status classes:** `cr-status-ok`, `cr-status-warn`, `cr-status-error`, `cr-status-empty`
- **Button variants:** `.btn`, `.btn-sm`, `.btn-primary`, `.btn-danger`, `.btn-warning`, `.btn-success`

---

## Service Worker

**Cache name:** `bcoffense-vN` (currently v267)

**Strategy:**

- **Install:** Pre-cache all local assets listed in `LOCAL_ASSETS` array
- **Local files:** Stale-while-revalidate (serve cached, then update cache in background)
- **External resources:** Network-first with cache fallback (Google Fonts, CDNs)
- **Offline:** Navigation requests fall back to `offline.html`

**When to bump the version:**

- Any time you modify CSS, JS, or HTML files
- Increment the number in `const CACHE_NAME = "bcoffense-vN"` in `sw.js`
- If you add a new file, also add it to the `LOCAL_ASSETS` array

---

## Git Conventions

### Commit Messages

Follow Conventional Commits format:

```
feat: Description of new feature (SW vN)
fix: Description of bug fix (SW vN)
perf: Performance improvement description
style: Formatting only, no logic changes
refactor: Code restructuring, no behavior change
```

- **Prefix:** `feat:`, `fix:`, `perf:`, `style:`, `refactor:`
- Optionally scoped: `feat(tier-8):`, `fix(callsheet):`
- Include `(SW vN)` when bumping service worker version
- Lowercase after prefix
- Body: bullet list of specific changes (use `-` prefix)

### Workflow

- Single branch: `main`
- No PRs, no CI — direct commit and push
- Always bump SW version when changing cached assets

---

## Adding New Features — Checklist

1. **Identify which JS file** owns the feature (or create a new one)
2. **Use `data-action`** for all interactive elements — never inline `onclick`
3. **Use `escapeHtml()`** on all user text in template literals
4. **Use design tokens** (CSS custom properties) — never hardcode colors
5. **Use `storageManager`** for persistence — add a key to `STORAGE_KEYS` in utils.js if needed
6. **Add to `LOCAL_ASSETS`** in sw.js if creating a new file
7. **Add the `<script>` tag** in index.html in the correct load order position
8. **Bump `CACHE_NAME`** version in sw.js
9. **Test offline** — ensure Service Worker caches necessary assets
10. **Commit** with conventional commit message including `(SW vN)`

---

## Refactor Ownership Map

### Playbook runtime

- `playbook.js` keeps shared helpers and compatibility globals used across playbook slices.
- `playbook-collections.js` owns collection CRUD and collection-related UI.
- `playbook-print.js` owns playbook print workflows.
- `playbook-editor.js` owns play edit/create modal behavior.
- `playbook-import.js` owns CSV import and imported state hydration.
- `playbook-export.js` owns playbook export flows.
- `playbook-chrome.js` owns toolbar-level playbook actions and status UI.
- `playbook-state.js` owns shared state helpers and reset logic.
- `playbook-filters.js` owns filter extraction and matching.
- `playbook-navigation.js` owns pagination and table navigation.
- `playbook-actions.js` owns row-level mutations and action handlers.
- `playbook-render.js` owns playbook table rendering.

### Wristband runtime

- `wristband.js` is the foundation layer: globals, custom display/tag helpers, and undo/history helpers.
- `wristband-library.js` owns available-play filtering, search state, counts, and stats.
- `wristband-render.js` owns card rendering, color controls, clear, and auto-fill.
- `wristband-cards.js` owns card tabs, duplicate/remove/rename, and active card switching.
- `wristband-export.js` owns print and CSV export.
- `wristband-search.js` owns quick search, favorites, and smart fill.
- `wristband-modals.js` owns help and find/replace overlays.
- `wristband-cell-popup.js` owns the cell editor popup and pending tag/color state.
- `wristband-cell-actions.js` owns cell mutations, drag/drop, copy/paste, and batch actions.
- `wristband-sort.js` owns wristband sorting helpers.
- `wristband-storage.js` owns save/load/draft hydration.
- `wristband-runtime.js` owns DOM bootstrap and delegated event bindings.

### Callsheet runtime

- `callsheet.js` currently owns the core call sheet state, rendering, picker flows, sort helpers, and runtime bindings.
- `callsheet-categories.js` owns category display names/colors and custom-category CRUD.
- `callsheet-metadata.js` owns category notes, target counts, clear actions, and category metadata menus.

## Refactor Guardrails

- Prefer editing the owning split file instead of adding more logic back into compatibility surfaces like `playbook.js` or `wristband.js`.
- When a global function is used by both delegated DOM events and direct programmatic calls, make optional event parameters truly optional.
- Persisted wristband UI mutations must do both: `markWristbandDirty()` and `scheduleWristbandAutosave()`.
- After adding any new split runtime file, update `index.html`, `sw.js`, and this load-order documentation together.

---

## Common Patterns to Follow

### Creating a New Storage Key

```js
// 1. Add to STORAGE_KEYS in utils.js
const STORAGE_KEYS = {
  // ...existing...
  MY_NEW_KEY: "myNewData",
};

// 2. Use via storageManager
const data = storageManager.get(STORAGE_KEYS.MY_NEW_KEY, defaultValue);
storageManager.set(STORAGE_KEYS.MY_NEW_KEY, data);
```

### Adding a Button with Delegation

```html
<!-- In index.html -->
<button
  class="btn btn-sm btn-primary"
  data-action="myFunction"
  data-arg="optionalArg"
>
  Label
</button>
```

```js
// In the appropriate JS file — function must be global
function myFunction(arg) {
  // ...
}
```

### Creating a Modal Overlay

```html
<!-- Overlay with data-action ending in "Overlay" auto-closes on backdrop click -->
<div class="my-panel-overlay" id="myPanel" data-action="closeMyPanelOverlay">
  <div class="my-panel">
    <button data-action="closeMyPanel">×</button>
    <div id="myPanelBody"></div>
  </div>
</div>
```

```js
function openMyPanel() {
  document.getElementById("myPanel").classList.add("visible");
}
function closeMyPanel() {
  document.getElementById("myPanel").classList.remove("visible");
}
```

### Toast Notifications

```js
showToast("Play added to script"); // Default 2s
showToast("Saved successfully", { duration: 3000, type: "success" });
showToast("Something went wrong", { duration: 4000, type: "error" });
```

### Dirty Tracking + Autosave

```js
// Mark data as changed
markScriptDirty();

// Debounced autosave pattern
clearTimeout(scriptAutosaveTimer);
scriptAutosaveTimer = setTimeout(() => {
  saveScriptDraft();
}, AUTOSAVE_DEBOUNCE_MS);

// On explicit save
saveScript();
markScriptClean();
```

---

## Constraints Module (js/constraints.js)

The constraints engine evaluates call sheet buckets against an offensive philosophy config. Key structures:

- **`CALLSHEET_CONSTRAINTS`** — master config with `global`, `roleMap`, `familyMap`, `shotPartnerFamilies`, `qbRunKeywords`, `bucketRules`
- **`categorizePlay(play)`** — classifies a play by family, category, flags (isRun, isScreen, isShot, etc.), and touch targets
- **`evaluateBucket(key, bucket)`** — returns `{ score, status, errors, warnings, successes, philosophy, touchCounts, ... }`
- **`evaluateCallSheet(cs)`** — evaluates entire call sheet, returns `{ overallScore, bucketReports, summary }`
- **`suggestFixesForBucket(report, playbookPlays)`** — suggests playbook plays to fix bucket deficiencies

To change player names: edit `roleMap` in `CALLSHEET_CONSTRAINTS`.  
To add play families: add entries to `familyMap` array.  
To change bucket rules: edit `bucketRules` object.  
To disable entirely: set `CONSTRAINTS_ENABLED = false`.

---

## Things to NEVER Do

- **Never use inline `onclick`/`onchange`/`oninput`** — use `data-action` / `data-onchange` / `data-oninput`
- **Never skip `escapeHtml()`** on user text in template literals
- **Never double-escape** `getFullCall()` output (it already escapes internally)
- **Never hardcode colors** — use CSS custom properties
- **Never use ES modules** (`import`/`export`) — this is a global-scope, no-build project
- **Never add a build step** — no webpack, no Vite, no npm scripts
- **Never create `package.json`** — this is intentionally dependency-free
- **Never forget to bump `sw.js`** cache version after code changes
- **Never use `innerHTML` with unsanitized user content** — use `setInnerHTML()` or `escapeHtml()`
