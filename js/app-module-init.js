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

      // Push any locally-stored play images to R2 so players can access them.
      // Runs once per session, coach/admin only, fire-and-forget.
      if (
        typeof canEditUser === "function" &&
        canEditUser() &&
        window.playImages &&
        typeof window.playImages.syncToRemote === "function"
      ) {
        window.playImages.syncToRemote(plays).catch(() => {});
      }
    },
    { timeout: 2000 },
  );
}