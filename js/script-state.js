// Practice Script Builder shared runtime state

let scriptSelectedTypes = [];
let scriptSelectedSituation = [];
let scriptSelectedDown = [];
let scriptSelectedDistance = [];
let scriptSelectedHash = [];
let scriptSelectedFieldPos = [];
let scriptSelectedPersonnel = [];

let collapsedPeriods = new Set();

let selectedAvailablePlays = [];
let lastScriptTargetPeriodId = null;
let currentFilteredPlayIndices = [];
// Each library result may represent an approved personnel version of its
// canonical Playbook call. Keep that choice beside the stable source index.
let currentFilteredPlayEntries = [];

// Coach Grid library default: search and high-frequency refiners remain in
// view while deeper filter groups open only on request.
let filtersCollapsed = true;
let scriptPlayRailCollapsed = true;
// A pinned library stays open while a coach is building a batch. By default a
// single add returns focus to the working script.
let scriptLibraryPinned = false;
let scriptToolsDrawerOpen = false;

// A Script now tracks the saved library record it was loaded from. This makes
// Save deterministic after imports: it updates that record instead of relying
// on a name match (or accidentally creating a copy).
let activeScriptSaveId = null;
let activeScriptSaveTitle = "";
let activeScriptSavedAt = "";
