const AVAIL_PER_PAGE = 50;
let scriptAvailPage = 0;

const debouncedRenderAvailablePlays = debounce(() => {
  _scheduleRenderAvailable();
}, 180);

function normalizeSelectedAvailablePlays() {
  selectedAvailablePlays = [...new Set(selectedAvailablePlays)]
    .map((idx) => parseInt(idx, 10))
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < plays.length);
}

function updateAvailableActionsUI(filteredCount = 0, pageCount = 0) {
  normalizeSelectedAvailablePlays();

  const addFilteredBtn = document.getElementById("addAllFilteredBtn");
  const addSelectedBtn = document.getElementById("addSelectedBtn");
  const statusEl = document.getElementById("availableSelectionStatus");
  const selectedCount = selectedAvailablePlays.length;

  if (addFilteredBtn) {
    addFilteredBtn.textContent = `➕ Add Filtered (${filteredCount})`;
    addFilteredBtn.title = `Add all ${filteredCount} filtered plays to script`;
    addFilteredBtn.disabled = filteredCount === 0;
  }

  if (addSelectedBtn) {
    addSelectedBtn.textContent = `✓ Add Selected (${selectedCount})`;
    addSelectedBtn.title =
      selectedCount > 0
        ? `Add ${selectedCount} selected play${selectedCount === 1 ? "" : "s"} to script`
        : "Select plays first";
    addSelectedBtn.disabled = selectedCount === 0;
  }

  if (statusEl) {
    statusEl.textContent =
      selectedCount > 0
        ? `${selectedCount} selected overall • ${pageCount} on this page`
        : `${filteredCount} filtered • ${pageCount} on this page`;
  }
}

function getScriptPlayFilterState() {
  return {
    formation: document.getElementById("scriptFilterFormation")?.value || "",
    basePlay: document.getElementById("scriptFilterBasePlay")?.value || "",
    search:
      document.getElementById("scriptSearchPlay")?.value.toLowerCase() || "",
  };
}

function syncScriptSearchClearButton() {
  const clearBtn = document.getElementById("clearSearchPlay");
  if (!clearBtn) return;
  const { search } = getScriptPlayFilterState();
  clearBtn.classList.toggle("hidden", !search);
}

function syncScriptCheckboxFilterSelections() {
  const selectedByType = {
    type: new Set(scriptSelectedTypes),
    situation: new Set(scriptSelectedSituation),
    down: new Set(scriptSelectedDown),
    distance: new Set(scriptSelectedDistance),
    hash: new Set(scriptSelectedHash),
    fieldPos: new Set(scriptSelectedFieldPos),
    personnel: new Set(scriptSelectedPersonnel),
  };

  document
    .querySelectorAll("#scriptFiltersContainer [data-action='toggleScriptCheckbox']")
    .forEach((label) => {
      const filterType = label.dataset.filterType;
      const filterValue = label.dataset.filterValue;
      const checkbox = label.querySelector('input[type="checkbox"]');
      const isSelected = Boolean(
        selectedByType[filterType] && selectedByType[filterType].has(filterValue),
      );

      if (checkbox) checkbox.checked = isSelected;
      label.classList.toggle("checked", isSelected);
    });
}

function clearAllScriptFilters() {
  scriptSelectedTypes = [];
  scriptSelectedSituation = [];
  scriptSelectedDown = [];
  scriptSelectedDistance = [];
  scriptSelectedHash = [];
  scriptSelectedFieldPos = [];
  scriptSelectedPersonnel = [];

  document.getElementById("scriptFilterFormation").value = "";
  document.getElementById("scriptFilterBasePlay").value = "";
  document.getElementById("scriptSearchPlay").value = "";

  const gpFilter = document.getElementById("scriptGamePlanFilter");
  if (gpFilter) gpFilter.checked = false;
  const jvFilter = document.getElementById("scriptJvFilter");
  if (jvFilter) jvFilter.checked = false;

  document
    .querySelectorAll("#scriptFiltersContainer input[type='checkbox']")
    .forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.parentElement.classList.remove("checked");
    });

  filterScriptPlays();
}

function updateActiveFilterCount() {
  const { formation, basePlay, search } = getScriptPlayFilterState();
  const gamePlanOnly =
    document.getElementById("scriptGamePlanFilter")?.checked || false;
  const jvOnly = document.getElementById("scriptJvFilter")?.checked || false;
  const count =
    scriptSelectedTypes.length +
    scriptSelectedSituation.length +
    scriptSelectedDown.length +
    scriptSelectedDistance.length +
    scriptSelectedHash.length +
    scriptSelectedFieldPos.length +
    scriptSelectedPersonnel.length +
    (formation ? 1 : 0) +
    (basePlay ? 1 : 0) +
    (search ? 1 : 0) +
    (gamePlanOnly ? 1 : 0) +
    (jvOnly ? 1 : 0);

  const badge = document.getElementById("activeFilterCount");
  if (badge) {
    if (count > 0) {
      badge.classList.remove("hidden");
      badge.textContent = `${count} active`;
    } else {
      badge.classList.add("hidden");
      badge.textContent = "";
    }
  }

  const toggleBtn = document.getElementById("toggleFiltersBtn");
  if (toggleBtn) {
    toggleBtn.textContent = count > 0 ? `⚙️ Filters (${count})` : "⚙️ Filters";
    toggleBtn.classList.toggle("has-active-filters", count > 0);
  }
}

function populateScriptCheckboxFilters() {
  const cache = getFilterCache();

  buildCheckboxFilterGroup(
    "scriptTypeFilters",
    cache.types,
    "type",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptSituationFilters",
    cache.situations,
    "situation",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptDownFilters",
    cache.downs,
    "down",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptDistanceFilters",
    cache.distances,
    "distance",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptHashFilters",
    cache.hashes,
    "hash",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptFieldPosFilters",
    cache.fieldPositions,
    "fieldPos",
    "toggleScriptCheckbox",
  );
  buildCheckboxFilterGroup(
    "scriptPersonnelFilters",
    cache.personnels,
    "personnel",
    "toggleScriptCheckbox",
  );
}

function toggleScriptCheckbox(el) {
  const label = el.closest("[data-action='toggleScriptCheckbox']") || el;
  const filterType = label.dataset.filterType;
  const value = label.dataset.filterValue;
  const checkbox = label.querySelector('input[type="checkbox"]');
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  label.classList.toggle("checked", checkbox.checked);

  const filterMap = {
    type: scriptSelectedTypes,
    situation: scriptSelectedSituation,
    down: scriptSelectedDown,
    distance: scriptSelectedDistance,
    hash: scriptSelectedHash,
    fieldPos: scriptSelectedFieldPos,
    personnel: scriptSelectedPersonnel,
  };

  const arr = filterMap[filterType];
  if (arr) {
    if (checkbox.checked) {
      arr.push(value);
    } else {
      const idx = arr.indexOf(value);
      if (idx > -1) arr.splice(idx, 1);
    }
  }

  updateActiveFilterCount();
  filterScriptPlays();
}

function filterScriptPlays() {
  scriptAvailPage = 0;
  syncScriptSearchClearButton();
  updateActiveFilterCount();
  _scheduleRenderAvailable();
}

function handleScriptSearchInput() {
  scriptAvailPage = 0;
  syncScriptSearchClearButton();
  updateActiveFilterCount();
  debouncedRenderAvailablePlays();
}

function clearSearchPlay() {
  const input = document.getElementById("scriptSearchPlay");
  if (input) input.value = "";
  syncScriptSearchClearButton();
  filterScriptPlays();
}

function normalizeScriptSearchText(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function devowelScriptSearchText(value) {
  return normalizeScriptSearchText(value)
    .replace(/[aeiou]/g, "")
    .replace(/\s+/g, "");
}

// WeakMap cache for haystack objects — keyed by play object reference.
// Stores { hash, result } where hash is a quick content fingerprint so
// in-place edits (same object, changed fields) are detected and refreshed.
const _scriptHaystackCache = new WeakMap();

function _scriptPlayHash(play) {
  return `${play.play || ""}|${play.basePlay || ""}|${play.formation || ""}|${play.protection || ""}|${play.motion || ""}|${play.shift || ""}|${play.back || ""}|${play.personnel || ""}|${play.oneWord || ""}|${play.playTag1 || ""}|${play.playTag2 || ""}`;
}

function buildScriptSearchHaystack(play) {
  const currentHash = _scriptPlayHash(play);
  const cached = _scriptHaystackCache.get(play);
  if (cached && cached.hash === currentHash) return cached.result;

  const raw = [
    play.play,
    play.basePlay,
    play.formation,
    play.protection,
    play.motion,
    play.shift,
    play.back,
    play.personnel,
    play.oneWord,
    play.playTag1,
    play.playTag2,
  ]
    .filter(Boolean)
    .join(" ");

  const normalized = normalizeScriptSearchText(raw);
  const result = {
    normalized,
    condensed: normalized.replace(/\s+/g, ""),
    devoweled: devowelScriptSearchText(normalized),
    tokens: normalized.split(/\s+/).filter(Boolean),
  };

  _scriptHaystackCache.set(play, { hash: currentHash, result });
  return result;
}

function playMatchesScriptSearch(play, search) {
  if (!search) return true;

  const normalizedQuery = normalizeScriptSearchText(search);
  if (!normalizedQuery) return true;

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const condensedQuery = normalizedQuery.replace(/\s+/g, "");
  const devoweledQuery = devowelScriptSearchText(normalizedQuery);
  const haystack = buildScriptSearchHaystack(play);

  if (haystack.normalized.includes(normalizedQuery)) return true;
  if (condensedQuery && haystack.condensed.includes(condensedQuery)) return true;
  if (devoweledQuery && haystack.devoweled.includes(devoweledQuery)) return true;

  return queryTokens.every((token) =>
    haystack.tokens.some(
      (candidate) =>
        candidate.includes(token) ||
        candidate.startsWith(token) ||
        token.includes(candidate) ||
        devowelScriptSearchText(candidate).includes(devowelScriptSearchText(token)),
    ) ||
    haystack.condensed.includes(token) ||
    haystack.devoweled.includes(devowelScriptSearchText(token)),
  );
}

function availPagePrev() {
  if (scriptAvailPage > 0) {
    scriptAvailPage--;
    renderAvailablePlays();
  }
}

function availPageNext() {
  scriptAvailPage++;
  renderAvailablePlays();
}

const _AVAIL_TYPE_SLUGS = {
  run: "run",
  "run option": "run",
  pass: "pass",
  "play action": "playaction",
  rpo: "rpo",
  screen: "screen",
  quick: "quick",
  movement: "movement",
};

function availTypeSlug(type) {
  return _AVAIL_TYPE_SLUGS[String(type || "").trim().toLowerCase()] || "default";
}

const _AVAIL_DOWN_ORD = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

// Build the compact, info-dense metadata chips shown under each available play.
// Every value is escaped at the source so the result is safe to inject.
function buildAvailMetaChips(play) {
  const chips = [];
  if (play.personnel) chips.push({ t: escapeHtml(play.personnel), c: "pers" });
  const dd = [];
  if (play.preferredDown)
    dd.push(_AVAIL_DOWN_ORD[String(play.preferredDown)] || escapeHtml(play.preferredDown));
  if (play.preferredDistance) dd.push("&amp; " + escapeHtml(play.preferredDistance));
  if (dd.length) chips.push({ t: dd.join(" "), c: "sit" });
  else if (play.preferredSituation)
    chips.push({ t: escapeHtml(play.preferredSituation), c: "sit" });
  if (play.preferredFieldPosition)
    chips.push({ t: escapeHtml(play.preferredFieldPosition), c: "field" });
  if (play.keyPlayerName1) chips.push({ t: "★ " + escapeHtml(play.keyPlayerName1), c: "player" });
  if (play.motion) chips.push({ t: "↗ " + escapeHtml(play.motion), c: "motion" });
  return chips;
}

function renderAvailablePlays() {
  const { formation, basePlay, search } = getScriptPlayFilterState();
  const gamePlanOnly =
    document.getElementById("scriptGamePlanFilter")?.checked || false;
  const jvOnly =
    document.getElementById("scriptJvFilter")?.checked || false;
  normalizeSelectedAvailablePlays();

  const matchesFilter = (value, selectedArr) => {
    if (selectedArr.length === 0) return true;
    if (!value) return false;
    const normalized =
      value.trim().charAt(0).toUpperCase() +
      value.trim().slice(1).toLowerCase();
    return selectedArr.includes(normalized);
  };

  const filtered = [];
  const filteredIndices = [];
  for (let playIdx = 0; playIdx < plays.length; playIdx += 1) {
    const play = plays[playIdx];
    if (!matchesFilter(play.type, scriptSelectedTypes)) continue;
    if (!matchesFilter(play.preferredSituation, scriptSelectedSituation)) {
      continue;
    }
    if (!matchesFilter(play.preferredDown, scriptSelectedDown)) continue;
    if (!matchesFilter(play.preferredDistance, scriptSelectedDistance)) {
      continue;
    }
    if (!matchesFilter(play.preferredHash, scriptSelectedHash)) continue;
    if (!matchesFilter(play.preferredFieldPosition, scriptSelectedFieldPos)) {
      continue;
    }
    if (!matchesFilter(play.personnel, scriptSelectedPersonnel)) continue;
    if (formation && play.formation !== formation) continue;
    if (basePlay && play.basePlay !== basePlay) continue;
    if (!playMatchesScriptSearch(play, search)) continue;
    if (gamePlanOnly) {
      if (typeof isPlayInGamePlanBoard !== "function") continue;
      if (!isPlayInGamePlanBoard(play)) continue;
    }
    if (jvOnly) {
      if (typeof isPlayFlaggedInGamePlan !== "function") continue;
      if (!isPlayFlaggedInGamePlan(play, "jv")) continue;
    }
    filtered.push(play);
    filteredIndices.push(playIdx);
  }

  const container = document.getElementById("availablePlays");
  currentFilteredPlayIndices = filteredIndices;

  const totalAvail = filtered.length;
  const totalAvailPages = Math.max(1, Math.ceil(totalAvail / AVAIL_PER_PAGE));
  if (scriptAvailPage >= totalAvailPages) scriptAvailPage = totalAvailPages - 1;
  if (scriptAvailPage < 0) scriptAvailPage = 0;
  const availStart = scriptAvailPage * AVAIL_PER_PAGE;
  const pageFiltered = filtered.slice(availStart, availStart + AVAIL_PER_PAGE);
  const pageIndices = filteredIndices.slice(availStart, availStart + AVAIL_PER_PAGE);
  updateAvailableActionsUI(totalAvail, pageFiltered.length);

  if (pageFiltered.length === 0) {
    const activeFilters =
      document.getElementById("activeFilterCount")?.textContent || "0 active";
    const hasSearch = Boolean(search);
    container.innerHTML = `
      <div class="avail-empty-state empty-state empty-state--compact">
        <span class="avail-empty-icon">🔍</span>
        <p class="avail-empty-msg">No plays match the current filters.</p>
        <p class="avail-empty-hint">${activeFilters}${hasSearch ? " • search active" : ""}</p>
        <div class="avail-empty-actions">
          ${hasSearch ? `<button class="btn btn-sm" data-action="clearSearchPlay">Clear Search</button>` : ""}
          <button class="btn btn-sm btn-secondary" data-action="clearAllScriptFilters">Reset Filters</button>
        </div>
      </div>
    `;
    document.getElementById("availablePlayCount").textContent = "0";
    const pagerEl = document.getElementById("availPager");
    if (pagerEl) pagerEl.remove();
    return;
  }

  const inScriptSet = new Set(
    script
      .filter((item) => !item.isSeparator)
      .map((item) => `${item.formation}||${item.protection}||${item.play}`),
  );

  const selectedSet = new Set(selectedAvailablePlays);

  container.innerHTML = pageFiltered
    .map((play, idx) => {
      const playIdx = pageIndices[idx];
      const isSelected = selectedSet.has(playIdx);
      const alreadyIn = inScriptSet.has(
        `${play.formation}||${play.protection}||${play.play}`,
      );
      const typeSlug = availTypeSlug(play.type);
      const callName =
        [play.formation, play.protection, play.play]
          .filter(Boolean)
          .map((p) => escapeHtml(p))
          .join(" ") || "—";
      const typeChip = play.type
        ? `<span class="play-type-chip">${escapeHtml(play.type)}</span>`
        : "";
      const metaChips = buildAvailMetaChips(play)
        .map((m) => `<span class="play-meta-tag play-meta-tag--${m.c}">${m.t}</span>`)
        .join("");
      return `
            <div class="play-item play-item--${typeSlug} ${isSelected ? "selected" : ""} ${alreadyIn ? "in-script" : ""}" draggable="true" data-drag="availStart" data-idx="${playIdx}">
                <div class="play-item-controls">
                  <input type="checkbox" class="available-play-cb" data-index="${playIdx}" ${isSelected ? "checked" : ""} data-field="availableSelect" data-idx="${playIdx}" />
                  <button type="button" class="available-add-menu-btn" data-action="openAvailableAddMenu" data-idx="${playIdx}" title="Add to script" aria-label="Add ${callName} to script">+</button>
                </div>
                <div class="play-info">
                    <div class="play-name-row">
                      <span class="play-name">${callName}</span>
                      ${typeChip}
                      ${alreadyIn ? '<span class="in-script-badge" title="Already on script">✓ On</span>' : ""}
                    </div>
                    ${metaChips ? `<div class="play-meta-row">${metaChips}</div>` : ""}
                </div>
            </div>
        `;
    })
    .join("");

  document.getElementById("availablePlayCount").textContent = totalAvail;

  let pagerEl = document.getElementById("availPager");
  if (totalAvail <= AVAIL_PER_PAGE) {
    if (pagerEl) pagerEl.remove();
  } else {
    if (!pagerEl) {
      pagerEl = document.createElement("div");
      pagerEl.id = "availPager";
      pagerEl.className = "avail-pager";
      container.insertAdjacentElement("afterend", pagerEl);
    }
    pagerEl.innerHTML = `
      <button class="btn btn-sm" data-action="availPagePrev" ${scriptAvailPage === 0 ? "disabled" : ""}>◀</button>
      <span>${availStart + 1}–${Math.min(availStart + AVAIL_PER_PAGE, totalAvail)} of ${totalAvail}</span>
      <button class="btn btn-sm" data-action="availPageNext" ${scriptAvailPage >= totalAvailPages - 1 ? "disabled" : ""}>▶</button>
    `;
  }

  const selectAllCb = document.getElementById("selectAllAvailable");
  if (selectAllCb) {
    const selectedSet = new Set(selectedAvailablePlays);
    const allSelected =
      pageIndices.length > 0 &&
      pageIndices.every((idx) => selectedSet.has(idx));
    const someSelected = pageIndices.some((idx) => selectedSet.has(idx));
    selectAllCb.checked = allSelected;
    selectAllCb.indeterminate = someSelected && !allSelected;
  }
}

const _scheduleRenderAvailable = createRAFRenderer(renderAvailablePlays);

function toggleSelectAllAvailable() {
  const availStart = scriptAvailPage * AVAIL_PER_PAGE;
  const pageIndices = (currentFilteredPlayIndices || []).slice(
    availStart,
    availStart + AVAIL_PER_PAGE,
  );
  if (pageIndices.length === 0) return;
  const selectedSet = new Set(selectedAvailablePlays);
  const pageSet = new Set(pageIndices);
  const allSelected = pageIndices.every((idx) => selectedSet.has(idx));
  if (allSelected) {
    selectedAvailablePlays = selectedAvailablePlays.filter(
      (idx) => !pageSet.has(idx),
    );
  } else {
    pageIndices.forEach((idx) => {
      if (!selectedSet.has(idx)) selectedAvailablePlays.push(idx);
    });
  }
  renderAvailablePlays();
}
