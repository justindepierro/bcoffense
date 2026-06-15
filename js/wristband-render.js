function setHeaderColor(color, btn) {
  wristbandHeaderColor = color;
  document
    .querySelectorAll(".color-picker:not(#cardColorPicker) .color-btn")
    .forEach((button) => button.classList.remove("active"));
  if (btn) btn.classList.add("active");
  markWristbandDirty();
  scheduleWristbandAutosave();
  renderWristbandGrid();
}

function applyWristbandColorScheme(presetId) {
  setActiveColorPreset(presetId || "");
  const preset = presetId
    ? TEAM_COLOR_PRESETS.find(function (p) { return p.id === presetId; })
    : null;
  setHeaderColor(preset ? preset.primary : "transparent");
  // Sync the scheme select to reflect the active preset
  const sel = document.getElementById("wbColorSchemeSelect");
  if (sel) sel.value = presetId || "";
}

function setCardColor(color, btn) {
  if (!wristbandCards[currentCardIndex]) return;
  wristbandCards[currentCardIndex].cardColor = color === "transparent" ? "" : color;
  document
    .querySelectorAll("#cardColorPicker .card-color-btn")
    .forEach((button) => button.classList.remove("active"));
  btn.classList.add("active");
  markWristbandDirty();
  scheduleWristbandAutosave();
  renderWristbandGrid();
}

function updateCardColorPicker() {
  const cardColor =
    (wristbandCards[currentCardIndex] && wristbandCards[currentCardIndex].cardColor) || "";
  document.querySelectorAll("#cardColorPicker .card-color-btn").forEach((button) => {
    const isTransparentBtn = button.classList.contains("color-btn-transparent");
    const btnColor = button.getAttribute("data-arg");
    const isMatch = !cardColor || cardColor === "transparent"
      ? isTransparentBtn
      : btnColor === cardColor;
    button.classList.toggle("active", isMatch);
  });
}

function getWristbandDisplayOptions() {
  return {
    showEmoji: document.getElementById("wbShowEmoji")?.checked || false,
    useSquares: document.getElementById("wbUseSquares")?.checked || false,
    underEmoji: document.getElementById("wbUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("wbBoldShifts")?.checked || false,
    redShifts: document.getElementById("wbRedShifts")?.checked || false,
    italicMotions: document.getElementById("wbItalicMotions")?.checked || false,
    redMotions: document.getElementById("wbRedMotions")?.checked || false,
    noVowels: document.getElementById("wbRemoveVowels")?.checked || false,
    showLineCall: document.getElementById("wbShowLineCall")?.checked || false,
    lineCallOnly: document.getElementById("wbLineCallOnly")?.checked || false,
    cadenceReminder: document.getElementById("wbCadenceReminder")?.checked || false,
    highlightHuddle: document.getElementById("wbHighlightHuddle")?.checked || false,
    highlightCandy: document.getElementById("wbHighlightCandy")?.checked || false,
  };
}

function syncWristbandGridEmptyState(cardData, cellsPerCard) {
  const cardEl = document.getElementById("wristbandCard");
  if (!cardEl) return;

  let emptyOverlay = cardEl.querySelector(".wb-grid-empty-state");
  const visibleCells = Array.isArray(cardData)
    ? cardData.slice(0, cellsPerCard)
    : [];
  const isEmpty = !visibleCells.some(Boolean);

  if (!emptyOverlay && isEmpty) {
    emptyOverlay = document.createElement("div");
    emptyOverlay.className = "wb-grid-empty-state";
    emptyOverlay.innerHTML = `
      <div class="wb-empty-icon">📋</div>
      <div class="wb-empty-title">Empty Card</div>
      <div class="wb-empty-hint">Add from the play library, choose a cell manually, or fill the card from the current filters.</div>
      <div class="wb-empty-actions">
        <button class="btn btn-sm btn-primary" data-action="openFirstEmptyWristbandCell">Choose a Play</button>
        <button class="btn btn-sm" data-action="autoFillWristband">Auto-Fill</button>
      </div>
    `;
    cardEl.appendChild(emptyOverlay);
  }

  emptyOverlay?.classList.toggle("visible", isEmpty);
}

function openFirstEmptyWristbandCell() {
  const cardData = getCurrentCardData();
  const cellIdx = cardData
    .slice(0, getActiveWristbandCellCount())
    .findIndex((cell) => cell === null);
  if (cellIdx < 0) {
    showToast("No empty cells on this card", { type: "warning" });
    return;
  }
  openCellPopup(currentCardIndex, cellIdx);
}

function getWristbandCellAriaLabel(play, playNumber) {
  if (!play) {
    return `Wristband number ${playNumber}, empty. Press Enter to add a play.`;
  }
  const call = [
    play.personnel,
    play.formation,
    play.protection,
    play.play,
    play.lineCall,
  ]
    .filter(Boolean)
    .join(" ");
  return `Wristband number ${playNumber}, ${call || "assigned play"}. Press Enter to edit.`;
}

function syncWristbandZoom() {
  setWristbandZoom(wbZoomLevel, { silent: true });
}

function setWristbandZoom(level, opts = {}) {
  const allowed = new Set(["fit", "75", "100"]);
  wbZoomLevel = allowed.has(String(level)) ? String(level) : "fit";
  const viewport = document.getElementById("wbCardViewport");
  const card = document.getElementById("wristbandCard");
  if (!viewport || !card) return;

  document.querySelectorAll("[data-wb-zoom]").forEach((button) => {
    const active = button.dataset.wbZoom === wbZoomLevel;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  if (wbZoomLevel === "fit") {
    card.style.removeProperty("transform");
    card.style.removeProperty("transform-origin");
    viewport.style.removeProperty("height");
    viewport.classList.remove("wb-zoomed");
    return;
  }

  const scale = wbZoomLevel === "75" ? 0.75 : 1;
  card.style.transform = `scale(${scale})`;
  card.style.transformOrigin = "top left";
  viewport.style.height = `${Math.ceil(card.offsetHeight * scale) + 20}px`;
  viewport.classList.add("wb-zoomed");
  if (!opts.silent) {
    showToast(`Preview zoom set to ${wbZoomLevel}%`, { type: "info" });
  }
}

function toggleWristbandFullscreen() {
  const preview = document.querySelector(".wristband-preview");
  if (!preview) return;
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  if (preview.requestFullscreen) {
    preview.requestFullscreen();
  } else {
    preview.classList.toggle("wb-preview-fullscreen");
  }
}

function finalizeWristbandGridRender(grid, cardData, cellsPerCard) {
  syncWristbandGridEmptyState(cardData, cellsPerCard);
  historyManager.updateButtons("wristband");

  grid.querySelectorAll("[data-drag='wbCell']").forEach((cell) => {
    const cardIdx = parseInt(cell.dataset.card, 10);
    const cellIdx = parseInt(cell.dataset.cellIdx, 10);
    if (Number.isInteger(cardIdx) && Number.isInteger(cellIdx)) {
      addLongPress(cell, (event) =>
        _showWbCellContextMenu(event, cardIdx, cellIdx),
      );
    }
  });

  syncWbSelectedCellVisuals(grid);
  updateWbStats();
  syncWristbandZoom();
  if (typeof updateWristbandSaveChrome === "function") {
    updateWristbandSaveChrome();
  }
  if (typeof renderWristbandPlays === "function") {
    renderWristbandPlays();
  }
  if (typeof updateTabBadges === "function") updateTabBadges();
}

function renderWristbandGrid() {
  // If player wristband mode is active, delegate to its renderer.
  if (typeof wbPlayerCardMode !== "undefined" && wbPlayerCardMode) {
    if (typeof renderPlayerCardGrid === "function") renderPlayerCardGrid();
    return;
  }
  const grid = document.getElementById("wristbandGrid");
  grid.style.gridTemplateRows = `repeat(${WB_ROWS}, 1fr)`;
  const cardData = getCurrentCardData();
  const opts = getWristbandDisplayOptions();
  const { highlightHuddle, highlightCandy } = opts;
  const displayCache = new Map();
  const getCachedDisplay = (play, custom) => {
    if (!play) return "";
    let variants = displayCache.get(play);
    if (!variants) {
      variants = new Map();
      displayCache.set(play, variants);
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

  let html = "";
  const cardColor =
    (wristbandCards[currentCardIndex] && wristbandCards[currentCardIndex].cardColor) || "";
  const cardOffset = currentCardIndex * CELLS_PER_CARD;

  for (let row = 0; row < WB_ROWS; row += 1) {
    const oddNum = row * 2 + WRISTBAND_OFFSET + cardOffset;
    const evenNum = row * 2 + WRISTBAND_OFFSET + 1 + cardOffset;
    const oddIndex = row * 2;
    const evenIndex = row * 2 + 1;

    const oddPlay = cardData[oddIndex];
    const evenPlay = cardData[evenIndex];

    const oddKey = `${currentCardIndex}-${oddIndex}`;
    const evenKey = `${currentCardIndex}-${evenIndex}`;
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

    const oddBg = getCellBgColor(oddCustom, oddIsHuddle, oddIsCandy, row, cardColor);
    let oddStyle = oddBg ? `background:${oddBg};` : "";
    oddStyle += oddCustom.textColor ? `color:${oddCustom.textColor};` : "";

    const evenBg = getCellBgColor(evenCustom, evenIsHuddle, evenIsCandy, row, cardColor);
    let evenStyle = evenBg ? `background:${evenBg};` : "";
    evenStyle += evenCustom.textColor ? `color:${evenCustom.textColor};` : "";

    const oddNumBg = oddBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const oddNumFg = oddBg
      ? (isColorDark(oddBg) ? "white" : UI_COLORS.textDark)
      : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
    const evenNumBg = evenBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const evenNumFg = evenBg
      ? (isColorDark(evenBg) ? "white" : UI_COLORS.textDark)
      : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");

    html += `<div class="wristband-cell num-cell" role="rowheader" style="background: ${oddNumBg}; color: ${oddNumFg};">${oddNum}</div>`;

    if (oddPlay) {
      const oddCellHtml = getCachedDisplay(oddPlay, oddCustom);
      const oddWriteInHtml = oddCustom.customWriteIn
        ? `<span class="cell-write-in">${escapeHtml(oddCustom.customWriteIn)}</span>`
        : "";
      html += `
        <div class="wristband-cell filled" style="${oddStyle}" 
             draggable="true"
             role="gridcell" tabindex="0"
             aria-label="${escapeHtml(getWristbandCellAriaLabel(oddPlay, oddNum))}"
             data-drag="wbCell" data-cell-idx="${oddIndex}"
             data-card="${currentCardIndex}">
          <span class="cell-play"><span class="cell-drag-handle">☰</span><span class="cell-play-text">${oddCellHtml}</span></span>
          ${oddWriteInHtml}
        </div>
      `;
    } else {
      html += `<div class="wristband-cell" style="${oddStyle}" role="gridcell" tabindex="0"
                    aria-label="${escapeHtml(getWristbandCellAriaLabel(null, oddNum))}"
                    data-drag="wbCell" data-cell-idx="${oddIndex}"
                    data-card="${currentCardIndex}"></div>`;
    }

    html += `<div class="wristband-cell num-cell" role="rowheader" style="background: ${evenNumBg}; color: ${evenNumFg};">${evenNum}</div>`;

    if (evenPlay) {
      const evenCellHtml = getCachedDisplay(evenPlay, evenCustom);
      const evenWriteInHtml = evenCustom.customWriteIn
        ? `<span class="cell-write-in">${escapeHtml(evenCustom.customWriteIn)}</span>`
        : "";
      html += `
        <div class="wristband-cell filled" style="${evenStyle}" 
             draggable="true"
             role="gridcell" tabindex="0"
             aria-label="${escapeHtml(getWristbandCellAriaLabel(evenPlay, evenNum))}"
             data-drag="wbCell" data-cell-idx="${evenIndex}"
             data-card="${currentCardIndex}">
          <span class="cell-play"><span class="cell-drag-handle">☰</span><span class="cell-play-text">${evenCellHtml}</span></span>
          ${evenWriteInHtml}
        </div>
      `;
    } else {
      html += `<div class="wristband-cell" style="${evenStyle}" role="gridcell" tabindex="0"
                    aria-label="${escapeHtml(getWristbandCellAriaLabel(null, evenNum))}"
                    data-drag="wbCell" data-cell-idx="${evenIndex}"
                    data-card="${currentCardIndex}"></div>`;
    }
  }

  grid.innerHTML = html;
  finalizeWristbandGridRender(grid, cardData, CELLS_PER_CARD);
}

function setWristbandOverlayVisibility(target, isOpen, opts = {}) {
  const overlay =
    typeof target === "string" ? document.getElementById(target) : target;
  if (!overlay) return null;

  const visibilityClass = opts.visibilityClass || "hidden";
  if (opts.openClass) {
    overlay.classList.toggle(visibilityClass, isOpen);
  } else {
    overlay.classList.toggle(visibilityClass, !isOpen);
  }

  overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if (isOpen) {
    overlay.removeAttribute("inert");
  } else {
    overlay.setAttribute("inert", "");
  }

  return overlay;
}

async function clearWristband() {
  const cardData = getCurrentCardData();
  if (!cardData.some((cell) => cell !== null)) return;

  const snapshot = safeDeepClone(wristbandCards[currentCardIndex].data);
  const custSnapshot = {};
  Object.keys(cellCustomizations).forEach((key) => {
    if (key.startsWith(`${currentCardIndex}-`)) {
      custSnapshot[key] = safeDeepClone(cellCustomizations[key]);
    }
  });
  const cardIdx = currentCardIndex;

  saveWristbandState();
  wristbandCards[currentCardIndex].data = Array(CELLS_PER_CARD).fill(null);
  Object.keys(cellCustomizations).forEach((key) => {
    if (key.startsWith(`${currentCardIndex}-`)) {
      delete cellCustomizations[key];
    }
  });
  renderCardTabs();
  renderWristbandGrid();

  showUndoToast(
    `🗑️ ${escapeHtml(wristbandCards[cardIdx].name)} cleared`,
    () => {
      wristbandCards[cardIdx].data = snapshot;
      Object.assign(cellCustomizations, custSnapshot);
      renderCardTabs();
      renderWristbandGrid();
      markWristbandDirty();
      scheduleWristbandAutosave();
    },
  );
}

async function autoFillWristband() {
  const filterState = getWristbandFilterState();
  const usageMap = getWristbandPlayUsageMap();
  const filtered = plays.filter(
    (play) =>
      matchesWristbandPlayFilters(play, filterState) &&
      (!wbPreventDuplicates || !usageMap.has(playSignature(play))),
  );

  if (filtered.length === 0) {
    showToast("No plays match the current filters");
    return;
  }

  const cellsPerCard = getActiveWristbandCellCount();
  let totalEmpty = 0;
  for (let cardIdx = currentCardIndex; cardIdx < wristbandCards.length; cardIdx += 1) {
    totalEmpty += wristbandCards[cardIdx].data
      .slice(0, cellsPerCard)
      .filter((cell) => cell === null).length;
  }

  let extraCardsNeeded = 0;
  if (filtered.length > totalEmpty) {
    const extraPlays = filtered.length - totalEmpty;
    extraCardsNeeded = Math.ceil(extraPlays / cellsPerCard);
    const totalCardsNeeded = wristbandCards.length + extraCardsNeeded;
    if (totalCardsNeeded > MAX_CARDS) {
      extraCardsNeeded = MAX_CARDS - wristbandCards.length;
    }
  }

  const totalAvailable = totalEmpty + extraCardsNeeded * cellsPerCard;
  const toFill = Math.min(filtered.length, totalAvailable);
  const cardsAffected =
    extraCardsNeeded > 0
      ? wristbandCards.length - currentCardIndex + extraCardsNeeded
      : wristbandCards.length - currentCardIndex;

  const msg = extraCardsNeeded > 0
    ? `Will add ${toFill} of ${filtered.length} plays across ${cardsAffected} card(s).\n\n${extraCardsNeeded} new card(s) will be created.\n\nStarting from ${wristbandCards[currentCardIndex].name}.`
    : `Will add ${toFill} of ${filtered.length} plays to ${cardsAffected} card(s).\n\nStarting from ${wristbandCards[currentCardIndex].name}.`;

  const ok = await showConfirm(msg, {
    title: "Auto-Fill Preview",
    icon: "⚡",
    confirmText: `Fill ${toFill} Plays`,
  });
  if (!ok) return;

  if (extraCardsNeeded > 0) {
    for (let i = 0; i < extraCardsNeeded && wristbandCards.length < MAX_CARDS; i += 1) {
      wristbandCards.push({
        name: `Card ${wristbandCards.length + 1}`,
        data: Array(CELLS_PER_CARD).fill(null),
      });
    }
  }

  saveWristbandState();

  let playIndex = 0;
  let filledCount = 0;
  for (let cardIdx = currentCardIndex; cardIdx < wristbandCards.length && playIndex < filtered.length; cardIdx += 1) {
    for (
      let cellIdx = 0;
      cellIdx < cellsPerCard && playIndex < filtered.length;
      cellIdx += 1
    ) {
      if (wristbandCards[cardIdx].data[cellIdx] === null) {
        wristbandCards[cardIdx].data[cellIdx] = filtered[playIndex];
        playIndex += 1;
        filledCount += 1;
      }
    }
  }

  if (filledCount === 0) {
    showToast("⚠️ No empty cells available — clear some first", {
      type: "warning",
    });
    return;
  }

  renderCardTabs();
  renderWristbandGrid();
  renderWristbandPlays();
  markWristbandDirty();
  scheduleWristbandAutosave();
  showToast(`✅ Added ${filledCount} play${filledCount !== 1 ? "s" : ""}`);
}

function isColorDark(hex) {
  if (!hex) return false;
  let normalizedHex = hex.replace("#", "");
  if (normalizedHex.length === 3) {
    normalizedHex =
      normalizedHex[0] + normalizedHex[0] +
      normalizedHex[1] + normalizedHex[1] +
      normalizedHex[2] + normalizedHex[2];
  }
  const r = parseInt(normalizedHex.substring(0, 2), 16) / 255;
  const g = parseInt(normalizedHex.substring(2, 4), 16) / 255;
  const b = parseInt(normalizedHex.substring(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.45;
}
