let _csPickerFiltered = [];
let draggedCallSheetPlay = null;

function setCallSheetOverlayVisibility(overlayId, isOpen) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return null;

  overlay.classList.toggle("hidden", !isOpen);
  overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if (isOpen) {
    overlay.removeAttribute("inert");
  } else {
    overlay.setAttribute("inert", "");
  }

  return overlay;
}

function openCallSheetPlayPicker(categoryId, hash) {
  editingCategory = categoryId;
  editingHash = hash;

  document.getElementById("callSheetPlaySearch").value = "";
  [
    "callSheetPickerPersonnel",
    "callSheetPickerFormation",
    "callSheetPickerPlayType",
    "callSheetPickerBack",
    "callSheetPickerTempo",
    "callSheetPickerSort",
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });

  populateCallSheetPickerFilters();
  updatePickerSourceUI();
  populateCallSheetPlayList();

  const overlay = setCallSheetOverlayVisibility("callSheetPickerOverlay", true);
  if (overlay) trapFocus(overlay);
}

function populateCallSheetPickerFilters() {
  const sets = {
    personnel: new Set(),
    formation: new Set(),
    back: new Set(),
    tempo: new Set(),
    type: new Set(),
  };
  for (const play of plays) {
    if (play.personnel) sets.personnel.add(play.personnel);
    if (play.formation) sets.formation.add(play.formation);
    if (play.back) sets.back.add(play.back);
    if (play.tempo) sets.tempo.add(play.tempo);
    if (play.type) sets.type.add(play.type);
  }

  function fillDropdown(selectId, values, allLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const sorted = [...values].sort();
    select.innerHTML =
      `<option value="">${allLabel}</option>` +
      sorted
        .map(
          (value) =>
            `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`,
        )
        .join("");
  }

  fillDropdown("callSheetPickerPersonnel", sets.personnel, "All Personnel");
  fillDropdown("callSheetPickerFormation", sets.formation, "All Formations");
  fillDropdown("callSheetPickerBack", sets.back, "All Backs");
  fillDropdown("callSheetPickerTempo", sets.tempo, "All Tempos");
  fillDropdown("callSheetPickerPlayType", sets.type, "All Types");

  const wristbandSelect = document.getElementById("callSheetWristbandSelect");
  if (wristbandSelect) {
    const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
    wristbandSelect.innerHTML =
      '<option value="">Select Wristband...</option>' +
      saved
        .map(
          (wristband, index) =>
            `<option value="${index}">${escapeHtml(wristband.title || "Untitled")}</option>`,
        )
        .join("");
  }
}

function updatePickerSourceUI() {
  const source =
    document.querySelector('input[name="callSheetSource"]:checked')?.value ||
    "playbook";
  const infoSpan = document.getElementById("pickerWristbandInfo");

  if (!infoSpan) return;

  if (
    callSheetSettings.loadedWristbandName &&
    callSheetSettings.loadedWristbandPlays?.length > 0
  ) {
    infoSpan.textContent = `(${callSheetSettings.loadedWristbandName}: ${callSheetSettings.loadedWristbandPlays.length} plays)`;
    infoSpan.className = source === "wristband" ? "text-success" : "text-muted";
    return;
  }

  infoSpan.textContent = source === "wristband" ? "(No wristband loaded)" : "";
  infoSpan.className = "text-danger";
}

function clearCsPickerSearch() {
  const input = document.getElementById("callSheetPlaySearch");
  if (input) {
    input.value = "";
    input.focus();
  }
  const button = document.getElementById("clearCsPickerSearch");
  if (button) button.style.display = "none";
  populateCallSheetPlayList();
}

function clearCsPickerFilters() {
  const search = document.getElementById("callSheetPlaySearch");
  if (search) search.value = "";
  const button = document.getElementById("clearCsPickerSearch");
  if (button) button.style.display = "none";
  [
    "callSheetPickerPersonnel",
    "callSheetPickerFormation",
    "callSheetPickerPlayType",
    "callSheetPickerBack",
    "callSheetPickerTempo",
    "callSheetPickerSort",
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });
  populateCallSheetPlayList();
}

function closeCallSheetPicker(event) {
  if (event && event.target !== event.currentTarget) return;
  setCallSheetOverlayVisibility("callSheetPickerOverlay", false);
}

function debouncedPopulateCallSheetPlayList() {
  if (!debouncedPopulateCallSheetPlayList._fn) {
    debouncedPopulateCallSheetPlayList._fn =
      typeof debounce === "function"
        ? debounce(populateCallSheetPlayList, 100)
        : populateCallSheetPlayList;
  }
  debouncedPopulateCallSheetPlayList._fn();
}

function populateCallSheetPlayList() {
  updatePickerSourceUI();

  const search = document.getElementById("callSheetPlaySearch").value.toLowerCase().trim();
  const clearBtn = document.getElementById("clearCsPickerSearch");
  if (clearBtn) clearBtn.style.display = search ? "" : "none";

  const personnelFilter = document.getElementById("callSheetPickerPersonnel")?.value || "";
  const formationFilter = document.getElementById("callSheetPickerFormation")?.value || "";
  const playTypeFilter = document.getElementById("callSheetPickerPlayType")?.value || "";
  const backFilter = document.getElementById("callSheetPickerBack")?.value || "";
  const tempoFilter = document.getElementById("callSheetPickerTempo")?.value || "";
  const sortBy = document.getElementById("callSheetPickerSort")?.value || "";
  const source =
    document.querySelector('input[name="callSheetSource"]:checked')?.value ||
    "playbook";

  let sourceList = [];

  if (source === "wristband") {
    if (
      callSheetSettings.loadedWristbandPlays &&
      callSheetSettings.loadedWristbandPlays.length > 0
    ) {
      sourceList = callSheetSettings.loadedWristbandPlays.map((play, index) => ({
        ...play,
        _sourceIdx: index,
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
    sourceList = plays.map((play, index) => {
      const copy = { ...play, _sourceIdx: index };
      if (
        callSheetSettings.loadedWristbandPlays &&
        callSheetSettings.loadedWristbandPlays.length > 0
      ) {
        const match = callSheetSettings.loadedWristbandPlays.find(
          (wristbandPlay) =>
            wristbandPlay.formation === play.formation &&
            wristbandPlay.play === play.play &&
            wristbandPlay.personnel === play.personnel,
        );
        if (match) copy.wristbandNumber = match.wristbandNumber;
      }
      return copy;
    });
  }

  let filtered = sourceList;

  if (search) {
    const searchTerms = search.split(/\s+/).filter(Boolean);
    filtered = filtered.filter((play) => {
      const blob = [
        play.type,
        play.personnel,
        play.formation,
        play.formTag1,
        play.formTag2,
        play.under,
        play.back,
        play.shift,
        play.motion,
        play.protection,
        play.lineCall,
        play.play,
        play.playTag1,
        play.playTag2,
        play.basePlay,
        play.oneWord,
        play.tempo,
        play.keyPlayer1,
        play.keyPlayer2,
        play.keyPlayer3,
        play.constraint1,
        play.constraint2,
        play.constraint3,
        play.deadVs,
        play.notes,
        play.preferredSituation,
        play.preferredFieldPosition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchTerms.every((term) => blob.includes(term));
    });
  }

  if (personnelFilter) filtered = filtered.filter((play) => play.personnel === personnelFilter);
  if (formationFilter) filtered = filtered.filter((play) => play.formation === formationFilter);
  if (playTypeFilter) filtered = filtered.filter((play) => (play.type || "") === playTypeFilter);
  if (backFilter) filtered = filtered.filter((play) => (play.back || "") === backFilter);
  if (tempoFilter) filtered = filtered.filter((play) => (play.tempo || "") === tempoFilter);

  if (sortBy) {
    filtered.sort((playA, playB) => {
      const valA = String(playA[sortBy] || "").toLowerCase();
      const valB = String(playB[sortBy] || "").toLowerCase();
      return valA.localeCompare(valB, undefined, { numeric: true });
    });
  }

  const countEl = document.getElementById("csPickerMatchCount");
  if (countEl) {
    const total = sourceList.length;
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

  const container = document.getElementById("callSheetPlayList");
  _csPickerFiltered = filtered;

  container.innerHTML = filtered
    .slice(0, 150)
    .map((play, index) => {
      const code = getPersonnelCode(play.personnel);
      const bgColor = getPersonnelBgColor(play.personnel);
      const textColor = getPersonnelTextColor(play.personnel);
      const wristbandNum = play.wristbandNumber
        ? `<span class="wristband-badge">#${play.wristbandNumber}</span>`
        : "";
      const chips = [];
      if (play.type) {
        chips.push(
          `<span class="cs-picker-chip cs-picker-chip-type">${escapeHtml(play.type)}</span>`,
        );
      }
      if (play.back) chips.push(`<span class="cs-picker-chip">${escapeHtml(play.back)}</span>`);
      if (play.tempo) chips.push(`<span class="cs-picker-chip">${escapeHtml(play.tempo)}</span>`);
      const locations = getCallSheetPlayLocations(play);
      if (locations.length) {
        locations.forEach((location) => {
          chips.push(
            `<span class="cs-picker-chip cs-picker-chip-onsheet">${escapeHtml(location)}</span>`,
          );
        });
      }
      const chipHtml = chips.length > 0
        ? `<span class="cs-picker-chips">${chips.join("")}</span>`
        : "";

      return `
      <div class="picker-play" data-action="csPickerAddPlay" data-idx="${index}">
        ${wristbandNum}
        <span class="personnel-code" style="background: ${bgColor}; color: ${textColor};">${code}</span>
        <span class="cs-picker-play-text">${escapeHtml(play.formation || "")} ${escapeHtml(play.protection || "")} <strong>${escapeHtml(play.play || "")}</strong></span>
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

function addCallSheetPlayFromPicker(playData) {
  if (!editingCategory || !editingHash) return;

  const play = { ...playData };
  delete play._sourceIdx;

  callSheet[editingCategory][editingHash].push(play);

  closeCallSheetPicker();
  renderCallSheet();
  saveCallSheet();
}

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
        (wristband, index) =>
          `<option value="${index}">${escapeHtml(wristband.title || "Untitled")}</option>`,
      )
      .join("");

  setCallSheetOverlayVisibility("loadWristbandModal", true);
}

function closeLoadWristbandModal(event) {
  if (event && event.target !== event.currentTarget) return;
  setCallSheetOverlayVisibility("loadWristbandModal", false);
}

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

  const wristbandPlays = [];
  wristbandData.cards.forEach((card, cardIdx) => {
    const cellData = card.data || card;
    if (!Array.isArray(cellData)) return;
    cellData.forEach((play, cellIdx) => {
      if (play && (play.formation || play.play)) {
        const wristbandNum = cardIdx * 40 + cellIdx + 11;
        wristbandPlays.push({ ...play, wristbandNumber: wristbandNum });
      }
    });
  });

  callSheetSettings.loadedWristbandName = wristbandData.title;
  callSheetSettings.loadedWristbandPlays = wristbandPlays;
  saveCallSheetSettings();

  refreshWristbandNumbers();
  updateLoadedWristbandDisplay();

  closeLoadWristbandModal();
  showToast(`📋 Loaded "${wristbandData.title}" (${wristbandPlays.length} plays)`);
}

function refreshWristbandNumbers() {
  CALLSHEET_CATEGORIES.forEach((cat) => {
    if (!callSheet[cat.id]) return;
    ["left", "right"].forEach((hash) => {
      if (!callSheet[cat.id][hash]) return;
      callSheet[cat.id][hash].forEach((play) => {
        play.wristbandNumber = getWristbandNumberForPlay(play);
      });
    });
  });
  renderCallSheet();
  _csUndoInProgress = true;
  saveCallSheet();
  _csUndoInProgress = false;
}

function updateLoadedWristbandDisplay() {
  const display = document.getElementById("loadedWristbandDisplay");
  if (!display) return;

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

function clearLoadedWristband() {
  callSheetSettings.loadedWristbandName = "";
  callSheetSettings.loadedWristbandPlays = [];
  saveCallSheetSettings();
  updateLoadedWristbandDisplay();
  showToast("🗑️ Wristband unloaded");
}

function removeCallSheetPlay(categoryId, hash, index) {
  callSheet[categoryId][hash].splice(index, 1);
  renderCallSheet();
  saveCallSheet();
}

function handleCallSheetDragStart(event, categoryId, hash, index) {
  draggedCallSheetPlay = { categoryId, hash, index };
  event.dataTransfer.setData("source", "callsheet");
  event.dataTransfer.effectAllowed = "move";
  event.target.closest(".callsheet-play")?.classList.add("dragging");
}

function handleCallSheetDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  const target = event.target.closest(".callsheet-play");
  document
    .querySelectorAll(".cs-drop-above")
    .forEach((element) => element.classList.remove("cs-drop-above"));
  if (target) target.classList.add("cs-drop-above");
}

function handleCallSheetDrop(event, targetCategory, targetHash) {
  event.preventDefault();
  document
    .querySelectorAll(".cs-drop-above")
    .forEach((element) => element.classList.remove("cs-drop-above"));

  const targetPlay = event.target.closest(".callsheet-play");
  let insertIdx = -1;
  if (targetPlay) insertIdx = parseInt(targetPlay.dataset.index, 10);

  if (!callSheet[targetCategory]) {
    callSheet[targetCategory] = { left: [], right: [] };
  }
  if (!Array.isArray(callSheet[targetCategory][targetHash])) {
    callSheet[targetCategory][targetHash] = [];
  }

  if (draggedCallSheetPlay) {
    const { categoryId, hash, index } = draggedCallSheetPlay;

    if (
      categoryId === targetCategory &&
      hash === targetHash &&
      index < insertIdx
    ) {
      insertIdx--;
    }

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
    if (
      !Number.isNaN(scriptIndex) &&
      script[scriptIndex] &&
      !script[scriptIndex].isSeparator
    ) {
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

function closeCsManagePresets() {
  document.getElementById("csManagePresetsOverlay")?.remove();
}

function closeCsSuggestOverlay() {
  document.getElementById("csSuggestOverlay")?.remove();
}

// Alias — overlay-close dispatcher strips "Overlay" suffix before calling
function closeCsSuggest() {
  closeCsSuggestOverlay();
}

function csPickerAddPlay(el) {
  const idx = parseInt(el.dataset?.idx ?? el, 10);
  const play = _csPickerFiltered[idx];
  if (play) addCallSheetPlayFromPicker(play);
}

document.addEventListener("DOMContentLoaded", () => {
  // Persist Quick Actions collapsible open/closed state
  const quickWrap = document.getElementById("csQuickActionsWrap");
  if (quickWrap) {
    const stored = storageManager.get("csQuickActionsOpen", null);
    if (stored === true) quickWrap.setAttribute("open", "");
    else if (stored === false) quickWrap.removeAttribute("open");
    quickWrap.addEventListener("toggle", () => {
      storageManager.set("csQuickActionsOpen", quickWrap.open);
    });
  }

  const grid = document.getElementById("callSheetGrid");
  if (grid) {
    grid.addEventListener("dblclick", (event) => {
      const el = event.target.closest("[data-dblaction]");
      if (!el) return;
      const action = el.dataset.dblaction;
      const cat = el.dataset.cat;
      if (action === "editCategoryName" && cat) editCategoryName(cat);
      else if (action === "editCategoryNote" && cat) editCategoryNote(cat);
    });

    grid.addEventListener("contextmenu", (event) => {
      const play = event.target.closest(".callsheet-play");
      if (!play) return;
      const { category, hash, index } = play.dataset;
      if (category && hash && index !== undefined) {
        showPlayContextMenu(event, category, hash, parseInt(index, 10));
      }
    });

    grid.addEventListener("dragstart", (event) => {
      const catDrag = event.target.closest("[data-drag='catDrag']");
      if (catDrag) {
        handleCatDragStart(event, catDrag.dataset.cat);
        return;
      }
      const play = event.target.closest(".callsheet-play");
      if (!play) return;
      const { category, hash, index } = play.dataset;
      handleCallSheetDragStart(event, category, hash, parseInt(index, 10));
    });

    grid.addEventListener("dragover", (event) => {
      const catDrag = event.target.closest("[data-drag='catDrag']");
      if (catDrag) {
        handleCatDragOver(event);
        return;
      }
      const hashCol = event.target.closest("[data-drop='csHashDrop']");
      if (hashCol || event.target.closest(".callsheet-play")) {
        handleCallSheetDragOver(event);
      }
    });

    grid.addEventListener("drop", (event) => {
      const catDrag = event.target.closest("[data-drag='catDrag']");
      if (catDrag) {
        handleCatDrop(event, catDrag.dataset.cat);
        return;
      }
      const hashCol = event.target.closest("[data-drop='csHashDrop']");
      if (hashCol) {
        handleCallSheetDrop(event, hashCol.dataset.cat, hashCol.dataset.hash);
      }
    });

    grid.addEventListener("dragend", (event) => {
      const catDrag = event.target.closest("[data-drag='catDrag']");
      if (catDrag) handleCatDragEnd(event);
      const play = event.target.closest(".callsheet-play");
      if (play) {
        play.classList.remove("dragging");
        draggedCallSheetPlay = null;
      }
      document
        .querySelectorAll(".cs-drop-above")
        .forEach((element) => element.classList.remove("cs-drop-above"));
    });

    grid.addEventListener("dblclick", (event) => {
      const play = event.target.closest(".callsheet-play");
      if (play && !event.target.closest("[data-dblaction]")) {
        const { category, hash, index } = play.dataset;
        if (category && hash && index !== undefined) {
          togglePlayHighlight(category, hash, parseInt(index, 10));
        }
      }
    });
  }

  document.body.addEventListener("dragstart", (event) => {
    const sortItem = event.target.closest("[data-drag='csSortDrag']");
    if (sortItem) handleCsSortDragStart(event, parseInt(sortItem.dataset.idx, 10));
  });
  document.body.addEventListener("dragover", (event) => {
    const sortItem = event.target.closest("[data-drag='csSortDrag']");
    if (sortItem) handleCsSortDragOver(event);
  });
  document.body.addEventListener("drop", (event) => {
    const sortItem = event.target.closest("[data-drag='csSortDrag']");
    if (sortItem) handleCsSortDrop(event, parseInt(sortItem.dataset.idx, 10));
  });
  document.body.addEventListener("dragend", (event) => {
    const sortItem = event.target.closest("[data-drag='csSortDrag']");
    if (sortItem) handleCsSortDragEnd(event);
  });
});