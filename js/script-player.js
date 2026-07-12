// script-player.js — Saved script management and player-facing script loading
// Extracted from script-storage.js

let playerScriptImageStatusRefreshPending = false;
let playerScriptImageKeysLoaded = false;

const PLAYER_SCRIPT_RESP_KEYS = [
  "respQ",
  "respT",
  "respH",
  "respZ",
  "respX",
  "respY",
  "respLT",
  "respLG",
  "respC",
  "respRG",
  "respRT",
];

function isSavedScriptPlayerVisible(record) {
  return (
    record?.playerVisible === true ||
    record?.playerVisible === "true" ||
    record?.playerVisible === 1 ||
    record?.playerVisible === "1"
  );
}

function normalizeSavedScriptRecord(record, index = 0) {
  const normalized = record && typeof record === "object" ? record : {};
  return {
    id: normalized.id ?? Date.now() + index,
    name: String(normalized.name || `Saved Script ${index + 1}`),
    date: String(normalized.date || ""),
    period: String(normalized.period || ""),
    tempo: String(normalized.tempo || ""),
    playerVisible: isSavedScriptPlayerVisible(normalized),
    plays: Array.isArray(normalized.plays) ? normalized.plays : [],
    workspace:
      normalized.workspace && typeof normalized.workspace === "object"
        ? normalized.workspace
        : null,
    savedAt: normalized.savedAt || "",
    playerPublishedAt: normalized.playerPublishedAt || "",
    playerUnpublishedAt: normalized.playerUnpublishedAt || "",
  };
}

function getSavedScripts() {
  const stored = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  const rawScripts = Array.isArray(stored)
    ? stored
    : stored && typeof stored === "object"
      ? Object.values(stored)
      : [];
  const normalizedScripts = rawScripts.map((record, index) =>
    normalizeSavedScriptRecord(record, index),
  );
  const needsRepair =
    !Array.isArray(stored) ||
    rawScripts.some((record, index) => {
      const normalized = normalizedScripts[index];
      return (
        normalized.id !== record?.id ||
        normalized.name !== record?.name ||
        normalized.date !== (record?.date || "") ||
        normalized.period !== (record?.period || "") ||
        normalized.tempo !== (record?.tempo || "") ||
        normalized.playerVisible !== isSavedScriptPlayerVisible(record) ||
        normalized.plays !== record?.plays ||
        normalized.workspace !== record?.workspace ||
        normalized.savedAt !== (record?.savedAt || "") ||
        normalized.playerPublishedAt !== (record?.playerPublishedAt || "") ||
        normalized.playerUnpublishedAt !== (record?.playerUnpublishedAt || "")
      );
    });

  if (needsRepair) {
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, normalizedScripts);
  }

  return normalizedScripts;
}

function getPlayerScriptStudyStats(scriptPlays = []) {
  const playsForDay = Array.isArray(scriptPlays)
    ? scriptPlays.filter((item) => item && !item.isSeparator)
    : [];
  const stats = {
    playCount: playsForDay.length,
    diagramCount: 0,
    ruleCount: 0,
    noteCount: 0,
  };

  playsForDay.forEach((play) => {
    if (
      window.playImages &&
      typeof window.playImages.hasForPlay === "function" &&
      window.playImages.hasForPlay(play)
    ) {
      stats.diagramCount += 1;
    }
    if (PLAYER_SCRIPT_RESP_KEYS.some((key) => String(play[key] || "").trim())) {
      stats.ruleCount += 1;
    }
    if (String(play.playerNotes || play.respNotes || "").trim()) {
      stats.noteCount += 1;
    }
  });

  return stats;
}

function queuePlayerScriptImageStatusRefresh() {
  if (
    playerScriptImageKeysLoaded ||
    playerScriptImageStatusRefreshPending ||
    !window.playImages ||
    typeof window.playImages.loadKeys !== "function"
  ) {
    return;
  }
  playerScriptImageStatusRefreshPending = true;
  window.playImages
    .loadKeys()
    .then(() => {
      playerScriptImageKeysLoaded = true;
      playerScriptImageStatusRefreshPending = false;
      renderPlayerLoadedScriptBar();
    })
    .catch(() => {
      playerScriptImageStatusRefreshPending = false;
    });
}

function getSavedScriptStats(savedScript) {
  const plays = Array.isArray(savedScript?.plays) ? savedScript.plays : [];
  const playCount = plays.filter((play) => !play.isSeparator).length;
  const periodCount = plays.filter((play) => play.isSeparator).length;
  const totalReps = plays.reduce(
    (sum, play) => sum + (!play.isSeparator ? play.reps || 1 : 0),
    0,
  );
  const runCount = plays.filter(
    (play) => !play.isSeparator && play.type === "Run",
  ).length;
  const passCount = plays.filter(
    (play) => !play.isSeparator && play.type === "Pass",
  ).length;
  const periods = plays
    .filter((play) => play.isSeparator)
    .map((play) => play.label)
    .join(", ");
  const dateStr = savedScript.date
    ? new Date(savedScript.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
    : "No date";
  const savedTime = savedScript.savedAt
    ? new Date(savedScript.savedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : "";

  return {
    playCount,
    periodCount,
    totalReps,
    runCount,
    passCount,
    periods,
    dateStr,
    savedTime,
  };
}

function getPlayerPublishedScripts() {
  return getSavedScripts()
    .filter((savedScript) => savedScript.playerVisible)
    .sort((a, b) => {
      const aStamp = Math.max(
        Date.parse(`${a.date || ""}T00:00:00`) || 0,
        Date.parse(a.savedAt || "") || 0,
      );
      const bStamp = Math.max(
        Date.parse(`${b.date || ""}T00:00:00`) || 0,
        Date.parse(b.savedAt || "") || 0,
      );
      if (bStamp !== aStamp) return bStamp - aStamp;
      return String(a.name).localeCompare(String(b.name));
    });
}

function tracePlayerScriptAction(phase, payload = {}, level = "info") {
  const publishedScripts =
    typeof getPlayerPublishedScripts === "function"
      ? getPlayerPublishedScripts()
      : [];
  const data = {
    phaseAction: payload.action || "loadPublishedPlayerScript",
    role:
      typeof getCurrentAuthUser === "function"
        ? getCurrentAuthUser()?.role || ""
        : "",
    activeTab:
      typeof currentActiveTab !== "undefined"
        ? currentActiveTab
        : document.body?.dataset.activeTab || "",
    publishedCount: publishedScripts.length,
    currentScriptPlays: Array.isArray(script)
      ? script.filter((entry) => entry && !entry.isSeparator).length
      : 0,
    ...payload,
  };
  if (typeof traceAppAction === "function") {
    traceAppAction(`player script ${phase}`, data, {}, level);
    return;
  }
  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  logger.call(console, `[BC player script trace] ${phase}`, data);
}

function renderPlayerScriptLauncher() {
  const section = document.getElementById("playerScriptLauncherSection");
  const list = document.getElementById("playerScriptLauncherList");
  if (!section || !list) return;

  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  const isPlayer = currentUser?.role === "player";
  if (!isPlayer) {
    section.hidden = true;
    list.innerHTML = "";
    return;
  }

  const publishedScripts = getPlayerPublishedScripts();
  const currentName = document.getElementById("scriptName")?.value || "";
  const currentDate = document.getElementById("scriptDate")?.value || "";
  const todayValue = new Date().toISOString().slice(0, 10);
  const hasLoadedPlayerScript = Array.isArray(script)
    ? script.some((entry) => entry && !entry.isSeparator)
    : false;
  const headerTitle = section.querySelector(".player-script-launcher-header h4");
  if (headerTitle) {
    headerTitle.textContent = hasLoadedPlayerScript
      ? "Other Practice Scripts"
      : "Player Practice Scripts";
  }

  if (publishedScripts.length === 0) {
    section.hidden = false;
    list.innerHTML = `
      <div class="player-script-empty">
        No practice script has been published for player logins yet.
      </div>
    `;
    return;
  }

  const visibleScripts = publishedScripts
    .map((savedScript) => {
      const stats = getSavedScriptStats(savedScript);
      const isCurrent =
        currentName === savedScript.name &&
        currentDate === (savedScript.date || "");
      return { savedScript, stats, isCurrent };
    })
    .filter((entry) => !hasLoadedPlayerScript || !entry.isCurrent);

  if (hasLoadedPlayerScript && visibleScripts.length === 0) {
    section.hidden = true;
    list.innerHTML = "";
    return;
  }

  section.hidden = false;

  list.innerHTML = visibleScripts
    .map(({ savedScript, stats, isCurrent }) => {
      const eyebrow = savedScript.date === todayValue ? "Today" : "Published Script";
      const scriptId = escapeHtml(String(savedScript.id));
      const quizProgress = typeof getPlayerQuizScriptProgress === "function"
        ? getPlayerQuizScriptProgress(savedScript.id, savedScript.name, stats.playCount)
        : null;
      const quizProgressText = quizProgress
        ? `${quizProgress.icon ? `${quizProgress.icon} ` : ""}${quizProgress.points ? `${quizProgress.label} · ${quizProgress.points} pts` : quizProgress.label}`
        : "";

      return `
        <article class="player-script-card${isCurrent ? " is-current" : ""}">
          <div class="player-script-card__body">
            <div class="player-script-card__eyebrow">${escapeHtml(eyebrow)}</div>
            <div class="player-script-card__title-row">
              <div class="player-script-card__title">${escapeHtml(savedScript.name)}</div>
              ${isCurrent ? '<span class="player-script-card__badge">Loaded</span>' : ""}
            </div>
            <div class="player-script-card__meta">
              <span>${escapeHtml(stats.dateStr)}</span>
              <span>${stats.playCount} plays</span>
              <span>${stats.totalReps} reps</span>
              ${stats.periodCount > 0 ? `<span>${stats.periodCount} periods</span>` : ""}
            </div>
            ${quizProgress ? `
              <div class="player-script-card__quiz-progress">
                <span class="player-quiz-progress-badge${quizProgress.icon ? " has-icon" : ""}">${escapeHtml(quizProgressText)}</span>
                ${quizProgress.latest ? `<span>${quizProgress.answered}/${quizProgress.total || stats.playCount} questions</span>` : `<span>Start here for first score</span>`}
              </div>
            ` : ""}
          </div>
          <div class="player-script-card__actions">
            ${isCurrent
          ? '<span class="player-script-card__loaded-label">Script Loaded</span>'
          : `<button type="button" class="btn btn-sm" data-action="loadPublishedPlayerScript"
                  data-arg="${scriptId}" title="Load this published script into the script tab">
                  Open Script
                </button>`}
            <button type="button" class="btn btn-sm" data-action="startPlayerScriptQuiz"
              data-arg="${scriptId}" title="Quiz yourself on this practice">
              Quiz
            </button>
            <button type="button" class="btn btn-sm" data-action="openPlayerScriptChat"
              data-arg="${scriptId}" title="Ask questions and chat about this practice">
              💬 Chat
            </button>
            <button type="button" class="btn btn-primary btn-sm" data-action="openPlayerCurrentScriptPresentation"
              data-arg="${scriptId}" title="Open this published script in swipe view">
              Swipe View
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function openPlayerScriptChat(id = "") {
  const opened = openPlayerCurrentScriptPresentation(String(id || ""));
  if (opened) {
    setTimeout(() => {
      if (typeof openPresentationDiscussion === "function") {
        openPresentationDiscussion();
      }
    }, 350);
  }
}

function renderPlayerLoadedScriptBar() {
  const section = document.getElementById("playerScriptNowBar");
  const title = document.getElementById("playerScriptNowTitle");
  const meta = document.getElementById("playerScriptNowMeta");
  const hint = document.getElementById("playerScriptNowHint");
  if (!section || !title || !meta || !hint) return;

  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  const isPlayer = currentUser?.role === "player";
  const playsForDay = Array.isArray(script) ? script.filter((item) => !item?.isSeparator) : [];
  if (!isPlayer || playsForDay.length === 0) {
    section.hidden = true;
    title.textContent = "";
    meta.textContent = "";
    hint.textContent = "";
    return;
  }

  const stats = getSavedScriptStats({
    plays: script,
    date: document.getElementById("scriptDate")?.value || "",
    savedAt: "",
  });
  section.hidden = false;
  title.textContent = document.getElementById("scriptName")?.value || "Practice Script";
  meta.innerHTML = [
    stats.dateStr,
    `${stats.playCount} plays`,
    `${stats.totalReps} reps`,
    stats.periodCount > 0 ? `${stats.periodCount} periods` : "",
  ]
    .filter(Boolean)
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join("");
  hint.innerHTML = `
    <span>Start in Swipe View, lock your position, then quiz yourself or ask a question.</span>
  `;
  queuePlayerScriptImageStatusRefresh();
}

function startPlayerScriptQuiz(id = "", options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const requestedId = id !== undefined && id !== null ? String(id) : "";
  let quizSourceId = requestedId;
  let quizTitle = opts.title || "Practice Script Quiz";
  const loadedPlayCount = Array.isArray(script)
    ? script.filter((entry) => entry && !entry.isSeparator).length
    : 0;
  if (requestedId) {
    if (
      typeof isPlayerQuizSourceAvailable === "function" &&
      !isPlayerQuizSourceAvailable("script", requestedId)
    ) {
      showToast("Coach has not opened that script quiz yet.", { type: "warning" });
      return false;
    }
    const requestedScript = getPlayerPublishedScripts().find((savedScript) => String(savedScript.id) === requestedId);
    if (requestedScript?.name && !opts.title) quizTitle = requestedScript.name;
    const loaded = loadPublishedPlayerScript(requestedId, {
      skipToast: true,
      toastMessage: "Practice loaded for quiz.",
    });
    if (!loaded) return false;
  } else if (!loadedPlayCount) {
    const fallbackScript = getDefaultPlayerPublishedScript("");
    if (!fallbackScript) {
      showToast("Open a published practice before starting Quiz.", {
        type: "warning",
      });
      if (typeof showTab === "function") showTab("script");
      return false;
    }
    quizSourceId = String(fallbackScript.id || "");
    quizTitle = fallbackScript.name || quizTitle;
    const loaded = loadPublishedPlayerScript(fallbackScript.id, {
      skipToast: true,
      toastMessage: "Practice loaded for quiz.",
    });
    if (!loaded) return false;
  } else if (typeof showTab === "function") {
    showTab("script");
  }

  if (typeof startScriptQuiz === "function") {
    if (!quizTitle || quizTitle === "Practice Script Quiz") {
      quizTitle = document.getElementById("scriptName")?.value || quizTitle;
    }
    startScriptQuiz({
      items: Array.isArray(opts.items) ? opts.items : undefined,
      sourceType: "script",
      sourceId: quizSourceId,
      title: quizTitle || "Practice Script Quiz",
      positionKey: opts.positionKey,
      positionMode: opts.positionMode,
      mode: opts.mode,
    });
    return true;
  }
  showToast("Quiz is not available yet.", { type: "warning" });
  return false;
}

function loadSavedScriptsList() {
  const savedScripts = getSavedScripts();
  const container = document.getElementById("savedScriptsList");
  const section = document.getElementById("savedScriptsSection");
  if (!container || !section) return;

  if (savedScripts.length === 0) {
    section.classList.add("hidden");
    loadFullDayScriptList();
    renderPlayerScriptLauncher();
    renderPlayerLoadedScriptBar();
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = savedScripts
    .map((savedScript) => {
      const stats = getSavedScriptStats(savedScript);
      const restoresWorkspace = Boolean(savedScript.workspace);
      const isCurrent =
        (document.getElementById("scriptName")?.value || "") === savedScript.name &&
        (document.getElementById("scriptDate")?.value || "") === (savedScript.date || "");

      return `
            <div class="saved-script-card">
                <div class="saved-card-main">
	                  <div class="saved-card-title-row">
	                    <div class="saved-card-title">${escapeHtml(savedScript.name)}</div>
	                    ${isCurrent ? '<span class="saved-card-badge">Current</span>' : ""}
                      ${savedScript.playerVisible ? '<span class="saved-card-badge saved-card-badge-player">Player Login</span>' : ""}
	                  </div>
	                  <div class="saved-card-meta">
	                    <span>📅 ${stats.dateStr}</span>
	                    <span>📝 ${stats.playCount} plays</span>
	                    <span>🔁 ${stats.totalReps} reps</span>
	                    ${stats.periodCount > 0 ? `<span>📂 ${stats.periodCount} periods</span>` : ""}
	                  </div>
	                  <div class="saved-card-meta saved-card-meta-secondary">
	                    <span>🏃 ${stats.runCount} run</span>
	                    <span>🎯 ${stats.passCount} pass</span>
	                    ${restoresWorkspace ? '<span>🧭 Restores workspace</span>' : ""}
	                    ${stats.savedTime ? `<span>💾 ${stats.savedTime}</span>` : ""}
	                  </div>
	                  ${stats.periods ? `<div class="saved-card-periods">${escapeHtml(stats.periods)}</div>` : ""}
	                </div>
	                <div class="saved-card-actions">
                      <label class="saved-player-toggle" data-auth-edit-only="true"
                        title="Show this script on player logins">
                        <input type="checkbox" data-onchange="togglePlayerScriptAccess"
                          data-arg="${savedScript.id}" data-pass="event" ${savedScript.playerVisible ? "checked" : ""} />
                        <span>Player login</span>
                      </label>
	                    <button class="saved-load-btn" data-action="loadScript" data-sid="${savedScript.id}" title="Load this script">Load</button>
	                    <button class="saved-rename-btn" data-action="renameSavedScript" data-sid="${savedScript.id}" title="Rename script">✏️</button>
	                    <button class="saved-overwrite-btn" data-action="overwriteSavedScript" data-sid="${savedScript.id}" title="Overwrite with current script">Update</button>
	                    <button class="saved-del-btn" data-action="deleteSavedScript" data-sid="${savedScript.id}" title="Delete script">✕</button>
	                </div>
            </div>
        `;
    })
    .join("");

  loadFullDayScriptList();
  renderPlayerScriptLauncher();
  renderPlayerLoadedScriptBar();
}

function openMobileScriptLoader() {
  if (typeof setMobileScriptEditMode === "function") {
    setMobileScriptEditMode(true, { focusCurrent: false });
  }
  if (typeof openScriptToolsDrawer === "function") {
    openScriptToolsDrawer();
  }
  loadSavedScriptsList();

  requestAnimationFrame(() => {
    const savedSection = document.getElementById("savedScriptsSection");
    const drawerBody = document.querySelector("#scriptToolsDrawer .script-tools-drawer-body");
    if (!savedSection || savedSection.classList.contains("hidden")) {
      showToast("No saved scripts yet.", { duration: 2500, type: "info" });
      return;
    }
    savedSection.scrollIntoView({ block: "start", behavior: "smooth" });
    if (drawerBody) drawerBody.scrollTop = savedSection.offsetTop;
    savedSection.classList.add("saved-scripts--spotlight");
    setTimeout(() => savedSection.classList.remove("saved-scripts--spotlight"), 1600);
  });
}

function loadSavedScriptRecord(scriptData, opts = {}) {
  if (!scriptData) return false;
  try {
    document.getElementById("scriptName").value = scriptData.name;
    document.getElementById("scriptDate").value = scriptData.date;
    script = safeDeepClone(scriptData.plays);

    const hasPlays = script.some((play) => !play.isSeparator);
    const hasSeparator = script.some((play) => play.isSeparator);
    if (hasPlays && !hasSeparator) {
      script.unshift({
        isSeparator: true,
        label: scriptData.period || scriptData.name || "Period 1",
        minutes: 0,
        color: UI_COLORS.periodDefault,
        id: Date.now() + Math.random(),
      });
    }

    restoreSavedScriptWorkspace(scriptData.workspace);
    if (typeof getCurrentAuthUser === "function" && getCurrentAuthUser()?.role === "player") {
      collapsedPeriods = new Set();
    }
    endScriptEditHistoryWindow();
    historyManager.clear("script");
    renderScript();
    renderAvailablePlays();
    renderPlayerScriptLauncher();
    renderPlayerLoadedScriptBar();
    markScriptClean();
    discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
    if (!opts.skipToast) {
      showToast(opts.toastMessage || `Loaded "${scriptData.name}"`);
    }
    return true;
  } catch (err) {
    console.error("loadSavedScriptRecord error:", err);
    showToast(
      opts.errorMessage || "❌ Error loading script.",
      { duration: 4000, type: "error" },
    );
    return false;
  }
}

function loadScript(id) {
  try {
    const savedScripts = getSavedScripts();
    const scriptData = savedScripts.find((savedScript) => savedScript.id === id);
    if (!scriptData) return;
    loadSavedScriptRecord(scriptData);
  } catch (err) {
    console.error("loadScript error:", err);
    showToast("❌ Error loading script.", { duration: 4000, type: "error" });
  }
}

function getPlayerPublishedScriptById(id) {
  const normalizedId = String(id);
  const publishedScripts = getPlayerPublishedScripts();
  const scriptData = publishedScripts.find(
    (savedScript) => String(savedScript.id) === normalizedId,
  ) || null;
  if (!scriptData) {
    tracePlayerScriptAction(
      "lookup miss",
      {
        id: normalizedId,
        availableIds: publishedScripts.map((savedScript) =>
          String(savedScript.id),
        ),
      },
      "warn",
    );
  }
  return scriptData;
}

function getDefaultPlayerPublishedScript(id = "") {
  if (id !== "" && id !== undefined && id !== null) {
    return getPlayerPublishedScriptById(id);
  }
  const publishedScripts = getPlayerPublishedScripts();
  if (publishedScripts.length === 0) return null;
  const todayValue = new Date().toISOString().slice(0, 10);
  const currentName = document.getElementById("scriptName")?.value || "";
  const currentDate = document.getElementById("scriptDate")?.value || "";
  return publishedScripts.find(
    (savedScript) =>
      savedScript.date === todayValue ||
      (savedScript.name === currentName &&
        (savedScript.date || "") === currentDate),
  ) || publishedScripts[0];
}

function loadPublishedPlayerScript(id, opts = {}) {
  tracePlayerScriptAction("load start", { id: String(id) });
  const scriptData = getPlayerPublishedScriptById(id);
  if (!scriptData) {
    tracePlayerScriptAction(
      "load failed",
      { id: String(id), reason: "not-published-or-missing" },
      "warn",
    );
    if (!opts.skipToast) {
      showToast("⚠️ That script is not published for player logins.", {
        type: "warning",
      });
    }
    return null;
  }

  if (typeof showTab === "function") {
    showTab("script");
    tracePlayerScriptAction("show tab", {
      id: String(scriptData.id),
      name: scriptData.name,
    });
  } else {
    tracePlayerScriptAction(
      "show tab skipped",
      { id: String(scriptData.id), reason: "showTab-missing" },
      "warn",
    );
  }
  const loaded = loadSavedScriptRecord(scriptData, {
    skipToast: opts.skipToast,
    toastMessage: opts.toastMessage || `Loaded "${scriptData.name}"`,
    errorMessage: "❌ Error loading published player script.",
  });
  tracePlayerScriptAction(loaded ? "load complete" : "load failed", {
    id: String(scriptData.id),
    name: scriptData.name,
    loaded,
    loadedPlays: Array.isArray(script)
      ? script.filter((entry) => entry && !entry.isSeparator).length
      : 0,
    reason: loaded ? "" : "loadSavedScriptRecord-returned-false",
  }, loaded ? "info" : "warn");
  return loaded ? scriptData : null;
}

function presentPublishedPlayerScript(id) {
  tracePlayerScriptAction("present start", {
    action: "presentPublishedPlayerScript",
    id: String(id),
  });
  const scriptData = loadPublishedPlayerScript(id, { skipToast: true });
  if (!scriptData) {
    tracePlayerScriptAction(
      "present failed",
      {
        action: "presentPublishedPlayerScript",
        id: String(id),
        reason: "script-load-failed",
      },
      "warn",
    );
    return false;
  }
  if (typeof setPlayPresentationMode === "function") {
    setPlayPresentationMode("player");
  }
  const opened =
    typeof openScriptPresentation === "function"
      ? openScriptPresentation()
      : false;
  tracePlayerScriptAction(opened ? "present opened" : "present failed", {
    action: "presentPublishedPlayerScript",
    id: String(scriptData.id),
    name: scriptData.name,
    opened,
    reason: opened ? "" : "openScriptPresentation-returned-false",
  }, opened ? "info" : "warn");
  if (!opened) {
    showToast("Script loaded, but no plays were available to present.", {
      type: "warning",
    });
    return false;
  }
  showToast(`Opened "${scriptData.name}" in swipe view`);
  return true;
}

function openPlayerCurrentScriptPresentation(id = "") {
  const loadedPlayCount = Array.isArray(script)
    ? script.filter((entry) => entry && !entry.isSeparator).length
    : 0;
  tracePlayerScriptAction("current presentation start", {
    action: "openPlayerCurrentScriptPresentation",
    id: id !== undefined && id !== null ? String(id) : "",
    loadedPlayCount,
  });

  if (loadedPlayCount > 0) {
    if (typeof setPlayPresentationMode === "function") {
      setPlayPresentationMode("player");
    }
    const opened =
      typeof openScriptPresentation === "function"
        ? openScriptPresentation()
        : false;
    tracePlayerScriptAction(
      opened ? "current presentation opened" : "current presentation failed",
      {
        action: "openPlayerCurrentScriptPresentation",
        loadedPlayCount,
        opened,
        reason: opened ? "" : "loaded-script-open-failed",
      },
      opened ? "info" : "warn",
    );
    if (opened) return true;
  }

  const fallbackScript = getDefaultPlayerPublishedScript(id);
  if (!fallbackScript) {
    tracePlayerScriptAction(
      "current presentation failed",
      {
        action: "openPlayerCurrentScriptPresentation",
        id: id !== undefined && id !== null ? String(id) : "",
        loadedPlayCount,
        reason: "no-loaded-or-published-script",
      },
      "warn",
    );
    showToast("Open a published practice before using Swipe View.", {
      type: "warning",
    });
    if (typeof showTab === "function") showTab("script");
    return false;
  }

  tracePlayerScriptAction("current presentation fallback", {
    action: "openPlayerCurrentScriptPresentation",
    id: String(fallbackScript.id),
    name: fallbackScript.name,
    reason: loadedPlayCount > 0 ? "loaded-open-failed" : "no-loaded-script",
  });
  return presentPublishedPlayerScript(fallbackScript.id);
}

function togglePlayerScriptAccess(id, event) {
  const savedScripts = getSavedScripts();
  const savedScript = savedScripts.find(
    (candidate) => String(candidate.id) === String(id),
  );
  if (!savedScript) return;

  savedScript.playerVisible = Boolean(event?.target?.checked);
  if (savedScript.playerVisible) {
    savedScript.playerPublishedAt = new Date().toISOString();
  } else {
    savedScript.playerUnpublishedAt = new Date().toISOString();
  }
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  loadSavedScriptsList();
  showToast(
    savedScript.playerVisible
      ? `Players can now load "${savedScript.name}".`
      : `Removed "${savedScript.name}" from player logins.`,
  );
}
