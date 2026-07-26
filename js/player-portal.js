// ── player-portal.js ─────────────────────────────────────────────────────────
// Phase 17 — Player Portal: "My Questions" overlay.
// Shows the logged-in player's questions with coach replies, filterable by state.
// Opened via openPlayerPortal() → data-action="openPlayerPortal"

let _pportState = "open"; // current filter: "open" | "answered" | "resolved" | ""
let _pportQuestions = [];
let _pportOffset = 0;
let _pportHasMore = false;
let _pportLoading = false;

function _syncPlayerPortalFilterButtons() {
  document.querySelectorAll(".pport-filter-btn").forEach((btn) => {
    const active = (btn.dataset.arg || "") === _pportState;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

// ── Open / Close ─────────────────────────────────────────────────────────────

function openPlayerPortal() {
  const overlay = document.getElementById("playerPortalOverlay");
  if (!overlay) return;
  _pportState = "open";
  _syncPlayerPortalFilterButtons();
  overlay.hidden = false;
  overlay.removeAttribute("aria-hidden");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "playerPortalOverlay",
      scrollElement: "playerPortalBody",
      blocking: true,
      onEscape: () => closePlayerPortal(),
    });
  }
  _pportOffset = 0;
  _pportQuestions = [];
  _loadPlayerPortal();
}

function closePlayerPortal() {
  const overlay = document.getElementById("playerPortalOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") {
    closeLayer(overlay);
  }
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;
    const fallback = document.getElementById("playerPortalBtn");
    if (fallback && !fallback.hidden && typeof fallback.focus === "function") {
      fallback.focus({ preventScroll: true });
    }
  });
}

// ── Filter ────────────────────────────────────────────────────────────────────

function ppFilter(state) {
  if (_pportState === state) return;
  _pportState = state;
  _pportOffset = 0;
  _pportQuestions = [];
  _syncPlayerPortalFilterButtons();

  _loadPlayerPortal();
}

// ── Load & Render ─────────────────────────────────────────────────────────────

async function _loadPlayerPortal(append = false) {
  if (_pportLoading) return;
  _pportLoading = true;

  const body = document.getElementById("playerPortalBody");
  if (!body) { _pportLoading = false; return; }

  if (!append) {
    body.innerHTML = '<p class="pport-loading">Loading your questions…</p>';
  } else {
    const loadMore = document.getElementById("pportLoadMore");
    if (loadMore) loadMore.disabled = true;
  }

  try {
    const params = new URLSearchParams({ limit: 20, offset: _pportOffset });
    if (_pportState) params.set("state", _pportState);
    const res = await fetch(`/api/questions/mine?${params}`, { credentials: "same-origin" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to load");

    _pportHasMore = Boolean(data.hasMore ?? data.has_more);
    const nextQuestions = Array.isArray(data.questions) ? data.questions : [];

    if (append) {
      _pportQuestions = [..._pportQuestions, ...nextQuestions];
      _pportOffset += nextQuestions.length;
      _renderPlayerPortal(data.summary, append, nextQuestions);
    } else {
      _pportQuestions = nextQuestions;
      _pportOffset = nextQuestions.length;
      _renderPlayerPortal(data.summary, false, nextQuestions);
    }
  } catch (err) {
    if (!append) {
      body.innerHTML = `<div class="pport-empty">
        <p>Could not load questions. <button class="btn btn-sm" data-action="retryPlayerPortal">Retry</button></p>
      </div>`;
    }
  } finally {
    _pportLoading = false;
  }
}

function retryPlayerPortal() {
  _pportOffset = 0;
  _pportQuestions = [];
  _loadPlayerPortal();
}

function loadMorePlayerPortal() {
  if (_pportHasMore && !_pportLoading) _loadPlayerPortal(true);
}

function _renderPlayerPortal(summary, append, renderedQuestions = _pportQuestions) {
  const body = document.getElementById("playerPortalBody");
  if (!body) return;

  // Update summary badges
  const sumEl = document.getElementById("pportSummary");
  if (sumEl && summary) {
    sumEl.innerHTML = `
      <span class="pport-sum-badge pport-sum-open">${escapeHtml(String(summary.open))} open</span>
      <span class="pport-sum-badge pport-sum-answered">${escapeHtml(String(summary.answered))} answered</span>
      <span class="pport-sum-badge pport-sum-resolved">${escapeHtml(String(summary.resolved))} resolved</span>`;
  }

  if (!append) {
    if (!_pportQuestions.length) {
      const labels = { open: "open questions", answered: "answered questions", resolved: "resolved questions", "": "questions" };
      body.innerHTML = `<div class="pport-empty">
        <p>You have no ${escapeHtml(labels[_pportState] || "questions")} yet.</p>
        <p class="pport-empty-hint">Tap the 💬 button on any play during practice to ask your coach a question.</p>
      </div>`;
      return;
    }
    body.innerHTML = `<ul class="pport-list" id="pportList"></ul>
      <div class="pport-foot" id="pportFoot"></div>`;
  }

  const list = document.getElementById("pportList");
  if (!list) return;

  const fragment = renderedQuestions.map(_renderQuestion).join("");

  if (append) {
    list.insertAdjacentHTML("beforeend", fragment);
  } else {
    list.innerHTML = fragment;
  }

  const foot = document.getElementById("pportFoot");
  if (foot) {
    foot.innerHTML = _pportHasMore
      ? `<button class="btn btn-sm pport-load-more" id="pportLoadMore" data-action="loadMorePlayerPortal">Load more</button>`
      : "";
  }
}

function _renderQuestion(q) {
  const stateLabel = { open: "Open", reopened: "Reopened", answered: "Answered", resolved: "Resolved ✅" }[q.state] || q.state;
  const stateClass = { open: "pport-state-open", reopened: "pport-state-open", answered: "pport-state-answered", resolved: "pport-state-resolved" }[q.state] || "";
  const date = new Date(q.createdAt * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Try to find play display name from client-side plays array
  const playLabel = _resolvePlayLabel(q.playId);

  const replyHtml = q.coachReply
    ? `<div class="pport-reply">
        <span class="pport-reply-label">Coach reply${q.coachName ? ` (${escapeHtml(q.coachName)})` : ""}:</span>
        <p class="pport-reply-body">${escapeHtml(q.coachReply)}</p>
       </div>`
    : `<p class="pport-no-reply">No coach reply yet.</p>`;

  return `<li class="pport-item">
    <div class="pport-item-head">
      <span class="pport-play-label">${escapeHtml(playLabel)}</span>
      <span class="pport-state-badge ${stateClass}">${stateLabel}</span>
    </div>
    <p class="pport-question-body">${escapeHtml(q.body)}</p>
    ${replyHtml}
    <div class="pport-item-foot">
      <span class="pport-date">Asked ${escapeHtml(date)}</span>
      <button class="btn btn-xs pport-view-btn" data-action="pportOpenDiscussion" data-arg="${escapeHtml(q.playId)}">View Discussion →</button>
    </div>
  </li>`;
}

function _resolvePlayLabel(playId) {
  if (!playId) return "Unknown play";
  // Try to match against client-side plays[] global (loaded plays array)
  if (typeof plays !== "undefined" && Array.isArray(plays) && plays.length) {
    // playId in the thread table is typically set to something the client uses to identify a play
    // Try matching by index or by a computed slug
    const idx = parseInt(playId, 10);
    if (!isNaN(idx) && plays[idx]) {
      const p = plays[idx];
      return [p.formation, p.play].filter(Boolean).join(" ") || playId;
    }
  }
  // Fallback: humanize the slug
  return String(playId).replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Open play discussion ──────────────────────────────────────────────────────

function pportOpenDiscussion(playId) {
  closePlayerPortal();
  if (typeof openDiscussionForPlayId === "function") {
    openDiscussionForPlayId(playId);
  } else if (typeof openPlayPresentation === "function") {
    // fallback: open the presentation for the play and show discussion
    openPlayPresentation(playId);
  }
}
