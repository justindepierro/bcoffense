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
  const waitForPlayerBootstrapStartup = () => {
    const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    if (user?.role !== "player" || typeof waitForPlayerStartupBootstrap !== "function") {
      return Promise.resolve(null);
    }
    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Checking latest coach update...");
    }
    return Promise.race([
      waitForPlayerStartupBootstrap({ timeoutMs: 2600 }),
      new Promise((resolve) => setTimeout(() => resolve({ status: "deferred" }), 2800)),
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
    if (typeof appDiagnostics !== "undefined") appDiagnostics.mark("startup:init");
    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Checking saved data...");
    }
    if (typeof appDiagnostics !== "undefined") {
      appDiagnostics.measure("startup:migrations", () => runMigrations());
    } else {
      runMigrations();
    }

    const storedPlaybook =
      typeof appDiagnostics !== "undefined"
        ? await appDiagnostics.measure("startup:get-playbook", () => storageManager.getPlaybook())
        : await storageManager.getPlaybook();
    storageManager.compactLocalStorage({ removeExpiredDrafts: true });
    if (storedPlaybook) {
      if (typeof setStartupLoadingMessage === "function") {
        setStartupLoadingMessage("Restoring playbook...");
      }
      if (typeof appDiagnostics !== "undefined") {
        appDiagnostics.measure("startup:restore-session", () =>
          restoreStoredPlaybookSession(storedPlaybook),
        );
      } else {
        restoreStoredPlaybookSession(storedPlaybook);
      }
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
    if (typeof appDiagnostics !== "undefined") appDiagnostics.mark("startup:ui-ready");
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
    await waitForPlayerBootstrapStartup();
    if (typeof appDiagnostics !== "undefined") {
      appDiagnostics.mark(startupFailed ? "startup:failed" : "startup:ready");
    }
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
