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

function toggleColumnMenu() {
  const menu = document.getElementById("columnMenu");
  menu.classList.toggle("show");
}

function hideColumnMenu() {
  const menu = document.getElementById("columnMenu");
  if (menu) menu.classList.remove("show");
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