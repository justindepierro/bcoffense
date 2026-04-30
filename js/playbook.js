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
  renderPlaybook();
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
    secondarySortDirection =
      secondarySortDirection === "asc" ? "desc" : "asc";
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
  }
  if (secondaryDir) {
    secondaryDir.innerHTML =
      secondarySortDirection === "asc" ? "&#9650;" : "&#9660;";
    secondaryDir.classList.toggle("desc", secondarySortDirection === "desc");
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
  const isType = group.id === "pbChipsType";
  const set = isType ? activeTypeChips : activePersonnelChips;
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

// ── Playbook search: self-contained listener (belt-and-suspenders) ──
document.addEventListener("DOMContentLoaded", () => {
  const _pbSearch = document.getElementById("searchPlay");
  if (_pbSearch) {
    _pbSearch.addEventListener("input", () => filterPlays());
  }
});
