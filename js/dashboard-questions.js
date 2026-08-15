/**
 * dashboard-questions.js
 * Coach Player Inbox — dashboard card + full overlay inbox.
 *
 * Public API:
 *   refreshQuestionsCard()      — fetch summary, update #dashQuestionsCard
 *   openQuestionInbox(state)    — open overlay with given state filter
 *   closeQuestionInbox()        — close overlay
 *   qInboxTypeChanged(value)    — type filter select handler
 *   qInboxStateChanged(value)   — state filter select handler
 *   qInboxSortChanged(value)    — sort select handler
 *   loadMoreQInbox()            — pagination
 *   retryQInbox()               — retry after error
 */

"use strict";

// ── State ──────────────────────────────────────────────────────────────────────
let _qState = "open";        // current state filter
let _qType = "all";          // questions + recent player comments by default
let _qSort = "newest";       // current sort
let _qOffset = 0;
let _qLoading = false;
let _qHasMore = false;
let _qCardRefreshTimer = null;
let _qSummary = null;        // last summary from API
let _qInboxCloseTimer = null;

const Q_PAGE_SIZE = 25;

// ── State badge helper ─────────────────────────────────────────────────────────
function _qStateBadge(state) {
  const map = {
    open: { label: "Open", cls: "q-state-open" },
    answered: { label: "Answered", cls: "q-state-answered" },
    resolved: { label: "Resolved", cls: "q-state-resolved" },
    reopened: { label: "Reopened", cls: "q-state-reopened" },
  };
  const m = map[state] || { label: state, cls: "q-state-open" };
  return `<span class="q-state-badge ${m.cls}">${m.label}</span>`;
}

function _qTypeBadge(postType) {
  const isQuestion = postType === "question";
  return `<span class="q-type-badge ${isQuestion ? "q-type-question" : "q-type-comment"}">${isQuestion ? "Question" : "Comment"}</span>`;
}

// ── Time helper ────────────────────────────────────────────────────────────────
function _qRelTime(unixSec) {
  if (!unixSec) return "";
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString();
}

// ── Play label helper ──────────────────────────────────────────────────────────
function _qPlayLabel(playId) {
  if (!playId) return "Unknown Play";
  if (typeof plays === "undefined") return decodeURIComponent(playId);
  const decoded = decodeURIComponent(playId);
  // playId is encoded "personnel::formation::play" or similar
  const parts = decoded.split("::");
  // Show formation + play (last 2 meaningful parts)
  const label = parts.filter(Boolean).slice(-2).join(" ");
  return label || decoded;
}

// ── Single question item HTML ──────────────────────────────────────────────────
function _qItemHtml(q) {
  const playLabel = escapeHtml(_qPlayLabel(q.playId));
  const author = escapeHtml(q.authorName || "Player");
  const bodyText = String(q.body || "");
  const body = escapeHtml(bodyText.slice(0, 200));
  const time = _qRelTime(q.createdAt);
  const isQuestion = q.postType === "question";
  const sameQ = isQuestion && q.sameQuestionCount > 0
    ? `<span class="q-same-q-badge" title="Others also asked this">❓×${q.sameQuestionCount}</span>`
    : "";
  const typeB = _qTypeBadge(q.postType || "question");
  const stateB = isQuestion ? _qStateBadge(q.state) : "";
  const resolveBtn = isQuestion && (q.state !== "resolved")
    ? `<button class="btn btn-xs q-resolve-btn" data-action="qInboxResolve" data-arg="${escapeHtml(q.id)}::${escapeHtml(q.playId)}" title="Mark resolved">✓ Resolve</button>`
    : "";
  const replyBtn = `<button class="btn btn-xs btn-primary q-reply-btn" data-action="qInboxOpenPlay" data-arg="${escapeHtml(q.id)}::${escapeHtml(q.playId)}" title="Open play discussion">💬 Open</button>`;

  return `<li class="q-inbox-item" data-q-id="${escapeHtml(q.id)}">
    <div class="q-inbox-item-meta">
      <span class="q-inbox-play">${playLabel}</span>
      ${typeB}
      ${stateB}
      ${sameQ}
    </div>
    <div class="q-inbox-body">${body}${bodyText.length > 200 ? "…" : ""}</div>
    <div class="q-inbox-foot">
      <span class="q-inbox-author">👤 ${author}</span>
      <span class="q-inbox-time">${time}</span>
      <div class="q-inbox-actions">${replyBtn}${resolveBtn}</div>
    </div>
  </li>`;
}

// ── Dashboard card HTML ────────────────────────────────────────────────────────
function _qCardHtml(summary) {
  const open = summary?.open ?? 0;
  const recentComments = summary?.playerCommentsRecent ?? 0;
  const needsReview = summary?.needsReview ?? open;
  const today = summary?.today ?? 0;
  const todayComments = summary?.playerCommentsToday ?? 0;
  const parts = [
    `${open} open question${open === 1 ? "" : "s"}`,
    recentComments ? `${recentComments} recent comment${recentComments === 1 ? "" : "s"}` : "",
    today || todayComments ? `${today + todayComments} today` : "",
  ].filter(Boolean);
  const subText = parts.join(" · ");
  const subLine = subText ? `<div class="dash-card-sub">${escapeHtml(subText)}</div>` : "";
  return `
    <div class="dash-card dash-card-questions" id="dashQuestionsCard">
      <div class="dash-card-icon">❓</div>
      <div class="dash-card-info">
        <div class="dash-card-value" id="dashQuestionsValue">${needsReview}</div>
        <div class="dash-card-label">Player Inbox</div>
        ${subLine}
        <button class="dash-card-link" data-action="openQuestionInbox" data-arg="open">Review →</button>
      </div>
    </div>`;
}

// ── Refresh dashboard card ─────────────────────────────────────────────────────
async function refreshQuestionsCard() {
  // Only for coaches
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (!user || (user.role !== "coach" && user.role !== "admin")) return;

  try {
    const res = await fetch("/api/questions?summary=1", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;
    _qSummary = data.summary;

    // Find or create the card
    let card = document.getElementById("dashQuestionsCard");
    if (!card) {
      const cardsEl = document.getElementById("dashCards");
      if (!cardsEl) return;
      const div = document.createElement("div");
      div.innerHTML = _qCardHtml(data.summary).trim();
      cardsEl.appendChild(div.firstElementChild);
    } else {
      const val = card.querySelector("#dashQuestionsValue");
      if (val) val.textContent = data.summary.needsReview ?? data.summary.open ?? "—";
      let sub = card.querySelector(".dash-card-sub");
      const open = data.summary.open ?? 0;
      const recentComments = data.summary.playerCommentsRecent ?? 0;
      const today = (data.summary.today ?? 0) + (data.summary.playerCommentsToday ?? 0);
      const parts = [
        `${open} open question${open === 1 ? "" : "s"}`,
        recentComments ? `${recentComments} recent comment${recentComments === 1 ? "" : "s"}` : "",
        today ? `${today} today` : "",
      ].filter(Boolean);
      if (!sub && parts.length) {
        const label = card.querySelector(".dash-card-label");
        if (label) {
          sub = document.createElement("div");
          sub.className = "dash-card-sub";
          label.insertAdjacentElement("afterend", sub);
        }
      }
      if (sub) sub.textContent = parts.join(" · ");
    }
  } catch (_) {
    // Silently ignore — non-critical card
  }
}

// ── Overlay open/close ─────────────────────────────────────────────────────────
function openQuestionInbox(state, trigger) {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (!user || (user.role !== "coach" && user.role !== "admin")) return;

  _qState = state || "open";
  _qType = "all";
  _qSort = "newest";
  _qOffset = 0;
  _qHasMore = false;

  const overlay = document.getElementById("qInboxOverlay");
  if (!overlay) return;
  const bodyEl = document.getElementById("qInboxBody");
  const closeButton = overlay.querySelector(".q-inbox-close");

  clearTimeout(_qInboxCloseTimer);
  _qInboxCloseTimer = null;

  // Sync select elements
  const stateSelect = document.getElementById("qInboxStateFilter");
  const typeSelect = document.getElementById("qInboxTypeFilter");
  const sortSelect = document.getElementById("qInboxSort");
  if (stateSelect) stateSelect.value = _qState;
  if (typeSelect) typeSelect.value = _qType;
  if (sortSelect) sortSelect.value = _qSort;

  overlay.classList.add("is-open");
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  overlay.removeAttribute("inert");
  document.body.classList.add("q-inbox-open");

  // The Inbox is a blocking coach task surface, not a decorative side panel.
  // Register it before loading results so focus, Escape, body locking, and its
  // one deliberate scroll owner all survive slow list fetches and iPad keyboard
  // changes. The explicit trigger preserves return focus on touch browsers,
  // where tapping a button does not consistently move DOM focus first.
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "qInboxOverlay",
      blocking: true,
      safeArea: true,
      scrollElement: bodyEl || overlay,
      initialFocus: closeButton || overlay,
      onEscape: () => closeQuestionInbox(),
      returnFocus: trigger instanceof HTMLElement ? trigger : undefined,
    });
  } else {
    closeButton?.focus?.({ preventScroll: true });
  }

  _loadQInbox();
}

function closeQuestionInbox(options = {}) {
  const overlay = document.getElementById("qInboxOverlay");
  if (!overlay) return;
  clearTimeout(_qInboxCloseTimer);
  _qInboxCloseTimer = null;
  if (typeof closeLayer === "function") {
    // Release the managed layer before making this persistent DOM inert so the
    // original coach action remains a valid return-focus target.
    closeLayer("qInboxOverlay", { returnFocus: options.returnFocus !== false });
  }
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  document.body.classList.remove("q-inbox-open");
  _qInboxCloseTimer = setTimeout(() => {
    if (!overlay.classList.contains("is-open")) overlay.hidden = true;
  }, 280);
}

// ── Load questions ─────────────────────────────────────────────────────────────
async function _loadQInbox(append = false) {
  if (_qLoading) return;
  _qLoading = true;

  const list = document.getElementById("qInboxList");
  const bodyEl = document.getElementById("qInboxBody");
  if (!list || !bodyEl) { _qLoading = false; return; }

  if (!append) {
    _qOffset = 0;
    list.innerHTML = `<li class="q-inbox-loading">Loading questions…</li>`;
  }

  try {
    const params = new URLSearchParams({
      type: _qType,
      state: _qState,
      sort: _qSort,
      limit: Q_PAGE_SIZE,
      offset: _qOffset,
    });
    const res = await fetch(`/api/questions?${params}`, { credentials: "same-origin" });
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || "Failed to load questions.");

    if (!append) {
      // Update summary badge in filters area
      _qSummary = data.summary;
      _renderQSummaryBadges(data.summary);
    }

    const questions = data.questions || [];
    _qHasMore = !!data.hasMore;
    _qOffset += questions.length;

    if (!append) {
      if (questions.length === 0) {
        list.innerHTML = `<li class="q-inbox-empty">No ${_qType === "comments" ? "player comments" : "player inbox items"}.</li>`;
      } else {
        list.innerHTML = questions.map(_qItemHtml).join("");
      }
    } else {
      const existing = list.querySelector(".q-inbox-load-more, .q-inbox-empty");
      if (existing) existing.remove();
      list.insertAdjacentHTML("beforeend", questions.map(_qItemHtml).join(""));
    }

    // Load more button
    const loadMoreEl = list.querySelector(".q-inbox-load-more");
    if (loadMoreEl) loadMoreEl.remove();
    if (_qHasMore) {
      list.insertAdjacentHTML("beforeend",
        `<li class="q-inbox-load-more"><button class="btn btn-sm" data-action="loadMoreQInbox">Load more…</button></li>`);
    }
  } catch (err) {
    list.innerHTML = `<li class="q-inbox-error">Error: ${escapeHtml(err.message)} <button class="btn btn-sm" data-action="retryQInbox">Retry</button></li>`;
  } finally {
    _qLoading = false;
  }
}

function _renderQSummaryBadges(summary) {
  const el = document.getElementById("qInboxSummary");
  if (!el || !summary) return;
  const parts = [
    `<span class="q-sum-badge q-sum-open" data-action="qInboxStateChanged" data-arg="open" title="Open questions">${summary.open ?? 0} Open</span>`,
    summary.playerCommentsRecent > 0
      ? `<span class="q-sum-badge q-sum-comments" data-action="qInboxTypeChanged" data-arg="comments" title="Recent player comments">${summary.playerCommentsRecent} Comments</span>`
      : "",
    summary.answered > 0
      ? `<span class="q-sum-badge q-sum-answered" data-action="qInboxStateChanged" data-arg="answered" title="Answered, not yet resolved">${summary.answered} Answered</span>`
      : "",
    summary.resolved > 0
      ? `<span class="q-sum-badge q-sum-resolved" data-action="qInboxStateChanged" data-arg="resolved" title="Resolved questions">${summary.resolved} Resolved</span>`
      : "",
    `<span class="q-sum-badge q-sum-all" data-action="qInboxStateChanged" data-arg="" title="All active questions">All</span>`,
  ];
  el.innerHTML = parts.join("");
}

// ── Filter / sort handlers ─────────────────────────────────────────────────────
function qInboxTypeChanged(value) {
  _qType = value || "all";
  const typeSelect = document.getElementById("qInboxTypeFilter");
  if (typeSelect) typeSelect.value = _qType;
  _loadQInbox(false);
}

function qInboxStateChanged(value) {
  _qState = value ?? "";
  // Sync the select
  const stateSelect = document.getElementById("qInboxStateFilter");
  if (stateSelect) stateSelect.value = _qState;
  _loadQInbox(false);
}

function qInboxSortChanged(value) {
  _qSort = value || "newest";
  _loadQInbox(false);
}

function loadMoreQInbox() {
  _loadQInbox(true);
}

function retryQInbox() {
  _loadQInbox(false);
}

// ── Inline actions ─────────────────────────────────────────────────────────────

/** Open the play's discussion panel — close inbox, navigate to play */
function qInboxOpenPlay(arg) {
  if (!arg) return;
  const sep = arg.indexOf("::");
  const playId = sep >= 0 ? arg.slice(sep + 2) : arg;
  closeQuestionInbox({ returnFocus: false });
  setTimeout(() => {
    if (typeof openDiscussionForPlayId === "function") {
      openDiscussionForPlayId(playId);
    }
  }, 300);
}

/** Inline resolve — PATCH question state to "resolved" */
async function qInboxResolve(arg) {
  if (!arg) return;
  const sep = arg.indexOf("::");
  const postId = sep >= 0 ? arg.slice(0, sep) : arg;
  if (!postId) return;

  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve" }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Could not resolve question.", { type: "error" }); return; }

    // Update the item in the list
    const item = document.querySelector(`.q-inbox-item[data-q-id="${CSS.escape(postId)}"]`);
    if (item) {
      const meta = item.querySelector(".q-inbox-item-meta");
      const badge = meta?.querySelector(".q-state-badge");
      if (badge) badge.outerHTML = _qStateBadge("resolved");
      const resolveBtn = item.querySelector(".q-resolve-btn");
      if (resolveBtn) resolveBtn.remove();
    }

    showToast("Question resolved.", { type: "success", duration: 2500 });
    // Refresh summary badge counts
    refreshQuestionsCard().catch(() => { });
  } catch (err) {
    showToast("Network error resolving question.", { type: "error" });
  }
}
