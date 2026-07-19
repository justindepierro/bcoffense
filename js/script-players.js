function createScriptPlayerAssignments(play) {
  const assignments = getBasePlayerAssignments(play);
  return Object.keys(assignments).length ? assignments : undefined;
}

function getScriptPlayerAssignments(play) {
  return getResolvedPlayerAssignments(play);
}

function getScriptPlayerDepthChart(play) {
  return getResolvedPlayerDepthChart(play);
}

function getScriptVisiblePlayerSummary(play, opts = {}) {
  const assignments = getScriptPlayerAssignments(play);
  const visibleSlots = getTeamAssignmentSlots(play?.personnel).filter((slot) => {
    if (!opts.hideLinemen) return true;
    return !["lt", "lg", "c", "rg", "rt"].includes(slot.key);
  });

  return visibleSlots
    .map((slot) => {
      const playerId = String(assignments?.[slot.key] || "").trim();
      return playerId ? getTeamPlayerSelectionDisplay(playerId) : "";
    })
    .filter(Boolean)
    .join(", ");
}

window.getScriptVisiblePlayerSummary = getScriptVisiblePlayerSummary;

function buildScriptCompactPlayerSummary(play, opts = {}, summaryContext = {}) {
  const personnel = String(play?.personnel || "").trim();
  const subPackageId = getPlaySubPackageId(play);
  const visibleSlotKey = `${personnel}::${opts.hideLinemen ? "hideLinemen" : "all"}`;
  const assignmentCacheKey = `${personnel}::${subPackageId || "base"}`;
  const slotCache = summaryContext.slotCache || new Map();
  const baseAssignmentCache = summaryContext.baseAssignmentCache || new Map();
  const playerLabelCache = summaryContext.playerLabelCache || new Map();

  let visibleSlots = slotCache.get(visibleSlotKey);
  if (!visibleSlots) {
    visibleSlots = getTeamAssignmentSlots(personnel).filter((slot) => {
      if (!opts.hideLinemen) return true;
      return !["lt", "lg", "c", "rg", "rt"].includes(slot.key);
    });
    slotCache.set(visibleSlotKey, visibleSlots);
  }

  let baseAssignments = baseAssignmentCache.get(assignmentCacheKey);
  if (!baseAssignments) {
    baseAssignments = getPlayerAssignmentBaseline(play);
    baseAssignmentCache.set(assignmentCacheKey, baseAssignments);
  }

  const manualAssignments = normalizePlayerAssignments(play?.playerAssignments);

  return visibleSlots
    .map((slot) => {
      const playerId = String(
        manualAssignments[slot.key] || baseAssignments[slot.key] || "",
      ).trim();
      if (!playerId) return "";

      if (!playerLabelCache.has(playerId)) {
        playerLabelCache.set(playerId, getTeamPlayerSelectionDisplay(playerId));
      }
      return playerLabelCache.get(playerId) || "";
    })
    .filter(Boolean)
    .join(", ");
}

function hasScriptSubPackage(play) {
  const subPackageId = getPlaySubPackageId(play);
  if (!subPackageId) return false;
  return getApplicableTeamSwapGroups(play?.personnel).some((group) => group.id === subPackageId);
}

function hasScriptManualPlayerOverrides(play) {
  const baselineAssignments = getPlayerAssignmentBaseline(play);
  const manualAssignments = normalizePlayerAssignments(play?.playerAssignments);
  return Object.keys(manualAssignments).some(
    (slotKey) => (manualAssignments[slotKey] || "") !== (baselineAssignments[slotKey] || ""),
  );
}

function getScriptPlayerStatusLabel(play) {
  const labels = [];
  const subPackageId = getPlaySubPackageId(play);
  if (hasScriptSubPackage(play)) labels.push("Sub package");
  else if (subPackageId) labels.push("Missing sub package");
  if (hasScriptManualPlayerOverrides(play)) labels.push("Manual starter override");
  return labels.join(" + ");
}

function buildScriptPlayerSummaryCard(play, index, playLabel, playerSummary) {
  const hasOverrides = hasScriptPlayerOverrides(play);
  const statusLabel = getScriptPlayerStatusLabel(play);
  const summaryText = playerSummary || "No assignments set";

  return `
    <div class="script-player-summary-card">
      <div class="script-player-summary-head">
        <div class="script-player-summary-meta">
          <span class="script-player-summary-title">Lineup</span>
          ${statusLabel ? `<span class="script-player-summary-status">${escapeHtml(statusLabel)}</span>` : ""}
        </div>
        <div class="script-player-summary-actions">
          ${hasOverrides ? `<button type="button" class="script-player-reset-btn" data-action="resetScriptPlayerOverrides" data-idx="${index}" aria-label="Reset player overrides for ${escapeHtml(playLabel)}">Reset</button>` : ""}
        </div>
      </div>
      <div class="script-player-summary-body">${escapeHtml(summaryText)}</div>
    </div>
  `;
}

function hasScriptPlayerOverrides(play) {
  return Boolean(getPlaySubPackageId(play)) || hasScriptManualPlayerOverrides(play);
}

function isScriptPlayerSlotPromoted(play, slotKey) {
  if (!slotKey) return false;
  const baseAssignments = getBasePlayerAssignments(play);
  const currentAssignments = getScriptPlayerAssignments(play);
  return (currentAssignments[slotKey] || "") !== (baseAssignments[slotKey] || "");
}

function updateScriptPlayerAssignment(index, slotKey, playerId) {
  const play = script[index];
  if (!play || play.isSeparator || !slotKey) return;

  const baselineAssignments = getPlayerAssignmentBaseline(play);
  const assignments = normalizePlayerAssignments(play.playerAssignments);
  const previousPlayerId = assignments[slotKey] || "";
  if (previousPlayerId === (playerId || "")) return;
  beginScriptEdit();
  if (playerId) assignments[slotKey] = playerId;
  else delete assignments[slotKey];

  if ((assignments[slotKey] || "") === (baselineAssignments[slotKey] || "")) {
    delete assignments[slotKey];
  }

  play.playerAssignments = Object.keys(assignments).length ? assignments : undefined;
  rerenderScriptPreservingScroll(index);
}

function rerenderScriptPreservingScroll(anchorIndex) {
  // Player-grid mutations (promote depth chip / reset overrides) only affect
  // the personnel grid inside a single row. Doing a full renderScript() is
  // overkill and visibly bumps the page even with scroll restoration, because
  // the entire script DOM is torn down and rebuilt. Instead, swap just the
  // affected row's .script-player-grid in place — nothing above the row
  // changes, so scrollY can't shift.
  const scriptEl = document.getElementById("scriptPlays");
  if (!scriptEl || typeof anchorIndex !== "number") {
    renderScript();
    return;
  }
  const row = scriptEl.querySelector(`.script-item[data-idx="${anchorIndex}"]`);
  const play = script[anchorIndex];
  if (!row || !play || play.isSeparator) {
    renderScript();
    return;
  }
  const opts = typeof getScriptDisplayOptions === "function" ? getScriptDisplayOptions() : {};
  if (opts.hidePersonnel) return;
  const playLabel = typeof getScriptPlaySummaryText === "function"
    ? getScriptPlaySummaryText(play)
    : "";
  const newGridHtml = buildScriptPlayerAssignmentGrid(play, anchorIndex, playLabel, opts);
  const existingGrid = row.querySelector(".script-player-grid");
  if (existingGrid && newGridHtml) {
    const assignmentDetailsWasOpen = existingGrid.querySelector(
      ".script-player-assignment-details",
    )?.open;
    const tmp = document.createElement("div");
    // NOTE: cannot use setInnerHTML — sanitizeHTML strips <select> and <button>
    // which are the entire point of the player assignment grid. All player
    // names and labels are passed through escapeHtml/escapeAttr upstream.
    tmp.innerHTML = newGridHtml;
    const replacement = tmp.firstElementChild;
    if (replacement) {
      const replacementDetails = replacement.querySelector(
        ".script-player-assignment-details",
      );
      if (assignmentDetailsWasOpen && replacementDetails) replacementDetails.open = true;
      existingGrid.replaceWith(replacement);
      return;
    }
  }
  // Fallback: full re-render if we couldn't do the targeted swap.
  renderScript();
}

function promoteScriptDepthPlayer(index, slotKey, playerId) {
  if (!slotKey || !playerId) return;
  updateScriptPlayerAssignment(index, slotKey, playerId);
}

function resetScriptPlayerOverrides(index) {
  const play = script[index];
  if (!play || play.isSeparator) return;
  if (!play.playerAssignments && !play.playerSubPackageId && !play.subPackageId) return;
  beginScriptEdit();
  delete play.playerAssignments;
  delete play.playerSubPackageId;
  delete play.subPackageId;
  rerenderScriptPreservingScroll(index);
}

function applyScriptSubPackage(index, groupId) {
  const play = script[index];
  if (!play || play.isSeparator) return;

  const normalizedGroupId = String(groupId || "").trim();
  const applicableGroups = getApplicableTeamSwapGroups(play.personnel);
  const selectedGroup = normalizedGroupId
    ? applicableGroups.find((group) => group.id === normalizedGroupId)
    : null;

  if (normalizedGroupId && !selectedGroup) {
    showToast("That sub package does not apply to this personnel group", {
      duration: 2500,
      type: "warning",
    });
    rerenderScriptPreservingScroll(index);
    return;
  }
  if (
    getPlaySubPackageId(play) === normalizedGroupId &&
    !play.subPackageId
  ) {
    return;
  }

  const baseAssignments = getBasePlayerAssignments(play);
  const subPackageAssignments = normalizedGroupId
    ? getTeamSwapGroupAssignments(normalizedGroupId, play.personnel)
    : {};
  const subPackageSlots = new Set(Object.keys(subPackageAssignments));
  const nextBaseline = normalizePlayerAssignments({
    ...baseAssignments,
    ...subPackageAssignments,
  });
  const nextManualAssignments = {};

  Object.entries(normalizePlayerAssignments(play.playerAssignments)).forEach(
    ([slotKey, playerId]) => {
      if (subPackageSlots.has(slotKey)) return;
      if ((playerId || "") !== (nextBaseline[slotKey] || "")) {
        nextManualAssignments[slotKey] = playerId;
      }
    },
  );

  beginScriptEdit();
  if (normalizedGroupId) {
    play.playerSubPackageId = normalizedGroupId;
  } else {
    delete play.playerSubPackageId;
  }
  delete play.subPackageId;

  play.playerAssignments = Object.keys(nextManualAssignments).length
    ? nextManualAssignments
    : undefined;

  rerenderScriptPreservingScroll(index);
}

function buildScriptSubPackagePicker(play, index, playLabel) {
  const groups = getApplicableTeamSwapGroups(play?.personnel);
  const selectedId = getPlaySubPackageId(play);
  const hasMissingSelection = selectedId && !groups.some((group) => group.id === selectedId);
  if (!groups.length && !hasMissingSelection) return "";

  return `
    <label class="script-player-swap-group" aria-label="Sub package for ${escapeHtml(playLabel)}">
      <span class="script-player-swap-group-label">Sub Package</span>
      <select class="script-player-swap-select" data-field="scriptSubPackage" data-idx="${index}" aria-label="Sub package for ${escapeHtml(playLabel)}">
        <option value="" ${selectedId ? "" : "selected"}>${groups.length ? "Base lineup" : "Add sub packages first"}</option>
        ${hasMissingSelection ? `<option value="${escapeAttr(selectedId)}" selected>Missing sub package</option>` : ""}
        ${groups.map((group) => {
          const selected = group.id === selectedId ? " selected" : "";
          const suffix = group.personnel ? ` (${group.personnel})` : "";
          return `<option value="${escapeAttr(group.id)}"${selected}>${escapeHtml(group.name + suffix)}</option>`;
        }).join("")}
      </select>
    </label>
  `;
}

function buildScriptPlayerAssignmentGrid(play, index, playLabel, opts = {}) {
  if ((opts && opts.hidePersonnel) || play?.scriptHidePersonnel) return "";
  const assignments = getScriptPlayerAssignments(play);
  const depthChart = getScriptPlayerDepthChart(play);
  const hasOverrides = hasScriptPlayerOverrides(play);
  const statusLabel = getScriptPlayerStatusLabel(play);
  const personnelOverrideControl =
    typeof renderScriptPersonnelOverrideButton === "function"
      ? renderScriptPersonnelOverrideButton(play, index, playLabel, opts)
      : "";
  const subPackagePicker = buildScriptSubPackagePicker(play, index, playLabel);
  const selectedSubPackageId = getPlaySubPackageId(play);
  const selectedSubPackage = getApplicableTeamSwapGroups(play?.personnel).find(
    (group) => group.id === selectedSubPackageId,
  );
  const slotMap = new Map(
    getTeamAssignmentSlots(play?.personnel).map((slot) => [slot.key, slot]),
  );
  const visibleSlots = [...slotMap.values()].filter((slot) => {
    if (!opts.hideLinemen) return true;
    return !["lt", "lg", "c", "rg", "rt"].includes(slot.key);
  });
  const assignedSlotCount = visibleSlots.filter((slot) => assignments[slot.key]).length;
  const lineupLabel = selectedSubPackage
    ? selectedSubPackage.name
    : selectedSubPackageId
      ? "Missing sub package"
      : "Base lineup";
  const buildRow = (slotKeys) => {
    const slots = slotKeys.map((slotKey) => slotMap.get(slotKey)).filter(Boolean);
    if (!slots.length) return "";
    const rowTypeClass = slotKeys.some((slotKey) => ["lt", "lg", "c", "rg", "rt"].includes(slotKey))
      ? "script-player-row--line"
      : "script-player-row--skill";
    return `
      <div class="script-player-row script-player-row--${slots.length} ${rowTypeClass}">
        ${slots.map((slot) => `
          <div class="script-player-slot ${isScriptPlayerSlotPromoted(play, slot.key) ? "script-player-slot--promoted" : ""}">
            <div class="script-player-slot-head">
              <span class="script-player-slot-label">${slot.label}</span>
              ${isScriptPlayerSlotPromoted(play, slot.key) ? '<span class="script-player-slot-role">Promoted</span>' : ""}
            </div>
            <select class="script-player-slot-select" data-field="playerAssignment" data-slot="${slot.key}" data-idx="${index}" aria-label="${escapeHtml(playLabel)} ${slot.label} player">
              ${buildTeamPlayerOptionMarkup(assignments[slot.key] || "")}
            </select>
            ${(() => {
        const slotDepth = getTeamDepthChartForSlot(depthChart, slot.key);
        const starterId = String(assignments[slot.key] || "").trim();
        const promoted = isScriptPlayerSlotPromoted(play, slot.key);
        const backupIds = slotDepth.filter((playerId) => playerId && playerId !== starterId);
        const currentStarterMarkup = promoted
          ? `<div class="script-player-current-pill"><span class="script-player-current-pill-label">Live</span><span class="script-player-current-pill-name">${escapeHtml(getTeamPlayerSelectionDisplay(starterId))}</span></div>`
          : "";
        if (!backupIds.length) {
          return `${currentStarterMarkup}<span class="script-player-slot-empty">No subs set</span>`;
        }
        return `
                ${currentStarterMarkup}
                <div class="script-player-depth-list">
                  ${backupIds.map((playerId, depthIndex) => `
                    <button type="button" class="script-player-depth-chip" data-action="promoteScriptDepthPlayer" data-idx="${index}" data-slot="${slot.key}" data-player-id="${escapeAttr(playerId)}" aria-label="Promote ${escapeHtml(getTeamPlayerSelectionDisplay(playerId))} to ${slot.label} starter on ${escapeHtml(playLabel)}">
                      <span class="script-player-depth-chip-role">S${depthIndex + 1}</span>
                      <span class="script-player-depth-chip-name">${escapeHtml(getTeamPlayerSelectionDisplay(playerId))}</span>
                    </button>
                  `).join("")}
                </div>
              `;
      })()}
          </div>
        `).join("")}
      </div>
    `;
  };

  const buildSection = (title, className, rows) => {
    const content = rows.filter(Boolean).join("");
    if (!content) return "";
    return `
      <div class="script-player-group ${className}">
        <div class="script-player-group-header">
          <span class="script-player-group-title">${title}</span>
        </div>
        ${content}
      </div>
    `;
  };

  const skillSection = buildSection("Skill", "script-player-group--skill", [
    buildRow(["qb", "rb", "h", "x", "y", "z"]),
  ]);
  const lineSection = opts.hideLinemen
    ? ""
    : buildSection("Offensive Line", "script-player-group--line", [
      buildRow(["lt", "lg", "c", "rg", "rt"]),
    ]);

  return `
    <div class="script-player-grid ${opts.layoutMode === "compact" ? "script-player-grid--compact" : "script-player-grid--detail"}">
      <details class="script-player-assignment-details">
        <summary class="script-player-assignment-summary">
          <span class="script-player-assignment-summary-main">
            <span class="script-player-grid-title">Lineup</span>
            ${personnelOverrideControl}
            <span class="script-player-assignment-summary-lineup">${escapeHtml(lineupLabel)}</span>
            ${statusLabel ? `<span class="script-player-grid-status">${escapeHtml(statusLabel)}</span>` : ''}
          </span>
          <span class="script-player-assignment-summary-end">
            <span>${assignedSlotCount}/${visibleSlots.length} assigned</span>
            <span class="script-player-assignment-summary-action">Adjust</span>
          </span>
        </summary>
        <div class="script-player-assignment-body">
          <div class="script-player-grid-head">
            <div class="script-player-grid-meta">
              <span class="script-player-grid-title">Lineup assignment</span>
            </div>
            <div class="script-player-grid-actions">
              ${subPackagePicker}
              ${hasOverrides ? `<button type="button" class="script-player-reset-btn" data-action="resetScriptPlayerOverrides" data-idx="${index}" aria-label="Reset player overrides for ${escapeHtml(playLabel)}">Reset</button>` : ''}
            </div>
          </div>
          ${skillSection}
          ${lineSection}
        </div>
      </details>
    </div>
  `;
}
