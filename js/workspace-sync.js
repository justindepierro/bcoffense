/* workspace-sync.js - shared save, cloud, media, and player publish status queue */
(function () {
  const WORKSPACE_SYNC_CHANNELS = ["local", "cloud", "media", "player"];
  const WORKSPACE_SYNC_STATES = WORKSPACE_SYNC_CHANNELS.reduce((acc, channel) => {
    acc[channel] = { state: "idle", label: "" };
    return acc;
  }, {});
  const workspaceSyncJobs = new Map();
  let workspaceSyncClearTimer = 0;

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
      return channel === "local" ? "Saving..." : "Publishing...";
    }
    if (state === "syncing" || state === "saving") {
      return channel === "local" ? "Saving..." : "Publishing...";
    }
    if (state === "synced" || state === "saved") {
      return "Saved";
    }
    return "";
  }

  function _wsDisplayLabel(channel, state, label) {
    return label || _wsDefaultLabel(channel, state);
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
      return {
        state: item.state,
        channel,
        label: _wsDisplayLabel(channel, item.state, item.label),
        canRetry: item.state === "error" && _wsHasRetryableJob(channel),
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

  function retryWorkspaceSyncWork() {
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
  });

  window.workspaceSync = {
    queue: queueWorkspaceSyncJob,
    start: startWorkspaceSyncJob,
    complete: completeWorkspaceSyncJob,
    fail: failWorkspaceSyncJob,
    run: runWorkspaceSyncJob,
    retry: retryWorkspaceSyncWork,
    hasWork: hasWorkspaceSyncWork,
    setStatus: setWorkspaceSyncStatus,
  };
  window.setWorkspaceSyncStatus = setWorkspaceSyncStatus;
  window.hasWorkspaceSyncWork = hasWorkspaceSyncWork;
  window.queueWorkspaceSyncJob = queueWorkspaceSyncJob;
  window.startWorkspaceSyncJob = startWorkspaceSyncJob;
  window.completeWorkspaceSyncJob = completeWorkspaceSyncJob;
  window.failWorkspaceSyncJob = failWorkspaceSyncJob;
  window.runWorkspaceSyncJob = runWorkspaceSyncJob;
  window.retryWorkspaceSyncWork = retryWorkspaceSyncWork;
})();
