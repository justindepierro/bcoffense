// Call Sheet functionality

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

const CALLSHEET_PLAYER_AUTOFILL_MIN = 6;

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

const BASE_CALLSHEET_FRONT = CALLSHEET_FRONT.map((cat) => ({ ...cat }));
const BASE_CALLSHEET_BACK = CALLSHEET_BACK.map((cat) => ({ ...cat }));

const CS_HEADER_COLOR_OPTIONS = [
  { name: "Red", value: CS_COLORS.red },
  { name: "Yellow", value: CS_COLORS.yellow },
  { name: "Orange", value: CS_COLORS.orange },
  { name: "Green", value: CS_COLORS.green },
  { name: "Blue", value: CS_COLORS.blue },
  { name: "Purple", value: CS_COLORS.purple },
  { name: "Teal", value: CS_COLORS.teal },
  { name: "Gray", value: CS_COLORS.gray },
];

function getDefaultCallSheetCategoryOrder() {
  return {
    front: CALLSHEET_FRONT.map((cat) => cat.id),
    back: CALLSHEET_BACK.map((cat) => cat.id),
  };
}

function getCustomCallSheetCategoriesFromSettings(settings = callSheetSettings) {
  const source = settings?.customCategories || {};
  return {
    front: Array.isArray(source.front) ? source.front : [],
    back: Array.isArray(source.back) ? source.back : [],
  };
}

function rebuildCallSheetCategoryRegistry() {
  const customCategories = getCustomCallSheetCategoriesFromSettings();
  const nextFront = [
    ...BASE_CALLSHEET_FRONT.map((cat) => ({ ...cat })),
    ...customCategories.front.map((cat) => ({ ...cat, custom: true, manual: true })),
  ];
  const nextBack = [
    ...BASE_CALLSHEET_BACK.map((cat) => ({ ...cat })),
    ...customCategories.back.map((cat) => ({ ...cat, custom: true, manual: true })),
  ];

  CALLSHEET_FRONT.splice(0, CALLSHEET_FRONT.length, ...nextFront);
  CALLSHEET_BACK.splice(0, CALLSHEET_BACK.length, ...nextBack);
  CALLSHEET_CATEGORIES.splice(
    0,
    CALLSHEET_CATEGORIES.length,
    ...nextFront,
    ...nextBack,
  );
}

function normalizeCallSheetPage(page) {
  return page === "back" ? "back" : "front";
}

function normalizeCallSheetSettings(settings = {}) {
  const defaults = getDefaultCallSheetSettings();
  const merged = { ...defaults, ...(settings || {}) };
  const customCategories = merged.customCategories || {};

  return {
    ...merged,
    orientation: merged.orientation === "portrait" ? "portrait" : "landscape",
    currentPage: normalizeCallSheetPage(merged.currentPage),
    customNames: merged.customNames && typeof merged.customNames === "object"
      ? merged.customNames
      : {},
    customColors: merged.customColors && typeof merged.customColors === "object"
      ? merged.customColors
      : {},
    customCategories: {
      front: Array.isArray(customCategories.front) ? customCategories.front : [],
      back: Array.isArray(customCategories.back) ? customCategories.back : [],
    },
    loadedWristbandName: merged.loadedWristbandName || "",
    loadedWristbandPlays: Array.isArray(merged.loadedWristbandPlays)
      ? merged.loadedWristbandPlays
      : [],
  };
}

function normalizeCallSheetCategoryOrder(order) {
  const defaults = getDefaultCallSheetCategoryOrder();
  const validIds = new Set(CALLSHEET_CATEGORIES.map((cat) => cat.id));
  const normalized = { front: [], back: [] };
  const placed = new Set();

  ["front", "back"].forEach((page) => {
    const source = Array.isArray(order?.[page]) ? order[page] : defaults[page];
    source.forEach((id) => {
      if (!validIds.has(id) || placed.has(id)) return;
      normalized[page].push(id);
      placed.add(id);
    });
  });

  CALLSHEET_CATEGORIES.forEach((cat) => {
    if (placed.has(cat.id)) return;
    const defaultPage = defaults.front.includes(cat.id) ? "front" : "back";
    normalized[defaultPage].push(cat.id);
    placed.add(cat.id);
  });

  return normalized;
}

// Store for call sheet data: { categoryId: { left: [...plays], right: [...plays], customName: "..." } }
let callSheet = {};

// Call sheet settings
function getDefaultCallSheetSettings() {
  return {
    orientation: "landscape", // portrait or landscape
    currentPage: "front", // front or back
    customNames: {}, // { categoryId: "Custom Name" }
    customColors: {}, // { categoryId: "#hex" }
    customCategories: { front: [], back: [] },
    loadedWristbandName: "", // Name of loaded wristband
    loadedWristbandPlays: [], // Plays from loaded wristband with numbers
  };
}

let callSheetSettings = getDefaultCallSheetSettings();

// Current edit state
let editingCategory = null;
let editingHash = null;

// Autosave timer
let callSheetAutosaveTimer = null;

// Custom category ordering (array of category IDs per page)
let csCategoryOrder = getDefaultCallSheetCategoryOrder();

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
  "callsheetShowFormationTags",
  "callsheetShowBack",
  "callsheetShowOneWordOnly",
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

function hasCallSheetCellDisplayOverrides(play) {
  return CALLSHEET_CELL_DISPLAY_OVERRIDE_PROPS.some((prop) => Boolean(play[prop]));
}

function clearCallSheetCellDisplayOverrides(play) {
  CALLSHEET_CELL_DISPLAY_OVERRIDE_PROPS.forEach((prop) => {
    delete play[prop];
  });
}

function getCallSheetHighlightConfig(play) {
  if (!play) return null;
  const highlightKey = play.highlightColor || (play.highlighted ? "yellow" : "");
  if (!highlightKey) return null;
  return CALLSHEET_HIGHLIGHT_SWATCHES.find((swatch) => swatch.key === highlightKey) || null;
}

function getCallSheetCustomTagValues(value) {
  return getSharedCustomTagEntries(value);
}

function normalizeCallSheetCustomTagValue(value) {
  return normalizeSharedCustomTagValue(value);
}

function getCallSheetCustomTagMarkup(values, variant, options = {}) {
  return values.map(
    (entry) => {
      const text = formatSharedCustomTagEntryText(entry);
      const displayText = options.noVowels ? removeVowels(text) : text;
      return `<span class="cs-inline-tag cs-inline-tag--${variant}">(${escapeHtml(displayText)})</span>`;
    },
  );
}

function getCallSheetCellDisplayPreset(presetId) {
  return CALLSHEET_CELL_DISPLAY_PRESETS.find((preset) => preset.id === presetId);
}

function isCallSheetCellDisplayPresetActive(play, presetId) {
  const preset = getCallSheetCellDisplayPreset(presetId);
  if (!preset) return false;

  return CALLSHEET_CELL_DISPLAY_OVERRIDE_PROPS.every((prop) => {
    const expected = Boolean(preset.overrides?.[prop]);
    return Boolean(play[prop]) === expected;
  });
}

function applyCallSheetCellDisplayPreset(play, presetId) {
  const preset = getCallSheetCellDisplayPreset(presetId);
  if (!preset) return false;
  if (
    preset.requiresOneWord &&
    !(play.oneWord && String(play.oneWord).trim())
  ) {
    return false;
  }

  clearCallSheetCellDisplayOverrides(play);
  Object.entries(preset.overrides || {}).forEach(([prop, value]) => {
    if (value) play[prop] = value;
  });
  return true;
}

function getCallSheetCellDisplaySummary(play) {
  const tokens = [];
  const titleParts = [];
  const tokenMap = [
    ["cellHideWristband", "-#", "Hide wristband number"],
    ["cellHidePersonnel", "-Pers", "Hide personnel badge"],
    ["cellHideFormation", "-Form", "Hide formation"],
    ["cellHideFormationTags", "-FTag", "Hide formation tags"],
    ["cellHideBack", "-Back", "Hide back"],
    ["cellHideShift", "-Shift", "Hide shift"],
    ["cellHideMotion", "-Mot", "Hide motion"],
    ["cellHideProtection", "-Prot", "Hide protection"],
    ["cellHidePlayName", "-Play", "Hide play name"],
    ["cellHidePlayTags", "-PTag", "Hide play tags"],
    ["cellHideLineCall", "-LC", "Hide line call"],
  ];

  if (play.cellUseOneWord) {
    tokens.push("1W");
    titleParts.push("One-word only");
  }
  if (play.cellDisableOneWord) {
    tokens.push("-1W");
    titleParts.push("Force full call");
  }

  if (play.cellForceUnderCenter) {
    tokens.push("🍑");
    titleParts.push("Force under-center peach indicator");
  }

  const highlightConfig = getCallSheetHighlightConfig(play);
  if (highlightConfig?.key) {
    tokens.push("HL");
    titleParts.push(`${highlightConfig.name} highlighter`);
  }

  tokenMap.forEach(([prop, token, title]) => {
    if (play[prop]) {
      tokens.push(token);
      titleParts.push(title);
    }
  });

  const customFormationTags = getCallSheetCustomTagValues(play.cellFormationTags);
  const customBackTags = getCallSheetCustomTagValues(play.cellBackTags);
  if (customFormationTags.length) {
    tokens.push(`+FT${customFormationTags.length}`);
    titleParts.push(`Custom formation tags: ${customFormationTags.map((entry) => entry.value).join(", ")}`);
  }
  if (customBackTags.length) {
    tokens.push(`+BT${customBackTags.length}`);
    titleParts.push(`Custom back tags: ${customBackTags.map((entry) => entry.value).join(", ")}`);
  }

  if (!tokens.length) return null;

  const visibleTokens = tokens.slice(0, 3);
  const overflow = tokens.length - visibleTokens.length;
  return {
    label: overflow > 0 ? `${visibleTokens.join(" ")} +${overflow}` : visibleTokens.join(" "),
    title: `Cell display overrides: ${titleParts.join(", ")}`,
  };
}

function getCallSheetScopeLabel(scope) {
  if (scope === "left") return "Left Hash";
  if (scope === "right") return "Right Hash";
  return "Both Hashes";
}

function getCallSheetScopePlays(categoryId, scope) {
  const category = callSheet[categoryId] || { left: [], right: [] };
  if (scope === "left") return Array.isArray(category.left) ? category.left : [];
  if (scope === "right")
    return Array.isArray(category.right) ? category.right : [];
  return [
    ...(Array.isArray(category.left) ? category.left : []),
    ...(Array.isArray(category.right) ? category.right : []),
  ];
}

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
      callSheetSettings = normalizeCallSheetSettings(savedSettings);
    } else {
      callSheetSettings = normalizeCallSheetSettings(callSheetSettings);
    }
    let settingsRepaired = Boolean(
      savedSettings &&
      (savedSettings.currentPage !== callSheetSettings.currentPage ||
        savedSettings.orientation !== callSheetSettings.orientation),
    );
    if (callSheetSettings.orientation !== "landscape") {
      callSheetSettings.orientation = "landscape";
      settingsRepaired = true;
    }
    if (settingsRepaired) {
      saveCallSheetSettings();
    }

    rebuildCallSheetCategoryRegistry();

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
    if (savedOrder) {
      csCategoryOrder = normalizeCallSheetCategoryOrder(savedOrder);
      if (JSON.stringify(savedOrder) !== JSON.stringify(csCategoryOrder)) {
        storageManager.set(
          STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER,
          csCategoryOrder,
        );
      }
    }

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

    // Re-sync any stale `{...play}` snapshots against the master playbook
    // before first render (mirrors the gameplan v358 fix).
    refreshCallSheetFromPlaybook();

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
    const playKey = (p) => csPlayKey(p);

    const playerTargets = buildPlayerCategoryAutoFillTargets(plays);

    // Go through each play and categorize
    plays.forEach((play, playIndex) => {
      const categories = new Set(findMatchingCategories(play));
      (playerTargets[playIndex] || new Set()).forEach((catId) => categories.add(catId));

      if (categories.size === 0) {
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
    // Vision Mode: re-sort each bucket so Picture-tagged families lead
    // (Wide Zone first, then Pullers, Downhill, Anti-front, then untagged)
    // and trim to bucketTargets.targetMax (default 10).
    const visionOn = typeof isVisionMode === "function" && isVisionMode();
    if (visionOn && typeof getPlayPicture === "function") {
      const order = { wideZone: 0, pullers: 1, downhill: 2, antiFront: 3 };
      const targetMax =
        (typeof VISION_2026 !== "undefined" &&
          VISION_2026.bucketTargets &&
          VISION_2026.bucketTargets.targetMax) ||
        10;
      let trimmed = 0;
      Object.keys(callSheet).forEach((catId) => {
        ["left", "right"].forEach((side) => {
          const arr = callSheet[catId][side];
          if (!Array.isArray(arr) || arr.length === 0) return;
          arr.sort((a, b) => {
            const pa = getPlayPicture(a);
            const pb = getPlayPicture(b);
            const oa = pa && order[pa] !== undefined ? order[pa] : 99;
            const ob = pb && order[pb] !== undefined ? order[pb] : 99;
            return oa - ob;
          });
        });
        // Trim combined bucket size to targetMax (preserve hash split)
        const total = callSheet[catId].left.length + callSheet[catId].right.length;
        if (total > targetMax) {
          const overflow = total - targetMax;
          let remaining = overflow;
          // Trim from end of right first, then left
          while (remaining > 0 && callSheet[catId].right.length > 0) {
            callSheet[catId].right.pop();
            remaining--;
            trimmed++;
          }
          while (remaining > 0 && callSheet[catId].left.length > 0) {
            callSheet[catId].left.pop();
            remaining--;
            trimmed++;
          }
        }
      });
      renderCallSheet();
      saveCallSheet();
      msg += ` • 🎯 Vision: prioritized by Picture${trimmed > 0 ? `, trimmed ${trimmed} over target` : ""}`;
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

function normalizeCallSheetPlayerName(value) {
  return String(value || "").toLowerCase().trim();
}

function getCallSheetPlayerCategoryName(cat) {
  const name =
    typeof getCategoryDisplayName === "function"
      ? getCategoryDisplayName(cat)
      : cat?.name;
  return normalizeCallSheetPlayerName(name);
}

/**
 * Player buckets auto-fill from Key Player 1 first. Key Player 2 only backfills
 * a bucket until it reaches the configured minimum count.
 */
function buildPlayerCategoryAutoFillTargets(items, options = {}) {
  const source = Array.isArray(items) ? items : [];
  const getPlay =
    typeof options.getPlay === "function"
      ? options.getPlay
      : (item) =>
        item && typeof item.play === "object" && item.play !== null
          ? item.play
          : item;
  const minCount = Number.isFinite(options.minCount)
    ? Math.max(0, Math.floor(options.minCount))
    : CALLSHEET_PLAYER_AUTOFILL_MIN;
  const targetSets = source.map(() => new Set());
  const playerCats = Array.isArray(CALLSHEET_CATEGORIES)
    ? CALLSHEET_CATEGORIES.filter((cat) => cat.playerSpecific)
    : [];

  playerCats.forEach((cat) => {
    const playerName = getCallSheetPlayerCategoryName(cat);
    if (!playerName) return;

    const primary = [];
    const secondary = [];
    const primaryKeys = new Set();
    const secondaryKeys = new Set();
    source.forEach((item, index) => {
      const play = getPlay(item);
      if (!play) return;
      const key = typeof csPlayKey === "function" ? csPlayKey(play) : String(index);
      const keyPlayer1 = normalizeCallSheetPlayerName(play.keyPlayerName1);
      const keyPlayer2 = normalizeCallSheetPlayerName(play.keyPlayerName2);
      if (keyPlayer1 === playerName) {
        if (primaryKeys.has(key)) return;
        primaryKeys.add(key);
        primary.push(index);
      } else if (
        keyPlayer2 === playerName &&
        !primaryKeys.has(key) &&
        !secondaryKeys.has(key)
      ) {
        secondaryKeys.add(key);
        secondary.push(index);
      }
    });

    primary.forEach((index) => targetSets[index].add(cat.id));
    if (primary.length < minCount) {
      secondary
        .slice(0, minCount - primary.length)
        .forEach((index) => targetSets[index].add(cat.id));
    }
  });

  return targetSets;
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
  const safePage = normalizeCallSheetPage(page);
  const normalizedOrder = normalizeCallSheetCategoryOrder(csCategoryOrder);
  csCategoryOrder = normalizedOrder;

  return (normalizedOrder[safePage] || [])
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
  container.classList.toggle("callsheet-landscape", isLandscape);
  container.classList.toggle("callsheet-portrait", !isLandscape);

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
  } else {
    const columns = buildCallSheetColumns(categories, 3);
    html += '<div class="callsheet-columns">';
    columns.forEach((col) => {
      html += '<div class="callsheet-column">';
      col.forEach((cat) => {
        html += renderCategory(cat, callSheet[cat.id], dupeMap, displayOptions);
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

  return `
    <div class="callsheet-play ${highlightClass} ${tempoClass}${deadVsBadgeHtml ? " cs-play-has-warning" : ""}" draggable="true"
         style="${cellStyleStr}"
         role="row" aria-label="${escapeHtml(playLabel.trim())}"
         data-category="${categoryId}" data-hash="${hash}" data-index="${index}">
      ${personnelHtml}
      <span class="play-text" role="cell">${visiblePlayText}</span>
      ${displayIndicator}
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
  const categories = getCallSheetCategoriesForPage(page);
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
  const activeHighlightKey = getCallSheetHighlightConfig(play)?.key || "";

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

  // ─── Highlighter ───
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Highlighter</span><div class="cs-ctx-colors">`;
  CALLSHEET_HIGHLIGHT_SWATCHES.forEach((c) => {
    const sel = activeHighlightKey === c.key ? " cs-swatch-active" : "";
    menuHtml += `<button class="cs-color-swatch${sel}" data-action="highlight" data-color="${c.key}" style="background:${c.css};" title="${c.name}"></button>`;
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

  const displayOverrideButtons = [
    { prop: "cellForceUnderCenter", label: "🍑", title: "Force under-center peach indicator" },
    { prop: "cellHideWristband", label: "#", title: "Hide wristband number" },
    { prop: "cellHidePersonnel", label: "Pers", title: "Hide personnel badge" },
    { prop: "cellHideFormation", label: "Form", title: "Hide formation" },
    { prop: "cellHideFormationTags", label: "FTag", title: "Hide formation tags" },
    { prop: "cellHideBack", label: "Back", title: "Hide back" },
    { prop: "cellHideShift", label: "Shift", title: "Hide shift" },
    { prop: "cellHideMotion", label: "Mot", title: "Hide motion" },
    { prop: "cellHideProtection", label: "Prot", title: "Hide protection" },
    { prop: "cellHidePlayName", label: "Play", title: "Hide play name" },
    { prop: "cellHidePlayTags", label: "PTag", title: "Hide play tags" },
    { prop: "cellHideLineCall", label: "LC", title: "Hide line call" },
  ];
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Hide In This Cell</span><div class="cs-ctx-styles cs-ctx-styles--wrap">`;
  displayOverrideButtons.forEach((item) => {
    menuHtml += `<button class="cs-style-btn cs-style-btn--text${play[item.prop] ? " active" : ""}" data-action="toggleStyle" data-prop="${item.prop}" title="${item.title}">${item.label}</button>`;
  });
  menuHtml += `</div></div>`;

  const displayPresetButtons = CALLSHEET_CELL_DISPLAY_PRESETS.filter((preset) => {
    if (!preset.requiresOneWord) return true;
    return play.oneWord && String(play.oneWord).trim();
  });
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Quick Presets</span><div class="cs-ctx-styles cs-ctx-styles--wrap">`;
  displayPresetButtons.forEach((preset) => {
    const isActive = isCallSheetCellDisplayPresetActive(play, preset.id);
    menuHtml += `<button class="cs-style-btn cs-style-btn--text${isActive ? " active" : ""}" data-action="applyPreset" data-preset="${preset.id}" title="${preset.sublabel}">${preset.label}</button>`;
  });
  menuHtml += `</div></div>`;

  if (play.oneWord && String(play.oneWord).trim()) {
    menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Display Mode</span><div class="cs-ctx-styles">`;
    menuHtml += `<button class="cs-style-btn${play.cellUseOneWord ? " active" : ""}" data-action="toggleStyle" data-prop="cellUseOneWord" title="Show one-word call only">1W</button>`;
    menuHtml += `<button class="cs-style-btn${play.cellDisableOneWord ? " active" : ""}" data-action="toggleStyle" data-prop="cellDisableOneWord" title="Force full call even when global one-word is on">Full</button>`;
    menuHtml += `</div></div>`;
  }

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
  const noteVal = escapeHtml(play.cellNote || "");
  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Cell Note</span>`;
  menuHtml += `<div class="cs-ctx-note-row"><input type="text" class="cs-ctx-note-input" value="${noteVal}" placeholder="Add a note..." maxlength="60" />`;
  menuHtml += `<button class="cs-ctx-note-save" data-action="saveNote" title="Save note">✓</button></div></div>`;

  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Custom Formation Tags</span>`;
  menuHtml += `<div class="cs-ctx-helper">${getCallSheetCustomTagValues(play.cellFormationTags).length || 0} tag(s) configured.</div>`;
  menuHtml += `<div class="cs-ctx-tag-actions"><button class="cs-ctx-note-save" data-action="editFormationTags" title="Edit formation tags">Edit</button>`;
  menuHtml += `<button class="cs-ctx-note-clear" data-action="clearFormationTags" title="Clear formation tags">✕</button></div>`;
  menuHtml += `<div class="cs-ctx-helper">Set each tag to Full, NV, or 1L.</div></div>`;

  menuHtml += `<div class="cs-ctx-section"><span class="cs-ctx-label">Custom Back Tags</span>`;
  menuHtml += `<div class="cs-ctx-helper">${getCallSheetCustomTagValues(play.cellBackTags).length || 0} tag(s) configured.</div>`;
  menuHtml += `<div class="cs-ctx-tag-actions"><button class="cs-ctx-note-save" data-action="editBackTags" title="Edit back tags">Edit</button>`;
  menuHtml += `<button class="cs-ctx-note-clear" data-action="clearBackTags" title="Clear back tags">✕</button></div>`;
  menuHtml += `<div class="cs-ctx-helper">Set each tag to Full, NV, or 1L.</div></div>`;

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

  const reopenMenu = () => {
    const rect = menu.getBoundingClientRect();
    showPlayContextMenu(
      {
        preventDefault() { },
        clientX: Math.max(8, rect.left + 6),
        clientY: Math.max(8, rect.top + 6),
      },
      categoryId,
      hash,
      index,
    );
  };

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
      reopenMenu();
    } else if (action === "highlight") {
      const nextHighlight = btn.dataset.color || "";
      if (nextHighlight) {
        p.highlightColor = nextHighlight;
      } else {
        delete p.highlightColor;
      }
      delete p.highlighted;
      renderCallSheet();
      saveCallSheet();
      reopenMenu();
    } else if (action === "cellBg") {
      p.cellBg = btn.dataset.color || undefined;
      renderCallSheet();
      saveCallSheet();
      reopenMenu();
    } else if (action === "cellTextColor") {
      p.cellTextColor = btn.dataset.color || undefined;
      renderCallSheet();
      saveCallSheet();
      reopenMenu();
    } else if (action === "toggleStyle") {
      const prop = btn.dataset.prop;
      p[prop] = !p[prop];
      if (!p[prop]) delete p[prop];
      if (prop === "cellUseOneWord" && p.cellUseOneWord) delete p.cellDisableOneWord;
      if (prop === "cellDisableOneWord" && p.cellDisableOneWord) delete p.cellUseOneWord;
      renderCallSheet();
      saveCallSheet();
      reopenMenu();
    } else if (action === "applyPreset") {
      const preset = getCallSheetCellDisplayPreset(btn.dataset.preset);
      if (!preset) return;
      const applied = applyCallSheetCellDisplayPreset(p, preset.id);
      if (!applied) {
        showToast("One-word call is not available for this play", {
          duration: 2500,
          type: "warning",
        });
        return;
      }
      renderCallSheet();
      saveCallSheet();
      showToast(`Applied ${preset.label} display preset`);
      reopenMenu();
    } else if (action === "fontSize") {
      p.cellFontSize = btn.dataset.size || undefined;
      renderCallSheet();
      saveCallSheet();
      reopenMenu();
    } else if (action === "saveNote") {
      const input = menu.querySelector(".cs-ctx-note-input");
      const val = (input?.value || "").trim();
      p.cellNote = val || undefined;
      renderCallSheet();
      saveCallSheet();
      showToast(val ? "📝 Note saved" : "📝 Note removed");
      reopenMenu();
    } else if (action === "editFormationTags") {
      showCustomTagEditorModal({
        title: "Call Sheet Formation Tags",
        icon: "🏷️",
        message: "Add formation-tag options and set each one to Full, NV, or 1L.",
        placeholder: "Open",
        initialEntries: p.cellFormationTags,
      }).then((entries) => {
        if (entries === null) return;
        p.cellFormationTags = entries.length ? entries : undefined;
        renderCallSheet();
        saveCallSheet();
        showToast(entries.length ? "Formation tags saved" : "Formation tags removed");
      });
      menu.remove();
      return;
    } else if (action === "editBackTags") {
      showCustomTagEditorModal({
        title: "Call Sheet Back Tags",
        icon: "🏷️",
        message: "Add back-tag options and set each one to Full, NV, or 1L.",
        placeholder: "Pistol",
        initialEntries: p.cellBackTags,
      }).then((entries) => {
        if (entries === null) return;
        p.cellBackTags = entries.length ? entries : undefined;
        renderCallSheet();
        saveCallSheet();
        showToast(entries.length ? "Back tags saved" : "Back tags removed");
      });
      menu.remove();
      return;
    } else if (action === "saveFormationTags") {
      const input = menu.querySelector(".cs-ctx-tag-input");
      const val = getCallSheetCustomTagValues(input?.value || "")
        .map((item) => normalizeCallSheetCustomTagValue(item.value || item))
        .filter(Boolean)
        .join("; ");
      p.cellFormationTags = val || undefined;
      renderCallSheet();
      saveCallSheet();
      showToast(val ? "Formation tags saved" : "Formation tags removed");
      reopenMenu();
    } else if (action === "saveBackTags") {
      const input = menu.querySelector(".cs-ctx-back-tag-input");
      const val = getCallSheetCustomTagValues(input?.value || "")
        .map((item) => normalizeCallSheetCustomTagValue(item.value || item))
        .filter(Boolean)
        .join("; ");
      p.cellBackTags = val || undefined;
      renderCallSheet();
      saveCallSheet();
      showToast(val ? "Back tags saved" : "Back tags removed");
      reopenMenu();
    } else if (action === "clearFormationTags") {
      delete p.cellFormationTags;
      renderCallSheet();
      saveCallSheet();
      showToast("Formation tags removed");
      reopenMenu();
    } else if (action === "clearBackTags") {
      delete p.cellBackTags;
      renderCallSheet();
      saveCallSheet();
      showToast("Back tags removed");
      reopenMenu();
    } else if (action === "clearFormat") {
      delete p.highlightColor;
      delete p.highlighted;
      delete p.borderColor;
      delete p.cellBg;
      delete p.cellTextColor;
      clearCallSheetCellDisplayOverrides(p);
      delete p.cellBold;
      delete p.cellItalic;
      delete p.cellUnderline;
      delete p.cellStrikethrough;
      delete p.cellFontSize;
      delete p.cellNote;
      delete p.cellFormationTags;
      delete p.cellBackTags;
      renderCallSheet();
      saveCallSheet();
      showToast("✖ Formatting cleared");
      reopenMenu();
    } else if (action === "swap") {
      swapPlayHash(categoryId, hash, index);
      menu.remove();
    } else if (action === "copy") {
      const targetCat = btn.dataset.cat;
      const copy = { ...p };
      const targetData = callSheet[targetCat] || { left: [], right: [] };
      if (!Array.isArray(targetData.left)) targetData.left = [];
      if (!Array.isArray(targetData.right)) targetData.right = [];
      callSheet[targetCat] = targetData;
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
    if (getCallSheetHighlightConfig(play)) {
      delete play.highlightColor;
      delete play.highlighted;
    } else {
      play.highlightColor = "yellow";
    }
    renderCallSheet();
    saveCallSheet();
  }
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
 * Print call sheet — opens an options modal first (paper, orientation,
 * columns, margin) so the user can pick a 2-column portrait layout for
 * better legibility, then renders and prints.
 */
async function printCallSheet() {
  const choice = await openCallSheetPrintModal();
  if (!choice) return;
  _csRunPrint(choice);
}

const CS_PRINT_DEFAULTS = {
  paperSize: "letter",       // "letter" | "legal" | "tabloid"
  orientation: "portrait",   // "portrait" | "landscape"
  pages: "both",             // "both" | "current" | "front" | "back"
  columns: 3,                // 2 | 3 | 4
  margin: "normal",          // "tight" | "normal" | "wide"
};

function getCallSheetPrintOptions() {
  const stored = storageManager.get(STORAGE_KEYS.CALLSHEET_PRINT_OPTIONS, {});
  return { ...CS_PRINT_DEFAULTS, ...(stored && typeof stored === "object" ? stored : {}) };
}

function setCallSheetPrintOptions(opts) {
  const merged = { ...CS_PRINT_DEFAULTS, ...(opts || {}) };
  storageManager.set(STORAGE_KEYS.CALLSHEET_PRINT_OPTIONS, merged);
  return merged;
}

function _csApplyPrintSmartDefaults() {
  return setCallSheetPrintOptions({
    paperSize: "letter",
    orientation: "portrait",
    pages: "both",
    columns: 2,
    margin: "normal",
  });
}

function _csNormalizePrintPages(pages) {
  if (pages === "both" || pages === "front" || pages === "back") return pages;
  return "current";
}

function _csGetPrintPages(pages) {
  const mode = _csNormalizePrintPages(pages);
  if (mode === "both") return ["front", "back"];
  if (mode === "front" || mode === "back") return [mode];
  return [normalizeCallSheetPage(callSheetSettings.currentPage)];
}

function _csPrintMarginValue(orientation, margin) {
  // Per-orientation defaults match the legacy values
  const base = orientation === "landscape" ? 0.14 : 0.16;
  if (margin === "tight") return `${(base - 0.04).toFixed(2)}in`;
  if (margin === "wide") return `${(base + 0.14).toFixed(2)}in`;
  return `${base.toFixed(2)}in`;
}

async function openCallSheetPrintModal() {
  const o = getCallSheetPrintOptions();
  // Default the modal to current orientation toggle if user already set one
  if (callSheetSettings && callSheetSettings.orientation) {
    o.orientation = callSheetSettings.orientation === "landscape" ? "landscape" : "portrait";
  }
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="csPrintTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🖨️</span>
          <h3 class="custom-modal-title" id="csPrintTitle">Print Call Sheet</h3>
        </div>
        <div class="custom-modal-body">
          <div class="gp-print-form">
            <div class="gp-print-row">
              <label>Paper</label>
              <select id="csPrintPaper">
                <option value="letter" ${o.paperSize === "letter" ? "selected" : ""}>Letter (8.5×11)</option>
                <option value="legal" ${o.paperSize === "legal" ? "selected" : ""}>Legal (8.5×14)</option>
                <option value="tabloid" ${o.paperSize === "tabloid" ? "selected" : ""}>Tabloid (11×17)</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Orientation</label>
              <select id="csPrintOrientation">
                <option value="portrait" ${o.orientation === "portrait" ? "selected" : ""}>Portrait</option>
                <option value="landscape" ${o.orientation === "landscape" ? "selected" : ""}>Landscape</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Pages</label>
              <select id="csPrintPages" title="Front first, then back for two-sided printing">
                <option value="both" ${_csNormalizePrintPages(o.pages) === "both" ? "selected" : ""}>Front + Back (2-sided)</option>
                <option value="current" ${_csNormalizePrintPages(o.pages) === "current" ? "selected" : ""}>Current page only</option>
                <option value="front" ${_csNormalizePrintPages(o.pages) === "front" ? "selected" : ""}>Front only</option>
                <option value="back" ${_csNormalizePrintPages(o.pages) === "back" ? "selected" : ""}>Back only</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Columns</label>
              <select id="csPrintColumns" title="Fewer columns = larger, more legible text">
                <option value="2" ${o.columns === 2 ? "selected" : ""}>2 columns (largest text)</option>
                <option value="3" ${o.columns === 3 ? "selected" : ""}>3 columns (default)</option>
                <option value="4" ${o.columns === 4 ? "selected" : ""}>4 columns (most plays per page)</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Margin</label>
              <select id="csPrintMargin">
                <option value="tight" ${o.margin === "tight" ? "selected" : ""}>Tight</option>
                <option value="normal" ${o.margin === "normal" ? "selected" : ""}>Normal</option>
                <option value="wide" ${o.margin === "wide" ? "selected" : ""}>Wide</option>
              </select>
            </div>
            <p class="cs-print-hint" style="margin:10px 0 0;font-size:12px;color:var(--color-text-muted);">
              💡 <strong>Front + Back</strong> prints two pages in order. Turn on two-sided printing in the print dialog to laminate one sheet.
            </p>
          </div>
        </div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="csPrintCancel">Cancel</button>
          <button class="btn btn-secondary custom-modal-btn" id="csPrintSmart" type="button" title="Reset to smart defaults: portrait, 2 columns">✨ Smart defaults</button>
          <button class="btn btn-primary custom-modal-btn" id="csPrintConfirm">Print</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const close = (result) => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    overlay.querySelector("#csPrintCancel").addEventListener("click", () => close(null));
    overlay.querySelector("#csPrintSmart").addEventListener("click", () => {
      _csApplyPrintSmartDefaults();
      close(null);
      setTimeout(() => printCallSheet(), 50);
    });
    overlay.querySelector("#csPrintConfirm").addEventListener("click", () => {
      const opts = setCallSheetPrintOptions({
        paperSize: overlay.querySelector("#csPrintPaper").value,
        orientation: overlay.querySelector("#csPrintOrientation").value,
        pages: overlay.querySelector("#csPrintPages").value,
        columns: parseInt(overlay.querySelector("#csPrintColumns").value, 10) || 3,
        margin: overlay.querySelector("#csPrintMargin").value,
      });
      close(opts);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(null); }
    });
  });
}

function _csRunPrint(opts) {
  try {
    showToast("🖨️ Preparing call sheet…", 2500);
    const container = document.getElementById("callSheetPrint");
    const content = document.getElementById("callSheetPrintContent");

    const orientation = opts.orientation === "landscape" ? "landscape" : "portrait";
    const columns = [2, 3, 4].includes(opts.columns) ? opts.columns : 3;
    const orientClass = orientation === "landscape" ? "print-landscape" : "print-portrait";
    const colsClass = `print-cs-cols-${columns}`;
    const pagesToPrint = _csGetPrintPages(opts.pages);

    // Hoist display options once — avoids re-reading checkboxes per play
    const printOptions = getCallSheetDisplayOptions();

    // Build print HTML
    const html = pagesToPrint
      .map((page) =>
        renderCallSheetPrintPage(page, {
          columns,
          orientClass,
          colsClass,
          printOptions,
        }),
      )
      .join("");

    content.innerHTML = html;
    container.classList.remove("hidden");
    document.body.dataset.printMode = "callsheet";

    const paper = ["letter", "legal", "tabloid"].includes(opts.paperSize) ? opts.paperSize : "letter";
    const printMargin = _csPrintMarginValue(orientation, opts.margin);
    setupPrintPageStyle(
      `@media print { @page { size: ${paper} ${orientation}; margin: ${printMargin}; } }`,
    );

    setTimeout(() => {
      const pageLabel =
        pagesToPrint.length > 1
          ? "Front-Back"
          : pagesToPrint[0] === "front"
            ? "Front"
            : "Back";
      const restoreTitle = setPrintTitle("Call Sheet", pageLabel);
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try {
          restoreTitle();
        } catch (_) { }
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      // Safety net: if the browser never fires afterprint (older browsers,
      // or the user cancels in a way that suppresses it), restore after 60s.
      setTimeout(cleanup, 60000);
      try {
        window.print();
      } catch (e) {
        cleanup();
        throw e;
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

function renderCallSheetPrintPage(page, opts) {
  const safePage = normalizeCallSheetPage(page);
  const categories = getCallSheetCategoriesForPage(safePage);
  const columnGroups = buildCallSheetColumns(categories, opts.columns);
  let html = `<section class="cs-print-page ${opts.orientClass} ${opts.colsClass}" data-cs-print-page="${safePage}">`;

  html += '<div class="print-callsheet-grid">';

  columnGroups.forEach((column) => {
    html += '<div class="print-column">';
    column.forEach((cat) => {
      const data = callSheet[cat.id] || { left: [], right: [] };
      html += renderPrintCategory(cat, data, opts.printOptions);
    });
    html += "</div>";
  });

  html += "</div></section>";
  return html;
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

  const headerColor = getCategoryColor(cat);
  const textColor = getCategoryHeaderTextColor(headerColor);

  const note = csNotes[cat.id];

  let html = `
    <div class="print-category">
      <div class="print-category-header" style="background: ${headerColor}; color: ${textColor};">
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

function getCallSheetPrintDensityClass(play, displayOptions, playText) {
  const plainText = String(playText || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const isLandscapePrint = callSheetSettings?.orientation === "landscape";

  let densityScore = plainText.length;
  if (displayOptions.showFormationTags) densityScore += 5;
  if (displayOptions.showTags) densityScore += 5;
  if (displayOptions.showLineCall) densityScore += 6;
  if (displayOptions.showMotion) densityScore += 4;
  if (displayOptions.showProtection) densityScore += 4;
  if (displayOptions.showBack) densityScore += 3;
  if (displayOptions.showPersonnel) densityScore += 3;
  if (play.cellNote) densityScore += Math.min(String(play.cellNote).length, 10);

  if (displayOptions.showOneWordOnly) densityScore -= 18;
  if (play.cellUseOneWord) densityScore -= 10;
  if (isLandscapePrint) densityScore -= 8;

  if (densityScore >= (isLandscapePrint ? 74 : 68)) return "print-play--micro";
  if (densityScore >= (isLandscapePrint ? 63 : 57)) return "print-play--dense";
  if (densityScore >= (isLandscapePrint ? 51 : 46)) return "print-play--compact";
  return "";
}

/**
 * Render a play for print - matches screen display formatting
 */
function renderPrintPlay(play, options) {
  if (!options) options = getCallSheetDisplayOptions();
  const displayOptions = getCallSheetPlayDisplayOptions(play, options);
  const code = getPersonnelCode(play.personnel);
  const bgColor = getPersonnelBgColor(play.personnel);
  const textColor = getPersonnelTextColor(play.personnel);
  const highlightConfig = getCallSheetHighlightConfig(play);
  const isHighlighted = Boolean(highlightConfig);
  const borderColor = getPlayBorderColor(play, options);

  const tempo = (play.tempo || "").toLowerCase();
  let tempoClass = "";
  if (options.highlightHuddle && tempo === "huddle")
    tempoClass = "tempo-huddle";
  else if (options.highlightCandy && tempo === "candy")
    tempoClass = "tempo-candy";

  const playParts = buildCallSheetPlayParts(play, displayOptions);
  const playText = playParts.join(" ");
  const densityClass = getCallSheetPrintDensityClass(
    play,
    displayOptions,
    playText,
  );

  let styles = [];
  const highlightClass = isHighlighted ? "highlighted" : "";
  if (highlightConfig) {
    styles.push(`--cs-highlight-bg: ${highlightConfig.bg};`);
    styles.push(`--cs-highlight-border: ${highlightConfig.border};`);
  }
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

  const personnelHtml = displayOptions.showPersonnel
    ? `<span class="print-inline-code" style="background: ${bgColor}; color: ${textColor};">${code}</span>`
    : "";

  const noteHtml = play.cellNote
    ? `<span class="print-cell-note">[${escapeHtml(play.cellNote)}]</span>`
    : "";

  return `
    <div class="print-play ${highlightClass} ${tempoClass} ${densityClass}" style="${styles.join(" ")}">
      <span class="print-play-text">${personnelHtml}${playText.trim()}${noteHtml}</span>
    </div>
  `;
}

/* toggleCsPanel merged into shared toggleCollapsiblePanel() in utils.js */

// ============ Unified Display Bar Helpers ============

/**
 * Select All / Deselect All field checkboxes
 */
function csSelectAllFields(selectAll) {
  const fieldIds = [
    "callsheetShowNumbers",
    "callsheetShowPersonnel",
    "callsheetShowFormation",
    "callsheetShowFormationTags",
    "callsheetShowBack",
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
  ];
  fieldIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = selectAll;
  });
  const oneWordOnlyEl = document.getElementById("callsheetShowOneWordOnly");
  if (oneWordOnlyEl) oneWordOnlyEl.checked = false;
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
      callsheetShowFormationTags: true,
      callsheetShowBack: true,
      callsheetShowOneWordOnly: false,
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
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowOneWordOnly: false,
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
      callsheetShowFormationTags: true,
      callsheetShowBack: true,
      callsheetShowOneWordOnly: false,
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
      callsheetShowFormationTags: true,
      callsheetShowBack: true,
      callsheetShowOneWordOnly: false,
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
  __print_large_3col: {
    name: "Large Print 3-Column",
    opts: {
      callsheetShowNumbers: false,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowOneWordOnly: false,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: false,
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
  __print_ultra_tight: {
    name: "Print Ultra Tight",
    opts: {
      callsheetShowNumbers: false,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowOneWordOnly: false,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: false,
      callsheetShowLineCall: true,
      callsheetShowEmoji: false,
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
    "__print_ultra_tight",
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
    <div class="cs-sort-modal cs-sort-modal-sm">
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
  storageManager.set(
    STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS,
    captureCallSheetDisplayState(),
  );
}

/**
 * Restore call sheet display option states from localStorage
 */
function restoreCallSheetDisplayOptions() {
  const opts = storageManager.get(STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS, null);
  applyCallSheetDisplayState(opts);
}

/**
 * Schedule autosave for call sheet draft
 */
function scheduleCallSheetAutosave() {
  callSheetAutosaveTimer = queueAutosave(callSheetAutosaveTimer, () => {
    persistDraftData(STORAGE_KEYS.CALLSHEET_DRAFT, {
      callSheet: safeDeepClone(callSheet),
      settings: safeDeepClone(callSheetSettings),
    });
  }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Check for unsaved call sheet draft on init
 */
async function checkCallSheetDraft() {
  try {
    const draft = storageManager.get(STORAGE_KEYS.CALLSHEET_DRAFT, null);
    if (!draft || !getDraftTimestamp(draft)) return;

    if (isDraftExpired(draft)) {
      discardDraftData(STORAGE_KEYS.CALLSHEET_DRAFT);
      return;
    }

    // Check if draft is different from current
    const currentStr = JSON.stringify(callSheet);
    const draftStr = JSON.stringify(draft.callSheet);
    if (currentStr === draftStr) {
      discardDraftData(STORAGE_KEYS.CALLSHEET_DRAFT);
      return;
    }

    const timeStr = formatDraftSavedAt(draft, undefined, {
      fallback: "unknown time",
      formatOptions: {
        hour: "numeric",
        minute: "2-digit",
      },
    });
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
      discardDraftData(STORAGE_KEYS.CALLSHEET_DRAFT);
      showToast("📋 Call sheet draft restored");
    } else {
      discardDraftData(STORAGE_KEYS.CALLSHEET_DRAFT);
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

// ============ Duplicate Detection ============

/**
 * Build a unique key for a play (for duplicate detection)
 */
function csPlayKey(play) {
  return getPlayIdentityKey(play, "core", { normalizeCase: true, trim: false });
}

function getCallSheetUsedPlayKeys() {
  const used = new Set();
  if (!callSheet || typeof callSheet !== "object") return used;

  Object.values(callSheet).forEach((bucket) => {
    if (!bucket) return;
    ["left", "right"].forEach((side) => {
      const list = Array.isArray(bucket[side]) ? bucket[side] : [];
      list.forEach((play) => {
        if (play) used.add(csPlayKey(play));
      });
    });
  });

  return used;
}

/**
 * Re-hydrate every `{...play}` snapshot stored on the call sheet from the
 * master `plays[]` array. Mirrors `refreshGamePlanFromPlaybook()` in
 * gameplan.js — when staff edits a play in the editor or dashboard, the
 * already-placed call sheet entries are stale until re-populated. We match
 * by `csPlayKey` (formation+play+personnel, lowercased) and replace each
 * snapshot with a fresh copy. Snapshots whose key no longer maps to any
 * master play are left as-is (could be a renamed/deleted play). Returns
 * the number of entries refreshed.
 */
function refreshCallSheetFromPlaybook() {
  if (!Array.isArray(plays) || plays.length === 0) return 0;
  if (!callSheet || typeof callSheet !== "object") return 0;
  // Build a quick lookup so we don't do O(n) per entry.
  const byKey = new Map();
  plays.forEach((p) => {
    byKey.set(csPlayKey(p), p);
  });
  let updated = 0;
  Object.keys(callSheet).forEach((catId) => {
    const data = callSheet[catId];
    if (!data) return;
    ["left", "right"].forEach((side) => {
      const arr = data[side];
      if (!Array.isArray(arr)) return;
      arr.forEach((snap, i) => {
        const fresh = byKey.get(csPlayKey(snap));
        if (fresh) {
          // `{ ...snap, ...fresh }` — fresh-wins for any shared key, but
          // call-sheet-only fields tacked on at placement time (e.g.
          // `wristbandNumber`) survive because they don't exist on fresh.
          arr[i] = { ...snap, ...fresh };
          updated += 1;
        }
      });
    });
  });
  if (updated > 0) saveCallSheet();
  return updated;
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
  const cats = getCallSheetCategoriesForPage(page);
  cats.forEach((c) => csCollapsed.add(c.id));
  storageManager.set(STORAGE_KEYS.CALLSHEET_COLLAPSED, [...csCollapsed]);
  renderCallSheet();
}

async function applyCategoryDisplayPreset(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((item) => item.id === categoryId);
  if (!cat) return;

  const scope = await showListPicker(
    `Choose where to apply a display preset for ${getCategoryDisplayName(cat)}.`,
    [
      {
        label: "Left Hash",
        sublabel: "Apply to every play on the left side of this category.",
        value: "left",
      },
      {
        label: "Right Hash",
        sublabel: "Apply to every play on the right side of this category.",
        value: "right",
      },
      {
        label: "Both Hashes",
        sublabel: "Apply to every play in the full category.",
        value: "both",
      },
    ],
    { title: "Bulk Display Scope", icon: "🧩" },
  );
  if (!scope) return;

  const targetPlays = getCallSheetScopePlays(categoryId, scope);
  if (!targetPlays.length) {
    showToast(`No plays in ${getCallSheetScopeLabel(scope)}`);
    return;
  }

  const presetId = await showListPicker(
    "Choose the display preset to apply.",
    CALLSHEET_CELL_DISPLAY_PRESETS.map((preset) => ({
      label: preset.label,
      sublabel: preset.sublabel,
      value: preset.id,
    })),
    { title: "Display Preset", icon: "🎛️" },
  );
  if (!presetId) return;

  const preset = getCallSheetCellDisplayPreset(presetId);
  let appliedCount = 0;
  targetPlays.forEach((play) => {
    if (applyCallSheetCellDisplayPreset(play, presetId)) appliedCount += 1;
  });

  if (!appliedCount) {
    showToast("No eligible plays for that preset", {
      duration: 2500,
      type: "warning",
    });
    return;
  }

  renderCallSheet();
  saveCallSheet();
  showToast(
    `${preset.label} applied to ${appliedCount} play${appliedCount === 1 ? "" : "s"} on ${getCallSheetScopeLabel(scope)}`,
  );
}

async function clearCategoryDisplayOverrides(categoryId) {
  const cat = CALLSHEET_CATEGORIES.find((item) => item.id === categoryId);
  if (!cat) return;

  const scope = await showListPicker(
    `Choose where to clear cell display overrides for ${getCategoryDisplayName(cat)}.`,
    [
      {
        label: "Left Hash",
        sublabel: "Remove cell-level display overrides from the left side only.",
        value: "left",
      },
      {
        label: "Right Hash",
        sublabel: "Remove cell-level display overrides from the right side only.",
        value: "right",
      },
      {
        label: "Both Hashes",
        sublabel: "Remove cell-level display overrides across the full category.",
        value: "both",
      },
    ],
    { title: "Clear Display Overrides", icon: "🧹" },
  );
  if (!scope) return;

  const targetPlays = getCallSheetScopePlays(categoryId, scope);
  let clearedCount = 0;
  targetPlays.forEach((play) => {
    if (hasCallSheetCellDisplayOverrides(play)) {
      clearCallSheetCellDisplayOverrides(play);
      clearedCount += 1;
    }
  });

  if (!clearedCount) {
    showToast(`No cell display overrides on ${getCallSheetScopeLabel(scope)}`);
    return;
  }

  renderCallSheet();
  saveCallSheet();
  showToast(
    `Cleared display overrides on ${clearedCount} play${clearedCount === 1 ? "" : "s"} in ${getCallSheetScopeLabel(scope)}`,
  );
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

  const onSheet = getCallSheetUsedPlayKeys();
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

// ============ Call Sheet Templates ============

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
    displayState: captureCallSheetDisplayState(),
    collapsed: [...csCollapsed],
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
      openTemplatesModal(csTemplateModalMode);
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

let csTemplateModalMode = "manage";

function openLoadCallSheetModal() {
  openTemplatesModal("load");
}

function openTemplatesModal(mode = "manage") {
  csTemplateModalMode =
    mode === "load" ? "load" : mode === "save" ? "save" : "manage";
  const saved = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
  const isLoadMode = csTemplateModalMode === "load";
  const title = isLoadMode ? "📂 Load Call Sheet" : "📁 Saved Call Sheets";
  const modalCopy = isLoadMode
    ? "Choose a saved call sheet to replace the current one. Saved call sheets restore plays, layout, notes, targets, and display settings."
    : "Save the current call sheet or load one of your saved call sheets below.";

  const listHtml =
    saved.length === 0
      ? `<div class="empty-state cs-template-empty">${isLoadMode ? "No saved call sheets yet. Save the current sheet first, then load it here later." : "No saved call sheets yet. Save the current sheet to build your library."}</div>`
      : saved
        .map((t, idx) => {
          const date = new Date(t.savedAt).toLocaleDateString();
          return `<div class="cs-template-item">
          <div class="cs-template-info">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="cs-template-date">${date} · ${t.playCount || 0} plays</span>
          </div>
          <div class="cs-template-actions">
            <button class="btn btn-sm btn-primary" data-action="loadTemplate" data-idx="${idx}">${isLoadMode ? "Load Call Sheet" : "Load"}</button>
            <button class="btn btn-sm btn-danger" data-action="deleteTemplate" data-idx="${idx}">Delete</button>
          </div>
        </div>`;
        })
        .join("");

  const modalHtml = `
    <div id="csTemplateOverlay" class="cs-sort-overlay">
      <div class="cs-sort-modal cs-sort-modal-lg cs-template-modal">
        <div class="cs-sort-header">
          <div>
            <h3>${title}</h3>
            <p class="cs-template-copy">${modalCopy}</p>
          </div>
          <button class="cs-sort-close" data-action="closeTemplateModal">&times;</button>
        </div>
        <div class="cs-sort-body">
          <div class="cs-template-section-head">
            <div>
              <h4>Saved Call Sheets</h4>
              <p>${saved.length === 0 ? "No saved call sheets yet." : `${saved.length} saved call sheet${saved.length === 1 ? "" : "s"} available.`}</p>
            </div>
            ${saved.length > 0 && isLoadMode ? '<button class="btn btn-sm" data-action="openTemplatesModal" data-arg="manage">Manage Saves</button>' : ""}
          </div>
          <div class="cs-template-list">${listHtml}</div>
          <div class="cs-template-save-panel">
            <div class="cs-template-section-head">
              <div>
                <h4>Save Current Call Sheet</h4>
                <p>Create a reusable saved call sheet with the current plays, layout, notes, and display setup.</p>
              </div>
            </div>
            <div class="cs-template-save-row">
              <input type="text" id="csTemplateName" class="cs-template-name-input" placeholder="Call sheet name (e.g. vs. 4-3 Team)">
              <button class="btn btn-sm btn-primary" data-action="saveCallSheetTemplate">💾 Save Current</button>
            </div>
          </div>
        </div>
        <div class="cs-sort-actions">
          <button class="btn btn-sm" data-action="closeTemplateModal">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const nameInput = document.getElementById("csTemplateName");
  if (nameInput && csTemplateModalMode === "save") {
    nameInput.focus();
    nameInput.select();
  }
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
    if (template.settings)
      callSheetSettings = {
        ...getDefaultCallSheetSettings(),
        ...template.settings,
      };
    rebuildCallSheetCategoryRegistry();
    syncCallSheetCategoryData();
    if (template.notes) csNotes = template.notes;
    if (template.targets) csTargets = template.targets;
    csCategoryOrder = normalizeCallSheetCategoryOrder(template.categoryOrder);
    csCollapsed = new Set(Array.isArray(template.collapsed) ? template.collapsed : []);

    if (template.displayState) {
      applyCallSheetDisplayState(template.displayState);
      storageManager.set(
        STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS,
        template.displayState,
      );
    } else {
      saveCallSheetDisplayOptions();
    }

    saveCallSheet();
    saveCallSheetSettings();
    storageManager.set(STORAGE_KEYS.CALLSHEET_NOTES, csNotes);
    storageManager.set(STORAGE_KEYS.CALLSHEET_TARGETS, csTargets);
    storageManager.set(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, csCategoryOrder);
    storageManager.set(STORAGE_KEYS.CALLSHEET_COLLAPSED, [...csCollapsed]);

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
  openTemplatesModal(csTemplateModalMode);
  showToast(`🗑️ Deleted "${name}"`);
}

/**
 * Smart reorder: arrange categories so the tallest ones are spread across columns
 * to produce the most balanced, print-friendly layout.
 */
function smartReorderCategories() {
  const page = callSheetSettings.currentPage;
  const baseCats = getCallSheetCategoriesForPage(page);

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
  persistCallSheetCategoryOrder();
  renderCallSheet();
  showToast("🧩 Categories reordered for best layout");
}

function resetCategoryOrder() {
  csCategoryOrder = getDefaultCallSheetCategoryOrder();
  persistCallSheetCategoryOrder();
  renderCallSheet();
  showToast("↩️ Call sheet layout reset to default");
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
          <button class="custom-order-btn custom-order-btn-compact" data-action="openCsCustomOrderModal" data-arg="${criteria.field}" title="${customTitle}">${customIcon}</button>
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
    const pageCategories = getCallSheetCategoriesForPage(
      callSheetSettings.currentPage,
    );
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

// Alias — overlay-close dispatcher strips "Overlay" suffix before calling
function toggleScouting() {
  toggleScoutingOverlay();
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
    <div id="csSuggestOverlay" class="modal-overlay show">
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
    highlightColor: null,
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

function getCallSheetPlayLocations(play) {
  const locations = [];

  CALLSHEET_CATEGORIES.forEach((cat) => {
    const data = callSheet[cat.id];
    if (!data) return;

    if ((data.left || []).some((entry) => playsMatch(entry, play))) {
      locations.push(`${getCategoryDisplayName(cat)} - Left`);
    }
    if ((data.right || []).some((entry) => playsMatch(entry, play))) {
      locations.push(`${getCategoryDisplayName(cat)} - Right`);
    }
  });

  return locations;
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
  a.download = typeof getPrintStudioExportName === "function"
    ? getPrintStudioExportName("Call-Sheet", "", "csv")
    : `call_sheet_${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`📥 Exported call sheet to CSV`, {
    duration: 3000,
    type: "success",
  });
}
