/* play-images.js — Play image storage (IndexedDB)
   Stores per-play images keyed by playSignature(). Survives offline,
   no localStorage quota issues, lazy-loaded into a runtime cache so
   render paths stay synchronous.

   Public API (all global):
     await playImages.ready()                    → opens DB
     await playImages.set(sig, blob)             → store/replace image
     await playImages.delete(sig)                → remove
     await playImages.get(sig)                   → returns Blob or null
     await playImages.keys()                     → array of all sigs
     await playImages.exportAll()                → { sig: dataURL, ... }  (for backup)
     await playImages.importAll(map, opts)       → restore from backup
     playImages.urlFor(sig)                      → cached object URL or null (sync)
     playImages.ensureUrl(sig)                   → load one object URL on demand
     playImages.has(sig)                         → bool (from key cache)
     playImages.signaturesForPlay(play)           → current/source/legacy keys
     playImages.storedSignatureForPlay(play)      → first stored compatible key
     playImages.ensureUrlForPlay(play)            → resolve + load compatible image
     playImages.ensureDisplayUrlForPlay(play)     → strict display-safe image
     playImages.loadKeys()                       → load image keys without blobs
     playImages.buildSyncPlan()                  → manual sync scope counts
     playImages.prefetchAll()                    → load every blob into URL cache
     playImages.compress(file, opts)             → Blob (resize + JPEG re-encode)
*/

(function () {
  const DB_NAME = "bcoffense-images";
  const DB_VERSION = 1;
  const STORE = "playImages";
  const PREFETCH_CONCURRENCY = 4;
  const EXPORT_CONCURRENCY = 3;
  const IMPORT_CONCURRENCY = 3;
  const MAX_SOURCE_BYTES = 14 * 1024 * 1024;
  const PLAY_IMAGE_SOURCE_FIELDS = [
    "type",
    "personnel",
    "formation",
    "formTag1",
    "formTag2",
    "under",
    "back",
    "shift",
    "motion",
    "protection",
    "lineCall",
    "play",
    "playTag1",
    "playTag2",
    "basePlay",
    "oneWord",
    "preferredSituation",
    "preferredDown",
    "preferredDistance",
    "preferredHash",
    "preferredFieldPosition",
    "tempo",
    "practiceFront",
    "practiceDefense",
    "practiceCoverage",
    "practiceBlitz",
    "practiceStunt",
    "keyPlayer1",
    "keyPlayer2",
    "keyPlayer3",
    "keyPlayerName1",
    "keyPlayerName2",
    "keyPlayerName3",
    "constraint1",
    "constraint2",
    "constraint3",
    "hitChart1",
    "hitChart2",
    "hitChart3",
    "deadVs",
    "opponent",
  ];

  let _dbPromise = null;
  const _urlCache = new Map(); // sig → object URL
  const _urlPromiseCache = new Map(); // sig → pending object URL Promise
  const _urlVersions = new Map(); // sig → invalidation counter
  const _knownKeys = new Set();
  const _remoteManifestCache = new Map();
  let _keysPromise = null;
  let _keysLoaded = false;
  let _hoverPreviewInstalled = false;

  function _normalizeSig(sig) {
    return sig === null || sig === undefined ? "" : String(sig);
  }

  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
    return _dbPromise;
  }

  function _tx(mode) {
    return _openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
  }

  async function ready() {
    await _openDB();
    return true;
  }

  async function _put(sig, blob) {
    const store = await _tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(blob, sig);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function _get(sig) {
    const store = await _tx("readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(sig);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function _del(sig) {
    const store = await _tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(sig);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function _clear() {
    const store = await _tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function _keys() {
    const store = await _tx("readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadKeys() {
    if (_keysPromise) return _keysPromise;
    _keysPromise = _keys()
      .then((allKeys) => {
        const normalized = allKeys.map(_normalizeSig).filter(Boolean);
        _knownKeys.clear();
        normalized.forEach((sig) => _knownKeys.add(sig));
        _keysLoaded = true;
        try {
          window.dispatchEvent(
            new CustomEvent("play-images-ready", {
              detail: { count: normalized.length },
            }),
          );
        } catch (_e) { /* ignore */ }
        return normalized;
      })
      .catch((err) => {
        _keysPromise = null;
        _keysLoaded = false;
        throw err;
      });
    return _keysPromise;
  }

  function isKeyCacheReady() {
    return _keysLoaded;
  }

  function _bumpUrlVersion(sig) {
    const key = _normalizeSig(sig);
    if (!key) return;
    _urlVersions.set(key, (_urlVersions.get(key) || 0) + 1);
  }

  function _revoke(sig) {
    const key = _normalizeSig(sig);
    if (!key) return;
    const url = _urlCache.get(key);
    if (url) {
      try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
    }
    _urlCache.delete(key);
    _urlPromiseCache.delete(key);
    _bumpUrlVersion(key);
  }

  function _revokeAll() {
    const touched = new Set([
      ..._knownKeys,
      ..._urlCache.keys(),
      ..._urlPromiseCache.keys(),
    ]);
    _urlCache.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
    });
    _urlCache.clear();
    _urlPromiseCache.clear();
    touched.forEach(_bumpUrlVersion);
  }

  async function _withConcurrency(items, limit, worker) {
    const list = Array.from(items || []);
    if (!list.length) return;
    let index = 0;
    const workers = Array.from(
      { length: Math.max(1, Math.min(limit || 1, list.length)) },
      async () => {
        while (index < list.length) {
          const item = list[index++];
          await worker(item);
        }
      },
    );
    await Promise.all(workers);
  }

  async function set(sig, blob) {
    const key = _normalizeSig(sig);
    if (!key || !blob) return false;
    await _put(key, blob);
    _revoke(key);
    _knownKeys.add(key);
    _keysPromise = null;
    _urlCache.set(key, URL.createObjectURL(blob));
    _emitChange(key);
    return true;
  }

  async function del(sig) {
    const key = _normalizeSig(sig);
    if (!key) return false;
    await _del(key);
    _revoke(key);
    _knownKeys.delete(key);
    _keysPromise = null;
    _emitChange(key);
    return true;
  }

  async function get(sig) {
    const key = _normalizeSig(sig);
    if (!key) return null;
    return _get(key);
  }

  function urlFor(sig) {
    const key = _normalizeSig(sig);
    if (!key) return null;
    return _urlCache.get(key) || null;
  }

  async function ensureUrl(sig) {
    const key = _normalizeSig(sig);
    if (!key) return null;
    const existing = urlFor(key);
    if (existing) return existing;
    const pending = _urlPromiseCache.get(key);
    if (pending) return pending;

    const version = _urlVersions.get(key) || 0;
    const promise = _get(key)
      .then((blob) => {
        if ((_urlVersions.get(key) || 0) !== version) {
          return _urlCache.get(key) || null;
        }
        if (!blob) {
          _knownKeys.delete(key);
          _keysPromise = null;
          return null;
        }
        _knownKeys.add(key);
        const url = URL.createObjectURL(blob);
        _urlCache.set(key, url);
        return url;
      })
      .finally(() => {
        if (_urlPromiseCache.get(key) === promise) _urlPromiseCache.delete(key);
      });
    _urlPromiseCache.set(key, promise);
    return promise;
  }

  function has(sig) {
    const key = _normalizeSig(sig);
    return !!key && (_urlCache.has(key) || _knownKeys.has(key));
  }

  function _findSourcePlay(play) {
    if (!play || typeof play !== "object") return null;
    const runtimeIndex =
      typeof getPlaybookRuntimeIndex === "function"
        ? getPlaybookRuntimeIndex()
        : null;

    if (runtimeIndex?.byPlay?.has(play)) return play;

    const sourceIds = [
      play.playbookId,
      play.sourcePlayId,
      play.originalPlayId,
      play.id,
    ]
      .map(_normalizeSig)
      .filter(Boolean);
    for (const sourceId of sourceIds) {
      const indexed = runtimeIndex?.byId?.get(sourceId);
      if (indexed?.play) return indexed.play;
    }

    const playbook = typeof plays !== "undefined" && Array.isArray(plays)
      ? plays
      : [];
    if (!playbook.length) return null;

    if (typeof getPlayIdentityKey === "function") {
      const sourceKey = getPlayIdentityKey(
        play,
        PLAY_IMAGE_SOURCE_FIELDS,
        { trim: false },
      );
      if (sourceKey) {
        const exact = playbook.find(
          (candidate) =>
            getPlayIdentityKey(candidate, PLAY_IMAGE_SOURCE_FIELDS, {
              trim: false,
            }) === sourceKey,
        );
        if (exact) return exact;
      }
    }

    if (typeof playsMatch === "function") {
      return playbook.find((candidate) => playsMatch(candidate, play)) || null;
    }
    return null;
  }

  function signaturesForPlay(play) {
    if (!play || typeof playSignature !== "function") return [];
    const sourcePlay = _findSourcePlay(play);
    const candidates = [
      play.playbookId,
      play.sourcePlayId,
      play.originalPlayId,
      sourcePlay ? playSignature(sourcePlay) : "",
      playSignature(play),
      sourcePlay && typeof getPlayIdentityKey === "function"
        ? getPlayIdentityKey(sourcePlay, "tag")
        : "",
      typeof getPlayIdentityKey === "function"
        ? getPlayIdentityKey(play, "tag")
        : "",
    ]
      .map(_normalizeSig)
      .filter(Boolean);
    return [...new Set(candidates)];
  }

  function _playbookForImageLookup() {
    return typeof plays !== "undefined" && Array.isArray(plays) ? plays : [];
  }

  function _isUniqueIdentityKey(identityKey, targetPlay, mode = "tag") {
    const key = _normalizeSig(identityKey);
    if (!key || typeof getPlayIdentityKey !== "function") return false;
    const playbook = _playbookForImageLookup();
    if (!playbook.length) return true;
    const matches = playbook.filter(
      (candidate) => getPlayIdentityKey(candidate, mode) === key,
    );
    if (matches.length !== 1) return false;
    if (!targetPlay) return true;
    return (
      matches[0] === targetPlay ||
      (typeof playsMatch === "function" && playsMatch(matches[0], targetPlay))
    );
  }

  function _sourceIdentityKeyForPlay(play) {
    if (!play || typeof getPlayIdentityKey !== "function") return "";
    const sourcePlay = _findSourcePlay(play) || play;
    return getPlayIdentityKey(sourcePlay, PLAY_IMAGE_SOURCE_FIELDS, {
      trim: false,
    });
  }

  function _isSourceIdentityKey(sig) {
    const key = _normalizeSig(sig);
    return Boolean(
      key &&
      key.includes("|") &&
      key.split("|").length === PLAY_IMAGE_SOURCE_FIELDS.length
    );
  }

  function displaySignaturesForPlay(play) {
    if (!play || typeof playSignature !== "function") return [];
    const sourcePlay = _findSourcePlay(play);
    const exactCandidates = [
      play.playbookId,
      play.sourcePlayId,
      play.originalPlayId,
      sourcePlay ? sourcePlay.id : "",
      play.id,
    ]
      .map(_normalizeSig)
      .filter(Boolean);

    const identityCandidates = [];
    const sourceIdentityKey = _sourceIdentityKeyForPlay(sourcePlay || play);
    if (
      sourceIdentityKey &&
      _isUniqueIdentityKey(
        sourceIdentityKey,
        sourcePlay || play,
        PLAY_IMAGE_SOURCE_FIELDS,
      )
    ) {
      identityCandidates.push(sourceIdentityKey);
    }
    if (sourcePlay && typeof getPlayIdentityKey === "function") {
      const sourceTagKey = getPlayIdentityKey(sourcePlay, "tag");
      if (_isUniqueIdentityKey(sourceTagKey, sourcePlay, "tag")) {
        identityCandidates.push(sourceTagKey);
      }
    }
    if (typeof getPlayIdentityKey === "function") {
      const playTagKey = getPlayIdentityKey(play, "tag");
      if (_isUniqueIdentityKey(playTagKey, sourcePlay || play, "tag")) {
        identityCandidates.push(playTagKey);
      }
    }

    return [...new Set([...exactCandidates, ...identityCandidates])];
  }

  function urlForDisplayPlay(play) {
    for (const signature of displaySignaturesForPlay(play)) {
      const url = urlFor(signature);
      if (url) return url;
    }
    return null;
  }

  function urlForPlay(play) {
    for (const signature of signaturesForPlay(play)) {
      const url = urlFor(signature);
      if (url) return url;
    }
    return null;
  }

  // ── Remote (R2-backed) image helpers ───────────────────────────────────
  // Images are pushed to R2 under the content-derived identity key so all
  // auth roles (including players) can fetch them cross-device.

  function _remoteAvailable() {
    return (
      typeof location !== "undefined" &&
      location.protocol !== "file:" &&
      typeof fetch === "function"
    );
  }

  function _remoteIdentityKey(play) {
    return _sourceIdentityKeyForPlay(play);
  }

  function _legacyRemoteIdentityKey(play) {
    const sourcePlay = _findSourcePlay(play) || play;
    if (!sourcePlay || typeof getPlayIdentityKey !== "function") return "";
    const key = getPlayIdentityKey(sourcePlay, "tag") || "";
    return _isUniqueIdentityKey(key, sourcePlay, "tag") ? key : "";
  }

  function _remoteIdentityKeysForPlay(play) {
    return [
      _remoteIdentityKey(play),
      _legacyRemoteIdentityKey(play),
    ]
      .map(_normalizeSig)
      .filter(Boolean)
      .filter((sig, index, list) => list.indexOf(sig) === index);
  }

  async function _remoteErrorMessage(res, fallback) {
    let detail = "";
    try {
      const data = await res.clone().json();
      detail = data && data.error ? data.error : "";
    } catch (_e) {
      try {
        detail = await res.clone().text();
      } catch (_err) {
        detail = "";
      }
    }
    return detail || fallback || `HTTP ${res.status}`;
  }

  async function _putRemoteImage(identityKey, blob) {
    const response = await fetch(
      `/images/file?sig=${encodeURIComponent(identityKey)}`,
      {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-BC-Auth-Mode": "json",
          "Content-Type": blob.type || "image/jpeg",
        },
        body: blob,
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: await _remoteErrorMessage(response, "Play diagram upload failed."),
      };
    }
    return { ok: true, status: response.status };
  }

  async function _fetchRemoteForPlay(play) {
    if (!_remoteAvailable()) return null;
    const identityKeys = _remoteIdentityKeysForPlay(play);
    for (const identityKey of identityKeys) {
      try {
        const res = await fetch(
          `/images/file?sig=${encodeURIComponent(identityKey)}`,
        );
        if (!res.ok) continue;
        const blob = await res.blob();
        if (!blob || blob.size === 0) continue;
        // Cache in IndexedDB under the identity key for future local lookups
        await set(identityKey, blob);
        return _urlCache.get(_normalizeSig(identityKey)) || null;
      } catch (_e) {
        // Try the next compatible remote key.
      }
    }
    return null;
  }

  async function checkRemoteForPlay(play) {
    if (!_remoteAvailable()) {
      return { ok: false, status: "offline", published: false, reason: "offline" };
    }
    const identityKeys = _remoteIdentityKeysForPlay(play);
    if (!identityKeys.length) {
      return { ok: false, status: "unpublished", published: false, reason: "no-stable-key" };
    }
    let lastResult = null;
    for (const identityKey of identityKeys) {
      const cached = _remoteManifestCache.get(identityKey);
      if (cached) {
        if (cached.published) return cached;
        lastResult = cached;
        continue;
      }
      try {
        const response = await fetch(`/images/manifest?sig=${encodeURIComponent(identityKey)}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          const status = response.status === 404 ? "unpublished" : "error";
          const result = {
            ok: false,
            status,
            published: false,
            sig: identityKey,
            reason: `http-${response.status}`,
          };
          _remoteManifestCache.set(identityKey, result);
          lastResult = result;
          if (status === "unpublished") continue;
          continue;
        }
        const data = await response.json().catch(() => null);
        const result = {
          ok: Boolean(data?.ok),
          status: data?.published ? "published" : "unpublished",
          published: Boolean(data?.published),
          sig: identityKey,
          size: Number(data?.size || 0) || 0,
          contentType: data?.contentType || "",
          uploadedAt: data?.uploadedAt || "",
        };
        _remoteManifestCache.set(identityKey, result);
        if (result.published) return result;
        lastResult = result;
      } catch (_err) {
        return { ok: false, status: "offline", published: false, sig: identityKey, reason: "network" };
      }
    }
    return lastResult || { ok: true, status: "unpublished", published: false, sig: identityKeys[0] || "" };
  }

  async function pushRemote(play, blob) {
    if (!_remoteAvailable()) {
      return { ok: false, skipped: true, error: "Cloud image sync is not available on this page." };
    }
    if (!play || !blob) {
      return { ok: false, skipped: true, error: "Missing play or image data." };
    }
    const identityKey = _remoteIdentityKey(play);
    if (!identityKey) {
      return { ok: false, skipped: true, error: "This play does not have a stable cloud image key." };
    }
    try {
      const result = await _putRemoteImage(identityKey, blob);
      if (result.ok && typeof window.recordPlayerPublishStatus === "function") {
        window.recordPlayerPublishStatus("diagrams", {
          label: "Play diagram uploaded to player devices",
        });
      }
      return result;
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Network error while uploading play diagram.",
      };
    }
  }

  async function deleteRemote(play) {
    if (!_remoteAvailable() || !play) return;
    const identityKey = _remoteIdentityKey(play);
    if (!identityKey) return;
    try {
      const response = await fetch(`/images/file?sig=${encodeURIComponent(identityKey)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-BC-Auth-Mode": "json",
        },
      });
      if (response.ok && typeof window.recordPlayerPublishStatus === "function") {
        window.recordPlayerPublishStatus("diagrams", {
          label: "Play diagram removed from player devices",
        });
      }
    } catch (_e) {
      // Fire and forget
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Sync locally-stored images to R2 for cross-device access.
  // Defaults to ALL IndexedDB keys, but manual flows can pass a scoped key list
  // so coaches can avoid uploading old/orphaned diagrams.
  // Returns a detailed result so upload/auth/R2 errors are visible to coaches.
  let _remoteSyncDone = false;
  async function syncToRemote(playsArray, opts = {}) {
    const result = {
      total: 0,
      attempted: 0,
      pushed: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
    if (!_remoteAvailable()) {
      result.errors.push({ error: "Cloud image sync is not available on this page." });
      return result;
    }
    _remoteSyncDone = true;

    const allKeys = await loadKeys();
    const requestedKeys = Array.isArray(opts.keys)
      ? opts.keys.map(_normalizeSig).filter(Boolean)
      : allKeys;
    const scopedKeys = [...new Set(requestedKeys)].filter((sig) => allKeys.includes(sig));
    result.total = scopedKeys.length;
    if (!scopedKeys.length) return result;
    const syncJobKey = typeof window.queueWorkspaceSyncJob === "function"
      ? window.queueWorkspaceSyncJob("media", opts.keys ? "diagram-scope" : "diagram-all", {
        queuedLabel: `${scopedKeys.length} diagram${scopedKeys.length === 1 ? "" : "s"} queued`,
        runningLabel: `Uploading ${scopedKeys.length} diagram${scopedKeys.length === 1 ? "" : "s"}...`,
        doneLabel: `${scopedKeys.length} diagram${scopedKeys.length === 1 ? "" : "s"} published`,
        errorLabel: "Some media uploads need retry",
        retry: () => syncToRemote(playsArray, opts),
      })
      : "";
    if (syncJobKey && typeof window.startWorkspaceSyncJob === "function") {
      window.startWorkspaceSyncJob(syncJobKey, {
        label: `Uploading ${scopedKeys.length} diagram${scopedKeys.length === 1 ? "" : "s"}...`,
      });
    }

    // Build a reverse map: localSig → full identity key for R2.
    // Old short field-derived keys are only migrated when they map to one play.
    const identityKeyFor = (localSig) => {
      if (_isSourceIdentityKey(localSig)) return localSig;
      // Otherwise find a matching play and derive the identity key
      if (Array.isArray(playsArray)) {
        for (const play of playsArray) {
          const sigs = displaySignaturesForPlay(play);
          if (sigs.includes(localSig)) {
            const ik = _remoteIdentityKey(play);
            if (ik) return ik;
          }
        }
      }
      return "";
    };

    await _withConcurrency(scopedKeys, 2, async (localSig) => {
      try {
        const identityKey = identityKeyFor(localSig);
        if (!identityKey) {
          result.skipped += 1;
          if (result.errors.length < 5) {
            result.errors.push({ sig: localSig, error: "No unique matching play was found for this local diagram. Reattach it from the correct Playbook row, then push again." });
          }
          return;
        }
        const blob = await get(localSig);
        if (!blob) {
          result.skipped += 1;
          if (result.errors.length < 5) {
            result.errors.push({ sig: localSig, error: "The local diagram blob could not be read." });
          }
          return;
        }
        result.attempted += 1;
        const uploaded = await _putRemoteImage(identityKey, blob);
        if (uploaded.ok) {
          result.pushed += 1;
        } else {
          result.failed += 1;
          if (result.errors.length < 5) {
            result.errors.push({
              sig: localSig,
              status: uploaded.status || 0,
              error: uploaded.error || "Upload failed.",
            });
          }
        }
      } catch (err) {
        result.failed += 1;
        if (result.errors.length < 5) {
          result.errors.push({
            sig: localSig,
            error: err && err.message ? err.message : "Network error while uploading diagram.",
          });
        }
      }
    });
    if (result.pushed > 0 && typeof window.recordPlayerPublishStatus === "function") {
      window.recordPlayerPublishStatus("diagrams", {
        count: result.pushed,
        label: `${result.pushed} diagram${result.pushed === 1 ? "" : "s"} synced to player devices`,
      });
    }
    if (typeof window.setWorkspaceSyncStatus === "function") {
      const hasUploadIssues = result.failed > 0 || result.skipped > 0;
      if (syncJobKey && hasUploadIssues && typeof window.failWorkspaceSyncJob === "function") {
        window.failWorkspaceSyncJob(syncJobKey, new Error("Some media uploads need retry"), {
          label: "Some media uploads need retry",
          retry: () => syncToRemote(playsArray, opts),
        });
      } else if (syncJobKey && typeof window.completeWorkspaceSyncJob === "function") {
        window.completeWorkspaceSyncJob(syncJobKey, {
          label: `${result.pushed} diagram${result.pushed === 1 ? "" : "s"} published`,
        });
      } else {
        window.setWorkspaceSyncStatus(
          "media",
          hasUploadIssues ? "error" : "synced",
          {
            label: hasUploadIssues
              ? "Some media uploads need retry"
              : `${result.pushed} diagram${result.pushed === 1 ? "" : "s"} published`,
          },
        );
      }
    }
    return result;
  }

  function _playListDiagramKeys(playsArray, allKeys) {
    if (!Array.isArray(playsArray) || !Array.isArray(allKeys) || !allKeys.length) {
      return [];
    }
    const signatures = new Set();
    playsArray
      .filter((play) => play && !play.isSeparator)
      .forEach((play) => {
        displaySignaturesForPlay(play).forEach((sig) => signatures.add(_normalizeSig(sig)));
      });
    return allKeys.filter((sig) => signatures.has(_normalizeSig(sig)));
  }

  function _publishedScriptPlays() {
    if (typeof getPlayerPublishedScripts !== "function") return [];
    return getPlayerPublishedScripts()
      .flatMap((savedScript) => Array.isArray(savedScript?.plays) ? savedScript.plays : [])
      .filter((play) => play && !play.isSeparator);
  }

  async function buildSyncPlan() {
    const allKeys = await loadKeys();
    const currentPlays = typeof plays !== "undefined" && Array.isArray(plays)
      ? plays.filter((play) => play && !play.isSeparator)
      : [];
    const publishedPlays = _publishedScriptPlays();
    const playerKeys = _playListDiagramKeys(publishedPlays, allKeys);
    const currentKeys = _playListDiagramKeys(currentPlays, allKeys);
    const currentOnlyKeys = currentKeys.filter((sig) => !playerKeys.includes(sig));
    const orphanKeys = allKeys.filter((sig) => !currentKeys.includes(sig) && !playerKeys.includes(sig));
    const recommendedScope = playerKeys.length
      ? "player"
      : currentKeys.length
        ? "current"
        : "all";
    return {
      allKeys,
      currentKeys,
      currentOnlyKeys,
      orphanKeys,
      playerKeys,
      currentPlays,
      publishedPlays,
      recommendedScope,
    };
  }

  function _publishMediaTimestamp(value) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function _publishMediaPlayLabel(play) {
    return [
      play?.formation,
      play?.motion,
      play?.play,
      play?.playTag1,
      play?.playTag2,
    ].filter(Boolean).join(" ") || "Unnamed play";
  }

  function _publishMediaScriptSource(scriptRecord) {
    return scriptRecord?.name || scriptRecord?.date || "Published script";
  }

  function _publishMediaStatusLabel(status) {
    if (status === "ready") return "Ready";
    if (status === "stale") return "Stale";
    if (status === "unpublished") return "Unpublished";
    if (status === "failed") return "Needs fix";
    return "Missing";
  }

  async function buildPlayerMediaPublishReport() {
    const allKeys = await loadKeys();
    if (window.playClips && typeof window.playClips.loadIndex === "function") {
      try { await window.playClips.loadIndex(); } catch (_err) { /* keep report best-effort */ }
    }
    const publishedScripts = typeof getPlayerPublishedScripts === "function"
      ? getPlayerPublishedScripts()
      : [];
    const publishedPlayEntries = publishedScripts.flatMap((savedScript) =>
      (Array.isArray(savedScript?.plays) ? savedScript.plays : [])
        .filter((play) => play && !play.isSeparator)
        .map((play) => ({ play, script: savedScript })),
    );
    const latestScriptAt = publishedScripts.reduce((max, savedScript) => {
      const ts = Math.max(
        _publishMediaTimestamp(savedScript.playerPublishedAt),
        _publishMediaTimestamp(savedScript.savedAt),
        _publishMediaTimestamp(savedScript.date ? `${savedScript.date}T00:00:00` : ""),
      );
      return Math.max(max, ts);
    }, 0);
    const publishStatus = typeof getPlayerPublishStatus === "function"
      ? getPlayerPublishStatus()
      : {};
    const diagramStatus = publishStatus.diagrams || {};
    const lastDiagramPublishAt = _publishMediaTimestamp(diagramStatus.updatedAt);
    const publishableKeys = new Set();
    const rows = publishedPlayEntries.map(({ play, script }, index) => {
      const localSig = storedDisplaySignatureForPlay(play);
      const identityKey = _remoteIdentityKey(play);
      const hasClip = Boolean(
        window.playClips &&
        typeof window.playClips.hasForPlay === "function" &&
        window.playClips.hasForPlay(play)
      );
      let diagramStatusName = "missing";
      let detail = "No local player-safe diagram found on this device.";
      if (localSig && !identityKey) {
        diagramStatusName = "failed";
        detail = "Diagram exists locally, but this play does not have a stable cloud media key.";
      } else if (localSig && !lastDiagramPublishAt) {
        diagramStatusName = "unpublished";
        detail = "Diagram is local and ready to publish.";
      } else if (localSig && latestScriptAt > lastDiagramPublishAt + 500) {
        diagramStatusName = "stale";
        detail = "Player-visible scripts changed after the last diagram publish.";
      } else if (localSig) {
        diagramStatusName = "ready";
        detail = "Diagram publish is current for the player-visible scripts.";
      }
      if (localSig && identityKey && ["unpublished", "stale"].includes(diagramStatusName)) {
        publishableKeys.add(localSig);
      }
      return {
        index,
        play,
        script,
        source: _publishMediaScriptSource(script),
        label: _publishMediaPlayLabel(play),
        localSig,
        identityKey,
        diagramStatus: diagramStatusName,
        detail,
        hasClip,
      };
    });
    const counts = rows.reduce((acc, row) => {
      acc[row.diagramStatus] = (acc[row.diagramStatus] || 0) + 1;
      if (row.hasClip) acc.clipReady += 1;
      else acc.clipMissing += 1;
      return acc;
    }, {
      ready: 0,
      stale: 0,
      unpublished: 0,
      missing: 0,
      failed: 0,
      clipReady: 0,
      clipMissing: 0,
    });
    const playerKeys = _playListDiagramKeys(rows.map((row) => row.play), allKeys);
    return {
      publishedScripts,
      rows,
      counts,
      latestScriptAt,
      lastDiagramPublishAt,
      lastDiagramPublishLabel: diagramStatus.label || "",
      publishableKeys: [...publishableKeys],
      allPlayerKeys: playerKeys,
    };
  }

  function _renderPublishMediaRow(row) {
    return `<div class="pb-publish-media-row pb-publish-media-row--${escapeAttr(row.diagramStatus)}">
      <div>
        <strong>${escapeHtml(row.label)}</strong>
        <span>${escapeHtml(row.source)} · ${escapeHtml(_publishMediaStatusLabel(row.diagramStatus))}${row.hasClip ? " · Clip ready" : " · No clip"}</span>
        <small>${escapeHtml(row.detail)}</small>
      </div>
      <span class="pb-publish-media-chip">${escapeHtml(row.hasClip ? "Clip" : "No clip")}</span>
    </div>`;
  }

  function renderPlayerMediaPublishReport(report) {
    const total = report.rows.length;
    const readyPct = total
      ? Math.round((report.counts.ready / total) * 100)
      : 0;
    const scoreClass = readyPct >= 90
      ? "is-good"
      : readyPct >= 65
        ? "is-warn"
        : "is-poor";
    const issueRows = report.rows
      .filter((row) => row.diagramStatus !== "ready" || !row.hasClip)
      .slice(0, 14)
      .map(_renderPublishMediaRow)
      .join("");
    const readyRows = report.rows
      .filter((row) => row.diagramStatus === "ready" && row.hasClip)
      .slice(0, 8)
      .map(_renderPublishMediaRow)
      .join("");
    const latestText = report.latestScriptAt
      ? new Date(report.latestScriptAt).toLocaleString()
      : "No player-visible script";
    const diagramText = report.lastDiagramPublishAt
      ? new Date(report.lastDiagramPublishAt).toLocaleString()
      : "Never published";
    return `
      <div class="pb-health-summary pb-publish-media-summary">
        <div class="pb-health-score ${scoreClass}">
          <strong>${readyPct}%</strong>
          <span>Media readiness</span>
        </div>
        <div class="pb-health-card"><strong>${report.publishedScripts.length}</strong><span>Player scripts</span></div>
        <div class="pb-health-card"><strong>${total}</strong><span>Script plays</span></div>
        <div class="pb-health-card"><strong>${report.counts.ready}</strong><span>Ready diagrams</span></div>
        <div class="pb-health-card"><strong>${report.publishableKeys.length}</strong><span>Diagrams to publish</span></div>
        <div class="pb-health-card"><strong>${report.counts.missing}</strong><span>Missing diagrams</span></div>
        <div class="pb-health-card"><strong>${report.counts.clipReady}</strong><span>Ready clips</span></div>
        <div class="pb-health-card"><strong>${report.counts.clipMissing}</strong><span>No clip</span></div>
      </div>
      <div class="pb-health-guidance">
        Publish Media checks player-visible scripts first. It uploads only local player-safe diagrams that are unpublished or stale. Video clips are already cloud-hosted when uploaded, so this report flags missing clips instead of re-uploading them.
      </div>
      <div class="pb-publish-media-meta">
        <span>Latest player script: <strong>${escapeHtml(latestText)}</strong></span>
        <span>Last diagram publish: <strong>${escapeHtml(diagramText)}</strong></span>
      </div>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Needs Attention</h4>
          <span>${report.publishableKeys.length} publishable · ${report.counts.missing} missing · ${report.counts.failed} failed</span>
        </div>
        ${issueRows || `<div class="pb-health-empty">All player-visible script plays have current diagrams and clips.</div>`}
        ${report.rows.length > 14 ? `<div class="pb-health-more">Showing top 14 media items.</div>` : ""}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Ready Sample</h4>
          <span>${report.counts.ready} current diagrams</span>
        </div>
        ${readyRows || `<div class="pb-health-empty">No fully ready play media found yet.</div>`}
      </section>`;
  }

  function _diagramCountLabel(count) {
    return `${count} diagram${count === 1 ? "" : "s"}`;
  }

  function _diagramVerb(count, singular, plural) {
    return count === 1 ? singular : plural;
  }

  function _syncScopeFromChoice(plan, choice) {
    if (choice === "option2") {
      return {
        keys: plan.allKeys,
        plays: typeof plays !== "undefined" && Array.isArray(plays) ? plays : [],
        label: `all ${_diagramCountLabel(plan.allKeys.length)} on this device`,
      };
    }
    if (plan.recommendedScope === "player") {
      return {
        keys: plan.playerKeys,
        plays: plan.publishedPlays,
        label: `${_diagramCountLabel(plan.playerKeys.length)} used by player-visible scripts`,
      };
    }
    if (plan.recommendedScope === "current") {
      return {
        keys: plan.currentKeys,
        plays: plan.currentPlays,
        label: `${_diagramCountLabel(plan.currentKeys.length)} matching the current playbook`,
      };
    }
    return {
      keys: plan.allKeys,
      plays: typeof plays !== "undefined" && Array.isArray(plays) ? plays : [],
      label: `all ${_diagramCountLabel(plan.allKeys.length)} on this device`,
    };
  }

  async function ensureUrlForPlay(play) {
    for (const signature of signaturesForPlay(play)) {
      const url = await ensureUrl(signature);
      if (url) return url;
    }
    // Not found locally — try R2 using the content-derived identity key
    return _fetchRemoteForPlay(play);
  }

  async function ensureDisplayUrlForPlay(play) {
    for (const signature of displaySignaturesForPlay(play)) {
      const url = await ensureUrl(signature);
      if (url) return url;
    }
    return _fetchRemoteForPlay(play);
  }

  async function ensureDisplayReadinessForPlay(play) {
    for (const signature of displaySignaturesForPlay(play)) {
      const url = await ensureUrl(signature);
      if (url) {
        return {
          status: "ready",
          source: "local",
          url,
          message: "Diagram ready",
        };
      }
    }
    const remote = await checkRemoteForPlay(play);
    if (remote.status === "offline") {
      return {
        status: "offline",
        source: "remote",
        url: "",
        message: "Offline - diagram saved locally only if already loaded on this device.",
      };
    }
    if (!remote.published) {
      return {
        status: "unpublished",
        source: "remote",
        url: "",
        message: "Diagram has not been published for players yet.",
      };
    }
    const url = await _fetchRemoteForPlay(play);
    if (url) {
      return {
        status: "ready",
        source: "remote",
        url,
        message: "Diagram ready",
      };
    }
    return {
      status: "load-error",
      source: "remote",
      url: "",
      message: "Diagram is published but could not be loaded.",
    };
  }

  function hasForPlay(play) {
    return signaturesForPlay(play).some(has);
  }

  function hasDisplayForPlay(play) {
    return displaySignaturesForPlay(play).some(has);
  }

  function storedSignatureForPlay(play) {
    return signaturesForPlay(play).find(has) || "";
  }

  function storedDisplaySignatureForPlay(play) {
    return displaySignaturesForPlay(play).find(has) || "";
  }

  async function deleteForPlay(play) {
    const signatures = signaturesForPlay(play);
    if (!signatures.length) return false;
    await Promise.all(signatures.map((signature) => del(signature)));
    return true;
  }

  async function keys() {
    return loadKeys();
  }

  async function prefetchAll() {
    const allKeys = await loadKeys();
    const missing = allKeys.filter((sig) => !_urlCache.has(sig));
    await _measure("playImages.prefetchAll", () =>
      _withConcurrency(missing, PREFETCH_CONCURRENCY, ensureUrl),
    );
    _emitChange(null);
    return allKeys.length;
  }

  function _emitChange(sig) {
    try {
      window.dispatchEvent(new CustomEvent("play-images-changed", { detail: { sig } }));
    } catch (_e) { /* ignore */ }
  }

  /* Adaptive optimization: retain presentation-grade dimensions and preserve
     lossless PNG line art when its source size is reasonable. */
  async function compress(file, opts = {}) {
    if (!file) throw new Error("No image file selected");
    if (file.type && !file.type.startsWith("image/")) {
      throw new Error("Only image files can be attached");
    }
    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error(`Image is too large (${_formatBytes(file.size)}). Use an image under ${_formatBytes(MAX_SOURCE_BYTES)}.`);
    }
    const maxDim = Math.max(400, Math.min(3200, opts.maxDim || 2400));
    const quality = Math.min(0.96, Math.max(0.7, opts.quality || 0.9));

    return _measure("playImages.compress", async () => {
      const bitmap = await _decodeImage(file);
      const w0 = bitmap.width || bitmap.naturalWidth || 0;
      const h0 = bitmap.height || bitmap.naturalHeight || 0;
      if (!w0 || !h0) {
        if (typeof bitmap.close === "function") bitmap.close();
        throw new Error("Image dimensions could not be read");
      }
      const scale = Math.min(1, maxDim / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      const mime =
        opts.mime ||
        (file.type === "image/png" && file.size <= 4 * 1024 * 1024
          ? "image/png"
          : "image/webp");

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (typeof bitmap.close === "function") bitmap.close();
        throw new Error("Image canvas could not be created");
      }
      try {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, w, h);
      } finally {
        if (typeof bitmap.close === "function") bitmap.close();
      }

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (encoded) => (encoded ? resolve(encoded) : reject(new Error("Image encode failed"))),
          mime,
          quality,
        );
      });
      blob.originalSize = file.size || 0;
      blob.originalName = file.name || "";
      blob.outputWidth = w;
      blob.outputHeight = h;
      blob.outputMime = blob.type || mime;
      return blob;
    }, { sourceBytes: file.size || 0 });
  }

  async function _decodeImage(file) {
    if (typeof createImageBitmap === "function") {
      try { return await createImageBitmap(file); }
      catch (_e) { /* fall through */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image load failed"));
      };
      img.src = url;
    });
  }

  /* Backup helpers — base64 data URLs so they survive a JSON backup file. */
  async function exportAll(opts = {}) {
    const out = {};
    const allKeys = await loadKeys();
    const total = allKeys.length;
    let done = 0;
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    if (onProgress) onProgress(0, total);
    await _measure("playImages.exportAll", () =>
      _withConcurrency(allKeys, EXPORT_CONCURRENCY, async (sig) => {
        const blob = await _get(sig);
        if (blob) {
          out[sig] = await _blobToDataURL(blob);
        } else {
          _knownKeys.delete(sig);
        }
        done += 1;
        if (onProgress) onProgress(done, total);
      }),
      { count: total },
    );
    return out;
  }

  async function importAll(map, opts = {}) {
    if (!map || typeof map !== "object") return 0;
    const replace = opts && opts.replace === true;
    if (replace) {
      await _clear();
      _revokeAll();
      _knownKeys.clear();
      _keysPromise = null;
    }
    let n = 0;
    const entries = Object.entries(map);
    const total = entries.length;
    let done = 0;
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    if (onProgress) onProgress(0, total);
    await _measure("playImages.importAll", () =>
      _withConcurrency(entries, IMPORT_CONCURRENCY, async ([rawSig, dataURL]) => {
        const sig = _normalizeSig(rawSig);
        try {
          if (!sig || typeof dataURL !== "string") return;
          const blob = await _dataURLToBlob(dataURL);
          if (blob) {
            await _put(sig, blob);
            _revoke(sig);
            _knownKeys.add(sig);
            _keysPromise = null;
            n++;
          }
        } finally {
          done += 1;
          if (onProgress) onProgress(done, total);
        }
      }),
      { count: total },
    );
    _keysPromise = null;
    _emitChange(null);
    return n;
  }

  async function stats() {
    const allKeys = await loadKeys();
    let totalBytes = 0;
    let count = 0;
    await _withConcurrency(allKeys, EXPORT_CONCURRENCY, async (sig) => {
      const blob = await _get(sig);
      if (!blob) return;
      count += 1;
      totalBytes += blob.size || 0;
    });
    return {
      count,
      totalBytes,
      totalSizeFormatted: _formatBytes(totalBytes),
    };
  }

  function describeCompression(sourceFile, blob) {
    const sourceBytes = (sourceFile && sourceFile.size) || blob?.originalSize || 0;
    const outputBytes = (blob && blob.size) || 0;
    const savedBytes = Math.max(0, sourceBytes - outputBytes);
    const savedPct = sourceBytes ? Math.round((savedBytes / sourceBytes) * 100) : 0;
    return {
      sourceBytes,
      outputBytes,
      savedBytes,
      savedPct,
      sourceFormatted: _formatBytes(sourceBytes),
      outputFormatted: _formatBytes(outputBytes),
      savedFormatted: _formatBytes(savedBytes),
      dimensions:
        blob && blob.outputWidth && blob.outputHeight
          ? `${blob.outputWidth}×${blob.outputHeight}`
          : "",
      mime: blob?.outputMime || blob?.type || "",
    };
  }

  function _formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB"];
    let size = value / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }

  function _measure(name, fn, meta = {}) {
    if (
      typeof window !== "undefined" &&
      window.perfMonitor &&
      typeof window.perfMonitor.measure === "function"
    ) {
      return window.perfMonitor.measure(name, fn, meta);
    }
    return fn();
  }

  function _blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function _dataURLToBlob(dataURL) {
    try {
      if (typeof dataURL !== "string" || !dataURL.startsWith("data:image/")) {
        return null;
      }
      const res = await fetch(dataURL);
      return await res.blob();
    } catch (_e) {
      return null;
    }
  }

  const SMART_DIAGRAM_SAMPLE_MAX = 480;
  const SMART_DIAGRAM_MAX_RENDER_PIXELS = 4_000_000;
  const SMART_DIAGRAM_MAX_RENDER_EDGE = 2048;

  function _loadSmartDiagramImage(url, alt = "Play diagram") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.alt = alt;
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Play diagram could not be decoded"));
      img.src = url;
      if (img.complete && img.naturalWidth) resolve(img);
    });
  }

  function _smartDiagramBackgroundColor(data, width, height) {
    const bins = new Map();
    const edgeStep = Math.max(1, Math.floor(Math.min(width, height) / 80));
    const addPixel = (x, y) => {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 24) return;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const key = `${red >> 5}|${green >> 5}|${blue >> 5}`;
      const bin = bins.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
      bin.count += 1;
      bin.red += red;
      bin.green += green;
      bin.blue += blue;
      bins.set(key, bin);
    };
    for (let x = 0; x < width; x += edgeStep) {
      addPixel(x, 0);
      addPixel(x, height - 1);
    }
    for (let y = 0; y < height; y += edgeStep) {
      addPixel(0, y);
      addPixel(width - 1, y);
    }
    const background = [...bins.values()].sort((a, b) => b.count - a.count)[0];
    if (!background?.count) return { red: 255, green: 255, blue: 255 };
    return {
      red: background.red / background.count,
      green: background.green / background.count,
      blue: background.blue / background.count,
    };
  }

  function getSmartDiagramContentBounds(image) {
    const sourceWidth = image.naturalWidth || image.width || 0;
    const sourceHeight = image.naturalHeight || image.height || 0;
    if (!sourceWidth || !sourceHeight) return null;
    const sampleScale = Math.min(
      1,
      SMART_DIAGRAM_SAMPLE_MAX / Math.max(sourceWidth, sourceHeight),
    );
    const sampleWidth = Math.max(1, Math.round(sourceWidth * sampleScale));
    const sampleHeight = Math.max(1, Math.round(sourceHeight * sampleScale));
    const sample = document.createElement("canvas");
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    let pixels;
    try {
      pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    } catch (_err) {
      return null;
    }
    const background = _smartDiagramBackgroundColor(pixels, sampleWidth, sampleHeight);
    const rowCounts = new Uint32Array(sampleHeight);
    const columnCounts = new Uint32Array(sampleWidth);
    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        const index = (y * sampleWidth + x) * 4;
        const alpha = pixels[index + 3];
        if (alpha < 24) continue;
        const distance = Math.max(
          Math.abs(pixels[index] - background.red),
          Math.abs(pixels[index + 1] - background.green),
          Math.abs(pixels[index + 2] - background.blue),
        );
        if (distance < 28) continue;
        rowCounts[y] += 1;
        columnCounts[x] += 1;
      }
    }
    const minimumRowPixels = Math.max(3, Math.round(sampleWidth * 0.006));
    const minimumColumnPixels = Math.max(3, Math.round(sampleHeight * 0.006));
    const top = rowCounts.findIndex((count) => count >= minimumRowPixels);
    let bottom = sampleHeight - 1;
    while (bottom >= 0 && rowCounts[bottom] < minimumRowPixels) bottom -= 1;
    const left = columnCounts.findIndex((count) => count >= minimumColumnPixels);
    let right = sampleWidth - 1;
    while (right >= 0 && columnCounts[right] < minimumColumnPixels) right -= 1;
    if (top < 0 || left < 0 || bottom <= top || right <= left) return null;
    const scaleX = sourceWidth / sampleWidth;
    const scaleY = sourceHeight / sampleHeight;
    const paddingX = sourceWidth * 0.032;
    const paddingY = sourceHeight * 0.032;
    const bounds = {
      x: Math.max(0, left * scaleX - paddingX),
      y: Math.max(0, top * scaleY - paddingY),
      width: Math.min(sourceWidth, (right + 1) * scaleX + paddingX),
      height: Math.min(sourceHeight, (bottom + 1) * scaleY + paddingY),
    };
    bounds.width -= bounds.x;
    bounds.height -= bounds.y;
    if (bounds.width < sourceWidth * 0.2 || bounds.height < sourceHeight * 0.2) return null;
    return bounds;
  }

  function getSmartDiagramAspectCrop(image, contentBounds, targetAspect) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const full = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
    if (!contentBounds || !targetAspect) return { ...full, smartFit: false };
    const crop = { ...contentBounds };
    const contentAspect = crop.width / crop.height;
    if (contentAspect < targetAspect) {
      const desiredWidth = crop.height * targetAspect;
      if (desiredWidth > sourceWidth) return { ...crop, smartFit: false, whitespaceTrimmed: true };
      crop.x = Math.max(0, Math.min(sourceWidth - desiredWidth, crop.x + crop.width / 2 - desiredWidth / 2));
      crop.width = desiredWidth;
    } else if (contentAspect > targetAspect) {
      const desiredHeight = crop.width / targetAspect;
      if (desiredHeight > sourceHeight) return { ...crop, smartFit: false, whitespaceTrimmed: true };
      crop.y = Math.max(0, Math.min(sourceHeight - desiredHeight, crop.y + crop.height / 2 - desiredHeight / 2));
      crop.height = desiredHeight;
    }
    return { ...crop, smartFit: true };
  }

  function _smartDiagramCanvasSize(frame) {
    const rect = frame.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width || frame.clientWidth || 1));
    const cssHeight = Math.max(1, Math.round(rect.height || frame.clientHeight || 1));
    let scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    scale = Math.min(
      scale,
      SMART_DIAGRAM_MAX_RENDER_EDGE / cssWidth,
      SMART_DIAGRAM_MAX_RENDER_EDGE / cssHeight,
      Math.sqrt(SMART_DIAGRAM_MAX_RENDER_PIXELS / (cssWidth * cssHeight)),
    );
    return {
      cssWidth,
      cssHeight,
      pixelWidth: Math.max(1, Math.round(cssWidth * scale)),
      pixelHeight: Math.max(1, Math.round(cssHeight * scale)),
      pixelRatio: scale,
    };
  }

  function drawSmartDiagram(canvas, frame, image, options = {}) {
    const size = _smartDiagramCanvasSize(frame);
    if (canvas.width !== size.pixelWidth || canvas.height !== size.pixelHeight) {
      canvas.width = size.pixelWidth;
      canvas.height = size.pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Smart diagram canvas could not be created");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = options.background || "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = options.filter || "contrast(1.045) saturate(1.015)";
    const bounds = getSmartDiagramContentBounds(image);
    const targetAspect = size.cssWidth / size.cssHeight;
    const crop = getSmartDiagramAspectCrop(image, bounds, targetAspect);
    const cropAspect = crop.width / crop.height;
    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    let drawX = 0;
    let drawY = 0;
    if (!crop.smartFit && Math.abs(cropAspect - targetAspect) > 0.01) {
      const containScale = Math.min(canvas.width / crop.width, canvas.height / crop.height);
      drawWidth = crop.width * containScale;
      drawHeight = crop.height * containScale;
      drawX = (canvas.width - drawWidth) / 2;
      drawY = (canvas.height - drawHeight) / 2;
    }
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, drawX, drawY, drawWidth, drawHeight);
    context.filter = "none";
    canvas.dataset.smartFit = crop.smartFit
      ? "fill"
      : crop.whitespaceTrimmed
        ? "trimmed-contain"
        : "contain";
    canvas.dataset.sourceSize = `${image.naturalWidth || image.width}x${image.naturalHeight || image.height}`;
    canvas.dataset.renderSize = `${canvas.width}x${canvas.height}`;
    canvas.dataset.pixelRatio = size.pixelRatio.toFixed(2);
    return crop;
  }

  async function renderSmartDiagramImage(img, url = img?.currentSrc || img?.src || "", options = {}) {
    if (!img || !url || typeof document === "undefined") return null;
    const frame = options.frame || img.parentElement;
    if (!frame) return null;
    const alt = options.alt || img.getAttribute("alt") || "Play diagram";
    const image = await _loadSmartDiagramImage(url, alt);
    const canvas = document.createElement("canvas");
    canvas.className = options.canvasClass || "smart-diagram-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", alt);
    canvas.dataset.smartDiagramCanvas = "true";
    drawSmartDiagram(canvas, frame, image, options);
    const previous = frame.querySelector(":scope > canvas[data-smart-diagram-canvas='true']");
    if (previous) previous.remove();
    img.dataset.smartDiagramSource = "true";
    img.hidden = true;
    frame.appendChild(canvas);
    return canvas;
  }

  function hydrateSmartDiagramImages(root = document) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll("img[data-smart-diagram='true']").forEach((img) => {
      if (img.dataset.smartDiagramHydrating === "true") return;
      const url = img.currentSrc || img.src || img.getAttribute("src") || "";
      if (!url) return;
      img.dataset.smartDiagramHydrating = "true";
      renderSmartDiagramImage(img, url)
        .catch(() => {
          img.hidden = false;
        })
        .finally(() => {
          img.dataset.smartDiagramHydrating = "false";
        });
    });
  }

  window.playImages = {
    ready,
    set,
    delete: del,
    get,
    keys,
    has,
    urlFor,
    ensureUrl,
    signaturesForPlay,
    displaySignaturesForPlay,
    urlForPlay,
    urlForDisplayPlay,
    ensureUrlForPlay,
    ensureDisplayUrlForPlay,
    ensureDisplayReadinessForPlay,
    checkRemoteForPlay,
    hasForPlay,
    hasDisplayForPlay,
    storedSignatureForPlay,
    storedDisplaySignatureForPlay,
    deleteForPlay,
    loadKeys,
    isKeyCacheReady,
    buildSyncPlan,
    buildPlayerMediaPublishReport,
    prefetchAll,
    compress,
    describeCompression,
    stats,
    exportAll,
    importAll,
    pushRemote,
    deleteRemote,
    syncToRemote,
    getSmartDiagramContentBounds,
    getSmartDiagramAspectCrop,
    drawSmartDiagram,
    renderSmartDiagramImage,
    hydrateSmartDiagramImages,
  };

  // Convenience helpers that take a Play object directly
  window.getPlayImageUrl = function (play) {
    return urlForDisplayPlay(play);
  };
  window.ensurePlayImageUrl = function (play) {
    return ensureDisplayUrlForPlay(play);
  };
  window.hasPlayImage = function (play) {
    return hasDisplayForPlay(play);
  };
  window.deletePlayImage = function (play) {
    // Remove from R2 so all devices reflect the deletion
    deleteRemote(play).catch(() => { });
    return deleteForPlay(play);
  };

  function _diagramHealthPlayLabel(play) {
    return [
      play?.formation,
      play?.motion,
      play?.play,
      play?.playTag1,
      play?.playTag2,
    ].filter(Boolean).join(" ") || "Unnamed play";
  }

  function _diagramHealthPlayMeta(play) {
    return [
      play?.type,
      play?.personnel ? `${play.personnel} pers` : "",
      play?.basePlay ? `Base: ${play.basePlay}` : "",
      play?.preferredDown ? `D${play.preferredDown}` : "",
      play?.preferredDistance,
    ].filter(Boolean).join(" · ");
  }

  function _diagramHealthRow({ play, index, status, detail, sig = "" }) {
    return `<div class="pb-diagram-health-row pb-diagram-health-row--${escapeAttr(status)}">
      <div>
        <button type="button" class="pb-health-play-link" data-action="openPlayDiagramHealthEdit" data-arg="${Number(index)}">
          #${Number(index) + 1} ${escapeHtml(_diagramHealthPlayLabel(play))}
        </button>
        <span>${escapeHtml(_diagramHealthPlayMeta(play) || detail || "No play metadata")}</span>
        ${sig ? `<code>${escapeHtml(sig)}</code>` : ""}
      </div>
      <button type="button" class="btn btn-xs" data-action="openPlayDiagramHealthEdit" data-arg="${Number(index)}">Edit</button>
    </div>`;
  }

  function _diagramHealthKeyRow(item) {
    const label = item.matches.length
      ? item.matches.slice(0, 3).map((match) => `#${match.index + 1} ${_diagramHealthPlayLabel(match.play)}`).join(", ")
      : "No current play match";
    return `<div class="pb-diagram-health-key-row">
      <div>
        <strong>${escapeHtml(item.reason)}</strong>
        <span>${escapeHtml(label)}${item.matches.length > 3 ? ` +${item.matches.length - 3} more` : ""}</span>
        <code>${escapeHtml(item.key)}</code>
      </div>
    </div>`;
  }

  async function buildPlayDiagramHealthReport() {
    const playbook = _playbookForImageLookup();
    const allKeys = await loadKeys();
    const ready = [];
    const missing = [];
    const ambiguousPlays = [];
    const keyMap = new Map();

    playbook.forEach((play, index) => {
      const displaySig = storedDisplaySignatureForPlay(play);
      const broadSig = storedSignatureForPlay(play);
      if (displaySig) {
        ready.push({ play, index, sig: displaySig });
      } else if (broadSig) {
        ambiguousPlays.push({ play, index, sig: broadSig });
      } else {
        missing.push({ play, index });
      }
    });

    allKeys.forEach((key) => {
      const matches = playbook
        .map((play, index) => ({ play, index }))
        .filter(({ play }) => signaturesForPlay(play).includes(key));
      const displayMatches = playbook.filter((play) =>
        displaySignaturesForPlay(play).includes(key),
      );
      if (!displayMatches.length) {
        keyMap.set(key, {
          key,
          matches,
          reason: matches.length > 1
            ? "Ambiguous legacy diagram key"
            : "Diagram key is not player-visible",
        });
      }
    });

    return {
      totalPlays: playbook.length,
      totalKeys: allKeys.length,
      ready,
      missing,
      ambiguousPlays,
      unsafeKeys: Array.from(keyMap.values()),
    };
  }

  function _renderPlayDiagramHealth(report) {
    const healthPct = report.totalPlays
      ? Math.round((report.ready.length / report.totalPlays) * 100)
      : 0;
    const scoreClass = healthPct >= 90
      ? "is-good"
      : healthPct >= 65
        ? "is-warn"
        : "is-poor";
    const ambiguousRows = report.ambiguousPlays.slice(0, 10).map((item) =>
      _diagramHealthRow({
        ...item,
        status: "ambiguous",
        detail: "Has a local diagram key, but it is not safe enough for player display.",
      }),
    ).join("");
    const missingRows = report.missing.slice(0, 12).map((item) =>
      _diagramHealthRow({
        ...item,
        status: "missing",
        detail: "No player-visible diagram found on this device.",
      }),
    ).join("");
    const unsafeRows = report.unsafeKeys.slice(0, 10).map(_diagramHealthKeyRow).join("");
    const readyRows = report.ready.slice(0, 8).map((item) =>
      _diagramHealthRow({
        ...item,
        status: "ready",
        detail: "Player-visible diagram ready.",
      }),
    ).join("");

    return `
      <div class="pb-health-summary pb-diagram-health-summary">
        <div class="pb-health-score ${scoreClass}">
          <strong>${healthPct}%</strong>
          <span>Diagram readiness</span>
        </div>
        <div class="pb-health-card"><strong>${report.ready.length}</strong><span>Ready plays</span></div>
        <div class="pb-health-card"><strong>${report.missing.length}</strong><span>Missing diagrams</span></div>
        <div class="pb-health-card"><strong>${report.ambiguousPlays.length}</strong><span>Needs reattach</span></div>
        <div class="pb-health-card"><strong>${report.unsafeKeys.length}</strong><span>Unsafe local keys</span></div>
      </div>
      <div class="pb-health-guidance">
        Player Swipe View only shows exact or unique diagram matches. Ambiguous old diagram keys are hidden so the wrong diagram does not appear on the wrong play.
      </div>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Needs Reattach</h4>
          <span>${report.ambiguousPlays.length} plays</span>
        </div>
        ${ambiguousRows || `<div class="pb-health-empty">No ambiguous play diagram matches found.</div>`}
        ${report.ambiguousPlays.length > 10 ? `<div class="pb-health-more">Showing 10 of ${report.ambiguousPlays.length} plays.</div>` : ""}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Missing Diagrams</h4>
          <span>${report.missing.length} plays</span>
        </div>
        ${missingRows || `<div class="pb-health-empty">Every play has a player-visible diagram on this device.</div>`}
        ${report.missing.length > 12 ? `<div class="pb-health-more">Showing 12 of ${report.missing.length} missing plays.</div>` : ""}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Unsafe Local Diagram Keys</h4>
          <span>${report.unsafeKeys.length} keys</span>
        </div>
        ${unsafeRows || `<div class="pb-health-empty">No orphaned or ambiguous local diagram keys found.</div>`}
        ${report.unsafeKeys.length > 10 ? `<div class="pb-health-more">Showing 10 of ${report.unsafeKeys.length} keys.</div>` : ""}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Ready Sample</h4>
          <span>${report.ready.length} plays</span>
        </div>
        ${readyRows || `<div class="pb-health-empty">No player-visible diagrams found on this device.</div>`}
      </section>`;
  }

  window.openPlayDiagramHealth = async function () {
    document.getElementById("playDiagramHealthOverlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay visible";
    overlay.id = "playDiagramHealthOverlay";
    overlay.dataset.action = "closePlayDiagramHealthOverlay";
    overlay.innerHTML = `
      <div class="custom-modal pb-health-modal pb-diagram-health-modal" role="dialog" aria-modal="true" aria-labelledby="playDiagramHealthTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🩺</span>
          <h3 class="custom-modal-title" id="playDiagramHealthTitle">Diagram Health</h3>
          <button class="modal-close" aria-label="Close" data-action="closePlayDiagramHealth">×</button>
        </div>
        <div class="custom-modal-body pb-health-body" id="playDiagramHealthBody">
          <div class="pb-health-empty">Checking local diagram keys...</div>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn btn-sm" data-action="syncPlayImagesToCloud">Push Diagrams</button>
          <button type="button" class="btn btn-sm" data-action="closePlayDiagramHealth">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    try {
      const report = await buildPlayDiagramHealthReport();
      const body = document.getElementById("playDiagramHealthBody");
      if (body) body.innerHTML = _renderPlayDiagramHealth(report);
    } catch (err) {
      const body = document.getElementById("playDiagramHealthBody");
      if (body) {
        body.innerHTML = `<div class="pb-health-empty">Diagram health could not be checked: ${escapeHtml(err?.message || "Unknown error")}</div>`;
      }
    }
  };

  window.closePlayDiagramHealth = function () {
    document.getElementById("playDiagramHealthOverlay")?.remove();
  };

  window.openPlayDiagramHealthEdit = function (index) {
    const idx = Number(index);
    window.closePlayDiagramHealth();
    if (typeof openPlaybookHealthEdit === "function") {
      openPlaybookHealthEdit(idx);
    } else if (typeof editPlay === "function") {
      editPlay(idx);
    }
  };

  async function _renderPublishMediaModalBody() {
    const body = document.getElementById("publishMediaBody");
    if (!body) return null;
    body.innerHTML = `<div class="pb-health-empty">Checking player-visible media...</div>`;
    const report = await buildPlayerMediaPublishReport();
    body.innerHTML = renderPlayerMediaPublishReport(report);
    return report;
  }

  window.openPublishMediaModal = async function () {
    document.getElementById("publishMediaOverlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay visible";
    overlay.id = "publishMediaOverlay";
    overlay.dataset.action = "closePublishMediaOverlay";
    overlay.innerHTML = `
      <div class="custom-modal pb-health-modal pb-publish-media-modal" role="dialog" aria-modal="true" aria-labelledby="publishMediaTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🟢</span>
          <h3 class="custom-modal-title" id="publishMediaTitle">Publish Media</h3>
          <button class="modal-close" aria-label="Close" data-action="closePublishMedia">×</button>
        </div>
        <div class="custom-modal-body pb-health-body" id="publishMediaBody">
          <div class="pb-health-empty">Checking player-visible media...</div>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="publishPlayerMedia">Publish Needed Media</button>
          <button type="button" class="btn btn-sm" data-action="syncPlayImagesToCloud">Recovery: Upload All Diagrams</button>
          <button type="button" class="btn btn-sm" data-action="closePublishMedia">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    try {
      await _renderPublishMediaModalBody();
    } catch (err) {
      const body = document.getElementById("publishMediaBody");
      if (body) {
        body.innerHTML = `<div class="pb-health-empty">Media readiness could not be checked: ${escapeHtml(err?.message || "Unknown error")}</div>`;
      }
    }
  };

  window.closePublishMedia = function () {
    document.getElementById("publishMediaOverlay")?.remove();
  };

  window.publishPlayerMedia = async function () {
    if (!_remoteAvailable()) {
      if (typeof showModal === "function") {
        showModal("Cloud media publish is not available on this page.", { title: "Publish Media", icon: "⚠️" });
      }
      return;
    }
    const report = await buildPlayerMediaPublishReport();
    if (!report.publishedScripts.length) {
      if (typeof showModal === "function") {
        showModal("No practice scripts are currently visible to players. Publish a script first, then publish media.", { title: "Nothing To Publish", icon: "ℹ️" });
      }
      await _renderPublishMediaModalBody();
      return;
    }
    if (!report.publishableKeys.length) {
      const message = report.counts.missing
        ? `${report.counts.missing} player-visible play${report.counts.missing === 1 ? "" : "s"} still need diagrams attached on this device. Nothing can be uploaded until those diagrams exist locally.`
        : "No stale or unpublished local diagrams were found for player-visible scripts.";
      if (typeof showToast === "function") {
        showToast(message, { type: report.counts.missing ? "warning" : "success", duration: 4500 });
      }
      await _renderPublishMediaModalBody();
      return;
    }
    const result = await syncToRemote(report.rows.map((row) => row.play), {
      keys: report.publishableKeys,
    });
    const failedOrSkipped = result.failed + result.skipped;
    if (failedOrSkipped && typeof showToast === "function") {
      const firstIssue = result.errors[0]?.error ? ` ${result.errors[0].error}` : "";
      showToast(
        `${result.pushed} diagram${result.pushed === 1 ? "" : "s"} published. ${failedOrSkipped} need attention.${firstIssue}`,
        { type: "warning", duration: 6500 },
      );
    }
    await _renderPublishMediaModalBody();
  };

  // Coach-triggered manual sync — preflights scope before pushing images to R2.
  window.syncPlayImagesToCloud = async function (opts = {}) {
    if (!_remoteAvailable()) {
      if (typeof showModal === "function") {
        showModal("Diagram recovery upload is not available. Make sure you are on bcoffense.com (not a file:// URL).", { title: "Recovery Upload", icon: "⚠️" });
      }
      return;
    }
    const plan = await buildSyncPlan();
    const allKeys = plan.allKeys;
    // eslint-disable-next-line no-console
    console.log("[Diagrams] Sync plan:", plan);
    if (!allKeys.length) {
      if (typeof showModal === "function") {
        showModal(
          "No play diagrams were found on this device.\n\nImages are stored per-device in your browser. Open the app on the computer or device where you originally uploaded your play diagrams, then use Recovery: Upload All Diagrams from there.",
          { title: "No Diagrams Found", icon: "ℹ️" },
        );
      }
      return;
    }
    let scope = _syncScopeFromChoice(plan, "option1");
    if (!opts.skipPrompt && typeof showChoice === "function") {
      const recommendedLabel = plan.recommendedScope === "player"
        ? `Player Visible (${plan.playerKeys.length})`
        : plan.recommendedScope === "current"
          ? `Current Playbook (${plan.currentKeys.length})`
          : `All Local (${plan.allKeys.length})`;
      const allLabel = `All Local (${plan.allKeys.length})`;
      const notes = [
        `Found ${_diagramCountLabel(plan.allKeys.length)} stored on this device.`,
        plan.playerKeys.length
          ? `${_diagramCountLabel(plan.playerKeys.length)} ${_diagramVerb(plan.playerKeys.length, "matches", "match")} player-visible scripts.`
          : "No stored diagrams currently match player-visible scripts.",
        plan.currentOnlyKeys.length
          ? `${_diagramCountLabel(plan.currentOnlyKeys.length)} ${_diagramVerb(plan.currentOnlyKeys.length, "matches", "match")} the current playbook but ${_diagramVerb(plan.currentOnlyKeys.length, "is", "are")} not in a player-visible script.`
          : "",
        plan.orphanKeys.length
          ? `${_diagramCountLabel(plan.orphanKeys.length)} ${_diagramVerb(plan.orphanKeys.length, "looks", "look")} old or unmatched and may take extra time.`
          : "",
      ].filter(Boolean).join("\n");
      const choice = await showChoice(notes, {
        title: "Recovery Upload",
        icon: "🖼️",
        option1: recommendedLabel,
        option2: allLabel,
      });
      if (!choice) return;
      scope = _syncScopeFromChoice(plan, choice);
    }
    if (!scope.keys.length) {
      if (typeof showToast === "function") {
        showToast("No diagrams matched that recovery upload scope.", { type: "info", duration: 4500 });
      }
      return;
    }
    const result = await syncToRemote(scope.plays, { keys: scope.keys });
    // eslint-disable-next-line no-console
    console.log("[Diagrams] R2 sync result:", result);
    if ((result.failed || result.skipped || result.pushed === 0) && typeof showToast === "function") {
      const firstIssue = result.errors[0]?.error ? ` ${result.errors[0].error}` : "";
      showToast(
        `${result.pushed} of ${scope.keys.length} selected diagram${scope.keys.length === 1 ? "" : "s"} uploaded. ${result.failed + result.skipped} need attention.${firstIssue}`,
        { type: result.pushed ? "warning" : "error", duration: 6500 },
      );
    }
  };

  // Load only keys on startup so render paths can show badges without turning
  // every stored image into an object URL. Actual blobs load on hover/print/edit.
  if (typeof window !== "undefined") {
    window.addEventListener("DOMContentLoaded", () => {
      loadKeys()
        .then(() => {
          // Re-render any visible playbook now that badge keys are warm.
          if (typeof requestRenderPlaybook === "function") {
            try { requestRenderPlaybook(); } catch (_e) { /* ignore */ }
          } else if (typeof renderPlaybook === "function") {
            try { renderPlaybook(); } catch (_e) { /* ignore */ }
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("playImages key load failed:", err);
        });
      _installHoverPreview();
    });
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) _revokeAll();
    });
  }

  /* Global hover preview — any element with [data-img-sig] gets a floating
     popover with the image while hovered. Touch devices: tap to toggle. */
  function _installHoverPreview() {
    if (_hoverPreviewInstalled) return;
    _hoverPreviewInstalled = true;
    let popover = null;
    let activeEl = null;

    function _ensurePopover() {
      if (popover) return popover;
      popover = document.createElement("div");
      popover.className = "pb-img-popover";
      popover.setAttribute("aria-hidden", "true");
      popover.style.display = "none";
      document.body.appendChild(popover);
      return popover;
    }

    async function _show(el) {
      const sig = el.getAttribute("data-img-sig");
      if (!sig) return;
      activeEl = el;
      const url = urlFor(sig) || await ensureUrl(sig);
      if (activeEl !== el) return;
      if (!url) return;
      const pop = _ensurePopover();
      pop.textContent = "";
      const img = document.createElement("img");
      img.alt = "Play diagram";
      img.src = url;
      img.addEventListener("load", () => {
        if (activeEl === el) _position(el);
      }, { once: true });
      pop.appendChild(img);
      pop.style.display = "block";
      _position(el);
    }

    function _hide() {
      if (!popover) return;
      popover.style.display = "none";
      popover.innerHTML = "";
      activeEl = null;
    }

    function _position(el) {
      if (!popover) return;
      const r = el.getBoundingClientRect();
      const pw = popover.offsetWidth || 360;
      const ph = popover.offsetHeight || 240;
      const margin = 8;
      let left = r.right + margin;
      let top = r.top;
      if (left + pw > window.innerWidth - margin) {
        left = Math.max(margin, r.left - pw - margin);
      }
      if (top + ph > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - ph - margin);
      }
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    }

    document.addEventListener("mouseover", (e) => {
      const target = e.target.closest && e.target.closest("[data-img-sig]");
      if (!target) return;
      _show(target);
    }, { passive: true });
    document.addEventListener("mouseout", (e) => {
      const target = e.target.closest && e.target.closest("[data-img-sig]");
      if (!target) return;
      if (activeEl === target) _hide();
    }, { passive: true });
    document.addEventListener("scroll", _hide, { capture: true, passive: true });
    window.addEventListener("resize", _hide, { passive: true });

    // Touch / click toggle for mobile
    document.addEventListener("click", (e) => {
      const target = e.target.closest && e.target.closest("[data-img-sig]");
      if (!target) {
        if (popover && popover.style.display === "block") _hide();
        return;
      }
      if (popover && popover.style.display === "block" && activeEl === target) {
        e.preventDefault();
        _hide();
      } else {
        e.preventDefault();
        _show(target);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        _hide();
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target.closest && e.target.closest("[data-img-sig]");
      if (!target) return;
      e.preventDefault();
      if (popover && popover.style.display === "block" && activeEl === target) {
        _hide();
      } else {
        _show(target);
      }
    });
  }
})();
