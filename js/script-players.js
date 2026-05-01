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

function hasScriptPlayerOverrides(play) {
  const baseAssignments = getBasePlayerAssignments(play);
  const manualAssignments = normalizePlayerAssignments(play?.playerAssignments);
  return Object.keys(manualAssignments).some(
    (slotKey) => (manualAssignments[slotKey] || "") !== (baseAssignments[slotKey] || ""),
  );
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

  const baseAssignments = getBasePlayerAssignments(play);
  const assignments = normalizePlayerAssignments(play.playerAssignments);
  if (playerId) assignments[slotKey] = playerId;
  else delete assignments[slotKey];

  if ((assignments[slotKey] || "") === (baseAssignments[slotKey] || "")) {
    delete assignments[slotKey];
  }

  play.playerAssignments = Object.keys(assignments).length ? assignments : undefined;
  debouncedSaveScriptState();
}

function rerenderScriptPreservingScroll() {
  const scrollY = window.scrollY;
  renderScript();
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollY, left: window.scrollX, behavior: "instant" });
  });
}

function promoteScriptDepthPlayer(index, slotKey, playerId) {
  if (!slotKey || !playerId) return;
  updateScriptPlayerAssignment(index, slotKey, playerId);
  rerenderScriptPreservingScroll();
}

function resetScriptPlayerOverrides(index) {
  const play = script[index];
  if (!play || play.isSeparator) return;
  delete play.playerAssignments;
  debouncedSaveScriptState();
  rerenderScriptPreservingScroll();
}

function buildScriptPlayerAssignmentGrid(play, index, playLabel, opts = {}) {
  const assignments = getScriptPlayerAssignments(play);
  const depthChart = getScriptPlayerDepthChart(play);
  const hasOverrides = hasScriptPlayerOverrides(play);
  const slotMap = new Map(
    getTeamAssignmentSlots(play?.personnel).map((slot) => [slot.key, slot]),
  );
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
              <span class="script-player-slot-role">${isScriptPlayerSlotPromoted(play, slot.key) ? "Promoted" : "Starter"}</span>
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
      <div class="script-player-grid-head">
        <div class="script-player-grid-meta">
          <span class="script-player-grid-title">Personnel</span>
          ${hasOverrides ? '<span class="script-player-grid-status">Manual starter override</span>' : ''}
        </div>
        <div class="script-player-grid-actions">
          ${hasOverrides ? `<button type="button" class="script-player-reset-btn" data-action="resetScriptPlayerOverrides" data-idx="${index}" aria-label="Reset player overrides for ${escapeHtml(playLabel)}">Reset</button>` : ''}
        </div>
      </div>
      ${skillSection}
      ${lineSection}
    </div>
  `;
}