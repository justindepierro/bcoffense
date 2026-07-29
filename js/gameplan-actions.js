/* =========================================================================
   Game Plan — box CRUD, selection, density, manage/reorder/hide/rename
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

function removeFromGamePlanBox(combined) {
  const ref = _gpParseBoxPlayArg(combined);
  if (!ref || !ref.boxId || !ref.sig) return;
  _gpUpdateBoard((board) => {
    const arr = board.assignments[ref.boxId] || [];
    const idx = _gpFindBoxPlayIndex(arr, ref.sig, ref.rawIdx);
    if (idx >= 0) arr.splice(idx, 1);
  });
  requestRenderGamePlan();
}

/* ----- Per-play flag toggles + send to wristband -------------------------
   data-arg uses _gpBuildBoxPlayArg() so duplicate/similar rows can carry
   the clicked assignment index as a tie-breaker.
   ----------------------------------------------------------------------- */
function toggleGamePlanPlayFlag(arg) {
  const ref = _gpParseBoxPlayArg(arg);
  if (!ref || !ref.boxId || !ref.sig || !ref.flag) return;
  const ok = _gpToggleFlag(ref.boxId, ref.sig, ref.flag, ref.rawIdx);
  if (!ok) return;
  requestRenderGamePlan();
  showToast(ref.flag === "wb" ? "Wristband flag toggled" : "JV flag toggled", {
    duration: 1200,
  });
}

async function sendGamePlanToWristbandCard() {
  if (typeof getGamePlanFlaggedPlays !== "function") return;
  const flagged = getGamePlanFlaggedPlays("wb");
  if (!flagged.length) {
    showToast("Tap 📋 on plays in the game plan to mark them for the wristband first.", {
      duration: 3500, type: "warning",
    });
    return;
  }
  if (typeof wristbandCards === "undefined" || !Array.isArray(wristbandCards)) {
    showToast("Wristband module not ready yet.", { type: "error" });
    return;
  }
  if (wristbandCards.length >= MAX_CARDS) {
    showToast(`Maximum ${MAX_CARDS} wristband cards reached. Remove one first.`, {
      duration: 3500, type: "error",
    });
    return;
  }
  const cellsPerCard = getActiveWristbandCellCount();
  if (flagged.length > cellsPerCard) {
    const ok = await showConfirm(
      `You marked ${flagged.length} plays but a wristband card holds ${cellsPerCard}. ` +
      `Continue and use the first ${cellsPerCard}?`,
      { title: "Trim to fit", icon: "📋", confirmText: "Continue", cancelText: "Cancel" },
    );
    if (!ok) return;
  }
  const gw = (typeof getGameWeek === "function") ? getGameWeek() : null;
  const opp = gw && gw.opponentName ? gw.opponentName : "";
  const cardName = opp ? `vs ${opp} (Game Plan)` : "Game Plan";
  const data = Array(CELLS_PER_CARD).fill(null);
  flagged.slice(0, cellsPerCard).forEach((p, i) => {
    const copy = { ...p };
    delete copy._gpFlags;
    data[i] = copy;
  });
  if (typeof mutateWristbandState === "function") {
    mutateWristbandState(() => {
      wristbandCards.push({ name: cardName, data, cardColor: "#cce5ff" });
      currentCardIndex = wristbandCards.length - 1;
    });
  } else {
    wristbandCards.push({ name: cardName, data, cardColor: "#cce5ff" });
    currentCardIndex = wristbandCards.length - 1;
    if (typeof refreshWristbandCardView === "function") {
      refreshWristbandCardView({ updateCardColorPicker: true });
    }
  }
  showToast(`Created wristband card "${cardName}" with ${Math.min(flagged.length, cellsPerCard)} plays.`, {
    duration: 3500, type: "success",
  });
  if (typeof confirmWristbandHandoffPersistence === "function") {
    await confirmWristbandHandoffPersistence(
      `Created wristband card "${cardName}" from ${Math.min(flagged.length, cellsPerCard)} Game Plan play${Math.min(flagged.length, cellsPerCard) === 1 ? "" : "s"}.`,
    );
  }
  if (typeof showTab === "function") showTab("wristband");
  // Offer to apply current wristband sort criteria so the new card reads top-down nicely.
  if (
    typeof wbSortCriteria !== "undefined" &&
    Array.isArray(wbSortCriteria) &&
    wbSortCriteria.length > 0 &&
    typeof applyWristbandSort === "function"
  ) {
    setTimeout(async () => {
      const sortNow = await showConfirm(
        "Apply your current wristband sort to the new card?",
        { title: "Sort Wristband", icon: "🔤", confirmText: "Sort", cancelText: "Skip" },
      );
      if (sortNow) applyWristbandSort();
    }, 250);
  }
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
  requestRenderGamePlan();
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
  requestRenderGamePlan();
  showToast("Game plan cleared", { type: "success" });
}

function _gpBoardHasResettableSetup(board) {
  if (!board || typeof board !== "object") return false;
  return (
    (Array.isArray(board.customBoxes) && board.customBoxes.length > 0) ||
    (board.targets && Object.keys(board.targets).length > 0) ||
    (board.notes && Object.keys(board.notes).length > 0) ||
    (board.sort && Object.keys(board.sort).length > 0) ||
    (Array.isArray(board.hiddenBoxes) && board.hiddenBoxes.length > 0) ||
    (Array.isArray(board.boxOrder) && board.boxOrder.length > 0) ||
    (board.boxLabels && Object.keys(board.boxLabels).length > 0) ||
    (board.boxMeta && Object.keys(board.boxMeta).length > 0) ||
    Boolean(board.wristbandAutoBoxId) ||
    Boolean(board.loadedWristband)
  );
}

async function resetCurrentGamePlan() {
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw?.opponentName || "";
  const key = _gpActiveOpponentKey();
  const boards = _gpLoadBoards();
  const existingBoard = boards[key] || null;
  const draftedCount = existingBoard ? _gpAllAssignedSigs(existingBoard).size : 0;
  const hasBoardSetup = _gpBoardHasResettableSetup(existingBoard);
  const taggedCount =
    opponent && typeof getGamePlanCount === "function"
      ? getGamePlanCount(opponent)
      : 0;

  if (!opponent && draftedCount === 0 && !hasBoardSetup) {
    showToast("Select an opponent on the Dashboard first.", {
      duration: 3000,
      type: "warning",
    });
    return;
  }
  if (opponent && draftedCount === 0 && taggedCount === 0 && !hasBoardSetup) {
    showToast(`No current game plan selections for ${opponent}.`, {
      duration: 3000,
      type: "info",
    });
    return;
  }

  const label = opponent ? `vs ${opponent}` : "the unassigned board";
  const message =
    `Start from scratch for <strong>${escapeHtml(label)}</strong>? ` +
    `This removes ${taggedCount} Playbook selection${taggedCount === 1 ? "" : "s"} ` +
    `and resets ${draftedCount} drafted board play${draftedCount === 1 ? "" : "s"}, ` +
    "custom boxes, notes, targets, and flags.";
  const ok = await showConfirm(
    message,
    {
      title: "Reset Game Plan",
      icon: "🗑️",
      confirmText: "Reset",
      danger: true,
    },
  );
  if (!ok) return;

  const latestBoards = _gpLoadBoards();
  delete latestBoards[key];
  _gpSaveBoards(latestBoards);
  if (opponent && typeof clearGamePlanTagsForOpponent === "function") {
    clearGamePlanTagsForOpponent(opponent);
  }
  _gpSelected.clear();

  [
    "pbGamePlanFilter",
    "pbJvFilter",
    "scriptGamePlanFilter",
    "scriptJvFilter",
    "csPickerGamePlanFilter",
    "csPickerJvFilter",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });

  requestRenderGamePlan();
  if (typeof filterPlays === "function") filterPlays();
  else if (typeof renderPlaybook === "function") renderPlaybook();
  if (typeof renderAvailablePlays === "function") renderAvailablePlays();
  if (typeof populateCallSheetPlayList === "function") populateCallSheetPlayList();
  if (typeof requestRenderDashboard === "function") requestRenderDashboard();

  showToast(`Reset game plan ${label}`, { type: "success" });
}

/* -------------------------------------------------------------------------
   Library selection + filters
   ------------------------------------------------------------------------- */

function toggleGamePlanLibrarySelect(sig) {
  if (!sig) return;
  if (_gpSelected.has(sig)) _gpSelected.delete(sig);
  else _gpSelected.add(sig);
  // Light re-render of just the row classes — easier to re-render whole list
  requestRenderGamePlan();
}

function updateGamePlanFilter(field, valueOrEvent) {
  if (!field) return;
  if (field === "search" && typeof rememberGamePlanLibrarySearchFocus === "function") {
    rememberGamePlanLibrarySearchFocus();
  }
  const booleanFields = typeof GP_BOOLEAN_FILTER_FIELDS !== "undefined"
    ? GP_BOOLEAN_FILTER_FIELDS
    : new Set(["hideAssigned", "onlyOpponentTagged", "filterBoxes"]);
  if (booleanFields.has(field)) {
    if (valueOrEvent && valueOrEvent.target) {
      _gpFilters[field] = !!valueOrEvent.target.checked;
    } else {
      _gpFilters[field] = !!valueOrEvent;
    }
  } else {
    _gpFilters[field] = valueOrEvent || "";
  }
  const debouncedFields = typeof GP_DEBOUNCED_FILTER_FIELDS !== "undefined"
    ? GP_DEBOUNCED_FILTER_FIELDS
    : new Set(["search"]);
  // Leave enough time for a complete search entry before rebuilding the
  // library. The previous 90ms cycle interrupted normal typing on touch.
  requestRenderGamePlan({ debounceMs: debouncedFields.has(field) ? 220 : 0 });
}

function updateGamePlanMultiFilter(field, valueOrEvent) {
  if (!field || !valueOrEvent || !valueOrEvent.target) return;
  const value = String(valueOrEvent.target.dataset.value || "").trim();
  if (!value) return;
  const selected = new Set(
    typeof _gpFilterValueList === "function"
      ? _gpFilterValueList(_gpFilters[field])
      : [],
  );
  if (valueOrEvent.target.checked) selected.add(value);
  else selected.delete(value);
  _gpFilters[field] = [...selected];
  _gpOpenMultiFilter = field;
  requestRenderGamePlan();
}

function clearGamePlanMultiFilter(field) {
  if (!field || !(field in _gpFilters)) return;
  _gpFilters[field] = [];
  _gpOpenMultiFilter = field;
  requestRenderGamePlan();
}

function toggleGamePlanMultiFilterMenu(field) {
  if (!field) return;
  _gpOpenMultiFilter = _gpOpenMultiFilter === field ? "" : field;
  requestRenderGamePlan();
}

function clearGamePlanFilters() {
  _gpFilters = {
    search: "", type: [], formation: "", personnel: [],
    basePlay: "", tempo: "",
    preferredDown: "", preferredDistance: "",
    preferredSituation: "", preferredFieldPosition: "", preferredHash: "",
    formTag1: "", formTag2: "", under: "", back: "",
    shift: "", motion: "", protection: "", lineCall: "",
    playName: "", playTag1: "", playTag2: "", oneWord: "",
    practiceFront: "", practiceDefense: "", practiceCoverage: "",
    practiceBlitz: "", practiceStunt: "",
    keyPlayer: "", keyPlayerName: "", constraint: "", hitChart: "",
    deadVs: "", opponent: "", notes: "",
    onlyOpponentTagged: false, hideAssigned: false, filterBoxes: false,
    density: _gpFilters.density || "comfortable", showProgress: true,
    goodVsMan: false, goodVsBear: false, goodVsOkie: false,
    showAdvanced: _gpFilters.showAdvanced || false,
    spotlight: null,
  };
  _gpOpenMultiFilter = "";
  _gpSelected.clear();
  requestRenderGamePlan();
}

function toggleGamePlanMatchupFilter(field) {
  if (!field) return;
  if (!(field in _gpFilters)) return;
  _gpFilters[field] = !_gpFilters[field];
  requestRenderGamePlan();
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
  requestRenderGamePlan();
}

/* -------------------------------------------------------------------------
   Variety stats modal
   ------------------------------------------------------------------------- */

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
  requestRenderGamePlan();
}

function expandAllGamePlanBoxes() {
  _gpUpdateBoard((board) => { board.collapsed = []; });
  requestRenderGamePlan();
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
  requestRenderGamePlan();
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
  requestRenderGamePlan();
}

function cycleGamePlanDensity() {
  const order = ["comfortable", "compact", "detail"];
  const idx = order.indexOf(_gpFilters.density || "comfortable");
  _gpFilters.density = order[(idx + 1) % order.length];
  requestRenderGamePlan();
  showToast(`Density: ${_gpFilters.density}`, { duration: 1200 });
}

async function moveGamePlanPlay(combined) {
  const ref = _gpParseBoxPlayArg(combined);
  if (!ref || !ref.boxId || !ref.sig) return;
  const fromBoxId = ref.boxId;
  const board = _gpEnsureBoard();
  const choices = _gpGetBoardBoxes(board, { includeHolding: true })
    .filter((b) => b.id !== fromBoxId)
    .map((b) => ({ value: b.id, label: b.label }));
  if (choices.length === 0) return;
  const dest = await showListPicker(
    "Move this play to which box?",
    choices,
    { title: "Move Play", icon: "↔" },
  );
  if (!dest) return;
  _gpMoveBetweenBoxes(fromBoxId, dest, ref.sig, ref.rawIdx);
}
function autoRouteHoldingBox() {
  const board = _gpEnsureBoard();
  const holding = (board.assignments[GP_HOLDING_ID] || []).slice();
  if (holding.length === 0) {
    showToast("Holding is empty.", { duration: 1500 });
    return;
  }
  let routed = 0;
  let leftBehind = 0;
  _gpUpdateBoard((b) => {
    const stillHolding = [];
    holding.forEach((play) => {
      const destination = _gpAutoDestinationForPlay(play, b);
      if (destination !== GP_HOLDING_ID) {
        if (!Array.isArray(b.assignments[destination])) {
          b.assignments[destination] = [];
        }
        const sig = _gpPlaySignature(play);
        const exists = b.assignments[destination]
          .some((p) => _gpPlaySignature(p) === sig);
        if (!exists) b.assignments[destination].push(play);
        routed += 1;
      } else {
        stillHolding.push(play);
        leftBehind += 1;
      }
    });
    b.assignments[GP_HOLDING_ID] = stillHolding;
  });
  requestRenderGamePlan();
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
  requestRenderGamePlan();
}

function gpClearLibrarySelection() {
  _gpSelected.clear();
  requestRenderGamePlan();
}

function gpInvertVisibleSelection() {
  const board = _gpEnsureBoard();
  _gpFilteredLibrary(board).forEach((p) => {
    const sig = _gpPlaySignature(p);
    if (_gpSelected.has(sig)) _gpSelected.delete(sig);
    else _gpSelected.add(sig);
  });
  requestRenderGamePlan();
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
   Per-box matching rules (criteria + Call Sheet target)
   ------------------------------------------------------------------------- */

function _gpFormatBoxMetaSummary(meta) {
  const parts = [];
  if (!meta || !meta.criteria) return "";
  const c = meta.criteria;
  if (c.down.length) parts.push(`Down ${c.down.join("/")}`);
  if (c.distance.length) parts.push(c.distance.join("/"));
  if (c.situation.length) parts.push(c.situation.join("/"));
  if (c.fieldPosition.length) parts.push(c.fieldPosition.join("/"));
  if (c.type.length) parts.push(c.type.join("/"));
  if (c.coverage.length) parts.push(c.coverage.join("/"));
  if (c.keyPlayer && c.keyPlayer.trim()) parts.push(`KP: ${c.keyPlayer.trim()}`);
  if (c.keyword && c.keyword.trim()) parts.push(`Text: ${c.keyword.trim()}`);
  if (meta.callSheetCategoryId) {
    const cat = (typeof CALLSHEET_CATEGORIES !== "undefined")
      ? CALLSHEET_CATEGORIES.find((x) => x.id === meta.callSheetCategoryId) : null;
    const dn = cat && typeof getCategoryDisplayName === "function"
      ? getCategoryDisplayName(cat) : meta.callSheetCategoryId;
    parts.push(`→ ${dn}`);
  }
  return parts.join(", ") || "(none)";
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
  requestRenderGamePlan();
}

function setGamePlanBoxSort(boxId, mode) {
  if (!boxId) return;
  _gpUpdateBoard((b) => {
    if (!b.sort) b.sort = {};
    if (!mode || mode === "manual") delete b.sort[boxId];
    else b.sort[boxId] = mode;
  });
  requestRenderGamePlan();
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
  const ref = _gpParseBoxPlayArg(combined);
  if (!ref || !ref.boxId || !ref.sig) return;
  _gpUpdateBoard((board) => {
    const arr = board.assignments[ref.boxId] || [];
    const idx = _gpFindBoxPlayIndex(arr, ref.sig, ref.rawIdx);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= arr.length) return;
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    if (!board.sort) board.sort = {};
    board.sort[ref.boxId] = "manual";
  });
  requestRenderGamePlan();
}

async function openGamePlanPersonnelVariant(combined) {
  const ref = _gpParseBoxPlayArg(combined);
  if (!ref?.boxId || !ref.sig) return;
  const board = _gpEnsureBoard();
  const list = board.assignments?.[ref.boxId] || [];
  const index = _gpFindBoxPlayIndex(list, ref.sig, ref.rawIdx);
  const boardPlay = index >= 0 ? list[index] : null;
  if (!boardPlay) return;
  const source = _gpFindPlayBySig(ref.sig) || boardPlay;
  const options = typeof getPlayPersonnelOptions === "function" ? getPlayPersonnelOptions(source) : [];
  if (options.length < 2) {
    showToast("Add an approved personnel variant in Playbook first.", { type: "info" });
    return;
  }
  const current = String(boardPlay.personnelVariantId || "base").trim() || "base";
  const selected = await showListPicker(
    "Choose the personnel version for this Game Plan call. The master play stays unchanged.",
    options.map((option) => ({
      value: option.id,
      label: `${getPersonnelEmoji(option.personnel)} ${option.personnel}${option.isBase ? " · Primary" : ""}`,
    })),
    { title: "Game Plan Personnel", icon: "👥", selectedValue: current },
  );
  if (!selected) return;
  const selectedIdentity = `${ref.sig}::personnel=${String(selected || "base")}`;
  const hasExactDuplicate = list.some((candidate, candidateIndex) =>
    candidateIndex !== index && _gpAssignmentIdentity(candidate) === selectedIdentity,
  );
  if (hasExactDuplicate) {
    showToast("That personnel version is already in this box. Choose a different approved variant.", {
      type: "warning",
      duration: 3500,
    });
    return;
  }
  _gpUpdateBoard((nextBoard) => {
    const nextList = nextBoard.assignments?.[ref.boxId] || [];
    const nextIndex = _gpFindBoxPlayIndex(nextList, ref.sig, ref.rawIdx);
    if (nextIndex < 0) return;
    if (selected === "base") delete nextList[nextIndex].personnelVariantId;
    else nextList[nextIndex].personnelVariantId = selected;
  });
  requestRenderGamePlan();
  const choice = options.find((option) => option.id === selected);
  showToast(selected === "base" ? "Using primary personnel for this Game Plan call." : `Using ${choice?.personnel || "selected"} for this Game Plan call.`, { type: "success" });
}

async function openGamePlanDuplicatePersonnelVariant(boxId, sig) {
  if (!boxId || !sig) return;
  const board = _gpEnsureBoard();
  const list = board.assignments?.[boxId] || [];
  const source = _gpFindPlayBySig(sig);
  if (!source) return;
  const options = typeof getPlayPersonnelOptions === "function" ? getPlayPersonnelOptions(source) : [];
  const usedVariantIds = new Set(list
    .filter((play) => _gpPlaySignature(play) === sig)
    .map((play) => _gpAssignmentVariantId(play)));
  const available = options.filter((option) => !usedVariantIds.has(String(option.id || "base")));
  if (!available.length) {
    showToast("Every approved personnel version of this call is already in this box.", {
      type: "info",
      duration: 3500,
    });
    return;
  }
  const selected = await showListPicker(
    "The primary call is already here. Choose a different approved personnel version to add alongside it.",
    available.map((option) => ({
      value: option.id,
      label: `${getPersonnelEmoji(option.personnel)} ${option.personnel}${option.isBase ? " · Primary" : " · Variant"}`,
    })),
    { title: "Add Personnel Variant", icon: "👥" },
  );
  if (!selected) return;
  _gpUpdateBoard((nextBoard) => {
    if (!Array.isArray(nextBoard.assignments?.[boxId])) return;
    const nextList = nextBoard.assignments[boxId];
    const chosenIdentity = `${sig}::personnel=${String(selected || "base")}`;
    if (nextList.some((play) => _gpAssignmentIdentity(play) === chosenIdentity)) return;
    const copy = typeof copyPlayWithSourceIdentity === "function"
      ? copyPlayWithSourceIdentity(source)
      : { ...source };
    if (selected === "base") delete copy.personnelVariantId;
    else copy.personnelVariantId = selected;
    nextList.push(copy);
  });
  requestRenderGamePlan();
  const choice = available.find((option) => option.id === selected);
  showToast(`Added ${choice?.personnel || "selected"} version alongside the primary call.`, {
    type: "success",
  });
}

function addAllGamePlanPersonnelVariants(combined) {
  const ref = _gpParseBoxPlayArg(combined);
  if (!ref?.boxId || !ref.sig) return;
  const board = _gpEnsureBoard();
  const list = board.assignments?.[ref.boxId] || [];
  const index = _gpFindBoxPlayIndex(list, ref.sig, ref.rawIdx);
  const current = index >= 0 ? list[index] : null;
  const source = _gpFindPlayBySig(ref.sig) || current;
  if (!source) return;
  const options = typeof getPlayPersonnelOptions === "function" ? getPlayPersonnelOptions(source) : [];
  if (options.length < 2) {
    showToast("This call has no additional approved personnel variants yet.", {
      type: "info",
      duration: 3000,
    });
    return;
  }
  const usedVariantIds = new Set(list
    .filter((play) => _gpPlaySignature(play) === ref.sig)
    .map((play) => _gpAssignmentVariantId(play)));
  const additions = options.filter((option) => !usedVariantIds.has(String(option.id || "base")));
  if (!additions.length) {
    showToast("All approved personnel versions of this call are already in this box.", {
      type: "info",
      duration: 3000,
    });
    return;
  }
  _gpUpdateBoard((nextBoard) => {
    const nextList = nextBoard.assignments?.[ref.boxId];
    if (!Array.isArray(nextList)) return;
    additions.forEach((option) => {
      const identity = `${ref.sig}::personnel=${String(option.id || "base")}`;
      if (nextList.some((play) => _gpAssignmentIdentity(play) === identity)) return;
      const copy = typeof copyPlayWithSourceIdentity === "function"
        ? copyPlayWithSourceIdentity(source)
        : { ...source };
      if (current?._gpFlags) copy._gpFlags = { ...current._gpFlags };
      if (option.id === "base") delete copy.personnelVariantId;
      else copy.personnelVariantId = option.id;
      nextList.push(copy);
    });
  });
  requestRenderGamePlan();
  showToast(`Added ${additions.length} approved personnel version${additions.length === 1 ? "" : "s"} to this box.`, {
    type: "success",
  });
}
/* -------------------------------------------------------------------------
   Right-click / long-press context menu on a box play
   ------------------------------------------------------------------------- */

function _gpOpenPlayContextMenu(e, boxId, sig, rawIdx) {
  if (!boxId || !sig) return;
  const board = _gpEnsureBoard();
  const list = board.assignments[boxId] || [];
  const idx = _gpFindBoxPlayIndex(list, sig, rawIdx);
  const play = idx >= 0 ? list[idx] : _gpFindPlayBySig(sig);
  if (!play) return;
  const playArg = _gpBuildBoxPlayArg(boxId, sig, idx >= 0 ? idx : rawIdx);
  const items = [];
  items.push({
    label: "↔ Move to box…",
    onClick: () => moveGamePlanPlay(playArg),
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
      onClick: () => _gpMoveBetweenBoxes(boxId, GP_HOLDING_ID, sig, idx >= 0 ? idx : rawIdx),
    });
  }
  items.push({ separator: true });
  items.push({
    label: "▲ Move up",
    onClick: () => moveGamePlanPlayUp(playArg),
  });
  items.push({
    label: "▼ Move down",
    onClick: () => moveGamePlanPlayDown(playArg),
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
    onClick: () => removeFromGamePlanBox(playArg),
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
      requestRenderGamePlan();
      showToast("Box order saved", { type: "success" });
    },
    onClear: () => {
      _gpUpdateBoard((b) => { b.boxOrder = []; });
      requestRenderGamePlan();
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
  requestRenderGamePlan();
}

async function hideGamePlanBox(boxId) {
  if (!boxId || boxId === GP_HOLDING_ID) return;
  _gpUpdateBoard((b) => {
    b.hiddenBoxes = b.hiddenBoxes || [];
    if (!b.hiddenBoxes.includes(boxId)) b.hiddenBoxes.push(boxId);
  });
  requestRenderGamePlan();
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
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="gpManageBoxesTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">👁️</span>
          <h3 class="custom-modal-title" id="gpManageBoxesTitle">Manage Box Visibility</h3>
        </div>
        <div class="custom-modal-body">
          <p class="gp-mgb-help">Uncheck boxes to hide them from the board. Hidden boxes keep their plays — they're just out of sight.</p>
          <div class="gp-mgb-list">${rowsHtml}</div>
          <div class="gp-mgb-bulk">
            <button type="button" class="btn btn-sm" id="gpMgbAll">☑ Show All</button>
            <button type="button" class="btn btn-sm" id="gpMgbNone">▢ Hide All Defaults</button>
          </div>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel" id="gpMgbCancel">Cancel</button>
          <button type="button" class="btn btn-primary custom-modal-btn" id="gpMgbSave">Save</button>
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
      requestRenderGamePlan();
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
  requestRenderGamePlan();
}
