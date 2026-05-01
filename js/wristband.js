// Wristband Maker functionality

// Wristband constants and state
const WB_ROWS = 20;
const MAX_CARDS = 5;
let wristbandCards = [];
let currentCardIndex = 0;
let selectedWristbandPlay = null;
let wristbandHeaderColor = "transparent";
let wbSelectedTempos = [];
let wbSelectedPersonnel = [];
let wbFiltersCollapsed = true;
let wbFavorites = normalizeWbFavorites(
  storageManager.get(STORAGE_KEYS.WRISTBAND_FAVORITES, []),
);

// Cell customization storage: { "cardIdx-cellIdx": { bgColor, textColor, markers, markerPlacement, cadence, extraPersonnel, preShift, formationTags, backTags } }
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

function getCellMarkerValue(custom) {
  return custom.cadence || (custom.onTwo ? "$" : "");
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

/** Get custom extra personnel prefix for a wristband cell */
function getCustomPersonnelPrefix(custom, opts) {
  if (!custom || !custom.extraPersonnel) return "";
  const tag = String(custom.extraPersonnel).trim();
  if (!tag) return "";
  const emoji = opts.showEmoji ? getPersonnelEmoji(tag, opts.useSquares) : "";
  return emoji ? `${emoji} ` : `${escapeHtml(tag)} `;
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

/** Build line-call-only display: emoji prefix + bold line call (no brackets) */
function getLineCallOnlyDisplay(play, opts) {
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
  const lineCall = play.lineCall ? escapeHtml(play.lineCall) : "";
  return lineCall ? `${prefix}<b>${lineCall}</b>` : prefix.trim();
}

// Arrow key highlight index in cell popup
let highlightedPlayIndex = -1;

// Autosave timer
let wristbandAutosaveTimer = null;

function scheduleWristbandAutosave() {
  wristbandAutosaveTimer = queueAutosave(
    wristbandAutosaveTimer,
    () => {
      const totalPlays = wristbandCards.reduce(
        (sum, card) => sum + (card.data ? card.data.filter((play) => play !== null).length : 0),
        0,
      );

      if (totalPlays === 0) {
        discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
        if (typeof updateSaveStatus === "function") updateSaveStatus("saved");
        return;
      }

      persistDraftData(STORAGE_KEYS.WRISTBAND_DRAFT, {
        headerColor: wristbandHeaderColor,
        cards: safeDeepClone(wristbandCards),
        cellStyles: safeDeepClone(cellCustomizations),
        favorites: safeDeepClone(wbFavorites),
        displaySettings: getWristbandDisplayOptions(),
        currentCardIndex,
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
    const draft = storageManager.get(STORAGE_KEYS.WRISTBAND_DRAFT, null);
    if (!draft || !draft.cards || draft.cards.length === 0) return;

    if (isDraftExpired(draft)) {
      discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
      return;
    }

    const draftPlays = draft.cards.reduce(
      (sum, c) => sum + (c.data ? c.data.filter((p) => p !== null).length : 0),
      0,
    );
    if (draftPlays === 0) return;

    // Only offer if current wristband is empty
    const currentPlays = wristbandCards.reduce(
      (sum, c) => sum + (c.data ? c.data.filter((p) => p !== null).length : 0),
      0,
    );
    if (currentPlays > 0) return;

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
      hydrateWristbandState(draft, { markDirty: true });
      showToast("🃏 Draft restored");
    } else {
      discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
    }
  } catch (err) {
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
  const normalized = {
    bgColor: custom.bgColor || "",
    textColor: custom.textColor || UI_COLORS.textBlack,
    markers: Array.isArray(custom.markers)
      ? custom.markers.filter(Boolean)
      : [],
    markerPlacement: custom.markerPlacement || "prefix",
    extraPersonnel: String(custom.extraPersonnel || "").trim(),
    preShift: String(custom.preShift || "").trim(),
    formationTags: Array.isArray(custom.formationTags)
      ? custom.formationTags
          .map((entry) => normalizeCustomTagEntry(entry))
          .filter(Boolean)
      : [],
    backTags: Array.isArray(custom.backTags)
      ? custom.backTags
          .map((entry) => normalizeCustomTagEntry(entry))
          .filter(Boolean)
      : [],
  };

  const hasValue =
    normalized.bgColor ||
    normalized.textColor !== UI_COLORS.textBlack ||
    normalized.markers.length > 0 ||
    normalized.extraPersonnel ||
    normalized.preShift ||
    normalized.formationTags.length > 0 ||
    normalized.backTags.length > 0;

  return hasValue ? normalized : null;
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
      for (let cellIdx = 0; cellIdx < 40; cellIdx++) {
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
    wristbandCards = previousState.cards;
    cellCustomizations = previousState.customizations;
    currentCardIndex = previousState.currentCardIndex;
    renderCardTabs();
    renderWristbandGrid();
  }
}

/**
 * Redo last undone wristband action
 */
function redoWristband() {
  const futureState = historyManager.redo("wristband", getWristbandState());
  if (futureState) {
    wristbandCards = futureState.cards;
    cellCustomizations = futureState.customizations;
    currentCardIndex = futureState.currentCardIndex;
    renderCardTabs();
    renderWristbandGrid();
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
    "wbShowLineCall",
    "wbHighlightHuddle",
    "wbHighlightCandy",
  ];
}

/**
 * Select all display options for wristband
 */
function selectAllWbOptions() {
  getWbDisplayOptionIds().forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });
  refreshWristbandEditorView();
}

/**
 * Clear all display options for wristband
 */
function clearAllWbOptions() {
  getWbDisplayOptionIds().forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  refreshWristbandEditorView();
}

/**
 * Apply display preset (Minimal/Standard/Full)
 */
function applyWbDisplayPreset(preset) {
  // Minimal: only Show Line Call
  const minimal = {
    wbShowEmoji: false,
    wbUseSquares: false,
    wbUnderEmoji: false,
    wbBoldShifts: false,
    wbRedShifts: false,
    wbItalicMotions: false,
    wbRedMotions: false,
    wbRemoveVowels: false,
    wbShowLineCall: true,
    wbLineCallOnly: false,
    wbCadenceReminder: false,
    wbHighlightHuddle: false,
    wbHighlightCandy: false,
  };

  // Standard: emoji + show line call (good for most users)
  const standard = {
    wbShowEmoji: true,
    wbUseSquares: false,
    wbUnderEmoji: false,
    wbBoldShifts: false,
    wbRedShifts: false,
    wbItalicMotions: false,
    wbRedMotions: false,
    wbRemoveVowels: false,
    wbShowLineCall: true,
    wbLineCallOnly: false,
    wbCadenceReminder: false,
    wbHighlightHuddle: false,
    wbHighlightCandy: false,
  };

  // Full: all options on
  const full = {
    wbShowEmoji: true,
    wbUseSquares: true,
    wbUnderEmoji: true,
    wbBoldShifts: true,
    wbRedShifts: true,
    wbItalicMotions: true,
    wbRedMotions: true,
    wbRemoveVowels: false,
    wbShowLineCall: true,
    wbLineCallOnly: false,
    wbCadenceReminder: true,
    wbHighlightHuddle: true,
    wbHighlightCandy: true,
  };

  const presets = { minimal, standard, full };
  const config = presets[preset] || standard;

  // Apply all checkboxes from preset
  Object.entries(config).forEach(([id, checked]) => {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
  });

  refreshWristbandEditorView();
}

/**
 * Initialize the wristband maker
 */
function initWristband() {
  try {
    if (wristbandCards.length === 0) {
      wristbandCards = [{ name: "Card 1", data: Array(40).fill(null) }];
    }
    currentCardIndex = 0;
    initCellMarkerPalette();
    populateWristbandCheckboxFilters();
    populateWbPersonnelDatalist();
    populateWbPreShiftDatalist();
    refreshWristbandEditorView();
    loadSavedWristbandsList();
    initSortCriteria();

  } catch (err) {
    console.error("initWristband error:", err);
    showToast("❌ Error initializing wristband.", {
      duration: 3000,
      type: "error",
    });
  }
}

/**
 * Populate the checkbox filters for tempo and personnel
 */
function populateWristbandCheckboxFilters() {
  const tempos = [
    ...new Set(plays.map((p) => p.tempo).filter((t) => t && t.trim())),
  ].sort();
  const personnel = [
    ...new Set(plays.map((p) => p.personnel).filter((p) => p && p.trim())),
  ].sort();

  // Populate checkbox filters using shared utility
  buildCheckboxFilterGroup(
    "wbTempoFilters",
    tempos,
    "tempo",
    "toggleWbCheckbox",
  );
  buildCheckboxFilterGroup(
    "wbPersonnelFilters",
    personnel,
    "personnel",
    "toggleWbCheckbox",
  );
}

/**
 * Toggle a checkbox filter
 * @param {HTMLElement} label - Label element
 * @param {string} filterType - 'tempo' or 'personnel'
 * @param {string} value - Filter value
 */
function toggleWbCheckbox(el) {
  const label = el.closest("[data-action='toggleWbCheckbox']") || el;
  const filterType = label.dataset.filterType;
  const value = label.dataset.filterValue;
  const checkbox = label.querySelector('input[type="checkbox"]');
  checkbox.checked = !checkbox.checked;
  label.classList.toggle("checked", checkbox.checked);

  if (filterType === "tempo") {
    if (checkbox.checked) {
      wbSelectedTempos.push(value);
    } else {
      wbSelectedTempos = wbSelectedTempos.filter((t) => t !== value);
    }
  } else if (filterType === "personnel") {
    if (checkbox.checked) {
      wbSelectedPersonnel.push(value);
    } else {
      wbSelectedPersonnel = wbSelectedPersonnel.filter((p) => p !== value);
    }
  }

  filterWristbandPlays();
  updateWbActiveFilterCount();
}

function getWristbandFilterState(opts = {}) {
  const searchInputId = opts.searchInputId || "wbSearchPlay";
  const type = document.getElementById("wbFilterType")?.value || "";
  const rawSearch = document.getElementById(searchInputId)?.value || "";

  return {
    type,
    search: rawSearch.toLowerCase().trim(),
    selectedTempos: [...new Set(wbSelectedTempos)],
    selectedPersonnel: [...new Set(wbSelectedPersonnel)],
  };
}

function syncWristbandFilterUi(filterState = getWristbandFilterState()) {
  const clearBtn = document.getElementById("clearWbSearch");
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", !filterState.search);
    clearBtn.style.display = filterState.search ? "flex" : "none";
  }

  const activeCount =
    filterState.selectedPersonnel.length +
    filterState.selectedTempos.length +
    (filterState.type ? 1 : 0) +
    (filterState.search ? 1 : 0);

  const badge = document.getElementById("wbActiveFilterCount");
  if (!badge) return;

  if (activeCount > 0) {
    badge.textContent = `${activeCount} active`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function matchesWristbandPlayFilters(play, filterState, opts = {}) {
  if (!play) return false;

  if (filterState.type && play.type !== filterState.type) return false;

  if (
    filterState.selectedTempos.length > 0 &&
    !filterState.selectedTempos.includes(play.tempo)
  ) {
    return false;
  }

  if (
    filterState.selectedPersonnel.length > 0 &&
    !filterState.selectedPersonnel.includes(play.personnel)
  ) {
    return false;
  }

  if (!filterState.search) return true;

  if (opts.searchMode === "fullCall") {
    return getFullCall(play).toLowerCase().includes(filterState.search);
  }

  const searchFields = [play.play, play.formation, play.protection]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return searchFields.some((value) => value.includes(filterState.search));
}

/**
 * Set the header color for the wristband
 * @param {string} color - CSS color value
 * @param {HTMLElement} btn - Button element
 */
function setHeaderColor(color, btn) {
  wristbandHeaderColor = color;
  document
    .querySelectorAll(".color-picker:not(#cardColorPicker) .color-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderWristbandGrid();
}

/**
 * Set the card background color for the current card
 */
function setCardColor(color, btn) {
  if (!wristbandCards[currentCardIndex]) return;
  wristbandCards[currentCardIndex].cardColor = color === "transparent" ? "" : color;
  document
    .querySelectorAll("#cardColorPicker .card-color-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  markWristbandDirty();
  renderWristbandGrid();
}

/**
 * Update the card color picker active state to match the current card
 */
function updateCardColorPicker() {
  const cardColor = (wristbandCards[currentCardIndex] && wristbandCards[currentCardIndex].cardColor) || "";
  document.querySelectorAll("#cardColorPicker .card-color-btn").forEach((b) => {
    const isTransparentBtn = b.classList.contains("color-btn-transparent");
    const btnColor = b.getAttribute("data-arg");
    const isMatch = !cardColor || cardColor === "transparent"
      ? isTransparentBtn
      : btnColor === cardColor;
    b.classList.toggle("active", isMatch);
  });
}

/**
 * Filter wristband plays
 */
function filterWristbandPlays() {
  renderWristbandPlays();
}

/** Clear the wristband search input */
function clearWbSearch() {
  const input = document.getElementById("wbSearchPlay");
  if (input) input.value = "";
  filterWristbandPlays();
}

/**
 * Render the available plays list for the wristband
 */
function renderWristbandPlays() {
  const filterState = getWristbandFilterState();
  syncWristbandFilterUi(filterState);

  let filtered = plays.filter((play) =>
    matchesWristbandPlayFilters(play, filterState),
  );

  // Sort favorites to top
  filtered.sort((a, b) => {
    const aFav = wbFavorites.includes(plays.indexOf(a));
    const bFav = wbFavorites.includes(plays.indexOf(b));
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  const container = document.getElementById("wbAvailablePlays");
  container.innerHTML = filtered
    .map((p, i) => {
      const idx = plays.indexOf(p);
      const isFav = wbFavorites.includes(idx);
      const showEmoji =
        document.getElementById("wbShowEmoji")?.checked || false;
      const useSquares =
        document.getElementById("wbUseSquares")?.checked || false;
      const emoji =
        showEmoji && p.personnel
          ? getPersonnelEmoji(p.personnel, useSquares) + " "
          : "";
      const lineCallDisplay = p.lineCall ? ` [${p.lineCall}]` : "";
      return `
        <div class="play-item wb-play-item" data-play-idx="${idx}" title="Double-click to add to next empty cell">
          <button class="wb-pin-btn${isFav ? " active" : ""}" data-action="toggleWbFavorite" data-idx="${idx}" title="${isFav ? "Unpin" : "Pin"} play" aria-label="${isFav ? "Unpin" : "Pin"} play">★</button>
          <div class="play-info">
            <div class="play-name">${emoji}${escapeHtml(p.formation)} ${escapeHtml(p.protection)} ${escapeHtml(p.play)}</div>
            <div class="play-details">${escapeHtml(p.type)}${lineCallDisplay}</div>
          </div>
        </div>
      `;
    })
    .join("");
  document.getElementById("wbPlayCount").textContent = filtered.length;
}

/**
 * Add a play to the next empty cell
 * @param {number} playIndex - Index in the plays array
 */
function addPlayToNextEmpty(playIndex) {
  const play = plays[playIndex];
  if (!play) return;

  const cardData = getCurrentCardData();
  const emptyIdx = cardData.findIndex((cell) => cell === null);

  if (emptyIdx === -1) {
    showToast("⚠️ No empty cells! Clear some or switch to another card", {
      type: "warning",
    });
    return;
  }

  saveWristbandState();
  setCurrentCardData(emptyIdx, play);
  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Build wristband display options from checkbox state.
 * Returns an options object suitable for getFullCall().
 */
function getWristbandDisplayOptions() {
  return {
    showEmoji: document.getElementById("wbShowEmoji")?.checked || false,
    useSquares: document.getElementById("wbUseSquares")?.checked || false,
    underEmoji: document.getElementById("wbUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("wbBoldShifts")?.checked || false,
    redShifts: document.getElementById("wbRedShifts")?.checked || false,
    italicMotions: document.getElementById("wbItalicMotions")?.checked || false,
    redMotions: document.getElementById("wbRedMotions")?.checked || false,
    noVowels: document.getElementById("wbRemoveVowels")?.checked || false,
    showLineCall: document.getElementById("wbShowLineCall")?.checked || false,
    lineCallOnly: document.getElementById("wbLineCallOnly")?.checked || false,
    cadenceReminder: document.getElementById("wbCadenceReminder")?.checked || false,
    highlightHuddle:
      document.getElementById("wbHighlightHuddle")?.checked || false,
    highlightCandy:
      document.getElementById("wbHighlightCandy")?.checked || false,
  };
}

/**
 * Render the wristband grid
 */
function renderWristbandGrid() {
  const grid = document.getElementById("wristbandGrid");
  grid.style.gridTemplateRows = `repeat(${WB_ROWS}, 1fr)`;
  const cardData = getCurrentCardData();
  const opts = getWristbandDisplayOptions();
  const { highlightHuddle, highlightCandy } = opts;
  const displayCache = new Map();
  const getCachedDisplay = (play, custom) => {
    if (!play) return "";
    let variants = displayCache.get(play);
    if (!variants) {
      variants = new Map();
      displayCache.set(play, variants);
    }
    const variantKey = JSON.stringify({
      formationTags: getCustomFormationTagEntries(custom),
      backTags: getCustomBackTagEntries(custom),
    });
    if (variants.has(variantKey)) return variants.get(variantKey);
    const displayPlay = getCustomDisplayPlay(play, custom);
    const rendered = opts.lineCallOnly
      ? getLineCallOnlyDisplay(play, opts)
      : getFullCall(displayPlay, opts);
    variants.set(variantKey, rendered);
    return rendered;
  };

  let html = "";
  const cardColor = (wristbandCards[currentCardIndex] && wristbandCards[currentCardIndex].cardColor) || "";

  // Calculate the starting number based on current card index
  // Card 1: 11-50, Card 2: 51-90, Card 3: 91-130, etc.
  const cardOffset = currentCardIndex * 40;

  for (let row = 0; row < WB_ROWS; row++) {
    const oddNum = row * 2 + 11 + cardOffset;
    const evenNum = row * 2 + 12 + cardOffset;
    const oddIndex = row * 2;
    const evenIndex = row * 2 + 1;

    const oddPlay = cardData[oddIndex];
    const evenPlay = cardData[evenIndex];

    // Get cell customizations
    const oddKey = `${currentCardIndex}-${oddIndex}`;
    const evenKey = `${currentCardIndex}-${evenIndex}`;
    const oddCustom = cellCustomizations[oddKey] || {};
    const evenCustom = cellCustomizations[evenKey] || {};

    // Check for Huddle/Candy tempo highlighting
    const oddIsHuddle =
      highlightHuddle &&
      oddPlay &&
      oddPlay.tempo &&
      oddPlay.tempo.toLowerCase() === "huddle";
    const evenIsHuddle =
      highlightHuddle &&
      evenPlay &&
      evenPlay.tempo &&
      evenPlay.tempo.toLowerCase() === "huddle";
    const oddIsCandy =
      highlightCandy &&
      oddPlay &&
      oddPlay.tempo &&
      oddPlay.tempo.toLowerCase() === "candy";
    const evenIsCandy =
      highlightCandy &&
      evenPlay &&
      evenPlay.tempo &&
      evenPlay.tempo.toLowerCase() === "candy";

    // Build styles with alternating row shading
    const oddBg = getCellBgColor(oddCustom, oddIsHuddle, oddIsCandy, row, cardColor);
    let oddStyle = oddBg ? `background:${oddBg};` : "";
    oddStyle += oddCustom.textColor ? `color:${oddCustom.textColor};` : "";

    const evenBg = getCellBgColor(evenCustom, evenIsHuddle, evenIsCandy, row, cardColor);
    let evenStyle = evenBg ? `background:${evenBg};` : "";
    evenStyle += evenCustom.textColor ? `color:${evenCustom.textColor};` : "";

    // Build prefix after the base personnel token and before the rendered call
    const oddPrefix =
      getCadencePrefix(oddCustom, opts) +
      getCustomPersonnelPrefix(oddCustom, opts) +
      getCustomPreShiftPrefix(oddCustom);
    const evenPrefix =
      getCadencePrefix(evenCustom, opts) +
      getCustomPersonnelPrefix(evenCustom, opts) +
      getCustomPreShiftPrefix(evenCustom);
    const oddPostfix = getCadencePostfix(oddCustom, opts);
    const evenPostfix = getCadencePostfix(evenCustom, opts);

    // Number cells match the play cell background
    const oddNumBg = oddBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const oddNumFg = oddBg ? (isColorDark(oddBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
    const evenNumBg = evenBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const evenNumFg = evenBg ? (isColorDark(evenBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");

    html += `<div class="wristband-cell num-cell" style="background: ${oddNumBg}; color: ${oddNumFg};">${oddNum}</div>`;

    // Odd play cell
    if (oddPlay) {
      const oddDisplay = getCachedDisplay(oddPlay, oddCustom);
      html += `
        <div class="wristband-cell filled" style="${oddStyle}" 
             draggable="true"
             data-drag="wbCell" data-cell-idx="${oddIndex}"
             data-card="${currentCardIndex}">
          <span class="cell-play"><span class="cell-drag-handle">☰</span><span class="cell-play-text">${composeWristbandCellDisplay(oddPrefix, oddDisplay, oddPostfix)}</span></span>
        </div>
      `;
    } else {
      html += `<div class="wristband-cell" style="${oddStyle}" tabindex="0"
                    data-drag="wbCell" data-cell-idx="${oddIndex}"
                    data-card="${currentCardIndex}"></div>`;
    }

    // Even number cell
    html += `<div class="wristband-cell num-cell" style="background: ${evenNumBg}; color: ${evenNumFg};">${evenNum}</div>`;

    // Even play cell
    if (evenPlay) {
      const evenDisplay = getCachedDisplay(evenPlay, evenCustom);
      html += `
        <div class="wristband-cell filled" style="${evenStyle}" 
             draggable="true"
             data-drag="wbCell" data-cell-idx="${evenIndex}"
             data-card="${currentCardIndex}">
          <span class="cell-play"><span class="cell-drag-handle">☰</span><span class="cell-play-text">${composeWristbandCellDisplay(evenPrefix, evenDisplay, evenPostfix)}</span></span>
        </div>
      `;
    } else {
      html += `<div class="wristband-cell" style="${evenStyle}" tabindex="0"
                    data-drag="wbCell" data-cell-idx="${evenIndex}"
                    data-card="${currentCardIndex}"></div>`;
    }
  }

  grid.innerHTML = html;

  // Show/hide empty state overlay
  const cardEl = document.getElementById("wristbandCard");
  let emptyOverlay = cardEl.querySelector(".wb-grid-empty-state");
  const hasPlays = cardData.some((p) => p !== null);
  if (!hasPlays) {
    if (!emptyOverlay) {
      emptyOverlay = document.createElement("div");
      emptyOverlay.className = "wb-grid-empty-state";
      emptyOverlay.innerHTML = `
        <div class="wb-empty-icon">📋</div>
        <div class="wb-empty-title">Empty Card</div>
        <div class="wb-empty-hint">Click any cell to add a play, or use <strong>⚡ Auto-Fill</strong> to populate from your playbook</div>
      `;
      cardEl.appendChild(emptyOverlay);
    }
    emptyOverlay.classList.add("visible");
  } else if (emptyOverlay) {
    emptyOverlay.classList.remove("visible");
  }

  // Update undo/redo buttons
  historyManager.updateButtons("wristband");

  // Attach long-press context menus for mobile
  grid.querySelectorAll("[data-drag='wbCell']").forEach((cell) => {
    const cardIdx = parseInt(cell.dataset.card, 10);
    const cellIdx = parseInt(cell.dataset.cellIdx, 10);
    if (!isNaN(cardIdx) && !isNaN(cellIdx)) {
      addLongPress(cell, (ev) => _showWbCellContextMenu(ev, cardIdx, cellIdx));
    }
  });

  syncWbSelectedCellVisuals(grid);

  // Update stats bar
  updateWbStats();

  // Refresh tab badge counts
  if (typeof updateTabBadges === "function") updateTabBadges();
}

// ============ Cell Popup Functions ============

function setWristbandOverlayVisibility(target, isOpen, opts = {}) {
  const overlay =
    typeof target === "string" ? document.getElementById(target) : target;
  if (!overlay) return null;

  const visibilityClass = opts.visibilityClass || "hidden";
  if (opts.openClass) {
    overlay.classList.toggle(visibilityClass, isOpen);
  } else {
    overlay.classList.toggle(visibilityClass, !isOpen);
  }

  overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if (isOpen) {
    overlay.removeAttribute("inert");
  } else {
    overlay.setAttribute("inert", "");
  }

  return overlay;
}

/**
 * Clear the current wristband card
 */
async function clearWristband() {
  const cardData = getCurrentCardData();
  if (!cardData.some((c) => c !== null)) return;

  // Snapshot for undo
  const snapshot = safeDeepClone(wristbandCards[currentCardIndex].data);
  const custSnapshot = {};
  Object.keys(cellCustomizations).forEach((key) => {
    if (key.startsWith(currentCardIndex + "-")) {
      custSnapshot[key] = safeDeepClone(cellCustomizations[key]);
    }
  });
  const cardIdx = currentCardIndex;

  saveWristbandState();
  wristbandCards[currentCardIndex].data = Array(40).fill(null);
  // Also clear cell customizations for this card
  Object.keys(cellCustomizations).forEach((key) => {
    if (key.startsWith(currentCardIndex + "-")) {
      delete cellCustomizations[key];
    }
  });
  renderCardTabs();
  renderWristbandGrid();

  showUndoToast(
    "🗑️ " + escapeHtml(wristbandCards[cardIdx].name) + " cleared",
    () => {
      wristbandCards[cardIdx].data = snapshot;
      Object.assign(cellCustomizations, custSnapshot);
      renderCardTabs();
      renderWristbandGrid();
      markWristbandDirty();
    },
  );
}

/**
 * Auto-fill the wristband with filtered plays (adds to empty cells on current card only)
 */
async function autoFillWristband() {
  const filterState = getWristbandFilterState();

  const filtered = plays.filter((play) =>
    matchesWristbandPlayFilters(play, filterState),
  );

  if (filtered.length === 0) {
    showToast("No plays match the current filters");
    return;
  }

  // Count total empty cells across all cards starting from current card
  let totalEmpty = 0;
  for (
    let cardIdx = currentCardIndex;
    cardIdx < wristbandCards.length;
    cardIdx++
  ) {
    totalEmpty += wristbandCards[cardIdx].data.filter((c) => c === null).length;
  }

  const willFill = Math.min(filtered.length, totalEmpty);
  let extraCardsNeeded = 0;

  // If we need more cells than available, calculate new cards needed
  if (filtered.length > totalEmpty) {
    const extraPlays = filtered.length - totalEmpty;
    extraCardsNeeded = Math.ceil(extraPlays / 40);
    const totalCardsNeeded = wristbandCards.length + extraCardsNeeded;

    if (totalCardsNeeded > MAX_CARDS) {
      extraCardsNeeded = MAX_CARDS - wristbandCards.length;
    }
  }

  const totalAvailable = totalEmpty + extraCardsNeeded * 40;
  const toFill = Math.min(filtered.length, totalAvailable);
  const cardsAffected =
    extraCardsNeeded > 0
      ? wristbandCards.length - currentCardIndex + extraCardsNeeded
      : wristbandCards.length - currentCardIndex;

  // Confirmation modal
  const msg =
    extraCardsNeeded > 0
      ? `Will add ${toFill} of ${filtered.length} plays across ${cardsAffected} card(s).\n\n${extraCardsNeeded} new card(s) will be created.\n\nStarting from ${wristbandCards[currentCardIndex].name}.`
      : `Will add ${toFill} of ${filtered.length} plays to ${cardsAffected} card(s).\n\nStarting from ${wristbandCards[currentCardIndex].name}.`;

  const ok = await showConfirm(msg, {
    title: "Auto-Fill Preview",
    icon: "⚡",
    confirmText: `Fill ${toFill} Plays`,
  });
  if (!ok) return;

  // Create extra cards if needed
  if (extraCardsNeeded > 0) {
    for (
      let i = 0;
      i < extraCardsNeeded && wristbandCards.length < MAX_CARDS;
      i++
    ) {
      wristbandCards.push({
        name: `Card ${wristbandCards.length + 1}`,
        data: Array(40).fill(null),
      });
    }
  }

  saveWristbandState();

  // Fill empty cells across all cards starting from current card
  let playIndex = 0;
  let filledCount = 0;

  for (
    let cardIdx = currentCardIndex;
    cardIdx < wristbandCards.length && playIndex < filtered.length;
    cardIdx++
  ) {
    for (
      let cellIdx = 0;
      cellIdx < 40 && playIndex < filtered.length;
      cellIdx++
    ) {
      if (wristbandCards[cardIdx].data[cellIdx] === null) {
        wristbandCards[cardIdx].data[cellIdx] = filtered[playIndex];
        playIndex++;
        filledCount++;
      }
    }
  }

  if (filledCount === 0) {
    showToast("⚠️ No empty cells available — clear some first", {
      type: "warning",
    });
    return;
  }

  renderCardTabs();
  renderWristbandGrid();
  showToast(`✅ Added ${filledCount} play${filledCount !== 1 ? "s" : ""}`);
}

/**
 * Get relative luminance of a hex color (0 = black, 1 = white).
 * Used for auto-contrast: returns true if the color is dark.
 */
function isColorDark(hex) {
  if (!hex) return false;
  hex = hex.replace("#", "");
  if (hex.length === 3)
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  // Relative luminance (ITU-R BT.709)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.45;
}

/**
 * Toggle wristband filters collapse
 */
function toggleWbFiltersCollapse() {
  const container = document.getElementById("wbFiltersContainer");
  const btn = document.getElementById("toggleWbFiltersBtn");
  wbFiltersCollapsed = !wbFiltersCollapsed;

  if (wbFiltersCollapsed) {
    container.classList.add("collapsed");
    btn.innerHTML = "🔽 Filters";
  } else {
    container.classList.remove("collapsed");
    btn.innerHTML = "🔼 Filters";
  }
}

/**
 * Clear all wristband filters
 */
function clearAllWbFilters() {
  wbSelectedPersonnel = [];
  wbSelectedTempos = [];
  document
    .querySelectorAll("#wbPersonnelFilters label, #wbTempoFilters label")
    .forEach((label) => {
      label.classList.remove("checked");
      const cb = label.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    });
  const typeFilter = document.getElementById("wbFilterType");
  if (typeFilter) typeFilter.value = "";
  const searchBox = document.getElementById("wbSearchPlay");
  if (searchBox) searchBox.value = "";
  filterWristbandPlays();
  updateWbActiveFilterCount();
}

/**
 * Update active filter count badge for wristband
 */
function updateWbActiveFilterCount() {
  syncWristbandFilterUi();
}

/* toggleWbDisplayOptions and toggleWbSortPanel merged into shared toggleCollapsiblePanel() in utils.js */

/**
 * Update wristband stats bar
 */
function updateWbStats() {
  const cardsEl = document.getElementById("wbStatCards");
  const playsEl = document.getElementById("wbStatPlays");
  const emptyEl = document.getElementById("wbStatEmpty");
  const runEl = document.getElementById("wbStatRun");
  const passEl = document.getElementById("wbStatPass");

  if (!cardsEl) return;

  let totalPlays = 0;
  let totalEmpty = 0;
  let runCount = 0;
  let passCount = 0;

  wristbandCards.forEach((card) => {
    const cells = card.data || card || [];
    cells.forEach((cell) => {
      if (cell) {
        totalPlays++;
        const type = (cell.type || "").toLowerCase();
        if (type === "run") runCount++;
        else if (type === "pass" || type === "play action" || type === "screen")
          passCount++;
      } else {
        totalEmpty++;
      }
    });
  });

  cardsEl.textContent = wristbandCards.length;
  playsEl.textContent = totalPlays;
  emptyEl.textContent = totalEmpty;
  runEl.textContent = runCount;
  passEl.textContent = passCount;
}

// ============ Cmd+K Quick Search ============

/**
 * Open the quick search overlay (Cmd+K)
 */
function openWbQuickSearch() {
  let overlay = document.getElementById("wbQuickSearchOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "wbQuickSearchOverlay";
    overlay.className = "wb-quicksearch-overlay";
    overlay.setAttribute("data-action", "closeWbQuickSearchOverlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Wristband quick search");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");
    overlay.innerHTML = `
      <div class="wb-quicksearch-box">
        <input type="text" class="wb-quicksearch-input" id="wbQuickSearchInput"
               placeholder="Search plays… (type to filter)" autocomplete="off" />
        <div class="wb-quicksearch-results" id="wbQuickSearchResults">
          <div class="wb-quicksearch-empty">Type to search your playbook</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Input handler
    document
      .getElementById("wbQuickSearchInput")
      .addEventListener("input", (e) => {
        renderQuickSearchResults(e.target.value);
      });

    // Keyboard nav
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeWbQuickSearch();
        return;
      }
      const results = document.getElementById("wbQuickSearchResults");
      const items = results.querySelectorAll(".wb-quicksearch-item");
      if (items.length === 0) return;

      let current = results.querySelector(".wb-quicksearch-item.highlighted");
      let idx = current ? Array.from(items).indexOf(current) : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        idx = Math.min(idx + 1, items.length - 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        idx = Math.max(idx - 1, 0);
      } else if (e.key === "Enter" && idx >= 0) {
        e.preventDefault();
        items[idx].click();
        return;
      } else {
        return;
      }
      items.forEach((el, i) => el.classList.toggle("highlighted", i === idx));
      if (items[idx]) items[idx].scrollIntoView({ block: "nearest" });
    });
  }

  const input = document.getElementById("wbQuickSearchInput");
  setWristbandOverlayVisibility(overlay, true, {
    visibilityClass: "visible",
    openClass: true,
  });
  input.value = "";
  document.getElementById("wbQuickSearchResults").innerHTML =
    '<div class="wb-quicksearch-empty">Type to search your playbook</div>';
  setTimeout(() => input.focus(), 50);
}

/**
 * Close the quick search overlay
 */
function closeWbQuickSearch() {
  const overlay = document.getElementById("wbQuickSearchOverlay");
  setWristbandOverlayVisibility(overlay, false, {
    visibilityClass: "visible",
    openClass: true,
  });
}

/**
 * Render quick search results
 */
function renderQuickSearchResults(query) {
  const results = document.getElementById("wbQuickSearchResults");
  if (!query.trim()) {
    results.innerHTML =
      '<div class="wb-quicksearch-empty">Type to search your playbook</div>';
    return;
  }
  const q = query.toLowerCase();
  const matches = plays
    .filter((p) => {
      const text =
        `${p.formation} ${p.protection} ${p.play} ${p.type} ${p.personnel}`.toLowerCase();
      return text.includes(q);
    })
    .slice(0, 20);

  if (matches.length === 0) {
    results.innerHTML =
      '<div class="wb-quicksearch-empty">No plays found</div>';
    return;
  }

  results.innerHTML = matches
    .map((p) => {
      const idx = plays.indexOf(p);
      return `<div class="wb-quicksearch-item" data-play-idx="${idx}">
      <span class="cell-play-option-type">${escapeHtml(p.type || "Play")}</span>
      ${escapeHtml(p.formation)} ${escapeHtml(p.protection)} ${escapeHtml(p.play)}
      <span class="td-meta-inline">${escapeHtml(p.personnel || "")}</span>
    </div>`;
    })
    .join("");

  // Click to add
  results.querySelectorAll(".wb-quicksearch-item").forEach((item) => {
    item.addEventListener("click", () => {
      const playIdx = parseInt(item.dataset.playIdx, 10);
      addPlayToNextEmpty(playIdx);
      closeWbQuickSearch();
    });
  });
}

// ============ Pin/Favorite Plays ============

/**
 * Toggle a play's favorite status
 */
function toggleWbFavorite(playIndex) {
  playIndex = parseInt(playIndex, 10);
  if (!Number.isInteger(playIndex) || playIndex < 0) return;
  const idx = wbFavorites.indexOf(playIndex);
  if (idx >= 0) {
    wbFavorites.splice(idx, 1);
  } else {
    wbFavorites.push(playIndex);
  }
  wbFavorites = normalizeWbFavorites(wbFavorites);
  scheduleWristbandAutosave();
  storageManager.set(STORAGE_KEYS.WRISTBAND_FAVORITES, wbFavorites);
  renderWristbandPlays();
}

// ============ Smart Fill by Situation ============

/**
 * Auto-fill wristband filtered by situation/down/distance
 */
async function smartFillBySituation() {
  const situations = [
    { label: "1st Down", value: "1" },
    { label: "2nd & Short", value: "2s" },
    { label: "2nd & Long", value: "2l" },
    { label: "3rd & Short", value: "3s" },
    { label: "3rd & Long", value: "3l" },
    { label: "Red Zone", value: "rz" },
    { label: "Goal Line", value: "gl" },
    { label: "2-Minute", value: "2min" },
    { label: "Short Yardage", value: "sy" },
  ];
  const items = situations.map((s) => ({ label: s.label, value: s.value }));
  const picked = await showListPicker("Fill with plays for:", items, {
    title: "Smart Fill by Situation",
    icon: "🧠",
  });
  if (!picked) return;

  let filtered = plays.filter((p) => {
    switch (picked) {
      case "1":
        return p.preferredDown === "1";
      case "2s":
        return p.preferredDown === "2" && p.preferredDistance === "Short";
      case "2l":
        return (
          p.preferredDown === "2" &&
          (p.preferredDistance === "Medium" || p.preferredDistance === "Long")
        );
      case "3s":
        return p.preferredDown === "3" && p.preferredDistance === "Short";
      case "3l":
        return (
          p.preferredDown === "3" &&
          (p.preferredDistance === "Medium" || p.preferredDistance === "Long")
        );
      case "rz":
        return (
          p.preferredFieldPosition === "Lo-RZ" ||
          p.preferredFieldPosition === "Hi-RZ"
        );
      case "gl":
        return p.preferredFieldPosition === "Goal Line";
      case "2min":
        return p.preferredSituation === "2 Minute";
      case "sy":
        return p.preferredSituation === "Short Yardage";
      default:
        return false;
    }
  });

  if (filtered.length === 0) {
    showToast("No plays found for that situation");
    return;
  }

  const cardData = getCurrentCardData();
  const emptyCount = cardData.filter((c) => c === null).length;
  const toFill = Math.min(filtered.length, emptyCount);

  if (toFill === 0) {
    showToast("No empty cells — clear some first");
    return;
  }

  const sitLabel = situations.find((s) => s.value === picked)?.label || picked;
  const ok = await showConfirm(
    `Add ${toFill} of ${filtered.length} "${sitLabel}" plays to empty cells on ${wristbandCards[currentCardIndex].name}?`,
    { title: "Smart Fill", icon: "🧠", confirmText: `Fill ${toFill} Plays` },
  );
  if (!ok) return;

  saveWristbandState();
  let fillIdx = 0;
  for (let cellIdx = 0; cellIdx < 40 && fillIdx < filtered.length; cellIdx++) {
    if (wristbandCards[currentCardIndex].data[cellIdx] === null) {
      wristbandCards[currentCardIndex].data[cellIdx] = filtered[fillIdx];
      fillIdx++;
    }
  }

  renderCardTabs();
  renderWristbandGrid();
  showToast(`✅ Added ${fillIdx} "${sitLabel}" plays`);
}

function _showWbCellContextMenu(e, cardIdx, cellIdx) {
  const hasPlay = wristbandCards[cardIdx]?.data[cellIdx] !== null;
  const menuItems = [];
  if (hasPlay) {
    menuItems.push({
      label: "📋 Copy Cell",
      action: () => copyWbCell(cardIdx, cellIdx),
    });
  }
  if (copiedCell) {
    menuItems.push({
      label: "📌 Paste Cell",
      action: () => pasteWbCell(cardIdx, cellIdx),
    });
  }
  if (hasPlay) {
    menuItems.push({
      label: "🗑️ Clear Cell",
      action: () => {
        saveWristbandState();
        wristbandCards[cardIdx].data[cellIdx] = null;
        delete cellCustomizations[`${cardIdx}-${cellIdx}`];
        renderCardTabs();
        renderWristbandGrid();
      },
    });
  }
  if (menuItems.length > 0) {
    showContextMenu(e, menuItems);
  }
}

// ============ Container-Scoped Delegation ============

// ============ Wristband Help/Shortcuts ============

/**
 * Show wristband shortcuts help modal
 */
function showWbShortcutHelp() {
  setWristbandOverlayVisibility("wbHelpOverlay", true, {
    visibilityClass: "show",
    openClass: true,
  });
}

/**
 * Close wristband shortcuts help modal
 */
function closeWbHelpOverlay() {
  setWristbandOverlayVisibility("wbHelpOverlay", false, {
    visibilityClass: "show",
    openClass: true,
  });
}

// ============ Wristband Find/Replace ============

/**
 * Open find/replace modal
 */
function openWbFindReplaceModal() {
  const overlay = document.getElementById("wbFindReplaceOverlay");
  if (overlay) {
    setWristbandOverlayVisibility(overlay, true, {
      visibilityClass: "show",
      openClass: true,
    });
    document.getElementById("wbFindPlayInput").focus();
    document.getElementById("wbFindPlayInput").value = "";
    document.getElementById("wbReplacePlayInput").value = "";
  }
}

/**
 * Close find/replace modal
 */
function closeWbFindReplaceModal() {
  setWristbandOverlayVisibility("wbFindReplaceOverlay", false, {
    visibilityClass: "show",
    openClass: true,
  });
}

/**
 * Execute find and replace across all cards
 */
async function executeWbFindReplace() {
  const findInput = document.getElementById("wbFindPlayInput");
  const replaceInput = document.getElementById("wbReplacePlayInput");
  const findStr = findInput.value.trim();
  const replaceStr = replaceInput.value.trim();

  if (!findStr) {
    showToast("Enter a play name to find");
    return;
  }
  if (!replaceStr) {
    showToast("Enter a replacement play name");
    return;
  }

  // Count matches across all cards
  let matchCount = 0;
  let cellsAffected = 0;
  const findLower = findStr.toLowerCase();

  for (let cardIdx = 0; cardIdx < wristbandCards.length; cardIdx++) {
    const cardData = wristbandCards[cardIdx].data;
    for (let cellIdx = 0; cellIdx < cardData.length; cellIdx++) {
      const play = cardData[cellIdx];
      if (play && play.play && play.play.toLowerCase().includes(findLower)) {
        matchCount++;
      }
    }
  }

  if (matchCount === 0) {
    showToast(`No plays found matching "${findStr}"`);
    return;
  }

  // Confirm replacement
  const ok = await showConfirm(
    `Replace ${matchCount} play${matchCount === 1 ? "" : "s"} containing "${findStr}" with "${replaceStr}"?`,
    {
      title: "Find & Replace",
      icon: "🔍",
      confirmText: "Replace All",
      danger: false,
    },
  );

  if (!ok) return;

  saveWristbandState();

  // Execute replacement
  for (let cardIdx = 0; cardIdx < wristbandCards.length; cardIdx++) {
    const cardData = wristbandCards[cardIdx].data;
    for (let cellIdx = 0; cellIdx < cardData.length; cellIdx++) {
      const play = cardData[cellIdx];
      if (play && play.play && play.play.toLowerCase().includes(findLower)) {
        // Create new play object with replaced name
        const newPlay = safeDeepClone(play);
        newPlay.play = play.play.replace(
          new RegExp(findStr, "gi"),
          replaceStr,
        );
        wristbandCards[cardIdx].data[cellIdx] = newPlay;
        cellsAffected++;
      }
    }
  }

  closeWbFindReplaceModal();
  renderCardTabs();
  renderWristbandGrid();
  showToast(`✅ Replaced ${cellsAffected} play${cellsAffected === 1 ? "" : "s"}`);
}

document.addEventListener("DOMContentLoaded", () => {
  // ── Batch bar swatch click wiring ──
  _initBatchBarSwatches();

  // ── Wristband grid: drag + click delegation ──
  const grid = document.getElementById("wristbandGrid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (!cell) return;
      const cardIdx = parseInt(cell.dataset.card, 10);
      const cellIdx = parseInt(cell.dataset.cellIdx, 10);

      // Shift+click for batch multi-select
      if (e.shiftKey) {
        e.preventDefault();
        toggleBatchSelect(cardIdx, cellIdx);
        return;
      }

      openCellPopup(cardIdx, cellIdx, e);
    });

    // Right-click context menu for copy/paste
    grid.addEventListener("contextmenu", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (!cell) return;
      e.preventDefault();
      const cardIdx = parseInt(cell.dataset.card, 10);
      const cellIdx = parseInt(cell.dataset.cellIdx, 10);
      _showWbCellContextMenu(e, cardIdx, cellIdx);
    });
    grid.addEventListener("dragstart", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) {
        handleCellDragStart(
          e,
          parseInt(cell.dataset.cellIdx, 10),
          parseInt(cell.dataset.card, 10),
        );
      }
    });
    grid.addEventListener("dragover", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) handleCellDragOver(e);
    });
    grid.addEventListener("dragleave", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) handleCellDragLeave(e);
    });
    grid.addEventListener("drop", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) handleCellDrop(e, parseInt(cell.dataset.cellIdx, 10));
    });
    grid.addEventListener("dragend", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (cell) handleCellDragEnd(e);
    });
  }

  // ── Wristband sort criteria: drag delegation ──
  document.body.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[data-drag='wbSort']");
    if (el) handleSortDragStart(e, parseInt(el.dataset.idx, 10));
  });
  document.body.addEventListener("dragover", (e) => {
    const el = e.target.closest("[data-drag='wbSort']");
    if (el) handleSortDragOver(e);
  });
  document.body.addEventListener("drop", (e) => {
    const el = e.target.closest("[data-drag='wbSort']");
    if (el) handleSortDrop(e, parseInt(el.dataset.idx, 10));
  });
  document.body.addEventListener("dragend", (e) => {
    const el = e.target.closest("[data-drag='wbSort']");
    if (el) handleSortDragEnd(e);
  });

  // ── Card tabs: double-click to rename ──
  const cardTabsEl = document.getElementById("cardTabs");
  if (cardTabsEl) {
    cardTabsEl.addEventListener("dblclick", (e) => {
      const tab = e.target.closest(".card-tab");
      if (tab && tab.dataset.idx !== undefined) {
        renameCard(parseInt(tab.dataset.idx, 10));
      }
    });
    // Right-click card tab for description
    cardTabsEl.addEventListener("contextmenu", (e) => {
      const tab = e.target.closest(".card-tab");
      if (!tab || tab.dataset.idx === undefined) return;
      e.preventDefault();
      const idx = parseInt(tab.dataset.idx, 10);
      showContextMenu(e, [
        { label: "✏️ Rename Card", action: () => renameCard(idx) },
        {
          label: "📝 Edit Description",
          action: () => editCardDescription(idx),
        },
      ]);
    });
  }

  // ── Available plays: double-click to add ──
  const wbAvailEl = document.getElementById("wbAvailablePlays");
  if (wbAvailEl) {
    wbAvailEl.addEventListener("dblclick", (e) => {
      const item = e.target.closest("[data-play-idx]");
      if (item) addPlayToNextEmpty(parseInt(item.dataset.playIdx, 10));
    });
  }

  // ── Card tabs: accept drag-drop from grid cells ──
  const tabsContainer = document.getElementById("cardTabs");
  if (tabsContainer) {
    tabsContainer.addEventListener("dragover", (e) => {
      if (draggedCellIndex === null) return;
      const tab = e.target.closest(".card-tab");
      if (tab) {
        e.preventDefault();
        tab.classList.add("drag-over");
      }
    });
    tabsContainer.addEventListener("dragleave", (e) => {
      const tab = e.target.closest(".card-tab");
      if (tab) tab.classList.remove("drag-over");
    });
    tabsContainer.addEventListener("drop", (e) => {
      const tab = e.target.closest(".card-tab");
      if (!tab || draggedCellIndex === null) return;
      e.preventDefault();
      tab.classList.remove("drag-over");
      const targetCardIdx = parseInt(tab.dataset.idx, 10);
      const sourceCardIdx = draggedCellCardIdx !== null ? draggedCellCardIdx : currentCardIndex;
      if (targetCardIdx === sourceCardIdx) return;

      const play = wristbandCards[sourceCardIdx].data[draggedCellIndex];
      if (!play) return;

      // Find first empty cell in target card
      const emptyIdx = wristbandCards[targetCardIdx].data.findIndex(
        (c) => c === null,
      );
      if (emptyIdx === -1) {
        showToast("No empty cells on that card");
        return;
      }

      mutateWristbandState(() => {
        wristbandCards[targetCardIdx].data[emptyIdx] = play;
        wristbandCards[sourceCardIdx].data[draggedCellIndex] = null;
        moveWristbandCellCustomization(
          sourceCardIdx,
          draggedCellIndex,
          targetCardIdx,
          emptyIdx,
        );
        draggedCellIndex = null;
        draggedCellCardIdx = null;
      });
      showToast(`Moved to ${wristbandCards[targetCardIdx].name}`);
    });
  }

  // ── Keyboard: type on empty cell to search ──
  if (grid) {
    grid.addEventListener("keydown", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (!cell) return;
      const cellIdx = parseInt(cell.dataset.cellIdx, 10);
      const cardIdx = parseInt(cell.dataset.card, 10);

      // Ctrl/Cmd+A: select all cells on current card
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        e.stopPropagation();
        const selectedCount = selectAllWbCellsOnCurrentCard(grid);
        showToast(`Selected ${selectedCount} cells`);
        return;
      }

      // Ctrl/Cmd+C: copy cell
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        e.stopPropagation();
        copyWbCell(cardIdx, cellIdx);
        return;
      }
      // Ctrl/Cmd+V: paste cell
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        e.stopPropagation();
        pasteWbCell(cardIdx, cellIdx);
        return;
      }

      // Only trigger type-to-search on printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const play = wristbandCards[cardIdx]?.data[cellIdx];
        if (!play) {
          e.stopPropagation();
          // Open cell popup and pre-fill search
          openCellPopup(cardIdx, cellIdx, e);
          setTimeout(() => {
            const searchInput = document.getElementById("cellPlaySearch");
            if (searchInput) {
              searchInput.value = e.key;
              searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }, 60);
        }
      }
    });
  }
});
