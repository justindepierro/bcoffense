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

function showTab(tabName) {
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

  const index = TAB_INDEX_MAP[tabName];
  if (index !== undefined && tabs[index]) {
    tabs[index].classList.add("active");
    tabs[index].setAttribute("aria-selected", "true");
  }

  if (tabName === "installation") {
    initInstallation();
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
  } else if (tabName === "tendencies") {
    initTendencies();
  } else if (tabName === "gameplan") {
    if (typeof initGamePlan === "function") initGamePlan();
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
}