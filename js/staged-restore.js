(function () {
  // Recovery snapshots live outside localStorage so a restore can safely
  // replace team workspace keys without deleting the rollback point itself.
  // They intentionally contain only the canonical team workspace, never
  // diagrams, media blobs, auth/session state, drafts, or player-private data.
  const DB_NAME = "bcoffense-staged-restore";
  const DB_VERSION = 1;
  const STORE_NAME = "snapshots";
  const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const MAX_SNAPSHOTS_PER_TEAM = 5;
  let activeRestore = null;

  function getScope() {
    const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    const teamId = String(user?.teamId || "").trim();
    return teamId ? `team:${teamId}` : "team:unknown";
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser recovery storage failed."));
    });
  }

  function getDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? request.transaction.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, { keyPath: "id" });
        if (!store.indexNames.contains("scope")) store.createIndex("scope", "scope", { unique: false });
        if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser recovery storage is unavailable."));
    });
  }

  async function withStore(mode, operation) {
    const db = await getDatabase();
    try {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = await operation(store);
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Browser recovery storage transaction failed."));
        tx.onabort = () => reject(tx.error || new Error("Browser recovery storage transaction was aborted."));
      });
      return result;
    } finally {
      db.close();
    }
  }

  function parseBackupValue(workspace, key, fallback) {
    if (!workspace || workspace[key] === undefined) return fallback;
    const raw = workspace[key];
    return typeof raw === "string" ? safeJSONParse(raw, fallback) : raw;
  }

  function countCollection(workspace, key) {
    const value = parseBackupValue(workspace, key, []);
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    return 0;
  }

  function countCallSheetPlays(workspace) {
    const value = parseBackupValue(workspace, STORAGE_KEYS.CALL_SHEET, {});
    if (!value || typeof value !== "object") return 0;
    return Object.values(value).reduce((total, entry) => {
      return total + (Array.isArray(entry?.left) ? entry.left.length : 0) + (Array.isArray(entry?.right) ? entry.right.length : 0);
    }, 0);
  }

  function readTeamName(workspace) {
    const value = parseBackupValue(workspace, STORAGE_KEYS.TEAM_NAME, "");
    return String(value || "").trim() || "Unnamed team";
  }

  function workspaceMetrics(workspace) {
    return [
      { label: "Playbook", local: countCollection(workspace, STORAGE_KEYS.PLAYBOOK), unit: "plays" },
      { label: "Practice scripts", local: countCollection(workspace, STORAGE_KEYS.SAVED_SCRIPTS), unit: "scripts" },
      { label: "Call sheet", local: countCallSheetPlays(workspace), unit: "plays" },
      { label: "Game plans", local: countCollection(workspace, STORAGE_KEYS.GAME_PLAN_BOARDS) + countCollection(workspace, STORAGE_KEYS.GAME_PLAN_SNAPSHOTS), unit: "plans" },
      { label: "Signals", local: countCollection(workspace, STORAGE_KEYS.SIGNALS), unit: "records" },
    ];
  }

  function canonicalKeys() {
    return typeof window.getCanonicalTeamWorkspaceKeys === "function"
      ? window.getCanonicalTeamWorkspaceKeys()
      : [];
  }

  function canonicalWorkspace(backup) {
    if (typeof window.buildCanonicalTeamWorkspace !== "function") {
      throw new Error("Team recovery is still initializing. Please try again.");
    }
    return window.buildCanonicalTeamWorkspace(backup);
  }

  function workspaceChanges(local, incoming) {
    const ignored = new Set(["app", "version", "exportDate"]);
    const labels = {
      [STORAGE_KEYS.PLAYBOOK]: "Playbook",
      [STORAGE_KEYS.SAVED_SCRIPTS]: "Saved scripts",
      [STORAGE_KEYS.CALL_SHEET]: "Call sheet",
      [STORAGE_KEYS.GAME_PLAN_BOARDS]: "Game plan boards",
      [STORAGE_KEYS.GAME_PLAN_SNAPSHOTS]: "Game plan snapshots",
      [STORAGE_KEYS.SIGNALS]: "Signals",
      [STORAGE_KEYS.TEAM_ROSTER]: "Team roster",
      [STORAGE_KEYS.TEAM_NAME]: "Team name",
      [STORAGE_KEYS.PLAYER_PUBLISH_STATUS]: "Player publish status",
    };
    const changes = [];
    canonicalKeys().forEach((key) => {
      if (ignored.has(key)) return;
      const hasLocal = Object.prototype.hasOwnProperty.call(local, key);
      const hasIncoming = Object.prototype.hasOwnProperty.call(incoming, key);
      const localValue = hasLocal ? JSON.stringify(local[key]) : "";
      const incomingValue = hasIncoming ? JSON.stringify(incoming[key]) : "";
      if (localValue === incomingValue) return;
      changes.push({
        key,
        label: labels[key] || key,
        action: !hasLocal && hasIncoming ? "Added" : hasLocal && !hasIncoming ? "Removed" : "Updated",
      });
    });
    return changes;
  }

  function formatDate(value) {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime())
      ? date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : "unknown date";
  }

  function generateId() {
    return `restore_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async function listAllSnapshots(scope = getScope()) {
    return withStore("readonly", async (store) => {
      const index = store.index("scope");
      return requestResult(index.getAll(scope));
    });
  }

  async function listSnapshots(scope = getScope()) {
    const records = await listAllSnapshots(scope);
    const now = Date.now();
    return (records || [])
      .filter((record) => record && Number(record.expiresAt || 0) > now)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  async function saveSnapshot(workspace, source = {}) {
    const validation = storageManager.validateBackup(workspace);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    const record = {
      id: generateId(),
      scope: getScope(),
      createdAt: Date.now(),
      expiresAt: Date.now() + RETENTION_MS,
      state: "created",
      sourceExportDate: String(source.exportDate || ""),
      sourceUpdatedAt: String(source.updatedAt || ""),
      workspace,
    };
    await withStore("readwrite", (store) => requestResult(store.put(record)));
    await pruneSnapshots(record.scope);
    return record;
  }

  async function updateSnapshot(id, changes) {
    return withStore("readwrite", async (store) => {
      const record = await requestResult(store.get(id));
      if (!record) throw new Error("This recovery snapshot is no longer available on this device.");
      const next = { ...record, ...changes, updatedAt: Date.now() };
      await requestResult(store.put(next));
      return next;
    });
  }

  async function pruneSnapshots(scope = getScope()) {
    const allSnapshots = await listAllSnapshots(scope);
    const liveSnapshots = allSnapshots
      .filter((record) => record && Number(record.expiresAt || 0) > Date.now())
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const keep = liveSnapshots.slice(0, MAX_SNAPSHOTS_PER_TEAM);
    const keepIds = new Set(keep.map((record) => record.id));
    const stale = allSnapshots.filter((record) => !keepIds.has(record.id));
    if (!stale.length) return;
    await withStore("readwrite", async (store) => {
      await Promise.all(stale.map((record) => requestResult(store.delete(record.id))));
    });
  }

  async function captureLocalWorkspace() {
    const complete = await storageManager.getAllData();
    return canonicalWorkspace(complete);
  }

  function closeModal(resolveValue = false) {
    const overlay = document.getElementById("stagedRestoreOverlay");
    if (overlay) {
      overlay.classList.remove("visible");
      overlay.style.pointerEvents = "none";
      overlay.setAttribute("aria-hidden", "true");
      setTimeout(() => overlay.remove(), 180);
    }
    const resolver = activeRestore?.resolve;
    activeRestore = null;
    if (typeof resolver === "function") resolver(resolveValue);
  }

  function renderModal() {
    const state = activeRestore;
    if (!state) return;
    const overlay = document.getElementById("stagedRestoreOverlay");
    if (!overlay) return;
    const { incoming, local, changes, remote, applying, snapshot, result, error, historyMode } = state;
    const localMetrics = workspaceMetrics(local);
    const incomingMetrics = workspaceMetrics(incoming);
    const metrics = localMetrics.map((metric, index) => {
      const remoteMetric = incomingMetrics[index];
      return `<div class="staged-restore-metric"><span>${escapeHtml(metric.label)}</span><strong>${metric.local} → ${remoteMetric.local}</strong><small>${escapeHtml(metric.unit)}</small></div>`;
    }).join("");
    const visibleChanges = changes.slice(0, 8).map((change) => `<li><strong>${escapeHtml(change.action)}</strong> ${escapeHtml(change.label)}</li>`).join("");
    const moreChanges = changes.length > 8 ? `<p class="staged-restore-muted">Plus ${changes.length - 8} additional team-safe field${changes.length - 8 === 1 ? "" : "s"}.</p>` : "";
    const importedAt = remote?.summary?.exportDate || remote?.backup?.exportDate || snapshot?.createdAt || "";

    let body = "";
    let actions = "";
    if (result === "applied") {
      body = `
        <div class="staged-restore-result staged-restore-result-ok">
          <strong>Device workspace restored safely.</strong>
          <span>A local recovery snapshot is available until ${escapeHtml(formatDate(snapshot?.expiresAt))}.</span>
        </div>
        <p>Your team workspace was replaced only with server-approved team data. Local drafts, device preferences, upload queues, browser media caches, and player-private progress were not included.</p>`;
      actions = `
        <button type="button" class="btn btn-secondary custom-modal-btn" data-action="rollbackStagedRestore" ${applying ? "disabled" : ""}>Undo This Restore</button>
        <button type="button" class="btn btn-primary custom-modal-btn" data-action="closeStagedRestoreModal">Done</button>`;
    } else if (result === "rolled-back") {
      body = `<div class="staged-restore-result staged-restore-result-ok"><strong>Restore undone.</strong><span>This device is back to its pre-recovery team workspace.</span></div>`;
      actions = `<button type="button" class="btn btn-primary custom-modal-btn" data-action="closeStagedRestoreModal">Done</button>`;
    } else if (historyMode) {
      body = `
        <div class="staged-restore-result staged-restore-result-warn"><strong>Local recovery snapshot</strong><span>Created ${escapeHtml(formatDate(snapshot?.createdAt))}; expires ${escapeHtml(formatDate(snapshot?.expiresAt))}.</span></div>
        <p>Undoing restores the canonical team workspace captured on this device before the recovery. It does not delete cloud media or alter the current server workspace.</p>`;
      actions = `
        <button type="button" class="btn btn-secondary custom-modal-btn" data-action="rollbackStagedRestore" ${applying ? "disabled" : ""}>Undo This Restore</button>
        <button type="button" class="btn custom-modal-btn custom-modal-cancel" data-action="closeStagedRestoreModal">Close</button>`;
    } else {
      body = `
        <div class="staged-restore-flow">
          <span>1. Review</span><span>2. Snapshot this device</span><span>3. Restore team data</span><span>4. Undo if needed</span>
        </div>
        <p>This cloud workspace was saved ${escapeHtml(formatDate(importedAt))}. Before applying it, BCOffense will save this device’s canonical team workspace locally for 30 days.</p>
        <div class="staged-restore-metrics">${metrics}</div>
        <section class="staged-restore-changes">
          <strong>${changes.length ? `${changes.length} team-safe change${changes.length === 1 ? "" : "s"} detected` : "No team-safe differences detected"}</strong>
          ${changes.length ? `<ul>${visibleChanges}</ul>${moreChanges}` : "<p class=\"staged-restore-muted\">The cloud copy matches this device’s canonical team data.</p>"}
        </section>
        <p class="staged-restore-note">Only server-approved team fields can change. Diagrams and videos remain separately versioned in Cloudflare; browser-only state stays on this device.</p>
        ${error ? `<p class="staged-restore-error">${escapeHtml(error)}</p>` : ""}`;
      actions = `
        <button type="button" class="btn custom-modal-btn custom-modal-cancel" data-action="closeStagedRestoreModal" ${applying ? "disabled" : ""}>Cancel</button>
        <button type="button" class="btn btn-primary custom-modal-btn" data-action="confirmStagedRestore" ${applying ? "disabled" : ""}>${applying ? "Saving safety snapshot…" : "Save Snapshot & Restore"}</button>`;
    }

    overlay.innerHTML = `
      <div class="custom-modal staged-restore-modal" role="document">
        <div class="custom-modal-header"><span class="custom-modal-icon">🛟</span><h2 class="custom-modal-title">${historyMode ? "Undo Device Recovery" : "Review Team Workspace Recovery"}</h2></div>
        <div class="custom-modal-body">${body}</div>
        <div class="custom-modal-actions">${actions}</div>
      </div>`;
  }

  function open(remote, opts = {}) {
    if (activeRestore) closeModal(false);
    return new Promise(async (resolve) => {
      try {
        const incoming = canonicalWorkspace(remote?.backup || {});
        const validation = storageManager.validateBackup(incoming);
        if (!validation.valid) throw new Error(validation.errors.join(" "));
        const local = await captureLocalWorkspace();
        activeRestore = {
          resolve,
          remote: { ...remote, backup: incoming },
          opts,
          incoming,
          local,
          changes: workspaceChanges(local, incoming),
          applying: false,
          snapshot: null,
          result: "",
          error: "",
          historyMode: false,
        };
        const existing = document.getElementById("stagedRestoreOverlay");
        existing?.remove();
        const overlay = document.createElement("div");
        overlay.id = "stagedRestoreOverlay";
        overlay.className = "custom-modal-overlay";
        overlay.dataset.action = "closeStagedRestoreModalOverlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Review team workspace recovery");
        document.body.appendChild(overlay);
        renderModal();
        requestAnimationFrame(() => overlay.classList.add("visible"));
      } catch (err) {
        activeRestore = null;
        showToast(err.message || "Could not prepare the recovery preview.", { type: "error", duration: 6000 });
        resolve(false);
      }
    });
  }

  async function confirm() {
    const state = activeRestore;
    if (!state || state.applying || state.result) return false;
    state.applying = true;
    state.error = "";
    renderModal();
    try {
      const snapshot = await saveSnapshot(state.local, {
        exportDate: state.remote?.summary?.exportDate,
        updatedAt: state.remote?.updatedAt,
      });
      state.snapshot = snapshot;
      const restored = await window.applyCloudBackupImmediately(state.remote, {
        ...state.opts,
        confirm: false,
        staged: false,
        reload: false,
        notify: false,
      });
      if (!restored) throw new Error("The workspace was not restored. Your safety snapshot is still available.");
      await updateSnapshot(snapshot.id, { state: "applied", appliedAt: Date.now() });
      state.applying = false;
      state.result = "applied";
      renderModal();
      return true;
    } catch (err) {
      state.applying = false;
      state.error = err.message || "Could not restore this device.";
      renderModal();
      return false;
    }
  }

  async function rollback() {
    const state = activeRestore;
    if (!state?.snapshot || state.applying || state.result === "rolled-back") return false;
    state.applying = true;
    renderModal();
    try {
      const snapshotSummary = storageManager.validateBackup(state.snapshot.workspace);
      if (!snapshotSummary.valid) throw new Error(snapshotSummary.errors.join(" "));
      const restored = await window.applyCloudBackupImmediately({
        backup: state.snapshot.workspace,
        summary: {
          ...snapshotSummary,
          exportDate: state.snapshot.workspace.exportDate || "",
        },
        updatedAt: state.snapshot.createdAt ? new Date(state.snapshot.createdAt).toISOString() : "",
        size: 0,
      }, {
        confirm: false,
        staged: false,
        reload: false,
        notify: false,
        localRollback: true,
      });
      if (!restored) throw new Error("The pre-recovery workspace could not be restored.");
      await updateSnapshot(state.snapshot.id, { state: "rolled-back", rolledBackAt: Date.now() });
      state.applying = false;
      state.result = "rolled-back";
      renderModal();
      return true;
    } catch (err) {
      state.applying = false;
      state.error = err.message || "Could not undo the restore.";
      renderModal();
      return false;
    }
  }

  async function openHistory() {
    if (activeRestore) return;
    try {
      const snapshot = (await listSnapshots()).find((record) => record.state === "applied" || record.state === "created");
      if (!snapshot) {
        showToast("No local recovery snapshot is available on this device.", { type: "info", duration: 4000 });
        return;
      }
      activeRestore = {
        resolve: null,
        remote: null,
        opts: {},
        incoming: snapshot.workspace,
        local: snapshot.workspace,
        changes: [],
        applying: false,
        snapshot,
        result: "",
        error: "",
        historyMode: true,
      };
      const overlay = document.createElement("div");
      overlay.id = "stagedRestoreOverlay";
      overlay.className = "custom-modal-overlay";
      overlay.dataset.action = "closeStagedRestoreModalOverlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Undo device recovery");
      document.body.appendChild(overlay);
      renderModal();
      requestAnimationFrame(() => overlay.classList.add("visible"));
    } catch (err) {
      showToast(err.message || "Could not open recovery history.", { type: "error", duration: 6000 });
    }
  }

  window.stagedRestore = { open, listSnapshots, captureLocalWorkspace };
  window.openStagedRestorePreview = open;
  window.openStagedRestoreHistory = openHistory;
  window.confirmStagedRestore = confirm;
  window.rollbackStagedRestore = rollback;
  window.closeStagedRestoreModal = () => closeModal(false);
})();
