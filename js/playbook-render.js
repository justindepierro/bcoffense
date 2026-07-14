let _playbookImageKeyRefreshPending = false;

function renderPlaybookLoadingState(message = "Loading playbook...") {
  const tbody = document.querySelector("#playbookTable tbody");
  if (tbody && tbody.children.length === 0) {
    tbody.innerHTML = Array(6)
      .fill("")
      .map(
        () =>
          `<tr class="pb-loading-row" data-loading-state="playbook">
            <td colspan="11">
              <div class="pb-loading-row__content">
                <span class="pb-loading-row__text">${escapeHtml(message)}</span>
                <div class="skeleton-row" aria-hidden="true"></div>
              </div>
            </td>
          </tr>`,
      )
      .join("");
  }

  const container = document.getElementById("playbookContainer");
  if (!container) return;
  let cardsEl = document.getElementById("pbCards");
  if (!cardsEl) {
    cardsEl = document.createElement("div");
    cardsEl.id = "pbCards";
    cardsEl.className = "pb-cards";
    container.insertBefore(cardsEl, container.firstChild);
  }
  if (!cardsEl.innerHTML.trim()) {
    cardsEl.innerHTML = Array(4)
      .fill("")
      .map(
        () =>
          `<div class="pb-card pb-card--loading" data-loading-state="playbook-card">
            <div class="skeleton-row" aria-hidden="true"></div>
            <div class="skeleton-row" aria-hidden="true"></div>
            <span>${escapeHtml(message)}</span>
          </div>`,
      )
      .join("");
  }
}

function ensurePlaybookImageBadgesReady() {
  if (
    typeof window === "undefined" ||
    !window.playImages ||
    typeof window.playImages.loadKeys !== "function"
  ) {
    return;
  }
  if (
    typeof window.playImages.isKeyCacheReady === "function" &&
    window.playImages.isKeyCacheReady()
  ) {
    return;
  }
  if (_playbookImageKeyRefreshPending) return;
  _playbookImageKeyRefreshPending = true;
  window.playImages
    .loadKeys()
    .then(() => {
      _playbookImageKeyRefreshPending = false;
      if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
    })
    .catch(() => {
      _playbookImageKeyRefreshPending = false;
    });
}

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
    ensurePlaybookImageBadgesReady();
    const imageSignatureFor = (play, fallbackSig) => {
      if (
        typeof window !== "undefined" &&
        window.playImages &&
        typeof window.playImages.storedDisplaySignatureForPlay === "function"
      ) {
        return window.playImages.storedDisplaySignatureForPlay(play);
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
        signalCount:
          typeof getSignalCountForPlay === "function"
            ? getSignalCountForPlay(play)
            : 0,
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
        const signalBadge = item.signalCount
          ? `<span class="pb-signal-badge" data-action="openPlaybookSignalSelector" data-arg="${idx}" role="button" tabindex="0" title="Watch play signals" aria-label="Watch ${item.signalCount} signal clips">Signals</span>`
          : "";

        const gpToggle = activeOpponent
          ? `<button class="gp-toggle-btn${gpActive ? " gp-active" : ""}" data-action="togglePlaybookGamePlan" data-idx="${idx}" data-arg="${idx}" title="${gpActive ? "Remove from" : "Add to"} game plan">🎯</button>`
          : "";
        const rowTitle = isReadOnlyViewer
          ? "Click to select and use Present to study this play"
          : "Click to select, double-click to edit";
        const editButton = isReadOnlyViewer
          ? ""
          : `<button class="pb-edit-btn" data-action="openPlayEditor" data-idx="${idx}" data-arg="${idx}" title="Edit this play" aria-label="Edit ${escapeHtml(play.play)}">✎</button>`;

        return `
            <tr class="${wbClass}${gpClass}" data-action="selectPlaybookRow" data-idx="${idx}" data-arg="${idx}"
                data-preview="${idx}"
                title="${rowTitle}">
                <td class="col-gameplan">${gpToggle}</td>
                <td class="col-install">${item.installBadge}</td>
                <td class="col-type col-type--${(play.type || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z-]/g, '')}">${wbIndicator}${jvBadge}${wbFlagBadge}${imgBadge}${clipBadge}${signalBadge}<span class="play-type-chip">${highlight(play.type)}</span></td>
                <td class="col-formation">${highlight(play.formation)}</td>
                <td class="col-tags">${escapeHtml([play.formTag1, play.formTag2].filter(Boolean).join(", ") || "-")}</td>
                <td class="col-back">${highlight(play.back || "-")}</td>
                <td class="col-motion">${highlight(play.motion || "-")}</td>
                <td class="col-protection">${highlight(play.protection || "-")}</td>
                <td class="col-play play-cell" data-action="copyPlayName" data-play="${escapeHtml(play.play)}"><strong>${highlight(play.play)}</strong> ${escapeHtml([play.playTag1, play.playTag2].filter(Boolean).join(" "))}${item.picturePill}${_renderPlayUsagePills(item.usage, usageIndex?.weekLabel)}${_renderWorkflowChips(play, idx)}${item.readinessBadge}${editButton}<button class="pb-present-btn" data-action="openPlaybookPresentation" data-idx="${idx}" data-arg="${idx}" title="Present this play" aria-label="Present ${escapeHtml(getPlayPresentationPlayLabel(play))}">▶</button><button class="pb-add-week-btn" data-action="addPlayToWeek" data-arg="${idx}" title="Add to week — Game Plan, Script, Wristband, or Call Sheet">⊕</button>${typeof askCoachAboutPlay === "function" ? `<button class="pb-ask-coach-btn" data-action="askCoachAboutPlay" data-arg="${idx}" title="Ask a question about this play" aria-label="Ask a question about ${escapeHtml(play.play)}">❓</button>` : ""}</td>
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
        const cardSignalBadge = item.signalCount
          ? `<span class="pb-signal-badge" data-action="openPlaybookSignalSelector" data-arg="${idx}" role="button" tabindex="0" title="Watch play signals" aria-label="Watch ${item.signalCount} signal clips">Signals</span>`
          : "";
        const hasCoachNotes = String(play.playerNotes || "").trim();
        const studyBadges = [
          imageSig
            ? '<span class="pb-card-study-badge pb-card-study-badge--diagram">Diagram</span>'
            : '<span class="pb-card-study-badge pb-card-study-badge--missing">Needs diagram</span>',
          item.hasClips ? '<span class="pb-card-study-badge pb-card-study-badge--film">Film</span>' : "",
          item.signalCount ? '<span class="pb-card-study-badge pb-card-study-badge--signals">Signals</span>' : "",
          hasCoachNotes ? '<span class="pb-card-study-badge pb-card-study-badge--notes">Coach note</span>' : "",
        ].filter(Boolean).join("");
        const gpCardToggle = activeOpponent
          ? `<button class="gp-toggle-btn gp-card-btn${gpCardActive ? " gp-active" : ""}" data-action="togglePlaybookGamePlan" data-idx="${idx}" data-arg="${idx}" title="${gpCardActive ? "Remove from" : "Add to"} game plan">🎯</button>`
          : "";
        const cardEditButton = isReadOnlyViewer
          ? ""
          : `<button class="pb-edit-btn" data-action="openPlayEditor" data-idx="${idx}" data-arg="${idx}" title="Edit this play" aria-label="Edit ${escapeHtml(play.play)}">✎</button>`;
        const pills = [play.type, play.back, play.motion, play.tempo]
          .filter(Boolean)
          .map((value) => `<span class="pb-card-pill">${escapeHtml(value)}</span>`)
          .join("");
        const playerCardMedia =
          currentUser?.role === "player" ? _renderPlayerPlaybookCardMedia(item) : "";
        const playerCardNote =
          currentUser?.role === "player" ? _renderPlayerPlaybookCardNote(play) : "";
        return `
          <div class="pb-card${wbClass}${gpClass}" data-action="selectPlaybookRow" data-idx="${idx}" data-arg="${idx}" data-preview="${idx}"
               tabindex="0" role="button"
               aria-label="${escapeHtml(play.formation)} ${escapeHtml(play.play)}">
            ${playerCardMedia}
            <div class="pb-card-play">${gpCardToggle}${item.installBadge}${cardJv}${cardWbFlag}${cardImgBadge}${cardClipBadge}${cardSignalBadge} ${highlight(play.formation)} ${highlight(play.protection || "")} ${highlight(play.play)}${item.picturePill}${cardEditButton}<button class="pb-present-btn" data-action="openPlaybookPresentation" data-arg="${idx}" title="Present this play" aria-label="Present ${escapeHtml(getPlayPresentationPlayLabel(play))}">▶</button></div>
            <div class="pb-card-sub">${highlight(play.type)}${play.motion ? " · " + highlight(play.motion) : ""}${play.back ? " · " + highlight(play.back) : ""}</div>
            <div class="pb-card-study-row">${studyBadges}</div>
            ${playerCardNote}
            ${_renderPlayUsagePills(item.usage, usageIndex?.weekLabel)}
            ${item.readinessCardBadge}
            <div class="pb-card-pills">${pills}</div>
            ${_renderPlayerPlaybookCardActions(item)}
          </div>
        `;
      })
      .join("");
    if (currentUser?.role === "player") {
      hydratePlayerPlaybookThumbnails(cardsEl);
    }

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

function _renderWorkflowChips(play, idx) {
  const chips = [];
  // Script membership (#105)
  if (Array.isArray(script) && typeof playsMatch === "function") {
    if (script.some((s) => !s.isSeparator && playsMatch(s, play))) {
      chips.push(`<span class="pb-wf-chip pb-wf-script" title="In current practice script">📋 Script</span>`);
    }
  }
  // Call Sheet location (#107)
  if (typeof getCallSheetPlayLocations === "function") {
    const locs = getCallSheetPlayLocations(play);
    if (locs.length > 0) {
      const label = locs[0].replace(/ - (Left|Right)$/, "");
      const allNames = [...new Set(locs.map((l) => l.replace(/ - (Left|Right)$/, "")))].join(", ");
      chips.push(`<span class="pb-wf-chip pb-wf-sheet" title="On call sheet: ${escapeHtml(allNames)}">📄 ${escapeHtml(label)}</span>`);
    }
  }
  // Scout recommended (#108)
  if (typeof _tdScoutRecs !== "undefined" && Array.isArray(_tdScoutRecs) && _tdScoutRecs.length > 0 && typeof playsMatch === "function") {
    if (_tdScoutRecs.some((r) => playsMatch(r.play, play))) {
      chips.push(`<span class="pb-wf-chip pb-wf-scout" title="Scout recommended for current opponent">🔍 Scout</span>`);
    }
  }
  if (!chips.length) return "";
  const idxAttr = idx !== undefined ? ` data-action="openPlayWorkflowPanel" data-arg="${idx}" role="button" tabindex="0" title="View workflow status"` : "";
  return `<span class="pb-wf-chips"${idxAttr}>${chips.join("")}</span>`;
}

function _renderPlayerPlaybookCardActions(item) {
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (currentUser?.role !== "player" || !item) return "";
  const playLabel =
    typeof getPlayPresentationPlayLabel === "function"
      ? getPlayPresentationPlayLabel(item.play)
      : item.play?.play || "play";
  const askButton =
    typeof askCoachAboutPlay === "function"
      ? `<button type="button" class="pb-card-action pb-card-action--ask" data-action="askCoachAboutPlay" data-arg="${item.idx}" aria-label="Ask coach about ${escapeHtml(playLabel)}">Ask</button>`
      : "";
  const filmButton = item.hasClips
    ? `<button type="button" class="pb-card-action pb-card-action--film" data-action="openPlaybookClipViewer" data-arg="${item.idx}" aria-label="Watch film for ${escapeHtml(playLabel)}">Film</button>`
    : "";
  const signalButton = item.signalCount
    ? `<button type="button" class="pb-card-action pb-card-action--signals" data-action="openPlaybookSignalSelector" data-arg="${item.idx}" aria-label="Watch signals for ${escapeHtml(playLabel)}">Signals</button>`
    : "";
  return `
    <div class="pb-card-actions" aria-label="Player study actions">
      <button type="button" class="pb-card-action pb-card-action--study" data-action="openPlaybookPresentation" data-arg="${item.idx}" aria-label="Study ${escapeHtml(playLabel)}">Study</button>
      ${askButton}
      ${filmButton}
      ${signalButton}
    </div>`;
}

function _renderPlayerPlaybookCardMedia(item) {
  const playLabel =
    typeof getPlayPresentationPlayLabel === "function"
      ? getPlayPresentationPlayLabel(item.play)
      : item.play?.play || "play";
  const thumbSig = item?.imageSig
    ? ` data-pb-thumb-sig="${escapeHtml(item.imageSig)}"`
    : "";
  return `
    <button type="button" class="pb-card-media pb-card-media--diagram" data-action="openPlaybookPresentation"
      data-arg="${item.idx}" data-pb-thumb-idx="${item.idx}"${thumbSig}
      aria-label="Study diagram for ${escapeHtml(playLabel)}">
      <img alt="Diagram for ${escapeHtml(playLabel)}" loading="lazy" hidden />
      <span class="pb-card-media__state">Checking diagram</span>
    </button>`;
}

function _renderPlayerPlaybookCardNote(play) {
  const note = String(play?.playerNotes || "").trim();
  if (!note) return "";
  return `<div class="pb-card-note"><span>Coach</span>${escapeHtml(_truncatePlayerPlaybookText(note, 92))}</div>`;
}

function _truncatePlayerPlaybookText(text, maxLength) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function hydratePlayerPlaybookThumbnails(root = document) {
  if (
    typeof window === "undefined" ||
    !window.playImages ||
    typeof window.playImages.ensureUrl !== "function"
  ) {
    return;
  }
  root.querySelectorAll("[data-pb-thumb-idx], [data-pb-thumb-sig]").forEach((media) => {
    if (media.dataset.pbThumbLoading === "true" || media.dataset.pbThumbLoaded === "true") {
      return;
    }
    const sig = media.dataset.pbThumbSig || "";
    const playIdx = parseInt(media.dataset.pbThumbIdx || "", 10);
    const play = Number.isInteger(playIdx) && typeof filteredPlays !== "undefined" && Array.isArray(filteredPlays)
      ? filteredPlays[playIdx]
      : null;
    const img = media.querySelector("img");
    const state = media.querySelector(".pb-card-media__state");
    if (!img) return;

    const setState = (status, label) => {
      media.classList.remove(
        "pb-card-media--missing",
        "pb-card-media--error",
        "pb-card-media--offline",
        "pb-card-media--unpublished",
      );
      if (status === "unpublished") media.classList.add("pb-card-media--unpublished");
      else if (status === "offline") media.classList.add("pb-card-media--offline");
      else if (status === "load-error" || status === "error") media.classList.add("pb-card-media--error");
      else if (status === "missing") media.classList.add("pb-card-media--missing");
      if (state) state.textContent = label;
    };

    const setUrl = (url) => {
      if (!url || !media.isConnected) {
        setState("error", "Diagram issue");
        return;
      }
      img.src = url;
      img.hidden = false;
      if (typeof window.playImages.renderSmartDiagramImage === "function") {
        window.playImages
          .renderSmartDiagramImage(img, url, {
            canvasClass: "smart-diagram-canvas pb-card-media__canvas",
          })
          .catch(() => {
            img.hidden = false;
          });
      }
      media.dataset.pbThumbLoaded = "true";
      media.classList.add("is-loaded");
      if (state) state.textContent = "Open diagram";
    };

    const cachedUrl =
      typeof window.playImages.urlFor === "function" ? window.playImages.urlFor(sig) : null;
    if (cachedUrl) {
      setUrl(cachedUrl);
      return;
    }

    media.dataset.pbThumbLoading = "true";
    const readinessPromise =
      play && typeof window.playImages.ensureDisplayReadinessForPlay === "function"
        ? window.playImages.ensureDisplayReadinessForPlay(play)
        : sig
          ? window.playImages.ensureUrl(sig).then((url) => ({ status: url ? "ready" : "missing", url }))
          : Promise.resolve({ status: "missing", url: "" });
    readinessPromise
      .then((readiness) => {
        if (!media.isConnected) return;
        if (readiness?.url) {
          setUrl(readiness.url);
          return;
        }
        if (readiness?.status === "unpublished") {
          setState("unpublished", "Not published");
        } else if (readiness?.status === "offline") {
          setState("offline", "Offline");
        } else if (readiness?.status === "load-error") {
          setState("load-error", "Diagram issue");
        } else {
          setState("missing", "Needs diagram");
        }
      })
      .catch(() => {
        if (!media.isConnected) return;
        setState("error", "Diagram issue");
      })
      .finally(() => {
        if (media.isConnected) media.dataset.pbThumbLoading = "false";
      });
  });
}

async function addPlayToWeek(idx) {
  const filteredIdx = parseInt(idx, 10);
  const play =
    Number.isInteger(filteredIdx) && Array.isArray(filteredPlays)
      ? filteredPlays[filteredIdx]
      : null;
  if (!play) return;
  const masterIdx = Array.isArray(plays) ? plays.indexOf(play) : -1;
  const playLabel = play.play || play.formation || "this play";
  const destinations = [
    { label: "🎯 Game Plan", value: "gameplan" },
    { label: "📋 Practice Script", value: "script" },
    { label: "🏈 Wristband", value: "wristband" },
    { label: "📄 Call Sheet", value: "callsheet" },
  ];
  const dest = await showListPicker(`Add "${escapeHtml(playLabel)}" to:`, destinations, {
    title: "Add to Week",
    icon: "⊕",
  });
  if (!dest) return;
  if (dest === "gameplan") {
    if (typeof showTab === "function") showTab("gameplan");
    showToast("Drag or use ⊕ on a box to add this play", { duration: 3000 });
  } else if (dest === "script") {
    if (typeof addToScript === "function" && masterIdx >= 0) {
      await addToScript(masterIdx);
    } else {
      if (typeof showTab === "function") showTab("script");
      showToast("Add the play from the Available Plays panel");
    }
  } else if (dest === "wristband") {
    if (typeof showTab === "function") showTab("wristband");
    showToast("Find the play in Library and drag or tap to add", { duration: 3000 });
  } else if (dest === "callsheet") {
    if (typeof showTab === "function") showTab("callsheet");
    showToast("Use the call sheet picker to place this play", { duration: 3000 });
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
    (typeof playerPlaybookStudyFilters !== "undefined" && playerPlaybookStudyFilters.size > 0) ||
    Boolean(document.getElementById("pbGamePlanFilter")?.checked) ||
    Boolean(document.getElementById("pbJvFilter")?.checked);

  const diagramCount =
    typeof _playbookHasStoredDiagram === "function"
      ? plays.filter((play) => _playbookHasStoredDiagram(play)).length
      : 0;
  const notesCount = plays.filter((play) => String(play.playerNotes || "").trim()).length;
  const stats = [
    `${filteredCount} showing`,
    `${diagramCount} diagrams ready`,
    `${notesCount} coach notes`,
    loadedScriptStats
      ? `${loadedScriptStats.playCount} practice plays loaded`
      : `${publishedScripts.length} published practice${publishedScripts.length === 1 ? "" : "s"}`,
  ];
  const featuredScriptId = featuredScript ? escapeHtml(String(featuredScript.id)) : "";
  const practiceAction = loadedScriptStats
    ? '<button type="button" class="btn btn-primary" data-action="showTab" data-arg="script">Open Practice</button>'
    : featuredScript
      ? `<button type="button" class="btn btn-primary" data-action="loadPublishedPlayerScript" data-arg="${featuredScriptId}">Load Latest Practice</button>`
      : '<button type="button" class="btn btn-secondary" data-action="showTab" data-arg="dashboard">Player Home</button>';
  const playbookFilterAction =
    '<button type="button" class="btn btn-primary" data-action="openPlayerPlaybookFilters">Filters</button>';
  const playbookPresentAction =
    '<button type="button" class="btn btn-secondary" data-action="openSelectedPlaybookPresentation">Present Showing</button>';
  const tertiaryAction = hasFilters
    ? '<button type="button" class="btn btn-secondary" data-action="clearAllFilters">Clear Filters</button>'
    : "";

  section.hidden = false;
  section.innerHTML = `
    <div class="pb-player-summary__main">
      <div class="pb-player-summary__copy">
        <span class="pb-player-summary__eyebrow">Player Playbook</span>
        <h2>Find the play, study the picture, ask the question.</h2>
        <p>Use quick filters for diagrams, coach notes, game plan calls, personnel, and formations. Open Study when you need the full-screen swipe view.</p>
      </div>
      <div class="pb-player-summary__actions">
        ${playbookFilterAction}
        ${playbookPresentAction}
        ${practiceAction}
        ${tertiaryAction}
      </div>
    </div>
    <div class="pb-player-summary__stats">
      ${stats.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}
    </div>
    <div class="pb-player-summary__filters" aria-label="Suggested player filters">
      <span class="pb-player-summary__filter-label">Quick filters</span>
      <button type="button" class="pb-player-summary__filter-pill${_isPlayerSummaryQuickFilterActive("gamePlan", "current") ? " is-active" : ""}" data-action="applyPlayerPlaybookFilter" data-arg="gamePlan:current">Game Plan</button>
      <button type="button" class="pb-player-summary__filter-pill pb-player-summary__filter-pill--media${_isPlayerSummaryQuickFilterActive("study", "diagram") ? " is-active" : ""}" data-action="applyPlayerPlaybookFilter" data-arg="study:diagram">Diagrams</button>
      <button type="button" class="pb-player-summary__filter-pill pb-player-summary__filter-pill--notes${_isPlayerSummaryQuickFilterActive("study", "notes") ? " is-active" : ""}" data-action="applyPlayerPlaybookFilter" data-arg="study:notes">Coach Notes</button>
      <button type="button" class="pb-player-summary__filter-pill" data-action="openPlayerPlaybookFilters" data-arg="personnel">Personnel</button>
      <button type="button" class="pb-player-summary__filter-pill" data-action="openPlayerPlaybookFilters" data-arg="formation">Formation</button>
      <button type="button" class="pb-player-summary__filter-pill" data-action="openPlayerPlaybookFilters" data-arg="basePlay">Base Play</button>
      <button type="button" class="pb-player-summary__filter-pill" data-action="openPlayerPlaybookFilters" data-arg="motion">Motion</button>
      <button type="button" class="pb-player-summary__filter-pill" data-action="openPlayerPlaybookFilters" data-arg="protection">Protection</button>
      <button type="button" class="pb-player-summary__filter-pill" data-action="openPlayerPlaybookFilters" data-arg="tempo">Tempo</button>
    </div>
  `;
}

function _isPlayerSummaryQuickFilterActive(key, value) {
  if (key === "study") {
    return (
      typeof playerPlaybookStudyFilters !== "undefined" &&
      playerPlaybookStudyFilters.has(value)
    );
  }
  if (key === "gamePlan") {
    const group =
      typeof PLAYER_PLAYBOOK_FILTER_GROUPS !== "undefined"
        ? PLAYER_PLAYBOOK_FILTER_GROUPS.find((item) => item.key === "gamePlan")
        : null;
    const option = group?.options?.find((item) => item.value === value);
    const input = option?.inputId ? document.getElementById(option.inputId) : null;
    return Boolean(input?.checked);
  }
  return false;
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

if (typeof window !== "undefined") {
  window.addEventListener("play-images-ready", () => {
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
  });
  window.addEventListener("play-images-changed", () => {
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
  });
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
    const selectAndRevealIndex = (nextIndex) => {
      if (!filteredPlays.length) return;
      const bounded = Math.max(0, Math.min(nextIndex, filteredPlays.length - 1));
      const nextPage = Math.floor(bounded / PLAYS_PER_PAGE);
      selectedRowIndex = bounded;
      if (nextPage !== currentPage) {
        currentPage = nextPage;
        renderPlaybook();
      } else {
        selectPlaybookRow(bounded);
      }
      requestAnimationFrame(() => {
        document
          .querySelector(`#playbookTable tbody tr[data-idx="${bounded}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
    };

    container.addEventListener("keydown", (e) => {
      const rows = document.querySelectorAll("#playbookTable tbody tr");
      if (rows.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          selectAndRevealIndex(
            selectedRowIndex >= 0
              ? selectedRowIndex + 1
              : currentPage * PLAYS_PER_PAGE,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          selectAndRevealIndex(
            selectedRowIndex >= 0
              ? selectedRowIndex - 1
              : currentPage * PLAYS_PER_PAGE,
          );
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

// ── #115: Workflow Side Panel ─────────────────────────────────────────────
function openPlayWorkflowPanel(idx) {
  const filteredIdx = parseInt(idx, 10);
  const play =
    Number.isInteger(filteredIdx) && Array.isArray(filteredPlays)
      ? filteredPlays[filteredIdx]
      : null;
  if (!play) return;
  const panel = document.getElementById("pbWorkflowPanel");
  const titleEl = document.getElementById("pbWfPanelTitle");
  const body = document.getElementById("pbWfPanelBody");
  if (!panel || !body) return;

  const playLabel = [play.formation, play.motion ? `(${play.motion})` : "", play.play]
    .filter(Boolean).join(" ");
  if (titleEl) titleEl.textContent = playLabel || "Play Workflow";

  const sections = [];

  // ── Script ──
  const scriptMatches = Array.isArray(script)
    ? script.reduce((acc, s, i) => { if (!s.isSeparator && typeof playsMatch === "function" && playsMatch(s, play)) acc.push(i); return acc; }, [])
    : [];
  const periodNames = _wfScriptPeriods(scriptMatches);
  if (scriptMatches.length > 0) {
    sections.push(_wfSection("📋 Practice Script", true,
      `<span class="pb-wf-s-ok">${scriptMatches.length} rep${scriptMatches.length > 1 ? "s" : ""} in script</span>` +
      (periodNames ? `<span class="pb-wf-s-meta"> · ${escapeHtml(periodNames)}</span>` : "")
    ));
  } else {
    sections.push(_wfSection("📋 Practice Script", false,
      `<span class="pb-wf-s-empty">Not in current script</span>` +
      `<button class="btn btn-xs btn-primary" data-action="addPlayToWeek" data-arg="${idx}">Add…</button>`
    ));
  }

  // ── Call Sheet ──
  const csLocs = typeof getCallSheetPlayLocations === "function" ? getCallSheetPlayLocations(play) : [];
  const csNames = [...new Set(csLocs.map((l) => l.replace(/ - (Left|Right)$/, "")))];
  if (csNames.length > 0) {
    sections.push(_wfSection("📄 Call Sheet", true,
      `<span class="pb-wf-s-ok">${csNames.map((n) => escapeHtml(n)).join(", ")}</span>`
    ));
  } else {
    sections.push(_wfSection("📄 Call Sheet", false,
      `<span class="pb-wf-s-empty">Not on call sheet</span>`
    ));
  }

  // ── Wristband ──
  const wbInfo = _wfFindOnWristband(play);
  sections.push(_wfSection("🏈 Wristband", wbInfo.found,
    wbInfo.found
      ? `<span class="pb-wf-s-ok">${escapeHtml(wbInfo.label)}</span>`
      : `<span class="pb-wf-s-empty">Not on active wristband</span>`
  ));

  // ── Game Plan ──
  const gpInfo = _wfFindInGamePlan(play);
  sections.push(_wfSection("🎯 Game Plan", gpInfo.found,
    gpInfo.found
      ? `<span class="pb-wf-s-ok">${escapeHtml(gpInfo.label)}</span>`
      : `<span class="pb-wf-s-empty">Not in game plan</span>`
  ));

  // ── Scout ──
  const scoutInfo = _wfGetScoutInfo(play);
  sections.push(_wfSection("🔍 Scout", !!scoutInfo,
    scoutInfo
      ? `<span class="pb-wf-s-scout">${escapeHtml(scoutInfo)}</span>`
      : `<span class="pb-wf-s-empty">No recommendation for active opponent</span>`
  ));

  setInnerHTML(body, sections.join(""));
  panel.classList.add("visible");
  if (typeof trapFocus === "function") {
    const inner = panel.querySelector(".pb-wf-panel");
    if (inner) trapFocus(inner);
  }

  // Async Discussion section — appended after static sections
  if (typeof renderDiscussionSection === "function") {
    renderDiscussionSection(play, body);
  }

  // Async Like state
  _wfLoadLikeState(play);
}

// ── Play Like (Phase 10) ──────────────────────────────────────────────────────

let _wfCurrentLikePlayId = null;  // playId of the play currently in the panel

async function _wfLoadLikeState(play) {
  const btn = document.getElementById("pbWfLikeBtn");
  if (!btn) return;
  if (!window.currentAuthUser) { btn.hidden = true; return; }

  const playId = typeof getPlayThreadId === "function" ? getPlayThreadId(play) : null;
  if (!playId) { btn.hidden = true; return; }
  _wfCurrentLikePlayId = playId;

  btn.hidden = false;
  btn.disabled = true;

  try {
    const res = await fetch(`/api/plays/${encodeURIComponent(playId)}/like`);
    if (!res.ok) throw new Error("Like fetch failed");
    const data = await res.json();
    _wfUpdateLikeBtn(btn, data.liked, data.count);
  } catch (_) {
    btn.hidden = true;
  }

  btn.disabled = false;
}

function _wfUpdateLikeBtn(btn, liked, count) {
  const countEl = document.getElementById("pbWfLikeCount");
  if (countEl) countEl.textContent = count || 0;
  btn.setAttribute("aria-pressed", liked ? "true" : "false");
  btn.classList.toggle("pb-wf-like-btn--liked", !!liked);
  btn.title = liked ? "Unlike this play" : "Like this play";
  btn.setAttribute("aria-label", (liked ? "Unlike" : "Like") + " this play");
}

async function togglePlayLike() {
  if (!_wfCurrentLikePlayId) return;
  const btn = document.getElementById("pbWfLikeBtn");
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  // Optimistic toggle
  const wasLiked = btn.getAttribute("aria-pressed") === "true";
  const countEl = document.getElementById("pbWfLikeCount");
  const prevCount = parseInt(countEl?.textContent || "0", 10);
  _wfUpdateLikeBtn(btn, !wasLiked, wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1);

  try {
    const res = await fetch(`/api/plays/${encodeURIComponent(_wfCurrentLikePlayId)}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (data.ok) {
      _wfUpdateLikeBtn(btn, data.liked, data.count);
    } else {
      // Revert on error
      _wfUpdateLikeBtn(btn, wasLiked, prevCount);
      showToast(data.error || "Failed to update like.", { duration: 3000, type: "error" });
    }
  } catch (_) {
    _wfUpdateLikeBtn(btn, wasLiked, prevCount);
    showToast("Network error — try again.", { duration: 3000, type: "error" });
  }

  btn.disabled = false;
}

function closePlayWorkflowPanel() {
  document.getElementById("pbWorkflowPanel")?.classList.remove("visible");
}

function _wfSection(title, active, content) {
  return `<div class="pb-wf-section${active ? " pb-wf-section--on" : ""}">
    <div class="pb-wf-sh"><span class="pb-wf-dot${active ? " pb-wf-dot--on" : ""}"></span><strong>${title}</strong></div>
    <div class="pb-wf-sb">${content}</div>
  </div>`;
}

function _wfScriptPeriods(indices) {
  if (!Array.isArray(script) || !indices.length) return "";
  const periods = new Set();
  indices.forEach((i) => {
    for (let j = i - 1; j >= 0; j--) {
      if (script[j]?.isSeparator && script[j].label) { periods.add(script[j].label); break; }
    }
  });
  return [...periods].join(", ");
}

function _wfFindOnWristband(play) {
  if (!Array.isArray(wristbandCards) || !wristbandCards.length) return { found: false };
  for (const card of wristbandCards) {
    if (!Array.isArray(card.data)) continue;
    const cellIdx = card.data.findIndex((cell) => cell !== null && typeof playsMatch === "function" && playsMatch(cell, play));
    if (cellIdx >= 0) {
      const col = cellIdx < 20 ? "A" : "B";
      const row = (cellIdx % 20) + 1;
      return { found: true, label: `${card.name || "Card"} — ${col}${row}` };
    }
  }
  return { found: false };
}

function _wfFindInGamePlan(play) {
  try {
    if (typeof _gpEnsureBoard !== "function") return { found: false };
    const board = _gpEnsureBoard();
    if (!board?.assignments) return { found: false };
    const allBoxes = [...(typeof GP_DEFAULT_BOXES !== "undefined" ? GP_DEFAULT_BOXES : []), ...(board.customBoxes || [])];
    for (const [boxId, boxPlays] of Object.entries(board.assignments)) {
      if (!Array.isArray(boxPlays)) continue;
      if (boxPlays.some((bp) => typeof playsMatch === "function" && playsMatch(bp, play))) {
        const box = allBoxes.find((b) => b.id === boxId);
        const label = (board.boxLabels && board.boxLabels[boxId]) || box?.label || boxId;
        return { found: true, label };
      }
    }
  } catch (e) { /* silent */ }
  return { found: false };
}

function _wfGetScoutInfo(play) {
  if (typeof _tdScoutRecs === "undefined" || !Array.isArray(_tdScoutRecs)) return null;
  const rec = _tdScoutRecs.find((r) => typeof playsMatch === "function" && playsMatch(r.play, play));
  if (!rec) return null;
  if (Array.isArray(rec.reasons) && rec.reasons.length > 0) return rec.reasons.slice(0, 2).join(" · ");
  return "Recommended for active opponent";
}
