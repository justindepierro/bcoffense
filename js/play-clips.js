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
  const SILENT_UPLOAD_FPS = 30;

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

  function silentMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    return [
      'video/mp4;codecs="avc1.42E01E"',
      "video/mp4;codecs=h264",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function silentExtension(mimeType) {
    return String(mimeType || "").includes("mp4") ? "mp4" : "webm";
  }

  function silentFileName(file, mimeType) {
    const base = String(file?.name || "clip")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "clip";
    return `${base}-silent.${silentExtension(mimeType)}`;
  }

  async function createSilentVideoFile(file, durationSec = 0) {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("This browser cannot remove audio from video clips.");
    }
    const mimeType = silentMimeType();
    if (!mimeType) {
      throw new Error("This browser cannot create a silent video clip.");
    }
    if (typeof document === "undefined") {
      throw new Error("Video processing is not available.");
    }
    const canvas = document.createElement("canvas");
    if (typeof canvas.captureStream !== "function") {
      throw new Error("This browser cannot strip audio before upload.");
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Could not read the video clip.")), 7000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Could not read the video clip."));
        };
        video.src = objectUrl;
      });

      const width = Math.max(2, Math.round(video.videoWidth || 1280));
      const height = Math.max(2, Math.round(video.videoHeight || 720));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not process the video clip.");

      const stream = canvas.captureStream(SILENT_UPLOAD_FPS);
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };

      const stopTracks = () => {
        stream.getTracks().forEach((track) => track.stop());
      };
      const recordDone = new Promise((resolve, reject) => {
        recorder.onerror = () => reject(new Error("Could not create a silent video clip."));
        recorder.onstop = () => {
          stopTracks();
          if (!chunks.length) {
            reject(new Error("Silent video processing produced an empty file."));
            return;
          }
          const blob = new Blob(chunks, { type: mimeType });
          resolve(new File([blob], silentFileName(file, mimeType), {
            type: mimeType,
            lastModified: Date.now(),
          }));
        };
      });

      let stopped = false;
      const stopRecorder = () => {
        if (stopped) return;
        stopped = true;
        if (recorder.state !== "inactive") recorder.stop();
      };
      const drawFrame = () => {
        if (stopped) return;
        try {
          ctx.drawImage(video, 0, 0, width, height);
        } catch (_err) {
          /* keep recording; the next decoded frame may draw */
        }
        if (video.ended || (durationSec && video.currentTime >= durationSec)) {
          stopRecorder();
          return;
        }
        requestAnimationFrame(drawFrame);
      };
      const maxMs = Math.max(1500, (Number(durationSec || video.duration || MAX_DURATION_SEC) + 1) * 1000);
      const timeout = setTimeout(stopRecorder, maxMs);
      video.onended = stopRecorder;
      recorder.start(250);
      try {
        await video.play();
      } catch (err) {
        stopRecorder();
        clearTimeout(timeout);
        throw err;
      }
      drawFrame();
      try {
        return await recordDone;
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      try { video.pause(); } catch (_err) { /* ignore */ }
      try { URL.revokeObjectURL(objectUrl); } catch (_err) { /* ignore */ }
    }
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
    const shouldTrimUpload = Boolean(opts.trimToMaxDuration) && duration && duration > maxDurationSec;
    if (duration && duration > maxDurationSec + durationGraceSec && !shouldTrimUpload) {
      throw new Error(
        `Clip is ${Math.round(duration)}s — keep clips to about ${maxDurationSec}s.`,
      );
    }

    if (typeof window.showToast === "function") {
      window.showToast(
        shouldTrimUpload
          ? `Trimming to ${maxDurationSec}s and removing audio before upload...`
          : "Removing audio before video upload...",
        { type: "info", duration: 1800 },
      );
    }
    const targetDuration = shouldTrimUpload ? maxDurationSec : duration;
    const uploadFile = await createSilentVideoFile(file, targetDuration);
    if (uploadFile.size > MAX_BYTES) {
      throw new Error(
        `Silent clip is ${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB — the limit is 25 MB.`,
      );
    }
    const uploadDuration = await probeDuration(uploadFile);
    if (uploadDuration && uploadDuration > maxDurationSec + durationGraceSec) {
      throw new Error(
        `Silent clip is ${Math.round(uploadDuration)}s — keep clips to about ${maxDurationSec}s.`,
      );
    }
    const uploadType = (uploadFile.type || type).toLowerCase();
    const headers = { "Content-Type": uploadType };
    if (label) headers["X-Clip-Label"] = encodeURIComponent(String(label));
    if (uploadDuration || duration) headers["X-Clip-Duration"] = String(Math.round(uploadDuration || duration));

    const response = await fetch(manifestUrl(sig), {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: uploadFile,
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
  // (playbook table/cards, practice script, presentation). Clips behave like
  // quick silent loops so native controls never block the actual rep.
  // ---------------------------------------------------------------------------
  let _viewer = null;

  function configureLoopPreviewVideo(video) {
    if (!video) return;
    video.controls = false;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.removeAttribute("controls");
    video.setAttribute("autoplay", "");
    video.setAttribute("loop", "");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "auto");
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");
    const attemptPlay = () => {
      const playPromise = typeof video.play === "function" ? video.play() : null;
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => { });
      }
    };
    if (!video.dataset.clipPreviewBound) {
      video.dataset.clipPreviewBound = "true";
      video.addEventListener("loadeddata", attemptPlay);
      video.addEventListener("canplay", attemptPlay);
    }
  }

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
    configureLoopPreviewVideo(video);

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
      configureLoopPreviewVideo(video);
      const attempt = video.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(() => { });
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
    configureLoopPreviewVideo,
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
