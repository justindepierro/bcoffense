function renderPlaybook() {
  // Guard against early renders (e.g. clip-index warm-up) firing before app.js
  // has declared the `plays` global; a proper render follows once it loads.
  if (typeof plays === "undefined" || !Array.isArray(plays)) return;
  try {
    const tbody = document.querySelector("#playbookTable tbody");
    const searchTerm =
      document.getElementById("searchPlay")?.value?.trim().toLowerCase() || "";
    const currentUser =
      typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    const isReadOnlyViewer = Boolean(
      currentUser &&
      !(typeof isAdminUser === "function" ? isAdminUser() : false),
    );
    const highlight = createSearchHighlighter(searchTerm);
    const runtimeIndex =
      typeof getPlaybookRuntimeIndex === "function" ? getPlaybookRuntimeIndex() : null;

    // Vision Mode: small picture pill next to play name. Hidden when off.
    const visionOn = typeof isVisionMode === "function" && isVisionMode();
    const PICTURE_PILLS = {
      wideZone: { label: "WZ", title: "Wide Zone", cls: "pb-pic-wz" },
      pullers: { label: "Pull", title: "Pullers / Counter", cls: "pb-pic-pull" },
      downhill: { label: "DH", title: "Downhill / ISO", cls: "pb-pic-dh" },
      antiFront: { label: "AF", title: "Anti-front", cls: "pb-pic-af" },
    };
    const picturePillFor = (play) => {
      if (!visionOn || typeof getPlayPicture !== "function") return "";
      const pic = getPlayPicture(play);
      if (!pic || !PICTURE_PILLS[pic]) return "";
      const def = PICTURE_PILLS[pic];
      return ` <span class="pb-picture-pill ${def.cls}" title="${def.title}">${def.label}</span>`;
    };

    const totalFiltered = filteredPlays.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / PLAYS_PER_PAGE));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    const start = currentPage * PLAYS_PER_PAGE;
    const pageSlice = filteredPlays.slice(start, start + PLAYS_PER_PAGE);
    const gw = typeof getGameWeek === "function" ? getGameWeek() : { opponentName: null };
    const activeOpponent = gw && gw.opponentName ? gw.opponentName : "";
    const activeTags = activeOpponent && typeof getGamePlanTags === "function"
      ? new Set((getGamePlanTags()[activeOpponent] || []))
      : null;
    const jvFlagged = typeof _gpFlaggedSigs === "function" ? _gpFlaggedSigs("jv") : new Set();
    const wbFlagged = typeof _gpFlaggedSigs === "function" ? _gpFlaggedSigs("wb") : new Set();
    const usageIndex =
      typeof getPlayUsageIndex === "function" ? getPlayUsageIndex() : null;
    const imageSignatureFor = (play, fallbackSig) => {
      if (
        typeof window !== "undefined" &&
        window.playImages &&
        typeof window.playImages.storedSignatureForPlay === "function"
      ) {
        return window.playImages.storedSignatureForPlay(play);
      }
      return fallbackSig && window.playImages?.has(fallbackSig)
        ? fallbackSig
        : "";
    };
    const pageItems = pageSlice.map((play, localIdx) => {
      const meta = runtimeIndex && runtimeIndex.byPlay ? runtimeIndex.byPlay.get(play) : null;
      const tagSig = meta
        ? meta.tagSig
        : (typeof playSignature === "function" ? playSignature(play) : "");
      const gpSig = meta
        ? meta.gpSig
        : ((typeof _gpPlaySignature === "function") ? _gpPlaySignature(play) : "");
      const onWristband = isPlayOnHighlightedWristband(play);
      const readinessSummary =
        typeof getPlayReadinessSummary === "function" &&
          typeof isPlayReadinessCoachRole === "function" &&
          isPlayReadinessCoachRole()
          ? getPlayReadinessSummary(play)
          : null;
      const readinessBadge =
        typeof renderPlayReadinessCompactBadgeFromSummary === "function" && readinessSummary
          ? renderPlayReadinessCompactBadgeFromSummary(readinessSummary, {
            variant: "playbook-table",
            detail: false,
            playbookIdx: start + localIdx,
          })
          : "";
      const readinessCardBadge =
        typeof renderPlayReadinessCompactBadgeFromSummary === "function" && readinessSummary
          ? renderPlayReadinessCompactBadgeFromSummary(readinessSummary, {
            variant: "playbook-card",
            detail: true,
          })
          : "";
      return {
        play,
        idx: start + localIdx,
        tagSig,
        gpSig,
        onWristband,
        gpActive: !!(activeTags && activeTags.has(tagSig)),
        installBadge: typeof getPlayStarBadge === "function" ? getPlayStarBadge(play) : "",
        picturePill: picturePillFor(play),
        imageSig: imageSignatureFor(play, tagSig),
        hasClips:
          typeof window !== "undefined" &&
            window.playClips &&
            typeof window.playClips.hasForPlay === "function"
            ? window.playClips.hasForPlay(play)
            : false,
        usage: usageIndex ? usageIndex.get(play) : null,
        readinessBadge,
        readinessCardBadge,
      };
    });
    renderPlayerPlaybookSummary({
      searchTerm,
      filteredCount: totalFiltered,
      currentUser,
    });

    tbody.innerHTML = pageItems
      .map((item) => {
        const { play, idx, gpSig, onWristband, gpActive, imageSig } = item;
        const wbClass = onWristband ? " on-wristband" : "";
        const gpClass = gpActive ? " in-gameplan" : "";
        const isJvFlagged = jvFlagged.has(gpSig);
        const isWbFlagged = wbFlagged.has(gpSig);
        const jvBadge = isJvFlagged
          ? '<span class="pb-jv-badge" title="Marked JV in Game Plan">\ud83d\udfe1</span>'
          : "";
        const wbFlagBadge = isWbFlagged
          ? '<span class="pb-wbflag-badge" title="Marked for wristband in Game Plan">\ud83d\udccb</span>'
          : "";
        const wbIndicator = onWristband
          ? '<span class="wb-indicator" title="On wristband">🏈</span>'
          : "";
        const imgBadge =
          imageSig
            ? `<span class="pb-img-badge" data-img-sig="${escapeHtml(imageSig)}" role="button" tabindex="0" aria-label="Preview play image" title="Hover to preview image">\ud83d\uddbc\ufe0f</span>`
            : "";
        const clipBadge = item.hasClips
          ? `<span class="pb-clip-badge" data-action="openPlaybookClipViewer" data-arg="${idx}" role="button" tabindex="0" title="Watch video clips" aria-label="Watch video clips">\ud83c\udfac</span>`
          : "";

        const gpToggle = activeOpponent
          ? `<button class="gp-toggle-btn${gpActive ? " gp-active" : ""}" data-action="togglePlaybookGamePlan" data-idx="${idx}" title="${gpActive ? "Remove from" : "Add to"} game plan">🎯</button>`
          : "";
        const rowTitle = isReadOnlyViewer
          ? "Click to select and use Present to study this play"
          : "Click to select, double-click to edit";

        return `
            <tr class="${wbClass}${gpClass}" data-action="selectPlaybookRow" data-idx="${idx}"  
                data-preview="${idx}"
                title="${rowTitle}">
                <td class="col-gameplan">${gpToggle}</td>
                <td class="col-install">${item.installBadge}</td>
                <td class="col-type col-type--${(play.type || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')}">${wbIndicator}${jvBadge}${wbFlagBadge}${imgBadge}${clipBadge}<span class="play-type-chip">${highlight(play.type)}</span></td>
                <td class="col-formation">${highlight(play.formation)}</td>
                <td class="col-tags">${escapeHtml([play.formTag1, play.formTag2].filter(Boolean).join(", ") || "-")}</td>
                <td class="col-back">${highlight(play.back || "-")}</td>
                <td class="col-motion">${highlight(play.motion || "-")}</td>
                <td class="col-protection">${highlight(play.protection || "-")}</td>
                <td class="col-play play-cell" data-action="copyPlayName" data-play="${escapeHtml(play.play)}"><strong>${highlight(play.play)}</strong> ${escapeHtml([play.playTag1, play.playTag2].filter(Boolean).join(" "))}${item.picturePill}${_renderPlayUsagePills(item.usage, usageIndex?.weekLabel)}${item.readinessBadge}<button class="pb-present-btn" data-action="openPlaybookPresentation" data-idx="${idx}" data-arg="${idx}" title="Present this play" aria-label="Present ${escapeHtml(getPlayPresentationPlayLabel(play))}">▶</button></td>
                <td class="col-basePlay">${escapeHtml(play.basePlay || "-")}</td>
                <td class="col-tempo">${escapeHtml(play.tempo || "-")}</td>
            </tr>
        `;
      })
      .join("");

    let cardsEl = document.getElementById("pbCards");
    if (!cardsEl) {
      cardsEl = document.createElement("div");
      cardsEl.id = "pbCards";
      cardsEl.className = "pb-cards";
      const container = document.getElementById("playbookContainer");
      if (container) container.insertBefore(cardsEl, container.firstChild);
    }
    cardsEl.innerHTML = pageItems
      .map((item) => {
        const { play, idx, gpSig, onWristband, imageSig } = item;
        const wbClass = onWristband ? " on-wristband" : "";
        const gpCardActive = item.gpActive;
        const gpClass = gpCardActive ? " in-gameplan" : "";
        const cardJv = jvFlagged.has(gpSig)
          ? '<span class="pb-jv-badge" title="Marked JV in Game Plan">\ud83d\udfe1</span>'
          : "";
        const cardWbFlag = wbFlagged.has(gpSig)
          ? '<span class="pb-wbflag-badge" title="Marked for wristband in Game Plan">\ud83d\udccb</span>'
          : "";
        const cardImgBadge =
          imageSig
            ? `<span class="pb-img-badge" data-img-sig="${escapeHtml(imageSig)}" role="button" tabindex="0" aria-label="Preview play image" title="Hover to preview image">\ud83d\uddbc\ufe0f</span>`
            : "";
        const cardClipBadge = item.hasClips
          ? `<span class="pb-clip-badge" data-action="openPlaybookClipViewer" data-arg="${idx}" role="button" tabindex="0" title="Watch video clips" aria-label="Watch video clips">\ud83c\udfac</span>`
          : "";
        const gpCardToggle = activeOpponent
          ? `<button class="gp-toggle-btn gp-card-btn${gpCardActive ? " gp-active" : ""}" data-action="togglePlaybookGamePlan" data-idx="${idx}" title="${gpCardActive ? "Remove from" : "Add to"} game plan">🎯</button>`
          : "";
        const pills = [play.type, play.back, play.motion, play.tempo]
          .filter(Boolean)
          .map((value) => `<span class="pb-card-pill">${escapeHtml(value)}</span>`)
          .join("");
        return `
          <div class="pb-card${wbClass}${gpClass}" data-action="selectPlaybookRow" data-idx="${idx}" data-preview="${idx}"
               tabindex="0" role="button"
               aria-label="${escapeHtml(play.formation)} ${escapeHtml(play.play)}">
            <div class="pb-card-play">${gpCardToggle}${item.installBadge}${cardJv}${cardWbFlag}${cardImgBadge}${cardClipBadge} ${highlight(play.formation)} ${highlight(play.protection || "")} ${highlight(play.play)}${item.picturePill}<button class="pb-present-btn" data-action="openPlaybookPresentation" data-arg="${idx}" title="Present this play" aria-label="Present ${escapeHtml(getPlayPresentationPlayLabel(play))}">▶</button></div>
            <div class="pb-card-sub">${highlight(play.type)}${play.motion ? " · " + highlight(play.motion) : ""}${play.back ? " · " + highlight(play.back) : ""}</div>
            ${_renderPlayUsagePills(item.usage, usageIndex?.weekLabel)}
            ${item.readinessCardBadge}
            <div class="pb-card-pills">${pills}</div>
          </div>
        `;
      })
      .join("");

    let emptyEl = document.getElementById("pbEmptyState");
    if (!emptyEl) {
      emptyEl = document.createElement("div");
      emptyEl.id = "pbEmptyState";
      emptyEl.className = "empty-state empty-state--bordered";
      const container = document.getElementById("playbookContainer");
      if (container) container.appendChild(emptyEl);
    }
    if (pageSlice.length === 0) {
      const jvOn = document.getElementById("pbJvFilter")?.checked || false;
      const jvCount =
        typeof getGamePlanFlaggedCount === "function"
          ? getGamePlanFlaggedCount("jv")
          : 0;
      if (plays.length === 0) {
        const currentUser =
          typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
        const canImport =
          !currentUser ||
          (typeof canManageSettings === "function" && canManageSettings());
        emptyEl.innerHTML = canImport
          ? '<p class="empty-state__text">No playbook loaded yet.</p><p class="empty-state__hint">Import a CSV or restore a backup, then this mobile workspace will stay navigable.</p><button class="btn btn-primary" data-action="showUpload">Import or Restore</button>'
          : '<p class="empty-state__text">No playbook loaded yet.</p><p class="empty-state__hint">You can still use the navigation below. Ask an admin to import or restore the team playbook.</p>';
      } else if (jvOn && jvCount === 0) {
        emptyEl.innerHTML =
          '<p class="empty-state__text">🟡 No plays marked as JV in the Game Plan yet.</p><p class="empty-state__hint">Open the <strong>Game Plan</strong> tab and tap the 🟡 chip on any play to mark it for the JV / freshmen package.</p><button class="btn btn-secondary" data-action="clearAllFilters">✕ Clear All Filters</button>';
      } else {
        emptyEl.innerHTML =
          '<p class="empty-state__text">No plays match your filters.</p><p class="empty-state__hint">Try removing a filter, broadening your search, or clearing the Type and Personnel chips above.</p><button class="btn btn-sm btn-secondary" data-action="clearAllFilters">✕ Clear All Filters</button>';
      }
    }
    emptyEl.hidden = pageSlice.length > 0;

    const countEl = document.getElementById("playCount");
    if (countEl) {
      if (totalFiltered <= PLAYS_PER_PAGE) {
        countEl.textContent = `Showing ${totalFiltered} of ${plays.length} plays`;
      } else {
        countEl.textContent = `Showing ${start + 1}–${Math.min(start + PLAYS_PER_PAGE, totalFiltered)} of ${totalFiltered} plays (${plays.length} total)`;
      }
    }

    _renderPagination(totalPages, totalFiltered);
    updateStatsBar();

    if (selectedRowIndex >= 0 && selectedRowIndex < filteredPlays.length) {
      const rows = tbody.querySelectorAll("tr");
      const localSel = selectedRowIndex - start;
      if (localSel >= 0 && localSel < rows.length) {
        rows[localSel].classList.add("selected");
        if (cardsEl && cardsEl.children[localSel]) {
          cardsEl.children[localSel].classList.add("selected");
        }
      }
    }

    applyColumnVisibility();
    if (typeof renderSelectedPlaybookReadinessPanel === "function") {
      renderSelectedPlaybookReadinessPanel(selectedRowIndex);
    }

    const tableWrap = document.querySelector(".table-container");
    if (tableWrap) {
      tableWrap.classList.toggle(
        "is-scrollable",
        tableWrap.scrollWidth > tableWrap.clientWidth,
      );
    }
  } catch (err) {
    console.error("renderPlaybook error:", err);
    showToast("❌ Error rendering playbook.", {
      duration: 3000,
      type: "error",
    });
  }
}

function _renderPlayUsagePills(usage, weekLabel) {
  if (!usage) return "";
  const scriptCount = Number(usage.script || 0);
  const weekCount = Number(usage.week || 0);
  const seasonCount = Number(usage.season || 0);
  if (scriptCount <= 0 && weekCount <= 0 && seasonCount <= 0) return "";
  const label = weekLabel || "current week";
  return `
    <span class="pb-usage" title="Rep-weighted usage: current script ${scriptCount}, ${label} ${weekCount}, season ${seasonCount}">
      <span class="pb-usage-pill">Script ${scriptCount}</span>
      <span class="pb-usage-pill">Week ${weekCount}</span>
      <span class="pb-usage-pill">Season ${seasonCount}</span>
    </span>`;
}

function renderPlayerPlaybookSummary({ searchTerm = "", filteredCount = 0, currentUser = null } = {}) {
  const section = document.getElementById("playerPlaybookSummary");
  if (!section) return;

  const isPlayer = currentUser?.role === "player";
  if (!isPlayer) {
    section.hidden = true;
    section.innerHTML = "";
    return;
  }

  const publishedScripts =
    typeof getPlayerPublishedScripts === "function" ? getPlayerPublishedScripts() : [];
  const featuredScript = publishedScripts[0] || null;
  const loadedScriptStats = Array.isArray(script) && script.some((item) => item && !item.isSeparator)
    && typeof getSavedScriptStats === "function"
    ? getSavedScriptStats({
      plays: script,
      date: document.getElementById("scriptDate")?.value || "",
      savedAt: "",
    })
    : null;
  const hasFilters =
    Boolean(searchTerm) ||
    activeTypeChips.size > 0 ||
    activePersonnelChips.size > 0 ||
    activePictureChips.size > 0 ||
    [
      "filterFormation",
      "filterBasePlay",
      "pbFilterBack",
      "pbFilterMotion",
      "pbFilterProtection",
      "pbFilterTempo",
    ].some((id) => Boolean(document.getElementById(id)?.value)) ||
    Boolean(document.getElementById("pbGamePlanFilter")?.checked) ||
    Boolean(document.getElementById("pbJvFilter")?.checked);

  const stats = [
    `${plays.length} total plays`,
    `${filteredCount} showing`,
    loadedScriptStats
      ? `${loadedScriptStats.playCount} practice plays loaded`
      : `${publishedScripts.length} published practice${publishedScripts.length === 1 ? "" : "s"}`,
  ];
  const featuredScriptId = featuredScript ? escapeHtml(String(featuredScript.id)) : "";
  const primaryAction = loadedScriptStats
    ? '<button type="button" class="btn btn-primary" data-action="showTab" data-arg="script">Open Practice</button>'
    : featuredScript
      ? `<button type="button" class="btn btn-primary" data-action="loadPublishedPlayerScript" data-arg="${featuredScriptId}">Load Latest Practice</button>`
      : '<button type="button" class="btn btn-primary" data-action="showTab" data-arg="script">Open Practice Tab</button>';
  const secondaryAction = loadedScriptStats
    ? '<button type="button" class="btn btn-secondary" data-action="openScriptPresentation">Swipe Loaded Script</button>'
    : featuredScript
      ? `<button type="button" class="btn btn-secondary" data-action="presentPublishedPlayerScript" data-arg="${featuredScriptId}">Open Swipe View</button>`
      : '<button type="button" class="btn btn-secondary" data-action="showTab" data-arg="dashboard">Player Home</button>';
  const tertiaryAction = hasFilters
    ? '<button type="button" class="btn btn-secondary" data-action="clearAllFilters">Clear Filters</button>'
    : "";

  section.hidden = false;
  section.innerHTML = `
    <div class="pb-player-summary__main">
      <div class="pb-player-summary__copy">
        <span class="pb-player-summary__eyebrow">Player Playbook</span>
        <h2>Study the full menu without the staff clutter.</h2>
        <p>Search by play name, personnel, formation, motion, protection, and tempo. Use Present on any play to see the diagram full screen.</p>
      </div>
      <div class="pb-player-summary__actions">
        ${primaryAction}
        ${secondaryAction}
        ${tertiaryAction}
      </div>
    </div>
    <div class="pb-player-summary__stats">
      ${stats.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}
    </div>
    <div class="pb-player-summary__filters" aria-label="Suggested player filters">
      <span class="pb-player-summary__filter-pill">Personnel</span>
      <span class="pb-player-summary__filter-pill">Formation</span>
      <span class="pb-player-summary__filter-pill">Base Play</span>
      <span class="pb-player-summary__filter-pill">Motion</span>
      <span class="pb-player-summary__filter-pill">Protection</span>
      <span class="pb-player-summary__filter-pill">Tempo</span>
    </div>
  `;
}

function createSearchHighlighter(searchTerm) {
  if (!searchTerm) return (text) => escapeHtml(text);
  const escaped = escapeHtml(searchTerm).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return (text) => {
    if (!text || text === "-") return escapeHtml(text);
    return escapeHtml(String(text)).replace(regex, '<span class="search-highlight">$1</span>');
  };
}

const _scheduleRenderPlaybook = createRAFRenderer(renderPlaybook);

function requestRenderPlaybook() {
  _scheduleRenderPlaybook();
}

function _playbookDocKeydown(e) {
  const activeEl = document.activeElement;
  const inInput =
    activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA";

  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !inInput) {
    e.preventDefault();
    showKeyboardShortcuts();
  }

  if (e.key === "/" && !e.ctrlKey && !e.metaKey && !inInput) {
    e.preventDefault();
    document.getElementById("searchPlay")?.focus();
  }

  if (e.key === "Escape") {
    hideKeyboardShortcuts();
    hideColumnMenu();
  }
}

function initPlaybookKeyboard() {
  const container = document.getElementById("playbookContainer");
  if (!container) return;

  if (!container._kbInit) {
    container.addEventListener("keydown", (e) => {
      const rows = document.querySelectorAll("#playbookTable tbody tr");
      if (rows.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          selectedRowIndex = Math.min(selectedRowIndex + 1, rows.length - 1);
          selectPlaybookRow(selectedRowIndex);
          rows[selectedRowIndex]?.scrollIntoView({ block: "nearest" });
          break;
        case "ArrowUp":
          e.preventDefault();
          selectedRowIndex = Math.max(selectedRowIndex - 1, 0);
          selectPlaybookRow(selectedRowIndex);
          rows[selectedRowIndex]?.scrollIntoView({ block: "nearest" });
          break;
        case "Enter":
          e.preventDefault();
          if (selectedRowIndex >= 0) {
            if (typeof isAdminUser === "function" && !isAdminUser()) {
              openPlaybookPresentation(selectedRowIndex);
            } else {
              addPlayFromPlaybook(selectedRowIndex);
            }
          }
          break;
        case "c":
          if (e.metaKey || e.ctrlKey) {
            if (selectedRowIndex >= 0 && filteredPlays[selectedRowIndex]) {
              e.preventDefault();
              copyPlayName(filteredPlays[selectedRowIndex].play);
            }
          }
          break;
      }
    });
    container._kbInit = true;
  }

  document.removeEventListener("keydown", _playbookDocKeydown);
  document.addEventListener("keydown", _playbookDocKeydown);
}

let _statsBarCache = null;

function invalidateStatsBarCache() {
  _statsBarCache = null;
}

function updateStatsBar() {
  const statsBar = document.getElementById("statsBar");
  if (!statsBar) return;

  if (_statsBarCache && !activeTypeChips?.size && !activePersonnelChips?.size && !activePictureChips?.size) {
    statsBar.innerHTML = _statsBarCache;
    return;
  }

  const typeCounts = {};
  plays.forEach((play) => {
    const type = play.type || "Unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  const html = sorted
    .map(([type, count]) => {
      const isActive = activeTypeChips?.has(type);
      return `<button type="button" class="stat-item${isActive ? " stat-item--active" : ""}" data-action="filterByTypeStat" data-arg="${escapeHtml(type)}"><span class="stat-count">${count}</span> ${escapeHtml(type)}</button>`;
    })
    .join("");

  const totalChip = `<button type="button" class="stat-item stat-item--total${activeTypeChips?.size ? '' : ' stat-item--all-active'}" data-action="clearTypeFilters" title="Show all play types"><span class="stat-count">${plays.length}</span> Total</button>`;

  if (!activeTypeChips?.size) _statsBarCache = totalChip + html;
  statsBar.innerHTML = totalChip + html;
}
