/* play-clips.js — Remote, player-accessible video clips for plays.
   Blobs live in Cloudflare R2 behind auth-gated Pages Functions; this module is
   the browser-side client. Clips are keyed by the same play signature used for
   play images so the editor and presentation viewer resolve the same set.

   Public API (global window.playClips):
     playClips.sigForPlay(play)            → canonical signature string ("" if none)
     await playClips.list(play)            → [{ id, label, contentType, size, duration, uploadedAt }]
     await playClips.upload(play, file, label, opts) → { ok, clip } | throws Error(message)
     await playClips.remove(play, id)      → { ok, clips }
     playClips.fileUrl(play, id)           → streaming URL for a <video> src
     playClips.canManage()                 → bool (admin/coach)
     playClips.MAX_CLIPS / MAX_BYTES / MAX_DURATION_SEC
*/

(function () {
  const MAX_CLIPS = 3;
  const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
  const MAX_DURATION_SEC = 15;
  const DURATION_GRACE_SEC = 2; // allow slight overage from encoder rounding

  // Cached set of play signatures that have at least one clip, so the playbook
  // table can show a 🎬 indicator synchronously without a request per row.
  let _indexSet = null;
  let _indexPromise = null;

  function sigForPlay(play) {
    if (!play) return "";
    if (
      window.playImages &&
      typeof window.playImages.signaturesForPlay === "function"
    ) {
      const sigs = window.playImages.signaturesForPlay(play);
      if (Array.isArray(sigs) && sigs.length) return String(sigs[0]);
    }
    if (typeof playSignature === "function") {
      return String(playSignature(play) || "");
    }
    return "";
  }

  function canManage() {
    return typeof canEditUser === "function" ? Boolean(canEditUser()) : false;
  }

  function manifestUrl(sig, extra) {
    let url = `/clips/manifest?sig=${encodeURIComponent(sig)}`;
    if (extra) url += extra;
    return url;
  }

  function fileUrl(play, id) {
    const sig = sigForPlay(play);
    if (!sig || !id) return "";
    return `/clips/file?sig=${encodeURIComponent(sig)}&id=${encodeURIComponent(id)}`;
  }

  async function loadIndex(force) {
    if (_indexPromise && !force) return _indexPromise;
    _indexPromise = (async () => {
      try {
        const response = await fetch("/clips/sigs", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          _indexSet = _indexSet || new Set();
          return _indexSet;
        }
        const data = await response.json().catch(() => null);
        _indexSet = new Set(data && Array.isArray(data.sigs) ? data.sigs : []);
      } catch (_err) {
        _indexSet = _indexSet || new Set();
      }
      return _indexSet;
    })();
    return _indexPromise;
  }

  function has(sig) {
    return Boolean(_indexSet && sig && _indexSet.has(String(sig)));
  }

  function hasForPlay(play) {
    if (!_indexSet) return false;
    return has(sigForPlay(play));
  }

  async function list(play) {
    const sig = sigForPlay(play);
    if (!sig) return [];
    const response = await fetch(manifestUrl(sig), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    return data && Array.isArray(data.clips) ? data.clips : [];
  }

  // Best-effort client-side duration probe so we reject long clips before
  // uploading megabytes. Returns seconds, or 0 if it can't be determined.
  function probeDuration(file) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_err) {
          /* ignore */
        }
        resolve(value);
      };
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => {
        const seconds = Number.isFinite(video.duration) ? video.duration : 0;
        finish(seconds);
      };
      video.onerror = () => finish(0);
      // Safety timeout so a non-decodable file never hangs the upload.
      setTimeout(() => finish(0), 5000);
      video.src = objectUrl;
    });
  }

  async function upload(play, file, label) {
    if (!canManage()) {
      throw new Error("Only admin or coach can upload clips.");
    }
    const sig = sigForPlay(play);
    if (!sig) {
      throw new Error("This play has no stable signature to attach a clip to.");
    }
    if (!file || !(file instanceof Blob)) {
      throw new Error("No clip file selected.");
    }
    const type = (file.type || "").toLowerCase();
    if (!type.startsWith("video/")) {
      throw new Error("Clip must be a video file.");
    }
    if (file.size > MAX_BYTES) {
      throw new Error(
        `Clip is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 25 MB.`,
      );
    }

    const existing = await list(play);
    if (existing.length >= MAX_CLIPS) {
      throw new Error(`This play already has the maximum of ${MAX_CLIPS} clips.`);
    }

    const duration = await probeDuration(file);
    if (duration && duration > MAX_DURATION_SEC + DURATION_GRACE_SEC) {
      throw new Error(
        `Clip is ${Math.round(duration)}s — keep clips to about ${MAX_DURATION_SEC}s.`,
      );
    }

    const headers = { "Content-Type": type };
    if (label) headers["X-Clip-Label"] = encodeURIComponent(String(label));
    if (duration) headers["X-Clip-Duration"] = String(Math.round(duration));

    const response = await fetch(manifestUrl(sig), {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: file,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.ok) {
      throw new Error((data && data.error) || "Upload failed.");
    }
    if (_indexSet) _indexSet.add(sig);
    return data;
  }

  async function remove(play, id) {
    if (!canManage()) {
      throw new Error("Only admin or coach can delete clips.");
    }
    const sig = sigForPlay(play);
    if (!sig || !id) {
      throw new Error("Missing clip reference.");
    }
    const response = await fetch(
      manifestUrl(sig, `&id=${encodeURIComponent(id)}`),
      { method: "DELETE", credentials: "same-origin", headers: { Accept: "application/json" } },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.ok) {
      throw new Error((data && data.error) || "Delete failed.");
    }
    if (_indexSet && Array.isArray(data.clips) && !data.clips.length) {
      _indexSet.delete(sig);
    }
    return data;
  }

  window.playClips = {
    MAX_CLIPS,
    MAX_BYTES,
    MAX_DURATION_SEC,
    sigForPlay,
    canManage,
    fileUrl,
    list,
    upload,
    remove,
    loadIndex,
    has,
    hasForPlay,
  };

  // Warm the clip index once the page is interactive so the playbook can show
  // its 🎬 indicators on first render. Re-render the playbook once it lands.
  function _initClipIndex() {
    loadIndex().then(() => {
      if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
      else if (typeof renderPlaybook === "function") renderPlaybook();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _initClipIndex, { once: true });
  } else {
    _initClipIndex();
  }
})();
