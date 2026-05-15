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

  let _dbPromise = null;
  const _urlCache = new Map(); // sig → object URL
  const _urlPromiseCache = new Map(); // sig → pending object URL Promise
  const _urlVersions = new Map(); // sig → invalidation counter
  const _knownKeys = new Set();
  let _keysPromise = null;
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
        return normalized;
      })
      .catch((err) => {
        _keysPromise = null;
        throw err;
      });
    return _keysPromise;
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

  async function keys() {
    return loadKeys();
  }

  async function prefetchAll() {
    const allKeys = await loadKeys();
    const missing = allKeys.filter((sig) => !_urlCache.has(sig));
    await _withConcurrency(missing, PREFETCH_CONCURRENCY, ensureUrl);
    _emitChange(null);
    return allKeys.length;
  }

  function _emitChange(sig) {
    try {
      window.dispatchEvent(new CustomEvent("play-images-changed", { detail: { sig } }));
    } catch (_e) { /* ignore */ }
  }

  /* Compression: resize to max dimension and re-encode as JPEG.
     Defaults aim for ~60–120KB per image at 900px max edge. */
  async function compress(file, opts = {}) {
    if (!file) throw new Error("No image file selected");
    if (file.type && !file.type.startsWith("image/")) {
      throw new Error("Only image files can be attached");
    }
    const maxDim = Math.max(200, Math.min(2000, opts.maxDim || 900));
    const quality = Math.min(0.95, Math.max(0.5, opts.quality || 0.82));
    const mime = opts.mime || "image/jpeg";

    // Decode
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

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (typeof bitmap.close === "function") bitmap.close();
      throw new Error("Image canvas could not be created");
    }
    try {
      ctx.drawImage(bitmap, 0, 0, w, h);
    } finally {
      if (typeof bitmap.close === "function") bitmap.close();
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Image encode failed"))),
        mime,
        quality,
      );
    });
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
    await _withConcurrency(allKeys, EXPORT_CONCURRENCY, async (sig) => {
      const blob = await _get(sig);
      if (blob) {
        out[sig] = await _blobToDataURL(blob);
      } else {
        _knownKeys.delete(sig);
      }
      done += 1;
      if (onProgress) onProgress(done, total);
    });
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
    await _withConcurrency(entries, IMPORT_CONCURRENCY, async ([rawSig, dataURL]) => {
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
    });
    _keysPromise = null;
    _emitChange(null);
    return n;
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
    loadKeys,
    prefetchAll,
    compress,
    exportAll,
    importAll,
  };

  // Convenience helpers that take a Play object directly
  window.getPlayImageUrl = function (play) {
    if (!play || typeof playSignature !== "function") return null;
    return urlFor(playSignature(play));
  };
  window.ensurePlayImageUrl = function (play) {
    if (!play || typeof playSignature !== "function") return Promise.resolve(null);
    return ensureUrl(playSignature(play));
  };
  window.hasPlayImage = function (play) {
    if (!play || typeof playSignature !== "function") return false;
    return has(playSignature(play));
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
