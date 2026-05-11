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
  link.download = `wristband-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("📥 CSV exported");
}
