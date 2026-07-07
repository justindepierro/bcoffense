async function initApp() {
  let startupFailed = false;
  const waitForAuthStartup = () => {
    if (typeof whenAuthReady !== "function") return Promise.resolve();
    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Checking secure session...");
    }
    return Promise.race([
      whenAuthReady(),
      new Promise((resolve) => setTimeout(resolve, 4200)),
    ]);
  };
  const runOptionalInit = (label, callback) => {
    try {
      callback();
    } catch (err) {
      console.error(`initApp optional step failed: ${label}`, err);
    }
  };

  try {
    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Checking saved data...");
    }
    runMigrations();

    const storedPlaybook = await storageManager.getPlaybook();
    storageManager.compactLocalStorage({ removeExpiredDrafts: true });
    if (storedPlaybook) {
      if (typeof setStartupLoadingMessage === "function") {
        setStartupLoadingMessage("Restoring playbook...");
      }
      restoreStoredPlaybookSession(storedPlaybook);
    } else if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Preparing upload workspace...");
      if (typeof ensureMobileStartupSurface === "function") {
        ensureMobileStartupSurface();
      }
    }

    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Finishing setup...");
    }
    initUploadDropZone();
    initScriptDropZone();
    initDefaultScriptDate();
    initTeamIdentityUi(runOptionalInit);
    if (typeof initPageHelp === "function") initPageHelp();
    if (typeof initToolbarResizeObserver === "function") initToolbarResizeObserver();
    if (typeof maybeShowFirstUseWalkthrough === "function") {
      setTimeout(maybeShowFirstUseWalkthrough, 500);
    }
  } catch (err) {
    startupFailed = true;
    console.error("initApp error:", err);
    showToast("❌ Error initializing app. Try refreshing.", {
      duration: 5000,
      type: "error",
    });
  } finally {
    await waitForAuthStartup();
    if (typeof finishStartupLoading === "function") {
      finishStartupLoading({ error: startupFailed, delay: startupFailed ? 400 : 120 });
    } else if (document.body) {
      document.body.classList.remove("app-booting");
      document.body.classList.add("app-ready");
    }
  }
}

function exportBackup() {
  exportCompleteBackup();
}

function importBackup(event) {
  importCompleteBackup(event);
}

document.addEventListener("DOMContentLoaded", initApp);
