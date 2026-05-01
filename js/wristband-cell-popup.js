let currentEditingCell = { cardIdx: null, cellIdx: null };
let pendingBgColor = "";
let pendingTextColor = UI_COLORS.textBlack;
let pendingPlaySelection = null;
let pendingMarkers = [];
let pendingMarkerPlacement = "prefix";
let pendingExtraPersonnel = "";
let pendingPreShift = [];
let pendingFormationTags = [];
let pendingBackTags = [];

function renderPendingPreShiftList() {
  const input = document.getElementById("cellPreShiftInput");
  if (!input) return;
  renderPendingParenList(
    "cellPreShiftList",
    pendingPreShift,
    "removeWbPendingPreShift",
    "No pre-shifts added",
  );
}

function addWbPendingPreShift(value) {
  const input = document.getElementById("cellPreShiftInput");
  const nextValue = normalizeParenValue(value || input?.value || "");
  if (!nextValue) return;

  if (!pendingPreShift.includes(nextValue)) {
    pendingPreShift.push(nextValue);
  }

  if (input) {
    input.value = "";
    input.focus();
  }
  renderPendingPreShiftList();
}

function removeWbPendingPreShift(index) {
  const parsedIndex = parseInt(index, 10);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return;
  pendingPreShift = pendingPreShift.filter((_, idx) => idx !== parsedIndex);
  renderPendingPreShiftList();
}

function initWbPreShiftInput() {
  const input = document.getElementById("cellPreShiftInput");
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addWbPendingPreShift();
  });
}

function renderPendingFormationTagList() {
  renderPendingParenList(
    "cellFormationTagList",
    pendingFormationTags,
    "removeWbPendingFormationTag",
    "No formation tags added",
    "cycleWbPendingFormationTagDisplay",
  );
}

function addWbPendingFormationTag(value) {
  const input = document.getElementById("cellFormationTagInput");
  const nextValue = normalizeParenValue(value || input?.value || "");
  if (!nextValue) return;

  if (!pendingFormationTags.some((entry) => entry.value === nextValue)) {
    pendingFormationTags.push({ value: nextValue, display: "full" });
  }

  if (input) {
    input.value = "";
    input.focus();
  }
  renderPendingFormationTagList();
}

function removeWbPendingFormationTag(index) {
  const parsedIndex = parseInt(index, 10);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return;
  pendingFormationTags = pendingFormationTags.filter((_, idx) => idx !== parsedIndex);
  renderPendingFormationTagList();
}

function cycleWbPendingFormationTagDisplay(index) {
  const parsedIndex = parseInt(index, 10);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || !pendingFormationTags[parsedIndex]) return;
  const current = normalizeCustomTagEntry(pendingFormationTags[parsedIndex]);
  const nextDisplay =
    current.display === "full"
      ? "no-vowels"
      : current.display === "no-vowels"
        ? "initial"
        : "full";
  pendingFormationTags[parsedIndex] = { ...current, display: nextDisplay };
  renderPendingFormationTagList();
}

function clearWbPendingFormationTags() {
  pendingFormationTags = [];
  renderPendingFormationTagList();
  document.getElementById("cellFormationTagInput")?.focus();
}

function initWbFormationTagInput() {
  const input = document.getElementById("cellFormationTagInput");
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addWbPendingFormationTag();
  });
}

function renderPendingBackTagList() {
  renderPendingParenList(
    "cellBackTagList",
    pendingBackTags,
    "removeWbPendingBackTag",
    "No back tags added",
    "cycleWbPendingBackTagDisplay",
  );
}

function addWbPendingBackTag(value) {
  const input = document.getElementById("cellBackTagInput");
  const nextValue = normalizeParenValue(value || input?.value || "");
  if (!nextValue) return;

  if (!pendingBackTags.some((entry) => entry.value === nextValue)) {
    pendingBackTags.push({ value: nextValue, display: "full" });
  }

  if (input) {
    input.value = "";
    input.focus();
  }
  renderPendingBackTagList();
}

function removeWbPendingBackTag(index) {
  const parsedIndex = parseInt(index, 10);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return;
  pendingBackTags = pendingBackTags.filter((_, idx) => idx !== parsedIndex);
  renderPendingBackTagList();
}

function cycleWbPendingBackTagDisplay(index) {
  const parsedIndex = parseInt(index, 10);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || !pendingBackTags[parsedIndex]) return;
  const current = normalizeCustomTagEntry(pendingBackTags[parsedIndex]);
  const nextDisplay =
    current.display === "full"
      ? "no-vowels"
      : current.display === "no-vowels"
        ? "initial"
        : "full";
  pendingBackTags[parsedIndex] = { ...current, display: nextDisplay };
  renderPendingBackTagList();
}

function clearWbPendingBackTags() {
  pendingBackTags = [];
  renderPendingBackTagList();
  document.getElementById("cellBackTagInput")?.focus();
}

function initWbBackTagInput() {
  const input = document.getElementById("cellBackTagInput");
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addWbPendingBackTag();
  });
}

function resetWristbandCellPopupPendingState() {
  pendingBgColor = "";
  pendingTextColor = UI_COLORS.textBlack;
  pendingPlaySelection = null;
  pendingMarkers = [];
  pendingMarkerPlacement = "prefix";
  pendingExtraPersonnel = "";
  pendingPreShift = [];
  pendingFormationTags = [];
  pendingBackTags = [];
}

function setWristbandCellPopupPendingState(currentPlay, existing = {}) {
  resetWristbandCellPopupPendingState();
  pendingBgColor = existing.bgColor || "";
  pendingTextColor = existing.textColor || UI_COLORS.textBlack;
  pendingMarkers = getCellMarkerValues(existing);
  pendingMarkerPlacement = getCellMarkerPlacement(
    existing,
    getWristbandDisplayOptions(),
  );
  pendingExtraPersonnel = existing.extraPersonnel || "";
  pendingPreShift = getCustomPreShiftValues(existing);
  pendingFormationTags = getCustomFormationTagEntries(existing);
  pendingBackTags = getCustomBackTagEntries(existing);
  pendingPlaySelection = currentPlay || null;
}

function getWristbandPendingCellCustomization() {
  return (
    buildWristbandCellCustomization({
      bgColor: pendingBgColor,
      textColor: pendingTextColor,
      markers: pendingMarkers,
      markerPlacement: pendingMarkerPlacement,
      extraPersonnel: pendingExtraPersonnel,
      preShift: pendingPreShift.join("; "),
      formationTags: pendingFormationTags,
      backTags: pendingBackTags,
    }) || {}
  );
}

function syncCellPopupForSelection(cardIdx, cellIdx, play, custom = {}) {
  const hasPlay = play !== null;
  const cardOffset = cardIdx * 40;
  const displayNum = cellIdx + 11 + cardOffset;

  document.getElementById("cellPopupTitle").textContent = hasPlay
    ? `📝 Edit Cell #${displayNum}`
    : `➕ Add Play to Cell #${displayNum}`;

  document.getElementById("cellPopupPlayInfo").classList.toggle("hidden", !hasPlay);
  document.getElementById("cellPopupPlaySelector").classList.toggle("hidden", hasPlay);
  document.getElementById("cellPopupColors").classList.toggle("hidden", !hasPlay);

  if (hasPlay) {
    document.getElementById("cellPopupPlayName").innerHTML =
      `<strong>Current Play:</strong> ${getFullCall(getCustomDisplayPlay(play, custom), getWristbandDisplayOptions())}`;
  }
}

function openCellPopup(cardIdx, cellIdx, event) {
  event.preventDefault();
  event.stopPropagation();

  const cardData = wristbandCards[cardIdx]?.data;
  if (!cardData) return;

  const emptyOverlay = document.querySelector(".wb-grid-empty-state.visible");
  if (emptyOverlay) emptyOverlay.classList.remove("visible");

  currentEditingCell = { cardIdx, cellIdx };

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
  setWristbandCellPopupPendingState(currentPlay, existing);
  syncCellPopupForSelection(cardIdx, cellIdx, currentPlay, existing);

  if (currentPlay === null) {
    document.getElementById("cellPlaySearch").value = "";
    populateCellPlayList();
  }

  updateSwatchSelection("bgColorSwatches", pendingBgColor);
  updateSwatchSelection("textColorSwatches", pendingTextColor);
  updateCellMarkerSelection(pendingMarkers);
  updateCellMarkerPlacementSelection(pendingMarkerPlacement);
  document.getElementById("cellExtraPersonnel").value = pendingExtraPersonnel;
  document.getElementById("cellPreShiftInput").value = "";
  document.getElementById("cellFormationTagInput").value = "";
  document.getElementById("cellBackTagInput").value = "";
  populateWbPersonnelDatalist();
  populateWbPreShiftDatalist();
  populateWbFormationTagDatalist();
  populateWbBackTagDatalist();
  initWbPreShiftInput();
  initWbFormationTagInput();
  initWbBackTagInput();
  renderPendingPreShiftList();
  renderPendingFormationTagList();
  renderPendingBackTagList();

  setWristbandOverlayVisibility(overlay, true);

  if (!currentPlay) {
    setTimeout(() => document.getElementById("cellPlaySearch")?.focus(), 50);
  }
}

function showPlaySelector() {
  document.getElementById("cellPopupPlaySelector").classList.remove("hidden");
  document.getElementById("cellPlaySearch").value = "";
  populateCellPlayList();
}

function populateCellPlayList() {
  highlightedPlayIndex = -1;
  const filterState = getWristbandFilterState({
    searchInputId: "cellPlaySearch",
  });

  const filtered = plays.filter((play) =>
    matchesWristbandPlayFilters(play, filterState, { searchMode: "fullCall" }),
  );

  const container = document.getElementById("cellPlayList");
  if (filtered.length === 0) {
    container.innerHTML = `<div class="wb-avail-empty">No plays match filters</div>`;
    return;
  }

  container.innerHTML = filtered
    .slice(0, 50)
    .map(
      (play) => `
      <div class="cell-play-option" data-action="selectPlayForCell" data-idx="${plays.indexOf(play)}">
        <span class="cell-play-option-type">${escapeHtml(play.type || "Play")}</span> ${getFullCall(play)}
      </div>
    `,
    )
    .join("");
}

function filterCellPlays() {
  populateCellPlayList();
}

function selectPlayForCell(playIndex) {
  const { cardIdx, cellIdx } = currentEditingCell;
  if (cardIdx === null || cellIdx === null) return;

  const play = plays[playIndex];
  mutateWristbandState(() => {
    wristbandCards[cardIdx].data[cellIdx] = play;
  });
  pendingPlaySelection = play;
  syncCellPopupForSelection(
    cardIdx,
    cellIdx,
    play,
    getWristbandPendingCellCustomization(),
  );
}

function removeCellPlayFromPopup() {
  const { cardIdx, cellIdx } = currentEditingCell;
  if (cardIdx === null || cellIdx === null) return;

  const key = `${cardIdx}-${cellIdx}`;
  mutateWristbandState(() => {
    wristbandCards[cardIdx].data[cellIdx] = null;
    delete cellCustomizations[key];
  });

  closeCellPopup();
}

function closeCellPopup(event) {
  if (event && event.target !== event.currentTarget) return;
  setWristbandOverlayVisibility("cellPopupOverlay", false);
  currentEditingCell = { cardIdx: null, cellIdx: null };
  resetWristbandCellPopupPendingState();
}

function updateSwatchSelection(containerId, selectedColor) {
  const container = document.getElementById(containerId);
  container.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.classList.remove("selected");
    if (swatch.dataset.color === selectedColor) {
      swatch.classList.add("selected");
    }
  });
}

function populateWbPersonnelDatalist() {
  const datalist = document.getElementById("wbPersonnelOptions");
  if (!datalist) return;
  const unique = [...new Set(plays.map((p) => p.personnel).filter((p) => p && p.trim()))].sort();
  datalist.innerHTML = unique.map((p) => `<option value="${escapeHtml(p)}"></option>`).join("");
}

function populateWbPreShiftDatalist() {
  const datalist = document.getElementById("wbPreShiftOptions");
  if (!datalist) return;
  const unique = [...new Set(plays.map((p) => p.shift).filter((value) => value && value.trim()))].sort();
  datalist.innerHTML = unique.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function populateWbFormationTagDatalist() {
  const datalist = document.getElementById("wbFormationTagOptions");
  if (!datalist) return;
  const unique = [
    ...new Set(
      plays
        .flatMap((play) => [play.formTag1, play.formTag2])
        .filter((value) => value && value.trim()),
    ),
  ].sort();
  datalist.innerHTML = unique.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function populateWbBackTagDatalist() {
  const datalist = document.getElementById("wbBackTagOptions");
  if (!datalist) return;
  const unique = [...new Set(plays.map((play) => play.back).filter((value) => value && value.trim()))].sort();
  datalist.innerHTML = unique.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function applyCellStyle() {
  const { cardIdx, cellIdx } = currentEditingCell;
  if (cardIdx === null || cellIdx === null) return;

  const key = `${cardIdx}-${cellIdx}`;
  const markers = [...pendingMarkers];
  const markerPlacement = pendingMarkerPlacement;
  const extraPersonnel = document
    .getElementById("cellExtraPersonnel")
    .value.trim();
  const preShift = pendingPreShift.join("; ");
  const formationTags = pendingFormationTags
    .map((entry) => normalizeCustomTagEntry(entry))
    .filter(Boolean);
  const backTags = pendingBackTags
    .map((entry) => normalizeCustomTagEntry(entry))
    .filter(Boolean);

  mutateWristbandState(() => {
    setWristbandCellCustomization(key, {
      bgColor: pendingBgColor,
      textColor: pendingTextColor,
      markers,
      markerPlacement,
      extraPersonnel,
      preShift,
      formationTags,
      backTags,
    });
  }, { refreshCardView: true });

  closeCellPopup();
}

function initCellMarkerPalette() {
  const palette = document.getElementById("cellMarkerPalette");
  const placement = document.getElementById("cellMarkerPlacement");
  if (!palette || !placement || palette.dataset.bound === "true") return;

  palette.innerHTML = WB_CELL_MARKER_OPTIONS.map(
    (option) => `
      <button type="button" class="cell-marker-btn" data-marker="${escapeHtml(option.value)}" title="${escapeHtml(option.label)}" aria-label="${escapeHtml(option.label)}">
        <span class="cell-marker-emoji">${option.emoji}</span>
        <span class="cell-marker-label">${escapeHtml(option.label)}</span>
      </button>
    `,
  ).join("");

  palette.addEventListener("click", (event) => {
    const button = event.target.closest(".cell-marker-btn");
    if (!button) return;
    toggleCellMarkerSelection(button.dataset.marker || "");
  });

  placement.addEventListener("click", (event) => {
    const button = event.target.closest(".cell-marker-placement-btn");
    if (!button) return;
    updateCellMarkerPlacementSelection(button.dataset.placement || "prefix");
  });

  palette.dataset.bound = "true";
  populateWbBatchMarkerOptions();
  updateCellMarkerSelection([]);
  updateCellMarkerPlacementSelection("prefix");
}

function updateCellMarkerSelection(markerValues) {
  const normalizedValues = Array.isArray(markerValues)
    ? [...new Set(markerValues.filter((marker) => typeof marker === "string" && marker.trim()))]
    : [];
  const input = document.getElementById("cellCadence");
  const palette = document.getElementById("cellMarkerPalette");
  const summary = document.getElementById("cellMarkerSummary");

  if (input) input.value = normalizedValues.join("|");
  pendingMarkers = normalizedValues;

  if (palette) {
    palette.querySelectorAll(".cell-marker-btn").forEach((button) => {
      button.classList.toggle("selected", normalizedValues.includes(button.dataset.marker || ""));
    });
  }

  if (summary) {
    const selectedText = normalizedValues.length > 0
      ? normalizedValues.map((marker) => getCellMarkerLabel(marker)).join(" • ")
      : "None";
    summary.textContent = `Selected: ${selectedText} · ${pendingMarkerPlacement}`;
  }
}

function toggleCellMarkerSelection(markerValue) {
  if (!markerValue) return;
  const nextValues = pendingMarkers.includes(markerValue)
    ? pendingMarkers.filter((marker) => marker !== markerValue)
    : [...pendingMarkers, markerValue];
  updateCellMarkerSelection(nextValues);
}

function updateCellMarkerPlacementSelection(placementValue) {
  const normalizedValue = WB_MARKER_PLACEMENTS.has(placementValue)
    ? placementValue
    : "prefix";
  const container = document.getElementById("cellMarkerPlacement");
  pendingMarkerPlacement = normalizedValue;

  if (container) {
    container.querySelectorAll(".cell-marker-placement-btn").forEach((button) => {
      button.classList.toggle("selected", button.dataset.placement === normalizedValue);
    });
  }

  updateCellMarkerSelection(pendingMarkers);
}

function clearCellMarker() {
  updateCellMarkerSelection([]);
}

function populateWbBatchMarkerOptions() {
  const select = document.getElementById("wbBatchCadence");
  if (!select) return;

  const currentValue = select.value || "__skip__";
  select.innerHTML =
    '<option value="__skip__">— keep —</option>' +
    '<option value="">None</option>' +
    WB_CELL_MARKER_OPTIONS.map(
      (option) => `<option value="${escapeHtml(option.value)}">${option.emoji} ${escapeHtml(option.label)}</option>`,
    ).join("");

  select.value = [...select.options].some((option) => option.value === currentValue)
    ? currentValue
    : "__skip__";
}

function initSwatchHandlers() {
  const bgSwatches = document.getElementById("bgColorSwatches");
  const textSwatches = document.getElementById("textColorSwatches");

  if (!bgSwatches || !textSwatches) return;

  bgSwatches.addEventListener("click", (event) => {
    if (event.target.classList.contains("color-swatch")) {
      pendingBgColor = event.target.dataset.color;
      updateSwatchSelection("bgColorSwatches", pendingBgColor);
      if (pendingBgColor && isColorDark(pendingBgColor)) {
        pendingTextColor = UI_COLORS.textWhite;
      } else if (pendingBgColor) {
        pendingTextColor = UI_COLORS.textBlack;
      }
      updateSwatchSelection("textColorSwatches", pendingTextColor);
    }
  });

  textSwatches.addEventListener("click", (event) => {
    if (event.target.classList.contains("color-swatch")) {
      pendingTextColor = event.target.dataset.color;
      updateSwatchSelection("textColorSwatches", pendingTextColor);
    }
  });
}

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
