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

const BUILTIN_PRESETS = {
  default: {
    label: "Default",
    displayState: {},
  },
  all: {
    label: "Show Everything",
    displayState: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: true,
      callsheetShowBack: true,
      callsheetShowProtection: true,
      callsheetShowPlayName: true,
      callsheetShowTags: true,
      callsheetShowMotion: true,
      callsheetShowLineCall: true,
      callsheetShowEmoji: true,
    },
  },
  minimal: {
    label: "Minimal",
    displayState: {
      callsheetShowNumbers: false,
      callsheetShowPersonnel: false,
      callsheetShowFormation: true,
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: false,
      callsheetShowLineCall: false,
      callsheetShowEmoji: false,
    },
  },
  gameday: {
    label: "Game Day",
    displayState: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: false,
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: true,
      callsheetShowMotion: false,
      callsheetShowLineCall: false,
      callsheetShowEmoji: true,
    },
  },
  "print-friendly": {
    label: "Print Friendly",
    displayState: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: false,
      callsheetShowBack: true,
      callsheetShowProtection: true,
      callsheetShowPlayName: true,
      callsheetShowTags: true,
      callsheetShowMotion: true,
      callsheetShowLineCall: false,
      callsheetShowEmoji: false,
      callsheetRemoveVowels: false,
    },
  },
  compact: {
    label: "Compact",
    displayState: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: true,
      callsheetShowLineCall: false,
      callsheetShowEmoji: false,
      callsheetRemoveVowels: true,
    },
  },
};

const CS_PRINT_DEFAULTS = {
  paperSize: "letter",
  orientation: "landscape",
  pages: "both",
  columns: 1,
  margin: 0.5,
};

const CS_SORT_FIELDS = [
  { value: "personnel", label: "Personnel" },
  { value: "formation", label: "Formation" },
  { value: "playName", label: "Play Name" },
  { value: "playType", label: "Type" },
  { value: "tempo", label: "Tempo" },
  { value: "oneWord", label: "One Word" },
  { value: "protection", label: "Protection" },
  { value: "lineCall", label: "Line Call" },
];

// ============ RENDER SCHEDULING ============

const _scheduleRenderCallSheet = createRAFRenderer(renderCallSheet);

function requestRenderCallSheet() {
  _scheduleRenderCallSheet();
}

function scheduleRenderCallSheet() {
  _scheduleRenderCallSheet();
}

// ============ MAIN RENDER FUNCTION ============

function renderCallSheet() {
  const container = document.getElementById("callSheetGrid");
  if (!container) return;

  container.setAttribute("role", "region");
  container.setAttribute(
    "aria-label",
    "Call sheet " + (callSheetSettings.currentPage || "front") + " page",
  );

  const isLandscape = callSheetSettings.orientation === "landscape";
  container.classList.toggle("callsheet-landscape", isLandscape);
  container.classList.toggle("callsheet-portrait", !isLandscape);

  const page = callSheetSettings.currentPage;
  const categories = getCallSheetCategoriesForPage(page);

  const displayOptions = getCallSheetDisplayOptions();
  Object.defineProperty(displayOptions, "_playTextMemo", {
    value: new WeakMap(),
    enumerable: false,
  });

  const html = buildCallSheetGrid(categories, displayOptions, page);
  setInnerHTML(container, html);
}

function buildCallSheetGrid(categories, displayOptions, page) {
  const hideIds = getHiddenCallSheetCategoryIds();
  const visibleCategories = categories.filter((cat) => !hideIds.has(cat.id));

  const dupeMap = buildDuplicateMap(visibleCategories);
  const columns = buildCallSheetColumns(visibleCategories);

  let html = `<div class="callsheet-grid-layout" role="grid">`;

  columns.forEach((col, colIdx) => {
    html += `<div class="callsheet-column" data-col="${colIdx}">`;
    col.forEach((cat) => {
      const categoryData = callSheet[cat.id] || { left: [], right: [] };
      html += renderCategory(cat, categoryData, dupeMap, displayOptions);
    });
    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

function buildCallSheetColumns(categories) {
  const columnSize = Math.ceil(categories.length / 2);
  const columns = [[], []];
  let startIndex = 0;

  for (let i = 0; i < 2; i++) {
    const endIndex = Math.min(startIndex + columnSize, categories.length);
    columns[i] = categories.slice(startIndex, endIndex);
    startIndex = endIndex;
  }

  return columns;
}

function getCallSheetCategoriesForPage(page) {
  const normalized = normalizeCallSheetPage(page);
  const source = normalized === "back" ? CALLSHEET_BACK : CALLSHEET_FRONT;
  const order = csCategoryOrder[normalized] || source.map((cat) => cat.id);
  
  return order
    .map((id) => source.find((cat) => cat.id === id))
    .filter(Boolean);
}

function renderCategory(cat, data, dupeMap, displayOptions) {
  const leftPlays = data.left || [];
  const rightPlays = data.right || [];
  const displayName = getCategoryDisplayName(cat);
  const color = getCategoryColor(cat);
  const customName = callSheetSettings.customNames?.[cat.id] || null;
  const finalName = customName || displayName;

  const isCollapsed = csCollapsed.has(cat.id);
  const bodyClass = isCollapsed ? "callsheet-body collapsed" : "callsheet-body";

  const headerStyle = `background-color: ${color}; color: ${getCategoryHeaderTextColor(color)};`;
  const headerHtml = `<div class="cs-header" style="${headerStyle}">${escapeHtml(finalName)}</div>`;

  let bodyHtml = `<div class="${bodyClass}" data-category-id="${escapeHtml(cat.id)}">`;

  bodyHtml += `<div class="cs-column cs-left-column">`;
  leftPlays.forEach((play, idx) => {
    const hash = `left_${idx}`;
    bodyHtml += renderCallSheetPlay(play, cat.id, hash, idx, dupeMap, displayOptions);
  });
  bodyHtml += `</div>`;

  bodyHtml += `<div class="cs-column cs-right-column">`;
  rightPlays.forEach((play, idx) => {
    const hash = `right_${idx}`;
    bodyHtml += renderCallSheetPlay(play, cat.id, hash, idx, dupeMap, displayOptions);
  });
  bodyHtml += `</div>`;

  bodyHtml += `</div>`;

  return `<div class="cs-category" data-category-id="${escapeHtml(cat.id)}">${headerHtml}${bodyHtml}</div>`;
}

function renderCallSheetPlay(play, categoryId, hash, index, dupeMap, displayOptions) {
  if (!play || typeof play !== "object") return "";

  const displayText = buildCallSheetPlayDisplay(play, displayOptions);
  const borderColor = getPlayBorderColor(play);
  const dupeCount = dupeMap[getPlayIdentityKey(play)] || 0;
  const classes = ["cs-play"];

  if (play.highlighted || play.highlightColor) {
    classes.push("cs-play--highlighted");
  }

  const cellId = `cs-${categoryId}-${hash}`;
  const borderStyle = borderColor ? `border-color: ${borderColor};` : "";

  let html = `<div class="cs-play" id="${escapeHtml(cellId)}" style="${borderStyle}" data-category-id="${escapeHtml(categoryId)}" data-hash="${escapeHtml(hash)}" data-idx="${index}">`;
  html += `<div class="cs-play-display">${displayText}</div>`;

  if (dupeCount > 1) {
    html += `<div class="cs-dupe-badge">${dupeCount}</div>`;
  }

  html += `</div>`;
  return html;
}

function buildCallSheetPlayDisplay(play, displayOptions) {
  const parts = buildCallSheetPlayParts(play, displayOptions);
  return parts.join("");
}

function buildCallSheetPlayParts(play, displayOptions = {}) {
  const parts = [];

  const showNumbers = displayOptions.callsheetShowNumbers !== false;
  if (showNumbers && (play.wristbandNumber || play.scriptNumber)) {
    parts.push(`<span class="cs-number">${escapeHtml(play.wristbandNumber || play.scriptNumber)}</span>`);
  }

  if (displayOptions.callsheetShowPersonnel !== false && play.personnel) {
    parts.push(`<span class="cs-personnel">${escapeHtml(play.personnel)}</span>`);
  }

  if (displayOptions.callsheetShowFormation !== false && play.formation) {
    const formationText = displayOptions.callsheetShowEmoji
      ? play.formation
      : escapeHtml(play.formation);
    parts.push(`<span class="cs-formation">${formationText}</span>`);
  }

  if (displayOptions.callsheetShowFormationTags !== false && (play.formTag1 || play.formTag2)) {
    const tags = [];
    if (play.formTag1) tags.push(play.formTag1);
    if (play.formTag2) tags.push(play.formTag2);
    parts.push(`<span class="cs-form-tags">[${escapeHtml(tags.join(", "))}]</span>`);
  }

  if (displayOptions.callsheetShowBack !== false && play.back) {
    parts.push(`<span class="cs-back">${escapeHtml(play.back)}</span>`);
  }

  if (displayOptions.callsheetShowPlayName !== false && play.play) {
    const playName = displayOptions.callsheetRemoveVowels
      ? removeVowels(play.play)
      : escapeHtml(play.play);
    parts.push(`<span class="cs-play-name">${playName}</span>`);
  }

  if (displayOptions.callsheetShowTags !== false && (play.playTag1 || play.playTag2)) {
    const tags = [];
    if (play.playTag1) tags.push(play.playTag1);
    if (play.playTag2) tags.push(play.playTag2);
    parts.push(`<span class="cs-play-tags">[${escapeHtml(tags.join(", "))}]</span>`);
  }

  if (displayOptions.callsheetShowMotion !== false && play.motion) {
    parts.push(`<span class="cs-motion">${escapeHtml(play.motion)}</span>`);
  }

  if (displayOptions.callsheetShowProtection !== false && play.protection) {
    parts.push(`<span class="cs-protection">${escapeHtml(play.protection)}</span>`);
  }

  if (displayOptions.callsheetShowLineCall !== false && play.lineCall) {
    parts.push(`<span class="cs-line-call">${escapeHtml(play.lineCall)}</span>`);
  }

  return parts;
}

// ============ DISPLAY OPTIONS HELPERS ============

function getCallSheetDisplayOptions() {
  const options = {};
  CALLSHEET_DISPLAY_IDS.forEach((id) => {
    const checkbox = document.getElementById(id);
    if (!checkbox) return;
    const isCheckbox = checkbox.type === "checkbox";
    const isSelect = checkbox.tagName === "SELECT";

    if (isCheckbox) {
      options[id] = checkbox.checked;
      if (id in CALLSHEET_DISPLAY_DEFAULTS) {
        options[id] = checkbox.checked || CALLSHEET_DISPLAY_DEFAULTS[id];
      }
    } else if (isSelect) {
      options[id] = checkbox.value;
    }
  });
  return options;
}

function getCallSheetPlayDisplayOptions(play, displayOptions = {}) {
  const overrides = {};
  CALLSHEET_CELL_DISPLAY_OVERRIDE_PROPS.forEach((prop) => {
    if (play[prop]) {
      overrides[prop] = play[prop];
    }
  });
  return { ...displayOptions, ...overrides };
}

function getPlayBorderColor(play) {
  if (!play) return null;

  const options = getCallSheetDisplayOptions();

  if (options.callsheetPersonnelBorder && play.personnel) {
    const personnelColor = getPersonnelBgColor(play.personnel);
    return personnelColor || (options.callsheetPersonnelBorderColor || null);
  }

  const typeMap = {
    red: "type.run",
    blue: "type.pass",
    green: "type.screen",
    orange: "type.tempo",
    purple: "situation.short-yardage",
  };

  for (const [borderKey, checkKey] of Object.entries(typeMap)) {
    const optionKey = `callsheet${borderKey.charAt(0).toUpperCase() + borderKey.slice(1)}Border`;
    if (options[optionKey]) {
      if (checkKey.startsWith("type.")) {
        const typeVal = checkKey.split(".")[1];
        if (play.type?.toLowerCase() === typeVal) {
          return CS_COLORS[borderKey] || null;
        }
      } else if (checkKey.startsWith("situation.")) {
        const situationVal = checkKey.split(".")[1];
        if (play.preferredSituation?.toLowerCase().includes(situationVal)) {
          return CS_COLORS[borderKey] || null;
        }
      }
    }
  }

  return null;
}

function getPersonnelCode(personnel) {
  if (!personnel) return "";
  const words = personnel.split(/\s+/);
  if (words.length === 1) return personnel.substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function getPersonnelBgColor(personnel) {
  const code = getPersonnelCode(personnel);
  const map = {
    "11": "#dc3545",
    "12": "#fd7e14",
    "20": "#ffc107",
    "21": "#28a745",
    "22": "#007bff",
    "30": "#6f42c1",
    "31": "#17a2b8",
  };
  return map[code] || null;
}

function getPersonnelTextColor(personnel) {
  const bg = getPersonnelBgColor(personnel);
  return ["#ffc107", "#17a2b8"].includes(bg) ? "#333" : "#fff";
}

function getCategoryHeaderTextColor(bg) {
  const lightBgs = ["#ffc107", "#ffe0b2", "#fff59d", "#dced8b"];
  return lightBgs.includes(bg) ? "#333" : "#fff";
}

function buildDuplicateMap(categories) {
  const map = {};
  categories.forEach((cat) => {
    const data = callSheet[cat.id] || { left: [], right: [] };
    const plays = [...(data.left || []), ...(data.right || [])];
    plays.forEach((play) => {
      const key = getPlayIdentityKey(play);
      map[key] = (map[key] || 0) + 1;
    });
  });
  return map;
}

function buildScoutingBadge(play) {
  // Scouting intel: top looks, coverage, blitz rate
  if (!play || typeof tendenciesOpponents === "undefined") return "";
  const intel = getTendenciesForCategory(play);
  if (!intel) return "";
  return `<span class="cs-scouting-badge" title="${escapeHtml(intel.label)}">${intel.icon}</span>`;
}

function buildDeadVsBadge(play) {
  // Dead vs badge
  if (!play || !play.deadVs) return "";
  if (typeof checkDeadVs !== "function") return "";
  const isDead = checkDeadVs(play);
  return isDead ? `<span class="cs-dead-vs-badge" title="Dead vs common looks">⚠️</span>` : "";
}

// ============ PRINT RENDERING ============

function openCallSheetPrintModal() {
  const modal = document.createElement("div");
  modal.className = "custom-modal-overlay visible";
  modal.id = "csPrintModal";
  modal.setAttribute("data-action", "closeCsPrintModalOverlay");

  const options = getCallSheetPrintOptions();

  let html = `
    <div class="custom-modal custom-modal-wide">
      <div class="custom-modal-header">
        <h3>Print Call Sheet</h3>
        <button class="close-modal-btn" data-action="closeCsPrintModal">×</button>
      </div>
      <div class="custom-modal-body">
        <div class="cs-print-options">
          <label>Paper Size: 
            <select id="csPrintPaperSize" data-onchange="updateCsPrintOption" data-pass="value" data-key="paperSize">
              <option value="letter" ${options.paperSize === "letter" ? "selected" : ""}>Letter (8.5" × 11")</option>
              <option value="legal" ${options.paperSize === "legal" ? "selected" : ""}>Legal (8.5" × 14")</option>
              <option value="a4" ${options.paperSize === "a4" ? "selected" : ""}>A4 (210mm × 297mm)</option>
            </select>
          </label>
          <label>Orientation: 
            <select id="csPrintOrientation" data-onchange="updateCsPrintOption" data-pass="value" data-key="orientation">
              <option value="portrait" ${options.orientation === "portrait" ? "selected" : ""}>Portrait</option>
              <option value="landscape" ${options.orientation === "landscape" ? "selected" : ""}>Landscape</option>
            </select>
          </label>
          <label>Pages: 
            <select id="csPrintPages" data-onchange="updateCsPrintOption" data-pass="value" data-key="pages">
              <option value="both" ${options.pages === "both" ? "selected" : ""}>Front & Back</option>
              <option value="front" ${options.pages === "front" ? "selected" : ""}>Front Only</option>
              <option value="back" ${options.pages === "back" ? "selected" : ""}>Back Only</option>
              <option value="current" ${options.pages === "current" ? "selected" : ""}>Current Page Only</option>
            </select>
          </label>
          <label>Margin: 
            <input type="number" id="csPrintMargin" min="0" max="2" step="0.25" value="${options.margin}" data-oninput="updateCsPrintOption" data-key="margin" data-pass="value" />
          </label>
        </div>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-primary" data-action="executeCsPrintModal">Print</button>
        <button class="btn" data-action="closeCsPrintModal">Cancel</button>
      </div>
    </div>
  `;

  modal.innerHTML = html;
  document.body.appendChild(modal);
  trapFocus(modal);
}

function _csRunPrint(options) {
  const pages = _csGetPrintPages(options.pages);
  const html = pages.map((page) => renderCallSheetPrintPage(page, options)).join("");

  const printWin = window.open("", "_blank");
  printWin.document.write(`
    <html>
    <head>
      <title>Call Sheet</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; }
        .print-page { page-break-after: always; padding: ${_csPrintMarginValue(options.margin, options.orientation)}; }
        .cs-print-grid { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `);
  printWin.document.close();
  setTimeout(() => printWin.print(), 250);
}

function renderCallSheetPrintPage(page, opts) {
  const categories = getCallSheetCategoriesForPage(page);
  const displayOptions = getCallSheetDisplayOptions();

  let html = `<div class="print-page">`;
  html += `<h1>${escapeHtml(page.toUpperCase() + " PAGE")}</h1>`;
  categories.forEach((cat) => {
    const data = callSheet[cat.id] || { left: [], right: [] };
    html += renderPrintCategory(cat, data, displayOptions);
  });
  html += `</div>`;

  return html;
}

function renderPrintCategory(cat, data, options) {
  const displayName = getCategoryDisplayName(cat);
  const color = getCategoryColor(cat);
  const plays = [...(data.left || []), ...(data.right || [])];

  let html = `
    <div class="cs-print-category" style="border-top: 3px solid ${color}; margin-top: 20px; padding: 10px 0;">
      <h3 style="color: ${color}; margin-bottom: 10px;">${escapeHtml(displayName)}</h3>
      <table class="cs-print-grid">
  `;

  plays.forEach((play) => {
    html += `<tr><td>${renderPrintPlay(play, options)}</td></tr>`;
  });

  html += `</table></div>`;
  return html;
}

function renderPrintPlay(play, options) {
  const displayText = buildCallSheetPlayDisplay(play, options);
  const densityClass = getCallSheetPrintDensityClass(displayText.length);
  return `<span class="cs-print-play ${densityClass}">${displayText}</span>`;
}

function getCallSheetPrintDensityClass(textLength) {
  if (textLength > 100) return "cs-print-density-micro";
  if (textLength > 80) return "cs-print-density-dense";
  if (textLength > 60) return "cs-print-density-compact";
  return "cs-print-density-normal";
}

function _csGetPrintPages(pages) {
  if (pages === "current") return [callSheetSettings.currentPage];
  if (pages === "front") return ["front"];
  if (pages === "back") return ["back"];
  return ["front", "back"];
}

function _csPrintMarginValue(margin, orientation) {
  const baseMargin = Math.max(0.25, Math.min(2, parseFloat(margin) || 0.5));
  return `${baseMargin}in`;
}

// ============ SORT RENDERING ============

function renderCsSortCriteria() {
  const container = document.getElementById("csSortCriteriaList");
  if (!container) return;

  container.innerHTML = csSortCriteria
    .map((criteria, idx) => {
      const fieldOptions = CS_SORT_FIELDS.map(
        (f) =>
          `<option value="${f.value}" ${criteria.field === f.value ? "selected" : ""}>${f.label}</option>`,
      ).join("");

      const dirIcon = criteria.direction === "asc" ? "↑" : "↓";
      const dirTitle =
        criteria.direction === "asc" ? "Ascending (A→Z)" : "Descending (Z→A)";

      const hasCustom =
        csSortCustomOrders[criteria.field] &&
        csSortCustomOrders[criteria.field].length > 0;
      const customIcon = hasCustom ? "🎨" : "⚙️";
      const customTitle = hasCustom
        ? "Custom order set — click to edit"
        : "Set custom value order";

      return `
        <div class="cs-sort-criteria-item" draggable="true" data-idx="${idx}" data-drag="csSortDrag">
          <span class="drag-handle">☰</span>
          <select data-onchange="updateCsSortField" data-key="${idx}" data-pass="value">${fieldOptions}</select>
          <button class="sort-dir-btn" data-action="toggleCsSortDirection" data-idx="${idx}" title="${dirTitle}">${dirIcon}</button>
          <button class="custom-order-btn custom-order-btn-compact" data-action="openCsCustomOrderModal" data-arg="${criteria.field}" title="${customTitle}">${customIcon}</button>
          <button class="remove-sort-btn" data-action="removeCsSortCriteria" data-idx="${idx}">✕</button>
        </div>
      `;
    })
    .join("");
}

function updatePageToggle() {
  const frontBtn = document.getElementById("csPageFrontBtn");
  const backBtn = document.getElementById("csPageBackBtn");
  
  if (frontBtn) {
    frontBtn.classList.toggle("active", callSheetSettings.currentPage === "front");
  }
  if (backBtn) {
    backBtn.classList.toggle("active", callSheetSettings.currentPage === "back");
  }

  const orientLandscape = document.getElementById("csOrientLandscape");
  const orientPortrait = document.getElementById("csOrientPortrait");
  
  if (orientLandscape) {
    orientLandscape.classList.toggle("active", callSheetSettings.orientation === "landscape");
  }
  if (orientPortrait) {
    orientPortrait.classList.toggle("active", callSheetSettings.orientation === "portrait");
  }
}

