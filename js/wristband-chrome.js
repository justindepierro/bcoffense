// wristband-chrome.js — Wristband mode management and player card UI
// Extracted from wristband-export.js

function checkShowWbLanding() {
  if (wristbandType) return; // type already chosen
  const isEmpty = wristbandCards.every((c) => !c.data?.some(Boolean));
  if (isEmpty) showWbTypeChoice();
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

function showWbTypeChoice() {
  resetActiveWristbandIdentity();
  wristbandType = "";
  updateWristbandModeChrome("");
  // Deactivate player mode if it was on
  if (wbPlayerCardMode) {
    wbPlayerCardMode = false;
    document.getElementById("pcModeBar")?.classList.remove("visible");
    const grid = document.getElementById("wristbandGrid");
    if (grid) grid.classList.remove("pc-grid-active");
    document.getElementById("wristbandCard")?.classList.remove("pc-card-active");
  }
  // Toggle visibility
  document.getElementById("wbTypeChoice")?.classList.remove("hidden");
  document.getElementById("pcModeBar")?.classList.remove("visible");
  document.querySelector(".wb-toolbar")?.classList.add("wb-toolbar-hidden");
  document.querySelector(".card-tabs")?.classList.add("wb-hidden");
  document.getElementById("wristbandCard")?.classList.add("wb-hidden");
}

function startClassicWristband() {
  wristbandType = "classic";
  updateWristbandModeChrome("classic");
  wbPlayerCardMode = false;
  document.getElementById("wbTypeChoice")?.classList.add("hidden");
  document.querySelector(".wb-toolbar")?.classList.remove("wb-toolbar-hidden");
  document.querySelector(".card-tabs")?.classList.remove("wb-hidden");
  document.getElementById("wristbandCard")?.classList.remove("wb-hidden");
  document.getElementById("pcModeBar")?.classList.remove("visible");
  document.getElementById("wristbandGrid")?.classList.remove("pc-grid-active");
  document.getElementById("wristbandCard")?.classList.remove("pc-card-active");
  renderCardTabs();
  renderWristbandGrid();
}

function startPlayerWristband() {
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
  updateWristbandModeChrome("player");
  document.getElementById("wbTypeChoice")?.classList.add("hidden");
  document.querySelector(".wb-toolbar")?.classList.add("wb-toolbar-hidden");
  document.querySelector(".card-tabs")?.classList.remove("wb-hidden");
  document.getElementById("wristbandCard")?.classList.remove("wb-hidden");
  // Activate player wristband mode
  wbPlayerCardMode = true;
  const posSelect = document.getElementById("pcPosSelect");
  wbPlayerCardPos = posSelect ? posSelect.value || "respQ" : "respQ";
  syncWristbandLineCallOnlyControls("classic");
  document.getElementById("pcModeBar")?.classList.add("visible");
  renderCardTabs();
  renderPlayerCardGrid();
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
  if (!grid) return;

  const card = wristbandCards[currentCardIndex];
  if (!card) {
    grid.innerHTML = "";
    syncWristbandGridEmptyState([], WB_ROWS);
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
