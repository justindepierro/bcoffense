/* =========================================================================
   Game Plan — rendering (header, library, boxes, chips, scoreboard, scenarios)
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

function _gpUniqueFilterValues(fields) {
  const sourceFields = Array.isArray(fields) ? fields : [fields];
  const values = new Set();
  if (!Array.isArray(plays)) return [];
  plays.forEach((play) => {
    sourceFields.forEach((field) => {
      const value = String(play?.[field] || "").trim();
      if (value) values.add(value);
    });
  });
  return [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

function _gpRenderAdvancedSelect(field, label, opts = {}) {
  const values = Array.isArray(opts.values)
    ? opts.values
    : _gpUniqueFilterValues(opts.sourceFields || field);
  const current = String(_gpFilters[field] || "");
  const title = opts.title || label;
  return `
    <select data-onchange="updateGamePlanFilter" data-arg="${escapeHtml(field)}" data-pass="value" title="${escapeHtml(title)}">
      <option value="">${escapeHtml(label)}</option>
      ${values.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
    </select>`;
}

function _gpRenderAdvancedText(field, label, title) {
  return `
    <input type="search" class="gp-filter-input" placeholder="${escapeHtml(label)}"
      value="${escapeHtml(_gpFilters[field] || "")}"
      data-oninput="updateGamePlanFilter" data-arg="${escapeHtml(field)}" data-pass="value"
      title="${escapeHtml(title || label)}" />`;
}

function _gpRenderAdvancedToggle(field, label, title) {
  return `
    <label class="gp-filter-toggle" title="${escapeHtml(title || label)}">
      <input type="checkbox" ${_gpFilters[field] ? "checked" : ""}
        data-onchange="updateGamePlanFilter" data-arg="${escapeHtml(field)}" data-pass="event" />
      ${label}
    </label>`;
}

function _gpRenderAdvancedGroup(title, controls) {
  return `
    <section class="gp-filter-group">
      <div class="gp-filter-group-title">${escapeHtml(title)}</div>
      <div class="gp-filter-grid">${controls.join("")}</div>
    </section>`;
}

function _gpMultiFilterValues(field) {
  return typeof _gpFilterValueList === "function"
    ? _gpFilterValueList(_gpFilters[field])
    : [];
}

function _gpFormatMultiFilterLabel(label, selected) {
  if (!selected || selected.length === 0) return `Any ${label}`;
  if (selected.length === 1) return selected[0];
  return `${selected.length} ${label} selected`;
}

function _gpFormatChipMultiLabel(field) {
  const selected = _gpMultiFilterValues(field);
  if (selected.length <= 2) return selected.join(", ");
  return `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`;
}

function _gpRenderMultiFilterDropdown(field, label, values) {
  const selected = _gpMultiFilterValues(field);
  const selectedSet = new Set(selected);
  const isOpen = _gpOpenMultiFilter === field;
  const countText = selected.length ? `${selected.length}` : "multi";
  return `
    <div class="gp-multi-filter ${isOpen ? "is-open" : ""}">
      <button class="gp-multi-filter-btn" type="button"
        data-action="toggleGamePlanMultiFilterMenu" data-arg="${escapeHtml(field)}"
        title="Choose one or more ${escapeHtml(label.toLowerCase())}"
        aria-expanded="${isOpen ? "true" : "false"}">
        <span>${escapeHtml(_gpFormatMultiFilterLabel(label, selected))}</span>
        <span class="gp-multi-filter-count">${escapeHtml(countText)}</span>
      </button>
      ${isOpen ? `
        <div class="gp-multi-filter-menu">
          <div class="gp-multi-filter-menu-head">
            <span>${escapeHtml(label)}</span>
            <button class="gp-multi-filter-clear" type="button"
              data-action="clearGamePlanMultiFilter" data-arg="${escapeHtml(field)}"
              ${selected.length === 0 ? "disabled" : ""}>Clear</button>
          </div>
          <div class="gp-multi-filter-options">
            ${values.map((value) => `
              <label class="gp-multi-filter-option">
                <input type="checkbox"
                  data-onchange="updateGamePlanMultiFilter" data-arg="${escapeHtml(field)}" data-pass="event"
                  data-value="${escapeHtml(value)}"
                  ${selectedSet.has(value) ? "checked" : ""} />
                <span>${escapeHtml(value)}</span>
              </label>`).join("")}
          </div>
        </div>` : ""}
    </div>`;
}


function renderGamePlan() {
  const root = document.getElementById("gameplan");
  if (!root) return;
  if (!Array.isArray(plays) || plays.length === 0) {
    root.innerHTML = `
      <div class="gp-header">
        <div class="gp-header-meta">
          <div class="gp-header-title">🎯 Game Plan</div>
          <div class="gp-header-empty">Import a playbook CSV to start drafting your game plan.</div>
        </div>
      </div>`;
    return;
  }

  const board = _gpEnsureBoard();
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw && gw.opponentName ? gw.opponentName : null;
  const weekLabel = gw && gw.weekLabel ? gw.weekLabel : "";

  const allBoxes = _gpGetBoardBoxes(board);
  const assignedSigs = _gpAllAssignedSigs(board);
  const draftedPlays = _gpAllDraftedPlays(board);
  const renderCtx = _gpCreateRenderContext();
  const totalAssigned = assignedSigs.size;

  const headerHtml = `
    <div class="gp-cmd-bar">
      <div class="gp-cmd-identity">
        <span class="gp-cmd-title">🎯 Game Plan</span>
        ${opponent
      ? `<span class="gp-header-opponent">vs ${escapeHtml(opponent)}</span>`
      : `<span class="gp-header-empty">No opponent — set one in Dashboard</span>`}
        ${weekLabel ? `<span class="gp-header-week">${escapeHtml(weekLabel)}</span>` : ""}
        ${board.sheetTitle ? `<span class="gp-header-template">${escapeHtml(board.sheetTitle)}</span>` : ""}
        <span class="gp-cmd-count">${totalAssigned} plays · ${allBoxes.length} boxes</span>
        ${_gpRenderHealthGauge(board, draftedPlays)}
      </div>
      <div class="gp-cmd-actions">
        <button class="btn btn-sm gp-filters-btn${_gpFilters.showFilters ? " is-active" : ""}" data-action="toggleGamePlanFilters" title="Search &amp; filter the play library" aria-expanded="${_gpFilters.showFilters ? "true" : "false"}">
          🔎 Filters${_gpActiveFilterCount() > 0 ? ` <span class="gp-adv-badge">${_gpActiveFilterCount()}</span>` : ""}
        </button>
        <button class="btn btn-sm btn-primary" data-action="openSmartGamePlanBuilder" title="Recommend a first-draft plan from the playbook">
          🧠 Build Plan
        </button>
        <button class="btn btn-sm btn-success" data-action="openGamePlanPrintModal" title="Print the board-only game plan">
          🖨️ Print
        </button>
        <button class="btn btn-sm btn-primary page-actions-open-btn" data-action="openPageActions" title="Library, Load Wristband, Density, Templates, Clear, and more" aria-haspopup="dialog">
          ⚡ Actions
        </button>
      </div>
    </div>`;

  // Build filter dropdown options from playbook
  const types = [...new Set(plays.map((p) => p.type).filter(Boolean))].sort();
  const formations = [...new Set(plays.map((p) => p.formation).filter(Boolean))].sort();
  const personnel = [...new Set(plays.map((p) => p.personnel).filter(Boolean))].sort();
  const advBadge = _gpAdvancedFilterCount();
  const advancedHtml = _gpFilters.showAdvanced ? `
    <div class="gp-toolbar-advanced">
      ${_gpRenderAdvancedGroup("Situation", [
    _gpRenderAdvancedSelect("basePlay", "Base Play", { title: "Base play family" }),
    _gpRenderAdvancedSelect("tempo", "Tempo"),
    _gpRenderAdvancedSelect("preferredDown", "Down", { values: ["1", "2", "3", "4"] }),
    _gpRenderAdvancedSelect("preferredDistance", "Distance", { values: ["Short", "Medium", "Long"] }),
    _gpRenderAdvancedSelect("preferredSituation", "Situation"),
    _gpRenderAdvancedSelect("preferredFieldPosition", "Field Pos", { title: "Field position" }),
    _gpRenderAdvancedSelect("preferredHash", "Hash", { values: ["Left", "Middle", "Right"], title: "Preferred hash" }),
  ])}
      ${_gpRenderAdvancedGroup("Formation & Call", [
    _gpRenderAdvancedSelect("formTag1", "Form Tag 1"),
    _gpRenderAdvancedSelect("formTag2", "Form Tag 2"),
    _gpRenderAdvancedSelect("under", "Under"),
    _gpRenderAdvancedSelect("back", "Back"),
    _gpRenderAdvancedSelect("shift", "Shift"),
    _gpRenderAdvancedSelect("motion", "Motion"),
    _gpRenderAdvancedSelect("protection", "Protection"),
    _gpRenderAdvancedSelect("lineCall", "Line Call"),
  ])}
      ${_gpRenderAdvancedGroup("Tags & Players", [
    _gpRenderAdvancedText("playName", "Play name contains", "Filter by text in the play name only"),
    _gpRenderAdvancedSelect("playTag1", "Play Tag 1"),
    _gpRenderAdvancedSelect("playTag2", "Play Tag 2"),
    _gpRenderAdvancedSelect("oneWord", "One Word"),
    _gpRenderAdvancedSelect("keyPlayer", "Key Pos", {
      sourceFields: ["keyPlayer1", "keyPlayer2", "keyPlayer3"],
      title: "Key player position",
    }),
    _gpRenderAdvancedSelect("keyPlayerName", "Key Player", {
      sourceFields: ["keyPlayerName1", "keyPlayerName2", "keyPlayerName3"],
      title: "Key player name",
    }),
    _gpRenderAdvancedSelect("constraint", "Constraint", {
      sourceFields: ["constraint1", "constraint2", "constraint3"],
      title: "Constraint or complement",
    }),
    _gpRenderAdvancedSelect("hitChart", "Hit Chart", {
      sourceFields: ["hitChart1", "hitChart2", "hitChart3"],
      title: "Hit chart target",
    }),
  ])}
      ${_gpRenderAdvancedGroup("Defense & Notes", [
    _gpRenderAdvancedSelect("practiceFront", "Front"),
    _gpRenderAdvancedSelect("practiceDefense", "Defense"),
    _gpRenderAdvancedSelect("practiceCoverage", "Coverage"),
    _gpRenderAdvancedSelect("practiceBlitz", "Blitz"),
    _gpRenderAdvancedSelect("practiceStunt", "Stunt"),
    _gpRenderAdvancedSelect("opponent", "Opponent"),
    _gpRenderAdvancedText("deadVs", "Dead vs contains", "Filter by text in Dead Vs"),
    _gpRenderAdvancedText("notes", "Notes contain", "Filter by text in notes"),
  ])}
      ${_gpRenderAdvancedGroup("Output", [
    _gpRenderAdvancedToggle("onlyOpponentTagged", opponent ? `Only tagged for ${escapeHtml(opponent)}` : "Only opponent-tagged", "Only show plays tagged for the current opponent"),
    _gpRenderAdvancedToggle("filterBoxes", "Filter bucket plays", "Apply active filters to plays already drafted in buckets"),
  ])}
    </div>` : "";

  const toolbarHtml = _gpFilters.showFilters ? `
    <div class="gp-filters-drawer" role="region" aria-label="Play filters">
    <div class="gp-toolbar toolbar-surface">
      <input type="search" id="gpSearch" placeholder="Search plays…"
        value="${escapeHtml(_gpFilters.search || "")}"
        data-oninput="updateGamePlanFilter" data-arg="search" data-pass="value" />
      ${_gpRenderMultiFilterDropdown("type", "Play Types", types)}
      <select id="gpFilterFormation" data-onchange="updateGamePlanFilter" data-arg="formation" data-pass="value">
        <option value="">All Formations</option>
        ${formations.map((f) => `<option value="${escapeHtml(f)}" ${f === _gpFilters.formation ? "selected" : ""}>${escapeHtml(f)}</option>`).join("")}
      </select>
      ${_gpRenderMultiFilterDropdown("personnel", "Personnel Groups", personnel)}
      <button class="btn btn-sm btn-secondary" data-action="toggleGamePlanAdvancedFilters"
        title="Toggle advanced filters">
        ⚙️ Advanced${advBadge > 0 ? ` <span class="gp-adv-badge">${advBadge}</span>` : ""}
      </button>
      <label style="display:inline-flex;align-items:center;gap:var(--space-xxs,2px);font-size:var(--font-size-sm);">
        <input type="checkbox" ${_gpFilters.hideAssigned ? "checked" : ""}
          data-onchange="updateGamePlanFilter" data-arg="hideAssigned" data-pass="event" />
        Hide already drafted
      </label>
      <span class="gp-toolbar-spacer"></span>
      <span class="gp-matchup-chip-row">
        <button class="gp-matchup-chip ${_gpFilters.goodVsMan ? "is-on" : ""}"
          data-action="toggleGamePlanMatchupFilter" data-arg="goodVsMan"
          title="Show only plays marked Good vs. Man">✅ Man</button>
        <button class="gp-matchup-chip ${_gpFilters.goodVsBear ? "is-on" : ""}"
          data-action="toggleGamePlanMatchupFilter" data-arg="goodVsBear"
          title="Show only plays marked Good vs. Bear">🐻 Bear</button>
        <button class="gp-matchup-chip ${_gpFilters.goodVsOkie ? "is-on" : ""}"
          data-action="toggleGamePlanMatchupFilter" data-arg="goodVsOkie"
          title="Show only plays marked Good vs. Okie">🤠 Okie</button>
      </span>
      <button class="btn btn-sm btn-secondary" data-action="clearGamePlanFilters" title="Reset all filters">Reset</button>
      <button class="btn btn-sm" data-action="assignSelectedToGamePlanBox" title="Add selected plays to a box you choose">
        ➕ Add Selected to…
      </button>
    </div>
    ${advancedHtml}
    </div>` : "";

  const filtered = _gpFilteredLibrary(board);
  const libraryHtml = `
    <div class="gp-library">
      <div class="gp-library-header">
        <span>Library</span>
        <span class="gp-library-count">${filtered.length} of ${plays.length}${_gpSelected.size > 0 ? ` • ${_gpSelected.size} selected` : ""}</span>
        <button class="btn btn-sm btn-secondary gp-bulk-trigger" data-action="toggleGamePlanBulkSheet" title="Bulk selection actions" aria-haspopup="true">⋯ Bulk</button>
      </div>
      ${_gpShowBulkSheet ? `<div class="gp-bulk-backdrop" data-action="toggleGamePlanBulkSheet" aria-hidden="true"></div>` : ""}
      <div class="gp-library-bulk${_gpShowBulkSheet ? " gp-bulk-open" : ""}">
        <div class="gp-bulk-sheet-header">
          <span>Bulk Actions</span>
          <button class="btn btn-sm gp-bulk-close" data-action="toggleGamePlanBulkSheet" aria-label="Close bulk actions" title="Close">✕</button>
        </div>
        <button class="btn btn-sm btn-secondary" data-action="gpSelectAllVisible" title="Check every play matching current filters">☑ All visible</button>
        <button class="btn btn-sm btn-secondary" data-action="gpClearLibrarySelection" title="Uncheck all">▢ None</button>
        <button class="btn btn-sm btn-secondary" data-action="gpInvertVisibleSelection" title="Invert selection within visible">⇄ Invert</button>
        <button class="btn btn-sm" data-action="gpAddAllVisibleToBox" title="Add every visible play to a box you pick">➕ Add all visible to…</button>
      </div>
      <div class="gp-library-list" id="gpLibraryList">
        ${filtered.length === 0
      ? `<div class="gp-box-empty">No plays match the current filters.</div>`
      : filtered.map((p) => _gpRenderLibraryRow(p, assignedSigs, renderCtx)).join("")}
      </div>
    </div>`;

  const boxesHtml = `
    <div class="gp-boxes gp-density-${escapeHtml(_gpFilters.density)}" id="gpBoxes">
      ${allBoxes.map((b) => _gpRenderBox(b, board, renderCtx)).join("")}
    </div>`;

  setInnerHTML(root, "");
  // Header contains <button> elements which sanitizeHTML strips.
  // Toolbar + boxes contain <input>/<select>/<button>/<textarea>, which
  // sanitizeHTML strips. Build them directly via innerHTML — every
  // user-derived value above already passes through escapeHtml().
  const wrapper = document.createElement("div");
  const distHtml = _gpRenderDistributionStrip(board, draftedPlays);
  const scoreboardHtml = _gpRenderScoreboard(board, draftedPlays);
  const mediaScoreHtml = _gpRenderMediaCompletionScore(board, draftedPlays);
  const touchHtml = _gpRenderTouchTracker(board, draftedPlays);
  const chipsHtml = _gpRenderFilterChips();
  const jumpBarHtml = _gpRenderJumpPills(allBoxes, board);
  const trashZoneHtml = `<div class="gp-trash-zone" id="gpTrashZone" data-trash="1">📥 Drag here to send to Holding · 🗑️ Drag to remove</div>`;
  // Sticky spotlight banner — appears when a coverage tile or touch tile is active.
  let spotlightBannerHtml = "";
  if (_gpFilters.spotlight) {
    const spot = _gpFilters.spotlight;
    let label = "";
    if (spot.kind === "scenario") {
      const sc = GP_COVERAGE_SCENARIOS.find((s) => s.id === spot.id);
      label = sc ? sc.label : spot.id;
    } else if (spot.kind === "player") {
      label = spot.name;
    }
    const matchCount = allBoxes.reduce((n, b) => n + ((board.assignments[b.id] || []).filter(_gpPlayMatchesSpotlight).length), 0);
    spotlightBannerHtml = `
      <div class="gp-spotlight-banner" role="status">
        <span class="gp-spotlight-icon">🔦</span>
        <span class="gp-spotlight-text">Spotlighting <strong>${escapeHtml(label)}</strong> — ${matchCount} matching play${matchCount === 1 ? "" : "s"} highlighted</span>
        <button class="gp-spotlight-clear" data-action="clearGamePlanSpotlight" title="Clear spotlight (Esc)">✕ Clear</button>
      </div>`;
  }
  const statsBarHtml = (distHtml || scoreboardHtml || mediaScoreHtml || touchHtml)
    ? `<div class="gp-stats-bar">${distHtml}${scoreboardHtml}${mediaScoreHtml}${touchHtml}</div>`
    : "";
  wrapper.innerHTML =
    `<div class="gp-command-zone">${headerHtml}${toolbarHtml}</div>` +
    `<div class="gp-board-scroll">${statsBarHtml}${chipsHtml}${jumpBarHtml}${spotlightBannerHtml}${trashZoneHtml}<div class="gp-layout">${libraryHtml}${boxesHtml}</div></div>`;
  while (wrapper.firstChild) root.appendChild(wrapper.firstChild);
  _gpAttachLibraryHandlers();
  _gpAttachBoxHandlers();
  _gpAttachTrashZoneHandlers();
  if (typeof loadGamePlanDiscussionCounts === "function") {
    setTimeout(loadGamePlanDiscussionCounts, 150);
  }
}

function _gpCreateRenderContext() {
  return {
    runtimeIndex: typeof getPlaybookRuntimeIndex === "function"
      ? getPlaybookRuntimeIndex()
      : null,
    sigCache: new WeakMap(),
    callHtmlCache: new WeakMap(),
  };
}

function _gpRenderSig(play, ctx) {
  if (!play || typeof play !== "object") return _gpPlaySignature(play);
  if (ctx && ctx.sigCache && ctx.sigCache.has(play)) return ctx.sigCache.get(play);
  const meta = ctx && ctx.runtimeIndex && ctx.runtimeIndex.byPlay
    ? ctx.runtimeIndex.byPlay.get(play)
    : null;
  const sig = meta && meta.gpSig ? meta.gpSig : _gpPlaySignature(play);
  if (ctx && ctx.sigCache) ctx.sigCache.set(play, sig);
  return sig;
}

function _gpRenderCallHtml(play, ctx) {
  if (!play || typeof play !== "object") return escapeHtml(play?.play || "");
  if (ctx && ctx.callHtmlCache && ctx.callHtmlCache.has(play)) {
    return ctx.callHtmlCache.get(play);
  }
  const html = typeof getFullCall === "function"
    ? getFullCall(play, { showLineCall: false, showEmoji: true })
    : escapeHtml(play.play || "");
  if (ctx && ctx.callHtmlCache) ctx.callHtmlCache.set(play, html);
  return html;
}

function _gpRenderLibraryRow(play, assignedSigs, renderCtx) {
  const sig = _gpRenderSig(play, renderCtx);
  const checked = _gpSelected.has(sig);
  const assigned = assignedSigs.has(sig);
  const callHtml = _gpRenderCallHtml(play, renderCtx);
  const meta = [play.type, play.personnel, play.formation].filter(Boolean).join(" • ");
  return `
    <div class="gp-play-row ${checked ? "is-selected" : ""} ${assigned ? "is-assigned" : ""}"
         draggable="true" data-sig="${escapeHtml(sig)}">
      <input type="checkbox" class="gp-play-row-checkbox" ${checked ? "checked" : ""}
        data-action="toggleGamePlanLibrarySelect" data-arg="${escapeHtml(sig)}" />
      <div class="gp-play-row-body">
        <div>${callHtml}${_gpMatchupBadges(play)}</div>
        ${meta ? `<div class="gp-play-row-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
      ${play.type ? `<span class="gp-play-row-type-badge">${escapeHtml(play.type)}</span>` : ""}
    </div>`;
}

function _gpNormalizeHashLabel(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "l" || s === "left") return "Left";
  if (s === "r" || s === "right") return "Right";
  if (s === "m" || s === "middle" || s === "mid" || s === "center") return "Middle";
  if (s === "any" || s === "either" || s === "both") return null; // no preference
  return null;
}

function _gpRenderBoxHashBar(list) {
  if (!Array.isArray(list) || list.length === 0) return "";
  let left = 0, middle = 0, right = 0;
  list.forEach((p) => {
    const h = _gpNormalizeHashLabel(p.preferredHash);
    if (h === "Left") left += 1;
    else if (h === "Right") right += 1;
    else if (h === "Middle") middle += 1;
  });
  const decided = left + middle + right;
  if (decided === 0) return "";
  const total = list.length;
  const undecided = total - decided;
  const pctL = Math.round((left / decided) * 100);
  const pctM = Math.round((middle / decided) * 100);
  const pctR = 100 - pctL - pctM;
  const tooltip = `Hash split (of ${decided} with a preference${undecided ? `, ${undecided} unset` : ""}): `
    + `Left ${left} (${pctL}%) · Middle ${middle} (${pctM}%) · Right ${right} (${pctR}%)`;
  const segs = [];
  if (left > 0) segs.push(`<span class="gp-hash-seg gp-hash-left" style="flex:${left} 0 0" title="Left ${left}">L ${pctL}%</span>`);
  if (middle > 0) segs.push(`<span class="gp-hash-seg gp-hash-middle" style="flex:${middle} 0 0" title="Middle ${middle}">M ${pctM}%</span>`);
  if (right > 0) segs.push(`<span class="gp-hash-seg gp-hash-right" style="flex:${right} 0 0" title="Right ${right}">R ${pctR}%</span>`);
  return `
    <div class="gp-hash-bar" title="${escapeHtml(tooltip)}">
      <span class="gp-hash-bar-label">Hash</span>
      <div class="gp-hash-bar-track">${segs.join("")}</div>
      ${undecided > 0 ? `<span class="gp-hash-bar-unset" title="${undecided} play${undecided === 1 ? "" : "s"} with no hash preference">${undecided} unset</span>` : ""}
    </div>`;
}

/* -------------------------------------------------------------------------
   Box info popup — describes what a box is for and shows stats
   ------------------------------------------------------------------------- */

// Aggregate stats from a list of plays — used by the info modal and (optionally) print-detail mode.
function _gpComputeBoxStats(list) {
  const tally = (key) => {
    const counts = new Map();
    list.forEach((p) => {
      const v = (p && p[key] ? String(p[key]).trim() : "") || "—";
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  };
  const touches = new Map();
  list.forEach((p) => {
    [p.keyPlayerName1, p.keyPlayerName2, p.keyPlayerName3].forEach((name) => {
      const n = (name || "").trim();
      if (!n) return;
      touches.set(n, (touches.get(n) || 0) + 1);
    });
  });
  const touchList = Array.from(touches.entries()).sort((a, b) => b[1] - a[1]);
  const dd = new Map();
  list.forEach((p) => {
    const d = (p.preferredDown || "").trim();
    const dist = (p.preferredDistance || "").trim();
    if (!d && !dist) return;
    const downSuffix = d === "1" ? "st" : d === "2" ? "nd" : d === "3" ? "rd" : d ? "th" : "";
    const key = `${d ? d + downSuffix : "—"} & ${dist || "—"}`;
    dd.set(key, (dd.get(key) || 0) + 1);
  });
  return {
    type: tally("type"),
    formation: tally("formation"),
    personnel: tally("personnel"),
    basePlay: tally("basePlay"),
    tempo: tally("tempo"),
    situation: tally("preferredSituation"),
    fieldPos: tally("preferredFieldPosition"),
    hash: tally("preferredHash"),
    downDistance: Array.from(dd.entries()).sort((a, b) => b[1] - a[1]),
    touches: touchList,
  };
}

function _gpStatRowHtml(label, entries, opts) {
  const o = opts || {};
  const limit = o.limit || 5;
  const onlyReal = entries.filter(([k]) => k && k !== "—");
  if (onlyReal.length === 0) return "";
  const total = onlyReal.reduce((s, [, n]) => s + n, 0) || 1;
  const top = onlyReal.slice(0, limit);
  const more = onlyReal.length - top.length;
  const chips = top.map(([k, n]) => {
    const pct = Math.round((n / total) * 100);
    return `<span class="gp-info-chip"><strong>${escapeHtml(k)}</strong>`
      + `<span class="gp-info-chip-count">${n}</span>`
      + `<span class="gp-info-chip-pct">${pct}%</span></span>`;
  }).join("");
  const moreLbl = more > 0 ? `<span class="gp-info-chip-more">+${more} more</span>` : "";
  return `
    <div class="gp-info-row">
      <div class="gp-info-row-label">${escapeHtml(label)}</div>
      <div class="gp-info-row-chips">${chips}${moreLbl}</div>
    </div>`;
}

function showGamePlanBoxInfo(boxId) {
  if (!boxId) return;
  const board = _gpEnsureBoard();
  const allBoxes = [GP_HOLDING_BOX, ...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  const box = allBoxes.find((b) => b.id === boxId);
  if (!box) return;
  const list = (board.assignments[boxId] || []).slice();
  const target = Number(board.targets && board.targets[boxId]) || 0;
  const note = (board.notes && board.notes[boxId]) || "";
  const accent = GP_BOX_ACCENTS[boxId] || "var(--color-primary)";
  const desc = GP_BOX_DESCRIPTIONS[boxId];
  const isHolding = boxId === GP_HOLDING_ID;
  const isCustom = (board.customBoxes || []).some((cb) => cb.id === boxId);
  const stats = _gpComputeBoxStats(list);

  const descHtml = desc ? `
    <div class="gp-info-desc">
      <div class="gp-info-desc-row"><strong>Intent:</strong> ${escapeHtml(desc.intent)}</div>
      <div class="gp-info-desc-row"><strong>Use it:</strong> ${escapeHtml(desc.use)}</div>
      <div class="gp-info-desc-row"><strong>Looks like:</strong> ${escapeHtml(desc.looks)}</div>
    </div>` : isHolding ? `
    <div class="gp-info-desc">
      <div class="gp-info-desc-row">Untyped tagged plays land here. Drag them out to any box, or use 🚀 Auto-route to send each play to its matching default box by type.</div>
    </div>` : isCustom ? `
    <div class="gp-info-desc">
      <div class="gp-info-desc-row">Custom box. Use it for situational packages, opponent-specific menus, or anything outside your default play types.</div>
    </div>` : "";

  const noteHtml = note ? `
    <div class="gp-info-note">
      <strong>📝 Your note:</strong> ${escapeHtml(note)}
    </div>` : "";

  const countHtml = `
    <div class="gp-info-count">
      <span class="gp-info-count-num">${list.length}</span>
      <span class="gp-info-count-lbl">play${list.length === 1 ? "" : "s"} drafted${target > 0 ? ` · target <strong>${target}</strong>` : ""}</span>
    </div>`;

  const statsHtml = list.length === 0
    ? `<div class="gp-info-empty">No plays drafted yet — drag from the library or click ➕ Add Play.</div>`
    : [
      _gpStatRowHtml("Touches (key player)", stats.touches, { limit: 8 }),
      _gpStatRowHtml("Type", stats.type, { limit: 6 }),
      _gpStatRowHtml("Formation", stats.formation, { limit: 6 }),
      _gpStatRowHtml("Personnel", stats.personnel, { limit: 6 }),
      _gpStatRowHtml("Down & Distance", stats.downDistance, { limit: 8 }),
      _gpStatRowHtml("Situation", stats.situation, { limit: 6 }),
      _gpStatRowHtml("Field position", stats.fieldPos, { limit: 6 }),
      _gpStatRowHtml("Hash", stats.hash, { limit: 4 }),
      _gpStatRowHtml("Base play", stats.basePlay, { limit: 8 }),
      _gpStatRowHtml("Tempo", stats.tempo, { limit: 4 }),
    ].filter(Boolean).join("");

  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay gp-info-modal-overlay";
  overlay.innerHTML = `
    <div class="custom-modal gp-info-modal" role="dialog" aria-modal="true" aria-labelledby="gpBoxInfoTitle" style="--gp-info-accent:${accent}">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">ℹ️</span>
        <h3 class="custom-modal-title" id="gpBoxInfoTitle">${escapeHtml(box.label)}</h3>
      </div>
      <div class="custom-modal-body">
        ${countHtml}
        ${descHtml}
        ${noteHtml}
        <div class="gp-info-stats">${statsHtml}</div>
      </div>
      <div class="custom-modal-actions">
        <button class="btn custom-modal-btn custom-modal-cancel" data-gp-info-close>Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  const close = () => {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector("[data-gp-info-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  });
}

function _gpRenderBox(box, board, renderCtx) {
  const list = (board.assignments[box.id] || []).slice();
  const visibleList = _gpFilterBoxList(list, board);
  const boxFilterActive = _gpShouldFilterBoxes();
  const isCustom = (board.customBoxes || []).some((cb) => cb.id === box.id);
  const isHolding = box.id === GP_HOLDING_ID;
  const target = Number(board.targets && board.targets[box.id]) || 0;
  const collapsed = Array.isArray(board.collapsed) && board.collapsed.includes(box.id);
  const accent = GP_BOX_ACCENTS[box.id] || "";
  const note = (board.notes && board.notes[box.id]) || "";
  const sortMode = (board.sort && board.sort[box.id]) || "manual";
  const rawIndexByPlay = new Map();
  list.forEach((play, idx) => rawIndexByPlay.set(play, idx));
  const displayList = _gpSortedBoxList(visibleList, sortMode);

  // Per-box variety (unique formations + personnel)
  const uniqForms = new Set();
  const uniqPers = new Set();
  visibleList.forEach((p) => {
    if (p.formation) uniqForms.add(p.formation);
    if (p.personnel) uniqPers.add(p.personnel);
  });
  const varietyHtml = visibleList.length > 0
    ? `<span class="gp-box-variety">${uniqForms.size} form • ${uniqPers.size} pers</span>`
    : "";

  // Progress bar (only if a target is set)
  let progressHtml = "";
  if (target > 0) {
    const pct = Math.min(100, Math.round((list.length / target) * 100));
    const overflow = list.length > target;
    const status = overflow ? "is-over" : list.length >= target ? "is-met" : "";
    progressHtml = `
      <div class="gp-box-progress ${status}" title="${list.length} of ${target} target">
        <div class="gp-box-progress-bar" style="width:${pct}%"></div>
        <span class="gp-box-progress-label">${list.length}/${target}</span>
      </div>`;
  }

  // Hash distribution bar (Left / Middle / Right) — only renders when at
  // least one play in this box declares a preferred hash.
  const visibleOrFullList = boxFilterActive ? visibleList : list;
  const hashHtml = _gpRenderBoxHashBar(visibleOrFullList);

  // Vision Mode: surface variation/directional warnings inline so the
  // staff sees "earned shot" + handedness reminders right in the box.
  let visionWarnHtml = "";
  if (
    typeof isVisionMode === "function" &&
    isVisionMode() &&
    visibleOrFullList.length > 0
  ) {
    const warnings = [];
    try {
      if (typeof _visionVariationWarnings === "function") {
        _visionVariationWarnings(visibleOrFullList).forEach((w) => warnings.push(w));
      }
      if (typeof _visionDirectionalWarnings === "function") {
        _visionDirectionalWarnings(visibleOrFullList).forEach((w) => warnings.push(w));
      }
    } catch (_e) {
      /* ignore */
    }
    if (warnings.length > 0) {
      visionWarnHtml = `
        <div class="gp-vision-warnings" title="Vision Mode reminders">
          ${warnings
          .map(
            (w) =>
              `<div class="gp-vision-warning">⚠️ ${escapeHtml(String(w))}</div>`,
          )
          .join("")}
        </div>`;
    }
  }

  const accentStyle = accent ? `style="--gp-box-accent:${accent}"` : "";
  const holdingAutoBtn = isHolding && list.length > 0
    ? `<button class="btn btn-sm" title="Send each play to its matching default box (by type)"
        data-action="autoRouteHoldingBox">🚀 Auto-route</button>`
    : "";

  const sortDropdown = `
    <select class="gp-box-sort" title="Sort plays in this box"
      data-onchange="setGamePlanBoxSort" data-arg="${escapeHtml(box.id)}" data-pass="value">
      <option value="manual" ${sortMode === "manual" ? "selected" : ""}>Manual</option>
      <option value="type" ${sortMode === "type" ? "selected" : ""}>Type</option>
      <option value="formation" ${sortMode === "formation" ? "selected" : ""}>Formation</option>
      <option value="personnel" ${sortMode === "personnel" ? "selected" : ""}>Personnel</option>
      <option value="basePlay" ${sortMode === "basePlay" ? "selected" : ""}>Base Play</option>
      <option value="hash" ${sortMode === "hash" ? "selected" : ""}>Hash (L/M/R)</option>
      <option value="down" ${sortMode === "down" ? "selected" : ""}>Down</option>
      <option value="distance" ${sortMode === "distance" ? "selected" : ""}>Distance</option>
      <option value="situation" ${sortMode === "situation" ? "selected" : ""}>Situation</option>
      <option value="field" ${sortMode === "field" ? "selected" : ""}>Field Position</option>
      <option value="play" ${sortMode === "play" ? "selected" : ""}>Play Name</option>
    </select>`;
  const countTitle = boxFilterActive
    ? `${visibleList.length} visible of ${list.length} total plays`
    : `${list.length} play${list.length === 1 ? "" : "s"}`;
  const countText = boxFilterActive
    ? `${visibleList.length}/${list.length}`
    : `${list.length}${target > 0 ? `/${target}` : ""}`;
  const filterNote = boxFilterActive && list.length > 0
    ? `<div class="gp-box-filter-note">${visibleList.length} of ${list.length} shown by filters</div>`
    : "";

  const headerHtml = `
    <div class="gp-box-header" data-action="toggleGamePlanBoxCollapse" data-arg="${escapeHtml(box.id)}">
      <div class="gp-box-title">
        <span class="gp-box-chevron">${collapsed ? "▶" : "▼"}</span>
        <span>${escapeHtml(box.label)}</span>
        <span class="gp-box-count" title="${escapeHtml(countTitle)}">${countText}</span>
        ${varietyHtml}
      </div>
      <div class="gp-box-actions" data-stop-toggle="1">
        <button class="btn btn-sm" title="Add a play from the playbook to this box"
          data-action="addPlayToGamePlanBox" data-arg="${escapeHtml(box.id)}">➕ Add Play</button>
        <button class="btn btn-sm" title="Smart fill — pick from plays that match this box's intent"
          data-action="gpSuggestFillBox" data-arg="${escapeHtml(box.id)}">💡 Suggest</button>
        ${sortDropdown}
        ${holdingAutoBtn}
        ${!isHolding && list.length > 0
      ? `<button class="btn btn-sm btn-secondary" title="Push only this box's plays — fans out to all matching call sheet categories"
          data-action="pushGamePlanBoxToCallSheet" data-arg="${escapeHtml(box.id)}">➡️ To Call Sheet</button>`
      : ""}
        ${!isHolding && list.length > 0
      ? `<button class="btn btn-sm btn-secondary" title="Add only this box's plays to a script period"
          data-action="loadGamePlanBoxIntoScript" data-arg="${escapeHtml(box.id)}">📋 To Period</button>`
      : ""}
        ${!isHolding ? (() => {
      const meta = _gpGetBoxMeta(board, box.id);
      const hasRules = _gpHasCriteria(meta.criteria) || !!meta.callSheetCategoryId;
      const summary = _gpFormatBoxMetaSummary(meta);
      return `<button class="btn btn-sm btn-secondary${hasRules ? " gp-btn-active" : ""}" title="${hasRules ? `Matching rules: ${escapeHtml(summary)}` : "Set matching rules — auto-route plays into this box and Push to Call Sheet"}"
          data-action="editGamePlanBoxMatching" data-arg="${escapeHtml(box.id)}">🧩</button>`;
    })() : ""}
        <button class="btn btn-sm btn-secondary" title="${target > 0 ? `Edit target (currently ${target})` : "Set target count"}"
          data-action="setGamePlanBoxTarget" data-arg="${escapeHtml(box.id)}">🎯</button>
        <button class="btn btn-sm btn-secondary" title="${note ? "Edit note" : "Add a note for this box"}"
          data-action="editGamePlanBoxNote" data-arg="${escapeHtml(box.id)}">${note ? "📝" : "📄"}</button>
        <button class="btn btn-sm btn-secondary" title="What goes in this box? View stats and breakdown"
          data-action="showGamePlanBoxInfo" data-arg="${escapeHtml(box.id)}">ℹ️</button>
        ${!isHolding ? `
          <button class="btn btn-sm btn-secondary" title="Move up"
            data-action="moveGamePlanBoxUp" data-arg="${escapeHtml(box.id)}">↑</button>
          <button class="btn btn-sm btn-secondary" title="Move down"
            data-action="moveGamePlanBoxDown" data-arg="${escapeHtml(box.id)}">↓</button>
          <button class="btn btn-sm btn-secondary" title="Rename this box"
            data-action="renameAnyGamePlanBox" data-arg="${escapeHtml(box.id)}">✏️</button>
          <button class="btn btn-sm btn-secondary" title="Hide this box (Manage Boxes to restore)"
            data-action="hideGamePlanBox" data-arg="${escapeHtml(box.id)}">👁️‍🗨️</button>
        ` : ""}
        ${isCustom
      ? `<button class="btn btn-sm btn-danger" title="Delete box"
              data-action="deleteGamePlanBox" data-arg="${escapeHtml(box.id)}">🗑️</button>`
      : ""}
        <button class="btn btn-sm" title="Clear plays in this box"
          data-action="clearGamePlanBox" data-arg="${escapeHtml(box.id)}">⨯</button>
      </div>
    </div>
    ${progressHtml}
    ${hashHtml}
    ${visionWarnHtml}
    ${filterNote}
    ${note ? `<div class="gp-box-note" title="Edit note"
      data-action="editGamePlanBoxNote" data-arg="${escapeHtml(box.id)}">${escapeHtml(note)}</div>` : ""}`;

  const bodyHtml = collapsed ? "" : `
      <div class="gp-box-body" data-box-drop="${escapeHtml(box.id)}">
        ${displayList.length === 0
      ? `<div class="gp-box-empty">${boxFilterActive && list.length > 0
        ? "No plays in this bucket match the current filters."
        : isHolding
          ? "Untyped tagged plays land here. Drag them out to any box, or click 🚀 Auto-route."
          : "Drop plays here, or click ➕ Add Play."}</div>`
      : displayList.map((p, idx) => _gpRenderBoxPlay(
        box.id,
        p,
        idx,
        sortMode === "manual",
        rawIndexByPlay.get(p),
        renderCtx,
      )).join("")}
      </div>`;

  // Spotlight: highlight boxes that contain at least one matching play; dim others.
  const spot = _gpFilters.spotlight;
  let spotlightClass = "";
  if (spot) {
    const hasMatch = list.some((p) => _gpPlayMatchesSpotlight(p));
    spotlightClass = hasMatch ? " gp-box-spotlight" : " gp-box-dim";
    // Holding never gets dimmed — it's the staging area, always relevant.
    if (isHolding && !hasMatch) spotlightClass = "";
  }

  return `
    <div class="gp-box${isHolding ? " gp-box-holding" : ""}${collapsed ? " is-collapsed" : ""}${spotlightClass}"
         ${accentStyle}
         data-box-id="${escapeHtml(box.id)}">
      ${headerHtml}
      ${bodyHtml}
    </div>`;
}

function _gpRenderBoxPlay(boxId, play, idx, allowReorder, rawIdx, renderCtx) {
  const sig = _gpRenderSig(play, renderCtx);
  const stableRawIdx = _gpNormalizeBoxPlayIndex(rawIdx);
  const actionArg = _gpBuildBoxPlayArg(boxId, sig, stableRawIdx);
  const callHtml = _gpRenderCallHtml(play, renderCtx);
  const meta = [play.formation, play.personnel].filter(Boolean).join(" • ");
  const matchupBadges = _gpMatchupBadges(play);
  const scoutBadge = _gpScoutBadge(play);
  const isSpotlit = _gpPlayMatchesSpotlight(play);
  const wbOn = _gpHasFlag(play, "wb");
  const jvOn = _gpHasFlag(play, "jv");
  const flagClasses = `${wbOn ? " gp-flag-wb" : ""}${jvOn ? " gp-flag-jv" : ""}`;
  const discPlayId = typeof getPlayThreadId === "function" ? getPlayThreadId(play) : null;
  const discAttr = discPlayId ? ` data-disc-play-id="${escapeHtml(discPlayId)}"` : "";
  const discBtn = discPlayId
    ? `<button class="gp-box-play-disc" data-action="openGamePlanPlayDiscussion" data-arg="${escapeHtml(discPlayId)}" title="View discussion">💬<span class="gp-disc-badge hidden"></span></button>`
    : "";
  const reorderBtns = allowReorder ? `
    <button class="gp-box-play-btn gp-box-play-up" aria-label="Move up"
      data-action="moveGamePlanPlayUp" data-arg="${escapeHtml(actionArg)}" title="Move up">▲</button>
    <button class="gp-box-play-btn gp-box-play-down" aria-label="Move down"
      data-action="moveGamePlanPlayDown" data-arg="${escapeHtml(actionArg)}" title="Move down">▼</button>` : "";
  const flagBtns = `
    <button class="gp-box-play-flag gp-box-play-flag-wb${wbOn ? " is-on" : ""}"
      role="checkbox" aria-checked="${wbOn ? "true" : "false"}" aria-label="Send to wristband"
      data-action="toggleGamePlanPlayFlag" data-arg="${escapeHtml(_gpBuildBoxPlayArg(boxId, sig, stableRawIdx, { flag: "wb" }))}"
      title="Mark for wristband">📋</button>
    <button class="gp-box-play-flag gp-box-play-flag-jv${jvOn ? " is-on" : ""}"
      role="checkbox" aria-checked="${jvOn ? "true" : "false"}" aria-label="JV / freshmen play"
      data-action="toggleGamePlanPlayFlag" data-arg="${escapeHtml(_gpBuildBoxPlayArg(boxId, sig, stableRawIdx, { flag: "jv" }))}"
      title="Mark as JV / freshmen play">🟡</button>`;
  return `
    <div class="gp-box-play${isSpotlit ? " is-spotlit" : ""}${flagClasses}" draggable="true"
         data-box-id="${escapeHtml(boxId)}"
         data-sig="${escapeHtml(sig)}"
         data-idx="${idx}"
         data-raw-idx="${stableRawIdx === null ? "" : stableRawIdx}"${discAttr}>
      <div class="gp-box-play-body">
        <div class="gp-box-play-call">${callHtml}${matchupBadges}</div>
        ${meta || scoutBadge ? `<div class="gp-box-play-meta">${meta ? escapeHtml(meta) : ""}${scoutBadge}</div>` : ""}
      </div>
      <div class="gp-box-play-actions">
        ${discBtn}
        ${flagBtns}
        ${reorderBtns}
        <button class="gp-box-play-btn" aria-label="Move to another box"
          data-action="moveGamePlanPlay" data-arg="${escapeHtml(actionArg)}" title="Move to…">↔</button>
        <button class="gp-box-play-remove" aria-label="Remove from box"
          data-action="removeFromGamePlanBox"
          data-arg="${escapeHtml(actionArg)}" title="Remove">×</button>
      </div>
    </div>`;
}

function _gpMatchupBadges(play) {
  if (!play) return "";
  const parts = [];
  if (play.goodVsMan) parts.push(`<span class="gp-matchup-badge" title="Good vs. Man">✅</span>`);
  if (play.goodVsBear) parts.push(`<span class="gp-matchup-badge" title="Good vs. Bear">🐻</span>`);
  if (play.goodVsOkie) parts.push(`<span class="gp-matchup-badge" title="Good vs. Okie">🤠</span>`);
  return parts.length ? ` <span class="gp-matchup-badges">${parts.join("")}</span>` : "";
}

// #117-119: Scout source badge — shows if GP play is scout-recommended + why
function _gpScoutBadge(play) {
  if (typeof _tdScoutRecs === "undefined" || !Array.isArray(_tdScoutRecs) || !_tdScoutRecs.length) return "";
  if (typeof playsMatch !== "function") return "";
  const rec = _tdScoutRecs.find((r) => playsMatch(r.play, play));
  if (!rec) return "";
  const reasons = Array.isArray(rec.reasons) && rec.reasons.length > 0 ? rec.reasons : [];
  // Confidence: 3 = all 3 factors, 2 = 2 factors, 1 = 1 factor
  const conf = reasons.length >= 3 ? "high" : reasons.length === 2 ? "med" : "low";
  const tip = reasons.length > 0 ? `Scout: ${reasons.join(" · ")}` : "Scout recommended";
  return `<span class="gp-scout-badge gp-scout-${conf}" title="${escapeHtml(tip)}">🔍${reasons.length > 0 ? " " + escapeHtml(reasons[0]) : ""}</span>`;
}

/* Sort helpers for per-box sort modes.
 * mode may be a single string (one field) or an array of field names for
 * tiered sorting (primary, secondary, tertiary, ...). */
function _gpSortedBoxList(list, mode) {
  if (!Array.isArray(list)) return list;
  const tiers = Array.isArray(mode)
    ? mode.filter((m) => m && m !== "manual")
    : (mode && mode !== "manual" ? [mode] : []);
  if (tiers.length === 0) return list;
  const hashRank = (h) => {
    const n = (_gpNormalizeHashLabel(h) || "").toString();
    if (n === "Left") return "1";
    if (n === "Middle") return "2";
    if (n === "Right") return "3";
    return "9";
  };
  const distRank = (d) => {
    const s = String(d || "").toLowerCase();
    if (s.startsWith("short")) return "1";
    if (s.startsWith("med")) return "2";
    if (s.startsWith("long")) return "3";
    return "9";
  };
  const getField = (p, m) => {
    if (m === "type") return p.type || "";
    if (m === "formation") return p.formation || "";
    if (m === "personnel") return p.personnel || "";
    if (m === "basePlay") return p.basePlay || p.play || "";
    if (m === "hash") return hashRank(p.preferredHash);
    if (m === "down") return String(p.preferredDown || "9");
    if (m === "distance") return distRank(p.preferredDistance);
    if (m === "situation") return p.preferredSituation || "";
    if (m === "field") return p.preferredFieldPosition || "";
    if (m === "play") return p.play || "";
    return "";
  };
  return list.slice().sort((a, b) => {
    for (const m of tiers) {
      const av = getField(a, m);
      const bv = getField(b, m);
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

function _gpAdvancedFilterCount() {
  const f = _gpFilters;
  const keys = typeof GP_ADVANCED_FILTER_KEYS !== "undefined"
    ? GP_ADVANCED_FILTER_KEYS
    : [
      "basePlay", "tempo", "preferredDown", "preferredDistance",
      "preferredSituation", "preferredFieldPosition",
      "onlyOpponentTagged", "filterBoxes",
    ];
  return keys.reduce((total, key) => total + (f[key] ? 1 : 0), 0);
}

function toggleGamePlanAdvancedFilters() {
  _gpFilters.showAdvanced = !_gpFilters.showAdvanced;
  requestRenderGamePlan();
}

// Redesign: toggle the 🔎 Filters drawer (desktop slide-down / mobile sheet).
function toggleGamePlanFilters() {
  _gpFilters.showFilters = !_gpFilters.showFilters;
  requestRenderGamePlan();
}

// Total active filters (for the Filters button badge). Counts search, play
// type(s), formation, personnel, matchup chips, hide-drafted, plus advanced.
function _gpActiveFilterCount() {
  const f = _gpFilters;
  let n = 0;
  if (f.search && f.search.trim()) n += 1;
  if (Array.isArray(f.type) && f.type.length) n += f.type.length;
  if (f.formation) n += 1;
  if (Array.isArray(f.personnel) && f.personnel.length) n += f.personnel.length;
  if (f.goodVsMan) n += 1;
  if (f.goodVsBear) n += 1;
  if (f.goodVsOkie) n += 1;
  if (f.hideAssigned) n += 1;
  n += _gpAdvancedFilterCount();
  return n;
}

// Phone-only: toggle the bulk-operations action sheet. On larger screens the
// bulk bar is always shown inline, so this only matters under shell-phone.
function toggleGamePlanBulkSheet() {
  _gpShowBulkSheet = !_gpShowBulkSheet;
  requestRenderGamePlan();
}

/* -------------------------------------------------------------------------
   Active filter chips
   ------------------------------------------------------------------------- */

const _GP_CHIP_LABELS = {
  search: { icon: "🔎", label: (v) => `“${v}”` },
  type: { icon: "🏷️", label: () => _gpFormatChipMultiLabel("type") },
  formation: { icon: "📐", label: (v) => v },
  personnel: { icon: "🧮", label: () => _gpFormatChipMultiLabel("personnel") },
  basePlay: { icon: "🌳", label: (v) => v },
  tempo: { icon: "⏱️", label: (v) => v },
  preferredDown: { icon: "🔢", label: (v) => `Down ${v}` },
  preferredDistance: { icon: "📏", label: (v) => v },
  preferredSituation: { icon: "🕒", label: (v) => v },
  preferredFieldPosition: { icon: "🟩", label: (v) => v },
  preferredHash: { icon: "#", label: (v) => `Hash ${v}` },
  formTag1: { icon: "F1", label: (v) => v },
  formTag2: { icon: "F2", label: (v) => v },
  under: { icon: "UC", label: (v) => v },
  back: { icon: "B", label: (v) => v },
  shift: { icon: "↔", label: (v) => v },
  motion: { icon: "→", label: (v) => v },
  protection: { icon: "P", label: (v) => v },
  lineCall: { icon: "OL", label: (v) => v },
  playName: { icon: "▶", label: (v) => `Play: ${v}` },
  playTag1: { icon: "T1", label: (v) => v },
  playTag2: { icon: "T2", label: (v) => v },
  oneWord: { icon: "1W", label: (v) => v },
  practiceFront: { icon: "FR", label: (v) => v },
  practiceDefense: { icon: "D", label: (v) => v },
  practiceCoverage: { icon: "CV", label: (v) => v },
  practiceBlitz: { icon: "BL", label: (v) => v },
  practiceStunt: { icon: "ST", label: (v) => v },
  keyPlayer: { icon: "KP", label: (v) => v },
  keyPlayerName: { icon: "👤", label: (v) => v },
  constraint: { icon: "⛓", label: (v) => v },
  hitChart: { icon: "🎯", label: (v) => v },
  deadVs: { icon: "🚫", label: (v) => `Dead vs: ${v}` },
  opponent: { icon: "OP", label: (v) => v },
  notes: { icon: "📝", label: (v) => `Notes: ${v}` },
  onlyOpponentTagged: { icon: "🎯", label: () => "Opponent-tagged" },
  hideAssigned: { icon: "🙈", label: () => "Hide drafted" },
  filterBoxes: { icon: "🧺", label: () => "Filter buckets" },
  goodVsMan: { icon: "✅", label: () => "vs. Man" },
  goodVsBear: { icon: "🐻", label: () => "vs. Bear" },
  goodVsOkie: { icon: "🤠", label: () => "vs. Okie" },
};

function _gpRenderFilterChips() {
  const f = _gpFilters;
  const chips = [];
  Object.keys(_GP_CHIP_LABELS).forEach((k) => {
    const v = f[k];
    const hasValue = typeof _gpFilterHasValue === "function"
      ? _gpFilterHasValue(v)
      : Boolean(v);
    if (!hasValue) return;
    const cfg = _GP_CHIP_LABELS[k];
    chips.push(`
      <button class="gp-chip" data-action="clearGamePlanFilterField" data-arg="${escapeHtml(k)}"
        title="Clear this filter">
        <span class="gp-chip-icon">${cfg.icon}</span>
        <span class="gp-chip-label">${escapeHtml(cfg.label(v))}</span>
        <span class="gp-chip-x">×</span>
      </button>`);
  });
  if (chips.length === 0) return "";
  return `
    <div class="gp-chip-bar">
      <span class="gp-chip-bar-label">Filters:</span>
      ${chips.join("")}
      <button class="gp-chip gp-chip-clear" data-action="clearGamePlanFilters" title="Clear all filters">
        <span class="gp-chip-x">×</span> Clear all
      </button>
    </div>`;
}

function clearGamePlanFilterField(field) {
  if (!field) return;
  if (!(field in _gpFilters)) return;
  if (typeof _gpFilters[field] === "boolean") _gpFilters[field] = false;
  else if (Array.isArray(_gpFilters[field])) _gpFilters[field] = [];
  else _gpFilters[field] = "";
  requestRenderGamePlan();
}

/* -------------------------------------------------------------------------
   Distribution stat strip + scoreboard
   ------------------------------------------------------------------------- */

function _gpAllDraftedPlays(board) {
  const out = [];
  Object.entries(board.assignments || {}).forEach(([boxId, arr]) => {
    if (boxId === GP_HOLDING_ID) return; // exclude holding from distribution
    (arr || []).forEach((p) => out.push(p));
  });
  return out;
}

function _gpRenderDistributionStrip(board, draftedPlays) {
  const drafted = Array.isArray(draftedPlays)
    ? draftedPlays
    : _gpAllDraftedPlays(board);
  if (drafted.length === 0) return "";
  const buckets = {
    Run: 0, Pass: 0, Screen: 0, Quick: 0, "Play Action": 0,
    RPO: 0, "Run Option": 0, Movement: 0,
  };
  drafted.forEach((p) => {
    const t = GP_TYPE_ALIASES[p.type] || p.type || "Other";
    if (t in buckets) buckets[t] += 1;
    else buckets[t] = (buckets[t] || 0) + 1;
  });
  const segs = Object.entries(buckets)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const pct = (count / drafted.length) * 100;
      const accent = GP_BOX_ACCENTS[name] || "var(--color-text-muted)";
      return `
        <span class="gp-dist-seg" style="flex:${count} 0 0;background:${accent}"
          title="${escapeHtml(name)}: ${count} (${pct.toFixed(0)}%)">
          <span class="gp-dist-seg-label">${escapeHtml(name)} ${pct.toFixed(0)}%</span>
        </span>`;
    });
  return `<div class="gp-dist-strip" title="Distribution across drafted plays (excludes Holding)">${segs.join("")}</div>`;
}

function _gpRenderScoreboard(board, draftedPlays) {
  const drafted = Array.isArray(draftedPlays)
    ? draftedPlays
    : _gpAllDraftedPlays(board);
  const spot = _gpFilters.spotlight;
  // Desktop: keep the scoreboard open as a thin, always-visible bar.
  const scoreboardOpen = document.body?.classList.contains("is-mobile-screen")
    ? ""
    : " open";
  const tiles = GP_COVERAGE_SCENARIOS.map((s) => {
    const count = drafted.filter(s.match).length;
    let status = "ok";
    if (count === 0) status = "empty";
    else if (count <= 2) status = "warn";
    const isActive = spot && spot.kind === "scenario" && spot.id === s.id;
    return `
      <button class="gp-score-tile gp-score-${status}${isActive ? " is-active" : ""}"
        data-action="applyGamePlanScenario" data-arg="${escapeHtml(s.id)}"
        title="${count === 0 ? `No plays for ${s.label} yet — click to highlight matching buckets` : `${count} drafted • click to spotlight matching buckets`}">
        <span class="gp-score-label">${escapeHtml(s.label)}</span>
        <span class="gp-score-count">${count}</span>
      </button>`;
  }).join("");
  if (drafted.length === 0) {
    return `
      <details class="gp-scoreboard"${scoreboardOpen}>
        <summary>📋 Coverage</summary>
        <div class="gp-score-grid">${tiles}</div>
      </details>`;
  }
  return `
    <details class="gp-scoreboard"${scoreboardOpen}>
      <summary>📋 Coverage</summary>
      <div class="gp-score-grid">${tiles}</div>
    </details>`;
}

function _gpMediaStatusForPlay(play) {
  return {
    hasDiagram: Boolean(
      play &&
      window.playImages &&
      typeof window.playImages.hasForPlay === "function" &&
      window.playImages.hasForPlay(play)
    ),
    hasVideo: Boolean(
      play &&
      window.playClips &&
      typeof window.playClips.hasForPlay === "function" &&
      window.playClips.hasForPlay(play)
    ),
  };
}

function _gpUniqueDraftedPlays(drafted) {
  const unique = new Map();
  (drafted || []).forEach((play) => {
    if (!play || typeof play !== "object") return;
    const sig = _gpPlaySignature(play) || JSON.stringify([
      play.personnel || "",
      play.formation || "",
      play.play || "",
      play.basePlay || "",
    ]);
    if (!unique.has(sig)) unique.set(sig, play);
  });
  return [...unique.values()];
}

function _gpRenderMediaCompletionScore(board, draftedPlays) {
  const drafted = Array.isArray(draftedPlays)
    ? draftedPlays
    : _gpAllDraftedPlays(board);
  const uniquePlays = _gpUniqueDraftedPlays(drafted);
  const total = uniquePlays.length;
  const media = uniquePlays.reduce(
    (acc, play) => {
      const status = _gpMediaStatusForPlay(play);
      if (status.hasDiagram) acc.diagrams += 1;
      if (status.hasVideo) acc.videos += 1;
      if (status.hasDiagram && status.hasVideo) acc.shown += 1;
      return acc;
    },
    { diagrams: 0, videos: 0, shown: 0 },
  );
  const diagramPct = total ? media.diagrams / total : 0;
  const videoPct = total ? media.videos / total : 0;
  const score = total ? Math.round((diagramPct * 85) + (videoPct * 15)) : 0;
  const status = score >= 85 ? "ok" : score >= 60 ? "warn" : "empty";
  const scoreboardOpen = document.body?.classList.contains("is-mobile-screen")
    ? ""
    : " open";
  const summaryText = total
    ? `🖼️ Diagrams ${score}`
    : "🖼️ Diagrams";
  return `
    <details class="gp-scoreboard gp-media-scoreboard"${scoreboardOpen}
      title="Play diagram completion uses unique drafted plays; videos add bonus credit.">
      <summary>${summaryText}</summary>
      <div class="gp-score-grid gp-media-score-grid">
        <div class="gp-score-tile gp-score-${status} gp-score-media-total"
          title="Completion score: diagrams are 85% of the score, videos add a 15% bonus.">
          <span class="gp-score-label">Media Score</span>
          <span class="gp-score-count">${score}</span>
        </div>
        <div class="gp-score-tile ${media.diagrams === total && total ? "gp-score-ok" : media.diagrams ? "gp-score-warn" : "gp-score-empty"}"
          title="${media.diagrams} of ${total} unique drafted plays have diagrams.">
          <span class="gp-score-label">Diagrams</span>
          <span class="gp-score-count">${media.diagrams}/${total}</span>
        </div>
        <div class="gp-score-tile ${media.videos ? "gp-score-ok" : "gp-score-empty"}"
          title="${media.videos} of ${total} unique drafted plays have video clips.">
          <span class="gp-score-label">Video Bonus</span>
          <span class="gp-score-count">${media.videos}</span>
        </div>
        <div class="gp-score-tile ${media.shown ? "gp-score-ok" : "gp-score-empty"}"
          title="${media.shown} unique drafted plays have both a diagram and a video clip.">
          <span class="gp-score-label">Shown</span>
          <span class="gp-score-count">${media.shown}</span>
        </div>
      </div>
    </details>`;
}

function applyGamePlanScenario(id) {
  const sc = GP_COVERAGE_SCENARIOS.find((s) => s.id === id);
  if (!sc) return;
  const alreadyActive = _gpFilters.spotlight
    && _gpFilters.spotlight.kind === "scenario"
    && _gpFilters.spotlight.id === id;
  if (alreadyActive) {
    // Toggle off: clear spotlight + clear the library filters that were applied.
    _gpFilters.spotlight = null;
    Object.keys(sc.filters).forEach((k) => { _gpFilters[k] = ""; });
  } else {
    // Apply: set library filters AND turn on spotlight to highlight matching boxes/plays.
    Object.entries(sc.filters).forEach(([k, v]) => { _gpFilters[k] = v; });
    _gpFilters.showAdvanced = true;
    _gpFilters.spotlight = { kind: "scenario", id };
  }
  requestRenderGamePlan();
}

/* -------------------------------------------------------------------------
   Box jump pill bar
   ------------------------------------------------------------------------- */

function _gpRenderJumpPills(allBoxes, board) {
  const pills = allBoxes.map((b) => {
    const list = board.assignments[b.id] || [];
    const target = Number(board.targets && board.targets[b.id]) || 0;
    const accent = GP_BOX_ACCENTS[b.id] || "";
    const accentStyle = accent ? `style="--gp-box-accent:${accent}"` : "";
    const status = target > 0 && list.length >= target ? " is-met" : "";
    return `
      <button class="gp-jump-pill${status}" ${accentStyle}
        data-action="jumpToGamePlanBox" data-arg="${escapeHtml(b.id)}"
        title="Jump to ${escapeHtml(b.label)}">
        <span class="gp-jump-pill-label">${escapeHtml(b.label)}</span>
        <span class="gp-jump-pill-count">${list.length}${target > 0 ? `/${target}` : ""}</span>
      </button>`;
  }).join("");
  return `<div class="gp-jump-bar" id="gpJumpBar">${pills}</div>`;
}

function jumpToGamePlanBox(boxId) {
  if (!boxId) return;
  const el = document.querySelector(`.gp-box[data-box-id="${CSS.escape(boxId)}"]`);
  if (!el) return;
  // Scroll within .gp-board-scroll only — NOT scrollIntoView, which also
  // programmatically scrolls #mainApp (overflow:hidden allows JS scrollTop
  // changes) and hides the tab bar.
  const scrollArea = document.querySelector(".gp-board-scroll");
  const doScroll = (target) => {
    if (scrollArea) {
      const areaRect = scrollArea.getBoundingClientRect();
      const elRect = target.getBoundingClientRect();
      const targetTop = scrollArea.scrollTop + (elRect.top - areaRect.top) - 12;
      scrollArea.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
    target.classList.add("gp-box-flash");
    setTimeout(() => target.classList.remove("gp-box-flash"), 900);
  };
  // If the box is collapsed, expand first so the user actually sees content
  if (el.classList.contains("is-collapsed")) {
    toggleGamePlanBoxCollapse(boxId);
    requestAnimationFrame(() => {
      const re = document.querySelector(`.gp-box[data-box-id="${CSS.escape(boxId)}"]`);
      if (re) doScroll(re);
    });
    return;
  }
  doScroll(el);
}

/* -------------------------------------------------------------------------
   Drag & Drop wiring (native HTML5 dnd) — DELEGATED
   ------------------------------------------------------------------------- */

// All drag listeners are attached ONCE at module init on document, in
// capture phase. Per-render attachment is fragile: a re-render between
// the user's mousedown and the browser's dragstart (e.g. a debounced
// search/filter, or a state autosave that re-renders) replaces the row
// element, so its dragstart listener never fires. Document-level
// delegation can never be lost mid-gesture.
