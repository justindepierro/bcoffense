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
    const identityKeys = [
      _remoteIdentityKey(play),
      _legacyRemoteIdentityKey(play),
    ]
      .map(_normalizeSig)
      .filter(Boolean);
    for (const identityKey of [...new Set(identityKeys)]) {
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
      return await _putRemoteImage(identityKey, blob);
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
      await fetch(`/images/file?sig=${encodeURIComponent(identityKey)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-BC-Auth-Mode": "json",
        },
      });
    } catch (_e) {
      // Fire and forget
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Sync all locally-stored images to R2 for cross-device access.
  // Iterates ALL IndexedDB keys directly — does not rely on play matching.
  // Returns a detailed result so upload/auth/R2 errors are visible to coaches.
  let _remoteSyncDone = false;
  async function syncToRemote(playsArray) {
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
    result.total = allKeys.length;
    if (!allKeys.length) return result;

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

    await _withConcurrency(allKeys, 2, async (localSig) => {
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
    return result;
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
    hasForPlay,
    hasDisplayForPlay,
    storedSignatureForPlay,
    storedDisplaySignatureForPlay,
    deleteForPlay,
    loadKeys,
    isKeyCacheReady,
    prefetchAll,
    compress,
    describeCompression,
    stats,
    exportAll,
    importAll,
    pushRemote,
    deleteRemote,
    syncToRemote,
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

  // Coach-triggered manual sync — pushes all local images to R2 with progress modal.
  window.syncPlayImagesToCloud = async function () {
    if (!_remoteAvailable()) {
      if (typeof showModal === "function") {
        showModal("Cloud sync is not available. Make sure you are on bcoffense.com (not a file:// URL).", { title: "Sync Diagrams", icon: "⚠️" });
      }
      return;
    }
    const allKeys = await loadKeys();
    // eslint-disable-next-line no-console
    console.log("[Diagrams] Keys on this device:", allKeys.length, allKeys);
    if (!allKeys.length) {
      if (typeof showModal === "function") {
        showModal(
          "No play diagrams were found on this device.\n\nImages are stored per-device in your browser. Open the app on the computer or device where you originally uploaded your play diagrams, then press Sync Diagrams from there.",
          { title: "No Diagrams Found", icon: "ℹ️" },
        );
      }
      return;
    }
    if (typeof showToast === "function") {
      showToast(`Syncing ${allKeys.length} diagram${allKeys.length === 1 ? "" : "s"} to cloud…`, { duration: 60000 });
    }
    const result = await syncToRemote(typeof plays !== "undefined" ? plays : []);
    // eslint-disable-next-line no-console
    console.log("[Diagrams] R2 sync result:", result);
    if (typeof showModal === "function") {
      if (result.pushed > 0 && result.failed === 0 && result.skipped === 0) {
        showModal(
          `${result.pushed} of ${allKeys.length} diagram${allKeys.length === 1 ? "" : "s"} synced to cloud.\n\nPlayers can now see play diagrams in the swipe view. Have them reload the app if they are already in a session.`,
          { title: "Sync Complete ✓", icon: "🖼️" },
        );
      } else if (result.pushed > 0) {
        const details = result.errors
          .map((item) => `- ${item.status ? `${item.status}: ` : ""}${item.error}`)
          .join("\n");
        showModal(
          `${result.pushed} of ${allKeys.length} diagrams synced.\n\n${result.failed} failed and ${result.skipped} were skipped.${details ? `\n\nFirst issues:\n${details}` : ""}`,
          { title: "Sync Partially Complete", icon: "⚠️" },
        );
      } else {
        const details = result.errors
          .map((item) => `- ${item.status ? `${item.status}: ` : ""}${item.error}`)
          .join("\n");
        showModal(
          `Found ${allKeys.length} diagram${allKeys.length === 1 ? "" : "s"} locally but 0 were pushed to cloud.${details ? `\n\nFirst issues:\n${details}` : ""}`,
          { title: "Sync Issue", icon: "⚠️" },
        );
      }
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
