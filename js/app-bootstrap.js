let mobileEmptyShellInitialized = false;
let pendingRestoredStartupTab = "";

function isMobileStartupShell() {
  if (document.body?.classList.contains("is-mobile-screen")) return true;
  const width = window.visualViewport?.width || window.innerWidth || 0;
  return width > 0 && width <= 768;
}

function setWorkspaceSurface(surface, opts = {}) {
  const uploadSection = document.getElementById("uploadSection");
  const mainApp = document.getElementById("mainApp");
  if (!uploadSection || !mainApp) return;

  const showApp = surface === "app";
  uploadSection.classList.toggle("hidden", showApp);
  mainApp.classList.toggle("hidden", !showApp);
  document.body.dataset.workspaceSurface = showApp ? "app" : "upload";

  const backBtn = document.getElementById("backToAppBtn");
  if (backBtn) {
    const canBackToMobileShell = isMobileStartupShell() && showApp === false;
    backBtn.classList.toggle("hidden", !(plays.length > 0 || canBackToMobileShell));
  }

  if (showApp && opts.initModules) {
    if (plays.length > 0 || !mobileEmptyShellInitialized) {
      initAllModules();
      mobileEmptyShellInitialized = plays.length === 0;
    }
  }

  if (typeof queueMobileShellMeasuredSync === "function") {
    queueMobileShellMeasuredSync();
  } else if (typeof queueMobileShellStateSync === "function") {
    queueMobileShellStateSync();
  }
}

function ensureMobileStartupSurface() {
  if (!isMobileStartupShell() || plays.length > 0) return;
  setWorkspaceSurface("app", { initModules: true });

  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (!currentUser || typeof showTab !== "function") return;

  const defaultTab =
    typeof getDefaultAuthTab === "function" ? getDefaultAuthTab() : "playbook";
  const targetTab = currentUser.role === "player" ? defaultTab : "playbook";
  const canUseTarget =
    typeof canAccessTab !== "function" || canAccessTab(targetTab);
  if (!canUseTarget) return;

  if (
    typeof currentActiveTab === "undefined" ||
    currentActiveTab === "playbook" ||
    (typeof canAccessTab === "function" && !canAccessTab(currentActiveTab))
  ) {
    showTab(targetTab);
  }
}

function getRestorableStoredTab() {
  const lastTab = storageManager.get(STORAGE_KEYS.LAST_ACTIVE_TAB);
  if (
    lastTab &&
    lastTab !== "installation" &&
    typeof TAB_INDEX_MAP !== "undefined" &&
    TAB_INDEX_MAP[lastTab] !== undefined
  ) {
    return lastTab;
  }
  return "";
}

function refreshHydratedStartupSurfaces(tabName = "") {
  const activeTab =
    tabName ||
    (typeof currentActiveTab !== "undefined"
      ? currentActiveTab
      : document.body?.dataset.activeTab || "");
  if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
  if (activeTab === "dashboard" && typeof requestRenderDashboard === "function") {
    requestRenderDashboard();
  }
  if (activeTab === "gameplan" && typeof requestRenderGamePlan === "function") {
    requestRenderGamePlan();
  }
}

function applyPendingRestoredStartupTab(tabName = pendingRestoredStartupTab) {
  if (!tabName) return false;
  if (
    tabName === "installation" ||
    typeof TAB_INDEX_MAP === "undefined" ||
    TAB_INDEX_MAP[tabName] === undefined
  ) {
    pendingRestoredStartupTab = "";
    return false;
  }

  let targetTab = tabName;
  if (typeof canAccessTab === "function" && !canAccessTab(targetTab)) {
    const fallback =
      typeof getDefaultAuthTab === "function" ? getDefaultAuthTab() : "playbook";
    if (fallback !== targetTab && canAccessTab(fallback)) {
      targetTab = fallback;
    } else {
      pendingRestoredStartupTab = tabName;
      return false;
    }
  }

  pendingRestoredStartupTab = "";
  if (typeof showTab === "function") {
    showTab(targetTab);
  } else {
    refreshHydratedStartupSurfaces(targetTab);
  }
  return true;
}

function queueRestoredStartupTab(tabName) {
  if (!tabName) return;
  pendingRestoredStartupTab = tabName;
  if (typeof whenAuthReady === "function") {
    whenAuthReady()
      .then(() => applyPendingRestoredStartupTab(tabName))
      .catch(() => { });
  } else {
    setTimeout(() => applyPendingRestoredStartupTab(tabName), 0);
  }
}

if (typeof window !== "undefined") {
  window.applyPendingRestoredStartupTab = applyPendingRestoredStartupTab;
}

function restoreStoredPlaybookSession(storedPlaybook) {
  plays = storedPlaybook;
  if (typeof ensurePlaybookPlayIds === "function") {
    const changed = ensurePlaybookPlayIds(plays);
    if (changed > 0) storageManager.setPlaybook(plays);
  }
  // Backfill stable IDs on existing opponents (#34)
  if (typeof ensureOpponentIds === "function") {
    const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
    if (ensureOpponentIds(opponents) > 0) {
      storageManager.set(STORAGE_KEYS.DEFENSIVE_TENDENCIES, opponents);
    }
  }
  if (typeof invalidatePlaybookRuntimeIndex === "function") invalidatePlaybookRuntimeIndex();
  filteredPlays = [...plays];
  setWorkspaceSurface("app");

  initAllModules();
  _syncSortUI();

  const lastTab = getRestorableStoredTab();
  if (lastTab) {
    if (!applyPendingRestoredStartupTab(lastTab)) {
      queueRestoredStartupTab(lastTab);
      refreshHydratedStartupSurfaces(currentActiveTab);
    }
  } else {
    refreshHydratedStartupSurfaces(currentActiveTab);
    runDraftRestoreCheckForTab(currentActiveTab);
  }
}

function initUploadDropZone() {
  const uploadBox = document.querySelector(".upload-box");
  if (!uploadBox) return;

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

function initScriptDropZone() {
  const scriptContainer = document.getElementById("scriptPlays");
  if (!scriptContainer) return;

  scriptContainer.addEventListener("dragover", handleDragOver);
  scriptContainer.addEventListener("dragleave", handleDragLeave);
  scriptContainer.addEventListener("drop", handleDrop);
}

function initDefaultScriptDate() {
  const scriptDateInput = document.getElementById("scriptDate");
  if (!scriptDateInput) return;

  const today = new Date();
  try {
    scriptDateInput.valueAsDate = today;
  } catch (err) {
    scriptDateInput.value = today.toISOString().slice(0, 10);
  }
}

function initTeamIdentityUi(runOptionalInit) {
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
}

/**
 * Show a first-use welcome walkthrough the first time a new user opens the app.
 * Displayed when the playbook is empty and the walkthrough has not been dismissed.
 * (#298)
 */
async function maybeShowFirstUseWalkthrough() {
  if (storageManager.get(STORAGE_KEYS.FIRST_USE_DISMISSED, false)) return;
  if (Array.isArray(plays) && plays.length > 0) return;
  if (isMobileStartupShell()) return;
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (!currentUser || currentUser.role === "player") return;

  const msg = `
    <p>Welcome to <strong>BCOffense</strong> — your football practice management tool.</p>
    <p>Here's the core workflow:</p>
    <ol style="padding-left:1.4em;line-height:1.8;">
      <li><strong>Playbook</strong> — Import your plays from a CSV file.</li>
      <li><strong>Script Builder</strong> — Build and organize a practice script.</li>
      <li><strong>Wristband</strong> — Create a wristband card for signaling plays.</li>
      <li><strong>Call Sheet</strong> — Lay out your game call sheet by situation.</li>
      <li><strong>Game Plan</strong> — Organize the week's plan in flexible boxes.</li>
      <li><strong>Scout</strong> — Chart opponent defensive tendencies from film.</li>
    </ol>
    <p style="margin-top:.75em">Start by importing a playbook CSV on the <strong>Playbook</strong> tab.</p>`;

  await showModal(msg, { title: "👋 Welcome to BCOffense", icon: "🏈" });
  storageManager.set(STORAGE_KEYS.FIRST_USE_DISMISSED, true);

  if (typeof showTab === "function") showTab("playbook");
  if (typeof showUpload === "function") showUpload();
}
