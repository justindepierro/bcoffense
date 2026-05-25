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

const PB_BALANCE_DIMENSIONS = [
  { key: "personnel", label: "Personnel", empty: "No Personnel" },
  { key: "formation", label: "Formation", empty: "No Formation" },
  { key: "basePlay", label: "Concept", empty: "No Base Play" },
];

function _pbBalanceHasActiveFilters() {
  const checkedIds = ["pbGamePlanFilter", "pbJvFilter"];
  const selectIds = [
    "filterFormation",
    "filterBasePlay",
    "pbFilterBack",
    "pbFilterMotion",
    "pbFilterProtection",
    "pbFilterTempo",
  ];
  return (
    (typeof activeTypeChips !== "undefined" && activeTypeChips.size > 0) ||
    (typeof activePersonnelChips !== "undefined" && activePersonnelChips.size > 0) ||
    (typeof activePictureChips !== "undefined" && activePictureChips.size > 0) ||
    checkedIds.some((id) => document.getElementById(id)?.checked) ||
    selectIds.some((id) => document.getElementById(id)?.value) ||
    Boolean(document.getElementById("searchPlay")?.value?.trim())
  );
}

function _pbBalanceScope() {
  const hasFilters = _pbBalanceHasActiveFilters();
  const source = hasFilters
    ? Array.isArray(filteredPlays) ? filteredPlays : []
    : Array.isArray(plays) ? plays : [];
  return {
    plays: source.filter(Boolean),
    label: hasFilters ? "Current View" : "Full Playbook",
    detail: hasFilters
      ? `${source.length} of ${Array.isArray(plays) ? plays.length : 0} plays`
      : `${source.length} plays`,
    hasFilters,
  };
}

function _pbBalanceTypeFamily(play) {
  const type = String(play?.type || "").trim().toLowerCase();
  if (!type) return "Other";
  if (type === "run" || type === "run option") return "Run";
  if (["pass", "quick", "screen", "play action"].includes(type)) return "Pass";
  if (type === "rpo") return "RPO";
  return play.type || "Other";
}

function _pbBalanceRowName(play, def) {
  const raw = play?.[def.key];
  const value = String(raw || "").trim();
  return value || def.empty;
}

function _pbBalanceRows(source, def) {
  const map = new Map();
  source.forEach((play) => {
    const name = _pbBalanceRowName(play, def);
    if (!map.has(name)) {
      map.set(name, {
        name,
        count: 0,
        families: { Run: 0, Pass: 0, RPO: 0, Other: 0 },
      });
    }
    const row = map.get(name);
    row.count += 1;
    const family = _pbBalanceTypeFamily(play);
    row.families[family] = (row.families[family] || 0) + 1;
  });
  return Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

function _pbBalanceAnalyze(source) {
  const total = source.length;
  const dimensions = PB_BALANCE_DIMENSIONS.map((def) => {
    const rows = _pbBalanceRows(source, def);
    const top = rows[0] || null;
    const emptyRow = rows.find((row) => row.name === def.empty) || null;
    const singletonCount = rows.filter((row) => row.count === 1).length;
    return {
      ...def,
      rows,
      top,
      emptyCount: emptyRow ? emptyRow.count : 0,
      singletonCount,
      uniqueCount: rows.length,
    };
  });
  const typeRows = _pbBalanceRows(source, {
    key: "type",
    label: "Play Type",
    empty: "No Type",
  });
  return { total, dimensions, typeRows };
}

function _pbBalancePct(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

function _pbBalanceTopLabel(section) {
  if (!section?.top) return "None";
  return `${section.top.name} (${_pbBalancePct(section.top.count, section.rows.reduce((sum, row) => sum + row.count, 0))}%)`;
}

function _pbBalanceSignals(analysis) {
  const signals = [];
  analysis.dimensions.forEach((section) => {
    const topPct = section.top ? _pbBalancePct(section.top.count, analysis.total) : 0;
    if (topPct >= 40) {
      signals.push(
        `${section.label} leans heavy toward ${section.top.name} at ${topPct}% of this scope.`,
      );
    }
    if (section.emptyCount > 0) {
      signals.push(
        `${section.emptyCount} play${section.emptyCount === 1 ? "" : "s"} missing ${section.label.toLowerCase()} data.`,
      );
    }
    if (section.singletonCount >= 5 && section.singletonCount >= section.uniqueCount * 0.35) {
      signals.push(
        `${section.label} menu is wide: ${section.singletonCount} one-off value${section.singletonCount === 1 ? "" : "s"}.`,
      );
    }
  });
  if (signals.length === 0) {
    signals.push("No obvious personnel, formation, or concept concentration warnings in this scope.");
  }
  return signals;
}

function _pbBalanceFamilyTags(row) {
  const entries = Object.entries(row.families || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  return entries
    .map(([label, count]) => `<span>${escapeHtml(label)} ${count}</span>`)
    .join("");
}

function _pbBalanceRenderRows(section, total) {
  if (!section.rows.length) {
    return '<div class="pb-balance-empty">No plays in this scope.</div>';
  }
  return section.rows
    .slice(0, 10)
    .map((row) => {
      const pct = _pbBalancePct(row.count, total);
      return `
        <div class="pb-balance-row">
          <div class="pb-balance-row-main">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${row.count} play${row.count === 1 ? "" : "s"} • ${pct}%</span>
          </div>
          <div class="pb-balance-meter" style="--bar-width:${pct}%"><i></i></div>
          <div class="pb-balance-tags">${_pbBalanceFamilyTags(row)}</div>
        </div>
      `;
    })
    .join("");
}

function _pbBalanceRenderSection(section, total) {
  const topPct = section.top ? _pbBalancePct(section.top.count, total) : 0;
  return `
    <section class="pb-balance-section">
      <div class="pb-balance-section-head">
        <h4>${escapeHtml(section.label)}</h4>
        <span>${section.uniqueCount} unique • top ${topPct}%</span>
      </div>
      ${_pbBalanceRenderRows(section, total)}
    </section>
  `;
}

function openPlaybookBalanceReport() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }

  const scope = _pbBalanceScope();
  const analysis = _pbBalanceAnalyze(scope.plays);
  const [personnel, formation, concept] = analysis.dimensions;
  const signals = _pbBalanceSignals(analysis);

  document.getElementById("playbookBalanceOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookBalanceOverlay";
  overlay.dataset.action = "closePlaybookBalanceReportOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-balance-modal" role="dialog" aria-modal="true" aria-labelledby="playbookBalanceTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">📊</span>
        <h3 class="custom-modal-title" id="playbookBalanceTitle">Playbook Balance</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookBalanceReport">×</button>
      </div>
      <div class="custom-modal-body pb-balance-body">
        <div class="pb-balance-summary">
          <div class="pb-balance-card">
            <strong>${escapeHtml(scope.label)}</strong>
            <span>${escapeHtml(scope.detail)}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${escapeHtml(_pbBalanceTopLabel(personnel))}</strong>
            <span>Top Personnel</span>
          </div>
          <div class="pb-balance-card">
            <strong>${escapeHtml(_pbBalanceTopLabel(formation))}</strong>
            <span>Top Formation</span>
          </div>
          <div class="pb-balance-card">
            <strong>${escapeHtml(_pbBalanceTopLabel(concept))}</strong>
            <span>Top Concept</span>
          </div>
        </div>
        <div class="pb-balance-guidance">
          ${signals.map((signal) => `<div>${escapeHtml(signal)}</div>`).join("")}
        </div>
        <div class="pb-balance-grid">
          ${analysis.dimensions.map((section) => _pbBalanceRenderSection(section, analysis.total)).join("")}
        </div>
        <section class="pb-balance-section">
          <div class="pb-balance-section-head">
            <h4>Play Type Mix</h4>
            <span>${analysis.typeRows.length} types</span>
          </div>
          ${_pbBalanceRenderRows({ rows: analysis.typeRows }, analysis.total)}
        </section>
      </div>
      <div class="custom-modal-actions">
        ${scope.hasFilters ? '<button type="button" class="btn btn-sm" data-action="clearPlaybookBalanceFilters">Clear Playbook Filters</button>' : ""}
        <button type="button" class="btn btn-sm" data-action="closePlaybookBalanceReport">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closePlaybookBalanceReport() {
  const overlay = document.getElementById("playbookBalanceOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function clearPlaybookBalanceFilters() {
  if (typeof clearFilters === "function") clearFilters();
  closePlaybookBalanceReport();
  requestAnimationFrame(() => openPlaybookBalanceReport());
}
