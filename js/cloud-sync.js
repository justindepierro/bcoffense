(function () {
  const LEGACY_CLOUD_SYNC_TOKEN_KEY = "_bcCloudSyncToken";
  const LEGACY_CLOUD_SYNC_SESSION_TOKEN_KEY = "_bcCloudSyncSessionToken";
  const CLOUD_SYNC_AUTO_PULL_SESSION_KEY = "_bcCloudSyncAutoPullChecked";
  const CLOUD_SYNC_AUTO_PULL_APPLIED_KEY = "_bcCloudSyncAutoPullApplied";
  const CLOUD_SYNC_PULL_SUMMARY_KEY = "_bcCloudSyncLastPullSummary";
  const MAX_KV_BACKUP_BYTES = 25 * 1024 * 1024;
  const CLOUD_AUTO_PUSH_DELAY_MS = 30000;
  const CLOUD_AUTO_PUSH_MAX_HOLD_MS = 2 * 60 * 1000;
  const CLOUD_AUTO_PUSH_RETRY_MS = 60 * 1000;
  const CLOUD_AUTO_PUSH_MAX_RETRIES = 3;

  const DEFAULT_SETTINGS = {
    provider: "cloudflare-kv",
    lastPushAt: "",
    lastPullAt: "",
    lastRemoteExportDate: "",
    lastRemoteUpdatedAt: "",
    lastRemoteSize: 0,
  };

  const CLOUD_AUTO_PUSH_KEYS = new Set([
    "playImages",
    STORAGE_KEYS.PLAYBOOK,
    STORAGE_KEYS.SAVED_SCRIPTS,
    STORAGE_KEYS.SAVED_WRISTBANDS,
    STORAGE_KEYS.WRISTBAND_TEMPLATES,
    STORAGE_KEYS.SORT_PRESETS,
    STORAGE_KEYS.CUSTOM_SORT_ORDERS,
    STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
    STORAGE_KEYS.PERIOD_TEMPLATES,
    STORAGE_KEYS.SCRIPT_TEMPLATES,
    STORAGE_KEYS.CALL_SHEET,
    STORAGE_KEYS.CALL_SHEET_SETTINGS,
    STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS,
    STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
    STORAGE_KEYS.CALLSHEET_TEMPLATES,
    STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER,
    STORAGE_KEYS.CALLSHEET_NOTES,
    STORAGE_KEYS.CALLSHEET_TARGETS,
    STORAGE_KEYS.DEFENSIVE_TENDENCIES,
    STORAGE_KEYS.TENDENCIES_SETTINGS,
    STORAGE_KEYS.GAME_WEEK,
    STORAGE_KEYS.INSTALLATION,
    STORAGE_KEYS.INSTALLATION_TEMPLATES,
    STORAGE_KEYS.PLAY_COLLECTIONS,
    STORAGE_KEYS.CALLSHEET_CONSTRAINTS,
    STORAGE_KEYS.OB_PLAY_RATINGS,
    STORAGE_KEYS.SCHEDULE,
    STORAGE_KEYS.GAME_PLAN_TAGS,
    STORAGE_KEYS.WRISTBAND_SORT_CRITERIA,
    STORAGE_KEYS.WRISTBAND_FAVORITES,
    STORAGE_KEYS.WRISTBAND_LOGO_CARD,
    STORAGE_KEYS.TEAM_ROSTER,
    STORAGE_KEYS.TEAM_NAME,
    STORAGE_KEYS.TEAM_PERSONNEL_PACKAGES,
    STORAGE_KEYS.TEAM_SWAP_GROUPS,
    STORAGE_KEYS.TEAM_ASSIGNMENT_LABELS,
    STORAGE_KEYS.GAME_PLAN_BOARDS,
    STORAGE_KEYS.GAME_PLAN_SNAPSHOTS,
    STORAGE_KEYS.GAME_PLAN_TEMPLATES,
  ]);

  let cloudAutoPushTimer = null;
  let cloudAutoPushFirstQueuedAt = 0;
  let cloudAutoPushPending = false;
  let cloudAutoPushSaving = false;
  let cloudAutoPushLastError = "";
  let cloudAutoPushRetryCount = 0;
  let cloudAutoPushSuppress = false;
  const cloudAutoPushDirtyKeys = new Set();

  function _cloudQueueJob(channel, id, opts = {}) {
    if (typeof window.queueWorkspaceSyncJob !== "function") return "";
    return window.queueWorkspaceSyncJob(channel, id, {
      retry: () => flushCloudAutoPush(),
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
        retry: () => flushCloudAutoPush(),
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
    };
  }

  function saveCloudSyncSettingsObject(settings = {}) {
    const safeSettings = {
      ...getCloudSyncSettings(),
      ...(settings || {}),
      provider: "cloudflare-kv",
    };
    safeSettings.lastRemoteSize = Number(safeSettings.lastRemoteSize || 0) || 0;
    storageManager.set(STORAGE_KEYS.CLOUD_SYNC_SETTINGS, safeSettings);
    renderCloudSyncStatus();
    return safeSettings;
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
        detail: "A local save, cloud push, media upload, or player update has not finished.",
        timestamp: Date.now(),
      });
    }
    if (cloudAutoPushPending || cloudAutoPushSaving || cloudAutoPushDirtyKeys.size > 0) {
      const labels = getDirtyCloudKeyLabels();
      risks.push({
        label: "Cloud autosave pending",
        detail: labels.length
          ? `Waiting to push ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? ", and more" : ""}.`
          : "Waiting to finish pushing this device to cloud.",
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
    return typeof isAdminUser !== "function" || isAdminUser();
  }

  function canAutoPushCloudBackup() {
    return typeof isAdminUser === "function" && isAdminUser();
  }

  function hasLocalTeamData() {
    return Object.values(STORAGE_KEYS).some(
      (key) =>
        key !== STORAGE_KEYS.CLOUD_SYNC_SETTINGS &&
        localStorage.getItem(key) !== null,
    );
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
    const backup = await storageManager.getAllData();

    if (window.playImages && typeof window.playImages.exportAll === "function") {
      try {
        if (interactive) showToast("Preparing team workspace...", { duration: 1200 });
        backup.playImages = await window.playImages.exportAll({
          onProgress: getProgressReporter("Exporting play images"),
        });
      } catch (err) {
        console.warn("Cloud image export failed:", err);
        if (!interactive) {
          throw new Error("Play images could not be included in the cloud autosave.");
        } else {
          const ok = await showConfirm(
            "Play images could not be included in this workspace push. Push the rest of your data anyway?",
            {
              title: "Image Export Failed",
              icon: "⚠️",
              confirmText: "Push Without Images",
            },
          );
          if (!ok) throw err;
        }
      }
    }

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

  async function cloudSyncRequest(method, bodyText = "") {
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
      const err = new Error(data.error || `Cloud sync failed with ${response.status}`);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function fetchCloudBackup(opts = {}) {
    try {
      const data = await cloudSyncRequest("GET");
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

  function saveCloudSyncSettings(opts = {}) {
    saveCloudSyncSettingsObject();
    if (!opts.quiet) showToast("Cloud sync settings saved", { type: "success" });
  }

  async function testCloudSyncConnection() {
    try {
      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Checking Cloudflare sync...", "info");
      const remote = await fetchCloudBackup({ allowMissing: true });
      if (!remote) {
        updateCloudSyncModalStatus("Cloudflare sync is ready. No team workspace has been pushed yet.", "ok");
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

  function formatDiagramSyncSummary(result) {
    if (!result) return "";
    return `Player-visible diagrams: ${Number(result.pushed || 0)} pushed, ${Number(result.skipped || 0)} skipped, ${Number(result.failed || 0)} failed.`;
  }

  function formatDiagramSyncDetails(result) {
    if (!result || !Array.isArray(result.errors) || !result.errors.length) return "";
    return result.errors
      .slice(0, 5)
      .map((item) => {
        const sig = item.sig ? `${item.sig}: ` : "";
        const status = item.status ? `${item.status}: ` : "";
        return `- ${sig}${status}${item.error || "Unknown diagram sync issue."}`;
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
          `This team workspace is ${storageManager.formatBytes(payloadSize)}, which is larger than Cloudflare KV can store in one item. Push the team data without play images?`,
          {
            title: "Backup Too Large",
            icon: "⚠️",
            confirmText: "Push Without Images",
          },
        );
        if (!ok) {
          throw new Error("Team workspace was not pushed.");
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
      `Team workspace is ${storageManager.formatBytes(payloadSize)}. Cloudflare KV supports up to 25 MiB per item.`,
    );
  }

  async function pushCloudBackupInternal(opts = {}) {
    const silent = opts.silent === true;
    if (!userCanPushCloudBackup()) {
      throw new Error("Only admin can push the team workspace.");
    }

    try {
      setCloudSyncBusy(true);
      let diagramSyncResult = null;
      if (!silent) updateCloudSyncModalStatus("Preparing local data...", "info");
      let backup = await buildCloudBackupPayload({ interactive: !silent });
      let payloadText = JSON.stringify(backup, null, 2);
      let payloadSize = getPayloadSize(payloadText);
      ({ backup, payloadText, payloadSize } = await reducePayloadIfNeeded(
        backup,
        payloadText,
        payloadSize,
        { interactive: !silent },
      ));

      if (!silent) updateCloudSyncModalStatus("Pushing team workspace to Cloudflare...", "info");
      const data = await cloudSyncRequest("PUT", payloadText);
      const summary = getCloudBackupSummary(backup);
      const nextSettings = saveCloudSyncSettingsObject({
        lastPushAt: new Date().toISOString(),
        lastRemoteExportDate: summary.exportDate,
        lastRemoteUpdatedAt: data.updatedAt || "",
        lastRemoteSize: payloadSize,
      });
      // Also push play images to R2 so players can access diagrams cross-device.
      if (window.playImages && typeof window.playImages.syncToRemote === "function") {
        const _playsRef = typeof plays !== "undefined" ? plays : [];
        if (!silent) {
          updateCloudSyncModalStatus("Backup pushed. Syncing diagrams to player devices...", "info");
          diagramSyncResult = await window.playImages.syncToRemote(_playsRef);
        } else {
          // Auto-push should never block the app; report issues to the console.
          window.playImages.syncToRemote(_playsRef).then((result) => {
            if (result && (result.failed || result.skipped)) {
              console.warn("Cloud backup completed, but diagram sync had issues:", result);
            }
          }).catch((err) => {
            console.warn("Cloud backup completed, but diagram sync failed:", err);
          });
        }
      }
      if (!silent) {
        const diagramLine = formatDiagramSyncSummary(diagramSyncResult);
        const modalDetails = formatDiagramSyncDetails(diagramSyncResult);
        updateCloudSyncModalStatus(
          `Pushed ${summary.itemCount} items${summary.imageCount ? ` and ${summary.imageCount} diagram entries` : ""}.${diagramLine ? ` ${diagramLine}` : ""} Last push: ${formatCloudDate(nextSettings.lastPushAt)}.`,
          diagramSyncResult && (diagramSyncResult.failed || diagramSyncResult.skipped) ? "warning" : "ok",
        );
        showModal(
          `Team workspace pushed.\n\nSize: ${storageManager.formatBytes(payloadSize)}\nItems: ${summary.itemCount}${summary.imageCount ? `\nDiagram entries: ${summary.imageCount}` : ""}${diagramLine ? `\n${diagramLine}` : ""}${modalDetails ? `\n\nDiagram issues:\n${modalDetails}` : ""}`,
          {
            title: diagramSyncResult && (diagramSyncResult.failed || diagramSyncResult.skipped)
              ? "Team Workspace Sync Needs Review"
              : "Team Workspace Sync Complete",
            icon: diagramSyncResult && (diagramSyncResult.failed || diagramSyncResult.skipped) ? "⚠️" : "✅",
          },
        );
      }
      return { backup, summary, size: payloadSize, updatedAt: data.updatedAt || "", diagramSyncResult };
    } finally {
      setCloudSyncBusy(false);
    }
  }

  async function pushCloudBackup() {
    try {
      const result = await pushCloudBackupInternal({ silent: false });
      cloudAutoPushPending = false;
      cloudAutoPushLastError = "";
      cloudAutoPushRetryCount = 0;
      cloudAutoPushDirtyKeys.clear();
      renderCloudSyncStatus();
      return result;
    } catch (err) {
      updateCloudSyncModalStatus(err.message, "error");
      showToast(err.message, { type: "error", duration: 6000 });
      return null;
    }
  }

  async function restoreCloudBackup(remote, opts = {}) {
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
    const summary = remote.summary;
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
        ? `\n\nLocal work to review before pulling:\n${riskLines}${overflowLine}\n\nPulling anyway will replace this device's local workspace. Push this device first if those changes should be kept.`
        : "";
      const ok = await showConfirm(
        `Pull the team workspace from ${formatCloudDate(summary.exportDate)} onto this device?\n\nThis refreshes local practice data with the latest cloud workspace.\n\nItems: ${summary.itemCount}${summary.imageCount ? `\nDiagrams in backup: ${summary.imageCount}` : ""}${riskText}\n\nContinue?`,
        {
          title: pullRisks.hasRisk ? "Review Local Work Before Pull" : "Pull Team Workspace",
          icon: pullRisks.hasRisk ? "⚠️" : "☁️",
          confirmText: pullRisks.hasRisk ? "Pull Anyway" : "Pull Workspace",
          danger: pullRisks.hasRisk,
        },
      );
      if (!ok) return false;
    }

    cloudAutoPushSuppress = true;
    try {
      if (!(await storageManager.restoreAllData(remote.backup, { confirmOverwrite: false }))) {
        return false;
      }

      let restoredImages = 0;
      let imageWarning = "";
      if (Object.prototype.hasOwnProperty.call(remote.backup, "playImages")) {
        if (window.playImages && typeof window.playImages.importAll === "function") {
          try {
            restoredImages = await window.playImages.importAll(remote.backup.playImages || {}, {
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

      saveCloudSyncSettingsObject({
        lastPullAt: new Date().toISOString(),
        lastRemoteExportDate: summary.exportDate,
        lastRemoteUpdatedAt: remote.updatedAt,
        lastRemoteSize: remote.size,
      });
      saveTeamWorkspacePullSummary(remote, { restoredImages, imageWarning });
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
          await showModal(
            `Team workspace pulled successfully.${restoredImages ? `\nDiagrams restored: ${restoredImages}` : ""}${imageWarning}\nDashboard has the review summary.`,
            { title: "Team Workspace Sync", icon: "✅" },
          );
        }
        return true;
      }

      if (shouldNotify) {
        showToast(
          `Team workspace pulled.${restoredImages ? ` Diagrams restored: ${restoredImages}.` : ""}${imageWarning}`,
          { type: "success", duration: 4000 },
        );
      }
      return true;
    } finally {
      cloudAutoPushSuppress = false;
    }
  }

  async function pullCloudBackup() {
    try {
      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Fetching team workspace...", "info");
      const currentUser =
        typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
      if (currentUser?.role === "player") {
        const result = await refreshPlayerCloudBackup({ navigate: true });
        closeCloudSyncModal();
        if (result?.ok) {
          showToast("Team data refreshed. Opening Home.", {
            type: "success",
            duration: 3000,
          });
        } else {
          showToast(result?.message || "Team data could not be refreshed.", {
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

  async function refreshPlayerCloudBackup(opts = {}) {
    const remote = await fetchCloudBackup({ allowMissing: true });
    if (!remote) {
      return {
        ok: false,
        status: "missing",
        message: "No team workspace has been pushed yet.",
      };
    }
    if (opts.skipIfCurrent !== false && isCloudRemoteAlreadyKnown(remote)) {
      saveCloudSyncSettingsObject({
        lastRemoteExportDate: remote.summary?.exportDate || "",
        lastRemoteUpdatedAt: remote.updatedAt || "",
        lastRemoteSize: remote.size,
      });
      return {
        ok: true,
        status: "current",
        exportDate: remote.summary?.exportDate || "",
        updatedAt: remote.updatedAt || "",
        itemCount: remote.summary?.itemCount || 0,
        imageCount: remote.summary?.imageCount || 0,
        message: `Team data is current from ${formatCloudDate(remote.summary?.exportDate || remote.updatedAt)}.`,
      };
    }
    const restored = await restoreCloudBackup(remote, {
      confirm: false,
      reload: false,
      notify: false,
      navigate: opts.navigate !== false,
      targetTab: "dashboard",
    });
    if (!restored) {
      return {
        ok: false,
        status: "restore-failed",
        message: "Team data could not be refreshed.",
      };
    }
    return {
      ok: true,
      status: "refreshed",
      exportDate: remote.summary?.exportDate || "",
      updatedAt: remote.updatedAt || "",
      itemCount: remote.summary?.itemCount || 0,
      imageCount: remote.summary?.imageCount || 0,
      message: `Team data refreshed from ${formatCloudDate(remote.summary?.exportDate || remote.updatedAt)}.`,
    };
  }

  function renderCloudSyncStatus() {
    const settings = getCloudSyncSettings();
    const statusEl = document.getElementById("cloudSyncStatus");
    if (!statusEl) return;
    if (cloudAutoPushSaving) {
      statusEl.textContent = "Cloud autosave running...";
      statusEl.className = "cloud-sync-status cloud-sync-status-ready";
      if (typeof window.setWorkspaceSyncStatus === "function") {
        window.setWorkspaceSyncStatus("cloud", "syncing", { label: "Syncing team cloud..." });
      }
      return;
    }
    if (cloudAutoPushLastError) {
      statusEl.textContent = `Cloud autosave failed - ${cloudAutoPushLastError}`;
      statusEl.className = "cloud-sync-status cloud-sync-status-warn";
      if (typeof window.setWorkspaceSyncStatus === "function") {
        window.setWorkspaceSyncStatus("cloud", "error", { label: "Cloud sync needs attention" });
      }
      return;
    }
    if (cloudAutoPushPending) {
      statusEl.textContent = "Cloud autosave pending...";
      statusEl.className = "cloud-sync-status cloud-sync-status-warn";
      if (typeof window.setWorkspaceSyncStatus === "function") {
        window.setWorkspaceSyncStatus("cloud", "queued", { label: "Cloud sync queued" });
      }
      return;
    }
    const lastText = settings.lastPushAt
      ? `last push ${formatCloudDate(settings.lastPushAt)}`
      : settings.lastPullAt
        ? `last pull ${formatCloudDate(settings.lastPullAt)}`
        : settings.lastRemoteExportDate
          ? `cloud workspace ${formatCloudDate(settings.lastRemoteExportDate)}`
          : "no sync yet";
    statusEl.textContent = `Cloudflare sync ready - ${lastText}`;
    statusEl.className = "cloud-sync-status cloud-sync-status-ready";
    if (typeof window.setWorkspaceSyncStatus === "function") {
      window.setWorkspaceSyncStatus("cloud", "synced", { label: "Team cloud synced" });
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
      queuedLabel: "Cloud sync queued",
      runningLabel: "Syncing team cloud...",
      doneLabel: "Team cloud synced",
      errorLabel: "Cloud sync needs attention",
    });
    if (key === "playImages") {
      _cloudQueueJob("media", "auto-push", {
        queuedLabel: "Media upload queued",
        runningLabel: "Uploading media...",
        doneLabel: "Media published",
        errorLabel: "Media upload needs retry",
      });
    }
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

  async function flushCloudAutoPush() {
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
    const syncingMedia = cloudAutoPushDirtyKeys.has("playImages");
    const cloudJobKey = _cloudQueueJob("cloud", "auto-push", {
      queuedLabel: "Cloud sync queued",
      runningLabel: "Syncing team cloud...",
      doneLabel: "Team cloud synced",
      errorLabel: "Cloud sync needs attention",
    });
    const mediaJobKey = syncingMedia
      ? _cloudQueueJob("media", "auto-push", {
        queuedLabel: "Media upload queued",
        runningLabel: "Uploading media...",
        doneLabel: "Media published",
        errorLabel: "Media upload needs retry",
      })
      : "";
    _cloudStartJob(cloudJobKey, { label: "Syncing team cloud..." });
    _cloudStartJob(mediaJobKey, { label: "Uploading media..." });
    renderCloudSyncStatus();

    try {
      await pushCloudBackupInternal({ silent: true });
      const moreChangesQueued = cloudAutoPushPending;
      cloudAutoPushLastError = "";
      cloudAutoPushRetryCount = 0;
      _cloudCompleteJob(cloudJobKey, { label: "Team cloud synced" });
      if (!moreChangesQueued) {
        cloudAutoPushDirtyKeys.clear();
        _cloudCompleteJob(mediaJobKey, { label: "Media published" });
      } else {
        cloudAutoPushFirstQueuedAt = Date.now();
        scheduleCloudAutoPushTimer(CLOUD_AUTO_PUSH_DELAY_MS);
      }
      return true;
    } catch (err) {
      cloudAutoPushPending = true;
      cloudAutoPushLastError = err.message || "Unknown error";
      cloudAutoPushRetryCount += 1;
      _cloudFailJob(cloudJobKey, err, { label: "Cloud sync needs attention" });
      _cloudFailJob(mediaJobKey, err, { label: "Media upload needs retry" });
      showToast(`Cloud autosave failed: ${cloudAutoPushLastError}`, {
        type: "warning",
        duration: 6000,
      });
      if (cloudAutoPushRetryCount <= CLOUD_AUTO_PUSH_MAX_RETRIES) {
        cloudAutoPushFirstQueuedAt = Date.now();
        scheduleCloudAutoPushTimer(CLOUD_AUTO_PUSH_RETRY_MS);
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

  async function autoPullLatestCloudBackup() {
    if (sessionStorage.getItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY) === "1") return false;
    sessionStorage.setItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY, "1");

    const currentUser =
      typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    if (!currentUser) return false;

    try {
      const remote = await fetchCloudBackup({ allowMissing: true });
      if (!remote) return false;

      const settings = getCloudSyncSettings();
      const remoteTime = getCloudTime(remote.summary.exportDate || remote.updatedAt);
      const knownTime = getCloudTime(
        settings.lastRemoteExportDate ||
        settings.lastPullAt ||
        settings.lastPushAt,
      );

      if (!Number.isFinite(remoteTime)) return false;
      if (Number.isFinite(knownTime) && remoteTime <= knownTime + 500) {
        saveCloudSyncSettingsObject({
          lastRemoteExportDate: remote.summary.exportDate,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastRemoteSize: remote.size,
        });
        return false;
      }

      if (
        currentUser.role === "admin" &&
        !Number.isFinite(knownTime) &&
        hasLocalTeamData()
      ) {
        showToast("Team workspace update available. Open Team Workspace Sync to pull it onto this admin device.", {
          type: "info",
          duration: 5000,
        });
        return false;
      }

      showToast("Pulling latest team workspace...", { type: "info", duration: 1500 });
      return restoreCloudBackup(remote, {
        auto: true,
        confirm: false,
        notify: false,
      });
    } catch (err) {
      console.warn("Cloud auto-pull failed:", err);
      if (err.status !== 401 && err.status !== 404) {
        showToast(`Cloud auto-pull failed: ${err.message}`, {
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
    const existing = document.getElementById("cloudSyncOverlay");
    if (existing) existing.remove();

    const settings = getCloudSyncSettings();
    const canPush = userCanPushCloudBackup();
    const roleLabel = getCurrentRoleLabel();
    const overlay = document.createElement("div");
    overlay.id = "cloudSyncOverlay";
    overlay.className = "custom-modal-overlay cloud-sync-overlay";
    overlay.setAttribute("data-action", "closeCloudSyncModalOverlay");
    overlay.innerHTML = `
      <div class="custom-modal custom-modal-wide cloud-sync-modal" role="dialog" aria-modal="true" aria-labelledby="cloudSyncTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">☁️</span>
          <h3 class="custom-modal-title" id="cloudSyncTitle">Team Workspace Sync</h3>
        </div>
        <div class="custom-modal-body cloud-sync-body">
          <p>Cloudflare sync is connected. This keeps team workspace data available across coach and player devices.</p>
          <div class="cloud-sync-flow-grid" aria-label="Team workspace sync actions">
            <div class="cloud-sync-flow-card">
              <span>Push</span>
              <strong>Send this device to cloud</strong>
              <small>${escapeHtml(canPush ? "Publishes playbook, scripts, team tools, and player-visible diagrams." : "Only admins can push workspace changes.")}</small>
            </div>
            <div class="cloud-sync-flow-card">
              <span>Pull</span>
              <strong>Refresh this device</strong>
              <small>${escapeHtml(`${roleLabel || "This login"} can pull the latest cloud workspace onto this device.`)}</small>
            </div>
            <div class="cloud-sync-flow-card">
              <span>Last updated</span>
              <strong>${escapeHtml(formatCloudDate(settings.lastRemoteExportDate || settings.lastPushAt || settings.lastPullAt))}</strong>
              <small>${escapeHtml(settings.lastRemoteSize ? storageManager.formatBytes(settings.lastRemoteSize) : "Cloud size unknown")}</small>
            </div>
          </div>
          <p class="cloud-sync-warning">${escapeHtml(canPush ? "Pull refreshes this device with the latest cloud workspace. Push sends this device's current workspace to the team cloud." : "Pull refreshes this device with the latest team workspace. Ask an admin to push new team changes.")}</p>
          <div id="cloudSyncModalStatus" class="cloud-sync-modal-status cloud-sync-modal-status-info">
            Team workspace sync ready. Last cloud update: ${escapeHtml(formatCloudDate(settings.lastRemoteExportDate || settings.lastPushAt || settings.lastPullAt))}.
          </div>
          <div class="cloud-sync-meta">
            <span>Last push: ${escapeHtml(formatCloudDate(settings.lastPushAt))}</span>
            <span>Last pull: ${escapeHtml(formatCloudDate(settings.lastPullAt))}</span>
            <span>Cloud size: ${escapeHtml(settings.lastRemoteSize ? storageManager.formatBytes(settings.lastRemoteSize) : "unknown")}</span>
          </div>
        </div>
        <div class="custom-modal-actions cloud-sync-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel" data-action="closeCloudSyncModal">Close</button>
          <button type="button" class="btn btn-secondary custom-modal-btn" data-action="testCloudSyncConnection" data-cloud-sync-action="test">Check Cloud</button>
          <button type="button" class="btn btn-secondary custom-modal-btn" data-action="pullCloudBackup" data-cloud-sync-action="pull">Pull Workspace</button>
          ${canPush ? '<button type="button" class="btn btn-primary custom-modal-btn" data-action="pushCloudBackup" data-cloud-sync-action="push" data-auth-admin-only="true">Push Workspace</button>' : ""}
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
      showToast(`Latest team workspace pulled: ${formatCloudDate(applied)}`, {
        type: "success",
        duration: 4000,
      });
    }
  });

  window.addEventListener("play-images-changed", () => {
    queueCloudAutoPush("playImages", "play-images");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && cloudAutoPushPending) {
      flushCloudAutoPush();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (!canAutoPushCloudBackup() || !hasCloudAutoPushWork()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  window.openCloudSyncModal = openCloudSyncModal;
  window.closeCloudSyncModal = closeCloudSyncModal;
  window.saveCloudSyncSettings = saveCloudSyncSettings;
  window.testCloudSyncConnection = testCloudSyncConnection;
  window.pushCloudBackup = pushCloudBackup;
  window.pullCloudBackup = pullCloudBackup;
  window.refreshPlayerCloudBackup = refreshPlayerCloudBackup;
  window.autoPullLatestCloudBackup = autoPullLatestCloudBackup;
  window.resetCloudSyncAutoPull = resetCloudSyncAutoPull;
  window.getTeamWorkspacePullSummary = getTeamWorkspacePullSummary;
  window.dismissTeamWorkspacePullSummary = dismissTeamWorkspacePullSummary;
  window.queueCloudAutoPush = queueCloudAutoPush;
  window.flushCloudAutoPush = flushCloudAutoPush;
})();
