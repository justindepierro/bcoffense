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

// ── Pagination state ──
const PLAYS_PER_PAGE = 50;
let currentPage = 0;

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
  savePlaybookState();
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
  savePlaybookState();
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
  savePlaybookState();
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
  // Column header sort icons + aria-sort
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
    const tempos = [...new Set(plays.map((p) => p.tempo))]
      .filter(Boolean)
      .sort();

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
        formations
          .map(
            (f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`,
          )
          .join("");
    }
    const scriptBaseFilter = document.getElementById("scriptFilterBasePlay");
    if (scriptBaseFilter) {
      scriptBaseFilter.innerHTML =
        '<option value="">All Base Plays</option>' +
        basePlays
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
        types
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
const _debouncedFilterPlays = debounce(filterPlays, 150);

function debouncedFilterPlays() {
  _debouncedFilterPlays();
}

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

  // Game plan filter
  const gamePlanOnly =
    document.getElementById("pbGamePlanFilter")?.checked || false;
  const gw = getGameWeek();
  _updateGamePlanFilterBar();

  filteredPlays = plays.filter((p) => {
    // Game plan filter
    if (gamePlanOnly && gw.opponentName) {
      if (!isPlayTaggedForOpponent(p, gw.opponentName)) return false;
    }
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
  savePlaybookState();
  updateActiveFilterBar();
  // Toggle search clear button
  const clearBtn = document.getElementById("clearPbSearch");
  if (clearBtn) clearBtn.style.display = search ? "flex" : "none";
}

/**
 * Update the game plan filter bar visibility + opponent name
 */
function _updateGamePlanFilterBar() {
  const bar = document.getElementById("pbGamePlanBar");
  const oppLabel = document.getElementById("pbGamePlanOpp");
  const gw = getGameWeek();
  if (bar) {
    bar.style.display = gw.opponentName ? "" : "none";
  }
  if (oppLabel) {
    oppLabel.textContent = gw.opponentName ? `vs ${gw.opponentName}` : "";
  }
}

/**
 * Clear all playbook filters
 */
function clearFilters() {
  activeTypeChips.clear();
  activePersonnelChips.clear();
  document
    .querySelectorAll(".pb-chip.active")
    .forEach((c) => c.classList.remove("active"));

  // Clear game plan filter
  const gpFilter = document.getElementById("pbGamePlanFilter");
  if (gpFilter) gpFilter.checked = false;

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
  const clearBtn = document.getElementById("clearPbSearch");
  if (clearBtn) clearBtn.style.display = "none";

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

/** Alias used by the playbook empty-state "Clear All Filters" button */
function clearAllFilters() {
  clearFilters();
}

/** Clear the playbook search input */
function clearPbSearch() {
  const input = document.getElementById("searchPlay");
  if (input) input.value = "";
  const clearBtn = document.getElementById("clearPbSearch");
  if (clearBtn) clearBtn.style.display = "none";
  filterPlays();
}

function initPlaybookSearch() {
  const input = document.getElementById("searchPlay");
  if (!input || input.dataset.searchBound === "true") return;

  input.addEventListener("input", () => {
    debouncedFilterPlays();
  });

  input.dataset.searchBound = "true";
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
        `<span class="pb-pill" data-layer="${p.layer}" data-value="${escapeHtml(p.value)}">${escapeHtml(p.label)} <button data-action="removeFilter" data-layer="${p.layer}" data-filter-value="${escapeHtml(p.value)}">&times;</button></span>`,
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

    // ── Pagination ──
    const totalFiltered = filteredPlays.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / PLAYS_PER_PAGE));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    const start = currentPage * PLAYS_PER_PAGE;
    const pageSlice = filteredPlays.slice(start, start + PLAYS_PER_PAGE);

    tbody.innerHTML = pageSlice
      .map((p, localIdx) => {
        const idx = start + localIdx; // global filteredPlays index
        const onWristband = isPlayOnHighlightedWristband(p);
        const wbClass = onWristband ? " on-wristband" : "";
        const gpClass = isPlayInGamePlan(p) ? " in-gameplan" : "";
        const wbIndicator = onWristband
          ? '<span class="wb-indicator" title="On wristband">🏈</span>'
          : "";
        const installBadge =
          typeof getPlayStarBadge === "function" ? getPlayStarBadge(p) : "";

        const gpActive = isPlayInGamePlan(p);
        const gpToggle = getGameWeek().opponentName
          ? `<button class="gp-toggle-btn${gpActive ? " gp-active" : ""}" data-action="togglePlaybookGamePlan" data-idx="${idx}" title="${gpActive ? "Remove from" : "Add to"} game plan">🎯</button>`
          : "";

        return `
            <tr class="${wbClass}${gpClass}" data-action="selectPlaybookRow" data-idx="${idx}"  
                data-preview="${idx}"
                title="Click to select, double-click to edit">
                <td class="col-gameplan">${gpToggle}</td>
                <td class="col-install">${installBadge}</td>
                <td class="col-type">${wbIndicator}${highlightSearch(p.type, searchTerm)}</td>
                <td class="col-formation">${highlightSearch(p.formation, searchTerm)}</td>
                <td class="col-tags">${escapeHtml([p.formTag1, p.formTag2].filter(Boolean).join(", ") || "-")}</td>
                <td class="col-back">${highlightSearch(p.back || "-", searchTerm)}</td>
                <td class="col-motion">${highlightSearch(p.motion || "-", searchTerm)}</td>
                <td class="col-protection">${highlightSearch(p.protection || "-", searchTerm)}</td>
                <td class="col-play play-cell" data-action="copyPlayName" data-play="${escapeHtml(p.play)}"><strong>${highlightSearch(p.play, searchTerm)}</strong> ${escapeHtml([p.playTag1, p.playTag2].filter(Boolean).join(" "))}</td>
                <td class="col-basePlay">${escapeHtml(p.basePlay || "-")}</td>
                <td class="col-tempo">${escapeHtml(p.tempo || "-")}</td>
            </tr>
        `;
      })
      .join("");

    // ── Mobile card view ──
    let cardsEl = document.getElementById("pbCards");
    if (!cardsEl) {
      cardsEl = document.createElement("div");
      cardsEl.id = "pbCards";
      cardsEl.className = "pb-cards";
      const container = document.getElementById("playbookContainer");
      if (container) container.insertBefore(cardsEl, container.firstChild);
    }
    cardsEl.innerHTML = pageSlice
      .map((p, localIdx) => {
        const idx = start + localIdx;
        const onWristband = isPlayOnHighlightedWristband(p);
        const wbClass = onWristband ? " on-wristband" : "";
        const gpClass = isPlayInGamePlan(p) ? " in-gameplan" : "";
        const gpCardActive = isPlayInGamePlan(p);
        const gpCardToggle = getGameWeek().opponentName
          ? `<button class="gp-toggle-btn gp-card-btn${gpCardActive ? " gp-active" : ""}" data-action="togglePlaybookGamePlan" data-idx="${idx}" title="${gpCardActive ? "Remove from" : "Add to"} game plan">🎯</button>`
          : "";
        const installBadge =
          typeof getPlayStarBadge === "function" ? getPlayStarBadge(p) : "";
        const pills = [p.type, p.back, p.motion, p.tempo]
          .filter(Boolean)
          .map((v) => `<span class="pb-card-pill">${escapeHtml(v)}</span>`)
          .join("");
        return `
          <div class="pb-card${wbClass}${gpClass}" data-action="selectPlaybookRow" data-idx="${idx}" data-preview="${idx}"
               tabindex="0" role="button"
               aria-label="${escapeHtml(p.formation)} ${escapeHtml(p.play)}">
            <div class="pb-card-play">${gpCardToggle}${installBadge} ${highlightSearch(p.formation, searchTerm)} ${highlightSearch(p.protection || "", searchTerm)} ${highlightSearch(p.play, searchTerm)}</div>
            <div class="pb-card-sub">${highlightSearch(p.type, searchTerm)}${p.motion ? " · " + highlightSearch(p.motion, searchTerm) : ""}${p.back ? " · " + highlightSearch(p.back, searchTerm) : ""}</div>
            <div class="pb-card-pills">${pills}</div>
          </div>
        `;
      })
      .join("");

    // ── Zero-results empty state ──
    let emptyEl = document.getElementById("pbEmptyState");
    if (!emptyEl) {
      emptyEl = document.createElement("div");
      emptyEl.id = "pbEmptyState";
      emptyEl.className = "empty-state empty-state--bordered";
      emptyEl.innerHTML =
        '<p class="empty-state__text">No plays match your filters.</p><button class="btn btn-secondary" data-action="clearAllFilters">✕ Clear All Filters</button>';
      const container = document.getElementById("playbookContainer");
      if (container) container.appendChild(emptyEl);
    }
    emptyEl.hidden = pageSlice.length > 0;

    // Update play count with pagination info
    const countEl = document.getElementById("playCount");
    if (countEl) {
      if (totalFiltered <= PLAYS_PER_PAGE) {
        countEl.textContent = `Showing ${totalFiltered} of ${plays.length} plays`;
      } else {
        countEl.textContent = `Showing ${start + 1}–${Math.min(start + PLAYS_PER_PAGE, totalFiltered)} of ${totalFiltered} plays (${plays.length} total)`;
      }
    }

    // Render pagination controls
    _renderPagination(totalPages, totalFiltered);

    // Update stats bar
    updateStatsBar();

    // Re-apply selection if valid
    if (selectedRowIndex >= 0 && selectedRowIndex < filteredPlays.length) {
      const rows = tbody.querySelectorAll("tr");
      const localSel = selectedRowIndex - start;
      if (localSel >= 0 && localSel < rows.length) {
        rows[localSel].classList.add("selected");
        if (cardsEl && cardsEl.children[localSel]) {
          cardsEl.children[localSel].classList.add("selected");
        }
      }
    }

    // Re-apply column visibility
    applyColumnVisibility();

    // Update scroll affordance on table container
    const tableWrap = document.querySelector(".table-container");
    if (tableWrap) {
      tableWrap.classList.toggle(
        "is-scrollable",
        tableWrap.scrollWidth > tableWrap.clientWidth,
      );
    }

    // Attach long-press context menus for mobile
    if (typeof _showPlaybookRowContextMenu === "function") {
      tbody.querySelectorAll("tr[data-idx]").forEach((row) => {
        const idx = parseInt(row.dataset.idx, 10);
        if (!isNaN(idx)) {
          addLongPress(row, (ev) => _showPlaybookRowContextMenu(ev, idx));
        }
      });
    }
  } catch (err) {
    console.error("renderPlaybook error:", err);
    showToast("❌ Error rendering playbook.", {
      duration: 3000,
      type: "error",
    });
  }
}

/**
 * Render pagination controls below the table
 */
function _renderPagination(totalPages, totalFiltered) {
  let pager = document.getElementById("pbPagination");
  if (totalFiltered <= PLAYS_PER_PAGE) {
    if (pager) pager.remove();
    return;
  }
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "pbPagination";
    pager.className = "pb-pagination";
    const container = document.getElementById("playbookContainer");
    if (container) container.appendChild(pager);
  }
  pager.innerHTML = `
    <button class="btn btn-sm" data-action="pbPagePrev" ${currentPage === 0 ? "disabled" : ""}>◀ Prev</button>
    <span class="pb-page-info">Page ${currentPage + 1} of ${totalPages}</span>
    <button class="btn btn-sm" data-action="pbPageNext" ${currentPage >= totalPages - 1 ? "disabled" : ""}>Next ▶</button>
  `;
}

function pbPagePrev() {
  if (currentPage > 0) {
    currentPage--;
    renderPlaybook();
  }
}
function pbPageNext() {
  const totalPages = Math.ceil(filteredPlays.length / PLAYS_PER_PAGE);
  if (currentPage < totalPages - 1) {
    currentPage++;
    renderPlaybook();
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
 * Inline edit a playbook cell on double-click
 * @param {HTMLElement} td - The table cell
 * @param {number} playIndex - Index in filteredPlays
 * @param {string} field - Play object field key
 */
function startInlineEdit(td, playIndex, field) {
  if (td.querySelector(".pb-inline-edit")) return;
  const play = filteredPlays[playIndex];
  if (!play) return;
  const original = play[field] || "";

  const input = document.createElement("input");
  input.className = "pb-inline-edit";
  input.type = "text";
  input.value = original;
  td.textContent = "";
  td.appendChild(input);
  input.focus();
  input.select();

  function commit() {
    const newVal = input.value.trim();
    // Update in filteredPlays AND plays master array
    const masterIdx = plays.indexOf(play);
    play[field] = newVal;
    if (masterIdx >= 0) plays[masterIdx][field] = newVal;
    storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    invalidateFilterCache();
    renderPlaybook();
    if (newVal !== original) showToast("✏️ Updated");
  }

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      input.value = original;
      input.blur();
    }
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
    if (state.filterFormation)
      _setVal("filterFormation", state.filterFormation);
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

/**
 * Initialize keyboard navigation for playbook
 */
/**
 * Named document-level keydown handler (extractable for remove-before-add)
 */
function _playbookDocKeydown(e) {
  const activeEl = document.activeElement;
  const inInput =
    activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA";

  // ? to show shortcuts (Shift + /)
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !inInput) {
    e.preventDefault();
    showKeyboardShortcuts();
  }

  // / to focus play search
  if (e.key === "/" && !e.ctrlKey && !e.metaKey && !inInput) {
    e.preventDefault();
    document.getElementById("searchPlay")?.focus();
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
        `<div class="stat-item"><span class="stat-count">${count}</span> ${escapeHtml(type)}</div>`,
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
    showToast("❌ Error saving collection.", { duration: 4000, type: "error" });
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
            <button class="pb-coll-btn" data-action="loadCollection" data-idx="${idx}" title="Load filters">Load</button>
            <button class="pb-coll-btn" data-action="sendCollectionToScript" data-idx="${idx}" title="Send to script">&#128203; Script</button>
            <button class="pb-coll-btn" data-action="sendCollectionToCallSheet" data-idx="${idx}" title="Send to call sheet">&#128202; Sheet</button>
            <button class="pb-coll-btn danger" data-action="deleteCollection" data-idx="${idx}" title="Delete">&times;</button>
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
           data-drag="pbSort">
        <span class="drag-handle">☰</span>
        <select data-onchange="_pbSortUpdateField" data-key="${idx}" data-pass="value">${fieldOpts}</select>
        <button class="sort-dir-btn" data-action="_pbSortToggleDir" data-idx="${idx}" title="${dirTitle}">${dirIcon}</button>
        <button class="custom-order-btn custom-order-btn-compact" data-action="openCustomOrderModal" data-sort-field="${c.field}" title="${customTitle}">${customIcon}</button>
        <button class="remove-sort-btn" data-action="_pbSortRemove" data-idx="${idx}">✕</button>
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

  try {
    showToast("🖨️ Preparing playbook print…", 2500);
    const opts = _getPbPrintOptions();
    const { highlightHuddle, highlightCandy } = opts;
    const container = document.getElementById("playbookPrintCards");

    // Sort a copy of filteredPlays using the print sort criteria
    const sortedPlays = _applyPbPrintSort(filteredPlays);

    // Build title + meta line
    const total = sortedPlays.length;
    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    let html =
      `<div class="pb-print-title">Playbook — ${escapeHtml(total + "")} Plays</div>` +
      `<div class="pb-print-meta">${escapeHtml(dateStr)}</div>`;

    html += '<ul class="pb-print-list">';

    sortedPlays.forEach((play, idx) => {
      const isHuddle =
        highlightHuddle && play.tempo && play.tempo.toLowerCase() === "huddle";
      const isCandy =
        highlightCandy && play.tempo && play.tempo.toLowerCase() === "candy";
      const bgStyle = isHuddle
        ? ` style="background:${UI_COLORS.highlightHuddle};"`
        : isCandy
          ? ` style="background:${UI_COLORS.highlightCandy};"`
          : "";

      html += `<li${bgStyle}><span class="pb-print-num">${idx + 1}.</span><span class="pb-print-call">${getFullCall(play, opts)}</span></li>`;
    });

    html += "</ul>";
    container.innerHTML = html;

    // Show print container + set print mode
    document.getElementById("playbookPrint").classList.remove("hidden");
    document.body.dataset.printMode = "playbook";

    // Inject dynamic page-size style
    setupPrintPageStyle(
      "@media print { @page { size: letter portrait; margin: 0.35in 0.4in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Playbook");
        window.print();
        restoreTitle();
      } finally {
        document.getElementById("playbookPrint").classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 100);
  } catch (err) {
    console.error("printFilteredPlays error:", err);
    document.getElementById("playbookPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing playbook.", {
      duration: 4000,
      type: "error",
    });
  }
}

// ══════════════════════════════════════════════════════════════════
// ██  Play Editor  ██
// ══════════════════════════════════════════════════════════════════

/** Index into master `plays` array of the play being edited, or -1 for new */
let _editingMasterIdx = -1;
/** Index into `filteredPlays` of the play being edited, for prev/next nav */
let _editingFilteredIdx = -1;

/**
 * Field definitions for the play editor, grouped into sections.
 * key = play object property, label = human-readable, type = input type
 */
/**
 * Build a sorted, deduplicated option list from actual playbook values
 * for a given field key, seeded with defaults so the list is never empty.
 * Always includes "" (blank) as first option.
 */
function _editorOptions(key, defaults, extraKeys) {
  const set = new Set(defaults);
  if (typeof plays !== "undefined" && Array.isArray(plays)) {
    const keys = extraKeys || [key];
    plays.forEach((p) => {
      keys.forEach((k) => {
        const v = (p[k] || "").trim();
        if (v) set.add(v);
      });
    });
  }
  // Sort alphabetically (blank always first)
  const sorted = [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return ["", ...sorted];
}

/** Default seed values for select dropdowns */
const _TYPE_DEFAULTS = [
  "Run",
  "Pass",
  "RPO",
  "Screen",
  "Quick",
  "Play Action",
  "Play Pass",
  "Run Option",
  "Option",
  "Movement",
  "Drop",
  "Tricks",
];
const _SITUATION_DEFAULTS = [
  "Short Yardage",
  "2 Minute",
  "4 Minute",
  "Red Zone",
  "Silver",
  "Bad Weather",
];
const _FIELD_POS_DEFAULTS = [
  "Green",
  "Lo-RZ",
  "Hi-RZ",
  "Goal Line",
  "Backed Up",
  "Saigon",
  "Fringe",
  "Coming Out",
];
const _HIT_CHART_DEFAULTS = [
  "Left Deep",
  "Left Seam",
  "Left Medium",
  "Left Short",
  "Left Curl",
  "Left Hook",
  "Left Flat",
  "Middle Hole",
  "Middle Hook",
  "Deep Post",
  "Right Deep",
  "Right Seam",
  "Right Medium",
  "Right Short",
  "Right Curl",
  "Right Hook",
  "Right Flat",
  "Inside Run Left",
  "Inside Run Right",
  "Inside Tackle Left",
  "Inside Tackle Right",
  "Off Tackle Left",
  "Off Tackle Right",
];

const _EDITOR_SECTIONS = [
  {
    title: "Core",
    fields: [
      {
        key: "type",
        label: "Play Type",
        type: "select",
        optionsFn: () => _editorOptions("type", _TYPE_DEFAULTS),
      },
      { key: "personnel", label: "Personnel" },
      { key: "formation", label: "Formation" },
      { key: "play", label: "Play Name" },
      { key: "basePlay", label: "Base Play" },
      { key: "oneWord", label: "One Word" },
    ],
  },
  {
    title: "Tags",
    fields: [
      { key: "formTag1", label: "Form Tag 1" },
      { key: "formTag2", label: "Form Tag 2" },
      { key: "playTag1", label: "Play Tag 1" },
      { key: "playTag2", label: "Play Tag 2" },
    ],
  },
  {
    title: "Blocking & Motion",
    fields: [
      { key: "under", label: "Under" },
      { key: "back", label: "Back" },
      { key: "shift", label: "Shift" },
      { key: "motion", label: "Motion" },
      { key: "protection", label: "Protection" },
      { key: "lineCall", label: "Line Call" },
    ],
  },
  {
    title: "Preferences",
    fields: [
      {
        key: "preferredSituation",
        label: "Situation",
        type: "select",
        optionsFn: () =>
          _editorOptions("preferredSituation", _SITUATION_DEFAULTS),
      },
      {
        key: "preferredDown",
        label: "Down",
        type: "select",
        options: ["", "1", "2", "3", "4"],
      },
      {
        key: "preferredDistance",
        label: "Distance",
        type: "select",
        options: ["", "Short", "Medium", "Long"],
      },
      { key: "preferredHash", label: "Hash" },
      {
        key: "preferredFieldPosition",
        label: "Field Position",
        type: "select",
        optionsFn: () =>
          _editorOptions("preferredFieldPosition", _FIELD_POS_DEFAULTS),
      },
      { key: "tempo", label: "Tempo" },
    ],
  },
  {
    title: "Practice Look",
    fields: [
      { key: "practiceFront", label: "Front" },
      { key: "practiceDefense", label: "Defense" },
      { key: "practiceCoverage", label: "Coverage" },
      { key: "practiceBlitz", label: "Blitz" },
      { key: "practiceStunt", label: "Stunt" },
    ],
  },
  {
    title: "Key Players",
    fields: [
      { key: "keyPlayer1", label: "Player 1 Position" },
      { key: "keyPlayerName1", label: "Player 1 Name" },
      { key: "keyPlayer2", label: "Player 2 Position" },
      { key: "keyPlayerName2", label: "Player 2 Name" },
      { key: "keyPlayer3", label: "Player 3 Position" },
      { key: "keyPlayerName3", label: "Player 3 Name" },
    ],
  },
  {
    title: "Constraints & Hit Charts",
    fields: [
      { key: "constraint1", label: "Constraint 1" },
      { key: "constraint2", label: "Constraint 2" },
      { key: "constraint3", label: "Constraint 3" },
      {
        key: "hitChart1",
        label: "Hit Chart 1",
        type: "select",
        canAddNew: true,
        optionsFn: () =>
          _editorOptions("hitChart1", _HIT_CHART_DEFAULTS, [
            "hitChart1",
            "hitChart2",
            "hitChart3",
          ]),
      },
      {
        key: "hitChart2",
        label: "Hit Chart 2",
        type: "select",
        canAddNew: true,
        optionsFn: () =>
          _editorOptions("hitChart2", _HIT_CHART_DEFAULTS, [
            "hitChart1",
            "hitChart2",
            "hitChart3",
          ]),
      },
      {
        key: "hitChart3",
        label: "Hit Chart 3",
        type: "select",
        canAddNew: true,
        optionsFn: () =>
          _editorOptions("hitChart3", _HIT_CHART_DEFAULTS, [
            "hitChart1",
            "hitChart2",
            "hitChart3",
          ]),
      },
    ],
  },
  {
    title: "Other",
    fields: [
      { key: "deadVs", label: "Dead Vs" },
      { key: "opponent", label: "Opponent" },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
];

function _buildPlayEditorLineupSection(play) {
  const directAssignments = normalizePlayerAssignments(play?.playerAssignments);
  const rowOne = getTeamAssignmentSlots(play?.personnel).filter(
    (slot) => slot.row === 0,
  );
  const rowTwo = getTeamAssignmentSlots(play?.personnel).filter(
    (slot) => slot.row === 1,
  );
  const renderRow = (slots) => `
    <div class="team-package-grid ${slots.length === 5 ? "team-package-grid--five" : "team-package-grid--six"}">
      ${slots.map((slot) => `
        <label class="team-package-slot">
          <span class="team-package-slot-label">${slot.label}</span>
          <select data-player-slot="${slot.key}" aria-label="${escapeHtml(play?.play || "Play")} ${slot.label} template">
            ${buildTeamPlayerOptionMarkup(directAssignments[slot.key] || "")}
          </select>
        </label>
      `).join("")}
    </div>
  `;

  return `
    <div class="pb-editor-section">
      <div class="pb-editor-section-title">Lineup Template</div>
      <div class="pb-editor-field pb-editor-field-wide">
        <label for="pe-defaultSwapGroupId">Default Swap Group</label>
        <select id="pe-defaultSwapGroupId" data-field="defaultSwapGroupId">
          ${buildTeamSwapGroupOptionMarkup(play?.defaultSwapGroupId || "", play?.personnel || "")}
        </select>
      </div>
      <p class="pb-editor-lineup-hint">Blank slots inherit from the personnel package and selected swap group. Saved slots become this play’s master template.</p>
      ${renderRow(rowOne)}
      ${renderRow(rowTwo)}
    </div>
  `;
}

/**
 * Open the play editor for an existing play (by filteredPlays index)
 */
function openPlayEditor(filteredIdx) {
  const play = filteredPlays[filteredIdx];
  if (!play) return;
  _editingFilteredIdx = filteredIdx;
  _editingMasterIdx = plays.indexOf(play);
  if (_editingMasterIdx < 0) {
    // Fallback: find by matching fields
    _editingMasterIdx = plays.findIndex((p) => playsMatch(p, play));
  }
  _populateEditorForm(play, false);
}

/**
 * Open the play editor for creating a new play
 */
function addNewPlay() {
  if (plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 3000, type: "error" });
    return;
  }
  _editingMasterIdx = -1;
  _editingFilteredIdx = -1;
  const blank = {};
  _EDITOR_SECTIONS.forEach((s) => s.fields.forEach((f) => (blank[f.key] = "")));
  _populateEditorForm(blank, true);
}

/**
 * Populate the editor form and show the overlay
 */
function _populateEditorForm(play, isNew) {
  const overlay = document.getElementById("playEditorOverlay");
  const body = document.getElementById("playEditorBody");
  const title = document.getElementById("playEditorTitle");
  const icon = document.getElementById("playEditorIcon");
  const deleteBtn = document.getElementById("playEditorDeleteBtn");

  title.textContent = isNew ? "New Play" : "Edit Play";
  icon.textContent = isNew ? "➕" : "✏️";
  deleteBtn.style.display = isNew ? "none" : "";

  // Play call preview (as it appears on wristband)
  const preview = document.getElementById("playEditorPreview");
  if (preview) {
    if (isNew) {
      preview.innerHTML = "";
      preview.style.display = "none";
    } else {
      preview.innerHTML = getFullCall(play, { showLineCall: false });
      preview.style.display = "";
    }
  }

  // Position counter + prev/next button state
  const posEl = document.getElementById("playEditorPos");
  const prevBtn = document.getElementById("playEditorPrev");
  const nextBtn = document.getElementById("playEditorNext");
  if (isNew || _editingFilteredIdx < 0) {
    if (posEl) posEl.textContent = "";
    if (prevBtn) prevBtn.style.display = "none";
    if (nextBtn) nextBtn.style.display = "none";
  } else {
    if (posEl)
      posEl.textContent = `${_editingFilteredIdx + 1} / ${filteredPlays.length}`;
    if (prevBtn) {
      prevBtn.style.display = "";
      prevBtn.disabled = _editingFilteredIdx <= 0;
    }
    if (nextBtn) {
      nextBtn.style.display = "";
      nextBtn.disabled = _editingFilteredIdx >= filteredPlays.length - 1;
    }
  }

  let html = "";

  // Game Plan tag section — only show when editing (not new) and opponent is active
  const gw = getGameWeek();
  if (!isNew && gw.opponentName) {
    const isTagged = isPlayTaggedForOpponent(play, gw.opponentName);
    html += `<div class="pb-editor-section pb-editor-gameplan">
      <div class="pb-editor-section-title">🎯 Game Plan — ${escapeHtml(gw.opponentName)}${gw.weekLabel ? " (" + escapeHtml(gw.weekLabel) + ")" : ""}</div>
      <label class="pb-gp-toggle" for="pe-gameplan">
        <input type="checkbox" id="pe-gameplan" ${isTagged ? "checked" : ""} />
        <span>Include in game plan for <strong>${escapeHtml(gw.opponentName)}</strong></span>
      </label>
    </div>`;
  }

  _EDITOR_SECTIONS.forEach((section) => {
    html += `<div class="pb-editor-section">`;
    html += `<div class="pb-editor-section-title">${section.title}</div>`;
    html += `<div class="pb-editor-grid">`;
    section.fields.forEach((f) => {
      const val = play[f.key] || "";
      const wideClass = f.wide ? " pb-editor-field-wide" : "";
      html += `<div class="pb-editor-field${wideClass}">`;
      html += `<label for="pe-${f.key}">${escapeHtml(f.label)}</label>`;

      if (f.type === "select") {
        const opts = f.optionsFn ? f.optionsFn() : f.options || [];
        // If the current value isn't in the list, prepend it
        const valInList = opts.some((o) => o === val);
        html += `<select id="pe-${f.key}" data-field="${f.key}"${f.canAddNew ? ' data-can-add-new="1"' : ""}>`;
        if (!valInList && val) {
          html += `<option value="${escapeHtml(val)}" selected>${escapeHtml(val)}</option>`;
        }
        opts.forEach((opt) => {
          const sel = opt === val ? " selected" : "";
          const display = opt === "" ? "—" : opt;
          html += `<option value="${escapeHtml(opt)}"${sel}>${escapeHtml(display)}</option>`;
        });
        if (f.canAddNew) {
          html += `<option value="__add_new__">➕ Add New…</option>`;
        }
        html += `</select>`;
      } else if (f.type === "textarea") {
        html += `<textarea id="pe-${f.key}" data-field="${f.key}" rows="3">${escapeHtml(val)}</textarea>`;
      } else {
        html += `<input type="text" id="pe-${f.key}" data-field="${f.key}" value="${escapeHtml(val)}">`;
      }
      html += `</div>`;
    });
    html += `</div></div>`;
  });

  html += _buildPlayEditorLineupSection(play);

  body.innerHTML = html;
  overlay.classList.add("visible");

  // Wire up "Add New…" option on selects that support it
  body.querySelectorAll("select[data-can-add-new]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      if (sel.value !== "__add_new__") return;
      // Reset to blank while prompt is open
      sel.value = "";
      const newVal = await showPrompt("Enter a new option:", "", {
        title: "Add New Option",
        icon: "➕",
        placeholder: "e.g. Right Seam",
      });
      if (newVal && newVal.trim()) {
        const trimmed = newVal.trim();
        // Insert before the "Add New" option
        const addOpt = sel.querySelector('option[value="__add_new__"]');
        const option = document.createElement("option");
        option.value = trimmed;
        option.textContent = trimmed;
        option.selected = true;
        sel.insertBefore(option, addOpt);
      }
    });
  });

  // Focus first input
  const first = body.querySelector("input, select, textarea");
  if (first) setTimeout(() => first.focus(), 100);
}

/**
 * Save the play editor form
 */
function savePlayEditor() {
  const body = document.getElementById("playEditorBody");
  const fields = body.querySelectorAll("[data-field]");
  const assignmentFields = body.querySelectorAll("[data-player-slot]");
  const data = {};
  fields.forEach((el) => {
    data[el.dataset.field] = (el.value || "").trim();
  });
  const playerAssignments = {};
  assignmentFields.forEach((el) => {
    const slotKey = el.dataset.playerSlot;
    const value = String(el.value || "").trim();
    if (slotKey && value) playerAssignments[slotKey] = value;
  });
  data.playerAssignments = Object.keys(playerAssignments).length
    ? playerAssignments
    : undefined;

  // Validate: at minimum need a play name
  if (!data.play) {
    showToast("Play name is required", { duration: 3000, type: "error" });
    const playInput = document.getElementById("pe-play");
    if (playInput) playInput.focus();
    return;
  }

  if (_editingMasterIdx >= 0) {
    // Update existing play
    const existing = plays[_editingMasterIdx];
    Object.keys(data).forEach((k) => (existing[k] = data[k]));
    existing.playerAssignments = data.playerAssignments;

    // Handle game plan tag
    _syncGamePlanCheckbox(existing);

    showToast("✏️ Play updated", { duration: 2000, type: "success" });
  } else {
    // Add new play — build full play object
    const newPlay = {};
    _EDITOR_SECTIONS.forEach((s) =>
      s.fields.forEach((f) => (newPlay[f.key] = data[f.key] || "")),
    );
    newPlay.defaultSwapGroupId = data.defaultSwapGroupId || "";
    if (data.playerAssignments) newPlay.playerAssignments = data.playerAssignments;
    plays.push(newPlay);

    // Handle game plan tag for new play
    _syncGamePlanCheckbox(newPlay);

    showToast("➕ Play added to playbook", { duration: 2000, type: "success" });
  }

  storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
  invalidateFilterCache();
  filteredPlays = [...plays];
  filterPlays();
  closePlayEditor();
}

/**
 * Delete the play being edited
 */
async function deletePlayFromEditor() {
  if (_editingMasterIdx < 0) return;
  const play = plays[_editingMasterIdx];
  const ok = await showConfirm(
    `Delete <strong>${escapeHtml(play.play || "this play")}</strong> from the playbook?`,
    { title: "Delete Play", icon: "🗑️", confirmText: "Delete", danger: true },
  );
  if (!ok) return;

  plays.splice(_editingMasterIdx, 1);
  storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
  invalidateFilterCache();
  filteredPlays = [...plays];
  filterPlays();
  closePlayEditor();
  showToast("🗑️ Play deleted", { duration: 2000, type: "success" });
}

/**
 * Close the play editor overlay
 */
function closePlayEditor() {
  const overlay = document.getElementById("playEditorOverlay");
  if (overlay) overlay.classList.remove("visible");
  _editingMasterIdx = -1;
  _editingFilteredIdx = -1;
}

/**
 * Quick-toggle a play's game plan tag from the playbook row
 */
function togglePlaybookGamePlan(filteredIdx) {
  const play = filteredPlays[filteredIdx];
  if (!play) return;
  const gw = getGameWeek();
  if (!gw.opponentName) {
    showToast("Select an opponent on the Dashboard first", {
      duration: 3000,
      type: "error",
    });
    return;
  }
  const nowTagged = togglePlayGamePlanTag(play, gw.opponentName);
  showToast(
    nowTagged
      ? `🎯 Added to game plan vs ${gw.opponentName}`
      : `Removed from game plan`,
    { duration: 1500, type: nowTagged ? "success" : undefined },
  );
  renderPlaybook();
}

/**
 * Sync the game plan checkbox state with storage
 */
function _syncGamePlanCheckbox(play) {
  const cb = document.getElementById("pe-gameplan");
  if (!cb) return;
  const gw = getGameWeek();
  if (!gw.opponentName) return;
  const isTagged = isPlayTaggedForOpponent(play, gw.opponentName);
  if (cb.checked !== isTagged) {
    togglePlayGamePlanTag(play, gw.opponentName);
  }
}

/**
 * Navigate to the previous play in the filtered list
 */
function playEditorPrev() {
  if (_editingFilteredIdx <= 0) return;
  _autoSaveCurrentEditorFields();
  openPlayEditor(_editingFilteredIdx - 1);
}

/**
 * Navigate to the next play in the filtered list
 */
function playEditorNext() {
  if (_editingFilteredIdx >= filteredPlays.length - 1) return;
  _autoSaveCurrentEditorFields();
  openPlayEditor(_editingFilteredIdx + 1);
}

/**
 * Silently save any edits in the current form before navigating away
 */
function _autoSaveCurrentEditorFields() {
  if (_editingMasterIdx < 0) return;
  const body = document.getElementById("playEditorBody");
  if (!body) return;
  const fields = body.querySelectorAll("[data-field]");
  const existing = plays[_editingMasterIdx];
  if (!existing) return;
  let changed = false;
  fields.forEach((el) => {
    const val = (el.value || "").trim();
    if (existing[el.dataset.field] !== val) {
      existing[el.dataset.field] = val;
      changed = true;
    }
  });
  if (changed) {
    storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    invalidateFilterCache();
  }

  // Sync game plan checkbox
  _syncGamePlanCheckbox(existing);
}

// ══════════════════════════════════════════════════════════════════
// ██  CSV Export  ██
// ══════════════════════════════════════════════════════════════════

/**
 * CSV header names matching the import template order
 */
const _CSV_HEADERS = [
  "PlayType",
  "Personnel",
  "Formation",
  "FormTag1",
  "FormTag2",
  "Under",
  "Back",
  "Shift",
  "Motion",
  "Protection",
  "LineCall",
  "Play",
  "PlayTag1",
  "PlayTag2",
  "BasePlay",
  "OneWord",
  "PreferredSituation",
  "PreferredDown",
  "PreferredDistance",
  "PreferredHash",
  "PreferredFieldPosition",
  "Tempo",
  "PracticeFront",
  "PracticeDefense",
  "PracticeCoverage",
  "PracticeBlitz",
  "PracticeStunt",
  "KeyPlayer1",
  "KeyPlayer2",
  "KeyPlayer3",
  "KeyPlayerName1",
  "KeyPlayerName2",
  "KeyPlayerName3",
  "Constraint1",
  "Constraint2",
  "Constraint3",
  "HitChart1",
  "HitChart2",
  "HitChart3",
  "DeadVs",
  "Opponent",
  "Notes",
];

/**
 * Matching play object keys in the same order as _CSV_HEADERS
 */
const _CSV_KEYS = [
  "type",
  "personnel",
  "formation",
  "formTag1",
  "formTag2",
  "under",
  "back",
  "shift",
  "motion",
  "protection",
  "lineCall",
  "play",
  "playTag1",
  "playTag2",
  "basePlay",
  "oneWord",
  "preferredSituation",
  "preferredDown",
  "preferredDistance",
  "preferredHash",
  "preferredFieldPosition",
  "tempo",
  "practiceFront",
  "practiceDefense",
  "practiceCoverage",
  "practiceBlitz",
  "practiceStunt",
  "keyPlayer1",
  "keyPlayer2",
  "keyPlayer3",
  "keyPlayerName1",
  "keyPlayerName2",
  "keyPlayerName3",
  "constraint1",
  "constraint2",
  "constraint3",
  "hitChart1",
  "hitChart2",
  "hitChart3",
  "deadVs",
  "opponent",
  "notes",
];

/**
 * Escape a value for CSV (wrap in quotes if it contains comma, quote, or newline)
 */
function _csvEscape(val) {
  const s = val == null ? "" : String(val);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Export the full playbook as a CSV file
 */
function exportPlaybookCSV() {
  if (!plays || plays.length === 0) {
    showToast("No plays to export", { duration: 3000, type: "error" });
    return;
  }

  const rows = [_CSV_HEADERS.join(",")];
  plays.forEach((p) => {
    rows.push(_CSV_KEYS.map((k) => _csvEscape(p[k])).join(","));
  });

  const csv = rows.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "playbook_export.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast(`📥 Exported ${plays.length} plays to CSV`, {
    duration: 3000,
    type: "success",
  });
}

// ── Playbook search: self-contained listener (belt-and-suspenders) ──
document.addEventListener("DOMContentLoaded", () => {
  const _pbSearch = document.getElementById("searchPlay");
  if (_pbSearch) {
    _pbSearch.addEventListener("input", () => filterPlays());
  }
});
