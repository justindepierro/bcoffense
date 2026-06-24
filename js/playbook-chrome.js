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

// ── Playbook filter drawer ──
let _pbFilterDrawerOpen = false;

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

const PB_SITUATION_DOWNS = ["1", "2", "3", "4"];
const PB_SITUATION_DISTANCES = ["Short", "Medium", "Long"];
const PB_SITUATION_FIELD_ZONES = [
  "Green",
  "Lo-RZ",
  "Hi-RZ",
  "Goal Line",
  "Backed Up",
  "Saigon",
];

function _pbSituationClean(value) {
  return String(value || "").trim();
}

function _pbSituationNormalizeDown(value) {
  const raw = _pbSituationClean(value);
  const lower = raw.toLowerCase();
  if (!raw) return "No Down";
  if (/^(1|1st|first)\b/.test(lower)) return "1";
  if (/^(2|2nd|second)\b/.test(lower)) return "2";
  if (/^(3|3rd|third)\b/.test(lower)) return "3";
  if (/^(4|4th|fourth)\b/.test(lower)) return "4";
  return raw;
}

function _pbSituationNormalizeDistance(value) {
  const raw = _pbSituationClean(value);
  const lower = raw.toLowerCase();
  if (!raw) return "No Distance";
  if (lower.includes("short") || lower === "s" || lower === "1-3") return "Short";
  if (lower.includes("medium") || lower === "m" || lower === "4-6") return "Medium";
  if (lower.includes("long") || lower === "l" || lower === "7+") return "Long";
  return raw;
}

function _pbSituationNormalizeField(value) {
  const raw = _pbSituationClean(value);
  const lower = raw.toLowerCase().replace(/[\s_-]+/g, " ");
  if (!raw) return "No Field Zone";
  if (lower === "lo rz" || lower === "low rz" || lower === "low red zone") return "Lo-RZ";
  if (lower === "hi rz" || lower === "high rz" || lower === "high red zone") return "Hi-RZ";
  if (lower === "goal line" || lower === "goalline") return "Goal Line";
  if (lower === "backed up" || lower === "backedup") return "Backed Up";
  const known = PB_SITUATION_FIELD_ZONES.find((zone) => zone.toLowerCase() === lower);
  return known || raw;
}

function _pbSituationNormalizeTempo(value) {
  return _pbSituationClean(value) || "No Tempo";
}

function _pbSituationFieldFilled(label) {
  return !String(label || "").startsWith("No ");
}

function _pbSituationAddCount(map, key, play) {
  if (!map.has(key)) {
    map.set(key, {
      name: key,
      count: 0,
      families: { Run: 0, Pass: 0, RPO: 0, Other: 0 },
    });
  }
  const row = map.get(key);
  row.count += 1;
  const family = _pbBalanceTypeFamily(play);
  row.families[family] = (row.families[family] || 0) + 1;
  return row;
}

function _pbSituationRowsFromMap(map, preferredOrder = []) {
  const orderIndex = new Map(preferredOrder.map((value, index) => [value, index]));
  return Array.from(map.values()).sort((a, b) => {
    const aOrder = orderIndex.has(a.name) ? orderIndex.get(a.name) : 999;
    const bOrder = orderIndex.has(b.name) ? orderIndex.get(b.name) : 999;
    return aOrder - bOrder || b.count - a.count || a.name.localeCompare(b.name);
  });
}

function _pbSituationAnalyze(source) {
  const total = source.length;
  const downMap = new Map();
  const distanceMap = new Map();
  const fieldMap = new Map();
  const tempoMap = new Map();
  const ddMap = new Map();
  const fieldDownMap = new Map();
  const fillCounts = { down: 0, distance: 0, field: 0, tempo: 0 };

  source.forEach((play) => {
    const down = _pbSituationNormalizeDown(play.preferredDown);
    const distance = _pbSituationNormalizeDistance(play.preferredDistance);
    const field = _pbSituationNormalizeField(play.preferredFieldPosition);
    const tempo = _pbSituationNormalizeTempo(play.tempo);

    if (_pbSituationFieldFilled(down)) fillCounts.down += 1;
    if (_pbSituationFieldFilled(distance)) fillCounts.distance += 1;
    if (_pbSituationFieldFilled(field)) fillCounts.field += 1;
    if (_pbSituationFieldFilled(tempo)) fillCounts.tempo += 1;

    _pbSituationAddCount(downMap, down, play);
    _pbSituationAddCount(distanceMap, distance, play);
    _pbSituationAddCount(fieldMap, field, play);
    _pbSituationAddCount(tempoMap, tempo, play);
    _pbSituationAddCount(ddMap, `${down}|${distance}`, play);
    _pbSituationAddCount(fieldDownMap, `${field}|${down}`, play);
  });

  const downRows = _pbSituationRowsFromMap(downMap, [...PB_SITUATION_DOWNS, "No Down"]);
  const distanceRows = _pbSituationRowsFromMap(distanceMap, [...PB_SITUATION_DISTANCES, "No Distance"]);
  const fieldRows = _pbSituationRowsFromMap(fieldMap, [...PB_SITUATION_FIELD_ZONES, "No Field Zone"]);
  const tempoRows = _pbSituationRowsFromMap(tempoMap);

  const expectedDdCells = PB_SITUATION_DOWNS.length * PB_SITUATION_DISTANCES.length;
  const coveredDdCells = PB_SITUATION_DOWNS.reduce((sum, down) => (
    sum + PB_SITUATION_DISTANCES.filter((distance) => ddMap.has(`${down}|${distance}`)).length
  ), 0);
  const coveredFieldZones = PB_SITUATION_FIELD_ZONES.filter((field) => fieldMap.has(field)).length;

  return {
    total,
    fillCounts,
    downRows,
    distanceRows,
    fieldRows,
    tempoRows,
    ddMap,
    fieldDownMap,
    expectedDdCells,
    coveredDdCells,
    coveredFieldZones,
  };
}

function _pbSituationSignals(analysis) {
  const signals = [];
  if (!analysis.total) {
    return ["No plays in this scope. Clear filters or import plays to review situation coverage."];
  }

  const missing = [
    ["down", "preferred down"],
    ["distance", "preferred distance"],
    ["field", "field zone"],
    ["tempo", "tempo"],
  ].filter(([key]) => analysis.total && analysis.fillCounts[key] < analysis.total);

  missing.forEach(([key, label]) => {
    const count = analysis.total - analysis.fillCounts[key];
    signals.push(`${count} play${count === 1 ? "" : "s"} missing ${label} data.`);
  });

  const criticalPairs = [
    ["1", "Short", "1st and short"],
    ["1", "Medium", "1st and medium"],
    ["2", "Long", "2nd and long"],
    ["3", "Short", "3rd and short"],
    ["3", "Medium", "3rd and medium"],
    ["3", "Long", "3rd and long"],
    ["4", "Short", "4th and short"],
  ];
  criticalPairs.forEach(([down, distance, label]) => {
    if (!analysis.ddMap.has(`${down}|${distance}`)) {
      signals.push(`No ${label} calls tagged in this scope.`);
    }
  });

  ["Goal Line", "Backed Up", "Lo-RZ", "Hi-RZ"].forEach((field) => {
    if (!analysis.fieldRows.some((row) => row.name === field && row.count > 0)) {
      signals.push(`No ${field.toLowerCase()} field-zone calls tagged in this scope.`);
    }
  });

  const topCombo = Array.from(analysis.ddMap.values())
    .filter((item) => !item.name.includes("No "))
    .sort((a, b) => b.count - a.count)[0];
  if (topCombo && _pbBalancePct(topCombo.count, analysis.total) >= 25) {
    const [down, distance] = topCombo.name.split("|");
    signals.push(`${down} and ${distance} is ${_pbBalancePct(topCombo.count, analysis.total)}% of this scope.`);
  }

  if (signals.length === 0) {
    signals.push("Situation tags cover the major down, distance, field-zone, and tempo buckets in this scope.");
  }
  return signals.slice(0, 10);
}

function _pbSituationFillPct(analysis, key) {
  return _pbBalancePct(analysis.fillCounts[key] || 0, analysis.total);
}

function _pbSituationMatrixCell(rowKey, colKey, map, total) {
  const item = map.get(`${rowKey}|${colKey}`);
  const count = item?.count || 0;
  const pct = _pbBalancePct(count, total);
  const className = count === 0 ? "is-empty" : count < 3 ? "is-light" : "is-covered";
  const title = count
    ? `${count} play${count === 1 ? "" : "s"} (${pct}%)`
    : "No tagged plays";
  return `<td class="pb-situation-cell ${className}" title="${escapeHtml(title)}">
    <strong>${count}</strong>
    <span>${pct}%</span>
  </td>`;
}

function _pbSituationRenderDownDistance(analysis) {
  const header = PB_SITUATION_DISTANCES
    .map((distance) => `<th>${escapeHtml(distance)}</th>`)
    .join("");
  const rows = PB_SITUATION_DOWNS
    .map((down) => `
      <tr>
        <th>${escapeHtml(down)}</th>
        ${PB_SITUATION_DISTANCES.map((distance) => _pbSituationMatrixCell(down, distance, analysis.ddMap, analysis.total)).join("")}
      </tr>
    `)
    .join("");
  return `
    <section class="pb-balance-section pb-situation-section">
      <div class="pb-balance-section-head">
        <h4>Down / Distance</h4>
        <span>${analysis.coveredDdCells} of ${analysis.expectedDdCells} cells covered</span>
      </div>
      <div class="pb-situation-table-wrap">
        <table class="pb-situation-table">
          <thead><tr><th>Down</th>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function _pbSituationRenderFieldZones(analysis) {
  const rows = analysis.fieldRows
    .slice(0, 10)
    .map((row) => {
      const pct = _pbBalancePct(row.count, analysis.total);
      return `
        <div class="pb-situation-zone">
          <div class="pb-balance-row-main">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${row.count} play${row.count === 1 ? "" : "s"} • ${pct}%</span>
          </div>
          <div class="pb-situation-mini-cells">
            ${PB_SITUATION_DOWNS.map((down) => {
        const item = analysis.fieldDownMap.get(`${row.name}|${down}`);
        const count = item?.count || 0;
        return `<span class="${count ? "is-covered" : "is-empty"}">${escapeHtml(down)}: ${count}</span>`;
      }).join("")}
          </div>
        </div>
      `;
    })
    .join("");
  return `
    <section class="pb-balance-section pb-situation-section">
      <div class="pb-balance-section-head">
        <h4>Field Zones</h4>
        <span>${analysis.coveredFieldZones} of ${PB_SITUATION_FIELD_ZONES.length} core zones covered</span>
      </div>
      ${rows || '<div class="pb-balance-empty">No field-zone data in this scope.</div>'}
    </section>
  `;
}

function _pbSituationRenderTempo(analysis) {
  return `
    <section class="pb-balance-section pb-situation-section">
      <div class="pb-balance-section-head">
        <h4>Tempo</h4>
        <span>${analysis.tempoRows.length} values</span>
      </div>
      ${_pbBalanceRenderRows({ rows: analysis.tempoRows }, analysis.total)}
    </section>
  `;
}

function openPlaybookSituationCoverage() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }

  const scope = _pbBalanceScope();
  const analysis = _pbSituationAnalyze(scope.plays);
  const signals = _pbSituationSignals(analysis);

  document.getElementById("playbookSituationOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookSituationOverlay";
  overlay.dataset.action = "closePlaybookSituationCoverageOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-balance-modal pb-situation-modal" role="dialog" aria-modal="true" aria-labelledby="playbookSituationTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🧭</span>
        <h3 class="custom-modal-title" id="playbookSituationTitle">Situation Coverage</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookSituationCoverage">×</button>
      </div>
      <div class="custom-modal-body pb-balance-body">
        <div class="pb-balance-summary">
          <div class="pb-balance-card">
            <strong>${escapeHtml(scope.label)}</strong>
            <span>${escapeHtml(scope.detail)}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${_pbSituationFillPct(analysis, "down")}%</strong>
            <span>Down Tagged</span>
          </div>
          <div class="pb-balance-card">
            <strong>${_pbSituationFillPct(analysis, "distance")}%</strong>
            <span>Distance Tagged</span>
          </div>
          <div class="pb-balance-card">
            <strong>${_pbSituationFillPct(analysis, "field")}%</strong>
            <span>Field Zone Tagged</span>
          </div>
          <div class="pb-balance-card">
            <strong>${_pbSituationFillPct(analysis, "tempo")}%</strong>
            <span>Tempo Tagged</span>
          </div>
        </div>
        <div class="pb-balance-guidance">
          ${signals.map((signal) => `<div>${escapeHtml(signal)}</div>`).join("")}
        </div>
        <div class="pb-situation-grid">
          ${_pbSituationRenderDownDistance(analysis)}
          ${_pbSituationRenderFieldZones(analysis)}
          ${_pbSituationRenderTempo(analysis)}
        </div>
      </div>
      <div class="custom-modal-actions">
        ${scope.hasFilters ? '<button type="button" class="btn btn-sm" data-action="clearPlaybookSituationFilters">Clear Playbook Filters</button>' : ""}
        <button type="button" class="btn btn-sm" data-action="closePlaybookSituationCoverage">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closePlaybookSituationCoverage() {
  const overlay = document.getElementById("playbookSituationOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function clearPlaybookSituationFilters() {
  if (typeof clearFilters === "function") clearFilters();
  closePlaybookSituationCoverage();
  requestAnimationFrame(() => openPlaybookSituationCoverage());
}

function _pbTouchSlotName(slotIndex) {
  return `keyPlayerName${slotIndex}`;
}

function _pbTouchSlotPosition(slotIndex) {
  return `keyPlayer${slotIndex}`;
}

function _pbTouchPlayHasTarget(play) {
  return [1, 2, 3].some((slot) => (
    _pbSituationClean(play?.[_pbTouchSlotName(slot)]) ||
    _pbSituationClean(play?.[_pbTouchSlotPosition(slot)])
  ));
}

function _pbTouchAnalyze(source) {
  const touchEngineReady = typeof computeTouchAnalysis === "function";
  const analysis = touchEngineReady
    ? computeTouchAnalysis(source)
    : {
      players: {},
      totalPlays: source.length,
      totalWeightedPts: 0,
    };
  const players = analysis?.players ? Object.values(analysis.players) : [];
  const taggedPlays = source.filter(_pbTouchPlayHasTarget).length;
  const missingPlays = Math.max(0, source.length - taggedPlays);
  const topPlayer = players[0] || null;
  const lowPrimaryPlayers = players.filter((player) => player.primaryRate < 25);
  return {
    analysis,
    players,
    total: source.length,
    taggedPlays,
    missingPlays,
    topPlayer,
    lowPrimaryPlayers,
    touchEngineReady,
  };
}

function _pbTouchSignals(report) {
  const signals = [];
  if (!report.total) {
    return ["No plays in this scope. Clear filters or import plays to review player opportunities."];
  }
  if (!report.touchEngineReady) {
    signals.push("Touch analysis engine is not ready yet. Reload the app if this persists.");
  }
  if (!report.players.length) {
    signals.push("No key-player tags found in this scope. Add Key Player 1/2/3 names or positions to see opportunities.");
    return signals;
  }
  if (report.missingPlays > 0) {
    signals.push(`${report.missingPlays} play${report.missingPlays === 1 ? "" : "s"} missing key-player opportunity tags.`);
  }
  if (report.topPlayer && report.topPlayer.pct >= 35) {
    signals.push(`${report.topPlayer.name} owns ${report.topPlayer.pct.toFixed(0)}% of weighted opportunities in this scope.`);
  }
  if (report.players.length < 4 && report.total >= 12) {
    signals.push(`Only ${report.players.length} player${report.players.length === 1 ? "" : "s"} tagged across ${report.total} plays.`);
  }
  if (report.lowPrimaryPlayers.length) {
    const names = report.lowPrimaryPlayers.slice(0, 3).map((player) => player.name).join(", ");
    signals.push(`${names} mostly appear as secondary/tertiary options. Check if that matches the weekly plan.`);
  }
  if (!signals.length) {
    signals.push("Player opportunities are tagged and distributed without an obvious overload in this scope.");
  }
  return signals.slice(0, 8);
}

function _pbTouchPct(part, total) {
  return _pbBalancePct(part || 0, total || 0);
}

function _pbTouchRenderTable(report) {
  if (!report.players.length) {
    return '<div class="pb-balance-empty">No player opportunity data in this scope.</div>';
  }
  const rows = report.players
    .slice(0, 12)
    .map((player) => `
      <tr>
        <td><strong>${escapeHtml(player.name)}</strong></td>
        <td>${player.pct.toFixed(0)}%</td>
        <td>${Number.isInteger(player.weightedPts) ? player.weightedPts : player.weightedPts.toFixed(1)}</td>
        <td>${player.flatCount}</td>
        <td>${player.slots?.kp1 || 0}</td>
        <td>${player.slots?.kp2 || 0}</td>
        <td>${player.slots?.kp3 || 0}</td>
        <td>${(player.primaryRate || 0).toFixed(0)}%</td>
      </tr>
    `)
    .join("");
  return `
    <div class="pb-touch-table-wrap">
      <table class="pb-touch-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Weighted</th>
            <th>Pts</th>
            <th>Plays</th>
            <th>KP1</th>
            <th>KP2</th>
            <th>KP3</th>
            <th>Primary</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function _pbTouchRenderAnalysis(report) {
  if (
    typeof renderTouchAnalysis === "function" &&
    report.analysis &&
    report.players.length
  ) {
    return renderTouchAnalysis(report.analysis, {
      title: "Weighted Opportunity Distribution",
      idPrefix: "pb-touch-ta",
    });
  }
  return _pbTouchRenderTable(report);
}

function openPlaybookTouchReport() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }

  const scope = _pbBalanceScope();
  const report = _pbTouchAnalyze(scope.plays);
  const signals = _pbTouchSignals(report);
  const taggedPct = _pbTouchPct(report.taggedPlays, report.total);
  const topName = report.topPlayer?.name || "None";
  const topPct = report.topPlayer ? `${report.topPlayer.pct.toFixed(0)}%` : "0%";

  document.getElementById("playbookTouchOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookTouchOverlay";
  overlay.dataset.action = "closePlaybookTouchReportOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-balance-modal pb-touch-modal" role="dialog" aria-modal="true" aria-labelledby="playbookTouchTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">👥</span>
        <h3 class="custom-modal-title" id="playbookTouchTitle">Player Touches & Opportunities</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookTouchReport">×</button>
      </div>
      <div class="custom-modal-body pb-balance-body">
        <div class="pb-balance-summary">
          <div class="pb-balance-card">
            <strong>${escapeHtml(scope.label)}</strong>
            <span>${escapeHtml(scope.detail)}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${taggedPct}%</strong>
            <span>Plays Tagged</span>
          </div>
          <div class="pb-balance-card">
            <strong>${report.players.length}</strong>
            <span>Players</span>
          </div>
          <div class="pb-balance-card">
            <strong>${escapeHtml(topName)} ${escapeHtml(topPct)}</strong>
            <span>Top Share</span>
          </div>
          <div class="pb-balance-card">
            <strong>${report.analysis?.totalWeightedPts || 0}</strong>
            <span>Weighted Pts</span>
          </div>
        </div>
        <div class="pb-balance-guidance">
          ${signals.map((signal) => `<div>${escapeHtml(signal)}</div>`).join("")}
        </div>
        <section class="pb-balance-section pb-touch-section">
          <div class="pb-balance-section-head">
            <h4>Opportunity Summary</h4>
            <span>KP1 = 3 pts • KP2 = 2 pts • KP3 = 1 pt</span>
          </div>
          ${_pbTouchRenderAnalysis(report)}
        </section>
        <section class="pb-balance-section pb-touch-section">
          <div class="pb-balance-section-head">
            <h4>Top Player Table</h4>
            <span>Weighted share, play count, and priority-slot split</span>
          </div>
          ${_pbTouchRenderTable(report)}
        </section>
      </div>
      <div class="custom-modal-actions">
        ${scope.hasFilters ? '<button type="button" class="btn btn-sm" data-action="clearPlaybookTouchFilters">Clear Playbook Filters</button>' : ""}
        <button type="button" class="btn btn-sm" data-action="closePlaybookTouchReport">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closePlaybookTouchReport() {
  const overlay = document.getElementById("playbookTouchOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function clearPlaybookTouchFilters() {
  if (typeof clearFilters === "function") clearFilters();
  closePlaybookTouchReport();
  requestAnimationFrame(() => openPlaybookTouchReport());
}

function _pbConstraintTerms(play) {
  const terms = [play?.constraint1, play?.constraint2, play?.constraint3]
    .map(_pbSituationClean)
    .filter(Boolean);
  return [...new Set(terms)];
}

function _pbConstraintConcept(play) {
  return (
    _pbSituationClean(play?.basePlay) ||
    _pbSituationClean(play?.play) ||
    _pbSituationClean(play?.type) ||
    "No Concept"
  );
}

function _pbConstraintAddFamily(row, play) {
  const family = _pbBalanceTypeFamily(play);
  row.families[family] = (row.families[family] || 0) + 1;
}

function _pbConstraintAnalyze(source) {
  const conceptMap = new Map();
  const complementMap = new Map();
  let taggedPlays = 0;
  let totalLinks = 0;

  source.forEach((play) => {
    const concept = _pbConstraintConcept(play);
    const terms = _pbConstraintTerms(play);
    if (terms.length) taggedPlays += 1;

    if (!conceptMap.has(concept)) {
      conceptMap.set(concept, {
        name: concept,
        count: 0,
        constraints: new Map(),
        families: { Run: 0, Pass: 0, RPO: 0, Other: 0 },
        examples: [],
      });
    }
    const conceptRow = conceptMap.get(concept);
    conceptRow.count += 1;
    _pbConstraintAddFamily(conceptRow, play);
    if (conceptRow.examples.length < 4 && play?.play) {
      conceptRow.examples.push(play.play);
    }

    terms.forEach((term) => {
      totalLinks += 1;
      conceptRow.constraints.set(
        term,
        (conceptRow.constraints.get(term) || 0) + 1,
      );

      if (!complementMap.has(term)) {
        complementMap.set(term, {
          name: term,
          count: 0,
          concepts: new Map(),
          families: { Run: 0, Pass: 0, RPO: 0, Other: 0 },
        });
      }
      const complementRow = complementMap.get(term);
      complementRow.count += 1;
      complementRow.concepts.set(
        concept,
        (complementRow.concepts.get(concept) || 0) + 1,
      );
      _pbConstraintAddFamily(complementRow, play);
    });
  });

  const conceptRows = Array.from(conceptMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const complementRows = Array.from(complementMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const complementedConcepts = conceptRows.filter((row) => row.constraints.size > 0);
  const gapRows = conceptRows.filter((row) => row.count >= 2 && row.constraints.size === 0);
  const thinRows = conceptRows.filter((row) => row.count >= 4 && row.constraints.size === 1);

  return {
    total: source.length,
    taggedPlays,
    totalLinks,
    conceptRows,
    complementRows,
    complementedConcepts,
    gapRows,
    thinRows,
  };
}

function _pbConstraintSignals(analysis) {
  const signals = [];
  if (!analysis.total) {
    return ["No plays in this scope. Clear filters or import plays to review complements."];
  }
  if (!analysis.totalLinks) {
    return ["No constraint/complement tags found in this scope. Add Constraint 1/2/3 values to map answers."];
  }

  const missing = analysis.total - analysis.taggedPlays;
  if (missing > 0) {
    signals.push(`${missing} play${missing === 1 ? "" : "s"} have no constraint/complement tags.`);
  }
  if (analysis.gapRows.length) {
    const names = analysis.gapRows.slice(0, 3).map((row) => row.name).join(", ");
    signals.push(`${names} need complement tags before they can be checked as families.`);
  }
  if (analysis.thinRows.length) {
    const names = analysis.thinRows.slice(0, 3).map((row) => row.name).join(", ");
    signals.push(`${names} have volume but only one complement answer tagged.`);
  }
  const top = analysis.complementRows[0];
  if (top && _pbBalancePct(top.count, analysis.totalLinks) >= 35) {
    signals.push(`${top.name} accounts for ${_pbBalancePct(top.count, analysis.totalLinks)}% of complement links.`);
  }
  if (!signals.length) {
    signals.push("Constraint tags give the major concepts multiple visible complement answers in this scope.");
  }
  return signals.slice(0, 8);
}

function _pbConstraintChipList(map, className = "pb-constraint-chip") {
  const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!rows.length) return '<span class="pb-constraint-empty-chip">No complements tagged</span>';
  return rows
    .slice(0, 8)
    .map(([name, count]) => `<span class="${className}">${escapeHtml(name)} <b>${count}</b></span>`)
    .join("");
}

function _pbConstraintRenderConcepts(analysis) {
  if (!analysis.conceptRows.length) {
    return '<div class="pb-balance-empty">No concepts in this scope.</div>';
  }
  return analysis.conceptRows
    .slice(0, 12)
    .map((row) => {
      const pct = _pbBalancePct(row.count, analysis.total);
      const exampleText = row.examples.length
        ? row.examples.map(escapeHtml).join(", ")
        : "No example plays";
      return `
        <div class="pb-constraint-card${row.constraints.size ? "" : " is-gap"}">
          <div class="pb-constraint-card-head">
            <div>
              <strong>${escapeHtml(row.name)}</strong>
              <span>${row.count} play${row.count === 1 ? "" : "s"} • ${pct}%</span>
            </div>
            <div class="pb-balance-tags">${_pbBalanceFamilyTags(row)}</div>
          </div>
          <div class="pb-constraint-chips">
            ${_pbConstraintChipList(row.constraints)}
          </div>
          <div class="pb-constraint-examples">${exampleText}</div>
        </div>
      `;
    })
    .join("");
}

function _pbConstraintRenderComplements(analysis) {
  if (!analysis.complementRows.length) {
    return '<div class="pb-balance-empty">No complement tags in this scope.</div>';
  }
  return analysis.complementRows
    .slice(0, 12)
    .map((row) => {
      const pct = _pbBalancePct(row.count, analysis.totalLinks);
      return `
        <div class="pb-constraint-complement-row">
          <div class="pb-balance-row-main">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${row.count} link${row.count === 1 ? "" : "s"} • ${pct}%</span>
          </div>
          <div class="pb-balance-meter" style="--bar-width:${pct}%"><i></i></div>
          <div class="pb-constraint-chips">
            ${_pbConstraintChipList(row.concepts, "pb-constraint-chip pb-constraint-chip-muted")}
          </div>
        </div>
      `;
    })
    .join("");
}

function _pbConstraintRenderGaps(analysis) {
  const rows = [...analysis.gapRows, ...analysis.thinRows]
    .filter((row, index, arr) => arr.findIndex((item) => item.name === row.name) === index)
    .slice(0, 10);
  if (!rows.length) {
    return '<div class="pb-balance-empty">No high-volume concept complement gaps found.</div>';
  }
  return rows
    .map((row) => {
      const label = row.constraints.size === 0 ? "No complements" : "Thin complement menu";
      return `
        <div class="pb-constraint-gap-row">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(label)} • ${row.count} plays</span>
        </div>
      `;
    })
    .join("");
}

function openPlaybookConstraintMap() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }

  const scope = _pbBalanceScope();
  const analysis = _pbConstraintAnalyze(scope.plays);
  const signals = _pbConstraintSignals(analysis);
  const taggedPct = _pbBalancePct(analysis.taggedPlays, analysis.total);
  const conceptPct = _pbBalancePct(
    analysis.complementedConcepts.length,
    analysis.conceptRows.length,
  );

  document.getElementById("playbookConstraintOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookConstraintOverlay";
  overlay.dataset.action = "closePlaybookConstraintMapOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-balance-modal pb-constraint-modal" role="dialog" aria-modal="true" aria-labelledby="playbookConstraintTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🧩</span>
        <h3 class="custom-modal-title" id="playbookConstraintTitle">Constraint & Complement Map</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookConstraintMap">×</button>
      </div>
      <div class="custom-modal-body pb-balance-body">
        <div class="pb-balance-summary">
          <div class="pb-balance-card">
            <strong>${escapeHtml(scope.label)}</strong>
            <span>${escapeHtml(scope.detail)}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${taggedPct}%</strong>
            <span>Plays Tagged</span>
          </div>
          <div class="pb-balance-card">
            <strong>${conceptPct}%</strong>
            <span>Concepts Covered</span>
          </div>
          <div class="pb-balance-card">
            <strong>${analysis.complementRows.length}</strong>
            <span>Complements</span>
          </div>
          <div class="pb-balance-card">
            <strong>${analysis.gapRows.length + analysis.thinRows.length}</strong>
            <span>Concept Gaps</span>
          </div>
        </div>
        <div class="pb-balance-guidance">
          ${signals.map((signal) => `<div>${escapeHtml(signal)}</div>`).join("")}
        </div>
        <div class="pb-constraint-layout">
          <section class="pb-balance-section pb-constraint-section">
            <div class="pb-balance-section-head">
              <h4>Concept Map</h4>
              <span>Base play to tagged complement answers</span>
            </div>
            <div class="pb-constraint-card-grid">${_pbConstraintRenderConcepts(analysis)}</div>
          </section>
          <section class="pb-balance-section pb-constraint-section">
            <div class="pb-balance-section-head">
              <h4>Complement Usage</h4>
              <span>Where each answer shows up</span>
            </div>
            ${_pbConstraintRenderComplements(analysis)}
          </section>
          <section class="pb-balance-section pb-constraint-section">
            <div class="pb-balance-section-head">
              <h4>Gaps</h4>
              <span>Concepts with no or thin complement tags</span>
            </div>
            ${_pbConstraintRenderGaps(analysis)}
          </section>
        </div>
      </div>
      <div class="custom-modal-actions">
        ${scope.hasFilters ? '<button type="button" class="btn btn-sm" data-action="clearPlaybookConstraintFilters">Clear Playbook Filters</button>' : ""}
        <button type="button" class="btn btn-sm" data-action="closePlaybookConstraintMap">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closePlaybookConstraintMap() {
  const overlay = document.getElementById("playbookConstraintOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function clearPlaybookConstraintFilters() {
  if (typeof clearFilters === "function") clearFilters();
  closePlaybookConstraintMap();
  requestAnimationFrame(() => openPlaybookConstraintMap());
}

const PB_IDENTITY_PICTURES = [
  {
    id: "wideZone",
    label: "Wide Zone Picture",
    fallbackTarget: 0.4,
    keywords: [
      "wide zone",
      "widezone",
      "worm",
      "wolf",
      "split wz",
      "slice wz",
      "golden state",
      "warriors",
      "irish",
      "lucky",
      "gang",
      "boot",
      "naked",
      "waggle",
      "sail",
      "flood",
    ],
  },
  {
    id: "pullers",
    label: "Pullers / Counter",
    fallbackTarget: 0.2,
    keywords: [
      "puller",
      "pullers",
      "counter",
      "rebel",
      "bash",
      "rodgers",
      "lamar",
      "trap pass",
      "influence screen",
    ],
  },
  {
    id: "downhill",
    label: "Downhill / ISO / Wrap",
    fallbackTarget: 0.25,
    keywords: [
      "downhill",
      "iso",
      "wrap",
      "beaver",
      "beetle",
      "hulk",
      "cavs",
      "toronto",
      "raptors",
      "batman",
      "deer",
      "golf",
    ],
  },
  {
    id: "antiFront",
    label: "Anti-front",
    fallbackTarget: 0.15,
    keywords: [
      "anti front",
      "anti-front",
      "toledo",
      "maverick",
      "laredo",
      "crunch",
      "san fran",
      "niners",
    ],
  },
];

const PB_IDENTITY_STAPLES = [
  {
    id: "wideZone",
    label: "Wide Zone spine",
    description: "Worm/Wolf, split or slice wide zone, and married movement.",
  },
  {
    id: "qbRun",
    label: "QB run threat",
    description: "Crab, Rebel, Cavs, Bash, keeper, or read-game pressure.",
  },
  {
    id: "conflictThrow",
    label: "Conflict throws",
    description: "Golden State, Warriors, Irish/Lucky, Hulk/Batman, or RPO tags.",
  },
  {
    id: "movementPass",
    label: "Movement pass",
    description: "Naked, Boot, Waggle, Sprint, Roll, or Texas movement calls.",
  },
  {
    id: "screen",
    label: "Screen module",
    description: "Double, tunnel, influence, middle, or named weekly screens.",
  },
];

function _pbIdentityVisionTargets() {
  const targets = typeof VISION_2026 !== "undefined"
    ? VISION_2026.repDistribution?.byPicture
    : null;
  return PB_IDENTITY_PICTURES.map((picture) => {
    const target = Number(targets?.[picture.id]);
    return {
      ...picture,
      target: Number.isFinite(target) && target > 0 ? target : picture.fallbackTarget,
    };
  });
}

function _pbIdentityText(play) {
  return [
    play?.type,
    play?.personnel,
    play?.formation,
    play?.formTag1,
    play?.formTag2,
    play?.shift,
    play?.motion,
    play?.protection,
    play?.lineCall,
    play?.play,
    play?.playTag1,
    play?.playTag2,
    play?.basePlay,
    play?.oneWord,
    play?.tempo,
    play?.constraint1,
    play?.constraint2,
    play?.constraint3,
    play?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

function _pbIdentityHasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function _pbIdentityCategory(play) {
  if (typeof categorizePlay !== "function") return {};
  try {
    return categorizePlay(play) || {};
  } catch (err) {
    console.warn("Identity categorize failed:", err);
    return {};
  }
}

function _pbIdentityPicture(play, text, pictureTargets) {
  const visionPicture = typeof getPlayPicture === "function" ? getPlayPicture(play) : null;
  if (visionPicture) return visionPicture;
  const match = pictureTargets.find((picture) => _pbIdentityHasAny(text, picture.keywords));
  return match?.id || "unclassified";
}

function _pbIdentityPlaySignals(play, pictureTargets) {
  const text = _pbIdentityText(play);
  const category = _pbIdentityCategory(play);
  const picture = _pbIdentityPicture(play, text, pictureTargets);
  const type = String(play?.type || "").toLowerCase();

  return {
    text,
    category,
    picture,
    wideZone:
      picture === "wideZone" ||
      _pbIdentityHasAny(text, ["wide zone", "widezone", "worm", "wolf", "split wz", "slice wz"]),
    qbRun:
      Boolean(category.isQBRun) ||
      _pbIdentityHasAny(text, [
        "qb run",
        "quarterback run",
        "keeper",
        "keep",
        "crab",
        "rebel",
        "cavs",
        "bash",
        "power read",
        "zone read",
      ]),
    conflictThrow:
      Boolean(category.isRPO) ||
      type.includes("rpo") ||
      _pbIdentityHasAny(text, [
        "rpo",
        "conflict",
        "golden state",
        "warriors",
        "irish",
        "lucky",
        "gang",
        "hulk",
        "batman",
        "packers",
        "green bay",
        "maverick",
        "laredo",
        "toledo",
      ]),
    movementPass:
      _pbIdentityHasAny(text, ["naked", "boot", "waggle", "sprint", "roll", "texas"]),
    screen:
      Boolean(category.isScreen) ||
      type.includes("screen") ||
      _pbIdentityHasAny(text, [
        "screen",
        "big mac",
        "whopper",
        "rodgers",
        "lamar",
        "michigan",
        "x middle",
        "xmiddle",
        "tunnel",
        "influence",
      ]),
  };
}

function _pbIdentityScorePicture(rows, total) {
  if (!total) return 0;
  let weightedScore = 0;
  let weightTotal = 0;
  rows.forEach((row) => {
    if (!row.target) return;
    const actual = row.count / total;
    const tolerance = Math.max(row.target, 0.12);
    const closeness = Math.max(0, 1 - Math.abs(actual - row.target) / tolerance);
    weightedScore += closeness * row.target;
    weightTotal += row.target;
  });
  return weightTotal ? Math.round((weightedScore / weightTotal) * 100) : 0;
}

function _pbIdentityScoreConstraints(total, taggedPlays, complementCount) {
  if (!total) return 0;
  const taggedShare = taggedPlays / total;
  const complementTarget = Math.max(5, Math.ceil(total / 6));
  const complementShare = Math.min(1, complementCount / complementTarget);
  return Math.round((taggedShare * 0.7 + complementShare * 0.3) * 100);
}

function _pbIdentityScoreSituation(source) {
  if (!source.length || typeof _pbSituationAnalyze !== "function") return 0;
  const situation = _pbSituationAnalyze(source);
  const values = ["down", "distance", "field", "tempo"].map((key) => (
    _pbSituationFillPct(situation, key)
  ));
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function _pbIdentityScoreInstall(source) {
  if (!source.length || typeof getPlayInstallRating !== "function") {
    return { score: null, rated: 0, fullyInstalled: 0 };
  }

  let totalScore = 0;
  let rated = 0;
  let fullyInstalled = 0;
  source.forEach((play) => {
    const rating = getPlayInstallRating(play);
    if (!rating || !rating.maxStars) return;
    rated += 1;
    totalScore += (rating.stars / rating.maxStars) * 100;
    if (rating.stars === rating.maxStars) fullyInstalled += 1;
  });

  return {
    score: rated ? Math.round(totalScore / rated) : null,
    rated,
    fullyInstalled,
  };
}

function _pbIdentityAnalyze(source) {
  const pictureTargets = _pbIdentityVisionTargets();
  const pictureRows = pictureTargets.map((picture) => ({
    id: picture.id,
    label: picture.label,
    target: picture.target,
    count: 0,
    examples: [],
  }));
  const pictureMap = new Map(pictureRows.map((row) => [row.id, row]));
  const stapleRows = PB_IDENTITY_STAPLES.map((staple) => ({
    ...staple,
    count: 0,
    examples: [],
  }));
  const stapleMap = new Map(stapleRows.map((row) => [row.id, row]));
  const complements = new Set();
  let taggedConstraints = 0;
  let unclassified = 0;

  source.forEach((play) => {
    const signals = _pbIdentityPlaySignals(play, pictureTargets);
    const pictureRow = pictureMap.get(signals.picture);
    const playLabel = _pbSituationClean(play?.play || play?.basePlay || play?.type || "Unnamed");

    if (pictureRow) {
      pictureRow.count += 1;
      if (pictureRow.examples.length < 3) pictureRow.examples.push(playLabel);
    } else {
      unclassified += 1;
    }

    const terms = typeof _pbConstraintTerms === "function" ? _pbConstraintTerms(play) : [];
    if (terms.length) taggedConstraints += 1;
    terms.forEach((term) => complements.add(term));

    stapleRows.forEach((staple) => {
      if (!signals[staple.id]) return;
      const row = stapleMap.get(staple.id);
      row.count += 1;
      if (row.examples.length < 3) row.examples.push(playLabel);
    });
  });

  const total = source.length;
  pictureRows.forEach((row) => {
    row.actual = total ? row.count / total : 0;
    row.delta = row.actual - row.target;
  });

  const pictureScore = _pbIdentityScorePicture(pictureRows, total);
  const stapleScore = stapleRows.length
    ? Math.round((stapleRows.filter((row) => row.count > 0).length / stapleRows.length) * 100)
    : 0;
  const constraintScore = _pbIdentityScoreConstraints(total, taggedConstraints, complements.size);
  const situationScore = _pbIdentityScoreSituation(source);
  const install = _pbIdentityScoreInstall(source);
  const scoreParts = [
    { score: pictureScore, weight: 30 },
    { score: stapleScore, weight: 25 },
    { score: constraintScore, weight: 20 },
    { score: situationScore, weight: 15 },
  ];
  if (install.score !== null) scoreParts.push({ score: install.score, weight: 10 });
  const weightTotal = scoreParts.reduce((sum, part) => sum + part.weight, 0);
  const overallScore = weightTotal
    ? Math.round(scoreParts.reduce((sum, part) => sum + part.score * part.weight, 0) / weightTotal)
    : 0;

  return {
    total,
    overallScore,
    pictureScore,
    stapleScore,
    constraintScore,
    situationScore,
    install,
    pictureRows,
    stapleRows,
    taggedConstraints,
    complementCount: complements.size,
    unclassified,
  };
}

function _pbIdentityScoreLabel(score) {
  if (score >= 85) return "Aligned";
  if (score >= 70) return "Workable";
  if (score >= 55) return "Needs Focus";
  return "Off Identity";
}

function _pbIdentitySignals(analysis) {
  const signals = [];
  if (!analysis.total) {
    return ["No plays in this scope. Clear filters or import plays to review identity alignment."];
  }

  const label = _pbIdentityScoreLabel(analysis.overallScore);
  signals.push(`Identity score is ${analysis.overallScore}/100 (${label}).`);

  const missingStaples = analysis.stapleRows.filter((row) => row.count === 0);
  if (missingStaples.length) {
    signals.push(`Missing identity staple${missingStaples.length === 1 ? "" : "s"}: ${missingStaples.map((row) => row.label).join(", ")}.`);
  }

  analysis.pictureRows
    .filter((row) => Math.abs(row.delta) >= 0.08)
    .slice(0, 2)
    .forEach((row) => {
      const actual = _pbBalancePct(row.count, analysis.total);
      const target = Math.round(row.target * 100);
      const direction = row.delta > 0 ? "above" : "below";
      signals.push(`${row.label} is ${actual}% of this scope, ${direction} the ${target}% target.`);
    });

  if (analysis.unclassified > 0) {
    signals.push(`${analysis.unclassified} play${analysis.unclassified === 1 ? "" : "s"} could not be matched to one of the four pictures.`);
  }

  if (_pbBalancePct(analysis.taggedConstraints, analysis.total) < 60) {
    signals.push("Constraint tags are light. Add Constraint 1/2/3 values so the identity has visible answers.");
  }

  if (analysis.situationScore < 70) {
    signals.push("Situation metadata is light. Preferred down, distance, field zone, and tempo improve the score.");
  }

  if (analysis.install.score !== null && analysis.install.score < 70) {
    signals.push("Installation readiness is pulling the identity score down.");
  }

  return signals.slice(0, 8);
}

function _pbIdentityRenderPictures(analysis) {
  if (!analysis.pictureRows.length) {
    return '<div class="pb-balance-empty">No picture data in this scope.</div>';
  }
  return analysis.pictureRows
    .map((row) => {
      const actual = _pbBalancePct(row.count, analysis.total);
      const target = Math.round(row.target * 100);
      const delta = Math.round(row.delta * 100);
      const deltaLabel = delta === 0 ? "On target" : `${delta > 0 ? "+" : ""}${delta} pts`;
      const examples = row.examples.length ? row.examples.map(escapeHtml).join(", ") : "No matched plays";
      return `
        <div class="pb-identity-picture-row">
          <div class="pb-balance-row-main">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${row.count} play${row.count === 1 ? "" : "s"} • ${actual}% actual • ${target}% target</span>
          </div>
          <div class="pb-balance-meter" style="--bar-width:${actual}%"><i></i></div>
          <div class="pb-identity-picture-foot">
            <span class="${Math.abs(delta) >= 8 ? "is-alert" : ""}">${escapeHtml(deltaLabel)}</span>
            <span>${examples}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function _pbIdentityRenderStaples(analysis) {
  return analysis.stapleRows
    .map((row) => {
      const pct = _pbBalancePct(row.count, analysis.total);
      const examples = row.examples.length ? row.examples.map(escapeHtml).join(", ") : "No matching plays";
      return `
        <div class="pb-identity-staple-row${row.count ? "" : " is-missing"}">
          <div>
            <strong>${escapeHtml(row.label)}</strong>
            <span>${escapeHtml(row.description)}</span>
          </div>
          <div class="pb-identity-staple-meta">
            <b>${row.count}</b>
            <span>${pct}%</span>
          </div>
          <div class="pb-identity-examples">${examples}</div>
        </div>
      `;
    })
    .join("");
}

function openPlaybookIdentityAlignment() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }

  const scope = _pbBalanceScope();
  const analysis = _pbIdentityAnalyze(scope.plays);
  const signals = _pbIdentitySignals(analysis);
  const constraintPct = _pbBalancePct(analysis.taggedConstraints, analysis.total);
  const installLabel = analysis.install.score === null ? "N/A" : `${analysis.install.score}%`;

  document.getElementById("playbookIdentityOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookIdentityOverlay";
  overlay.dataset.action = "closePlaybookIdentityAlignmentOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-balance-modal pb-identity-modal" role="dialog" aria-modal="true" aria-labelledby="playbookIdentityTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🎯</span>
        <h3 class="custom-modal-title" id="playbookIdentityTitle">Identity Alignment</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookIdentityAlignment">×</button>
      </div>
      <div class="custom-modal-body pb-balance-body">
        <div class="pb-balance-summary">
          <div class="pb-balance-card pb-identity-score-card">
            <strong>${analysis.overallScore}/100</strong>
            <span>${escapeHtml(_pbIdentityScoreLabel(analysis.overallScore))}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${escapeHtml(scope.label)}</strong>
            <span>${escapeHtml(scope.detail)}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${analysis.pictureScore}%</strong>
            <span>Picture Match</span>
          </div>
          <div class="pb-balance-card">
            <strong>${analysis.stapleScore}%</strong>
            <span>Staples Present</span>
          </div>
          <div class="pb-balance-card">
            <strong>${constraintPct}%</strong>
            <span>Constraint Tagged</span>
          </div>
          <div class="pb-balance-card">
            <strong>${escapeHtml(installLabel)}</strong>
            <span>Install Ready</span>
          </div>
        </div>
        <div class="pb-balance-guidance">
          ${signals.map((signal) => `<div>${escapeHtml(signal)}</div>`).join("")}
        </div>
        <div class="pb-identity-layout">
          <section class="pb-balance-section pb-identity-section">
            <div class="pb-balance-section-head">
              <h4>Four-Picture Mix</h4>
              <span>Actual share vs identity target</span>
            </div>
            ${_pbIdentityRenderPictures(analysis)}
          </section>
          <section class="pb-balance-section pb-identity-section">
            <div class="pb-balance-section-head">
              <h4>Identity Staples</h4>
              <span>${analysis.stapleRows.filter((row) => row.count > 0).length} of ${analysis.stapleRows.length} present</span>
            </div>
            ${_pbIdentityRenderStaples(analysis)}
          </section>
          <section class="pb-balance-section pb-identity-section pb-identity-inputs">
            <div class="pb-balance-section-head">
              <h4>Alignment Inputs</h4>
              <span>What feeds the score</span>
            </div>
            <div class="pb-identity-input-grid">
              <div><strong>${analysis.complementCount}</strong><span>Distinct complements</span></div>
              <div><strong>${analysis.situationScore}%</strong><span>Situation metadata</span></div>
              <div><strong>${analysis.unclassified}</strong><span>Unclassified plays</span></div>
              <div><strong>${analysis.install.rated || 0}</strong><span>Install-rated plays</span></div>
            </div>
          </section>
        </div>
      </div>
      <div class="custom-modal-actions">
        ${scope.hasFilters ? '<button type="button" class="btn btn-sm" data-action="clearPlaybookIdentityFilters">Clear Playbook Filters</button>' : ""}
        <button type="button" class="btn btn-sm" data-action="closePlaybookIdentityAlignment">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closePlaybookIdentityAlignment() {
  const overlay = document.getElementById("playbookIdentityOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function clearPlaybookIdentityFilters() {
  if (typeof clearFilters === "function") clearFilters();
  closePlaybookIdentityAlignment();
  requestAnimationFrame(() => openPlaybookIdentityAlignment());
}
