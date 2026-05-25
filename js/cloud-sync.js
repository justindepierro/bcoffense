(function () {
  const LEGACY_CLOUD_SYNC_TOKEN_KEY = "_bcCloudSyncToken";
  const LEGACY_CLOUD_SYNC_SESSION_TOKEN_KEY = "_bcCloudSyncSessionToken";
  const CLOUD_SYNC_AUTO_PULL_SESSION_KEY = "_bcCloudSyncAutoPullChecked";
  const CLOUD_SYNC_AUTO_PULL_APPLIED_KEY = "_bcCloudSyncAutoPullApplied";
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
    STORAGE_KEYS.PLAY_COLLECTIONS,
    STORAGE_KEYS.CALLSHEET_CONSTRAINTS,
    STORAGE_KEYS.OB_PLAY_RATINGS,
    STORAGE_KEYS.SCHEDULE,
    STORAGE_KEYS.GAME_PLAN_TAGS,
    STORAGE_KEYS.WRISTBAND_SORT_CRITERIA,
    STORAGE_KEYS.WRISTBAND_FAVORITES,
    STORAGE_KEYS.TEAM_ROSTER,
    STORAGE_KEYS.TEAM_NAME,
    STORAGE_KEYS.TEAM_PERSONNEL_PACKAGES,
    STORAGE_KEYS.TEAM_SWAP_GROUPS,
    STORAGE_KEYS.TEAM_ASSIGNMENT_LABELS,
    STORAGE_KEYS.GAME_PLAN_BOARDS,
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

  function getProgressReporter(label) {
    if (typeof createStorageProgressReporter === "function") {
      return createStorageProgressReporter(label);
    }
    return null;
  }

  async function buildCloudBackupPayload(opts = {}) {
    const interactive = opts.interactive !== false;
    const backup = storageManager.getAllData();

    if (window.playImages && typeof window.playImages.exportAll === "function") {
      try {
        if (interactive) showToast("Preparing cloud backup...", { duration: 1200 });
        backup.playImages = await window.playImages.exportAll({
          onProgress: getProgressReporter("Exporting play images"),
        });
      } catch (err) {
        console.warn("Cloud image export failed:", err);
        if (!interactive) {
          throw new Error("Play images could not be included in the cloud autosave.");
        } else {
          const ok = await showConfirm(
            "Play images could not be included in this cloud backup. Push the rest of your data anyway?",
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
        throw new Error("Cloud backup did not include backup data.");
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
        updateCloudSyncModalStatus("Cloudflare sync is ready. No backup has been pushed yet.", "ok");
        renderCloudSyncStatus();
        return;
      }
      saveCloudSyncSettingsObject({
        lastRemoteExportDate: remote.summary.exportDate,
        lastRemoteUpdatedAt: remote.updatedAt,
        lastRemoteSize: remote.size,
      });
      updateCloudSyncModalStatus(
        `Cloud backup found: ${formatCloudDate(remote.summary.exportDate)} (${remote.summary.itemCount} items${remote.summary.imageCount ? `, ${remote.summary.imageCount} images` : ""}).`,
        "ok",
      );
    } catch (err) {
      updateCloudSyncModalStatus(err.message, "error");
      showToast(err.message, { type: "error", duration: 5000 });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  async function reducePayloadIfNeeded(backup, payloadText, payloadSize, opts = {}) {
    const interactive = opts.interactive !== false;
    if (payloadSize <= MAX_KV_BACKUP_BYTES) {
      return { backup, payloadText, payloadSize };
    }

    if (Object.prototype.hasOwnProperty.call(backup, "playImages")) {
      if (interactive) {
        const ok = await showConfirm(
          `This cloud backup is ${storageManager.formatBytes(payloadSize)}, which is larger than Cloudflare KV can store in one item. Push the team data without play images?`,
          {
            title: "Backup Too Large",
            icon: "⚠️",
            confirmText: "Push Without Images",
          },
        );
        if (!ok) {
          throw new Error("Cloud backup was not pushed.");
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
      `Cloud backup is ${storageManager.formatBytes(payloadSize)}. Cloudflare KV supports up to 25 MiB per backup.`,
    );
  }

  async function pushCloudBackupInternal(opts = {}) {
    const silent = opts.silent === true;
    if (!userCanPushCloudBackup()) {
      throw new Error("Only admin can push the team backup.");
    }

    try {
      setCloudSyncBusy(true);
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

      if (!silent) updateCloudSyncModalStatus("Pushing backup to Cloudflare...", "info");
      const data = await cloudSyncRequest("PUT", payloadText);
      const summary = getCloudBackupSummary(backup);
      const nextSettings = saveCloudSyncSettingsObject({
        lastPushAt: new Date().toISOString(),
        lastRemoteExportDate: summary.exportDate,
        lastRemoteUpdatedAt: data.updatedAt || "",
        lastRemoteSize: payloadSize,
      });
      if (!silent) {
        updateCloudSyncModalStatus(
          `Pushed ${summary.itemCount} items${summary.imageCount ? ` and ${summary.imageCount} images` : ""}. Last push: ${formatCloudDate(nextSettings.lastPushAt)}.`,
          "ok",
        );
        showModal(
          `Cloud backup pushed.\n\nSize: ${storageManager.formatBytes(payloadSize)}\nItems: ${summary.itemCount}${summary.imageCount ? `\nImages: ${summary.imageCount}` : ""}`,
          { title: "Cloud Sync", icon: "✅" },
        );
      }
      return { backup, summary, size: payloadSize, updatedAt: data.updatedAt || "" };
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
    const summary = remote.summary;
    if (shouldConfirm) {
      const ok = await showConfirm(
        `This will replace the data on this device with the cloud backup from ${formatCloudDate(summary.exportDate)}.\n\nItems: ${summary.itemCount}${summary.imageCount ? `\nImages: ${summary.imageCount}` : ""}\n\nContinue?`,
        {
          title: "Pull Cloud Backup",
          icon: "☁️",
          confirmText: "Pull Backup",
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
      reloadAppFromStorage();

      if (shouldReload) {
        if (opts.auto) {
          sessionStorage.setItem(
            CLOUD_SYNC_AUTO_PULL_APPLIED_KEY,
            summary.exportDate || remote.updatedAt || new Date().toISOString(),
          );
          location.reload();
          return true;
        }
        if (shouldNotify) {
          await showModal(
            `Cloud backup pulled successfully.${restoredImages ? `\nImages restored: ${restoredImages}` : ""}${imageWarning}\nRefreshing...`,
            { title: "Cloud Sync", icon: "✅" },
          );
        }
        location.reload();
        return true;
      }

      if (shouldNotify) {
        showToast(
          `Cloud backup pulled.${restoredImages ? ` Images restored: ${restoredImages}.` : ""}${imageWarning}`,
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
      updateCloudSyncModalStatus("Fetching cloud backup...", "info");
      const remote = await fetchCloudBackup();
      await restoreCloudBackup(remote);
    } catch (err) {
      updateCloudSyncModalStatus(err.message, "error");
      showToast(err.message, { type: "error", duration: 6000 });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  function renderCloudSyncStatus() {
    const settings = getCloudSyncSettings();
    const statusEl = document.getElementById("cloudSyncStatus");
    if (!statusEl) return;
    if (cloudAutoPushSaving) {
      statusEl.textContent = "Cloud autosave running...";
      statusEl.className = "cloud-sync-status cloud-sync-status-ready";
      return;
    }
    if (cloudAutoPushPending) {
      statusEl.textContent = "Cloud autosave pending...";
      statusEl.className = "cloud-sync-status cloud-sync-status-warn";
      return;
    }
    if (cloudAutoPushLastError) {
      statusEl.textContent = `Cloud autosave failed - ${cloudAutoPushLastError}`;
      statusEl.className = "cloud-sync-status cloud-sync-status-warn";
      return;
    }
    const lastText = settings.lastPushAt
      ? `last push ${formatCloudDate(settings.lastPushAt)}`
      : settings.lastPullAt
        ? `last pull ${formatCloudDate(settings.lastPullAt)}`
        : settings.lastRemoteExportDate
          ? `cloud backup ${formatCloudDate(settings.lastRemoteExportDate)}`
          : "no sync yet";
    statusEl.textContent = `Cloudflare sync ready - ${lastText}`;
    statusEl.className = "cloud-sync-status cloud-sync-status-ready";
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
    if (!shouldAutoPushCloudKey(key)) return false;
    if (!canAutoPushCloudBackup()) return false;

    cloudAutoPushDirtyKeys.add(key);
    cloudAutoPushPending = true;
    cloudAutoPushLastError = "";
    if (!cloudAutoPushFirstQueuedAt) cloudAutoPushFirstQueuedAt = Date.now();

    if (cloudAutoPushSaving) {
      renderCloudSyncStatus();
      return true;
    }

    const age = Date.now() - cloudAutoPushFirstQueuedAt;
    const delay = age >= CLOUD_AUTO_PUSH_MAX_HOLD_MS ? 1000 : CLOUD_AUTO_PUSH_DELAY_MS;
    scheduleCloudAutoPushTimer(delay);
    renderCloudSyncStatus();

    if (reason === "play-images") {
      showToast("Play image changed. Cloud autosave queued.", {
        type: "info",
        duration: 2000,
      });
    }
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
    renderCloudSyncStatus();

    try {
      await pushCloudBackupInternal({ silent: true });
      const moreChangesQueued = cloudAutoPushPending;
      cloudAutoPushLastError = "";
      cloudAutoPushRetryCount = 0;
      if (!moreChangesQueued) {
        cloudAutoPushDirtyKeys.clear();
      } else {
        cloudAutoPushFirstQueuedAt = Date.now();
        scheduleCloudAutoPushTimer(CLOUD_AUTO_PUSH_DELAY_MS);
      }
      showToast("Cloud autosaved", { type: "success", duration: 2200 });
      return true;
    } catch (err) {
      cloudAutoPushPending = true;
      cloudAutoPushLastError = err.message || "Unknown error";
      cloudAutoPushRetryCount += 1;
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
        showToast("Cloud backup available. Open Cloud Sync to pull it onto this admin device.", {
          type: "info",
          duration: 5000,
        });
        return false;
      }

      showToast("Pulling latest cloud backup...", { type: "info", duration: 1500 });
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
          <h3 class="custom-modal-title" id="cloudSyncTitle">Cloud Sync</h3>
        </div>
        <div class="custom-modal-body cloud-sync-body">
          <p>Cloudflare sync is connected. No GitHub token is stored on this device.</p>
          <p class="cloud-sync-warning">${escapeHtml(canPush ? "Admin changes autosave to cloud after a short delay. Any signed-in device can pull the latest backup." : `${roleLabel || "This login"} can pull the latest team backup. Only admin can push changes.`)}</p>
          <div id="cloudSyncModalStatus" class="cloud-sync-modal-status cloud-sync-modal-status-info">
            Cloudflare sync ready. Last cloud backup: ${escapeHtml(formatCloudDate(settings.lastRemoteExportDate || settings.lastPushAt || settings.lastPullAt))}.
          </div>
          <div class="cloud-sync-meta">
            <span>Last push: ${escapeHtml(formatCloudDate(settings.lastPushAt))}</span>
            <span>Last pull: ${escapeHtml(formatCloudDate(settings.lastPullAt))}</span>
            <span>Cloud size: ${escapeHtml(settings.lastRemoteSize ? storageManager.formatBytes(settings.lastRemoteSize) : "unknown")}</span>
          </div>
        </div>
        <div class="custom-modal-actions cloud-sync-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" data-action="closeCloudSyncModal">Close</button>
          <button class="btn btn-secondary custom-modal-btn" data-action="testCloudSyncConnection" data-cloud-sync-action="test">Check</button>
          <button class="btn btn-secondary custom-modal-btn" data-action="pullCloudBackup" data-cloud-sync-action="pull">Pull</button>
          ${canPush ? '<button class="btn btn-primary custom-modal-btn" data-action="pushCloudBackup" data-cloud-sync-action="push" data-auth-admin-only="true">Push</button>' : ""}
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
      showToast(`Latest cloud backup pulled: ${formatCloudDate(applied)}`, {
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
  window.autoPullLatestCloudBackup = autoPullLatestCloudBackup;
  window.resetCloudSyncAutoPull = resetCloudSyncAutoPull;
  window.queueCloudAutoPush = queueCloudAutoPush;
  window.flushCloudAutoPush = flushCloudAutoPush;
})();
