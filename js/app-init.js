async function initApp() {
  let startupFailed = false;
  // Prefer the canonical workspace before first paint, but an unavailable
  // network must never leave a coach trapped on the startup screen.
  const STAFF_WORKSPACE_STARTUP_TIMEOUT_MS = 14 * 1000;
  const waitForAuthStartup = () => {
    if (typeof whenAuthReady !== "function") return Promise.resolve();
    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Checking secure session...");
    }
    if (typeof setStartupLoadingDetail === "function") {
      setStartupLoadingDetail("Verifying this device's secure access.");
    }
    // auth.js already owns a short, abortable request deadline. Do not race it
    // with another startup timeout: proceeding without an identity can choose
    // the wrong workspace path and leave a private staff session empty.
    return whenAuthReady();
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
  const hasUsableStoredPlaybook = (value) => Array.isArray(value) && value.length > 0;
  const waitForStaffWorkspaceBootstrap = (user) => {
    const canReadTeamWorkspace = ["admin", "coach", "assistant_coach"].includes(String(user?.role || ""));
    if (!canReadTeamWorkspace || typeof autoPullLatestCloudBackup !== "function") {
      return Promise.resolve(false);
    }
    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Loading team workspace...");
    }
    if (typeof setStartupLoadingDetail === "function") {
      setStartupLoadingDetail("Getting the latest plays, scripts, media, game plans, and assignments.");
    }
    // Every staff login completes its canonical read before first render.
    // A deliberate initial wait is calmer and safer than opening a stale or
    // empty workspace, then visibly reloading it underneath the coach.
    // cloud-sync owns the bounded network deadline and protects active or
    // untracked local work. Its session guard also makes the queued post-paint
    // auto-pull a no-op once this startup read has completed.
    if (typeof setStartupLoadingHold === "function") setStartupLoadingHold(true);
    return Promise.resolve(autoPullLatestCloudBackup({
      timeoutMs: STAFF_WORKSPACE_STARTUP_TIMEOUT_MS,
    }))
      .finally(() => {
        if (typeof setStartupLoadingHold === "function") setStartupLoadingHold(false);
      });
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
      setStartupLoadingMessage("Checking secure session...");
    }
    // Resolve identity before hydrating IndexedDB. A player device may still
    // contain an old pre-release coach workspace; it is never safe to render
    // that data while we wait for the server-issued player release.
    const authUser = await waitForAuthStartup();
    if (authUser?.role === "player") {
      storageManager?.preparePlayerDeviceForUser?.(authUser);
    }
    const needsPlayerRelease = authUser?.role === "player" &&
      !(storageManager?.hasPlayerReleaseCacheForTeam?.(authUser.teamId));
    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage(needsPlayerRelease ? "Checking latest coach update..." : "Checking saved data...");
    }
    if (typeof appDiagnostics !== "undefined") {
      appDiagnostics.measure("startup:migrations", () => runMigrations());
    } else {
      runMigrations();
    }

    let storedPlaybook = needsPlayerRelease
      ? null
      : typeof appDiagnostics !== "undefined"
        ? await appDiagnostics.measure("startup:get-playbook", () => storageManager.getPlaybook())
        : await storageManager.getPlaybook();
    if (!needsPlayerRelease) {
      const bootstrap = () => waitForStaffWorkspaceBootstrap(authUser);
      if (typeof appDiagnostics !== "undefined") {
        await appDiagnostics.measure("startup:staff-workspace", bootstrap);
      } else {
        await bootstrap();
      }
      storedPlaybook = await storageManager.getPlaybook();
    }
    // Storage compaction (LZ recompress + expired-draft cleanup) is opportunistic
    // maintenance; keep it off the first-paint critical path.
    if (window.appStartup && typeof window.appStartup.queueTask === "function") {
      window.appStartup.queueTask(
        "compact-local-storage",
        () => storageManager.compactLocalStorage({ removeExpiredDrafts: true }),
        { delay: 1500, priority: 40 },
      );
    } else {
      storageManager.compactLocalStorage({ removeExpiredDrafts: true });
    }
    // Quiz surfaces (~346KB across nine files) are deferred off the eager
    // shell. Preload them after first paint so coach quiz tabs open instantly
    // and player homework/hub surfaces hydrate. Bridges in feature-loader cover
    // any quiz interaction that happens before this finishes.
    if (window.appStartup && typeof window.appStartup.queueTask === "function") {
      window.appStartup.queueTask("preload-quiz-suite", () => _preloadQuizSuite(), {
        delay: 1200,
        priority: 30,
      });
    } else {
      void _preloadQuizSuite();
    }
    if (hasUsableStoredPlaybook(storedPlaybook)) {
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

async function _preloadQuizSuite() {
  try {
    if (typeof whenAuthReady === "function") {
      try {
        await whenAuthReady();
      } catch (_) {
        /* proceed with best-effort role; a failed auth check still lets
           coaches use the quiz tab once the bundle loads */
      }
    }
    if (typeof window.loadQuizSuite !== "function") return;
    await window.loadQuizSuite();
    // Re-render surfaces whose quiz widgets rendered empty before the bundle
    // finished loading (guards returned "" while the functions were undefined).
    if (document.body?.dataset?.authRole === "player") {
      if (typeof _refreshPlayerTeamSurfaces === "function") {
        _refreshPlayerTeamSurfaces();
      }
    } else if (
      document.getElementById("quiz")?.classList.contains("active") &&
      typeof renderQuizPage === "function"
    ) {
      renderQuizPage();
    }
  } catch (err) {
    console.warn("Quiz suite preload failed:", err);
  }
}

function exportBackup() {
  exportCompleteBackup();
}

function importBackup(event) {
  importCompleteBackup(event);
}

document.addEventListener("DOMContentLoaded", initApp);
