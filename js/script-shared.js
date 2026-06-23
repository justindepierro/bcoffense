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
  return storageManager.get(STORAGE_KEYS.SCRIPT_CONTROLS_MODE, "advanced");
}

function setScriptControlsMode(mode) {
  const normalized = mode === "basic" ? "basic" : "advanced";
  storageManager.set(STORAGE_KEYS.SCRIPT_CONTROLS_MODE, normalized);
  applyScriptControlsMode(normalized);
}

function applyScriptControlsMode(mode = getScriptControlsMode()) {
  const normalized = mode === "basic" ? "basic" : "advanced";
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
  trigger?.classList.toggle("is-active", !scriptPlayRailCollapsed);
  trigger?.setAttribute("aria-pressed", scriptPlayRailCollapsed ? "false" : "true");
}

function toggleScriptPlayRail() {
  scriptPlayRailCollapsed = !scriptPlayRailCollapsed;
  applyScriptPlayRailState();
  saveScriptDisplayOptions();
}

function setScriptToolsDrawerOpen(isOpen) {
  const nextOpen = Boolean(isOpen);
  const scriptPanel = document.getElementById("script");
  const drawer = document.getElementById("scriptToolsDrawer");
  const backdrop = document.getElementById("scriptToolsBackdrop");
  const trigger = document.getElementById("scriptToolsDrawerToggle");

  if (nextOpen && typeof closeScriptDisplayPanel === "function") {
    closeScriptDisplayPanel();
  }
  scriptToolsDrawerOpen = nextOpen;
  scriptPanel?.classList.toggle("script-tools-open", nextOpen);
  drawer?.classList.toggle("open", nextOpen);
  drawer?.setAttribute("aria-hidden", nextOpen ? "false" : "true");
  drawer?.toggleAttribute("inert", !nextOpen);
  if (backdrop) backdrop.hidden = !nextOpen;
  trigger?.classList.toggle("is-active", nextOpen);
  trigger?.setAttribute("aria-expanded", nextOpen ? "true" : "false");
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
  if (!container || !btn) return;

  if (filtersCollapsed) {
    container.classList.add("collapsed");
    btn.innerHTML = "🔽 Filters";
  } else {
    container.classList.remove("collapsed");
    btn.innerHTML = "🔼 Filters";
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

function getScriptDisplayPlay(play) {
  if (!play) return play;

  const customFormationTags = getSharedCustomTagEntries(play.scriptFormationTags)
    .map((entry) => `(${formatSharedCustomTagEntryText(entry)})`)
    .filter(Boolean);
  const customBackTags = getSharedCustomTagEntries(play.scriptBackTags)
    .map((entry) => `(${formatSharedCustomTagEntryText(entry)})`)
    .filter(Boolean);

  if (!customFormationTags.length && !customBackTags.length) return play;

  const displayPlay = { ...play };

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
    const text = options.noVowels ? removeVowels(oneWordCall) : oneWordCall;
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
