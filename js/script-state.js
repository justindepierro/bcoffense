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

let filtersCollapsed = false;
let scriptPlayRailCollapsed = true;
// A pinned library stays open while a coach is building a batch. By default a
// single add returns focus to the working script.
let scriptLibraryPinned = false;
let scriptToolsDrawerOpen = false;
