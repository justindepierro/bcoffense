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
// Visual viewport scroll fires constantly while mobile browser chrome animates;
// don't rewrite layout-critical vars on every one of those events.
let _mobileShellFrame = 0;
let _mobileShellScrollTimer = 0;
let _mobileShellLastStateKey = "";

function setMobileShellCssVar(root, name, value) {
  if (root.style.getPropertyValue(name) === value) return;
  root.style.setProperty(name, value);
}

function removeMobileShellCssVar(root, name) {
  if (!root.style.getPropertyValue(name)) return;
  root.style.removeProperty(name);
}

function syncMobileShellState() {
  _mobileShellFrame = 0;
  const viewport = window.visualViewport;
  const width =
    Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 0);
  const height =
    Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0);
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;

  const isTouch =
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const isMobile =
    width <= 768 ||
    (isTouch && shortSide <= 820 && longSide <= 1180);
  const isPhone = shortSide <= 560;
  const isCompact = shortSide <= 420;
  const isShort = height <= 620;
  const isLandscape = width > height;
  const authRole = body.dataset.authRole || "";
  const activeTab =
    body.dataset.activeTab ||
    (typeof currentActiveTab !== "undefined" ? currentActiveTab : "");
  const stateKey = [
    width,
    height,
    isTouch ? "touch" : "pointer",
    authRole,
    activeTab,
    isMobile ? "mobile" : "desktop",
    isLandscape ? "landscape" : "portrait",
  ].join(":");
  if (stateKey === _mobileShellLastStateKey) return;
  _mobileShellLastStateKey = stateKey;

  setMobileShellCssVar(root, "--app-vh", `${Math.max(height * 0.01, 1)}px`);
  setMobileShellCssVar(root, "--app-vw", `${Math.max(width * 0.01, 1)}px`);

  const header = document.querySelector(".app-header");
  const tabs = document.querySelector(".tabs");
  if (header) {
    setMobileShellCssVar(
      root,
      "--app-header-height",
      `${Math.ceil(header.getBoundingClientRect().height)}px`,
    );
  }
  if (tabs) {
    setMobileShellCssVar(
      root,
      "--app-tabs-height",
      `${Math.ceil(tabs.getBoundingClientRect().height)}px`,
    );
  }

  [root, body].forEach((el) => {
    el.classList.toggle("is-mobile-screen", isMobile);
    el.classList.toggle("is-phone-screen", isPhone);
    el.classList.toggle("is-compact-screen", isCompact);
    el.classList.toggle("is-short-screen", isShort);
    el.classList.toggle("is-landscape-screen", isLandscape);
    el.classList.toggle("is-portrait-screen", !isLandscape);
    el.classList.toggle("is-touch-screen", Boolean(isTouch));
  });
  body.classList.toggle("is-player-mobile-shell", isMobile && authRole === "player");
  body.classList.toggle(
    "is-staff-mobile-shell",
    isMobile && Boolean(authRole) && authRole !== "player" && authRole !== "locked",
  );
  const coachDock = document.getElementById("mobileCoachDock");
  const coachDockHeight = coachDock
    ? Math.ceil(coachDock.getBoundingClientRect().height)
    : 0;
  if (coachDockHeight > 0) {
    setMobileShellCssVar(root, "--coach-dock-height", `${coachDockHeight + 12}px`);
  } else {
    removeMobileShellCssVar(root, "--coach-dock-height");
  }
  body.dataset.screenSize = isPhone ? "phone" : isMobile ? "mobile" : "desktop";
  body.dataset.screenOrientation = isLandscape ? "landscape" : "portrait";
  if (typeof updateMobileCoachDock === "function") updateMobileCoachDock();
  if (typeof applyMobileCoachLockUi === "function") applyMobileCoachLockUi();
}

function queueMobileShellStateSync() {
  if (_mobileShellFrame) return;
  _mobileShellFrame = requestAnimationFrame(syncMobileShellState);
}

function queueMobileShellSettledSync() {
  window.clearTimeout(_mobileShellScrollTimer);
  _mobileShellScrollTimer = window.setTimeout(queueMobileShellStateSync, 240);
}

queueMobileShellStateSync();
document.addEventListener("DOMContentLoaded", queueMobileShellStateSync);
window.addEventListener("load", queueMobileShellStateSync);
window.addEventListener("resize", queueMobileShellStateSync, { passive: true });
window.visualViewport?.addEventListener("resize", queueMobileShellStateSync, {
  passive: true,
});
window.visualViewport?.addEventListener("scroll", queueMobileShellSettledSync, {
  passive: true,
});
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

// (command palette lives in app-command.js)

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

  // Close any open script readiness panels on Escape
  if (e.key === "Escape" && !mod && !e.altKey) {
    const openPanel = document.querySelector(".script-item--readiness-open");
    if (openPanel) {
      document.querySelectorAll(".script-item--readiness-open").forEach((el) =>
        el.classList.remove("script-item--readiness-open")
      );
      e.preventDefault();
      return;
    }
    // Close the playbook readiness panel on Escape
    const pbPanel = document.getElementById("playbookReadinessPanel");
    if (pbPanel && !pbPanel.hidden) {
      if (typeof closePlaybookReadinessPanel === "function") closePlaybookReadinessPanel();
      e.preventDefault();
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
  "openScriptPresentation",
  "openPlaybookPresentation",
  "openSelectedPlaybookPresentation",
  "openPlayerCurrentScriptPresentation",
  "loadPublishedPlayerScript",
  "presentPublishedPlayerScript",
  "setPlayPresentationMode",
  "setPlayPresentationPosition",
  "togglePlayPresentationPositionLock",
  "movePlayPresentation",
  "quickPlayReadinessScriptScore",
  "quickPlayReadinessPlaybookScore",
  "quickPlayReadinessPresentationScore",
  "openPlayReadinessRepModal",
  "openPlayReadinessActionModal",
  "openPlayReadinessPlaybookRepModal",
  "openPlayReadinessPlaybookActionModal",
  "openPlayReadinessPresentationActionModal",
  "showPlayReadinessHistory",
  "showPlayReadinessPlaybookHistory",
  "showPlayReadinessPresentationHistory",
  "updatePlayReadinessReportScore",
  "deletePlayReadinessReport",
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

function isMobileCoachLockRole() {
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  const role = currentUser?.role || document.body?.dataset.authRole || "";
  return role === "admin" || role === "coach";
}

function isMobileCoachLockActive() {
  const body = document.body;
  return Boolean(
    body &&
    body.classList.contains("is-mobile-screen") &&
    body.classList.contains("mobile-coach-locked") &&
    isMobileCoachLockRole(),
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
  const canUseCoachLock = isMobileCoachLockRole();
  const activeOnMobile =
    canUseCoachLock && locked && body.classList.contains("is-mobile-screen");
  body.classList.toggle("mobile-coach-locked", activeOnMobile);
  body.dataset.mobileCoachLocked = activeOnMobile ? "true" : "false";

  const toggle = document.getElementById("mobileCoachLockToggle");
  const icon = document.getElementById("coachDockLockIcon");
  const label = document.getElementById("coachDockLockLabel");
  if (toggle) {
    toggle.hidden = !canUseCoachLock;
    toggle.setAttribute("aria-pressed", activeOnMobile ? "true" : "false");
    toggle.title = activeOnMobile ? "Unlock mobile coach mode" : "Lock mobile coach mode";
    toggle.setAttribute(
      "aria-label",
      activeOnMobile ? "Unlock mobile coach mode" : "Lock mobile coach mode",
    );
  }
  if (icon) icon.textContent = activeOnMobile ? "🔒" : "🔓";
  if (label) label.textContent = activeOnMobile ? "Locked" : "Lock";

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

// ── Floating Quick Tools tray ──
function setQuickToolsOpen(isOpen) {
  const tray = document.getElementById("quickTools");
  const menu = document.getElementById("quickToolsMenu");
  const trigger = document.getElementById("quickToolsFab");
  if (!tray) return;
  tray.classList.toggle("open", Boolean(isOpen));
  menu?.setAttribute("aria-hidden", isOpen ? "false" : "true");
  menu?.toggleAttribute("inert", !isOpen);
  trigger?.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function toggleQuickToolsMenu() {
  const tray = document.getElementById("quickTools");
  setQuickToolsOpen(!tray?.classList.contains("open"));
}

function closeQuickToolsMenu() {
  setQuickToolsOpen(false);
}

function quickToolHelp() {
  closeQuickToolsMenu();
  if (typeof toggleHelpPanel === "function") toggleHelpPanel();
}

function quickToolPrint() {
  closeQuickToolsMenu();
  if (typeof openPrintStudio === "function") openPrintStudio();
}

function quickToolScriptDisplay() {
  closeQuickToolsMenu();
  if (typeof toggleScriptDisplayPanel === "function") toggleScriptDisplayPanel();
}

function quickToolScrollTop() {
  closeQuickToolsMenu();
  scrollToTop();
}

document.addEventListener("click", (e) => {
  if (e.target.closest?.("#quickTools")) return;
  closeQuickToolsMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeQuickToolsMenu();
});

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
      if (document.body?.classList.contains("is-mobile-screen")) {
        queueMobileShellSettledSync();
      } else {
        queueMobileShellStateSync();
      }
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
