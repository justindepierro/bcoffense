/* =========================================================================
   Game Plan tab — drafting board for assigning plays into theoretical buckets
   - Source: full playbook, user-filtered
   - Default boxes: Run / Pass / Screen / Quick / Play Action / RPO /
     Run Option / Movement
   - Custom boxes: user-defined name (added at runtime, persisted per opponent)
   - Persistence: standalone, keyed by opponent name
   - Push-to-Call-Sheet: copies plays into matching call sheet category
   ========================================================================= */

const GP_DEFAULT_BOXES = [
  { id: "Run", label: "Run" },
  { id: "Pass", label: "Pass" },
  { id: "Screen", label: "Screen" },
  { id: "Quick", label: "Quick" },
  { id: "Play Action", label: "Play Action" },
  { id: "RPO", label: "RPO" },
  { id: "Run Option", label: "Run Option" },
  { id: "Movement", label: "Movement" },
];

// Special holding box — always present, shown first, excluded from Push to Call Sheet
const GP_HOLDING_ID = "__holding";
const GP_HOLDING_BOX = { id: GP_HOLDING_ID, label: "📥 Holding" };

// Map game-plan box id → call sheet category id (for "Push to Call Sheet")
const GP_BOX_TO_CALLSHEET = {
  Run: "base-run",
  Pass: "base-pass",
  Screen: "screen",
  Quick: "quick",
  "Play Action": "play-action",
  RPO: "rpos",
  "Run Option": "run-options",
  Movement: "movement",
};

// In-memory state
let _gpFilters = {
  search: "",
  type: "",
  formation: "",
  personnel: "",
  hideAssigned: false,
  density: "comfortable", // "comfortable" | "compact" | "detail"
  showProgress: true,
  goodVsMan: false,
  goodVsBear: false,
  goodVsOkie: false,
};
let _gpSelected = new Set(); // play signatures currently checked in library
let _gpDragPayload = null; // { sigs: [...] } for native HTML5 dnd
let _gpDragSource = null; // { boxId, sig } for box → box / box → library

// Type-alias map (used by Send to Game Plan + Holding auto-route)
const GP_TYPE_ALIASES = {
  "Play Pass": "Play Action",
  "Drop": "Pass",
};

// Color accents per default box id (CSS uses [data-box-id] attribute selectors
// but we also set a CSS variable so custom boxes can fall back gracefully)
const GP_BOX_ACCENTS = {
  Run: "#d97706",
  Pass: "#2563eb",
  Screen: "#0891b2",
  Quick: "#7c3aed",
  "Play Action": "#db2777",
  RPO: "#16a34a",
  "Run Option": "#65a30d",
  Movement: "#9333ea",
};

/* -------------------------------------------------------------------------
   Storage helpers
   ------------------------------------------------------------------------- */

function _gpStorageKey() {
  return "gamePlanBoards";
}

function _gpLoadBoards() {
  return storageManager.get(_gpStorageKey(), {});
}

function _gpSaveBoards(boards) {
  storageManager.set(_gpStorageKey(), boards);
}

function _gpActiveOpponentKey() {
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  return (gw && gw.opponentName) ? gw.opponentName : "__unassigned__";
}

function _gpEnsureBoard() {
  const all = _gpLoadBoards();
  const key = _gpActiveOpponentKey();
  if (!all[key]) {
    all[key] = {
      assignments: {},   // boxId → array of play snapshots
      customBoxes: [],   // [{ id, label }]
      targets: {},       // boxId → number target (per-box)
      collapsed: [],     // [boxId, ...] collapsed box ids
    };
    GP_DEFAULT_BOXES.forEach((b) => {
      all[key].assignments[b.id] = [];
    });
    all[key].assignments[GP_HOLDING_ID] = [];
    _gpSaveBoards(all);
  } else {
    GP_DEFAULT_BOXES.forEach((b) => {
      if (!Array.isArray(all[key].assignments[b.id])) {
        all[key].assignments[b.id] = [];
      }
    });
    if (!Array.isArray(all[key].assignments[GP_HOLDING_ID])) {
      all[key].assignments[GP_HOLDING_ID] = [];
    }
    if (!Array.isArray(all[key].customBoxes)) all[key].customBoxes = [];
    if (!all[key].targets || typeof all[key].targets !== "object") all[key].targets = {};
    if (!Array.isArray(all[key].collapsed)) all[key].collapsed = [];
    all[key].customBoxes.forEach((cb) => {
      if (!Array.isArray(all[key].assignments[cb.id])) {
        all[key].assignments[cb.id] = [];
      }
    });
    _gpSaveBoards(all);
  }
  return all[key];
}

function _gpUpdateBoard(mutator) {
  const all = _gpLoadBoards();
  const key = _gpActiveOpponentKey();
  if (!all[key]) {
    all[key] = { assignments: {}, customBoxes: [] };
    GP_DEFAULT_BOXES.forEach((b) => { all[key].assignments[b.id] = []; });
    all[key].assignments[GP_HOLDING_ID] = [];
  }
  mutator(all[key]);
  _gpSaveBoards(all);
}

/* -------------------------------------------------------------------------
   Play signatures (used to identify a play across renders)
   ------------------------------------------------------------------------- */

function _gpPlaySignature(play) {
  if (!play) return "";
  return [
    play.type, play.personnel, play.formation, play.formTag1, play.formTag2,
    play.under, play.back, play.shift, play.motion, play.protection,
    play.lineCall, play.play, play.playTag1, play.playTag2, play.basePlay,
    play.oneWord,
  ].map((v) => (v == null ? "" : String(v))).join("|");
}

function _gpFindPlayBySig(sig) {
  if (!Array.isArray(plays)) return null;
  return plays.find((p) => _gpPlaySignature(p) === sig) || null;
}

function _gpAllAssignedSigs(board) {
  const set = new Set();
  Object.values(board.assignments || {}).forEach((arr) => {
    (arr || []).forEach((p) => set.add(_gpPlaySignature(p)));
  });
  return set;
}

/* -------------------------------------------------------------------------
   Filtering library
   ------------------------------------------------------------------------- */

function _gpFilteredLibrary(board) {
  if (!Array.isArray(plays)) return [];
  const search = (_gpFilters.search || "").trim().toLowerCase();
  const assignedSigs = _gpAllAssignedSigs(board);

  return plays.filter((p) => {
    if (_gpFilters.type && p.type !== _gpFilters.type) return false;
    if (_gpFilters.formation && p.formation !== _gpFilters.formation) return false;
    if (_gpFilters.personnel && p.personnel !== _gpFilters.personnel) return false;
    if (_gpFilters.goodVsMan && !p.goodVsMan) return false;
    if (_gpFilters.goodVsBear && !p.goodVsBear) return false;
    if (_gpFilters.goodVsOkie && !p.goodVsOkie) return false;
    if (_gpFilters.hideAssigned && assignedSigs.has(_gpPlaySignature(p))) return false;
    if (search) {
      const hay = [
        p.type, p.personnel, p.formation, p.formTag1, p.formTag2,
        p.back, p.shift, p.motion, p.protection, p.lineCall,
        p.play, p.playTag1, p.playTag2, p.basePlay, p.oneWord, p.notes,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

/* -------------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------------- */

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

  const allBoxes = [
    GP_HOLDING_BOX,
    ...GP_DEFAULT_BOXES,
    ...(board.customBoxes || []),
  ];
  const assignedSigs = _gpAllAssignedSigs(board);
  const totalAssigned = assignedSigs.size;

  const headerHtml = `
    <div class="gp-header">
      <div class="gp-header-meta">
        <div class="gp-header-title">
          🎯 Game Plan
          ${opponent
            ? `<span class="gp-header-opponent">vs ${escapeHtml(opponent)}</span>`
            : `<span class="gp-header-empty">No opponent set — pick one in the Dashboard to keep boards per opponent</span>`}
          ${weekLabel ? `<span class="gp-header-week">${escapeHtml(weekLabel)}</span>` : ""}
        </div>
        <div class="gp-header-week">${totalAssigned} plays drafted across ${allBoxes.length} boxes</div>
      </div>
      <div class="gp-header-actions">
        <button class="btn btn-sm" data-action="addGamePlanCustomBox" title="Add a free-form drafting box">
          ➕ Custom Box
        </button>
        <button class="btn btn-sm" data-action="expandAllGamePlanBoxes" title="Expand every box">
          ▼ Expand All
        </button>
        <button class="btn btn-sm" data-action="collapseAllGamePlanBoxes" title="Collapse every box">
          ▶ Collapse All
        </button>
        <button class="btn btn-sm" data-action="cycleGamePlanDensity" title="Toggle density (Comfortable / Compact / Detail)">
          ${_gpFilters.density === "compact" ? "▭" : _gpFilters.density === "detail" ? "🗂️" : "▥"} ${_gpFilters.density.charAt(0).toUpperCase() + _gpFilters.density.slice(1)}
        </button>
        <button class="btn btn-sm" data-action="openGamePlanStats" title="Show variety stats across all drafted plays">
          📊 Variety Stats
        </button>
        <button class="btn btn-sm" data-action="pushGamePlanToCallSheet" title="Copy drafted plays into the call sheet">
          ➡️ Push to Call Sheet
        </button>
        <button class="btn btn-sm" data-action="printGamePlan" title="Print game plan">
          🖨️ Print
        </button>
        <button class="btn btn-sm btn-danger" data-action="clearGamePlanBoard" title="Remove every play from every box for this opponent">
          🗑️ Clear All
        </button>
      </div>
    </div>`;

  // Build filter dropdown options from playbook
  const types = [...new Set(plays.map((p) => p.type).filter(Boolean))].sort();
  const formations = [...new Set(plays.map((p) => p.formation).filter(Boolean))].sort();
  const personnel = [...new Set(plays.map((p) => p.personnel).filter(Boolean))].sort();

  const toolbarHtml = `
    <div class="gp-toolbar">
      <input type="search" id="gpSearch" placeholder="Search plays…"
        value="${escapeHtml(_gpFilters.search || "")}"
        data-oninput="updateGamePlanFilter" data-arg="search" data-pass="value" />
      <select id="gpFilterType" data-onchange="updateGamePlanFilter" data-arg="type" data-pass="value">
        <option value="">All Types</option>
        ${types.map((t) => `<option value="${escapeHtml(t)}" ${t === _gpFilters.type ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
      </select>
      <select id="gpFilterFormation" data-onchange="updateGamePlanFilter" data-arg="formation" data-pass="value">
        <option value="">All Formations</option>
        ${formations.map((f) => `<option value="${escapeHtml(f)}" ${f === _gpFilters.formation ? "selected" : ""}>${escapeHtml(f)}</option>`).join("")}
      </select>
      <select id="gpFilterPersonnel" data-onchange="updateGamePlanFilter" data-arg="personnel" data-pass="value">
        <option value="">All Personnel</option>
        ${personnel.map((p) => `<option value="${escapeHtml(p)}" ${p === _gpFilters.personnel ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
      </select>
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
    </div>`;

  const filtered = _gpFilteredLibrary(board);
  const libraryHtml = `
    <div class="gp-library">
      <div class="gp-library-header">
        <span>Library</span>
        <span class="gp-library-count">${filtered.length} of ${plays.length} plays</span>
      </div>
      <div class="gp-library-list" id="gpLibraryList">
        ${filtered.length === 0
          ? `<div class="gp-box-empty">No plays match the current filters.</div>`
          : filtered.map((p) => _gpRenderLibraryRow(p, assignedSigs)).join("")}
      </div>
    </div>`;

  const boxesHtml = `
    <div class="gp-boxes gp-density-${escapeHtml(_gpFilters.density)}" id="gpBoxes">
      ${allBoxes.map((b) => _gpRenderBox(b, board)).join("")}
    </div>`;

  setInnerHTML(root, headerHtml + toolbarHtml + `<div class="gp-layout">${libraryHtml}${boxesHtml}</div>`);
  _gpAttachLibraryHandlers();
  _gpAttachBoxHandlers();
}

function _gpRenderLibraryRow(play, assignedSigs) {
  const sig = _gpPlaySignature(play);
  const checked = _gpSelected.has(sig);
  const assigned = assignedSigs.has(sig);
  const callHtml = typeof getFullCall === "function"
    ? getFullCall(play, { showLineCall: false })
    : escapeHtml(play.play || "");
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

function _gpRenderBox(box, board) {
  const list = board.assignments[box.id] || [];
  const isCustom = (board.customBoxes || []).some((cb) => cb.id === box.id);
  const isHolding = box.id === GP_HOLDING_ID;
  const target = Number(board.targets && board.targets[box.id]) || 0;
  const collapsed = Array.isArray(board.collapsed) && board.collapsed.includes(box.id);
  const accent = GP_BOX_ACCENTS[box.id] || "";

  // Per-box variety (unique formations + personnel)
  const uniqForms = new Set();
  const uniqPers = new Set();
  list.forEach((p) => {
    if (p.formation) uniqForms.add(p.formation);
    if (p.personnel) uniqPers.add(p.personnel);
  });
  const varietyHtml = list.length > 0
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

  const accentStyle = accent ? `style="--gp-box-accent:${accent}"` : "";
  const holdingAutoBtn = isHolding && list.length > 0
    ? `<button class="btn btn-sm" title="Send each play to its matching default box (by type)"
        data-action="autoRouteHoldingBox">🚀 Auto-route</button>`
    : "";

  const headerHtml = `
    <div class="gp-box-header" data-action="toggleGamePlanBoxCollapse" data-arg="${escapeHtml(box.id)}">
      <div class="gp-box-title">
        <span class="gp-box-chevron">${collapsed ? "▶" : "▼"}</span>
        <span>${escapeHtml(box.label)}</span>
        <span class="gp-box-count">${list.length}${target > 0 ? `/${target}` : ""}</span>
        ${varietyHtml}
      </div>
      <div class="gp-box-actions" data-stop-toggle="1">
        ${holdingAutoBtn}
        <button class="btn btn-sm btn-secondary" title="${target > 0 ? `Edit target (currently ${target})` : "Set target count"}"
          data-action="setGamePlanBoxTarget" data-arg="${escapeHtml(box.id)}">🎯</button>
        ${isCustom
          ? `<button class="btn btn-sm btn-secondary" title="Rename"
              data-action="renameGamePlanBox" data-arg="${escapeHtml(box.id)}">✏️</button>
             <button class="btn btn-sm btn-danger" title="Delete box"
              data-action="deleteGamePlanBox" data-arg="${escapeHtml(box.id)}">🗑️</button>`
          : ""}
        <button class="btn btn-sm" title="Clear plays in this box"
          data-action="clearGamePlanBox" data-arg="${escapeHtml(box.id)}">⨯</button>
      </div>
    </div>
    ${progressHtml}`;

  const bodyHtml = collapsed ? "" : `
      <div class="gp-box-body" data-box-drop="${escapeHtml(box.id)}">
        ${list.length === 0
          ? `<div class="gp-box-empty">${isHolding
              ? "Untyped tagged plays land here. Drag them out to any box, or click 🚀 Auto-route."
              : "Drop plays here, or use “Add Selected to…”."}</div>`
          : list.map((p, idx) => _gpRenderBoxPlay(box.id, p, idx)).join("")}
      </div>`;

  return `
    <div class="gp-box${isHolding ? " gp-box-holding" : ""}${collapsed ? " is-collapsed" : ""}"
         ${accentStyle}
         data-box-id="${escapeHtml(box.id)}">
      ${headerHtml}
      ${bodyHtml}
    </div>`;
}

function _gpRenderBoxPlay(boxId, play, idx) {
  const sig = _gpPlaySignature(play);
  const callHtml = typeof getFullCall === "function"
    ? getFullCall(play, { showLineCall: false })
    : escapeHtml(play.play || "");
  const meta = [play.formation, play.personnel].filter(Boolean).join(" • ");
  const matchupBadges = _gpMatchupBadges(play);
  return `
    <div class="gp-box-play" draggable="true"
         data-box-id="${escapeHtml(boxId)}"
         data-sig="${escapeHtml(sig)}"
         data-idx="${idx}">
      <div class="gp-box-play-body">
        <div class="gp-box-play-call">${callHtml}${matchupBadges}</div>
        ${meta ? `<div class="gp-box-play-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
      <div class="gp-box-play-actions">
        <button class="gp-box-play-btn" aria-label="Move to another box"
          data-action="moveGamePlanPlay" data-arg="${escapeHtml(boxId + "::" + sig)}" title="Move to…">↔</button>
        <button class="gp-box-play-remove" aria-label="Remove from box"
          data-action="removeFromGamePlanBox"
          data-arg="${escapeHtml(boxId + "::" + sig)}" title="Remove">×</button>
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

/* -------------------------------------------------------------------------
   Drag & Drop wiring (native HTML5 dnd)
   ------------------------------------------------------------------------- */

function _gpAttachLibraryHandlers() {
  const list = document.getElementById("gpLibraryList");
  if (!list) return;
  list.querySelectorAll(".gp-play-row[draggable='true']").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      const sig = row.dataset.sig;
      // If the user has multi-selected, drag all selected; otherwise drag this row only.
      const sigs = _gpSelected.size > 0 && _gpSelected.has(sig)
        ? Array.from(_gpSelected)
        : [sig];
      _gpDragPayload = { sigs, source: "library" };
      _gpDragSource = null;
      try { e.dataTransfer.setData("text/plain", sigs.join("\n")); } catch (_e) { /* ignore */ }
      e.dataTransfer.effectAllowed = "copyMove";
    });
    row.addEventListener("dragend", () => {
      _gpDragPayload = null;
    });
  });
}

function _gpAttachBoxHandlers() {
  const boxes = document.querySelectorAll(".gp-box");
  boxes.forEach((box) => {
    const boxId = box.dataset.boxId;
    const dropZone = box.querySelector(".gp-box-body");
    if (!dropZone) return;

    dropZone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      box.classList.add("is-drop-target");
    });
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = _gpDragSource ? "move" : "copy";
    });
    dropZone.addEventListener("dragleave", (e) => {
      // Only remove highlight if leaving the box entirely
      if (!box.contains(e.relatedTarget)) {
        box.classList.remove("is-drop-target");
      }
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      box.classList.remove("is-drop-target");
      if (_gpDragSource) {
        // box → box move
        _gpMoveBetweenBoxes(_gpDragSource.boxId, boxId, _gpDragSource.sig);
        _gpDragSource = null;
      } else if (_gpDragPayload && Array.isArray(_gpDragPayload.sigs)) {
        _gpAddSigsToBox(_gpDragPayload.sigs, boxId);
        _gpDragPayload = null;
      }
    });
  });

  // Drag from a box (existing assignment)
  document.querySelectorAll(".gp-box-play[draggable='true']").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      _gpDragSource = { boxId: row.dataset.boxId, sig: row.dataset.sig };
      _gpDragPayload = null;
      try { e.dataTransfer.setData("text/plain", row.dataset.sig || ""); } catch (_e) { /* ignore */ }
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      _gpDragSource = null;
    });
  });
}

/* -------------------------------------------------------------------------
   Mutations
   ------------------------------------------------------------------------- */

function _gpAddSigsToBox(sigs, boxId) {
  if (!Array.isArray(sigs) || sigs.length === 0 || !boxId) return;
  let added = 0;
  let skipped = 0;
  _gpUpdateBoard((board) => {
    if (!Array.isArray(board.assignments[boxId])) board.assignments[boxId] = [];
    const existingSigs = new Set(board.assignments[boxId].map((p) => _gpPlaySignature(p)));
    sigs.forEach((sig) => {
      if (existingSigs.has(sig)) { skipped += 1; return; }
      const play = _gpFindPlayBySig(sig);
      if (!play) { skipped += 1; return; }
      board.assignments[boxId].push({ ...play });
      existingSigs.add(sig);
      added += 1;
    });
  });
  _gpSelected.clear();
  renderGamePlan();
  if (added > 0) {
    showToast(`Added ${added} play${added === 1 ? "" : "s"} to ${boxId}${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
      { type: "success" });
  } else if (skipped > 0) {
    showToast(`No plays added — ${skipped} were already in the box.`, { type: "warning" });
  }
}

function _gpMoveBetweenBoxes(fromBoxId, toBoxId, sig) {
  if (!fromBoxId || !toBoxId || fromBoxId === toBoxId) return;
  _gpUpdateBoard((board) => {
    const fromArr = board.assignments[fromBoxId] || [];
    const idx = fromArr.findIndex((p) => _gpPlaySignature(p) === sig);
    if (idx < 0) return;
    const [play] = fromArr.splice(idx, 1);
    if (!Array.isArray(board.assignments[toBoxId])) board.assignments[toBoxId] = [];
    const exists = board.assignments[toBoxId].some((p) => _gpPlaySignature(p) === sig);
    if (!exists) board.assignments[toBoxId].push(play);
  });
  renderGamePlan();
}

function removeFromGamePlanBox(combined) {
  if (!combined) return;
  const sepIdx = combined.indexOf("::");
  if (sepIdx < 0) return;
  const boxId = combined.slice(0, sepIdx);
  const sig = combined.slice(sepIdx + 2);
  _gpUpdateBoard((board) => {
    const arr = board.assignments[boxId] || [];
    const idx = arr.findIndex((p) => _gpPlaySignature(p) === sig);
    if (idx >= 0) arr.splice(idx, 1);
  });
  renderGamePlan();
}

async function clearGamePlanBox(boxId) {
  if (!boxId) return;
  const ok = await showConfirm(
    `Clear all plays from <strong>${escapeHtml(boxId)}</strong>?`,
    { title: "Clear Box", icon: "⨯", confirmText: "Clear", danger: true },
  );
  if (!ok) return;
  _gpUpdateBoard((board) => {
    board.assignments[boxId] = [];
  });
  renderGamePlan();
  showToast(`Cleared ${boxId}`, { type: "success" });
}

async function clearGamePlanBoard() {
  const ok = await showConfirm(
    "Remove every drafted play from every box for this opponent?",
    { title: "Clear Game Plan", icon: "🗑️", confirmText: "Clear All", danger: true },
  );
  if (!ok) return;
  _gpUpdateBoard((board) => {
    Object.keys(board.assignments).forEach((k) => { board.assignments[k] = []; });
  });
  renderGamePlan();
  showToast("Game plan cleared", { type: "success" });
}

/* -------------------------------------------------------------------------
   Library selection + filters
   ------------------------------------------------------------------------- */

function toggleGamePlanLibrarySelect(sig) {
  if (!sig) return;
  if (_gpSelected.has(sig)) _gpSelected.delete(sig);
  else _gpSelected.add(sig);
  // Light re-render of just the row classes — easier to re-render whole list
  renderGamePlan();
}

function updateGamePlanFilter(field, valueOrEvent) {
  if (!field) return;
  if (field === "hideAssigned") {
    if (valueOrEvent && valueOrEvent.target) {
      _gpFilters.hideAssigned = !!valueOrEvent.target.checked;
    } else {
      _gpFilters.hideAssigned = !!valueOrEvent;
    }
  } else {
    _gpFilters[field] = valueOrEvent || "";
  }
  renderGamePlan();
}

function clearGamePlanFilters() {
  _gpFilters = { search: "", type: "", formation: "", personnel: "", hideAssigned: false,
    density: _gpFilters.density || "comfortable", showProgress: true,
    goodVsMan: false, goodVsBear: false, goodVsOkie: false };
  _gpSelected.clear();
  renderGamePlan();
}

function toggleGamePlanMatchupFilter(field) {
  if (!field) return;
  if (!(field in _gpFilters)) return;
  _gpFilters[field] = !_gpFilters[field];
  renderGamePlan();
}

/* -------------------------------------------------------------------------
   Click-to-assign (selected plays → chosen box)
   ------------------------------------------------------------------------- */

async function assignSelectedToGamePlanBox() {
  if (_gpSelected.size === 0) {
    showToast("Check one or more plays in the library first.", { type: "warning" });
    return;
  }
  const board = _gpEnsureBoard();
  const allBoxes = [GP_HOLDING_BOX, ...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  const choice = await showListPicker(
    `Add ${_gpSelected.size} selected play${_gpSelected.size === 1 ? "" : "s"} to which box?`,
    allBoxes.map((b) => ({ value: b.id, label: b.label })),
    { title: "Add to Box", icon: "➕" },
  );
  if (!choice) return;
  _gpAddSigsToBox(Array.from(_gpSelected), choice);
}

/* -------------------------------------------------------------------------
   Custom boxes
   ------------------------------------------------------------------------- */

async function addGamePlanCustomBox() {
  const name = await showPrompt(
    "Name your custom drafting box (e.g. “4-Min Closers”, “Trick Plays”):",
    "",
    { title: "New Custom Box", icon: "➕", placeholder: "Box name" },
  );
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  // Avoid id collisions with default boxes
  let id = trimmed;
  let n = 2;
  const board = _gpEnsureBoard();
  const taken = new Set([
    ...GP_DEFAULT_BOXES.map((b) => b.id),
    ...(board.customBoxes || []).map((b) => b.id),
  ]);
  while (taken.has(id)) {
    id = `${trimmed} ${n++}`;
  }
  _gpUpdateBoard((b) => {
    b.customBoxes = b.customBoxes || [];
    b.customBoxes.push({ id, label: trimmed });
    b.assignments[id] = [];
  });
  renderGamePlan();
  showToast(`Added box “${trimmed}”`, { type: "success" });
}

async function renameGamePlanBox(boxId) {
  if (!boxId) return;
  const board = _gpEnsureBoard();
  const cb = (board.customBoxes || []).find((b) => b.id === boxId);
  if (!cb) return;
  const next = await showPrompt("Rename this box:", cb.label, { title: "Rename Box", icon: "✏️" });
  if (!next || !next.trim() || next.trim() === cb.label) return;
  _gpUpdateBoard((b) => {
    const target = (b.customBoxes || []).find((x) => x.id === boxId);
    if (target) target.label = next.trim();
  });
  renderGamePlan();
}

async function deleteGamePlanBox(boxId) {
  if (!boxId) return;
  const ok = await showConfirm(
    `Delete custom box <strong>${escapeHtml(boxId)}</strong> and discard its plays?`,
    { title: "Delete Box", icon: "🗑️", confirmText: "Delete", danger: true },
  );
  if (!ok) return;
  _gpUpdateBoard((b) => {
    b.customBoxes = (b.customBoxes || []).filter((x) => x.id !== boxId);
    delete b.assignments[boxId];
  });
  renderGamePlan();
}

/* -------------------------------------------------------------------------
   Variety stats modal
   ------------------------------------------------------------------------- */

function openGamePlanStats() {
  const board = _gpEnsureBoard();
  const allPlays = [];
  Object.values(board.assignments || {}).forEach((arr) => {
    (arr || []).forEach((p) => allPlays.push(p));
  });
  if (allPlays.length === 0) {
    showToast("No plays drafted yet.", { type: "warning" });
    return;
  }

  const tally = (key) => {
    const map = new Map();
    allPlays.forEach((p) => {
      const v = (p[key] || "").trim();
      if (!v) return;
      map.set(v, (map.get(v) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };

  const card = (title, rows) => `
    <div class="gp-stats-card">
      <div class="gp-stats-card-title">${escapeHtml(title)}</div>
      <div class="gp-stats-list">
        ${rows.length === 0
          ? `<div class="gp-stats-row"><span class="gp-stats-row-value">—</span></div>`
          : rows.map(([v, c]) => `
            <div class="gp-stats-row">
              <span class="gp-stats-row-value">${escapeHtml(v)}</span>
              <span class="gp-stats-row-count">${c}</span>
            </div>`).join("")}
      </div>
    </div>`;

  const html = `
    <div class="gp-stats-grid">
      ${card("Type", tally("type"))}
      ${card("Personnel", tally("personnel"))}
      ${card("Formation", tally("formation"))}
      ${card("Base Play / Family", tally("basePlay"))}
      ${card("Protection", tally("protection"))}
      ${card("Tempo", tally("tempo"))}
    </div>`;

  showModal(html, { title: `📊 Variety — ${allPlays.length} drafted plays` });
}

/* -------------------------------------------------------------------------
   Push to call sheet
   ------------------------------------------------------------------------- */

async function pushGamePlanToCallSheet() {
  if (typeof callSheet !== "object" || !callSheet) {
    showToast("Call sheet isn't ready yet.", { type: "error" });
    return;
  }
  const board = _gpEnsureBoard();
  const summary = GP_DEFAULT_BOXES
    .map((b) => {
      const list = board.assignments[b.id] || [];
      const target = GP_BOX_TO_CALLSHEET[b.id];
      return list.length > 0 && target
        ? `<li>${escapeHtml(b.label)} → <code>${escapeHtml(target)}</code> (${list.length})</li>`
        : null;
    })
    .filter(Boolean)
    .join("");
  if (!summary) {
    showToast("No drafted plays to push.", { type: "warning" });
    return;
  }
  const choice = await showChoice(
    `<p>Push drafted plays into the call sheet?</p>
     <ul style="margin:var(--space-xs) 0 var(--space-sm) var(--space-md);font-size:var(--font-size-sm);">${summary}</ul>
     <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);">Custom boxes are not pushed (no matching call sheet category).</p>`,
    {
      title: "Push to Call Sheet",
      icon: "➡️",
      option1: "Append to existing",
      option2: "Replace target categories",
    },
  );
  if (!choice) return;
  const replace = choice === "option2";
  let pushed = 0;
  GP_DEFAULT_BOXES.forEach((b) => {
    const list = board.assignments[b.id] || [];
    const target = GP_BOX_TO_CALLSHEET[b.id];
    if (!target || list.length === 0) return;
    if (!callSheet[target]) callSheet[target] = { left: [], right: [] };
    if (replace) {
      callSheet[target].left = [];
      callSheet[target].right = [];
    }
    list.forEach((p) => {
      const exists = (callSheet[target].left || []).some((x) => playsMatch(x, p))
        || (callSheet[target].right || []).some((x) => playsMatch(x, p));
      if (exists) return;
      callSheet[target].left.push({
        ...p,
        playType: p.type,
        wristbandNumber: null,
        highlighted: false,
        highlightColor: null,
        borderColor: null,
        cellBg: null,
        cellTextColor: null,
        cellBold: false,
        cellItalic: false,
        cellUnderline: false,
        cellStrikethrough: false,
        cellFontSize: null,
        cellNote: null,
      });
      pushed += 1;
    });
  });
  if (typeof saveCallSheet === "function") saveCallSheet();
  showToast(`Pushed ${pushed} play${pushed === 1 ? "" : "s"} to the call sheet`,
    { type: "success", duration: 3000 });
}

/* -------------------------------------------------------------------------
   Print
   ------------------------------------------------------------------------- */

function printGamePlan() {
  // Rely on print.css scoping; just trigger native print.
  window.print();
}

/* -------------------------------------------------------------------------
   Send tagged plays from the dashboard's active game plan to the boxes
   - Plays whose `type` matches a default box go directly into that box
   - Plays whose `type` doesn't match any default box go into the Holding box
   - Plays already assigned somewhere on the board are skipped
   ------------------------------------------------------------------------- */

async function sendDashboardGamePlanToBoxes() {
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw && gw.opponentName ? gw.opponentName : null;
  if (!opponent) {
    showToast("Pick an opponent on the Dashboard first.", { type: "warning" });
    return;
  }
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("No playbook loaded.", { type: "warning" });
    return;
  }
  const tagged = plays.filter((p) => isPlayTaggedForOpponent(p, opponent));
  if (tagged.length === 0) {
    showToast(`No plays tagged for ${opponent} yet.`, { type: "warning" });
    return;
  }

  const board = _gpEnsureBoard();
  const assignedSigs = _gpAllAssignedSigs(board);
  const defaultIds = new Set(GP_DEFAULT_BOXES.map((b) => b.id));

  // Group tagged plays by destination box id
  const byBox = {};
  let alreadyAssigned = 0;
  tagged.forEach((play) => {
    const sig = _gpPlaySignature(play);
    if (assignedSigs.has(sig)) { alreadyAssigned += 1; return; }
    const mappedType = GP_TYPE_ALIASES[play.type] || play.type;
    const dest = defaultIds.has(mappedType) ? mappedType : GP_HOLDING_ID;
    if (!byBox[dest]) byBox[dest] = [];
    byBox[dest].push(sig);
  });

  const totalToAdd = Object.values(byBox).reduce((n, arr) => n + arr.length, 0);
  if (totalToAdd === 0) {
    showToast(
      `All ${tagged.length} tagged play${tagged.length === 1 ? "" : "s"} already on the board.`,
      { type: "info" },
    );
    return;
  }

  const summaryLines = Object.entries(byBox)
    .map(([boxId, sigs]) => {
      const label = boxId === GP_HOLDING_ID ? "📥 Holding" : boxId;
      return `• ${label}: ${sigs.length}`;
    })
    .join("\n");
  const ok = await showConfirm(
    `Send ${totalToAdd} tagged play${totalToAdd === 1 ? "" : "s"} for ${opponent} into the boxes?\n\n${summaryLines}${alreadyAssigned > 0 ? `\n\n(${alreadyAssigned} already on the board, will be skipped.)` : ""}`,
    { title: "Send to Game Plan", icon: "🎯", confirmText: "Send" },
  );
  if (!ok) return;

  let added = 0;
  _gpUpdateBoard((b) => {
    Object.entries(byBox).forEach(([boxId, sigs]) => {
      if (!Array.isArray(b.assignments[boxId])) b.assignments[boxId] = [];
      const existing = new Set(b.assignments[boxId].map((p) => _gpPlaySignature(p)));
      sigs.forEach((sig) => {
        if (existing.has(sig)) return;
        const play = _gpFindPlayBySig(sig);
        if (!play) return;
        b.assignments[boxId].push({ ...play });
        existing.add(sig);
        added += 1;
      });
    });
  });

  renderGamePlan();
  const holdingCount = (byBox[GP_HOLDING_ID] || []).length;
  showToast(
    `Sent ${added} play${added === 1 ? "" : "s"} to game plan${holdingCount > 0 ? ` (${holdingCount} in Holding)` : ""}`,
    { type: "success" },
  );

  // Navigate to the gameplan tab so the user sees the result
  if (typeof showTab === "function") showTab("gameplan");
}

/* -------------------------------------------------------------------------
   Box collapse / targets / density / move / holding auto-route
   ------------------------------------------------------------------------- */

function toggleGamePlanBoxCollapse(boxId) {
  if (!boxId) return;
  _gpUpdateBoard((board) => {
    if (!Array.isArray(board.collapsed)) board.collapsed = [];
    const idx = board.collapsed.indexOf(boxId);
    if (idx >= 0) board.collapsed.splice(idx, 1);
    else board.collapsed.push(boxId);
  });
  renderGamePlan();
}

function expandAllGamePlanBoxes() {
  _gpUpdateBoard((board) => { board.collapsed = []; });
  renderGamePlan();
}

function collapseAllGamePlanBoxes() {
  _gpUpdateBoard((board) => {
    const allIds = [
      GP_HOLDING_ID,
      ...GP_DEFAULT_BOXES.map((b) => b.id),
      ...(board.customBoxes || []).map((b) => b.id),
    ];
    board.collapsed = allIds.slice();
  });
  renderGamePlan();
}

async function setGamePlanBoxTarget(boxId) {
  if (!boxId) return;
  const board = _gpEnsureBoard();
  const current = Number(board.targets && board.targets[boxId]) || 0;
  const value = await showPrompt(
    `Set target play count for this box.\nLeave blank or 0 to clear.`,
    current > 0 ? String(current) : "",
    { title: "Box Target", icon: "🎯", placeholder: "e.g. 12" },
  );
  if (value === null) return;
  const num = Math.max(0, Math.floor(Number(value) || 0));
  _gpUpdateBoard((b) => {
    if (!b.targets || typeof b.targets !== "object") b.targets = {};
    if (num > 0) b.targets[boxId] = num;
    else delete b.targets[boxId];
  });
  renderGamePlan();
}

function cycleGamePlanDensity() {
  const order = ["comfortable", "compact", "detail"];
  const idx = order.indexOf(_gpFilters.density || "comfortable");
  _gpFilters.density = order[(idx + 1) % order.length];
  renderGamePlan();
  showToast(`Density: ${_gpFilters.density}`, { duration: 1200 });
}

async function moveGamePlanPlay(combined) {
  if (!combined) return;
  const sepIdx = combined.indexOf("::");
  if (sepIdx < 0) return;
  const fromBoxId = combined.slice(0, sepIdx);
  const sig = combined.slice(sepIdx + 2);
  const board = _gpEnsureBoard();
  const choices = [
    GP_HOLDING_BOX,
    ...GP_DEFAULT_BOXES,
    ...(board.customBoxes || []),
  ]
    .filter((b) => b.id !== fromBoxId)
    .map((b) => ({ value: b.id, label: b.label }));
  if (choices.length === 0) return;
  const dest = await showListPicker(
    "Move this play to which box?",
    choices,
    { title: "Move Play", icon: "↔" },
  );
  if (!dest) return;
  _gpMoveBetweenBoxes(fromBoxId, dest, sig);
}

function autoRouteHoldingBox() {
  const board = _gpEnsureBoard();
  const holding = (board.assignments[GP_HOLDING_ID] || []).slice();
  if (holding.length === 0) {
    showToast("Holding is empty.", { duration: 1500 });
    return;
  }
  const defaultIds = new Set(GP_DEFAULT_BOXES.map((b) => b.id));
  let routed = 0;
  let leftBehind = 0;
  _gpUpdateBoard((b) => {
    const stillHolding = [];
    holding.forEach((play) => {
      const mapped = GP_TYPE_ALIASES[play.type] || play.type;
      if (defaultIds.has(mapped)) {
        if (!Array.isArray(b.assignments[mapped])) b.assignments[mapped] = [];
        const sig = _gpPlaySignature(play);
        const exists = b.assignments[mapped].some((p) => _gpPlaySignature(p) === sig);
        if (!exists) b.assignments[mapped].push(play);
        routed += 1;
      } else {
        stillHolding.push(play);
        leftBehind += 1;
      }
    });
    b.assignments[GP_HOLDING_ID] = stillHolding;
  });
  renderGamePlan();
  if (routed === 0) {
    showToast("No plays in Holding had a matching default box.", { type: "warning" });
  } else {
    showToast(
      `Routed ${routed} play${routed === 1 ? "" : "s"} from Holding${leftBehind > 0 ? ` (${leftBehind} stayed)` : ""}`,
      { type: "success" },
    );
  }
}

/* -------------------------------------------------------------------------
   Init
   ------------------------------------------------------------------------- */

function initGamePlan() {
  _gpEnsureBoard();
  renderGamePlan();
}
