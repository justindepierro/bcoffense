/* =========================================================================
   Practice Script — outbound Game Plan and Wristband integrations
   ========================================================================= */

const SCRIPT_WRISTBAND_IDENTITY_FIELDS = [
  "type",
  "personnel",
  "formation",
  "formTag1",
  "formTag2",
  "under",
  "back",
  "shift",
  "motion",
  "protection",
  "lineCall",
  "play",
  "playTag1",
  "playTag2",
  "basePlay",
  "oneWord",
];

function _scriptIntegrationPlaySnapshot(scriptPlay) {
  const playbookPlays = typeof plays !== "undefined" && Array.isArray(plays) ? plays : [];
  const callKey = _scriptIntegrationCallIdentity(scriptPlay);
  const tagKey =
    typeof getPlayIdentityKey === "function"
      ? getPlayIdentityKey(scriptPlay, "tag", { trim: false })
      : "";
  const playbookPlay =
    playbookPlays.find(
      (candidate) =>
        callKey && _scriptIntegrationCallIdentity(candidate) === callKey,
    ) ||
    playbookPlays.find(
      (candidate) =>
        tagKey &&
        getPlayIdentityKey(candidate, "tag", { trim: false }) === tagKey,
    ) ||
    playbookPlays.find(
      (candidate) =>
        tagKey &&
        typeof getPlayCompareKey === "function" &&
        getPlayCompareKey(candidate, "tag") ===
          normalizePlayCompareKey(tagKey),
    ) ||
    playbookPlays.find(
      (candidate) =>
        typeof playsMatch === "function" && playsMatch(candidate, scriptPlay),
    );
  const snapshot = {
    ...(playbookPlay || {}),
    ...scriptPlay,
  };
  if (playbookPlay?.id) {
    snapshot.id = playbookPlay.id;
  } else {
    delete snapshot.id;
  }
  delete snapshot.isSeparator;
  delete snapshot._gpFlags;
  return snapshot;
}

function _getScriptIntegrationSource() {
  const selectedIndices =
    typeof bulkSelectedIndices !== "undefined" && Array.isArray(bulkSelectedIndices)
      ? [...new Set(bulkSelectedIndices)]
        .filter((index) => Number.isInteger(index) && script[index] && !script[index].isSeparator)
        .sort((a, b) => a - b)
      : [];
  const sourcePlays = selectedIndices.length
    ? selectedIndices.map((index) => script[index])
    : script.filter((item) => item && !item.isSeparator);
  return {
    plays: sourcePlays.map(_scriptIntegrationPlaySnapshot),
    selected: selectedIndices.length > 0,
  };
}

function _uniqueScriptIntegrationPlays(sourcePlays, keyForPlay) {
  const seen = new Set();
  const unique = [];
  sourcePlays.forEach((play) => {
    const key = keyForPlay(play);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(play);
  });
  return unique;
}

async function sendScriptToGamePlan() {
  if (
    typeof _gpEnsureBoard !== "function" ||
    typeof _gpUpdateBoard !== "function" ||
    typeof _gpPlaySignature !== "function"
  ) {
    showToast("Game Plan is not ready yet.", { type: "error" });
    return;
  }
  const source = _getScriptIntegrationSource();
  if (!source.plays.length) {
    showToast("Add plays to the Script first.", { type: "warning" });
    return;
  }

  const routeChoice = await showChoice(
    `<p>Send <strong>${source.plays.length}</strong> ${source.selected ? "selected " : ""}Script play${source.plays.length === 1 ? "" : "s"} to the Game Plan?</p>`,
    {
      title: "Send Script to Game Plan",
      icon: "🎯",
      option1: "Auto-route by rules/type",
      option2: "Pick one box",
    },
  );
  if (!routeChoice) return;

  const board = _gpEnsureBoard();
  const allBoxItems = _gpGetBoardBoxes(board, { includeHolding: true })
    .map((box) => ({
      value: box.id,
      label: box.label,
    }));
  let selectedBoxId = null;
  if (routeChoice === "option2") {
    selectedBoxId = await showListPicker("Choose a Game Plan box:", allBoxItems, {
      title: "Send Script to Box",
      icon: "🎯",
    });
    if (!selectedBoxId) return;
  }

  const uniqueSource = _uniqueScriptIntegrationPlays(
    source.plays,
    _scriptIntegrationCallIdentity,
  );
  const assigned = new Set(
    Object.values(board.assignments || {})
      .flat()
      .filter(Boolean)
      .map(_scriptIntegrationCallIdentity),
  );
  const eligibleSource = uniqueSource.filter(
    (play) => _gpPlayAllowedOnBoard(play, board),
  );
  const restricted = uniqueSource.length - eligibleSource.length;
  const candidates = eligibleSource.filter(
    (play) => !assigned.has(_scriptIntegrationCallIdentity(play)),
  );
  const skipped = source.plays.length - candidates.length;
  if (!candidates.length) {
    showToast(
      restricted > 0
        ? "This game plan template accepts passing play types only."
        : "Those Script plays are already on the Game Plan.",
      {
        type: restricted > 0 ? "warning" : "info",
      },
    );
    return;
  }

  const byBox = {};
  candidates.forEach((play) => {
    const boxId =
      selectedBoxId || _gpAutoDestinationForPlay(play, board);
    if (!byBox[boxId]) byBox[boxId] = [];
    byBox[boxId].push(play);
  });
  const breakdown = Object.entries(byBox)
    .map(([boxId, boxPlays]) => {
      const label =
        typeof _gpBoxLabel === "function" ? _gpBoxLabel(boxId) : boxId;
      return `<li>${escapeHtml(label)}: <strong>${boxPlays.length}</strong></li>`;
    })
    .join("");
  const confirmed = await showConfirm(
    `<p>Send <strong>${candidates.length}</strong> play${candidates.length === 1 ? "" : "s"} from the Script?</p>
     <ul>${breakdown}</ul>
     ${skipped ? `<p>${skipped} repeated, restricted, or already assigned play${skipped === 1 ? "" : "s"} will be skipped.</p>` : ""}`,
    {
      title: "Send Script to Game Plan",
      icon: "🎯",
      confirmText: "Send",
    },
  );
  if (!confirmed) return;

  let added = 0;
  _gpUpdateBoard((latestBoard) => {
    const existing = new Set(
      Object.values(latestBoard.assignments || {})
        .flat()
        .filter(Boolean)
        .map(_scriptIntegrationCallIdentity),
    );
    Object.entries(byBox).forEach(([boxId, boxPlays]) => {
      if (!Array.isArray(latestBoard.assignments[boxId])) {
        latestBoard.assignments[boxId] = [];
      }
      boxPlays.forEach((play) => {
        const signature = _scriptIntegrationCallIdentity(play);
        if (
          existing.has(signature) ||
          !_gpPlayAllowedOnBoard(play, latestBoard)
        ) {
          return;
        }
        latestBoard.assignments[boxId].push(
          typeof copyPlayWithSourceIdentity === "function"
            ? copyPlayWithSourceIdentity(play)
            : { ...play },
        );
        existing.add(signature);
        added += 1;
      });
    });
  });

  if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
  showToast(
    `Sent ${added} Script play${added === 1 ? "" : "s"} to the Game Plan${skipped ? ` (${skipped} skipped)` : ""}.`,
    { type: "success", duration: 4000, actionLabel: "→ Game Plan", action: () => showTab("gameplan") },
  );
  if (typeof showTab === "function") showTab("gameplan");
}

function _scriptIntegrationCallIdentity(play) {
  if (typeof getPlayCompareKey === "function") {
    return getPlayCompareKey(play, SCRIPT_WRISTBAND_IDENTITY_FIELDS);
  }
  if (typeof getPlayIdentityKey === "function") {
    return getPlayIdentityKey(play, SCRIPT_WRISTBAND_IDENTITY_FIELDS, {
      canonical: true,
    });
  }
  return [
    play.type,
    play.personnel,
    play.formation,
    play.play,
    play.playTag1,
    play.playTag2,
  ].join("|");
}

function _scriptWristbandCardName(baseName, cardNumber, cardCount) {
  const cleanName = String(baseName || "Practice Script").trim() || "Practice Script";
  return cardCount > 1
    ? `${cleanName} ${cardNumber}/${cardCount}`
    : cleanName;
}

async function _confirmScriptWristbandTrim(playCount, capacity) {
  if (playCount <= capacity) return true;
  return showConfirm(
    `The Script has ${playCount} unique plays, but this option has room for ${capacity}. Continue with the first ${capacity}?`,
    {
      title: "Wristband Capacity",
      icon: "🃏",
      confirmText: "Continue",
      cancelText: "Cancel",
    },
  );
}

async function sendScriptToWristband() {
  if (
    typeof wristbandCards === "undefined" ||
    !Array.isArray(wristbandCards) ||
    typeof mutateWristbandState !== "function"
  ) {
    showToast("Wristband is not ready yet.", { type: "error" });
    return;
  }
  const source = _getScriptIntegrationSource();
  if (!source.plays.length) {
    showToast("Add plays to the Script first.", { type: "warning" });
    return;
  }
  const uniquePlays = _uniqueScriptIntegrationPlays(
    source.plays,
    _scriptIntegrationCallIdentity,
  );
  const repeatedCount = source.plays.length - uniquePlays.length;
  const mode = await showChoice(
    `<p>Send <strong>${uniquePlays.length}</strong> unique ${source.selected ? "selected " : ""}Script play${uniquePlays.length === 1 ? "" : "s"} to the Wristband?</p>
     ${repeatedCount ? `<p>${repeatedCount} repeated Script call${repeatedCount === 1 ? "" : "s"} will be skipped.</p>` : ""}`,
    {
      title: "Send Script to Wristband",
      icon: "🃏",
      option1: "Build new card(s)",
      option2: "Fill empty cells",
    },
  );
  if (!mode) return;

  const cellsPerCard = getActiveWristbandCellCount();
  const maxCards = MAX_CARDS;
  const scriptName =
    document.getElementById("scriptName")?.value || "Practice Script";
  let added = 0;

  if (mode === "option1") {
    const reusableStarter =
      wristbandCards.length === 1 &&
      !(wristbandCards[0]?.data || []).some(Boolean);
    const availableCards =
      maxCards - wristbandCards.length + (reusableStarter ? 1 : 0);
    const capacity = Math.max(0, availableCards * cellsPerCard);
    if (capacity === 0) {
      showToast(
        `Maximum ${maxCards} Wristband cards reached. Use Fill Empty Cells or remove a card first.`,
        { type: "warning", duration: 4000 },
      );
      return;
    }
    const shouldContinue = await _confirmScriptWristbandTrim(
      uniquePlays.length,
      capacity,
    );
    if (!shouldContinue) return;
    const playsToAdd = uniquePlays.slice(0, capacity);
    const cardCount = Math.ceil(playsToAdd.length / cellsPerCard);

    mutateWristbandState(() => {
      let playOffset = 0;
      let lastCardIndex = currentCardIndex;
      for (let cardNumber = 1; cardNumber <= cardCount; cardNumber += 1) {
        const data = Array(CELLS_PER_CARD).fill(null);
        playsToAdd
          .slice(playOffset, playOffset + cellsPerCard)
          .forEach((play, index) => {
            data[index] = safeDeepClone(play);
            added += 1;
          });
        const card = {
          name: _scriptWristbandCardName(scriptName, cardNumber, cardCount),
          data,
        };
        if (reusableStarter && cardNumber === 1) {
          wristbandCards[0] = { ...wristbandCards[0], ...card };
          lastCardIndex = 0;
        } else {
          wristbandCards.push(card);
          lastCardIndex = wristbandCards.length - 1;
        }
        playOffset += cellsPerCard;
      }
      currentCardIndex = lastCardIndex;
    }, { updateCardColorPicker: true });
  } else {
    const existingCards = wristbandCards.length || 1;
    const cardOrder = Array.from(
      { length: existingCards },
      (_, offset) => (currentCardIndex + offset) % existingCards,
    );
    const emptyCells = wristbandCards.length
      ? cardOrder.reduce(
        (total, cardIndex) =>
          total +
          (wristbandCards[cardIndex]?.data || [])
            .slice(0, cellsPerCard)
            .filter((play) => play === null).length,
        0,
      )
      : cellsPerCard;
    if (emptyCells === 0) {
      showToast("No empty Wristband cells are available.", {
        type: "warning",
      });
      return;
    }
    const shouldContinue = await _confirmScriptWristbandTrim(
      uniquePlays.length,
      emptyCells,
    );
    if (!shouldContinue) return;
    const playsToAdd = uniquePlays.slice(0, emptyCells);

    mutateWristbandState(() => {
      if (wristbandCards.length === 0) {
        wristbandCards.push({
          name: _scriptWristbandCardName(scriptName, 1, 1),
          data: Array(CELLS_PER_CARD).fill(null),
        });
        currentCardIndex = 0;
      }
      const orderedCardIndices = Array.from(
        { length: wristbandCards.length },
        (_, offset) => (currentCardIndex + offset) % wristbandCards.length,
      );
      let playIndex = 0;
      for (const cardIndex of orderedCardIndices) {
        const cardData = wristbandCards[cardIndex].data;
        for (
          let cellIndex = 0;
          cellIndex < Math.min(cardData.length, cellsPerCard) &&
          playIndex < playsToAdd.length;
          cellIndex += 1
        ) {
          if (cardData[cellIndex] !== null) continue;
          cardData[cellIndex] = safeDeepClone(playsToAdd[playIndex]);
          playIndex += 1;
          added += 1;
        }
        if (playIndex >= playsToAdd.length) {
          currentCardIndex = cardIndex;
          break;
        }
      }
    }, { updateCardColorPicker: true });
  }

  if (typeof showTab === "function") showTab("wristband");
  if (
    typeof wristbandType !== "undefined" &&
    !wristbandType &&
    typeof startClassicWristband === "function"
  ) {
    startClassicWristband();
  }
  if (added > 0 && typeof confirmWristbandHandoffPersistence === "function") {
    await confirmWristbandHandoffPersistence(
      `Sent ${added} Script play${added === 1 ? "" : "s"} to the Wristband.`,
    );
  }
  showToast(
    `Sent ${added} Script play${added === 1 ? "" : "s"} to the Wristband${repeatedCount ? ` (${repeatedCount} repeat${repeatedCount === 1 ? "" : "s"} skipped)` : ""}.`,
    { type: "success", duration: 4000, actionLabel: "→ Wristband", action: () => showTab("wristband") },
  );
}

// ─── #141: Send Script Plays to Call Sheet ────────────────────────────────────
async function sendScriptToCallSheet() {
  if (typeof callSheet === "undefined" || typeof CALLSHEET_CATEGORIES === "undefined") {
    showToast("Open Call Sheet tab first to initialize it", { type: "warning" });
    return;
  }
  if (typeof _gpComputeCallSheetTargets !== "function" || typeof _gpPushPlayIntoCategory !== "function") {
    showToast("Call sheet mapping unavailable", { type: "warning" });
    return;
  }

  const source = _getScriptIntegrationSource();
  if (!source.plays.length) {
    showToast("Script is empty", { type: "warning" });
    return;
  }

  const fanOut = source.plays.map((play) => ({ play, targets: _gpComputeCallSheetTargets(play, play.type || "") }));
  const byCat = {};
  fanOut.forEach(({ targets }) => targets.forEach((id) => { byCat[id] = (byCat[id] || 0) + 1; }));
  const filledCatIds = Object.keys(byCat);

  if (!filledCatIds.length) {
    showToast(
      "Script plays don't match any call sheet category. Set Preferred Down/Distance/Type on those plays.",
      { type: "warning", duration: 5000 }
    );
    return;
  }

  const label = source.selected ? `${source.plays.length} selected play${source.plays.length !== 1 ? "s" : ""}` : `${source.plays.length} script play${source.plays.length !== 1 ? "s" : ""}`;
  const summaryItems = CALLSHEET_CATEGORIES.filter((c) => byCat[c.id])
    .map((c) => {
      const dn = typeof getCategoryDisplayName === "function" ? getCategoryDisplayName(c) : c.name;
      return `<li>${escapeHtml(dn)}: <strong>${byCat[c.id]}</strong></li>`;
    }).join("");

  const choice = await showChoice(
    `<p>Send <strong>${label}</strong> into <strong>${filledCatIds.length}</strong> call sheet categor${filledCatIds.length !== 1 ? "ies" : "y"}?</p>
     <details style="font-size:var(--font-size-sm);"><summary style="cursor:pointer;color:var(--color-text-muted);">Show breakdown</summary><ul style="margin:var(--space-xs) 0 0 var(--space-md);">${summaryItems}</ul></details>`,
    { title: "Send Script to Call Sheet", icon: "📄", option1: "Append to existing", option2: "Replace categories" }
  );
  if (!choice) return;

  const csPreSnapshot = safeDeepClone(callSheet);
  if (choice === "option2") {
    filledCatIds.forEach((id) => {
      if (!callSheet[id]) callSheet[id] = { left: [], right: [] };
      callSheet[id].left = [];
      callSheet[id].right = [];
    });
  }

  let pushed = 0;
  fanOut.forEach(({ play, targets }) =>
    targets.forEach((id) => { if (_gpPushPlayIntoCategory(play, id)) pushed++; })
  );

  if (typeof saveCallSheet === "function") saveCallSheet();
  if (typeof renderCallSheet === "function") renderCallSheet();

  showUndoToast(
    `${pushed} entr${pushed !== 1 ? "ies" : "y"} sent to ${filledCatIds.length} call sheet categor${filledCatIds.length !== 1 ? "ies" : "y"}`,
    () => {
      Object.assign(callSheet, csPreSnapshot);
      Object.keys(callSheet).forEach((k) => { if (!(k in csPreSnapshot)) delete callSheet[k]; });
      if (typeof saveCallSheet === "function") saveCallSheet();
      if (typeof renderCallSheet === "function") renderCallSheet();
      showToast("Script → Call Sheet undone", { type: "info" });
    },
    8000
  );
  if (pushed > 0 && typeof showTab === "function") showTab("callsheet");
}

// ─── #138/#139: Reconcile Script with Game Plan ───────────────────────────────
async function reconcileScriptWithGamePlan() {
  if (typeof _gpEnsureBoard !== "function" || typeof _gpPlaySignature !== "function") {
    showToast("Game Plan is not ready yet", { type: "warning" });
    return;
  }

  const board = _gpEnsureBoard();
  const allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  const gpPlays = [];
  allBoxes.forEach((b) => (board.assignments[b.id] || []).forEach((p) => gpPlays.push(p)));

  if (!gpPlays.length) {
    showToast("Game Plan has no drafted plays", { type: "warning" });
    return;
  }

  const sig = (p) => _gpPlaySignature(p);
  const gpSigs = new Set(gpPlays.map(sig));
  const scriptSigs = new Set(script.filter((s) => !s.isSeparator).map(sig));

  const newPlays = gpPlays.filter((p) => !scriptSigs.has(sig(p)));
  // Only flag script plays that came from GP (have _gpSource) but are no longer in GP
  const staleIndices = script.reduce((acc, s, i) => {
    if (!s.isSeparator && s._gpSource && !gpSigs.has(sig(s))) acc.push(i);
    return acc;
  }, []);

  if (!newPlays.length && !staleIndices.length) {
    showToast("Script is already in sync with the Game Plan ✓", { type: "success" });
    return;
  }

  const parts = [
    newPlays.length ? `<strong>${newPlays.length}</strong> new GP play${newPlays.length !== 1 ? "s" : ""} to add` : "",
    staleIndices.length ? `<strong>${staleIndices.length}</strong> GP-sourced play${staleIndices.length !== 1 ? "s" : ""} no longer in Game Plan` : "",
  ].filter(Boolean).join(" · ");

  const ok = await showConfirm(
    `<p>${parts}</p><p style="margin-top:var(--space-sm);font-size:var(--font-size-sm);color:var(--color-text-muted);">New plays will be appended to the last period. Stale plays will be removed.</p>`,
    { title: "Reconcile Script with Game Plan", icon: "🔄", confirmText: "Reconcile" }
  );
  if (!ok) return;

  // Save undo snapshot
  if (typeof historyManager !== "undefined") historyManager.saveState("script", safeDeepClone(script));

  // Remove stale GP-sourced plays (in reverse index order to not shift)
  staleIndices.slice().reverse().forEach((i) => script.splice(i, 1));

  // Append new plays to last non-separator period (or create one)
  if (newPlays.length) {
    // Find last period separator or end of script
    let insertIdx = script.length;
    for (let i = script.length - 1; i >= 0; i--) {
      if (!script[i].isSeparator) { insertIdx = i + 1; break; }
    }
    newPlays.forEach((p) => {
      script.splice(
        insertIdx,
        0,
        typeof createScriptPlayFromGamePlan === "function"
          ? createScriptPlayFromGamePlan(p, {
            board,
            boxes: allBoxes.filter((box) => (board.assignments[box.id] || []).some((candidate) => sig(candidate) === sig(p))),
          })
          : (typeof copyPlayWithSourceIdentity === "function"
            ? copyPlayWithSourceIdentity(p, { _gpSource: true, id: Date.now() + Math.random() })
            : { ...p, _gpSource: true }),
      );
      insertIdx++;
    });
  }

  markScriptDirty();
  if (typeof renderScript === "function") renderScript();
  if (typeof updateScriptCount === "function") updateScriptCount();
  updateScriptReconcileStatus();

  const summary = [
    newPlays.length ? `+${newPlays.length} added` : "",
    staleIndices.length ? `-${staleIndices.length} removed` : "",
  ].filter(Boolean).join(", ");

  showUndoToast(`Script reconciled: ${summary}`, () => {
    if (typeof historyManager !== "undefined") {
      const prev = historyManager.undo("script", safeDeepClone(script));
      if (prev) {
        script.splice(0, script.length, ...prev.script);
        markScriptDirty();
        if (typeof renderScript === "function") renderScript();
        if (typeof updateScriptCount === "function") updateScriptCount();
        updateScriptReconcileStatus();
        showToast("Reconcile undone", { type: "info" });
      }
    }
  }, 8000);
}

// ─── #136: Scout-driven period suggestions ────────────────────────────────────
async function showScoutPeriodSuggestions() {
  if (typeof _tdScoutRecs === "undefined" || !Array.isArray(_tdScoutRecs)) {
    showToast("No scout data available. Analyze an opponent in Opponent Scout first.", { type: "info", duration: 4000 });
    return;
  }
  if (!_tdScoutRecs.length) {
    showToast("No scout recommendations yet. Run the scout overview analysis first.", { type: "info", duration: 4000 });
    return;
  }

  // Group scout recs by theme to propose period types
  const themes = {};
  _tdScoutRecs.forEach(({ play, reasons }) => {
    reasons.forEach((r) => {
      const key = r.replace(/\s\(.*\)/, "").trim();
      if (!themes[key]) themes[key] = [];
      themes[key].push(play);
    });
  });

  const themeKeys = Object.keys(themes).slice(0, 8);
  if (!themeKeys.length) {
    showToast("No themed recommendations available", { type: "info" });
    return;
  }

  // Known period suggestions by scout theme keyword
  const PERIOD_SUGGESTIONS = {
    "Blitz": "Blitz Pickup",
    "pressure": "Blitz Pickup",
    "Cover 0": "Blitz Pickup",
    "Man": "Man Coverage",
    "Zone": "Zone Coverage",
    "Cover 2": "Cover 2 Beaters",
    "Cover 3": "Cover 3 Attack",
    "Red Zone": "Red Zone",
    "Goal Line": "Goal Line",
    "3rd Down": "3rd Down",
    "2-minute": "2-Minute Drill",
    "Stunt": "Protection Period",
    "Front": "Run Game Period",
    "Run": "Run Game Period",
  };

  const suggestions = themeKeys.map((key) => {
    const periodName = Object.entries(PERIOD_SUGGESTIONS).find(([k]) => key.toLowerCase().includes(k.toLowerCase()))?.[1] || key;
    const playCount = themes[key].length;
    return { key, periodName, playCount };
  });

  const listHtml = suggestions.map((s) =>
    `<li style="padding:var(--space-xs) 0;display:flex;justify-content:space-between;align-items:center;gap:var(--space-sm);">
       <span><strong>${escapeHtml(s.periodName)}</strong> <span style="font-size:var(--font-size-sm);color:var(--color-text-muted);">${escapeHtml(s.key)}</span></span>
       <span style="font-size:var(--font-size-sm);color:var(--color-text-muted);">${s.playCount} play${s.playCount !== 1 ? "s" : ""}</span>
     </li>`
  ).join("");

  const choice = await showChoice(
    `<p>Based on scout data, these practice periods are recommended:</p>
     <ul style="list-style:none;padding:0;margin:var(--space-sm) 0;">${listHtml}</ul>
     <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);">Choose an option to add all recommended periods at once, or cancel to add manually.</p>`,
    { title: "Scout Period Suggestions", icon: "🔍", option1: "Add All Suggested Periods", option2: "Let Me Pick" }
  );
  if (!choice) return;

  if (choice === "option1") {
    // Add all suggested periods directly
    const uniquePeriods = [...new Set(suggestions.map((s) => s.periodName))];
    if (typeof saveScriptState === "function") saveScriptState();
    uniquePeriods.forEach((name) => {
      script.push({
        isSeparator: true,
        label: name,
        minutes: 10,
        color: (typeof UI_COLORS !== "undefined" && UI_COLORS.periodDefault) || "#666",
        id: Date.now() + Math.random(),
      });
    });
    markScriptDirty();
    if (typeof renderScript === "function") renderScript();
    showToast(`Added ${uniquePeriods.length} period${uniquePeriods.length !== 1 ? "s" : ""} from scout suggestions`, { type: "success" });
  } else {
    // Let them pick
    const pickerItems = [...new Set(suggestions.map((s) => s.periodName))].map((name) => ({
      label: name,
      value: name,
    }));
    const picked = await showListPicker("Select a period to add:", pickerItems, {
      title: "Add Suggested Period",
      icon: "📋",
    });
    if (picked) {
      if (typeof saveScriptState === "function") saveScriptState();
      script.push({
        isSeparator: true,
        label: picked,
        minutes: 10,
        color: (typeof UI_COLORS !== "undefined" && UI_COLORS.periodDefault) || "#666",
        id: Date.now() + Math.random(),
      });
      markScriptDirty();
      if (typeof renderScript === "function") renderScript();
      showToast(`Period "${picked}" added`, { type: "success" });
    }
  }
}

// ─── #137: Update unscripted GP plays count indicator ────────────────────────
function updateScriptReconcileStatus() {
  const badge = document.getElementById("scriptGpSyncBadge");
  if (!badge) return;

  if (typeof _gpEnsureBoard !== "function" || typeof _gpPlaySignature !== "function") {
    badge.textContent = "";
    badge.className = "script-gp-sync-badge hidden";
    return;
  }

  try {
    const board = _gpEnsureBoard();
    const allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
    const gpPlays = [];
    allBoxes.forEach((b) => (board.assignments[b.id] || []).forEach((p) => gpPlays.push(p)));

    if (!gpPlays.length) {
      badge.textContent = "";
      badge.className = "script-gp-sync-badge hidden";
      return;
    }

    const sig = (p) => _gpPlaySignature(p);
    const scriptSigs = new Set(script.filter((s) => !s.isSeparator).map(sig));
    const unscripted = gpPlays.filter((p) => !scriptSigs.has(sig(p))).length;

    if (!unscripted) {
      badge.textContent = "✓ All GP plays scripted";
      badge.className = "script-gp-sync-badge ok";
    } else {
      badge.textContent = `${unscripted} GP play${unscripted !== 1 ? "s" : ""} not yet scripted`;
      badge.className = "script-gp-sync-badge warn";
    }
  } catch {
    badge.textContent = "";
    badge.className = "script-gp-sync-badge hidden";
  }
}
