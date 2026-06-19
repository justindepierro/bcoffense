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

const GP_PASSING_PLAY_TYPES = [
  "Pass",
  "Quick",
  "Screen",
  "Play Action",
  "Movement",
];
const GP_PASSING_FILTER_TYPES = [
  "Pass",
  "Drop",
  "Quick",
  "Screen",
  "Play Action",
  "Play Pass",
  "Movement",
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
  type: [],
  formation: "",
  personnel: [],
  basePlay: "",
  tempo: "",
  preferredDown: "",
  preferredDistance: "",
  preferredSituation: "",
  preferredFieldPosition: "",
  preferredHash: "",
  formTag1: "",
  formTag2: "",
  under: "",
  back: "",
  shift: "",
  motion: "",
  protection: "",
  lineCall: "",
  playName: "",
  playTag1: "",
  playTag2: "",
  oneWord: "",
  practiceFront: "",
  practiceDefense: "",
  practiceCoverage: "",
  practiceBlitz: "",
  practiceStunt: "",
  keyPlayer: "",
  keyPlayerName: "",
  constraint: "",
  hitChart: "",
  deadVs: "",
  opponent: "",
  notes: "",
  onlyOpponentTagged: false,
  hideAssigned: false,
  filterBoxes: false,
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
let _gpDragSource = null; // { boxId, sig, rawIdx } for box → box / box → library
let _gpRenderQueued = false;
let _gpRenderDebounceTimer = null;
let _gpOpenMultiFilter = "";

const GP_ADVANCED_FILTER_KEYS = [
  "basePlay",
  "tempo",
  "preferredDown",
  "preferredDistance",
  "preferredSituation",
  "preferredFieldPosition",
  "preferredHash",
  "formTag1",
  "formTag2",
  "under",
  "back",
  "shift",
  "motion",
  "protection",
  "lineCall",
  "playName",
  "playTag1",
  "playTag2",
  "oneWord",
  "practiceFront",
  "practiceDefense",
  "practiceCoverage",
  "practiceBlitz",
  "practiceStunt",
  "keyPlayer",
  "keyPlayerName",
  "constraint",
  "hitChart",
  "deadVs",
  "opponent",
  "notes",
  "onlyOpponentTagged",
  "filterBoxes",
];

const GP_PLAY_FILTER_KEYS = [
  "search",
  "type",
  "formation",
  "personnel",
  ...GP_ADVANCED_FILTER_KEYS.filter((key) => key !== "filterBoxes"),
  "goodVsMan",
  "goodVsBear",
  "goodVsOkie",
];

const GP_BOOLEAN_FILTER_FIELDS = new Set([
  "hideAssigned",
  "onlyOpponentTagged",
  "filterBoxes",
]);

const GP_DEBOUNCED_FILTER_FIELDS = new Set([
  "search",
  "playName",
  "deadVs",
  "notes",
]);

const GP_EXACT_FILTER_FIELDS = {
  formTag1: ["formTag1"],
  formTag2: ["formTag2"],
  under: ["under"],
  back: ["back"],
  shift: ["shift"],
  motion: ["motion"],
  protection: ["protection"],
  lineCall: ["lineCall"],
  playTag1: ["playTag1"],
  playTag2: ["playTag2"],
  oneWord: ["oneWord"],
  practiceFront: ["practiceFront"],
  practiceDefense: ["practiceDefense"],
  practiceCoverage: ["practiceCoverage"],
  practiceBlitz: ["practiceBlitz"],
  practiceStunt: ["practiceStunt"],
  opponent: ["opponent"],
};

const GP_COMBINED_EXACT_FILTER_FIELDS = {
  keyPlayer: ["keyPlayer1", "keyPlayer2", "keyPlayer3"],
  keyPlayerName: ["keyPlayerName1", "keyPlayerName2", "keyPlayerName3"],
  constraint: ["constraint1", "constraint2", "constraint3"],
  hitChart: ["hitChart1", "hitChart2", "hitChart3"],
};

const GP_TEXT_FILTER_FIELDS = {
  playName: ["play"],
  deadVs: ["deadVs"],
  notes: ["notes"],
};

function requestRenderGamePlan(opts = {}) {
  const debounceMs = Math.max(0, Number(opts.debounceMs) || 0);
  const queue = () => {
    if (_gpRenderQueued) return;
    _gpRenderQueued = true;
    const raf = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
    raf(() => {
      _gpRenderQueued = false;
      if (typeof renderGamePlan === "function") renderGamePlan();
    });
  };
  if (debounceMs > 0) {
    clearTimeout(_gpRenderDebounceTimer);
    _gpRenderDebounceTimer = setTimeout(queue, debounceMs);
    return;
  }
  clearTimeout(_gpRenderDebounceTimer);
  queue();
}

// Type-alias map (used by Send to Game Plan + Holding auto-route)
const GP_TYPE_ALIASES = {
  "Play Pass": "Play Action",
  "Drop": "Pass",
};

// Per-box matching metadata schema. Each box can have:
//   criteria: {
//     down:        ["1", "2", "3", "4"]            // multi-select
//     distance:    ["short", "medium", "long"]
//     situation:   ["short yardage", "2 minute", "4 minute", "opener"]
//     fieldPosition: ["green", "lo-rz", "hi-rz", "goal line", "backed up", "saigon"]
//     type:        ["Run", "Pass", ...]            // play.type values
//     coverage:    ["cover 0", "cover 2", ...]     // Practice Coverage aliases
//     keyPlayer:   "Marco"                         // name or position
//     keyword:     "shot | explosive"              // any matching phrase
//   }
//   callSheetCategoryId: "rz-20" | null            // explicit Push-to-Call-Sheet target
const GP_CRITERIA_FIELDS = [
  "down",
  "distance",
  "situation",
  "fieldPosition",
  "type",
  "coverage",
  "keyPlayer",
  "keyword",
];

const GP_DOWN_CHOICES = ["1", "2", "3", "4"];
const GP_DISTANCE_CHOICES = ["short", "medium", "long"];
const GP_SITUATION_CHOICES = ["short yardage", "2 minute", "4 minute", "opener"];
const GP_FIELD_POSITION_CHOICES = ["green", "lo-rz", "hi-rz", "goal line", "backed up", "saigon"];
const GP_TYPE_CHOICES = [
  "Run", "Pass", "Drop", "Screen", "Quick", "Play Action", "Play Pass",
  "RPO", "Run Option", "Movement",
];
const GP_COVERAGE_CHOICES = [
  "cover 0",
  "cover 1",
  "cover 2",
  "cover 3",
  "2-man",
];

function _gpEmptyCriteria() {
  return {
    down: [],
    distance: [],
    situation: [],
    fieldPosition: [],
    type: [],
    coverage: [],
    keyPlayer: "",
    keyword: "",
  };
}

function _gpGetBoxMeta(board, boxId) {
  if (!board || !boxId) return { criteria: _gpEmptyCriteria(), callSheetCategoryId: null };
  const raw = (board.boxMeta && board.boxMeta[boxId]) || {};
  const criteria = { ..._gpEmptyCriteria(), ...(raw.criteria || {}) };
  GP_CRITERIA_FIELDS.forEach((f) => {
    if (f === "keyPlayer" || f === "keyword") return;
    if (!Array.isArray(criteria[f])) criteria[f] = [];
  });
  if (typeof criteria.keyPlayer !== "string") criteria.keyPlayer = "";
  if (typeof criteria.keyword !== "string") criteria.keyword = "";
  return {
    criteria,
    callSheetCategoryId: raw.callSheetCategoryId || null,
  };
}

function _gpHasCriteria(criteria) {
  if (!criteria) return false;
  if (criteria.keyPlayer && criteria.keyPlayer.trim()) return true;
  if (criteria.keyword && criteria.keyword.trim()) return true;
  return ["down", "distance", "situation", "fieldPosition", "type", "coverage"].some(
    (f) => Array.isArray(criteria[f]) && criteria[f].length > 0,
  );
}

function _gpCoverageAliases(target) {
  const aliases = {
    "cover 0": ["cover 0", "cov 0", "c0", "zero"],
    "cover 1": ["cover 1", "cov 1", "c1", "man free"],
    "cover 2": [
      "cover 2",
      "cov 2",
      "c2",
      "tampa 2",
      "tampa two",
      "2-read",
      "2 read",
      "palms",
    ],
    "cover 3": [
      "cover 3",
      "cov 3",
      "c3",
      "3-deep",
      "3 deep",
      "buzz",
      "cloud",
    ],
    "2-man": [
      "2-man",
      "2 man",
      "man 2",
      "man two",
      "2-man under",
      "2 man under",
      "man under",
    ],
  };
  return aliases[target] || [target];
}

function _gpCoverageMatchesTarget(value, target) {
  const actual = String(value || "").trim().toLowerCase();
  if (!actual) return false;
  return _gpCoverageAliases(String(target || "").trim().toLowerCase())
    .some((alias) => actual === alias || actual.includes(alias));
}

function _gpCanonicalCoverage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return GP_COVERAGE_CHOICES.find(
    (target) => _gpCoverageMatchesTarget(normalized, target),
  ) || normalized;
}

function _gpKeywordMatchesPlay(play, rawKeyword) {
  const keywords = String(rawKeyword || "")
    .split(/[|,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (keywords.length === 0) return true;
  const haystack = [
    play?.play,
    play?.basePlay,
    play?.playTag1,
    play?.playTag2,
    play?.oneWord,
    play?.preferredSituation,
    play?.preferredFieldPosition,
    play?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

/**
 * Test whether a play matches a box's criteria. Returns true only if every
 * non-empty criterion field has at least one match against the play.
 * Empty criteria (no rules at all) returns false (the box is not auto-claiming).
 */
function _gpPlayMatchesCriteria(play, criteria) {
  if (!play || !criteria || !_gpHasCriteria(criteria)) return false;
  const splitPV = (v) =>
    typeof splitPreferredValues === "function"
      ? splitPreferredValues(v)
      : (v ? String(v).toLowerCase().split(/[,|;\/]+/).map((s) => s.trim()).filter(Boolean) : []);

  // down
  if (criteria.down.length > 0) {
    const playDowns = splitPV(play.preferredDown);
    if (!criteria.down.some((d) => playDowns.includes(String(d).toLowerCase()))) return false;
  }
  // distance
  if (criteria.distance.length > 0) {
    const playDist = splitPV(play.preferredDistance);
    if (!criteria.distance.some((d) => playDist.includes(d))) return false;
  }
  // situation
  if (criteria.situation.length > 0) {
    const playSit = splitPV(play.preferredSituation);
    if (!criteria.situation.some((s) => playSit.includes(s))) return false;
  }
  // field position (with simple alias support so RZ-20 ≈ Hi-RZ)
  if (criteria.fieldPosition.length > 0) {
    const playPos = splitPV(play.preferredFieldPosition);
    const aliases = {
      green: ["green", "fringe"],
      "lo-rz": ["lo-rz", "low red zone", "low rz"],
      "hi-rz": ["hi-rz", "high red zone", "high rz", "red zone", "rz", "rz-20"],
      "goal line": ["goal line", "goalline"],
      "backed up": ["backed up", "backedup", "own territory"],
      saigon: ["saigon"],
    };
    const ok = criteria.fieldPosition.some((target) => {
      const group = aliases[target] || [target];
      return playPos.some((pv) => group.includes(pv));
    });
    if (!ok) return false;
  }
  // play type (exact, case-insensitive)
  if (criteria.type.length > 0) {
    const type = GP_TYPE_ALIASES[play.type] || play.type || "";
    if (
      !criteria.type.some((candidate) => {
        const wanted = GP_TYPE_ALIASES[candidate] || candidate || "";
        return wanted.toLowerCase() === type.toLowerCase();
      })
    ) {
      return false;
    }
  }
  if (criteria.coverage.length > 0) {
    const coverages =
      typeof splitCoverageValues === "function"
        ? splitCoverageValues(play.practiceCoverage)
        : splitPV(play.practiceCoverage);
    if (
      !criteria.coverage.some((target) =>
        coverages.some((coverage) => _gpCoverageMatchesTarget(coverage, target)),
      )
    ) {
      return false;
    }
  }
  // Key player matches names or position labels. "Running Back" also accepts RB.
  if (criteria.keyPlayer && criteria.keyPlayer.trim()) {
    const target = criteria.keyPlayer.trim().toLowerCase();
    const names = [play.keyPlayerName1, play.keyPlayerName2, play.keyPlayerName3]
      .map((n) => (typeof n === "string" ? n.toLowerCase().trim() : ""))
      .filter(Boolean);
    const positions = [play.keyPlayer1, play.keyPlayer2, play.keyPlayer3]
      .map((position) =>
        typeof position === "string" ? position.toLowerCase().trim() : "",
      )
      .filter(Boolean);
    const targetAliases =
      target === "running back" ? ["running back", "rb"] : [target];
    if (
      !names.some((name) => targetAliases.includes(name)) &&
      !positions.some((position) => targetAliases.includes(position))
    ) {
      return false;
    }
  }
  if (!_gpKeywordMatchesPlay(play, criteria.keyword)) return false;
  return true;
}

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

// Coach-facing description of what each default box is for. Shown in the
// box info popup and the (optional) print "detail" mode.
const GP_BOX_DESCRIPTIONS = {
  Run: {
    intent: "Core run game — physical, downhill plays you trust on early downs and short yardage.",
    use: "1st & 10, 2nd & medium, short yardage, 4-minute, goal line.",
    looks: "Inside zone, outside zone, gap schemes (power/counter), iso, lead.",
  },
  Pass: {
    intent: "Drop-back pass concepts — your full menu of route combinations.",
    use: "2nd & long, 3rd & medium/long, two-minute, comebacks.",
    looks: "5/7-step protections, full-field reads, levels, mesh, dagger.",
  },
  Screen: {
    intent: "Built-in answer to pressure and aggressive fronts.",
    use: "vs. heavy blitz, vs. wide-9, getting the ball out hot.",
    looks: "Bubble, tunnel, slow, jailbreak, swing.",
  },
  Quick: {
    intent: "Quick-game rhythm passes — get the ball out in <2 sec.",
    use: "1st down, 3rd & short/medium, vs. soft coverage, tempo.",
    looks: "Hitches, slants, stick, snag, spacing.",
  },
  "Play Action": {
    intent: "Sell run, take a shot — most effective when run game is honest.",
    use: "1st down, 2nd & short, after 4+ yard run, red zone.",
    looks: "Boot, naked, deep crossers, posts, overs.",
  },
  RPO: {
    intent: "Run-pass option — eliminates a defender by reading him.",
    use: "All downs, vs. light boxes, vs. crashing safeties.",
    looks: "Bubble RPO, glance RPO, slant RPO, pop RPO.",
  },
  "Run Option": {
    intent: "QB-involved run game — read scheme without a forward pass tag.",
    use: "Boxes you can't outflank, short yardage with a running QB.",
    looks: "Zone read, power read, midline, speed option.",
  },
  Movement: {
    intent: "Pre-snap motion / shifts that change strength or assignment.",
    use: "Get a leverage answer, ID coverage, create conflict.",
    looks: "Jet motion, orbit, return, fly, shift to trips.",
  },
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
const GP_SNAPSHOTS_KEY = STORAGE_KEYS.GAME_PLAN_SNAPSHOTS;

/* -------------------------------------------------------------------------
   Storage helpers
   ------------------------------------------------------------------------- */

function _gpStorageKey() {
  return STORAGE_KEYS.GAME_PLAN_BOARDS;
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

function _gpCreateEmptyBoard() {
  const assignments = { [GP_HOLDING_ID]: [] };
  GP_DEFAULT_BOXES.forEach((box) => {
    assignments[box.id] = [];
  });
  return {
    assignments,
    customBoxes: [],
    targets: {},
    collapsed: [],
    notes: {},
    sort: {},
    hiddenBoxes: [],
    boxOrder: [],
    boxLabels: {},
    boxMeta: {},
    allowedPlayTypes: [],
    sheetTitle: "",
    printPreset: "",
    wristbandAutoBoxId: "",
  };
}

function _gpEnsureBoard() {
  const all = _gpLoadBoards();
  const key = _gpActiveOpponentKey();
  let changed = false;
  if (!all[key]) {
    all[key] = _gpCreateEmptyBoard();
    changed = true;
  } else {
    if (!all[key].assignments || typeof all[key].assignments !== "object") {
      all[key].assignments = {};
      changed = true;
    }
    GP_DEFAULT_BOXES.forEach((b) => {
      if (!Array.isArray(all[key].assignments[b.id])) {
        all[key].assignments[b.id] = [];
        changed = true;
      }
    });
    if (!Array.isArray(all[key].assignments[GP_HOLDING_ID])) {
      all[key].assignments[GP_HOLDING_ID] = [];
      changed = true;
    }
    if (!Array.isArray(all[key].customBoxes)) {
      all[key].customBoxes = [];
      changed = true;
    }
    if (!all[key].targets || typeof all[key].targets !== "object") {
      all[key].targets = {};
      changed = true;
    }
    if (!Array.isArray(all[key].collapsed)) {
      all[key].collapsed = [];
      changed = true;
    }
    if (!all[key].notes || typeof all[key].notes !== "object") {
      all[key].notes = {};
      changed = true;
    }
    if (!all[key].sort || typeof all[key].sort !== "object") {
      all[key].sort = {};
      changed = true;
    }
    if (!Array.isArray(all[key].hiddenBoxes)) {
      all[key].hiddenBoxes = [];
      changed = true;
    }
    if (!Array.isArray(all[key].boxOrder)) {
      all[key].boxOrder = [];
      changed = true;
    }
    if (!all[key].boxLabels || typeof all[key].boxLabels !== "object") {
      all[key].boxLabels = {};
      changed = true;
    }
    if (!all[key].boxMeta || typeof all[key].boxMeta !== "object") {
      all[key].boxMeta = {};
      changed = true;
    }
    if (!Array.isArray(all[key].allowedPlayTypes)) {
      all[key].allowedPlayTypes = [];
      changed = true;
    }
    if (typeof all[key].sheetTitle !== "string") {
      all[key].sheetTitle = "";
      changed = true;
    }
    if (typeof all[key].printPreset !== "string") {
      all[key].printPreset = "";
      changed = true;
    }
    if (typeof all[key].wristbandAutoBoxId !== "string") {
      all[key].wristbandAutoBoxId = "";
      changed = true;
    }
    all[key].customBoxes.forEach((cb) => {
      if (!Array.isArray(all[key].assignments[cb.id])) {
        all[key].assignments[cb.id] = [];
        changed = true;
      }
    });
  }
  if (changed) _gpSaveBoards(all);
  return all[key];
}

function _gpUpdateBoard(mutator) {
  const all = _gpLoadBoards();
  const key = _gpActiveOpponentKey();
  if (!all[key]) {
    all[key] = _gpCreateEmptyBoard();
  }
  mutator(all[key]);
  _gpSaveBoards(all);
}

function _gpGetBoardBoxes(board, options = {}) {
  const includeHolding = options.includeHolding !== false;
  const includeHidden = options.includeHidden === true;
  const source = [
    ...(includeHolding ? [GP_HOLDING_BOX] : []),
    ...GP_DEFAULT_BOXES,
    ...(board?.customBoxes || []),
  ];
  const customIds = new Set((board?.customBoxes || []).map((box) => box.id));
  const labeled = source.map((box) => {
    if (box.id === GP_HOLDING_ID || customIds.has(box.id)) return box;
    const label = board?.boxLabels?.[box.id];
    return label ? { ...box, label } : box;
  });
  const order = Array.isArray(board?.boxOrder) ? board.boxOrder : [];
  const ordered = labeled.slice().sort((left, right) => {
    if (left.id === GP_HOLDING_ID) return -1;
    if (right.id === GP_HOLDING_ID) return 1;
    const leftIndex = order.indexOf(left.id);
    const rightIndex = order.indexOf(right.id);
    const leftRank = leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER;
    const rightRank = rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || labeled.indexOf(left) - labeled.indexOf(right);
  });
  if (includeHidden) return ordered;
  const hidden = new Set(board?.hiddenBoxes || []);
  return ordered.filter(
    (box) => box.id === GP_HOLDING_ID || !hidden.has(box.id),
  );
}

function _gpMatchingBoardBoxForPlay(play, board) {
  const boxes = _gpGetBoardBoxes(board, { includeHolding: false });
  return boxes.find((box) => {
    const meta = _gpGetBoxMeta(board, box.id);
    return (
      _gpHasCriteria(meta.criteria) &&
      _gpPlayMatchesCriteria(play, meta.criteria)
    );
  })?.id || null;
}

function _gpAutoDestinationForPlay(play, board) {
  const criteriaMatch = _gpMatchingBoardBoxForPlay(play, board);
  if (criteriaMatch) return criteriaMatch;

  const visibleIds = new Set(
    _gpGetBoardBoxes(board, { includeHolding: false }).map((box) => box.id),
  );
  const mappedType = GP_TYPE_ALIASES[play?.type] || play?.type;
  return visibleIds.has(mappedType) ? mappedType : GP_HOLDING_ID;
}

function _gpPlayAllowedOnBoard(play, board) {
  const allowed = Array.isArray(board?.allowedPlayTypes)
    ? board.allowedPlayTypes
    : [];
  if (allowed.length === 0) return true;
  const type = GP_TYPE_ALIASES[play?.type] || play?.type || "";
  return allowed.includes(type);
}

function _gpIsPassingPlay(play) {
  const type = GP_TYPE_ALIASES[play?.type] || play?.type || "";
  return GP_PASSING_PLAY_TYPES.includes(type);
}

function _gpSyncLoadedWristbandBox(board, wristbandPlays) {
  const boxId = String(board?.wristbandAutoBoxId || "").trim();
  if (!boxId) return 0;
  if (!board.assignments || typeof board.assignments !== "object") {
    board.assignments = {};
  }
  const seen = new Set();
  board.assignments[boxId] = (Array.isArray(wristbandPlays) ? wristbandPlays : [])
    .filter(
      (play) =>
        _gpIsPassingPlay(play) &&
        _gpPlayAllowedOnBoard(play, board),
    )
    .filter((play) => {
      const signature = _gpPlaySignature(play);
      if (!signature || seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .map((play) => ({ ...play }));
  return board.assignments[boxId].length;
}

/* -------------------------------------------------------------------------
   Loaded wristband (per opponent board) — used to display wristband numbers
   next to plays in the on-screen render and printed output. Mirrors the
   call-sheet load-wristband flow.
   ------------------------------------------------------------------------- */

async function loadGamePlanWristband() {
  const saved = (typeof storageManager !== "undefined")
    ? storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, [])
    : [];
  if (!Array.isArray(saved) || saved.length === 0) {
    showToast("No saved wristbands. Save one in the Wristband tab first.", { type: "warning" });
    return;
  }
  const items = saved.map((wb, idx) => ({
    value: String(idx),
    label: `📄 ${wb.title || "Untitled"}`,
  }));
  const choice = await showListPicker("Pick a wristband to match against this game plan:", items, {
    title: "📋 Load Wristband",
    icon: "📋",
  });
  if (choice === null || choice === undefined) return;
  const wb = saved[parseInt(choice, 10)];
  if (!wb || !Array.isArray(wb.cards)) {
    showToast("Could not load wristband data.", { type: "error" });
    return;
  }
  const wristbandPlays = [];
  const cellsPerCard = getWristbandRecordCellCount(wb);
  wb.cards.forEach((card, cardIdx) => {
    const cellData = card.data || card;
    if (!Array.isArray(cellData)) return;
    cellData.slice(0, cellsPerCard).forEach((play, cellIdx) => {
      if (play && (play.formation || play.play)) {
        const wristbandNumber =
          cardIdx * cellsPerCard + cellIdx + WRISTBAND_OFFSET;
        wristbandPlays.push({ ...play, wristbandNumber });
      }
    });
  });
  let syncedPassPlays = 0;
  _gpUpdateBoard((b) => {
    b.loadedWristband = { name: wb.title || "Untitled", plays: wristbandPlays };
    syncedPassPlays = _gpSyncLoadedWristbandBox(b, wristbandPlays);
  });
  showToast(
    syncedPassPlays > 0
      ? `📋 Loaded “${wb.title}” and synced ${syncedPassPlays} passing play${syncedPassPlays === 1 ? "" : "s"}`
      : `📋 Loaded “${wb.title}” (${wristbandPlays.length} plays)`,
  );
  requestRenderGamePlan();
}

function clearGamePlanWristband() {
  _gpUpdateBoard((b) => {
    b.loadedWristband = null;
    _gpSyncLoadedWristbandBox(b, []);
  });
  showToast("🗑️ Wristband unloaded");
  requestRenderGamePlan();
}

function _gpWristbandNumberFor(play, board = null) {
  const sourceBoard = board || _gpEnsureBoard();
  const lw = sourceBoard.loadedWristband;
  if (!lw || !Array.isArray(lw.plays) || lw.plays.length === 0) return null;
  const list = lw.plays;
  let m = list.find((wp) =>
    wp.formation === play.formation && wp.play === play.play && wp.personnel === play.personnel,
  );
  if (!m) m = list.find((wp) => wp.formation === play.formation && wp.play === play.play);
  if (!m) {
    const f = (play.formation || "").toLowerCase().trim();
    const p = (play.play || "").toLowerCase().trim();
    m = list.find((wp) =>
      (wp.formation || "").toLowerCase().trim() === f &&
      (wp.play || "").toLowerCase().trim() === p,
    );
  }
  return m ? m.wristbandNumber : null;
}

/* -------------------------------------------------------------------------
   Play signatures (used to identify a play across renders)
   ------------------------------------------------------------------------- */

function _gpPlaySignature(play) {
  return getPlayIdentityKey(play, "gameplan", { trim: false });
}

function _gpNormalizeBoxPlayIndex(value) {
  if (value === null || value === undefined || value === "") return null;
  const idx = Number(value);
  return Number.isInteger(idx) && idx >= 0 ? idx : null;
}

function _gpBuildBoxPlayArg(boxId, sig, rawIdx, extra) {
  const payload = {
    boxId: boxId == null ? "" : String(boxId),
    sig: sig == null ? "" : String(sig),
  };
  const idx = _gpNormalizeBoxPlayIndex(rawIdx);
  if (idx !== null) payload.rawIdx = idx;
  if (extra && typeof extra === "object") Object.assign(payload, extra);
  return JSON.stringify(payload);
}

function _gpParseBoxPlayArg(arg) {
  if (!arg) return null;
  const raw = String(arg);
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      if (!data || typeof data !== "object") return null;
      return {
        boxId: data.boxId == null ? "" : String(data.boxId),
        sig: data.sig == null ? "" : String(data.sig),
        rawIdx: _gpNormalizeBoxPlayIndex(data.rawIdx),
        flag: data.flag == null ? "" : String(data.flag),
      };
    } catch (_e) {
      // Fall through to the legacy delimiter parser.
    }
  }

  const sepIdx = raw.indexOf("::");
  if (sepIdx < 0) return null;
  const boxId = raw.slice(0, sepIdx);
  let sig = raw.slice(sepIdx + 2);
  let flag = "";
  let rawIdx = null;

  const flagMarker = "::flag=";
  const flagIdx = sig.lastIndexOf(flagMarker);
  if (flagIdx >= 0) {
    flag = sig.slice(flagIdx + flagMarker.length);
    sig = sig.slice(0, flagIdx);
  } else {
    const lastSep = sig.lastIndexOf("::");
    if (lastSep >= 0) {
      const maybeFlag = sig.slice(lastSep + 2);
      if (maybeFlag === "wb" || maybeFlag === "jv") {
        flag = maybeFlag;
        sig = sig.slice(0, lastSep);
      }
    }
  }

  const idxMarker = "::idx=";
  const idxMarkerPos = sig.lastIndexOf(idxMarker);
  if (idxMarkerPos >= 0) {
    const parsedIdx = _gpNormalizeBoxPlayIndex(sig.slice(idxMarkerPos + idxMarker.length));
    if (parsedIdx !== null) {
      rawIdx = parsedIdx;
      sig = sig.slice(0, idxMarkerPos);
    }
  }

  return { boxId, sig, rawIdx, flag };
}

function _gpFindBoxPlayIndex(list, sig, rawIdx) {
  if (!Array.isArray(list)) return -1;
  const idx = _gpNormalizeBoxPlayIndex(rawIdx);
  if (idx !== null && idx < list.length) {
    const play = list[idx];
    if (!sig || _gpPlaySignature(play) === sig) return idx;
  }
  if (!sig) return -1;
  return list.findIndex((p) => _gpPlaySignature(p) === sig);
}

function _gpFindBoxPlay(list, sig, rawIdx) {
  const idx = _gpFindBoxPlayIndex(list, sig, rawIdx);
  return idx >= 0 ? list[idx] : null;
}

function _gpFindPlayBySig(sig) {
  if (typeof findPlayByGamePlanSignature === "function") {
    return findPlayByGamePlanSignature(sig);
  }
  if (!Array.isArray(plays)) return null;
  return plays.find((p) => _gpPlaySignature(p) === sig) || null;
}

// Friendly box label for toasts (turns "__holding" into "Holding", etc.)
function _gpBoxLabel(boxId) {
  if (!boxId) return "";
  if (boxId === GP_HOLDING_ID) return "Holding";
  const board = (typeof _gpEnsureBoard === "function") ? _gpEnsureBoard() : null;
  const custom = board && Array.isArray(board.customBoxes)
    ? board.customBoxes.find((b) => b.id === boxId)
    : null;
  if (custom && custom.label) return custom.label;
  const def = GP_DEFAULT_BOXES.find((b) => b.id === boxId);
  if (def) {
    const customLabel = board && board.boxLabels && board.boxLabels[boxId];
    return customLabel || def.label;
  }
  return boxId;
}

function _gpAllAssignedSigs(board) {
  const set = new Set();
  Object.values(board.assignments || {}).forEach((arr) => {
    (arr || []).forEach((p) => set.add(_gpPlaySignature(p)));
  });
  return set;
}

/* -------------------------------------------------------------------------
   Per-play flags (wb / jv) — stored on each assignment snapshot under
   `_gpFlags`. Excluded from `_gpPlaySignature` so toggling never breaks
   matching, drag/drop, or downstream pushes.
   ------------------------------------------------------------------------- */

const GP_PLAY_FLAGS = ["wb", "jv"];

function _gpHasFlag(play, flag) {
  return !!(play && play._gpFlags && play._gpFlags[flag]);
}

function _gpToggleFlag(boxId, sig, flag, rawIdx) {
  if (!boxId || !sig || !GP_PLAY_FLAGS.includes(flag)) return false;
  let toggled = false;
  _gpUpdateBoard((board) => {
    const list = board.assignments && board.assignments[boxId];
    if (!Array.isArray(list)) return;
    const item = _gpFindBoxPlay(list, sig, rawIdx);
    if (!item) return;
    if (!item._gpFlags) item._gpFlags = {};
    item._gpFlags[flag] = !item._gpFlags[flag];
    if (!item._gpFlags[flag]) delete item._gpFlags[flag];
    if (item._gpFlags && Object.keys(item._gpFlags).length === 0) delete item._gpFlags;
    toggled = true;
  });
  return toggled;
}

// Strip flags before pushing a snapshot somewhere that doesn't need them
// (wristband, script, etc.). Returns a shallow copy.
function _gpStripFlags(play) {
  if (!play) return play;
  const out = { ...play };
  delete out._gpFlags;
  return out;
}

// Cross-page helpers: are exposed globally so playbook/script/callsheet
// filters can ask "is this play part of the current game plan board?"
// or "is this play marked WB / JV?".
function getGamePlanBoardSignatures() {
  const board = _gpEnsureBoard();
  return _gpAllAssignedSigs(board);
}

function isPlayInGamePlanBoard(play) {
  if (!play) return false;
  return getGamePlanBoardSignatures().has(_gpPlaySignature(play));
}

function _gpFlaggedSigs(flag) {
  const board = _gpEnsureBoard();
  const set = new Set();
  Object.values(board.assignments || {}).forEach((arr) => {
    (arr || []).forEach((p) => {
      if (_gpHasFlag(p, flag)) set.add(_gpPlaySignature(p));
    });
  });
  return set;
}

function isPlayFlaggedInGamePlan(play, flag) {
  if (!play) return false;
  return _gpFlaggedSigs(flag).has(_gpPlaySignature(play));
}

function getGamePlanFlaggedPlays(flag) {
  if (!GP_PLAY_FLAGS.includes(flag)) return [];
  const board = _gpEnsureBoard();
  const out = [];
  const seen = new Set();
  Object.values(board.assignments || {}).forEach((arr) => {
    (arr || []).forEach((p) => {
      if (!_gpHasFlag(p, flag)) return;
      const sig = _gpPlaySignature(p);
      if (seen.has(sig)) return;
      seen.add(sig);
      out.push(_gpStripFlags(p));
    });
  });
  return out;
}

function getGamePlanFlaggedCount(flag) {
  return _gpFlaggedSigs(flag).size;
}

/* -------------------------------------------------------------------------
   Filtering library
   ------------------------------------------------------------------------- */

function _gpFilteredLibrary(board) {
  if (!Array.isArray(plays)) return [];
  const assignedSigs = _gpAllAssignedSigs(board);
  const search = (_gpFilters.search || "").trim().toLowerCase();
  return plays.filter(
    (play) =>
      _gpPlayAllowedOnBoard(play, board) &&
      _gpPlayMatchesCurrentFilters(play, board, {
        includeHideAssigned: true,
        assignedSigs,
        search,
      }),
  );
}

function _gpFilterNorm(value) {
  return String(value || "").trim().toLowerCase();
}

function _gpFilterValueList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const single = String(value || "").trim();
  return single ? [single] : [];
}

function _gpFilterHasValue(value) {
  return _gpFilterValueList(value).length > 0;
}

function _gpFilterValueMatches(value, target) {
  const wanted = _gpFilterNorm(target);
  if (!wanted) return true;
  return _gpFilterNorm(value) === wanted;
}

function _gpFilterMatchesAny(value, filterValue) {
  const selected = _gpFilterValueList(filterValue);
  if (selected.length === 0) return true;
  return selected.some((target) => _gpFilterValueMatches(value, target));
}

function _gpFilterAnyFieldMatches(play, fields, target) {
  const wanted = _gpFilterNorm(target);
  if (!wanted) return true;
  return fields.some((field) => _gpFilterValueMatches(play?.[field], wanted));
}

function _gpFilterAnyFieldIncludes(play, fields, needle) {
  const wanted = _gpFilterNorm(needle);
  if (!wanted) return true;
  return fields.some((field) => _gpFilterNorm(play?.[field]).includes(wanted));
}

function _gpNormalizeHashFilterValue(value) {
  const raw = _gpFilterNorm(value);
  if (!raw) return "";
  if (raw === "l" || raw === "left") return "Left";
  if (raw === "m" || raw === "middle" || raw === "mid" || raw === "center") return "Middle";
  if (raw === "r" || raw === "right") return "Right";
  return String(value || "").trim();
}

function _gpHasActivePlayFilters(options = {}) {
  const includeHideAssigned = options.includeHideAssigned !== false;
  const includeBoxToggle = options.includeBoxToggle !== false;
  const f = _gpFilters || {};
  return Boolean(
    GP_PLAY_FILTER_KEYS.some((key) => _gpFilterHasValue(f[key])) ||
    (includeHideAssigned && f.hideAssigned) ||
    (includeBoxToggle && f.filterBoxes)
  );
}

function _gpPlayMatchesCurrentFilters(p, board, options = {}) {
  const includeHideAssigned = options.includeHideAssigned !== false;
  const search = options.search !== undefined
    ? options.search
    : (_gpFilters.search || "").trim().toLowerCase();
  const assignedSigs = options.assignedSigs || _gpAllAssignedSigs(board);
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw && gw.opponentName ? gw.opponentName : null;

  const canonicalType = GP_TYPE_ALIASES[p.type] || p.type;
  const canonicalTypeFilters = _gpFilterValueList(_gpFilters.type)
    .map((type) => GP_TYPE_ALIASES[type] || type);
  if (!_gpFilterMatchesAny(canonicalType, canonicalTypeFilters)) return false;
  if (_gpFilters.formation && p.formation !== _gpFilters.formation) return false;
  if (!_gpFilterMatchesAny(p.personnel, _gpFilters.personnel)) return false;
  if (_gpFilters.basePlay && p.basePlay !== _gpFilters.basePlay) return false;
  if (_gpFilters.tempo && p.tempo !== _gpFilters.tempo) return false;
  if (_gpFilters.preferredDown && p.preferredDown !== _gpFilters.preferredDown) return false;
  if (_gpFilters.preferredDistance && p.preferredDistance !== _gpFilters.preferredDistance) return false;
  if (_gpFilters.preferredSituation && p.preferredSituation !== _gpFilters.preferredSituation) return false;
  if (_gpFilters.preferredFieldPosition && p.preferredFieldPosition !== _gpFilters.preferredFieldPosition) return false;
  if (_gpFilters.preferredHash) {
    if (_gpNormalizeHashFilterValue(p.preferredHash) !== _gpFilters.preferredHash) return false;
  }
  for (const [filterKey, fields] of Object.entries(GP_EXACT_FILTER_FIELDS)) {
    if (_gpFilters[filterKey] && !_gpFilterAnyFieldMatches(p, fields, _gpFilters[filterKey])) return false;
  }
  for (const [filterKey, fields] of Object.entries(GP_COMBINED_EXACT_FILTER_FIELDS)) {
    if (_gpFilters[filterKey] && !_gpFilterAnyFieldMatches(p, fields, _gpFilters[filterKey])) return false;
  }
  for (const [filterKey, fields] of Object.entries(GP_TEXT_FILTER_FIELDS)) {
    if (_gpFilters[filterKey] && !_gpFilterAnyFieldIncludes(p, fields, _gpFilters[filterKey])) return false;
  }
  if (_gpFilters.goodVsMan && !p.goodVsMan) return false;
  if (_gpFilters.goodVsBear && !p.goodVsBear) return false;
  if (_gpFilters.goodVsOkie && !p.goodVsOkie) return false;
  if (_gpFilters.onlyOpponentTagged) {
    if (!opponent) return false;
    if (typeof isPlayTaggedForOpponent === "function" && !isPlayTaggedForOpponent(p, opponent)) return false;
  }
  if (includeHideAssigned && _gpFilters.hideAssigned && assignedSigs.has(_gpPlaySignature(p))) return false;
  if (search) {
    const runtimeIndex =
      typeof getPlaybookRuntimeIndex === "function" ? getPlaybookRuntimeIndex() : null;
    const meta = runtimeIndex && runtimeIndex.byPlay ? runtimeIndex.byPlay.get(p) : null;
    const hay = meta ? meta.searchText : [
      p.type, p.personnel, p.formation, p.formTag1, p.formTag2,
      p.under, p.back, p.shift, p.motion, p.protection, p.lineCall,
      p.play, p.playTag1, p.playTag2, p.basePlay, p.oneWord, p.notes,
      p.tempo, p.preferredDown, p.preferredDistance, p.preferredSituation,
      p.preferredFieldPosition, p.preferredHash,
      p.practiceFront, p.practiceDefense, p.practiceCoverage,
      p.practiceBlitz, p.practiceStunt,
      p.keyPlayer1, p.keyPlayer2, p.keyPlayer3,
      p.keyPlayerName1, p.keyPlayerName2, p.keyPlayerName3,
      p.constraint1, p.constraint2, p.constraint3,
      p.hitChart1, p.hitChart2, p.hitChart3,
      p.deadVs, p.opponent,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(search)) return false;
  }
  return true;
}

function _gpShouldFilterBoxes() {
  return Boolean(
    _gpFilters.filterBoxes &&
    _gpHasActivePlayFilters({
      includeHideAssigned: false,
      includeBoxToggle: false,
    })
  );
}

function _gpFilterBoxList(list, board) {
  const allowed = list.filter((play) => _gpPlayAllowedOnBoard(play, board));
  if (!_gpShouldFilterBoxes()) return allowed;
  return allowed.filter((play) => _gpPlayMatchesCurrentFilters(play, board, {
    includeHideAssigned: false,
  }));
}

/* -------------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
   Trash zone (drag a box-play out)
   ------------------------------------------------------------------------- */

function _gpAttachTrashZoneHandlers() {
  // Trash drop is handled by the delegated document-level listeners in
  // _gpWireDnd(). This function is intentionally a no-op kept for backward
  // compatibility with the existing renderGamePlan call site.
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
   Init
   ------------------------------------------------------------------------- */

function initGamePlan() {
  _gpEnsureBoard();
  refreshGamePlanFromPlaybook();
  renderGamePlan();
}

// Re-sync every play snapshot in the active board's assignments against
// the master `plays[]` array. The play editor and dashboard mutate plays
// directly, but the game plan stored a `{...play}` copy at drop time, so
// edits to tags/notes/key players/etc. don't appear in the game plan boxes
// until we re-hydrate. We match by `_gpPlaySignature` (immutable-ish key
// fields) and replace each snapshot with a fresh copy. Any snapshot that
// no longer matches any master play is left as-is (could be a deleted or
// renamed play — staff can clean it up manually).
function refreshGamePlanFromPlaybook() {
  if (!Array.isArray(plays) || plays.length === 0) return 0;
  // Build signature→play map once (O(n)) to avoid O(n²) lookups in nested loop
  const playBySignature = new Map(
    plays.map((p) => [_gpPlaySignature(p), p])
  );
  let updated = 0;
  _gpUpdateBoard((board) => {
    if (!board || !board.assignments) return;
    Object.keys(board.assignments).forEach((boxId) => {
      const arr = board.assignments[boxId];
      if (!Array.isArray(arr)) return;
      arr.forEach((snap, i) => {
        const fresh = playBySignature.get(_gpPlaySignature(snap)); // O(1) lookup
        if (fresh) {
          // Preserve assignment metadata (flags, etc.)
          const preserved = {};
          if (snap._gpFlags) preserved._gpFlags = { ...snap._gpFlags };
          // Add more preserved fields here if needed
          arr[i] = { ...fresh, ...preserved };
          updated += 1;
        }
      });
    });
  });
  return updated;
}

// Bind keyboard shortcuts once at script load
if (typeof document !== "undefined" && !window._gpKeydownBound) {
  document.addEventListener("keydown", _gpHandleKeydown);
  window._gpKeydownBound = true;
}
