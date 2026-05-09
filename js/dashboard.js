// Dashboard and game-week runtime helpers

let dashSearchTerm = "";
let _dashNotesTimer = null;
let _dashLastAnimatedValues = {}; // card key -> last animated value, prevents re-replay

// Pick black/white text for a category background based on relative luminance.
// Used for the call sheet category headers in the dashboard print view.
function _dashCategoryTextColor(hex) {
  if (!hex || typeof hex !== "string") return UI_COLORS.textWhite;
  const m = hex.replace("#", "");
  const r = parseInt(m.length === 3 ? m[0] + m[0] : m.slice(0, 2), 16);
  const g = parseInt(m.length === 3 ? m[1] + m[1] : m.slice(2, 4), 16);
  const b = parseInt(m.length === 3 ? m[2] + m[2] : m.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return UI_COLORS.textWhite;
  // Relative luminance (sRGB simplified)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? UI_COLORS.textBlack : UI_COLORS.textWhite;
}

// Build a single scouting-card column. Used by both the dashboard scouting
// summary and the printable game-plan scouting report.
function _dashBuildScoutCard(label, data, opts = {}) {
  const limitFront = opts.limitFront || 3;
  const limitCov = opts.limitCov || 3;
  const fronts = (data.topFront || [])
    .slice(0, limitFront)
    .map(
      (f) =>
        `<div class="dash-scout-row"><span>Front:</span> <b>${escapeHtml(f.term)}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
    )
    .join("");
  const covs = (data.topCoverage || [])
    .slice(0, limitCov)
    .map(
      (c) =>
        `<div class="dash-scout-row"><span>Cov:</span> <b>${escapeHtml(c.term)}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
    )
    .join("");
  return `<div class="dash-scout-card">
    <div class="dash-scout-card-title">${escapeHtml(label)} (${data.total} plays)</div>
    <div class="dash-scout-items">
      ${fronts}
      ${covs}
      <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${data.blitzRate}%</b></div>
    </div>
  </div>`;
}

/**
 * Render the Game Week Dashboard panel
 */
function renderDashboard() {
  try {
    // Populate opponent dropdown
    const select = document.getElementById("dashOpponentSelect");
    const searchInput = document.getElementById("dashSearchInput");
    const weekInput = document.getElementById("dashWeekLabel");
    const badge = document.getElementById("dashActiveOpponentBadge");

    if (!select) return;

    const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
    const gw = getGameWeek();
    const normalizedSearch = dashSearchTerm.trim().toLowerCase();

    if (searchInput && searchInput !== document.activeElement) {
      searchInput.value = dashSearchTerm;
    }

    const filteredOpponents = normalizedSearch
      ? opponents
        .map((opp, idx) => ({ opp, idx }))
        .filter(({ opp }) =>
          [opp.name, `${opp.plays?.length || 0}`]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch),
        )
      : opponents.map((opp, idx) => ({ opp, idx }));

    let optHtml = '<option value="">— Select Opponent —</option>';
    filteredOpponents.forEach(({ opp, idx }) => {
      const sel = gw.opponentIndex === idx ? "selected" : "";
      optHtml += `<option value="${idx}" ${sel}>${escapeHtml(opp.name)} (${opp.plays?.length ?? 0} plays)</option>`;
    });
    select.innerHTML = optHtml;

    if (weekInput) weekInput.value = gw.weekLabel || "";

    const notesArea = document.getElementById("dashNotesArea");
    if (notesArea && notesArea !== document.activeElement) {
      notesArea.value = gw.notes || "";
    }

    if (badge) {
      badge.innerHTML = gw.opponentName
        ? `<span class="dash-opp-active">🏈 ${escapeHtml(gw.opponentName)}${gw.weekLabel ? " — " + escapeHtml(gw.weekLabel) : ""}</span>`
        : '<span class="dash-opp-none">No opponent selected</span>';
    }

    const cardsEl = document.getElementById("dashCards");
    if (cardsEl) {
      const playCount = typeof plays !== "undefined" ? plays.length : 0;
      const scriptCount = script.filter((p) => !p.isSeparator).length;
      const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
      const savedScriptCount = Array.isArray(savedScripts)
        ? savedScripts.length
        : Object.keys(savedScripts).length;
      const wristbandCount =
        typeof wristbandCards !== "undefined" ? wristbandCards.length : 0;
      const savedWristbands = storageManager.get(
        STORAGE_KEYS.SAVED_WRISTBANDS,
        [],
      );

      let csPlayCount = 0;
      let csCatsFilled = 0;
      if (typeof callSheet !== "undefined") {
        Object.values(callSheet).forEach((data) => {
          const count = (data.left || []).length + (data.right || []).length;
          if (count > 0) {
            csPlayCount += count;
            csCatsFilled++;
          }
        });
      }

      const oppPlays = gw.opponentName
        ? opponents[gw.opponentIndex]?.plays?.length || 0
        : 0;

      const activeScriptName =
        document.getElementById("scriptName")?.value?.trim() ||
        "Practice Script";

      cardsEl.innerHTML = `
      <div class="dash-card dash-card-playbook">
        <div class="dash-card-icon">📖</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${playCount}</div>
          <div class="dash-card-label">Plays Loaded</div>
          <button class="dash-card-link" data-action="showTab" data-arg="playbook">Open →</button>
        </div>
      </div>
      <div class="dash-card dash-card-script">
        <div class="dash-card-icon">📋</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${scriptCount}</div>
          <div class="dash-card-label">On Script</div>
          <div class="dash-card-sub">📄 ${escapeHtml(activeScriptName)} • ${savedScriptCount} saved</div>
          <button class="dash-card-link" data-action="showTab" data-arg="script">Open →</button>
        </div>
      </div>
      <div class="dash-card dash-card-wristband">
        <div class="dash-card-icon">⌚</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${wristbandCount}</div>
          <div class="dash-card-label">Wristband Cards</div>
          <div class="dash-card-sub">${savedWristbands.length} saved</div>
          <button class="dash-card-link" data-action="showTab" data-arg="wristband">Open →</button>
        </div>
      </div>
      <div class="dash-card dash-card-tendencies">
        <div class="dash-card-icon">🎯</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${oppPlays}</div>
          <div class="dash-card-label">Scouting Plays</div>
          <div class="dash-card-sub">${opponents.length} opponent${opponents.length !== 1 ? "s" : ""}</div>
          <button class="dash-card-link" data-action="showTab" data-arg="tendencies">Open →</button>
        </div>
      </div>
      <div class="dash-card dash-card-callsheet">
        <div class="dash-card-icon">🗂️</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${csPlayCount}</div>
          <div class="dash-card-label">On Call Sheet</div>
          <div class="dash-card-sub">${csCatsFilled} categories</div>
          <button class="dash-card-link" data-action="showTab" data-arg="callsheet">Open →</button>
        </div>
      </div>
    `;

      cardsEl.querySelectorAll(".dash-card-value").forEach((el) => {
        const n = parseInt(el.textContent, 10);
        if (isNaN(n) || n <= 0) return;
        const key = el.parentElement?.parentElement?.className || el.textContent;
        if (_dashLastAnimatedValues[key] === n) {
          el.textContent = n;
          return;
        }
        _dashLastAnimatedValues[key] = n;
        _animateCountUp(el, n, 600);
      });

      updateTabBadges();
    }

    const scoutEl = document.getElementById("dashScoutingSection");
    if (scoutEl) {
      const opp = getActiveOpponent();
      if (opp && (opp.plays?.length ?? 0) > 0) {
        const overall = queryTendencies(opp, {});
        const thirdDown = queryTendencies(opp, { down: ["3"] });
        const rz = queryTendencies(opp, { situation: ["Red Zone"] });
        scoutEl.innerHTML = `
        <h3 class="dash-section-title">🎯 Scouting Summary — ${escapeHtml(opp.name)}</h3>
        <div class="dash-scout-grid">
          ${_dashBuildScoutCard("Overall", overall, { limitFront: 3, limitCov: 3 })}
          ${_dashBuildScoutCard("3rd Down", thirdDown, { limitFront: 2, limitCov: 2 })}
          ${_dashBuildScoutCard("Red Zone", rz, { limitFront: 2, limitCov: 2 })}
        </div>`;
      } else {
        scoutEl.innerHTML = `
        <div class="dash-no-scouting">
          <p>📊 Select an opponent above to see scouting intel here</p>
          <p class="dash-hint">Go to the <strong>Def Tendencies</strong> tab to add opponents and chart plays</p>
        </div>
      `;
      }
    }

    const linksEl = document.getElementById("dashQuickLinks");
    if (linksEl) {
      linksEl.innerHTML = `
      <h3 class="dash-section-title">⚡ Quick Actions</h3>
      <div class="dash-links-grid">
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="script">📋 Build Script</button>
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="callsheet">🗂️ Edit Call Sheet</button>
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="installation">📦 Installation</button>
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="tendencies">🎯 Chart Tendencies</button>
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="wristband">⌚ Wristband Maker</button>
        <button class="dash-link-btn dash-link-print" data-action="printFullGamePlan">🖨️ Print Game Plan</button>
        <button class="dash-link-btn" data-action="showStorageInfo">💾 Storage Info</button>
      </div>
    `;
    }

    renderSchedule();
    renderGamePlanSummary();
    renderDashCallSheetCleanup();
  } catch (err) {
    console.error("renderDashboard error:", err);
    showToast("❌ Error loading dashboard.", { duration: 3000, type: "error" });
  }
}

/**
 * Handle game week notes change
 */
function onDashNotesChange(value) {
  clearTimeout(_dashNotesTimer);
  _dashNotesTimer = setTimeout(() => {
    const gw = getGameWeek();
    gw.notes = value;
    storageManager.set(STORAGE_KEYS.GAME_WEEK, gw);
  }, 400);
}

function onDashSearchInput(value) {
  dashSearchTerm = value || "";
  renderDashboard();
}

const debouncedOnDashSearchInput =
  typeof debounce === "function" ? debounce(onDashSearchInput, 120) : onDashSearchInput;

/**
 * Render the schedule table in the dashboard
 */
function renderSchedule() {
  const body = document.getElementById("dashScheduleBody");
  if (!body) return;
  const schedule = getSchedule();
  const gw = getGameWeek();
  const normalizedSearch = dashSearchTerm.trim().toLowerCase();

  if (schedule.length === 0) {
    body.innerHTML = `<div class="dash-schedule-empty">
      <p>No games scheduled yet. Add your season schedule to quickly set the active opponent each week.</p>
    </div>`;
    return;
  }

  const filteredSchedule = normalizedSearch
    ? schedule
      .map((game, idx) => ({ game, idx }))
      .filter(({ game }) =>
        [game.week, game.date, game.opponent, game.location]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : schedule.map((game, idx) => ({ game, idx }));

  if (filteredSchedule.length === 0) {
    body.innerHTML = `<div class="dash-schedule-empty">
      <p>No schedule entries match "${escapeHtml(dashSearchTerm)}".</p>
    </div>`;
    return;
  }

  let html = '<table class="dash-schedule-table"><thead><tr>';
  html +=
    "<th>Week</th><th>Date</th><th>Opponent</th><th>Location</th><th></th>";
  html += "</tr></thead><tbody>";
  filteredSchedule.forEach(({ game, idx }) => {
    const isActive =
      gw.opponentName &&
      gw.opponentName === game.opponent &&
      gw.weekLabel === game.week;
    const activeClass = isActive ? " dash-schedule-active" : "";
    html += `<tr class="${activeClass}">
      <td>${escapeHtml(game.week)}</td>
      <td>${escapeHtml(game.date)}</td>
      <td><strong>${escapeHtml(game.opponent)}</strong></td>
      <td>${escapeHtml(game.location)}</td>
      <td class="dash-schedule-actions">
        <button class="btn btn-sm btn-primary" data-action="setScheduleActive" data-idx="${idx}" title="Set as active game week">🏈</button>
        <button class="btn btn-sm btn-danger" data-action="removeScheduleGame" data-idx="${idx}" title="Remove">✕</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  body.innerHTML = html;
}

/**
 * Add a game to the schedule via prompt
 */
async function addScheduleGame() {
  const week = await showPrompt("Week label:", "", {
    title: "Add Game",
    icon: "📅",
    placeholder: "e.g., Week 1",
  });
  if (!week) return;
  const opponent = await showPrompt("Opponent name:", "", {
    title: "Add Game",
    icon: "🏈",
    placeholder: "e.g., Alabama",
  });
  if (!opponent) return;
  const date = await showPrompt("Game date (optional):", "", {
    title: "Add Game",
    icon: "📆",
    placeholder: "e.g., Sep 6",
  });
  const location = await showPrompt("Location (optional):", "", {
    title: "Add Game",
    icon: "📍",
    placeholder: "e.g., Home / @ Away",
  });

  const schedule = getSchedule();
  schedule.push({
    week: week.trim(),
    date: (date || "").trim(),
    opponent: opponent.trim(),
    location: (location || "").trim(),
  });
  saveSchedule(schedule);
  renderSchedule();
  showToast("📅 Game added to schedule", { duration: 2000, type: "success" });
}

/**
 * Remove a game from the schedule
 */
async function removeScheduleGame(element) {
  const idx = parseInt(element.dataset.idx, 10);
  const schedule = getSchedule();
  if (idx < 0 || idx >= schedule.length) return;
  const game = schedule[idx];
  const ok = await showConfirm(
    `Remove <strong>${escapeHtml(game.week)} vs ${escapeHtml(game.opponent)}</strong> from the schedule?`,
    { title: "Remove Game", icon: "🗑️", confirmText: "Remove", danger: true },
  );
  if (!ok) return;
  schedule.splice(idx, 1);
  saveSchedule(schedule);
  renderSchedule();
  showToast("Game removed", { duration: 2000 });
}

/**
 * Set a scheduled game as the active game week
 */
function setScheduleActive(element) {
  const idx = parseInt(element.dataset.idx, 10);
  const schedule = getSchedule();
  if (idx < 0 || idx >= schedule.length) return;
  const game = schedule[idx];

  const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
  let oppIdx = opponents.findIndex(
    (o) => o.name.toLowerCase().trim() === game.opponent.toLowerCase().trim(),
  );

  if (oppIdx < 0) {
    opponents.push({ name: game.opponent.trim(), plays: [] });
    storageManager.set(STORAGE_KEYS.DEFENSIVE_TENDENCIES, opponents);
    oppIdx = opponents.length - 1;
  }

  setGameWeek(oppIdx, game.week);
  renderDashboard();
  showToast(
    `🏈 Active: ${escapeHtml(game.week)} vs ${escapeHtml(game.opponent)}`,
    { duration: 2500, type: "success" },
  );
}

/**
 * Render game plan summary in the dashboard
 */
function renderGamePlanSummary() {
  const section = document.getElementById("dashGamePlanSection");
  if (!section) return;
  const gw = getGameWeek();

  if (!gw.opponentName) {
    section.innerHTML = "";
    return;
  }

  const tags = getGamePlanTags();
  const tagged = tags[gw.opponentName] || [];
  const taggedCount = tagged.length;

  if (taggedCount === 0) {
    section.innerHTML = `<div class="dash-gameplan-card">
      <h3 class="dash-section-title">🎯 Game Plan — ${escapeHtml(gw.opponentName)}</h3>
      <p class="dash-gameplan-empty">No plays tagged for this opponent yet. Open the <strong>Playbook</strong>, double-click a play, and check <strong>In Game Plan</strong> to start building your game plan.</p>
      <div class="dash-gameplan-actions">
        <button class="btn btn-sm btn-success" data-action="sendDashboardGamePlanToBoxes" title="Auto-place tagged plays into the Game Plan boxes">🎯 Send to Game Plan</button>
      </div>
    </div>`;
    return;
  }

  const typeCounts = {};
  (typeof plays !== "undefined" ? plays : []).filter((p) => {
    if (tagged.includes(playSignature(p))) {
      const type = p.type || "Other";
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      return true;
    }
    return false;
  });

  const breakdownHtml = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([type, count]) =>
        `<div class="dash-gp-row"><span>${escapeHtml(type)}</span><strong>${count}</strong></div>`,
    )
    .join("");

  // Game Plan board flag counts (📋 WB / 🟡 JV) — count from current board
  const wbCount = (typeof getGamePlanFlaggedCount === "function")
    ? getGamePlanFlaggedCount("wb") : 0;
  const jvCount = (typeof getGamePlanFlaggedCount === "function")
    ? getGamePlanFlaggedCount("jv") : 0;
  const boardSize = (typeof getGamePlanBoardSignatures === "function")
    ? getGamePlanBoardSignatures().size : 0;
  const flagsHtml = `
    <div class="dash-gp-flags">
      <div class="dash-gp-flag dash-gp-flag-board" title="Plays drafted on the Game Plan board">
        <span class="dash-gp-flag-icon">🎯</span>
        <span class="dash-gp-flag-num">${boardSize}</span>
        <span class="dash-gp-flag-label">On Board</span>
      </div>
      <div class="dash-gp-flag dash-gp-flag-wb" title="Plays marked 📋 to send to a wristband">
        <span class="dash-gp-flag-icon">📋</span>
        <span class="dash-gp-flag-num">${wbCount}</span>
        <span class="dash-gp-flag-label">Wristband</span>
      </div>
      <div class="dash-gp-flag dash-gp-flag-jv" title="Plays marked 🟡 JV / freshmen">
        <span class="dash-gp-flag-icon">🟡</span>
        <span class="dash-gp-flag-num">${jvCount}</span>
        <span class="dash-gp-flag-label">JV</span>
      </div>
    </div>`;

  section.innerHTML = `<div class="dash-gameplan-card">
    <h3 class="dash-section-title">🎯 Game Plan — ${escapeHtml(gw.opponentName)}</h3>
    <div class="dash-gp-summary">
      <div class="dash-gp-total">
        <div class="dash-gp-total-num">${taggedCount}</div>
        <div class="dash-gp-total-label">Plays Tagged</div>
      </div>
      <div class="dash-gp-breakdown">
        <div class="dash-gp-breakdown-title">By Type</div>
        ${breakdownHtml}
      </div>
    </div>
    ${flagsHtml}
    <div class="dash-gameplan-actions">
      <button class="btn btn-sm btn-primary" data-action="filterPlaybookToGamePlan">📖 View in Playbook</button>
      <button class="btn btn-sm btn-success" data-action="sendDashboardGamePlanToBoxes" title="Auto-place tagged plays into the Game Plan boxes">🎯 Send to Game Plan</button>
    </div>
  </div>`;
}

/* -------------------------------------------------------------------------
   Call Sheet Cleanup — list empty / under-target categories with picker
   ------------------------------------------------------------------------- */

function _dashCategoryStats(catId) {
  const data = (typeof callSheet !== "undefined" && callSheet[catId]) || {};
  const filled = (data.left || []).length + (data.right || []).length;
  const target =
    typeof csTargets !== "undefined" && csTargets && csTargets[catId]
      ? Number(csTargets[catId])
      : 0;
  return { filled, target };
}

function _dashGetGamePlanPlaysForOpponent(opponentName) {
  if (!opponentName || typeof plays === "undefined") return [];
  const tags = (typeof getGamePlanTags === "function" ? getGamePlanTags() : {}) || {};
  const sigs = new Set(tags[opponentName] || []);
  if (sigs.size === 0) return [];
  return plays.filter((p) => sigs.has(playSignature(p)));
}

function _dashPlaysMatchingCategory(categoryId, gpPlays) {
  if (!Array.isArray(gpPlays) || gpPlays.length === 0) return [];
  return gpPlays.filter((play) => {
    if (typeof _gpComputeCallSheetTargets === "function") {
      const set = _gpComputeCallSheetTargets(play, null);
      return set.has(categoryId);
    }
    if (typeof findMatchingCategories === "function") {
      return findMatchingCategories(play).includes(categoryId);
    }
    return false;
  });
}

function renderDashCallSheetCleanup() {
  const section = document.getElementById("dashCleanupSection");
  if (!section) return;

  if (typeof CALLSHEET_CATEGORIES === "undefined" || !Array.isArray(CALLSHEET_CATEGORIES)) {
    section.innerHTML = "";
    return;
  }

  const gw = getGameWeek();
  const gpPlays = _dashGetGamePlanPlaysForOpponent(gw.opponentName);

  // Build per-category stats
  const items = CALLSHEET_CATEGORIES.map((cat) => {
    const { filled, target } = _dashCategoryStats(cat.id);
    let status = "ok";
    if (filled === 0) status = "empty";
    else if (target > 0 && filled < target) status = "under";
    return { cat, filled, target, status };
  });

  const toFix = items.filter((i) => i.status !== "ok");
  const empties = items.filter((i) => i.status === "empty").length;
  const unders = items.filter((i) => i.status === "under").length;

  const dn = (cat) =>
    typeof getCategoryDisplayName === "function" ? getCategoryDisplayName(cat) : cat.name;

  if (toFix.length === 0) {
    section.innerHTML = `<div class="dash-cleanup-card">
      <h3 class="dash-section-title">🧹 Call Sheet Cleanup</h3>
      <div class="dash-cleanup-empty-state">✅ Every Call Sheet category has plays. No cleanup needed.</div>
    </div>`;
    return;
  }

  const oppLabel = gw.opponentName ? escapeHtml(gw.opponentName) : "—";
  const gpLabel = gw.opponentName
    ? `<strong>${gpPlays.length}</strong> Game Plan plays available for ${oppLabel}`
    : `<em>No opponent selected — pick one above to fill from a Game Plan.</em>`;

  const itemsHtml = toFix
    .map(({ cat, filled, target, status }) => {
      const matchCount = gpPlays.length
        ? _dashPlaysMatchingCategory(cat.id, gpPlays).length
        : 0;
      const cls = status === "empty" ? "is-empty" : "";
      const statPill =
        status === "empty"
          ? `<span class="pill-empty">empty</span>`
          : `<span class="pill-under">${filled} / ${target}</span>`;
      const fillBtn = gw.opponentName
        ? `<button class="btn btn-sm btn-primary" data-action="dashFillCategoryFromGamePlan" data-arg="${escapeHtml(cat.id)}" title="${matchCount} matching Game Plan play${matchCount === 1 ? "" : "s"}">📥 Fill (${matchCount})</button>`
        : `<button class="btn btn-sm" disabled title="Select an opponent above">📥 Fill</button>`;
      return `<div class="dash-cleanup-item ${cls}">
        <div class="dash-cleanup-item-title">
          <span class="dash-cleanup-swatch" style="background:${escapeHtml(cat.color || "#999")};"></span>
          ${escapeHtml(dn(cat))}
        </div>
        <div class="dash-cleanup-item-stats">${statPill} • ${filled} play${filled === 1 ? "" : "s"}${target > 0 ? ` (target ${target})` : ""}</div>
        <div class="dash-cleanup-item-actions">
          ${fillBtn}
          <button class="btn btn-sm btn-secondary" data-action="dashOpenCallSheetCategory" data-arg="${escapeHtml(cat.id)}" title="Jump to this category in the Call Sheet">↗</button>
        </div>
      </div>`;
    })
    .join("");

  section.innerHTML = `<div class="dash-cleanup-card">
    <h3 class="dash-section-title">🧹 Call Sheet Cleanup</h3>
    <div class="dash-cleanup-summary">
      <div><strong>${empties}</strong> empt${empties === 1 ? "y" : "ies"} • <strong>${unders}</strong> under target</div>
      <div>${gpLabel}</div>
    </div>
    <div class="dash-cleanup-grid">${itemsHtml}</div>
  </div>`;
}

function dashOpenCallSheetCategory(categoryId) {
  if (typeof showTab === "function") showTab("callsheet");
  setTimeout(() => {
    const el = document.querySelector(`[data-cs-category="${categoryId}"], #cs-cat-${categoryId}, .cs-category[data-id="${categoryId}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlighted");
      setTimeout(() => el.classList.remove("highlighted"), 1600);
    }
  }, 250);
}

async function dashFillCategoryFromGamePlan(categoryId) {
  if (!categoryId) return;
  const gw = getGameWeek();
  if (!gw.opponentName) {
    showToast("Select an opponent first.", { type: "warning" });
    return;
  }
  if (typeof CALLSHEET_CATEGORIES === "undefined") return;
  const cat = CALLSHEET_CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return;
  const dn =
    typeof getCategoryDisplayName === "function" ? getCategoryDisplayName(cat) : cat.name;

  const gpPlays = _dashGetGamePlanPlaysForOpponent(gw.opponentName);
  if (gpPlays.length === 0) {
    showToast(`No Game Plan plays tagged for ${gw.opponentName}.`, { type: "warning" });
    return;
  }
  const matches = _dashPlaysMatchingCategory(categoryId, gpPlays);
  if (matches.length === 0) {
    showToast(`No Game Plan plays match "${dn}" yet.`, { type: "warning", duration: 3500 });
    return;
  }

  // Identify which are already in this category to pre-disable
  const cur = (typeof callSheet !== "undefined" && callSheet[categoryId]) || { left: [], right: [] };
  const already = new Set(
    [...(cur.left || []), ...(cur.right || [])].map((p) => playSignature(p)),
  );

  document.getElementById("dashFillPickerOverlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "dashFillPickerOverlay";
  const rows = matches
    .map((p, i) => {
      const sig = playSignature(p);
      const isDup = already.has(sig);
      const call =
        typeof getFullCall === "function"
          ? getFullCall(p)
          : escapeHtml(p.play || p.formation || "");
      return `<label class="dash-fill-row" style="display:flex;gap:var(--space-sm);padding:6px 8px;border-bottom:1px solid var(--color-border-light);${isDup ? "opacity:0.5;" : ""}">
        <input type="checkbox" class="dash-fill-check" data-idx="${i}" ${isDup ? "disabled" : "checked"} />
        <span style="flex:1;font-family:var(--font-mono);font-size:var(--font-size-sm);">${call}</span>
        ${isDup ? `<span style="color:var(--color-text-muted);font-size:var(--font-size-xs);">already added</span>` : ""}
      </label>`;
    })
    .join("");

  overlay.innerHTML = `
    <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="dashFillTitle" style="max-width:720px;">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">📥</span>
        <h3 class="custom-modal-title" id="dashFillTitle">Fill "${escapeHtml(dn)}" from Game Plan</h3>
      </div>
      <div class="custom-modal-body" style="max-height:60vh;overflow:auto;">
        <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin:0 0 var(--space-sm);">
          ${matches.length} play${matches.length === 1 ? "" : "s"} from <strong>${escapeHtml(gw.opponentName)}</strong>'s Game Plan match this category.
          Hash-routing (left/right) uses each play's preferred hash.
        </p>
        <div style="display:flex;gap:var(--space-xs);margin-bottom:var(--space-sm);">
          <button class="btn btn-sm" id="dashFillSelectAll">Select All</button>
          <button class="btn btn-sm" id="dashFillSelectNone">Select None</button>
        </div>
        <div id="dashFillRows" style="border:1px solid var(--color-border-light);border-radius:var(--radius-sm);">${rows}</div>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-sm" id="dashFillCancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="dashFillAdd">Add Selected</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);

  const close = () => {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 180);
  };

  overlay.querySelector("#dashFillCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } });

  overlay.querySelector("#dashFillSelectAll").addEventListener("click", () => {
    overlay.querySelectorAll(".dash-fill-check:not(:disabled)").forEach((el) => { el.checked = true; });
  });
  overlay.querySelector("#dashFillSelectNone").addEventListener("click", () => {
    overlay.querySelectorAll(".dash-fill-check").forEach((el) => { el.checked = false; });
  });

  overlay.querySelector("#dashFillAdd").addEventListener("click", () => {
    const checked = Array.from(overlay.querySelectorAll(".dash-fill-check:checked"));
    if (checked.length === 0) {
      showToast("Nothing selected.", { type: "warning" });
      return;
    }
    let added = 0;
    checked.forEach((el) => {
      const idx = Number(el.dataset.idx);
      const play = matches[idx];
      if (!play) return;
      if (typeof _gpPushPlayIntoCategory === "function") {
        if (_gpPushPlayIntoCategory(play, categoryId)) added += 1;
      }
    });
    // Persist + re-render
    if (typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined") {
      storageManager.set(STORAGE_KEYS.CALL_SHEET, callSheet);
    }
    if (typeof renderCallSheet === "function") renderCallSheet();
    close();
    if (added > 0) {
      showToast(`Added ${added} play${added === 1 ? "" : "s"} to "${dn}".`, { type: "success", duration: 2200 });
    } else {
      showToast("No new plays added (all duplicates).", { type: "warning" });
    }
    renderDashCallSheetCleanup();
  });
}

/**
 * Switch to playbook tab with game plan filter active
 */
function filterPlaybookToGamePlan() {
  showTab("playbook");
  const toggle = document.getElementById("pbGamePlanFilter");
  if (toggle && !toggle.checked) {
    toggle.checked = true;
    filterPlays();
  }
}

/**
 * Print Full Game Plan — consolidated print with scouting, call sheet, and notes
 */
function printFullGamePlan() {
  try {
    const gw = getGameWeek();
    const opp = getActiveOpponent();
    let html = '<div class="gp-print-wrap">';

    html += `<div class="gp-print-header">
    <h1>🏈 Game Plan${gw.opponentName ? " — vs. " + escapeHtml(gw.opponentName) : ""}${gw.weekLabel ? " (" + escapeHtml(gw.weekLabel) + ")" : ""}</h1>
    <p class="gp-print-date">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
  </div>`;

    if (gw.notes && gw.notes.trim()) {
      html += `<div class="gp-print-section">
      <h2 class="gp-print-section-title">📝 Game Week Notes</h2>
      <div class="gp-print-notes">${escapeHtml(gw.notes).replace(/\n/g, "<br>")}</div>
    </div>`;
    }

    if (opp && (opp.plays?.length ?? 0) > 0) {
      const overall = queryTendencies(opp, {});
      const thirdDown = queryTendencies(opp, { down: ["3"] });
      const rz = queryTendencies(opp, { situation: ["Red Zone"] });

      html += `<div class="gp-print-section">
      <h2 class="gp-print-section-title">🎯 Scouting Report — ${escapeHtml(opp.name)} (${overall.total} charted plays)</h2>
      <div class="gp-scout-grid">`;

      const sections = [
        { label: "Overall", data: overall },
        { label: "3rd Down", data: thirdDown },
        { label: "Red Zone", data: rz },
      ];

      sections.forEach((section) => {
        html += `<div class="gp-scout-col">
        <h3>${section.label} (${section.data.total})</h3>
        <table class="gp-scout-table">
          <tr><th>Fronts</th><th>%</th></tr>
          ${section.data.topFront
            .slice(0, 4)
            .map(
              (front) =>
                `<tr><td>${escapeHtml(front.term)}</td><td>${front.pct}%</td></tr>`,
            )
            .join("")}
        </table>
        <table class="gp-scout-table">
          <tr><th>Coverages</th><th>%</th></tr>
          ${section.data.topCoverage
            .slice(0, 4)
            .map(
              (coverage) =>
                `<tr><td>${escapeHtml(coverage.term)}</td><td>${coverage.pct}%</td></tr>`,
            )
            .join("")}
        </table>
        <p class="gp-blitz-line">Blitz Rate: <strong>${section.data.blitzRate}%</strong></p>
        ${section.data.topStunt && section.data.topStunt.length > 0 ? `<p class="gp-stunt-line">Top Stunt: ${escapeHtml(section.data.topStunt[0].term)} (${section.data.topStunt[0].pct}%)</p>` : ""}
      </div>`;
      });

      html += `</div></div>`;
    }

    if (typeof CALLSHEET_FRONT !== "undefined") {
      ["Front", "Back"].forEach((pageName) => {
        const categories = pageName === "Front" ? CALLSHEET_FRONT : CALLSHEET_BACK;
        const filledCats = categories.filter((cat) => {
          const data = callSheet[cat.id];
          return data && (data.left || []).length + (data.right || []).length > 0;
        });
        if (filledCats.length === 0) return;

        html += `<div class="gp-print-section gp-cs-section">
        <h2 class="gp-print-section-title">🗂️ Call Sheet — ${pageName} Page</h2>
        <div class="gp-cs-grid">`;

        filledCats.forEach((cat) => {
          const data = callSheet[cat.id] || { left: [], right: [] };
          const displayName =
            typeof getCategoryDisplayName === "function"
              ? getCategoryDisplayName(cat)
              : cat.name;
          const allPlays = [...(data.left || []), ...(data.right || [])];
          const textColor = _dashCategoryTextColor(cat.color);

          html += `<div class="gp-cs-cat">
          <div class="gp-cs-cat-header" style="background:${cat.color};color:${textColor}">${displayName} (${allPlays.length})</div>
          <div class="gp-cs-cat-plays">`;

          if ((data.left || []).length > 0) {
            html += `<div class="gp-cs-hash-group"><span class="gp-cs-hash-label">L:</span> `;
            html += (data.left || [])
              .map(
                (play) =>
                  `<span class="gp-cs-play">${typeof getFullCall === "function" ? getFullCall(play) : escapeHtml(play.play || play.name || "?")}</span>`,
              )
              .join(", ");
            html += `</div>`;
          }
          if ((data.right || []).length > 0) {
            html += `<div class="gp-cs-hash-group"><span class="gp-cs-hash-label">R:</span> `;
            html += (data.right || [])
              .map(
                (play) =>
                  `<span class="gp-cs-play">${typeof getFullCall === "function" ? getFullCall(play) : escapeHtml(play.play || play.name || "?")}</span>`,
              )
              .join(", ");
            html += `</div>`;
          }

          html += `</div></div>`;
        });

        html += `</div></div>`;
      });
    }

    html += "</div>";

    const container = document.getElementById("callSheetPrint");
    const content = document.getElementById("callSheetPrintContent");
    content.innerHTML = html;
    container.classList.remove("hidden");
    document.body.dataset.printMode = "gameplan";

    setupPrintPageStyle(
      "@media print { @page { size: letter; margin: 0.4in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Game Plan", gw.opponentName || "");
        window.print();
        restoreTitle();
      } finally {
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 100);
  } catch (err) {
    console.error("printFullGamePlan error:", err);
    document.getElementById("callSheetPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error generating game plan print.", {
      duration: 4000,
      type: "error",
    });
  }
}

/**
 * Handle opponent selection change on dashboard
 */
function onDashOpponentChange(value) {
  const idx = value === "" ? null : parseInt(value, 10);
  const weekLabel = document.getElementById("dashWeekLabel")?.value || "";
  setGameWeek(idx, weekLabel);
  renderDashboard();
  const gw = getGameWeek();
  if (gw.opponentName) {
    showToast(`🏈 Active opponent: ${gw.opponentName}`);
  } else {
    showToast("Opponent cleared");
  }
}

/**
 * Handle week label change on dashboard
 */
function onDashWeekLabelChange(value) {
  const gw = getGameWeek();
  gw.weekLabel = value;
  storageManager.set(STORAGE_KEYS.GAME_WEEK, gw);
  renderDashboard();
}

/**
 * Navigate to a tab from the dashboard quick links
 */
function dashGoToTab(tabName) {
  const tabs = document.querySelectorAll(".tab");
  const idx = TAB_INDEX_MAP[tabName];
  if (idx !== undefined && tabs[idx]) {
    tabs[idx].click();
  }
}

function _animateCountUp(el, target, duration) {
  duration = duration || 600;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  (function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * ease);
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}