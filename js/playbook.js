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

// ── More-filters collapsed state ──
let moreFiltersOpen = false;

// Storage key for persisting filter/sort state is STORAGE_KEYS.PLAYBOOK_STATE

/**
 * Get sort value for a play by column key
 */
function _sortVal(play, col) {
  if (col === "install") {
    const r =
      typeof getPlayInstallRating === "function"
        ? getPlayInstallRating(play)
        : { stars: 0, maxStars: 0 };
    return r.maxStars > 0 ? r.stars / r.maxStars : -1;
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
  // Sync the sort dropdowns
  _syncSortUI();
  applyCurrentSort();
  renderPlaybook();
}

/**
 * Called by the primary/secondary sort dropdowns
 */
function applyAdvancedSort() {
  const p = document.getElementById("pbSortPrimary");
  const s = document.getElementById("pbSortSecondary");
  currentSortColumn = p ? p.value || null : null;
  secondarySortColumn = s ? s.value || null : null;
  _syncSortUI();
  applyCurrentSort();
  renderPlaybook();
}

/**
 * Toggle sort direction button for primary or secondary
 */
function toggleSortDir(which) {
  if (which === "primary") {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    secondarySortDirection = secondarySortDirection === "asc" ? "desc" : "asc";
  }
  _syncSortUI();
  applyCurrentSort();
  renderPlaybook();
}

/**
 * Sync sort dropdowns, direction buttons, and column header icons
 */
function _syncSortUI() {
  const p = document.getElementById("pbSortPrimary");
  const s = document.getElementById("pbSortSecondary");
  const pd = document.getElementById("pbSortPrimaryDir");
  const sd = document.getElementById("pbSortSecondaryDir");
  if (p) p.value = currentSortColumn || "";
  if (s) s.value = secondarySortColumn || "";
  if (pd) {
    pd.innerHTML = currentSortDirection === "asc" ? "&#9650;" : "&#9660;";
    pd.classList.toggle("desc", currentSortDirection === "desc");
  }
  if (sd) {
    sd.innerHTML = secondarySortDirection === "asc" ? "&#9650;" : "&#9660;";
    sd.classList.toggle("desc", secondarySortDirection === "desc");
  }
  // Column header sort icons
  document.querySelectorAll("#playbookTable .sort-icon").forEach((icon) => {
    icon.classList.remove("asc", "desc");
  });
  if (currentSortColumn) {
    const icon = document.querySelector(
      `#playbookTable .sort-icon[data-col="${currentSortColumn}"]`,
    );
    if (icon) icon.classList.add(currentSortDirection);
  }
}

// ── Chip Filters ──

/**
 * Build the toggle chips for Type and Personnel from loaded plays
 */
function buildFilterChips() {
  _buildChipGroup("pbChipsType", "type", activeTypeChips);
  _buildChipGroup("pbChipsPersonnel", "personnel", activePersonnelChips);
}

function _buildChipGroup(containerId, field, activeSet) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const values = [...new Set(plays.map((p) => p[field]))]
    .filter(Boolean)
    .sort();
  container.innerHTML = values
    .map((v) => {
      const active = activeSet.has(v) ? " active" : "";
      return `<button class="pb-chip${active}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`;
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
  const val = chip.dataset.value;
  const isType = group.id === "pbChipsType";
  const set = isType ? activeTypeChips : activePersonnelChips;
  if (set.has(val)) {
    set.delete(val);
    chip.classList.remove("active");
  } else {
    set.add(val);
    chip.classList.add("active");
  }
  filterPlays();
}

// Attach chip click listeners (called once after DOM ready)
function initChipListeners() {
  document
    .getElementById("pbChipsType")
    ?.addEventListener("click", _onChipClick);
  document
    .getElementById("pbChipsPersonnel")
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
  const types = [...new Set(plays.map((p) => p.type))].filter(Boolean).sort();
  const formations = [...new Set(plays.map((p) => p.formation))]
    .filter(Boolean)
    .sort();
  const basePlays = [...new Set(plays.map((p) => p.basePlay))]
    .filter(Boolean)
    .sort();
  const backs = [...new Set(plays.map((p) => p.back))].filter(Boolean).sort();
  const motions = [...new Set(plays.map((p) => p.motion))]
    .filter(Boolean)
    .sort();
  const protections = [...new Set(plays.map((p) => p.protection))]
    .filter(Boolean)
    .sort();
  const tempos = [...new Set(plays.map((p) => p.tempo))].filter(Boolean).sort();

  // Playbook dropdown filters
  _fillSelect("filterFormation", "All Formations", formations);
  _fillSelect("filterBasePlay", "All Base Plays", basePlays);
  _fillSelect("pbFilterBack", "All Backs", backs);
  _fillSelect("pbFilterMotion", "All Motions", motions);
  _fillSelect("pbFilterProtection", "All Protections", protections);
  _fillSelect("pbFilterTempo", "All Tempos", tempos);

  // Build chip groups
  buildFilterChips();

  // Script builder filters (dropdowns only - checkboxes populated separately)
  const scriptFormFilter = document.getElementById("scriptFilterFormation");
  if (scriptFormFilter) {
    scriptFormFilter.innerHTML =
      '<option value="">All Formations</option>' +
      formations.map((f) => `<option value="${f}">${f}</option>`).join("");
  }
  const scriptBaseFilter = document.getElementById("scriptFilterBasePlay");
  if (scriptBaseFilter) {
    scriptBaseFilter.innerHTML =
      '<option value="">All Base Plays</option>' +
      basePlays.map((b) => `<option value="${b}">${b}</option>`).join("");
  }

  // Populate script checkbox filters
  populateScriptCheckboxFilters();

  // Wristband filters
  const wbTypeFilter = document.getElementById("wbFilterType");
  if (wbTypeFilter) {
    wbTypeFilter.innerHTML =
      '<option value="">All Play Types</option>' +
      types.map((t) => `<option value="${t}">${t}</option>`).join("");
  }

  // Populate wristband highlight dropdown
  populateWristbandHighlightDropdown();
  } catch (err) {
    console.error("populateFilters error:", err);
    showToast("❌ Error loading filters.", 3000);
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
        return `<option value="${idx}">${wb.title} (${totalPlays} plays)</option>`;
      })
      .join("");
}

// Track highlighted wristband plays
let highlightedWristbandPlays = [];

/**
 * Highlight plays that appear on the selected wristband
 */
function highlightWristbandPlays() {
  const select = document.getElementById("playbookWristbandHighlight");
  const wbIdx = select.value;

  if (wbIdx === "") {
    highlightedWristbandPlays = [];
    renderPlaybook();
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved[parseInt(wbIdx, 10)];

  if (!wb || !wb.cards) {
    highlightedWristbandPlays = [];
    renderPlaybook();
    return;
  }

  // Build list of plays on this wristband
  highlightedWristbandPlays = [];
  wb.cards.forEach((card) => {
    card.data.forEach((play) => {
      if (play !== null) {
        highlightedWristbandPlays.push(play);
      }
    });
  });

  renderPlaybook();
}

/**
 * Check if a play is on the highlighted wristband
 */
function isPlayOnHighlightedWristband(play) {
  if (highlightedWristbandPlays.length === 0) return false;

  return highlightedWristbandPlays.some((wbPlay) => playsMatch(play, wbPlay));
}

/**
 * Debounced filter — used for search input to avoid re-rendering on every keystroke
 */
const debouncedFilterPlays = debounce(filterPlays, 150);

/**
 * Filter plays based on all filter layers and render table
 */
function filterPlays() {
  // Chip filters (multi-select)
  const activeTypes = activeTypeChips;
  const activePersonnel = activePersonnelChips;

  // Dropdown filters
  const formation = document.getElementById("filterFormation")?.value || "";
  const basePlay = document.getElementById("filterBasePlay")?.value || "";
  const back = document.getElementById("pbFilterBack")?.value || "";
  const motion = document.getElementById("pbFilterMotion")?.value || "";
  const protection = document.getElementById("pbFilterProtection")?.value || "";
  const tempo = document.getElementById("pbFilterTempo")?.value || "";
  const search =
    document.getElementById("searchPlay")?.value?.toLowerCase() || "";

  filteredPlays = plays.filter((p) => {
    // Type chips (OR within layer)
    if (activeTypes.size > 0 && !activeTypes.has(p.type)) return false;
    // Personnel chips (OR within layer)
    if (activePersonnel.size > 0 && !activePersonnel.has(p.personnel))
      return false;
    // Dropdown layers (AND between layers)
    if (formation && p.formation !== formation) return false;
    if (basePlay && p.basePlay !== basePlay) return false;
    if (back && p.back !== back) return false;
    if (motion && p.motion !== motion) return false;
    if (protection && p.protection !== protection) return false;
    if (tempo && p.tempo !== tempo) return false;
    // Text search
    if (search) {
      const searchFields = [
        p.play,
        p.formation,
        p.protection,
        p.motion,
        p.shift,
        p.back,
        p.basePlay,
        p.personnel,
        p.type,
        p.tempo,
      ]
        .join(" ")
        .toLowerCase();
      if (!searchFields.includes(search)) return false;
    }
    return true;
  });

  applyCurrentSort();
  renderPlaybook();
  updateActiveFilterBar();
}

/**
 * Clear all playbook filters
 */
function clearFilters() {
  // Clear chips
  activeTypeChips.clear();
  activePersonnelChips.clear();
  document
    .querySelectorAll(".pb-chip.active")
    .forEach((c) => c.classList.remove("active"));

  // Clear dropdowns
  const ids = [
    "filterFormation",
    "filterBasePlay",
    "pbFilterBack",
    "pbFilterMotion",
    "pbFilterProtection",
    "pbFilterTempo",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  // Clear search
  const search = document.getElementById("searchPlay");
  if (search) search.value = "";

  // Reset sort
  currentSortColumn = null;
  currentSortDirection = "asc";
  secondarySortColumn = null;
  secondarySortDirection = "asc";
  selectedRowIndex = -1;
  _syncSortUI();

  // Clear saved state
  storageManager.remove(STORAGE_KEYS.PLAYBOOK_STATE);

  filteredPlays = [...plays];
  renderPlaybook();
  updateActiveFilterBar();
}

/**
 * Update the active-filter pill bar
 */
function updateActiveFilterBar() {
  const bar = document.getElementById("pbActiveBar");
  const pills = document.getElementById("pbActivePills");
  const clearBtn = document.getElementById("pbClearAll");
  if (!bar || !pills) return;

  const parts = [];

  // Type chips
  activeTypeChips.forEach((v) => {
    parts.push({ label: v, layer: "type", value: v });
  });
  // Personnel chips
  activePersonnelChips.forEach((v) => {
    parts.push({ label: `Personnel: ${v}`, layer: "personnel", value: v });
  });
  // Dropdown values
  const dropdowns = [
    { id: "filterFormation", prefix: "Formation" },
    { id: "filterBasePlay", prefix: "Base Play" },
    { id: "pbFilterBack", prefix: "Back" },
    { id: "pbFilterMotion", prefix: "Motion" },
    { id: "pbFilterProtection", prefix: "Protection" },
    { id: "pbFilterTempo", prefix: "Tempo" },
  ];
  dropdowns.forEach(({ id, prefix }) => {
    const val = document.getElementById(id)?.value;
    if (val) parts.push({ label: `${prefix}: ${val}`, layer: id, value: val });
  });
  // Search
  const search = document.getElementById("searchPlay")?.value;
  if (search)
    parts.push({ label: `"${search}"`, layer: "search", value: search });

  if (parts.length === 0) {
    if (clearBtn) clearBtn.style.display = "none";
    pills.innerHTML = "";
    return;
  }

  if (clearBtn) clearBtn.style.display = "";
  pills.innerHTML = parts
    .map(
      (p) =>
        `<span class="pb-pill" data-layer="${p.layer}" data-value="${escapeHtml(p.value)}">${escapeHtml(p.label)} <button onclick="removeFilter('${p.layer}','${escapeHtml(p.value)}')">&times;</button></span>`,
    )
    .join("");
}

/**
 * Remove a single filter by layer+value
 */
function removeFilter(layer, value) {
  if (layer === "type") {
    activeTypeChips.delete(value);
    const chip = document.querySelector(
      `#pbChipsType .pb-chip[data-value="${value}"]`,
    );
    if (chip) chip.classList.remove("active");
  } else if (layer === "personnel") {
    activePersonnelChips.delete(value);
    const chip = document.querySelector(
      `#pbChipsPersonnel .pb-chip[data-value="${value}"]`,
    );
    if (chip) chip.classList.remove("active");
  } else if (layer === "search") {
    const el = document.getElementById("searchPlay");
    if (el) el.value = "";
  } else {
    // Dropdown filter
    const el = document.getElementById(layer);
    if (el) el.value = "";
  }
  filterPlays();
}

/**
 * Render the playbook table with filtered plays
 */
function renderPlaybook() {
  try {
  const tbody = document.querySelector("#playbookTable tbody");
  const searchTerm =
    document.getElementById("searchPlay")?.value?.toLowerCase() || "";

  tbody.innerHTML = filteredPlays
    .map((p, idx) => {
      const onWristband = isPlayOnHighlightedWristband(p);
      const wbClass = onWristband ? " on-wristband" : "";
      const wbIndicator = onWristband
        ? '<span class="wb-indicator" title="On wristband">🏈</span>'
        : "";
      const installBadge =
        typeof getPlayStarBadge === "function" ? getPlayStarBadge(p) : "";

      return `
            <tr class="${wbClass}" onclick="selectPlaybookRow(${idx})" ondblclick="addPlayFromPlaybook(${idx})" 
                onmouseenter="showPlayPreview(event, ${idx})" onmouseleave="hidePlayPreview()"
                title="Click to select, double-click to add to script">
                <td class="col-install">${installBadge}</td>
                <td class="col-type">${wbIndicator}${highlightSearch(p.type, searchTerm)}</td>
                <td class="col-formation">${highlightSearch(p.formation, searchTerm)}</td>
                <td class="col-tags">${escapeHtml([p.formTag1, p.formTag2].filter(Boolean).join(", ") || "-")}</td>
                <td class="col-back">${highlightSearch(p.back || "-", searchTerm)}</td>
                <td class="col-motion">${highlightSearch(p.motion || "-", searchTerm)}</td>
                <td class="col-protection">${highlightSearch(p.protection || "-", searchTerm)}</td>
                <td class="col-play play-cell" onclick="event.stopPropagation(); copyPlayName(this.dataset.play)" data-play="${escapeHtml(p.play)}"><strong>${highlightSearch(p.play, searchTerm)}</strong> ${escapeHtml([p.playTag1, p.playTag2].filter(Boolean).join(" "))}</td>
                <td class="col-basePlay">${escapeHtml(p.basePlay || "-")}</td>
                <td class="col-tempo">${escapeHtml(p.tempo || "-")}</td>
            </tr>
        `;
    })
    .join("");

  // Update play count
  const countEl = document.getElementById("playCount");
  if (countEl) {
    countEl.textContent = `Showing ${filteredPlays.length} of ${plays.length} plays`;
  }

  // Update stats bar
  updateStatsBar();

  // Re-apply selection if valid
  if (selectedRowIndex >= 0 && selectedRowIndex < filteredPlays.length) {
    const rows = tbody.querySelectorAll("tr");
    if (rows[selectedRowIndex]) {
      rows[selectedRowIndex].classList.add("selected");
    }
  }

  // Re-apply column visibility
  applyColumnVisibility();

  // Save state
  savePlaybookState();
  } catch (err) {
    console.error("renderPlaybook error:", err);
    showToast("❌ Error rendering playbook.", 3000);
  }
}

// escapeHtml is now defined in utils.js

/**
 * Select a row in the playbook table
 */
function selectPlaybookRow(index) {
  const tbody = document.querySelector("#playbookTable tbody");
  const rows = tbody.querySelectorAll("tr");

  // Remove previous selection
  rows.forEach((r) => r.classList.remove("selected"));

  // Add new selection
  if (rows[index]) {
    rows[index].classList.add("selected");
    selectedRowIndex = index;
  }
}

/**
 * Copy play name to clipboard
 */
function copyPlayName(playName) {
  navigator.clipboard.writeText(playName).then(() => {
    showToast(`Copied: ${playName}`);
  });
}

/**
 * Add play from playbook to practice script (double-click)
 */
function addPlayFromPlaybook(index) {
  const play = filteredPlays[index];
  if (!play) return;

  // Find the original index in plays array
  const originalIndex = plays.findIndex(
    (p) => p.play === play.play && p.formation === play.formation,
  );

  if (originalIndex >= 0) {
    addToScript(originalIndex);
    showToast(`Added "${play.play}" to script`);
  }
}

/* showToast() moved to utils.js */

/**
 * Save playbook filter/sort state to localStorage
 */
function savePlaybookState() {
  const state = {
    activeTypes: [...activeTypeChips],
    activePersonnel: [...activePersonnelChips],
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

/**
 * Restore playbook filter/sort state from localStorage
 */
function restorePlaybookState() {
  try {
  const state = storageManager.get(STORAGE_KEYS.PLAYBOOK_STATE, null);
  if (!state) return;

  // Restore chip filters
  if (state.activeTypes) {
    activeTypeChips = new Set(state.activeTypes);
  }
  if (state.activePersonnel) {
    activePersonnelChips = new Set(state.activePersonnel);
  }

  // Restore dropdowns
  if (state.filterFormation) _setVal("filterFormation", state.filterFormation);
  if (state.filterBasePlay) _setVal("filterBasePlay", state.filterBasePlay);
  if (state.filterBack) _setVal("pbFilterBack", state.filterBack);
  if (state.filterMotion) _setVal("pbFilterMotion", state.filterMotion);
  if (state.filterProtection)
    _setVal("pbFilterProtection", state.filterProtection);
  if (state.filterTempo) _setVal("pbFilterTempo", state.filterTempo);
  if (state.searchPlay) _setVal("searchPlay", state.searchPlay);

  // Restore sort
  if (state.sortColumn) {
    currentSortColumn = state.sortColumn;
    currentSortDirection = state.sortDirection || "asc";
  }
  if (state.secondarySortColumn) {
    secondarySortColumn = state.secondarySortColumn;
    secondarySortDirection = state.secondarySortDirection || "asc";
  }

  // Restore more-filters collapsed state
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
    showToast("❌ Error restoring playbook state.", 3000);
  }
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

/**
 * Initialize keyboard navigation for playbook
 */
/**
 * Named document-level keydown handler (extractable for remove-before-add)
 */
function _playbookDocKeydown(e) {
  // ? to show shortcuts (Shift + /)
  if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
    const activeEl = document.activeElement;
    if (activeEl.tagName !== "INPUT" && activeEl.tagName !== "TEXTAREA") {
      e.preventDefault();
      showKeyboardShortcuts();
    }
  }
  // Escape to close modals
  if (e.key === "Escape") {
    hideKeyboardShortcuts();
    hideColumnMenu();
  }
}

function initPlaybookKeyboard() {
  const container = document.getElementById("playbookContainer");
  if (!container) return;

  // Guard: only attach container listener once
  if (!container._kbInit) {
    container.addEventListener("keydown", (e) => {
      const rows = document.querySelectorAll("#playbookTable tbody tr");
      if (rows.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          selectedRowIndex = Math.min(selectedRowIndex + 1, rows.length - 1);
          selectPlaybookRow(selectedRowIndex);
          rows[selectedRowIndex]?.scrollIntoView({ block: "nearest" });
          break;
        case "ArrowUp":
          e.preventDefault();
          selectedRowIndex = Math.max(selectedRowIndex - 1, 0);
          selectPlaybookRow(selectedRowIndex);
          rows[selectedRowIndex]?.scrollIntoView({ block: "nearest" });
          break;
        case "Enter":
          e.preventDefault();
          if (selectedRowIndex >= 0) {
            addPlayFromPlaybook(selectedRowIndex);
          }
          break;
        case "c":
          if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl+C to copy selected play
            if (selectedRowIndex >= 0 && filteredPlays[selectedRowIndex]) {
              e.preventDefault();
              copyPlayName(filteredPlays[selectedRowIndex].play);
            }
          }
          break;
      }
    });
    container._kbInit = true;
  }

  // Remove-before-add to prevent duplicate document listeners
  document.removeEventListener("keydown", _playbookDocKeydown);
  document.addEventListener("keydown", _playbookDocKeydown);
}

/**
 * Highlight search term in text
 */
function highlightSearch(text, searchTerm) {
  if (!searchTerm || !text || text === "-") return escapeHtml(text);
  const safeText = escapeHtml(String(text));
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const safeEscaped = escapeHtml(escaped);
  const regex = new RegExp(`(${safeEscaped})`, "gi");
  return safeText.replace(regex, '<span class="search-highlight">$1</span>');
}

/**
 * Update the stats bar with play type counts
 */
function updateStatsBar() {
  const statsBar = document.getElementById("statsBar");
  if (!statsBar) return;

  // Count by type
  const typeCounts = {};
  plays.forEach((p) => {
    const type = p.type || "Unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  // Sort by count descending
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  statsBar.innerHTML = sorted
    .map(
      ([type, count]) =>
        `<div class="stat-item"><span class="stat-count">${count}</span> ${type}</div>`,
    )
    .join("");
}

/**
 * Column visibility state
 */
const columnVisibility = {
  install: true,
  type: true,
  formation: true,
  tags: true,
  back: true,
  motion: true,
  protection: true,
  play: true,
  basePlay: true,
  tempo: true,
};

/**
 * Toggle column visibility
 */
function toggleColumn(column) {
  columnVisibility[column] = !columnVisibility[column];
  applyColumnVisibility();
  storageManager.set(STORAGE_KEYS.COLUMN_VISIBILITY, columnVisibility);
}

/**
 * Apply column visibility to table
 */
function applyColumnVisibility() {
  const columns = [
    "install",
    "type",
    "formation",
    "tags",
    "back",
    "motion",
    "protection",
    "play",
    "basePlay",
    "tempo",
  ];
  columns.forEach((col, idx) => {
    const isVisible = columnVisibility[col];
    // Header
    const th = document.querySelector(
      `#playbookTable thead th:nth-child(${idx + 1})`,
    );
    if (th) th.classList.toggle("hidden", !isVisible);
    // Body cells
    document
      .querySelectorAll(`#playbookTable tbody td:nth-child(${idx + 1})`)
      .forEach((td) => {
        td.classList.toggle("hidden", !isVisible);
      });
  });
}

/**
 * Restore column visibility from localStorage
 */
function restoreColumnVisibility() {
  try {
  const savedVis = storageManager.get(STORAGE_KEYS.COLUMN_VISIBILITY, null);
  if (savedVis) {
    Object.assign(columnVisibility, savedVis);
    // Update checkboxes
    const menu = document.getElementById("columnMenu");
    if (menu) {
      const columns = [
        "install",
        "type",
        "formation",
        "tags",
        "back",
        "motion",
        "protection",
        "play",
        "basePlay",
        "tempo",
      ];
      const checkboxes = menu.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((cb, idx) => {
        cb.checked = columnVisibility[columns[idx]];
      });
    }
  }
  } catch (err) {
    console.error("restoreColumnVisibility error:", err);
  }
}

/**
 * Toggle column menu visibility
 */
function toggleColumnMenu() {
  const menu = document.getElementById("columnMenu");
  menu.classList.toggle("show");
}

/**
 * Hide column menu
 */
function hideColumnMenu() {
  const menu = document.getElementById("columnMenu");
  if (menu) menu.classList.remove("show");
}

/**
 * Show keyboard shortcuts modal
 */
function showKeyboardShortcuts() {
  document.getElementById("shortcutsModal").classList.add("show");
}

/**
 * Hide keyboard shortcuts modal
 */
function hideKeyboardShortcuts() {
  const modal = document.getElementById("shortcutsModal");
  if (modal) modal.classList.remove("show");
}

/**
 * Show play preview tooltip on hover
 */
let previewTimeout = null;

function showPlayPreview(event, index) {
  // Clear any pending timeout
  if (previewTimeout) {
    clearTimeout(previewTimeout);
  }

  // Small delay to prevent flickering
  previewTimeout = setTimeout(() => {
    const play = filteredPlays[index];
    if (!play) return;

    const tooltip = document.getElementById("playPreviewTooltip");
    if (!tooltip) return;

    tooltip.innerHTML = `
      <div class="preview-title">${escapeHtml(play.play)}</div>
      <div class="preview-row"><span class="preview-label">Formation:</span> ${escapeHtml(play.formation || "-")}</div>
      <div class="preview-row"><span class="preview-label">Type:</span> ${escapeHtml(play.type || "-")}</div>
      <div class="preview-row"><span class="preview-label">Protection:</span> ${escapeHtml(play.protection || "-")}</div>
      <div class="preview-row"><span class="preview-label">Motion:</span> ${escapeHtml(play.motion || "-")}</div>
      <div class="preview-row"><span class="preview-label">Shift:</span> ${escapeHtml(play.shift || "-")}</div>
      <div class="preview-row"><span class="preview-label">Back:</span> ${escapeHtml(play.back || "-")}</div>
      <div class="preview-row"><span class="preview-label">Base Play:</span> ${escapeHtml(play.basePlay || "-")}</div>
      <div class="preview-row"><span class="preview-label">Tempo:</span> ${escapeHtml(play.tempo || "-")}</div>
      ${play.formTag1 || play.formTag2 ? `<div class="preview-row"><span class="preview-label">Form Tags:</span> ${escapeHtml([play.formTag1, play.formTag2].filter(Boolean).join(", "))}</div>` : ""}
      ${play.playTag1 || play.playTag2 ? `<div class="preview-row"><span class="preview-label">Play Tags:</span> ${escapeHtml([play.playTag1, play.playTag2].filter(Boolean).join(", "))}</div>` : ""}
      ${typeof getPlayInstallTooltip === "function" ? getPlayInstallTooltip(play) : ""}
    `;

    // Position tooltip near the mouse
    let left = event.clientX + 15;
    let top = event.clientY + 10;

    // Show it first to get dimensions
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.add("show");

    // Adjust if off screen
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth - 10) {
      left = event.clientX - tooltipRect.width - 15;
      tooltip.style.left = `${left}px`;
    }
    if (tooltipRect.bottom > window.innerHeight - 10) {
      top = window.innerHeight - tooltipRect.height - 10;
      tooltip.style.top = `${top}px`;
    }
  }, 200);
}

/**
 * Hide play preview tooltip
 */
function hidePlayPreview() {
  // Clear pending timeout
  if (previewTimeout) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
  const tooltip = document.getElementById("playPreviewTooltip");
  if (tooltip) tooltip.classList.remove("show");
}

// ═══════════════════════════════════════════════════════
//  Play Collections — save/load/send filtered plays
// ═══════════════════════════════════════════════════════

/**
 * Save the current filtered plays as a named collection
 */
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

  // Capture current filter state so we can restore it later
  const filterState = _captureFilterState();

  // Store play keys (formation + play name) for matching — not full objects
  // This way they stay in sync if the playbook CSV is re-uploaded
  const playKeys = filteredPlays.map((p) => ({
    formation: p.formation || "",
    play: p.play || "",
    type: p.type || "",
    personnel: p.personnel || "",
  }));

  collections.push({
    name: name.trim(),
    playKeys: playKeys,
    filterState: filterState,
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
    showToast("❌ Error saving collection.", 4000);
  }
}

/**
 * Capture the current filter state for persistence
 */
function _captureFilterState() {
  return {
    activeTypes: [...activeTypeChips],
    activePersonnel: [...activePersonnelChips],
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

/**
 * Load a collection — restore its filters to get the same play set
 */
function loadCollection(index) {
  const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
  const coll = collections[index];
  if (!coll) return;

  // If it has a saved filter state, restore those filters
  if (coll.filterState) {
    const s = coll.filterState;
    activeTypeChips = new Set(s.activeTypes || []);
    activePersonnelChips = new Set(s.activePersonnel || []);
    // Rebuild chips with new active state
    buildFilterChips();

    _setVal("filterFormation", s.filterFormation || "");
    _setVal("filterBasePlay", s.filterBasePlay || "");
    _setVal("pbFilterBack", s.filterBack || "");
    _setVal("pbFilterMotion", s.filterMotion || "");
    _setVal("pbFilterProtection", s.filterProtection || "");
    _setVal("pbFilterTempo", s.filterTempo || "");
    _setVal("searchPlay", s.searchPlay || "");

    // Open more filters if any dropdown is active
    if (
      s.filterFormation ||
      s.filterBasePlay ||
      s.filterBack ||
      s.filterMotion ||
      s.filterProtection ||
      s.filterTempo
    ) {
      moreFiltersOpen = true;
      const panel = document.getElementById("pbMoreFilters");
      const arrow = document.getElementById("pbMoreArrow");
      if (panel) panel.classList.add("open");
      if (arrow) arrow.classList.add("open");
    }

    filterPlays();
  } else {
    // Legacy: match by play keys
    _loadCollectionByKeys(coll);
  }

  showToast(`Loaded "${coll.name}" (${coll.count} plays)`);
}

/**
 * Fallback: filter to plays matching stored keys
 */
function _loadCollectionByKeys(coll) {
  // Clear existing filters
  activeTypeChips.clear();
  activePersonnelChips.clear();
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

  filteredPlays = plays.filter((p) =>
    coll.playKeys.some((k) => k.formation === p.formation && k.play === p.play),
  );
  applyCurrentSort();
  renderPlaybook();
  updateActiveFilterBar();
}

/**
 * Delete a collection
 */
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

/**
 * Send a collection's plays directly to the script
 */
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

/**
 * Send a collection's plays to the call sheet
 */
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

/**
 * Resolve a collection's playKeys to actual play objects from the current playbook
 */
function _resolveCollectionPlays(coll) {
  return plays.filter((p) =>
    coll.playKeys.some((k) => k.formation === p.formation && k.play === p.play),
  );
}

// ── Send-to actions for current filtered plays ──

/**
 * Send currently filtered plays to the practice script
 */
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

/**
 * Send currently filtered plays to the call sheet (auto-place by preferred fields)
 */
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

/**
 * Internal: add an array of play objects to the practice script
 */
function _addPlaysToScript(playList) {
  if (typeof saveScriptState === "function") saveScriptState();
  if (typeof ensureFirstPeriod === "function") ensureFirstPeriod();
  playList.forEach((play) => {
    // Resolve to global plays index
    const idx = plays.findIndex(
      (p) => p.play === play.play && p.formation === play.formation,
    );
    if (idx >= 0) {
      script.push({
        ...plays[idx],
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

/**
 * Internal: auto-place plays onto the call sheet using preferred fields
 * Returns total number of entries placed
 */
function _addPlaysToCallSheet(playList) {
  if (typeof findMatchingCategories !== "function") return 0;

  // Build existing keys per category for dedup
  const existing = {};
  const playKey = (p) =>
    `${(p.formation || "").toLowerCase()}|${(p.play || "").toLowerCase()}|${(p.personnel || "").toLowerCase()}`;

  if (typeof CALLSHEET_CATEGORIES !== "undefined") {
    CALLSHEET_CATEGORIES.forEach((cat) => {
      if (!callSheet[cat.id]) callSheet[cat.id] = { left: [], right: [] };
      existing[cat.id] = new Set();
      callSheet[cat.id].left.forEach((p) => existing[cat.id].add(playKey(p)));
      callSheet[cat.id].right.forEach((p) => existing[cat.id].add(playKey(p)));
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
      if (existing[catId].has(key)) return; // dedup
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

  if (typeof renderCallSheet === "function") renderCallSheet();
  if (typeof saveCallSheet === "function") saveCallSheet();
  return totalPlaced;
}

// ── Collections Panel UI ──

/**
 * Toggle the collections panel open/closed
 */
function toggleCollectionsPanel() {
  const panel = document.getElementById("pbCollectionsPanel");
  if (!panel) return;
  const isOpen = panel.classList.toggle("open");
  if (isOpen) renderCollectionsPanel();
}

/**
 * Update the badge count on the Collections button
 */
function updateCollectionsBadge() {
  const badge = document.getElementById("pbCollectionCount");
  if (!badge) return;
  const collections = storageManager.get(STORAGE_KEYS.PLAY_COLLECTIONS, []);
  badge.textContent = collections.length;
}

/**
 * Render the list of saved collections
 */
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
      const date = coll.created
        ? new Date(coll.created).toLocaleDateString()
        : "";
      return `
        <div class="pb-coll-card">
          <div class="pb-coll-info">
            <div class="pb-coll-name">${escapeHtml(coll.name)}</div>
            <div class="pb-coll-meta">${coll.count} plays${date ? " &middot; " + date : ""}</div>
          </div>
          <div class="pb-coll-actions">
            <button class="pb-coll-btn" onclick="loadCollection(${idx})" title="Load filters">Load</button>
            <button class="pb-coll-btn" onclick="sendCollectionToScript(${idx})" title="Send to script">&#128203; Script</button>
            <button class="pb-coll-btn" onclick="sendCollectionToCallSheet(${idx})" title="Send to call sheet">&#128202; Sheet</button>
            <button class="pb-coll-btn danger" onclick="deleteCollection(${idx})" title="Delete">&times;</button>
          </div>
        </div>`;
    })
    .join("");
}

/**
 * Initialize collections badge on load
 */
function initCollections() {
  updateCollectionsBadge();
}

// ============ Print Sort ============

const PB_PRINT_SORT_FIELDS = [
  { value: "personnel", label: "Personnel" },
  { value: "type", label: "Play Type" },
  { value: "tempo", label: "Tempo" },
  { value: "formation", label: "Formation" },
  { value: "basePlay", label: "Base Play" },
  { value: "play", label: "Play Name" },
  { value: "back", label: "Back" },
  { value: "protection", label: "Protection" },
  { value: "motion", label: "Motion" },
];

let pbPrintSortCriteria = [{ field: "formation", direction: "asc" }];
let _pbSortDragged = null;

function renderPbPrintSort() {
  const container = document.getElementById("pbPrintSortList");
  if (!container) return;

  container.innerHTML = pbPrintSortCriteria
    .map((c, idx) => {
      const fieldOpts = PB_PRINT_SORT_FIELDS.map(
        (f) =>
          `<option value="${f.value}" ${c.field === f.value ? "selected" : ""}>${f.label}</option>`,
      ).join("");

      const dirIcon = c.direction === "asc" ? "↑" : "↓";
      const dirTitle =
        c.direction === "asc" ? "Ascending (A→Z)" : "Descending (Z→A)";

      const hasCustom =
        wbCustomSortOrders[c.field] && wbCustomSortOrders[c.field].length > 0;
      const customIcon = hasCustom ? "🎨" : "⚙️";
      const customTitle = hasCustom
        ? "Custom order set - click to edit"
        : "Set custom value order";

      return `
      <div class="sort-criteria-item" draggable="true" data-idx="${idx}"
           ondragstart="_pbSortDragStart(event, ${idx})"
           ondragover="_pbSortDragOver(event)"
           ondrop="_pbSortDrop(event, ${idx})"
           ondragend="_pbSortDragEnd(event)">
        <span class="drag-handle">☰</span>
        <select onchange="_pbSortUpdateField(${idx}, this.value)">${fieldOpts}</select>
        <button class="sort-dir-btn" onclick="_pbSortToggleDir(${idx})" title="${dirTitle}">${dirIcon}</button>
        <button class="custom-order-btn" onclick="openCustomOrderModal('${c.field}')" title="${customTitle}" style="font-size:11px;padding:2px 6px;">${customIcon}</button>
        <button class="remove-sort-btn" onclick="_pbSortRemove(${idx})">✕</button>
      </div>`;
    })
    .join("");
}

function addPbPrintSortField() {
  const used = pbPrintSortCriteria.map((c) => c.field);
  const next = PB_PRINT_SORT_FIELDS.find((f) => !used.includes(f.value));
  if (next) {
    pbPrintSortCriteria.push({ field: next.value, direction: "asc" });
    renderPbPrintSort();
  } else {
    showToast("All sort fields are already in use");
  }
}

function _pbSortRemove(idx) {
  if (pbPrintSortCriteria.length <= 1) {
    showToast("Need at least one sort field");
    return;
  }
  pbPrintSortCriteria.splice(idx, 1);
  renderPbPrintSort();
}

function _pbSortUpdateField(idx, val) {
  pbPrintSortCriteria[idx].field = val;
  renderPbPrintSort();
}

function _pbSortToggleDir(idx) {
  pbPrintSortCriteria[idx].direction =
    pbPrintSortCriteria[idx].direction === "asc" ? "desc" : "asc";
  renderPbPrintSort();
}

function _pbSortDragStart(e, idx) {
  _pbSortDragged = idx;
  e.target.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}
function _pbSortDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}
function _pbSortDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  if (_pbSortDragged === null || _pbSortDragged === targetIdx) return;
  const [moved] = pbPrintSortCriteria.splice(_pbSortDragged, 1);
  pbPrintSortCriteria.splice(targetIdx, 0, moved);
  _pbSortDragged = null;
  renderPbPrintSort();
}
function _pbSortDragEnd(e) {
  e.target.classList.remove("dragging");
  _pbSortDragged = null;
  document
    .querySelectorAll("#pbPrintSortList .drag-over")
    .forEach((el) => el.classList.remove("drag-over"));
}

/**
 * Sort an array of plays using the print sort criteria.
 * Returns a new sorted array (does not mutate input).
 */
function _applyPbPrintSort(playsArr) {
  if (!pbPrintSortCriteria.length) return playsArr;
  return [...playsArr].sort((a, b) => {
    for (const c of pbPrintSortCriteria) {
      const valA = String(a[c.field] || "").trim();
      const valB = String(b[c.field] || "").trim();
      const cmp = compareWithCustomOrder(valA, valB, c.field, c.direction);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

// ============ Print Filtered Plays ============

/**
 * Toggle the print options panel visibility
 */
function togglePrintOptionsPanel() {
  const panel = document.getElementById("pbPrintPanel");
  if (!panel) return;
  const wasOpen = panel.classList.contains("open");
  panel.classList.toggle("open");
  if (!wasOpen) renderPbPrintSort();
}

/**
 * Read the playbook-specific print formatting checkboxes
 */
function _getPbPrintOptions() {
  return {
    showEmoji: document.getElementById("pbShowEmoji")?.checked || false,
    useSquares: document.getElementById("pbUseSquares")?.checked || false,
    underEmoji: document.getElementById("pbUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("pbBoldShifts")?.checked || false,
    redShifts: document.getElementById("pbRedShifts")?.checked || false,
    italicMotions: document.getElementById("pbItalicMotions")?.checked || false,
    redMotions: document.getElementById("pbRedMotions")?.checked || false,
    noVowels: document.getElementById("pbRemoveVowels")?.checked || false,
    showLineCall: document.getElementById("pbShowLineCall")?.checked || false,
    highlightHuddle:
      document.getElementById("pbHighlightHuddle")?.checked || false,
    highlightCandy:
      document.getElementById("pbHighlightCandy")?.checked || false,
  };
}

/**
 * Copy current wristband display-option checkboxes into the playbook print checkboxes
 */
function syncFromWristbandOptions() {
  const mappings = [
    ["wbShowEmoji", "pbShowEmoji"],
    ["wbUseSquares", "pbUseSquares"],
    ["wbUnderEmoji", "pbUnderEmoji"],
    ["wbBoldShifts", "pbBoldShifts"],
    ["wbRedShifts", "pbRedShifts"],
    ["wbItalicMotions", "pbItalicMotions"],
    ["wbRedMotions", "pbRedMotions"],
    ["wbRemoveVowels", "pbRemoveVowels"],
    ["wbShowLineCall", "pbShowLineCall"],
    ["wbHighlightHuddle", "pbHighlightHuddle"],
    ["wbHighlightCandy", "pbHighlightCandy"],
  ];
  mappings.forEach(([src, dst]) => {
    const srcEl = document.getElementById(src);
    const dstEl = document.getElementById(dst);
    if (srcEl && dstEl) dstEl.checked = srcEl.checked;
  });
  showToast("Synced formatting options from Wristband tab");
}

/**
 * Check or uncheck all playbook print option checkboxes
 */
function toggleAllPbPrintOptions(state) {
  const ids = [
    "pbShowEmoji",
    "pbUseSquares",
    "pbUnderEmoji",
    "pbBoldShifts",
    "pbRedShifts",
    "pbItalicMotions",
    "pbRedMotions",
    "pbRemoveVowels",
    "pbShowLineCall",
    "pbHighlightHuddle",
    "pbHighlightCandy",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = state;
  });
}

/**
 * Print the currently filtered plays in wristband-card grid format
 */
function printFilteredPlays() {
  if (!filteredPlays || filteredPlays.length === 0) {
    showToast("No plays to print — adjust your filters first.");
    return;
  }

  const opts = _getPbPrintOptions();
  const { highlightHuddle, highlightCandy } = opts;
  const container = document.getElementById("playbookPrintCards");

  // Sort a copy of filteredPlays using the print sort criteria
  const sortedPlays = _applyPbPrintSort(filteredPlays);

  let html = '<ol class="pb-print-list">';

  sortedPlays.forEach((play) => {
    const isHuddle =
      highlightHuddle && play.tempo && play.tempo.toLowerCase() === "huddle";
    const isCandy =
      highlightCandy && play.tempo && play.tempo.toLowerCase() === "candy";
    const bgStyle = isHuddle
      ? ` style="background:${UI_COLORS.highlightHuddle};"`
      : isCandy
        ? ` style="background:${UI_COLORS.highlightCandy};"`
        : "";

    html += `<li${bgStyle}>${getFullCall(play, opts)}</li>`;
  });

  html += "</ol>";
  container.innerHTML = html;

  // Show print container + set print mode
  document.getElementById("playbookPrint").classList.remove("hidden");
  document.body.dataset.printMode = "playbook";

  // Inject dynamic page-size style
  let printStyle = document.getElementById("playbookPrintStyle");
  if (!printStyle) {
    printStyle = document.createElement("style");
    printStyle.id = "playbookPrintStyle";
    document.head.appendChild(printStyle);
  }
  printStyle.textContent =
    "@media print { @page { size: letter portrait; margin: 0.4in 0.5in; } }";

  setTimeout(() => {
    const restoreTitle = setPrintTitle("Playbook");
    window.print();
    setTimeout(() => {
      restoreTitle();
      document.getElementById("playbookPrint").classList.add("hidden");
      delete document.body.dataset.printMode;
    }, 500);
  }, 100);
}
