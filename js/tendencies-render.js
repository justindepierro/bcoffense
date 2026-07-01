// Tendencies Render Functions
// Owns: All UI rendering and templating

function renderTendenciesHome() {
  const container = document.getElementById("tendenciesContent");
  if (!container) return;

  const opponentList = tendenciesOpponents
    .map(
      (opp, i) => `
    <div class="td-opponent-card" data-action="selectTendenciesOpponent" data-idx="${i}">
      <div class="td-opponent-card-info">
        <span class="td-opponent-name">${escapeHtml(opp.name)}</span>
        <span class="td-opponent-count">${opp.plays.length} play${opp.plays.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="td-opponent-card-actions">
        <button class="btn btn-sm" data-action="renameTendenciesOpponent" data-idx="${i}" title="Rename">✏️</button>
        <button class="btn btn-sm btn-danger" data-action="deleteTendenciesOpponent" data-idx="${i}" title="Delete">🗑️</button>
      </div>
    </div>
  `,
    )
    .join("");

  container.innerHTML = `
    <div class="td-home">
      <div class="td-home-header">
        <h2>🎯 Opponent Scout</h2>
        <p class="td-subtitle">Chart defensive plays while watching film. Build opponent scouting reports and export for analysis.</p>
      </div>
      <div class="td-opponent-section">
        <div class="td-section-header">
          <h3>📋 Opponents</h3>
          <button class="btn btn-primary" data-action="addTendenciesOpponent">＋ New Opponent</button>
        </div>
        ${tendenciesOpponents.length === 0
      ? '<div class="empty-state empty-state--bordered empty-state--spaced"><span class="empty-state__icon">🏈</span><p class="empty-state__text">No opponents yet. Add one to start charting!</p></div>'
      : `<div class="td-opponent-list">${opponentList}</div>`
    }
      </div>
      ${tendenciesOpponents.length > 0
      ? `<div class="td-export-section">
            <div class="td-section-header"><h3>📤 Export / Import</h3></div>
            <div class="td-export-buttons">
              <button class="btn btn-secondary" data-action="exportTendenciesCSV">📄 Export All (CSV)</button>
              <button class="btn btn-secondary" data-action="exportTendenciesJSON">💾 Export All (JSON)</button>
              <button class="btn btn-secondary" data-action="importTendenciesJSON">📥 Import JSON</button>
              <button class="btn btn-secondary" data-action="importTendenciesCSV">📥 Import CSV</button>
            </div>
          </div>`
      : `<div class="td-export-section">
            <div class="td-section-header"><h3>📥 Import</h3></div>
            <div class="td-export-buttons">
              <button class="btn btn-secondary" data-action="importTendenciesJSON">📥 Import JSON</button>
              <button class="btn btn-secondary" data-action="importTendenciesCSV">📥 Import CSV</button>
            </div>
          </div>`
    }
    </div>
  `;
}

function renderOpponentDetail() {
  const container = document.getElementById("tendenciesContent");
  if (!container || tendenciesCurrentOpponent === null) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;

  const totalPlays = opp.plays.length;
  const filtered = getFilteredPlays();
  const activeFilters = activeFilterCount();
  const runPlays = opp.plays.filter(
    (p) =>
      p.offensePlayType &&
      ["Run", "Draw", "QB Run", "Option"].includes(p.offensePlayType),
  ).length;
  const passPlays = opp.plays.filter(
    (p) =>
      p.offensePlayType && ["Pass", "Screen", "PA"].includes(p.offensePlayType),
  ).length;
  const blitzPlays = opp.plays.filter(
    (p) => p.defBlitz && p.defBlitz !== "None",
  ).length;

  container.innerHTML = `
    <div class="td-detail">
      <div class="td-detail-header">
        <button class="btn btn-secondary" data-action="tendenciesGoHome">← Back</button>
        <h2>🎯 ${escapeHtml(opp.name)}</h2>
        <div class="td-detail-actions">
          <button class="btn" id="tendenciesUndoBtn" data-action="undoTendencies" disabled title="Nothing to undo">↩️</button>
          <button class="btn" id="tendenciesRedoBtn" data-action="redoTendencies" disabled title="Nothing to redo">↪️</button>
          <button class="btn btn-primary td-new-play-btn" data-action="startNewPlay">＋ New Play</button>
          <button class="btn btn-secondary" data-action="exportSingleOpponentCSV" data-idx="${tendenciesCurrentOpponent}">📄 CSV</button>
          <button class="btn btn-secondary" data-action="printTendencies">🖨️ Print</button>
          <button class="btn ${isActiveGameWeekOpponent(tendenciesCurrentOpponent) ? "btn-success" : "btn-danger"}" data-action="setAsActiveOpponent" data-idx="${tendenciesCurrentOpponent}" title="Set this team as this week's opponent for scouting integration">${isActiveGameWeekOpponent(tendenciesCurrentOpponent) ? "✅ Active Opponent" : "🏈 Set Active"}</button>
        </div>
      </div>

      <div class="td-stats-bar">
        <div class="td-stat"><span class="td-stat-value">${totalPlays}</span><span class="td-stat-label">Plays</span></div>
        <div class="td-stat td-stat-run"><span class="td-stat-value">${runPlays}</span><span class="td-stat-label">Run</span></div>
        <div class="td-stat td-stat-pass"><span class="td-stat-value">${passPlays}</span><span class="td-stat-label">Pass</span></div>
        <div class="td-stat td-stat-blitz"><span class="td-stat-value">${blitzPlays}</span><span class="td-stat-label">Blitz</span></div>
        ${totalPlays > 0
      ? `
          <div class="td-stat td-stat-pct"><span class="td-stat-value">${Math.round((runPlays / totalPlays) * 100)}%</span><span class="td-stat-label">Run %</span></div>
          <div class="td-stat td-stat-pct"><span class="td-stat-value">${Math.round((blitzPlays / totalPlays) * 100)}%</span><span class="td-stat-label">Blitz %</span></div>
        `
      : ""
    }
      </div>

      <!-- Toolbar -->
      <div class="td-toolbar">
        <div class="td-toolbar-left">
          <div class="td-search-box">
            <input type="text" class="td-search-input" id="tdSearchInput" placeholder="🔍 Search plays…"
                   value="${escapeHtml(tdSearchText)}" data-oninput="setTdSearch" data-pass="value">
            <button class="search-clear-btn${tdSearchText ? "" : " hidden"}" data-action="clearTdSearch">✕</button>
          </div>
          <button class="btn btn-sm ${tdShowFilters ? "btn-primary" : ""}" data-action="toggleTdFilters">
            🔽 Filters${activeFilters > 0 ? ` <span class="td-filter-badge">${activeFilters}</span>` : ""}
          </button>
          <button class="btn btn-sm ${tdShowStats ? "btn-primary" : ""}" data-action="toggleTdStats">📊 Stats</button>
          ${!tdBulkMode
      ? '<button class="btn btn-sm" data-action="enterBulkMode">☑️ Select</button>'
      : '<button class="btn btn-sm btn-primary" data-action="exitBulkMode">✕ Exit Select</button>'
    }
        </div>
        <div class="td-toolbar-right">
          <button class="btn btn-sm" data-action="toggleColumnPanel" title="Column visibility">👁️ Columns</button>
          <button class="btn btn-sm ${tendenciesRapidMode ? "btn-primary" : ""}" data-action="toggleRapidMode" title="Toggle rapid chart mode">⚡ ${tendenciesRapidMode ? "Wizard" : "Rapid"}</button>
          <span class="td-play-count">${filtered.length === totalPlays ? `${totalPlays} plays` : `${filtered.length} of ${totalPlays}`}</span>
        </div>
      </div>

      <!-- Filter panel (collapsible) -->
      ${tdShowFilters ? renderFilterPanel(opp) : ""}

      <!-- Column visibility -->
      <div id="tdColumnPanel" class="td-column-panel">${renderColumnToggle()}</div>

      <!-- Stats dashboard -->
      ${tdShowStats ? renderStatsDashboard(opp) : ""}

      <!-- Bulk action bar -->
      ${tdBulkMode && tdSelectedPlays.size > 0
      ? `
        <div class="td-bulk-bar">
          <span class="td-bulk-count">${tdSelectedPlays.size} selected</span>
          <button class="btn btn-sm" data-action="selectAllVisible">Select All Visible</button>
          <button class="btn btn-sm" data-action="deselectAllBulk">Deselect All</button>
          <button class="btn btn-sm" data-action="bulkEditField">✏️ Bulk Edit Field</button>
          <button class="btn btn-sm btn-danger" data-action="bulkDeletePlays">🗑️ Delete Selected</button>
        </div>
      `
      : ""
    }

      <!-- Play log -->
      <div class="td-play-log" id="tendenciesPlayLog">
        ${renderPlayLogTable(filtered)}
      </div>
    </div>
  `;

  historyManager.updateButtons("tendencies");
}

function renderPlayLog() {
  const el = document.getElementById("tendenciesPlayLog");
  if (!el) return;
  const filtered = getFilteredPlays();
  el.innerHTML = renderPlayLogTable(filtered);

  // Long-press context menu on mobile
  el.querySelectorAll("tr[data-orig]").forEach((tr) => {
    const origIdx = parseInt(tr.dataset.orig, 10);
    if (!isNaN(origIdx)) {
      addLongPress(tr, (ev) => _showTdPlayContextMenu(ev, origIdx));
    }
  });

  // Update play count
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  const countEl = document.querySelector(".td-play-count");
  if (countEl && opp) {
    countEl.textContent =
      filtered.length === opp.plays.length
        ? `${opp.plays.length} plays`
        : `${filtered.length} of ${opp.plays.length}`;
  }

  // Update bulk bar count
  const bulkCount = document.querySelector(".td-bulk-count");
  if (bulkCount) bulkCount.textContent = `${tdSelectedPlays.size} selected`;
}

function renderPlayLogTable(filtered) {
  if (filtered.length === 0) {
    const opp = tendenciesOpponents[tendenciesCurrentOpponent];
    if (opp && opp.plays.length > 0) {
      return '<div class="empty-state empty-state--bordered empty-state--spaced"><span class="empty-state__icon">🔍</span><p class="empty-state__text">No plays match your filters. <button class="btn-link" data-action="clearTdFilters">Clear filters</button></p></div>';
    }
    return '<div class="empty-state empty-state--bordered empty-state--spaced"><span class="empty-state__icon">📹</span><p class="empty-state__text">No plays charted yet. Hit <strong>＋ New Play</strong> or press <strong>N</strong> to start!</p></div>';
  }

  const visibleCols = TD_COLUMNS.filter((c) =>
    (tdVisibleColumns || TD_DEFAULT_VISIBLE).includes(c.key),
  );

  const headerCells = visibleCols
    .map((c) => {
      if (!c.sortable) return `<th>${c.label}</th>`;
      const isActive = tdSortColumn === c.key;
      const arrow = isActive ? (tdSortDirection === "asc" ? " ▲" : " ▼") : "";
      return `<th class="td-sortable-th ${isActive ? "td-sorted" : ""}" data-action="sortTdColumn" data-arg="${c.key}">${c.label}${arrow}</th>`;
    })
    .join("");

  const rows = filtered
    .map((play, i) => {
      const isSelected = tdSelectedPlays.has(play._origIndex);
      const cells = visibleCols
        .map((c) => renderCellValue(c, play, i))
        .join("");
      return `<tr class="${isSelected ? "td-row-bulk-selected" : ""} ${i === tdSelectedRow ? "td-row-selected" : ""}"
                draggable="${!tdBulkMode}"
                data-orig="${play._origIndex}"
                data-drag="tdPlayRow">
              ${tdBulkMode ? `<td><input type="checkbox" ${isSelected ? "checked" : ""} data-onchange="tdToggleBulkSelect" data-arg="${play._origIndex}"></td>` : ""}${cells}
            </tr>`;
    })
    .join("");

  return `<div class="td-table-container">
    <table class="td-table">
      <thead><tr>${tdBulkMode ? '<th><input type="checkbox" data-onchange="tdSelectAllToggle" title="Select all"></th>' : ""}${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderCellValue(col, play, idx) {
  switch (col.key) {
    case "_num":
      return `<td class="td-play-num">${play._origIndex + 1}</td>`;
    case "_downDist":
      return `<td>${play.down || "—"}${play.distance ? " & " + play.distance : ""}</td>`;
    case "_fieldPos":
      return `<td>${(play.fieldPosition || "") + " " + (play.yardLine || "")}</td>`;
    case "defFront":
      return `<td><span class="td-tag td-tag-front">${escapeHtml(play.defFront || "—")}</span></td>`;
    case "defCoverage":
      return `<td><span class="td-tag td-tag-cov">${escapeHtml(play.defCoverage || "—")}</span></td>`;
    case "defBlitz":
      return `<td>${play.defBlitz && play.defBlitz !== "None" ? '<span class="td-tag td-tag-blitz">🔴 ' + escapeHtml(play.defBlitz) + "</span>" : "—"}</td>`;
    case "defStunt":
      return `<td>${play.defStunt && play.defStunt !== "None" ? '<span class="td-tag td-tag-stunt">' + escapeHtml(play.defStunt) + "</span>" : "—"}</td>`;
    case "notes":
      return `<td class="td-notes-cell" title="${escapeHtml(play.notes || "")}">${play.notes ? "📝 " + (play.notes.length > 20 ? escapeHtml(play.notes.substring(0, 20)) + "…" : escapeHtml(play.notes)) : ""}</td>`;
    case "_actions":
      return `<td class="td-play-actions">
        ${tdBulkMode
          ? ""
          : `
          <button class="btn btn-sm td-play-action-btn" data-action="editTendenciesPlay" data-idx="${play._origIndex}" title="Edit">✏️</button>
          <button class="btn btn-sm td-play-action-btn" data-action="duplicateTendenciesPlay" data-idx="${play._origIndex}" title="Duplicate">⧉</button>
          <button class="btn btn-sm btn-danger td-play-action-btn" data-action="deleteTendenciesPlay" data-idx="${play._origIndex}" title="Delete">✕</button>
          <button class="btn btn-sm td-play-menu-btn" data-action="openTendenciesPlayMenu" data-arg="${play._origIndex}" aria-label="Play actions" title="Actions">⋯</button>
        `
        }
      </td>`;
    default:
      return `<td>${escapeHtml(play[col.key] || "—")}</td>`;
  }
}

function renderFilterPanel(opp) {
  const sections = TD_FILTER_FIELDS.map((f) => {
    const presetOpts = TENDENCIES_OPTIONS[f.options] || [];
    const dataVals = new Set();
    opp.plays.forEach((p) => {
      if (p[f.key]) dataVals.add(p[f.key]);
    });
    const allVals = [...new Set([...presetOpts, ...dataVals])];
    if (allVals.length === 0) return "";

    const activeVals = tdFilters[f.key] || [];
    const chips = allVals
      .map((v) => {
        const count = opp.plays.filter((p) => p[f.key] === v).length;
        if (count === 0) return "";
        const active = activeVals.includes(v);
        return `<button class="td-filter-chip ${active ? "active" : ""}"
                data-action="toggleTdFilter" data-key="${f.key}" data-val="${escapeHtml(v)}">${escapeHtml(v)} <span class="td-chip-count">${count}</span></button>`;
      })
      .filter(Boolean)
      .join("");

    if (!chips) return "";
    return `<div class="td-filter-section">
      <div class="td-filter-label">${f.label}</div>
      <div class="td-filter-chips">${chips}</div>
    </div>`;
  })
    .filter(Boolean)
    .join("");

  return `<div class="td-filter-backdrop" data-action="toggleTdFilters" aria-hidden="true"></div>
  <div class="td-filter-panel" role="group" aria-label="Play filters">
    <div class="td-filter-panel-header">
      <span>🔽 Filters</span>
      <div class="td-filter-panel-header-actions">
        ${activeFilterCount() > 0 ? `<button class="btn btn-sm" data-action="clearTdFilters">Clear All</button>` : ""}
        <button class="btn btn-sm td-filter-close" data-action="toggleTdFilters" aria-label="Close filters" title="Close">✕</button>
      </div>
    </div>
    ${sections}
  </div>`;
}

// Mobile row-action menu: opens the same context menu as long-press, anchored
// to the kebab button so touch users get the row actions without hover.
function openTendenciesPlayMenu(idx, el) {
  const origIdx = parseInt(idx, 10);
  if (isNaN(origIdx)) return;
  if (typeof _showTdPlayContextMenu !== "function") return;
  const rect = el?.getBoundingClientRect?.() || { left: 12, bottom: 12 };
  _showTdPlayContextMenu(
    {
      preventDefault() { },
      clientX: rect.left,
      clientY: rect.bottom + 4,
    },
    origIdx,
  );
}

function renderStatsDashboard(opp) {
  if (!opp || opp.plays.length === 0) {
    return '<div class="td-stats-dashboard"><p class="td-stats-empty">Chart some plays to see stats!</p></div>';
  }

  const plays = opp.plays;
  const total = plays.length;

  // Front distribution
  const frontDist = {};
  plays.forEach((p) => {
    if (p.defFront) frontDist[p.defFront] = (frontDist[p.defFront] || 0) + 1;
  });

  // Coverage distribution
  const covDist = {};
  plays.forEach((p) => {
    if (p.defCoverage)
      covDist[p.defCoverage] = (covDist[p.defCoverage] || 0) + 1;
  });

  // Blitz distribution
  const blitzDist = {};
  plays.forEach((p) => {
    if (p.defBlitz && p.defBlitz !== "None")
      blitzDist[p.defBlitz] = (blitzDist[p.defBlitz] || 0) + 1;
  });

  // Down tendencies
  const downStats = {};
  plays.forEach((p) => {
    if (!p.down) return;
    if (!downStats[p.down])
      downStats[p.down] = { total: 0, run: 0, pass: 0, blitz: 0 };
    downStats[p.down].total++;
    if (["Run", "Draw", "QB Run", "Option"].includes(p.offensePlayType))
      downStats[p.down].run++;
    if (["Pass", "Screen", "PA"].includes(p.offensePlayType))
      downStats[p.down].pass++;
    if (p.defBlitz && p.defBlitz !== "None") downStats[p.down].blitz++;
  });

  // Situation tendencies
  const sitStats = {};
  plays.forEach((p) => {
    if (!p.situation) return;
    if (!sitStats[p.situation])
      sitStats[p.situation] = { total: 0, fronts: {}, coverages: {} };
    sitStats[p.situation].total++;
    if (p.defFront)
      sitStats[p.situation].fronts[p.defFront] =
        (sitStats[p.situation].fronts[p.defFront] || 0) + 1;
    if (p.defCoverage)
      sitStats[p.situation].coverages[p.defCoverage] =
        (sitStats[p.situation].coverages[p.defCoverage] || 0) + 1;
  });

  // Formation tendencies
  const formStats = {};
  plays.forEach((p) => {
    if (!p.offenseFormation) return;
    if (!formStats[p.offenseFormation])
      formStats[p.offenseFormation] = { total: 0, fronts: {}, coverages: {} };
    formStats[p.offenseFormation].total++;
    if (p.defFront)
      formStats[p.offenseFormation].fronts[p.defFront] =
        (formStats[p.offenseFormation].fronts[p.defFront] || 0) + 1;
    if (p.defCoverage)
      formStats[p.offenseFormation].coverages[p.defCoverage] =
        (formStats[p.offenseFormation].coverages[p.defCoverage] || 0) + 1;
  });

  function distBar(dist, color) {
    const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return '<span class="td-stat-na">—</span>';
    return sorted
      .map(([k, v]) => {
        const pct = Math.round((v / total) * 100);
        return `<div class="td-dist-row">
        <span class="td-dist-label">${k}</span>
        <div class="td-dist-bar-bg"><div class="td-dist-bar-fill ${color}" style="--bar-width:${pct}%"></div></div>
        <span class="td-dist-val">${v} <small>(${pct}%)</small></span>
      </div>`;
      })
      .join("");
  }

  function topN(dist, n) {
    return (
      Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k, v]) => `${k} (${v})`)
        .join(", ") || "—"
    );
  }

  return `<div class="td-stats-dashboard">
    <div class="td-stats-grid">
      <div class="td-stats-card">
        <h4>🛡️ Def Front Distribution</h4>
        ${distBar(frontDist, "td-bar-front")}
      </div>
      <div class="td-stats-card">
        <h4>🔒 Coverage Distribution</h4>
        ${distBar(covDist, "td-bar-cov")}
      </div>
      <div class="td-stats-card">
        <h4>🔴 Blitz Distribution</h4>
        ${Object.keys(blitzDist).length > 0 ? distBar(blitzDist, "td-bar-blitz") : '<span class="td-stat-na">No blitzes charted</span>'}
      </div>
      <div class="td-stats-card">
        <h4>📊 By Down</h4>
        <table class="td-mini-table">
          <thead><tr><th>Down</th><th>Plays</th><th>Run%</th><th>Pass%</th><th>Blitz%</th></tr></thead>
          <tbody>
            ${Object.entries(downStats)
      .sort((a, b) => a[0] - b[0])
      .map(
        ([d, s]) => `
              <tr>
                <td><strong>${d}</strong></td>
                <td>${s.total}</td>
                <td>${s.total > 0 ? Math.round((s.run / s.total) * 100) : 0}%</td>
                <td>${s.total > 0 ? Math.round((s.pass / s.total) * 100) : 0}%</td>
                <td>${s.total > 0 ? Math.round((s.blitz / s.total) * 100) : 0}%</td>
              </tr>
            `,
      )
      .join("")}
          </tbody>
        </table>
      </div>
      <div class="td-stats-card">
        <h4>🏟️ By Situation</h4>
        <table class="td-mini-table">
          <thead><tr><th>Situation</th><th>Plays</th><th>Top Front</th><th>Top Coverage</th></tr></thead>
          <tbody>
            ${Object.entries(sitStats)
      .sort((a, b) => b[1].total - a[1].total)
      .map(
        ([sit, s]) => `
              <tr>
                <td><strong>${sit}</strong></td>
                <td>${s.total}</td>
                <td>${topN(s.fronts, 1)}</td>
                <td>${topN(s.coverages, 1)}</td>
              </tr>
            `,
      )
      .join("")}
          </tbody>
        </table>
      </div>
      <div class="td-stats-card">
        <h4>🏈 By Off. Formation</h4>
        <table class="td-mini-table">
          <thead><tr><th>Formation</th><th>Plays</th><th>Top Front</th><th>Top Coverage</th></tr></thead>
          <tbody>
            ${Object.entries(formStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(
        ([form, s]) => `
              <tr>
                <td><strong>${form}</strong></td>
                <td>${s.total}</td>
                <td>${topN(s.fronts, 1)}</td>
                <td>${topN(s.coverages, 1)}</td>
              </tr>
            `,
      )
      .join("")}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderColumnToggle() {
  return `<div class="td-col-toggle-panel">
    <span class="td-col-toggle-title">Columns:</span>
    ${TD_COLUMNS.filter((c) => c.key !== "_num" && c.key !== "_actions")
      .map(
        (c) => `
      <label class="td-col-toggle-item">
        <input type="checkbox" ${tdVisibleColumns.includes(c.key) ? "checked" : ""}
               data-onchange="toggleTdColumn" data-arg="${c.key}">
        <span>${c.label}</span>
      </label>
    `,
      )
      .join("")}
  </div>`;
}

function renderRapidChart() {
  const container = document.getElementById("tendenciesContent");
  if (!container || !tendenciesCurrentPlay) return;
  const isEditing = tendenciesEditIndex >= 0;

  const fieldsHtml = TENDENCIES_STEPS.map((step) => {
    const fields = step.fields
      .map((field) => renderFieldHtml(field, "rapid"))
      .join("");
    return `<div class="td-rapid-section">
      <h3 class="td-rapid-section-title">${step.title}</h3>
      <div class="td-fields">${fields}</div>
    </div>`;
  }).join("");

  container.innerHTML = `
    <div class="td-rapid">
      <div class="td-wizard-top">
        <button class="btn btn-secondary" data-action="cancelWizard">✕ Cancel</button>
        <h3>⚡ ${isEditing ? "Edit" : "Rapid Chart"} — All Fields</h3>
        <div></div>
      </div>
      <div class="td-rapid-body">${fieldsHtml}</div>
      <div class="td-wizard-nav">
        <div></div>
        <button class="btn btn-primary td-nav-btn td-save-btn" data-action="saveWizardPlay">💾 Save Play</button>
      </div>
    </div>
  `;

  scheduleTendenciesAutosave();
}

function renderWizard() {
  _enableWizardKeys();
  const container = document.getElementById("tendenciesContent");
  if (!container || !tendenciesCurrentPlay) return;
  const step = TENDENCIES_STEPS[tendenciesWizardStep];
  const totalSteps = TENDENCIES_STEPS.length;
  const isFirst = tendenciesWizardStep === 0;
  const isLast = tendenciesWizardStep === totalSteps - 1;
  const isEditing = tendenciesEditIndex >= 0;

  const stepDots = TENDENCIES_STEPS.map(
    (s, i) => `
    <div class="td-step-dot ${i === tendenciesWizardStep ? "active" : ""} ${i < tendenciesWizardStep ? "completed" : ""}"
         data-action="goToWizardStep" data-idx="${i}" title="${s.title}"
         ${i === tendenciesWizardStep ? 'aria-current="step"' : ""}>
      <span class="td-step-icon">${s.icon}</span>
      <span class="td-step-label">${s.title.replace(/^[^\s]+\s/, "")}</span>
    </div>
  `,
  ).join('<div class="td-step-connector"></div>');

  const fieldsHtml = step.fields
    .map((field) => renderFieldHtml(field, "wizard"))
    .join("");

  container.innerHTML = `
    <div class="td-wizard">
      <div class="td-wizard-top">
        <button class="btn btn-secondary" data-action="cancelWizard">✕ Cancel</button>
        <h3>${isEditing ? "Edit" : "New"} Play — Step ${tendenciesWizardStep + 1} of ${totalSteps}</h3>
        <div class="td-wizard-skip">
          <button class="btn btn-sm" data-action="skipStep">Skip →</button>
        </div>
      </div>
      <div class="td-step-indicator" role="list" aria-label="Wizard steps">${stepDots}</div>
      <div aria-live="polite" aria-atomic="true" class="sr-only" id="tdWizardLive">
        Step ${tendenciesWizardStep + 1} of ${totalSteps}: ${step.title}
      </div>
      <div class="td-wizard-body">
        <h2 class="td-step-title">${step.title}</h2>
        <div class="td-fields">${fieldsHtml}</div>
      </div>
      <div class="td-wizard-nav">
        ${!isFirst ? '<button class="btn btn-secondary td-nav-btn" data-action="wizardPrev">← Back</button>' : "<div></div>"}
        ${isLast
      ? '<button class="btn btn-primary td-nav-btn td-save-btn" data-action="saveWizardPlay">💾 Save Play</button>'
      : '<button class="btn btn-primary td-nav-btn" data-action="wizardNext">Next →</button>'
    }
      </div>
    </div>
  `;

  scheduleTendenciesAutosave();
}

function renderFieldHtml(field, mode) {
  const currentValue = tendenciesCurrentPlay[field.key] || "";

  if (field.type === "textarea") {
    return `
      <div class="td-field-group">
        <label class="td-field-label">${field.label}</label>
        <textarea class="td-textarea" id="text_${field.key}" placeholder="${field.placeholder || ""}"
                  data-oninput="setWizardFieldDirect" data-key="${field.key}" data-pass="value">${currentValue}</textarea>
      </div>
    `;
  }

  if (field.type === "buttons") {
    const opts = TENDENCIES_OPTIONS[field.options] || [];
    const buttons = opts
      .map(
        (opt, btnIdx) => `
      <button class="td-option-btn ${currentValue === opt ? "selected" : ""}"
              ${btnIdx < 9 ? 'data-key-hint="' + (btnIdx + 1) + '"' : ""}
              data-action="setWizardField" data-key="${field.key}" data-val="${escapeHtml(opt)}">
        ${escapeHtml(opt)}
      </button>
    `,
      )
      .join("");
    return `
      <div class="td-field-group">
        <label class="td-field-label">${field.label}${currentValue ? ` <span class="td-current-val">= ${currentValue}</span>` : ""}</label>
        <div class="td-option-grid">${buttons}</div>
        <div class="td-field-custom">
          <input type="text" class="td-custom-input" id="custom_${field.key}"
                 placeholder="Or type custom…" value="${currentValue && !opts.includes(currentValue) ? currentValue : ""}"
                 data-oninput="clearButtonSelection" data-arg="${field.key}"
                 data-wizard-key="${field.key}">
          <button class="btn btn-sm" data-action="setWizardFieldFromInput" data-arg="${field.key}">Set</button>
          ${currentValue ? `<button class="btn btn-sm td-clear-btn" data-action="clearWizardField" data-arg="${field.key}">✕</button>` : ""}
        </div>
      </div>
    `;
  }

  // text input
  return `
    <div class="td-field-group">
      <label class="td-field-label">${field.label}</label>
      <input type="text" class="td-text-input" id="text_${field.key}"
             placeholder="${field.placeholder || ""}" value="${currentValue}"
             data-oninput="setWizardFieldDirect" data-key="${field.key}" data-pass="value">
    </div>
  `;
}
