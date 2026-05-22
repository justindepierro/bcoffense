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

  body.classList.toggle("is-mobile-screen", isMobile);
  body.classList.toggle("is-phone-screen", isPhone);
  body.classList.toggle("is-compact-screen", isCompact);
  body.classList.toggle("is-short-screen", isShort);
  body.classList.toggle("is-touch-screen", Boolean(isTouch));
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

// ── Global keyboard shortcuts: Undo/Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Y / Shift+Z) ──
document.addEventListener("keydown", (e) => {
  const inInput =
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable;

  const mod = e.ctrlKey || e.metaKey;

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

  if (
    e.key === "k" &&
    currentActiveTab === "wristband" &&
    typeof openWbQuickSearch === "function"
  ) {
    e.preventDefault();
    openWbQuickSearch();
    return;
  }

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
