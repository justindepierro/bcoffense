const WRISTBAND_PRINT_WIDTH = "4.5in";
const WRISTBAND_PRINT_HEIGHT = "2.6in";
const WRISTBAND_PRINT_SIZE_LABEL = "4.5 x 2.6 in";
const WRISTBAND_PRINT_CARDS_PER_SHEET = 3;

function _applyWristbandPrintDimensions() {
  const previousWidth = document.body.style.getPropertyValue("--wristband-print-width");
  const previousHeight = document.body.style.getPropertyValue("--wristband-print-height");

  document.body.style.setProperty("--wristband-print-width", WRISTBAND_PRINT_WIDTH);
  document.body.style.setProperty("--wristband-print-height", WRISTBAND_PRINT_HEIGHT);

  return function restoreWristbandPrintDimensions() {
    if (previousWidth) {
      document.body.style.setProperty("--wristband-print-width", previousWidth);
    } else {
      document.body.style.removeProperty("--wristband-print-width");
    }
    if (previousHeight) {
      document.body.style.setProperty("--wristband-print-height", previousHeight);
    } else {
      document.body.style.removeProperty("--wristband-print-height");
    }
  };
}

function _buildWristbandPrintSheets(cardHtml, repeatSingleCard = false) {
  const cards = repeatSingleCard ? [cardHtml[0], cardHtml[0], cardHtml[0]] : cardHtml;
  const sheets = [];

  for (let i = 0; i < cards.length; i += WRISTBAND_PRINT_CARDS_PER_SHEET) {
    sheets.push(
      `<section class="wristband-print-sheet">${cards
        .slice(i, i + WRISTBAND_PRINT_CARDS_PER_SHEET)
        .join("")}</section>`,
    );
  }

  return sheets.join("");
}

function printWristband() {
  openWristbandPrintPreview(wbPlayerCardMode ? "player-all" : "classic");
}

function _executeClassicWristbandPrint(cardIndexes, layoutMode = "sheet") {
  try {
    const cellsPerCard = getActiveWristbandCellCount();
    const selectedCards = (Array.isArray(cardIndexes) ? cardIndexes : [])
      .map((cardIdx) => ({ cardIdx, card: wristbandCards[cardIdx] }))
      .filter(({ card }) => card?.data?.slice(0, cellsPerCard).some(Boolean));
    if (selectedCards.length === 0) {
      showToast("No plays on the wristband to print.", { type: "warning" });
      return;
    }

    showToast(`Print at 100% or Actual Size for a ${WRISTBAND_PRINT_SIZE_LABEL} wristband.`, {
      duration: 4000,
      type: "info",
    });
    const container = document.getElementById("wristbandPrintCards");
    const opts = getWristbandDisplayOptions();
    const { highlightHuddle, highlightCandy } = opts;
    const printDisplayCache = new Map();
    const getPrintDisplay = (play, custom) => {
      if (!play) return "";
      let variants = printDisplayCache.get(play);
      if (!variants) {
        variants = new Map();
        printDisplayCache.set(play, variants);
      }
      const variantKey = JSON.stringify({
        formationTags: getCustomFormationTagEntries(custom),
        backTags: getCustomBackTagEntries(custom),
        markers: getCellMarkerValues(custom),
        markerPlacement: getCellMarkerPlacement(custom, opts),
        extraPersonnel: custom?.extraPersonnel || "",
        preShift: getCustomPreShiftValues(custom),
        componentOrder: custom?.componentOrder || [],
      });
      if (variants.has(variantKey)) return variants.get(variantKey);
      const rendered = renderWristbandCellCall(play, custom, opts);
      variants.set(variantKey, rendered);
      return rendered;
    };

    const cardHtml = [];

    selectedCards.forEach(({ card, cardIdx }) => {
      let html = `<div class="wristband-card"><div class="wristband-grid" style="grid-template-rows: repeat(${WB_ROWS}, 1fr);">`;

      const cardOffset = cardIdx * CELLS_PER_CARD;
      const pCardColor = card.cardColor || "";

      for (let row = 0; row < WB_ROWS; row++) {
        const oddNum = row * 2 + WRISTBAND_OFFSET + cardOffset;
        const evenNum = row * 2 + WRISTBAND_OFFSET + 1 + cardOffset;
        const oddIndex = row * 2;
        const evenIndex = row * 2 + 1;

        const oddPlay = card.data[oddIndex];
        const evenPlay = card.data[evenIndex];

        const oddKey = `${cardIdx}-${oddIndex}`;
        const evenKey = `${cardIdx}-${evenIndex}`;
        const oddCustom = cellCustomizations[oddKey] || {};
        const evenCustom = cellCustomizations[evenKey] || {};

        const oddIsHuddle =
          highlightHuddle &&
          oddPlay &&
          oddPlay.tempo &&
          oddPlay.tempo.toLowerCase() === "huddle";
        const evenIsHuddle =
          highlightHuddle &&
          evenPlay &&
          evenPlay.tempo &&
          evenPlay.tempo.toLowerCase() === "huddle";
        const oddIsCandy =
          highlightCandy &&
          oddPlay &&
          oddPlay.tempo &&
          oddPlay.tempo.toLowerCase() === "candy";
        const evenIsCandy =
          highlightCandy &&
          evenPlay &&
          evenPlay.tempo &&
          evenPlay.tempo.toLowerCase() === "candy";

        const oddBg = getCellBgColor(oddCustom, oddIsHuddle, oddIsCandy, row, pCardColor);
        let oddStyle = oddBg ? `background:${oddBg};` : "";
        oddStyle += oddCustom.textColor ? `color:${oddCustom.textColor};` : "";

        const evenBg = getCellBgColor(evenCustom, evenIsHuddle, evenIsCandy, row, pCardColor);
        let evenStyle = evenBg ? `background:${evenBg};` : "";
        evenStyle += evenCustom.textColor
          ? `color:${evenCustom.textColor};`
          : "";

        const oddNumBg = oddBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
        const oddNumFg = oddBg ? (isColorDark(oddBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
        const evenNumBg = evenBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
        const evenNumFg = evenBg ? (isColorDark(evenBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
        html += `<div class="wristband-cell num-cell" style="background: ${oddNumBg}; color: ${oddNumFg};">${oddNum}</div>`;
        const oddDisplay = oddPlay ? getPrintDisplay(oddPlay, oddCustom) : "";
        const oddCellInner = oddPlay ? oddDisplay : "";
        html += `<div class="wristband-cell${oddPlay ? " filled" : ""}" style="${oddStyle}"><span class="cell-play">${oddCellInner}</span></div>`;
        html += `<div class="wristband-cell num-cell" style="background: ${evenNumBg}; color: ${evenNumFg};">${evenNum}</div>`;
        const evenDisplay = evenPlay ? getPrintDisplay(evenPlay, evenCustom) : "";
        const evenCellInner = evenPlay ? evenDisplay : "";
        html += `<div class="wristband-cell${evenPlay ? " filled" : ""}" style="${evenStyle}"><span class="cell-play">${evenCellInner}</span></div>`;
      }

      html += "</div></div>";
      cardHtml.push(html);
    });

    if (layoutMode === "one-per-page") {
      container.innerHTML = cardHtml
        .map((html) => `<section class="wristband-print-sheet">${html}</section>`)
        .join("");
      container.className = "wristband-print-sheets single-card-layout";
    } else if (layoutMode === "three-copies") {
      container.innerHTML = cardHtml
        .map(
          (html) =>
            `<section class="wristband-print-sheet">${html}${html}${html}</section>`,
        )
        .join("");
      container.className = "wristband-print-sheets single-card-tripled";
    } else {
      container.innerHTML = _buildWristbandPrintSheets(cardHtml, false);
      container.className = "wristband-print-sheets multi-card-layout";
    }

    document.getElementById("wristbandPrint").classList.remove("hidden");
    document.body.dataset.printMode = "wristband";
    const restorePrintDimensions = _applyWristbandPrintDimensions();
    setupPrintPageStyle(`
      @media print {
        @page { size: letter portrait; margin: 0; }
        html, body { width: 8.5in !important; }
      }
    `);

    setTimeout(() => {
      const restoreTitle = setPrintTitle("Wristband");
      try {
        window.print();
      } finally {
        restoreTitle();
        restorePrintDimensions();
        document.getElementById("wristbandPrint").classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 100);
  } catch (err) {
    console.error("printWristband error:", err);
    showToast("❌ Error printing wristband.", {
      duration: 4000,
      type: "error",
    });
  }
}

function exportWristbandCSV() {
  const rows = [
    [
      "Card",
      "Cell#",
      "Formation",
      "Protection",
      "Play",
      "Type",
      "Personnel",
      "BgColor",
      "Markers",
      "Marker Placement",
    ],
  ];

  const cellsPerCard = getActiveWristbandCellCount();
  wristbandCards.forEach((card, cardIdx) => {
    const cardOffset = cardIdx * cellsPerCard;
    card.data.slice(0, cellsPerCard).forEach((play, cellIdx) => {
      const cellNum = cellIdx + WRISTBAND_OFFSET + cardOffset;
      const key = `${cardIdx}-${cellIdx}`;
      const custom = cellCustomizations[key] || {};
      if (play) {
        rows.push([
          card.name,
          cellNum,
          play.formation || "",
          play.protection || "",
          play.play || "",
          play.type || "",
          play.personnel || "",
          custom.bgColor || "",
          getCellMarkerValues(custom).join(" "),
          getCellMarkerValues(custom).length > 0
            ? getCellMarkerPlacement(custom, getWristbandDisplayOptions())
            : "",
        ]);
      }
    });
  });

  const csvContent = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = typeof getPrintStudioExportName === "function"
    ? getPrintStudioExportName("Wristband", "", "csv")
    : `wristband-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("📥 CSV exported");
}

// ─── Wristband Type Choice ────────────────────────────────────────────────

/**
 * Show the landing overlay if the wristband is completely empty
 * and no type has been chosen. Called on tab switch and after clear-all.
 */
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

async function startNewWristband() {
  const hasPlays = wristbandCards.some((card) => card.data?.some(Boolean));
  if (hasPlays) {
    const confirmed = await showConfirm(
      "Start a new wristband? The current workspace will be cleared.",
      {
        title: "New Wristband",
        icon: "📋",
        confirmText: "Start New",
        danger: true,
      },
    );
    if (!confirmed) return;
  }

  wristbandCards = [
    { name: "Card 1", data: Array(CELLS_PER_CARD).fill(null) },
  ];
  cellCustomizations = {};
  currentCardIndex = 0;
  clearBatchSelect();
  wbSelectionMode = false;
  document.getElementById("wristband")?.classList.remove("wb-selection-mode");
  historyManager.clear("wristband");
  discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
  markWristbandClean();
  showWbTypeChoice();
  renderCardTabs();
  renderWristbandGrid();
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

// ─── Player Wristband Print ────────────────────────────────────────────────

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

// ─── Player Wristband Print Helpers ────────────────────────────────────────

/**
 * Build a single player wristband block for print.
 * 3-column grid: [num | play | responsibility] × 20 rows.
 * Returns a .pc-print-card-wrap div.
 */
function _buildPlayerPrintCard(card, cardIdx, posKey, opts, printOpts = {}) {
  const { highlightHuddle, highlightCandy } = opts;
  const blankRules = Boolean(printOpts.blankRules);
  const cardOffset = cardIdx * WB_ROWS;
  const pCardColor = card.cardColor || "";

  let cells = "";
  for (let i = 0; i < WB_ROWS; i++) {
    const play = card.data[i];
    const playNum = i + WRISTBAND_OFFSET + cardOffset;
    const custom = cellCustomizations[`${cardIdx}-${i}`] || {};
    const respText = blankRules ? "" : getPlayerAssignmentText(play, custom, posKey);

    const isHuddle = highlightHuddle && play && play.tempo && play.tempo.toLowerCase() === "huddle";
    const isCandy = highlightCandy && play && play.tempo && play.tempo.toLowerCase() === "candy";
    const bg = getCellBgColor(custom, isHuddle, isCandy, i, pCardColor);
    const numBg = bg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const numFg = bg
      ? (isColorDark(bg) ? "white" : UI_COLORS.textDark)
      : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");

    cells += `<div class="wristband-cell num-cell" style="background:${numBg};color:${numFg};">${playNum}</div>`;

    if (play) {
      let cellStyle = bg ? `background:${bg};` : "";
      cellStyle += custom.textColor ? `color:${custom.textColor};` : "";
      const cellInner = renderWristbandCellCall(play, custom, opts);
      cells += `<div class="wristband-cell filled" style="${cellStyle}"><span class="cell-play">${cellInner}</span></div>`;
    } else {
      cells += `<div class="wristband-cell"></div>`;
    }

    cells += blankRules
      ? '<div class="wristband-cell pc-print-assignment pc-print-assignment-blank"><span aria-hidden="true"></span></div>'
      : `<div class="wristband-cell pc-print-assignment">${escapeHtml(respText)}</div>`;
  }

  return `<div class="pc-print-card-wrap">
    <div class="wristband-card">
      <div class="wristband-grid" style="grid-template-columns:22px 1fr 1fr;grid-template-rows:repeat(${WB_ROWS},1fr);">
        ${cells}
      </div>
    </div>
  </div>`;
}

let wbPrintPreviewMode = "classic-sheet";

function _getWbPrintScriptPageMeta(card) {
  const name = String(card?.name || "").trim();
  const match = name.match(/^(.+?)\s+(\d+)\/(\d+)$/);
  if (!match) return null;
  const page = parseInt(match[2], 10);
  const total = parseInt(match[3], 10);
  if (!Number.isInteger(page) || !Number.isInteger(total) || page < 1 || total < page) {
    return null;
  }
  return {
    title: match[1].trim(),
    page,
    total,
  };
}

function _getWbPrintCardPlayCount(card) {
  return (card?.data || [])
    .slice(0, getActiveWristbandCellCount())
    .filter(Boolean).length;
}

function _getWbDefaultPrintCardIndexes(isPlayer) {
  const playableIndexes = wristbandCards
    .map((card, cardIdx) => ({ card, cardIdx, count: _getWbPrintCardPlayCount(card) }))
    .filter((entry) => entry.count > 0);
  if (playableIndexes.length === 0) return [];

  if (isPlayer) {
    const scriptGroups = new Map();
    playableIndexes.forEach(({ card, cardIdx }) => {
      const meta = _getWbPrintScriptPageMeta(card);
      if (!meta) return;
      const key = `${meta.title}::${meta.total}`;
      if (!scriptGroups.has(key)) {
        scriptGroups.set(key, { title: meta.title, total: meta.total, entries: [] });
      }
      scriptGroups.get(key).entries.push({ cardIdx, page: meta.page });
    });

    if (scriptGroups.size > 0) {
      const activeGroup = Array.from(scriptGroups.values()).find((group) =>
        group.entries.some((entry) => entry.cardIdx === currentCardIndex),
      );
      const groups = Array.from(scriptGroups.values());
      const group = activeGroup || groups[groups.length - 1];
      return group.entries
        .slice()
        .sort((left, right) => left.page - right.page)
        .map((entry) => entry.cardIdx);
    }
  }

  const activeEntry = playableIndexes.find((entry) => entry.cardIdx === currentCardIndex);
  return [activeEntry?.cardIdx ?? playableIndexes[0].cardIdx];
}

function _getWbPrintCardLabel(card, cardIdx, count) {
  const meta = _getWbPrintScriptPageMeta(card);
  if (meta) {
    return {
      primary: `Page ${meta.page} of ${meta.total}`,
      secondary: `${meta.title} · ${count} play${count === 1 ? "" : "s"}`,
      isScriptPage: true,
    };
  }
  return {
    primary: card?.name || `Card ${cardIdx + 1}`,
    secondary: `${count} play${count === 1 ? "" : "s"}`,
    isScriptPage: false,
  };
}

function openWristbandPrintPreview(requestedMode = "classic") {
  const hasPlays = wristbandCards.some((card) =>
    card.data?.slice(0, getActiveWristbandCellCount()).some(Boolean),
  );
  if (!hasPlays) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }

  const isPlayer = String(requestedMode).startsWith("player");
  const layoutSelect = document.getElementById("wbPrintLayoutMode");
  if (!layoutSelect) return;
  layoutSelect.innerHTML = isPlayer
    ? `
      <option value="player-one">One wristband per page</option>
      <option value="player-three">Three copies per page</option>
      <option value="player-all">Selected positions, three per page</option>
    `
    : `
      <option value="classic-one">One wristband per page</option>
      <option value="classic-sheet">Up to three cards per page</option>
      <option value="classic-three">Three copies of each card per page</option>
    `;
  wbPrintPreviewMode = isPlayer
    ? (requestedMode === "player" ? "player-all" : requestedMode)
    : "classic-sheet";
  layoutSelect.value = wbPrintPreviewMode;

  const defaultCardIndexes = new Set(_getWbDefaultPrintCardIndexes(isPlayer));
  const hasScriptPages = wristbandCards.some((card) => _getWbPrintScriptPageMeta(card));
  const cardLegend = document.getElementById("wbPrintCardLegend");
  const cardHelp = document.getElementById("wbPrintCardHelp");
  if (cardLegend) {
    cardLegend.textContent = isPlayer && hasScriptPages ? "Script Pages" : "Cards";
  }
  if (cardHelp) {
    cardHelp.textContent =
      isPlayer && hasScriptPages
        ? "Defaults to the active script page group. Use Default, All, or Clear to change the print target."
        : "Defaults to the current card. Select more cards only when you want a multi-card print.";
  }

  const cardChoices = document.getElementById("wbPrintCardChoices");
  if (cardChoices) {
    cardChoices.innerHTML = wristbandCards
      .map((card, cardIdx) => {
        const count = _getWbPrintCardPlayCount(card);
        const label = _getWbPrintCardLabel(card, cardIdx, count);
        return `<label class="wb-print-card-choice-row${label.isScriptPage ? " is-script-page" : ""}">
          <input type="checkbox" class="wb-print-card-choice" value="${cardIdx}" ${defaultCardIndexes.has(cardIdx) ? "checked" : ""} ${count > 0 ? "" : "disabled"}
            data-onchange="renderWristbandPrintPreview" />
          <span class="wb-print-choice-copy">
            <span class="wb-print-choice-title">${escapeHtml(label.primary)}</span>
            <small>${escapeHtml(label.secondary)}</small>
          </span>
        </label>`;
      })
      .join("");
  }

  const positionChoices = document.getElementById("wbPrintPositionChoices");
  if (positionChoices) {
    positionChoices.innerHTML = PLAYER_WRISTBAND_POSITIONS.map(
      (position) => `<label>
        <input type="checkbox" class="wb-print-position-choice" value="${escapeHtml(position.key)}"
          ${wbPrintPreviewMode === "player-all" || position.key === wbPlayerCardPos ? "checked" : ""}
          data-onchange="renderWristbandPrintPreview" />
        <span>${escapeHtml(position.label)}</span>
      </label>`,
    ).join("");
  }

  const blankRulesToggle = document.getElementById("wbPrintBlankRules");
  if (blankRulesToggle) {
    blankRulesToggle.checked = Boolean(
      isPlayer && getWristbandDisplayOptions().blankPlayerRules,
    );
  }

  renderWristbandPrintPreview();
  const overlay = setWristbandOverlayVisibility(
    "wbPrintPreviewOverlay",
    true,
    { visibilityClass: "show", openClass: true },
  );
  if (overlay) trapFocus(overlay);
}

function closeWristbandPrintPreview() {
  setWristbandOverlayVisibility(
    "wbPrintPreviewOverlay",
    false,
    { visibilityClass: "show", openClass: true },
  );
}

function _getSelectedWbPrintCards() {
  return Array.from(document.querySelectorAll(".wb-print-card-choice:checked"))
    .map((input) => parseInt(input.value, 10))
    .filter(Number.isInteger);
}

function _getSelectedWbPrintPositions() {
  return Array.from(
    document.querySelectorAll(".wb-print-position-choice:checked"),
  ).map((input) => input.value);
}

function _getWbPrintBlankRules() {
  return Boolean(document.getElementById("wbPrintBlankRules")?.checked);
}

function _setWbPrintChoices(selector, checked) {
  document.querySelectorAll(selector).forEach((input) => {
    if (!input.disabled) input.checked = checked;
  });
  renderWristbandPrintPreview();
}

function selectAllWbPrintCards() {
  _setWbPrintChoices(".wb-print-card-choice", true);
}

function clearAllWbPrintCards() {
  _setWbPrintChoices(".wb-print-card-choice", false);
}

function selectCurrentWbPrintCard() {
  const current = _getWbDefaultPrintCardIndexes(
    String(wbPrintPreviewMode).startsWith("player"),
  );
  const currentSet = new Set(current);
  document.querySelectorAll(".wb-print-card-choice").forEach((input) => {
    const cardIdx = parseInt(input.value, 10);
    input.checked = currentSet.has(cardIdx) && !input.disabled;
  });
  renderWristbandPrintPreview();
}

function selectAllWbPrintPositions() {
  _setWbPrintChoices(".wb-print-position-choice", true);
}

function clearAllWbPrintPositions() {
  _setWbPrintChoices(".wb-print-position-choice", false);
}

function _getWristbandPrintWarnings(cardIndexes, positionKeys, isPlayer, blankRules = false) {
  const warnings = [];
  const signatures = new Map();
  let longCalls = 0;
  let longAssignments = 0;
  cardIndexes.forEach((cardIdx) => {
    const card = wristbandCards[cardIdx];
    if (!card) return;
    card.data.slice(0, isPlayer ? WB_ROWS : CELLS_PER_CARD).forEach((play, cellIdx) => {
      if (!play) return;
      const signature = playSignature(play);
      signatures.set(signature, (signatures.get(signature) || 0) + 1);
      const callLength = [
        play.personnel,
        play.formation,
        play.protection,
        play.play,
        play.lineCall,
      ].filter(Boolean).join(" ").length;
      if (callLength > 70) longCalls += 1;
      if (isPlayer && !blankRules) {
        const custom = cellCustomizations[`${cardIdx}-${cellIdx}`] || {};
        positionKeys.forEach((positionKey) => {
          if (getPlayerAssignmentText(play, custom, positionKey).length > 70) {
            longAssignments += 1;
          }
        });
      }
    });
    if (isPlayer && card.data.slice(WB_ROWS, CELLS_PER_CARD).some(Boolean)) {
      warnings.push(`${card.name || `Card ${cardIdx + 1}`} has plays 21-40 that player mode will not print.`);
    }
  });
  const duplicateCount = Array.from(signatures.values()).filter((count) => count > 1).length;
  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} repeated play${duplicateCount === 1 ? "" : "s"} found in the selected cards.`);
  }
  if (longCalls > 0) {
    warnings.push(`${longCalls} long play call${longCalls === 1 ? "" : "s"} may print tightly.`);
  }
  if (longAssignments > 0) {
    warnings.push(`${longAssignments} long assignment${longAssignments === 1 ? "" : "s"} may wrap.`);
  }
  return warnings;
}

function renderWristbandPrintPreview() {
  const layoutSelect = document.getElementById("wbPrintLayoutMode");
  if (!layoutSelect) return;
  wbPrintPreviewMode = layoutSelect.value || wbPrintPreviewMode;
  const isPlayer = wbPrintPreviewMode.startsWith("player");
  const cardIndexes = _getSelectedWbPrintCards();
  const positionKeys = _getSelectedWbPrintPositions();
  const blankRules = isPlayer && _getWbPrintBlankRules();
  const positionFieldset = document.getElementById("wbPrintPositionFieldset");
  const learningFieldset = document.getElementById("wbPrintLearningFieldset");
  positionFieldset?.classList.toggle("hidden", !isPlayer);
  learningFieldset?.classList.toggle("hidden", !isPlayer);

  let pageCount = 0;
  if (wbPrintPreviewMode === "classic-sheet") {
    pageCount = Math.ceil(cardIndexes.length / WRISTBAND_PRINT_CARDS_PER_SHEET);
  } else if (wbPrintPreviewMode.startsWith("classic")) {
    pageCount = cardIndexes.length;
  } else if (wbPrintPreviewMode === "player-all") {
    pageCount = cardIndexes.length * Math.ceil(positionKeys.length / 3);
  } else {
    pageCount = cardIndexes.length;
  }

  const summary = document.getElementById("wbPrintPreviewSummary");
  if (summary) {
    const cardNoun = isPlayer && cardIndexes.some((cardIdx) =>
      _getWbPrintScriptPageMeta(wristbandCards[cardIdx]),
    )
      ? "script page"
      : "card";
    summary.textContent = `${cardIndexes.length} ${cardNoun}${cardIndexes.length === 1 ? "" : "s"} · ${pageCount} print page${pageCount === 1 ? "" : "s"} · ${WRISTBAND_PRINT_SIZE_LABEL}${blankRules ? " · blank rules" : ""}`;
  }

  const warnings = [];
  if (cardIndexes.length === 0) warnings.push("Select at least one card.");
  if (isPlayer && positionKeys.length === 0) warnings.push("Select at least one position.");
  if (isPlayer && wbPrintPreviewMode !== "player-all" && positionKeys.length > 1) {
    warnings.push("One-position layouts print the first selected position only.");
  }
  warnings.push(
    ..._getWristbandPrintWarnings(cardIndexes, positionKeys, isPlayer, blankRules),
  );
  const warningContainer = document.getElementById("wbPrintPreviewWarnings");
  if (warningContainer) {
    warningContainer.innerHTML = warnings.length
      ? warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join("")
      : "<div class=\"wb-print-ready\">Ready to print at Actual Size / 100%.</div>";
  }

  const canvas = document.getElementById("wbPrintPreviewCanvas");
  if (canvas) {
    canvas.innerHTML = "";
    const previewCardIdx = cardIndexes[0];
    const previewPositionKey = positionKeys[0] || wbPlayerCardPos || "respQ";
    if (isPlayer && wristbandCards[previewCardIdx]) {
      canvas.innerHTML = _buildPlayerPrintCard(
        wristbandCards[previewCardIdx],
        previewCardIdx,
        previewPositionKey,
        getWristbandDisplayOptions(),
        { blankRules },
      );
    } else {
      const sourceCard = document.getElementById("wristbandCard");
      if (sourceCard) {
        const clone = sourceCard.cloneNode(true);
        clone.removeAttribute("id");
        clone.style.removeProperty("transform");
        clone.style.removeProperty("transform-origin");
        clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
        clone.querySelectorAll("button, select, textarea, input").forEach((control) => {
          control.setAttribute("disabled", "");
          control.setAttribute("tabindex", "-1");
        });
        canvas.appendChild(clone);
      }
    }
  }

  const executeButton = document.getElementById("wbExecutePrintBtn");
  if (executeButton) {
    executeButton.disabled =
      cardIndexes.length === 0 || (isPlayer && positionKeys.length === 0);
  }
}

function executeWristbandPrintPreview() {
  const cardIndexes = _getSelectedWbPrintCards();
  const positionKeys = _getSelectedWbPrintPositions();
  const blankRules = _getWbPrintBlankRules();
  if (cardIndexes.length === 0) return;
  closeWristbandPrintPreview();

  if (wbPrintPreviewMode === "classic-one") {
    _executeClassicWristbandPrint(cardIndexes, "one-per-page");
  } else if (wbPrintPreviewMode === "classic-three") {
    _executeClassicWristbandPrint(cardIndexes, "three-copies");
  } else if (wbPrintPreviewMode === "classic-sheet") {
    _executeClassicWristbandPrint(cardIndexes, "sheet");
  } else if (wbPrintPreviewMode === "player-one") {
    _executePrintOnePlayerCard(cardIndexes, positionKeys[0], { blankRules });
  } else if (wbPrintPreviewMode === "player-three") {
    _executePrintThreePlayerCardCopies(cardIndexes, positionKeys[0], { blankRules });
  } else {
    _executePrintAllPlayerCards(cardIndexes, positionKeys, { blankRules });
  }
}

function printOnePlayerCard() {
  openWristbandPrintPreview("player-one");
}

function printThreePlayerCardCopies() {
  openWristbandPrintPreview("player-three");
}

function printAllPlayerCards() {
  openWristbandPrintPreview("player-all");
}

/** Print one copy of each card for the current position, one wristband per page. */
function _executePrintOnePlayerCard(cardIndexes, positionKey, printOpts = {}) {
  if (!wristbandCards.some((c) => c.data?.slice(0, WB_ROWS).some(Boolean))) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }
  const posKey = positionKey || wbPlayerCardPos || "respQ";
  const posLabel = _playerPositionLabel(posKey);
  const opts = getWristbandDisplayOptions();

  const printContainer = document.getElementById("playerCardPrint");
  const printContent = document.getElementById("playerCardPrintContent");
  if (!printContainer || !printContent) return;

  let allHtml = "";
  (cardIndexes || []).forEach((cardIdx) => {
    const card = wristbandCards[cardIdx];
    if (!card?.data?.slice(0, WB_ROWS).some(Boolean)) return;
    const cardName = card.name || `Card ${cardIdx + 1}`;
    const cardBlock = _buildPlayerPrintCard(card, cardIdx, posKey, opts, printOpts);
    allHtml += `<div class="pc-print-page pc-print-single">
      <div class="pc-print-page-header">
        <span class="pc-print-pos-label">${escapeHtml(posLabel)}</span>
        <span class="pc-print-card-name">${escapeHtml(cardName)}</span>
      </div>
      ${cardBlock}
    </div>`;
  });

  _triggerPlayerPrint(
    printContainer,
    printContent,
    allHtml,
    `Player Wristband \u2014 ${posLabel}`,
    "portrait",
  );
}

/** Print three identical copies of each card for the current position. */
function _executePrintThreePlayerCardCopies(cardIndexes, positionKey, printOpts = {}) {
  if (!wristbandCards.some((c) => c.data?.slice(0, WB_ROWS).some(Boolean))) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }
  const posKey = positionKey || wbPlayerCardPos || "respQ";
  const posLabel = _playerPositionLabel(posKey);
  const opts = getWristbandDisplayOptions();
  const printContainer = document.getElementById("playerCardPrint");
  const printContent = document.getElementById("playerCardPrintContent");
  if (!printContainer || !printContent) return;

  const allHtml = (cardIndexes || [])
    .map((cardIdx) => {
      const card = wristbandCards[cardIdx];
      if (!card?.data?.slice(0, WB_ROWS).some(Boolean)) return "";
      const cardName = card.name || `Card ${cardIdx + 1}`;
      const cardBlock = _buildPlayerPrintCard(card, cardIdx, posKey, opts, printOpts);
      return `<div class="pc-print-page">
        <div class="pc-print-page-header">
          <span class="pc-print-pos-label">${escapeHtml(posLabel)}</span>
          <span class="pc-print-card-name">${escapeHtml(cardName)}</span>
        </div>
        ${cardBlock}${cardBlock}${cardBlock}
      </div>`;
    })
    .join("");

  _triggerPlayerPrint(
    printContainer,
    printContent,
    allHtml,
    `Player Wristband \u2014 ${posLabel} \u2014 3 Copies`,
    "portrait",
  );
}

/**
 * "Print All" — all positions, 3 per portrait page.
 * Each page stacks 3 position cards with their assignments.
 */
function _executePrintAllPlayerCards(cardIndexes, positionKeys, printOpts = {}) {
  if (!wristbandCards.some((c) => c.data?.slice(0, WB_ROWS).some(Boolean))) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }
  const opts = getWristbandDisplayOptions();

  const printContainer = document.getElementById("playerCardPrint");
  const printContent = document.getElementById("playerCardPrintContent");
  if (!printContainer || !printContent) return;

  let allHtml = "";

  // For each wristband card, print all positions 3 per page
  const positions = PLAYER_WRISTBAND_POSITIONS.filter((position) =>
    (positionKeys || []).includes(position.key),
  );
  (cardIndexes || []).forEach((cardIdx) => {
    const card = wristbandCards[cardIdx];
    if (!card?.data?.slice(0, WB_ROWS).some(Boolean)) return;
    const cardName = card.name || `Card ${cardIdx + 1}`;
    for (let p = 0; p < positions.length; p += 3) {
      const group = positions.slice(p, p + 3);
      let pageBlocks = "";
      group.forEach((pos) => {
        const posBlock = _buildPlayerPrintCard(card, cardIdx, pos.key, opts, printOpts);
        pageBlocks += `<div class="pc-print-stack-item">
          <div class="pc-print-page-header">
            <span class="pc-print-pos-label">${escapeHtml(pos.label)}</span>
            <span class="pc-print-card-name">${escapeHtml(cardName)}</span>
          </div>
          ${posBlock}
        </div>`;
      });
      allHtml += `<div class="pc-print-page pc-print-stacked">${pageBlocks}</div>`;
    }
  });

  _triggerPlayerPrint(
    printContainer,
    printContent,
    allHtml,
    "Player Wristbands \u2014 All Positions",
    "portrait",
  );
}

function _triggerPlayerPrint(printContainer, printContent, html, title, orientation) {
  printContent.innerHTML = html;
  document.body.dataset.printMode = "playerCards";
  printContainer.classList.remove("hidden");
  const restorePrintDimensions = _applyWristbandPrintDimensions();

  // Directly hide all other body children so they don't show through Chrome's print dialog
  const _ghostEls = Array.from(document.body.children).filter(el => el !== printContainer);
  _ghostEls.forEach(el => { el.style.visibility = "hidden"; });

  setupPrintPageStyle(`
    @media print {
      @page { size: letter ${orientation}; margin: 0; }
    }
  `);

  setTimeout(() => {
    try {
      const restoreTitle = typeof setPrintTitle === "function" ? setPrintTitle(title) : () => { };
      window.print();
      if (typeof restoreTitle === "function") restoreTitle();
    } finally {
      _ghostEls.forEach(el => { el.style.visibility = ""; });
      restorePrintDimensions();
      printContainer.classList.add("hidden");
      delete document.body.dataset.printMode;
    }
  }, 100);
}

function printPlayerCards() {
  // Now routes to printOnePlayerCard for backward compat
  printOnePlayerCard();
}
