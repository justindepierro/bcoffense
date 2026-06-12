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
    clearBtn.style.display = filterState.search ? "flex" : "none";
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

  const searchFields = [play.play, play.formation, play.protection]
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

  let filtered = plays.filter((play) =>
    matchesWristbandPlayFilters(play, filterState),
  );

  filtered.sort((left, right) => {
    const leftFav = wbFavorites.includes(plays.indexOf(left));
    const rightFav = wbFavorites.includes(plays.indexOf(right));
    if (leftFav && !rightFav) return -1;
    if (!leftFav && rightFav) return 1;
    return 0;
  });

  const container = document.getElementById("wbAvailablePlays");
  container.innerHTML = filtered
    .map((play) => {
      const idx = plays.indexOf(play);
      const isFav = wbFavorites.includes(idx);
      const showEmoji = document.getElementById("wbShowEmoji")?.checked || false;
      const useSquares = document.getElementById("wbUseSquares")?.checked || false;
      const emoji =
        showEmoji && play.personnel
          ? `${getPersonnelEmoji(play.personnel, useSquares)} `
          : "";
      const lineCallDisplay = play.lineCall ? ` [${play.lineCall}]` : "";
      return `
        <div class="play-item wb-play-item" data-play-idx="${idx}" title="Double-click to add to next empty cell">
          <button class="wb-pin-btn${isFav ? " active" : ""}" data-action="toggleWbFavorite" data-idx="${idx}" title="${isFav ? "Unpin" : "Pin"} play" aria-label="${isFav ? "Unpin" : "Pin"} play">★</button>
          <div class="play-info">
            <div class="play-name">${emoji}${escapeHtml(play.formation)} ${escapeHtml(play.protection)} ${escapeHtml(play.play)}</div>
            <div class="play-details">${escapeHtml(play.type)}${lineCallDisplay}</div>
          </div>
        </div>
      `;
    })
    .join("");
  document.getElementById("wbPlayCount").textContent = filtered.length;
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
    btn.innerHTML = "🔽 Filters";
  } else {
    container.classList.remove("collapsed");
    btn.innerHTML = "🔼 Filters";
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

  wristbandCards.forEach((card) => {
    const cells = (card.data || card || []).slice(0, getActiveWristbandCellCount());
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
