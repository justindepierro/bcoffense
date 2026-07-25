// Quiz media warmup and signal-video playback. Loaded after script-quiz.js so
// the runtime stays smaller while preserving one global, deterministic flow.

function _configureQuizSignalVideos(root = document) {
  root.querySelectorAll?.(".sq-signal-prompt video, .sq-signal-sequence-item video").forEach((video) => {
    video.controls = false;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.removeAttribute("controls");
    video.setAttribute("autoplay", "");
    video.setAttribute("loop", "");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "auto");
    const playPromise = typeof video.play === "function" ? video.play() : null;
    if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => { });
  });
}

function _getQuizSignalClipUrls(item) {
  const urls = [];
  const single = item?.signalRecord?.clipUrl || "";
  if (single) urls.push(single);
  if (Array.isArray(item?.signalFullCallClips)) {
    item.signalFullCallClips.forEach((clip) => {
      if (clip?.clipUrl) urls.push(clip.clipUrl);
    });
  }
  return [...new Set(urls.filter(Boolean))];
}

function _preloadQuizSignalClip(url) {
  const clipUrl = String(url || "").trim();
  if (!clipUrl || _quizSignalPreloadCache.has(clipUrl)) return;
  if (typeof navigator !== "undefined" && navigator.connection?.saveData) return;
  const startedAt = _quizPerfNow();
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.src = clipUrl;
  _quizSignalPreloadCache.set(clipUrl, { video, touchedAt: Date.now() });
  try { video.load(); } catch (_err) { }
  _quizPerfRecord("video-preload", startedAt, { cached: _quizSignalPreloadCache.size });
  if (_quizSignalPreloadCache.size > 12) {
    const oldest = [..._quizSignalPreloadCache.entries()]
      .sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
    if (oldest) _quizSignalPreloadCache.delete(oldest[0]);
  }
}

function _quizShouldSkipMediaWarmup() {
  return Boolean(typeof navigator !== "undefined" && navigator.connection?.saveData);
}

function _decodeAheadImage(url) {
  if (!url || typeof Image === "undefined") return;
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    if (typeof img.decode === "function") img.decode().catch(() => { });
  } catch (_e) { /* best-effort decode warm */ }
}

async function _warmQuizDiagramForPlay(play) {
  const startedAt = _quizPerfNow();
  if (!play || !window.playImages) {
    _quizPerfRecord("diagram-readiness", startedAt, { status: "unavailable" });
    return null;
  }
  try {
    if (typeof window.playImages.ensureDisplayReadinessForPlay === "function") {
      const readiness = await window.playImages.ensureDisplayReadinessForPlay(play);
      _quizPerfRecord("diagram-readiness", startedAt, { status: readiness?.status || "unknown" });
      if (readiness?.url) _decodeAheadImage(readiness.url);
      return readiness?.url || null;
    }
    if (typeof window.playImages.ensureDisplayUrlForPlay !== "function") {
      _quizPerfRecord("diagram-readiness", startedAt, { status: "unavailable" });
      return null;
    }
    const url = await window.playImages.ensureDisplayUrlForPlay(play);
    _quizPerfRecord("diagram-readiness", startedAt, { status: url ? "ready" : "missing" });
    if (url) _decodeAheadImage(url);
    return url;
  } catch (_err) {
    _quizPerfRecord("diagram-readiness", startedAt, { status: "error" });
    return null;
  }
}

async function _prepareQuizMedia(items, opts = {}) {
  const startedAt = _quizPerfNow();
  if (_quizShouldSkipMediaWarmup()) {
    _quizPerfRecord("media-prep", startedAt, { skipped: true, reason: "save-data" });
    return;
  }
  const sourceItems = _normalizeQuizItems(items);
  if (!sourceItems.length) {
    _quizPerfRecord("media-prep", startedAt, { skipped: true, reason: "empty" });
    return;
  }
  const tasks = [];
  const diagramItems = sourceItems.slice(0, QUIZ_DIAGRAM_PRELOAD_WINDOW);
  let remoteManifestChecked = false;
  if (window.playImages && typeof window.playImages.checkRemoteForPlays === "function") {
    await Promise.race([
      window.playImages.checkRemoteForPlays(diagramItems.map((item) => item?.play || item).filter(Boolean))
        .then(() => { remoteManifestChecked = true; })
        .catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 180)),
    ]);
  }
  diagramItems.forEach((item) => {
    const play = item?.play || item;
    if (play && window.playImages && typeof window.playImages.ensureDisplayUrlForPlay === "function") {
      tasks.push(_warmQuizDiagramForPlay(play));
    }
  });
  const signalWindow = Math.min(sourceItems.length, Math.max(SIGNAL_QUIZ_PRELOAD_WINDOW, Number(opts.signalWindow || 0) || 0));
  for (let i = 0; i < signalWindow; i += 1) _getQuizSignalClipUrls(sourceItems[i]).forEach(_preloadQuizSignalClip);
  if (!tasks.length) {
    _quizPerfRecord("media-prep", startedAt, { diagrams: diagramItems.length, remoteManifestChecked, signalWindow, tasks: 0 });
    return;
  }
  let timedOut = true;
  await Promise.race([
    Promise.allSettled(tasks).then(() => { timedOut = false; }),
    new Promise((resolve) => setTimeout(resolve, QUIZ_MEDIA_PREP_TIMEOUT_MS)),
  ]);
  _quizPerfRecord("media-prep", startedAt, { diagrams: diagramItems.length, remoteManifestChecked, signalWindow, tasks: tasks.length, timedOut });
}

function _preloadUpcomingQuizSignalMedia(startIndex = _quizIndex) {
  if (_quizSourceType !== "signal") return;
  const start = Math.max(0, Number(startIndex || 0));
  const end = Math.min(_quizPlays.length, start + SIGNAL_QUIZ_PRELOAD_WINDOW);
  for (let i = start; i < end; i += 1) _getQuizSignalClipUrls(_quizPlays[i]).forEach(_preloadQuizSignalClip);
}
