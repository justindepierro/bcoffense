// Dashboard and game-week runtime helpers

let dashSearchTerm = "";
let _dashNotesTimer = null;
let _dashLastAnimatedValues = {}; // card key -> last animated value, prevents re-replay
const DASH_STALE_ARTIFACT_MS = 14 * 24 * 60 * 60 * 1000;

// Pick black/white text for a category background based on relative luminance.
// Used for the call sheet category headers in the dashboard print view.


// Build a single scouting-card column. Used by both the dashboard scouting
// summary and the printable game-plan scouting report.


/**
 * Render the Game Week Dashboard panel
 */


/**
 * Handle game week notes change
 */
function onDashNotesChange(value, sourceId = "dashNotesArea") {
  _dashSyncNotesTextareas(value, sourceId);
  clearTimeout(_dashNotesTimer);
  _dashNotesTimer = setTimeout(() => {
    const gw = getGameWeek();
    gw.notes = value;
    storageManager.set(STORAGE_KEYS.GAME_WEEK, gw);
  }, 400);
}

function onMobileCoachNotesChange(value) {
  onDashNotesChange(value, "mobileCoachNotesArea");
}

function focusMobileCoachNotes() {
  const mobileEl = document.getElementById("mobileCoachNotesArea");
  const desktopEl = document.getElementById("dashNotesArea");
  const mobileVisible = mobileEl && mobileEl.offsetParent !== null;
  const el = mobileVisible ? mobileEl : desktopEl || mobileEl;
  if (!el) return;
  el.focus();
  if (typeof el.setSelectionRange === "function") {
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }
}

function focusDashOpponentSelect() {
  if (typeof showTab === "function") showTab("dashboard");
  requestAnimationFrame(() => {
    document.getElementById("dashOpponentSelect")?.focus();
  });
}

function onDashSearchInput(value) {
  dashSearchTerm = value || "";
  renderDashboard();
}

const debouncedOnDashSearchInput =
  typeof debounce === "function" ? debounce(onDashSearchInput, 120) : onDashSearchInput;
window.debouncedOnDashSearchInput = debouncedOnDashSearchInput;

// Item 48: Player "I'm Ready" confirmation
function setPlayerReady(scriptId) {
  const scripts = typeof getPlayerPublishedScripts === "function" ? getPlayerPublishedScripts() : [];
  const target = scripts.find((s) => String(s.id) === String(scriptId));
  storageManager.set(STORAGE_KEYS.PLAYER_READY, {
    scriptId: String(scriptId || ""),
    scriptName: target?.name || "Today's Practice",
    timestamp: new Date().toISOString(),
  });
  if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
  showToast("Ready confirmed \u2014 you\u2019re all set \u2713", { type: "success", duration: 3000 });
  if (typeof vibrateHaptic === "function") vibrateHaptic("medium");
}

// Item 47: Push notification subscribe/settings entry point
function subscribeToPlayerNotifications() {
  if (typeof openPlayerNotificationSettings === "function") {
    openPlayerNotificationSettings();
    return;
  }
  if (typeof openNotifDrawer === "function") {
    openNotifDrawer();
    return;
  }
  showToast("Open Home before practice for coach posts and replies.", { duration: 3500, type: "info" });
}

/**
 * Render the schedule table in the dashboard
 */


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

  const oppIdx =
    typeof ensureTendenciesOpponent === "function"
      ? ensureTendenciesOpponent(game.opponent)
      : -1;
  if (oppIdx < 0) return;

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


/* -------------------------------------------------------------------------
   Call Sheet Cleanup — list empty / under-target categories with picker
   ------------------------------------------------------------------------- */


function dashOpenCallSheetCategory(categoryId) {
  if (typeof showTab === "function") showTab("callsheet");
  setTimeout(() => {
    const el = document.querySelector(`[data-cs-category="${categoryId}"], #cs-cat-${categoryId}, .cs-category[data-id="${categoryId}"]`);
    if (el) {
      scrollElementWithinPanel(el, { behavior: "smooth", block: "center" });
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


/**
 * Handle opponent selection change on dashboard (#27: warn on unsaved state)
 */
async function onDashOpponentChange(value) {
  if (scriptDirty || wristbandDirty) {
    const proceed = await showConfirm(
      "You have unsaved changes to your script or wristband. Switch opponents anyway?",
      { title: "Unsaved Changes", confirmText: "Switch Anyway", cancelText: "Stay", danger: true },
    );
    if (!proceed) {
      const gw = getGameWeek();
      const sel = document.getElementById("dashOpponentSelect");
      if (sel) sel.value = gw.opponentIndex !== null ? String(gw.opponentIndex) : "";
      return;
    }
  }
  const idx = value === "" ? null : parseInt(value, 10);
  const weekLabel = document.getElementById("dashWeekLabel")?.value || "";
  setGameWeek(idx, weekLabel);
  renderDashboard();
  const gw = getGameWeek();
  if (gw.opponentName) {
    showToast(`🏈 Active opponent: ${gw.opponentName}`);
    // #28: Restore last active tab for this opponent if recorded
    const savedTab = gw.lastTabs?.[String(idx)];
    if (savedTab && typeof showTab === "function" && savedTab !== "dashboard") {
      setTimeout(() => showTab(savedTab), 0);
    }
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
  document.getElementById("tab-" + tabName)?.click();
}

// ── Game Week lifecycle actions (#54-55) ────────────────────────────────────

/**
 * Guided wizard to start a fresh game week (#54).
 * Prompts for week label and opponent, then calls setGameWeek().
 * Does not delete any saved data — only changes the active assignment.
 */
async function startNewGameWeek() {
  const gw = getGameWeek();

  if (gw.opponentName) {
    const ok = await showConfirm(
      `<p>Start a new game week? The current assignment (<strong>${escapeHtml(gw.opponentName)}${gw.weekLabel ? " — " + escapeHtml(gw.weekLabel) : ""}</strong>) will be replaced.</p>
       <p>Your scouting reports, game plan, script, and other saved data are not deleted.</p>`,
      { title: "🏈 Start New Game Week", confirmText: "Start New Week", cancelText: "Keep Current" },
    );
    if (!ok) return;
  }

  const weekLabel = await showPrompt(
    "Enter a label for this game week:",
    gw.weekLabel || "",
    { title: "🏈 New Game Week", placeholder: "Week 8" },
  );
  if (weekLabel === null) return;

  const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
  let opponentIndex = null;

  if (opponents.length > 0) {
    const items = [
      { value: "__none__", label: "— No opponent (clear current)" },
      ...opponents.map((opp, i) => ({ value: String(i), label: opp.name })),
    ];
    const picked = await showListPicker(
      "Select the opponent for this week:",
      items,
      { title: "🏈 New Game Week — Opponent", icon: "🏈" },
    );
    if (picked === null) return;
    if (picked !== "__none__") opponentIndex = parseInt(picked, 10);
  }

  setGameWeek(opponentIndex, weekLabel.trim());

  const oppName = opponentIndex !== null && opponents[opponentIndex] ? opponents[opponentIndex].name : "";
  showToast(
    `Game week started${weekLabel.trim() ? ": " + weekLabel.trim() : ""}${oppName ? " vs " + oppName : ""}.`,
    { duration: 3500, type: "success" },
  );

  if (typeof renderDashboard === "function") renderDashboard();
}

/**
 * Duplicate the current game week for a rematch or repeat matchup (#43).
 */
async function duplicateGameWeek() {
  const gw = getGameWeek();
  const defaultLabel = gw.weekLabel ? `${gw.weekLabel} (Rematch)` : "Rematch";
  const weekLabel = await showPrompt(
    "Enter a label for the duplicate game week:",
    defaultLabel,
    { title: "Duplicate Game Week", placeholder: "Week 12 — Rematch" },
  );
  if (weekLabel === null) return;
  setGameWeek(gw.opponentIndex, weekLabel.trim());
  showToast("Game week duplicated.", { type: "success" });
  if (typeof renderDashboard === "function") renderDashboard();
}

/**
 * Archive the current game week snapshot (#44).
 */
function archiveGameWeek() {
  const gw = getGameWeek();
  if (!gw.opponentName && !gw.weekLabel) {
    showModal("No active game week to archive.", { title: "Archive", icon: "📦" });
    return;
  }
  const archive = storageManager.get(STORAGE_KEYS.GAME_WEEK_ARCHIVE, []);
  archive.unshift({ ...gw, archivedAt: new Date().toISOString() });
  if (archive.length > 20) archive.splice(20);
  storageManager.set(STORAGE_KEYS.GAME_WEEK_ARCHIVE, archive);
  showToast("Game week archived.", { type: "success" });
}

/**
 * Show the game week archive and optionally restore an entry (#44).
 */
async function showGameWeekArchive() {
  const archive = storageManager.get(STORAGE_KEYS.GAME_WEEK_ARCHIVE, []);
  if (archive.length === 0) {
    await showModal("No archived game weeks.", { title: "Game Week Archive", icon: "📦" });
    return;
  }
  const items = archive.map((entry, i) => {
    const opp = entry.opponentName || "(no opponent)";
    const week = entry.weekLabel || "(no label)";
    const date = entry.archivedAt ? new Date(entry.archivedAt).toLocaleDateString() : "";
    return {
      value: String(i),
      label: `${opp} — ${week}${date ? " (archived " + date + ")" : ""}`,
    };
  });
  const picked = await showListPicker("Restore a game week:", items, {
    title: "Game Week Archive",
    icon: "📦",
  });
  if (picked === null) return;
  const entry = archive[parseInt(picked, 10)];
  if (!entry) return;
  const ok = await showConfirm(
    `Restore game week: <strong>${escapeHtml(entry.opponentName || "(no opponent)")}</strong>${entry.weekLabel ? " — " + escapeHtml(entry.weekLabel) : ""}?`,
    { title: "Restore Game Week", confirmText: "Restore", cancelText: "Cancel" },
  );
  if (!ok) return;
  // eslint-disable-next-line no-unused-vars
  const { archivedAt, ...gwData } = entry;
  storageManager.set(STORAGE_KEYS.GAME_WEEK, gwData);
  if (typeof updateGameWeekBar === "function") updateGameWeekBar();
  if (typeof renderDashboard === "function") renderDashboard();
  showToast("Game week restored.", { type: "success" });
}

/**
 * Resume the current game week by navigating to the last active work module (#55).
 * Falls back to the game plan tab if no prior tab is recorded.
 */
function resumeCurrentWeek() {
  const gw = getGameWeek();
  if (!gw.opponentName) {
    showToast("No active game week. Use \"Start New Week\" to begin.", { type: "info", duration: 3000 });
    return;
  }
  const lastTab = storageManager.get(STORAGE_KEYS.LAST_ACTIVE_TAB, "gameplan");
  const workTabs = new Set(["gameplan", "script", "callsheet", "wristband", "tendencies"]);
  const target = workTabs.has(lastTab) && lastTab !== "dashboard" ? lastTab : "gameplan";
  if (typeof showTab === "function") showTab(target);
}

function continueToModule(tabName) {
  if (typeof showTab === "function") showTab(tabName);
  if (tabName === "tendencies") {
    requestAnimationFrame(() => {
      const gw = getGameWeek();
      if (!gw.opponentName) return;
      const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
      const idx = opponents.findIndex(
        (o) => String(o.name || "").toLowerCase() === String(gw.opponentName || "").toLowerCase(),
      );
      if (idx >= 0 && typeof selectTendenciesOpponent === "function") {
        selectTendenciesOpponent(idx);
      }
    });
  }
}
