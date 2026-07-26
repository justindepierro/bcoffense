(function () {
  const LEGACY_CLOUD_SYNC_TOKEN_KEY = "_bcCloudSyncToken";
  const LEGACY_CLOUD_SYNC_SESSION_TOKEN_KEY = "_bcCloudSyncSessionToken";
  // Version this guard whenever startup recovery semantics change. A previous
  // build set the old guard before its request and retained it after a 502,
  // which left that tab permanently unable to retry the canonical workspace.
  const CLOUD_SYNC_AUTO_PULL_SESSION_KEY = "_bcCloudSyncAutoPullCheckedV3";
  const CLOUD_SYNC_AUTO_PULL_APPLIED_KEY = "_bcCloudSyncAutoPullApplied";
  const CLOUD_SYNC_PULL_SUMMARY_KEY = "_bcCloudSyncLastPullSummary";
  const PLAYER_RELEASE_ETAG_KEY = "_bcPlayerReleaseEtag";
  const PLAYER_RELEASE_META_KEY = "_bcPlayerReleaseMeta";
  const MAX_KV_BACKUP_BYTES = 25 * 1024 * 1024;
  // Routine saves should feel prompt on a staff sideline device, while still
  // giving rapid field edits a short batching window. The earlier 30-second
  // delay made two active browsers look out of sync for too long.
  const CLOUD_AUTO_PUSH_DELAY_MS = 8000;
  // Player-facing media and quiz changes are meaningful handoffs, not routine
  // field edits. Give nearby writes a moment to settle, then publish the
  // canonical workspace right away instead of waiting for the normal batch.
  const CLOUD_AUTO_PUSH_CRITICAL_DELAY_MS = 1200;
  const CLOUD_AUTO_PUSH_MAX_HOLD_MS = 2 * 60 * 1000;
  const CLOUD_AUTO_PUSH_RETRY_MS = 60 * 1000;
  const CLOUD_AUTO_PUSH_CONFLICT_RETRY_MS = 1500;
  const CLOUD_AUTO_PUSH_TIMEOUT_RETRY_MS = 4000;
  // A short-lived Pages/D1/R2 availability response is different from a
  // failed publish: the local edit remains durable and the server has not
  // accepted a revision. Retry it promptly so a coach posting practice media
  // does not stare at a one-minute false stall.
  const CLOUD_AUTO_PUSH_SERVER_RETRY_MS = 5000;
  const CLOUD_AUTO_PUSH_MAX_RETRIES = 3;
  const TEAM_FOREGROUND_REFRESH_MIN_MS = 20 * 1000;
  const TEAM_FOREGROUND_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
  // A player can keep the installed app open during practice. Revalidate the
  // small ETag-backed release more often than the staff workspace so a coach
  // save becomes visible without teaching players to refresh or reopen.
  const PLAYER_RELEASE_REFRESH_INTERVAL_MS = 45 * 1000;
  // Mobile browsers can leave a fetch pending while the app is backgrounded
  // or its radio changes networks. A stuck release read must never block the
  // next foreground check indefinitely.
  const PLAYER_RELEASE_REQUEST_TIMEOUT_MS = 12 * 1000;
  const WORKSPACE_REVISION_REQUEST_TIMEOUT_MS = 30 * 1000;
  const TEAM_WORKSPACE_LEASE_WAIT_MS = 12 * 1000;
  const TEAM_WORKSPACE_LEASE_RETRY_MS = 1200;

  // Daily workspace commits are deliberately narrower than a complete browser
  // backup. Keep this list aligned with the server allowlist in
  // functions/workspace/revision.js: local drafts, auth/session data, theme,
  // queues, player-private progress, and IndexedDB image blobs never cross the
  // normal team sync boundary.
  const CANONICAL_TEAM_WORKSPACE_KEYS = new Set([
    "app", "version", "exportDate",
    STORAGE_KEYS.PLAYBOOK, STORAGE_KEYS.SAVED_SCRIPTS, STORAGE_KEYS.SAVED_WRISTBANDS,
    STORAGE_KEYS.WRISTBAND_TEMPLATES, STORAGE_KEYS.SORT_PRESETS,
    STORAGE_KEYS.CUSTOM_SORT_ORDERS, STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
    STORAGE_KEYS.PERIOD_TEMPLATES, STORAGE_KEYS.SCRIPT_TEMPLATES,
    STORAGE_KEYS.CALL_SHEET, STORAGE_KEYS.CALL_SHEET_SETTINGS,
    STORAGE_KEYS.COLUMN_VISIBILITY, STORAGE_KEYS.PLAYBOOK_STATE,
    STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS, STORAGE_KEYS.SCRIPT_CONTROLS_MODE,
    STORAGE_KEYS.PLAY_READINESS, STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS,
    STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS, STORAGE_KEYS.CALLSHEET_TEMPLATES,
    STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, STORAGE_KEYS.CALLSHEET_NOTES,
    STORAGE_KEYS.CALLSHEET_TARGETS, STORAGE_KEYS.CALLSHEET_SNAPSHOTS,
    STORAGE_KEYS.DEFENSIVE_TENDENCIES, STORAGE_KEYS.TENDENCIES_SETTINGS,
    STORAGE_KEYS.GAME_WEEK, STORAGE_KEYS.INSTALLATION,
    STORAGE_KEYS.INSTALLATION_TEMPLATES, STORAGE_KEYS.PLAY_COLLECTIONS,
    STORAGE_KEYS.CALLSHEET_CONSTRAINTS, STORAGE_KEYS.OB_PLAY_RATINGS,
    STORAGE_KEYS.SCHEDULE, STORAGE_KEYS.GAME_PLAN_TAGS,
    STORAGE_KEYS.PRINT_STUDIO_SETTINGS, STORAGE_KEYS.PRESENTATION_SETUP,
    STORAGE_KEYS.WRISTBAND_SORT_CRITERIA, STORAGE_KEYS.WRISTBAND_FAVORITES,
    STORAGE_KEYS.WRISTBAND_RECENT_PLAYS, STORAGE_KEYS.WRISTBAND_LOGO_CARD,
    STORAGE_KEYS.TEAM_ROSTER, STORAGE_KEYS.TEAM_NAME,
    STORAGE_KEYS.TEAM_PERSONNEL_PACKAGES, STORAGE_KEYS.TEAM_SWAP_GROUPS,
    STORAGE_KEYS.TEAM_ASSIGNMENT_LABELS, STORAGE_KEYS.TEAM_SETTINGS_COLLAPSED,
    STORAGE_KEYS.GAME_PLAN_BOARDS, STORAGE_KEYS.GAME_PLAN_SNAPSHOTS,
    STORAGE_KEYS.GAME_PLAN_TEMPLATES, STORAGE_KEYS.CALLSHEET_PRINT_OPTIONS,
    STORAGE_KEYS.MOTD, STORAGE_KEYS.PLAYER_PORTAL_BRANDING,
    STORAGE_KEYS.PLAYER_QUIZ_SETTINGS, STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS,
    STORAGE_KEYS.QUIZ_ASSIGNMENT_TEMPLATES,
    STORAGE_KEYS.PLAYER_SIGNAL_GAME_SETTINGS, STORAGE_KEYS.PLAYER_PUBLISH_STATUS,
    STORAGE_KEYS.SIGNALS, STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES,
    STORAGE_KEYS.GAME_WEEK_ARCHIVE, STORAGE_KEYS.TENDENCIES_REPORTS,
  ]);

  const DEFAULT_SETTINGS = {
    provider: "cloudflare-d1-r2",
    lastPushAt: "",
    lastPullAt: "",
    lastRemoteExportDate: "",
    lastRemoteUpdatedAt: "",
    lastRemoteSize: 0,
    lastWorkspaceRevision: "",
  };

  // Every field eligible for the canonical snapshot schedules the same shared
  // save work. This prevents a team-safe field from becoming a local-only
  // change merely because its module was added after the original autosave
  // list was written.
  const CLOUD_AUTO_PUSH_KEYS = new Set(["playImages", ...CANONICAL_TEAM_WORKSPACE_KEYS]);

  let cloudAutoPushTimer = null;
  let cloudAutoPushCriticalTimer = null;
  let cloudAutoPushFirstQueuedAt = 0;
  let cloudAutoPushPending = false;
  let cloudAutoPushSaving = false;
  let cloudAutoPushFlushPromise = null;
  let cloudAutoPushLastError = "";
  let cloudAutoPushRetryCount = 0;
  let cloudAutoPushSuppress = false;
  // A player release replaces the complete read-only study dataset. Never do
  // that destructive-in-memory swap while the player is inside Swipe View.
  // Hold the verified response and commit it immediately after the viewer
  // exits, so notification, Practice, and Swipe all describe one release.
  let pendingPlayerReleaseApply = null;

  function tracePlayerRelease(phase, detail = {}) {
    if (typeof appDiagnostics !== "undefined" && typeof appDiagnostics.mark === "function") {
      appDiagnostics.mark(`player-release:${phase}`, detail);
    }
  }
  let teamForegroundRefreshPromise = null;
  let teamForegroundRefreshAt = 0;
  const cloudAutoPushDirtyKeys = new Set();

  function buildCanonicalTeamWorkspace(backup) {
    const source = backup && typeof backup === "object" && !Array.isArray(backup) ? backup : {};
    const workspace = {};
    CANONICAL_TEAM_WORKSPACE_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) workspace[key] = source[key];
    });
    return workspace;
  }

  function _cloudQueueJob(channel, id, opts = {}) {
    if (typeof window.queueWorkspaceSyncJob !== "function") return "";
    return window.queueWorkspaceSyncJob(channel, id, {
      retry: () => publishTeamWorkspace({ silent: true, throwOnError: true }),
      ...opts,
    });
  }

  function _cloudStartJob(key, opts = {}) {
    if (key && typeof window.startWorkspaceSyncJob === "function") {
      window.startWorkspaceSyncJob(key, opts);
    }
  }

  function _cloudCompleteJob(key, opts = {}) {
    if (key && typeof window.completeWorkspaceSyncJob === "function") {
      window.completeWorkspaceSyncJob(key, opts);
    }
  }

  function _cloudFailJob(key, err, opts = {}) {
    if (key && typeof window.failWorkspaceSyncJob === "function") {
      window.failWorkspaceSyncJob(key, err, {
        retry: () => publishTeamWorkspace({ silent: true, throwOnError: true }),
        ...opts,
      });
    }
  }

  function getCloudSyncSettings() {
    const stored = storageManager.get(STORAGE_KEYS.CLOUD_SYNC_SETTINGS, {});
    const source = stored && typeof stored === "object" ? stored : {};
    return {
      ...DEFAULT_SETTINGS,
      lastPushAt: source.lastPushAt || "",
      lastPullAt: source.lastPullAt || "",
      lastRemoteExportDate: source.lastRemoteExportDate || "",
      lastRemoteUpdatedAt: source.lastRemoteUpdatedAt || "",
      lastRemoteSize: Number(source.lastRemoteSize || 0) || 0,
      lastWorkspaceRevision: String(source.lastWorkspaceRevision || ""),
    };
  }

  function saveCloudSyncSettingsObject(settings = {}) {
    const safeSettings = {
      ...getCloudSyncSettings(),
      ...(settings || {}),
      provider: "cloudflare-d1-r2",
    };
    safeSettings.lastRemoteSize = Number(safeSettings.lastRemoteSize || 0) || 0;
    storageManager.set(STORAGE_KEYS.CLOUD_SYNC_SETTINGS, safeSettings);
    renderCloudSyncStatus();
    return safeSettings;
  }

  function getPublishActivityLog() {
    const raw = storageManager.get(STORAGE_KEYS.PUBLISH_ACTIVITY_LOG, []);
    return Array.isArray(raw)
      ? raw
        .filter((entry) => entry && typeof entry === "object")
        .sort((a, b) => (getCloudTime(b.timestamp) || 0) - (getCloudTime(a.timestamp) || 0))
        .slice(0, 25)
      : [];
  }

  function getLatestPublishActivity() {
    return getPublishActivityLog()[0] || null;
  }

  function getPublishActorLabel() {
    const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    return user?.displayName || user?.username || user?.role || "Coach";
  }

  function buildPublishVersionId(timestamp = new Date().toISOString()) {
    const compactTime = String(timestamp).replace(/[^0-9]/g, "").slice(0, 14);
    return `pub-${compactTime || Date.now()}`;
  }

  function getPublishDomainsFromBackup(backup, diagramSyncResult = null, opts = {}) {
    const domains = new Set(Array.isArray(opts.domains) ? opts.domains.filter(Boolean) : []);
    const summary = getCloudBackupSummary(backup || {});
    if (summary.playCount) domains.add("playbook");
    if (summary.scriptCount) domains.add("scripts");
    if (summary.wristbandCount) domains.add("wristbands");
    if (summary.callSheetCount) domains.add("call sheet");
    if (summary.gamePlanCount) domains.add("game plan");
    if (summary.imageCount || diagramSyncResult) domains.add("diagrams");
    if (backup?.[STORAGE_KEYS.PLAYER_PUBLISH_STATUS]) domains.add("player publish");
    if (backup?.[STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS]) domains.add("quizzes");
    if (backup?.[STORAGE_KEYS.SIGNALS]) domains.add("signals");
    return [...domains];
  }

  function recordPublishActivity(patch = {}) {
    const now = new Date().toISOString();
    const entry = {
      id: patch.id || `${buildPublishVersionId(now)}-${Math.random().toString(36).slice(2, 7)}`,
      versionId: patch.versionId || buildPublishVersionId(now),
      timestamp: patch.timestamp || now,
      actor: patch.actor || getPublishActorLabel(),
      result: patch.result || "success",
      domains: Array.isArray(patch.domains) ? patch.domains.filter(Boolean) : [],
      summary: patch.summary || "",
      failedDomain: patch.failedDomain || "",
      retryAction: patch.retryAction || "",
      size: Number(patch.size || 0) || 0,
      releaseRevision: String(patch.releaseRevision || ""),
      releaseScriptCount: Math.max(0, Number(patch.releaseScriptCount || 0) || 0),
      releaseDiagramCount: Math.max(0, Number(patch.releaseDiagramCount || 0) || 0),
    };
    const log = [entry, ...getPublishActivityLog()]
      .filter((item, index, arr) => arr.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, 25);
    storageManager.set(STORAGE_KEYS.PUBLISH_ACTIVITY_LOG, log);
    if (typeof renderTeamPublishLedgerSummary === "function") {
      renderTeamPublishLedgerSummary();
    }
    return entry;
  }

  function getPlayerReleaseReceipt(release = {}) {
    const revision = String(release?.revision || "").trim();
    const scriptCount = Math.max(0, Number(release?.scriptCount || 0) || 0);
    const diagramCount = Math.max(0, Number(release?.diagramCount || 0) || 0);
    const shortRevision = revision ? revision.slice(0, 12) : "confirmed";
    const scriptLabel = `${scriptCount} ${scriptCount === 1 ? "script" : "scripts"}`;
    return {
      revision,
      scriptCount,
      diagramCount,
      shortRevision,
      label: `Player release ready · ${scriptLabel} · ${shortRevision}`,
    };
  }

  function renderPublishActivityRows(limit = 4) {
    const rows = getPublishActivityLog().slice(0, limit);
    if (!rows.length) {
      return `<p class="cloud-sync-ledger-empty">No publish activity recorded yet.</p>`;
    }
    return rows.map((entry) => {
      const failed = entry.result !== "success";
      const domains = Array.isArray(entry.domains) && entry.domains.length
        ? entry.domains.join(", ")
        : entry.failedDomain || "workspace";
      return `
        <div class="cloud-sync-ledger-row${failed ? " cloud-sync-ledger-row--failed" : ""}">
          <span>${escapeHtml(failed ? "Needs retry" : "Published")}</span>
          <strong>${escapeHtml(formatCloudDate(entry.timestamp))}</strong>
          <small>${escapeHtml(`${entry.versionId || "version"} by ${entry.actor || "Coach"} · ${domains}`)}</small>
          ${failed && entry.retryAction ? `<em>${escapeHtml(entry.retryAction)}</em>` : ""}
        </div>`;
    }).join("");
  }

  function getStoredPlayerPublishStatus() {
    if (typeof getPlayerPublishStatus === "function") return getPlayerPublishStatus();
    const raw = storageManager.get(STORAGE_KEYS.PLAYER_PUBLISH_STATUS, {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function getStoredQuizSourceSettings() {
    const raw = storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS, {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function getStoredSignalPublishSummary() {
    const records = storageManager.get(STORAGE_KEYS.SIGNALS, []);
    const list = Array.isArray(records) ? records : [];
    const published = list.filter((record) =>
      record?.visibility === "published" && Number(record?.clipCount || 0) > 0,
    );
    return {
      total: list.length,
      published: published.length,
    };
  }

  function buildReadinessItem(domain, status, label, detail = "") {
    return { domain, status, label, detail };
  }

  function publishReadinessHasIssues(report) {
    return (report?.items || []).some((item) => item.status === "warn" || item.status === "error");
  }

  function getPublishReadinessDomains(report) {
    return (report?.items || []).map((item) => item.domain).filter(Boolean);
  }

  function formatPublishReadinessSummary(report) {
    const items = Array.isArray(report?.items) ? report.items : [];
    if (!items.length) return "Readiness checks did not return details.";
    return items
      .map((item) => `${item.label}: ${item.status === "ready" ? "ready" : item.status}${item.detail ? ` - ${item.detail}` : ""}`)
      .join(" | ");
  }

  async function buildTeamPublishReadinessReport(pushResult = {}) {
    const items = [];
    const summary = pushResult.summary || {};
    items.push(buildReadinessItem(
      "data",
      summary.itemCount ? "ready" : "warn",
      "Data",
      summary.itemCount ? `${summary.itemCount} workspace items published` : "No published workspace item count was returned",
    ));

    const publishStatus = getStoredPlayerPublishStatus();
    const metadataDomains = ["scripts", "diagrams", "quizzes", "signals"].filter((kind) => publishStatus[kind]?.updatedAt);
    items.push(buildReadinessItem(
      "player metadata",
      metadataDomains.length ? "ready" : "warn",
      "Player metadata",
      metadataDomains.length ? metadataDomains.join(", ") : "No player publish metadata has been recorded yet",
    ));

    if (window.playImages && typeof window.playImages.buildPlayerMediaPublishReport === "function") {
      try {
        const media = await window.playImages.buildPlayerMediaPublishReport();
        const counts = media?.counts || {};
        const diagramIssues =
          Number(counts.stale || 0) +
          Number(counts.unpublished || 0) +
          Number(counts.missing || 0) +
          Number(counts.failed || 0);
        const clipMissing = Number(counts.clipMissing || 0);
        const total = Array.isArray(media?.rows) ? media.rows.length : 0;
        const status = !total || (!diagramIssues && !clipMissing) ? "ready" : "warn";
        const detail = !total
          ? "No player-visible scripts require media yet"
          : `${Number(counts.ready || 0)}/${total} diagrams ready${clipMissing ? `, ${clipMissing} clip gap${clipMissing === 1 ? "" : "s"}` : ""}`;
        items.push(buildReadinessItem("media", status, "Media", detail));
      } catch (err) {
        items.push(buildReadinessItem("media", "error", "Media", err?.message || "Could not check player media readiness"));
      }
    } else {
      items.push(buildReadinessItem("media", "warn", "Media", "Media readiness checker is unavailable"));
    }

    const quizSettings = getStoredQuizSourceSettings();
    const quizSources = Object.values(quizSettings).filter((entry) => entry && entry.state && entry.state !== "coach");
    items.push(buildReadinessItem(
      "quizzes",
      quizSources.length ? "ready" : "warn",
      "Quizzes",
      quizSources.length ? `${quizSources.length} player quiz source${quizSources.length === 1 ? "" : "s"} available` : "No player quiz source is currently available",
    ));

    const signals = getStoredSignalPublishSummary();
    items.push(buildReadinessItem(
      "signals",
      signals.published ? "ready" : "warn",
      "Signals",
      signals.published ? `${signals.published} published signal clip${signals.published === 1 ? "" : "s"}` : "No published signal clips recorded",
    ));

    const notificationsReady = typeof notifyPlayersOfTeamUpdate === "function" &&
      (typeof navigator === "undefined" || navigator.onLine !== false);
    items.push(buildReadinessItem(
      "notifications",
      notificationsReady ? "ready" : "warn",
      "Notifications",
      notificationsReady ? "Notification pipeline available" : "Notifications will retry when available",
    ));

    return {
      checkedAt: new Date().toISOString(),
      items,
      hasIssues: items.some((item) => item.status === "warn" || item.status === "error"),
    };
  }

  function isCloudRemoteAlreadyKnown(remote, settings = getCloudSyncSettings()) {
    if (!remote?.summary) return false;
    const remoteTime = getCloudTime(remote.summary.exportDate || remote.updatedAt);
    const knownTime = getCloudTime(
      settings.lastRemoteExportDate ||
      settings.lastRemoteUpdatedAt ||
      settings.lastPullAt ||
      settings.lastPushAt,
    );
    return Number.isFinite(remoteTime) && Number.isFinite(knownTime) && remoteTime <= knownTime + 500;
  }

  function clearLegacyCloudSyncTokens() {
    localStorage.removeItem(LEGACY_CLOUD_SYNC_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_CLOUD_SYNC_SESSION_TOKEN_KEY);
  }

  function formatCloudDate(value) {
    if (!value) return "never";
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "unknown";
    return new Date(timestamp).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getCloudTime(value) {
    if (!value) return NaN;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : NaN;
  }

  function getLocalRecordTimestamp(record, fields = ["savedAt", "updatedAt", "playerPublishedAt", "timestamp"]) {
    if (!record || typeof record !== "object") return 0;
    return fields.reduce((latest, field) => {
      const value = record[field];
      const timestamp =
        typeof value === "number" && Number.isFinite(value)
          ? value
          : getCloudTime(value);
      return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
    }, 0);
  }

  function getLocalRecordLabel(record, fallback = "Local item") {
    if (!record || typeof record !== "object") return fallback;
    return (
      record.name ||
      record.title ||
      record.label ||
      record.opponentName ||
      record.teamName ||
      fallback
    );
  }

  function getLatestLocalRecord(records, fields) {
    const list = Array.isArray(records)
      ? records
      : records && typeof records === "object"
        ? Object.values(records)
        : [];
    return list.reduce((latest, record) => {
      const timestamp = getLocalRecordTimestamp(record, fields);
      if (!timestamp) return latest;
      if (!latest || timestamp > latest.timestamp) {
        return { record, timestamp };
      }
      return latest;
    }, null);
  }

  function addLocalPullRisk(risks, remoteTime, label, records, fields, fallbackLabel = "Local item") {
    if (!Number.isFinite(remoteTime)) return;
    const latest = getLatestLocalRecord(records, fields);
    if (!latest || latest.timestamp <= remoteTime + 500) return;
    risks.push({
      label,
      detail: `${getLocalRecordLabel(latest.record, fallbackLabel)} saved ${formatCloudDate(latest.timestamp)}`,
      timestamp: latest.timestamp,
    });
  }

  function addLocalSinglePullRisk(risks, remoteTime, label, record, fields, fallbackLabel = "Local draft") {
    if (!Number.isFinite(remoteTime) || !record || typeof record !== "object") return;
    const timestamp = getLocalRecordTimestamp(record, fields);
    if (!timestamp || timestamp <= remoteTime + 500) return;
    risks.push({
      label,
      detail: `${getLocalRecordLabel(record, fallbackLabel)} saved ${formatCloudDate(timestamp)}`,
      timestamp,
    });
  }

  function getDirtyCloudKeyLabels() {
    const labels = {
      playImages: "player-visible diagrams",
      [STORAGE_KEYS.PLAYBOOK]: "playbook",
      [STORAGE_KEYS.SAVED_SCRIPTS]: "saved scripts",
      [STORAGE_KEYS.SAVED_WRISTBANDS]: "saved wristbands",
      [STORAGE_KEYS.CALL_SHEET]: "call sheet",
      [STORAGE_KEYS.CALLSHEET_SNAPSHOTS]: "call sheet snapshots",
      [STORAGE_KEYS.GAME_PLAN_BOARDS]: "game plan boards",
      [STORAGE_KEYS.GAME_PLAN_SNAPSHOTS]: "game plan snapshots",
      [STORAGE_KEYS.PLAYER_PUBLISH_STATUS]: "player publish status",
      [STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS]: "quiz source settings",
    };
    return [...cloudAutoPushDirtyKeys].map((key) => labels[key] || key);
  }

  function getTeamWorkspacePullRisks(remote) {
    const remoteTime = getCloudTime(remote?.summary?.exportDate || remote?.updatedAt);
    const risks = [];

    if (typeof scriptDirty !== "undefined" && scriptDirty) {
      risks.push({
        label: "Unsaved script",
        detail: "Current Practice Script has local edits that have not been saved.",
        timestamp: Date.now(),
      });
    }
    if (typeof wristbandDirty !== "undefined" && wristbandDirty) {
      risks.push({
        label: "Unsaved wristband",
        detail: "Current Wristband has local edits that have not been saved.",
        timestamp: Date.now(),
      });
    }
    if (typeof window.hasWorkspaceSyncWork === "function" && window.hasWorkspaceSyncWork()) {
      risks.push({
        label: "Pending workspace work",
        detail: "A local save, cloud publish, media upload, or player update has not finished.",
        timestamp: Date.now(),
      });
    }
    if (cloudAutoPushPending || cloudAutoPushSaving || cloudAutoPushDirtyKeys.size > 0) {
      const labels = getDirtyCloudKeyLabels();
      risks.push({
        label: "Team publish pending",
        detail: labels.length
          ? `Waiting to publish ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? ", and more" : ""}.`
          : "Waiting to finish publishing this device.",
        timestamp: Date.now(),
      });
    }

    addLocalPullRisk(
      risks,
      remoteTime,
      "Saved script newer than cloud",
      storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []),
      ["savedAt", "playerPublishedAt"],
      "Saved script",
    );
    addLocalPullRisk(
      risks,
      remoteTime,
      "Script template newer than cloud",
      storageManager.get(STORAGE_KEYS.SCRIPT_TEMPLATES, []),
      ["savedAt"],
      "Script template",
    );
    addLocalSinglePullRisk(
      risks,
      remoteTime,
      "Script draft newer than cloud",
      storageManager.get(STORAGE_KEYS.SCRIPT_DRAFT, null),
      ["savedAt", "timestamp"],
      "Script draft",
    );
    addLocalPullRisk(
      risks,
      remoteTime,
      "Saved wristband newer than cloud",
      storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []),
      ["savedAt"],
      "Saved wristband",
    );
    addLocalSinglePullRisk(
      risks,
      remoteTime,
      "Wristband draft newer than cloud",
      storageManager.get(STORAGE_KEYS.WRISTBAND_DRAFT, null),
      ["savedAt", "timestamp"],
      "Wristband draft",
    );
    addLocalPullRisk(
      risks,
      remoteTime,
      "Call sheet snapshot newer than cloud",
      storageManager.get(STORAGE_KEYS.CALLSHEET_SNAPSHOTS, []),
      ["savedAt"],
      "Call sheet snapshot",
    );
    addLocalPullRisk(
      risks,
      remoteTime,
      "Call sheet template newer than cloud",
      storageManager.get(STORAGE_KEYS.CALLSHEET_TEMPLATES, []),
      ["savedAt"],
      "Call sheet template",
    );
    addLocalSinglePullRisk(
      risks,
      remoteTime,
      "Call sheet draft newer than cloud",
      storageManager.get(STORAGE_KEYS.CALLSHEET_DRAFT, null),
      ["savedAt", "timestamp"],
      "Call sheet draft",
    );
    addLocalPullRisk(
      risks,
      remoteTime,
      "Game plan snapshot newer than cloud",
      storageManager.get(STORAGE_KEYS.GAME_PLAN_SNAPSHOTS, []),
      ["savedAt"],
      "Game plan snapshot",
    );
    addLocalPullRisk(
      risks,
      remoteTime,
      "Game plan template newer than cloud",
      storageManager.get(STORAGE_KEYS.GAME_PLAN_TEMPLATES, []),
      ["savedAt"],
      "Game plan template",
    );
    addLocalPullRisk(
      risks,
      remoteTime,
      "Player publish status newer than cloud",
      storageManager.get(STORAGE_KEYS.PLAYER_PUBLISH_STATUS, {}),
      ["updatedAt"],
      "Player publish",
    );
    addLocalPullRisk(
      risks,
      remoteTime,
      "Quiz source settings newer than cloud",
      storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS, {}),
      ["updatedAt"],
      "Quiz source",
    );
    addLocalSinglePullRisk(
      risks,
      remoteTime,
      "Player quiz draft newer than cloud",
      storageManager.get(STORAGE_KEYS.PLAYER_QUIZ_DRAFT, null),
      ["savedAt", "timestamp", "updatedAt"],
      "Player quiz draft",
    );

    const seen = new Set();
    const uniqueRisks = risks
      .filter((risk) => {
        const key = `${risk.label}:${risk.detail}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return {
      hasRisk: uniqueRisks.length > 0,
      remoteTime,
      risks: uniqueRisks,
    };
  }

  function getCurrentRoleLabel() {
    if (typeof getCurrentAuthUser !== "function") return "";
    return getCurrentAuthUser()?.label || "";
  }

  function userCanPushCloudBackup() {
    const role = typeof getCurrentAuthUser === "function"
      ? getCurrentAuthUser()?.role
      : "";
    return role === "admin" || role === "coach" || role === "assistant_coach";
  }

  function userCanOpenRecoveryTools() {
    return typeof isAdminUser === "function" && isAdminUser();
  }

  function canAutoPushCloudBackup() {
    return userCanPushCloudBackup();
  }

  async function hasSubstantiveLocalTeamData() {
    // A new coach device writes harmless preferences and setup defaults before
    // the startup cloud pull runs. Those values must not make the device look
    // like it contains a competing workspace.
    try {
      const playbook = await storageManager.getPlaybook();
      if (Array.isArray(playbook) && playbook.length > 0) return true;

      const savedCollectionKeys = [
        STORAGE_KEYS.SAVED_SCRIPTS,
        STORAGE_KEYS.SCRIPT_DRAFT,
        STORAGE_KEYS.SAVED_WRISTBANDS,
        STORAGE_KEYS.WRISTBAND_DRAFT,
        STORAGE_KEYS.GAME_PLAN_BOARDS,
        STORAGE_KEYS.GAME_PLAN_SNAPSHOTS,
        STORAGE_KEYS.GAME_PLAN_TEMPLATES,
        STORAGE_KEYS.TEAM_ROSTER,
        STORAGE_KEYS.TEAM_PERSONNEL_PACKAGES,
        STORAGE_KEYS.TEAM_SWAP_GROUPS,
        STORAGE_KEYS.TEAM_ASSIGNMENT_LABELS,
        STORAGE_KEYS.DEFENSIVE_TENDENCIES,
        STORAGE_KEYS.TENDENCIES_REPORTS,
        STORAGE_KEYS.INSTALLATION,
      ];
      if (savedCollectionKeys.some((key) => hasBackupValue(storageManager.get(key, null)))) {
        return true;
      }

      return countBackupCallSheetPlays(storageManager.get(STORAGE_KEYS.CALL_SHEET, {})) > 0;
    } catch (err) {
      // Preserve the recovery safeguard if this browser cannot reliably read
      // its existing local workspace.
      console.warn("Could not inspect local workspace before cloud auto-pull:", err);
      return true;
    }
  }

  async function hasLocalCoachWorkspaceContent() {
    // Startup defaults and team setup information are not enough to block a
    // canonical restore. The upload screen in particular can retain a roster
    // or display preference even though it has none of the coach's actual
    // football workspace. Only authored/operational content deserves the
    // conservative "do not overwrite" path.
    try {
      const playbook = await storageManager.getPlaybook();
      if (Array.isArray(playbook) && playbook.length > 0) return true;

      const authoredKeys = [
        STORAGE_KEYS.SAVED_SCRIPTS,
        STORAGE_KEYS.SCRIPT_DRAFT,
        STORAGE_KEYS.SAVED_WRISTBANDS,
        STORAGE_KEYS.WRISTBAND_DRAFT,
        STORAGE_KEYS.GAME_PLAN_BOARDS,
        STORAGE_KEYS.GAME_PLAN_SNAPSHOTS,
        STORAGE_KEYS.GAME_PLAN_TEMPLATES,
        STORAGE_KEYS.DEFENSIVE_TENDENCIES,
        STORAGE_KEYS.TENDENCIES_REPORTS,
        STORAGE_KEYS.INSTALLATION,
      ];
      if (authoredKeys.some((key) => hasAuthoredCoachValue(key, storageManager.get(key, null)))) {
        return true;
      }
      return countBackupCallSheetPlays(storageManager.get(STORAGE_KEYS.CALL_SHEET, {})) > 0;
    } catch (err) {
      // If we cannot inspect existing authoring data safely, preserve it.
      console.warn("Could not inspect local coach content before cloud auto-pull:", err);
      return true;
    }
  }

  function hasKnownCanonicalWorkspaceRevision(settings = {}) {
    return Boolean(String(settings?.lastWorkspaceRevision || "").trim());
  }

  function shouldProtectUntrackedLocalWorkspace(settings = {}, hasLocalWorkspace = false) {
    // A device that has previously restored or published the canonical
    // workspace can safely follow a newer canonical revision when it has no
    // active local work. A substantive browser with no recorded revision is
    // different: it may be an older/offline workspace that was never safely
    // published, so leave it for deliberate recovery instead of overwriting
    // it in the background.
    return Boolean(hasLocalWorkspace && !hasKnownCanonicalWorkspaceRevision(settings));
  }

  function getCloudBackupSummary(backup) {
    const validation = storageManager.validateBackup(backup);
    return {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      itemCount: validation.itemCount,
      imageCount: validation.imageCount,
      exportDate: validation.exportDate || backup.exportDate || "",
    };
  }

  function parseBackupField(backup, key, fallback) {
    if (!backup || backup[key] === undefined) return fallback;
    const raw = backup[key];
    return typeof raw === "string" ? safeJSONParse(raw, fallback) : raw;
  }

  function countBackupPlaybookPlays(backup) {
    const plays = parseBackupField(backup, STORAGE_KEYS.PLAYBOOK, []);
    return Array.isArray(plays) ? plays.length : 0;
  }

  function preventEmptyPlaybookOverwrite(localBackup, remoteBackup, opts = {}) {
    const local = {
      playbook: countBackupPlaybookPlays(localBackup),
      savedScripts: countBackupCollection(parseBackupField(localBackup, STORAGE_KEYS.SAVED_SCRIPTS, [])),
      savedWristbands: countBackupCollection(parseBackupField(localBackup, STORAGE_KEYS.SAVED_WRISTBANDS, [])),
      callSheetPlays: countBackupCallSheetPlays(parseBackupField(localBackup, STORAGE_KEYS.CALL_SHEET, {})),
      gamePlanBoards: countBackupCollection(parseBackupField(localBackup, STORAGE_KEYS.GAME_PLAN_BOARDS, {})),
    };
    const remote = {
      playbook: countBackupPlaybookPlays(remoteBackup),
      savedScripts: countBackupCollection(parseBackupField(remoteBackup, STORAGE_KEYS.SAVED_SCRIPTS, [])),
      savedWristbands: countBackupCollection(parseBackupField(remoteBackup, STORAGE_KEYS.SAVED_WRISTBANDS, [])),
      callSheetPlays: countBackupCallSheetPlays(parseBackupField(remoteBackup, STORAGE_KEYS.CALL_SHEET, {})),
      gamePlanBoards: countBackupCollection(parseBackupField(remoteBackup, STORAGE_KEYS.GAME_PLAN_BOARDS, {})),
    };
    // A blank or half-hydrated browser can carry settings that make it look
    // structurally valid. It must never erase an independently authored team
    // collection. The Worker repeats this invariant so old cached clients
    // cannot bypass it.
    const protectedCollections = Object.keys(remote).filter((key) => remote[key] > 0 && local[key] === 0);
    if (protectedCollections.length && opts.allowDestructiveWorkspaceReplace !== true) {
      const err = new Error(
        `Publish paused: this device is missing team data (${protectedCollections.join(", ")}). Reload the team workspace before publishing.`,
      );
      err.code = "BC_DESTRUCTIVE_WORKSPACE_REPLACEMENT_BLOCKED";
      err.protectedCollections = protectedCollections;
      throw err;
    }
  }

  // Saved scripts are independently named artifacts inside the larger
  // workspace document. A complete workspace upload from a device that has
  // not yet hydrated its Script Library must never make a newer server script
  // disappear. Keep this merge deliberately narrow: other workspace surfaces
  // still use their established edit flows, while scripts get record-level
  // protection keyed by their stable id.
  function scriptMergeIdentity(record, index = 0) {
    const id = String(record?.id ?? "").trim();
    if (id) return `id:${id}`;
    return `legacy:${String(record?.name || "").trim().toLowerCase()}|${String(record?.date || "").trim()}|${index}`;
  }

  function scriptMergeTime(record) {
    if (!record || typeof record !== "object") return 0;
    return Math.max(
      Date.parse(record.deletedAt || "") || 0,
      Date.parse(record.updatedAt || "") || 0,
      Date.parse(record.savedAt || "") || 0,
      Date.parse(record.playerPublishedAt || "") || 0,
      Date.parse(record.playerUnpublishedAt || "") || 0,
    );
  }

  function mergeScriptVersions(left, right) {
    const collected = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]
      .filter((entry) => entry && typeof entry === "object");
    const seen = new Set();
    return collected
      .filter((entry) => {
        const key = String(entry.versionId || entry.savedAt || entry.updatedAt || "").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => scriptMergeTime(b) - scriptMergeTime(a))
      .slice(0, 20);
  }

  function mergeSavedScriptCollections(localScripts, remoteScripts) {
    const local = Array.isArray(localScripts) ? localScripts.filter(Boolean) : [];
    const remote = Array.isArray(remoteScripts) ? remoteScripts.filter(Boolean) : [];
    const remoteById = new Map(remote.map((record, index) => [scriptMergeIdentity(record, index), record]));
    const merged = [];
    const seen = new Set();

    // Preserve local ordering for scripts this coach can see, but take the
    // newest record body when both sides know the same script.
    local.forEach((localRecord, index) => {
      const key = scriptMergeIdentity(localRecord, index);
      const remoteRecord = remoteById.get(key);
      const useRemote = remoteRecord && scriptMergeTime(remoteRecord) > scriptMergeTime(localRecord);
      const selected = useRemote ? remoteRecord : localRecord;
      const counterpart = useRemote ? localRecord : remoteRecord;
      merged.push({
        ...selected,
        versions: mergeScriptVersions(selected?.versions, counterpart?.versions),
      });
      seen.add(key);
    });

    // This is the critical stale-device guard: a script absent from local
    // storage is retained from the current canonical workspace unless it is
    // represented by an explicit, newer deletion tombstone.
    remote.forEach((remoteRecord, index) => {
      const key = scriptMergeIdentity(remoteRecord, index);
      if (seen.has(key)) return;
      merged.push({ ...remoteRecord, versions: mergeScriptVersions(remoteRecord?.versions, []) });
    });

    return merged;
  }

  function mergeCanonicalSavedScripts(localBackup, remoteBackup) {
    const localScripts = parseBackupField(localBackup, STORAGE_KEYS.SAVED_SCRIPTS, []);
    const remoteScripts = parseBackupField(remoteBackup, STORAGE_KEYS.SAVED_SCRIPTS, []);
    if (!Array.isArray(localScripts) || !Array.isArray(remoteScripts)) return localBackup;
    const mergedScripts = mergeSavedScriptCollections(localScripts, remoteScripts);
    return {
      ...localBackup,
      [STORAGE_KEYS.SAVED_SCRIPTS]: JSON.stringify(mergedScripts),
    };
  }

  /**
   * A browser holds a usable local workspace cache, not an exclusive copy of
   * the team's database. Before an automatic save, start with the newest
   * canonical workspace and apply only the keys that changed in this browser.
   *
   * This keeps a coach editing a script from accidentally writing an older
   * game plan, roster, or signal collection back over another active device.
   * Scripts get their existing record-level merge on top of that key-level
   * protection. Explicit recovery publishes intentionally retain their full
   * snapshot semantics.
   */
  function rebaseCanonicalWorkspaceForAutoPush(localBackup, remoteBackup, dirtyKeys) {
    if (!remoteBackup || typeof remoteBackup !== "object") return localBackup;
    const local = localBackup && typeof localBackup === "object" ? localBackup : {};
    const merged = buildCanonicalTeamWorkspace(remoteBackup);
    const dirty = dirtyKeys instanceof Set ? dirtyKeys : new Set(dirtyKeys || []);

    // The envelope describes this newly-created immutable revision. It is not
    // a user-editable shared surface, so always make it fresh.
    ["app", "version", "exportDate"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(local, key)) merged[key] = local[key];
    });

    dirty.forEach((key) => {
      if (!CANONICAL_TEAM_WORKSPACE_KEYS.has(key)) return;
      if (key === STORAGE_KEYS.SAVED_SCRIPTS) return;
      if (Object.prototype.hasOwnProperty.call(local, key)) merged[key] = local[key];
      else delete merged[key];
    });

    if (dirty.has(STORAGE_KEYS.SAVED_SCRIPTS)) {
      return mergeCanonicalSavedScripts({ ...merged, [STORAGE_KEYS.SAVED_SCRIPTS]: local[STORAGE_KEYS.SAVED_SCRIPTS] }, remoteBackup);
    }
    return merged;
  }

  function countBackupCollection(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    return 0;
  }

  function countBackupCallSheetPlays(value) {
    if (!value || typeof value !== "object") return 0;
    return Object.values(value).reduce((sum, entry) => {
      const left = Array.isArray(entry?.left) ? entry.left.length : 0;
      const right = Array.isArray(entry?.right) ? entry.right.length : 0;
      return sum + left + right;
    }, 0);
  }

  function hasBackupValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return value !== undefined && value !== null && value !== "";
  }

  function hasAuthoredCoachValue(key, value) {
    if (key === STORAGE_KEYS.SCRIPT_DRAFT) {
      return Array.isArray(value?.plays) && value.plays.some((item) => !item?.isSeparator);
    }
    if (key === STORAGE_KEYS.WRISTBAND_DRAFT) {
      return Array.isArray(value?.cards) && value.cards.some((card) =>
        Array.isArray(card?.data) && card.data.some((play) => play !== null && play !== undefined),
      );
    }
    if (key === STORAGE_KEYS.GAME_PLAN_BOARDS) {
      return Object.values(value || {}).some((board) =>
        Object.values(board?.assignments || {}).some((plays) => Array.isArray(plays) && plays.length > 0),
      );
    }
    if (key === STORAGE_KEYS.INSTALLATION) {
      return Object.values(value?.installed || {}).some((plays) => Array.isArray(plays) && plays.length > 0);
    }
    return hasBackupValue(value);
  }

  function buildTeamWorkspacePullSummary(remote, opts = {}) {
    const backup = remote?.backup || {};
    const playerDataKeys = [
      STORAGE_KEYS.PLAYER_READY,
      STORAGE_KEYS.PLAYER_QUIZ_RESULTS,
      STORAGE_KEYS.PLAYER_QUIZ_DRAFT,
      STORAGE_KEYS.PLAYER_REWARD_EVENTS,
      STORAGE_KEYS.PLAYER_HELMET_STICKERS,
      STORAGE_KEYS.PLAYER_LEADERBOARD_REMOTE,
    ];
    const publishStatus = parseBackupField(backup, STORAGE_KEYS.PLAYER_PUBLISH_STATUS, {});
    const playImages = backup.playImages && typeof backup.playImages === "object"
      ? backup.playImages
      : {};
    const playbook = parseBackupField(backup, STORAGE_KEYS.PLAYBOOK, []);
    const savedScripts = parseBackupField(backup, STORAGE_KEYS.SAVED_SCRIPTS, []);
    const callSheet = parseBackupField(backup, STORAGE_KEYS.CALL_SHEET, {});
    const savedWristbands = parseBackupField(backup, STORAGE_KEYS.SAVED_WRISTBANDS, []);
    const gamePlanBoards = parseBackupField(backup, STORAGE_KEYS.GAME_PLAN_BOARDS, []);
    const gamePlanSnapshots = parseBackupField(backup, STORAGE_KEYS.GAME_PLAN_SNAPSHOTS, []);
    const clipStatus = publishStatus && typeof publishStatus === "object"
      ? publishStatus.clips || publishStatus.clip || null
      : null;

    return {
      pulledAt: new Date().toISOString(),
      exportDate: remote?.summary?.exportDate || backup.exportDate || "",
      updatedAt: remote?.updatedAt || "",
      size: Number(remote?.size || 0) || 0,
      restoredImages: Number(opts.restoredImages || 0) || 0,
      imageWarning: String(opts.imageWarning || "").trim(),
      counts: {
        playbook: Array.isArray(playbook) ? playbook.length : 0,
        scripts: countBackupCollection(savedScripts),
        callSheets: countBackupCallSheetPlays(callSheet),
        wristbands: countBackupCollection(savedWristbands),
        gamePlans: countBackupCollection(gamePlanBoards) + countBackupCollection(gamePlanSnapshots),
        diagrams: Number(opts.restoredImages || 0) || countBackupCollection(playImages),
        clips: hasBackupValue(clipStatus) ? 1 : 0,
        playerData: playerDataKeys.filter((key) => hasBackupValue(parseBackupField(backup, key, undefined))).length,
      },
    };
  }

  function saveTeamWorkspacePullSummary(remote, opts = {}) {
    try {
      sessionStorage.setItem(
        CLOUD_SYNC_PULL_SUMMARY_KEY,
        JSON.stringify(buildTeamWorkspacePullSummary(remote, opts)),
      );
    } catch (err) {
      console.warn("Could not save team workspace pull summary:", err);
    }
  }

  function getTeamWorkspacePullSummary() {
    return safeJSONParse(sessionStorage.getItem(CLOUD_SYNC_PULL_SUMMARY_KEY), null);
  }

  function dismissTeamWorkspacePullSummary() {
    sessionStorage.removeItem(CLOUD_SYNC_PULL_SUMMARY_KEY);
    if (typeof requestRenderDashboard === "function") requestRenderDashboard();
  }

  function getProgressReporter(label) {
    if (typeof createStorageProgressReporter === "function") {
      return createStorageProgressReporter(label);
    }
    return null;
  }

  async function buildCloudBackupPayload(opts = {}) {
    const interactive = opts.interactive !== false;
    const completeBrowserBackup = await storageManager.getAllData();

    // Canonical workspace revisions contain only structured team data. Diagram
    // bytes already live in their own immutable R2 objects and are saved by
    // play-images.js; embedding browser data URLs here would reintroduce the
    // stale/wrong-image source we are removing. Full image export remains an
    // explicit admin recovery-only option.
    if (opts.includeRecoveryImages === true && window.playImages && typeof window.playImages.exportAll === "function") {
      try {
        if (interactive) showToast("Preparing team workspace...", { duration: 1200 });
        completeBrowserBackup.playImages = await window.playImages.exportAll({
          onProgress: getProgressReporter("Exporting play images"),
        });
      } catch (err) {
        console.warn("Cloud image export failed:", err);
        if (!interactive) {
          throw new Error("Play images could not be included in the cloud autosave.");
        } else {
          const ok = await showConfirm(
            "Play images could not be included in this workspace publish. Publish the rest of your data anyway?",
            {
              title: "Image Export Failed",
              icon: "⚠️",
              confirmText: "Publish Without Images",
            },
          );
          if (!ok) throw err;
        }
      }
    }

    const backup = buildCanonicalTeamWorkspace(completeBrowserBackup);
    const summary = getCloudBackupSummary(backup);
    if (!summary.valid) {
      throw new Error(summary.errors.join(" "));
    }
    return backup;
  }

  function getPayloadSize(payloadText) {
    return new Blob([payloadText]).size;
  }

  function updateCloudSyncModalStatus(message, tone = "info") {
    const el = document.getElementById("cloudSyncModalStatus");
    if (!el) return;
    el.className = `cloud-sync-modal-status cloud-sync-modal-status-${tone}`;
    el.textContent = message;
  }

  function setCloudSyncBusy(isBusy) {
    document.querySelectorAll("[data-cloud-sync-action]").forEach((el) => {
      el.disabled = Boolean(isBusy);
    });
  }

  // Raw KV snapshots are admin-only recovery data. Keep their transport
  // isolated so normal coach autosave can never accidentally fall back to it.
  async function recoveryCloudSyncRequest(method, bodyText = "") {
    const headers = {
      Accept: "application/json",
      "X-BC-Auth-Mode": "json",
    };
    if (bodyText) headers["Content-Type"] = "application/json";

    const response = await fetch("/sync/backup", {
      method,
      credentials: "same-origin",
      headers,
      body: bodyText || undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.error || `Workspace request failed with ${response.status}`);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function fetchCloudBackup(opts = {}) {
    try {
      const data = await recoveryCloudSyncRequest("GET");
      if (!data.backup || typeof data.backup !== "object") {
        throw new Error("Cloud workspace did not include restorable data.");
      }
      const summary = getCloudBackupSummary(data.backup);
      if (!summary.valid) {
        throw new Error(summary.errors.join(" "));
      }
      return {
        backup: data.backup,
        summary,
        updatedAt: data.updatedAt || "",
        size: Number(data.size || 0) || 0,
      };
    } catch (err) {
      if (opts.allowMissing && err.status === 404) return null;
      throw err;
    }
  }

  async function repairCanonicalWorkspace(remote, opts = {}) {
    if (!remote?.needsCanonicalRepair || !remote?.backup || !remote?.revision) return null;
    const payload = JSON.stringify(remote.backup);
    return workspaceRevisionRequest("PUT", payload, remote.revision, {
      timeoutMs: opts.timeoutMs,
    });
  }

  function workspaceRequestId(method) {
    const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `workspace-${String(method || "request").toLowerCase()}-${suffix}`;
  }

  async function workspaceFetchWithTimeout(resource, options = {}, opts = {}) {
    const timeoutMs = Math.max(1000, Number(opts.timeoutMs || WORKSPACE_REVISION_REQUEST_TIMEOUT_MS) || WORKSPACE_REVISION_REQUEST_TIMEOUT_MS);
    const controller = typeof AbortController === "undefined" ? null : new AbortController();
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0;
    try {
      return await fetch(resource, { ...options, signal: controller?.signal });
    } catch (err) {
      if (controller?.signal?.aborted) {
        const timeoutError = new Error("Team sync timed out. Your changes are saved locally and will retry automatically.");
        timeoutError.code = "BC_WORKSPACE_TIMEOUT";
        timeoutError.retryable = true;
        timeoutError.cause = err;
        throw timeoutError;
      }
      throw err;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function workspaceRevisionRequest(method, bodyText = "", expectedRevision = "", opts = {}) {
    const headers = {
      Accept: "application/json",
      "X-BC-Auth-Mode": "json",
      "X-BC-Request-Id": workspaceRequestId(method),
    };
    if (bodyText) headers["Content-Type"] = "application/json";
    if (method === "PUT" && expectedRevision !== undefined && expectedRevision !== null) {
      headers["X-BC-Expected-Workspace-Revision"] = String(expectedRevision || "");
    }
    if (method === "GET" && opts.ifNoneMatch) {
      headers["If-None-Match"] = String(opts.ifNoneMatch);
    }
    const response = await workspaceFetchWithTimeout("/workspace/revision", {
      method,
      credentials: "same-origin",
      headers,
      body: bodyText || undefined,
      cache: "no-store",
    }, { timeoutMs: opts.timeoutMs });
    const data = response.status === 304 ? { ok: true, notModified: true } : await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 304) {
      const err = new Error(data.error || `Workspace request failed with ${response.status}`);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return { ...data, etag: response.headers.get("ETag") || "" };
  }

  async function acquireCloudWorkspaceLease(opts = {}) {
    const coordinator = window.workspaceSync;
    if (!coordinator || typeof coordinator.acquireTeamWorkspaceLease !== "function") return null;
    const lease = await coordinator.acquireTeamWorkspaceLease({
      purpose: "canonical-workspace",
      waitMs: opts.auto ? 0 : TEAM_WORKSPACE_LEASE_WAIT_MS,
      ttlMs: WORKSPACE_REVISION_REQUEST_TIMEOUT_MS * 2 + 10 * 1000,
    });
    if (lease?.acquired) return lease;
    const err = new Error("Another open tab is finishing a team update. This tab will retry with the newest version.");
    err.code = "BC_WORKSPACE_LEASE_BUSY";
    err.retryable = true;
    err.retryAfterMs = Math.max(TEAM_WORKSPACE_LEASE_RETRY_MS, Number(lease?.retryAfterMs || 0) || 0);
    throw err;
  }

  function releaseCloudWorkspaceLease(lease) {
    if (!lease || typeof window.workspaceSync?.releaseTeamWorkspaceLease !== "function") return;
    window.workspaceSync.releaseTeamWorkspaceLease(lease);
  }

  async function fetchCanonicalWorkspace(opts = {}) {
    try {
      const data = await workspaceRevisionRequest("GET", "", "", {
        ifNoneMatch: opts.ifNoneMatch || "",
        timeoutMs: opts.timeoutMs,
      });
      if (data.notModified) {
        return {
          notModified: true,
          revision: String(data.etag || "").replace(/^"|"$/g, ""),
          playerReleaseRevision: "",
          updatedAt: "",
          size: 0,
        };
      }
      if (!data.workspace || typeof data.workspace !== "object") {
        throw new Error("Canonical workspace did not include restorable team data.");
      }
      const summary = getCloudBackupSummary(data.workspace);
      if (!summary.valid) throw new Error(summary.errors.join(" "));
      return {
        backup: data.workspace,
        summary,
        revision: String(data.revision || ""),
        playerReleaseRevision: String(data.playerReleaseRevision || ""),
        updatedAt: data.updatedAt || "",
        size: Number(data.size || 0) || 0,
        needsCanonicalRepair: data.needsCanonicalRepair === true,
        omittedLegacyFieldCount: Math.max(0, Number(data.omittedLegacyFieldCount || 0) || 0),
      };
    } catch (err) {
      if (opts.allowMissing && err.status === 404) return null;
      throw err;
    }
  }

  function getPlayerReleaseSessionMeta() {
    return safeJSONParse(sessionStorage.getItem(PLAYER_RELEASE_META_KEY), {}) || {};
  }

  function savePlayerReleaseSessionMeta(meta = {}) {
    const safe = {
      etag: String(meta.etag || ""),
      revision: String(meta.revision || ""),
      updatedAt: String(meta.updatedAt || ""),
      teamId: String(meta.teamId || ""),
    };
    sessionStorage.setItem(PLAYER_RELEASE_META_KEY, JSON.stringify(safe));
    if (safe.etag) sessionStorage.setItem(PLAYER_RELEASE_ETAG_KEY, safe.etag);
    else sessionStorage.removeItem(PLAYER_RELEASE_ETAG_KEY);
    return safe;
  }

  function playerReleaseSummary(release) {
    const scripts = Array.isArray(release?.scripts) ? release.scripts : [];
    const playbook = Array.isArray(release?.playbook) ? release.playbook : [];
    const diagrams = Array.isArray(release?.media?.diagramMediaIds)
      ? release.media.diagramMediaIds
      : [];
    return {
      itemCount: playbook.length + scripts.length,
      scriptCount: scripts.length,
      playCount: playbook.length,
      imageCount: diagrams.length || Number(release?.release?.diagramCount || 0) || 0,
      exportDate: String(release?.release?.updatedAt || ""),
      updatedAt: String(release?.release?.updatedAt || ""),
      revision: String(release?.release?.revision || ""),
      teamId: String(release?.release?.teamId || ""),
    };
  }

  function isValidPlayerRelease(release) {
    return Boolean(
      release &&
      release.schema === "bcoffense.player-release/v1" &&
      release.release &&
      typeof release.release.teamId === "string" &&
      typeof release.release.revision === "string" &&
      Array.isArray(release.playbook) &&
      Array.isArray(release.scripts) &&
      Array.isArray(release.media?.diagramMediaIds) &&
      Array.isArray(release.media?.diagrams) &&
      Array.isArray(release.media?.clipSigs),
    );
  }

  async function fetchPlayerRelease(opts = {}) {
    const meta = getPlayerReleaseSessionMeta();
    const authUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    const activeTeamId = String(authUser?.teamId || "").trim();
    const state = storageManager?.get?.(STORAGE_KEYS.PLAYER_RELEASE_STATE, null);
    const localReleaseReady = Boolean(
      activeTeamId &&
      state &&
      state.schema === "bcoffense.player-release/v1" &&
      state.teamId === activeTeamId &&
      state.revision &&
      Array.isArray(await storageManager.getPlaybook()),
    );
    const canRevalidate = localReleaseReady && meta.teamId === activeTeamId && Boolean(meta.etag);
    if (!canRevalidate && meta.etag) {
      savePlayerReleaseSessionMeta({});
    }
    const headers = {
      Accept: "application/json",
      "X-BC-Auth-Mode": "json",
    };
    if (!opts.force && canRevalidate) headers["If-None-Match"] = meta.etag;
    tracePlayerRelease("request", {
      force: Boolean(opts.force),
      conditional: Boolean(headers["If-None-Match"]),
      activeTab: String(typeof currentActiveTab !== "undefined" ? currentActiveTab || "" : ""),
    });
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const timeoutId = controller ? window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, PLAYER_RELEASE_REQUEST_TIMEOUT_MS) : 0;
    let response;
    try {
      response = await fetch("/player/release", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        signal: controller?.signal,
      });
    } catch (err) {
      if (timedOut) {
        const timeoutError = new Error("Player update check timed out. It will retry when the app is active.");
        timeoutError.code = "PLAYER_RELEASE_TIMEOUT";
        tracePlayerRelease("timeout", { timeoutMs: PLAYER_RELEASE_REQUEST_TIMEOUT_MS });
        throw timeoutError;
      }
      throw err;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
    if (response.status === 304) {
      tracePlayerRelease("current", { status: 304 });
      return { notModified: true, meta };
    }
    const data = await response.json().catch(() => ({}));
    tracePlayerRelease("response", { status: response.status, ok: response.ok });
    if (!response.ok) {
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("bc-auth-session-required", {
          detail: { message: "Your secure session ended. Sign in to continue." },
        }));
      }
      const err = new Error(data.error || `Player release request failed with ${response.status}`);
      err.status = response.status;
      throw err;
    }
    if (!data?.ok || !isValidPlayerRelease(data.release)) {
      throw new Error("Player release did not contain valid practice data.");
    }
    return {
      notModified: false,
      release: data.release,
      etag: response.headers.get("ETag") || "",
    };
  }

  function getPlayerReleaseReloadTab(opts = {}) {
    if (opts.navigate === false) return "";

    // A release can arrive while a player is studying the Playbook, Signals,
    // or a Script. Rebuild the now-current release in that same allowed
    // surface; sending every refresh to Dashboard feels like an unexpected
    // sign-out and breaks their place in the study flow.
    const activeTab = String(
      (typeof currentActiveTab !== "undefined" && currentActiveTab) ||
      document.body?.dataset?.activeTab ||
      "",
    ).trim();
    if (activeTab && (typeof canAccessTab !== "function" || canAccessTab(activeTab))) {
      return activeTab;
    }
    return "dashboard";
  }

  async function applyPlayerRelease(release, opts = {}) {
    if (!storageManager || typeof storageManager.replacePlayerReleaseData !== "function") {
      throw new Error("This app version cannot safely apply the player release.");
    }
    tracePlayerRelease("apply-start", { revision: String(release?.release?.revision || "") });
    const state = await storageManager.replacePlayerReleaseData(release);
    if (window.playImages) {
      if (typeof window.playImages.clearRemoteManifestCache === "function") {
        window.playImages.clearRemoteManifestCache();
      }
      if (typeof window.playImages.clearPlayerReleaseCache === "function") {
        await window.playImages.clearPlayerReleaseCache();
      }
    }
    if (window.playClips && typeof window.playClips.resetReleaseCache === "function") {
      window.playClips.resetReleaseCache();
    }

    // Never leave an already-open coach script in global memory after the
    // storage scrub. The player can load only a released script again.
    if (typeof script !== "undefined") script = [];
    if (typeof scriptWristband !== "undefined") scriptWristband = null;
    if (typeof activeScriptSaveId !== "undefined") activeScriptSaveId = null;
    if (typeof activeScriptSaveTitle !== "undefined") activeScriptSaveTitle = "";
    if (typeof activeScriptSavedAt !== "undefined") activeScriptSavedAt = "";
    if (typeof collapsedPeriods !== "undefined") collapsedPeriods = new Set();
    if (typeof playerScriptImageKeysLoaded !== "undefined") playerScriptImageKeysLoaded = false;

    const targetTab = getPlayerReleaseReloadTab(opts);
    await reloadAppFromStorage(targetTab ? { targetTab } : {});
    if (targetTab === "script" && typeof showPlayerPracticeLanding === "function") {
      showPlayerPracticeLanding();
    }
    if (targetTab && typeof setWorkspaceSurface === "function") {
      setWorkspaceSurface("app", { initModules: false });
    }
    tracePlayerRelease("apply-complete", { revision: String(state?.revision || ""), targetTab });
    return state;
  }

  function saveCloudSyncSettings(opts = {}) {
    saveCloudSyncSettingsObject();
    if (!opts.quiet) showToast("Recovery settings saved", { type: "success" });
  }

  async function testCloudSyncConnection() {
    try {
      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Checking recovery status...", "info");
      const remote = await fetchCloudBackup({ allowMissing: true });
      if (!remote) {
        updateCloudSyncModalStatus("Recovery connection is ready. No team workspace has been published yet.", "ok");
        renderCloudSyncStatus();
        return;
      }
      saveCloudSyncSettingsObject({
        lastRemoteExportDate: remote.summary.exportDate,
        lastRemoteUpdatedAt: remote.updatedAt,
        lastRemoteSize: remote.size,
      });
      updateCloudSyncModalStatus(
        `Team workspace found: ${formatCloudDate(remote.summary.exportDate)} (${remote.summary.itemCount} items${remote.summary.imageCount ? `, ${remote.summary.imageCount} diagrams` : ""}).`,
        "ok",
      );
    } catch (err) {
      updateCloudSyncModalStatus(err.message, "error");
      showToast(err.message, { type: "error", duration: 5000 });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  // One-time migration/recovery action. Normal coach saves rebuild the player
  // release as part of the server workspace commit; this does not expose a
  // daily publish button or let a player create a release by refreshing.
  async function rebuildPlayerRelease() {
    if (!userCanOpenRecoveryTools()) {
      showToast("Player release recovery is admin-only.", { type: "warning", duration: 3500 });
      return false;
    }
    try {
      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Rebuilding the player release from recovery data...", "info");
      const response = await fetch("/admin/player-release", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-BC-Auth-Mode": "json",
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Player release rebuild failed (${response.status})`);
      }
      const release = data.release || {};
      updateCloudSyncModalStatus(
        `Player release rebuilt: ${Number(release.scriptCount || 0)} scripts and ${Number(release.diagramCount || 0)} diagram references are ready.`,
        "ok",
      );
      showToast("Player release rebuilt", { type: "success", duration: 3500 });
      return true;
    } catch (err) {
      updateCloudSyncModalStatus(err.message || "Player release rebuild failed.", "error");
      showToast(err.message || "Player release rebuild failed.", { type: "error", duration: 5000 });
      return false;
    } finally {
      setCloudSyncBusy(false);
    }
  }

  function formatDiagramSyncSummary(result) {
    if (!result) return "";
    return `Player-visible diagrams: ${Number(result.pushed || 0)} published, ${Number(result.skipped || 0)} skipped, ${Number(result.failed || 0)} failed.`;
  }

  function formatDiagramSyncDetails(result) {
    if (!result || !Array.isArray(result.errors) || !result.errors.length) return "";
    return result.errors
      .slice(0, 5)
      .map((item) => {
        const sig = item.sig ? `${item.sig}: ` : "";
        const status = item.status ? `${item.status}: ` : "";
        return `- ${sig}${status}${item.error || "Unknown diagram publish issue."}`;
      })
      .join("\n");
  }

  async function reducePayloadIfNeeded(backup, payloadText, payloadSize, opts = {}) {
    const interactive = opts.interactive !== false;
    if (payloadSize <= MAX_KV_BACKUP_BYTES) {
      return { backup, payloadText, payloadSize };
    }

    if (Object.prototype.hasOwnProperty.call(backup, "playImages")) {
      if (interactive) {
        const ok = await showConfirm(
          `This team workspace is ${storageManager.formatBytes(payloadSize)}, which is larger than the current cloud storage limit. Publish the team data without play images?`,
          {
            title: "Backup Too Large",
            icon: "⚠️",
            confirmText: "Push Without Images",
          },
        );
        if (!ok) {
          throw new Error("Team workspace was not published.");
        }
      }
      const smallerBackup = { ...backup };
      delete smallerBackup.playImages;
      const smallerPayload = JSON.stringify(smallerBackup, null, 2);
      const smallerSize = getPayloadSize(smallerPayload);
      if (smallerSize <= MAX_KV_BACKUP_BYTES) {
        return {
          backup: smallerBackup,
          payloadText: smallerPayload,
          payloadSize: smallerSize,
        };
      }
    }

    throw new Error(
      `Team workspace is ${storageManager.formatBytes(payloadSize)}. The current cloud storage limit is 25 MiB per item.`,
    );
  }

  async function pushCloudBackupInternal(opts = {}) {
    const silent = opts.silent === true;
    const skipActivityLog = opts.skipActivityLog === true;
    // A normal workspace save publishes the small team-data pointer only.
    // Diagram bytes have their own source-specific durable outbox in
    // play-images.js. Do not turn every coach save into a legacy full-library
    // recovery scan, since unmatched archive blobs are review work rather
    // than upload failures and should never pin the save dock red.
    const syncDiagrams = opts.syncDiagrams === true;
    if (!userCanPushCloudBackup()) {
      throw new Error("Coach access is required to save the team workspace.");
    }

    let workspaceLease = null;
    try {
      setCloudSyncBusy(true);
      let diagramSyncResult = null;
      if (!silent) updateCloudSyncModalStatus("Preparing local data...", "info");
      let backup = await buildCloudBackupPayload({ interactive: !silent });
      // Coordinate competing tabs before the read/rebase/write section. A
      // device in another browser still relies on the server CAS below, but
      // tabs sharing this browser now serialize their expensive workspace
      // cycle and receive the finished revision immediately.
      workspaceLease = await acquireCloudWorkspaceLease({ auto: opts.auto === true });
      // Always read the current canonical head before an upload. The revision
      // CAS alone catches simultaneous writers, but cannot tell that this
      // browser's local Script Library predates a script saved elsewhere.
      // Merging the script collection here means a stale device can add or
      // edit its own work without silently erasing newer saved scripts.
      const remoteBeforePush = await fetchCanonicalWorkspace({ allowMissing: true });
      if (remoteBeforePush?.backup) {
        preventEmptyPlaybookOverwrite(backup, remoteBeforePush.backup, opts);
        backup = opts.auto
          ? rebaseCanonicalWorkspaceForAutoPush(backup, remoteBeforePush.backup, cloudAutoPushDirtyKeys)
          : mergeCanonicalSavedScripts(backup, remoteBeforePush.backup);
      }
      let payloadText = JSON.stringify(backup, null, 2);
      let payloadSize = getPayloadSize(payloadText);
      ({ backup, payloadText, payloadSize } = await reducePayloadIfNeeded(
        backup,
        payloadText,
        payloadSize,
        { interactive: !silent },
      ));

      if (!silent) updateCloudSyncModalStatus("Publishing team workspace...", "info");
      const knownRevision = remoteBeforePush?.revision || getCloudSyncSettings().lastWorkspaceRevision || "";
      const data = await workspaceRevisionRequest("PUT", payloadText, knownRevision);
      const summary = getCloudBackupSummary(backup);
      const nextSettings = saveCloudSyncSettingsObject({
        lastPushAt: new Date().toISOString(),
        lastRemoteExportDate: summary.exportDate,
        lastRemoteUpdatedAt: data.updatedAt || "",
        lastRemoteSize: payloadSize,
        lastWorkspaceRevision: data.revision || knownRevision,
      });
      releaseCloudWorkspaceLease(workspaceLease);
      workspaceLease = null;
      if (typeof window.workspaceSync?.announceTeamWorkspacePublished === "function") {
        window.workspaceSync.announceTeamWorkspacePublished({
          revision: data.revision || knownRevision,
          updatedAt: data.updatedAt || nextSettings.lastPushAt,
        });
      }
      // The legacy all-diagram scan is an explicit recovery action only. New
      // or changed diagrams publish immediately through their durable outbox.
      if (syncDiagrams && window.playImages && typeof window.playImages.syncToRemote === "function") {
        const _playsRef = typeof plays !== "undefined" ? plays : [];
        if (!silent) {
          updateCloudSyncModalStatus("Workspace published. Publishing diagrams to player devices...", "info");
        }
        // Do not mark the workspace ready while its player media is still a
        // detached promise. The upload queue/dock remains responsive during
        // this await, and any failure flows into the same retry path.
        diagramSyncResult = await window.playImages.syncToRemote(_playsRef);
      }
      if (!silent) {
        const diagramLine = formatDiagramSyncSummary(diagramSyncResult);
        const modalDetails = formatDiagramSyncDetails(diagramSyncResult);
        const hasDiagramIssues = diagramSyncResult && (diagramSyncResult.failed || diagramSyncResult.skipped);
        if (!skipActivityLog) {
          recordPublishActivity({
            versionId: buildPublishVersionId(nextSettings.lastPushAt),
            timestamp: nextSettings.lastPushAt,
            result: hasDiagramIssues ? "partial" : "success",
            domains: getPublishDomainsFromBackup(backup, diagramSyncResult),
            summary: `Published ${summary.itemCount} workspace items`,
            failedDomain: hasDiagramIssues ? "diagrams" : "",
            retryAction: hasDiagramIssues ? "Open Publish Media and retry failed diagrams." : "",
            size: payloadSize,
          });
        }
        updateCloudSyncModalStatus(
          `Published ${summary.itemCount} items${summary.imageCount ? ` and ${summary.imageCount} diagram entries` : ""}.${diagramLine ? ` ${diagramLine}` : ""} Last publish: ${formatCloudDate(nextSettings.lastPushAt)}.`,
          hasDiagramIssues ? "warning" : "ok",
        );
        if (hasDiagramIssues && typeof showToast === "function") {
          showToast(
            `Team update published, but some media needs attention.${modalDetails ? ` ${modalDetails.split("\n")[0]}` : ""}`,
            { type: "warning", duration: 6000 },
          );
        }
      } else {
        if (!skipActivityLog) {
          recordPublishActivity({
            versionId: buildPublishVersionId(nextSettings.lastPushAt),
            timestamp: nextSettings.lastPushAt,
            result: "success",
            domains: getPublishDomainsFromBackup(backup, diagramSyncResult, { domains: getDirtyCloudKeyLabels() }),
            summary: `Published ${summary.itemCount} workspace items`,
            size: payloadSize,
          });
        }
      }
      return {
        backup,
        summary,
        size: payloadSize,
        updatedAt: data.updatedAt || "",
        release: data.release || null,
        diagramSyncResult,
      };
    } catch (err) {
      if (!skipActivityLog) {
        recordPublishActivity({
          result: "failed",
          domains: getDirtyCloudKeyLabels(),
          summary: err.message || "Publish failed",
          failedDomain: cloudAutoPushDirtyKeys.has("playImages") ? "media" : "workspace",
          retryAction: silent ? "Use Retry from the save status chip." : "Open Recovery Tools and retry the local workspace republish.",
        });
      }
      throw err;
    } finally {
      releaseCloudWorkspaceLease(workspaceLease);
      setCloudSyncBusy(false);
    }
  }

  async function publishTeamWorkspace(opts = {}) {
    const silent = opts.silent === true;
    const throwOnError = opts.throwOnError === true;
    const jobId = opts.jobId || (opts.auto ? "auto-publish" : "team-publish");
    const publishJobKey = _cloudQueueJob("cloud", jobId, {
      queuedLabel: opts.queuedLabel || "Team update queued — saved here, publishing shortly",
      runningLabel: opts.runningLabel || "Publishing data...",
      doneLabel: "Ready for players",
      errorLabel: "Publish needs attention — saved on this device",
      retry: () => publishTeamWorkspace(opts),
    });
    _cloudStartJob(publishJobKey, { label: opts.runningLabel || "Publishing data..." });
    try {
      if (!silent) updateCloudSyncModalStatus("Publishing team data...", "info");
      const result = await pushCloudBackupInternal({
        silent,
        auto: opts.auto === true,
        skipActivityLog: true,
        syncDiagrams: opts.syncDiagrams === true,
      });
      if (!silent) updateCloudSyncModalStatus("Checking player readiness...", "info");
      const readiness = await buildTeamPublishReadinessReport(result);
      const playerRelease = getPlayerReleaseReceipt(result.release);
      const hasIssues = publishReadinessHasIssues(readiness);
      const domains = getPublishReadinessDomains(readiness);
      const failedItem = readiness.items.find((item) => item.status === "error") ||
        readiness.items.find((item) => item.status === "warn") ||
        null;
      const timestamp = new Date().toISOString();
      recordPublishActivity({
        versionId: buildPublishVersionId(timestamp),
        timestamp,
        result: hasIssues ? "partial" : "success",
        domains,
        summary: `${playerRelease.label}. ${formatPublishReadinessSummary(readiness)}`,
        failedDomain: hasIssues ? failedItem?.domain || "readiness" : "",
        // Readiness gaps are content to review (such as a historic play that
        // has no diagram), not failed transport work. Re-publishing cannot
        // repair those gaps, so keep them in the audit instead of advertising
        // a misleading Retry action in the workspace dock.
        retryAction: hasIssues ? "Review the Media Inventory and complete only the listed content gaps." : "",
        size: result.size,
        releaseRevision: playerRelease.revision,
        releaseScriptCount: playerRelease.scriptCount,
        releaseDiagramCount: playerRelease.diagramCount,
      });
      cloudAutoPushLastError = "";
      cloudAutoPushRetryCount = 0;
      if (!opts.auto) {
        cloudAutoPushPending = false;
        cloudAutoPushDirtyKeys.clear();
      }
      // The workspace did publish. A readiness warning must not become a
      // retryable publish failure: that permanently pins the red dock and
      // implies Retry will create media that simply does not exist yet.
      _cloudCompleteJob(publishJobKey, {
        label: hasIssues ? "Published; readiness reviewed" : "Ready for players",
      });
      if (!silent) {
        updateCloudSyncModalStatus(
          `${hasIssues ? "Published, but readiness needs attention." : "Published and ready for players."} ${formatPublishReadinessSummary(readiness)}`,
          hasIssues ? "warn" : "ok",
        );
      }
      if (hasIssues) {
        const statusEl = document.getElementById("cloudSyncStatus");
        if (statusEl) {
          statusEl.textContent = "Publish needs attention - readiness checks found gaps";
          statusEl.className = "cloud-sync-status cloud-sync-status-warn";
        }
      } else {
        renderCloudSyncStatus();
      }
      return { ...result, readiness };
    } catch (err) {
      const deferredToOtherTab = err?.code === "BC_WORKSPACE_LEASE_BUSY";
      // Automatic work is retried by flushCloudAutoPush. Do not briefly pin
      // the red failure dock or raise a toast while that retry is still in
      // flight; it teaches coaches to intervene when the system is handling
      // the transient network issue itself.
      if (!opts.auto) {
        _cloudFailJob(publishJobKey, err, {
          label: "Publish needs attention — saved on this device",
          retry: () => publishTeamWorkspace(opts),
        });
      }
      if (!deferredToOtherTab) {
        recordPublishActivity({
          result: "failed",
          domains: getDirtyCloudKeyLabels(),
          summary: err.message || "Publish failed",
          failedDomain: cloudAutoPushDirtyKeys.has("playImages") ? "media" : "workspace",
          retryAction: silent ? "Use Retry from the save status chip." : "Open Recovery Tools and retry the local workspace republish.",
        });
        updateCloudSyncModalStatus(err.message, "error");
        if (!silent) showToast(err.message, { type: "error", duration: 6000 });
      }
      if (throwOnError) throw err;
      return null;
    }
  }

  async function pushCloudBackup() {
    return publishTeamWorkspace({ silent: false });
  }

  async function applyCloudBackupImmediately(remote, opts = {}) {
    const shouldConfirm = opts.confirm !== false;
    const shouldReload = opts.reload !== false;
    const shouldNotify = opts.notify !== false;
    const requestedTargetTab = String(opts.targetTab || "").trim();
    const targetTab =
      opts.auto || opts.navigate === false
        ? ""
        : requestedTargetTab &&
          (typeof canAccessTab !== "function" || canAccessTab(requestedTargetTab))
          ? requestedTargetTab
          : (typeof canAccessTab !== "function" || canAccessTab("dashboard"))
            ? "dashboard"
            : "";
    // Recovery tooling may read an older retained object. Reapply the same
    // strict team boundary here (including unattended empty-device recovery)
    // rather than trusting a historic browser-shaped backup at restore time.
    const backup = buildCanonicalTeamWorkspace(remote?.backup || {});
    const summary = getCloudBackupSummary(backup);
    if (!summary.valid) throw new Error(summary.errors.join(" "));
    if (shouldConfirm) {
      const pullRisks = getTeamWorkspacePullRisks(remote);
      const riskLines = pullRisks.risks
        .slice(0, 6)
        .map((risk) => `- ${risk.label}: ${risk.detail}`)
        .join("\n");
      const overflowLine = pullRisks.risks.length > 6
        ? `\n- ${pullRisks.risks.length - 6} more local item${pullRisks.risks.length - 6 === 1 ? "" : "s"}`
        : "";
      const riskText = pullRisks.hasRisk
        ? `\n\nLocal work to review before updating:\n${riskLines}${overflowLine}\n\nUpdating anyway will replace this device's local workspace. Publish this device first if those changes should be kept.`
        : "";
      const ok = await showConfirm(
        `Recover this device from the team workspace dated ${formatCloudDate(summary.exportDate)}?\n\nThis refreshes local practice data with the latest published workspace.\n\nItems: ${summary.itemCount}${summary.imageCount ? `\nDiagrams in backup: ${summary.imageCount}` : ""}${riskText}\n\nContinue?`,
        {
          title: pullRisks.hasRisk ? "Review Local Work Before Update" : "Update Team Workspace",
          icon: pullRisks.hasRisk ? "⚠️" : "☁️",
          confirmText: pullRisks.hasRisk ? "Update Anyway" : "Update Device",
          danger: pullRisks.hasRisk,
        },
      );
      if (!ok) return false;
    }

    cloudAutoPushSuppress = true;
    try {
      const canonicalKeys = Array.from(CANONICAL_TEAM_WORKSPACE_KEYS);
      if (!(await storageManager.restoreAllData(backup, {
        confirmOverwrite: false,
        // A normal recovery source is a complete, server-allowlisted team
        // workspace. Replace only those team fields; drafts, auth, uploads,
        // browser caches, and player-private data stay local.
        replaceMissingKeys: opts.replaceMissingKeys === false ? undefined : canonicalKeys,
      }))) {
        return false;
      }

      let restoredImages = 0;
      let imageWarning = "";
      if (Object.prototype.hasOwnProperty.call(backup, "playImages")) {
        if (window.playImages && typeof window.playImages.importAll === "function") {
          try {
            restoredImages = await window.playImages.importAll(backup.playImages || {}, {
              replace: true,
              onProgress: getProgressReporter("Restoring play images"),
            });
          } catch (err) {
            console.warn("Cloud image import failed:", err);
            imageWarning = "\nPlay images could not be restored.";
          }
        } else {
          imageWarning = "\nPlay image storage is not available in this browser.";
        }
      }

      if (!opts.localRollback) {
        saveCloudSyncSettingsObject({
          lastPullAt: new Date().toISOString(),
          lastRemoteExportDate: summary.exportDate,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastRemoteSize: remote.size,
        });
        saveTeamWorkspacePullSummary({ ...remote, backup, summary }, { restoredImages, imageWarning });
      }
      await reloadAppFromStorage(targetTab ? { targetTab } : {});
      if (targetTab && typeof setWorkspaceSurface === "function") {
        setWorkspaceSurface("app", { initModules: false });
      }

      if (shouldReload) {
        if (opts.auto) {
          sessionStorage.setItem(
            CLOUD_SYNC_AUTO_PULL_APPLIED_KEY,
            summary.exportDate || remote.updatedAt || new Date().toISOString(),
          );
          return true;
        }
        if (shouldNotify) {
          closeCloudSyncModal();
          if (typeof showToast === "function" && imageWarning) {
            showToast(`Team workspace updated.${imageWarning}`, { type: "warning", duration: 5000 });
          }
        }
        return true;
      }

      if (shouldNotify) {
        showToast(
          `Team workspace updated.${restoredImages ? ` Diagrams restored: ${restoredImages}.` : ""}${imageWarning}`,
          { type: "success", duration: 4000 },
        );
      }
      return true;
    } finally {
      cloudAutoPushSuppress = false;
    }
  }

  async function restoreCloudBackup(remote, opts = {}) {
    // Manual recovery is intentionally staged once the recovery UI has
    // loaded. Startup pulls still run without a modal because they only occur
    // on an empty device and must finish before the app can continue.
    if (!opts.auto && opts.staged !== false && window.stagedRestore?.open) {
      return window.stagedRestore.open(remote, opts);
    }
    return applyCloudBackupImmediately(remote, opts);
  }

  async function pullCloudBackup() {
    try {
      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Fetching team workspace...", "info");
      const currentUser =
        typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
      if (currentUser?.role === "player") {
        const result = typeof refreshPlayerTeamApp === "function"
          ? await refreshPlayerTeamApp({ quiet: false, force: true })
          : await refreshPlayerCloudBackup({ navigate: true });
        closeCloudSyncModal();
        if (!result?.ok || result?.status === "needs-retry") {
          showToast("Try Again", {
            type: "warning",
            duration: 4000,
          });
        }
        return result;
      }
      const remote = await fetchCloudBackup();
      await restoreCloudBackup(remote);
    } catch (err) {
      updateCloudSyncModalStatus(err.message, "error");
      showToast(err.message, { type: "error", duration: 6000 });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  async function refreshPlayerRelease(opts = {}) {
    try {
      const fetched = await fetchPlayerRelease({ force: opts.skipIfCurrent === false || opts.force === true });
      if (fetched.notModified) {
        const state = storageManager.get(STORAGE_KEYS.PLAYER_RELEASE_STATE, {});
        const summary = playerReleaseSummary({
          release: {
            teamId: state.teamId || fetched.meta.teamId,
            revision: state.revision || fetched.meta.revision,
            updatedAt: state.updatedAt || fetched.meta.updatedAt,
            diagramCount: Number(state.diagramCount || 0),
          },
          scripts: storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []),
          playbook: await storageManager.getPlaybook(),
          media: { diagramMediaIds: [] },
        });
        return { ok: true, status: "current", ...summary, message: "Ready" };
      }

      const summary = playerReleaseSummary(fetched.release);
      const presentationOpen = document.getElementById("playPresentationOverlay")?.classList.contains("is-open");
      if (presentationOpen) {
        pendingPlayerReleaseApply = { release: fetched.release, etag: fetched.etag, opts: { ...opts } };
        tracePlayerRelease("deferred", { revision: summary.revision, reason: "swipe-view-open" });
        document.dispatchEvent(new CustomEvent("player-release-deferred", {
          detail: { revision: summary.revision, updatedAt: summary.updatedAt },
        }));
        return {
          ok: true,
          status: "deferred",
          ...summary,
          message: "New practice will load after Swipe View closes.",
        };
      }

      await applyPlayerRelease(fetched.release, opts);
      savePlayerReleaseSessionMeta({
        etag: fetched.etag,
        revision: summary.revision,
        updatedAt: summary.updatedAt,
        teamId: summary.teamId,
      });
      return { ok: true, status: "refreshed", ...summary, message: "Ready" };
    } catch (err) {
      tracePlayerRelease("error", { status: Number(err?.status || 0), message: err?.message || String(err) });
      if (err?.status === 404) {
        // A team with no published release is an ordinary pre-practice state,
        // not a sync failure. Keeping it distinct prevents Player Home from
        // showing a misleading retry warning or routing the player into an
        // empty practice workspace.
        return { ok: true, status: "waiting", message: "No practice published yet" };
      }
      throw err;
    }
  }

  // Compatibility name for the existing player bootstrap. It now performs a
  // player-release refresh and never calls /sync/backup or restoreAllData().
  async function refreshPlayerCloudBackup(opts = {}) {
    return refreshPlayerRelease(opts);
  }

  function renderCloudSyncStatus() {
    const settings = getCloudSyncSettings();
    const statusEl = document.getElementById("cloudSyncStatus");
    if (!statusEl) return;
    if (cloudAutoPushSaving) {
      statusEl.textContent = "Publishing team update...";
      statusEl.className = "cloud-sync-status cloud-sync-status-ready";
      if (typeof window.setWorkspaceSyncStatus === "function") {
        window.setWorkspaceSyncStatus("cloud", "syncing", { label: "Publishing team update..." });
      }
      return;
    }
    if (cloudAutoPushLastError) {
      const retrying = cloudAutoPushPending && cloudAutoPushRetryCount <= CLOUD_AUTO_PUSH_MAX_RETRIES;
      statusEl.textContent = retrying
        ? "Team sync retrying automatically..."
        : `Publish needs attention — saved on this device: ${cloudAutoPushLastError}`;
      statusEl.className = "cloud-sync-status cloud-sync-status-warn";
      if (typeof window.setWorkspaceSyncStatus === "function") {
        window.setWorkspaceSyncStatus(
          "cloud",
          retrying ? "queued" : "error",
          { label: retrying ? "Team sync retrying automatically" : "Publish needs attention — saved on this device" },
        );
      }
      return;
    }
    if (cloudAutoPushPending) {
      statusEl.textContent = "Team update queued — saved here, publishing shortly.";
      statusEl.className = "cloud-sync-status cloud-sync-status-warn";
      if (typeof window.setWorkspaceSyncStatus === "function") {
        window.setWorkspaceSyncStatus("cloud", "queued", { label: "Team update queued — saved here, publishing shortly" });
      }
      return;
    }
    const lastText = settings.lastPushAt
      ? `last publish ${formatCloudDate(settings.lastPushAt)}`
      : settings.lastPullAt
        ? `this device updated ${formatCloudDate(settings.lastPullAt)}`
        : settings.lastRemoteExportDate
          ? `published workspace ${formatCloudDate(settings.lastRemoteExportDate)}`
          : "not published yet";
    statusEl.textContent = `Publish status ready - ${lastText}`;
    statusEl.className = "cloud-sync-status cloud-sync-status-ready";
    if (typeof window.setWorkspaceSyncStatus === "function") {
      window.setWorkspaceSyncStatus("cloud", "synced", { label: "Ready for players" });
    }
  }

  function shouldAutoPushCloudKey(key) {
    return CLOUD_AUTO_PUSH_KEYS.has(key);
  }

  function scheduleCloudAutoPushTimer(delay) {
    if (cloudAutoPushTimer) clearTimeout(cloudAutoPushTimer);
    cloudAutoPushTimer = setTimeout(() => {
      cloudAutoPushTimer = null;
      flushCloudAutoPush();
    }, Math.max(500, delay));
  }

  function queueCloudAutoPush(key, reason = "change") {
    if (cloudAutoPushSuppress) return false;
    if (
      window.appStartup &&
      typeof window.appStartup.shouldSuppressCloudAutoPush === "function" &&
      window.appStartup.shouldSuppressCloudAutoPush(key, reason)
    ) {
      return false;
    }
    if (!shouldAutoPushCloudKey(key)) return false;
    if (!canAutoPushCloudBackup()) return false;

    cloudAutoPushDirtyKeys.add(key);
    cloudAutoPushPending = true;
    cloudAutoPushLastError = "";
    _cloudQueueJob("cloud", "auto-push", {
      queuedLabel: "Team update queued — saved here, publishing shortly",
      runningLabel: "Publishing team update...",
      doneLabel: "Team update published",
      errorLabel: "Publish needs attention — saved on this device",
    });
    if (!cloudAutoPushFirstQueuedAt) cloudAutoPushFirstQueuedAt = Date.now();

    if (cloudAutoPushSaving) {
      renderCloudSyncStatus();
      return true;
    }

    const age = Date.now() - cloudAutoPushFirstQueuedAt;
    const delay = age >= CLOUD_AUTO_PUSH_MAX_HOLD_MS ? 1000 : CLOUD_AUTO_PUSH_DELAY_MS;
    scheduleCloudAutoPushTimer(delay);
    renderCloudSyncStatus();

    return true;
  }

  // Used after a player-visible handoff (diagram, clip, quiz, or published
  // script). This remains one debounced workspace commit for a burst of work;
  // it simply bypasses the 30-second routine-edit delay once the data has
  // settled. Offline and server failures stay in the existing durable retry
  // path, so the dock stays informational unless the system cannot recover.
  function requestImmediateTeamPublish(reason = "substantial-update", opts = {}) {
    if (!canAutoPushCloudBackup()) return false;
    const queued = queueCloudAutoPush(
      STORAGE_KEYS.PLAYER_PUBLISH_STATUS,
      `substantial:${String(reason || "update")}`,
    );
    if (!queued) return false;
    if (cloudAutoPushCriticalTimer) clearTimeout(cloudAutoPushCriticalTimer);
    if (opts.awaitCompletion === true) {
      cloudAutoPushCriticalTimer = null;
      return flushCloudAutoPush();
    }
    cloudAutoPushCriticalTimer = setTimeout(() => {
      cloudAutoPushCriticalTimer = null;
      flushCloudAutoPush();
    }, CLOUD_AUTO_PUSH_CRITICAL_DELAY_MS);
    return true;
  }

  // A player-visible save can land while a normal coach autosave is already
  // publishing. Join that canonical commit instead of returning false to the
  // second caller; both receipts describe the same immutable release.
  function flushCloudAutoPush() {
    if (cloudAutoPushFlushPromise) return cloudAutoPushFlushPromise;
    const run = flushCloudAutoPushInternal();
    cloudAutoPushFlushPromise = run;
    const clearInFlight = () => {
      if (cloudAutoPushFlushPromise === run) cloudAutoPushFlushPromise = null;
    };
    run.then(clearInFlight, clearInFlight);
    return run;
  }

  async function flushCloudAutoPushInternal() {
    if (cloudAutoPushSuppress || !cloudAutoPushPending || !canAutoPushCloudBackup()) {
      renderCloudSyncStatus();
      return false;
    }
    if (cloudAutoPushSaving) return false;

    if (cloudAutoPushTimer) {
      clearTimeout(cloudAutoPushTimer);
      cloudAutoPushTimer = null;
    }

    cloudAutoPushSaving = true;
    cloudAutoPushPending = false;
    cloudAutoPushFirstQueuedAt = 0;
    const cloudJobKey = _cloudQueueJob("cloud", "auto-push", {
      queuedLabel: "Team update queued — saved here, publishing shortly",
      runningLabel: "Publishing team update...",
      doneLabel: "Team update published",
      errorLabel: "Publish needs attention — saved on this device",
    });
    _cloudStartJob(cloudJobKey, { label: "Publishing team update..." });
    renderCloudSyncStatus();

    try {
      const result = await publishTeamWorkspace({
        silent: true,
        auto: true,
        throwOnError: true,
        jobId: "auto-push",
        queuedLabel: "Team update queued — saved here, publishing shortly",
        runningLabel: "Publishing team update...",
      });
      if (!result) throw new Error("Publish did not complete.");
      const playerRelease = getPlayerReleaseReceipt(result.release);
      const moreChangesQueued = cloudAutoPushPending;
      cloudAutoPushLastError = "";
      cloudAutoPushRetryCount = 0;
      _cloudCompleteJob(cloudJobKey, { label: "Team update published" });
      if (typeof window.completePlayerPublishJobs === "function") {
        window.completePlayerPublishJobs({ label: playerRelease.label });
      }
      if (!moreChangesQueued) {
        cloudAutoPushDirtyKeys.clear();
      } else {
        cloudAutoPushFirstQueuedAt = Date.now();
        scheduleCloudAutoPushTimer(CLOUD_AUTO_PUSH_DELAY_MS);
      }
      return true;
    } catch (err) {
      const leaseBusy = err?.code === "BC_WORKSPACE_LEASE_BUSY";
      cloudAutoPushPending = true;
      cloudAutoPushLastError = leaseBusy ? "" : (err.message || "Unknown error");
      if (!leaseBusy) cloudAutoPushRetryCount += 1;
      if (leaseBusy) {
        cloudAutoPushFirstQueuedAt = Date.now();
        _cloudQueueJob("cloud", "auto-push", {
          queuedLabel: "Another tab is finishing the team update",
          runningLabel: "Publishing team update...",
          doneLabel: "Team update published",
          errorLabel: "Publish needs attention — saved on this device",
        });
        scheduleCloudAutoPushTimer(Math.min(TEAM_FOREGROUND_REFRESH_MIN_MS, Math.max(
          TEAM_WORKSPACE_LEASE_RETRY_MS,
          Number(err?.retryAfterMs || 0) || 0,
        )));
      } else if (cloudAutoPushRetryCount <= CLOUD_AUTO_PUSH_MAX_RETRIES) {
        cloudAutoPushFirstQueuedAt = Date.now();
        _cloudQueueJob("cloud", "auto-push", {
          queuedLabel: "Team sync retrying automatically",
          runningLabel: "Publishing team update...",
          doneLabel: "Team update published",
          errorLabel: "Publish needs attention — saved on this device",
        });
        // A revision conflict means another staff device just finished a
        // valid save. Re-fetch and rebase almost immediately; waiting a full
        // minute makes the app look broken while the latest server state is
        // already available. Network failures retain the calmer backoff.
        scheduleCloudAutoPushTimer(
          err?.status === 409
            ? CLOUD_AUTO_PUSH_CONFLICT_RETRY_MS
            : err?.code === "BC_WORKSPACE_TIMEOUT"
              ? CLOUD_AUTO_PUSH_TIMEOUT_RETRY_MS
              : Number(err?.status) >= 500 && Number(err?.status) < 600
                ? CLOUD_AUTO_PUSH_SERVER_RETRY_MS
              : CLOUD_AUTO_PUSH_RETRY_MS,
        );
      } else {
        _cloudFailJob(cloudJobKey, err, { label: "Publish needs attention — saved on this device" });
        if (typeof window.failPlayerPublishJobs === "function") {
          window.failPlayerPublishJobs(err, { label: "Player update needs attention — saved on this device" });
        }
      }
      return false;
    } finally {
      cloudAutoPushSaving = false;
      renderCloudSyncStatus();
    }
  }

  function hasCloudAutoPushWork() {
    return Boolean(cloudAutoPushPending || cloudAutoPushSaving || cloudAutoPushLastError);
  }

  function hasLocalTeamEditInProgress() {
    return Boolean(
      hasCloudAutoPushWork() ||
      (typeof scriptDirty !== "undefined" && scriptDirty) ||
      (typeof wristbandDirty !== "undefined" && wristbandDirty)
    );
  }

  /**
   * Keep an open device current without turning the canonical workspace into
   * a noisy polling UI. Player release reads are ETag-backed. Staff devices
   * make the same light revision check and apply a newer workspace only when
   * this browser has no local edit or upload work to protect.
   */
  async function refreshTeamWorkspaceOnForeground(opts = {}) {
    if (teamForegroundRefreshPromise) return teamForegroundRefreshPromise;
    const now = Date.now();
    if (!opts.force && now - teamForegroundRefreshAt < TEAM_FOREGROUND_REFRESH_MIN_MS) return null;
    teamForegroundRefreshAt = now;

    teamForegroundRefreshPromise = (async () => {
      const currentUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
      if (!currentUser) return null;
      if (currentUser.role === "player") {
        return refreshPlayerRelease({ force: false, navigate: false });
      }
      const canReadTeamWorkspace = ["admin", "coach", "assistant_coach"].includes(String(currentUser.role || ""));
      if (!canReadTeamWorkspace || hasLocalTeamEditInProgress()) return null;

      const settings = getCloudSyncSettings();
      const remote = await fetchCanonicalWorkspace({
        allowMissing: true,
        ifNoneMatch: settings.lastWorkspaceRevision || "",
      });
      if (!remote || remote.notModified || !remote.revision || remote.revision === settings.lastWorkspaceRevision) return remote;

      // A browser with no recorded canonical head may be an older offline
      // workspace, not an empty new device. Preserve that cautious first-run
      // behavior: surface metadata through normal recovery instead of ever
      // replacing substantive untracked coach work in the background.
      const hasLocalWorkspace = await hasSubstantiveLocalTeamData();
      if (shouldProtectUntrackedLocalWorkspace(settings, hasLocalWorkspace)) {
        saveCloudSyncSettingsObject({
          lastRemoteExportDate: remote.summary?.exportDate || "",
          lastRemoteUpdatedAt: remote.updatedAt || "",
          lastRemoteSize: remote.size || 0,
        });
        return remote;
      }

      const restored = await restoreCloudBackup(remote, {
        auto: true,
        confirm: false,
        notify: false,
        navigate: false,
      });
      if (restored) {
        saveCloudSyncSettingsObject({
          lastWorkspaceRevision: remote.revision,
          lastRemoteExportDate: remote.summary?.exportDate || "",
          lastRemoteUpdatedAt: remote.updatedAt || "",
          lastRemoteSize: remote.size || 0,
        });
        if (!opts.quiet && typeof showToast === "function") {
          showToast("Latest team update loaded", { type: "success", duration: 2200 });
        }
      }
      return { ...remote, restored };
    })();

    try {
      return await teamForegroundRefreshPromise;
    } catch (err) {
      // Freshness checks are enhancement work. Do not compete with an open
      // practice screen or present a recovery error for a transient poll.
      console.warn("Team foreground refresh deferred:", err);
      return null;
    } finally {
      teamForegroundRefreshPromise = null;
    }
  }

  async function autoPullLatestCloudBackup(opts = {}) {
    const currentUser =
      typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    if (!currentUser) return false;

    // Do not consume the once-per-tab workspace read before someone has
    // authenticated. A signed-out shell is expected on a shared device; if it
    // claimed this guard, the eventual login could be left on an empty local
    // workspace with no canonical team read.
    // A newly completed login must make its own decision. It can follow a
    // shell-start check in this same tab, but it must never inherit that
    // check's conclusion (especially on a browser that first opened signed
    // out or with an empty, default-only workspace).
    if (opts.bootstrap === true) {
      sessionStorage.removeItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY);
    }
    if (sessionStorage.getItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY) === "1") return false;
    sessionStorage.setItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY, "1");

    // Players never fetch the raw recovery snapshot. Their bootstrap uses the
    // narrow server release even when this generic auto-pull hook runs first.
    if (currentUser.role === "player") {
      try {
        const result = await refreshPlayerRelease({ force: false, navigate: false });
        return Boolean(result?.ok);
      } catch (err) {
        console.warn("Player release auto-refresh failed:", err);
        return false;
      }
    }

    try {
      // Normal coach startup reads the revisioned D1/R2 workspace. The old
      // KV backup is deliberately admin-only recovery data and must never win
      // over the canonical team head during a routine device bootstrap.
      let remote = await fetchCanonicalWorkspace({
        allowMissing: true,
        timeoutMs: opts.timeoutMs,
      });
      if (!remote) return false;

      // Managed coaches are deliberately read-only. Their browser is a study
      // surface, not an independent team workspace, so always hydrate it from
      // the canonical published head at sign-in. This prevents a brand-new
      // coach profile (or a browser that previously held player data) from
      // opening an empty/local shell instead of the team's scripts and boards.
      if (currentUser.role === "coach" && currentUser.managedCoach === true) {
        const restored = await restoreCloudBackup(remote, {
          auto: true,
          confirm: false,
          notify: false,
        });
        if (restored) {
          saveCloudSyncSettingsObject({
            lastWorkspaceRevision: remote.revision || "",
            lastRemoteExportDate: remote.summary.exportDate,
            lastRemoteUpdatedAt: remote.updatedAt,
            lastRemoteSize: remote.size,
          });
        }
        return restored;
      }

      // A pre-data-plane snapshot can be checksum-valid while still carrying
      // old browser-only fields. The server has already removed only its
      // explicit migration set from this response. Commit that sanitized
      // payload with CAS once so future coaches and players read a clean
      // canonical revision without a manual publish or recovery action.
      if (remote.needsCanonicalRepair && canAutoPushCloudBackup()) {
        try {
          const repaired = await repairCanonicalWorkspace(remote, {
            timeoutMs: opts.timeoutMs,
          });
          if (repaired?.ok) {
            saveCloudSyncSettingsObject({
              lastWorkspaceRevision: repaired.revision || remote.revision,
              lastRemoteUpdatedAt: repaired.updatedAt || remote.updatedAt,
              lastRemoteSize: Number(repaired.size || remote.size) || 0,
            });
            // A just-repaired legacy workspace is still the startup source.
            // Read its new immutable revision before continuing so a fresh
            // private staff browser does not fall through to an empty shell.
            remote = await fetchCanonicalWorkspace({
              allowMissing: true,
              timeoutMs: opts.timeoutMs,
            });
            if (!remote) return false;
          }
        } catch (repairError) {
          // A concurrent coach already won the same repair; the next regular
          // fetch sees that current head without turning a harmless CAS race
          // into a scary startup warning.
          if (repairError?.status === 409) return false;
          throw repairError;
        }
      }

      const settings = getCloudSyncSettings();
      const hasLocalWorkspace = await hasSubstantiveLocalTeamData();
      const hasLocalCoachContent = await hasLocalCoachWorkspaceContent();
      const remoteMatchesKnownRevision = hasKnownCanonicalWorkspaceRevision(settings) &&
        remote.revision === settings.lastWorkspaceRevision;

      if (remoteMatchesKnownRevision) {
        // A prior build could record that it had seen the remote workspace
        // without restoring it. Do not let that marker strand an otherwise
        // empty coach device on the upload screen. Revision identity—not a
        // timestamp rounded by different devices—is the authoritative test.
        if (!hasLocalCoachContent) {
          const restored = await restoreCloudBackup(remote, {
            auto: true,
            confirm: false,
            notify: false,
          });
          if (restored) {
            saveCloudSyncSettingsObject({
              lastWorkspaceRevision: remote.revision || "",
              lastRemoteExportDate: remote.summary.exportDate,
              lastRemoteUpdatedAt: remote.updatedAt,
              lastRemoteSize: remote.size,
            });
          }
          return restored;
        }
        saveCloudSyncSettingsObject({
          lastRemoteExportDate: remote.summary.exportDate,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastRemoteSize: remote.size,
          lastWorkspaceRevision: remote.revision || settings.lastWorkspaceRevision,
        });
        return false;
      }

      // Active saves always win over a background refresh. Do not advance the
      // locally-recorded revision here: the next clean foreground check must
      // still see this newer remote revision and hydrate it.
      if (hasLocalTeamEditInProgress()) {
        saveCloudSyncSettingsObject({
          lastRemoteExportDate: remote.summary.exportDate,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastRemoteSize: remote.size,
        });
        return false;
      }

      // Preserve a browser-only workspace that has never been associated with
      // the canonical head. Once a device has a known revision, however, it is
      // a managed team device and should automatically receive the newer team
      // revision instead of remaining stale until an admin opens Recovery.
      if (shouldProtectUntrackedLocalWorkspace(settings, hasLocalWorkspace) && hasLocalCoachContent) {
        saveCloudSyncSettingsObject({
          lastRemoteExportDate: remote.summary.exportDate,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastRemoteSize: remote.size,
        });
        const canReviewWorkspace = userCanOpenRecoveryTools();
        showToast(
          canReviewWorkspace
            ? "Newer team workspace found. This device has unsynced coach work, so BCOffense kept it safe. Review options before replacing anything."
            : "Newer team workspace found. This device has unsynced coach work, so BCOffense kept it safe. Ask an administrator before replacing anything.",
          {
            type: "warning",
            persistent: true,
            actionLabel: canReviewWorkspace ? "Review options" : "",
            action: canReviewWorkspace ? "openCloudSyncModal" : "",
          },
        );
        return false;
      }

      const restored = await restoreCloudBackup(remote, {
        auto: true,
        confirm: false,
        notify: false,
      });
      if (restored) {
        saveCloudSyncSettingsObject({
          lastWorkspaceRevision: remote.revision || "",
          lastRemoteExportDate: remote.summary.exportDate,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastRemoteSize: remote.size,
        });
      }
      return restored;
    } catch (err) {
      // A failed startup check must never consume this tab's single attempt.
      // Keep the guard only after a completed request so a reload—or a later
      // auth-ready retry—can recover from a transient worker/network failure.
      sessionStorage.removeItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY);
      console.warn("Cloud auto-pull failed:", err);
      if (err.status !== 401 && err.status !== 404 && err.code !== "BC_WORKSPACE_TIMEOUT") {
        showToast(currentUser.role === "player" ? "Try Again" : `Team workspace update failed: ${err.message}`, {
          type: "warning",
          duration: 5000,
        });
      }
      return false;
    }
  }

  function resetCloudSyncAutoPull() {
    sessionStorage.removeItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY);
  }

  function openCloudSyncModal() {
    if (!userCanOpenRecoveryTools()) {
      if (typeof showToast === "function") {
        showToast("Recovery tools are admin-only.", { type: "warning", duration: 3000 });
      }
      return;
    }
    const existing = document.getElementById("cloudSyncOverlay");
    if (existing) existing.remove();

    const settings = getCloudSyncSettings();
    const canPush = userCanPushCloudBackup();
    const roleLabel = getCurrentRoleLabel();
    const latestPublish = getLatestPublishActivity();
    const overlay = document.createElement("div");
    overlay.id = "cloudSyncOverlay";
    overlay.className = "custom-modal-overlay cloud-sync-overlay";
    overlay.setAttribute("data-action", "closeCloudSyncModalOverlay");
    overlay.innerHTML = `
      <div class="custom-modal custom-modal-wide cloud-sync-modal" role="dialog" aria-modal="true" aria-labelledby="cloudSyncTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🛟</span>
          <h3 class="custom-modal-title" id="cloudSyncTitle">Admin Recovery Tools</h3>
        </div>
        <div class="custom-modal-body cloud-sync-body">
          <p>Use these tools only to recover a device or investigate a publish problem. Normal player updates are automatic, and normal coach publishing should use the save status and publish readiness surfaces.</p>
          <p class="cloud-sync-warning">Recovery actions can overwrite this device or republish the current local workspace. Export a backup first if there is any chance this device has work you need to keep.</p>
          <div class="cloud-sync-explainer" aria-label="Workspace status meanings">
            <div class="cloud-sync-explainer-item">
              <span>Saved on this device</span>
              <strong>Your edits are safe here.</strong>
              <small>Autosave protects coach work immediately, even before it is live for players.</small>
            </div>
            <div class="cloud-sync-explainer-item">
              <span>Published for team</span>
              <strong>The team workspace has a cloud version.</strong>
              <small>Other coach devices and player logins can receive that published update.</small>
            </div>
            <div class="cloud-sync-explainer-item">
              <span>Ready for players</span>
              <strong>Data and player-visible media are checked.</strong>
              <small>Scripts, diagrams, clips, quizzes, and status metadata are ready to load quietly.</small>
            </div>
          </div>
          <div class="cloud-sync-flow-grid" aria-label="Team workspace publish actions">
            <div class="cloud-sync-flow-card">
              <span>Publish</span>
              <strong>Send coach changes to the team</strong>
              <small>${escapeHtml(canPush ? "Publishes playbook, scripts, team tools, and player-visible media status." : "Only admins can publish team workspace changes.")}</small>
            </div>
            <div class="cloud-sync-flow-card">
              <span>Update</span>
              <strong>Refresh this coach device</strong>
              <small>${escapeHtml(`${roleLabel || "This login"} can update this device from the latest published workspace.`)}</small>
            </div>
            <div class="cloud-sync-flow-card">
              <span>Last published</span>
              <strong>${escapeHtml(formatCloudDate(settings.lastRemoteExportDate || settings.lastPushAt || settings.lastPullAt))}</strong>
              <small>${escapeHtml(settings.lastRemoteSize ? storageManager.formatBytes(settings.lastRemoteSize) : "Cloud size unknown")}</small>
            </div>
          </div>
          <section class="cloud-sync-ledger" aria-label="Publish activity">
            <div class="cloud-sync-ledger-head">
              <div>
                <span>Latest published workspace</span>
                <strong>${escapeHtml(latestPublish ? `${latestPublish.versionId} · ${formatCloudDate(latestPublish.timestamp)}` : "No publish recorded")}</strong>
              </div>
              <small>${escapeHtml(latestPublish ? `${latestPublish.result === "success" ? "Ready" : "Needs retry"} · ${latestPublish.actor || "Coach"}` : "A normal team publish creates the first ledger entry.")}</small>
            </div>
            <div class="cloud-sync-ledger-list">
              ${renderPublishActivityRows(4)}
            </div>
          </section>
          <p class="cloud-sync-warning">${escapeHtml(canPush ? "Daily workflow: edit normally and let the save/publish status show readiness. Recovery workflow: use these buttons only when a device is behind, corrupted, or publish status needs investigation." : "Recovery tools are admin-only. Ask an admin to recover this device or publish team changes.")}</p>
          <div id="cloudSyncModalStatus" class="cloud-sync-modal-status cloud-sync-modal-status-info">
            Recovery tools ready. Last published update: ${escapeHtml(formatCloudDate(settings.lastRemoteExportDate || settings.lastPushAt || settings.lastPullAt))}.
          </div>
          <div class="cloud-sync-meta">
            <span>Last publish: ${escapeHtml(formatCloudDate(settings.lastPushAt))}</span>
            <span>This device updated: ${escapeHtml(formatCloudDate(settings.lastPullAt))}</span>
            <span>Cloud size: ${escapeHtml(settings.lastRemoteSize ? storageManager.formatBytes(settings.lastRemoteSize) : "unknown")}</span>
          </div>
        </div>
          <div class="custom-modal-actions cloud-sync-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel" data-action="closeCloudSyncModal">Close</button>
          <button type="button" class="btn btn-secondary custom-modal-btn" data-action="testCloudSyncConnection" data-cloud-sync-action="test">Check Recovery Status</button>
          ${canPush ? '<button type="button" class="btn btn-secondary custom-modal-btn" data-action="rebuildPlayerRelease" data-cloud-sync-action="rebuild-release">Rebuild Player Release</button>' : ""}
          <button type="button" class="btn btn-secondary custom-modal-btn" data-action="pullCloudBackup" data-cloud-sync-action="pull">Recover This Device</button>
          <button type="button" class="btn btn-secondary custom-modal-btn" data-action="openStagedRestoreHistory">Undo Device Recovery</button>
          ${canPush ? '<button type="button" class="btn btn-primary custom-modal-btn" data-action="pushCloudBackup" data-cloud-sync-action="push" data-auth-admin-only="true">Republish Local Workspace</button>' : ""}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("[data-cloud-sync-action]")?.focus();
  }

  function closeCloudSyncModal() {
    const overlay = document.getElementById("cloudSyncOverlay");
    if (!overlay) return;
    overlay.classList.remove("visible");
    overlay.style.pointerEvents = "none";
    overlay.setAttribute("aria-hidden", "true");
    setTimeout(() => overlay.remove(), 200);
  }

  document.addEventListener("DOMContentLoaded", () => {
    clearLegacyCloudSyncTokens();
    renderCloudSyncStatus();
    const applied = sessionStorage.getItem(CLOUD_SYNC_AUTO_PULL_APPLIED_KEY);
    if (applied) {
      sessionStorage.removeItem(CLOUD_SYNC_AUTO_PULL_APPLIED_KEY);
      showToast(`Latest team workspace applied: ${formatCloudDate(applied)}`, {
        type: "success",
        duration: 4000,
      });
    }
  });

  window.addEventListener("play-images-changed", () => {
    queueCloudAutoPush("playImages", "play-images");
  });

  // A sibling tab has already committed a new immutable revision. Pull it
  // promptly when this tab is clean; if it has edits, the normal rebase/CAS
  // path protects those changes and the next foreground check will reconcile.
  document.addEventListener("workspace-sync-remote-update", (event) => {
    const revision = String(event?.detail?.revision || "");
    if (!revision || revision === getCloudSyncSettings().lastWorkspaceRevision) return;
    if (hasLocalTeamEditInProgress()) return;
    refreshTeamWorkspaceOnForeground({ force: true, quiet: true });
  });

  document.addEventListener("play-presentation-closed", () => {
    const pending = pendingPlayerReleaseApply;
    if (!pending) return;
    pendingPlayerReleaseApply = null;
    tracePlayerRelease("deferred-apply", { revision: String(pending.release?.release?.revision || "") });
    applyPlayerRelease(pending.release, pending.opts)
      .then(() => {
        const summary = playerReleaseSummary(pending.release);
        savePlayerReleaseSessionMeta({
          etag: pending.etag,
          revision: summary.revision,
          updatedAt: summary.updatedAt,
          teamId: summary.teamId,
        });
        if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
      })
      .catch((err) => {
        console.warn("Deferred player release apply failed:", err);
      });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && cloudAutoPushPending) {
      flushCloudAutoPush();
    }
    if (document.visibilityState === "visible") {
      const currentUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
      // A player returning from a locked phone needs the coach's most recent
      // release now. This is an ETag probe, so an unchanged release is a
      // small 304 response rather than a full download.
      refreshTeamWorkspaceOnForeground({ force: currentUser?.role === "player", quiet: true });
    }
  });

  window.addEventListener("focus", () => {
    const currentUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    refreshTeamWorkspaceOnForeground({ force: currentUser?.role === "player", quiet: true });
  });

  // iOS commonly resumes an installed web app through the BFCache path,
  // where pageshow is the reliable resume signal. Revalidate immediately;
  // the same shared foreground promise coalesces this with focus/visibility.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    const currentUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    if (currentUser?.role === "player") {
      refreshTeamWorkspaceOnForeground({ force: true, quiet: true });
    }
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      const currentUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
      if (currentUser?.role !== "player") {
        refreshTeamWorkspaceOnForeground({ quiet: true });
      }
    }
  }, TEAM_FOREGROUND_REFRESH_INTERVAL_MS);

  window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const currentUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    if (currentUser?.role === "player") {
      refreshTeamWorkspaceOnForeground({ quiet: true });
    }
  }, PLAYER_RELEASE_REFRESH_INTERVAL_MS);

  window.addEventListener("beforeunload", (e) => {
    if (!canAutoPushCloudBackup() || !hasCloudAutoPushWork()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  window.openCloudSyncModal = openCloudSyncModal;
  window.closeCloudSyncModal = closeCloudSyncModal;
  window.saveCloudSyncSettings = saveCloudSyncSettings;
  window.testCloudSyncConnection = testCloudSyncConnection;
  window.rebuildPlayerRelease = rebuildPlayerRelease;
  window.publishTeamWorkspace = publishTeamWorkspace;
  window.pushCloudBackup = pushCloudBackup;
  window.pullCloudBackup = pullCloudBackup;
  window.applyCloudBackupImmediately = applyCloudBackupImmediately;
  window.buildCanonicalTeamWorkspace = buildCanonicalTeamWorkspace;
  window.getCanonicalTeamWorkspaceKeys = () => Array.from(CANONICAL_TEAM_WORKSPACE_KEYS);
  window.refreshPlayerRelease = refreshPlayerRelease;
  window.refreshPlayerCloudBackup = refreshPlayerCloudBackup;
  window.autoPullLatestCloudBackup = autoPullLatestCloudBackup;
  window.resetCloudSyncAutoPull = resetCloudSyncAutoPull;
  window.getTeamWorkspacePullSummary = getTeamWorkspacePullSummary;
  window.dismissTeamWorkspacePullSummary = dismissTeamWorkspacePullSummary;
  window.getPublishActivityLog = getPublishActivityLog;
  window.getLatestPublishActivity = getLatestPublishActivity;
  window.recordPublishActivity = recordPublishActivity;
  window.queueCloudAutoPush = queueCloudAutoPush;
  window.requestImmediateTeamPublish = requestImmediateTeamPublish;
  window.flushCloudAutoPush = flushCloudAutoPush;
})();
