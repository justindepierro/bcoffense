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
