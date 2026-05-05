let highlightedWristbandPlays = [];

function highlightWristbandPlays() {
  const select = document.getElementById("playbookWristbandHighlight");
  const wbIdx = select.value;

  if (wbIdx === "") {
    highlightedWristbandPlays = [];
    renderPlaybook();
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved[parseInt(wbIdx, 10)];

  if (!wb || !wb.cards) {
    highlightedWristbandPlays = [];
    renderPlaybook();
    return;
  }

  highlightedWristbandPlays = [];
  wb.cards.forEach((card) => {
    card.data.forEach((play) => {
      if (play !== null) {
        highlightedWristbandPlays.push(play);
      }
    });
  });

  renderPlaybook();
}

function isPlayOnHighlightedWristband(play) {
  if (highlightedWristbandPlays.length === 0) return false;

  return highlightedWristbandPlays.some((wbPlay) => playsMatch(play, wbPlay));
}

const _debouncedFilterPlays = debounce(filterPlays, 150);

function debouncedFilterPlays() {
  _debouncedFilterPlays();
}

function filterPlays() {
  const activeTypes = activeTypeChips;
  const activePersonnel = activePersonnelChips;

  const formation = document.getElementById("filterFormation")?.value || "";
  const basePlay = document.getElementById("filterBasePlay")?.value || "";
  const back = document.getElementById("pbFilterBack")?.value || "";
  const motion = document.getElementById("pbFilterMotion")?.value || "";
  const protection = document.getElementById("pbFilterProtection")?.value || "";
  const tempo = document.getElementById("pbFilterTempo")?.value || "";
  const search =
    document.getElementById("searchPlay")?.value?.toLowerCase() || "";

  const gamePlanOnly =
    document.getElementById("pbGamePlanFilter")?.checked || false;
  const gameWeek = getGameWeek();
  _updateGamePlanFilterBar();

  filteredPlays = plays.filter((play) => {
    if (gamePlanOnly && gameWeek.opponentName) {
      if (!isPlayTaggedForOpponent(play, gameWeek.opponentName)) return false;
    }
    if (activeTypes.size > 0 && !activeTypes.has(play.type)) return false;
    if (activePersonnel.size > 0 && !activePersonnel.has(play.personnel)) {
      return false;
    }
    if (
      typeof activePictureChips !== "undefined" &&
      activePictureChips.size > 0 &&
      typeof isVisionMode === "function" &&
      isVisionMode() &&
      typeof getPlayPicture === "function"
    ) {
      const pic = getPlayPicture(play);
      if (!pic || !activePictureChips.has(pic)) return false;
    }
    if (formation && play.formation !== formation) return false;
    if (basePlay && play.basePlay !== basePlay) return false;
    if (back && play.back !== back) return false;
    if (motion && play.motion !== motion) return false;
    if (protection && play.protection !== protection) return false;
    if (tempo && play.tempo !== tempo) return false;
    if (search) {
      const searchFields = [
        play.play,
        play.formation,
        play.protection,
        play.motion,
        play.shift,
        play.back,
        play.basePlay,
        play.personnel,
        play.type,
        play.tempo,
      ]
        .join(" ")
        .toLowerCase();
      if (!searchFields.includes(search)) return false;
    }
    return true;
  });

  applyCurrentSort();
  renderPlaybook();
  savePlaybookState();
  updateActiveFilterBar();
  const clearBtn = document.getElementById("clearPbSearch");
  if (clearBtn) clearBtn.style.display = search ? "flex" : "none";
}

function _updateGamePlanFilterBar() {
  const bar = document.getElementById("pbGamePlanBar");
  const oppLabel = document.getElementById("pbGamePlanOpp");
  const gameWeek = getGameWeek();
  if (bar) {
    bar.style.display = gameWeek.opponentName ? "" : "none";
  }
  if (oppLabel) {
    oppLabel.textContent = gameWeek.opponentName
      ? `vs ${gameWeek.opponentName}`
      : "";
  }
}

function clearFilters() {
  activeTypeChips.clear();
  activePersonnelChips.clear();
  document
    .querySelectorAll(".pb-chip.active")
    .forEach((chip) => chip.classList.remove("active"));

  const gpFilter = document.getElementById("pbGamePlanFilter");
  if (gpFilter) gpFilter.checked = false;

  [
    "filterFormation",
    "filterBasePlay",
    "pbFilterBack",
    "pbFilterMotion",
    "pbFilterProtection",
    "pbFilterTempo",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const search = document.getElementById("searchPlay");
  if (search) search.value = "";
  const clearBtn = document.getElementById("clearPbSearch");
  if (clearBtn) clearBtn.style.display = "none";

  currentSortColumn = null;
  currentSortDirection = "asc";
  secondarySortColumn = null;
  secondarySortDirection = "asc";
  selectedRowIndex = -1;
  _syncSortUI();

  storageManager.remove(STORAGE_KEYS.PLAYBOOK_STATE);

  filteredPlays = [...plays];
  renderPlaybook();
  updateActiveFilterBar();
}

function clearAllFilters() {
  clearFilters();
}

function clearPbSearch() {
  const input = document.getElementById("searchPlay");
  if (input) input.value = "";
  const clearBtn = document.getElementById("clearPbSearch");
  if (clearBtn) clearBtn.style.display = "none";
  filterPlays();
}

function initPlaybookSearch() {
  const input = document.getElementById("searchPlay");
  if (!input || input.dataset.searchBound === "true") return;

  input.addEventListener("input", () => {
    debouncedFilterPlays();
  });

  input.dataset.searchBound = "true";
}

function updateActiveFilterBar() {
  const bar = document.getElementById("pbActiveBar");
  const pills = document.getElementById("pbActivePills");
  const clearBtn = document.getElementById("pbClearAll");
  if (!bar || !pills) return;

  const parts = [];

  activeTypeChips.forEach((value) => {
    parts.push({ label: value, layer: "type", value });
  });
  activePersonnelChips.forEach((value) => {
    parts.push({ label: `Personnel: ${value}`, layer: "personnel", value });
  });

  [
    { id: "filterFormation", prefix: "Formation" },
    { id: "filterBasePlay", prefix: "Base Play" },
    { id: "pbFilterBack", prefix: "Back" },
    { id: "pbFilterMotion", prefix: "Motion" },
    { id: "pbFilterProtection", prefix: "Protection" },
    { id: "pbFilterTempo", prefix: "Tempo" },
  ].forEach(({ id, prefix }) => {
    const value = document.getElementById(id)?.value;
    if (value) {
      parts.push({ label: `${prefix}: ${value}`, layer: id, value });
    }
  });

  const search = document.getElementById("searchPlay")?.value;
  if (search) {
    parts.push({ label: `"${search}"`, layer: "search", value: search });
  }

  if (parts.length === 0) {
    if (clearBtn) clearBtn.style.display = "none";
    pills.innerHTML = "";
    return;
  }

  if (clearBtn) clearBtn.style.display = "";
  pills.innerHTML = parts
    .map(
      (part) =>
        `<span class="pb-pill" data-layer="${part.layer}" data-value="${escapeHtml(part.value)}">${escapeHtml(part.label)} <button data-action="removeFilter" data-layer="${part.layer}" data-filter-value="${escapeHtml(part.value)}">&times;</button></span>`,
    )
    .join("");
}

function removeFilter(layer, value) {
  if (layer === "type") {
    activeTypeChips.delete(value);
    const chip = document.querySelector(
      `#pbChipsType .pb-chip[data-value="${value}"]`,
    );
    if (chip) chip.classList.remove("active");
  } else if (layer === "personnel") {
    activePersonnelChips.delete(value);
    const chip = document.querySelector(
      `#pbChipsPersonnel .pb-chip[data-value="${value}"]`,
    );
    if (chip) chip.classList.remove("active");
  } else if (layer === "search") {
    const el = document.getElementById("searchPlay");
    if (el) el.value = "";
  } else {
    const el = document.getElementById(layer);
    if (el) el.value = "";
  }
  filterPlays();
}