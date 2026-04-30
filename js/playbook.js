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
      <p class="pb-editor-lineup-hint">Blank slots inherit from the personnel package depth chart. Saved starters become this play’s master template.</p>
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

function showUpload() {
  document.getElementById("mainApp").classList.add("hidden");
  document.getElementById("uploadSection").classList.remove("hidden");

  const backBtn = document.getElementById("backToAppBtn");
  if (backBtn && plays.length > 0) {
    backBtn.classList.remove("hidden");
  }
}

function backToApp() {
  if (plays.length > 0) {
    document.getElementById("uploadSection").classList.add("hidden");
    document.getElementById("mainApp").classList.remove("hidden");
  }
}

const _MERGE_FIELDS = [
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

const _MERGE_KEEP = new Set([
  "reps",
  "notes",
  "hash",
  "defFront",
  "defCoverage",
  "defStunt",
  "defBlitz",
  "id",
  "isSeparator",
  "label",
  "isBlank",
]);

function _mKey(play) {
  return (
    (play.formation || "").toLowerCase().trim() +
    "\0" +
    (play.play || "").toLowerCase().trim()
  );
}

function _mFullKey(play) {
  return (
    (play.type || "").toLowerCase().trim() +
    "\0" +
    (play.personnel || "").toLowerCase().trim() +
    "\0" +
    (play.formation || "").toLowerCase().trim() +
    "\0" +
    (play.play || "").toLowerCase().trim()
  );
}

function _smartMerge(existing, incoming) {
  const eMatched = new Uint8Array(existing.length);
  const nMatched = new Uint8Array(incoming.length);
  const pairs = [];

  const byFull = new Map();
  existing.forEach((play, index) => {
    const key = _mFullKey(play);
    if (!byFull.has(key)) byFull.set(key, []);
    byFull.get(key).push(index);
  });
  incoming.forEach((play, incomingIndex) => {
    const key = _mFullKey(play);
    const candidates = byFull.get(key);
    if (!candidates) return;
    for (const existingIndex of candidates) {
      if (!eMatched[existingIndex]) {
        eMatched[existingIndex] = 1;
        nMatched[incomingIndex] = 1;
        pairs.push({ ei: existingIndex, ni: incomingIndex });
        break;
      }
    }
  });

  const byPart = new Map();
  existing.forEach((play, index) => {
    if (eMatched[index]) return;
    const key = _mKey(play);
    if (!byPart.has(key)) byPart.set(key, []);
    byPart.get(key).push(index);
  });
  incoming.forEach((play, incomingIndex) => {
    if (nMatched[incomingIndex]) return;
    const key = _mKey(play);
    const candidates = byPart.get(key);
    if (!candidates) return;
    for (const existingIndex of candidates) {
      if (!eMatched[existingIndex]) {
        eMatched[existingIndex] = 1;
        nMatched[incomingIndex] = 1;
        pairs.push({ ei: existingIndex, ni: incomingIndex });
        break;
      }
    }
  });

  const updated = [];
  const unchanged = [];
  for (const pair of pairs) {
    const oldPlay = existing[pair.ei];
    const newPlay = incoming[pair.ni];
    const changes = [];
    for (const field of _MERGE_FIELDS) {
      const oldValue = (oldPlay[field] || "").trim();
      const newValue = (newPlay[field] || "").trim();
      if (oldValue !== newValue) {
        changes.push({ field, from: oldValue, to: newValue });
      }
    }
    (changes.length ? updated : unchanged).push({ ...pair, changes });
  }

  const added = [];
  incoming.forEach((_, index) => {
    if (!nMatched[index]) added.push(index);
  });
  const removed = [];
  existing.forEach((_, index) => {
    if (!eMatched[index]) removed.push(index);
  });

  const merged = existing.map((play) => ({ ...play }));
  for (const update of updated) {
    const target = merged[update.ei];
    const source = incoming[update.ni];
    for (const field of _MERGE_FIELDS) target[field] = source[field] || "";
  }
  const addedPlays = added.map((index) => ({ ...incoming[index] }));
  merged.push(...addedPlays);

  return {
    merged,
    report: {
      updated,
      unchanged,
      added,
      removed,
      addedPlays,
      removedPlays: removed.map((index) => existing[index]),
      totalExisting: existing.length,
      totalNew: incoming.length,
      totalMerged: merged.length,
    },
  };
}

function _mergeUpdateRefs(existing, incoming, report) {
  if (report.updated.length === 0) {
    return { wristbands: 0, scripts: 0, callsheet: 0 };
  }

  const updates = report.updated.map((update) => ({
    old: existing[update.ei],
    nw: incoming[update.ni],
  }));
  const updatesByKey = new Map();
  for (const update of updates) {
    const key = _mKey(update.old);
    if (!updatesByKey.has(key)) updatesByKey.set(key, []);
    updatesByKey.get(key).push(update);
  }

  let wristbandCount = 0;
  let scriptCount = 0;
  let callSheetCount = 0;

  function applyUpdate(ref) {
    const key = _mKey(ref);
    const candidates = updatesByKey.get(key);
    if (!candidates) return false;
    for (const candidate of candidates) {
      if (playsMatch(ref, candidate.old)) {
        for (const field of _MERGE_FIELDS) ref[field] = candidate.nw[field] || "";
        return true;
      }
    }
    return false;
  }

  function applyScriptUpdate(ref) {
    const key = _mKey(ref);
    const candidates = updatesByKey.get(key);
    if (!candidates) return false;
    for (const candidate of candidates) {
      if (playsMatch(ref, candidate.old)) {
        for (const field of _MERGE_FIELDS) {
          if (!_MERGE_KEEP.has(field)) ref[field] = candidate.nw[field] || "";
        }
        return true;
      }
    }
    return false;
  }

  const savedWristbands = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  let wristbandsDirty = false;
  for (const wristband of savedWristbands) {
    if (!wristband.cards) continue;
    for (const card of wristband.cards) {
      if (!card.data) continue;
      for (let index = 0; index < card.data.length; index++) {
        if (card.data[index] && applyUpdate(card.data[index])) {
          wristbandCount++;
          wristbandsDirty = true;
        }
      }
    }
  }
  if (wristbandsDirty) {
    storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, savedWristbands);
  }

  if (typeof wristbandCards !== "undefined" && Array.isArray(wristbandCards)) {
    for (const card of wristbandCards) {
      if (!card.data) continue;
      for (let index = 0; index < card.data.length; index++) {
        if (card.data[index] && applyUpdate(card.data[index])) {
          wristbandCount++;
        }
      }
    }
  }

  const savedScripts = getSavedScripts();
  let scriptsDirty = false;
  for (const savedScript of savedScripts) {
    if (!savedScript.plays) continue;
    for (const item of savedScript.plays) {
      if (item.isSeparator || item.isBlank) continue;
      if (applyScriptUpdate(item)) {
        scriptCount++;
        scriptsDirty = true;
      }
    }
  }
  if (scriptsDirty) {
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  }

  if (typeof script !== "undefined" && Array.isArray(script)) {
    for (const item of script) {
      if (item.isSeparator || item.isBlank) continue;
      if (applyScriptUpdate(item)) scriptCount++;
    }
  }

  const savedCallSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
  let callSheetDirty = false;
  if (savedCallSheet) {
    for (const categoryId of Object.keys(savedCallSheet)) {
      const bucket = savedCallSheet[categoryId];
      for (const side of ["left", "right"]) {
        if (!bucket[side]) continue;
        for (const play of bucket[side]) {
          if (applyUpdate(play)) {
            callSheetCount++;
            callSheetDirty = true;
          }
        }
      }
    }
    if (callSheetDirty) {
      storageManager.set(STORAGE_KEYS.CALL_SHEET, savedCallSheet);
      callSheet = savedCallSheet;
    }
  }

  if (!callSheetDirty && typeof callSheet !== "undefined" && callSheet) {
    for (const categoryId of Object.keys(callSheet)) {
      const bucket = callSheet[categoryId];
      for (const side of ["left", "right"]) {
        if (!bucket[side]) continue;
        for (const play of bucket[side]) {
          if (applyUpdate(play)) callSheetCount++;
        }
      }
    }
  }

  return {
    wristbands: wristbandCount,
    scripts: scriptCount,
    callsheet: callSheetCount,
  };
}

function _buildMergeReportHtml(report, refCounts, existingPlays) {
  const { updated, unchanged, added, removed, addedPlays, removedPlays } =
    report;

  let html = '<div class="merge-report">';
  html += '<div class="merge-report-grid">';
  html += `<span>🔄</span><span><strong>${updated.length}</strong> play${updated.length !== 1 ? "s" : ""} updated</span>`;
  html += `<span>➕</span><span><strong>${added.length}</strong> new play${added.length !== 1 ? "s" : ""} added</span>`;
  html += `<span>📌</span><span><strong>${unchanged.length}</strong> play${unchanged.length !== 1 ? "s" : ""} unchanged</span>`;
  if (removed.length > 0) {
    html += `<span>📁</span><span><strong>${removed.length}</strong> play${removed.length !== 1 ? "s" : ""} only in old playbook (kept)</span>`;
  }
  html += "</div>";

  const totalRefs =
    refCounts.wristbands + refCounts.scripts + refCounts.callsheet;
  if (totalRefs > 0) {
    html += '<div class="merge-report-section">';
    html += `<strong>🔗 ${totalRefs} reference${totalRefs !== 1 ? "s" : ""} updated:</strong><br>`;
    const parts = [];
    if (refCounts.wristbands) parts.push(`${refCounts.wristbands} in wristbands`);
    if (refCounts.scripts) parts.push(`${refCounts.scripts} in scripts`);
    if (refCounts.callsheet) parts.push(`${refCounts.callsheet} in call sheet`);
    html += "&nbsp;&nbsp;" + parts.join(", ");
    html += "</div>";
  }

  if (updated.length > 0) {
    html += '<details class="merge-report-details"><summary class="merge-report-summary">Updated plays</summary>';
    html += '<div class="merge-report-list merge-report-list--tall">';
    const shown = updated.slice(0, 20);
    for (const update of shown) {
      const play = existingPlays[update.ei];
      const name = (play.formation || "?") + " " + (play.play || "?");
      const fields = update.changes
        .slice(0, 4)
        .map((change) => change.field)
        .join(", ");
      const more = update.changes.length > 4 ? ", …" : "";
      html += `<div class="merge-report-row">• <strong>${escapeHtml(name)}</strong> — ${update.changes.length} field${update.changes.length !== 1 ? "s" : ""} <span class="merge-report-muted">(${escapeHtml(fields)}${more})</span></div>`;
    }
    if (updated.length > 20) {
      html += `<div class="merge-report-muted">…and ${updated.length - 20} more</div>`;
    }
    html += "</div></details>";
  }

  if (added.length > 0) {
    html += '<details class="merge-report-details"><summary class="merge-report-summary">New plays added</summary>';
    html += '<div class="merge-report-list merge-report-list--medium">';
    const shown = addedPlays.slice(0, 20);
    for (const play of shown) {
      html += `<div class="merge-report-row">• ${escapeHtml((play.formation || "?") + " " + (play.play || "?"))} (${escapeHtml(play.type || "?")})</div>`;
    }
    if (added.length > 20) {
      html += `<div class="merge-report-muted">…and ${added.length - 20} more</div>`;
    }
    html += "</div></details>";
  }

  if (removed.length > 0) {
    html += '<details class="merge-report-details"><summary class="merge-report-summary">Plays only in old playbook</summary>';
    html += '<div class="merge-report-list merge-report-list--medium">';
    html += '<div class="merge-report-muted-gap">These plays were not in the new CSV but have been kept in your playbook.</div>';
    const shown = removedPlays.slice(0, 20);
    for (const play of shown) {
      html += `<div class="merge-report-row">• ${escapeHtml((play.formation || "?") + " " + (play.play || "?"))} (${escapeHtml(play.type || "?")})</div>`;
    }
    if (removed.length > 20) {
      html += `<div class="merge-report-muted">…and ${removed.length - 20} more</div>`;
    }
    html += "</div></details>";
  }

  html += "</div>";
  return html;
}

function handleFileUpload(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;

    showLoadingOverlay("Importing playbook…");
    const reader = new FileReader();
    reader.onload = async function (loadEvent) {
      try {
        const text = loadEvent.target.result;
        const csvResult = parseCSV(text);
        const parsed = csvResult.plays || csvResult;
        const skippedRows = csvResult.skipped || [];

        if (parsed.length === 0) {
          hideLoadingOverlay();
          showToast(
            "❌ No valid plays found in file. Check the CSV format.",
            4000,
          );
          return;
        }

        const sample = parsed
          .slice(0, 3)
          .map(
            (play) =>
              `• ${escapeHtml(play.formation || "?")} ${escapeHtml(play.play || "?")} (${escapeHtml(play.type || "?")})`,
          )
          .join("<br>");

        const hasExisting = plays.length > 0;

        if (hasExisting) {
          const skipNote =
            skippedRows.length > 0
              ? ` <strong>(${skippedRows.length} row${skippedRows.length === 1 ? "" : "s"} skipped)</strong>`
              : "";
          const choiceMsg =
            `Found <strong>${parsed.length}</strong> play${parsed.length === 1 ? "" : "s"} in new CSV.${skipNote}<br>` +
            `Current playbook has <strong>${plays.length}</strong> plays.<br><br>` +
            `<em>Sample:</em><br>${sample}${parsed.length > 3 ? "<br>…" : ""}<br><br>` +
            `<strong>🔄 Smart Merge</strong> — Matches plays by name, updates changed fields, adds new plays. ` +
            `Keeps your wristband, script, and call sheet references in sync.<br><br>` +
            `<strong>🔁 Full Replace</strong> — Replaces entire playbook. Saved wristbands, scripts, and call sheets keep their old play data.`;

          const choice = await showChoice(choiceMsg, {
            title: "Import Playbook CSV",
            icon: "📋",
            choices: [
              { label: "Smart Merge", value: "merge", icon: "🔄" },
              { label: "Full Replace", value: "replace", icon: "🔁" },
              { label: "Cancel", value: "cancel" },
            ],
          });
          if (choice === "cancel" || !choice) return;

          if (choice === "merge") {
            const preMerge = plays.map((play) => ({ ...play }));
            const { merged, report } = _smartMerge(preMerge, parsed);
            const refCounts = _mergeUpdateRefs(preMerge, parsed, report);

            plays = merged;
            filteredPlays = [...plays];
            storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
            invalidateFilterCache();
            if (typeof renderTeamSettings === "function") renderTeamSettings();

            document.getElementById("uploadSection").classList.add("hidden");
            document.getElementById("mainApp").classList.remove("hidden");
            initAllModules();
            hideLoadingOverlay();

            const reportHtml = _buildMergeReportHtml(report, refCounts, preMerge);
            await showModal(reportHtml, {
              title: "Merge Complete",
              icon: "✅",
            });

            if (skippedRows.length > 0) {
              const skipMsg = skippedRows
                .slice(0, 5)
                .map((skipped) => `Row ${skipped.line}: ${escapeHtml(skipped.reason)}`)
                .join("<br>");
              const extra =
                skippedRows.length > 5
                  ? "<br>…and " + (skippedRows.length - 5) + " more"
                  : "";
              showModal(
                skippedRows.length +
                " row(s) were skipped:<br><br>" +
                skipMsg +
                extra,
                { title: "⚠️ Import Warnings", icon: "⚠️" },
              );
            }
            return;
          }

          const replaceOk = await showConfirm(
            `This will <strong>replace all ${plays.length} existing plays</strong> with ${parsed.length} new plays from the CSV.<br><br>` +
            `Saved wristbands, scripts, and call sheets will keep their old play data.<br><br>Continue?`,
            {
              title: "⚠️ Full Replace",
              icon: "⚠️",
              confirmText: "Replace All",
              danger: true,
            },
          );
          if (!replaceOk) return;
        } else {
          const msg = `Found <strong>${parsed.length}</strong> play${parsed.length === 1 ? "" : "s"}.${skippedRows.length > 0 ? " <strong>(" + skippedRows.length + " row" + (skippedRows.length === 1 ? "" : "s") + " skipped)</strong>" : ""}<br><br><em>Sample:</em><br>${sample}${parsed.length > 3 ? "<br>…" : ""}<br><br>Import these plays?`;
          const ok = await showConfirm(msg, {
            title: "Confirm CSV Import",
            icon: "📋",
            confirmText: `Import ${parsed.length} Plays`,
          });
          if (!ok) return;
        }

        plays = parsed;
        filteredPlays = [...plays];
        storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
        invalidateFilterCache();
        if (typeof renderTeamSettings === "function") renderTeamSettings();

        document.getElementById("uploadSection").classList.add("hidden");
        document.getElementById("mainApp").classList.remove("hidden");
        initAllModules();
        hideLoadingOverlay();

        if (skippedRows.length > 0) {
          const skipMsg = skippedRows
            .slice(0, 5)
            .map((skipped) => `Row ${skipped.line}: ${escapeHtml(skipped.reason)}`)
            .join("<br>");
          const extra =
            skippedRows.length > 5
              ? "<br>…and " + (skippedRows.length - 5) + " more"
              : "";
          showModal(
            skippedRows.length +
            " row(s) were skipped:<br><br>" +
            skipMsg +
            extra,
            { title: "⚠️ Import Warnings", icon: "⚠️" },
          );
        }
      } catch (err) {
        hideLoadingOverlay();
        console.error("handleFileUpload reader.onload error:", err);
        showToast("❌ Error reading file. Check format and try again.", {
          duration: 4000,
          type: "error",
        });
      }
    };
    reader.readAsText(file);
  } catch (err) {
    hideLoadingOverlay();
    console.error("handleFileUpload error:", err);
    showToast("❌ Error uploading file.", { duration: 4000, type: "error" });
  }
}

function showCSVTemplateModal() {
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay";

  const offenseHeaders = [
    ["PlayType", "Run / Pass / RPO / Screen", "Yes"],
    ["Personnel", "Personnel grouping (e.g. Blue, Red)", "Yes"],
    ["Formation", "Formation name", "Yes"],
    ["FormTag1", "Formation tag 1 (e.g. Rt, Lt)", ""],
    ["FormTag2", "Formation tag 2", ""],
    ["Under", "Under center / Shotgun / Pistol", ""],
    ["Back", "Backfield set (e.g. Strong, Weak)", ""],
    ["Shift", "Pre-snap shift", ""],
    ["Motion", "Motion call", ""],
    ["Protection", "Protection scheme", ""],
    ["LineCall", "O-Line call", ""],
    ["Play", "Full play call name", "Yes"],
    ["PlayTag1", "Play tag / modifier 1", ""],
    ["PlayTag2", "Play tag / modifier 2", ""],
    ["BasePlay", "Base concept (e.g. Inside Zone, Counter)", ""],
    ["OneWord", "One-word wristband call", ""],
    ["PreferredSituation", "Situation tag (e.g. Openers, Red Zone)", ""],
    ["PreferredDown", "Down preference (1, 2, 3, 4)", ""],
    ["PreferredDistance", "Distance preference (Short, Med, Long)", ""],
    ["PreferredHash", "Hash preference (L, M, R)", ""],
    ["PreferredFieldPosition", "Field position preference", ""],
    ["Tempo", "Tempo call (e.g. Freeze, Sugar, Fire)", ""],
    ["PracticeFront", "Practice rep front", ""],
    ["PracticeDefense", "Practice rep defense look", ""],
    ["PracticeCoverage", "Practice rep coverage", ""],
    ["PracticeBlitz", "Practice rep blitz", ""],
    ["PracticeStunt", "Practice rep stunt", ""],
    ["KeyPlayer1", "Key player to watch 1", ""],
    ["KeyPlayer2", "Key player to watch 2", ""],
    ["KeyPlayer3", "Key player to watch 3", ""],
    ["KeyPlayerName1", "Key player name 1", ""],
    ["KeyPlayerName2", "Key player name 2", ""],
    ["KeyPlayerName3", "Key player name 3", ""],
    ["Constraint1", "Constraint / complement 1", ""],
    ["Constraint2", "Constraint / complement 2", ""],
    ["Constraint3", "Constraint / complement 3", ""],
    ["HitChart1", "Hit chart tag 1", ""],
    ["HitChart2", "Hit chart tag 2", ""],
    ["HitChart3", "Hit chart tag 3", ""],
    ["DeadVs", "Killed vs this defense", ""],
    ["Opponent", "Opponent tag", ""],
    ["Notes", "Free-form notes", ""],
  ];

  const defenseHeaders = [
    ["Opponent", "Opponent name", "Yes"],
    ["Week", "Week number", ""],
    ["Game", "Game number or name", ""],
    ["Quarter", "Quarter (1-4, OT)", ""],
    ["Time", "Game clock time", ""],
    ["Down", "Down (1-4)", "Yes"],
    ["Distance", "Distance to go", "Yes"],
    ["Hash", "Hash (L, M, R)", ""],
    ["Field Position", "Field position zone", ""],
    ["Yard Line", "Yard line number", ""],
    ["Situation", "Situation tag (e.g. Red Zone, 2-min)", ""],
    ["Offense Play Type", "Off. play type scouted", ""],
    ["Offense Formation", "Off. formation scouted", ""],
    ["Def Front", "Defensive front called", "Yes"],
    ["Def Coverage", "Coverage called", "Yes"],
    ["Def Stunt", "Stunt called", ""],
    ["Def Blitz", "Blitz called", ""],
    ["Blitzer 1", "Blitzing player 1", ""],
    ["Blitzer 2", "Blitzing player 2", ""],
    ["Blitzer 3", "Blitzing player 3", ""],
    ["Tackler 1", "Tackler 1", ""],
    ["Tackler 2", "Tackler 2", ""],
    ["Tackler 3", "Tackler 3", ""],
    ["Front Strength Direction", "Direction of front strength", ""],
    ["Coverage Strength Direction", "Direction of coverage strength", ""],
    ["Person Of Interest 1 Direction", "POI 1 alignment direction", ""],
    ["Person of Interest 2 Direction", "POI 2 alignment direction", ""],
    ["Person of Interest 3 Direction", "POI 3 alignment direction", ""],
    ["Turnover", "Turnover (Y/N)", ""],
    ["Turnover Forcer", "Player who forced turnover", ""],
    ["Turnover Player", "Player who committed turnover", ""],
    ["Tackle for Loss Player", "TFL player", ""],
    ["Penalty", "Penalty (Y/N)", ""],
    ["Penalty Player", "Penalty player", ""],
    ["Notes", "Free-form notes", ""],
  ];

  function buildTable(headers) {
    const rows = headers
      .map(([column, desc, req]) => {
        const badge = req ? '<span class="csv-tpl-req">Required</span>' : "";
        return `<tr><td class="csv-tpl-col">${column}</td><td class="csv-tpl-desc">${desc}</td><td class="csv-tpl-center">${badge}</td></tr>`;
      })
      .join("");
    return `<table class="csv-tpl-table">
      <thead><tr><th>Column Header</th><th>Description</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  overlay.innerHTML = `
    <div class="custom-modal csv-tpl-modal" role="dialog" aria-modal="true" aria-labelledby="csvTplTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">📋</span>
        <h3 class="custom-modal-title" id="csvTplTitle">CSV Column Templates</h3>
      </div>
      <div class="custom-modal-body csv-tpl-body">
        <div class="csv-tpl-section">
          <div class="csv-tpl-section-header">
            <h4>🏈 Offensive Playbook</h4>
            <button class="btn btn-sm btn-primary" data-action="downloadCSVTemplate" data-arg="offense">⬇ Download Template</button>
          </div>
          <p class="csv-tpl-note">39 columns — used by Playbook, Script, Wristband, Call Sheet & Installation.</p>
          ${buildTable(offenseHeaders)}
        </div>
        <div class="csv-tpl-section">
          <div class="csv-tpl-section-header">
            <h4>🛡️ Defensive Tendencies</h4>
            <button class="btn btn-sm btn-primary" data-action="downloadCSVTemplate" data-arg="defense">⬇ Download Template</button>
          </div>
          <p class="csv-tpl-note">35 columns — imported on the Def Tendencies tab.</p>
          ${buildTable(defenseHeaders)}
        </div>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-primary custom-modal-btn" id="csvTplOk">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  const okBtn = overlay.querySelector("#csvTplOk");
  okBtn.focus();

  function close() {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  }
  okBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      close();
    }
  });
}

function downloadCSVTemplate(type) {
  try {
    let headers;
    let filename;
    if (type === "offense") {
      headers = [
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
      filename = "offensive_playbook_template.csv";
    } else {
      headers = [
        "Opponent",
        "Week",
        "Game",
        "Quarter",
        "Time",
        "Down",
        "Distance",
        "Hash",
        "Field Position",
        "Yard Line",
        "Situation",
        "Offense Play Type",
        "Offense Formation",
        "Def Front",
        "Def Coverage",
        "Def Stunt",
        "Def Blitz",
        "Blitzer 1",
        "Blitzer 2",
        "Blitzer 3",
        "Tackler 1",
        "Tackler 2",
        "Tackler 3",
        "Front Strength Direction",
        "Coverage Strength Direction",
        "Person Of Interest 1 Direction",
        "Person of Interest 2 Direction",
        "Person of Interest 3 Direction",
        "Turnover",
        "Turnover Forcer",
        "Turnover Player",
        "Tackle for Loss Player",
        "Penalty",
        "Penalty Player",
        "Notes",
      ];
      filename = "defensive_tendencies_template.csv";
    }
    const csv = headers.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`⬇️ Downloaded ${filename}`);
  } catch (err) {
    console.error("downloadCSVTemplate error:", err);
    showToast("❌ Error creating template.", { duration: 3000, type: "error" });
  }
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
