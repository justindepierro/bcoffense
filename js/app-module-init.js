let scriptWorkspaceNeedsInit = true;
let tendenciesNeedsInit = true;
let callSheetNeedsInit = true;

function ensureScriptWorkspaceReady(force = false) {
  if (typeof initScriptWorkspace !== "function") return;
  if (!force && !scriptWorkspaceNeedsInit) return;

  initScriptWorkspace();
  scriptWorkspaceNeedsInit = false;
}

function ensureTendenciesReady(force = false) {
  if (typeof initTendencies !== "function") return;
  if (!force && !tendenciesNeedsInit) return;

  initTendencies();
  tendenciesNeedsInit = false;
}

function ensureCallSheetReady(force = false) {
  if (typeof initCallSheet !== "function") return;
  const hasCallSheetData =
    typeof callSheet !== "undefined" &&
    callSheet &&
    Object.keys(callSheet).length > 0;
  if (!force && !callSheetNeedsInit && hasCallSheetData) return;

  initCallSheet();
  callSheetNeedsInit = false;
}

function initAllModules() {
  const tableBody = document.querySelector("#playbookTable tbody");
  if (tableBody && tableBody.children.length === 0) {
    if (typeof renderPlaybookLoadingState === "function") {
      renderPlaybookLoadingState("Restoring playbook...");
    } else {
      tableBody.innerHTML = Array(8)
        .fill('<tr><td colspan="11"><div class="skeleton-row"></div></td></tr>')
        .join("");
    }
  }
  if (currentActiveTab === "dashboard" && typeof renderDashboardLoadingState === "function") {
    renderDashboardLoadingState("Restoring dashboard...");
  }

  populateFilters();
  initChipListeners();
  if (typeof initPlaybookSearch === "function") initPlaybookSearch();
  if (typeof restorePlaybookState === "function") restorePlaybookState();
  restoreColumnVisibility();
  filterPlays();
  scriptWorkspaceNeedsInit = true;
  tendenciesNeedsInit = true;
  callSheetNeedsInit = true;

  // Sync the game-week bar with stored state (runs on every session restore).
  if (typeof updateGameWeekBar === "function") updateGameWeekBar();

  const idle =
    typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (callback) => setTimeout(callback, 50);

  idle(
    () => {
      // Keep player-published script snapshots aligned with the canonical
      // play media IDs. The normal cloud auto-publish path distributes any
      // repaired snapshot without requiring a separate coach action.
      if (typeof hydratePlayerScriptMediaIds === "function") {
        hydratePlayerScriptMediaIds();
      }
      initCollections();
      initPlaybookKeyboard();

      if (currentActiveTab === "script") {
        ensureScriptWorkspaceReady();
      }
      if (currentActiveTab === "signals" && typeof initSignals === "function") {
        initSignals();
      }

      updateTabBadges();

      // Warm local diagram keys and refresh readiness surfaces without pushing
      // coaches into the advanced recovery upload flow.
      const runPlayImageKeyScan = () => {
        if (
          typeof canEditUser !== "function" ||
          !canEditUser() ||
          !window.playImages ||
          typeof window.playImages.loadKeys !== "function"
        ) {
          return false;
        }
        return window.playImages.loadKeys().then(() => {
          if (currentActiveTab === "gameplan" && typeof requestRenderGamePlan === "function") {
            requestRenderGamePlan();
          }
          if (
            ["playbook", "script", "gameplan"].includes(currentActiveTab) &&
            typeof refreshPlayReadinessSurfaces === "function"
          ) {
            refreshPlayReadinessSurfaces("play-images");
          }
        }).catch(() => { });
      };
      if (window.appStartup && typeof window.appStartup.queueTask === "function") {
        window.appStartup.queueTask("play-image-key-scan", runPlayImageKeyScan, {
          delay: 1000,
          priority: 80,
        });
      } else {
        runPlayImageKeyScan();
      }
    },
    { timeout: 2000 },
  );
}
