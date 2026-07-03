// wristband-chrome.js — Wristband mode management and player card UI
// Extracted from wristband-export.js

function checkShowWbLanding() {
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("check landing start", { action: "checkShowWbLanding" });
  }
  if (wristbandType) {
    syncWristbandModeSurface(wristbandType);
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("check landing existing type", {
        action: "checkShowWbLanding",
      });
    }
    return; // type already chosen
  }
  const isEmpty = wristbandCards.every((c) => !c.data?.some(Boolean));
  if (isEmpty) {
    showWbTypeChoice();
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("check landing show choice", {
        action: "checkShowWbLanding",
        isEmpty,
      });
    }
    return;
  }
  wristbandType = "classic";
  wbPlayerCardMode = false;
  syncWristbandModeSurface("classic");
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("check landing default classic", {
      action: "checkShowWbLanding",
      isEmpty,
    });
  }
}

function updateWristbandModeChrome(mode) {
  const badge = document.getElementById("wbModeBadge");
  if (!badge) return;
  if (mode === "classic") {
    badge.textContent = "Classic · 40 plays/card";
  } else if (mode === "player") {
    badge.textContent = "Player · 20 plays/card";
  } else {
    badge.textContent = "Choose a format";
  }
}

function syncWristbandModeSurface(mode = wristbandType || "") {
  const normalizedMode = mode === "player" || mode === "classic" ? mode : "";
  const hasMode = Boolean(normalizedMode);
  const isPlayer = normalizedMode === "player";
  const typeChoice = document.getElementById("wbTypeChoice");
  const toolbar = document.querySelector(".wb-toolbar");
  const cardTabs = document.querySelector(".card-tabs");
  const card = document.getElementById("wristbandCard");
  const grid = document.getElementById("wristbandGrid");
  const playerBar = document.getElementById("pcModeBar");

  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("mode surface before", {
      action: "syncWristbandModeSurface",
      requestedMode: mode,
      normalizedMode,
    });
  }

  updateWristbandModeChrome(normalizedMode);
  typeChoice?.classList.toggle("hidden", hasMode);
  toolbar?.classList.toggle("wb-toolbar-hidden", !hasMode || isPlayer);
  cardTabs?.classList.toggle("wb-hidden", !hasMode);
  card?.classList.toggle("wb-hidden", !hasMode);
  playerBar?.classList.toggle("visible", isPlayer);
  playerBar?.setAttribute("aria-hidden", isPlayer ? "false" : "true");
  grid?.classList.toggle("pc-grid-active", isPlayer);
  card?.classList.toggle("pc-card-active", isPlayer);

  if (typeof traceWristbandAction === "function") {
    const level = hasMode && card?.classList.contains("wb-hidden") ? "warn" : "info";
    traceWristbandAction("mode surface after", {
      action: "syncWristbandModeSurface",
      requestedMode: mode,
      normalizedMode,
      hasMode,
      isPlayer,
    }, level);
  }
}

function showWbTypeChoice() {
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("show type choice start", { action: "showWbTypeChoice" });
  }
  resetActiveWristbandIdentity();
  wristbandType = "";
  // Deactivate player mode if it was on
  if (wbPlayerCardMode) {
    wbPlayerCardMode = false;
  }
  syncWristbandModeSurface("");
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("show type choice complete", { action: "showWbTypeChoice" });
  }
}

function startClassicWristband() {
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("classic start", { action: "startClassicWristband" });
  }
  wristbandType = "classic";
  wbPlayerCardMode = false;
  syncWristbandModeSurface("classic");
  renderCardTabs();
  renderWristbandGrid();
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("classic complete", { action: "startClassicWristband" });
  }
}

function startPlayerWristband() {
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("player start", { action: "startPlayerWristband" });
  }
  const hiddenPlayCount = wristbandCards.reduce(
    (sum, card) =>
      sum + (card.data || []).slice(WB_ROWS, CELLS_PER_CARD).filter(Boolean).length,
    0,
  );
  if (hiddenPlayCount > 0) {
    showToast(
      `${hiddenPlayCount} play${hiddenPlayCount === 1 ? "" : "s"} in cells 21-40 will be hidden in Player mode but remain saved.`,
      { type: "warning", duration: 6000 },
    );
  }
  wristbandType = "player";
  // Activate player wristband mode
  wbPlayerCardMode = true;
  const posSelect = document.getElementById("pcPosSelect");
  wbPlayerCardPos = posSelect ? posSelect.value || "respQ" : "respQ";
  syncWristbandLineCallOnlyControls("classic");
  syncWristbandModeSurface("player");
  renderCardTabs();
  renderPlayerCardGrid();
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("player complete", {
      action: "startPlayerWristband",
      hiddenPlayCount,
    });
  }
}

function openPlayerCardPrint() {
  // Legacy entry — redirect through the new type choice flow
  startPlayerWristband();
}

function closePlayerCardPrint() {
  // Go back to the type choice landing
  showWbTypeChoice();
  renderWristbandGrid();
}

function updatePlayerCardPreview() {
  const posSelect = document.getElementById("pcPosSelect");
  if (posSelect) wbPlayerCardPos = posSelect.value || "respQ";
  if (wbPlayerCardMode) renderPlayerCardGrid();
}

function _playerPositionLabel(positionKey) {
  return (
    PLAYER_WRISTBAND_POSITIONS.find(
      (position) => position.key === positionKey,
    )?.label || String(positionKey || "").replace("resp", "")
  );
}

function _buildPlayerRuleSourceOptions(basePosition, selectedPosition) {
  const baseLabel = _playerPositionLabel(basePosition);
  const options = [
    `<option value=""${selectedPosition === basePosition ? " selected" : ""}>${escapeHtml(baseLabel)} Rule</option>`,
  ];
  PLAYER_WRISTBAND_POSITIONS.forEach((position) => {
    if (position.key === basePosition) return;
    options.push(
      `<option value="${escapeHtml(position.key)}"${selectedPosition === position.key ? " selected" : ""}>${escapeHtml(position.label)} Rule</option>`,
    );
  });
  return options.join("");
}

function _updatePlayerCellCustomization(cardIdx, cellIdx, update) {
  if (typeof update !== "function") return;
  const key = getWristbandCellCustomizationKey(cardIdx, cellIdx);
  saveWristbandState();
  const custom = safeDeepClone(cellCustomizations[key] || {});
  update(custom);
  setWristbandCellCustomization(key, custom);
  renderPlayerCardGrid();
}

function renderPlayerCardGrid() {
  const grid = document.getElementById("wristbandGrid");
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("player render start", { action: "renderPlayerCardGrid" });
  }
  if (!grid) {
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("player render missing grid", {
        action: "renderPlayerCardGrid",
      }, "error");
    }
    return;
  }
  syncWristbandModeSurface("player");

  const card = wristbandCards[currentCardIndex];
  if (!card) {
    grid.innerHTML = "";
    syncWristbandGridEmptyState([], WB_ROWS);
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("player render missing card", {
        action: "renderPlayerCardGrid",
      }, "warn");
    }
    return;
  }

  // Player wristbands use one play per row, half the classic card capacity.
  const cardOffset = currentCardIndex * WB_ROWS;
  const opts = getWristbandDisplayOptions();
  const { highlightHuddle, highlightCandy, blankPlayerRules } = opts;
  const pCardColor = card.cardColor || "";

  // 3 columns: [num (32px) | play name (1fr) | responsibility (1fr)] × 20 rows
  // Same on-screen dimensions as classic, with one play and assignment per row.
  let html = "";
  for (let i = 0; i < WB_ROWS; i++) {
    const play = card.data[i];
    const playNum = i + WRISTBAND_OFFSET + cardOffset;
    const custom = cellCustomizations[`${currentCardIndex}-${i}`] || {};
    const ruleSource = getPlayerRuleSource(custom, wbPlayerCardPos);
    const respText = blankPlayerRules
      ? ""
      : getPlayerAssignmentText(play, custom, wbPlayerCardPos);

    const isHuddle = highlightHuddle && play && play.tempo && play.tempo.toLowerCase() === "huddle";
    const isCandy = highlightCandy && play && play.tempo && play.tempo.toLowerCase() === "candy";
    const bg = getCellBgColor(custom, isHuddle, isCandy, i, pCardColor);
    const numBg = bg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const numFg = bg
      ? (isColorDark(bg) ? "white" : UI_COLORS.textDark)
      : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");

    // Number cell
    html += `<div class="wristband-cell num-cell" role="rowheader" style="background:${numBg};color:${numFg};">${playNum}</div>`;

    // Play call cell — data-drag attrs required for click/drag handlers
    if (play) {
      let cellStyle = bg ? `background:${bg};` : "";
      cellStyle += custom.textColor ? `color:${custom.textColor};` : "";
      const cellInner = renderWristbandCellCall(play, custom, opts);
      html += `<div class="wristband-cell filled" style="${cellStyle}"
        draggable="true" role="gridcell" tabindex="0"
        aria-label="${escapeHtml(getWristbandCellAriaLabel(play, playNum))}"
        data-drag="wbCell" data-cell-idx="${i}" data-card="${currentCardIndex}">
        <span class="cell-play"><span class="cell-drag-handle">☰</span><span class="cell-play-text">${cellInner}</span></span>
      </div>`;
    } else {
      html += `<div class="wristband-cell" role="gridcell" tabindex="0"
        aria-label="${escapeHtml(getWristbandCellAriaLabel(null, playNum))}"
        data-drag="wbCell" data-cell-idx="${i}" data-card="${currentCardIndex}"></div>`;
    }

    if (blankPlayerRules) {
      html += `<div class="wristband-cell pc-assignment-cell pc-assignment-blank"
        aria-label="Blank write-in rule line for wristband number ${playNum}">
        <span class="pc-write-in-line" aria-hidden="true"></span>
      </div>`;
      continue;
    }

    // Rule source + responsibility text. Both are wristband-only customizations.
    const hasOverride = hasPlayerAssignmentCustomization(
      custom,
      wbPlayerCardPos,
    );
    html += `<div class="wristband-cell pc-assignment-cell">
      <select class="pc-rule-select${ruleSource !== wbPlayerCardPos ? " is-overridden" : ""}"
        data-base-position="${escapeHtml(wbPlayerCardPos)}"
        data-card="${currentCardIndex}" data-cell="${i}"
        aria-label="Rule source for wristband number ${playNum}" ${play ? "" : "disabled"}>
        ${_buildPlayerRuleSourceOptions(wbPlayerCardPos, ruleSource)}
      </select>
      <textarea class="pc-resp-input" data-base-position="${escapeHtml(wbPlayerCardPos)}"
        data-card="${currentCardIndex}" data-cell="${i}"
        aria-label="Assignment for wristband number ${playNum}"
        placeholder="—" ${play ? "" : "disabled"}>${escapeHtml(respText)}</textarea>
      ${hasOverride ? `<button class="pc-resp-reset" data-base-position="${escapeHtml(wbPlayerCardPos)}" data-card="${currentCardIndex}" data-cell="${i}" title="Reset to ${escapeHtml(_playerPositionLabel(wbPlayerCardPos))} rule" aria-label="Reset wristband number ${playNum} to ${escapeHtml(_playerPositionLabel(wbPlayerCardPos))} rule">↺</button>` : ""}
    </div>`;
  }

  grid.classList.add("pc-grid-active");
  document.getElementById("wristbandCard")?.classList.add("pc-card-active");
  grid.style.gridTemplateRows = `repeat(${WB_ROWS}, 1fr)`;
  grid.innerHTML = html;
  finalizeWristbandGridRender(grid, card.data, WB_ROWS);
  if (typeof traceWristbandAction === "function") {
    traceWristbandAction("player render complete", {
      action: "renderPlayerCardGrid",
      generatedHTMLLength: html.length,
    }, grid.children.length === 0 ? "warn" : "info");
  }

  // Wire assignment change + reset click events — only once per grid element lifetime
  if (!grid._pcListenerWired) {
    grid._pcListenerWired = true;
    grid.addEventListener("change", function (e) {
      if (!wbPlayerCardMode) return;
      const control = e.target;
      if (
        !control.classList.contains("pc-rule-select") &&
        !control.classList.contains("pc-resp-input")
      ) {
        return;
      }
      const basePosition = control.dataset.basePosition;
      const cardIdx = parseInt(control.dataset.card, 10);
      const cellIdx = parseInt(control.dataset.cell, 10);
      if (
        !PLAYER_WRISTBAND_POSITION_KEYS.has(basePosition) ||
        !Number.isInteger(cardIdx) ||
        !Number.isInteger(cellIdx)
      ) {
        return;
      }
      _updatePlayerCellCustomization(cardIdx, cellIdx, (custom) => {
        if (control.classList.contains("pc-rule-select")) {
          const sourcePosition = control.value;
          custom.playerRuleSources = normalizePlayerRuleSources(
            custom.playerRuleSources,
          );
          if (
            PLAYER_WRISTBAND_POSITION_KEYS.has(sourcePosition) &&
            sourcePosition !== basePosition
          ) {
            custom.playerRuleSources[basePosition] = sourcePosition;
          } else {
            delete custom.playerRuleSources[basePosition];
          }
          custom.playerAssignmentOverrides =
            normalizePlayerAssignmentOverrides(
              custom.playerAssignmentOverrides,
            );
          delete custom.playerAssignmentOverrides[basePosition];
        } else {
          custom.playerAssignmentOverrides =
            normalizePlayerAssignmentOverrides(
              custom.playerAssignmentOverrides,
            );
          custom.playerAssignmentOverrides[basePosition] = control.value;
        }
      });
    });
    grid.addEventListener("click", function (e) {
      if (!wbPlayerCardMode) return;
      const btn = e.target.closest(".pc-resp-reset");
      if (!btn) return;
      e.preventDefault();
      const basePosition = btn.dataset.basePosition;
      const cardIdx = parseInt(btn.dataset.card, 10);
      const cellIdx = parseInt(btn.dataset.cell, 10);
      _updatePlayerCellCustomization(cardIdx, cellIdx, (custom) => {
        if (custom.playerRuleSources) {
          delete custom.playerRuleSources[basePosition];
        }
        if (custom.playerAssignmentOverrides) {
          delete custom.playerAssignmentOverrides[basePosition];
        }
      });
    });
  }
}

// ─── #146: Create wristband card from Game Plan ───────────────────────────────
async function createWristbandCardFromGamePlan() {
  if (typeof _gpEnsureBoard !== "function") {
    showToast("Open the Game Plan tab first", { type: "warning" });
    return;
  }
  const board = _gpEnsureBoard();
  const allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  const sourcePlays = [];
  allBoxes.forEach((b) => (board.assignments[b.id] || []).forEach((p) => sourcePlays.push(p)));

  if (!sourcePlays.length) {
    showToast("No drafted plays in the Game Plan", { type: "warning" });
    return;
  }
  if (wristbandCards.length >= MAX_CARDS) {
    showToast(`Max ${MAX_CARDS} cards reached — remove a card first`, { type: "warning" });
    return;
  }

  const gw = getGameWeek();
  const opp = gw && gw.opponentName ? `vs ${gw.opponentName}` : "Game Plan";
  const cardName = await showPrompt("Card name:", opp, { title: "Create Card from Game Plan", icon: "🎯" });
  if (!cardName) return;

  // #148: Preserve source order — GP box order is maintained
  const cardData = Array(CELLS_PER_CARD).fill(null);
  sourcePlays.slice(0, CELLS_PER_CARD).forEach((p, i) => {
    cardData[i] = { ...p, _gpSource: true };
  });

  historyManager.saveState("wristband", getWristbandState());
  wristbandCards.push({
    name: cardName.trim(),
    data: cardData,
    _source: { type: "gameplan", opponent: gw ? gw.opponentName || "" : "", ts: Date.now() },
  });
  currentCardIndex = wristbandCards.length - 1;

  markWristbandDirty();
  scheduleWristbandAutosave();
  if (typeof refreshWristbandCardView === "function") refreshWristbandCardView();
  if (typeof renderWristbandGrid === "function") renderWristbandGrid();
  updateWristbandSourceBadge();

  const capped = Math.min(sourcePlays.length, CELLS_PER_CARD);
  const overflow = sourcePlays.length - capped;
  showToast(
    `Card "${cardName.trim()}" created — ${capped} play${capped !== 1 ? "s" : ""}${overflow > 0 ? ` (${overflow} didn't fit)` : ""}`,
    { type: "success", duration: 4000 }
  );
}

// ─── #147/#148: Create wristband card from Practice Script ───────────────────
async function createWristbandCardFromScript() {
  if (!Array.isArray(script) || !script.length) {
    showToast("Script is empty", { type: "warning" });
    return;
  }
  const scriptPlays = script.filter((s) => !s.isSeparator);
  if (!scriptPlays.length) {
    showToast("No plays in the current script", { type: "warning" });
    return;
  }
  if (wristbandCards.length >= MAX_CARDS) {
    showToast(`Max ${MAX_CARDS} cards reached — remove a card first`, { type: "warning" });
    return;
  }

  const defaultName = (document.getElementById("scriptName") || {}).value || "From Script";
  const cardName = await showPrompt("Card name:", defaultName, { title: "Create Card from Script", icon: "📋" });
  if (!cardName) return;

  // #148: Preserve script order
  const cardData = Array(CELLS_PER_CARD).fill(null);
  scriptPlays.slice(0, CELLS_PER_CARD).forEach((p, i) => {
    cardData[i] = { ...p, _scriptSource: true };
  });

  historyManager.saveState("wristband", getWristbandState());
  wristbandCards.push({
    name: cardName.trim(),
    data: cardData,
    _source: { type: "script", ts: Date.now() },
  });
  currentCardIndex = wristbandCards.length - 1;

  markWristbandDirty();
  scheduleWristbandAutosave();
  if (typeof refreshWristbandCardView === "function") refreshWristbandCardView();
  if (typeof renderWristbandGrid === "function") renderWristbandGrid();
  updateWristbandSourceBadge();

  const capped = Math.min(scriptPlays.length, CELLS_PER_CARD);
  const overflow = scriptPlays.length - capped;
  showToast(
    `Card "${cardName.trim()}" created — ${capped} play${capped !== 1 ? "s" : ""}${overflow > 0 ? ` (${overflow} didn't fit)` : ""}`,
    { type: "success", duration: 4000 }
  );
}

// ─── #149: Source badge update ────────────────────────────────────────────────
function updateWristbandSourceBadge() {
  const badge = document.getElementById("wbSourceBadge");
  if (!badge) return;
  const card = wristbandCards[currentCardIndex];
  const src = card && card._source;
  if (!src) {
    badge.textContent = "";
    badge.className = "wb-source-badge hidden";
    return;
  }
  const icon = src.type === "gameplan" ? "🎯" : "📋";
  const label = src.type === "gameplan"
    ? `From Game Plan${src.opponent ? ` · vs ${escapeHtml(src.opponent)}` : ""}`
    : "From Script";
  const ts = src.ts ? new Date(src.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  badge.innerHTML = `${icon} ${label}${ts ? ` <span class="wb-source-ts">${ts}</span>` : ""}`;
  badge.className = "wb-source-badge";
}

// ─── #151: Show plays not yet on wristband ────────────────────────────────────
async function showWristbandNotYetList() {
  const card = wristbandCards[currentCardIndex];
  const src = card && card._source;
  let sourcePlays = [];
  let sourceLabel = "";

  if (src && src.type === "gameplan" && typeof _gpEnsureBoard === "function") {
    const board = _gpEnsureBoard();
    const allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
    allBoxes.forEach((b) => (board.assignments[b.id] || []).forEach((p) => sourcePlays.push(p)));
    sourceLabel = `Game Plan${src.opponent ? ` (vs ${src.opponent})` : ""}`;
  } else if (src && src.type === "script" && Array.isArray(script)) {
    sourcePlays = script.filter((s) => !s.isSeparator);
    sourceLabel = "Practice Script";
  } else if (typeof _gpEnsureBoard === "function") {
    const board = _gpEnsureBoard();
    const allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
    allBoxes.forEach((b) => (board.assignments[b.id] || []).forEach((p) => sourcePlays.push(p)));
    sourceLabel = "Game Plan";
  } else {
    showToast("No source available — create a card from Game Plan or Script first", { type: "info" });
    return;
  }

  if (!sourcePlays.length) {
    showToast(`No plays found in ${sourceLabel}`, { type: "info" });
    return;
  }

  const existingSigs = new Set();
  wristbandCards.forEach((c) =>
    c.data.forEach((cell) => {
      if (cell) existingSigs.add(typeof _gpPlaySignature === "function" ? _gpPlaySignature(cell) : JSON.stringify(cell));
    })
  );
  const notYet = sourcePlays.filter((p) => {
    const sig = typeof _gpPlaySignature === "function" ? _gpPlaySignature(p) : JSON.stringify(p);
    return !existingSigs.has(sig);
  });

  if (!notYet.length) {
    showToast(`All ${sourcePlays.length} ${sourceLabel} plays are on the wristband ✓`, { type: "success" });
    return;
  }

  const listHtml = notYet
    .map(
      (p) =>
        `<li style="padding:var(--space-xs) 0;">${escapeHtml([p.formation, p.play].filter(Boolean).join(" — ") || "Unnamed Play")}</li>`
    )
    .join("");

  await showModal(
    `<p style="margin-bottom:var(--space-sm);"><strong>${notYet.length}</strong> of ${sourcePlays.length} ${escapeHtml(sourceLabel)} play${sourcePlays.length !== 1 ? "s" : ""} not yet on wristband:</p>
     <ul style="list-style:disc;margin-left:var(--space-md);max-height:240px;overflow-y:auto;font-size:var(--font-size-sm);">${listHtml}</ul>`,
    { title: `Not Yet on Wristband (${notYet.length})`, icon: "📋" }
  );
}

// ─── #152/#153/#154: Reconcile wristband card with source ────────────────────
async function reconcileWristbandWithSource() {
  const card = wristbandCards[currentCardIndex];
  if (!card) { showToast("No active card", { type: "warning" }); return; }

  const src = card._source;
  let sourcePlays = [];
  let sourceLabel = "";

  if (src && src.type === "gameplan" && typeof _gpEnsureBoard === "function") {
    const board = _gpEnsureBoard();
    const allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
    allBoxes.forEach((b) => (board.assignments[b.id] || []).forEach((p) => sourcePlays.push(p)));
    sourceLabel = `Game Plan${src.opponent ? ` vs ${src.opponent}` : ""}`;
  } else if (src && src.type === "script" && Array.isArray(script)) {
    sourcePlays = script.filter((s) => !s.isSeparator);
    sourceLabel = "Practice Script";
  } else {
    showToast("No source linked to this card. Create from Game Plan or Script first.", { type: "warning" });
    return;
  }

  if (!sourcePlays.length) {
    showToast(`${sourceLabel} has no plays`, { type: "warning" });
    return;
  }

  const sig = (p) => (typeof _gpPlaySignature === "function" ? _gpPlaySignature(p) : JSON.stringify(p));
  const sourceSigs = new Set(sourcePlays.map(sig));
  const cardSigs = new Set(card.data.filter(Boolean).map(sig));

  const newPlays = sourcePlays.filter((p) => !cardSigs.has(sig(p)));
  // #153: detect cells that came from source but are no longer in it
  const removedIndices = card.data.reduce((acc, cell, i) => {
    if (cell && (cell._gpSource || cell._scriptSource) && !sourceSigs.has(sig(cell))) acc.push(i);
    return acc;
  }, []);

  if (!newPlays.length && !removedIndices.length) {
    showToast(`Wristband is already in sync with ${escapeHtml(sourceLabel)} ✓`, { type: "success" });
    return;
  }

  const parts = [
    newPlays.length ? `<strong>${newPlays.length}</strong> new play${newPlays.length !== 1 ? "s" : ""} to add` : "",
    removedIndices.length ? `<strong>${removedIndices.length}</strong> stale play${removedIndices.length !== 1 ? "s" : ""} to remove` : "",
  ].filter(Boolean).join(" · ");

  const ok = await showConfirm(
    `<p>${parts}</p><p style="margin-top:var(--space-sm);font-size:var(--font-size-sm);color:var(--color-text-muted);">Manual cell colors and write-ins are preserved. Only source-tagged cells are removed.</p>`,
    { title: `Reconcile with ${sourceLabel}`, icon: "🔄", confirmText: "Reconcile" }
  );
  if (!ok) return;

  // #154: snapshot for undo — preserves all customizations
  const preSnapshot = safeDeepClone(card.data);
  historyManager.saveState("wristband", getWristbandState());

  // Remove stale source-tagged plays (#153)
  removedIndices.forEach((i) => { card.data[i] = null; });

  // Fill empty cells with new plays (#152)
  const emptyIndices = card.data.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  let added = 0;
  newPlays.forEach((p, pi) => {
    if (pi >= emptyIndices.length) return;
    card.data[emptyIndices[pi]] = { ...p, _gpSource: src.type === "gameplan", _scriptSource: src.type === "script" };
    added++;
  });

  if (card._source) card._source.ts = Date.now();

  markWristbandDirty();
  scheduleWristbandAutosave();
  if (typeof renderWristbandGrid === "function") renderWristbandGrid();
  updateWristbandSourceBadge();

  const summary = [added > 0 ? `+${added} added` : "", removedIndices.length > 0 ? `-${removedIndices.length} removed` : ""].filter(Boolean).join(", ");
  showUndoToast(`Reconciled: ${summary}`, () => {
    card.data = preSnapshot;
    if (card._source) card._source.ts = src.ts;
    markWristbandDirty();
    if (typeof renderWristbandGrid === "function") renderWristbandGrid();
    updateWristbandSourceBadge();
    showToast("Reconcile undone", { type: "info" });
  }, 8000);
}

// ─── #155: Send wristband card to Call Sheet ─────────────────────────────────
async function sendWristbandToCallSheet() {
  if (typeof callSheet === "undefined" || typeof CALLSHEET_CATEGORIES === "undefined") {
    showToast("Open Call Sheet tab first to initialize it", { type: "warning" });
    return;
  }
  const card = wristbandCards[currentCardIndex];
  if (!card) { showToast("No active card", { type: "warning" }); return; }

  const plays = card.data.filter(Boolean);
  if (!plays.length) { showToast("Current card is empty", { type: "warning" }); return; }

  if (typeof _gpComputeCallSheetTargets !== "function" || typeof _gpPushPlayIntoCategory !== "function") {
    showToast("Call sheet mapping unavailable", { type: "warning" });
    return;
  }

  const fanOut = plays.map((play) => ({ play, targets: _gpComputeCallSheetTargets(play, play.type || "") }));
  const byCat = {};
  fanOut.forEach(({ targets }) => targets.forEach((id) => { byCat[id] = (byCat[id] || 0) + 1; }));
  const filledCatIds = Object.keys(byCat);

  if (!filledCatIds.length) {
    showToast(
      "Wristband plays don't match any call sheet category. Set Preferred Down/Distance/Type on those plays.",
      { type: "warning", duration: 5000 }
    );
    return;
  }

  const summaryItems = CALLSHEET_CATEGORIES.filter((c) => byCat[c.id])
    .map((c) => {
      const dn = typeof getCategoryDisplayName === "function" ? getCategoryDisplayName(c) : c.name;
      return `<li>${escapeHtml(dn)}: <strong>${byCat[c.id]}</strong></li>`;
    })
    .join("");

  const choice = await showChoice(
    `<p>Send <strong>${plays.length}</strong> play${plays.length !== 1 ? "s" : ""} from <strong>${escapeHtml(card.name || "this card")}</strong> into <strong>${filledCatIds.length}</strong> call sheet categor${filledCatIds.length !== 1 ? "ies" : "y"}?</p>
     <details style="font-size:var(--font-size-sm);"><summary style="cursor:pointer;color:var(--color-text-muted);">Show breakdown</summary><ul style="margin:var(--space-xs) 0 0 var(--space-md);">${summaryItems}</ul></details>`,
    { title: "Send to Call Sheet", icon: "📄", option1: "Append to existing", option2: "Replace categories" }
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
      showToast("Wristband → Call Sheet undone", { type: "info" });
    },
    8000
  );
  if (pushed > 0 && typeof showTab === "function") showTab("callsheet");
}
