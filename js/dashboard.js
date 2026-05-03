// Dashboard and game-week runtime helpers

let dashSearchTerm = "";
let _dashNotesTimer = null;

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
        if (!isNaN(n) && n > 0) _animateCountUp(el, n, 600);
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
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">Overall (${overall.total} plays)</div>
            <div class="dash-scout-items">
              ${overall.topFront
            .slice(0, 3)
            .map(
              (f) =>
                `<div class="dash-scout-row"><span>Front:</span> <b>${escapeHtml(f.term)}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
            )
            .join("")}
              ${overall.topCoverage
            .slice(0, 3)
            .map(
              (c) =>
                `<div class="dash-scout-row"><span>Cov:</span> <b>${escapeHtml(c.term)}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
            )
            .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${overall.blitzRate}%</b></div>
            </div>
          </div>
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">3rd Down (${thirdDown.total} plays)</div>
            <div class="dash-scout-items">
              ${thirdDown.topFront
            .slice(0, 2)
            .map(
              (f) =>
                `<div class="dash-scout-row"><span>Front:</span> <b>${escapeHtml(f.term)}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
            )
            .join("")}
              ${thirdDown.topCoverage
            .slice(0, 2)
            .map(
              (c) =>
                `<div class="dash-scout-row"><span>Cov:</span> <b>${escapeHtml(c.term)}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
            )
            .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${thirdDown.blitzRate}%</b></div>
            </div>
          </div>
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">Red Zone (${rz.total} plays)</div>
            <div class="dash-scout-items">
              ${rz.topFront
            .slice(0, 2)
            .map(
              (f) =>
                `<div class="dash-scout-row"><span>Front:</span> <b>${escapeHtml(f.term)}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
            )
            .join("")}
              ${rz.topCoverage
            .slice(0, 2)
            .map(
              (c) =>
                `<div class="dash-scout-row"><span>Cov:</span> <b>${escapeHtml(c.term)}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
            )
            .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${rz.blitzRate}%</b></div>
            </div>
          </div>
        </div>
      `;
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
    <button class="btn btn-sm btn-primary" data-action="filterPlaybookToGamePlan">📖 View in Playbook</button>
  </div>`;
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
          const textColor =
            cat.color === CS_COLORS.yellow || cat.color === "#f8f9fa"
              ? UI_COLORS.textBlack
              : UI_COLORS.textWhite;

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