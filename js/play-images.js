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

  let _dbPromise = null;
  const _urlCache = new Map(); // sig → object URL
  const _knownKeys = new Set();
  let _keysPromise = null;

  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
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
        _knownKeys.clear();
        allKeys.forEach((sig) => _knownKeys.add(String(sig)));
        return allKeys;
      })
      .catch((err) => {
        _keysPromise = null;
        throw err;
      });
    return _keysPromise;
  }

  function _revoke(sig) {
    const url = _urlCache.get(sig);
    if (url) {
      try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
      _urlCache.delete(sig);
    }
  }

  async function set(sig, blob) {
    if (!sig || !blob) return false;
    await _put(sig, blob);
    _revoke(sig);
    _knownKeys.add(String(sig));
    _urlCache.set(sig, URL.createObjectURL(blob));
    _emitChange(sig);
    return true;
  }

  async function del(sig) {
    if (!sig) return false;
    await _del(sig);
    _revoke(sig);
    _knownKeys.delete(String(sig));
    _emitChange(sig);
    return true;
  }

  async function get(sig) {
    if (!sig) return null;
    return _get(sig);
  }

  function urlFor(sig) {
    if (!sig) return null;
    return _urlCache.get(sig) || null;
  }

  async function ensureUrl(sig) {
    if (!sig) return null;
    const existing = urlFor(sig);
    if (existing) return existing;
    const blob = await _get(sig);
    if (!blob) {
      _knownKeys.delete(String(sig));
      return null;
    }
    _knownKeys.add(String(sig));
    const url = URL.createObjectURL(blob);
    _urlCache.set(sig, url);
    return url;
  }

  function has(sig) {
    return !!sig && (_urlCache.has(sig) || _knownKeys.has(String(sig)));
  }

  async function keys() {
    return _keys();
  }

  async function prefetchAll() {
    const allKeys = await loadKeys();
    for (const sig of allKeys) {
      if (_urlCache.has(sig)) continue;
      const blob = await _get(sig);
      if (blob) _urlCache.set(sig, URL.createObjectURL(blob));
    }
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
    const maxDim = Math.max(200, Math.min(2000, opts.maxDim || 900));
    const quality = Math.min(0.95, Math.max(0.5, opts.quality || 0.82));
    const mime = opts.mime || "image/jpeg";

    // Decode
    const bitmap = await _decodeImage(file);
    const { width: w0, height: h0 } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (typeof bitmap.close === "function") bitmap.close();

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

  /* Backup helpers — base64 data URLs so they survive a JSON backup file.
     Caller decides whether to include in `getAllData()` (large!). */
  async function exportAll() {
    const out = {};
    const allKeys = await _keys();
    for (const sig of allKeys) {
      const blob = await _get(sig);
      if (blob) out[sig] = await _blobToDataURL(blob);
    }
    return out;
  }

  async function importAll(map, opts = {}) {
    if (!map || typeof map !== "object") return 0;
    const replace = opts && opts.replace === true;
    if (replace) {
      const existing = await _keys();
      for (const sig of existing) await _del(sig);
      _urlCache.forEach((url) => { try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ } });
      _urlCache.clear();
      _knownKeys.clear();
      _keysPromise = null;
    }
    let n = 0;
    for (const sig of Object.keys(map)) {
      const dataURL = map[sig];
      if (typeof dataURL !== "string") continue;
      const blob = await _dataURLToBlob(dataURL);
      if (blob) {
        await _put(sig, blob);
        _revoke(sig);
        _knownKeys.add(String(sig));
        _urlCache.set(sig, URL.createObjectURL(blob));
        n++;
      }
    }
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
  }

  /* Global hover preview — any element with [data-img-sig] gets a floating
     popover with the image while hovered. Touch devices: tap to toggle. */
  function _installHoverPreview() {
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
      pop.innerHTML = `<img src="${url}" alt="Play diagram" />`;
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
    });
    document.addEventListener("mouseout", (e) => {
      const target = e.target.closest && e.target.closest("[data-img-sig]");
      if (!target) return;
      if (activeEl === target) _hide();
    });
    document.addEventListener("scroll", _hide, true);
    window.addEventListener("resize", _hide);

    // Touch / click toggle for mobile
    document.addEventListener("click", (e) => {
      const target = e.target.closest && e.target.closest("[data-img-sig]");
      if (!target) return;
      if (popover && popover.style.display === "block" && activeEl === target) {
        e.preventDefault();
        _hide();
      } else {
        e.preventDefault();
        _show(target);
      }
    });
  }
})();
