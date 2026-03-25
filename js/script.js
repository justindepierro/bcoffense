// Practice Script Builder functionality

// Drag and drop state
let draggedElement = null;

// Cached scouting options — invalidated when opponent or tendencies data changes
let _cachedScoutOpts = null;
let _cachedScoutOppName = null;

/** Call this to force scouting options to recompute on next render */
function invalidateScoutCache() {
  _cachedScoutOpts = null;
  _cachedScoutOppName = null;
}

// Script checkbox filter state
let scriptSelectedTypes = [];
let scriptSelectedSituation = [];
let scriptSelectedDown = [];
let scriptSelectedDistance = [];
let scriptSelectedHash = [];
let scriptSelectedFieldPos = [];
let scriptSelectedPersonnel = [];

// Collapsed periods tracking (by separator id)
let collapsedPeriods = new Set();

// Period templates
let periodTemplates = [];
periodTemplates = storageManager.get(STORAGE_KEYS.PERIOD_TEMPLATES, []);

// Bulk edit state - tracks selected script item indices
let bulkSelectedIndices = [];

// Selected available plays for batch adding
let selectedAvailablePlays = [];

// Pagination for the available plays list
const AVAIL_PER_PAGE = 50;
let scriptAvailPage = 0;

// Custom sort orders for script sorting
let scriptCustomSortOrders = {};
scriptCustomSortOrders = storageManager.get(
  STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
  {},
);

// Sort field options for script
const SCRIPT_SORT_FIELDS = [
  { value: "personnel", label: "Personnel" },
  { value: "preferredSituation", label: "Situation" },
  { value: "type", label: "Play Type" },
  { value: "formation", label: "Formation" },
  { value: "preferredDown", label: "Down" },
  { value: "preferredDistance", label: "Distance" },
  { value: "preferredHash", label: "Hash" },
  { value: "preferredFieldPosition", label: "Field Position" },
];

// UI state
let filtersCollapsed = false;

// Autosave timer
let scriptAutosaveTimer = null;

// Script display options checkbox IDs
const SCRIPT_DISPLAY_CHECKBOX_IDS = [
  "scriptShowEmoji",
  "scriptUseSquares",
  "scriptUnderEmoji",
  "scriptBoldShifts",
  "scriptRedShifts",
  "scriptItalicMotions",
  "scriptRedMotions",
  "scriptShowLineCall",
  "scriptHighlightHuddle",
  "scriptHighlightCandy",
  "scriptShowWbNum",
  "scriptShowPrintPreview",
];

/**
 * Save script display option checkbox states to localStorage
 */
function saveScriptDisplayOptions() {
  const opts = {};
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) opts[id] = el.checked;
  });
  storageManager.set(STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS, opts);
}

/**
 * Restore script display option checkbox states from localStorage
 */
function restoreScriptDisplayOptions() {
  const opts = storageManager.get(STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS, null);
  if (!opts) return;
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && opts[id] !== undefined) el.checked = opts[id];
  });
}

/**
 * Get current script display option values from checkboxes
 * Used by generatePDF and printFullDay to avoid duplicating option reads
 */
function getScriptDisplayOptions() {
  return {
    showEmoji: document.getElementById("scriptShowEmoji")?.checked || false,
    useSquares: document.getElementById("scriptUseSquares")?.checked || false,
    underEmoji: document.getElementById("scriptUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("scriptBoldShifts")?.checked || false,
    redShifts: document.getElementById("scriptRedShifts")?.checked || false,
    italicMotions:
      document.getElementById("scriptItalicMotions")?.checked || false,
    redMotions: document.getElementById("scriptRedMotions")?.checked || false,
    noVowels: document.getElementById("scriptRemoveVowels")?.checked || false,
    showLineCall:
      document.getElementById("scriptShowLineCall")?.checked !== false,
    highlightHuddle:
      document.getElementById("scriptHighlightHuddle")?.checked || false,
    highlightCandy:
      document.getElementById("scriptHighlightCandy")?.checked || false,
    showWbNum: document.getElementById("scriptShowWbNum")?.checked !== false,
  };
}

/**
 * Debounced autosave for the working script
 * Saves a draft to localStorage so work isn't lost on accidental close
 */
function scheduleScriptAutosave() {
  if (scriptAutosaveTimer) clearTimeout(scriptAutosaveTimer);
  if (typeof updateSaveStatus === "function") updateSaveStatus("saving");
  scriptAutosaveTimer = setTimeout(() => {
    const draft = {
      name: document.getElementById("scriptName")?.value || "",
      date: document.getElementById("scriptDate")?.value || "",
      plays: script,
      savedAt: new Date().toISOString(),
    };
    storageManager.set(STORAGE_KEYS.SCRIPT_DRAFT, draft);
    if (typeof updateSaveStatus === "function") updateSaveStatus("saved");
  }, AUTOSAVE_DEBOUNCE_MS); // 3-second debounce
}

/**
 * Check for and offer to restore a script draft
 */
async function checkScriptDraft() {
  try {
    const draft = storageManager.get(STORAGE_KEYS.SCRIPT_DRAFT, null);
    if (!draft || !draft.plays || draft.plays.length === 0) return;

    // Discard drafts older than 24 hours
    const age =
      Date.now() - (draft.savedAt ? new Date(draft.savedAt).getTime() : 0);
    if (age > DRAFT_EXPIRY_MS) {
      storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
      return;
    }
    const currentPlays = script.filter((p) => !p.isSeparator).length;
    if (currentPlays > 0) return;

    const draftPlays = draft.plays.filter((p) => !p.isSeparator).length;
    const savedTime = draft.savedAt
      ? new Date(draft.savedAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "unknown time";

    const doRestore = await showConfirm(
      `Found unsaved script draft!\n\n"${draft.name || "Untitled"}" — ${draftPlays} plays\nLast edited: ${savedTime}\n\nRestore it?`,
      {
        title: "📋 Draft Found",
        icon: "📋",
        confirmText: "Restore",
        cancelText: "Discard",
      },
    );
    if (doRestore) {
      if (draft.name) document.getElementById("scriptName").value = draft.name;
      if (draft.date) document.getElementById("scriptDate").value = draft.date;
      script = draft.plays;
      renderScript();
      markScriptDirty();
      showToast("📋 Draft restored");
    } else {
      storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
    }
  } catch (err) {
    console.error("checkScriptDraft error:", err);
    showToast("❌ Error restoring script draft.", 3000);
  }
}

/**
 * Toggle filters panel collapse
 */
function toggleFiltersCollapse() {
  const container = document.getElementById("scriptFiltersContainer");
  const btn = document.getElementById("toggleFiltersBtn");
  filtersCollapsed = !filtersCollapsed;

  if (filtersCollapsed) {
    container.classList.add("collapsed");
    btn.innerHTML = "🔽 Filters";
  } else {
    container.classList.remove("collapsed");
    btn.innerHTML = "🔼 Filters";
  }
}

/**
 * Toggle individual filter section
 */
function toggleFilterSection(titleEl) {
  const section = titleEl.parentElement;
  section.classList.toggle("expanded");

  // Update arrow
  if (section.classList.contains("expanded")) {
    titleEl.textContent = titleEl.textContent.replace("▶", "▼");
  } else {
    titleEl.textContent = titleEl.textContent.replace("▼", "▶");
  }
}

/**
 * Clear all script filters
 */
function clearAllScriptFilters() {
  scriptSelectedTypes = [];
  scriptSelectedSituation = [];
  scriptSelectedDown = [];
  scriptSelectedDistance = [];
  scriptSelectedHash = [];
  scriptSelectedFieldPos = [];
  scriptSelectedPersonnel = [];

  // Reset formation and base play dropdowns
  document.getElementById("scriptFilterFormation").value = "";
  document.getElementById("scriptFilterBasePlay").value = "";
  document.getElementById("scriptSearchPlay").value = "";

  // Uncheck all checkboxes
  document
    .querySelectorAll("#scriptFiltersContainer input[type='checkbox']")
    .forEach((cb) => {
      cb.checked = false;
      cb.parentElement.classList.remove("checked");
    });

  updateActiveFilterCount();
  filterScriptPlays();
}

/**
 * Update active filter count badge
 */
function updateActiveFilterCount() {
  const count =
    scriptSelectedTypes.length +
    scriptSelectedSituation.length +
    scriptSelectedDown.length +
    scriptSelectedDistance.length +
    scriptSelectedHash.length +
    scriptSelectedFieldPos.length +
    scriptSelectedPersonnel.length;

  const badge = document.getElementById("activeFilterCount");
  if (badge) {
    if (count > 0) {
      badge.classList.remove("hidden");
      badge.textContent = `${count} active`;
    } else {
      badge.classList.add("hidden");
    }
  }

  // Also update the toggle button label with active count
  const toggleBtn = document.getElementById("toggleFiltersBtn");
  if (toggleBtn) {
    toggleBtn.textContent = count > 0 ? `⚙️ Filters (${count})` : "⚙️ Filters";
    toggleBtn.classList.toggle("has-active-filters", count > 0);
  }
}

/* toggleCollapsiblePanel() moved to utils.js */

/**
 * Highlight plays not on the selected wristband
 */
function highlightPlaysNotOnWristband() {
  const wbSelect = document.getElementById("scriptWristbandSelect");
  if (!wbSelect || !wbSelect.value) {
    showToast("⚠️ Please select a wristband first");
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wbId = parseInt(wbSelect.value, 10);
  if (isNaN(wbId)) return;
  const wb = saved.find((w) => w.id === wbId);
  if (!wb) return;

  // Get all plays on wristband
  const wbPlays = new Set();
  if (wb.cards) {
    wb.cards.forEach((card) => {
      card.data.forEach((play) => {
        if (play && play.play) {
          wbPlays.add(`${play.formation}|${play.play}`);
        }
      });
    });
  }

  // Count plays not on wristband
  let notOnWb = 0;
  script.forEach((item, idx) => {
    if (!item.isSeparator) {
      const key = `${item.formation}|${item.play}`;
      if (!wbPlays.has(key)) {
        notOnWb++;
      }
    }
  });

  if (notOnWb === 0) {
    showToast("✅ All plays in the script are on the wristband!");
  } else {
    showToast(`⚠️ ${notOnWb} play(s) are NOT on the wristband`);
  }
}

/**
 * Calculate and update run/pass ratio
 */
function updateRunPassRatio() {
  const runEl = document.getElementById("statRun");
  const passEl = document.getElementById("statPass");
  const ratioEl = document.getElementById("statRatio");

  if (!ratioEl) return;

  const run = parseInt(runEl?.textContent, 10) || 0;
  const pass = parseInt(passEl?.textContent, 10) || 0;

  if (run === 0 && pass === 0) {
    ratioEl.textContent = "-";
    ratioEl.title = "";
  } else if (pass === 0) {
    ratioEl.textContent = "∞";
    ratioEl.title = `${run} Run, 0 Pass`;
  } else {
    const ratio = (run / pass).toFixed(1);
    ratioEl.textContent = ratio;
    ratioEl.title = `${run} Run, ${pass} Pass (R:P = ${ratio})`;
  }
}

/**
 * Save script state before making changes (for undo)
 */
function saveScriptState() {
  historyManager.saveState("script", script);
  markScriptDirty();
  scheduleScriptAutosave();
}

/**
 * Debounced version — used for inline field edits (notes, hash, defense)
 * so every keystroke doesn't flood the undo stack.
 */
const debouncedSaveScriptState = debounce(saveScriptState, 400);

/**
 * Undo last script action
 */
function undoScript() {
  const previousState = historyManager.undo("script", script);
  if (previousState) {
    script = previousState;
    renderScript();
  }
}

/**
 * Redo last undone script action
 */
function redoScript() {
  const futureState = historyManager.redo("script", script);
  if (futureState) {
    script = futureState;
    renderScript();
  }
}

/**
 * Toggle selection of a script item for bulk editing
 */
function toggleBulkSelect(index) {
  const idx = bulkSelectedIndices.indexOf(index);
  if (idx > -1) {
    bulkSelectedIndices.splice(idx, 1);
  } else {
    bulkSelectedIndices.push(index);
  }
  updateBulkSelectUI();
}

/**
 * Select all script items for bulk editing
 */
function selectAllScriptItems() {
  const selectAll = document.getElementById("bulkSelectAll");
  if (selectAll && selectAll.checked) {
    bulkSelectedIndices = script
      .map((p, i) => (p.isSeparator ? -1 : i))
      .filter((i) => i >= 0);
  } else {
    bulkSelectedIndices = [];
  }
  updateBulkSelectUI();
}

/**
 * Select or deselect all plays within a specific period
 */
function selectPeriodPlays(separatorIndex) {
  // Get the script indices for plays in this period
  const periodPlayIndices = [];
  for (let i = separatorIndex + 1; i < script.length; i++) {
    if (script[i].isSeparator) break;
    periodPlayIndices.push(i);
  }
  if (periodPlayIndices.length === 0) return;

  // Check if all plays in this period are already selected
  const allSelected = periodPlayIndices.every((idx) =>
    bulkSelectedIndices.includes(idx),
  );

  if (allSelected) {
    // Deselect all plays in this period
    bulkSelectedIndices = bulkSelectedIndices.filter(
      (idx) => !periodPlayIndices.includes(idx),
    );
  } else {
    // Select all plays in this period (add any not already selected)
    periodPlayIndices.forEach((idx) => {
      if (!bulkSelectedIndices.includes(idx)) {
        bulkSelectedIndices.push(idx);
      }
    });
  }

  updateBulkSelectUI();
}

/**
 * Update bulk select checkboxes UI
 */
function updateBulkSelectUI() {
  // Update individual checkboxes
  document.querySelectorAll(".bulk-select-cb").forEach((cb) => {
    cb.checked = bulkSelectedIndices.includes(parseInt(cb.dataset.index, 10));
  });

  // Update select all checkbox
  const selectAll = document.getElementById("bulkSelectAll");
  const playCount = script.filter((p) => !p.isSeparator).length;
  if (selectAll) {
    selectAll.checked =
      bulkSelectedIndices.length === playCount && playCount > 0;
    selectAll.indeterminate =
      bulkSelectedIndices.length > 0 && bulkSelectedIndices.length < playCount;
  }

  // Show/hide bulk edit indicator
  const count = bulkSelectedIndices.length;
  const indicator = document.getElementById("bulkEditIndicator");
  if (indicator) {
    if (count > 1) {
      indicator.classList.add("active");
      indicator.textContent = `${count} selected`;
    } else {
      indicator.classList.remove("active");
    }
  }
}

/**
 * Apply bulk edit to all selected items
 */
function applyBulkEdit(field, value) {
  if (bulkSelectedIndices.length <= 1) return false;

  saveScriptState();
  bulkSelectedIndices.forEach((idx) => {
    if (script[idx] && !script[idx].isSeparator) {
      script[idx][field] = value;
    }
  });

  // Clear selection after bulk edit
  clearBulkSelection();
  return true;
}

/**
 * Clear all bulk selections
 */
function clearBulkSelection() {
  bulkSelectedIndices = [];
  const selectAll = document.getElementById("bulkSelectAll");
  if (selectAll) selectAll.checked = false;
  updateBulkSelectUI();
  renderScript();
}

/**
 * Select all print options for script
 */
function selectAllScriptOptions() {
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });
}

/**
 * Clear all print options for script
 */
function clearAllScriptOptions() {
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
}

/**
 * Populate the script checkbox filters
 */
function populateScriptCheckboxFilters() {
  // Use cached unique values from playbook (avoids re-iterating full array)
  const cache = getFilterCache();

  const types = cache.types;
  const situations = cache.situations;
  const downs = cache.downs;
  const distances = cache.distances;
  const hashes = cache.hashes;
  const fieldPositions = cache.fieldPositions;
  const personnels = cache.personnels;

  // Populate checkbox filters using shared utility
  buildCheckboxFilterGroup(
    "scriptTypeFilters",
    types,
    "type",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptSituationFilters",
    situations,
    "situation",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptDownFilters",
    downs,
    "down",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptDistanceFilters",
    distances,
    "distance",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptHashFilters",
    hashes,
    "hash",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptFieldPosFilters",
    fieldPositions,
    "fieldPos",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptPersonnelFilters",
    personnels,
    "personnel",
    "toggleScriptCheckbox",
  );
}

/**
 * Toggle a script checkbox filter
 * @param {HTMLElement} label - Label element
 * @param {string} filterType - 'type', 'situation', 'down', 'distance', 'hash', or 'fieldPos'
 * @param {string} value - Filter value
 */
function toggleScriptCheckbox(el) {
  const label = el.closest("[data-action='toggleScriptCheckbox']") || el;
  const filterType = label.dataset.filterType;
  const value = label.dataset.filterValue;
  const checkbox = label.querySelector('input[type="checkbox"]');
  checkbox.checked = !checkbox.checked;
  label.classList.toggle("checked", checkbox.checked);

  const filterMap = {
    type: scriptSelectedTypes,
    situation: scriptSelectedSituation,
    down: scriptSelectedDown,
    distance: scriptSelectedDistance,
    hash: scriptSelectedHash,
    fieldPos: scriptSelectedFieldPos,
    personnel: scriptSelectedPersonnel,
  };

  const arr = filterMap[filterType];
  if (arr) {
    if (checkbox.checked) {
      arr.push(value);
    } else {
      const idx = arr.indexOf(value);
      if (idx > -1) arr.splice(idx, 1);
    }
  }

  updateActiveFilterCount();
  filterScriptPlays();
}

/**
 * Filter plays for the script builder available plays list
 */
function filterScriptPlays() {
  scriptAvailPage = 0; // reset to page 1 on every filter change
  const clearBtn = document.getElementById("clearSearchPlay");
  if (clearBtn) {
    const val = document.getElementById("scriptSearchPlay")?.value || "";
    clearBtn.style.display = val ? "flex" : "none";
  }
  renderAvailablePlays();
}

/**
 * Clear the available plays search input
 */
function clearSearchPlay() {
  const input = document.getElementById("scriptSearchPlay");
  if (input) input.value = "";
  const clearBtn = document.getElementById("clearSearchPlay");
  if (clearBtn) clearBtn.style.display = "none";
  filterScriptPlays();
}

function availPagePrev() {
  if (scriptAvailPage > 0) {
    scriptAvailPage--;
    renderAvailablePlays();
  }
}

function availPageNext() {
  scriptAvailPage++;
  renderAvailablePlays();
}

/**
 * Render available plays in the script builder sidebar
 */
function renderAvailablePlays() {
  const formation = document.getElementById("scriptFilterFormation").value;
  const basePlay = document.getElementById("scriptFilterBasePlay").value;
  const search = document
    .getElementById("scriptSearchPlay")
    .value.toLowerCase();

  // Helper for case-insensitive filter matching
  const matchesFilter = (value, selectedArr) => {
    if (selectedArr.length === 0) return true;
    if (!value) return false;
    const normalized =
      value.trim().charAt(0).toUpperCase() +
      value.trim().slice(1).toLowerCase();
    return selectedArr.includes(normalized);
  };

  const filtered = plays.filter((p) => {
    // Checkbox filters - case-insensitive matching
    if (!matchesFilter(p.type, scriptSelectedTypes)) return false;
    if (!matchesFilter(p.preferredSituation, scriptSelectedSituation))
      return false;
    if (!matchesFilter(p.preferredDown, scriptSelectedDown)) return false;
    if (!matchesFilter(p.preferredDistance, scriptSelectedDistance))
      return false;
    if (!matchesFilter(p.preferredHash, scriptSelectedHash)) return false;
    if (!matchesFilter(p.preferredFieldPosition, scriptSelectedFieldPos))
      return false;
    if (!matchesFilter(p.personnel, scriptSelectedPersonnel)) return false;
    if (formation && p.formation !== formation) return false;
    if (basePlay && p.basePlay !== basePlay) return false;
    if (search) {
      const searchFields = [
        p.play,
        p.formation,
        p.protection,
        p.motion,
        p.shift,
        p.back,
      ]
        .join(" ")
        .toLowerCase();
      if (!searchFields.includes(search)) return false;
    }
    return true;
  });

  const container = document.getElementById("availablePlays");

  // Pre-build index map to avoid O(n²) indexOf calls
  const playIndexMap = new Map(plays.map((p, i) => [p, i]));

  // Store ALL filtered play indices for Add All Filtered
  window.currentFilteredPlayIndices = filtered.map((p) => playIndexMap.get(p));

  // ── Pagination ──
  const totalAvail = filtered.length;
  const totalAvailPages = Math.max(1, Math.ceil(totalAvail / AVAIL_PER_PAGE));
  if (scriptAvailPage >= totalAvailPages) scriptAvailPage = totalAvailPages - 1;
  if (scriptAvailPage < 0) scriptAvailPage = 0;
  const availStart = scriptAvailPage * AVAIL_PER_PAGE;
  const pageFiltered = filtered.slice(availStart, availStart + AVAIL_PER_PAGE);

  // ── Zero-state ──
  if (pageFiltered.length === 0) {
    container.innerHTML = `
      <div class="avail-empty-state">
        <span class="avail-empty-icon">🔍</span>
        <p class="avail-empty-msg">No plays match the current filters.</p>
        <p class="avail-empty-hint">Try adjusting your search or clearing active filters.</p>
      </div>
    `;
    document.getElementById("availablePlayCount").textContent = "0";
    const pagerEl = document.getElementById("availPager");
    if (pagerEl) pagerEl.remove();
    return;
  }

  // ── Build Set of plays already on the script (for badge) ──
  const inScriptSet = new Set(
    script
      .filter((x) => !x.isSeparator)
      .map((x) => `${x.formation}||${x.protection}||${x.play}`),
  );

  container.innerHTML = pageFiltered
    .map((p) => {
      const playIdx = playIndexMap.get(p);
      const isSelected = selectedAvailablePlays.includes(playIdx);
      const alreadyIn = inScriptSet.has(
        `${p.formation}||${p.protection}||${p.play}`,
      );
      return `
            <div class="play-item ${isSelected ? "selected" : ""} ${alreadyIn ? "in-script" : ""}" draggable="true" data-drag="availStart" data-idx="${playIdx}">
                <input type="checkbox" class="available-play-cb" data-index="${playIdx}" 
                       ${isSelected ? "checked" : ""} 
                       data-field="availableSelect" data-idx="${playIdx}" />
                <div class="play-info">
                    <div class="play-name">${escapeHtml(p.formation)} ${escapeHtml(p.protection)} ${escapeHtml(p.play)}${alreadyIn ? ' <span class="in-script-badge" title="Already on script">✓ On Script</span>' : ""}</div>
                    <div class="play-details">${escapeHtml(p.type)} ${p.motion ? "• " + escapeHtml(p.motion) : ""}</div>
                </div>
                <button data-action="addToScript" data-idx="${playIdx}">+ Add</button>
            </div>
        `;
    })
    .join("");

  document.getElementById("availablePlayCount").textContent = totalAvail;

  // ── Pagination controls ──
  let pagerEl = document.getElementById("availPager");
  if (totalAvail <= AVAIL_PER_PAGE) {
    if (pagerEl) pagerEl.remove();
  } else {
    if (!pagerEl) {
      pagerEl = document.createElement("div");
      pagerEl.id = "availPager";
      pagerEl.className = "avail-pager";
      container.insertAdjacentElement("afterend", pagerEl);
    }
    pagerEl.innerHTML = `
      <button class="btn btn-sm" data-action="availPagePrev" ${scriptAvailPage === 0 ? "disabled" : ""}>◀</button>
      <span>${availStart + 1}–${Math.min(availStart + AVAIL_PER_PAGE, totalAvail)} of ${totalAvail}</span>
      <button class="btn btn-sm" data-action="availPageNext" ${scriptAvailPage >= totalAvailPages - 1 ? "disabled" : ""}>▶</button>
    `;
  }

  // Update select all checkbox state
  const selectAllCb = document.getElementById("selectAllAvailable");
  if (selectAllCb) {
    const selectedSet = new Set(selectedAvailablePlays);
    const allSelected =
      pageFiltered.length > 0 &&
      pageFiltered.every((p) => selectedSet.has(playIndexMap.get(p)));
    const someSelected = pageFiltered.some((p) =>
      selectedSet.has(playIndexMap.get(p)),
    );
    selectAllCb.checked = allSelected;
    selectAllCb.indeterminate = someSelected && !allSelected;
  }
}

// RAF-coalesced version for available plays rendering
const _scheduleRenderAvailable = createRAFRenderer(renderAvailablePlays);

/**
 * Ensure the script has at least one period separator.
 * If empty, auto-creates a default "Period 1".
 */
function ensureFirstPeriod() {
  const hasSeparator = script.some((item) => item.isSeparator);
  if (!hasSeparator) {
    script.push({
      isSeparator: true,
      label: "Period 1",
      minutes: 10,
      color: UI_COLORS.periodDefault,
      id: Date.now() + Math.random(),
    });
  }
}

/**
 * Add a play to the script
 * @param {number} playIndex - Index of the play in the plays array
 */
function addToScript(playIndex) {
  saveScriptState();
  ensureFirstPeriod();
  const play = plays[playIndex];
  script.push({
    ...play,
    reps: 1,
    notes: "",
    hash: "",
    defFront: "",
    defCoverage: "",
    defStunt: "",
    defBlitz: "",
    id: Date.now() + Math.random(),
  });
  renderScript();

  // Flash the newly added play row
  const items = document.querySelectorAll(
    "#scriptPlays .script-item:not(.period-header)",
  );
  const lastItem = items[items.length - 1];
  if (lastItem) {
    lastItem.classList.add("just-added");
    lastItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setTimeout(() => lastItem.classList.remove("just-added"), 950);
  }
}

/**
 * Toggle selection of an available play
 * @param {number} playIndex - Index in plays array
 */
function toggleAvailablePlaySelect(playIndex) {
  const idx = selectedAvailablePlays.indexOf(playIndex);
  if (idx > -1) {
    selectedAvailablePlays.splice(idx, 1);
  } else {
    selectedAvailablePlays.push(playIndex);
  }
  renderAvailablePlays();
}

/**
 * Toggle select all available (filtered) plays
 */
function toggleSelectAllAvailable() {
  const selectAllCb = document.getElementById("selectAllAvailable");
  const filteredIndices = window.currentFilteredPlayIndices || [];

  if (selectAllCb && selectAllCb.checked) {
    // Add all filtered plays to selection
    filteredIndices.forEach((idx) => {
      if (!selectedAvailablePlays.includes(idx)) {
        selectedAvailablePlays.push(idx);
      }
    });
  } else {
    // Remove all filtered plays from selection
    selectedAvailablePlays = selectedAvailablePlays.filter(
      (idx) => !filteredIndices.includes(idx),
    );
  }
  renderAvailablePlays();
}

/**
 * Add all currently filtered plays to the script
 */
async function addAllFilteredToScript() {
  const filteredIndices = window.currentFilteredPlayIndices || [];
  if (filteredIndices.length === 0) {
    showToast("No plays to add — adjust your filters");
    return;
  }

  const ok = await showConfirm(
    `Add all ${filteredIndices.length} filtered plays to the script?`,
    { title: "Add All Plays", icon: "➕", confirmText: "Add All" },
  );
  if (!ok) {
    return;
  }

  saveScriptState();
  ensureFirstPeriod();
  filteredIndices.forEach((playIndex) => {
    const play = plays[playIndex];
    script.push({
      ...play,
      reps: 1,
      notes: "",
      hash: "",
      defFront: "",
      defCoverage: "",
      defStunt: "",
      defBlitz: "",
      id: Date.now() + Math.random(),
    });
  });
  renderScript();
}

/**
 * Add selected available plays to the script
 */
function addSelectedToScript() {
  if (selectedAvailablePlays.length === 0) {
    showToast("No plays selected — check the boxes first");
    return;
  }

  saveScriptState();
  ensureFirstPeriod();
  selectedAvailablePlays.forEach((playIndex) => {
    const play = plays[playIndex];
    script.push({
      ...play,
      reps: 1,
      notes: "",
      hash: "",
      defFront: "",
      defCoverage: "",
      defStunt: "",
      defBlitz: "",
      id: Date.now() + Math.random(),
    });
  });

  // Clear selection after adding
  selectedAvailablePlays = [];
  renderAvailablePlays();
  renderScript();
}

/**
 * Sort the script by a field
 */
function sortScript() {
  const fieldSelect = document.getElementById("scriptSortField");
  const field = fieldSelect.value;
  const statusEl = document.getElementById("scriptSortStatus");

  if (!field) {
    if (statusEl) {
      statusEl.textContent = "⚠️ Select a field first";
      statusEl.className = "text-danger";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
    return;
  }

  // Check if there are plays to sort
  const playsToSort = script.filter((item) => !item.isSeparator);
  if (playsToSort.length === 0) {
    if (statusEl) {
      statusEl.textContent = "⚠️ No plays to sort";
      statusEl.className = "text-danger";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
    return;
  }

  saveScriptState();

  // Get custom order if exists
  const customOrder = scriptCustomSortOrders[field] || [];
  const hasCustomOrder = customOrder.length > 0;
  const fieldLabel =
    SCRIPT_SORT_FIELDS.find((f) => f.value === field)?.label || field;

  // Compare function that respects custom order
  const compareWithCustomOrder = (a, b) => {
    const aVal = (a[field] || "").toString().trim();
    const bVal = (b[field] || "").toString().trim();

    if (hasCustomOrder) {
      const aIdx = customOrder.indexOf(aVal);
      const bIdx = customOrder.indexOf(bVal);

      // Both in custom order
      if (aIdx !== -1 && bIdx !== -1) {
        return aIdx - bIdx;
      }
      // Only a in custom order - a comes first
      if (aIdx !== -1) return -1;
      // Only b in custom order - b comes first
      if (bIdx !== -1) return 1;
    }

    // Fall back to alphabetical
    return aVal.toLowerCase().localeCompare(bVal.toLowerCase());
  };

  // Separate separators and plays, sort plays, then reconstruct
  // We'll sort plays within each period
  const result = [];
  let currentPeriodPlays = [];

  script.forEach((item, index) => {
    if (item.isSeparator) {
      // Sort and add accumulated plays before this separator
      if (currentPeriodPlays.length > 0) {
        currentPeriodPlays.sort(compareWithCustomOrder);
        result.push(...currentPeriodPlays);
        currentPeriodPlays = [];
      }
      result.push(item);
    } else {
      currentPeriodPlays.push(item);
    }
  });

  // Sort and add any remaining plays after the last separator
  if (currentPeriodPlays.length > 0) {
    currentPeriodPlays.sort(compareWithCustomOrder);
    result.push(...currentPeriodPlays);
  }

  script = result;
  renderScript();

  // Show feedback
  if (statusEl) {
    const orderType = hasCustomOrder ? "(custom)" : "(A-Z)";
    statusEl.textContent = `✓ Sorted by ${fieldLabel} ${orderType}`;
    statusEl.className = "text-success";
    setTimeout(() => {
      statusEl.textContent = "";
    }, AUTOSAVE_DEBOUNCE_MS);
  }
}

/**
 * Reverse the order of plays in the script (within periods)
 */
function reverseScriptSort() {
  const statusEl = document.getElementById("scriptSortStatus");
  const playsToSort = script.filter((item) => !item.isSeparator);

  if (playsToSort.length === 0) {
    if (statusEl) {
      statusEl.textContent = "⚠️ No plays to reverse";
      statusEl.className = "text-danger";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
    return;
  }

  saveScriptState();

  // Separate separators and plays, reverse plays within each period
  const result = [];
  let currentPeriodPlays = [];

  script.forEach((item) => {
    if (item.isSeparator) {
      if (currentPeriodPlays.length > 0) {
        currentPeriodPlays.reverse();
        result.push(...currentPeriodPlays);
        currentPeriodPlays = [];
      }
      result.push(item);
    } else {
      currentPeriodPlays.push(item);
    }
  });

  // Reverse any remaining plays after the last separator
  if (currentPeriodPlays.length > 0) {
    currentPeriodPlays.reverse();
    result.push(...currentPeriodPlays);
  }

  script = result;
  renderScript();

  // Show feedback
  if (statusEl) {
    statusEl.textContent = "✓ Order reversed";
    statusEl.className = "text-success";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  }
}

/**
 * Get unique values for a field from the current script
 */
function getScriptUniqueValuesForField(field) {
  const values = new Set();
  script.forEach((item) => {
    if (!item.isSeparator && item[field]) {
      values.add(String(item[field]).trim());
    }
  });
  return Array.from(values).sort();
}

/**
 * Open the custom sort order modal for script
 */
async function openScriptCustomOrderModal() {
  const field = document.getElementById("scriptSortField").value;

  if (!field) {
    await showModal(
      "Please select a field to sort by first, then click the gear to customize its order.",
      { title: "No Field Selected", icon: "⚙️" },
    );
    return;
  }

  const fieldLabel =
    SCRIPT_SORT_FIELDS.find((f) => f.value === field)?.label || field;
  const uniqueValues = getScriptUniqueValuesForField(field);

  if (uniqueValues.length === 0) {
    await showModal(
      `No values found for "${fieldLabel}" in your script. Add some plays first.`,
      { title: "No Values", icon: "⚠️" },
    );
    return;
  }

  // Get existing custom order or use unique values
  let orderedValues = scriptCustomSortOrders[field] || [];
  uniqueValues.forEach((val) => {
    if (!orderedValues.includes(val)) orderedValues.push(val);
  });
  orderedValues = orderedValues.filter((val) => uniqueValues.includes(val));

  const statusEl = document.getElementById("scriptSortStatus");

  showReorderModal(orderedValues, {
    title: `Custom Sort Order: ${fieldLabel}`,
    onSave(order) {
      scriptCustomSortOrders[field] = order;
      storageManager.set(
        STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
        scriptCustomSortOrders,
      );
      if (statusEl) {
        statusEl.textContent = `✓ Custom order saved for ${fieldLabel}`;
        statusEl.className = "text-success";
        setTimeout(() => {
          statusEl.textContent = "";
        }, AUTOSAVE_DEBOUNCE_MS);
      }
    },
    onClear() {
      delete scriptCustomSortOrders[field];
      storageManager.set(
        STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
        scriptCustomSortOrders,
      );
      if (statusEl) {
        statusEl.textContent = `✓ Custom order cleared for ${fieldLabel}`;
        statusEl.className = "text-muted";
        setTimeout(() => {
          statusEl.textContent = "";
        }, AUTOSAVE_DEBOUNCE_MS);
      }
    },
  });
}

/**
 * Add a period/separator to the script
 * Uses a small inline modal instead of browser prompts
 */
function addSeparator() {
  // Build and show a mini modal for period creation
  const overlay = document.createElement("div");
  overlay.className = "period-create-overlay";
  overlay.innerHTML = `
    <div class="period-create-modal">
      <h4>➕ New Period</h4>
      <div class="period-create-fields">
        <div class="pcf-row">
          <label>Period Name</label>
          <input type="text" id="newPeriodName" value="" placeholder="e.g., Indy, Team Run, 7-on-7" autofocus />
        </div>
        <div class="pcf-row">
          <label>Time (minutes)</label>
          <input type="number" id="newPeriodMinutes" value="10" min="0" max="60" />
        </div>
        <div class="pcf-row">
          <label>Color</label>
          <input type="color" id="newPeriodColor" value="#333333" />
        </div>
      </div>
      <div class="period-create-presets">
        <span class="pcf-presets-label">Quick:</span>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Indy">Indy</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Team Run">Team Run</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Team Pass">Team Pass</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="7-on-7">7-on-7</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Red Zone">Red Zone</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="2-Minute">2-Minute</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Short Yardage">Short Yardage</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Goal Line">Goal Line</button>
      </div>
      <div class="period-create-actions">
        <button class="btn btn-success" data-action="confirmAddPeriod">✓ Add Period</button>
        <button class="btn" data-action="closePeriodOverlay">Cancel</button>
      </div>
    </div>
  `;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
  // Focus the name input
  setTimeout(() => document.getElementById("newPeriodName")?.focus(), 50);
}

/**
 * Confirm adding the new period from the mini modal
 */
function confirmAddPeriod() {
  const name = document.getElementById("newPeriodName").value.trim();
  const minutes =
    parseInt(document.getElementById("newPeriodMinutes").value, 10) || 0;
  const color =
    document.getElementById("newPeriodColor").value || UI_COLORS.periodDefault;

  if (!name) {
    document.getElementById("newPeriodName").classList.add("input-error");
    document.getElementById("newPeriodName").focus();
    return;
  }

  saveScriptState();
  script.push({
    isSeparator: true,
    label: name,
    minutes: minutes,
    color: color,
    id: Date.now() + Math.random(),
  });
  renderScript();

  // Close modal
  document.querySelector(".period-create-overlay")?.remove();
}

/**
 * Toggle collapse/expand for a period
 */
function togglePeriodCollapse(periodId) {
  if (collapsedPeriods.has(periodId)) {
    collapsedPeriods.delete(periodId);
  } else {
    collapsedPeriods.add(periodId);
  }
  renderScript();
}

/**
 * Collapse all periods at once
 */
function collapseAllPeriods() {
  script
    .filter((p) => p.isSeparator)
    .forEach((p) => collapsedPeriods.add(p.id));
  renderScript();
}

/**
 * Expand all periods at once
 */
function expandAllPeriods() {
  collapsedPeriods.clear();
  renderScript();
}

/**
 * Update period header color without full re-render
 */
function updatePeriodColor(index, el) {
  script[index].color = el.value;
  const header = el.closest(".period-header");
  if (header) header.style.background = el.value;
  const wrapper = el.closest(".period-header-wrapper");
  if (wrapper) wrapper.style.borderLeftColor = el.value;
  saveScriptState();
}

/**
 * Update period minutes without full re-render
 */
function updatePeriodMinutes(index, el) {
  script[index].minutes = parseInt(el.value, 10) || 0;
  const span = el.closest(".ph-left")?.querySelector(".ph-meta-span");
  if (span) {
    const playCount = getPeriodPlays(index).length;
    const periodReps = getPeriodPlays(index).reduce(
      (s, p) => s + (p.reps || 1),
      0,
    );
    const timeDisplay = script[index].minutes
      ? `${script[index].minutes} min`
      : "";
    span.textContent = `${playCount} plays • ${periodReps} reps${timeDisplay ? " • " + timeDisplay : ""}`;
  }
  saveScriptState();
  updateScriptStats();
}

/**
 * Copy all plays in a period as readable plain text to clipboard
 * @param {number|string} idx - index of the period separator in script[]
 */
function copyPeriodAsText(idx) {
  const sepIdx = parseInt(idx, 10);
  const sep = script[sepIdx];
  if (!sep || !sep.isSeparator) return;

  const periodPlays = getPeriodPlays(sepIdx);
  if (periodPlays.length === 0) {
    showToast("⚠️ No plays in this period");
    return;
  }

  const header = sep.label || "Period";
  const lines = [header, "─".repeat(header.length)];
  periodPlays.forEach((p, n) => {
    const call = getFullCall(p);
    const meta = [p.type, p.hash, p.tempo].filter(Boolean).join(" | ");
    lines.push(`${n + 1}. ${call}${meta ? "  [" + meta + "]" : ""}`);
  });

  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => showToast(`📋 ${periodPlays.length} plays copied`))
    .catch(() => showToast("❌ Clipboard not available"));
}

/**
 * Get all plays belonging to a period (until next separator or end)
 */
function getPeriodPlays(separatorIndex) {
  const plays = [];
  for (let i = separatorIndex + 1; i < script.length; i++) {
    if (script[i].isSeparator) break;
    plays.push({ ...script[i], id: Date.now() + Math.random() + i });
  }
  return plays;
}

/**
 * Duplicate an entire period with all its plays
 */
function duplicatePeriod(separatorIndex) {
  saveScriptState();
  const separator = script[separatorIndex];
  const plays = getPeriodPlays(separatorIndex);

  // Find where this period ends
  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) {
    endIndex++;
  }

  // Create duplicates
  const newSeparator = {
    ...separator,
    label: separator.label + " (Copy)",
    id: Date.now() + Math.random(),
  };

  // Insert after current period
  script.splice(endIndex, 0, newSeparator, ...plays);
  renderScript();
}

/**
 * Move an entire period up or down
 */
function movePeriod(separatorIndex, direction) {
  // Find the bounds of this period
  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) {
    endIndex++;
  }

  const periodItems = script.slice(separatorIndex, endIndex);

  if (direction === -1) {
    // Move up - find previous separator
    let prevSepIdx = separatorIndex - 1;
    while (prevSepIdx >= 0 && !script[prevSepIdx].isSeparator) {
      prevSepIdx--;
    }
    if (prevSepIdx < 0) return; // Already at top

    saveScriptState();
    // Remove current period
    script.splice(separatorIndex, endIndex - separatorIndex);
    // Insert before previous separator
    script.splice(prevSepIdx, 0, ...periodItems);
  } else {
    // Move down - find next separator after this period ends
    if (endIndex >= script.length) return; // Already at bottom

    let nextEndIdx = endIndex + 1;
    while (nextEndIdx < script.length && !script[nextEndIdx].isSeparator) {
      nextEndIdx++;
    }

    saveScriptState();
    // Remove current period
    script.splice(separatorIndex, endIndex - separatorIndex);
    // Calculate new insert position (adjusted for removal)
    const insertAt = nextEndIdx - (endIndex - separatorIndex);
    script.splice(insertAt, 0, ...periodItems);
  }

  renderScript();
}

/**
 * Save current period as a template
 */
async function savePeriodAsTemplate(separatorIndex) {
  const separator = script[separatorIndex];
  const plays = getPeriodPlays(separatorIndex);

  const name = await showPrompt("Template name:", separator.label, {
    title: "Save Template",
    icon: "💾",
  });
  if (!name) return;

  const template = {
    id: Date.now(),
    name: name,
    minutes: separator.minutes || 0,
    plays: plays.map((p) => ({ ...p, id: null })), // Remove IDs for template
  };

  periodTemplates.push(template);
  storageManager.set(STORAGE_KEYS.PERIOD_TEMPLATES, periodTemplates);
  showToast(`Template "${name}" saved!`);
}

/**
 * Sort plays within a single period by the currently selected sort field
 */
function sortPeriod(separatorIndex) {
  const fieldSelect = document.getElementById("scriptSortField");
  const field = fieldSelect ? fieldSelect.value : "";
  const statusEl = document.getElementById("scriptSortStatus");

  if (!field) {
    if (statusEl) {
      statusEl.textContent = "⚠️ Select a sort field first";
      statusEl.className = "text-danger";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
    return;
  }

  // Find period bounds
  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) {
    endIndex++;
  }
  const periodPlays = script.slice(separatorIndex + 1, endIndex);
  if (periodPlays.length < 2) return;

  saveScriptState();

  // Get custom order if exists
  const customOrder = scriptCustomSortOrders[field] || [];
  const hasCustomOrder = customOrder.length > 0;

  periodPlays.sort((a, b) => {
    const aVal = (a[field] || "").toString().trim();
    const bVal = (b[field] || "").toString().trim();
    if (hasCustomOrder) {
      const aIdx = customOrder.indexOf(aVal);
      const bIdx = customOrder.indexOf(bVal);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
    }
    return aVal.toLowerCase().localeCompare(bVal.toLowerCase());
  });

  // Replace in-place
  script.splice(
    separatorIndex + 1,
    endIndex - separatorIndex - 1,
    ...periodPlays,
  );
  renderScript();

  const fieldLabel =
    SCRIPT_SORT_FIELDS.find((f) => f.value === field)?.label || field;
  const periodLabel = script[separatorIndex].label || "Period";
  if (statusEl) {
    statusEl.textContent = `✓ ${periodLabel} sorted by ${fieldLabel}`;
    statusEl.className = "text-success";
    setTimeout(() => {
      statusEl.textContent = "";
    }, AUTOSAVE_DEBOUNCE_MS);
  }
}

/**
 * Reverse the play order within a single period
 */
function reversePeriod(separatorIndex) {
  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) {
    endIndex++;
  }
  const periodPlays = script.slice(separatorIndex + 1, endIndex);
  if (periodPlays.length < 2) return;

  saveScriptState();
  periodPlays.reverse();
  script.splice(
    separatorIndex + 1,
    endIndex - separatorIndex - 1,
    ...periodPlays,
  );
  renderScript();

  const statusEl = document.getElementById("scriptSortStatus");
  const periodLabel = script[separatorIndex].label || "Period";
  if (statusEl) {
    statusEl.textContent = `✓ ${periodLabel} reversed`;
    statusEl.className = "text-success";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  }
}

// Track which period Smart Script is scoped to (null = all periods)
let smartScriptTargetPeriod = null;

/**
 * Open Smart Script scoped to a single period
 */
function openSmartScriptForPeriod(separatorIndex) {
  const plays = getPeriodPlays(separatorIndex);
  if (plays.length < 2) {
    showToast("This period needs at least 2 plays for Smart Script");
    return;
  }

  smartScriptTargetPeriod = separatorIndex;
  const periodLabel = script[separatorIndex].label || "Period";

  const modal = document.getElementById("smartScriptModal");
  modal.classList.add("show");

  // Update modal title to show which period
  const titleEl =
    modal.querySelector("h3") || modal.querySelector(".modal-title");
  if (titleEl) {
    titleEl.textContent = `🧠 Smart Script — ${periodLabel}`;
  }

  // Wire up sliders
  [
    "HashFlow",
    "DownProg",
    "TypeVariety",
    "Personnel",
    "Tempo",
    "Formation",
    "RunPassBal",
    "Constraint",
  ].forEach((name) => {
    const slider = document.getElementById("ssWeight" + name);
    const display = document.getElementById("ssWeight" + name + "Val");
    if (slider && display) {
      slider.oninput = () => {
        display.textContent = slider.value;
      };
    }
  });

  const runPctSlider = document.getElementById("ssRunPct");
  const runPctDisplay = document.getElementById("ssRunPctVal");
  if (runPctSlider && runPctDisplay) {
    runPctSlider.oninput = () => {
      runPctDisplay.textContent = runPctSlider.value + "%";
    };
  }

  document.getElementById("smartScriptPreview").innerHTML = "";
}

/**
 * Apply preferred metadata to plays in a single period
 */
async function applyPreferredForPeriod(separatorIndex) {
  // Get indices of plays in this period
  const periodPlayIndices = [];
  for (let i = separatorIndex + 1; i < script.length; i++) {
    if (script[i].isSeparator) break;
    periodPlayIndices.push(i);
  }

  if (periodPlayIndices.length === 0) {
    showToast("No plays in this period");
    return;
  }

  const periodLabel = script[separatorIndex].label || "Period";
  const ok = await showConfirm(
    `Apply preferred metadata to ${periodPlayIndices.length} play(s) in ${periodLabel}?\n\nThis will fill in Hash, Front, Coverage, Stunt, and Blitz from each play's metadata.`,
    { title: "Apply Preferred", icon: "⭐", confirmText: "Apply" },
  );
  if (!ok) {
    return;
  }

  saveScriptState();
  let updatedCount = 0;

  periodPlayIndices.forEach((i) => {
    const p = script[i];
    if (!p || p.isSeparator) return;
    let changed = false;

    if (p.preferredHash && !p.hash) {
      p.hash = p.preferredHash;
      changed = true;
    }
    if (p.practiceFront && !p.defFront) {
      p.defFront = p.practiceFront;
      changed = true;
    }
    if (p.practiceCoverage && !p.defCoverage) {
      p.defCoverage = p.practiceCoverage;
      changed = true;
    }
    if (p.practiceStunt && !p.defStunt) {
      p.defStunt = p.practiceStunt;
      changed = true;
    }
    if (p.practiceBlitz && !p.defBlitz) {
      p.defBlitz = p.practiceBlitz;
      changed = true;
    }
    if (changed) updatedCount++;
  });

  renderScript();

  const statusEl = document.getElementById("scriptSortStatus");
  if (statusEl) {
    statusEl.textContent = `✓ ${periodLabel}: ${updatedCount} play(s) updated with preferred fields`;
    statusEl.className = "text-success";
    setTimeout(() => {
      statusEl.textContent = "";
    }, AUTOSAVE_DEBOUNCE_MS);
  }
}

/**
 * Push a period's plays to matching call sheet categories.
 * Uses findMatchingCategories from callsheet.js to auto-place each play.
 */
async function pushPeriodToCallSheet(separatorIndex) {
  const periodPlays = [];
  for (let i = separatorIndex + 1; i < script.length; i++) {
    if (script[i].isSeparator) break;
    periodPlays.push(script[i]);
  }
  if (periodPlays.length === 0) {
    showToast("No plays in this period");
    return;
  }

  const periodLabel = script[separatorIndex].label || "Period";

  const ok = await showConfirm(
    `Push ${periodPlays.length} play(s) from <b>${periodLabel}</b> to matching call sheet categories?\n\nPlays will be placed using their preferred metadata (down, distance, situation, hash). Plays already on the sheet will be skipped.`,
    { title: "📋 Push to Call Sheet", icon: "📋", confirmText: "Push" },
  );
  if (!ok) return;

  // Make sure call sheet is initialized
  if (
    typeof initCallSheet === "function" &&
    Object.keys(callSheet).length === 0
  ) {
    initCallSheet();
  }

  let placed = 0;
  let skipped = 0;
  let noMatch = 0;

  periodPlays.forEach((p) => {
    // Find matching categories
    const matches =
      typeof findMatchingCategories === "function"
        ? findMatchingCategories(p)
        : [];
    if (matches.length === 0) {
      noMatch++;
      return;
    }

    matches.forEach((catId) => {
      if (!callSheet[catId]) callSheet[catId] = { left: [], right: [] };

      // Check if already on sheet in this category
      const data = callSheet[catId];
      const alreadyThere = [...(data.left || []), ...(data.right || [])].some(
        (existing) => playsMatch(existing, p),
      );
      if (alreadyThere) {
        skipped++;
        return;
      }

      // Determine hash side
      const hash = (p.hash || p.preferredHash || "").toUpperCase();
      const side = hash === "R" ? "right" : "left";

      // Build call sheet play object
      const csPlay = {
        ...p,
        playType: p.type,
        wristbandNumber: null,
        highlighted: false,
        borderColor: null,
        cellBg: null,
        cellTextColor: null,
        cellBold: false,
        cellItalic: false,
        cellUnderline: false,
        cellStrikethrough: false,
        cellFontSize: null,
        cellNote: null,
      };

      callSheet[catId][side].push(csPlay);
      placed++;
    });
  });

  if (typeof saveCallSheet === "function") saveCallSheet();
  showToast(
    `📋 Pushed from ${periodLabel}: ${placed} placed, ${skipped} already on sheet, ${noMatch} no match`,
  );
}

/**
 * Import plays from call sheet categories into a script period
 * Bi-directional sync: Call Sheet → Script
 */
async function importFromCallSheet(separatorIndex) {
  // Make sure call sheet is initialized
  if (
    typeof initCallSheet === "function" &&
    Object.keys(callSheet).length === 0
  ) {
    initCallSheet();
  }

  // Build list of categories that have plays
  const cats =
    typeof CALLSHEET_CATEGORIES !== "undefined" ? CALLSHEET_CATEGORIES : [];
  const filledCats = cats.filter((cat) => {
    const data = callSheet[cat.id];
    if (!data) return false;
    return (data.left || []).length + (data.right || []).length > 0;
  });

  if (filledCats.length === 0) {
    showToast("Call sheet is empty — add plays to the call sheet first");
    return;
  }

  const periodLabel = script[separatorIndex].label || "Period";

  // Build a picker modal
  const overlay = document.createElement("div");
  overlay.className = "period-create-overlay";
  overlay.onclick = () => overlay.remove();

  let catListHtml = filledCats
    .map((cat) => {
      const data = callSheet[cat.id] || { left: [], right: [] };
      const count = (data.left || []).length + (data.right || []).length;
      const displayName =
        typeof getCategoryDisplayName === "function"
          ? getCategoryDisplayName(cat)
          : cat.name;
      return `
      <label class="cs-import-cat-item">
        <input type="checkbox" value="${cat.id}" class="cs-import-cat-cb">
        <span class="cs-import-cat-color" style="background:${cat.color}"></span>
        <span class="cs-import-cat-name">${displayName}</span>
        <span class="cs-import-cat-count">${count}</span>
      </label>`;
    })
    .join("");

  overlay.innerHTML = `
    <div class="period-create-modal cs-import-modal">
      <h4>📋 Import from Call Sheet → ${periodLabel}</h4>
      <p class="cs-import-hint">Select categories to import plays from. Duplicates will be skipped.</p>
      <div class="cs-import-actions-top">
        <button class="btn btn-sm" data-action="csImportSelectAll">Select All</button>
        <button class="btn btn-sm" data-action="csImportClearAll">Clear</button>
      </div>
      <div class="cs-import-cat-list">
        ${catListHtml}
      </div>
      <div class="period-create-actions" style="margin-top:12px;">
        <button class="btn btn-primary" data-action="doImportFromCallSheet" data-idx="${separatorIndex}">Import Selected</button>
        <button class="btn" data-action="closePeriodOverlay">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

/**
 * Execute the import after user selects categories
 */
function doImportFromCallSheet(separatorIndex, modal) {
  const checked = modal.querySelectorAll(".cs-import-cat-cb:checked");
  const selectedIds = Array.from(checked).map((cb) => cb.value);

  if (selectedIds.length === 0) {
    showToast("Select at least one category");
    return;
  }

  // Gather existing plays in this period to avoid duplicates
  const existingPlays = getPeriodPlays(separatorIndex);

  let imported = 0;
  let skipped = 0;
  const insertAt = findPeriodEndIndex(separatorIndex);

  selectedIds.forEach((catId) => {
    const data = callSheet[catId] || { left: [], right: [] };
    const allPlays = [...(data.left || []), ...(data.right || [])];

    allPlays.forEach((csPlay) => {
      // Check if already in this period
      const isDupe = existingPlays.some((ep) => playsMatch(ep, csPlay));
      if (isDupe) {
        skipped++;
        return;
      }

      // Build script play from call sheet play
      const scriptPlay = {
        ...csPlay,
        type: csPlay.playType || csPlay.type || "",
        hash: csPlay.hash || "",
        tempo: csPlay.tempo || "",
        defFront: csPlay.defFront || "",
        defCoverage: csPlay.defCoverage || "",
        defStunt: csPlay.defStunt || "",
        defBlitz: csPlay.defBlitz || "",
        reps: csPlay.reps || 1,
        notes: csPlay.cellNote || csPlay.notes || "",
      };

      // Remove call-sheet-specific fields
      delete scriptPlay.highlighted;
      delete scriptPlay.borderColor;
      delete scriptPlay.cellBg;
      delete scriptPlay.cellTextColor;
      delete scriptPlay.cellBold;
      delete scriptPlay.cellItalic;
      delete scriptPlay.cellUnderline;
      delete scriptPlay.cellStrikethrough;
      delete scriptPlay.cellFontSize;
      delete scriptPlay.cellNote;
      delete scriptPlay.wristbandNumber;

      script.splice(insertAt + imported, 0, scriptPlay);
      imported++;
    });
  });

  // Close modal
  modal.closest(".period-create-overlay").remove();

  markScriptDirty();
  renderScript();
  showToast(
    `📋 Imported ${imported} play(s) from call sheet${skipped > 0 ? `, ${skipped} duplicates skipped` : ""}`,
  );
}

/**
 * Find the index after the last play in a period (before next separator or end)
 */
function findPeriodEndIndex(separatorIndex) {
  for (let i = separatorIndex + 1; i < script.length; i++) {
    if (script[i].isSeparator) return i;
  }
  return script.length;
}

/**
 * Show template picker modal and insert selected template
 */
function insertPeriodFromTemplate() {
  if (periodTemplates.length === 0) {
    showToast("No templates saved yet — use 💾 on a period header first");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "period-create-overlay";
  overlay.onclick = () => overlay.remove();
  overlay.innerHTML = `
    <div class="period-create-modal">
      <h4>📋 Insert from Template</h4>
      <div class="template-picker-list">
        ${periodTemplates
          .map(
            (t, i) => `
          <div class="template-picker-item" data-action="doInsertTemplate" data-idx="${i}">
            <div class="tpi-name">${escapeHtml(t.name)}</div>
            <div class="tpi-meta">${t.plays.length} plays • ${t.minutes} min</div>
          </div>
        `,
          )
          .join("")}
      </div>
      <div class="period-create-actions" style="margin-top:12px;">
        <button class="btn btn-danger btn-sm" data-action="manageTemplates">🗑 Manage</button>
        <button class="btn" data-action="closePeriodOverlay">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

/**
 * Actually insert a template by index
 */
function doInsertTemplate(idx) {
  if (idx < 0 || idx >= periodTemplates.length) return;
  const template = periodTemplates[idx];
  saveScriptState();

  const newSeparator = {
    isSeparator: true,
    label: template.name,
    minutes: template.minutes,
    id: Date.now() + Math.random(),
  };

  const newPlays = template.plays.map((p) => ({
    ...p,
    id: Date.now() + Math.random(),
  }));

  script.push(newSeparator, ...newPlays);
  renderScript();
  showToast(`Inserted "${template.name}" (${template.plays.length} plays)`);
}

function manageTemplates() {
  if (periodTemplates.length === 0) {
    showToast("No templates to manage");
    return;
  }

  // Close any existing picker overlay
  document.querySelector(".period-create-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "period-create-overlay";
  overlay.onclick = () => overlay.remove();
  overlay.innerHTML = `
    <div class="period-create-modal">
      <h4>🗑 Manage Templates</h4>
      <div class="template-picker-list" id="templateManageList">
        ${periodTemplates
          .map(
            (t, i) => `
          <div class="template-picker-item" style="justify-content:space-between;">
            <div>
              <div class="tpi-name">${escapeHtml(t.name)}</div>
              <div class="tpi-meta">${t.plays.length} plays • ${t.minutes} min</div>
            </div>
            <button class="btn btn-danger btn-sm" data-action="doDeleteTemplate" data-idx="${i}">✕</button>
          </div>
        `,
          )
          .join("")}
      </div>
      <div class="period-create-actions" style="margin-top:12px;">
        <button class="btn" data-action="closePeriodOverlay">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function doDeleteTemplate(idx) {
  const name = periodTemplates[idx].name;
  const ok = await showConfirm(`Delete template "${name}"?`, {
    title: "Delete Template",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  periodTemplates.splice(idx, 1);
  storageManager.set(STORAGE_KEYS.PERIOD_TEMPLATES, periodTemplates);
  // Refresh the manage modal
  document.querySelector(".period-create-overlay")?.remove();
  if (periodTemplates.length > 0) {
    manageTemplates();
  }
  showToast(`Template "${name}" deleted`);
}

/**
 * Remove a play from the script
 * @param {number} index - Index in the script array
 */
async function removeFromScript(index) {
  const item = script[index];

  // If it's a period separator, warn and remove the period + its plays
  if (item && item.isSeparator) {
    const plays = getPeriodPlays(index);
    const msg =
      plays.length > 0
        ? `Delete "${item.label || "Period"}" and its ${plays.length} play(s)?`
        : `Delete empty period "${item.label || "Period"}"?`;
    const ok = await showConfirm(msg, {
      title: "Delete Period",
      icon: "🗑️",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;

    saveScriptState();
    // Find how many items to remove (separator + its plays)
    let endIndex = index + 1;
    while (endIndex < script.length && !script[endIndex].isSeparator)
      endIndex++;
    script.splice(index, endIndex - index);
  } else {
    saveScriptState();
    script.splice(index, 1);
  }

  renderScript();
}

/**
 * Duplicate a play in the script
 * @param {number} index - Index in the script array
 */
function duplicatePlay(index) {
  saveScriptState();
  const play = { ...script[index], id: Date.now() + Math.random() };
  script.splice(index + 1, 0, play);
  renderScript();
}

/**
 * Move a play up or down in the script
 * @param {number} index - Current index
 * @param {number} direction - Direction to move (-1 for up, 1 for down)
 */
function movePlay(index, direction) {
  const newIndex = index + direction;
  if (newIndex >= 0 && newIndex < script.length) {
    saveScriptState();
    const temp = script[index];
    script[index] = script[newIndex];
    script[newIndex] = temp;
    renderScript();
  }
}

/**
 * Update reps for a play in the script
 * @param {number} index - Index in the script array
 * @param {number} reps - New reps value
 */
function updateReps(index, reps) {
  script[index].reps = parseInt(reps, 10) || 1;
  updateScriptStats();
  saveScriptState();
}

/**
 * Update notes for a play in the script
 * @param {number} index - Index in the script array
 * @param {string} notes - New notes value
 */
function updateNotes(index, notes) {
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit("notes", notes);
  } else {
    script[index].notes = notes;
    debouncedSaveScriptState();
  }
}

/**
 * Update hash for a play
 */
function updateHash(index, value) {
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit("hash", value);
  } else {
    script[index].hash = value;
    debouncedSaveScriptState();
  }
}

/**
 * Update any defense field for a play (front, coverage, stunt, blitz)
 */
function updateDefField(index, field, value) {
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit(field, value);
  } else {
    script[index][field] = value;
    debouncedSaveScriptState();
  }
}

// Drag and drop handlers
function handleDragStart(event, playIndex) {
  event.dataTransfer.setData("playIndex", playIndex);
  event.dataTransfer.setData("source", "available");
}

function handleScriptDragStart(event, scriptIndex) {
  event.target.classList.add("dragging");
  event.dataTransfer.setData("scriptIndex", scriptIndex);
  event.dataTransfer.setData("source", "script");
  draggedElement = event.target;
}

function handleDragEnd(event) {
  event.target.classList.remove("dragging");
  draggedElement = null;
}

function handleDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");

  const source = event.dataTransfer.getData("source");

  if (source === "available") {
    const playIndex = parseInt(event.dataTransfer.getData("playIndex"), 10);
    if (isNaN(playIndex)) return;
    addToScript(playIndex);
  } else if (source === "script") {
    const fromIndex = parseInt(event.dataTransfer.getData("scriptIndex"), 10);
    if (isNaN(fromIndex)) return;

    // Find drop target index
    const items = document.querySelectorAll(".script-item");
    let toIndex = script.length;

    items.forEach((item, i) => {
      const rect = item.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        if (toIndex === script.length) toIndex = i;
      }
    });

    if (fromIndex !== toIndex && fromIndex !== toIndex - 1) {
      saveScriptState();
      const moved = script.splice(fromIndex, 1)[0];
      if (toIndex > fromIndex) toIndex--;
      script.splice(toIndex, 0, moved);
      renderScript();
    }
  }
}

/**
 * Build dropdown options for defense fields
 * @param {Array} standardOptions - Standard options like L/M/R for hash
 * @param {string} preferredValue - The preferred value from play metadata (e.g., practiceFront)
 * @param {string} currentValue - The currently selected value
 * @returns {string} HTML options string
 */
function buildDefenseOptions(standardOptions, preferredValue, currentValue) {
  let options = `<option value="" ${!currentValue ? "selected" : ""}>-</option>`;

  // If there's a preferred value from metadata, add it as a special option
  if (preferredValue && preferredValue.trim()) {
    const pref = preferredValue.trim();
    const isSelected = currentValue === pref;
    options += `<option value="${pref}" ${isSelected ? "selected" : ""} class="preferred-option">★ ${pref}</option>`;
  }

  // Add standard options (for hash: L, M, R)
  standardOptions.forEach((opt) => {
    // Skip if it's the same as preferred (already added)
    if (preferredValue && preferredValue.trim() === opt) return;
    const isSelected = currentValue === opt;
    options += `<option value="${opt}" ${isSelected ? "selected" : ""}>${opt}</option>`;
  });

  // If current value is set but not in standard options or preferred, add it
  if (
    currentValue &&
    currentValue !== preferredValue?.trim() &&
    !standardOptions.includes(currentValue)
  ) {
    options += `<option value="${currentValue}" selected>${currentValue}</option>`;
  }

  return options;
}

/**
 * Apply preferred metadata fields to selected plays (or all plays if none selected)
 * Sets hash, front, coverage, stunt, and blitz from play metadata
 */
async function applyPreferredFields() {
  // Determine which plays to update
  let indicesToUpdate = [];

  if (bulkSelectedIndices.length > 0) {
    // Use selected plays
    indicesToUpdate = bulkSelectedIndices.filter(
      (i) => !script[i]?.isSeparator,
    );
  } else {
    // Use all plays (excluding separators)
    indicesToUpdate = script
      .map((p, i) => (!p.isSeparator ? i : -1))
      .filter((i) => i !== -1);
  }

  if (indicesToUpdate.length === 0) {
    showToast("No plays to update");
    return;
  }

  const selectionText =
    bulkSelectedIndices.length > 0
      ? `${indicesToUpdate.length} selected play(s)`
      : `all ${indicesToUpdate.length} play(s)`;

  const ok = await showConfirm(
    `Apply preferred metadata to ${selectionText}?\n\nThis will fill in Hash, Front, Coverage, Stunt, and Blitz from each play's metadata.`,
    { title: "Apply Preferred", icon: "⭐", confirmText: "Apply" },
  );
  if (!ok) {
    return;
  }

  saveScriptState();

  let updatedCount = 0;
  indicesToUpdate.forEach((i) => {
    const p = script[i];
    if (!p || p.isSeparator) return;

    let changed = false;

    // Apply preferred hash
    if (p.preferredHash && !p.hash) {
      p.hash = p.preferredHash;
      changed = true;
    }

    // Apply practice front
    if (p.practiceFront && !p.defFront) {
      p.defFront = p.practiceFront;
      changed = true;
    }

    // Apply practice coverage
    if (p.practiceCoverage && !p.defCoverage) {
      p.defCoverage = p.practiceCoverage;
      changed = true;
    }

    // Apply practice stunt
    if (p.practiceStunt && !p.defStunt) {
      p.defStunt = p.practiceStunt;
      changed = true;
    }

    // Apply practice blitz
    if (p.practiceBlitz && !p.defBlitz) {
      p.defBlitz = p.practiceBlitz;
      changed = true;
    }

    if (changed) updatedCount++;
  });

  renderScript();
  showToast(`★ Applied preferred fields to ${updatedCount} play(s)`);
}

/**
 * Auto-fill defense fields from opponent scouting data (Tendencies).
 * Uses getBestDefensiveLook() to derive the most likely defensive look
 * for each play based on its preferred down/distance/situation + opponent tendencies.
 */
async function autoFillDefenseFromTendencies() {
  const opp = getActiveOpponent();
  if (!opp) {
    showModal(
      "No active opponent selected.\n\nGo to the 📊 Dashboard tab and select an opponent first.",
      { title: "No Opponent", icon: "🎯" },
    );
    return;
  }

  // Determine which plays to update
  let indicesToUpdate = [];
  if (bulkSelectedIndices.length > 0) {
    indicesToUpdate = bulkSelectedIndices.filter(
      (i) => !script[i]?.isSeparator,
    );
  } else {
    indicesToUpdate = script
      .map((p, i) => (!p.isSeparator ? i : -1))
      .filter((i) => i !== -1);
  }

  if (indicesToUpdate.length === 0) {
    showToast("No plays to update");
    return;
  }

  const selectionText =
    bulkSelectedIndices.length > 0
      ? `${indicesToUpdate.length} selected play(s)`
      : `all ${indicesToUpdate.length} play(s)`;

  const mode = await showChoice(
    `Auto-fill defense for ${selectionText} using scouting data from <b>${opp.name}</b> (${opp.plays.length} charted plays).\n\nChoose fill mode:`,
    {
      title: "🎯 Auto-Fill Defense",
      choices: [
        { label: "Fill empty only", value: "empty", icon: "📝" },
        { label: "Overwrite all", value: "overwrite", icon: "🔄" },
        { label: "Cancel", value: "cancel", icon: "✕" },
      ],
    },
  );
  if (!mode || mode === "cancel") return;

  saveScriptState();

  let filled = 0;
  let skipped = 0;
  indicesToUpdate.forEach((i) => {
    const p = script[i];
    if (!p || p.isSeparator) return;

    const look = getBestDefensiveLook(p);
    if (!look) {
      skipped++;
      return;
    }

    const isEmpty = !p.defFront && !p.defCoverage && !p.defBlitz && !p.defStunt;
    if (mode === "empty" && !isEmpty) {
      skipped++;
      return;
    }

    if (look.defFront && (mode === "overwrite" || !p.defFront))
      p.defFront = look.defFront;
    if (look.defCoverage && (mode === "overwrite" || !p.defCoverage))
      p.defCoverage = look.defCoverage;
    if (look.defBlitz && (mode === "overwrite" || !p.defBlitz))
      p.defBlitz = look.defBlitz;
    if (look.defStunt && (mode === "overwrite" || !p.defStunt))
      p.defStunt = look.defStunt;
    filled++;
  });

  renderScript();
  markScriptDirty();
  showToast(
    `🎯 Filled defense for ${filled} play(s) from ${opp.name} scouting${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
  );
}

/**
 * Lightweight stats-only update (no DOM rebuild)
 * Call this instead of renderScript() for non-structural data changes
 */
function updateScriptStats() {
  let playCount = 0,
    totalReps = 0,
    runCount = 0,
    passCount = 0,
    totalTime = 0;
  for (const p of script) {
    if (p.isSeparator) {
      if (p.minutes) totalTime += p.minutes;
    } else {
      playCount++;
      totalReps += p.reps || 1;
      if (p.type === "Run") runCount++;
      else if (p.type === "Pass") passCount++;
    }
  }

  const el = (id) => document.getElementById(id);
  if (el("scriptCount")) el("scriptCount").textContent = playCount;
  if (el("statPlays")) el("statPlays").textContent = playCount;
  if (el("statReps")) el("statReps").textContent = totalReps;
  if (el("statRun")) el("statRun").textContent = runCount;
  if (el("statPass")) el("statPass").textContent = passCount;
  if (el("statTime")) {
    if (totalTime >= 60) {
      const h = Math.floor(totalTime / 60);
      const m = totalTime % 60;
      el("statTime").textContent = `${h}:${String(m).padStart(2, "0")}h`;
    } else {
      el("statTime").textContent = totalTime;
    }
  }
  updateRunPassRatio();
}

/**
 * Render the current script
 */
function renderScript() {
  try {
    const container = document.getElementById("scriptPlays");
    const showWbNums =
      document.getElementById("showWristbandNums")?.checked !== false;
    const showPrintPreview =
      document.getElementById("scriptShowPrintPreview")?.checked || false;

    const hasPlays = script.some((p) => !p.isSeparator);
    if (script.length === 0) {
      container.innerHTML = "";
      container.classList.add("empty");
    } else if (!hasPlays) {
      // Only separators exist (auto-seeded period) — show guided state
      container.classList.remove("empty");
      let periodHeaders = "";
      script.forEach((p, i) => {
        if (!p.isSeparator) return;
        const periodColor = p.color || UI_COLORS.periodDefault;
        periodHeaders += `
        <div class="script-item period-header" style="background: ${periodColor}; color: white;">
          <div class="ph-left">
            <input type="color" class="ph-color-input" value="${periodColor}" data-field="periodColor" data-idx="${i}" title="Period color">
            <input type="text" class="ph-label-input" value="${escapeHtml(p.label)}" data-field="periodLabel" data-idx="${i}" placeholder="Period name">
            <input type="number" class="ph-minutes-input" value="${p.minutes || ""}" data-field="periodMinutes" data-idx="${i}" placeholder="min" title="Time in minutes">
          </div>
          <div class="ph-right">
            <button class="remove" data-action="removeFromScript" data-idx="${i}" style="margin-left: 4px;">✕</button>
          </div>
        </div>
      `;
      });
      container.innerHTML =
        periodHeaders +
        `
      <div class="script-empty-guide">
        <div class="seg-icon">📋</div>
        <div class="seg-text">Add plays from the left panel to start building this period</div>
        <div class="seg-hint">Click <strong>+ Add</strong> on any play, or check multiple and use <strong>Add Selected</strong></div>
      </div>
    `;
    } else {
      container.classList.remove("empty");
      let playNum = 0;

      // Pre-compute scouting datalist options from active opponent (cached)
      let scoutFrontOpts = "";
      let scoutCovOpts = "";
      let scoutBlitzOpts = "";
      let scoutStuntOpts = "";
      const _scoutOpp =
        typeof getActiveOpponent === "function" ? getActiveOpponent() : null;
      const _scoutOppName = _scoutOpp ? _scoutOpp.name : null;
      if (_scoutOpp && _scoutOpp.plays && _scoutOpp.plays.length > 0) {
        // Use cache if same opponent
        if (_cachedScoutOpts && _cachedScoutOppName === _scoutOppName) {
          scoutFrontOpts = _cachedScoutOpts.front;
          scoutCovOpts = _cachedScoutOpts.cov;
          scoutBlitzOpts = _cachedScoutOpts.blitz;
          scoutStuntOpts = _cachedScoutOpts.stunt;
        } else {
          const _scoutResult = queryTendencies(_scoutOpp, {});
          const mapOpts = (arr) =>
            arr
              ? arr
                  .map(
                    (x) =>
                      `<option value="${x.term}">🎯 ${x.term} (${x.pct}%)</option>`,
                  )
                  .join("")
              : "";
          scoutFrontOpts = mapOpts(_scoutResult.topFront);
          scoutCovOpts = mapOpts(_scoutResult.topCoverage);
          scoutBlitzOpts = mapOpts(_scoutResult.topBlitz);
          scoutStuntOpts = mapOpts(_scoutResult.topStunt);
          _cachedScoutOpts = {
            front: scoutFrontOpts,
            cov: scoutCovOpts,
            blitz: scoutBlitzOpts,
            stunt: scoutStuntOpts,
          };
          _cachedScoutOppName = _scoutOppName;
        }
      } else {
        _cachedScoutOpts = null;
        _cachedScoutOppName = null;
      }

      // Track which periods are collapsed for skipping plays
      let currentPeriodId = null;
      let skipPlays = false;

      // Shared datalists — built once, reused by all play rows
      const sharedDatalistsHtml = `
      <datalist id="dl-front-shared">${scoutFrontOpts}</datalist>
      <datalist id="dl-cov-shared">${scoutCovOpts}</datalist>
      <datalist id="dl-stunt-shared">${scoutStuntOpts}</datalist>
      <datalist id="dl-blitz-shared">${scoutBlitzOpts}</datalist>
    `;

      container.innerHTML =
        sharedDatalistsHtml +
        `
      <div class="script-column-headers">
        <div class="sch-spacer"></div>
        <div class="sch-num">#</div>
        <div class="sch-play">Play Call</div>
        <div class="sch-hash">Hash</div>
        <div class="sch-def">Front</div>
        <div class="sch-def">Cov</div>
        <div class="sch-def">Stunt</div>
        <div class="sch-def">Blitz</div>
        <div class="sch-controls">Controls</div>
      </div>
    ` +
        script
          .map((p, i) => {
            if (p.isSeparator) {
              currentPeriodId = p.id;
              skipPlays = collapsedPeriods.has(p.id);
              const isCollapsed = collapsedPeriods.has(p.id);
              const collapseIcon = isCollapsed ? "▶" : "▼";
              const playCount = getPeriodPlays(i).length;
              const periodReps = getPeriodPlays(i).reduce(
                (s, p2) => s + (p2.reps || 1),
                0,
              );
              const timeDisplay = p.minutes ? `${p.minutes} min` : "";
              const periodColor = p.color || UI_COLORS.periodDefault;

              return `
            <div class="period-header-wrapper" data-separator-id="${p.id}" style="border-left: 4px solid ${periodColor};">
              <div class="script-item period-header" style="background: ${periodColor}; color: white;">
                <div class="ph-left">
                  <button class="ph-collapse-btn" data-action="togglePeriodCollapse" data-period-id="${p.id}" title="${isCollapsed ? "Expand" : "Collapse"}">${collapseIcon}</button>
                  <input type="color" class="ph-color-input" value="${periodColor}" data-field="periodColor" data-idx="${i}" title="Period color">
                  <input type="text" class="ph-label-input" value="${escapeHtml(p.label)}" data-field="periodLabel" data-idx="${i}">
                  <input type="number" class="ph-minutes-input" value="${p.minutes || ""}" data-field="periodMinutes" data-idx="${i}" placeholder="min" title="Time in minutes">
                  <span class="ph-meta-span">${playCount} plays • ${periodReps} reps${timeDisplay ? " • " + timeDisplay : ""}</span>
                </div>
                <div class="ph-right">
                  <button class="ph-btn" data-action="movePeriod" data-idx="${i}" data-dir="-1" title="Move period up" aria-label="Move period up">▲</button>
                  <button class="ph-btn" data-action="movePeriod" data-idx="${i}" data-dir="1" title="Move period down" aria-label="Move period down">▼</button>
                  <button class="ph-btn" data-action="duplicatePeriod" data-idx="${i}" title="Duplicate period" aria-label="Duplicate period">⧉</button>
                  <button class="ph-btn" data-action="savePeriodAsTemplate" data-idx="${i}" title="Save as template" aria-label="Save as template">💾</button>
                  <button class="remove" data-action="removeFromScript" data-idx="${i}" style="margin-left: 4px;" aria-label="Delete period">✕</button>
                </div>
              </div>
              ${
                !isCollapsed && playCount > 0
                  ? `
              <div class="period-actions-toolbar">
                <button class="pat-btn" data-action="selectPeriodPlays" data-idx="${i}" title="Select / deselect all plays in this period">☑ Select All</button>
                <button class="pat-btn" data-action="sortPeriod" data-idx="${i}" title="Sort this period by the selected sort field">⬍ Sort</button>
                <button class="pat-btn" data-action="reversePeriod" data-idx="${i}" title="Reverse play order in this period">↕ Reverse</button>
                <button class="pat-btn pat-btn-smart" data-action="openSmartScriptForPeriod" data-idx="${i}" title="Run Smart Script on just this period">🧠 Smart Script</button>
                <button class="pat-btn" data-action="applyPreferredForPeriod" data-idx="${i}" title="Apply preferred metadata to plays in this period">★ Preferred</button>
                <button class="pat-btn pat-btn-callsheet" data-action="pushPeriodToCallSheet" data-idx="${i}" title="Push this period's plays to matching call sheet categories">📋 → Call Sheet</button>
                <button class="pat-btn pat-btn-import-cs" data-action="importFromCallSheet" data-idx="${i}" title="Import plays from call sheet categories into this period">📋 ← Call Sheet</button>
                <button class="pat-btn" data-action="copyPeriodAsText" data-idx="${i}" title="Copy all plays in this period as plain text">📋 Copy Text</button>
              </div>`
                  : ""
              }
            </div>
          `;
            }

            // Skip plays if period is collapsed
            if (skipPlays) {
              return ""; // Return empty, will be filtered out
            }

            playNum++;
            const fullCall = getFullCall(p);

            // Find wristband number if wristband is loaded
            let wbBadge = "";
            if (scriptWristband && showWbNums) {
              const wbNum = findPlayOnWristband(p);
              if (wbNum !== null) {
                wbBadge = `<span class="wb-badge">#${wbNum}</span>`;
              }
            }

            const isSelected = bulkSelectedIndices.includes(i);

            // Build hash options with preferred value
            const hashOptions = buildDefenseOptions(
              ["L", "M", "R"],
              p.preferredHash,
              p.hash,
            );

            return `
          <div class="script-item ${isSelected ? "bulk-selected" : ""}" draggable="true" data-drag="scriptStart" data-idx="${i}" data-drag="end">
            <input type="checkbox" class="bulk-select-cb" data-index="${i}" ${isSelected ? "checked" : ""} data-field="bulkSelect" data-idx="${i}" title="Select for bulk edit">
            <div class="play-num">${playNum}${wbBadge}</div>
            <div class="play-call">
              <div class="full-call">${fullCall}</div>
              <div class="call-meta">${escapeHtml(p.type)} ${p.tempo ? "• " + escapeHtml(p.tempo) : ""}</div>
            </div>
            <div class="hash-input">
              <select data-field="hash" data-idx="${i}" title="Hash">
                ${hashOptions}
              </select>
            </div>
            <div class="defense-inputs">
              <input type="text" list="${p.practiceFront ? `dl-front-${i}` : "dl-front-shared"}" value="${escapeHtml(p.defFront || "")}" placeholder="Front" data-field="defFront" data-idx="${i}" title="Defensive Front" class="def-input">
              ${p.practiceFront ? `<datalist id="dl-front-${i}"><option value="${escapeHtml(p.practiceFront)}">★ ${escapeHtml(p.practiceFront)}</option>${scoutFrontOpts}</datalist>` : ""}
              <input type="text" list="${p.practiceCoverage ? `dl-cov-${i}` : "dl-cov-shared"}" value="${escapeHtml(p.defCoverage || "")}" placeholder="Cov" data-field="defCoverage" data-idx="${i}" title="Coverage" class="def-input">
              ${p.practiceCoverage ? `<datalist id="dl-cov-${i}"><option value="${escapeHtml(p.practiceCoverage)}">★ ${escapeHtml(p.practiceCoverage)}</option>${scoutCovOpts}</datalist>` : ""}
              <input type="text" list="${p.practiceStunt ? `dl-stunt-${i}` : "dl-stunt-shared"}" value="${escapeHtml(p.defStunt || "")}" placeholder="Stunt" data-field="defStunt" data-idx="${i}" title="Stunt" class="def-input">
              ${p.practiceStunt ? `<datalist id="dl-stunt-${i}"><option value="${escapeHtml(p.practiceStunt)}">★ ${escapeHtml(p.practiceStunt)}</option>${scoutStuntOpts}</datalist>` : ""}
              <input type="text" list="${p.practiceBlitz ? `dl-blitz-${i}` : "dl-blitz-shared"}" value="${escapeHtml(p.defBlitz || "")}" placeholder="Blitz" data-field="defBlitz" data-idx="${i}" title="Blitz" class="def-input">
              ${p.practiceBlitz ? `<datalist id="dl-blitz-${i}"><option value="${escapeHtml(p.practiceBlitz)}">★ ${escapeHtml(p.practiceBlitz)}</option>${scoutBlitzOpts}</datalist>` : ""}
            </div>
            <div class="play-controls">
              <div class="move-btns">
                <button class="move-btn" data-action="movePlay" data-idx="${i}" data-dir="-1" aria-label="Move play up">▲</button>
                <button class="move-btn" data-action="movePlay" data-idx="${i}" data-dir="1" aria-label="Move play down">▼</button>
              </div>
              <input type="number" value="${p.reps}" min="1" data-field="reps" data-idx="${i}" title="Reps">
              <input type="text" value="${escapeHtml(p.notes || "")}" placeholder="Notes" data-field="notes" data-idx="${i}">
              <button class="dup-btn" data-action="duplicatePlay" data-idx="${i}" title="Duplicate" aria-label="Duplicate play">⧉</button>
              <button class="remove" data-action="removeFromScript" data-idx="${i}" aria-label="Remove play">✕</button>
            </div>
          </div>
          ${
            showPrintPreview
              ? `
          <div class="print-preview-row">
            <span class="preview-label">Print:</span>
            <span class="preview-field"><b>#${playNum}</b></span>
            <span class="preview-field hash">${escapeHtml(p.hash || "-")}</span>
            <span class="preview-field tempo">${escapeHtml(p.tempo || "-")}</span>
            <span class="preview-field call">${fullCall}</span>
            <span class="preview-field type">${escapeHtml(p.type)}</span>
            <span class="preview-field front">${escapeHtml(p.defFront || "-")}</span>
            <span class="preview-field cov">${escapeHtml(p.defCoverage || "-")}</span>
            <span class="preview-field stunt">${escapeHtml(p.defStunt || "-")}</span>
            <span class="preview-field blitz">${escapeHtml(p.defBlitz || "-")}</span>
            <span class="preview-field reps">×${p.reps}</span>
          </div>
          `
              : ""
          }
        `;
          })
          .join("");
    }

    // Update bulk select UI
    updateBulkSelectUI();

    // Update stats
    updateScriptStats();

    // Populate jump-to-period dropdown
    const jumpSel = document.getElementById("jumpToPeriod");
    if (jumpSel) {
      const periods = script.filter((p) => p.isSeparator);
      if (periods.length > 1) {
        jumpSel.innerHTML =
          `<option value="">⬇ Jump</option>` +
          periods
            .map(
              (p) =>
                `<option value="${p.id}">${escapeHtml(p.label || "Period")}</option>`,
            )
            .join("");
        jumpSel.style.display = "";
      } else {
        jumpSel.style.display = "none";
      }
    }

    // Update undo/redo buttons
    historyManager.updateButtons("script");

    // Refresh tab badge counts
    if (typeof updateTabBadges === "function") updateTabBadges();
  } catch (err) {
    console.error("renderScript error:", err);
    showToast("❌ Error rendering script.", 3000);
  }
}

// RAF-coalesced version: multiple calls within one frame resolve to a single render
const _scheduleRenderScript = createRAFRenderer(renderScript);

/**
 * Clear the current script
 */
async function clearScript() {
  // Don't count it as "has content" if it's just the auto-seeded period
  const hasPlays = script.some((p) => !p.isSeparator);
  if (!hasPlays) return;

  // Snapshot for undo
  const snapshot = safeDeepClone(script);
  const oldName = document.getElementById("scriptName")?.value || "";
  const oldDate = document.getElementById("scriptDate")?.value || "";

  saveScriptState();
  script = [];
  // Reset header fields
  document.getElementById("scriptName").value = "Practice Script";
  const dateEl = document.getElementById("scriptDate");
  if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];
  // Auto-seed a fresh first period
  ensureFirstPeriod();
  renderScript();

  showUndoToast("🗑️ Script cleared", () => {
    script = snapshot;
    document.getElementById("scriptName").value = oldName;
    const dateEl2 = document.getElementById("scriptDate");
    if (dateEl2) dateEl2.value = oldDate;
    renderScript();
    markScriptDirty();
  });
}

/**
 * Shuffle the script randomly
 */
function shuffleScript() {
  const hasPlays = script.some((p) => !p.isSeparator);
  if (!hasPlays) return;

  saveScriptState();

  // Shuffle plays within each period (like sort/reverse do)
  const result = [];
  let currentPeriodPlays = [];

  script.forEach((item) => {
    if (item.isSeparator) {
      if (currentPeriodPlays.length > 0) {
        // Fisher-Yates shuffle
        for (let i = currentPeriodPlays.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [currentPeriodPlays[i], currentPeriodPlays[j]] = [
            currentPeriodPlays[j],
            currentPeriodPlays[i],
          ];
        }
        result.push(...currentPeriodPlays);
        currentPeriodPlays = [];
      }
      result.push(item);
    } else {
      currentPeriodPlays.push(item);
    }
  });

  // Shuffle remaining plays after last separator
  if (currentPeriodPlays.length > 0) {
    for (let i = currentPeriodPlays.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentPeriodPlays[i], currentPeriodPlays[j]] = [
        currentPeriodPlays[j],
        currentPeriodPlays[i],
      ];
    }
    result.push(...currentPeriodPlays);
  }

  script = result;
  renderScript();

  const statusEl = document.getElementById("scriptSortStatus");
  if (statusEl) {
    statusEl.textContent = "\u2713 Shuffled within periods";
    statusEl.className = "text-success";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  }
}

/**
 * Save the current script to localStorage
 */
async function saveScript() {
  try {
    const name = document.getElementById("scriptName").value;
    const date = document.getElementById("scriptDate").value;

    if (!name) {
      showToast("⚠️ Please enter a script name");
      return;
    }

    const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);

    // Check for duplicate name
    const existing = savedScripts.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const choice = await showChoice(
        `A script named "${existing.name}" already exists.`,
        {
          title: "Duplicate Name",
          icon: "⚠️",
          option1: "💾 Overwrite",
          option2: "➕ Save as Copy",
        },
      );
      if (choice === "option1") {
        // Overwrite existing
        existing.name = name;
        existing.date = date;
        existing.plays = safeDeepClone(script);
        existing.savedAt = new Date().toISOString();
        storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
        loadSavedScriptsList();
        markScriptClean();
        storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
        showToast(`✅ "${name}" updated!`);
        return;
      } else if (choice !== "option2") {
        return; // Cancelled
      }
      // else fall through to save as new copy
    }

    const scriptData = {
      id: Date.now(),
      name,
      date,
      period: "",
      tempo: "",
      plays: safeDeepClone(script),
      savedAt: new Date().toISOString(),
    };

    savedScripts.push(scriptData);
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
    loadSavedScriptsList();
    markScriptClean();
    storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
    showToast(`✅ "${name}" saved!`);
  } catch (err) {
    console.error("saveScript error:", err);
    showToast("❌ Error saving script.", 4000);
  }
}

/**
 * Load the list of saved scripts
 */
function loadSavedScriptsList() {
  const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  const container = document.getElementById("savedScriptsList");
  const section = document.getElementById("savedScriptsSection");

  if (savedScripts.length === 0) {
    section.classList.add("hidden");
    document.getElementById("fullDaySection").classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = savedScripts
    .map((s) => {
      const playCount = s.plays.filter((p) => !p.isSeparator).length;
      const periodCount = s.plays.filter((p) => p.isSeparator).length;
      const periods = s.plays
        .filter((p) => p.isSeparator)
        .map((p) => p.label)
        .join(", ");
      const dateStr = s.date
        ? new Date(s.date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "No date";
      const savedTime = s.savedAt
        ? new Date(s.savedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "";
      return `
            <div class="saved-script-card">
                <div class="saved-card-main">
                  <div class="saved-card-title">${escapeHtml(s.name)}</div>
                  <div class="saved-card-meta">
                    <span>📅 ${dateStr}</span>
                    <span>📝 ${playCount} plays</span>
                    ${periodCount > 0 ? `<span>📂 ${periodCount} periods</span>` : ""}
                  </div>
                  ${periods ? `<div class="saved-card-periods">${escapeHtml(periods)}</div>` : ""}
                </div>
                <div class="saved-card-actions">
                    <button class="saved-load-btn" data-action="loadScript" data-sid="${s.id}" title="Load this script">Load</button>
                    <button class="saved-rename-btn" data-action="renameSavedScript" data-sid="${s.id}" title="Rename">✏️</button>
                    <button class="saved-overwrite-btn" data-action="overwriteSavedScript" data-sid="${s.id}" title="Overwrite with current script">⬆️</button>
                    <button class="saved-del-btn" data-action="deleteSavedScript" data-sid="${s.id}" title="Delete">✕</button>
                </div>
            </div>
        `;
    })
    .join("");

  // Also populate the full day section
  loadFullDayScriptList();
}

/**
 * Load a saved script
 * @param {number} id - Script ID
 */
function loadScript(id) {
  try {
    const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
    const scriptData = savedScripts.find((s) => s.id === id);
    if (!scriptData) return;

    document.getElementById("scriptName").value = scriptData.name;
    document.getElementById("scriptDate").value = scriptData.date;
    script = scriptData.plays;

    // Backward compat: if the loaded script has plays but no periods, wrap them in one
    const hasPlays = script.some((p) => !p.isSeparator);
    const hasSeparator = script.some((p) => p.isSeparator);
    if (hasPlays && !hasSeparator) {
      script.unshift({
        isSeparator: true,
        label: scriptData.period || scriptData.name || "Period 1",
        minutes: 0,
        color: UI_COLORS.periodDefault,
        id: Date.now() + Math.random(),
      });
    }

    renderScript();
    markScriptClean();
    storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
    showToast(`Loaded "${scriptData.name}"`);
  } catch (err) {
    console.error("loadScript error:", err);
    showToast("❌ Error loading script.", 4000);
  }
}

/**
 * Delete a saved script
 * @param {number} id - Script ID
 */
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

/**
 * Rename a saved script
 * @param {number} id - Script ID
 */
async function renameSavedScript(id) {
  let savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  const s = savedScripts.find((s) => s.id === id);
  if (!s) return;
  const newName = await showPrompt("Rename script:", s.name, {
    title: "Rename",
    icon: "✏️",
  });
  if (newName && newName.trim()) {
    s.name = newName.trim();
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
    loadSavedScriptsList();
    showToast(`Renamed to "${s.name}"`);
  }
}

/**
 * Overwrite a saved script with the current script contents
 * @param {number} id - Script ID
 */
async function overwriteSavedScript(id) {
  let savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  const s = savedScripts.find((s) => s.id === id);
  if (!s) return;
  const ok = await showConfirm(
    `Overwrite "${s.name}" with the current script?`,
    { title: "Overwrite", icon: "⚠️", confirmText: "Overwrite", danger: true },
  );
  if (!ok) return;

  s.name = document.getElementById("scriptName").value || s.name;
  s.date = document.getElementById("scriptDate").value || s.date;
  s.plays = safeDeepClone(script);
  s.savedAt = new Date().toISOString();
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  loadSavedScriptsList();
  markScriptClean();
  storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
  showToast(`"${s.name}" updated!`);
}

// Wristband integration for Practice Script

/**
 * Populate the wristband select dropdown for script reference
 */
function populateScriptWristbandSelect() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const select = document.getElementById("scriptWristbandSelect");
  if (!select) return;

  select.innerHTML =
    '<option value="">-- No Wristband --</option>' +
    saved
      .map((wb) => {
        const totalPlays = wb.cards
          ? wb.cards.reduce(
              (sum, c) => sum + c.data.filter((p) => p !== null).length,
              0,
            )
          : 0;
        return `<option value="${wb.id}">${escapeHtml(wb.title)} (${totalPlays} plays)</option>`;
      })
      .join("");
}

/**
 * Load a wristband for script reference
 */
function loadWristbandForScript() {
  const select = document.getElementById("scriptWristbandSelect");
  const id = parseInt(select.value, 10);
  const infoDiv = document.getElementById("scriptWristbandInfo");

  if (!id) {
    scriptWristband = null;
    infoDiv.textContent = "";
    renderScript();
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved.find((w) => w.id === id);

  if (wb) {
    scriptWristband = wb;
    const totalPlays = wb.cards
      ? wb.cards.reduce(
          (sum, c) => sum + c.data.filter((p) => p !== null).length,
          0,
        )
      : 0;
    infoDiv.textContent = `Loaded: ${wb.title} • ${wb.cards ? wb.cards.length : 1} card(s) • ${totalPlays} plays`;
    renderScript();
  }
}

/**
 * Find a play on the loaded wristband
 * @param {Object} play - Play object to find
 * @returns {number|null} Cell number (11-50 for card 1, 51-90 for card 2, etc.) or null if not found
 */
function findPlayOnWristband(play) {
  if (!scriptWristband || !scriptWristband.cards) return null;

  // Search through all cards for matching play
  for (let cardIdx = 0; cardIdx < scriptWristband.cards.length; cardIdx++) {
    const card = scriptWristband.cards[cardIdx];
    const cardOffset = cardIdx * 40;
    for (let cellIdx = 0; cellIdx < card.data.length; cellIdx++) {
      const wbPlay = card.data[cellIdx];
      if (wbPlay && playsMatch(play, wbPlay)) {
        // Return the display number (starting at 11, plus card offset)
        return cellIdx + 11 + cardOffset;
      }
    }
  }
  return null;
}

/**
 * Open modal to load plays from a wristband into the script
 */
function openLoadWristbandToScriptModal() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);

  if (saved.length === 0) {
    showToast("No saved wristbands found — create one first");
    return;
  }

  const wristbandOptions = saved
    .map((wb, idx) => {
      const totalPlays = wb.cards
        ? wb.cards.reduce(
            (sum, c) => sum + c.data.filter((p) => p !== null).length,
            0,
          )
        : 0;
      return `<option value="${idx}">${wb.title} (${totalPlays} plays)</option>`;
    })
    .join("");

  const modalHtml = `
    <div id="loadWbToScriptModal" class="modal-overlay" style="display: flex;" data-action="closeLoadWbToScriptModalOverlay">
      <div class="modal-content" style="max-width: 450px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid ${UI_COLORS.borderLight};">
          <h3 style="margin: 0;">➕ Load Wristband Plays to Script</h3>
          <button data-action="closeLoadWbToScriptModal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: ${UI_COLORS.textMuted};">✕</button>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; display: block; margin-bottom: 5px;">Select Wristband:</label>
          <select id="wbToScriptSelect" style="width: 100%; padding: 8px; font-size: 14px;">
            ${wristbandOptions}
          </select>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; display: block; margin-bottom: 5px;">Add to:</label>
          <select id="wbToScriptDestination" style="width: 100%; padding: 8px; font-size: 14px;">
            <option value="new">New Period (from wristband)</option>
            <option value="current">Current Period / End of Script</option>
          </select>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; display: block; margin-bottom: 5px;">Card(s) to load:</label>
          <select id="wbToScriptCards" style="width: 100%; padding: 8px; font-size: 14px;">
            <option value="all">All Cards</option>
            <option value="1">Card 1 Only</option>
            <option value="2">Card 2 Only</option>
            <option value="3">Card 3 Only</option>
            <option value="4">Card 4 Only</option>
            <option value="5">Card 5 Only</option>
          </select>
        </div>
        
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button data-action="executeLoadWbToScript" class="btn btn-primary" style="padding: 10px 20px;">
            ✅ Load Plays
          </button>
          <button data-action="closeLoadWbToScriptModal" class="btn" style="padding: 10px 20px;">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

/**
 * Close the load wristband to script modal
 */
function closeLoadWbToScriptModal(event) {
  if (event && event.target.id !== "loadWbToScriptModal") return;
  const modal = document.getElementById("loadWbToScriptModal");
  if (modal) modal.remove();
}

/**
 * Execute loading wristband plays into script
 */
function executeLoadWbToScript() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wbIdx = parseInt(document.getElementById("wbToScriptSelect").value, 10);
  const destination = document.getElementById("wbToScriptDestination").value;
  const cardChoice = document.getElementById("wbToScriptCards").value;

  if (isNaN(wbIdx) || wbIdx < 0 || wbIdx >= saved.length) {
    showToast("⚠️ Could not load wristband");
    return;
  }
  const wb = saved[wbIdx];
  if (!wb || !wb.cards) {
    showToast("⚠️ Could not load wristband");
    return;
  }

  saveScriptState();

  // Collect plays from selected card(s)
  const playsToAdd = [];
  wb.cards.forEach((card, cardIdx) => {
    if (cardChoice !== "all" && parseInt(cardChoice, 10) !== cardIdx + 1)
      return;

    card.data.forEach((play) => {
      if (play !== null) {
        playsToAdd.push({ ...play });
      }
    });
  });

  if (playsToAdd.length === 0) {
    showToast("⚠️ No plays found in selected card(s)");
    return;
  }

  if (destination === "new") {
    // Add new period header, then all plays
    script.push({
      isSeparator: true,
      label: wb.title || "Wristband",
      minutes: 0,
      color: UI_COLORS.periodDefault,
      id: Date.now() + Math.random(),
    });
    playsToAdd.forEach((play) => script.push(play));
  } else {
    // Add to end of script
    playsToAdd.forEach((play) => script.push(play));
  }

  closeLoadWbToScriptModal();
  renderScript();

  showToast(`✅ Added ${playsToAdd.length} plays from "${wb.title}"`);
}

/**
 * Build an HTML <tr> for a single play in a print table.
 * Shared by generatePDF and printFullDay.
 * @param {Object} p - Play object
 * @param {number} displayNum - Row number to show
 * @param {Object} opts - Display options from getScriptDisplayOptions()
 * @returns {string} HTML table-row string
 */
function buildScriptPlayRow(p, displayNum, opts) {
  const fullCall = getFullCall(p, opts);

  let wbNum = "";
  if (opts.showWbNum && scriptWristband) {
    const num = findPlayOnWristband(p);
    if (num !== null) wbNum = `#${num}`;
  }

  let rowColor = "";
  if (opts.highlightHuddle && p.tempo && p.tempo.toLowerCase() === "huddle") {
    rowColor = `background: ${UI_COLORS.highlightHuddle};`;
  } else if (
    opts.highlightCandy &&
    p.tempo &&
    p.tempo.toLowerCase() === "candy"
  ) {
    rowColor = `background: ${UI_COLORS.highlightCandy};`;
  }

  return `<tr style="${rowColor}">
    <td>${displayNum}</td>
    <td>${escapeHtml(p.hash || "")}</td>
    <td>${escapeHtml(p.tempo || "-")}</td>
    <td><strong>${wbNum}</strong></td>
    <td><strong>${fullCall}</strong></td>
    <td>${escapeHtml(p.type)}</td>
    <td>${escapeHtml(p.defFront || "")}</td>
    <td>${escapeHtml(p.defCoverage || "")}</td>
    <td>${escapeHtml(p.defStunt || "")}</td>
    <td>${escapeHtml(p.defBlitz || "")}</td>
    <td>${p.reps}</td>
    <td>${escapeHtml(p.notes || "")}</td>
  </tr>`;
}

/**
 * Export the active script (non-separator plays) to a CSV file.
 */
function exportScriptCSV() {
  const plays = script.filter((item) => !item.isSeparator);
  if (plays.length === 0) {
    showToast("No plays in script to export.");
    return;
  }

  const headers = [
    "Period",
    "Order",
    "Formation",
    "Protection",
    "Play",
    "Type",
    "Back",
    "Motion",
    "Tempo",
    "Personnel",
    "Reps",
    "Hash",
    "Situation",
    "Down",
    "Distance",
    "Field Position",
    "Def Front",
    "Def Coverage",
    "Def Stunt",
    "Def Blitz",
    "Notes",
  ];

  // Build period labels for each play
  let currentPeriod = "";
  let playOrder = 0;
  const rows = [];
  script.forEach((item) => {
    if (item.isSeparator) {
      currentPeriod = item.label || "Period";
      playOrder = 0;
      return;
    }
    playOrder++;
    const esc = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };
    rows.push([
      esc(currentPeriod),
      playOrder,
      esc(item.formation),
      esc(item.protection),
      esc(item.play),
      esc(item.type),
      esc(item.back),
      esc(item.motion),
      esc(item.tempo),
      esc(item.personnel),
      item.reps ?? 1,
      esc(item.hash),
      esc(item.preferredSituation),
      esc(item.preferredDown),
      esc(item.preferredDistance),
      esc(item.preferredFieldPosition),
      esc(item.defFront),
      esc(item.defCoverage),
      esc(item.defStunt),
      esc(item.defBlitz),
      esc(item.notes),
    ]);
  });

  const csv =
    headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");
  const scriptName =
    document.getElementById("scriptName")?.value || "Practice Script";
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${scriptName.replace(/\s+/g, "_")}_${dateStr}.csv`;

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✅ Exported ${plays.length} plays to ${filename}`);
}

/**
 * Export the entire script as a plain-text file (one period per section).
 */
function exportScriptAsText() {
  if (script.length === 0) {
    showToast("No plays in script to export.");
    return;
  }
  const lines = [];
  const scriptName =
    document.getElementById("scriptName")?.value || "Practice Script";
  const dateStr =
    document.getElementById("scriptDate")?.value ||
    new Date().toISOString().slice(0, 10);
  lines.push(`${scriptName} — ${dateStr}`);
  lines.push("=".repeat(50));
  let playOrder = 0;
  let inPeriod = false;
  script.forEach((item) => {
    if (item.isSeparator) {
      if (inPeriod) lines.push("");
      inPeriod = true;
      playOrder = 0;
      const periodMins = item.minutes ? ` (${item.minutes} min)` : "";
      lines.push(`\n[${item.label || "Period"}]${periodMins}`);
      lines.push("-".repeat(30));
    } else {
      playOrder++;
      const call = getFullCall(item);
      const type = item.type ? ` [${item.type}]` : "";
      const notes = item.notes ? ` — ${item.notes}` : "";
      const reps = (item.reps || 1) > 1 ? ` ×${item.reps}` : "";
      lines.push(
        `${String(playOrder).padStart(3, " ")}. ${call}${type}${reps}${notes}`,
      );
    }
  });
  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${scriptName.replace(/\s+/g, "_")}_${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("✅ Script exported as text file");
}

/**
 * Scroll to a period header by its separator id.
 */
function jumpToPeriod(periodId) {
  if (!periodId) return;
  const el = document.querySelector(`[data-separator-id="${periodId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // Reset select to placeholder after jump
  const sel = document.getElementById("jumpToPeriod");
  if (sel)
    setTimeout(() => {
      sel.value = "";
    }, 300);
}

/**
 * Generate and print the script as PDF
 */
function generatePDF() {
  try {
    const name = document.getElementById("scriptName").value;
    const date = document.getElementById("scriptDate").value;

    // Build title
    const dateStr = date
      ? new Date(date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "";
    document.getElementById("previewTitle").textContent =
      name || "Practice Script";
    document.getElementById("previewMeta").textContent = dateStr;

    // Build period summary
    const periods = script.filter((p) => p.isSeparator);
    const summaryEl = document.getElementById("previewPeriodSummary");
    if (periods.length > 0) {
      const totalPlays = script.filter((p) => !p.isSeparator).length;
      const totalTime = periods.reduce((s, p) => s + (p.minutes || 0), 0);
      summaryEl.innerHTML = `
      <div class="preview-summary-bar">
        <span><strong>${totalPlays}</strong> plays</span>
        <span><strong>${periods.length}</strong> periods</span>
        ${totalTime > 0 ? `<span><strong>${totalTime}</strong> min total</span>` : ""}
      </div>
    `;
    } else {
      summaryEl.innerHTML = "";
    }

    const tbody = document.getElementById("previewBody");
    let periodPlayNum = 0;
    let globalPlayNum = 0;
    let hasPeriods = periods.length > 0;
    const displayOpts = getScriptDisplayOptions();
    tbody.innerHTML = script
      .map((p, i) => {
        if (p.isSeparator) {
          periodPlayNum = 0;
          const periodPlays = getPeriodPlays(i);
          const periodColor = p.color || UI_COLORS.periodDefault;
          const timeStr = p.minutes ? ` • ${p.minutes} min` : "";
          return `<tr class="print-period-header" style="background: ${periodColor}; color: white;">
          <td colspan="12" style="text-align: center; font-weight: bold; font-size: 12px; padding: 6px; letter-spacing: 0.5px;">
            ${escapeHtml(p.label.toUpperCase())}${timeStr} <span style="opacity:0.7;font-weight:normal;font-size:10px;">(${periodPlays.length} plays)</span>
          </td>
        </tr>`;
        }
        periodPlayNum++;
        globalPlayNum++;
        const displayNum = hasPeriods ? periodPlayNum : globalPlayNum;
        return buildScriptPlayRow(p, displayNum, displayOpts);
      })
      .join("");

    document.getElementById("previewContainer").classList.remove("hidden");
    document.getElementById("wristbandPrint").classList.add("hidden");

    // Add print-script class to body for correct print styling
    document.body.classList.add("print-script");

    // Set page size for script (letter size)
    let printStyle = document.getElementById("wristbandPrintStyle");
    if (!printStyle) {
      printStyle = document.createElement("style");
      printStyle.id = "wristbandPrintStyle";
      document.head.appendChild(printStyle);
    }
    printStyle.textContent =
      "@media print { @page { size: letter; margin: 0.5in; } }";

    setTimeout(() => {
      const previewEl = document.getElementById("previewContainer");
      if (typeof showPrintPreview === "function") {
        showPrintPreview(previewEl, () => {
          const restoreTitle = setPrintTitle("Practice Script", name || "");
          window.print();
          setTimeout(() => {
            restoreTitle();
            previewEl.classList.add("hidden");
            document.body.classList.remove("print-script");
          }, 500);
        });
      } else {
        const restoreTitle = setPrintTitle("Practice Script", name || "");
        window.print();
        setTimeout(() => {
          restoreTitle();
          previewEl.classList.add("hidden");
          document.body.classList.remove("print-script");
        }, 500);
      }
    }, 100);
  } catch (err) {
    console.error("generatePDF error:", err);
    showToast("❌ Error generating print preview.", 4000);
  }
}

// Full Day Printing Functions

/**
 * Load the full day script list with checkboxes
 */
function loadFullDayScriptList() {
  const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  const container = document.getElementById("fullDayScriptList");
  const section = document.getElementById("fullDaySection");

  if (savedScripts.length < 2) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = savedScripts
    .map((s, i) => {
      const playCount = s.plays.filter((p) => !p.isSeparator).length;
      const periodCount = s.plays.filter((p) => p.isSeparator).length;
      const periodsStr = s.plays
        .filter((p) => p.isSeparator)
        .map((p) => p.label)
        .join(", ");
      return `
      <label class="full-day-item">
        <input type="checkbox" class="day-script-checkbox" value="${s.id}" data-order="${i}">
        <div class="full-day-item-info">
          <span class="full-day-item-name">${escapeHtml(s.name)}</span>
          <span class="full-day-item-meta">${playCount} plays${periodCount > 0 ? " • " + periodCount + " periods" : ""}${periodsStr ? " (" + escapeHtml(periodsStr) + ")" : ""}</span>
        </div>
      </label>
    `;
    })
    .join("");
}

/**
 * Select all scripts for full day print
 */
function selectAllDayScripts() {
  document
    .querySelectorAll(".day-script-checkbox")
    .forEach((cb) => (cb.checked = true));
}

/**
 * Clear all script selections
 */
function clearDayScripts() {
  document
    .querySelectorAll(".day-script-checkbox")
    .forEach((cb) => (cb.checked = false));
}

/**
 * Print full day - combines selected scripts
 */
async function printFullDay() {
  try {
    const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
    const selectedIds = Array.from(
      document.querySelectorAll(".day-script-checkbox:checked"),
    ).map((cb) => parseInt(cb.value, 10));

    if (selectedIds.length === 0) {
      await showModal("Please select at least one script to print.", {
        title: "Print",
        icon: "🖨️",
      });
      return;
    }

    // Get display options
    const displayOpts = getScriptDisplayOptions();

    // Build combined content
    let allContent = "";
    let globalPlayNum = 0;

    selectedIds.forEach((id, scriptIndex) => {
      const scriptData = savedScripts.find((s) => s.id === id);
      if (!scriptData) return;

      const scriptPlayCount = scriptData.plays.filter(
        (p) => !p.isSeparator,
      ).length;
      const scriptPeriods = scriptData.plays.filter((p) => p.isSeparator);
      const hasPeriods = scriptPeriods.length > 0;
      let periodPlayNum = 0;

      // Add script header — more prominent with play count
      const dateStr = scriptData.date
        ? new Date(scriptData.date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "";
      allContent += `
      <tr class="script-section-header">
        <td colspan="12" style="background: ${UI_COLORS.bgDarkNav}; color: white; font-weight: bold; padding: 10px; text-align: center; font-size: 13px; letter-spacing: 0.5px; border-top: 3px solid ${UI_COLORS.accentBlue};">
          📋 ${escapeHtml(scriptData.name.toUpperCase())} ${dateStr ? "&nbsp;•&nbsp; " + dateStr : ""} <span style="opacity:0.6;font-weight:normal;font-size:11px;">(${scriptPlayCount} plays)</span>
        </td>
      </tr>
    `;

      // Add plays
      scriptData.plays.forEach((p, pIdx) => {
        if (p.isSeparator) {
          periodPlayNum = 0;
          const periodPlays = [];
          for (let j = pIdx + 1; j < scriptData.plays.length; j++) {
            if (scriptData.plays[j].isSeparator) break;
            periodPlays.push(scriptData.plays[j]);
          }
          const periodColor = p.color || UI_COLORS.periodDefault;
          const timeStr = p.minutes ? ` • ${p.minutes} min` : "";
          allContent += `<tr style="background: ${periodColor}; color: white;"><td colspan="12" style="text-align: center; font-weight: bold; padding: 5px; font-size: 11px; letter-spacing: 0.3px;">${escapeHtml(p.label.toUpperCase())}${timeStr} <span style="opacity:0.6;font-weight:normal;">(${periodPlays.length})</span></td></tr>`;
          return;
        }

        globalPlayNum++;
        periodPlayNum++;
        const displayNum = hasPeriods ? periodPlayNum : globalPlayNum;
        allContent += buildScriptPlayRow(p, displayNum, displayOpts);
      });
    });

    // Get current date for header
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    document.getElementById("previewTitle").textContent = "Full Practice Day";
    document.getElementById("previewMeta").textContent = today;

    // Period summary for full day
    const summaryEl = document.getElementById("previewPeriodSummary");
    summaryEl.innerHTML = `
    <div class="preview-summary-bar">
      <span><strong>${selectedIds.length}</strong> scripts</span>
      <span><strong>${globalPlayNum}</strong> total plays</span>
    </div>
  `;

    document.getElementById("previewBody").innerHTML = allContent;

    document.getElementById("previewContainer").classList.remove("hidden");
    document.getElementById("wristbandPrint").classList.add("hidden");
    document.body.classList.add("print-script");

    let printStyle = document.getElementById("wristbandPrintStyle");
    if (!printStyle) {
      printStyle = document.createElement("style");
      printStyle.id = "wristbandPrintStyle";
      document.head.appendChild(printStyle);
    }
    printStyle.textContent =
      "@media print { @page { size: letter; margin: 0.25in; } }";

    setTimeout(() => {
      const restoreTitle = setPrintTitle("Full Practice Day");
      window.print();
      setTimeout(() => {
        restoreTitle();
        document.getElementById("previewContainer").classList.add("hidden");
        document.body.classList.remove("print-script");
      }, 500);
    }, 100);
  } catch (err) {
    console.error("printFullDay error:", err);
    showToast("❌ Error printing full day.", 4000);
  }
}

// =====================
// NEW SCRIPT QoL FEATURES
// =====================

/**
 * Filter script items by search term
 */
function filterScriptItems() {
  const searchTerm =
    document.getElementById("scriptSearchBox")?.value.toLowerCase() || "";
  const items = document.querySelectorAll(
    "#scriptPlays .script-item:not(.period-header)",
  );

  items.forEach((item) => {
    const text = item.textContent.toLowerCase();
    if (searchTerm === "" || text.includes(searchTerm)) {
      item.classList.remove("hidden");
      item.classList.remove("search-hidden");
    } else {
      item.classList.add("hidden");
      item.classList.add("search-hidden");
    }
  });

  // Update inline count (replaces toast)
  const visible = document.querySelectorAll(
    "#scriptPlays .script-item:not(.period-header):not(.search-hidden)",
  ).length;
  const total = items.length;
  const countEl = document.getElementById("scriptSearchCount");
  if (countEl) {
    if (searchTerm) {
      countEl.textContent = `${visible} of ${total}`;
      countEl.style.display = "inline";
    } else {
      countEl.textContent = "";
      countEl.style.display = "none";
    }
  }
}

/**
 * Compare two saved scripts side by side
 */
async function compareScripts() {
  const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);

  if (savedScripts.length < 2) {
    await showModal("Need at least 2 saved scripts to compare.", {
      title: "Compare",
      icon: "📊",
    });
    return;
  }

  const items = savedScripts.map((s, i) => ({ label: s.name, value: i }));
  const idx1 = await showListPicker("Select FIRST script to compare:", items, {
    title: "Compare Scripts",
    icon: "📊",
  });
  if (idx1 === null) return;

  const idx2 = await showListPicker("Select SECOND script to compare:", items, {
    title: "Compare Scripts",
    icon: "📊",
  });
  if (idx2 === null) return;

  if (
    idx1 < 0 ||
    idx1 >= savedScripts.length ||
    idx2 < 0 ||
    idx2 >= savedScripts.length
  ) {
    await showModal("Invalid selection.", { title: "Error", icon: "⚠️" });
    return;
  }

  const s1 = savedScripts[idx1];
  const s2 = savedScripts[idx2];

  const plays1 = s1.plays.filter((p) => !p.isSeparator);
  const plays2 = s2.plays.filter((p) => !p.isSeparator);

  // Find unique to each and common
  const set1 = new Set(plays1.map((p) => `${p.formation}|${p.play}`));
  const set2 = new Set(plays2.map((p) => `${p.formation}|${p.play}`));

  const onlyIn1 = plays1.filter((p) => !set2.has(`${p.formation}|${p.play}`));
  const onlyIn2 = plays2.filter((p) => !set1.has(`${p.formation}|${p.play}`));
  const common = plays1.filter((p) => set2.has(`${p.formation}|${p.play}`));

  // Build comparison report
  let report = `📊 SCRIPT COMPARISON\n\n`;
  report += `"${s1.name}" vs "${s2.name}"\n`;
  report += `${"=".repeat(40)}\n\n`;
  report += `Total Plays: ${plays1.length} vs ${plays2.length}\n`;
  report += `Common: ${common.length}\n`;
  report += `Only in "${s1.name}": ${onlyIn1.length}\n`;
  report += `Only in "${s2.name}": ${onlyIn2.length}\n\n`;

  if (onlyIn1.length > 0) {
    report += `\n--- Only in "${s1.name}" ---\n`;
    onlyIn1
      .slice(0, 10)
      .forEach((p) => (report += `• ${p.formation} ${p.play}\n`));
    if (onlyIn1.length > 10) report += `... and ${onlyIn1.length - 10} more\n`;
  }

  if (onlyIn2.length > 0) {
    report += `\n--- Only in "${s2.name}" ---\n`;
    onlyIn2
      .slice(0, 10)
      .forEach((p) => (report += `• ${p.formation} ${p.play}\n`));
    if (onlyIn2.length > 10) report += `... and ${onlyIn2.length - 10} more\n`;
  }

  await showModal(report, { title: "📊 Script Comparison", icon: "📊" });
}

/**
 * Merge plays from another saved script
 */
async function mergeFromScript() {
  const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);

  if (savedScripts.length === 0) {
    await showModal("No saved scripts to merge from.", {
      title: "Merge",
      icon: "🔀",
    });
    return;
  }

  const items = savedScripts.map((s, i) => ({
    label: s.name,
    sublabel: `${s.plays.filter((p) => !p.isSeparator).length} plays`,
    value: i,
  }));
  const idx = await showListPicker(
    "Select script to merge plays FROM:",
    items,
    { title: "Merge From Script", icon: "🔀" },
  );
  if (idx === null) return;

  if (idx < 0 || idx >= savedScripts.length) {
    await showModal("Invalid selection.", { title: "Error", icon: "⚠️" });
    return;
  }

  const sourceScript = savedScripts[idx];
  const sourcePlays = sourceScript.plays.filter((p) => !p.isSeparator);

  const mergeChoice = await showChoice(
    `Merge options for "${sourceScript.name}" (${sourcePlays.length} plays):`,
    {
      title: "Merge Options",
      icon: "🔀",
      option1: `Merge ALL (${sourcePlays.length})`,
      option2: "Only unique plays",
    },
  );
  if (!mergeChoice) return;

  saveScriptState();

  let playsToAdd = [];
  if (mergeChoice === "option1") {
    playsToAdd = sourcePlays;
  } else if (mergeChoice === "option2") {
    const currentSet = new Set(
      script
        .filter((p) => !p.isSeparator)
        .map((p) => `${p.formation}|${p.play}`),
    );
    playsToAdd = sourcePlays.filter(
      (p) => !currentSet.has(`${p.formation}|${p.play}`),
    );
  } else {
    return;
  }

  // Add plays with new IDs
  playsToAdd.forEach((p) => {
    script.push({
      ...p,
      id: Date.now() + Math.random(),
    });
  });

  renderScript();
  showToast(`Merged ${playsToAdd.length} plays from "${sourceScript.name}"`);
}

/**
 * Auto-balance script for run/pass ratio
 */
/**
 * Copy a period's plays to clipboard as text
 */
async function copyPeriodToClipboard() {
  const separators = script
    .map((p, i) => ({ ...p, idx: i }))
    .filter((p) => p.isSeparator);

  if (separators.length === 0) {
    await showModal("No periods in script.", {
      title: "Copy Period",
      icon: "📋",
    });
    return;
  }

  const items = separators.map((s, i) => ({ label: s.label, value: i }));
  const pickedIdx = await showListPicker("Select period to copy:", items, {
    title: "Copy Period",
    icon: "📋",
  });
  if (pickedIdx === null) return;

  if (pickedIdx < 0 || pickedIdx >= separators.length) {
    await showModal("Invalid selection.", { title: "Error", icon: "⚠️" });
    return;
  }

  const separator = separators[pickedIdx];
  const periodPlays = getPeriodPlays(separator.idx);

  let text = `${separator.label}\n`;
  text += `${"=".repeat(separator.label.length)}\n`;
  periodPlays.forEach((p, i) => {
    text += `${i + 1}. ${p.formation} ${p.protection || ""} ${p.play}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ${periodPlays.length} plays from "${separator.label}"`);
  });
}

/**
 * Initialize keyboard shortcuts for script
 */
function initScriptKeyboard() {
  const container = document.getElementById("scriptPlays");
  if (!container) return;

  // Make container focusable
  container.setAttribute("tabindex", "0");

  container.addEventListener("keydown", (e) => {
    // Delete key to remove selected items
    if (e.key === "Delete" || e.key === "Backspace") {
      if (bulkSelectedIndices.length > 0) {
        e.preventDefault();
        showConfirm(`Delete ${bulkSelectedIndices.length} selected plays?`, {
          title: "Delete Plays",
          icon: "🗑️",
          confirmText: "Delete",
          danger: true,
        }).then((ok) => {
          if (ok) {
            saveScriptState();
            // Remove in reverse order to maintain indices
            bulkSelectedIndices
              .sort((a, b) => b - a)
              .forEach((idx) => {
                script.splice(idx, 1);
              });
            bulkSelectedIndices = [];
            renderScript();
          }
        });
      }
    }
  });

  // Escape clears the script search box and available plays search
  ["scriptSearchBox", "scriptSearchPlay"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && input.value) {
        e.preventDefault();
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (id === "scriptSearchBox") filterScriptItems();
        else {
          filterScriptPlays();
          const clearBtn = document.getElementById("clearSearchPlay");
          if (clearBtn) clearBtn.style.display = "none";
        }
      }
    });
  });
}

// ========================
// SMART SCRIPT
// ========================

/**
 * Normalize hash strings to Left/Middle/Right
 */
function normalizeHash(h) {
  if (!h) return "";
  const s = h.trim().toLowerCase();
  if (s.startsWith("l")) return "Left";
  if (s.startsWith("r")) return "Right";
  if (s.startsWith("m")) return "Middle";
  return "";
}

/**
 * Infer the resulting hash from a hit chart value.
 * Direction at START → pass play (e.g., "Right short", "Left deep", "Middle")
 * Direction at END   → run play  (e.g., "off tackle right", "power left", "dive middle")
 * No direction       → unknown, no flow info
 * Returns { hash: "Left"|"Middle"|"Right"|"", isRun: boolean }
 */
function inferHashFromHitChart(play) {
  // Look at hit charts for whichever key players exist
  const charts = [play.hitChart1, play.hitChart2, play.hitChart3].filter(
    Boolean,
  );
  if (charts.length === 0) return { hash: "", isRun: false };
  // Use the first available hit chart (primary key player)
  const hc = charts[0].trim();
  const lower = hc.toLowerCase();
  const words = lower.split(/\s+/);
  const first = words[0] || "";
  const last = words[words.length - 1] || "";

  // Direction at START → pass play
  if (first === "left" || first === "l") return { hash: "Left", isRun: false };
  if (first === "right" || first === "r")
    return { hash: "Right", isRun: false };
  if (first === "middle" || first === "m")
    return { hash: "Middle", isRun: false };

  // Direction at END → run play
  if (last === "left" || last === "l") return { hash: "Left", isRun: true };
  if (last === "right" || last === "r") return { hash: "Right", isRun: true };
  if (last === "middle" || last === "m") return { hash: "Middle", isRun: true };

  // No direction found — run play but no directional info
  return { hash: "", isRun: true };
}

/**
 * Get the Smart Script configuration from the modal UI
 */
function getSmartScriptConfig() {
  return {
    hashFlow: {
      enabled: document.getElementById("ssRuleHashFlow").checked,
      weight: parseInt(document.getElementById("ssWeightHashFlow").value, 10),
    },
    downProgression: {
      enabled: document.getElementById("ssRuleDownProgression").checked,
      weight: parseInt(document.getElementById("ssWeightDownProg").value, 10),
      cycle: parseInt(document.getElementById("ssDownCycle").value, 10),
      targetDown: document.getElementById("ssDownTarget").value,
    },
    typeVariety: {
      enabled: document.getElementById("ssRuleTypeVariety").checked,
      weight: parseInt(
        document.getElementById("ssWeightTypeVariety").value,
        10,
      ),
    },
    personnelCluster: {
      enabled: document.getElementById("ssRulePersonnelCluster").checked,
      weight: parseInt(document.getElementById("ssWeightPersonnel").value, 10),
    },
    tempoVariety: {
      enabled: document.getElementById("ssRuleTempoVariety").checked,
      weight: parseInt(document.getElementById("ssWeightTempo").value, 10),
    },
    formationSpread: {
      enabled: document.getElementById("ssRuleFormationSpread").checked,
      weight: parseInt(document.getElementById("ssWeightFormation").value, 10),
    },
    startHash: {
      enabled: document.getElementById("ssRuleStartHash").checked,
      hash: document.getElementById("ssStartHash").value,
    },
    runPassBalance: {
      enabled: document.getElementById("ssRuleRunPassBal").checked,
      weight: parseInt(document.getElementById("ssWeightRunPassBal").value, 10),
      targetRunPct: parseInt(document.getElementById("ssRunPct").value, 10),
    },
    constraintPairing: {
      enabled: document.getElementById("ssRuleConstraint").checked,
      weight: parseInt(document.getElementById("ssWeightConstraint").value, 10),
    },
  };
}

/**
 * Classify a play type as "run" or "pass" for R/P balance tracking.
 * Returns "run", "pass", or "either" for ambiguous types.
 */
function classifyRunPass(type) {
  if (!type) return "either";
  const t = type.toLowerCase().trim();
  if (t === "run") return "run";
  if (t === "option") return "run";
  if (t === "drop" || t === "dropback") return "pass";
  if (t === "quick" || t === "quick game") return "pass";
  if (t === "screen") return "pass";
  if (t === "play action" || t === "play pass") return "pass";
  if (t === "movement") return "pass";
  if (t === "rpo") return "either";
  if (t === "tricks" || t === "trick") return "either";
  return "either";
}

/**
 * Check if two plays are constraint-linked.
 * Returns true if playA lists playB (or vice versa) in constraint1/2/3.
 */
function areConstraintLinked(playA, playB) {
  if (!playA || !playB) return false;
  const aConstraints = [playA.constraint1, playA.constraint2, playA.constraint3]
    .filter(Boolean)
    .map((c) => c.toLowerCase().trim());
  const bConstraints = [playB.constraint1, playB.constraint2, playB.constraint3]
    .filter(Boolean)
    .map((c) => c.toLowerCase().trim());
  const aPlay = (playA.play || "").toLowerCase().trim();
  const bPlay = (playB.play || "").toLowerCase().trim();
  const aBase = (playA.basePlay || "").toLowerCase().trim();
  const bBase = (playB.basePlay || "").toLowerCase().trim();

  // Does B appear in A's constraints?
  if (
    aConstraints.length > 0 &&
    (aConstraints.includes(bPlay) || aConstraints.includes(bBase))
  )
    return true;
  // Does A appear in B's constraints?
  if (
    bConstraints.length > 0 &&
    (bConstraints.includes(aPlay) || bConstraints.includes(aBase))
  )
    return true;
  return false;
}

/**
 * Score how well a candidate play fits at position `pos` in the sequence
 * given the plays already placed before it.
 * Also returns a breakdown object when config._returnBreakdown is set.
 */
function scoreCandidate(candidate, pos, placed, config) {
  let score = 0;
  const breakdown = {};
  const prev = placed.length > 0 ? placed[placed.length - 1] : null;

  // ── Rule 1: Hash Flow ──
  if (config.hashFlow.enabled && prev) {
    const prevHit = inferHashFromHitChart(prev);
    const candidateHash = normalizeHash(candidate.preferredHash);
    let prevResultHash =
      prevHit.hash ||
      normalizeHash(prev.preferredHash) ||
      normalizeHash(prev.hash) ||
      "";
    let hashScore = 0;
    if (prevResultHash && candidateHash) {
      if (prevResultHash === candidateHash) {
        hashScore = config.hashFlow.weight * 10;
      } else if (prevResultHash === "Middle" || candidateHash === "Middle") {
        hashScore = config.hashFlow.weight * 4;
      }
    } else if (prevResultHash && !candidateHash) {
      hashScore = config.hashFlow.weight * 2;
    }
    score += hashScore;
    breakdown.hashFlow = hashScore;
  }

  // ── Rule 1b: Starting Hash ──
  if (config.startHash.enabled && placed.length === 0) {
    const candidateHash = normalizeHash(candidate.preferredHash);
    let startScore = 0;
    if (candidateHash === config.startHash.hash) {
      startScore = 15;
    } else if (candidateHash === "Middle") {
      startScore = 5;
    }
    score += startScore;
    breakdown.startHash = startScore;
  }

  // ── Rule 2: Down Progression ──
  if (config.downProgression.enabled) {
    const posInSequence = placed.length + 1;
    const isTargetPosition = posInSequence % config.downProgression.cycle === 0;
    let downScore = 0;
    if (isTargetPosition) {
      const candDown = (candidate.preferredDown || "").toString().trim();
      if (candDown === config.downProgression.targetDown) {
        downScore = config.downProgression.weight * 10;
      } else if (candDown === "") {
        downScore = config.downProgression.weight * 2;
      }
    }
    score += downScore;
    breakdown.downProg = downScore;
  }

  // ── Rule 3: Play Type Variety (now run vs pass aware) ──
  if (config.typeVariety.enabled && prev) {
    const prevType = (prev.type || "").toLowerCase();
    const candType = (candidate.type || "").toLowerCase();
    let typeScore = 0;
    if (prevType === candType) {
      typeScore -= config.typeVariety.weight * 6;
    } else {
      // Bonus is larger if switching run/pass category
      const prevRP = classifyRunPass(prev.type);
      const candRP = classifyRunPass(candidate.type);
      if (prevRP !== "either" && candRP !== "either" && prevRP !== candRP) {
        typeScore += config.typeVariety.weight * 5; // R↔P switch bonus
      } else {
        typeScore += config.typeVariety.weight * 3;
      }
    }
    // Extra penalty for 3 in a row of the exact same type
    if (placed.length >= 2) {
      const prevPrev = placed[placed.length - 2];
      if (
        (prevPrev.type || "").toLowerCase() === prevType &&
        prevType === candType
      ) {
        typeScore -= config.typeVariety.weight * 10;
      }
    }
    score += typeScore;
    breakdown.typeVariety = typeScore;
  }

  // ── Rule 4: Personnel Clustering ──
  if (config.personnelCluster.enabled && prev) {
    const prevPers = (prev.personnel || "").toLowerCase();
    const candPers = (candidate.personnel || "").toLowerCase();
    let persScore = 0;
    if (prevPers === candPers) {
      persScore = config.personnelCluster.weight * 5;
    }
    score += persScore;
    breakdown.personnel = persScore;
  }

  // ── Rule 5: Tempo Variety ──
  if (config.tempoVariety.enabled && prev) {
    const prevTempo = (prev.tempo || "").toLowerCase();
    const candTempo = (candidate.tempo || "").toLowerCase();
    let tempoScore = 0;
    if (prevTempo === candTempo) {
      tempoScore -= config.tempoVariety.weight * 4;
    } else {
      tempoScore += config.tempoVariety.weight * 2;
    }
    score += tempoScore;
    breakdown.tempo = tempoScore;
  }

  // ── Rule 6: Formation Spread ──
  if (config.formationSpread.enabled && prev) {
    const prevForm = (prev.formation || "").toLowerCase();
    const candForm = (candidate.formation || "").toLowerCase();
    let formScore = 0;
    if (prevForm === candForm) {
      formScore -= config.formationSpread.weight * 5;
    } else {
      formScore += config.formationSpread.weight * 2;
    }
    score += formScore;
    breakdown.formation = formScore;
  }

  // ── Rule 7: Run/Pass Balance ──
  if (
    config.runPassBalance &&
    config.runPassBalance.enabled &&
    placed.length > 0
  ) {
    const targetRunPct = (config.runPassBalance.targetRunPct || 50) / 100;
    const candRP = classifyRunPass(candidate.type);
    let rpScore = 0;
    if (candRP !== "either") {
      // Count runs and passes so far
      let runs = 0,
        passes = 0;
      placed.forEach((p) => {
        const rp = classifyRunPass(p.type);
        if (rp === "run") runs++;
        else if (rp === "pass") passes++;
      });
      const total = runs + passes;
      if (total > 0) {
        const currentRunPct = runs / total;
        // Reward the candidate if it pushes us TOWARD the target ratio
        if (candRP === "run" && currentRunPct < targetRunPct) {
          rpScore = config.runPassBalance.weight * 6; // Need more runs
        } else if (candRP === "pass" && currentRunPct > targetRunPct) {
          rpScore = config.runPassBalance.weight * 6; // Need more passes
        } else if (candRP === "run" && currentRunPct > targetRunPct + 0.15) {
          rpScore = -(config.runPassBalance.weight * 4); // Too run-heavy
        } else if (candRP === "pass" && currentRunPct < targetRunPct - 0.15) {
          rpScore = -(config.runPassBalance.weight * 4); // Too pass-heavy
        }
      }
    }
    score += rpScore;
    breakdown.runPassBal = rpScore;
  }

  // ── Rule 8: Constraint Pairing ──
  if (config.constraintPairing && config.constraintPairing.enabled && prev) {
    let cpScore = 0;
    if (areConstraintLinked(prev, candidate)) {
      cpScore = config.constraintPairing.weight * 8; // Strong bonus for running constraint off parent
    }
    // Also check 2-back for nearby scheduling
    if (
      placed.length >= 2 &&
      areConstraintLinked(placed[placed.length - 2], candidate)
    ) {
      cpScore = Math.max(cpScore, config.constraintPairing.weight * 5);
    }
    score += cpScore;
    breakdown.constraint = cpScore;
  }

  if (config._returnBreakdown) {
    return { score, breakdown };
  }
  return score;
}

/**
 * Run the Smart Script algorithm on an array of plays.
 * Uses greedy best-first with 2-play lookahead and randomized tiebreaking.
 */
function runSmartScript(plays, config) {
  const remaining = [...plays];
  const result = [];
  const useLookahead = plays.length <= 80; // disable lookahead for very large scripts (perf)
  const TIE_THRESHOLD = 3; // scores within this range are considered "tied"

  for (let i = 0; i < plays.length; i++) {
    let scored = [];

    for (let j = 0; j < remaining.length; j++) {
      let s = scoreCandidate(remaining[j], i, result, config);
      if (typeof s === "object") s = s.score; // if breakdown mode

      // 2-play lookahead: "if I pick this candidate, what's the best score I can get next?"
      if (useLookahead && remaining.length > 1 && i < plays.length - 1) {
        const hypothetical = [...result, remaining[j]];
        let bestNext = -Infinity;
        for (let k = 0; k < remaining.length; k++) {
          if (k === j) continue;
          let ns = scoreCandidate(remaining[k], i + 1, hypothetical, config);
          if (typeof ns === "object") ns = ns.score;
          if (ns > bestNext) bestNext = ns;
        }
        s += bestNext * 0.35; // weight lookahead at 35% of immediate score
      }

      scored.push({ idx: j, score: s });
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // Randomized tiebreaking: collect all candidates within TIE_THRESHOLD of the best
    const bestScore = scored[0].score;
    const tiedCandidates = scored.filter(
      (c) => c.score >= bestScore - TIE_THRESHOLD,
    );

    // Pick randomly among tied candidates
    const pick =
      tiedCandidates[Math.floor(Math.random() * tiedCandidates.length)];

    result.push(remaining[pick.idx]);
    remaining.splice(pick.idx, 1);
  }

  return result;
}

/**
 * Open the Smart Script modal
 */
async function openSmartScript() {
  const plays = script.filter((p) => !p.isSeparator);
  if (plays.length < 2) {
    await showModal("Add at least 2 plays to the script to use Smart Script.", {
      title: "Smart Script",
      icon: "🧠",
    });
    return;
  }

  smartScriptTargetPeriod = null; // All periods

  const modal = document.getElementById("smartScriptModal");
  modal.classList.add("show");

  // Reset title to default
  const titleEl =
    modal.querySelector("h3") || modal.querySelector(".modal-title");
  if (titleEl) {
    titleEl.textContent = "\ud83e\udde0 Smart Script";
  }

  // Wire up weight display updaters
  [
    "HashFlow",
    "DownProg",
    "TypeVariety",
    "Personnel",
    "Tempo",
    "Formation",
    "RunPassBal",
    "Constraint",
  ].forEach((name) => {
    const slider = document.getElementById("ssWeight" + name);
    const display = document.getElementById("ssWeight" + name + "Val");
    if (slider && display) {
      slider.oninput = () => {
        display.textContent = slider.value;
      };
    }
  });

  // Wire up run % display
  const runPctSlider = document.getElementById("ssRunPct");
  const runPctDisplay = document.getElementById("ssRunPctVal");
  if (runPctSlider && runPctDisplay) {
    runPctSlider.oninput = () => {
      runPctDisplay.textContent = runPctSlider.value + "%";
    };
  }

  // Clear any previous preview
  document.getElementById("smartScriptPreview").innerHTML = "";
}

/**
 * Close the Smart Script modal
 */
function closeSmartScript() {
  document.getElementById("smartScriptModal").classList.remove("show");
  smartScriptTargetPeriod = null;
  // Restore default title
  const modal = document.getElementById("smartScriptModal");
  const titleEl =
    modal.querySelector("h3") || modal.querySelector(".modal-title");
  if (titleEl) titleEl.textContent = "\ud83e\udde0 Smart Script";
}

/**
 * Preview the Smart Script result without applying
 */
function previewSmartScript() {
  const config = getSmartScriptConfig();

  // Collect plays (within periods) — scope to target period if set
  let periods = getScriptPeriods();
  if (smartScriptTargetPeriod !== null) {
    const targetSep = script[smartScriptTargetPeriod];
    periods = periods.filter(
      (p) => p.separator && p.separator.id === targetSep.id,
    );
  }
  const previewEl = document.getElementById("smartScriptPreview");
  let html =
    '<table class="smart-preview-table"><thead><tr><th>#</th><th>Hash</th><th>Type</th><th>R/P</th><th>Formation</th><th>Play</th><th>Personnel</th><th>Down</th><th>Flow</th><th>Score</th></tr></thead><tbody>';
  let num = 1;

  periods.forEach((period) => {
    if (period.separator) {
      html += `<tr style="background:${UI_COLORS.bgDarkNav};color:white;font-weight:600;"><td colspan="10">${period.separator.label || "Period"}</td></tr>`;
    }
    const sorted = runSmartScript(period.plays, config);

    // Now score each play again with breakdown for display
    const breakdownConfig = { ...config, _returnBreakdown: true };
    let flowHash = config.startHash.enabled ? config.startHash.hash : "";
    let runs = 0,
      passes = 0;

    sorted.forEach((p, i) => {
      const hash = normalizeHash(p.preferredHash) || "-";
      const hitResult = inferHashFromHitChart(p);
      const rp = classifyRunPass(p.type);
      if (rp === "run") runs++;
      else if (rp === "pass") passes++;
      const rpLabel = rp === "run" ? "🏃R" : rp === "pass" ? "🏈P" : "~";

      let arrow = "";
      if (hitResult.hash) {
        arrow = hitResult.isRun
          ? `🏃 ${hitResult.hash}`
          : `🏈 → ${hitResult.hash}`;
        flowHash = hitResult.hash;
      }

      // Get score breakdown for this play in its position
      const placedBefore = sorted.slice(0, i);
      const result = scoreCandidate(p, i, placedBefore, breakdownConfig);
      const scoreVal = typeof result === "object" ? result.score : result;
      const bd = typeof result === "object" ? result.breakdown : {};

      // Build tooltip showing score breakdown
      const parts = [];
      if (bd.hashFlow) parts.push("Hash:" + bd.hashFlow);
      if (bd.startHash) parts.push("Start:" + bd.startHash);
      if (bd.downProg) parts.push("Down:" + bd.downProg);
      if (bd.typeVariety) parts.push("Type:" + bd.typeVariety);
      if (bd.personnel) parts.push("Pers:" + bd.personnel);
      if (bd.tempo) parts.push("Tempo:" + bd.tempo);
      if (bd.formation) parts.push("Form:" + bd.formation);
      if (bd.runPassBal) parts.push("R/P:" + bd.runPassBal);
      if (bd.constraint) parts.push("Constr:" + bd.constraint);
      const tooltip = parts.length > 0 ? parts.join(" | ") : "—";

      const scoreColor =
        scoreVal > 0
          ? UI_COLORS.scoreGreen
          : scoreVal < 0
            ? UI_COLORS.scoreRed
            : UI_COLORS.textLight;

      html += `<tr>
        <td>${num++}</td>
        <td>${escapeHtml(hash)}</td>
        <td>${escapeHtml(p.type || "")}</td>
        <td>${rpLabel}</td>
        <td>${escapeHtml(p.formation || "")}</td>
        <td>${escapeHtml(p.play || "")}</td>
        <td>${escapeHtml(p.personnel || "")}</td>
        <td>${escapeHtml(p.preferredDown || "-")}</td>
        <td class="hash-arrow">${arrow}</td>
        <td title="${escapeHtml(tooltip)}" style="color:${scoreColor};cursor:help;font-weight:600;">${scoreVal > 0 ? "+" : ""}${scoreVal}</td>
      </tr>`;
    });

    // Show R/P summary for this period
    const total = runs + passes;
    if (total > 0) {
      const runPct = Math.round((runs / total) * 100);
      html += `<tr style="background:${UI_COLORS.bgDarkNav};color:#aaa;font-size:0.85em;"><td colspan="10">📊 Period R/P: ${runs}R / ${passes}P (${runPct}% run)</td></tr>`;
    }
  });

  html += "</tbody></table>";
  previewEl.innerHTML = html;
}

/**
 * Apply the Smart Script reorder
 */
function applySmartScript() {
  saveScriptState();
  const config = getSmartScriptConfig();

  if (smartScriptTargetPeriod !== null) {
    // Single-period mode — reorder only the targeted period in-place
    const sepIdx = smartScriptTargetPeriod;
    let endIdx = sepIdx + 1;
    while (endIdx < script.length && !script[endIdx].isSeparator) endIdx++;
    const periodPlays = script.slice(sepIdx + 1, endIdx);
    const sorted = runSmartScript(periodPlays, config);

    // Apply hash flow + defense fields
    let currentHash = config.startHash.enabled ? config.startHash.hash : "";
    let hasFlowData = config.startHash.enabled;
    sorted.forEach((p) => {
      const hitResult = inferHashFromHitChart(p);
      const prefHash = normalizeHash(p.preferredHash);
      if (hasFlowData && currentHash) {
        p.hash = currentHash.charAt(0);
      } else if (prefHash) {
        p.hash = prefHash.charAt(0);
      }
      if (p.practiceFront) p.defFront = p.practiceFront;
      if (p.practiceCoverage) p.defCoverage = p.practiceCoverage;
      if (p.practiceStunt) p.defStunt = p.practiceStunt;
      if (p.practiceBlitz) p.defBlitz = p.practiceBlitz;
      if (hitResult.hash) {
        currentHash = hitResult.hash;
        hasFlowData = true;
      } else {
        hasFlowData = false;
      }
    });

    // Splice sorted plays back in
    script.splice(sepIdx + 1, endIdx - sepIdx - 1, ...sorted);

    const periodLabel = script[sepIdx].label || "Period";
    renderScript();
    closeSmartScript();
    const statusEl = document.getElementById("scriptSortStatus");
    if (statusEl) {
      statusEl.textContent = `\u2713 Smart Script applied to ${periodLabel}`;
      statusEl.className = "text-accent";
      setTimeout(() => {
        statusEl.textContent = "";
      }, AUTOSAVE_DEBOUNCE_MS);
    }
    return;
  }

  // All-periods mode
  const periods = getScriptPeriods();

  // Rebuild script
  const newScript = [];
  periods.forEach((period) => {
    if (period.separator) {
      newScript.push(period.separator);
    }
    const sorted = runSmartScript(period.plays, config);

    // Apply hash based on flow AND fill in practice defense fields
    let currentHash = config.startHash.enabled ? config.startHash.hash : "";
    let hasFlowData = config.startHash.enabled; // only true if we have a real starting point
    sorted.forEach((p) => {
      const hitResult = inferHashFromHitChart(p);
      const prefHash = normalizeHash(p.preferredHash);

      // Set hash: only override from flow when we have actual hit chart data driving it
      if (hasFlowData && currentHash) {
        p.hash = currentHash.charAt(0); // L, M, R
      } else if (prefHash) {
        // Fall back to the play's own preferred hash
        p.hash = prefHash.charAt(0);
      }

      // Apply practice defense fields from metadata
      if (p.practiceFront) p.defFront = p.practiceFront;
      if (p.practiceCoverage) p.defCoverage = p.practiceCoverage;
      if (p.practiceStunt) p.defStunt = p.practiceStunt;
      if (p.practiceBlitz) p.defBlitz = p.practiceBlitz;

      // Update current hash based on hit chart for next play
      if (hitResult.hash) {
        currentHash = hitResult.hash;
        hasFlowData = true; // now we have real flow data
      } else {
        // No hit chart — flow chain breaks, fall back to preferred hashes
        hasFlowData = false;
      }
      newScript.push(p);
    });
  });

  script = newScript;
  renderScript();
  closeSmartScript();

  // Show feedback
  const statusEl = document.getElementById("scriptSortStatus");
  if (statusEl) {
    statusEl.textContent = "✓ Smart Script applied";
    statusEl.className = "text-accent";
    setTimeout(() => {
      statusEl.textContent = "";
    }, AUTOSAVE_DEBOUNCE_MS);
  }
}

/**
 * Helper: break the script into periods (groups of plays between separators)
 */
function getScriptPeriods() {
  const periods = [];
  let current = { separator: null, plays: [] };

  script.forEach((item) => {
    if (item.isSeparator) {
      if (current.plays.length > 0 || current.separator) {
        periods.push(current);
      }
      current = { separator: item, plays: [] };
    } else {
      current.plays.push(item);
    }
  });

  if (current.plays.length > 0 || current.separator) {
    periods.push(current);
  }

  return periods;
}
