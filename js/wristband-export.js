function printWristband() {
  try {
    const WRISTBAND_PRINT_WIDTH = "4.7in";
    const WRISTBAND_PRINT_HEIGHT = "3in";
    showToast("🖨️ Preparing wristband…", 2500);
    const container = document.getElementById("wristbandPrintCards");
    const numCards = wristbandCards.length;
    const opts = getWristbandDisplayOptions();
    const { highlightHuddle, highlightCandy } = opts;
    const printDisplayCache = new Map();
    const getPrintDisplay = (play, custom) => {
      if (!play) return "";
      if (opts.lineCallOnly) return getLineCallOnlyDisplay(play, opts, custom);
      if (Array.isArray(custom?.componentOrder) && custom.componentOrder.length > 0) {
        return composeWristbandCellHtml(play, custom, opts);
      }
      let variants = printDisplayCache.get(play);
      if (!variants) {
        variants = new Map();
        printDisplayCache.set(play, variants);
      }
      const variantKey = JSON.stringify({
        formationTags: getCustomFormationTagEntries(custom),
        backTags: getCustomBackTagEntries(custom),
      });
      if (variants.has(variantKey)) return variants.get(variantKey);
      const displayPlay = getCustomDisplayPlay(play, custom);
      const rendered = opts.lineCallOnly
        ? getLineCallOnlyDisplay(play, opts, custom)
        : getFullCall(displayPlay, opts);
      variants.set(variantKey, rendered);
      return rendered;
    };

    const useMultiCardLayout = numCards > 1 && numCards <= 5;

    let allHtml = "";

    wristbandCards.forEach((card, cardIdx) => {
      let cardHtml = `<div class="wristband-card"><div class="wristband-grid" style="grid-template-rows: repeat(${WB_ROWS}, 1fr);">`;

      const cardOffset = cardIdx * 40;
      const pCardColor = card.cardColor || "";

      for (let row = 0; row < WB_ROWS; row++) {
        const oddNum = row * 2 + 11 + cardOffset;
        const evenNum = row * 2 + 12 + cardOffset;
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

        const oddPrefix =
          getCadencePrefix(oddCustom, opts) +
          getCustomPersonnelPrefix(oddCustom, opts, oddPlay) +
          getCustomPreShiftPrefix(oddCustom);
        const evenPrefix =
          getCadencePrefix(evenCustom, opts) +
          getCustomPersonnelPrefix(evenCustom, opts, evenPlay) +
          getCustomPreShiftPrefix(evenCustom);
        const oddPostfix = getCadencePostfix(oddCustom, opts);
        const evenPostfix = getCadencePostfix(evenCustom, opts);

        const oddNumBg = oddBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
        const oddNumFg = oddBg ? (isColorDark(oddBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
        const evenNumBg = evenBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
        const evenNumFg = evenBg ? (isColorDark(evenBg) ? "white" : UI_COLORS.textDark) : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
        cardHtml += `<div class="wristband-cell num-cell" style="background: ${oddNumBg}; color: ${oddNumFg};">${oddNum}</div>`;
        const oddDisplay = oddPlay ? getPrintDisplay(oddPlay, oddCustom) : "";
        const oddHasOrder = oddPlay && Array.isArray(oddCustom?.componentOrder) && oddCustom.componentOrder.length > 0;
        const oddCellInner = oddPlay
          ? (oddHasOrder ? oddDisplay : composeWristbandCellDisplay(oddPrefix, oddDisplay, oddPostfix))
          : "";
        cardHtml += `<div class="wristband-cell${oddPlay ? " filled" : ""}" style="${oddStyle}"><span class="cell-play">${oddCellInner}</span></div>`;
        cardHtml += `<div class="wristband-cell num-cell" style="background: ${evenNumBg}; color: ${evenNumFg};">${evenNum}</div>`;
        const evenDisplay = evenPlay ? getPrintDisplay(evenPlay, evenCustom) : "";
        const evenHasOrder = evenPlay && Array.isArray(evenCustom?.componentOrder) && evenCustom.componentOrder.length > 0;
        const evenCellInner = evenPlay
          ? (evenHasOrder ? evenDisplay : composeWristbandCellDisplay(evenPrefix, evenDisplay, evenPostfix))
          : "";
        cardHtml += `<div class="wristband-cell${evenPlay ? " filled" : ""}" style="${evenStyle}"><span class="cell-play">${evenCellInner}</span></div>`;
      }

      cardHtml += "</div></div>";
      allHtml += cardHtml;
    });

    if (numCards === 1) {
      allHtml = allHtml + allHtml + allHtml;
    }

    container.innerHTML = allHtml;
    container.className =
      numCards === 1
        ? "single-card-tripled"
        : useMultiCardLayout
          ? "multi-card-layout"
          : "";

    document.getElementById("wristbandPrint").classList.remove("hidden");
    document.body.dataset.printMode = "wristband";
    document.body.classList.toggle("wb-tripled", numCards === 1);

    if (numCards === 1) {
      setupPrintPageStyle(`
      @media print {
        @page { size: letter portrait; margin: 0.25in; }
        html, body { width: 8.5in !important; height: 11in !important; }
        #wristbandPrintCards.single-card-tripled {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          height: 11in !important;
          gap: 0.25in !important;
        }
        #wristbandPrintCards.single-card-tripled .wristband-card {
          width: ${WRISTBAND_PRINT_WIDTH} !important;
          height: ${WRISTBAND_PRINT_HEIGHT} !important;
          page-break-after: avoid !important;
          flex-shrink: 0 !important;
        }
      }
    `);
    } else if (useMultiCardLayout) {
      setupPrintPageStyle(`
      @media print { 
        @page { size: letter portrait; margin: 0.25in; }
        html, body { width: 8.5in !important; height: 11in !important; }
        #wristbandPrintCards.multi-card-layout {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 0.15in !important;
          padding-top: 0.1in !important;
        }
        #wristbandPrintCards.multi-card-layout .wristband-card {
          width: ${WRISTBAND_PRINT_WIDTH} !important;
          height: ${WRISTBAND_PRINT_HEIGHT} !important;
          page-break-after: avoid !important;
          flex-shrink: 0 !important;
        }
      }
    `);
    } else {
      setupPrintPageStyle(
        `@media print { @page { size: ${WRISTBAND_PRINT_WIDTH} ${WRISTBAND_PRINT_HEIGHT}; margin: 0; } }`,
      );
    }

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Wristband");
        window.print();
        restoreTitle();
      } finally {
        document.getElementById("wristbandPrint").classList.add("hidden");
        delete document.body.dataset.printMode;
        document.body.classList.remove("wb-tripled");
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

  wristbandCards.forEach((card, cardIdx) => {
    const cardOffset = cardIdx * 40;
    card.data.forEach((play, cellIdx) => {
      const cellNum = cellIdx + 11 + cardOffset;
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

/** "classic" | "player" | "" (unset = show landing) */
let wristbandType = "";

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
  document.getElementById("wbTypeChoice")?.classList.add("hidden");
  document.querySelector(".wb-toolbar")?.classList.remove("wb-toolbar-hidden");
  document.querySelector(".card-tabs")?.classList.remove("wb-hidden");
  document.getElementById("wristbandCard")?.classList.remove("wb-hidden");
  document.getElementById("pcModeBar")?.classList.remove("visible");
  renderCardTabs();
  renderWristbandGrid();
}

function startPlayerWristband() {
  wristbandType = "player";
  document.getElementById("wbTypeChoice")?.classList.add("hidden");
  document.querySelector(".wb-toolbar")?.classList.add("wb-toolbar-hidden");
  document.querySelector(".card-tabs")?.classList.remove("wb-hidden");
  document.getElementById("wristbandCard")?.classList.remove("wb-hidden");
  // Activate player card mode
  playerCardOverrides = {};
  wbPlayerCardMode = true;
  const posSelect = document.getElementById("pcPosSelect");
  wbPlayerCardPos = posSelect ? posSelect.value || "respQ" : "respQ";
  document.getElementById("pcModeBar")?.classList.add("visible");
  renderCardTabs();
  renderPlayerCardGrid();
}

// ─── Player Card Print ─────────────────────────────────────────────────────

/** Session-only responsibility overrides: {posKey: {cardIdx: {cellIdx: text}}} */
let playerCardOverrides = {};

/** True when the wristband grid is displaying player card mode in-place */
let wbPlayerCardMode = false;
/** Currently selected position key for player card mode */
let wbPlayerCardPos = "respQ";

/** Positions available in player card print (must stay in sync with RESP_POSITIONS in playbook-editor.js) */
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

  // Player cards hold 20 plays each (half of classic's 40)
  const PC_PLAYS_PER_CARD = 20;
  const cardOffset = currentCardIndex * PC_PLAYS_PER_CARD;
  const lineOnlyChk = document.getElementById("pcLineCallOnly");
  const lineCallOnly = lineOnlyChk ? lineOnlyChk.checked : false;
  const opts = Object.assign({}, getWristbandDisplayOptions(), { lineCallOnly });
  const { highlightHuddle, highlightCandy } = opts;
  const pCardColor = card.cardColor || "";

  // 3 columns: [num (32px) | play name (1fr) | responsibility (1fr)] × 20 rows
  // Same card dimensions as classic (7in × 4.2in), half the plays, full info per play
  let html = "";
  for (let i = 0; i < PC_PLAYS_PER_CARD; i++) {
    const play = card.data[i];
    const playNum = i + 11 + cardOffset;
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
      const prefix = getCadencePrefix(custom, opts)
        + getCustomPersonnelPrefix(custom, opts, play)
        + getCustomPreShiftPrefix(custom);
      const postfix = getCadencePostfix(custom, opts);
      const display = lineCallOnly && typeof getLineCallOnlyDisplay === "function"
        ? getLineCallOnlyDisplay(play, opts, custom)
        : getFullCall(getCustomDisplayPlay(play, custom), opts);
      const hasOrder = Array.isArray(custom?.componentOrder) && custom.componentOrder.length > 0;
      const cellInner = hasOrder ? display : composeWristbandCellDisplay(prefix, display, postfix);
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
  grid.style.gridTemplateRows = `repeat(${PC_PLAYS_PER_CARD}, 1fr)`;
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
 * Build a single player card block for print.
 * 3-column grid: [num | play | responsibility] × 20 rows.
 * Returns a .pc-print-card-wrap div (one card, not two columns).
 */
function _buildPlayerPrintCard(card, cardIdx, posKey, opts) {
  const { highlightHuddle, highlightCandy, lineCallOnly } = opts;
  const PC_PLAYS_PER_CARD = 20;
  const cardOffset = cardIdx * PC_PLAYS_PER_CARD;
  const pCardColor = card.cardColor || "";

  let cells = "";
  for (let i = 0; i < PC_PLAYS_PER_CARD; i++) {
    const play = card.data[i];
    const playNum = i + 11 + cardOffset;
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
      const prefix = getCadencePrefix(custom, opts) + getCustomPersonnelPrefix(custom, opts, play) + getCustomPreShiftPrefix(custom);
      const postfix = getCadencePostfix(custom, opts);
      const display = lineCallOnly && typeof getLineCallOnlyDisplay === "function"
        ? getLineCallOnlyDisplay(play, opts, custom)
        : getFullCall(getCustomDisplayPlay(play, custom), opts);
      const hasOrder = Array.isArray(custom?.componentOrder) && custom.componentOrder.length > 0;
      const cellInner = hasOrder ? display : composeWristbandCellDisplay(prefix, display, postfix);
      cells += `<div class="wristband-cell filled" style="${cellStyle}"><span class="cell-play">${cellInner}</span></div>`;
    } else {
      cells += `<div class="wristband-cell"></div>`;
    }

    cells += `<div class="wristband-cell pc-print-assignment">${escapeHtml(respText)}</div>`;
  }

  return `<div class="pc-print-card-wrap">
    <div class="wristband-card">
      <div class="wristband-grid" style="grid-template-columns:22px 1fr 1fr;grid-template-rows:repeat(20,1fr);">
        ${cells}
      </div>
    </div>
  </div>`;
}

/**
 * "Print 1" — 3 identical copies of the current position's card on one portrait page.
 */
function printOnePlayerCard() {
  if (!wristbandCards.some((c) => c.data?.some(Boolean))) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }
  const posSelect = document.getElementById("pcPosSelect");
  const posKey = wbPlayerCardPos || "respQ";
  const posLabel = posSelect
    ? (posSelect.options[posSelect.selectedIndex]?.text || posKey.replace("resp", ""))
    : posKey.replace("resp", "");
  const lineCallOnly = document.getElementById("pcLineCallOnly")?.checked || false;
  const opts = Object.assign({}, getWristbandDisplayOptions(), { lineCallOnly });

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

  _triggerPlayerPrint(printContainer, printContent, allHtml, `Player Card \u2014 ${posLabel}`, "portrait");
}

/**
 * "Print All" — all positions, 3 per portrait page.
 * Each page stacks 3 position cards with their assignments.
 */
function printAllPlayerCards() {
  if (!wristbandCards.some((c) => c.data?.some(Boolean))) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }
  const lineCallOnly = document.getElementById("pcLineCallOnly")?.checked || false;
  const opts = Object.assign({}, getWristbandDisplayOptions(), { lineCallOnly });

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

  _triggerPlayerPrint(printContainer, printContent, allHtml, "Player Cards \u2014 All Positions", "portrait");
}

function _triggerPlayerPrint(printContainer, printContent, html, title, orientation) {
  printContent.innerHTML = html;
  document.body.dataset.printMode = "playerCards";
  printContainer.classList.remove("hidden");

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
      printContainer.classList.add("hidden");
      delete document.body.dataset.printMode;
    }
  }, 100);
}

function printPlayerCards() {
  // Now routes to printOnePlayerCard for backward compat
  printOnePlayerCard();
}

