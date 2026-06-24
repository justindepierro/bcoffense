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

function ensureTendenciesOpponent(name) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return -1;
  const storedOpponents = storageManager.get(
    STORAGE_KEYS.DEFENSIVE_TENDENCIES,
    [],
  );
  if (Array.isArray(storedOpponents)) {
    tendenciesOpponents = storedOpponents;
  }
  const existingIndex = tendenciesOpponents.findIndex(
    (opponent) =>
      String(opponent?.name || "").trim().toLowerCase() ===
      normalizedName.toLowerCase(),
  );
  if (existingIndex >= 0) return existingIndex;
  tendenciesOpponents.push({ name: normalizedName, plays: [] });
  saveTendencies();
  return tendenciesOpponents.length - 1;
}

function saveTendenciesSettings() {
  storageManager.set(STORAGE_KEYS.TENDENCIES_SETTINGS, {
    visibleColumns: tdVisibleColumns,
    rapidMode: tendenciesRapidMode,
  });
}

// ============ Autosave Draft ============

function scheduleTendenciesAutosave() {
  tendenciesAutosaveTimer = queueAutosave(
    tendenciesAutosaveTimer,
    () => {
      if (!tendenciesCurrentPlay) return;
      persistDraftData(STORAGE_KEYS.TENDENCIES_DRAFT, {
        opponentIndex: tendenciesCurrentOpponent,
        play: { ...tendenciesCurrentPlay },
        editIndex: tendenciesEditIndex,
        wizardStep: tendenciesWizardStep,
        rapidMode: tendenciesRapidMode,
      }, { timestampField: "timestamp" });
    },
    { delay: AUTOSAVE_DEBOUNCE_MS },
  );
}

async function checkTendenciesDraft() {
  const draft = storageManager.get(STORAGE_KEYS.TENDENCIES_DRAFT, null);
  if (!draft || !draft.play) return;
  if (isDraftExpired(draft)) {
    discardDraftData(STORAGE_KEYS.TENDENCIES_DRAFT);
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
    discardDraftData(STORAGE_KEYS.TENDENCIES_DRAFT);
  }
}

function clearTendenciesDraft() {
  tendenciesAutosaveTimer = discardDraftData(
    STORAGE_KEYS.TENDENCIES_DRAFT,
    tendenciesAutosaveTimer,
  );
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
  const idx = Number(origIndex);
  if (tdSelectedPlays.has(idx)) {
    tdSelectedPlays.delete(idx);
  } else {
    tdSelectedPlays.add(idx);
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
  if (tdSortColumn || Object.keys(tdFilters).length > 0 || tdSearchText) {
    showToast("⚠️ Clear filters and sort before reordering");
    tdDragIndex = null;
    return;
  }
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
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const activeOpponent =
    gw && typeof resolveGameWeekOpponent === "function"
      ? resolveGameWeekOpponent(tendenciesOpponents, gw).opponent
      : null;
  const name = await showPrompt("Rename opponent:", opp.name, {
    title: "Rename",
    icon: "✏️",
  });
  if (!name || !name.trim()) return;
  opp.name = name.trim();
  saveTendencies();
  if (activeOpponent === opp && typeof setGameWeek === "function") {
    setGameWeek(idx, gw.weekLabel || "");
  }
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
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const activeOpponent =
    gw && typeof resolveGameWeekOpponent === "function"
      ? resolveGameWeekOpponent(tendenciesOpponents, gw).opponent
      : null;
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
  if (activeOpponent && typeof setGameWeek === "function") {
    const nextActiveIndex = tendenciesOpponents.indexOf(activeOpponent);
    setGameWeek(nextActiveIndex >= 0 ? nextActiveIndex : null, gw.weekLabel || "");
  }
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


// ============ Filter Panel ============


// ============ Stats Dashboard ============

function toggleTdStats() {
  tdShowStats = !tdShowStats;
  renderOpponentDetail();
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


// ============ Export ============


// ============ Import JSON ============


// ============ Import CSV ============


// ============ Download Helper ============


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
  if (!gw || typeof resolveGameWeekOpponent !== "function") return false;
  return resolveGameWeekOpponent(tendenciesOpponents, gw).index === opponentIndex;
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

// ── Moved from utils.js ──────────────────────────
function queryTendencies(opponent, filters) {
  if (!opponent || !opponent.plays || opponent.plays.length === 0) {
    return {
      plays: [],
      topFront: [],
      topCoverage: [],
      topBlitz: [],
      topStunt: [],
      blitzRate: 0,
      summary: "No data",
    };
  }

  let matched = opponent.plays.filter((p) => {
    // Down filter
    if (filters.down && filters.down.length > 0) {
      if (!filters.down.includes(p.down)) return false;
    }
    // Distance range filter
    if (filters.distRange) {
      const dist = parseFloat(p.distance);
      if (isNaN(dist)) return false;
      if (dist < filters.distRange[0] || dist > filters.distRange[1])
        return false;
    }
    // Situation filter
    if (filters.situation && filters.situation.length > 0) {
      if (!filters.situation.includes(p.situation)) return false;
    }
    // Field position
    if (filters.fieldPos) {
      const fp = (p.fieldPosition || "").toLowerCase();
      if (fp !== filters.fieldPos) return false;
    }
    // Yard range
    if (filters.yardRange) {
      const yl = parseInt(p.yardLine, 10);
      if (isNaN(yl)) return false;
      if (yl < filters.yardRange[0] || yl > filters.yardRange[1]) return false;
    }
    // Offense formation filter (for smart suggestions)
    if (filters.offenseFormation) {
      if (
        (p.offenseFormation || "").toLowerCase() !==
        filters.offenseFormation.toLowerCase()
      )
        return false;
    }
    return true;
  });

  const total = matched.length;

  // Count distributions
  function topN(field, n) {
    const counts = {};
    matched.forEach((p) => {
      const val = p[field];
      if (val && val !== "None") counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([term, count]) => ({
        term,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        family: normalizeDefense(
          term,
          field === "defFront"
            ? "front"
            : field === "defCoverage"
              ? "coverage"
              : field === "defBlitz"
                ? "blitz"
                : "stunt",
        ),
      }));
  }

  const topFront = topN("defFront", 5);
  const topCoverage = topN("defCoverage", 5);
  const topBlitz = topN("defBlitz", 5);
  const topStunt = topN("defStunt", 5);
  const blitzCount = matched.filter(
    (p) => p.defBlitz && p.defBlitz !== "None",
  ).length;
  const blitzRate = total > 0 ? Math.round((blitzCount / total) * 100) : 0;

  // Build human-readable summary
  let summary = "";
  if (total === 0) {
    summary = "No data for this situation";
  } else {
    const parts = [];
    if (topFront.length > 0)
      parts.push(`Front: ${topFront[0].term} (${topFront[0].pct}%)`);
    if (topCoverage.length > 0)
      parts.push(`Cov: ${topCoverage[0].term} (${topCoverage[0].pct}%)`);
    if (blitzRate > 0) parts.push(`Blitz: ${blitzRate}%`);
    summary = `${total} plays — ${parts.join(" • ")}`;
  }

  return {
    plays: matched,
    topFront,
    topCoverage,
    topBlitz,
    topStunt,
    blitzRate,
    summary,
    total,
  };
}

function getTendenciesForCategory(categoryId) {
  const opp = getActiveOpponent();
  if (!opp) return null;
  const filters = SITUATION_TO_TENDENCIES[categoryId];
  if (!filters) return null;
  return queryTendencies(opp, filters);
}

function scorePlayForSituation(play, category, intel) {
  let score = 0;
  const reasons = [];
  const warnings = [];

  // 1. Preferred down match
  if (category.down && play.preferredDown) {
    const downs = play.preferredDown
      .toString()
      .split(/[,\/]/)
      .map((s) => s.trim());
    if (downs.includes(category.down)) {
      score += 30;
      reasons.push(
        `Preferred for ${category.down}${category.down === "1" ? "st" : category.down === "2" ? "nd" : category.down === "3" ? "rd" : "th"} down`,
      );
    }
  }

  // 2. Preferred distance match
  if (category.distance && play.preferredDistance) {
    const dist = play.preferredDistance.toLowerCase().trim();
    const catDist = category.distance.toLowerCase().trim();
    if (dist === catDist) {
      score += 20;
      reasons.push(`Preferred for ${catDist} distance`);
    }
  }

  // 3. Preferred situation match
  if (category.situation && play.preferredSituation) {
    const sits = play.preferredSituation
      .split(/[,\/]/)
      .map((s) => s.trim().toLowerCase());
    if (sits.includes(category.situation.toLowerCase())) {
      score += 25;
      reasons.push(`Preferred for ${category.situation}`);
    }
  }

  // 4. Preferred field position match
  if (category.position && play.preferredFieldPosition) {
    const positions = play.preferredFieldPosition
      .split(/[,\/]/)
      .map((s) => s.trim().toLowerCase());
    const catPos = category.position.toLowerCase();
    if (positions.includes(catPos)) {
      score += 15;
      reasons.push(`Preferred for ${category.position}`);
    }
  }

  // 5. Dead-vs check — penalize if dead vs opponent's common look
  if (intel && intel.total > 0 && play.deadVs) {
    // Check against top coverage
    if (intel.topCoverage.length > 0) {
      const { isDead, reasons: deadReasons } = checkDeadVs(
        play,
        intel.topCoverage[0].term,
        null,
      );
      if (isDead) {
        const penalty = intel.topCoverage[0].pct >= 30 ? -40 : -20;
        score += penalty;
        deadReasons.forEach((r) =>
          warnings.push(`⚠️ ${r} (${intel.topCoverage[0].pct}% of the time)`),
        );
      }
    }
    // Check against top front
    if (intel.topFront.length > 0) {
      const { isDead, reasons: deadReasons } = checkDeadVs(
        play,
        null,
        intel.topFront[0].term,
      );
      if (isDead) {
        const penalty = intel.topFront[0].pct >= 30 ? -30 : -15;
        score += penalty;
        deadReasons.forEach((r) =>
          warnings.push(`⚠️ ${r} (${intel.topFront[0].pct}% of the time)`),
        );
      }
    }
  }

  return { score, reasons, warnings };
}
