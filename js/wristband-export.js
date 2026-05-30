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

// ─── Player Card Print ─────────────────────────────────────────────────────

/** Session-only responsibility overrides: {posKey: {cardIdx: {cellIdx: text}}} */
let playerCardOverrides = {};

/** True when the wristband grid is displaying player card mode in-place */
let wbPlayerCardMode = false;
/** Currently selected position key for player card mode */
let wbPlayerCardPos = "respQ";

/** Positions available in player card print (must stay in sync with RESP_POSITIONS in playbook-editor.js) */
const PC_POSITIONS = [
  { key: "respQ",  label: "Q"  },
  { key: "respT",  label: "T"  },
  { key: "respH",  label: "H"  },
  { key: "respZ",  label: "Z"  },
  { key: "respX",  label: "X"  },
  { key: "respY",  label: "Y"  },
  { key: "respLT", label: "LT" },
  { key: "respLG", label: "LG" },
  { key: "respC",  label: "C"  },
  { key: "respRG", label: "RG" },
  { key: "respRT", label: "RT" },
];

function openPlayerCardPrint() {
  if (!wristbandCards.length || !wristbandCards.some((c) => c.data?.some(Boolean))) {
    showToast("Fill the wristband first, then open Player Cards.", { type: "warning" });
    return;
  }
  playerCardOverrides = {};
  wbPlayerCardMode = true;
  const posSelect = document.getElementById("pcPosSelect");
  wbPlayerCardPos = posSelect ? posSelect.value || "respQ" : "respQ";
  document.getElementById("pcModeBar")?.classList.add("visible");
  renderPlayerCardGrid();
}

function closePlayerCardPrint() {
  wbPlayerCardMode = false;
  document.getElementById("pcModeBar")?.classList.remove("visible");
  // Restore grid/card element classes before re-rendering
  const grid = document.getElementById("wristbandGrid");
  if (grid) grid.classList.remove("pc-grid-active");
  document.getElementById("wristbandCard")?.classList.remove("pc-card-active");
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

  const cardOffset = currentCardIndex * 40;
  const lineOnlyChk = document.getElementById("pcLineCallOnly");
  const lineCallOnly = lineOnlyChk ? lineOnlyChk.checked : false;
  const opts = Object.assign({}, getWristbandDisplayOptions(), { lineCallOnly });

  // 2-column format: full-width table [# | play call | assignment]
  // All 40 plays in a single vertical list — one play per row
  let rows = "";
  for (let i = 0; i < CELLS_PER_CARD; i++) {
    const play = card.data[i];
    const playNum = i + 11 + cardOffset;
    const overrideKey = `${wbPlayerCardPos}|${currentCardIndex}|${i}`;
    const respText = (playerCardOverrides[wbPlayerCardPos]?.[currentCardIndex]?.[i])
      ?? (play?.[wbPlayerCardPos] || "");
    const callHtml = play
      ? (lineCallOnly && typeof getLineCallOnlyDisplay === "function"
          ? getLineCallOnlyDisplay(play, opts, cellCustomizations[`${currentCardIndex}-${i}`] || {})
          : getFullCall(play, opts))
      : "";

    rows += `<tr class="pc-row${!play ? " pc-row-empty" : ""}">
      <td class="pc-td-num">${playNum}</td>
      <td class="pc-td-call">${callHtml}</td>
      <td class="pc-td-resp"><textarea class="pc-resp-input"
        data-override-key="${escapeHtml(overrideKey)}"
        placeholder="—">${escapeHtml(respText)}</textarea></td>
    </tr>`;
  }

  const html = `<div class="pc-card-view">
    <table class="pc-table">
      <colgroup>
        <col class="pc-col-num">
        <col class="pc-col-call">
        <col class="pc-col-resp">
      </colgroup>
      <thead><tr>
        <th class="pc-th-num">#</th>
        <th class="pc-th-call">Play</th>
        <th class="pc-th-resp">Assignment</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;

  // Activate classes so CSS overrides the 4-column wristband grid layout
  grid.classList.add("pc-grid-active");
  document.getElementById("wristbandCard")?.classList.add("pc-card-active");
  grid.style.gridTemplateRows = "";
  grid.innerHTML = html;

  // Wire assignment textarea change events — only once per grid element lifetime
  if (!grid._pcListenerWired) {
    grid._pcListenerWired = true;
    grid.addEventListener("change", function(e) {
      if (!wbPlayerCardMode) return;
      if (!e.target.classList.contains("pc-resp-input")) return;
      const parts = e.target.dataset.overrideKey.split("|");
      const pKey = parts[0];
      const cIdx = parseInt(parts[1]);
      const cellI = parseInt(parts[2]);
      if (!playerCardOverrides[pKey]) playerCardOverrides[pKey] = {};
      if (!playerCardOverrides[pKey][cIdx]) playerCardOverrides[pKey][cIdx] = {};
      playerCardOverrides[pKey][cIdx][cellI] = e.target.value;
    });
  }
}

function printPlayerCards() {
  const posSelect = document.getElementById("pcPosSelect");
  const lineOnlyChk = document.getElementById("pcLineCallOnly");
  const posKey = wbPlayerCardPos || "respQ";
  const posLabel = posSelect
    ? (posSelect.options[posSelect.selectedIndex]?.text || posKey.replace("resp", ""))
    : posKey.replace("resp", "");
  const lineCallOnly = lineOnlyChk ? lineOnlyChk.checked : false;

  if (!wristbandCards.length || !wristbandCards.some((c) => c.data?.some(Boolean))) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }

  const printContainer = document.getElementById("playerCardPrint");
  const printContent = document.getElementById("playerCardPrintContent");
  if (!printContainer || !printContent) return;

  const opts = Object.assign({}, getWristbandDisplayOptions(), { lineCallOnly });

  let allHtml = "";

  wristbandCards.forEach((card, cardIdx) => {
    const cardName = card.name || `Card ${cardIdx + 1}`;
    const cardOffset = cardIdx * 40;

    // Split 40 plays into two halves: left (0–19) and right (20–39)
    // Each half is a 3-col table: [#] [call] [assignment]
    const buildHalf = (startIdx, endIdx) => {
      let rows = "";
      for (let i = startIdx; i < endIdx; i++) {
        const play = card.data[i];
        const playNum = i + 11 + cardOffset;
        const respText = (playerCardOverrides[posKey]?.[cardIdx]?.[i]) ?? (play?.[posKey] || "");
        const callHtml = play
          ? (lineCallOnly && typeof getLineCallOnlyDisplay === "function"
              ? getLineCallOnlyDisplay(play, opts, cellCustomizations[`${cardIdx}-${i}`] || {})
              : getFullCall(play, opts))
          : "";
        rows += `<tr class="pc-print-row${!play ? " pc-print-row-empty" : ""}">
          <td class="pc-print-num">${playNum}</td>
          <td class="pc-print-call">${callHtml}</td>
          <td class="pc-print-resp">${escapeHtml(respText)}</td>
        </tr>`;
      }
      return `<table class="pc-print-table">
        <thead><tr>
          <th class="pc-print-th-num">#</th>
          <th class="pc-print-th-call">Play</th>
          <th class="pc-print-th-resp">${escapeHtml(posLabel)}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    };

    allHtml += `<div class="pc-print-page">
      <div class="pc-print-page-header">
        <span class="pc-print-pos-label">${escapeHtml(posLabel)}</span>
        <span class="pc-print-card-name">${escapeHtml(cardName)}</span>
      </div>
      <div class="pc-print-columns">
        <div class="pc-print-col">${buildHalf(0, 20)}</div>
        <div class="pc-print-col">${buildHalf(20, 40)}</div>
      </div>
    </div>`;
  });

  printContent.innerHTML = allHtml;
  document.body.dataset.printMode = "playerCards";
  printContainer.classList.remove("hidden");

  setupPrintPageStyle(`
    @media print {
      @page { size: letter landscape; margin: 0.35in; }
    }
  `);

  setTimeout(() => {
    try {
      const restoreTitle = typeof setPrintTitle === "function"
        ? setPrintTitle(`Player Cards — ${posLabel}`)
        : () => {};
      window.print();
      if (typeof restoreTitle === "function") restoreTitle();
    } finally {
      printContainer.classList.add("hidden");
      delete document.body.dataset.printMode;
    }
  }, 100);
}
