(function () {
  const CLOUD_SYNC_TOKEN_KEY = "_bcCloudSyncToken";
  const CLOUD_SYNC_SESSION_TOKEN_KEY = "_bcCloudSyncSessionToken";
  const CLOUD_SYNC_AUTO_PULL_SESSION_KEY = "_bcCloudSyncAutoPullChecked";

  const DEFAULT_SETTINGS = {
    provider: "github",
    repoFullName: "justindepierro/bcoffense-sync",
    branch: "main",
    path: "backup.json",
    autoPullOnStartup: false,
    lastPushAt: "",
    lastPullAt: "",
    lastRemoteExportDate: "",
    lastRemoteSha: "",
  };

  function getCloudSyncSettings() {
    const stored = storageManager.get(STORAGE_KEYS.CLOUD_SYNC_SETTINGS, {});
    const next = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === "object" ? stored : {}) };
    next.provider = "github";
    next.repoFullName = String(next.repoFullName || DEFAULT_SETTINGS.repoFullName).trim();
    next.branch = String(next.branch || "main").trim() || "main";
    next.path = normalizeCloudPath(next.path || DEFAULT_SETTINGS.path);
    next.autoPullOnStartup = Boolean(next.autoPullOnStartup);
    return next;
  }

  function saveCloudSyncSettingsObject(settings) {
    const safeSettings = { ...getCloudSyncSettings(), ...(settings || {}) };
    safeSettings.provider = "github";
    safeSettings.repoFullName = String(safeSettings.repoFullName || DEFAULT_SETTINGS.repoFullName).trim();
    safeSettings.branch = String(safeSettings.branch || "main").trim() || "main";
    safeSettings.path = normalizeCloudPath(safeSettings.path || DEFAULT_SETTINGS.path);
    safeSettings.autoPullOnStartup = Boolean(safeSettings.autoPullOnStartup);
    storageManager.set(STORAGE_KEYS.CLOUD_SYNC_SETTINGS, safeSettings);
    renderCloudSyncStatus();
    return safeSettings;
  }

  function normalizeCloudPath(value) {
    return String(value || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/{2,}/g, "/") || DEFAULT_SETTINGS.path;
  }

  function getCloudSyncToken() {
    return (
      sessionStorage.getItem(CLOUD_SYNC_SESSION_TOKEN_KEY) ||
      localStorage.getItem(CLOUD_SYNC_TOKEN_KEY) ||
      ""
    );
  }

  function hasRememberedCloudSyncToken() {
    return Boolean(localStorage.getItem(CLOUD_SYNC_TOKEN_KEY));
  }

  function setCloudSyncToken(token, remember) {
    const cleanToken = String(token || "").trim();
    if (!cleanToken) return;
    if (remember) {
      localStorage.setItem(CLOUD_SYNC_TOKEN_KEY, cleanToken);
      sessionStorage.removeItem(CLOUD_SYNC_SESSION_TOKEN_KEY);
    } else {
      sessionStorage.setItem(CLOUD_SYNC_SESSION_TOKEN_KEY, cleanToken);
      localStorage.removeItem(CLOUD_SYNC_TOKEN_KEY);
    }
  }

  function clearCloudSyncToken() {
    localStorage.removeItem(CLOUD_SYNC_TOKEN_KEY);
    sessionStorage.removeItem(CLOUD_SYNC_SESSION_TOKEN_KEY);
    updateCloudSyncModalStatus("Token cleared. Add a token before pushing or pulling private data.", "warn");
    renderCloudSyncStatus();
    showToast("Cloud sync token cleared", { type: "info" });
  }

  function parseRepoFullName(repoFullName) {
    const clean = String(repoFullName || "").trim();
    const parts = clean.split("/").map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 2) {
      throw new Error("Enter a GitHub repo as owner/repo.");
    }
    return { owner: parts[0], repo: parts[1] };
  }

  function encodeGitHubPath(path) {
    return normalizeCloudPath(path)
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  function getGitHubUrls(settings) {
    const { owner, repo } = parseRepoFullName(settings.repoFullName);
    const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const contentsPath = encodeGitHubPath(settings.path);
    return {
      repo: apiBase,
      contents: `${apiBase}/contents/${contentsPath}`,
      contentsWithRef: `${apiBase}/contents/${contentsPath}?ref=${encodeURIComponent(settings.branch)}`,
    };
  }

  async function githubRequest(url, opts = {}) {
    const token = getCloudSyncToken();
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.requireToken && !token) {
      throw new Error("Add a GitHub token before pushing cloud data.");
    }

    const response = await fetch(url, {
      ...opts,
      headers,
    });
    const raw = await response.text();
    const body = raw ? safeJSONParse(raw, null) || raw : null;
    if (!response.ok) {
      const message =
        body && typeof body === "object" && body.message
          ? body.message
          : `GitHub request failed with ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  function encodeBase64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function decodeBase64Utf8(text) {
    const clean = String(text || "").replace(/\s/g, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
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

  async function fetchCloudBackup(settings, opts = {}) {
    const urls = getGitHubUrls(settings);
    try {
      const file = await githubRequest(urls.contentsWithRef);
      if (!file || typeof file.content !== "string") {
        throw new Error("Cloud backup file did not include content.");
      }
      const backup = safeJSONParse(decodeBase64Utf8(file.content), null);
      if (!backup) {
        throw new Error("Cloud backup file is not valid JSON.");
      }
      const summary = getCloudBackupSummary(backup);
      if (!summary.valid) {
        throw new Error(summary.errors.join(" "));
      }
      return {
        backup,
        summary,
        sha: file.sha || "",
        size: file.size || 0,
        htmlUrl: file.html_url || "",
      };
    } catch (err) {
      if (opts.allowMissing && err.status === 404) return null;
      throw err;
    }
  }

  function readCloudSyncForm() {
    const current = getCloudSyncSettings();
    const repoEl = document.getElementById("cloudSyncRepo");
    const branchEl = document.getElementById("cloudSyncBranch");
    const pathEl = document.getElementById("cloudSyncPath");
    const tokenEl = document.getElementById("cloudSyncToken");
    const rememberEl = document.getElementById("cloudSyncRememberToken");
    const autoPullEl = document.getElementById("cloudSyncAutoPull");

    return {
      settings: {
        repoFullName: repoEl ? repoEl.value : current.repoFullName,
        branch: branchEl ? branchEl.value : current.branch,
        path: pathEl ? pathEl.value : current.path,
        autoPullOnStartup: autoPullEl ? Boolean(autoPullEl.checked) : current.autoPullOnStartup,
      },
      token: tokenEl ? tokenEl.value : "",
      rememberToken: Boolean(rememberEl?.checked),
    };
  }

  function saveCloudSyncSettings(opts = {}) {
    const form = readCloudSyncForm();
    const settings = saveCloudSyncSettingsObject(form.settings);
    if (form.token) setCloudSyncToken(form.token, form.rememberToken);
    const tokenEl = document.getElementById("cloudSyncToken");
    if (tokenEl) tokenEl.value = "";
    updateCloudSyncModalStatus(
      `Saved ${settings.repoFullName || "repo setup"}/${settings.path}.`,
      "ok",
    );
    if (!opts.quiet) showToast("Cloud sync settings saved", { type: "success" });
  }

  function setCloudSyncBusy(isBusy) {
    document.querySelectorAll("[data-cloud-sync-action]").forEach((el) => {
      el.disabled = Boolean(isBusy);
    });
  }

  function updateCloudSyncModalStatus(message, tone = "info") {
    const el = document.getElementById("cloudSyncModalStatus");
    if (!el) return;
    el.className = `cloud-sync-modal-status cloud-sync-modal-status-${tone}`;
    el.textContent = message;
  }

  async function testCloudSyncConnection() {
    try {
      saveCloudSyncSettings({ quiet: true });
      const settings = getCloudSyncSettings();
      const urls = getGitHubUrls(settings);
      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Checking GitHub connection...", "info");
      await githubRequest(urls.repo);
      const remote = await fetchCloudBackup(settings, { allowMissing: true });
      if (!remote) {
        updateCloudSyncModalStatus("Connected. No backup file exists yet; Push will create it.", "ok");
        return;
      }
      saveCloudSyncSettingsObject({
        ...settings,
        lastRemoteSha: remote.sha,
        lastRemoteExportDate: remote.summary.exportDate,
      });
      updateCloudSyncModalStatus(
        `Connected. Remote backup: ${formatCloudDate(remote.summary.exportDate)} (${remote.summary.itemCount} items${remote.summary.imageCount ? `, ${remote.summary.imageCount} images` : ""}).`,
        "ok",
      );
    } catch (err) {
      updateCloudSyncModalStatus(err.message, "error");
      showToast(err.message, { type: "error", duration: 5000 });
    } finally {
      setCloudSyncBusy(false);
    }
  }

  async function pushCloudBackup() {
    try {
      saveCloudSyncSettings({ quiet: true });
      const settings = getCloudSyncSettings();
      getGitHubUrls(settings);
      if (!getCloudSyncToken()) {
        throw new Error("Add a GitHub token before pushing cloud data.");
      }

      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Preparing local data...", "info");
      const backup = await buildCloudBackupPayload();
      const payload = JSON.stringify(backup, null, 2);
      const payloadSize = new Blob([payload]).size;
      if (payloadSize > 25 * 1024 * 1024) {
        const ok = await showConfirm(
          `This cloud backup is ${storageManager.formatBytes(payloadSize)}. Large image backups can take a while to push. Continue?`,
          {
            title: "Large Cloud Backup",
            icon: "⚠️",
            confirmText: "Push Backup",
          },
        );
        if (!ok) return;
      }

      updateCloudSyncModalStatus("Checking remote backup...", "info");
      const remote = await fetchCloudBackup(settings, { allowMissing: true });
      const urls = getGitHubUrls(settings);
      const body = {
        message: `chore: update BCOffense cloud backup ${new Date().toISOString()}`,
        content: encodeBase64Utf8(payload),
        branch: settings.branch,
      };
      if (remote?.sha) body.sha = remote.sha;

      updateCloudSyncModalStatus("Pushing backup to GitHub...", "info");
      const result = await githubRequest(urls.contents, {
        method: "PUT",
        requireToken: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const nextSettings = saveCloudSyncSettingsObject({
        ...settings,
        lastPushAt: new Date().toISOString(),
        lastRemoteSha: result?.content?.sha || remote?.sha || "",
        lastRemoteExportDate: backup.exportDate || "",
      });
      const summary = getCloudBackupSummary(backup);
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

    const settings = getCloudSyncSettings();
    saveCloudSyncSettingsObject({
      ...settings,
      lastPullAt: new Date().toISOString(),
      lastRemoteSha: remote.sha,
      lastRemoteExportDate: summary.exportDate,
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
      saveCloudSyncSettings({ quiet: true });
      const settings = getCloudSyncSettings();
      setCloudSyncBusy(true);
      updateCloudSyncModalStatus("Fetching cloud backup...", "info");
      const remote = await fetchCloudBackup(settings);
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
    if (!settings.repoFullName) {
      statusEl.textContent = "Not connected";
      statusEl.className = "cloud-sync-status cloud-sync-status-muted";
      return;
    }
    const tokenText = getCloudSyncToken() ? "token ready" : "token needed";
    const lastText = settings.lastPushAt
      ? `last push ${formatCloudDate(settings.lastPushAt)}`
      : settings.lastPullAt
        ? `last pull ${formatCloudDate(settings.lastPullAt)}`
        : "no sync yet";
    statusEl.textContent = `${settings.repoFullName}/${settings.path} - ${tokenText}, ${lastText}`;
    statusEl.className = getCloudSyncToken()
      ? "cloud-sync-status cloud-sync-status-ready"
      : "cloud-sync-status cloud-sync-status-warn";
  }

  function openCloudSyncModal() {
    const existing = document.getElementById("cloudSyncOverlay");
    if (existing) existing.remove();

    const settings = getCloudSyncSettings();
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
          <p>Sync this device by pushing and pulling the same complete backup through a GitHub repo file.</p>
          <p class="cloud-sync-warning">Use a private repo for team data. The GitHub token stays on this device and is not included in backups.</p>
          <label class="cloud-sync-field">
            <span>GitHub repo</span>
            <input id="cloudSyncRepo" type="text" class="custom-modal-input" value="${escapeHtml(settings.repoFullName)}" placeholder="owner/repo" autocomplete="off" />
          </label>
          <div class="cloud-sync-grid">
            <label class="cloud-sync-field">
              <span>Branch</span>
              <input id="cloudSyncBranch" type="text" class="custom-modal-input" value="${escapeHtml(settings.branch)}" autocomplete="off" />
            </label>
            <label class="cloud-sync-field">
              <span>Backup path</span>
              <input id="cloudSyncPath" type="text" class="custom-modal-input" value="${escapeHtml(settings.path)}" autocomplete="off" />
            </label>
          </div>
          <label class="cloud-sync-field">
            <span>GitHub token</span>
            <input id="cloudSyncToken" type="password" class="custom-modal-input" placeholder="${hasRememberedCloudSyncToken() ? "Saved locally - leave blank to keep" : "Fine-grained token with Contents read/write"}" autocomplete="off" />
          </label>
          <div class="cloud-sync-checks">
            <label>
              <input id="cloudSyncRememberToken" type="checkbox" ${hasRememberedCloudSyncToken() ? "checked" : ""} />
              Remember token on this device
            </label>
            <label>
              <input id="cloudSyncAutoPull" type="checkbox" ${settings.autoPullOnStartup ? "checked" : ""} />
              Offer to pull newer cloud backup on startup
            </label>
          </div>
          <div class="cloud-sync-token-actions">
            <button class="btn btn-sm btn-secondary" data-action="clearCloudSyncToken" data-cloud-sync-action="token">Clear Token</button>
          </div>
          <div id="cloudSyncModalStatus" class="cloud-sync-modal-status cloud-sync-modal-status-info">
            ${escapeHtml(settings.repoFullName ? `Configured for ${settings.repoFullName}/${settings.path}.` : "Enter repo setup to begin.")}
          </div>
          <div class="cloud-sync-meta">
            <span>Last push: ${escapeHtml(formatCloudDate(settings.lastPushAt))}</span>
            <span>Last pull: ${escapeHtml(formatCloudDate(settings.lastPullAt))}</span>
          </div>
        </div>
        <div class="custom-modal-actions cloud-sync-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" data-action="closeCloudSyncModal">Close</button>
          <button class="btn btn-secondary custom-modal-btn" data-action="saveCloudSyncSettings" data-cloud-sync-action="save">Save</button>
          <button class="btn btn-secondary custom-modal-btn" data-action="testCloudSyncConnection" data-cloud-sync-action="test">Test</button>
          <button class="btn btn-secondary custom-modal-btn" data-action="pullCloudBackup" data-cloud-sync-action="pull">Pull</button>
          <button class="btn btn-primary custom-modal-btn" data-action="pushCloudBackup" data-cloud-sync-action="push">Push</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#cloudSyncRepo")?.focus();
  }

  function closeCloudSyncModal() {
    const overlay = document.getElementById("cloudSyncOverlay");
    if (!overlay) return;
    overlay.classList.remove("visible");
    overlay.style.pointerEvents = "none";
    overlay.setAttribute("aria-hidden", "true");
    setTimeout(() => overlay.remove(), 200);
  }

  async function maybeAutoPullCloudBackup() {
    const settings = getCloudSyncSettings();
    if (!settings.autoPullOnStartup || !settings.repoFullName || !getCloudSyncToken()) return;
    if (sessionStorage.getItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY) === "1") return;
    sessionStorage.setItem(CLOUD_SYNC_AUTO_PULL_SESSION_KEY, "1");
    try {
      const remote = await fetchCloudBackup(settings, { allowMissing: true });
      if (!remote) return;
      const remoteTime = new Date(remote.summary.exportDate || "").getTime();
      const localKnownTime = new Date(settings.lastRemoteExportDate || "").getTime();
      if (!Number.isFinite(remoteTime) || (Number.isFinite(localKnownTime) && remoteTime <= localKnownTime)) {
        return;
      }
      const ok = await showConfirm(
        `A newer cloud backup from ${formatCloudDate(remote.summary.exportDate)} is available.\n\nPull it onto this device now?`,
        {
          title: "Cloud Sync",
          icon: "☁️",
          confirmText: "Pull Backup",
        },
      );
      if (ok) await restoreCloudBackup(remote);
    } catch (err) {
      console.warn("Cloud auto-pull failed:", err);
      showToast(`Cloud sync check failed: ${err.message}`, { type: "warning", duration: 5000 });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderCloudSyncStatus();
    setTimeout(maybeAutoPullCloudBackup, 800);
  });

  window.openCloudSyncModal = openCloudSyncModal;
  window.closeCloudSyncModal = closeCloudSyncModal;
  window.saveCloudSyncSettings = saveCloudSyncSettings;
  window.testCloudSyncConnection = testCloudSyncConnection;
  window.pushCloudBackup = pushCloudBackup;
  window.pullCloudBackup = pullCloudBackup;
  window.clearCloudSyncToken = clearCloudSyncToken;
})();
