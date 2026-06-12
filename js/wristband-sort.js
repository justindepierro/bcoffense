let wbSortCriteria = [];
let draggedSortItem = null;
let wbCustomSortOrders = storageManager.get(STORAGE_KEYS.CUSTOM_SORT_ORDERS, {});
let wbSortAcrossCards = false;
let savedSortPresets = storageManager.get(STORAGE_KEYS.SORT_PRESETS, {});

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
    criteria: [...wbSortCriteria.map((criteria) => ({ ...criteria }))],
    customOrders: safeDeepClone(wbCustomSortOrders),
    acrossCards: wbSortAcrossCards,
  };
  storageManager.set(STORAGE_KEYS.SORT_PRESETS, savedSortPresets);
  renderSortPresetDropdown();
  document.getElementById("sortPresetDropdown").value = trimmedName;
  showToast(`Sort preset "${trimmedName}" saved!`);
}

function loadSortPreset() {
  const dropdown = document.getElementById("sortPresetDropdown");
  const presetName = dropdown.value;
  if (!presetName || !savedSortPresets[presetName]) return;

  const preset = savedSortPresets[presetName];

  if (Array.isArray(preset)) {
    wbSortCriteria = [...preset.map((criteria) => ({ ...criteria }))];
  } else {
    wbSortCriteria = [...(preset.criteria || []).map((criteria) => ({ ...criteria }))];
    wbCustomSortOrders = safeDeepClone(preset.customOrders || {});
    wbSortAcrossCards = preset.acrossCards || false;

    const checkbox = document.getElementById("sortAcrossCardsCheckbox");
    if (checkbox) checkbox.checked = wbSortAcrossCards;
  }

  renderSortCriteria();
}

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

function renderSortCriteria() {
  const container = document.getElementById("sortCriteriaList");
  if (!container) return;

  container.innerHTML = wbSortCriteria
    .map((criteria, idx) => {
      const fieldOptions = WB_SORT_FIELDS.map(
        (field) =>
          `<option value="${field.value}" ${criteria.field === field.value ? "selected" : ""}>${field.label}</option>`,
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
        <button class="custom-order-btn custom-order-btn-compact" data-action="openCustomOrderModal" data-arg="${criteria.field}" title="${customOrderTitle}">${customOrderIcon}</button>
        <button class="remove-sort-btn" data-action="removeSortCriteria" data-idx="${idx}" aria-label="Remove sort field">✕</button>
      </div>
    `;
    })
    .join("");
}

function addSortCriteria() {
  const usedFields = wbSortCriteria.map((criteria) => criteria.field);
  const availableField = WB_SORT_FIELDS.find(
    (field) => !usedFields.includes(field.value),
  );

  if (availableField) {
    wbSortCriteria.push({ field: availableField.value, direction: "asc" });
    persistSortCriteria();
    renderSortCriteria();
  } else {
    showToast("All sort fields are already in use");
  }
}

function removeSortCriteria(idx) {
  if (wbSortCriteria.length <= 1) {
    showToast("You must have at least one sort field");
    return;
  }
  wbSortCriteria.splice(idx, 1);
  persistSortCriteria();
  renderSortCriteria();
}

function updateSortField(idx, newField) {
  wbSortCriteria[parseInt(idx, 10)].field = newField;
  persistSortCriteria();
  renderSortCriteria();
}

function toggleSortDirection(idx) {
  wbSortCriteria[idx].direction =
    wbSortCriteria[idx].direction === "asc" ? "desc" : "asc";
  persistSortCriteria();
  renderSortCriteria();
}

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

  const moved = wbSortCriteria.splice(draggedSortItem, 1)[0];
  wbSortCriteria.splice(targetIdx, 0, moved);
  persistSortCriteria();
  renderSortCriteria();
}

function handleSortDragEnd(event) {
  event.target.classList.remove("dragging");
  draggedSortItem = null;
}

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

function getUniqueValuesForField(field) {
  const values = new Set();
  wristbandCards.forEach((card) => {
    card.data.slice(0, getActiveWristbandCellCount()).forEach((play) => {
      if (play && play[field]) {
        values.add(String(play[field]).trim());
      }
    });
  });
  if (typeof plays !== "undefined" && Array.isArray(plays)) {
    plays.forEach((play) => {
      if (play && play[field]) {
        values.add(String(play[field]).trim());
      }
    });
  }
  return Array.from(values).sort();
}

function openCustomOrderModal(field) {
  const fieldLabel =
    WB_SORT_FIELDS.find((entry) => entry.value === field)?.label || field;
  const uniqueValues = getUniqueValuesForField(field);

  if (uniqueValues.length === 0) {
    showToast(`No values found for "${fieldLabel}" — add some plays first`);
    return;
  }

  let orderedValues = wbCustomSortOrders[field] || [];
  uniqueValues.forEach((value) => {
    if (!orderedValues.includes(value)) orderedValues.push(value);
  });
  orderedValues = orderedValues.filter((value) => uniqueValues.includes(value));

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

function toggleSortAcrossCards() {
  const checkbox = document.getElementById("sortAcrossCardsCheckbox");
  wbSortAcrossCards = checkbox ? checkbox.checked : false;
}

function compareWithCustomOrder(valA, valB, field, direction) {
  const customOrder = wbCustomSortOrders[field];

  if (customOrder && customOrder.length > 0) {
    let idxA = customOrder.indexOf(valA);
    let idxB = customOrder.indexOf(valB);

    if (idxA === -1) idxA = customOrder.length + 1;
    if (idxB === -1) idxB = customOrder.length + 1;

    let cmp = idxA - idxB;
    if (direction === "desc") cmp = -cmp;
    return cmp;
  }

  const a = String(valA || "").toLowerCase();
  const b = String(valB || "").toLowerCase();
  let cmp = a.localeCompare(b, undefined, { numeric: true });
  if (direction === "desc") cmp = -cmp;
  return cmp;
}

function persistSortCriteria() {
  storageManager.set(STORAGE_KEYS.WRISTBAND_SORT_CRITERIA, wbSortCriteria);
}

function applyWristbandSort() {
  if (wbSortCriteria.length === 0) return;

  saveWristbandState();

  if (wbSortAcrossCards) {
    applyWristbandSortAcrossCards();
  } else {
    applyWristbandSortPerCard();
  }

  renderCardTabs();
  renderWristbandGrid();
}

function applyWristbandSortPerCard() {
  const cellsPerCard = getActiveWristbandCellCount();
  wristbandCards.forEach((card, cardIdx) => {
    const playsWithIdx = card.data
      .slice(0, cellsPerCard)
      .map((play, idx) => ({ play, idx, cardIdx }))
      .filter((item) => item.play !== null);

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

    const customizationMappings = [];
    const newData = [...card.data];
    newData.fill(null, 0, cellsPerCard);
    playsWithIdx.forEach((item, newIdx) => {
      newData[newIdx] = item.play;
      customizationMappings.push({
        sourceCardIdx: cardIdx,
        sourceCellIdx: item.idx,
        targetCardIdx: cardIdx,
        targetCellIdx: newIdx,
      });
    });

    card.data = newData;
    rebuildWristbandCellCustomizations(customizationMappings, {
      clearCardIndices: [cardIdx],
    });
  });
}

function applyWristbandSortAcrossCards() {
  const cellsPerCard = getActiveWristbandCellCount();
  const allPlays = [];
  const sourceCustomizations = { ...cellCustomizations };
  wristbandCards.forEach((card, cardIdx) => {
    card.data.slice(0, cellsPerCard).forEach((play, cellIdx) => {
      if (play !== null) {
        allPlays.push({
          play,
          origCardIdx: cardIdx,
          origCellIdx: cellIdx,
        });
      }
    });
  });

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

  const customizationMappings = [];

  wristbandCards.forEach((card) => {
    card.data.fill(null, 0, cellsPerCard);
  });

  let currentCardIdx = 0;
  let currentCellIdx = 0;

  allPlays.forEach((item) => {
    if (currentCellIdx >= cellsPerCard) {
      currentCardIdx++;
      currentCellIdx = 0;

      if (
        currentCardIdx >= wristbandCards.length &&
        currentCardIdx < MAX_CARDS
      ) {
        wristbandCards.push({
          name: `Card ${currentCardIdx + 1}`,
          data: Array(CELLS_PER_CARD).fill(null),
          settings: { ...wristbandCards[0].settings },
        });
      }
    }

    if (currentCardIdx < wristbandCards.length) {
      wristbandCards[currentCardIdx].data[currentCellIdx] = item.play;
      customizationMappings.push({
        sourceCardIdx: item.origCardIdx,
        sourceCellIdx: item.origCellIdx,
        targetCardIdx: currentCardIdx,
        targetCellIdx: currentCellIdx,
      });

      currentCellIdx++;
    }
  });

  cellCustomizations = sourceCustomizations;
  rebuildWristbandCellCustomizations(customizationMappings, { clearAll: true });
}
