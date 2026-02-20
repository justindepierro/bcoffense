# Dead Code & Code Quality Audit Report

**Project:** Practice Script & Playbook  
**Date:** Analysis of ~21,800 lines across 9 JS files + index.html

---

## 1. Duplicate Function Definitions

Functions with the same name defined in multiple files — the last-loaded file wins at runtime.

| Function             | File 1        | File 2            | Explanation                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `toggleBulkSelect()` | script.js:407 | tendencies.js:896 | Both define `toggleBulkSelect(index)` at global scope. Since tendencies.js loads after script.js (per index.html script order), the tendencies version overwrites the script version. **This is a bug** — each should have a unique name (e.g. `toggleScriptBulkSelect` / `toggleTdBulkSelect`). Currently works only because each is called from template HTML rendered by its own module, but any cross-call would invoke the wrong one. |

---

## 2. Dead Functions (Defined But Never Called)

Functions with zero references anywhere outside their definition line.

| Function                 | File            | Line | Explanation                                                                                                                                                                |
| ------------------------ | --------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preferredIncludes()`    | callsheet.js    | 561  | Helper for `findMatchingCategories()` logic, but it is never called — the matching is done inline instead.                                                                 |
| `addCallSheetPlay()`     | callsheet.js    | 1884 | Takes a play index from the global `plays` array. Replaced by `addCallSheetPlayFromPicker()` which takes full play data. Dead code remnant.                                |
| `loadCallSheet()`        | callsheet.js    | 2115 | Loads call sheet from localStorage and re-renders. Never called — `initCallSheet()` handles loading on startup.                                                            |
| `isComponentInstalled()` | installation.js | 80   | Checks if a specific component is installed. Never called anywhere — installation checks are done differently via `getInstallationData()`.                                 |
| `escapeAttrSafe()`       | utils.js        | 438  | Escapes strings for HTML attributes. Never called — `escapeAttr()` in installation.js and `escapeHtml()` in utils.js are used instead.                                     |
| `printDocument()`        | utils.js        | 2151 | Generic print utility. Never called — each module (script, callsheet, wristband, tendencies, installation) has its own `print*()` function that handles printing directly. |
| `placePlayInCell()`      | wristband.js    | 1058 | Places a play by index into a wristband cell. Never called — `selectPlayForCell()` in the cell popup handles play placement instead.                                       |
| `removeCellPlay()`       | wristband.js    | 1072 | Removes a play from a wristband cell. Never called — `removeCellPlayFromPopup()` is the function actually triggered by the UI.                                             |

---

## 3. Unused File-Scope Variables

No completely unused file-scope variables were found. All `let`/`const`/`var` declarations at the top level are referenced elsewhere in the codebase.

---

## 4. Copy-Paste Patterns (Near-Duplicate Code Blocks)

### 4a. Display Options — 3 nearly identical implementations

Each module has its own get/save/restore display options pattern reading the same checkbox structure:

| Function                           | File         | Line | Size     |
| ---------------------------------- | ------------ | ---- | -------- |
| `getScriptDisplayOptions()`        | script.js    | 108  | 19 lines |
| `getWristbandDisplayOptions()`     | wristband.js | 1084 | 12 lines |
| `getCallSheetDisplayOptions()`     | callsheet.js | 1098 | 49 lines |
| `saveScriptDisplayOptions()`       | script.js    | 83   | 7 lines  |
| `saveCallSheetDisplayOptions()`    | callsheet.js | 2729 | 9 lines  |
| `restoreScriptDisplayOptions()`    | script.js    | 95   | 7 lines  |
| `restoreCallSheetDisplayOptions()` | callsheet.js | 2743 | 12 lines |

**Recommendation:** Extract a generic `getDisplayOptions(idList)` / `saveDisplayOptions(key, idList)` / `restoreDisplayOptions(key, idList)` into utils.js.

### 4b. Autosave Draft Pattern — 4 nearly identical implementations

Each module has `schedule*Autosave()` and `check*Draft()` with identical structure (save to localStorage after timeout, offer restore on load):

| Function                       | File          | Line | Size     |
| ------------------------------ | ------------- | ---- | -------- |
| `scheduleScriptAutosave()`     | script.js     | 133  | 11 lines |
| `scheduleWristbandAutosave()`  | wristband.js  | 46   | 16 lines |
| `scheduleCallSheetAutosave()`  | callsheet.js  | 2760 | 10 lines |
| `scheduleTendenciesAutosave()` | tendencies.js | 536  | 14 lines |
| `checkScriptDraft()`           | script.js     | 149  | 37 lines |
| `checkWristbandDraft()`        | wristband.js  | 67   | 49 lines |
| `checkCallSheetDraft()`        | callsheet.js  | 2775 | 41 lines |
| `checkTendenciesDraft()`       | tendencies.js | 552  | 37 lines |

**Recommendation:** Create a generic `DraftManager` class or `createDraftManager(storageKey, getData, setData)` factory in utils.js.

### 4c. Save/Load/Delete/Rename/Overwrite CRUD — 2 nearly identical implementations

script.js and wristband.js both have a complete CRUD set for saved items that follows the same prompt → save → list → delete → rename → overwrite pattern:

| Operation | script.js                                     | wristband.js                                     |
| --------- | --------------------------------------------- | ------------------------------------------------ |
| Save      | `saveScript()` line 2783 — 59 lines           | `saveWristband()` line 1755 — 60 lines           |
| List      | `loadSavedScriptsList()` line 2847 — 58 lines | `loadSavedWristbandsList()` line 1820 — 51 lines |
| Delete    | `deleteSavedScript()` line 2943 — 15 lines    | `deleteSavedWristband()` line 1937 — 24 lines    |
| Rename    | `renameSavedScript()` line 2964 — 14 lines    | `renameSavedWristband()` line 1967 — 16 lines    |
| Overwrite | `overwriteSavedScript()` line 2984 — 19 lines | `overwriteSavedWristband()` line 1989 — 22 lines |

**Total duplicated:** ~330 lines across both files.  
**Recommendation:** Extract a generic `SavedItemsManager` that takes a storage key and render callback.

### 4d. Escape Attribute Functions — 2 near-identical implementations

| Function           | File            | Line | Size    |
| ------------------ | --------------- | ---- | ------- |
| `escapeAttr()`     | installation.js | 432  | 8 lines |
| `escapeAttrSafe()` | utils.js        | 438  | 8 lines |

Both do the same thing: replace `&`, `<`, `>`, `"`, `'` with HTML entities. `escapeAttrSafe()` is never called (dead), and `escapeAttr()` in installation.js duplicates the logic that should live in utils.js.

### 4e. Thin Wrapper Functions

| Wrapper          | File   | Line | Delegates To                         | Explanation                        |
| ---------------- | ------ | ---- | ------------------------------------ | ---------------------------------- |
| `exportBackup()` | app.js | 335  | `exportCompleteBackup()` in utils.js | Single-line wrapper, adds no value |
| `importBackup()` | app.js | 343  | `importCompleteBackup()` in utils.js | Single-line wrapper, adds no value |

**Recommendation:** Call the utils.js functions directly from HTML onclick handlers.

---

## 5. HTML Element IDs Never Referenced in Any JS File

IDs that exist in index.html but have zero references in any `.js` file. Some may be referenced only in HTML `onclick` attributes or used purely for CSS styling.

### Truly Unreferenced (not in JS or HTML onclick)

| ID                   | Line            | Explanation                                                              |
| -------------------- | --------------- | ------------------------------------------------------------------------ |
| `tab-playbook`       | index.html:105  | Tab buttons are accessed by `.tab` class + positional index, never by ID |
| `tab-script`         | index.html:115  | Same as above                                                            |
| `tab-wristband`      | index.html:125  | Same as above                                                            |
| `tab-tendencies`     | index.html:135  | Same as above                                                            |
| `tab-callsheet`      | index.html:145  | Same as above                                                            |
| `tab-installation`   | index.html:155  | Same as above                                                            |
| `tab-dashboard`      | index.html:165  | Same as above                                                            |
| `statRatioContainer` | index.html:645  | Wrapper div, never targeted — only inner `statRatio` is used             |
| `scriptUndoBtn`      | index.html:715  | Undo button — not programmatically enabled/disabled from JS              |
| `scriptRedoBtn`      | index.html:724  | Redo button — same as above                                              |
| `wbStatFormat`       | index.html:1181 | Wristband format stat display — never updated by JS                      |
| `wristbandUndoBtn`   | index.html:1230 | Same pattern as script undo btn                                          |
| `wristbandRedoBtn`   | index.html:1239 | Same pattern as script redo btn                                          |
| `dashNotesSection`   | index.html:1510 | Container div, never targeted by JS                                      |
| `cellPopupApplyBtn`  | index.html:2377 | Apply button uses onclick inline, ID never used in JS                    |

### Referenced Only in HTML Inline Handlers (functional, not a problem)

| ID                 | Line           | Explanation                                                                             |
| ------------------ | -------------- | --------------------------------------------------------------------------------------- |
| `backupFile`       | index.html:72  | File input triggered by `document.getElementById('backupFile').click()` in HTML onclick |
| `importBackupFile` | index.html:313 | Same pattern — triggered from HTML inline onclick                                       |

### Referenced Dynamically via String Concatenation (false positives — working correctly)

| ID                       | Line            | Explanation                                                           |
| ------------------------ | --------------- | --------------------------------------------------------------------- |
| `ssWeightHashFlowVal`    | index.html:2424 | Accessed via `getElementById("ssWeight" + name + "Val")` in script.js |
| `ssWeightDownProgVal`    | index.html:2465 | Same dynamic pattern                                                  |
| `ssWeightTypeVarietyVal` | index.html:2487 | Same dynamic pattern                                                  |
| `ssWeightPersonnelVal`   | index.html:2509 | Same dynamic pattern                                                  |
| `ssWeightTempoVal`       | index.html:2531 | Same dynamic pattern                                                  |
| `ssWeightFormationVal`   | index.html:2553 | Same dynamic pattern                                                  |
| `ssWeightRunPassBalVal`  | index.html:2611 | Same dynamic pattern                                                  |
| `ssWeightConstraintVal`  | index.html:2634 | Same dynamic pattern                                                  |

---

## Summary

| Category                           | Count          | Estimated Impact                 |
| ---------------------------------- | -------------- | -------------------------------- |
| Duplicate function definitions     | 1 (active bug) | Rename needed to avoid collision |
| Dead functions                     | 8              | ~80 lines removable              |
| Unused file-scope variables        | 0              | —                                |
| Copy-paste pattern groups          | 5 groups       | ~600+ lines consolidatable       |
| Truly unreferenced HTML IDs        | 15             | Cleanup or add JS refs           |
| Dynamic HTML IDs (false positives) | 8              | Working correctly                |
| HTML-only referenced IDs           | 2              | Working correctly                |
