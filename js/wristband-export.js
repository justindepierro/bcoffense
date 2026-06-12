const WRISTBAND_PRINT_WIDTH = "4.7in";
const WRISTBAND_PRINT_HEIGHT = "2.8in";
const WRISTBAND_PRINT_SIZE_LABEL = "4.7 x 2.8 in";
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
  try {
    if (wbPlayerCardMode) {
      printAllPlayerCards();
      return;
    }

    const cellsPerCard = getActiveWristbandCellCount();
    if (
      !wristbandCards.some((card) =>
        card.data?.slice(0, cellsPerCard).some(Boolean),
      )
    ) {
      showToast("No plays on the wristband to print.", { type: "warning" });
      return;
    }

    showToast(`Print at 100% or Actual Size for a ${WRISTBAND_PRINT_SIZE_LABEL} wristband.`, {
      duration: 4000,
      type: "info",
    });
    const container = document.getElementById("wristbandPrintCards");
    const numCards = wristbandCards.length;
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

    wristbandCards.forEach((card, cardIdx) => {
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

    container.innerHTML = _buildWristbandPrintSheets(cardHtml, numCards === 1);
    container.className = numCards === 1
      ? "wristband-print-sheets single-card-tripled"
      : "wristband-print-sheets multi-card-layout";

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

function showWbTypeChoice() {
  wristbandType = "";
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
  wristbandType = "player";
  document.getElementById("wbTypeChoice")?.classList.add("hidden");
  document.querySelector(".wb-toolbar")?.classList.add("wb-toolbar-hidden");
  document.querySelector(".card-tabs")?.classList.remove("wb-hidden");
  document.getElementById("wristbandCard")?.classList.remove("wb-hidden");
  // Activate player wristband mode
  playerCardOverrides = {};
  wbPlayerCardMode = true;
  const posSelect = document.getElementById("pcPosSelect");
  wbPlayerCardPos = posSelect ? posSelect.value || "respQ" : "respQ";
  syncWristbandLineCallOnlyControls("classic");
  document.getElementById("pcModeBar")?.classList.add("visible");
  renderCardTabs();
  renderPlayerCardGrid();
}

// ─── Player Wristband Print ────────────────────────────────────────────────

/** Positions available in player wristband print (must stay in sync with RESP_POSITIONS). */
const PC_POSITIONS = [
  { key: "respQ", label: "Q" },
  { key: "respT", label: "T" },
  { key: "respH", label: "H" },
  { key: "respZ", label: "Z" },
  { key: "respX", label: "X" },
  { key: "respY", label: "Y" },
  { key: "respLT", label: "LT" },
  { key: "respLG", label: "LG" },
  { key: "respC", label: "C" },
  { key: "respRG", label: "RG" },
  { key: "respRT", label: "RT" },
];

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

function renderPlayerCardGrid() {
  const grid = document.getElementById("wristbandGrid");
  if (!grid) return;

  const card = wristbandCards[currentCardIndex];
  if (!card) { grid.innerHTML = ""; return; }

  // Player wristbands use one play per row, half the classic card capacity.
  const cardOffset = currentCardIndex * WB_ROWS;
  const opts = getWristbandDisplayOptions();
  const { highlightHuddle, highlightCandy } = opts;
  const pCardColor = card.cardColor || "";

  // 3 columns: [num (32px) | play name (1fr) | responsibility (1fr)] × 20 rows
  // Same on-screen dimensions as classic, with one play and assignment per row.
  let html = "";
  for (let i = 0; i < WB_ROWS; i++) {
    const play = card.data[i];
    const playNum = i + WRISTBAND_OFFSET + cardOffset;
    const custom = cellCustomizations[`${currentCardIndex}-${i}`] || {};
    const overrideKey = `${wbPlayerCardPos}|${currentCardIndex}|${i}`;
    const respText = (playerCardOverrides[wbPlayerCardPos]?.[currentCardIndex]?.[i])
      ?? (play?.[wbPlayerCardPos] || "");

    const isHuddle = highlightHuddle && play && play.tempo && play.tempo.toLowerCase() === "huddle";
    const isCandy = highlightCandy && play && play.tempo && play.tempo.toLowerCase() === "candy";
    const bg = getCellBgColor(custom, isHuddle, isCandy, i, pCardColor);
    const numBg = bg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const numFg = bg
      ? (isColorDark(bg) ? "white" : UI_COLORS.textDark)
      : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");

    // Number cell
    html += `<div class="wristband-cell num-cell" style="background:${numBg};color:${numFg};">${playNum}</div>`;

    // Play call cell — data-drag attrs required for click/drag handlers
    if (play) {
      let cellStyle = bg ? `background:${bg};` : "";
      cellStyle += custom.textColor ? `color:${custom.textColor};` : "";
      const cellInner = renderWristbandCellCall(play, custom, opts);
      html += `<div class="wristband-cell filled" style="${cellStyle}"
        draggable="true" data-drag="wbCell" data-cell-idx="${i}" data-card="${currentCardIndex}">
        <span class="cell-play"><span class="cell-drag-handle">☰</span><span class="cell-play-text">${cellInner}</span></span>
      </div>`;
    } else {
      html += `<div class="wristband-cell" tabindex="0"
        data-drag="wbCell" data-cell-idx="${i}" data-card="${currentCardIndex}"></div>`;
    }

    // Responsibility textarea — show reset button when a custom override is active
    const hasOverride = playerCardOverrides[wbPlayerCardPos]?.[currentCardIndex]?.[i] !== undefined;
    html += `<div class="wristband-cell pc-assignment-cell">
      <textarea class="pc-resp-input" data-override-key="${escapeHtml(overrideKey)}"
        placeholder="—">${escapeHtml(respText)}</textarea>
      ${hasOverride ? `<button class="pc-resp-reset" data-override-key="${escapeHtml(overrideKey)}" title="Reset to playbook value">↺</button>` : ""}
    </div>`;
  }

  grid.classList.add("pc-grid-active");
  document.getElementById("wristbandCard")?.classList.add("pc-card-active");
  grid.style.gridTemplateRows = `repeat(${WB_ROWS}, 1fr)`;
  grid.innerHTML = html;

  // Wire assignment change + reset click events — only once per grid element lifetime
  if (!grid._pcListenerWired) {
    grid._pcListenerWired = true;
    grid.addEventListener("change", function (e) {
      if (!wbPlayerCardMode) return;
      if (!e.target.classList.contains("pc-resp-input")) return;
      const parts = e.target.dataset.overrideKey.split("|");
      const pKey = parts[0];
      const cIdx = parseInt(parts[1]);
      const cellI = parseInt(parts[2]);
      if (!playerCardOverrides[pKey]) playerCardOverrides[pKey] = {};
      if (!playerCardOverrides[pKey][cIdx]) playerCardOverrides[pKey][cIdx] = {};
      playerCardOverrides[pKey][cIdx][cellI] = e.target.value;
      renderPlayerCardGrid();
    });
    grid.addEventListener("click", function (e) {
      if (!wbPlayerCardMode) return;
      const btn = e.target.closest(".pc-resp-reset");
      if (!btn) return;
      e.preventDefault();
      const parts = btn.dataset.overrideKey.split("|");
      const pKey = parts[0];
      const cIdx = parseInt(parts[1]);
      const cellI = parseInt(parts[2]);
      if (playerCardOverrides[pKey]?.[cIdx]) {
        delete playerCardOverrides[pKey][cIdx][cellI];
      }
      renderPlayerCardGrid();
    });
  }
}

// ─── Player Wristband Print Helpers ────────────────────────────────────────

/**
 * Build a single player wristband block for print.
 * 3-column grid: [num | play | responsibility] × 20 rows.
 * Returns a .pc-print-card-wrap div.
 */
function _buildPlayerPrintCard(card, cardIdx, posKey, opts) {
  const { highlightHuddle, highlightCandy } = opts;
  const cardOffset = cardIdx * WB_ROWS;
  const pCardColor = card.cardColor || "";

  let cells = "";
  for (let i = 0; i < WB_ROWS; i++) {
    const play = card.data[i];
    const playNum = i + WRISTBAND_OFFSET + cardOffset;
    const custom = cellCustomizations[`${cardIdx}-${i}`] || {};
    const respText = (playerCardOverrides[posKey]?.[cardIdx]?.[i]) ?? (play?.[posKey] || "");

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

    cells += `<div class="wristband-cell pc-print-assignment">${escapeHtml(respText)}</div>`;
  }

  return `<div class="pc-print-card-wrap">
    <div class="wristband-card">
      <div class="wristband-grid" style="grid-template-columns:22px 1fr 1fr;grid-template-rows:repeat(${WB_ROWS},1fr);">
        ${cells}
      </div>
    </div>
  </div>`;
}

/**
 * "Print 1" — 3 identical copies of the current position's card on one portrait page.
 */
function printOnePlayerCard() {
  if (!wristbandCards.some((c) => c.data?.slice(0, WB_ROWS).some(Boolean))) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }
  const posSelect = document.getElementById("pcPosSelect");
  const posKey = wbPlayerCardPos || "respQ";
  const posLabel = posSelect
    ? (posSelect.options[posSelect.selectedIndex]?.text || posKey.replace("resp", ""))
    : posKey.replace("resp", "");
  const opts = getWristbandDisplayOptions();

  const printContainer = document.getElementById("playerCardPrint");
  const printContent = document.getElementById("playerCardPrintContent");
  if (!printContainer || !printContent) return;

  let allHtml = "";
  wristbandCards.forEach((card, cardIdx) => {
    const cardName = card.name || `Card ${cardIdx + 1}`;
    const cardBlock = _buildPlayerPrintCard(card, cardIdx, posKey, opts);
    allHtml += `<div class="pc-print-page">
      <div class="pc-print-page-header">
        <span class="pc-print-pos-label">${escapeHtml(posLabel)}</span>
        <span class="pc-print-card-name">${escapeHtml(cardName)}</span>
      </div>
      ${cardBlock}${cardBlock}${cardBlock}
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

/**
 * "Print All" — all positions, 3 per portrait page.
 * Each page stacks 3 position cards with their assignments.
 */
function printAllPlayerCards() {
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
  wristbandCards.forEach((card, cardIdx) => {
    const cardName = card.name || `Card ${cardIdx + 1}`;
    for (let p = 0; p < PC_POSITIONS.length; p += 3) {
      const group = PC_POSITIONS.slice(p, p + 3);
      let pageBlocks = "";
      group.forEach((pos) => {
        const posBlock = _buildPlayerPrintCard(card, cardIdx, pos.key, opts);
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
