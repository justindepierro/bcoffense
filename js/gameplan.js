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
  // Spotlight mode: when active, dims non-matching boxes and pulses matching plays.
  // Shape: null | { kind: "scenario", id: "3rd-long" } | { kind: "player", name: "Marco" }
  spotlight: null,
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
  {
    id: "1st-down", label: "1st Down",
    filters: { preferredDown: "1" },
    match: (p) => p.preferredDown === "1"
  },
  {
    id: "3rd-short", label: "3rd & Short",
    filters: { preferredDown: "3", preferredDistance: "Short" },
    match: (p) => p.preferredDown === "3" && p.preferredDistance === "Short"
  },
  {
    id: "3rd-med", label: "3rd & Med",
    filters: { preferredDown: "3", preferredDistance: "Medium" },
    match: (p) => p.preferredDown === "3" && p.preferredDistance === "Medium"
  },
  {
    id: "3rd-long", label: "3rd & Long",
    filters: { preferredDown: "3", preferredDistance: "Long" },
    match: (p) => p.preferredDown === "3" && p.preferredDistance === "Long"
  },
  {
    id: "rz", label: "Red Zone",
    filters: { preferredFieldPosition: "Lo-RZ" },
    match: (p) => p.preferredFieldPosition === "Lo-RZ" || p.preferredFieldPosition === "Hi-RZ"
  },
  {
    id: "goal-line", label: "Goal Line",
    filters: { preferredFieldPosition: "Goal Line" },
    match: (p) => p.preferredFieldPosition === "Goal Line"
  },
  {
    id: "backed-up", label: "Backed Up",
    filters: { preferredFieldPosition: "Backed Up" },
    match: (p) => p.preferredFieldPosition === "Backed Up"
  },
  {
    id: "2-min", label: "2 Min",
    filters: { preferredSituation: "2 Minute" },
    match: (p) => p.preferredSituation === "2 Minute"
  },
  {
    id: "4-min", label: "4 Min",
    filters: { preferredSituation: "4 Minute" },
    match: (p) => p.preferredSituation === "4 Minute"
  },
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
      hiddenBoxes: [],   // [boxId, ...] boxes hidden from view
      boxOrder: [],      // [boxId, ...] custom display order (subset; missing ids fall back to default)
      boxLabels: {},     // boxId → custom rename for default boxes
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
    if (!Array.isArray(all[key].hiddenBoxes)) all[key].hiddenBoxes = [];
    if (!Array.isArray(all[key].boxOrder)) all[key].boxOrder = [];
    if (!all[key].boxLabels || typeof all[key].boxLabels !== "object") all[key].boxLabels = {};
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
        p.keyPlayerName1, p.keyPlayerName2, p.keyPlayerName3,
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

  const rawAllBoxes = [
    GP_HOLDING_BOX,
    ...GP_DEFAULT_BOXES,
    ...(board.customBoxes || []),
  ];
  // Apply custom labels (default boxes only — custom already store their own)
  const labeledBoxes = rawAllBoxes.map((b) => {
    if (b.id === GP_HOLDING_ID) return b;
    const isCustom = (board.customBoxes || []).some((cb) => cb.id === b.id);
    if (isCustom) return b;
    const customLabel = board.boxLabels && board.boxLabels[b.id];
    return customLabel ? { ...b, label: customLabel } : b;
  });
  // Apply custom order (boxOrder is a subset of ids; ids not in boxOrder fall to defaultIndex order, holding always first)
  const orderIdx = (id) => {
    if (id === GP_HOLDING_ID) return -1;
    const i = (board.boxOrder || []).indexOf(id);
    return i >= 0 ? i : 9999;
  };
  const orderedBoxes = labeledBoxes.slice().sort((a, b) => {
    const da = orderIdx(a.id);
    const db = orderIdx(b.id);
    if (da !== db) return da - db;
    return labeledBoxes.indexOf(a) - labeledBoxes.indexOf(b);
  });
  // Hide hidden boxes (Holding never hides)
  const hidden = new Set((board.hiddenBoxes || []).filter((id) => id !== GP_HOLDING_ID));
  const allBoxes = orderedBoxes.filter((b) => !hidden.has(b.id));
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
        ${_gpRenderHealthGauge(board)}
        <div class="gp-header-group gp-header-group-primary">
          <button class="btn btn-sm btn-primary" data-action="openGamePlanPrintModal" title="Print the game plan">
            🖨️ Print
          </button>
          <button class="btn btn-sm btn-success" data-action="pushGamePlanToCallSheet" title="Copy drafted plays into the call sheet">
            ➡️ Call Sheet
          </button>
          <button class="btn btn-sm btn-success" data-action="pushGamePlanToScript" title="Copy drafted plays into the practice script">
            📋 Script
          </button>
        </div>
        <div class="gp-header-group">
          <button class="btn btn-sm" data-action="saveGamePlanSnapshot" title="Save the current board as a named plan">
            💾 Save Plan
          </button>
          <button class="btn btn-sm" data-action="openGamePlanSnapshotsMenu" title="Load or delete a saved plan">
            📂 Plans
          </button>
          <button class="btn btn-sm" data-action="openGamePlanCompare" title="Compare two saved plans">
            🔄 Compare
          </button>
        </div>
        <div class="gp-header-group">
          <button class="btn btn-sm" data-action="openGamePlanStats" title="Show variety stats across all drafted plays">
            📊 Variety
          </button>
          <button class="btn btn-sm" data-action="openGamePlanCoverageMatrix" title="Heatmap of bucket coverage across game scenarios">
            🌡️ Coverage
          </button>
          <button class="btn btn-sm" data-action="openGamePlanTendencyMirror" title="Compare opponent's defensive tendencies vs your plan">
            🪞 vs Defense
          </button>
        </div>
        <div class="gp-header-group">
          <button class="btn btn-sm" data-action="openGamePlanAddBucket" title="Add a new bucket from a template">
            ➕ Add Bucket
          </button>
          <button class="btn btn-sm" data-action="openGamePlanReorderBoxes" title="Drag boxes into a custom order">
            ↕️ Reorder
          </button>
          <button class="btn btn-sm" data-action="openGamePlanManageBoxes" title="Hide or show boxes">
            👁️ Manage
          </button>
        </div>
        <div class="gp-header-group">
          <button class="btn btn-sm" data-action="expandAllGamePlanBoxes" title="Expand every box">
            ▼
          </button>
          <button class="btn btn-sm" data-action="collapseAllGamePlanBoxes" title="Collapse every box">
            ▶
          </button>
          <button class="btn btn-sm" data-action="cycleGamePlanDensity" title="Toggle density (Comfortable / Compact / Detail)">
            ${_gpFilters.density === "compact" ? "▭" : _gpFilters.density === "detail" ? "🗂️" : "▥"} ${_gpFilters.density.charAt(0).toUpperCase() + _gpFilters.density.slice(1)}
          </button>
          <button class="btn btn-sm" data-action="openGamePlanShortcutsHelp" title="Keyboard shortcuts (?)">
            ⌨️
          </button>
        </div>
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

  setInnerHTML(root, "");
  // Header contains <button> elements which sanitizeHTML strips.
  // Toolbar + boxes contain <input>/<select>/<button>/<textarea>, which
  // sanitizeHTML strips. Build them directly via innerHTML — every
  // user-derived value above already passes through escapeHtml().
  const wrapper = document.createElement("div");
  const distHtml = _gpRenderDistributionStrip(board);
  const scoreboardHtml = _gpRenderScoreboard(board);
  const touchHtml = _gpRenderTouchTracker(board);
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
  wrapper.innerHTML = headerHtml + distHtml + scoreboardHtml + touchHtml + chipsHtml + toolbarHtml + jumpBarHtml + spotlightBannerHtml + trashZoneHtml + `<div class="gp-layout">${libraryHtml}${boxesHtml}</div>`;
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

function _gpRenderBoxPlay(boxId, play, idx, allowReorder) {
  const sig = _gpPlaySignature(play);
  const callHtml = typeof getFullCall === "function"
    ? getFullCall(play, { showLineCall: false })
    : escapeHtml(play.play || "");
  const meta = [play.formation, play.personnel].filter(Boolean).join(" • ");
  const matchupBadges = _gpMatchupBadges(play);
  const isSpotlit = _gpPlayMatchesSpotlight(play);
  const reorderBtns = allowReorder ? `
    <button class="gp-box-play-btn gp-box-play-up" aria-label="Move up"
      data-action="moveGamePlanPlayUp" data-arg="${escapeHtml(boxId + "::" + sig)}" title="Move up">▲</button>
    <button class="gp-box-play-btn gp-box-play-down" aria-label="Move down"
      data-action="moveGamePlanPlayDown" data-arg="${escapeHtml(boxId + "::" + sig)}" title="Move down">▼</button>` : "";
  return `
    <div class="gp-box-play${isSpotlit ? " is-spotlit" : ""}" draggable="true"
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
  const spot = _gpFilters.spotlight;
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
      <details class="gp-scoreboard">
        <summary>📋 Coverage Scoreboard <span class="gp-score-hint">draft plays to populate</span></summary>
        <div class="gp-score-grid">${tiles}</div>
      </details>`;
  }
  return `
    <details class="gp-scoreboard" open>
      <summary>📋 Coverage Scoreboard <span class="gp-score-hint">click a tile to spotlight matching buckets &amp; plays</span></summary>
      <div class="gp-score-grid">${tiles}</div>
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
    // Double-click on title to rename
    const titleEl = box.querySelector(".gp-box-title");
    if (titleEl && boxId && boxId !== GP_HOLDING_ID) {
      titleEl.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        renameAnyGamePlanBox(boxId);
      });
    }
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
    spotlight: null,
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
    // Spotlight has highest priority — clear it first if active.
    if (_gpFilters.spotlight) {
      e.preventDefault();
      clearGamePlanSpotlight();
      showToast("Spotlight cleared", { duration: 1200 });
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
   Add Bucket — template-driven custom box creator
   ------------------------------------------------------------------------- */

const GP_BUCKET_TEMPLATES = [
  {
    id: "blank", icon: "📦", label: "Blank Bucket",
    description: "Free-form box. Add any plays you want.",
    promptName: "Bucket name:", defaultName: ""
  },
  {
    id: "down-distance", icon: "🔢", label: "Down & Distance",
    description: "Auto-target plays for a specific down/distance situation.",
    fields: [
      { key: "preferredDown", label: "Down", options: ["1", "2", "3", "4"] },
      { key: "preferredDistance", label: "Distance", options: ["Short", "Medium", "Long"] },
    ]
  },
  {
    id: "field-position", icon: "🟩", label: "Field Position",
    description: "Auto-target plays preferred for a specific zone of the field.",
    fields: [
      {
        key: "preferredFieldPosition", label: "Position",
        options: ["Green", "Lo-RZ", "Hi-RZ", "Goal Line", "Backed Up", "Saigon"]
      },
    ]
  },
  {
    id: "situation", icon: "🕒", label: "Special Situation",
    description: "Short Yardage / 2-Min / 4-Min plays.",
    fields: [
      {
        key: "preferredSituation", label: "Situation",
        options: ["Short Yardage", "2 Minute", "4 Minute"]
      },
    ]
  },
  {
    id: "tempo", icon: "⏱️", label: "Tempo Group",
    description: "Group plays by tempo designation.",
    fields: [{ key: "tempo", label: "Tempo", source: "tempo" }]
  },
  {
    id: "personnel", icon: "🧮", label: "Personnel Group",
    description: "Group plays by personnel.",
    fields: [{ key: "personnel", label: "Personnel", source: "personnel" }]
  },
  {
    id: "formation", icon: "📐", label: "Formation Group",
    description: "Group plays by formation.",
    fields: [{ key: "formation", label: "Formation", source: "formation" }]
  },
  {
    id: "vs-coverage", icon: "🛡️", label: "vs. Defense",
    description: "Plays tagged good vs. specific fronts/coverages.",
    fields: [
      { key: "vsTag", label: "Versus", options: ["Man", "Bear", "Okie"] },
    ]
  },
  {
    id: "must-haves", icon: "⭐", label: "Must Haves",
    description: "Free-form list of staple plays you must run this game.",
    promptName: "Bucket name:", defaultName: "Must Haves"
  },
  {
    id: "openers", icon: "🚀", label: "Openers / Script",
    description: "First 10–15 scripted plays.",
    promptName: "Bucket name:", defaultName: "Openers"
  },
];

function _gpUniqueValues(field) {
  if (!Array.isArray(plays)) return [];
  const seen = new Set();
  plays.forEach((p) => {
    const v = p[field];
    if (v && typeof v === "string") seen.add(v.trim());
  });
  return Array.from(seen).sort();
}

async function openGamePlanAddBucket() {
  const items = GP_BUCKET_TEMPLATES.map((t) => ({
    value: t.id,
    label: `${t.icon}  ${t.label} — ${t.description}`,
  }));
  const choice = await showListPicker(
    "Pick a bucket template:",
    items,
    { title: "➕ Add Bucket", icon: "➕" },
  );
  if (!choice) return;
  const template = GP_BUCKET_TEMPLATES.find((t) => t.id === choice);
  if (!template) return;
  await _gpCreateBucketFromTemplate(template);
}

async function _gpCreateBucketFromTemplate(template) {
  // Resolve dynamic field values via per-field pickers
  const filterCriteria = {};
  let dynamicLabelPart = "";
  if (Array.isArray(template.fields)) {
    for (const field of template.fields) {
      let opts = field.options;
      if (!opts && field.source) opts = _gpUniqueValues(field.source);
      if (!opts || opts.length === 0) {
        showToast(`No values found for ${field.label}.`, { type: "warning" });
        return;
      }
      const picked = await showListPicker(
        `Pick ${field.label}:`,
        opts.map((o) => ({ value: o, label: o })),
        { title: `${template.icon} ${template.label}`, icon: template.icon },
      );
      if (!picked) return;
      filterCriteria[field.key] = picked;
      dynamicLabelPart = dynamicLabelPart ? `${dynamicLabelPart} · ${picked}` : picked;
    }
  }

  // Compose default name
  let defaultName = template.defaultName || "";
  if (!defaultName) {
    if (template.id === "down-distance") defaultName = `${filterCriteria.preferredDown}rd & ${filterCriteria.preferredDistance}`;
    else if (template.id === "field-position") defaultName = filterCriteria.preferredFieldPosition;
    else if (template.id === "situation") defaultName = filterCriteria.preferredSituation;
    else if (template.id === "tempo") defaultName = `${filterCriteria.tempo} Tempo`;
    else if (template.id === "personnel") defaultName = `${filterCriteria.personnel} Pers`;
    else if (template.id === "formation") defaultName = filterCriteria.formation;
    else if (template.id === "vs-coverage") defaultName = `vs ${filterCriteria.vsTag}`;
  }
  const name = await showPrompt("Bucket name:", defaultName, {
    title: `${template.icon} ${template.label}`,
    icon: template.icon,
    placeholder: "Bucket name",
  });
  if (!name || !name.trim()) return;
  const trimmed = name.trim();

  // Generate unique id
  const board = _gpEnsureBoard();
  const taken = new Set([
    ...GP_DEFAULT_BOXES.map((b) => b.id),
    ...(board.customBoxes || []).map((b) => b.id),
    GP_HOLDING_ID,
  ]);
  let id = trimmed;
  let n = 2;
  while (taken.has(id)) id = `${trimmed} ${n++}`;

  _gpUpdateBoard((b) => {
    b.customBoxes = b.customBoxes || [];
    b.customBoxes.push({ id, label: trimmed, template: template.id, criteria: filterCriteria });
    b.assignments[id] = [];
  });

  // Auto-fill if a template specified criteria
  if (template.fields && Array.isArray(plays) && plays.length > 0) {
    const matches = plays.filter((p) => _gpPlayMatchesCriteria(p, template.id, filterCriteria));
    if (matches.length > 0) {
      const ok = await showConfirm(
        `Found <strong>${matches.length}</strong> play${matches.length === 1 ? "" : "s"} matching this template. Add them all to the new bucket?`,
        { title: "Auto-fill bucket?", icon: "✨", confirmText: `Add ${matches.length}`, cancelText: "Skip" },
      );
      if (ok) {
        _gpAddSigsToBox(matches.map(_gpPlaySignature), id);
        showToast(`Added ${matches.length} plays to “${trimmed}”`, { type: "success" });
      }
    } else {
      showToast(`Bucket “${trimmed}” added (no matching plays yet)`, { type: "info" });
    }
  } else {
    showToast(`Added bucket “${trimmed}”`, { type: "success" });
  }
  renderGamePlan();
}

function _gpPlayMatchesCriteria(play, templateId, criteria) {
  if (!play || !criteria) return false;
  if (templateId === "vs-coverage") {
    if (criteria.vsTag === "Man") return !!play.goodVsMan;
    if (criteria.vsTag === "Bear") return !!play.goodVsBear;
    if (criteria.vsTag === "Okie") return !!play.goodVsOkie;
    return false;
  }
  return Object.entries(criteria).every(([k, v]) => (play[k] || "") === v);
}

/* -------------------------------------------------------------------------
   Plan Health Score
   ------------------------------------------------------------------------- */

function _gpComputePlanHealth(board) {
  const drafted = _gpAllDraftedPlays(board);
  if (drafted.length === 0) {
    return { score: 0, label: "No plan yet", parts: [] };
  }
  const parts = [];

  // 1. Target completion (40%)
  const targets = board.targets || {};
  const targetIds = Object.keys(targets).filter((k) => Number(targets[k]) > 0);
  let targetScore = 100;
  if (targetIds.length > 0) {
    let met = 0;
    targetIds.forEach((k) => {
      const t = Number(targets[k]) || 0;
      const c = (board.assignments[k] || []).length;
      if (c >= t) met += 1;
    });
    targetScore = Math.round((met / targetIds.length) * 100);
  }
  parts.push({
    key: "targets", label: "Targets met", score: targetScore, weight: 0.4,
    detail: targetIds.length === 0 ? "No targets set" : `${targetIds.filter((k) => (board.assignments[k] || []).length >= (Number(targets[k]) || 0)).length} / ${targetIds.length}`
  });

  // 2. Scenario coverage (30%)
  let covered = 0;
  GP_COVERAGE_SCENARIOS.forEach((s) => {
    const count = drafted.filter(s.match).length;
    if (count >= 3) covered += 1;
    else if (count >= 1) covered += 0.5;
  });
  const scenarioScore = Math.round((covered / GP_COVERAGE_SCENARIOS.length) * 100);
  parts.push({
    key: "scenarios", label: "Scenario coverage", score: scenarioScore, weight: 0.3,
    detail: `${Math.round(covered)} / ${GP_COVERAGE_SCENARIOS.length} scenarios`
  });

  // 3. Type balance (20%)
  const typeCounts = {};
  drafted.forEach((p) => {
    const t = GP_TYPE_ALIASES[p.type] || p.type || "Other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  const typesPresent = Object.keys(typeCounts).length;
  const balanceScore = Math.min(100, typesPresent * 20); // 5+ types = 100
  parts.push({
    key: "balance", label: "Type variety", score: balanceScore, weight: 0.2,
    detail: `${typesPresent} types in mix`
  });

  // 4. Holding cleared (10%)
  const holdingCount = (board.assignments[GP_HOLDING_ID] || []).length;
  const holdingScore = holdingCount === 0 ? 100 : Math.max(0, 100 - holdingCount * 10);
  parts.push({
    key: "holding", label: "Holding cleared", score: holdingScore, weight: 0.1,
    detail: holdingCount === 0 ? "Empty" : `${holdingCount} unrouted`
  });

  const score = Math.round(parts.reduce((sum, p) => sum + (p.score * p.weight), 0));
  let label = "Excellent";
  if (score < 40) label = "Needs work";
  else if (score < 65) label = "In progress";
  else if (score < 85) label = "Solid";
  return { score, label, parts };
}

function _gpRenderHealthGauge(board) {
  const h = _gpComputePlanHealth(board);
  const status = h.score >= 85 ? "ok" : h.score >= 65 ? "good" : h.score >= 40 ? "warn" : "low";
  // SVG circular progress
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (h.score / 100) * c;
  return `
    <button class="gp-health" data-action="openGamePlanHealthDetail"
      title="Plan Health: ${h.score}/100 — click for breakdown">
      <svg class="gp-health-svg" viewBox="0 0 50 50" aria-hidden="true">
        <circle class="gp-health-track" cx="25" cy="25" r="${r}" />
        <circle class="gp-health-fill gp-health-${status}" cx="25" cy="25" r="${r}"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" />
      </svg>
      <div class="gp-health-text">
        <div class="gp-health-score">${h.score}</div>
        <div class="gp-health-label">${escapeHtml(h.label)}</div>
      </div>
    </button>`;
}

function openGamePlanHealthDetail() {
  const board = _gpEnsureBoard();
  const h = _gpComputePlanHealth(board);
  const rows = h.parts.map((p) => {
    const status = p.score >= 85 ? "ok" : p.score >= 65 ? "good" : p.score >= 40 ? "warn" : "low";
    return `
      <div class="gp-health-row">
        <div class="gp-health-row-label">
          <strong>${escapeHtml(p.label)}</strong>
          <span class="gp-health-row-detail">${escapeHtml(p.detail)}</span>
        </div>
        <div class="gp-health-row-bar">
          <div class="gp-health-row-fill gp-health-${status}" style="width:${p.score}%"></div>
        </div>
        <div class="gp-health-row-score">${p.score}</div>
      </div>`;
  }).join("");
  const html = `
    <div class="gp-health-detail">
      <div class="gp-health-detail-summary gp-health-${h.score >= 85 ? "ok" : h.score >= 65 ? "good" : h.score >= 40 ? "warn" : "low"}">
        <div class="gp-health-detail-score">${h.score}</div>
        <div class="gp-health-detail-label">${escapeHtml(h.label)}</div>
      </div>
      <div class="gp-health-rows">${rows}</div>
      <p class="gp-health-explainer">
        Score is a weighted blend of how many bucket targets are met (40%),
        coverage across the 9 game scenarios (30%), variety of play types (20%),
        and whether the Holding box is cleared (10%).
      </p>
    </div>`.replace(/\n\s+/g, " ");
  showModal(html, { title: "🩺 Plan Health Breakdown", icon: "🩺" });
}

/* -------------------------------------------------------------------------
   Player Touch Tracker
   ------------------------------------------------------------------------- */

function _gpComputeTouchCounts(board) {
  const drafted = _gpAllDraftedPlays(board);
  const counts = {}; // { displayName: { count, positions: Set } }
  drafted.forEach((p) => {
    [1, 2, 3].forEach((i) => {
      const pos = p[`keyPlayer${i}`] || "";
      const name = p[`keyPlayerName${i}`] || "";
      const display = (name && name.trim()) || (pos && pos.trim()) || "";
      if (!display) return;
      if (!counts[display]) counts[display] = { count: 0, positions: new Set() };
      counts[display].count += 1;
      if (pos) counts[display].positions.add(pos);
    });
  });
  return counts;
}

function _gpRenderTouchTracker(board) {
  const counts = _gpComputeTouchCounts(board);
  const entries = Object.entries(counts);
  if (entries.length === 0) return "";
  entries.sort((a, b) => b[1].count - a[1].count);
  const max = entries[0][1].count || 1;
  const spot = _gpFilters.spotlight;
  const tiles = entries.map(([name, info]) => {
    const heat = Math.round((info.count / max) * 100);
    const positions = Array.from(info.positions).join(", ");
    const isActive = spot && spot.kind === "player" && spot.name === name;
    return `
      <button class="gp-touch-tile${isActive ? " is-active" : ""}" data-action="filterGamePlanByPlayer"
        data-arg="${escapeHtml(name)}"
        title="${escapeHtml(name)} — ${info.count} touches${positions ? ` • ${escapeHtml(positions)}` : ""}. Click to spotlight buckets featuring this player.">
        <div class="gp-touch-name">${escapeHtml(name)}</div>
        <div class="gp-touch-count">${info.count}</div>
        <div class="gp-touch-bar">
          <div class="gp-touch-bar-fill" style="width:${heat}%"></div>
        </div>
      </button>`;
  }).join("");
  return `
    <details class="gp-touch-tracker" ${entries.length <= 8 ? "open" : ""}>
      <summary>👥 Touch Tracker <span class="gp-touch-hint">${entries.length} player${entries.length === 1 ? "" : "s"} • click a tile to spotlight buckets</span></summary>
      <div class="gp-touch-grid">${tiles}</div>
    </details>`;
}

function filterGamePlanByPlayer(name) {
  if (!name) return;
  const spot = _gpFilters.spotlight;
  const alreadyActive = spot && spot.kind === "player" && spot.name === name;
  if (alreadyActive) {
    _gpFilters.spotlight = null;
    _gpFilters.search = "";
  } else {
    _gpFilters.spotlight = { kind: "player", name };
    _gpFilters.search = name;
  }
  renderGamePlan();
  const search = document.getElementById("gpSearch");
  if (search) search.value = _gpFilters.search;
}

// True if a play matches the active spotlight (used to highlight plays in boxes).
function _gpPlayMatchesSpotlight(play) {
  const spot = _gpFilters.spotlight;
  if (!spot || !play) return false;
  if (spot.kind === "scenario") {
    const sc = GP_COVERAGE_SCENARIOS.find((s) => s.id === spot.id);
    return !!(sc && sc.match(play));
  }
  if (spot.kind === "player") {
    const target = (spot.name || "").trim().toLowerCase();
    if (!target) return false;
    const names = [play.keyPlayerName1, play.keyPlayerName2, play.keyPlayerName3]
      .filter(Boolean).map((n) => String(n).trim().toLowerCase());
    return names.includes(target);
  }
  return false;
}

function clearGamePlanSpotlight() {
  if (!_gpFilters.spotlight) return;
  const spot = _gpFilters.spotlight;
  _gpFilters.spotlight = null;
  // Also clear the library filter side-effects so the library returns to normal.
  if (spot.kind === "scenario") {
    const sc = GP_COVERAGE_SCENARIOS.find((s) => s.id === spot.id);
    if (sc) Object.keys(sc.filters).forEach((k) => { _gpFilters[k] = ""; });
  } else if (spot.kind === "player") {
    _gpFilters.search = "";
  }
  renderGamePlan();
}

/* -------------------------------------------------------------------------
   Print View
   ------------------------------------------------------------------------- */

let _gpPrintOptions = {
  paperSize: "letter",
  orientation: "landscape",
  columns: 3,
  showHash: true,
  showNotes: true,
  showProgress: true,
  showMeta: true,
  showHolding: false,
  showEmpty: false,
  bucketPerPage: false,
  showPageNumbers: true,
  showFooter: true,
};

async function openGamePlanPrintModal() {
  const o = _gpPrintOptions;
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🖨️</span>
          <h3 class="custom-modal-title">Print Game Plan</h3>
        </div>
        <div class="custom-modal-body">
          <div class="gp-print-form">
            <div class="gp-print-row">
              <label>Paper</label>
              <select id="gpPrintPaper">
                <option value="letter" ${o.paperSize === "letter" ? "selected" : ""}>Letter (8.5×11)</option>
                <option value="legal" ${o.paperSize === "legal" ? "selected" : ""}>Legal (8.5×14)</option>
                <option value="tabloid" ${o.paperSize === "tabloid" ? "selected" : ""}>Tabloid (11×17)</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Orientation</label>
              <select id="gpPrintOrientation">
                <option value="portrait" ${o.orientation === "portrait" ? "selected" : ""}>Portrait</option>
                <option value="landscape" ${o.orientation === "landscape" ? "selected" : ""}>Landscape</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Columns</label>
              <select id="gpPrintColumns">
                <option value="2" ${o.columns === 2 ? "selected" : ""}>2</option>
                <option value="3" ${o.columns === 3 ? "selected" : ""}>3</option>
                <option value="4" ${o.columns === 4 ? "selected" : ""}>4</option>
                <option value="5" ${o.columns === 5 ? "selected" : ""}>5</option>
              </select>
            </div>
            <div class="gp-print-row gp-print-toggles">
              <label><input type="checkbox" id="gpPrintMeta" ${o.showMeta ? "checked" : ""}> Show formation/personnel</label>
              <label><input type="checkbox" id="gpPrintHash" ${o.showHash ? "checked" : ""}> Show hash bar</label>
              <label><input type="checkbox" id="gpPrintProgress" ${o.showProgress ? "checked" : ""}> Show targets</label>
              <label><input type="checkbox" id="gpPrintNotes" ${o.showNotes ? "checked" : ""}> Show notes</label>
              <label><input type="checkbox" id="gpPrintHolding" ${o.showHolding ? "checked" : ""}> Include Holding box</label>
              <label><input type="checkbox" id="gpPrintEmpty" ${o.showEmpty ? "checked" : ""}> Include empty boxes</label>
              <label><input type="checkbox" id="gpPrintBucketPerPage" ${o.bucketPerPage ? "checked" : ""}> One bucket per page</label>
              <label><input type="checkbox" id="gpPrintPageNumbers" ${o.showPageNumbers ? "checked" : ""}> Page numbers</label>
              <label><input type="checkbox" id="gpPrintFooter" ${o.showFooter ? "checked" : ""}> Footer (team · opponent · date)</label>
            </div>
          </div>
        </div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="gpPrintCancel">Cancel</button>
          <button class="btn btn-primary custom-modal-btn" id="gpPrintConfirm">Print</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const close = (ok) => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(ok);
    };
    overlay.querySelector("#gpPrintCancel").addEventListener("click", () => close(false));
    overlay.querySelector("#gpPrintConfirm").addEventListener("click", () => {
      _gpPrintOptions = {
        paperSize: overlay.querySelector("#gpPrintPaper").value,
        orientation: overlay.querySelector("#gpPrintOrientation").value,
        columns: parseInt(overlay.querySelector("#gpPrintColumns").value, 10) || 3,
        showMeta: overlay.querySelector("#gpPrintMeta").checked,
        showHash: overlay.querySelector("#gpPrintHash").checked,
        showProgress: overlay.querySelector("#gpPrintProgress").checked,
        showNotes: overlay.querySelector("#gpPrintNotes").checked,
        showHolding: overlay.querySelector("#gpPrintHolding").checked,
        showEmpty: overlay.querySelector("#gpPrintEmpty").checked,
        bucketPerPage: overlay.querySelector("#gpPrintBucketPerPage").checked,
        showPageNumbers: overlay.querySelector("#gpPrintPageNumbers").checked,
        showFooter: overlay.querySelector("#gpPrintFooter").checked,
      };
      close(true);
      _gpRenderPrintViewAndPrint();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
    });
  });
}

function _gpRenderPrintViewAndPrint() {
  const board = _gpEnsureBoard();
  const o = _gpPrintOptions;
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw && gw.opponentName ? gw.opponentName : "";
  const weekLabel = gw && gw.weekLabel ? gw.weekLabel : "";

  let allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  if (o.showHolding) allBoxes = [GP_HOLDING_BOX, ...allBoxes];
  if (!o.showEmpty) {
    allBoxes = allBoxes.filter((b) => (board.assignments[b.id] || []).length > 0);
  }

  const boxesHtml = allBoxes.map((b) => _gpRenderPrintBox(b, board)).join("");
  const totalAssigned = _gpAllAssignedSigs(board).size;
  const headerHtml = `
    <div class="gp-print-header">
      <div class="gp-print-title">
        <span class="gp-print-team">${typeof getTeamName === "function" ? escapeHtml(getTeamName() || "Game Plan") : "Game Plan"}</span>
        ${opponent ? `<span class="gp-print-opp">vs ${escapeHtml(opponent)}</span>` : ""}
      </div>
      <div class="gp-print-meta">
        ${weekLabel ? `<span>${escapeHtml(weekLabel)}</span>` : ""}
        <span>${totalAssigned} plays drafted</span>
        <span>${new Date().toLocaleDateString()}</span>
      </div>
    </div>`;

  // Build the print container; written into a hidden host that print CSS unhides
  let host = document.getElementById("gpPrintRoot");
  if (!host) {
    host = document.createElement("div");
    host.id = "gpPrintRoot";
    document.body.appendChild(host);
  }
  const rootClasses = [
    "gp-print-root",
    `gp-print-${o.paperSize}`,
    `gp-print-${o.orientation}`,
    o.bucketPerPage ? "gp-print-bucket-per-page" : "",
    o.showFooter ? "gp-print-with-footer" : "",
  ].filter(Boolean).join(" ");
  host.className = rootClasses;
  host.style.setProperty("--gp-print-cols", String(o.columns));
  const footerHtml = o.showFooter ? `
    <div class="gp-print-footer">
      <span>${typeof getTeamName === "function" ? escapeHtml(getTeamName() || "") : ""}</span>
      <span>${opponent ? `vs ${escapeHtml(opponent)}` : ""}</span>
      <span>${new Date().toLocaleDateString()}</span>
    </div>` : "";
  host.innerHTML = headerHtml + `<div class="gp-print-grid">${boxesHtml}</div>` + footerHtml;
  document.body.classList.add("gp-printing");
  // Set @page size hint via style tag (one-shot)
  let pageStyle = document.getElementById("gpPrintPageStyle");
  if (!pageStyle) {
    pageStyle = document.createElement("style");
    pageStyle.id = "gpPrintPageStyle";
    document.head.appendChild(pageStyle);
  }
  const pageNumRule = o.showPageNumbers
    ? `@page { @bottom-right { content: counter(page) " / " counter(pages); font-family: ${"'Inter', sans-serif"}; font-size: 8pt; color: #555; } }`
    : "";
  pageStyle.textContent = `@page { size: ${o.paperSize} ${o.orientation}; margin: 0.45in 0.4in 0.5in; } ${pageNumRule}`;
  // Print, then clean up
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove("gp-printing");
    }, 500);
  }, 100);
}

function _gpRenderPrintBox(box, board) {
  const o = _gpPrintOptions;
  const list = (board.assignments[box.id] || []).slice();
  const target = Number(board.targets && board.targets[box.id]) || 0;
  const note = (board.notes && board.notes[box.id]) || "";
  const accent = GP_BOX_ACCENTS[box.id] || "";
  const accentStyle = accent ? `style="--gp-box-accent:${accent}"` : "";
  const targetLabel = o.showProgress && target > 0 ? `<span class="gp-print-target">${list.length}/${target}</span>` : `<span class="gp-print-target">${list.length}</span>`;
  const noteHtml = o.showNotes && note ? `<div class="gp-print-note">${escapeHtml(note)}</div>` : "";
  const hashHtml = o.showHash ? _gpRenderBoxHashBar(list) : "";
  const playsHtml = list.length === 0
    ? `<div class="gp-print-empty">— empty —</div>`
    : list.map((p) => _gpRenderPrintPlay(p)).join("");
  return `
    <div class="gp-print-box" ${accentStyle}>
      <div class="gp-print-box-head">
        <span class="gp-print-box-label">${escapeHtml(box.label)}</span>
        ${targetLabel}
      </div>
      ${hashHtml}
      ${noteHtml}
      <ol class="gp-print-plays">${playsHtml}</ol>
    </div>`;
}

function _gpRenderPrintPlay(play) {
  const o = _gpPrintOptions;
  const callHtml = typeof getFullCall === "function"
    ? getFullCall(play, { showLineCall: false })
    : escapeHtml(play.play || "");
  const meta = [];
  if (o.showMeta) {
    if (play.formation) meta.push(escapeHtml(play.formation));
    if (play.personnel) meta.push(escapeHtml(play.personnel));
    if (play.preferredHash) meta.push(`<em>${escapeHtml(play.preferredHash)} hash</em>`);
  }
  const metaHtml = meta.length > 0 ? `<span class="gp-print-play-meta">${meta.join(" · ")}</span>` : "";
  return `<li class="gp-print-play">${callHtml}${metaHtml}</li>`;
}

/* -------------------------------------------------------------------------
   Push to Practice Script
   ------------------------------------------------------------------------- */

async function pushGamePlanToScript() {
  if (!Array.isArray(window.script)) {
    showToast("Script tab isn't ready yet.", { type: "error" });
    return;
  }
  const board = _gpEnsureBoard();
  const allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  const populated = allBoxes.filter((b) => (board.assignments[b.id] || []).length > 0);
  if (populated.length === 0) {
    showToast("No drafted plays to push.", { type: "warning" });
    return;
  }
  const items = [
    { value: "__all__", label: `📦 All boxes (${populated.length} buckets)` },
    ...populated.map((b) => ({
      value: b.id,
      label: `${b.label} (${(board.assignments[b.id] || []).length})`,
    })),
  ];
  const choice = await showListPicker(
    "Push which box(es) to the practice script?",
    items,
    { title: "📋 Push to Script", icon: "📋" },
  );
  if (!choice) return;
  const targetBoxes = choice === "__all__" ? populated : populated.filter((b) => b.id === choice);

  const mode = await showChoice(
    "How should plays be added to the script?",
    {
      title: "Add Mode",
      icon: "📋",
      option1: "📑 New period per box",
      option2: "➕ Append to end of script",
    },
  );
  if (!mode) return;

  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opp = gw && gw.opponentName ? gw.opponentName : "";
  let pushed = 0;

  targetBoxes.forEach((b) => {
    const list = board.assignments[b.id] || [];
    if (list.length === 0) return;
    if (mode === "option1") {
      script.push({
        isSeparator: true,
        label: opp ? `${b.label} — vs ${opp}` : b.label,
        id: Date.now() + Math.random(),
      });
    }
    list.forEach((p) => {
      script.push({ ...p, id: Date.now() + Math.random() });
      pushed += 1;
    });
  });

  if (typeof markScriptDirty === "function") markScriptDirty();
  if (typeof scheduleScriptAutosave === "function") scheduleScriptAutosave();
  if (typeof renderScript === "function") renderScript();
  showToast(`Pushed ${pushed} play${pushed === 1 ? "" : "s"} to the script`,
    { type: "success", duration: 3000 });
}

/* -------------------------------------------------------------------------
   Plan Comparison (snapshot diff)
   ------------------------------------------------------------------------- */

async function openGamePlanCompare() {
  const snaps = _gpSnapshotsForOpponent();
  const board = _gpEnsureBoard();
  const totalDrafted = _gpAllAssignedSigs(board).size;
  // Build pickable list: current + saved snapshots
  const items = [];
  if (totalDrafted > 0) items.push({ value: "__current__", label: `🟢 Current board (${totalDrafted} plays)` });
  snaps.forEach((s) => {
    items.push({ value: s.id, label: `💾 ${s.name} — ${new Date(s.savedAt).toLocaleDateString()}` });
  });
  if (items.length < 2) {
    showToast("Save at least one snapshot to compare. (Use 💾 Save Plan first.)", { type: "warning" });
    return;
  }
  const a = await showListPicker("Pick the FIRST plan:", items, { title: "🔄 Compare Plans (1/2)", icon: "🔄" });
  if (!a) return;
  const b = await showListPicker("Pick the SECOND plan:", items.filter((x) => x.value !== a),
    { title: "🔄 Compare Plans (2/2)", icon: "🔄" });
  if (!b) return;
  _gpRenderCompareModal(a, b);
}

function _gpResolvePlanSource(id) {
  if (id === "__current__") {
    const board = _gpEnsureBoard();
    return { name: "Current board", board };
  }
  const snap = _gpSnapshotsForOpponent().find((s) => s.id === id);
  if (!snap) return null;
  return { name: snap.name, board: snap.board };
}

function _gpAssignmentsByBox(board) {
  // Return Map<boxId, Set<sig>>
  const map = new Map();
  Object.entries(board.assignments || {}).forEach(([boxId, list]) => {
    map.set(boxId, new Set((list || []).map(_gpPlaySignature)));
  });
  return map;
}

function _gpRenderCompareModal(idA, idB) {
  const a = _gpResolvePlanSource(idA);
  const b = _gpResolvePlanSource(idB);
  if (!a || !b) {
    showToast("Couldn't load one of those plans.", { type: "error" });
    return;
  }
  const mapA = _gpAssignmentsByBox(a.board);
  const mapB = _gpAssignmentsByBox(b.board);
  const allBoxIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const labelFor = (id) => {
    if (id === GP_HOLDING_ID) return "📥 Holding";
    const def = GP_DEFAULT_BOXES.find((x) => x.id === id);
    if (def) return def.label;
    const cb = (a.board.customBoxes || []).concat(b.board.customBoxes || []).find((x) => x.id === id);
    return cb ? cb.label : id;
  };

  let totalAdded = 0;
  let totalRemoved = 0;
  let totalShared = 0;
  const rows = [];
  allBoxIds.forEach((boxId) => {
    const sa = mapA.get(boxId) || new Set();
    const sb = mapB.get(boxId) || new Set();
    const added = [...sb].filter((s) => !sa.has(s));
    const removed = [...sa].filter((s) => !sb.has(s));
    const shared = [...sa].filter((s) => sb.has(s));
    if (added.length === 0 && removed.length === 0 && shared.length === 0) return;
    totalAdded += added.length;
    totalRemoved += removed.length;
    totalShared += shared.length;
    rows.push({ boxId, added, removed, shared });
  });

  rows.sort((x, y) => (y.added.length + y.removed.length) - (x.added.length + x.removed.length));

  const sigToShort = (sig) => {
    const p = _gpFindPlayBySig(sig);
    if (!p) return escapeHtml(sig);
    return typeof getFullCall === "function" ? getFullCall(p, { showLineCall: false }) : escapeHtml(p.play || sig);
  };

  const rowsHtml = rows.map((r) => {
    const addedHtml = r.added.length === 0 ? `<li class="gp-cmp-empty">—</li>`
      : r.added.map((s) => `<li class="gp-cmp-added">+ ${sigToShort(s)}</li>`).join("");
    const removedHtml = r.removed.length === 0 ? `<li class="gp-cmp-empty">—</li>`
      : r.removed.map((s) => `<li class="gp-cmp-removed">− ${sigToShort(s)}</li>`).join("");
    return `
      <div class="gp-cmp-row">
        <div class="gp-cmp-row-head">
          <span class="gp-cmp-row-label">${escapeHtml(labelFor(r.boxId))}</span>
          <span class="gp-cmp-row-stats">
            <span class="gp-cmp-shared">${r.shared.length} shared</span>
            <span class="gp-cmp-added-count">+${r.added.length}</span>
            <span class="gp-cmp-removed-count">−${r.removed.length}</span>
          </span>
        </div>
        <div class="gp-cmp-row-cols">
          <ul class="gp-cmp-list gp-cmp-list-added"><li class="gp-cmp-col-head">Added in ${escapeHtml(b.name)}</li>${addedHtml}</ul>
          <ul class="gp-cmp-list gp-cmp-list-removed"><li class="gp-cmp-col-head">Removed from ${escapeHtml(a.name)}</li>${removedHtml}</ul>
        </div>
      </div>`;
  }).join("");

  const html = `
    <div class="gp-cmp">
      <div class="gp-cmp-summary">
        <div><strong>${escapeHtml(a.name)}</strong> → <strong>${escapeHtml(b.name)}</strong></div>
        <div class="gp-cmp-summary-stats">
          <span class="gp-cmp-shared">${totalShared} shared</span>
          <span class="gp-cmp-added-count">+${totalAdded} added</span>
          <span class="gp-cmp-removed-count">−${totalRemoved} removed</span>
        </div>
      </div>
      <div class="gp-cmp-rows">${rowsHtml || `<p class="gp-cmp-empty">Both plans are identical.</p>`}</div>
    </div>`.replace(/\n\s+/g, " ");
  showModal(html, { title: "🔄 Plan Comparison", icon: "🔄" });
}

/* -------------------------------------------------------------------------
   Box Reorder + Hide + Rename
   ------------------------------------------------------------------------- */

async function openGamePlanReorderBoxes() {
  const board = _gpEnsureBoard();
  const visibleBoxes = [
    ...GP_DEFAULT_BOXES,
    ...(board.customBoxes || []),
  ];
  // Apply current order
  const orderIdx = (id) => {
    const i = (board.boxOrder || []).indexOf(id);
    return i >= 0 ? i : 9999;
  };
  const ordered = visibleBoxes.slice().sort((x, y) => {
    const dx = orderIdx(x.id);
    const dy = orderIdx(y.id);
    if (dx !== dy) return dx - dy;
    return visibleBoxes.indexOf(x) - visibleBoxes.indexOf(y);
  });
  const labels = ordered.map((b) => b.label);
  const idsByLabel = new Map();
  ordered.forEach((b) => idsByLabel.set(b.label, b.id));

  showReorderModal(labels, {
    title: "↕️ Reorder Boxes",
    note: "Drag boxes to set the display order. Holding always stays first.",
    saveLabel: "💾 Save Order",
    onSave: (newOrder) => {
      const newIds = newOrder.map((lab) => idsByLabel.get(lab)).filter(Boolean);
      _gpUpdateBoard((b) => { b.boxOrder = newIds; });
      renderGamePlan();
      showToast("Box order saved", { type: "success" });
    },
    onClear: () => {
      _gpUpdateBoard((b) => { b.boxOrder = []; });
      renderGamePlan();
      showToast("Reset to default order", { type: "info" });
    },
  });
}

function moveGamePlanBoxUp(boxId) { _gpNudgeBoxOrder(boxId, -1); }
function moveGamePlanBoxDown(boxId) { _gpNudgeBoxOrder(boxId, 1); }

function _gpNudgeBoxOrder(boxId, delta) {
  if (!boxId || boxId === GP_HOLDING_ID) return;
  const board = _gpEnsureBoard();
  const visibleIds = [
    ...GP_DEFAULT_BOXES.map((b) => b.id),
    ...(board.customBoxes || []).map((b) => b.id),
  ];
  // Materialize current order
  const current = (board.boxOrder && board.boxOrder.length > 0)
    ? visibleIds.slice().sort((a, b) => {
      const ia = board.boxOrder.indexOf(a);
      const ib = board.boxOrder.indexOf(b);
      return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
    })
    : visibleIds.slice();
  const idx = current.indexOf(boxId);
  if (idx < 0) return;
  const next = idx + delta;
  if (next < 0 || next >= current.length) return;
  current.splice(next, 0, current.splice(idx, 1)[0]);
  _gpUpdateBoard((b) => { b.boxOrder = current; });
  renderGamePlan();
}

async function hideGamePlanBox(boxId) {
  if (!boxId || boxId === GP_HOLDING_ID) return;
  _gpUpdateBoard((b) => {
    b.hiddenBoxes = b.hiddenBoxes || [];
    if (!b.hiddenBoxes.includes(boxId)) b.hiddenBoxes.push(boxId);
  });
  renderGamePlan();
  showToast(`Hidden. Click 👁️ Manage Boxes to restore.`, { type: "info" });
}

async function openGamePlanManageBoxes() {
  const board = _gpEnsureBoard();
  const all = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  const hidden = new Set(board.hiddenBoxes || []);
  const rowsHtml = all.map((b) => {
    const count = (board.assignments[b.id] || []).length;
    const isHidden = hidden.has(b.id);
    return `
      <label class="gp-mgb-row ${isHidden ? "is-hidden" : ""}">
        <input type="checkbox" class="gp-mgb-cb" data-box-id="${escapeHtml(b.id)}" ${isHidden ? "" : "checked"} />
        <span class="gp-mgb-label">${escapeHtml(b.label)}</span>
        <span class="gp-mgb-count">${count}</span>
      </label>`;
  }).join("");
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">👁️</span>
          <h3 class="custom-modal-title">Manage Box Visibility</h3>
        </div>
        <div class="custom-modal-body">
          <p class="gp-mgb-help">Uncheck boxes to hide them from the board. Hidden boxes keep their plays — they're just out of sight.</p>
          <div class="gp-mgb-list">${rowsHtml}</div>
          <div class="gp-mgb-bulk">
            <button class="btn btn-sm" id="gpMgbAll">☑ Show All</button>
            <button class="btn btn-sm" id="gpMgbNone">▢ Hide All Defaults</button>
          </div>
        </div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="gpMgbCancel">Cancel</button>
          <button class="btn btn-primary custom-modal-btn" id="gpMgbSave">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    const close = (v) => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(v);
    };
    overlay.querySelector("#gpMgbAll").addEventListener("click", () => {
      overlay.querySelectorAll(".gp-mgb-cb").forEach((cb) => { cb.checked = true; });
    });
    overlay.querySelector("#gpMgbNone").addEventListener("click", () => {
      overlay.querySelectorAll(".gp-mgb-cb").forEach((cb) => {
        const id = cb.dataset.boxId;
        const isDefault = GP_DEFAULT_BOXES.some((d) => d.id === id);
        if (isDefault) cb.checked = false;
      });
    });
    overlay.querySelector("#gpMgbCancel").addEventListener("click", () => close(false));
    overlay.querySelector("#gpMgbSave").addEventListener("click", () => {
      const newHidden = [];
      overlay.querySelectorAll(".gp-mgb-cb").forEach((cb) => {
        if (!cb.checked) newHidden.push(cb.dataset.boxId);
      });
      _gpUpdateBoard((b) => { b.hiddenBoxes = newHidden; });
      close(true);
      renderGamePlan();
      showToast("Box visibility saved", { type: "success" });
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
  });
}

async function renameAnyGamePlanBox(boxId) {
  if (!boxId || boxId === GP_HOLDING_ID) return;
  const board = _gpEnsureBoard();
  const cb = (board.customBoxes || []).find((b) => b.id === boxId);
  const def = GP_DEFAULT_BOXES.find((b) => b.id === boxId);
  const currentLabel = cb ? cb.label : (board.boxLabels && board.boxLabels[boxId]) || (def ? def.label : boxId);
  const next = await showPrompt("Rename this box:", currentLabel, { title: "✏️ Rename Box", icon: "✏️" });
  if (!next || !next.trim() || next.trim() === currentLabel) return;
  const trimmed = next.trim();
  _gpUpdateBoard((b) => {
    if (cb) {
      const target = (b.customBoxes || []).find((x) => x.id === boxId);
      if (target) target.label = trimmed;
    } else {
      b.boxLabels = b.boxLabels || {};
      b.boxLabels[boxId] = trimmed;
    }
  });
  renderGamePlan();
}

/* -------------------------------------------------------------------------
   Coverage Matrix (heatmap: rows = boxes, cols = scenarios)
   ------------------------------------------------------------------------- */

function openGamePlanCoverageMatrix() {
  const board = _gpEnsureBoard();
  const visibleBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  // Compute matrix
  let max = 0;
  const matrix = visibleBoxes.map((b) => {
    const list = board.assignments[b.id] || [];
    const cells = GP_COVERAGE_SCENARIOS.map((s) => {
      const c = list.filter(s.match).length;
      if (c > max) max = c;
      return c;
    });
    return { box: b, cells, total: list.length };
  });
  const headerCells = GP_COVERAGE_SCENARIOS.map((s) =>
    `<th class="gp-cmx-col-head" title="${escapeHtml(s.label)}">${escapeHtml(s.icon || "")}<br>${escapeHtml(s.shortLabel || s.label)}</th>`,
  ).join("");
  const bodyRows = matrix.map((row) => {
    const cells = row.cells.map((c, i) => {
      const intensity = max > 0 ? c / max : 0;
      const cls = c === 0 ? "gp-cmx-zero" : intensity >= 0.66 ? "gp-cmx-hot" : intensity >= 0.33 ? "gp-cmx-warm" : "gp-cmx-cool";
      return `<td class="gp-cmx-cell ${cls}" title="${escapeHtml(row.box.label)} × ${escapeHtml(GP_COVERAGE_SCENARIOS[i].label)}: ${c}">${c}</td>`;
    }).join("");
    return `
      <tr>
        <th class="gp-cmx-row-head">${escapeHtml(row.box.label)}</th>
        ${cells}
        <td class="gp-cmx-total">${row.total}</td>
      </tr>`;
  }).join("");
  const html = `
    <div class="gp-cmx">
      <p class="gp-cmx-help">Heatmap of how each box covers the 9 game scenarios. Hot cells = strong coverage, gray = no plays match. Use this to spot gaps.</p>
      <div class="gp-cmx-scroll">
        <table class="gp-cmx-table">
          <thead><tr><th class="gp-cmx-corner">Box \\ Scenario</th>${headerCells}<th class="gp-cmx-col-head">Total</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>`.replace(/\n\s+/g, " ");
  showModal(html, { title: "🌡️ Coverage Matrix", icon: "🌡️" });
}

/* -------------------------------------------------------------------------
   Tendency Mirror — match opponent defensive tendencies vs offense plan
   ------------------------------------------------------------------------- */

function _gpResolveOpponentTendencies() {
  if (!Array.isArray(window.tendenciesOpponents) || window.tendenciesOpponents.length === 0) return null;
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const oppName = gw && gw.opponentName ? gw.opponentName : null;
  if (oppName) {
    const exact = window.tendenciesOpponents.find((o) => o.name && o.name.toLowerCase() === oppName.toLowerCase());
    if (exact) return exact;
  }
  // Fallback: current opponent index
  if (typeof window.tendenciesCurrentOpponent === "number" && window.tendenciesOpponents[window.tendenciesCurrentOpponent]) {
    return window.tendenciesOpponents[window.tendenciesCurrentOpponent];
  }
  return window.tendenciesOpponents[0];
}

function openGamePlanTendencyMirror() {
  const opp = _gpResolveOpponentTendencies();
  if (!opp || !Array.isArray(opp.plays) || opp.plays.length === 0) {
    showToast("No defensive tendencies recorded for this opponent. Chart some on the Tendencies tab first.", { type: "warning", duration: 4000 });
    return;
  }
  const board = _gpEnsureBoard();
  const drafted = _gpAllDraftedPlays(board);

  const tally = (rows, key) => {
    const m = new Map();
    rows.forEach((r) => {
      const v = (r[key] || "").toString().trim();
      if (!v) return;
      m.set(v, (m.get(v) || 0) + 1);
    });
    return m;
  };
  const pct = (count, total) => total === 0 ? 0 : Math.round((count / total) * 100);

  // Defensive front + coverage seen most by opponent
  const dFront = tally(opp.plays, "defFront");
  const dCov = tally(opp.plays, "defCoverage");
  const dBlitz = tally(opp.plays, "defBlitz");
  const oppTotal = opp.plays.length;
  const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const frontTop = topN(dFront, 4);
  const covTop = topN(dCov, 4);
  const blitzTop = topN(dBlitz, 4);

  // Offensive coverage in plan
  const oFront = tally(drafted, "practiceFront");
  const oCov = tally(drafted, "practiceCoverage");
  const oBlitz = tally(drafted, "practiceBlitz");
  const planTotal = drafted.length;

  const renderMatchRow = (oppMap, planMap, oppKey, planKey, total, totalPlan) => {
    const items = topN(oppMap, 5);
    if (items.length === 0) return `<li class="gp-tm-empty">No data</li>`;
    return items.map(([val, cnt]) => {
      const oppPct = pct(cnt, total);
      const planCnt = planMap.get(val) || 0;
      const planPct = pct(planCnt, totalPlan);
      const status = planCnt === 0 ? "low" : planPct >= oppPct * 0.6 ? "ok" : "warn";
      return `
        <li class="gp-tm-row gp-tm-${status}">
          <span class="gp-tm-label">${escapeHtml(val)}</span>
          <span class="gp-tm-bars">
            <span class="gp-tm-bar-opp" style="width:${oppPct}%" title="Opp shows ${cnt} (${oppPct}%)"></span>
            <span class="gp-tm-bar-plan" style="width:${planPct}%" title="Plan covers ${planCnt} (${planPct}%)"></span>
          </span>
          <span class="gp-tm-counts">${cnt} / ${planCnt}</span>
        </li>`;
    }).join("");
  };

  // Down/distance run-pass tendencies (opp)
  const ddBuckets = ["1-Any", "2-Short", "2-Medium", "2-Long", "3-Short", "3-Medium", "3-Long"];
  const bucketOf = (down, dist) => {
    const d = String(down || "").trim();
    const distNum = parseInt(dist, 10);
    let band = "Medium";
    if (!Number.isNaN(distNum)) {
      if (distNum <= 3) band = "Short";
      else if (distNum >= 8) band = "Long";
    } else if (typeof dist === "string") {
      const s = dist.toLowerCase();
      if (s.includes("short")) band = "Short";
      else if (s.includes("long") || s.includes("20+") || s.includes("16-20") || s.includes("11-15")) band = "Long";
    }
    if (d === "1") return "1-Any";
    if (d === "2") return `2-${band}`;
    if (d === "3") return `3-${band}`;
    return null;
  };
  const ddRows = ddBuckets.map((bucket) => {
    const matching = opp.plays.filter((p) => bucketOf(p.down, p.distance) === bucket);
    if (matching.length === 0) return null;
    const blitzes = matching.filter((p) => p.defBlitz && p.defBlitz !== "None").length;
    const blitzPct = pct(blitzes, matching.length);
    return `
      <li class="gp-tm-dd-row">
        <span class="gp-tm-dd-label">${escapeHtml(bucket)}</span>
        <span class="gp-tm-dd-count">${matching.length} snaps</span>
        <span class="gp-tm-dd-blitz ${blitzPct >= 40 ? "gp-tm-warn" : ""}">${blitzPct}% blitz</span>
      </li>`;
  }).filter(Boolean).join("");

  const html = `
    <div class="gp-tm">
      <div class="gp-tm-summary">
        <strong>${escapeHtml(opp.name || "Opponent")}</strong> — ${oppTotal} charted snap${oppTotal === 1 ? "" : "s"}
        · Plan has ${planTotal} drafted play${planTotal === 1 ? "" : "s"}
      </div>
      <p class="gp-tm-help">Compares opponent's most-shown defensive looks (top bar) vs how often your drafted plays practice that look (bottom bar). Yellow = under-prepped, red = uncovered.</p>
      <div class="gp-tm-grid">
        <section>
          <h4>🛡️ Fronts seen</h4>
          <ul class="gp-tm-list">${renderMatchRow(dFront, oFront, "defFront", "practiceFront", oppTotal, planTotal)}</ul>
        </section>
        <section>
          <h4>👁️ Coverages seen</h4>
          <ul class="gp-tm-list">${renderMatchRow(dCov, oCov, "defCoverage", "practiceCoverage", oppTotal, planTotal)}</ul>
        </section>
        <section>
          <h4>🔥 Blitz/Pressure</h4>
          <ul class="gp-tm-list">${renderMatchRow(dBlitz, oBlitz, "defBlitz", "practiceBlitz", oppTotal, planTotal)}</ul>
        </section>
        ${ddRows ? `
        <section>
          <h4>📊 Down & Distance pressure</h4>
          <ul class="gp-tm-dd">${ddRows}</ul>
        </section>` : ""}
      </div>
    </div>`.replace(/\n\s+/g, " ");
  showModal(html, { title: "🪞 Tendency Mirror", icon: "🪞" });
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
