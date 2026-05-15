function savePlaybookState() {
  const state = {
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
    sortColumn: currentSortColumn,
    sortDirection: currentSortDirection,
    secondarySortColumn: secondarySortColumn,
    secondarySortDirection: secondarySortDirection,
    moreFiltersOpen: moreFiltersOpen,
  };
  storageManager.set(STORAGE_KEYS.PLAYBOOK_STATE, state);
}

let _filterCache = null;

function getFilterCache() {
  if (_filterCache) return _filterCache;

  const normalizeCase = (str) => {
    if (!str || !str.trim()) return null;
    const trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  };
  const unique = (field) =>
    [
      ...new Set(plays.map((play) => normalizeCase(play[field])).filter(Boolean)),
    ].sort();

  _filterCache = {
    types: unique("type"),
    situations: unique("preferredSituation"),
    downs: unique("preferredDown"),
    distances: unique("preferredDistance"),
    hashes: unique("preferredHash"),
    fieldPositions: unique("preferredFieldPosition"),
    personnels: unique("personnel"),
    formations: [
      ...new Set(plays.map((play) => play.formation).filter(Boolean)),
    ].sort(),
    basePlays: [
      ...new Set(plays.map((play) => play.basePlay).filter(Boolean)),
    ].sort(),
  };
  return _filterCache;
}

function invalidateFilterCache() {
  _filterCache = null;
  if (typeof invalidatePlaybookRuntimeIndex === "function") {
    invalidatePlaybookRuntimeIndex();
  }
}

function restorePlaybookState() {
  try {
    const state = storageManager.get(STORAGE_KEYS.PLAYBOOK_STATE, null);
    if (!state) return;

    if (state.activeTypes) {
      activeTypeChips = new Set(state.activeTypes);
    }
    if (state.activePersonnel) {
      activePersonnelChips = new Set(state.activePersonnel);
    }
    if (state.activePictures) {
      activePictureChips = new Set(state.activePictures);
    }

    if (state.filterFormation) _setVal("filterFormation", state.filterFormation);
    if (state.filterBasePlay) _setVal("filterBasePlay", state.filterBasePlay);
    if (state.filterBack) _setVal("pbFilterBack", state.filterBack);
    if (state.filterMotion) _setVal("pbFilterMotion", state.filterMotion);
    if (state.filterProtection) {
      _setVal("pbFilterProtection", state.filterProtection);
    }
    if (state.filterTempo) _setVal("pbFilterTempo", state.filterTempo);
    if (state.searchPlay) _setVal("searchPlay", state.searchPlay);

    if (state.sortColumn) {
      currentSortColumn = state.sortColumn;
      currentSortDirection = state.sortDirection || "asc";
    }
    if (state.secondarySortColumn) {
      secondarySortColumn = state.secondarySortColumn;
      secondarySortDirection = state.secondarySortDirection || "asc";
    }

    if (state.moreFiltersOpen) {
      moreFiltersOpen = true;
      const panel = document.getElementById("pbMoreFilters");
      const arrow = document.getElementById("pbMoreArrow");
      if (panel) panel.classList.add("open");
      if (arrow) arrow.classList.add("open");
    }

    _syncSortUI();
  } catch (err) {
    console.error("restorePlaybookState error:", err);
    showToast("❌ Error restoring playbook state.", {
      duration: 3000,
      type: "error",
    });
  }
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}
