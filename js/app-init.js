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
      restoreStoredPlaybookSession(storedPlaybook);
    }

    initUploadDropZone();
    initScriptDropZone();
    initDefaultScriptDate();
    initTeamIdentityUi(runOptionalInit);
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