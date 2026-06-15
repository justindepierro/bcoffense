// Shared landscape play presenter for the Playbook and Practice Script.

const PLAY_PRESENTATION_MODES = new Set(["minimum", "player", "coaches"]);

let playPresentationState = {
  source: "playbook",
  items: [],
  index: 0,
  mode: "minimum",
  position: "respQ",
  imageToken: 0,
  returnFocus: null,
};

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
  renderPlayPresentation();
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

async function loadPlayPresentationDiagram(play, token) {
  const frame = document.getElementById("playPresentationDiagram");
  if (!frame) return;
  const signature =
    typeof playSignature === "function" ? playSignature(play) : "";
  if (!signature || !window.playImages) {
    setPlayPresentationDiagramMessage(frame, "No play diagram attached");
    return;
  }

  try {
    const imageUrl =
      window.playImages.urlFor(signature) ||
      (await window.playImages.ensureUrl(signature));
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
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = `${getPlayPresentationPlayLabel(play)} diagram`;
    image.className = "pp-diagram-image";
    currentFrame.replaceChildren(image);
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
      <section class="pp-diagram-panel">
        ${getPlayPresentationDiagramMarkup(play)}
      </section>
      <section class="pp-call-panel">
        <div class="pp-eyebrow">${escapeHtml(item.context || "")}</div>
        <div class="pp-call">${getFullCall(play, {
          showEmoji: true,
          showLineCall: true,
          boldShifts: true,
          italicMotions: true,
        })}</div>
        <div class="pp-chips">${getPlayPresentationChipMarkup(play)}</div>
        ${
          play.oneWord
            ? `<div class="pp-one-word"><span>One Word</span>${escapeHtml(play.oneWord)}</div>`
            : ""
        }
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

function getPlayPresentationPlayerMarkup(item) {
  const play = item.play;
  const positions = getPlayPresentationPositions();
  const selected =
    positions.find(
      (position) => position.key === playPresentationState.position,
    ) || positions[0];
  const assignment = String(play[selected.key] || "").trim();
  const playerName = getPlayPresentationPlayerName(play, selected.key);
  const positionButtons = positions
    .map(
      (position) => `
        <button class="pp-position-btn${position.key === selected.key ? " active" : ""}"
          data-action="setPlayPresentationPosition" data-arg="${escapeHtml(position.key)}"
          aria-pressed="${position.key === selected.key}">
          ${escapeHtml(position.label)}
        </button>
      `,
    )
    .join("");

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
        <div class="pp-position-picker" role="group" aria-label="Choose player position">
          ${positionButtons}
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
  const detailRows = [
    {
      label: "Structure",
      values: [
        play.personnel,
        play.type,
        play.formation,
        [play.formTag1, play.formTag2].filter(Boolean).join(", "),
      ],
    },
    {
      label: "Backfield",
      values: [play.under, play.back, play.shift, play.motion],
    },
    {
      label: "Call",
      values: [
        play.protection,
        play.lineCall,
        play.play,
        [play.playTag1, play.playTag2].filter(Boolean).join(", "),
        play.basePlay,
      ],
    },
    {
      label: "Situation",
      values: [
        play.hash || play.preferredHash,
        play.preferredDown,
        play.preferredDistance,
        play.preferredSituation,
        play.preferredFieldPosition,
        play.tempo,
      ],
    },
    {
      label: "Defense",
      values: [
        play.defFront || play.practiceFront,
        play.practiceDefense,
        play.defCoverage || play.practiceCoverage,
        play.defBlitz || play.practiceBlitz,
        play.defStunt || play.practiceStunt,
      ],
    },
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
        <div class="pp-detail-grid">${getPlayPresentationDetailRows(detailRows)}</div>
        <div class="pp-assignment-section">
          <h3>Player Rules</h3>
          <div class="pp-assignment-grid">
            ${
              responsibilityMarkup ||
              '<div class="pp-empty-copy">No player rules entered.</div>'
            }
          </div>
        </div>
        ${
          play.respNotes || play.notes
            ? `<div class="pp-coach-notes">
                ${play.respNotes ? `<p><strong>Responsibility Notes:</strong> ${escapeHtml(play.respNotes)}</p>` : ""}
                ${play.notes ? `<p><strong>Notes:</strong> ${escapeHtml(play.notes)}</p>` : ""}
              </div>`
            : ""
        }
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

  let markup = "";
  if (playPresentationState.mode === "player") {
    markup = getPlayPresentationPlayerMarkup(item);
  } else if (playPresentationState.mode === "coaches") {
    markup = getPlayPresentationCoachMarkup(item);
  } else {
    markup = getPlayPresentationMinimumMarkup(item);
  }

  setInnerHTML(body, markup);
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
