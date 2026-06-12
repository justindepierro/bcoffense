/* =========================================================================
   Game Plan — push to call sheet, push to script, dashboard send, compare
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

/* -------------------------------------------------------------------------
   Push to call sheet
   ------------------------------------------------------------------------- */

/**
 * Build the set of call sheet category ids a single play should fan-out to.
 * - findMatchingCategories() handles all auto categories (front-page situations,
 *   down/distance, field position, back-page play types).
 * - Player buckets are added later as a group so Key Player 1 can be
 *   prioritized before Key Player 2 backfill.
 * - Source box id is included as a fallback so the box's natural type
 *   bucket gets filled even when the play lacks preferred fields.
 */
function _gpComputeCallSheetTargets(play, sourceBoxId) {
  const targets = new Set();
  // 1) Auto categories (front + back via preferred fields and play type)
  if (typeof findMatchingCategories === "function") {
    try {
      findMatchingCategories(play).forEach((id) => targets.add(id));
    } catch (_) { /* ignore */ }
  }
  // 2) Box-meta override: explicit Push-to-Call-Sheet category set on this box
  if (sourceBoxId) {
    try {
      const board = _gpEnsureBoard();
      const meta = _gpGetBoxMeta(board, sourceBoxId);
      if (meta.callSheetCategoryId) targets.add(meta.callSheetCategoryId);
    } catch (_) { /* ignore */ }
  }
  // 3) Source box → type bucket fallback (always include if box maps to one)
  const fb = sourceBoxId ? GP_BOX_TO_CALLSHEET[sourceBoxId] : null;
  if (fb) targets.add(fb);
  return targets;
}

/**
 * Push a single play entry into a call sheet category, deduped, and
 * routed to left/right by preferredHash (alternating when unspecified).
 * Returns true if pushed, false if it was a duplicate.
 */
function _gpPushPlayIntoCategory(play, categoryId) {
  if (!callSheet[categoryId]) callSheet[categoryId] = { left: [], right: [] };
  const bucket = callSheet[categoryId];
  const exists =
    (bucket.left || []).some((x) => playsMatch(x, play)) ||
    (bucket.right || []).some((x) => playsMatch(x, play));
  if (exists) return false;
  const wb =
    typeof getWristbandNumberForPlay === "function"
      ? getWristbandNumberForPlay(play)
      : null;
  const entry = {
    ...play,
    playType: play.type,
    wristbandNumber: wb,
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
  };
  const hash = (play.preferredHash || "").toLowerCase().trim();
  if (hash === "left" || hash === "l") {
    bucket.left.push(entry);
  } else if (hash === "right" || hash === "r") {
    bucket.right.push(entry);
  } else if ((bucket.left || []).length <= (bucket.right || []).length) {
    bucket.left.push(entry);
  } else {
    bucket.right.push(entry);
  }
  return true;
}

async function pushGamePlanToCallSheet() {
  if (typeof callSheet !== "object" || !callSheet) {
    showToast("Call sheet isn't ready yet.", { type: "error" });
    return;
  }
  const board = _gpEnsureBoard();
  // Collect drafted plays from every box (default + custom), excluding Holding.
  const sourceBoxes = [
    ...GP_DEFAULT_BOXES,
    ...((board.customBoxes || []).filter((b) => b && b.id !== GP_HOLDING_ID)),
  ];
  /** @type {Array<{play:object, sourceBoxId:string}>} */
  const allEntries = [];
  sourceBoxes.forEach((b) => {
    const list = board.assignments[b.id] || [];
    list.forEach((p) => allEntries.push({ play: p, sourceBoxId: b.id }));
  });
  if (allEntries.length === 0) {
    showToast("No drafted plays to push.", { type: "warning" });
    return;
  }

  // Fan-out: per play, compute target category set
  const playerTargets =
    typeof buildPlayerCategoryAutoFillTargets === "function"
      ? buildPlayerCategoryAutoFillTargets(allEntries, { getPlay: (entry) => entry.play })
      : [];
  const fanOut = allEntries.map(({ play, sourceBoxId }, index) => {
    const targets = _gpComputeCallSheetTargets(play, sourceBoxId);
    (playerTargets[index] || new Set()).forEach((catId) => targets.add(catId));
    return { play, sourceBoxId, targets };
  });

  // Tally targets per category
  const byCat = {};
  fanOut.forEach(({ targets }) => {
    targets.forEach((id) => {
      byCat[id] = (byCat[id] || 0) + 1;
    });
  });
  const filledCatIds = Object.keys(byCat);
  const filledCount = filledCatIds.length;
  if (filledCount === 0) {
    showToast(
      "Drafted plays don't match any call sheet category. Set Preferred Down/Distance/Situation/Position or Type on those plays.",
      { type: "warning", duration: 4500 },
    );
    return;
  }

  // Build human-readable breakdown ordered by call sheet category order
  const orderIds = CALLSHEET_CATEGORIES.map((c) => c.id);
  const summaryItems = orderIds
    .filter((id) => byCat[id])
    .map((id) => {
      const cat = CALLSHEET_CATEGORIES.find((c) => c.id === id);
      const dn = cat
        ? typeof getCategoryDisplayName === "function"
          ? getCategoryDisplayName(cat)
          : cat.name
        : id;
      return `<li>${escapeHtml(dn)}: <strong>${byCat[id]}</strong></li>`;
    })
    .join("");

  const choice = await showChoice(
    `<p>Push <strong>${allEntries.length}</strong> drafted play${allEntries.length === 1 ? "" : "s"} into <strong>${filledCount}</strong> call sheet categor${filledCount === 1 ? "y" : "ies"}?</p>
     <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-bottom:var(--space-xs);">Plays fan-out to every matching bucket — front-page situations (down, distance, field position), back-page play types, and player buckets matched by Key Player 1 first with Key Player 2 backfill up to six.</p>
     <details style="font-size:var(--font-size-sm);"><summary style="cursor:pointer;color:var(--color-text-muted);">Show breakdown</summary><ul style="margin:var(--space-xs) 0 0 var(--space-md);columns:2;-webkit-columns:2;">${summaryItems}</ul></details>`,
    {
      title: "Push to Call Sheet",
      icon: "➡️",
      option1: "Append to existing",
      option2: "Replace target categories",
    },
  );
  if (!choice) return;
  const replace = choice === "option2";

  // If replace: only clear categories we're about to fill
  if (replace) {
    filledCatIds.forEach((id) => {
      if (!callSheet[id]) callSheet[id] = { left: [], right: [] };
      callSheet[id].left = [];
      callSheet[id].right = [];
    });
  }

  let pushed = 0;
  fanOut.forEach(({ play, targets }) => {
    targets.forEach((id) => {
      if (_gpPushPlayIntoCategory(play, id)) pushed += 1;
    });
  });

  if (typeof saveCallSheet === "function") saveCallSheet();
  if (typeof scheduleRenderCallSheet === "function") {
    scheduleRenderCallSheet();
  } else if (typeof renderCallSheet === "function") {
    renderCallSheet();
  }
  showToast(
    `Pushed ${pushed} entr${pushed === 1 ? "y" : "ies"} into ${filledCount} categor${filledCount === 1 ? "y" : "ies"}`,
    { type: "success", duration: 3500 },
  );
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

  // Group tagged plays by destination box id
  const byBox = {};
  let alreadyAssigned = 0;
  let restricted = 0;
  let routedByCriteria = 0;
  tagged.forEach((play) => {
    if (!_gpPlayAllowedOnBoard(play, board)) {
      restricted += 1;
      return;
    }
    const sig = _gpPlaySignature(play);
    if (assignedSigs.has(sig)) { alreadyAssigned += 1; return; }
    const criteriaDestination = _gpMatchingBoardBoxForPlay(play, board);
    const dest = criteriaDestination || _gpAutoDestinationForPlay(play, board);
    if (criteriaDestination) routedByCriteria += 1;
    if (!byBox[dest]) byBox[dest] = [];
    byBox[dest].push(sig);
  });

  const totalToAdd = Object.values(byBox).reduce((n, arr) => n + arr.length, 0);
  if (totalToAdd === 0) {
    showToast(
      restricted > 0
        ? "This game plan template accepts passing play types only."
        : `All ${tagged.length} tagged play${tagged.length === 1 ? "" : "s"} already on the board.`,
      { type: restricted > 0 ? "warning" : "info" },
    );
    return;
  }

  const summaryLines = Object.entries(byBox)
    .map(([boxId, sigs]) => {
      const label = _gpBoxLabel(boxId);
      return `• ${label}: ${sigs.length}`;
    })
    .join("\n");
  const ok = await showConfirm(
    `Send ${totalToAdd} tagged play${totalToAdd === 1 ? "" : "s"} for ${opponent} into the boxes?\n\n${summaryLines}${routedByCriteria > 0 ? `\n\n🧩 ${routedByCriteria} routed by box matching rules.` : ""}${alreadyAssigned > 0 ? `\n\n(${alreadyAssigned} already on the board, will be skipped.)` : ""}${restricted > 0 ? `\n\n(${restricted} non-passing play${restricted === 1 ? "" : "s"} will be skipped.)` : ""}`,
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
        if (!play || !_gpPlayAllowedOnBoard(play, b)) return;
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
   Per-box push to call sheet
   ------------------------------------------------------------------------- */

async function pushGamePlanBoxToCallSheet(boxId) {
  if (!boxId) return;
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

  // Fan-out: per play, compute target category set
  const playerTargets =
    typeof buildPlayerCategoryAutoFillTargets === "function"
      ? buildPlayerCategoryAutoFillTargets(list)
      : [];
  const fanOut = list.map((play, index) => {
    const targets = _gpComputeCallSheetTargets(play, boxId);
    (playerTargets[index] || new Set()).forEach((catId) => targets.add(catId));
    return { play, targets };
  });
  const byCat = {};
  fanOut.forEach(({ targets }) => {
    targets.forEach((id) => {
      byCat[id] = (byCat[id] || 0) + 1;
    });
  });
  const filledCatIds = Object.keys(byCat);
  if (filledCatIds.length === 0) {
    showToast(
      "Plays in this box don't match any call sheet category.",
      { type: "warning" },
    );
    return;
  }
  const orderIds = CALLSHEET_CATEGORIES.map((c) => c.id);
  const summaryItems = orderIds
    .filter((id) => byCat[id])
    .map((id) => {
      const cat = CALLSHEET_CATEGORIES.find((c) => c.id === id);
      const dn = cat
        ? typeof getCategoryDisplayName === "function"
          ? getCategoryDisplayName(cat)
          : cat.name
        : id;
      return `<li>${escapeHtml(dn)}: <strong>${byCat[id]}</strong></li>`;
    })
    .join("");

  const choice = await showChoice(
    `<p>Push <strong>${list.length}</strong> play${list.length === 1 ? "" : "s"} from <strong>${escapeHtml(boxId)}</strong> into <strong>${filledCatIds.length}</strong> call sheet categor${filledCatIds.length === 1 ? "y" : "ies"}?</p>
     <details style="font-size:var(--font-size-sm);"><summary style="cursor:pointer;color:var(--color-text-muted);">Show breakdown</summary><ul style="margin:var(--space-xs) 0 0 var(--space-md);">${summaryItems}</ul></details>`,
    {
      title: "Push Box to Call Sheet",
      icon: "➡️",
      option1: "Append",
      option2: "Replace",
    },
  );
  if (!choice) return;
  const replace = choice === "option2";

  if (replace) {
    filledCatIds.forEach((id) => {
      if (!callSheet[id]) callSheet[id] = { left: [], right: [] };
      callSheet[id].left = [];
      callSheet[id].right = [];
    });
  }

  let pushed = 0;
  fanOut.forEach(({ play, targets }) => {
    targets.forEach((id) => {
      if (_gpPushPlayIntoCategory(play, id)) pushed += 1;
    });
  });

  if (typeof saveCallSheet === "function") saveCallSheet();
  if (typeof scheduleRenderCallSheet === "function") {
    scheduleRenderCallSheet();
  } else if (typeof renderCallSheet === "function") {
    renderCallSheet();
  }
  showToast(
    `Pushed ${pushed} entr${pushed === 1 ? "y" : "ies"} into ${filledCatIds.length} categor${filledCatIds.length === 1 ? "y" : "ies"}`,
    { type: "success" },
  );
}
/* -------------------------------------------------------------------------
   Push to Practice Script
   ------------------------------------------------------------------------- */

async function pushGamePlanToScript() {
  if (typeof script === "undefined" || !Array.isArray(script)) {
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
   Load saved game plan snapshot → Playbook tag filter
   Lets coaches pick a named saved plan and apply it as game plan tags so
   the Playbook "Game Plan Only" filter shows exactly those plays.
   ------------------------------------------------------------------------- */

async function loadGamePlanSnapshotToPlaybook() {
  const gw = typeof getGameWeek === "function" ? getGameWeek() : {};
  const opponentKey = (gw && gw.opponentName) ? gw.opponentName : "__unassigned__";

  if (!gw.opponentName) {
    const ok = await showConfirm(
      "No active opponent is set. Set one in the Dashboard (Game Week) to link this plan to an opponent.\n\nContinue loading anyway?",
      { title: "No Opponent Set", icon: "⚠️" }
    );
    if (!ok) return;
  }

  const all = typeof _gpLoadAllSnapshots === "function" ? _gpLoadAllSnapshots() : {};
  const snaps = Array.isArray(all[opponentKey]) ? all[opponentKey] : [];

  if (snaps.length === 0) {
    showToast("No saved plans for this opponent. Save one from the Game Plan tab first.", { duration: 4000, type: "info" });
    return;
  }

  const items = snaps.slice().reverse().map((s) => {
    const when = new Date(s.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const total = Object.values(s.board?.assignments || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    return { value: s.id, label: `${s.name} \u2022 ${total} plays \u2022 ${when}` };
  });

  const snapId = await showListPicker(
    "Pick a saved plan to load into the Playbook filter:",
    items,
    { title: "📂 Load Plan into Playbook", icon: "📂" }
  );
  if (!snapId) return;

  const snap = snaps.find((s) => s.id === snapId);
  if (!snap) return;

  const oppLabel = escapeHtml(opponentKey === "__unassigned__" ? "this session" : opponentKey);
  const action = await showChoice(
    `Load \u201c${escapeHtml(snap.name)}\u201d into the Playbook Game Plan filter?`,
    {
      title: "Load Plan",
      icon: "📂",
      option1: `Replace \u2014 clear existing ${oppLabel} tags and use this plan`,
      option2: `Append \u2014 add this plan\u2019s plays to existing tags`,
    }
  );
  if (!action) return;

  // Collect all play signatures from every box in the snapshot
  const assignments = snap.board?.assignments || {};
  const snapSigs = new Set();
  Object.values(assignments).forEach((playList) => {
    if (!Array.isArray(playList)) return;
    playList.forEach((play) => {
      if (play) snapSigs.add(playSignature(play));
    });
  });

  if (snapSigs.size === 0) {
    showToast("That plan has no plays assigned to boxes yet.", { type: "info" });
    return;
  }

  const tags = getGamePlanTags();
  if (action === "option1") {
    tags[opponentKey] = [...snapSigs];
  } else {
    const existing = new Set(Array.isArray(tags[opponentKey]) ? tags[opponentKey] : []);
    snapSigs.forEach((sig) => existing.add(sig));
    tags[opponentKey] = [...existing];
  }
  storageManager.set(STORAGE_KEYS.GAME_PLAN_TAGS, tags);

  // Enable the game plan filter so the user sees the result immediately
  const gpFilter = document.getElementById("pbGamePlanFilter");
  if (gpFilter && !gpFilter.checked) gpFilter.checked = true;
  if (typeof filterPlays === "function") filterPlays();
  if (typeof savePlaybookState === "function") savePlaybookState();

  const verb = action === "option1" ? "Loaded" : "Appended";
  showToast(`${verb} ${snapSigs.size} plays from \u201c${snap.name}\u201d`, { type: "success", duration: 3000 });
}

/* -------------------------------------------------------------------------
   Send active wristband card → game plan boxes
   Reverse direction of sendGamePlanToWristbandCard() in gameplan-actions.js.
   Reads all non-null plays from the current wristband card and lets the
   user auto-route by play type or choose a specific game plan box.
   ------------------------------------------------------------------------- */

async function sendWristbandToGamePlan() {
  if (typeof wristbandCards === "undefined" || !Array.isArray(wristbandCards) || wristbandCards.length === 0) {
    showToast("No wristband card loaded.", { type: "warning" });
    return;
  }
  const cardIdx = typeof currentCardIndex !== "undefined" ? currentCardIndex : 0;
  const card = wristbandCards[cardIdx];
  if (!card) {
    showToast("No active wristband card.", { type: "warning" });
    return;
  }
  const wbPlays = (card.data || []).filter(Boolean);
  if (wbPlays.length === 0) {
    showToast("No plays on this wristband card.", { type: "warning" });
    return;
  }
  const board = _gpEnsureBoard();
  const eligiblePlays = wbPlays.filter(
    (play) => _gpPlayAllowedOnBoard(play, board),
  );
  const restricted = wbPlays.length - eligiblePlays.length;
  if (eligiblePlays.length === 0) {
    showToast("This game plan template accepts passing play types only.", {
      type: "warning",
    });
    return;
  }

  const routeChoice = await showChoice(
    `<p>Send <strong>${eligiblePlays.length}</strong> play${eligiblePlays.length === 1 ? "" : "s"} from <strong>${escapeHtml(card.name || "Card")}</strong> to the game plan?</p>${restricted ? `<p>${restricted} non-passing play${restricted === 1 ? "" : "s"} will be skipped.</p>` : ""}`,
    {
      title: "📋 Send to Game Plan",
      icon: "📋",
      option1: "Auto-route by play type",
      option2: "Pick a box",
    }
  );
  if (!routeChoice) return;

  let added = 0;
  let skipped = restricted;

  if (routeChoice === "option1") {
    const typeMap = {};
    eligiblePlays.forEach((p) => {
      const boxId = _gpAutoDestinationForPlay(p, board);
      if (!typeMap[boxId]) typeMap[boxId] = [];
      typeMap[boxId].push(p);
    });

    _gpUpdateBoard((board) => {
      Object.entries(typeMap).forEach(([boxId, plays]) => {
        if (!Array.isArray(board.assignments[boxId])) board.assignments[boxId] = [];
        const existing = new Set(board.assignments[boxId].map((p) => _gpPlaySignature(p)));
        plays.forEach((p) => {
          const sig = _gpPlaySignature(p);
          if (
            existing.has(sig) ||
            !_gpPlayAllowedOnBoard(p, board)
          ) {
            skipped++;
            return;
          }
          board.assignments[boxId].push({ ...p });
          existing.add(sig);
          added++;
        });
      });
    });
  } else {
    // Pick a specific box
    const items = _gpGetBoardBoxes(board, { includeHolding: true }).map((b) => ({
      value: b.id,
      label: b.label,
    }));
    const choice = await showListPicker("Choose a game plan box:", items, {
      title: "📋 Send to Box",
      icon: "📋",
    });
    if (!choice) return;

    _gpUpdateBoard((board) => {
      if (!Array.isArray(board.assignments[choice])) board.assignments[choice] = [];
      const existing = new Set(board.assignments[choice].map((p) => _gpPlaySignature(p)));
      eligiblePlays.forEach((p) => {
        const sig = _gpPlaySignature(p);
        if (
          existing.has(sig) ||
          !_gpPlayAllowedOnBoard(p, board)
        ) {
          skipped++;
          return;
        }
        board.assignments[choice].push({ ...p });
        existing.add(sig);
        added++;
      });
    });
  }

  if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
  else if (typeof renderGamePlan === "function") renderGamePlan();

  const msg = added > 0
    ? `Sent ${added} play${added === 1 ? "" : "s"} to game plan${skipped ? ` (${skipped} skipped)` : ""}.`
    : `No plays added \u2014 ${skipped} skipped.`;
  showToast(msg, { duration: 3000, type: added > 0 ? "success" : "warning" });
  if (added > 0 && typeof showTab === "function") showTab("gameplan");
}
