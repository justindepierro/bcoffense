// ============================================================
// callsheet-smart.js — scouting overlay + smart suggestions
//
// Owns: toggleScoutingOverlay, toggleScouting, buildScoutingBadge,
// buildDeadVsBadge, openSmartSuggestionsModal, addSuggestionToSheet.
//
// Loaded after callsheet.js (depends on callSheet, callSheetSettings,
// CALLSHEET_CATEGORIES, and CALLSHEET_FRONT/BACK globals).
// ============================================================

// ============ Scouting Overlay + Dead Vs Warnings ============

/**
 * Toggle the scouting intel overlay on/off
 */
function toggleScoutingOverlay() {
  const opp = getActiveOpponent();
  if (!opp && !csScoutingOverlayOn) {
    showModal(
      "No active opponent selected.\n\nGo to the 📊 Dashboard tab and select an opponent first, or use 🏈 Set Active in the Tendencies tab.",
      { title: "No Opponent", icon: "🎯" },
    );
    return;
  }
  csScoutingOverlayOn = !csScoutingOverlayOn;
  storageManager.set(STORAGE_KEYS.CS_SCOUTING_OVERLAY, csScoutingOverlayOn);
  const btn = document.getElementById("csScoutingToggle");
  if (btn) btn.classList.toggle("cs-scouting-active", csScoutingOverlayOn);
  renderCallSheet();
  if (csScoutingOverlayOn) {
    showToast(`🎯 Scouting overlay ON — showing ${opp.name} tendencies`);
  } else {
    showToast("🎯 Scouting overlay OFF");
  }
}

// Alias — overlay-close dispatcher strips "Overlay" suffix before calling
function toggleScouting() {
  toggleScoutingOverlay();
}

/**
 * Build the scouting intel badge HTML for a category header
 */
function buildScoutingBadge(categoryId) {
  if (!csScoutingOverlayOn) return "";
  const intel = getTendenciesForCategory(categoryId);
  if (!intel || intel.total === 0) return "";

  let parts = [];
  if (intel.topFront.length > 0)
    parts.push(
      `<span class="cs-scout-item">Fr: <b>${escapeHtml(intel.topFront[0].term)}</b> ${intel.topFront[0].pct}%</span>`,
    );
  if (intel.topCoverage.length > 0)
    parts.push(
      `<span class="cs-scout-item">Cov: <b>${escapeHtml(intel.topCoverage[0].term)}</b> ${intel.topCoverage[0].pct}%</span>`,
    );
  if (intel.blitzRate > 0)
    parts.push(
      `<span class="cs-scout-item cs-scout-blitz">Blitz: ${intel.blitzRate}%</span>`,
    );
  parts.push(`<span class="cs-scout-n">(n=${intel.total})</span>`);

  return `<div class="cs-scouting-badge">${parts.join("")}</div>`;
}

/**
 * Build dead-vs warning badge for a play in a call sheet category
 */
function buildDeadVsBadge(play, categoryId) {
  if (!csScoutingOverlayOn) return "";
  const intel = getTendenciesForCategory(categoryId);
  if (!intel || intel.total === 0) return "";
  if (!play.deadVs || !play.deadVs.trim()) return "";

  let allReasons = [];
  // Check vs top coverage
  if (intel.topCoverage.length > 0) {
    const { isDead, reasons } = checkDeadVs(
      play,
      intel.topCoverage[0].term,
      null,
    );
    if (isDead)
      allReasons.push(
        ...reasons.map((r) => `${r} (${intel.topCoverage[0].pct}%)`),
      );
  }
  // Check vs top front
  if (intel.topFront.length > 0) {
    const { isDead, reasons } = checkDeadVs(play, null, intel.topFront[0].term);
    if (isDead)
      allReasons.push(
        ...reasons.map((r) => `${r} (${intel.topFront[0].pct}%)`),
      );
  }

  if (allReasons.length === 0) return "";
  return `<span class="cs-dead-vs-badge" title="${allReasons.join(", ").replace(/"/g, "&quot;")}">⚠️</span>`;
}

/**
 * Open smart suggestions modal for a call sheet category
 */
function openSmartSuggestionsModal(categoryId) {
  const suggestions = getSmartSuggestions(categoryId, 25);
  const category = [...CALLSHEET_FRONT, ...CALLSHEET_BACK].find(
    (c) => c.id === categoryId,
  );
  if (!category) return;

  const opp = getActiveOpponent();
  const intel = getTendenciesForCategory(categoryId);
  const catName = getCategoryDisplayName(category);

  let intelHtml = "";
  if (intel && intel.total > 0) {
    intelHtml = `<div class="cs-suggest-intel">
      <strong>🎯 Opponent Intel (${escapeHtml(opp?.name || "Unknown")}):</strong> ${intel.summary}
    </div>`;
  } else if (!opp) {
    intelHtml = `<div class="cs-suggest-intel cs-suggest-no-intel">No opponent selected — suggestions based on play metadata only</div>`;
  }

  let listHtml = "";
  if (suggestions.length === 0) {
    listHtml =
      '<div class="empty-state">No plays found for this situation</div>';
  } else {
    listHtml = suggestions
      .map((s, idx) => {
        const fullCall = getFullCall(s.play, { showEmoji: true });
        const scoreClass =
          s.score >= 50
            ? "cs-score-high"
            : s.score >= 20
              ? "cs-score-med"
              : "cs-score-low";
        const reasonsHtml =
          s.reasons.length > 0
            ? `<span class="cs-suggest-reasons">✓ ${s.reasons.join(" • ")}</span>`
            : "";
        const warningsHtml =
          s.warnings.length > 0
            ? `<span class="cs-suggest-warnings">${s.warnings.join(" • ")}</span>`
            : "";
        const deadVsNote = s.play.deadVs
          ? `<span class="cs-suggest-deadvs">Dead vs: ${escapeHtml(s.play.deadVs)}</span>`
          : "";
        const alreadyOnSheet = isPlayOnCallSheet(s.play, categoryId);
        const addedClass = alreadyOnSheet ? "cs-suggest-on-sheet" : "";

        return `<div class="cs-suggest-item ${addedClass}" data-idx="${idx}">
        <span class="cs-suggest-rank">${idx + 1}</span>
        <span class="cs-suggest-score ${scoreClass}">${s.score}</span>
        <div class="cs-suggest-play-info">
          <div class="cs-suggest-call">${fullCall}</div>
          <div class="cs-suggest-meta">${escapeHtml(s.play.type)} ${s.play.personnel ? "• " + escapeHtml(s.play.personnel) : ""} ${escapeHtml(s.play.formation || "")}</div>
          ${reasonsHtml}${warningsHtml}${deadVsNote}
        </div>
        <div class="cs-suggest-actions">
          ${alreadyOnSheet
            ? '<span class="cs-suggest-added">✓ On Sheet</span>'
            : `
          <button class="btn btn-sm btn-primary" data-action="addSuggestionToSheet" data-cat="${categoryId}" data-hash="left" data-idx="${idx}">← L</button>
          <button class="btn btn-sm btn-primary" data-action="addSuggestionToSheet" data-cat="${categoryId}" data-hash="right" data-idx="${idx}">R →</button>
          `
          }
        </div>
      </div>`;
      })
      .join("");
  }

  const modalHtml = `
    <div id="csSuggestOverlay" class="modal-overlay show">
      <div class="modal-content cs-suggest-modal" role="dialog" aria-modal="true" aria-labelledby="csSuggestTitle">
        <div class="cs-suggest-header">
          <h3 id="csSuggestTitle">💡 Smart Suggestions — ${escapeHtml(catName)}</h3>
          <button data-action="closeCsSuggestOverlay" class="modal-close-btn" aria-label="Close smart suggestions">✕</button>
        </div>
        ${intelHtml}
        <div class="cs-suggest-list">${listHtml}</div>
        <div class="cs-suggest-footer">
          <span class="cs-suggest-legend">Score = preferred field match − dead-vs penalties</span>
          <button data-action="closeCsSuggestOverlay" class="btn btn-secondary">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  // backdrop close
  document
    .getElementById("csSuggestOverlay")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "csSuggestOverlay") closeCsSuggestOverlay();
    });
}

/**
 * Add a suggested play to the call sheet
 */
function addSuggestionToSheet(categoryId, hash, suggestionIdx) {
  const suggestions = getSmartSuggestions(categoryId, 25);
  const s = suggestions[suggestionIdx];
  if (!s) return;

  if (!callSheet[categoryId]) callSheet[categoryId] = { left: [], right: [] };

  // Clone the play for the call sheet
  const csPlay = typeof copyPlayForCallSheet === "function"
    ? copyPlayForCallSheet(s.play)
    : {
      ...s.play,
      playType: s.play.type,
      wristbandNumber: null,
      highlighted: false,
      highlightColor: null,
      borderColor: null,
      cellBg: null,
      cellTextColor: null,
      cellBold: false,
      cellItalic: false,
      cellUnderline: false,
      cellStrikethrough: false,
      cellFontSize: null,
      cellNote: null,
    };

  callSheet[categoryId][hash].push(csPlay);
  saveCallSheet();
  renderCallSheet();

  // Refresh the modal
  document.getElementById("csSuggestOverlay")?.remove();
  openSmartSuggestionsModal(categoryId);
  showToast(`💡 Added to ${hash} hash`);
}
