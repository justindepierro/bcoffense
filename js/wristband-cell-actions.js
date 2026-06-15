let draggedCellIndex = null;
let draggedCellCardIdx = null;
let copiedCell = null;
let wbSelectedCells = [];
let wbSelectionMode = false;

function handleCellDragStart(event, cellIdx, cardIdx) {
  draggedCellIndex = cellIdx;
  draggedCellCardIdx =
    cardIdx !== undefined && cardIdx !== null ? cardIdx : currentCardIndex;
  event.target.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
}

function handleCellDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("drag-over");
}

function handleCellDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleCellDrop(event, targetIdx) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  if (draggedCellIndex === null || draggedCellIndex === targetIdx) return;

  // Snapshot then clear drag state BEFORE mutating, since the re-render
  // detaches the source cell and dragend will not bubble to any document /
  // body listener afterward.
  const fromIdx = draggedCellIndex;
  draggedCellIndex = null;
  draggedCellCardIdx = null;
  document.querySelectorAll(".wb-cell.dragging").forEach((el) => el.classList.remove("dragging"));
  document.querySelectorAll(".wb-cell.drag-over").forEach((el) => el.classList.remove("drag-over"));

  mutateWristbandState(() => {
    const cardData = wristbandCards[currentCardIndex].data;

    const temp = cardData[fromIdx];
    cardData[fromIdx] = cardData[targetIdx];
    cardData[targetIdx] = temp;
    swapWristbandCellCustomizations(
      currentCardIndex,
      fromIdx,
      currentCardIndex,
      targetIdx,
    );
  });
}

function handleCellDragEnd(event) {
  event.target.classList.remove("dragging");
  draggedCellIndex = null;
  draggedCellCardIdx = null;
}

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

function pasteWbCell(cardIdx, cellIdx) {
  if (!copiedCell) {
    showToast("Nothing to paste — copy a cell first");
    return;
  }
  const key = `${cardIdx}-${cellIdx}`;
  mutateWristbandState(() => {
    wristbandCards[cardIdx].data[cellIdx] = safeDeepClone(copiedCell.play);
    setWristbandCellCustomization(
      key,
      copiedCell.customization ? safeDeepClone(copiedCell.customization) : null,
    );
  });
  showToast("📋 Cell pasted");
}

function getWbSelectedCellKey(cardIdx, cellIdx) {
  return `${cardIdx}-${cellIdx}`;
}

function syncWbSelectedCellVisuals(root = document) {
  const selectedKeys = new Set(wbSelectedCells.map((key) => String(key)));
  root.querySelectorAll("[data-drag='wbCell']").forEach((cell) => {
    const cellKey = getWbSelectedCellKey(cell.dataset.card, cell.dataset.cellIdx);
    const selected = selectedKeys.has(cellKey);
    cell.classList.toggle("wb-selected", selected);
    cell.setAttribute("aria-selected", selected ? "true" : "false");
  });
}

function setWbSelectedCells(nextSelection) {
  wbSelectedCells = [...new Set(
    (Array.isArray(nextSelection) ? nextSelection : [])
      .map((key) => String(key))
      .filter((key) => /^\d+-\d+$/.test(key)),
  )];
  syncWbSelectedCellVisuals();
  updateWbBatchBar();
}

function selectAllWbCellsOnCurrentCard(root = document) {
  const nextSelection = Array.from(root.querySelectorAll("[data-drag='wbCell']"))
    .map((cell) => getWbSelectedCellKey(cell.dataset.card, cell.dataset.cellIdx));
  setWbSelectedCells(nextSelection);
  return wbSelectedCells.length;
}

function toggleBatchSelect(cardIdx, cellIdx) {
  const key = getWbSelectedCellKey(cardIdx, cellIdx);
  const nextSelection = wbSelectedCells.includes(key)
    ? wbSelectedCells.filter((selectedKey) => selectedKey !== key)
    : [...wbSelectedCells, key];
  setWbSelectedCells(nextSelection);
}

function toggleWbSelectionMode() {
  wbSelectionMode = !wbSelectionMode;
  document.getElementById("wristband")?.classList.toggle(
    "wb-selection-mode",
    wbSelectionMode,
  );
  document.querySelectorAll("[data-action='toggleWbSelectionMode']").forEach((button) => {
    button.classList.toggle("active", wbSelectionMode);
    button.setAttribute("aria-pressed", wbSelectionMode ? "true" : "false");
    button.textContent = wbSelectionMode ? "Done Selecting" : "Select Cells";
  });
  if (!wbSelectionMode) clearBatchSelect();
}

function clearWristbandCell(cardIdx, cellIdx) {
  const card = wristbandCards[cardIdx];
  if (!card || !card.data?.[cellIdx]) return;
  mutateWristbandState(
    () => {
      card.data[cellIdx] = null;
      delete cellCustomizations[getWbSelectedCellKey(cardIdx, cellIdx)];
      setWbSelectedCells(
        wbSelectedCells.filter(
          (key) => key !== getWbSelectedCellKey(cardIdx, cellIdx),
        ),
      );
    },
    { renderPlays: true },
  );
}

function updateWbBatchBar() {
  const bar = document.getElementById("wbBatchBar");
  const countEl = document.getElementById("wbBatchCount");
  if (!bar) return;
  if (!countEl) return;
  const count = wbSelectedCells.length;
  if (count > 0) {
    bar.classList.add("visible");
    bar.setAttribute("aria-hidden", "false");
    countEl.textContent = `${count} cell${count === 1 ? "" : "s"} selected`;
  } else {
    bar.classList.remove("visible");
    bar.setAttribute("aria-hidden", "true");
    document
      .querySelectorAll("#wbBatchSwatches .wb-batch-swatch.active")
      .forEach((swatch) => swatch.classList.remove("active"));
  }
}

function syncWbBatchMoveTargets() {
  const select = document.getElementById("wbBatchMoveCard");
  if (!select) return;
  const previousValue = select.value;
  select.innerHTML = wristbandCards
    .map(
      (card, index) =>
        `<option value="${index}">${escapeHtml(card.name)}</option>`,
    )
    .join("");
  select.value = wristbandCards[previousValue] ? previousValue : String(currentCardIndex);
}

function clearSelectedWbCells() {
  if (wbSelectedCells.length === 0) return;
  const selected = [...wbSelectedCells];
  mutateWristbandState(
    () => {
      selected.forEach((key) => {
        const [cardIdx, cellIdx] = key.split("-").map(Number);
        if (!wristbandCards[cardIdx]) return;
        wristbandCards[cardIdx].data[cellIdx] = null;
        delete cellCustomizations[key];
      });
      setWbSelectedCells([]);
    },
    { renderPlays: true },
  );
  showToast(`Cleared ${selected.length} selected cell${selected.length === 1 ? "" : "s"}`);
}

function moveSelectedWbCellsToCard() {
  if (wbSelectedCells.length === 0) return;
  const targetCardIdx = parseInt(
    document.getElementById("wbBatchMoveCard")?.value,
    10,
  );
  const targetCard = wristbandCards[targetCardIdx];
  if (!targetCard) return;

  const selected = wbSelectedCells
    .map((key) => {
      const [cardIdx, cellIdx] = key.split("-").map(Number);
      return { key, cardIdx, cellIdx, play: wristbandCards[cardIdx]?.data[cellIdx] };
    })
    .filter((entry) => entry.play && entry.cardIdx !== targetCardIdx);
  if (selected.length === 0) {
    showToast("Selected plays are already on that card", { type: "info" });
    return;
  }

  const emptyTargets = [];
  targetCard.data
    .slice(0, getActiveWristbandCellCount())
    .forEach((play, cellIdx) => {
      if (play === null) emptyTargets.push(cellIdx);
    });
  if (emptyTargets.length < selected.length) {
    showToast(
      `${targetCard.name} needs ${selected.length - emptyTargets.length} more empty cell${selected.length - emptyTargets.length === 1 ? "" : "s"}`,
      { type: "warning" },
    );
    return;
  }

  mutateWristbandState(
    () => {
      selected.forEach((entry, index) => {
        const targetCellIdx = emptyTargets[index];
        targetCard.data[targetCellIdx] = entry.play;
        wristbandCards[entry.cardIdx].data[entry.cellIdx] = null;
        moveWristbandCellCustomization(
          entry.cardIdx,
          entry.cellIdx,
          targetCardIdx,
          targetCellIdx,
        );
      });
      currentCardIndex = targetCardIdx;
      setWbSelectedCells([]);
    },
    { renderPlays: true },
  );
  showToast(`Moved ${selected.length} play${selected.length === 1 ? "" : "s"} to ${targetCard.name}`);
}

function initWbBatchBarSwatches() {
  const container = document.getElementById("wbBatchSwatches");
  if (!container) return;
  container.addEventListener("click", (event) => {
    const swatch = event.target.closest(".wb-batch-swatch");
    if (!swatch) return;
    container
      .querySelectorAll(".wb-batch-swatch")
      .forEach((entry) => entry.classList.remove("active"));
    swatch.classList.add("active");
  });
}

function _initBatchBarSwatches() {
  initWbBatchBarSwatches();
}

function applyBatchEdit() {
  if (wbSelectedCells.length === 0) {
    showToast("No cells selected — Shift+click cells first");
    return;
  }

  const activeSwatch = document.querySelector(
    "#wbBatchSwatches .wb-batch-swatch.active",
  );
  const cadenceVal = document.getElementById("wbBatchCadence").value;
  const personnelVal = document.getElementById("wbBatchPersonnel").value.trim();
  const preShiftVal = document.getElementById("wbBatchPreShift").value.trim();

  const hasColor = activeSwatch !== null;
  const hasCadence = cadenceVal !== "__skip__";
  const hasPersonnel = personnelVal !== "";
  const hasPreShift = preShiftVal !== "";

  if (!hasColor && !hasCadence && !hasPersonnel && !hasPreShift) {
    showToast("Set at least one field (color, marker, personnel, or pre shift) to apply");
    return;
  }

  const count = wbSelectedCells.length;

  mutateWristbandState(() => {
    wbSelectedCells.forEach((key) => {
      const existing = cellCustomizations[key] || {};
      const nextCustom = {
        ...existing,
        markers: Array.isArray(existing.markers) ? [...existing.markers] : [],
        formationTags: Array.isArray(existing.formationTags)
          ? [...existing.formationTags]
          : [],
        backTags: Array.isArray(existing.backTags)
          ? [...existing.backTags]
          : [],
      };

      if (hasColor) {
        const picked = activeSwatch.dataset.color;
        if (picked === "") {
          delete nextCustom.bgColor;
          nextCustom.textColor = UI_COLORS.textBlack;
        } else {
          nextCustom.bgColor = picked;
          nextCustom.textColor = isColorDark(picked)
            ? UI_COLORS.textWhite
            : UI_COLORS.textBlack;
        }
      }

      if (hasCadence) {
        if (cadenceVal === "") {
          delete nextCustom.cadence;
          nextCustom.markers = [];
          delete nextCustom.markerPlacement;
        } else {
          delete nextCustom.cadence;
          nextCustom.markers = [cadenceVal];
          nextCustom.markerPlacement = "prefix";
        }
      }

      if (hasPersonnel) {
        nextCustom.extraPersonnel = personnelVal;
      }

      if (hasPreShift) {
        nextCustom.preShift = preShiftVal;
      }

      setWristbandCellCustomization(key, nextCustom);
    });
  });

  clearBatchSelect();

  const cadenceEl = document.getElementById("wbBatchCadence");
  const personnelEl = document.getElementById("wbBatchPersonnel");
  const preShiftEl = document.getElementById("wbBatchPreShift");
  if (cadenceEl) cadenceEl.value = "__skip__";
  if (personnelEl) personnelEl.value = "";
  if (preShiftEl) preShiftEl.value = "";
  document
    .querySelectorAll("#wbBatchSwatches .wb-batch-swatch.active")
    .forEach((swatch) => swatch.classList.remove("active"));

  const parts = [];
  if (hasColor) parts.push("color");
  if (hasCadence) parts.push("marker");
  if (hasPersonnel) parts.push("personnel");
  if (hasPreShift) parts.push("pre shift");
  showToast(`Applied ${parts.join(", ")} to ${count} cell${count === 1 ? "" : "s"}`);
}

function clearBatchSelect() {
  setWbSelectedCells([]);
}
