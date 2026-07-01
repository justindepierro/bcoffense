const TAB_INDEX_MAP = {
  playbook: 0,
  script: 1,
  wristband: 2,
  tendencies: 3,
  gameplan: 4,
  callsheet: 5,
  installation: 6,
  identity: 7,
  offensebuilder: 8,
  dashboard: 9,
};

// Timer for debounced last-tab persistence per opponent (#28)
let _lastTabSaveTimer = null;

// Supporting utilities surfaced through the Utilities menu rather than as
// equal-weight primary tabs (roadmap immediate fix #7).
const UTILITY_TABS = new Set([
  "dashboard",
  "installation",
  "identity",
  "offensebuilder",
]);

function scrollTabStripToTab(tab) {
  if (!(tab instanceof HTMLElement)) return;
  const strip = tab.closest(".tabs");
  if (!(strip instanceof HTMLElement)) return;
  const stripRect = strip.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();
  const left =
    strip.scrollLeft +
    tabRect.left -
    stripRect.left -
    (strip.clientWidth - tabRect.width) / 2;
  strip.scrollTo({
    left: Math.max(0, left),
    behavior:
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
  });
}

function showTab(tabName) {
  if (typeof canAccessTab === "function" && !canAccessTab(tabName)) {
    tabName = typeof getDefaultAuthTab === "function" ? getDefaultAuthTab() : "playbook";
    if (typeof canAccessTab === "function" && !canAccessTab(tabName)) return;
  }

  // Close presentation overlay when switching tabs
  if (typeof closePlayPresentation === "function") {
    const overlay = document.getElementById("playPresentationOverlay");
    if (overlay?.classList.contains("is-open")) {
      closePlayPresentation();
    }
  }

  currentActiveTab = tabName;
  if (document.body) document.body.dataset.activeTab = tabName;

  document
    .querySelectorAll(".panel")
    .forEach((panel) => panel.classList.remove("active"));
  document.getElementById(tabName).classList.add("active");

  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.classList.remove("active");
    tab.setAttribute("aria-selected", "false");
  });

  // Highlight by id (robust to tab reordering and to utility tabs that live
  // inside the Utilities menu rather than the primary strip).
  const activeTabBtn = document.getElementById("tab-" + tabName);
  if (activeTabBtn) {
    activeTabBtn.classList.add("active");
    activeTabBtn.setAttribute("aria-selected", "true");
    if (activeTabBtn.classList.contains("tab")) {
      requestAnimationFrame(() => scrollTabStripToTab(activeTabBtn));
    }
  }

  // Reflect utility-page selection on the Utilities menu trigger.
  const utilitiesBtn = document.getElementById("utilitiesMenuBtn");
  if (utilitiesBtn) {
    utilitiesBtn.classList.toggle("active", UTILITY_TABS.has(tabName));
  }

  // Item 32: haptic feedback on player tab switch
  if (
    document.body?.classList.contains("is-mobile-screen") &&
    document.body?.getAttribute("data-auth-role") === "player" &&
    typeof vibrateHaptic === "function"
  ) {
    vibrateHaptic(5);
  }

  if (tabName === "installation") {
    initInstallation();
  } else if (tabName === "playbook") {
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
  } else if (tabName === "identity") {
    if (typeof renderIdentity === "function") renderIdentity();
  } else if (tabName === "script") {
    if (typeof ensureScriptWorkspaceReady === "function") {
      ensureScriptWorkspaceReady();
    } else if (typeof initScriptWorkspace === "function") {
      initScriptWorkspace();
    }
  } else if (tabName === "wristband") {
    if (wristbandCards.length === 0) {
      initWristband();
    } else {
      populateWristbandCheckboxFilters();
      renderWristbandPlays();
      renderCardTabs();
    }
    // Show type-choice landing if wristband is empty and no type chosen yet
    if (typeof checkShowWbLanding === "function") checkShowWbLanding();
  } else if (tabName === "tendencies") {
    initTendencies();
  } else if (tabName === "gameplan") {
    if (typeof initGamePlan === "function") initGamePlan();
  } else if (tabName === "callsheet") {
    if (Object.keys(callSheet).length === 0) {
      initCallSheet();
    } else if (typeof refreshCallSheetFromPlaybook === "function") {
      refreshCallSheetFromPlaybook();
    }
    if (typeof scheduleRenderCallSheet === "function") {
      scheduleRenderCallSheet();
    } else {
      renderCallSheet();
    }
  } else if (tabName === "offensebuilder") {
    initOffenseBuilder();
  } else if (tabName === "dashboard") {
    // Item 42: defer player dashboard render so tab-switch animation completes first
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => renderDashboard(), { timeout: 250 });
    } else {
      setTimeout(renderDashboard, 0);
    }
  }

  runDraftRestoreCheckForTab(tabName);

  const TAB_TITLES = {
    playbook: "Playbook",
    script: "Script Builder",
    wristband: "Wristband",
    tendencies: "Tendencies",
    gameplan: "Game Plan",
    callsheet: "Call Sheet",
    installation: "Installation",
    identity: "Identity",
    offensebuilder: "Offense Builder",
    dashboard: "Dashboard",
  };
  document.title = `${TAB_TITLES[tabName] || tabName} — Practice Script & Playbook`;

  if (tabName !== "installation") {
    storageManager.set(STORAGE_KEYS.LAST_ACTIVE_TAB, tabName);
  }

  if (typeof updateMobileCoachDock === "function") updateMobileCoachDock();
  if (typeof queueMobileShellStateSync === "function") queueMobileShellStateSync();

  // #28: Persist last active tab per opponent (debounced to avoid excessive writes)
  clearTimeout(_lastTabSaveTimer);
  _lastTabSaveTimer = setTimeout(() => {
    const gw = getGameWeek();
    if (gw.opponentIndex === null) return;
    if (!gw.lastTabs || typeof gw.lastTabs !== "object") gw.lastTabs = {};
    gw.lastTabs[String(gw.opponentIndex)] = tabName;
    storageManager.set(STORAGE_KEYS.GAME_WEEK, gw);
  }, 600);
}
