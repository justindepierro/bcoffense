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

function _discReactionsHtml(postId, reactions) {
  const reactionMap = {};
  for (const r of (reactions || [])) reactionMap[r.key] = r;

  const active = _REACTION_SUMMARY_ORDER
    .map((key) => ({ key, ...(reactionMap[key] || { count: 0, mine: false }) }))
    .filter((r) => r.count > 0)
    .slice(0, 3);

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
  return `<div class="disc-reactions">${chips}${openBtn}</div>`;
}

// ── Reaction picker ───────────────────────────────────────────────────────────

let _discPickerPostId = null;

function openDiscReactionPicker(postId) {
  _discPickerPostId = postId;
  let picker = document.getElementById("discReactionPicker");
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "discReactionPicker";
    picker.className = "disc-reaction-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Choose a reaction");
    document.body.appendChild(picker);
  }

  const btns = _REACTION_PICKER_ORDER.map((key) => {
    const meta = _REACTION_META[key] || { emoji: "?", label: key };
    return (
      `<button class="disc-picker-btn" data-action="selectDiscReaction" data-arg="${escapeHtml(postId)}::${key}"` +
      ` title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)}">` +
      `<span class="disc-picker-emoji">${meta.emoji}</span>` +
      `<span class="disc-picker-label">${escapeHtml(meta.label)}</span>` +
      `</button>`
    );
  }).join("");

  const closeBtn = `<button class="disc-picker-close" data-action="closeDiscReactionPicker" aria-label="Close">✕</button>`;
  setInnerHTML(picker, closeBtn + `<div class="disc-picker-grid">${btns}</div>`);
  picker.classList.add("visible");

  // Position near the react button
  const triggerBtn = document.querySelector(`[data-action="openDiscReactionPicker"][data-arg="${escapeHtml(postId)}"]`);
  if (triggerBtn) {
    const rect = triggerBtn.getBoundingClientRect();
    const pickerH = 200;
    const top = rect.bottom + 6 + window.scrollY;
    const adjustedTop = (rect.bottom + pickerH + 10 > window.innerHeight)
      ? rect.top - pickerH - 6 + window.scrollY
      : top;
    picker.style.top = `${adjustedTop}px`;
    picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
  }
}

function closeDiscReactionPicker() {
  const picker = document.getElementById("discReactionPicker");
  picker?.classList.remove("visible");
  _discPickerPostId = null;
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
  const label = { admin: "Admin", coach: "Coach", player: "Player" }[role] || role;
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

// ── Main render ───────────────────────────────────────────────────────────────

/**
 * Render the Discussion section into `container`.
 * Appends a disc-section div and async-populates it.
 */
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
  const userRole = window.currentAuthUser?.role;
  const isStaff = userRole === "coach" || userRole === "admin";
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

  const loadMore = hasMore && posts.length
    ? `<button class="btn btn-xs disc-load-more"
         data-action="loadMoreDiscussion"
         data-play-id="${escapeHtml(playId)}"
         data-cursor="${escapeHtml(posts[posts.length - 1]?.id || "")}">Load more…</button>`
    : "";

  const composer = canPost ? _discComposerHtml(playId, playSig) : `<p class="disc-locked">🔒 Thread is locked.</p>`;

  const lockCtrl = isStaff && thread
    ? `<div class="disc-thread-controls">` +
    `<button class="btn btn-xs disc-lock-btn" data-action="toggleDiscThreadLock"` +
    ` data-arg="${escapeHtml(playId)}::${isLocked ? "0" : "1"}">` +
    `${isLocked ? "🔓 Unlock Thread" : "🔒 Lock Thread"}</button>` +
    `</div>`
    : "";

  setInnerHTML(
    container,
    modBanner +
    `<div class="disc-posts" id="discPosts-${escapeHtml(playId)}">${postsHtml}</div>` +
    loadMore +
    composer +
    lockCtrl,
  );

  // Async: check moderation queue count for coaches
  if (isStaff) _discCheckModerationQueue();
}

function _discPostHtml(p, playId, isReply = false) {
  const mine = p.authorId === _discCurrentUserId;
  const isStaff = window.currentAuthUser?.role === "coach" || window.currentAuthUser?.role === "admin";
  const canAct = mine || isStaff;
  const isQuestion = p.postType === "question";
  const isResolved = p.questionState === "resolved" || p.questionState === "answered";

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

  // Moderation — held posts show a neutral placeholder to non-authors
  const isMine = p.authorId === _discCurrentUserId;
  const bodyContent = (p.moderationStatus === "pending_review" && !isStaff && !isMine)
    ? `<em class="disc-mod-placeholder">This post is under review.</em>`
    : escapeHtml(p.body);

  const qStateBadge = isQuestion ? _discQStateBadge(p.questionState) : "";
  const qCatBadge = isQuestion ? _discQCategoryBadge(p.questionCategory) : "";
  const typeIcon = isQuestion ? `<span class="disc-type-icon">❓</span>` : "";
  const coachHighlight = (p.authorRole === "coach" || p.authorRole === "admin") ? " disc-post--coach" : "";

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
    `<div class="disc-post${isResolved ? " disc-post--resolved" : ""}${coachHighlight}${isReply ? " disc-post--reply" : ""}"` +
    ` id="disc-post-${escapeHtml(p.id)}" data-post-id="${escapeHtml(p.id)}">` +
    `<div class="disc-post-avatar" style="background:${_DISC_ROLE_COLORS[p.authorRole] || "var(--color-text-muted)"}" aria-hidden="true">${escapeHtml(_discInitials(p.authorName))}</div>` +
    `<div class="disc-post-content">` +
    `<div class="disc-post-meta">` +
    `<span class="disc-author">${escapeHtml(p.authorName)}</span>` +
    _discRoleBadge(p.authorRole) +
    typeIcon + qStateBadge + qCatBadge +
    `<span class="disc-time" title="${escapeHtml(_discExactTime(p.createdAt))}">${escapeHtml(_discRelTime(p.createdAt))}</span>` +
    (p.editedAt ? `<span class="disc-edited">(edited)</span>` : "") +
    `</div>` +
    `<div class="disc-post-body" id="disc-body-${escapeHtml(p.id)}">${bodyContent}</div>` +
    _discReactionsHtml(p.id, p.reactions) +
    `<div class="disc-post-actions">` + replyBtn + resolveBtn + reopenBtn + editBtn + deleteBtn + `</div>` +
    `</div>` +
    replyComposerPlaceholder +
    repliesHtml +
    `</div>`
  );
}

function _discComposerHtml(playId, playSig, parentPostId = null) {
  const isReply = !!parentPostId;
  const placeholder = isReply ? "Write a reply… (Ctrl+Enter to post)" : "Add a comment… (Ctrl+Enter to post)";
  const idSuffix = isReply ? `reply-${parentPostId}` : playId;
  const typeSelect = isReply ? "" :
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

  return (
    `<div class="disc-composer${isReply ? " disc-composer--reply" : ""}">` +
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

  btn.disabled = true;
  btn.textContent = "Posting…";

  try {
    const res = await fetch(`/api/threads/${playId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, post_type: typeSelect?.value || "comment", question_category: document.getElementById(`discQCat-${playId}`)?.value || null, play_signature: playSig }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Failed to post.", { duration: 3000, type: "error" }); return; }

    // Show moderation warning if content was held or warned
    const mod = data.moderation || {};
    if (mod.displayWarning) {
      showToast(mod.displayWarning, { duration: 5000, type: mod.outcome === "block" ? "error" : "warning" });
    }

    // Only append to feed if post was approved
    if (data.post?.moderationStatus === "approved") {
      textarea.value = "";
      const charEl = document.getElementById(`discChars-${playId}`);
      if (charEl) charEl.textContent = "0 / 2000";

      const list = document.getElementById(`discPosts-${playId}`);
      if (list) {
        list.querySelector(".disc-empty")?.remove();
        const wrap = document.createElement("div");
        wrap.innerHTML = _discPostHtml(data.post, playId);
        const node = wrap.firstElementChild;
        if (node) {
          list.appendChild(node);
          node.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
      const countEl = document.getElementById("discCount");
      if (countEl) countEl.textContent = String(Math.max(0, parseInt(countEl.textContent || "0", 10) + 1));
    } else if (mod.outcome !== "block") {
      // Held — clear composer but don't add to feed
      textarea.value = "";
      const charEl = document.getElementById(`discChars-${playId}`);
      if (charEl) charEl.textContent = "0 / 2000";
    }
  } catch (_) {
    showToast("Network error — try again.", { duration: 3000, type: "error" });
  } finally {
    btn.disabled = false;
    btn.textContent = "Post";
  }
}

// ── Reply composer actions ────────────────────────────────────────────────────

function openDiscReplyComposer(arg) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const parentPostId = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

  // Close any other open reply composer
  document.querySelectorAll(".disc-composer--reply").forEach((c) => c.remove());

  const slot = document.getElementById(`disc-reply-slot-${parentPostId}`);
  if (!slot) return;

  // Find playSig from the main composer if available
  const playSig = _discLastPlaySig || "";

  slot.innerHTML = _discComposerHtml(playId, playSig, parentPostId);
  slot.querySelector("textarea")?.focus();
}

function closeDiscReplyComposer(parentPostId) {
  const slot = document.getElementById(`disc-reply-slot-${parentPostId}`);
  if (slot) slot.innerHTML = "";
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

  btn.disabled = true;
  btn.textContent = "Posting…";

  try {
    const res = await fetch(`/api/threads/${playId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, post_type: "comment", play_signature: playSig, parent_post_id: parentPostId }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Failed to post.", { duration: 3000, type: "error" }); return; }

    const mod = data.moderation || {};
    if (mod.displayWarning) {
      showToast(mod.displayWarning, { duration: 5000, type: mod.outcome === "block" ? "error" : "warning" });
    }

    // Close the reply composer
    closeDiscReplyComposer(parentPostId);

    if (data.post?.moderationStatus === "approved") {
      // Append reply to the replies list
      let repliesEl = document.getElementById(`disc-replies-${parentPostId}`);
      if (!repliesEl) {
        repliesEl = document.createElement("div");
        repliesEl.className = "disc-replies";
        repliesEl.id = `disc-replies-${parentPostId}`;
        const slot = document.getElementById(`disc-reply-slot-${parentPostId}`);
        slot?.insertAdjacentElement("beforebegin", repliesEl);
      }
      const wrap = document.createElement("div");
      wrap.innerHTML = _discPostHtml(data.post, playId, true);
      const node = wrap.firstElementChild;
      if (node) {
        // Remove "View N more" button before appending
        repliesEl.querySelector(".disc-load-replies")?.remove();
        repliesEl.appendChild(node);
        node.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  } catch (_) {
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

    // Build a modal with each post and approve/reject actions
    let html = `<div class="disc-mod-queue">`;
    for (const p of data.posts) {
      html += `<div class="disc-mod-item" data-post-id="${escapeHtml(p.id)}">` +
        `<div class="disc-mod-item-meta">` +
        `<strong>${escapeHtml(p.authorName)}</strong>` +
        ` <span class="disc-role-badge disc-role-badge--${escapeHtml(p.authorRole)}">${escapeHtml(p.authorRole)}</span>` +
        ` <span class="disc-mod-status">${escapeHtml(p.moderationStatus)}</span>` +
        ` — ${escapeHtml(p.modReason || "Auto-flagged")}` +
        `</div>` +
        `<div class="disc-mod-body">${escapeHtml(p.body)}</div>` +
        `<div class="disc-mod-actions">` +
        `<button class="btn btn-xs btn-success" data-action="approveDiscPost" data-arg="${escapeHtml(p.id)}">✅ Approve</button>` +
        `<button class="btn btn-xs btn-danger" data-action="rejectDiscPost" data-arg="${escapeHtml(p.id)}">🗑 Reject</button>` +
        `</div>` +
        `</div>`;
    }
    html += `</div>`;

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

async function _discModerationAction(postId, action, reason) {
  try {
    const res = await fetch(`/api/moderation/${encodeURIComponent(postId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
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

  // Disable all reaction buttons for this post while requesting
  const postEl = document.getElementById(`disc-post-${postId}`);
  postEl?.querySelectorAll(".disc-react-btn").forEach((b) => { b.disabled = true; });

  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction_key: reactionKey }),
    });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || "Failed to react.", { duration: 2500, type: "error" });
      return;
    }
    _discUpdateReactions(postId, data.reactions);
  } catch (_) {
    showToast("Network error.", { duration: 2500, type: "error" });
  } finally {
    postEl?.querySelectorAll(".disc-react-btn").forEach((b) => { b.disabled = false; });
  }
}

function _discUpdateReactions(postId, reactions) {
  // Replace the whole reactions bar with fresh HTML
  const postEl = document.getElementById(`disc-post-${postId}`);
  if (!postEl) return;
  const existing = postEl.querySelector(".disc-reactions");
  if (!existing) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = _discReactionsHtml(postId, reactions);
  const newBar = tmp.firstElementChild;
  if (newBar) existing.replaceWith(newBar);
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
        const lockCtrlEl = document.querySelector(".disc-thread-controls");
        if (lockCtrlEl) {
          lockCtrlEl.insertAdjacentElement("beforebegin", tmp.firstElementChild);
        } else {
          const body = document.getElementById("discBody");
          if (body) body.appendChild(tmp.firstElementChild);
        }
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

  if (typeof openScriptPresentation === "function") {
    openScriptPresentation(idx);
  }

  // Brief wait for the presentation overlay to render
  await new Promise((r) => setTimeout(r, 250));

  if (typeof openPresentationDiscussion === "function") {
    openPresentationDiscussion();
  }
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

// ── Char count + keyboard shortcut ───────────────────────────────────────────

document.addEventListener("input", (e) => {
  const ta = e.target;
  if (!ta.classList.contains("disc-textarea") || ta.classList.contains("disc-edit-textarea")) return;
  const raw = ta.id || "";
  const id = raw.startsWith("discCompose-") ? raw.slice("discCompose-".length) : null;
  if (!id) return;
  const el = document.getElementById(`discChars-${id}`);
  if (el) el.textContent = `${ta.value.length} / 2000`;
});

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
  const ta = e.target;
  if (!ta.classList.contains("disc-textarea") || ta.classList.contains("disc-edit-textarea")) return;
  e.preventDefault();
  const btn = ta.closest(".disc-composer")?.querySelector("[data-action='submitDiscPost']");
  if (btn) btn.click();
});

