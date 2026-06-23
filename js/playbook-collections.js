// Playbook collections runtime: save, load, send, and panel UI.

async function savePlayCollection() {
  try {
    if (filteredPlays.length === 0) {
      showToast("No plays to save — adjust your filters first", {
        type: "warning",
      });
      return;
    }

    const name = await showPrompt(
      `Save ${filteredPlays.length} filtered plays as a collection:`,
      "",
      {
        title: "Save Collection",
        icon: "🔖",
        placeholder: "e.g. Red Zone Passes, 3rd Down Package",
        confirmText: "Save",
      },
    );
    if (!name || !name.trim()) return;

    const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
    const filterState = _captureFilterState();
    const playKeys = filteredPlays.map((play) => ({
      formation: play.formation || "",
      play: play.play || "",
      type: play.type || "",
      personnel: play.personnel || "",
    }));

    collections.push({
      name: name.trim(),
      playKeys,
      filterState,
      count: filteredPlays.length,
      created: new Date().toISOString(),
    });

    storageManager.set(STORAGE_KEYS.PLAY_COLLECTIONS, collections);
    updateCollectionsBadge();
    renderCollectionsPanel();
    showToast(`Saved "${name.trim()}" (${filteredPlays.length} plays)`, {
      type: "success",
    });
  } catch (err) {
    console.error("savePlayCollection error:", err);
    showToast("❌ Error saving collection.", { duration: 4000, type: "error" });
  }
}

function _captureFilterState() {
  return {
    activeTypes: [...activeTypeChips],
    activePersonnel: [...activePersonnelChips],
    activePictures: [...activePictureChips],
    filterFormation: document.getElementById("filterFormation")?.value || "",
    filterBasePlay: document.getElementById("filterBasePlay")?.value || "",
    filterBack: document.getElementById("pbFilterBack")?.value || "",
    filterMotion: document.getElementById("pbFilterMotion")?.value || "",
    filterProtection:
      document.getElementById("pbFilterProtection")?.value || "",
    filterTempo: document.getElementById("pbFilterTempo")?.value || "",
    searchPlay: document.getElementById("searchPlay")?.value || "",
  };
}

function loadCollection(index) {
  const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
  const coll = collections[index];
  if (!coll) return;

  if (coll.filterState) {
    const state = coll.filterState;
    activeTypeChips = new Set(state.activeTypes || []);
    activePersonnelChips = new Set(state.activePersonnel || []);
    activePictureChips = new Set(state.activePictures || []);
    buildFilterChips();

    _setVal("filterFormation", state.filterFormation || "");
    _setVal("filterBasePlay", state.filterBasePlay || "");
    _setVal("pbFilterBack", state.filterBack || "");
    _setVal("pbFilterMotion", state.filterMotion || "");
    _setVal("pbFilterProtection", state.filterProtection || "");
    _setVal("pbFilterTempo", state.filterTempo || "");
    _setVal("searchPlay", state.searchPlay || "");

    if (
      state.filterFormation ||
      state.filterBasePlay ||
      state.filterBack ||
      state.filterMotion ||
      state.filterProtection ||
      state.filterTempo
    ) {
      moreFiltersOpen = true;
      const panel = document.getElementById("pbMoreFilters");
      const arrow = document.getElementById("pbMoreArrow");
      if (panel) panel.classList.add("open");
      if (arrow) arrow.classList.add("open");
    }

    filterPlays();
  } else {
    _loadCollectionByKeys(coll);
  }

  showToast(`Loaded "${coll.name}" (${coll.count} plays)`);
}

function _loadCollectionByKeys(coll) {
  activeTypeChips.clear();
  activePersonnelChips.clear();
  activePictureChips.clear();
  buildFilterChips();
  [
    "filterFormation",
    "filterBasePlay",
    "pbFilterBack",
    "pbFilterMotion",
    "pbFilterProtection",
    "pbFilterTempo",
    "searchPlay",
  ].forEach((id) => _setVal(id, ""));

  filteredPlays = plays.filter((play) =>
    coll.playKeys.some(
      (key) => key.formation === play.formation && key.play === play.play,
    ),
  );
  applyCurrentSort();
  renderPlaybook();
  updateActiveFilterBar();
}

async function deleteCollection(index) {
  const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
  const coll = collections[index];
  if (!coll) return;

  const ok = await showConfirm(`Delete collection "${coll.name}"?`, {
    title: "Delete Collection",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;

  collections.splice(index, 1);
  storageManager.set(STORAGE_KEYS.PLAY_COLLECTIONS, collections);
  updateCollectionsBadge();
  renderCollectionsPanel();
  showToast(`Deleted "${coll.name}"`);
}

async function sendCollectionToScript(index) {
  const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
  const coll = collections[index];
  if (!coll) return;

  const matchedPlays = _resolveCollectionPlays(coll);
  if (matchedPlays.length === 0) {
    showToast("No matching plays found in current playbook", {
      type: "warning",
    });
    return;
  }

  const ok = await showConfirm(
    `Add ${matchedPlays.length} plays from "${coll.name}" to the practice script?`,
    { title: "Send to Script", icon: "📋", confirmText: "Add All" },
  );
  if (!ok) return;

  _addPlaysToScript(matchedPlays);
  showToast(`Added ${matchedPlays.length} plays to script`, {
    type: "success",
  });
}

async function sendCollectionToCallSheet(index) {
  const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
  const coll = collections[index];
  if (!coll) return;

  const matchedPlays = _resolveCollectionPlays(coll);
  if (matchedPlays.length === 0) {
    showToast("No matching plays found in current playbook", {
      type: "warning",
    });
    return;
  }

  const ok = await showConfirm(
    `Auto-place ${matchedPlays.length} plays from "${coll.name}" onto the call sheet based on their preferred fields?\n\nExisting call sheet plays will NOT be removed.`,
    { title: "Send to Call Sheet", icon: "📊", confirmText: "Place Plays" },
  );
  if (!ok) return;

  const placed = _addPlaysToCallSheet(matchedPlays);
  showToast(`Placed ${placed} entries on call sheet`, { type: "success" });
}

function _resolveCollectionPlays(coll) {
  return plays.filter((play) =>
    coll.playKeys.some(
      (key) => key.formation === play.formation && key.play === play.play,
    ),
  );
}

async function sendFilteredToScript() {
  if (filteredPlays.length === 0) {
    showToast("No plays to send — adjust your filters", { type: "warning" });
    return;
  }

  const ok = await showConfirm(
    `Add ${filteredPlays.length} filtered plays to the practice script?`,
    { title: "Send to Script", icon: "📋", confirmText: "Add All" },
  );
  if (!ok) return;

  _addPlaysToScript(filteredPlays);
  showToast(`Added ${filteredPlays.length} plays to script`, {
    type: "success",
  });
}

async function sendFilteredToCallSheet() {
  if (filteredPlays.length === 0) {
    showToast("No plays to send — adjust your filters", { type: "warning" });
    return;
  }

  const ok = await showConfirm(
    `Auto-place ${filteredPlays.length} filtered plays onto the call sheet based on their preferred fields?\n\nExisting call sheet plays will NOT be removed.`,
    { title: "Send to Call Sheet", icon: "📊", confirmText: "Place Plays" },
  );
  if (!ok) return;

  const placed = _addPlaysToCallSheet(filteredPlays);
  showToast(`Placed ${placed} entries on call sheet`, { type: "success" });
}

function _addPlaysToScript(playList) {
  if (typeof saveScriptState === "function") saveScriptState();
  if (typeof ensureFirstPeriod === "function") ensureFirstPeriod();

  playList.forEach((play) => {
    const index = plays.findIndex(
      (item) => item.play === play.play && item.formation === play.formation,
    );
    if (index >= 0) {
      script.push({
        ...plays[index],
        reps: 1,
        notes: "",
        hash: "",
        defFront: "",
        defCoverage: "",
        defStunt: "",
        defBlitz: "",
        id: Date.now() + Math.random(),
      });
    }
  });

  if (typeof renderScript === "function") renderScript();
}

function _addPlaysToCallSheet(playList) {
  if (typeof findMatchingCategories !== "function") return 0;

  const existing = {};
  const playKey = (play) =>
    `${(play.formation || "").toLowerCase()}|${(play.play || "").toLowerCase()}|${(play.personnel || "").toLowerCase()}`;

  if (typeof CALLSHEET_CATEGORIES !== "undefined") {
    CALLSHEET_CATEGORIES.forEach((cat) => {
      if (!callSheet[cat.id]) callSheet[cat.id] = { left: [], right: [] };
      existing[cat.id] = new Set();
      callSheet[cat.id].left.forEach((play) => existing[cat.id].add(playKey(play)));
      callSheet[cat.id].right.forEach((play) => existing[cat.id].add(playKey(play)));
    });
  }

  let totalPlaced = 0;

  playList.forEach((play) => {
    const categories = findMatchingCategories(play);
    if (categories.length === 0) return;

    const wbNum =
      typeof getWristbandNumberForPlay === "function"
        ? getWristbandNumberForPlay(play)
        : null;
    const playWithNum = { ...play, wristbandNumber: wbNum };
    const key = playKey(play);

    categories.forEach((catId) => {
      if (!existing[catId]) existing[catId] = new Set();
      if (existing[catId].has(key)) return;
      existing[catId].add(key);

      const hash = (play.preferredHash || "").toLowerCase().trim();
      if (hash === "left" || hash === "l") {
        callSheet[catId].left.push(playWithNum);
      } else if (hash === "right" || hash === "r") {
        callSheet[catId].right.push(playWithNum);
      } else {
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

  if (typeof scheduleRenderCallSheet === "function") {
    scheduleRenderCallSheet();
  } else if (typeof renderCallSheet === "function") {
    renderCallSheet();
  }
  if (typeof saveCallSheet === "function") saveCallSheet();
  return totalPlaced;
}

function toggleCollectionsPanel() {
  const panel = document.getElementById("pbCollectionsPanel");
  if (!panel) return;
  const isOpen = panel.classList.toggle("open");
  panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if (isOpen) renderCollectionsPanel();
}

function updateCollectionsBadge() {
  const badge = document.getElementById("pbCollectionCount");
  if (!badge) return;
  const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
  badge.textContent = collections.length;
}

function renderCollectionsPanel() {
  const list = document.getElementById("pbCollectionsList");
  if (!list) return;

  const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
  if (collections.length === 0) {
    list.innerHTML =
      '<div class="pb-collection-empty">No saved collections yet.<br>Filter your playbook and click <strong>Save Collection</strong> to create one.</div>';
    return;
  }

  list.innerHTML = collections
    .map((coll, idx) => {
      const date = coll.created ? new Date(coll.created).toLocaleDateString() : "";
      return `
        <div class="pb-coll-card">
          <div class="pb-coll-info">
            <div class="pb-coll-name">${escapeHtml(coll.name)}</div>
            <div class="pb-coll-meta">${coll.count} plays${date ? " &middot; " + date : ""}</div>
          </div>
          <div class="pb-coll-actions">
            <button class="pb-coll-btn" data-action="loadCollection" data-idx="${idx}" title="Load filters">Load</button>
            <button class="pb-coll-btn" data-action="sendCollectionToScript" data-idx="${idx}" title="Send to script">&#128203; Script</button>
            <button class="pb-coll-btn" data-action="sendCollectionToCallSheet" data-idx="${idx}" title="Send to call sheet">&#128202; Sheet</button>
            <button class="pb-coll-btn danger" data-action="deleteCollection" data-idx="${idx}" title="Delete">&times;</button>
          </div>
        </div>`;
    })
    .join("");
}

function initCollections() {
  updateCollectionsBadge();
}
