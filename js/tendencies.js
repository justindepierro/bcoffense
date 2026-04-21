// Defensive Tendencies — Film Charting Wizard
// Stores opponent scouting data play-by-play while watching film
// Features: search/filter, sortable columns, stats dashboard, rapid chart mode,
// undo/redo, autosave draft, bulk select, drag-drop reorder, print view,
// hover tooltip, column visibility, keyboard shortcuts, CSV import, notes

// ============ State ============
let tendenciesOpponents = []; // [{name, plays:[...]}]
let tendenciesCurrentOpponent = null; // index into array
let tendenciesCurrentPlay = null; // play being built in wizard
let tendenciesWizardStep = 0;
let tendenciesEditIndex = -1; // -1 = new play, >=0 = editing existing
let tendenciesRapidMode = false; // rapid chart = all fields on one page
let tendenciesAutosaveTimer = null;

// Filter/sort/search state
let tdFilters = {};
let tdSearchText = "";
let tdSortColumn = null;
let tdSortDirection = "asc";
let tdShowFilters = false;

// Bulk select
let tdSelectedPlays = new Set();
let tdBulkMode = false;

// Column visibility
let tdVisibleColumns = null; // null = load from storage or defaults

// Keyboard nav
let tdSelectedRow = -1;

// Drag state
let tdDragIndex = null;

// Stats dashboard toggle
let tdShowStats = false;

// Default values users can quick-pick (big buttons). Users can always type custom.
const TENDENCIES_OPTIONS = {
  quarter: ["1", "2", "3", "4", "OT"],
  down: ["1", "2", "3", "4"],
  distance: [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11-15",
    "16-20",
    "20+",
  ],
  hash: ["L", "M", "R"],
  fieldPosition: ["Own", "Opp"],
  yardLine: ["1", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50"],
  situation: [
    "Normal",
    "Red Zone",
    "Goal Line",
    "Backed Up",
    "2-Minute",
    "4-Minute",
    "3rd & Long",
    "3rd & Short",
    "2pt Conv",
  ],
  offensePlayType: [
    "Run",
    "Pass",
    "RPO",
    "Screen",
    "PA",
    "Draw",
    "QB Run",
    "Option",
    "Trick",
  ],
  offenseFormation: [
    "1x1",
    "2x1",
    "2x2",
    "3x1",
    "3x2",
    "Empty",
    "Jumbo",
    "I-Form",
    "Pistol",
    "Shotgun",
    "Under Center",
    "Trips",
    "Bunch",
    "Wing",
    "Tight",
  ],
  defFront: [
    "4-3",
    "3-4",
    "4-2-5",
    "3-3-5",
    "Nickel",
    "Dime",
    "Bear",
    "Odd",
    "Even",
    "Under",
    "Over",
    "5-2",
    "6-1",
    "46",
  ],
  defCoverage: [
    "Cover 0",
    "Cover 1",
    "Cover 2",
    "Cover 3",
    "Cover 4",
    "Cover 6",
    "Man",
    "Zone",
    "Quarters",
    "Tampa 2",
    "2-Man",
    "Robber",
  ],
  defStunt: ["None", "Twist", "Loop", "Games", "Exchange", "Pinch", "Wide"],
  defBlitz: [
    "None",
    "Zone Blitz",
    "Man Blitz",
    "Fire Zone",
    "Sim Pressure",
    "Overload",
  ],
  direction: ["Left", "Right", "Middle", "Field", "Boundary", "Weak", "Strong"],
  turnover: ["None", "Fumble", "INT", "Strip Sack", "Downs"],
  penalty: [
    "None",
    "Offsides",
    "Holding",
    "PI",
    "Facemask",
    "Roughing",
    "Illegal Contact",
    "Other",
  ],
};

// Wizard steps — each step is a screen of the charting wizard
const TENDENCIES_STEPS = [
  {
    id: "gameInfo",
    title: "🏟️ Game Info",
    icon: "🏟️",
    fields: [
      { key: "week", type: "text", label: "Week", placeholder: "e.g. 1" },
      {
        key: "game",
        type: "text",
        label: "Game",
        placeholder: "e.g. vs State",
      },
      { key: "quarter", type: "buttons", label: "Quarter", options: "quarter" },
      { key: "time", type: "text", label: "Time", placeholder: "e.g. 12:35" },
    ],
  },
  {
    id: "fieldPosition",
    title: "📍 Field Position",
    icon: "📍",
    fields: [
      { key: "down", type: "buttons", label: "Down", options: "down" },
      {
        key: "distance",
        type: "buttons",
        label: "Distance",
        options: "distance",
      },
      { key: "hash", type: "buttons", label: "Hash", options: "hash" },
      {
        key: "fieldPosition",
        type: "buttons",
        label: "Field Position",
        options: "fieldPosition",
      },
      {
        key: "yardLine",
        type: "buttons",
        label: "Yard Line",
        options: "yardLine",
      },
      {
        key: "situation",
        type: "buttons",
        label: "Situation",
        options: "situation",
      },
    ],
  },
  {
    id: "offenseInfo",
    title: "🏈 Offense Info",
    icon: "🏈",
    fields: [
      {
        key: "offensePlayType",
        type: "buttons",
        label: "Off. Play Type",
        options: "offensePlayType",
      },
      {
        key: "offenseFormation",
        type: "buttons",
        label: "Off. Formation",
        options: "offenseFormation",
      },
    ],
  },
  {
    id: "defenseInfo",
    title: "🛡️ Defense Info",
    icon: "🛡️",
    fields: [
      {
        key: "defFront",
        type: "buttons",
        label: "Def Front",
        options: "defFront",
      },
      {
        key: "defCoverage",
        type: "buttons",
        label: "Def Coverage",
        options: "defCoverage",
      },
      {
        key: "defStunt",
        type: "buttons",
        label: "Def Stunt",
        options: "defStunt",
      },
      {
        key: "defBlitz",
        type: "buttons",
        label: "Def Blitz",
        options: "defBlitz",
      },
      {
        key: "blitzer1",
        type: "text",
        label: "Blitzer 1",
        placeholder: "Position/Name",
      },
      {
        key: "blitzer2",
        type: "text",
        label: "Blitzer 2",
        placeholder: "Position/Name",
      },
      {
        key: "blitzer3",
        type: "text",
        label: "Blitzer 3",
        placeholder: "Position/Name",
      },
    ],
  },
  {
    id: "keyPlayers",
    title: "👤 Key Players",
    icon: "👤",
    fields: [
      {
        key: "tackler1",
        type: "text",
        label: "Tackler 1",
        placeholder: "Position/Name",
      },
      {
        key: "tackler2",
        type: "text",
        label: "Tackler 2",
        placeholder: "Position/Name",
      },
      {
        key: "tackler3",
        type: "text",
        label: "Tackler 3",
        placeholder: "Position/Name",
      },
      {
        key: "frontStrengthDirection",
        type: "buttons",
        label: "Front Strength Dir",
        options: "direction",
      },
      {
        key: "coverageStrengthDirection",
        type: "buttons",
        label: "Coverage Strength Dir",
        options: "direction",
      },
      {
        key: "poi1Direction",
        type: "buttons",
        label: "POI 1 Direction",
        options: "direction",
      },
      {
        key: "poi2Direction",
        type: "buttons",
        label: "POI 2 Direction",
        options: "direction",
      },
      {
        key: "poi3Direction",
        type: "buttons",
        label: "POI 3 Direction",
        options: "direction",
      },
    ],
  },
  {
    id: "extras",
    title: "📋 Extras",
    icon: "📋",
    fields: [
      {
        key: "turnover",
        type: "buttons",
        label: "Turnover",
        options: "turnover",
      },
      {
        key: "turnoverForcer",
        type: "text",
        label: "Turnover Forcer",
        placeholder: "Name",
      },
      {
        key: "turnoverPlayer",
        type: "text",
        label: "Turnover Player",
        placeholder: "Name",
      },
      {
        key: "tackleForLossPlayer",
        type: "text",
        label: "TFL Player",
        placeholder: "Name",
      },
      { key: "penalty", type: "buttons", label: "Penalty", options: "penalty" },
      {
        key: "penaltyPlayer",
        type: "text",
        label: "Penalty Player",
        placeholder: "Name",
      },
      {
        key: "notes",
        type: "textarea",
        label: "Notes",
        placeholder: "Observations, tendencies, notes…",
      },
    ],
  },
];

// All field keys in CSV column order
const TENDENCIES_CSV_HEADERS = [
  "Opponent",
  "Week",
  "Game",
  "Quarter",
  "Time",
  "Down",
  "Distance",
  "Hash",
  "Field Position",
  "Yard Line",
  "Situation",
  "Offense Play Type",
  "Offense Formation",
  "Def Front",
  "Def Coverage",
  "Def Stunt",
  "Def Blitz",
  "Blitzer 1",
  "Blitzer 2",
  "Blitzer 3",
  "Tackler 1",
  "Tackler 2",
  "Tackler 3",
  "Front Strength Direction",
  "Coverage Strength Direction",
  "Person Of Interest 1 Direction",
  "Person of Interest 2 Direction",
  "Person of Interest 3 Direction",
  "Turnover",
  "Turnover Forcer",
  "Turnover Player",
  "Tackle for Loss Player",
  "Penalty",
  "Penalty Player",
  "Notes",
];

// Map from internal keys to CSV header names
const KEY_TO_CSV = {
  week: "Week",
  game: "Game",
  quarter: "Quarter",
  time: "Time",
  down: "Down",
  distance: "Distance",
  hash: "Hash",
  fieldPosition: "Field Position",
  yardLine: "Yard Line",
  situation: "Situation",
  offensePlayType: "Offense Play Type",
  offenseFormation: "Offense Formation",
  defFront: "Def Front",
  defCoverage: "Def Coverage",
  defStunt: "Def Stunt",
  defBlitz: "Def Blitz",
  blitzer1: "Blitzer 1",
  blitzer2: "Blitzer 2",
  blitzer3: "Blitzer 3",
  tackler1: "Tackler 1",
  tackler2: "Tackler 2",
  tackler3: "Tackler 3",
  frontStrengthDirection: "Front Strength Direction",
  coverageStrengthDirection: "Coverage Strength Direction",
  poi1Direction: "Person Of Interest 1 Direction",
  poi2Direction: "Person of Interest 2 Direction",
  poi3Direction: "Person of Interest 3 Direction",
  turnover: "Turnover",
  turnoverForcer: "Turnover Forcer",
  turnoverPlayer: "Turnover Player",
  tackleForLossPlayer: "Tackle for Loss Player",
  penalty: "Penalty",
  penaltyPlayer: "Penalty Player",
  notes: "Notes",
};

// CSV header → internal key (reverse map)
const CSV_TO_KEY = {};
Object.entries(KEY_TO_CSV).forEach(([k, v]) => {
  CSV_TO_KEY[v] = k;
});

// Columns for the play log table
const TD_COLUMNS = [
  { key: "_num", label: "#", sortable: false, width: "40px" },
  { key: "quarter", label: "Qtr", sortable: true },
  { key: "_downDist", label: "Down & Dist", sortable: true, sortKey: "down" },
  { key: "hash", label: "Hash", sortable: true },
  { key: "_fieldPos", label: "Field Pos", sortable: true, sortKey: "yardLine" },
  { key: "situation", label: "Situation", sortable: true },
  { key: "offenseFormation", label: "Off Form", sortable: true },
  { key: "offensePlayType", label: "Off Type", sortable: true },
  { key: "defFront", label: "Def Front", sortable: true },
  { key: "defCoverage", label: "Def Cov", sortable: true },
  { key: "defBlitz", label: "Blitz", sortable: true },
  { key: "defStunt", label: "Stunt", sortable: true },
  { key: "notes", label: "Notes", sortable: false },
  { key: "_actions", label: "Actions", sortable: false },
];

const TD_DEFAULT_VISIBLE = [
  "_num",
  "quarter",
  "_downDist",
  "hash",
  "_fieldPos",
  "offenseFormation",
  "offensePlayType",
  "defFront",
  "defCoverage",
  "defBlitz",
  "notes",
  "_actions",
];

// Filterable fields
const TD_FILTER_FIELDS = [
  { key: "quarter", label: "Quarter", options: "quarter" },
  { key: "down", label: "Down", options: "down" },
  { key: "hash", label: "Hash", options: "hash" },
  { key: "situation", label: "Situation", options: "situation" },
  {
    key: "offensePlayType",
    label: "Off. Play Type",
    options: "offensePlayType",
  },
  {
    key: "offenseFormation",
    label: "Off. Formation",
    options: "offenseFormation",
  },
  { key: "defFront", label: "Def Front", options: "defFront" },
  { key: "defCoverage", label: "Def Coverage", options: "defCoverage" },
  { key: "defBlitz", label: "Blitz", options: "defBlitz" },
  { key: "defStunt", label: "Stunt", options: "defStunt" },
];

// ============ Persistence ============

function loadTendencies() {
  tendenciesOpponents = storageManager.get(
    STORAGE_KEYS.DEFENSIVE_TENDENCIES,
    [],
  );
  const settings = storageManager.get(STORAGE_KEYS.TENDENCIES_SETTINGS, {});
  tdVisibleColumns = settings.visibleColumns || [...TD_DEFAULT_VISIBLE];
  tendenciesRapidMode = settings.rapidMode || false;
}

function saveTendencies() {
  storageManager.set(STORAGE_KEYS.DEFENSIVE_TENDENCIES, tendenciesOpponents);
}

function saveTendenciesSettings() {
  storageManager.set(STORAGE_KEYS.TENDENCIES_SETTINGS, {
    visibleColumns: tdVisibleColumns,
    rapidMode: tendenciesRapidMode,
  });
}

// ============ Autosave Draft ============

function scheduleTendenciesAutosave() {
  if (tendenciesAutosaveTimer) clearTimeout(tendenciesAutosaveTimer);
  tendenciesAutosaveTimer = setTimeout(() => {
    if (!tendenciesCurrentPlay) return;
    const draft = {
      opponentIndex: tendenciesCurrentOpponent,
      play: { ...tendenciesCurrentPlay },
      editIndex: tendenciesEditIndex,
      wizardStep: tendenciesWizardStep,
      rapidMode: tendenciesRapidMode,
      timestamp: Date.now(),
    };
    storageManager.set(STORAGE_KEYS.TENDENCIES_DRAFT, draft);
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function checkTendenciesDraft() {
  const draft = storageManager.get(STORAGE_KEYS.TENDENCIES_DRAFT, null);
  if (!draft || !draft.play) return;
  // Only offer if < 24 hours old
  if (Date.now() - draft.timestamp > DRAFT_EXPIRY_MS) {
    storageManager.set(STORAGE_KEYS.TENDENCIES_DRAFT, null);
    return;
  }
  const filledFields = Object.values(draft.play).filter(
    (v) => v && v.trim && v.trim(),
  ).length;
  if (filledFields === 0) return;

  const restore = await showConfirm(
    `You have an unsaved play draft (${filledFields} fields filled).\n\nRestore it?`,
    {
      title: "Restore Draft",
      icon: "💾",
      confirmText: "Restore",
      cancelText: "Discard",
    },
  );
  if (restore) {
    tendenciesCurrentOpponent = draft.opponentIndex;
    tendenciesCurrentPlay = draft.play;
    tendenciesEditIndex = draft.editIndex;
    tendenciesWizardStep = draft.wizardStep;
    tendenciesRapidMode = draft.rapidMode || false;
    if (tendenciesRapidMode) {
      renderRapidChart();
    } else {
      renderWizard();
    }
    showToast("📋 Draft restored");
  } else {
    storageManager.set(STORAGE_KEYS.TENDENCIES_DRAFT, null);
  }
}

function clearTendenciesDraft() {
  storageManager.set(STORAGE_KEYS.TENDENCIES_DRAFT, null);
  if (tendenciesAutosaveTimer) clearTimeout(tendenciesAutosaveTimer);
}

// ============ Undo/Redo ============

function saveTendenciesState() {
  if (tendenciesCurrentOpponent === null) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;
  historyManager.saveState("tendencies", opp.plays);
}

function undoTendencies() {
  if (tendenciesCurrentOpponent === null) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;
  const prev = historyManager.undo("tendencies", opp.plays);
  if (prev) {
    opp.plays = prev;
    saveTendencies();
    renderOpponentDetail();
    showToast("↩️ Undo");
  }
}

function redoTendencies() {
  if (tendenciesCurrentOpponent === null) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;
  const next = historyManager.redo("tendencies", opp.plays);
  if (next) {
    opp.plays = next;
    saveTendencies();
    renderOpponentDetail();
    showToast("↪️ Redo");
  }
}

// ============ Initialization ============

function initTendencies() {
  loadTendencies();
  renderTendenciesHome();
  initTendenciesKeyboard();
}

function initTendenciesKeyboard() {
  document.removeEventListener("keydown", handleTendenciesKeydown);
  document.addEventListener("keydown", handleTendenciesKeydown);
}

function handleTendenciesKeydown(e) {
  // Only handle when tendencies tab is active
  const panel = document.getElementById("tendencies");
  if (!panel || !panel.classList.contains("active")) return;
  // Don't handle if typing in an input
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  // Don't handle if modal is open
  if (document.querySelector(".custom-modal-overlay")) return;

  const isWizard = tendenciesCurrentPlay !== null;
  const isDetail = tendenciesCurrentOpponent !== null && !isWizard;

  if (isDetail) {
    const opp = tendenciesOpponents[tendenciesCurrentOpponent];
    if (!opp) return;
    const filtered = getFilteredPlays();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        tdSelectedRow = Math.min(tdSelectedRow + 1, filtered.length - 1);
        highlightSelectedRow();
        break;
      case "ArrowUp":
        e.preventDefault();
        tdSelectedRow = Math.max(tdSelectedRow - 1, 0);
        highlightSelectedRow();
        break;
      case "Enter":
        if (tdSelectedRow >= 0 && tdSelectedRow < filtered.length) {
          e.preventDefault();
          editTendenciesPlay(filtered[tdSelectedRow]._origIndex);
        }
        break;
      case "Delete":
      case "Backspace":
        if (tdSelectedRow >= 0 && tdSelectedRow < filtered.length) {
          e.preventDefault();
          deleteTendenciesPlay(filtered[tdSelectedRow]._origIndex);
        }
        break;
      case "n":
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          startNewPlay();
        }
        break;
      case "f":
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          toggleTdFilters();
        }
        break;
      case "s":
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          toggleTdStats();
        }
        break;
      case "z":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if (e.shiftKey) redoTendencies();
          else undoTendencies();
        }
        break;
      case "Escape":
        if (tdBulkMode) {
          e.preventDefault();
          exitBulkMode();
        }
        break;
    }
  }

  if (isWizard && !tendenciesRapidMode) {
    if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) {
      const tag2 = document.activeElement?.tagName;
      if (tag2 !== "INPUT" && tag2 !== "TEXTAREA") {
        e.preventDefault();
        wizardNext();
      }
    }
    if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) {
      const tag2 = document.activeElement?.tagName;
      if (tag2 !== "INPUT" && tag2 !== "TEXTAREA") {
        e.preventDefault();
        wizardPrev();
      }
    }
  }
}

function highlightSelectedRow() {
  document.querySelectorAll(".td-table tbody tr").forEach((tr, i) => {
    tr.classList.toggle("td-row-selected", i === tdSelectedRow);
    if (i === tdSelectedRow) tr.scrollIntoView({ block: "nearest" });
  });
}

// ============ Filtering & Sorting ============

function getFilteredPlays() {
  if (tendenciesCurrentOpponent === null) return [];
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return [];

  let plays = opp.plays.map((p, i) => ({ ...p, _origIndex: i }));

  // Apply search
  if (tdSearchText) {
    const search = tdSearchText.toLowerCase();
    plays = plays.filter((p) => {
      return Object.keys(KEY_TO_CSV).some((k) => {
        const val = p[k];
        return val && val.toLowerCase().includes(search);
      });
    });
  }

  // Apply filters
  Object.entries(tdFilters).forEach(([key, values]) => {
    if (values && values.length > 0) {
      plays = plays.filter((p) => values.includes(p[key]));
    }
  });

  // Apply sort
  if (tdSortColumn) {
    const sortKey =
      TD_COLUMNS.find((c) => c.key === tdSortColumn)?.sortKey || tdSortColumn;
    plays.sort((a, b) => {
      let va = a[sortKey] || "";
      let vb = b[sortKey] || "";
      // Try numeric sort first
      const na = parseFloat(va),
        nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) {
        return tdSortDirection === "asc" ? na - nb : nb - na;
      }
      return tdSortDirection === "asc"
        ? va.localeCompare(vb)
        : vb.localeCompare(va);
    });
  }

  return plays;
}

function activeFilterCount() {
  let count = 0;
  Object.values(tdFilters).forEach((v) => {
    if (v && v.length > 0) count++;
  });
  if (tdSearchText) count++;
  return count;
}

function toggleTdFilters() {
  tdShowFilters = !tdShowFilters;
  renderOpponentDetail();
}

const debouncedRenderPlayLog = debounce(renderPlayLog, 150);

function setTdSearch(val) {
  tdSearchText = val;
  tdSelectedRow = -1;
  const clearBtn = document.querySelector("#tdSearchInput + .search-clear-btn");
  if (clearBtn) clearBtn.style.display = val ? "" : "none";
  debouncedRenderPlayLog();
}

function toggleTdFilter(key, value) {
  if (!tdFilters[key]) tdFilters[key] = [];
  const idx = tdFilters[key].indexOf(value);
  if (idx >= 0) {
    tdFilters[key].splice(idx, 1);
    if (tdFilters[key].length === 0) delete tdFilters[key];
  } else {
    tdFilters[key].push(value);
  }
  tdSelectedRow = -1;
  renderPlayLog();
}

function clearTdFilters() {
  tdFilters = {};
  tdSearchText = "";
  tdSelectedRow = -1;
  tdSortColumn = null;
  tdSortDirection = "asc";
  renderOpponentDetail();
}

function sortTdColumn(colKey) {
  const col = TD_COLUMNS.find((c) => c.key === colKey);
  if (!col || !col.sortable) return;
  if (tdSortColumn === colKey) {
    tdSortDirection = tdSortDirection === "asc" ? "desc" : "asc";
  } else {
    tdSortColumn = colKey;
    tdSortDirection = "asc";
  }
  tdSelectedRow = -1;
  renderPlayLog();
}

// ============ Column Visibility ============

function toggleTdColumn(colKey) {
  const idx = tdVisibleColumns.indexOf(colKey);
  if (idx >= 0) {
    // Don't allow hiding # or Actions
    if (colKey === "_num" || colKey === "_actions") return;
    tdVisibleColumns.splice(idx, 1);
  } else {
    tdVisibleColumns.push(colKey);
  }
  saveTendenciesSettings();
  renderPlayLog();
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

// ============ Bulk Select ============

function enterBulkMode() {
  tdBulkMode = true;
  tdSelectedPlays.clear();
  renderPlayLog();
}

function exitBulkMode() {
  tdBulkMode = false;
  tdSelectedPlays.clear();
  renderPlayLog();
}

function tdToggleBulkSelect(origIndex) {
  if (tdSelectedPlays.has(origIndex)) {
    tdSelectedPlays.delete(origIndex);
  } else {
    tdSelectedPlays.add(origIndex);
  }
  renderPlayLog();
}

function selectAllVisible() {
  const filtered = getFilteredPlays();
  filtered.forEach((p) => tdSelectedPlays.add(p._origIndex));
  renderPlayLog();
}

function deselectAllBulk() {
  tdSelectedPlays.clear();
  renderPlayLog();
}

async function bulkDeletePlays() {
  if (tdSelectedPlays.size === 0) return;
  const ok = await showConfirm(
    `Delete ${tdSelectedPlays.size} selected play(s)? This cannot be undone.`,
    {
      title: "Bulk Delete",
      icon: "🗑️",
      confirmText: "Delete All",
      danger: true,
    },
  );
  if (!ok) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;
  saveTendenciesState();
  // Delete in reverse order to preserve indices
  const indices = [...tdSelectedPlays].sort((a, b) => b - a);
  indices.forEach((i) => opp.plays.splice(i, 1));
  saveTendencies();
  tdSelectedPlays.clear();
  tdBulkMode = false;
  renderOpponentDetail();
  showToast(`🗑️ Deleted ${indices.length} play(s)`);
}

async function bulkEditField() {
  if (tdSelectedPlays.size === 0) return;
  // Pick which field to edit
  const fieldOptions = TD_FILTER_FIELDS.map((f) => f.label);
  const fieldChoice = await showListPicker(
    "Which field to bulk edit?",
    fieldOptions,
    { title: "Bulk Edit Field", icon: "✏️" },
  );
  if (!fieldChoice) return;
  const fieldDef = TD_FILTER_FIELDS.find((f) => f.label === fieldChoice);
  if (!fieldDef) return;

  // Pick the value
  const valueOptions = TENDENCIES_OPTIONS[fieldDef.options] || [];
  const value = await showListPicker(
    `Set ${fieldDef.label} to:`,
    valueOptions,
    { title: "Bulk Edit", icon: "✏️" },
  );
  if (!value) return;

  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;
  saveTendenciesState();
  tdSelectedPlays.forEach((i) => {
    if (opp.plays[i]) opp.plays[i][fieldDef.key] = value;
  });
  saveTendencies();
  const count = tdSelectedPlays.size;
  tdSelectedPlays.clear();
  tdBulkMode = false;
  renderOpponentDetail();
  showToast(`✏️ Updated ${fieldDef.label} on ${count} play(s)`);
}

// ============ Drag & Drop Reorder ============

function tdDragStart(e, idx) {
  tdDragIndex = idx;
  e.dataTransfer.effectAllowed = "move";
  e.target.closest("tr").classList.add("td-dragging");
}

function tdDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document
    .querySelectorAll(".td-table tbody tr")
    .forEach((tr) => tr.classList.remove("td-drag-over"));
  e.target.closest("tr")?.classList.add("td-drag-over");
}

function tdDrop(e, idx) {
  e.preventDefault();
  document.querySelectorAll(".td-table tbody tr").forEach((tr) => {
    tr.classList.remove("td-drag-over");
    tr.classList.remove("td-dragging");
  });
  if (tdDragIndex === null || tdDragIndex === idx) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;
  saveTendenciesState();
  const [moved] = opp.plays.splice(tdDragIndex, 1);
  opp.plays.splice(idx, 0, moved);
  saveTendencies();
  tdDragIndex = null;
  renderPlayLog();
  showToast("↕️ Play reordered");
}

function tdDragEnd(e) {
  document.querySelectorAll(".td-table tbody tr").forEach((tr) => {
    tr.classList.remove("td-drag-over");
    tr.classList.remove("td-dragging");
  });
  tdDragIndex = null;
}

// ============ Home View — Opponent List ============

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
        <h2>🎯 Defensive Tendencies</h2>
        <p class="td-subtitle">Chart defensive plays while watching film. Build opponent scouting reports and export for analysis.</p>
      </div>
      <div class="td-opponent-section">
        <div class="td-section-header">
          <h3>📋 Opponents</h3>
          <button class="btn btn-primary" data-action="addTendenciesOpponent">＋ New Opponent</button>
        </div>
        ${
          tendenciesOpponents.length === 0
            ? '<div class="empty-state empty-state--bordered" style="margin-top:8px"><span class="empty-state__icon">🏈</span><p class="empty-state__text">No opponents yet. Add one to start charting!</p></div>'
            : `<div class="td-opponent-list">${opponentList}</div>`
        }
      </div>
      ${
        tendenciesOpponents.length > 0
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

// escapeHTML is now defined in utils.js

// ============ Opponent CRUD ============

async function addTendenciesOpponent() {
  const name = await showPrompt("Enter opponent name:", "", {
    title: "New Opponent",
    icon: "🏈",
  });
  if (!name || !name.trim()) return;
  tendenciesOpponents.push({ name: name.trim(), plays: [] });
  saveTendencies();
  renderTendenciesHome();
}

async function renameTendenciesOpponent(idx) {
  const opp = tendenciesOpponents[idx];
  if (!opp) return;
  const name = await showPrompt("Rename opponent:", opp.name, {
    title: "Rename",
    icon: "✏️",
  });
  if (!name || !name.trim()) return;
  opp.name = name.trim();
  saveTendencies();
  renderTendenciesHome();
}

async function deleteTendenciesOpponent(idx) {
  const opp = tendenciesOpponents[idx];
  if (!opp) return;
  const ok = await showConfirm(
    `Delete "${opp.name}" and all ${opp.plays.length} play(s)? This cannot be undone.`,
    {
      title: "Delete Opponent",
      icon: "🗑️",
      confirmText: "Delete",
      danger: true,
    },
  );
  if (!ok) return;
  tendenciesOpponents.splice(idx, 1);
  if (tendenciesCurrentOpponent === idx) {
    tendenciesCurrentOpponent = null;
  } else if (
    tendenciesCurrentOpponent !== null &&
    tendenciesCurrentOpponent > idx
  ) {
    tendenciesCurrentOpponent--;
  }
  saveTendencies();
  renderTendenciesHome();
}

// ============ Opponent Detail View ============

function selectTendenciesOpponent(idx) {
  tendenciesCurrentOpponent = idx;
  tendenciesEditIndex = -1;
  tdFilters = {};
  tdSearchText = "";
  tdSortColumn = null;
  tdSortDirection = "asc";
  tdSelectedRow = -1;
  tdSelectedPlays.clear();
  tdBulkMode = false;
  tdShowStats = false;
  tdShowFilters = false;
  historyManager.clear("tendencies");
  renderOpponentDetail();
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
        ${
          totalPlays > 0
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
            <button class="search-clear-btn" data-action="clearTdSearch" style="${tdSearchText ? "" : "display:none"}">✕</button>
          </div>
          <button class="btn btn-sm ${tdShowFilters ? "btn-primary" : ""}" data-action="toggleTdFilters">
            🔽 Filters${activeFilters > 0 ? ` <span class="td-filter-badge">${activeFilters}</span>` : ""}
          </button>
          <button class="btn btn-sm ${tdShowStats ? "btn-primary" : ""}" data-action="toggleTdStats">📊 Stats</button>
          ${
            !tdBulkMode
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
      <div id="tdColumnPanel" style="display:none">${renderColumnToggle()}</div>

      <!-- Stats dashboard -->
      ${tdShowStats ? renderStatsDashboard(opp) : ""}

      <!-- Bulk action bar -->
      ${
        tdBulkMode && tdSelectedPlays.size > 0
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
      return '<div class="empty-state empty-state--bordered" style="margin-top:8px"><span class="empty-state__icon">🔍</span><p class="empty-state__text">No plays match your filters. <button class="btn-link" data-action="clearTdFilters">Clear filters</button></p></div>';
    }
    return '<div class="empty-state empty-state--bordered" style="margin-top:8px"><span class="empty-state__icon">📹</span><p class="empty-state__text">No plays charted yet. Hit <strong>＋ New Play</strong> or press <strong>N</strong> to start!</p></div>';
  }

  const visibleCols = TD_COLUMNS.filter((c) =>
    tdVisibleColumns.includes(c.key),
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
        ${
          tdBulkMode
            ? ""
            : `
          <button class="btn btn-sm" data-action="editTendenciesPlay" data-idx="${play._origIndex}" title="Edit">✏️</button>
          <button class="btn btn-sm" data-action="duplicateTendenciesPlay" data-idx="${play._origIndex}" title="Duplicate">⧉</button>
          <button class="btn btn-sm btn-danger" data-action="deleteTendenciesPlay" data-idx="${play._origIndex}" title="Delete">✕</button>
        `
        }
      </td>`;
    default:
      return `<td>${escapeHtml(play[col.key] || "—")}</td>`;
  }
}

// ============ Filter Panel ============

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

  return `<div class="td-filter-panel">
    <div class="td-filter-panel-header">
      <span>🔽 Filters</span>
      ${activeFilterCount() > 0 ? `<button class="btn btn-sm" data-action="clearTdFilters">Clear All</button>` : ""}
    </div>
    ${sections}
  </div>`;
}

// ============ Stats Dashboard ============

function toggleTdStats() {
  tdShowStats = !tdShowStats;
  renderOpponentDetail();
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
        <div class="td-dist-bar-bg"><div class="td-dist-bar-fill ${color}" style="width:${pct}%"></div></div>
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

// ============ Hover Tooltip ============

function showPlayTooltip(e, origIdx) {
  if (tdBulkMode) return;
  hidePlayTooltip();
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp || !opp.plays[origIdx]) return;
  const play = opp.plays[origIdx];

  const fields = Object.entries(KEY_TO_CSV)
    .map(([k, label]) => {
      const val = play[k];
      if (!val) return null;
      return `<div class="td-tip-row"><span class="td-tip-label">${label}</span><span class="td-tip-val">${escapeHtml(val)}</span></div>`;
    })
    .filter(Boolean)
    .join("");

  if (!fields) return;

  const tip = document.createElement("div");
  tip.className = "td-tooltip";
  tip.id = "tdPlayTooltip";
  tip.innerHTML = `<div class="td-tip-title">Play #${origIdx + 1}</div>${fields}`;
  document.body.appendChild(tip);

  // Position near the row
  const rect = e.target.closest("tr").getBoundingClientRect();
  tip.style.top = rect.bottom + 4 + "px";
  tip.style.left = Math.min(rect.left, window.innerWidth - 320) + "px";
  setTimeout(() => tip.classList.add("td-tip-visible"), 10);
}

function hidePlayTooltip() {
  const tip = document.getElementById("tdPlayTooltip");
  if (tip) tip.remove();
}

// ============ Column Panel Toggle ============

function toggleColumnPanel() {
  const panel = document.getElementById("tdColumnPanel");
  if (!panel) return;
  panel.classList.toggle("hidden");
}

// ============ Navigation ============

function tendenciesGoHome() {
  tendenciesCurrentOpponent = null;
  tendenciesCurrentPlay = null;
  tendenciesWizardStep = 0;
  tendenciesEditIndex = -1;
  tdSelectedRow = -1;
  renderTendenciesHome();
}

// ============ Play CRUD ============

function createEmptyPlay() {
  const play = {};
  Object.keys(KEY_TO_CSV).forEach((k) => (play[k] = ""));
  return play;
}

function startNewPlay() {
  tendenciesEditIndex = -1;
  tendenciesCurrentPlay = createEmptyPlay();

  // Carry forward game-level info from last play
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (opp && opp.plays.length > 0) {
    const last = opp.plays[opp.plays.length - 1];
    tendenciesCurrentPlay.week = last.week || "";
    tendenciesCurrentPlay.game = last.game || "";
    tendenciesCurrentPlay.quarter = last.quarter || "";
  }

  tendenciesWizardStep = 0;
  if (tendenciesRapidMode) {
    renderRapidChart();
  } else {
    renderWizard();
  }
}

function editTendenciesPlay(idx) {
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp || !opp.plays[idx]) return;
  tendenciesEditIndex = idx;
  tendenciesCurrentPlay = { ...opp.plays[idx] };
  tendenciesWizardStep = 0;
  if (tendenciesRapidMode) {
    renderRapidChart();
  } else {
    renderWizard();
  }
}

function duplicateTendenciesPlay(idx) {
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp || !opp.plays[idx]) return;
  saveTendenciesState();
  const copy = { ...opp.plays[idx] };
  opp.plays.splice(idx + 1, 0, copy);
  saveTendencies();
  renderOpponentDetail();
  showToast("⧉ Play duplicated");
}

async function deleteTendenciesPlay(idx) {
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;
  const ok = await showConfirm(`Delete play #${idx + 1}?`, {
    title: "Delete Play",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  saveTendenciesState();
  opp.plays.splice(idx, 1);
  saveTendencies();
  renderOpponentDetail();
}

// ============ Rapid Chart Mode ============

function toggleRapidMode() {
  tendenciesRapidMode = !tendenciesRapidMode;
  saveTendenciesSettings();
  renderOpponentDetail();
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

// ============ Wizard ============

// ── Keyboard shortcuts for wizard (number keys, Enter, Backspace) ──
let _wizardKeyActive = false;
function _wizardKeyHandler(e) {
  // Don't intercept when typing in inputs/textareas
  if (e.target.matches("input, textarea, select")) return;

  // Number keys 1-9 → click corresponding button
  if (e.key >= "1" && e.key <= "9") {
    const allBtns = document.querySelectorAll(".td-option-btn");
    const idx = parseInt(e.key, 10) - 1;
    if (allBtns[idx]) {
      allBtns[idx].click();
      e.preventDefault();
    }
    return;
  }
  // Enter → advance to next step / save
  if (e.key === "Enter") {
    e.preventDefault();
    const saveBtn = document.querySelector(".td-save-btn");
    if (saveBtn) {
      saveBtn.click();
    } else {
      wizardNext();
    }
    return;
  }
  // Backspace → go back
  if (e.key === "Backspace") {
    e.preventDefault();
    wizardPrev();
  }
}

function _enableWizardKeys() {
  if (_wizardKeyActive) return;
  document.addEventListener("keydown", _wizardKeyHandler);
  _wizardKeyActive = true;
}

function _disableWizardKeys() {
  document.removeEventListener("keydown", _wizardKeyHandler);
  _wizardKeyActive = false;
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
        ${
          isLast
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

function setWizardField(key, value, btnEl) {
  if (!tendenciesCurrentPlay) return;
  if (tendenciesCurrentPlay[key] === value) {
    tendenciesCurrentPlay[key] = "";
  } else {
    tendenciesCurrentPlay[key] = value;
  }
  if (tendenciesRapidMode) renderRapidChart();
  else renderWizard();
}

function setWizardFieldFromInput(key) {
  const input = document.getElementById("custom_" + key);
  if (!input || !tendenciesCurrentPlay) return;
  tendenciesCurrentPlay[key] = input.value.trim();
  if (tendenciesRapidMode) renderRapidChart();
  else renderWizard();
}

function setWizardFieldDirect(key, value) {
  if (!tendenciesCurrentPlay) return;
  tendenciesCurrentPlay[key] = value;
  scheduleTendenciesAutosave();
}

function clearWizardField(key) {
  if (!tendenciesCurrentPlay) return;
  tendenciesCurrentPlay[key] = "";
  if (tendenciesRapidMode) renderRapidChart();
  else renderWizard();
}

function clearButtonSelection(key) {
  const grid = document
    .querySelector(`#custom_${key}`)
    ?.closest(".td-field-group")
    ?.querySelector(".td-option-grid");
  if (grid) {
    grid
      .querySelectorAll(".td-option-btn.selected")
      .forEach((b) => b.classList.remove("selected"));
  }
}

function goToWizardStep(idx) {
  if (idx >= 0 && idx < TENDENCIES_STEPS.length) {
    tendenciesWizardStep = idx;
    renderWizard();
  }
}

function wizardNext() {
  if (tendenciesWizardStep < TENDENCIES_STEPS.length - 1) {
    tendenciesWizardStep++;
    renderWizard();
  }
}

function wizardPrev() {
  if (tendenciesWizardStep > 0) {
    tendenciesWizardStep--;
    renderWizard();
  }
}

function skipStep() {
  const step = TENDENCIES_STEPS[tendenciesWizardStep];
  step.fields.forEach((f) => {
    if (tendenciesCurrentPlay) tendenciesCurrentPlay[f.key] = "";
  });
  if (tendenciesWizardStep < TENDENCIES_STEPS.length - 1) {
    tendenciesWizardStep++;
    renderWizard();
  } else {
    saveWizardPlay();
  }
}

function cancelWizard() {
  _disableWizardKeys();
  tendenciesCurrentPlay = null;
  tendenciesEditIndex = -1;
  clearTendenciesDraft();
  renderOpponentDetail();
}

async function saveWizardPlay() {
  if (!tendenciesCurrentPlay || tendenciesCurrentOpponent === null) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp) return;

  _disableWizardKeys();
  saveTendenciesState();

  if (tendenciesEditIndex >= 0) {
    opp.plays[tendenciesEditIndex] = { ...tendenciesCurrentPlay };
  } else {
    opp.plays.push({ ...tendenciesCurrentPlay });
  }

  saveTendencies();
  clearTendenciesDraft();
  tendenciesCurrentPlay = null;
  tendenciesEditIndex = -1;

  const addMore = await showConfirm("Play saved! Add another play?", {
    title: "✅ Play Saved",
    icon: "🏈",
    confirmText: "Add Another",
    cancelText: "Done",
  });
  if (addMore) {
    startNewPlay();
  } else {
    renderOpponentDetail();
  }
}

// ============ Print View ============

function printTendencies() {
  if (tendenciesCurrentOpponent === null) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp || opp.plays.length === 0) {
    showModal("No plays to print.", { title: "Print", icon: "🖨️" });
    return;
  }

  try {
    showToast("🖨️ Preparing tendencies…", 2500);

    const container = document.getElementById("tendenciesPrint");
    const content = document.getElementById("tendenciesPrintContent");

    const total = opp.plays.length;
    const runP = opp.plays.filter((p) =>
      ["Run", "Draw", "QB Run", "Option"].includes(p.offensePlayType),
    ).length;
    const passP = opp.plays.filter((p) =>
      ["Pass", "Screen", "PA"].includes(p.offensePlayType),
    ).length;
    const blitzP = opp.plays.filter(
      (p) => p.defBlitz && p.defBlitz !== "None",
    ).length;

    const frontDist = {},
      covDist = {};
    opp.plays.forEach((p) => {
      if (p.defFront) frontDist[p.defFront] = (frontDist[p.defFront] || 0) + 1;
      if (p.defCoverage)
        covDist[p.defCoverage] = (covDist[p.defCoverage] || 0) + 1;
    });

    const topFronts = Object.entries(frontDist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${v} (${Math.round((v / total) * 100)}%)`)
      .join(", ");
    const topCovs = Object.entries(covDist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${v} (${Math.round((v / total) * 100)}%)`)
      .join(", ");

    const filtered = getFilteredPlays();
    const rows = filtered
      .map(
        (p, i) => `
      <tr>
        <td>${i + 1}</td><td>${escapeHtml(p.quarter || "")}</td>
        <td>${escapeHtml(p.down || "")}${p.distance ? "&amp;" + escapeHtml(p.distance) : ""}</td>
        <td>${escapeHtml(p.hash || "")}</td>
        <td>${escapeHtml((p.fieldPosition || "") + " " + (p.yardLine || ""))}</td>
        <td>${escapeHtml(p.situation || "")}</td><td>${escapeHtml(p.offenseFormation || "")}</td>
        <td>${escapeHtml(p.offensePlayType || "")}</td>
        <td><strong>${escapeHtml(p.defFront || "")}</strong></td>
        <td><strong>${escapeHtml(p.defCoverage || "")}</strong></td>
        <td>${p.defBlitz && p.defBlitz !== "None" ? escapeHtml(p.defBlitz) : ""}</td>
        <td>${p.defStunt && p.defStunt !== "None" ? escapeHtml(p.defStunt) : ""}</td>
        <td class="td-print-notes">${escapeHtml(p.notes || "")}</td>
      </tr>
    `,
      )
      .join("");

    content.innerHTML = `
      <h1 class="td-print-title">🎯 ${escapeHtml(opp.name)} — Defensive Tendencies</h1>
      <div class="td-print-stats">
        <span>Plays: <strong>${total}</strong></span>
        <span>Run: <strong>${runP}</strong> (${total > 0 ? Math.round((runP / total) * 100) : 0}%)</span>
        <span>Pass: <strong>${passP}</strong> (${total > 0 ? Math.round((passP / total) * 100) : 0}%)</span>
        <span>Blitz: <strong>${blitzP}</strong> (${total > 0 ? Math.round((blitzP / total) * 100) : 0}%)</span>
      </div>
      <div class="td-print-dist"><strong>Top Fronts:</strong> ${topFronts}</div>
      <div class="td-print-dist"><strong>Top Coverages:</strong> ${topCovs}</div>
      <table class="td-print-table">
        <thead><tr><th>#</th><th>Qtr</th><th>D&amp;D</th><th>Hash</th><th>FP</th><th>Sit</th><th>Form</th><th>Type</th><th>Front</th><th>Cov</th><th>Blitz</th><th>Stunt</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    container.classList.remove("hidden");
    document.body.dataset.printMode = "tendencies";

    setupPrintPageStyle(
      "@media print { @page { size: letter landscape; margin: 0.3in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Tendencies", opp.name);
        window.print();
        restoreTitle();
      } finally {
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 100);
  } catch (err) {
    console.error("printTendencies error:", err);
    document.getElementById("tendenciesPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing tendencies.", {
      duration: 4000,
      type: "error",
    });
  }
}

// ============ Export ============

function playToCSVRow(opponentName, play) {
  const values = TENDENCIES_CSV_HEADERS.map((header) => {
    if (header === "Opponent") return opponentName;
    const key = Object.entries(KEY_TO_CSV).find(([, v]) => v === header)?.[0];
    const val = key ? play[key] || "" : "";
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  });
  return values.join(",");
}

async function exportTendenciesCSV() {
  if (tendenciesOpponents.length === 0) {
    await showModal("No data to export.", { title: "Export", icon: "📄" });
    return;
  }
  let csv = TENDENCIES_CSV_HEADERS.join(",") + "\n";
  tendenciesOpponents.forEach((opp) => {
    opp.plays.forEach((play) => {
      csv += playToCSVRow(opp.name, play) + "\n";
    });
  });
  downloadFile(csv, "defensive_tendencies.csv", "text/csv");
  showToast("📄 CSV exported");
}

async function exportSingleOpponentCSV(idx) {
  const opp = tendenciesOpponents[idx];
  if (!opp || opp.plays.length === 0) {
    await showModal("No plays to export.", { title: "Export", icon: "📄" });
    return;
  }
  let csv = TENDENCIES_CSV_HEADERS.join(",") + "\n";
  opp.plays.forEach((play) => {
    csv += playToCSVRow(opp.name, play) + "\n";
  });
  const safeName = opp.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  downloadFile(csv, `tendencies_${safeName}.csv`, "text/csv");
  showToast("📄 CSV exported");
}

async function exportTendenciesJSON() {
  if (tendenciesOpponents.length === 0) {
    await showModal("No data to export.", { title: "Export", icon: "💾" });
    return;
  }
  const data = JSON.stringify(tendenciesOpponents, null, 2);
  downloadFile(data, "defensive_tendencies.json", "application/json");
  showToast("💾 JSON exported");
}

// ============ Import JSON ============

function importTendenciesJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = safeJSONParse(ev.target.result, null);
        if (!data || !Array.isArray(data)) throw new Error("Invalid format");
        data.forEach((opp) => {
          if (!opp.name || !Array.isArray(opp.plays))
            throw new Error("Invalid opponent structure");
        });
        const mode = await showConfirm(
          `Import ${data.length} opponent(s)?\n\nThis will merge with your existing data.`,
          { title: "Import", icon: "📥", confirmText: "Import" },
        );
        if (!mode) return;
        data.forEach((imported) => {
          const existing = tendenciesOpponents.find(
            (o) => o.name.toLowerCase() === imported.name.toLowerCase(),
          );
          if (existing) {
            existing.plays.push(...imported.plays);
          } else {
            tendenciesOpponents.push(imported);
          }
        });
        saveTendencies();
        renderTendenciesHome();
        showToast("📥 Import complete!");
      } catch (err) {
        await showModal("Error importing file: " + err.message, {
          title: "Import Error",
          icon: "❌",
        });
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ============ Import CSV ============

function importTendenciesCSV() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.trim().split("\n");
        if (lines.length < 2)
          throw new Error(
            "CSV must have a header row and at least one data row",
          );

        const headers = parseCSVLine(lines[0]);
        const oppIdx = headers.findIndex(
          (h) => h.toLowerCase().trim() === "opponent",
        );

        const plays = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length === 0) continue;
          const play = createEmptyPlay();
          headers.forEach((header, j) => {
            const trimH = header.trim();
            const key = CSV_TO_KEY[trimH];
            if (key && values[j] !== undefined) {
              play[key] = values[j].trim();
            }
          });
          const oppName =
            oppIdx >= 0 ? (values[oppIdx] || "").trim() : "Imported";
          plays.push({ oppName, play });
        }

        if (plays.length === 0) throw new Error("No valid rows found");

        const grouped = {};
        plays.forEach(({ oppName, play }) => {
          if (!grouped[oppName]) grouped[oppName] = [];
          grouped[oppName].push(play);
        });

        const oppCount = Object.keys(grouped).length;
        const ok = await showConfirm(
          `Import ${plays.length} play(s) across ${oppCount} opponent(s)?\n\nThis will merge with existing data.`,
          { title: "CSV Import", icon: "📥", confirmText: "Import" },
        );
        if (!ok) return;

        Object.entries(grouped).forEach(([name, oppPlays]) => {
          const existing = tendenciesOpponents.find(
            (o) => o.name.toLowerCase() === name.toLowerCase(),
          );
          if (existing) {
            existing.plays.push(...oppPlays);
          } else {
            tendenciesOpponents.push({ name, plays: oppPlays });
          }
        });

        saveTendencies();
        renderTendenciesHome();
        showToast(`📥 Imported ${plays.length} plays`);
      } catch (err) {
        await showModal("Error importing CSV: " + err.message, {
          title: "Import Error",
          icon: "❌",
        });
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        values.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  values.push(current);
  return values;
}

// ============ Download Helper ============

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ Game Week Integration ============

// ============ Delegation Helper Functions ============

/** Clear the search text and re-render */
function clearTdSearch() {
  tdSearchText = "";
  renderOpponentDetail();
}

/** Select-all checkbox toggle (called with no args from data-onchange) */
function tdSelectAllToggle() {
  const cb = document.querySelector(".td-table thead input[type='checkbox']");
  if (cb && cb.checked) selectAllVisible();
  else deselectAllBulk();
}

// ============ Container-Scoped Delegation ============

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("tendenciesContent");
  if (!container) return;

  // ── Drag delegation for play log rows ──
  container.addEventListener("dragstart", (e) => {
    const row = e.target.closest("tr[data-drag='tdPlayRow']");
    if (row) tdDragStart(e, parseInt(row.dataset.orig, 10));
  });
  container.addEventListener("dragover", (e) => {
    const row = e.target.closest("tr[data-drag='tdPlayRow']");
    if (row) tdDragOver(e, parseInt(row.dataset.orig, 10));
  });
  container.addEventListener("drop", (e) => {
    const row = e.target.closest("tr[data-drag='tdPlayRow']");
    if (row) tdDrop(e, parseInt(row.dataset.orig, 10));
  });
  container.addEventListener("dragend", (e) => {
    const row = e.target.closest("tr[data-drag='tdPlayRow']");
    if (row) tdDragEnd(e);
  });

  // ── Mouse delegation for play tooltips ──
  container.addEventListener(
    "mouseenter",
    (e) => {
      const row = e.target.closest("tr[data-orig]");
      if (row && typeof showPlayTooltip === "function") {
        showPlayTooltip(e, parseInt(row.dataset.orig, 10));
      }
    },
    true,
  );
  container.addEventListener(
    "mouseleave",
    (e) => {
      const row = e.target.closest("tr[data-orig]");
      if (row && typeof hidePlayTooltip === "function") {
        hidePlayTooltip();
      }
    },
    true,
  );

  // ── Keydown delegation for wizard inputs ──
  container.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    // Custom input → set the field value
    const customInput = e.target.closest(".td-custom-input");
    if (customInput && customInput.dataset.wizardKey) {
      setWizardFieldFromInput(customInput.dataset.wizardKey);
      return;
    }
    // Text input → advance wizard
    const textInput = e.target.closest(".td-text-input");
    if (textInput) {
      wizardNext();
      return;
    }
  });
});

/**
 * Check if a given opponent index is the active game week opponent
 */
function isActiveGameWeekOpponent(opponentIndex) {
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  return gw && gw.opponentIndex === opponentIndex;
}

/**
 * Set the given opponent as the active game week opponent from within the tendencies tab
 */
function setAsActiveOpponent(opponentIndex) {
  if (typeof setGameWeek !== "function") return;
  const opp = tendenciesOpponents[opponentIndex];
  if (!opp) return;
  const gw = typeof getGameWeek === "function" ? getGameWeek() : {};
  setGameWeek(opponentIndex, gw.weekLabel || "");
  showToast(`🏈 ${opp.name} set as active opponent`);
  renderOpponentDetail(); // Re-render to update button state
}
