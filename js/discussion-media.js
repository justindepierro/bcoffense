/**
 * Discussion media runtime
 *
 * Owns attachment upload/retry, diagram markup, and attachment viewing.
 * Thread rendering, replies, reactions, and moderation remain in
 * play-discussion.js so each concern has one stable owner.
 */

// ── Discussion Visual Attachments ─────────────────────────────────────────────

/**
 * Map of composerId → { id, r2_key, type, caption, sizeBytes, sourcePlayId }
 * Populated after a successful upload, consumed on post submit.
 */
const _discPendingAttachments = new Map();
/** Stores { file, playId } for failed uploads so the coach can retry. */
const _discFailedUploads = new Map();

/** Show/hide the uploading spinner and grey out the thumb. */
function _discSetUploadingState(composerKey, isUploading) {
  const composer = _discComposerForKey(composerKey);
  const pendingEl = composer?.querySelector("[data-disc-pending-attachment]") || null;
  const spinnerEl = composer?.querySelector(".disc-upload-spinner") || null;
  const retryEl = composer?.querySelector(".disc-upload-retry-btn") || null;
  const removeEl = composer?.querySelector(".disc-remove-attach-btn") || null;
  if (!pendingEl) return;
  if (isUploading) {
    pendingEl.classList.add("disc-pending--uploading");
    if (spinnerEl) spinnerEl.style.display = "inline-block";
    if (retryEl) retryEl.style.display = "none";
    if (removeEl) removeEl.disabled = true;
  } else {
    pendingEl.classList.remove("disc-pending--uploading");
    if (spinnerEl) spinnerEl.style.display = "none";
    if (removeEl) removeEl.disabled = false;
  }
}

/** Show the retry button after a failed upload. */
function _discShowRetryState(composerKey) {
  const composer = _discComposerForKey(composerKey);
  const retryEl = composer?.querySelector(".disc-upload-retry-btn") || null;
  const removeEl = composer?.querySelector(".disc-remove-attach-btn") || null;
  if (retryEl) retryEl.style.display = "inline-flex";
  if (removeEl) removeEl.disabled = false;
}

/** Clear the pending attachment thumbnail UI for a given composer. */
function _discClearPendingAttachmentUI(composerKey) {
  const composer = _discComposerForKey(composerKey);
  const pendingEl = composer?.querySelector("[data-disc-pending-attachment]") || null;
  const thumbEl = composer?.querySelector(".disc-pending-thumb") || null;
  if (pendingEl) pendingEl.style.display = "none";
  if (thumbEl) thumbEl.src = "";
}

/** Show the pending attachment thumbnail in the composer. */
function _discShowPendingAttachmentUI(composerKey, previewUrl) {
  const composer = _discComposerForKey(composerKey);
  const pendingEl = composer?.querySelector("[data-disc-pending-attachment]") || null;
  const thumbEl = composer?.querySelector(".disc-pending-thumb") || null;
  if (pendingEl) pendingEl.style.display = "flex";
  if (thumbEl) thumbEl.src = previewUrl;
}

/**
 * Upload a blob/file to /api/attachments/upload and return { id, r2_key, type, sizeBytes }.
 * Returns null on failure (already shows a toast).
 */
async function _discUploadAttachment(blob, type, caption, sourcePlayId, uploadId = crypto.randomUUID()) {
  let failure = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const formData = new FormData();
    formData.append("file", blob, `disc-attach.${type === "markup" ? "png" : blob.name || "jpg"}`);
    formData.append("type", type === "markup" ? "markup" : "image");
    formData.append("uploadId", uploadId);
    if (caption) formData.append("caption", caption);
    if (sourcePlayId) formData.append("playId", sourcePlayId);
    try {
      const res = await fetch("/api/attachments/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        return { id: data.id, r2_key: data.r2_key, type: data.type, sizeBytes: data.sizeBytes, uploadId };
      }
      failure = data.error || "Attachment upload failed.";
      // Validation and permissions need coach action, not another request.
      if (res.status < 500) break;
    } catch (_) {
      failure = "Network error — attachment not uploaded.";
    }
    // One silent retry smooths transient mobile handoffs without creating a
    // second R2 object because the immutable upload ID is reused.
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 750));
  }
  showToast(failure || "Attachment upload failed.", { duration: 3500, type: "error" });
  return null;
}

/**
 * Remove the pending attachment for a composer (called by "✕" remove button).
 * data-action="discRemovePendingAttachment" scoped to the active composer.
 */
function discRemovePendingAttachment(arg, el) {
  const button = el instanceof Element ? el : (arg instanceof Element ? arg : null);
  const composerKey = _discComposerKey(button?.closest(".disc-composer"));
  if (!composerKey) return;
  _discPendingAttachments.delete(composerKey);
  _discFailedUploads.delete(composerKey);
  _discClearPendingAttachmentUI(composerKey);
  // Also reset retry/spinner state in case it was showing
  const composer = _discComposerForKey(composerKey);
  const retryEl = composer?.querySelector(".disc-upload-retry-btn") || null;
  const spinnerEl = composer?.querySelector(".disc-upload-spinner") || null;
  if (retryEl) retryEl.style.display = "none";
  if (spinnerEl) spinnerEl.style.display = "none";
}

/**
 * Retry a failed image upload using the stored file reference.
 * data-action="discRetryAttachmentUpload" scoped to the active composer.
 */
async function discRetryAttachmentUpload(arg, el) {
  const button = el instanceof Element ? el : (arg instanceof Element ? arg : null);
  const composerKey = _discComposerKey(button?.closest(".disc-composer"));
  if (!composerKey) return;
  const failed = _discFailedUploads.get(composerKey);
  if (!failed) return;
  const { file, playId, previewUrl, uploadId } = failed;

  // Restore the preview and start uploading again
  _discShowPendingAttachmentUI(composerKey, previewUrl);
  _discSetUploadingState(composerKey, true);

  const result = await _discUploadAttachment(file, "image", "", playId, uploadId);
  _discSetUploadingState(composerKey, false);
  if (!result) {
    _discShowRetryState(composerKey);
    return;
  }
  _discFailedUploads.delete(composerKey);
  result.sourcePlayId = playId;
  _discPendingAttachments.set(composerKey, result);
  showToast("Image ready to post.", { duration: 2000, type: "success" });
}

// ── Image file picker upload ──────────────────────────────────────────────────

/**
 * Wire file input change events in a composer container.
 * Called after a composer is injected into the DOM.
 */
function _discWireAttachmentInputs(container) {
  container.querySelectorAll(".disc-img-file-input").forEach((input) => {
    if (input._discWired) return;
    input._discWired = true;
    input.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        showToast("Image must be under 8 MB.", { duration: 3000, type: "error" });
        input.value = "";
        return;
      }
      const composerKey = _discComposerKey(input.closest(".disc-composer"));
      const playId = input.dataset.playId;
      if (!composerKey || !playId) return;
      const uploadId = crypto.randomUUID();
      // Show local preview immediately and start uploading state
      const previewUrl = URL.createObjectURL(file);
      _discShowPendingAttachmentUI(composerKey, previewUrl);
      _discSetUploadingState(composerKey, true);
      _discFailedUploads.delete(composerKey);

      const result = await _discUploadAttachment(file, "image", "", playId, uploadId);
      input.value = "";
      _discSetUploadingState(composerKey, false);
      if (!result) {
        // Keep the preview visible but show retry — don't clear the thumb
        _discFailedUploads.set(composerKey, { file, playId, previewUrl, uploadId });
        _discShowRetryState(composerKey);
        _discPendingAttachments.delete(composerKey);
        return;
      }
      URL.revokeObjectURL(previewUrl);
      result.sourcePlayId = playId;
      _discPendingAttachments.set(composerKey, result);
      showToast("Image ready to post.", { duration: 2000, type: "success" });
    });
  });
}

// ── Mark Up Play overlay ──────────────────────────────────────────────────────

/**
 * State for the markup overlay.
 * @type {{ strokes: Array, currentTool: string, color: string, lineWidth: number, canvas: HTMLCanvasElement|null, baseImg: HTMLImageElement|null, composerId: string, playId: string }}
 */
const _discMarkup = {
  strokes: [],
  currentTool: "pen",
  color: "#ffd400",
  lineWidth: 5,
  canvas: null,
  baseImg: null,
  composerId: "",
  playId: "",
  drawing: false,
  currentPath: null,
};

/** Open the play markup overlay for the composer that initiated it. */
async function discOpenMarkupOverlay(arg, el) {
  const trigger = el instanceof Element ? el : (arg instanceof Element ? arg : null);
  const composerId = _discComposerKey(trigger?.closest(".disc-composer"));
  const playId = trigger?.dataset?.playId || "";
  if (!composerId || !playId) return;

  _discMarkup.composerId = composerId;
  _discMarkup.playId = playId;
  _discMarkup.strokes = [];
  _discMarkup.currentTool = "pen";
  _discMarkup.color = "#ffd400";
  _discMarkup.lineWidth = 5;
  _discMarkup.drawing = false;
  _discMarkup.currentPath = null;

  // Get or build the overlay
  let overlay = document.getElementById("discMarkupOverlay");
  if (!overlay) {
    overlay = _discBuildMarkupOverlay();
    document.body.appendChild(overlay);
  }
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "discussion-markup",
      scrollElement: overlay.querySelector(".disc-markup-panel"),
      blocking: true,
      exclusive: false,
      safeArea: true,
    });
  }

  // Load the play image (use play-images.js if available)
  const img = new Image();
  img.crossOrigin = "anonymous";
  _discMarkup.baseImg = img;

  // Try to find the play image from IndexedDB via playImages
  const canvas = document.getElementById("discMarkupCanvas");
  _discMarkup.canvas = canvas;

  // Load play image from play-images.js if the function exists
  if (typeof playImages !== "undefined" && typeof playImages.getImage === "function") {
    const playImgData = await playImages.getImage(playId).catch(() => null);
    if (playImgData) {
      img.src = playImgData;
    } else {
      img.src = ""; // blank canvas — coach can still draw freely
    }
  } else {
    img.src = "";
  }

  img.onload = () => _discMarkupRedraw();
  img.onerror = () => { _discMarkup.baseImg = null; _discMarkupRedraw(); };

  // Immediately redraw (may be blank initially)
  _discMarkupRedraw();
}

function _discBuildMarkupOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "discMarkupOverlay";
  overlay.className = "disc-markup-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Mark up play diagram");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML =
    `<div class="disc-markup-panel">` +
    `<div class="disc-markup-toolbar">` +
    `<span class="disc-markup-title">✏️ Mark Up Play</span>` +
    `<div class="disc-markup-tools">` +
    `<button class="disc-markup-tool active" data-action="discMarkupTool" data-arg="pen" title="Pen">✏️</button>` +
    `<button class="disc-markup-tool" data-action="discMarkupTool" data-arg="arrow" title="Arrow">→</button>` +
    `<button class="disc-markup-tool" data-action="discMarkupTool" data-arg="circle" title="Circle">⭕</button>` +
    `<button class="disc-markup-tool" data-action="discMarkupTool" data-arg="eraser" title="Eraser">🧹</button>` +
    `</div>` +
    `<div class="disc-markup-colors">` +
    ["#ffd400", "#ff4444", "#44aaff", "#44cc44", "#ffffff", "#000000"].map((c) =>
      `<button class="disc-markup-color-swatch${c === "#ffd400" ? " active" : ""}"` +
      ` data-action="discMarkupColor" data-arg="${c}" style="background:${c}" title="${c}"></button>`
    ).join("") +
    `</div>` +
    `<div class="disc-markup-width">` +
    `<label class="sr-only" for="discMarkupWidth">Brush size</label>` +
    `<input type="range" id="discMarkupWidth" min="2" max="20" value="5" step="1"` +
    ` data-oninput="discMarkupSetWidth" data-pass="value">` +
    `</div>` +
    `<div class="disc-markup-btns">` +
    `<button class="btn btn-xs" data-action="discMarkupUndo" title="Undo">↩ Undo</button>` +
    `<button class="btn btn-xs" data-action="discMarkupClear" title="Clear">🗑 Clear</button>` +
    `<button class="btn btn-xs btn-primary" data-action="discMarkupAttach" title="Attach to reply">✓ Attach</button>` +
    `<button class="btn btn-xs" data-action="discMarkupClose" title="Cancel">✕ Cancel</button>` +
    `</div>` +
    `</div>` +
    `<canvas id="discMarkupCanvas" class="disc-markup-canvas"></canvas>` +
    `</div>`;

  _discMarkupWirePointer(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) discMarkupClose();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    discMarkupClose();
  });
  return overlay;
}

function _discMarkupWirePointer(overlay) {
  const getCanvas = () => document.getElementById("discMarkupCanvas");

  overlay.addEventListener("pointerdown", (e) => {
    const canvas = getCanvas();
    if (!canvas || e.target !== canvas) return;
    _discMarkup.drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = _discMarkupNorm(canvas, e);
    if (_discMarkup.currentTool === "eraser") {
      _discMarkupEraseAt(canvas, x, y);
    } else {
      _discMarkup.currentPath = { tool: _discMarkup.currentTool, color: _discMarkup.color, lineWidth: _discMarkup.lineWidth, points: [{ x, y }] };
    }
    e.preventDefault();
  }, { passive: false });

  overlay.addEventListener("pointermove", (e) => {
    const canvas = getCanvas();
    if (!canvas || !_discMarkup.drawing) return;
    const { x, y } = _discMarkupNorm(canvas, e);
    if (_discMarkup.currentTool === "eraser") {
      _discMarkupEraseAt(canvas, x, y);
    } else if (_discMarkup.currentPath) {
      _discMarkup.currentPath.points.push({ x, y });
      _discMarkupRedraw();
    }
    e.preventDefault();
  }, { passive: false });

  const endDraw = (e) => {
    if (!_discMarkup.drawing) return;
    _discMarkup.drawing = false;
    if (_discMarkup.currentPath && _discMarkup.currentPath.points.length > 0) {
      _discMarkup.strokes.push(_discMarkup.currentPath);
    }
    _discMarkup.currentPath = null;
    _discMarkupRedraw();
    e?.preventDefault();
  };
  overlay.addEventListener("pointerup", endDraw, { passive: false });
  overlay.addEventListener("pointercancel", endDraw, { passive: false });
}

function _discMarkupNorm(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
}

function _discMarkupEraseAt(canvas, nx, ny) {
  const r = 0.04; // normalized eraser radius
  _discMarkup.strokes = _discMarkup.strokes.filter((stroke) => {
    return !stroke.points.some((pt) => Math.hypot(pt.x - nx, pt.y - ny) < r);
  });
  _discMarkupRedraw();
}

function _discMarkupRedraw() {
  const canvas = _discMarkup.canvas || document.getElementById("discMarkupCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width || canvas.offsetWidth || 800;
  const H = canvas.height || canvas.offsetHeight || 450;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  // Draw base image if loaded
  if (_discMarkup.baseImg?.complete && _discMarkup.baseImg.naturalWidth > 0) {
    ctx.drawImage(_discMarkup.baseImg, 0, 0, W, H);
  } else {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#4a4a6a";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Draw on blank canvas — no play image found", W / 2, H / 2);
    ctx.textAlign = "left";
  }

  // Draw committed strokes
  for (const stroke of _discMarkup.strokes) {
    _discDrawStroke(ctx, stroke, W, H);
  }

  // Draw in-progress stroke
  if (_discMarkup.currentPath) {
    _discDrawStroke(ctx, _discMarkup.currentPath, W, H);
  }
}

function _discDrawStroke(ctx, stroke, W, H) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = stroke.color || "#ffd400";
  ctx.lineWidth = stroke.lineWidth || 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.tool === "circle" && pts.length >= 2) {
    const cx = pts[0].x * W;
    const cy = pts[0].y * H;
    const lx = pts[pts.length - 1].x * W;
    const ly = pts[pts.length - 1].y * H;
    const rx = Math.abs(lx - cx) / 2;
    const ry = Math.abs(ly - cy) / 2;
    const ecx = (cx + lx) / 2;
    const ecy = (cy + ly) / 2;
    ctx.beginPath();
    ctx.ellipse(ecx, ecy, Math.max(rx, 4), Math.max(ry, 4), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stroke.tool === "arrow" && pts.length >= 2) {
    const sx = pts[0].x * W;
    const sy = pts[0].y * H;
    const ex = pts[pts.length - 1].x * W;
    const ey = pts[pts.length - 1].y * H;
    const ang = Math.atan2(ey - sy, ex - sx);
    const hw = 14;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - hw * Math.cos(ang - 0.4), ey - hw * Math.sin(ang - 0.4));
    ctx.lineTo(ex - hw * Math.cos(ang + 0.4), ey - hw * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fillStyle = stroke.color || "#ffd400";
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0].x * W, pts[0].y * H);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * W, pts[i].y * H);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Select markup tool. data-action="discMarkupTool" data-arg="{tool}" */
function discMarkupTool(tool) {
  _discMarkup.currentTool = String(tool);
  document.querySelectorAll(".disc-markup-tool").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.arg === tool);
  });
}

/** Select markup color. data-action="discMarkupColor" data-arg="{hex}" */
function discMarkupColor(color) {
  _discMarkup.color = String(color);
  document.querySelectorAll(".disc-markup-color-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.arg === color);
  });
}

/** Set brush width from range input. data-oninput="discMarkupSetWidth" data-pass="value" */
function discMarkupSetWidth(val) {
  _discMarkup.lineWidth = Math.max(1, Math.min(30, parseInt(val, 10) || 5));
}

/** Undo last stroke. data-action="discMarkupUndo" */
function discMarkupUndo() {
  _discMarkup.strokes.pop();
  _discMarkupRedraw();
}

/** Clear all strokes. data-action="discMarkupClear" */
function discMarkupClear() {
  _discMarkup.strokes = [];
  _discMarkupRedraw();
}

/** Close the markup overlay without attaching. data-action="discMarkupClose" */
function discMarkupClose() {
  const overlay = document.getElementById("discMarkupOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") closeLayer(overlay);
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
}

/**
 * Export the canvas as PNG blob, upload to R2, store as pending attachment.
 * data-action="discMarkupAttach"
 */
async function discMarkupAttach() {
  const canvas = document.getElementById("discMarkupCanvas");
  if (!canvas) return;

  // Prompt for optional caption
  let caption = "";
  if (typeof showPrompt === "function") {
    caption = (await showPrompt("Add a caption for this markup (optional):", "", { title: "Caption", icon: "✏️" })) || "";
  }

  showToast("Uploading markup…", { duration: 2500 });

  canvas.toBlob(async (blob) => {
    if (!blob) { showToast("Could not export canvas.", { duration: 3000, type: "error" }); return; }

    const result = await _discUploadAttachment(blob, "markup", caption.trim(), _discMarkup.playId);
    if (!result) return;
    result.sourcePlayId = _discMarkup.playId;

    const composerId = _discMarkup.composerId;
    _discPendingAttachments.set(composerId, result);

    // Show thumbnail in composer
    const previewUrl = URL.createObjectURL(blob);
    _discShowPendingAttachmentUI(composerId, previewUrl);

    discMarkupClose();
    showToast("Play markup ready to post.", { duration: 2500, type: "success" });
  }, "image/png");
}

// ── Attachment viewer (lightbox) ──────────────────────────────────────────────

/**
 * Open a full-screen image viewer. data-action="openDiscAttachmentViewer"
 * arg = "{id}::{caption}"
 */
function openDiscAttachmentViewer(arg) {
  const sep = String(arg).indexOf("::");
  const id = sep >= 0 ? arg.slice(0, sep) : arg;
  const caption = sep >= 0 ? arg.slice(sep + 2) : "";

  let viewer = document.getElementById("discAttachmentViewerOverlay");
  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "discAttachmentViewerOverlay";
    viewer.className = "disc-attachment-viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", "Attachment viewer");
    viewer.setAttribute("aria-hidden", "true");
    viewer.innerHTML =
      `<div class="disc-attachment-viewer-inner">` +
      `<button class="disc-attachment-viewer-close" data-action="closeDiscAttachmentViewer" aria-label="Close">✕</button>` +
      `<img id="discAttachmentViewerImg" class="disc-attachment-viewer-img" alt="" src="">` +
      `<p id="discAttachmentViewerCaption" class="disc-attachment-viewer-caption"></p>` +
      `</div>`;
    viewer.addEventListener("click", (e) => {
      if (e.target === viewer) closeDiscAttachmentViewer();
    });
    document.body.appendChild(viewer);
  }

  const img = document.getElementById("discAttachmentViewerImg");
  const capEl = document.getElementById("discAttachmentViewerCaption");
  if (img) { img.src = `/api/attachments/${encodeURIComponent(id)}`; img.alt = caption; }
  if (capEl) { capEl.textContent = caption; capEl.style.display = caption ? "" : "none"; }

  viewer.classList.add("visible");
  viewer.setAttribute("aria-hidden", "false");
  if (typeof openLayer === "function") {
    openLayer(viewer, {
      id: "discussion-attachment-viewer",
      scrollElement: viewer.querySelector(".disc-attachment-viewer-inner"),
      blocking: true,
      exclusive: false,
      safeArea: true,
    });
  }
}

function closeDiscAttachmentViewer() {
  const viewer = document.getElementById("discAttachmentViewerOverlay");
  if (!viewer) return;
  if (typeof closeLayer === "function") closeLayer(viewer);
  viewer.classList.remove("visible");
  viewer.setAttribute("aria-hidden", "true");
}


