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
let scriptPlayRailCollapsed = false;
let scriptToolsDrawerOpen = false;
