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

  // Candidate signature keys for a play, most-canonical first. Clips are SHARED
  // across devices via R2, so the primary key must be content-derived and
  // device-stable. getPlayIdentityKey(play,"tag") is derived purely from play
  // fields, so a coach and a player compute the same key for the same play.
  // NEVER key by play.id / playSignature here: play.id is a random per-device
  // id (createPlayId), so it would never match across devices. Alternate keys
  // are kept only as read-side fallbacks for clips uploaded under older keys.
  function candidateSigs(play) {
    if (!play) return [];
    const out = [];
    const push = (value) => {
      const v = value ? String(value) : "";
      if (v && !out.includes(v)) out.push(v);
    };
    if (typeof getPlayIdentityKey === "function") {
      push(getPlayIdentityKey(play, "tag"));
    }
    if (
      window.playImages &&
      typeof window.playImages.signaturesForPlay === "function"
    ) {
      const sigs = window.playImages.signaturesForPlay(play);
      if (Array.isArray(sigs)) sigs.forEach(push);
    }
    if (!out.length && typeof playSignature === "function") {
      push(playSignature(play));
    }
    return out;
  }

  function sigForPlay(play) {
    const cands = candidateSigs(play);
    return cands.length ? cands[0] : "";
  }

  // The candidate that actually has clips per the cached index, else the
  // canonical signature. Used when deleting so we target the right manifest.
  function resolveStoredSig(play) {
    const cands = candidateSigs(play);
    if (_indexSet) {
      const found = cands.find((s) => _indexSet.has(s));
      if (found) return found;
    }
    return cands.length ? cands[0] : "";
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
    return fileUrlForSig(resolveStoredSig(play), id);
  }

  function fileUrlForSig(sig, id) {
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
    return candidateSigs(play).some((s) => _indexSet.has(s));
  }

  async function fetchManifest(sig) {
    const response = await fetch(manifestUrl(sig), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    return data && Array.isArray(data.clips) ? data.clips : [];
  }

  // Returns clips for a play, searching every candidate signature so clips
  // stored under the canonical content key are found regardless of which device
  // (coach/player) is viewing. Each clip is decorated with its resolved `sig`
  // and a ready-to-use `url` for a <video> src.
  async function list(play) {
    const cands = candidateSigs(play);
    if (!cands.length) return [];
    let ordered = cands;
    if (_indexSet) {
      // The index is authoritative for the current session; only probe keys it
      // knows about to avoid needless requests for clip-less plays.
      ordered = cands.filter((s) => _indexSet.has(s));
    }
    for (const sig of ordered) {
      const clips = await fetchManifest(sig);
      if (clips.length) {
        return clips.map((clip) => ({
          ...clip,
          sig,
          url: fileUrlForSig(sig, clip.id),
        }));
      }
    }
    return [];
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
    const sig = resolveStoredSig(play);
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
    fileUrlForSig,
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
