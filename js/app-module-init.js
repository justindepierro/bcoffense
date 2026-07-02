let scriptWorkspaceNeedsInit = true;

function ensureScriptWorkspaceReady(force = false) {
  if (typeof initScriptWorkspace !== "function") return;
  if (!force && !scriptWorkspaceNeedsInit) return;

  initScriptWorkspace();
  scriptWorkspaceNeedsInit = false;
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
  if (typeof restorePlaybookState === "function") restorePlaybookState();
  restoreColumnVisibility();
  filterPlays();
  scriptWorkspaceNeedsInit = true;

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
        }).catch(() => {});
      }
    },
    { timeout: 2000 },
  );
}