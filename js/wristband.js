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

// Cell customization storage: { "cardIdx-cellIdx": { bgColor, textColor, onTwo } }
let cellCustomizations = {};
let currentEditingCell = { cardIdx: null, cellIdx: null };
let pendingBgColor = "";
let pendingTextColor = "#000";
let pendingPlaySelection = null;
let pendingOnTwo = false;

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

// Autosave timer
let wristbandAutosaveTimer = null;

/**
 * Debounced autosave for the working wristband
 */
function scheduleWristbandAutosave() {
  if (wristbandAutosaveTimer) clearTimeout(wristbandAutosaveTimer);
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
  }, 3000);
}

/**
 * Check for and offer to restore a wristband draft
 */
async function checkWristbandDraft() {
  const draft = storageManager.get(STORAGE_KEYS.WRISTBAND_DRAFT, null);
  if (!draft || !draft.cards || draft.cards.length === 0) return;

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
    markWristbandDirty();
    showToast("🃏 Draft restored");
  } else {
    storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
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
 * Initialize sort criteria list with default
 */
function initSortCriteria() {
  if (wbSortCriteria.length === 0) {
    wbSortCriteria = [{ field: "personnel", direction: "asc" }];
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
      .map((name) => `<option value="${name}">${name}</option>`)
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
  storageManager.set("sortPresets", savedSortPresets);
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
    showToast("⚠️ No preset selected to delete");
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
  storageManager.set("sortPresets", savedSortPresets);
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

      return `
      <div class="sort-criteria-item" draggable="true" data-idx="${idx}"
           ondragstart="handleSortDragStart(event, ${idx})"
           ondragover="handleSortDragOver(event)"
           ondrop="handleSortDrop(event, ${idx})"
           ondragend="handleSortDragEnd(event)">
        <span class="drag-handle">☰</span>
        <select onchange="updateSortField(${idx}, this.value)">${fieldOptions}</select>
        <button class="sort-dir-btn" onclick="toggleSortDirection(${idx})" title="${dirTitle}">${dirIcon}</button>
        <button class="custom-order-btn" onclick="openCustomOrderModal('${criteria.field}')" title="${customOrderTitle}" style="font-size: 11px; padding: 2px 6px;">${customOrderIcon}</button>
        <button class="remove-sort-btn" onclick="removeSortCriteria(${idx})">✕</button>
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
  renderSortCriteria();
}

/**
 * Update the field for a sort criteria
 */
function updateSortField(idx, newField) {
  wbSortCriteria[idx].field = newField;
}

/**
 * Toggle sort direction (asc/desc)
 */
function toggleSortDirection(idx) {
  wbSortCriteria[idx].direction =
    wbSortCriteria[idx].direction === "asc" ? "desc" : "asc";
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
  renderSortCriteria();
}

function handleSortDragEnd(event) {
  event.target.classList.remove("dragging");
  draggedSortItem = null;
}

// ============ Custom Value Order Functions ============

/**
 * Get all unique values for a field from all wristband cards
 */
function getUniqueValuesForField(field) {
  const values = new Set();
  wristbandCards.forEach((card) => {
    card.data.forEach((play) => {
      if (play && play[field]) {
        values.add(String(play[field]).trim());
      }
    });
  });
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

  // Add any new values not in the custom order
  uniqueValues.forEach((val) => {
    if (!orderedValues.includes(val)) {
      orderedValues.push(val);
    }
  });

  // Remove values no longer in the data
  orderedValues = orderedValues.filter((val) => uniqueValues.includes(val));

  // Store temporarily for the modal
  window._tempCustomOrder = orderedValues;
  window._tempCustomOrderField = field;

  // Build modal HTML
  const modalHtml = `
    <div id="customOrderModal" class="modal-overlay" style="display: flex;" onclick="closeCustomOrderModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 400px;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
          <h3 style="margin: 0;">Custom Sort Order: ${fieldLabel}</h3>
          <button onclick="closeCustomOrderModal()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 12px; color: #666; margin-bottom: 10px;">
            Drag values to set your preferred sort order. Top = first.
          </p>
          <div id="customOrderList" class="custom-order-list">
            ${orderedValues
              .map(
                (val, idx) => `
              <div class="custom-order-item" draggable="true" data-value="${val}" data-idx="${idx}"
                   ondragstart="handleCustomOrderDragStart(event, ${idx})"
                   ondragover="handleCustomOrderDragOver(event)"
                   ondrop="handleCustomOrderDrop(event, ${idx})"
                   ondragend="handleCustomOrderDragEnd(event)">
                <span class="drag-handle">☰</span>
                <span class="order-number">${idx + 1}.</span>
                <span class="order-value">${val}</span>
              </div>
            `,
              )
              .join("")}
          </div>
          <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
            <button onclick="saveCustomOrder()" class="btn btn-primary" style="padding: 8px 16px;">
              💾 Save Order
            </button>
            <button onclick="clearCustomOrder()" class="btn btn-secondary" style="padding: 8px 16px;">
              🗑️ Clear Custom Order
            </button>
            <button onclick="closeCustomOrderModal()" class="btn" style="padding: 8px 16px;">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

/**
 * Close the custom order modal
 */
function closeCustomOrderModal(event) {
  if (event && event.target.id !== "customOrderModal") return;
  const modal = document.getElementById("customOrderModal");
  if (modal) modal.remove();
  delete window._tempCustomOrder;
  delete window._tempCustomOrderField;
}

/**
 * Save the custom order
 */
function saveCustomOrder() {
  const field = window._tempCustomOrderField;
  const order = window._tempCustomOrder;

  if (field && order) {
    wbCustomSortOrders[field] = order;
    storageManager.set("customSortOrders", wbCustomSortOrders);
    renderSortCriteria();
  }

  closeCustomOrderModal();
}

/**
 * Clear custom order for current field
 */
function clearCustomOrder() {
  const field = window._tempCustomOrderField;
  if (field) {
    delete wbCustomSortOrders[field];
    storageManager.set("customSortOrders", wbCustomSortOrders);
    renderSortCriteria();
  }
  closeCustomOrderModal();
}

// Custom order drag and drop
let draggedCustomOrderItem = null;

function handleCustomOrderDragStart(event, idx) {
  draggedCustomOrderItem = idx;
  event.target.classList.add("dragging");
}

function handleCustomOrderDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
}

function handleCustomOrderDrop(event, targetIdx) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");

  if (draggedCustomOrderItem === null || draggedCustomOrderItem === targetIdx)
    return;

  const order = window._tempCustomOrder;
  const moved = order.splice(draggedCustomOrderItem, 1)[0];
  order.splice(targetIdx, 0, moved);

  // Re-render the list
  const listContainer = document.getElementById("customOrderList");
  listContainer.innerHTML = order
    .map(
      (val, idx) => `
    <div class="custom-order-item" draggable="true" data-value="${val}" data-idx="${idx}"
         ondragstart="handleCustomOrderDragStart(event, ${idx})"
         ondragover="handleCustomOrderDragOver(event)"
         ondrop="handleCustomOrderDrop(event, ${idx})"
         ondragend="handleCustomOrderDragEnd(event)">
      <span class="drag-handle">☰</span>
      <span class="order-number">${idx + 1}.</span>
      <span class="order-value">${val}</span>
    </div>
  `,
    )
    .join("");
}

function handleCustomOrderDragEnd(event) {
  event.target.classList.remove("dragging");
  document
    .querySelectorAll(".custom-order-item")
    .forEach((el) => el.classList.remove("drag-over"));
  draggedCustomOrderItem = null;
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
 * Select all display options for wristband
 */
function selectAllWbOptions() {
  const ids = [
    "wbShowEmoji",
    "wbUseSquares",
    "wbUnderEmoji",
    "wbBoldShifts",
    "wbRedShifts",
    "wbItalicMotions",
    "wbRedMotions",
    "wbRemoveVowels",
    "wbShowLineCall",
    "wbHighlightHuddle",
    "wbHighlightCandy",
  ];
  ids.forEach((id) => {
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
  const ids = [
    "wbShowEmoji",
    "wbUseSquares",
    "wbUnderEmoji",
    "wbBoldShifts",
    "wbRedShifts",
    "wbItalicMotions",
    "wbRedMotions",
    "wbRemoveVowels",
    "wbShowLineCall",
    "wbHighlightHuddle",
    "wbHighlightCandy",
  ];
  ids.forEach((id) => {
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
}

/**
 * Render the card tabs at the top of the wristband preview
 */
function renderCardTabs() {
  const container = document.getElementById("cardTabs");
  let html = wristbandCards
    .map((card, i) => {
      const count = card.data.filter((p) => p !== null).length;
      return `
        <div class="card-tab ${i === currentCardIndex ? "active" : ""}" onclick="switchCard(${i})">
          ${card.name} <span class="card-count">(${count}/40)</span>
        </div>
      `;
    })
    .join("");

  if (wristbandCards.length < MAX_CARDS) {
    html += `<button class="add-card-btn" onclick="addNewCard()">+ Add Card</button>`;
  }

  if (wristbandCards.length > 1) {
    html += `<button class="btn btn-danger" style="margin-left: auto; padding: 6px 12px; font-size: 12px;" onclick="removeCurrentCard()">🗑 Remove Card</button>`;
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
  // Rename cards
  wristbandCards.forEach((c, i) => (c.name = `Card ${i + 1}`));
  currentCardIndex = Math.min(currentCardIndex, wristbandCards.length - 1);
  renderCardTabs();
  renderWristbandGrid();
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

  // Populate tempo checkboxes
  const tempoContainer = document.getElementById("wbTempoFilters");
  tempoContainer.innerHTML = tempos
    .map(
      (t) => `
        <label onclick="toggleWbCheckbox(this, 'tempo', '${t}')">
          <input type="checkbox" value="${t}"> ${t}
        </label>
      `,
    )
    .join("");

  // Populate personnel checkboxes
  const personnelContainer = document.getElementById("wbPersonnelFilters");
  personnelContainer.innerHTML = personnel
    .map(
      (p) => `
        <label onclick="toggleWbCheckbox(this, 'personnel', '${p}')">
          <input type="checkbox" value="${p}"> ${p}
        </label>
      `,
    )
    .join("");
}

/**
 * Toggle a checkbox filter
 * @param {HTMLElement} label - Label element
 * @param {string} filterType - 'tempo' or 'personnel'
 * @param {string} value - Filter value
 */
function toggleWbCheckbox(label, filterType, value) {
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
    .querySelectorAll(".color-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderWristbandGrid();
}

/**
 * Filter wristband plays
 */
function filterWristbandPlays() {
  renderWristbandPlays();
}

/**
 * Render the available plays list for the wristband
 */
function renderWristbandPlays() {
  const type = document.getElementById("wbFilterType").value;
  const search = document.getElementById("wbSearchPlay").value.toLowerCase();

  const filtered = plays.filter((p) => {
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

  const container = document.getElementById("wbAvailablePlays");
  container.innerHTML = filtered
    .map((p, i) => {
      const idx = plays.indexOf(p);
      const showEmoji =
        document.getElementById("wbShowEmoji")?.checked || false;
      const useSquares =
        document.getElementById("wbUseSquares")?.checked || false;
      const emoji =
        showEmoji && p.personnel
          ? getPersonnelEmoji(p.personnel, useSquares) + " "
          : "";
      const lineCallDisplay = p.lineCall
        ? ` [${p.lineCall}]`
        : " [no lineCall]";
      return `
        <div class="play-item" style="cursor: pointer;" ondblclick="addPlayToNextEmpty(${idx})" title="Double-click to add to next empty cell">
          <div class="play-info">
            <div class="play-name">${emoji}${p.formation} ${p.protection} ${p.play}</div>
            <div class="play-details">${p.type}${lineCallDisplay}</div>
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
    showToast("⚠️ No empty cells! Clear some or switch to another card");
    return;
  }

  saveWristbandState();
  setCurrentCardData(emptyIdx, play);
  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Place a play in a specific cell
 * @param {number} playIndex - Cell index
 */
function placePlayInCell(playIndex) {
  if (selectedWristbandPlay !== null) {
    saveWristbandState();
    setCurrentCardData(playIndex, plays[selectedWristbandPlay]);
    renderCardTabs();
    renderWristbandGrid();
  }
}

/**
 * Remove a play from a cell
 * @param {number} playIndex - Cell index
 * @param {Event} e - Click event
 */
function removeCellPlay(playIndex, e) {
  e.stopPropagation();
  saveWristbandState();
  setCurrentCardData(playIndex, null);
  renderCardTabs();
  renderWristbandGrid();
}

/**
 * Get the formatted play name for wristband display
 * @param {Object} play - Play object
 * @returns {string} Formatted play name HTML
 */
function getWristbandPlayName(play) {
  if (!play) return "";

  const showEmoji = document.getElementById("wbShowEmoji")?.checked || false;
  const useSquares = document.getElementById("wbUseSquares")?.checked || false;
  const underEmoji = document.getElementById("wbUnderEmoji")?.checked || false;
  const boldShifts = document.getElementById("wbBoldShifts")?.checked || false;
  const redShifts = document.getElementById("wbRedShifts")?.checked || false;
  const italicMotions =
    document.getElementById("wbItalicMotions")?.checked || false;
  const redMotions = document.getElementById("wbRedMotions")?.checked || false;
  const noVowels = document.getElementById("wbRemoveVowels")?.checked || false;
  const showLineCall =
    document.getElementById("wbShowLineCall")?.checked || false;

  // Check if play has "Under" - check the under column or legacy formTag locations
  const hasUnder =
    (play.under && play.under.trim() !== "") ||
    (play.formTag1 && play.formTag1.toLowerCase() === "under") ||
    (play.formTag2 && play.formTag2.toLowerCase() === "under");

  let parts = [];

  if (play.formation) parts.push(play.formation);
  if (play.formTag1 && !(underEmoji && play.formTag1.toLowerCase() === "under"))
    parts.push(play.formTag1);
  if (play.formTag2 && !(underEmoji && play.formTag2.toLowerCase() === "under"))
    parts.push(play.formTag2);
  // Add Under (if not using emoji display for it)
  if (play.under && !(underEmoji && play.under.trim() !== ""))
    parts.push(play.under);
  if (play.back) parts.push(play.back);

  // Handle shift with bold/red options
  if (play.shift) {
    let shiftText = noVowels ? removeVowels(play.shift) : play.shift;
    let shiftHtml = shiftText;
    if (boldShifts) shiftHtml = `<b>${shiftHtml}</b>`;
    if (redShifts) shiftHtml = `<span style="color:red">${shiftHtml}</span>`;
    if (boldShifts || redShifts) {
      parts.push(shiftHtml);
    } else {
      parts.push(play.shift);
    }
  }

  // Handle motion with italic/red options
  if (play.motion) {
    let motionText = noVowels ? removeVowels(play.motion) : play.motion;
    let motionHtml = motionText;
    if (italicMotions) motionHtml = `<i>${motionHtml}</i>`;
    if (redMotions) motionHtml = `<span style="color:red">${motionHtml}</span>`;
    if (italicMotions || redMotions) {
      parts.push(motionHtml);
    } else {
      parts.push(play.motion);
    }
  }

  if (play.protection) parts.push(play.protection);
  if (play.play) parts.push(play.play);
  if (play.playTag1) parts.push(play.playTag1);
  if (play.playTag2) parts.push(play.playTag2);

  let name = parts.join(" ");

  // Remove vowels if requested (skip already formatted shift/motion)
  if (noVowels) {
    name = name
      .split(/(<[^>]+>)/)
      .map((part) => {
        if (part.startsWith("<")) return part;
        return removeVowels(part);
      })
      .join("");
  }

  // Add line call in brackets
  if (showLineCall && play.lineCall) {
    const lc = noVowels ? removeVowels(play.lineCall) : play.lineCall;
    name += ` <i style="color:#888;font-size:0.85em">[${lc}]</i>`;
  }

  // Add emoji prefix
  let prefix = "";
  if (showEmoji && play.personnel) {
    prefix += getPersonnelEmoji(play.personnel, useSquares);
  }
  if (underEmoji && hasUnder) {
    prefix += "🍑";
  }
  if (prefix) name = prefix + " " + name;

  return name.trim();
}

/**
 * Render the wristband grid
 */
function renderWristbandGrid() {
  const grid = document.getElementById("wristbandGrid");
  grid.style.gridTemplateRows = `repeat(${WB_ROWS}, 1fr)`;
  const cardData = getCurrentCardData();
  const highlightHuddle =
    document.getElementById("wbHighlightHuddle")?.checked || false;
  const highlightCandy =
    document.getElementById("wbHighlightCandy")?.checked || false;

  let html = "";

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

    // Build styles - custom colors override auto highlights
    let oddStyle = oddCustom.bgColor
      ? `background:${oddCustom.bgColor};`
      : oddIsHuddle
        ? "background:#fff59d;"
        : oddIsCandy
          ? "background:#f8bbd9;"
          : "";
    oddStyle += oddCustom.textColor ? `color:${oddCustom.textColor};` : "";

    let evenStyle = evenCustom.bgColor
      ? `background:${evenCustom.bgColor};`
      : evenIsHuddle
        ? "background:#fff59d;"
        : evenIsCandy
          ? "background:#f8bbd9;"
          : "";
    evenStyle += evenCustom.textColor ? `color:${evenCustom.textColor};` : "";

    // Get $ prefix if onTwo is set
    const oddPrefix = oddCustom.onTwo ? "💲 " : "";
    const evenPrefix = evenCustom.onTwo ? "💲 " : "";

    // Odd number cell
    const numBg =
      wristbandHeaderColor === "transparent"
        ? "transparent"
        : wristbandHeaderColor;
    const numFg = wristbandHeaderColor === "transparent" ? "#333" : "white";
    html += `<div class="wristband-cell num-cell" style="background: ${numBg}; color: ${numFg};">${oddNum}</div>`;

    // Odd play cell
    if (oddPlay) {
      html += `
        <div class="wristband-cell filled" style="${oddStyle}" 
             draggable="true"
             ondragstart="handleCellDragStart(event, ${oddIndex})"
             ondragover="handleCellDragOver(event)"
             ondragleave="handleCellDragLeave(event)"
             ondrop="handleCellDrop(event, ${oddIndex})"
             ondragend="handleCellDragEnd(event)"
             onclick="openCellPopup(${currentCardIndex}, ${oddIndex}, event)">
          <span class="cell-play">${oddPrefix}${getWristbandPlayName(oddPlay)}</span>
        </div>
      `;
    } else {
      html += `<div class="wristband-cell" 
                    ondragover="handleCellDragOver(event)" 
                    ondragleave="handleCellDragLeave(event)"
                    ondrop="handleCellDrop(event, ${oddIndex})" 
                    onclick="openCellPopup(${currentCardIndex}, ${oddIndex}, event)"></div>`;
    }

    // Even number cell
    html += `<div class="wristband-cell num-cell" style="background: ${numBg}; color: ${numFg};">${evenNum}</div>`;

    // Even play cell
    if (evenPlay) {
      html += `
        <div class="wristband-cell filled" style="${evenStyle}" 
             draggable="true"
             ondragstart="handleCellDragStart(event, ${evenIndex})"
             ondragover="handleCellDragOver(event)"
             ondragleave="handleCellDragLeave(event)"
             ondrop="handleCellDrop(event, ${evenIndex})"
             ondragend="handleCellDragEnd(event)"
             onclick="openCellPopup(${currentCardIndex}, ${evenIndex}, event)">
          <span class="cell-play">${evenPrefix}${getWristbandPlayName(evenPlay)}</span>
        </div>
      `;
    } else {
      html += `<div class="wristband-cell" 
                    ondragover="handleCellDragOver(event)" 
                    ondragleave="handleCellDragLeave(event)"
                    ondrop="handleCellDrop(event, ${evenIndex})" 
                    onclick="openCellPopup(${currentCardIndex}, ${evenIndex}, event)"></div>`;
    }
  }

  grid.innerHTML = html;

  // Update undo/redo buttons
  historyManager.updateButtons("wristband");

  // Update stats bar
  updateWbStats();
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

  currentEditingCell = { cardIdx, cellIdx };
  const currentPlay = cardData[cellIdx];
  const key = `${cardIdx}-${cellIdx}`;
  const existing = cellCustomizations[key] || {};
  pendingBgColor = existing.bgColor || "";
  pendingTextColor = existing.textColor || "#000";
  pendingOnTwo = existing.onTwo || false;
  pendingPlaySelection = currentPlay;

  const hasPlay = currentPlay !== null;

  // Update popup title - account for card offset
  const cardOffset = cardIdx * 40;
  const displayNum = cellIdx + 11 + cardOffset;
  document.getElementById("cellPopupTitle").textContent = hasPlay
    ? `📝 Edit Cell #${displayNum}`
    : `➕ Add Play to Cell #${displayNum}`;

  // Show/hide sections
  document.getElementById("cellPopupPlayInfo").style.display = hasPlay
    ? "block"
    : "none";
  document.getElementById("cellPopupPlaySelector").style.display = hasPlay
    ? "none"
    : "block";
  document.getElementById("cellPopupColors").style.display = hasPlay
    ? "block"
    : "none";

  if (hasPlay) {
    document.getElementById("cellPopupPlayName").innerHTML =
      `<strong>Current Play:</strong> ${getWristbandPlayName(currentPlay)}`;
  } else {
    document.getElementById("cellPlaySearch").value = "";
    populateCellPlayList();
  }

  // Update swatch selections
  updateSwatchSelection("bgColorSwatches", pendingBgColor);
  updateSwatchSelection("textColorSwatches", pendingTextColor);
  document.getElementById("cellOnTwo").checked = pendingOnTwo;

  document.getElementById("cellPopupOverlay").style.display = "flex";
}

/**
 * Show the play selector in the popup
 */
function showPlaySelector() {
  document.getElementById("cellPopupPlaySelector").style.display = "block";
  document.getElementById("cellPlaySearch").value = "";
  populateCellPlayList();
}

/**
 * Populate the play list in the cell popup
 */
function populateCellPlayList() {
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
    container.innerHTML =
      '<div style="padding: 15px; text-align: center; color: #888;">No plays match filters</div>';
    return;
  }

  container.innerHTML = filtered
    .slice(0, 50)
    .map(
      (p, idx) => `
      <div class="cell-play-option" onclick="selectPlayForCell(${plays.indexOf(p)})" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 12px; ${idx % 2 === 0 ? "background: #fafafa;" : ""}">
        <span style="color: #888; font-size: 10px;">${p.type || "Play"}</span> ${getFullCall(p)}
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
  document.getElementById("cellPopupPlayInfo").style.display = "block";
  document.getElementById("cellPopupPlaySelector").style.display = "none";
  document.getElementById("cellPopupColors").style.display = "block";
  document.getElementById("cellPopupPlayName").innerHTML =
    `<strong>Current Play:</strong> ${getWristbandPlayName(play)}`;

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
  document.getElementById("cellPopupOverlay").style.display = "none";
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
 * Apply the cell style from the popup
 */
function applyCellStyle() {
  const { cardIdx, cellIdx } = currentEditingCell;
  if (cardIdx === null || cellIdx === null) return;

  const key = `${cardIdx}-${cellIdx}`;
  const onTwo = document.getElementById("cellOnTwo").checked;

  if (pendingBgColor || pendingTextColor !== "#000" || onTwo) {
    cellCustomizations[key] = {
      bgColor: pendingBgColor,
      textColor: pendingTextColor,
      onTwo: onTwo,
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
  if (cardData.some((c) => c !== null)) {
    const ok = await showConfirm(
      `Clear ${wristbandCards[currentCardIndex].name}?`,
      { title: "Clear Card", icon: "🗑️", confirmText: "Clear", danger: true },
    );
    if (!ok) return;
  }
  saveWristbandState();
  wristbandCards[currentCardIndex].data = Array(40).fill(null);
  // Also clear cell customizations for this card
  Object.keys(cellCustomizations).forEach((key) => {
    if (key.startsWith(`${currentCardIndex}-`)) {
      delete cellCustomizations[key];
    }
  });
  renderCardTabs();
  renderWristbandGrid();
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

  // If we need more cells than available, offer to create new cards
  if (filtered.length > totalEmpty) {
    const playsNeeded = filtered.length;
    const extraPlays = playsNeeded - totalEmpty;
    const extraCardsNeeded = Math.ceil(extraPlays / 40);
    const totalCardsNeeded = wristbandCards.length + extraCardsNeeded;

    if (totalCardsNeeded > MAX_CARDS) {
      const maxPlays = totalEmpty + (MAX_CARDS - wristbandCards.length) * 40;
      showToast(
        `${playsNeeded} plays but can only fit ${maxPlays} (max ${MAX_CARDS} cards)`,
      );
    } else if (extraCardsNeeded > 0) {
      const createCards = await showConfirm(
        `You have ${playsNeeded} plays but only ${totalEmpty} empty cells.\n\nCreate ${extraCardsNeeded} new card(s) to fit all plays?`,
        { title: "Auto-Fill", icon: "⚡", confirmText: "Create Cards" },
      );

      if (createCards) {
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
    showToast("⚠️ No empty cells available — clear some first");
    return;
  }

  renderCardTabs();
  renderWristbandGrid();

  // Show summary
  const cardsUsed = Math.ceil(filledCount / 40) || 1;
  if (filledCount > 40) {
    showToast(
      `✅ Added ${filledCount} plays across ${wristbandCards.length - currentCardIndex} card(s)`,
    );
  }
}

/**
 * Print the wristband
 */
function printWristband() {
  const container = document.getElementById("wristbandPrintCards");
  const numCards = wristbandCards.length;
  const highlightHuddle =
    document.getElementById("wbHighlightHuddle")?.checked || false;
  const highlightCandy =
    document.getElementById("wbHighlightCandy")?.checked || false;

  const useMultiCardLayout = numCards > 1 && numCards <= 5;

  let allHtml = "";

  wristbandCards.forEach((card, cardIdx) => {
    let cardHtml = `<div class="wristband-card"><div class="wristband-grid" style="grid-template-rows: repeat(${WB_ROWS}, 1fr);">`;

    // Calculate offset for this card's numbers
    const cardOffset = cardIdx * 40;

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

      let oddStyle = oddCustom.bgColor
        ? `background:${oddCustom.bgColor};`
        : oddIsHuddle
          ? "background:#fff59d;"
          : oddIsCandy
            ? "background:#f8bbd9;"
            : "";
      oddStyle += oddCustom.textColor ? `color:${oddCustom.textColor};` : "";

      let evenStyle = evenCustom.bgColor
        ? `background:${evenCustom.bgColor};`
        : evenIsHuddle
          ? "background:#fff59d;"
          : evenIsCandy
            ? "background:#f8bbd9;"
            : "";
      evenStyle += evenCustom.textColor ? `color:${evenCustom.textColor};` : "";

      const oddPrefix = oddCustom.onTwo ? "💲 " : "";
      const evenPrefix = evenCustom.onTwo ? "💲 " : "";

      const pNumBg =
        wristbandHeaderColor === "transparent"
          ? "transparent"
          : wristbandHeaderColor;
      const pNumFg = wristbandHeaderColor === "transparent" ? "#333" : "white";
      cardHtml += `<div class="wristband-cell num-cell" style="background: ${pNumBg}; color: ${pNumFg};">${oddNum}</div>`;
      cardHtml += `<div class="wristband-cell${oddPlay ? " filled" : ""}" style="${oddStyle}"><span class="cell-play">${oddPlay ? oddPrefix + getWristbandPlayName(oddPlay) : ""}</span></div>`;
      cardHtml += `<div class="wristband-cell num-cell" style="background: ${pNumBg}; color: ${pNumFg};">${evenNum}</div>`;
      cardHtml += `<div class="wristband-cell${evenPlay ? " filled" : ""}" style="${evenStyle}"><span class="cell-play">${evenPlay ? evenPrefix + getWristbandPlayName(evenPlay) : ""}</span></div>`;
    }

    cardHtml += "</div></div>";
    allHtml += cardHtml;
  });

  container.innerHTML = allHtml;
  container.className = useMultiCardLayout ? "multi-card-layout" : "";

  document.getElementById("wristbandPrint").style.display = "block";

  let printStyle = document.getElementById("wristbandPrintStyle");
  if (!printStyle) {
    printStyle = document.createElement("style");
    printStyle.id = "wristbandPrintStyle";
    document.head.appendChild(printStyle);
  }

  if (useMultiCardLayout) {
    printStyle.textContent = `
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
          width: 4.7in !important;
          height: 2.8in !important;
          page-break-after: avoid !important;
          flex-shrink: 0 !important;
        }
      }
    `;
  } else {
    printStyle.textContent =
      "@media print { @page { size: 4.7in 2.8in; margin: 0; } }";
  }

  setTimeout(() => {
    const restoreTitle = setPrintTitle("Wristband");
    window.print();
    setTimeout(() => {
      restoreTitle();
      document.getElementById("wristbandPrint").style.display = "none";
    }, 500);
  }, 100);
}

/**
 * Capture current wristband display settings
 */
function captureWbDisplaySettings() {
  return {
    showEmoji: document.getElementById("wbShowEmoji")?.checked || false,
    useSquares: document.getElementById("wbUseSquares")?.checked || false,
    underEmoji: document.getElementById("wbUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("wbBoldShifts")?.checked || false,
    redShifts: document.getElementById("wbRedShifts")?.checked || false,
    italicMotions: document.getElementById("wbItalicMotions")?.checked || false,
    redMotions: document.getElementById("wbRedMotions")?.checked || false,
    removeVowels: document.getElementById("wbRemoveVowels")?.checked || false,
    showLineCall: document.getElementById("wbShowLineCall")?.checked || false,
    highlightHuddle:
      document.getElementById("wbHighlightHuddle")?.checked || false,
    highlightCandy:
      document.getElementById("wbHighlightCandy")?.checked || false,
  };
}

/**
 * Save the wristband to localStorage
 */
async function saveWristband() {
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
      existing.displaySettings = captureWbDisplaySettings();
      existing.savedAt = new Date().toISOString();
      storageManager.set("savedWristbands", saved);
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
    displaySettings: captureWbDisplaySettings(),
    savedAt: new Date().toISOString(),
  });

  storageManager.set("savedWristbands", saved);
  loadSavedWristbandsList();
  populateScriptWristbandSelect();
  populateWristbandHighlightDropdown();
  markWristbandClean();
  storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
  showToast(`✅ "${name}" saved!`);
}

/**
 * Load the list of saved wristbands
 */
function loadSavedWristbandsList() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const container = document.getElementById("savedWristbandsList");
  const section = document.getElementById("savedWristbandsSection");

  if (saved.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
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
            <div class="saved-card-title">${s.title}</div>
            <div class="saved-card-meta">
              <span>🃏 ${cardCount(s)} card(s)</span>
              <span>📝 ${totalPlays(s)} plays</span>
              ${savedTime ? `<span>💾 ${savedTime}</span>` : ""}
            </div>
          </div>
          <div class="saved-card-actions">
            <button class="saved-load-btn" onclick="loadWristband(${s.id})" title="Load this wristband">Load</button>
            <button class="saved-rename-btn" onclick="renameSavedWristband(${s.id})" title="Rename">✏️</button>
            <button class="saved-overwrite-btn" onclick="overwriteSavedWristband(${s.id})" title="Overwrite with current wristband">⬆️</button>
            <button class="saved-del-btn" onclick="deleteSavedWristband(${s.id})" title="Delete">✕</button>
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
    setCheckbox("wbRemoveVowels", ds.removeVowels);
    setCheckbox("wbShowLineCall", ds.showLineCall);
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
  markWristbandClean();
  storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
  showToast(`Loaded "${wb.title}"`);
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
  storageManager.set("savedWristbands", filtered);
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
    storageManager.set("savedWristbands", saved);
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
  wb.displaySettings = captureWbDisplaySettings();
  wb.savedAt = new Date().toISOString();
  storageManager.set("savedWristbands", saved);
  loadSavedWristbandsList();
  populateScriptWristbandSelect();
  populateWristbandHighlightDropdown();
  markWristbandClean();
  storageManager.remove(STORAGE_KEYS.WRISTBAND_DRAFT);
  showToast(`"${wb.title}" updated!`);
}

/**
 * Initialize swatch click handlers
 */
function initSwatchHandlers() {
  document.getElementById("bgColorSwatches").addEventListener("click", (e) => {
    if (e.target.classList.contains("color-swatch")) {
      pendingBgColor = e.target.dataset.color;
      updateSwatchSelection("bgColorSwatches", pendingBgColor);
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
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }
}

/**
 * Toggle wristband display options panel
 */
function toggleWbDisplayOptions(headerEl) {
  const content = headerEl.nextElementSibling;
  content.classList.toggle("collapsed");
  const icon = headerEl.querySelector(".toggle-icon");
  icon.textContent = content.classList.contains("collapsed") ? "▶" : "▼";
}

/**
 * Toggle wristband sort panel
 */
function toggleWbSortPanel(headerEl) {
  const content = headerEl.nextElementSibling;
  content.classList.toggle("collapsed");
  const icon = headerEl.querySelector(".toggle-icon");
  icon.textContent = content.classList.contains("collapsed") ? "▶" : "▼";
}

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
