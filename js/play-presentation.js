// Shared landscape play presenter for the Playbook and Practice Script.

const PLAY_PRESENTATION_MODES = new Set(["minimum", "player", "coaches"]);
const PLAY_PRESENTATION_SAMPLE_MAX = 480;
const PLAY_PRESENTATION_MAX_RENDER_PIXELS = 10_000_000;
const PLAY_PRESENTATION_MAX_RENDER_EDGE = 4096;

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
    showToast("No filtered plays are available to present.", { type: "warning" });
    return;
  }
  const startIndex = Math.max(
    0,
    items.findIndex((item) => item.sourceIndex === selectedRowIndex),
  );
  openPlayPresentation(items, startIndex, "playbook");
}

function openPlaybookPresentation(filteredIndex) {
  const targetIndex = parseInt(filteredIndex, 10);
  const items = getPlayPresentationItemsFromPlaybook();
  const startIndex = items.findIndex((item) => item.sourceIndex === targetIndex);
  if (startIndex < 0) return;
  selectPlaybookRow(targetIndex);
  openPlayPresentation(items, startIndex, "playbook");
}

function openScriptPresentation(scriptIndex) {
  const targetIndex = parseInt(scriptIndex, 10);
  const items = getPlayPresentationItemsFromScript();
  if (items.length === 0) {
    showToast("Add a play to the script before presenting.", {
      type: "warning",
    });
    return;
  }
  const requestedIndex = Number.isInteger(targetIndex)
    ? items.findIndex((item) => item.sourceIndex === targetIndex)
    : -1;
  const selectedIndex = Array.isArray(bulkSelectedIndices)
    ? items.findIndex((item) => bulkSelectedIndices.includes(item.sourceIndex))
    : -1;
  openPlayPresentation(
    items,
    requestedIndex >= 0 ? requestedIndex : Math.max(0, selectedIndex),
    "script",
  );
}

function openPlayPresentation(items, startIndex, source) {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay || !Array.isArray(items) || items.length === 0) return;

  playPresentationState.returnFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  playPresentationState.items = items;
  playPresentationState.index = Math.max(
    0,
    Math.min(parseInt(startIndex, 10) || 0, items.length - 1),
  );
  playPresentationState.source = source === "script" ? "script" : "playbook";
  playPresentationState.imageToken += 1;

  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  overlay.removeAttribute("inert");
  document.body.classList.add("play-presentation-open");
  renderPlayPresentation();
  if (!overlay.dataset.focusTrapReady) {
    trapFocus(overlay);
    overlay.dataset.focusTrapReady = "true";
  }
  document.getElementById("playPresentationClose")?.focus();

  if (overlay.requestFullscreen && !document.fullscreenElement) {
    try {
      Promise.resolve(overlay.requestFullscreen({ navigationUI: "hide" }))
        .then(() => {
          if (screen.orientation?.lock) {
            return screen.orientation.lock("landscape").catch(() => {});
          }
          return null;
        })
        .catch(() => {});
    } catch (_err) {
      // Full Screen is best-effort and may require a direct user gesture.
    }
  }
}

function closePlayPresentation() {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay) return;
  playPresentationState.imageToken += 1;
  cleanupPlayPresentationDiagramRenderer();
  overlay.classList.remove("show");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  document.body.classList.remove("play-presentation-open");

  if (screen.orientation?.unlock) {
    try {
      screen.orientation.unlock();
    } catch (_err) {
      // Orientation locking is best-effort across tablet browsers.
    }
  }
  if (document.fullscreenElement === overlay && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  if (playPresentationState.returnFocus?.isConnected) {
    playPresentationState.returnFocus.focus();
  }
  playPresentationState.returnFocus = null;
}

function setPlayPresentationMode(mode) {
  if (!PLAY_PRESENTATION_MODES.has(mode)) return;
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
  renderPlayPresentation();
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

function setPlayPresentationDiagramMessage(frame, message) {
  if (!frame) return;
  const emptyState = document.createElement("div");
  emptyState.className = "pp-diagram-empty";
  emptyState.textContent = message;
  frame.replaceChildren(emptyState);
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
  const paddingX = sourceWidth * 0.018;
  const paddingY = sourceHeight * 0.018;
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

  const draw = () => {
    if (
      token !== playPresentationState.imageToken ||
      document.getElementById("playPresentationDiagram") !== frame
    ) {
      return;
    }
    drawPlayPresentationDiagram(canvas, frame, image, contentBounds);
  };
  draw();

  if (typeof ResizeObserver === "function") {
    playPresentationDiagramResizeObserver = new ResizeObserver(() => {
      if (playPresentationDiagramResizeFrame) {
        cancelAnimationFrame(playPresentationDiagramResizeFrame);
      }
      playPresentationDiagramResizeFrame = requestAnimationFrame(() => {
        playPresentationDiagramResizeFrame = 0;
        draw();
      });
    });
    playPresentationDiagramResizeObserver.observe(frame);
  }
}

async function loadPlayPresentationDiagram(play, token) {
  const frame = document.getElementById("playPresentationDiagram");
  if (!frame) return;
  cleanupPlayPresentationDiagramRenderer();
  if (!window.playImages) {
    setPlayPresentationDiagramMessage(frame, "No play diagram attached");
    return;
  }

  try {
    const imageUrl =
      typeof window.ensurePlayImageUrl === "function"
        ? await window.ensurePlayImageUrl(play)
        : null;
    if (token !== playPresentationState.imageToken) return;
    const currentFrame = document.getElementById("playPresentationDiagram");
    if (!currentFrame) return;
    if (!imageUrl) {
      setPlayPresentationDiagramMessage(
        currentFrame,
        "No play diagram attached",
      );
      return;
    }
    const image = await loadPlayPresentationImage(imageUrl, play);
    if (token !== playPresentationState.imageToken) return;
    try {
      installPlayPresentationDiagramRenderer(
        currentFrame,
        image,
        play,
        token,
      );
    } catch (renderError) {
      console.warn("smart diagram rendering failed:", renderError);
      image.className = "pp-diagram-image";
      currentFrame.replaceChildren(image);
    }
  } catch (err) {
    console.warn("play presentation image load failed:", err);
    if (token !== playPresentationState.imageToken) return;
    const currentFrame = document.getElementById("playPresentationDiagram");
    setPlayPresentationDiagramMessage(
      currentFrame,
      "Diagram could not be loaded",
    );
  }
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
        ${
          play.oneWord
            ? `<div class="pp-minimum-one-word"><span>One Word</span>${escapeHtml(play.oneWord)}</div>`
            : '<div class="pp-minimum-one-word is-empty" aria-hidden="true"></div>'
        }
      </section>
      <section class="pp-diagram-panel pp-minimum-diagram">
        ${getPlayPresentationDiagramMarkup(play)}
      </section>
      <section class="pp-minimum-bottom" aria-label="Play details">
        <div class="pp-chips pp-minimum-chips">${getPlayPresentationChipMarkup(play)}</div>
      </section>
    </div>
  `;
}

function getPlayPresentationPlayerName(play, positionKey) {
  if (playPresentationState.source !== "script") return "";
  if (
    typeof getScriptPlayerAssignments !== "function" ||
    typeof getTeamPlayerSelectionDisplay !== "function"
  ) {
    return "";
  }
  const slotKey = String(positionKey || "").replace(/^resp/, "").toLowerCase();
  const assignments = getScriptPlayerAssignments(play) || {};
  const playerId = String(assignments[slotKey] || "").trim();
  return playerId ? getTeamPlayerSelectionDisplay(playerId) : "";
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
    button.className = `pp-position-btn${
      position.key === selected.key ? " active" : ""
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
  lockButton.className = `pp-position-lock-btn${
    lockCopy.locked ? " active" : ""
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
  const playerName = getPlayPresentationPlayerName(play, selected.key);

  return `
    <div class="pp-layout pp-layout-player">
      <section class="pp-diagram-panel">
        ${getPlayPresentationDiagramMarkup(play)}
      </section>
      <section class="pp-player-panel">
        <div class="pp-player-call">${getFullCall(play, {
          showEmoji: true,
          showLineCall: true,
          boldShifts: true,
          italicMotions: true,
        })}</div>
        <div class="pp-position-picker" id="playPresentationPositionPicker"
          role="group" aria-label="Choose player position"></div>
        <div class="pp-position-lock-row">
          <span id="playPresentationPositionLockMount"></span>
          <span class="pp-position-lock-status"
            id="playPresentationPositionLockStatus"></span>
        </div>
        <div class="pp-player-rule">
          <div class="pp-player-rule-head">
            <span class="pp-player-position">${escapeHtml(selected.label)}</span>
            ${playerName ? `<span class="pp-player-name">${escapeHtml(playerName)}</span>` : ""}
          </div>
          <div class="pp-player-rule-text">${
            assignment
              ? escapeHtml(assignment)
              : "No player rule entered for this position."
          }</div>
        </div>
        ${
          play.respNotes
            ? `<div class="pp-resp-notes"><strong>Responsibility Notes</strong>${escapeHtml(play.respNotes)}</div>`
            : ""
        }
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
  const callRows = [
    {
      label: "Personnel / Type",
      values: [
        play.personnel,
        play.type,
      ],
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
  ];
  const situationRows = [
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
      values: [
        play.tempo,
        play.oneWord,
      ],
    },
  ];
  const defenseRows = [
    {
      label: "Front / Structure",
      values: [
        play.defFront || play.practiceFront,
        play.practiceDefense,
      ],
    },
    {
      label: "Coverage",
      values: [
        play.defCoverage || play.practiceCoverage,
      ],
    },
    {
      label: "Pressure",
      values: [
        play.defBlitz || play.practiceBlitz,
        play.defStunt || play.practiceStunt,
      ],
    },
  ];
  const coachingRows = [
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
  ];
  const coachSections = [
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
  ].join("");

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
        ${coachSections}
        <section class="pp-coach-section pp-coach-section-rules" aria-label="Player rules">
          <div class="pp-coach-section-head">
            <h3>Player Rules</h3>
            <span>Position-by-position assignments</span>
          </div>
          <div class="pp-assignment-grid">
            ${
              responsibilityMarkup ||
              '<div class="pp-empty-copy">No player rules entered.</div>'
            }
          </div>
        </section>
        ${getPlayPresentationCoachNotesMarkup(play)}
      </section>
    </div>
  `;
}

function renderPlayPresentation() {
  const item = playPresentationState.items[playPresentationState.index];
  const body = document.getElementById("playPresentationBody");
  if (!item || !body) return;

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

  setInnerHTML(body, markup);
  if (playPresentationState.mode === "player") {
    hydratePlayPresentationPlayerControls();
  }
  const token = ++playPresentationState.imageToken;
  loadPlayPresentationDiagram(item.play, token);

  const announcer = document.getElementById("liveAnnouncer");
  if (announcer) {
    announcer.textContent = `Showing ${getPlayPresentationPlayLabel(item.play)}, slide ${playPresentationState.index + 1} of ${playPresentationState.items.length}`;
  }
}

function handlePlayPresentationKeydown(event) {
  const overlay = document.getElementById("playPresentationOverlay");
  if (!overlay?.classList.contains("show")) return;

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
document.addEventListener("fullscreenchange", () => {
  const overlay = document.getElementById("playPresentationOverlay");
  if (
    overlay?.classList.contains("show") &&
    !document.fullscreenElement &&
    document.body.classList.contains("play-presentation-open")
  ) {
    // Keep the in-app landscape overlay open if a browser exits Full Screen.
    overlay.classList.add("show");
  }
});
