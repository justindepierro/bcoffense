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
    const search = document.getElementById("scriptSearchPlay")?.value.trim() || "";
    statusEl.textContent =
      selectedCount > 0
        ? `${selectedCount} selected overall • ${pageCount} on this page`
        : `${filteredCount} ${search ? "ranked matches" : "filtered"} • ${pageCount} on this page`;
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
      badge.textContent = String(count);
      badge.setAttribute("aria-label", `${count} active filters`);
    } else {
      badge.classList.add("hidden");
      badge.textContent = "";
      badge.removeAttribute("aria-label");
    }
  }

  const toggleBtn = document.getElementById("toggleFiltersBtn");
  const label = document.getElementById("scriptFiltersLabel");
  if (toggleBtn) {
    toggleBtn.classList.toggle("has-active-filters", count > 0);
  }
  if (label) label.textContent = filtersCollapsed ? "Filters" : "Hide Filters";
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
  return `${play.type || ""}|${play.play || ""}|${play.basePlay || ""}|${play.formation || ""}|${play.protection || ""}|${play.motion || ""}|${play.shift || ""}|${play.back || ""}|${play.personnel || ""}|${play.oneWord || ""}|${play.playTag1 || ""}|${play.playTag2 || ""}`;
}

function buildScriptSearchHaystack(play) {
  const currentHash = _scriptPlayHash(play);
  const cached = _scriptHaystackCache.get(play);
  if (cached && cached.hash === currentHash) return cached.result;

  const fields = {
    play: normalizeScriptSearchText(play.play),
    call: normalizeScriptSearchText([play.formation, play.protection, play.play].filter(Boolean).join(" ")),
    base: normalizeScriptSearchText(play.basePlay),
    formation: normalizeScriptSearchText(play.formation),
    personnel: normalizeScriptSearchText(play.personnel),
    type: normalizeScriptSearchText(play.type),
    tags: normalizeScriptSearchText([play.playTag1, play.playTag2, play.oneWord].filter(Boolean).join(" ")),
    detail: normalizeScriptSearchText([play.protection, play.motion, play.shift, play.back].filter(Boolean).join(" ")),
  };
  const normalized = Object.values(fields).filter(Boolean).join(" ");
  const result = {
    normalized,
    fields,
    tokensByField: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, value.split(/\s+/).filter(Boolean)]),
    ),
  };

  _scriptHaystackCache.set(play, { hash: currentHash, result });
  return result;
}

const _SCRIPT_SEARCH_QUALIFIERS = {
  personnel: "personnel",
  pers: "personnel",
  formation: "formation",
  form: "formation",
  type: "type",
  base: "base",
  tag: "tags",
  tags: "tags",
  motion: "detail",
  shift: "detail",
  protection: "detail",
  prot: "detail",
};

const _SCRIPT_SEARCH_FIELD_WEIGHTS = {
  play: 14,
  call: 10,
  base: 8,
  formation: 7,
  personnel: 7,
  type: 6,
  tags: 6,
  detail: 4,
};

function parseScriptSearchQuery(search) {
  const qualifiers = [];
  const remainder = String(search || "").replace(
    /\b([a-z]+)\s*:\s*("[^"]+"|'[^']+'|[^\s]+)/gi,
    (match, key, value) => {
      const field = _SCRIPT_SEARCH_QUALIFIERS[String(key || "").toLowerCase()];
      const normalizedValue = normalizeScriptSearchText(String(value || "").replace(/^['"]|['"]$/g, ""));
      if (field && normalizedValue) qualifiers.push({ field, value: normalizedValue });
      return field ? " " : match;
    },
  );
  const phrase = normalizeScriptSearchText(remainder);
  return { phrase, tokens: phrase.split(/\s+/).filter(Boolean), qualifiers };
}

function scriptSearchEditDistance(left, right, maxDistance) {
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let smallest = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const next = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      current.push(next);
      smallest = Math.min(smallest, next);
    }
    if (smallest > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[right.length];
}

function scoreScriptSearchToken(token, candidate) {
  if (!token || !candidate) return 0;
  if (candidate === token) return 100;
  if (token.length >= 2 && candidate.startsWith(token)) return 68;
  if (token.length >= 3 && candidate.includes(token)) return 40;
  if (token.length >= 4 && candidate.length >= 4) {
    const maxDistance = token.length >= 7 ? 2 : 1;
    const distance = scriptSearchEditDistance(token, candidate, maxDistance);
    if (distance <= maxDistance) return distance === 1 ? 28 : 18;
  }
  return 0;
}

function scoreScriptSearchField(value, tokens, queryTokens) {
  if (!queryTokens.length) return 0;
  if (!value) return null;
  let score = 0;
  for (const token of queryTokens) {
    let tokenScore = 0;
    for (const candidate of tokens) {
      tokenScore = Math.max(tokenScore, scoreScriptSearchToken(token, candidate));
    }
    if (!tokenScore) return null;
    score += tokenScore;
  }
  return score;
}

function scoreScriptPlaySearchQuery(play, query) {
  if (!query.phrase && !query.qualifiers.length) return 0;
  const haystack = buildScriptSearchHaystack(play);
  let score = 0;

  for (const qualifier of query.qualifiers) {
    const qualifiedTokens = qualifier.value.split(/\s+/).filter(Boolean);
    const qualifiedScore = scoreScriptSearchField(
      haystack.fields[qualifier.field],
      haystack.tokensByField[qualifier.field] || [],
      qualifiedTokens,
    );
    if (qualifiedScore === null) return null;
    score += 650 + qualifiedScore * (_SCRIPT_SEARCH_FIELD_WEIGHTS[qualifier.field] || 1);
  }

  if (query.tokens.length) {
    let tokenScore = 0;
    for (const token of query.tokens) {
      let best = 0;
      Object.entries(haystack.tokensByField).forEach(([field, candidates]) => {
        const fieldMatch = candidates.reduce(
          (max, candidate) => Math.max(max, scoreScriptSearchToken(token, candidate)),
          0,
        );
        best = Math.max(best, fieldMatch * (_SCRIPT_SEARCH_FIELD_WEIGHTS[field] || 1));
      });
      if (!best) return null;
      tokenScore += best;
    }
    score += tokenScore;
  }

  if (query.phrase) {
    if (haystack.fields.play.includes(query.phrase)) score += 1300;
    else if (haystack.fields.call.includes(query.phrase)) score += 950;
    else if (haystack.fields.base.includes(query.phrase)) score += 720;
    else if (haystack.fields.formation.includes(query.phrase)) score += 640;
    else if (haystack.fields.tags.includes(query.phrase)) score += 480;
  }

  return score;
}

function scoreScriptPlaySearch(play, search) {
  return scoreScriptPlaySearchQuery(play, parseScriptSearchQuery(search));
}

function playMatchesScriptSearch(play, search) {
  return scoreScriptPlaySearch(play, search) !== null;
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
  const searchQuery = search ? parseScriptSearchQuery(search) : null;
  normalizeSelectedAvailablePlays();

  const matchesFilter = (value, selectedArr) => {
    if (selectedArr.length === 0) return true;
    if (!value) return false;
    const normalized =
      value.trim().charAt(0).toUpperCase() +
      value.trim().slice(1).toLowerCase();
    return selectedArr.includes(normalized);
  };

  const filteredEntries = [];
  for (let playIdx = 0; playIdx < plays.length; playIdx += 1) {
    const play = plays[playIdx];
    const candidates = typeof getPlayFilterVariants === "function" ? getPlayFilterVariants(play) : [play];
    const matches = candidates.map((candidate) => ({
      score: searchQuery ? scoreScriptPlaySearchQuery(candidate, searchQuery) : 0,
      candidate,
    })).filter(({ candidate, score }) =>
      matchesFilter(candidate.type, scriptSelectedTypes) &&
      matchesFilter(candidate.preferredSituation, scriptSelectedSituation) &&
      matchesFilter(candidate.preferredDown, scriptSelectedDown) &&
      matchesFilter(candidate.preferredDistance, scriptSelectedDistance) &&
      matchesFilter(candidate.preferredHash, scriptSelectedHash) &&
      matchesFilter(candidate.preferredFieldPosition, scriptSelectedFieldPos) &&
      matchesFilter(candidate.personnel, scriptSelectedPersonnel) &&
      (!formation || candidate.formation === formation) &&
      (!basePlay || candidate.basePlay === basePlay) &&
      score !== null,
    );
    if (!matches.length) continue;
    const bestMatch = [...matches].sort((left, right) => {
      const leftIsVariant = String(left.candidate?.personnelVariantId || "base") !== "base";
      const rightIsVariant = String(right.candidate?.personnelVariantId || "base") !== "base";
      // Prefer the approved variant that made the row match. That makes the
      // displayed result and every following add action agree.
      return rightIsVariant - leftIsVariant || (Number(right.score) || 0) - (Number(left.score) || 0);
    })[0];
    const searchScore = Math.max(...matches.map(({ score }) => Number(score) || 0));
    if (gamePlanOnly) {
      if (typeof isPlayInGamePlanBoard !== "function") continue;
      if (!isPlayInGamePlanBoard(play)) continue;
    }
    if (jvOnly) {
      if (typeof isPlayFlaggedInGamePlan !== "function") continue;
      if (!isPlayFlaggedInGamePlan(play, "jv")) continue;
    }
    filteredEntries.push({
      play,
      playIdx,
      searchScore,
      personnelVariantId: String(bestMatch?.candidate?.personnelVariantId || "base") || "base",
    });
  }

  if (search) {
    filteredEntries.sort((left, right) =>
      right.searchScore - left.searchScore ||
      String(left.play.play || "").localeCompare(String(right.play.play || "")) ||
      left.playIdx - right.playIdx,
    );
  }

  const filteredIndices = filteredEntries.map((entry) => entry.playIdx);

  const container = document.getElementById("availablePlays");
  currentFilteredPlayIndices = filteredIndices;
  currentFilteredPlayEntries = filteredEntries;

  const totalAvail = filteredEntries.length;
  const totalAvailPages = Math.max(1, Math.ceil(totalAvail / AVAIL_PER_PAGE));
  if (scriptAvailPage >= totalAvailPages) scriptAvailPage = totalAvailPages - 1;
  if (scriptAvailPage < 0) scriptAvailPage = 0;
  const availStart = scriptAvailPage * AVAIL_PER_PAGE;
  const pageEntries = filteredEntries.slice(availStart, availStart + AVAIL_PER_PAGE);
  const pageIndices = pageEntries.map((entry) => entry.playIdx);
  updateAvailableActionsUI(totalAvail, pageEntries.length);

  if (pageEntries.length === 0) {
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

  container.innerHTML = pageEntries
    .map((entry) => {
      const { play, playIdx } = entry;
      const variantId = String(entry.personnelVariantId || "base") || "base";
      const displayPlay = variantId !== "base" && typeof getEffectivePlayVariant === "function"
        ? getEffectivePlayVariant(play, variantId) || play
        : play;
      const isVariant = variantId !== "base";
      const isSelected = selectedSet.has(playIdx);
      const alreadyIn = inScriptSet.has(
        `${play.formation}||${play.protection}||${play.play}`,
      );
      const typeSlug = availTypeSlug(displayPlay.type);
      const callName =
        [displayPlay.formation, displayPlay.protection, displayPlay.play]
          .filter(Boolean)
          .map((p) => escapeHtml(p))
          .join(" ") || "—";
      const typeChip = displayPlay.type
        ? `<span class="play-type-chip">${escapeHtml(displayPlay.type)}</span>`
        : "";
      const metaChips = buildAvailMetaChips(displayPlay)
        .map((m) => `<span class="play-meta-tag play-meta-tag--${m.c}">${m.t}</span>`)
        .join("");
      return `
            <div class="play-item script-library-row app-library-row play-item--${typeSlug} ${isSelected ? "selected" : ""} ${alreadyIn ? "in-script" : ""} ${isVariant ? "is-personnel-variant" : ""}" draggable="true" data-drag="availStart" data-idx="${playIdx}" data-personnel-variant-id="${escapeAttr(variantId)}">
                <div class="play-item-controls">
                  <input type="checkbox" class="available-play-cb" data-index="${playIdx}" ${isSelected ? "checked" : ""} data-field="availableSelect" data-idx="${playIdx}" />
                  <button type="button" class="available-add-menu-btn" data-action="openAvailableAddMenu" data-idx="${playIdx}" title="Add to script" aria-label="Add ${callName} to script">+</button>
                </div>
                <div class="play-info">
                    <div class="play-name-row">
                      <span class="play-name">${callName}</span>
                      ${isVariant ? '<span class="script-library-variant-marker" title="Approved personnel variant" aria-label="Approved personnel variant">*</span>' : ""}
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
