const WRISTBAND_DEFAULT_PRINT_PROFILE = "standard";
const WRISTBAND_PRINT_PROFILES = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    label: "Standard wristband",
    width: "4.5in",
    height: "2.6in",
    sizeLabel: "4.5 x 2.6 in",
    cardsPerSheet: 3,
    copiesPerPage: 3,
    positionsPerPage: 3,
  }),
  flag: Object.freeze({
    id: "flag",
    label: "Flag wristband note card",
    width: "4.4in",
    height: "2.1in",
    sizeLabel: "4.4 x 2.1 in",
    cardsPerSheet: 4,
    copiesPerPage: 4,
    positionsPerPage: 4,
  }),
});
const WRISTBAND_PRINT_WIDTH = WRISTBAND_PRINT_PROFILES.standard.width;
const WRISTBAND_PRINT_HEIGHT = WRISTBAND_PRINT_PROFILES.standard.height;
const WRISTBAND_PRINT_SIZE_LABEL = WRISTBAND_PRINT_PROFILES.standard.sizeLabel;
const WRISTBAND_PRINT_CARDS_PER_SHEET = WRISTBAND_PRINT_PROFILES.standard.cardsPerSheet;

function _getWbPrintProfile(profileId) {
  const key = String(profileId || "").trim();
  return WRISTBAND_PRINT_PROFILES[key] || WRISTBAND_PRINT_PROFILES[WRISTBAND_DEFAULT_PRINT_PROFILE];
}

function _getSelectedWbPrintProfile() {
  return _getWbPrintProfile(document.getElementById("wbPrintSizeMode")?.value);
}

function _applyWristbandPrintDimensions(profileId = null) {
  const profile = _getWbPrintProfile(profileId);
  const previousWidth = document.body.style.getPropertyValue("--wristband-print-width");
  const previousHeight = document.body.style.getPropertyValue("--wristband-print-height");
  const hadPreviousSize = Object.prototype.hasOwnProperty.call(
    document.body.dataset,
    "wbPrintSize",
  );
  const previousSize = document.body.dataset.wbPrintSize;

  document.body.style.setProperty("--wristband-print-width", profile.width);
  document.body.style.setProperty("--wristband-print-height", profile.height);
  document.body.dataset.wbPrintSize = profile.id;

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
    if (hadPreviousSize) {
      document.body.dataset.wbPrintSize = previousSize;
    } else {
      delete document.body.dataset.wbPrintSize;
    }
  };
}

function _buildWristbandPrintSheets(cardHtml, repeatSingleCard = false, profileId = null) {
  const profile = _getWbPrintProfile(profileId);
  const cardsPerSheet = Math.max(1, profile.cardsPerSheet || WRISTBAND_PRINT_CARDS_PER_SHEET);
  const cards = repeatSingleCard
    ? Array.from({ length: cardsPerSheet }, () => cardHtml[0])
    : cardHtml;
  const sheets = [];

  for (let i = 0; i < cards.length; i += cardsPerSheet) {
    sheets.push(
      `<section class="wristband-print-sheet">${cards
        .slice(i, i + cardsPerSheet)
        .join("")}</section>`,
    );
  }

  return sheets.join("");
}

function printWristband() {
  openWristbandPrintPreview(wbPlayerCardMode ? "player-all" : "classic");
}

function _executeClassicWristbandPrint(cardIndexes, layoutMode = "sheet", profileId = null) {
  try {
    const profile = _getWbPrintProfile(profileId);
    const cellsPerCard = getActiveWristbandCellCount();
    const selectedCards = (Array.isArray(cardIndexes) ? cardIndexes : [])
      .map((cardIdx) => ({ cardIdx, card: wristbandCards[cardIdx] }))
      .filter(({ card }) => card?.data?.slice(0, cellsPerCard).some(Boolean));
    if (selectedCards.length === 0) {
      showToast("No plays on the wristband to print.", { type: "warning" });
      return;
    }

    showToast(`Print at 100% or Actual Size for a ${profile.sizeLabel} wristband.`, {
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
        customWriteIn: custom?.customWriteIn || "",
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
        const oddCellInner = oddPlay
          ? `${oddDisplay}${renderWristbandCellWriteIn(oddCustom)}`
          : renderWristbandCellWriteIn(oddCustom, { forceStandalone: true });
        html += `<div class="wristband-cell${oddPlay ? " filled" : ""}" style="${oddStyle}"><span class="cell-play">${oddCellInner}</span></div>`;
        html += `<div class="wristband-cell num-cell" style="background: ${evenNumBg}; color: ${evenNumFg};">${evenNum}</div>`;
        const evenDisplay = evenPlay ? getPrintDisplay(evenPlay, evenCustom) : "";
        const evenCellInner = evenPlay
          ? `${evenDisplay}${renderWristbandCellWriteIn(evenCustom)}`
          : renderWristbandCellWriteIn(evenCustom, { forceStandalone: true });
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
      const copyCount = Math.max(1, profile.copiesPerPage || profile.cardsPerSheet || 1);
      container.innerHTML = cardHtml
        .map(
          (html) => {
            const copies = Array.from({ length: copyCount }, () => html).join("");
            return `<section class="wristband-print-sheet">${copies}</section>`;
          },
        )
        .join("");
      container.className = "wristband-print-sheets single-card-tripled";
    } else {
      container.innerHTML = _buildWristbandPrintSheets(cardHtml, false, profile.id);
      container.className = "wristband-print-sheets multi-card-layout";
    }

    document.getElementById("wristbandPrint").classList.remove("hidden");
    document.body.dataset.printMode = "wristband";
    const restorePrintDimensions = _applyWristbandPrintDimensions(profile.id);
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


// ─── Player Wristband Print ────────────────────────────────────────────────


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
  const sizeSelect = document.getElementById("wbPrintSizeMode");
  if (sizeSelect) {
    const previousSize = _getWbPrintProfile(sizeSelect.value).id;
    sizeSelect.innerHTML = Object.values(WRISTBAND_PRINT_PROFILES)
      .map(
        (profile) =>
          `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.label)} (${escapeHtml(profile.sizeLabel)})</option>`,
      )
      .join("");
    sizeSelect.value = previousSize;
  }
  layoutSelect.innerHTML = isPlayer
    ? `
      <option value="player-one">One wristband per page</option>
      <option value="player-three">Copies per page</option>
      <option value="player-all">Selected positions per page</option>
    `
    : `
      <option value="classic-one">One wristband per page</option>
      <option value="classic-sheet">Cards per page</option>
      <option value="classic-three">Copies of each card per page</option>
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
  const printProfile = _getSelectedWbPrintProfile();
  const cardIndexes = _getSelectedWbPrintCards();
  const positionKeys = _getSelectedWbPrintPositions();
  const blankRules = isPlayer && _getWbPrintBlankRules();
  const positionFieldset = document.getElementById("wbPrintPositionFieldset");
  const learningFieldset = document.getElementById("wbPrintLearningFieldset");
  positionFieldset?.classList.toggle("hidden", !isPlayer);
  learningFieldset?.classList.toggle("hidden", !isPlayer);

  let pageCount = 0;
  if (wbPrintPreviewMode === "classic-sheet") {
    pageCount = Math.ceil(cardIndexes.length / Math.max(1, printProfile.cardsPerSheet));
  } else if (wbPrintPreviewMode.startsWith("classic")) {
    pageCount = cardIndexes.length;
  } else if (wbPrintPreviewMode === "player-all") {
    pageCount =
      cardIndexes.length *
      Math.ceil(positionKeys.length / Math.max(1, printProfile.positionsPerPage));
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
    let pageDetail = "1 / page";
    if (wbPrintPreviewMode === "classic-sheet") {
      pageDetail = `${printProfile.cardsPerSheet} card${printProfile.cardsPerSheet === 1 ? "" : "s"} / page`;
    } else if (wbPrintPreviewMode === "classic-three" || wbPrintPreviewMode === "player-three") {
      pageDetail = `${printProfile.copiesPerPage} cop${printProfile.copiesPerPage === 1 ? "y" : "ies"} / page`;
    } else if (wbPrintPreviewMode === "player-all") {
      pageDetail = `${printProfile.positionsPerPage} position${printProfile.positionsPerPage === 1 ? "" : "s"} / page`;
    }
    summary.textContent = `${cardIndexes.length} ${cardNoun}${cardIndexes.length === 1 ? "" : "s"} · ${pageCount} print page${pageCount === 1 ? "" : "s"} · ${printProfile.sizeLabel} · ${pageDetail}${blankRules ? " · blank rules" : ""}`;
  }

  const warnings = [];
  if (cardIndexes.length === 0) warnings.push("Select at least one card.");
  if (isPlayer && positionKeys.length === 0) warnings.push("Select at least one position.");
  if (isPlayer && wbPrintPreviewMode !== "player-all" && positionKeys.length > 1) {
    warnings.push("One-position layouts print the first selected position only.");
  }
  if (printProfile.id === "flag") {
    warnings.push("Flag note cards are shorter than standard wristbands; long calls and rules may print tighter.");
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
    canvas.style.setProperty("--wristband-print-width", printProfile.width);
    canvas.style.setProperty("--wristband-print-height", printProfile.height);
    canvas.dataset.wbPrintSize = printProfile.id;
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
        clone.classList.add("wb-print-preview-classic-card");
        clone.style.width = printProfile.width;
        clone.style.height = printProfile.height;
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
  const printProfile = _getSelectedWbPrintProfile();
  if (cardIndexes.length === 0) return;
  closeWristbandPrintPreview();

  if (wbPrintPreviewMode === "classic-one") {
    _executeClassicWristbandPrint(cardIndexes, "one-per-page", printProfile.id);
  } else if (wbPrintPreviewMode === "classic-three") {
    _executeClassicWristbandPrint(cardIndexes, "three-copies", printProfile.id);
  } else if (wbPrintPreviewMode === "classic-sheet") {
    _executeClassicWristbandPrint(cardIndexes, "sheet", printProfile.id);
  } else if (wbPrintPreviewMode === "player-one") {
    _executePrintOnePlayerCard(cardIndexes, positionKeys[0], {
      blankRules,
      printSize: printProfile.id,
    });
  } else if (wbPrintPreviewMode === "player-three") {
    _executePrintThreePlayerCardCopies(cardIndexes, positionKeys[0], {
      blankRules,
      printSize: printProfile.id,
    });
  } else {
    _executePrintAllPlayerCards(cardIndexes, positionKeys, {
      blankRules,
      printSize: printProfile.id,
    });
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
  const printProfile = _getWbPrintProfile(printOpts.printSize);
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
    printProfile.id,
  );
}

/** Print three identical copies of each card for the current position. */
function _executePrintThreePlayerCardCopies(cardIndexes, positionKey, printOpts = {}) {
  if (!wristbandCards.some((c) => c.data?.slice(0, WB_ROWS).some(Boolean))) {
    showToast("No plays on the wristband to print.", { type: "warning" });
    return;
  }
  const printProfile = _getWbPrintProfile(printOpts.printSize);
  const copyCount = Math.max(1, printProfile.copiesPerPage || 1);
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
      const cardCopies = Array.from({ length: copyCount }, () => cardBlock).join("");
      return `<div class="pc-print-page">
        <div class="pc-print-page-header">
          <span class="pc-print-pos-label">${escapeHtml(posLabel)}</span>
          <span class="pc-print-card-name">${escapeHtml(cardName)}</span>
        </div>
        ${cardCopies}
      </div>`;
    })
    .join("");

  _triggerPlayerPrint(
    printContainer,
    printContent,
    allHtml,
    `Player Wristband \u2014 ${posLabel} \u2014 ${copyCount} Copies`,
    "portrait",
    printProfile.id,
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
  const printProfile = _getWbPrintProfile(printOpts.printSize);
  const positionsPerPage = Math.max(1, printProfile.positionsPerPage || 1);
  const opts = getWristbandDisplayOptions();

  const printContainer = document.getElementById("playerCardPrint");
  const printContent = document.getElementById("playerCardPrintContent");
  if (!printContainer || !printContent) return;

  let allHtml = "";

  // For each wristband card, print positions in groups sized to the selected card profile.
  const positions = PLAYER_WRISTBAND_POSITIONS.filter((position) =>
    (positionKeys || []).includes(position.key),
  );
  (cardIndexes || []).forEach((cardIdx) => {
    const card = wristbandCards[cardIdx];
    if (!card?.data?.slice(0, WB_ROWS).some(Boolean)) return;
    const cardName = card.name || `Card ${cardIdx + 1}`;
    for (let p = 0; p < positions.length; p += positionsPerPage) {
      const group = positions.slice(p, p + positionsPerPage);
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
    printProfile.id,
  );
}

function _triggerPlayerPrint(
  printContainer,
  printContent,
  html,
  title,
  orientation,
  printSizeId = null,
) {
  printContent.innerHTML = html;
  document.body.dataset.printMode = "playerCards";
  printContainer.classList.remove("hidden");
  const restorePrintDimensions = _applyWristbandPrintDimensions(printSizeId);

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


async function _prepareWbLogoDataUrl(file) {
  const dataUrl = await _readWbLogoFileAsDataUrl(file);
  const image = await _loadWbLogoImage(dataUrl);
  const maxSide = 2200;
  const largestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  if (file.size <= 1500000 && largestSide <= maxSide) {
    return dataUrl;
  }

  const scale = Math.min(1, maxSide / Math.max(1, largestSide));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const outputType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  return outputType === "image/jpeg"
    ? canvas.toDataURL(outputType, 0.88)
    : canvas.toDataURL(outputType);
}


async function _createWbSmartCenteredLogoDataUrl(dataUrl) {
  const image = await _loadWbLogoImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.clearRect(0, 0, sourceWidth, sourceHeight);
  sourceCtx.drawImage(image, 0, 0, sourceWidth, sourceHeight);

  const bounds = _findWbLogoInkBounds(
    sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight),
  );
  const targetWidth = 1500;
  const targetHeight = Math.round(targetWidth * 2.6 / 4.5);
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetCtx = targetCanvas.getContext("2d");
  targetCtx.clearRect(0, 0, targetWidth, targetHeight);

  const margin = 0.08;
  const availableWidth = targetWidth * (1 - margin * 2);
  const availableHeight = targetHeight * (1 - margin * 2);
  const scale = Math.min(
    availableWidth / Math.max(1, bounds.width),
    availableHeight / Math.max(1, bounds.height),
  );
  const drawWidth = bounds.width * scale;
  const drawHeight = bounds.height * scale;
  const drawX = (targetWidth - drawWidth) / 2;
  const drawY = (targetHeight - drawHeight) / 2;

  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = "high";
  targetCtx.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
  return targetCanvas.toDataURL("image/png");
}


async function _refreshWbLogoSmartDataUrl(opts = {}) {
  const settings = _getWbLogoCardSettings();
  const sourceDataUrl = settings.originalDataUrl || settings.dataUrl;
  if (!settings.smartCenter || !sourceDataUrl) return false;
  if (!opts.force && settings.smartDataUrl) return true;
  try {
    const smartDataUrl = await _createWbSmartCenteredLogoDataUrl(sourceDataUrl);
    const saved = _saveWbLogoCardSettings({
      smartDataUrl,
      dataUrl: sourceDataUrl,
      originalDataUrl: sourceDataUrl,
    });
    if (saved) renderWbLogoCardModal();
    return saved;
  } catch (err) {
    console.warn("Could not smart-center logo:", err);
    if (opts.showToast) {
      showToast("Could not auto-center that logo. Printing the original image.", {
        type: "warning",
      });
    }
    return false;
  }
}


async function handleWbLogoCardUpload(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    showToast("Choose a PNG, JPG, or other image file.", { type: "warning" });
    input.value = "";
    return;
  }

  try {
    const dataUrl = await _prepareWbLogoDataUrl(file);
    const saved = _saveWbLogoCardSettings({
      dataUrl,
      originalDataUrl: dataUrl,
      smartDataUrl: "",
      name: file.name || "School logo",
      smartCenter: true,
    });
    if (!saved) {
      showToast("Logo could not be saved. Try a smaller image.", { type: "error" });
      return;
    }
    renderWbLogoCardModal();
    await _refreshWbLogoSmartDataUrl({ force: true, showToast: true });
    showToast("Logo saved for wristband printing.", { type: "success" });
  } catch (err) {
    console.error("handleWbLogoCardUpload error:", err);
    showToast("Could not load that logo image.", { type: "error" });
  } finally {
    input.value = "";
  }
}


async function clearWbLogoCard() {
  const settings = _getWbLogoCardSettings();
  if (!settings.dataUrl) return;
  const ok = await showConfirm("Remove the saved logo card image?", {
    title: "Remove Logo Card",
    icon: "🖼️",
    confirmText: "Remove",
    danger: true,
  });
  if (!ok) return;
  storageManager.remove(STORAGE_KEYS.WRISTBAND_LOGO_CARD);
  renderWbLogoCardModal();
}
