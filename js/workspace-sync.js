/* workspace-sync.js - shared save, cloud, media, and player publish status queue */
(function () {
  const WORKSPACE_SYNC_CHANNELS = ["local", "cloud", "media", "player"];
  const WORKSPACE_SYNC_STATES = WORKSPACE_SYNC_CHANNELS.reduce((acc, channel) => {
    acc[channel] = { state: "idle", label: "" };
    return acc;
  }, {});
  const workspaceSyncJobs = new Map();
  let workspaceSyncClearTimer = 0;
  // navigator.onLine only tells us whether the browser has a network route.
  // Keep the last lightweight authenticated probe separate so a captive
  // network, a sleeping laptop, or a temporary Worker outage is not shown as
  // the same thing as a real offline device.
  const workspaceConnectivity = {
    browserOnline: typeof navigator === "undefined" || navigator.onLine !== false,
    reachability: "unknown", // unknown | online | unavailable
    service: "unknown", // unknown | available | unavailable
    checkedAt: "",
    lastError: "",
  };
  let workspaceConnectivityProbe = null;

  // Background reads used to each invent their own interval and retry rule.
  // That made a temporary Pages/D1 outage look like a fresh error every time
  // the app gained focus, saved a field, or polled the notification bell.
  // Keep the circuit state in this one owner. Individual features still own
  // their data and UI; they only ask this coordinator whether a quiet retry is
  // due and report the outcome.
  const WORKSPACE_BACKGROUND_RETRY_BASE_MS = 15 * 1000;
  const WORKSPACE_BACKGROUND_RETRY_MAX_MS = 5 * 60 * 1000;
  const workspaceBackgroundRequests = new Map();

  function _wsRetryAfterMs(error, attempt) {
    const hintedSeconds = Math.max(0, Number(error?.data?.retryAfterSeconds || error?.retryAfterSeconds || 0) || 0);
    const base = hintedSeconds ? hintedSeconds * 1000 : WORKSPACE_BACKGROUND_RETRY_BASE_MS;
    return Math.min(WORKSPACE_BACKGROUND_RETRY_MAX_MS, base * (2 ** Math.max(0, attempt - 1)));
  }

  function _wsIsTransientBackgroundError(error) {
    const status = Number(error?.status || 0);
    return error?.retryable === true || error?.code === "BC_WORKSPACE_TIMEOUT" || status === 429 || (status >= 500 && status < 600) || error?.name === "AbortError" || error instanceof TypeError;
  }

  function canAttemptWorkspaceBackgroundRequest(key) {
    const record = workspaceBackgroundRequests.get(String(key || "default"));
    return !record || Date.now() >= Number(record.nextAttemptAt || 0);
  }

  function recordWorkspaceBackgroundRequestSuccess(key) {
    workspaceBackgroundRequests.delete(String(key || "default"));
    if (![...workspaceBackgroundRequests.values()].some((record) => Number(record.nextAttemptAt || 0) > Date.now())) {
      _wsSetConnectivity({ service: "available", lastError: "" });
    }
  }

  function recordWorkspaceBackgroundRequestFailure(key, error) {
    if (!_wsIsTransientBackgroundError(error)) return null;
    const normalizedKey = String(key || "default");
    const previous = workspaceBackgroundRequests.get(normalizedKey);
    const attempts = Math.max(1, Number(previous?.attempts || 0) + 1);
    const retryAfterMs = _wsRetryAfterMs(error, attempts);
    const record = {
      attempts,
      nextAttemptAt: Date.now() + retryAfterMs,
      lastError: String(error?.message || "Team service is temporarily unavailable."),
    };
    workspaceBackgroundRequests.set(normalizedKey, record);
    _wsSetConnectivity({ service: "unavailable", lastError: record.lastError });
    return { ...record, retryAfterMs };
  }

  // Multiple open tabs share local storage but used to publish and refresh the
  // canonical team revision independently. A small, expiring lease gives one
  // tab ownership of that network cycle. It is deliberately advisory: the
  // server-side revision CAS remains the final correctness boundary across
  // different browsers and devices.
  const TEAM_WORKSPACE_SYNC_CHANNEL = "bcoffense-team-workspace-v1";
  const TEAM_WORKSPACE_LEASE_KEY = "_bcTeamWorkspaceLeaseV1";
  const TEAM_WORKSPACE_LEASE_MIN_MS = 10 * 1000;
  const TEAM_WORKSPACE_LEASE_MAX_MS = 2 * 60 * 1000;
  const TEAM_WORKSPACE_LEASE_DEFAULT_MS = 75 * 1000;
  const workspaceSyncTabId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let workspaceSyncChannel = null;

  function _wsCoordinatorChannel() {
    if (workspaceSyncChannel || typeof BroadcastChannel === "undefined") return workspaceSyncChannel;
    try {
      workspaceSyncChannel = new BroadcastChannel(TEAM_WORKSPACE_SYNC_CHANNEL);
      workspaceSyncChannel.onmessage = (event) => {
        const message = event?.data;
        if (!message || message.source === workspaceSyncTabId || !message.type) return;
        document.dispatchEvent(new CustomEvent("workspace-sync-coordination", { detail: message }));
        if (message.type === "workspace-published") {
          document.dispatchEvent(new CustomEvent("workspace-sync-remote-update", { detail: message }));
        }
      };
    } catch (_err) {
      // Safari private windows and hardened browser profiles can block this.
      // The localStorage lease below still coordinates ordinary tabs.
      workspaceSyncChannel = null;
    }
    return workspaceSyncChannel;
  }

  function _wsReadTeamWorkspaceLease() {
    try {
      const raw = localStorage.getItem(TEAM_WORKSPACE_LEASE_KEY);
      const value = raw ? JSON.parse(raw) : null;
      if (!value || typeof value !== "object") return null;
      const expiresAt = Number(value.expiresAt || 0);
      const owner = String(value.owner || "");
      if (!owner || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
      return { owner, expiresAt, purpose: String(value.purpose || "workspace") };
    } catch (_err) {
      return null;
    }
  }

  function _wsPostCoordination(type, detail = {}) {
    const message = {
      type,
      source: workspaceSyncTabId,
      at: new Date().toISOString(),
      ...detail,
    };
    try { _wsCoordinatorChannel()?.postMessage(message); } catch (_err) { /* optional */ }
    return message;
  }

  function _wsPause(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(20, ms)));
  }

  async function acquireTeamWorkspaceLease(opts = {}) {
    const waitMs = Math.max(0, Math.min(15 * 1000, Number(opts.waitMs || 0) || 0));
    const ttlMs = Math.max(
      TEAM_WORKSPACE_LEASE_MIN_MS,
      Math.min(TEAM_WORKSPACE_LEASE_MAX_MS, Number(opts.ttlMs || TEAM_WORKSPACE_LEASE_DEFAULT_MS) || TEAM_WORKSPACE_LEASE_DEFAULT_MS),
    );
    const purpose = String(opts.purpose || "workspace");
    const deadline = Date.now() + waitMs;

    do {
      const existing = _wsReadTeamWorkspaceLease();
      if (!existing || existing.owner === workspaceSyncTabId) {
        const lease = {
          owner: workspaceSyncTabId,
          expiresAt: Date.now() + ttlMs,
          purpose,
        };
        try {
          localStorage.setItem(TEAM_WORKSPACE_LEASE_KEY, JSON.stringify(lease));
          const confirmed = _wsReadTeamWorkspaceLease();
          if (confirmed?.owner === workspaceSyncTabId) {
            _wsPostCoordination("workspace-lease-acquired", { purpose, expiresAt: confirmed.expiresAt });
            return { acquired: true, ...confirmed };
          }
        } catch (_err) {
          // Storage may be disabled. Do not make publishing unavailable; the
          // immutable server CAS will still prevent a bad cross-device write.
          return { acquired: true, uncoordinated: true, purpose };
        }
      } else if (Date.now() >= deadline) {
        return { acquired: false, retryAfterMs: Math.max(250, existing.expiresAt - Date.now()), ...existing };
      }
      await _wsPause(Math.min(300, Math.max(80, existing.expiresAt - Date.now())));
    } while (Date.now() <= deadline);

    const current = _wsReadTeamWorkspaceLease();
    return {
      acquired: false,
      retryAfterMs: Math.max(250, Number(current?.expiresAt || Date.now() + 250) - Date.now()),
      ...(current || {}),
    };
  }

  function releaseTeamWorkspaceLease(lease = null) {
    if (lease?.uncoordinated) return true;
    try {
      const current = _wsReadTeamWorkspaceLease();
      if (!current || current.owner !== workspaceSyncTabId) return false;
      localStorage.removeItem(TEAM_WORKSPACE_LEASE_KEY);
      _wsPostCoordination("workspace-lease-released", { purpose: current.purpose });
      return true;
    } catch (_err) {
      return false;
    }
  }

  function announceTeamWorkspacePublished(detail = {}) {
    _wsPostCoordination("workspace-published", {
      revision: String(detail.revision || ""),
      updatedAt: String(detail.updatedAt || new Date().toISOString()),
    });
  }

  function _wsNormalizeChannel(channel) {
    return WORKSPACE_SYNC_CHANNELS.includes(channel) ? channel : "local";
  }

  function _wsJobKey(channel, id) {
    return `${_wsNormalizeChannel(channel)}:${id || "default"}`;
  }

  function _wsDefaultLabel(channel, state) {
    if (state === "error") {
      return "Needs attention";
    }
    if (state === "queued" || state === "dirty") {
      return channel === "local" ? "Saving on this device" : "Sync queued";
    }
    if (state === "syncing" || state === "saving") {
      return channel === "local" ? "Saving on this device" : "Updating team";
    }
    if (state === "synced" || state === "saved") {
      return "Saved locally";
    }
    return "";
  }

  function _wsDisplayLabel(channel, state, label) {
    return label || _wsDefaultLabel(channel, state);
  }

  function getWorkspaceSyncConnectivity() {
    return { ...workspaceConnectivity };
  }

  function _wsSetConnectivity(next = {}) {
    Object.assign(workspaceConnectivity, next, { checkedAt: new Date().toISOString() });
    document.dispatchEvent(new CustomEvent("workspace-connectivity-changed", {
      detail: getWorkspaceSyncConnectivity(),
    }));
    renderWorkspaceSyncDock();
  }

  async function checkWorkspaceSyncConnectivity(opts = {}) {
    const browserOnline = typeof navigator === "undefined" || navigator.onLine !== false;
    if (!browserOnline) {
      _wsSetConnectivity({ browserOnline: false, reachability: "unknown", lastError: "" });
      return getWorkspaceSyncConnectivity();
    }
    if (workspaceConnectivityProbe && !opts.force) return workspaceConnectivityProbe;
    const controller = typeof AbortController === "undefined" ? null : new AbortController();
    const timeout = controller ? setTimeout(() => controller.abort(), 5000) : 0;
    workspaceConnectivityProbe = fetch("/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    })
      // A response proves the app server is reachable. A separate background
      // request result owns whether the team data service itself is available.
      .then(() => {
        _wsSetConnectivity({ browserOnline: true, reachability: "online" });
        return getWorkspaceSyncConnectivity();
      })
      .catch((err) => {
        _wsSetConnectivity({
          browserOnline: true,
          reachability: "unavailable",
          lastError: String(err?.message || "Team sync could not be reached."),
        });
        return getWorkspaceSyncConnectivity();
      })
      .finally(() => {
        if (timeout) clearTimeout(timeout);
        workspaceConnectivityProbe = null;
      });
    return workspaceConnectivityProbe;
  }

  function _wsConnectivityState() {
    if (workspaceConnectivity.browserOnline === false) return "offline";
    if (workspaceConnectivity.reachability === "unavailable" || workspaceConnectivity.service === "unavailable") return "unavailable";
    return "";
  }

  function ensureWorkspaceSyncDock() {
    if (!document.body) return null;
    let dock = document.getElementById("workspaceSyncDock");
    if (dock) return dock;
    dock = document.createElement("div");
    dock.id = "workspaceSyncDock";
    dock.className = "workspace-sync-dock workspace-sync-dock--idle";
    dock.setAttribute("role", "status");
    dock.setAttribute("aria-live", "polite");
    dock.innerHTML = `
      <span class="workspace-sync-dock__spinner" aria-hidden="true"></span>
      <span class="workspace-sync-dock__dot" aria-hidden="true"></span>
      <span class="workspace-sync-dock__text"></span>
      <button type="button" class="workspace-sync-dock__retry" data-action="retryWorkspaceSyncWork">Retry</button>
    `;
    document.body.appendChild(dock);
    return dock;
  }

  function getWorkspaceSyncSummary() {
    const entries = Object.entries(WORKSPACE_SYNC_STATES);
    const stateFor = (state) => entries.find(([, item]) => item.state === state);
    const active =
      stateFor("error") ||
      stateFor("syncing") ||
      stateFor("saving") ||
      stateFor("queued") ||
      stateFor("dirty");
    if (active) {
      const [channel, item] = active;
      const connectivityState = _wsConnectivityState();
      // A true upload conflict still needs review. Routine queued work should
      // instead tell the coach it is safely stored locally while disconnected.
      if (item.state !== "error" && connectivityState) {
        return {
          state: connectivityState,
          channel,
          label: connectivityState === "offline"
            ? "Offline · saved on this device"
            : "Team sync unavailable · saved locally",
          canRetry: connectivityState === "unavailable",
        };
      }
      return {
        state: item.state,
        channel,
        label: _wsDisplayLabel(channel, item.state, item.label),
        canRetry: item.state === "error" && _wsHasRetryableJob(channel),
      };
    }
    // Players need a clear offline cue even when they have no local edits.
    // Staff only see it while work is pending, avoiding a permanent status
    // chip during normal desktop work.
    const connectivityState = _wsConnectivityState();
    if (connectivityState && document.body?.dataset?.authRole === "player") {
      return {
        state: connectivityState,
        channel: "player",
        label: connectivityState === "offline"
          ? "Offline · showing your last loaded practice"
          : "Practice updates are temporarily unavailable",
        canRetry: connectivityState === "unavailable",
      };
    }
    const synced = stateFor("synced") || stateFor("saved");
    if (synced) {
      return {
        state: "saved",
        channel: synced[0],
        label: _wsDisplayLabel(synced[0], synced[1].state, synced[1].label),
        canRetry: false,
      };
    }
    return { state: "idle", channel: "", label: "", canRetry: false };
  }

  function renderWorkspaceSyncDock() {
    const dock = ensureWorkspaceSyncDock();
    if (!dock) return;
    if (workspaceSyncClearTimer) {
      clearTimeout(workspaceSyncClearTimer);
      workspaceSyncClearTimer = 0;
    }
    const summary = getWorkspaceSyncSummary();
    dock.className = `workspace-sync-dock workspace-sync-dock--${summary.state}`;
    dock.dataset.syncState = summary.state;
    dock.dataset.syncChannel = summary.channel || "";
    const text = dock.querySelector(".workspace-sync-dock__text");
    if (text) text.textContent = summary.label;
    const retry = dock.querySelector(".workspace-sync-dock__retry");
    if (retry) retry.hidden = !summary.canRetry;
    if (summary.state === "saved") {
      workspaceSyncClearTimer = setTimeout(() => {
        Object.keys(WORKSPACE_SYNC_STATES).forEach((channel) => {
          if (["saved", "synced"].includes(WORKSPACE_SYNC_STATES[channel].state)) {
            WORKSPACE_SYNC_STATES[channel] = { state: "idle", label: "" };
          }
        });
        workspaceSyncClearTimer = 0;
        renderWorkspaceSyncDock();
      }, 2600);
    }
  }

  function setWorkspaceSyncStatus(channel, state, opts = {}) {
    const normalizedChannel = _wsNormalizeChannel(channel);
    WORKSPACE_SYNC_STATES[normalizedChannel] = {
      state: state || "idle",
      label: opts.label || "",
      updatedAt: new Date().toISOString(),
    };
    renderWorkspaceSyncDock();
  }

  // A channel can have more than one kind of work at once (for example, a
  // diagram and a clip upload). Do not let a successful job hide a separate
  // job that is still genuinely blocked. Conversely, a new queued job should
  // not turn a resolved channel back into an error because of a stale label.
  function _wsReconcileChannel(channel, fallbackState = "idle", fallbackLabel = "") {
    const normalizedChannel = _wsNormalizeChannel(channel);
    const jobs = [...workspaceSyncJobs.values()]
      .filter((job) => job.channel === normalizedChannel)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const error = jobs.find((job) => job.state === "error");
    if (error) {
      setWorkspaceSyncStatus(normalizedChannel, "error", {
        label: error.errorLabel || _wsDefaultLabel(normalizedChannel, "error"),
      });
      return;
    }
    const running = jobs.find((job) => job.state === "running");
    if (running) {
      setWorkspaceSyncStatus(normalizedChannel, normalizedChannel === "local" ? "saving" : "syncing", {
        label: running.runningLabel || _wsDefaultLabel(normalizedChannel, "syncing"),
      });
      return;
    }
    const queued = jobs.find((job) => job.state === "queued");
    if (queued) {
      setWorkspaceSyncStatus(normalizedChannel, "queued", {
        label: queued.queuedLabel || _wsDefaultLabel(normalizedChannel, "queued"),
      });
      return;
    }
    setWorkspaceSyncStatus(normalizedChannel, fallbackState, { label: fallbackLabel });
  }

  function hasWorkspaceSyncWork() {
    return Object.values(WORKSPACE_SYNC_STATES).some((item) =>
      ["dirty", "queued", "saving", "syncing", "error"].includes(item.state),
    ) || Boolean(window.mediaUploadOutbox?.hasPendingCached?.());
  }

  // A queued/error cloud publish has already been saved locally (and upload
  // intents are durable in IndexedDB). It should warn before leaving the app,
  // but it must not keep a newer service worker waiting forever during a
  // server outage. Only work actively being written is an unsafe update point.
  function hasBlockingWorkspaceSyncWork() {
    return Object.values(WORKSPACE_SYNC_STATES).some((item) =>
      ["dirty", "saving", "syncing"].includes(item.state),
    );
  }

  function _wsHasRetryableJob(channel) {
    return [...workspaceSyncJobs.values()].some(
      (job) => job.channel === channel && job.state === "error" && typeof job.retry === "function",
    );
  }

  function queueWorkspaceSyncJob(channel, id, opts = {}) {
    const normalizedChannel = _wsNormalizeChannel(channel);
    const key = _wsJobKey(normalizedChannel, id);
    const previous = workspaceSyncJobs.get(key) || {};
    const job = {
      ...previous,
      key,
      id: id || "default",
      channel: normalizedChannel,
      state: "queued",
      queuedLabel: opts.queuedLabel || previous.queuedLabel || "",
      runningLabel: opts.runningLabel || previous.runningLabel || "",
      doneLabel: opts.doneLabel || previous.doneLabel || "",
      errorLabel: opts.errorLabel || previous.errorLabel || "",
      retry: typeof opts.retry === "function" ? opts.retry : previous.retry,
      updatedAt: new Date().toISOString(),
    };
    workspaceSyncJobs.set(key, job);
    _wsReconcileChannel(normalizedChannel, opts.status || "queued", job.queuedLabel || _wsDefaultLabel(normalizedChannel, "queued"));
    return key;
  }

  function startWorkspaceSyncJob(key, opts = {}) {
    const job = workspaceSyncJobs.get(key);
    if (!job) return false;
    job.state = "running";
    job.updatedAt = new Date().toISOString();
    if (typeof opts.retry === "function") job.retry = opts.retry;
    _wsReconcileChannel(
      job.channel,
      opts.status || (job.channel === "local" ? "saving" : "syncing"),
      opts.label || job.runningLabel || _wsDefaultLabel(job.channel, "syncing"),
    );
    return true;
  }

  function completeWorkspaceSyncJob(key, opts = {}) {
    const job = workspaceSyncJobs.get(key);
    if (!job) return false;
    job.state = "done";
    job.updatedAt = new Date().toISOString();
    workspaceSyncJobs.delete(key);
    _wsReconcileChannel(
      job.channel,
      opts.status || (job.channel === "local" ? "saved" : "synced"),
      opts.label || job.doneLabel || _wsDefaultLabel(job.channel, "synced"),
    );
    return true;
  }

  // Player-facing changes are one canonical workspace commit, even when a
  // burst contains a script save, a diagram, and a signal clip. Keep their
  // individual receipt visible until that commit has actually completed; the
  // old behavior marked the player job done as soon as it was queued.
  function completePlayerPublishJobs(opts = {}) {
    const jobs = [...workspaceSyncJobs.values()]
      .filter((job) => job.channel === "player")
      .map((job) => job.key);
    jobs.forEach((key) => completeWorkspaceSyncJob(key, {
      label: opts.label || "Player update ready",
    }));
    return jobs.length;
  }

  function failWorkspaceSyncJob(key, error, opts = {}) {
    const job = workspaceSyncJobs.get(key);
    if (!job) return false;
    job.state = "error";
    job.error = error && error.message ? error.message : String(error || "Unknown error");
    job.updatedAt = new Date().toISOString();
    if (typeof opts.retry === "function") job.retry = opts.retry;
    if (opts.label) job.errorLabel = opts.label;
    _wsReconcileChannel(job.channel, "error", job.errorLabel || _wsDefaultLabel(job.channel, "error"));
    return true;
  }

  function failPlayerPublishJobs(error, opts = {}) {
    const jobs = [...workspaceSyncJobs.values()]
      .filter((job) => job.channel === "player")
      .map((job) => job.key);
    jobs.forEach((key) => failWorkspaceSyncJob(key, error, {
      label: opts.label || "Player update needs attention",
      retry: opts.retry,
    }));
    return jobs.length;
  }

  function retryWorkspaceSyncWork() {
    checkWorkspaceSyncConnectivity({ force: true }).finally(() => renderWorkspaceSyncDock());
    const job = [...workspaceSyncJobs.values()]
      .filter((item) => item.state === "error" && typeof item.retry === "function")
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
    if (!job) return false;
    job.state = "queued";
    job.updatedAt = new Date().toISOString();
    _wsReconcileChannel(job.channel, "queued", job.queuedLabel || _wsDefaultLabel(job.channel, "queued"));
    Promise.resolve()
      .then(() => job.retry())
      .catch((err) => failWorkspaceSyncJob(job.key, err));
    return true;
  }

  async function runWorkspaceSyncJob(channel, id, runner, opts = {}) {
    const key = queueWorkspaceSyncJob(channel, id, opts);
    startWorkspaceSyncJob(key, opts);
    try {
      const result = await runner();
      completeWorkspaceSyncJob(key, opts);
      return result;
    } catch (err) {
      failWorkspaceSyncJob(key, err, opts);
      throw err;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureWorkspaceSyncDock();
    renderWorkspaceSyncDock();
    checkWorkspaceSyncConnectivity();
  });

  window.addEventListener("offline", () => {
    _wsSetConnectivity({ browserOnline: false, reachability: "unknown", lastError: "" });
  });
  window.addEventListener("online", () => {
    checkWorkspaceSyncConnectivity({ force: true })
      .finally(() => retryWorkspaceSyncWork());
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== TEAM_WORKSPACE_LEASE_KEY || event.storageArea !== localStorage) return;
    document.dispatchEvent(new CustomEvent("workspace-sync-coordination", {
      detail: { type: "workspace-lease-changed", source: "storage", at: new Date().toISOString() },
    }));
  });

  window.workspaceSync = {
    queue: queueWorkspaceSyncJob,
    start: startWorkspaceSyncJob,
    complete: completeWorkspaceSyncJob,
    completePlayerPublishJobs,
    fail: failWorkspaceSyncJob,
    failPlayerPublishJobs,
    run: runWorkspaceSyncJob,
    retry: retryWorkspaceSyncWork,
    hasWork: hasWorkspaceSyncWork,
    hasBlockingWork: hasBlockingWorkspaceSyncWork,
    setStatus: setWorkspaceSyncStatus,
    getConnectivity: getWorkspaceSyncConnectivity,
    checkConnectivity: checkWorkspaceSyncConnectivity,
    canAttemptBackgroundRequest: canAttemptWorkspaceBackgroundRequest,
    recordBackgroundRequestSuccess: recordWorkspaceBackgroundRequestSuccess,
    recordBackgroundRequestFailure: recordWorkspaceBackgroundRequestFailure,
    acquireTeamWorkspaceLease,
    releaseTeamWorkspaceLease,
    announceTeamWorkspacePublished,
  };
  window.setWorkspaceSyncStatus = setWorkspaceSyncStatus;
  window.hasWorkspaceSyncWork = hasWorkspaceSyncWork;
  window.hasBlockingWorkspaceSyncWork = hasBlockingWorkspaceSyncWork;
  window.queueWorkspaceSyncJob = queueWorkspaceSyncJob;
  window.startWorkspaceSyncJob = startWorkspaceSyncJob;
  window.completeWorkspaceSyncJob = completeWorkspaceSyncJob;
  window.completePlayerPublishJobs = completePlayerPublishJobs;
  window.failWorkspaceSyncJob = failWorkspaceSyncJob;
  window.failPlayerPublishJobs = failPlayerPublishJobs;
  window.runWorkspaceSyncJob = runWorkspaceSyncJob;
  window.retryWorkspaceSyncWork = retryWorkspaceSyncWork;
})();
