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

  const idle =
    typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (callback) => setTimeout(callback, 50);

  idle(
    () => {
      initCollections();
      initPlaybookKeyboard();
      renderAvailablePlays();
      loadSavedScriptsList();
      populateScriptWristbandSelect();
      restoreScriptDisplayOptions();
      ensureFirstPeriod();
      renderScript();

      const storedCallSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
      if (storedCallSheet) {
        callSheet = storedCallSheet;
      }

      updateTabBadges();
    },
    { timeout: 2000 },
  );
}