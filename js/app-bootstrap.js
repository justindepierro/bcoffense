function restoreStoredPlaybookSession(storedPlaybook) {
  plays = storedPlaybook;
  if (typeof ensurePlaybookPlayIds === "function") {
    const changed = ensurePlaybookPlayIds(plays);
    if (changed > 0) storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
  }
  if (typeof invalidatePlaybookRuntimeIndex === "function") invalidatePlaybookRuntimeIndex();
  filteredPlays = [...plays];
  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("mainApp").classList.remove("hidden");

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
