/* media-upload-outbox.js — durable binary media upload intents.
   A queued upload owns both its intent metadata and original Blob in one
   IndexedDB record. Cache Storage/localStorage queues from earlier builds are
   read only as compatibility fallbacks by their owners; new work enters here.
*/
(function () {
  const DB_NAME = "bcoffense-media-upload-outbox";
  const DB_VERSION = 1;
  const STORE = "jobs";
  const RETAIN_COMPLETED_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
  const STUCK_UPLOAD_MS = 15 * 60 * 1000;
  const MAX_AUTOMATIC_ATTEMPTS = 8;
  let dbPromise = null;
  let pendingCount = 0;

  function _now() { return new Date().toISOString(); }
  function _db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available for media uploads."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE)
          ? request.transaction.objectStore(STORE)
          : db.createObjectStore(STORE, { keyPath: "id" });
        if (!store.indexNames.contains("dedupeKey")) store.createIndex("dedupeKey", "dedupeKey", { unique: true });
        if (!store.indexNames.contains("state")) store.createIndex("state", "state", { unique: false });
        if (!store.indexNames.contains("kind")) store.createIndex("kind", "kind", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Media outbox could not be opened."));
    });
    return dbPromise;
  }

  function _request(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Media outbox request failed."));
    });
  }

  async function _withStore(mode, callback) {
    const db = await _db();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      let value;
      try { value = callback(transaction.objectStore(STORE)); }
      catch (err) { reject(err); return; }
      transaction.oncomplete = async () => {
        try { resolve(await value); } catch (err) { reject(err); }
      };
      transaction.onerror = () => reject(transaction.error || new Error("Media outbox transaction failed."));
      transaction.onabort = () => reject(transaction.error || new Error("Media outbox transaction aborted."));
    });
  }

  function _cleanText(value, max = 1024) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  function _publicJob(job, includeBlob) {
    if (!job) return null;
    const copy = { ...job };
    if (!includeBlob) delete copy.blob;
    return copy;
  }

  function _normalizeInput(input = {}) {
    const kind = _cleanText(input.kind, 40);
    const target = _cleanText(input.target || input.identityKey || input.sig, 1024);
    const blob = input.blob;
    if (!/[a-z][a-z0-9-]*/i.test(kind) || !target) throw new Error("A media type and stable target are required.");
    if (!(blob instanceof Blob) || !blob.size) throw new Error("The original media file is required for offline retry.");
    return {
      kind,
      target,
      blob,
      contentType: _cleanText(input.contentType || blob.type || "application/octet-stream", 200),
      label: _cleanText(input.label, 240),
      duration: Math.max(0, Number(input.duration || 0) || 0),
      checksum: _cleanText(input.checksum, 128).toLowerCase(),
      localSig: _cleanText(input.localSig, 1024),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    };
  }

  async function enqueue(input = {}) {
    const normalized = _normalizeInput(input);
    const dedupeKey = `${normalized.kind}:${normalized.target}`;
    const existing = await _withStore("readonly", async (store) => _request(store.index("dedupeKey").get(dedupeKey)));
    const now = _now();
    const job = {
      ...(existing || {}),
      ...normalized,
      id: existing?.id || crypto.randomUUID(),
      dedupeKey,
      state: "queued",
      attempts: existing?.attempts || 0,
      queuedAt: existing?.queuedAt || now,
      updatedAt: now,
      lastError: "",
      nextAttemptAt: "",
      receipt: null,
      completedAt: "",
    };
    await _withStore("readwrite", async (store) => _request(store.put(job)));
    pendingCount += existing && ["queued", "blocked"].includes(existing.state) ? 0 : 1;
    return _publicJob(job, false);
  }

  async function get(id, opts = {}) {
    const job = await _withStore("readonly", async (store) => _request(store.get(String(id || ""))));
    return _publicJob(job, opts.includeBlob === true);
  }

  async function list(opts = {}) {
    const jobs = await _withStore("readonly", async (store) => _request(store.getAll()));
    const states = Array.isArray(opts.states) ? new Set(opts.states) : null;
    const kind = _cleanText(opts.kind, 40);
    return (Array.isArray(jobs) ? jobs : [])
      .filter((job) => (!kind || job.kind === kind) && (!states || states.has(job.state)))
      .sort((a, b) => String(a.queuedAt || "").localeCompare(String(b.queuedAt || "")))
      .map((job) => _publicJob(job, opts.includeBlob === true));
  }

  async function markRetry(id, error, opts = {}) {
    const job = await get(id, { includeBlob: true });
    if (!job) return null;
    const attempts = Math.max(0, Number(job.attempts || 0)) + 1;
    const delay = Math.min(MAX_RETRY_DELAY_MS, Math.max(0, Number(opts.delayMs || (1000 * (2 ** Math.min(attempts, 8))))));
    const nextAttemptAt = new Date(Date.now() + delay).toISOString();
    const updated = {
      ...job,
      // Only a known non-retryable conflict is blocked. Network failures stay
      // queued with backoff so an offline device never becomes permanently
      // red just because it was away from Wi-Fi for a while.
      state: opts.terminal ? "blocked" : "queued",
      attempts,
      lastError: _cleanText(error?.message || error || "Upload failed", 1000),
      nextAttemptAt,
      updatedAt: _now(),
    };
    await _withStore("readwrite", async (store) => _request(store.put(updated)));
    return _publicJob(updated, false);
  }

  async function markComplete(id, receipt = {}) {
    const job = await get(id, { includeBlob: true });
    if (!job) return null;
    const completed = {
      ...job,
      state: "completed",
      receipt: receipt && typeof receipt === "object" ? receipt : { value: receipt },
      completedAt: _now(),
      updatedAt: _now(),
      lastError: "",
      nextAttemptAt: "",
      blob: null,
    };
    await _withStore("readwrite", async (store) => _request(store.put(completed)));
    if (["queued", "blocked"].includes(job.state)) pendingCount = Math.max(0, pendingCount - 1);
    if (pendingCount === 0 && typeof window.completeWorkspaceSyncJob === "function") {
      window.completeWorkspaceSyncJob("media:durable-upload-outbox", { label: "Media saved for players" });
    }
    return _publicJob(completed, false);
  }

  async function retryNow(opts = {}) {
    const includeBlocked = opts.includeBlocked !== false;
    const jobs = await list({ states: includeBlocked ? ["queued", "blocked"] : ["queued"], includeBlob: true });
    const retried = [];
    for (const job of jobs) {
      const next = {
        ...job,
        state: "queued",
        attempts: 0,
        nextAttemptAt: "",
        updatedAt: _now(),
      };
      await _withStore("readwrite", async (store) => _request(store.put(next)));
      retried.push(_publicJob(next, false));
    }
    pendingCount = retried.length;
    return retried;
  }

  async function remove(id) {
    if (!id) return false;
    const job = await get(id, { includeBlob: false });
    await _withStore("readwrite", async (store) => _request(store.delete(String(id))));
    if (job && ["queued", "blocked"].includes(job.state)) pendingCount = Math.max(0, pendingCount - 1);
    return true;
  }

  async function clearExpiredCompleted() {
    const completed = await list({ states: ["completed"], includeBlob: false });
    const cutoff = Date.now() - RETAIN_COMPLETED_MS;
    await Promise.all(completed
      .filter((job) => Date.parse(job.completedAt || "") > 0 && Date.parse(job.completedAt) < cutoff)
      .map((job) => remove(job.id)));
  }

  async function pending(kind = "") {
    const jobs = await list({ kind, states: ["queued", "blocked"], includeBlob: true });
    if (!kind) pendingCount = jobs.length;
    return jobs;
  }

  async function getHealth() {
    const jobs = await list({ states: ["queued", "blocked"] });
    const now = Date.now();
    const connectivity = window.workspaceSync?.getConnectivity?.() || {};
    // Time alone is not a failure. A laptop can stay offline through a whole
    // practice, and its original diagram/video blob is still safely retained
    // here. Promote a queued item only after the app has confirmed that the
    // team service is reachable and automatic retries have had a fair chance.
    const serviceReachable = connectivity.reachability === "online" && navigator.onLine !== false;
    const queued = jobs.filter((job) => job.state === "queued");
    const blocked = jobs.filter((job) => job.state === "blocked");
    const stale = jobs.filter((job) => {
      const queuedAt = Date.parse(job.queuedAt || "") || 0;
      return Number(job.attempts || 0) >= MAX_AUTOMATIC_ATTEMPTS
        || (queuedAt > 0 && now - queuedAt >= STUCK_UPLOAD_MS);
    });
    return {
      pending: jobs.length,
      queued: queued.length,
      blocked: blocked.length,
      stale: stale.length,
      needsAttention: blocked.length > 0 || (serviceReachable && stale.length > 0),
      waitingOffline: !serviceReachable && queued.length > 0,
      oldestQueuedAt: jobs[0]?.queuedAt || "",
    };
  }

  async function refreshHealth() {
    const health = await getHealth();
    if (typeof window.queueWorkspaceSyncJob !== "function") return health;
    // A previous health check may have created a dock job in this browser
    // session. Clear only that job once the durable outbox is empty; the
    // workspace queue will preserve any separate media error still unresolved.
    if (!health.pending) {
      window.completeWorkspaceSyncJob?.("media:durable-upload-outbox", { label: "Media saved for players" });
      return health;
    }
    const key = window.queueWorkspaceSyncJob("media", "durable-upload-outbox", {
      queuedLabel: health.needsAttention
        ? `${health.blocked || health.stale} media upload${(health.blocked || health.stale) === 1 ? "" : "s"} need attention`
        : health.waitingOffline
          ? `${health.pending} media upload${health.pending === 1 ? "" : "s"} saved on this device`
          : `${health.pending} media upload${health.pending === 1 ? "" : "s"} saving when online`,
      runningLabel: "Saving media…",
      doneLabel: "Media saved for players",
      errorLabel: "Media upload needs attention",
      retry: async () => {
        await retryNow();
        return Promise.all([
          window.playImages?.flushQueuedDiagramUploads?.(),
          window.playClips?.flushQueuedClipUploads?.(),
        ]);
      },
    });
    if (health.needsAttention && typeof window.failWorkspaceSyncJob === "function") {
      window.failWorkspaceSyncJob(key, new Error("One or more media uploads have been waiting too long."), {
        label: `${health.blocked || health.stale} media upload${(health.blocked || health.stale) === 1 ? "" : "s"} need attention`,
      });
    }
    return health;
  }

  async function restorePendingWorkspaceStatus() {
    const health = await refreshHealth();
    return health.pending;
  }

  window.mediaUploadOutbox = {
    enqueue,
    get,
    list,
    pending,
    markRetry,
    markComplete,
    retryNow,
    remove,
    clearExpiredCompleted,
    getHealth,
    refreshHealth,
    restorePendingWorkspaceStatus,
    hasPendingCached: () => pendingCount > 0,
  };
  window.addEventListener("DOMContentLoaded", () => {
    clearExpiredCompleted().catch(() => { /* cleanup is best effort */ });
    restorePendingWorkspaceStatus().catch(() => { /* upload owners retry on reconnect */ });
  }, { once: true });
  window.addEventListener("online", () => {
    refreshHealth().catch(() => { /* upload owners retry separately on reconnect */ });
  });
  document.addEventListener("workspace-connectivity-changed", () => {
    refreshHealth().catch(() => { /* status refresh is best effort */ });
  });
  window.setInterval(() => {
    refreshHealth().catch(() => { /* status refresh is best effort */ });
  }, 60 * 1000);
})();
