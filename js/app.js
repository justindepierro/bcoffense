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

function markScriptDirty() {
  scriptDirty = true;
  updateSaveStatus("unsaved");
}

function markScriptClean() {
  scriptDirty = false;
  updateSaveStatus("saved");
}

function markWristbandDirty() {
  wristbandDirty = true;
  updateSaveStatus("unsaved");
}

function markWristbandClean() {
  wristbandDirty = false;
  updateSaveStatus("saved");
}

window.addEventListener("beforeunload", (e) => {
  if (scriptDirty || wristbandDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

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
  currentActiveTab = tabName;

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

  if (tabName !== "installation") {
    storageManager.set(STORAGE_KEYS.LAST_ACTIVE_TAB, tabName);
  }
}

function initAllModules() {
  const tableBody = document.querySelector("#playbookTable tbody");
  if (tableBody && tableBody.children.length === 0) {
    tableBody.innerHTML = Array(8)
      .fill('<tr><td colspan="10"><div class="skeleton-row"></div></td></tr>')
      .join("");
  }

  populateFilters();
  initChipListeners();
  if (typeof initPlaybookSearch === "function") initPlaybookSearch();
  restoreColumnVisibility();
  filterPlays();

  const idle =
    typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (callback) => setTimeout(callback, 50);

  idle(
    () => {
      initCollections();
      initPlaybookKeyboard();
      updateStatsBar();
      renderAvailablePlays();
      loadSavedScriptsList();
      populateScriptWristbandSelect();
      restoreScriptDisplayOptions();
      ensureFirstPeriod();
      renderScript();

      const storedCallSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
      if (storedCallSheet) {
        callSheet = storedCallSheet;
      }

      updateTabBadges();
    },
    { timeout: 2000 },
  );
}

function initApp() {
  const runOptionalInit = (label, callback) => {
    try {
      callback();
    } catch (err) {
      console.error(`initApp optional step failed: ${label}`, err);
    }
  };

  try {
    runMigrations();

    const storedPlaybook = storageManager.get(STORAGE_KEYS.PLAYBOOK, null);
    if (storedPlaybook) {
      plays = storedPlaybook;
      filteredPlays = [...plays];
      document.getElementById("uploadSection").classList.add("hidden");
      document.getElementById("mainApp").classList.remove("hidden");

      restorePlaybookState();
      initAllModules();
      _syncSortUI();

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

      if (typeof restoreCallSheetDisplayOptions === "function") {
        restoreCallSheetDisplayOptions();
      }
    }

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

    const scriptContainer = document.getElementById("scriptPlays");
    if (scriptContainer) {
      scriptContainer.addEventListener("dragover", handleDragOver);
      scriptContainer.addEventListener("dragleave", handleDragLeave);
      scriptContainer.addEventListener("drop", handleDrop);
    }

    const scriptDateInput = document.getElementById("scriptDate");
    if (scriptDateInput) {
      const today = new Date();
      try {
        scriptDateInput.valueAsDate = today;
      } catch (err) {
        scriptDateInput.value = today.toISOString().slice(0, 10);
      }
    }

    const teamNameInput = document.getElementById("teamNameInput");
    if (teamNameInput) {
      teamNameInput.value = getTeamName();
    }

    runOptionalInit("initTeamSettings", () => initTeamSettings());

    const teamSubtitle = document.getElementById("teamSubtitle");
    if (teamSubtitle) {
      const name = getTeamName();
      teamSubtitle.textContent =
        name && name !== "My Team Football" ? name : "";
    }

    runOptionalInit("initSwatchHandlers", () => initSwatchHandlers());
    runOptionalInit("initScriptKeyboard", () => initScriptKeyboard());
  } catch (err) {
    console.error("initApp error:", err);
    showToast("❌ Error initializing app. Try refreshing.", {
      duration: 5000,
      type: "error",
    });
  }
}

function exportBackup() {
  exportCompleteBackup();
}

function importBackup(event) {
  importCompleteBackup(event);
}

document.addEventListener("DOMContentLoaded", initApp);
