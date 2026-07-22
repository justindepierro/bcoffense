/* play-clips.js — Remote, player-accessible video clips for plays.
   Blobs live in Cloudflare R2 behind auth-gated Pages Functions; this module is
   the browser-side client. New clips use the permanent play media ID, matching
   diagrams. Historic signature manifests remain read-only staff recovery data.

   Public API (global window.playClips):
     playClips.sigForPlay(play)            → canonical signature string ("" if none)
     await playClips.list(play)            → [{ id, label, contentType, size, duration, uploadedAt }]
     await playClips.upload(play, file, label, opts) → { ok, clip } | throws Error(message)
     await playClips.uploadForSig(sig, file, label, opts) → upload to a stable signature
     await playClips.prepareSilentVideoUpload(file, opts) → processed silent clip preview
     await playClips.uploadPreparedForSig(sig, prepared, label, opts) → upload processed clip
     await playClips.uploadPreparedWithRetryForSig(sig, prepared, label, opts) → upload or retain for retry
     await playClips.listForSig(sig)       → [{ id, label, contentType, size, duration, uploadedAt, url }]
     await playClips.listForSigs(sigs)     → { [sig]: clips[] } using cached manifest reads
     await playClips.removeForSig(sig, id) → { ok, clips }
     await playClips.remove(play, id)      → { ok, clips }
     playClips.fileUrl(play, id)           → streaming URL for a <video> src
     playClips.getManifestCache()          → debug manifest cache snapshot
     playClips.canManage()                 → bool (admin/coach)
     playClips.MAX_CLIPS / MAX_BYTES / MAX_SOURCE_BYTES / MAX_DURATION_SEC
*/

(function () {
  const MAX_CLIPS = 3;
  // The server accepts a final, player-safe clip of up to 25 MiB.  Allow a
  // larger source file locally so modern phones can be optimized *before* the
  // final-size guard is applied.  Rejecting the source at 25 MiB meant a
  // normal iPhone capture never reached the optimizer.
  const MAX_BYTES = 25 * 1024 * 1024; // final upload: 25 MiB
  const MAX_SOURCE_BYTES = 100 * 1024 * 1024; // local source: 100 MiB
  const MAX_DURATION_SEC = 15;
  const DURATION_GRACE_SEC = 2; // allow slight overage from encoder rounding
  const SILENT_UPLOAD_FPS = 30;
  // Signal/play clips are short shots of a coach or player making a hand signal,
  // so cap the re-encode resolution and bitrate. Smaller frames mean smaller
  // files (faster download) and far cheaper decode on low-end player phones,
  // with no meaningful quality loss for a 4-5s clip.
  const SILENT_UPLOAD_MAX_EDGE = 720; // longest side, px
  const SILENT_UPLOAD_BITS_PER_PIXEL = 0.09; // bits per pixel per frame
  const SILENT_UPLOAD_MAX_BITRATE = 4_000_000; // hard ceiling, bps
  const MANIFEST_CACHE_TTL_MS = 30000;
  const MANIFEST_BATCH_CONCURRENCY = 6;
  const CLIP_UPLOAD_QUEUE_CACHE = "bcoffense-clip-upload-queue";
  const CLIP_UPLOAD_QUEUE_LIMIT = 20;

  // Cached set of play signatures that have at least one clip, so the playbook
  // table can show a 🎬 indicator synchronously without a request per row.
  let _indexSet = null;
  let _indexPromise = null;
  let _legacyPlayMigrationPromise = null;
  const _manifestCache = new Map();

  // Candidate keys are permanent-media-ID first. Tag/content-derived keys are
  // historical fallbacks only; a player route accepts one only when the active
  // release has proved that the legacy key identifies exactly one released play.
  function candidateSigs(play) {
    if (!play) return [];
    const out = [];
    const push = (value) => {
      const v = value ? String(value) : "";
      if (v && !out.includes(v)) out.push(v);
    };
    if (typeof getPlayMediaId === "function") {
      push(getPlayMediaId(play));
    } else {
      push(play?.mediaId);
    }
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

  function isReplaceOnlySig(sig) {
    return String(sig || "").trim().startsWith("signals/");
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

  function normalizeManifestSig(sig) {
    return String(sig || "").trim();
  }

  function decorateManifestClips(sig, clips) {
    const key = normalizeManifestSig(sig);
    return (Array.isArray(clips) ? clips : []).map((clip) => ({
      ...clip,
      sig: key,
      url: fileUrlForSig(key, clip.id),
    }));
  }

  function invalidateManifestCache(sig) {
    const key = normalizeManifestSig(sig);
    if (key) {
      _manifestCache.delete(key);
    } else {
      _manifestCache.clear();
    }
  }

  function resetReleaseCache() {
    _indexSet = null;
    _indexPromise = null;
    _manifestCache.clear();
  }

  function getManifestCache() {
    const now = Date.now();
    const entries = [];
    _manifestCache.forEach((entry, sig) => {
      entries.push({
        sig,
        count: Array.isArray(entry.clips) ? entry.clips.length : 0,
        pending: Boolean(entry.promise),
        ageMs: entry.fetchedAt ? now - entry.fetchedAt : 0,
      });
    });
    return {
      ttlMs: MANIFEST_CACHE_TTL_MS,
      size: _manifestCache.size,
      entries,
    };
  }

  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function recordPerf(name, startedAt, meta = {}) {
    if (!window.perfMonitor || typeof window.perfMonitor.record !== "function") return;
    window.perfMonitor.record(name, nowMs() - startedAt, meta);
  }

  async function loadIndex(force) {
    if (_indexPromise && !force) return _indexPromise;
    _indexPromise = (async () => {
      try {
        const response = await fetch("/clips/sigs", {
          credentials: "same-origin",
          cache: "no-store",
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

  // Player-facing views must use the immutable media ID only. Historic
  // signature fallbacks remain useful for staff recovery, but can never be a
  // safe answer for a player filter because older play calls may share text.
  function hasCanonicalForPlay(play) {
    if (!_indexSet) return false;
    const mediaId = typeof getPlayMediaId === "function"
      ? String(getPlayMediaId(play) || "").trim()
      : String(play?.mediaId || "").trim();
    return Boolean(mediaId && _indexSet.has(mediaId));
  }

  function isIndexLoaded() {
    return _indexSet instanceof Set;
  }

  // Historic play clips used display-derived tags instead of permanent media
  // IDs. The server resolves only exact current-workspace matches, copies and
  // verifies those bytes, and retires any unlinked tag as recovery evidence.
  // Keep that maintenance quiet and bounded during an admin warmup.
  async function migrateLegacyPlayClipManifests() {
    if (typeof isAdminUser !== "function" || !isAdminUser()) return 0;
    if (_legacyPlayMigrationPromise) return _legacyPlayMigrationPromise;
    _legacyPlayMigrationPromise = (async () => {
      let migrated = 0;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await fetch("/media/migrate-legacy-play-clip-manifests", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json", "X-BC-Auth-Mode": "json" },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) break;
        const count = Array.isArray(data.migrated) ? data.migrated.length : 0;
        const retired = Array.isArray(data.retired) ? data.retired.length : 0;
        migrated += count;
        if (data.complete || data.skipped?.length || data.failed?.length || (!count && !retired)) break;
      }
      if (migrated) resetReleaseCache();
      return migrated;
    })().catch(() => 0).finally(() => {
      _legacyPlayMigrationPromise = null;
    });
    return _legacyPlayMigrationPromise;
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

      const sourceWidth = Math.max(2, Math.round(video.videoWidth || 1280));
      const sourceHeight = Math.max(2, Math.round(video.videoHeight || 720));
      // Downscale to the resolution cap (keeping aspect ratio, even dimensions
      // for the encoder) so player phones decode a small signal clip instantly.
      const longEdge = Math.max(sourceWidth, sourceHeight);
      const scale = longEdge > SILENT_UPLOAD_MAX_EDGE ? SILENT_UPLOAD_MAX_EDGE / longEdge : 1;
      const width = Math.max(2, Math.round((sourceWidth * scale) / 2) * 2);
      const height = Math.max(2, Math.round((sourceHeight * scale) / 2) * 2);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not process the video clip.");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const stream = canvas.captureStream(SILENT_UPLOAD_FPS);
      const targetBitrate = Math.min(
        SILENT_UPLOAD_MAX_BITRATE,
        Math.round(width * height * SILENT_UPLOAD_FPS * SILENT_UPLOAD_BITS_PER_PIXEL),
      );
      const recorderOptions = { mimeType };
      if (targetBitrate > 0) recorderOptions.videoBitsPerSecond = targetBitrate;
      let recorder;
      try {
        recorder = new MediaRecorder(stream, recorderOptions);
      } catch (_err) {
        // Some browsers reject an explicit bitrate for the chosen mimeType.
        recorder = new MediaRecorder(stream, { mimeType });
      }
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

  async function readManifest(sig, opts = {}) {
    const key = normalizeManifestSig(sig);
    if (!key) return [];
    const now = Date.now();
    const cached = _manifestCache.get(key);
    if (!opts.force && cached) {
      if (cached.promise) return cached.promise;
      if (now - Number(cached.fetchedAt || 0) < MANIFEST_CACHE_TTL_MS) {
        return cached.clips || [];
      }
    }
    const promise = fetchManifest(key)
      .then((clips) => {
        const normalized = Array.isArray(clips) ? clips : [];
        _manifestCache.set(key, {
          clips: normalized,
          fetchedAt: Date.now(),
          promise: null,
        });
        return normalized;
      })
      .catch((err) => {
        _manifestCache.delete(key);
        throw err;
      });
    _manifestCache.set(key, {
      clips: cached?.clips || [],
      fetchedAt: cached?.fetchedAt || 0,
      promise,
    });
    return promise;
  }

  // Returns clips for a play, searching every candidate signature so clips
  // stored under the canonical content key are found regardless of which device
  // (coach/player) is viewing. Each clip is decorated with its resolved `sig`
  // and a ready-to-use `url` for a <video> src.
  async function listForSig(sig, opts = {}) {
    const key = normalizeManifestSig(sig);
    if (!key) return [];
    const clips = await readManifest(key, opts);
    return decorateManifestClips(key, clips);
  }

  async function listForSigs(sigs) {
    const startedAt = nowMs();
    const keys = [...new Set(
      (Array.isArray(sigs) ? sigs : [])
        .map(normalizeManifestSig)
        .filter(Boolean),
    )];
    const result = Object.create(null);
    const missing = [];
    const now = Date.now();
    keys.forEach((sig) => {
      const cached = _manifestCache.get(sig);
      if (cached && !cached.promise && now - Number(cached.fetchedAt || 0) < MANIFEST_CACHE_TTL_MS) {
        result[sig] = decorateManifestClips(sig, cached.clips || []);
      } else {
        missing.push(sig);
      }
    });
    if (missing.length > 1 && typeof fetch === "function") {
      try {
        const response = await fetch("/clips/batch-manifest", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-BC-Auth-Mode": "json",
          },
          body: JSON.stringify({ sigs: missing }),
        });
        if (response.ok) {
          const data = await response.json().catch(() => null);
          const manifests = data && data.manifests && typeof data.manifests === "object"
            ? data.manifests
            : {};
          missing.forEach((sig) => {
            const clips = Array.isArray(manifests[sig]) ? manifests[sig] : [];
            _manifestCache.set(sig, {
              clips,
              fetchedAt: Date.now(),
              promise: null,
            });
            result[sig] = decorateManifestClips(sig, clips);
          });
          recordPerf("media:clip-batch-manifest", startedAt, {
            requested: keys.length,
            missing: missing.length,
            method: "batch",
          });
          return result;
        }
      } catch (_err) {
        // Fall back to bounded one-at-a-time manifest reads below.
      }
    }
    let cursor = 0;
    async function worker() {
      while (cursor < missing.length) {
        const sig = missing[cursor];
        cursor += 1;
        try {
          result[sig] = await listForSig(sig);
        } catch (_err) {
          result[sig] = [];
        }
      }
    }
    const workerCount = Math.min(MANIFEST_BATCH_CONCURRENCY, missing.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    recordPerf("media:clip-batch-manifest", startedAt, {
      requested: keys.length,
      missing: missing.length,
      method: missing.length ? "fallback" : "cache",
    });
    return result;
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
      const clips = await readManifest(sig);
      if (clips.length) {
        return decorateManifestClips(sig, clips);
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

  async function prepareSilentVideoUpload(file, opts = {}) {
    if (!canManage()) {
      throw new Error("Only admin or coach can upload clips.");
    }
    if (!file || !(file instanceof Blob)) {
      throw new Error("No clip file selected.");
    }
    const type = (file.type || "").toLowerCase();
    if (!type.startsWith("video/")) {
      throw new Error("Clip must be a video file.");
    }
    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error(
        `Clip source is ${(file.size / (1024 * 1024)).toFixed(1)} MB — choose a source under ${(MAX_SOURCE_BYTES / (1024 * 1024)).toFixed(0)} MB.`,
      );
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

    if (opts.showProcessingToast !== false && typeof window.showToast === "function") {
      window.showToast(
        shouldTrimUpload
          ? `Trimming to ${maxDurationSec}s and removing audio before upload...`
          : "Removing audio before video upload...",
        { type: "info", duration: 1800 },
      );
    }
    const targetDuration = shouldTrimUpload ? maxDurationSec : duration;
    let uploadFile;
    let processingMode = "optimized";
    try {
      uploadFile = await createSilentVideoFile(file, targetDuration);
    } catch (err) {
      // iOS browsers sometimes do not expose MediaRecorder/canvas capture even
      // though they can play the selected H.264 clip.  A short, already-small
      // source is still safe to publish, so retain it rather than losing the
      // coach's upload.  It is always played muted in the app.
      const canUseOriginalFallback = Boolean(opts.allowOriginalFallback)
        && file.size <= MAX_BYTES
        && !shouldTrimUpload
        && (!duration || duration <= maxDurationSec + durationGraceSec);
      if (!canUseOriginalFallback) {
        if (opts.allowOriginalFallback && file.size > MAX_BYTES) {
          throw new Error(
            `This phone could not optimize the ${Math.round(file.size / (1024 * 1024))} MB source. Record in 1080p/30 fps Most Compatible, or choose an original under 25 MB.`,
          );
        }
        throw err;
      }
      uploadFile = file;
      processingMode = "original-fallback";
    }
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
    return {
      uploadFile,
      duration,
      uploadDuration,
      shouldTrimUpload,
      maxDurationSec,
      uploadType: (uploadFile.type || type).toLowerCase(),
      processingMode,
      audioRemoved: processingMode === "optimized",
    };
  }

  async function uploadPreparedForSig(sig, prepared, label, opts = {}) {
    if (!canManage()) {
      throw new Error("Only admin or coach can upload clips.");
    }
    if (!sig) {
      throw new Error("Missing stable clip signature.");
    }
    const uploadFile = prepared?.uploadFile || prepared;
    if (!uploadFile || !(uploadFile instanceof Blob)) {
      throw new Error("No processed clip file is ready.");
    }
    if (uploadFile.size > MAX_BYTES) {
      throw new Error(
        `Processed clip is ${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB — the limit is 25 MB.`,
      );
    }
    if (!opts.skipExistingCheck && !opts.replaceExisting && !isReplaceOnlySig(sig)) {
      const existing = await listForSig(sig, { force: true });
      if (existing.length >= MAX_CLIPS) {
        throw new Error(`This play already has the maximum of ${MAX_CLIPS} clips.`);
      }
    }
    const uploadDuration = Number(prepared?.uploadDuration || prepared?.duration || 0);
    const uploadType = String(prepared?.uploadType || uploadFile.type || "video/mp4").toLowerCase();
    const headers = { "Content-Type": uploadType };
    if (label) headers["X-Clip-Label"] = encodeURIComponent(String(label));
    if (uploadDuration) headers["X-Clip-Duration"] = String(Math.round(uploadDuration));

    const response = await fetch(manifestUrl(sig), {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: uploadFile,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !data.ok) {
      throw new Error((data && data.error) || `Upload failed (${response.status}).`);
    }
    if (_indexSet) _indexSet.add(sig);
    invalidateManifestCache(sig);
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

  function _readClipUploadQueue() {
    const value = storageManager.get(STORAGE_KEYS.CLIP_UPLOAD_QUEUE, []);
    return Array.isArray(value) ? value : [];
  }

  function _writeClipUploadQueue(entries) {
    storageManager.set(STORAGE_KEYS.CLIP_UPLOAD_QUEUE, entries.slice(-CLIP_UPLOAD_QUEUE_LIMIT));
  }

  function _clipQueueRequest(id) {
    return new Request(`/__local/clip-upload/${encodeURIComponent(id)}`);
  }

  async function _queuePreparedClip(sig, prepared, label, error, opts = {}) {
    const uploadFile = prepared?.uploadFile || prepared;
    const id = crypto.randomUUID();
    let outboxId = "";
    if (window.mediaUploadOutbox?.enqueue) {
      const job = await window.mediaUploadOutbox.enqueue({
        kind: "clip",
        target: sig,
        blob: uploadFile,
        contentType: uploadFile.type || prepared?.uploadType || "video/mp4",
        label,
        duration: Number(prepared?.uploadDuration || 0),
        metadata: opts.outboxMetadata && typeof opts.outboxMetadata === "object"
          ? opts.outboxMetadata
          : {},
      });
      outboxId = job.id;
    } else {
      // Compatibility only for an older cached app shell. New uploads always
      // keep their blob and intent together in the IndexedDB media outbox.
      const cache = await caches.open(CLIP_UPLOAD_QUEUE_CACHE);
      await cache.put(_clipQueueRequest(id), new Response(uploadFile, {
        headers: { "Content-Type": uploadFile.type || prepared?.uploadType || "video/mp4" },
      }));
    }
    const entries = _readClipUploadQueue();
    entries.push({ id, outboxId, sig, label: String(label || ""), uploadDuration: Number(prepared?.uploadDuration || 0), uploadType: uploadFile.type || "video/mp4", queuedAt: new Date().toISOString(), lastError: String(error || "Network unavailable") });
    _writeClipUploadQueue(entries);
    if (typeof window.queueWorkspaceSyncJob === "function") {
      window.queueWorkspaceSyncJob("media", "clip-auto-upload", {
        queuedLabel: "Video saving when online", runningLabel: "Saving video…", doneLabel: "Video saved for players", errorLabel: "Video upload needs attention", retry: () => flushQueuedClipUploads(),
      });
    }
  }

  async function flushQueuedClipUploads() {
    const entries = _readClipUploadQueue();
    if (!navigator.onLine) return { pushed: 0, pending: entries.length };
    let pushed = 0;
    if (window.mediaUploadOutbox?.pending) {
      const durableJobs = await window.mediaUploadOutbox.pending("clip");
      for (const job of durableJobs) {
        if (job.state === "blocked" || (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > Date.now())) continue;
        try {
          const receipt = await uploadPreparedForSig(job.target, {
            uploadFile: job.blob,
            uploadDuration: Number(job.duration || 0),
            uploadType: job.contentType,
          }, job.label, { skipExistingCheck: true });
          await window.mediaUploadOutbox.markComplete(job.id, { clip: receipt?.clip || null, uploadedAt: new Date().toISOString() });
          _writeClipUploadQueue(_readClipUploadQueue().filter((item) => item.outboxId !== job.id));
          try {
            window.dispatchEvent(new CustomEvent("play-clip-uploaded", {
              detail: { sig: job.target, clip: receipt?.clip || null, metadata: job.metadata || {}, queued: true },
            }));
          } catch (_err) { /* non-critical UI update */ }
          pushed += 1;
        } catch (err) {
          await window.mediaUploadOutbox.markRetry(job.id, err);
          break;
        }
      }
    }
    const legacyEntries = _readClipUploadQueue().filter((entry) => !entry.outboxId);
    if (!legacyEntries.length) {
      const pending = window.mediaUploadOutbox?.pending
        ? (await window.mediaUploadOutbox.pending("clip")).length
        : 0;
      if (!pending && typeof window.completeWorkspaceSyncJob === "function") {
        window.completeWorkspaceSyncJob("media:clip-auto-upload", { label: "Video saved for players" });
      }
      return { pushed, pending };
    }
    const cache = await caches.open(CLIP_UPLOAD_QUEUE_CACHE);
    for (const entry of legacyEntries) {
      const response = await cache.match(_clipQueueRequest(entry.id));
      if (!response) continue;
      try {
        const blob = await response.blob();
        await uploadPreparedForSig(entry.sig, { uploadFile: blob, uploadDuration: entry.uploadDuration, uploadType: entry.uploadType }, entry.label, { skipExistingCheck: true });
        await cache.delete(_clipQueueRequest(entry.id));
        _writeClipUploadQueue(_readClipUploadQueue().filter((item) => item.id !== entry.id));
        pushed += 1;
      } catch (_err) { break; }
    }
    const pending = window.mediaUploadOutbox?.pending
      ? (await window.mediaUploadOutbox.pending("clip")).length
      : _readClipUploadQueue().length;
    if (!pending && !_readClipUploadQueue().length && typeof window.completeWorkspaceSyncJob === "function") {
      window.completeWorkspaceSyncJob("media:clip-auto-upload", { label: "Video saved for players" });
    }
    return { pushed, pending };
  }

  function _isRetryableUploadError(err) {
    const message = String(err?.message || err || "").toLowerCase();
    return navigator.onLine === false
      || /network|fetch|failed to fetch|upload failed|timeout|temporar|\b5\d\d\b/.test(message);
  }

  async function uploadPreparedWithRetryForSig(sig, prepared, label, opts = {}) {
    try {
      return await uploadPreparedForSig(sig, prepared, label, { ...opts, skipExistingCheck: true });
    } catch (err) {
      if (!_isRetryableUploadError(err)) throw err;
      await _queuePreparedClip(sig, prepared, label, err?.message || err, opts);
      return { ok: true, queued: true };
    }
  }

  async function uploadForSig(sig, file, label, opts = {}) {
    if (!sig) {
      throw new Error("Missing stable clip signature.");
    }
    if (!opts.replaceExisting && !isReplaceOnlySig(sig)) {
      const existing = await listForSig(sig, { force: true });
      if (existing.length >= MAX_CLIPS) {
        throw new Error(`This play already has the maximum of ${MAX_CLIPS} clips.`);
      }
    }
    const prepared = await prepareSilentVideoUpload(file, opts);
    return uploadPreparedWithRetryForSig(sig, prepared, label, opts);
  }

  async function upload(play, file, label, opts = {}) {
    return uploadForSig(sigForPlay(play), file, label, opts);
  }

  // Probe a video blob's intrinsic dimensions + duration without playing it.
  function _probeVideoDimensions(blob) {
    return new Promise((resolve) => {
      let settled = false;
      const objectUrl = URL.createObjectURL(blob);
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try { URL.revokeObjectURL(objectUrl); } catch (_err) { /* ignore */ }
        resolve(value);
      };
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => finish({
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
      video.onerror = () => finish(null);
      setTimeout(() => finish(null), 6000);
      video.src = objectUrl;
    });
  }

  // Re-download one existing clip, re-encode it through the current downscale +
  // bitrate caps, and replace it in place. Used by the admin "optimize existing
  // clips" pass so clips uploaded before the resolution cap shrink to the same
  // fast, player-phone-friendly size as new uploads. Returns a status object;
  // never throws for "nothing to do" cases (already small / no size win).
  async function recompressClipForSig(sig, clip, opts = {}) {
    if (!canManage()) throw new Error("Only admin or coach can re-compress clips.");
    if (!sig || !clip || !clip.id) throw new Error("Missing clip reference.");
    const response = await fetch(fileUrlForSig(sig, clip.id), { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Could not download clip (${response.status}).`);
    const blob = await response.blob();
    const originalSize = blob.size || Number(clip.size || 0);
    const dims = await _probeVideoDimensions(blob);
    const longEdge = dims ? Math.max(dims.width, dims.height) : 0;
    if (!opts.force && longEdge && longEdge <= SILENT_UPLOAD_MAX_EDGE) {
      return { status: "skipped", reason: "already-optimized", originalSize, longEdge };
    }
    const sourceType = (blob.type || clip.contentType || "video/mp4").toLowerCase();
    const ext = sourceType.includes("webm") ? "webm" : "mp4";
    const sourceFile = new File([blob], `clip-${clip.id}.${ext}`, { type: sourceType });
    const targetDuration = Number(clip.duration || dims?.duration || 0);
    const uploadFile = await createSilentVideoFile(sourceFile, targetDuration);
    const newSize = uploadFile.size || 0;
    if (!opts.force && (!newSize || newSize >= originalSize)) {
      return { status: "skipped", reason: "no-gain", originalSize, newSize, longEdge };
    }
    const prepared = {
      uploadFile,
      duration: targetDuration,
      uploadDuration: targetDuration,
      uploadType: (uploadFile.type || sourceType).toLowerCase(),
    };
    if (isReplaceOnlySig(sig)) {
      // Signal clips replace in place on POST — a single, atomic swap.
      await uploadPreparedForSig(sig, prepared, clip.label || "", {
        replaceExisting: true,
        skipExistingCheck: true,
        publishType: opts.publishType || "signals",
      });
    } else {
      // Play clips APPEND on POST, and a play may already be at the clip cap, so
      // delete the old clip first to make room, then upload the smaller one. If
      // the replacement upload fails, roll back by re-uploading the original.
      await removeForSig(sig, clip.id, { publishType: opts.publishType || "clips" });
      try {
        await uploadPreparedForSig(sig, prepared, clip.label || "", {
          replaceExisting: true,
          skipExistingCheck: true,
          publishType: opts.publishType || "clips",
        });
      } catch (uploadErr) {
        const originalFile = new File([blob], `clip-${clip.id}.${ext}`, { type: sourceType });
        await uploadPreparedForSig(sig, {
          uploadFile: originalFile,
          duration: targetDuration,
          uploadDuration: targetDuration,
          uploadType: sourceType,
        }, clip.label || "", {
          replaceExisting: true,
          skipExistingCheck: true,
          publishType: opts.publishType || "clips",
        }).catch(() => { });
        throw uploadErr;
      }
    }
    return { status: "recompressed", originalSize, newSize, longEdge };
  }

  // Batch pass: re-compress every stored clip of a given kind. Enumerates the
  // clip index (all sigs that have clips), then re-compresses each clip in
  // place. kind: "signals" (signals/* sigs), "playbook" (play clips), or "all".
  // Reports running totals via opts.onProgress and returns the final tally.
  async function recompressAllClips(opts = {}) {
    if (!canManage()) throw new Error("Only admin or coach can re-compress clips.");
    const kind = String(opts.kind || "all");
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    const force = opts.force === true;
    await loadIndex(true);
    const allSigs = _indexSet ? [..._indexSet] : [];
    const sigs = allSigs.filter((sig) => {
      const isSignal = isReplaceOnlySig(sig);
      if (kind === "signals") return isSignal;
      if (kind === "playbook") return !isSignal;
      return true;
    });
    const totals = {
      totalSigs: sigs.length,
      processedSigs: 0,
      recompressed: 0,
      skipped: 0,
      failed: 0,
      bytesSaved: 0,
    };
    for (const sig of sigs) {
      let clips = [];
      try {
        clips = await listForSig(sig, { force: true });
      } catch (_err) {
        clips = [];
      }
      for (const clip of clips) {
        try {
          const result = await recompressClipForSig(sig, clip, {
            force,
            publishType: isReplaceOnlySig(sig) ? "signals" : "clips",
          });
          if (result?.status === "recompressed") {
            totals.recompressed += 1;
            totals.bytesSaved += Math.max(0, (result.originalSize || 0) - (result.newSize || 0));
          } else {
            totals.skipped += 1;
          }
        } catch (_err) {
          totals.failed += 1;
        }
      }
      totals.processedSigs += 1;
      if (onProgress) onProgress({ ...totals });
    }
    return totals;
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
    if (Array.isArray(data.clips)) {
      _manifestCache.set(sig, {
        clips: data.clips,
        fetchedAt: Date.now(),
        promise: null,
      });
    } else {
      invalidateManifestCache(sig);
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
    MAX_SOURCE_BYTES,
    MAX_DURATION_SEC,
    sigForPlay,
    canManage,
    fileUrl,
    fileUrlForSig,
    getManifestCache,
    resetReleaseCache,
    listForSig,
    listForSigs,
    list,
    prepareSilentVideoUpload,
    uploadForSig,
    uploadPreparedForSig,
    uploadPreparedWithRetryForSig,
    upload,
    flushQueuedClipUploads,
    removeForSig,
    remove,
    recompressClipForSig,
    recompressAllClips,
    migrateLegacyPlayClipManifests,
    loadIndex,
    has,
    hasForPlay,
    hasCanonicalForPlay,
    isIndexLoaded,
    configureLoopPreviewVideo,
    openViewer: openPlayClipViewer,
  };

  // Warm the clip index once the page is interactive so the playbook can show
  // its 🎬 indicators on first render. Re-render media-aware surfaces once it lands.
  async function _initClipIndex() {
    flushQueuedClipUploads().catch(() => { /* queue remains durable */ });
    if (typeof window.whenAuthReady === "function") {
      await window.whenAuthReady().catch(() => null);
    }
    await migrateLegacyPlayClipManifests();
    return loadIndex().then(() => {
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
  window.addEventListener("online", () => {
    flushQueuedClipUploads().catch(() => { /* queue remains durable */ });
  });
})();
