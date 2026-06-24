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
  ["csPickerGamePlanFilter", "csPickerJvFilter", "csPickerNotOnSheetFilter"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
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

  // Update chip count badges
  const gpCountEl = document.getElementById("csPickerGamePlanCount");
  if (gpCountEl) {
    const n = (typeof getGamePlanBoardSignatures === "function")
      ? getGamePlanBoardSignatures().size : 0;
    gpCountEl.textContent = n > 0 ? ` (${n})` : "";
  }
  const jvCountEl = document.getElementById("csPickerJvCount");
  if (jvCountEl) {
    const n = (typeof getGamePlanFlaggedCount === "function")
      ? getGamePlanFlaggedCount("jv") : 0;
    jvCountEl.textContent = n > 0 ? ` (${n})` : "";
  }

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

  const usedCallSheetKeys =
    typeof getCallSheetUsedPlayKeys === "function"
      ? getCallSheetUsedPlayKeys()
      : new Set();
  const notOnSheetCountEl = document.getElementById("csPickerNotOnSheetCount");
  if (notOnSheetCountEl) {
    const n =
      typeof csPlayKey === "function"
        ? sourceList.filter((play) => !usedCallSheetKeys.has(csPlayKey(play))).length
        : 0;
    notOnSheetCountEl.textContent = n > 0 ? ` (${n})` : "";
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

  const gamePlanOnly = document.getElementById("csPickerGamePlanFilter")?.checked || false;
  const jvOnly = document.getElementById("csPickerJvFilter")?.checked || false;
  const notOnSheetOnly = document.getElementById("csPickerNotOnSheetFilter")?.checked || false;
  if (gamePlanOnly && typeof isPlayInGamePlanBoard === "function") {
    filtered = filtered.filter((play) => isPlayInGamePlanBoard(play));
  }
  if (jvOnly && typeof isPlayFlaggedInGamePlan === "function") {
    filtered = filtered.filter((play) => isPlayFlaggedInGamePlan(play, "jv"));
  }
  if (notOnSheetOnly && typeof csPlayKey === "function") {
    filtered = filtered.filter((play) => !usedCallSheetKeys.has(csPlayKey(play)));
  }

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
      tempoFilter ||
      gamePlanOnly ||
      jvOnly ||
      notOnSheetOnly
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

function syncLoadedWristbandToCallSheetCategory(
  wristbandPlays = callSheetSettings.loadedWristbandPlays,
) {
  const categoryId = String(
    callSheetSettings.wristbandAutoCategoryId || "",
  ).trim();
  if (!categoryId || !CALLSHEET_CATEGORIES.some((cat) => cat.id === categoryId)) {
    return 0;
  }

  const seen = new Set();
  const passingPlays = (Array.isArray(wristbandPlays) ? wristbandPlays : [])
    .filter(
      (play) =>
        isCallSheetPassingPlay(play) &&
        isCallSheetPlayAllowed(play),
    )
    .filter((play) => {
      const key = csPlayKey(play);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  callSheet[categoryId] = { left: [], right: [] };
  passingPlays.forEach((play) => {
    const hash = String(play.preferredHash || "").trim().toLowerCase();
    if (hash === "left" || hash === "l") {
      callSheet[categoryId].left.push({ ...play });
    } else if (hash === "right" || hash === "r") {
      callSheet[categoryId].right.push({ ...play });
    } else {
      const side =
        callSheet[categoryId].left.length <= callSheet[categoryId].right.length
          ? "left"
          : "right";
      callSheet[categoryId][side].push({ ...play });
    }
  });

  return passingPlays.length;
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
  const cellsPerCard = getWristbandRecordCellCount(wristbandData);
  wristbandData.cards.forEach((card, cardIdx) => {
    const cellData = card.data || card;
    if (!Array.isArray(cellData)) return;
    cellData.slice(0, cellsPerCard).forEach((play, cellIdx) => {
      if (play && (play.formation || play.play)) {
        const wristbandNum =
          cardIdx * cellsPerCard + cellIdx + WRISTBAND_OFFSET;
        wristbandPlays.push({ ...play, wristbandNumber: wristbandNum });
      }
    });
  });

  callSheetSettings.loadedWristbandName = wristbandData.title;
  callSheetSettings.loadedWristbandPlays = wristbandPlays;
  const syncedCount = syncLoadedWristbandToCallSheetCategory(wristbandPlays);
  saveCallSheetSettings();

  refreshWristbandNumbers();
  updateLoadedWristbandDisplay();

  closeLoadWristbandModal();
  showToast(
    `📋 Loaded "${wristbandData.title}" (${wristbandPlays.length} plays)` +
      (syncedCount > 0 ? ` · synced ${syncedCount} passing plays` : ""),
  );
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
  const autoCategoryId = String(
    callSheetSettings.wristbandAutoCategoryId || "",
  ).trim();
  callSheetSettings.loadedWristbandName = "";
  callSheetSettings.loadedWristbandPlays = [];
  if (autoCategoryId && callSheet[autoCategoryId]) {
    callSheet[autoCategoryId] = { left: [], right: [] };
  }
  saveCallSheetSettings();
  refreshWristbandNumbers();
  updateLoadedWristbandDisplay();
  showToast("🗑️ Wristband unloaded");
}

function removeCallSheetPlay(categoryId, hash, index) {
  callSheet[categoryId][hash].splice(index, 1);
  renderCallSheet();
  saveCallSheet();
}

function addCsBlankRow(arg) {
  const parts = String(arg || "").split(":");
  const catId = parts[0];
  const hash = parts[1];
  if (!catId || !hash || !callSheet[catId]) return;
  if (!Array.isArray(callSheet[catId][hash])) callSheet[catId][hash] = [];
  callSheet[catId][hash].push({ _blank: true });
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
  // Match dropEffect to the source's effectAllowed so the browser doesn't
  // silently reject the drop (e.g. drawer rows use "copy", internal moves use
  // "move"). "copyMove" / "all" / "uninitialized" fall back to "move".
  const allowed = event.dataTransfer?.effectAllowed || "";
  event.dataTransfer.dropEffect = allowed === "copy" ? "copy" : "move";

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

    // Clear state + dragging classes BEFORE re-render. renderCallSheet
    // wipes the grid DOM, detaching the source row -- after which dragend
    // does NOT bubble to document, so any cleanup deferred to dragend would
    // be lost.
    draggedCallSheetPlay = null;
    document.querySelectorAll(".callsheet-play.dragging").forEach((el) => el.classList.remove("dragging"));
    document.querySelectorAll(".cs-drop-above").forEach((el) => el.classList.remove("cs-drop-above"));

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
  } else if (source === "gameplan") {
    const gpIndex = parseInt(event.dataTransfer.getData("gpIndex"), 10);
    const arr = Array.isArray(window._gpDrawerVisiblePlays)
      ? window._gpDrawerVisiblePlays
      : [];
    if (!Number.isNaN(gpIndex) && arr[gpIndex]) {
      droppedPlay = arr[gpIndex];
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
    const qaBtn = quickWrap.querySelector(".cs-toolbar-secondary-summary");
    const stored = storageManager.get(STORAGE_KEYS.CALLSHEET_QUICK_ACTIONS_OPEN, null);
    if (stored === true && qaBtn) toggleCollapsiblePanel(qaBtn);
    if (qaBtn) {
      const obs = new MutationObserver(() => {
        storageManager.set(
          STORAGE_KEYS.CALLSHEET_QUICK_ACTIONS_OPEN,
          qaBtn.getAttribute("aria-expanded") === "true",
        );
      });
      obs.observe(qaBtn, { attributes: true, attributeFilter: ["aria-expanded"] });
    }
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
    if (typeof addLongPress === "function") {
      addLongPress(grid, (event) => {
        const play = event.target?.closest && event.target.closest(".callsheet-play");
        if (!play) return;
        const { category, hash, index } = play.dataset;
        if (category && hash && index !== undefined) {
          showPlayContextMenu(event, category, hash, parseInt(index, 10));
        }
      });
    }

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
