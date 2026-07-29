// Wristband Maker functionality

// Wristband constants and state
let wristbandCards = [];
let currentCardIndex = 0;
let wristbandType = "";
let wbPlayerCardMode = false;
let wbPlayerCardPos = "respQ";
let selectedWristbandPlay = null;
let wristbandHeaderColor = "transparent";

const PLAYER_WRISTBAND_POSITIONS = RESP_POSITIONS.map((position) => ({
  key: position.key,
  label: position.label,
}));
const PLAYER_WRISTBAND_POSITION_KEYS = new Set(
  PLAYER_WRISTBAND_POSITIONS.map((position) => position.key),
);

function getActiveWristbandCellCount() {
  return wbPlayerCardMode ? WB_ROWS : CELLS_PER_CARD;
}
let wbSelectedTempos = [];
let wbSelectedPersonnel = [];
let wbFiltersCollapsed = true;
let wbFavorites = normalizeWbFavorites(
  storageManager.get(STORAGE_KEYS.WRISTBAND_FAVORITES, []),
);
const WB_LIBRARY_PAGE_SIZE = 60;
const WB_RECENT_PLAY_LIMIT = 40;
let wbLibraryLimit = WB_LIBRARY_PAGE_SIZE;
let wbLibraryQuickFilter = "all";
let wbPreventDuplicates = true;
let wbRecentPlayIndexes = normalizeWbFavorites(
  storageManager.get(STORAGE_KEYS.WRISTBAND_RECENT_PLAYS, []),
).slice(0, WB_RECENT_PLAY_LIMIT);
let wbMobileView = "builder";
let wbZoomLevel = "fit";
let activeWristbandSaveId = null;
let activeWristbandTitle = "Untitled Wristband";
let activeWristbandSavedAt = "";

// Cell customization storage: { "cardIdx-cellIdx": { colors, markers, tags, playerRuleSources, playerAssignmentOverrides } }
let cellCustomizations = {};

const WB_CUSTOM_TAG_DISPLAY_MODES = {
  full: { label: "Full", shortLabel: "Full" },
  "no-vowels": { label: "No Vowels", shortLabel: "NV" },
  initial: { label: "First Letter", shortLabel: "1L" },
};

const WB_CELL_MARKER_OPTIONS = [
  { value: "$", emoji: "💲", label: "On Two" },
  { value: "$$", emoji: "💲💲", label: "Double" },
  { value: "✅", emoji: "✅", label: "Check" },
  { value: "📋", emoji: "📋", label: "Copy" },
  { value: "🔄", emoji: "🔄", label: "Xerox" },
  { value: "↔️", emoji: "↔️", label: "Flip" },
  { value: "⚔️", emoji: "⚔️", label: "Man Beat" },
  { value: "🛡️", emoji: "🛡️", label: "Zone Beat" },
  { value: "🧍", emoji: "🧍", label: "Man" },
  { value: "🌐", emoji: "🌐", label: "Zone" },
  { value: "🔥", emoji: "🔥", label: "Hot" },
  { value: "💣", emoji: "💣", label: "Shot" },
  { value: "⚡", emoji: "⚡", label: "Tempo" },
  { value: "🐢", emoji: "🐢", label: "Freeze" },
  { value: "🎯", emoji: "🎯", label: "Must" },
  { value: "⭐", emoji: "⭐", label: "Star" },
  { value: "🚨", emoji: "🚨", label: "Alert" },
  { value: "🔒", emoji: "🔒", label: "Lock" },
  { value: "🧠", emoji: "🧠", label: "Read" },
  { value: "📞", emoji: "📞", label: "Call" },
  { value: "👀", emoji: "👀", label: "Watch" },
  { value: "☠️", emoji: "☠️", label: "Kill" },
  { value: "🏁", emoji: "🏁", label: "Finish" },
  { value: "➕", emoji: "➕", label: "Add" },
  { value: "🔁", emoji: "🔁", label: "Repeat" },
];

const WB_MARKER_PLACEMENTS = new Set(["prefix", "suffix", "both"]);

function normalizeWbFavorites(favorites) {
  return Array.from(
    new Set(
      (Array.isArray(favorites) ? favorites : [])
        .map((value) => parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value >= 0),
    ),
  );
}

function resetWristbandLibraryLimit() {
  wbLibraryLimit = WB_LIBRARY_PAGE_SIZE;
}

function recordRecentWristbandPlay(playIndex) {
  const parsedIndex = parseInt(playIndex, 10);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return;
  wbRecentPlayIndexes = [
    parsedIndex,
    ...wbRecentPlayIndexes.filter((index) => index !== parsedIndex),
  ].slice(0, WB_RECENT_PLAY_LIMIT);
  storageManager.set(STORAGE_KEYS.WRISTBAND_RECENT_PLAYS, wbRecentPlayIndexes);
}

function resetActiveWristbandIdentity() {
  activeWristbandSaveId = null;
  activeWristbandTitle = "Untitled Wristband";
  activeWristbandSavedAt = "";
  if (typeof updateWristbandSaveChrome === "function") {
    updateWristbandSaveChrome();
  }
}

function isWristbandTraceEnabled() {
  try {
    return (
      window.BC_WRISTBAND_TRACE === true ||
      window.BC_ACTION_TRACE === true ||
      localStorage.getItem("bcWristbandTrace") === "1" ||
      localStorage.getItem("bcActionTrace") === "1"
    );
  } catch (_err) {
    return window.BC_WRISTBAND_TRACE === true || window.BC_ACTION_TRACE === true;
  }
}

function getWristbandElementSnapshot(selector) {
  const element =
    typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!(element instanceof Element)) return null;
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || "",
    className: String(element.className || "").slice(0, 180),
    hidden: Boolean(element.hidden),
    display: computed.display,
    visibility: computed.visibility,
    opacity: computed.opacity,
    position: computed.position,
    overflowX: computed.overflowX,
    overflowY: computed.overflowY,
    pointerEvents: computed.pointerEvents,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    childCount: element.children.length,
  };
}

function getWristbandScrollAncestry(targetOrSelector = "#wristbandCard") {
  const start =
    typeof targetOrSelector === "string"
      ? document.querySelector(targetOrSelector)
      : targetOrSelector;
  const rows = [];
  let element = start instanceof Element ? start : null;
  while (element) {
    const computed = window.getComputedStyle(element);
    rows.push({
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      className: String(element.className || "").slice(0, 120),
      display: computed.display,
      overflowX: computed.overflowX,
      overflowY: computed.overflowY,
      position: computed.position,
      height: Math.round(element.getBoundingClientRect().height),
      width: Math.round(element.getBoundingClientRect().width),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
    });
    element = element.parentElement;
  }
  return rows;
}

function getWristbandTraceSnapshot(extra = {}) {
  const card = wristbandCards[currentCardIndex] || null;
  const cardData = Array.isArray(card?.data) ? card.data : [];
  const grid = document.getElementById("wristbandGrid");
  const cardEl = document.getElementById("wristbandCard");
  const activeCellCount =
    typeof getActiveWristbandCellCount === "function"
      ? getActiveWristbandCellCount()
      : wbPlayerCardMode
        ? WB_ROWS
        : CELLS_PER_CARD;
  const gridCells = grid ? [...grid.querySelectorAll(".wristband-cell")] : [];
  return {
    timestamp: new Date().toISOString(),
    activeTab:
      typeof currentActiveTab !== "undefined"
        ? currentActiveTab
        : document.body?.dataset.activeTab || "",
    authRole: document.body?.dataset.authRole || "",
    wristbandType,
    wbPlayerCardMode,
    wbPlayerCardPos,
    currentCardIndex,
    cardCount: wristbandCards.length,
    activeCellCount,
    currentCardName: card?.name || "",
    currentCardDataLength: cardData.length,
    currentCardPlayCount: cardData.slice(0, activeCellCount).filter(Boolean).length,
    totalPlayCount: wristbandCards.reduce(
      (sum, item) => sum + (item.data || []).filter(Boolean).length,
      0,
    ),
    gridCellCount: gridCells.length,
    filledGridCellCount: gridCells.filter((cell) => cell.classList.contains("filled")).length,
    emptyGridCellCount: gridCells.filter((cell) => !cell.classList.contains("filled")).length,
    gridInnerHTMLLength: grid?.innerHTML?.length || 0,
    cardHasHiddenClass: Boolean(cardEl?.classList.contains("wb-hidden")),
    gridHasPlayerClass: Boolean(grid?.classList.contains("pc-grid-active")),
    cardHasPlayerClass: Boolean(cardEl?.classList.contains("pc-card-active")),
    typeChoice: getWristbandElementSnapshot("#wbTypeChoice"),
    toolbar: getWristbandElementSnapshot(".wb-toolbar"),
    playerModeBar: getWristbandElementSnapshot("#pcModeBar"),
    cardTabs: getWristbandElementSnapshot("#cardTabs"),
    preview: getWristbandElementSnapshot(".wristband-preview"),
    viewport: getWristbandElementSnapshot("#wbCardViewport"),
    card: getWristbandElementSnapshot("#wristbandCard"),
    grid: getWristbandElementSnapshot("#wristbandGrid"),
    scrollAncestry: getWristbandScrollAncestry("#wristbandCard"),
    ...extra,
  };
}

function auditWristbandSnapshot(snapshot = getWristbandTraceSnapshot()) {
  const issues = [];
  const expectedGridCells =
    snapshot.wristbandType === "player"
      ? WB_ROWS * 3
      : snapshot.wristbandType === "classic"
        ? WB_ROWS * 4
        : 0;

  if (!snapshot.wristbandType && snapshot.totalPlayCount > 0) {
    issues.push({
      severity: "warn",
      code: "missing-type-with-plays",
      message: "Wristband has plays but no selected wristband type.",
    });
  }
  if (snapshot.wristbandType && snapshot.cardHasHiddenClass) {
    issues.push({
      severity: "error",
      code: "card-hidden-with-mode",
      message: "A wristband type is selected but #wristbandCard still has wb-hidden.",
    });
  }
  if (snapshot.wristbandType && snapshot.typeChoice && snapshot.typeChoice.display !== "none") {
    issues.push({
      severity: "error",
      code: "landing-visible-with-mode",
      message: "The type-choice landing is visible while a wristband type is selected.",
    });
  }
  if (snapshot.wristbandType && snapshot.card && (snapshot.card.width === 0 || snapshot.card.height === 0)) {
    issues.push({
      severity: "error",
      code: "card-zero-size",
      message: "The wristband card has zero rendered size.",
    });
  }
  if (snapshot.wristbandType && snapshot.grid && (snapshot.grid.width === 0 || snapshot.grid.height === 0)) {
    issues.push({
      severity: "error",
      code: "grid-zero-size",
      message: "The wristband grid has zero rendered size.",
    });
  }
  if (expectedGridCells && snapshot.gridCellCount !== expectedGridCells) {
    issues.push({
      severity: "error",
      code: "grid-cell-count-mismatch",
      message: `${snapshot.wristbandType} wristband expected ${expectedGridCells} rendered grid cells, got ${snapshot.gridCellCount}.`,
    });
  }
  if (snapshot.wristbandType && snapshot.gridInnerHTMLLength === 0) {
    issues.push({
      severity: "error",
      code: "grid-empty-html",
      message: "The wristband grid has no rendered HTML.",
    });
  }
  if (snapshot.wristbandType === "player" && !snapshot.gridHasPlayerClass) {
    issues.push({
      severity: "error",
      code: "player-grid-class-missing",
      message: "Player mode is active but the grid is missing pc-grid-active.",
    });
  }
  if (snapshot.wristbandType !== "player" && snapshot.gridHasPlayerClass) {
    issues.push({
      severity: "warn",
      code: "player-grid-class-stale",
      message: "Player grid class is still present outside Player mode.",
    });
  }
  if (
    snapshot.wristbandType === "player" &&
    snapshot.playerModeBar &&
    snapshot.playerModeBar.display === "none"
  ) {
    issues.push({
      severity: "error",
      code: "player-bar-hidden",
      message: "Player mode is active but the player controls are hidden.",
    });
  }
  if (
    Number.isInteger(snapshot.currentCardIndex) &&
    (snapshot.currentCardIndex < 0 || snapshot.currentCardIndex >= snapshot.cardCount)
  ) {
    issues.push({
      severity: "error",
      code: "card-index-out-of-range",
      message: `currentCardIndex ${snapshot.currentCardIndex} is outside ${snapshot.cardCount} cards.`,
    });
  }
  if (snapshot.currentCardDataLength > 0 && snapshot.currentCardDataLength < snapshot.activeCellCount) {
    issues.push({
      severity: "warn",
      code: "short-card-data",
      message: `Current card has ${snapshot.currentCardDataLength} cells; active format expects at least ${snapshot.activeCellCount}.`,
    });
  }
  return issues;
}

function traceWristbandAction(phase, payload = {}, level = "info") {
  const snapshot = getWristbandTraceSnapshot(payload);
  const auditIssues = auditWristbandSnapshot(snapshot);
  if (auditIssues.length) snapshot.auditIssues = auditIssues;
  window.__bcWristbandTrace = Array.isArray(window.__bcWristbandTrace)
    ? window.__bcWristbandTrace
    : [];
  window.__bcWristbandTrace.push({ phase, level, snapshot });
  window.__bcWristbandTrace = window.__bcWristbandTrace.slice(-80);

  if (!isWristbandTraceEnabled() && level === "info") return snapshot;
  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  logger.call(console, `[BC wristband trace] ${phase}`, snapshot);
  if (typeof traceAppAction === "function") {
    traceAppAction(`wristband ${phase}`, {
      phaseAction: payload.action || "wristbandTrace",
      ...snapshot,
    }, {}, level);
  }
  return snapshot;
}

if (typeof window !== "undefined") {
  window.bcDebugWristband = function bcDebugWristband(opts = {}) {
    const snapshot = getWristbandTraceSnapshot(opts);
    const auditIssues = auditWristbandSnapshot(snapshot);
    if (auditIssues.length) snapshot.auditIssues = auditIssues;
    console.info("[BC wristband debug]", snapshot);
    if (auditIssues.length) console.table(auditIssues);
    if (snapshot.scrollAncestry) console.table(snapshot.scrollAncestry);
    return snapshot;
  };
  window.bcAuditWristband = function bcAuditWristband() {
    const snapshot = getWristbandTraceSnapshot();
    const issues = auditWristbandSnapshot(snapshot);
    const result = { ok: issues.length === 0, issues, snapshot };
    console.info("[BC wristband audit]", result);
    if (issues.length) console.table(issues);
    return result;
  };
  window.bcEnableWristbandTrace = function bcEnableWristbandTrace() {
    try {
      localStorage.setItem("bcWristbandTrace", "1");
    } catch (_err) {
      window.BC_WRISTBAND_TRACE = true;
    }
    window.BC_WRISTBAND_TRACE = true;
    return window.bcDebugWristband({ enabled: true });
  };
  window.bcDisableWristbandTrace = function bcDisableWristbandTrace() {
    try {
      localStorage.removeItem("bcWristbandTrace");
    } catch (_err) {
      /* ignore */
    }
    window.BC_WRISTBAND_TRACE = false;
    return true;
  };
}

function getCellMarkerValue(custom) {
  return custom.cadence || (custom.onTwo ? "$" : "");
}

function normalizePlayerRuleSources(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized = {};
  Object.entries(value).forEach(([basePosition, sourcePosition]) => {
    if (
      PLAYER_WRISTBAND_POSITION_KEYS.has(basePosition) &&
      PLAYER_WRISTBAND_POSITION_KEYS.has(sourcePosition) &&
      sourcePosition !== basePosition
    ) {
      normalized[basePosition] = sourcePosition;
    }
  });
  return normalized;
}

function normalizePlayerAssignmentOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized = {};
  Object.entries(value).forEach(([position, assignment]) => {
    if (!PLAYER_WRISTBAND_POSITION_KEYS.has(position)) return;
    normalized[position] =
      assignment === null || assignment === undefined ? "" : String(assignment);
  });
  return normalized;
}

function getPlayerRuleSource(custom, basePosition) {
  if (!PLAYER_WRISTBAND_POSITION_KEYS.has(basePosition)) return basePosition;
  const source = custom?.playerRuleSources?.[basePosition];
  return PLAYER_WRISTBAND_POSITION_KEYS.has(source) ? source : basePosition;
}

function getPlayerAssignmentText(play, custom, basePosition) {
  const overrides = custom?.playerAssignmentOverrides;
  if (
    overrides &&
    Object.prototype.hasOwnProperty.call(overrides, basePosition)
  ) {
    return String(overrides[basePosition] ?? "");
  }
  const sourcePosition = getPlayerRuleSource(custom, basePosition);
  return String(play?.[sourcePosition] || "");
}

function hasPlayerAssignmentCustomization(custom, basePosition) {
  return Boolean(
    custom?.playerRuleSources?.[basePosition] ||
    (custom?.playerAssignmentOverrides &&
      Object.prototype.hasOwnProperty.call(
        custom.playerAssignmentOverrides,
        basePosition,
      )),
  );
}

function getCellMarkerValues(custom) {
  if (Array.isArray(custom?.markers)) {
    return custom.markers.filter((marker) => typeof marker === "string" && marker.trim());
  }
  const legacyMarker = getCellMarkerValue(custom || {});
  return legacyMarker ? [legacyMarker] : [];
}

function getCellMarkerDisplay(markerValue) {
  if (!markerValue) return "";
  if (markerValue === "$") return "💲";
  if (markerValue === "$$") return "💲💲";
  return markerValue;
}

function getCellMarkerLabel(markerValue) {
  if (!markerValue) return "None";
  const option = WB_CELL_MARKER_OPTIONS.find((entry) => entry.value === markerValue);
  return option ? `${option.emoji} ${option.label}` : getCellMarkerDisplay(markerValue);
}

function getCellMarkerPlacement(custom, opts = {}) {
  if (WB_MARKER_PLACEMENTS.has(custom?.markerPlacement)) {
    return custom.markerPlacement;
  }
  if (getCellMarkerValue(custom || {})) {
    return opts.cadenceReminder ? "both" : "prefix";
  }
  return "prefix";
}

function getCellMarkerText(markers) {
  if (!Array.isArray(markers) || markers.length === 0) return "";
  return markers.map((marker) => getCellMarkerDisplay(marker)).filter(Boolean).join(" ");
}

/** Get display prefix for a cell's cadence setting (handles legacy onTwo boolean) */
function getCadencePrefix(custom, opts = {}) {
  const markerText = getCellMarkerText(getCellMarkerValues(custom));
  const placement = getCellMarkerPlacement(custom, opts);
  if (!markerText || placement === "suffix") return "";
  return `${markerText} `;
}

/** Get cadence postfix (same emoji repeated at end of cell) */
function getCadencePostfix(custom, opts = {}) {
  const markerText = getCellMarkerText(getCellMarkerValues(custom));
  const placement = getCellMarkerPlacement(custom, opts);
  if (!markerText || placement === "prefix") return "";
  return ` ${markerText}`;
}

function splitWristbandDisplayLineCall(renderedDisplay) {
  const lineCallMatch = renderedDisplay.match(/^(.*?)(\s*<span class="line-call">.*?<\/span>)$/);
  if (!lineCallMatch) {
    return { main: renderedDisplay, lineCall: "" };
  }

  return {
    main: lineCallMatch[1],
    lineCall: lineCallMatch[2],
  };
}

function composeWristbandCellDisplay(prefix, renderedDisplay, postfix) {
  const { main, lineCall } = splitWristbandDisplayLineCall(renderedDisplay);
  const leadingEmojiPrefix =
    main.match(/^((?:[🔴🔵🟢🟡🟠🟣🟤⚪⚫⭐🟥🟦🟩🟨🟧🟪🟫⬜⬛🍑]\s+)*)/u)?.[1] || "";
  const remainingMain = main.slice(leadingEmojiPrefix.length);
  return `${leadingEmojiPrefix}${prefix}${remainingMain}${postfix}${lineCall}`;
}

// ---------- Cell component reorder system ----------
// Canonical token IDs in default order. Each id maps to a renderer that
// produces an HTML fragment from (play, custom, opts). When the user has set
// `custom.componentOrder`, tokens are emitted in that order; tokens not
// listed in componentOrder fall back to canonical position. Empty tokens are
// dropped.
const WB_CELL_TOKEN_IDS = [
  "cadence-pre",
  "personnel",
  "extra-personnel",
  "pre-shift",
  "markers",
  "formation",
  "form-tag-1",
  "form-tag-2",
  "form-custom-tags",
  "under",
  "back",
  "back-custom-tags",
  "shift",
  "motion",
  "protection",
  "play",
  "play-tag-1",
  "play-tag-2",
  "write-in",
  "cadence-post",
  "line-call",
];

const WB_CELL_TOKEN_LABELS = {
  "cadence-pre": "Cadence (start)",
  "personnel": "Personnel",
  "extra-personnel": "Extra Personnel",
  "pre-shift": "Pre-Shift",
  "markers": "Markers ($ $)",
  "formation": "Formation",
  "form-tag-1": "Formation Tag 1",
  "form-tag-2": "Formation Tag 2",
  "form-custom-tags": "Formation (Custom Tags)",
  "under": "Under",
  "back": "Back",
  "back-custom-tags": "Back (Custom Tags)",
  "shift": "Shift",
  "motion": "Motion",
  "protection": "Protection",
  "play": "Play",
  "play-tag-1": "Play Tag 1",
  "play-tag-2": "Play Tag 2",
  "write-in": "Custom Write-In",
  "cadence-post": "Cadence (end)",
  "line-call": "Line Call",
};

const WB_CELL_VOWEL_TOKEN_IDS = new Set([
  "pre-shift", "formation", "form-tag-1", "form-tag-2", "under", "back",
  "shift", "motion", "protection", "play", "play-tag-1", "play-tag-2",
  "write-in", "line-call",
]);

function normalizeWbComponentNoVowels(ids) {
  return Array.isArray(ids)
    ? [...new Set(ids.filter((id) => WB_CELL_VOWEL_TOKEN_IDS.has(id)))]
    : [];
}

function buildWristbandCellTokens(play, custom = {}, opts = {}) {
  // Saved wristbands intentionally retain a play snapshot for offline safety,
  // but variant choices must always come from the current canonical Playbook
  // record. Otherwise a variant added after the card was built is invisible.
  const sourcePlay = typeof findPlaybookSourceForPlay === "function"
    ? findPlaybookSourceForPlay(play) || play
    : play;
  play = sourcePlay;
  const selectedVariantId = String(custom?.personnelVariantId || "base").trim() || "base";
  if (selectedVariantId !== "base" && typeof getEffectivePlayVariant === "function") {
    play = getEffectivePlayVariant(play, selectedVariantId) || play;
  }
  const {
    showEmoji = false,
    useSquares = false,
    underEmoji = false,
    boldShifts = false,
    redShifts = false,
    italicMotions = false,
    redMotions = false,
    noVowels = false,
    forceUppercase = false,
    showLineCall = true,
    hideProtection = false,
  } = opts;
  const shortenedComponents = new Set([
    ...normalizeWbComponentNoVowels(opts?.componentNoVowels),
    ...normalizeWbComponentNoVowels(custom?.componentNoVowels),
  ]);
  const textOptions = { noVowels, forceUppercase };

  const hasUnder =
    (play?.under && String(play.under).trim() !== "") ||
    (play?.formTag1 && String(play.formTag1).toLowerCase() === "under") ||
    (play?.formTag2 && String(play.formTag2).toLowerCase() === "under");

  const txt = (value, tokenId = "") => {
    if (value === null || value === undefined || value === "") return "";
    return escapeHtml(formatPlayCallText(value, { ...textOptions, noVowels: noVowels || shortenedComponents.has(tokenId) }));
  };

  // Markers
  const markerValues = getCellMarkerValues(custom);
  const markerText = getCellMarkerText(markerValues);
  const markerPlacement = getCellMarkerPlacement(custom, opts);
  const cadencePreText = markerText && markerPlacement !== "suffix" ? markerText : "";
  const cadencePostText = markerText && markerPlacement !== "prefix" ? markerText : "";

  // Personnel emoji (only in emoji mode for the play's own personnel)
  let personnelHtml = "";
  if (showEmoji && play?.personnel) {
    personnelHtml = getPersonnelEmoji(play.personnel, useSquares);
  } else if (!showEmoji && play?.personnel && custom?.extraPersonnel) {
    // In text-only mode, surface the play's personnel when an extra
    // personnel was set so the two render together.
    personnelHtml = escapeHtml(String(play.personnel).trim());
  }

  // Extra personnel
  let extraPersonnelHtml = "";
  const approvedDisplayIds = Array.isArray(custom?.personnelDisplayVariantIds)
    ? custom.personnelDisplayVariantIds
    : [];
  const approvedDisplayValues = typeof getPlayPersonnelOptions === "function"
    ? approvedDisplayIds
      .map((id) => getPlayPersonnelVariant(sourcePlay, id))
      .filter(Boolean)
      .map((option) => option.personnel)
      .filter((personnel) => personnel && personnel !== play?.personnel)
    : [];
  const extraPersonnelValues = [
    ...new Set([...approvedDisplayValues, ...getCustomExtraPersonnelValues(custom)]),
  ];
  if (extraPersonnelValues.length) {
    extraPersonnelHtml = extraPersonnelValues
      .map((tag) => {
        const emoji = showEmoji ? getPersonnelEmoji(tag, useSquares) : "";
        return emoji || escapeHtml(tag);
      })
      .join(" ");
  }

  // Pre-shift
  const preShiftValues = getCustomPreShiftValues(custom);
  const preShiftHtml = preShiftValues.length
    ? preShiftValues.map((value) => `(${escapeHtml(value)})`).join(" ")
    : "";

  // Custom formation/back tag groups
  const formCustomTagsHtml = getCustomTagText(getCustomFormationTagEntries(custom));
  const backCustomTagsHtml = getCustomTagText(getCustomBackTagEntries(custom));

  // Under handling
  const underVisibleAsText = play?.under && !(underEmoji && String(play.under).trim() !== "");
  const formTag1IsUnder = play?.formTag1 && String(play.formTag1).toLowerCase() === "under";
  const formTag2IsUnder = play?.formTag2 && String(play.formTag2).toLowerCase() === "under";
  const formTag1Visible = play?.formTag1 && !(underEmoji && formTag1IsUnder);
  const formTag2Visible = play?.formTag2 && !(underEmoji && formTag2IsUnder);
  const underEmojiHtml = underEmoji && hasUnder ? "🍑" : "";

  // Shift / motion with formatting
  let shiftHtml = "";
  if (play?.shift) {
    let s = txt(play.shift, "shift");
    if (boldShifts) s = `<b>${s}</b>`;
    if (redShifts) s = `<span class="text-danger">${s}</span>`;
    shiftHtml = s;
  }
  let motionHtml = "";
  if (play?.motion) {
    let m = txt(play.motion, "motion");
    if (italicMotions) m = `<i>${m}</i>`;
    if (redMotions) m = `<span class="text-danger">${m}</span>`;
    motionHtml = m;
  }

  const lineCallHtml = showLineCall && play?.lineCall
    ? `<span class="line-call">[${txt(play.lineCall, "line-call")}]</span>`
    : "";

  return {
    "cadence-pre": cadencePreText,
    "personnel": personnelHtml,
    "extra-personnel": extraPersonnelHtml,
    "pre-shift": preShiftValues.length ? preShiftValues.map((value) => `(${txt(value, "pre-shift")})`).join(" ") : "",
    "markers": "", // markers render via cadence-pre / cadence-post by default; this slot is reserved when user overrides order
    "formation": txt(play?.formation, "formation"),
    "form-tag-1": formTag1Visible ? txt(play.formTag1, "form-tag-1") : "",
    "form-tag-2": formTag2Visible ? txt(play.formTag2, "form-tag-2") : "",
    "form-custom-tags": formCustomTagsHtml,
    "under": underEmojiHtml || (underVisibleAsText ? txt(play.under, "under") : ""),
    "back": txt(play?.back, "back"),
    "back-custom-tags": backCustomTagsHtml,
    "shift": shiftHtml,
    "motion": motionHtml,
    "protection": !hideProtection && play?.protection ? txt(play.protection, "protection") : "",
    "play": play?.play
      ? `<span class="wristband-play-name">${txt(play.play, "play")}</span>`
      : "",
    "play-tag-1": txt(play?.playTag1, "play-tag-1"),
    "play-tag-2": txt(play?.playTag2, "play-tag-2"),
    "write-in": custom?.customWriteIn
      ? `<span class="cell-write-in">${txt(String(custom.customWriteIn).trim(), "write-in")}</span>`
      : "",
    "cadence-post": cadencePostText,
    "line-call": lineCallHtml,
  };
}

function getWristbandCanonicalPlaySource(play) {
  if (!play) return play;
  return typeof findPlaybookSourceForPlay === "function"
    ? findPlaybookSourceForPlay(play) || play
    : play;
}

function normalizeWbComponentOrder(order) {
  if (!Array.isArray(order)) return null;
  const seen = new Set();
  const result = [];
  order.forEach((id) => {
    if (typeof id === "string" && WB_CELL_TOKEN_LABELS[id] && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  });
  // Append any canonical ids missing from the user's order so we never lose
  // tokens silently.
  WB_CELL_TOKEN_IDS.forEach((id) => {
    if (!seen.has(id)) result.push(id);
  });
  return result;
}

function composeWristbandCellHtml(play, custom = {}, opts = {}) {
  if (!play) return "";
  const tokens = buildWristbandCellTokens(play, custom, opts);
  const order = normalizeWbComponentOrder(custom?.componentOrder) || WB_CELL_TOKEN_IDS;
  const usingCustomOrder = Array.isArray(custom?.componentOrder) && custom.componentOrder.length > 0;
  const parts = [];
  order.forEach((id) => {
    let html = tokens[id] || "";
    // When the user has set a custom order, the dedicated "markers" token
    // is honored as a single marker emission; cadence-pre/post are skipped
    // so markers render exactly once.
    if (usingCustomOrder) {
      if (id === "markers") {
        html = getCellMarkerText(getCellMarkerValues(custom));
      }
      if (id === "cadence-pre" || id === "cadence-post") {
        html = ""; // suppressed in favor of the consolidated markers slot
      }
    }
    if (html) parts.push(html);
  });
  return parts.join(" ").trim();
}

function isWristbandWriteInInComponentOrder(custom = {}) {
  return Array.isArray(custom?.componentOrder) && custom.componentOrder.includes("write-in");
}

function renderWristbandCellWriteIn(custom = {}, { forceStandalone = false } = {}) {
  if (!custom?.customWriteIn || (!forceStandalone && isWristbandWriteInInComponentOrder(custom))) return "";
  return `<span class="cell-write-in">${escapeHtml(String(custom.customWriteIn).trim())}</span>`;
}
// ---------- end token system ----------

// Keep existing string-backed cards compatible while allowing the editor to
// manage several extra personnel labels on one cell.
function getCustomExtraPersonnelValues(custom = {}) {
  const source = Array.isArray(custom?.extraPersonnel)
    ? custom.extraPersonnel
    : String(custom?.extraPersonnel || "").split(/[;,]/);
  return [...new Set(source.map((value) => String(value || "").trim()).filter(Boolean))];
}

/** Get custom extra personnel prefix for a wristband cell */
function getCustomPersonnelPrefix(custom, opts, play) {
  const tags = getCustomExtraPersonnelValues(custom);
  if (!tags.length) return "";
  if (opts.showEmoji) {
    // Emoji mode: composeWristbandCellDisplay slots this right after the
    // play's personnel emoji, so they render side-by-side already.
    return tags.map((tag) => {
      const emoji = getPersonnelEmoji(tag, opts.useSquares);
      return emoji || escapeHtml(tag);
    }).join(" ") + " ";
  }
  // Text-only mode: getFullCall doesn't render the play's own personnel, so
  // an extra-personnel value would otherwise float alone before the
  // formation. Show both numbers grouped together (e.g. "11 10 Rex Snug…").
  const playPersonnel = String(play?.personnel || "").trim();
  const tagText = tags.map((tag) => escapeHtml(tag)).join(" ");
  return playPersonnel
    ? `${escapeHtml(playPersonnel)} ${tagText} `
    : `${tagText} `;
}

function normalizeCustomTagDisplayMode(mode) {
  return WB_CUSTOM_TAG_DISPLAY_MODES[mode] ? mode : "full";
}

function normalizeCustomTagEntry(entry) {
  const rawValue = typeof entry === "string" ? entry : entry?.value || "";
  const value = normalizeParenValue(rawValue);
  if (!value) return null;
  return {
    value,
    display: normalizeCustomTagDisplayMode(entry?.display),
  };
}

function getCustomParenValues(custom, prop) {
  if (!custom || !custom[prop]) return [];
  return String(custom[prop])
    .split(/[;,|]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getCustomTagEntries(custom, prop) {
  if (!custom || !custom[prop]) return [];
  const rawValue = custom[prop];
  if (Array.isArray(rawValue)) {
    return rawValue.map((entry) => normalizeCustomTagEntry(entry)).filter(Boolean);
  }
  return String(rawValue)
    .split(/[;,|]+/)
    .map((value) => normalizeCustomTagEntry(value))
    .filter(Boolean);
}

function getCustomPreShiftValues(custom) {
  return getCustomParenValues(custom, "preShift");
}

function getCustomFormationTagEntries(custom) {
  return getCustomTagEntries(custom, "formationTags");
}

function getCustomBackTagEntries(custom) {
  return getCustomTagEntries(custom, "backTags");
}

function getParenValuePrefix(values) {
  if (!values.length) return "";
  return `${values.map((value) => `(${escapeHtml(value)})`).join(" ")} `;
}

function getCustomPreShiftPrefix(custom) {
  return getParenValuePrefix(getCustomPreShiftValues(custom));
}

function formatCustomTagEntry(entry) {
  const normalizedEntry = normalizeCustomTagEntry(entry);
  if (!normalizedEntry) return "";

  if (normalizedEntry.display === "no-vowels") {
    return removeVowels(normalizedEntry.value) || normalizedEntry.value.charAt(0);
  }
  if (normalizedEntry.display === "initial") {
    return normalizedEntry.value.charAt(0).toUpperCase();
  }
  return normalizedEntry.value;
}

function getCustomTagText(entries) {
  const formattedEntries = entries
    .map((entry) => formatCustomTagEntry(entry))
    .filter(Boolean);
  if (!formattedEntries.length) return "";
  return formattedEntries.map((value) => `(${value})`).join(" ");
}

function getCustomDisplayPlay(play, custom) {
  if (!play) return play;

  const formationTagText = getCustomTagText(getCustomFormationTagEntries(custom));
  const backTagText = getCustomTagText(getCustomBackTagEntries(custom));
  if (!formationTagText && !backTagText) return play;

  const displayPlay = { ...play };
  if (formationTagText) {
    if (displayPlay.formTag2 && String(displayPlay.formTag2).trim()) {
      displayPlay.formTag2 = `${displayPlay.formTag2} ${formationTagText}`;
    } else if (displayPlay.formTag1 && String(displayPlay.formTag1).trim()) {
      displayPlay.formTag2 = formationTagText;
    } else {
      displayPlay.formTag1 = formationTagText;
    }
  }

  if (backTagText) {
    displayPlay.back = displayPlay.back
      ? `${displayPlay.back} ${backTagText}`
      : backTagText;
  }

  return displayPlay;
}

function getCustomTagModeMeta(mode) {
  return WB_CUSTOM_TAG_DISPLAY_MODES[normalizeCustomTagDisplayMode(mode)];
}

function normalizePreShiftValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeParenValue(value) {
  return normalizePreShiftValue(value);
}

function renderPendingParenList(listId, values, removeAction, emptyLabel, cycleAction) {
  const list = document.getElementById(listId);
  if (!list) return;

  if (!values.length) {
    list.innerHTML = `<span class="cell-tag-empty">${emptyLabel}</span>`;
    return;
  }

  list.innerHTML = values
    .map(
      (entry, index) => {
        const normalizedEntry = normalizeCustomTagEntry(entry);
        const modeMeta = getCustomTagModeMeta(normalizedEntry?.display);
        return `
        <span class="cell-tag-chip">
          <span>${escapeHtml(normalizedEntry?.value || "")}</span>
          ${cycleAction
            ? `<button
            type="button"
            class="cell-tag-mode"
            data-action="${cycleAction}"
            data-arg="${index}"
            aria-label="Change display mode for ${escapeHtml(normalizedEntry?.value || "")}; current mode ${escapeHtml(modeMeta.label)}"
            title="Display mode: ${escapeHtml(modeMeta.label)}"
          >
            ${escapeHtml(modeMeta.shortLabel)}
          </button>`
            : ""}
          <button
            type="button"
            class="cell-tag-remove"
            data-action="${removeAction}"
            data-arg="${index}"
            aria-label="Remove ${escapeHtml(normalizedEntry?.value || "")}"
            title="Remove ${escapeHtml(normalizedEntry?.value || "")}"
          >
            ×
          </button>
        </span>
      `;
      },
    )
    .join("");
}

/** Slightly lighten or darken a color for alternating row shading */
function shadeColor(color, amount) {
  if (!color || color === "transparent") return "";
  // Parse hex
  let hex = color.replace("#", "");
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function getCellBgColor(custom, isHuddle, isCandy, row, cardColor) {
  if (custom?.bgColor) {
    return row % 2 === 1 ? shadeColor(custom.bgColor, 18) : custom.bgColor;
  }
  if (isHuddle) return UI_COLORS.highlightHuddle;
  if (isCandy) return UI_COLORS.highlightCandy;
  if (cardColor && cardColor !== "transparent") {
    return row % 2 === 1 ? shadeColor(cardColor, 18) : cardColor;
  }
  return row % 2 === 1 ? "#f4f4f4" : "";
}

/** Build line-call-only display: optional visual cues + the line call, without the full play call. */
function getLineCallOnlyDisplay(play, opts, custom = null) {
  let prefix = "";
  if (opts.showEmoji && play.personnel) {
    prefix += `${getPersonnelEmoji(play.personnel, opts.useSquares)} `;
  }
  const hasUnder =
    (play.under && play.under.trim() !== "") ||
    (play.formTag1 && play.formTag1.toLowerCase() === "under") ||
    (play.formTag2 && play.formTag2.toLowerCase() === "under");
  if (opts.underEmoji && hasUnder) {
    prefix += "🍑 ";
  }
  const cadencePre = custom ? getCadencePrefix(custom, opts) : "";
  const cadencePost = custom ? getCadencePostfix(custom, opts) : "";
  const rawLineCall = String(play.lineCall || "").trim();
  const displayLineCall =
    opts.noVowels && rawLineCall ? removeVowels(rawLineCall) : rawLineCall;
  const body = displayLineCall
    ? `<span class="line-call line-call-only">${escapeHtml(displayLineCall)}</span>`
    : '<span class="line-call line-call-only line-call-empty">NO LINE CALL</span>';
  const out = `${prefix}${cadencePre}${body}${cadencePost}`.trim();
  return out;
}

function renderWristbandCellCall(play, custom = {}, opts = {}) {
  if (!play) return "";
  if (opts.lineCallOnly) {
    return getLineCallOnlyDisplay(play, opts, custom);
  }
  if (Array.isArray(custom.componentOrder) && custom.componentOrder.length > 0) {
    return composeWristbandCellHtml(play, custom, opts);
  }
  const prefix =
    getCadencePrefix(custom, opts) +
    getCustomPersonnelPrefix(custom, opts, play) +
    getCustomPreShiftPrefix(custom);
  const display = getFullCall(getCustomDisplayPlay(play, custom), {
    ...opts,
    wrapPlayName: true,
  });
  const postfix = getCadencePostfix(custom, opts);
  return composeWristbandCellDisplay(prefix, display, postfix);
}

// Arrow key highlight index in cell popup
let highlightedPlayIndex = -1;

// Autosave timer
let wristbandAutosaveTimer = null;

function scheduleWristbandAutosave() {
  wristbandAutosaveTimer = queueAutosave(
    wristbandAutosaveTimer,
    () => {
      const cellsPerCard = getActiveWristbandCellCount();
      const totalPlays = wristbandCards.reduce(
        (sum, card) =>
          sum +
          (card.data
            ? card.data.slice(0, cellsPerCard).filter((play) => play !== null).length
            : 0),
        0,
      );

      if (totalPlays === 0) {
        discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
        if (typeof updateSaveStatus === "function") updateSaveStatus("saved");
        return;
      }

      persistDraftData(STORAGE_KEYS.WRISTBAND_DRAFT, {
        wristbandType: wristbandType || "classic",
        headerColor: wristbandHeaderColor,
        cards: safeDeepClone(wristbandCards),
        cellStyles: safeDeepClone(cellCustomizations),
        favorites: safeDeepClone(wbFavorites),
        displaySettings: getWristbandDisplayOptions(),
        currentCardIndex,
        activeSaveId: activeWristbandSaveId,
        activeTitle: activeWristbandTitle,
        activeSavedAt: activeWristbandSavedAt,
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
 * Check for and offer to restore a wristband draft
 */
async function checkWristbandDraft() {
  try {
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("draft check start", { action: "checkWristbandDraft" });
    }
    const draft = storageManager.get(STORAGE_KEYS.WRISTBAND_DRAFT, null);
    if (!draft || !draft.cards || draft.cards.length === 0) {
      if (typeof traceWristbandAction === "function") {
        traceWristbandAction("draft check none", { action: "checkWristbandDraft" });
      }
      return;
    }

    if (isDraftExpired(draft)) {
      discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
      if (typeof traceWristbandAction === "function") {
        traceWristbandAction("draft expired", {
          action: "checkWristbandDraft",
          draftType: draft.wristbandType || "",
        });
      }
      return;
    }

    const draftCellsPerCard = getWristbandRecordCellCount(draft);
    const draftPlays = draft.cards.reduce(
      (sum, c) =>
        sum +
        (c.data
          ? c.data.slice(0, draftCellsPerCard).filter((p) => p !== null).length
          : 0),
      0,
    );
    if (draftPlays === 0) {
      if (typeof traceWristbandAction === "function") {
        traceWristbandAction("draft empty", {
          action: "checkWristbandDraft",
          draftType: draft.wristbandType || "",
        });
      }
      return;
    }

    // Only offer if current wristband is empty
    const currentCellsPerCard = getActiveWristbandCellCount();
    const currentPlays = wristbandCards.reduce(
      (sum, c) =>
        sum +
        (c.data
          ? c.data.slice(0, currentCellsPerCard).filter((p) => p !== null).length
          : 0),
      0,
    );
    if (currentPlays > 0) {
      if (typeof traceWristbandAction === "function") {
        traceWristbandAction("draft skipped existing current", {
          action: "checkWristbandDraft",
          draftType: draft.wristbandType || "",
          draftPlays,
          currentPlays,
        });
      }
      return;
    }

    const savedTime = formatDraftSavedAt(draft);

    const doRestore = await showConfirm(
      `Found unsaved wristband draft!\n\n${draftPlays} plays across ${draft.cards.length} card(s)\nLast edited: ${savedTime}\n\nRestore it?`,
      {
        title: "🃏 Draft Found",
        icon: "🃏",
        confirmText: "Restore",
        cancelText: "Discard",
      },
    );
    if (doRestore) {
      if (typeof traceWristbandAction === "function") {
        traceWristbandAction("draft restore accepted", {
          action: "checkWristbandDraft",
          draftType: draft.wristbandType || "",
          draftPlays,
        });
      }
      hydrateWristbandState(draft, { markDirty: true });
      if (draft.wristbandType === "player") {
        startPlayerWristband();
      } else {
        startClassicWristband();
      }
      showToast("🃏 Draft restored");
    } else {
      if (typeof traceWristbandAction === "function") {
        traceWristbandAction("draft restore declined", {
          action: "checkWristbandDraft",
          draftType: draft.wristbandType || "",
          draftPlays,
        });
      }
      discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
    }
  } catch (err) {
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("draft check error", {
        action: "checkWristbandDraft",
        error: err && err.message ? err.message : String(err),
      }, "error");
    }
    console.error("checkWristbandDraft error:", err);
    showToast("❌ Error restoring wristband draft.", {
      duration: 3000,
      type: "error",
    });
  }
}

// ============ Cell Drag-and-Drop for Swapping ============

/**
 * Get current wristband state for history
 */
function getWristbandState() {
  return {
    wristbandType,
    cards: safeDeepClone(wristbandCards),
    customizations: safeDeepClone(cellCustomizations),
    currentCardIndex: currentCardIndex,
  };
}

/**
 * Save wristband state before making changes (for undo)
 */
function saveWristbandState() {
  historyManager.saveState("wristband", getWristbandState());
  markWristbandDirty();
  scheduleWristbandAutosave();
}

function mutateWristbandState(mutate, opts = {}) {
  if (typeof mutate !== "function") return;
  saveWristbandState();
  mutate();
  if (opts.renderPlays) {
    renderWristbandPlays();
  }
  if (opts.refreshCardView !== false) {
    refreshWristbandCardView({
      updateCardColorPicker: !!opts.updateCardColorPicker,
    });
  }
}

function buildWristbandCellCustomization(custom = {}) {
  const uniqueStrings = (values) => [...new Set(values.filter(Boolean))];
  const uniqueTagEntries = (values) => {
    const seen = new Set();
    return values.filter((entry) => {
      const key = `${entry.value}\u0000${entry.display}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const hasCustomOrder = Array.isArray(custom.componentOrder) && custom.componentOrder.length > 0;
  const normalized = {
    bgColor: custom.bgColor || "",
    textColor: custom.textColor || UI_COLORS.textBlack,
    markers: uniqueStrings(
      Array.isArray(custom.markers)
        ? custom.markers.map((marker) => String(marker || "").trim())
        : getCellMarkerValues(custom),
    ),
    markerPlacement: custom.markerPlacement || "prefix",
    extraPersonnel: getCustomExtraPersonnelValues(custom).join("; "),
    personnelVariantId: String(custom.personnelVariantId || "").trim() === "base"
      ? ""
      : String(custom.personnelVariantId || "").trim(),
    personnelDisplayVariantIds: Array.isArray(custom.personnelDisplayVariantIds)
      ? [...new Set(custom.personnelDisplayVariantIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [],
    preShift: uniqueStrings(getCustomPreShiftValues(custom)).join("; "),
    formationTags: uniqueTagEntries(getCustomFormationTagEntries(custom)),
    backTags: uniqueTagEntries(getCustomBackTagEntries(custom)),
    componentOrder: hasCustomOrder ? normalizeWbComponentOrder(custom.componentOrder) : [],
    componentNoVowels: normalizeWbComponentNoVowels(custom.componentNoVowels),
    customWriteIn: String(custom.customWriteIn || "").trim(),
    playerRuleSources: normalizePlayerRuleSources(custom.playerRuleSources),
    playerAssignmentOverrides: normalizePlayerAssignmentOverrides(
      custom.playerAssignmentOverrides,
    ),
  };

  const hasValue =
    normalized.bgColor ||
    normalized.textColor !== UI_COLORS.textBlack ||
    normalized.markers.length > 0 ||
    normalized.extraPersonnel ||
    normalized.personnelVariantId ||
    normalized.personnelDisplayVariantIds.length > 0 ||
    normalized.preShift ||
    normalized.formationTags.length > 0 ||
    normalized.backTags.length > 0 ||
    normalized.componentOrder.length > 0 ||
    normalized.componentNoVowels.length > 0 ||
    normalized.customWriteIn ||
    Object.keys(normalized.playerRuleSources).length > 0 ||
    Object.keys(normalized.playerAssignmentOverrides).length > 0;

  return hasValue ? normalized : null;
}

function normalizeWristbandCellCustomizations(source, cards = wristbandCards) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const cellCount = getActiveWristbandCellCount();
  const normalized = {};
  Object.entries(source).forEach(([key, custom]) => {
    const match = /^(\d+)-(\d+)$/.exec(String(key));
    if (!match) return;
    const cardIdx = Number(match[1]);
    const cellIdx = Number(match[2]);
    if (!Number.isInteger(cardIdx) || !Number.isInteger(cellIdx)) return;
    if (!Array.isArray(cards?.[cardIdx]?.data) || cellIdx < 0 || cellIdx >= cellCount) return;
    const next = buildWristbandCellCustomization(custom);
    if (next) normalized[getWristbandCellCustomizationKey(cardIdx, cellIdx)] = next;
  });
  return normalized;
}

function setWristbandCellCustomization(key, custom) {
  const normalized = buildWristbandCellCustomization(custom);
  if (normalized) {
    cellCustomizations[key] = normalized;
  } else {
    delete cellCustomizations[key];
  }
}

function getWristbandCellCustomizationKey(cardIdx, cellIdx) {
  return `${cardIdx}-${cellIdx}`;
}

function shiftWristbandCardCustomizationIndices(startCardIdx, delta) {
  if (!Number.isInteger(startCardIdx) || !Number.isInteger(delta) || delta === 0) {
    return;
  }

  const entries = Object.entries(cellCustomizations)
    .map(([key, value]) => {
      const [cardIdxText, cellIdxText] = key.split("-");
      const cardIdx = parseInt(cardIdxText, 10);
      const cellIdx = parseInt(cellIdxText, 10);
      if (!Number.isInteger(cardIdx) || !Number.isInteger(cellIdx)) return null;
      return { key, value, cardIdx, cellIdx };
    })
    .filter((entry) => entry && entry.cardIdx >= startCardIdx)
    .sort((left, right) => {
      if (delta > 0) {
        if (left.cardIdx !== right.cardIdx) return right.cardIdx - left.cardIdx;
        return right.cellIdx - left.cellIdx;
      }
      if (left.cardIdx !== right.cardIdx) return left.cardIdx - right.cardIdx;
      return left.cellIdx - right.cellIdx;
    });

  entries.forEach(({ key, value, cardIdx, cellIdx }) => {
    delete cellCustomizations[key];
    cellCustomizations[getWristbandCellCustomizationKey(cardIdx + delta, cellIdx)] = value;
  });
}

function moveWristbandCellCustomization(
  sourceCardIdx,
  sourceCellIdx,
  targetCardIdx,
  targetCellIdx,
  opts = {},
) {
  const sourceKey = getWristbandCellCustomizationKey(sourceCardIdx, sourceCellIdx);
  const targetKey = getWristbandCellCustomizationKey(targetCardIdx, targetCellIdx);
  const sourceCustom = cellCustomizations[sourceKey];

  if (sourceCustom) {
    cellCustomizations[targetKey] = opts.clone
      ? safeDeepClone(sourceCustom)
      : sourceCustom;
  } else {
    delete cellCustomizations[targetKey];
  }

  if (opts.removeSource !== false) {
    delete cellCustomizations[sourceKey];
  }
}

/**
 * Atomically swap the customizations of two wristband cells.
 * Called by handleCellDrop after swapping cell data.
 */
function swapWristbandCellCustomizations(
  cardIdxA,
  cellIdxA,
  cardIdxB,
  cellIdxB,
) {
  const keyA = getWristbandCellCustomizationKey(cardIdxA, cellIdxA);
  const keyB = getWristbandCellCustomizationKey(cardIdxB, cellIdxB);
  const customA = cellCustomizations[keyA];
  const customB = cellCustomizations[keyB];
  if (customB) {
    cellCustomizations[keyA] = customB;
  } else {
    delete cellCustomizations[keyA];
  }
  if (customA) {
    cellCustomizations[keyB] = customA;
  } else {
    delete cellCustomizations[keyB];
  }
}

function getRemappedWristbandCellCustomizations(
  mappings,
  sourceCustomizations = cellCustomizations,
) {
  const sourceMap = { ...sourceCustomizations };
  const nextCustomizations = {};

  mappings.forEach((mapping) => {
    const sourceKey = getWristbandCellCustomizationKey(
      mapping.sourceCardIdx,
      mapping.sourceCellIdx,
    );
    const targetKey = getWristbandCellCustomizationKey(
      mapping.targetCardIdx,
      mapping.targetCellIdx,
    );
    const sourceCustom = sourceMap[sourceKey];

    if (sourceCustom) {
      nextCustomizations[targetKey] = mapping.clone
        ? safeDeepClone(sourceCustom)
        : sourceCustom;
    }
  });

  return nextCustomizations;
}

function rebuildWristbandCellCustomizations(mappings, opts = {}) {
  const remappedCustomizations = getRemappedWristbandCellCustomizations(
    mappings,
    opts.sourceCustomizations || cellCustomizations,
  );
  const nextCustomizations = opts.clearAll ? {} : { ...cellCustomizations };

  if (Array.isArray(opts.clearCardIndices)) {
    opts.clearCardIndices.forEach((cardIdx) => {
      if (!Number.isInteger(cardIdx)) return;
      for (let cellIdx = 0; cellIdx < CELLS_PER_CARD; cellIdx++) {
        delete nextCustomizations[getWristbandCellCustomizationKey(cardIdx, cellIdx)];
      }
    });
  }

  Object.assign(nextCustomizations, remappedCustomizations);

  cellCustomizations = nextCustomizations;
}

function refreshWristbandEditorView(opts = {}) {
  renderWristbandPlays();
  refreshWristbandCardView({
    updateCardColorPicker: !!opts.updateCardColorPicker,
  });
}

/**
 * Undo last wristband action
 */
function undoWristband() {
  const previousState = historyManager.undo("wristband", getWristbandState());
  if (previousState) {
    wristbandType = previousState.wristbandType || wristbandType || "classic";
    wbPlayerCardMode = wristbandType === "player";
    wristbandCards = previousState.cards;
    cellCustomizations = previousState.customizations;
    currentCardIndex = previousState.currentCardIndex;
    if (wristbandType === "player") {
      startPlayerWristband();
    } else {
      startClassicWristband();
    }
    markWristbandDirty();
    scheduleWristbandAutosave();
  }
}

/**
 * Redo last undone wristband action
 */
function redoWristband() {
  const futureState = historyManager.redo("wristband", getWristbandState());
  if (futureState) {
    wristbandType = futureState.wristbandType || wristbandType || "classic";
    wbPlayerCardMode = wristbandType === "player";
    wristbandCards = futureState.cards;
    cellCustomizations = futureState.customizations;
    currentCardIndex = futureState.currentCardIndex;
    if (wristbandType === "player") {
      startPlayerWristband();
    } else {
      startClassicWristband();
    }
    markWristbandDirty();
    scheduleWristbandAutosave();
  }
}

function getWbDisplayOptionIds() {
  return [
    "wbShowEmoji",
    "wbUseSquares",
    "wbUnderEmoji",
    "wbBoldShifts",
    "wbRedShifts",
    "wbItalicMotions",
    "wbRedMotions",
    "wbRemoveVowels",
    "wbNoVowelsFormation",
    "wbNoVowelsShift",
    "wbNoVowelsMotion",
    "wbNoVowelsProtection",
    "wbNoVowelsPlayTags",
    "wbForceUppercase",
    "wbShowLineCall",
    "wbLineCallOnly",
    "wbBlankPlayerRules",
    "wbCadenceReminder",
    "wbHighlightHuddle",
    "wbHighlightCandy",
  ];
}

const WB_DISPLAY_PRESETS = {
  minimal: {
    wbShowEmoji: false,
    wbUseSquares: false,
    wbUnderEmoji: false,
    wbBoldShifts: false,
    wbRedShifts: false,
    wbItalicMotions: false,
    wbRedMotions: false,
    wbRemoveVowels: false,
    wbNoVowelsFormation: false, wbNoVowelsShift: false, wbNoVowelsMotion: false, wbNoVowelsProtection: false, wbNoVowelsPlayTags: false,
    wbForceUppercase: false,
    wbShowLineCall: true,
    wbLineCallOnly: false,
    wbBlankPlayerRules: false,
    wbCadenceReminder: false,
    wbHighlightHuddle: false,
    wbHighlightCandy: false,
  },
  standard: {
    wbShowEmoji: true,
    wbUseSquares: false,
    wbUnderEmoji: false,
    wbBoldShifts: false,
    wbRedShifts: false,
    wbItalicMotions: false,
    wbRedMotions: false,
    wbRemoveVowels: false,
    wbNoVowelsFormation: false, wbNoVowelsShift: false, wbNoVowelsMotion: false, wbNoVowelsProtection: false, wbNoVowelsPlayTags: false,
    wbForceUppercase: false,
    wbShowLineCall: true,
    wbLineCallOnly: false,
    wbBlankPlayerRules: false,
    wbCadenceReminder: false,
    wbHighlightHuddle: false,
    wbHighlightCandy: false,
  },
  full: {
    wbShowEmoji: true,
    wbUseSquares: true,
    wbUnderEmoji: true,
    wbBoldShifts: true,
    wbRedShifts: true,
    wbItalicMotions: true,
    wbRedMotions: true,
    wbRemoveVowels: false,
    wbNoVowelsFormation: false, wbNoVowelsShift: false, wbNoVowelsMotion: false, wbNoVowelsProtection: false, wbNoVowelsPlayTags: false,
    wbForceUppercase: false,
    wbShowLineCall: true,
    wbLineCallOnly: false,
    wbBlankPlayerRules: false,
    wbCadenceReminder: true,
    wbHighlightHuddle: true,
    wbHighlightCandy: true,
  },
};

function syncWristbandLineCallOnlyControls(source = "classic") {
  const classic = document.getElementById("wbLineCallOnly");
  const player = document.getElementById("pcLineCallOnly");
  if (!classic || !player) return;
  if (source === "player") {
    classic.checked = player.checked;
  } else {
    player.checked = classic.checked;
  }
}

function syncWristbandBlankPlayerRulesControls(source = "classic") {
  const display = document.getElementById("wbBlankPlayerRules");
  const player = document.getElementById("pcBlankPlayerRules");
  if (!display || !player) return;
  if (source === "player") {
    display.checked = player.checked;
  } else {
    player.checked = display.checked;
  }
}

function syncWbDisplayPresetSelection() {
  const matchingPreset = Object.entries(WB_DISPLAY_PRESETS).find(
    ([, config]) =>
      Object.entries(config).every(
        ([id, checked]) =>
          document.getElementById(id)?.checked === checked,
      ),
  )?.[0];
  document
    .querySelectorAll('input[name="wbDisplayPreset"]')
    .forEach((radio) => {
      radio.checked = radio.value === matchingPreset;
    });
}

function commitWristbandDisplayOptions() {
  syncWbDisplayPresetSelection();
  refreshWristbandEditorView();
  markWristbandDirty();
  scheduleWristbandAutosave();
}

function handleWristbandDisplayOptionsChange() {
  syncWristbandLineCallOnlyControls("classic");
  syncWristbandBlankPlayerRulesControls("classic");
  commitWristbandDisplayOptions();
  if (typeof showToast === "function") {
    showToast("Wristband display updated", { duration: 1300 });
  }
}

function handlePlayerLineCallOnlyChange() {
  syncWristbandLineCallOnlyControls("player");
  commitWristbandDisplayOptions();
}

function handlePlayerBlankRulesChange() {
  syncWristbandBlankPlayerRulesControls("player");
  commitWristbandDisplayOptions();
}

/**
 * Select all display options for wristband
 */
function selectAllWbOptions() {
  getWbDisplayOptionIds().forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = id !== "wbLineCallOnly" && id !== "wbBlankPlayerRules";
  });
  syncWristbandLineCallOnlyControls("classic");
  syncWristbandBlankPlayerRulesControls("classic");
  commitWristbandDisplayOptions();
}

/**
 * Clear all display options for wristband
 */
function clearAllWbOptions() {
  getWbDisplayOptionIds().forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  syncWristbandLineCallOnlyControls("classic");
  syncWristbandBlankPlayerRulesControls("classic");
  commitWristbandDisplayOptions();
}

/**
 * Apply display preset (Minimal/Standard/Full)
 */
function applyWbDisplayPreset(preset) {
  const config = WB_DISPLAY_PRESETS[preset] || WB_DISPLAY_PRESETS.standard;

  // Apply all checkboxes from preset
  Object.entries(config).forEach(([id, checked]) => {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
  });
  syncWristbandLineCallOnlyControls("classic");
  syncWristbandBlankPlayerRulesControls("classic");
  commitWristbandDisplayOptions();
  if (typeof showToast === "function") {
    const name = WB_DISPLAY_PRESETS[preset] ? preset : "standard";
    showToast(`Wristband display: ${name} preset`, { duration: 1400 });
  }
}

/* toggleWbDisplayOptions and toggleWbSortPanel merged into shared toggleCollapsiblePanel() in utils.js */

// ============ Cmd+K Quick Search ============

/**
 * Open the quick search overlay (Cmd+K)
 */
// ============ Container-Scoped Delegation ============

// ── Moved from utils.js ──────────────────────────
function getWristbandRecordCellCount(record) {
  return record?.wristbandType === "player" ? WB_ROWS : CELLS_PER_CARD;
}
