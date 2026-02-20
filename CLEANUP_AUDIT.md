# Codebase Cleanup & Optimization Audit

**Date:** June 2025  
**Scope:** All 10 files — `index.html`, `css/styles.css`, and 8 JS files  
**Method:** Line-by-line analysis across all 10 requested categories

---

## Summary of Findings

| #   | Finding                                                                                        | Impact    | Category              |
| --- | ---------------------------------------------------------------------------------------------- | --------- | --------------------- |
| 1   | CRUD pattern duplication (script vs wristband)                                                 | 🔴 HIGH   | Duplicate CRUD        |
| 2   | `captureWbDisplaySettings()` duplicates `getWristbandDisplayOptions()`                         | 🔴 HIGH   | Display options       |
| 3   | Duplicate initialization code in `handleFileUpload` vs `initApp`                               | 🟠 MEDIUM | Repeated DOM          |
| 4   | `toggleDisplayOptions` and `toggleIntegrationPanel` are identical                              | 🟠 MEDIUM | Repeated DOM          |
| 5   | Hardcoded checkbox ID arrays in `selectAllWbOptions`/`clearAllWbOptions`                       | 🟠 MEDIUM | Naming/Constants      |
| 6   | Naming inconsistency: scripts use `.name`, wristbands use `.title`                             | 🟠 MEDIUM | Naming                |
| 7   | Naming inconsistency: `noVowels` vs `removeVowels` property key                                | 🟡 LOW    | Naming                |
| 8   | Hardcoded color values in context menu and callsheet categories                                | 🟡 LOW    | Constants             |
| 9   | Context menu positioning/dismissal boilerplate is duplicated                                   | 🟡 LOW    | Context menus         |
| 10  | `showToast` defined in `playbook.js` — only used by playbook internally but relied on globally | 🟡 LOW    | Dead code / placement |
| 11  | Console statements are appropriate — no cleanup needed                                         | ✅ NONE   | Console.log           |

---

## Finding 1 — CRUD Pattern Duplication (Script vs Wristband)

**Impact:** 🔴 HIGH — ~440 lines of near-identical code  
**Files:** `js/script.js` (lines 2783–3005), `js/wristband.js` (lines 1733–1990)  
**Category:** Duplicate CRUD patterns

### The Problem

The 6 CRUD functions in `script.js` and `wristband.js` follow the **exact same pattern**:

| Operation | script.js                        | wristband.js                        |
| --------- | -------------------------------- | ----------------------------------- |
| Save      | `saveScript()` L2783             | `saveWristband()` L1733             |
| List      | `loadSavedScriptsList()` L2847   | `loadSavedWristbandsList()` L1798   |
| Load      | `loadScript(id)` L2911           | `loadWristband(id)` L1855           |
| Delete    | `deleteSavedScript(id)` L2943    | `deleteSavedWristband(id)` L1915    |
| Rename    | `renameSavedScript(id)` L2964    | `renameSavedWristband(id)` L1945    |
| Overwrite | `overwriteSavedScript(id)` L2998 | `overwriteSavedWristband(id)` L1975 |

### Example — Delete functions are nearly identical

**script.js:2943**

```js
async function deleteSavedScript(id) {
  const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  const target = savedScripts.find((s) => s.id === id);
  if (!target) return;
  const ok = await showConfirm(`Delete "${target.name}"?`, {
    title: "Delete Script",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  const filtered = savedScripts.filter((s) => s.id !== id);
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, filtered);
  loadSavedScriptsList();
  showToast(`"${target.name}" deleted`);
}
```

**wristband.js:1915**

```js
async function deleteSavedWristband(id) {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const target = saved.find((s) => s.id === id);
  if (!target) return;
  const ok = await showConfirm(`Delete "${target.title}"?`, {
    title: "Delete Wristband",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  const filtered = saved.filter((s) => s.id !== id);
  storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, filtered);
  loadSavedWristbandsList();
  populateScriptWristbandSelect();
  populateWristbandHighlightDropdown();
  showToast(`"${target.title}" deleted`);
}
```

The only differences:

1. Storage key (`SAVED_SCRIPTS` vs `SAVED_WRISTBANDS`)
2. Naming field (`.name` vs `.title` — see Finding 6)
3. Entity label string ("Script" vs "Wristband")
4. Post-action callbacks (wristband has extra `populateScriptWristbandSelect()` etc.)

### Concrete Fix

Create a generic CRUD factory in `utils.js`:

```js
/**
 * Create standardized delete/rename/overwrite functions for a saved-item list.
 * @param {Object} config
 * @param {string} config.storageKey - STORAGE_KEYS.SAVED_SCRIPTS etc.
 * @param {string} config.entityName - "Script", "Wristband"
 * @param {string} config.nameField - "name" or "title"
 * @param {Function[]} config.afterChange - callbacks to run after any mutation
 */
function createCrudOps({
  storageKey,
  entityName,
  nameField,
  afterChange = [],
}) {
  const runAfter = () => afterChange.forEach((fn) => fn());

  async function deleteItem(id) {
    const items = storageManager.get(storageKey, []);
    const target = items.find((s) => s.id === id);
    if (!target) return;
    const ok = await showConfirm(`Delete "${target[nameField]}"?`, {
      title: `Delete ${entityName}`,
      icon: "🗑️",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    storageManager.set(
      storageKey,
      items.filter((s) => s.id !== id),
    );
    runAfter();
    showToast(`"${target[nameField]}" deleted`);
  }

  async function renameItem(id) {
    const items = storageManager.get(storageKey, []);
    const item = items.find((s) => s.id === id);
    if (!item) return;
    const newName = await showPrompt(
      `Rename ${entityName.toLowerCase()}:`,
      item[nameField],
      {
        title: "Rename",
        icon: "✏️",
      },
    );
    if (newName && newName.trim()) {
      item[nameField] = newName.trim();
      storageManager.set(storageKey, items);
      runAfter();
      showToast(`Renamed to "${item[nameField]}"`);
    }
  }

  async function overwriteItem(id, getStateCallback) {
    const items = storageManager.get(storageKey, []);
    const item = items.find((s) => s.id === id);
    if (!item) return;
    const ok = await showConfirm(
      `Overwrite "${item[nameField]}" with the current ${entityName.toLowerCase()}?`,
      {
        title: "Overwrite",
        icon: "⚠️",
        confirmText: "Overwrite",
        danger: true,
      },
    );
    if (!ok) return;
    Object.assign(item, getStateCallback(), {
      savedAt: new Date().toISOString(),
    });
    storageManager.set(storageKey, items);
    runAfter();
    showToast(`"${item[nameField]}" updated!`);
  }

  return { deleteItem, renameItem, overwriteItem };
}
```

Then consume it per module:

```js
// script.js
const scriptCrud = createCrudOps({
  storageKey: STORAGE_KEYS.SAVED_SCRIPTS,
  entityName: "Script",
  nameField: "name",
  afterChange: [
    loadSavedScriptsList,
    () => {
      markScriptClean();
      storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
    },
  ],
});
const deleteSavedScript = scriptCrud.deleteItem;
const renameSavedScript = scriptCrud.renameItem;
```

**Savings:** ~120 lines removed, and bug fixes (like the naming inconsistency) only need to happen in one place.

---

## Finding 2 — `captureWbDisplaySettings()` Duplicates `getWristbandDisplayOptions()`

**Impact:** 🔴 HIGH — two functions reading the exact same checkboxes  
**File:** `js/wristband.js` — lines 1062 and 1712  
**Category:** Display options getter duplication

### The Problem

These two functions read the **exact same DOM checkboxes** with the **same property names**, differing only in that `captureWbDisplaySettings()` includes 2 extra fields:

**`getWristbandDisplayOptions()` (line 1062) — 9 properties:**

```js
function getWristbandDisplayOptions() {
  return {
    showEmoji: document.getElementById("wbShowEmoji")?.checked || false,
    useSquares: document.getElementById("wbUseSquares")?.checked || false,
    underEmoji: document.getElementById("wbUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("wbBoldShifts")?.checked || false,
    redShifts: document.getElementById("wbRedShifts")?.checked || false,
    italicMotions: document.getElementById("wbItalicMotions")?.checked || false,
    redMotions: document.getElementById("wbRedMotions")?.checked || false,
    noVowels: document.getElementById("wbRemoveVowels")?.checked || false,
    showLineCall: document.getElementById("wbShowLineCall")?.checked || false,
  };
}
```

**`captureWbDisplaySettings()` (line 1712) — 11 properties (same 9 + 2 extra):**

```js
function captureWbDisplaySettings() {
  return {
    showEmoji: document.getElementById("wbShowEmoji")?.checked || false,
    useSquares: document.getElementById("wbUseSquares")?.checked || false,
    underEmoji: document.getElementById("wbUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("wbBoldShifts")?.checked || false,
    redShifts: document.getElementById("wbRedShifts")?.checked || false,
    italicMotions: document.getElementById("wbItalicMotions")?.checked || false,
    redMotions: document.getElementById("wbRedMotions")?.checked || false,
    noVowels: document.getElementById("wbRemoveVowels")?.checked || false,
    showLineCall: document.getElementById("wbShowLineCall")?.checked || false,
    highlightHuddle:
      document.getElementById("wbHighlightHuddle")?.checked || false,
    highlightCandy:
      document.getElementById("wbHighlightCandy")?.checked || false,
  };
}
```

### Concrete Fix

Delete `captureWbDisplaySettings()` entirely and add the 2 missing fields to `getWristbandDisplayOptions()`:

```js
function getWristbandDisplayOptions() {
  return {
    showEmoji: document.getElementById("wbShowEmoji")?.checked || false,
    useSquares: document.getElementById("wbUseSquares")?.checked || false,
    underEmoji: document.getElementById("wbUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("wbBoldShifts")?.checked || false,
    redShifts: document.getElementById("wbRedShifts")?.checked || false,
    italicMotions: document.getElementById("wbItalicMotions")?.checked || false,
    redMotions: document.getElementById("wbRedMotions")?.checked || false,
    noVowels: document.getElementById("wbRemoveVowels")?.checked || false,
    showLineCall: document.getElementById("wbShowLineCall")?.checked || false,
    highlightHuddle:
      document.getElementById("wbHighlightHuddle")?.checked || false,
    highlightCandy:
      document.getElementById("wbHighlightCandy")?.checked || false,
  };
}
```

Then replace all 4 calls to `captureWbDisplaySettings()` (lines 1761, 1782, 1980, and definition at 1712) with `getWristbandDisplayOptions()`.

**Savings:** ~15 lines removed, and display settings are always captured consistently.

---

## Finding 3 — Duplicate Initialization Code

**Impact:** 🟠 MEDIUM — ~15 identical lines  
**File:** `js/app.js` — `handleFileUpload()` (lines 205–224) vs `initApp()` (lines 240–260)  
**Category:** Repeated DOM patterns

### The Problem

Both functions share this identical init sequence:

```js
populateFilters();
restoreColumnVisibility();
initPlaybookKeyboard();
filterPlays();
updateStatsBar();
renderAvailablePlays();
loadSavedScriptsList();
populateScriptWristbandSelect();
restoreScriptDisplayOptions();
ensureFirstPeriod();
renderScript();
```

`initApp()` adds a few extra items (draft checks, sort icon restore, callsheet display restore), but the core is identical.

### Concrete Fix

Extract a shared function:

```js
function initAllModules() {
  populateFilters();
  restoreColumnVisibility();
  initPlaybookKeyboard();
  filterPlays();
  updateStatsBar();
  renderAvailablePlays();
  loadSavedScriptsList();
  populateScriptWristbandSelect();
  restoreScriptDisplayOptions();
  ensureFirstPeriod();
  renderScript();
}
```

Then `handleFileUpload` calls `initAllModules()` and `initApp()` calls it after restoring state, then runs additional draft checks.

---

## Finding 4 — Identical Toggle Functions

**Impact:** 🟠 MEDIUM — exact code duplication  
**File:** `js/script.js` — lines 276 and 291  
**Category:** Repeated DOM patterns

### The Problem

```js
// Line 276
function toggleDisplayOptions(headerEl) {
  const content = headerEl.nextElementSibling;
  content.classList.toggle("collapsed");
  const icon = headerEl.querySelector(".toggle-icon");
  if (content.classList.contains("collapsed")) {
    icon.textContent = "▶";
  } else {
    icon.textContent = "▼";
  }
}

// Line 291
function toggleIntegrationPanel(headerEl) {
  const content = headerEl.nextElementSibling;
  content.classList.toggle("collapsed");
  const icon = headerEl.querySelector(".toggle-icon");
  if (content.classList.contains("collapsed")) {
    icon.textContent = "▶";
  } else {
    icon.textContent = "▼";
  }
}
```

These are **character-for-character identical**.

### Concrete Fix

Delete `toggleIntegrationPanel` and update its 1 HTML call to use `toggleDisplayOptions` instead:

In `index.html` line 934, change:

```html
onclick="toggleIntegrationPanel(this)"
```

to:

```html
onclick="toggleDisplayOptions(this)"
```

Or rename to a generic `toggleCollapsiblePanel(headerEl)` for clarity.

**Savings:** 14 lines removed.

---

## Finding 5 — Hardcoded Checkbox ID Arrays

**Impact:** 🟠 MEDIUM — maintainability risk  
**File:** `js/wristband.js` — lines 736–770  
**Category:** Naming / Constants

### The Problem

`selectAllWbOptions()` and `clearAllWbOptions()` each contain a hardcoded array of 11 checkbox IDs:

```js
function selectAllWbOptions() {
  const ids = [
    "wbShowEmoji",
    "wbUseSquares",
    "wbUnderEmoji",
    "wbBoldShifts",
    "wbRedShifts",
    "wbItalicMotions",
    "wbRedMotions",
    "wbRemoveVowels",
    "wbShowLineCall",
    "wbHighlightHuddle",
    "wbHighlightCandy",
  ];
  // ...
}

function clearAllWbOptions() {
  const ids = [
    "wbShowEmoji",
    "wbUseSquares",
    "wbUnderEmoji",
    "wbBoldShifts",
    "wbRedShifts",
    "wbItalicMotions",
    "wbRedMotions",
    "wbRemoveVowels",
    "wbShowLineCall",
    "wbHighlightHuddle",
    "wbHighlightCandy",
  ];
  // ...
}
```

The script module already solved this correctly — `SCRIPT_DISPLAY_CHECKBOX_IDS` is a const (script.js:72) that drives `selectAllScriptOptions()`, `clearAllScriptOptions()`, `saveScriptDisplayOptions()`, and `restoreScriptDisplayOptions()`.

### Concrete Fix

Add a constant at the top of `wristband.js`:

```js
const WB_DISPLAY_CHECKBOX_IDS = [
  "wbShowEmoji",
  "wbUseSquares",
  "wbUnderEmoji",
  "wbBoldShifts",
  "wbRedShifts",
  "wbItalicMotions",
  "wbRedMotions",
  "wbRemoveVowels",
  "wbShowLineCall",
  "wbHighlightHuddle",
  "wbHighlightCandy",
];
```

Then use it in `selectAllWbOptions()`, `clearAllWbOptions()`, and potentially drive `getWristbandDisplayOptions()` as well.

---

## Finding 6 — Naming Inconsistency: `.name` vs `.title`

**Impact:** 🟠 MEDIUM — inconsistency makes generic CRUD harder and risks bugs  
**Files:** `js/script.js`, `js/wristband.js`, `js/callsheet.js`  
**Category:** Naming inconsistency

### The Problem

Saved items use different property names for the user-facing label:

- **Scripts** use `.name` — `target.name`, `s.name`, `scriptData.name`
- **Wristbands** use `.title` — `target.title`, `wb.title`, `s.title`
- **Call sheet templates** use `.name` — `template.name`

This means:

1. Generic CRUD code (Finding 1) must parameterize the field name
2. Any shared UI code for saved-item cards must know which field to display
3. It's easy to accidentally reference `.name` on a wristband object (returns `undefined`)

### Concrete Fix

Standardize on `.name` for all saved entities. In `wristband.js`, do a find-and-replace of the property `.title` → `.name` on wristband save objects. This requires a one-time migration for existing localStorage data:

```js
// In initWristband(), migrate old data:
const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
let migrated = false;
saved.forEach((wb) => {
  if (wb.title && !wb.name) {
    wb.name = wb.title;
    delete wb.title;
    migrated = true;
  }
});
if (migrated) storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
```

---

## Finding 7 — Naming Inconsistency: `noVowels` vs `removeVowels`

**Impact:** 🟡 LOW — confusing but not broken  
**Files:** `js/utils.js`, `js/script.js`, `js/wristband.js`, `js/callsheet.js`  
**Category:** Naming inconsistency

### The Problem

The display option for vowel removal uses two different names depending on the module:

| Module                             | Property Name          |
| ---------------------------------- | ---------------------- |
| `getFullCall()` in utils.js        | `noVowels`             |
| `getScriptDisplayOptions()`        | `noVowels`             |
| `getWristbandDisplayOptions()`     | `noVowels`             |
| `getCallSheetDisplayOptions()`     | `removeVowels`         |
| Callsheet render code (line 2814+) | `options.removeVowels` |

The callsheet display options object uses `removeVowels`, but `getFullCall()` expects `noVowels`. This means **callsheet plays passed through `getFullCall()` silently ignore the vowel-removal setting** unless the callsheet render code manually handles it (which it does — it calls `removeVowels()` directly rather than relying on `getFullCall()`).

### Concrete Fix

Rename the callsheet property from `removeVowels` to `noVowels` to match `getFullCall()`'s expected option name:

In `callsheet.js` line 1121, change:

```js
removeVowels: document.getElementById("callsheetRemoveVowels")?.checked ?? false,
```

to:

```js
noVowels: document.getElementById("callsheetRemoveVowels")?.checked ?? false,
```

And update the ~12 references to `options.removeVowels` in the callsheet render code.

---

## Finding 8 — Hardcoded Colors in Context Menu and Categories

**Impact:** 🟡 LOW — works fine, but goes against the CSS variable cleanup already done  
**File:** `js/callsheet.js` — lines 1310–1350  
**Category:** Constants / Magic values

### The Problem

The `showPlayContextMenu()` function defines color arrays inline:

```js
const borderColors = [
  { name: "None", value: "", swatch: "⬜" },
  { name: "Red", value: "#dc3545", swatch: "🔴" },
  { name: "Blue", value: "#007bff", swatch: "🔵" },
  { name: "Green", value: "#28a745", swatch: "🟢" },
  // ...
];

const bgColors = [
  { name: "None", value: "", css: "#f8f8f8" },
  { name: "Yellow", value: "#fff9c4", css: "#fff9c4" },
  // ...
];
```

Similarly, `index.html` has hardcoded hex colors for the wristband header color buttons (lines 1192–1224).

### Concrete Fix

Extract shared color constants to `utils.js`:

```js
const THEME_COLORS = {
  red: "#dc3545",
  blue: "#007bff",
  green: "#28a745",
  yellow: "#ffc107",
  orange: "#fd7e14",
  purple: "#6f42c1",
};

const BG_HIGHLIGHT_COLORS = {
  yellow: "#fff9c4",
  green: "#c8e6c9",
  blue: "#bbdefb",
  pink: "#f8bbd0",
  orange: "#ffe0b2",
  lavender: "#e1bee7",
  gray: "#e0e0e0",
};
```

This reduces string duplication and ensures color consistency across modules.

---

## Finding 9 — Context Menu Positioning/Dismissal Boilerplate

**Impact:** 🟡 LOW — ~20 duplicated lines per menu  
**File:** `js/callsheet.js` — `showPlayContextMenu()` L1295 and `openCategoryMenu()` L3061  
**Category:** Context menu duplication

### The Problem

Both context menus share identical setup boilerplate:

```js
// Both do this:
document.querySelector(".cs-context-menu")?.remove();
const menu = document.createElement("div");
menu.className = "cs-context-menu";
menu.style.position = "fixed";
menu.style.left = `${event.clientX}px`;
menu.style.top = `${event.clientY}px`;
menu.style.visibility = "hidden";
// ... build content ...
document.body.appendChild(menu);
requestAnimationFrame(() => {
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = ...;
  if (rect.bottom > window.innerHeight) menu.style.top = ...;
  menu.style.visibility = "visible";
});
const closeHandler = (e) => {
  if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", closeHandler); }
};
setTimeout(() => document.addEventListener("click", closeHandler), 0);
```

### Concrete Fix

Extract a helper:

```js
function createContextMenu(event, extraClass = "") {
  document.querySelector(".cs-context-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "cs-context-menu" + (extraClass ? " " + extraClass : "");
  menu.style.position = "fixed";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.style.visibility = "hidden";
  return {
    menu,
    show() {
      document.body.appendChild(menu);
      requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth)
          menu.style.left = `${window.innerWidth - rect.width - 8}px`;
        if (rect.bottom > window.innerHeight)
          menu.style.top = `${window.innerHeight - rect.height - 8}px`;
        menu.style.visibility = "visible";
      });
      const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
    },
  };
}
```

Both callers simply do `const { menu, show } = createContextMenu(event);`, set `menu.innerHTML`, then call `show()`.

---

## Finding 10 — `showToast()` Defined in playbook.js

**Impact:** 🟡 LOW — works due to globals, but poor placement  
**File:** `js/playbook.js` — line 382  
**Category:** Code organization

### The Problem

`showToast()` is called from **every module** (script.js, wristband.js, callsheet.js, app.js, etc.) but is defined in `playbook.js`. This works only because all files share the global scope. If any file were ever loaded as a module, or if `playbook.js` failed to load, every toast call would throw.

### Concrete Fix

Move `showToast()` to `utils.js` where all other shared utilities live (`showModal`, `showConfirm`, `showPrompt`, `escapeHtml`, etc.). No call sites need to change — it's already global.

---

## Finding 11 — Console Statements ✅

**Impact:** ✅ NONE — no action needed  
**File:** `js/utils.js`  
**Category:** Console.log cleanup

Only 4 `console.warn`/`console.error` statements exist, all in error-handling paths:

| Location             | Statement       | Purpose               |
| -------------------- | --------------- | --------------------- |
| `safeJSONParse`      | `console.warn`  | JSON parse failure    |
| `safeDeepClone`      | `console.error` | Clone failure         |
| `storageManager.get` | `console.warn`  | Storage read failure  |
| `storageManager.set` | `console.error` | Storage write failure |

All are appropriate production-level error logging. No stray `console.log` debugging statements found.

---

## Findings Not Warranting a Fix

### Event Listener Patterns

The codebase already follows good practices:

- Named handler functions for `removeEventListener` (e.g., `_playbookDocKeydown`)
- Guard flags to prevent duplicate listeners (`container._kbInit`)
- `remove-before-add` pattern for document-level listeners
- All modal event listeners are properly scoped to their overlay element lifecycle

### Error Handling

The `storageManager` in `utils.js` already wraps all localStorage operations in try/catch. The `QuotaExceededError` handling was already implemented. Individual module functions that call `storageManager` don't need additional try/catch since the centralized handler covers it.

### Dead Code

Previous cleanup already removed dead functions. No unreachable code paths or unused function definitions were found. Comments like `// Removed: placePlayInCell - dead code (never called)` confirm prior cleanup.

---

## Recommended Priority Order

1. **Finding 2** — Merge `captureWbDisplaySettings` → fastest win, 5-minute fix
2. **Finding 4** — Delete duplicate toggle function → 2-minute fix
3. **Finding 10** — Move `showToast` to utils.js → 5-minute fix
4. **Finding 5** — Extract `WB_DISPLAY_CHECKBOX_IDS` constant → 10-minute fix
5. **Finding 3** — Extract `initAllModules()` → 10-minute fix
6. **Finding 7** — Standardize `noVowels` naming → 15-minute fix
7. **Finding 1** — CRUD factory (biggest payoff but most complex) → 30-minute fix
8. **Finding 6** — Standardize `.name`/`.title` (requires data migration) → 20-minute fix
9. **Finding 9** — Context menu helper → 15-minute fix
10. **Finding 8** — Color constants → 15-minute fix
