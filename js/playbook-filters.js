let highlightedWristbandPlays = [];
let highlightedWristbandPlayKeys = new Set();
const playbookMediaFilters = new Set();
const _playbookMediaFilterChecks = new Set();
let _playbookMediaFilterRefreshPending = false;

const PB_PICTURE_FILTER_LABELS = {
  wideZone: "Wide Zone",
  pullers: "Pullers/Counter",
  downhill: "Downhill/ISO",
  antiFront: "Anti-front",
};

function _setPbChipActive(containerId, value, active) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".pb-chip").forEach((chip) => {
    if (chip.dataset.value === value) chip.classList.toggle("active", active);
  });
}

function highlightWristbandPlays() {
  const select = document.getElementById("playbookWristbandHighlight");
  const wbIdx = select.value;

  if (wbIdx === "") {
    highlightedWristbandPlays = [];
    highlightedWristbandPlayKeys = new Set();
    requestRenderPlaybook();
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved[parseInt(wbIdx, 10)];

  if (!wb || !wb.cards) {
    highlightedWristbandPlays = [];
    highlightedWristbandPlayKeys = new Set();
    requestRenderPlaybook();
    return;
  }

  highlightedWristbandPlays = [];
  highlightedWristbandPlayKeys = new Set();
  wb.cards.forEach((card) => {
    card.data.forEach((play) => {
      if (play !== null) {
        highlightedWristbandPlays.push(play);
        _addHighlightedWristbandKeys(play);
      }
    });
  });

  requestRenderPlaybook();
}

function _addHighlightedWristbandKeys(play) {
  if (!play || typeof getPlayIdentityKey !== "function") return;
  highlightedWristbandPlayKeys.add(
    `core:${getPlayIdentityKey(play, "core", { trim: false })}`,
  );
  highlightedWristbandPlayKeys.add(
    `name:${getPlayIdentityKey(play, "name", { trim: false })}`,
  );
  highlightedWristbandPlayKeys.add(
    `iname:${getPlayIdentityKey(play, "name", { normalizeCase: true })}`,
  );
  if (typeof getPlayCompareKey === "function") {
    highlightedWristbandPlayKeys.add(`ccore:${getPlayCompareKey(play, "core")}`);
    highlightedWristbandPlayKeys.add(`cname:${getPlayCompareKey(play, "name")}`);
  }
}

function isPlayOnHighlightedWristband(play) {
  if (highlightedWristbandPlays.length === 0) return false;
  if (highlightedWristbandPlayKeys.size > 0 && typeof getPlayIdentityKey === "function") {
    return (
      highlightedWristbandPlayKeys.has(`core:${getPlayIdentityKey(play, "core", { trim: false })}`) ||
      highlightedWristbandPlayKeys.has(`name:${getPlayIdentityKey(play, "name", { trim: false })}`) ||
      highlightedWristbandPlayKeys.has(`iname:${getPlayIdentityKey(play, "name", { normalizeCase: true })}`) ||
      (
        typeof getPlayCompareKey === "function" &&
        (
          highlightedWristbandPlayKeys.has(`ccore:${getPlayCompareKey(play, "core")}`) ||
          highlightedWristbandPlayKeys.has(`cname:${getPlayCompareKey(play, "name")}`)
        )
      )
    );
  }

  return highlightedWristbandPlays.some((wbPlay) => playsMatch(play, wbPlay));
}

const _debouncedFilterPlays = debounce(filterPlays, 150);

function debouncedFilterPlays() {
  _debouncedFilterPlays();
}

const PLAYER_PLAYBOOK_FILTER_GROUPS = [
  {
    key: "gamePlan",
    label: "Game Plan",
    options: [
      { label: "Current Game Plan", value: "current", inputId: "pbGamePlanFilter" },
      { label: "JV Only", value: "jv", inputId: "pbJvFilter" },
    ],
  },
  {
    key: "study",
    label: "Study Status",
    options: [
      { label: "Has Diagram", value: "diagram" },
      { label: "Needs Diagram", value: "missingDiagram" },
      { label: "Has Video", value: "video" },
      { label: "Coach Notes", value: "notes" },
    ],
  },
  { key: "type", label: "Type", cacheKey: "types", chipGroup: "pbChipsType", activeSet: () => activeTypeChips },
  { key: "personnel", label: "Personnel", cacheKey: "personnels", chipGroup: "pbChipsPersonnel", activeSet: () => activePersonnelChips },
  { key: "formation", label: "Formation", cacheKey: "formations", inputId: "filterFormation" },
  { key: "basePlay", label: "Base Play", cacheKey: "basePlays", inputId: "filterBasePlay" },
  { key: "motion", label: "Motion", cacheKey: "motions", inputId: "pbFilterMotion" },
  { key: "protection", label: "Protection", cacheKey: "protections", inputId: "pbFilterProtection" },
  { key: "tempo", label: "Tempo", cacheKey: "tempos", inputId: "pbFilterTempo" },
];

const playerPlaybookStudyFilters = new Set();

function _playbookHasStoredDiagram(play) {
  return Boolean(
    play &&
      typeof window !== "undefined" &&
      window.playImages &&
      typeof window.playImages.hasForPlay === "function" &&
      window.playImages.hasForPlay(play)
  );
}

function _playbookHasDiagram(play) {
  if (_playbookHasStoredDiagram(play)) return true;
  const remote = typeof window !== "undefined" && typeof window.playImages?.getCachedRemoteManifestForPlay === "function"
    ? window.playImages.getCachedRemoteManifestForPlay(play)
    : null;
  return Boolean(remote?.published);
}

function _warmPlaybookMediaFilterManifests(playList) {
  if (
    _playbookMediaFilterRefreshPending ||
    !window.playImages ||
    typeof window.playImages.checkRemoteForPlays !== "function" ||
    typeof getPlayMediaId !== "function"
  ) return false;
  const pending = playList.filter((play) => {
    const mediaId = String(getPlayMediaId(play) || "").trim();
    return mediaId && !_playbookMediaFilterChecks.has(mediaId);
  });
  if (!pending.length) return false;
  _playbookMediaFilterRefreshPending = true;
  window.playImages.checkRemoteForPlays(pending)
    .then(() => {
      pending.forEach((play) => {
        const mediaId = String(getPlayMediaId(play) || "").trim();
        if (mediaId) _playbookMediaFilterChecks.add(mediaId);
      });
      filterPlays();
    })
    .finally(() => { _playbookMediaFilterRefreshPending = false; });
  return true;
}

function togglePlaybookMediaFilter(value) {
  const key = String(value || "");
  if (!key) return;
  if (key === "hasDiagram") playbookMediaFilters.delete("noDiagram");
  if (key === "noDiagram") playbookMediaFilters.delete("hasDiagram");
  if (playbookMediaFilters.has(key)) playbookMediaFilters.delete(key);
  else playbookMediaFilters.add(key);
  document.querySelectorAll("[data-pb-media-filter]").forEach((button) => {
    button.classList.toggle("active", playbookMediaFilters.has(button.dataset.pbMediaFilter));
  });
  currentPage = 0;
  filterPlays();
}

function _playbookHasClip(play) {
  return Boolean(
    play &&
      typeof window !== "undefined" &&
      window.playClips &&
      typeof window.playClips.hasForPlay === "function" &&
      window.playClips.hasForPlay(play)
  );
}

function _playbookHasPlayerNotes(play) {
  return Boolean(play && String(play.playerNotes || "").trim());
}

function _isPlayerPlaybookViewer() {
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return currentUser?.role === "player" ||
    (currentUser?.role === "coach" && currentUser?.managedCoach === true);
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
    document.getElementById("searchPlay")?.value?.trim().toLowerCase() || "";
  const runtimeIndex =
    typeof getPlaybookRuntimeIndex === "function" ? getPlaybookRuntimeIndex() : null;

  const gamePlanOnly =
    document.getElementById("pbGamePlanFilter")?.checked || false;
  const jvOnly =
    document.getElementById("pbJvFilter")?.checked || false;
  const scoutOnly =
    document.getElementById("pbScoutFilter")?.checked || false;
  const inWeekOnly =
    document.getElementById("pbInWeekFilter")?.checked || false;
  const unusedOnly =
    document.getElementById("pbUnusedFilter")?.checked || false;
  const hasDiagramOnly = playbookMediaFilters.has("hasDiagram");
  const noDiagramOnly = playbookMediaFilters.has("noDiagram");
  const hasClipsOnly = playbookMediaFilters.has("hasClips");
  const checkingDiagramFilter = (hasDiagramOnly || noDiagramOnly)
    && _warmPlaybookMediaFilterManifests(plays);
  const gameWeek = getGameWeek();
  const taggedForOpponent = gamePlanOnly && gameWeek.opponentName && typeof getGamePlanTags === "function"
    ? new Set((getGamePlanTags()[gameWeek.opponentName] || []))
    : null;
  const jvFlagged = jvOnly && typeof _gpFlaggedSigs === "function"
    ? _gpFlaggedSigs("jv")
    : null;
  _updateGamePlanFilterBar();

  filteredPlays = plays.filter((play) => {
    if (
      _isPlayerPlaybookViewer() &&
      typeof isPlayHiddenFromPlayers === "function" &&
      isPlayHiddenFromPlayers(play)
    ) {
      return false;
    }
    const meta = runtimeIndex && runtimeIndex.byPlay ? runtimeIndex.byPlay.get(play) : null;
    if (taggedForOpponent) {
      const tagSig = meta ? meta.tagSig : playSignature(play);
      if (!taggedForOpponent.has(tagSig)) return false;
    }
    if (jvOnly) {
      if (!jvFlagged || typeof _gpPlaySignature !== "function") return false;
      const gpSig = meta ? meta.gpSig : _gpPlaySignature(play);
      if (!jvFlagged.has(gpSig)) return false;
    }
    if (scoutOnly) {
      const recs = typeof _tdScoutRecs !== "undefined" && Array.isArray(_tdScoutRecs) ? _tdScoutRecs : [];
      if (!recs.some((r) => typeof playsMatch === "function" && playsMatch(r.play, play))) return false;
    }
    if (inWeekOnly || unusedOnly) {
      const inScript = Array.isArray(script) && script.some((s) => !s.isSeparator && typeof playsMatch === "function" && playsMatch(s, play));
      const onSheet = typeof getCallSheetPlayLocations === "function" && getCallSheetPlayLocations(play).length > 0;
      const inWeek = inScript || onSheet;
      if (inWeekOnly && !inWeek) return false;
      if (unusedOnly && inWeek) return false;
    }
    if (!checkingDiagramFilter) {
      if (hasDiagramOnly && !_playbookHasDiagram(play)) return false;
      if (noDiagramOnly && _playbookHasDiagram(play)) return false;
    }
    if (hasClipsOnly && !_playbookHasClip(play)) return false;
    if (playerPlaybookStudyFilters.size > 0) {
      if (playerPlaybookStudyFilters.has("diagram") && !_playbookHasStoredDiagram(play)) return false;
      if (playerPlaybookStudyFilters.has("missingDiagram") && _playbookHasStoredDiagram(play)) return false;
      if (playerPlaybookStudyFilters.has("video") && !_playbookHasClip(play)) return false;
      if (playerPlaybookStudyFilters.has("notes") && !_playbookHasPlayerNotes(play)) return false;
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
      const searchText = meta ? meta.searchText : [
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
      ].filter(Boolean).join(" ").toLowerCase();
      if (!searchText.includes(search)) return false;
    }
    return true;
  });

  applyCurrentSort();
  requestRenderPlaybook();
  savePlaybookState();
  updateActiveFilterBar();
  const clearBtn = document.getElementById("clearPbSearch");
  if (clearBtn) clearBtn.classList.toggle("hidden", !search);
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
  activePictureChips.clear();
  playbookMediaFilters.clear();
  document
    .querySelectorAll(".pb-chip.active")
    .forEach((chip) => chip.classList.remove("active"));

  const gpFilter = document.getElementById("pbGamePlanFilter");
  if (gpFilter) gpFilter.checked = false;
  const jvFilter = document.getElementById("pbJvFilter");
  if (jvFilter) jvFilter.checked = false;
  playerPlaybookStudyFilters.clear();
  ["pbScoutFilter", "pbInWeekFilter", "pbUnusedFilter"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });

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
  if (clearBtn) clearBtn.classList.add("hidden");

  currentSortColumn = null;
  currentSortDirection = "asc";
  secondarySortColumn = null;
  secondarySortDirection = "asc";
  selectedRowIndex = -1;
  _syncSortUI();

  storageManager.remove(STORAGE_KEYS.PLAYBOOK_STATE);

  filterPlays();
  updateActiveFilterBar();
}

function clearAllFilters() {
  clearFilters();
}

function clearTypeFilters() {
  activeTypeChips.clear();
  document
    .querySelectorAll("#pbChipsType .pb-chip.active")
    .forEach((chip) => chip.classList.remove("active"));
  if (typeof invalidateStatsBarCache === "function") invalidateStatsBarCache();
  if (typeof filterPlays === "function") filterPlays();
}

function clearPbSearch() {
  const input = document.getElementById("searchPlay");
  if (input) input.value = "";
  const clearBtn = document.getElementById("clearPbSearch");
  if (clearBtn) clearBtn.classList.add("hidden");
  filterPlays();
}

function _getPlayerPlaybookFilterGroups() {
  const cache =
    typeof getFilterCache === "function"
      ? getFilterCache()
      : PLAYER_PLAYBOOK_FILTER_GROUPS.reduce((acc, group) => {
        acc[group.cacheKey] = [];
        return acc;
      }, {});
  const fieldByCacheKey = {
    types: "type",
    personnels: "personnel",
    formations: "formation",
    basePlays: "basePlay",
    motions: "motion",
    protections: "protection",
    tempos: "tempo",
  };
  const sourcePlays = typeof plays !== "undefined" && Array.isArray(plays)
    ? plays.filter((play) => play && !play.isSeparator)
    : [];

  return PLAYER_PLAYBOOK_FILTER_GROUPS.map((group) => {
    if (Array.isArray(group.options)) return { ...group, values: group.options };
    const field = fieldByCacheKey[group.cacheKey];
    // Do not trust the desktop filter cache alone here. On player and managed
    // coach devices it can be created before the canonical team workspace
    // finishes hydrating, leaving every dynamic group falsely empty.
    const directValues = field
      ? [...new Set(sourcePlays
        .map((play) => String(play[field] || "").trim())
        .filter(Boolean))].sort((a, b) => a.localeCompare(b))
      : [];
    const cachedValues = Array.isArray(cache[group.cacheKey])
      ? cache[group.cacheKey]
      : [];
    return { ...group, values: directValues.length ? directValues : cachedValues };
  });
}

function _playerPlaybookFilterArg(key, value) {
  return `${key}:${encodeURIComponent(value)}`;
}

function _decodePlayerPlaybookFilterArg(arg) {
  const raw = String(arg || "");
  const splitAt = raw.indexOf(":");
  if (splitAt < 1) return null;
  const key = raw.slice(0, splitAt);
  const encoded = raw.slice(splitAt + 1);
  try {
    return { key, value: decodeURIComponent(encoded) };
  } catch (_err) {
    return { key, value: encoded };
  }
}

function openPlayerPlaybookFilters(focusKey = "") {
  closePlayerPlaybookFilters();
  if (typeof ensurePlaybookImageBadgesReady === "function") {
    ensurePlaybookImageBadgesReady();
  }

  const groups = _getPlayerPlaybookFilterGroups();
  const orderedGroups = focusKey
    ? [
      ...groups.filter((group) => group.key === focusKey),
      ...groups.filter((group) => group.key !== focusKey),
    ]
    : groups;
  const overlay = document.createElement("div");
  overlay.id = "playerPlaybookFilterOverlay";
  overlay.className = "pb-player-filter-overlay";
  overlay.dataset.action = "closePlayerPlaybookFiltersOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "playerPlaybookFilterTitle");

  const groupsHtml = orderedGroups
    .map((group) => {
      const values = group.values.slice(0, 36);
      const options = values.length
        ? values
          .map((option) => {
            const value = typeof option === "object" ? option.value : option;
            const label = typeof option === "object" ? option.label : option;
            const arg = _playerPlaybookFilterArg(group.key, value);
            const activeClass = _isPlayerPlaybookFilterActive(group, value)
              ? " is-active"
              : "";
            return `<button type="button" class="pb-player-filter-option${activeClass}" data-action="applyPlayerPlaybookFilter" data-arg="${escapeHtml(arg)}">${escapeHtml(label)}</button>`;
          })
          .join("")
        : '<span class="pb-player-filter-empty">No options yet</span>';
      return `<section class="pb-player-filter-group" data-filter-group="${escapeHtml(group.key)}">
        <h3>${escapeHtml(group.label)}</h3>
        <div class="pb-player-filter-options">${options}</div>
      </section>`;
    })
    .join("");

  overlay.innerHTML = `
    <section class="pb-player-filter-dialog">
      <header class="pb-player-filter-header">
        <div>
          <span class="pb-player-filter-kicker">Player Playbook</span>
          <h2 id="playerPlaybookFilterTitle">Filter plays</h2>
        </div>
        <button type="button" class="pb-player-filter-close" data-action="closePlayerPlaybookFilters" aria-label="Close filters">×</button>
      </header>
      <div class="pb-player-filter-body">
        ${groupsHtml}
      </div>
      <footer class="pb-player-filter-footer">
        <button type="button" class="btn btn-secondary" data-action="clearAllFilters">Clear Filters</button>
        <button type="button" class="btn btn-primary" data-action="openSelectedPlaybookPresentation">Present Showing</button>
      </footer>
    </section>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function _isPlayerPlaybookFilterActive(group, value) {
  if (!group || !value) return false;
  if (group.key === "study") return playerPlaybookStudyFilters.has(value);
  if (Array.isArray(group.options)) {
    const option = group.options.find((item) => item.value === value);
    const input = option?.inputId ? document.getElementById(option.inputId) : null;
    return Boolean(input?.checked);
  }
  if (group.activeSet) return group.activeSet().has(value);
  if (group.inputId) return document.getElementById(group.inputId)?.value === value;
  return false;
}

function closePlayerPlaybookFilters() {
  const overlay = document.getElementById("playerPlaybookFilterOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 160);
}

function applyPlayerPlaybookFilter(arg) {
  const parsed = _decodePlayerPlaybookFilterArg(arg);
  if (!parsed || !parsed.value) return;
  const group = PLAYER_PLAYBOOK_FILTER_GROUPS.find((item) => item.key === parsed.key);
  if (!group) return;

  if (Array.isArray(group.options)) {
    if (group.key === "study") {
      if (parsed.value === "diagram") playerPlaybookStudyFilters.delete("missingDiagram");
      if (parsed.value === "missingDiagram") playerPlaybookStudyFilters.delete("diagram");
      if (playerPlaybookStudyFilters.has(parsed.value)) {
        playerPlaybookStudyFilters.delete(parsed.value);
      } else {
        playerPlaybookStudyFilters.add(parsed.value);
      }
    } else {
      const option = group.options.find((item) => item.value === parsed.value);
      const input = option?.inputId ? document.getElementById(option.inputId) : null;
      if (input) input.checked = !input.checked;
    }
  } else if (group.activeSet) {
    const activeSet = group.activeSet();
    activeSet.clear();
    activeSet.add(parsed.value);
    if (group.chipGroup) {
      document
        .querySelectorAll(`#${group.chipGroup} .pb-chip`)
        .forEach((chip) => chip.classList.toggle("active", chip.dataset.value === parsed.value));
    }
  } else if (group.inputId) {
    const input = document.getElementById(group.inputId);
    if (input) input.value = parsed.value;
  }

  currentPage = 0;
  filterPlays();
  closePlayerPlaybookFilters();
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
  if (
    typeof activePictureChips !== "undefined" &&
    activePictureChips.size > 0 &&
    typeof isVisionMode === "function" &&
    isVisionMode()
  ) {
    activePictureChips.forEach((value) => {
      parts.push({
        label: `Picture: ${PB_PICTURE_FILTER_LABELS[value] || value}`,
        layer: "picture",
        value,
      });
    });
  }

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

  // Workflow filters (#112-114)
  const workflowFilters = [
    { id: "pbScoutFilter", label: "🔍 Scout Recs" },
    { id: "pbInWeekFilter", label: "📋 In Week" },
    { id: "pbUnusedFilter", label: "📄 Unused" },
  ];
  workflowFilters.forEach(({ id, label }) => {
    if (document.getElementById(id)?.checked) {
      parts.push({ label, layer: id, value: "1" });
    }
  });
  const studyFilterLabels = {
    diagram: "Diagram ready",
    missingDiagram: "Needs diagram",
    video: "Video ready",
    notes: "Coach notes",
  };
  playerPlaybookStudyFilters.forEach((value) => {
    parts.push({
      label: studyFilterLabels[value] || value,
      layer: "playerStudy",
      value,
    });
  });
  const mediaFilterLabels = {
    hasDiagram: "🖼️ Has diagram",
    noDiagram: "◻️ No diagram",
    hasClips: "🎬 Has clips",
  };
  playbookMediaFilters.forEach((value) => {
    parts.push({ label: mediaFilterLabels[value] || value, layer: "media", value });
  });
  // Show/hide bulk add button based on whether any plays are filtered
  const bulkBtn = document.getElementById("pbBulkAddBtn");
  if (bulkBtn) bulkBtn.style.display = filteredPlays.length < plays.length ? "" : "none";

  if (parts.length === 0) {
    if (clearBtn) clearBtn.hidden = true;
    pills.innerHTML = "";
    const countBadge = document.getElementById("pbFilterCount");
    if (countBadge) countBadge.hidden = true;
    return;
  }

  if (clearBtn) clearBtn.hidden = false;
  pills.innerHTML = parts
    .map(
      (part) =>
        `<span class="pb-pill" data-layer="${part.layer}" data-value="${escapeHtml(part.value)}">${escapeHtml(part.label)} <button data-action="removeFilter" data-layer="${part.layer}" data-filter-value="${escapeHtml(part.value)}">&times;</button></span>`,
    )
    .join("");

  const countBadge = document.getElementById("pbFilterCount");
  if (countBadge) {
    countBadge.textContent = parts.length;
    countBadge.hidden = false;
  }

  // Update "More Filters" toggle badge to show count of hidden active filters
  const moreFilterIds = ["filterFormation", "filterBasePlay", "pbFilterBack", "pbFilterMotion", "pbFilterProtection", "pbFilterTempo"];
  const moreCount = moreFilterIds.filter((id) => document.getElementById(id)?.value).length;
  const moreToggle = document.getElementById("pbMoreToggle");
  if (moreToggle) {
    let moreBadge = moreToggle.querySelector(".pb-more-count");
    if (!moreBadge) {
      moreBadge = document.createElement("span");
      moreBadge.className = "pb-more-count badge badge-primary";
      moreToggle.appendChild(moreBadge);
    }
    moreBadge.textContent = moreCount;
    moreBadge.hidden = moreCount === 0;
  }
}

function removeFilter(layer, value) {
  if (layer === "type") {
    activeTypeChips.delete(value);
    _setPbChipActive("pbChipsType", value, false);
  } else if (layer === "personnel") {
    activePersonnelChips.delete(value);
    _setPbChipActive("pbChipsPersonnel", value, false);
  } else if (layer === "picture") {
    activePictureChips.delete(value);
    _setPbChipActive("pbChipsPicture", value, false);
  } else if (layer === "search") {
    const el = document.getElementById("searchPlay");
    if (el) el.value = "";
  } else if (layer === "playerStudy") {
    playerPlaybookStudyFilters.delete(value);
  } else if (layer === "media") {
    playbookMediaFilters.delete(value);
    document.querySelectorAll("[data-pb-media-filter]").forEach((button) => {
      button.classList.toggle("active", playbookMediaFilters.has(button.dataset.pbMediaFilter));
    });
  } else {
    const el = document.getElementById(layer);
    if (el) el.value = "";
  }
  filterPlays();
}
