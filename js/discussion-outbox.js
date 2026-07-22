/* discussion-outbox.js — durable, idempotent delivery for comments and replies.
   A post is written locally before its request leaves the device. If a phone
   changes networks or the app closes, the same client post ID is retried later
   and the server returns the original post instead of creating a duplicate. */
(function () {
  const DB_NAME = "bcoffense-discussion-outbox";
  const STORE = "jobs";
  const VERSION = 1;
  const MAX_ATTEMPTS = 8;
  const MAX_DELAY_MS = 5 * 60 * 1000;
  let dbPromise = null;
  let flushPromise = null;
  let retryTimer = null;

  function _now() { return new Date().toISOString(); }
  function _ownerKey() {
    const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    return String(user?.d1UserId || user?.username || user?.email || "").trim();
  }
  function _request(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Discussion outbox request failed."));
    });
  }
  function _db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is unavailable."));
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.objectStoreNames.contains(STORE)
          ? request.transaction.objectStore(STORE)
          : request.result.createObjectStore(STORE, { keyPath: "id" });
        if (!store.indexNames.contains("owner")) store.createIndex("owner", "owner", { unique: false });
        if (!store.indexNames.contains("state")) store.createIndex("state", "state", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Discussion outbox could not be opened."));
    });
    return dbPromise;
  }
  async function _store(mode, callback) {
    const db = await _db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value;
      try { value = callback(tx.objectStore(STORE)); } catch (err) { reject(err); return; }
      tx.oncomplete = async () => {
        try { resolve(await value); } catch (err) { reject(err); }
      };
      tx.onerror = () => reject(tx.error || new Error("Discussion outbox transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Discussion outbox transaction aborted."));
    });
  }
  async function _put(job) { return _store("readwrite", (store) => _request(store.put(job))); }
  async function _remove(id) { return _store("readwrite", (store) => _request(store.delete(id))); }
  async function _all() { return _store("readonly", (store) => _request(store.getAll())); }
  function _isRetryableStatus(status) { return status === 408 || status === 429 || status >= 500; }
  function _jobLabel(count) { return `${count} message${count === 1 ? "" : "s"} saving when online`; }
  async function _updateWorkspaceStatus() {
    const owner = _ownerKey();
    if (!owner) return;
    const jobs = (await _all()).filter((job) => job.owner === owner && job.state === "queued");
    if (!jobs.length) {
      window.completeWorkspaceSyncJob?.("discussion:outbox", { label: "Messages delivered" });
      return;
    }
    const needsAttention = jobs.some((job) => Number(job.attempts || 0) >= MAX_ATTEMPTS);
    if (needsAttention) {
      window.failWorkspaceSyncJob?.("discussion:outbox", {
        label: "A message needs attention",
        retry: () => flush({ force: true }),
      });
      return;
    }
    window.queueWorkspaceSyncJob?.("discussion", "outbox", {
      queuedLabel: _jobLabel(jobs.length),
      runningLabel: "Sending messages…",
      doneLabel: "Messages delivered",
      errorLabel: "Messages need attention",
      retry: () => flush({ force: true }),
    });
  }
  function _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }
  async function _scheduleRetry() {
    if (retryTimer || navigator.onLine === false) return;
    const owner = _ownerKey();
    if (!owner) return;
    const next = (await _all())
      .filter((job) => job.owner === owner && job.state === "queued" && Number(job.attempts || 0) < MAX_ATTEMPTS)
      .map((job) => Date.parse(job.nextAttemptAt || "") || Date.now())
      .sort((a, b) => a - b)[0];
    if (!next) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flush().catch(() => {});
    }, Math.max(250, Math.min(MAX_DELAY_MS, next - Date.now())));
  }
  async function _deliver(job) {
    const res = await fetch(`/api/threads/${encodeURIComponent(job.playId)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: job.body,
        post_type: job.postType,
        question_category: job.questionCategory || null,
        play_signature: job.playSig || "",
        parent_post_id: job.parentPostId || null,
        attachment: job.attachment || undefined,
        client_post_id: job.id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true, data };
    return { ok: false, status: res.status, error: data.error || `HTTP ${res.status}` };
  }
  async function _attempt(job) {
    if (navigator.onLine === false) return { queued: true, job };
    try {
      const result = await _deliver(job);
      if (result.ok) {
        await _remove(job.id);
        _emit("discussion-outbox-delivered", { job, data: result.data });
        return { sent: true, job, data: result.data };
      }
      if (!_isRetryableStatus(result.status)) {
        await _remove(job.id);
        _emit("discussion-outbox-rejected", { job, error: result.error });
        return { rejected: true, job, error: result.error };
      }
      throw new Error(result.error);
    } catch (err) {
      const attempts = Number(job.attempts || 0) + 1;
      const delay = Math.min(MAX_DELAY_MS, 1000 * (2 ** Math.min(attempts, 8)));
      const updated = {
        ...job,
        state: "queued",
        attempts,
        lastError: String(err?.message || "Could not send message.").slice(0, 500),
        nextAttemptAt: new Date(Date.now() + delay).toISOString(),
        updatedAt: _now(),
      };
      await _put(updated);
      _scheduleRetry().catch(() => {});
      return { queued: true, job: updated, needsAttention: attempts >= MAX_ATTEMPTS };
    }
  }
  async function send(input = {}) {
    const owner = _ownerKey();
    const playId = String(input.playId || "").trim();
    const body = String(input.body || "").trim();
    if (!owner) throw new Error("Your account is still loading. Please try again.");
    if (!playId || !body) throw new Error("A play and message are required.");
    const job = {
      id: String(input.id || crypto.randomUUID()),
      owner,
      playId,
      body: body.slice(0, 2000),
      postType: input.postType === "question" ? "question" : input.postType === "coach_clarification" ? "coach_clarification" : "comment",
      questionCategory: String(input.questionCategory || "").slice(0, 64),
      playSig: String(input.playSig || "").slice(0, 512),
      parentPostId: String(input.parentPostId || "").trim(),
      attachment: input.attachment && typeof input.attachment === "object" ? input.attachment : null,
      state: "queued",
      attempts: 0,
      lastError: "",
      nextAttemptAt: "",
      createdAt: _now(),
      updatedAt: _now(),
    };
    await _put(job);
    const outcome = await _attempt(job);
    await _updateWorkspaceStatus();
    await _scheduleRetry();
    return outcome;
  }
  async function flush(opts = {}) {
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      const owner = _ownerKey();
      if (!owner || navigator.onLine === false) return { sent: 0, pending: 0 };
      const now = Date.now();
      const jobs = (await _all())
        .filter((job) => job.owner === owner && job.state === "queued")
        .filter((job) => opts.force || !job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      let sent = 0;
      for (const job of jobs) {
        const outcome = await _attempt(job);
        if (outcome.sent) sent += 1;
      }
      await _updateWorkspaceStatus();
      await _scheduleRetry();
      return { sent, pending: jobs.length - sent };
    })();
    try { return await flushPromise; } finally { flushPromise = null; }
  }
  async function pendingCount() {
    const owner = _ownerKey();
    return (await _all()).filter((job) => job.owner === owner && job.state === "queued").length;
  }

  window.discussionOutbox = { send, flush, pendingCount };
  window.addEventListener("online", () => { flush().catch(() => {}); });
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => flush().catch(() => {}), 800);
  }, { once: true });
})();
