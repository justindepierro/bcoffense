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
      initCollections();
      initPlaybookKeyboard();

      if (currentActiveTab === "script") {
        ensureScriptWorkspaceReady();
      }
      if (currentActiveTab === "signals" && typeof initSignals === "function") {
        initSignals();
      }

      updateTabBadges();

      // For coach/admin: if this device has local play images, prompt to sync.
      // Gives a visible, actionable toast instead of a silent background push.
      if (
        typeof canEditUser === "function" &&
        canEditUser() &&
        window.playImages &&
        typeof window.playImages.loadKeys === "function"
      ) {
        window.playImages.loadKeys().then((keys) => {
          if (currentActiveTab === "gameplan" && typeof requestRenderGamePlan === "function") {
            requestRenderGamePlan();
          }
          if (
            ["playbook", "script", "gameplan"].includes(currentActiveTab) &&
            typeof refreshPlayReadinessSurfaces === "function"
          ) {
            refreshPlayReadinessSurfaces("play-images");
          }
          if (!keys.length) return;
          if (typeof showToast === "function") {
            showToast(
              `${keys.length} play diagram${keys.length === 1 ? "" : "s"} found on this device — sync so players can view them`,
              {
                duration: 15000,
                actionLabel: "Sync Now",
                action: () => {
                  if (typeof syncPlayImagesToCloud === "function") {
                    syncPlayImagesToCloud();
                  }
                },
              },
            );
          }
        }).catch(() => { });
      }
    },
    { timeout: 2000 },
  );
}
