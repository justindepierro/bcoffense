/* =========================================================================
   Game Plan — named snapshots (save/load/delete/menu)
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

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
   Templates — reusable game-plan board starters (cross-opponent)
   ------------------------------------------------------------------------- */

const GP_TEMPLATES_KEY = STORAGE_KEYS.GAME_PLAN_TEMPLATES;
const GP_SEVEN_ON_SEVEN_TEMPLATE_ID = "builtin-7on7-passing";
const GP_SEVEN_ON_SEVEN_BOXES = [
  {
    id: "7on7-openers",
    label: "Openers",
    target: 5,
    note: "First calls for the tournament script.",
    criteria: { situation: ["opener"] },
  },
  {
    id: "7on7-first-down",
    label: "1st Down",
    target: 5,
    note: "Early-down calls that keep the full menu open.",
    criteria: { down: ["1"] },
  },
  {
    id: "7on7-second-down",
    label: "2nd Down",
    target: 5,
    note: "Best calls for staying on schedule.",
    criteria: { down: ["2"] },
  },
  {
    id: "7on7-third-down",
    label: "3rd Down",
    target: 5,
    note: "Short and medium conversion calls.",
    criteria: { down: ["3"], distance: ["short", "medium"] },
  },
  {
    id: "7on7-third-long",
    label: "3rd & Long",
    target: 4,
    note: "Long-yardage conversion calls.",
    criteria: { down: ["3"], distance: ["long"] },
  },
  {
    id: "7on7-marco",
    label: "Marco",
    target: 3,
    note: "Designed touches and matchup calls for Marco.",
    criteria: { keyPlayer: "Marco" },
  },
  {
    id: "7on7-diego",
    label: "Diego",
    target: 3,
    note: "Designed touches and matchup calls for Diego.",
    criteria: { keyPlayer: "Diego" },
  },
  {
    id: "7on7-jayce",
    label: "Jayce",
    target: 3,
    note: "Designed touches and matchup calls for Jayce.",
    criteria: { keyPlayer: "Jayce" },
  },
  {
    id: "7on7-jake",
    label: "Jake",
    target: 3,
    note: "Designed touches and matchup calls for Jake.",
    criteria: { keyPlayer: "Jake" },
  },
  {
    id: "7on7-skro-bros",
    label: "Skro Bros",
    target: 3,
    note: "Designed touches and matchup calls for the Skro Bros.",
    criteria: { keyPlayer: "Skro Bros" },
  },
  {
    id: "7on7-running-back",
    label: "Running Back",
    target: 3,
    note: "Backfield releases, checkdowns, swings, and matchups.",
    criteria: { keyPlayer: "Running Back" },
  },
  {
    id: "7on7-cover-01",
    label: "Cov 0/1 Beaters",
    target: 4,
    note: "Pressure-man and single-high man answers.",
    criteria: { coverage: ["cover 0", "cover 1"] },
  },
  {
    id: "7on7-cover-2",
    label: "Cov 2 Beaters",
    target: 4,
    note: "Two-high and Cover 2 answers.",
    criteria: { coverage: ["cover 2"] },
  },
  {
    id: "7on7-cover-3",
    label: "Cov 3 Beaters",
    target: 4,
    note: "Three-deep and Cover 3 answers.",
    criteria: { coverage: ["cover 3"] },
  },
  {
    id: "7on7-man-2",
    label: "Man 2 Beaters",
    target: 4,
    note: "Two-man and man-under answers.",
    criteria: { coverage: ["2-man"] },
  },
  {
    id: "7on7-shots",
    label: "Shot Plays",
    target: 4,
    note: "Explosives and deliberate downfield calls.",
    criteria: { keyword: "shot | explosive" },
  },
  {
    id: "7on7-wristband-passes",
    label: "Pass Plays on Wristband",
    target: 0,
    note: "Auto-syncs passing calls whenever a wristband is loaded.",
  },
  {
    id: "7on7-goal-line",
    label: "Goal Line",
    target: 4,
    note: "Calls for the goal line and compressed field.",
    criteria: { fieldPosition: ["goal line"] },
  },
  {
    id: "7on7-two-point",
    label: "Two-Point Conversion",
    target: 4,
    note: "Must-have two-point calls.",
    criteria: { keyword: "2 point | 2-point | two point | two-point" },
  },
];

function _gpBuiltInTemplates() {
  const assignments = { [GP_HOLDING_ID]: [] };
  GP_DEFAULT_BOXES.forEach((box) => {
    assignments[box.id] = [];
  });
  GP_SEVEN_ON_SEVEN_BOXES.forEach((box) => {
    assignments[box.id] = [];
  });

  return [{
    id: GP_SEVEN_ON_SEVEN_TEMPLATE_ID,
    name: "7-on-7 Passing Sheet",
    sheetTitle: "7-on-7 Passing Plan",
    builtIn: true,
    description: "Tournament situations, player touches, coverage beaters, wristband passes, and conversion calls.",
    includePlays: false,
    playCount: 0,
    boxCount: GP_SEVEN_ON_SEVEN_BOXES.length,
    customBoxes: GP_SEVEN_ON_SEVEN_BOXES.map(({ id, label }) => ({ id, label })),
    targets: Object.fromEntries(
      GP_SEVEN_ON_SEVEN_BOXES.map((box) => [box.id, box.target]),
    ),
    collapsed: [],
    notes: Object.fromEntries(
      GP_SEVEN_ON_SEVEN_BOXES.map((box) => [box.id, box.note]),
    ),
    sort: {},
    hiddenBoxes: GP_DEFAULT_BOXES.map((box) => box.id),
    boxOrder: GP_SEVEN_ON_SEVEN_BOXES.map((box) => box.id),
    boxLabels: {},
    boxMeta: Object.fromEntries(
      GP_SEVEN_ON_SEVEN_BOXES
        .filter((box) => box.criteria)
        .map((box) => [
          box.id,
          {
            criteria: {
              ..._gpEmptyCriteria(),
              ...safeDeepClone(box.criteria),
            },
          },
        ]),
    ),
    allowedPlayTypes: [...GP_PASSING_PLAY_TYPES],
    filterPreset: {
      type: [...GP_PASSING_FILTER_TYPES],
      density: "compact",
    },
    printPreset: "sevenOnSeven",
    wristbandAutoBoxId: "7on7-wristband-passes",
    assignments,
  }];
}

function _gpLoadTemplates() {
  const stored = storageManager.get(GP_TEMPLATES_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

function _gpAvailableTemplates() {
  return [..._gpBuiltInTemplates(), ..._gpLoadTemplates()];
}

function _gpSaveTemplates(templates) {
  storageManager.set(GP_TEMPLATES_KEY, Array.isArray(templates) ? templates : []);
}

function _gpTemplateBoxIds(board) {
  const customIds = Array.isArray(board?.customBoxes)
    ? board.customBoxes.map((box) => box.id).filter(Boolean)
    : [];
  return [
    GP_HOLDING_ID,
    ...GP_DEFAULT_BOXES.map((box) => box.id),
    ...customIds,
  ];
}

function _gpTemplatePlayCount(templateOrBoard) {
  const assignments = templateOrBoard?.assignments || {};
  return Object.values(assignments).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0,
  );
}

function _gpBuildTemplate(name, includePlays) {
  const board = _gpEnsureBoard();
  const assignments = {};
  _gpTemplateBoxIds(board).forEach((boxId) => {
    assignments[boxId] = includePlays
      ? safeDeepClone(board.assignments?.[boxId] || [])
      : [];
  });

  return {
    id: `gpt-${Date.now()}`,
    name: name.trim(),
    savedAt: new Date().toISOString(),
    includePlays: Boolean(includePlays),
    playCount: includePlays ? _gpTemplatePlayCount({ assignments }) : 0,
    boxCount: GP_DEFAULT_BOXES.length + (Array.isArray(board.customBoxes) ? board.customBoxes.length : 0),
    customBoxes: safeDeepClone(board.customBoxes || []),
    targets: safeDeepClone(board.targets || {}),
    collapsed: safeDeepClone(board.collapsed || []),
    notes: safeDeepClone(board.notes || {}),
    sort: safeDeepClone(board.sort || {}),
    hiddenBoxes: safeDeepClone(board.hiddenBoxes || []),
    boxOrder: safeDeepClone(board.boxOrder || []),
    boxLabels: safeDeepClone(board.boxLabels || {}),
    boxMeta: safeDeepClone(board.boxMeta || {}),
    allowedPlayTypes: safeDeepClone(board.allowedPlayTypes || []),
    sheetTitle: board.sheetTitle || "",
    printPreset: board.printPreset || "",
    wristbandAutoBoxId: board.wristbandAutoBoxId || "",
    assignments,
  };
}

function _gpBoardFromTemplate(template) {
  const customBoxes = safeDeepClone(template.customBoxes || []);
  const customIds = customBoxes.map((box) => box.id).filter(Boolean);
  const boxIds = [
    GP_HOLDING_ID,
    ...GP_DEFAULT_BOXES.map((box) => box.id),
    ...customIds,
  ];
  const assignments = {};
  boxIds.forEach((boxId) => {
    assignments[boxId] = template.includePlays
      ? safeDeepClone(template.assignments?.[boxId] || [])
      : [];
  });

  return {
    assignments,
    customBoxes,
    targets: safeDeepClone(template.targets || {}),
    collapsed: safeDeepClone(template.collapsed || []),
    notes: safeDeepClone(template.notes || {}),
    sort: safeDeepClone(template.sort || {}),
    hiddenBoxes: safeDeepClone(template.hiddenBoxes || []),
    boxOrder: safeDeepClone(template.boxOrder || []),
    boxLabels: safeDeepClone(template.boxLabels || {}),
    boxMeta: safeDeepClone(template.boxMeta || {}),
    allowedPlayTypes: safeDeepClone(template.allowedPlayTypes || []),
    sheetTitle: template.sheetTitle || "",
    printPreset: template.printPreset || "",
    wristbandAutoBoxId: template.wristbandAutoBoxId || "",
  };
}

function _gpTemplateLabel(template) {
  if (template.builtIn) {
    return `${template.name} • built in • ${template.boxCount || 0} boxes • one-page preset`;
  }
  const when = template.savedAt
    ? new Date(template.savedAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : "Unknown date";
  const boxCount = template.boxCount || GP_DEFAULT_BOXES.length;
  const playPart = template.includePlays
    ? ` • ${template.playCount || _gpTemplatePlayCount(template)} plays`
    : " • structure only";
  return `${template.name || "Untitled Template"} • ${boxCount} boxes${playPart} • ${when}`;
}

async function saveGamePlanTemplate() {
  const board = _gpEnsureBoard();
  const draftedCount = _gpTemplatePlayCount(board);
  const defaultName = (() => {
    const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
    return gw?.weekLabel ? `${gw.weekLabel} Game Plan` : "Weekly Game Plan";
  })();
  const name = await showPrompt("Name this game plan template:", defaultName, {
    title: "Save Game Plan Template",
    icon: "📁",
    placeholder: "e.g. Weekly offensive board",
  });
  if (!name || !name.trim()) return;

  let includePlays = false;
  if (draftedCount > 0) {
    const choice = await showChoice(
      "Save only the bucket structure, or include the drafted plays too?",
      {
        title: "Template Contents",
        icon: "📁",
        option1: "Structure only",
        option2: `Include ${draftedCount} plays`,
      },
    );
    if (!choice) return;
    includePlays = choice === "option2";
  }

  const templates = _gpLoadTemplates();
  const existingIdx = templates.findIndex(
    (template) => String(template.name || "").toLowerCase() === name.trim().toLowerCase(),
  );
  const nextTemplate = _gpBuildTemplate(name, includePlays);
  if (existingIdx >= 0) {
    const ok = await showConfirm(
      `Replace existing template <strong>${escapeHtml(templates[existingIdx].name)}</strong>?`,
      {
        title: "Replace Template",
        icon: "📁",
        confirmText: "Replace",
        danger: true,
      },
    );
    if (!ok) return;
    nextTemplate.id = templates[existingIdx].id || nextTemplate.id;
    templates.splice(existingIdx, 1, nextTemplate);
  } else {
    templates.unshift(nextTemplate);
  }

  _gpSaveTemplates(templates);
  showToast(`Saved template "${nextTemplate.name}"`, { type: "success" });
}

async function openGamePlanTemplatesMenu() {
  const templates = _gpAvailableTemplates();

  const choice = await showListPicker(
    "Pick a reusable game plan template:",
    templates.map((template) => ({
      value: template.id,
      label: _gpTemplateLabel(template),
    })),
    { title: "📁 Game Plan Templates", icon: "📁" },
  );
  if (!choice) return;
  const selected = templates.find((template) => template.id === choice);
  if (selected?.builtIn) {
    await _gpLoadTemplate(choice);
    return;
  }

  const action = await showChoice(
    "What do you want to do with this template?",
    {
      title: "Game Plan Template",
      icon: "📁",
      option1: "Load into current opponent",
      option2: "Delete",
    },
  );
  if (!action) return;
  if (action === "option1") await _gpLoadTemplate(choice);
  else if (action === "option2") await _gpDeleteTemplate(choice);
}

async function _gpLoadTemplate(templateId) {
  const templates = _gpAvailableTemplates();
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;

  const key = _gpActiveOpponentKey();
  const opponentLabel = key === "__unassigned__" ? "the current board" : key;
  const playCopy = template.includePlays
    ? ` This also loads ${template.playCount || _gpTemplatePlayCount(template)} saved play${(template.playCount || _gpTemplatePlayCount(template)) === 1 ? "" : "s"}.`
    : " Drafted plays will start empty.";
  const ok = await showConfirm(
    `Load <strong>${escapeHtml(template.name)}</strong> into ${escapeHtml(opponentLabel)}? This replaces the current game plan board.${playCopy}`,
    {
      title: "Load Template",
      icon: "📁",
      confirmText: "Load",
      danger: true,
    },
  );
  if (!ok) return;

  const all = _gpLoadBoards();
  all[key] = _gpBoardFromTemplate(template);
  _gpSaveBoards(all);
  if (template.filterPreset) {
    clearGamePlanFilters();
    _gpFilters.type = safeDeepClone(template.filterPreset.type || []);
    _gpFilters.density = template.filterPreset.density || "compact";
  }
  if (
    template.printPreset === "sevenOnSeven" &&
    typeof _gpApplySevenOnSevenPrintDefaults === "function"
  ) {
    _gpApplySevenOnSevenPrintDefaults();
  }
  requestRenderGamePlan();
  showToast(
    template.builtIn
      ? `Loaded "${template.name}" with passing-only filters and one-page print settings`
      : `Loaded template "${template.name}"`,
    { type: "success", duration: template.builtIn ? 4000 : 2000 },
  );
}

async function _gpDeleteTemplate(templateId) {
  const templates = _gpLoadTemplates();
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;
  if (template.builtIn) return;
  const ok = await showConfirm(
    `Delete template <strong>${escapeHtml(template.name)}</strong>?`,
    {
      title: "Delete Template",
      icon: "🗑️",
      confirmText: "Delete",
      danger: true,
    },
  );
  if (!ok) return;
  _gpSaveTemplates(templates.filter((item) => item.id !== templateId));
  showToast("Template deleted", { type: "success" });
}
