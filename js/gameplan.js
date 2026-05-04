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
  basePlay: "",
  tempo: "",
  preferredDown: "",
  preferredDistance: "",
  preferredSituation: "",
  preferredFieldPosition: "",
  onlyOpponentTagged: false,
  hideAssigned: false,
  density: "comfortable", // "comfortable" | "compact" | "detail"
  showProgress: true,
  goodVsMan: false,
  goodVsBear: false,
  goodVsOkie: false,
  showAdvanced: false,
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

// Scenario coverage scoreboard — each item maps to a real-world game situation
// the coach should have plays ready for. Click a tile to auto-apply the
// matching filter set on the library.
const GP_COVERAGE_SCENARIOS = [
  { id: "1st-down", label: "1st Down",
    filters: { preferredDown: "1" },
    match: (p) => p.preferredDown === "1" },
  { id: "3rd-short", label: "3rd & Short",
    filters: { preferredDown: "3", preferredDistance: "Short" },
    match: (p) => p.preferredDown === "3" && p.preferredDistance === "Short" },
  { id: "3rd-med", label: "3rd & Med",
    filters: { preferredDown: "3", preferredDistance: "Medium" },
    match: (p) => p.preferredDown === "3" && p.preferredDistance === "Medium" },
  { id: "3rd-long", label: "3rd & Long",
    filters: { preferredDown: "3", preferredDistance: "Long" },
    match: (p) => p.preferredDown === "3" && p.preferredDistance === "Long" },
  { id: "rz", label: "Red Zone",
    filters: { preferredFieldPosition: "Lo-RZ" },
    match: (p) => p.preferredFieldPosition === "Lo-RZ" || p.preferredFieldPosition === "Hi-RZ" },
  { id: "goal-line", label: "Goal Line",
    filters: { preferredFieldPosition: "Goal Line" },
    match: (p) => p.preferredFieldPosition === "Goal Line" },
  { id: "backed-up", label: "Backed Up",
    filters: { preferredFieldPosition: "Backed Up" },
    match: (p) => p.preferredFieldPosition === "Backed Up" },
  { id: "2-min", label: "2 Min",
    filters: { preferredSituation: "2 Minute" },
    match: (p) => p.preferredSituation === "2 Minute" },
  { id: "4-min", label: "4 Min",
    filters: { preferredSituation: "4 Minute" },
    match: (p) => p.preferredSituation === "4 Minute" },
];

// Snapshots (saved named plans) storage
const GP_SNAPSHOTS_KEY = "gamePlanSnapshots";

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
      notes: {},         // boxId → string note
      sort: {},          // boxId → "manual" | "type" | "formation" | "personnel" | "basePlay"
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
    if (!all[key].notes || typeof all[key].notes !== "object") all[key].notes = {};
    if (!all[key].sort || typeof all[key].sort !== "object") all[key].sort = {};
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
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw && gw.opponentName ? gw.opponentName : null;

  return plays.filter((p) => {
    if (_gpFilters.type && p.type !== _gpFilters.type) return false;
    if (_gpFilters.formation && p.formation !== _gpFilters.formation) return false;
    if (_gpFilters.personnel && p.personnel !== _gpFilters.personnel) return false;
    if (_gpFilters.basePlay && p.basePlay !== _gpFilters.basePlay) return false;
    if (_gpFilters.tempo && p.tempo !== _gpFilters.tempo) return false;
    if (_gpFilters.preferredDown && p.preferredDown !== _gpFilters.preferredDown) return false;
    if (_gpFilters.preferredDistance && p.preferredDistance !== _gpFilters.preferredDistance) return false;
    if (_gpFilters.preferredSituation && p.preferredSituation !== _gpFilters.preferredSituation) return false;
    if (_gpFilters.preferredFieldPosition && p.preferredFieldPosition !== _gpFilters.preferredFieldPosition) return false;
    if (_gpFilters.goodVsMan && !p.goodVsMan) return false;
    if (_gpFilters.goodVsBear && !p.goodVsBear) return false;
    if (_gpFilters.goodVsOkie && !p.goodVsOkie) return false;
    if (_gpFilters.onlyOpponentTagged) {
      if (!opponent) return false;
      if (typeof isPlayTaggedForOpponent === "function" && !isPlayTaggedForOpponent(p, opponent)) return false;
    }
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
        <button class="btn btn-sm" data-action="saveGamePlanSnapshot" title="Save the current board as a named plan">
          💾 Save Plan
        </button>
        <button class="btn btn-sm" data-action="openGamePlanSnapshotsMenu" title="Load or delete a saved plan">
          📂 Plans
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
        <button class="btn btn-sm" data-action="openGamePlanShortcutsHelp" title="Keyboard shortcuts (?)">
          ⌨️
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
  const basePlays = [...new Set(plays.map((p) => p.basePlay).filter(Boolean))].sort();
  const tempos = [...new Set(plays.map((p) => p.tempo).filter(Boolean))].sort();
  const situations = [...new Set(plays.map((p) => p.preferredSituation).filter(Boolean))].sort();
  const fieldPositions = [...new Set(plays.map((p) => p.preferredFieldPosition).filter(Boolean))].sort();

  const advBadge = _gpAdvancedFilterCount();
  const advancedHtml = _gpFilters.showAdvanced ? `
    <div class="gp-toolbar-advanced">
      <select data-onchange="updateGamePlanFilter" data-arg="basePlay" data-pass="value" title="Base play">
        <option value="">Base Play</option>
        ${basePlays.map((b) => `<option value="${escapeHtml(b)}" ${b === _gpFilters.basePlay ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}
      </select>
      <select data-onchange="updateGamePlanFilter" data-arg="tempo" data-pass="value" title="Tempo">
        <option value="">Tempo</option>
        ${tempos.map((t) => `<option value="${escapeHtml(t)}" ${t === _gpFilters.tempo ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
      </select>
      <select data-onchange="updateGamePlanFilter" data-arg="preferredDown" data-pass="value" title="Down">
        <option value="">Down</option>
        ${["1", "2", "3", "4"].map((d) => `<option value="${d}" ${d === _gpFilters.preferredDown ? "selected" : ""}>${d}</option>`).join("")}
      </select>
      <select data-onchange="updateGamePlanFilter" data-arg="preferredDistance" data-pass="value" title="Distance">
        <option value="">Distance</option>
        ${["Short", "Medium", "Long"].map((d) => `<option value="${d}" ${d === _gpFilters.preferredDistance ? "selected" : ""}>${d}</option>`).join("")}
      </select>
      <select data-onchange="updateGamePlanFilter" data-arg="preferredSituation" data-pass="value" title="Situation">
        <option value="">Situation</option>
        ${situations.map((s) => `<option value="${escapeHtml(s)}" ${s === _gpFilters.preferredSituation ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
      </select>
      <select data-onchange="updateGamePlanFilter" data-arg="preferredFieldPosition" data-pass="value" title="Field Position">
        <option value="">Field Pos</option>
        ${fieldPositions.map((f) => `<option value="${escapeHtml(f)}" ${f === _gpFilters.preferredFieldPosition ? "selected" : ""}>${escapeHtml(f)}</option>`).join("")}
      </select>
      <label style="display:inline-flex;align-items:center;gap:4px;font-size:var(--font-size-sm);">
        <input type="checkbox" ${_gpFilters.onlyOpponentTagged ? "checked" : ""}
          data-onchange="updateGamePlanFilter" data-arg="onlyOpponentTagged" data-pass="event" />
        Only ${opponent ? `tagged for ${escapeHtml(opponent)}` : "opponent-tagged"}
      </label>
    </div>` : "";

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
    ${advancedHtml}`;

  const filtered = _gpFilteredLibrary(board);
  const libraryHtml = `
    <div class="gp-library">
      <div class="gp-library-header">
        <span>Library</span>
        <span class="gp-library-count">${filtered.length} of ${plays.length}${_gpSelected.size > 0 ? ` • ${_gpSelected.size} selected` : ""}</span>
      </div>
      <div class="gp-library-bulk">
        <button class="btn btn-sm btn-secondary" data-action="gpSelectAllVisible" title="Check every play matching current filters">☑ All visible</button>
        <button class="btn btn-sm btn-secondary" data-action="gpClearLibrarySelection" title="Uncheck all">▢ None</button>
        <button class="btn btn-sm btn-secondary" data-action="gpInvertVisibleSelection" title="Invert selection within visible">⇄ Invert</button>
        <button class="btn btn-sm" data-action="gpAddAllVisibleToBox" title="Add every visible play to a box you pick">➕ Add all visible to…</button>
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

  setInnerHTML(root, headerHtml);
  // Toolbar + boxes contain <input>/<select>/<button>/<textarea>, which
  // sanitizeHTML strips. Build them directly via innerHTML — every
  // user-derived value above already passes through escapeHtml().
  const wrapper = document.createElement("div");
  const distHtml = _gpRenderDistributionStrip(board);
  const scoreboardHtml = _gpRenderScoreboard(board);
  const chipsHtml = _gpRenderFilterChips();
  const jumpBarHtml = _gpRenderJumpPills(allBoxes, board);
  const trashZoneHtml = `<div class="gp-trash-zone" id="gpTrashZone" data-trash="1">📥 Drag here to send to Holding · 🗑️ Drag to remove</div>`;
  wrapper.innerHTML = distHtml + scoreboardHtml + chipsHtml + toolbarHtml + jumpBarHtml + trashZoneHtml + `<div class="gp-layout">${libraryHtml}${boxesHtml}</div>`;
  while (wrapper.firstChild) root.appendChild(wrapper.firstChild);
  _gpAttachLibraryHandlers();
  _gpAttachBoxHandlers();
  _gpAttachTrashZoneHandlers();
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

function _gpRenderBox(box, board) {
  const list = (board.assignments[box.id] || []).slice();
  const isCustom = (board.customBoxes || []).some((cb) => cb.id === box.id);
  const isHolding = box.id === GP_HOLDING_ID;
  const target = Number(board.targets && board.targets[box.id]) || 0;
  const collapsed = Array.isArray(board.collapsed) && board.collapsed.includes(box.id);
  const accent = GP_BOX_ACCENTS[box.id] || "";
  const note = (board.notes && board.notes[box.id]) || "";
  const sortMode = (board.sort && board.sort[box.id]) || "manual";
  const displayList = _gpSortedBoxList(list, sortMode);

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

  // Hash distribution bar (Left / Middle / Right) — only renders when at
  // least one play in this box declares a preferred hash.
  const hashHtml = _gpRenderBoxHashBar(list);

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
    </select>`;

  const headerHtml = `
    <div class="gp-box-header" data-action="toggleGamePlanBoxCollapse" data-arg="${escapeHtml(box.id)}">
      <div class="gp-box-title">
        <span class="gp-box-chevron">${collapsed ? "▶" : "▼"}</span>
        <span>${escapeHtml(box.label)}</span>
        <span class="gp-box-count">${list.length}${target > 0 ? `/${target}` : ""}</span>
        ${varietyHtml}
      </div>
      <div class="gp-box-actions" data-stop-toggle="1">
        <button class="btn btn-sm" title="Add a play from the playbook to this box"
          data-action="addPlayToGamePlanBox" data-arg="${escapeHtml(box.id)}">➕ Add Play</button>
        <button class="btn btn-sm" title="Smart fill — pick from plays that match this box's intent"
          data-action="gpSuggestFillBox" data-arg="${escapeHtml(box.id)}">💡 Suggest</button>
        ${sortDropdown}
        ${holdingAutoBtn}
        ${!isHolding && GP_BOX_TO_CALLSHEET[box.id] && list.length > 0
      ? `<button class="btn btn-sm btn-secondary" title="Push only this box to its call sheet category"
          data-action="pushGamePlanBoxToCallSheet" data-arg="${escapeHtml(box.id)}">➡️ To Call Sheet</button>`
      : ""}
        <button class="btn btn-sm btn-secondary" title="${target > 0 ? `Edit target (currently ${target})` : "Set target count"}"
          data-action="setGamePlanBoxTarget" data-arg="${escapeHtml(box.id)}">🎯</button>
        <button class="btn btn-sm btn-secondary" title="${note ? "Edit note" : "Add a note for this box"}"
          data-action="editGamePlanBoxNote" data-arg="${escapeHtml(box.id)}">${note ? "📝" : "📄"}</button>
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
    ${progressHtml}
    ${hashHtml}
    ${note ? `<div class="gp-box-note" title="Edit note"
      data-action="editGamePlanBoxNote" data-arg="${escapeHtml(box.id)}">${escapeHtml(note)}</div>` : ""}`;

  const bodyHtml = collapsed ? "" : `
      <div class="gp-box-body" data-box-drop="${escapeHtml(box.id)}">
        ${displayList.length === 0
      ? `<div class="gp-box-empty">${isHolding
        ? "Untyped tagged plays land here. Drag them out to any box, or click 🚀 Auto-route."
        : "Drop plays here, or click ➕ Add Play."}</div>`
      : displayList.map((p, idx) => _gpRenderBoxPlay(box.id, p, idx, sortMode === "manual")).join("")}
      </div>`;

  return `
    <div class="gp-box${isHolding ? " gp-box-holding" : ""}${collapsed ? " is-collapsed" : ""}"
         ${accentStyle}
         data-box-id="${escapeHtml(box.id)}">
      ${headerHtml}
      ${bodyHtml}
    </div>`;
}

function _gpRenderBoxPlay(boxId, play, idx, allowReorder) {
  const sig = _gpPlaySignature(play);
  const callHtml = typeof getFullCall === "function"
    ? getFullCall(play, { showLineCall: false })
    : escapeHtml(play.play || "");
  const meta = [play.formation, play.personnel].filter(Boolean).join(" • ");
  const matchupBadges = _gpMatchupBadges(play);
  const reorderBtns = allowReorder ? `
    <button class="gp-box-play-btn gp-box-play-up" aria-label="Move up"
      data-action="moveGamePlanPlayUp" data-arg="${escapeHtml(boxId + "::" + sig)}" title="Move up">▲</button>
    <button class="gp-box-play-btn gp-box-play-down" aria-label="Move down"
      data-action="moveGamePlanPlayDown" data-arg="${escapeHtml(boxId + "::" + sig)}" title="Move down">▼</button>` : "";
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
        ${reorderBtns}
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

/* Sort helpers for per-box sort modes */
function _gpSortedBoxList(list, mode) {
  if (!Array.isArray(list) || mode === "manual" || !mode) return list;
  const get = (p) => {
    if (mode === "type") return p.type || "";
    if (mode === "formation") return p.formation || "";
    if (mode === "personnel") return p.personnel || "";
    if (mode === "basePlay") return p.basePlay || p.play || "";
    return "";
  };
  return list.slice().sort((a, b) => get(a).localeCompare(get(b)));
}

function _gpAdvancedFilterCount() {
  const f = _gpFilters;
  let n = 0;
  if (f.basePlay) n += 1;
  if (f.tempo) n += 1;
  if (f.preferredDown) n += 1;
  if (f.preferredDistance) n += 1;
  if (f.preferredSituation) n += 1;
  if (f.preferredFieldPosition) n += 1;
  if (f.onlyOpponentTagged) n += 1;
  return n;
}

function toggleGamePlanAdvancedFilters() {
  _gpFilters.showAdvanced = !_gpFilters.showAdvanced;
  renderGamePlan();
}

/* -------------------------------------------------------------------------
   Active filter chips
   ------------------------------------------------------------------------- */

const _GP_CHIP_LABELS = {
  search: { icon: "🔎", label: (v) => `“${v}”` },
  type: { icon: "🏷️", label: (v) => v },
  formation: { icon: "📐", label: (v) => v },
  personnel: { icon: "🧮", label: (v) => v },
  basePlay: { icon: "🌳", label: (v) => v },
  tempo: { icon: "⏱️", label: (v) => v },
  preferredDown: { icon: "🔢", label: (v) => `Down ${v}` },
  preferredDistance: { icon: "📏", label: (v) => v },
  preferredSituation: { icon: "🕒", label: (v) => v },
  preferredFieldPosition: { icon: "🟩", label: (v) => v },
  onlyOpponentTagged: { icon: "🎯", label: () => "Opponent-tagged" },
  hideAssigned: { icon: "🙈", label: () => "Hide drafted" },
  goodVsMan: { icon: "✅", label: () => "vs. Man" },
  goodVsBear: { icon: "🐻", label: () => "vs. Bear" },
  goodVsOkie: { icon: "🤠", label: () => "vs. Okie" },
};

function _gpRenderFilterChips() {
  const f = _gpFilters;
  const chips = [];
  Object.keys(_GP_CHIP_LABELS).forEach((k) => {
    const v = f[k];
    if (!v) return;
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
  else _gpFilters[field] = "";
  renderGamePlan();
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

function _gpRenderDistributionStrip(board) {
  const drafted = _gpAllDraftedPlays(board);
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

function _gpRenderScoreboard(board) {
  const drafted = _gpAllDraftedPlays(board);
  const tiles = GP_COVERAGE_SCENARIOS.map((s) => {
    const count = drafted.filter(s.match).length;
    let status = "ok";
    if (count === 0) status = "empty";
    else if (count <= 2) status = "warn";
    const isActive = Object.entries(s.filters).every(([k, v]) => _gpFilters[k] === v);
    return `
      <button class="gp-score-tile gp-score-${status}${isActive ? " is-active" : ""}"
        data-action="applyGamePlanScenario" data-arg="${escapeHtml(s.id)}"
        title="${count === 0 ? `No plays for ${s.label} yet — click to filter library` : `${count} drafted • click to filter library`}">
        <span class="gp-score-label">${escapeHtml(s.label)}</span>
        <span class="gp-score-count">${count}</span>
      </button>`;
  }).join("");
  if (drafted.length === 0) {
    return `
      <details class="gp-scoreboard">
        <summary>📋 Coverage Scoreboard <span class="gp-score-hint">draft plays to populate</span></summary>
        <div class="gp-score-grid">${tiles}</div>
      </details>`;
  }
  return `
    <details class="gp-scoreboard" open>
      <summary>📋 Coverage Scoreboard <span class="gp-score-hint">click a tile to filter library</span></summary>
      <div class="gp-score-grid">${tiles}</div>
    </details>`;
}

function applyGamePlanScenario(id) {
  const sc = GP_COVERAGE_SCENARIOS.find((s) => s.id === id);
  if (!sc) return;
  const alreadyActive = Object.entries(sc.filters).every(([k, v]) => _gpFilters[k] === v);
  if (alreadyActive) {
    Object.keys(sc.filters).forEach((k) => { _gpFilters[k] = ""; });
  } else {
    Object.entries(sc.filters).forEach(([k, v]) => { _gpFilters[k] = v; });
    _gpFilters.showAdvanced = true;
  }
  renderGamePlan();
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
  // If the box is collapsed, expand first so the user actually sees content
  if (el.classList.contains("is-collapsed")) {
    toggleGamePlanBoxCollapse(boxId);
    requestAnimationFrame(() => {
      const re = document.querySelector(`.gp-box[data-box-id="${CSS.escape(boxId)}"]`);
      if (re) re.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("gp-box-flash");
  setTimeout(() => el.classList.remove("gp-box-flash"), 900);
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
    // Prevent header-action clicks from bubbling up and toggling box collapse
    box.querySelectorAll("[data-stop-toggle], .gp-box-sort").forEach((el) => {
      el.addEventListener("click", (e) => e.stopPropagation());
      el.addEventListener("mousedown", (e) => e.stopPropagation());
    });
    if (!dropZone) return;

    dropZone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      box.classList.add("is-drop-target");
    });
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = _gpDragSource ? "move" : "copy";
      // Show insertion indicator for intra-box reorder
      if (_gpDragSource && _gpDragSource.boxId === boxId) {
        _gpUpdateDropIndicator(dropZone, e.clientY);
      }
    });
    dropZone.addEventListener("dragleave", (e) => {
      // Only remove highlight if leaving the box entirely
      if (!box.contains(e.relatedTarget)) {
        box.classList.remove("is-drop-target");
        _gpClearDropIndicators(dropZone);
      }
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      box.classList.remove("is-drop-target");
      if (_gpDragSource) {
        if (_gpDragSource.boxId === boxId) {
          // intra-box reorder
          const targetIdx = _gpComputeDropIndex(dropZone, e.clientY);
          _gpReorderInBox(boxId, _gpDragSource.sig, targetIdx);
        } else {
          // box → box move
          _gpMoveBetweenBoxes(_gpDragSource.boxId, boxId, _gpDragSource.sig);
        }
        _gpDragSource = null;
      } else if (_gpDragPayload && Array.isArray(_gpDragPayload.sigs)) {
        _gpAddSigsToBox(_gpDragPayload.sigs, boxId);
        _gpDragPayload = null;
      }
      _gpClearDropIndicators(dropZone);
    });
  });

  // Drag from a box (existing assignment)
  document.querySelectorAll(".gp-box-play[draggable='true']").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      _gpDragSource = { boxId: row.dataset.boxId, sig: row.dataset.sig };
      _gpDragPayload = null;
      document.body.classList.add("gp-dragging-from-box");
      try { e.dataTransfer.setData("text/plain", row.dataset.sig || ""); } catch (_e) { /* ignore */ }
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      _gpDragSource = null;
      document.body.classList.remove("gp-dragging-from-box");
      document.querySelectorAll(".gp-box-body").forEach(_gpClearDropIndicators);
    });
    // Right-click context menu
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      _gpOpenPlayContextMenu(e, row.dataset.boxId, row.dataset.sig);
    });
    // Mobile long-press → context menu
    if (typeof addLongPress === "function") {
      addLongPress(row, () => {
        const rect = row.getBoundingClientRect();
        _gpOpenPlayContextMenu(
          { preventDefault() { }, clientX: rect.left + 20, clientY: rect.top + 20 },
          row.dataset.boxId,
          row.dataset.sig,
        );
      });
    }
  });
}

function _gpComputeDropIndex(dropZone, clientY) {
  const rows = Array.from(dropZone.querySelectorAll(".gp-box-play"));
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return rows.length;
}

function _gpUpdateDropIndicator(dropZone, clientY) {
  _gpClearDropIndicators(dropZone);
  const idx = _gpComputeDropIndex(dropZone, clientY);
  const rows = Array.from(dropZone.querySelectorAll(".gp-box-play"));
  if (rows.length === 0) return;
  if (idx >= rows.length) rows[rows.length - 1].classList.add("gp-drop-after");
  else rows[idx].classList.add("gp-drop-before");
}

function _gpClearDropIndicators(dropZone) {
  if (!dropZone) return;
  dropZone.querySelectorAll(".gp-drop-before, .gp-drop-after").forEach((el) => {
    el.classList.remove("gp-drop-before");
    el.classList.remove("gp-drop-after");
  });
}

function _gpReorderInBox(boxId, sig, targetIdx) {
  if (!boxId || !sig) return;
  _gpUpdateBoard((board) => {
    const arr = board.assignments[boxId] || [];
    const fromIdx = arr.findIndex((p) => _gpPlaySignature(p) === sig);
    if (fromIdx < 0) return;
    const [item] = arr.splice(fromIdx, 1);
    let toIdx = Math.max(0, Math.min(arr.length, targetIdx));
    if (fromIdx < targetIdx) toIdx = Math.max(0, toIdx - 1);
    arr.splice(toIdx, 0, item);
    // Switch to manual sort so the user's order is honored
    if (!board.sort) board.sort = {};
    board.sort[boxId] = "manual";
  });
  renderGamePlan();
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
  if (field === "hideAssigned" || field === "onlyOpponentTagged") {
    if (valueOrEvent && valueOrEvent.target) {
      _gpFilters[field] = !!valueOrEvent.target.checked;
    } else {
      _gpFilters[field] = !!valueOrEvent;
    }
  } else {
    _gpFilters[field] = valueOrEvent || "";
  }
  renderGamePlan();
}

function clearGamePlanFilters() {
  _gpFilters = {
    search: "", type: "", formation: "", personnel: "",
    basePlay: "", tempo: "",
    preferredDown: "", preferredDistance: "",
    preferredSituation: "", preferredFieldPosition: "",
    onlyOpponentTagged: false, hideAssigned: false,
    density: _gpFilters.density || "comfortable", showProgress: true,
    goodVsMan: false, goodVsBear: false, goodVsOkie: false,
    showAdvanced: _gpFilters.showAdvanced || false,
  };
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
   Library bulk actions
   ------------------------------------------------------------------------- */

function gpSelectAllVisible() {
  const board = _gpEnsureBoard();
  _gpFilteredLibrary(board).forEach((p) => _gpSelected.add(_gpPlaySignature(p)));
  renderGamePlan();
}

function gpClearLibrarySelection() {
  _gpSelected.clear();
  renderGamePlan();
}

function gpInvertVisibleSelection() {
  const board = _gpEnsureBoard();
  _gpFilteredLibrary(board).forEach((p) => {
    const sig = _gpPlaySignature(p);
    if (_gpSelected.has(sig)) _gpSelected.delete(sig);
    else _gpSelected.add(sig);
  });
  renderGamePlan();
}

async function gpAddAllVisibleToBox() {
  const board = _gpEnsureBoard();
  const filtered = _gpFilteredLibrary(board);
  if (filtered.length === 0) {
    showToast("No visible plays to add.", { type: "warning" });
    return;
  }
  const allBoxes = [GP_HOLDING_BOX, ...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  const choice = await showListPicker(
    `Add all ${filtered.length} visible play${filtered.length === 1 ? "" : "s"} to which box?`,
    allBoxes.map((b) => ({ value: b.id, label: b.label })),
    { title: "Add Visible to Box", icon: "➕" },
  );
  if (!choice) return;
  _gpAddSigsToBox(filtered.map((p) => _gpPlaySignature(p)), choice);
}

/* -------------------------------------------------------------------------
   Add a play directly to a box (filtered library picker)
   ------------------------------------------------------------------------- */

async function addPlayToGamePlanBox(boxId) {
  if (!boxId || !Array.isArray(plays)) return;
  const board = _gpEnsureBoard();
  const assignedSigs = _gpAllAssignedSigs(board);
  // Pick from plays NOT already in this box
  const inBoxSigs = new Set((board.assignments[boxId] || []).map(_gpPlaySignature));
  const candidates = plays.filter((p) => !inBoxSigs.has(_gpPlaySignature(p)));
  if (candidates.length === 0) {
    showToast("Every play is already in this box.", { type: "info" });
    return;
  }
  const items = candidates.map((p) => {
    const sig = _gpPlaySignature(p);
    const already = assignedSigs.has(sig) ? " ⓘ already on board" : "";
    const label = [p.type, p.formation, p.personnel, p.play].filter(Boolean).join(" • ") + already;
    return { value: sig, label };
  });
  const choice = await showListPicker(
    `Pick a play to add to ${boxId}:`,
    items,
    { title: "Add Play", icon: "➕" },
  );
  if (!choice) return;
  _gpAddSigsToBox([choice], boxId);
}

/* -------------------------------------------------------------------------
   Per-box note + sort
   ------------------------------------------------------------------------- */

async function editGamePlanBoxNote(boxId) {
  if (!boxId) return;
  const board = _gpEnsureBoard();
  const current = (board.notes && board.notes[boxId]) || "";
  const next = await showPrompt(
    "Box note (visible above the plays). Leave blank to clear.",
    current,
    { title: "Box Note", icon: "📝", placeholder: "e.g. Hit deep when they walk down the safety" },
  );
  if (next === null) return;
  _gpUpdateBoard((b) => {
    if (!b.notes) b.notes = {};
    if (!next || !next.trim()) delete b.notes[boxId];
    else b.notes[boxId] = next.trim();
  });
  renderGamePlan();
}

function setGamePlanBoxSort(boxId, mode) {
  if (!boxId) return;
  _gpUpdateBoard((b) => {
    if (!b.sort) b.sort = {};
    if (!mode || mode === "manual") delete b.sort[boxId];
    else b.sort[boxId] = mode;
  });
  renderGamePlan();
}

/* -------------------------------------------------------------------------
   Reorder within box (button arrows)
   ------------------------------------------------------------------------- */

function moveGamePlanPlayUp(combined) {
  _gpNudgeBoxPlay(combined, -1);
}

function moveGamePlanPlayDown(combined) {
  _gpNudgeBoxPlay(combined, 1);
}

function _gpNudgeBoxPlay(combined, delta) {
  if (!combined) return;
  const sepIdx = combined.indexOf("::");
  if (sepIdx < 0) return;
  const boxId = combined.slice(0, sepIdx);
  const sig = combined.slice(sepIdx + 2);
  _gpUpdateBoard((board) => {
    const arr = board.assignments[boxId] || [];
    const idx = arr.findIndex((p) => _gpPlaySignature(p) === sig);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= arr.length) return;
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    if (!board.sort) board.sort = {};
    board.sort[boxId] = "manual";
  });
  renderGamePlan();
}

/* -------------------------------------------------------------------------
   Right-click / long-press context menu on a box play
   ------------------------------------------------------------------------- */

function _gpOpenPlayContextMenu(e, boxId, sig) {
  if (!boxId || !sig) return;
  const board = _gpEnsureBoard();
  const play = (board.assignments[boxId] || []).find((p) => _gpPlaySignature(p) === sig)
    || _gpFindPlayBySig(sig);
  if (!play) return;
  const items = [];
  items.push({
    label: "↔ Move to box…",
    onClick: () => moveGamePlanPlay(boxId + "::" + sig),
  });
  items.push({
    label: "📋 Duplicate to other box…",
    onClick: async () => {
      const allBoxes = [GP_HOLDING_BOX, ...GP_DEFAULT_BOXES, ...(board.customBoxes || [])]
        .filter((b) => b.id !== boxId);
      const dest = await showListPicker(
        "Duplicate this play to which box?",
        allBoxes.map((b) => ({ value: b.id, label: b.label })),
        { title: "Duplicate Play", icon: "📋" },
      );
      if (!dest) return;
      _gpAddSigsToBox([sig], dest);
    },
  });
  if (boxId !== GP_HOLDING_ID) {
    items.push({
      label: "📥 Send to Holding",
      onClick: () => _gpMoveBetweenBoxes(boxId, GP_HOLDING_ID, sig),
    });
  }
  items.push({ separator: true });
  items.push({
    label: "▲ Move up",
    onClick: () => moveGamePlanPlayUp(boxId + "::" + sig),
  });
  items.push({
    label: "▼ Move down",
    onClick: () => moveGamePlanPlayDown(boxId + "::" + sig),
  });
  items.push({ separator: true });
  if (typeof openPlayEditor === "function") {
    const playbookIdx = Array.isArray(plays) ? plays.findIndex((p) => _gpPlaySignature(p) === sig) : -1;
    if (playbookIdx >= 0) {
      items.push({
        label: "✏️ Edit play in playbook",
        onClick: () => openPlayEditor(playbookIdx),
      });
    }
  }
  items.push({
    label: "× Remove from box",
    danger: true,
    onClick: () => removeFromGamePlanBox(boxId + "::" + sig),
  });
  if (typeof showContextMenu === "function") {
    const menu = document.createElement("div");
    menu.className = "cs-context-menu";
    items.forEach((item) => {
      if (item.separator) {
        const divider = document.createElement("div");
        divider.className = "cs-ctx-divider";
        menu.appendChild(divider);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = item.danger ? "cs-ctx-item cs-ctx-clear" : "cs-ctx-item";
      button.textContent = item.label;
      button.disabled = Boolean(item.disabled);
      button.addEventListener("click", async () => {
        menu.remove();
        if (typeof item.onClick === "function") await item.onClick();
      });
      menu.appendChild(button);
    });
    showContextMenu(e, menu);
  }
}

/* -------------------------------------------------------------------------
   Smart Fill (per box) — opens picker pre-filtered to box intent
   ------------------------------------------------------------------------- */

const GP_BOX_INTENT_TYPES = {
  Run: ["Run"],
  Pass: ["Pass", "Drop"],
  Screen: ["Screen"],
  Quick: ["Quick"],
  "Play Action": ["Play Action", "Play Pass"],
  RPO: ["RPO"],
  "Run Option": ["Run Option"],
  Movement: ["Movement"],
};

async function gpSuggestFillBox(boxId) {
  if (!boxId || !Array.isArray(plays)) return;
  const board = _gpEnsureBoard();
  const inBoxSigs = new Set((board.assignments[boxId] || []).map(_gpPlaySignature));
  const intent = GP_BOX_INTENT_TYPES[boxId];
  let candidates = plays.filter((p) => !inBoxSigs.has(_gpPlaySignature(p)));
  if (Array.isArray(intent) && intent.length > 0) {
    candidates = candidates.filter((p) => intent.includes(p.type));
  }
  // Rank: opponent-tagged first, then by base play group, then alphabetical
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw && gw.opponentName ? gw.opponentName : null;
  if (opponent && typeof isPlayTaggedForOpponent === "function") {
    candidates.sort((a, b) => {
      const ta = isPlayTaggedForOpponent(a, opponent) ? 0 : 1;
      const tb = isPlayTaggedForOpponent(b, opponent) ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return (a.play || "").localeCompare(b.play || "");
    });
  }
  if (candidates.length === 0) {
    showToast(intent ? `No more ${intent.join("/")} plays available.` : "No more plays available.", { type: "warning" });
    return;
  }
  const assignedSigs = _gpAllAssignedSigs(board);
  const items = candidates.map((p) => {
    const sig = _gpPlaySignature(p);
    const tagged = opponent && typeof isPlayTaggedForOpponent === "function" && isPlayTaggedForOpponent(p, opponent) ? "🎯 " : "";
    const dup = assignedSigs.has(sig) ? " ⓘ on board" : "";
    const label = tagged + [p.type, p.formation, p.personnel, p.play].filter(Boolean).join(" • ") + dup;
    return { value: sig, label };
  });
  const choice = await showListPicker(
    `💡 ${candidates.length} suggestion${candidates.length === 1 ? "" : "s"} for ${boxId}${opponent ? ` (opponent-tagged first)` : ""}:`,
    items,
    { title: "Smart Fill", icon: "💡" },
  );
  if (!choice) return;
  _gpAddSigsToBox([choice], boxId);
}

/* -------------------------------------------------------------------------
   Per-box push to call sheet
   ------------------------------------------------------------------------- */

async function pushGamePlanBoxToCallSheet(boxId) {
  if (!boxId) return;
  const target = GP_BOX_TO_CALLSHEET[boxId];
  if (!target) {
    showToast("This box has no matching call sheet category.", { type: "warning" });
    return;
  }
  if (typeof callSheet !== "object" || !callSheet) {
    showToast("Call sheet isn't ready yet.", { type: "error" });
    return;
  }
  const board = _gpEnsureBoard();
  const list = board.assignments[boxId] || [];
  if (list.length === 0) {
    showToast("This box has no plays.", { type: "warning" });
    return;
  }
  const choice = await showChoice(
    `<p>Push <strong>${list.length}</strong> play${list.length === 1 ? "" : "s"} from <strong>${escapeHtml(boxId)}</strong> into call sheet category <code>${escapeHtml(target)}</code>?</p>`,
    {
      title: "Push Box to Call Sheet",
      icon: "➡️",
      option1: "Append",
      option2: "Replace",
    },
  );
  if (!choice) return;
  const replace = choice === "option2";
  if (!callSheet[target]) callSheet[target] = { left: [], right: [] };
  if (replace) {
    callSheet[target].left = [];
    callSheet[target].right = [];
  }
  let pushed = 0;
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
  if (typeof saveCallSheet === "function") saveCallSheet();
  showToast(`Pushed ${pushed} play${pushed === 1 ? "" : "s"} to ${target}`, { type: "success" });
}

/* -------------------------------------------------------------------------
   Snapshots — save / load / delete named plans (per opponent)
   ------------------------------------------------------------------------- */

function _gpLoadAllSnapshots() {
  return storageManager.get(GP_SNAPSHOTS_KEY, {});
}

function _gpSaveAllSnapshots(all) {
  storageManager.set(GP_SNAPSHOTS_KEY, all);
}

function _gpSnapshotsForOpponent() {
  const all = _gpLoadAllSnapshots();
  const key = _gpActiveOpponentKey();
  return Array.isArray(all[key]) ? all[key] : [];
}

async function saveGamePlanSnapshot() {
  const board = _gpEnsureBoard();
  const total = _gpAllAssignedSigs(board).size;
  if (total === 0) {
    const ok = await showConfirm("No plays drafted yet — save an empty plan anyway?",
      { title: "Save Plan", icon: "💾" });
    if (!ok) return;
  }
  const defaultName = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const name = await showPrompt("Name this plan:", defaultName, {
    title: "Save Plan",
    icon: "💾",
    placeholder: "e.g. v1 base, blitz-heavy, etc.",
  });
  if (!name || !name.trim()) return;
  const all = _gpLoadAllSnapshots();
  const key = _gpActiveOpponentKey();
  if (!Array.isArray(all[key])) all[key] = [];
  all[key].push({
    id: `snap-${Date.now()}`,
    name: name.trim(),
    savedAt: new Date().toISOString(),
    board: safeDeepClone(board),
  });
  _gpSaveAllSnapshots(all);
  showToast(`Saved plan “${name.trim()}”`, { type: "success" });
}

async function openGamePlanSnapshotsMenu() {
  const snaps = _gpSnapshotsForOpponent();
  if (snaps.length === 0) {
    showToast("No saved plans yet for this opponent. Use 💾 Save Plan first.", { type: "info", duration: 3500 });
    return;
  }
  const items = snaps.slice().reverse().map((s) => {
    const when = new Date(s.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const total = Object.values(s.board?.assignments || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    return { value: s.id, label: `${s.name} • ${total} plays • ${when}` };
  });
  const choice = await showListPicker(
    "Pick a saved plan:",
    items,
    { title: "📂 Saved Plans", icon: "📂" },
  );
  if (!choice) return;
  const action = await showChoice(
    "What do you want to do with this plan?",
    {
      title: "Saved Plan",
      icon: "📂",
      option1: "Load (replaces current board)",
      option2: "Delete",
    },
  );
  if (!action) return;
  if (action === "option1") await _gpLoadSnapshot(choice);
  else if (action === "option2") await _gpDeleteSnapshot(choice);
}

async function _gpLoadSnapshot(snapId) {
  const all = _gpLoadAllSnapshots();
  const key = _gpActiveOpponentKey();
  const snap = (all[key] || []).find((s) => s.id === snapId);
  if (!snap) return;
  const ok = await showConfirm(
    `Load <strong>${escapeHtml(snap.name)}</strong>? This replaces the current game plan board for ${escapeHtml(key === "__unassigned__" ? "this session" : key)}.`,
    { title: "Load Plan", icon: "📂", confirmText: "Load", danger: true },
  );
  if (!ok) return;
  const boards = _gpLoadBoards();
  boards[key] = safeDeepClone(snap.board);
  _gpSaveBoards(boards);
  renderGamePlan();
  showToast(`Loaded “${snap.name}”`, { type: "success" });
}

async function _gpDeleteSnapshot(snapId) {
  const all = _gpLoadAllSnapshots();
  const key = _gpActiveOpponentKey();
  const snap = (all[key] || []).find((s) => s.id === snapId);
  if (!snap) return;
  const ok = await showConfirm(
    `Delete saved plan <strong>${escapeHtml(snap.name)}</strong>?`,
    { title: "Delete Plan", icon: "🗑️", confirmText: "Delete", danger: true },
  );
  if (!ok) return;
  all[key] = (all[key] || []).filter((s) => s.id !== snapId);
  _gpSaveAllSnapshots(all);
  showToast("Plan deleted", { type: "success" });
}

/* -------------------------------------------------------------------------
   Trash zone (drag a box-play out)
   ------------------------------------------------------------------------- */

function _gpAttachTrashZoneHandlers() {
  const zone = document.getElementById("gpTrashZone");
  if (!zone) return;
  zone.addEventListener("dragenter", (e) => {
    if (!_gpDragSource) return;
    e.preventDefault();
    zone.classList.add("is-active");
  });
  zone.addEventListener("dragover", (e) => {
    if (!_gpDragSource) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });
  zone.addEventListener("dragleave", () => {
    zone.classList.remove("is-active");
  });
  zone.addEventListener("drop", async (e) => {
    if (!_gpDragSource) return;
    e.preventDefault();
    zone.classList.remove("is-active");
    const { boxId, sig } = _gpDragSource;
    _gpDragSource = null;
    if (boxId === GP_HOLDING_ID) {
      removeFromGamePlanBox(boxId + "::" + sig);
    } else {
      _gpMoveBetweenBoxes(boxId, GP_HOLDING_ID, sig);
      showToast("Sent to Holding", { duration: 1500 });
    }
  });
}

/* -------------------------------------------------------------------------
   Keyboard shortcuts
   ------------------------------------------------------------------------- */

function _gpHandleKeydown(e) {
  // Only when the gameplan tab is the active tab
  if (typeof currentActiveTab !== "undefined" && currentActiveTab !== "gameplan") return;
  // Ignore when typing in an input/textarea/select (except Esc)
  const tag = (e.target?.tagName || "").toLowerCase();
  const isEditable = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;

  if (e.key === "?" && !isEditable) {
    e.preventDefault();
    openGamePlanShortcutsHelp();
    return;
  }
  if (e.key === "Escape") {
    const search = document.getElementById("gpSearch");
    if (document.activeElement === search) {
      search.blur();
      return;
    }
    if (_gpAdvancedFilterCount() > 0 || _gpFilters.search || _gpFilters.type
      || _gpFilters.formation || _gpFilters.personnel || _gpFilters.hideAssigned
      || _gpFilters.goodVsMan || _gpFilters.goodVsBear || _gpFilters.goodVsOkie) {
      e.preventDefault();
      clearGamePlanFilters();
      showToast("Filters cleared", { duration: 1200 });
    }
    return;
  }
  if (isEditable) return;
  if (e.key === "/") {
    e.preventDefault();
    const search = document.getElementById("gpSearch");
    if (search) {
      search.focus();
      search.select();
    }
    return;
  }
  // Digit jump 1-9 → first 9 boxes (Holding=1)
  if (/^[1-9]$/.test(e.key)) {
    const board = _gpEnsureBoard();
    const allBoxes = [GP_HOLDING_BOX, ...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
    const idx = parseInt(e.key, 10) - 1;
    if (allBoxes[idx]) {
      e.preventDefault();
      jumpToGamePlanBox(allBoxes[idx].id);
    }
  }
}

function openGamePlanShortcutsHelp() {
  const html = `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:var(--space-xs) var(--space-md);font-size:var(--font-size-sm);">
      <kbd>/</kbd><span>Focus library search</span>
      <kbd>Esc</kbd><span>Blur search · clear all filters</span>
      <kbd>1</kbd>–<kbd>9</kbd><span>Jump to box (1 = Holding, 2 = Run, 3 = Pass…)</span>
      <kbd>?</kbd><span>This help</span>
    </div>
    <p style="margin-top:var(--space-md);font-size:var(--font-size-xs);color:var(--color-text-muted);">
      Shortcuts are active only on the Game Plan tab and ignore key presses while typing in inputs.
    </p>`;
  showModal(html, { title: "⌨️ Game Plan Shortcuts", icon: "⌨️" });
}

/* -------------------------------------------------------------------------
   Init
   ------------------------------------------------------------------------- */

function initGamePlan() {
  _gpEnsureBoard();
  renderGamePlan();
}

// Bind keyboard shortcuts once at script load
if (typeof document !== "undefined" && !window._gpKeydownBound) {
  document.addEventListener("keydown", _gpHandleKeydown);
  window._gpKeydownBound = true;
}
