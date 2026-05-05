function renderPlaybook() {
  try {
    const tbody = document.querySelector("#playbookTable tbody");
    const searchTerm =
      document.getElementById("searchPlay")?.value?.toLowerCase() || "";

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

    tbody.innerHTML = pageSlice
      .map((play, localIdx) => {
        const idx = start + localIdx;
        const onWristband = isPlayOnHighlightedWristband(play);
        const wbClass = onWristband ? " on-wristband" : "";
        const gpClass = isPlayInGamePlan(play) ? " in-gameplan" : "";
        const wbIndicator = onWristband
          ? '<span class="wb-indicator" title="On wristband">🏈</span>'
          : "";
        const installBadge =
          typeof getPlayStarBadge === "function" ? getPlayStarBadge(play) : "";

        const gpActive = isPlayInGamePlan(play);
        const gpToggle = getGameWeek().opponentName
          ? `<button class="gp-toggle-btn${gpActive ? " gp-active" : ""}" data-action="togglePlaybookGamePlan" data-idx="${idx}" title="${gpActive ? "Remove from" : "Add to"} game plan">🎯</button>`
          : "";

        return `
            <tr class="${wbClass}${gpClass}" data-action="selectPlaybookRow" data-idx="${idx}"  
                data-preview="${idx}"
                title="Click to select, double-click to edit">
                <td class="col-gameplan">${gpToggle}</td>
                <td class="col-install">${installBadge}</td>
                <td class="col-type">${wbIndicator}${highlightSearch(play.type, searchTerm)}</td>
                <td class="col-formation">${highlightSearch(play.formation, searchTerm)}</td>
                <td class="col-tags">${escapeHtml([play.formTag1, play.formTag2].filter(Boolean).join(", ") || "-")}</td>
                <td class="col-back">${highlightSearch(play.back || "-", searchTerm)}</td>
                <td class="col-motion">${highlightSearch(play.motion || "-", searchTerm)}</td>
                <td class="col-protection">${highlightSearch(play.protection || "-", searchTerm)}</td>
                <td class="col-play play-cell" data-action="copyPlayName" data-play="${escapeHtml(play.play)}"><strong>${highlightSearch(play.play, searchTerm)}</strong> ${escapeHtml([play.playTag1, play.playTag2].filter(Boolean).join(" "))}${picturePillFor(play)}</td>
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
    cardsEl.innerHTML = pageSlice
      .map((play, localIdx) => {
        const idx = start + localIdx;
        const onWristband = isPlayOnHighlightedWristband(play);
        const wbClass = onWristband ? " on-wristband" : "";
        const gpClass = isPlayInGamePlan(play) ? " in-gameplan" : "";
        const gpCardActive = isPlayInGamePlan(play);
        const gpCardToggle = getGameWeek().opponentName
          ? `<button class="gp-toggle-btn gp-card-btn${gpCardActive ? " gp-active" : ""}" data-action="togglePlaybookGamePlan" data-idx="${idx}" title="${gpCardActive ? "Remove from" : "Add to"} game plan">🎯</button>`
          : "";
        const installBadge =
          typeof getPlayStarBadge === "function" ? getPlayStarBadge(play) : "";
        const pills = [play.type, play.back, play.motion, play.tempo]
          .filter(Boolean)
          .map((value) => `<span class="pb-card-pill">${escapeHtml(value)}</span>`)
          .join("");
        return `
          <div class="pb-card${wbClass}${gpClass}" data-action="selectPlaybookRow" data-idx="${idx}" data-preview="${idx}"
               tabindex="0" role="button"
               aria-label="${escapeHtml(play.formation)} ${escapeHtml(play.play)}">
            <div class="pb-card-play">${gpCardToggle}${installBadge} ${highlightSearch(play.formation, searchTerm)} ${highlightSearch(play.protection || "", searchTerm)} ${highlightSearch(play.play, searchTerm)}${picturePillFor(play)}</div>
            <div class="pb-card-sub">${highlightSearch(play.type, searchTerm)}${play.motion ? " · " + highlightSearch(play.motion, searchTerm) : ""}${play.back ? " · " + highlightSearch(play.back, searchTerm) : ""}</div>
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
      emptyEl.innerHTML =
        '<p class="empty-state__text">No plays match your filters.</p><button class="btn btn-secondary" data-action="clearAllFilters">✕ Clear All Filters</button>';
      const container = document.getElementById("playbookContainer");
      if (container) container.appendChild(emptyEl);
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

    const tableWrap = document.querySelector(".table-container");
    if (tableWrap) {
      tableWrap.classList.toggle(
        "is-scrollable",
        tableWrap.scrollWidth > tableWrap.clientWidth,
      );
    }

    if (typeof _showPlaybookRowContextMenu === "function") {
      tbody.querySelectorAll("tr[data-idx]").forEach((row) => {
        const idx = parseInt(row.dataset.idx, 10);
        if (!isNaN(idx)) {
          addLongPress(row, (ev) => _showPlaybookRowContextMenu(ev, idx));
        }
      });
    }
  } catch (err) {
    console.error("renderPlaybook error:", err);
    showToast("❌ Error rendering playbook.", {
      duration: 3000,
      type: "error",
    });
  }
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
            addPlayFromPlaybook(selectedRowIndex);
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

function highlightSearch(text, searchTerm) {
  if (!searchTerm || !text || text === "-") return escapeHtml(text);
  const safeText = escapeHtml(String(text));
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const safeEscaped = escapeHtml(escaped);
  const regex = new RegExp(`(${safeEscaped})`, "gi");
  return safeText.replace(regex, '<span class="search-highlight">$1</span>');
}

function updateStatsBar() {
  const statsBar = document.getElementById("statsBar");
  if (!statsBar) return;

  const typeCounts = {};
  plays.forEach((play) => {
    const type = play.type || "Unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  statsBar.innerHTML = sorted
    .map(
      ([type, count]) =>
        `<div class="stat-item"><span class="stat-count">${count}</span> ${escapeHtml(type)}</div>`,
    )
    .join("");
}