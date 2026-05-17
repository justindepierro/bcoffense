(function () {
  const LEGACY_CLOUD_SYNC_TOKEN_KEY = "_bcCloudSyncToken";
  const LEGACY_CLOUD_SYNC_SESSION_TOKEN_KEY = "_bcCloudSyncSessionToken";
  const MAX_KV_BACKUP_BYTES = 25 * 1024 * 1024;

  const DEFAULT_SETTINGS = {
    provider: "cloudflare-kv",
    lastPushAt: "",
    lastPullAt: "",
    lastRemoteExportDate: "",
    lastRemoteUpdatedAt: "",
    lastRemoteSize: 0,
  };

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

  function getCurrentRoleLabel() {
    if (typeof getCurrentAuthUser !== "function") return "";
    return getCurrentAuthUser()?.label || "";
  }

  function userCanPushCloudBackup() {
    return typeof isAdminUser !== "function" || isAdminUser();
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

  async function buildCloudBackupPayload() {
    const backup = storageManager.getAllData();

    if (window.playImages && typeof window.playImages.exportAll === "function") {
      try {
        showToast("Preparing cloud backup...", { duration: 1200 });
        backup.playImages = await window.playImages.exportAll({
          onProgress: getProgressReporter("Exporting play images"),
        });
      } catch (err) {
        console.warn("Cloud image export failed:", err);
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

  async function reducePayloadIfNeeded(backup, payloadText, payloadSize) {
    if (payloadSize <= MAX_KV_BACKUP_BYTES) {
      return { backup, payloadText, payloadSize };
    }

    if (Object.prototype.hasOwnProperty.call(backup, "playImages")) {
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

  async function pushCloudBackup() {
    try {
      if (!userCanPushCloudBackup()) {
        throw new Error("Only admin can push the team backup.");
      }

      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Preparing local data...", "info");
      let backup = await buildCloudBackupPayload();
      let payloadText = JSON.stringify(backup, null, 2);
      let payloadSize = getPayloadSize(payloadText);
      ({ backup, payloadText, payloadSize } = await reducePayloadIfNeeded(
        backup,
        payloadText,
        payloadSize,
      ));

      updateCloudSyncModalStatus("Pushing backup to Cloudflare...", "info");
      const data = await cloudSyncRequest("PUT", payloadText);
      const summary = getCloudBackupSummary(backup);
      const nextSettings = saveCloudSyncSettingsObject({
        lastPushAt: new Date().toISOString(),
        lastRemoteExportDate: summary.exportDate,
        lastRemoteUpdatedAt: data.updatedAt || "",
        lastRemoteSize: payloadSize,
      });
      updateCloudSyncModalStatus(
        `Pushed ${summary.itemCount} items${summary.imageCount ? ` and ${summary.imageCount} images` : ""}. Last push: ${formatCloudDate(nextSettings.lastPushAt)}.`,
        "ok",
      );
      showModal(
        `Cloud backup pushed.\n\nSize: ${storageManager.formatBytes(payloadSize)}\nItems: ${summary.itemCount}${summary.imageCount ? `\nImages: ${summary.imageCount}` : ""}`,
        { title: "Cloud Sync", icon: "✅" },
      );
    } catch (err) {
      updateCloudSyncModalStatus(err.message, "error");
      showToast(err.message, { type: "error", duration: 6000 });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  async function restoreCloudBackup(remote) {
    const summary = remote.summary;
    const ok = await showConfirm(
      `This will replace the data on this device with the cloud backup from ${formatCloudDate(summary.exportDate)}.\n\nItems: ${summary.itemCount}${summary.imageCount ? `\nImages: ${summary.imageCount}` : ""}\n\nContinue?`,
      {
        title: "Pull Cloud Backup",
        icon: "☁️",
        confirmText: "Pull Backup",
      },
    );
    if (!ok) return false;

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
    await showModal(
      `Cloud backup pulled successfully.${restoredImages ? `\nImages restored: ${restoredImages}` : ""}${imageWarning}\nRefreshing...`,
      { title: "Cloud Sync", icon: "✅" },
    );
    location.reload();
    return true;
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
          <p class="cloud-sync-warning">${escapeHtml(canPush ? "Admin can push the current device backup. Any signed-in device can pull the latest backup." : `${roleLabel || "This login"} can pull the latest team backup. Only admin can push changes.`)}</p>
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
  });

  window.openCloudSyncModal = openCloudSyncModal;
  window.closeCloudSyncModal = closeCloudSyncModal;
  window.saveCloudSyncSettings = saveCloudSyncSettings;
  window.testCloudSyncConnection = testCloudSyncConnection;
  window.pushCloudBackup = pushCloudBackup;
  window.pullCloudBackup = pullCloudBackup;
})();
