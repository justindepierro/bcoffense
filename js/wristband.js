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

// Cell customization storage: { "cardIdx-cellIdx": { bgColor, textColor, cadence, extraPersonnel } }
let cellCustomizations = {};
let currentEditingCell = { cardIdx: null, cellIdx: null };
let pendingBgColor = "";
let pendingTextColor = UI_COLORS.textBlack;
let pendingPlaySelection = null;
let pendingCadence = "";
let pendingExtraPersonnel = "";

/** Get display prefix for a cell's cadence setting (handles legacy onTwo boolean) */
function getCadencePrefix(custom) {
  const cadence = custom.cadence || (custom.onTwo ? "$" : "");
  if (cadence === "$$") return "💲💲 ";
  if (cadence === "$") return "💲 ";
  return "";
}

/** Get cadence postfix (same emoji repeated at end of cell) */
function getCadencePostfix(custom) {
  const cadence = custom.cadence || (custom.onTwo ? "$" : "");
  if (cadence === "$$") return " 💲💲";
  if (cadence === "$") return " 💲";
  return "";
}

/** Get custom extra personnel prefix for a wristband cell */
function getCustomPersonnelPrefix(custom, opts) {
  if (!custom || !custom.extraPersonnel) return "";
  const tag = String(custom.extraPersonnel).trim();
  if (!tag) return "";
  const emoji = opts.showEmoji ? getPersonnelEmoji(tag, opts.useSquares) : "";
  return emoji ? `${emoji} ` : `${escapeHtml(tag)} `;
}

/** Slightly lighten or darken a color for alternating row shading */
function shadeColor(color, amount) {
  if (!color || color === "transparent") return "";
  // Parse hex
  let hex = color.replace("#", "");
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
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
  const lc = play.lineCall ? escapeHtml(play.lineCall) : "";
  return lc ? `${prefix}<b>${lc}</b>` : prefix.trim();
}

/** Get the effective background color for a cell, with alternating row offset */
function getCellBgColor(custom, isHuddle, isCandy, row, cardColor) {
  // Individual cell override takes priority
  if (custom.bgColor) {
    return row % 2 === 1 ? shadeColor(custom.bgColor, 18) : custom.bgColor;
  }
  // Tempo highlights
  if (isHuddle) return UI_COLORS.highlightHuddle;
  if (isCandy) return UI_COLORS.highlightCandy;
  // Card-level color with alternating shade
  if (cardColor && cardColor !== "transparent") {
    return row % 2 === 1 ? shadeColor(cardColor, 18) : cardColor;
  }
  // No color: alternate white / light grey
  return row % 2 === 1 ? "#f4f4f4" : "";
}

// Sort criteria state: array of { field, direction, customOrder } objects
let wbSortCriteria = [];
let draggedSortItem = null;

// Custom value orders per field: { fieldName: ["value1", "value2", ...] }
let wbCustomSortOrders = {};
wbCustomSortOrders = storageManager.get(STORAGE_KEYS.CUSTOM_SORT_ORDERS, {});

// Sort across all cards as one pool
let wbSortAcrossCards = false;

// Saved sort presets
let savedSortPresets = {};
savedSortPresets = storageManager.get(STORAGE_KEYS.SORT_PRESETS, {});

// Drag-and-drop cell swap state
let draggedCellIndex = null;

// Copy/paste cell state
let copiedCell = null;

// Batch color selection
let wbSelectedCells = [];

// Favorite/pinned plays (play indices)
let wbFavorites = storageManager.get(STORAGE_KEYS.WRISTBAND_FAVORITES, []);

// Arrow key highlight index in cell popup
let highlightedPlayIndex = -1;

// Autosave timer
let wristbandAutosaveTimer = null;

/**
 * Debounced autosave for the working wristband
 */
function scheduleWristbandAutosave() {
  if (wristbandAutosaveTimer) clearTimeout(wristbandAutosaveTimer);
  if (typeof updateSaveStatus === "function") updateSaveStatus("saving");
  wristbandAutosaveTimer = setTimeout(() => {
    if (wristbandCards.length === 0) return;
    const hasPlays = wristbandCards.some(
      (c) => c.data && c.data.some((p) => p !== null),
    );
    if (!hasPlays) return;
    const draft = {
      cards: wristbandCards,
      cellStyles: cellCustomizations,
      headerColor: wristbandHeaderColor,
      savedAt: new Date().toISOString(),
    };
    storageManager.set(STORAGE_KEYS.WRISTBAND_DRAFT, draft);
    if (typeof updateSaveStatus === "function") updateSaveStatus("saved");
  }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Check for and offer to restore a wristband draft
 */
async function checkWristbandDraft() {
  try {
    const draft = storageManager.get(STORAGE_KEYS.WRISTBAND_DRAFT, null);
    if (!draft || !draft.cards || draft.cards.length === 0) return;

    // Discard drafts older than 24 hours
    const age =
      Date.now() - (draft.savedAt ? new Date(draft.savedAt).getTime() : 0);
    if (age > DRAFT_EXPIRY_MS) {
      storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
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

    const savedTime = draft.savedAt
      ? new Date(draft.savedAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "unknown time";

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
      wristbandCards = safeDeepClone(draft.cards);
      cellCustomizations = draft.cellStyles
        ? safeDeepClone(draft.cellStyles)
        : {};
      wristbandHeaderColor = draft.headerColor || "transparent";
      currentCardIndex = 0;
      renderCardTabs();
      renderWristbandGrid();
      updateCardColorPicker();
      markWristbandDirty();
      showToast("🃏 Draft restored");
    } else {
      storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
    }
  } catch (err) {
    console.error("checkWristbandDraft error:", err);
    showToast("❌ Error restoring wristband draft.", {
      duration: 3000,
      type: "error",
    });
  }
}

// Available sort fields
const WB_SORT_FIELDS = [
  { value: "personnel", label: "Personnel" },
  { value: "type", label: "Play Type" },
  { value: "tempo", label: "Tempo" },
  { value: "formation", label: "Formation" },
  { value: "basePlay", label: "Base Play" },
  { value: "play", label: "Play Name" },
  { value: "back", label: "Back" },
  { value: "protection", label: "Protection" },
];

/**
 * Initialize sort criteria list with default (loads from storage if available)
 */
function initSortCriteria() {
  if (wbSortCriteria.length === 0) {
    const saved = storageManager.get(
      STORAGE_KEYS.WRISTBAND_SORT_CRITERIA,
      null,
    );
    wbSortCriteria = saved || [{ field: "personnel", direction: "asc" }];
  }
  renderSortCriteria();
  renderSortPresetDropdown();
}

/**
 * Render the sort preset dropdown
 */
function renderSortPresetDropdown() {
  const dropdown = document.getElementById("sortPresetDropdown");
  if (!dropdown) return;

  const presetNames = Object.keys(savedSortPresets);
  dropdown.innerHTML =
    '<option value="">-- Select Preset --</option>' +
    presetNames
      .map(
        (name) =>
          `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`,
      )
      .join("");
}

/**
 * Save current sort criteria as a preset
 */
async function saveSortPreset() {
  const name = await showPrompt("Enter a name for this sort preset:", "", {
    title: "Save Sort Preset",
    icon: "💾",
  });
  if (!name || name.trim() === "") return;

  const trimmedName = name.trim();
  if (savedSortPresets[trimmedName]) {
    const ok = await showConfirm(
      `A preset named "${trimmedName}" already exists. Overwrite?`,
      {
        title: "Overwrite Preset",
        icon: "⚠️",
        confirmText: "Overwrite",
        danger: true,
      },
    );
    if (!ok) {
      return;
    }
  }

  savedSortPresets[trimmedName] = {
    criteria: [...wbSortCriteria.map((c) => ({ ...c }))],
    customOrders: safeDeepClone(wbCustomSortOrders),
    acrossCards: wbSortAcrossCards,
  };
  storageManager.set(STORAGE_KEYS.SORT_PRESETS, savedSortPresets);
  renderSortPresetDropdown();
  document.getElementById("sortPresetDropdown").value = trimmedName;
  showToast(`Sort preset "${trimmedName}" saved!`);
}

/**
 * Load a sort preset from the dropdown
 */
function loadSortPreset() {
  const dropdown = document.getElementById("sortPresetDropdown");
  const presetName = dropdown.value;
  if (!presetName || !savedSortPresets[presetName]) return;

  const preset = savedSortPresets[presetName];

  // Handle both old and new format
  if (Array.isArray(preset)) {
    // Old format - just criteria array
    wbSortCriteria = [...preset.map((c) => ({ ...c }))];
  } else {
    // New format with customOrders and acrossCards
    wbSortCriteria = [...(preset.criteria || []).map((c) => ({ ...c }))];
    wbCustomSortOrders = safeDeepClone(preset.customOrders || {});
    wbSortAcrossCards = preset.acrossCards || false;

    // Update checkbox
    const checkbox = document.getElementById("sortAcrossCardsCheckbox");
    if (checkbox) checkbox.checked = wbSortAcrossCards;
  }

  renderSortCriteria();
}

/**
 * Delete the currently selected sort preset
 */
async function deleteSortPreset() {
  const dropdown = document.getElementById("sortPresetDropdown");
  const presetName = dropdown.value;
  if (!presetName || !savedSortPresets[presetName]) {
    showToast("⚠️ No preset selected to delete", { type: "warning" });
    return;
  }

  const ok = await showConfirm(`Delete sort preset "${presetName}"?`, {
    title: "Delete Preset",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;

  delete savedSortPresets[presetName];
  storageManager.set(STORAGE_KEYS.SORT_PRESETS, savedSortPresets);
  renderSortPresetDropdown();
  showToast(`Preset "${presetName}" deleted`);
}

/**
 * Render the sort criteria list with drag-and-drop
 */
function renderSortCriteria() {
  const container = document.getElementById("sortCriteriaList");
  if (!container) return;

  container.innerHTML = wbSortCriteria
    .map((criteria, idx) => {
      const fieldOptions = WB_SORT_FIELDS.map(
        (f) =>
          `<option value="${f.value}" ${criteria.field === f.value ? "selected" : ""}>${f.label}</option>`,
      ).join("");

      const dirIcon = criteria.direction === "asc" ? "↑" : "↓";
      const dirTitle =
        criteria.direction === "asc" ? "Ascending (A→Z)" : "Descending (Z→A)";

      const hasCustomOrder =
        wbCustomSortOrders[criteria.field] &&
        wbCustomSortOrders[criteria.field].length > 0;
      const customOrderIcon = hasCustomOrder ? "🎨" : "⚙️";
      const customOrderTitle = hasCustomOrder
        ? "Custom order set - click to edit"
        : "Set custom value order";

      const moveUpBtn =
        idx > 0
          ? `<button class="sort-move-btn" data-action="moveSortCriteria" data-idx="${idx}" data-arg="-1" title="Move up" aria-label="Move sort field up">▲</button>`
          : `<button class="sort-move-btn" disabled aria-hidden="true">▲</button>`;
      const moveDownBtn =
        idx < wbSortCriteria.length - 1
          ? `<button class="sort-move-btn" data-action="moveSortCriteria" data-idx="${idx}" data-arg="1" title="Move down" aria-label="Move sort field down">▼</button>`
          : `<button class="sort-move-btn" disabled aria-hidden="true">▼</button>`;

      return `
      <div class="sort-criteria-item" draggable="true" data-idx="${idx}"
           data-drag="wbSort" role="listitem" aria-label="Sort by ${criteria.field}, ${criteria.direction === "asc" ? "ascending" : "descending"}">
        <span class="wb-sort-rank">${idx + 1}</span>
        <span class="drag-handle" aria-hidden="true">☰</span>
        <div class="sort-move-btns">${moveUpBtn}${moveDownBtn}</div>
        <select data-onchange="updateSortField" data-key="${idx}" data-pass="value" aria-label="Sort field">${fieldOptions}</select>
        <button class="sort-dir-btn" data-action="toggleSortDirection" data-idx="${idx}" title="${dirTitle}" aria-label="${dirTitle}">${dirIcon}</button>
        <button class="custom-order-btn" data-action="openCustomOrderModal" data-arg="${criteria.field}" title="${customOrderTitle}" style="font-size: 11px; padding: 2px 6px;">${customOrderIcon}</button>
        <button class="remove-sort-btn" data-action="removeSortCriteria" data-idx="${idx}" aria-label="Remove sort field">✕</button>
      </div>
    `;
    })
    .join("");
}

/**
 * Add a new sort criteria
 */
function addSortCriteria() {
  // Find a field not yet used
  const usedFields = wbSortCriteria.map((c) => c.field);
  const availableField = WB_SORT_FIELDS.find(
    (f) => !usedFields.includes(f.value),
  );

  if (availableField) {
    wbSortCriteria.push({ field: availableField.value, direction: "asc" });
    persistSortCriteria();
    renderSortCriteria();
  } else {
    showToast("All sort fields are already in use");
  }
}

/**
 * Remove a sort criteria
 */
function removeSortCriteria(idx) {
  if (wbSortCriteria.length <= 1) {
    showToast("You must have at least one sort field");
    return;
  }
  wbSortCriteria.splice(idx, 1);
  persistSortCriteria();
  renderSortCriteria();
}

/**
 * Update the field for a sort criteria
 */
function updateSortField(idx, newField) {
  wbSortCriteria[parseInt(idx, 10)].field = newField;
  persistSortCriteria();
  renderSortCriteria();
}

/**
 * Toggle sort direction (asc/desc)
 */
function toggleSortDirection(idx) {
  wbSortCriteria[idx].direction =
    wbSortCriteria[idx].direction === "asc" ? "desc" : "asc";
  persistSortCriteria();
  renderSortCriteria();
}

// Drag and drop for sort criteria reordering
function handleSortDragStart(event, idx) {
  draggedSortItem = idx;
  event.target.classList.add("dragging");
}

function handleSortDragOver(event) {
  event.preventDefault();
}

function handleSortDrop(event, targetIdx) {
  event.preventDefault();
  if (draggedSortItem === null || draggedSortItem === targetIdx) return;

  // Reorder the array
  const moved = wbSortCriteria.splice(draggedSortItem, 1)[0];
  wbSortCriteria.splice(targetIdx, 0, moved);
  persistSortCriteria();
  renderSortCriteria();
}

function handleSortDragEnd(event) {
  event.target.classList.remove("dragging");
  draggedSortItem = null;
}

/**
 * Move a sort criteria up or down by keyboard-accessible buttons
 * @param {string} direction - "-1" for up, "1" for down
 */
function moveSortCriteria(direction, element) {
  const idx = parseInt(element.dataset.idx, 10);
  const dir = parseInt(direction, 10);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= wbSortCriteria.length) return;
  const moved = wbSortCriteria.splice(idx, 1)[0];
  wbSortCriteria.splice(newIdx, 0, moved);
  persistSortCriteria();
  renderSortCriteria();
}

// ============ Custom Value Order Functions ============

/**
 * Get all unique values for a field from all wristband cards
 */
function getUniqueValuesForField(field) {
  const values = new Set();
  // Check wristband cards
  wristbandCards.forEach((card) => {
    card.data.forEach((play) => {
      if (play && play[field]) {
        values.add(String(play[field]).trim());
      }
    });
  });
  // Also check global plays array (for playbook print sort)
  if (typeof plays !== "undefined" && Array.isArray(plays)) {
    plays.forEach((play) => {
      if (play && play[field]) {
        values.add(String(play[field]).trim());
      }
    });
  }
  return Array.from(values).sort();
}

/**
 * Open the custom order modal for a field
 */
function openCustomOrderModal(field) {
  const fieldLabel =
    WB_SORT_FIELDS.find((f) => f.value === field)?.label || field;
  const uniqueValues = getUniqueValuesForField(field);

  if (uniqueValues.length === 0) {
    showToast(`No values found for "${fieldLabel}" — add some plays first`);
    return;
  }

  // Get existing custom order or use unique values
  let orderedValues = wbCustomSortOrders[field] || [];
  uniqueValues.forEach((val) => {
    if (!orderedValues.includes(val)) orderedValues.push(val);
  });
  orderedValues = orderedValues.filter((val) => uniqueValues.includes(val));

  showReorderModal(orderedValues, {
    title: `Custom Sort Order: ${fieldLabel}`,
    onSave(order) {
      wbCustomSortOrders[field] = order;
      storageManager.set(STORAGE_KEYS.CUSTOM_SORT_ORDERS, wbCustomSortOrders);
      renderSortCriteria();
      if (typeof renderPbPrintSort === "function") renderPbPrintSort();
    },
    onClear() {
      delete wbCustomSortOrders[field];
      storageManager.set(STORAGE_KEYS.CUSTOM_SORT_ORDERS, wbCustomSortOrders);
      renderSortCriteria();
      if (typeof renderPbPrintSort === "function") renderPbPrintSort();
    },
  });
}

/**
 * Toggle sort across cards option
 */
function toggleSortAcrossCards() {
  const checkbox = document.getElementById("sortAcrossCardsCheckbox");
  wbSortAcrossCards = checkbox ? checkbox.checked : false;
}

// ============ Cell Drag-and-Drop for Swapping ============

/**
 * Handle drag start for cell swapping
 */
function handleCellDragStart(event, cellIdx) {
  draggedCellIndex = cellIdx;
  event.target.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
}

/**
 * Handle drag over for cell swapping
 */
function handleCellDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  // Add visual feedback
  event.currentTarget.classList.add("drag-over");
}

/**
 * Handle drag leave for cell swapping
 */
function handleCellDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

/**
 * Handle drop for cell swapping
 */
function handleCellDrop(event, targetIdx) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  if (draggedCellIndex === null || draggedCellIndex === targetIdx) return;

  saveWristbandState();

  const cardData = wristbandCards[currentCardIndex].data;

  // Swap the plays
  const temp = cardData[draggedCellIndex];
  cardData[draggedCellIndex] = cardData[targetIdx];
  cardData[targetIdx] = temp;

  // Swap customizations too
  const dragKey = `${currentCardIndex}-${draggedCellIndex}`;
  const targetKey = `${currentCardIndex}-${targetIdx}`;
  const tempCustom = cellCustomizations[dragKey];

  if (cellCustomizations[targetKey]) {
    cellCustomizations[dragKey] = cellCustomizations[targetKey];
  } else {
    delete cellCustomizations[dragKey];
  }

  if (tempCustom) {
    cellCustomizations[targetKey] = tempCustom;
  } else {
    delete cellCustomizations[targetKey];
  }

  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Handle drag end for cell swapping
 */
function handleCellDragEnd(event) {
  event.target.classList.remove("dragging");
  draggedCellIndex = null;
}

/**
 * Compare two values using custom order if available
 */
function compareWithCustomOrder(valA, valB, field, direction) {
  const customOrder = wbCustomSortOrders[field];

  if (customOrder && customOrder.length > 0) {
    // Use custom order - values not in list go to end
    let idxA = customOrder.indexOf(valA);
    let idxB = customOrder.indexOf(valB);

    // If not found, put at end
    if (idxA === -1) idxA = customOrder.length + 1;
    if (idxB === -1) idxB = customOrder.length + 1;

    let cmp = idxA - idxB;
    if (direction === "desc") cmp = -cmp;
    return cmp;
  } else {
    // Standard alphabetical comparison
    const a = String(valA || "").toLowerCase();
    const b = String(valB || "").toLowerCase();
    let cmp = a.localeCompare(b, undefined, { numeric: true });
    if (direction === "desc") cmp = -cmp;
    return cmp;
  }
}

/**
 * Persist sort criteria to localStorage
 */
function persistSortCriteria() {
  storageManager.set(STORAGE_KEYS.WRISTBAND_SORT_CRITERIA, wbSortCriteria);
}

/**
 * Apply the sort to all wristband cards
 */
function applyWristbandSort() {
  if (wbSortCriteria.length === 0) return;

  saveWristbandState();

  if (wbSortAcrossCards) {
    // Sort across ALL cards as one pool
    applyWristbandSortAcrossCards();
  } else {
    // Sort each card independently
    applyWristbandSortPerCard();
  }

  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Sort each card independently
 */
function applyWristbandSortPerCard() {
  wristbandCards.forEach((card, cardIdx) => {
    // Get plays (non-null cells) with their original indices
    const playsWithIdx = card.data
      .map((play, idx) => ({ play, idx, cardIdx }))
      .filter((item) => item.play !== null);

    // Sort the plays
    playsWithIdx.sort((a, b) => {
      for (const criteria of wbSortCriteria) {
        const valA = String(a.play[criteria.field] || "").trim();
        const valB = String(b.play[criteria.field] || "").trim();

        const cmp = compareWithCustomOrder(
          valA,
          valB,
          criteria.field,
          criteria.direction,
        );
        if (cmp !== 0) return cmp;
      }
      return 0;
    });

    // Build new customization mappings
    const newCustomizations = {};

    // Rebuild the card data with sorted plays in order
    const newData = Array(40).fill(null);
    playsWithIdx.forEach((item, newIdx) => {
      newData[newIdx] = item.play;

      // Map customization from old position to new position
      const oldKey = `${cardIdx}-${item.idx}`;
      const newKey = `${cardIdx}-${newIdx}`;
      if (cellCustomizations[oldKey]) {
        newCustomizations[newKey] = cellCustomizations[oldKey];
      }
    });

    // Clear old customizations for this card and apply new ones
    for (let i = 0; i < 40; i++) {
      delete cellCustomizations[`${cardIdx}-${i}`];
    }
    Object.assign(cellCustomizations, newCustomizations);

    card.data = newData;
  });
}

/**
 * Sort across all cards as one pool, then redistribute
 */
function applyWristbandSortAcrossCards() {
  // Collect all plays from all cards with their source info
  const allPlays = [];
  wristbandCards.forEach((card, cardIdx) => {
    card.data.forEach((play, cellIdx) => {
      if (play !== null) {
        allPlays.push({
          play,
          origCardIdx: cardIdx,
          origCellIdx: cellIdx,
        });
      }
    });
  });

  // Sort all plays together
  allPlays.sort((a, b) => {
    for (const criteria of wbSortCriteria) {
      const valA = String(a.play[criteria.field] || "").trim();
      const valB = String(b.play[criteria.field] || "").trim();

      const cmp = compareWithCustomOrder(
        valA,
        valB,
        criteria.field,
        criteria.direction,
      );
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  // Build new customization mappings
  const newCustomizations = {};

  // Clear all cards
  wristbandCards.forEach((card, cardIdx) => {
    card.data = Array(40).fill(null);
    // Clear old customizations for this card
    for (let i = 0; i < 40; i++) {
      delete cellCustomizations[`${cardIdx}-${i}`];
    }
  });

  // Redistribute plays across cards (40 per card)
  let currentCardIdx = 0;
  let currentCellIdx = 0;

  allPlays.forEach((item) => {
    if (currentCellIdx >= 40) {
      currentCardIdx++;
      currentCellIdx = 0;

      // Create new card if needed
      if (
        currentCardIdx >= wristbandCards.length &&
        currentCardIdx < MAX_CARDS
      ) {
        wristbandCards.push({
          name: `Card ${currentCardIdx + 1}`,
          data: Array(40).fill(null),
          settings: { ...wristbandCards[0].settings },
        });
      }
    }

    if (currentCardIdx < wristbandCards.length) {
      wristbandCards[currentCardIdx].data[currentCellIdx] = item.play;

      // Map customization from old position to new position
      const oldKey = `${item.origCardIdx}-${item.origCellIdx}`;
      const newKey = `${currentCardIdx}-${currentCellIdx}`;
      if (cellCustomizations[oldKey]) {
        newCustomizations[newKey] = cellCustomizations[oldKey];
      }

      currentCellIdx++;
    }
  });

  // Apply new customizations
  Object.assign(cellCustomizations, newCustomizations);
}

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

/**
 * Wristband display-option checkbox IDs (single source of truth)
 */
const WB_DISPLAY_OPTION_IDS = [
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

/**
 * Select all display options for wristband
 */
function selectAllWbOptions() {
  WB_DISPLAY_OPTION_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });
  renderWristbandGrid();
  renderWristbandPlays();
}

/**
 * Clear all display options for wristband
 */
function clearAllWbOptions() {
  WB_DISPLAY_OPTION_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  renderWristbandGrid();
  renderWristbandPlays();
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
    populateWristbandCheckboxFilters();
    renderCardTabs();
    renderWristbandPlays();
    renderWristbandGrid();
    loadSavedWristbandsList();
    initSortCriteria();

    // Check for unsaved wristband draft
    checkWristbandDraft();
  } catch (err) {
    console.error("initWristband error:", err);
    showToast("❌ Error initializing wristband.", {
      duration: 3000,
      type: "error",
    });
  }
}

/**
 * Render the card tabs at the top of the wristband preview
 */
function renderCardTabs() {
  const container = document.getElementById("cardTabs");
  let html = wristbandCards
    .map((card, i) => {
      const count = card.data.filter((p) => p !== null).length;
      const total = card.data.length;
      const descHtml = card.description
        ? `<span class="card-tab-desc" title="${escapeHtml(card.description)}">${escapeHtml(card.description)}</span>`
        : "";
      return `
        <div class="card-tab ${i === currentCardIndex ? "active" : ""}" data-action="switchCard" data-idx="${i}" title="Double-click to rename">
          <span class="card-tab-name">${escapeHtml(card.name)}</span>
          ${descHtml}
          <span class="card-count">${count}/${total}</span>
        </div>
      `;
    })
    .join("");

  if (wristbandCards.length < MAX_CARDS) {
    html += `<button class="add-card-btn" data-action="addNewCard" title="Add new card">+ Add Card</button>`;
  }

  if (wristbandCards.length < MAX_CARDS) {
    html += `<button class="btn btn-sm wb-duplicate-card-btn" data-action="duplicateCard" title="Duplicate current card">📋 Duplicate</button>`;
  }

  if (wristbandCards.length > 1) {
    html += `<button class="btn btn-danger btn-sm wb-remove-card-btn" data-action="removeCurrentCard" title="Remove current card">🗑 Remove</button>`;
  }

  container.innerHTML = html;
}

/**
 * Switch to a different card
 * @param {number} index - Card index
 */
function switchCard(index) {
  currentCardIndex = index;
  renderCardTabs();
  renderWristbandGrid();
  updateCardColorPicker();
}

/**
 * Add a new card to the wristband
 */
function addNewCard() {
  if (wristbandCards.length >= MAX_CARDS) return;
  saveWristbandState();
  wristbandCards.push({
    name: `Card ${wristbandCards.length + 1}`,
    data: Array(40).fill(null),
  });
  currentCardIndex = wristbandCards.length - 1;
  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Remove the current card
 */
async function removeCurrentCard() {
  if (wristbandCards.length <= 1) return;
  const ok = await showConfirm(
    `Remove ${wristbandCards[currentCardIndex].name}?`,
    { title: "Remove Card", icon: "🗑️", confirmText: "Remove", danger: true },
  );
  if (!ok) return;
  saveWristbandState();
  wristbandCards.splice(currentCardIndex, 1);
  currentCardIndex = Math.min(currentCardIndex, wristbandCards.length - 1);
  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Duplicate the current card
 */
function duplicateCard() {
  if (wristbandCards.length >= MAX_CARDS) {
    showToast(`Maximum ${MAX_CARDS} cards allowed`);
    return;
  }
  saveWristbandState();
  const src = wristbandCards[currentCardIndex];
  const clone = {
    name: `${src.name} (Copy)`,
    data: safeDeepClone(src.data),
  };
  wristbandCards.splice(currentCardIndex + 1, 0, clone);
  // Copy cell customizations for the new card
  const newIdx = currentCardIndex + 1;
  // Shift existing customizations for cards after the insertion point
  for (let ci = wristbandCards.length - 1; ci > newIdx; ci--) {
    for (let si = 0; si < 40; si++) {
      const oldKey = `${ci - 1}-${si}`;
      const newKey = `${ci}-${si}`;
      if (cellCustomizations[oldKey]) {
        cellCustomizations[newKey] = cellCustomizations[oldKey];
      } else {
        delete cellCustomizations[newKey];
      }
    }
  }
  // Copy source card customizations to the new card
  for (let si = 0; si < 40; si++) {
    const srcKey = `${currentCardIndex}-${si}`;
    const dstKey = `${newIdx}-${si}`;
    if (cellCustomizations[srcKey]) {
      cellCustomizations[dstKey] = safeDeepClone(cellCustomizations[srcKey]);
    }
  }
  currentCardIndex = newIdx;
  renderCardTabs();
  renderWristbandGrid();
  showToast(`Duplicated as "${escapeHtml(clone.name)}"`);
}

/**
 * Rename a card via double-click on the tab
 * @param {number} index - Card index
 */
async function renameCard(index) {
  const card = wristbandCards[index];
  if (!card) return;
  const newName = await showPrompt("Rename card:", card.name, {
    title: "Rename Card",
    icon: "✏️",
    placeholder: "Card name",
  });
  if (newName !== null && newName.trim()) {
    card.name = newName.trim();
    renderCardTabs();
  }
}

/**
 * Get the current card's data array
 * @returns {Array} Array of plays (or nulls)
 */
function getCurrentCardData() {
  return wristbandCards[currentCardIndex]?.data || [];
}

/**
 * Set a play in the current card
 * @param {number} index - Cell index
 * @param {Object} play - Play object
 */
function setCurrentCardData(index, play) {
  if (wristbandCards[currentCardIndex]) {
    wristbandCards[currentCardIndex].data[index] = play;
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
  const clearBtn = document.getElementById("clearWbSearch");
  if (clearBtn) clearBtn.style.display = "none";
  filterWristbandPlays();
}

/**
 * Render the available plays list for the wristband
 */
function renderWristbandPlays() {
  const type = document.getElementById("wbFilterType").value;
  const search = document.getElementById("wbSearchPlay").value.toLowerCase();
  // Toggle search clear button
  const clearBtn = document.getElementById("clearWbSearch");
  if (clearBtn) clearBtn.style.display = search ? "flex" : "none";

  let filtered = plays.filter((p) => {
    if (type && p.type !== type) return false;
    if (
      search &&
      !p.play.toLowerCase().includes(search) &&
      !p.formation.toLowerCase().includes(search) &&
      !p.protection.toLowerCase().includes(search)
    )
      return false;
    if (wbSelectedTempos.length > 0 && !wbSelectedTempos.includes(p.tempo))
      return false;
    if (
      wbSelectedPersonnel.length > 0 &&
      !wbSelectedPersonnel.includes(p.personnel)
    )
      return false;
    return true;
  });

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

    // Build prefix with cadence first, then any extra personnel tag
    const oddPrefix = getCadencePrefix(oddCustom) + getCustomPersonnelPrefix(oddCustom, opts);
    const evenPrefix = getCadencePrefix(evenCustom) + getCustomPersonnelPrefix(evenCustom, opts);
    const oddPostfix = opts.cadenceReminder ? getCadencePostfix(oddCustom) : "";
    const evenPostfix = opts.cadenceReminder ? getCadencePostfix(evenCustom) : "";

    // Number cells match the play cell background
    const oddNumBg = oddBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const oddNumFg = oddBg ? (isColorDark(oddBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
    const evenNumBg = evenBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const evenNumFg = evenBg ? (isColorDark(evenBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");

    html += `<div class="wristband-cell num-cell" style="background: ${oddNumBg}; color: ${oddNumFg};">${oddNum}</div>`;

    // Odd play cell
    if (oddPlay) {
      const oddDisplay = opts.lineCallOnly ? getLineCallOnlyDisplay(oddPlay, opts) : getFullCall(oddPlay, opts);
      html += `
        <div class="wristband-cell filled" style="${oddStyle}" 
             draggable="true"
             data-drag="wbCell" data-cell-idx="${oddIndex}"
             data-card="${currentCardIndex}">
          <span class="cell-play">${oddPrefix}${oddDisplay}${oddPostfix}</span>
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
      const evenDisplay = opts.lineCallOnly ? getLineCallOnlyDisplay(evenPlay, opts) : getFullCall(evenPlay, opts);
      html += `
        <div class="wristband-cell filled" style="${evenStyle}" 
             draggable="true"
             data-drag="wbCell" data-cell-idx="${evenIndex}"
             data-card="${currentCardIndex}">
          <span class="cell-play">${evenPrefix}${evenDisplay}${evenPostfix}</span>
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

  // Update stats bar
  updateWbStats();

  // Refresh tab badge counts
  if (typeof updateTabBadges === "function") updateTabBadges();
}

// ============ Cell Popup Functions ============

/**
 * Open the cell popup for editing
 * @param {number} cardIdx - Card index
 * @param {number} cellIdx - Cell index
 * @param {Event} event - Click event
 */
function openCellPopup(cardIdx, cellIdx, event) {
  event.preventDefault();
  event.stopPropagation();

  const cardData = wristbandCards[cardIdx]?.data;
  if (!cardData) return;

  // Dismiss empty state overlay when editing begins
  const emptyOverlay = document.querySelector(".wb-grid-empty-state.visible");
  if (emptyOverlay) emptyOverlay.classList.remove("visible");

  currentEditingCell = { cardIdx, cellIdx };

  // Focus trap + Escape key for the overlay
  const overlay = document.getElementById("cellPopupOverlay");
  if (!overlay._focusTrapAdded) {
    trapFocus(overlay);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeCellPopup();
      }
    });
    overlay._focusTrapAdded = true;
  }
  initCellPopupKeyNav();
  const currentPlay = cardData[cellIdx];
  const key = `${cardIdx}-${cellIdx}`;
  const existing = cellCustomizations[key] || {};
  pendingBgColor = existing.bgColor || "";
  pendingTextColor = existing.textColor || UI_COLORS.textBlack;
  pendingCadence = existing.cadence || (existing.onTwo ? "$" : "");
  pendingExtraPersonnel = existing.extraPersonnel || "";
  pendingPlaySelection = currentPlay;

  const hasPlay = currentPlay !== null;

  // Update popup title - account for card offset
  const cardOffset = cardIdx * 40;
  const displayNum = cellIdx + 11 + cardOffset;
  document.getElementById("cellPopupTitle").textContent = hasPlay
    ? `📝 Edit Cell #${displayNum}`
    : `➕ Add Play to Cell #${displayNum}`;

  // Show/hide sections
  if (hasPlay) {
    document.getElementById("cellPopupPlayInfo").classList.remove("hidden");
    document.getElementById("cellPopupPlaySelector").classList.add("hidden");
    document.getElementById("cellPopupColors").classList.remove("hidden");
  } else {
    document.getElementById("cellPopupPlayInfo").classList.add("hidden");
    document.getElementById("cellPopupPlaySelector").classList.remove("hidden");
    document.getElementById("cellPopupColors").classList.add("hidden");
  }

  if (hasPlay) {
    document.getElementById("cellPopupPlayName").innerHTML =
      `<strong>Current Play:</strong> ${getFullCall(currentPlay, getWristbandDisplayOptions())}`;
  } else {
    document.getElementById("cellPlaySearch").value = "";
    populateCellPlayList();
  }

  // Update swatch selections
  updateSwatchSelection("bgColorSwatches", pendingBgColor);
  updateSwatchSelection("textColorSwatches", pendingTextColor);
  document.getElementById("cellCadence").value = pendingCadence;
  document.getElementById("cellExtraPersonnel").value = pendingExtraPersonnel;
  populateWbPersonnelDatalist();

  overlay.classList.remove("hidden");

  // Auto-focus the search input for empty cells so user can type immediately
  if (!currentPlay) {
    setTimeout(() => document.getElementById("cellPlaySearch")?.focus(), 50);
  }
}

/**
 * Show the play selector in the popup
 */
function showPlaySelector() {
  document.getElementById("cellPopupPlaySelector").classList.remove("hidden");
  document.getElementById("cellPlaySearch").value = "";
  populateCellPlayList();
}

/**
 * Populate the play list in the cell popup
 */
function populateCellPlayList() {
  highlightedPlayIndex = -1;
  const search = document.getElementById("cellPlaySearch").value.toLowerCase();
  const type = document.getElementById("wbFilterType")?.value || "";

  let filtered = plays.filter((p) => {
    if (type && p.type !== type) return false;
    if (wbSelectedTempos.length > 0 && !wbSelectedTempos.includes(p.tempo))
      return false;
    if (
      wbSelectedPersonnel.length > 0 &&
      !wbSelectedPersonnel.includes(p.personnel)
    )
      return false;
    if (search) {
      const fullCall = getFullCall(p).toLowerCase();
      if (!fullCall.includes(search)) return false;
    }
    return true;
  });

  const container = document.getElementById("cellPlayList");
  if (filtered.length === 0) {
    container.innerHTML = `<div class="wb-avail-empty">No plays match filters</div>`;
    return;
  }

  container.innerHTML = filtered
    .slice(0, 50)
    .map(
      (p) => `
      <div class="cell-play-option" data-action="selectPlayForCell" data-idx="${plays.indexOf(p)}">
        <span class="cell-play-option-type">${escapeHtml(p.type || "Play")}</span> ${getFullCall(p)}
      </div>
    `,
    )
    .join("");
}

/**
 * Filter plays in the cell popup
 */
function filterCellPlays() {
  populateCellPlayList();
}

/**
 * Select a play for the current cell
 * @param {number} playIndex - Index in the plays array
 */
function selectPlayForCell(playIndex) {
  const { cardIdx, cellIdx } = currentEditingCell;
  if (cardIdx === null || cellIdx === null) return;

  saveWristbandState();
  const play = plays[playIndex];
  wristbandCards[cardIdx].data[cellIdx] = play;
  pendingPlaySelection = play;

  // Update the popup to show edit mode - account for card offset
  const cardOffset = cardIdx * 40;
  const displayNum = cellIdx + 11 + cardOffset;
  document.getElementById("cellPopupTitle").textContent =
    `📝 Edit Cell #${displayNum}`;
  document.getElementById("cellPopupPlayInfo").classList.remove("hidden");
  document.getElementById("cellPopupPlaySelector").classList.add("hidden");
  document.getElementById("cellPopupColors").classList.remove("hidden");
  document.getElementById("cellPopupPlayName").innerHTML =
    `<strong>Current Play:</strong> ${getFullCall(play, getWristbandDisplayOptions())}`;

  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Remove the play from the current cell via popup
 */
function removeCellPlayFromPopup() {
  const { cardIdx, cellIdx } = currentEditingCell;
  if (cardIdx === null || cellIdx === null) return;

  saveWristbandState();
  wristbandCards[cardIdx].data[cellIdx] = null;
  const key = `${cardIdx}-${cellIdx}`;
  delete cellCustomizations[key];

  closeCellPopup();
  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Close the cell popup
 * @param {Event} event - Click event
 */
function closeCellPopup(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("cellPopupOverlay").classList.add("hidden");
  currentEditingCell = { cardIdx: null, cellIdx: null };
  pendingPlaySelection = null;
}

/**
 * Update swatch selection UI
 * @param {string} containerId - Container element ID
 * @param {string} selectedColor - Selected color value
 */
function updateSwatchSelection(containerId, selectedColor) {
  const container = document.getElementById(containerId);
  container.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.classList.remove("selected");
    if (swatch.dataset.color === selectedColor) {
      swatch.classList.add("selected");
    }
  });
}

/**
 * Populate the Extra Personnel datalist with unique personnel values from the playbook.
 * Runs each time the cell popup opens so it always reflects the current CSV.
 */
function populateWbPersonnelDatalist() {
  const datalist = document.getElementById("wbPersonnelOptions");
  if (!datalist) return;
  const unique = [...new Set(plays.map((p) => p.personnel).filter((p) => p && p.trim()))].sort();
  datalist.innerHTML = unique.map((p) => `<option value="${escapeHtml(p)}"></option>`).join("");
}

/**
 * Apply the cell style from the popup
 */
function applyCellStyle() {
  const { cardIdx, cellIdx } = currentEditingCell;
  if (cardIdx === null || cellIdx === null) return;

  saveWristbandState();
  const key = `${cardIdx}-${cellIdx}`;
  const cadence = document.getElementById("cellCadence").value;
  const extraPersonnel = document
    .getElementById("cellExtraPersonnel")
    .value.trim();

  if (
    pendingBgColor ||
    pendingTextColor !== UI_COLORS.textBlack ||
    cadence ||
    extraPersonnel
  ) {
    cellCustomizations[key] = {
      bgColor: pendingBgColor,
      textColor: pendingTextColor,
      cadence: cadence,
      extraPersonnel: extraPersonnel,
    };
  } else {
    delete cellCustomizations[key];
  }

  closeCellPopup();
  renderWristbandGrid();
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
  const type = document.getElementById("wbFilterType").value;
  const search = document.getElementById("wbSearchPlay").value.toLowerCase();

  const filtered = plays.filter((p) => {
    if (type && p.type !== type) return false;
    if (
      search &&
      !p.play.toLowerCase().includes(search) &&
      !p.formation.toLowerCase().includes(search)
    )
      return false;
    if (wbSelectedTempos.length > 0 && !wbSelectedTempos.includes(p.tempo))
      return false;
    if (
      wbSelectedPersonnel.length > 0 &&
      !wbSelectedPersonnel.includes(p.personnel)
    )
      return false;
    return true;
  });

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
 * Print the wristband
 */
function printWristband() {
  try {
    showToast("🖨️ Preparing wristband…", 2500);
    const container = document.getElementById("wristbandPrintCards");
    const numCards = wristbandCards.length;
    const opts = getWristbandDisplayOptions();
    const { highlightHuddle, highlightCandy } = opts;

    const useMultiCardLayout = numCards > 1 && numCards <= 5;

    let allHtml = "";

    wristbandCards.forEach((card, cardIdx) => {
      let cardHtml = `<div class="wristband-card"><div class="wristband-grid" style="grid-template-rows: repeat(${WB_ROWS}, 1fr);">`;

      // Calculate offset for this card's numbers
      const cardOffset = cardIdx * 40;
      const pCardColor = card.cardColor || "";

      for (let row = 0; row < WB_ROWS; row++) {
        const oddNum = row * 2 + 11 + cardOffset;
        const evenNum = row * 2 + 12 + cardOffset;
        const oddIndex = row * 2;
        const evenIndex = row * 2 + 1;

        const oddPlay = card.data[oddIndex];
        const evenPlay = card.data[evenIndex];

        const oddKey = `${cardIdx}-${oddIndex}`;
        const evenKey = `${cardIdx}-${evenIndex}`;
        const oddCustom = cellCustomizations[oddKey] || {};
        const evenCustom = cellCustomizations[evenKey] || {};

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

        const oddBg = getCellBgColor(oddCustom, oddIsHuddle, oddIsCandy, row, pCardColor);
        let oddStyle = oddBg ? `background:${oddBg};` : "";
        oddStyle += oddCustom.textColor ? `color:${oddCustom.textColor};` : "";

        const evenBg = getCellBgColor(evenCustom, evenIsHuddle, evenIsCandy, row, pCardColor);
        let evenStyle = evenBg ? `background:${evenBg};` : "";
        evenStyle += evenCustom.textColor
          ? `color:${evenCustom.textColor};`
          : "";

        const oddPrefix = getCadencePrefix(oddCustom) + getCustomPersonnelPrefix(oddCustom, opts);
        const evenPrefix = getCadencePrefix(evenCustom) + getCustomPersonnelPrefix(evenCustom, opts);
        const oddPostfix = opts.cadenceReminder ? getCadencePostfix(oddCustom) : "";
        const evenPostfix = opts.cadenceReminder ? getCadencePostfix(evenCustom) : "";

        const oddNumBg = oddBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
        const oddNumFg = oddBg ? (isColorDark(oddBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
        const evenNumBg = evenBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
        const evenNumFg = evenBg ? (isColorDark(evenBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
        cardHtml += `<div class="wristband-cell num-cell" style="background: ${oddNumBg}; color: ${oddNumFg};">${oddNum}</div>`;
        const oddDisplay = oddPlay ? (opts.lineCallOnly ? getLineCallOnlyDisplay(oddPlay, opts) : getFullCall(oddPlay, opts)) : "";
        cardHtml += `<div class="wristband-cell${oddPlay ? " filled" : ""}" style="${oddStyle}"><span class="cell-play">${oddPlay ? oddPrefix + oddDisplay + oddPostfix : ""}</span></div>`;
        cardHtml += `<div class="wristband-cell num-cell" style="background: ${evenNumBg}; color: ${evenNumFg};">${evenNum}</div>`;
        const evenDisplay = evenPlay ? (opts.lineCallOnly ? getLineCallOnlyDisplay(evenPlay, opts) : getFullCall(evenPlay, opts)) : "";
        cardHtml += `<div class="wristband-cell${evenPlay ? " filled" : ""}" style="${evenStyle}"><span class="cell-play">${evenPlay ? evenPrefix + evenDisplay + evenPostfix : ""}</span></div>`;
      }

      cardHtml += "</div></div>";
      allHtml += cardHtml;
    });

    // Single card: triplicate for cut-and-laminate on one page
    if (numCards === 1) {
      allHtml = allHtml + allHtml + allHtml;
    }

    container.innerHTML = allHtml;
    container.className =
      numCards === 1
        ? "single-card-tripled"
        : useMultiCardLayout
          ? "multi-card-layout"
          : "";

    document.getElementById("wristbandPrint").classList.remove("hidden");
    document.body.dataset.printMode = "wristband";
    document.body.classList.toggle("wb-tripled", numCards === 1);

    if (numCards === 1) {
      setupPrintPageStyle(`
      @media print {
        @page { size: letter portrait; margin: 0.25in; }
        html, body { width: 8.5in !important; height: 11in !important; }
        #wristbandPrintCards.single-card-tripled {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          height: 11in !important;
          gap: 0.25in !important;
        }
        #wristbandPrintCards.single-card-tripled .wristband-card {
          width: 5.5in !important;
          height: 3in !important;
          page-break-after: avoid !important;
          flex-shrink: 0 !important;
        }
      }
    `);
    } else if (useMultiCardLayout) {
      setupPrintPageStyle(`
      @media print { 
        @page { size: letter portrait; margin: 0.25in; }
        html, body { width: 8.5in !important; height: 11in !important; }
        #wristbandPrintCards.multi-card-layout {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 0.15in !important;
          padding-top: 0.1in !important;
        }
        #wristbandPrintCards.multi-card-layout .wristband-card {
          width: 5.5in !important;
          height: 3in !important;
          page-break-after: avoid !important;
          flex-shrink: 0 !important;
        }
      }
    `);
    } else {
      setupPrintPageStyle(
        "@media print { @page { size: 5.5in 3in; margin: 0; } }",
      );
    }

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Wristband");
        window.print();
        restoreTitle();
      } finally {
        document.getElementById("wristbandPrint").classList.add("hidden");
        delete document.body.dataset.printMode;
        document.body.classList.remove("wb-tripled");
      }
    }, 100);
  } catch (err) {
    console.error("printWristband error:", err);
    showToast("❌ Error printing wristband.", {
      duration: 4000,
      type: "error",
    });
  }
}

/* captureWbDisplaySettings() merged into getWristbandDisplayOptions() */

/**
 * Save the wristband to localStorage
 */
async function saveWristband() {
  try {
    // Check if all cards are empty
    const totalPlays = wristbandCards.reduce(
      (sum, c) => sum + c.data.filter((p) => p !== null).length,
      0,
    );
    if (totalPlays === 0) {
      const proceed = await showConfirm("All cards are empty. Save anyway?", {
        title: "Empty Wristband",
        icon: "⚠️",
        confirmText: "Save Empty",
      });
      if (!proceed) return;
    }

    const name = await showPrompt(
      "Name for this wristband set:",
      `Wristband Set ${new Date().toLocaleDateString()}`,
      { title: "Save Wristband", icon: "💾" },
    );
    if (!name) return;
    const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);

    // Check for duplicate name
    const existing = saved.find(
      (s) => s.title.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const choice = await showChoice(
        `A wristband named "${existing.title}" already exists.`,
        {
          title: "Duplicate Name",
          icon: "⚠️",
          option1: "💾 Overwrite",
          option2: "➕ Save as Copy",
        },
      );
      if (choice === "option1") {
        existing.title = name;
        existing.headerColor = wristbandHeaderColor;
        existing.cards = safeDeepClone(wristbandCards);
        existing.cellStyles = safeDeepClone(cellCustomizations);
        existing.displaySettings = getWristbandDisplayOptions();
        existing.savedAt = new Date().toISOString();
        storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
        loadSavedWristbandsList();
        populateScriptWristbandSelect();
        populateWristbandHighlightDropdown();
        markWristbandClean();
        storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
        showToast(`✅ "${name}" updated!`);
        return;
      } else if (choice !== "option2") {
        return; // Cancelled
      }
    }

    saved.push({
      id: Date.now(),
      title: name,
      headerColor: wristbandHeaderColor,
      cards: safeDeepClone(wristbandCards),
      cellStyles: safeDeepClone(cellCustomizations),
      displaySettings: getWristbandDisplayOptions(),
      savedAt: new Date().toISOString(),
    });

    storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
    loadSavedWristbandsList();
    populateScriptWristbandSelect();
    populateWristbandHighlightDropdown();
    markWristbandClean();
    storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
    showToast(`✅ "${name}" saved!`);
  } catch (err) {
    console.error("saveWristband error:", err);
    showToast("❌ Error saving wristband.", { duration: 4000, type: "error" });
  }
}

/**
 * Load the list of saved wristbands
 */
function loadSavedWristbandsList() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const container = document.getElementById("savedWristbandsList");
  const section = document.getElementById("savedWristbandsSection");

  if (saved.length === 0) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  const totalPlays = (wb) => {
    if (wb.cards)
      return wb.cards.reduce(
        (sum, c) => sum + c.data.filter((p) => p !== null).length,
        0,
      );
    if (wb.data) return wb.data.filter((p) => p !== null).length;
    return 0;
  };
  const cardCount = (wb) => (wb.cards ? wb.cards.length : 1);
  container.innerHTML = saved
    .map((s) => {
      const savedTime = s.savedAt
        ? new Date(s.savedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "";
      return `
        <div class="saved-script-card">
          <div class="saved-card-main">
            <div class="saved-card-title">${escapeHtml(s.title)}</div>
            <div class="saved-card-meta">
              <span>🃏 ${cardCount(s)} card(s)</span>
              <span>📝 ${totalPlays(s)} plays</span>
              ${savedTime ? `<span>💾 ${savedTime}</span>` : ""}
            </div>
          </div>
          <div class="saved-card-actions">
            <button class="saved-load-btn" data-action="loadWristband" data-idx="${s.id}" title="Load this wristband">Load</button>
            <button class="saved-rename-btn" data-action="renameSavedWristband" data-idx="${s.id}" title="Rename">✏️</button>
            <button class="saved-overwrite-btn" data-action="overwriteSavedWristband" data-idx="${s.id}" title="Overwrite with current wristband">⬆️</button>
            <button class="saved-del-btn" data-action="deleteSavedWristband" data-idx="${s.id}" title="Delete">✕</button>
          </div>
        </div>
        `;
    })
    .join("");
}

/**
 * Load a saved wristband
 * @param {number} id - Wristband ID
 */
function loadWristband(id) {
  try {
    const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
    const wb = saved.find((s) => s.id === id);
    if (!wb) return;

    wristbandHeaderColor = wb.headerColor || "transparent";

    if (wb.cards) {
      wristbandCards = safeDeepClone(wb.cards);
    } else if (wb.data) {
      wristbandCards = [{ name: "Card 1", data: wb.data }];
    } else {
      wristbandCards = [{ name: "Card 1", data: Array(40).fill(null) }];
    }

    cellCustomizations = wb.cellStyles ? safeDeepClone(wb.cellStyles) : {};
    currentCardIndex = 0;

    // Restore display settings if saved
    if (wb.displaySettings) {
      const ds = wb.displaySettings;
      const setCheckbox = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
      };

      setCheckbox("wbShowEmoji", ds.showEmoji);
      setCheckbox("wbUseSquares", ds.useSquares);
      setCheckbox("wbUnderEmoji", ds.underEmoji);
      setCheckbox("wbBoldShifts", ds.boldShifts);
      setCheckbox("wbRedShifts", ds.redShifts);
      setCheckbox("wbItalicMotions", ds.italicMotions);
      setCheckbox("wbRedMotions", ds.redMotions);
      setCheckbox("wbRemoveVowels", ds.noVowels || ds.removeVowels);
      setCheckbox("wbShowLineCall", ds.showLineCall);
      setCheckbox("wbLineCallOnly", ds.lineCallOnly);
      setCheckbox("wbCadenceReminder", ds.cadenceReminder);
      setCheckbox("wbHighlightHuddle", ds.highlightHuddle);
      setCheckbox("wbHighlightCandy", ds.highlightCandy);
    }

    document.querySelectorAll(".color-btn").forEach((b) => {
      const isTransparentBtn = b.classList.contains("color-btn-transparent");
      const isMatch =
        wristbandHeaderColor === "transparent"
          ? isTransparentBtn
          : b.style.background === wristbandHeaderColor ||
            b.style.backgroundColor === wristbandHeaderColor;
      b.classList.toggle("active", isMatch);
    });

    renderCardTabs();
    renderWristbandGrid();
    updateCardColorPicker();
    markWristbandClean();
    storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
    showToast(`Loaded "${wb.title}"`);
  } catch (err) {
    console.error("loadWristband error:", err);
    showToast("❌ Error loading wristband.", { duration: 4000, type: "error" });
  }
}

/**
 * Delete a saved wristband
 * @param {number} id - Wristband ID
 */
async function deleteSavedWristband(id) {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const target = saved.find((s) => s.id === id);
  if (!target) return;
  const ok = await showConfirm(`Delete "${target.title}"?`, {
    title: "Delete Wristband",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  const filtered = saved.filter((s) => s.id !== id);
  storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, filtered);
  loadSavedWristbandsList();
  populateScriptWristbandSelect();
  populateWristbandHighlightDropdown();
  showToast(`"${target.title}" deleted`);

  if (scriptWristband && scriptWristband.id === id) {
    scriptWristband = null;
    document.getElementById("scriptWristbandSelect").value = "";
    document.getElementById("scriptWristbandInfo").textContent = "";
    renderScript();
  }
}

/**
 * Rename a saved wristband
 * @param {number} id - Wristband ID
 */
async function renameSavedWristband(id) {
  let saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved.find((s) => s.id === id);
  if (!wb) return;
  const newName = await showPrompt("Rename wristband:", wb.title, {
    title: "Rename",
    icon: "✏️",
  });
  if (newName && newName.trim()) {
    wb.title = newName.trim();
    storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
    loadSavedWristbandsList();
    populateScriptWristbandSelect();
    populateWristbandHighlightDropdown();
    showToast(`Renamed to "${wb.title}"`);
  }
}

/**
 * Overwrite a saved wristband with the current wristband contents
 * @param {number} id - Wristband ID
 */
async function overwriteSavedWristband(id) {
  let saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved.find((s) => s.id === id);
  if (!wb) return;
  const ok = await showConfirm(
    `Overwrite "${wb.title}" with the current wristband?`,
    { title: "Overwrite", icon: "⚠️", confirmText: "Overwrite", danger: true },
  );
  if (!ok) return;

  wb.headerColor = wristbandHeaderColor;
  wb.cards = safeDeepClone(wristbandCards);
  wb.cellStyles = safeDeepClone(cellCustomizations);
  wb.displaySettings = getWristbandDisplayOptions();
  wb.savedAt = new Date().toISOString();
  storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
  loadSavedWristbandsList();
  populateScriptWristbandSelect();
  populateWristbandHighlightDropdown();
  markWristbandClean();
  storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
  showToast(`"${wb.title}" updated!`);
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
 * Initialize swatch click handlers
 */
function initSwatchHandlers() {
  document.getElementById("bgColorSwatches").addEventListener("click", (e) => {
    if (e.target.classList.contains("color-swatch")) {
      pendingBgColor = e.target.dataset.color;
      updateSwatchSelection("bgColorSwatches", pendingBgColor);
      // Auto-flip text color for contrast
      if (pendingBgColor && isColorDark(pendingBgColor)) {
        pendingTextColor = UI_COLORS.textWhite;
      } else if (pendingBgColor) {
        pendingTextColor = UI_COLORS.textBlack;
      }
      updateSwatchSelection("textColorSwatches", pendingTextColor);
    }
  });

  document
    .getElementById("textColorSwatches")
    .addEventListener("click", (e) => {
      if (e.target.classList.contains("color-swatch")) {
        pendingTextColor = e.target.dataset.color;
        updateSwatchSelection("textColorSwatches", pendingTextColor);
      }
    });
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
  let count = wbSelectedPersonnel.length + wbSelectedTempos.length;
  const typeFilter = document.getElementById("wbFilterType");
  if (typeFilter && typeFilter.value) count++;
  const searchBox = document.getElementById("wbSearchPlay");
  if (searchBox && searchBox.value.trim()) count++;

  const badge = document.getElementById("wbActiveFilterCount");
  if (badge) {
    if (count > 0) {
      badge.textContent = count + " active";
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
}

/* toggleWbDisplayOptions and toggleWbSortPanel merged into shared toggleCollapsiblePanel() in script.js */

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

// ============ Arrow Key Navigation in Cell Popup ============

/**
 * Handle arrow key navigation in the cell popup play list
 */
function initCellPopupKeyNav() {
  const overlay = document.getElementById("cellPopupOverlay");
  if (!overlay || overlay._arrowNavAdded) return;
  overlay._arrowNavAdded = true;

  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter")
      return;
    const list = document.getElementById("cellPlayList");
    if (!list) return;
    const items = list.querySelectorAll(".cell-play-option");
    if (items.length === 0) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "ArrowDown") {
      highlightedPlayIndex = Math.min(
        highlightedPlayIndex + 1,
        items.length - 1,
      );
    } else if (e.key === "ArrowUp") {
      highlightedPlayIndex = Math.max(highlightedPlayIndex - 1, 0);
    } else if (
      e.key === "Enter" &&
      highlightedPlayIndex >= 0 &&
      highlightedPlayIndex < items.length
    ) {
      items[highlightedPlayIndex].click();
      return;
    }

    items.forEach((item, i) => {
      item.classList.toggle("highlighted", i === highlightedPlayIndex);
    });
    if (items[highlightedPlayIndex]) {
      items[highlightedPlayIndex].scrollIntoView({ block: "nearest" });
    }
  });
}

// ============ Copy/Paste Cells ============

/**
 * Copy a cell's play and customizations
 */
function copyWbCell(cardIdx, cellIdx) {
  const play = wristbandCards[cardIdx]?.data[cellIdx];
  if (!play) {
    showToast("No play to copy");
    return;
  }
  const key = `${cardIdx}-${cellIdx}`;
  copiedCell = {
    play: safeDeepClone(play),
    customization: cellCustomizations[key]
      ? safeDeepClone(cellCustomizations[key])
      : null,
  };
  showToast("📋 Cell copied");
}

/**
 * Paste a copied cell to the target location
 */
function pasteWbCell(cardIdx, cellIdx) {
  if (!copiedCell) {
    showToast("Nothing to paste — copy a cell first");
    return;
  }
  saveWristbandState();
  wristbandCards[cardIdx].data[cellIdx] = safeDeepClone(copiedCell.play);
  const key = `${cardIdx}-${cellIdx}`;
  if (copiedCell.customization) {
    cellCustomizations[key] = safeDeepClone(copiedCell.customization);
  } else {
    delete cellCustomizations[key];
  }
  renderCardTabs();
  renderWristbandGrid();
  showToast("📋 Cell pasted");
}

// ============ Batch Color Editing ============

/**
 * Toggle batch selection on a cell (shift+click)
 */
function toggleBatchSelect(cardIdx, cellIdx) {
  const key = `${cardIdx}-${cellIdx}`;
  const idx = wbSelectedCells.indexOf(key);
  if (idx >= 0) {
    wbSelectedCells.splice(idx, 1);
  } else {
    wbSelectedCells.push(key);
  }
  // Toggle visual class on the cell
  const cells = document.querySelectorAll(
    `[data-drag='wbCell'][data-card='${cardIdx}'][data-cell-idx='${cellIdx}']`,
  );
  cells.forEach((c) => c.classList.toggle("wb-selected", idx < 0));
}

/**
 * Apply a background color to all batch-selected cells
 */
async function applyBatchColor() {
  if (wbSelectedCells.length === 0) {
    showToast("No cells selected — Shift+click cells first");
    return;
  }

  // Show color picker using existing swatches approach
  const colors = [
    { label: "Red", value: "#e74c3c" },
    { label: "Blue", value: "#3498db" },
    { label: "Green", value: "#27ae60" },
    { label: "Yellow", value: "#f1c40f" },
    { label: "Orange", value: "#e67e22" },
    { label: "Purple", value: "#9b59b6" },
    { label: "Clear", value: "" },
  ];
  const items = colors.map((c) => ({ label: c.label, value: c.value }));
  const picked = await showListPicker(
    "Choose a color for selected cells:",
    items,
    {
      title: "Batch Color",
      icon: "🎨",
    },
  );
  if (picked === null) return;

  saveWristbandState();
  wbSelectedCells.forEach((key) => {
    if (!cellCustomizations[key]) cellCustomizations[key] = {};
    if (picked === "") {
      delete cellCustomizations[key].bgColor;
      // Auto-adjust text color back
      cellCustomizations[key].textColor = UI_COLORS.textBlack;
    } else {
      cellCustomizations[key].bgColor = picked;
      cellCustomizations[key].textColor = isColorDark(picked)
        ? UI_COLORS.textWhite
        : UI_COLORS.textBlack;
    }
    // Clean up empty customization objects
    if (
      !cellCustomizations[key].bgColor &&
      !cellCustomizations[key].cadence &&
      cellCustomizations[key].textColor === UI_COLORS.textBlack
    ) {
      delete cellCustomizations[key];
    }
  });

  wbSelectedCells = [];
  renderWristbandGrid();
  showToast(
    `🎨 Color applied to ${wbSelectedCells.length || "all selected"} cells`,
  );
}

/**
 * Clear all batch selections
 */
function clearBatchSelect() {
  wbSelectedCells = [];
  document
    .querySelectorAll(".wristband-cell.wb-selected")
    .forEach((c) => c.classList.remove("wb-selected"));
}

// ============ Card Descriptions ============

/**
 * Edit the description/subtitle for a card
 */
async function editCardDescription(index) {
  const card = wristbandCards[index];
  if (!card) return;
  const desc = await showPrompt(
    `Add a description for ${card.name}:`,
    card.description || "",
    {
      title: "Card Description",
      icon: "📝",
      placeholder: "e.g. Run Heavy, Pass Heavy, 2-Minute",
    },
  );
  if (desc === null) return;
  card.description = desc.trim();
  renderCardTabs();
  markWristbandDirty();
  scheduleWristbandAutosave();
}

// ============ Export CSV ============

/**
 * Export the current wristband to a CSV file
 */
function exportWristbandCSV() {
  const rows = [
    [
      "Card",
      "Cell#",
      "Formation",
      "Protection",
      "Play",
      "Type",
      "Personnel",
      "BgColor",
      "Cadence",
    ],
  ];

  wristbandCards.forEach((card, cardIdx) => {
    const cardOffset = cardIdx * 40;
    card.data.forEach((play, cellIdx) => {
      const cellNum = cellIdx + 11 + cardOffset;
      const key = `${cardIdx}-${cellIdx}`;
      const custom = cellCustomizations[key] || {};
      if (play) {
        rows.push([
          card.name,
          cellNum,
          play.formation || "",
          play.protection || "",
          play.play || "",
          play.type || "",
          play.personnel || "",
          custom.bgColor || "",
          custom.cadence || (custom.onTwo ? "$" : ""),
        ]);
      }
    });
  });

  const csvContent = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wristband-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("📥 CSV exported");
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

  overlay.classList.add("visible");
  const input = document.getElementById("wbQuickSearchInput");
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
  if (overlay) overlay.classList.remove("visible");
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
      <span style="color:var(--color-text-muted);font-size:var(--font-size-2xs);">${escapeHtml(p.personnel || "")}</span>
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
  const idx = wbFavorites.indexOf(playIndex);
  if (idx >= 0) {
    wbFavorites.splice(idx, 1);
  } else {
    wbFavorites.push(playIndex);
  }
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

document.addEventListener("DOMContentLoaded", () => {
  // ── Wristband grid: drag + click delegation ──
  const grid = document.getElementById("wristbandGrid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-drag='wbCell']");
      if (!cell) return;
      const cardIdx = parseInt(cell.dataset.card, 10);
      const cellIdx = parseInt(cell.dataset.cellIdx, 10);

      // Shift+click for batch color select
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
      if (cell) handleCellDragStart(e, parseInt(cell.dataset.cellIdx, 10));
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
      if (targetCardIdx === currentCardIndex) return;

      const play = wristbandCards[currentCardIndex].data[draggedCellIndex];
      if (!play) return;

      // Find first empty cell in target card
      const emptyIdx = wristbandCards[targetCardIdx].data.findIndex(
        (c) => c === null,
      );
      if (emptyIdx === -1) {
        showToast("No empty cells on that card");
        return;
      }

      saveWristbandState();
      // Move the play
      wristbandCards[targetCardIdx].data[emptyIdx] = play;
      wristbandCards[currentCardIndex].data[draggedCellIndex] = null;

      // Move cell customizations
      const srcKey = `${currentCardIndex}-${draggedCellIndex}`;
      const dstKey = `${targetCardIdx}-${emptyIdx}`;
      if (cellCustomizations[srcKey]) {
        cellCustomizations[dstKey] = cellCustomizations[srcKey];
        delete cellCustomizations[srcKey];
      }

      draggedCellIndex = null;
      renderCardTabs();
      renderWristbandGrid();
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
