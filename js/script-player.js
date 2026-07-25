// script-player.js — Saved script management and player-facing script loading
// Extracted from script-storage.js

let playerScriptImageStatusRefreshPending = false;
let playerScriptImageKeysLoaded = false;

function _isScriptStudyPortalUser() {
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return currentUser?.role === "player" ||
    (currentUser?.role === "coach" && currentUser?.managedCoach === true);
}

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

function isSavedScriptDeleted(record) {
  return Boolean(record?.deletedAt);
}

// A practice is identified by its coach-facing title and date. The numeric
// record id remains its stable storage id, but this key lets us repair the
// historic "Save as Copy" behavior that created two indistinguishable
// practices for the same day.
function getSavedScriptDocumentKey(record) {
  const name = String(record?.name || "").trim().toLocaleLowerCase();
  const date = String(record?.date || "").trim();
  return name ? `${name}\u001f${date}` : "";
}

function getSavedScriptRecordTime(record) {
  return Math.max(
    Date.parse(record?.updatedAt || "") || 0,
    Date.parse(record?.playerPublishedAt || "") || 0,
    Date.parse(record?.savedAt || "") || 0,
  );
}

function savedScriptDocumentSnapshot(record, reason) {
  const copy = typeof safeDeepClone === "function"
    ? safeDeepClone(record)
    : JSON.parse(JSON.stringify(record || {}));
  if (copy && typeof copy === "object") copy.versions = [];
  return {
    versionId: `${record?.id || "script"}-${Date.now()}-${reason}`,
    savedAt: record?.updatedAt || record?.savedAt || new Date().toISOString(),
    reason,
    record: copy,
  };
}

// Old builds could create same-name/same-date records through "Save as Copy".
// Keep the newest record as the living practice, preserve the older record in
// its local history, and carry forward its player availability. This is a
// one-time, recoverable consolidation: the older record is moved to Trash,
// never erased.
function reconcileDuplicateSavedScriptDocuments(records) {
  const active = Array.isArray(records) ? records.filter((record) => !isSavedScriptDeleted(record)) : [];
  const byDocument = new Map();
  active.forEach((record) => {
    const key = getSavedScriptDocumentKey(record);
    if (!key) return;
    const group = byDocument.get(key) || [];
    group.push(record);
    byDocument.set(key, group);
  });

  let changed = false;
  let latestPublished = null;
  byDocument.forEach((group) => {
    if (group.length < 2) return;
    const ordered = [...group].sort((left, right) => {
      const delta = getSavedScriptRecordTime(right) - getSavedScriptRecordTime(left);
      return delta || String(right?.id || "").localeCompare(String(left?.id || ""));
    });
    const primary = ordered[0];
    const wasPublished = ordered.some((record) => isSavedScriptPlayerVisible(record));
    const timestamp = new Date().toISOString();

    if (wasPublished && !isSavedScriptPlayerVisible(primary)) {
      primary.playerVisible = true;
      primary.playerPublishedAt = timestamp;
      primary.updatedAt = timestamp;
      latestPublished = primary;
      changed = true;
    }

    ordered.slice(1).forEach((duplicate) => {
      const snapshot = savedScriptDocumentSnapshot(duplicate, "merged duplicate copy");
      const priorVersions = Array.isArray(primary.versions) ? primary.versions : [];
      primary.versions = [snapshot, ...priorVersions]
        .filter((entry, index, list) => entry?.versionId && list.findIndex((candidate) => candidate?.versionId === entry.versionId) === index)
        .slice(0, 20);
      duplicate.playerVisible = false;
      duplicate.deletedAt = timestamp;
      duplicate.deletedBy = "document-consolidation";
      duplicate.updatedAt = timestamp;
      changed = true;
    });
  });

  return { changed, latestPublished };
}

function getActiveSavedScripts() {
  return getSavedScripts().filter((record) => !isSavedScriptDeleted(record));
}

function getDeletedSavedScripts() {
  return getSavedScripts().filter((record) => isSavedScriptDeleted(record));
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
    updatedAt: normalized.updatedAt || normalized.savedAt || "",
    deletedAt: normalized.deletedAt || "",
    deletedBy: normalized.deletedBy || "",
    versions: Array.isArray(normalized.versions) ? normalized.versions : [],
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
  const reconciliation = reconcileDuplicateSavedScriptDocuments(normalizedScripts);
  const needsRepair =
    reconciliation.changed ||
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
        normalized.updatedAt !== (record?.updatedAt || record?.savedAt || "") ||
        normalized.deletedAt !== (record?.deletedAt || "") ||
        normalized.deletedBy !== (record?.deletedBy || "") ||
        normalized.versions !== record?.versions ||
        normalized.playerPublishedAt !== (record?.playerPublishedAt || "") ||
        normalized.playerUnpublishedAt !== (record?.playerUnpublishedAt || "")
      );
    });

  if (needsRepair) {
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, normalizedScripts);
  }

  // The repaired document should reach players like any other meaningful
  // script update. Delay this until the current stack has finished reading
  // storage so this normalizer never re-enters itself synchronously.
  if (reconciliation.latestPublished && typeof recordPlayerPublishStatus === "function") {
    const published = reconciliation.latestPublished;
    setTimeout(() => {
      recordPlayerPublishStatus("scripts", {
        updatedAt: published.playerPublishedAt || published.updatedAt || new Date().toISOString(),
        label: published.name || "Practice script",
        id: published.id || "",
        visibility: "published",
      }).catch(() => {});
    }, 0);
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

function _playerPublishStatusStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_PUBLISH_STATUS
    ? STORAGE_KEYS.PLAYER_PUBLISH_STATUS
    : "playerPublishStatus";
}

function _playerPublishTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function _formatCoachPublishTime(value) {
  const ts = _playerPublishTimestamp(value);
  if (!ts) return "Not tracked yet";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function _formatCoachPublishRelative(value) {
  const ts = _playerPublishTimestamp(value);
  if (!ts) return "";
  const delta = Math.max(0, Date.now() - ts);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getPlayerPublishStatus() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return {};
  const raw = storageManager.get(_playerPublishStatusStorageKey(), {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function recordPlayerPublishStatus(kind, details = {}, opts = {}) {
  if (!kind || typeof storageManager === "undefined" || typeof storageManager.set !== "function") return false;
  const updatedAt = details.updatedAt || new Date().toISOString();
  const publishJobKey = typeof window.queueWorkspaceSyncJob === "function"
    ? window.queueWorkspaceSyncJob("player", kind, {
      queuedLabel: "Player publish update queued",
      runningLabel: "Updating player publish...",
      doneLabel: "Player publish updated",
      errorLabel: "Player publish needs attention",
    })
    : "";
  if (publishJobKey && typeof window.startWorkspaceSyncJob === "function") {
    window.startWorkspaceSyncJob(publishJobKey, { label: "Updating player publish..." });
  }
  const status = getPlayerPublishStatus();
  const previous = status[kind] && typeof status[kind] === "object" ? status[kind] : {};
  status[kind] = {
    ...previous,
    ...details,
    updatedAt,
  };
  storageManager.set(_playerPublishStatusStorageKey(), status);
  // The status write above is part of the canonical workspace. Media, quiz,
  // and script handoffs should reach player devices promptly rather than wait
  // for the ordinary edit autosave batch.
  let publishResult = true;
  if (typeof window.requestImmediateTeamPublish === "function") {
    try {
      publishResult = await window.requestImmediateTeamPublish(kind, {
        awaitCompletion: opts.awaitCompletion === true,
      });
    } catch (_err) {
      publishResult = false;
    }
  }
  // A player receipt cannot remain "running" if Cloudflare did not accept or
  // finish the canonical workspace commit. Leaving it green forever makes the
  // coach believe a phone should already have the update when it cannot.
  if (publishResult === false && publishJobKey && typeof window.failWorkspaceSyncJob === "function") {
    const error = new Error("Cloudflare did not confirm the player update. It is saved locally and needs a retry.");
    window.failWorkspaceSyncJob(publishJobKey, error, {
      label: "Player update needs attention",
      retry: () => recordPlayerPublishStatus(kind, details, opts),
    });
  }
  if (typeof window.recordPublishActivity === "function") {
    window.recordPublishActivity({
      id: `player-${kind}-${updatedAt}`,
      versionId: `player-${kind}`,
      timestamp: updatedAt,
      result: publishResult === false ? "failed" : "success",
      domains: [kind],
      summary: publishResult === false
        ? `${details.label || `Player ${kind} update`} needs a Cloudflare retry`
        : (details.label || `Player ${kind} updated`),
      size: 0,
    });
  }
  if (typeof renderCoachPublishStatus === "function") renderCoachPublishStatus();
  // A player alert must describe a release that already committed. A queued
  // background publish can legitimately take a moment, and announcing it
  // first creates a notification whose Practice link cannot resolve yet.
  const releaseConfirmed = publishResult !== false &&
    (opts.awaitCompletion === true || typeof window.requestImmediateTeamPublish !== "function");
  if (releaseConfirmed && typeof notifyPlayersOfTeamUpdate === "function") {
    notifyPlayersOfTeamUpdate(kind, details).catch(() => { });
  }
  return publishResult !== false;
}

function _getLatestPlayerScriptPublish(savedScripts = getSavedScripts()) {
  const visible = savedScripts.filter((savedScript) => savedScript.playerVisible);
  const latest = visible
    .map((savedScript) => ({
      savedScript,
      updatedAt: savedScript.playerPublishedAt || savedScript.savedAt || "",
    }))
    .filter((entry) => _playerPublishTimestamp(entry.updatedAt))
    .sort((a, b) => _playerPublishTimestamp(b.updatedAt) - _playerPublishTimestamp(a.updatedAt))[0];
  return {
    count: visible.length,
    updatedAt: latest?.updatedAt || "",
    label: latest?.savedScript?.name || "",
  };
}

function _getLatestQuizSourcePublish() {
  let settings = {};
  if (typeof _getPlayerQuizSourceSettings === "function") {
    settings = _getPlayerQuizSourceSettings();
  } else if (typeof storageManager !== "undefined" && typeof storageManager.get === "function") {
    const key = typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS
      ? STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS
      : "playerQuizSourceSettings";
    settings = storageManager.get(key, {});
  }
  const latest = Object.entries(settings && typeof settings === "object" ? settings : {})
    .map(([key, entry]) => ({
      key,
      state: entry?.state || "",
      updatedAt: entry?.updatedAt || "",
    }))
    .filter((entry) => _playerPublishTimestamp(entry.updatedAt))
    .sort((a, b) => _playerPublishTimestamp(b.updatedAt) - _playerPublishTimestamp(a.updatedAt))[0];
  return {
    count: Object.keys(settings && typeof settings === "object" ? settings : {}).length,
    updatedAt: latest?.updatedAt || "",
    label: latest ? `${latest.key.replace(":", " ")} (${latest.state || "set"})` : "",
  };
}

function _coachPublishStatusItem({ kind, title, updatedAt, label, detail, tone }) {
  const hasTime = Boolean(_playerPublishTimestamp(updatedAt));
  const rel = _formatCoachPublishRelative(updatedAt);
  return `<div class="coach-publish-status-item coach-publish-status-item--${escapeAttr(tone || (hasTime ? "ready" : "empty"))}">
    <span class="coach-publish-status-item__kind">${escapeHtml(kind)}</span>
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(hasTime ? _formatCoachPublishTime(updatedAt) : "Not tracked yet")}</span>
    <small>${escapeHtml(label || detail || (rel ? `Changed ${rel}` : "No player-facing update recorded."))}</small>
  </div>`;
}

function renderCoachPublishStatus() {
  const panel = document.getElementById("coachPublishStatusPanel");
  if (!panel) return;
  if (typeof canEditUser === "function" && !canEditUser()) {
    panel.innerHTML = "";
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const savedScripts = getSavedScripts();
  const scriptStatus = _getLatestPlayerScriptPublish(savedScripts);
  const mediaStatus = getPlayerPublishStatus();
  const diagramStatus = mediaStatus.diagrams || {};
  const clipStatus = mediaStatus.clips || {};
  const quizStatus = _getLatestQuizSourcePublish();
  const visibleLabel = scriptStatus.count === 1 ? "1 script visible to players" : `${scriptStatus.count} scripts visible to players`;
  const quizLabel = quizStatus.count === 1 ? "1 quiz source configured" : `${quizStatus.count} quiz sources configured`;
  panel.innerHTML = `
    <section class="coach-publish-status" aria-label="Player publish status">
      <div class="coach-publish-status__head">
        <div>
          <span>Player publish status</span>
          <strong>What players can receive</strong>
        </div>
        <small>Use this to separate old-device cache reports from content that has not been published yet.</small>
      </div>
      <div class="coach-publish-status__grid">
        ${_coachPublishStatusItem({
          kind: "Scripts",
          title: scriptStatus.updatedAt ? "Last script publish" : "No player script publish",
          updatedAt: scriptStatus.updatedAt,
          label: scriptStatus.label ? `${scriptStatus.label} - ${visibleLabel}` : visibleLabel,
        })}
        ${_coachPublishStatusItem({
          kind: "Diagrams",
          title: diagramStatus.updatedAt ? "Last diagram update" : "No diagram update tracked",
          updatedAt: diagramStatus.updatedAt,
          label: diagramStatus.label || (diagramStatus.count ? `${diagramStatus.count} diagrams published` : "Tracked after next upload."),
        })}
        ${_coachPublishStatusItem({
          kind: "Clips",
          title: clipStatus.updatedAt ? "Last clip update" : "No clip update tracked",
          updatedAt: clipStatus.updatedAt,
          label: clipStatus.label || "Tracked after next clip upload or delete.",
        })}
        ${_coachPublishStatusItem({
          kind: "Quizzes",
          title: quizStatus.updatedAt ? "Last quiz source change" : "No quiz source changes",
          updatedAt: quizStatus.updatedAt,
          label: quizStatus.label || quizLabel,
        })}
      </div>
    </section>
  `;
}

function renderSavedScriptPublishMeta(savedScript) {
  const publishedAt = savedScript.playerPublishedAt || "";
  const unpublishedAt = savedScript.playerUnpublishedAt || "";
  if (savedScript.playerVisible && publishedAt) {
    return `<div class="saved-card-publish-meta saved-card-publish-meta--visible">
      <span>Published to players</span>
      <strong>${escapeHtml(_formatCoachPublishTime(publishedAt))}</strong>
    </div>`;
  }
  if (!savedScript.playerVisible && unpublishedAt) {
    return `<div class="saved-card-publish-meta">
      <span>Removed from players</span>
      <strong>${escapeHtml(_formatCoachPublishTime(unpublishedAt))}</strong>
    </div>`;
  }
  return "";
}

function getPlayerPublishedScripts() {
  return getActiveSavedScripts()
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

// Published scripts are snapshots. Older snapshots can predate the permanent
// media ID, even though their source play has since received one. Backfill the
// snapshot before the next automatic team sync so a fresh player device asks
// Cloudflare for the same canonical diagram as the coach workspace.
function hydratePlayerScriptMediaIds() {
  if (typeof canEditUser === "function" && !canEditUser()) return { changed: 0 };
  if (typeof storageManager === "undefined" || !STORAGE_KEYS?.SAVED_SCRIPTS) return { changed: 0 };
  const savedScripts = getSavedScripts();
  const playbook = typeof plays !== "undefined" && Array.isArray(plays) ? plays : [];
  if (!savedScripts.length || !playbook.length || typeof getPlayMediaId !== "function") return { changed: 0 };
  let changed = 0;
  savedScripts.forEach((savedScript) => {
    if (!savedScript?.playerVisible || !Array.isArray(savedScript.plays)) return;
    savedScript.plays.forEach((scriptPlay) => {
      if (!scriptPlay || scriptPlay.isSeparator) return;
      const source = typeof findPlaybookSourceForPlay === "function"
        ? findPlaybookSourceForPlay(scriptPlay, playbook)
        : null;
      const mediaId = getPlayMediaId(source || scriptPlay);
      if (!mediaId || scriptPlay.mediaId === mediaId) return;
      scriptPlay.mediaId = mediaId;
      changed += 1;
    });
  });
  if (!changed) return { changed: 0 };
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  if (typeof queueCloudAutoPush === "function") {
    queueCloudAutoPush(STORAGE_KEYS.SAVED_SCRIPTS, "player-media-id-backfill");
  }
  return { changed };
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

  const isStudyPortal = _isScriptStudyPortalUser();
  if (!isStudyPortal) {
    section.hidden = true;
    list.innerHTML = "";
    return;
  }

  const publishedScripts = getPlayerPublishedScripts();
  const currentName = document.getElementById("scriptName")?.value || "";
  const currentDate = document.getElementById("scriptDate")?.value || "";
  const todayValue = new Date().toISOString().slice(0, 10);
  const headerTitle = section.querySelector(".player-script-launcher-header h4");
  if (headerTitle) {
    // A player always returns to one Practice destination. Calling the rest
    // of the list "other" scripts made the normal resume path feel like an
    // unrelated workspace after leaving Swipe View.
    headerTitle.textContent = "Practice scripts";
  }

  if (publishedScripts.length === 0) {
    section.hidden = false;
    list.innerHTML = `
      <div class="player-script-empty">
        No team practice script has been published yet.
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
    });

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
            <button type="button" class="btn btn-primary btn-sm player-script-card__primary-action"
              ${isCurrent
                ? 'data-action="openPlayerCurrentScriptPresentation"'
                : 'data-action="loadPublishedPlayerScript"'}
              data-arg="${scriptId}" title="${isCurrent ? "Resume this practice in Swipe View" : "Open this published practice"}">
              ${isCurrent ? "Resume practice" : "Open practice"}
            </button>
            <details class="player-script-card__options">
              <summary>Study options <span aria-hidden="true">⌄</span></summary>
              <div class="player-script-card__option-list">
                <button type="button" class="btn btn-sm" data-action="startPlayerScriptQuiz"
                  data-arg="${scriptId}" title="Quiz yourself on this practice">Quiz</button>
                <button type="button" class="btn btn-sm" data-action="openPlayerScriptChat"
                  data-arg="${scriptId}" title="Ask questions and chat about this practice">Chat</button>
                <button type="button" class="btn btn-sm" data-action="openPlayerCurrentScriptPresentation"
                  data-arg="${scriptId}" title="Open this published script in Swipe View">Swipe View</button>
              </div>
            </details>
          </div>
        </article>
      `;
    })
    .join("");
}

// Player practice is a stable landing surface, never the coach Script
// workbench that happens to sit behind an active packet. Keep the loaded data
// in memory so Resume remains instant, but hide the editable workspace when a
// player exits Swipe View or returns from a suspended phone session.
function showPlayerPracticeLanding() {
  if (!_isScriptStudyPortalUser()) return false;
  const scriptPanel = document.getElementById("script");
  if (!scriptPanel) return false;
  scriptPanel.classList.add("script-player-practice-landing");
  if (typeof renderPlayerScriptLauncher === "function") renderPlayerScriptLauncher();
  if (typeof renderPlayerLoadedScriptBar === "function") renderPlayerLoadedScriptBar();
  if (typeof showTab === "function" && currentActiveTab !== "script") showTab("script");
  return true;
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
  const isPlayer = _isScriptStudyPortalUser();
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
    <span>Open Swipe View to study the full call, diagram, rules, and questions.</span>
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
  const savedScripts = getActiveSavedScripts();
  const deletedScripts = getDeletedSavedScripts();
  const container = document.getElementById("savedScriptsList");
  const section = document.getElementById("savedScriptsSection");
  if (!container || !section) return;

  if (savedScripts.length === 0 && deletedScripts.length === 0) {
    section.classList.add("hidden");
    renderCoachPublishStatus();
    loadFullDayScriptList();
    renderPlayerScriptLauncher();
    renderPlayerLoadedScriptBar();
    if (_isScriptStudyPortalUser() &&
      window.playImages && typeof window.playImages.prefetchForPlays === "function") {
      setTimeout(() => window.playImages.prefetchForPlays(script).catch(() => {}), 250);
    }
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
                    ${renderSavedScriptPublishMeta(savedScript)}
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
	                    <button class="saved-copy-btn" data-action="duplicateSavedScript" data-sid="${savedScript.id}" title="Create a separate draft copy">Copy</button>
	                    <button class="saved-rename-btn" data-action="openSavedScriptsArchive" data-sid="${savedScript.id}" title="View version history">🛟</button>
	                    <button class="saved-rename-btn" data-action="renameSavedScript" data-sid="${savedScript.id}" title="Rename script">✏️</button>
	                    <button class="saved-del-btn" data-action="deleteSavedScript" data-sid="${savedScript.id}" title="Delete script">✕</button>
	                </div>
            </div>
        `;
    })
    .join("");

  const archiveButton = document.getElementById("savedScriptsArchiveBtn");
  if (archiveButton) {
    archiveButton.hidden = false;
    archiveButton.textContent = deletedScripts.length
      ? `🛟 Recovery (${deletedScripts.length})`
      : "🛟 Recovery";
  }

  renderCoachPublishStatus();
  loadFullDayScriptList();
  renderPlayerScriptLauncher();
  renderPlayerLoadedScriptBar();
}

function openSavedScriptsWorkspace(opts = {}) {
  if (opts.mobile && typeof setMobileScriptEditMode === "function") {
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
    scrollElementWithinPanel(savedSection, { block: "start", behavior: "smooth" });
    if (drawerBody) drawerBody.scrollTop = savedSection.offsetTop;
    savedSection.classList.add("saved-scripts--spotlight");
    setTimeout(() => savedSection.classList.remove("saved-scripts--spotlight"), 1600);
  });
}

function openMobileScriptLoader() {
  openSavedScriptsWorkspace({ mobile: true });
}

function loadSavedScriptRecord(scriptData, opts = {}) {
  if (!scriptData || isSavedScriptDeleted(scriptData)) return false;
  try {
    document.getElementById("scriptName").value = scriptData.name;
    document.getElementById("scriptDate").value = scriptData.date;
    script = safeDeepClone(scriptData.plays);
    activeScriptSaveId = scriptData.id ?? null;
    activeScriptSaveTitle = scriptData.name || "Practice Script";
    activeScriptSavedAt = scriptData.savedAt || "";

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
    if (_isScriptStudyPortalUser()) {
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
    const scriptData = savedScripts.find((savedScript) => savedScript.id === id && !isSavedScriptDeleted(savedScript));
    if (!scriptData) return;
    loadSavedScriptRecord(scriptData);
  } catch (err) {
    console.error("loadScript error:", err);
    showToast("❌ Error loading script.", { duration: 4000, type: "error" });
  }
}

function duplicateSavedScript(id) {
  const savedScripts = getSavedScripts();
  const source = savedScripts.find((record) => String(record?.id) === String(id) && !isSavedScriptDeleted(record));
  if (!source) return null;
  const copiedAt = new Date().toISOString();
  const base = String(source.name || "Practice Script").trim() || "Practice Script";
  const name = typeof getUniqueSavedScriptCopyName === "function"
    ? getUniqueSavedScriptCopyName(base, savedScripts)
    : `${base} — Copy`;
  const copy = {
    ...safeDeepClone(source),
    id: Date.now(),
    name,
    playerVisible: false,
    playerPublishedAt: "",
    playerUnpublishedAt: "",
    savedAt: copiedAt,
    updatedAt: copiedAt,
    deletedAt: "",
    deletedBy: "",
    versions: [],
  };
  savedScripts.push(copy);
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  loadSavedScriptRecord(copy, { toastMessage: `Opened draft copy "${name}"` });
  loadSavedScriptsList();
  showToast(`📄 Created a separate draft: "${name}".`);
  return copy;
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

  // Opening a practice intentionally leaves the player landing surface; the
  // loaded packet still remains role-restricted and cannot expose coach UI.
  document.getElementById("script")?.classList.remove("script-player-practice-landing");

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
  const returnContext = {
    tab: typeof currentActiveTab === "string" ? currentActiveTab : "",
    scrollY: Number(window.scrollY || 0),
    focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  };
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
      ? openScriptPresentation(undefined, { returnContext })
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
  const requestedId = id !== undefined && id !== null ? String(id).trim() : "";
  const loadedPlayCount = Array.isArray(script)
    ? script.filter((entry) => entry && !entry.isSeparator).length
    : 0;
  tracePlayerScriptAction("current presentation start", {
    action: "openPlayerCurrentScriptPresentation",
    id: requestedId,
    loadedPlayCount,
  });

  // A launcher card always provides its script ID. Honor that explicit choice
  // before considering whatever script happened to be loaded earlier in this
  // browser session; otherwise a player can reopen an older practice instead
  // of the card they just selected.
  if (requestedId) {
    tracePlayerScriptAction("current presentation requested", {
      action: "openPlayerCurrentScriptPresentation",
      id: requestedId,
      reason: "explicit-published-script",
    });
    return presentPublishedPlayerScript(requestedId);
  }

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

  const fallbackScript = getDefaultPlayerPublishedScript();
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
    if (typeof showTab === "function") {
      showTab(typeof canAccessTab === "function" && canAccessTab("dashboard") ? "dashboard" : "playbook");
    }
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

async function togglePlayerScriptAccess(id, event) {
  const savedScripts = getSavedScripts();
  const savedScript = savedScripts.find(
    (candidate) => String(candidate.id) === String(id),
  );
  if (!savedScript) return;

  if (typeof markSavedScriptUpdated === "function") {
    markSavedScriptUpdated(savedScript, savedScript.playerVisible ? "unpublish" : "publish");
  } else {
    savedScript.updatedAt = new Date().toISOString();
  }
  savedScript.playerVisible = Boolean(event?.target?.checked);
  if (savedScript.playerVisible) {
    savedScript.playerPublishedAt = new Date().toISOString();
  } else {
    savedScript.playerUnpublishedAt = new Date().toISOString();
  }
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  await recordPlayerPublishStatus("scripts", {
    updatedAt: savedScript.playerVisible ? savedScript.playerPublishedAt : savedScript.playerUnpublishedAt,
    label: savedScript.playerVisible
      ? (savedScript.name || "Practice script")
      : `${savedScript.name || "Practice script"} removed from player logins`,
    id: savedScript.id || "",
    visibility: savedScript.playerVisible ? "published" : "unpublished",
  }, { awaitCompletion: true });
  loadSavedScriptsList();
  showToast(
    savedScript.playerVisible
      ? `Players can now load "${savedScript.name}".`
      : `Removed "${savedScript.name}" from player logins.`,
  );
}
