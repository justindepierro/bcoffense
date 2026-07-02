# Call Sheet Page Roadmap

This file tracks the current state of the Call Sheet surface and the recommended next work batches.

It is based on the current runtime split and verified behavior in:

- `js/callsheet.js` (5 060 lines — primary ownership file)
- `js/callsheet-render.js` (1 151 lines — legacy render layer)
- `js/callsheet-picker-runtime.js` (845 lines)
- `js/callsheet-gameplan-drawer.js` (720 lines)
- `js/callsheet-layout.js` (460 lines)
- `js/callsheet-categories.js` (212 lines)
- `js/callsheet-metadata.js` (162 lines)
- `js/constraints.js`
- `css/callsheet.css`
- Call Sheet section in `index.html`

Use this file as the source of truth when planning follow-up work on the Call Sheet page.

---

## Current Split Status

A partial refactor has moved several concerns out of the original monolith:

| File                           | Owns                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `callsheet-render.js`          | Category constants, display helpers, **legacy** render functions (see note below) |
| `callsheet-categories.js`      | Category display names, colors, custom-category CRUD                              |
| `callsheet-metadata.js`        | Category notes, target counts, clear actions, metadata menus                      |
| `callsheet-layout.js`          | Category ordering persistence, layout modal drag/drop                             |
| `callsheet-picker-runtime.js`  | Picker search/filter, wristband loading, drag/drop into sheet                     |
| `callsheet-gameplan-drawer.js` | Game plan drawer inside the call sheet                                            |
| `callsheet.js`                 | **Everything else** — see below                                                   |

### What is still in `callsheet.js` (needs a home)

| Responsibility                                                              | Approx. lines | Natural owner                                           |
| --------------------------------------------------------------------------- | ------------- | ------------------------------------------------------- |
| State normalization + init                                                  | 1–580         | Keep in `callsheet.js` (core)                           |
| Auto-populate matching + filtering                                          | 580–1 053     | `callsheet-filters.js` (new)                            |
| Personnel display helpers                                                   | 1 056–1 253   | `callsheet-render.js`                                   |
| **Live render path** (renderCallSheet, renderCategory, renderCallSheetPlay) | 1 254–1 820   | `callsheet-render.js` ← **DUPLICATED** (see below)      |
| Context menus + highlight + undo/redo                                       | 1 818–2 297   | Mix; keep context menus in `callsheet-actions.js` (new) |
| Print logic (save/print/modal/render)                                       | 2 297–2 730   | `callsheet-print.js` (new)                              |
| Display options panel + presets                                             | 2 726–3 283   | `callsheet-display.js` (new)                            |
| buildCallSheetPlayParts                                                     | 3 283         | `callsheet-render.js` ← **DUPLICATED**                  |
| Template management (load/save/delete)                                      | 4 171–4 267   | `callsheet-storage.js` (new)                            |
| Smart category reorder + reset                                              | 4 289–4 367   | `callsheet-layout.js` (already partial)                 |
| Sort criteria modal + drag/drop                                             | 4 368–4 727   | `callsheet-sort.js` (new)                               |
| Scouting overlay + scouting badges                                          | 4 727–4 816   | `callsheet-scouting.js` or `callsheet-render.js`        |
| Smart suggestions modal                                                     | 4 817–4 955   | `callsheet-smart.js` (new)                              |
| Export CSV + play location helpers                                          | 4 955–5 060   | `callsheet-export.js` (new)                             |

### The Duplicate Render Path Problem

`callsheet-render.js` (loaded first, position 54) defines:

```
renderCallSheet, buildCallSheetColumns, getCallSheetCategoriesForPage,
renderCategory, renderCallSheetPlay, buildCallSheetPlayParts,
getCallSheetDisplayOptions, getPlayBorderColor, getPersonnelCode,
renderCallSheetPrintPage
```

`callsheet.js` (loaded second, position 55) defines the **same function names** with evolved implementations. Because `callsheet.js` loads after, it wins in global scope — the `callsheet-render.js` versions are currently dead code. This is the top structural risk.

**Resolution plan:** The live implementations in `callsheet.js` are the source of truth. In Phase 1 the `callsheet-render.js` duplicates should be removed and the file should retain only constants (CS_COLORS, CALLSHEET_FRONT, CALLSHEET_BACK, BASE_CALLSHEET_FRONT, BASE_CALLSHEET_BACK, CALLSHEET_CATEGORIES), display helper functions that do not duplicate `callsheet.js`, and nothing else.

---

## Existing Features — Do Not Lose Any of These

This is the full feature inventory. Every item must work after any refactor batch.

### Core Board

- [x] Front page / Back page toggle (19 + 18 base categories)
- [x] Portrait and Landscape orientation modes
- [x] 3-column category grid layout with Left/Right hash columns per category
- [x] Auto-populate from playbook (matches play criteria to category rules)
- [x] Manual category mode (GBOT, Must-Haves, etc.)
- [x] Custom categories (add front/back with name, color, filter criteria)
- [x] Category collapse/expand (individual + expand all / collapse all)
- [x] Blank spacer rows within a category hash column
- [x] Category custom names (rename any category without changing its ID)
- [x] Category custom colors (override default category color)

### Picker

- [x] Click `+ Add` on any hash column → opens play picker overlay
- [x] Picker filters: type, personnel, formation, situation, down, distance, field position, coverage
- [x] Picker search (live filter by text)
- [x] Source toggle: Full Playbook / Game Plan only
- [x] Category-scoped suggestions from constraints engine
- [x] Drag a play from the picker directly into a hash column
- [x] Game Plan drawer: slide-out panel showing Game Plan plays grouped and filtered; drag plays onto the sheet

### Wristband Integration

- [x] Load a saved wristband onto the call sheet (syncs wristband numbers to plays)
- [x] Wristband numbers display in cells when loaded
- [x] Clear loaded wristband
- [x] Refresh wristband numbers

### Cell Display

- [x] Per-cell display options: formation, personnel, protection, motion, shift, under/back, play tags, line call, one word, tempo, key players, notes
- [x] Display presets (save/load named display profiles)
- [x] Personnel badge with color coding by personnel group
- [x] Cell highlight (toggle a play as highlighted on the sheet)
- [x] Custom cell tags (per-play visual labels)
- [x] Duplicate play indicator (same play appears more than once)
- [x] "Dead vs" badge (shows defensive looks to avoid)

### Sort

- [x] Per-category multi-criteria sort (field + direction)
- [x] Sort criteria drag-to-reorder
- [x] Custom sort order lists per field

### Layout

- [x] Drag-to-reorder categories within a page
- [x] Hide/show individual categories
- [x] Smart reorder (auto-arranges categories by down/distance logic)
- [x] Reset to default category order

### Templates

- [x] Save current sheet as a named template
- [x] Load a saved template
- [x] Delete templates
- [x] Built-in templates (standard call sheet structures)

### Insights

- [x] Scouting overlay (shows defensive tendency data per category)
- [x] "Dead vs" badges per play
- [x] Stats panel (quick play-count summary)
- [x] "Not on sheet" view (plays in playbook not yet placed on the sheet)
- [x] Smart suggestions modal (constraints-engine recommendations per category)

### History

- [x] Undo / Redo (25-step history via historyManager)
- [x] Autosave draft (3-second debounce, 24-hour expiry)
- [x] Draft restore on return to the tab

### Save / Export

- [x] Save as named template
- [x] Print modal (pages, orientation, margin, density options)
- [x] Export CSV (plays by category)

### Game Plan Integration

- [x] "Send to Call Sheet" from the Game Plan tab pushes plays into matching categories
- [x] Game plan drawer inside the call sheet for direct drag placement

### Constraints Panel

- [x] Inline constraints evaluation per category (score, status, errors, warnings)
- [x] Philosophy guidance for each bucket

---

## Open Work

### Phase 1 — Resolve the Duplicate Render Path (prerequisite for everything else)

**Priority: highest — must be done before any other split work**

The `callsheet-render.js` legacy functions shadow nothing at runtime but create confusion for future editors. Anyone adding code to `callsheet-render.js` may be editing dead functions.

- [ ] Audit each function in `callsheet-render.js` against the live version in `callsheet.js`
- [x] Document any meaningful differences (if any function in `callsheet-render.js` has logic not in `callsheet.js`, merge it first)
- [x] Remove all duplicate function bodies from `callsheet-render.js`
- [x] Keep in `callsheet-render.js`: CS_COLORS, CALLSHEET_FRONT/BACK/CATEGORIES constants, BASE_CALLSHEET_FRONT/BACK snapshots, helper functions that are NOT duplicated in `callsheet.js`
- [x] Run `node --check` on both files after cleanup
- [x] Run smoke-check and verify the call sheet renders, sorts, prints, and drafts-restore correctly

Definition of done:

- `callsheet-render.js` contains only constants and non-duplicated helpers.
- No function name appears in both files.
- The call sheet passes a full browser smoke check (load, add play, undo, print modal open, draft restore).

---

### Phase 2 — Extract Print Logic

**Priority: high**

Print is ~430 lines buried in `callsheet.js` (L2326–2730). It is self-contained enough to move cleanly.

Target file: `callsheet-print.js`

Candidates to extract:

```
printCallSheet, getCallSheetPrintOptions, setCallSheetPrintOptions,
_csApplyPrintSmartDefaults, _csNormalizePrintPages, _csGetPrintPages,
_csPrintMarginValue, openCallSheetPrintModal, _csRunPrint,
renderCallSheetPrintPage, renderPrintCategory, getCallSheetPrintDensityClass,
renderPrintPlay
```

Also move `renderCallSheetPrintPage` out of `callsheet-render.js` (its copy there is already dead; the live one is in `callsheet.js`).

Steps:

- [x] Create `js/callsheet-print.js` with the extracted functions
- [ ] Add to `LOCAL_ASSETS` in `sw.js` and `<script defer>` in `index.html` (after `callsheet.js`, before `callsheet-categories.js`)
- [x] Remove the extracted functions from `callsheet.js`
- [x] Bump SW version
- [x] Smoke check: open print modal, change options, print preview renders correctly

Definition of done:

- `callsheet-print.js` owns all print rendering.
- `callsheet.js` no longer contains any print-specific logic.
- `printCallSheet` and `openCallSheetPrintModal` are still globally callable.

---

### Phase 3 — Extract Sort Logic

**Priority: high**

Sort is ~360 lines (L4368–4727) including the sort modal, criteria drag/drop, custom order management, and the sort execution path. Already logically isolated.

Target file: `callsheet-sort.js`

Candidates to extract:

```
getCsSortUniqueValues, csSortCompare, openCsSortModal, closeCsSortModal,
renderCsSortCriteria, addCsSortCriteria, removeCsSortCriteria,
updateCsSortField, toggleCsSortDirection, handleCsSortDragStart,
handleCsSortDragOver, handleCsSortDrop, handleCsSortDragEnd,
openCsCustomOrderModal, applyCsSort, sortPlaysByCriteria
```

Steps:

- [x] Create `js/callsheet-sort.js`
- [x] Add to `LOCAL_ASSETS` and `index.html`
- [x] Remove from `callsheet.js`
- [ ] Bump SW version
- [ ] Smoke check: open sort modal, add criteria, drag reorder, apply sort, verify play order changes

---

### Phase 4 — Extract Filters / Auto-populate Logic

**Priority: medium**

Auto-populate and play matching is ~470 lines (L580–1053). It is the most logic-dense block in the file and is called by `initCallSheet` and `autoPopulateCallSheet`.

Target file: `callsheet-filters.js`

Candidates to extract:

```
getWristbandNumberForPlay, splitPreferredValues, getCanonicalCallSheetPlayType,
isCallSheetPlayAllowed, isCallSheetPassingPlay, getCallSheetCoverageAliases,
callSheetCoverageMatches, callSheetKeywordMatches, callSheetKeyPlayerMatches,
callSheetPlayMatchesCriteria, findMatchingCategories,
normalizeCallSheetPlayerName, getCallSheetPlayerCategoryName,
buildPlayerCategoryAutoFillTargets, autoPopulateCallSheet (or keep as orchestrator)
```

Steps:

- [x] Create `js/callsheet-filters.js`
- [x] Add to `LOCAL_ASSETS` and `index.html` (before `callsheet.js`)
- [ ] Remove from `callsheet.js`
- [ ] Bump SW version
- [x] Smoke check: clear + re-populate a full call sheet from playbook, verify all categories fill correctly

---

### Phase 5 — Extract Export + Smart Suggestions

**Priority: medium**

These are small, self-contained blocks at the bottom of `callsheet.js`.

Target: `callsheet-export.js` (new) for CSV/location helpers; `callsheet-smart.js` (new) for suggestions modal.

- [x] Move `exportCallSheetCSV`, `isPlayOnCallSheet`, `getCallSheetPlayLocations` → `callsheet-export.js`
- [x] Move `openSmartSuggestionsModal`, `addSuggestionToSheet` → `callsheet-smart.js` (or into `callsheet-layout.js` if small enough)
- [x] Move scouting functions (`toggleScoutingOverlay`, `toggleScouting`, `buildScoutingBadge`, `buildDeadVsBadge`) into `callsheet-render.js` or a new `callsheet-scouting.js`
- [x] Add new files to `LOCAL_ASSETS` and `index.html`
- [ ] Bump SW version
- [x] Smoke check: export CSV, open suggestions modal, toggle scouting overlay

---

### Phase 6 — Call Sheet UX Follow-Through

**Priority: medium — these are product improvements, not structural cleanup**

These build on the existing feature set without breaking it.

#### 6-A: Display Options Panel Refinement

- [ ] Collapse the display-options unified bar by default on mobile (it takes significant vertical space)
- [ ] Display preset quick-switch chip row (show saved presets as one-click chips above the board)
- [ ] Persist last-active preset name as the board header subtitle

#### 6-B: Category Health Indicators

- [x] Show a small count badge on each category header: `plays / target` (e.g. `8/10`)
- [x] Color the badge green/yellow/red based on fill percentage relative to the target count stored in `callsheet-metadata.js`
- [x] Render these badges in print so coaches see fill status at a glance

#### 6-C: Picker UX

- [x] Remember last picker filter state (type/personnel) per session so re-opening picker doesn't reset
- [x] Add a "plays already on sheet" indicator in the picker list (dim or badge plays that are already placed)
- [ ] Add keyboard shortcut to open the picker for the focused/last category

#### 6-D: Print Modal Improvements

- [ ] "Print what you see" mode: print only the currently-shown page (front or back) without switching
- [ ] Front+Back combined single PDF flow (currently requires two separate prints)
- [ ] Preview thumbnail of the layout before printing

#### 6-E: Board Density and Readability

- [ ] Evaluate whether a "compact" display density preset makes sense (tighter line height, smaller font)
- [ ] Sticky category headers while scrolling through a long board
- [x] Better visual treatment for collapsed categories (show play count in the collapsed header)

---

## Guardrails

- All persistence through `storageManager` — never raw `localStorage`.
- All interactions use `data-action` — no inline `onclick`.
- `escapeHtml()` on all user text in template literals.
- CSS custom properties only — no hardcoded colors.
- Bump `CACHE_NAME` in `sw.js` after every HTML/CSS/JS change.
- Preserve saved-data compatibility — any restructured load path must support old storage formats.
- Every extraction batch must pass `node --check` + smoke-check before shipping.

## Recommended Start

When work begins on the call sheet, start with **Phase 1** (resolve the duplicate render path). It is a prerequisite for all extraction work — you need to know exactly which version of each function is live before moving anything.

After Phase 1, **Phase 2** (print) and **Phase 3** (sort) can be done in either order — they are independent blocks that do not share dependencies.
