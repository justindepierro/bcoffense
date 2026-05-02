function setHeaderColor(color, btn) {
  wristbandHeaderColor = color;
  document
    .querySelectorAll(".color-picker:not(#cardColorPicker) .color-btn")
    .forEach((button) => button.classList.remove("active"));
  btn.classList.add("active");
  markWristbandDirty();
  scheduleWristbandAutosave();
  renderWristbandGrid();
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

function renderWristbandGrid() {
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
    });
    if (variants.has(variantKey)) return variants.get(variantKey);
    const displayPlay = getCustomDisplayPlay(play, custom);
    const rendered = opts.lineCallOnly
      ? getLineCallOnlyDisplay(play, opts)
      : getFullCall(displayPlay, opts);
    variants.set(variantKey, rendered);
    return rendered;
  };

  let html = "";
  const cardColor =
    (wristbandCards[currentCardIndex] && wristbandCards[currentCardIndex].cardColor) || "";
  const cardOffset = currentCardIndex * 40;

  for (let row = 0; row < WB_ROWS; row += 1) {
    const oddNum = row * 2 + 11 + cardOffset;
    const evenNum = row * 2 + 12 + cardOffset;
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

    const oddPrefix =
      getCadencePrefix(oddCustom, opts) +
      getCustomPersonnelPrefix(oddCustom, opts) +
      getCustomPreShiftPrefix(oddCustom);
    const evenPrefix =
      getCadencePrefix(evenCustom, opts) +
      getCustomPersonnelPrefix(evenCustom, opts) +
      getCustomPreShiftPrefix(evenCustom);
    const oddPostfix = getCadencePostfix(oddCustom, opts);
    const evenPostfix = getCadencePostfix(evenCustom, opts);

    const oddNumBg = oddBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const oddNumFg = oddBg
      ? (isColorDark(oddBg) ? "white" : UI_COLORS.textDark)
      : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");
    const evenNumBg = evenBg || (wristbandHeaderColor === "transparent" ? "transparent" : wristbandHeaderColor);
    const evenNumFg = evenBg
      ? (isColorDark(evenBg) ? "white" : UI_COLORS.textDark)
      : (wristbandHeaderColor === "transparent" ? UI_COLORS.textDark : "white");

    html += `<div class="wristband-cell num-cell" style="background: ${oddNumBg}; color: ${oddNumFg};">${oddNum}</div>`;

    if (oddPlay) {
      const oddDisplay = getCachedDisplay(oddPlay, oddCustom);
      html += `
        <div class="wristband-cell filled" style="${oddStyle}" 
             draggable="true"
             data-drag="wbCell" data-cell-idx="${oddIndex}"
             data-card="${currentCardIndex}">
          <span class="cell-play"><span class="cell-drag-handle">☰</span><span class="cell-play-text">${composeWristbandCellDisplay(oddPrefix, oddDisplay, oddPostfix)}</span></span>
        </div>
      `;
    } else {
      html += `<div class="wristband-cell" style="${oddStyle}" tabindex="0"
                    data-drag="wbCell" data-cell-idx="${oddIndex}"
                    data-card="${currentCardIndex}"></div>`;
    }

    html += `<div class="wristband-cell num-cell" style="background: ${evenNumBg}; color: ${evenNumFg};">${evenNum}</div>`;

    if (evenPlay) {
      const evenDisplay = getCachedDisplay(evenPlay, evenCustom);
      html += `
        <div class="wristband-cell filled" style="${evenStyle}" 
             draggable="true"
             data-drag="wbCell" data-cell-idx="${evenIndex}"
             data-card="${currentCardIndex}">
          <span class="cell-play"><span class="cell-drag-handle">☰</span><span class="cell-play-text">${composeWristbandCellDisplay(evenPrefix, evenDisplay, evenPostfix)}</span></span>
        </div>
      `;
    } else {
      html += `<div class="wristband-cell" style="${evenStyle}" tabindex="0"
                    data-drag="wbCell" data-cell-idx="${evenIndex}"
                    data-card="${currentCardIndex}"></div>`;
    }
  }

  grid.innerHTML = html;

  const cardEl = document.getElementById("wristbandCard");
  let emptyOverlay = cardEl.querySelector(".wb-grid-empty-state");
  const hasPlays = cardData.some((play) => play !== null);
  if (!hasPlays) {
    if (!emptyOverlay) {
      emptyOverlay = document.createElement("div");
      emptyOverlay.className = "wb-grid-empty-state";
      emptyOverlay.innerHTML = `
        <div class="wb-empty-icon">📋</div>
        <div class="wb-empty-title">Empty Card</div>
        <div class="wb-empty-hint">Click any cell to add a play, or use <strong>⚡ Auto-Fill</strong> to populate from your playbook</div>
      `;
      cardEl.appendChild(emptyOverlay);
    }
    emptyOverlay.classList.add("visible");
  } else if (emptyOverlay) {
    emptyOverlay.classList.remove("visible");
  }

  historyManager.updateButtons("wristband");

  grid.querySelectorAll("[data-drag='wbCell']").forEach((cell) => {
    const cardIdx = parseInt(cell.dataset.card, 10);
    const cellIdx = parseInt(cell.dataset.cellIdx, 10);
    if (!isNaN(cardIdx) && !isNaN(cellIdx)) {
      addLongPress(cell, (ev) => _showWbCellContextMenu(ev, cardIdx, cellIdx));
    }
  });

  syncWbSelectedCellVisuals(grid);
  updateWbStats();

  if (typeof updateTabBadges === "function") updateTabBadges();
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
  wristbandCards[currentCardIndex].data = Array(40).fill(null);
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
  const filtered = plays.filter((play) =>
    matchesWristbandPlayFilters(play, filterState),
  );

  if (filtered.length === 0) {
    showToast("No plays match the current filters");
    return;
  }

  let totalEmpty = 0;
  for (let cardIdx = currentCardIndex; cardIdx < wristbandCards.length; cardIdx += 1) {
    totalEmpty += wristbandCards[cardIdx].data.filter((cell) => cell === null).length;
  }

  let extraCardsNeeded = 0;
  if (filtered.length > totalEmpty) {
    const extraPlays = filtered.length - totalEmpty;
    extraCardsNeeded = Math.ceil(extraPlays / 40);
    const totalCardsNeeded = wristbandCards.length + extraCardsNeeded;
    if (totalCardsNeeded > MAX_CARDS) {
      extraCardsNeeded = MAX_CARDS - wristbandCards.length;
    }
  }

  const totalAvailable = totalEmpty + extraCardsNeeded * 40;
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
        data: Array(40).fill(null),
      });
    }
  }

  saveWristbandState();

  let playIndex = 0;
  let filledCount = 0;
  for (let cardIdx = currentCardIndex; cardIdx < wristbandCards.length && playIndex < filtered.length; cardIdx += 1) {
    for (let cellIdx = 0; cellIdx < 40 && playIndex < filtered.length; cellIdx += 1) {
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