// Cached scouting options — invalidated when opponent or tendencies data changes
let _cachedScoutOpts = null;
let _cachedScoutOppName = null;

function invalidateScoutCache() {
  _cachedScoutOpts = null;
  _cachedScoutOppName = null;
}

function announceScriptA11y(message) {
  const announcer = document.getElementById("liveAnnouncer");
  if (!announcer || !message) return;

  announcer.textContent = "";
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

function getScriptControlsMode() {
  // The default favors the concise coach-facing grid. Expanded mode keeps every
  // field and tool available when a coach needs to work a script in depth.
  return normalizeScriptControlsMode(
    storageManager.get(STORAGE_KEYS.SCRIPT_CONTROLS_MODE, "basic"),
  );
}

function normalizeScriptControlsMode(mode) {
  return ["basic", "run", "advanced"].includes(mode) ? mode : "basic";
}

function setScriptControlsMode(mode) {
  const normalized = normalizeScriptControlsMode(mode);
  storageManager.set(STORAGE_KEYS.SCRIPT_CONTROLS_MODE, normalized);
  applyScriptControlsMode(normalized);
}

function applyScriptControlsMode(mode = getScriptControlsMode()) {
  const normalized = normalizeScriptControlsMode(mode);
  const scriptPanel = document.getElementById("script");
  if (!scriptPanel) return;

  scriptPanel.dataset.controlsMode = normalized;

  const modeSelect = document.getElementById("scriptControlsMode");
  if (modeSelect && modeSelect.value !== normalized) {
    modeSelect.value = normalized;
  }
}

function initScriptControlsMode() {
  const modeSelect = document.getElementById("scriptControlsMode");
  if (modeSelect && modeSelect.dataset.bound !== "true") {
    modeSelect.addEventListener("change", (event) => {
      setScriptControlsMode(event.target.value);
    });
    modeSelect.dataset.bound = "true";
  }
  applyScriptControlsMode();
  applyScriptPlayRailState();
  closeScriptToolsDrawer();
  initScriptWheelScrollBridge();
}

function isScriptWheelBridgeActive() {
  const body = document.body;
  return Boolean(
    body &&
    body.dataset.activeTab === "script" &&
    !body.classList.contains("is-mobile-screen") &&
    !body.classList.contains("app-layer-locked"),
  );
}

function isScriptWheelBridgeInteractiveTarget(target) {
  return Boolean(
    target.closest(
      "input, textarea, select, option, button, [contenteditable='true'], " +
      ".script-tools-drawer, .script-display-panel, .tool-menu, " +
      ".custom-modal, .modal-content, .cell-popup, [data-layer-open='true']",
    ),
  );
}

function getScriptWheelScrollableAncestor(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      const style = window.getComputedStyle(el);
      const canScroll = /auto|scroll/.test(style.overflowY) &&
        el.scrollHeight > el.clientHeight + 1;
      if (canScroll) return el;
    }
    el = el.parentElement;
  }
  return null;
}

function handleScriptWheelScrollBridge(event) {
  if (!isScriptWheelBridgeActive()) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

  const scriptList = document.querySelector("#script .script-list");
  const scriptContainer = document.getElementById("scriptPlays");
  if (!scriptList || !scriptContainer || !scriptList.contains(event.target)) return;
  if (scriptContainer.contains(event.target)) return;
  if (isScriptWheelBridgeInteractiveTarget(event.target)) return;
  if (getScriptWheelScrollableAncestor(event.target, scriptList)) return;

  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? scriptContainer.clientHeight
      : 1;
  const deltaY = event.deltaY * multiplier;
  if (!deltaY) return;

  const before = scriptContainer.scrollTop;
  scriptContainer.scrollTop += deltaY;
  if (scriptContainer.scrollTop !== before) {
    event.preventDefault();
  }
}

function initScriptWheelScrollBridge() {
  const scriptList = document.querySelector("#script .script-list");
  if (!scriptList || scriptList.dataset.wheelBridgeBound === "true") return;
  scriptList.addEventListener("wheel", handleScriptWheelScrollBridge, { passive: false });
  scriptList.dataset.wheelBridgeBound = "true";
}

function applyScriptPlayRailState() {
  const scriptPanel = document.getElementById("script");
  const rail = document.getElementById("scriptPlayRail");
  const trigger = document.getElementById("scriptPlayRailToggle");
  if (!scriptPanel) return;

  scriptPanel.classList.toggle("script-rail-collapsed", scriptPlayRailCollapsed);
  if (rail) {
    // Don't set rail.hidden — CSS transform handles slide-in/out animation.
    // inert keeps keyboard focus inside the drawer when open.
    rail.toggleAttribute("inert", scriptPlayRailCollapsed);
  }
  // Backdrop: inert when rail is closed (hidden by CSS), no aria-hidden so
  // focus on the element itself doesn't trigger the "aria-hidden + focus" warning.
  const backdrop = document.getElementById("scriptRailBackdrop");
  if (backdrop) {
    backdrop.toggleAttribute("inert", scriptPlayRailCollapsed);
  }
  trigger?.classList.toggle("is-active", !scriptPlayRailCollapsed);
  trigger?.setAttribute("aria-pressed", scriptPlayRailCollapsed ? "false" : "true");
  _syncScriptSidebarTabUi();
}

function applyScriptLibraryPinState() {
  const pinToggle = document.getElementById("scriptLibraryPinToggle");
  if (!pinToggle) return;

  pinToggle.classList.toggle("is-active", scriptLibraryPinned);
  pinToggle.setAttribute("aria-pressed", scriptLibraryPinned ? "true" : "false");
  pinToggle.title = scriptLibraryPinned
    ? "Library is pinned open while you add plays"
    : "Keep the library open while you add plays";
}

function toggleScriptLibraryPin() {
  scriptLibraryPinned = !scriptLibraryPinned;
  applyScriptLibraryPinState();
  saveScriptDisplayOptions();
}

function maybeAutoCollapseScriptPlayRail() {
  // Keep touch workflows unchanged. On desktop, a single add should return a
  // coach to the script unless they intentionally pin the library for batching.
  if (
    scriptLibraryPinned ||
    scriptPlayRailCollapsed ||
    document.body?.classList.contains("is-mobile-screen") ||
    document.body?.dataset.activeTab !== "script"
  ) {
    return;
  }

  scriptPlayRailCollapsed = true;
  applyScriptPlayRailState();
  saveScriptDisplayOptions();
}

function toggleScriptPlayRail() {
  scriptPlayRailCollapsed = !scriptPlayRailCollapsed;
  applyScriptPlayRailState();
  saveScriptDisplayOptions();
}

// The Script sidebar is library-only. Selecting Library toggles its compact
// rail; deeper workspace controls live behind the shared Actions hub.
function setScriptSidebarTab(tab) {
  const rail = document.getElementById("scriptPlayRail");
  if (!rail) return;
  if (String(tab) !== "library") return;
  if (!scriptPlayRailCollapsed) {
    scriptPlayRailCollapsed = true;
    applyScriptPlayRailState();
    saveScriptDisplayOptions();
    return;
  }
  rail.dataset.sidebarTab = "library";
  if (scriptPlayRailCollapsed) {
    scriptPlayRailCollapsed = false;
    applyScriptPlayRailState();
    saveScriptDisplayOptions();
  } else {
    _syncScriptSidebarTabUi();
  }
}

function _syncScriptSidebarTabUi() {
  const open = !scriptPlayRailCollapsed;
  const libPill = document.getElementById("scriptPlayRailToggle");
  libPill?.classList.toggle("is-active", open);
  libPill?.setAttribute("aria-pressed", open ? "true" : "false");
}

function setScriptToolsDrawerOpen(isOpen) {
  const drawer = document.getElementById("scriptToolsDrawer");
  const backdrop = document.getElementById("scriptToolsBackdrop");
  const open = Boolean(isOpen);
  scriptToolsDrawerOpen = open;
  drawer?.classList.toggle("open", open);
  drawer?.toggleAttribute("inert", !open);
  drawer?.setAttribute("aria-hidden", open ? "false" : "true");
  if (backdrop) backdrop.hidden = !open;
}

function openScriptToolsDrawer() {
  setScriptToolsDrawerOpen(true);
}

function closeScriptToolsDrawer() {
  setScriptToolsDrawerOpen(false);
}

function toggleScriptToolsDrawer() {
  setScriptToolsDrawerOpen(!scriptToolsDrawerOpen);
}

document.addEventListener("DOMContentLoaded", () => {
  _syncScriptSidebarTabUi();
  applyScriptLibraryPinState();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && scriptToolsDrawerOpen) {
    closeScriptToolsDrawer();
  }
});

function buildSharedPreferredDatalistMarkup(prefix, values, sharedOptionsHtml) {
  const idsByValue = new Map();
  let html = "";
  let nextIndex = 0;

  values.forEach((value) => {
    const normalizedValue = (value || "").trim();
    if (!normalizedValue || idsByValue.has(normalizedValue)) return;

    const listId = `dl-${prefix}-pref-${nextIndex++}`;
    idsByValue.set(normalizedValue, listId);
    html += `<datalist id="${listId}"><option value="${escapeHtml(normalizedValue)}">★ ${escapeHtml(normalizedValue)}</option>${sharedOptionsHtml}</datalist>`;
  });

  return { idsByValue, html };
}

function getScriptScoutingDatalistOptions() {
  let front = "";
  let cov = "";
  let blitz = "";
  let stunt = "";

  const activeOpponent =
    typeof getActiveOpponent === "function" ? getActiveOpponent() : null;
  const activeOpponentName = activeOpponent ? activeOpponent.name : null;

  if (activeOpponent && activeOpponent.plays && activeOpponent.plays.length > 0) {
    if (_cachedScoutOpts && _cachedScoutOppName === activeOpponentName) {
      front = _cachedScoutOpts.front;
      cov = _cachedScoutOpts.cov;
      blitz = _cachedScoutOpts.blitz;
      stunt = _cachedScoutOpts.stunt;
    } else {
      const scoutResult = queryTendencies(activeOpponent, {});
      const mapOpts = (values) => values
        ? values
          .map(
            (entry) => `<option value="${entry.term}">🎯 ${entry.term} (${entry.pct}%)</option>`,
          )
          .join("")
        : "";

      front = mapOpts(scoutResult.topFront);
      cov = mapOpts(scoutResult.topCoverage);
      blitz = mapOpts(scoutResult.topBlitz);
      stunt = mapOpts(scoutResult.topStunt);

      _cachedScoutOpts = { front, cov, blitz, stunt };
      _cachedScoutOppName = activeOpponentName;
    }
  } else {
    _cachedScoutOpts = null;
    _cachedScoutOppName = null;
  }

  return { front, cov, blitz, stunt };
}

function buildScriptDefenseDatalistState(scriptItems) {
  const scoutOptions = getScriptScoutingDatalistOptions();
  const scriptPlays = scriptItems.filter((play) => !play.isSeparator);

  const preferredFrontLists = buildSharedPreferredDatalistMarkup(
    "front",
    scriptPlays.map((play) => play.practiceFront),
    scoutOptions.front,
  );
  const preferredCoverageLists = buildSharedPreferredDatalistMarkup(
    "cov",
    scriptPlays.map((play) => play.practiceCoverage),
    scoutOptions.cov,
  );
  const preferredStuntLists = buildSharedPreferredDatalistMarkup(
    "stunt",
    scriptPlays.map((play) => play.practiceStunt),
    scoutOptions.stunt,
  );
  const preferredBlitzLists = buildSharedPreferredDatalistMarkup(
    "blitz",
    scriptPlays.map((play) => play.practiceBlitz),
    scoutOptions.blitz,
  );

  const html = `
      <datalist id="dl-front-shared">${scoutOptions.front}</datalist>
      <datalist id="dl-cov-shared">${scoutOptions.cov}</datalist>
      <datalist id="dl-stunt-shared">${scoutOptions.stunt}</datalist>
      <datalist id="dl-blitz-shared">${scoutOptions.blitz}</datalist>
    ` +
    preferredFrontLists.html +
    preferredCoverageLists.html +
    preferredStuntLists.html +
    preferredBlitzLists.html;

  return {
    html,
    preferredFrontIdsByValue: preferredFrontLists.idsByValue,
    preferredCoverageIdsByValue: preferredCoverageLists.idsByValue,
    preferredStuntIdsByValue: preferredStuntLists.idsByValue,
    preferredBlitzIdsByValue: preferredBlitzLists.idsByValue,
  };
}

function applyScriptFiltersCollapsedState() {
  const container = document.getElementById("scriptFiltersContainer");
  const btn = document.getElementById("toggleFiltersBtn");
  const label = document.getElementById("scriptFiltersLabel");
  if (!container || !btn || !label) return;

  if (filtersCollapsed) {
    container.classList.add("collapsed");
    label.textContent = "Filters";
    btn.setAttribute("aria-expanded", "false");
  } else {
    container.classList.remove("collapsed");
    label.textContent = "Hide Filters";
    btn.setAttribute("aria-expanded", "true");
  }
}

function toggleFiltersCollapse() {
  filtersCollapsed = !filtersCollapsed;
  applyScriptFiltersCollapsedState();
  saveScriptDisplayOptions();
}

function toggleFilterSection(titleEl) {
  const section = titleEl?.parentElement;
  if (!section) return;

  section.classList.toggle("expanded");
  if (section.classList.contains("expanded")) {
    titleEl.textContent = titleEl.textContent.replace("▶", "▼");
    titleEl.setAttribute("aria-expanded", "true");
  } else {
    titleEl.textContent = titleEl.textContent.replace("▼", "▶");
    titleEl.setAttribute("aria-expanded", "false");
  }
}

function highlightPlaysNotOnWristband() {
  const wbSelect = document.getElementById("scriptWristbandSelect");
  if (!wbSelect || !wbSelect.value) {
    showToast("⚠️ Please select a wristband first", { type: "warning" });
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wbId = parseInt(wbSelect.value, 10);
  if (isNaN(wbId)) return;

  const wristband = saved.find((item) => item.id === wbId);
  if (!wristband) return;

  const wristbandPlays = new Set();
  if (wristband.cards) {
    wristband.cards.forEach((card) => {
      card.data.forEach((play) => {
        if (play && play.play) {
          wristbandPlays.add(`${play.formation}|${play.play}`);
        }
      });
    });
  }

  let notOnWristbandCount = 0;
  script.forEach((item) => {
    if (item.isSeparator) return;
    const key = `${item.formation}|${item.play}`;
    if (!wristbandPlays.has(key)) notOnWristbandCount++;
  });

  if (notOnWristbandCount === 0) {
    showToast("✅ All plays in the script are on the wristband!", {
      type: "success",
    });
    return;
  }

  showToast(`⚠️ ${notOnWristbandCount} play(s) are NOT on the wristband`);
}

function setScriptToolbarStatus(message, tone = "info", duration = 2000) {
  const statusEl = document.getElementById("scriptSortStatus");
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `script-sort-status is-${tone}`;
  if (duration > 0) {
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "script-sort-status";
    }, duration);
  }
}

function wireScriptOverlayDismiss(overlay) {
  if (!overlay) return;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    overlay.remove();
  });
}

function getPeriodCallDisplayOptions(separator, baseOptions = {}) {
  if (!separator?.hideProtection) return baseOptions;
  return { ...baseOptions, hideProtection: true };
}

const SCRIPT_PERSONNEL_VISUAL_OPTIONS = [
  "Red", "Blue", "Green", "Yellow", "Orange", "Purple", "Brown", "White", "Black", "Navy",
];

function normalizeScriptPersonnelOverride(value) {
  const candidate = String(value || "").trim();
  return SCRIPT_PERSONNEL_VISUAL_OPTIONS.find(
    (option) => option.toLowerCase() === candidate.toLowerCase(),
  ) || "";
}

function getScriptPersonnelDisplay(play) {
  return normalizeScriptPersonnelOverride(play?.scriptPersonnelOverride) ||
    String(play?.personnel || "").trim();
}

function getScriptDisplayPlay(play) {
  if (!play) return play;

  const customFormationTags = getSharedCustomTagEntries(play.scriptFormationTags)
    .map((entry) => `(${formatSharedCustomTagEntryText(entry)})`)
    .filter(Boolean);
  const customBackTags = getSharedCustomTagEntries(play.scriptBackTags)
    .map((entry) => `(${formatSharedCustomTagEntryText(entry)})`)
    .filter(Boolean);

  const visualPersonnel = getScriptPersonnelDisplay(play);
  const personnelChanged = visualPersonnel !== String(play.personnel || "").trim();
  if (!customFormationTags.length && !customBackTags.length && !personnelChanged) return play;

  const displayPlay = { ...play };

  if (personnelChanged) displayPlay.personnel = visualPersonnel;

  if (customFormationTags.length) {
    const formationTagText = customFormationTags.join(" ");
    if (displayPlay.formTag2 && String(displayPlay.formTag2).trim()) {
      displayPlay.formTag2 = `${displayPlay.formTag2} ${formationTagText}`;
    } else if (displayPlay.formTag1 && String(displayPlay.formTag1).trim()) {
      displayPlay.formTag2 = formationTagText;
    } else {
      displayPlay.formTag1 = formationTagText;
    }
  }

  if (customBackTags.length) {
    const backTagText = customBackTags.join(" ");
    displayPlay.back = displayPlay.back
      ? `${displayPlay.back} ${backTagText}`
      : backTagText;
  }

  return displayPlay;
}

function renderScriptPersonnelOverrideButton(play, index, playLabel, options = {}) {
  // Print-style rows are still an editable coach surface. The real packet
  // renderer has its own controls, so do not hide this script-only editor
  // merely because the worksheet is using the denser visual treatment.
  if (!play || play.isSeparator) return "";
  const sourcePersonnel = String(play.personnel || "").trim();
  const displayPersonnel = getScriptPersonnelDisplay(play);

  const isOverridden = Boolean(normalizeScriptPersonnelOverride(play.scriptPersonnelOverride));
  const title = isOverridden
    ? `Visual script personnel: ${displayPersonnel}. Playbook remains ${sourcePersonnel || "unchanged"}.`
    : `Personnel: ${displayPersonnel || sourcePersonnel}. Choose a visual script-only override.`;
  return `<button type="button" class="script-personnel-override-btn${isOverridden ? " is-overridden" : ""}" data-action="openScriptPersonnelOverrideModal" data-idx="${index}" title="${escapeHtml(title)}" aria-label="Change script-only personnel color for ${escapeHtml(playLabel)}"><span aria-hidden="true">${getPersonnelEmoji(displayPersonnel) || "●"}</span><span>${escapeHtml(displayPersonnel || "Color")} · Change</span></button>`;
}

function closeScriptPersonnelOverrideModal() {
  document.getElementById("scriptPersonnelOverrideModalOverlay")?.remove();
}

function updateScriptPersonnelOverrideControl(index) {
  const play = script[index];
  const row = document.querySelector(`.script-item[data-idx="${index}"]`);
  const buttons = row?.querySelectorAll(".script-personnel-override-btn");
  if (!play || !buttons?.length) return;
  const sourcePersonnel = String(play.personnel || "").trim();
  const displayPersonnel = getScriptPersonnelDisplay(play);
  const isOverridden = Boolean(normalizeScriptPersonnelOverride(play.scriptPersonnelOverride));
  const title = isOverridden
    ? `Visual script personnel: ${displayPersonnel}. Playbook remains ${sourcePersonnel || "unchanged"}.`
    : `Personnel: ${displayPersonnel || sourcePersonnel}. Choose a visual script-only override.`;
  buttons.forEach((button) => {
    button.classList.toggle("is-overridden", isOverridden);
    button.title = title;
    button.innerHTML = `<span aria-hidden="true">${getPersonnelEmoji(displayPersonnel) || "●"}</span><span>${escapeHtml(displayPersonnel || "Color")} · Change</span>`;
  });
}

function setScriptPersonnelOverride(index, value) {
  const play = script[index];
  if (!play || play.isSeparator) return;
  const next = normalizeScriptPersonnelOverride(value);
  const current = normalizeScriptPersonnelOverride(play.scriptPersonnelOverride);
  if (next === current) {
    closeScriptPersonnelOverrideModal();
    return;
  }

  beginScriptEdit();
  if (next) play.scriptPersonnelOverride = next;
  else delete play.scriptPersonnelOverride;
  closeScriptPersonnelOverrideModal();
  updateScriptCallDisplay(index);
  updateScriptPersonnelOverrideControl(index);
  showToast(
    next
      ? `Using ${next} as this script's visual personnel marker.`
      : "Using the playbook personnel marker.",
    { type: "success", duration: 1800 },
  );
}

function openScriptPersonnelOverrideModal(index) {
  const play = script[index];
  if (!play || play.isSeparator) return;
  closeScriptPersonnelOverrideModal();

  const sourcePersonnel = String(play.personnel || "").trim();
  const current = normalizeScriptPersonnelOverride(play.scriptPersonnelOverride);
  const playLabel = getScriptPlaySummaryText(play);
  const choices = [
    `<button type="button" class="script-personnel-override-choice${!current ? " is-selected" : ""}" data-personnel-value="">Match playbook${sourcePersonnel ? ` · ${escapeHtml(sourcePersonnel)}` : ""}</button>`,
    ...SCRIPT_PERSONNEL_VISUAL_OPTIONS.map((option) =>
      `<button type="button" class="script-personnel-override-choice${current === option ? " is-selected" : ""}" data-personnel-value="${option}"><span aria-hidden="true">${getPersonnelEmoji(option)}</span> ${option}</button>`,
    ),
  ].join("");
  const overlay = document.createElement("div");
  overlay.id = "scriptPersonnelOverrideModalOverlay";
  overlay.className = "modal-overlay show";
  overlay.innerHTML = `
    <div class="modal-content modal-content-sm script-personnel-override-modal" role="dialog" aria-modal="true" aria-labelledby="scriptPersonnelOverrideTitle">
      <div class="modal-header-row">
        <h3 class="modal-title" id="scriptPersonnelOverrideTitle">Script-only personnel color</h3>
        <button type="button" class="modal-close-btn" aria-label="Close">✕</button>
      </div>
      <p class="script-personnel-override-copy"><strong>${escapeHtml(playLabel)}</strong></p>
      <p class="script-personnel-override-copy">This changes only this saved script's visual personnel marker. The Playbook personnel${sourcePersonnel ? ` stays ${escapeHtml(sourcePersonnel)}` : " is unchanged"}.</p>
      <div class="script-personnel-override-options" aria-label="Choose visual personnel">${choices}</div>
    </div>`;
  overlay.querySelector(".modal-close-btn")?.addEventListener("click", closeScriptPersonnelOverrideModal);
  overlay.querySelectorAll("[data-personnel-value]").forEach((choice) => {
    choice.addEventListener("click", () => setScriptPersonnelOverride(index, choice.dataset.personnelValue));
  });
  wireScriptOverlayDismiss(overlay);
  document.body.appendChild(overlay);
  overlay.querySelector(".modal-close-btn")?.focus();
}

function getScriptPlaySummaryText(play) {
  const displayPlay = getScriptDisplayPlay(play);
  if (!displayPlay) return "play";

  return [
    displayPlay.formation,
    displayPlay.formTag1,
    displayPlay.formTag2,
    displayPlay.under,
    displayPlay.back,
    displayPlay.shift,
    displayPlay.motion,
    displayPlay.protection,
    displayPlay.lineCall,
    displayPlay.play,
    displayPlay.playTag1,
    displayPlay.playTag2,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function getScriptFullCall(play, options = {}) {
  const displayPlay = getScriptDisplayPlay(play);
  if (!displayPlay) return "";
  const oneWordCall = String(displayPlay.oneWord || "").trim();
  if (options.showOneWordOnly && oneWordCall) {
    const text = formatPlayCallText(oneWordCall, options);
    const oneWordParts = [];
    if (options.showEmoji && displayPlay.personnel) {
      oneWordParts.push(getPersonnelEmoji(displayPlay.personnel, options.useSquares));
    }
    if (!options.showEmoji && displayPlay.personnel) {
      oneWordParts.push(
        `<span class="script-one-word-personnel">${escapeHtml(displayPlay.personnel)}</span>`,
      );
    }
    oneWordParts.push(`<span class="script-one-word-call">${escapeHtml(text)}</span>`);
    return oneWordParts.join(" ");
  }
  return getFullCall(displayPlay, options);
}
