function initWristband() {
  try {
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("init start", { action: "initWristband" });
    }
    if (wristbandCards.length === 0) {
      wristbandCards = [{ name: "Card 1", data: Array(CELLS_PER_CARD).fill(null) }];
    }
    currentCardIndex = 0;
    initCellMarkerPalette();
    populateWristbandCheckboxFilters();
    populateWbPersonnelDatalist();
    populateWbPreShiftDatalist();
    refreshWristbandEditorView();
    loadSavedWristbandsList();
    initSortCriteria();
    setWristbandMobileView(wbMobileView);
    updateWristbandSaveChrome();
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("init complete", { action: "initWristband" });
    }
  } catch (err) {
    if (typeof traceWristbandAction === "function") {
      traceWristbandAction("init error", {
        action: "initWristband",
        error: err && err.message ? err.message : String(err),
      }, "error");
    }
    console.error("initWristband error:", err);
    showToast("❌ Error initializing wristband.", {
      duration: 3000,
      type: "error",
    });
  }
}

let wristbandPlayFilterTimer = null;

function scheduleWristbandPlayFilter() {
  clearTimeout(wristbandPlayFilterTimer);
  resetWristbandLibraryLimit();
  wristbandPlayFilterTimer = setTimeout(() => {
    wristbandPlayFilterTimer = null;
    renderWristbandPlays();
  }, 120);
}

function populateWristbandCheckboxFilters() {
  const tempos = [
    ...new Set(plays.map((p) => p.tempo).filter((t) => t && t.trim())),
  ].sort();
  const personnel = [
    ...new Set(plays.map((p) => p.personnel).filter((p) => p && p.trim())),
  ].sort();

  buildCheckboxFilterGroup(
    "wbTempoFilters",
    tempos,
    "tempo",
    "toggleWbCheckbox",
  );
  buildCheckboxFilterGroup(
    "wbPersonnelFilters",
    personnel,
    "personnel",
    "toggleWbCheckbox",
  );
}

function toggleWbCheckbox(el) {
  const label = el.closest("[data-action='toggleWbCheckbox']") || el;
  const filterType = label.dataset.filterType;
  const value = label.dataset.filterValue;
  const checkbox = label.querySelector('input[type="checkbox"]');
  checkbox.checked = !checkbox.checked;
  label.classList.toggle("checked", checkbox.checked);

  if (filterType === "tempo") {
    if (checkbox.checked) {
      wbSelectedTempos.push(value);
    } else {
      wbSelectedTempos = wbSelectedTempos.filter((tempo) => tempo !== value);
    }
  } else if (filterType === "personnel") {
    if (checkbox.checked) {
      wbSelectedPersonnel.push(value);
    } else {
      wbSelectedPersonnel = wbSelectedPersonnel.filter((personnel) => personnel !== value);
    }
  }

  filterWristbandPlays();
  updateWbActiveFilterCount();
}

function getWristbandFilterState(opts = {}) {
  const searchInputId = opts.searchInputId || "wbSearchPlay";
  const type = document.getElementById("wbFilterType")?.value || "";
  const rawSearch = document.getElementById(searchInputId)?.value || "";

  return {
    type,
    search: rawSearch.toLowerCase().trim(),
    selectedTempos: [...new Set(wbSelectedTempos)],
    selectedPersonnel: [...new Set(wbSelectedPersonnel)],
  };
}

function syncWristbandFilterUi(filterState = getWristbandFilterState()) {
  const clearBtn = document.getElementById("clearWbSearch");
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", !filterState.search);
  }

  const activeCount =
    filterState.selectedPersonnel.length +
    filterState.selectedTempos.length +
    (filterState.type ? 1 : 0) +
    (filterState.search ? 1 : 0);

  const badge = document.getElementById("wbActiveFilterCount");
  if (!badge) return;

  if (activeCount > 0) {
    badge.textContent = `${activeCount} active`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function matchesWristbandPlayFilters(play, filterState, opts = {}) {
  if (!play) return false;

  if (filterState.type && play.type !== filterState.type) return false;

  if (
    filterState.selectedTempos.length > 0 &&
    !filterState.selectedTempos.includes(play.tempo)
  ) {
    return false;
  }

  if (
    filterState.selectedPersonnel.length > 0 &&
    !filterState.selectedPersonnel.includes(play.personnel)
  ) {
    return false;
  }

  if (!filterState.search) return true;

  if (opts.searchMode === "fullCall") {
    return getFullCall(play).toLowerCase().includes(filterState.search);
  }

  const searchFields = [
    play.play,
    play.formation,
    play.protection,
    play.personnel,
    play.type,
    play.oneWord,
    play.basePlay,
    play.lineCall,
    play.playTag1,
    play.playTag2,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return searchFields.some((value) => value.includes(filterState.search));
}

function filterWristbandPlays() {
  resetWristbandLibraryLimit();
  renderWristbandPlays();
}

function clearWbSearch() {
  const input = document.getElementById("wbSearchPlay");
  if (input) input.value = "";
  filterWristbandPlays();
}

function getWristbandPlayUsageMap() {
  const usage = new Map();
  const cellsPerCard = getActiveWristbandCellCount();
  wristbandCards.forEach((card) => {
    (card?.data || []).slice(0, cellsPerCard).forEach((play) => {
      if (!play) return;
      const signature = playSignature(play);
      usage.set(signature, (usage.get(signature) || 0) + 1);
    });
  });
  return usage;
}

function setWbLibraryQuickFilter(filterName) {
  const allowed = new Set(["all", "pinned", "recent", "not-on-card"]);
  wbLibraryQuickFilter = allowed.has(filterName) ? filterName : "all";
  resetWristbandLibraryLimit();
  document.querySelectorAll("[data-wb-library-filter]").forEach((button) => {
    const active = button.dataset.wbLibraryFilter === wbLibraryQuickFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  renderWristbandPlays();
}

function loadMoreWristbandPlays() {
  wbLibraryLimit += WB_LIBRARY_PAGE_SIZE;
  renderWristbandPlays();
}

function handleWbPreventDuplicatesChange() {
  const control = document.getElementById("wbPreventDuplicates");
  wbPreventDuplicates = control ? control.checked : true;
  renderWristbandPlays();
}

function setWristbandMobileView(viewName) {
  wbMobileView = viewName === "library" ? "library" : "builder";
  const panel = document.getElementById("wristband");
  if (panel) {
    panel.classList.toggle("wb-mobile-view-library", wbMobileView === "library");
    panel.classList.toggle("wb-mobile-view-builder", wbMobileView === "builder");
  }
  document.querySelectorAll("[data-wb-mobile-view]").forEach((button) => {
    const active = button.dataset.wbMobileView === wbMobileView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function renderWristbandPlays() {
  const filterState = getWristbandFilterState();
  syncWristbandFilterUi(filterState);
  const favoriteSet = new Set(wbFavorites);
  const recentSet = new Set(wbRecentPlayIndexes);
  const recentOrder = new Map(
    wbRecentPlayIndexes.map((playIndex, order) => [playIndex, order]),
  );
  const usageMap = getWristbandPlayUsageMap();
  const displayOptions = getWristbandDisplayOptions();

  const filtered = plays
    .map((play, index) => ({ play, index }))
    .filter(({ play, index }) => {
      if (!matchesWristbandPlayFilters(play, filterState)) return false;
      if (wbLibraryQuickFilter === "pinned") return favoriteSet.has(index);
      if (wbLibraryQuickFilter === "recent") return recentSet.has(index);
      if (wbLibraryQuickFilter === "not-on-card") {
        return !usageMap.has(playSignature(play));
      }
      return true;
    });

  filtered.sort((left, right) => {
    if (wbLibraryQuickFilter === "recent") {
      return (
        (recentOrder.get(left.index) ?? Number.MAX_SAFE_INTEGER) -
        (recentOrder.get(right.index) ?? Number.MAX_SAFE_INTEGER)
      );
    }
    const leftFav = favoriteSet.has(left.index);
    const rightFav = favoriteSet.has(right.index);
    if (leftFav && !rightFav) return -1;
    if (!leftFav && rightFav) return 1;
    return left.index - right.index;
  });

  const container = document.getElementById("wbAvailablePlays");
  if (!container) return;
  const visible = filtered.slice(0, wbLibraryLimit);
  container.innerHTML = visible
    .map(({ play, index }) => {
      const isFav = favoriteSet.has(index);
      const onCardCount = usageMap.get(playSignature(play)) || 0;
      const duplicateBlocked = wbPreventDuplicates && onCardCount > 0;
      const emoji =
        displayOptions.showEmoji && play.personnel
          ? `${getPersonnelEmoji(play.personnel, displayOptions.useSquares)} `
          : "";
      const lineCallDisplay = play.lineCall
        ? ` [${escapeHtml(play.lineCall)}]`
        : "";
      return `
        <div class="play-item wb-play-item wb-library-row app-library-row" data-play-idx="${index}" title="Double-click to add to the next empty cell">
          <button class="wb-pin-btn${isFav ? " pinned" : ""}" data-action="toggleWbFavorite" data-idx="${index}" title="${isFav ? "Unpin" : "Pin"} play" aria-label="${isFav ? "Unpin" : "Pin"} play" aria-pressed="${isFav}">★</button>
          <div class="play-info">
            <div class="play-name">${emoji}${escapeHtml(play.formation)} ${escapeHtml(play.protection)} ${escapeHtml(play.play)}</div>
            <div class="play-details">${play.type ? `<span class="wb-type-chip" data-type="${escapeHtml(play.type.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, ""))}">${escapeHtml(play.type)}</span> ` : ""}${escapeHtml([play.personnel].filter(Boolean).join(" · "))}${lineCallDisplay}
              ${onCardCount > 0 ? `<span class="wb-on-card-badge">On card${onCardCount > 1 ? ` ×${onCardCount}` : ""}</span>` : ""}
            </div>
          </div>
          <button class="wb-add-play-btn${duplicateBlocked ? " duplicate-blocked" : ""}" data-action="addPlayToNextEmpty" data-arg="${index}"
            title="${duplicateBlocked ? "Already on a card. Select to add another copy." : "Add to next empty cell"}"
            aria-label="Add ${escapeHtml(play.play || "play")} to next empty cell">${duplicateBlocked ? "Added" : "Add"}</button>
        </div>
      `;
    })
    .join("");
  if (visible.length === 0) {
    container.innerHTML =
      '<div class="wb-avail-empty">No plays match the current search and filters.</div>';
  }

  const playCount = document.getElementById("wbPlayCount");
  if (playCount) playCount.textContent = filtered.length;
  const status = document.getElementById("wbLibraryStatus");
  if (status) {
    status.textContent =
      filtered.length > visible.length
        ? `Showing ${visible.length} of ${filtered.length} plays`
        : `${filtered.length} play${filtered.length === 1 ? "" : "s"} available`;
  }
  const loadMoreButton = document.getElementById("wbLoadMore");
  if (loadMoreButton) {
    const remaining = Math.max(0, filtered.length - visible.length);
    loadMoreButton.classList.toggle("hidden", remaining === 0);
    loadMoreButton.textContent =
      remaining > 0
        ? `Load ${Math.min(WB_LIBRARY_PAGE_SIZE, remaining)} more`
        : "All plays loaded";
  }
}

function _addPlayToNextEmpty(playIndex) {
  const play = plays[playIndex];
  if (!play) return;

  const cardData = getCurrentCardData();
  const emptyIdx = cardData
    .slice(0, getActiveWristbandCellCount())
    .findIndex((cell) => cell === null);

  if (emptyIdx === -1) {
    showToast("⚠️ No empty cells! Clear some or switch to another card", {
      type: "warning",
    });
    return;
  }

  saveWristbandState();
  setCurrentCardData(emptyIdx, play);
  recordRecentWristbandPlay(playIndex);
  renderCardTabs();
  renderWristbandGrid();
  renderWristbandPlays();
  setWristbandMobileView("builder");
}

function addPlayToNextEmpty(playIndex, opts = {}) {
  const play = plays[playIndex];
  if (!play) return;
  const isDuplicate = getWristbandPlayUsageMap().has(playSignature(play));
  if (wbPreventDuplicates && isDuplicate && !opts.forceDuplicate) {
    showToast("This play is already on a wristband card.", {
      type: "warning",
      duration: 5000,
      actionLabel: "Add anyway",
      action: () => _addPlayToNextEmpty(playIndex),
    });
    return;
  }
  _addPlayToNextEmpty(playIndex);
}

function toggleWbFiltersCollapse() {
  const container = document.getElementById("wbFiltersContainer");
  const btn = document.getElementById("toggleWbFiltersBtn");
  wbFiltersCollapsed = !wbFiltersCollapsed;

  if (wbFiltersCollapsed) {
    container.classList.add("collapsed");
    btn.textContent = "Filters";
    btn.setAttribute("aria-expanded", "false");
    btn.title = "Show play filters";
  } else {
    container.classList.remove("collapsed");
    btn.textContent = "Hide Filters";
    btn.setAttribute("aria-expanded", "true");
    btn.title = "Hide play filters";
  }
}

function clearAllWbFilters() {
  wbSelectedPersonnel = [];
  wbSelectedTempos = [];
  document
    .querySelectorAll("#wbPersonnelFilters label, #wbTempoFilters label")
    .forEach((label) => {
      label.classList.remove("checked");
      const checkbox = label.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = false;
    });
  const typeFilter = document.getElementById("wbFilterType");
  if (typeFilter) typeFilter.value = "";
  const searchBox = document.getElementById("wbSearchPlay");
  if (searchBox) searchBox.value = "";
  setWbLibraryQuickFilter("all");
  filterWristbandPlays();
  updateWbActiveFilterCount();
}

function updateWbActiveFilterCount() {
  syncWristbandFilterUi();
}

function updateWbStats() {
  const cardsEl = document.getElementById("wbStatCards");
  const playsEl = document.getElementById("wbStatPlays");
  const emptyEl = document.getElementById("wbStatEmpty");
  const runEl = document.getElementById("wbStatRun");
  const passEl = document.getElementById("wbStatPass");
  const formatEl = document.getElementById("wbStatFormat");

  if (!cardsEl) return;

  let totalPlays = 0;
  let totalEmpty = 0;
  let runCount = 0;
  let passCount = 0;
  const activeCellCount = getActiveWristbandCellCount();

  wristbandCards.forEach((card) => {
    const cells = (card.data || card || []).slice(0, activeCellCount);
    cells.forEach((cell) => {
      if (cell) {
        totalPlays += 1;
        const type = (cell.type || "").toLowerCase();
        if (type === "run") runCount += 1;
        else if (type === "pass" || type === "play action" || type === "screen") {
          passCount += 1;
        }
      } else {
        totalEmpty += 1;
      }
    });
  });

  cardsEl.textContent = wristbandCards.length;
  playsEl.textContent = totalPlays;
  emptyEl.textContent = totalEmpty;
  runEl.textContent = runCount;
  passEl.textContent = passCount;
  if (formatEl) formatEl.textContent = WRISTBAND_PRINT_SIZE_LABEL;
}
