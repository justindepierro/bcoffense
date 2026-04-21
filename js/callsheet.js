// Call Sheet functionality

// Module-scoped picker state (avoids JSON.stringify in onclick for XSS safety)
let _csPickerFiltered = [];

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
    position: null,
  },

  // Row 2
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
    position: null,
  },

  // Row 3
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

  // Row 4
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

  // Row 5
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

  // Row 6
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

  // Row 7
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
    manual: true,
  },
  {
    id: "2-point",
    name: "2 Point Plays",
    color: CS_COLORS.green,
    situation: null,
    position: null,
    manual: true,
  },

  // Column 2: Play Types continued
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

  // Column 3: Player-specific (editable names)
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

// Store for call sheet data: { categoryId: { left: [...plays], right: [...plays], customName: "..." } }
let callSheet = {};

// Call sheet settings
let callSheetSettings = {
  orientation: "portrait", // portrait or landscape
  currentPage: "front", // front or back
  customNames: {}, // { categoryId: "Custom Name" }
  loadedWristbandName: "", // Name of loaded wristband
  loadedWristbandPlays: [], // Plays from loaded wristband with numbers
};

// Current edit state
let editingCategory = null;
let editingHash = null;

// Autosave timer
let callSheetAutosaveTimer = null;

// Custom category ordering (array of category IDs per page)
let csCategoryOrder = { front: null, back: null };

// Per-category notes
let csNotes = {};

// Per-category play count targets
let csTargets = {};

// Collapsed categories set
let csCollapsed = new Set();

// Scouting overlay state (persisted)
let csScoutingOverlayOn = storageManager.get(
  STORAGE_KEYS.CS_SCOUTING_OVERLAY,
  false,
);

// All call sheet display/format/border checkbox & select IDs for persistence
const CALLSHEET_DISPLAY_IDS = [
  // Show/Hide
  "callsheetShowNumbers",
  "callsheetShowPersonnel",
  "callsheetShowFormation",
  "callsheetShowProtection",
  "callsheetShowPlayName",
  "callsheetShowTags",
  "callsheetShowMotion",
  "callsheetShowLineCall",
  // Formatting
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
  // Borders (selects)
  "callsheetRedBorder",
  "callsheetBlueBorder",
  "callsheetGreenBorder",
  "callsheetOrangeBorder",
  "callsheetPurpleBorder",
  "callsheetPersonnelBorder",
  "callsheetPersonnelBorderColor",
];

/**
 * Initialize call sheet
 */
function initCallSheet() {
  try {
    // Load settings
    const savedSettings = storageManager.get(
      STORAGE_KEYS.CALL_SHEET_SETTINGS,
      null,
    );
    if (savedSettings) {
      callSheetSettings = { ...callSheetSettings, ...savedSettings };
    }

    // Load saved call sheet data
    const savedCallSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
    if (savedCallSheet) {
      callSheet = savedCallSheet;
    }

    // Initialize empty data structure for any missing categories
    CALLSHEET_CATEGORIES.forEach((cat) => {
      if (!callSheet[cat.id]) {
        callSheet[cat.id] = { left: [], right: [] };
      }
    });

    // Load category order
    const savedOrder = storageManager.get(
      STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER,
      null,
    );
    if (savedOrder) csCategoryOrder = savedOrder;

    // Load notes
    csNotes = storageManager.get(STORAGE_KEYS.CALLSHEET_NOTES, {});

    // Load targets
    csTargets = storageManager.get(STORAGE_KEYS.CALLSHEET_TARGETS, {});

    // Load collapsed
    const savedCollapsed = storageManager.get(
      STORAGE_KEYS.CALLSHEET_COLLAPSED,
      [],
    );
    csCollapsed = new Set(savedCollapsed);

    // Restore display option checkbox states
    restoreCallSheetDisplayOptions();

    // Populate user presets in dropdown
    refreshPresetDropdown();

    renderCallSheet();

  } catch (err) {
    console.error("initCallSheet error:", err);
    showToast("❌ Error initializing call sheet.", {
      duration: 4000,
      type: "error",
    });
  }
}

/**
 * Auto-populate call sheet from playbook based on preferred fields
 */
async function autoPopulateCallSheet() {
  try {
    const ok = await showConfirm(
      "This will clear the current call sheet and repopulate from your playbook based on preferred fields and play types. Continue?",
      {
        title: "Auto-Populate Call Sheet",
        icon: "⚡",
        confirmText: "Populate",
      },
    );
    if (!ok) return;

    // Clear existing
    CALLSHEET_CATEGORIES.forEach((cat) => {
      callSheet[cat.id] = { left: [], right: [] };
    });

    // Track which plays go where for dedup per category
    const seen = {}; // { catId: Set of play keys }
    let totalPlaced = 0;
    let unmatched = 0;

    // Build a unique key for a play (formation + play name + personnel)
    const playKey = (p) =>
      `${(p.formation || "").toLowerCase()}|${(p.play || "").toLowerCase()}|${(p.personnel || "").toLowerCase()}`;

    // Go through each play and categorize
    plays.forEach((play) => {
      const categories = findMatchingCategories(play);

      if (categories.length === 0) {
        unmatched++;
        return;
      }

      categories.forEach((catId) => {
        // Dedup: don't add same play to same category twice
        if (!seen[catId]) seen[catId] = new Set();
        const key = playKey(play);
        if (seen[catId].has(key)) return;
        seen[catId].add(key);

        const hash = (play.preferredHash || "").toLowerCase().trim();
        const playWithNum = {
          ...play,
          wristbandNumber: getWristbandNumberForPlay(play),
        };

        if (hash === "left" || hash === "l") {
          callSheet[catId].left.push(playWithNum);
        } else if (hash === "right" || hash === "r") {
          callSheet[catId].right.push(playWithNum);
        } else {
          // Unspecified hash — distribute evenly (alternate L/R)
          const leftLen = callSheet[catId].left.length;
          const rightLen = callSheet[catId].right.length;
          if (leftLen <= rightLen) {
            callSheet[catId].left.push(playWithNum);
          } else {
            callSheet[catId].right.push(playWithNum);
          }
        }
        totalPlaced++;
      });
    });

    renderCallSheet();
    saveCallSheet();

    let msg = `⚡ Placed ${totalPlaced} entries from ${plays.length} plays`;
    if (unmatched > 0) {
      msg += ` (${unmatched} unmatched)`;
    }
    showToast(msg);
  } catch (err) {
    console.error("autoPopulateCallSheet error:", err);
    showToast("❌ Error auto-populating call sheet.", {
      duration: 4000,
      type: "error",
    });
  }
}

/**
 * Get wristband number for a play by matching with loaded wristband
 */
function getWristbandNumberForPlay(play) {
  if (
    !callSheetSettings.loadedWristbandPlays ||
    callSheetSettings.loadedWristbandPlays.length === 0
  ) {
    return null;
  }

  // Try to find a matching play in the loaded wristband
  // Match on formation + play name, with optional personnel match
  let match = callSheetSettings.loadedWristbandPlays.find(
    (wp) =>
      wp.formation === play.formation &&
      wp.play === play.play &&
      wp.personnel === play.personnel,
  );

  // If no exact match, try matching without personnel
  if (!match) {
    match = callSheetSettings.loadedWristbandPlays.find(
      (wp) => wp.formation === play.formation && wp.play === play.play,
    );
  }

  // If still no match, try case-insensitive matching
  if (!match) {
    const playForm = (play.formation || "").toLowerCase().trim();
    const playName = (play.play || "").toLowerCase().trim();
    match = callSheetSettings.loadedWristbandPlays.find(
      (wp) =>
        (wp.formation || "").toLowerCase().trim() === playForm &&
        (wp.play || "").toLowerCase().trim() === playName,
    );
  }

  return match ? match.wristbandNumber : null;
}

/**
 * Split a preferred field value into individual values.
 * Handles comma, pipe, semicolon, and slash separators.
 */
function splitPreferredValues(value) {
  if (!value) return [];
  return value
    .split(/[,|;\/]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Find which categories a play belongs to (FRONT page: situational; BACK page: play-type).
 *
 * FRONT page matching logic:
 *   Each category can define up to 3 filter axes: situation, down+distance, position.
 *   - If a category has BOTH position AND situation, BOTH must match (e.g., Goal Line).
 *   - Otherwise any single matching axis is sufficient.
 *   - Down+distance checks support multi-value preferred fields (e.g., "2,3" in preferredDown).
 *   - Field position supports aliases (Green ↔ Fringe, etc.).
 *
 * BACK page matching logic:
 *   Categories with a `playType` field match against the play's `type` column.
 *   Substring matching handles variations (e.g., "Run" matches "Run", "Run Option" matches "Run Option").
 *   "Perimeter Screens" only matches plays whose basePlay/notes/tags suggest perimeter.
 */
function findMatchingCategories(play) {
  const matches = [];

  // Normalize play fields — support multi-value preferred fields
  const situations = splitPreferredValues(play.preferredSituation);
  const downs = splitPreferredValues(play.preferredDown?.toString());
  const distances = splitPreferredValues(play.preferredDistance);
  const positions = splitPreferredValues(play.preferredFieldPosition);
  const playType = (play.type || "").toLowerCase().trim();

  // Field position aliases (both directions)
  const positionAliases = {
    green: ["green", "fringe"],
    fringe: ["green", "fringe"],
    "lo-rz": ["lo-rz", "low red zone", "low rz"],
    "hi-rz": ["hi-rz", "high red zone", "high rz", "red zone"],
    "red zone": ["hi-rz", "red zone"],
    "goal line": ["goal line", "goalline"],
    goalline: ["goal line", "goalline"],
    "backed up": ["backed up", "backedup", "own territory"],
    backedup: ["backed up", "backedup"],
    saigon: ["saigon"],
  };

  /**
   * Check if any of the play's position values match a category position.
   */
  function positionMatches(catPosition) {
    const catPosLower = catPosition.toLowerCase();
    const aliasGroup = positionAliases[catPosLower] || [catPosLower];
    return positions.some((p) => aliasGroup.includes(p));
  }

  CALLSHEET_CATEGORIES.forEach((cat) => {
    if (cat.manual) return; // Skip manual-only categories

    // ─── BACK PAGE: Play-type matching ───
    if (cat.playType) {
      const catType = cat.playType.toLowerCase();

      // Special: "Perimeter Screens" — only screens tagged as perimeter
      if (cat.id === "perimeter-screens") {
        if (playType.includes("screen")) {
          const tags = [play.basePlay, play.playTag1, play.playTag2, play.notes]
            .join(" ")
            .toLowerCase();
          if (
            tags.includes("perimeter") ||
            tags.includes("bubble") ||
            tags.includes("tunnel") ||
            tags.includes("swing") ||
            tags.includes("jailbreak")
          ) {
            matches.push(cat.id);
          }
        }
        return;
      }

      // Special: "Screen" (general) — all screens EXCEPT the ones caught by perimeter
      if (cat.id === "screen") {
        if (playType.includes("screen")) {
          matches.push(cat.id);
        }
        return;
      }

      // Special: "Opener" — check both playType and preferredSituation
      if (catType === "opener") {
        if (
          playType.includes("opener") ||
          situations.includes("opener") ||
          situations.includes("openers")
        ) {
          matches.push(cat.id);
        }
        return;
      }

      // General play-type match (exact or substring)
      // "Run" should NOT match "Run Option" — use exact word matching
      if (catType === "run") {
        if (playType === "run" || playType === "base run") {
          matches.push(cat.id);
        }
      } else if (catType === "run option") {
        if (playType === "run option" || playType.includes("run option")) {
          matches.push(cat.id);
        }
      } else if (catType === "pass") {
        if (
          playType === "pass" ||
          playType === "base pass" ||
          playType === "drop back"
        ) {
          matches.push(cat.id);
        }
      } else if (catType === "quick") {
        if (playType === "quick" || playType.includes("quick")) {
          matches.push(cat.id);
        }
      } else if (catType === "play action") {
        if (
          playType === "play action" ||
          playType === "pa" ||
          playType.includes("play action") ||
          playType.includes("play-action")
        ) {
          matches.push(cat.id);
        }
      } else if (catType === "rpo") {
        if (playType === "rpo" || playType.includes("rpo")) {
          matches.push(cat.id);
        }
      } else if (catType === "movement") {
        if (
          playType.includes("movement") ||
          playType.includes("boot") ||
          playType.includes("bootleg") ||
          playType.includes("sprint") ||
          playType.includes("naked") ||
          playType.includes("roll")
        ) {
          matches.push(cat.id);
        }
      } else {
        // Fallback: general substring match for any future types
        if (playType.includes(catType)) {
          matches.push(cat.id);
        }
      }

      // Play-type categories that also have down (like "1st Down") fall through below
      if (!cat.down) return;
    }

    // ─── FRONT PAGE: Situational matching ───
    let situationMatch = false;
    let downDistMatch = false;
    let posMatch = false;

    // 1. Check situation (support multi-value)
    if (cat.situation) {
      const catSit = cat.situation.toLowerCase();
      situationMatch = situations.includes(catSit);
    }

    // 2. Check down + distance (support multi-value)
    if (cat.down) {
      const catDown = cat.down;
      const downOk = downs.includes(catDown);

      if (cat.distance) {
        const catDist = cat.distance.toLowerCase();
        const distOk = distances.includes(catDist);
        downDistMatch = downOk && distOk;
      } else {
        // Down-only match (e.g., "1st Down", "4th Down")
        downDistMatch = downOk;
      }
    }

    // 3. Check field position (support aliases + multi-value)
    if (cat.position) {
      posMatch = positionMatches(cat.position);
    }

    // ─── Combine axes ───
    // If category requires BOTH position AND situation (e.g., Goal Line = Short Yardage + Goal Line position)
    if (cat.position && cat.situation) {
      if (posMatch && situationMatch) {
        matches.push(cat.id);
      }
    } else {
      // Otherwise, any matching axis is sufficient
      if (situationMatch || downDistMatch || posMatch) {
        matches.push(cat.id);
      }
    }
  });

  return matches;
}

/**
 * Get personnel abbreviation code
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
  let categories = page === "front" ? [...CALLSHEET_FRONT] : [...CALLSHEET_BACK];
  const customOrder = csCategoryOrder[page];

  if (!customOrder || customOrder.length === 0) {
    return categories;
  }

  const ordered = [];
  customOrder.forEach((id) => {
    const cat = categories.find((candidate) => candidate.id === id);
    if (cat) ordered.push(cat);
  });

  categories.forEach((cat) => {
    if (!ordered.find((candidate) => candidate.id === cat.id)) {
      ordered.push(cat);
    }
  });

  return ordered;
}

function buildCallSheetColumns(categories) {
  return [
    categories.filter((_, i) => i % 3 === 0),
    categories.filter((_, i) => i % 3 === 1),
    categories.filter((_, i) => i % 3 === 2),
  ];
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

  const page = callSheetSettings.currentPage;
  const categories = getCallSheetCategoriesForPage(page);

  // Hoist display options once — avoids re-reading DOM per play
  const displayOptions = getCallSheetDisplayOptions();

  // Build duplicate map for this render
  const dupeMap = buildDuplicateMap();

  let html = "";

  // Create 3-column layout
  const columns = buildCallSheetColumns(categories);

  // Add orientation class
  const orientClass =
    callSheetSettings.orientation === "landscape"
      ? "callsheet-landscape"
      : "callsheet-portrait";
  html += `<div class="callsheet-columns ${orientClass}">`;

  columns.forEach((column) => {
    html += '<div class="callsheet-column">';
    column.forEach((cat) => {
      const data = callSheet[cat.id] || { left: [], right: [] };
      html += renderCategory(cat, data, dupeMap, displayOptions);
    });
    html += "</div>";
  });

  html += "</div>";

  container.innerHTML = html;

  // Update page toggle buttons
  updatePageToggle();

  // Update loaded wristband display
  updateLoadedWristbandDisplay();

  // Update stats panel if visible
  updateStatsPanel();

  // Attach long-press for mobile context menus on callsheet plays
  if (typeof addLongPress === "function") {
    container.querySelectorAll(".callsheet-play").forEach((el) => {
      const catId = el.dataset.category;
      const hash = el.dataset.hash;
      const idx = parseInt(el.dataset.index, 10);
      if (catId && hash && !isNaN(idx)) {
        addLongPress(el, (ev) => showPlayContextMenu(ev, catId, hash, idx));
      }
    });
  }

  // Update undo/redo button state
  historyManager.updateButtons("callsheet");
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

function requestRenderCallSheet() {
  saveCallSheetDisplayOptions();
  _scheduleRenderCallSheet();
}

/**
 * Switch between front and back page
 */
function switchCallSheetPage(page) {
  callSheetSettings.currentPage = page;
  saveCallSheetSettings();
  renderCallSheet();
}

/**
 * Toggle orientation
 */
function setCallSheetOrientation(orient) {
  callSheetSettings.orientation = orient;
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
 * Get display name for category (supports custom names)
 */
function getCategoryDisplayName(cat) {
  return callSheetSettings.customNames[cat.id] || cat.name;
}

/**
 * Edit category name
 */
function editCategoryName(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;

  const currentName = getCategoryDisplayName(cat);

  // Find the header element and replace with an inline input
  const headerEl = document.querySelector(
    `.callsheet-category[data-category="${categoryId}"] .category-header`,
  );
  if (!headerEl) return;

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.className = "cs-rename-input";
  input.setAttribute("aria-label", "Rename category");

  const originalHTML = headerEl.innerHTML;
  headerEl.innerHTML = "";
  headerEl.appendChild(input);
  input.focus();
  input.select();

  const finishRename = () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      callSheetSettings.customNames[categoryId] = newName;
      saveCallSheetSettings();
      showToast(`✏️ Renamed to "${newName}"`);
    }
    renderCallSheet();
  };

  input.addEventListener("blur", finishRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
    if (e.key === "Escape") {
      headerEl.innerHTML = originalHTML;
    }
  });
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

  // Determine header text color based on background
  const textColor = getCategoryHeaderTextColor(cat.color);

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
      <div class="category-header cs-cat-header" style="background: ${cat.color}; color: ${textColor};"
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
    html += `<div class="callsheet-dropzone" data-action="openCallSheetPlayPicker" data-cat="${cat.id}" data-hash="left" role="button" aria-label="Add play to left hash">+ Add</div>`;

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
    html += `<div class="callsheet-dropzone" data-action="openCallSheetPlayPicker" data-cat="${cat.id}" data-hash="right" role="button" aria-label="Add play to right hash">+ Add</div>`;

    html += `
        </div>
      </div>`;
  }

  html += `</div>`;
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
  if (!options) options = getCallSheetDisplayOptions();
  const code = getPersonnelCode(play.personnel);
  const bgColor = getPersonnelBgColor(play.personnel);
  const textColor = getPersonnelTextColor(play.personnel);
  const isHighlighted = play.highlighted || false;
  const borderColor = getPlayBorderColor(play, options);

  // Build tempo class
  const tempo = (play.tempo || "").toLowerCase();
  let tempoClass = "";
  if (options.highlightHuddle && tempo === "huddle")
    tempoClass = "tempo-huddle";
  else if (options.highlightCandy && tempo === "candy")
    tempoClass = "tempo-candy";

  // Use shared play text builder
  const playParts = buildCallSheetPlayParts(play, options);
  if (options.showNumbers && play.wristbandNumber) {
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
  const visiblePlayText = playText.trim() || fallbackPlayText;
  const highlightClass = isHighlighted ? "highlighted" : "";

  // Build per-cell inline styles
  let cellStyles = [];
  if (borderColor) cellStyles.push(`border: 2px solid ${borderColor}`);
  if (play.cellBg) cellStyles.push(`background: ${play.cellBg}`);
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
    play.cellBg ||
    play.cellTextColor ||
    play.cellBold ||
    play.cellItalic ||
    play.cellUnderline ||
    play.cellStrikethrough ||
    play.cellFontSize ||
    play.cellNote;
  const formatIndicator = hasFormat
    ? `<span class="cs-cell-format-dot" title="Custom formatting applied">✦</span>`
    : "";

  const personnelHtml = options.showPersonnel
    ? `<span class="personnel-code" style="background: ${bgColor}; color: ${textColor};">${code}</span>`
    : "";

  // Cell note badge
  const noteBadge = play.cellNote
    ? `<span class="cs-cell-note-badge" title="${play.cellNote.replace(/"/g, "&quot;")}">📝</span>`
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

  return `
    <div class="callsheet-play ${highlightClass} ${tempoClass}${deadVsBadgeHtml ? " cs-play-has-warning" : ""}" draggable="true"
         style="${cellStyleStr}"
         role="row" aria-label="${escapeHtml(playLabel.trim())}"
         data-category="${categoryId}" data-hash="${hash}" data-index="${index}">
      ${personnelHtml}
      <span class="play-text" role="cell">${visiblePlayText}</span>
      ${formatIndicator}
      ${noteBadge}
      ${dupeBadge}
      ${deadVsBadgeHtml}
      ${swapBtn}
      <button class="remove-play" data-action="removeCallSheetPlay" data-category="${categoryId}" data-hash="${hash}" data-index="${index}" aria-label="Remove ${escapeHtml(playLabel.trim())}">×</button>
    </div>
  `;
}

/**
 * Show context menu for play (border color, copy to category, move)
 */
function showPlayContextMenu(event, categoryId, hash, index) {
  const page = callSheetSettings.currentPage;
  const categories = page === "front" ? CALLSHEET_FRONT : CALLSHEET_BACK;
  const otherHash = hash === "left" ? "right" : "left";
  const play = callSheet[categoryId]?.[hash]?.[index];
  if (!play) return;

  const borderColors = [
    { name: "None", value: "", swatch: "⬜" },
    { name: "Red", value: CS_COLORS.red, swatch: "🔴" },
    { name: "Blue", value: CS_COLORS.blue, swatch: "🔵" },
    { name: "Green", value: CS_COLORS.green, swatch: "🟢" },
    { name: "Yellow", value: CS_COLORS.yellow, swatch: "🟡" },
    { name: "Orange", value: CS_COLORS.orange, swatch: "🟠" },
    { name: "Purple", value: CS_COLORS.purple, swatch: "🟣" },
  ];

  const bgColors = [
    { name: "None", value: "", css: "#f8f8f8" },
    { name: "Yellow", value: "#fff9c4", css: "#fff9c4" },
    { name: "Green", value: "#c8e6c9", css: "#c8e6c9" },
    { name: "Blue", value: "#bbdefb", css: "#bbdefb" },
    { name: "Pink", value: "#f8bbd0", css: "#f8bbd0" },
    { name: "Orange", value: "#ffe0b2", css: "#ffe0b2" },
    { name: "Lavender", value: "#e1bee7", css: "#e1bee7" },
    { name: "Gray", value: "#e0e0e0", css: "#e0e0e0" },
  ];

  const textColors = [
    { name: "Default", value: "", css: UI_COLORS.textDark },
    { name: "Red", value: CS_COLORS.red, css: CS_COLORS.red },
    { name: "Blue", value: CS_COLORS.blue, css: CS_COLORS.blue },
    { name: "Green", value: "#1b5e20", css: "#1b5e20" },
    { name: "Purple", value: CS_COLORS.purple, css: CS_COLORS.purple },
    { name: "Orange", value: "#e65100", css: "#e65100" },
    { name: "White", value: UI_COLORS.textWhite, css: UI_COLORS.textWhite },
  ];

  const menu = document.createElement("div");
  menu.className = "cs-context-menu cs-ctx-wide";

  // ─── Border Color ───
  let menuHtml = `<div class="cs-ctx-section"><span class="cs-ctx-label">Border Color</span><div class="cs-ctx-colors">`;
  borderColors.forEach((c) => {
    const sel = (play.borderColor || "") === c.value ? " cs-swatch-active" : "";
    menuHtml += `<button class="cs-border-swatch${sel}" data-action="border" data-color="${c.value}" title="${c.name}">${c.swatch}</button>`;
  });
  menuHtml += `</div></div>`;

  // ─── Background Color ───
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Background Color</span><div class="cs-ctx-colors">`;
  bgColors.forEach((c) => {
    const sel = (play.cellBg || "") === c.value ? " cs-swatch-active" : "";
    menuHtml += `<button class="cs-color-swatch${sel}" data-action="cellBg" data-color="${c.value}" style="background:${c.css};" title="${c.name}"></button>`;
  });
  menuHtml += `</div></div>`;

  // ─── Text Color ───
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Text Color</span><div class="cs-ctx-colors">`;
  textColors.forEach((c) => {
    const sel =
      (play.cellTextColor || "") === c.value ? " cs-swatch-active" : "";
    menuHtml += `<button class="cs-color-swatch${sel}" data-action="cellTextColor" data-color="${c.value}" style="background:${c.css};" title="${c.name}"></button>`;
  });
  menuHtml += `</div></div>`;

  menuHtml += `<div class="cs-ctx-divider"></div>`;

  // ─── Text Style ───
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Text Style</span><div class="cs-ctx-styles">`;
  menuHtml += `<button class="cs-style-btn${play.cellBold ? " active" : ""}" data-action="toggleStyle" data-prop="cellBold" title="Bold"><b>B</b></button>`;
  menuHtml += `<button class="cs-style-btn${play.cellItalic ? " active" : ""}" data-action="toggleStyle" data-prop="cellItalic" title="Italic"><i>I</i></button>`;
  menuHtml += `<button class="cs-style-btn${play.cellUnderline ? " active" : ""}" data-action="toggleStyle" data-prop="cellUnderline" title="Underline"><u>U</u></button>`;
  menuHtml += `<button class="cs-style-btn${play.cellStrikethrough ? " active" : ""}" data-action="toggleStyle" data-prop="cellStrikethrough" title="Strikethrough"><s>S</s></button>`;
  menuHtml += `</div></div>`;

  // ─── Font Size ───
  const curSize = play.cellFontSize || "";
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Font Size</span><div class="cs-ctx-sizes">`;
  [
    { label: "XS", value: "8px" },
    { label: "S", value: "9px" },
    { label: "M", value: "" },
    { label: "L", value: "12px" },
    { label: "XL", value: "14px" },
  ].forEach((s) => {
    const sel = curSize === s.value ? " active" : "";
    menuHtml += `<button class="cs-size-btn${sel}" data-action="fontSize" data-size="${s.value}" title="${s.label}">${s.label}</button>`;
  });
  menuHtml += `</div></div>`;

  menuHtml += `<div class="cs-ctx-divider"></div>`;

  // ─── Cell Note ───
  const noteVal = (play.cellNote || "").replace(/"/g, "&quot;");
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Cell Note</span>`;
  menuHtml += `<div class="cs-ctx-note-row"><input type="text" class="cs-ctx-note-input" value="${noteVal}" placeholder="Add a note..." maxlength="60" />`;
  menuHtml += `<button class="cs-ctx-note-save" data-action="saveNote" title="Save note">✓</button></div></div>`;

  menuHtml += `<div class="cs-ctx-divider"></div>`;

  // ─── Actions ───
  menuHtml += `<button class="cs-ctx-item" data-action="swap">↔ Move to ${otherHash} hash</button>`;
  menuHtml += `<button class="cs-ctx-item cs-ctx-clear" data-action="clearFormat">✖ Clear All Formatting</button>`;

  // Copy to category submenu
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">📋 Copy to category...</span><div class="cs-ctx-cat-list">`;
  categories.forEach((cat) => {
    if (cat.id === categoryId) return;
    const name = getCategoryDisplayName(cat);
    menuHtml += `<button class="cs-ctx-cat-btn" data-action="copy" data-cat="${cat.id}">${name}</button>`;
  });
  menuHtml += `</div></div>`;

  menu.innerHTML = menuHtml;

  // ─── Event handlers ───
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const p = callSheet[categoryId]?.[hash]?.[index];
    if (!p) {
      menu.remove();
      return;
    }

    if (action === "border") {
      p.borderColor = btn.dataset.color || undefined;
      renderCallSheet();
      saveCallSheet();
      menu.remove();
    } else if (action === "cellBg") {
      p.cellBg = btn.dataset.color || undefined;
      renderCallSheet();
      saveCallSheet();
      menu.remove();
    } else if (action === "cellTextColor") {
      p.cellTextColor = btn.dataset.color || undefined;
      renderCallSheet();
      saveCallSheet();
      menu.remove();
    } else if (action === "toggleStyle") {
      const prop = btn.dataset.prop;
      p[prop] = !p[prop];
      if (!p[prop]) delete p[prop];
      btn.classList.toggle("active");
      renderCallSheet();
      saveCallSheet();
    } else if (action === "fontSize") {
      p.cellFontSize = btn.dataset.size || undefined;
      renderCallSheet();
      saveCallSheet();
      menu.remove();
    } else if (action === "saveNote") {
      const input = menu.querySelector(".cs-ctx-note-input");
      const val = (input?.value || "").trim();
      p.cellNote = val || undefined;
      renderCallSheet();
      saveCallSheet();
      showToast(val ? "📝 Note saved" : "📝 Note removed");
      menu.remove();
    } else if (action === "clearFormat") {
      delete p.borderColor;
      delete p.cellBg;
      delete p.cellTextColor;
      delete p.cellBold;
      delete p.cellItalic;
      delete p.cellUnderline;
      delete p.cellStrikethrough;
      delete p.cellFontSize;
      delete p.cellNote;
      renderCallSheet();
      saveCallSheet();
      showToast("✖ Formatting cleared");
      menu.remove();
    } else if (action === "swap") {
      swapPlayHash(categoryId, hash, index);
      menu.remove();
    } else if (action === "copy") {
      const targetCat = btn.dataset.cat;
      const copy = { ...p };
      const targetData = callSheet[targetCat] || { left: [], right: [] };
      if (targetData.left.length <= targetData.right.length) {
        targetData.left.push(copy);
      } else {
        targetData.right.push(copy);
      }
      renderCallSheet();
      saveCallSheet();
      showToast(
        `📋 Copied to ${getCategoryDisplayName(CALLSHEET_CATEGORIES.find((c) => c.id === targetCat))}`,
      );
      menu.remove();
    }
  });

  // Allow Enter key in note input
  const noteInput = menu.querySelector(".cs-ctx-note-input");
  if (noteInput) {
    noteInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        menu.querySelector('[data-action="saveNote"]')?.click();
      }
      e.stopPropagation();
    });
    noteInput.addEventListener("click", (e) => e.stopPropagation());
  }

  showContextMenu(event, menu);
}

/**
 * Toggle highlight on a play
 */
function togglePlayHighlight(categoryId, hash, index) {
  if (!callSheet[categoryId] || !callSheet[categoryId][hash]) return;

  const play = callSheet[categoryId][hash][index];
  if (play) {
    play.highlighted = !play.highlighted;
    renderCallSheet();
    saveCallSheet();
  }
}

/**
 * Open play picker for adding to call sheet
 */
function openCallSheetPlayPicker(categoryId, hash) {
  editingCategory = categoryId;
  editingHash = hash;

  // Reset filters
  document.getElementById("callSheetPlaySearch").value = "";
  const pickerSelects = [
    "callSheetPickerPersonnel",
    "callSheetPickerFormation",
    "callSheetPickerPlayType",
    "callSheetPickerBack",
    "callSheetPickerTempo",
    "callSheetPickerSort",
  ];
  pickerSelects.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // Populate filter dropdowns
  populateCallSheetPickerFilters();

  // Show/hide wristband select based on source
  updatePickerSourceUI();

  populateCallSheetPlayList();
  document.getElementById("callSheetPickerOverlay").classList.remove("hidden");
  trapFocus(document.getElementById("callSheetPickerOverlay"));
}

/**
 * Populate filter dropdowns in picker (single-pass collection)
 */
function populateCallSheetPickerFilters() {
  // Collect all unique values in one pass
  const sets = {
    personnel: new Set(),
    formation: new Set(),
    back: new Set(),
    tempo: new Set(),
    type: new Set(),
  };
  for (const p of plays) {
    if (p.personnel) sets.personnel.add(p.personnel);
    if (p.formation) sets.formation.add(p.formation);
    if (p.back) sets.back.add(p.back);
    if (p.tempo) sets.tempo.add(p.tempo);
    if (p.type) sets.type.add(p.type);
  }

  function fillDropdown(selectId, values, allLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const sorted = [...values].sort();
    select.innerHTML =
      `<option value="">${allLabel}</option>` +
      sorted
        .map(
          (v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`,
        )
        .join("");
  }

  fillDropdown("callSheetPickerPersonnel", sets.personnel, "All Personnel");
  fillDropdown("callSheetPickerFormation", sets.formation, "All Formations");
  fillDropdown("callSheetPickerBack", sets.back, "All Backs");
  fillDropdown("callSheetPickerTempo", sets.tempo, "All Tempos");
  fillDropdown("callSheetPickerPlayType", sets.type, "All Types");

  // Populate wristband select
  const wristbandSelect = document.getElementById("callSheetWristbandSelect");
  if (wristbandSelect) {
    const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
    wristbandSelect.innerHTML =
      '<option value="">Select Wristband...</option>' +
      saved
        .map(
          (wb, idx) =>
            `<option value="${idx}">${escapeHtml(wb.title || "Untitled")}</option>`,
        )
        .join("");
  }
}

/**
 * Update picker UI based on source selection
 */
function updatePickerSourceUI() {
  const source =
    document.querySelector('input[name="callSheetSource"]:checked')?.value ||
    "playbook";
  const infoSpan = document.getElementById("pickerWristbandInfo");

  if (infoSpan) {
    if (
      callSheetSettings.loadedWristbandName &&
      callSheetSettings.loadedWristbandPlays?.length > 0
    ) {
      infoSpan.textContent = `(${callSheetSettings.loadedWristbandName}: ${callSheetSettings.loadedWristbandPlays.length} plays)`;
      infoSpan.className =
        source === "wristband" ? "text-success" : "text-muted";
    } else {
      infoSpan.textContent =
        source === "wristband" ? "(No wristband loaded)" : "";
      infoSpan.className = "text-danger";
    }
  }
}

/**
 * Clear the picker search input and refresh results
 */
function clearCsPickerSearch() {
  const input = document.getElementById("callSheetPlaySearch");
  if (input) {
    input.value = "";
    input.focus();
  }
  const btn = document.getElementById("clearCsPickerSearch");
  if (btn) btn.style.display = "none";
  populateCallSheetPlayList();
}

/**
 * Clear all picker filters and search
 */
function clearCsPickerFilters() {
  const search = document.getElementById("callSheetPlaySearch");
  if (search) search.value = "";
  const btn = document.getElementById("clearCsPickerSearch");
  if (btn) btn.style.display = "none";
  [
    "callSheetPickerPersonnel",
    "callSheetPickerFormation",
    "callSheetPickerPlayType",
    "callSheetPickerBack",
    "callSheetPickerTempo",
    "callSheetPickerSort",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  populateCallSheetPlayList();
}

/**
 * Close play picker
 */
function closeCallSheetPicker(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("callSheetPickerOverlay").classList.add("hidden");
}

/**
 * Populate the play list in picker
 */
function populateCallSheetPlayList() {
  // Update source UI
  updatePickerSourceUI();

  const search = document
    .getElementById("callSheetPlaySearch")
    .value.toLowerCase()
    .trim();

  // Toggle clear button visibility
  const clearBtn = document.getElementById("clearCsPickerSearch");
  if (clearBtn) clearBtn.style.display = search ? "" : "none";

  const personnelFilter =
    document.getElementById("callSheetPickerPersonnel")?.value || "";
  const formationFilter =
    document.getElementById("callSheetPickerFormation")?.value || "";
  const playTypeFilter =
    document.getElementById("callSheetPickerPlayType")?.value || "";
  const backFilter =
    document.getElementById("callSheetPickerBack")?.value || "";
  const tempoFilter =
    document.getElementById("callSheetPickerTempo")?.value || "";
  const sortBy = document.getElementById("callSheetPickerSort")?.value || "";
  const source =
    document.querySelector('input[name="callSheetSource"]:checked')?.value ||
    "playbook";

  let sourceList = [];

  if (source === "wristband") {
    // Use loaded wristband plays from settings
    if (
      callSheetSettings.loadedWristbandPlays &&
      callSheetSettings.loadedWristbandPlays.length > 0
    ) {
      sourceList = callSheetSettings.loadedWristbandPlays.map((p, i) => ({
        ...p,
        _sourceIdx: i,
      }));
    } else {
      const container = document.getElementById("callSheetPlayList");
      container.innerHTML =
        '<div class="empty-state">No wristband loaded. Click "Load Wristband" button first.</div>';
      const countEl = document.getElementById("csPickerMatchCount");
      if (countEl) countEl.textContent = "";
      return;
    }
  } else {
    // Use playbook - also check if play exists in loaded wristband to show number
    sourceList = plays.map((p, i) => {
      const copy = { ...p, _sourceIdx: i };
      if (
        callSheetSettings.loadedWristbandPlays &&
        callSheetSettings.loadedWristbandPlays.length > 0
      ) {
        const match = callSheetSettings.loadedWristbandPlays.find(
          (wp) =>
            wp.formation === p.formation &&
            wp.play === p.play &&
            wp.personnel === p.personnel,
        );
        if (match) {
          copy.wristbandNumber = match.wristbandNumber;
        }
      }
      return copy;
    });
  }

  // Apply filters
  let filtered = sourceList;

  // --- Full-text search across ALL relevant fields ---
  if (search) {
    const searchTerms = search.split(/\s+/).filter(Boolean);
    filtered = filtered.filter((p) => {
      // Build a big searchable blob from all useful fields
      const blob = [
        p.type,
        p.personnel,
        p.formation,
        p.formTag1,
        p.formTag2,
        p.under,
        p.back,
        p.shift,
        p.motion,
        p.protection,
        p.lineCall,
        p.play,
        p.playTag1,
        p.playTag2,
        p.basePlay,
        p.oneWord,
        p.tempo,
        p.keyPlayer1,
        p.keyPlayer2,
        p.keyPlayer3,
        p.constraint1,
        p.constraint2,
        p.constraint3,
        p.deadVs,
        p.notes,
        p.preferredSituation,
        p.preferredFieldPosition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      // All search terms must match somewhere in the blob
      return searchTerms.every((term) => blob.includes(term));
    });
  }

  // Dropdown filters (exact match)
  if (personnelFilter) {
    filtered = filtered.filter((p) => p.personnel === personnelFilter);
  }
  if (formationFilter) {
    filtered = filtered.filter((p) => p.formation === formationFilter);
  }
  if (playTypeFilter) {
    filtered = filtered.filter((p) => (p.type || "") === playTypeFilter);
  }
  if (backFilter) {
    filtered = filtered.filter((p) => (p.back || "") === backFilter);
  }
  if (tempoFilter) {
    filtered = filtered.filter((p) => (p.tempo || "") === tempoFilter);
  }

  // --- Sort ---
  if (sortBy) {
    filtered.sort((a, b) => {
      const valA = String(a[sortBy] || "").toLowerCase();
      const valB = String(b[sortBy] || "").toLowerCase();
      return valA.localeCompare(valB, undefined, { numeric: true });
    });
  }

  // --- Match count ---
  const countEl = document.getElementById("csPickerMatchCount");
  if (countEl) {
    const total = sourceList.length;
    const shown = Math.min(filtered.length, 150);
    if (
      search ||
      personnelFilter ||
      formationFilter ||
      playTypeFilter ||
      backFilter ||
      tempoFilter
    ) {
      countEl.textContent = `${filtered.length} of ${total} plays${filtered.length > 150 ? " (showing first 150)" : ""}`;
    } else {
      countEl.textContent = `${total} plays${total > 150 ? " (showing first 150)" : ""}`;
    }
  }

  // --- Render play list ---
  const container = document.getElementById("callSheetPlayList");
  // Store filtered plays at module scope for safe delegation lookup
  _csPickerFiltered = filtered;

  container.innerHTML = filtered
    .slice(0, 150)
    .map((p, i) => {
      const code = getPersonnelCode(p.personnel);
      const bgColor = getPersonnelBgColor(p.personnel);
      const textColor = getPersonnelTextColor(p.personnel);
      const wristbandNum = p.wristbandNumber
        ? `<span class="wristband-badge">#${p.wristbandNumber}</span>`
        : "";

      // Build detail chips for extra context
      const chips = [];
      if (p.type)
        chips.push(
          `<span class="cs-picker-chip cs-picker-chip-type">${escapeHtml(p.type)}</span>`,
        );
      if (p.back)
        chips.push(`<span class="cs-picker-chip">${escapeHtml(p.back)}</span>`);
      if (p.tempo)
        chips.push(
          `<span class="cs-picker-chip">${escapeHtml(p.tempo)}</span>`,
        );
      const chipHtml =
        chips.length > 0
          ? `<span class="cs-picker-chips">${chips.join("")}</span>`
          : "";

      return `
      <div class="picker-play" data-action="csPickerAddPlay" data-idx="${i}">
        ${wristbandNum}
        <span class="personnel-code" style="background: ${bgColor}; color: ${textColor};">${code}</span>
        <span class="cs-picker-play-text">${escapeHtml(p.formation || "")} ${escapeHtml(p.protection || "")} <strong>${escapeHtml(p.play || "")}</strong></span>
        ${chipHtml}
      </div>
    `;
    })
    .join("");

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No plays match your search. Try different terms or clear filters.</div>';
  }
}

/**
 * Add a play to the call sheet from picker (supports wristband plays)
 */
function addCallSheetPlayFromPicker(playData) {
  if (!editingCategory || !editingHash) return;

  // Clean up the play object
  const play = { ...playData };
  delete play._sourceIdx;

  callSheet[editingCategory][editingHash].push(play);

  closeCallSheetPicker();
  renderCallSheet();
  saveCallSheet();
}

/**
 * Open load wristband modal
 */
function openLoadWristbandModal() {
  const select = document.getElementById("loadWristbandSelect");
  const modal = document.getElementById("loadWristbandModal");

  if (!select || !modal) {
    showToast("⚠️ Could not open wristband loader — try refreshing", {
      type: "warning",
    });
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);

  select.innerHTML =
    '<option value="">Select a wristband...</option>' +
    saved
      .map(
        (wb, idx) =>
          `<option value="${idx}">${escapeHtml(wb.title || "Untitled")}</option>`,
      )
      .join("");

  modal.classList.remove("hidden");
}

/**
 * Close load wristband modal
 */
function closeLoadWristbandModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("loadWristbandModal").classList.add("hidden");
}

/**
 * Load wristband plays into call sheet with numbers
 */
function loadWristbandToCallSheet() {
  const wristbandIdx = document.getElementById("loadWristbandSelect").value;
  if (wristbandIdx === "") {
    showToast("⚠️ Please select a wristband", { type: "warning" });
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wristbandData = saved[parseInt(wristbandIdx, 10)];

  if (!wristbandData || !wristbandData.cards) {
    showToast("⚠️ Could not load wristband data", { type: "warning" });
    return;
  }

  // Build a map of wristband plays with their numbers
  // Card structure: [{ name: "Card 1", data: [play, play, ...] }, ...]
  // Each cell in data IS the play object directly (not cell.play)
  const wristbandPlays = [];
  wristbandData.cards.forEach((card, cardIdx) => {
    const cellData = card.data || card; // Support both formats
    if (Array.isArray(cellData)) {
      cellData.forEach((play, cellIdx) => {
        if (play && (play.formation || play.play)) {
          const wristbandNum = cardIdx * 40 + cellIdx + 11;
          wristbandPlays.push({ ...play, wristbandNumber: wristbandNum });
        }
      });
    }
  });

  // Store in settings
  callSheetSettings.loadedWristbandName = wristbandData.title;
  callSheetSettings.loadedWristbandPlays = wristbandPlays;
  saveCallSheetSettings();

  // Update wristband numbers on existing call sheet plays
  refreshWristbandNumbers();

  // Update display
  updateLoadedWristbandDisplay();

  closeLoadWristbandModal();
  showToast(
    `📋 Loaded "${wristbandData.title}" (${wristbandPlays.length} plays)`,
  );
}

/**
 * Refresh wristband numbers on all existing call sheet plays
 */
function refreshWristbandNumbers() {
  CALLSHEET_CATEGORIES.forEach((cat) => {
    if (callSheet[cat.id]) {
      ["left", "right"].forEach((hash) => {
        if (callSheet[cat.id][hash]) {
          callSheet[cat.id][hash].forEach((play) => {
            play.wristbandNumber = getWristbandNumberForPlay(play);
          });
        }
      });
    }
  });
  renderCallSheet();
  // Save without pushing undo state — wristband number refresh is cosmetic
  _csUndoInProgress = true;
  saveCallSheet();
  _csUndoInProgress = false;
}

/**
 * Update the loaded wristband display in the UI
 */
function updateLoadedWristbandDisplay() {
  const display = document.getElementById("loadedWristbandDisplay");
  if (display) {
    if (callSheetSettings.loadedWristbandName) {
      display.innerHTML = `<span class="cs-loaded-wb-badge">
        📋 ${escapeHtml(callSheetSettings.loadedWristbandName)} (${callSheetSettings.loadedWristbandPlays.length} plays)
        <button class="cs-loaded-wb-clear" data-action="clearLoadedWristband" aria-label="Clear loaded wristband">×</button>
      </span>`;
    } else {
      display.innerHTML =
        '<span class="cs-no-wb-loaded">No wristband loaded</span>';
    }
  }
}

/**
 * Clear loaded wristband
 */
function clearLoadedWristband() {
  callSheetSettings.loadedWristbandName = "";
  callSheetSettings.loadedWristbandPlays = [];
  saveCallSheetSettings();
  updateLoadedWristbandDisplay();
  showToast("🗑️ Wristband unloaded");
}

/**
 * Remove a play from the call sheet
 */
function removeCallSheetPlay(categoryId, hash, index) {
  callSheet[categoryId][hash].splice(index, 1);
  renderCallSheet();
  saveCallSheet();
}

// Drag and drop for call sheet plays (supports reorder within hash)
let draggedCallSheetPlay = null;

function handleCallSheetDragStart(event, categoryId, hash, index) {
  draggedCallSheetPlay = { categoryId, hash, index };
  event.dataTransfer.setData("source", "callsheet");
  event.dataTransfer.effectAllowed = "move";
  event.target.closest(".callsheet-play")?.classList.add("dragging");
}

function handleCallSheetDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  // Find the play element being hovered over for insertion indicator
  const target = event.target.closest(".callsheet-play");
  // Remove old indicators
  document
    .querySelectorAll(".cs-drop-above")
    .forEach((el) => el.classList.remove("cs-drop-above"));
  if (target) {
    target.classList.add("cs-drop-above");
  }
}

function handleCallSheetDrop(event, targetCategory, targetHash) {
  event.preventDefault();
  document
    .querySelectorAll(".cs-drop-above")
    .forEach((el) => el.classList.remove("cs-drop-above"));

  const targetPlay = event.target.closest(".callsheet-play");
  let insertIdx = -1;
  if (targetPlay) {
    insertIdx = parseInt(targetPlay.dataset.index, 10);
  }

  if (!callSheet[targetCategory]) {
    callSheet[targetCategory] = { left: [], right: [] };
  }
  if (!Array.isArray(callSheet[targetCategory][targetHash])) {
    callSheet[targetCategory][targetHash] = [];
  }

  if (draggedCallSheetPlay) {
    const { categoryId, hash, index } = draggedCallSheetPlay;

    // If dropping in same hash and source is above target, adjust
    if (
      categoryId === targetCategory &&
      hash === targetHash &&
      index < insertIdx
    ) {
      insertIdx--;
    }

    // Remove from original
    const play = callSheet[categoryId]?.[hash]?.splice(index, 1)[0];
    if (!play) {
      draggedCallSheetPlay = null;
      return;
    }

    if (
      insertIdx >= 0 &&
      insertIdx < callSheet[targetCategory][targetHash].length
    ) {
      callSheet[targetCategory][targetHash].splice(insertIdx, 0, play);
    } else {
      callSheet[targetCategory][targetHash].push(play);
    }

    draggedCallSheetPlay = null;
    renderCallSheet();
    saveCallSheet();
    return;
  }

  const source = event.dataTransfer?.getData("source");
  let droppedPlay = null;

  if (source === "available") {
    const playIndex = parseInt(event.dataTransfer.getData("playIndex"), 10);
    if (!Number.isNaN(playIndex) && filteredPlays[playIndex]) {
      droppedPlay = filteredPlays[playIndex];
    }
  } else if (source === "script") {
    const scriptIndex = parseInt(event.dataTransfer.getData("scriptIndex"), 10);
    if (!Number.isNaN(scriptIndex) && script[scriptIndex] && !script[scriptIndex].isSeparator) {
      droppedPlay = script[scriptIndex];
    }
  }

  if (!droppedPlay) return;

  const playToInsert = { ...droppedPlay };
  delete playToInsert._sourceIdx;
  if (typeof getWristbandNumberForPlay === "function") {
    playToInsert.wristbandNumber = getWristbandNumberForPlay(playToInsert);
  }

  if (
    insertIdx >= 0 &&
    insertIdx < callSheet[targetCategory][targetHash].length
  ) {
    callSheet[targetCategory][targetHash].splice(insertIdx, 0, playToInsert);
  } else {
    callSheet[targetCategory][targetHash].push(playToInsert);
  }

  renderCallSheet();
  saveCallSheet();
}

/**
 * Save call sheet to localStorage
 */
let _csUndoInProgress = false;

function saveCallSheetState() {
  if (_csUndoInProgress) return;
  historyManager.saveState("callsheet", safeDeepClone(callSheet));
}

function saveCallSheet() {
  saveCallSheetState();
  storageManager.set(STORAGE_KEYS.CALL_SHEET, callSheet);
  scheduleCallSheetAutosave();
  // Persist constraints snapshot alongside call sheet
  if (typeof saveConstraintsSnapshot === "function") saveConstraintsSnapshot();
}

function undoCallSheet() {
  const prev = historyManager.undo("callsheet", safeDeepClone(callSheet));
  if (prev) {
    _csUndoInProgress = true;
    callSheet = prev;
    storageManager.set(STORAGE_KEYS.CALL_SHEET, callSheet);
    renderCallSheet();
    _csUndoInProgress = false;
  }
}

function redoCallSheet() {
  const next = historyManager.redo("callsheet", safeDeepClone(callSheet));
  if (next) {
    _csUndoInProgress = true;
    callSheet = next;
    storageManager.set(STORAGE_KEYS.CALL_SHEET, callSheet);
    renderCallSheet();
    _csUndoInProgress = false;
  }
}

/**
 * Clear call sheet
 */
async function clearCallSheet() {
  // Check if any categories have plays
  const hasPlays = CALLSHEET_CATEGORIES.some((cat) => {
    const d = callSheet[cat.id];
    return d && ((d.left && d.left.length) || (d.right && d.right.length));
  });
  if (!hasPlays) return;

  // Snapshot for undo
  const snapshot = safeDeepClone(callSheet);

  CALLSHEET_CATEGORIES.forEach((cat) => {
    callSheet[cat.id] = { left: [], right: [] };
  });
  renderCallSheet();
  saveCallSheet();

  showUndoToast("🗑️ Call sheet cleared", () => {
    Object.assign(callSheet, snapshot);
    renderCallSheet();
    saveCallSheet();
  });
}

/**
 * Print call sheet
 */
function printCallSheet() {
  try {
    showToast("🖨️ Preparing call sheet…", 2500);
    const container = document.getElementById("callSheetPrint");
    const content = document.getElementById("callSheetPrintContent");

    // Get current page categories (respect custom order)
    const page = callSheetSettings.currentPage;
    const categories = getCallSheetCategoriesForPage(page);
    const pageTitle =
      page === "front" ? "Call Sheet - Front" : "Call Sheet - Back";

    // Set orientation class
    const orientClass =
      callSheetSettings.orientation === "landscape"
        ? "print-landscape"
        : "print-portrait";

    // Hoist display options once — avoids re-reading checkboxes per play
    const printOptions = getCallSheetDisplayOptions();

    // Build print HTML
    let html = `<div class="${orientClass}">`;
    const teamName = getTeamName() + " " + new Date().getFullYear();
    html += `<h1 class="cs-print-title">${escapeHtml(teamName)} - ${pageTitle}</h1>`;
    html += '<div class="print-callsheet-grid">';

    // Arrange in 3-column layout for print
    const columns = buildCallSheetColumns(categories);

    columns.forEach((column) => {
      html += '<div class="print-column">';
      column.forEach((cat) => {
        const data = callSheet[cat.id] || { left: [], right: [] };
        html += renderPrintCategory(cat, data, printOptions);
      });
      html += "</div>";
    });

    html += "</div></div>";

    content.innerHTML = html;
    container.classList.remove("hidden");
    document.body.dataset.printMode = "callsheet";

    // Set page size based on orientation
    const pageOrientation =
      callSheetSettings.orientation === "landscape" ? "landscape" : "portrait";
    setupPrintPageStyle(
      `@media print { @page { size: letter ${pageOrientation}; margin: 0.25in; } }`,
    );

    setTimeout(() => {
      try {
        const pageLabel = page === "front" ? "Front" : "Back";
        const restoreTitle = setPrintTitle("Game Plan", pageLabel);
        window.print();
        restoreTitle();
      } finally {
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 100);
  } catch (err) {
    console.error("printCallSheet error:", err);
    document.getElementById("callSheetPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing call sheet.", {
      duration: 4000,
      type: "error",
    });
  }
}

/**
 * Render a category for print
 */
function renderPrintCategory(cat, data, options) {
  const leftPlays = data.left || [];
  const rightPlays = data.right || [];
  const displayName = getCategoryDisplayName(cat);
  // options passed through from printCallSheet to avoid per-play DOM reads
  if (!options) options = getCallSheetDisplayOptions();

  // Determine text color
  const textColor = getCategoryHeaderTextColor(cat.color);

  const note = csNotes[cat.id];

  let html = `
    <div class="print-category">
      <div class="print-category-header" style="background: ${cat.color}; color: ${textColor};">
        ${escapeHtml(displayName)}
      </div>`;

  if (note) {
    html += `<div class="print-cat-note">${escapeHtml(note)}</div>`;
  }

  html += `
      <div class="print-hash-headers">
        <div>Left Hash</div>
        <div>Right Hash</div>
      </div>
      <div class="print-plays-grid">
        <div class="print-hash-column">
  `;

  leftPlays.forEach((play) => {
    html += renderPrintPlay(play, options);
  });

  html += '</div><div class="print-hash-column">';

  rightPlays.forEach((play) => {
    html += renderPrintPlay(play, options);
  });

  html += "</div></div></div>";

  return html;
}

/**
 * Render a play for print - matches screen display formatting
 */
function renderPrintPlay(play, options) {
  if (!options) options = getCallSheetDisplayOptions();
  const code = getPersonnelCode(play.personnel);
  const bgColor = getPersonnelBgColor(play.personnel);
  const textColor = getPersonnelTextColor(play.personnel);
  const isHighlighted = play.highlighted || false;
  const borderColor = getPlayBorderColor(play, options);

  const tempo = (play.tempo || "").toLowerCase();
  let tempoClass = "";
  if (options.highlightHuddle && tempo === "huddle")
    tempoClass = "tempo-huddle";
  else if (options.highlightCandy && tempo === "candy")
    tempoClass = "tempo-candy";

  const playParts = buildCallSheetPlayParts(play, options);
  const playText = playParts.join(" ");

  let styles = [];
  const highlightClass = isHighlighted ? "highlighted" : "";
  if (!isHighlighted && play.cellBg) styles.push(`background: ${play.cellBg};`);
  if (borderColor) styles.push(`border: 2px solid ${borderColor};`);
  if (play.cellTextColor) styles.push(`color: ${play.cellTextColor};`);
  if (play.cellFontSize) styles.push(`font-size: ${play.cellFontSize};`);
  if (play.cellBold) styles.push("font-weight: bold;");
  if (play.cellItalic) styles.push("font-style: italic;");
  let textDeco = [];
  if (play.cellUnderline) textDeco.push("underline");
  if (play.cellStrikethrough) textDeco.push("line-through");
  if (textDeco.length) styles.push(`text-decoration: ${textDeco.join(" ")};`);

  const personnelHtml = options.showPersonnel
    ? `<span class="print-code" style="background: ${bgColor}; color: ${textColor};">${code}</span>`
    : "";

  const noteHtml = play.cellNote
    ? `<span class="print-cell-note">[${play.cellNote}]</span>`
    : "";

  return `
    <div class="print-play ${highlightClass} ${tempoClass}" style="${styles.join(" ")}">
      ${personnelHtml}
      ${playText.trim()}
      ${noteHtml}
    </div>
  `;
}

/* toggleCsPanel merged into shared toggleCollapsiblePanel() in script.js */

// ============ Unified Display Bar Helpers ============

/**
 * Select All / Deselect All field checkboxes
 */
function csSelectAllFields(selectAll) {
  const fieldIds = [
    "callsheetShowNumbers",
    "callsheetShowPersonnel",
    "callsheetShowFormation",
    "callsheetShowProtection",
    "callsheetShowPlayName",
    "callsheetShowTags",
    "callsheetShowMotion",
    "callsheetShowLineCall",
  ];
  fieldIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = selectAll;
  });
  requestRenderCallSheet();
}

// ============ Display Presets ============

const BUILTIN_PRESETS = {
  __all: {
    name: "Show All Fields",
    opts: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowProtection: true,
      callsheetShowPlayName: true,
      callsheetShowTags: true,
      callsheetShowMotion: true,
      callsheetShowLineCall: true,
      callsheetShowEmoji: false,
      callsheetUseSquares: false,
      callsheetUnderEmoji: false,
      callsheetBoldShifts: false,
      callsheetRedShifts: false,
      callsheetItalicMotions: false,
      callsheetRedMotions: false,
      callsheetRemoveVowels: false,
      callsheetHighlightHuddle: false,
      callsheetHighlightCandy: false,
      callsheetRedBorder: "",
      callsheetBlueBorder: "",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "",
      callsheetPurpleBorder: "",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
  __minimal: {
    name: "Minimal",
    opts: {
      callsheetShowNumbers: false,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: false,
      callsheetShowLineCall: false,
      callsheetShowEmoji: true,
      callsheetUseSquares: false,
      callsheetUnderEmoji: false,
      callsheetBoldShifts: false,
      callsheetRedShifts: false,
      callsheetItalicMotions: false,
      callsheetRedMotions: false,
      callsheetRemoveVowels: true,
      callsheetHighlightHuddle: false,
      callsheetHighlightCandy: false,
      callsheetRedBorder: "",
      callsheetBlueBorder: "",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "",
      callsheetPurpleBorder: "",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
  __gameday: {
    name: "Game Day",
    opts: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowProtection: true,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: true,
      callsheetShowLineCall: true,
      callsheetShowEmoji: true,
      callsheetUseSquares: true,
      callsheetUnderEmoji: true,
      callsheetBoldShifts: true,
      callsheetRedShifts: false,
      callsheetItalicMotions: true,
      callsheetRedMotions: false,
      callsheetRemoveVowels: false,
      callsheetHighlightHuddle: true,
      callsheetHighlightCandy: true,
      callsheetRedBorder: "run",
      callsheetBlueBorder: "pass",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "rpo",
      callsheetPurpleBorder: "screen",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
  __print_friendly: {
    name: "Print Friendly",
    opts: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowProtection: true,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: true,
      callsheetShowLineCall: true,
      callsheetShowEmoji: false,
      callsheetUseSquares: false,
      callsheetUnderEmoji: false,
      callsheetBoldShifts: true,
      callsheetRedShifts: false,
      callsheetItalicMotions: true,
      callsheetRedMotions: false,
      callsheetRemoveVowels: false,
      callsheetHighlightHuddle: false,
      callsheetHighlightCandy: false,
      callsheetRedBorder: "",
      callsheetBlueBorder: "",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "",
      callsheetPurpleBorder: "",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
};

/**
 * Load a display preset (built-in or user-saved)
 */
function loadDisplayPreset(presetKey) {
  if (!presetKey) return;

  // Handle manage presets action
  if (presetKey === "__manage") {
    const sel = document.getElementById("csDisplayPreset");
    if (sel) sel.value = "";
    manageDisplayPresets();
    return;
  }

  let opts;
  if (BUILTIN_PRESETS[presetKey]) {
    opts = BUILTIN_PRESETS[presetKey].opts;
  } else {
    // User-saved preset
    const userPresets = storageManager.get(
      STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
      [],
    );
    const preset = userPresets.find((p) => p.key === presetKey);
    if (!preset) {
      showToast("⚠️ Preset not found", { type: "warning" });
      return;
    }
    opts = preset.opts;
  }

  // Apply all options
  CALLSHEET_DISPLAY_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || opts[id] === undefined) return;
    if (el.type === "checkbox") {
      el.checked = opts[id];
    } else {
      el.value = opts[id];
    }
  });

  requestRenderCallSheet();

  // Reset the select
  const sel = document.getElementById("csDisplayPreset");
  if (sel) sel.value = "";

  const name = BUILTIN_PRESETS[presetKey]?.name || presetKey;
  showToast(`✅ Loaded "${name}" preset`);
}

/**
 * Save current display options as a named preset
 */
function saveDisplayPreset() {
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Preset name...";
  nameInput.className = "cs-template-name-input";

  const overlay = document.createElement("div");
  overlay.className = "cs-target-popup";
  overlay.innerHTML = `<label><strong>💾 Save Display Preset</strong></label>`;
  overlay.appendChild(nameInput);

  const actions = document.createElement("div");
  actions.className = "cs-target-actions";
  actions.innerHTML = `
    <button class="btn btn-sm btn-primary cs-preset-do-save">Save</button>
    <button class="btn btn-sm cs-preset-do-cancel">Cancel</button>
  `;
  overlay.appendChild(actions);
  document.body.appendChild(overlay);
  nameInput.focus();

  const close = () => overlay.remove();

  const doSave = () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast("⚠️ Enter a name", { type: "warning" });
      return;
    }

    const opts = {};
    CALLSHEET_DISPLAY_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      opts[id] = el.type === "checkbox" ? el.checked : el.value;
    });

    const presets = storageManager.get(
      STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
      [],
    );
    const key = `user_${Date.now()}`;
    presets.push({ key, name, opts, savedAt: new Date().toISOString() });
    storageManager.set(STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS, presets);

    refreshPresetDropdown();
    close();
    showToast(`💾 Saved preset "${name}"`);
  };

  actions.querySelector(".cs-preset-do-save").addEventListener("click", doSave);
  actions
    .querySelector(".cs-preset-do-cancel")
    .addEventListener("click", close);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave();
    if (e.key === "Escape") close();
  });
}

/**
 * Refresh the preset dropdown to include user-saved presets
 */
function refreshPresetDropdown() {
  const sel = document.getElementById("csDisplayPreset");
  if (!sel) return;

  // Keep built-in options, remove user ones
  const builtInValues = [
    "",
    "__all",
    "__minimal",
    "__gameday",
    "__print_friendly",
  ];
  [...sel.options].forEach((opt) => {
    if (!builtInValues.includes(opt.value)) opt.remove();
  });

  // Add user presets
  const userPresets = storageManager.get(
    STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
    [],
  );
  if (userPresets.length > 0) {
    const divider = document.createElement("option");
    divider.disabled = true;
    divider.textContent = "── Custom ──";
    sel.appendChild(divider);

    userPresets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = `⭐ ${p.name}`;
      sel.appendChild(opt);
    });

    // Add a "Manage..." option
    const manage = document.createElement("option");
    manage.value = "__manage";
    manage.textContent = "🗑️ Manage Presets...";
    sel.appendChild(manage);
  }

  sel.value = "";
}

/**
 * Open manage presets modal to delete user presets
 */
function manageDisplayPresets() {
  const presets = storageManager.get(
    STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
    [],
  );
  if (presets.length === 0) {
    showToast("No custom presets to manage");
    return;
  }

  const listHtml = presets
    .map((p, idx) => {
      const date = new Date(p.savedAt).toLocaleDateString();
      return `<div class="cs-template-item">
      <div class="cs-template-info"><strong>${escapeHtml(p.name)}</strong><span class="cs-template-date">${date}</span></div>
      <button class="btn btn-sm btn-danger" data-action="deleteDisplayPreset" data-idx="${idx}">✕</button>
    </div>`;
    })
    .join("");

  const overlay = document.createElement("div");
  overlay.id = "csManagePresetsOverlay";
  overlay.className = "cs-sort-overlay";
  overlay.innerHTML = `
    <div class="cs-sort-modal" style="max-width: 400px;">
      <div class="cs-sort-header">
        <h3>🗑️ Manage Display Presets</h3>
        <button class="cs-sort-close" data-action="closeCsManagePresets">&times;</button>
      </div>
      <div class="cs-sort-body"><div class="cs-template-list">${listHtml}</div></div>
      <div class="cs-sort-actions">
        <button class="btn btn-sm" data-action="closeCsManagePresets">Close</button>
      </div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function deleteDisplayPreset(idx) {
  const presets = storageManager.get(
    STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
    [],
  );
  const name = presets[idx]?.name || "preset";
  presets.splice(idx, 1);
  storageManager.set(STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS, presets);
  refreshPresetDropdown();
  // Refresh the manage modal
  const overlay = document.getElementById("csManagePresetsOverlay");
  if (overlay) {
    overlay.remove();
    manageDisplayPresets();
  }
  showToast(`🗑️ Deleted "${name}"`);
}

/**
 * Save call sheet display option states to localStorage
 */
function saveCallSheetDisplayOptions() {
  const opts = {};
  CALLSHEET_DISPLAY_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Checkboxes vs selects
    opts[id] = el.type === "checkbox" ? el.checked : el.value;
  });
  storageManager.set(STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS, opts);
}

/**
 * Restore call sheet display option states from localStorage
 */
function restoreCallSheetDisplayOptions() {
  const opts = storageManager.get(STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS, null);
  if (!opts) return;
  CALLSHEET_DISPLAY_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || opts[id] === undefined) return;
    if (el.type === "checkbox") {
      el.checked = opts[id];
    } else {
      el.value = opts[id];
    }
  });
}

/**
 * Schedule autosave for call sheet draft
 */
function scheduleCallSheetAutosave() {
  if (callSheetAutosaveTimer) clearTimeout(callSheetAutosaveTimer);
  callSheetAutosaveTimer = setTimeout(() => {
    const draft = {
      callSheet: safeDeepClone(callSheet),
      settings: safeDeepClone(callSheetSettings),
      savedAt: new Date().toISOString(),
    };
    storageManager.set(STORAGE_KEYS.CALLSHEET_DRAFT, draft);
  }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Check for unsaved call sheet draft on init
 */
async function checkCallSheetDraft() {
  try {
    const draft = storageManager.get(STORAGE_KEYS.CALLSHEET_DRAFT, null);
    if (!draft || !draft.savedAt) return;

    const savedAt = new Date(draft.savedAt);
    const age = Date.now() - savedAt.getTime();
    // Only offer if draft is less than 24h old
    if (age > DRAFT_EXPIRY_MS) {
      storageManager.remove(STORAGE_KEYS.CALLSHEET_DRAFT);
      return;
    }

    // Check if draft is different from current
    const currentStr = JSON.stringify(callSheet);
    const draftStr = JSON.stringify(draft.callSheet);
    if (currentStr === draftStr) {
      storageManager.remove(STORAGE_KEYS.CALLSHEET_DRAFT);
      return;
    }

    const timeStr = savedAt.toLocaleTimeString();
    const ok = await showConfirm(
      `A draft from ${timeStr} was found. Would you like to restore it?`,
      {
        title: "Restore Call Sheet Draft?",
        icon: "📋",
        confirmText: "Restore",
      },
    );
    if (ok) {
      callSheet = draft.callSheet;
      if (draft.settings) {
        callSheetSettings = { ...callSheetSettings, ...draft.settings };
      }
      CALLSHEET_CATEGORIES.forEach((cat) => {
        if (!callSheet[cat.id]) callSheet[cat.id] = { left: [], right: [] };
      });
      renderCallSheet();
      saveCallSheet();
      saveCallSheetSettings();
      storageManager.remove(STORAGE_KEYS.CALLSHEET_DRAFT);
      showToast("📋 Call sheet draft restored");
    } else {
      storageManager.remove(STORAGE_KEYS.CALLSHEET_DRAFT);
    }
  } catch (err) {
    console.error("checkCallSheetDraft error:", err);
    showToast("❌ Error restoring call sheet draft.", {
      duration: 3000,
      type: "error",
    });
  }
}

/**
 * Build play text parts (shared by screen render and print render)
 */
function buildCallSheetPlayParts(play, options) {
  const playParts = [];

  // Check if play has "Under"
  const hasUnder =
    (play.under && play.under.trim() !== "") ||
    (play.formTag1 && play.formTag1.toLowerCase() === "under") ||
    (play.formTag2 && play.formTag2.toLowerCase() === "under");

  // Add personnel emoji if enabled
  if (options.showEmoji && play.personnel) {
    playParts.push(getPersonnelEmoji(play.personnel, options.useSquares));
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

  // Handle shift with bold/red options
  if (play.shift) {
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

  if (options.showPlayName && play.play) {
    let playText = options.noVowels ? removeVowels(play.play) : play.play;
    playParts.push(escapeHtml(playText));
  }

  if (options.showTags) {
    if (play.playTag1) {
      let tag = options.noVowels ? removeVowels(play.playTag1) : play.playTag1;
      playParts.push(escapeHtml(tag));
    }
    if (play.playTag2) {
      let tag = options.noVowels ? removeVowels(play.playTag2) : play.playTag2;
      playParts.push(escapeHtml(tag));
    }
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

// ============ Duplicate Detection ============

/**
 * Build a unique key for a play (for duplicate detection)
 */
function csPlayKey(play) {
  return `${(play.formation || "").toLowerCase()}|${(play.play || "").toLowerCase()}|${(play.personnel || "").toLowerCase()}`;
}

/**
 * Build a map of play keys → count of categories they appear in
 */
function buildDuplicateMap() {
  const playCategories = {}; // key → Set of category IDs
  CALLSHEET_CATEGORIES.forEach((cat) => {
    const data = callSheet[cat.id];
    if (!data) return;
    [...(data.left || []), ...(data.right || [])].forEach((play) => {
      const key = csPlayKey(play);
      if (!playCategories[key]) playCategories[key] = new Set();
      playCategories[key].add(cat.id);
    });
  });
  const dupeMap = {};
  Object.entries(playCategories).forEach(([key, cats]) => {
    dupeMap[key] = cats.size;
  });
  return dupeMap;
}

// ============ Hash Swap ============

function swapPlayHash(categoryId, fromHash, index) {
  const toHash = fromHash === "left" ? "right" : "left";
  const play = callSheet[categoryId][fromHash].splice(index, 1)[0];
  callSheet[categoryId][toHash].push(play);
  renderCallSheet();
  saveCallSheet();
}

// ============ Collapse / Expand ============

function toggleCategoryCollapse(categoryId) {
  if (csCollapsed.has(categoryId)) {
    csCollapsed.delete(categoryId);
  } else {
    csCollapsed.add(categoryId);
  }
  storageManager.set(STORAGE_KEYS.CALLSHEET_COLLAPSED, [...csCollapsed]);
  renderCallSheet();
}

function expandAllCategories() {
  csCollapsed.clear();
  storageManager.set(STORAGE_KEYS.CALLSHEET_COLLAPSED, []);
  renderCallSheet();
}

function collapseAllCategories() {
  const page = callSheetSettings.currentPage;
  const cats = page === "front" ? CALLSHEET_FRONT : CALLSHEET_BACK;
  cats.forEach((c) => csCollapsed.add(c.id));
  storageManager.set(STORAGE_KEYS.CALLSHEET_COLLAPSED, [...csCollapsed]);
  renderCallSheet();
}

// ============ Category Notes ============

function editCategoryNote(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;

  const current = csNotes[categoryId] || "";
  const catEl = document.querySelector(
    `.callsheet-category[data-category="${categoryId}"]`,
  );
  if (!catEl) return;

  // Find or create note area
  let noteEl = catEl.querySelector(".cs-cat-note");
  if (!noteEl) {
    noteEl = document.createElement("div");
    noteEl.className = "cs-cat-note";
    const header = catEl.querySelector(".category-header");
    header.after(noteEl);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.value = current;
  input.className = "cs-note-input";
  input.placeholder = "Add a note...";

  noteEl.innerHTML = "";
  noteEl.appendChild(input);
  input.focus();
  input.select();

  const finish = () => {
    const val = input.value.trim();
    if (val) {
      csNotes[categoryId] = val;
    } else {
      delete csNotes[categoryId];
    }
    storageManager.set(STORAGE_KEYS.CALLSHEET_NOTES, csNotes);
    renderCallSheet();
  };

  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
    if (e.key === "Escape") {
      renderCallSheet();
    }
  });
}

// ============ Play Count Targets ============

function setCategoryTarget(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;
  const current = csTargets[categoryId] || "";

  const catEl = document.querySelector(
    `.callsheet-category[data-category="${categoryId}"] .cs-play-count`,
  );

  // Create a small inline input in a floating way
  const overlay = document.createElement("div");
  overlay.className = "cs-target-popup";
  overlay.innerHTML = `
    <label>Target play count for <strong>${escapeHtml(getCategoryDisplayName(cat))}</strong>:</label>
    <input type="number" min="0" max="50" value="${current}" class="cs-target-input" placeholder="e.g. 6">
    <div class="cs-target-actions">
      <button class="btn btn-sm btn-primary cs-target-save">Save</button>
      <button class="btn btn-sm cs-target-clear">Clear</button>
      <button class="btn btn-sm cs-target-cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  const input = overlay.querySelector("input");
  input.focus();
  input.select();

  const close = () => overlay.remove();

  overlay.querySelector(".cs-target-save").addEventListener("click", () => {
    const val = parseInt(input.value, 10);
    if (val > 0) {
      csTargets[categoryId] = val;
    } else {
      delete csTargets[categoryId];
    }
    storageManager.set(STORAGE_KEYS.CALLSHEET_TARGETS, csTargets);
    close();
    renderCallSheet();
  });

  overlay.querySelector(".cs-target-clear").addEventListener("click", () => {
    delete csTargets[categoryId];
    storageManager.set(STORAGE_KEYS.CALLSHEET_TARGETS, csTargets);
    close();
    renderCallSheet();
  });

  overlay.querySelector(".cs-target-cancel").addEventListener("click", close);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") overlay.querySelector(".cs-target-save").click();
    if (e.key === "Escape") close();
  });
}

// ============ Category Options Menu ============

function openCategoryMenu(event, categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;

  const menu = document.createElement("div");
  menu.className = "cs-context-menu";

  const hasNote = csNotes[categoryId];
  const hasTarget = csTargets[categoryId];

  menu.innerHTML = `
    <button class="cs-ctx-item" data-action="editCategoryNote" data-arg="${categoryId}" data-ctx-close="true">
      ${hasNote ? "✏️ Edit Note" : "📝 Add Note"}
    </button>
    <button class="cs-ctx-item" data-action="setCategoryTarget" data-arg="${categoryId}" data-ctx-close="true">
      ${hasTarget ? "🎯 Edit Target (" + hasTarget + ")" : "🎯 Set Target Count"}
    </button>
    <button class="cs-ctx-item" data-action="editCategoryName" data-arg="${categoryId}" data-ctx-close="true">
      ✏️ Rename
    </button>
    <div class="cs-ctx-divider"></div>
    <button class="cs-ctx-item" data-action="clearCategory" data-arg="${categoryId}" data-ctx-close="true">
      🗑️ Clear Category
    </button>
  `;

  showContextMenu(event, menu);
}

function clearCategory(categoryId) {
  callSheet[categoryId] = { left: [], right: [] };
  renderCallSheet();
  saveCallSheet();
  showToast("🗑️ Category cleared");
}

// ============ Quick Stats Panel ============

function toggleStatsPanel() {
  const panel = document.getElementById("csStatsPanel");
  if (!panel) return;
  const isHidden = panel.classList.contains("hidden");
  panel.classList.toggle("hidden");
  if (isHidden) updateStatsPanel();
}

function updateStatsPanel() {
  const panel = document.getElementById("csStatsPanel");
  if (!panel || panel.classList.contains("hidden")) return;

  // Collect all plays across all categories
  const allPlays = [];
  const seenKeys = new Set();
  CALLSHEET_CATEGORIES.forEach((cat) => {
    const data = callSheet[cat.id];
    if (!data) return;
    [...(data.left || []), ...(data.right || [])].forEach((play) => {
      allPlays.push(play);
      seenKeys.add(csPlayKey(play));
    });
  });

  const total = allPlays.length;
  const uniqueCount = seenKeys.size;

  // Type breakdown
  const types = {};
  allPlays.forEach((p) => {
    const t = p.type || "Unknown";
    types[t] = (types[t] || 0) + 1;
  });

  // Personnel breakdown
  const personnel = {};
  allPlays.forEach((p) => {
    const per = p.personnel || "Unknown";
    personnel[per] = (personnel[per] || 0) + 1;
  });

  // Tempo breakdown
  const tempos = {};
  allPlays.forEach((p) => {
    const t = p.tempo || "None";
    tempos[t] = (tempos[t] || 0) + 1;
  });

  // Run/Pass ratio
  let runs = 0,
    passes = 0,
    other = 0;
  allPlays.forEach((p) => {
    const t = (p.type || "").toLowerCase();
    if (t.includes("run") || t === "rpo") runs++;
    else if (
      t.includes("pass") ||
      t.includes("screen") ||
      t === "play action" ||
      t === "pa" ||
      t.includes("quick") ||
      t.includes("movement") ||
      t.includes("drop")
    )
      passes++;
    else other++;
  });

  const buildBar = (items, colorFn) => {
    const sorted = Object.entries(items).sort((a, b) => b[1] - a[1]);
    return sorted
      .map(([name, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `<div class="cs-stat-row"><span class="cs-stat-label">${escapeHtml(name)}</span><div class="cs-stat-bar-bg"><div class="cs-stat-bar" style="width: ${pct}%; background: ${colorFn(name)};"></div></div><span class="cs-stat-val">${count} (${pct}%)</span></div>`;
      })
      .join("");
  };

  const typeColor = (t) => {
    const c = {
      Run: CS_COLORS.green,
      Pass: CS_COLORS.blue,
      RPO: CS_COLORS.orange,
      Screen: CS_COLORS.teal,
      "Play Action": CS_COLORS.purple,
      Quick: CS_COLORS.yellow,
    };
    return c[t] || CS_COLORS.gray;
  };
  const persColor = (p) => getPersonnelBgColor(p);

  const runPct = total > 0 ? Math.round((runs / total) * 100) : 0;
  const passPct = total > 0 ? Math.round((passes / total) * 100) : 0;

  panel.innerHTML = `
    <div class="cs-stats-grid">
      <div class="cs-stat-card">
        <div class="cs-stat-number">${total}</div>
        <div class="cs-stat-title">Total Plays</div>
        <div class="cs-stat-sub">${uniqueCount} unique</div>
      </div>
      <div class="cs-stat-card">
        <div class="cs-stat-number cs-stat-split">
          <span style="color: ${CS_COLORS.green}">${runs}</span> / <span style="color: ${CS_COLORS.blue}">${passes}</span>${other > 0 ? ` / <span style="color: ${CS_COLORS.gray}">${other}</span>` : ""}
        </div>
        <div class="cs-stat-title">Run / Pass${other > 0 ? " / Other" : ""}</div>
        <div class="cs-stat-sub">${runPct}% / ${passPct}%</div>
      </div>
    </div>
    <div class="cs-stats-sections">
      <details open><summary>Play Type Breakdown</summary><div class="cs-stat-bars">${buildBar(types, typeColor)}</div></details>
      <details><summary>Personnel Breakdown</summary><div class="cs-stat-bars">${buildBar(personnel, persColor)}</div></details>
      <details><summary>Tempo Breakdown</summary><div class="cs-stat-bars">${buildBar(tempos, () => CS_COLORS.teal)}</div></details>
    </div>
  `;
}

// ============ Not On Sheet View ============

function toggleNotOnSheet() {
  const panel = document.getElementById("csNotOnSheetPanel");
  if (!panel) return;
  const isHidden = panel.classList.contains("hidden");
  panel.classList.toggle("hidden");
  if (isHidden) updateNotOnSheetPanel();
}

function updateNotOnSheetPanel() {
  const panel = document.getElementById("csNotOnSheetPanel");
  if (!panel) return;

  // Collect all play keys on the call sheet
  const onSheet = new Set();
  CALLSHEET_CATEGORIES.forEach((cat) => {
    const data = callSheet[cat.id];
    if (!data) return;
    [...(data.left || []), ...(data.right || [])].forEach((play) => {
      onSheet.add(csPlayKey(play));
    });
  });

  // Find plays NOT on the sheet
  const missing = plays.filter((p) => !onSheet.has(csPlayKey(p)));

  if (missing.length === 0) {
    panel.innerHTML =
      '<div class="empty-state">✅ All playbook plays are on the call sheet!</div>';
    return;
  }

  // Group by type
  const groups = {};
  missing.forEach((p) => {
    const t = p.type || "Unknown";
    if (!groups[t]) groups[t] = [];
    groups[t].push(p);
  });

  let html = `<div class="cs-nos-count">⚠️ ${missing.length} of ${plays.length} plays are NOT on the call sheet:</div>`;

  Object.entries(groups)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([type, plays]) => {
      html += `<details><summary>${type} (${plays.length})</summary><div class="cs-nos-list">`;
      plays.forEach((p) => {
        const code = getPersonnelCode(p.personnel);
        const bg = getPersonnelBgColor(p.personnel);
        const tc = getPersonnelTextColor(p.personnel);
        html += `<div class="cs-nos-play">
        <span class="personnel-code" style="background: ${bg}; color: ${tc};">${code}</span>
        ${escapeHtml(p.formation || "")} ${escapeHtml(p.play || "")}
      </div>`;
      });
      html += `</div></details>`;
    });

  panel.innerHTML = html;
}

// ============ Game Plan Templates ============

function getCallSheetPlayCount() {
  let playCount = 0;
  CALLSHEET_CATEGORIES.forEach((cat) => {
    const data = callSheet[cat.id];
    if (!data) return;
    playCount += (data.left || []).length + (data.right || []).length;
  });
  return playCount;
}

function buildCallSheetTemplate(name) {
  return {
    name,
    savedAt: new Date().toISOString(),
    playCount: getCallSheetPlayCount(),
    callSheet: safeDeepClone(callSheet),
    settings: safeDeepClone(callSheetSettings),
    notes: safeDeepClone(csNotes),
    targets: safeDeepClone(csTargets),
    categoryOrder: safeDeepClone(csCategoryOrder),
  };
}

async function saveCallSheetTemplate() {
  try {
    const totalPlays = getCallSheetPlayCount();
    if (totalPlays === 0) {
      const proceed = await showConfirm("The call sheet is empty. Save anyway?", {
        title: "Empty Call Sheet",
        icon: "⚠️",
        confirmText: "Save Empty",
      });
      if (!proceed) return;
    }

    const nameInput = document.getElementById("csTemplateName");
    const defaultName = `Call Sheet ${new Date().toLocaleDateString()}`;
    let name = nameInput?.value.trim();

    if (!name) {
      name = await showPrompt("Name for this call sheet:", defaultName, {
        title: "Save Call Sheet",
        icon: "💾",
        placeholder: defaultName,
      });
      if (!name) return;
      name = name.trim();
    }

    if (!name) {
      showToast("⚠️ Enter a template name", { type: "warning" });
      return;
    }

    const templates = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
    const existing = templates.find(
      (template) => template.name.toLowerCase() === name.toLowerCase(),
    );

    if (existing) {
      const choice = await showChoice(
        `A call sheet named "${existing.name}" already exists.`,
        {
          title: "Duplicate Name",
          icon: "⚠️",
          option1: "💾 Overwrite",
          option2: "➕ Save as Copy",
        },
      );

      if (choice === "option1") {
        Object.assign(existing, buildCallSheetTemplate(name));
        storageManager.set(STORAGE_KEYS.CALLSHEET_TEMPLATES, templates);
        if (document.getElementById("csTemplateOverlay")) {
          closeTemplateModal();
          openTemplatesModal();
        }
        showToast(`✅ "${name}" updated!`);
        return;
      }

      if (choice !== "option2") {
        return;
      }
    }

    templates.unshift(buildCallSheetTemplate(name));
    storageManager.set(STORAGE_KEYS.CALLSHEET_TEMPLATES, templates);

    if (document.getElementById("csTemplateOverlay")) {
      closeTemplateModal();
      openTemplatesModal();
    }

    showToast(`✅ "${name}" saved!`);
  } catch (err) {
    console.error("saveCallSheetTemplate error:", err);
    showToast("❌ Error saving call sheet.", {
      duration: 4000,
      type: "error",
    });
  }
}

function openTemplatesModal() {
  const saved = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);

  const listHtml =
    saved.length === 0
      ? '<div class="empty-state">No templates saved yet.</div>'
      : saved
        .map((t, idx) => {
          const date = new Date(t.savedAt).toLocaleDateString();
          return `<div class="cs-template-item">
          <div class="cs-template-info">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="cs-template-date">${date} · ${t.playCount || 0} plays</span>
          </div>
          <div class="cs-template-actions">
            <button class="btn btn-sm btn-primary" data-action="loadTemplate" data-idx="${idx}">Load</button>
            <button class="btn btn-sm btn-danger" data-action="deleteTemplate" data-idx="${idx}">✕</button>
          </div>
        </div>`;
        })
        .join("");

  const modalHtml = `
    <div id="csTemplateOverlay" class="cs-sort-overlay">
      <div class="cs-sort-modal" style="max-width: 500px;">
        <div class="cs-sort-header">
          <h3>📁 Game Plan Templates</h3>
          <button class="cs-sort-close" data-action="closeTemplateModal">&times;</button>
        </div>
        <div class="cs-sort-body">
          <div class="cs-template-save-row">
            <input type="text" id="csTemplateName" class="cs-template-name-input" placeholder="Template name (e.g. vs. 4-3 Team)">
            <button class="btn btn-sm btn-primary" data-action="saveCallSheetTemplate">💾 Save Current</button>
          </div>
          <div class="cs-template-list">${listHtml}</div>
        </div>
        <div class="cs-sort-actions">
          <button class="btn btn-sm" data-action="closeTemplateModal">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  // backdrop close
  document
    .getElementById("csTemplateOverlay")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "csTemplateOverlay") closeTemplateModal();
    });
}

function closeTemplateModal() {
  const overlay = document.getElementById("csTemplateOverlay");
  if (overlay) overlay.remove();
}

function saveTemplate() {
  saveCallSheetTemplate();
}

async function loadTemplate(idx) {
  try {
    const templates = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
    const template = templates[idx];
    if (!template) return;

    const ok = await showConfirm(
      `Load "${template.name}"? This will replace your current call sheet.`,
      { title: "Load Template", icon: "📁", confirmText: "Load" },
    );
    if (!ok) return;

    callSheet = template.callSheet || {};
    CALLSHEET_CATEGORIES.forEach((cat) => {
      if (!callSheet[cat.id]) callSheet[cat.id] = { left: [], right: [] };
    });
    if (template.settings)
      callSheetSettings = { ...callSheetSettings, ...template.settings };
    if (template.notes) csNotes = template.notes;
    if (template.targets) csTargets = template.targets;
    if (template.categoryOrder) csCategoryOrder = template.categoryOrder;

    saveCallSheet();
    saveCallSheetSettings();
    storageManager.set(STORAGE_KEYS.CALLSHEET_NOTES, csNotes);
    storageManager.set(STORAGE_KEYS.CALLSHEET_TARGETS, csTargets);
    storageManager.set(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, csCategoryOrder);

    renderCallSheet();
    closeTemplateModal();
    showToast(`📁 Loaded "${template.name}"`);
  } catch (err) {
    console.error("loadTemplate error:", err);
    showToast("❌ Error loading template.", { duration: 4000, type: "error" });
  }
}

async function deleteTemplate(idx) {
  const templates = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
  const name = templates[idx]?.name || "template";
  const ok = await showConfirm(`Delete "${name}"?`, {
    title: "Delete Template",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;

  templates.splice(idx, 1);
  storageManager.set(STORAGE_KEYS.CALLSHEET_TEMPLATES, templates);
  closeTemplateModal();
  openTemplatesModal();
  showToast(`🗑️ Deleted "${name}"`);
}

// ============ Category Drag Reorder ============

let draggedCatId = null;

function handleCatDragStart(event, categoryId) {
  // Only allow dragging from the header area
  if (
    !event.target.closest(".category-header") &&
    event.target.closest(".callsheet-play")
  ) {
    // This is a play drag, not a category drag — let the play handler manage it
    event.stopPropagation();
    return;
  }
  draggedCatId = categoryId;
  event.dataTransfer.effectAllowed = "move";
  setTimeout(() => {
    event.target.classList.add("cs-cat-dragging");
  }, 0);
}

function handleCatDragOver(event) {
  if (!draggedCatId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleCatDrop(event, targetCategoryId) {
  if (!draggedCatId || draggedCatId === targetCategoryId) return;
  event.preventDefault();

  const page = callSheetSettings.currentPage;
  const defaultOrder = (
    page === "front" ? CALLSHEET_FRONT : CALLSHEET_BACK
  ).map((c) => c.id);
  let order = csCategoryOrder[page] || [...defaultOrder];

  // Ensure all IDs are in the order
  defaultOrder.forEach((id) => {
    if (!order.includes(id)) order.push(id);
  });

  const fromIdx = order.indexOf(draggedCatId);
  const toIdx = order.indexOf(targetCategoryId);
  if (fromIdx === -1 || toIdx === -1) return;

  order.splice(fromIdx, 1);
  order.splice(toIdx, 0, draggedCatId);

  csCategoryOrder[page] = order;
  storageManager.set(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, csCategoryOrder);

  draggedCatId = null;
  renderCallSheet();
}

function handleCatDragEnd(event) {
  event.target.classList.remove("cs-cat-dragging");
  draggedCatId = null;
}

// ============ Smart Reorder ============

/**
 * Smart reorder: arrange categories so the tallest ones are spread across columns
 * to produce the most balanced, print-friendly layout.
 */
function smartReorderCategories() {
  const page = callSheetSettings.currentPage;
  const baseCats = page === "front" ? CALLSHEET_FRONT : CALLSHEET_BACK;

  // Calculate "height" of each category (header + plays)
  const catHeights = baseCats.map((cat) => {
    const data = callSheet[cat.id] || { left: [], right: [] };
    const playCount = Math.max(
      (data.left || []).length,
      (data.right || []).length,
    );
    // Approximate: header=2, note=1, subheader=1, each play row=1, dropzone=1
    const noteH = csNotes[cat.id] ? 1 : 0;
    return { id: cat.id, height: 2 + noteH + 1 + Math.max(playCount, 1) + 1 };
  });

  // Sort by height descending (tallest first)
  catHeights.sort((a, b) => b.height - a.height);

  // Greedy assignment to 3 columns (like bin-packing)
  const columns = [[], [], []];
  const colHeights = [0, 0, 0];

  catHeights.forEach((cat) => {
    // Find the shortest column
    let minIdx = 0;
    if (colHeights[1] < colHeights[minIdx]) minIdx = 1;
    if (colHeights[2] < colHeights[minIdx]) minIdx = 2;

    columns[minIdx].push(cat.id);
    colHeights[minIdx] += cat.height;
  });

  // Rebuild a flat order: col0[0], col1[0], col2[0], col0[1], col1[1], col2[1], ...
  const maxLen = Math.max(
    columns[0].length,
    columns[1].length,
    columns[2].length,
  );
  const newOrder = [];
  for (let row = 0; row < maxLen; row++) {
    if (columns[0][row]) newOrder.push(columns[0][row]);
    if (columns[1][row]) newOrder.push(columns[1][row]);
    if (columns[2][row]) newOrder.push(columns[2][row]);
  }

  csCategoryOrder[page] = newOrder;
  storageManager.set(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, csCategoryOrder);
  renderCallSheet();
  showToast("🧩 Categories reordered for best layout");
}

function resetCategoryOrder() {
  const page = callSheetSettings.currentPage;
  csCategoryOrder[page] = null;
  storageManager.set(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, csCategoryOrder);
  renderCallSheet();
  showToast("↩️ Category order reset to default");
}

// ============ Call Sheet Sort Modal ============

const CS_SORT_FIELDS = [
  { value: "personnel", label: "Personnel" },
  { value: "type", label: "Play Type" },
  { value: "tempo", label: "Tempo" },
  { value: "formation", label: "Formation" },
  { value: "basePlay", label: "Base Play" },
  { value: "play", label: "Play Name" },
  { value: "back", label: "Back" },
  { value: "protection", label: "Protection" },
];

let csSortCriteria = [{ field: "personnel", direction: "asc" }];
let csSortCustomOrders = {};
let csSortDraggedIdx = null;

/**
 * Get unique values for a sort field from the call sheet plays
 */
function getCsSortUniqueValues(field, categoryId) {
  const values = new Set();
  const categoriesToScan = categoryId ? [categoryId] : Object.keys(callSheet);

  categoriesToScan.forEach((catId) => {
    const data = callSheet[catId];
    if (!data) return;
    [...(data.left || []), ...(data.right || [])].forEach((play) => {
      if (play && play[field]) {
        values.add(String(play[field]).trim());
      }
    });
  });
  return Array.from(values).sort();
}

/**
 * Compare two values using custom order if available
 */
function csSortCompare(valA, valB, field, direction) {
  const customOrder = csSortCustomOrders[field];

  if (customOrder && customOrder.length > 0) {
    let idxA = customOrder.indexOf(valA);
    let idxB = customOrder.indexOf(valB);
    if (idxA === -1) idxA = customOrder.length + 1;
    if (idxB === -1) idxB = customOrder.length + 1;
    let cmp = idxA - idxB;
    if (direction === "desc") cmp = -cmp;
    return cmp;
  } else {
    const a = String(valA || "").toLowerCase();
    const b = String(valB || "").toLowerCase();
    let cmp = a.localeCompare(b, undefined, { numeric: true });
    if (direction === "desc") cmp = -cmp;
    return cmp;
  }
}

/**
 * Open the call sheet sort modal
 */
function openCsSortModal(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  const displayName = cat ? getCategoryDisplayName(cat) : categoryId;

  // Reset criteria to default if empty
  if (csSortCriteria.length === 0) {
    csSortCriteria = [{ field: "personnel", direction: "asc" }];
  }

  const modalHtml = `
    <div id="csSortOverlay" class="cs-sort-overlay">
      <div class="cs-sort-modal">
        <div class="cs-sort-header">
          <h3>⇅ Sort Plays</h3>
          <button class="cs-sort-close" data-action="closeCsSortModal">&times;</button>
        </div>

        <div class="cs-sort-body">
          <p class="cs-sort-desc">Drag to reorder priority. Top criteria sorts first.</p>

          <div id="csSortCriteriaList" class="cs-sort-criteria-list"></div>

          <button class="btn btn-sm cs-sort-add-btn" data-action="addCsSortCriteria">
            + Add Sort Field
          </button>

          <div class="cs-sort-scope">
            <label class="cs-sort-scope-label"><strong>Apply to:</strong></label>
            <div class="cs-sort-scope-options">
              <label class="cs-sort-radio">
                <input type="radio" name="csSortScope" value="category" checked>
                This category only <span class="cs-sort-scope-name">(${displayName})</span>
              </label>
              <label class="cs-sort-radio">
                <input type="radio" name="csSortScope" value="page">
                All categories on current page
              </label>
              <label class="cs-sort-radio">
                <input type="radio" name="csSortScope" value="all">
                All categories (front + back)
              </label>
            </div>
          </div>

          <div class="cs-sort-hash-option">
            <label>
              <input type="checkbox" id="csSortIndependently" checked>
              Sort left &amp; right hashes independently
            </label>
            <p class="cs-sort-hash-hint">Uncheck to merge both hashes, sort together, then redistribute evenly.</p>
          </div>
        </div>

        <div class="cs-sort-actions">
          <button class="btn btn-primary btn-sm" data-action="applyCsSort" data-arg="${categoryId}">
            ✅ Apply Sort
          </button>
          <button class="btn btn-sm" data-action="closeCsSortModal">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  // backdrop close
  document.getElementById("csSortOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "csSortOverlay") closeCsSortModal();
  });
  trapFocus(document.getElementById("csSortOverlay"));
  renderCsSortCriteria();
}

/**
 * Close the sort modal
 */
function closeCsSortModal() {
  const overlay = document.getElementById("csSortOverlay");
  if (overlay) overlay.remove();
}

/**
 * Render sort criteria items in the modal
 */
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
        <div class="cs-sort-criteria-item" draggable="true" data-idx="${idx}"
             data-drag="csSortDrag">
          <span class="drag-handle">☰</span>
          <select data-onchange="updateCsSortField" data-key="${idx}" data-pass="value">${fieldOptions}</select>
          <button class="sort-dir-btn" data-action="toggleCsSortDirection" data-idx="${idx}" title="${dirTitle}">${dirIcon}</button>
          <button class="custom-order-btn" data-action="openCsCustomOrderModal" data-arg="${criteria.field}" title="${customTitle}" style="font-size: 11px; padding: 2px 6px;">${customIcon}</button>
          <button class="remove-sort-btn" data-action="removeCsSortCriteria" data-idx="${idx}">✕</button>
        </div>
      `;
    })
    .join("");
}

/**
 * Add a sort criteria
 */
function addCsSortCriteria() {
  const usedFields = csSortCriteria.map((c) => c.field);
  const available = CS_SORT_FIELDS.find((f) => !usedFields.includes(f.value));
  if (available) {
    csSortCriteria.push({ field: available.value, direction: "asc" });
    renderCsSortCriteria();
  } else {
    showToast("All sort fields are already in use");
  }
}

/**
 * Remove a sort criteria
 */
function removeCsSortCriteria(idx) {
  if (csSortCriteria.length <= 1) {
    showToast("Must have at least one sort field");
    return;
  }
  csSortCriteria.splice(idx, 1);
  renderCsSortCriteria();
}

/**
 * Update sort field at index
 */
function updateCsSortField(idx, newField) {
  csSortCriteria[idx].field = newField;
  renderCsSortCriteria();
}

/**
 * Toggle direction
 */
function toggleCsSortDirection(idx) {
  csSortCriteria[idx].direction =
    csSortCriteria[idx].direction === "asc" ? "desc" : "asc";
  renderCsSortCriteria();
}

// Drag handlers for sort criteria reordering
function handleCsSortDragStart(event, idx) {
  csSortDraggedIdx = idx;
  event.target.classList.add("dragging");
}
function handleCsSortDragOver(event) {
  event.preventDefault();
}
function handleCsSortDrop(event, targetIdx) {
  event.preventDefault();
  if (csSortDraggedIdx === null || csSortDraggedIdx === targetIdx) return;
  const moved = csSortCriteria.splice(csSortDraggedIdx, 1)[0];
  csSortCriteria.splice(targetIdx, 0, moved);
  renderCsSortCriteria();
}
function handleCsSortDragEnd(event) {
  event.target.classList.remove("dragging");
  csSortDraggedIdx = null;
}

// ============ Custom Order Modal (Call Sheet) ============

function openCsCustomOrderModal(field) {
  const fieldLabel =
    CS_SORT_FIELDS.find((f) => f.value === field)?.label || field;
  const uniqueValues = getCsSortUniqueValues(field);

  if (uniqueValues.length === 0) {
    showToast(`No values found for "${fieldLabel}" — add plays first`);
    return;
  }

  let orderedValues = csSortCustomOrders[field] || [];
  uniqueValues.forEach((val) => {
    if (!orderedValues.includes(val)) orderedValues.push(val);
  });
  orderedValues = orderedValues.filter((val) => uniqueValues.includes(val));

  showReorderModal(orderedValues, {
    title: `Custom Order: ${fieldLabel}`,
    onSave(order) {
      csSortCustomOrders[field] = [...order];
      showToast(
        `Custom order saved for ${CS_SORT_FIELDS.find((f) => f.value === field)?.label || field}`,
      );
      renderCsSortCriteria();
    },
    onClear() {
      delete csSortCustomOrders[field];
      showToast("Custom order cleared");
      renderCsSortCriteria();
    },
  });
}

// ============ Apply Sort ============

/**
 * Apply sort to the selected scope
 */
function applyCsSort(originCategoryId) {
  if (csSortCriteria.length === 0) return;

  // Get scope
  const scopeRadio = document.querySelector(
    'input[name="csSortScope"]:checked',
  );
  const scope = scopeRadio ? scopeRadio.value : "category";
  const sortIndependently =
    document.getElementById("csSortIndependently")?.checked ?? true;

  // Determine which category IDs to sort
  let targetCategoryIds = [];
  if (scope === "category") {
    targetCategoryIds = [originCategoryId];
  } else if (scope === "page") {
    const pageCategories =
      callSheetSettings.currentPage === "front"
        ? CALLSHEET_FRONT
        : CALLSHEET_BACK;
    targetCategoryIds = pageCategories.map((c) => c.id);
  } else {
    targetCategoryIds = CALLSHEET_CATEGORIES.map((c) => c.id);
  }

  let totalSorted = 0;

  targetCategoryIds.forEach((catId) => {
    const data = callSheet[catId];
    if (!data) return;

    const leftPlays = data.left || [];
    const rightPlays = data.right || [];

    if (leftPlays.length + rightPlays.length === 0) return;

    if (sortIndependently) {
      // Sort each hash column independently
      if (leftPlays.length > 1) {
        data.left = sortPlaysByCriteria(leftPlays);
      }
      if (rightPlays.length > 1) {
        data.right = sortPlaysByCriteria(rightPlays);
      }
    } else {
      // Merge, sort, redistribute evenly
      const merged = [...leftPlays, ...rightPlays];
      const sorted = sortPlaysByCriteria(merged);
      const mid = Math.ceil(sorted.length / 2);
      data.left = sorted.slice(0, mid);
      data.right = sorted.slice(mid);
    }

    totalSorted++;
  });

  // Save and re-render
  saveCallSheet();
  renderCallSheet();

  // Close modal
  const overlay = document.getElementById("csSortOverlay");
  if (overlay) overlay.remove();

  const scopeLabel =
    scope === "category"
      ? "1 category"
      : scope === "page"
        ? "current page"
        : "all categories";
  showToast(
    `⇅ Sorted ${totalSorted} ${totalSorted === 1 ? "category" : "categories"} (${scopeLabel})`,
  );
}

/**
 * Sort an array of plays using the current sort criteria
 */
function sortPlaysByCriteria(plays) {
  return [...plays].sort((a, b) => {
    for (const criteria of csSortCriteria) {
      const valA = String(a[criteria.field] || "").trim();
      const valB = String(b[criteria.field] || "").trim();
      const cmp = csSortCompare(valA, valB, criteria.field, criteria.direction);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

// ============ Scouting Overlay + Dead Vs Warnings ============

/**
 * Toggle the scouting intel overlay on/off
 */
function toggleScoutingOverlay() {
  const opp = getActiveOpponent();
  if (!opp && !csScoutingOverlayOn) {
    showModal(
      "No active opponent selected.\n\nGo to the 📊 Dashboard tab and select an opponent first, or use 🏈 Set Active in the Tendencies tab.",
      { title: "No Opponent", icon: "🎯" },
    );
    return;
  }
  csScoutingOverlayOn = !csScoutingOverlayOn;
  storageManager.set(STORAGE_KEYS.CS_SCOUTING_OVERLAY, csScoutingOverlayOn);
  const btn = document.getElementById("csScoutingToggle");
  if (btn) btn.classList.toggle("cs-scouting-active", csScoutingOverlayOn);
  renderCallSheet();
  if (csScoutingOverlayOn) {
    showToast(`🎯 Scouting overlay ON — showing ${opp.name} tendencies`);
  } else {
    showToast("🎯 Scouting overlay OFF");
  }
}

/**
 * Build the scouting intel badge HTML for a category header
 */
function buildScoutingBadge(categoryId) {
  if (!csScoutingOverlayOn) return "";
  const intel = getTendenciesForCategory(categoryId);
  if (!intel || intel.total === 0) return "";

  let parts = [];
  if (intel.topFront.length > 0)
    parts.push(
      `<span class="cs-scout-item">Fr: <b>${escapeHtml(intel.topFront[0].term)}</b> ${intel.topFront[0].pct}%</span>`,
    );
  if (intel.topCoverage.length > 0)
    parts.push(
      `<span class="cs-scout-item">Cov: <b>${escapeHtml(intel.topCoverage[0].term)}</b> ${intel.topCoverage[0].pct}%</span>`,
    );
  if (intel.blitzRate > 0)
    parts.push(
      `<span class="cs-scout-item cs-scout-blitz">Blitz: ${intel.blitzRate}%</span>`,
    );
  parts.push(`<span class="cs-scout-n">(n=${intel.total})</span>`);

  return `<div class="cs-scouting-badge">${parts.join("")}</div>`;
}

/**
 * Build dead-vs warning badge for a play in a call sheet category
 */
function buildDeadVsBadge(play, categoryId) {
  if (!csScoutingOverlayOn) return "";
  const intel = getTendenciesForCategory(categoryId);
  if (!intel || intel.total === 0) return "";
  if (!play.deadVs || !play.deadVs.trim()) return "";

  let allReasons = [];
  // Check vs top coverage
  if (intel.topCoverage.length > 0) {
    const { isDead, reasons } = checkDeadVs(
      play,
      intel.topCoverage[0].term,
      null,
    );
    if (isDead)
      allReasons.push(
        ...reasons.map((r) => `${r} (${intel.topCoverage[0].pct}%)`),
      );
  }
  // Check vs top front
  if (intel.topFront.length > 0) {
    const { isDead, reasons } = checkDeadVs(play, null, intel.topFront[0].term);
    if (isDead)
      allReasons.push(
        ...reasons.map((r) => `${r} (${intel.topFront[0].pct}%)`),
      );
  }

  if (allReasons.length === 0) return "";
  return `<span class="cs-dead-vs-badge" title="${allReasons.join(", ").replace(/"/g, "&quot;")}">⚠️</span>`;
}

/**
 * Open smart suggestions modal for a call sheet category
 */
function openSmartSuggestionsModal(categoryId) {
  const suggestions = getSmartSuggestions(categoryId, 25);
  const category = [...CALLSHEET_FRONT, ...CALLSHEET_BACK].find(
    (c) => c.id === categoryId,
  );
  if (!category) return;

  const opp = getActiveOpponent();
  const intel = getTendenciesForCategory(categoryId);
  const catName = getCategoryDisplayName(category);

  let intelHtml = "";
  if (intel && intel.total > 0) {
    intelHtml = `<div class="cs-suggest-intel">
      <strong>🎯 Opponent Intel (${escapeHtml(opp?.name || "Unknown")}):</strong> ${intel.summary}
    </div>`;
  } else if (!opp) {
    intelHtml = `<div class="cs-suggest-intel cs-suggest-no-intel">No opponent selected — suggestions based on play metadata only</div>`;
  }

  let listHtml = "";
  if (suggestions.length === 0) {
    listHtml =
      '<div class="empty-state">No plays found for this situation</div>';
  } else {
    listHtml = suggestions
      .map((s, idx) => {
        const fullCall = getFullCall(s.play, { showEmoji: true });
        const scoreClass =
          s.score >= 50
            ? "cs-score-high"
            : s.score >= 20
              ? "cs-score-med"
              : "cs-score-low";
        const reasonsHtml =
          s.reasons.length > 0
            ? `<span class="cs-suggest-reasons">✓ ${s.reasons.join(" • ")}</span>`
            : "";
        const warningsHtml =
          s.warnings.length > 0
            ? `<span class="cs-suggest-warnings">${s.warnings.join(" • ")}</span>`
            : "";
        const deadVsNote = s.play.deadVs
          ? `<span class="cs-suggest-deadvs">Dead vs: ${escapeHtml(s.play.deadVs)}</span>`
          : "";
        const alreadyOnSheet = isPlayOnCallSheet(s.play, categoryId);
        const addedClass = alreadyOnSheet ? "cs-suggest-on-sheet" : "";

        return `<div class="cs-suggest-item ${addedClass}" data-idx="${idx}">
        <span class="cs-suggest-rank">${idx + 1}</span>
        <span class="cs-suggest-score ${scoreClass}">${s.score}</span>
        <div class="cs-suggest-play-info">
          <div class="cs-suggest-call">${fullCall}</div>
          <div class="cs-suggest-meta">${escapeHtml(s.play.type)} ${s.play.personnel ? "• " + escapeHtml(s.play.personnel) : ""} ${escapeHtml(s.play.formation || "")}</div>
          ${reasonsHtml}${warningsHtml}${deadVsNote}
        </div>
        <div class="cs-suggest-actions">
          ${alreadyOnSheet
            ? '<span class="cs-suggest-added">✓ On Sheet</span>'
            : `
          <button class="btn btn-sm btn-primary" data-action="addSuggestionToSheet" data-cat="${categoryId}" data-hash="left" data-idx="${idx}">← L</button>
          <button class="btn btn-sm btn-primary" data-action="addSuggestionToSheet" data-cat="${categoryId}" data-hash="right" data-idx="${idx}">R →</button>
          `
          }
        </div>
      </div>`;
      })
      .join("");
  }

  const modalHtml = `
    <div id="csSuggestOverlay" class="modal-overlay" style="display:flex;">
      <div class="modal-content cs-suggest-modal">
        <div class="cs-suggest-header">
          <h3>💡 Smart Suggestions — ${escapeHtml(catName)}</h3>
          <button data-action="closeCsSuggestOverlay" class="modal-close-btn">✕</button>
        </div>
        ${intelHtml}
        <div class="cs-suggest-list">${listHtml}</div>
        <div class="cs-suggest-footer">
          <span class="cs-suggest-legend">Score = preferred field match − dead-vs penalties</span>
          <button data-action="closeCsSuggestOverlay" class="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  // backdrop close
  document
    .getElementById("csSuggestOverlay")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "csSuggestOverlay")
        document.getElementById("csSuggestOverlay")?.remove();
    });
}

/**
 * Add a suggested play to the call sheet
 */
function addSuggestionToSheet(categoryId, hash, suggestionIdx) {
  const suggestions = getSmartSuggestions(categoryId, 25);
  const s = suggestions[suggestionIdx];
  if (!s) return;

  if (!callSheet[categoryId]) callSheet[categoryId] = { left: [], right: [] };

  // Clone the play for the call sheet
  const csPlay = {
    ...s.play,
    playType: s.play.type,
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

  callSheet[categoryId][hash].push(csPlay);
  saveCallSheet();
  renderCallSheet();

  // Refresh the modal
  document.getElementById("csSuggestOverlay")?.remove();
  openSmartSuggestionsModal(categoryId);
  showToast(`💡 Added to ${hash} hash`);
}

/**
 * Check if a play is already in a category on the call sheet
 */
function isPlayOnCallSheet(play, categoryId) {
  const data = callSheet[categoryId];
  if (!data) return false;
  const checkArr = (arr) => arr.some((p) => playsMatch(p, play));
  return checkArr(data.left || []) || checkArr(data.right || []);
}

// ── Callsheet Container-Scoped Event Delegation ──────────────────────────────
// Handles click, dblclick, contextmenu, and drag events for dynamically-rendered
// call sheet elements — replaces all inline on* handlers.

function _csClosestAction(el, attr) {
  while (el) {
    if (el.dataset && el.dataset[attr !== undefined ? attr : "action"])
      return el;
    el = el.parentElement;
  }
  return null;
}

document.addEventListener("DOMContentLoaded", () => {
  // ── Grid: dblclick delegation (category rename, note edit) ──
  const grid = document.getElementById("callSheetGrid");
  if (grid) {
    grid.addEventListener("dblclick", (e) => {
      const el = e.target.closest("[data-dblaction]");
      if (!el) return;
      const action = el.dataset.dblaction;
      const cat = el.dataset.cat;
      if (action === "editCategoryName" && cat) editCategoryName(cat);
      else if (action === "editCategoryNote" && cat) editCategoryNote(cat);
    });

    // ── Grid: contextmenu delegation (play right-click) ──
    grid.addEventListener("contextmenu", (e) => {
      const play = e.target.closest(".callsheet-play");
      if (!play) return;
      const { category, hash, index } = play.dataset;
      if (category && hash && index !== undefined) {
        showPlayContextMenu(e, category, hash, parseInt(index, 10));
      }
    });

    // ── Grid: dragstart ──
    grid.addEventListener("dragstart", (e) => {
      const catDrag = e.target.closest("[data-drag='catDrag']");
      if (catDrag) {
        handleCatDragStart(e, catDrag.dataset.cat);
        return;
      }
      const play = e.target.closest(".callsheet-play");
      if (play) {
        const { category, hash, index } = play.dataset;
        handleCallSheetDragStart(e, category, hash, parseInt(index, 10));
      }
    });

    // ── Grid: dragover ──
    grid.addEventListener("dragover", (e) => {
      const catDrag = e.target.closest("[data-drag='catDrag']");
      if (catDrag) {
        handleCatDragOver(e);
        return;
      }
      const hashCol = e.target.closest("[data-drop='csHashDrop']");
      if (hashCol) {
        handleCallSheetDragOver(e);
        return;
      }
      const play = e.target.closest(".callsheet-play");
      if (play) {
        handleCallSheetDragOver(e);
      }
    });

    // ── Grid: drop ──
    grid.addEventListener("drop", (e) => {
      const catDrag = e.target.closest("[data-drag='catDrag']");
      if (catDrag) {
        handleCatDrop(e, catDrag.dataset.cat);
        return;
      }
      const hashCol = e.target.closest("[data-drop='csHashDrop']");
      if (hashCol) {
        handleCallSheetDrop(e, hashCol.dataset.cat, hashCol.dataset.hash);
        return;
      }
    });

    // ── Grid: dragend ──
    grid.addEventListener("dragend", (e) => {
      const catDrag = e.target.closest("[data-drag='catDrag']");
      if (catDrag) handleCatDragEnd(e);
      const play = e.target.closest(".callsheet-play");
      if (play) {
        play.classList.remove("dragging");
        draggedCallSheetPlay = null;
      }
      document
        .querySelectorAll(".cs-drop-above")
        .forEach((el) => el.classList.remove("cs-drop-above"));
    });

    // ── Grid: dblclick on play → toggle highlight ──
    grid.addEventListener("dblclick", (e) => {
      const play = e.target.closest(".callsheet-play");
      if (play && !e.target.closest("[data-dblaction]")) {
        const { category, hash, index } = play.dataset;
        if (category && hash && index !== undefined) {
          togglePlayHighlight(category, hash, parseInt(index, 10));
        }
      }
    });
  }

  // ── Body: sort criteria drag delegation ──
  document.body.addEventListener("dragstart", (e) => {
    const sortItem = e.target.closest("[data-drag='csSortDrag']");
    if (sortItem) handleCsSortDragStart(e, parseInt(sortItem.dataset.idx, 10));
  });
  document.body.addEventListener("dragover", (e) => {
    const sortItem = e.target.closest("[data-drag='csSortDrag']");
    if (sortItem) handleCsSortDragOver(e);
  });
  document.body.addEventListener("drop", (e) => {
    const sortItem = e.target.closest("[data-drag='csSortDrag']");
    if (sortItem) handleCsSortDrop(e, parseInt(sortItem.dataset.idx, 10));
  });
  document.body.addEventListener("dragend", (e) => {
    const sortItem = e.target.closest("[data-drag='csSortDrag']");
    if (sortItem) handleCsSortDragEnd(e);
  });

  // ── Body: change delegation for sort field selects ──
  // Handled by global _dispatchDataHandler via data-onchange + data-key + data-pass="value"
});

// ── Global click handler additions for callsheet-specific actions ──
// These are called by the global delegator in app.js via window[action](arg)
function closeCsManagePresets() {
  document.getElementById("csManagePresetsOverlay")?.remove();
}
function closeCsSuggestOverlay() {
  document.getElementById("csSuggestOverlay")?.remove();
}
// Picker play click — safe lookup from module-scoped filtered array
function csPickerAddPlay(el) {
  const idx = parseInt(el.dataset?.idx ?? el, 10);
  const play = _csPickerFiltered[idx];
  if (play) addCallSheetPlayFromPicker(play);
}

/**
 * Export the entire call sheet to CSV — one row per play, grouped by bucket.
 */
function exportCallSheetCSV() {
  const hasPlays = CALLSHEET_CATEGORIES.some((cat) => {
    const bucket = callSheet[cat.id];
    return bucket && (bucket.left?.length || bucket.right?.length);
  });
  if (!hasPlays) {
    showToast("Call sheet is empty — nothing to export.", { type: "error" });
    return;
  }

  const esc = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };

  const headers = [
    "Category",
    "Side",
    "Formation",
    "Back",
    "Shift",
    "Motion",
    "Protection",
    "Play",
    "Type",
    "Personnel",
    "OneWord",
    "Tempo",
    "Notes",
  ];
  const rows = [headers.join(",")];

  CALLSHEET_CATEGORIES.forEach((cat) => {
    const bucket = callSheet[cat.id];
    if (!bucket) return;
    const catName = getCategoryDisplayName(cat);
    ["left", "right"].forEach((side) => {
      (bucket[side] || []).forEach((p) => {
        rows.push(
          [
            esc(catName),
            side === "left" ? "L" : "R",
            esc(p.formation),
            esc(p.back),
            esc(p.shift),
            esc(p.motion),
            esc(p.protection),
            esc(p.play),
            esc(p.type),
            esc(p.personnel),
            esc(p.oneWord),
            esc(p.tempo),
            esc(p.notes),
          ].join(","),
        );
      });
    });
  });

  const csv = rows.join("\n");
  const dateStr = new Date().toISOString().slice(0, 10);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `call_sheet_${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`📥 Exported call sheet to CSV`, {
    duration: 3000,
    type: "success",
  });
}
