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
  body.dataset.screenSize = isPhone ? "phone" : isMobile ? "mobile" : "desktop";
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

  if (typeof showUpload === "function" && (typeof canManageSettings !== "function" || canManageSettings())) {
    items.push({
      kind: "Action",
      title: "Import, Export, and Settings",
      subtitle: "Open CSV upload, backup, restore, and team settings",
      keywords: "upload import export backup restore settings csv roster team",
      priority: 32,
      run: () => showUpload(),
    });
  }

  if (typeof openCloudSyncModal === "function") {
    items.push({
      kind: "Action",
      title: "Cloud Sync",
      subtitle: "Open backup push/pull sync controls",
      keywords: "cloud sync backup pull push",
      priority: 33,
      run: () => openCloudSyncModal(),
    });
  }

  if (typeof openWbQuickSearch === "function") {
    items.push({
      kind: "Action",
      title: "Wristband Quick Search",
      subtitle: "Open the wristband play finder",
      keywords: "wristband quick search find play",
      priority: 34,
      run: () => {
        showTab("wristband");
        requestAnimationFrame(() => openWbQuickSearch());
      },
    });
  }

  if (typeof openGamePlanPrintModal === "function") {
    items.push({
      kind: "Action",
      title: "Print Game Plan",
      subtitle: "Open the game plan print controls",
      keywords: "game plan print export",
      priority: 35,
      run: () => {
        showTab("gameplan");
        requestAnimationFrame(() => openGamePlanPrintModal());
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

function _buildCommandPlayItems(query, tokens) {
  if (!Array.isArray(plays) || !plays.length || query.length < 2) return [];

  const matches = [];
  for (const play of plays) {
    const title = _getCommandPlayTitle(play);
    const subtitle = _getCommandPlaySubtitle(play);
    const haystack = _normalizeCommandText(`${title} ${subtitle} ${_getCommandPlaySearchText(play)}`);
    if (!tokens.every((token) => haystack.includes(token))) continue;

    let score = 70;
    const normalizedTitle = _normalizeCommandText(title);
    tokens.forEach((token) => {
      if (normalizedTitle === token) score -= 35;
      else if (normalizedTitle.startsWith(token)) score -= 20;
      else if (normalizedTitle.includes(token)) score -= 10;
    });
    matches.push({
      kind: "Play",
      title,
      subtitle: subtitle || "Imported playbook play",
      keywords: haystack,
      priority: score,
      run: () => _openCommandPlay(play),
    });
    if (matches.length >= 80) break;
  }

  return matches.sort((a, b) => a.priority - b.priority).slice(0, COMMAND_PALETTE_LIMIT);
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
