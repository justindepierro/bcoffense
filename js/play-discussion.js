/**
 * play-discussion.js
 * Discussion feed for the Play Workflow panel.
 *
 * Entry point: renderDiscussionSection(play, containerEl)
 * Called from openPlayWorkflowPanel() in playbook-render.js.
 */

// ── Play ID ────────────────────────────────────────────────────────────────────

/**
 * Returns a stable, URL-safe canonical ID for a play.
 * Uses play._id if present, otherwise derives from key fields.
 */
function getPlayThreadId(play) {
  if (play && play._id) return encodeURIComponent(play._id);
  const key = [
    String(play?.personnel || ""),
    String(play?.formation || ""),
    String(play?.play || ""),
  ].join("::");
  return encodeURIComponent(key);
}

// ── Current auth user ───────────────────────────────────────────────────────────
// auth.js exposes window.getCurrentAuthUser(); window.currentAuthUser is never set.
function _discAuthUser() {
  return typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
}
function _discIsStaff() {
  const role = _discAuthUser()?.role;
  return role === "coach" || role === "admin" || role === "assistant";
}

// ── Relative time ─────────────────────────────────────────────────────────────

function _discRelTime(unixSec) {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function _discExactTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleString();
}

// ── Avatar / badges ───────────────────────────────────────────────────────────

function _discInitials(name) {
  return String(name || "?").split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}

const _DISC_ROLE_COLORS = {
  admin: "var(--color-danger)",
  coach: "var(--color-primary)",
  player: "var(--color-success)",
};

// ── Reaction helpers ──────────────────────────────────────────────────────────

const _REACTION_META = {
  thumbs_up: { emoji: "👍", label: "Like" },
  thumbs_down: { emoji: "😕", label: "Still Confused" },
  heart: { emoji: "❤️", label: "Love it" },
  football: { emoji: "🏈", label: "Great play" },
  gold_medal: { emoji: "🥇", label: "Gold" },
  six: { emoji: "6️⃣", label: "Touchdown" },
  happy: { emoji: "😀", label: "Happy" },
  strong: { emoji: "💪", label: "Strong" },
  got_it: { emoji: "✅", label: "Got It" },
  same_question: { emoji: "❓", label: "Same question" },
  helpful: { emoji: "🙌", label: "Helpful" },
};

const _REACTION_SUMMARY_ORDER = [
  "thumbs_up", "heart", "football", "helpful", "got_it",
  "same_question", "gold_medal", "six", "happy", "strong", "thumbs_down",
];
const _REACTION_PICKER_ORDER = [
  "thumbs_up", "heart", "football", "gold_medal",
  "six", "happy", "strong", "got_it",
  "same_question", "helpful", "thumbs_down",
];

function _discReactionsHtml(postId, reactions, excludeKey = null) {
  const reactionMap = {};
  for (const r of (reactions || [])) reactionMap[r.key] = r;

  const active = _REACTION_SUMMARY_ORDER
    .map((key) => ({ key, ...(reactionMap[key] || { count: 0, mine: false }) }))
    .filter((r) => r.count > 0 && r.key !== excludeKey)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const mineReaction = (reactions || []).find((r) => r.mine && r.key !== excludeKey);

  const chips = active.map((r) => {
    const meta = _REACTION_META[r.key] || { emoji: "❓", label: r.key };
    return (
      `<button class="disc-react-chip${r.mine ? " is-mine" : ""}"` +
      ` data-action="toggleDiscReaction" data-arg="${escapeHtml(postId)}::${r.key}"` +
      ` title="${escapeHtml(meta.label)}" aria-pressed="${r.mine ? "true" : "false"}">` +
      meta.emoji + ` <span class="disc-react-count">${r.count}</span></button>`
    );
  }).join("");

  const openBtn = `<button class="disc-react-open-btn" data-action="openDiscReactionPicker" data-arg="${escapeHtml(postId)}" aria-label="React">+ React</button>`;
  const seeAllBtn = active.length > 0
    ? `<button class="disc-react-see-all" data-action="openDiscReactionBreakdown" data-arg="${escapeHtml(postId)}" title="See who reacted" aria-label="See all reactions">⋯</button>`
    : "";
  const userReactionAttr = mineReaction ? ` data-user-reaction="${escapeHtml(mineReaction.key)}"` : "";
  return `<div class="disc-reactions"${userReactionAttr}>${chips}${seeAllBtn}${openBtn}</div>`;
}

// ── Reaction picker ───────────────────────────────────────────────────────────

let _discPickerPostId = null;
let _discPickerTrigger = null;
let _discPickerEscHandler = null;
let _discPickerArrowHandler = null;

function openDiscReactionPicker(postId) {
  _discPickerPostId = postId;
  _discPickerTrigger = document.querySelector(`[data-action="openDiscReactionPicker"][data-arg="${escapeHtml(postId)}"]`);

  let picker = document.getElementById("discReactionPicker");
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "discReactionPicker";
    picker.className = "disc-reaction-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Choose a reaction");
    document.body.appendChild(picker);
  }

  // Find user's current reaction for this post from the reactions bar
  const reactionsEl = document.querySelector(`[data-post-id="${escapeHtml(postId)}"] .disc-reactions`);
  const userReaction = reactionsEl?.dataset?.userReaction || null;

  const btns = _REACTION_PICKER_ORDER.map((key) => {
    const meta = _REACTION_META[key] || { emoji: "?", label: key };
    const isMine = key === userReaction;
    return (
      `<button class="disc-picker-btn${isMine ? " is-mine" : ""}" data-action="selectDiscReaction" data-arg="${escapeHtml(postId)}::${key}"` +
      ` title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)}"` +
      ` aria-pressed="${isMine ? "true" : "false"}">` +
      `<span class="disc-picker-emoji">${meta.emoji}</span>` +
      `<span class="disc-picker-label">${escapeHtml(meta.label)}</span>` +
      `</button>`
    );
  }).join("");

  const closeBtn = `<button class="disc-picker-close" data-action="closeDiscReactionPicker" aria-label="Close">✕</button>`;
  setInnerHTML(picker, closeBtn + `<div class="disc-picker-grid" role="group" aria-label="Reaction options">${btns}</div>`);

  // Bottom sheet on very narrow screens; use fixed positioning throughout
  const useBottomSheet = window.innerWidth <= 480;
  picker.classList.toggle("is-bottom-sheet", useBottomSheet);
  picker.classList.add("visible");

  if (!useBottomSheet && _discPickerTrigger) {
    const rect = _discPickerTrigger.getBoundingClientRect();
    const pickerH = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= pickerH + 10
      ? rect.bottom + 6
      : rect.top - pickerH - 6;
    picker.style.top = `${Math.max(8, top)}px`;
    picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`;
  } else {
    picker.style.top = "";
    picker.style.left = "";
  }

  // Focus: user's current reaction button, or the first button
  const focusBtn = picker.querySelector(".disc-picker-btn.is-mine") || picker.querySelector(".disc-picker-btn");
  focusBtn?.focus();

  // Escape key handler
  if (_discPickerEscHandler) document.removeEventListener("keydown", _discPickerEscHandler);
  _discPickerEscHandler = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeDiscReactionPicker(); } };
  document.addEventListener("keydown", _discPickerEscHandler);

  // Arrow key navigation (4-column grid)
  if (_discPickerArrowHandler) document.removeEventListener("keydown", _discPickerArrowHandler);
  _discPickerArrowHandler = (e) => {
    const p = document.getElementById("discReactionPicker");
    if (!p?.classList.contains("visible")) return;
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const pickerBtns = Array.from(p.querySelectorAll(".disc-picker-btn"));
    const idx = pickerBtns.indexOf(document.activeElement);
    if (idx < 0) { pickerBtns[0]?.focus(); return; }
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % pickerBtns.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + pickerBtns.length) % pickerBtns.length;
    else if (e.key === "ArrowDown") next = Math.min(idx + 4, pickerBtns.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(idx - 4, 0);
    pickerBtns[next]?.focus();
  };
  document.addEventListener("keydown", _discPickerArrowHandler);
}

function closeDiscReactionPicker() {
  const picker = document.getElementById("discReactionPicker");
  picker?.classList.remove("visible");
  picker?.classList.remove("is-bottom-sheet");
  _discPickerPostId = null;
  if (_discPickerEscHandler) {
    document.removeEventListener("keydown", _discPickerEscHandler);
    _discPickerEscHandler = null;
  }
  if (_discPickerArrowHandler) {
    document.removeEventListener("keydown", _discPickerArrowHandler);
    _discPickerArrowHandler = null;
  }
  // Restore focus to the trigger button that opened the picker
  _discPickerTrigger?.focus();
  _discPickerTrigger = null;
}

async function selectDiscReaction(arg) {
  closeDiscReactionPicker();
  await toggleDiscReaction(arg);
}

// Close picker on outside click
document.addEventListener("click", (e) => {
  const picker = document.getElementById("discReactionPicker");
  if (!picker || !picker.classList.contains("visible")) return;
  if (!picker.contains(e.target) && !e.target.closest("[data-action='openDiscReactionPicker']")) {
    closeDiscReactionPicker();
  }
});

// ── Question state helpers ────────────────────────────────────────────────────

const _Q_STATE_META = {
  open: { label: "Open", icon: "❓", cls: "open" },
  answered: { label: "Answered", icon: "✅", cls: "answered" },
  resolved: { label: "Resolved", icon: "✅", cls: "resolved" },
  reopened: { label: "Reopened", icon: "🔄", cls: "reopened" },
};

const _DISC_Q_CATEGORIES = {
  assignment: "Assignment",
  technique: "Technique",
  front: "Front",
  coverage: "Coverage",
  motion: "Motion",
  protection: "Protection",
  read: "Read",
};

function _discQCategoryBadge(category) {
  if (!category) return "";
  const label = _DISC_Q_CATEGORIES[category] || category;
  return `<span class="disc-q-cat-badge disc-q-cat-badge--${escapeHtml(category)}">${escapeHtml(label)}</span>`;
}

function discToggleQCategory(e) {
  const el = (e && e.target) ? e.target : e;
  const row = el?.closest(".disc-composer")?.querySelector(".disc-q-category-row");
  if (row) row.style.display = el?.value === "question" ? "" : "none";
}

function _discQStateBadge(state) {
  if (!state || state === "open") return "";
  const m = _Q_STATE_META[state] || { label: state, icon: "❓", cls: "open" };
  return `<span class="disc-q-state disc-q-state--${m.cls}">${m.icon} ${escapeHtml(m.label)}</span>`;
}

function _discRoleBadge(role) {
  if (!role || role === "player") return "";
  const label = { admin: "Admin", coach: "Coach", assistant: "Asst. Coach" }[role] || String(role);
  return `<span class="disc-role-badge disc-role-badge--${escapeHtml(role)}">${escapeHtml(label)}</span>`;
}

// ── Session helper ────────────────────────────────────────────────────────────

// Cached current user D1 ID — fetched once per session
let _discCurrentUserId = undefined;

async function _discEnsureUserId() {
  if (_discCurrentUserId !== undefined) return;
  try {
    const res = await fetch("/auth/me");
    const data = await res.json();
    _discCurrentUserId = data?.user?.d1UserId || null;
  } catch (_) {
    _discCurrentUserId = null;
  }
}

// ── Module state ──────────────────────────────────────────────────────────────

let _discEditState = null;       // { postId, original }
let _discLastPlayId = null;      // for retryDiscussion()
let _discLastPlaySig = null;
let _discScriptContext = null;   // { periodName, playIndex } — set by openScriptDiscussion

// ── Main render ───────────────────────────────────────────────────────────────

/**
 * Render the Discussion section into `container`.
 * Appends a disc-section div and async-populates it.
 */
/**
 * Look up the current player's primary position from the local team roster.
 * Returns a string like "QB" or null if not found / not a player.
 */
/**
 * Return the period label for a script play index (walks backwards to find the separator).
 */
function _discGetScriptPeriodForIdx(idx) {
  if (typeof script === "undefined" || !Array.isArray(script)) return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (script[i]?.isSeparator) return script[i].label || "Period";
  }
  return null;
}

function _discGetPlayerPosition() {
  const user = _discAuthUser();
  if (!user || (user.role !== "player")) return null;
  if (typeof storageManager === "undefined" || typeof STORAGE_KEYS === "undefined") return null;
  const roster = storageManager.get(STORAGE_KEYS.TEAM_ROSTER, []);
  if (!Array.isArray(roster)) return null;
  const label = (user.label || user.username || "").toLowerCase();
  const entry = roster.find((p) => p.name && p.name.toLowerCase() === label);
  return entry?.position ? String(entry.position).toUpperCase() : null;
}

async function renderDiscussionSection(play, container) {
  if (!play || !container) return;

  const playId = getPlayThreadId(play);
  const playSig = [play.formation, play.play].filter(Boolean).join(" ");
  _discLastPlayId = playId;
  _discLastPlaySig = playSig;

  const section = document.createElement("div");
  section.className = "pb-wf-section disc-section";
  section.dataset.playId = playId;
  section.innerHTML =
    `<div class="pb-wf-s-header">` +
    `<span class="pb-wf-s-icon">💬</span>` +
    `<span class="pb-wf-s-title">Discussion</span>` +
    `<span class="disc-count" id="discCount"></span>` +
    `</div>` +
    `<div class="disc-body" id="discBody"><p class="disc-loading">Loading…</p></div>`;
  container.appendChild(section);

  await _discEnsureUserId();
  await _discLoadBody(playId, playSig, document.getElementById("discBody"));
}

async function _discLoadBody(playId, playSig, bodyEl) {
  if (!bodyEl) return;
  try {
    const res = await fetch(`/api/threads/${playId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to load");

    const countEl = document.getElementById("discCount");
    if (countEl && data.thread) countEl.textContent = String(data.thread.total);

    _discRenderBody(bodyEl, data, playId, playSig);
    _discApplyDeepLink(playId);
  } catch (err) {
    setInnerHTML(
      bodyEl,
      `<p class="disc-error">Couldn't load discussion: ${escapeHtml(err.message)}</p>` +
      `<button class="btn btn-xs" data-action="retryDiscussion">Retry</button>`,
    );
  }
}

function _discRenderBody(container, data, playId, playSig) {
  const { thread, posts, hasMore } = data;
  const isLocked = thread?.locked;
  const userRole = _discAuthUser()?.role;
  const isStaff = userRole === "coach" || userRole === "admin" || userRole === "assistant";
  const canPost = !isLocked || isStaff;

  // Coach moderation queue banner
  const modBanner = isStaff
    ? `<div class="disc-mod-banner" id="discModBanner" style="display:none">` +
    `<span class="disc-mod-badge" id="discModCount"></span>` +
    `<button class="btn btn-xs" data-action="openDiscModerationQueue">Review</button>` +
    `</div>`
    : "";

  const postsHtml = posts.length
    ? posts.map((p) => _discPostHtml(p, playId)).join("")
    : `<p class="disc-empty">No comments yet. Be the first!</p>`;

  const filterBar = posts.length
    ? `<div class="disc-filter-bar" role="group" aria-label="Filter discussion">` +
    `<button class="disc-filter-btn active" data-action="setDiscFilter" data-arg="all::${escapeHtml(playId)}" aria-pressed="true">All</button>` +
    `<button class="disc-filter-btn" data-action="setDiscFilter" data-arg="comment::${escapeHtml(playId)}" aria-pressed="false">💬 Comments</button>` +
    `<button class="disc-filter-btn" data-action="setDiscFilter" data-arg="question::${escapeHtml(playId)}" aria-pressed="false">❓ Questions</button>` +
    `</div>`
    : "";

  const loadMore = hasMore && posts.length
    ? `<button class="btn btn-xs disc-load-more"
         data-action="loadMoreDiscussion"
         data-play-id="${escapeHtml(playId)}"
         data-cursor="${escapeHtml(posts[posts.length - 1]?.id || "")}">Load more…</button>`
    : "";

  const composer = canPost ? _discComposerHtml(playId, playSig) : `<p class="disc-locked">🔒 Thread is locked.</p>`;

  // Monitoring notice — only for non-staff (players)
  const monitoringNotice = !isStaff
    ? `<p class="disc-monitoring-notice" role="note">Team communications are reviewed by coaching staff. Messages that don't meet team standards may be held or removed.</p>`
    : "";

  const lockCtrl = isStaff && thread
    ? `<div class="disc-thread-controls">` +
    `<button class="btn btn-xs disc-lock-btn" data-action="toggleDiscThreadLock"` +
    ` data-arg="${escapeHtml(playId)}::${isLocked ? "0" : "1"}">` +
    `${isLocked ? "🔓 Unlock Thread" : "🔒 Lock Thread"}</button>` +
    `</div>`
    : "";

  // Player-only "Ask a Question" quick shortcut above the composer
  const askCoachBtn = (!isStaff && canPost)
    ? `<button class="btn btn-xs disc-ask-coach-btn" data-action="discAskCoachQuestion" data-arg="${escapeHtml(playId)}"` +
    ` aria-label="Ask the coach a question about this play">❓ Ask a Question</button>`
    : "";

  setInnerHTML(
    container,
    modBanner +
    filterBar +
    `<div class="disc-posts" id="discPosts-${escapeHtml(playId)}" role="feed" aria-label="Discussion thread">${postsHtml}</div>` +
    loadMore +
    askCoachBtn +
    composer +
    monitoringNotice +
    lockCtrl,
  );

  // Auto-restore previously expanded reply threads from sessionStorage
  requestAnimationFrame(() => {
    container.querySelectorAll(".disc-load-replies[data-action='loadMoreDiscReplies']").forEach((btn) => {
      const pid = btn.dataset.arg;
      if (!pid) return;
      try { if (sessionStorage.getItem(`disc-exp-${pid}`)) loadMoreDiscReplies(null, btn); } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
    });
    // Wire attachment file inputs in the root composer
    _discWireComposerAttachments(container);
  });

  // Async: check moderation queue count for coaches
  if (isStaff) _discCheckModerationQueue();
}

function _discAttachmentsHtml(attachments) {
  if (!attachments || attachments.length === 0) return "";
  const items = attachments.map((a) => {
    const src = `/api/attachments/${escapeHtml(a.id)}`;
    const caption = a.caption ? `<span class="disc-attachment-caption">${escapeHtml(a.caption)}</span>` : "";
    const badge = a.type === "markup"
      ? `<span class="disc-attachment-badge disc-attachment-badge--markup">✏️ Play Markup</span>`
      : `<span class="disc-attachment-badge disc-attachment-badge--image">📎 Image</span>`;
    return (
      `<div class="disc-attachment-item">` +
      badge +
      `<img class="disc-attachment-thumb" src="${src}" alt="${a.caption ? escapeHtml(a.caption) : "Attachment"}"` +
      ` data-action="openDiscAttachmentViewer" data-arg="${escapeHtml(a.id)}::${escapeHtml(a.caption || "")}"` +
      ` loading="lazy">` +
      caption +
      `</div>`
    );
  }).join("");
  return `<div class="disc-attachments">${items}</div>`;
}

function _discPostHtml(p, playId, isReply = false) {
  const mine = p.authorId === _discCurrentUserId;
  const isStaff = _discIsStaff();
  const canAct = mine || isStaff;
  const isQuestion = p.postType === "question";
  const isResolved = p.questionState === "resolved" || p.questionState === "answered";
  const isOfficial = p.isOfficial === true;

  // Player can request reopen on their own resolved question
  const canReopen = isQuestion && mine && !isStaff && isResolved;
  const reopenBtn = canReopen
    ? `<button class="disc-action-btn" data-action="resolveDiscPost" data-arg="${escapeHtml(p.id)}::reopened" title="Request reopen">↩ Reopen</button>`
    : "";

  const replyBtn = !isReply
    ? `<button class="disc-reply-btn" data-action="openDiscReplyComposer" data-arg="${escapeHtml(p.id)}::${escapeHtml(playId)}" title="Reply">↩ Reply</button>`
    : "";

  const editBtn = canAct
    ? `<button class="disc-action-btn" data-action="startEditPost" data-arg="${escapeHtml(p.id)}" title="Edit">✏️</button>`
    : "";
  const deleteBtn = canAct
    ? `<button class="disc-action-btn disc-action-btn--danger" data-action="deleteDiscPost" data-arg="${escapeHtml(p.id)}" data-play-id="${escapeHtml(playId)}" title="Delete">🗑</button>`
    : "";

  const resolveBtn = (isStaff && isQuestion)
    ? (isResolved
      ? `<button class="disc-action-btn" data-action="resolveDiscPost" data-arg="${escapeHtml(p.id)}::reopened" title="Reopen">🔄 Reopen</button>`
      : `<button class="disc-action-btn disc-action-btn--resolve" data-action="resolveDiscPost" data-arg="${escapeHtml(p.id)}::resolved" title="Resolve">✅ Resolve</button>`)
    : "";

  const copyLinkBtn = isQuestion
    ? `<button class="disc-action-btn" data-action="discCopyQuestionLink" data-arg="${escapeHtml(p.id)}" title="Copy link to this question">🔗 Copy Link</button>`
    : "";

  // Coach-only: pin a reply as the official answer
  const pinBtn = (isStaff && isReply)
    ? `<button class="disc-action-btn disc-action-btn--pin${isOfficial ? " is-official" : ""}"
        data-action="markDiscPostOfficial" data-arg="${escapeHtml(p.id)}::${escapeHtml(playId)}"
        title="${isOfficial ? "Unpin official answer" : "Mark as official answer"}">
        📌 ${isOfficial ? "Unpin" : "Official"}</button>`
    : "";

  // Moderation — held posts show a neutral placeholder to non-authors
  const isMine = p.authorId === _discCurrentUserId;
  const bodyContent = (p.moderationStatus === "pending_review" && !isStaff && !isMine)
    ? `<em class="disc-mod-placeholder">This post is under review.</em>`
    : escapeHtml(p.body);

  const qStateBadge = isQuestion ? _discQStateBadge(p.questionState) : "";
  const qCatBadge = isQuestion ? _discQCategoryBadge(p.questionCategory) : "";
  const typeIcon = isQuestion ? `<span class="disc-type-icon">❓</span>` : "";
  const coachHighlight = (p.authorRole === "coach" || p.authorRole === "admin" || p.authorRole === "assistant") ? " disc-post--coach" : "";

  // ── Prominent "I Have This Question Too" button for question root posts ──
  const sameQReaction = (isQuestion && !isReply)
    ? (p.reactions || []).find((r) => r.key === "same_question")
    : null;
  const sameQCount = sameQReaction?.count || 0;
  const userHasSameQ = sameQReaction?.mine || false;
  const sameQBtn = (isQuestion && !isReply)
    ? `<button class="disc-same-q-btn${userHasSameQ ? " is-mine" : ""}"` +
    ` data-action="toggleDiscReaction" data-arg="${escapeHtml(p.id)}::same_question"` +
    ` aria-pressed="${userHasSameQ ? "true" : "false"}" title="I have this question too">` +
    `❓ I have this${sameQCount > 1 ? ` <span class="disc-same-q-count">· ${sameQCount}</span>` : ""}` +
    `</button>`
    : "";

  // ── Actions: Reply always visible; edit/delete/moderate in ⋯ more menu ──
  const inlineActions = replyBtn + sameQBtn;
  const moreItems = [resolveBtn, reopenBtn, pinBtn, copyLinkBtn, editBtn, deleteBtn].filter(Boolean).join("");
  const moreMenu = moreItems
    ? `<details class="disc-more-wrap">` +
    `<summary class="disc-more-btn" title="More options" aria-label="More options">⋯</summary>` +
    `<div class="disc-more-menu">${moreItems}</div></details>`
    : "";
  const actionsHtml = (inlineActions || moreMenu)
    ? `<div class="disc-post-actions">${inlineActions}${moreMenu}</div>`
    : `<div class="disc-post-actions"></div>`;

  // Render inline replies
  const replies = p.replies || [];
  const replyCount = p.replyCount || 0;
  const shownCount = replies.length;
  const hiddenCount = replyCount - shownCount;

  const repliesHtml = replies.length
    ? `<div class="disc-replies" id="disc-replies-${escapeHtml(p.id)}">` +
    replies.map((r) => _discPostHtml(r, playId, true)).join("") +
    (hiddenCount > 0
      ? `<button class="btn btn-xs disc-load-replies" data-action="loadMoreDiscReplies"` +
      ` data-arg="${escapeHtml(p.id)}" data-cursor="${escapeHtml(replies[replies.length - 1]?.id || "")}">` +
      `View ${hiddenCount} more repl${hiddenCount === 1 ? "y" : "ies"}…</button>`
      : "") +
    `</div>`
    : (replyCount > 0
      ? `<div class="disc-replies" id="disc-replies-${escapeHtml(p.id)}">` +
      `<button class="btn btn-xs disc-load-replies" data-action="loadMoreDiscReplies"` +
      ` data-arg="${escapeHtml(p.id)}" data-cursor="">` +
      `View ${replyCount} repl${replyCount === 1 ? "y" : "ies"}…</button>` +
      `</div>`
      : "");

  // Inline reply composer placeholder (rendered on demand)
  const replyComposerPlaceholder = !isReply
    ? `<div class="disc-reply-composer-slot" id="disc-reply-slot-${escapeHtml(p.id)}"></div>`
    : "";

  return (
    `<div class="disc-post${isResolved ? " disc-post--resolved" : ""}${isOfficial ? " disc-post--official" : ""}${coachHighlight}${isReply ? " disc-post--reply" : ""}"` +
    ` id="disc-post-${escapeHtml(p.id)}" data-post-id="${escapeHtml(p.id)}"` +
    ` data-post-type="${escapeHtml(p.postType || "comment")}"` +
    (p.questionCategory ? ` data-q-category="${escapeHtml(p.questionCategory)}"` : "") +
    ` data-is-official="${isOfficial ? "1" : "0"}"` +
    ` role="article"` +
    ` data-author-name="${escapeHtml(p.authorName)}" data-body-text="${escapeHtml((p.body || "").slice(0, 80))}">` +
    `<div class="disc-post-avatar" style="background:${_DISC_ROLE_COLORS[p.authorRole] || "var(--color-text-muted)"}" aria-hidden="true">${escapeHtml(_discInitials(p.authorName))}</div>` +
    `<div class="disc-post-content">` +
    (isOfficial ? `<div class="disc-official-badge">⭐ Official Answer</div>` : "") +
    `<div class="disc-post-meta">` +
    `<span class="disc-author">${escapeHtml(p.authorName)}</span>` +
    _discRoleBadge(p.authorRole) +
    (p.authorPosition ? `<span class="disc-author-pos">${escapeHtml(p.authorPosition)}</span>` : "") +
    typeIcon + qStateBadge + qCatBadge +
    `<span class="disc-time" title="${escapeHtml(_discExactTime(p.createdAt))}">${escapeHtml(_discRelTime(p.createdAt))}</span>` +
    (p.editedAt ? `<span class="disc-edited">(edited)</span>` : "") +
    (p.sourceContext ? `<span class="disc-post-ctx">${escapeHtml(p.sourceContext)}</span>` : "") +
    `</div>` +
    `<div class="disc-post-body" id="disc-body-${escapeHtml(p.id)}">${bodyContent}</div>` +
    _discAttachmentsHtml(p.attachments) +
    _discReactionsHtml(p.id, p.reactions, (isQuestion && !isReply) ? "same_question" : null) +
    actionsHtml +
    `</div>` +
    replyComposerPlaceholder +
    repliesHtml +
    `</div>`
  );
}

function setDiscFilter(arg) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const filter = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

  const postsEl = document.getElementById(`discPosts-${playId}`);
  // Use parentElement — works for both discBody and ppDiscDrawerBody contexts
  const container = postsEl?.parentElement;

  // Update main filter button states
  const filterBar = container?.querySelector(".disc-filter-bar");
  if (filterBar) {
    filterBar.querySelectorAll(".disc-filter-btn").forEach((btn) => {
      const btnFilter = (btn.dataset.arg || "").split("::")[0];
      const isActive = btnFilter === filter;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  if (!postsEl) return;

  // Show/hide sub-category bar for Questions
  const existingQBar = container?.querySelector(".disc-q-cat-filter-bar");
  if (filter === "question") {
    if (!existingQBar) {
      const qBar = document.createElement("div");
      qBar.className = "disc-q-cat-filter-bar";
      qBar.setAttribute("role", "group");
      qBar.setAttribute("aria-label", "Filter by category");
      const categories = [
        { id: "all", label: "All" },
        { id: "assignment", label: "Assignment" },
        { id: "technique", label: "Technique" },
        { id: "front", label: "Front" },
        { id: "coverage", label: "Coverage" },
        { id: "motion", label: "Motion" },
        { id: "protection", label: "Protection" },
        { id: "read", label: "Read" },
      ];
      setInnerHTML(qBar, categories.map((c) =>
        `<button class="disc-q-cat-btn${c.id === "all" ? " active" : ""}" ` +
        `data-action="setDiscQCategory" data-arg="${escapeHtml(c.id)}::${escapeHtml(playId)}" ` +
        `aria-pressed="${c.id === "all" ? "true" : "false"}">${escapeHtml(c.label)}</button>`,
      ).join(""));
      filterBar?.insertAdjacentElement("afterend", qBar) || postsEl.insertAdjacentElement("beforebegin", qBar);
    }
  } else {
    // Remove sub-bar and clear any category-based hiding
    existingQBar?.remove();
    postsEl.querySelectorAll(".disc-post--q-cat-hidden").forEach((p) => p.classList.remove("disc-post--q-cat-hidden"));
  }

  // Show/hide top-level posts and their associated reply areas
  postsEl.querySelectorAll(".disc-post:not(.disc-post--reply)").forEach((post) => {
    const postType = post.dataset.postType || "comment";
    const show = filter === "all" || filter === postType;
    post.hidden = !show;
    const pid = post.dataset.postId || "";
    if (pid) {
      const replySlot = document.getElementById(`disc-reply-slot-${pid}`);
      const replies = document.getElementById(`disc-replies-${pid}`);
      if (replySlot) replySlot.hidden = !show;
      if (replies) replies.hidden = !show;
    }
  });

  // Show "no results" message when all posts are filtered out
  let emptyMsg = postsEl.querySelector(".disc-filter-empty");
  const anyVisible = !postsEl.querySelector(".disc-post:not(.disc-post--reply):not([hidden])");
  if (anyVisible && postsEl.querySelector(".disc-post:not(.disc-post--reply)")) {
    if (!emptyMsg) {
      emptyMsg = document.createElement("p");
      emptyMsg.className = "disc-empty disc-filter-empty";
      postsEl.appendChild(emptyMsg);
    }
    emptyMsg.textContent = filter === "question" ? "No questions in this thread yet." : "No comments in this thread yet.";
  } else {
    emptyMsg?.remove();
  }
}

function setDiscQCategory(arg) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const cat = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

  const postsEl = document.getElementById(`discPosts-${playId}`);
  const container = postsEl?.parentElement;
  const qBar = container?.querySelector(".disc-q-cat-filter-bar");
  if (qBar) {
    qBar.querySelectorAll(".disc-q-cat-btn").forEach((btn) => {
      const btnCat = (btn.dataset.arg || "").split("::")[0];
      const isActive = btnCat === cat;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
  if (!postsEl) return;
  postsEl.querySelectorAll(".disc-post:not(.disc-post--reply)[data-post-type='question']").forEach((post) => {
    const postCat = post.dataset.qCategory || "";
    post.classList.toggle("disc-post--q-cat-hidden", cat !== "all" && postCat !== cat);
  });
}

function _discComposerHtml(playId, playSig, parentPostId = null) {
  const isReply = !!parentPostId;
  const placeholder = isReply ? "Write a reply… (Ctrl+Enter to post)" : "Add a comment… (Ctrl+Enter to post)";
  const idSuffix = isReply ? `reply-${parentPostId}` : playId;
  const isStaff = _discIsStaff();
  const playerPos = !isReply && !isStaff ? _discGetPlayerPosition() : null;
  const gw = (typeof getGameWeek === "function") ? getGameWeek() : null;
  const opponentCtx = (!isReply && gw?.opponentName) ? ` · vs ${escapeHtml(gw.opponentName)}` : "";
  const periodCtx = (!isReply && _discScriptContext?.periodName) ? ` · ${escapeHtml(_discScriptContext.periodName)}` : "";
  const posCtx = (!isReply && (playerPos || opponentCtx || periodCtx))
    ? `<p class="disc-position-ctx" aria-label="Question context">` +
    (playerPos ? `Asking as: <strong>${escapeHtml(playerPos)}</strong>` : "Asking") +
    periodCtx + opponentCtx +
    `</p>`
    : "";
  // Clarification reply type for staff (lets coaches add context without marking question answered)
  const clarifySelect = isReply && isStaff
    ? `<select class="disc-type-select disc-type-select--reply" id="discType-${escapeHtml(idSuffix)}" aria-label="Reply type">` +
    `<option value="comment">Reply</option>` +
    `<option value="coach_clarification">Clarification 📋</option>` +
    `</select>`
    : "";
  const typeSelect = isReply ? clarifySelect :
    `<select class="disc-type-select" id="discType-${escapeHtml(playId)}" aria-label="Post type"
      data-onchange="discToggleQCategory" data-pass="event">` +
    `<option value="comment">Comment</option>` +
    `<option value="question">Question ❓</option>` +
    `</select>` +
    `<div class="disc-q-category-row" style="display:none">` +
    `<select class="disc-cat-select" id="discQCat-${escapeHtml(playId)}" aria-label="Question category">` +
    `<option value="">General</option>` +
    `<option value="assignment">Assignment</option>` +
    `<option value="technique">Technique</option>` +
    `<option value="front">Front</option>` +
    `<option value="coverage">Coverage</option>` +
    `<option value="motion">Motion</option>` +
    `<option value="protection">Protection</option>` +
    `<option value="read">Read</option>` +
    `</select></div>`;

  // Coach-only attachment buttons (hidden input + markup overlay trigger)
  const attachBtns = isStaff
    ? `<div class="disc-composer-attach-row">` +
    `<button class="btn btn-xs disc-attach-btn" data-action="discOpenMarkupOverlay"` +
    ` data-arg="${escapeHtml(idSuffix)}::${escapeHtml(playId)}" title="Annotate play diagram">` +
    `✏️ Mark Up Play</button>` +
    `<label class="btn btn-xs disc-attach-btn" title="Attach image">` +
    `📎 Image` +
    `<input type="file" accept="image/jpeg,image/png,image/webp" class="disc-img-file-input"` +
    ` data-composer-id="${escapeHtml(idSuffix)}" data-play-id="${escapeHtml(playId)}" style="display:none">` +
    `</label>` +
    `<div class="disc-pending-attachment" id="disc-pending-${escapeHtml(idSuffix)}" style="display:none">` +
    `<img class="disc-pending-thumb" id="disc-pending-thumb-${escapeHtml(idSuffix)}" alt="Pending attachment" src="">` +
    `<span class="disc-upload-spinner" id="disc-upload-spinner-${escapeHtml(idSuffix)}" aria-hidden="true"></span>` +
    `<button class="btn btn-xs disc-upload-retry-btn" id="disc-upload-retry-${escapeHtml(idSuffix)}"` +
    ` style="display:none" data-action="discRetryAttachmentUpload" data-arg="${escapeHtml(idSuffix)}">↺ Retry</button>` +
    `<button class="btn btn-xs disc-remove-attach-btn" id="disc-remove-${escapeHtml(idSuffix)}" data-action="discRemovePendingAttachment"` +
    ` data-arg="${escapeHtml(idSuffix)}">✕</button>` +
    `</div>` +
    `</div>`
    : "";

  return (
    `<div class="disc-composer${isReply ? " disc-composer--reply" : ""}">${posCtx}` +
    attachBtns +
    `<textarea class="disc-textarea" id="discCompose-${escapeHtml(idSuffix)}"` +
    ` placeholder="${escapeHtml(placeholder)}" rows="2" maxlength="2000" aria-label="${escapeHtml(placeholder)}"></textarea>` +
    `<div class="disc-composer-actions">` +
    typeSelect +
    `<span class="disc-char-count" id="discChars-${escapeHtml(idSuffix)}">0 / 2000</span>` +
    (isReply
      ? `<button class="btn btn-xs" data-action="closeDiscReplyComposer" data-arg="${escapeHtml(parentPostId)}">Cancel</button>` +
      `<button class="btn btn-xs btn-primary" data-action="submitDiscReply"` +
      ` data-post-id="${escapeHtml(parentPostId)}" data-play-id="${escapeHtml(playId)}" data-play-sig="${escapeHtml(playSig)}">Reply</button>`
      : `<button class="btn btn-sm btn-primary" data-action="submitDiscPost"` +
      ` data-play-id="${escapeHtml(playId)}" data-play-sig="${escapeHtml(playSig)}">Post</button>`) +
    `</div></div>`
  );
}

// ── Global actions ────────────────────────────────────────────────────────────
// submitDiscPost, deleteDiscPost, loadMoreDiscussion are in _ELEMENT_FNS
// so they receive (arg, element).  startEditPost receives (arg) only.

async function submitDiscPost(arg, el) {
  // When called from _ELEMENT_FNS with no data-arg, element is first param
  const btn = (el instanceof Element) ? el : (arg instanceof Element ? arg : null);
  const playId = btn?.dataset?.playId;
  const playSig = btn?.dataset?.playSig || "";
  if (!playId) return;

  const textarea = document.getElementById(`discCompose-${playId}`);
  const typeSelect = document.getElementById(`discType-${playId}`);
  if (!textarea) return;

  const body = textarea.value.trim();
  if (!body) { textarea.focus(); return; }

  if (!navigator.onLine) {
    showToast("You're offline — reconnect and try again.", { duration: 4000, type: "warning" });
    return;
  }

  btn.disabled = true;
  btn.textContent = "Posting…";

  // ── Optimistic render ──────────────────────────────────────────────────────
  const optimisticPost = {
    id: `opt-${Date.now()}`,
    body,
    postType: typeSelect?.value || "comment",
    questionCategory: document.getElementById(`discQCat-${playId}`)?.value || "",
    authorName: _discAuthUser()?.name || _discAuthUser()?.username || "You",
    authorRole: _discAuthUser()?.role || "player",
    authorId: _discCurrentUserId || "me",
    reactions: [], replyCount: 0, replies: [],
    createdAt: new Date().toISOString(),
  };
  const list = document.getElementById(`discPosts-${playId}`);
  let optimisticNode = null;
  if (list) {
    list.querySelector(".disc-empty")?.remove();
    const wrap = document.createElement("div");
    wrap.innerHTML = _discPostHtml(optimisticPost, playId);
    optimisticNode = wrap.firstElementChild;
    if (optimisticNode) {
      optimisticNode.classList.add("disc-post--pending");
      list.appendChild(optimisticNode);
      optimisticNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
  // Clear composer immediately for snappy feel
  textarea.value = "";
  const charElOpt = document.getElementById(`discChars-${playId}`);
  if (charElOpt) { charElOpt.textContent = "0 / 2000"; charElOpt.classList.remove("disc-char-warn", "disc-char-limit"); }

  try {
    const pendingAttach = _discPendingAttachments.get(playId) || null;
    const res = await fetch(`/api/threads/${playId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        post_type: typeSelect?.value || "comment",
        question_category: document.getElementById(`discQCat-${playId}`)?.value || null,
        play_signature: playSig,
        attachment: pendingAttach || undefined,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      optimisticNode?.remove();
      // Restore composer text on hard failure
      if (textarea && !textarea.value) textarea.value = body;
      if (data.rateLimited) {
        showToast(data.error || "Too many flagged messages. Please try again later.", { duration: 6000, type: "error" });
      } else if (data.muted) {
        showToast(data.error || "You are temporarily unable to post.", { duration: 6000, type: "error" });
      } else {
        showToast(data.error || "Failed to post.", { duration: 3000, type: "error" });
      }
      return;
    }

    // Show moderation warning if content was held or warned
    const mod = data.moderation || {};
    if (mod.displayWarning) {
      showToast(mod.displayWarning, { duration: 5000, type: mod.outcome === "block" ? "error" : "warning" });
    }

    if (data.post?.moderationStatus === "approved") {
      // Clear pending attachment after successful post
      _discPendingAttachments.delete(playId);
      _discClearPendingAttachmentUI(playId);
      // Replace optimistic node with real post from server
      if (optimisticNode && list) {
        const realWrap = document.createElement("div");
        realWrap.innerHTML = _discPostHtml(data.post, playId);
        const realNode = realWrap.firstElementChild;
        if (realNode) list.replaceChild(realNode, optimisticNode);
        else optimisticNode.classList.remove("disc-post--pending");
      }
      const countEl = document.getElementById("discCount");
      if (countEl) countEl.textContent = String(Math.max(0, parseInt(countEl.textContent || "0", 10) + 1));
    } else {
      // Held or blocked — remove optimistic post
      optimisticNode?.remove();
    }
  } catch (_) {
    optimisticNode?.remove();
    if (textarea && !textarea.value) textarea.value = body;
    showToast("Network error — try again.", { duration: 3000, type: "error" });
  } finally {
    btn.disabled = false;
    btn.textContent = "Post";
  }
}

// ── Reply composer actions ────────────────────────────────────────────────────

// ── Reply composer helpers ───────────────────────────────────────────────────

function _discCloseAllReplyComposers() {
  // Close any open inline composers
  document.querySelectorAll(".disc-composer--reply").forEach((c) => c.remove());
  // Force-close bottom sheet without confirm (used when opening a new one)
  const sheet = document.getElementById("discReplySheet");
  if (sheet?.classList.contains("visible")) {
    const pid = sheet.dataset.parentPostId;
    sheet.classList.remove("visible");
    document.getElementById("discReplySheetOverlay")?.classList.remove("visible");
    _discRemoveVpListeners(sheet);
    if (pid) try { sessionStorage.removeItem(`disc-reply-draft-${pid}`); } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
    setTimeout(() => { sheet.innerHTML = ""; delete sheet.dataset.parentPostId; }, 220);
  }
}

function _discRemoveVpListeners(sheet) {
  if (sheet._vpAdjust && window.visualViewport) {
    window.visualViewport.removeEventListener("resize", sheet._vpAdjust);
    window.visualViewport.removeEventListener("scroll", sheet._vpAdjust);
    delete sheet._vpAdjust;
  }
}

function _discWireReplyComposerDraft(container, parentPostId) {
  const ta = container.querySelector("textarea.disc-textarea");
  if (!ta) return;
  try {
    const draft = sessionStorage.getItem(`disc-reply-draft-${parentPostId}`);
    if (draft) {
      ta.value = draft;
      const charEl = document.getElementById(`discChars-reply-${parentPostId}`);
      if (charEl) charEl.textContent = `${draft.length} / 2000`;
    }
  } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
  ta.addEventListener("input", () => {
    try { sessionStorage.setItem(`disc-reply-draft-${parentPostId}`, ta.value); } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
  });
  // Adjust sheet position when on-screen keyboard resizes the viewport
  const sheet = document.getElementById("discReplySheet");
  if (sheet && window.visualViewport) {
    const adjust = () => {
      const offset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
      sheet.style.paddingBottom = offset > 0
        ? `max(${offset + 12}px, env(safe-area-inset-bottom))`
        : "";
    };
    window.visualViewport.addEventListener("resize", adjust);
    window.visualViewport.addEventListener("scroll", adjust);
    sheet._vpAdjust = adjust;
  }
  ta.focus();
}

function openDiscReplyComposer(arg) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const parentPostId = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

  const playSig = _discLastPlaySig || "";
  const parentPostEl = document.getElementById(`disc-post-${parentPostId}`);
  const parentAuthor = parentPostEl?.dataset?.authorName || "";
  const parentBody = parentPostEl?.dataset?.bodyText || "";
  const bannerHtml = parentAuthor
    ? `<div class="disc-reply-to-banner">` +
    `↩ Replying to <strong>${escapeHtml(parentAuthor)}</strong>` +
    (parentBody
      ? `: <em class="disc-reply-preview">${escapeHtml(parentBody.slice(0, 60))}${parentBody.length >= 60 ? "…" : ""}</em>`
      : "") +
    `</div>`
    : "";

  const isMobile = window.matchMedia("(max-width: 600px)").matches;

  if (isMobile) {
    // If sheet is already open for this post, just re-focus
    const existingSheet = document.getElementById("discReplySheet");
    if (existingSheet?.classList.contains("visible") && existingSheet.dataset.parentPostId === String(parentPostId)) {
      existingSheet.querySelector("textarea.disc-textarea")?.focus();
      return;
    }
    // Close any other open composers first
    _discCloseAllReplyComposers();

    const slot = document.getElementById(`disc-reply-slot-${parentPostId}`);
    if (!slot) return;

    let overlay = document.getElementById("discReplySheetOverlay");
    let sheet = document.getElementById("discReplySheet");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "discReplySheetOverlay";
      overlay.className = "disc-reply-sheet-overlay";
      document.body.appendChild(overlay);
    }
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "discReplySheet";
      sheet.className = "disc-reply-sheet";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-label", "Reply composer");
      document.body.appendChild(sheet);
    }
    overlay.onclick = () => closeDiscReplyComposer(parentPostId);
    sheet.dataset.parentPostId = String(parentPostId);
    sheet.innerHTML = `<div class="disc-reply-sheet-handle" aria-hidden="true"></div>` + bannerHtml + _discComposerHtml(playId, playSig, parentPostId);
    overlay.classList.add("visible");
    requestAnimationFrame(() => sheet.classList.add("visible"));
    _discWireReplyComposerDraft(sheet, parentPostId);
    _discWireComposerAttachments(sheet);
    return;
  }

  // Desktop/tablet: close other composers, render inline
  _discCloseAllReplyComposers();
  const slot = document.getElementById(`disc-reply-slot-${parentPostId}`);
  if (!slot) return;
  slot.innerHTML = bannerHtml + _discComposerHtml(playId, playSig, parentPostId);
  _discWireReplyComposerDraft(slot, parentPostId);
  _discWireComposerAttachments(slot);
}

async function closeDiscReplyComposer(parentPostId) {
  // Handle bottom sheet mode first
  const sheet = document.getElementById("discReplySheet");
  if (sheet?.classList.contains("visible") && sheet.dataset.parentPostId === String(parentPostId)) {
    const textarea = sheet.querySelector("textarea.disc-textarea");
    if (textarea?.value?.trim()) {
      const confirmed = await showConfirm("Discard your unsaved reply?", {
        confirmText: "Discard",
        cancelText: "Keep Writing",
        danger: true,
      });
      if (!confirmed) return;
    }
    _discRemoveVpListeners(sheet);
    sheet.classList.remove("visible");
    document.getElementById("discReplySheetOverlay")?.classList.remove("visible");
    try { sessionStorage.removeItem(`disc-reply-draft-${parentPostId}`); } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
    setTimeout(() => { sheet.innerHTML = ""; delete sheet.dataset.parentPostId; }, 220);
    return;
  }
  // Handle inline slot mode
  const slot = document.getElementById(`disc-reply-slot-${parentPostId}`);
  if (!slot) return;
  const textarea = slot.querySelector("textarea.disc-textarea");
  if (textarea?.value?.trim()) {
    const confirmed = await showConfirm("Discard your unsaved reply?", {
      confirmText: "Discard",
      cancelText: "Keep Writing",
      danger: true,
    });
    if (!confirmed) return;
  }
  try { sessionStorage.removeItem(`disc-reply-draft-${parentPostId}`); } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
  slot.innerHTML = "";
}

async function submitDiscReply(arg, el) {
  const btn = (el instanceof Element) ? el : (arg instanceof Element ? arg : null);
  const parentPostId = btn?.dataset?.postId;
  const playId = btn?.dataset?.playId;
  const playSig = btn?.dataset?.playSig || "";
  if (!parentPostId || !playId) return;

  const textarea = document.getElementById(`discCompose-reply-${parentPostId}`);
  if (!textarea) return;

  const body = textarea.value.trim();
  if (!body) { textarea.focus(); return; }

  if (!navigator.onLine) {
    showToast("You're offline — reconnect and try again.", { duration: 4000, type: "warning" });
    return;
  }

  btn.disabled = true;
  btn.textContent = "Posting…";

  // ── Optimistic reply render ────────────────────────────────────────────────
  const optimisticReply = {
    id: `opt-${Date.now()}`,
    body,
    postType: "comment",
    authorName: _discAuthUser()?.name || _discAuthUser()?.username || "You",
    authorRole: _discAuthUser()?.role || "player",
    authorId: _discCurrentUserId || "me",
    reactions: [], replyCount: 0, replies: [],
    createdAt: new Date().toISOString(),
  };
  let repliesEl = document.getElementById(`disc-replies-${parentPostId}`);
  if (!repliesEl) {
    repliesEl = document.createElement("div");
    repliesEl.className = "disc-replies";
    repliesEl.id = `disc-replies-${parentPostId}`;
    const slot = document.getElementById(`disc-reply-slot-${parentPostId}`);
    slot?.insertAdjacentElement("beforebegin", repliesEl);
  }
  const optWrap = document.createElement("div");
  optWrap.innerHTML = _discPostHtml(optimisticReply, playId, true);
  let optimisticReplyNode = optWrap.firstElementChild;
  if (optimisticReplyNode) {
    optimisticReplyNode.classList.add("disc-post--pending");
    repliesEl.querySelector(".disc-load-replies")?.remove();
    repliesEl.appendChild(optimisticReplyNode);
    optimisticReplyNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Close the reply composer immediately (clear text first to skip confirm)
  const _replyTa = document.getElementById(`discCompose-reply-${parentPostId}`);
  if (_replyTa) _replyTa.value = "";
  closeDiscReplyComposer(parentPostId);

  try {
    const replyComposerId = `reply-${parentPostId}`;
    const pendingAttach = _discPendingAttachments.get(replyComposerId) || null;
    const replyTypeEl = document.getElementById(`discType-reply-${parentPostId}`);
    const replyPostType = replyTypeEl?.value === "coach_clarification" ? "coach_clarification" : "comment";
    const res = await fetch(`/api/threads/${playId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        post_type: replyPostType,
        play_signature: playSig,
        parent_post_id: parentPostId,
        attachment: pendingAttach || undefined,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      optimisticReplyNode?.remove();
      showToast(data.error || "Failed to post.", { duration: 3000, type: "error" });
      return;
    }

    const mod = data.moderation || {};
    if (mod.displayWarning) {
      showToast(mod.displayWarning, { duration: 5000, type: mod.outcome === "block" ? "error" : "warning" });
    }

    if (data.post?.moderationStatus === "approved") {
      // Clear pending attachment
      _discPendingAttachments.delete(replyComposerId);
      _discClearPendingAttachmentUI(replyComposerId);
      // Replace optimistic with real reply
      if (optimisticReplyNode && repliesEl) {
        const realWrap = document.createElement("div");
        realWrap.innerHTML = _discPostHtml(data.post, playId, true);
        const realNode = realWrap.firstElementChild;
        if (realNode) repliesEl.replaceChild(realNode, optimisticReplyNode);
        else optimisticReplyNode.classList.remove("disc-post--pending");
      }
    } else {
      optimisticReplyNode?.remove();
    }
  } catch (_) {
    optimisticReplyNode?.remove();
    showToast("Network error — try again.", { duration: 3000, type: "error" });
  } finally {
    btn.disabled = false;
    btn.textContent = "Reply";
  }
}

async function loadMoreDiscReplies(arg, el) {
  const btn = (el instanceof Element) ? el : (arg instanceof Element ? arg : null);
  const rootPostId = btn?.dataset?.arg || String(arg || "");
  const cursor = btn?.dataset?.cursor || "";
  if (!rootPostId) return;

  btn.disabled = true;
  btn.textContent = "Loading…";

  try {
    const params = new URLSearchParams({ parentId: rootPostId });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/threads/_/replies?${params}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    const repliesEl = document.getElementById(`disc-replies-${rootPostId}`);
    if (repliesEl && data.replies.length) {
      // Find current play
      const discSection = repliesEl.closest("[data-play-id]");
      const playId = discSection?.dataset?.playId || _discLastPlayId || "";
      data.replies.forEach((r) => {
        const wrap = document.createElement("div");
        wrap.innerHTML = _discPostHtml(r, playId, true);
        const node = wrap.firstElementChild;
        if (node) repliesEl.insertBefore(node, btn);
      });
    }

    if (data.hasMore && data.replies.length) {
      btn.dataset.cursor = data.replies[data.replies.length - 1]?.id || cursor;
      btn.disabled = false;
      btn.textContent = "Load more replies…";
    } else {
      // Mark this thread as expanded so it auto-restores next render
      try { sessionStorage.setItem(`disc-exp-${rootPostId}`, "1"); } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
      btn.remove();
    }
  } catch (_) {
    btn.disabled = false;
    btn.textContent = "Load more replies…";
    showToast("Failed to load replies.", { duration: 2500, type: "error" });
  }
}

// ── Moderation queue (coaches) ────────────────────────────────────────────────

async function _discCheckModerationQueue() {
  try {
    const res = await fetch("/api/moderation/queue");
    if (!res.ok) return;
    const data = await res.json();
    const count = data.count || 0;
    const banner = document.getElementById("discModBanner");
    const countEl = document.getElementById("discModCount");
    if (banner) banner.style.display = count > 0 ? "flex" : "none";
    if (countEl) countEl.textContent = `${count} post${count === 1 ? "" : "s"} pending review`;
  } catch (_) { /* silent */ }
}

async function openDiscModerationQueue() {
  try {
    const res = await fetch("/api/moderation/queue");
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed");

    if (!data.posts.length) {
      await showModal("No posts are currently pending review.", { title: "Moderation Queue", icon: "✅" });
      return;
    }

    // Build a modal with each post and all available actions
    let html = `<div class="disc-mod-queue" role="list" aria-label="Moderation queue">`;
    for (const p of data.posts) {
      const categoryBadge = p.moderationCategory
        ? `<span class="disc-mod-category disc-mod-category--${escapeHtml(p.moderationCategory)}" aria-label="Flagged for: ${escapeHtml(p.moderationCategory)}">${escapeHtml(p.moderationCategory)}</span>`
        : "";
      // Decode play context from the encoded playId ("formation::play::personnel")
      let playContext = "";
      if (p.playId) {
        try {
          const parts = decodeURIComponent(p.playId).split("::");
          if (parts.length >= 2) playContext = `<span class="disc-mod-play-ctx" title="Play context">${escapeHtml(parts[0])} · ${escapeHtml(parts[1])}${parts[2] ? " · " + escapeHtml(parts[2]) : ""}</span>`;
        } catch (_) { playContext = `<span class="disc-mod-play-ctx">${escapeHtml(p.playId)}</span>`; }
      }
      html += `<div class="disc-mod-item" data-post-id="${escapeHtml(p.id)}" data-play-id="${escapeHtml(p.playId || "")}" role="listitem" aria-label="Post by ${escapeHtml(p.authorName)}">` +
        `<div class="disc-mod-item-meta">` +
        `<strong>${escapeHtml(p.authorName)}</strong>` +
        ` <span class="disc-role-badge disc-role-badge--${escapeHtml(p.authorRole)}" aria-label="Role: ${escapeHtml(p.authorRole)}">${escapeHtml(p.authorRole)}</span>` +
        ` ${categoryBadge}` +
        ` <span class="disc-mod-status" aria-label="Status: ${escapeHtml(p.moderationStatus)}">${escapeHtml(p.moderationStatus)}</span>` +
        (playContext ? ` ${playContext}` : "") +
        `</div>` +
        `<div class="disc-mod-body" role="region" aria-label="Post content">${escapeHtml(p.body)}</div>` +
        `<div class="disc-mod-actions" role="group" aria-label="Actions for post by ${escapeHtml(p.authorName)}">` +
        `<button class="btn btn-xs btn-success" data-action="approveDiscPost" data-arg="${escapeHtml(p.id)}" aria-label="Approve post">✅ Approve</button>` +
        `<button class="btn btn-xs btn-warning" data-action="editApproveDiscPost" data-arg="${escapeHtml(p.id)}" title="Edit the post body then approve" aria-label="Edit and approve post">✏️ Edit &amp; Approve</button>` +
        `<button class="btn btn-xs" data-action="warnDiscPost" data-arg="${escapeHtml(p.id)}" title="Publish post but record a warning" aria-label="Warn author and publish post">⚠️ Warn</button>` +
        `<button class="btn btn-xs" data-action="muteDiscPost" data-arg="${escapeHtml(p.id)}" title="Publish post but temporarily mute the author" aria-label="Mute author">🔇 Mute</button>` +
        `<button class="btn btn-xs" data-action="lockDiscThreadFromQueue" data-arg="${escapeHtml(p.id)}::${escapeHtml(encodeURIComponent(p.playId || ""))}" title="Lock the thread this post came from" aria-label="Lock thread">🔒 Lock Thread</button>` +
        `<button class="btn btn-xs" data-action="accountReviewDiscPost" data-arg="${escapeHtml(p.id)}" title="Flag author account for review" aria-label="Flag account for review">🔍 Acct Review</button>` +
        `<button class="btn btn-xs btn-danger" data-action="rejectDiscPost" data-arg="${escapeHtml(p.id)}" aria-label="Reject post">🗑 Reject</button>` +
        `</div>` +
        `</div>`;
    }
    html += `</div>`;
    html += `<p class="disc-mod-queue-footer"><button class="btn btn-xs" data-action="openDiscModerationSettings" style="margin-top:var(--space-xs)">⚙️ Moderation Settings</button></p>`;

    await showModal(html, { title: `Moderation Queue (${data.posts.length})`, icon: "🛡️" });
  } catch (err) {
    showToast("Failed to load queue: " + err.message, { duration: 3000, type: "error" });
  }
}

async function approveDiscPost(postId) {
  await _discModerationAction(postId, "approve", "Approved by coach");
}

async function rejectDiscPost(postId) {
  const reason = await showPrompt("Reason for rejection (optional):", "", { title: "Reject Post", icon: "🗑" });
  if (reason === null) return; // cancelled
  await _discModerationAction(postId, "reject", reason || "Rejected by coach");
}

async function editApproveDiscPost(postId) {
  // Find the post body in the current queue DOM
  const item = document.querySelector(`.disc-mod-item[data-post-id="${postId}"]`);
  const currentBody = item ? (item.querySelector(".disc-mod-body")?.textContent || "") : "";
  const editedBody = await showPrompt("Edit the post before approving:", currentBody, { title: "Edit & Approve", icon: "✏️", placeholder: "Revised post content…" });
  if (editedBody === null) return; // cancelled
  if (!editedBody.trim()) { showToast("Post body cannot be empty.", { duration: 2500, type: "error" }); return; }
  await _discModerationAction(postId, "edit_approve", "Edited and approved by coach", { editedBody });
}

async function warnDiscPost(postId) {
  const reason = await showPrompt("Warning reason (visible in moderation log):", "", { title: "Warn Author", icon: "⚠️", placeholder: "e.g. Language did not meet team standards" });
  if (reason === null) return; // cancelled
  await _discModerationAction(postId, "warn", reason || "Warning issued by coach");
}

async function muteDiscPost(postId) {
  const daysStr = await showPrompt("Mute author for how many days? (1–30):", "1", { title: "Mute Author", icon: "🔇" });
  if (daysStr === null) return; // cancelled
  const days = parseInt(daysStr, 10);
  if (!days || days < 1 || days > 30) { showToast("Enter a number between 1 and 30.", { duration: 2500, type: "error" }); return; }
  const reason = `Muted for ${days} day${days === 1 ? "" : "s"} by coach`;
  await _discModerationAction(postId, "mute", reason, { muteDays: days });
}

async function lockDiscThreadFromQueue(arg) {
  const [postId, playIdEncoded] = String(arg || "").split("::");
  const playId = decodeURIComponent(playIdEncoded || "");
  if (!playId) { showToast("No play ID to lock.", { duration: 2500, type: "error" }); return; }
  const confirmed = await showConfirm(`Lock this thread? Players will no longer be able to reply.`, { title: "Lock Thread", icon: "🔒", confirmText: "Lock", danger: false });
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/threads/${encodeURIComponent(playId)}/manage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lock" }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Failed to lock thread.", { duration: 3000, type: "error" }); return; }
    // Also log moderation action on the flagged post
    await _discModerationAction(postId, "lock_thread", "Thread locked from moderation queue");
    showToast("Thread locked.", { duration: 2500, type: "success" });
  } catch (_) { showToast("Network error.", { duration: 2500, type: "error" }); }
}

async function accountReviewDiscPost(postId) {
  const reason = await showPrompt("Reason for account review flag (visible in moderation log):", "", { title: "Flag Account for Review", icon: "🔍", placeholder: "e.g. Repeated policy violations" });
  if (reason === null) return; // cancelled
  await _discModerationAction(postId, "account_review", reason || "Flagged for account review");
}

async function openDiscModerationSettings() {
  try {
    const [termsRes, statsRes] = await Promise.all([
      fetch("/api/moderation/terms"),
      fetch("/api/moderation/stats"),
    ]);
    const termsData = await termsRes.json();
    const statsData = await statsRes.json();
    const terms = termsData.terms || [];
    const stats = statsData.stats || {};

    let html = `<div class="disc-mod-settings">`;
    html += `<h3 style="margin:0 0 var(--space-sm)">📊 Moderation Activity</h3>`;
    html += `<div class="disc-mod-stat-row"><span>Last 7 days</span><strong>${stats.last7Days || 0} actions</strong></div>`;
    html += `<div class="disc-mod-stat-row"><span>Last 30 days</span><strong>${stats.last30Days || 0} actions</strong></div>`;
    html += `<div class="disc-mod-stat-row"><span>False-positive reversals</span><strong>${stats.falsePositiveReversals || 0}</strong></div>`;

    html += `<h3 style="margin:var(--space-md) 0 var(--space-sm)">⚙️ Custom Term List</h3>`;
    html += `<p style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Add terms to the football allowlist (prevent false blocks) or increase severity of observed coded language. Review this list monthly.</p>`;

    if (terms.length) {
      html += `<div class="disc-mod-terms-list">`;
      for (const t of terms) {
        html += `<div class="disc-mod-term-row">` +
          `<span class="disc-mod-category disc-mod-category--${t.type === "allowlist" ? "allow" : "blocked"}">${escapeHtml(t.type)}</span>` +
          ` <strong>${escapeHtml(t.term_display)}</strong>` +
          (t.category ? ` <em>${escapeHtml(t.category)}</em>` : "") +
          ` <button class="btn btn-xs btn-danger" data-action="deleteCustomModTerm" data-arg="${escapeHtml(t.id)}">✕</button>` +
          `</div>`;
      }
      html += `</div>`;
    } else {
      html += `<p class="disc-empty">No custom terms. Use the form below to add one.</p>`;
    }

    html += `<div class="disc-mod-add-term">` +
      `<input id="discModTermInput" placeholder="Term (e.g. hash route)" style="flex:1;padding:6px 10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);font:inherit;font-size:var(--font-size-xs)">` +
      `<select id="discModTermType" style="padding:6px;border:1px solid var(--color-border);border-radius:var(--radius-sm);font:inherit;font-size:var(--font-size-xs)">` +
      `<option value="allowlist">Allowlist (football term)</option><option value="blocked">Blocked (escalate severity)</option></select>` +
      `<button class="btn btn-xs btn-primary" data-action="addCustomModTerm">Add</button>` +
      `</div>`;
    html += `</div>`;

    await showModal(html, { title: "Moderation Settings", icon: "⚙️" });
  } catch (err) {
    showToast("Failed to load settings: " + err.message, { duration: 3000, type: "error" });
  }
}

async function addCustomModTerm() {
  const term = document.getElementById("discModTermInput")?.value?.trim();
  const type = document.getElementById("discModTermType")?.value || "allowlist";
  if (!term) { showToast("Enter a term.", { duration: 2000, type: "error" }); return; }
  try {
    const res = await fetch("/api/moderation/terms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, type, category: "profanity", severity: 3 }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Failed.", { duration: 3000, type: "error" }); return; }
    showToast(`"${term}" added to ${type}.`, { duration: 2500, type: "success" });
    openDiscModerationSettings(); // refresh
  } catch (_) { showToast("Network error.", { duration: 2500, type: "error" }); }
}

async function deleteCustomModTerm(termId) {
  try {
    await fetch(`/api/moderation/terms?id=${encodeURIComponent(termId)}`, { method: "DELETE" });
    showToast("Term removed.", { duration: 2000, type: "success" });
    openDiscModerationSettings(); // refresh
  } catch (_) { showToast("Network error.", { duration: 2500, type: "error" }); }
}

async function _discModerationAction(postId, action, reason, extras = {}) {
  try {
    const res = await fetch(`/api/moderation/${encodeURIComponent(postId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason, ...extras }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Action failed.", { duration: 3000, type: "error" }); return; }

    // Remove from queue UI if modal is still open
    document.querySelector(`.disc-mod-item[data-post-id="${postId}"]`)?.remove();

    // If approved, refresh the discussion to show the post
    if (action === "approve" && _discLastPlayId) {
      const bodyEl = document.getElementById("discBody");
      if (bodyEl) {
        bodyEl.innerHTML = `<p class="disc-loading">Refreshing…</p>`;
        await _discLoadBody(_discLastPlayId, _discLastPlaySig, bodyEl);
      }
    }

    showToast(action === "approve" ? "Post approved." : "Post rejected.", { duration: 2500, type: "success" });
    await _discCheckModerationQueue();
  } catch (_) {
    showToast("Network error.", { duration: 2500, type: "error" });
  }
}

// ── Reaction update helper ────────────────────────────────────────────────────

function startEditPost(postId) {
  if (_discEditState) _discCancelEdit();

  const bodyEl = document.getElementById(`disc-body-${postId}`);
  if (!bodyEl) return;
  const original = bodyEl.textContent || "";

  const textarea = document.createElement("textarea");
  textarea.className = "disc-textarea disc-edit-textarea";
  textarea.value = original;
  textarea.maxLength = 2000;
  textarea.rows = 3;
  textarea.setAttribute("aria-label", "Edit comment");

  const actions = document.createElement("div");
  actions.className = "disc-composer-actions disc-edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-sm btn-primary";
  saveBtn.textContent = "Save";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-sm";
  cancelBtn.textContent = "Cancel";
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  bodyEl.replaceWith(textarea);
  textarea.insertAdjacentElement("afterend", actions);
  textarea.focus();

  _discEditState = { postId, original };

  saveBtn.addEventListener("click", () => _discSaveEdit(postId, textarea, actions));
  cancelBtn.addEventListener("click", () => _discCancelEdit());
}

function _discCancelEdit() {
  if (!_discEditState) return;
  const { postId, original } = _discEditState;
  const postEl = document.getElementById(`disc-post-${postId}`);
  const ta = postEl?.querySelector(".disc-edit-textarea");
  const actions = postEl?.querySelector(".disc-edit-actions");

  if (ta) {
    const div = document.createElement("div");
    div.className = "disc-post-body";
    div.id = `disc-body-${postId}`;
    div.textContent = original;
    ta.replaceWith(div);
  }
  actions?.remove();
  _discEditState = null;
}

async function _discSaveEdit(postId, textarea, actionsEl) {
  const newBody = textarea.value.trim();
  if (!newBody) return;

  try {
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newBody }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Edit failed.", { duration: 3000, type: "error" }); return; }

    const div = document.createElement("div");
    div.className = "disc-post-body";
    div.id = `disc-body-${postId}`;
    div.textContent = data.post.body;
    textarea.replaceWith(div);
    actionsEl?.remove();

    const meta = document.querySelector(`#disc-post-${postId} .disc-post-meta`);
    if (meta && !meta.querySelector(".disc-edited")) {
      const span = document.createElement("span");
      span.className = "disc-edited";
      span.textContent = "(edited)";
      meta.appendChild(span);
    }
    _discEditState = null;
  } catch (_) {
    showToast("Network error — try again.", { duration: 3000, type: "error" });
  }
}

async function deleteDiscPost(postId, el) {
  const playId = el?.dataset?.playId;

  const ok = await showConfirm("Delete this post? This can't be undone.", {
    title: "Delete Post", icon: "🗑", confirmText: "Delete", danger: true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Delete failed.", { duration: 3000, type: "error" }); return; }

    document.getElementById(`disc-post-${postId}`)?.remove();

    const countEl = document.getElementById("discCount");
    if (countEl) countEl.textContent = String(Math.max(0, parseInt(countEl.textContent || "1", 10) - 1));
  } catch (_) {
    showToast("Network error — try again.", { duration: 3000, type: "error" });
  }
}

async function loadMoreDiscussion(arg, el) {
  // When called from _ELEMENT_FNS with no data-arg, element is first param
  const btn = (el instanceof Element) ? el : (arg instanceof Element ? arg : null);
  const playId = btn?.dataset?.playId;
  const cursor = btn?.dataset?.cursor;
  if (!playId) return;

  btn.disabled = true;
  btn.textContent = "Loading\u2026";

  try {
    const url = `/api/threads/${playId}?limit=25` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    const list = document.getElementById(`discPosts-${playId}`);
    if (list && data.posts.length) {
      data.posts.forEach((p) => {
        const wrap = document.createElement("div");
        wrap.innerHTML = _discPostHtml(p, playId);
        const node = wrap.firstElementChild;
        if (node) list.appendChild(node);
      });
    }

    if (data.hasMore && data.posts.length) {
      btn.dataset.cursor = data.posts[data.posts.length - 1]?.id || cursor;
      btn.disabled = false;
      btn.textContent = "Load more…";
    } else {
      btn.remove();
    }
  } catch (_) {
    btn.disabled = false;
    btn.textContent = "Load more…";
    showToast("Failed to load more.", { duration: 2500, type: "error" });
  }
}

/** Retry loading the discussion after an error. */
function retryDiscussion() {
  if (!_discLastPlayId) return;
  const bodyEl = document.getElementById("discBody");
  if (bodyEl) {
    bodyEl.innerHTML = `<p class="disc-loading">Loading…</p>`;
    _discLoadBody(_discLastPlayId, _discLastPlaySig, bodyEl);
  }
}

// ── Reactions ─────────────────────────────────────────────────────────────────

async function toggleDiscReaction(arg) {
  const sep = String(arg || "").lastIndexOf("::");
  if (sep < 0) return;
  const postId = arg.slice(0, sep);
  const reactionKey = arg.slice(sep + 2);
  if (!postId || !reactionKey) return;

  const postEl = document.getElementById(`disc-post-${postId}`);

  // ── Optimistic update ──────────────────────────────────────────────────────
  const reactionsBar = postEl?.querySelector(".disc-reactions");
  const snapHtml = reactionsBar?.outerHTML || null; // for rollback

  if (reactionsBar) {
    const chip = reactionsBar.querySelector(`[data-arg="${CSS.escape(postId + "::" + reactionKey)}"]`);
    if (chip) {
      const wasActive = chip.classList.contains("is-mine");
      chip.classList.toggle("is-mine", !wasActive);
      chip.setAttribute("aria-pressed", (!wasActive).toString());
      const countEl = chip.querySelector(".disc-react-count");
      if (countEl) {
        const n = parseInt(countEl.textContent, 10) || 0;
        const next = wasActive ? n - 1 : n + 1;
        if (next <= 0) {
          chip.remove(); // remove chip if count hits 0
        } else {
          countEl.textContent = next;
        }
      }
    } else {
      // New reaction — add chip immediately
      const meta = _REACTION_META[reactionKey] || { emoji: "❓", label: reactionKey };
      const tempChip = document.createElement("button");
      tempChip.className = "disc-react-chip is-mine";
      tempChip.dataset.action = "toggleDiscReaction";
      tempChip.dataset.arg = `${postId}::${reactionKey}`;
      tempChip.setAttribute("aria-pressed", "true");
      tempChip.setAttribute("title", meta.label);
      tempChip.innerHTML = `${meta.emoji} <span class="disc-react-count">1</span>`;
      reactionsBar.insertBefore(tempChip, reactionsBar.lastElementChild);
    }
  }

  // Disable chips while in flight
  reactionsBar?.querySelectorAll(".disc-react-chip").forEach((b) => { b.disabled = true; });

  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction_key: reactionKey }),
    });
    const data = await res.json();
    if (!data.ok) {
      // Rollback optimistic update
      if (snapHtml && reactionsBar) {
        const tmp = document.createElement("div");
        tmp.innerHTML = snapHtml;
        reactionsBar.replaceWith(tmp.firstElementChild);
      }
      showToast(data.error || "Failed to react.", { duration: 2500, type: "error" });
      return;
    }
    _discUpdateReactions(postId, data.reactions);
  } catch (_) {
    // Rollback on network error
    if (snapHtml) {
      const currentBar = postEl?.querySelector(".disc-reactions");
      if (currentBar) {
        const tmp = document.createElement("div");
        tmp.innerHTML = snapHtml;
        currentBar.replaceWith(tmp.firstElementChild);
      }
    }
    showToast("Network error.", { duration: 2500, type: "error" });
  } finally {
    postEl?.querySelector(".disc-reactions")?.querySelectorAll(".disc-react-chip").forEach((b) => { b.disabled = false; });
  }
}

function _discUpdateReactions(postId, reactions) {
  // Replace the whole reactions bar with fresh HTML
  const postEl = document.getElementById(`disc-post-${postId}`);
  if (!postEl) return;
  const existing = postEl.querySelector(".disc-reactions");
  if (!existing) return;
  const isQuestion = postEl.dataset.postType === "question";
  const isReply = postEl.classList.contains("disc-post--reply");
  const excludeKey = (isQuestion && !isReply) ? "same_question" : null;
  const tmp = document.createElement("div");
  tmp.innerHTML = _discReactionsHtml(postId, reactions, excludeKey);
  const newBar = tmp.firstElementChild;
  if (newBar) existing.replaceWith(newBar);
  // Also update the dedicated "same question" button if present
  if (isQuestion && !isReply) {
    const sameQBtn = postEl.querySelector(".disc-same-q-btn");
    if (sameQBtn) {
      const sameQReaction = (reactions || []).find((r) => r.key === "same_question");
      const count = sameQReaction?.count || 0;
      const isMine = sameQReaction?.mine || false;
      sameQBtn.classList.toggle("is-mine", isMine);
      sameQBtn.setAttribute("aria-pressed", isMine ? "true" : "false");
      const countSpan = sameQBtn.querySelector(".disc-same-q-count");
      if (count > 1) {
        if (countSpan) {
          countSpan.textContent = `\u00b7 ${count}`;
        } else {
          sameQBtn.insertAdjacentHTML("beforeend", ` <span class="disc-same-q-count">\u00b7 ${count}</span>`);
        }
      } else {
        countSpan?.remove();
      }
    }
  }
}

// ── Q&A controls (coaches) ────────────────────────────────────────────────────

async function resolveDiscPost(arg) {
  const sep = String(arg || "").lastIndexOf("::");
  if (sep < 0) return;
  const postId = arg.slice(0, sep);
  const targetState = arg.slice(sep + 2); // "resolved" or "reopened"
  if (!postId || !targetState) return;

  const action = targetState === "resolved" ? "resolve" : "reopen";
  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Failed.", { duration: 2500, type: "error" }); return; }
    _discUpdateQState(postId, data.questionState);
  } catch (_) {
    showToast("Network error.", { duration: 2500, type: "error" });
  }
}

function _discUpdateQState(postId, newState) {
  const postEl = document.getElementById(`disc-post-${postId}`);
  if (!postEl) return;

  // Toggle resolved styling
  const isResolved = newState === "resolved" || newState === "answered";
  postEl.classList.toggle("disc-post--resolved", isResolved);

  // Update/insert state badge
  const newBadgeHtml = _discQStateBadge(newState);
  const existing = postEl.querySelector(".disc-q-state");
  if (existing) {
    if (newBadgeHtml) {
      const tmp = document.createElement("span");
      tmp.innerHTML = newBadgeHtml;
      existing.replaceWith(tmp.firstElementChild);
    } else {
      existing.remove();
    }
  } else if (newBadgeHtml) {
    const meta = postEl.querySelector(".disc-post-meta");
    if (meta) {
      const tmp = document.createElement("span");
      tmp.innerHTML = newBadgeHtml;
      if (tmp.firstElementChild) meta.appendChild(tmp.firstElementChild);
    }
  }

  // Update resolve button
  const resolveBtn = postEl.querySelector("[data-action='resolveDiscPost']");
  if (resolveBtn) {
    const nowResolved = isResolved;
    resolveBtn.dataset.arg = `${postId}::${nowResolved ? "reopened" : "resolved"}`;
    resolveBtn.title = nowResolved ? "Reopen" : "Resolve";
    resolveBtn.textContent = nowResolved ? "🔄 Reopen" : "✅ Resolve";
    resolveBtn.classList.toggle("disc-action-btn--resolve", !nowResolved);
  }
}

// ── Official Answer ───────────────────────────────────────────────────────────

async function markDiscPostOfficial(arg) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const postId = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);
  const postEl = document.getElementById(`disc-post-${postId}`);
  if (!postEl || !playId) return;

  const isCurrentlyOfficial = postEl.dataset.isOfficial === "1";

  try {
    const res = await fetch(`/api/threads/${playId}/posts/${postId}/official`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ official: !isCurrentlyOfficial }),
    });
    if (!res.ok) {
      if (res.status === 404) {
        showToast("Official answer feature requires a server update.", { duration: 3500, type: "warning" });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
      return;
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed");

    const nowOfficial = data.official === true;
    postEl.dataset.isOfficial = nowOfficial ? "1" : "0";
    postEl.classList.toggle("disc-post--official", nowOfficial);

    // Update official badge
    let badge = postEl.querySelector(".disc-official-badge");
    const contentEl = postEl.querySelector(".disc-post-content");
    if (nowOfficial && !badge && contentEl) {
      contentEl.insertAdjacentHTML("afterbegin", `<div class="disc-official-badge">⭐ Official Answer</div>`);
    } else if (!nowOfficial && badge) {
      badge.remove();
    }

    // Update pin button label
    const pinBtn = postEl.querySelector("[data-action='markDiscPostOfficial']");
    if (pinBtn) {
      pinBtn.classList.toggle("is-official", nowOfficial);
      pinBtn.title = nowOfficial ? "Unpin official answer" : "Mark as official answer";
      pinBtn.innerHTML = `📌 ${nowOfficial ? "Unpin" : "Official"}`;
    }

    // Move official reply to top of the replies container
    if (nowOfficial) {
      const repliesContainer = postEl.closest(".disc-replies");
      if (repliesContainer) repliesContainer.insertAdjacentElement("afterbegin", postEl);
    }

    // If marking official on a reply to a question, auto-mark question as answered
    if (nowOfficial) {
      const parentPost = postEl.closest(".disc-post:not(.disc-post--reply)");
      if (parentPost?.dataset?.postType === "question") {
        const qBadge = parentPost.querySelector(".disc-q-state");
        if (!qBadge) {
          const meta = parentPost.querySelector(".disc-post-meta");
          if (meta) meta.insertAdjacentHTML("beforeend",
            `<span class="disc-q-state disc-q-state--answered">✅ Answered</span>`);
        }
      }
    }

    showToast(nowOfficial ? "⭐ Marked as Official Answer" : "Official answer unpinned", { type: "success", duration: 2500 });
  } catch (err) {
    showToast("Couldn't update — try again.", { duration: 3000, type: "error" });
  }
}

// ── Reaction breakdown ────────────────────────────────────────────────────────

async function openDiscReactionBreakdown(postId) {
  if (!postId) return;
  const postEl = document.getElementById(`disc-post-${postId}`);
  const playId = postEl?.closest("[data-play-id]")?.dataset?.playId || _discLastPlayId;
  const isStaff = _discIsStaff();

  // Build fallback from DOM if fetch fails
  const buildFallbackHtml = () => {
    const chips = Array.from(postEl?.querySelectorAll(".disc-react-chip") || []);
    if (!chips.length) return `<p class="disc-empty">No reactions yet.</p>`;
    return `<div class="disc-breakdown">` +
      chips.map((chip) => {
        const key = (chip.dataset.arg || "").split("::")[1] || "";
        const meta = _REACTION_META[key] || { emoji: "❓", label: key };
        const count = chip.querySelector(".disc-react-count")?.textContent || "0";
        return `<div class="disc-breakdown-row"><span class="disc-breakdown-emoji">${meta.emoji}</span>` +
          `<span class="disc-breakdown-label">${escapeHtml(meta.label)}</span>` +
          `<span class="disc-breakdown-count">${escapeHtml(count)}</span></div>`;
      }).join("") + `</div>`;
  };

  try {
    const res = await fetch(`/api/threads/${playId}/posts/${postId}/reactions`);
    if (!res.ok) {
      // Graceful fallback — show counts we already have in DOM
      await showModal(buildFallbackHtml(), { title: "Reactions", icon: "👍" });
      return;
    }
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    const rows = Object.entries(data.reactions || {})
      .filter(([, r]) => (r.count || 0) > 0)
      .sort(([, a], [, b]) => (b.count || 0) - (a.count || 0))
      .map(([key, r]) => {
        const meta = _REACTION_META[key] || { emoji: "❓", label: key };
        const usersHtml = isStaff && Array.isArray(r.users) && r.users.length
          ? `<span class="disc-breakdown-users">${r.users.map((u) => escapeHtml(u.name || u)).join(", ")}</span>`
          : "";
        return `<div class="disc-breakdown-row">` +
          `<span class="disc-breakdown-emoji">${meta.emoji}</span>` +
          `<span class="disc-breakdown-label">${escapeHtml(meta.label)}</span>` +
          `<span class="disc-breakdown-count">${r.count || 0}</span>` +
          usersHtml + `</div>`;
      }).join("") || `<p class="disc-empty">No reactions yet.</p>`;

    await showModal(`<div class="disc-breakdown">${rows}</div>`, { title: "Reactions", icon: "👍" });
  } catch (_) {
    await showModal(buildFallbackHtml(), { title: "Reactions", icon: "👍" });
  }
}

async function toggleDiscThreadLock(arg) {
  const sep = String(arg || "").lastIndexOf("::");
  if (sep < 0) return;
  const playId = arg.slice(0, sep);
  const lockVal = arg.slice(sep + 2); // "1" = lock, "0" = unlock
  if (!playId) return;

  const locked = lockVal === "1";
  try {
    const res = await fetch(`/api/threads/${encodeURIComponent(playId)}/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: locked ? "lock" : "unlock" }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Failed.", { duration: 2500, type: "error" }); return; }

    const isNowLocked = data.locked;

    // Update the lock button
    const btn = document.querySelector("[data-action='toggleDiscThreadLock']");
    if (btn) {
      btn.textContent = isNowLocked ? "🔓 Unlock Thread" : "🔒 Lock Thread";
      btn.dataset.arg = `${playId}::${isNowLocked ? "0" : "1"}`;
    }

    // Toggle composer visibility
    const composerEl = document.querySelector(".disc-composer");
    const lockedEl = document.querySelector(".disc-locked");
    if (isNowLocked) {
      composerEl?.remove();
      if (!lockedEl) {
        const p = document.createElement("p");
        p.className = "disc-locked";
        p.textContent = "🔒 Thread is locked.";
        document.querySelector(`#discPosts-${playId}`)?.insertAdjacentElement("afterend", p);
      }
    } else {
      lockedEl?.remove();
      if (!composerEl && _discLastPlaySig !== null) {
        const playSig = _discLastPlaySig || "";
        const tmp = document.createElement("div");
        tmp.innerHTML = _discComposerHtml(playId, playSig);
        const newComposer = tmp.firstElementChild;
        const lockCtrlEl = document.querySelector(".disc-thread-controls");
        if (lockCtrlEl) {
          lockCtrlEl.insertAdjacentElement("beforebegin", newComposer);
        } else {
          const body = document.getElementById("discBody");
          if (body) body.appendChild(newComposer);
        }
        _discWireComposerAttachments(newComposer?.parentElement || document.body);
      }
    }

    showToast(isNowLocked ? "Thread locked." : "Thread unlocked.", { duration: 2500, type: "success" });
  } catch (_) {
    showToast("Network error.", { duration: 2500, type: "error" });
  }
}

// ── Script Integration (Phase 11) ─────────────────────────────────────────────

/**
 * Batch-load thread counts for all script play rows and update badges.
 * Called after renderScript() completes.
 */
async function loadScriptDiscussionCounts() {
  const badges = document.querySelectorAll("[data-disc-play-id]");
  if (!badges.length) return;

  const playIds = [...new Set([...badges].map((b) => b.dataset.discPlayId))];
  if (!playIds.length) return;

  try {
    const params = playIds.map((id) => encodeURIComponent(id)).join(",");
    const res = await fetch(`/api/threads/batch-counts?plays=${params}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;

    const counts = data.counts || {};
    for (const badge of badges) {
      const playId = badge.dataset.discPlayId;
      const info = counts[playId];
      if (!info || info.total === 0) continue;

      // Update count span
      const countEl = badge.querySelector(".script-disc-count");
      if (countEl) countEl.textContent = String(info.total);

      badge.classList.add("has-activity");
      if (info.openQuestions > 0) badge.classList.add("has-open-q");
    }
  } catch (_) {
    // Silent — counts are a progressive enhancement
  }
}

/**
 * Open the swipe presentation at idx and immediately open the discussion drawer.
 * Used by data-action="openScriptDiscussion".
 */
async function openScriptDiscussion(idxStr) {
  const idx = parseInt(idxStr, 10);
  if (isNaN(idx)) return;

  // Capture script context so composer can show period + opponent
  const periodName = _discGetScriptPeriodForIdx(idx);
  _discScriptContext = periodName ? { periodName, playIndex: idx } : null;

  if (typeof openScriptPresentation === "function") {
    openScriptPresentation(idx);
  }

  // Brief wait for the presentation overlay to render
  await new Promise((r) => setTimeout(r, 250));

  if (typeof openPresentationDiscussion === "function") {
    openPresentationDiscussion();
  }
}

/**
 * Open the script discussion and immediately pre-select the Question type.
 * data-action="scriptAskCoachQuestion" data-arg="{scriptIndex}"
 */
async function scriptAskCoachQuestion(idxStr) {
  await openScriptDiscussion(idxStr);
  // Give discussion body a moment to render before pre-selecting question type
  await new Promise((r) => setTimeout(r, 400));
  if (typeof _discLastPlayId === "string" && _discLastPlayId) {
    discAskCoachQuestion(_discLastPlayId);
  }
}

/**
 * Open the playbook workflow panel for a play index, then pre-select Question type.
 * data-action="askCoachAboutPlay" data-arg="{playbookIndex}"
 */
async function askCoachAboutPlay(idxStr) {
  const idx = parseInt(idxStr, 10);
  if (isNaN(idx)) return;
  if (typeof openPlayWorkflowPanel !== "function") return;
  _discScriptContext = null; // playbook context, not script
  openPlayWorkflowPanel(idx);
  // Give workflow panel + discussion time to render
  await new Promise((r) => setTimeout(r, 600));
  const play = (typeof plays !== "undefined" && Array.isArray(plays)) ? plays[idx] : null;
  if (!play) return;
  const playId = getPlayThreadId(play);
  discAskCoachQuestion(playId);
}

// ── Presentation (Swipe View) Discussion Drawer ───────────────────────────────

/**
 * Get the play currently displayed in the presentation overlay.
 * Returns null if the presentation isn't open or no play is loaded.
 */
function _ppCurrentPlay() {
  if (typeof playPresentationState === "undefined") return null;
  const item = playPresentationState.items?.[playPresentationState.index];
  return item?.play || item || null;
}

/**
 * Open (or refresh) the discussion drawer for the current presentation play.
 * Called by the 💬 button and by syncPresentationDiscussion() on navigation.
 */
async function openPresentationDiscussion() {
  const play = _ppCurrentPlay();
  const drawer = document.getElementById("ppDiscDrawer");
  const btn = document.getElementById("playPresentationDiscBtn");
  if (!drawer) return;

  drawer.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  if (btn) btn.setAttribute("aria-pressed", "true");

  // Title
  const titleEl = document.getElementById("ppDiscDrawerTitle");
  if (titleEl && play) {
    const label = [play.formation, play.play].filter(Boolean).join(" ");
    titleEl.textContent = `💬 ${label || "Discussion"}`;
  }

  if (!play) {
    const body = document.getElementById("ppDiscDrawerBody");
    if (body) setInnerHTML(body, `<p class="disc-empty">No play selected.</p>`);
    return;
  }

  const playId = getPlayThreadId(play);
  const playSig = [play.formation, play.play].filter(Boolean).join(" ");

  const body = document.getElementById("ppDiscDrawerBody");
  if (body) {
    body.innerHTML = `<p class="disc-loading">Loading…</p>`;
  }

  await _discEnsureUserId();

  // Re-use the same load path as the workflow panel, targeting the drawer body
  if (body) {
    try {
      const res = await fetch(`/api/threads/${playId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to load");

      // Update button count badge
      if (btn && data.thread) {
        if (data.thread.total > 0) btn.dataset.count = data.thread.total;
        else delete btn.dataset.count;
      }

      _discRenderBody(body, data, playId, playSig);
    } catch (err) {
      setInnerHTML(
        body,
        `<p class="disc-error">Couldn't load: ${escapeHtml(err.message)}</p>` +
        `<button class="btn btn-xs" data-action="retryPresentationDiscussion">Retry</button>`,
      );
    }
  }
}

function closePresentationDiscussion() {
  const drawer = document.getElementById("ppDiscDrawer");
  if (drawer) {
    drawer.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
  }
  const btn = document.getElementById("playPresentationDiscBtn");
  if (btn) btn.setAttribute("aria-pressed", "false");
}

function togglePresentationDiscussion() {
  const drawer = document.getElementById("ppDiscDrawer");
  if (!drawer || drawer.hidden) {
    openPresentationDiscussion();
  } else {
    closePresentationDiscussion();
  }
}

/**
 * Called by play-presentation.js after navigation to refresh the drawer
 * if it's already open. The button count badge is also reset.
 */
function syncPresentationDiscussion() {
  const drawer = document.getElementById("ppDiscDrawer");
  if (!drawer || drawer.hidden) return;
  openPresentationDiscussion();
}

function retryPresentationDiscussion() {
  openPresentationDiscussion();
}

async function askPresentationQuestion() {
  await openPresentationDiscussion();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const play = _ppCurrentPlay();
  if (!play) return;
  discAskCoachQuestion(getPlayThreadId(play));
}

// ── Char count + keyboard shortcut ───────────────────────────────────────────

document.addEventListener("input", (e) => {
  const ta = e.target;
  if (!ta.classList.contains("disc-textarea") || ta.classList.contains("disc-edit-textarea")) return;
  const raw = ta.id || "";
  const id = raw.startsWith("discCompose-") ? raw.slice("discCompose-".length) : null;
  if (!id) return;
  const el = document.getElementById(`discChars-${id}`);
  if (el) {
    const len = ta.value.length;
    el.textContent = `${len} / 2000`;
    el.classList.toggle("disc-char-warn", len > 1800 && len < 1950);
    el.classList.toggle("disc-char-limit", len >= 1950);
  }
});

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
  const ta = e.target;
  if (!ta.classList.contains("disc-textarea") || ta.classList.contains("disc-edit-textarea")) return;
  e.preventDefault();
  const btn = ta.closest(".disc-composer")?.querySelector("[data-action='submitDiscPost']");
  if (btn) btn.click();
});

// ── Game Plan Discussion Counts ───────────────────────────────────────────────

/**
 * Load discussion counts for all plays rendered in the game plan board.
 * Updates .gp-disc-badge visibility and adds has-open-q class to the button.
 */
async function loadGamePlanDiscussionCounts() {
  const els = document.querySelectorAll("#gameplan [data-disc-play-id]");
  if (!els.length) return;

  const playIds = [...new Set([...els].map((el) => el.dataset.discPlayId))];
  if (!playIds.length) return;

  try {
    const params = playIds.map((id) => encodeURIComponent(id)).join(",");
    const res = await fetch(`/api/threads/batch-counts?plays=${params}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;

    const counts = data.counts || {};
    for (const el of els) {
      const playId = el.dataset.discPlayId;
      const info = counts[playId];
      const btn = el.querySelector(".gp-box-play-disc");
      const badge = el.querySelector(".gp-disc-badge");
      if (!btn || !badge) continue;
      if (!info || info.total === 0) continue;

      badge.textContent = String(info.total);
      badge.classList.remove("hidden");
      if (info.openQuestions > 0) btn.classList.add("has-open-q");
    }
  } catch (_) {
    // Silent — counts are progressive enhancement
  }
}

// ── Call Sheet Discussion Counts ──────────────────────────────────────────────

/**
 * Load discussion counts for all plays rendered in the call sheet.
 * Shows .cs-disc-warning badge when openQuestions > 0.
 */
async function loadCallSheetDiscussionCounts() {
  const els = document.querySelectorAll("#callSheetGrid [data-disc-play-id]");
  if (!els.length) return;

  const playIds = [...new Set([...els].map((el) => el.dataset.discPlayId))];
  if (!playIds.length) return;

  try {
    const params = playIds.map((id) => encodeURIComponent(id)).join(",");
    const res = await fetch(`/api/threads/batch-counts?plays=${params}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;

    const counts = data.counts || {};
    for (const el of els) {
      const playId = el.dataset.discPlayId;
      const info = counts[playId];
      if (!info || info.openQuestions === 0) continue;

      const warn = el.querySelector(".cs-disc-warning");
      if (warn) {
        warn.classList.remove("hidden");
        warn.title = `${info.openQuestions} open player question${info.openQuestions === 1 ? "" : "s"}`;
      }
    }
  } catch (_) {
    // Silent
  }
}

// ── Game Plan / Wristband Floating Discussion Modal ───────────────────────────

function _getOrCreateDiscModal() {
  let overlay = document.getElementById("gpDiscModalOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "gpDiscModalOverlay";
    overlay.className = "disc-floating-overlay";
    overlay.setAttribute("data-action", "closeGPDiscModalOverlay");
    overlay.innerHTML = `
      <div class="disc-floating-panel" role="dialog" aria-modal="true" aria-label="Play Discussion">
        <div class="disc-floating-header">
          <span id="gpDiscModalTitle" class="disc-floating-title">💬 Discussion</span>
          <button class="disc-floating-close" data-action="closeGPDiscModal" aria-label="Close discussion">×</button>
        </div>
        <div id="gpDiscModalBody" class="disc-floating-body"></div>
      </div>`;
    document.body.appendChild(overlay);
  }
  return overlay;
}

/**
 * Open a floating discussion modal for a game plan play.
 * Called via data-action="openGamePlanPlayDiscussion" with the play's disc ID.
 */
async function openGamePlanPlayDiscussion(discPlayId) {
  if (!discPlayId) return;

  // Find the matching play in the playbook
  const play = Array.isArray(plays)
    ? plays.find((p) => getPlayThreadId(p) === discPlayId)
    : null;
  if (!play) {
    showToast("Play not found in playbook", { duration: 2000, type: "error" });
    return;
  }

  const overlay = _getOrCreateDiscModal();
  const body = document.getElementById("gpDiscModalBody");
  const title = document.getElementById("gpDiscModalTitle");
  if (!body || !title) return;

  title.textContent = `💬 ${play.formation || ""} ${play.play || ""}`.trim();
  body.innerHTML = "";

  overlay.classList.add("visible");
  if (typeof trapFocus === "function") trapFocus(overlay);

  await renderDiscussionSection(play, body);
}

function closeGPDiscModal() {
  const overlay = document.getElementById("gpDiscModalOverlay");
  if (overlay) overlay.classList.remove("visible");
}

// ── Wristband Cell Popup Discussion ──────────────────────────────────────────

/**
 * Open discussion for the play currently loaded in the wristband cell popup.
 * Called via data-action="openWristbandCellDiscussion".
 */
async function openWristbandCellDiscussion() {
  const cell = typeof currentEditingCell !== "undefined" ? currentEditingCell : null;
  if (!cell) { showToast("No cell selected", { duration: 1500 }); return; }

  const cardData = Array.isArray(wristbandCards) ? wristbandCards[cell.cardIdx]?.data : null;
  const play = cardData ? cardData[cell.cellIdx] : null;
  if (!play) { showToast("No play in this cell", { duration: 1500 }); return; }

  const overlay = _getOrCreateDiscModal();
  const body = document.getElementById("gpDiscModalBody");
  const title = document.getElementById("gpDiscModalTitle");
  if (!body || !title) return;

  title.textContent = `💬 ${play.formation || ""} ${play.play || ""}`.trim();
  body.innerHTML = "";

  overlay.classList.add("visible");
  if (typeof trapFocus === "function") trapFocus(overlay);

  await renderDiscussionSection(play, body);
}

// ── Discussion Visual Attachments ─────────────────────────────────────────────

/**
 * Map of composerId → { id, r2_key, type, caption, sizeBytes, sourcePlayId }
 * Populated after a successful upload, consumed on post submit.
 */
const _discPendingAttachments = new Map();
/** Stores { file, playId } for failed uploads so the coach can retry. */
const _discFailedUploads = new Map();

/** Show/hide the uploading spinner and grey out the thumb. */
function _discSetUploadingState(composerId, isUploading) {
  const pendingEl = document.getElementById(`disc-pending-${composerId}`);
  const spinnerEl = document.getElementById(`disc-upload-spinner-${composerId}`);
  const retryEl = document.getElementById(`disc-upload-retry-${composerId}`);
  const removeEl = document.getElementById(`disc-remove-${composerId}`);
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
function _discShowRetryState(composerId) {
  const retryEl = document.getElementById(`disc-upload-retry-${composerId}`);
  const removeEl = document.getElementById(`disc-remove-${composerId}`);
  if (retryEl) retryEl.style.display = "inline-flex";
  if (removeEl) removeEl.disabled = false;
}

/** Clear the pending attachment thumbnail UI for a given composer. */
function _discClearPendingAttachmentUI(composerId) {
  const pendingEl = document.getElementById(`disc-pending-${composerId}`);
  const thumbEl = document.getElementById(`disc-pending-thumb-${composerId}`);
  if (pendingEl) pendingEl.style.display = "none";
  if (thumbEl) thumbEl.src = "";
}

/** Show the pending attachment thumbnail in the composer. */
function _discShowPendingAttachmentUI(composerId, previewUrl) {
  const pendingEl = document.getElementById(`disc-pending-${composerId}`);
  const thumbEl = document.getElementById(`disc-pending-thumb-${composerId}`);
  if (pendingEl) pendingEl.style.display = "flex";
  if (thumbEl) thumbEl.src = previewUrl;
}

/**
 * Upload a blob/file to /api/attachments/upload and return { id, r2_key, type, sizeBytes }.
 * Returns null on failure (already shows a toast).
 */
async function _discUploadAttachment(blob, type, caption, sourcePlayId) {
  const formData = new FormData();
  formData.append("file", blob, `disc-attach.${type === "markup" ? "png" : blob.name || "jpg"}`);
  formData.append("type", type === "markup" ? "markup" : "image");
  if (caption) formData.append("caption", caption);
  if (sourcePlayId) formData.append("playId", sourcePlayId);

  try {
    const res = await fetch("/api/attachments/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || "Attachment upload failed.", { duration: 4000, type: "error" });
      return null;
    }
    return { id: data.id, r2_key: data.r2_key, type: data.type, sizeBytes: data.sizeBytes };
  } catch (_) {
    showToast("Network error — attachment not uploaded.", { duration: 3000, type: "error" });
    return null;
  }
}

/**
 * Remove the pending attachment for a composer (called by "✕" remove button).
 * data-action="discRemovePendingAttachment" data-arg="{composerId}"
 */
function discRemovePendingAttachment(composerId) {
  composerId = String(composerId);
  _discPendingAttachments.delete(composerId);
  _discFailedUploads.delete(composerId);
  _discClearPendingAttachmentUI(composerId);
  // Also reset retry/spinner state in case it was showing
  const retryEl = document.getElementById(`disc-upload-retry-${composerId}`);
  const spinnerEl = document.getElementById(`disc-upload-spinner-${composerId}`);
  if (retryEl) retryEl.style.display = "none";
  if (spinnerEl) spinnerEl.style.display = "none";
}

/**
 * Retry a failed image upload using the stored file reference.
 * data-action="discRetryAttachmentUpload" data-arg="{composerId}"
 */
async function discRetryAttachmentUpload(composerId) {
  composerId = String(composerId);
  const failed = _discFailedUploads.get(composerId);
  if (!failed) return;
  const { file, playId, previewUrl } = failed;

  // Restore the preview and start uploading again
  _discShowPendingAttachmentUI(composerId, previewUrl);
  _discSetUploadingState(composerId, true);

  const result = await _discUploadAttachment(file, "image", "", playId);
  _discSetUploadingState(composerId, false);
  if (!result) {
    _discShowRetryState(composerId);
    return;
  }
  _discFailedUploads.delete(composerId);
  result.sourcePlayId = playId;
  _discPendingAttachments.set(composerId, result);
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
      const composerId = input.dataset.composerId;
      const playId = input.dataset.playId;
      // Show local preview immediately and start uploading state
      const previewUrl = URL.createObjectURL(file);
      _discShowPendingAttachmentUI(composerId, previewUrl);
      _discSetUploadingState(composerId, true);
      _discFailedUploads.delete(composerId);

      const result = await _discUploadAttachment(file, "image", "", playId);
      input.value = "";
      _discSetUploadingState(composerId, false);
      if (!result) {
        // Keep the preview visible but show retry — don't clear the thumb
        _discFailedUploads.set(composerId, { file, playId, previewUrl });
        _discShowRetryState(composerId);
        _discPendingAttachments.delete(composerId);
        return;
      }
      URL.revokeObjectURL(previewUrl);
      result.sourcePlayId = playId;
      _discPendingAttachments.set(composerId, result);
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

/** Open the play markup overlay. arg = "{composerId}::{playId}" */
async function discOpenMarkupOverlay(arg) {
  const sep = String(arg).indexOf("::");
  if (sep < 0) return;
  const composerId = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

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
  if (typeof trapFocus === "function") trapFocus(overlay);

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
  if (overlay) overlay.classList.remove("visible");
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

  let viewer = document.getElementById("discAttachmentViewer");
  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "discAttachmentViewer";
    viewer.className = "disc-attachment-viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", "Attachment viewer");
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
  if (typeof trapFocus === "function") trapFocus(viewer);
}

function closeDiscAttachmentViewer() {
  document.getElementById("discAttachmentViewer")?.classList.remove("visible");
}

// ── Phase 9: Ask Coach & Question Links ──────────────────────────────────────

/**
 * Pre-select the question type in the root composer for a given play.
 * data-action="discAskCoachQuestion" data-arg="{playId}"
 */
function discAskCoachQuestion(playId) {
  const sel = document.getElementById(`discType-${playId}`);
  const textarea = document.getElementById(`discCompose-${playId}`);
  if (sel) {
    sel.value = "question";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (textarea) {
    textarea.placeholder = "What's your question? (Ctrl+Enter to post)";
    textarea.focus();
    textarea.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/**
 * Copy a deep link to a specific question to the clipboard.
 * data-action="discCopyQuestionLink" data-arg="{postId}"
 */
async function discCopyQuestionLink(postId) {
  const playId = _discLastPlayId;
  if (!playId || !postId) return;
  const url = `${window.location.origin}${window.location.pathname}?disc=${encodeURIComponent(playId)}&post=${encodeURIComponent(postId)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Question link copied!", { duration: 2500, type: "success" });
  } catch (_) {
    showToast("Copy failed — try selecting the URL manually.", { duration: 3000, type: "error" });
  }
}

// ── URL deep-link: ?disc={playId}&post={postId} ───────────────────────────────
// When the app loads with these params, store them and highlight the target post
// once the matching discussion renders.

let _discDeepLinkPlayId = null;
let _discDeepLinkPostId = null;

(function _discParseDeepLink() {
  try {
    const p = new URLSearchParams(window.location.search);
    _discDeepLinkPlayId = p.get("disc") || null;
    _discDeepLinkPostId = p.get("post") || null;
  } catch (_) { /* benign: malformed query string */ }
})();

/**
 * Called after a discussion section renders — if deep-link params match the
 * current playId, scroll to and highlight the target post.
 */
function _discApplyDeepLink(playId) {
  if (!_discDeepLinkPlayId || _discDeepLinkPlayId !== playId || !_discDeepLinkPostId) return;
  const targetEl = document.getElementById(`disc-post-${_discDeepLinkPostId}`);
  if (!targetEl) return;
  targetEl.classList.add("disc-post--highlighted");
  targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => targetEl.classList.remove("disc-post--highlighted"), 4000);
  // Clear so we don't re-apply on subsequent renders
  _discDeepLinkPlayId = null;
  _discDeepLinkPostId = null;
}

// ── Wire file inputs whenever a composer is rendered ─────────────────────────

/**
 * On page load with ?disc={playId}, find the matching play and open the workflow
 * panel so the deep link resolves to the correct discussion.
 * Runs after DOMContentLoaded so the playbook is accessible.
 */
document.addEventListener("DOMContentLoaded", () => {
  if (!_discDeepLinkPlayId) return;
  // Poll briefly until plays array is populated (async playbook load)
  let attempts = 0;
  const interval = setInterval(() => {
    if (typeof plays === "undefined" || !Array.isArray(plays) || plays.length === 0) {
      if (++attempts > 20) clearInterval(interval); // give up after ~5 s
      return;
    }
    clearInterval(interval);
    const idx = plays.findIndex(
      (p) => typeof getPlayThreadId === "function" && getPlayThreadId(p) === _discDeepLinkPlayId
    );
    if (idx === -1) return; // play not found — deep link post highlight will still work if panel opens
    if (typeof openPlayWorkflowPanel === "function") {
      openPlayWorkflowPanel(idx);
    }
  }, 250);
});

/**
 * Wire attachment-related inputs in new composer nodes.
 * Called from openDiscReplyComposer and renderDiscussionSection.
 */
function _discWireComposerAttachments(container) {
  if (!container) return;
  _discWireAttachmentInputs(container);
}

