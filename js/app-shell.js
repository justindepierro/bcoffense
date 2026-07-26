// App shell runtime helpers: theme, chrome, global shortcuts, and page-level listeners.

// ── Global error surfacing (Hardening #28) ──
// The app is global-scope with fragile load order, so a single uncaught error
// or unhandled promise rejection can silently kill a feature. This normalizes
// those into a clear console log + a rolling buffer (window.__bcErrors) for
// debugging, and shows a dev toast ONLY when a trace flag is enabled so end
// users never see noise. Purely additive — cannot change existing behavior.
(function installGlobalErrorSurfacing() {
  if (typeof window === "undefined" || window.__bcErrorHandlerInstalled) return;
  window.__bcErrorHandlerInstalled = true;
  window.__bcErrors = window.__bcErrors || [];

  function bcErrorTraceEnabled() {
    try {
      return (
        window.BC_ACTION_TRACE === true ||
        window.BC_ERROR_TRACE === true ||
        localStorage.getItem("bcActionTrace") === "1" ||
        localStorage.getItem("bcErrorTrace") === "1"
      );
    } catch (_e) {
      return window.BC_ACTION_TRACE === true || window.BC_ERROR_TRACE === true;
    }
  }

  function record(kind, message, detail) {
    const entry = { kind, message, detail, at: new Date().toISOString() };
    window.__bcErrors.push(entry);
    if (window.__bcErrors.length > 50) window.__bcErrors.shift();
    console.error(`[BC ${kind}]`, message, detail || "");
    if (bcErrorTraceEnabled() && typeof showToast === "function") {
      showToast(`⚠️ ${kind}: ${String(message).slice(0, 120)}`, {
        type: "error",
        duration: 6000,
      });
    }
  }

  window.addEventListener("error", (event) => {
    // Ignore benign resource-load errors (img/script 404s) — those are not JS bugs.
    if (event && event.target && event.target !== window && event.target.tagName) return;
    record("uncaught error", event?.message || "Unknown error", {
      source: event?.filename,
      line: event?.lineno,
      col: event?.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    record(
      "unhandled promise rejection",
      (reason && (reason.message || reason)) || "Unknown rejection",
      reason && reason.stack ? { stack: String(reason.stack).slice(0, 400) } : null,
    );
  });

  window.bcErrors = function bcErrors() {
    console.table(window.__bcErrors);
    return window.__bcErrors;
  };
})();

// ── Global integrity check (Hardening #2/#4/#9/#10) ──
// The codebase has ~1000 `typeof fn === "function"` guards because global load
// order is fragile. Their danger: when a function is genuinely missing (typo,
// wrong load order, deleted export) the guard silently no-ops — a loud bug
// becomes a dead feature. Rather than rewrite 1000 call sites (high risk), this
// verifies a manifest of critical globals exists after load and screams LOUDLY
// for any that are missing. Converts the silent-no-op failure mode into a
// visible one. Purely additive — only probes global identifiers.
const BC_CRITICAL_GLOBALS = [
  // Foundation utils (utils.js — always script #1)
  "escapeHtml", "sanitizeHTML", "setInnerHTML", "showToast", "showModal",
  "showConfirm", "showPrompt", "showListPicker", "debounce", "safeDeepClone",
  "parseCSV", "getFullCall", "playsMatch", "trapFocus", "showContextMenu",
  // Storage + history
  "storageManager", "STORAGE_KEYS", "historyManager",
  // Navigation / shell
  "showTab", "getGameWeek",
  // Core module renderers (absence = a whole tab is dead)
  "renderPlaybook", "renderScript", "renderCallSheet", "renderWristbandGrid",
  "renderGamePlan", "initTendencies", "initGamePlan", "initCallSheet",
  // Cross-module integration seams (the ones most guarded elsewhere)
  "_gpPlaySignature", "getCategoryDisplayName", "getCurrentAuthUser",
];

// Probe a global by NAME. Critical: `const`/`let`/`class` globals do NOT become
// properties of `window` (only `var` and `function` declarations do), so
// `window[name]` gives false negatives for e.g. `const storageManager`. Running
// `typeof <name>` inside a `new Function` evaluates in global scope and sees all
// declaration kinds. The names are a hardcoded manifest (never user input), so
// this is injection-safe.
function bcGlobalExists(name) {
  try {
    return new Function(
      `return typeof ${name} !== "undefined" && ${name} !== null;`,
    )();
  } catch (_e) {
    // A Content-Security-Policy without 'unsafe-eval' can block Function().
    // Degrade gracefully to the window probe — accurate for var/function
    // globals, though it may false-negative for const/let (which aren't on
    // window). Better than crashing the integrity check.
    return typeof window !== "undefined" && window[name] != null;
  }
}

function bcIntegrityCheck(opts = {}) {
  const missing = BC_CRITICAL_GLOBALS.filter((name) => !bcGlobalExists(name));
  if (missing.length > 0) {
    console.error(
      `[BC integrity] ${missing.length} critical global(s) MISSING after load — features depending on them will silently fail:`,
      missing,
    );
    if (Array.isArray(window.__bcErrors)) {
      window.__bcErrors.push({
        kind: "integrity",
        message: `${missing.length} critical globals missing`,
        detail: missing,
        at: new Date().toISOString(),
      });
    }
  } else if (opts.verbose) {
    console.info(`[BC integrity] all ${BC_CRITICAL_GLOBALS.length} critical globals present.`);
  }
  return { ok: missing.length === 0, missing };
}
if (typeof window !== "undefined") {
  window.bcIntegrityCheck = bcIntegrityCheck;
  // Auto-run once after everything settles (app.js is the last script). A short
  // delay lets deferred init and DOMContentLoaded handlers register their globals.
  window.addEventListener("load", () => {
    setTimeout(() => bcIntegrityCheck(), 800);
  });
}

// ── One-shot self-check (Hardening #31) ──
// Aggregates the app's diagnostics into a single console command so a coach or
// dev can sanity-check the running app without knowing each subsystem's helper.
if (typeof window !== "undefined") {
  window.bcSelfCheck = function bcSelfCheck() {
    const result = { at: new Date().toISOString() };
    result.integrity = typeof bcIntegrityCheck === "function"
      ? bcIntegrityCheck({ verbose: true })
      : { ok: false, missing: ["bcIntegrityCheck"] };
    result.recentErrors = Array.isArray(window.__bcErrors) ? window.__bcErrors.slice(-10) : [];
    result.wristband = typeof window.bcAuditWristband === "function"
      ? window.bcAuditWristband()
      : null;
    result.ok = result.integrity.ok && result.recentErrors.length === 0;
    console.info(
      `[BC self-check] ${result.ok ? "✅ healthy" : "⚠️ issues found"}`,
      result,
    );
    return result;
  };
}

// ── Startup loading cover ──
let startupLoadingHeld = false;

function setStartupLoadingHold(held = true) {
  startupLoadingHeld = Boolean(held);
  const loader = document.getElementById("startupLoader");
  if (loader) loader.setAttribute("aria-busy", startupLoadingHeld ? "true" : "false");
}

function isStartupLoadingHeld() {
  return startupLoadingHeld;
}

function setStartupLoadingMessage(message) {
  const el = document.getElementById("startupLoaderStatus");
  if (el && message) el.textContent = message;
}

function setStartupLoadingDetail(message) {
  const el = document.getElementById("startupLoaderDetail");
  if (el && message) el.textContent = message;
}

function finishStartupLoading(opts = {}) {
  if (window.__startupLoaderFinished) return;
  window.__startupLoaderFinished = true;
  setStartupLoadingHold(false);

  const loader = document.getElementById("startupLoader");
  const reveal = () => {
    document.body.classList.remove("app-booting");
    document.body.classList.add("app-ready");
    if (!loader) return;
    if (opts.error) {
      setStartupLoadingMessage("Startup hit an error. Showing the app anyway.");
    }
    if (window.appStartup && typeof window.appStartup.markFirstPaintReleased === "function") {
      window.appStartup.markFirstPaintReleased({ error: Boolean(opts.error) });
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
    if (document.body.classList.contains("app-booting") && !isStartupLoadingHeld()) {
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
let _mobileShellResizeObserver = null;
let _mobileOverflowTraceTimer = 0;
let _desktopShellScrollRepairFrame = 0;
const APP_DISPLAY_MODE_MEDIA_QUERIES = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)",
  "(display-mode: window-controls-overlay)",
];

const MOBILE_OVERFLOW_APPROVED_SELECTORS = [
  ".table-wrapper",
  ".table-scroll",
  ".playbook-table-wrap",
  ".playbook-table-container",
  ".callsheet-table-wrapper",
  ".wristband-grid",
  ".wristband-grid-wrapper",
  ".tabs",
  ".tab-scroll",
  ".script-play-rail",
  ".available-plays-container",
];

function setMobileShellCssVar(root, name, value) {
  if (root.style.getPropertyValue(name) === value) return;
  root.style.setProperty(name, value);
}

function removeMobileShellCssVar(root, name) {
  if (!root.style.getPropertyValue(name)) return;
  root.style.removeProperty(name);
}

function isDesktopShellPanelScrollOwner() {
  const body = document.body;
  if (!body) return false;
  return (
    body.classList.contains("app-ready") &&
    !body.classList.contains("is-mobile-screen") &&
    !body.classList.contains("app-layer-locked") &&
    body.dataset.scrollOwner === "panel"
  );
}

function getDocumentScrollPosition() {
  const doc = document.documentElement;
  const body = document.body;
  return {
    x: Math.round(window.scrollX || doc?.scrollLeft || body?.scrollLeft || 0),
    y: Math.round(window.scrollY || doc?.scrollTop || body?.scrollTop || 0),
    docTop: Math.round(doc?.scrollTop || 0),
    bodyTop: Math.round(body?.scrollTop || 0),
  };
}

function getShellElementSnapshot(selector) {
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    selector,
    display: style.display,
    position: style.position,
    overflowY: style.overflowY,
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    height: Math.round(rect.height),
    scrollTop: element.scrollTop || 0,
    scrollHeight: element.scrollHeight || 0,
    clientHeight: element.clientHeight || 0,
  };
}

function getDesktopShellScrollSnapshot(extra = {}) {
  const activePanel = document.querySelector("#mainApp .panel.active");
  return {
    timestamp: new Date().toISOString(),
    activeTab: document.body?.dataset.activeTab || "",
    scrollOwner: document.body?.dataset.scrollOwner || "",
    documentScroll: getDocumentScrollPosition(),
    header: getShellElementSnapshot(".app-header"),
    tabs: getShellElementSnapshot("#mainApp .tabs"),
    gameWeekBar: getShellElementSnapshot("#gameWeekBar"),
    mainApp: getShellElementSnapshot("#mainApp"),
    activePanel: activePanel ? getShellElementSnapshot(`#${activePanel.id}`) : null,
    gamePlanBoardScroll: getShellElementSnapshot("#gameplan .gp-board-scroll"),
    ...extra,
  };
}

function isDesktopShellScrollTraceEnabled() {
  try {
    return (
      window.BC_SHELL_SCROLL_TRACE === true ||
      window.BC_ACTION_TRACE === true ||
      localStorage.getItem("bcShellScrollTrace") === "1" ||
      localStorage.getItem("bcActionTrace") === "1"
    );
  } catch (_err) {
    return window.BC_SHELL_SCROLL_TRACE === true || window.BC_ACTION_TRACE === true;
  }
}

function traceDesktopShellScrollRepair(reason, snapshot) {
  if (isDesktopShellScrollTraceEnabled()) {
    console.warn("[BC shell scroll repair]", reason, snapshot);
  }
  if (typeof traceAppAction === "function") {
    traceAppAction("desktop shell scroll repair", {
      phaseAction: "repairDesktopDocumentScroll",
      reason,
      ...snapshot,
    }, {}, "warn");
  }
}

function repairDesktopDocumentScroll(reason = "scroll") {
  if (!isDesktopShellPanelScrollOwner()) return false;
  const before = getDocumentScrollPosition();
  // Also check #mainApp — scrollIntoView on elements inside overflow:hidden
  // containers can set mainApp.scrollTop which hides the tab bar.
  const mainApp = document.getElementById("mainApp");
  const mainAppScrolled = mainApp && (mainApp.scrollTop !== 0 || mainApp.scrollLeft !== 0);
  if (before.x === 0 && before.y === 0 && before.docTop === 0 && before.bodyTop === 0 && !mainAppScrolled) {
    return false;
  }
  if (mainAppScrolled) {
    mainApp.scrollTop = 0;
    mainApp.scrollLeft = 0;
  }
  const snapshot = getDesktopShellScrollSnapshot({ reason, before });
  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
  }
  if (document.body) {
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
  }
  window.scrollTo(0, 0);
  snapshot.after = getDocumentScrollPosition();
  traceDesktopShellScrollRepair(reason, snapshot);
  return true;
}

function queueDesktopDocumentScrollRepair(reason = "scroll") {
  if (_desktopShellScrollRepairFrame) return;
  _desktopShellScrollRepairFrame = requestAnimationFrame(() => {
    _desktopShellScrollRepairFrame = 0;
    repairDesktopDocumentScroll(reason);
  });
}

// ── Safe in-panel scrolling (Hardening #21/#23) ──
// scrollIntoView walks EVERY scrollable ancestor including #mainApp (overflow:
// hidden but scriptable), which pushes the desktop tab bar off-screen. This
// helper scrolls the nearest genuine inner scroll container instead, and never
// touches the shell. On mobile (document is the scroll owner) it falls back to
// native scrollIntoView, which is safe there. If no inner container is found on
// desktop it no-ops — a row that fails to auto-scroll is a far better failure
// than a vanished tab bar.
function scrollElementWithinPanel(el, opts = {}) {
  if (!el || typeof el.getBoundingClientRect !== "function") return;
  const behavior = opts.behavior || "smooth";
  const block = opts.block || "nearest";

  const isDesktopPanel =
    typeof isDesktopShellPanelScrollOwner === "function" &&
    isDesktopShellPanelScrollOwner();
  if (!isDesktopPanel) {
    try {
      el.scrollIntoView({ behavior, block });
    } catch (_e) {
      /* benign: some detached nodes throw on scrollIntoView */
    }
    return;
  }

  let container = el.parentElement;
  while (container && container !== document.body) {
    if (container.id === "mainApp") break; // never scroll the shell
    const style = getComputedStyle(container);
    const oy = style.overflowY;
    if (
      (oy === "auto" || oy === "scroll") &&
      container.scrollHeight > container.clientHeight + 4
    ) {
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      let target;
      if (block === "center") {
        target =
          container.scrollTop +
          (eRect.top - cRect.top) -
          container.clientHeight / 2 +
          eRect.height / 2;
      } else if (block === "start") {
        target = container.scrollTop + (eRect.top - cRect.top) - 8;
      } else {
        const above = eRect.top < cRect.top;
        const below = eRect.bottom > cRect.bottom;
        if (!above && !below) return; // already fully visible
        target = above
          ? container.scrollTop + (eRect.top - cRect.top) - 8
          : container.scrollTop + (eRect.bottom - cRect.bottom) + 8;
      }
      container.scrollTo({ top: Math.max(0, target), behavior });
      return;
    }
    container = container.parentElement;
  }
  // No inner scroll container found on desktop — intentionally do nothing.
}

if (typeof window !== "undefined") {
  window.bcDebugShellScroll = function bcDebugShellScroll() {
    const snapshot = getDesktopShellScrollSnapshot({ manual: true });
    console.info("[BC shell scroll]", snapshot);
    return snapshot;
  };
  window.bcRepairShellScroll = function bcRepairShellScroll() {
    return repairDesktopDocumentScroll("manual");
  };
  window.bcEnableShellScrollTrace = function bcEnableShellScrollTrace() {
    try {
      localStorage.setItem("bcShellScrollTrace", "1");
    } catch (_err) {
      window.BC_SHELL_SCROLL_TRACE = true;
    }
    window.BC_SHELL_SCROLL_TRACE = true;
    return window.bcDebugShellScroll();
  };
}

function isMobileOverflowTraceEnabled() {
  try {
    return window.BC_MOBILE_OVERFLOW_TRACE === true ||
      localStorage.getItem("bcMobileOverflowTrace") === "1";
  } catch (_err) {
    return window.BC_MOBILE_OVERFLOW_TRACE === true;
  }
}

function describeMobileOverflowElement(el) {
  if (!el) return "";
  if (el.id) return `#${el.id}`;
  const classes = Array.from(el.classList || []).slice(0, 3).join(".");
  const action = el.getAttribute?.("data-action");
  return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${action ? `[${action}]` : ""}`;
}

function collectMobileOverflowDiagnostics(opts = {}) {
  const viewport = window.visualViewport;
  const viewportWidth = Math.round(viewport?.width || window.innerWidth || 0);
  const viewportHeight = Math.round(viewport?.height || window.innerHeight || 0);
  const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : 1;
  const approvedSelectors = opts.approvedSelectors || MOBILE_OVERFLOW_APPROVED_SELECTORS;
  const results = [];
  if (!viewportWidth || !viewportHeight || !document.body) return results;

  document.querySelectorAll("body *").forEach((el) => {
    if (approvedSelectors.some((selector) => el.closest(selector))) return;
    const style = getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (rect.bottom <= 0 || rect.top >= viewportHeight) return;
    const leftOverflow = Math.max(0, -rect.left);
    const rightOverflow = Math.max(0, rect.right - viewportWidth);
    if (leftOverflow <= tolerance && rightOverflow <= tolerance) return;
    results.push({
      selector: describeMobileOverflowElement(el),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      leftOverflow: Math.round(leftOverflow),
      rightOverflow: Math.round(rightOverflow),
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
    });
  });
  return results;
}

function bcDebugMobileOverflow(opts = {}) {
  const results = collectMobileOverflowDiagnostics(opts);
  if (typeof console.table === "function") console.table(results);
  else console.log(results);
  return results;
}

function queueMobileOverflowTrace() {
  if (!isMobileOverflowTraceEnabled()) return;
  window.clearTimeout(_mobileOverflowTraceTimer);
  _mobileOverflowTraceTimer = window.setTimeout(() => {
    const results = collectMobileOverflowDiagnostics();
    if (results.length) {
      console.warn("[BC mobile overflow]", results);
    }
  }, 180);
}

window.bcDebugMobileOverflow = bcDebugMobileOverflow;

function getAppDisplayMode() {
  if (document.fullscreenElement) return "fullscreen";
  if (window.matchMedia?.("(display-mode: fullscreen)")?.matches) {
    return "fullscreen";
  }
  if (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    navigator.standalone === true
  ) {
    return "standalone";
  }
  if (window.matchMedia?.("(display-mode: minimal-ui)")?.matches) {
    return "minimal-ui";
  }
  if (window.matchMedia?.("(display-mode: window-controls-overlay)")?.matches) {
    return "window-controls-overlay";
  }
  return "browser";
}

function isLikelyIPadOSDevice() {
  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  return (
    /\biPad\b/.test(ua) ||
    (platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1)
  );
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
  const isIPadOS = isLikelyIPadOSDevice();
  const isTouchTablet =
    (isTouch || isIPadOS) && shortSide <= 1024 && longSide <= 1366;
  const isMobile =
    width <= 768 ||
    isTouchTablet;
  const isPhone = shortSide <= 560;
  const isCompact = shortSide <= 420;
  const isShort = height <= 620;
  const isLandscape = width > height;
  const shellPhone = isPhone;
  const shellCompact = isMobile && (shellPhone || (!isTouchTablet && width <= 768));
  const shellTablet = isMobile && !shellPhone && (width <= 1024 || isTouchTablet);
  const shellSize = shellPhone
    ? "phone"
    : shellCompact
      ? "compact"
      : shellTablet
        ? "tablet"
        : "desktop";
  const authRole = body.dataset.authRole || "";
  const isStudyPortal =
    authRole === "player" || body.dataset.authStudyPortal === "true";
  const displayMode = getAppDisplayMode();
  const fullscreenApiActive = Boolean(document.fullscreenElement);
  const isStandaloneDisplay =
    displayMode === "standalone" ||
    displayMode === "fullscreen" ||
    displayMode === "window-controls-overlay";
  const presentationActive = body.classList.contains("play-presentation-open");
  const appDevice = shellPhone ? "phone" : shellTablet ? "tablet" : "desktop";
  const activeTab =
    body.dataset.activeTab ||
    (typeof currentActiveTab !== "undefined" ? currentActiveTab : "");
  const previousShellSize = body.dataset.shellSize || "";
  const header = document.querySelector(".app-header");
  const tabs = document.querySelector(".tabs");
  const coachDock = document.getElementById("mobileCoachDock");
  const headerHeight = header
    ? Math.ceil(header.getBoundingClientRect().height)
    : 0;
  const tabsHeight = tabs
    ? Math.ceil(tabs.getBoundingClientRect().height)
    : 0;
  const coachDockHeight = coachDock
    ? Math.ceil(coachDock.getBoundingClientRect().height)
    : 0;
  const stateKey = [
    width,
    height,
    headerHeight,
    tabsHeight,
    coachDockHeight,
    isTouch ? "touch" : "pointer",
    authRole,
    isStudyPortal ? "study" : "workspace",
    activeTab,
    isMobile ? "mobile" : "desktop",
    shellSize,
    appDevice,
    isShort ? "short" : "tall",
    isLandscape ? "landscape" : "portrait",
    displayMode,
    fullscreenApiActive ? "fullscreen-api" : "windowed",
    isStandaloneDisplay ? "standalone" : "browser",
    isIPadOS ? "ipados" : "not-ipados",
    presentationActive ? "presentation" : "app",
  ].join(":");
  if (stateKey === _mobileShellLastStateKey) return;
  _mobileShellLastStateKey = stateKey;

  setMobileShellCssVar(root, "--app-vh", `${Math.max(height * 0.01, 1)}px`);
  setMobileShellCssVar(root, "--app-vw", `${Math.max(width * 0.01, 1)}px`);

  const playerBottomNavActive = isStudyPortal && isMobile;
  if (header) setMobileShellCssVar(root, "--app-header-height", `${headerHeight}px`);
  if (tabs) {
    setMobileShellCssVar(root, "--app-tabs-height", `${playerBottomNavActive ? 0 : tabsHeight}px`);
    setMobileShellCssVar(
      root,
      "--player-bottom-nav-height",
      `${playerBottomNavActive ? tabsHeight : 0}px`
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
    el.classList.toggle("shell-phone", shellPhone);
    el.classList.toggle("shell-compact", shellCompact);
    el.classList.toggle("shell-tablet", shellTablet);
    el.classList.toggle("shell-desktop", shellSize === "desktop");
    el.classList.toggle("shell-short", isShort);
    el.classList.toggle("shell-landscape", isLandscape);
    el.classList.toggle("shell-portrait", !isLandscape);
    el.classList.toggle("shell-touch", Boolean(isTouch));
    el.classList.toggle("shell-ipados", isIPadOS);
    el.classList.toggle("display-mode-browser", displayMode === "browser");
    el.classList.toggle("display-mode-standalone", displayMode === "standalone");
    el.classList.toggle("display-mode-fullscreen", displayMode === "fullscreen");
    el.classList.toggle("display-mode-minimal-ui", displayMode === "minimal-ui");
    el.classList.toggle(
      "display-mode-window-controls-overlay",
      displayMode === "window-controls-overlay",
    );
    el.classList.toggle("display-mode-installed", isStandaloneDisplay);
    el.classList.toggle("app-presentation-active", presentationActive);
  });
  body.classList.toggle("is-player-mobile-shell", isMobile && isStudyPortal);
  body.classList.toggle(
    "is-staff-mobile-shell",
    isMobile && Boolean(authRole) && !isStudyPortal && authRole !== "locked",
  );
  if (coachDockHeight > 0) {
    setMobileShellCssVar(root, "--coach-dock-height", `${coachDockHeight + 12}px`);
  } else {
    removeMobileShellCssVar(root, "--coach-dock-height");
  }
  body.dataset.screenSize = isPhone ? "phone" : isMobile ? "mobile" : "desktop";
  body.dataset.screenOrientation = isLandscape ? "landscape" : "portrait";
  [root, body].forEach((el) => {
    el.dataset.device = appDevice;
    el.dataset.orientation = isLandscape ? "landscape" : "portrait";
    el.dataset.displayMode = displayMode;
    el.dataset.standaloneDisplay = isStandaloneDisplay ? "true" : "false";
    el.dataset.fullscreenApi = fullscreenApiActive ? "true" : "false";
    el.dataset.ipados = isIPadOS ? "true" : "false";
    el.dataset.presentation = presentationActive ? "true" : "false";
  });
  body.dataset.shellSize = shellSize;
  body.dataset.shellWidth = String(width);
  body.dataset.shellHeight = String(height);
  body.dataset.shellShort = isShort ? "true" : "false";
  body.dataset.shellOrientation = isLandscape ? "landscape" : "portrait";
  body.dataset.shellPointer = isTouch ? "coarse" : "fine";
  body.dataset.scrollOwner = body.classList.contains("app-layer-locked")
    ? "layer"
    : isMobile
      ? "document"
      : "panel";
  if (body.dataset.scrollOwner === "panel") {
    queueDesktopDocumentScrollRepair("shell sync");
  }
  const isStaffPhoneScript =
    shellPhone &&
    isMobile &&
    activeTab === "script" &&
    Boolean(authRole) &&
    !isStudyPortal &&
    authRole !== "locked";
  if (!isStaffPhoneScript) {
    body.classList.remove("mobile-script-editing");
  }
  body.dataset.mobileScriptMode = body.classList.contains("mobile-script-editing")
    ? "edit"
    : "run";
  if (typeof syncMobileScriptEditMode === "function") syncMobileScriptEditMode();
  if (
    activeTab === "callsheet" &&
    previousShellSize &&
    previousShellSize !== shellSize &&
    typeof scheduleRenderCallSheet === "function"
  ) {
    scheduleRenderCallSheet();
  }
  if (
    activeTab === "wristband" &&
    previousShellSize &&
    previousShellSize !== shellSize &&
    typeof renderWristbandGrid === "function"
  ) {
    renderWristbandGrid();
  }
  queueMobileOverflowTrace();
  if (typeof updateMobileCoachDock === "function") updateMobileCoachDock();
  if (typeof applyMobileCoachLockUi === "function") applyMobileCoachLockUi();
  if (typeof syncMobilePrimaryNav === "function") syncMobilePrimaryNav();
}

function syncMobilePrimaryNav() {
  const nav = document.getElementById("mobilePrimaryNav");
  if (!nav) return;
  const isPhone = document.body?.classList.contains("shell-phone");
  const isPresentation = document.body?.classList.contains("play-presentation-open");
  nav.hidden = !isPhone || isPresentation;
  if (nav.hidden) return;
  const activeTab = document.body?.dataset.activeTab || "";
  nav.querySelectorAll("[data-mobile-tab]").forEach((button) => {
    const tab = button.dataset.mobileTab;
    const allowed = typeof canAccessTab !== "function" || canAccessTab(tab);
    button.hidden = !allowed;
    button.classList.toggle("active", tab === activeTab);
    button.setAttribute("aria-current", tab === activeTab ? "page" : "false");
  });
  nav.querySelector("[data-mobile-more]")?.classList.toggle("active", !["dashboard", "script", "playbook"].includes(activeTab));
}

function openMobilePrimaryMore() {
  closeMobilePrimaryMore();
  const source = document.querySelector(".tabs-utilities-menu");
  if (!source) return;
  const overlay = document.createElement("div");
  overlay.id = "mobilePrimaryMoreOverlay";
  overlay.className = "mobile-primary-more-overlay";
  overlay.dataset.action = "closeMobilePrimaryMoreOverlay";
  overlay.innerHTML = `<section class="mobile-primary-more-sheet" role="dialog" aria-modal="true" aria-label="More tools" tabindex="-1"><div class="mobile-primary-more-handle"></div><header class="mobile-primary-more-header"><div><span>Workspace</span><h2>More</h2></div><button type="button" class="mobile-primary-more-close" data-action="closeMobilePrimaryMore" aria-label="Close more tools">×</button></header><p class="mobile-primary-more-intro">Tools, settings, and account options.</p><div class="mobile-primary-more-list">${source.innerHTML}</div></section>`;
  overlay.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  document.body.appendChild(overlay);
  // The sheet is a cloned navigation surface. Re-run the role projection so
  // an old cached utility entry can never flash a coach/admin data control
  // inside the player-facing More menu.
  if (typeof applyRoleUi === "function") applyRoleUi();
  const sheet = overlay.querySelector(".mobile-primary-more-sheet");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "mobile-primary-more",
      scrollElement: sheet,
      safeArea: true,
      blocking: true,
      onEscape: () => closeMobilePrimaryMore(),
    });
  }
  // A tool opened from More must not leave an invisible, scroll-blocking
  // clone behind it. Tab navigation closes synchronously; modal tools close
  // after their delegated action has safely started.
  overlay.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-action]")?.dataset?.action || "";
    if (action && action !== "closeMobilePrimaryMore" && action !== "closeMobilePrimaryMoreOverlay") {
      requestAnimationFrame(closeMobilePrimaryMore);
    }
  });
  requestAnimationFrame(() => {
    overlay.classList.add("visible");
    sheet?.focus({ preventScroll: true });
  });
}

function closeMobilePrimaryMore() {
  const overlay = document.getElementById("mobilePrimaryMoreOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") closeLayer("mobile-primary-more");
  overlay.remove();
}

function queueMobileShellStateSync() {
  if (_mobileShellFrame) return;
  _mobileShellFrame = requestAnimationFrame(syncMobileShellState);
}

function queueMobileShellMeasuredSync() {
  _mobileShellLastStateKey = "";
  queueMobileShellStateSync();
}

function queueMobileShellSettledSync() {
  window.clearTimeout(_mobileShellScrollTimer);
  _mobileShellScrollTimer = window.setTimeout(queueMobileShellStateSync, 240);
}

function observeMobileShellChrome() {
  if (_mobileShellResizeObserver || typeof ResizeObserver !== "function") return;
  const targets = [
    document.querySelector(".app-header"),
    document.querySelector(".tabs"),
    document.getElementById("mobileCoachDock"),
  ].filter(Boolean);
  if (!targets.length) return;
  _mobileShellResizeObserver = new ResizeObserver(queueMobileShellMeasuredSync);
  targets.forEach((target) => _mobileShellResizeObserver.observe(target));
}

// Run synchronously at parse time so is-mobile-screen is set before first paint.
// The rAF version below handles subsequent resize/orientation changes.
syncMobileShellState();
queueMobileShellStateSync();
document.addEventListener("DOMContentLoaded", () => {
  observeMobileShellChrome();
  queueMobileShellMeasuredSync();
  // Bulletproof nav-bar guard: #mainApp is overflow:hidden on desktop and must
  // never scroll (panels own their own scroll). But programmatic scrollTop
  // (scrollIntoView, focus, etc.) can still push it, hiding the tab bar +
  // game-week bar. Reset it SYNCHRONOUSLY the instant it moves — no rAF delay,
  // so there is no visible flash. Runs only when the panel is the scroll owner.
  const mainApp = document.getElementById("mainApp");
  if (mainApp) {
    mainApp.addEventListener(
      "scroll",
      () => {
        if (
          typeof isDesktopShellPanelScrollOwner === "function" &&
          isDesktopShellPanelScrollOwner() &&
          (mainApp.scrollTop !== 0 || mainApp.scrollLeft !== 0)
        ) {
          mainApp.scrollTop = 0;
          mainApp.scrollLeft = 0;
        }
      },
      { passive: true },
    );
  }
});
window.addEventListener("load", queueMobileShellMeasuredSync);
window.addEventListener("resize", queueMobileShellStateSync, { passive: true });
window.addEventListener("scroll", () => queueDesktopDocumentScrollRepair("window scroll"), {
  passive: true,
  capture: true,
});
window.visualViewport?.addEventListener("resize", queueMobileShellStateSync, {
  passive: true,
});
window.visualViewport?.addEventListener("scroll", queueMobileShellSettledSync, {
  passive: true,
});
window.addEventListener("orientationchange", queueMobileShellStateSync, {
  passive: true,
});
APP_DISPLAY_MODE_MEDIA_QUERIES.forEach((query) => {
  const matcher = window.matchMedia?.(query);
  matcher?.addEventListener?.("change", queueMobileShellMeasuredSync);
});
document.addEventListener("fullscreenchange", queueMobileShellMeasuredSync);
document.addEventListener("fullscreenerror", queueMobileShellMeasuredSync);

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
      if (activeCard) scrollElementWithinPanel(activeCard, { block: "nearest" });
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

function updateSaveStatus(state) {
  const el = document.getElementById("saveStatus");
  if (el) {
    el.className = "save-status " + state;
    el.textContent =
      state === "saved"
        ? "✓ Saved"
        : state === "draft"
          ? "✓ Draft saved"
        : state === "saving"
          ? "⏳ Saving…"
          : "● Unsaved";
  }
  if (typeof window.setWorkspaceSyncStatus !== "function") return;
  if (state === "saved") {
    window.setWorkspaceSyncStatus("local", "saved", { label: "Saved locally" });
  } else if (state === "draft") {
    window.setWorkspaceSyncStatus("local", "saved", { label: "Recovery draft saved locally" });
  } else if (state === "saving") {
    window.setWorkspaceSyncStatus("local", "saving", { label: "Saving workspace..." });
  } else if (state === "unsaved") {
    window.setWorkspaceSyncStatus("local", "dirty", { label: "Unsaved local changes" });
  }
}

// Connectivity status is owned by workspace-sync.js. Keeping that state in
// one place avoids the old full-width offline banner disagreeing with the
// shared save/retry dock.

// ── Mobile Coach Mode dock ──
const MOBILE_COACH_LOCK_ALLOWED_ACTIONS = new Set([
  "showTab",
  "dashGoToTab",
  "toggleMobileCoachLock",
  "coachFocusScriptCall",
  "coachNextScriptCall",
  "coachPrevScriptCall",
  "toggleMobileScriptEditMode",
  "mobileCoachJumpPeriod",
  "mobileCoachScoreScriptCall",
  "mobileCoachLogScriptCall",
  "mobileCoachPresentScriptCall",
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
  // Review lock protects play/script edits, not team communication. Coaches
  // still need to acknowledge questions, react, and reply while reviewing a
  // practice on a phone. Keep every shared discussion surface interactive.
  if (
    el.closest(
      ".disc-section, .pp-disc-drawer, #discReplySheet, #discReactionPicker, #gpDiscModalBody",
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

  const lockPill = document.getElementById("mobileScriptCoachLock");
  const lockPillLabel = document.getElementById("mobileScriptCoachLockLabel");
  if (lockPill) {
    lockPill.classList.toggle("is-on", activeOnMobile);
    lockPill.setAttribute("aria-pressed", activeOnMobile ? "true" : "false");
    lockPill.title = activeOnMobile
      ? "Unlock review mode"
      : "Lock practice for review";
    lockPill.setAttribute(
      "aria-label",
      activeOnMobile ? "Unlock review mode" : "Lock practice for review",
    );
  }
  if (lockPillLabel) lockPillLabel.textContent = activeOnMobile ? "Locked" : "Lock";

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

function _getMobileScriptAssignments(play) {
  if (!play) return "";
  try {
    const opts =
      typeof getScriptDisplayOptions === "function" ? getScriptDisplayOptions() : {};
    if (typeof getScriptVisiblePlayerSummary === "function") {
      return getScriptVisiblePlayerSummary(play, opts);
    }
  } catch (_err) {
    return "";
  }
  return "";
}

function _getMobileScriptLastScore(play) {
  if (
    !play ||
    typeof getPlayReadinessSummary !== "function" ||
    typeof isPlayReadinessCoachRole !== "function" ||
    !isPlayReadinessCoachRole()
  ) {
    return 0;
  }
  const summary = getPlayReadinessSummary(play);
  return parseInt(summary?.lastLogScore, 10) || 0;
}

function _renderMobileScriptPeriodOptions(selectedIndex) {
  const select = document.getElementById("mobileScriptCoachPeriodJump");
  if (!select) return;

  const periods = Array.isArray(script)
    ? script
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item?.isSeparator)
    : [];
  if (!periods.length) {
    select.innerHTML = '<option value="">No periods</option>';
    select.value = "";
    select.disabled = true;
    return;
  }

  const selectedPeriodIndex =
    typeof findOwningPeriodIndex === "function"
      ? findOwningPeriodIndex(selectedIndex)
      : -1;
  select.innerHTML = periods
    .map(({ item, index }, ordinal) => {
      const label = item.label || `Period ${ordinal + 1}`;
      return `<option value="${index}">${escapeHtml(label)}</option>`;
    })
    .join("");
  select.value =
    selectedPeriodIndex >= 0 ? String(selectedPeriodIndex) : String(periods[0].index);
  select.disabled = false;
}

function _updateMobileScriptScoreButtons(activeScore) {
  document
    .querySelectorAll("#mobileScriptCoachNow .mobile-script-coach-now__score button")
    .forEach((button) => {
      const isActive = parseInt(button.dataset.arg, 10) === activeScore;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
}

function syncMobileScriptEditMode() {
  const body = document.body;
  const button = document.getElementById("mobileScriptEditToggle");
  if (!body || !button) return;
  const isEditing = body.classList.contains("mobile-script-editing");
  button.textContent = isEditing ? "Run Mode" : "Edit Sheet";
  button.setAttribute("aria-pressed", isEditing ? "true" : "false");
  button.title = isEditing
    ? "Return to the mobile run view"
    : "Show the full script editor on this phone";
  body.dataset.mobileScriptMode = isEditing ? "edit" : "run";
}

function setMobileScriptEditMode(enabled, opts = {}) {
  const body = document.body;
  if (!body) return;
  const shouldEdit = Boolean(enabled);
  body.classList.toggle("mobile-script-editing", shouldEdit);
  syncMobileScriptEditMode();

  if (!shouldEdit) {
    if (typeof closeScriptToolsDrawer === "function") closeScriptToolsDrawer();
    if (typeof closeScriptDisplayPanel === "function") closeScriptDisplayPanel();
    if (opts.focusCurrent !== false) {
      requestAnimationFrame(_focusMobileCoachScriptRow);
    }
  }
}

function toggleMobileScriptEditMode() {
  const body = document.body;
  if (!body) return;
  const nextEditing = !body.classList.contains("mobile-script-editing");
  setMobileScriptEditMode(nextEditing, { focusCurrent: !nextEditing });
}

function _setMobileScriptCoachControlsDisabled(disabled) {
  document
    .querySelectorAll(
      "#mobileScriptCoachNow button:not(#mobileScriptEditToggle), #mobileScriptCoachNow select",
    )
    .forEach((control) => {
      control.disabled = disabled;
    });
}

function _findMobileCoachCurrentSavedScript() {
  if (typeof getSavedScripts !== "function") return null;
  const name = (document.getElementById("scriptName")?.value || "").trim();
  if (!name) return null;
  const date = document.getElementById("scriptDate")?.value || "";
  const saved = getSavedScripts();
  const byName = saved.filter(
    (record) =>
      String(record?.name || "").trim().toLowerCase() === name.toLowerCase(),
  );
  if (!byName.length) return null;
  return byName.find((record) => (record.date || "") === date) || byName[0];
}

function _isMobileCoachScriptPublished(record) {
  if (!record) return false;
  return typeof isSavedScriptPlayerVisible === "function"
    ? isSavedScriptPlayerVisible(record)
    : Boolean(record.playerVisible);
}

function _updateMobileCoachPublishStatus() {
  const button = document.getElementById("mobileScriptCoachPublish");
  const label = document.getElementById("mobileScriptCoachPublishLabel");
  if (!button || !label) return;
  const record = _findMobileCoachCurrentSavedScript();
  const published = _isMobileCoachScriptPublished(record);
  button.classList.toggle("is-on", published);
  button.setAttribute("aria-pressed", published ? "true" : "false");
  if (published) {
    label.textContent = "Published";
    button.title = "Players can load this practice. Tap to unpublish.";
    button.setAttribute("aria-label", "Unpublish this practice from players");
  } else if (record) {
    label.textContent = "Publish";
    button.title = "Publish this practice to player logins";
    button.setAttribute("aria-label", "Publish this practice to player logins");
  } else {
    label.textContent = "Publish";
    button.title = "Save this practice to publish it to players";
    button.setAttribute(
      "aria-label",
      "Save this practice to publish it to players",
    );
  }
}

async function mobileCoachTogglePublish() {
  if (typeof getSavedScripts !== "function") return;
  let record = _findMobileCoachCurrentSavedScript();
  if (!record) {
    const ok =
      typeof showConfirm === "function"
        ? await showConfirm(
          "Save this practice before publishing it to players?",
          { title: "Publish Practice", icon: "📣", confirmText: "Save & Publish" },
        )
        : true;
    if (!ok) return;
    if (typeof saveScript === "function") {
      const saved = await saveScript();
      if (!saved) return;
    }
    record = _findMobileCoachCurrentSavedScript();
    if (!record) return;
  }

  const saved = getSavedScripts();
  const target = saved.find((entry) => String(entry.id) === String(record.id));
  if (!target) return;
  const nowPublished = !_isMobileCoachScriptPublished(target);
  target.playerVisible = nowPublished;
  if (nowPublished) {
    target.playerPublishedAt = new Date().toISOString();
  } else {
    target.playerUnpublishedAt = new Date().toISOString();
  }
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, saved);
  if (typeof recordPlayerPublishStatus === "function") {
    await recordPlayerPublishStatus("scripts", {
      updatedAt: nowPublished ? target.playerPublishedAt : target.playerUnpublishedAt,
      label: nowPublished
        ? (target.name || "Practice script")
        : `${target.name || "Practice script"} removed from player logins`,
      id: target.id || "",
      visibility: nowPublished ? "published" : "unpublished",
    }, { awaitCompletion: true });
  }
  if (typeof loadSavedScriptsList === "function") loadSavedScriptsList();
  _updateMobileCoachPublishStatus();
  if (typeof showToast === "function") {
    showToast(
      nowPublished
        ? `Published "${target.name}" to player logins.`
        : `Unpublished "${target.name}" from player logins.`,
      { type: nowPublished ? "success" : "warning", duration: 2400 },
    );
  }
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
  const assignmentsEl = document.getElementById("mobileScriptCoachAssignments");

  document
    .querySelectorAll("#scriptPlays .script-item.coach-current")
    .forEach((item) => item.classList.remove("coach-current"));

  if (currentIndex === null) {
    if (periodEl) periodEl.textContent = "No period";
    if (progressEl) progressEl.textContent = "0 / 0";
    if (callEl) callEl.textContent = "Add plays to start coach mode.";
    if (detailEl) detailEl.textContent = "";
    if (assignmentsEl) assignmentsEl.textContent = "";
    _renderMobileScriptPeriodOptions(-1);
    _updateMobileScriptScoreButtons(0);
    _setMobileScriptCoachControlsDisabled(true);
    _updateMobileCoachPublishStatus();
    return;
  }

  const play = script[currentIndex];
  const ordinal = _getMobileScriptOrdinal(currentIndex);
  if (periodEl) periodEl.textContent = _getMobileScriptPeriodLabel(currentIndex);
  if (progressEl) progressEl.textContent = `${ordinal.current} / ${ordinal.total}`;
  if (callEl) callEl.textContent = _getMobileScriptCallTitle(play);
  if (detailEl) detailEl.textContent = _getMobileScriptCallDetail(play);
  const assignments = _getMobileScriptAssignments(play);
  if (assignmentsEl) {
    assignmentsEl.textContent = assignments ? `Personnel: ${assignments}` : "";
  }
  _renderMobileScriptPeriodOptions(currentIndex);
  _updateMobileScriptScoreButtons(_getMobileScriptLastScore(play));
  _setMobileScriptCoachControlsDisabled(false);
  _updateMobileCoachPublishStatus();

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
    if (row) {
      scrollElementWithinPanel(row, {
        block: "center",
        behavior:
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
      });
    }
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

function mobileCoachJumpPeriod(separatorIndex) {
  const startIndex = parseInt(separatorIndex, 10);
  if (!Number.isInteger(startIndex) || !Array.isArray(script)) return;
  let nextPlayable = null;
  for (let index = startIndex + 1; index < script.length; index++) {
    if (script[index]?.isSeparator) break;
    if (script[index]) {
      nextPlayable = index;
      break;
    }
  }
  if (nextPlayable === null) {
    showToast("That period has no plays yet.", {
      type: "warning",
      duration: 1800,
    });
    updateMobileCoachScriptNow();
    return;
  }
  _mobileCoachScriptIndex = nextPlayable;
  coachFocusScriptCall();
}

function mobileCoachScoreScriptCall(score) {
  const currentIndex = _normalizeMobileCoachScriptIndex();
  if (currentIndex === null) {
    updateMobileCoachScriptNow();
    return;
  }
  const play = script[currentIndex];
  if (typeof quickScorePlayReadiness === "function") {
    quickScorePlayReadiness(play, score, { source: "script", index: currentIndex });
  } else if (typeof quickPlayReadinessScriptScore === "function") {
    quickPlayReadinessScriptScore(score, { dataset: { idx: String(currentIndex) } });
  }
  updateMobileCoachScriptNow();
}

function mobileCoachLogScriptCall() {
  const currentIndex = _normalizeMobileCoachScriptIndex();
  if (currentIndex === null) {
    updateMobileCoachScriptNow();
    return;
  }
  if (typeof openPlayReadinessLogModal === "function") {
    openPlayReadinessLogModal(currentIndex);
  } else if (typeof openPlayReadinessRepModal === "function") {
    openPlayReadinessRepModal(currentIndex);
  }
}

function mobileCoachPresentScriptCall() {
  const currentIndex = _normalizeMobileCoachScriptIndex();
  if (currentIndex === null) {
    updateMobileCoachScriptNow();
    return;
  }
  if (typeof openScriptPresentation === "function") {
    openScriptPresentation(currentIndex);
  }
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

// ================================================================
// PLAYER MOBILE INTERACTIONS (Tier 4)
// ================================================================

// Item 34: Capture beforeinstallprompt event for Add-to-Home-Screen
let _a2hsPromptEvent = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _a2hsPromptEvent = e;
  if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
});

function getPlayerA2HSActionState() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    !!navigator.standalone;
  if (standalone) return { available: false, reason: "installed" };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (!_a2hsPromptEvent && !isIOS) return { available: false, reason: "unsupported" };
  return {
    available: true,
    isIOS,
    label: isIOS && !_a2hsPromptEvent ? "Install help" : "Install app",
  };
}

function showPlayerA2HSInstallHelp() {
  const msg =
    "On iPhone or iPad, tap Share, then choose Add to Home Screen. That keeps BCOffense available like an app without taking over this page.";
  if (typeof showModal === "function") {
    return showModal(msg, { title: "Install BCOffense", icon: "📱" });
  }
  showToast("Use Share, then Add to Home Screen.", { type: "info", duration: 5000 });
  return Promise.resolve();
}

function installPlayerA2HS() {
  if (_a2hsPromptEvent) {
    _a2hsPromptEvent.prompt();
    _a2hsPromptEvent.userChoice.then(() => {
      _a2hsPromptEvent = null;
      dismissPlayerA2HS();
    });
  } else {
    showPlayerA2HSInstallHelp();
  }
}

function dismissPlayerA2HS() {
  storageManager.set(STORAGE_KEYS.A2HS_DISMISSED, Date.now());
}

// Player tabs change only through the visible tab controls. Horizontal swipes
// are reserved for Play Presentation, where the gesture directly maps to the
// next or previous play and never competes with ordinary page scrolling.

const PLAYER_BOOTSTRAP_TIMEOUT_MS = 2600;
const PLAYER_BOOTSTRAP_STEPS = [
  { key: "session", label: "Secure session" },
  { key: "local", label: "Saved data" },
  { key: "coach", label: "Coach update" },
  { key: "shell", label: "App shell" },
  { key: "media", label: "Media manifest" },
  { key: "quiz", label: "Quizzes" },
  { key: "notifications", label: "Notifications" },
];

function _createPlayerBootstrapSteps() {
  return PLAYER_BOOTSTRAP_STEPS.map((step) => ({
    ...step,
    status: "pending",
    detail: "",
  }));
}

function _clonePlayerBootstrapSteps(steps) {
  const source = Array.isArray(steps) && steps.length ? steps : _createPlayerBootstrapSteps();
  return source.map((step) => ({ ...step }));
}

function _setPlayerBootstrapStep(result, key, status, detail = "") {
  if (!result || !Array.isArray(result.steps)) return result;
  result.steps = result.steps.map((step) => (
    step.key === key ? { ...step, status, detail } : step
  ));
  return result;
}

function _isPlayerBootstrapOk(result) {
  if (!result) return false;
  if (["applying", "deferred", "skipped", "ready"].includes(result.status)) return true;
  if (["missing", "restore-failed", "error", "offline", "needs-retry"].includes(result.status)) return false;
  if (result.data?.ok === false) return false;
  const appStatus = result.app?.status || "current";
  return appStatus === "current" || appStatus === "unsupported" || appStatus === "applying";
}

function _playerBootstrapStepLabel(step) {
  if (!step) return "Checking for coach updates";
  if (step.status === "ready") return `${step.label} ready`;
  if (step.status === "warn" || step.status === "error") return `${step.label} paused`;
  if (step.status === "skipped") return `${step.label} queued`;
  return `Checking ${step.label.toLowerCase()}...`;
}

let playerTeamRefreshRenderTimer = null;

function _queuePlayerTeamRefreshRender(state = {}) {
  if (typeof renderPlayerDashboardHome !== "function") return;
  if (!state.busy) {
    clearTimeout(playerTeamRefreshRenderTimer);
    playerTeamRefreshRenderTimer = null;
    renderPlayerDashboardHome();
    return;
  }
  if (playerTeamRefreshRenderTimer) return;
  // A release check updates several steps. Coalesce those visual writes so
  // mobile Home stays stable rather than re-rendering for every request.
  playerTeamRefreshRenderTimer = setTimeout(() => {
    playerTeamRefreshRenderTimer = null;
    renderPlayerDashboardHome();
  }, 180);
}

function _setPlayerTeamRefreshState(state = {}, opts = {}) {
  window.playerTeamRefreshState = {
    tone: state.tone || "idle",
    title: state.title || "Ready",
    body: state.body || "Ready",
    busy: Boolean(state.busy),
    updatedAt: state.updatedAt || "",
    steps: _clonePlayerBootstrapSteps(state.steps),
    result: state.result || null,
  };
  if (opts.render !== false) _queuePlayerTeamRefreshRender(state);
}

function _refreshPlayerTeamSurfaces() {
  if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
  if (typeof renderPlayerScriptLauncher === "function") renderPlayerScriptLauncher();
  if (typeof renderPlayerLoadedScriptBar === "function") renderPlayerLoadedScriptBar();
  if (typeof requestRenderScript === "function") requestRenderScript();
  if (typeof _renderPlayerQuizHub === "function") _renderPlayerQuizHub();
  if (document.getElementById("quiz")?.classList.contains("active") &&
    typeof renderQuizPage === "function") {
    renderQuizPage();
  }
}

let playerTeamUpdateCheckStarted = false;
let playerTeamRefreshPromise = null;

function _setPlayerBootstrapProgress(result, key, status, opts = {}) {
  _setPlayerBootstrapStep(result, key, status, opts.detail || "");
  const activeStep = result.steps.find((step) => step.key === key);
  const title = opts.title || (status === "ready" ? "Checking for coach updates" : _playerBootstrapStepLabel(activeStep));
  if (opts.startup && typeof setStartupLoadingMessage === "function") {
    setStartupLoadingMessage(title);
  }
  _setPlayerTeamRefreshState({
    tone: status === "error" || status === "warn" ? "warn" : "checking",
    title,
    body: title,
    busy: true,
    steps: result.steps,
    result,
  }, opts.stateOpts || {});
}

function _playerBootstrapTime(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function _playerBootstrapLatest(entries = []) {
  return entries
    .filter((entry) => entry && _playerBootstrapTime(entry.updatedAt))
    .sort((a, b) => _playerBootstrapTime(b.updatedAt) - _playerBootstrapTime(a.updatedAt))[0] || null;
}

function _getPlayerBootstrapDataFreshness(dataResult = null) {
  const status = dataResult?.ok === false ? "warn" : "ready";
  const updatedAt = dataResult?.exportDate || dataResult?.updatedAt || dataResult?.pulledAt || "";
  return {
    status,
    resultStatus: dataResult?.status || "ready",
    itemCount: Number(dataResult?.summary?.itemCount || dataResult?.itemCount || 0),
    updatedAt,
    checkedAt: new Date().toISOString(),
  };
}

function _getPlayerBootstrapAppFreshness(appResult = null) {
  const appStatus = appResult?.status || "current";
  return {
    status: appStatus === "current" || appStatus === "unsupported" || appStatus === "applying" ? "ready" : "warn",
    resultStatus: appStatus,
    version: appResult?.version || appResult?.cacheName || "",
    checkedAt: new Date().toISOString(),
  };
}

function _getPlayerBootstrapMediaFreshness() {
  const publishStatus =
    typeof getPlayerPublishStatus === "function" ? getPlayerPublishStatus() : {};
  const domains = ["diagrams", "clips", "signals"]
    .map((kind) => ({
      kind,
      label: publishStatus?.[kind]?.label || kind,
      updatedAt: publishStatus?.[kind]?.updatedAt || "",
    }))
    .filter((entry) => _playerBootstrapTime(entry.updatedAt));
  const latest = _playerBootstrapLatest(domains);
  return {
    status: domains.length ? "ready" : "lazy",
    domains: domains.map((entry) => entry.kind),
    updatedAt: latest?.updatedAt || "",
    checkedAt: new Date().toISOString(),
  };
}

function _getPlayerBootstrapQuizFreshness() {
  let settings = {};
  if (typeof _getPlayerQuizSourceSettings === "function") {
    settings = _getPlayerQuizSourceSettings();
  } else if (typeof storageManager !== "undefined" && typeof storageManager.get === "function") {
    settings = storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS, {});
  }
  const entries = Object.entries(settings && typeof settings === "object" ? settings : {})
    .map(([key, entry]) => ({
      key,
      state: entry?.state || "",
      updatedAt: entry?.updatedAt || "",
    }));
  const available = entries.filter((entry) => entry.state && entry.state !== "coach");
  const latest = _playerBootstrapLatest(entries);
  return {
    status: available.length ? "ready" : "lazy",
    count: entries.length,
    availableCount: available.length,
    updatedAt: latest?.updatedAt || "",
    checkedAt: new Date().toISOString(),
  };
}

function _getPlayerBootstrapNotificationFreshness(notificationResult = null) {
  const state = notificationResult || window.playerNotificationState || {};
  return {
    status: state?.ok === false || state?.error ? "warn" : "ready",
    unread: Math.max(0, Number(state?.unread) || 0),
    updatedAt: state?.checkedAt || "",
    error: state?.error || "",
    checkedAt: new Date().toISOString(),
  };
}

function _finishPlayerBootstrapState(result, opts = {}) {
  const ok = _isPlayerBootstrapOk(result);
  const title = ok
    ? "Updates checked"
    : result.status === "offline" ? "Offline practice ready" : "Update check paused";
  result.ok = ok;
  result.status = ok ? (result.status || "ready") : (result.status || "needs-retry");
  result.finishedAt = new Date().toISOString();
  _setPlayerTeamRefreshState({
    tone: ok ? "ready" : "warn",
    title,
    body: title,
    updatedAt: result.finishedAt,
    steps: result.steps,
    result,
  }, opts.stateOpts || {});
  return result;
}

async function runPlayerTeamBootstrap(opts = {}) {
  const quiet = Boolean(opts.quiet);
  const startup = Boolean(opts.startup);
  const quietStartup = quiet && startup;
  const stateOpts = quietStartup ? { render: false } : {};
  const result = {
    ok: false,
    status: "checking",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    data: null,
    app: null,
    media: null,
    quiz: null,
    notifications: null,
    freshness: {},
    steps: _createPlayerBootstrapSteps(),
  };

  if (document.body?.getAttribute("data-auth-role") !== "player") {
    result.ok = true;
    result.status = "skipped";
    result.steps = result.steps.map((step) => ({ ...step, status: "skipped" }));
    return result;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    _setPlayerBootstrapStep(result, "session", "ready", "Signed in");
    _setPlayerBootstrapStep(result, "local", "ready", "Local data available");
    result.status = "offline";
    result.steps = result.steps.map((step) => (
      step.status === "pending" ? { ...step, status: "warn", detail: "Reconnect to check" } : step
    ));
    return _finishPlayerBootstrapState(result, { stateOpts });
  }

  _setPlayerBootstrapProgress(result, "session", "checking", {
    startup,
    stateOpts,
    title: "Checking secure session...",
  });
  _setPlayerBootstrapProgress(result, "session", "ready", {
    startup,
    stateOpts,
    title: "Secure session ready",
    detail: "Signed in",
  });

  _setPlayerBootstrapProgress(result, "local", "checking", {
    startup,
    stateOpts,
    title: "Checking saved data...",
  });
  _setPlayerBootstrapProgress(result, "local", "ready", {
    startup,
    stateOpts,
    title: "Saved data ready",
    detail: "Saved player release loaded",
  });

  try {
    _setPlayerBootstrapProgress(result, "coach", "checking", {
      startup,
      stateOpts,
      title: "Checking latest coach update...",
    });
    if (typeof window.refreshPlayerRelease === "function" || typeof window.refreshPlayerCloudBackup === "function") {
      const refresh = typeof window.refreshPlayerRelease === "function"
        ? window.refreshPlayerRelease
        : window.refreshPlayerCloudBackup;
      result.data = await refresh({
        navigate: !quietStartup,
        skipIfCurrent: true,
      });
    }
    _setPlayerBootstrapStep(
      result,
      "coach",
      result.data && result.data.ok === false ? "warn" : "ready",
      result.data?.status || "Ready",
    );
    result.freshness.data = _getPlayerBootstrapDataFreshness(result.data);
    if (!quietStartup) _refreshPlayerTeamSurfaces();

    _setPlayerBootstrapProgress(result, "shell", "checking", {
      startup,
      stateOpts,
      title: "Checking app shell...",
    });
    if (typeof checkForTeamAppUpdate === "function") {
      result.app = await checkForTeamAppUpdate({ apply: true });
      if (result.app?.status === "applying") {
        _setPlayerBootstrapStep(result, "shell", "ready", "Applying update");
        result.freshness.appShell = _getPlayerBootstrapAppFreshness(result.app);
        result.ok = true;
        result.status = "applying";
        _setPlayerTeamRefreshState({
          tone: "checking",
          title: "Checking for coach updates",
          body: "Checking for coach updates",
          busy: true,
          steps: result.steps,
          result,
        });
        if (!quiet) showToast("Checking for coach updates", { type: "info", duration: 2500 });
        return result;
      }
    }
    const appCurrent = !result.app || result.app.status === "current" || result.app.status === "unsupported";
    _setPlayerBootstrapStep(result, "shell", appCurrent ? "ready" : "warn", result.app?.status || "Ready");
    result.freshness.appShell = _getPlayerBootstrapAppFreshness(result.app);

    _setPlayerBootstrapProgress(result, "media", "checking", {
      startup,
      stateOpts,
      title: "Checking media manifest...",
    });
    result.media = _getPlayerBootstrapMediaFreshness();
    result.freshness.media = result.media;
    _setPlayerBootstrapStep(
      result,
      "media",
      "ready",
      result.media.status === "ready" ? "Media manifest ready" : "Media loads on demand",
    );

    _setPlayerBootstrapProgress(result, "quiz", "checking", {
      startup,
      stateOpts,
      title: "Checking quizzes...",
    });
    result.quiz = _getPlayerBootstrapQuizFreshness();
    result.freshness.quiz = result.quiz;
    _setPlayerBootstrapStep(
      result,
      "quiz",
      "ready",
      result.quiz.availableCount ? "Quiz sources ready" : "Quiz sources load on demand",
    );

    _setPlayerBootstrapProgress(result, "notifications", "checking", {
      startup,
      stateOpts,
      title: "Checking notifications...",
    });
    if (typeof refreshNotificationStatus === "function") {
      result.notifications = await refreshNotificationStatus({ render: !quietStartup }).catch((err) => ({
        ok: false,
        error: err?.message || "Alerts will retry later",
      }));
    }
    result.freshness.notifications = _getPlayerBootstrapNotificationFreshness(result.notifications);
    _setPlayerBootstrapStep(
      result,
      "notifications",
      result.notifications?.ok === false ? "warn" : "ready",
      result.notifications?.ok === false ? "Alerts will retry later" : "Ready",
    );

    const dataOk = !result.data || result.data.ok;
    const shellOk = !result.app || result.app.status === "current" || result.app.status === "unsupported";
    result.status = dataOk && shellOk && result.data?.status !== "missing" ? "ready" : "needs-retry";
    return _finishPlayerBootstrapState(result, { stateOpts });
  } catch (err) {
    _refreshPlayerTeamSurfaces();
    result.status = "error";
    result.error = err?.message || "Update check paused";
    result.steps = result.steps.map((step) => (
      step.status === "checking" || step.status === "pending"
        ? { ...step, status: "warn", detail: "Retry when connected" }
        : step
    ));
    return _finishPlayerBootstrapState(result, { stateOpts });
  }
}

async function refreshPlayerTeamApp(opts = {}) {
  if (playerTeamRefreshPromise) {
    return playerTeamRefreshPromise;
  }

  const quiet = Boolean(opts.quiet);
  const startup = Boolean(opts.startup);
  if (startup) playerTeamUpdateCheckStarted = true;
  if (document.body?.getAttribute("data-auth-role") !== "player") {
    if (!quiet) showToast("Coach updates are for player logins.", { type: "info", duration: 2500 });
    return;
  }

  const runRefresh = async () => {
    try {
      const result = await runPlayerTeamBootstrap(opts);
      if (!quiet && !_isPlayerBootstrapOk(result)) {
        showToast("Update check paused. Practice still works.", { type: "info", duration: 3000 });
      }
      return result;
    } finally {
      playerTeamRefreshPromise = null;
    }
  };

  playerTeamRefreshPromise = runRefresh();
  return playerTeamRefreshPromise;
}

async function waitForPlayerStartupBootstrap(opts = {}) {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (user?.role !== "player" || typeof refreshPlayerTeamApp !== "function") return null;
  const timeoutMs = Math.max(500, Number(opts.timeoutMs || PLAYER_BOOTSTRAP_TIMEOUT_MS));
  let timedOut = false;
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve({
        ok: true,
        status: "deferred",
        timedOut: true,
      });
    }, timeoutMs);
  });
  const bootstrap = refreshPlayerTeamApp({ quiet: true, startup: true });
  const result = await Promise.race([bootstrap, timeout]);
  if (timedOut && typeof setStartupLoadingMessage === "function") {
    setStartupLoadingMessage("Opening dashboard...");
  }
  return result;
}

function schedulePlayerTeamUpdateCheck(opts = {}) {
  if (playerTeamUpdateCheckStarted && !opts.force) return;
  playerTeamUpdateCheckStarted = true;
  const delay = Number(opts.delay ?? (opts.startup ? 700 : 350));
  setTimeout(() => {
    if (document.body?.getAttribute("data-auth-role") !== "player") return;
    refreshPlayerTeamApp({ quiet: true, startup: Boolean(opts.startup) });
  }, Math.max(0, delay));
}

// Item 38: Pull-to-refresh on player dashboard
(function _initPlayerPullToRefresh() {
  let _py = 0, _pa = false;
  document.addEventListener("touchstart", (e) => {
    if (document.body?.getAttribute("data-auth-role") !== "player") return;
    const cur = typeof currentActiveTab !== "undefined" ? currentActiveTab : "";
    if (cur !== "dashboard") return;
    const panel = document.getElementById("dashboard");
    if (!panel || panel.scrollTop > 2) return;
    _py = e.touches[0].clientY;
    _pa = true;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!_pa) return;
    _pa = false;
    const dy = e.changedTouches[0].clientY - _py;
    if (dy > 64) {
      if (typeof refreshPlayerTeamApp === "function") refreshPlayerTeamApp();
      else if (typeof renderPlayerDashboardHome === "function") {
        renderPlayerDashboardHome();
        showToast("Refreshed", { duration: 1500, type: "success" });
      }
    }
  }, { passive: true });
}());
