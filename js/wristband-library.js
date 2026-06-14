function initWristband() {
  try {
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
  } catch (err) {
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
  renderWristbandPlays();
}

function clearWbSearch() {
  const input = document.getElementById("wbSearchPlay");
  if (input) input.value = "";
  filterWristbandPlays();
}

function renderWristbandPlays() {
  const filterState = getWristbandFilterState();
  syncWristbandFilterUi(filterState);
  const favoriteSet = new Set(wbFavorites);
  const displayOptions = getWristbandDisplayOptions();

  const filtered = plays
    .map((play, index) => ({ play, index }))
    .filter(({ play }) => matchesWristbandPlayFilters(play, filterState));

  filtered.sort((left, right) => {
    const leftFav = favoriteSet.has(left.index);
    const rightFav = favoriteSet.has(right.index);
    if (leftFav && !rightFav) return -1;
    if (!leftFav && rightFav) return 1;
    return left.index - right.index;
  });

  const container = document.getElementById("wbAvailablePlays");
  if (!container) return;
  const visible = filtered.slice(0, PICKER_LIMIT);
  container.innerHTML = visible
    .map(({ play, index }) => {
      const isFav = favoriteSet.has(index);
      const emoji =
        displayOptions.showEmoji && play.personnel
          ? `${getPersonnelEmoji(play.personnel, displayOptions.useSquares)} `
          : "";
      const lineCallDisplay = play.lineCall
        ? ` [${escapeHtml(play.lineCall)}]`
        : "";
      return `
        <div class="play-item wb-play-item" data-play-idx="${index}" title="Double-click to add to the next empty cell">
          <button class="wb-pin-btn${isFav ? " pinned" : ""}" data-action="toggleWbFavorite" data-idx="${index}" title="${isFav ? "Unpin" : "Pin"} play" aria-label="${isFav ? "Unpin" : "Pin"} play" aria-pressed="${isFav}">★</button>
          <div class="play-info">
            <div class="play-name">${emoji}${escapeHtml(play.formation)} ${escapeHtml(play.protection)} ${escapeHtml(play.play)}</div>
            <div class="play-details">${escapeHtml([play.personnel, play.type].filter(Boolean).join(" · "))}${lineCallDisplay}</div>
          </div>
          <button class="wb-add-play-btn" data-action="addPlayToNextEmpty" data-arg="${index}"
            title="Add to next empty cell" aria-label="Add ${escapeHtml(play.play || "play")} to next empty cell">Add</button>
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
      filtered.length > PICKER_LIMIT
        ? `Showing ${PICKER_LIMIT} of ${filtered.length}. Refine the search to narrow the list.`
        : `${filtered.length} play${filtered.length === 1 ? "" : "s"} available`;
  }
}

function addPlayToNextEmpty(playIndex) {
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
  renderCardTabs();
  renderWristbandGrid();
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
