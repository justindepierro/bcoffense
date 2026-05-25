// App shell runtime helpers: theme, chrome, global shortcuts, and page-level listeners.

// ── Startup loading cover ──
function setStartupLoadingMessage(message) {
  const el = document.getElementById("startupLoaderStatus");
  if (el && message) el.textContent = message;
}

function finishStartupLoading(opts = {}) {
  if (window.__startupLoaderFinished) return;
  window.__startupLoaderFinished = true;

  const loader = document.getElementById("startupLoader");
  const reveal = () => {
    document.body.classList.remove("app-booting");
    document.body.classList.add("app-ready");
    if (!loader) return;
    if (opts.error) {
      setStartupLoadingMessage("Startup hit an error. Showing the app anyway.");
    }
    loader.classList.add("is-hiding");
    loader.setAttribute("aria-hidden", "true");
    setTimeout(() => loader.remove(), 300);
  };

  const delay = Number.isFinite(opts.delay) ? opts.delay : 80;
  setTimeout(() => {
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  }, Math.max(0, delay));
}

window.addEventListener("load", () => {
  setTimeout(() => {
    if (document.body.classList.contains("app-booting")) {
      finishStartupLoading({ delay: 0 });
    }
  }, 6000);
});

// Keep CSS in sync with the actual mobile viewport and sticky shell heights.
// This avoids iOS URL-bar jumps and keeps the tab rail attached to the header.
let _mobileShellFrame = 0;

function syncMobileShellState() {
  _mobileShellFrame = 0;
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;

  root.style.setProperty("--app-vh", `${Math.max(height * 0.01, 1)}px`);

  const header = document.querySelector(".app-header");
  const tabs = document.querySelector(".tabs");
  if (header) {
    root.style.setProperty(
      "--app-header-height",
      `${Math.ceil(header.getBoundingClientRect().height)}px`,
    );
  }
  if (tabs) {
    root.style.setProperty(
      "--app-tabs-height",
      `${Math.ceil(tabs.getBoundingClientRect().height)}px`,
    );
  }

  const isMobile = width <= 768;
  const isPhone = width <= 560;
  const isCompact = width <= 420;
  const isShort = height <= 620;
  const isTouch =
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  [root, body].forEach((el) => {
    el.classList.toggle("is-mobile-screen", isMobile);
    el.classList.toggle("is-phone-screen", isPhone);
    el.classList.toggle("is-compact-screen", isCompact);
    el.classList.toggle("is-short-screen", isShort);
    el.classList.toggle("is-touch-screen", Boolean(isTouch));
  });
  const coachDock = document.getElementById("mobileCoachDock");
  const coachDockHeight = coachDock
    ? Math.ceil(coachDock.getBoundingClientRect().height)
    : 0;
  if (coachDockHeight > 0) {
    root.style.setProperty("--coach-dock-height", `${coachDockHeight + 12}px`);
  } else {
    root.style.removeProperty("--coach-dock-height");
  }
  body.dataset.screenSize = isPhone ? "phone" : isMobile ? "mobile" : "desktop";
  if (typeof updateMobileCoachDock === "function") updateMobileCoachDock();
  if (typeof applyMobileCoachLockUi === "function") applyMobileCoachLockUi();
}

function queueMobileShellStateSync() {
  if (_mobileShellFrame) return;
  _mobileShellFrame = requestAnimationFrame(syncMobileShellState);
}

queueMobileShellStateSync();
document.addEventListener("DOMContentLoaded", queueMobileShellStateSync);
window.addEventListener("load", queueMobileShellStateSync);
window.addEventListener("resize", queueMobileShellStateSync, { passive: true });
window.addEventListener("orientationchange", queueMobileShellStateSync, {
  passive: true,
});

// ── Dark mode toggle ──
function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", isDark ? "" : "dark");
  storageManager.set(STORAGE_KEYS.THEME, isDark ? "light" : "dark");
  const icon = document.getElementById("darkModeIcon");
  if (icon) icon.textContent = isDark ? "🌙" : "☀️";
}

// Restore theme on load
(function _restoreTheme() {
  const saved =
    storageManager.get(STORAGE_KEYS.THEME) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    const icon = document.getElementById("darkModeIcon");
    if (icon) icon.textContent = "☀️";
  }
})();

// Runtime OS theme change (only when user hasn't set a manual preference)
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    if (!storageManager.get(STORAGE_KEYS.THEME)) {
      document.documentElement.setAttribute(
        "data-theme",
        e.matches ? "dark" : "",
      );
      const icon = document.getElementById("darkModeIcon");
      if (icon) icon.textContent = e.matches ? "☀️" : "🌙";
    }
  });

// ── Universal command palette ──
const COMMAND_PALETTE_LIMIT = 12;
const COMMAND_PLAY_ACTION_TOKENS = new Set([
  "add",
  "board",
  "box",
  "call",
  "clipboard",
  "copy",
  "game",
  "open",
  "place",
  "plan",
  "playbook",
  "practice",
  "script",
  "sheet",
  "to",
]);
let _commandPaletteItems = [];
let _commandPaletteActiveIndex = 0;
let _commandPaletteReturnFocus = null;
let _commandPaletteHideTimer = null;

function _commandEscape(text) {
  if (typeof escapeHtml === "function") return escapeHtml(text);
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function _normalizeCommandText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function _canShowCommandTab(tabName) {
  return typeof canAccessTab !== "function" || canAccessTab(tabName);
}

function _canUseMutatingCommand() {
  if (typeof isMobileCoachLockActive === "function" && isMobileCoachLockActive()) {
    return false;
  }
  return typeof isAdminUser !== "function" || isAdminUser();
}

function _buildCommandBaseItems() {
  const tabs = [
    ["playbook", "Playbook", "Browse, filter, edit, and organize imported plays"],
    ["script", "Practice Script", "Build periods, reps, scout looks, and print scripts"],
    ["wristband", "Wristband", "Build, fill, search, and print wristband cards"],
    ["gameplan", "Game Plan", "Plan openers, must-haves, answers, and weekly calls"],
    ["callsheet", "Call Sheet", "Organize calls by situation and game-day category"],
    ["dashboard", "Dashboard", "Review game week status, notes, and scouting links"],
    ["tendencies", "Defensive Tendencies", "Chart opponents and review defensive patterns"],
    ["identity", "Identity", "Review offensive identity and team direction"],
    ["offensebuilder", "Offense Builder", "Rate concepts and build offensive packages"],
    ["installation", "Installation", "Track installs, teaching progress, and packages"],
  ];

  const items = tabs
    .filter(([tabName]) => _canShowCommandTab(tabName))
    .map(([tabName, title, subtitle], index) => ({
      kind: "Tab",
      title,
      subtitle,
      keywords: `${tabName} ${title} ${subtitle}`,
      priority: 20 + index,
      run: () => showTab(tabName),
    }));

  items.push(
    {
      kind: "Action",
      title: "Focus Playbook Search",
      subtitle: "Jump to the playbook search box",
      keywords: "find search play plays playbook filter",
      priority: 6,
      run: () => {
        showTab("playbook");
        requestAnimationFrame(() => document.getElementById("searchPlay")?.focus());
      },
    },
    {
      kind: "Action",
      title: "Toggle Dark Mode",
      subtitle: "Switch the app color theme",
      keywords: "dark light theme mode",
      priority: 30,
      run: () => toggleDarkMode(),
    },
    {
      kind: "Action",
      title: "Toggle Vision Mode",
      subtitle: "Turn the 2026 visual framework on or off",
      keywords: "vision mode framework",
      priority: 31,
      run: () => {
        if (typeof toggleVisionMode === "function") toggleVisionMode();
      },
    },
  );

  if (
    typeof showUpload === "function" &&
    _canUseMutatingCommand() &&
    (typeof canManageSettings !== "function" || canManageSettings())
  ) {
    items.push({
      kind: "Action",
      title: "Import, Export, and Settings",
      subtitle: "Open CSV upload, backup, restore, and team settings",
      keywords: "upload import export backup restore settings csv roster team",
      priority: 32,
      run: () => showUpload(),
    });
  }

  if (typeof openCloudSyncModal === "function" && _canUseMutatingCommand()) {
    items.push({
      kind: "Action",
      title: "Cloud Sync",
      subtitle: "Open backup push/pull sync controls",
      keywords: "cloud sync backup pull push",
      priority: 33,
      run: () => openCloudSyncModal(),
    });
  }

  if (typeof openPlaybookDataHealth === "function") {
    items.push({
      kind: "Action",
      title: "Playbook Data Health",
      subtitle: "Review duplicate plays, missing fields, vocabulary, categories, and CSV cleanup",
      keywords: "data health duplicate duplicates missing fields vocabulary casing spelling category coverage unused overloaded csv import cleanup playbook quality template",
      priority: 34,
      run: () => {
        showTab("playbook");
        requestAnimationFrame(() => openPlaybookDataHealth());
      },
    });
  }

  if (typeof openWbQuickSearch === "function") {
    items.push({
      kind: "Action",
      title: "Wristband Quick Search",
      subtitle: "Open the wristband play finder",
      keywords: "wristband quick search find play",
      priority: 35,
      run: () => {
        showTab("wristband");
        requestAnimationFrame(() => openWbQuickSearch());
      },
    });
  }

  if (typeof openGamePlanPrintModal === "function") {
    items.push({
      kind: "Action",
      title: "Print Game Plan Board",
      subtitle: "Open the board-only game plan print controls",
      keywords: "game plan board print export",
      priority: 36,
      run: () => {
        showTab("gameplan");
        requestAnimationFrame(() => openGamePlanPrintModal());
      },
    });
  }

  if (typeof openPrintStudio === "function") {
    items.push({
      kind: "Action",
      title: "Print and Export Studio",
      subtitle: "Preview, check, name, print, and export all game-week materials",
      keywords: "print export studio preview script call sheet wristband game plan scouting report pdf csv filename",
      priority: 37,
      run: () => openPrintStudio(),
    });
  }

  if (typeof openGamePlanTemplatesMenu === "function") {
    items.push({
      kind: "Action",
      title: "Game Plan Templates",
      subtitle: "Load or delete reusable game plan board templates",
      keywords: "game plan template templates weekly board saved starter",
      priority: 38,
      run: () => {
        showTab("gameplan");
        requestAnimationFrame(() => openGamePlanTemplatesMenu());
      },
    });
  }

  return items;
}

function _getCommandPlayTitle(play) {
  return play?.play || play?.basePlay || play?.formation || "Unnamed play";
}

function _getCommandPlaySubtitle(play) {
  return [
    play?.type,
    play?.personnel ? `${play.personnel} pers` : "",
    play?.formation,
    play?.basePlay,
    play?.preferredSituation,
    play?.preferredDown ? `D${play.preferredDown}` : "",
    play?.preferredDistance,
  ]
    .filter(Boolean)
    .join(" · ");
}

function _getCommandPlaySearchText(play) {
  return [
    play?.type,
    play?.personnel,
    play?.formation,
    play?.formTag1,
    play?.formTag2,
    play?.back,
    play?.shift,
    play?.motion,
    play?.protection,
    play?.lineCall,
    play?.play,
    play?.playTag1,
    play?.playTag2,
    play?.basePlay,
    play?.oneWord,
    play?.preferredSituation,
    play?.preferredDown,
    play?.preferredDistance,
    play?.preferredHash,
    play?.preferredFieldPosition,
    play?.tempo,
    play?.practiceFront,
    play?.practiceDefense,
    play?.practiceCoverage,
    play?.practiceBlitz,
    play?.practiceStunt,
    play?.keyPlayer1,
    play?.keyPlayer2,
    play?.keyPlayer3,
    play?.constraint1,
    play?.constraint2,
    play?.constraint3,
    play?.opponent,
    play?.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

function _scoreCommandItem(item, tokens) {
  const title = _normalizeCommandText(item.title);
  const haystack = _normalizeCommandText(`${item.title} ${item.subtitle || ""} ${item.keywords || ""}`);
  if (!tokens.every((token) => haystack.includes(token))) return -1;

  let score = item.priority || 100;
  tokens.forEach((token) => {
    if (title === token) score -= 40;
    else if (title.startsWith(token)) score -= 24;
    else if (title.includes(token)) score -= 12;
  });
  return score;
}

function _getCommandPlayMasterIndex(play) {
  if (!Array.isArray(plays) || !play) return -1;
  const objectIndex = plays.indexOf(play);
  if (objectIndex >= 0) return objectIndex;

  if (typeof _gpPlaySignature === "function") {
    const sig = _gpPlaySignature(play);
    const sigIndex = plays.findIndex((candidate) => _gpPlaySignature(candidate) === sig);
    if (sigIndex >= 0) return sigIndex;
  }

  return plays.findIndex(
    (candidate) =>
      candidate?.play === play.play &&
      candidate?.formation === play.formation &&
      candidate?.personnel === play.personnel,
  );
}

function _getCommandGamePlanBoxId(play) {
  if (typeof GP_DEFAULT_BOXES === "undefined") return "";
  const mappedType =
    typeof GP_TYPE_ALIASES !== "undefined"
      ? GP_TYPE_ALIASES[play?.type] || play?.type
      : play?.type;
  const defaultIds = new Set(GP_DEFAULT_BOXES.map((box) => box.id));
  if (mappedType && defaultIds.has(mappedType)) return mappedType;
  return typeof GP_HOLDING_ID !== "undefined" ? GP_HOLDING_ID : "";
}

async function _commandAddPlayToScript(play) {
  if (!_canUseMutatingCommand()) return;
  if (typeof ensureScriptWorkspaceReady === "function") {
    ensureScriptWorkspaceReady();
  } else if (typeof initScriptWorkspace === "function") {
    initScriptWorkspace();
  }
  if (typeof ensureFirstPeriod === "function") ensureFirstPeriod();

  const playIndex = _getCommandPlayMasterIndex(play);
  if (playIndex < 0 || typeof addToScript !== "function") {
    showToast("Could not add that play to the script.", { type: "error" });
    return;
  }

  const targetIndex =
    typeof getPreferredTargetPeriodIndex === "function"
      ? getPreferredTargetPeriodIndex()
      : null;
  await addToScript(playIndex, targetIndex);
  if (typeof showTab === "function") showTab("script");
}

function _commandAddPlayToGamePlan(play) {
  if (!_canUseMutatingCommand()) return;
  if (typeof _gpPlaySignature !== "function" || typeof _gpAddSigsToBox !== "function") {
    showToast("Game plan tools are not ready yet.", { type: "error" });
    return;
  }

  const boxId = _getCommandGamePlanBoxId(play);
  if (!boxId) {
    showToast("Could not find a game plan box for that play.", { type: "error" });
    return;
  }
  _gpAddSigsToBox([_gpPlaySignature(play)], boxId);
  if (typeof showTab === "function") showTab("gameplan");
}

function _commandAddPlayToCallSheet(play) {
  if (!_canUseMutatingCommand()) return;
  if (typeof initCallSheet === "function" && (!callSheet || Object.keys(callSheet).length === 0)) {
    initCallSheet();
  }
  if (typeof _addPlaysToCallSheet !== "function") {
    showToast("Call sheet tools are not ready yet.", { type: "error" });
    return;
  }

  const placed = _addPlaysToCallSheet([play]);
  if (placed > 0) {
    showToast(`Placed ${placed} call sheet entr${placed === 1 ? "y" : "ies"}`, {
      type: "success",
    });
    if (typeof showTab === "function") showTab("callsheet");
  } else {
    showToast("No matching call sheet category found for that play.", {
      type: "warning",
    });
  }
}

function _commandCopyPlayName(play) {
  const title = _getCommandPlayTitle(play);
  if (typeof copyPlayName === "function") copyPlayName(title);
  else navigator.clipboard?.writeText(title);
}

function _buildCommandPlayActionItems(match, index) {
  const play = match.play;
  const title = match.title;
  const actionItems = [
    {
      kind: "Play",
      title: `Open ${title}`,
      subtitle: match.subtitle || "Open in the playbook",
      keywords: `open play playbook ${match.haystack}`,
      priority: match.score,
      run: () => _openCommandPlay(play),
    },
  ];

  const actionPriority = match.score + 0.12;
  if (_canUseMutatingCommand() && index < 2) {
    actionItems.push(
      {
        kind: "Script",
        title: `Add ${title} to Script`,
        subtitle: "Adds to the preferred or first practice period",
        keywords: `add script practice period ${match.haystack}`,
        priority: actionPriority,
        run: () => _commandAddPlayToScript(play),
      },
      {
        kind: "Plan",
        title: `Add ${title} to Game Plan`,
        subtitle: `Routes to ${
          typeof _gpBoxLabel === "function"
            ? _gpBoxLabel(_getCommandGamePlanBoxId(play))
            : "the matching"
        } box`,
        keywords: `add game plan board box ${match.haystack}`,
        priority: actionPriority + 0.01,
        run: () => _commandAddPlayToGamePlan(play),
      },
      {
        kind: "Sheet",
        title: `Place ${title} on Call Sheet`,
        subtitle: "Uses preferred fields to choose matching categories",
        keywords: `place add call sheet category situation ${match.haystack}`,
        priority: actionPriority + 0.02,
        run: () => _commandAddPlayToCallSheet(play),
      },
    );
  }

  if (index < 2) {
    actionItems.push({
      kind: "Copy",
      title: `Copy ${title}`,
      subtitle: "Copy the play name",
      keywords: `copy clipboard name play ${match.haystack}`,
      priority: actionPriority + 0.03,
      run: () => _commandCopyPlayName(play),
    });
  }

  return actionItems;
}

function _buildCommandPlayItems(query, tokens) {
  if (!Array.isArray(plays) || !plays.length || query.length < 2) return [];
  const playTokens = tokens.filter((token) => !COMMAND_PLAY_ACTION_TOKENS.has(token));
  if (!playTokens.length) return [];

  const matches = [];
  for (const play of plays) {
    const title = _getCommandPlayTitle(play);
    const subtitle = _getCommandPlaySubtitle(play);
    const haystack = _normalizeCommandText(`${title} ${subtitle} ${_getCommandPlaySearchText(play)}`);
    if (!playTokens.every((token) => haystack.includes(token))) continue;

    let score = 70;
    const normalizedTitle = _normalizeCommandText(title);
    playTokens.forEach((token) => {
      if (normalizedTitle === token) score -= 35;
      else if (normalizedTitle.startsWith(token)) score -= 20;
      else if (normalizedTitle.includes(token)) score -= 10;
    });
    matches.push({
      play,
      title,
      subtitle: subtitle || "Imported playbook play",
      haystack,
      score,
    });
    if (matches.length >= 80) break;
  }

  return matches
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .flatMap((match, index) => _buildCommandPlayActionItems(match, index))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, COMMAND_PALETTE_LIMIT);
}

function _buildCommandPaletteItems(rawQuery) {
  const query = _normalizeCommandText(rawQuery);
  const tokens = query.split(/\s+/).filter(Boolean);
  const baseItems = _buildCommandBaseItems();

  if (!tokens.length) {
    return baseItems
      .sort((a, b) => (a.priority || 100) - (b.priority || 100))
      .slice(0, COMMAND_PALETTE_LIMIT);
  }

  const matchedBase = baseItems
    .map((item) => ({ item, score: _scoreCommandItem(item, tokens) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.item);
  const playItems = _buildCommandPlayItems(query, tokens);

  return [...matchedBase, ...playItems]
    .sort((a, b) => (a.priority || 100) - (b.priority || 100))
    .slice(0, COMMAND_PALETTE_LIMIT);
}

function _renderCommandPaletteResults() {
  const input = document.getElementById("commandPaletteInput");
  const results = document.getElementById("commandPaletteResults");
  const meta = document.getElementById("commandPaletteMeta");
  if (!input || !results || !meta) return;

  _commandPaletteItems = _buildCommandPaletteItems(input.value);
  _commandPaletteActiveIndex = Math.min(
    _commandPaletteActiveIndex,
    Math.max(_commandPaletteItems.length - 1, 0),
  );

  const playCount = Array.isArray(plays) ? plays.length : 0;
  meta.textContent = input.value.trim()
    ? `${_commandPaletteItems.length} result${_commandPaletteItems.length === 1 ? "" : "s"}`
    : `Type to search ${playCount} play${playCount === 1 ? "" : "s"} and app commands`;

  if (!_commandPaletteItems.length) {
    results.innerHTML = '<div class="command-palette-empty">No matching plays or commands.</div>';
    input.removeAttribute("aria-activedescendant");
    return;
  }

  results.innerHTML = _commandPaletteItems
    .map((item, index) => {
      const selected = index === _commandPaletteActiveIndex ? "true" : "false";
      return `
        <button id="commandPaletteResult-${index}" class="command-palette-result" type="button"
          role="option" aria-selected="${selected}" data-command-index="${index}">
          <span class="command-palette-result-main">
            <span class="command-palette-result-title">${_commandEscape(item.title)}</span>
            <span class="command-palette-result-subtitle">${_commandEscape(item.subtitle || "")}</span>
          </span>
          <span class="command-palette-result-kind">${_commandEscape(item.kind)}</span>
        </button>
      `;
    })
    .join("");
  input.setAttribute("aria-activedescendant", `commandPaletteResult-${_commandPaletteActiveIndex}`);
}

function _setCommandPaletteActiveIndex(nextIndex) {
  if (!_commandPaletteItems.length) return;
  const max = _commandPaletteItems.length - 1;
  _commandPaletteActiveIndex = Math.max(0, Math.min(nextIndex, max));
  document.querySelectorAll(".command-palette-result").forEach((button, index) => {
    button.setAttribute("aria-selected", index === _commandPaletteActiveIndex ? "true" : "false");
  });
  const active = document.getElementById(`commandPaletteResult-${_commandPaletteActiveIndex}`);
  const input = document.getElementById("commandPaletteInput");
  if (input) input.setAttribute("aria-activedescendant", active?.id || "");
  active?.scrollIntoView({ block: "nearest" });
}

function _runCommandPaletteItem(index = _commandPaletteActiveIndex) {
  const item = _commandPaletteItems[index];
  if (!item || typeof item.run !== "function") return;
  closeCommandPalette({ restoreFocus: false });
  item.run();
}

function _openCommandPlay(play) {
  showTab("playbook");
  requestAnimationFrame(() => {
    const search = document.getElementById("searchPlay");
    const title = _getCommandPlayTitle(play);
    if (search) search.value = title;
    if (typeof filterPlays === "function") filterPlays();

    let filteredIndex = Array.isArray(filteredPlays) ? filteredPlays.indexOf(play) : -1;
    if (filteredIndex < 0 && typeof clearFilters === "function") {
      clearFilters();
      if (search) search.value = title;
      if (typeof filterPlays === "function") filterPlays();
      filteredIndex = Array.isArray(filteredPlays) ? filteredPlays.indexOf(play) : -1;
    }
    if (filteredIndex < 0) return;

    if (typeof PLAYS_PER_PAGE !== "undefined") {
      currentPage = Math.floor(filteredIndex / PLAYS_PER_PAGE);
    }
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
    requestAnimationFrame(() => {
      if (typeof selectPlaybookRow === "function") selectPlaybookRow(filteredIndex);
      const target =
        document.querySelector(`#playbookTable tr[data-idx="${filteredIndex}"]`) ||
        document.querySelector(`#pbCards .pb-card[data-idx="${filteredIndex}"]`);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });
}

function isCommandPaletteOpen() {
  const overlay = document.getElementById("commandPaletteOverlay");
  return Boolean(overlay && !overlay.hidden && overlay.classList.contains("visible"));
}

function openCommandPalette(seed = "") {
  const overlay = document.getElementById("commandPaletteOverlay");
  const input = document.getElementById("commandPaletteInput");
  if (!overlay || !input) return;

  if (_commandPaletteHideTimer) {
    clearTimeout(_commandPaletteHideTimer);
    _commandPaletteHideTimer = null;
  }
  _commandPaletteReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.hidden = false;
  input.value = typeof seed === "string" ? seed : "";
  _commandPaletteActiveIndex = 0;
  _renderCommandPaletteResults();
  requestAnimationFrame(() => {
    overlay.classList.add("visible");
    input.focus();
    input.select();
    if (typeof trapFocus === "function" && overlay.dataset.focusTrap !== "true") {
      trapFocus(overlay);
      overlay.dataset.focusTrap = "true";
    }
  });
}

function closeCommandPalette(options = {}) {
  const overlay = document.getElementById("commandPaletteOverlay");
  const input = document.getElementById("commandPaletteInput");
  if (!overlay || overlay.hidden) return;

  overlay.classList.remove("visible");
  if (input) {
    input.value = "";
    input.removeAttribute("aria-activedescendant");
  }
  _commandPaletteItems = [];
  _commandPaletteActiveIndex = 0;
  _commandPaletteHideTimer = setTimeout(() => {
    overlay.hidden = true;
    _commandPaletteHideTimer = null;
  }, 160);

  if (options.restoreFocus !== false && _commandPaletteReturnFocus) {
    _commandPaletteReturnFocus.focus();
  }
  _commandPaletteReturnFocus = null;
}

function _handleCommandPaletteKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeCommandPalette();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    _setCommandPaletteActiveIndex(_commandPaletteActiveIndex + 1);
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    _setCommandPaletteActiveIndex(_commandPaletteActiveIndex - 1);
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    _runCommandPaletteItem();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("commandPaletteInput");
  const results = document.getElementById("commandPaletteResults");
  if (!input || !results) return;

  input.addEventListener("input", () => {
    _commandPaletteActiveIndex = 0;
    _renderCommandPaletteResults();
  });
  input.addEventListener("keydown", _handleCommandPaletteKeydown);
  results.addEventListener("keydown", _handleCommandPaletteKeydown);
  results.addEventListener("mouseover", (e) => {
    const button = e.target.closest("[data-command-index]");
    if (!button) return;
    _setCommandPaletteActiveIndex(parseInt(button.dataset.commandIndex, 10));
  });
  results.addEventListener("click", (e) => {
    const button = e.target.closest("[data-command-index]");
    if (!button) return;
    _runCommandPaletteItem(parseInt(button.dataset.commandIndex, 10));
  });
});

// ── Global keyboard shortcuts: Undo/Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Y / Shift+Z) ──
document.addEventListener("keydown", (e) => {
  const inInput =
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable;

  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (
      e.shiftKey &&
      currentActiveTab === "wristband" &&
      typeof openWbQuickSearch === "function"
    ) {
      openWbQuickSearch();
    } else {
      openCommandPalette();
    }
    return;
  }

  if (typeof isCommandPaletteOpen === "function" && isCommandPaletteOpen()) {
    return;
  }

  // Offense Builder shortcuts (when on OB tab)
  if (
    currentActiveTab === "offensebuilder" &&
    !mod &&
    !e.altKey &&
    !e.shiftKey
  ) {
    if (e.key === "/" && !inInput) {
      e.preventDefault();
      const searchInput = document.getElementById("obSearchInput");
      if (searchInput) searchInput.focus();
      return;
    }
    if (e.key === "Escape") {
      if (inInput) {
        const searchInput = document.getElementById("obSearchInput");
        if (searchInput && document.activeElement === searchInput) {
          if (searchInput.value) {
            searchInput.value = "";
            obSearchTerm = "";
            obRenderPlayList();
          } else {
            searchInput.blur();
          }
        }
      } else if (obActivePlayName) {
        obActivePlayName = null;
        obRenderPlayList();
        obRenderSidebar();
      }
      return;
    }
    if (e.key === "r" && !inInput) {
      e.preventDefault();
      const checkbox = document.getElementById("obShowRated");
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        obShowRatedOnly = checkbox.checked;
        obRenderPlayList();
      }
      return;
    }
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !inInput) {
      e.preventDefault();
      const cards = document.querySelectorAll("#obPlayList .ob-card");
      if (!cards.length) return;
      const names = Array.from(cards).map((card) => card.dataset.play);
      const index = obActivePlayName ? names.indexOf(obActivePlayName) : -1;
      let nextIndex;
      if (e.key === "ArrowDown") {
        nextIndex = index < names.length - 1 ? index + 1 : 0;
      } else {
        nextIndex = index > 0 ? index - 1 : names.length - 1;
      }
      obActivePlayName = names[nextIndex];
      obRenderPlayList();
      obRenderSidebar();
      const activeCard = document.querySelector("#obPlayList .ob-card.active");
      if (activeCard) activeCard.scrollIntoView({ block: "nearest" });
      return;
    }
  }

  if (inInput) return;

  if (
    !mod && !e.altKey && !e.shiftKey &&
    e.key === "?" &&
    currentActiveTab === "script" &&
    typeof showScriptShortcutsModal === "function"
  ) {
    e.preventDefault();
    showScriptShortcutsModal();
    return;
  }

  if (!mod && !e.altKey && !e.shiftKey && e.key >= "1" && e.key <= "8") {
    const tabNames = [
      "playbook",
      "script",
      "wristband",
      "tendencies",
      "callsheet",
      "installation",
      "offensebuilder",
      "dashboard",
    ];
    const tab = tabNames[parseInt(e.key, 10) - 1];
    if (tab) {
      e.preventDefault();
      showTab(tab);
    }
    return;
  }

  if (!mod) return;

  if (e.key === "z" && !e.shiftKey) {
    if (currentActiveTab === "script" && typeof undoScript === "function") {
      e.preventDefault();
      undoScript();
    } else if (
      currentActiveTab === "wristband" &&
      typeof undoWristband === "function"
    ) {
      e.preventDefault();
      undoWristband();
    } else if (
      currentActiveTab === "tendencies" &&
      typeof undoTendencies === "function"
    ) {
      e.preventDefault();
      undoTendencies();
    }
    return;
  }

  if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
    if (currentActiveTab === "script" && typeof redoScript === "function") {
      e.preventDefault();
      redoScript();
    } else if (
      currentActiveTab === "wristband" &&
      typeof redoWristband === "function"
    ) {
      e.preventDefault();
      redoWristband();
    } else if (
      currentActiveTab === "tendencies" &&
      typeof redoTendencies === "function"
    ) {
      e.preventDefault();
      redoTendencies();
    }
  }
});

// ── Autosave status indicator ──
function updateSaveStatus(state) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.className = "save-status " + state;
  el.textContent =
    state === "saved"
      ? "✓ Saved"
      : state === "saving"
        ? "⏳ Saving…"
        : "● Unsaved";
}

// ── Offline connectivity banner ──
(function _initOfflineBanner() {
  const banner = document.createElement("div");
  banner.className = "offline-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.textContent =
    "📡 You’re offline — changes are saved locally and will sync when reconnected";
  document.body.prepend(banner);
  const update = () => banner.classList.toggle("visible", !navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
})();

// ── Mobile Coach Mode dock ──
const MOBILE_COACH_LOCK_ALLOWED_ACTIONS = new Set([
  "showTab",
  "dashGoToTab",
  "toggleMobileCoachLock",
  "coachFocusScriptCall",
  "coachNextScriptCall",
  "coachPrevScriptCall",
  "openCommandPalette",
  "closeCommandPalette",
  "toggleDarkMode",
  "logoutAuth",
]);
const MOBILE_COACH_LOCK_SAFE_INPUT_RE =
  /search|filter|sort|highlight|commandpalette/i;
let _mobileCoachLockToastAt = 0;

function isMobileCoachLockEnabled() {
  if (typeof storageManager === "undefined" || typeof STORAGE_KEYS === "undefined") {
    return false;
  }
  return storageManager.get(STORAGE_KEYS.MOBILE_COACH_LOCK, false) === true;
}

function isMobileCoachLockActive() {
  const body = document.body;
  return Boolean(
    body &&
      body.classList.contains("is-mobile-screen") &&
      body.classList.contains("mobile-coach-locked"),
  );
}

function _isMobileCoachLockSafeInput(el) {
  if (!el || !el.matches?.("input, select, textarea")) return false;
  if (el.closest(".command-palette-overlay")) return true;
  if (el.type === "hidden") return true;
  if (el.type === "search") return true;
  const haystack = [
    el.id,
    el.name,
    el.className,
    el.placeholder,
    el.dataset?.oninput,
    el.dataset?.onchange,
    el.dataset?.action,
  ]
    .filter(Boolean)
    .join(" ");
  return MOBILE_COACH_LOCK_SAFE_INPUT_RE.test(haystack);
}

function _isMobileCoachLockAllowedControl(el) {
  if (!el) return false;
  if (
    el.closest(
      "#mobileCoachDock, #mobileScriptCoachNow, #authLoginOverlay, .command-palette-overlay, [data-mobile-lock-allow='true']",
    )
  ) {
    return true;
  }
  if (el.classList?.contains("tab") || el.closest?.(".tab")) return true;
  if (_isMobileCoachLockSafeInput(el)) return true;

  const actionEl = el.closest?.("[data-action]");
  const action = actionEl?.dataset?.action || "";
  if (!action) return false;
  return (
    MOBILE_COACH_LOCK_ALLOWED_ACTIONS.has(action) ||
    action.endsWith("Overlay") ||
    action.startsWith("close")
  );
}

function _showMobileCoachLockToast() {
  const now = Date.now();
  if (now - _mobileCoachLockToastAt < 1200) return;
  _mobileCoachLockToastAt = now;
  showToast("Mobile coach lock is on. Unlock to edit.", {
    type: "warning",
    duration: 2500,
  });
}

function _shouldBlockMobileCoachLockedEvent(e) {
  if (!isMobileCoachLockActive()) return false;
  const target = e.target instanceof Element ? e.target : null;
  if (!target || _isMobileCoachLockAllowedControl(target)) return false;

  if (e.type === "beforeinput" || e.type === "input" || e.type === "change") {
    return Boolean(
      target.matches("input, select, textarea") &&
        target.closest("#mainApp, .custom-modal-overlay, .modal-overlay"),
    );
  }

  if (e.type === "submit" || e.type === "dragstart" || e.type === "drop") {
    return Boolean(target.closest("#mainApp, .custom-modal-overlay, .modal-overlay"));
  }

  if (e.type === "click") {
    const control = target.closest(
      "button, a, input, select, textarea, label, [role='button'], [data-action], [draggable='true']",
    );
    if (!control || _isMobileCoachLockAllowedControl(control)) return false;
    return Boolean(control.closest("#mainApp, .custom-modal-overlay, .modal-overlay"));
  }

  return false;
}

function handleMobileCoachLockedInteraction(e) {
  if (!_shouldBlockMobileCoachLockedEvent(e)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  _showMobileCoachLockToast();
}

function _setMobileCoachLockDisabled(control, locked) {
  if (!control || !("disabled" in control)) return;

  if (locked && !_isMobileCoachLockAllowedControl(control)) {
    if (control.dataset.mobileLockDisabled !== "true") {
      control.dataset.mobileLockWasDisabled = control.disabled ? "true" : "false";
    }
    control.disabled = true;
    control.dataset.mobileLockDisabled = "true";
    control.setAttribute("aria-disabled", "true");
    return;
  }

  if (control.dataset.mobileLockDisabled === "true") {
    if (control.dataset.mobileLockWasDisabled !== "true") {
      control.disabled = false;
    }
    delete control.dataset.mobileLockDisabled;
    delete control.dataset.mobileLockWasDisabled;
    control.removeAttribute("aria-disabled");
  }
}

function applyMobileCoachLockUi() {
  const body = document.body;
  if (!body) return;

  const locked = isMobileCoachLockEnabled();
  const activeOnMobile = locked && body.classList.contains("is-mobile-screen");
  body.classList.toggle("mobile-coach-locked", locked);
  body.dataset.mobileCoachLocked = locked ? "true" : "false";

  const toggle = document.getElementById("mobileCoachLockToggle");
  const icon = document.getElementById("coachDockLockIcon");
  const label = document.getElementById("coachDockLockLabel");
  if (toggle) {
    toggle.setAttribute("aria-pressed", locked ? "true" : "false");
    toggle.title = locked ? "Unlock mobile coach mode" : "Lock mobile coach mode";
    toggle.setAttribute(
      "aria-label",
      locked ? "Unlock mobile coach mode" : "Lock mobile coach mode",
    );
  }
  if (icon) icon.textContent = locked ? "🔒" : "🔓";
  if (label) label.textContent = locked ? "Locked" : "Lock";

  const banner = document.getElementById("mobileCoachLockBanner");
  if (banner) banner.hidden = !activeOnMobile;

  document
    .querySelectorAll(
      "#mainApp .panel.active input, #mainApp .panel.active select, #mainApp .panel.active textarea, #mainApp .panel.active button, .custom-modal-overlay input, .custom-modal-overlay select, .custom-modal-overlay textarea, .custom-modal-overlay button, .modal-overlay input, .modal-overlay select, .modal-overlay textarea, .modal-overlay button",
    )
    .forEach((control) => _setMobileCoachLockDisabled(control, activeOnMobile));
}

function setMobileCoachLock(locked, options = {}) {
  if (typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined") {
    storageManager.set(STORAGE_KEYS.MOBILE_COACH_LOCK, Boolean(locked));
  }
  if (locked && typeof closeCommandPalette === "function") {
    closeCommandPalette({ restoreFocus: false });
  }
  applyMobileCoachLockUi();
  if (!options.silent) {
    showToast(locked ? "Mobile coach lock on." : "Mobile coach lock off.", {
      type: locked ? "warning" : "success",
      duration: 2200,
    });
  }
}

function toggleMobileCoachLock() {
  setMobileCoachLock(!isMobileCoachLockEnabled());
}

["beforeinput", "input", "change", "click", "submit", "dragstart", "drop"].forEach(
  (eventName) => {
    document.addEventListener(eventName, handleMobileCoachLockedInteraction, true);
  },
);
document.addEventListener("DOMContentLoaded", applyMobileCoachLockUi);

function _setMobileCoachCount(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  const safeCount = Math.max(0, Number(count) || 0);
  el.textContent = safeCount > 0 ? (safeCount > 99 ? "99+" : String(safeCount)) : "";
}

function _getMobileCoachCounts() {
  const scriptCount = Array.isArray(script)
    ? script.filter((play) => play && !play.isSeparator).length
    : 0;
  const wristbandCount =
    typeof wristbandCards !== "undefined" && Array.isArray(wristbandCards)
      ? wristbandCards.reduce(
        (sum, card) => sum + (Array.isArray(card.data) ? card.data.filter(Boolean).length : 0),
        0,
      )
      : 0;
  const callSheetCount =
    typeof callSheet !== "undefined" && callSheet
      ? Object.values(callSheet).reduce(
        (sum, category) =>
          sum +
          (Array.isArray(category?.left) ? category.left.length : 0) +
          (Array.isArray(category?.right) ? category.right.length : 0),
        0,
      )
      : 0;
  let gamePlanCount = 0;
  try {
    if (typeof getGamePlanBoardSignatures === "function") {
      gamePlanCount = getGamePlanBoardSignatures().size;
    }
  } catch (_err) {
    gamePlanCount = 0;
  }

  return { scriptCount, wristbandCount, callSheetCount, gamePlanCount };
}

function updateMobileCoachDock() {
  const dock = document.getElementById("mobileCoachDock");
  if (!dock) return;
  const activeTab =
    typeof currentActiveTab !== "undefined"
      ? currentActiveTab
      : document.body?.dataset.activeTab || "playbook";

  dock.querySelectorAll("[data-coach-tab]").forEach((button) => {
    if (typeof canAccessTab === "function" && !canAccessTab(button.dataset.coachTab)) {
      button.hidden = true;
      button.classList.remove("active");
      button.removeAttribute("aria-current");
      return;
    }
    button.hidden = false;
    const isActive = button.dataset.coachTab === activeTab;
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  const counts = _getMobileCoachCounts();
  _setMobileCoachCount("coachDockScriptCount", counts.scriptCount);
  _setMobileCoachCount("coachDockSheetCount", counts.callSheetCount);
  _setMobileCoachCount("coachDockWristCount", counts.wristbandCount);
  _setMobileCoachCount("coachDockPlanCount", counts.gamePlanCount);
}

document.addEventListener("DOMContentLoaded", updateMobileCoachDock);

let _mobileCoachScriptIndex = null;

function _getMobileScriptPlayableIndices() {
  if (!Array.isArray(script)) return [];
  return script
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && !item.isSeparator)
    .map(({ index }) => index);
}

function _normalizeMobileCoachScriptIndex(preferredIndex = _mobileCoachScriptIndex) {
  const playable = _getMobileScriptPlayableIndices();
  if (!playable.length) return null;
  if (Number.isInteger(preferredIndex) && playable.includes(preferredIndex)) {
    return preferredIndex;
  }
  if (Number.isInteger(preferredIndex)) {
    const next = playable.find((index) => index > preferredIndex);
    if (next !== undefined) return next;
  }
  return playable[0];
}

function _getMobileScriptOrdinal(scriptIndex) {
  const playable = _getMobileScriptPlayableIndices();
  const ordinal = playable.indexOf(scriptIndex);
  return {
    current: ordinal >= 0 ? ordinal + 1 : 0,
    total: playable.length,
  };
}

function _getMobileScriptPeriodLabel(scriptIndex) {
  if (typeof findOwningPeriodIndex === "function") {
    const periodIndex = findOwningPeriodIndex(scriptIndex);
    if (periodIndex >= 0 && script[periodIndex]) {
      return script[periodIndex].label || `Period ${periodIndex + 1}`;
    }
  }

  for (let index = scriptIndex - 1; index >= 0; index--) {
    if (script[index]?.isSeparator) return script[index].label || `Period ${index + 1}`;
  }
  return "Script";
}

function _getMobileScriptCallTitle(play) {
  if (!play) return "No call selected";
  if (typeof getScriptPlaySummaryText === "function") {
    return getScriptPlaySummaryText(play);
  }
  return [play.formation, play.play].filter(Boolean).join(" ") || "Unnamed play";
}

function _getMobileScriptCallDetail(play) {
  if (!play) return "";
  return [
    play.type,
    play.personnel ? `${play.personnel} pers` : "",
    play.hash ? `Hash ${play.hash}` : play.preferredHash ? `Pref ${play.preferredHash}` : "",
    play.reps ? `${play.reps} rep${Number(play.reps) === 1 ? "" : "s"}` : "",
    play.practiceFront,
    play.practiceCoverage,
  ]
    .filter(Boolean)
    .join(" • ");
}

function _setMobileScriptCoachControlsDisabled(disabled) {
  document
    .querySelectorAll("#mobileScriptCoachNow button")
    .forEach((button) => {
      button.disabled = disabled;
    });
}

function updateMobileCoachScriptNow() {
  const panel = document.getElementById("mobileScriptCoachNow");
  if (!panel) return;

  const currentIndex = _normalizeMobileCoachScriptIndex();
  _mobileCoachScriptIndex = currentIndex;

  const periodEl = document.getElementById("mobileScriptCoachPeriod");
  const progressEl = document.getElementById("mobileScriptCoachProgress");
  const callEl = document.getElementById("mobileScriptCoachCall");
  const detailEl = document.getElementById("mobileScriptCoachDetail");

  document
    .querySelectorAll("#scriptPlays .script-item.coach-current")
    .forEach((item) => item.classList.remove("coach-current"));

  if (currentIndex === null) {
    if (periodEl) periodEl.textContent = "No period";
    if (progressEl) progressEl.textContent = "0 / 0";
    if (callEl) callEl.textContent = "Add plays to start coach mode.";
    if (detailEl) detailEl.textContent = "";
    _setMobileScriptCoachControlsDisabled(true);
    return;
  }

  const play = script[currentIndex];
  const ordinal = _getMobileScriptOrdinal(currentIndex);
  if (periodEl) periodEl.textContent = _getMobileScriptPeriodLabel(currentIndex);
  if (progressEl) progressEl.textContent = `${ordinal.current} / ${ordinal.total}`;
  if (callEl) callEl.textContent = _getMobileScriptCallTitle(play);
  if (detailEl) detailEl.textContent = _getMobileScriptCallDetail(play);
  _setMobileScriptCoachControlsDisabled(false);

  const row = document.querySelector(`#scriptPlays .script-item[data-idx="${currentIndex}"]`);
  if (row) row.classList.add("coach-current");
}

function _focusMobileCoachScriptRow() {
  const currentIndex = _normalizeMobileCoachScriptIndex();
  if (currentIndex === null) {
    updateMobileCoachScriptNow();
    return;
  }
  _mobileCoachScriptIndex = currentIndex;

  const periodIndex =
    typeof findOwningPeriodIndex === "function"
      ? findOwningPeriodIndex(currentIndex)
      : -1;
  const period = periodIndex >= 0 ? script[periodIndex] : null;
  if (period?.id && typeof collapsedPeriods !== "undefined" && collapsedPeriods.has(period.id)) {
    collapsedPeriods.delete(period.id);
    if (typeof renderScript === "function") renderScript();
  }

  updateMobileCoachScriptNow();
  requestAnimationFrame(() => {
    const row = document.querySelector(`#scriptPlays .script-item[data-idx="${currentIndex}"]`);
    row?.scrollIntoView({
      block: "center",
      behavior:
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
    });
  });
}

function coachFocusScriptCall() {
  if (typeof showTab === "function") showTab("script");
  requestAnimationFrame(_focusMobileCoachScriptRow);
}

function coachNextScriptCall() {
  const playable = _getMobileScriptPlayableIndices();
  if (!playable.length) {
    updateMobileCoachScriptNow();
    return;
  }
  const currentIndex = _normalizeMobileCoachScriptIndex();
  const currentPosition = playable.indexOf(currentIndex);
  const nextPosition =
    currentPosition >= 0 && currentPosition < playable.length - 1
      ? currentPosition + 1
      : 0;
  _mobileCoachScriptIndex = playable[nextPosition];
  coachFocusScriptCall();
}

function coachPrevScriptCall() {
  const playable = _getMobileScriptPlayableIndices();
  if (!playable.length) {
    updateMobileCoachScriptNow();
    return;
  }
  const currentIndex = _normalizeMobileCoachScriptIndex();
  const currentPosition = playable.indexOf(currentIndex);
  const prevPosition =
    currentPosition > 0
      ? currentPosition - 1
      : playable.length - 1;
  _mobileCoachScriptIndex = playable[prevPosition];
  coachFocusScriptCall();
}

// ── Tab badge counts ──
function updateTabBadges() {
  const badges = {
    "tab-playbook": typeof plays !== "undefined" ? plays.length : 0,
    "tab-script": Array.isArray(script)
      ? script.filter((play) => !play.isSeparator).length
      : 0,
    "tab-wristband":
      typeof wristbandCards !== "undefined"
        ? wristbandCards.reduce(
          (sum, card) => sum + (card.data ? card.data.filter(Boolean).length : 0),
          0,
        )
        : 0,
    "tab-tendencies":
      typeof tendenciesOpponents !== "undefined" ? tendenciesOpponents.length : 0,
  };

  Object.entries(badges).forEach(([id, count]) => {
    const tab = document.getElementById(id);
    if (!tab) return;
    let badge = tab.querySelector(".tab-badge");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge badge-muted tab-badge";
        tab.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
  updateMobileCoachDock();
  updateMobileCoachScriptNow();
}

// ── Scroll-to-top FAB ──
function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

const _scrollFab = document.getElementById("scrollTopFab");
if (_scrollFab) {
  let scrollFabQueued = false;
  const updateScrollFab = () => {
    scrollFabQueued = false;
    _scrollFab.classList.toggle("visible", window.scrollY > 400);
  };
  window.addEventListener("scroll", () => {
    if (scrollFabQueued) return;
    scrollFabQueued = true;
    requestAnimationFrame(updateScrollFab);
  }, { passive: true });
}

// ── Tab bar scroll-fade indicator ──
const _tabBar = document.querySelector(".tabs");
if (_tabBar) {
  const _checkTabScroll = () => {
    const atEnd =
      _tabBar.scrollLeft + _tabBar.clientWidth >= _tabBar.scrollWidth - 2;
    _tabBar.classList.toggle("scrolled-end", atEnd);
  };
  _tabBar.addEventListener("scroll", _checkTabScroll, { passive: true });
  _checkTabScroll();
}

// Global error handlers — surface silent failures to the user
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
  showToast("⚠️ Something went wrong. Check console.", {
    duration: 4000,
    type: "error",
  });
});

window.addEventListener("error", (e) => {
  console.error("Uncaught error:", e.error || e.message);
});

// Tab bar arrow-key navigation (WCAG 2.1.1)
document.addEventListener("DOMContentLoaded", () => {
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;

  tablist.querySelectorAll('[role="tab"]').forEach((tab) => {
    tab.setAttribute(
      "tabindex",
      tab.getAttribute("aria-selected") === "true" ? "0" : "-1",
    );
  });

  tablist.addEventListener("keydown", (e) => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(e.target);
    if (index < 0) return;

    let next;
    if (e.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
    else if (e.key === "ArrowLeft") {
      next = tabs[(index - 1 + tabs.length) % tabs.length];
    }

    if (next) {
      e.preventDefault();
      tabs.forEach((tab) => tab.setAttribute("tabindex", "-1"));
      next.setAttribute("tabindex", "0");
      next.focus();
      next.click();
    }
  });
});

// Runtime accessibility guardrails for generated controls.
function getRuntimeA11yNodes(scope, selector) {
  const nodes = [];
  if (
    scope &&
    scope.nodeType === Node.ELEMENT_NODE &&
    typeof scope.matches === "function" &&
    scope.matches(selector)
  ) {
    nodes.push(scope);
  }
  if (scope && typeof scope.querySelectorAll === "function") {
    nodes.push(...scope.querySelectorAll(selector));
  }
  return nodes;
}

function enhanceRuntimeA11y(root = document) {
  const scope = root || document;
  getRuntimeA11yNodes(
    scope,
    "[data-action]:not(button):not(a):not(input):not(select):not(textarea)",
  ).forEach((el) => {
      const action = el.getAttribute("data-action") || "";
      if (!action || action.endsWith("Overlay") || el.matches("label")) return;
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    });

  getRuntimeA11yNodes(scope, "button").forEach((button) => {
    const name = button.textContent.trim() || button.getAttribute("aria-label") || "";
    if (name) return;
    const title = button.getAttribute("title");
    const action = button.getAttribute("data-action");
    const label = title || (action ? action.replace(/([A-Z])/g, " $1").trim() : "");
    if (label) button.setAttribute("aria-label", label);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  enhanceRuntimeA11y();
  let queued = false;
  const pendingRoots = new Set();
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE ||
          node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ) {
          pendingRoots.add(node);
        }
      });
    });
    if (!pendingRoots.size) return;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      pendingRoots.forEach((root) => enhanceRuntimeA11y(root));
      pendingRoots.clear();
      queueMobileShellStateSync();
      if (typeof applyMobileCoachLockUi === "function") applyMobileCoachLockUi();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest && e.target.closest("[data-action]");
  if (!el || el.matches("button,a,input,select,textarea,label")) return;
  const action = el.getAttribute("data-action") || "";
  if (!action || action.endsWith("Overlay")) return;
  e.preventDefault();
  el.click();
});
// Auto-fade floating action buttons (help / script-display) after idle
document.addEventListener("DOMContentLoaded", () => {
  const fabs = document.querySelectorAll(".help-fab, .script-display-fab");
  if (!fabs.length) return;

  const IDLE_MS = 2500;
  let idleTimer = null;

  const setIdle = () => document.body.classList.add("fab-idle");
  const setActive = () => {
    document.body.classList.remove("fab-idle");
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(setIdle, IDLE_MS);
  };

  ["mousemove", "touchstart", "keydown", "scroll", "click"].forEach((evt) => {
    window.addEventListener(evt, setActive, { passive: true });
  });
  setActive();
});
