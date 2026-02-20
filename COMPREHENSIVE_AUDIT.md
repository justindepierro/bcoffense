# Comprehensive Code Audit Report

**Project:** Script (Football Game Plan SPA)  
**Date:** 2025  
**Scope:** All JS files in `js/` + `index.html`

---

## Table of Contents

1. [Inconsistent Patterns Across Files](#1-inconsistent-patterns-across-files)
2. [Magic Numbers and Strings](#2-magic-numbers-and-strings)
3. [Long Functions (>100 Lines)](#3-long-functions-over-100-lines)
4. [Inconsistent Naming Conventions](#4-inconsistent-naming-conventions)
5. [Potential Bugs](#5-potential-bugs)
6. [Redundant Code](#6-redundant-code)

---

## 1. Inconsistent Patterns Across Files

### 1.1 — `showTab()` uses chained `if` instead of `if/else if`

**File:** `js/app.js`, lines 88–109  
The function uses consecutive `if` statements for tab initialization instead of `if/else if`. Every tab check runs on every call even though only one can match.

```js
// app.js:88-109
if (tabName === "installation") {
    initInstallation();
}
// Initialize wristband if switching to that tab
if (tabName === "wristband") {
    if (wristbandCards.length === 0) {
      initWristband();
    } else { ... }
}
// Initialize tendencies if switching to that tab
if (tabName === "tendencies") { ... }
if (tabName === "callsheet") { ... }
if (tabName === "playbook") { ... }
if (tabName === "script") { ... }
if (tabName === "dashboard") { ... }
```

### 1.2 — `tabMap` object duplicated in two functions

**File:** `js/app.js`, lines 66–76 and lines 763–772  
The identical `tabMap` mapping is defined as a local `const` in both `showTab()` and `dashGoToTab()`:

```js
// app.js:66 (inside showTab)
const tabMap = {
  playbook: 0,
  script: 1,
  wristband: 2,
  tendencies: 3,
  callsheet: 4,
  installation: 5,
  dashboard: 6,
};

// app.js:763 (inside dashGoToTab)
const tabMap = {
  playbook: 0,
  script: 1,
  wristband: 2,
  tendencies: 3,
  callsheet: 4,
  installation: 5,
  dashboard: 6,
};
```

### 1.3 — Two separate CSV parsers with different implementations

**Files:** `js/utils.js` line 971, `js/tendencies.js` line 2268  
`parseCSV()` in utils.js is a full CSV parser supporting quoted fields. `parseCSVLine()` in tendencies.js is a separate line-level CSV parser with its own quoting logic. These could be unified.

```js
// utils.js:971
function parseCSV(text) { ... }

// tendencies.js:2268
function parseCSVLine(line) { ... }
```

### 1.4 — Two parallel play-text builders with different option shapes

**Files:** `js/utils.js` line 1102, `js/callsheet.js` line 2792  
`getFullCall()` and `buildCallSheetPlayParts()` both construct play text strings from a play object + display options, but accept differently-shaped option objects and return results differently.

```js
// utils.js:1102
function getFullCall(play, options = {}) { ... }

// callsheet.js:2792
function buildCallSheetPlayParts(play, options) { ... }
```

### 1.5 — Inline HTML event handlers mixed with `addEventListener`

**File:** `index.html` (throughout) + all JS files  
The HTML uses inline `onclick`, `onchange`, `oninput` attributes extensively, while JS files also use `addEventListener` for keyboard handlers, drag/drop, etc. This creates two parallel event binding patterns.

```html
<!-- index.html:109-121 (inline handlers) -->
<button class="tab active" onclick="showTab('playbook')" ...>Playbook</button>

<!-- Meanwhile in JS - programmatic listeners -->
// playbook.js uses: document.addEventListener("keydown", ...) // callsheet.js
uses: el.addEventListener("dragstart", ...)
```

### 1.6 — Modal close pattern inconsistency

Overlay-click-to-close is implemented differently across modals:

- Some use `onclick="closeX(event)"` on the overlay div, checking `event.target === overlay`
- Some use `onclick="closeX()"` with no event parameter (close unconditionally)
- Some use `event.stopPropagation()` on inner content + overlay click

---

## 2. Magic Numbers and Strings

### 2.1 — `3000` ms autosave debounce (11 occurrences across 4 files)

| File               | Line(s)                                       |
| ------------------ | --------------------------------------------- |
| `js/script.js`     | 143, 1068, 1189, 1203, 1497, 1653, 4422, 4482 |
| `js/wristband.js`  | 61                                            |
| `js/callsheet.js`  | 2740                                          |
| `js/tendencies.js` | 549                                           |

```js
// script.js:143
}, 3000); // 3-second debounce

// wristband.js:61
}, 3000);
```

**Recommendation:** Define a shared constant like `AUTOSAVE_DEBOUNCE_MS = 3000`.

### 2.2 — `86400000` ms (24 hours) draft expiry

**Files:** `js/callsheet.js` line 2753, `js/tendencies.js` line 556

```js
// callsheet.js:2753
if (age > 86400000) {

// tendencies.js:556
if (Date.now() - draft.timestamp > 86400000) {
```

**Recommendation:** Define `DRAFT_EXPIRY_MS = 86400000` (or `24 * 60 * 60 * 1000`).

### 2.3 — `40` cells per wristband card (20+ occurrences in wristband.js, also in script.js and callsheet.js)

`WB_ROWS = 20` is defined as a constant, but the derived value `40` (= 20 rows × 2 columns) is hardcoded throughout:

```js
// wristband.js:576
const newData = Array(40).fill(null);

// wristband.js:589
for (let i = 0; i < 40; i++) {

// wristband.js:788
wristbandCards = [{ name: "Card 1", data: Array(40).fill(null) }];

// wristband.js:812
${card.name} <span class="card-count">(${count}/40)</span>

// wristband.js:1092
const cardOffset = currentCardIndex * 40;

// callsheet.js:1936
const wristbandNum = cardIdx * 40 + cellIdx + 11;

// script.js:3072
const cardOffset = cardIdx * 40;
```

**Recommendation:** Define `WB_CELLS_PER_CARD = WB_ROWS * 2` and use it everywhere.

### 2.4 — `11` as wristband starting number offset

**File:** `js/callsheet.js` line 1936

```js
const wristbandNum = cardIdx * 40 + cellIdx + 11;
```

The number `11` appears as the starting wristband number offset — a domain-specific magic number.

### 2.5 — Scoring weights in `scorePlayForSituation()`

**File:** `js/utils.js`, lines ~1990–2020

```js
// utils.js — magic weight values
const penalty = intel.topCoverage[0].pct >= 30 ? -40 : -20;
// Also uses: 30, 20, 25, 15, -40, -20, -30, -15
```

### 2.6 — Scoring weights in `generateSmartInstallReport()`

**File:** `js/installation.js`, lines ~624–850

```js
// installation.js — weighted importance scoring
// Uses weights: 50, 20, 15, 5, 3 for different rating components
```

### 2.7 — `150` max plays shown in picker

**File:** `js/callsheet.js` line ~1780

```js
// callsheet.js — caps visible plays in the call sheet play picker
```

### 2.8 — Color hex strings repeated everywhere (50+ occurrences)

The same 6 hex colors appear across `callsheet.js`, `app.js`, `utils.js`, and `index.html`:

| Color  | Hex       | Sample locations                                     |
| ------ | --------- | ---------------------------------------------------- |
| Red    | `#dc3545` | callsheet.js:9, 17, 139, 792, 1137, 1175, 1307       |
| Blue   | `#007bff` | callsheet.js:1176, 1308; index.html:1220, 1950       |
| Green  | `#28a745` | callsheet.js:60, 85, 109, 169, 788, 1013, 1177, 1309 |
| Yellow | `#ffc107` | callsheet.js:25, 50, 75, 92, 99, 116, 789, 794, 1310 |
| Orange | `#fd7e14` | callsheet.js:35, 132, 251, 274, 790, 1179            |
| Purple | `#6f42c1` | callsheet.js:42, 67, 295, 791, 1181                  |

**Recommendation:** Define a `COLORS` constant map and reference by name.

### 2.9 — `200` ms tooltip preview delay

**File:** `js/playbook.js` line ~650

```js
// playbook.js — previewTimeout with 200ms delay for play hover preview
```

---

## 3. Long Functions (Over 100 Lines)

| Function                       | File            | Start Line | Approx. Length |
| ------------------------------ | --------------- | ---------- | -------------- |
| `showPlayContextMenu()`        | callsheet.js    | 1295       | ~270 lines     |
| `showSmartInstallReport()`     | installation.js | 856        | ~270 lines     |
| `generateSmartInstallReport()` | installation.js | 624        | ~230 lines     |
| `findMatchingCategories()`     | callsheet.js    | 575        | ~190 lines     |
| `renderScript()`               | script.js       | 2441       | ~180 lines     |
| `renderCallSheet()`            | callsheet.js    | 812        | ~180 lines     |
| `printSmartInstallReport()`    | installation.js | 1128       | ~195 lines     |
| `renderOpponentDetail()`       | tendencies.js   | 1155       | ~130 lines     |
| `renderPlayLogTable()`         | tendencies.js   | 1287       | ~130 lines     |
| `populateCallSheetPlayList()`  | callsheet.js    | 1658       | ~130 lines     |
| `renderStatsDashboard()`       | tendencies.js   | 1421       | ~130 lines     |
| `printWristband()`             | wristband.js    | 1573       | ~130 lines     |
| `openSmartSuggestionsModal()`  | callsheet.js    | 4043       | ~130 lines     |
| `renderWristbandGrid()`        | wristband.js    | 1079       | ~110 lines     |
| `renderCategory()`             | callsheet.js    | 995        | ~100 lines     |

### Notable patterns in long functions:

- **`showPlayContextMenu()`** (callsheet.js:1295): Builds ~270 lines of inline HTML for a context menu including border colors, background colors, personnel borders, text styling, and notes. This is a single function containing substantial UI template logic that could be broken into helper functions.
- **`showSmartInstallReport()`** (installation.js:856): Builds the entire smart install report HTML (~270 lines) with nested loops composing table rows.
- **`findMatchingCategories()`** (callsheet.js:575): Complex matching logic with many conditional branches for play-to-category mapping.

---

## 4. Inconsistent Naming Conventions

### 4.1 — `escapeHtml()` vs `escapeAttr()` — different names for similar sanitization

**Files:** `js/utils.js` (used everywhere), `js/installation.js` line 425

```js
// utils.js — shared HTML escaper
function escapeHtml(str) { ... }

// installation.js:425 — local attribute escaper
function escapeAttr(str) { ... }
```

Both escape HTML special characters. `escapeAttr()` could use `escapeHtml()` or the functions could be unified with a clear naming convention.

### 4.2 — Module prefix inconsistency for state variables

Each module uses a different (or no) prefix for its state variables:

| Module        | Prefix | Examples                                                            |
| ------------- | ------ | ------------------------------------------------------------------- |
| tendencies.js | `td`   | `tdFilters`, `tdSearchText`, `tdSortColumn`, `tdSelectedRow`        |
| wristband.js  | `wb`   | `wbSortCriteria`, `wbCustomSortOrders`, `wbActiveFilters`           |
| callsheet.js  | `cs`   | `csSortCriteria`, `csCustomSortOrders`, `csSortDraggedIdx`          |
| script.js     | none   | `scriptCustomSortOrders`, `bulkSelectedIndices`, `collapsedPeriods` |
| playbook.js   | none   | `selectedRowIndex`, `columnVisibility`, `previewTimeout`            |

### 4.3 — Underscore-prefix convention used inconsistently for "private" variables

```js
// Some use underscore prefix:
_reorderDraggedIdx; // utils.js
_installDataCache; // installation.js

// Others do not:
draggedCatId; // callsheet.js
csSortDraggedIdx; // callsheet.js
```

### 4.4 — `noVowels` vs `removeVowels` — same option, different key names

**File:** `js/wristband.js`

```js
// wristband.js:1071 — getWristbandDisplayOptions() uses:
noVowels: document.getElementById("wbRemoveVowels")?.checked || false,

// wristband.js:1721 — captureWbDisplaySettings() uses:
removeVowels: document.getElementById("wbRemoveVowels")?.checked || false,
```

The same checkbox controls the same feature, but the key name differs between the two functions. (See also Bug 5.1.)

### 4.5 — Inconsistent function name patterns for similar operations

| Operation       | wristband.js                   | callsheet.js                   |
| --------------- | ------------------------------ | ------------------------------ |
| Sort comparison | `compareWithCustomOrder()`     | `csSortCompare()`              |
| Apply sort      | `applyWristbandSort()`         | `applyCsSort()`                |
| Display options | `getWristbandDisplayOptions()` | `getCallSheetDisplayOptions()` |
| Filter plays    | `filterWristbandPlays()`       | `populateCallSheetPlayList()`  |

### 4.6 — `selectedRowIndex` vs `tdSelectedRow`

**Files:** `js/playbook.js` vs `js/tendencies.js`

Both track which table row is selected in their respective modules, but use different naming patterns.

---

## 5. Potential Bugs

### 5.1 — **CONFIRMED BUG:** `noVowels` vs `removeVowels` key mismatch (wristband save/restore)

**File:** `js/wristband.js`, lines 1071 vs 1721 vs 1888

**Problem:** `getWristbandDisplayOptions()` (line 1071) maps the vowel-removal checkbox to the key `noVowels`. But `captureWbDisplaySettings()` (line 1721) saves it as `removeVowels`. When restoring settings, line 1888 calls `setCheckbox("wbRemoveVowels", ds.removeVowels)`.

**Impact:** The `getFullCall()` function in utils.js (line ~1140) checks for `options.noVowels` — so display in grid mode works. But saved display presets store `removeVowels`, so `getFullCall()` won't see the key when restoring a saved preset that passes `captureWbDisplaySettings()` output to `getFullCall()`.

```js
// wristband.js:1071 — used for live rendering
noVowels: document.getElementById("wbRemoveVowels")?.checked || false,

// wristband.js:1721 — used for saving display settings
removeVowels: document.getElementById("wbRemoveVowels")?.checked || false,

// wristband.js:1888 — restore reads removeVowels
setCheckbox("wbRemoveVowels", ds.removeVowels);
```

### 5.2 — `playsMatch()` returns true on formation+play match, ignoring personnel

**File:** `js/utils.js`, lines 1329–1346

```js
function playsMatch(p1, p2) {
  if (!p1 || !p2) return false;

  // First try exact match on key fields
  if (p1.formation === p2.formation &&
      p1.play === p2.play &&
      p1.personnel === p2.personnel) {
    return true;
  }

  // Try match without personnel  ← LOOSE MATCH
  if (p1.formation === p2.formation && p1.play === p2.play) {
    return true;
  }
  ...
```

**Impact:** Two plays with the same formation and play name but different personnel (e.g., "21 Ace Right Jet Y Cross" vs "11 Ace Right Jet Y Cross") will be considered a match. This can cause false positives in duplicate detection, call sheet placement, and wristband linkage.

### 5.3 — Duplicate `class` attributes in HTML (browser ignores second)

**File:** `index.html`, lines 1265–1267 and 2643–2645 and 2649–2651

```html
<!-- index.html:1265-1267 — Auto-Fill button: second class is ignored -->
<button
  class="btn btn-sm"
  class="btn btn-secondary"
  onclick="autoFillWristband()"
>
  <!-- index.html:2643-2645 — Preview button: first class is kept, second ignored -->
  <button class="btn" onclick="previewSmartScript()" class="btn btn-secondary">
    <!-- index.html:2649-2651 — Re-Roll button: same issue -->
    <button
      class="btn"
      onclick="previewSmartScript()"
      class="btn btn-info"
    ></button>
  </button>
</button>
```

**Impact:** The second `class` attribute is silently ignored by browsers. These buttons won't have the intended styling (`btn-secondary`, `btn-info`).

### 5.4 — `Date.now()` used as unique IDs — collision risk

**Files:** Multiple locations in `js/script.js` and `js/wristband.js`

Some usages add `Math.random()` to mitigate, but others don't:

```js
// wristband.js:1777 — no randomization
id: Date.now(),

// script.js:1424 — no randomization
id: Date.now(),

// script.js:2827 — no randomization
id: Date.now(),

// script.js:837 — has randomization (better)
id: Date.now() + Math.random(),
```

**Impact:** If two items are created in the same millisecond (e.g., bulk operations), they'll share the same ID. Even with `Math.random()`, `Date.now() + Math.random()` is imprecise since it adds a float to an integer.

**Recommendation:** Use `crypto.randomUUID()` or a counter-based approach.

### 5.5 — Global `plays` variable shadowed in tendencies.js

**File:** `js/tendencies.js`, line 753

```js
// app.js:4 — global
let plays = [];

// tendencies.js:753 — local shadows global
let plays = opp.plays.map((p, i) => ({ ...p, _origIndex: i }));
```

**Impact:** Inside `getFilteredPlays()`, the local `plays` variable shadows the global playbook `plays` array. While this is intentional (operates on opponent data), it can cause confusion during maintenance and risks accidental reference to the wrong `plays` in closures.

### 5.6 — `showToast()` defined only in playbook.js but used globally

**File:** `js/playbook.js`, line 382

```js
function showToast(message, durationOrOpts = 2000) { ... }
```

This is used by `callsheet.js`, `wristband.js`, `script.js`, etc. — all modules rely on it. If playbook.js fails to load or is loaded after a module that calls `showToast()`, the app breaks. A utility function used everywhere should live in `utils.js`.

### 5.7 — Inline `onclick` with string-interpolated user data (potential XSS)

**File:** `js/wristband.js`, `populateWristbandCheckboxFilters()` (~line 900+)  
**File:** `js/callsheet.js`, `showPlayContextMenu()` (line 1295+)

Various places build HTML with inline event handlers containing user-supplied data (play names, personnel groupings) without escaping, e.g.:

```js
// If personnel value contains a ' character, it breaks the onclick handler
onclick = "toggleWbFilter('personnel', '${value}')";
```

**Impact:** If imported CSV data contains quotes or special characters in play/personnel names, the injected HTML attribute could break or execute unintended code.

---

## 6. Redundant Code

### 6.1 — Personnel helper functions scattered across files

**Files:** `js/utils.js` line 1050, `js/callsheet.js` lines 762–810

```js
// utils.js:1050
function getPersonnelEmoji(personnel, useSquares = false) { ... }

// callsheet.js:762
function getPersonnelCode(personnel) { ... }

// callsheet.js:782
function getPersonnelBgColor(personnel) { ... }

// callsheet.js:802
function getPersonnelTextColor(personnel) { ... }
```

These four functions all contain switch statements mapping personnel groups to visual representations. They share the same personnel → color/code mapping logic but aren't consolidated. All should be in `utils.js`.

### 6.2 — `compareWithCustomOrder()` ≈ `csSortCompare()` — near-identical comparison functions

**Files:** `js/wristband.js` line 500, `js/callsheet.js` line 3613

Both functions implement custom-ordered sorting with the same logic pattern: check custom order → fall back to natural comparison → apply direction. They should be a single shared function in `utils.js`.

```js
// wristband.js:500
function compareWithCustomOrder(valA, valB, field, direction) { ... }

// callsheet.js:3613
function csSortCompare(valA, valB, field, direction) { ... }
```

### 6.3 — `getFullCall()` ≈ `buildCallSheetPlayParts()` — parallel play-text builders

**Files:** `js/utils.js` line 1102, `js/callsheet.js` line 2792

Both build display text from a play object + options. `getFullCall()` returns a single string. `buildCallSheetPlayParts()` returns an object with separate parts. They share ~80% of the same logic (shift handling, motion formatting, vowel removal, line call bracketing).

### 6.4 — Display options checkbox-to-object pattern repeated 3 times

**Files:** `js/wristband.js` lines 1060–1073, `js/callsheet.js` `getCallSheetDisplayOptions()`, `js/script.js` equivalent

All three modules read ~10-15 checkbox DOM elements by ID and build an options object with keys like `showEmoji`, `useSquares`, `boldShifts`, `redShifts`, `italicMotions`, `redMotions`, `noVowels/removeVowels`, `showLineCall`. The IDs differ only by prefix (`wb`, `callsheet`, script).

A single parameterized function like `getDisplayOptions(prefix)` could replace all three.

### 6.5 — Autosave + draft recovery pattern repeated in 4 modules

**Files:** `js/script.js`, `js/wristband.js`, `js/callsheet.js`, `js/tendencies.js`

Each module independently implements the same pattern:

1. Debounced autosave writing to localStorage (~3000ms)
2. On init, check for draft with timestamp
3. If draft < 86400000ms old, prompt user to restore
4. If older, discard

This identical pattern could be extracted into a shared `DraftManager` class or utility function.

### 6.6 — Sort criteria UI management duplicated between wristband and callsheet

**Files:** `js/wristband.js` and `js/callsheet.js`

Both modules implement:

- Add/remove sort criteria
- Drag-to-reorder sort criteria
- Custom field order editor
- Sort preset save/load/delete
- Apply sort with multi-level comparison

The UI rendering and event handling code is nearly identical in structure.

### 6.7 — Drag-and-drop reorder handlers repeated across 4+ modules

**Files:** `js/utils.js` (`showReorderModal`), `js/callsheet.js`, `js/wristband.js`, `js/tendencies.js`, `js/script.js`

Each implements its own `dragstart`, `dragover`, `drop` handlers for reordering list items. While the data being reordered differs, the DOM manipulation pattern (set dragged index, swap on drop, clear) is identical.

---

## Summary Statistics

| Metric                           | Count        |
| -------------------------------- | ------------ |
| Total JS lines analyzed          | ~17,960      |
| Total HTML lines analyzed        | 2,751        |
| Inconsistent patterns identified | 6            |
| Magic numbers/strings identified | 9 categories |
| Functions >100 lines             | 15           |
| Naming inconsistencies           | 6            |
| Potential bugs                   | 7            |
| Redundant code patterns          | 7            |

## Priority Recommendations

1. **Fix the `noVowels`/`removeVowels` key mismatch** (Bug 5.1) — active bug affecting saved display presets
2. **Fix duplicate `class` attributes in HTML** (Bug 5.3) — buttons missing intended styling
3. **Extract shared constants** for `3000`ms, `86400000`ms, `40` cells, color hex values
4. **Move `showToast()`** from playbook.js to utils.js
5. **Unify `getFullCall()`/`buildCallSheetPlayParts()`** and `compareWithCustomOrder()`/`csSortCompare()`
6. **Create a shared `DraftManager`** to eliminate repeated autosave/draft-recovery boilerplate
7. **Move all personnel helpers** into utils.js
8. **Use `crypto.randomUUID()`** instead of `Date.now()` for IDs
