// Playbook viewer functionality

// ── Sorting state ──
let currentSortColumn = null;
let currentSortDirection = "asc";
let secondarySortColumn = null;
let secondarySortDirection = "asc";
let selectedRowIndex = -1;

// ── Chip filter state (multi-select) ──
let activeTypeChips = new Set();
let activePersonnelChips = new Set();
let activePictureChips = new Set();

// ── More-filters collapsed state ──
let moreFiltersOpen = false;

// ── Pagination state ──
const PLAYS_PER_PAGE = 50;
let currentPage = 0;

// Storage key for persisting filter/sort state is STORAGE_KEYS.PLAYBOOK_STATE

/**
 * Get sort value for a play by column key
 */
function _sortVal(play, col) {
  if (col === "install") {
    const rating =
      typeof getPlayInstallRating === "function"
        ? getPlayInstallRating(play)
        : { stars: 0, maxStars: 0 };
    return rating.maxStars > 0 ? rating.stars / rating.maxStars : -1;
  }
  if (col === "tags") {
    return [play.formTag1, play.formTag2].filter(Boolean).join(", ") || "";
  }
  return play[col] || "";
}

/**
 * Compare two values for sort (numeric or string)
 */
function _sortCmp(a, b, dir) {
  if (typeof a === "number" && typeof b === "number") {
    return dir === "asc" ? a - b : b - a;
  }
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  if (sa < sb) return dir === "asc" ? -1 : 1;
  if (sa > sb) return dir === "asc" ? 1 : -1;
  return 0;
}

/**
 * Apply current sort (primary + secondary) to filteredPlays
 */
function applyCurrentSort() {
  if (!currentSortColumn) return;
  filteredPlays.sort((a, b) => {
    const cmp1 = _sortCmp(
      _sortVal(a, currentSortColumn),
      _sortVal(b, currentSortColumn),
      currentSortDirection,
    );
    if (cmp1 !== 0 || !secondarySortColumn) return cmp1;
    return _sortCmp(
      _sortVal(a, secondarySortColumn),
      _sortVal(b, secondarySortColumn),
      secondarySortDirection,
    );
  });
}

/**
 * Sort the playbook table by a column header click (toggles direction)
 */
function sortPlaybook(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    currentSortColumn = column;
    currentSortDirection = "asc";
  }
  _syncSortUI();
  applyCurrentSort();
  requestRenderPlaybook();
  savePlaybookState();
}

/**
 * Called by the primary/secondary sort dropdowns
 */
function applyAdvancedSort() {
  const primary = document.getElementById("pbSortPrimary");
  const secondary = document.getElementById("pbSortSecondary");
  currentSortColumn = primary ? primary.value || null : null;
  secondarySortColumn = secondary ? secondary.value || null : null;
  _syncSortUI();
  applyCurrentSort();
  requestRenderPlaybook();
  savePlaybookState();
}

/**
 * Toggle sort direction button for primary or secondary
 */
function toggleSortDir(which) {
  if (which === "primary") {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    secondarySortDirection =
      secondarySortDirection === "asc" ? "desc" : "asc";
  }
  _syncSortUI();
  applyCurrentSort();
  requestRenderPlaybook();
  savePlaybookState();
}

/**
 * Sync sort dropdowns, direction buttons, and column header icons
 */
function _syncSortUI() {
  const primary = document.getElementById("pbSortPrimary");
  const secondary = document.getElementById("pbSortSecondary");
  const primaryDir = document.getElementById("pbSortPrimaryDir");
  const secondaryDir = document.getElementById("pbSortSecondaryDir");
  if (primary) primary.value = currentSortColumn || "";
  if (secondary) secondary.value = secondarySortColumn || "";
  if (primaryDir) {
    primaryDir.innerHTML =
      currentSortDirection === "asc" ? "&#9650;" : "&#9660;";
    primaryDir.classList.toggle("desc", currentSortDirection === "desc");
    primaryDir.setAttribute("aria-label", `Sort primary field: ${currentSortDirection === "asc" ? "ascending" : "descending"}`);
  }
  if (secondaryDir) {
    secondaryDir.innerHTML =
      secondarySortDirection === "asc" ? "&#9650;" : "&#9660;";
    secondaryDir.classList.toggle("desc", secondarySortDirection === "desc");
    secondaryDir.setAttribute("aria-label", `Sort secondary field: ${secondarySortDirection === "asc" ? "ascending" : "descending"}`);
  }
  document
    .querySelectorAll("#playbookTable th[data-action='sortPlaybook']")
    .forEach((th) => {
      th.setAttribute("aria-sort", "none");
      const icon = th.querySelector(".sort-icon");
      if (icon) icon.classList.remove("asc", "desc");
    });
  if (currentSortColumn) {
    const th = document.querySelector(
      `#playbookTable th[data-arg="${currentSortColumn}"]`,
    );
    if (th) {
      th.setAttribute(
        "aria-sort",
        currentSortDirection === "asc" ? "ascending" : "descending",
      );
      const icon = th.querySelector(".sort-icon");
      if (icon) icon.classList.add(currentSortDirection);
    }
  }
}

// ── Chip Filters ──

/**
 * Build the toggle chips for Type and Personnel from loaded plays
 */
function buildFilterChips() {
  _buildChipGroup("pbChipsType", "type", activeTypeChips);
  _buildChipGroup("pbChipsPersonnel", "personnel", activePersonnelChips);
  _buildPictureChips();
}

// Build the Vision Mode "Picture" chip row from VISION_2026.pictures.
// Visible only when Vision Mode is ON.
function _buildPictureChips() {
  const row = document.getElementById("pbChipsPictureRow");
  const container = document.getElementById("pbChipsPicture");
  if (!row || !container) return;
  const on = typeof isVisionMode === "function" && isVisionMode();
  if (!on || typeof VISION_2026 === "undefined") {
    row.hidden = true;
    container.innerHTML = "";
    return;
  }
  const labels = {
    wideZone: "Wide Zone",
    pullers: "Pullers/Counter",
    downhill: "Downhill/ISO",
    antiFront: "Anti-front",
  };
  row.hidden = false;
  container.innerHTML = Object.keys(labels)
    .map((key) => {
      const active = activePictureChips.has(key) ? " active" : "";
      return `<button class="pb-chip${active}" data-value="${escapeHtml(key)}">${escapeHtml(labels[key])}</button>`;
    })
    .join("");
}

function _buildChipGroup(containerId, field, activeSet) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const values = [...new Set(plays.map((play) => play[field]))]
    .filter(Boolean)
    .sort();
  container.innerHTML = values
    .map((value) => {
      const active = activeSet.has(value) ? " active" : "";
      return `<button class="pb-chip${active}" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
    })
    .join("");
}

/**
 * Delegated click handler for chip groups
 */
function _onChipClick(e) {
  const chip = e.target.closest(".pb-chip");
  if (!chip) return;
  const group = chip.closest(".pb-chip-group");
  if (!group) return;
  const value = chip.dataset.value;
  let set;
  if (group.id === "pbChipsType") set = activeTypeChips;
  else if (group.id === "pbChipsPersonnel") set = activePersonnelChips;
  else if (group.id === "pbChipsPicture") set = activePictureChips;
  else return;
  if (set.has(value)) {
    set.delete(value);
    chip.classList.remove("active");
  } else {
    set.add(value);
    chip.classList.add("active");
  }
  filterPlays();
}

function initChipListeners() {
  document
    .getElementById("pbChipsType")
    ?.addEventListener("click", _onChipClick);
  document
    .getElementById("pbChipsPersonnel")
    ?.addEventListener("click", _onChipClick);
  document
    .getElementById("pbChipsPicture")
    ?.addEventListener("click", _onChipClick);
}

// ── More Filters toggle ──

function toggleMoreFilters() {
  moreFiltersOpen = !moreFiltersOpen;
  const panel = document.getElementById("pbMoreFilters");
  const arrow = document.getElementById("pbMoreArrow");
  if (panel) panel.classList.toggle("open", moreFiltersOpen);
  if (arrow) arrow.classList.toggle("open", moreFiltersOpen);
}

// ── Populate Filters ──

/**
 * Populate filter dropdowns and chip groups with unique values from plays
 */
function populateFilters() {
  try {
    const cache = getFilterCache();

    // Playbook dropdown filters
    _fillSelect("filterFormation", "All Formations", cache.formations);
    _fillSelect("filterBasePlay", "All Base Plays", cache.basePlays);
    _fillSelect("pbFilterBack", "All Backs", cache.backs);
    _fillSelect("pbFilterMotion", "All Motions", cache.motions);
    _fillSelect("pbFilterProtection", "All Protections", cache.protections);
    _fillSelect("pbFilterTempo", "All Tempos", cache.tempos);

    // Build chip groups
    buildFilterChips();

    // Script builder filters (dropdowns only - checkboxes populated separately)
    const scriptFormFilter = document.getElementById("scriptFilterFormation");
    if (scriptFormFilter) {
      scriptFormFilter.innerHTML =
        '<option value="">All Formations</option>' +
        cache.formations
          .map(
            (f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`,
          )
          .join("");
    }
    const scriptBaseFilter = document.getElementById("scriptFilterBasePlay");
    if (scriptBaseFilter) {
      scriptBaseFilter.innerHTML =
        '<option value="">All Base Plays</option>' +
        cache.basePlays
          .map(
            (b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`,
          )
          .join("");
    }

    // Populate script checkbox filters
    populateScriptCheckboxFilters();

    // Wristband filters
    const wbTypeFilter = document.getElementById("wbFilterType");
    if (wbTypeFilter) {
      wbTypeFilter.innerHTML =
        '<option value="">All Play Types</option>' +
        cache.types
          .map(
            (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`,
          )
          .join("");
    }

    // Populate wristband highlight dropdown
    populateWristbandHighlightDropdown();
  } catch (err) {
    console.error("populateFilters error:", err);
    showToast("❌ Error loading filters.", { duration: 3000, type: "error" });
  }
}

function _fillSelect(id, allLabel, values) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML =
    `<option value="">${allLabel}</option>` +
    values
      .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
      .join("");
}

/**
 * Populate the wristband highlight dropdown in playbook
 */
function populateWristbandHighlightDropdown() {
  const select = document.getElementById("playbookWristbandHighlight");
  if (!select) return;

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);

  select.innerHTML =
    '<option value="">🏈 Highlight Wristband</option>' +
    saved
      .map((wb, idx) => {
        const totalPlays = wb.cards
          ? wb.cards.reduce(
            (sum, c) => sum + c.data.filter((p) => p !== null).length,
            0,
          )
          : 0;
        return `<option value="${idx}">${escapeHtml(wb.title)} (${totalPlays} plays)</option>`;
      })
      .join("");
}
