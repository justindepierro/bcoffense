/* play-clips.js — Remote, player-accessible video clips for plays.
   Blobs live in Cloudflare R2 behind auth-gated Pages Functions; this module is
   the browser-side client. Clips are keyed by the same play signature used for
   play images so the editor and presentation viewer resolve the same set.

   Public API (global window.playClips):
     playClips.sigForPlay(play)            → canonical signature string ("" if none)
     await playClips.list(play)            → [{ id, label, contentType, size, duration, uploadedAt }]
     await playClips.upload(play, file, label, opts) → { ok, clip } | throws Error(message)
     await playClips.uploadForSig(sig, file, label, opts) → upload to a stable signature
     await playClips.listForSig(sig)       → [{ id, label, contentType, size, duration, uploadedAt, url }]
     await playClips.removeForSig(sig, id) → { ok, clips }
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

  function _emitClipChange(sig) {
    try {
      window.dispatchEvent(new CustomEvent("play-clips-changed", { detail: { sig } }));
    } catch (_err) {
      /* ignore */
    }
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
  async function listForSig(sig) {
    if (!sig) return [];
    const clips = await fetchManifest(sig);
    return clips.map((clip) => ({
      ...clip,
      sig,
      url: fileUrlForSig(sig, clip.id),
    }));
  }

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

  async function uploadForSig(sig, file, label, opts = {}) {
    if (!canManage()) {
      throw new Error("Only admin or coach can upload clips.");
    }
    if (!sig) {
      throw new Error("Missing stable clip signature.");
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

    const existing = await listForSig(sig);
    if (existing.length >= MAX_CLIPS) {
      throw new Error(`This play already has the maximum of ${MAX_CLIPS} clips.`);
    }

    const duration = await probeDuration(file);
    const maxDurationSec = Number(opts.maxDurationSec || MAX_DURATION_SEC);
    const durationGraceSec =
      opts.durationGraceSec == null
        ? DURATION_GRACE_SEC
        : Number(opts.durationGraceSec) || 0;
    if (duration && duration > maxDurationSec + durationGraceSec) {
      throw new Error(
        `Clip is ${Math.round(duration)}s — keep clips to about ${maxDurationSec}s.`,
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
    if (typeof window.recordPlayerPublishStatus === "function") {
      window.recordPlayerPublishStatus(opts.publishType || "clips", {
        updatedAt: data.clip?.uploadedAt || new Date().toISOString(),
        label: data.clip?.label
          ? `Clip uploaded: ${data.clip.label}`
          : "Video clip uploaded to player devices",
      });
    }
    _emitClipChange(sig);
    return data;
  }

  async function upload(play, file, label, opts = {}) {
    return uploadForSig(sigForPlay(play), file, label, opts);
  }

  async function removeForSig(sig, id, opts = {}) {
    if (!canManage()) {
      throw new Error("Only admin or coach can delete clips.");
    }
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
    if (typeof window.recordPlayerPublishStatus === "function") {
      window.recordPlayerPublishStatus(opts.publishType || "clips", {
        label: "Video clip removed from player devices",
      });
    }
    _emitClipChange(sig);
    return data;
  }

  async function remove(play, id) {
    return removeForSig(resolveStoredSig(play), id);
  }

  // ---------------------------------------------------------------------------
  // Clip viewer modal — a single, intuitive player surface reused everywhere
  // (playbook table/cards, practice script, presentation). Built with direct
  // DOM nodes so <video controls> is preserved and labels are set as text.
  // ---------------------------------------------------------------------------
  let _viewer = null;

  function buildClipViewer() {
    const overlay = document.createElement("div");
    overlay.className = "pc-viewer-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Video clip viewer");

    const panel = document.createElement("div");
    panel.className = "pc-viewer";

    const head = document.createElement("div");
    head.className = "pc-viewer-head";
    const title = document.createElement("div");
    title.className = "pc-viewer-title";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "pc-viewer-close";
    closeBtn.setAttribute("aria-label", "Close video viewer");
    closeBtn.title = "Close";
    closeBtn.textContent = "\u2715";
    head.appendChild(title);
    head.appendChild(closeBtn);

    const video = document.createElement("video");
    video.className = "pc-viewer-video";
    video.controls = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "metadata";

    const controls = document.createElement("div");
    controls.className = "pc-viewer-controls";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "pc-viewer-nav";
    prevBtn.setAttribute("aria-label", "Previous clip");
    prevBtn.title = "Previous clip";
    prevBtn.textContent = "\u2039";
    const select = document.createElement("select");
    select.className = "pc-viewer-select";
    select.setAttribute("aria-label", "Choose clip");
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "pc-viewer-nav";
    nextBtn.setAttribute("aria-label", "Next clip");
    nextBtn.title = "Next clip";
    nextBtn.textContent = "\u203a";
    controls.appendChild(prevBtn);
    controls.appendChild(select);
    controls.appendChild(nextBtn);

    const caption = document.createElement("div");
    caption.className = "pc-viewer-caption";

    panel.appendChild(head);
    panel.appendChild(video);
    panel.appendChild(controls);
    panel.appendChild(caption);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const state = { clips: [], index: 0 };

    const show = (i) => {
      if (!state.clips.length) return;
      state.index = Math.max(0, Math.min(i, state.clips.length - 1));
      const clip = state.clips[state.index];
      video.pause();
      video.src = clip.url || fileUrl(state.play, clip.id);
      video.load();
      const meta = [];
      if (clip.duration) meta.push(`${clip.duration}s`);
      if (clip.size) meta.push(`${(clip.size / (1024 * 1024)).toFixed(1)} MB`);
      caption.textContent = [clip.label || `Clip ${state.index + 1}`, meta.join(" \u2022 ")]
        .filter(Boolean)
        .join("  \u2014  ");
      select.value = String(state.index);
      prevBtn.disabled = state.index <= 0;
      nextBtn.disabled = state.index >= state.clips.length - 1;
      // Start playback immediately. If the browser blocks autoplay with sound,
      // retry muted so the clip still plays — a paused video keeps its controls
      // pinned on screen, which feels sluggish.
      video.muted = false;
      const attempt = video.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(() => {
          video.muted = true;
          const retry = video.play();
          if (retry && typeof retry.catch === "function") retry.catch(() => { });
        });
      }
    };

    const close = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      overlay.classList.remove("visible");
      document.removeEventListener("keydown", onKey, true);
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      } else if (e.key === "ArrowRight" && !nextBtn.disabled) {
        show(state.index + 1);
      } else if (e.key === "ArrowLeft" && !prevBtn.disabled) {
        show(state.index - 1);
      }
    };

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    prevBtn.addEventListener("click", () => show(state.index - 1));
    nextBtn.addEventListener("click", () => show(state.index + 1));
    select.addEventListener("change", () => show(Number(select.value) || 0));

    return {
      overlay,
      title,
      select,
      controls,
      state,
      show,
      open() {
        overlay.classList.add("visible");
        document.addEventListener("keydown", onKey, true);
      },
    };
  }

  async function openPlayClipViewer(play, label) {
    if (!play) return;
    let clips = [];
    try {
      clips = await list(play);
    } catch (_err) {
      clips = [];
    }
    if (!Array.isArray(clips) || !clips.length) {
      if (typeof showToast === "function") {
        showToast("No video clips for this play yet.", { type: "info" });
      }
      return;
    }
    if (!_viewer) _viewer = buildClipViewer();
    const v = _viewer;
    v.state.play = play;
    v.state.clips = clips;
    v.title.textContent =
      label ||
      [play.formation, play.protection, play.play].filter(Boolean).join(" ") ||
      "Video clips";
    const multi = clips.length > 1;
    v.controls.style.display = multi ? "" : "none";
    v.select.innerHTML = "";
    clips.forEach((clip, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = clip.label || `Clip ${i + 1}`;
      v.select.appendChild(opt);
    });
    v.open();
    v.show(0);
  }

  function _resolvePlayFromList(source, idx) {
    const n = Number(idx);
    if (!Array.isArray(source) || !Number.isInteger(n)) return null;
    return source[n] || null;
  }

  function openPlaybookClipViewer(idx) {
    const source =
      typeof filteredPlays !== "undefined" && Array.isArray(filteredPlays)
        ? filteredPlays
        : typeof plays !== "undefined"
          ? plays
          : [];
    const play = _resolvePlayFromList(source, idx);
    if (play) openPlayClipViewer(play);
  }

  function openScriptClipViewer(idx) {
    const source = typeof script !== "undefined" && Array.isArray(script) ? script : [];
    const play = _resolvePlayFromList(source, idx);
    if (play) openPlayClipViewer(play);
  }

  window.openPlayClipViewer = openPlayClipViewer;
  window.openPlaybookClipViewer = openPlaybookClipViewer;
  window.openScriptClipViewer = openScriptClipViewer;

  window.playClips = {
    MAX_CLIPS,
    MAX_BYTES,
    MAX_DURATION_SEC,
    sigForPlay,
    canManage,
    fileUrl,
    fileUrlForSig,
    listForSig,
    list,
    uploadForSig,
    upload,
    removeForSig,
    remove,
    loadIndex,
    has,
    hasForPlay,
    openViewer: openPlayClipViewer,
  };

  // Warm the clip index once the page is interactive so the playbook can show
  // its 🎬 indicators on first render. Re-render media-aware surfaces once it lands.
  function _initClipIndex() {
    loadIndex().then(() => {
      if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
      else if (typeof renderPlaybook === "function") renderPlaybook();
      if (typeof requestRenderScript === "function") requestRenderScript();
      else if (typeof renderScript === "function") renderScript();
      if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
      if (typeof refreshPlayReadinessSurfaces === "function") {
        refreshPlayReadinessSurfaces("clips");
      }
    });
  }
  function _scheduleClipIndexWarmup() {
    if (window.appStartup && typeof window.appStartup.queueTask === "function") {
      window.appStartup.queueTask("clip-index-warmup", _initClipIndex, {
        delay: 700,
        priority: 70,
      });
      return;
    }
    _initClipIndex();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _scheduleClipIndexWarmup, { once: true });
  } else {
    _scheduleClipIndexWarmup();
  }
})();
