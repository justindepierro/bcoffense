function savePlaybookState() {
  const state = {
    gamePlanOnly: document.getElementById("pbGamePlanFilter")?.checked || false,
    jvOnly: document.getElementById("pbJvFilter")?.checked || false,
    sortColumn: currentSortColumn,
    sortDirection: currentSortDirection,
    secondarySortColumn: secondarySortColumn,
    secondarySortDirection: secondarySortDirection,
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
  const candidates = (play) => typeof getPlayFilterVariants === "function"
    ? getPlayFilterVariants(play)
    : [play];
  const values = (field, normalize = normalizeCase) => [
    ...new Set(plays.flatMap(candidates).map((play) => normalize(play[field])).filter(Boolean)),
  ].sort();
  const unique = (field) => values(field);

  _filterCache = {
    types: unique("type"),
    situations: unique("preferredSituation"),
    downs: unique("preferredDown"),
    distances: unique("preferredDistance"),
    hashes: unique("preferredHash"),
    fieldPositions: unique("preferredFieldPosition"),
    personnels: unique("personnel"),
    formations: values("formation", (value) => String(value || "").trim()),
    basePlays: values("basePlay", (value) => String(value || "").trim()),
    backs: values("back", (value) => String(value || "").trim()),
    motions: values("motion", (value) => String(value || "").trim()),
    protections: values("protection", (value) => String(value || "").trim()),
    tempos: values("tempo", (value) => String(value || "").trim()),
  };
  return _filterCache;
}

function invalidateFilterCache() {
  _filterCache = null;
  if (typeof invalidatePlaybookRuntimeIndex === "function") {
    invalidatePlaybookRuntimeIndex();
  }
  if (typeof invalidateStatsBarCache === "function") {
    invalidateStatsBarCache();
  }
}

function restorePlaybookState() {
  try {
    const state = storageManager.get(STORAGE_KEYS.PLAYBOOK_STATE, null);
    if (!state) return;

    if (state.sortColumn) {
      currentSortColumn = state.sortColumn;
      currentSortDirection = state.sortDirection || "asc";
    }
    if (state.secondarySortColumn) {
      secondarySortColumn = state.secondarySortColumn;
      secondarySortDirection = state.secondarySortDirection || "asc";
    }

    const gpFilter = document.getElementById("pbGamePlanFilter");
    if (gpFilter && state.gamePlanOnly) gpFilter.checked = true;
    const jvFilter = document.getElementById("pbJvFilter");
    if (jvFilter && state.jvOnly) jvFilter.checked = true;

    _syncSortUI();
    if (typeof renderPbSortPresetDropdown === "function") renderPbSortPresetDropdown();
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
