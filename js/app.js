// Main application logic for Practice Script & Playbook

// Global state
let plays = [];
let script = [];
let scriptWristband = null;
let filteredPlays = [];

// Dirty tracking — marks when working data has unsaved changes
let scriptDirty = false;
let wristbandDirty = false;
const draftRestoreChecksRun = new Set();
const draftRestoreChecksPending = new Set();

function runDraftRestoreCheckForTab(tabName) {
  const tabDraftCheckMap = {
    script: window.checkScriptDraft,
    wristband: window.checkWristbandDraft,
    callsheet: window.checkCallSheetDraft,
    tendencies: window.checkTendenciesDraft,
  };

  const draftCheck = tabDraftCheckMap[tabName];
  if (typeof draftCheck !== "function") return;
  if (
    draftRestoreChecksRun.has(tabName) ||
    draftRestoreChecksPending.has(tabName)
  ) {
    return;
  }

  draftRestoreChecksPending.add(tabName);
  Promise.resolve()
    .then(() => draftCheck())
    .catch((err) => {
      console.error(`draft restore check failed for ${tabName}:`, err);
    })
    .finally(() => {
      draftRestoreChecksPending.delete(tabName);
      draftRestoreChecksRun.add(tabName);
    });
}

/**
 * Mark the working script as having unsaved changes
 */
function markScriptDirty() {
  scriptDirty = true;
  updateSaveStatus("unsaved");
}

/**
 * Mark the working script as clean (just saved or freshly loaded)
 */
function markScriptClean() {
  scriptDirty = false;
  updateSaveStatus("saved");
}

/**
 * Mark the working wristband as having unsaved changes
 */
function markWristbandDirty() {
  wristbandDirty = true;
  updateSaveStatus("unsaved");
}

/**
 * Mark the working wristband as clean
 */
function markWristbandClean() {
  wristbandDirty = false;
  updateSaveStatus("saved");
}

// Warn before closing tab with unsaved work
window.addEventListener("beforeunload", (e) => {
  if (scriptDirty || wristbandDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/**
 * Show a specific tab panel
 * @param {string} tabName - Name of the tab to show
 */
// Tab name → index map (single source of truth)
const TAB_INDEX_MAP = {
  playbook: 0,
  script: 1,
  wristband: 2,
  tendencies: 3,
  callsheet: 4,
  installation: 5,
  offensebuilder: 6,
  dashboard: 7,
};

function showTab(tabName) {
  // Track active tab for help panel
  currentActiveTab = tabName;

  // Hide all panels
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));

  // Show selected panel
  document.getElementById(tabName).classList.add("active");

  // Update tab buttons
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((t) => {
    t.classList.remove("active");
    t.setAttribute("aria-selected", "false");
  });
  const idx = TAB_INDEX_MAP[tabName];
  if (idx !== undefined && tabs[idx]) {
    tabs[idx].classList.add("active");
    tabs[idx].setAttribute("aria-selected", "true");
  }

  // Initialize tab-specific content
  if (tabName === "installation") {
    initInstallation();
  } else if (tabName === "wristband") {
    if (wristbandCards.length === 0) {
      initWristband();
    } else {
      populateWristbandCheckboxFilters();
      renderWristbandPlays();
      renderCardTabs();
    }
  } else if (tabName === "tendencies") {
    initTendencies();
  } else if (tabName === "callsheet") {
    if (Object.keys(callSheet).length === 0) {
      initCallSheet();
    }
    renderCallSheet();
  } else if (tabName === "offensebuilder") {
    initOffenseBuilder();
  } else if (tabName === "dashboard") {
    renderDashboard();
  }

  runDraftRestoreCheckForTab(tabName);

  // Update browser tab title to reflect current module
  const TAB_TITLES = {
    playbook: "Playbook",
    script: "Script Builder",
    wristband: "Wristband",
    tendencies: "Tendencies",
    callsheet: "Call Sheet",
    installation: "Installation",
    offensebuilder: "Offense Builder",
    dashboard: "Dashboard",
  };
  document.title = `${TAB_TITLES[tabName] || tabName} — Practice Script & Playbook`;

  // Remember last active tab (skip installation — not a "real" tab to restore to)
  if (tabName !== "installation") {
    storageManager.set(STORAGE_KEYS.LAST_ACTIVE_TAB, tabName);
  }
}

/**
 * Show the upload section to load a new CSV
 */
/**
 * Shared initialization for all modules after playbook data is loaded.
 * Called by both handleFileUpload() and initApp().
 */
function initAllModules() {
  // Show skeleton loading in playbook table while data loads
  const _tbody = document.querySelector("#playbookTable tbody");
  if (_tbody && _tbody.children.length === 0) {
    _tbody.innerHTML = Array(8)
      .fill('<tr><td colspan="10"><div class="skeleton-row"></div></td></tr>')
      .join("");
  }

  // ── Critical path: render the visible UI ──
  populateFilters();
  initChipListeners();
  if (typeof initPlaybookSearch === "function") initPlaybookSearch();
  restoreColumnVisibility();
  filterPlays();

  // ── Deferred: non-blocking init for secondary features ──
            .join("<br>");
  const extra =
    skippedRows.length > 5
      ? "<br>…and " + (skippedRows.length - 5) + " more"
      : "";
  showModal(
    skippedRows.length +
    " row(s) were skipped:<br><br>" +
    skipMsg +
    extra,
    { title: "⚠️ Import Warnings", icon: "⚠️" },
  );
}
      } catch (err) {
  hideLoadingOverlay();
  console.error("handleFileUpload reader.onload error:", err);
  showToast("❌ Error reading file. Check format and try again.", {
    duration: 4000,
    type: "error",
  });
}
    };
reader.readAsText(file);
  } catch (err) {
  hideLoadingOverlay();
  console.error("handleFileUpload error:", err);
  showToast("❌ Error uploading file.", { duration: 4000, type: "error" });
}
}

/**
 * Initialize the application
 */
function initApp() {
  const runOptionalInit = (label, callback) => {
    try {
      callback();
    } catch (err) {
      console.error(`initApp optional step failed: ${label}`, err);
    }
  };

  try {
    // Run storage migrations before loading any data
    runMigrations();

    // Check for stored playbook
    const storedPlaybook = storageManager.get(STORAGE_KEYS.PLAYBOOK, null);
    if (storedPlaybook) {
      plays = storedPlaybook;
      filteredPlays = [...plays];
      document.getElementById("uploadSection").classList.add("hidden");
      document.getElementById("mainApp").classList.remove("hidden");

      // Restore playbook-specific state before shared init
      restorePlaybookState();

      initAllModules();

      // Sync sort UI from restored state
      _syncSortUI();

      // Restore last active tab
      const lastTab = storageManager.get(STORAGE_KEYS.LAST_ACTIVE_TAB);
      if (
        lastTab &&
        lastTab !== "installation" &&
        TAB_INDEX_MAP[lastTab] !== undefined
      ) {
        showTab(lastTab);
      } else {
        runDraftRestoreCheckForTab(currentActiveTab);
      }

      // Restore call sheet display options
      if (typeof restoreCallSheetDisplayOptions === "function") {
        restoreCallSheetDisplayOptions();
      }
    }

    // Set up drag and drop for file upload
    const uploadBox = document.querySelector(".upload-box");
    if (uploadBox) {
      uploadBox.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadBox.classList.add("dragover");
      });
      uploadBox.addEventListener("dragleave", () => {
        uploadBox.classList.remove("dragover");
      });
      uploadBox.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadBox.classList.remove("dragover");
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith(".csv")) {
          document.getElementById("csvFile").files = e.dataTransfer.files;
          handleFileUpload({ target: { files: [file] } });
        }
      });
    }

    // Set up drag and drop for script container
    const scriptContainer = document.getElementById("scriptPlays");
    if (scriptContainer) {
      scriptContainer.addEventListener("dragover", handleDragOver);
      scriptContainer.addEventListener("dragleave", handleDragLeave);
      scriptContainer.addEventListener("drop", handleDrop);
    }

    // Set today's date as default
    const scriptDateInput = document.getElementById("scriptDate");
    if (scriptDateInput) {
      const today = new Date();
      try {
        scriptDateInput.valueAsDate = today;
      } catch (err) {
        scriptDateInput.value = today.toISOString().slice(0, 10);
      }
    }

    // Initialize team name input with stored value
    const teamNameInput = document.getElementById("teamNameInput");
    if (teamNameInput) {
      teamNameInput.value = getTeamName();
    }

    runOptionalInit("initTeamSettings", () => initTeamSettings());

    // Populate header subtitle with team name
    const teamSub = document.getElementById("teamSubtitle");
    if (teamSub) {
      const name = getTeamName();
      teamSub.textContent = name && name !== "My Team Football" ? name : "";
    }

    // Initialize swatch handlers for wristband
    runOptionalInit("initSwatchHandlers", () => initSwatchHandlers());

    // Initialize script keyboard shortcuts
    runOptionalInit("initScriptKeyboard", () => initScriptKeyboard());
  } catch (err) {
    console.error("initApp error:", err);
    showToast("❌ Error initializing app. Try refreshing.", {
      duration: 5000,
      type: "error",
    });
  }
}

/**
 * Export all data to a JSON backup file
 * Uses centralized storage manager for complete backup
 */
function exportBackup() {
  exportCompleteBackup();
}

/**
 * Import data from a JSON backup file
 * Uses centralized storage manager for complete restore
 */
function importBackup(event) {
  importCompleteBackup(event);
}

// ============ CSV Template Modal ============

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
    // "/" focus search
    if (e.key === "/" && !inInput) {
      e.preventDefault();
      const searchInput = document.getElementById("obSearchInput");
      if (searchInput) searchInput.focus();
      return;
    }
    // Escape: blur search / deselect play
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
    // "r" toggle rated only
    if (e.key === "r" && !inInput) {
      e.preventDefault();
      const cb = document.getElementById("obShowRated");
      if (cb) {
        cb.checked = !cb.checked;
        obShowRatedOnly = cb.checked;
        obRenderPlayList();
      }
      return;
    }
    // Arrow up/down: navigate play cards
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !inInput) {
      e.preventDefault();
      const cards = document.querySelectorAll("#obPlayList .ob-card");
      if (!cards.length) return;
      const names = Array.from(cards).map((c) => c.dataset.play);
      const idx = obActivePlayName ? names.indexOf(obActivePlayName) : -1;
      let next;
      if (e.key === "ArrowDown") {
        next = idx < names.length - 1 ? idx + 1 : 0;
      } else {
        next = idx > 0 ? idx - 1 : names.length - 1;
      }
      obActivePlayName = names[next];
      obRenderPlayList();
      obRenderSidebar();
      const activeCard = document.querySelector("#obPlayList .ob-card.active");
      if (activeCard) activeCard.scrollIntoView({ block: "nearest" });
      return;
    }
  }

  if (inInput) return;

  // Number keys 1-8: switch tabs (no modifier, no alt)
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

  // Cmd+K: Quick search (wristband tab)
  if (
    e.key === "k" &&
    currentActiveTab === "wristband" &&
    typeof openWbQuickSearch === "function"
  ) {
    e.preventDefault();
    openWbQuickSearch();
    return;
  }

  // Undo: Ctrl+Z / Cmd+Z
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

  // Redo: Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z
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
    "📡 You\u2019re offline \u2014 changes are saved locally and will sync when reconnected";
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
      ? script.filter((p) => !p.isSeparator).length
      : 0,
    "tab-wristband":
      typeof wristbandCards !== "undefined"
        ? wristbandCards.reduce(
          (s, c) => s + (c.data ? c.data.filter(Boolean).length : 0),
          0,
        )
        : 0,
    "tab-tendencies":
      typeof tendenciesOpponents !== "undefined"
        ? tendenciesOpponents.length
        : 0,
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}
const _scrollFab = document.getElementById("scrollTopFab");
if (_scrollFab) {
  window.addEventListener(
    "scroll",
    () => _scrollFab.classList.toggle("visible", window.scrollY > 400),
    { passive: true },
  );
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

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initApp);

// Global error handlers — surface silent failures to the user
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
  showToast("\u26a0\ufe0f Something went wrong. Check console.", {
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
  // Set tabindex: active=0, inactive=-1
  tablist.querySelectorAll('[role="tab"]').forEach((t) => {
    t.setAttribute(
      "tabindex",
      t.getAttribute("aria-selected") === "true" ? "0" : "-1",
    );
  });
  tablist.addEventListener("keydown", (e) => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const idx = tabs.indexOf(e.target);
    if (idx < 0) return;
    let next;
    if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
    else if (e.key === "ArrowLeft")
      next = tabs[(idx - 1 + tabs.length) % tabs.length];
    if (next) {
      e.preventDefault();
      tabs.forEach((t) => t.setAttribute("tabindex", "-1"));
      next.setAttribute("tabindex", "0");
      next.focus();
      next.click();
    }
  });
});

// Close any open dropdowns when clicking outside
