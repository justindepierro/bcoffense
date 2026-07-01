// app-command.js — Universal command palette
// Extracted from app-shell.js

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
    ["tendencies", "Opponent Scout", "Chart opponents and review defensive tendencies"],
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

  if (typeof openPlaybookBalanceReport === "function") {
    items.push({
      kind: "Action",
      title: "Playbook Balance",
      subtitle: "Review personnel, formation, concept, and play-type balance",
      keywords: "playbook intelligence balance personnel formation concept base play type tendency",
      priority: 34.5,
      run: () => {
        showTab("playbook");
        requestAnimationFrame(() => openPlaybookBalanceReport());
      },
    });
  }

  if (typeof openPlaybookSituationCoverage === "function") {
    items.push({
      kind: "Action",
      title: "Playbook Situation Coverage",
      subtitle: "Review down, distance, field zone, and tempo coverage",
      keywords: "playbook intelligence situation coverage down distance field zone tempo tendency",
      priority: 34.6,
      run: () => {
        showTab("playbook");
        requestAnimationFrame(() => openPlaybookSituationCoverage());
      },
    });
  }

  if (typeof openPlaybookTouchReport === "function") {
    items.push({
      kind: "Action",
      title: "Playbook Player Touches",
      subtitle: "Review weighted player touch and opportunity distribution",
      keywords: "playbook intelligence player touch touches opportunity opportunities key player kp1 kp2 kp3 distribution",
      priority: 34.7,
      run: () => {
        showTab("playbook");
        requestAnimationFrame(() => openPlaybookTouchReport());
      },
    });
  }

  if (typeof openPlaybookConstraintMap === "function") {
    items.push({
      kind: "Action",
      title: "Playbook Complements",
      subtitle: "Review concept constraint and complement coverage",
      keywords: "playbook intelligence constraints complements constraint complement map concept answers base play",
      priority: 34.8,
      run: () => {
        showTab("playbook");
        requestAnimationFrame(() => openPlaybookConstraintMap());
      },
    });
  }

  if (typeof openPlaybookIdentityAlignment === "function") {
    items.push({
      kind: "Action",
      title: "Playbook Identity Alignment",
      subtitle: "Score the playbook view against the offensive identity",
      keywords: "playbook intelligence identity alignment score vision pictures wide zone pullers downhill anti front staples constraints install",
      priority: 34.9,
      run: () => {
        showTab("playbook");
        requestAnimationFrame(() => openPlaybookIdentityAlignment());
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

  if (typeof openWristbandTemplatesMenu === "function") {
    items.push({
      kind: "Action",
      title: "Wristband Templates",
      subtitle: "Load or delete reusable position and group card templates",
      keywords: "wristband template templates position group card cards structure plays",
      priority: 36.5,
      run: () => {
        showTab("wristband");
        requestAnimationFrame(() => openWristbandTemplatesMenu());
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

  if (typeof openScriptTemplatesMenu === "function") {
    items.push({
      kind: "Action",
      title: "Script Day Templates",
      subtitle: "Load reusable full-script period and play templates",
      keywords: "script practice day week template templates period structure plays install",
      priority: 39,
      run: () => {
        showTab("script");
        requestAnimationFrame(() => openScriptTemplatesMenu());
      },
    });
  }

  if (typeof openTemplatesModal === "function") {
    items.push({
      kind: "Action",
      title: "Call Sheet Templates",
      subtitle: "Save or load full sheets and reusable call sheet structures",
      keywords: "call sheet callsheet template templates structure layout saved buckets categories",
      priority: 40,
      run: () => {
        showTab("callsheet");
        requestAnimationFrame(() => openTemplatesModal("manage"));
      },
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

  if (typeof resetCurrentGamePlan === "function") {
    items.push({
      kind: "Action",
      title: "Reset Current Game Plan",
      subtitle: "Clear Playbook selections and start the active opponent board from scratch",
      keywords: "game plan reset clear current opponent playbook selections tags board scratch",
      priority: 38.5,
      run: () => resetCurrentGamePlan(),
    });
  }

  if (typeof openInstallationTemplatesMenu === "function") {
    items.push({
      kind: "Action",
      title: "Installation Templates",
      subtitle: "Apply, replace, or delete reusable installation progress templates",
      keywords: "installation install template templates teaching progress week merge replace",
      priority: 41,
      run: () => {
        showTab("installation");
        requestAnimationFrame(() => openInstallationTemplatesMenu());
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
        subtitle: `Routes to ${typeof _gpBoxLabel === "function"
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
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "command-palette",
      exclusive: false,
      trapFocus: false,
      returnFocus: false,
    });
  }
}

function closeCommandPalette(options = {}) {
  const overlay = document.getElementById("commandPaletteOverlay");
  const input = document.getElementById("commandPaletteInput");
  if (!overlay || overlay.hidden) return;

  overlay.classList.remove("visible");
  if (typeof closeLayer === "function") {
    closeLayer("command-palette", { returnFocus: false });
  }
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
