// Call Sheet functionality
// Note: CS_COLORS, CALLSHEET_FRONT, CALLSHEET_BACK, CS_SEVEN_ON_SEVEN_CATEGORIES,
// and related render/display constants are defined in callsheet-render.js and loaded before this file

const CALLSHEET_PLAYER_AUTOFILL_MIN = 6;
const CALLSHEET_PERSONNEL_MARKERS = {
  navy: "⚓",
  meat: "🥩",
  marc: "☠️",
};
const CALLSHEET_PERSONNEL_COLORS = {
  navy: "#192a51",
  meat: "#7f1d1d",
  marc: "#475569",
};

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

function getHiddenCallSheetCategoryIds(settings = callSheetSettings) {
  return new Set(
    Array.isArray(settings?.hiddenCategoryIds)
      ? settings.hiddenCategoryIds.filter((id) => typeof id === "string")
      : [],
  );
}

function rebuildCallSheetCategoryRegistry() {
  const customCategories = getCustomCallSheetCategoriesFromSettings();
  const nextFront = [
    ...BASE_CALLSHEET_FRONT.map((cat) => ({ ...cat })),
    ...customCategories.front.map((cat) => ({
      ...cat,
      custom: true,
      manual: cat.manual !== false,
    })),
  ];
  const nextBack = [
    ...BASE_CALLSHEET_BACK.map((cat) => ({ ...cat })),
    ...customCategories.back.map((cat) => ({
      ...cat,
      custom: true,
      manual: cat.manual !== false,
    })),
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
  return ["front", "back", "personnel"].includes(page) ? page : "front";
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
    hiddenCategoryIds: Array.isArray(merged.hiddenCategoryIds)
      ? merged.hiddenCategoryIds.filter((id) => typeof id === "string")
      : [],
    allowedPlayTypes: Array.isArray(merged.allowedPlayTypes)
      ? merged.allowedPlayTypes.filter((type) => typeof type === "string")
      : [],
    wristbandAutoCategoryId:
      typeof merged.wristbandAutoCategoryId === "string"
        ? merged.wristbandAutoCategoryId
        : "",
  };
}

function normalizeCallSheetCategoryOrder(order) {
  const defaults = getDefaultCallSheetCategoryOrder();
  const hiddenIds = getHiddenCallSheetCategoryIds();
  const validIds = new Set(
    CALLSHEET_CATEGORIES
      .filter((cat) => !hiddenIds.has(cat.id))
      .map((cat) => cat.id),
  );
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
    if (placed.has(cat.id) || hiddenIds.has(cat.id)) return;
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
    hiddenCategoryIds: [],
    allowedPlayTypes: [],
    wristbandAutoCategoryId: "",
  };
}

let callSheetSettings = getDefaultCallSheetSettings();

// Current edit state
let editingCategory = null;
let editingHash = null;

// Autosave timer
let callSheetAutosaveTimer = null;
let callSheetHistoryBaseline = null;
let callSheetHistoryBaselineJson = "";

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

// Display constants are defined in callsheet-render.js and shared globally.

function hasCallSheetCellDisplayOverrides(play) {
  return CALLSHEET_CELL_DISPLAY_OVERRIDE_PROPS.some((prop) => Boolean(play[prop]));
}

function clearCallSheetCellDisplayOverrides(play) {
  CALLSHEET_CELL_DISPLAY_OVERRIDE_PROPS.forEach((prop) => {
    delete play[prop];
  });
}

function copyPlayForCallSheet(play, overrides = {}) {
  const callSheetFields = {
    playType: play?.type || "",
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
    cellFormationTags: null,
    cellBackTags: null,
    ...overrides,
  };
  if (typeof copyPlayWithSourceIdentity === "function") {
    return copyPlayWithSourceIdentity(play, callSheetFields);
  }
  return {
    ...play,
    playbookId: play?.playbookId || play?.sourcePlayId || play?.id || null,
    mediaId: typeof getPlayMediaId === "function"
      ? getPlayMediaId(play)
      : String(play?.mediaId || "").trim(),
    ...callSheetFields,
  };
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
      const displayText = formatPlayCallText(text, options);
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

    resetCallSheetHistoryBaseline();
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
    let excluded = 0;

    // Build a unique key for a play (formation + play name + personnel)
    const playKey = (p) => csPlayKey(p);

    const playerTargets = buildPlayerCategoryAutoFillTargets(plays);

    // Go through each play and categorize
    plays.forEach((play, playIndex) => {
      if (!isCallSheetPlayAllowed(play)) {
        excluded++;
        return;
      }
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
        const playWithNum = typeof copyPlayForCallSheet === "function"
          ? copyPlayForCallSheet(play, { wristbandNumber: getWristbandNumberForPlay(play) })
          : { ...play, wristbandNumber: getWristbandNumberForPlay(play) };

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

    const wristbandSynced =
      typeof syncLoadedWristbandToCallSheetCategory === "function"
        ? syncLoadedWristbandToCallSheetCategory()
        : 0;
    totalPlaced += wristbandSynced;

    renderCallSheet();
    saveCallSheet();

    const eligibleCount = plays.length - excluded;
    let msg = `⚡ Placed ${totalPlaced} entries from ${eligibleCount} eligible plays`;
    if (unmatched > 0) {
      msg += ` (${unmatched} unmatched)`;
    }
    if (excluded > 0) {
      msg += ` (${excluded} excluded by template)`;
    }
    if (wristbandSynced > 0) {
      msg += ` • ${wristbandSynced} wristband passes synced`;
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

function resetCallSheetHistoryBaseline() {
  callSheetHistoryBaseline = safeDeepClone(callSheet);
  callSheetHistoryBaselineJson = JSON.stringify(callSheetHistoryBaseline);
  historyManager.clear("callsheet");
}

function saveCallSheetState() {
  const currentState = safeDeepClone(callSheet);
  const currentJson = JSON.stringify(currentState);
  if (_csUndoInProgress) {
    callSheetHistoryBaseline = currentState;
    callSheetHistoryBaselineJson = currentJson;
    return;
  }
  if (callSheetHistoryBaseline === null) {
    callSheetHistoryBaseline = currentState;
    callSheetHistoryBaselineJson = currentJson;
    return;
  }
  if (currentJson === callSheetHistoryBaselineJson) return;

  historyManager.saveState("callsheet", callSheetHistoryBaseline);
  callSheetHistoryBaseline = currentState;
  callSheetHistoryBaselineJson = currentJson;
}

function saveCallSheet() {
  saveCallSheetState();
  storageManager.set(STORAGE_KEYS.CALL_SHEET, callSheet);
  if (typeof updateSaveStatus === "function") updateSaveStatus("saved");
  scheduleCallSheetAutosave();
  // Persist constraints snapshot alongside call sheet
  if (typeof saveConstraintsSnapshot === "function") saveConstraintsSnapshot();
  // Record artifact modified timestamp (#38)
  if (typeof recordArtifactModified === "function") recordArtifactModified("callsheet");
  if (typeof refreshCallSheetGamePlanDrawer === "function") {
    refreshCallSheetGamePlanDrawer();
  }
}

function getCallSheetPlayCoverageValues(play) {
  if (typeof splitCoverageValues === "function") {
    return splitCoverageValues(play.practiceCoverage);
  }
  const raw = play?.practiceCoverage;
  if (!raw) return [];
  return String(raw)
    .split(/[,|;\/]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function undoCallSheet() {
  const prev = historyManager.undo("callsheet", safeDeepClone(callSheet));
  if (prev) {
    _csUndoInProgress = true;
    callSheet = prev;
    callSheetHistoryBaseline = safeDeepClone(callSheet);
    callSheetHistoryBaselineJson = JSON.stringify(callSheetHistoryBaseline);
    storageManager.set(STORAGE_KEYS.CALL_SHEET, callSheet);
    scheduleCallSheetAutosave();
    if (typeof saveConstraintsSnapshot === "function") saveConstraintsSnapshot();
    renderCallSheet();
    _csUndoInProgress = false;
  }
}

function redoCallSheet() {
  const next = historyManager.redo("callsheet", safeDeepClone(callSheet));
  if (next) {
    _csUndoInProgress = true;
    callSheet = next;
    callSheetHistoryBaseline = safeDeepClone(callSheet);
    callSheetHistoryBaselineJson = JSON.stringify(callSheetHistoryBaseline);
    storageManager.set(STORAGE_KEYS.CALL_SHEET, callSheet);
    scheduleCallSheetAutosave();
    if (typeof saveConstraintsSnapshot === "function") saveConstraintsSnapshot();
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

/* toggleCsPanel merged into shared toggleCollapsiblePanel() in utils.js */

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

// ============ Duplicate Detection ============

/**
 * Build a unique key for a play (for duplicate detection)
 */
function csPlayKey(play) {
  return typeof getPlayCompareKey === "function"
    ? getPlayCompareKey(play, "core")
    : getPlayIdentityKey(play, "core", { normalizeCase: true, trim: false });
}

function getCallSheetUsedPlayKeys() {
  const used = new Set();
  if (!callSheet || typeof callSheet !== "object") return used;

  Object.values(callSheet).forEach((bucket) => {
    if (!bucket) return;
    ["left", "right"].forEach((side) => {
      const list = Array.isArray(bucket[side]) ? bucket[side] : [];
      list.forEach((play) => {
        if (play && !play._blank) used.add(csPlayKey(play));
      });
    });
  });

  return used;
}

/**
 * Re-hydrate every `{...play}` snapshot stored on the call sheet from the
 * master `plays[]` array. Mirrors `refreshGamePlanFromPlaybook()` in
 * gameplan.js — when staff edits a play in the editor or dashboard, the
 * already-placed call sheet entries are stale until re-populated. A linked
 * snapshot resolves by its immutable source ID first, then uses `csPlayKey`
 * only as a legacy fallback. Snapshots with neither match are left as-is
 * (could be a deleted play). Returns the number of entries refreshed.
 */
function refreshCallSheetFromPlaybook() {
  if (!Array.isArray(plays) || plays.length === 0) return 0;
  if (!callSheet || typeof callSheet !== "object") return 0;
  // Keep a legacy comparison map for imported sheets, but a placed play's
  // source ID is authoritative. Play-call fields can change after placement
  // (or differ on a linked surface), while the source ID and media pointer do
  // not. Matching by display fields first is how a stale snapshot survives a
  // legitimate edit.
  const bySourceId = new Map(
    plays
      .filter((play) => play && String(play.id || "").trim())
      .map((play) => [String(play.id).trim(), play]),
  );
  const byKey = new Map();
  plays.forEach((p) => {
    byKey.set(csPlayKey(p), p);
  });
  const getLocalOverrides = (snapshot) => {
    const fields = [
      "playType", "wristbandNumber", "highlighted", "highlightColor",
      "borderColor", "cellBg", "cellTextColor", "cellBold", "cellItalic",
      "cellUnderline", "cellStrikethrough", "cellFontSize", "cellNote",
      "cellFormationTags", "cellBackTags",
    ];
    return fields.reduce((overrides, field) => {
      if (Object.prototype.hasOwnProperty.call(snapshot || {}, field)) {
        overrides[field] = snapshot[field];
      }
      return overrides;
    }, {});
  };
  let updated = 0;
  Object.keys(callSheet).forEach((catId) => {
    const data = callSheet[catId];
    if (!data) return;
    ["left", "right"].forEach((side) => {
      const arr = data[side];
      if (!Array.isArray(arr)) return;
      arr.forEach((snap, i) => {
        const sourceId = typeof getStablePlaySourceId === "function"
          ? getStablePlaySourceId(snap)
          : String(snap?.playbookId || snap?.sourcePlayId || "").trim();
        const fresh = (sourceId && bySourceId.get(sourceId)) || byKey.get(csPlayKey(snap));
        if (fresh) {
          arr[i] = typeof copyPlayForCallSheet === "function"
            ? copyPlayForCallSheet(fresh, getLocalOverrides(snap))
            : { ...snap, ...fresh };
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
      if (!play || play._blank) return;
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

// ============ Not On Sheet + Source Reconcile (#162-165) ============

function toggleNotOnSheet() {
  const panel = document.getElementById("csNotOnSheetPanel");
  if (!panel) return;
  const isHidden = panel.classList.contains("hidden");
  panel.classList.toggle("hidden");
  if (isHidden) updateNotOnSheetPanel();
}

function updateNotOnSheetPanel(tab) {
  const panel = document.getElementById("csNotOnSheetPanel");
  if (!panel) return;
  if (tab) panel.dataset.tab = tab;
  const activeTab = panel.dataset.tab || "playbook";

  const onSheet = getCallSheetUsedPlayKeys();

  // --- Tab counts ---
  // Playbook: playbook plays not on CS
  const pbMissing = plays.filter((p) => !onSheet.has(csPlayKey(p)));

  // GP: game plan plays not on CS (#163)
  const gpMissing = [];
  try {
    const board = _gpEnsureBoard();
    const seen = new Set();
    Object.values(board.assignments || {}).forEach((boxPlays) => {
      (boxPlays || []).forEach((p) => {
        const k = csPlayKey(p);
        if (!seen.has(k)) {
          seen.add(k);
          if (!onSheet.has(k)) gpMissing.push(p);
        }
      });
    });
  } catch (_) { /* benign: Game Plan module/board may not be loaded yet */ }

  // Wristband: wristband plays not on CS (#164)
  const wbMissing = [];
  try {
    if (typeof wristbandCards !== "undefined") {
      const seen = new Set();
      wristbandCards.forEach((card) => {
        (card.data || []).forEach((p) => {
          if (p && p.play) {
            const k = csPlayKey(p);
            if (!seen.has(k)) {
              seen.add(k);
              if (!onSheet.has(k)) wbMissing.push(p);
            }
          }
        });
      });
    }
  } catch (_) { /* benign: wristband module may not be loaded yet */ }

  // Stale: CS plays not in the playbook (#165)
  const stale = [];
  try {
    const allPlayKeys = new Set(plays.map((p) => csPlayKey(p)));
    Object.entries(callSheet).forEach(([catId, cat]) => {
      [...(cat.left || []), ...(cat.right || [])].forEach((p) => {
        if (!allPlayKeys.has(csPlayKey(p))) stale.push({ play: p, catId });
      });
    });
  } catch (_) { /* benign: playbook may be empty/unloaded */ }

  // --- Tab bar ---
  const tabs = [
    { id: "playbook", label: "📚 Playbook", count: pbMissing.length },
    { id: "gp", label: "📋 GP", count: gpMissing.length },
    { id: "wristband", label: "📟 Wristband", count: wbMissing.length },
    { id: "stale", label: "⚠️ Stale", count: stale.length },
  ];

  let html = `<div class="cs-nos-header"><div class="cs-nos-tabs">`;
  tabs.forEach((t) => {
    const isCurrent = t.id === activeTab;
    const badge = t.count > 0 ? ` <span class="cs-nos-badge">${t.count}</span>` : "";
    html += `<button class="cs-nos-tab${isCurrent ? " active" : ""}" data-action="switchCsReconcileTab" data-arg="${t.id}">${t.label}${badge}</button>`;
  });
  html += `</div><button class="btn btn-xs cs-nos-close" data-action="toggleNotOnSheet" title="Close">✕</button></div>`;

  // --- Tab content ---
  if (activeTab === "playbook") {
    html += _renderCsNosPlays(pbMissing, "All playbook plays are on the call sheet!", "📚 Missing from Playbook");
  } else if (activeTab === "gp") {
    html += _renderCsNosPlays(gpMissing, "All Game Plan plays are on the call sheet!", "📋 GP Plays Not on Call Sheet");
  } else if (activeTab === "wristband") {
    html += _renderCsNosPlays(wbMissing, "All wristband plays are on the call sheet!", "📟 Wristband Plays Not on Call Sheet");
  } else if (activeTab === "stale") {
    if (stale.length === 0) {
      html += `<div class="cs-nos-empty">✅ No stale plays — all sheet plays exist in the playbook.</div>`;
    } else {
      html += `<div class="cs-nos-count">⚠️ ${stale.length} plays on the sheet no longer exist in the playbook:</div>`;
      stale.forEach(({ play: p, catId }) => {
        const cat = [...CALLSHEET_FRONT, ...CALLSHEET_BACK].find((c) => c.id === catId);
        const catName = cat ? getCategoryDisplayName(cat) : catId;
        html += `<div class="cs-nos-play cs-nos-stale">
          <span class="cs-nos-stale-cat">${escapeHtml(catName)}</span>
          ${escapeHtml(p.formation || "")} ${escapeHtml(p.play || "")}
        </div>`;
      });
    }
  }

  panel.innerHTML = html;
}

function switchCsReconcileTab(tab) {
  updateNotOnSheetPanel(tab);
}

function _renderCsNosPlays(missing, emptyMsg, heading) {
  if (missing.length === 0) {
    return `<div class="cs-nos-empty">✅ ${emptyMsg}</div>`;
  }
  const groups = {};
  missing.forEach((p) => {
    const t = p.type || "Unknown";
    if (!groups[t]) groups[t] = [];
    groups[t].push(p);
  });
  let html = `<div class="cs-nos-count">${heading}: ${missing.length} plays</div>`;
  Object.entries(groups)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([type, typePlays]) => {
      html += `<details><summary>${escapeHtml(type)} (${typePlays.length})</summary><div class="cs-nos-list">`;
      typePlays.forEach((p) => {
        const code = getPersonnelCode(p.personnel);
        const bg = getPersonnelBgColor(p.personnel);
        const tc = getPersonnelTextColor(p.personnel);
        html += `<div class="cs-nos-play">
          <span class="personnel-code" style="background: ${bg}; color: ${tc};">${escapeHtml(code)}</span>
          ${escapeHtml(p.formation || "")} ${escapeHtml(p.play || "")}
        </div>`;
      });
      html += `</div></details>`;
    });
  return html;
}

// ============ Source Status Bar (#159-161) ============

function updateCSSourceBar() {
  const bar = document.getElementById("csSourceBar");
  if (!bar) return;

  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  if (!gw || !gw.opponentName) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");

  // GP: count unique plays across all GP boxes for this opponent
  let gpOnCS = 0, gpTotal = 0;
  try {
    const board = _gpEnsureBoard();
    const seen = new Set();
    Object.values(board.assignments || {}).forEach((boxPlays) => {
      (boxPlays || []).forEach((p) => {
        const k = csPlayKey(p);
        if (!seen.has(k)) {
          seen.add(k);
          gpTotal++;
          if (isPlayOnCallSheet(p)) gpOnCS++;
        }
      });
    });
  } catch (_) { /* benign: Game Plan board unavailable */ }

  // Script: count script plays on CS
  let scriptOnCS = 0, scriptTotal = 0;
  try {
    if (typeof script !== "undefined") {
      const rows = script.filter((s) => !s.isSeparator);
      scriptTotal = rows.length;
      scriptOnCS = rows.filter((p) => isPlayOnCallSheet(p)).length;
    }
  } catch (_) { /* benign: script module may not be loaded */ }

  // Wristband: loaded name from display element
  let wbName = "";
  try {
    const wbEl = document.getElementById("loadedWristbandDisplay");
    wbName = wbEl ? wbEl.textContent.trim() : "";
  } catch (_) { /* benign: display element not present */ }

  const gpIcon = gpTotal === 0 ? "—" : gpOnCS === gpTotal ? "✅" : "⚠️";
  const scrIcon = scriptTotal === 0 ? "—" : scriptOnCS === scriptTotal ? "✅" : "⚠️";

  bar.innerHTML = `
    <span class="csb-opponent">📅 ${escapeHtml(gw.opponentName)}${gw.week ? ` · Wk ${escapeHtml(String(gw.week))}` : ""}</span>
    <span class="csb-sep" aria-hidden="true">|</span>
    <span class="csb-item" title="Game Plan plays currently on this call sheet">${gpIcon} GP: ${gpOnCS}/${gpTotal}</span>
    <span class="csb-sep" aria-hidden="true">|</span>
    <span class="csb-item" title="Script plays currently on this call sheet">${scrIcon} Script: ${scriptOnCS}/${scriptTotal}</span>
    <span class="csb-sep" aria-hidden="true">|</span>
    <span class="csb-item csb-wb" title="Loaded wristband">📟 ${wbName ? escapeHtml(wbName) : "<em>No wristband</em>"}</span>
    <button class="btn btn-xs csb-finalize-btn" data-action="finalizeWeek" title="Validate and save game-day snapshot">🏁 Finalize</button>
  `;
}

// ============ Finalize Week (#171-175) ============

async function finalizeWeek() {
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const issues = [];
  const checks = [];

  // #172: Critical situation buckets must have plays
  const CRITICAL_CATS = [
    { id: "3rd-long", label: "3rd & Long" },
    { id: "3rd-medium", label: "3rd & Medium" },
    { id: "3rd-short-1-3", label: "3rd & Short" },
    { id: "rz-20", label: "Red Zone (20)" },
    { id: "short-yardage", label: "Short Yardage" },
    { id: "goal-line", label: "Goal Line" },
    { id: "backed-up", label: "Backed Up" },
    { id: "2-minute", label: "2-Minute" },
  ];
  for (const { id, label } of CRITICAL_CATS) {
    const cat = callSheet[id];
    const count = cat ? (cat.left || []).length + (cat.right || []).length : 0;
    if (count === 0) {
      issues.push(`<li>⚠️ <strong>${escapeHtml(label)}</strong> — no plays assigned</li>`);
    } else {
      checks.push(`<li>✅ ${escapeHtml(label)}: ${count} play${count !== 1 ? "s" : ""}</li>`);
    }
  }

  // #173: Wristband should be loaded
  const wbEl = document.getElementById("loadedWristbandDisplay");
  const wbName = wbEl ? wbEl.textContent.trim() : "";
  if (!wbName) {
    issues.push("<li>⚠️ No wristband loaded for this sheet</li>");
  } else {
    checks.push(`<li>✅ Wristband: ${escapeHtml(wbName)}</li>`);
  }

  // #174: No stale plays (plays in CS but deleted from playbook)
  const allPlayKeys = new Set(plays.map((p) => csPlayKey(p)));
  let stalePlays = 0;
  Object.values(callSheet).forEach((cat) => {
    [...(cat.left || []), ...(cat.right || [])].forEach((p) => {
      if (!allPlayKeys.has(csPlayKey(p))) stalePlays++;
    });
  });
  if (stalePlays > 0) {
    issues.push(`<li>⚠️ ${stalePlays} play${stalePlays !== 1 ? "s" : ""} on the sheet no longer exist in the playbook</li>`);
  } else {
    checks.push("<li>✅ No stale/removed plays on the sheet</li>");
  }

  const hasIssues = issues.length > 0;
  const issueBlock = hasIssues
    ? `<div class="cs-finalize-issues"><strong>Issues to review:</strong><ul>${issues.join("")}</ul></div>`
    : "";
  const checkBlock = checks.length
    ? `<div class="cs-finalize-checks"><ul>${checks.join("")}</ul></div>`
    : "";
  const prompt = hasIssues
    ? "<p>Save a game-day snapshot anyway?</p>"
    : "<p>Everything looks good — save game-day snapshot?</p>";

  const confirmed = await showConfirm(issueBlock + checkBlock + prompt, {
    title: "🏁 Finalize Week" + (gw && gw.opponentName ? ` — vs ${escapeHtml(gw.opponentName)}` : ""),
    confirmText: "📸 Save Snapshot",
    cancelText: "Cancel",
  });
  if (!confirmed) return;

  // #175: Save locked game-day snapshot
  const opponent = gw && gw.opponentName ? gw.opponentName : "Unknown";
  const week = gw && gw.week ? ` Wk ${gw.week}` : "";
  const dateStr = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const snapName = `🏁 vs ${opponent}${week} — ${dateStr}`;

  const snaps = storageManager.get(STORAGE_KEYS.CALLSHEET_SNAPSHOTS, []);
  snaps.push({
    id: `snap_${Date.now()}`,
    name: snapName,
    data: safeDeepClone(callSheet),
    settings: safeDeepClone(callSheetSettings),
    savedAt: new Date().toISOString(),
    opponent,
    week: gw && gw.week ? gw.week : "",
    issueCount: issues.length,
  });
  // Keep last 10 snapshots
  while (snaps.length > 10) snaps.shift();
  storageManager.set(STORAGE_KEYS.CALLSHEET_SNAPSHOTS, snaps);

  showToast(`📸 Snapshot saved: ${snapName}`, { duration: 4000, type: "success" });
  updateCSSourceBar();
}
