// Practice Script Builder functionality

// Cached scouting options — invalidated when opponent or tendencies data changes
let _cachedScoutOpts = null;
let _cachedScoutOppName = null;

/** Call this to force scouting options to recompute on next render */
function invalidateScoutCache() {
  _cachedScoutOpts = null;
  _cachedScoutOppName = null;
}

function announceScriptA11y(message) {
  const announcer = document.getElementById("liveAnnouncer");
  if (!announcer || !message) return;

  announcer.textContent = "";
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

function buildSharedPreferredDatalistMarkup(prefix, values, sharedOptionsHtml) {
  const idsByValue = new Map();
  let html = "";
  let nextIndex = 0;

  values.forEach((value) => {
    const normalizedValue = (value || "").trim();
    if (!normalizedValue || idsByValue.has(normalizedValue)) return;

    const listId = `dl-${prefix}-pref-${nextIndex++}`;
    idsByValue.set(normalizedValue, listId);
    html += `<datalist id="${listId}"><option value="${escapeHtml(normalizedValue)}">★ ${escapeHtml(normalizedValue)}</option>${sharedOptionsHtml}</datalist>`;
  });

  return { idsByValue, html };
}

function getScriptScoutingDatalistOptions() {
  let front = "";
  let cov = "";
  let blitz = "";
  let stunt = "";

  const activeOpponent =
    typeof getActiveOpponent === "function" ? getActiveOpponent() : null;
  const activeOpponentName = activeOpponent ? activeOpponent.name : null;

  if (activeOpponent && activeOpponent.plays && activeOpponent.plays.length > 0) {
    if (_cachedScoutOpts && _cachedScoutOppName === activeOpponentName) {
      front = _cachedScoutOpts.front;
      cov = _cachedScoutOpts.cov;
      blitz = _cachedScoutOpts.blitz;
      stunt = _cachedScoutOpts.stunt;
    } else {
      const scoutResult = queryTendencies(activeOpponent, {});
      const mapOpts = (arr) =>
        arr
          ? arr
            .map(
              (x) => `<option value="${x.term}">🎯 ${x.term} (${x.pct}%)</option>`,
            )
            .join("")
          : "";

      front = mapOpts(scoutResult.topFront);
      cov = mapOpts(scoutResult.topCoverage);
      blitz = mapOpts(scoutResult.topBlitz);
      stunt = mapOpts(scoutResult.topStunt);

      _cachedScoutOpts = { front, cov, blitz, stunt };
      _cachedScoutOppName = activeOpponentName;
    }
  } else {
    _cachedScoutOpts = null;
    _cachedScoutOppName = null;
  }

  return { front, cov, blitz, stunt };
}

function buildScriptDefenseDatalistState(scriptItems) {
  const scoutOptions = getScriptScoutingDatalistOptions();
  const scriptPlays = scriptItems.filter((p) => !p.isSeparator);

  const preferredFrontLists = buildSharedPreferredDatalistMarkup(
    "front",
    scriptPlays.map((p) => p.practiceFront),
    scoutOptions.front,
  );
  const preferredCoverageLists = buildSharedPreferredDatalistMarkup(
    "cov",
    scriptPlays.map((p) => p.practiceCoverage),
    scoutOptions.cov,
  );
  const preferredStuntLists = buildSharedPreferredDatalistMarkup(
    "stunt",
    scriptPlays.map((p) => p.practiceStunt),
    scoutOptions.stunt,
  );
  const preferredBlitzLists = buildSharedPreferredDatalistMarkup(
    "blitz",
    scriptPlays.map((p) => p.practiceBlitz),
    scoutOptions.blitz,
  );

  const html = `
      <datalist id="dl-front-shared">${scoutOptions.front}</datalist>
      <datalist id="dl-cov-shared">${scoutOptions.cov}</datalist>
      <datalist id="dl-stunt-shared">${scoutOptions.stunt}</datalist>
      <datalist id="dl-blitz-shared">${scoutOptions.blitz}</datalist>
    ` +
    preferredFrontLists.html +
    preferredCoverageLists.html +
    preferredStuntLists.html +
    preferredBlitzLists.html;

  return {
    html,
    preferredFrontIdsByValue: preferredFrontLists.idsByValue,
    preferredCoverageIdsByValue: preferredCoverageLists.idsByValue,
    preferredStuntIdsByValue: preferredStuntLists.idsByValue,
    preferredBlitzIdsByValue: preferredBlitzLists.idsByValue,
  };
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

// Bulk edit state - tracks selected script item indices
let bulkSelectedIndices = [];

// Selected available plays for batch adding
let selectedAvailablePlays = [];
let lastScriptTargetPeriodId = null;
let scriptKeyboardShortcutsInitialized = false;
let currentFilteredPlayIndices = [];

// Pagination for the available plays list
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

const SCRIPT_PERIOD_ACTION_SHORTCUTS = {
  selectPeriodPlays: { aria: "Alt+Shift+S", hint: "Alt+Shift+S" },
  openPeriodReorderModal: { aria: "Alt+Shift+M", hint: "Alt+Shift+M" },
  sortPeriod: { aria: "Alt+Shift+O", hint: "Alt+Shift+O" },
  reversePeriod: { aria: "Alt+Shift+R", hint: "Alt+Shift+R" },
  applyPreferredForPeriod: { aria: "Alt+Shift+P", hint: "Alt+Shift+P" },
};

function applyScriptFiltersCollapsedState() {
  const container = document.getElementById("scriptFiltersContainer");
  const btn = document.getElementById("toggleFiltersBtn");
  if (!container || !btn) return;

  if (filtersCollapsed) {
    container.classList.add("collapsed");
    btn.innerHTML = "🔽 Filters";
  } else {
    container.classList.remove("collapsed");
    btn.innerHTML = "🔼 Filters";
  }
}

function getPeriodCallDisplayOptions(separator, baseOptions = {}) {
  if (!separator?.hideProtection) return baseOptions;
  return { ...baseOptions, hideProtection: true };
}

function getScriptDisplayPlay(play) {
  if (!play) return play;

  const customFormationTags = getSharedCustomTagEntries(play.scriptFormationTags)
    .map((entry) => `(${formatSharedCustomTagEntryText(entry)})`)
    .filter(Boolean);
  const customBackTags = getSharedCustomTagEntries(play.scriptBackTags)
    .map((entry) => `(${formatSharedCustomTagEntryText(entry)})`)
    .filter(Boolean);

  if (!customFormationTags.length && !customBackTags.length) return play;

  const displayPlay = { ...play };

  if (customFormationTags.length) {
    const formationTagText = customFormationTags.join(" ");
    if (displayPlay.formTag2 && String(displayPlay.formTag2).trim()) {
      displayPlay.formTag2 = `${displayPlay.formTag2} ${formationTagText}`;
    } else if (displayPlay.formTag1 && String(displayPlay.formTag1).trim()) {
      displayPlay.formTag2 = formationTagText;
    } else {
      displayPlay.formTag1 = formationTagText;
    }
  }

  if (customBackTags.length) {
    const backTagText = customBackTags.join(" ");
    displayPlay.back = displayPlay.back
      ? `${displayPlay.back} ${backTagText}`
      : backTagText;
  }

  return displayPlay;
}

function getScriptFullCall(play, options = {}) {
  return getFullCall(getScriptDisplayPlay(play), options);
}

function hasScriptPlayerOverrides(play) {
  const baseAssignments = getBasePlayerAssignments(play);
  const manualAssignments = normalizePlayerAssignments(play?.playerAssignments);
  return Object.keys(manualAssignments).some(
    (slotKey) => (manualAssignments[slotKey] || "") !== (baseAssignments[slotKey] || ""),
  );
}

function isScriptPlayerSlotPromoted(play, slotKey) {
  if (!slotKey) return false;
  const baseAssignments = getBasePlayerAssignments(play);
  const currentAssignments = getScriptPlayerAssignments(play);
  return (currentAssignments[slotKey] || "") !== (baseAssignments[slotKey] || "");
}

function updateScriptPlayerAssignment(index, slotKey, playerId) {
  const play = script[index];
  if (!play || play.isSeparator || !slotKey) return;

  const baseAssignments = getBasePlayerAssignments(play);
  const assignments = normalizePlayerAssignments(play.playerAssignments);
  if (playerId) assignments[slotKey] = playerId;
  else delete assignments[slotKey];

  if ((assignments[slotKey] || "") === (baseAssignments[slotKey] || "")) {
    delete assignments[slotKey];
  }

  play.playerAssignments = Object.keys(assignments).length ? assignments : undefined;
  debouncedSaveScriptState();
}

function rerenderScriptPreservingScroll() {
  const scrollY = window.scrollY;
  renderScript();
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY, left: window.scrollX, behavior: "instant" });
  });
}

function promoteScriptDepthPlayer(index, slotKey, playerId) {
  if (!slotKey || !playerId) return;
  updateScriptPlayerAssignment(index, slotKey, playerId);
  rerenderScriptPreservingScroll();
}

function resetScriptPlayerOverrides(index) {
  const play = script[index];
  if (!play || play.isSeparator) return;
  delete play.playerAssignments;
  debouncedSaveScriptState();
  rerenderScriptPreservingScroll();
}

function buildScriptPlayerAssignmentGrid(play, index, playLabel, opts = {}) {
  const assignments = getScriptPlayerAssignments(play);
  const depthChart = getScriptPlayerDepthChart(play);
  const hasOverrides = hasScriptPlayerOverrides(play);
  const slotMap = new Map(
    getTeamAssignmentSlots(play?.personnel).map((slot) => [slot.key, slot]),
  );
  const buildRow = (slotKeys) => {
    const slots = slotKeys.map((slotKey) => slotMap.get(slotKey)).filter(Boolean);
    if (!slots.length) return "";
    const rowTypeClass = slotKeys.some((slotKey) => ["lt", "lg", "c", "rg", "rt"].includes(slotKey))
      ? "script-player-row--line"
      : "script-player-row--skill";
    return `
      <div class="script-player-row script-player-row--${slots.length} ${rowTypeClass}">
        ${slots.map((slot) => `
          <div class="script-player-slot ${isScriptPlayerSlotPromoted(play, slot.key) ? "script-player-slot--promoted" : ""}">
            <div class="script-player-slot-head">
              <span class="script-player-slot-label">${slot.label}</span>
              <span class="script-player-slot-role">${isScriptPlayerSlotPromoted(play, slot.key) ? "Promoted" : "Starter"}</span>
            </div>
            <select class="script-player-slot-select" data-field="playerAssignment" data-slot="${slot.key}" data-idx="${index}" aria-label="${escapeHtml(playLabel)} ${slot.label} player">
              ${buildTeamPlayerOptionMarkup(assignments[slot.key] || "")}
            </select>
            ${(() => {
        const slotDepth = getTeamDepthChartForSlot(depthChart, slot.key);
        const starterId = String(assignments[slot.key] || "").trim();
        const promoted = isScriptPlayerSlotPromoted(play, slot.key);
        const backupIds = slotDepth.filter((playerId) => playerId && playerId !== starterId);
        const currentStarterMarkup = promoted
          ? `<div class="script-player-current-pill"><span class="script-player-current-pill-label">Live</span><span class="script-player-current-pill-name">${escapeHtml(getTeamPlayerSelectionDisplay(starterId))}</span></div>`
          : "";
        if (!backupIds.length) {
          return `${currentStarterMarkup}<span class="script-player-slot-empty">No subs set</span>`;
        }
        return `
                ${currentStarterMarkup}
                <div class="script-player-depth-list">
                  ${backupIds.map((playerId, depthIndex) => `
                    <button type="button" class="script-player-depth-chip" data-action="promoteScriptDepthPlayer" data-idx="${index}" data-slot="${slot.key}" data-player-id="${escapeAttr(playerId)}" aria-label="Promote ${escapeHtml(getTeamPlayerSelectionDisplay(playerId))} to ${slot.label} starter on ${escapeHtml(playLabel)}">
                      <span class="script-player-depth-chip-role">S${depthIndex + 1}</span>
                      <span class="script-player-depth-chip-name">${escapeHtml(getTeamPlayerSelectionDisplay(playerId))}</span>
                    </button>
                  `).join("")}
                </div>
              `;
      })()}
          </div>
        `).join("")}
      </div>
    `;
  };

  const buildSection = (title, className, rows) => {
    const content = rows.filter(Boolean).join("");
    if (!content) return "";
    return `
      <div class="script-player-group ${className}">
        <div class="script-player-group-header">
          <span class="script-player-group-title">${title}</span>
        </div>
        ${content}
      </div>
    `;
  };

  const skillSection = buildSection("Skill", "script-player-group--skill", [
    buildRow(["qb", "rb", "h", "x", "y", "z"]),
  ]);
  const lineSection = opts.hideLinemen
    ? ""
    : buildSection("Offensive Line", "script-player-group--line", [
      buildRow(["lt", "lg", "c", "rg", "rt"]),
    ]);

  return `
    <div class="script-player-grid ${opts.layoutMode === "compact" ? "script-player-grid--compact" : "script-player-grid--detail"}">
      <div class="script-player-grid-head">
        <div class="script-player-grid-meta">
          <span class="script-player-grid-title">Personnel</span>
          ${hasOverrides ? '<span class="script-player-grid-status">Manual starter override</span>' : ''}
        </div>
        <div class="script-player-grid-actions">
          ${hasOverrides ? `<button type="button" class="script-player-reset-btn" data-action="resetScriptPlayerOverrides" data-idx="${index}" aria-label="Reset player overrides for ${escapeHtml(playLabel)}">Reset</button>` : ''}
        </div>
      </div>
      ${skillSection}
      ${lineSection}
    </div>
  `;
}

/**
 * Debounced autosave for the working script
 * Saves a draft to localStorage so work isn't lost on accidental close
 */
function scheduleScriptAutosave() {
  scriptAutosaveTimer = queueAutosave(
    scriptAutosaveTimer,
    () => {
      persistDraftData(STORAGE_KEYS.SCRIPT_DRAFT, {
        name: document.getElementById("scriptName")?.value || "",
        date: document.getElementById("scriptDate")?.value || "",
        plays: script,
      });
      if (typeof updateSaveStatus === "function") updateSaveStatus("saved");
    },
    {
      delay: AUTOSAVE_DEBOUNCE_MS,
      onQueue: () => {
        if (typeof updateSaveStatus === "function") updateSaveStatus("saving");
      },
    },
  );
}

/**
 * Check for and offer to restore a script draft
 */
async function checkScriptDraft() {
  try {
    const draft = storageManager.get(STORAGE_KEYS.SCRIPT_DRAFT, null);
    if (!draft || !draft.plays || draft.plays.length === 0) return;

    if (isDraftExpired(draft)) {
      discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
      return;
    }
    const currentPlays = script.filter((p) => !p.isSeparator).length;
    if (currentPlays > 0) return;

    const draftPlays = draft.plays.filter((p) => !p.isSeparator).length;
    const savedTime = formatDraftSavedAt(draft);

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
      discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
    }
  } catch (err) {
    console.error("checkScriptDraft error:", err);
    showToast("❌ Error restoring script draft.", {
      duration: 3000,
      type: "error",
    });
  }
}

/**
 * Toggle filters panel collapse
 */
function toggleFiltersCollapse() {
  filtersCollapsed = !filtersCollapsed;
  applyScriptFiltersCollapsedState();
  saveScriptDisplayOptions();
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

/* toggleCollapsiblePanel() moved to utils.js */

/**
 * Highlight plays not on the selected wristband
 */
function highlightPlaysNotOnWristband() {
  const wbSelect = document.getElementById("scriptWristbandSelect");
  if (!wbSelect || !wbSelect.value) {
    showToast("⚠️ Please select a wristband first", { type: "warning" });
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
    showToast("✅ All plays in the script are on the wristband!", {
      type: "success",
    });
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
  const play = script[index];
  const playLabel = getScriptPlaySummaryText(play);
  if (idx > -1) {
    bulkSelectedIndices.splice(idx, 1);
    announceScriptA11y(`${playLabel} deselected`);
  } else {
    bulkSelectedIndices.push(index);
    announceScriptA11y(`${playLabel} selected`);
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
    announceScriptA11y(`Selected all ${bulkSelectedIndices.length} plays`);
  } else {
    bulkSelectedIndices = [];
    announceScriptA11y("Cleared script selection");
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
    announceScriptA11y(`Cleared selection for ${script[separatorIndex].label || "period"}`);
  } else {
    // Select all plays in this period (add any not already selected)
    periodPlayIndices.forEach((idx) => {
      if (!bulkSelectedIndices.includes(idx)) {
        bulkSelectedIndices.push(idx);
      }
    });
    announceScriptA11y(
      `Selected ${periodPlayIndices.length} plays in ${script[separatorIndex].label || "period"}`,
    );
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
    if (count > 0) {
      indicator.classList.add("active");
      indicator.textContent = `${count} selected`;
    } else {
      indicator.classList.remove("active");
      indicator.textContent = "";
    }
  }
}

function setScriptToolbarStatus(message, tone = "info", duration = 2000) {
  const statusEl = document.getElementById("scriptSortStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `script-sort-status is-${tone}`;
  if (duration > 0) {
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "script-sort-status";
    }, duration);
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
  announceScriptA11y("Selection cleared");
}

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

function createScriptPlayFromPlaybook(play) {
  return {
    ...play,
    reps: 1,
    notes: "",
    hash: "",
    defFront: "",
    defCoverage: "",
    defStunt: "",
    defBlitz: "",
    playerAssignments: createScriptPlayerAssignments(play),
    id: Date.now() + Math.random(),
  };
}

function getPreferredTargetPeriodIndex() {
  const periodChoices = getScriptPeriodChoices();
  if (!periodChoices.length) return null;

  const lastUsedChoice = periodChoices.find(
    (choice) => script[choice.value]?.id === lastScriptTargetPeriodId,
  );
  return lastUsedChoice ? lastUsedChoice.value : periodChoices[0].value;
}

function buildAvailableTargetPeriodSelectMarkup(playIndex) {
  const periodChoices = getScriptPeriodChoices();
  if (!periodChoices.length) return "";

  const preferredTarget = getPreferredTargetPeriodIndex();
  const optionsHtml = periodChoices
    .map((choice) => {
      const optionLabel = `${choice.label} (${choice.sublabel})`;
      const selected = choice.value === preferredTarget ? " selected" : "";
      return `<option value="${escapeAttr(choice.value)}"${selected}>${escapeHtml(optionLabel)}</option>`;
    })
    .join("");

  return `
    <label class="available-target-picker" aria-label="Target period for this play">
      <span class="available-target-picker-label">To</span>
      <select class="available-target-select" data-field="availableTargetPeriod" data-idx="${playIndex}" aria-label="Target period for play ${playIndex + 1}">
        ${optionsHtml}
      </select>
    </label>
  `;
}

function getAvailableAddSelection(playIndex) {
  normalizeSelectedAvailablePlays();
  if (
    selectedAvailablePlays.length > 1 &&
    selectedAvailablePlays.includes(playIndex)
  ) {
    return [...selectedAvailablePlays].sort((a, b) => a - b);
  }
  return Number.isInteger(playIndex) ? [playIndex] : [];
}

function addAvailableSelectionToScript(playIndices, targetSeparatorIndex) {
  const validIndices = playIndices
    .filter((idx) => Number.isInteger(idx) && plays[idx])
    .sort((a, b) => a - b);
  if (!validIndices.length || !script[targetSeparatorIndex]?.isSeparator) return [];

  lastScriptTargetPeriodId = script[targetSeparatorIndex]?.id || lastScriptTargetPeriodId;
  saveScriptState();
  const insertedIndices = insertPlaysIntoPeriod(
    targetSeparatorIndex,
    validIndices
      .map((playIndex) => plays[playIndex])
      .filter(Boolean)
      .map((play) => createScriptPlayFromPlaybook(play)),
  );

  if (selectedAvailablePlays.length) {
    selectedAvailablePlays = selectedAvailablePlays.filter(
      (idx) => !validIndices.includes(idx),
    );
  }

  renderScript();
  renderAvailablePlays();
  if (insertedIndices.length) flashScriptPlayAtIndex(insertedIndices[0]);
  return insertedIndices;
}

function openAvailableAddMenu(event, playIndex) {
  const indices = getAvailableAddSelection(playIndex);
  if (!indices.length) return;

  const hadPeriod = script.some((item) => item?.isSeparator);
  ensureFirstPeriod();
  if (!hadPeriod) renderScript();

  const periodChoices = getScriptPeriodChoices();
  if (!periodChoices.length) return;

  const selectionLabel = `${indices.length} play${indices.length === 1 ? "" : "s"}`;
  const preferredTarget = getPreferredTargetPeriodIndex();
  const menu = document.createElement("div");
  menu.className = "cs-context-menu available-add-menu";

  periodChoices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cs-ctx-item";
    button.textContent = `${choice.value === preferredTarget ? "⭐ " : ""}Add ${selectionLabel} to ${choice.label} (${choice.sublabel})`;
    button.addEventListener("click", () => {
      menu.remove();
      const insertedIndices = addAvailableSelectionToScript(indices, choice.value);
      if (!insertedIndices.length) {
        setScriptToolbarStatus("Could not add plays to that period", "error");
        return;
      }
      setScriptToolbarStatus(
        `Added ${selectionLabel} to ${script[choice.value]?.label || "selected period"}`,
        "success",
        AUTOSAVE_DEBOUNCE_MS,
      );
    });
    menu.appendChild(button);
  });

  showContextMenu(event, menu);
}

function insertPlaysIntoPeriod(targetSeparatorIndex, playsToInsert) {
  if (!Array.isArray(playsToInsert) || playsToInsert.length === 0) return [];
  const separator = script[targetSeparatorIndex];
  if (!separator || !separator.isSeparator) return [];

  let insertAt = targetSeparatorIndex + 1;
  while (insertAt < script.length && !script[insertAt].isSeparator) insertAt++;

  script.splice(insertAt, 0, ...playsToInsert);
  return playsToInsert.map((_, offset) => insertAt + offset);
}

async function pickTargetPeriodForAdd(playCount) {
  ensureFirstPeriod();
  const periodChoices = getScriptPeriodChoices().map((choice) => {
    const separator = script[choice.value];
    const isLastUsed = separator?.id && separator.id === lastScriptTargetPeriodId;
    const minutes = separator?.minutes ? `${separator.minutes} min block` : "No time set";
    return {
      ...choice,
      eyebrow: isLastUsed ? "Last used" : "Period destination",
      meta: minutes,
      badge: choice.sublabel,
      ctaLabel: isLastUsed ? "Add again" : "Add here",
      recommended: isLastUsed,
      ariaLabel: `${choice.label}, ${choice.sublabel}, ${minutes}`,
    };
  });
  if (!periodChoices.length) return null;
  if (periodChoices.length === 1) {
    lastScriptTargetPeriodId = script[periodChoices[0].value]?.id || null;
    return periodChoices[0].value;
  }

  const selectedPeriod = await showListPicker(
    `Choose where ${playCount === 1 ? "this play" : `these ${playCount} plays`} should go. New plays land at the end of the period you pick.`,
    periodChoices,
    { title: "➕ Add To Period", icon: "➕", modalClass: "custom-modal-add-period" },
  );

  if (selectedPeriod !== null) {
    lastScriptTargetPeriodId = script[selectedPeriod]?.id || null;
  }

  return selectedPeriod;
}

function flashScriptPlayAtIndex(scriptIndex) {
  if (!Number.isInteger(scriptIndex) || scriptIndex < 0) return;

  const items = document.querySelectorAll(
    "#scriptPlays .script-item:not(.period-header)",
  );
  const rowIndex = script
    .slice(0, scriptIndex + 1)
    .filter((item) => item && !item.isSeparator).length - 1;
  const targetItem = items[rowIndex];

  if (!targetItem) return;

  targetItem.classList.add("just-added");
  targetItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
  setTimeout(() => targetItem.classList.remove("just-added"), 950);
}

/**
 * Add a play to the script
 * @param {number} playIndex - Index of the play in the plays array
 */
async function addToScript(playIndex, targetSeparatorIndex = null) {
  const play = plays[playIndex];
  if (!play) return;

  let resolvedTargetIndex = Number.isInteger(targetSeparatorIndex)
    ? targetSeparatorIndex
    : parseInt(targetSeparatorIndex, 10);

  if (!Number.isInteger(resolvedTargetIndex) || !script[resolvedTargetIndex]?.isSeparator) {
    resolvedTargetIndex = await pickTargetPeriodForAdd(1);
  }
  if (resolvedTargetIndex === null) return;

  lastScriptTargetPeriodId = script[resolvedTargetIndex]?.id || lastScriptTargetPeriodId;

  saveScriptState();
  const insertedIndices = insertPlaysIntoPeriod(resolvedTargetIndex, [
    createScriptPlayFromPlaybook(play),
  ]);
  renderScript();
  flashScriptPlayAtIndex(insertedIndices[0]);
  setScriptToolbarStatus(`Added play to ${script[resolvedTargetIndex]?.label || "selected period"}`, "success", AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Toggle selection of an available play
 * @param {number} playIndex - Index in plays array
 */
function toggleAvailablePlaySelect(playIndex) {
  playIndex = parseInt(playIndex, 10);
  if (!Number.isInteger(playIndex)) return;
  const idx = selectedAvailablePlays.indexOf(playIndex);
  if (idx > -1) {
    selectedAvailablePlays.splice(idx, 1);
  } else {
    selectedAvailablePlays.push(playIndex);
  }
  normalizeSelectedAvailablePlays();
  renderAvailablePlays();
}

/**
 * Toggle select all available (filtered) plays
 */
function toggleSelectAllAvailable() {
  const selectAllCb = document.getElementById("selectAllAvailable");
  const filteredIndices = currentFilteredPlayIndices || [];

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
  normalizeSelectedAvailablePlays();
  renderAvailablePlays();
}

/**
 * Add all currently filtered plays to the script
 */
async function addAllFilteredToScript() {
  const filteredIndices = currentFilteredPlayIndices || [];
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

  const targetSeparatorIndex = await pickTargetPeriodForAdd(filteredIndices.length);
  if (targetSeparatorIndex === null) return;

  saveScriptState();
  insertPlaysIntoPeriod(
    targetSeparatorIndex,
    filteredIndices
      .map((playIndex) => plays[playIndex])
      .filter(Boolean)
      .map((play) => createScriptPlayFromPlaybook(play)),
  );
  renderScript();
  setScriptToolbarStatus(`Added ${filteredIndices.length} play${filteredIndices.length === 1 ? "" : "s"} to ${script[targetSeparatorIndex]?.label || "selected period"}`, "success", AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Add selected available plays to the script
 */
async function addSelectedToScript() {
  normalizeSelectedAvailablePlays();
  if (selectedAvailablePlays.length === 0) {
    showToast("No plays selected — check the boxes first");
    return;
  }

  const targetSeparatorIndex = await pickTargetPeriodForAdd(selectedAvailablePlays.length);
  if (targetSeparatorIndex === null) return;

  saveScriptState();
  insertPlaysIntoPeriod(
    targetSeparatorIndex,
    selectedAvailablePlays
      .map((playIndex) => plays[playIndex])
      .filter(Boolean)
      .map((play) => createScriptPlayFromPlaybook(play)),
  );

  // Clear selection after adding
  const addedCount = selectedAvailablePlays.length;
  selectedAvailablePlays = [];
  renderAvailablePlays();
  renderScript();
  setScriptToolbarStatus(`Added ${addedCount} play${addedCount === 1 ? "" : "s"} to ${script[targetSeparatorIndex]?.label || "selected period"}`, "success", AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Sort the script by a field
 */
function sortScript() {
  const fieldSelect = document.getElementById("scriptSortField");
  const field = fieldSelect.value;

  if (!field) {
    setScriptToolbarStatus("Select a sort field first", "error");
    return;
  }

  // Check if there are plays to sort
  const playsToSort = script.filter((item) => !item.isSeparator);
  if (playsToSort.length === 0) {
    setScriptToolbarStatus("No plays to sort", "error");
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
  const orderType = hasCustomOrder ? "custom order" : "A-Z";
  setScriptToolbarStatus(`Sorted by ${fieldLabel} • ${orderType}`, "success", AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Reverse the order of plays in the script (within periods)
 */
function reverseScriptSort() {
  const playsToSort = script.filter((item) => !item.isSeparator);

  if (playsToSort.length === 0) {
    setScriptToolbarStatus("No plays to reverse", "error");
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
  setScriptToolbarStatus("Play order reversed", "success");
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

  showReorderModal(orderedValues, {
    title: `Custom Sort Order: ${fieldLabel}`,
    onSave(order) {
      scriptCustomSortOrders[field] = order;
      storageManager.set(
        STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
        scriptCustomSortOrders,
      );
      setScriptToolbarStatus(`Custom order saved for ${fieldLabel}`, "success", AUTOSAVE_DEBOUNCE_MS);
    },
    onClear() {
      delete scriptCustomSortOrders[field];
      storageManager.set(
        STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
        scriptCustomSortOrders,
      );
      setScriptToolbarStatus(`Custom order cleared for ${fieldLabel}`, "success", AUTOSAVE_DEBOUNCE_MS);
    },
  });
}

function wireScriptOverlayDismiss(overlay) {
  if (!overlay) return;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    overlay.remove();
  });
}

/**
 * Sort plays within a single period by the currently selected sort field
 */
function sortPeriod(separatorIndex) {
  const fieldSelect = document.getElementById("scriptSortField");
  const field = fieldSelect ? fieldSelect.value : "";

  if (!field) {
    setScriptToolbarStatus("Select a sort field first", "error");
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

  script.splice(
    separatorIndex + 1,
    endIndex - separatorIndex - 1,
    ...periodPlays,
  );
  renderScript();

  const fieldLabel =
    SCRIPT_SORT_FIELDS.find((f) => f.value === field)?.label || field;
  const periodLabel = script[separatorIndex].label || "Period";
  setScriptToolbarStatus(`${periodLabel} sorted by ${fieldLabel}`, "success", AUTOSAVE_DEBOUNCE_MS);
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

  const periodLabel = script[separatorIndex].label || "Period";
  setScriptToolbarStatus(`${periodLabel} reversed`, "success");
}

/**
 * Show template picker modal and insert selected template
 */
function insertPeriodFromTemplate() {
  if (periodTemplates.length === 0) {
    changed = true;
  }
  if (play.practiceCoverage && !play.defCoverage) {
    play.defCoverage = play.practiceCoverage;
    changed = true;
  }
  if (play.practiceStunt && !play.defStunt) {
    play.defStunt = play.practiceStunt;
    changed = true;
  }
  if (play.practiceBlitz && !play.defBlitz) {
    play.defBlitz = play.practiceBlitz;
    changed = true;
  }

  return changed;
}

function applyDefensiveLookToPlay(play, look, mode) {
  if (!play || play.isSeparator || !look) return false;

  let changed = false;

  if (look.defFront && (mode === "overwrite" || !play.defFront)) {
    if (play.defFront !== look.defFront) {
      play.defFront = look.defFront;
      changed = true;
    }
  }
  if (look.defCoverage && (mode === "overwrite" || !play.defCoverage)) {
    if (play.defCoverage !== look.defCoverage) {
      play.defCoverage = look.defCoverage;
      changed = true;
    }
  }
  if (look.defBlitz && (mode === "overwrite" || !play.defBlitz)) {
    if (play.defBlitz !== look.defBlitz) {
      play.defBlitz = look.defBlitz;
      changed = true;
    }
  }
  if (look.defStunt && (mode === "overwrite" || !play.defStunt)) {
    if (play.defStunt !== look.defStunt) {
      play.defStunt = look.defStunt;
      changed = true;
    }
  }

  return changed;
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

    if (applyDefensiveLookToPlay(p, look, mode)) {
      syncScriptPlayMetadataFields(i);
      filled++;
    } else {
      skipped++;
    }
  });

  markScriptDirty();
  showToast(
    `🎯 Filled defense for ${filled} play(s) from ${opp.name} scouting${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
  );
}

/**
 * Clear the current script
 */
function resetScriptForNewDraft() {
  script = [];
  bulkSelectedIndices = [];
  selectedAvailablePlays = [];
  collapsedPeriods = new Set();
  lastScriptTargetPeriodId = null;
  scriptAvailPage = 0;

  const scriptNameEl = document.getElementById("scriptName");
  if (scriptNameEl) scriptNameEl.value = "Practice Script";
  const dateEl = document.getElementById("scriptDate");
  if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

  ensureFirstPeriod();
  renderScript();
  renderAvailablePlays();
  markScriptClean();
  discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
}

async function newScript() {
  const hasPlays = script.some((p) => !p.isSeparator);
  const currentName = document.getElementById("scriptName")?.value || "";
  const isNamedScript = currentName.trim() && currentName.trim() !== "Practice Script";
  const shouldPrompt = hasPlays || isNamedScript || scriptDirty;

  if (shouldPrompt) {
    const choice = await showChoice(
      "Start a fresh script? You can save the current one first or begin a new unsaved script.",
      {
        title: "New Script",
        icon: "✨",
        option1: "💾 Save & New",
        option2: "✨ New Without Saving",
      },
    );

    if (choice === null) return;
    if (choice === "option1") {
      const saved = await saveScript();
      if (!saved) return;
    }
  }

  resetScriptForNewDraft();
  showToast("✨ Started a new script");
}

async function clearScript() {
  return newScript();
}

async function clearScriptLegacy() {
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
    <div id="loadWbToScriptModal" class="modal-overlay show" data-action="closeLoadWbToScriptModalOverlay">
      <div class="modal-content modal-content-sm">
        <div class="modal-header-row">
          <h3 class="modal-title">➕ Load Wristband Plays to Script</h3>
          <button data-action="closeLoadWbToScriptModal" class="modal-close-btn">✕</button>
        </div>
        
        <div class="mb-md">
          <label class="modal-field-label">Select Wristband:</label>
          <select id="wbToScriptSelect" class="modal-field-input">
            ${wristbandOptions}
          </select>
        </div>
        
        <div class="mb-md">
          <label class="modal-field-label">Add to:</label>
          <select id="wbToScriptDestination" class="modal-field-input">
            <option value="new">New Period (from wristband)</option>
            <option value="current">Current Period / End of Script</option>
          </select>
        </div>
        
        <div class="mb-md">
          <label class="modal-field-label">Card(s) to load:</label>
          <select id="wbToScriptCards" class="modal-field-input">
            <option value="all">All Cards</option>
            <option value="1">Card 1 Only</option>
            <option value="2">Card 2 Only</option>
            <option value="3">Card 3 Only</option>
            <option value="4">Card 4 Only</option>
            <option value="5">Card 5 Only</option>
          </select>
        </div>
        
        <div class="modal-action-row mt-md">
          <button data-action="executeLoadWbToScript" class="btn btn-primary modal-btn-lg">
            ✅ Load Plays
          </button>
          <button data-action="closeLoadWbToScriptModal" class="btn modal-btn-lg">
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
    showToast("⚠️ Could not load wristband", { type: "warning" });
    return;
  }
  const wb = saved[wbIdx];
  if (!wb || !wb.cards) {
    showToast("⚠️ Could not load wristband", { type: "warning" });
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
    showToast("⚠️ No plays found in selected card(s)", { type: "warning" });
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
  const columns = getScriptPrintColumns(opts);
  const visibleLineup = getScriptVisiblePlayerLineup(p, opts);

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

  const mainRow = `<tr style="${rowColor}">
    ${columns.map((column) => `<td class="script-table-cell script-table-cell--${column.key}">${column.render(p, displayNum)}</td>`).join("")}
  </tr>`;

  if (!visibleLineup.length) {
    return mainRow;
  }

  return `${mainRow}
  <tr class="script-print-personnel-row">
    <td class="script-print-personnel-cell" colspan="${columns.length}">
      <div class="script-print-personnel-grid">
        ${visibleLineup.map((entry) => `
          <div class="script-print-personnel-pill">
            <span class="script-print-personnel-pos">${escapeHtml(entry.label)}</span>
            <span class="script-print-personnel-name">${escapeHtml(entry.playerName)}</span>
          </div>
        `).join("")}
      </div>
    </td>
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
    "Players",
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
      esc(getScriptVisiblePlayerSummary(item, getScriptDisplayOptions())),
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
  let currentPeriodCallOptions = {};
  script.forEach((item) => {
    if (item.isSeparator) {
      if (inPeriod) lines.push("");
      inPeriod = true;
      playOrder = 0;
      currentPeriodCallOptions = getPeriodCallDisplayOptions(item);
      const periodMins = item.minutes ? ` (${item.minutes} min)` : "";
      lines.push(`\n[${item.label || "Period"}]${periodMins}`);
      lines.push("-".repeat(30));
    } else {
      playOrder++;
      const call = getScriptFullCall(item, currentPeriodCallOptions);
      const type = item.type ? ` [${item.type}]` : "";
      const notes = item.notes ? ` — ${item.notes}` : "";
      const reps = (item.reps || 1) > 1 ? ` ×${item.reps}` : "";
      const players = getScriptVisiblePlayerSummary(item, getScriptDisplayOptions());
      const playerText = players ? ` — Players: ${players}` : "";
      lines.push(
        `${String(playOrder).padStart(3, " ")}. ${call}${type}${reps}${notes}${playerText}`,
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
  showToast("✅ Script exported as text file", { type: "success" });
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
    const teamName = getTeamName();

    // Build title
    const dateStr = date
      ? new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
      : "";
    document.getElementById("previewTeamName").textContent = teamName || "";
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

    const displayOpts = getScriptDisplayOptions();
    renderScriptPrintTable(
      displayOpts,
      buildScriptPrintBodyMarkup(script, displayOpts),
    );

    document.getElementById("previewContainer").classList.remove("hidden");
    document.getElementById("wristbandPrint").classList.add("hidden");

    // Add print-script class to body for correct print styling
    document.body.classList.add("print-script");

    // Set page size for script (letter size)
    setupPrintPageStyle(
      "@media print { @page { size: letter; margin: 0.5in; } }",
    );

    setTimeout(() => {
      const previewEl = document.getElementById("previewContainer");
      const cleanupScript = () => {
        previewEl.classList.add("hidden");
        document.body.classList.remove("print-script");
      };
      if (typeof showPrintPreview === "function") {
        showPrintPreview(
          previewEl,
          () => {
            try {
              const restoreTitle = setPrintTitle("Practice Script", name || "");
              window.print();
              restoreTitle();
            } finally {
              cleanupScript();
            }
          },
          cleanupScript,
        );
      } else {
        try {
          const restoreTitle = setPrintTitle("Practice Script", name || "");
          window.print();
          restoreTitle();
        } finally {
          cleanupScript();
        }
      }
    }, 100);
  } catch (err) {
    console.error("generatePDF error:", err);
    document.getElementById("previewContainer")?.classList?.add("hidden");
    document.body.classList.remove("print-script");
    showToast("❌ Error generating print preview.", {
      duration: 4000,
      type: "error",
    });
  }
}

// Full Day Printing Functions

/**
 * Load the full day script list with checkboxes
 */
function loadFullDayScriptList() {
  const savedScripts = getSavedScripts();
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
    const savedScripts = getSavedScripts();
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
    const printColumnCount = getScriptPrintColumns(displayOpts).length;
    const teamName = getTeamName();

    // Build combined content
    let globalPlayNum = 0;
    const bodySections = [];

    selectedIds.forEach((id) => {
      const scriptData = savedScripts.find((s) => s.id === id);
      if (!scriptData) return;

      const scriptPlayCount = scriptData.plays.filter(
        (p) => !p.isSeparator,
      ).length;
      globalPlayNum += scriptPlayCount;

      // Add script header — more prominent with play count
      const dateStr = scriptData.date
        ? new Date(scriptData.date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
        : "";
      const scriptHeaderMarkup = `
      <tr class="script-section-header">
        <td colspan="${printColumnCount}" style="background: ${UI_COLORS.bgDarkNav}; color: white; font-weight: bold; padding: 10px; text-align: center; font-size: 13px; letter-spacing: 0.5px; border-top: 3px solid ${UI_COLORS.accentBlue};">
          📋 ${escapeHtml(scriptData.name.toUpperCase())} ${dateStr ? "&nbsp;•&nbsp; " + dateStr : ""} <span style="opacity:0.6;font-weight:normal;font-size:11px;">(${scriptPlayCount} plays)</span>
        </td>
      </tr>
    `;
      bodySections.push(
        buildScriptPrintBodyMarkup(scriptData.plays, displayOpts, {
          scriptHeaderMarkup,
          isFullDay: true,
        }),
      );
    });

    // Get current date for header
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    document.getElementById("previewTeamName").textContent = teamName || "";
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

    renderScriptPrintTable(displayOpts, bodySections.join(""));

    document.getElementById("previewContainer").classList.remove("hidden");
    document.getElementById("wristbandPrint").classList.add("hidden");
    document.body.classList.add("print-script");

    setupPrintPageStyle(
      "@media print { @page { size: letter; margin: 0.25in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Full Practice Day");
        window.print();
        restoreTitle();
      } finally {
        document.getElementById("previewContainer").classList.add("hidden");
        document.body.classList.remove("print-script");
      }
    }, 100);
  } catch (err) {
    console.error("printFullDay error:", err);
    document.getElementById("previewContainer")?.classList?.add("hidden");
    document.body.classList.remove("print-script");
    showToast("❌ Error printing full day.", { duration: 4000, type: "error" });
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
      countEl.textContent = `Search: ${visible}/${total}`;
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
  const savedScripts = getSavedScripts();

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
  const savedScripts = getSavedScripts();

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

  function isTypingTarget(target) {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable
    );
  }

  function isScriptTabActive() {
    if (typeof currentActiveTab === "string") {
      return currentActiveTab === "script";
    }

    const tabPanel = document.getElementById("script");
    return !tabPanel?.classList.contains("hidden");
  }

  function getFocusedPeriodIndex(target) {
    if (!(target instanceof Element)) return null;
    const wrapper = target.closest(".period-header-wrapper");
    if (!wrapper) return null;
    const periodIndex = parseInt(wrapper.dataset.periodIndex || "", 10);
    return Number.isInteger(periodIndex) ? periodIndex : null;
  }

  function runPeriodKeyboardShortcut(periodIndex, key) {
    const separator = script[periodIndex];
    if (!separator || !separator.isSeparator) return false;

    const periodLabel = separator.label || "Period";
    switch (key) {
      case "s":
        selectPeriodPlays(periodIndex);
        setScriptToolbarStatus(`${periodLabel} selection updated`, "success");
        return true;
      case "m":
        openPeriodReorderModal(periodIndex);
        return true;
      case "o":
        sortPeriod(periodIndex);
        return true;
      case "r":
        reversePeriod(periodIndex);
        return true;
      case "p":
        applyPreferredForPeriod(periodIndex);
        return true;
      default:
        return false;
    }
  }

  container.addEventListener("keydown", (e) => {
    const target = e.target;
    const targetIsTyping = isTypingTarget(target);

    // Ctrl/Cmd+A selects all script plays (when not typing in an input)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      if (targetIsTyping) return;
      e.preventDefault();
      bulkSelectedIndices = script
        .map((p, i) => (p.isSeparator ? -1 : i))
        .filter((i) => i >= 0);
      updateBulkSelectUI();
      _scheduleRenderScript();
      showToast(`Selected ${bulkSelectedIndices.length} play${bulkSelectedIndices.length === 1 ? "" : "s"}`);
      announceScriptA11y(`Selected all ${bulkSelectedIndices.length} plays`);
      return;
    }

    // Escape clears current bulk selection
    if (e.key === "Escape" && bulkSelectedIndices.length > 0) {
      e.preventDefault();
      clearBulkSelection();
      showToast("Selection cleared");
      announceScriptA11y("Selection cleared");
      return;
    }

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

  if (scriptKeyboardShortcutsInitialized) return;
  scriptKeyboardShortcutsInitialized = true;

  document.addEventListener("keydown", (e) => {
    if (!isScriptTabActive()) return;
    if (isTypingTarget(e.target)) return;

    const key = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "a") {
      e.preventDefault();
      bulkSelectedIndices = script
        .map((p, i) => (p.isSeparator ? -1 : i))
        .filter((i) => i >= 0);
      updateBulkSelectUI();
      _scheduleRenderScript();
      showToast(`Selected ${bulkSelectedIndices.length} play${bulkSelectedIndices.length === 1 ? "" : "s"}`);
      announceScriptA11y(`Selected all ${bulkSelectedIndices.length} plays`);
      return;
    }

    if (e.key === "Escape" && bulkSelectedIndices.length > 0) {
      e.preventDefault();
      clearBulkSelection();
      showToast("Selection cleared");
      announceScriptA11y("Selection cleared");
      return;
    }

    if (!(e.altKey && e.shiftKey)) return;

    if (key === "c") {
      e.preventDefault();
      collapseAllPeriods();
      setScriptToolbarStatus("All periods collapsed", "success");
      announceScriptA11y("All periods collapsed");
      return;
    }

    if (key === "e") {
      e.preventDefault();
      expandAllPeriods();
      setScriptToolbarStatus("All periods expanded", "success");
      announceScriptA11y("All periods expanded");
      return;
    }

    const periodIndex = getFocusedPeriodIndex(e.target);
    if (periodIndex === null) return;

    if (runPeriodKeyboardShortcut(periodIndex, key)) {
      e.preventDefault();
    }
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
    setScriptToolbarStatus(`Smart Script applied to ${periodLabel}`, "success", AUTOSAVE_DEBOUNCE_MS);
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
  setScriptToolbarStatus("Smart Script applied", "success", AUTOSAVE_DEBOUNCE_MS);
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
