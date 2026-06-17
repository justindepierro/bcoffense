// Dashboard and game-week runtime helpers

let dashSearchTerm = "";
let _dashNotesTimer = null;
let _dashLastAnimatedValues = {}; // card key -> last animated value, prevents re-replay
const DASH_STALE_ARTIFACT_MS = 14 * 24 * 60 * 60 * 1000;

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

function _dashFindGameWeekOpponent(gw, opponents) {
  if (!gw || !Array.isArray(opponents)) return null;
  return resolveGameWeekOpponent(opponents, gw).opponent;
}

function _dashCountCallSheetPlays() {
  if (typeof callSheet === "undefined" || !callSheet) return 0;
  return Object.values(callSheet).reduce(
    (sum, data) =>
      sum +
      (Array.isArray(data?.left) ? data.left.length : 0) +
      (Array.isArray(data?.right) ? data.right.length : 0),
    0,
  );
}

function _dashGetBoardGamePlanCount() {
  try {
    if (typeof getGamePlanBoardSignatures === "function") {
      return getGamePlanBoardSignatures().size;
    }
  } catch (_err) {
    return 0;
  }
  return 0;
}

function _dashGetScriptPlayCount() {
  return Array.isArray(script)
    ? script.filter((play) => play && !play.isSeparator).length
    : 0;
}

function _dashGetPlaybookCount() {
  return Array.isArray(plays) ? plays.length : 0;
}

function _dashGetWristbandPlayCount() {
  if (!Array.isArray(wristbandCards)) return 0;
  return wristbandCards.reduce((sum, card) => {
    const cells = Array.isArray(card?.data)
      ? card.data
      : Array.isArray(card)
        ? card
        : [];
    return sum + cells.filter((play) => play !== null && play !== undefined).length;
  }, 0);
}

function _dashGetTimestamp(value) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function _dashFormatSavedAge(value) {
  const timestamp = _dashGetTimestamp(value);
  if (!timestamp) return "no saved date";
  const ageMs = Date.now() - timestamp;
  if (ageMs < 60 * 60 * 1000) return "saved this hour";
  const days = Math.max(1, Math.round(ageMs / (24 * 60 * 60 * 1000)));
  return `saved ${days} day${days === 1 ? "" : "s"} ago`;
}

function _dashIsStaleSavedAt(value) {
  const timestamp = _dashGetTimestamp(value);
  if (!timestamp) return true;
  return Date.now() - timestamp > DASH_STALE_ARTIFACT_MS;
}

function _dashGetLatestSaved(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items.reduce((latest, item) => {
    if (!latest) return item;
    return _dashGetTimestamp(item?.savedAt) >= _dashGetTimestamp(latest?.savedAt)
      ? item
      : latest;
  }, null);
}

function _dashCountSavedWristbandPlays(record) {
  if (!record) return 0;
  const cards = Array.isArray(record.cards)
    ? record.cards
    : Array.isArray(record.data)
      ? [{ data: record.data }]
      : [];
  return cards.reduce((sum, card) => {
    const cells = Array.isArray(card?.data) ? card.data : [];
    return sum + cells.filter((play) => play !== null && play !== undefined).length;
  }, 0);
}

function _dashCountGamePlanSnapshotPlays(snapshot) {
  const assignments = snapshot?.board?.assignments || {};
  return Object.values(assignments).reduce(
    (sum, assigned) => sum + (Array.isArray(assigned) ? assigned.length : 0),
    0,
  );
}

function _dashCountDraftWristbandPlays(draft) {
  if (!draft) return 0;
  return _dashCountSavedWristbandPlays(draft);
}

function _dashCountDraftCallSheetPlays(draft) {
  const sheet = draft?.callSheet || {};
  return Object.values(sheet).reduce(
    (sum, data) =>
      sum +
      (Array.isArray(data?.left) ? data.left.length : 0) +
      (Array.isArray(data?.right) ? data.right.length : 0),
    0,
  );
}

function _dashGetFreshDraft(storageKey) {
  const draft = storageManager.get(storageKey, null);
  if (!draft || typeof draft !== "object") return null;
  if (typeof isDraftExpired === "function" && isDraftExpired(draft)) return null;
  return draft;
}

function _dashGetGamePlanSnapshotsForWeek(gw) {
  const all = typeof _gpLoadAllSnapshots === "function"
    ? _gpLoadAllSnapshots()
    : storageManager.get(STORAGE_KEYS.GAME_PLAN_SNAPSHOTS, {});
  const key = gw?.opponentName || "__unassigned__";
  return Array.isArray(all?.[key]) ? all[key] : [];
}

function _dashFindScheduleGame(gw, schedule) {
  if (!gw?.opponentName || !Array.isArray(schedule)) return null;
  const opp = String(gw.opponentName || "").toLowerCase().trim();
  const week = String(gw.weekLabel || "").toLowerCase().trim();
  return schedule.find((game) => {
    const gameOpp = String(game?.opponent || "").toLowerCase().trim();
    const gameWeek = String(game?.week || "").toLowerCase().trim();
    if (week) return gameOpp === opp && gameWeek === week;
    return gameOpp === opp;
  }) || null;
}

function _dashBuildGameWeekMetrics(gw, opponents) {
  const opponent = _dashFindGameWeekOpponent(gw, opponents);
  const schedule = typeof getSchedule === "function" ? getSchedule() : [];
  const activeGame = _dashFindScheduleGame(gw, schedule);
  const playbookCount = _dashGetPlaybookCount();
  const scoutCount = opponent?.plays?.length || 0;
  const taggedPlanCount = gw.opponentName
    ? _dashGetGamePlanPlaysForOpponent(gw.opponentName).length
    : 0;
  const boardPlanCount = _dashGetBoardGamePlanCount();
  const scriptCount = _dashGetScriptPlayCount();
  const wristbandCount = _dashGetWristbandPlayCount();
  const callSheetCount = _dashCountCallSheetPlays();
  const notesReady = Boolean(String(gw.notes || "").trim());
  const readinessChecks = [
    playbookCount > 0,
    Boolean(gw.opponentName),
    scoutCount > 0,
    taggedPlanCount > 0 || boardPlanCount > 0,
    scriptCount > 0,
    wristbandCount > 0,
    callSheetCount > 0,
    notesReady,
  ];
  const readyCount = readinessChecks.filter(Boolean).length;
  const readiness = Math.round((readyCount / readinessChecks.length) * 100);
  let status = "Needs setup";
  if (readiness >= 85) status = "Ready";
  else if (readiness >= 50) status = "In progress";
  return {
    opponent,
    schedule,
    activeGame,
    playbookCount,
    scoutCount,
    taggedPlanCount,
    boardPlanCount,
    scriptCount,
    wristbandCount,
    callSheetCount,
    notesReady,
    readiness,
    status,
  };
}

function _dashStatusClass(readiness) {
  if (readiness >= 85) return "is-ready";
  if (readiness >= 50) return "is-progress";
  return "is-setup";
}

function _dashMetricStatus(value) {
  return value > 0 ? "is-good" : "is-empty";
}

function _dashBuildActionAttrs(action, arg) {
  if (!action) return "";
  const dataArg = arg !== undefined ? ` data-arg="${escapeHtml(arg)}"` : "";
  return ` data-action="${escapeHtml(action)}"${dataArg}`;
}

function _dashBuildPrepChecklist(metrics, gw) {
  const gamePlanCount = metrics.taggedPlanCount || metrics.boardPlanCount;
  return [
    {
      label: "Playbook loaded",
      detail: `${metrics.playbookCount} play${metrics.playbookCount === 1 ? "" : "s"} available`,
      done: metrics.playbookCount > 0,
      action: metrics.playbookCount > 0 ? "showTab" : "showUpload",
      arg: metrics.playbookCount > 0 ? "playbook" : undefined,
    },
    {
      label: "Opponent selected",
      detail: gw.opponentName || "Choose this week's opponent",
      done: Boolean(gw.opponentName),
      action: "focusDashOpponentSelect",
    },
    {
      label: "Scouting charted",
      detail: `${metrics.scoutCount} tendency play${metrics.scoutCount === 1 ? "" : "s"}`,
      done: metrics.scoutCount > 0,
      action: "showTab",
      arg: "tendencies",
    },
    {
      label: "Game plan built",
      detail: `${metrics.taggedPlanCount} tagged / ${metrics.boardPlanCount} board call${metrics.boardPlanCount === 1 ? "" : "s"}`,
      done: gamePlanCount > 0,
      action: "showTab",
      arg: "gameplan",
    },
    {
      label: "Practice script ready",
      detail: `${metrics.scriptCount} script call${metrics.scriptCount === 1 ? "" : "s"}`,
      done: metrics.scriptCount > 0,
      action: "showTab",
      arg: "script",
    },
    {
      label: "Wristband ready",
      detail: `${metrics.wristbandCount} wristband call${metrics.wristbandCount === 1 ? "" : "s"}`,
      done: metrics.wristbandCount > 0,
      action: "showTab",
      arg: "wristband",
    },
    {
      label: "Call sheet filled",
      detail: `${metrics.callSheetCount} sheet call${metrics.callSheetCount === 1 ? "" : "s"}`,
      done: metrics.callSheetCount > 0,
      action: "showTab",
      arg: "callsheet",
    },
    {
      label: "Notes captured",
      detail: metrics.notesReady ? "Game-week notes added" : "Add matchup notes",
      done: metrics.notesReady,
      action: "focusMobileCoachNotes",
    },
  ];
}

function _dashBuildPrepChecklistItem(item) {
  const action = _dashBuildActionAttrs(item.action, item.arg);
  return `<button class="dash-prep-item ${item.done ? "is-done" : "is-open"}" type="button"${action}>
    <span class="dash-prep-status" aria-hidden="true">${item.done ? "✓" : "!"}</span>
    <span class="dash-prep-copy">
      <span class="dash-prep-label">${escapeHtml(item.label)}</span>
      <span class="dash-prep-detail">${escapeHtml(item.detail)}</span>
    </span>
  </button>`;
}

function _dashBuildReadinessGapRows(gaps) {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return `<button class="dash-readiness-gap is-clean" type="button" data-action="showTab" data-arg="gameplan">
      <span class="dash-readiness-gap-marker" aria-hidden="true">✓</span>
      <span class="dash-readiness-gap-copy">
        <span class="dash-readiness-gap-label">Core prep complete</span>
        <span class="dash-readiness-gap-detail">Review the game plan or print staff materials.</span>
      </span>
    </button>`;
  }
  return gaps
    .slice(0, 4)
    .map((gap, idx) => {
      const action = _dashBuildActionAttrs(gap.action, gap.arg);
      return `<button class="dash-readiness-gap" type="button"${action}>
        <span class="dash-readiness-gap-marker" aria-hidden="true">${idx + 1}</span>
        <span class="dash-readiness-gap-copy">
          <span class="dash-readiness-gap-label">${escapeHtml(gap.label)}</span>
          <span class="dash-readiness-gap-detail">${escapeHtml(gap.detail)}</span>
        </span>
      </button>`;
    })
    .join("");
}

function _dashBuildActionQueue(metrics, gw) {
  const items = [];
  const scriptDraft = _dashGetFreshDraft(STORAGE_KEYS.SCRIPT_DRAFT);
  const scriptDraftCount = Array.isArray(scriptDraft?.plays)
    ? scriptDraft.plays.filter((item) => !item?.isSeparator).length
    : 0;
  if (scriptDraftCount > 0) {
    items.push({
      label: "Finish script draft",
      detail: `${scriptDraft.name || "Untitled script"} • ${scriptDraftCount} calls • ${formatDraftSavedAt(scriptDraft)}`,
      level: "open",
      action: "showTab",
      arg: "script",
    });
  }

  const wristbandDraft = _dashGetFreshDraft(STORAGE_KEYS.WRISTBAND_DRAFT);
  const wristbandDraftCount = _dashCountDraftWristbandPlays(wristbandDraft);
  if (wristbandDraftCount > 0) {
    items.push({
      label: "Finish wristband draft",
      detail: `${wristbandDraftCount} calls • ${formatDraftSavedAt(wristbandDraft)}`,
      level: "open",
      action: "showTab",
      arg: "wristband",
    });
  }

  const callSheetDraft = _dashGetFreshDraft(STORAGE_KEYS.CALLSHEET_DRAFT);
  const callSheetDraftCount = _dashCountDraftCallSheetPlays(callSheetDraft);
  if (callSheetDraftCount > 0) {
    items.push({
      label: "Review call sheet draft",
      detail: `${callSheetDraftCount} calls • ${formatDraftSavedAt(callSheetDraft)}`,
      level: "open",
      action: "showTab",
      arg: "callsheet",
    });
  }

  const tendenciesDraft = _dashGetFreshDraft(STORAGE_KEYS.TENDENCIES_DRAFT);
  const tendencyFieldCount = tendenciesDraft?.play
    ? Object.values(tendenciesDraft.play).filter((value) => value && String(value).trim()).length
    : 0;
  if (tendencyFieldCount > 0) {
    items.push({
      label: "Finish scouting draft",
      detail: `${tendencyFieldCount} fields started • ${formatDraftSavedAt(tendenciesDraft)}`,
      level: "open",
      action: "showTab",
      arg: "tendencies",
    });
  }

  if (typeof scriptDirty !== "undefined" && scriptDirty && metrics.scriptCount > 0) {
    items.push({
      label: "Save current script",
      detail: `${metrics.scriptCount} calls have unsaved changes`,
      level: "open",
      action: "showTab",
      arg: "script",
    });
  }

  if (typeof wristbandDirty !== "undefined" && wristbandDirty && metrics.wristbandCount > 0) {
    items.push({
      label: "Save current wristband",
      detail: `${metrics.wristbandCount} calls have unsaved changes`,
      level: "open",
      action: "showTab",
      arg: "wristband",
    });
  }

  const savedScripts = typeof getSavedScripts === "function"
    ? getSavedScripts()
    : storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  const latestScript = _dashGetLatestSaved(savedScripts);
  if (latestScript && _dashIsStaleSavedAt(latestScript.savedAt)) {
    items.push({
      label: "Old saved script",
      detail: `${latestScript.name || "Saved script"} • ${_dashFormatSavedAge(latestScript.savedAt)}`,
      level: "stale",
      action: "showTab",
      arg: "script",
    });
  }

  const savedWristbands = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const latestWristband = _dashGetLatestSaved(savedWristbands);
  if (latestWristband && _dashIsStaleSavedAt(latestWristband.savedAt)) {
    items.push({
      label: "Old saved wristband",
      detail: `${latestWristband.title || "Saved wristband"} • ${_dashCountSavedWristbandPlays(latestWristband)} calls • ${_dashFormatSavedAge(latestWristband.savedAt)}`,
      level: "stale",
      action: "showTab",
      arg: "wristband",
    });
  }

  const snapshots = _dashGetGamePlanSnapshotsForWeek(gw);
  const latestSnapshot = _dashGetLatestSaved(snapshots);
  if (latestSnapshot && _dashIsStaleSavedAt(latestSnapshot.savedAt)) {
    items.push({
      label: "Old saved game plan",
      detail: `${latestSnapshot.name || "Saved plan"} • ${_dashCountGamePlanSnapshotPlays(latestSnapshot)} calls • ${_dashFormatSavedAge(latestSnapshot.savedAt)}`,
      level: "stale",
      action: "showTab",
      arg: "gameplan",
    });
  }

  const templates = storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []);
  const latestTemplate = _dashGetLatestSaved(templates);
  if (latestTemplate && _dashIsStaleSavedAt(latestTemplate.savedAt)) {
    items.push({
      label: "Old call sheet template",
      detail: `${latestTemplate.name || "Saved template"} • ${latestTemplate.playCount || 0} calls • ${_dashFormatSavedAge(latestTemplate.savedAt)}`,
      level: "stale",
      action: "showTab",
      arg: "callsheet",
    });
  }

  if (items.length === 0) {
    items.push({
      label: "No unfinished or stale artifacts",
      detail: "Drafts and saved weekly materials look current",
      level: "clean",
      action: "showStorageInfo",
    });
  }
  return items.slice(0, 6);
}

function _dashBuildActionQueueItem(item) {
  const action = _dashBuildActionAttrs(item.action, item.arg);
  const marker = item.level === "clean" ? "✓" : item.level === "stale" ? "!" : "↗";
  return `<button class="dash-action-item is-${escapeHtml(item.level)}" type="button"${action}>
    <span class="dash-action-marker" aria-hidden="true">${marker}</span>
    <span class="dash-action-copy">
      <span class="dash-action-label">${escapeHtml(item.label)}</span>
      <span class="dash-action-detail">${escapeHtml(item.detail)}</span>
    </span>
  </button>`;
}

function _dashTruncateText(value, maxLength = 140) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function _dashBuildInstallPriorities() {
  const report = typeof generateSmartInstallReport === "function"
    ? generateSmartInstallReport()
    : null;
  if (!report) {
    return {
      summary: "No playbook loaded",
      priorities: [],
      readyCount: 0,
      nearCount: 0,
    };
  }
  return {
    summary: `${report.totalGameReady || 0} ready / ${report.totalNearReady || 0} near-ready`,
    priorities: (report.topInstalls || []).slice(0, 3),
    readyCount: report.totalGameReady || 0,
    nearCount: report.totalNearReady || 0,
  };
}

function _dashBuildWeeklyFocus(gw) {
  const notes = String(gw?.notes || "").trim();
  const install = _dashBuildInstallPriorities();
  return {
    notes,
    notesPreview: notes ? _dashTruncateText(notes, 180) : "No weekly notes yet.",
    install,
  };
}

function _dashBuildInstallPriorityRows(priorities) {
  if (!Array.isArray(priorities) || priorities.length === 0) {
    return `<button class="dash-focus-priority is-empty" type="button" data-action="showTab" data-arg="installation">
      <span class="dash-focus-rank">-</span>
      <span class="dash-focus-priority-copy">
        <span class="dash-focus-priority-name">No install priorities</span>
        <span class="dash-focus-priority-detail">Open Installation after loading a playbook.</span>
      </span>
    </button>`;
  }
  return priorities
    .map((priority, idx) => {
      const impact = [];
      if (priority.wouldUnlock > 0) {
        impact.push(`${priority.wouldUnlock} unlock`);
      }
      if (priority.clusterPlays > 0) {
        impact.push(`${priority.clusterPlays} near-ready`);
      }
      if (priority.breadth > 0) {
        impact.push(`${priority.breadth} plays`);
      }
      return `<button class="dash-focus-priority" type="button" data-action="showTab" data-arg="installation">
        <span class="dash-focus-rank">${idx + 1}</span>
        <span class="dash-focus-priority-copy">
          <span class="dash-focus-priority-name">${escapeHtml(priority.value)}</span>
          <span class="dash-focus-priority-detail">${escapeHtml(priority.categoryLabel)}${impact.length ? ` - ${escapeHtml(impact.join(" / "))}` : ""}</span>
        </span>
      </button>`;
    })
    .join("");
}

function isPlayerDashboardRole() {
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return currentUser?.role === "player";
}

function getPlayerDashboardFeaturedScript(publishedScripts = []) {
  const scripts = Array.isArray(publishedScripts) ? publishedScripts : [];
  if (scripts.length === 0) return null;
  const todayValue = new Date().toISOString().slice(0, 10);
  const currentName = document.getElementById("scriptName")?.value || "";
  const currentDate = document.getElementById("scriptDate")?.value || "";
  return scripts.find(
    (savedScript) =>
      savedScript.date === todayValue ||
      (savedScript.name === currentName &&
        (savedScript.date || "") === currentDate),
  ) || scripts[0];
}

function getPlayerDashboardLoadedScriptSummary() {
  const playCount = Array.isArray(script)
    ? script.filter((entry) => entry && !entry.isSeparator).length
    : 0;
  if (playCount === 0) return null;
  return {
    name: document.getElementById("scriptName")?.value || "Practice Script",
    stats: typeof getSavedScriptStats === "function"
      ? getSavedScriptStats({
        plays: script,
        date: document.getElementById("scriptDate")?.value || "",
        savedAt: "",
      })
      : null,
  };
}

function renderPlayerDashboardHome() {
  const section = document.getElementById("playerDashboardHome");
  if (!section) return;
  if (!isPlayerDashboardRole()) {
    section.hidden = true;
    section.innerHTML = "";
    return;
  }

  const publishedScripts =
    typeof getPlayerPublishedScripts === "function" ? getPlayerPublishedScripts() : [];
  const featuredScript = getPlayerDashboardFeaturedScript(publishedScripts);
  const featuredStats =
    featuredScript && typeof getSavedScriptStats === "function"
      ? getSavedScriptStats(featuredScript)
      : null;
  const loadedScript = getPlayerDashboardLoadedScriptSummary();
  const todayValue = new Date().toISOString().slice(0, 10);
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
  const teamName =
    (storageManager.get(STORAGE_KEYS.TEAM_NAME, "") || "").trim() ||
    "Player Practice Portal";
  const featuredScriptId = featuredScript ? escapeHtml(String(featuredScript.id)) : "";
  const practiceAction = featuredScript
    ? `data-action="loadPublishedPlayerScript" data-arg="${featuredScriptId}"`
    : 'data-action="showTab" data-arg="script"';
  const swipeAction = loadedScript
    ? 'data-action="openScriptPresentation"'
    : featuredScript
      ? `data-action="presentPublishedPlayerScript" data-arg="${featuredScriptId}"`
      : 'data-action="showTab" data-arg="script"';
  const playbookAction = 'data-action="showTab" data-arg="playbook"';
  const statusTitle =
    featuredScript?.name || loadedScript?.name || "No practice published yet";
  const statusCopy = featuredStats
    ? `${featuredStats.playCount} plays • ${featuredStats.totalReps} reps • ${featuredStats.periodCount} periods`
    : loadedScript?.stats
      ? `${loadedScript.stats.playCount} loaded plays are ready in the Practice tab`
      : "Practice will appear here when your coach publishes it.";
  const recentScriptsMarkup = publishedScripts.length
    ? publishedScripts
      .slice(0, 4)
      .map((savedScript) => {
        const stats =
          typeof getSavedScriptStats === "function"
            ? getSavedScriptStats(savedScript)
            : null;
        const eyebrow =
          savedScript.date === todayValue ? "Today" : "Published";
        return `
          <button class="player-home-script-item" type="button" data-action="loadPublishedPlayerScript"
            data-arg="${savedScript.id}">
            <span class="player-home-script-item__eyebrow">${escapeHtml(eyebrow)}</span>
            <span class="player-home-script-item__title">${escapeHtml(savedScript.name)}</span>
            <span class="player-home-script-item__meta">${escapeHtml(
          stats
            ? `${stats.playCount} plays • ${stats.totalReps} reps`
            : "Open practice",
        )}</span>
          </button>
        `;
      })
      .join("")
    : `<div class="player-home-list-empty">No practice script has been published yet. Check back with your coach.</div>`;

  section.hidden = false;
  section.innerHTML = `
    <section class="player-home-hero player-home-hero--pro">
      <div class="player-home-hero__copy">
        <span class="player-home-eyebrow">Player Portal</span>
        <h2>${escapeHtml(teamName)}</h2>
        <p>${escapeHtml(todayLabel)} • Open today's work, swipe play to play, and lock your position when you study rules.</p>
      </div>
      <div class="player-home-today-card" aria-label="Today status">
        <span>Today</span>
        <strong>${escapeHtml(statusTitle)}</strong>
        <p>${escapeHtml(statusCopy)}</p>
      </div>
    </section>
    <section class="player-home-quick-actions" aria-label="Player quick actions">
      <button type="button" class="player-home-quick-action player-home-quick-action--primary"
        ${practiceAction}>
        <span class="player-home-quick-icon">▶</span>
        <strong>Open Practice</strong>
        <small>Script, periods, and calls</small>
      </button>
      <button type="button" class="player-home-quick-action" ${swipeAction}>
        <span class="player-home-quick-icon">▣</span>
        <strong>Swipe View</strong>
        <small>Diagram plus your rules</small>
      </button>
      <button type="button" class="player-home-quick-action" ${playbookAction}>
        <span class="player-home-quick-icon">⌕</span>
        <strong>Playbook</strong>
        <small>Search, filter, and study</small>
      </button>
    </section>
    <div class="player-home-grid">
      <article class="player-home-card player-home-card--feature">
        <span class="player-home-card__eyebrow">${escapeHtml(
    featuredScript?.date === todayValue ? "Today's Practice" : "Published Practice",
  )}</span>
        <h3>${escapeHtml(featuredScript?.name || "Waiting on a published practice")}</h3>
        <p>${escapeHtml(
    featuredStats
      ? `${featuredStats.playCount} plays, ${featuredStats.totalReps} reps, and ${featuredStats.periodCount} periods are ready to review.`
      : "When your coach publishes a practice script, it will show up here first.",
  )}</p>
        ${
          featuredStats
            ? `<div class="player-home-stat-row">
                <span>${featuredStats.playCount} plays</span>
                <span>${featuredStats.totalReps} reps</span>
                <span>${featuredStats.periodCount} periods</span>
              </div>`
            : ""
        }
        <div class="player-home-card__actions">
          <button type="button" class="btn btn-primary player-home-action" ${practiceAction}>
            Open Practice
          </button>
          <button type="button" class="btn btn-secondary player-home-action" ${swipeAction}>
            Open Swipe View
          </button>
        </div>
      </article>
      <article class="player-home-card">
        <span class="player-home-card__eyebrow">Study Flow</span>
        <h3>What to do first</h3>
        <div class="player-home-study-list">
          <div><strong>1</strong><span>Load the practice so the day's script is ready.</span></div>
          <div><strong>2</strong><span>Use Swipe View and lock your position for rules.</span></div>
          <div><strong>3</strong><span>Use Playbook filters when you need more reps on a family.</span></div>
        </div>
      </article>
      <article class="player-home-card">
        <span class="player-home-card__eyebrow">Recent Practices</span>
        <h3>Jump back in fast</h3>
        <div class="player-home-script-list">
          ${recentScriptsMarkup}
        </div>
      </article>
      <article class="player-home-card">
        <span class="player-home-card__eyebrow">Current Work</span>
        <h3>${escapeHtml(loadedScript?.name || "Load a practice to begin")}</h3>
        <p>${escapeHtml(
    loadedScript?.stats
      ? `${loadedScript.stats.playCount} plays are already loaded in the Practice tab.`
      : "Once loaded, this becomes your quick way back into the day's rules.",
  )}</p>
        ${
          loadedScript?.stats
            ? `<div class="player-home-stat-row">
                <span>${loadedScript.stats.playCount} plays</span>
                <span>${loadedScript.stats.totalReps} reps</span>
                <span>${loadedScript.stats.periodCount} periods</span>
              </div>`
            : ""
        }
        <div class="player-home-card__actions">
          <button type="button" class="btn btn-secondary player-home-action" data-action="showTab" data-arg="script">
            Open Practice Tab
          </button>
          <button type="button" class="btn btn-secondary player-home-action" data-action="showTab" data-arg="playbook">
            Open Playbook
          </button>
          ${
            loadedScript
              ? `<button type="button" class="btn btn-primary player-home-action" data-action="openScriptPresentation">
                  Resume Swipe View
                </button>`
              : featuredScript
                ? `<button type="button" class="btn btn-primary player-home-action" data-action="loadPublishedPlayerScript" data-arg="${featuredScript.id}">
                    Load Today's Script
                </button>`
                : ""
          }
        </div>
      </article>
    </div>
  `;
}

function renderGameWeekCommandCenter(gw, opponents) {
  const section = document.getElementById("dashCommandCenter");
  if (!section) return;
  const metrics = _dashBuildGameWeekMetrics(gw, opponents);
  const statusClass = _dashStatusClass(metrics.readiness);
  const checklist = _dashBuildPrepChecklist(metrics, gw);
  const openItems = checklist.filter((item) => !item.done).length;
  const checklistHtml = checklist.map(_dashBuildPrepChecklistItem).join("");
  const readinessGaps = checklist.filter((item) => !item.done);
  const readinessGapHtml = _dashBuildReadinessGapRows(readinessGaps);
  const readinessDoneCount = checklist.length - openItems;
  const readinessPct = Math.max(0, Math.min(100, metrics.readiness));
  const readinessGapLabel =
    openItems === 0
      ? "No gaps open"
      : `${openItems} gap${openItems === 1 ? "" : "s"} open`;
  const queue = _dashBuildActionQueue(metrics, gw);
  const queueHtml = queue.map(_dashBuildActionQueueItem).join("");
  const activeQueueCount = queue.filter((item) => item.level !== "clean").length;
  const weeklyFocus = _dashBuildWeeklyFocus(gw);
  const installPriorityHtml = _dashBuildInstallPriorityRows(
    weeklyFocus.install.priorities,
  );
  const opponentLabel = gw.opponentName || "No opponent selected";
  const weekLabel = gw.weekLabel || "Game week";
  const scheduleMeta = metrics.activeGame
    ? [metrics.activeGame.date, metrics.activeGame.location].filter(Boolean).join(" • ")
    : "No matching schedule entry";
  const primaryAction = gw.opponentName
    ? `<button class="btn btn-sm btn-primary" data-action="showTab" data-arg="gameplan">Open Game Plan</button>`
    : `<button class="btn btn-sm btn-primary" data-action="focusDashOpponentSelect">Pick Opponent</button>`;

  section.innerHTML = `
    <div class="dash-command-main">
      <div class="dash-command-title-group">
        <span class="dash-command-eyebrow">Game Week Command Center</span>
        <h3>${escapeHtml(opponentLabel)}</h3>
        <div class="dash-command-meta">
          <span>${escapeHtml(weekLabel)}</span>
          <span>${escapeHtml(scheduleMeta)}</span>
        </div>
      </div>
      <div class="dash-command-readiness ${statusClass}">
        <strong>${metrics.readiness}%</strong>
        <span>${escapeHtml(metrics.status)}</span>
      </div>
    </div>
    <div class="dash-readiness-panel" aria-label="Readiness score with actionable gaps">
      <div class="dash-readiness-score">
        <span class="dash-command-eyebrow">Readiness Score</span>
        <div class="dash-readiness-score-row">
          <strong>${metrics.readiness}%</strong>
          <span>${readinessDoneCount}/${checklist.length} checks</span>
        </div>
        <div class="dash-readiness-track" aria-hidden="true">
          <span style="--dash-readiness-pct:${readinessPct}%"></span>
        </div>
        <p>${openItems === 0 ? "All weekly readiness checks are complete." : "Close the next gaps to move this week toward game-ready."}</p>
      </div>
      <div class="dash-readiness-gaps">
        <div class="dash-readiness-gaps-head">
          <span class="dash-focus-title">Actionable Gaps</span>
          <span class="dash-readiness-gap-count">${escapeHtml(readinessGapLabel)}</span>
        </div>
        <div class="dash-readiness-gap-list">
          ${readinessGapHtml}
        </div>
      </div>
    </div>
    <div class="dash-command-metrics" aria-label="Game week status metrics">
      <button class="dash-command-metric ${_dashMetricStatus(metrics.scoutCount)}" type="button" data-action="showTab" data-arg="tendencies">
        <strong>${metrics.scoutCount}</strong>
        <span>Scout Plays</span>
      </button>
      <button class="dash-command-metric ${_dashMetricStatus(metrics.taggedPlanCount)}" type="button" data-action="showTab" data-arg="gameplan">
        <strong>${metrics.taggedPlanCount}</strong>
        <span>Tagged Calls</span>
      </button>
      <button class="dash-command-metric ${_dashMetricStatus(metrics.boardPlanCount)}" type="button" data-action="showTab" data-arg="gameplan">
        <strong>${metrics.boardPlanCount}</strong>
        <span>Board Calls</span>
      </button>
      <button class="dash-command-metric ${_dashMetricStatus(metrics.scriptCount)}" type="button" data-action="showTab" data-arg="script">
        <strong>${metrics.scriptCount}</strong>
        <span>Script Calls</span>
      </button>
      <button class="dash-command-metric ${_dashMetricStatus(metrics.wristbandCount)}" type="button" data-action="showTab" data-arg="wristband">
        <strong>${metrics.wristbandCount}</strong>
        <span>Wristband</span>
      </button>
      <button class="dash-command-metric ${_dashMetricStatus(metrics.callSheetCount)}" type="button" data-action="showTab" data-arg="callsheet">
        <strong>${metrics.callSheetCount}</strong>
        <span>Sheet Calls</span>
      </button>
      <button class="dash-command-metric ${metrics.notesReady ? "is-good" : "is-empty"}" type="button" data-action="focusMobileCoachNotes">
        <strong>${metrics.notesReady ? "Yes" : "No"}</strong>
        <span>Notes</span>
      </button>
    </div>
    <div class="dash-command-actions">
      ${primaryAction}
      <button class="btn btn-sm" data-action="showTab" data-arg="tendencies">Scouting</button>
      <button class="btn btn-sm" data-action="showTab" data-arg="callsheet">Call Sheet</button>
      <button class="btn btn-sm" data-action="printFullGamePlan">Print Packet</button>
    </div>
    <div class="dash-prep-checklist" aria-label="Game week prep checklist">
      <div class="dash-prep-header">
        <div>
          <span class="dash-command-eyebrow">Prep Checklist</span>
          <h4>${openItems === 0 ? "All core prep is covered" : `${openItems} prep gap${openItems === 1 ? "" : "s"} open`}</h4>
        </div>
        <span class="dash-prep-count">${checklist.length - openItems}/${checklist.length}</span>
      </div>
      <div class="dash-prep-grid">
        ${checklistHtml}
      </div>
    </div>
    <div class="dash-action-queue" aria-label="Unfinished work and stale saved artifacts">
      <div class="dash-action-header">
        <div>
          <span class="dash-command-eyebrow">Action Queue</span>
          <h4>${activeQueueCount === 0 ? "Saved work is current" : `${activeQueueCount} item${activeQueueCount === 1 ? "" : "s"} to review`}</h4>
        </div>
      </div>
      <div class="dash-action-list">
        ${queueHtml}
      </div>
    </div>
    <div class="dash-weekly-focus" aria-label="Weekly notes and install priorities">
      <div class="dash-focus-header">
        <div>
          <span class="dash-command-eyebrow">Weekly Focus</span>
          <h4>Notes and install priorities</h4>
        </div>
        <span class="dash-focus-badge">${escapeHtml(weeklyFocus.install.summary)}</span>
      </div>
      <div class="dash-focus-grid">
        <button class="dash-focus-notes ${weeklyFocus.notes ? "is-filled" : "is-empty"}" type="button" data-action="focusMobileCoachNotes">
          <span class="dash-focus-title">Weekly Notes</span>
          <span class="dash-focus-note-text">${escapeHtml(weeklyFocus.notesPreview)}</span>
          <span class="dash-focus-link">${weeklyFocus.notes ? "Edit notes" : "Add notes"}</span>
        </button>
        <div class="dash-focus-installs">
          <div class="dash-focus-installs-head">
            <span class="dash-focus-title">Install Priorities</span>
            <button class="btn btn-sm" data-action="showSmartInstallReport" type="button">Smart Report</button>
          </div>
          <div class="dash-focus-priority-list">
            ${installPriorityHtml}
          </div>
        </div>
      </div>
    </div>`;
}

function _dashBuildMobileCoachReminderAttrs(reminder) {
  if (!reminder?.action) return "";
  const action = escapeHtml(reminder.action);
  const arg = reminder.arg !== undefined ? ` data-arg="${escapeHtml(reminder.arg)}"` : "";
  return ` data-action="${action}"${arg}`;
}

function _dashBuildMobileCoachReminders(gw, metrics) {
  const reminders = [];
  if (!gw.opponentName) {
    reminders.push({
      label: "Select active opponent",
      detail: "Game week setup",
      action: "focusDashOpponentSelect",
      level: "warn",
    });
  } else if (metrics.scoutCount === 0) {
    reminders.push({
      label: "Chart opponent tendencies",
      detail: gw.opponentName,
      action: "showTab",
      arg: "tendencies",
      level: "warn",
    });
  }

  if (gw.opponentName && metrics.gamePlanCount === 0) {
    reminders.push({
      label: "Tag game-plan calls",
      detail: "No calls tied to opponent",
      action: "showTab",
      arg: "gameplan",
      level: "warn",
    });
  }

  if (metrics.scriptCount === 0) {
    reminders.push({
      label: "Build practice script",
      detail: "No calls loaded",
      action: "showTab",
      arg: "script",
      level: "info",
    });
  }

  if (metrics.callSheetCount === 0) {
    reminders.push({
      label: "Fill call sheet",
      detail: "No calls slotted",
      action: "showTab",
      arg: "callsheet",
      level: "info",
    });
  }

  if (!String(gw.notes || "").trim()) {
    reminders.push({
      label: "Add game-week note",
      detail: "Quick reminder",
      action: "focusMobileCoachNotes",
      level: "note",
    });
  }

  if (reminders.length === 0) {
    reminders.push({
      label: "Ready for mobile review",
      detail: "Notes and prep are in place",
      action: "focusMobileCoachNotes",
      level: "ok",
    });
  }
  return reminders;
}

function renderMobileCoachNotesCard(gw, opponents) {
  const card = document.getElementById("mobileCoachNotesCard");
  if (!card) return;

  const opponent = _dashFindGameWeekOpponent(gw, opponents);
  const scoutCount = opponent?.plays?.length || 0;
  const scriptCount = Array.isArray(script)
    ? script.filter((play) => play && !play.isSeparator).length
    : 0;
  const callSheetCount = _dashCountCallSheetPlays();
  const opponentGamePlanCount = gw.opponentName
    ? _dashGetGamePlanPlaysForOpponent(gw.opponentName).length
    : 0;
  const boardGamePlanCount = _dashGetBoardGamePlanCount();
  const gamePlanCount = gw.opponentName ? opponentGamePlanCount : boardGamePlanCount;
  const metrics = { scoutCount, scriptCount, callSheetCount, gamePlanCount };
  const reminders = _dashBuildMobileCoachReminders(gw, metrics);
  const statusText = gw.opponentName
    ? `${scoutCount} scout / ${gamePlanCount} plan`
    : "Setup needed";
  const title = gw.opponentName || "No opponent selected";
  const subtitle = gw.weekLabel || "Game week";
  const reminderHtml = reminders
    .map(
      (reminder) => `<button class="mobile-coach-notes-card__reminder is-${escapeHtml(
        reminder.level,
      )}" type="button"${_dashBuildMobileCoachReminderAttrs(reminder)}>
        <span class="mobile-coach-notes-card__reminder-label">${escapeHtml(reminder.label)}</span>
        <span class="mobile-coach-notes-card__reminder-detail">${escapeHtml(reminder.detail)}</span>
      </button>`,
    )
    .join("");

  card.innerHTML = `
    <div class="mobile-coach-notes-card__header">
      <div class="mobile-coach-notes-card__title-wrap">
        <span class="mobile-coach-notes-card__eyebrow">Mobile Notes</span>
        <h3 class="mobile-coach-notes-card__title">${escapeHtml(title)}</h3>
        <span class="mobile-coach-notes-card__subtitle">${escapeHtml(subtitle)}</span>
      </div>
      <span class="mobile-coach-notes-card__status">${escapeHtml(statusText)}</span>
    </div>
    <div class="mobile-coach-notes-card__metrics" aria-label="Mobile coach prep counts">
      <span><strong>${scoutCount}</strong> Scout</span>
      <span><strong>${gamePlanCount}</strong> Plan</span>
      <span><strong>${scriptCount}</strong> Script</span>
      <span><strong>${callSheetCount}</strong> Sheet</span>
    </div>
    <label class="mobile-coach-notes-card__label" for="mobileCoachNotesArea">Quick Notes</label>
    <textarea id="mobileCoachNotesArea" class="mobile-coach-notes-card__textarea"
      placeholder="Key matchup, openers, halftime adjustments..."
      data-oninput="onMobileCoachNotesChange" data-pass="value">${escapeHtml(gw.notes || "")}</textarea>
    <div class="mobile-coach-notes-card__reminders" aria-label="Opponent reminders">
      ${reminderHtml}
    </div>`;
}

function _dashSyncNotesTextareas(value, sourceId) {
  ["dashNotesArea", "mobileCoachNotesArea"].forEach((id) => {
    if (id === sourceId) return;
    const el = document.getElementById(id);
    if (el && el !== document.activeElement) el.value = value || "";
  });
}

/**
 * Render the Game Week Dashboard panel
 */
function renderDashboard() {
  try {
    if (isPlayerDashboardRole()) {
      renderPlayerDashboardHome();
      return;
    }

    const playerHome = document.getElementById("playerDashboardHome");
    if (playerHome) {
      playerHome.hidden = true;
      playerHome.innerHTML = "";
    }

    // Populate opponent dropdown
    const select = document.getElementById("dashOpponentSelect");
    const searchInput = document.getElementById("dashSearchInput");
    const weekInput = document.getElementById("dashWeekLabel");
    const badge = document.getElementById("dashActiveOpponentBadge");

    if (!select) return;

    const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
    const gw = getGameWeek();
    const activeOpponent = resolveGameWeekOpponent(opponents, gw);
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
      const sel = activeOpponent.index === idx ? "selected" : "";
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

    renderMobileCoachNotesCard(gw, opponents);
    renderGameWeekCommandCenter(gw, opponents);

    const cardsEl = document.getElementById("dashCards");
    if (cardsEl) {
      const playCount = typeof plays !== "undefined" ? plays.length : 0;
      const scriptCount = _dashGetScriptPlayCount();
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

      const oppPlays = activeOpponent.opponent?.plays?.length || 0;

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
        <button class="dash-link-btn dash-link-print" data-action="printFullGamePlan">🖨️ Print Game Plan Packet</button>
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
  const cat =
    Array.isArray(CALLSHEET_CATEGORIES)
      ? CALLSHEET_CATEGORIES.find((item) => item.id === categoryId)
      : null;
  if (cat?.playerSpecific && typeof buildPlayerCategoryAutoFillTargets === "function") {
    const targets = buildPlayerCategoryAutoFillTargets(gpPlays);
    return gpPlays.filter((_, index) => targets[index]?.has(categoryId));
  }
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
