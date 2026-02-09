// Playbook viewer functionality

// Sorting state
let currentSortColumn = null;
let currentSortDirection = "asc";
let selectedRowIndex = -1;

// Storage key for persisting filter/sort state
const PLAYBOOK_STATE_KEY = "playbookState";

/**
 * Apply current sort to filteredPlays (without toggling direction)
 */
function applyCurrentSort() {
  if (!currentSortColumn) return;

  filteredPlays.sort((a, b) => {
    let valA, valB;

    // Handle special 'install' column — numeric sort by star %
    if (currentSortColumn === "install") {
      const rA =
        typeof getPlayInstallRating === "function"
          ? getPlayInstallRating(a)
          : { stars: 0, maxStars: 0 };
      const rB =
        typeof getPlayInstallRating === "function"
          ? getPlayInstallRating(b)
          : { stars: 0, maxStars: 0 };
      valA = rA.maxStars > 0 ? rA.stars / rA.maxStars : -1;
      valB = rB.maxStars > 0 ? rB.stars / rB.maxStars : -1;
      if (valA < valB) return currentSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return currentSortDirection === "asc" ? 1 : -1;
      return 0;
    }

    // Handle special 'tags' column (combined field)
    if (currentSortColumn === "tags") {
      valA = [a.formTag1, a.formTag2].filter(Boolean).join(", ") || "";
      valB = [b.formTag1, b.formTag2].filter(Boolean).join(", ") || "";
    } else {
      valA = a[currentSortColumn] || "";
      valB = b[currentSortColumn] || "";
    }

    // Case-insensitive string comparison
    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();

    if (valA < valB) return currentSortDirection === "asc" ? -1 : 1;
    if (valA > valB) return currentSortDirection === "asc" ? 1 : -1;
    return 0;
  });
}

/**
 * Sort the playbook table by a column (toggles direction on same column)
 */
function sortPlaybook(column) {
  // Toggle direction if same column, otherwise reset to ascending
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    currentSortColumn = column;
    currentSortDirection = "asc";
  }

  // Update sort icons
  document.querySelectorAll("#playbookTable .sort-icon").forEach((icon) => {
    icon.classList.remove("asc", "desc");
  });
  const activeIcon = document.querySelector(
    `#playbookTable .sort-icon[data-col="${column}"]`,
  );
  if (activeIcon) {
    activeIcon.classList.add(currentSortDirection);
  }

  // Apply the sort
  applyCurrentSort();
  renderPlaybook();
}

/**
 * Populate filter dropdowns with unique values from plays
 */
function populateFilters() {
  const types = [...new Set(plays.map((p) => p.type))].filter(Boolean).sort();
  const formations = [...new Set(plays.map((p) => p.formation))]
    .filter(Boolean)
    .sort();
  const basePlays = [...new Set(plays.map((p) => p.basePlay))]
    .filter(Boolean)
    .sort();

  // Playbook filters
  const typeFilter = document.getElementById("filterType");
  typeFilter.innerHTML =
    '<option value="">All Play Types</option>' +
    types.map((t) => `<option value="${t}">${t}</option>`).join("");

  const formFilter = document.getElementById("filterFormation");
  formFilter.innerHTML =
    '<option value="">All Formations</option>' +
    formations.map((f) => `<option value="${f}">${f}</option>`).join("");

  const baseFilter = document.getElementById("filterBasePlay");
  baseFilter.innerHTML =
    '<option value="">All Base Plays</option>' +
    basePlays.map((b) => `<option value="${b}">${b}</option>`).join("");

  // Script builder filters (dropdowns only - checkboxes populated separately)
  const scriptFormFilter = document.getElementById("scriptFilterFormation");
  scriptFormFilter.innerHTML =
    '<option value="">All Formations</option>' +
    formations.map((f) => `<option value="${f}">${f}</option>`).join("");

  const scriptBaseFilter = document.getElementById("scriptFilterBasePlay");
  scriptBaseFilter.innerHTML =
    '<option value="">All Base Plays</option>' +
    basePlays.map((b) => `<option value="${b}">${b}</option>`).join("");

  // Populate script checkbox filters
  populateScriptCheckboxFilters();

  // Wristband filters
  const wbTypeFilter = document.getElementById("wbFilterType");
  wbTypeFilter.innerHTML =
    '<option value="">All Play Types</option>' +
    types.map((t) => `<option value="${t}">${t}</option>`).join("");

  // Populate wristband highlight dropdown
  populateWristbandHighlightDropdown();
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
  const wb = saved[parseInt(wbIdx)];

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
 * Filter plays based on selected criteria and render table
 */
function filterPlays() {
  const type = document.getElementById("filterType").value;
  const formation = document.getElementById("filterFormation").value;
  const basePlay = document.getElementById("filterBasePlay").value;
  const search = document.getElementById("searchPlay").value.toLowerCase();

  filteredPlays = plays.filter((p) => {
    if (type && p.type !== type) return false;
    if (formation && p.formation !== formation) return false;
    if (basePlay && p.basePlay !== basePlay) return false;
    if (search) {
      const searchFields = [
        p.play,
        p.formation,
        p.protection,
        p.motion,
        p.shift,
        p.back,
      ]
        .join(" ")
        .toLowerCase();
      if (!searchFields.includes(search)) return false;
    }
    return true;
  });

  // Re-apply current sort if active
  applyCurrentSort();
  renderPlaybook();
}

/**
 * Clear all playbook filters
 */
function clearFilters() {
  document.getElementById("filterType").value = "";
  document.getElementById("filterFormation").value = "";
  document.getElementById("filterBasePlay").value = "";
  document.getElementById("searchPlay").value = "";
  filteredPlays = [...plays];

  // Reset sort state
  currentSortColumn = null;
  currentSortDirection = "asc";
  selectedRowIndex = -1;
  document.querySelectorAll("#playbookTable .sort-icon").forEach((icon) => {
    icon.classList.remove("asc", "desc");
  });

  // Clear saved state
  localStorage.removeItem(PLAYBOOK_STATE_KEY);

  renderPlaybook();
}

/**
 * Render the playbook table with filtered plays
 */
function renderPlaybook() {
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

/**
 * Show a toast notification
 */
function showToast(message, duration = 2000) {
  // Remove existing toast
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add("show"), 10);

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Save playbook filter/sort state to localStorage
 */
function savePlaybookState() {
  const state = {
    filterType: document.getElementById("filterType")?.value || "",
    filterFormation: document.getElementById("filterFormation")?.value || "",
    filterBasePlay: document.getElementById("filterBasePlay")?.value || "",
    searchPlay: document.getElementById("searchPlay")?.value || "",
    sortColumn: currentSortColumn,
    sortDirection: currentSortDirection,
  };
  storageManager.set(PLAYBOOK_STATE_KEY, state);
}

/**
 * Restore playbook filter/sort state from localStorage
 */
function restorePlaybookState() {
  const state = storageManager.get(PLAYBOOK_STATE_KEY, null);
  if (!state) return;

  // Restore filters
  if (state.filterType)
      document.getElementById("filterType").value = state.filterType;
    if (state.filterFormation)
      document.getElementById("filterFormation").value = state.filterFormation;
    if (state.filterBasePlay)
      document.getElementById("filterBasePlay").value = state.filterBasePlay;
    if (state.searchPlay)
      document.getElementById("searchPlay").value = state.searchPlay;

    // Restore sort
    if (state.sortColumn) {
      currentSortColumn = state.sortColumn;
      currentSortDirection = state.sortDirection || "asc";
    }
}

/**
 * Initialize keyboard navigation for playbook
 */
function initPlaybookKeyboard() {
  const container = document.getElementById("playbookContainer");
  if (!container) return;

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

  // Global keyboard listener for shortcuts
  document.addEventListener("keydown", (e) => {
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
  });
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
  return safeText.replace(
    regex,
    '<span class="search-highlight">$1</span>',
  );
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
  storageManager.set("columnVisibility", columnVisibility);
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
  const savedVis = storageManager.get("columnVisibility", null);
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
