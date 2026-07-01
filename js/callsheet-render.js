// Call Sheet Render Layer
// Pure UI rendering functions extracted from callsheet.js
// Depends on: callsheet state (callSheet, callSheetSettings, csSortCriteria, etc.)
//            callsheet-categories.js (getCategoryDisplayName, getCategoryColor)
//            storage.js, utils.js, dom-helpers.js, tendencies.js

// ============ CONSTANTS (replicated from callsheet.js) ============

// Centralized category color palette (mirrors CSS --cat-* tokens)
const CS_COLORS = {
  red: "#dc3545",
  yellow: "#ffc107",
  orange: "#fd7e14",
  green: "#28a745",
  blue: "#007bff",
  purple: "#6f42c1",
  teal: "#17a2b8",
  gray: "#6c757d",
};

// Call sheet categories with colors and filters - FRONT PAGE
const CALLSHEET_FRONT = [
  // Row 1
  {
    id: "2nd-medium",
    name: "2nd Down Medium (4-6)",
    color: CS_COLORS.red,
    down: "2",
    distance: "Medium",
    position: null,
  },
  {
    id: "2nd-long",
    name: "2nd and Long (7+)",
    color: CS_COLORS.red,
    down: "2",
    distance: "Long",
    position: null,
  },
  {
    id: "3rd-short-1-3",
    name: "3rd and Short (1-3)",
    color: CS_COLORS.yellow,
    down: "3",
    distance: "Short",
    situation: "Short Yardage",
    position: null,
  },
  {
    id: "short-yardage",
    name: "Short Yardage",
    color: CS_COLORS.orange,
    situation: "Short Yardage",
    position: null,
  },
  {
    id: "gbot",
    name: '"G-B-O-T"',
    color: CS_COLORS.purple,
    situation: null,
    position: null,
    manual: true,
  },
  {
    id: "3rd-short-2down",
    name: "3rd and Short (2 Down)",
    color: CS_COLORS.yellow,
    down: "3",
    distance: "Short",
    situation: "Short Yardage",
    position: null,
  },
  {
    id: "rz-20",
    name: "Red Zone +20",
    color: CS_COLORS.green,
    situation: null,
    position: "Green",
  },
  {
    id: "4th-down",
    name: "4th Down",
    color: CS_COLORS.purple,
    down: "4",
    distance: null,
    position: null,
  },
  {
    id: "3rd-medium",
    name: "3rd and Medium (4-7)",
    color: CS_COLORS.yellow,
    down: "3",
    distance: "Medium",
    position: null,
  },
  {
    id: "rz-10",
    name: "Red Zone +10",
    color: CS_COLORS.green,
    situation: null,
    position: "Lo-RZ",
  },
  {
    id: "4-minute",
    name: "4 Minute",
    color: CS_COLORS.yellow,
    situation: "4 Minute",
    position: null,
  },
  {
    id: "3rd-long",
    name: "3rd and Long (7+)",
    color: CS_COLORS.yellow,
    down: "3",
    distance: "Long",
    position: null,
  },
  {
    id: "rz-5",
    name: "Red Zone +5",
    color: CS_COLORS.green,
    situation: null,
    position: "Hi-RZ",
  },
  {
    id: "2-minute",
    name: "2 Minute",
    color: CS_COLORS.yellow,
    situation: "2 Minute",
    position: null,
  },
  {
    id: "backed-up",
    name: "Backed Up",
    color: CS_COLORS.gray,
    situation: null,
    position: "Backed Up",
  },
  {
    id: "goal-line",
    name: "Goal Line (3 and In)",
    color: CS_COLORS.orange,
    situation: "Short Yardage",
    position: "Goal Line",
  },
  {
    id: "last-plays",
    name: "LAST PLAYS",
    color: CS_COLORS.red,
    situation: null,
    position: null,
    manual: true,
  },
  {
    id: "saigon",
    name: "SAIGON",
    color: CS_COLORS.gray,
    situation: null,
    position: "Saigon",
  },
  {
    id: "must-haves",
    name: "MUST HAVES AND FUN",
    color: CS_COLORS.teal,
    situation: null,
    position: null,
    manual: true,
  },
];

// Call sheet categories - BACK PAGE (play types & player-specific)
const CALLSHEET_BACK = [
  // Column 1: Play Types
  {
    id: "openers",
    name: "Openers",
    color: CS_COLORS.green,
    playType: "Opener",
    manual: false,
  },
  {
    id: "1st-down",
    name: "1st Down",
    color: CS_COLORS.yellow,
    down: "1",
    distance: null,
    position: null,
  },
  {
    id: "perimeter-screens",
    name: "Perimeter Screens",
    color: CS_COLORS.teal,
    playType: "Screen",
    manual: false,
  },
  {
    id: "screen",
    name: "Screen",
    color: CS_COLORS.teal,
    playType: "Screen",
    manual: false,
  },
  {
    id: "p-and-10",
    name: "P and 10",
    color: CS_COLORS.yellow,
    situation: null,
    position: null,
    manual: false,
  },
  {
    id: "2-point",
    name: "2 Point Plays",
    color: CS_COLORS.green,
    situation: null,
    position: null,
    manual: true,
  },
  {
    id: "base-run",
    name: "Base run",
    color: CS_COLORS.green,
    playType: "Run",
    manual: false,
  },
  {
    id: "run-options",
    name: "Run Options",
    color: CS_COLORS.green,
    playType: "Run Option",
    manual: false,
  },
  {
    id: "base-pass",
    name: "Base Pass",
    color: CS_COLORS.yellow,
    playType: "Pass",
    manual: false,
  },
  {
    id: "quick",
    name: "Quick",
    color: CS_COLORS.yellow,
    playType: "Quick",
    manual: false,
  },
  {
    id: "play-action",
    name: "Play Action",
    color: CS_COLORS.teal,
    playType: "Play Action",
    manual: false,
  },
  {
    id: "rpos",
    name: "RPOs",
    color: CS_COLORS.orange,
    playType: "RPO",
    manual: false,
  },
  {
    id: "player1",
    name: "Lucas",
    color: CS_COLORS.yellow,
    playerSpecific: true,
    manual: true,
  },
  {
    id: "player2",
    name: "Marco",
    color: CS_COLORS.green,
    playerSpecific: true,
    manual: true,
  },
  {
    id: "player3",
    name: "Diego",
    color: CS_COLORS.orange,
    playerSpecific: true,
    manual: true,
  },
  {
    id: "player4",
    name: "Danny",
    color: CS_COLORS.teal,
    playerSpecific: true,
    manual: true,
  },
  {
    id: "player5",
    name: "Jovani",
    color: CS_COLORS.green,
    playerSpecific: true,
    manual: true,
  },
  {
    id: "movement",
    name: "Movement Passes",
    color: CS_COLORS.purple,
    playType: "Movement",
    manual: false,
  },
];

// Combined categories for reference
const CALLSHEET_CATEGORIES = [...CALLSHEET_FRONT, ...CALLSHEET_BACK];

// Immutable snapshots used by rebuildCallSheetCategoryRegistry as the base source
const BASE_CALLSHEET_FRONT = CALLSHEET_FRONT.slice();
const BASE_CALLSHEET_BACK = CALLSHEET_BACK.slice();

const CS_SEVEN_ON_SEVEN_CATEGORIES = [
  {
    id: "cs-7on7-openers",
    name: "Openers",
    color: CS_COLORS.green,
    manual: false,
    target: 5,
    note: "First calls for the tournament script.",
    criteria: { situation: ["opener"] },
  },
  {
    id: "cs-7on7-first-down",
    name: "1st Down",
    color: CS_COLORS.yellow,
    manual: false,
    target: 5,
    note: "Early-down calls that keep the full menu open.",
    criteria: { down: ["1"] },
  },
  {
    id: "cs-7on7-second-down",
    name: "2nd Down",
    color: CS_COLORS.red,
    manual: false,
    target: 5,
    note: "Best calls for staying on schedule.",
    criteria: { down: ["2"] },
  },
  {
    id: "cs-7on7-third-down",
    name: "3rd Down",
    color: CS_COLORS.yellow,
    manual: false,
    target: 5,
    note: "Short and medium conversion calls.",
    criteria: { down: ["3"], distance: ["short", "medium"] },
  },
  {
    id: "cs-7on7-third-long",
    name: "3rd & Long",
    color: CS_COLORS.orange,
    manual: false,
    target: 4,
    note: "Long-yardage conversion calls.",
    criteria: { down: ["3"], distance: ["long"] },
  },
  {
    id: "cs-7on7-marco",
    name: "Marco",
    color: CS_COLORS.green,
    manual: false,
    target: 3,
    note: "Designed touches and matchup calls for Marco.",
    criteria: { keyPlayer: "Marco" },
  },
  {
    id: "cs-7on7-diego",
    name: "Diego",
    color: CS_COLORS.orange,
    manual: false,
    target: 3,
    note: "Designed touches and matchup calls for Diego.",
    criteria: { keyPlayer: "Diego" },
  },
  {
    id: "cs-7on7-jayce",
    name: "Jayce",
    color: CS_COLORS.teal,
    manual: false,
    target: 3,
    note: "Designed touches and matchup calls for Jayce.",
    criteria: { keyPlayer: "Jayce" },
  },
  {
    id: "cs-7on7-jake",
    name: "Jake",
    color: CS_COLORS.purple,
    manual: false,
    target: 3,
    note: "Designed touches and matchup calls for Jake.",
    criteria: { keyPlayer: "Jake" },
  },
  {
    id: "cs-7on7-skro-bros",
    name: "Skro Bros",
    color: CS_COLORS.blue,
    manual: false,
    target: 3,
    note: "Designed touches and matchup calls for the Skro Bros.",
    criteria: { keyPlayer: "Skro Bros" },
  },
  {
    id: "cs-7on7-running-back",
    name: "Running Back",
    color: CS_COLORS.gray,
    manual: false,
    target: 3,
    note: "Backfield releases, checkdowns, swings, and matchups.",
    criteria: { keyPlayer: "Running Back" },
  },
  {
    id: "cs-7on7-cover-01",
    name: "Cov 0/1 Beaters",
    color: CS_COLORS.red,
    manual: false,
    target: 4,
    note: "Pressure-man and single-high man answers.",
    criteria: { coverage: ["cover 0", "cover 1"] },
  },
  {
    id: "cs-7on7-cover-2",
    name: "Cov 2 Beaters",
    color: CS_COLORS.blue,
    manual: false,
    target: 4,
    note: "Two-high and Cover 2 answers.",
    criteria: { coverage: ["cover 2"] },
  },
  {
    id: "cs-7on7-cover-3",
    name: "Cov 3 Beaters",
    color: CS_COLORS.teal,
    manual: false,
    target: 4,
    note: "Three-deep and Cover 3 answers.",
    criteria: { coverage: ["cover 3"] },
  },
  {
    id: "cs-7on7-man-2",
    name: "Man 2 Beaters",
    color: CS_COLORS.purple,
    manual: false,
    target: 4,
    note: "Two-man and man-under answers.",
    criteria: { coverage: ["2-man"] },
  },
  {
    id: "cs-7on7-shots",
    name: "Shot Plays",
    color: CS_COLORS.red,
    manual: false,
    target: 4,
    note: "Explosives and deliberate downfield calls.",
    criteria: { keyword: "shot | explosive" },
  },
  {
    id: "cs-7on7-wristband-passes",
    name: "Pass Plays on Wristband",
    color: CS_COLORS.teal,
    manual: true,
    target: 0,
    note: "Auto-syncs passing calls whenever a wristband is loaded.",
  },
  {
    id: "cs-7on7-goal-line",
    name: "Goal Line",
    color: CS_COLORS.orange,
    manual: false,
    target: 4,
    note: "Calls for the goal line and compressed field.",
    criteria: { fieldPosition: ["goal line"] },
  },
  {
    id: "cs-7on7-two-point",
    name: "Two-Point Conversion",
    color: CS_COLORS.green,
    manual: false,
    target: 4,
    note: "Must-have two-point calls.",
    criteria: { keyword: "2 point | 2-point | two point | two-point" },
  },
];

const CALLSHEET_DISPLAY_IDS = [
  "callsheetShowNumbers",
  "callsheetShowPersonnel",
  "callsheetShowFormation",
  "callsheetShowFormationTags",
  "callsheetShowBack",
  "callsheetShowOneWordOnly",
  "callsheetShowProtection",
  "callsheetShowPlayName",
  "callsheetShowTags",
  "callsheetShowMotion",
  "callsheetShowLineCall",
  "callsheetShowEmoji",
  "callsheetUseSquares",
  "callsheetUnderEmoji",
  "callsheetBoldShifts",
  "callsheetRedShifts",
  "callsheetItalicMotions",
  "callsheetRedMotions",
  "callsheetRemoveVowels",
  "callsheetHighlightHuddle",
  "callsheetHighlightCandy",
  "callsheetRedBorder",
  "callsheetBlueBorder",
  "callsheetGreenBorder",
  "callsheetOrangeBorder",
  "callsheetPurpleBorder",
  "callsheetPersonnelBorder",
  "callsheetPersonnelBorderColor",
];

const CALLSHEET_DISPLAY_DEFAULTS = {
  callsheetShowBack: true,
};

const CALLSHEET_CELL_DISPLAY_OVERRIDE_PROPS = [
  "cellUseOneWord",
  "cellDisableOneWord",
  "cellForceUnderCenter",
  "cellHidePersonnel",
  "cellHideWristband",
  "cellHideFormation",
  "cellHideFormationTags",
  "cellHideBack",
  "cellHideShift",
  "cellHideMotion",
  "cellHideProtection",
  "cellHidePlayName",
  "cellHidePlayTags",
  "cellHideLineCall",
];

const CALLSHEET_HIGHLIGHT_SWATCHES = [
  { key: "", name: "None", bg: "", border: "", css: "#f8f8f8" },
  { key: "yellow", name: "Yellow", bg: "#fff59d", border: "#d4b106", css: "#fff59d" },
  { key: "lime", name: "Lime", bg: "#dced8b", border: "#8aa51b", css: "#dced8b" },
  { key: "cyan", name: "Cyan", bg: "#b2ebf2", border: "#1f8ea0", css: "#b2ebf2" },
  { key: "pink", name: "Pink", bg: "#f8bbd0", border: "#c04b73", css: "#f8bbd0" },
  { key: "orange", name: "Orange", bg: "#ffe0b2", border: "#c97a19", css: "#ffe0b2" },
];

const CALLSHEET_CELL_DISPLAY_PRESETS = [
  {
    id: "default",
    label: "Reset",
    sublabel: "Use the global display settings for this cell.",
    overrides: {},
  },
  {
    id: "scout",
    label: "Scout",
    sublabel: "Strip tags and extra detail but keep the main call readable.",
    overrides: {
      cellHideWristband: true,
      cellHideFormationTags: true,
      cellHideBack: true,
      cellHideProtection: true,
      cellHidePlayTags: true,
      cellHideLineCall: true,
    },
  },
  {
    id: "ultra-tight",
    label: "Ultra Tight",
    sublabel: "Keep only the essential call pieces for dense sheets.",
    overrides: {
      cellHideWristband: true,
      cellHidePersonnel: true,
      cellHideFormationTags: true,
      cellHideBack: true,
      cellHideShift: true,
      cellHideMotion: true,
      cellHideProtection: true,
      cellHidePlayTags: true,
      cellHideLineCall: true,
    },
  },
  {
    id: "one-word",
    label: "One Word",
    sublabel: "Show only the one-word call in royal blue when available.",
    requiresOneWord: true,
    overrides: {
      cellUseOneWord: true,
    },
  },
];

const CALLSHEET_CELL_DISPLAY_COLORS = {
  cellUseOneWord: { bg: "#4169E1", text: "white" },
  cellDisableOneWord: { bg: "#d9534f", text: "white" },
  cellForceUnderCenter: { bg: "#5cb85c", text: "white" },
  cellHidePersonnel: { bg: "#f0ad4e", text: "#333" },
  cellHideWristband: { bg: "#5bc0de", text: "#333" },
};

// Built-in presets, print defaults, sort fields, and render scheduling are
// owned by callsheet.js. Keep this render split focused on shared category/
// display constants and rendering helpers.


// ============================================================
// Render functions — moved from callsheet.js
// ============================================================

/**
 * Get personnel abbreviation code or compact marker
 */
function getPersonnelCode(personnel) {
  if (!personnel) return "";
  const p = personnel.toLowerCase().trim();
  const codes = {
    black: "BK",
    blue: "BL",
    green: "GR",
    yellow: "YL",
    orange: "OR",
    purple: "PU",
    red: "RD",
    white: "WH",
    navy: "⚓",
    meat: "🥩",
    star: "ST",
  };
  return codes[p] || personnel.substring(0, 2).toUpperCase();
}

/**
 * Get background color for personnel code
 */
function getPersonnelBgColor(personnel) {
  if (!personnel) return UI_COLORS.textMuted;
  const p = personnel.toLowerCase().trim();
  const colors = {
    black: UI_COLORS.textDark,
    blue: "#0066cc",
    green: CS_COLORS.green,
    yellow: CS_COLORS.yellow,
    orange: CS_COLORS.orange,
    purple: CS_COLORS.purple,
    red: CS_COLORS.red,
    white: "#f8f9fa",
    navy: "#192a51",
    meat: "#7f1d1d",
    star: CS_COLORS.yellow,
  };
  return colors[p] || UI_COLORS.textMuted;
}

/**
 * Get text color for personnel (for contrast)
 */
function getPersonnelTextColor(personnel) {
  if (!personnel) return UI_COLORS.textWhite;
  const p = personnel.toLowerCase().trim();
  const darkText = ["yellow", "white", "star"];
  return darkText.includes(p) ? UI_COLORS.textBlack : UI_COLORS.textWhite;
}

function getCategoryHeaderTextColor(color) {
  if (!color) return UI_COLORS.textWhite;

  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return color === CS_COLORS.yellow ? UI_COLORS.textBlack : UI_COLORS.textWhite;
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? UI_COLORS.textBlack : UI_COLORS.textWhite;
}

function getCallSheetCategoriesForPage(page) {
  const safePage = normalizeCallSheetPage(page);
  const normalizedOrder = normalizeCallSheetCategoryOrder(csCategoryOrder);
  csCategoryOrder = normalizedOrder;

  const orderedCategories = (normalizedOrder[safePage] || [])
    .map((id) => CALLSHEET_CATEGORIES.find((cat) => cat.id === id))
    .filter(Boolean);

  if (orderedCategories.length > 0) return orderedCategories;

  // Guardrail: if persisted ordering is corrupted and resolves to an empty
  // page, fall back to base categories so the call sheet never renders blank.
  const baseIds = (safePage === "back" ? BASE_CALLSHEET_BACK : BASE_CALLSHEET_FRONT)
    .map((cat) => cat.id)
    .filter(
      (id) =>
        !getHiddenCallSheetCategoryIds().has(id) &&
        CALLSHEET_CATEGORIES.some((cat) => cat.id === id),
    );

  if (!baseIds.length) return [];

  const rebuiltOrder = {
    ...normalizedOrder,
    [safePage]: baseIds,
  };
  csCategoryOrder = normalizeCallSheetCategoryOrder(rebuiltOrder);

  return (csCategoryOrder[safePage] || [])
    .map((id) => CALLSHEET_CATEGORIES.find((cat) => cat.id === id))
    .filter(Boolean);
}

function buildCallSheetColumns(categories, columnCount = 3) {
  const safeColumnCount = Math.max(1, columnCount || 1);
  const total = categories.length;
  const baseSize = Math.floor(total / safeColumnCount);
  const remainder = total % safeColumnCount;
  const columns = [];
  let startIndex = 0;

  for (let index = 0; index < safeColumnCount; index++) {
    const columnSize = baseSize + (index < remainder ? 1 : 0);
    columns.push(categories.slice(startIndex, startIndex + columnSize));
    startIndex += columnSize;
  }

  return columns;
}

function shouldRenderCallSheetPhoneCards() {
  return Boolean(document.body?.classList.contains("shell-phone"));
}

/**
 * Render the call sheet
 */
function renderCallSheet() {
  const container = document.getElementById("callSheetGrid");
  if (!container) return;

  // Set ARIA role on the grid container
  container.setAttribute("role", "region");
  container.setAttribute(
    "aria-label",
    "Call sheet " + (callSheetSettings.currentPage || "front") + " page",
  );
  const isLandscape = callSheetSettings.orientation === "landscape";
  const usePhoneCards = shouldRenderCallSheetPhoneCards();
  container.classList.toggle("callsheet-landscape", isLandscape);
  container.classList.toggle("callsheet-portrait", !isLandscape);
  container.classList.toggle("callsheet-phone-cards", usePhoneCards);

  const page = callSheetSettings.currentPage;
  const categories = getCallSheetCategoriesForPage(page);

  // Hoist display options once — avoids re-reading DOM per play
  const displayOptions = getCallSheetDisplayOptions();
  Object.defineProperty(displayOptions, "_playTextMemo", {
    value: new WeakMap(),
    enumerable: false,
  });

  // Build duplicate map for this render
  const dupeMap = buildDuplicateMap();

  // Build category columns
  let html = "";
  if (categories.length === 0) {
    html += `
      <div class="callsheet-empty-state">
        <strong>No call sheet categories found.</strong>
        <span>Reset the layout to restore the default front and back boards.</span>
        <button class="btn btn-sm btn-primary" data-action="resetCategoryOrder">Reset Layout</button>
      </div>
    `;
  } else if (usePhoneCards) {
    html += renderCallSheetPhoneCards(categories, dupeMap, displayOptions);
  } else {
    const columns = buildCallSheetColumns(categories, 3);
    html += '<div class="callsheet-columns">';
    columns.forEach((col) => {
      html += '<div class="callsheet-column">';
      col.forEach((cat) => {
        html += renderCategory(cat, callSheet[cat.id] || {}, dupeMap, displayOptions);
      });
      html += '</div>';
    });
    html += '</div>';
  }

  // Insert into grid container
  container.innerHTML = html;

  // Update page toggle buttons
  updatePageToggle();

  // Update loaded wristband display
  updateLoadedWristbandDisplay();

  // Update stats panel if visible
  updateStatsPanel();

  // Update undo/redo button state
  historyManager.updateButtons("callsheet");

  if (typeof refreshCallSheetGamePlanDrawer === "function") {
    refreshCallSheetGamePlanDrawer();
  }

  // Update source status bar (#159-161)
  if (typeof updateCSSourceBar === "function") {
    updateCSSourceBar();
  }

  // Load discussion counts for plays (progressive enhancement)
  if (typeof loadCallSheetDiscussionCounts === "function") {
    setTimeout(loadCallSheetDiscussionCounts, 150);
  }
}

function renderCallSheetPhoneCards(categories, dupeMap, displayOptions) {
  let html = '<div class="cs-mobile-situation-list">';
  categories.forEach((cat) => {
    html += renderCallSheetPhoneCategory(
      cat,
      callSheet[cat.id] || {},
      dupeMap,
      displayOptions,
    );
  });
  html += "</div>";
  return html;
}

/**
 * Update page toggle button states
 */
function updatePageToggle() {
  const frontBtn = document.getElementById("callsheetFrontBtn");
  const backBtn = document.getElementById("callsheetBackBtn");
  if (frontBtn && backBtn) {
    frontBtn.classList.toggle(
      "active",
      callSheetSettings.currentPage === "front",
    );
    backBtn.classList.toggle(
      "active",
      callSheetSettings.currentPage === "back",
    );
  }

  const portraitBtn = document.getElementById("callsheetPortraitBtn");
  const landscapeBtn = document.getElementById("callsheetLandscapeBtn");
  if (portraitBtn && landscapeBtn) {
    portraitBtn.classList.toggle(
      "active",
      callSheetSettings.orientation === "portrait",
    );
    landscapeBtn.classList.toggle(
      "active",
      callSheetSettings.orientation === "landscape",
    );
  }
}

// RAF-coalesced version: multiple calls within one frame resolve to a single render
const _scheduleRenderCallSheet = createRAFRenderer(renderCallSheet);

function scheduleRenderCallSheet() {
  _scheduleRenderCallSheet();
}

function requestRenderCallSheet() {
  saveCallSheetDisplayOptions();
  _scheduleRenderCallSheet();
}

function captureCallSheetDisplayState() {
  const opts = {};
  CALLSHEET_DISPLAY_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    opts[id] = el.type === "checkbox" ? el.checked : el.value;
  });
  return opts;
}

function applyCallSheetDisplayState(opts) {
  if (!opts) return;
  CALLSHEET_DISPLAY_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const value =
      opts[id] !== undefined ? opts[id] : CALLSHEET_DISPLAY_DEFAULTS[id];
    if (value === undefined) return;
    if (el.type === "checkbox") {
      el.checked = value;
    } else {
      el.value = value;
    }
  });
}

/**
 * Switch between front and back page
 */
function switchCallSheetPage(page) {
  callSheetSettings.currentPage = normalizeCallSheetPage(page);
  saveCallSheetSettings();
  renderCallSheet();
}

/**
 * Toggle orientation
 */
function setCallSheetOrientation(orient) {
  callSheetSettings.orientation =
    orient === "portrait" ? "portrait" : "landscape";
  saveCallSheetSettings();
  renderCallSheet();
}

/**
 * Save call sheet settings
 */
function saveCallSheetSettings() {
  storageManager.set(STORAGE_KEYS.CALL_SHEET_SETTINGS, callSheetSettings);
}

/**
 * Render a single category box
 */
function renderCategory(cat, data, dupeMap, displayOptions) {
  const leftPlays = data.left || [];
  const rightPlays = data.right || [];
  const displayName = getCategoryDisplayName(cat);
  const isPlayerSpecific = cat.playerSpecific;
  const isCollapsed = csCollapsed.has(cat.id);

  const headerColor = getCategoryColor(cat);
  const textColor = getCategoryHeaderTextColor(headerColor);

  const playCount = leftPlays.length + rightPlays.length;
  const target = csTargets[cat.id];
  let countDisplay = "";
  if (target) {
    const pct = Math.min(playCount / target, 1);
    const targetColor =
      playCount >= target
        ? CS_COLORS.green
        : playCount >= target * 0.5
          ? CS_COLORS.yellow
          : CS_COLORS.red;
    countDisplay = `<span class="badge cs-play-count" style="background: ${targetColor}; color: ${playCount >= target || pct < 0.5 ? UI_COLORS.textWhite : UI_COLORS.textBlack};">${playCount}/${target}</span>`;
  } else if (playCount > 0) {
    countDisplay = `<span class="badge cs-play-count">${playCount}</span>`;
  }
  const sortBtn =
    playCount > 1
      ? `<span class="cs-sort-btn" title="Sort plays" data-action="openCsSortModal" data-arg="${cat.id}">⇅</span>`
      : "";
  const collapseIcon = isCollapsed ? "▶" : "▼";

  let html = `
    <div class="callsheet-category${isCollapsed ? " cs-collapsed" : ""}" data-category="${cat.id}"
         draggable="true"
         data-drag="catDrag" data-cat="${cat.id}"
         role="group" aria-label="${escapeHtml(displayName)} — ${playCount} play${playCount !== 1 ? "s" : ""}">
        <div class="category-header cs-cat-header" style="background: ${headerColor}; color: ${textColor};"
          role="heading" aria-level="3">
        <span class="cs-collapse-btn" data-action="toggleCategoryCollapse" data-arg="${cat.id}" title="Collapse/Expand" aria-expanded="${!isCollapsed}">${collapseIcon}</span>
        <span class="header-text" data-dblaction="editCategoryName" data-cat="${cat.id}">${escapeHtml(displayName)}</span>
        ${countDisplay}
        ${sortBtn}
        ${isPlayerSpecific ? '<span class="edit-hint" title="Double-click to rename">✏️</span>' : ""}
        <span class="cs-cat-menu-btn" data-action="openCategoryMenu" data-arg="${cat.id}" title="Category options">⋯</span>
        ${csScoutingOverlayOn ? `<button class="cs-suggest-btn" data-action="openSmartSuggestionsModal" data-arg="${cat.id}" title="Smart play suggestions">💡</button>` : ""}
      </div>`;

  // Scouting intel badge (below header, above plays)
  if (!isCollapsed) {
    html += buildScoutingBadge(cat.id);
  }

  if (!isCollapsed) {
    // Category note (if any)
    const note = csNotes[cat.id];
    if (note) {
      html += `<div class="cs-cat-note" data-dblaction="editCategoryNote" data-cat="${cat.id}">${escapeHtml(note)}</div>`;
    }

    html += `
      <div class="category-subheader" role="row">
        <div class="hash-header" role="columnheader">Left Hash</div>
        <div class="hash-header" role="columnheader">Right Hash</div>
      </div>
      <div class="category-content" role="grid" aria-label="${escapeHtml(displayName)} plays">
        <div class="hash-column left" data-drop="csHashDrop" data-cat="${cat.id}" data-hash="left" role="rowgroup" aria-label="Left hash">`;

    leftPlays.forEach((play, idx) => {
      html += renderCallSheetPlay(
        play,
        cat.id,
        "left",
        idx,
        dupeMap,
        displayOptions,
      );
    });
    if (leftPlays.length === 0) {
      html += `<div class="cs-empty-cat">Drop plays here</div>`;
    }
    html += `<div class="cs-col-footer">
      <div class="callsheet-dropzone" data-action="openCallSheetPlayPicker" data-cat="${cat.id}" data-hash="left" role="button" aria-label="Add play to left hash">+ Add</div>
      <button class="cs-add-blank-btn" data-action="addCsBlankRow" data-arg="${cat.id}:left" title="Insert blank spacer row" aria-label="Add blank spacer row">+ blank</button>
    </div>`;

    html += `
        </div>
        <div class="hash-column right" data-drop="csHashDrop" data-cat="${cat.id}" data-hash="right" role="rowgroup" aria-label="Right hash">`;

    rightPlays.forEach((play, idx) => {
      html += renderCallSheetPlay(
        play,
        cat.id,
        "right",
        idx,
        dupeMap,
        displayOptions,
      );
    });
    if (rightPlays.length === 0) {
      html += `<div class="cs-empty-cat">Drop plays here</div>`;
    }
    html += `<div class="cs-col-footer">
      <div class="callsheet-dropzone" data-action="openCallSheetPlayPicker" data-cat="${cat.id}" data-hash="right" role="button" aria-label="Add play to right hash">+ Add</div>
      <button class="cs-add-blank-btn" data-action="addCsBlankRow" data-arg="${cat.id}:right" title="Insert blank spacer row" aria-label="Add blank spacer row">+ blank</button>
    </div>`;

    html += `
        </div>
      </div>`;
  }

  html += `</div>`;
  return html;
}

function renderCallSheetPhoneCategory(cat, data, dupeMap, displayOptions) {
  const leftPlays = data.left || [];
  const rightPlays = data.right || [];
  const displayName = getCategoryDisplayName(cat);
  const isPlayerSpecific = cat.playerSpecific;
  const isCollapsed = csCollapsed.has(cat.id);
  const headerColor = getCategoryColor(cat);
  const textColor = getCategoryHeaderTextColor(headerColor);
  const playCount = leftPlays.length + rightPlays.length;
  const target = csTargets[cat.id];
  let countDisplay = "";
  if (target) {
    const pct = Math.min(playCount / target, 1);
    const targetColor =
      playCount >= target
        ? CS_COLORS.green
        : playCount >= target * 0.5
          ? CS_COLORS.yellow
          : CS_COLORS.red;
    countDisplay = `<span class="badge cs-play-count" style="background: ${targetColor}; color: ${playCount >= target || pct < 0.5 ? UI_COLORS.textWhite : UI_COLORS.textBlack};">${playCount}/${target}</span>`;
  } else {
    countDisplay = `<span class="badge cs-play-count">${playCount}</span>`;
  }
  const sortBtn =
    playCount > 1
      ? `<button type="button" class="cs-mobile-card-btn cs-sort-btn" title="Sort plays" data-action="openCsSortModal" data-arg="${cat.id}">⇅</button>`
      : "";
  const collapseIcon = isCollapsed ? "▶" : "▼";
  const note = csNotes[cat.id];

  let html = `
    <section class="cs-mobile-situation-card${isCollapsed ? " cs-collapsed" : ""}" data-category="${cat.id}"
      aria-label="${escapeHtml(displayName)} — ${playCount} play${playCount !== 1 ? "s" : ""}">
      <div class="cs-mobile-card-header" style="--cs-cat-color: ${headerColor}; --cs-cat-text: ${textColor};">
        <button type="button" class="cs-mobile-card-btn cs-collapse-btn" data-action="toggleCategoryCollapse" data-arg="${cat.id}" title="Collapse/Expand" aria-expanded="${!isCollapsed}">${collapseIcon}</button>
        <div class="cs-mobile-card-title">
          <h3 data-dblaction="editCategoryName" data-cat="${cat.id}">${escapeHtml(displayName)}</h3>
          ${note ? `<p data-dblaction="editCategoryNote" data-cat="${cat.id}">${escapeHtml(note)}</p>` : ""}
        </div>
        ${countDisplay}
        <div class="cs-mobile-card-actions">
          ${sortBtn}
          ${csScoutingOverlayOn ? `<button type="button" class="cs-mobile-card-btn cs-suggest-btn" data-action="openSmartSuggestionsModal" data-arg="${cat.id}" title="Smart play suggestions">💡</button>` : ""}
          <button type="button" class="cs-mobile-card-btn cs-cat-menu-btn" data-action="openCategoryMenu" data-arg="${cat.id}" title="Category options">⋯</button>
        </div>
      </div>`;

  if (!isCollapsed) {
    html += buildScoutingBadge(cat.id);
    html += `
      <div class="cs-mobile-card-body" role="list" aria-label="${escapeHtml(displayName)} calls">
        ${renderCallSheetPhoneHashGroup(cat.id, "left", "Left Hash", leftPlays, dupeMap, displayOptions)}
        ${renderCallSheetPhoneHashGroup(cat.id, "right", "Right Hash", rightPlays, dupeMap, displayOptions)}
      </div>`;
  } else if (isPlayerSpecific) {
    html += '<span class="sr-only">Player specific category collapsed</span>';
  }

  html += "</section>";
  return html;
}

function renderCallSheetPhoneHashGroup(categoryId, hash, label, plays, dupeMap, displayOptions) {
  let html = `
    <section class="cs-mobile-hash-group" data-drop="csHashDrop" data-cat="${categoryId}" data-hash="${hash}" aria-label="${label}">
      <div class="cs-mobile-hash-head">
        <span>${escapeHtml(label)}</span>
        <span>${plays.length}</span>
      </div>
      <div class="cs-mobile-play-list">`;

  plays.forEach((play, idx) => {
    html += renderCallSheetPlay(
      play,
      categoryId,
      hash,
      idx,
      dupeMap,
      displayOptions,
    );
  });

  if (plays.length === 0) {
    html += `<div class="cs-empty-cat">No calls yet</div>`;
  }

  html += `
      </div>
      <div class="cs-mobile-hash-actions">
        <button type="button" class="callsheet-dropzone" data-action="openCallSheetPlayPicker" data-cat="${categoryId}" data-hash="${hash}" aria-label="Add play to ${label}">+ Add Play</button>
        <button type="button" class="cs-add-blank-btn" data-action="addCsBlankRow" data-arg="${categoryId}:${hash}" title="Insert blank spacer row" aria-label="Add blank spacer row">+ Blank</button>
      </div>
    </section>`;
  return html;
}

/**
 * Get display options from checkboxes
 */
function getCallSheetDisplayOptions() {
  return {
    // Show/Hide options
    showNumbers:
      document.getElementById("callsheetShowNumbers")?.checked ?? true,
    showPersonnel:
      document.getElementById("callsheetShowPersonnel")?.checked ?? true,
    showFormation:
      document.getElementById("callsheetShowFormation")?.checked ?? true,
    showFormationTags:
      document.getElementById("callsheetShowFormationTags")?.checked ?? false,
    showBack: document.getElementById("callsheetShowBack")?.checked ?? true,
    showOneWordOnly:
      document.getElementById("callsheetShowOneWordOnly")?.checked ?? false,
    showProtection:
      document.getElementById("callsheetShowProtection")?.checked ?? false,
    showPlayName:
      document.getElementById("callsheetShowPlayName")?.checked ?? true,
    showTags: document.getElementById("callsheetShowTags")?.checked ?? false,
    showMotion:
      document.getElementById("callsheetShowMotion")?.checked ?? false,
    showLineCall:
      document.getElementById("callsheetShowLineCall")?.checked ?? true,
    // Formatting options
    showEmoji: document.getElementById("callsheetShowEmoji")?.checked ?? false,
    useSquares:
      document.getElementById("callsheetUseSquares")?.checked ?? false,
    underEmoji:
      document.getElementById("callsheetUnderEmoji")?.checked ?? false,
    boldShifts:
      document.getElementById("callsheetBoldShifts")?.checked ?? false,
    redShifts: document.getElementById("callsheetRedShifts")?.checked ?? false,
    italicMotions:
      document.getElementById("callsheetItalicMotions")?.checked ?? false,
    redMotions:
      document.getElementById("callsheetRedMotions")?.checked ?? false,
    noVowels:
      document.getElementById("callsheetRemoveVowels")?.checked ?? false,
    highlightHuddle:
      document.getElementById("callsheetHighlightHuddle")?.checked ?? false,
    highlightCandy:
      document.getElementById("callsheetHighlightCandy")?.checked ?? false,
    // Border options
    redBorder: document.getElementById("callsheetRedBorder")?.value || "",
    blueBorder: document.getElementById("callsheetBlueBorder")?.value || "",
    greenBorder: document.getElementById("callsheetGreenBorder")?.value || "",
    orangeBorder: document.getElementById("callsheetOrangeBorder")?.value || "",
    purpleBorder: document.getElementById("callsheetPurpleBorder")?.value || "",
    personnelBorder:
      document.getElementById("callsheetPersonnelBorder")?.value || "",
    personnelBorderColor:
      document.getElementById("callsheetPersonnelBorderColor")?.value ||
      CS_COLORS.red,
  };
}

function getCallSheetPlayDisplayOptions(play, baseOptions) {
  const options = { ...baseOptions };

  if (play.cellUseOneWord && play.oneWord && String(play.oneWord).trim()) {
    options.showOneWordOnly = true;
  }
  if (play.cellDisableOneWord) {
    options.showOneWordOnly = false;
  }

  if (play.cellHidePersonnel) options.showPersonnel = false;
  if (play.cellHideWristband) options.showNumbers = false;
  if (play.cellHideFormation) options.showFormation = false;
  if (play.cellHideFormationTags) options.showFormationTags = false;
  if (play.cellHideBack) options.showBack = false;
  if (play.cellHideMotion) options.showMotion = false;
  if (play.cellHideProtection) options.showProtection = false;
  if (play.cellHidePlayName) options.showPlayName = false;
  if (play.cellHidePlayTags) options.showTags = false;
  if (play.cellHideLineCall) options.showLineCall = false;
  options.hideShift = Boolean(play.cellHideShift);

  return options;
}

/**
 * Check if a play matches a border type
 */
function getPlayBorderColor(play, options) {
  const playType = (play.playType || "").toLowerCase();
  const isHighlighted = play.highlighted || false;
  const personnel = (play.personnel || "").toLowerCase();

  const checkMatch = (type) => {
    if (type === "run" && playType.includes("run")) return true;
    if (type === "pass" && playType.includes("pass")) return true;
    if (type === "rpo" && playType.includes("rpo")) return true;
    if (type === "screen" && playType.includes("screen")) return true;
    if (
      type === "playaction" &&
      (playType.includes("play action") ||
        playType.includes("pa") ||
        playType.includes("play-action"))
    )
      return true;
    if (type === "quick" && playType.includes("quick")) return true;
    if (type === "highlighted" && isHighlighted) return true;
    return false;
  };

  // Check custom border color on play first (individual override)
  if (play.borderColor) return play.borderColor;

  // Check personnel-based border
  if (options.personnelBorder && personnel.includes(options.personnelBorder)) {
    return options.personnelBorderColor;
  }

  // Check type-based borders
  if (options.redBorder && checkMatch(options.redBorder)) return CS_COLORS.red;
  if (options.blueBorder && checkMatch(options.blueBorder))
    return CS_COLORS.blue;
  if (options.greenBorder && checkMatch(options.greenBorder))
    return CS_COLORS.green;
  if (options.orangeBorder && checkMatch(options.orangeBorder))
    return CS_COLORS.orange;
  if (options.purpleBorder && checkMatch(options.purpleBorder))
    return CS_COLORS.purple;

  return null;
}

/**
 * Render a single play in the call sheet
 */
function renderCallSheetPlay(play, categoryId, hash, index, dupeMap, options) {
  // Blank spacer row
  if (play && play._blank) {
    return `<div class="cs-blank-row" role="row" aria-label="Blank spacer"
         data-category="${categoryId}" data-hash="${hash}" data-index="${index}">
      <button class="remove-play cs-blank-remove" data-action="removeCallSheetPlay"
        data-category="${categoryId}" data-hash="${hash}" data-index="${index}"
        aria-label="Remove blank row" title="Remove blank spacer">×</button>
    </div>`;
  }

  if (!options) options = getCallSheetDisplayOptions();
  const textMemo = options._playTextMemo;
  let textMeta = textMemo && play && typeof play === "object" ? textMemo.get(play) : null;
  let displayOptions;
  let displaySummary;
  let visiblePlayText;
  if (textMeta) {
    displayOptions = textMeta.displayOptions;
    displaySummary = textMeta.displaySummary;
    visiblePlayText = textMeta.visiblePlayText;
  } else {
    displayOptions = getCallSheetPlayDisplayOptions(play, options);
    displaySummary = getCallSheetCellDisplaySummary(play);
    const playParts = buildCallSheetPlayParts(play, displayOptions);
    if (displayOptions.showNumbers && play.wristbandNumber) {
      const idx = playParts.findIndex(
        (p) => p === `<b>${play.wristbandNumber}</b>`,
      );
      if (idx !== -1)
        playParts[idx] =
          `<span class="wristband-num">${play.wristbandNumber}</span>`;
    }
    const playText = playParts.join(" ");
    const fallbackPlayText = escapeHtml(
      [play.formation, play.protection, play.play].filter(Boolean).join(" ").trim() ||
      play.type ||
      "Play",
    );
    visiblePlayText = playText.trim() || fallbackPlayText;
    textMeta = { displayOptions, displaySummary, visiblePlayText };
    if (textMemo && play && typeof play === "object") textMemo.set(play, textMeta);
  }
  const code = getPersonnelCode(play.personnel);
  const bgColor = getPersonnelBgColor(play.personnel);
  const textColor = getPersonnelTextColor(play.personnel);
  const highlightConfig = getCallSheetHighlightConfig(play);
  const isHighlighted = Boolean(highlightConfig);
  const borderColor = getPlayBorderColor(play, options);

  // Build tempo class
  const tempo = (play.tempo || "").toLowerCase();
  let tempoClass = "";
  if (options.highlightHuddle && tempo === "huddle")
    tempoClass = "tempo-huddle";
  else if (options.highlightCandy && tempo === "candy")
    tempoClass = "tempo-candy";

  const highlightClass = isHighlighted ? "highlighted" : "";

  // Build per-cell inline styles
  let cellStyles = [];
  if (highlightConfig) {
    cellStyles.push(`--cs-highlight-bg: ${highlightConfig.bg}`);
    cellStyles.push(`--cs-highlight-border: ${highlightConfig.border}`);
  }
  if (borderColor) cellStyles.push(`border: 2px solid ${borderColor}`);
  if (play.cellBg && !isHighlighted) cellStyles.push(`background: ${play.cellBg}`);
  if (play.cellTextColor) cellStyles.push(`color: ${play.cellTextColor}`);
  if (play.cellFontSize) cellStyles.push(`font-size: ${play.cellFontSize}`);
  let textDeco = [];
  if (play.cellUnderline) textDeco.push("underline");
  if (play.cellStrikethrough) textDeco.push("line-through");
  if (textDeco.length)
    cellStyles.push(`text-decoration: ${textDeco.join(" ")}`);
  if (play.cellBold) cellStyles.push("font-weight: bold");
  if (play.cellItalic) cellStyles.push("font-style: italic");
  const cellStyleStr = cellStyles.length ? cellStyles.join(";") + ";" : "";

  // Check if play has any custom formatting
  const hasFormat =
    highlightConfig ||
    play.borderColor ||
    play.cellBg ||
    play.cellTextColor ||
    play.cellBold ||
    play.cellItalic ||
    play.cellUnderline ||
    play.cellStrikethrough ||
    play.cellFontSize;
  const formatIndicator = hasFormat
    ? `<span class="cs-cell-format-dot" title="Custom cell formatting applied">✦</span>`
    : "";
  const displayIndicator = displaySummary
    ? `<span class="cs-cell-display-badge" title="${escapeHtml(displaySummary.title)}">${escapeHtml(displaySummary.label)}</span>`
    : "";

  const personnelHtml = displayOptions.showPersonnel
    ? `<span class="personnel-code" style="background: ${bgColor}; color: ${textColor};">${code}</span>`
    : "";

  // Cell note badge
  const noteBadge = play.cellNote
    ? `<span class="cs-cell-note-badge" title="${escapeHtml(play.cellNote)}">📝</span>`
    : "";

  // Duplicate badge
  const playKey = csPlayKey(play);
  const dupeCount = dupeMap ? dupeMap[playKey] || 0 : 0;
  const dupeBadge =
    dupeCount > 1
      ? `<span class="badge badge-sm badge-warning cs-dupe-badge" title="Appears in ${dupeCount} categories">×${dupeCount}</span>`
      : "";

  // Hash swap arrow
  const otherHash = hash === "left" ? "right" : "left";
  const swapArrow = hash === "left" ? "→" : "←";
  const swapBtn = `<button class="cs-hash-swap" data-action="swapPlayHash" data-category="${categoryId}" data-hash="${hash}" data-index="${index}" title="Move to ${otherHash} hash">${swapArrow}</button>`;

  // Dead-vs warning badge (scouting overlay)
  const deadVsBadgeHtml = buildDeadVsBadge(play, categoryId);

  // Build accessible play label
  const playLabel = (play.formation || "") + " " + (play.play || "");
  const discPlayId = typeof getPlayThreadId === "function" ? getPlayThreadId(play) : null;
  const discAttr = discPlayId ? ` data-disc-play-id="${escapeHtml(discPlayId)}"` : "";
  const discWarn = discPlayId ? `<span class="cs-disc-warning hidden" title="Open player questions">❓</span>` : "";

  return `
    <div class="callsheet-play ${highlightClass} ${tempoClass}${deadVsBadgeHtml ? " cs-play-has-warning" : ""}" draggable="true"
         style="${cellStyleStr}"
         role="row" aria-label="${escapeHtml(playLabel.trim())}"
         data-category="${categoryId}" data-hash="${hash}" data-index="${index}"${discAttr}>
      ${personnelHtml}
      <span class="play-text" role="cell">${visiblePlayText}</span>
      ${displayIndicator}
      ${formatIndicator}
      ${noteBadge}
      ${dupeBadge}
      ${deadVsBadgeHtml}
      ${discWarn}
      ${swapBtn}
      <button class="remove-play" data-action="removeCallSheetPlay" data-category="${categoryId}" data-hash="${hash}" data-index="${index}" aria-label="Remove ${escapeHtml(playLabel.trim())}">×</button>
    </div>
  `;
}


// ============ Play Text Builder ============

/**
 * Build play text parts (shared by screen render and print render)
 */
function buildCallSheetPlayParts(play, options) {
  const playParts = [];
  const formatTagText = (value) => {
    if (!value) return "";
    return escapeHtml(options.noVowels ? removeVowels(value) : value);
  };
  const oneWordCall = formatTagText(play.oneWord);
  const formationTags = [play.formTag1, play.formTag2]
    .filter((value) => value && String(value).trim())
    .map((value) => formatTagText(value));
  const customFormationTags = getCallSheetCustomTagValues(play.cellFormationTags);
  const customBackTags = getCallSheetCustomTagValues(play.cellBackTags);
  const playTags = [play.playTag1, play.playTag2]
    .filter((value) => value && String(value).trim())
    .map((value) => formatTagText(value));

  if (options.showOneWordOnly && oneWordCall) {
    return [`<span class="cs-one-word-call">${oneWordCall}</span>`];
  }

  // Check if play has "Under"
  const hasUnder =
    play.cellForceUnderCenter ||
    (play.under && play.under.trim() !== "") ||
    (play.formTag1 && play.formTag1.toLowerCase() === "under") ||
    (play.formTag2 && play.formTag2.toLowerCase() === "under");

  // Add personnel emoji if enabled
  if (options.showEmoji && play.personnel) {
    const personnelMarker = getPersonnelEmoji(
      play.personnel,
      options.useSquares,
    );
    const markerAlreadyInBadge =
      options.showPersonnel &&
      personnelMarker &&
      getPersonnelCode(play.personnel) === personnelMarker;
    if (personnelMarker && !markerAlreadyInBadge) {
      playParts.push(personnelMarker);
    }
  }
  if (options.underEmoji && hasUnder) {
    playParts.push("🍑");
  }

  if (options.showNumbers && play.wristbandNumber) {
    playParts.push(`<b>${play.wristbandNumber}</b>`);
  }

  if (options.showFormation && play.formation) {
    let formText = options.noVowels
      ? removeVowels(play.formation)
      : play.formation;
    playParts.push(escapeHtml(formText));
  }

  if (options.showFormationTags) {
    formationTags.forEach((tag) => {
      playParts.push(`<span class="cs-inline-tag cs-inline-tag--formation">${tag}</span>`);
    });
  }

  if (options.showFormationTags) {
    playParts.push(...getCallSheetCustomTagMarkup(customFormationTags, "formation", options));
  }
  if (options.showBack) {
    playParts.push(...getCallSheetCustomTagMarkup(customBackTags, "back", options));
  }

  // Handle shift with bold/red options
  if (play.shift && !options.hideShift) {
    let shiftText = escapeHtml(
      options.noVowels ? removeVowels(play.shift) : play.shift,
    );
    if (options.boldShifts) shiftText = `<b>${shiftText}</b>`;
    if (options.redShifts)
      shiftText = `<span class="cs-red-text">${shiftText}</span>`;
    playParts.push(shiftText);
  }

  // Handle motion with italic/red options
  if (options.showMotion && play.motion) {
    let motionText = escapeHtml(
      options.noVowels ? removeVowels(play.motion) : play.motion,
    );
    if (options.italicMotions) motionText = `<i>${motionText}</i>`;
    if (options.redMotions)
      motionText = `<span class="cs-red-text">${motionText}</span>`;
    playParts.push(motionText);
  }

  if (options.showProtection && play.protection) {
    let protText = options.noVowels
      ? removeVowels(play.protection)
      : play.protection;
    playParts.push(escapeHtml(protText));
  }

  if (options.showBack && play.back) {
    const backText = options.noVowels ? removeVowels(play.back) : play.back;
    playParts.push(escapeHtml(backText));
  }

  if (options.showPlayName && play.play) {
    let playText = options.noVowels ? removeVowels(play.play) : play.play;
    playParts.push(escapeHtml(playText));
  }

  if (options.showTags) {
    playTags.forEach((tag) => {
      playParts.push(`<span class="cs-inline-tag cs-inline-tag--play">${tag}</span>`);
    });
  }

  // Add line call in brackets
  if (options.showLineCall && play.lineCall) {
    const lc = escapeHtml(
      options.noVowels ? removeVowels(play.lineCall) : play.lineCall,
    );
    playParts.push(`<i class="cs-line-call">[${lc}]</i>`);
  }

  return playParts;
}
