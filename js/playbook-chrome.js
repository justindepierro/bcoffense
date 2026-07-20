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

const PLAYBOOK_COLUMNS = [
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

const PLAYBOOK_HEADER_SELECTORS = {
  install: '#playbookTable thead th[data-arg="install"]',
  type: '#playbookTable thead th[data-arg="type"]',
  formation: '#playbookTable thead th[data-arg="formation"]',
  tags: '#playbookTable thead th[data-arg="tags"]',
  back: '#playbookTable thead th[data-arg="back"]',
  motion: '#playbookTable thead th[data-arg="motion"]',
  protection: '#playbookTable thead th[data-arg="protection"]',
  play: '#playbookTable thead th[data-arg="play"]',
  basePlay: '#playbookTable thead th[data-arg="basePlay"]',
  tempo: '#playbookTable thead th[data-arg="tempo"]',
};

function _toggleColumnCells(column, hidden) {
  const header = document.querySelector(PLAYBOOK_HEADER_SELECTORS[column]);
  if (header) header.classList.toggle("hidden", hidden);
  document.querySelectorAll(`#playbookTable .col-${column}`).forEach((cell) => {
    cell.classList.toggle("hidden", hidden);
  });
}

function toggleColumn(column) {
  columnVisibility[column] = !columnVisibility[column];
  applyColumnVisibility();
  storageManager.set(STORAGE_KEYS.COLUMN_VISIBILITY, columnVisibility);
}

function applyColumnVisibility() {
  PLAYBOOK_COLUMNS.forEach((column) => {
    _toggleColumnCells(column, !columnVisibility[column]);
  });
}

function restoreColumnVisibility() {
  try {
    const savedVis = storageManager.get(STORAGE_KEYS.COLUMN_VISIBILITY, null);
    if (savedVis) {
      Object.assign(columnVisibility, savedVis);
      const menu = document.getElementById("columnMenu");
      if (menu) {
        const checkboxes = menu.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach((cb, idx) => {
          cb.checked = columnVisibility[PLAYBOOK_COLUMNS[idx]];
        });
      }
    }
    applyColumnVisibility();
  } catch (err) {
    console.error("restoreColumnVisibility error:", err);
  }
}

function resetColumnVisibility() {
  PLAYBOOK_COLUMNS.forEach((col) => {
    columnVisibility[col] = true;
  });
  storageManager.remove(STORAGE_KEYS.COLUMN_VISIBILITY);
  applyColumnVisibility();
  const menu = document.getElementById("columnMenu");
  if (menu) {
    menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
  }
  showToast("Columns reset to default");
}

function toggleColumnMenu() {
  const wrap = document.querySelector(".column-toggle.tool-menu-wrap");
  if (wrap) {
    const willOpen = !wrap.classList.contains("open");
    if (willOpen) {
      wrap.classList.add("open");
      if (typeof positionAnchoredMenu === "function") positionAnchoredMenu(wrap);
    } else {
      if (typeof closeAnchoredMenu === "function") closeAnchoredMenu(wrap);
      else wrap.classList.remove("open");
    }
  }
}

// ── Playbook filter drawer ──
let _pbFilterDrawerOpen = false;

// One entry point for the compact filter button. Players stay in the
// player-safe filter sheet; staff retain the full playbook filter drawer.
function openPlaybookFilters() {
  const authRole = document.body?.dataset?.authRole || "";
  if (authRole === "player" && typeof openPlayerPlaybookFilters === "function") {
    openPlayerPlaybookFilters();
    return;
  }
  togglePbFilterDrawer();
}

function togglePbFilterDrawer() {
  _pbFilterDrawerOpen = !_pbFilterDrawerOpen;
  _applyPbFilterDrawerState();
}

function closePbFilterDrawer() {
  _pbFilterDrawerOpen = false;
  _applyPbFilterDrawerState();
}

function filterByTypeStat(type) {
  if (!type) return;
  const isNowActive = !activeTypeChips.has(type);
  if (isNowActive) {
    activeTypeChips.add(type);
  } else {
    activeTypeChips.delete(type);
  }
  if (typeof _setPbChipActive === "function") {
    _setPbChipActive("pbChipsType", type, isNowActive);
  }
  if (typeof invalidateStatsBarCache === "function") invalidateStatsBarCache();
  if (typeof filterPlays === "function") filterPlays();
}

function _applyPbFilterDrawerState() {
  const panel = document.getElementById("playbook");
  const drawer = document.getElementById("pbFilterDrawer");
  const btn = document.getElementById("pbFilterToggleBtn");
  if (!panel || !drawer) return;
  panel.classList.toggle("pb-filter-open", _pbFilterDrawerOpen);
  drawer.toggleAttribute("inert", !_pbFilterDrawerOpen);
  if (btn) btn.setAttribute("aria-pressed", _pbFilterDrawerOpen ? "true" : "false");
}

// ── Playbook phone action sheet ──
let _pbActionSheetOpen = false;

function togglePbActionSheet() {
  if (_pbActionSheetOpen) closePbActionSheet();
  else openPbActionSheet();
}

function openPbActionSheet() {
  const sheet = document.getElementById("pbActionSheet");
  const backdrop = document.getElementById("pbActionSheetBackdrop");
  const toggle = document.getElementById("pbActionSheetToggle");
  if (!sheet) return;
  _pbActionSheetOpen = true;
  sheet.removeAttribute("inert");
  sheet.classList.add("open");
  backdrop?.classList.add("visible");
  toggle?.setAttribute("aria-expanded", "true");
  if (!sheet.dataset.autoCloseBound) {
    sheet.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (!btn || btn.dataset.action === "closePbActionSheet") return;
      closePbActionSheet();
    });
    sheet.dataset.autoCloseBound = "true";
  }
  if (typeof openLayer === "function")
    openLayer(sheet, { id: "pb-action-sheet", exclusive: false });
}

function closePbActionSheet() {
  const sheet = document.getElementById("pbActionSheet");
  const backdrop = document.getElementById("pbActionSheetBackdrop");
  const toggle = document.getElementById("pbActionSheetToggle");
  _pbActionSheetOpen = false;
  if (sheet) {
    sheet.classList.remove("open");
    sheet.setAttribute("inert", "");
  }
  backdrop?.classList.remove("visible");
  toggle?.setAttribute("aria-expanded", "false");
  if (typeof closeLayer === "function") closeLayer("pb-action-sheet");
}

function hideColumnMenu() {
  const wrap = document.querySelector(".column-toggle.tool-menu-wrap");
  if (wrap && typeof closeAnchoredMenu === "function") {
    closeAnchoredMenu(wrap);
  } else {
    const menu = document.getElementById("columnMenu");
    if (menu) menu.classList.remove("show");
  }
}

function showKeyboardShortcuts() {
  document.getElementById("shortcutsModal").classList.add("show");
}

function hideKeyboardShortcuts() {
  const modal = document.getElementById("shortcutsModal");
  if (modal) modal.classList.remove("show");
}

let previewTimeout = null;

function showPlayPreview(event, index) {
  if (previewTimeout) {
    clearTimeout(previewTimeout);
  }

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

    let left = event.clientX + 15;
    let top = event.clientY + 10;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.add("show");

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

function hidePlayPreview() {
  if (previewTimeout) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
  const tooltip = document.getElementById("playPreviewTooltip");
  if (tooltip) tooltip.classList.remove("show");
}


// ── #110: Bulk Add Filtered Plays to Week Destination ────────────────────
async function bulkAddFilteredToWeek() {
  const count = Array.isArray(filteredPlays) ? filteredPlays.length : 0;
  if (!count) { showToast("No plays in current filter to add", { type: "warning" }); return; }
  const destinations = [
    { label: `📋 Practice Script (${count} plays)`, value: "script" },
    { label: `🎯 Game Plan (${count} plays)`, value: "gameplan" },
    { label: `📄 Call Sheet (${count} plays)`, value: "callsheet" },
    { label: `🏈 Wristband (${count} plays)`, value: "wristband" },
  ];
  const dest = await showListPicker(`Send ${count} filtered plays to:`, destinations, {
    title: "Add All Filtered to Week",
    icon: "⊕",
  });
  if (!dest) return;
  if (dest === "script") {
    if (typeof addToScript !== "function") {
      if (typeof showTab === "function") showTab("script");
      showToast("Use Available Plays to add them to the script");
      return;
    }
    let added = 0;
    for (const play of filteredPlays) {
      const idx = Array.isArray(plays) ? plays.indexOf(play) : -1;
      if (idx >= 0) { await addToScript(idx); added++; }
    }
    showToast(`${added} play${added === 1 ? "" : "s"} added to Script`, {
      type: "success", duration: 3500,
      actionLabel: "→ Script", action: () => typeof showTab === "function" && showTab("script"),
    });
  } else if (dest === "gameplan") {
    if (typeof showTab === "function") showTab("gameplan");
    showToast(`Select boxes in Game Plan to assign these ${count} plays`, { duration: 4000 });
  } else if (dest === "callsheet") {
    if (typeof showTab === "function") showTab("callsheet");
    showToast(`Use the call sheet picker to place these ${count} plays`, { duration: 3500 });
  } else if (dest === "wristband") {
    if (typeof showTab === "function") showTab("wristband");
    showToast(`Use Library search to find and add these ${count} plays`, { duration: 3500 });
  }
}
