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

// Period templates
let periodTemplates = [];
periodTemplates = storageManager.get(STORAGE_KEYS.PERIOD_TEMPLATES, []);
let selectedPeriodTemplateIndex = -1;
let templateModalMode = "insert";
let templateModalSearchTerm = "";

// Bulk edit state - tracks selected script item indices
let bulkSelectedIndices = [];

// Selected available plays for batch adding
let selectedAvailablePlays = [];
let scriptKeyboardShortcutsInitialized = false;
let currentFilteredPlayIndices = [];
let scriptRenderProfilingEnabled = false;
let scriptRenderProfileHistory = [];

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
  "scriptRemoveVowels",
  "scriptShowLineCall",
  "scriptHighlightHuddle",
  "scriptHighlightCandy",
  "scriptShowWbNum",
  "scriptHidePersonnel",
  "scriptHideLinemen",
  "scriptPrintStyle",
  "scriptShowPrintPreview",
];

const debouncedRenderAvailablePlays = debounce(() => {
  _scheduleRenderAvailable();
}, 180);

const SCRIPT_RENDER_PROFILE_HISTORY_LIMIT = 12;

const SCRIPT_PERIOD_ACTION_SHORTCUTS = {
  selectPeriodPlays: { aria: "Alt+Shift+S", hint: "Alt+Shift+S" },
  openPeriodReorderModal: { aria: "Alt+Shift+M", hint: "Alt+Shift+M" },
  sortPeriod: { aria: "Alt+Shift+O", hint: "Alt+Shift+O" },
  reversePeriod: { aria: "Alt+Shift+R", hint: "Alt+Shift+R" },
  applyPreferredForPeriod: { aria: "Alt+Shift+P", hint: "Alt+Shift+P" },
};

function normalizeSelectedAvailablePlays() {
  selectedAvailablePlays = [...new Set(selectedAvailablePlays)]
    .map((idx) => parseInt(idx, 10))
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < plays.length);
}

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

function updateAvailableActionsUI(filteredCount = 0, pageCount = 0) {
  normalizeSelectedAvailablePlays();

  const addFilteredBtn = document.getElementById("addAllFilteredBtn");
  const addSelectedBtn = document.getElementById("addSelectedBtn");
  const statusEl = document.getElementById("availableSelectionStatus");
  const selectedCount = selectedAvailablePlays.length;

  if (addFilteredBtn) {
    addFilteredBtn.textContent = `➕ Add Filtered (${filteredCount})`;
    addFilteredBtn.title = `Add all ${filteredCount} filtered plays to script`;
    addFilteredBtn.disabled = filteredCount === 0;
  }

  if (addSelectedBtn) {
    addSelectedBtn.textContent = `✓ Add Selected (${selectedCount})`;
    addSelectedBtn.title =
      selectedCount > 0
        ? `Add ${selectedCount} selected play${selectedCount === 1 ? "" : "s"} to script`
        : "Select plays first";
    addSelectedBtn.disabled = selectedCount === 0;
  }

  if (statusEl) {
    statusEl.textContent =
      selectedCount > 0
        ? `${selectedCount} selected overall • ${pageCount} on this page`
        : `${filteredCount} filtered • ${pageCount} on this page`;
  }
}

function getScriptPlayFilterState() {
  return {
    formation: document.getElementById("scriptFilterFormation")?.value || "",
    basePlay: document.getElementById("scriptFilterBasePlay")?.value || "",
    search:
      document.getElementById("scriptSearchPlay")?.value.toLowerCase() || "",
  };
}

function syncScriptSearchClearButton() {
  const clearBtn = document.getElementById("clearSearchPlay");
  if (!clearBtn) return;
  const { search } = getScriptPlayFilterState();
  clearBtn.style.display = search ? "flex" : "none";
}

/**
 * Save script display option checkbox states to localStorage
 */
function saveScriptDisplayOptions() {
  const opts = {};
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) opts[id] = el.checked;
  });
  opts.layoutMode =
    document.querySelector('input[name="scriptLayoutMode"]:checked')?.value ||
    "detail";
  opts.filtersCollapsed = filtersCollapsed;
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
  const layoutMode = opts.layoutMode === "compact" ? "compact" : "detail";
  const modeEl = document.querySelector(
    `input[name="scriptLayoutMode"][value="${layoutMode}"]`,
  );
  if (modeEl) modeEl.checked = true;
  filtersCollapsed = Boolean(opts.filtersCollapsed);
  applyScriptFiltersCollapsedState();
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
    hidePersonnel:
      document.getElementById("scriptHidePersonnel")?.checked || false,
    hideLinemen:
      document.getElementById("scriptHideLinemen")?.checked || false,
    printStyle:
      document.getElementById("scriptPrintStyle")?.checked || false,
    layoutMode:
      document.querySelector('input[name="scriptLayoutMode"]:checked')?.value ||
      "detail",
  };
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

function getScriptPlayerAssignments(play) {
  return getResolvedPlayerAssignments(play);
}

function getScriptPlayerDepthChart(play) {
  return getResolvedPlayerDepthChart(play);
}

function createScriptPlayerAssignments(play) {
  const assignments = normalizePlayerAssignments(play?.playerAssignments);
  return Object.keys(assignments).length ? assignments : {};
}

function getScriptPlayerSummary(play) {
  return formatPlayerAssignmentSummary(getScriptPlayerAssignments(play), {
    personnel: play?.personnel,
  });
}

function getScriptVisiblePlayerSummary(play, options = {}) {
  if (options.hidePersonnel) return "";

  const visibleAssignments = normalizePlayerAssignments(
    getScriptPlayerAssignments(play),
  );

  if (options.hideLinemen) {
    ["lt", "lg", "c", "rg", "rt"].forEach((slotKey) => {
      delete visibleAssignments[slotKey];
    });
  }

  return formatPlayerAssignmentSummary(visibleAssignments, {
    personnel: play?.personnel,
  });
}

function getScriptVisiblePlayerLineup(play, options = {}) {
  if (options.hidePersonnel) return [];

  const visibleAssignments = normalizePlayerAssignments(
    getScriptPlayerAssignments(play),
  );

  if (options.hideLinemen) {
    ["lt", "lg", "c", "rg", "rt"].forEach((slotKey) => {
      delete visibleAssignments[slotKey];
    });
  }

  return getTeamAssignmentSlots(play?.personnel)
    .map((slot) => {
      const playerId = String(visibleAssignments[slot.key] || "").trim();
      if (!playerId) return null;
      const player = getTeamPlayerById(playerId);
      const playerName = String(player?.name || playerId).trim();
      if (!playerName) return null;
      return {
        key: slot.key,
        label: slot.label,
        playerName,
      };
    })
    .filter(Boolean);
}

function getScriptPrintColumns(options = {}) {
  return [
    {
      key: "num",
      label: "#",
      className: "col-num",
      render: (_play, displayNum) => String(displayNum),
    },
    {
      key: "hash",
      label: "Hash",
      className: "col-hash",
      render: (play) => escapeHtml(play.hash || ""),
    },
    {
      key: "tempo",
      label: "Tempo",
      className: "col-tempo",
      render: (play) => escapeHtml(play.tempo || "-"),
    },
    ...(options.showWbNum
      ? [{
        key: "wb",
        label: "WB#",
        className: "col-wb",
        render: (play) => {
          if (!scriptWristband) return "<strong></strong>";
          const num = findPlayOnWristband(play);
          return `<strong>${num !== null ? `#${num}` : ""}</strong>`;
        },
      }]
      : []),
    {
      key: "call",
      label: "Play Call",
      className: "",
      render: (play) => `<strong>${getScriptFullCall(play, options)}</strong>`,
    },
    {
      key: "type",
      label: "Type",
      className: "col-type",
      render: (play) => escapeHtml(play.type || ""),
    },
    {
      key: "front",
      label: "Front",
      className: "col-front",
      render: (play) => escapeHtml(play.defFront || ""),
    },
    {
      key: "cov",
      label: "Cov",
      className: "col-cov",
      render: (play) => escapeHtml(play.defCoverage || ""),
    },
    {
      key: "stunt",
      label: "Stunt",
      className: "col-stunt",
      render: (play) => escapeHtml(play.defStunt || ""),
    },
    {
      key: "blitz",
      label: "Blitz",
      className: "col-blitz",
      render: (play) => escapeHtml(play.defBlitz || ""),
    },
    {
      key: "reps",
      label: "Reps",
      className: "col-reps",
      render: (play) => String(play.reps ?? 1),
    },
    {
      key: "notes",
      label: "Notes",
      className: "col-notes",
      render: (play) => escapeHtml(play.notes || ""),
    },
  ];
}

function renderScriptPrintTableHeader(options = {}) {
  return getScriptPrintColumns(options)
    .map(
      (column) =>
        `<th${column.className ? ` class="${column.className}"` : ""}>${escapeHtml(column.label)}</th>`,
    )
    .join("");
}

function renderScriptPrintTable(options = {}, bodyMarkup = "") {
  const previewTable = document.getElementById("previewTable");
  if (!previewTable) return;
  previewTable.innerHTML = `
    <thead>
      <tr>${renderScriptPrintTableHeader(options)}</tr>
    </thead>
    ${bodyMarkup}
  `;
}

function buildScriptPrintSectionMarkup(sectionRows = [], sectionHeaderMarkup = "") {
  if (!sectionRows.length && !sectionHeaderMarkup) return "";
  return `<tbody class="script-print-period-block">${sectionHeaderMarkup}${sectionRows.join("")}</tbody>`;
}

function buildScriptPrintBodyMarkup(scriptItems = [], displayOpts = {}, options = {}) {
  const {
    scriptHeaderMarkup = "",
    isFullDay = false,
  } = options;
  const periods = scriptItems.filter((item) => item.isSeparator);
  const hasPeriods = periods.length > 0;
  const printColumnCount = getScriptPrintColumns(displayOpts).length;
  const bodySections = [];
  let currentSectionRows = [];
  let currentSectionHeader = scriptHeaderMarkup;
  let periodPlayNum = 0;
  let globalPlayNum = 0;
  let currentPeriodCallOptions = displayOpts;

  const flushSection = () => {
    const markup = buildScriptPrintSectionMarkup(currentSectionRows, currentSectionHeader);
    if (markup) bodySections.push(markup);
    currentSectionRows = [];
    currentSectionHeader = "";
  };

  scriptItems.forEach((item, index) => {
    if (item.isSeparator) {
      flushSection();
      periodPlayNum = 0;
      currentPeriodCallOptions = getPeriodCallDisplayOptions(item, displayOpts);
      const periodPlays = isFullDay
        ? (() => {
          const plays = [];
          for (let cursor = index + 1; cursor < scriptItems.length; cursor++) {
            if (scriptItems[cursor].isSeparator) break;
            plays.push(scriptItems[cursor]);
          }
          return plays;
        })()
        : getPeriodPlays(index);
      const periodColor = item.color || UI_COLORS.periodDefault;
      const timeStr = item.minutes ? ` • ${item.minutes} min` : "";
      currentSectionHeader = `${currentSectionHeader}<tr class="print-period-header" style="background: ${periodColor}; color: white;">
          <td colspan="${printColumnCount}" style="text-align: center; font-weight: bold; font-size: 12px; padding: 6px; letter-spacing: 0.5px;">
            ${escapeHtml(item.label.toUpperCase())}${timeStr} <span style="opacity:0.7;font-weight:normal;font-size:10px;">(${periodPlays.length} plays)</span>
          </td>
        </tr>`;
      return;
    }

    globalPlayNum++;
    periodPlayNum++;
    const displayNum = hasPeriods ? periodPlayNum : globalPlayNum;
    currentSectionRows.push(
      buildScriptPlayRow(item, displayNum, currentPeriodCallOptions),
    );
  });

  flushSection();
  return bodySections.join("");
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

function promoteScriptDepthPlayer(index, slotKey, playerId) {
  if (!slotKey || !playerId) return;
  updateScriptPlayerAssignment(index, slotKey, playerId);
  renderScript();
}

function resetScriptPlayerOverrides(index) {
  const play = script[index];
  if (!play || play.isSeparator) return;
  delete play.playerAssignments;
  debouncedSaveScriptState();
  renderScript();
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
    return `
      <div class="script-player-row script-player-row--${slots.length}">
        ${slots.map((slot) => `
          <label class="script-player-slot ${isScriptPlayerSlotPromoted(play, slot.key) ? "script-player-slot--promoted" : ""}">
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
          ? `<div class="script-player-current-pill"><span class="script-player-current-pill-label">Live starter</span><span class="script-player-current-pill-name">${escapeHtml(getTeamPlayerSelectionDisplay(starterId))}</span></div>`
          : "";
        if (!backupIds.length) {
          return `${currentStarterMarkup}<span class="script-player-slot-empty">No subs set</span>`;
        }
        return `
                ${currentStarterMarkup}
                <div class="script-player-depth-list">
                  ${backupIds.map((playerId, depthIndex) => `
                    <button type="button" class="script-player-depth-chip" data-action="promoteScriptDepthPlayer" data-idx="${index}" data-slot="${slot.key}" data-player-id="${escapeAttr(playerId)}" aria-label="Promote ${escapeHtml(getTeamPlayerSelectionDisplay(playerId))} to ${slot.label} starter on ${escapeHtml(playLabel)}">
                      <span class="script-player-depth-chip-role">Sub ${depthIndex + 1}</span>
                      <span class="script-player-depth-chip-name">${escapeHtml(getTeamPlayerSelectionDisplay(playerId))}</span>
                    </button>
                  `).join("")}
                </div>
              `;
      })()}
          </label>
        `).join("")}
      </div>
    `;
  };

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
      ${buildRow(["qb", "rb", "h", "x", "y", "z"])}
      ${opts.hideLinemen ? "" : buildRow(["lt", "lg", "c", "rg", "rt"])}
    </div>
  `;
}

function getScriptWorkspaceCheckboxState() {
  const checkboxState = {};
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) checkboxState[id] = Boolean(el.checked);
  });
  return checkboxState;
}

function getScriptWorkspaceState() {
  const wbSelect = document.getElementById("scriptWristbandSelect");
  const formationFilter = document.getElementById("scriptFilterFormation");
  const basePlayFilter = document.getElementById("scriptFilterBasePlay");
  const searchInput = document.getElementById("scriptSearchPlay");

  return {
    version: 1,
    displayOptions: getScriptWorkspaceCheckboxState(),
    filters: {
      selectedTypes: [...scriptSelectedTypes],
      selectedSituation: [...scriptSelectedSituation],
      selectedDown: [...scriptSelectedDown],
      selectedDistance: [...scriptSelectedDistance],
      selectedHash: [...scriptSelectedHash],
      selectedFieldPos: [...scriptSelectedFieldPos],
      selectedPersonnel: [...scriptSelectedPersonnel],
      formation: formationFilter?.value || "",
      basePlay: basePlayFilter?.value || "",
      search: searchInput?.value || "",
      filtersCollapsed,
    },
    linkedWristbandId: wbSelect?.value ? parseInt(wbSelect.value, 10) || null : null,
    collapsedPeriodIds: script
      .filter((item) => item.isSeparator && collapsedPeriods.has(item.id))
      .map((item) => item.id),
  };
}

function syncScriptCheckboxFilterSelections() {
  const selectedByType = {
    type: new Set(scriptSelectedTypes),
    situation: new Set(scriptSelectedSituation),
    down: new Set(scriptSelectedDown),
    distance: new Set(scriptSelectedDistance),
    hash: new Set(scriptSelectedHash),
    fieldPos: new Set(scriptSelectedFieldPos),
    personnel: new Set(scriptSelectedPersonnel),
  };

  document
    .querySelectorAll("#scriptFiltersContainer [data-action='toggleScriptCheckbox']")
    .forEach((label) => {
      const filterType = label.dataset.filterType;
      const filterValue = label.dataset.filterValue;
      const checkbox = label.querySelector('input[type="checkbox"]');
      const isSelected = Boolean(
        selectedByType[filterType] && selectedByType[filterType].has(filterValue),
      );

      if (checkbox) checkbox.checked = isSelected;
      label.classList.toggle("checked", isSelected);
    });
}

function setScriptWristbandSelection(wristbandId, shouldRender = true) {
  const select = document.getElementById("scriptWristbandSelect");
  const infoDiv = document.getElementById("scriptWristbandInfo");
  if (!select || !infoDiv) return;

  const normalizedId = Number.isFinite(wristbandId) ? wristbandId : null;
  select.value = normalizedId ? String(normalizedId) : "";

  if (!normalizedId) {
    scriptWristband = null;
    infoDiv.textContent = "";
    if (shouldRender) renderScript();
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved.find((item) => item.id === normalizedId);
  if (!wb) {
    scriptWristband = null;
    infoDiv.textContent = "";
    select.value = "";
    if (shouldRender) renderScript();
    return;
  }

  scriptWristband = wb;
  const totalPlays = wb.cards
    ? wb.cards.reduce(
      (sum, card) => sum + card.data.filter((play) => play !== null).length,
      0,
    )
    : 0;
  infoDiv.textContent = `Loaded: ${wb.title} • ${wb.cards ? wb.cards.length : 1} card(s) • ${totalPlays} plays`;

  if (shouldRender) renderScript();
}

function restoreSavedScriptWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object") return;

  const displayOptions =
    workspace.displayOptions && typeof workspace.displayOptions === "object"
      ? workspace.displayOptions
      : null;
  if (displayOptions) {
    Object.entries(displayOptions).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(value);
    });
    saveScriptDisplayOptions();
  }

  const filters = workspace.filters && typeof workspace.filters === "object"
    ? workspace.filters
    : null;
  if (filters) {
    scriptSelectedTypes = Array.isArray(filters.selectedTypes)
      ? [...filters.selectedTypes]
      : [];
    scriptSelectedSituation = Array.isArray(filters.selectedSituation)
      ? [...filters.selectedSituation]
      : [];
    scriptSelectedDown = Array.isArray(filters.selectedDown)
      ? [...filters.selectedDown]
      : [];
    scriptSelectedDistance = Array.isArray(filters.selectedDistance)
      ? [...filters.selectedDistance]
      : [];
    scriptSelectedHash = Array.isArray(filters.selectedHash)
      ? [...filters.selectedHash]
      : [];
    scriptSelectedFieldPos = Array.isArray(filters.selectedFieldPos)
      ? [...filters.selectedFieldPos]
      : [];
    scriptSelectedPersonnel = Array.isArray(filters.selectedPersonnel)
      ? [...filters.selectedPersonnel]
      : [];

    const formationFilter = document.getElementById("scriptFilterFormation");
    const basePlayFilter = document.getElementById("scriptFilterBasePlay");
    const searchInput = document.getElementById("scriptSearchPlay");
    if (formationFilter) formationFilter.value = filters.formation || "";
    if (basePlayFilter) basePlayFilter.value = filters.basePlay || "";
    if (searchInput) searchInput.value = filters.search || "";

    if (typeof filters.filtersCollapsed === "boolean") {
      filtersCollapsed = filters.filtersCollapsed;
      applyScriptFiltersCollapsedState();
    }

    syncScriptCheckboxFilterSelections();
    syncScriptSearchClearButton();
    updateActiveFilterCount();
    _scheduleRenderAvailable();
  }

  collapsedPeriods = new Set(
    Array.isArray(workspace.collapsedPeriodIds)
      ? workspace.collapsedPeriodIds.filter((id) =>
        script.some((item) => item.isSeparator && item.id === id),
      )
      : [],
  );

  setScriptWristbandSelection(workspace.linkedWristbandId || null, false);
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

  filterScriptPlays();
}

/**
 * Update active filter count badge
 */
function updateActiveFilterCount() {
  const { formation, basePlay, search } = getScriptPlayFilterState();
  const count =
    scriptSelectedTypes.length +
    scriptSelectedSituation.length +
    scriptSelectedDown.length +
    scriptSelectedDistance.length +
    scriptSelectedHash.length +
    scriptSelectedFieldPos.length +
    scriptSelectedPersonnel.length +
    (formation ? 1 : 0) +
    (basePlay ? 1 : 0) +
    (search ? 1 : 0);

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
 * Select all print options for script
 */
function selectAllScriptOptions() {
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });
  saveScriptDisplayOptions();
  renderScript();
}

/**
 * Clear all print options for script
 */
function clearAllScriptOptions() {
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  const detailEl = document.querySelector(
    'input[name="scriptLayoutMode"][value="detail"]',
  );
  if (detailEl) detailEl.checked = true;
  saveScriptDisplayOptions();
  renderScript();
}

function applyScriptDisplayPreset(presetName = "coach") {
  const presetMap = {
    coach: {
      layoutMode: "detail",
      checked: ["scriptShowLineCall", "scriptShowWbNum"],
    },
    compact: {
      layoutMode: "compact",
      checked: [
        "scriptShowLineCall",
        "scriptShowWbNum",
        "scriptHideLinemen",
        "scriptPrintStyle",
      ],
    },
    "print-match": {
      layoutMode: "detail",
      checked: [
        "scriptShowLineCall",
        "scriptShowWbNum",
        "scriptPrintStyle",
        "scriptShowPrintPreview",
      ],
    },
  };

  const preset = presetMap[String(presetName || "coach").trim().toLowerCase()] || presetMap.coach;
  const enabled = new Set(preset.checked);

  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = enabled.has(id);
  });

  const modeEl = document.querySelector(
    `input[name="scriptLayoutMode"][value="${preset.layoutMode}"]`,
  );
  if (modeEl) modeEl.checked = true;

  saveScriptDisplayOptions();
  renderScript();
  showToast(`Script preset: ${presetName}`);
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
  scriptAvailPage = 0;
  syncScriptSearchClearButton();
  updateActiveFilterCount();
  _scheduleRenderAvailable();
}

/**
 * Debounced handler for the available-plays search input.
 */
function handleScriptSearchInput() {
  scriptAvailPage = 0;
  syncScriptSearchClearButton();
  updateActiveFilterCount();
  debouncedRenderAvailablePlays();
}

/**
 * Clear the available plays search input
 */
function clearSearchPlay() {
  const input = document.getElementById("scriptSearchPlay");
  if (input) input.value = "";
  syncScriptSearchClearButton();
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
  const { formation, basePlay, search } = getScriptPlayFilterState();
  normalizeSelectedAvailablePlays();

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
  currentFilteredPlayIndices = filtered.map((p) => playIndexMap.get(p));

  // ── Pagination ──
  const totalAvail = filtered.length;
  const totalAvailPages = Math.max(1, Math.ceil(totalAvail / AVAIL_PER_PAGE));
  if (scriptAvailPage >= totalAvailPages) scriptAvailPage = totalAvailPages - 1;
  if (scriptAvailPage < 0) scriptAvailPage = 0;
  const availStart = scriptAvailPage * AVAIL_PER_PAGE;
  const pageFiltered = filtered.slice(availStart, availStart + AVAIL_PER_PAGE);
  updateAvailableActionsUI(totalAvail, pageFiltered.length);

  // ── Zero-state ──
  if (pageFiltered.length === 0) {
    const activeFilters = document.getElementById("activeFilterCount")?.textContent || "0 active";
    const hasSearch = Boolean(search);
    container.innerHTML = `
      <div class="avail-empty-state">
        <span class="avail-empty-icon">🔍</span>
        <p class="avail-empty-msg">No plays match the current filters.</p>
        <p class="avail-empty-hint">${activeFilters}${hasSearch ? " • search active" : ""}</p>
        <div class="avail-empty-actions">
          ${hasSearch ? `<button class="btn btn-sm" data-action="clearSearchPlay">Clear Search</button>` : ""}
          <button class="btn btn-sm btn-secondary" data-action="clearAllScriptFilters">Reset Filters</button>
        </div>
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
  const periodChoices = getScriptPeriodChoices();
  if (!periodChoices.length) return null;
  if (periodChoices.length === 1) return periodChoices[0].value;

  return showListPicker(
    `Choose which period should receive ${playCount} play${playCount === 1 ? "" : "s"}.`,
    periodChoices,
    { title: "➕ Add To Period", icon: "➕" },
  );
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
async function addToScript(playIndex) {
  const play = plays[playIndex];
  if (!play) return;

  const targetSeparatorIndex = await pickTargetPeriodForAdd(1);
  if (targetSeparatorIndex === null) return;

  saveScriptState();
  const insertedIndices = insertPlaysIntoPeriod(targetSeparatorIndex, [
    createScriptPlayFromPlaybook(play),
  ]);
  renderScript();
  flashScriptPlayAtIndex(insertedIndices[0]);
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
  wireScriptOverlayDismiss(overlay);
  document.body.appendChild(overlay);
  // Focus the name input
  setTimeout(() => document.getElementById("newPeriodName")?.focus(), 50);
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
 * Confirm adding the new period from the mini modal
 */
function confirmAddPeriod() {
  const nameInput = document.getElementById("newPeriodName");
  const minutesInput = document.getElementById("newPeriodMinutes");
  const colorInput = document.getElementById("newPeriodColor");
  if (!nameInput || !minutesInput || !colorInput) return;

  const name = nameInput.value.trim();
  const minutes = parseInt(minutesInput.value, 10) || 0;
  const color = colorInput.value || UI_COLORS.periodDefault;

  if (!name) {
    nameInput.classList.add("input-error");
    nameInput.focus();
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
  markScriptDirty();
  renderScript();
  showToast(`Added period "${name}"`);
  announceScriptA11y(`Added period ${name}`);

  // Close modal
  document.querySelector(".period-create-overlay")?.remove();
}

/**
 * Toggle collapse/expand for a period
 */
function togglePeriodCollapse(periodId) {
  const separator = script.find((p) => p.isSeparator && p.id === periodId);
  if (collapsedPeriods.has(periodId)) {
    collapsedPeriods.delete(periodId);
    announceScriptA11y(`${separator?.label || "Period"} expanded`);
  } else {
    collapsedPeriods.add(periodId);
    announceScriptA11y(`${separator?.label || "Period"} collapsed`);
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
  announceScriptA11y("All periods collapsed");
}

/**
 * Expand all periods at once
 */
function expandAllPeriods() {
  collapsedPeriods.clear();
  renderScript();
  announceScriptA11y("All periods expanded");
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
  announceScriptA11y(`Updated color for ${script[index]?.label || "period"}`);
}

/**
 * Update period label text.
 * @param {number} index - separator index in script[]
 * @param {string} label - new label
 * @param {boolean} live - true for keystroke updates, false for committed change
 */
function updatePeriodLabel(index, label, live = false) {
  if (!script[index] || !script[index].isSeparator) return;
  script[index].label = label;
  updatePeriodHeaderLabelDisplay(index);
  updateJumpToPeriodOptions();
  if (live) {
    debouncedSaveScriptState();
  } else {
    saveScriptState();
  }
}

/**
 * Update period minutes without full re-render
 */
function updatePeriodMinutes(index, el) {
  script[index].minutes = parseInt(el.value, 10) || 0;
  updatePeriodMetaDisplay(index);
  saveScriptState();
  updateScriptStats();
}
function updatePeriodNotes(index, notes, live = false) {
  if (!script[index] || !script[index].isSeparator) return;
  script[index].notes = notes;
  if (live) {
    debouncedSaveScriptState();
  } else {
    saveScriptState();
  }
}

function togglePeriodProtection(idx) {
  const separatorIndex = parseInt(idx, 10);
  const separator = script[separatorIndex];
  if (!separator || !separator.isSeparator) return;

  saveScriptState();
  separator.hideProtection = !separator.hideProtection;
  markScriptDirty();
  renderScript();

  const label = separator.label || "Period";
  const stateLabel = separator.hideProtection ? "hidden" : "shown";
  showToast(`Protection ${stateLabel} for "${label}"`);
  announceScriptA11y(`Protection ${stateLabel} for ${label}`);
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
    showToast("⚠️ No plays in this period", { type: "warning" });
    return;
  }

  const header = sep.label || "Period";
  const callOptions = getPeriodCallDisplayOptions(sep);
  const lines = [header, "─".repeat(header.length)];
  periodPlays.forEach((p, n) => {
    const call = getScriptFullCall(p, callOptions);
    const meta = [p.type, p.hash, p.tempo].filter(Boolean).join(" | ");
    lines.push(`${n + 1}. ${call}${meta ? "  [" + meta + "]" : ""}`);
  });

  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => showToast(`📋 ${periodPlays.length} plays copied`))
    .catch(() => showToast("❌ Clipboard not available", { type: "error" }));
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
    notes: separator.notes || "",
    hideProtection: Boolean(separator.hideProtection),
    plays: plays.map((p) => ({ ...p, id: null })), // Remove IDs for template
  };

  periodTemplates.push(template);
  storageManager.set(STORAGE_KEYS.PERIOD_TEMPLATES, periodTemplates);
  showToast(`Template "${name}" saved!`);
  announceScriptA11y(`Saved ${name} as a period template`);
}

function getTemplatePreviewLines(template) {
  if (!template || !Array.isArray(template.plays)) return [];
  return template.plays.slice(0, 5).map((play) => getScriptPlaySummaryText(play));
}

function getFilteredPeriodTemplates() {
  const search = templateModalSearchTerm.trim().toLowerCase();
  return periodTemplates
    .map((template, index) => ({ template, index }))
    .filter(({ template }) => {
      if (!search) return true;
      const haystack = [
        template.name,
        ...template.plays.map((play) => getScriptPlaySummaryText(play)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
}

function ensureSelectedTemplateIndex(visibleTemplates) {
  if (!visibleTemplates.length) {
    selectedPeriodTemplateIndex = -1;
    return;
  }

  const stillVisible = visibleTemplates.some(
    ({ index }) => index === selectedPeriodTemplateIndex,
  );
  if (!stillVisible) {
    selectedPeriodTemplateIndex = visibleTemplates[0].index;
  }
}

function buildTemplatePickerListMarkup(visibleTemplates) {
  if (!visibleTemplates.length) {
    return `
      <div class="template-empty-state">
        <div class="template-empty-title">No templates match this search</div>
        <div class="template-empty-copy">Try a different name or clear the search to see all saved period templates.</div>
      </div>
    `;
  }

  return visibleTemplates
    .map(({ template, index }) => {
      const isSelected = index === selectedPeriodTemplateIndex;
      return `
        <button
          type="button"
          class="template-picker-item${isSelected ? " is-selected" : ""}"
          data-action="previewPeriodTemplate"
          data-arg="${index}"
          aria-pressed="${isSelected ? "true" : "false"}"
          aria-label="Preview template ${escapeHtml(template.name)}"
        >
          <div class="template-picker-main">
            <div class="tpi-name">${escapeHtml(template.name)}</div>
            <div class="tpi-meta">${template.plays.length} plays • ${template.minutes || 0} min</div>
          </div>
          ${isSelected ? '<span class="template-picker-check" aria-hidden="true">✓</span>' : ""}
        </button>
      `;
    })
    .join("");
}

function buildTemplatePreviewMarkup(template) {
  if (!template) {
    return `
      <div class="template-preview-empty">
        <div class="template-empty-title">No template selected</div>
        <div class="template-empty-copy">Choose a saved period template to preview its plays and actions.</div>
      </div>
    `;
  }

  const previewLines = getTemplatePreviewLines(template);
  const extraCount = Math.max((template.plays?.length || 0) - previewLines.length, 0);

  return `
    <div class="template-preview-card">
      <div class="template-preview-header">
        <div>
          <div class="template-preview-title">${escapeHtml(template.name)}</div>
          <div class="template-preview-meta">${template.plays.length} plays • ${template.minutes || 0} min</div>
        </div>
        <span class="template-preview-badge">${templateModalMode === "manage" ? "Manage" : "Ready"}</span>
      </div>
      <div class="template-preview-list">
        ${previewLines.length
      ? previewLines
        .map((line, idx) => `<div class="template-preview-line"><span class="template-preview-line-num">${idx + 1}</span><span>${line}</span></div>`)
        .join("")
      : '<div class="template-empty-copy">This template is empty.</div>'}
      </div>
      ${extraCount > 0 ? `<div class="template-preview-more">+${extraCount} more play${extraCount === 1 ? "" : "s"}</div>` : ""}
    </div>
  `;
}

function updatePeriodTemplateModalContent() {
  const overlay = document.querySelector(".period-create-overlay.template-picker-overlay");
  if (!overlay) return;

  const visibleTemplates = getFilteredPeriodTemplates();
  ensureSelectedTemplateIndex(visibleTemplates);
  const activeTemplate =
    selectedPeriodTemplateIndex >= 0 ? periodTemplates[selectedPeriodTemplateIndex] : null;

  const titleEl = overlay.querySelector("#periodTemplateModalTitle");
  const countEl = overlay.querySelector("#templatePickerCount");
  const listEl = overlay.querySelector("#templatePickerList");
  const previewEl = overlay.querySelector("#templatePreviewPane");
  const actionsEl = overlay.querySelector("#templatePickerActions");
  const searchEl = overlay.querySelector("#templateSearchInput");

  if (titleEl) {
    titleEl.textContent =
      templateModalMode === "manage" ? "🗑 Manage Period Templates" : "📋 Insert from Template";
  }
  if (countEl) {
    countEl.textContent = `${visibleTemplates.length} shown`;
  }
  if (searchEl && searchEl.value !== templateModalSearchTerm) {
    searchEl.value = templateModalSearchTerm;
  }
  if (listEl) {
    listEl.innerHTML = buildTemplatePickerListMarkup(visibleTemplates);
  }
  if (previewEl) {
    previewEl.innerHTML = buildTemplatePreviewMarkup(activeTemplate);
  }
  if (actionsEl) {
    actionsEl.innerHTML =
      templateModalMode === "manage"
        ? `
          <button class="btn btn-sm" data-action="returnToTemplateInsert">← Back to Insert</button>
          <button class="btn btn-danger btn-sm" data-action="deleteSelectedTemplate" ${activeTemplate ? "" : "disabled"}>Delete Selected</button>
          <button class="btn" data-action="closePeriodOverlay">Done</button>
        `
        : `
          <button class="btn btn-secondary btn-sm" data-action="manageTemplates">🗑 Manage</button>
          <button class="btn" data-action="closePeriodOverlay">Cancel</button>
          <button class="btn btn-primary" data-action="insertSelectedTemplate" ${activeTemplate ? "" : "disabled"}>Insert Selected</button>
        `;
  }
}

function renderPeriodTemplateModal() {
  let overlay = document.querySelector(".period-create-overlay.template-picker-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "period-create-overlay template-picker-overlay";
    wireScriptOverlayDismiss(overlay);
    overlay.innerHTML = `
      <div class="period-create-modal template-picker-modal">
        <h4 id="periodTemplateModalTitle"></h4>
        <div class="template-picker-toolbar">
          <input
            id="templateSearchInput"
            type="text"
            class="template-search-input"
            placeholder="Search templates or plays"
            data-oninput="filterPeriodTemplates"
            data-pass="value"
            aria-label="Search period templates"
          >
          <span id="templatePickerCount" class="template-picker-count" role="status" aria-live="polite"></span>
        </div>
        <div class="template-picker-layout">
          <div id="templatePickerList" class="template-picker-list" role="listbox" aria-label="Saved period templates"></div>
          <div id="templatePreviewPane" class="template-preview-pane"></div>
        </div>
        <div id="templatePickerActions" class="period-create-actions template-picker-actions"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  updatePeriodTemplateModalContent();
}

function filterPeriodTemplates(value) {
  templateModalSearchTerm = value || "";
  updatePeriodTemplateModalContent();
}

function previewPeriodTemplate(idx) {
  const parsedIndex = parseInt(idx, 10);
  if (Number.isNaN(parsedIndex) || !periodTemplates[parsedIndex]) return;
  selectedPeriodTemplateIndex = parsedIndex;
  updatePeriodTemplateModalContent();
  announceScriptA11y(`Previewing template ${periodTemplates[parsedIndex].name}`);
}

function returnToTemplateInsert() {
  templateModalMode = "insert";
  updatePeriodTemplateModalContent();
}

function insertSelectedTemplate() {
  if (selectedPeriodTemplateIndex < 0 || !periodTemplates[selectedPeriodTemplateIndex]) return;
  doInsertTemplate(selectedPeriodTemplateIndex);
  document.querySelector(".period-create-overlay.template-picker-overlay")?.remove();
}

async function deleteSelectedTemplate() {
  if (selectedPeriodTemplateIndex < 0 || !periodTemplates[selectedPeriodTemplateIndex]) return;
  await doDeleteTemplate(selectedPeriodTemplateIndex);
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
    if (applyPreferredMetadataToPlay(p)) {
      syncScriptPlayMetadataFields(i);
      updatedCount++;
    }
  });

  setScriptToolbarStatus(`${periodLabel}: ${updatedCount} play(s) updated`, "success", AUTOSAVE_DEBOUNCE_MS);
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
  wireScriptOverlayDismiss(overlay);

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
      <div class="period-create-actions mt-md">
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

  templateModalMode = "insert";
  templateModalSearchTerm = "";
  selectedPeriodTemplateIndex = 0;
  renderPeriodTemplateModal();
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
    notes: template.notes || "",
    hideProtection: Boolean(template.hideProtection),
    id: Date.now() + Math.random(),
  };

  const newPlays = template.plays.map((p) => ({
    ...p,
    id: Date.now() + Math.random(),
  }));

  script.push(newSeparator, ...newPlays);
  markScriptDirty();
  renderScript();
  showToast(`Inserted "${template.name}" (${template.plays.length} plays)`);
  announceScriptA11y(`Inserted template ${template.name}`);
}

function manageTemplates() {
  if (periodTemplates.length === 0) {
    showToast("No templates to manage");
    return;
  }

  templateModalMode = "manage";
  if (selectedPeriodTemplateIndex < 0 && periodTemplates.length > 0) {
    selectedPeriodTemplateIndex = 0;
  }
  renderPeriodTemplateModal();
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
  selectedPeriodTemplateIndex = Math.min(idx, periodTemplates.length - 1);
  if (periodTemplates.length > 0) {
    updatePeriodTemplateModalContent();
  } else {
    document.querySelector(".period-create-overlay.template-picker-overlay")?.remove();
  }
  showToast(`Template "${name}" deleted`);
  announceScriptA11y(`Deleted template ${name}`);
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

function getPlayMoveBounds(index) {
  const separatorIndex = findOwningPeriodIndex(index);
  const lowerBound = separatorIndex >= 0 ? separatorIndex + 1 : 0;
  let upperBound = script.length - 1;

  for (let i = index + 1; i < script.length; i++) {
    if (script[i]?.isSeparator) {
      upperBound = i - 1;
      break;
    }
  }

  return { lowerBound, upperBound };
}

function getScriptPeriodChoices(excludeSeparatorIndex = null) {
  return script
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => item?.isSeparator && index !== excludeSeparatorIndex)
    .map(({ item, index }) => {
      let playCount = 0;
      for (let cursor = index + 1; cursor < script.length && !script[cursor].isSeparator; cursor++) {
        playCount++;
      }
      return {
        label: item.label || `Period ${index + 1}`,
        sublabel: `${playCount} plays`,
        value: index,
      };
    });
}

function movePlayToPeriodIndex(index, targetSeparatorIndex) {
  const play = script[index];
  if (!play || play.isSeparator) return false;

  const currentSeparatorIndex = findOwningPeriodIndex(index);
  const targetSeparator = script[targetSeparatorIndex];
  if (!targetSeparator || !targetSeparator.isSeparator) return false;
  if (currentSeparatorIndex === targetSeparatorIndex) return false;

  saveScriptState();
  const [movedPlay] = script.splice(index, 1);
  const adjustedTargetSeparatorIndex = index < targetSeparatorIndex
    ? targetSeparatorIndex - 1
    : targetSeparatorIndex;

  let insertAt = adjustedTargetSeparatorIndex + 1;
  while (insertAt < script.length && !script[insertAt].isSeparator) insertAt++;

  script.splice(insertAt, 0, movedPlay);
  renderScript();
  return true;
}

async function movePlayToPeriod(index) {
  const play = script[index];
  if (!play || play.isSeparator) return;

  const currentSeparatorIndex = findOwningPeriodIndex(index);
  const periodChoices = getScriptPeriodChoices(currentSeparatorIndex);
  if (!periodChoices.length) {
    setScriptToolbarStatus("Need another period before moving this play", "error");
    return;
  }

  const selectedPeriod = await showListPicker(
    "Choose the period that should receive this play.",
    periodChoices,
    { title: "↔ Move Play To Period", icon: "↔" },
  );

  if (selectedPeriod === null) return;
  if (!movePlayToPeriodIndex(index, selectedPeriod)) {
    setScriptToolbarStatus("Could not move play to that period", "error");
    return;
  }

  const periodLabel = script[selectedPeriod]?.label || "selected period";
  setScriptToolbarStatus(`Moved play to ${periodLabel}`, "success", AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Move a play up or down in the script
 * @param {number} index - Current index
 * @param {number|string} direction - Direction to move (-1 for up, 1 for down, "top" or "bottom")
 */
function movePlay(index, direction) {
  const play = script[index];
  if (!play || play.isSeparator) return;

  const { lowerBound, upperBound } = getPlayMoveBounds(index);
  let targetIndex = index;

  if (direction === "top") targetIndex = lowerBound;
  else if (direction === "bottom") targetIndex = upperBound;
  else {
    const numericDirection = Number(direction);
    if (!Number.isFinite(numericDirection)) return;
    targetIndex = index + numericDirection;
  }

  if (targetIndex < lowerBound || targetIndex > upperBound || targetIndex === index) return;

  saveScriptState();
  script.splice(index, 1);
  script.splice(targetIndex, 0, play);
  renderScript();
}

function getScriptReorderDisplayLabel(play, orderIndex) {
  const prefix = `${orderIndex + 1}.`;
  const summary = getScriptPlaySummaryText(play);
  const meta = [play.type, play.hash, play.tempo].filter(Boolean).join(" • ");
  return `${prefix} ${summary}${meta ? ` — ${meta}` : ""}`;
}

function openPlayReorderModal(startIndex, endIndex, title, successMessage) {
  const sliceStart = Math.max(0, startIndex);
  const sliceEnd = Math.min(script.length, endIndex);
  const playsToReorder = script.slice(sliceStart, sliceEnd).filter((item) => item && !item.isSeparator);

  if (playsToReorder.length < 2) {
    setScriptToolbarStatus("Need at least 2 plays to reorder", "error");
    return;
  }

  const reorderEntries = playsToReorder.map((play, idx) => ({
    label: getScriptReorderDisplayLabel(play, idx),
    play,
  }));

  showReorderModal(reorderEntries.map((entry) => entry.label), {
    title,
    note: "Drag plays into the exact order you want, then apply the new sequence.",
    saveLabel: "✅ Apply Order",
    onSave(order) {
      saveScriptState();
      const reorderedPlays = order.map((label) => {
        const originalIndex = parseInt(label, 10) - 1;
        return reorderEntries[originalIndex]?.play;
      }).filter(Boolean);

      script.splice(sliceStart, playsToReorder.length, ...reorderedPlays);
      renderScript();
      setScriptToolbarStatus(successMessage, "success", AUTOSAVE_DEBOUNCE_MS);
    },
  });
}

function openPeriodReorderModal(separatorIndex) {
  const sepIdx = parseInt(separatorIndex, 10);
  const separator = script[sepIdx];
  if (!separator || !separator.isSeparator) return;

  let endIndex = sepIdx + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) endIndex++;

  const periodLabel = separator.label || "Period";
  openPlayReorderModal(
    sepIdx + 1,
    endIndex,
    `Reorder ${periodLabel}`,
    `${periodLabel} reordered`,
  );
}

async function openScriptReorderModal() {
  const periodChoices = getScriptPeriodChoices()
    .filter((choice) => !choice.sublabel.startsWith("0 plays"));

  if (!periodChoices.length) {
    openPlayReorderModal(0, script.length, "Reorder Script", "Script reordered");
    return;
  }

  if (periodChoices.length === 1) {
    openPeriodReorderModal(periodChoices[0].value);
    return;
  }

  const selectedPeriod = await showListPicker(
    "Choose the period you want to reorder.",
    periodChoices,
    { title: "🗂️ Reorder Plays", icon: "🗂️" },
  );

  if (selectedPeriod === null) return;
  openPeriodReorderModal(selectedPeriod);
}

/**
 * Update reps for a play in the script
 * @param {number} index - Index in the script array
 * @param {number} reps - New reps value
 */
function updateReps(index, reps) {
  script[index].reps = parseInt(reps, 10) || 1;
  updateScriptPreviewReps(index, script[index].reps);
  updatePeriodMetaDisplay(findOwningPeriodIndex(index));
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
    updateScriptPreviewField(index, "hash", value);
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
    const previewClassMap = {
      defFront: "front",
      defCoverage: "cov",
      defStunt: "stunt",
      defBlitz: "blitz",
    };
    updateScriptPreviewField(index, previewClassMap[field], value);
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
  announceScriptA11y(`Dragging ${getScriptPlaySummaryText(script[scriptIndex])}`);
}

function handleDragEnd(event) {
  event.target.classList.remove("dragging");
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
      const movedTo = script.indexOf(moved) + 1;
      announceScriptA11y(`Moved ${getScriptPlaySummaryText(moved)} to position ${movedTo}`);
    }
  }
}

function getScriptPlaySummaryText(play) {
  if (!play) return "play";
  return [play.formation, play.protection, play.play]
    .filter(Boolean)
    .join(" ")
    .trim() || play.type || "play";
}

function buildPeriodStatsMap(scriptItems) {
  const statsBySeparatorIndex = new Map();
  let activeSeparatorIndex = null;

  scriptItems.forEach((item, index) => {
    if (item.isSeparator) {
      activeSeparatorIndex = index;
      statsBySeparatorIndex.set(index, { playCount: 0, periodReps: 0 });
      return;
    }

    if (activeSeparatorIndex === null) return;

    const stats = statsBySeparatorIndex.get(activeSeparatorIndex);
    if (!stats) return;

    stats.playCount += 1;
    stats.periodReps += item.reps || 1;
  });

  return statsBySeparatorIndex;
}

function buildScriptRenderSummary(scriptItems) {
  const summary = {
    hasPlays: false,
    playCount: 0,
    totalReps: 0,
    runCount: 0,
    passCount: 0,
    totalTime: 0,
    periods: [],
  };

  scriptItems.forEach((item) => {
    if (item.isSeparator) {
      summary.periods.push(item);
      if (item.minutes) summary.totalTime += item.minutes;
      return;
    }

    summary.hasPlays = true;
    summary.playCount += 1;
    summary.totalReps += item.reps || 1;
    if (item.type === "Run") summary.runCount += 1;
    else if (item.type === "Pass") summary.passCount += 1;
  });

  return summary;
}

function getPeriodStats(separatorIndex, periodStatsMap) {
  if (periodStatsMap && periodStatsMap.has(separatorIndex)) {
    return periodStatsMap.get(separatorIndex);
  }

  const stats = { playCount: 0, periodReps: 0 };
  for (let index = separatorIndex + 1; index < script.length; index++) {
    const item = script[index];
    if (item.isSeparator) break;
    stats.playCount += 1;
    stats.periodReps += item.reps || 1;
  }

  return stats;
}

function formatPeriodMetaText(playCount, periodReps, minutes) {
  const timeDisplay = minutes ? `${minutes} min` : "";
  return `${playCount} plays • ${periodReps} reps${timeDisplay ? ` • ${timeDisplay}` : ""}`;
}

function getScriptPlayDom(index) {
  const row = document.querySelector(`.script-item[data-idx="${index}"]`);
  const previewRow = row?.nextElementSibling?.classList.contains("print-preview-row")
    ? row.nextElementSibling
    : null;
  return { row, previewRow };
}

function findOwningPeriodIndex(scriptIndex) {
  for (let i = scriptIndex - 1; i >= 0; i--) {
    if (script[i]?.isSeparator) return i;
  }
  return -1;
}

function updatePeriodMetaDisplay(separatorIndex) {
  if (separatorIndex < 0 || !script[separatorIndex]?.isSeparator) return;

  const wrapper = document.querySelector(
    `.period-header-wrapper[data-separator-id="${script[separatorIndex].id}"]`,
  );
  const metaEl = wrapper?.querySelector(".ph-meta-span");
  if (!metaEl) return;

  const { playCount, periodReps } = getPeriodStats(separatorIndex);
  metaEl.textContent = formatPeriodMetaText(
    playCount,
    periodReps,
    script[separatorIndex].minutes,
  );
}

function updateScriptPreviewField(index, fieldClass, value) {
  const { previewRow } = getScriptPlayDom(index);
  const fieldEl = previewRow?.querySelector(`.preview-field.${fieldClass}`);
  if (fieldEl) fieldEl.textContent = value || "-";
}

function updateScriptPreviewReps(index, reps) {
  const { previewRow } = getScriptPlayDom(index);
  const repsEl = previewRow?.querySelector(".preview-field.reps");
  if (repsEl) repsEl.textContent = `×${reps}`;
}

function updateScriptRowFieldValue(index, field, value) {
  const { row } = getScriptPlayDom(index);
  const inputEl = row?.querySelector(`[data-field="${field}"]`);
  if (!inputEl) return;

  if (inputEl.tagName === "SELECT") {
    inputEl.innerHTML = buildDefenseOptions(
      ["L", "M", "R"],
      script[index]?.preferredHash,
      value,
    );
  }

  inputEl.value = value || "";
}

function syncScriptPlayMetadataFields(index) {
  if (!script[index] || script[index].isSeparator) return;

  updateScriptRowFieldValue(index, "hash", script[index].hash || "");
  updateScriptRowFieldValue(index, "defFront", script[index].defFront || "");
  updateScriptRowFieldValue(index, "defCoverage", script[index].defCoverage || "");
  updateScriptRowFieldValue(index, "defStunt", script[index].defStunt || "");
  updateScriptRowFieldValue(index, "defBlitz", script[index].defBlitz || "");

  updateScriptPreviewField(index, "hash", script[index].hash || "");
  updateScriptPreviewField(index, "front", script[index].defFront || "");
  updateScriptPreviewField(index, "cov", script[index].defCoverage || "");
  updateScriptPreviewField(index, "stunt", script[index].defStunt || "");
  updateScriptPreviewField(index, "blitz", script[index].defBlitz || "");
}

function applyPreferredMetadataToPlay(play) {
  if (!play || play.isSeparator) return false;

  let changed = false;

  if (play.preferredHash && !play.hash) {
    play.hash = play.preferredHash;
    changed = true;
  }
  if (play.practiceFront && !play.defFront) {
    play.defFront = play.practiceFront;
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

function updatePeriodHeaderLabelDisplay(index) {
  if (!script[index]?.isSeparator) return;

  const periodLabel = script[index].label || "Period";
  const wrapper = document.querySelector(
    `.period-header-wrapper[data-separator-id="${script[index].id}"]`,
  );
  const header = wrapper?.querySelector(".script-item.period-header") ||
    document.querySelector(`.script-item.period-header .ph-label-input[data-idx="${index}"]`)?.closest(".script-item.period-header");

  if (wrapper) {
    wrapper.setAttribute("aria-label", `${periodLabel} period`);
  }
  if (!header) return;

  const colorInput = header.querySelector(".ph-color-input");
  if (colorInput) colorInput.setAttribute("aria-label", `Color for ${periodLabel}`);

  const labelInput = header.querySelector(".ph-label-input");
  if (labelInput) labelInput.setAttribute("aria-label", `Name for ${periodLabel}`);

  const minutesInput = header.querySelector(".ph-minutes-input");
  if (minutesInput) minutesInput.setAttribute("aria-label", `Minutes for ${periodLabel}`);

  const notesInput = header.querySelector(".ph-notes-input");
  if (notesInput) notesInput.setAttribute("aria-label", `Notes for ${periodLabel}`);

  const collapseBtn = header.querySelector(".ph-collapse-btn");
  if (collapseBtn) {
    const expanded = collapseBtn.getAttribute("aria-expanded") !== "false";
    collapseBtn.setAttribute(
      "aria-label",
      `${expanded ? "Collapse" : "Expand"} ${periodLabel}`,
    );
  }

  const buttons = [
    ["[data-action=\"movePeriod\"][data-dir=\"-1\"]", `Move ${periodLabel} up`],
    ["[data-action=\"movePeriod\"][data-dir=\"1\"]", `Move ${periodLabel} down`],
    ["[data-action=\"duplicatePeriod\"]", `Duplicate ${periodLabel}`],
    ["[data-action=\"savePeriodAsTemplate\"]", `Save ${periodLabel} as a template`],
    [
      "[data-action=\"togglePeriodProtection\"]",
      `${script[index].hideProtection ? "Show" : "Hide"} protection for ${periodLabel}`,
    ],
    ["[data-action=\"removeFromScript\"]", `Delete ${periodLabel}`],
  ];

  buttons.forEach(([selector, label]) => {
    const btn = header.querySelector(selector);
    if (btn) btn.setAttribute("aria-label", label);
  });
}

function renderScriptEmptyPeriodHeaders() {
  let periodHeaders = "";
  script.forEach((p, i) => {
    if (!p.isSeparator) return;
    const periodColor = p.color || UI_COLORS.periodDefault;
    const periodLabel = p.label || "Period";
    const periodNotes = p.notes || "";
    const protectionButtonLabel = p.hideProtection ? "Prot Off" : "Prot On";
    const protectionButtonTitle = p.hideProtection
      ? `Show protection for ${periodLabel}`
      : `Hide protection for ${periodLabel}`;
    periodHeaders += `
      <div class="script-item period-header" style="background: ${periodColor}; color: white;" role="group" aria-label="${escapeHtml(periodLabel)} period header">
        <div class="ph-top">
          <textarea class="ph-notes-input" data-field="periodNotes" data-idx="${i}" rows="2" placeholder="Period notes" aria-label="Notes for ${escapeHtml(periodLabel)}">${escapeHtml(periodNotes)}</textarea>
        </div>
        <div class="ph-main">
          <div class="ph-left">
            <input type="color" class="ph-color-input" value="${periodColor}" data-field="periodColor" data-idx="${i}" title="Period color" aria-label="Color for ${escapeHtml(periodLabel)}">
            <input type="text" class="ph-label-input" value="${escapeHtml(periodLabel)}" data-field="periodLabel" data-idx="${i}" placeholder="Period name" aria-label="Name for ${escapeHtml(periodLabel)}">
            <input type="number" class="ph-minutes-input" value="${p.minutes || ""}" data-field="periodMinutes" data-idx="${i}" placeholder="min" title="Time in minutes" aria-label="Minutes for ${escapeHtml(periodLabel)}">
          </div>
          <div class="ph-right">
            <button class="ph-btn ph-period-setting ${p.hideProtection ? "ph-btn-active" : ""}" data-action="togglePeriodProtection" data-idx="${i}" title="${escapeHtml(protectionButtonTitle)}" aria-label="${escapeHtml(protectionButtonTitle)}">${protectionButtonLabel}</button>
            <button class="remove btn-inline-offset" data-action="removeFromScript" data-idx="${i}" aria-label="Delete ${escapeHtml(periodLabel)}">✕</button>
          </div>
        </div>
      </div>
    `;
  });
  return periodHeaders;
}

function renderPeriodActionButton(action, index, label, icon, title, extraClass = "") {
  const shortcut = SCRIPT_PERIOD_ACTION_SHORTCUTS[action] || null;
  const titleText = shortcut ? `${title} (${shortcut.hint})` : title;
  const shortcutAttr = shortcut ? ` aria-keyshortcuts="${shortcut.aria}"` : "";

  return `<button class="pat-btn ${extraClass}" data-action="${action}" data-idx="${index}" title="${escapeHtml(titleText)}" aria-label="${escapeHtml(title)}"${shortcutAttr}><span class="pat-btn-icon" aria-hidden="true">${icon}</span><span class="pat-btn-label">${escapeHtml(label)}</span></button>`;
}

function renderScriptPeriodHeader(separator, index, renderContext) {
  const isCollapsed = collapsedPeriods.has(separator.id);
  const collapseIcon = isCollapsed ? "▶" : "▼";
  const { playCount, periodReps } = getPeriodStats(
    index,
    renderContext?.periodStatsBySeparatorIndex,
  );
  const periodColor = separator.color || UI_COLORS.periodDefault;
  const periodLabel = separator.label || "Period";
  const periodNotes = separator.notes || "";
  const metaText = formatPeriodMetaText(playCount, periodReps, separator.minutes);
  const protectionButtonLabel = separator.hideProtection ? "Prot Off" : "Prot On";
  const protectionButtonTitle = separator.hideProtection
    ? `Show protection for ${periodLabel}`
    : `Hide protection for ${periodLabel}`;

  return `
    <div class="period-header-wrapper" data-separator-id="${separator.id}" data-period-index="${index}" style="border-left: 4px solid ${periodColor};" role="region" aria-label="${escapeHtml(periodLabel)} period">
      <div class="script-item period-header" style="background: ${periodColor}; color: white;">
        <div class="ph-top">
          <textarea class="ph-notes-input" data-field="periodNotes" data-idx="${index}" rows="2" placeholder="Period notes" aria-label="Notes for ${escapeHtml(periodLabel)}">${escapeHtml(periodNotes)}</textarea>
        </div>
        <div class="ph-main">
          <div class="ph-left">
            <button class="ph-collapse-btn" data-action="togglePeriodCollapse" data-period-id="${separator.id}" title="${isCollapsed ? "Expand" : "Collapse"}" aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(periodLabel)}" aria-expanded="${isCollapsed ? "false" : "true"}">${collapseIcon}</button>
            <input type="color" class="ph-color-input" value="${periodColor}" data-field="periodColor" data-idx="${index}" title="Period color" aria-label="Color for ${escapeHtml(periodLabel)}">
            <input type="text" class="ph-label-input" value="${escapeHtml(periodLabel)}" data-field="periodLabel" data-idx="${index}" aria-label="Name for ${escapeHtml(periodLabel)}">
            <input type="number" class="ph-minutes-input" value="${separator.minutes || ""}" data-field="periodMinutes" data-idx="${index}" placeholder="min" title="Time in minutes" aria-label="Minutes for ${escapeHtml(periodLabel)}">
            <span class="ph-meta-span">${metaText}</span>
          </div>
          <div class="ph-right">
            <button class="ph-btn" data-action="movePeriod" data-idx="${index}" data-dir="-1" title="Move period up" aria-label="Move ${escapeHtml(periodLabel)} up">▲</button>
            <button class="ph-btn" data-action="movePeriod" data-idx="${index}" data-dir="1" title="Move period down" aria-label="Move ${escapeHtml(periodLabel)} down">▼</button>
            <button class="ph-btn" data-action="duplicatePeriod" data-idx="${index}" title="Duplicate period" aria-label="Duplicate ${escapeHtml(periodLabel)}">⧉</button>
            <button class="ph-btn" data-action="savePeriodAsTemplate" data-idx="${index}" title="Save as template" aria-label="Save ${escapeHtml(periodLabel)} as a template">💾</button>
            <button class="ph-btn ph-period-setting ${separator.hideProtection ? "ph-btn-active" : ""}" data-action="togglePeriodProtection" data-idx="${index}" title="${escapeHtml(protectionButtonTitle)}" aria-label="${escapeHtml(protectionButtonTitle)}">${protectionButtonLabel}</button>
            <button class="remove btn-inline-offset" data-action="removeFromScript" data-idx="${index}" aria-label="Delete ${escapeHtml(periodLabel)}">✕</button>
          </div>
        </div>
      </div>
      ${!isCollapsed && playCount > 0
      ? `
        <div class="period-actions-toolbar">
          ${renderPeriodActionButton("selectPeriodPlays", index, "Select", "☑", `Select or deselect plays in ${periodLabel}`)}
          ${renderPeriodActionButton("openPeriodReorderModal", index, "Reorder", "🗂️", `Reorder plays in ${periodLabel}`)}
          ${renderPeriodActionButton("sortPeriod", index, "Sort", "⬍", `Sort plays in ${periodLabel}`)}
          ${renderPeriodActionButton("reversePeriod", index, "Reverse", "↕", `Reverse play order in ${periodLabel}`)}
          ${renderPeriodActionButton("openSmartScriptForPeriod", index, "Smart", "🧠", `Run Smart Script on ${periodLabel}`, "pat-btn-smart")}
          ${renderPeriodActionButton("applyPreferredForPeriod", index, "Preferred", "★", `Apply preferred metadata to ${periodLabel}`)}
          ${renderPeriodActionButton("pushPeriodToCallSheet", index, "To Call Sheet", "📋", `Push ${periodLabel} to call sheet`, "pat-btn-callsheet")}
          ${renderPeriodActionButton("importFromCallSheet", index, "From Call Sheet", "📥", `Import call sheet plays into ${periodLabel}`, "pat-btn-import-cs")}
          ${renderPeriodActionButton("copyPeriodAsText", index, "Copy", "📄", `Copy ${periodLabel} as text`)}
        </div>`
      : ""
    }
    </div>
  `;
}

function renderScriptPlayRow(play, index, playNumber, renderContext) {
  const {
    opts,
    callOptions,
    showPrintPreview,
    getCachedFullCall,
    getCachedSummaryText,
    getCachedHashOptions,
    getCachedWristbandNumber,
    defenseDatalistState,
  } = renderContext;
  const fullCall = getCachedFullCall(play, Boolean(callOptions?.hideProtection));
  const isSelected = bulkSelectedIndices.includes(index);
  const hashOptions = getCachedHashOptions(play);
  const playLabel = getCachedSummaryText(play);
  const playerAssignmentGrid = opts.hidePersonnel
    ? ""
    : buildScriptPlayerAssignmentGrid(play, index, playLabel, opts);
  const playerSummary = getScriptVisiblePlayerSummary(play, opts);
  const reps = play.reps ?? 1;
  const itemClasses = [
    "script-item",
    isSelected ? "bulk-selected" : "",
    opts.layoutMode === "compact" ? "script-item--compact" : "script-item--detail",
    opts.printStyle ? "script-item--printlike" : "",
  ].filter(Boolean).join(" ");

  let wbBadge = "";
  if (scriptWristband && opts.showWbNum) {
    const wbNum = getCachedWristbandNumber(play);
    if (wbNum !== null) {
      wbBadge = `<span class="wb-badge">#${wbNum}</span>`;
    }
  }

  return `
    <div class="${itemClasses}" draggable="true" data-drag="scriptStart" data-idx="${index}" role="group" aria-label="Draggable play ${playNumber}: ${escapeHtml(playLabel)}">
      <input type="checkbox" class="bulk-select-cb" data-index="${index}" ${isSelected ? "checked" : ""} data-field="bulkSelect" data-idx="${index}" title="Select for bulk edit" aria-label="Select play ${playNumber} for bulk edit">
      <div class="play-num" aria-hidden="true">${playNumber}${wbBadge}</div>
      <div class="play-call">
        <div class="full-call">${fullCall}</div>
        <div class="call-meta">${escapeHtml(play.type)} ${play.tempo ? "• " + escapeHtml(play.tempo) : ""}</div>
        ${playerAssignmentGrid}
      </div>
      <div class="hash-input">
        <select data-field="hash" data-idx="${index}" title="Hash" aria-label="Hash for ${escapeHtml(playLabel)}">
          ${hashOptions}
        </select>
      </div>
      <div class="defense-inputs">
        <input type="text" list="${defenseDatalistState.preferredFrontIdsByValue.get((play.practiceFront || "").trim()) || "dl-front-shared"}" value="${escapeHtml(play.defFront || "")}" placeholder="Front" data-field="defFront" data-idx="${index}" title="Defensive Front" class="def-input" aria-label="Defensive front for ${escapeHtml(playLabel)}">
        <input type="text" list="${defenseDatalistState.preferredCoverageIdsByValue.get((play.practiceCoverage || "").trim()) || "dl-cov-shared"}" value="${escapeHtml(play.defCoverage || "")}" placeholder="Cov" data-field="defCoverage" data-idx="${index}" title="Coverage" class="def-input" aria-label="Coverage for ${escapeHtml(playLabel)}">
        <input type="text" list="${defenseDatalistState.preferredStuntIdsByValue.get((play.practiceStunt || "").trim()) || "dl-stunt-shared"}" value="${escapeHtml(play.defStunt || "")}" placeholder="Stunt" data-field="defStunt" data-idx="${index}" title="Stunt" class="def-input" aria-label="Stunt for ${escapeHtml(playLabel)}">
        <input type="text" list="${defenseDatalistState.preferredBlitzIdsByValue.get((play.practiceBlitz || "").trim()) || "dl-blitz-shared"}" value="${escapeHtml(play.defBlitz || "")}" placeholder="Blitz" data-field="defBlitz" data-idx="${index}" title="Blitz" class="def-input" aria-label="Blitz for ${escapeHtml(playLabel)}">
      </div>
      <div class="play-controls">
        <div class="move-btns">
          <button class="move-btn" data-action="movePlayToPeriod" data-idx="${index}" title="Move to another period" aria-label="Move ${escapeHtml(playLabel)} to another period">↔</button>
          <button class="move-btn" data-action="movePlay" data-idx="${index}" data-dir="top" title="Move to top of period" aria-label="Move ${escapeHtml(playLabel)} to top of period">⤒</button>
          <button class="move-btn" data-action="movePlay" data-idx="${index}" data-dir="-1" aria-label="Move ${escapeHtml(playLabel)} up">▲</button>
          <button class="move-btn" data-action="movePlay" data-idx="${index}" data-dir="1" aria-label="Move ${escapeHtml(playLabel)} down">▼</button>
          <button class="move-btn" data-action="movePlay" data-idx="${index}" data-dir="bottom" title="Move to bottom of period" aria-label="Move ${escapeHtml(playLabel)} to bottom of period">⤓</button>
        </div>
        <input type="number" value="${reps}" min="1" data-field="reps" data-idx="${index}" title="Reps" aria-label="Reps for ${escapeHtml(playLabel)}">
        <input type="text" value="${escapeHtml(play.notes || "")}" placeholder="Notes" data-field="notes" data-idx="${index}" aria-label="Notes for ${escapeHtml(playLabel)}">
        <button class="dup-btn" data-action="duplicatePlay" data-idx="${index}" title="Duplicate" aria-label="Duplicate ${escapeHtml(playLabel)}">⧉</button>
        <button class="remove" data-action="removeFromScript" data-idx="${index}" aria-label="Remove ${escapeHtml(playLabel)}">✕</button>
      </div>
    </div>
    ${showPrintPreview
      ? `
      <div class="print-preview-row">
        <span class="preview-label">Print:</span>
        <span class="preview-field"><b>#${playNumber}</b></span>
        <span class="preview-field hash">${escapeHtml(play.hash || "-")}</span>
        <span class="preview-field tempo">${escapeHtml(play.tempo || "-")}</span>
        <span class="preview-field call">${fullCall}</span>
        <span class="preview-field type">${escapeHtml(play.type)}</span>
        <span class="preview-field front">${escapeHtml(play.defFront || "-")}</span>
        <span class="preview-field cov">${escapeHtml(play.defCoverage || "-")}</span>
        <span class="preview-field stunt">${escapeHtml(play.defStunt || "-")}</span>
        <span class="preview-field blitz">${escapeHtml(play.defBlitz || "-")}</span>
        <span class="preview-field reps">×${reps}</span>
        <span class="preview-field players">${escapeHtml(playerSummary || "-")}</span>
      </div>`
      : ""
    }
  `;
}

function renderScriptRows(renderContext) {
  let playNumber = 0;
  let skipPlays = false;
  let currentSeparator = null;

  return script
    .map((play, index) => {
      if (play.isSeparator) {
        currentSeparator = play;
        skipPlays = collapsedPeriods.has(play.id);
        return renderScriptPeriodHeader(play, index, renderContext);
      }

      if (skipPlays) return "";

      playNumber += 1;
      return renderScriptPlayRow(play, index, playNumber, {
        ...renderContext,
        callOptions: getPeriodCallDisplayOptions(currentSeparator, renderContext.opts),
      });
    })
    .join("");
}

function renderScriptColumnHeaders() {
  return `
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
    `;
}

function renderScriptGuidedEmptyState() {
  return `
      <div class="script-empty-guide">
        <div class="seg-icon">📋</div>
        <div class="seg-text">Add plays from the left panel to start building this period</div>
        <div class="seg-hint">Click <strong>+ Add</strong> on any play, or check multiple and use <strong>Add Selected</strong></div>
      </div>
    `;
}

function createScriptRenderContext(opts, showPrintPreview) {
  const fullCallCache = new Map();
  const summaryTextCache = new Map();
  const hashOptionsCache = new Map();
  const wristbandNumberCache = new Map();
  const defenseDatalistState = buildScriptDefenseDatalistState(script);
  const periodStatsBySeparatorIndex = buildPeriodStatsMap(script);
  const renderSummary = buildScriptRenderSummary(script);

  return {
    opts,
    showPrintPreview,
    defenseDatalistState,
    periodStatsBySeparatorIndex,
    renderSummary,
    getCachedFullCall(play, hideProtection = false) {
      if (!play) return "";
      let variants = fullCallCache.get(play);
      if (!variants) {
        variants = new Map();
        fullCallCache.set(play, variants);
      }
      const variantKey = hideProtection ? "hideProtection" : "default";
      if (variants.has(variantKey)) return variants.get(variantKey);
      const rendered = getFullCall(
        getScriptDisplayPlay(play),
        hideProtection ? { ...opts, hideProtection: true } : opts,
      );
      variants.set(variantKey, rendered);
      return rendered;
    },
    getCachedSummaryText(play) {
      if (!play) return "play";
      if (summaryTextCache.has(play)) return summaryTextCache.get(play);
      const summary = getScriptPlaySummaryText(play);
      summaryTextCache.set(play, summary);
      return summary;
    },
    getCachedHashOptions(play) {
      if (!play) return "";
      if (hashOptionsCache.has(play)) return hashOptionsCache.get(play);
      const hashOptions = buildDefenseOptions(
        ["L", "M", "R"],
        play.preferredHash,
        play.hash,
      );
      hashOptionsCache.set(play, hashOptions);
      return hashOptions;
    },
    getCachedWristbandNumber(play) {
      if (!play || !scriptWristband || !opts.showWbNum) return null;
      if (wristbandNumberCache.has(play)) return wristbandNumberCache.get(play);
      const wbNum = findPlayOnWristband(play);
      wristbandNumberCache.set(play, wbNum);
      return wbNum;
    },
  };
}

function renderScriptContent(container, renderContext) {
  const hasPlays = renderContext.renderSummary.hasPlays;

  if (script.length === 0) {
    container.innerHTML = "";
    container.classList.add("empty");
    return;
  }

  if (!hasPlays) {
    container.classList.remove("empty");
    container.innerHTML =
      renderScriptEmptyPeriodHeaders() +
      renderScriptGuidedEmptyState();
    return;
  }

  container.classList.remove("empty");
  container.innerHTML =
    renderContext.defenseDatalistState.html +
    renderScriptColumnHeaders() +
    renderScriptRows(renderContext);
}

function updateJumpToPeriodOptions(renderSummary) {
  const jumpSel = document.getElementById("jumpToPeriod");
  if (!jumpSel) return;

  const periods = renderSummary?.periods || script.filter((p) => p.isSeparator);
  if (periods.length > 1) {
    jumpSel.innerHTML =
      `<option value="">⬇ Jump</option>` +
      periods
        .map(
          (period) =>
            `<option value="${period.id}">${escapeHtml(period.label || "Period")}</option>`,
        )
        .join("");
    jumpSel.style.display = "";
  } else {
    jumpSel.style.display = "none";
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
    if (applyPreferredMetadataToPlay(p)) {
      syncScriptPlayMetadataFields(i);
      updatedCount++;
    }
  });

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
 * Lightweight stats-only update (no DOM rebuild)
 * Call this instead of renderScript() for non-structural data changes
 */
function updateScriptStats(renderSummary) {
  const summary = renderSummary || buildScriptRenderSummary(script);
  const { playCount, totalReps, runCount, passCount, totalTime } = summary;

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

function recordScriptRenderProfileSample(sample) {
  scriptRenderProfileHistory.push(sample);
  if (scriptRenderProfileHistory.length > SCRIPT_RENDER_PROFILE_HISTORY_LIMIT) {
    scriptRenderProfileHistory.shift();
  }
}

function summarizeScriptRenderProfileSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const keys = [
    "totalMs",
    "contextMs",
    "contentMs",
    "bulkUiMs",
    "statsMs",
    "jumpMenuMs",
    "historyButtonsMs",
    "longPressMs",
    "badgeMs",
  ];
  const latestSample = samples[samples.length - 1];
  const summary = {
    samples: samples.length,
    playCount: latestSample.playCount,
    periodCount: latestSample.periodCount,
  };

  keys.forEach((key) => {
    const total = samples.reduce(
      (sum, sample) => sum + (sample[key] || 0),
      0,
    );
    summary[key] = Number((total / samples.length).toFixed(2));
  });

  return summary;
}

function summarizeScriptRenderProfileHistory() {
  return summarizeScriptRenderProfileSamples(scriptRenderProfileHistory);
}

function printScriptRenderProfileSummary() {
  const summary = summarizeScriptRenderProfileHistory();
  if (!summary) {
    console.info("Script render profiling: no samples collected yet.");
    return null;
  }

  console.table([summary]);
  return summary;
}

function enableScriptRenderProfiling() {
  scriptRenderProfilingEnabled = true;
  scriptRenderProfileHistory = [];
  console.info(
    "Script render profiling enabled. Use printScriptRenderProfileSummary() after interacting with the script tab.",
  );
}

function disableScriptRenderProfiling() {
  scriptRenderProfilingEnabled = false;
  console.info("Script render profiling disabled.");
}

function getScriptRenderProfileHistory() {
  return scriptRenderProfileHistory.slice();
}

function runScriptRenderProfileBenchmark(iterations = 20) {
  const runCount = Math.max(1, Number(iterations) || 1);
  const wasEnabled = scriptRenderProfilingEnabled;
  const benchmarkSamples = [];

  scriptRenderProfilingEnabled = true;
  scriptRenderProfileHistory = [];

  for (let index = 0; index < runCount; index++) {
    renderScript();
    const latestSample = scriptRenderProfileHistory[scriptRenderProfileHistory.length - 1];
    if (latestSample) benchmarkSamples.push(latestSample);
  }

  const summary = summarizeScriptRenderProfileSamples(benchmarkSamples);
  scriptRenderProfilingEnabled = wasEnabled;
  if (!summary) {
    console.info("Script render profiling: no samples collected yet.");
    return null;
  }

  console.table([summary]);
  if (summary.playCount === 0 || summary.periodCount <= 1) {
    console.warn(
      "Script render benchmark used a very small script. Load a larger script before using these timings to choose optimization work.",
    );
  }
  console.info(
    `Script render benchmark captured ${benchmarkSamples.length} sample(s). Use getScriptRenderProfileHistory() to inspect the rolling history buffer.`,
  );
  return summary;
}

/**
 * Render the current script
 */
function renderScript() {
  try {
    const container = document.getElementById("scriptPlays");
    const profile = scriptRenderProfilingEnabled
      ? {
        startedAt: performance.now(),
        playCount: script.filter((item) => !item.isSeparator).length,
        periodCount: script.filter((item) => item.isSeparator).length,
      }
      : null;
    const opts = getScriptDisplayOptions();
    const showPrintPreview =
      document.getElementById("scriptShowPrintPreview")?.checked || false;

    let stageStart = profile ? performance.now() : 0;
    const renderContext = createScriptRenderContext(opts, showPrintPreview);
    if (profile) {
      profile.contextMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    renderScriptContent(container, renderContext);
    if (profile) {
      profile.contentMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    // Update bulk select UI
    updateBulkSelectUI();
    if (profile) {
      profile.bulkUiMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    // Update stats
    updateScriptStats(renderContext.renderSummary);
    if (profile) {
      profile.statsMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    // Populate jump-to-period dropdown
    updateJumpToPeriodOptions(renderContext.renderSummary);
    if (profile) {
      profile.jumpMenuMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    // Update undo/redo buttons
    historyManager.updateButtons("script");
    if (profile) {
      profile.historyButtonsMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    // Attach long-press context menus for mobile
    if (typeof _showScriptPlayContextMenu === "function") {
      container
        .querySelectorAll(".script-item:not(.period-header)")
        .forEach((el) => {
          const idx = parseInt(el.dataset.idx, 10);
          if (!isNaN(idx) && script[idx] && !script[idx].isSeparator) {
            addLongPress(el, (ev) => _showScriptPlayContextMenu(ev, idx));
          }
        });
    }
    if (profile) {
      profile.longPressMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    // Refresh tab badge counts
    if (typeof updateTabBadges === "function") updateTabBadges();
    if (profile) {
      profile.badgeMs = performance.now() - stageStart;
      profile.totalMs = performance.now() - profile.startedAt;
      delete profile.startedAt;
      recordScriptRenderProfileSample(profile);
    }
  } catch (err) {
    console.error("renderScript error:", err);
    showToast("❌ Error rendering script.", { duration: 3000, type: "error" });
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
      showToast("⚠️ Please enter a script name", { type: "warning" });
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
        existing.name = name;
        existing.date = date;
        existing.plays = safeDeepClone(script);
        existing.workspace = getScriptWorkspaceState();
        existing.savedAt = new Date().toISOString();
        storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
        loadSavedScriptsList();
        markScriptClean();
        storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
        showToast(`✅ "${name}" updated!`);
        return;
      }

      if (choice !== "option2") {
        return;
      }
    }

    const scriptData = {
      id: Date.now(),
      name,
      date,
      period: "",
      tempo: "",
      plays: safeDeepClone(script),
      workspace: getScriptWorkspaceState(),
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
    showToast("❌ Error saving script.", { duration: 4000, type: "error" });
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
      const totalReps = s.plays.reduce(
        (sum, p) => sum + (!p.isSeparator ? p.reps || 1 : 0),
        0,
      );
      const runCount = s.plays.filter((p) => !p.isSeparator && p.type === "Run").length;
      const passCount = s.plays.filter((p) => !p.isSeparator && p.type === "Pass").length;
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
      const restoresWorkspace = Boolean(s.workspace);
      const isCurrent =
        (document.getElementById("scriptName")?.value || "") === s.name &&
        (document.getElementById("scriptDate")?.value || "") === (s.date || "");
      return `
            <div class="saved-script-card">
                <div class="saved-card-main">
                  <div class="saved-card-title-row">
                    <div class="saved-card-title">${escapeHtml(s.name)}</div>
                    ${isCurrent ? '<span class="saved-card-badge">Current</span>' : ""}
                  </div>
                  <div class="saved-card-meta">
                    <span>📅 ${dateStr}</span>
                    <span>📝 ${playCount} plays</span>
                    <span>🔁 ${totalReps} reps</span>
                    ${periodCount > 0 ? `<span>📂 ${periodCount} periods</span>` : ""}
                  </div>
                  <div class="saved-card-meta saved-card-meta-secondary">
                    <span>🏃 ${runCount} run</span>
                    <span>🎯 ${passCount} pass</span>
                    ${restoresWorkspace ? '<span>🧭 Restores workspace</span>' : ""}
                    ${savedTime ? `<span>💾 ${savedTime}</span>` : ""}
                  </div>
                  ${periods ? `<div class="saved-card-periods">${escapeHtml(periods)}</div>` : ""}
                </div>
                <div class="saved-card-actions">
                    <button class="saved-load-btn" data-action="loadScript" data-sid="${s.id}" title="Load this script">Load</button>
                    <button class="saved-rename-btn" data-action="renameSavedScript" data-sid="${s.id}" title="Rename script">✏️</button>
                    <button class="saved-overwrite-btn" data-action="overwriteSavedScript" data-sid="${s.id}" title="Overwrite with current script">Update</button>
                    <button class="saved-del-btn" data-action="deleteSavedScript" data-sid="${s.id}" title="Delete script">✕</button>
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

    restoreSavedScriptWorkspace(scriptData.workspace);
    renderScript();
    markScriptClean();
    storageManager.remove(STORAGE_KEYS.SCRIPT_DRAFT);
    showToast(`Loaded "${scriptData.name}"`);
  } catch (err) {
    console.error("loadScript error:", err);
    showToast("❌ Error loading script.", { duration: 4000, type: "error" });
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
  s.workspace = getScriptWorkspaceState();
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
  if (!select) return;
  setScriptWristbandSelection(parseInt(select.value, 10), true);
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
