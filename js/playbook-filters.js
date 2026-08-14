let highlightedWristbandPlays = [];
let highlightedWristbandPlayKeys = new Set();
const playbookMediaFilters = new Set();
let _playbookMediaFilterRefreshPending = false;
let _playbookMediaFilterRetryTimer = null;
let _playbookClipFilterRefreshPending = false;

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

// A player or managed-coach study surface must never let an IndexedDB cache
// decide whether a play is diagram-ready. A local blob can be a previous
// release, an unfinished coach upload, or simply the one image opened during
// this session. The signed Cloudflare manifest is the only authority for
// player-visible media. Coach workbench filters intentionally retain the
// broader local-or-cloud behavior above so an in-progress attachment remains
// discoverable before it has been published.
function _playbookHasPublishedDiagram(play) {
  const remote = typeof window !== "undefined" && typeof window.playImages?.getCachedRemoteManifestForPlay === "function"
    ? window.playImages.getCachedRemoteManifestForPlay(play)
    : null;
  return Boolean(remote?.published && remote?.status === "published");
}

function _playbookHasDiagramForCurrentViewer(play) {
  return _isPlayerPlaybookViewer()
    ? _playbookHasPublishedDiagram(play)
    : _playbookHasDiagram(play);
}

function _hasDefinitivePlaybookMediaManifest(play) {
  const manifest = typeof window !== "undefined" &&
    typeof window.playImages?.getCachedRemoteManifestForPlay === "function"
    ? window.playImages.getCachedRemoteManifestForPlay(play)
    : null;
  return Boolean(manifest && ["published", "unpublished"].includes(manifest.status));
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
    return mediaId && !_hasDefinitivePlaybookMediaManifest(play);
  });
  if (!pending.length) return false;
  _playbookMediaFilterRefreshPending = true;
  window.playImages.checkRemoteForPlays(pending)
    .finally(() => {
      _playbookMediaFilterRefreshPending = false;
      const hasUnresolved = pending.some((play) => {
        return !_hasDefinitivePlaybookMediaManifest(play);
      });
      if (hasUnresolved) {
        // Keep the unfiltered list visible while Cloudflare is unavailable.
        // A later, bounded retry is safer than mislabeling every unresolved
        // diagram as missing or rapidly re-running the filter in a loop.
        clearTimeout(_playbookMediaFilterRetryTimer);
        _playbookMediaFilterRetryTimer = setTimeout(() => filterPlays(), 3000);
        return;
      }
      filterPlays();
    });
  return true;
}

function _hasUnresolvedPlaybookMediaManifests(playList) {
  if (typeof getPlayMediaId !== "function") return false;
  return (Array.isArray(playList) ? playList : []).some((play) => {
    const mediaId = String(getPlayMediaId(play) || "").trim();
    return mediaId && !_hasDefinitivePlaybookMediaManifest(play);
  });
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

function _playbookHasClipForCurrentViewer(play) {
  if (_isPlayerPlaybookViewer()) {
    return Boolean(
      play &&
      typeof window !== "undefined" &&
      typeof window.playClips?.hasCanonicalForPlay === "function" &&
      window.playClips.hasCanonicalForPlay(play)
    );
  }
  return _playbookHasClip(play);
}

function _warmPlaybookClipFilterIndex() {
  if (
    _playbookClipFilterRefreshPending ||
    !window.playClips ||
    typeof window.playClips.loadIndex !== "function" ||
    window.playClips.isIndexLoaded?.()
  ) return false;
  _playbookClipFilterRefreshPending = true;
  window.playClips.loadIndex()
    .finally(() => {
      _playbookClipFilterRefreshPending = false;
      filterPlays();
    });
  return true;
}

function _isPlaybookClipFilterChecking() {
  return Boolean(
    typeof window !== "undefined" &&
    window.playClips &&
    typeof window.playClips.isIndexLoaded === "function" &&
    !window.playClips.isIndexLoaded()
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
  const playerHasDiagramOnly = playerPlaybookStudyFilters.has("diagram");
  const playerNeedsDiagramOnly = playerPlaybookStudyFilters.has("missingDiagram");
  const playerHasVideoOnly = playerPlaybookStudyFilters.has("video");
  const hasDiagramFilter = (
    hasDiagramOnly ||
    noDiagramOnly ||
    playerHasDiagramOnly ||
    playerNeedsDiagramOnly
  );
  if (hasDiagramFilter) _warmPlaybookMediaFilterManifests(plays);
  // Keep the full, safe list visible while any requested Cloudflare answer is
  // still in flight. Previously a second render could see the batch already
  // pending and prematurely filter from a partial cache, which made a fresh
  // player device appear to have only one diagram (or none at all).
  const checkingDiagramFilter =
    hasDiagramFilter && _hasUnresolvedPlaybookMediaManifests(plays);
  const hasClipFilter = hasClipsOnly || playerHasVideoOnly;
  if (hasClipFilter) _warmPlaybookClipFilterIndex();
  const checkingClipFilter = hasClipFilter && _isPlaybookClipFilterChecking();
  const gameWeek = getGameWeek();
  // A current plan can be built from both board cards and dashboard/playbook
  // tags. They are complementary sources, not fallbacks: preferring a small
  // non-empty board used to hide the rest of a coach's tagged game plan.
  const boardGamePlanMembership = gamePlanOnly && typeof getGamePlanBoardMembership === "function"
    ? getGamePlanBoardMembership()
    : {
      signatures: gamePlanOnly && typeof getGamePlanBoardSignatures === "function"
        ? getGamePlanBoardSignatures()
        : new Set(),
      sourceIds: new Set(),
    };
  const gamePlanKey = gameWeek.opponentName || "__unassigned__";
  const taggedForOpponent = gamePlanOnly && typeof getGamePlanTags === "function"
    ? new Set((getGamePlanTags()[gamePlanKey] || []))
    : new Set();
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
    if (gamePlanOnly) {
      if (!boardGamePlanMembership.signatures.size && !boardGamePlanMembership.sourceIds.size && !taggedForOpponent.size) return false;
      const gpSig = meta ? meta.gpSig : (typeof _gpPlaySignature === "function" ? _gpPlaySignature(play) : playSignature(play));
      const tagSig = meta ? meta.tagSig : playSignature(play);
      const sourceId = typeof getStablePlaySourceId === "function"
        ? getStablePlaySourceId(play)
        : String(play?.playbookId || play?.sourcePlayId || play?.originalPlayId || play?.id || "").trim();
      const onBoard = boardGamePlanMembership.signatures.has(gpSig) ||
        Boolean(sourceId && boardGamePlanMembership.sourceIds.has(sourceId));
      if (!onBoard && !taggedForOpponent.has(tagSig)) return false;
    }
    if (jvOnly) {
      if (!jvFlagged || typeof _gpPlaySignature !== "function") return false;
      const gpSig = meta ? meta.gpSig : _gpPlaySignature(play);
      if (!jvFlagged.has(gpSig)) return false;
    }
    if (scoutOnly) {
      const recs = typeof _tdScoutRecs !== "undefined" && Array.isArray(_tdScoutRecs) ? _tdScoutRecs : [];
      if (!recs.some((r) => typeof samePlayRef === "function" && samePlayRef(r.play, play))) return false;
    }
    if (inWeekOnly || unusedOnly) {
      const inScript = Array.isArray(script) && script.some((s) => !s.isSeparator && typeof samePlayRef === "function" && samePlayRef(s, play));
      const onSheet = typeof getCallSheetPlayLocations === "function" && getCallSheetPlayLocations(play).length > 0;
      const inWeek = inScript || onSheet;
      if (inWeekOnly && !inWeek) return false;
      if (unusedOnly && inWeek) return false;
    }
    if (!checkingDiagramFilter) {
      if (hasDiagramOnly && !_playbookHasDiagramForCurrentViewer(play)) return false;
      if (noDiagramOnly && _playbookHasDiagramForCurrentViewer(play)) return false;
    }
    if (hasClipsOnly && !checkingClipFilter && !_playbookHasClipForCurrentViewer(play)) return false;
    if (playerPlaybookStudyFilters.size > 0) {
      // Study filters use the published cloud manifest, not just the diagrams
      // already downloaded to this device. Otherwise a fresh phone only shows
      // the one diagram the user happened to open first.
      if (!checkingDiagramFilter) {
        if (playerHasDiagramOnly && !_playbookHasDiagramForCurrentViewer(play)) return false;
        if (playerNeedsDiagramOnly && _playbookHasDiagramForCurrentViewer(play)) return false;
      }
      if (playerHasVideoOnly && !checkingClipFilter && !_playbookHasClipForCurrentViewer(play)) return false;
      if (playerPlaybookStudyFilters.has("notes") && !_playbookHasPlayerNotes(play)) return false;
    }
    // Test filters against coherent effective variants, but keep the
    // canonical play as the one rendered result. A "Gold + Motion" query,
    // for example, matches only when one approved Gold version has that
    // motion—not when those values happen to exist on separate versions.
    const filterVariants = meta?.filterVariants || (
      typeof getPlayFilterVariants === "function" ? getPlayFilterVariants(play) : [play]
    );
    const matchesVariantFilters = filterVariants.some((candidate) => {
      if (activeTypes.size > 0 && !activeTypes.has(candidate.type)) return false;
      if (activePersonnel.size > 0 && !activePersonnel.has(candidate.personnel)) return false;
      if (formation && candidate.formation !== formation) return false;
      if (basePlay && candidate.basePlay !== basePlay) return false;
      if (back && candidate.back !== back) return false;
      if (motion && candidate.motion !== motion) return false;
      if (protection && candidate.protection !== protection) return false;
      if (tempo && candidate.tempo !== tempo) return false;
      if (search) {
        const candidateSearchText = PLAYBOOK_RUNTIME_SEARCH_FIELDS
          .map((field) => candidate[field])
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!candidateSearchText.includes(search)) return false;
      }
      return true;
    });
    if (!matchesVariantFilters) return false;
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
  _refreshPlayerPlaybookFilterOverlay();
}

function clearTypeFilters() {
  activeTypeChips.clear();
  document
    .querySelectorAll("#pbChipsType .pb-chip.active")
    .forEach((chip) => chip.classList.remove("active"));
  if (typeof invalidateStatsBarCache === "function") invalidateStatsBarCache();
  filterPlays();
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
        .flatMap((play) => typeof getPlayFilterVariants === "function"
          ? getPlayFilterVariants(play)
          : [play])
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
  closePlayerPlaybookFilters({ returnFocus: false, immediate: true });
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
  overlay.setAttribute("aria-hidden", "false");

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
        <button type="button" class="btn btn-primary" id="playerPlaybookFilterApply" data-action="presentPlayerFilteredPlays">Show ${filteredPlays.length} play${filteredPlays.length === 1 ? "" : "s"}</button>
      </footer>
    </section>`;

  document.body.appendChild(overlay);
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "player-playbook-filters",
      scrollElement: overlay.querySelector(".pb-player-filter-body"),
      blocking: true,
      initialFocus: ".pb-player-filter-close",
      onEscape: () => closePlayerPlaybookFilters(),
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
  }
  requestAnimationFrame(() => {
    overlay.classList.add("visible");
    overlay.querySelector(".pb-player-filter-close")?.focus();
  });
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

function closePlayerPlaybookFilters(options = {}) {
  const overlay = document.getElementById("playerPlaybookFilterOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  if (typeof closeLayer === "function") {
    closeLayer(overlay, { returnFocus: options.returnFocus !== false });
  }
  if (options.immediate) {
    overlay.remove();
    return;
  }
  setTimeout(() => overlay.remove(), 160);
}

function _refreshPlayerPlaybookFilterOverlay() {
  const overlay = document.getElementById("playerPlaybookFilterOverlay");
  if (!overlay) return;
  overlay.querySelectorAll(".pb-player-filter-option[data-arg]").forEach((button) => {
    const parsed = _decodePlayerPlaybookFilterArg(button.dataset.arg);
    const group = parsed && PLAYER_PLAYBOOK_FILTER_GROUPS.find((item) => item.key === parsed.key);
    const active = Boolean(parsed && group && _isPlayerPlaybookFilterActive(group, parsed.value));
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const apply = overlay.querySelector("#playerPlaybookFilterApply");
  if (apply) apply.textContent = `Show ${filteredPlays.length} play${filteredPlays.length === 1 ? "" : "s"}`;
}

function presentPlayerFilteredPlays() {
  closePlayerPlaybookFilters();
  return openSelectedPlaybookPresentation();
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
  _refreshPlayerPlaybookFilterOverlay();
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
