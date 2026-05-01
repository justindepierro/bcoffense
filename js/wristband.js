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

/* toggleWbDisplayOptions and toggleWbSortPanel merged into shared toggleCollapsiblePanel() in utils.js */

// ============ Cmd+K Quick Search ============

/**
 * Open the quick search overlay (Cmd+K)
 */
// ============ Container-Scoped Delegation ============
