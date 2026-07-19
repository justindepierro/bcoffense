// Shared landscape play presenter for the Playbook and Practice Script.

const PLAY_PRESENTATION_MODES = new Set(["minimum", "player", "coaches"]);
const PLAY_PRESENTATION_SAMPLE_MAX = 480;
const PLAY_PRESENTATION_MAX_RENDER_PIXELS = 10_000_000;
const PLAY_PRESENTATION_MAX_RENDER_EDGE = 4096;
const PLAY_PRESENTATION_SWIPE_MIN_DISTANCE = 44;
const PLAY_PRESENTATION_SWIPE_MAX_MS = 900;
const PLAY_PRESENTATION_ROTATE_OVERFLOW = 24;

let playPresentationState = {
  source: "playbook",
  items: [],
  index: 0,
  mode: "minimum",
  position: "respQ",
  positionLocked: false,
  autoPositionItemKey: "",
  imageToken: 0,
  returnFocus: null,
};

let playPresentationDiagramResizeObserver = null;
let playPresentationDiagramResizeFrame = 0;
let playPresentationDiagramSizeKey = "";
let playPresentationSwipeStart = null;

let playPresentationViewportSyncFrame = 0;
let playPresentationViewportKey = "";
let playPresentationRotateHintDismissed = false;
let playPresentationAutoAdvanceTimer = 0;

// M-042 — Projector Clean View + HUD auto-hide (session-local, reset on open)
const PLAY_PRESENTATION_HUD_IDLE_MS = 3500;
let playPresentationCleanView = false;
let playPresentationHudTimer = 0;
// Session-only dismissal for the in-landscape projector install prompt.
let playPresentationProjectorPromptDismissed = false;

// M-042 — Screen Wake Lock (session-local, explicit user action)
let playPresentationWakeLock = null;
let playPresentationWakeLockDesired = false;

// M-042 — Diagram zoom / pan (session-local, resets on play change)
const PLAY_PRESENTATION_ZOOM_MIN = 1;
const PLAY_PRESENTATION_ZOOM_MAX = 4;
const PLAY_PRESENTATION_ZOOM_STEP = 0.5;
let playPresentationZoom = { scale: 1, x: 0, y: 0 };
let playPresentationPan = null;

// M-042 — Telestrator (session-local, drawings clear on play change)
const PLAY_PRESENTATION_TELE_TOOLS = new Set(["pen", "arrow", "circle", "eraser"]);
let playPresentationTeleEnabled = false;
let playPresentationTeleTool = "pen";
let playPresentationTeleColor = "#ffd400";
let playPresentationTeleWidth = 5;
let playPresentationTeleStrokes = [];
let playPresentationTeleActive = null;
let playPresentationTeleCanvas = null;
let playPresentationTeleCtx = null;

// M-042 — Optional detail panel (session-local, side panel on landscape /
// bottom sheet on portrait). Shows full play detail without leaving the
// diagram-focused mode.
let playPresentationDetailOpen = false;

const PLAY_PRESENTATION_DEFAULT_OPTIONS = {
  order: "listed", // "listed" | "reverse"
  showPersonnel: true,
  showDefense: true,
  showAssignment: true,
  showNotes: true,
  autoAdvanceSeconds: 0, // 0 = off
  theme: "auto", // "auto" | "dark" | "light"
};

let playPresentationOptions = { ...PLAY_PRESENTATION_DEFAULT_OPTIONS };

function loadPlayPresentationOptions() {
  if (typeof storageManager === "undefined") return;
  const saved = storageManager.get(
    STORAGE_KEYS.PRESENTATION_SETUP,
    null,
  );
  if (saved && typeof saved === "object") {
    playPresentationOptions = {
      ...PLAY_PRESENTATION_DEFAULT_OPTIONS,
      ...saved,
    };
  }
}

function savePlayPresentationOptions() {
  if (typeof storageManager === "undefined") return;
  storageManager.set(STORAGE_KEYS.PRESENTATION_SETUP, playPresentationOptions);
}

// ---- Theme override (scoped to the presentation overlay) --------------------
function resolvePlayPresentationTheme() {
  const choice = playPresentationOptions.theme;
  if (choice === "dark" || choice === "light") return choice;
  // "auto" follows the app theme.
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function applyPlayPresentationTheme() {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay) return;
  if (playPresentationOptions.theme === "auto") {
    overlay.removeAttribute("data-pp-theme");
  } else {
    overlay.dataset.ppTheme = resolvePlayPresentationTheme();
  }
}

// ---- Auto-advance -----------------------------------------------------------
function stopPlayPresentationAutoAdvance() {
  if (playPresentationAutoAdvanceTimer) {
    clearInterval(playPresentationAutoAdvanceTimer);
    playPresentationAutoAdvanceTimer = 0;
  }
}

function startPlayPresentationAutoAdvance() {
  stopPlayPresentationAutoAdvance();
  const seconds = Number(playPresentationOptions.autoAdvanceSeconds) || 0;
  if (seconds <= 0) return;
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) return;
  playPresentationAutoAdvanceTimer = setInterval(() => {
    if (
      playPresentationState.index >=
      playPresentationState.items.length - 1
    ) {
      stopPlayPresentationAutoAdvance();
      return;
    }
    movePlayPresentation(1);
  }, seconds * 1000);
}

// Reset the running timer whenever the user navigates manually so they keep
// full dwell time on the play they jumped to.
function restartPlayPresentationAutoAdvanceIfRunning() {
  if (playPresentationAutoAdvanceTimer) startPlayPresentationAutoAdvance();
}

// ---- Projector Clean View + HUD auto-hide (M-042) ---------------------------
// Clean View strips the projected output down to the diagram + call: it hides
// the mode switcher, footer touch hints, source label, and coach-only notes,
// suppresses non-critical toasts, and auto-hides the header after a short idle.
// Any tap or pointer move re-reveals the HUD so controls stay reachable.
function schedulePlayPresentationHudHide() {
  clearTimeout(playPresentationHudTimer);
  if (!playPresentationCleanView) return;
  playPresentationHudTimer = setTimeout(() => {
    const overlay = document.getElementById("playPresentationOverlay");
    if (overlay && playPresentationCleanView) {
      overlay.dataset.ppHudHidden = "1";
    }
  }, PLAY_PRESENTATION_HUD_IDLE_MS);
}

function revealPlayPresentationHud(autoHide = true) {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay) return;
  overlay.removeAttribute("data-pp-hud-hidden");
  if (autoHide && playPresentationCleanView) {
    schedulePlayPresentationHudHide();
  } else {
    clearTimeout(playPresentationHudTimer);
  }
}

function updatePlayPresentationCleanViewButton() {
  const btn = document.getElementById("playPresentationCleanBtn");
  if (!btn) return;
  const on = playPresentationCleanView;
  btn.classList.toggle("active", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  const label = on ? "Exit Projector Clean View" : "Projector Clean View";
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

function syncPlayPresentationHeaderOffset() {
  const overlay = document.getElementById("playPresentationOverlay");
  const header = overlay?.querySelector(".pp-header");
  if (!overlay || !header) return;
  const height = Math.ceil(header.getBoundingClientRect().height || 62);
  overlay.style.setProperty("--pp-header-offset", `${Math.max(48, height)}px`);
}

function setPlayPresentationCleanView(on) {
  playPresentationCleanView = !!on;
  const overlay = document.getElementById("playPresentationOverlay");
  if (overlay) {
    if (playPresentationCleanView) {
      overlay.dataset.ppClean = "1";
      schedulePlayPresentationHudHide();
    } else {
      overlay.removeAttribute("data-pp-clean");
      overlay.removeAttribute("data-pp-hud-hidden");
      clearTimeout(playPresentationHudTimer);
    }
  }
  updatePlayPresentationCleanViewButton();
}

function togglePlayPresentationCleanView() {
  setPlayPresentationCleanView(!playPresentationCleanView);
  if (typeof showToast === "function" && !playPresentationCleanView) {
    // Confirm exit (suppressed while clean view is active).
    showToast("Projector Clean View off", { duration: 1500 });
  }
}

// M-042 — In-landscape projector install prompt. iPad/iOS Safari cannot hide
// its address bar/tab bar from web code; the only chrome-free projector view is
// the installed PWA. When a coach rotates to landscape in plain Safari we surface
// a dismissible nudge that opens the Add-to-Home-Screen guide.
function shouldShowPlayPresentationProjectorPrompt() {
  if (playPresentationProjectorPromptDismissed) return false;
  if (isPlayPresentationStandalone()) return false;
  if (!isPlayPresentationIPadOS()) return false;
  if (isPlayPresentationIpadHelpDismissed()) return false;
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) return false;
  const { width, height } = getPlayPresentationViewportSize();
  return isPlayPresentationMobileViewport() && width > height;
}

function updatePlayPresentationProjectorPrompt() {
  const prompt = document.getElementById("playPresentationProjectorPrompt");
  if (!prompt) return;
  prompt.hidden = !shouldShowPlayPresentationProjectorPrompt();
}

function openPlayPresentationProjectorGuide() {
  openPlayPresentationIpadHelp();
}

function dismissPlayPresentationProjectorPrompt() {
  playPresentationProjectorPromptDismissed = true;
  updatePlayPresentationProjectorPrompt();
}

// M-042 — Optional detail panel -----------------------------------------------
// An on-demand reference panel that shows the full play detail (call structure,
// situation, defensive look, coaching points, notes, and player rules) without
// switching out of the current Minimum/Player/Coaches mode. It renders as a
// right-side panel in landscape and a bottom sheet in portrait, with the panel
// body the only scroll surface.
function getPlayPresentationDetailPanelMarkup(item) {
  if (!item || !item.play) {
    return `<p class="pp-detail-panel-empty">No play selected.</p>`;
  }
  const play = item.play;
  const signalAvailability =
    typeof renderSignalAvailabilityForPlay === "function"
      ? renderSignalAvailabilityForPlay(play, {
        className: "signal-availability--presentation-detail",
        title: "Signals for this play",
        action: "openPlayPresentationSignals",
        buttonLabel: "Watch",
      })
      : "";
  const { callRows, situationRows, defenseRows, coachingRows } =
    getPlayPresentationDetailRowGroups(play);
  const assignmentMarkup = getPlayPresentationPositions()
    .filter((position) => String(play[position.key] || "").trim())
    .map(
      (position) => `
        <div class="pp-assignment-card">
          <strong>${escapeHtml(position.label)}</strong>
          <span>${escapeHtml(play[position.key])}</span>
        </div>
      `,
    )
    .join("");
  const sections = [
    signalAvailability,
    getPlayPresentationCoachSection(
      "Call Structure",
      "Formation, motion, and call mechanics",
      callRows,
      "pp-coach-section-call",
    ),
    getPlayPresentationCoachSection(
      "Situation",
      "When and where this fits",
      situationRows,
      "pp-coach-section-situation",
    ),
    getPlayPresentationCoachSection(
      "Defensive Look",
      "Practice picture and defensive answers",
      defenseRows,
      "pp-coach-section-defense",
    ),
    getPlayPresentationCoachSection(
      "Coaching Points",
      "Keys, complements, alerts, and targets",
      coachingRows,
      "pp-coach-section-tools",
    ),
    assignmentMarkup
      ? `
        <section class="pp-coach-section pp-coach-section-rules" aria-label="Player rules">
          <div class="pp-coach-section-head">
            <h3>Player Rules</h3>
            <span>Assignment by position</span>
          </div>
          <div class="pp-assignment-grid">${assignmentMarkup}</div>
        </section>
      `
      : "",
    getPlayPresentationCoachNotesMarkup(play),
  ]
    .filter(Boolean)
    .join("");
  return sections || `<p class="pp-detail-panel-empty">No extra detail for this play.</p>`;
}

function renderPlayPresentationDetailPanel() {
  const body = document.getElementById("playPresentationDetailBody");
  if (!body) return;
  const item = playPresentationState.items[playPresentationState.index];
  setInnerHTML(body, getPlayPresentationDetailPanelMarkup(item));
  loadPlayPresentationDetailClips(item, body);
}

// Asynchronously fetch and prepend any cloud video clips for the current play.
// Uses a stale token so navigating away mid-fetch never injects the wrong clips.
// Built with direct innerHTML (not setInnerHTML) so coach clip previews can use
// the same fast silent-loop playback contract as player-facing videos.
async function loadPlayPresentationDetailClips(item, body) {
  if (!body || !item || !item.play) return;
  if (typeof window.playClips === "undefined") return;
  const play = item.play;
  const sig = window.playClips.sigForPlay(play);
  if (!sig) return;
  const token = `${sig}#${playPresentationState.index}`;
  body.dataset.ppClipToken = token;
  let clips = [];
  try {
    clips = await window.playClips.list(play);
  } catch (_err) {
    return;
  }
  if (body.dataset.ppClipToken !== token) return;
  if (!Array.isArray(clips) || !clips.length) return;

  const section = document.createElement("section");
  section.className = "pp-coach-section pp-detail-clips";
  section.setAttribute("aria-label", "Video clips");
  const clipMarkup = clips
    .map((clip) => {
      const url = clip.url || window.playClips.fileUrl(play, clip.id);
      return `<figure class="pp-detail-clip">
        <video class="pp-detail-clip-video" autoplay loop muted preload="auto" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback" src="${escapeHtml(url)}"></video>
        ${clip.label ? `<figcaption class="pp-detail-clip-caption">${escapeHtml(clip.label)}</figcaption>` : ""}
      </figure>`;
    })
    .join("");
  section.innerHTML = `<div class="pp-coach-section-head">
      <h3>🎬 Video Clips</h3>
      <span>${clips.length} clip${clips.length === 1 ? "" : "s"}</span>
    </div>
    <div class="pp-detail-clips-list">${clipMarkup}</div>`;
  body.insertBefore(section, body.firstChild);
  if (typeof window.playClips?.configureLoopPreviewVideo === "function") {
    section.querySelectorAll(".pp-detail-clip-video").forEach((video) => {
      window.playClips.configureLoopPreviewVideo(video);
    });
  }
}

function updatePlayPresentationDetailButton() {
  const btn = document.getElementById("playPresentationDetailBtn");
  if (!btn) return;
  btn.classList.toggle("active", playPresentationDetailOpen);
  btn.setAttribute("aria-pressed", playPresentationDetailOpen ? "true" : "false");
  const label = playPresentationDetailOpen ? "Hide play detail" : "Show play detail";
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

// Show the 🎬 header button only when the current play actually has clips, so
// coaches and players have one obvious tap target to watch video.
function updatePlayPresentationClipsButton() {
  const btn = document.getElementById("playPresentationClipsBtn");
  if (!btn) return;
  const item = playPresentationState.items[playPresentationState.index];
  const hasClips =
    !!item &&
    typeof window.playClips !== "undefined" &&
    typeof window.playClips.hasForPlay === "function" &&
    window.playClips.hasForPlay(item.play);
  btn.hidden = !hasClips;
}

function openPlayPresentationClips() {
  const item = playPresentationState.items[playPresentationState.index];
  if (!item || typeof window.openPlayClipViewer !== "function") return;
  window.openPlayClipViewer(item.play, getPlayPresentationPlayLabel(item.play));
}

function updatePlayPresentationSignalsButton() {
  const btn = document.getElementById("playPresentationSignalsBtn");
  if (!btn) return;
  const item = playPresentationState.items[playPresentationState.index];
  const count =
    item && typeof getSignalCountForPlay === "function"
      ? getSignalCountForPlay(item.play)
      : 0;
  btn.hidden = count <= 0;
  btn.setAttribute(
    "aria-label",
    count > 0
      ? `Watch ${count} signal clip${count === 1 ? "" : "s"} for this play`
      : "Watch play signals",
  );
  btn.title =
    count > 0
      ? `Watch ${count} signal clip${count === 1 ? "" : "s"}`
      : "Watch play signals";
}

function openPlayPresentationSignals() {
  const item = playPresentationState.items[playPresentationState.index];
  if (!item || typeof openSignalSelectorForPlay !== "function") return;
  openSignalSelectorForPlay(item.play, { sourceLabel: "Swipe View Signals" });
}

function setPlayPresentationDetailPanel(on) {
  playPresentationDetailOpen = !!on;
  const overlay = document.getElementById("playPresentationOverlay");
  const panel = document.getElementById("playPresentationDetailPanel");
  if (overlay) overlay.classList.toggle("pp-detail-open", playPresentationDetailOpen);
  if (panel) {
    panel.hidden = !playPresentationDetailOpen;
    panel.setAttribute("aria-hidden", playPresentationDetailOpen ? "false" : "true");
  }
  if (playPresentationDetailOpen) {
    renderPlayPresentationDetailPanel();
    const scroll = document.getElementById("playPresentationDetailBody");
    if (scroll) scroll.scrollTop = 0;
  }
  updatePlayPresentationDetailButton();
}

function togglePlayPresentationDetailPanel() {
  setPlayPresentationDetailPanel(!playPresentationDetailOpen);
}

function closePlayPresentationDetailPanel() {
  setPlayPresentationDetailPanel(false);
}

// Non-critical toasts emitted by the presentation route through this so they
// stay silent while Clean View is projecting.
function playPresentationToast(message, opts) {
  if (playPresentationCleanView) return;
  if (typeof showToast === "function") showToast(message, opts);
}

function handlePlayPresentationPointerActivity() {
  if (!playPresentationCleanView) return;
  revealPlayPresentationHud(true);
}

// ---- Screen Wake Lock (M-042) ----------------------------------------------
// Keeps the projector/iPad display awake while presenting. Requires an explicit
// user tap, releases on exit or when the page is hidden, and falls back to a
// toast (never blocking the presentation) when the API is unavailable.
function isPlayPresentationWakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

function updatePlayPresentationWakeButton() {
  const btn = document.getElementById("playPresentationWakeBtn");
  if (!btn) return;
  if (!isPlayPresentationWakeLockSupported()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const active = !!playPresentationWakeLock;
  btn.classList.toggle("active", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
  const label = active ? "Screen stays awake" : "Keep screen awake";
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

async function requestPlayPresentationWakeLock() {
  if (!isPlayPresentationWakeLockSupported()) {
    playPresentationToast(
      "This browser can't keep the screen awake. Adjust the device's auto-lock setting instead.",
      { duration: 4000, type: "error" },
    );
    playPresentationWakeLockDesired = false;
    updatePlayPresentationWakeButton();
    return;
  }
  try {
    playPresentationWakeLock = await navigator.wakeLock.request("screen");
    playPresentationWakeLock.addEventListener("release", () => {
      playPresentationWakeLock = null;
      updatePlayPresentationWakeButton();
    });
  } catch (_err) {
    playPresentationWakeLock = null;
    playPresentationWakeLockDesired = false;
    playPresentationToast(
      "Couldn't keep the screen awake. Adjust the device's auto-lock setting instead.",
      { duration: 4000, type: "error" },
    );
  }
  updatePlayPresentationWakeButton();
}

async function releasePlayPresentationWakeLock() {
  if (playPresentationWakeLock) {
    try {
      await playPresentationWakeLock.release();
    } catch (_err) {
      // Ignore release failures; the sentinel is being discarded anyway.
    }
  }
  playPresentationWakeLock = null;
  updatePlayPresentationWakeButton();
}

function togglePlayPresentationWakeLock() {
  if (playPresentationWakeLockDesired || playPresentationWakeLock) {
    playPresentationWakeLockDesired = false;
    releasePlayPresentationWakeLock();
  } else {
    playPresentationWakeLockDesired = true;
    requestPlayPresentationWakeLock();
  }
}

// Wake Lock is auto-released by the browser when the tab is hidden; re-acquire
// it when the presentation tab becomes visible again and the user still wants it.
function handlePlayPresentationWakeVisibility() {
  if (document.visibilityState !== "visible") return;
  if (!playPresentationWakeLockDesired || playPresentationWakeLock) return;
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) return;
  requestPlayPresentationWakeLock();
}

// ---- Diagram zoom / pan (M-042) --------------------------------------------
// Manual zoom + drag-to-pan on the play diagram. Zoom-to-fit is the default
// (the canvas already fits the frame at scale 1). Panning only engages while
// zoomed in, so it never competes with swipe navigation at fit scale.
function getPlayPresentationDiagramCanvas() {
  return document.querySelector(
    "#playPresentationDiagram .pp-diagram-canvas",
  );
}

function updatePlayPresentationZoomControls() {
  const out = document.getElementById("playPresentationZoomOut");
  const inBtn = document.getElementById("playPresentationZoomIn");
  const reset = document.getElementById("playPresentationZoomReset");
  const z = playPresentationZoom;
  if (out) out.disabled = z.scale <= PLAY_PRESENTATION_ZOOM_MIN + 0.001;
  if (inBtn) inBtn.disabled = z.scale >= PLAY_PRESENTATION_ZOOM_MAX - 0.001;
  if (reset) {
    reset.disabled = z.scale <= 1.001 && z.x === 0 && z.y === 0;
    reset.textContent = `${Math.round(z.scale * 100)}%`;
  }
}

function applyPlayPresentationZoomTransform() {
  const canvas = getPlayPresentationDiagramCanvas();
  const frame = document.getElementById("playPresentationDiagram");
  const z = playPresentationZoom;
  if (canvas) {
    canvas.style.transformOrigin = "center center";
    canvas.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.scale})`;
  }
  if (frame) {
    frame.classList.toggle("pp-diagram-zoomed", z.scale > 1.001);
  }
  updatePlayPresentationZoomControls();
}

function clampPlayPresentationPan() {
  const frame = document.getElementById("playPresentationDiagram");
  if (!frame) return;
  const rect = frame.getBoundingClientRect();
  const z = playPresentationZoom;
  const maxX = ((z.scale - 1) * rect.width) / 2;
  const maxY = ((z.scale - 1) * rect.height) / 2;
  z.x = Math.max(-maxX, Math.min(maxX, z.x));
  z.y = Math.max(-maxY, Math.min(maxY, z.y));
}

function setPlayPresentationZoomScale(scale) {
  const z = playPresentationZoom;
  z.scale = Math.max(
    PLAY_PRESENTATION_ZOOM_MIN,
    Math.min(PLAY_PRESENTATION_ZOOM_MAX, scale),
  );
  if (z.scale <= 1.001) {
    z.scale = 1;
    z.x = 0;
    z.y = 0;
  }
  clampPlayPresentationPan();
  applyPlayPresentationZoomTransform();
}

function zoomPlayPresentationIn() {
  setPlayPresentationZoomScale(playPresentationZoom.scale + PLAY_PRESENTATION_ZOOM_STEP);
}

function zoomPlayPresentationOut() {
  setPlayPresentationZoomScale(playPresentationZoom.scale - PLAY_PRESENTATION_ZOOM_STEP);
}

function resetPlayPresentationZoom() {
  playPresentationZoom = { scale: 1, x: 0, y: 0 };
  playPresentationPan = null;
  applyPlayPresentationZoomTransform();
}

// Attaches drag-to-pan to a freshly rendered diagram frame. Pointer Events keep
// mouse, touch, and Apple Pencil consistent; panning only runs while zoomed.
// Also adds pinch-to-zoom and double-tap-to-zoom for phones.
function attachPlayPresentationPan(frame) {
  if (!frame) return;
  // Bind once per frame lifetime. This runs on EVERY diagram render (each play
  // open + every next/prev in the reels viewer), but the frame element
  // (#playPresentationDiagram) is persistent and the handlers read module-global
  // pan/zoom state — so without this guard the 8 pointer/touch listeners below
  // would stack ~8×N deep as a player flips through plays (memory + duplicate
  // gesture math). The flag lives on the element, so it resets if the frame is
  // ever recreated.
  if (frame._ppPanBound) return;
  frame._ppPanBound = true;
  frame.addEventListener("pointerdown", (event) => {
    if (playPresentationZoom.scale <= 1.001) return;
    if (event.button && event.button !== 0) return;
    playPresentationPan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: playPresentationZoom.x,
      originY: playPresentationZoom.y,
    };
    frame.setPointerCapture?.(event.pointerId);
    frame.classList.add("pp-diagram-panning");
    event.preventDefault();
  });
  frame.addEventListener("pointermove", (event) => {
    if (!playPresentationPan || event.pointerId !== playPresentationPan.pointerId) {
      return;
    }
    playPresentationZoom.x =
      playPresentationPan.originX + (event.clientX - playPresentationPan.startX);
    playPresentationZoom.y =
      playPresentationPan.originY + (event.clientY - playPresentationPan.startY);
    clampPlayPresentationPan();
    applyPlayPresentationZoomTransform();
    event.preventDefault();
  });
  const endPan = (event) => {
    if (!playPresentationPan || event.pointerId !== playPresentationPan.pointerId) {
      return;
    }
    frame.releasePointerCapture?.(event.pointerId);
    frame.classList.remove("pp-diagram-panning");
    playPresentationPan = null;
  };
  frame.addEventListener("pointerup", endPan);
  frame.addEventListener("pointercancel", endPan);

  // ── Pinch-to-zoom ──────────────────────────────────────────────────────────
  let _pinchStart = null;
  frame.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      _pinchStart = { dist: Math.hypot(dx, dy), scale: playPresentationZoom.scale };
      e.preventDefault();
    }
  }, { passive: false });

  frame.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && _pinchStart) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const newDist = Math.hypot(dx, dy);
      if (_pinchStart.dist > 0) {
        setPlayPresentationZoomScale(_pinchStart.scale * (newDist / _pinchStart.dist));
      }
      e.preventDefault();
    }
  }, { passive: false });

  frame.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) _pinchStart = null;
  }, { passive: true });

  // ── Double-tap to zoom in / reset ─────────────────────────────────────────
  let _lastTapTime = 0;
  frame.addEventListener("touchend", (e) => {
    if (_pinchStart) return; // Ignore during pinch
    if (e.changedTouches.length !== 1 || e.touches.length > 0) return;
    const now = Date.now();
    const elapsed = now - _lastTapTime;
    _lastTapTime = now;
    if (elapsed < 320) {
      // Double tap: toggle zoom
      e.preventDefault();
      if (playPresentationZoom.scale > 1.001) {
        resetPlayPresentationZoom();
      } else {
        setPlayPresentationZoomScale(2.5);
      }
    }
  }, { passive: false });
}

// ---- Telestrator (M-042) ----------------------------------------------------
// Session-local drawing layer over the diagram. Strokes are stored as
// normalized (0..1) points so they re-align after resize/rotation. Each stroke
// (pen/arrow/circle/eraser) is replayed in order, so Undo just pops the last
// stroke and Clear empties the list. Pointer Events cover mouse, touch, and
// Apple Pencil; the canvas captures pointers so drawing never navigates plays.
function getPlayPresentationTeleNormPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0,
    y: rect.height ? Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) : 0,
  };
}

function drawPlayPresentationTeleStroke(ctx, stroke, w, h) {
  const pts = stroke.points;
  if (!pts || !pts.length) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth =
    stroke.tool === "eraser" ? stroke.width * dpr * 4 : stroke.width * dpr;
  const toPx = (p) => ({ x: p.x * w, y: p.y * h });

  if (stroke.tool === "arrow" && pts.length >= 2) {
    const a = toPx(pts[0]);
    const b = toPx(pts[pts.length - 1]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(12 * dpr, ctx.lineWidth * 3);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(
      b.x - head * Math.cos(angle - Math.PI / 6),
      b.y - head * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      b.x - head * Math.cos(angle + Math.PI / 6),
      b.y - head * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  } else if (stroke.tool === "circle" && pts.length >= 2) {
    const a = toPx(pts[0]);
    const b = toPx(pts[pts.length - 1]);
    ctx.beginPath();
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.max(Math.abs(b.x - a.x) / 2, 2),
      Math.max(Math.abs(b.y - a.y) / 2, 2),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } else {
    const first = toPx(pts[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < pts.length; i += 1) {
      const p = toPx(pts[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (pts.length === 1) ctx.lineTo(first.x + 0.1, first.y + 0.1);
    ctx.stroke();
  }
}

function redrawPlayPresentationTele() {
  const ctx = playPresentationTeleCtx;
  const canvas = playPresentationTeleCanvas;
  if (!ctx || !canvas) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const strokes = playPresentationTeleActive
    ? playPresentationTeleStrokes.concat([playPresentationTeleActive])
    : playPresentationTeleStrokes;
  for (const stroke of strokes) {
    drawPlayPresentationTeleStroke(ctx, stroke, canvas.width, canvas.height);
  }
  ctx.globalCompositeOperation = "source-over";
}

function resizePlayPresentationTeleCanvas() {
  const canvas = playPresentationTeleCanvas;
  const frame = document.getElementById("playPresentationDiagram");
  if (!canvas || !frame) return;
  const rect = frame.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  redrawPlayPresentationTele();
}

function attachPlayPresentationTelePointer(canvas) {
  canvas.addEventListener("pointerdown", (event) => {
    if (!playPresentationTeleEnabled) return;
    if (event.button && event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    playPresentationTeleActive = {
      tool: playPresentationTeleTool,
      color: playPresentationTeleColor,
      width: playPresentationTeleWidth,
      pointerId: event.pointerId,
      points: [getPlayPresentationTeleNormPoint(canvas, event)],
    };
    redrawPlayPresentationTele();
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (
      !playPresentationTeleActive ||
      event.pointerId !== playPresentationTeleActive.pointerId
    ) {
      return;
    }
    const pt = getPlayPresentationTeleNormPoint(canvas, event);
    const tool = playPresentationTeleActive.tool;
    if (tool === "arrow" || tool === "circle") {
      playPresentationTeleActive.points = [
        playPresentationTeleActive.points[0],
        pt,
      ];
    } else {
      playPresentationTeleActive.points.push(pt);
    }
    redrawPlayPresentationTele();
    event.preventDefault();
  });
  const finishStroke = (event) => {
    if (
      !playPresentationTeleActive ||
      event.pointerId !== playPresentationTeleActive.pointerId
    ) {
      return;
    }
    canvas.releasePointerCapture?.(event.pointerId);
    const stroke = playPresentationTeleActive;
    playPresentationTeleActive = null;
    if (stroke.points.length) {
      delete stroke.pointerId;
      playPresentationTeleStrokes.push(stroke);
    }
    updatePlayPresentationTeleControls();
    redrawPlayPresentationTele();
  };
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);
}

function ensurePlayPresentationTeleCanvas() {
  const frame = document.getElementById("playPresentationDiagram");
  if (!frame) {
    playPresentationTeleCanvas = null;
    playPresentationTeleCtx = null;
    return;
  }
  let canvas = frame.querySelector(".pp-telestrator-canvas");
  if (!playPresentationTeleEnabled) {
    if (canvas) canvas.remove();
    playPresentationTeleCanvas = null;
    playPresentationTeleCtx = null;
    frame.classList.remove("pp-telestrator-on");
    return;
  }
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "pp-telestrator-canvas";
    canvas.setAttribute("aria-hidden", "true");
    frame.appendChild(canvas);
    attachPlayPresentationTelePointer(canvas);
  }
  playPresentationTeleCanvas = canvas;
  playPresentationTeleCtx = canvas.getContext("2d");
  frame.classList.add("pp-telestrator-on");
  resizePlayPresentationTeleCanvas();
}

function updatePlayPresentationTeleControls() {
  const undo = document.getElementById("playPresentationTeleUndo");
  const clear = document.getElementById("playPresentationTeleClear");
  const empty = playPresentationTeleStrokes.length === 0;
  if (undo) undo.disabled = empty;
  if (clear) clear.disabled = empty;
}

function updatePlayPresentationTeleButton() {
  const btn = document.getElementById("playPresentationTeleBtn");
  if (!btn) return;
  btn.classList.toggle("active", playPresentationTeleEnabled);
  btn.setAttribute("aria-pressed", playPresentationTeleEnabled ? "true" : "false");
}

function setPlayPresentationTeleTool(tool) {
  if (!PLAY_PRESENTATION_TELE_TOOLS.has(tool)) return;
  playPresentationTeleTool = tool;
  document.querySelectorAll("[data-pp-tele-tool]").forEach((btn) => {
    const on = btn.dataset.ppTeleTool === tool;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function setPlayPresentationTeleColor(color) {
  if (typeof color !== "string" || !color) return;
  playPresentationTeleColor = color;
  document.querySelectorAll("[data-pp-tele-color]").forEach((btn) => {
    const on = btn.dataset.ppTeleColor === color;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function setPlayPresentationTeleWidth(width) {
  const value = parseInt(width, 10) || 5;
  playPresentationTeleWidth = value;
  document.querySelectorAll("[data-pp-tele-width]").forEach((btn) => {
    const on = parseInt(btn.dataset.ppTeleWidth, 10) === value;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function undoPlayPresentationTele() {
  playPresentationTeleStrokes.pop();
  updatePlayPresentationTeleControls();
  redrawPlayPresentationTele();
}

function clearPlayPresentationTele() {
  playPresentationTeleStrokes = [];
  playPresentationTeleActive = null;
  updatePlayPresentationTeleControls();
  redrawPlayPresentationTele();
}

function setPlayPresentationTelestrator(on) {
  playPresentationTeleEnabled = !!on;
  const bar = document.getElementById("playPresentationTeleBar");
  if (bar) bar.hidden = !playPresentationTeleEnabled;
  ensurePlayPresentationTeleCanvas();
  updatePlayPresentationTeleButton();
  updatePlayPresentationTeleControls();
}

function togglePlayPresentationTelestrator() {
  setPlayPresentationTelestrator(!playPresentationTeleEnabled);
}

// ---- Order ------------------------------------------------------------------
function applyPlayPresentationOrder(items, startIndex) {
  if (playPresentationOptions.order !== "reverse") {
    return { items, startIndex };
  }
  const reversed = items.slice().reverse();
  const newStart = items.length - 1 - startIndex;
  return {
    items: reversed,
    startIndex: Math.max(0, Math.min(newStart, reversed.length - 1)),
  };
}

function tracePlayPresentationAction(phase, payload = {}, level = "info") {
  const data = {
    phaseAction: payload.action || "openScriptPresentation",
    source: playPresentationState.source,
    mode: playPresentationState.mode,
    index: playPresentationState.index,
    itemCount: playPresentationState.items.length,
    role:
      typeof getCurrentAuthUser === "function"
        ? getCurrentAuthUser()?.role || ""
        : "",
    activeTab:
      typeof currentActiveTab !== "undefined"
        ? currentActiveTab
        : document.body?.dataset.activeTab || "",
    ...payload,
  };
  if (typeof traceAppAction === "function") {
    traceAppAction(`presentation ${phase}`, data, {}, level);
    return;
  }
  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  logger.call(console, `[BC presentation trace] ${phase}`, data);
}

function isPlayerPresentationRole() {
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return currentUser?.role === "player";
}

function getAllowedPlayPresentationModes() {
  return isPlayerPresentationRole()
    ? ["minimum", "player"]
    : ["minimum", "player", "coaches"];
}

function getDefaultPlayPresentationMode(source = playPresentationState.source) {
  if (isPlayerPresentationRole()) {
    return source === "script" ? "player" : "minimum";
  }
  return "minimum";
}

function ensurePlayPresentationModeAllowed(preferredMode) {
  const allowedModes = getAllowedPlayPresentationModes();
  if (allowedModes.includes(preferredMode)) return preferredMode;
  return getDefaultPlayPresentationMode();
}

function getPlayPresentationFooterText() {
  if (isPlayerPresentationRole()) {
    return "Swipe or arrow keys change plays · 1 Minimum · 2 Plays · L Lock Position · Esc closes";
  }
  return "Swipe or arrow keys change plays · 1 Minimum · 2 Player · 3 Coaches · L Lock Position · Esc closes";
}

function syncPlayPresentationRoleUi() {
  const allowedModes = new Set(getAllowedPlayPresentationModes());
  const playerToggleLabel = isPlayerPresentationRole() ? "Plays" : "Player";
  const footer = document.getElementById("playPresentationFooterHint");
  if (footer) footer.textContent = getPlayPresentationFooterText();

  document.querySelectorAll("[data-presentation-mode]").forEach((button) => {
    const mode = button.dataset.presentationMode;
    const allowed = allowedModes.has(mode);
    button.hidden = !allowed;
    button.setAttribute("aria-hidden", allowed ? "false" : "true");
    if (mode === "player") {
      button.textContent = playerToggleLabel;
    }
  });
}

function getPlayPresentationPositions() {
  if (typeof RESP_POSITIONS !== "undefined" && Array.isArray(RESP_POSITIONS)) {
    return RESP_POSITIONS;
  }
  return [
    { key: "respQ", label: "Q" },
    { key: "respT", label: "T" },
    { key: "respH", label: "H" },
    { key: "respZ", label: "Z" },
    { key: "respX", label: "X" },
    { key: "respY", label: "Y" },
    { key: "respLT", label: "LT" },
    { key: "respLG", label: "LG" },
    { key: "respC", label: "C" },
    { key: "respRG", label: "RG" },
    { key: "respRT", label: "RT" },
  ];
}

function getPlayPresentationPlayLabel(play) {
  return [play?.formation, play?.protection, play?.play]
    .filter(Boolean)
    .join(" ") || "Untitled Play";
}

function getPlayPresentationItemsFromPlaybook() {
  return (Array.isArray(filteredPlays) ? filteredPlays : [])
    .filter(Boolean)
    .map((play, filteredIndex) => ({
      play,
      sourceIndex: filteredIndex,
      context: "Filtered Playbook",
      number: filteredIndex + 1,
    }));
}

function getPlayPresentationItemsFromScript() {
  const items = [];
  let periodLabel = "Practice Script";
  let playNumber = 0;

  (Array.isArray(script) ? script : []).forEach((entry, scriptIndex) => {
    if (!entry) return;
    if (entry.isSeparator) {
      periodLabel = entry.label || "Period";
      return;
    }
    playNumber += 1;
    items.push({
      play: entry,
      sourceIndex: scriptIndex,
      context: periodLabel,
      number: playNumber,
    });
  });
  return items;
}

function openSelectedPlaybookPresentation() {
  const items = getPlayPresentationItemsFromPlaybook();
  if (items.length === 0) {
    tracePlayPresentationAction(
      "open failed",
      {
        action: "openSelectedPlaybookPresentation",
        reason: "no-filtered-playbook-items",
      },
      "warn",
    );
    showToast("No filtered plays are available to present.", { type: "warning" });
    return false;
  }
  const startIndex = Math.max(
    0,
    items.findIndex((item) => item.sourceIndex === selectedRowIndex),
  );
  return openPlayPresentation(items, startIndex, "playbook");
}

function openPlaybookPresentation(filteredIndex) {
  const targetIndex = parseInt(filteredIndex, 10);
  const items = getPlayPresentationItemsFromPlaybook();
  const startIndex = items.findIndex((item) => item.sourceIndex === targetIndex);
  if (startIndex < 0) {
    tracePlayPresentationAction(
      "open failed",
      {
        action: "openPlaybookPresentation",
        filteredIndex,
        reason: "playbook-index-not-found",
      },
      "warn",
    );
    return false;
  }
  selectPlaybookRow(targetIndex);
  return openPlayPresentation(items, startIndex, "playbook");
}

function openScriptPresentation(scriptIndex) {
  const targetIndex = parseInt(scriptIndex, 10);
  const items = getPlayPresentationItemsFromScript();
  if (items.length === 0) {
    tracePlayPresentationAction(
      "open failed",
      {
        action: "openScriptPresentation",
        scriptIndex,
        reason: "no-script-items",
      },
      "warn",
    );
    showToast("Add a play to the script before presenting.", {
      type: "warning",
    });
    return false;
  }
  const requestedIndex = Number.isInteger(targetIndex)
    ? items.findIndex((item) => item.sourceIndex === targetIndex)
    : -1;
  const selectedIndex = Array.isArray(bulkSelectedIndices)
    ? items.findIndex((item) => bulkSelectedIndices.includes(item.sourceIndex))
    : -1;
  return openPlayPresentation(
    items,
    requestedIndex >= 0 ? requestedIndex : Math.max(0, selectedIndex),
    "script",
  );
}

function getPlayPresentationViewportSize() {
  const viewport = window.visualViewport;
  return {
    width: Math.max(1, Math.round(viewport?.width || window.innerWidth || 1)),
    height: Math.max(1, Math.round(viewport?.height || window.innerHeight || 1)),
  };
}

function isPlayPresentationMobileViewport() {
  const { width, height } = getPlayPresentationViewportSize();
  const coarsePointer =
    window.matchMedia?.("(pointer: coarse)")?.matches ||
    window.matchMedia?.("(hover: none)")?.matches;
  return Boolean(coarsePointer || Math.min(width, height) <= 760);
}

function syncPlayPresentationMobileLandscape() {
  playPresentationViewportSyncFrame = 0;
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) return;

  const { width, height } = getPlayPresentationViewportSize();
  const isMobile = isPlayPresentationMobileViewport();
  const isLandscape = width > height;
  const sizeKey = `${width}x${height}:${isMobile ? "mobile" : "desktop"}:${isLandscape ? "landscape" : "portrait"}`;
  if (sizeKey === playPresentationViewportKey) return;

  playPresentationViewportKey = sizeKey;
  overlay.classList.toggle("pp-mobile", isMobile);
  overlay.classList.toggle("pp-natural-landscape", isMobile && isLandscape);
  overlay.classList.toggle("pp-natural-portrait", isMobile && !isLandscape);
  document.body.classList.toggle("play-presentation-mobile", isMobile);
  updatePlayPresentationProjectorPrompt();
  updatePlayPresentationRotateHint();
}

// Show a rotate recommendation only when the active mode cannot fit the current
// portrait viewport (the diagram-bearing body overflows). Hidden in landscape,
// on desktop, or once dismissed for the session.
function updatePlayPresentationRotateHint() {
  const hint = document.getElementById("playPresentationRotateHint");
  if (!hint) return;
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) {
    hint.hidden = true;
    return;
  }
  const body = document.getElementById("playPresentationBody");
  const { width, height } = getPlayPresentationViewportSize();
  const isLandscape = width > height;
  const overflow =
    body
      ? body.scrollHeight - body.clientHeight > PLAY_PRESENTATION_ROTATE_OVERFLOW
      : false;
  const shouldShow =
    isPlayPresentationMobileViewport() &&
    !isLandscape &&
    playPresentationState.mode !== "player" &&
    !playPresentationRotateHintDismissed &&
    overflow;
  hint.hidden = !shouldShow;
}

function dismissPlayPresentationRotateHint() {
  playPresentationRotateHintDismissed = true;
  const hint = document.getElementById("playPresentationRotateHint");
  if (hint) hint.hidden = true;
}

function cleanupPlayPresentationMobileLandscape() {
  const overlay = document.getElementById("playPresentationOverlay");
  overlay?.classList.remove(
    "pp-mobile",
    "pp-natural-landscape",
    "pp-natural-portrait",
  );
  playPresentationViewportKey = "";
  if (playPresentationViewportSyncFrame) {
    cancelAnimationFrame(playPresentationViewportSyncFrame);
    playPresentationViewportSyncFrame = 0;
  }
  document.body.classList.remove("play-presentation-mobile");
  playPresentationSwipeStart = null;
  const rotateHint = document.getElementById("playPresentationRotateHint");
  if (rotateHint) rotateHint.hidden = true;
}

function queuePlayPresentationViewportSync() {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) return;
  if (playPresentationViewportSyncFrame) return;
  playPresentationViewportSyncFrame = requestAnimationFrame(() => {
    playPresentationViewportSyncFrame = 0;
    syncPlayPresentationMobileLandscape();
    syncPlayPresentationHeaderOffset();
  });
}

function setPlayPresentationOverlayOpen(overlay, open) {
  if (!overlay) return;
  overlay.classList.toggle("show", open);
  overlay.classList.toggle("is-open", open);
  overlay.dataset.presentationOpen = open ? "true" : "false";
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    overlay.removeAttribute("hidden");
    overlay.removeAttribute("inert");
    overlay.style.setProperty("display", "flex", "important");
    overlay.style.setProperty("visibility", "visible");
    overlay.style.setProperty("opacity", "1");
    overlay.style.setProperty("pointer-events", "auto");
    overlay.style.setProperty("z-index", "var(--z-skip-link)");
  } else {
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("inert", "");
    overlay.style.removeProperty("display");
    overlay.style.removeProperty("visibility");
    overlay.style.removeProperty("opacity");
    overlay.style.removeProperty("pointer-events");
    overlay.style.removeProperty("z-index");
  }
}

function isPlayPresentationOverlayVisible(overlay) {
  if (!overlay?.classList.contains("is-open")) return false;
  const computed = window.getComputedStyle(overlay);
  return Boolean(
    computed.display !== "none" &&
    computed.visibility !== "hidden" &&
    computed.opacity !== "0" &&
    computed.pointerEvents !== "none",
  );
}

function ensurePlayPresentationOverlayDisplayed(overlay, phase = "open") {
  if (!overlay?.classList.contains("is-open")) return false;
  const computed = window.getComputedStyle(overlay);
  if (isPlayPresentationOverlayVisible(overlay)) return true;
  overlay.style.setProperty("display", "flex", "important");
  overlay.style.setProperty("visibility", "visible");
  overlay.style.setProperty("opacity", "1");
  overlay.style.setProperty("pointer-events", "auto");
  tracePlayPresentationAction(
    "display repaired",
    {
      action: "openScriptPresentation",
      phase,
      className: overlay.className,
      computedDisplay: computed.display,
      computedVisibility: computed.visibility,
      computedOpacity: computed.opacity,
      computedPointerEvents: computed.pointerEvents,
    },
    "warn",
  );
  return isPlayPresentationOverlayVisible(overlay);
}

function openPlayPresentation(items, startIndex, source) {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay || !Array.isArray(items) || items.length === 0) {
    tracePlayPresentationAction(
      "open failed",
      {
        action:
          source === "playbook"
            ? "openPlaybookPresentation"
            : "openScriptPresentation",
        reason: !overlay ? "overlay-missing" : "no-items",
        requestedStartIndex: startIndex,
        requestedSource: source,
        requestedItemCount: Array.isArray(items) ? items.length : -1,
      },
      "warn",
    );
    return false;
  }

  playPresentationState.returnFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const ordered = applyPlayPresentationOrder(
    items,
    Math.max(0, Math.min(parseInt(startIndex, 10) || 0, items.length - 1)),
  );
  playPresentationState.items = ordered.items;
  playPresentationState.index = ordered.startIndex;
  playPresentationState.source = source === "script" ? "script" : "playbook";
  playPresentationState.mode = ensurePlayPresentationModeAllowed(
    playPresentationState.mode,
  );
  if (isPlayerPresentationRole() && playPresentationState.source === "script") {
    playPresentationState.mode = "player";
  } else if (
    playPresentationState.source === "script" &&
    playPresentationState.mode === "minimum" &&
    getAllowedPlayPresentationModes().includes("coaches")
  ) {
    playPresentationState.mode = "coaches";
  }
  playPresentationState.imageToken += 1;
  playPresentationRotateHintDismissed = false;

  setPlayPresentationOverlayOpen(overlay, true);
  document.body.classList.add("play-presentation-open");
  setPlayPresentationCleanView(false);
  playPresentationProjectorPromptDismissed = false;
  resetPlayPresentationZoom();
  setPlayPresentationTelestrator(false);
  clearPlayPresentationTele();
  setPlayPresentationDetailPanel(false);
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "play-presentation",
      safeArea: false,
      trapFocus: false,
      returnFocus: false,
      scrollElement: "playPresentationBody",
    });
  }
  if (typeof queueMobileShellMeasuredSync === "function") {
    queueMobileShellMeasuredSync();
  }
  syncPlayPresentationMobileLandscape();
  renderPlayPresentation();
  applyPlayPresentationTheme();
  startPlayPresentationAutoAdvance();
  const overlayVisible = ensurePlayPresentationOverlayDisplayed(
    overlay,
    "after-render",
  );
  if (!overlay.dataset.focusTrapReady) {
    trapFocus(overlay);
    overlay.dataset.focusTrapReady = "true";
  }
  document.getElementById("playPresentationClose")?.focus();
  updatePlayPresentationFullscreenButton();
  updatePlayPresentationWakeButton();
  maybeShowPlayPresentationIpadHelp();

  if (
    !isPlayPresentationMobileViewport() &&
    overlay.requestFullscreen &&
    !document.fullscreenElement
  ) {
    try {
      Promise.resolve(overlay.requestFullscreen({ navigationUI: "hide" }))
        .then(() => {
          syncPlayPresentationMobileLandscape();
          ensurePlayPresentationOverlayDisplayed(overlay, "fullscreen");
          return null;
        })
        .catch(() => { });
    } catch (_err) {
      // Full Screen is best-effort and may require a direct user gesture.
    }
  }
  const openTracePayload = {
    action:
      playPresentationState.source === "playbook"
        ? "openPlaybookPresentation"
        : "openScriptPresentation",
    requestedStartIndex: startIndex,
    requestedSource: source,
    itemCount: items.length,
  };
  if (overlayVisible) {
    tracePlayPresentationAction("opened", openTracePayload);
  } else {
    tracePlayPresentationAction(
      "opened but hidden",
      {
        ...openTracePayload,
        className: overlay.className,
        computedDisplay: window.getComputedStyle(overlay).display,
      },
      "warn",
    );
  }
  return overlayVisible;
}

function closePlayPresentation() {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay) return;
  stopPlayPresentationAutoAdvance();
  closePlayPresentationSetup();
  setPlayPresentationCleanView(false);
  playPresentationProjectorPromptDismissed = false;
  clearTimeout(playPresentationHudTimer);
  playPresentationWakeLockDesired = false;
  releasePlayPresentationWakeLock();
  resetPlayPresentationZoom();
  setPlayPresentationTelestrator(false);
  clearPlayPresentationTele();
  setPlayPresentationDetailPanel(false);
  if (typeof closePresentationDiscussion === "function") closePresentationDiscussion();
  playPresentationState.imageToken += 1;
  cleanupPlayPresentationDiagramRenderer();
  cleanupPlayPresentationMobileLandscape();
  if (typeof closeLayer === "function") {
    closeLayer("play-presentation", { returnFocus: false });
  }
  setPlayPresentationOverlayOpen(overlay, false);
  document.body.classList.remove("play-presentation-open");
  if (typeof queueMobileShellMeasuredSync === "function") {
    queueMobileShellMeasuredSync();
  }

  if (document.fullscreenElement === overlay && document.exitFullscreen) {
    document.exitFullscreen().catch(() => { });
  }
  if (playPresentationState.returnFocus?.isConnected) {
    playPresentationState.returnFocus.focus();
  }
  playPresentationState.returnFocus = null;
}

function closePlayPresentationOverlay() {
  closePlayPresentation();
}

function setPlayPresentationMode(mode) {
  if (!PLAY_PRESENTATION_MODES.has(mode)) return;
  if (!getAllowedPlayPresentationModes().includes(mode)) return;
  playPresentationState.mode = mode;
  if (mode === "player" && !playPresentationState.positionLocked) {
    playPresentationState.autoPositionItemKey = "";
  }
  renderPlayPresentation();
}

function getPlayPresentationItemKey(item) {
  if (!item) return "";
  return [
    playPresentationState.source,
    item.sourceIndex,
    typeof playSignature === "function" ? playSignature(item.play) : "",
    item.number,
  ].join(":");
}

function getPreferredPlayPresentationPosition(play) {
  const positions = getPlayPresentationPositions();
  const current = positions.find(
    (position) => position.key === playPresentationState.position,
  );
  if (current && String(play?.[current.key] || "").trim()) return current.key;
  const withRule = positions.find(
    (position) => String(play?.[position.key] || "").trim(),
  );
  return (withRule || current || positions[0])?.key || "respQ";
}

function syncPlayPresentationPlayerPosition(item) {
  if (
    !item ||
    playPresentationState.mode !== "player" ||
    playPresentationState.positionLocked
  ) {
    return;
  }
  const itemKey = getPlayPresentationItemKey(item);
  if (playPresentationState.autoPositionItemKey === itemKey) return;
  playPresentationState.position = getPreferredPlayPresentationPosition(
    item.play,
  );
  playPresentationState.autoPositionItemKey = itemKey;
}

function setPlayPresentationPosition(positionKey) {
  if (
    !getPlayPresentationPositions().some(
      (position) => position.key === positionKey,
    )
  ) {
    return;
  }
  playPresentationState.position = positionKey;
  const item = playPresentationState.items[playPresentationState.index];
  playPresentationState.autoPositionItemKey = getPlayPresentationItemKey(item);
  renderPlayPresentation();
}

function togglePlayPresentationPositionLock() {
  playPresentationState.positionLocked = !playPresentationState.positionLocked;
  if (!playPresentationState.positionLocked) {
    playPresentationState.autoPositionItemKey = "";
  }
  renderPlayPresentation();
}

function movePlayPresentation(direction) {
  const delta = parseInt(direction, 10);
  if (!Number.isInteger(delta) || delta === 0) return;
  const nextIndex = playPresentationState.index + delta;
  if (nextIndex < 0 || nextIndex >= playPresentationState.items.length) return;
  playPresentationState.index = nextIndex;
  resetPlayPresentationZoom();
  clearPlayPresentationTele();
  renderPlayPresentation();
  if (playPresentationDetailOpen) renderPlayPresentationDetailPanel();
  if (typeof syncPresentationDiscussion === "function") syncPresentationDiscussion();
}

function getPlayPresentationChipMarkup(play) {
  return [
    play.personnel,
    play.type,
    play.tempo,
    play.preferredDown ? `${play.preferredDown} Down` : "",
    play.preferredDistance,
  ]
    .filter(Boolean)
    .map((value) => `<span class="pp-chip">${escapeHtml(value)}</span>`)
    .join("");
}

function getPlayPresentationDiagramMarkup(play) {
  return `
    <div class="pp-diagram-frame" id="playPresentationDiagram">
      <div class="pp-diagram-loading">Loading play diagram...</div>
    </div>
  `;
}

function getPlayPresentationScoreRailMarkup(play) {
  if (
    playPresentationState.mode === "minimum" ||
    typeof renderPlayReadinessPresentationScoreRail !== "function"
  ) {
    return "";
  }
  return renderPlayReadinessPresentationScoreRail(play);
}

function setPlayPresentationDiagramMessage(frame, message) {
  if (!frame) return;
  const emptyState = document.createElement("div");
  emptyState.className = "pp-diagram-empty";
  emptyState.textContent = message;
  frame.replaceChildren(emptyState);
}

function updatePlayPresentationDiagramStatus(status, label) {
  const statusEl = document.getElementById("playPresentationDiagramStatus");
  if (!statusEl) return;
  const safeStatus = status || "checking";
  statusEl.dataset.status = safeStatus;
  statusEl.textContent = label || "Diagram checking";
}

function getPlayPresentationDiagramStatusCopy(status) {
  if (status === "unpublished") {
    return {
      message: "Diagram has not been published for players yet.",
      label: "Diagram unpublished",
      pill: "unpublished",
    };
  }
  if (status === "offline") {
    return {
      message: "Offline. This diagram will appear if it was already loaded on this device.",
      label: "Offline",
      pill: "offline",
    };
  }
  if (status === "load-error") {
    return {
      message: "Diagram is published but could not be loaded. Reload when your connection is stable.",
      label: "Diagram issue",
      pill: "error",
    };
  }
  return {
    message: "No player diagram is available for this play yet.",
    label: "Needs diagram",
    pill: "missing",
  };
}

function cleanupPlayPresentationDiagramRenderer() {
  if (playPresentationDiagramResizeObserver) {
    playPresentationDiagramResizeObserver.disconnect();
    playPresentationDiagramResizeObserver = null;
  }
  if (playPresentationDiagramResizeFrame) {
    cancelAnimationFrame(playPresentationDiagramResizeFrame);
    playPresentationDiagramResizeFrame = 0;
  }
  playPresentationDiagramSizeKey = "";
}

function loadPlayPresentationImage(imageUrl, play) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.alt = `${getPlayPresentationPlayLabel(play)} diagram`;
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Play diagram could not be decoded"));
    image.src = imageUrl;
    if (image.complete && image.naturalWidth) resolve(image);
  });
}

function getPlayPresentationBackgroundColor(data, width, height) {
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

function getPlayPresentationContentBounds(image) {
  const sourceWidth = image.naturalWidth || image.width || 0;
  const sourceHeight = image.naturalHeight || image.height || 0;
  if (!sourceWidth || !sourceHeight) return null;

  const sampleScale = Math.min(
    1,
    PLAY_PRESENTATION_SAMPLE_MAX / Math.max(sourceWidth, sourceHeight),
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
  const background = getPlayPresentationBackgroundColor(
    pixels,
    sampleWidth,
    sampleHeight,
  );
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
  let top = rowCounts.findIndex((count) => count >= minimumRowPixels);
  let bottom = sampleHeight - 1;
  while (bottom >= 0 && rowCounts[bottom] < minimumRowPixels) bottom -= 1;
  let left = columnCounts.findIndex((count) => count >= minimumColumnPixels);
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

  if (
    bounds.width < sourceWidth * 0.2 ||
    bounds.height < sourceHeight * 0.2
  ) {
    return null;
  }
  return bounds;
}

function getPlayPresentationAspectCrop(image, contentBounds, targetAspect) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const full = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  if (!contentBounds || !targetAspect) return { ...full, smartFit: false };

  const crop = { ...contentBounds };
  const contentAspect = crop.width / crop.height;
  if (contentAspect < targetAspect) {
    const desiredWidth = crop.height * targetAspect;
    if (desiredWidth > sourceWidth) {
      return { ...crop, smartFit: false, whitespaceTrimmed: true };
    }
    crop.x = Math.max(
      0,
      Math.min(
        sourceWidth - desiredWidth,
        crop.x + crop.width / 2 - desiredWidth / 2,
      ),
    );
    crop.width = desiredWidth;
  } else if (contentAspect > targetAspect) {
    const desiredHeight = crop.width / targetAspect;
    if (desiredHeight > sourceHeight) {
      return { ...crop, smartFit: false, whitespaceTrimmed: true };
    }
    crop.y = Math.max(
      0,
      Math.min(
        sourceHeight - desiredHeight,
        crop.y + crop.height / 2 - desiredHeight / 2,
      ),
    );
    crop.height = desiredHeight;
  }
  return { ...crop, smartFit: true };
}

function getPlayPresentationCanvasSize(frame) {
  const cssWidth = Math.max(1, frame.clientWidth);
  const cssHeight = Math.max(1, frame.clientHeight);
  let scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  scale = Math.min(
    scale,
    PLAY_PRESENTATION_MAX_RENDER_EDGE / cssWidth,
    PLAY_PRESENTATION_MAX_RENDER_EDGE / cssHeight,
    Math.sqrt(
      PLAY_PRESENTATION_MAX_RENDER_PIXELS / (cssWidth * cssHeight),
    ),
  );
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * scale)),
    pixelHeight: Math.max(1, Math.round(cssHeight * scale)),
    pixelRatio: scale,
  };
}

function drawPlayPresentationDiagram(canvas, frame, image, contentBounds) {
  if (!canvas.isConnected || !frame.isConnected) return;
  const size = getPlayPresentationCanvasSize(frame);
  if (
    canvas.width !== size.pixelWidth ||
    canvas.height !== size.pixelHeight
  ) {
    canvas.width = size.pixelWidth;
    canvas.height = size.pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Presentation canvas could not be created");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = "contrast(1.055) saturate(1.02)";

  const targetAspect = size.cssWidth / size.cssHeight;
  const crop = getPlayPresentationAspectCrop(
    image,
    contentBounds,
    targetAspect,
  );
  const cropAspect = crop.width / crop.height;
  let drawWidth = canvas.width;
  let drawHeight = canvas.height;
  let drawX = 0;
  let drawY = 0;
  if (!crop.smartFit && Math.abs(cropAspect - targetAspect) > 0.01) {
    const containScale = Math.min(
      canvas.width / crop.width,
      canvas.height / crop.height,
    );
    drawWidth = crop.width * containScale;
    drawHeight = crop.height * containScale;
    drawX = (canvas.width - drawWidth) / 2;
    drawY = (canvas.height - drawHeight) / 2;
  }
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
  context.filter = "none";
  canvas.dataset.smartFit = crop.smartFit
    ? "fill"
    : crop.whitespaceTrimmed
      ? "trimmed-contain"
      : "contain";
  canvas.dataset.sourceSize = `${image.naturalWidth}x${image.naturalHeight}`;
  canvas.dataset.renderSize = `${canvas.width}x${canvas.height}`;
  canvas.dataset.pixelRatio = size.pixelRatio.toFixed(2);
}

function isCurrentPlayPresentationDiagram(play) {
  const currentItem =
    playPresentationState.items[playPresentationState.index];
  return Boolean(currentItem?.play && currentItem.play === play);
}

function installPlayPresentationDiagramRenderer(frame, image, play, token) {
  cleanupPlayPresentationDiagramRenderer();
  const canvas = document.createElement("canvas");
  canvas.className = "pp-diagram-image pp-diagram-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `${getPlayPresentationPlayLabel(play)} diagram`,
  );
  const contentBounds = getPlayPresentationContentBounds(image);
  frame.replaceChildren(canvas);
  updatePlayPresentationDiagramStatus("ready", "Diagram ready");
  attachPlayPresentationPan(frame);
  applyPlayPresentationZoomTransform();
  ensurePlayPresentationTeleCanvas();

  const getFrameSizeKey = () => {
    const rect = frame.getBoundingClientRect();
    return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  };

  const draw = (force = false) => {
    if (
      token !== playPresentationState.imageToken ||
      document.getElementById("playPresentationDiagram") !== frame
    ) {
      return;
    }
    const nextSizeKey = getFrameSizeKey();
    if (!force && nextSizeKey === playPresentationDiagramSizeKey) return;
    playPresentationDiagramSizeKey = nextSizeKey;
    drawPlayPresentationDiagram(canvas, frame, image, contentBounds);
  };
  draw(true);

  if (typeof ResizeObserver === "function") {
    playPresentationDiagramResizeObserver = new ResizeObserver(() => {
      if (getFrameSizeKey() === playPresentationDiagramSizeKey) return;
      if (playPresentationDiagramResizeFrame) {
        cancelAnimationFrame(playPresentationDiagramResizeFrame);
      }
      playPresentationDiagramResizeFrame = requestAnimationFrame(() => {
        playPresentationDiagramResizeFrame = 0;
        draw();
        resizePlayPresentationTeleCanvas();
      });
    });
    playPresentationDiagramResizeObserver.observe(frame);
  }
}

async function loadPlayPresentationDiagram(play, token) {
  const frame = document.getElementById("playPresentationDiagram");
  if (!frame) return;
  cleanupPlayPresentationDiagramRenderer();
  updatePlayPresentationDiagramStatus("checking", "Diagram checking");
  if (!window.playImages) {
    const copy = getPlayPresentationDiagramStatusCopy("missing");
    setPlayPresentationDiagramMessage(frame, copy.message);
    updatePlayPresentationDiagramStatus("missing", "Needs diagram");
    return;
  }

  try {
    const readiness =
      window.playImages && typeof window.playImages.ensureDisplayReadinessForPlay === "function"
        ? await window.playImages.ensureDisplayReadinessForPlay(play)
        : {
          status: "ready",
          url: typeof window.ensurePlayImageUrl === "function"
            ? await window.ensurePlayImageUrl(play)
            : null,
        };
    // A player-panel update can rebuild the presentation markup while this
    // request is in flight. Keep the result when it still belongs to the
    // displayed play; the old token alone is not enough to decide that this
    // request is stale.
    if (!isCurrentPlayPresentationDiagram(play)) return;
    const currentFrame = document.getElementById("playPresentationDiagram");
    if (!currentFrame) return;
    if (!readiness?.url) {
      const copy = getPlayPresentationDiagramStatusCopy(readiness?.status || "missing");
      setPlayPresentationDiagramMessage(currentFrame, copy.message);
      updatePlayPresentationDiagramStatus(copy.pill, copy.label);
      return;
    }
    const image = await loadPlayPresentationImage(readiness.url, play);
    if (!isCurrentPlayPresentationDiagram(play)) return;
    try {
      installPlayPresentationDiagramRenderer(
        currentFrame,
        image,
        play,
        playPresentationState.imageToken,
      );
    } catch (renderError) {
      console.warn("smart diagram rendering failed:", renderError);
      image.className = "pp-diagram-image";
      currentFrame.replaceChildren(image);
      updatePlayPresentationDiagramStatus("ready", "Diagram ready");
    }
  } catch (err) {
    console.warn("play presentation image load failed:", err);
    if (!isCurrentPlayPresentationDiagram(play)) return;
    const currentFrame = document.getElementById("playPresentationDiagram");
    const copy = getPlayPresentationDiagramStatusCopy("load-error");
    setPlayPresentationDiagramMessage(
      currentFrame,
      copy.message,
    );
    updatePlayPresentationDiagramStatus(copy.pill, copy.label);
  }
}

function getPlayPresentationPlayerStatusMarkup({ assignment, selected, responsibilityNotes, playerNotes }) {
  const ruleReady = Boolean(assignment);
  return `
    <div class="pp-player-status-row" aria-label="Play study status">
      <span class="pp-player-status-pill${ruleReady ? " is-ready" : " is-missing"}">
        Rule: ${escapeHtml(selected?.label || "Position")}
      </span>
      <span class="pp-player-status-pill is-checking" id="playPresentationDiagramStatus" data-status="checking">
        Diagram checking
      </span>
      ${responsibilityNotes || playerNotes
      ? '<span class="pp-player-status-pill is-note">Coach note</span>'
      : ""
    }
    </div>`;
}

function getPlayPresentationMinimumMarkup(item) {
  const play = item.play;
  return `
    <div class="pp-layout pp-layout-minimum">
      <section class="pp-minimum-top">
        <div class="pp-eyebrow">${escapeHtml(item.context || "")}</div>
        <div class="pp-call pp-minimum-call">${getFullCall(play, {
    showEmoji: true,
    showLineCall: true,
    boldShifts: true,
    italicMotions: true,
  })}</div>
        ${play.oneWord
      ? `<div class="pp-minimum-one-word"><span>One Word</span>${escapeHtml(play.oneWord)}</div>`
      : '<div class="pp-minimum-one-word is-empty" aria-hidden="true"></div>'
    }
      </section>
      <section class="pp-diagram-panel pp-minimum-diagram">
        ${getPlayPresentationDiagramMarkup(play)}
      </section>
      <section class="pp-minimum-bottom" aria-label="Play details">
        <div class="pp-chips pp-minimum-chips">${getPlayPresentationChipMarkup(play)}</div>
        ${typeof renderPlayReadinessPresentationMinimumDock === "function"
      ? renderPlayReadinessPresentationMinimumDock(play)
      : ""
    }
      </section>
    </div>
  `;
}

function getPlayPresentationSelectedPosition() {
  const positions = getPlayPresentationPositions();
  return (
    positions.find(
      (position) => position.key === playPresentationState.position,
    ) || positions[0]
  );
}

function getPlayPresentationPositionLockCopy(selected) {
  const locked = playPresentationState.positionLocked;
  const label = selected?.label || "position";
  return {
    locked,
    label: locked ? `Locked to ${label}` : `Lock ${label}`,
    hint: locked
      ? `Next and previous plays will keep showing the ${label} rule.`
      : `Unlocked: each new play can auto-pick its first entered rule. Lock ${label} to keep this position.`,
  };
}

function hydratePlayPresentationPlayerControls() {
  const picker = document.getElementById("playPresentationPositionPicker");
  const lockMount = document.getElementById(
    "playPresentationPositionLockMount",
  );
  const lockStatus = document.getElementById(
    "playPresentationPositionLockStatus",
  );
  if (!picker || !lockMount || !lockStatus) return;

  const selected = getPlayPresentationSelectedPosition();
  const lockCopy = getPlayPresentationPositionLockCopy(selected);

  picker.replaceChildren();
  getPlayPresentationPositions().forEach((position) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `pp-position-btn${position.key === selected.key ? " active" : ""
      }`;
    button.dataset.action = "setPlayPresentationPosition";
    button.dataset.arg = position.key;
    button.setAttribute(
      "aria-pressed",
      position.key === selected.key ? "true" : "false",
    );
    button.textContent = position.label;
    picker.appendChild(button);
  });

  const lockButton = document.createElement("button");
  lockButton.type = "button";
  lockButton.className = `pp-position-lock-btn${lockCopy.locked ? " active" : ""
    }`;
  lockButton.dataset.action = "togglePlayPresentationPositionLock";
  lockButton.setAttribute("aria-pressed", lockCopy.locked ? "true" : "false");
  lockButton.title = lockCopy.hint;
  lockButton.textContent = `${lockCopy.locked ? "🔒" : "🔓"} ${lockCopy.label}`;
  lockMount.replaceChildren(lockButton);
  lockStatus.textContent = lockCopy.hint;
}

function getPlayPresentationPlayerMarkup(item) {
  const play = item.play;
  const selected = getPlayPresentationSelectedPosition();
  const assignment = String(play[selected.key] || "").trim();
  const responsibilityNotes = String(play.respNotes || "").trim();
  const playerNotes = String(play.playerNotes || "").trim();
  const signalAvailability =
    typeof renderSignalAvailabilityForPlay === "function"
      ? renderSignalAvailabilityForPlay(play, {
        className: "signal-availability--presentation-player",
        title: "Signals ready",
        action: "openPlayPresentationSignals",
        buttonLabel: "Watch",
      })
      : "";
  const playerChips = [
    play.type,
    play.personnel ? `${play.personnel} pers` : "",
    play.preferredDown && play.preferredDistance
      ? `${_ordinalDown(play.preferredDown)} & ${play.preferredDistance}`
      : play.preferredDown
        ? `${_ordinalDown(play.preferredDown)} down`
        : "",
    play.preferredFieldPosition,
  ].filter(Boolean);
  const ruleStatusCopy = assignment
    ? `Showing ${selected.label} rule`
    : `No ${selected.label} rule entered`;

  return `
    <div class="pp-layout pp-layout-player">
      <section class="pp-diagram-panel">
        ${getPlayPresentationDiagramMarkup(play)}
      </section>
      <section class="pp-player-panel">
        <div class="pp-player-overview">
          <div>
            <div class="pp-player-kicker">Swipe Study</div>
            <div class="pp-player-context">${escapeHtml(item.context || "Practice Script")} • Play ${item.number}</div>
          </div>
          <span class="pp-player-mode-chip">${playPresentationState.positionLocked ? "Position Locked" : "Auto Position"}</span>
        </div>
        <div class="pp-player-study-strip" aria-label="Study steps">
          <span><strong>1</strong> Call</span>
          <span><strong>2</strong> Rule</span>
          <span><strong>3</strong> Ask</span>
        </div>
        ${signalAvailability}
        ${getPlayPresentationPlayerStatusMarkup({
      assignment,
      selected,
      responsibilityNotes,
      playerNotes,
    })}
        <div class="pp-player-call">${getFullCall(play, {
    showEmoji: true,
    showLineCall: true,
    boldShifts: true,
    italicMotions: true,
  })}</div>
        ${playerChips.length
      ? `<div class="pp-player-chips">${playerChips
        .map((chip) => `<span>${escapeHtml(chip)}</span>`)
        .join("")}</div>`
      : ""
    }
        <div class="pp-player-rule">
          <div class="pp-player-rule-head">
            <div class="pp-player-rule-title">
              <span class="pp-player-rule-eyebrow">Your Job</span>
              <span class="pp-player-position">${escapeHtml(selected.label)}</span>
            </div>
          </div>
          <div class="pp-player-rule-meta">${escapeHtml(ruleStatusCopy)}</div>
          <div class="pp-player-rule-text">${assignment
      ? escapeHtml(assignment)
      : "No player rule entered for this position."
    }</div>
        </div>
        ${responsibilityNotes
      ? `<div class="pp-resp-notes"><strong>Responsibility Notes</strong>${escapeHtml(responsibilityNotes)}</div>`
      : ""
    }
        ${playerNotes
      ? `<div class="pp-player-notes"><strong>Coach Notes</strong>${escapeHtml(playerNotes)}</div>`
      : ""
    }
        <div class="pp-player-controls-card">
          <div class="pp-player-controls-head">
            <strong>Choose your position</strong>
            <span>Tap your spot once. Lock it when you want the same rule on every play.</span>
          </div>
          <div class="pp-position-picker" id="playPresentationPositionPicker"
            role="group" aria-label="Choose player position"></div>
          <div class="pp-position-lock-row">
            <span id="playPresentationPositionLockMount"></span>
            <span class="pp-position-lock-status"
              id="playPresentationPositionLockStatus"></span>
          </div>
        </div>
        <div class="pp-player-chat-row">
          <button class="btn btn-primary pp-player-chat-btn" data-action="askPresentationQuestion"
            aria-label="Ask the coach a question about this play">
            Ask Coach
          </button>
          <button class="btn btn-secondary pp-player-chat-btn" data-action="togglePresentationDiscussion"
            aria-label="Review discussion for this play">
            Review Thread
          </button>
        </div>
      </section>
    </div>
  `;
}

function getPlayPresentationDetailRows(rows) {
  return rows
    .filter((row) => row.values.some(Boolean))
    .map(
      (row) => `
        <div class="pp-detail-card">
          <div class="pp-detail-label">${escapeHtml(row.label)}</div>
          <div class="pp-detail-value">${row.values
          .filter(Boolean)
          .map((value) => escapeHtml(value))
          .join(" / ")}</div>
        </div>
      `,
    )
    .join("");
}

function getPlayPresentationCoachSection(title, subtitle, rows, className) {
  const detailMarkup = getPlayPresentationDetailRows(rows);
  if (!detailMarkup) return "";
  const sectionClass = className ? ` ${className}` : "";

  return `
    <section class="pp-coach-section${sectionClass}" aria-label="${escapeHtml(title)}">
      <div class="pp-coach-section-head">
        <h3>${escapeHtml(title)}</h3>
        ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
      </div>
      <div class="pp-detail-grid">${detailMarkup}</div>
    </section>
  `;
}

function getPlayPresentationCoachNotesMarkup(play) {
  const notes = [
    { label: "Responsibility Notes", value: play.respNotes },
    { label: "General Notes", value: play.notes },
  ].filter((note) => String(note.value || "").trim());

  if (notes.length === 0) return "";

  return `
    <section class="pp-coach-section pp-coach-section-notes" aria-label="Coach notes">
      <div class="pp-coach-section-head">
        <h3>Coach Notes</h3>
        <span>Reminders and teaching points</span>
      </div>
      <div class="pp-coach-note-list">
        ${notes
      .map(
        (note) => `
              <div class="pp-coach-note-card">
                <strong>${escapeHtml(note.label)}</strong>
                <p>${escapeHtml(note.value)}</p>
              </div>
            `,
      )
      .join("")}
      </div>
    </section>
  `;
}

function getPlayPresentationDetailRowGroups(play) {
  return {
    callRows: [
      {
        label: "Personnel / Type",
        values: [play.personnel, play.type],
      },
      {
        label: "Formation",
        values: [
          play.formation,
          [play.formTag1, play.formTag2].filter(Boolean).join(", "),
        ],
      },
      {
        label: "Backfield",
        values: [play.under, play.back, play.shift, play.motion],
      },
      {
        label: "Protection",
        values: [play.protection, play.lineCall],
      },
      {
        label: "Play Call",
        values: [
          play.play,
          [play.playTag1, play.playTag2].filter(Boolean).join(", "),
          play.basePlay,
        ],
      },
    ],
    situationRows: [
      {
        label: "Down / Distance",
        values: [play.preferredDown, play.preferredDistance],
      },
      {
        label: "Field / Hash",
        values: [
          play.hash || play.preferredHash,
          play.preferredSituation,
          play.preferredFieldPosition,
        ],
      },
      {
        label: "Tempo / Word",
        values: [play.tempo, play.oneWord],
      },
    ],
    defenseRows: [
      {
        label: "Front / Structure",
        values: [play.defFront || play.practiceFront, play.practiceDefense],
      },
      {
        label: "Coverage",
        values: [play.defCoverage || play.practiceCoverage],
      },
      {
        label: "Pressure",
        values: [
          play.defBlitz || play.practiceBlitz,
          play.defStunt || play.practiceStunt,
        ],
      },
    ],
    coachingRows: [
      {
        label: "Key Players",
        values: [
          [play.keyPlayer1, play.keyPlayerName1].filter(Boolean).join(" "),
          [play.keyPlayer2, play.keyPlayerName2].filter(Boolean).join(" "),
          [play.keyPlayer3, play.keyPlayerName3].filter(Boolean).join(" "),
        ],
      },
      {
        label: "Complements",
        values: [play.constraint1, play.constraint2, play.constraint3],
      },
      {
        label: "Hit Chart",
        values: [play.hitChart1, play.hitChart2, play.hitChart3],
      },
      {
        label: "Alerts",
        values: [play.deadVs, play.opponent],
      },
    ],
  };
}

function getPlayPresentationCoachMarkup(item) {
  const play = item.play;
  const responsibilityMarkup = getPlayPresentationPositions()
    .filter((position) => String(play[position.key] || "").trim())
    .map(
      (position) => `
        <div class="pp-assignment-card">
          <strong>${escapeHtml(position.label)}</strong>
          <span>${escapeHtml(play[position.key])}</span>
        </div>
      `,
    )
    .join("");
  const { callRows, situationRows, defenseRows, coachingRows } =
    getPlayPresentationDetailRowGroups(play);
  const coachSections = [
    playPresentationOptions.showPersonnel
      ? getPlayPresentationCoachSection(
        "Call Structure",
        "Formation, motion, and call mechanics",
        callRows,
        "pp-coach-section-call",
      )
      : "",
    getPlayPresentationCoachSection(
      "Situation",
      "When and where this fits",
      situationRows,
      "pp-coach-section-situation",
    ),
    playPresentationOptions.showDefense
      ? getPlayPresentationCoachSection(
        "Defensive Look",
        "Practice picture and defensive answers",
        defenseRows,
        "pp-coach-section-defense",
      )
      : "",
    playPresentationOptions.showNotes
      ? getPlayPresentationCoachSection(
        "Coaching Points",
        "Keys, complements, alerts, and targets",
        coachingRows,
        "pp-coach-section-tools",
      )
      : "",
  ].join("");

  const playerRulesSection = playPresentationOptions.showAssignment
    ? `
        <section class="pp-coach-section pp-coach-section-rules" aria-label="Player rules">
          <div class="pp-coach-section-head">
            <h3>Player Rules</h3>
            <span>Position-by-position assignments</span>
          </div>
          <div class="pp-assignment-grid">
            ${responsibilityMarkup ||
    '<div class="pp-empty-copy">No player rules entered.</div>'
    }
          </div>
        </section>`
    : "";
  const coachNotesSection = playPresentationOptions.showNotes
    ? getPlayPresentationCoachNotesMarkup(play)
    : "";

  return `
    <div class="pp-layout pp-layout-coaches">
      <section class="pp-coach-visual">
        <div class="pp-coach-call">${getFullCall(play, {
    showEmoji: true,
    showLineCall: true,
    boldShifts: true,
    italicMotions: true,
  })}</div>
        ${getPlayPresentationDiagramMarkup(play)}
      </section>
      <section class="pp-coach-info">
        ${typeof renderPlayReadinessPresentationCoachCard === "function"
      ? renderPlayReadinessPresentationCoachCard(play)
      : ""
    }
        ${coachSections}
        ${playerRulesSection}
        ${coachNotesSection}
      </section>
    </div>
  `;
}

function renderPlayPresentation() {
  const item = playPresentationState.items[playPresentationState.index];
  const body = document.getElementById("playPresentationBody");
  if (!item || !body) return;

  // Ensure viewport state is synchronized before render
  syncPlayPresentationMobileLandscape();

  playPresentationState.mode = ensurePlayPresentationModeAllowed(
    playPresentationState.mode,
  );
  const overlay = document.getElementById("playPresentationOverlay");
  if (overlay) overlay.dataset.ppMode = playPresentationState.mode;
  syncPlayPresentationRoleUi();
  syncPlayPresentationHeaderOffset();

  const sourceLabel = document.getElementById("playPresentationSource");
  const counter = document.getElementById("playPresentationCounter");
  const previous = document.getElementById("playPresentationPrev");
  const next = document.getElementById("playPresentationNext");
  if (sourceLabel) {
    sourceLabel.textContent =
      playPresentationState.source === "script"
        ? item.context || "Practice Script"
        : "Playbook";
  }
  if (counter) {
    counter.textContent = `${playPresentationState.index + 1} / ${playPresentationState.items.length}`;
  }
  if (previous) previous.disabled = playPresentationState.index === 0;
  if (next) {
    next.disabled =
      playPresentationState.index >= playPresentationState.items.length - 1;
  }

  document.querySelectorAll("[data-presentation-mode]").forEach((button) => {
    if (button.hidden) return;
    const active =
      button.dataset.presentationMode === playPresentationState.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  syncPlayPresentationPlayerPosition(item);

  let markup = "";
  if (playPresentationState.mode === "player") {
    markup = getPlayPresentationPlayerMarkup(item);
  } else if (playPresentationState.mode === "coaches") {
    markup = getPlayPresentationCoachMarkup(item);
  } else {
    markup = getPlayPresentationMinimumMarkup(item);
  }
  markup += getPlayPresentationScoreRailMarkup(item.play);

  setInnerHTML(body, markup);
  if (playPresentationState.mode === "player") {
    hydratePlayPresentationPlayerControls();
  }
  const token = ++playPresentationState.imageToken;
  loadPlayPresentationDiagram(item.play, token);

  updatePlayPresentationClipsButton();
  updatePlayPresentationSignalsButton();

  const announcer = document.getElementById("liveAnnouncer");
  if (announcer) {
    announcer.textContent = `Showing ${getPlayPresentationPlayLabel(item.play)}, slide ${playPresentationState.index + 1} of ${playPresentationState.items.length}`;
  }
  requestAnimationFrame(updatePlayPresentationRotateHint);
  requestAnimationFrame(syncPlayPresentationHeaderOffset);
}

function isPlayPresentationInteractiveSwipeTarget(target) {
  return Boolean(
    target?.closest?.(
      "button, input, select, textarea, a, [role='button'], .pp-mode-switcher, .pp-nav, .pp-position-picker, .pp-position-lock-row, .pp-readiness-score-rail",
    ),
  );
}

function handlePlayPresentationTouchStart(event) {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) return;
  if (playPresentationZoom.scale > 1.001) return;
  if (event.touches?.length !== 1) return;
  if (isPlayPresentationInteractiveSwipeTarget(event.target)) return;

  const touch = event.touches[0];
  playPresentationSwipeStart = {
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now(),
  };
}

function handlePlayPresentationTouchEnd(event) {
  const start = playPresentationSwipeStart;
  playPresentationSwipeStart = null;
  if (playPresentationZoom.scale > 1.001) return;
  const overlay = document.getElementById("playPresentationOverlay");
  if (!start || !overlay?.classList.contains("is-open")) return;
  const touch = event.changedTouches?.[0];
  if (!touch) return;

  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const elapsed = Date.now() - start.time;
  if (elapsed > PLAY_PRESENTATION_SWIPE_MAX_MS) return;

  let direction = 0;
  if (absX >= PLAY_PRESENTATION_SWIPE_MIN_DISTANCE && absX >= absY * 1.1) {
    direction = dx < 0 ? 1 : -1;
  }
  if (!direction) return;

  event.preventDefault();
  movePlayPresentation(direction);
}

function handlePlayPresentationKeydown(event) {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closePlayPresentation();
  } else if (event.key === "ArrowRight" || event.key === "PageDown") {
    event.preventDefault();
    movePlayPresentation(1);
  } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    movePlayPresentation(-1);
  } else if (event.key === "1") {
    setPlayPresentationMode("minimum");
  } else if (event.key === "2") {
    setPlayPresentationMode("player");
  } else if (event.key === "3") {
    setPlayPresentationMode("coaches");
  } else if (
    event.key.toLowerCase() === "l" &&
    playPresentationState.mode === "player"
  ) {
    togglePlayPresentationPositionLock();
  }
}

document.addEventListener("keydown", handlePlayPresentationKeydown);
document.addEventListener("pointermove", handlePlayPresentationPointerActivity, {
  passive: true,
});
document.addEventListener("pointerdown", handlePlayPresentationPointerActivity, {
  passive: true,
});
document.addEventListener("visibilitychange", handlePlayPresentationWakeVisibility);
document.addEventListener("touchstart", handlePlayPresentationTouchStart, {
  passive: true,
});
document.addEventListener("touchend", handlePlayPresentationTouchEnd, {
  passive: false,
});
document.addEventListener("touchcancel", () => {
  playPresentationSwipeStart = null;
}, { passive: true });
window.addEventListener("resize", queuePlayPresentationViewportSync, {
  passive: true,
});
window.addEventListener("orientationchange", queuePlayPresentationViewportSync, {
  passive: true,
});
window.visualViewport?.addEventListener(
  "resize",
  queuePlayPresentationViewportSync,
  { passive: true },
);
document.addEventListener("fullscreenchange", () => {
  const overlay = document.getElementById("playPresentationOverlay");
  queuePlayPresentationViewportSync();
  if (overlay?.classList.contains("is-open")) {
    updatePlayPresentationFullscreenButton();
  }
  if (
    overlay?.classList.contains("is-open") &&
    !document.fullscreenElement &&
    document.body.classList.contains("play-presentation-open")
  ) {
    // Keep the in-app landscape overlay open if a browser exits Full Screen.
    setPlayPresentationOverlayOpen(overlay, true);
    ensurePlayPresentationOverlayDisplayed(overlay, "fullscreenchange");
  }
});

document.addEventListener("fullscreenerror", () => {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("is-open")) return;
  notifyPlayPresentationFullscreenFallback();
  updatePlayPresentationFullscreenButton();
});

// ===========================================================================
// M-041 — Fullscreen toggle, iPad Safari help, and presentation setup sheet
// ===========================================================================

function isPlayPresentationFullscreenSupported() {
  const overlay = document.getElementById("playPresentationOverlay");
  return Boolean(
    document.fullscreenEnabled && overlay && overlay.requestFullscreen,
  );
}

function isPlayPresentationIPadOS() {
  return document.body.classList.contains("shell-ipados");
}

function isPlayPresentationStandalone() {
  return (
    document.documentElement.classList.contains("display-mode-standalone") ||
    document.documentElement.classList.contains("display-mode-fullscreen") ||
    navigator.standalone === true
  );
}

function notifyPlayPresentationFullscreenFallback() {
  if (isPlayPresentationIPadOS() && !isPlayPresentationStandalone()) {
    openPlayPresentationIpadHelp();
    return;
  }
  playPresentationToast(
    "Full Screen was blocked by the browser. Try again from a tap, or hide the toolbar manually.",
    { duration: 4000, type: "error" },
  );
}

function enterPlayPresentationFullscreen() {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay) return;
  if (!isPlayPresentationFullscreenSupported()) {
    notifyPlayPresentationFullscreenFallback();
    return;
  }
  try {
    Promise.resolve(overlay.requestFullscreen({ navigationUI: "hide" }))
      .then(() => {
        syncPlayPresentationMobileLandscape();
        ensurePlayPresentationOverlayDisplayed(overlay, "fullscreen");
        updatePlayPresentationFullscreenButton();
        return null;
      })
      .catch(() => {
        notifyPlayPresentationFullscreenFallback();
        updatePlayPresentationFullscreenButton();
      });
  } catch (_err) {
    notifyPlayPresentationFullscreenFallback();
  }
}

function exitPlayPresentationFullscreen() {
  const overlay = document.getElementById("playPresentationOverlay");
  if (document.fullscreenElement === overlay && document.exitFullscreen) {
    document.exitFullscreen().catch(() => { });
  }
  updatePlayPresentationFullscreenButton();
}

function togglePlayPresentationFullscreen() {
  const overlay = document.getElementById("playPresentationOverlay");
  if (document.fullscreenElement === overlay) {
    exitPlayPresentationFullscreen();
  } else {
    enterPlayPresentationFullscreen();
  }
}

function updatePlayPresentationFullscreenButton() {
  const button = document.getElementById("playPresentationFullscreenBtn");
  if (!button) return;
  const overlay = document.getElementById("playPresentationOverlay");
  const supported = isPlayPresentationFullscreenSupported();
  // On iPad Safari we keep the button to surface the "Full Screen on iPad"
  // helper sheet rather than hiding the control entirely.
  const showHelper = isPlayPresentationIPadOS() && !isPlayPresentationStandalone();
  button.hidden = !supported && !showHelper;
  const active = document.fullscreenElement === overlay;
  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.title = supported
    ? active
      ? "Exit Full Screen"
      : "Enter Full Screen"
    : "Full Screen on iPad";
  button.setAttribute(
    "aria-label",
    supported
      ? active
        ? "Exit Full Screen"
        : "Enter Full Screen"
      : "How to go Full Screen on iPad",
  );
}

// ---- iPad Safari Full Screen help sheet -------------------------------------
function isPlayPresentationIpadHelpDismissed() {
  if (typeof storageManager === "undefined") return false;
  return storageManager.get(
    STORAGE_KEYS.PRESENTATION_IPAD_HELP_DISMISSED,
    false,
  ) === true;
}

function openPlayPresentationIpadHelp() {
  const panel = document.getElementById("playPresentationIpadHelp");
  if (!panel) return;
  panel.hidden = false;
  panel.classList.add("is-open");
  if (typeof openLayer === "function") {
    openLayer(panel, {
      id: "play-presentation-ipad-help",
      exclusive: false,
      trapFocus: true,
      returnFocus: true,
      blocking: true,
      safeArea: false,
    });
  }
  panel.querySelector(".pp-sheet-close")?.focus();
}

function closePlayPresentationIpadHelp() {
  const panel = document.getElementById("playPresentationIpadHelp");
  if (!panel) return;
  panel.classList.remove("is-open");
  panel.hidden = true;
  if (typeof closeLayer === "function") {
    closeLayer("play-presentation-ipad-help");
  }
}

function closePlayPresentationIpadHelpOverlay() {
  closePlayPresentationIpadHelp();
}

function dismissPlayPresentationIpadHelp() {
  if (typeof storageManager !== "undefined") {
    storageManager.set(STORAGE_KEYS.PRESENTATION_IPAD_HELP_DISMISSED, true);
  }
  closePlayPresentationIpadHelp();
}

function maybeShowPlayPresentationIpadHelp() {
  if (isPlayPresentationIpadHelpDismissed()) return;
  if (!isPlayPresentationIPadOS() || isPlayPresentationStandalone()) return;
  openPlayPresentationIpadHelp();
}

// ---- Presentation setup sheet ----------------------------------------------
function togglePlayPresentationSetup() {
  const panel = document.getElementById("playPresentationSetup");
  if (panel?.classList.contains("is-open")) {
    closePlayPresentationSetup();
  } else {
    openPlayPresentationSetup();
  }
}

function openPlayPresentationSetup() {
  const panel = document.getElementById("playPresentationSetup");
  if (!panel) return;
  renderPlayPresentationSetup();
  panel.hidden = false;
  panel.classList.add("is-open");
  if (typeof openLayer === "function") {
    openLayer(panel, {
      id: "play-presentation-setup",
      exclusive: false,
      trapFocus: true,
      returnFocus: true,
      blocking: true,
      safeArea: false,
      scrollElement: "playPresentationSetupBody",
    });
  }
  panel.querySelector(".pp-sheet-close")?.focus();
}

function closePlayPresentationSetup() {
  const panel = document.getElementById("playPresentationSetup");
  if (!panel || !panel.classList.contains("is-open")) return;
  panel.classList.remove("is-open");
  panel.hidden = true;
  if (typeof closeLayer === "function") {
    closeLayer("play-presentation-setup");
  }
}

function closePlayPresentationSetupOverlay() {
  closePlayPresentationSetup();
}

function getPlayPresentationItemLabel(item, index) {
  const number = item?.number ? `${item.number}. ` : `${index + 1}. `;
  const label =
    typeof getPlayPresentationPlayLabel === "function"
      ? getPlayPresentationPlayLabel(item?.play)
      : item?.play?.play || "Play";
  return `${number}${label}`;
}

function renderPlayPresentationSetup() {
  const body = document.getElementById("playPresentationSetupBody");
  if (!body) return;
  const opts = playPresentationOptions;
  const sourceLabel =
    playPresentationState.source === "script" ? "Practice Script" : "Playbook";

  const startOptions = playPresentationState.items
    .map(
      (item, index) =>
        `<option value="${index}"${index === playPresentationState.index ? " selected" : ""
        }>${escapeHtml(getPlayPresentationItemLabel(item, index))}</option>`,
    )
    .join("");

  const toggleRow = (key, label, hint) => `
    <label class="pp-setup-toggle">
      <input type="checkbox" data-onchange="togglePlayPresentationOption"
        data-arg="${key}"${opts[key] ? " checked" : ""} />
      <span class="pp-setup-toggle-text">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(hint)}</span>
      </span>
    </label>
  `;

  const themeBtn = (value, label) => `
    <button type="button"
      class="pp-setup-chip${opts.theme === value ? " active" : ""}"
      data-action="setPlayPresentationThemeOption" data-arg="${value}"
      aria-pressed="${opts.theme === value ? "true" : "false"}">${escapeHtml(label)}</button>
  `;

  const orderBtn = (value, label) => `
    <button type="button"
      class="pp-setup-chip${opts.order === value ? " active" : ""}"
      data-action="setPlayPresentationOrder" data-arg="${value}"
      aria-pressed="${opts.order === value ? "true" : "false"}">${escapeHtml(label)}</button>
  `;

  setInnerHTML(
    body,
    `
    <div class="pp-setup-section">
      <div class="pp-setup-label">Source</div>
      <div class="pp-setup-source">${escapeHtml(sourceLabel)} • ${playPresentationState.items.length} plays</div>
    </div>
    <div class="pp-setup-section">
      <div class="pp-setup-label">Order</div>
      <div class="pp-setup-chip-row">
        ${orderBtn("listed", "As listed")}
        ${orderBtn("reverse", "Reverse")}
      </div>
    </div>
    <div class="pp-setup-section">
      <label class="pp-setup-label" for="playPresentationStartSelect">Starting play</label>
      <select id="playPresentationStartSelect" class="pp-setup-select"
        data-onchange="setPlayPresentationStartPlay" data-pass="value">
        ${startOptions}
      </select>
    </div>
    <div class="pp-setup-section">
      <div class="pp-setup-label">Coach view sections</div>
      ${toggleRow("showPersonnel", "Call structure", "Personnel, formation, and call mechanics")}
      ${toggleRow("showDefense", "Defensive look", "Practice picture and defensive answers")}
      ${toggleRow("showAssignment", "Player rules", "Position-by-position assignments")}
      ${toggleRow("showNotes", "Coaching points & notes", "Keys, complements, alerts, and notes")}
    </div>
    <div class="pp-setup-section">
      <label class="pp-setup-label" for="playPresentationAutoAdvanceSelect">Auto-advance</label>
      <select id="playPresentationAutoAdvanceSelect" class="pp-setup-select"
        data-onchange="setPlayPresentationAutoAdvance" data-pass="value">
        <option value="0"${opts.autoAdvanceSeconds === 0 ? " selected" : ""}>Off</option>
        <option value="5"${opts.autoAdvanceSeconds === 5 ? " selected" : ""}>Every 5s</option>
        <option value="10"${opts.autoAdvanceSeconds === 10 ? " selected" : ""}>Every 10s</option>
        <option value="15"${opts.autoAdvanceSeconds === 15 ? " selected" : ""}>Every 15s</option>
        <option value="30"${opts.autoAdvanceSeconds === 30 ? " selected" : ""}>Every 30s</option>
      </select>
    </div>
    <div class="pp-setup-section">
      <div class="pp-setup-label">Theme</div>
      <div class="pp-setup-chip-row">
        ${themeBtn("auto", "Auto")}
        ${themeBtn("dark", "Dark")}
        ${themeBtn("light", "Light")}
      </div>
    </div>
  `,
  );
}

function setPlayPresentationOrder(value) {
  if (value !== "listed" && value !== "reverse") return;
  if (playPresentationOptions.order === value) return;
  // Re-apply order to the live item list, keeping the same play in view.
  const current = playPresentationState.items[playPresentationState.index];
  playPresentationOptions.order = value;
  savePlayPresentationOptions();
  playPresentationState.items = playPresentationState.items.slice().reverse();
  const newIndex = playPresentationState.items.indexOf(current);
  playPresentationState.index =
    newIndex >= 0 ? newIndex : 0;
  renderPlayPresentation();
  renderPlayPresentationSetup();
}

function setPlayPresentationStartPlay(value) {
  const index = parseInt(value, 10);
  if (!Number.isInteger(index)) return;
  if (index < 0 || index >= playPresentationState.items.length) return;
  playPresentationState.index = index;
  renderPlayPresentation();
  restartPlayPresentationAutoAdvanceIfRunning();
}

function togglePlayPresentationOption(key) {
  if (!(key in playPresentationOptions)) return;
  playPresentationOptions[key] = !playPresentationOptions[key];
  savePlayPresentationOptions();
  renderPlayPresentation();
}

function setPlayPresentationAutoAdvance(value) {
  const seconds = parseInt(value, 10) || 0;
  playPresentationOptions.autoAdvanceSeconds = seconds;
  savePlayPresentationOptions();
  startPlayPresentationAutoAdvance();
}

function setPlayPresentationThemeOption(value) {
  if (value !== "auto" && value !== "dark" && value !== "light") return;
  playPresentationOptions.theme = value;
  savePlayPresentationOptions();
  applyPlayPresentationTheme();
  renderPlayPresentationSetup();
}

loadPlayPresentationOptions();
