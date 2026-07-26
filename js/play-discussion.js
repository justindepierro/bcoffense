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

// Rendering can start while auth.js is still validating the secure session.
// Count badges are optional, so wait for a verified identity rather than
// calling a protected endpoint early and creating a noisy 401 in the console.
function _discCanFetchRemote() {
  return Boolean(_discAuthUser());
}

async function _discFetchBatchCounts(playIds) {
  if (!_discCanFetchRemote()) return null;
  const ids = [...new Set((playIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return {};

  // IDs are already path-encoded by getPlayThreadId. Re-encoding them made
  // giant Game Plan requests both incorrect and large enough to trip a Pages
  // 500. Keep each query modest and combine the optional badge results.
  const counts = {};
  const BATCH_SIZE = 40;
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const params = ids.slice(index, index + BATCH_SIZE).join(",");
    const res = await fetch(`/api/threads/batch-counts?plays=${params}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    // A session may expire in another tab. Counts are progressive enhancement,
    // so leave the badges quiet until the next authenticated render.
    if (res.status === 401 || !res.ok) return null;
    const data = await res.json();
    if (data.ok) Object.assign(counts, data.counts || {});
  }
  return counts;
}

function _discIsStaff() {
  const role = _discAuthUser()?.role;
  return role === "coach" || role === "admin" || role === "assistant" || role === "assistant_coach";
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
// Keep the most useful communication choices visible first. The legacy
// celebratory set remains available under More, and existing reactions remain
// readable in the feed.
const _REACTION_QUICK_PICKER_ORDER = [
  "got_it", "helpful", "same_question", "thumbs_up", "football", "thumbs_down",
];
const _REACTION_MORE_PICKER_ORDER = [
  "heart", "gold_medal", "six", "happy", "strong",
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
      ` title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)} — ${r.count} reaction${r.count === 1 ? "" : "s"}" aria-pressed="${r.mine ? "true" : "false"}">` +
      `<span aria-hidden="true">${meta.emoji}</span> <span class="disc-react-count">${r.count}</span></button>`
    );
  }).join("");

  const openBtn = `<button class="disc-react-open-btn" data-action="openDiscReactionPicker" data-arg="${escapeHtml(postId)}" aria-label="Add a reaction"><span aria-hidden="true">🙂</span> React</button>`;
  const seeAllBtn = active.length > 0
    ? `<button class="disc-react-see-all" data-action="openDiscReactionBreakdown" data-arg="${escapeHtml(postId)}" title="See who reacted" aria-label="See all reactions">⋯</button>`
    : "";
  const userReactionAttr = mineReaction ? ` data-user-reaction="${escapeHtml(mineReaction.key)}"` : "";
  return `<div class="disc-reactions" role="group" aria-label="Post reactions"${userReactionAttr}>${chips}${seeAllBtn}${openBtn}</div>`;
}

// ── Reaction picker ───────────────────────────────────────────────────────────

let _discPickerPostId = null;
let _discPickerTrigger = null;
let _discPickerScopeRoot = null;
let _discPickerEscHandler = null;
let _discPickerArrowHandler = null;
let _discReplyTrigger = null;

function openDiscReactionPicker(postId, el) {
  _discPickerPostId = postId;
  _discPickerTrigger = el instanceof Element ? el : null;
  _discPickerScopeRoot = _discScopeRoot(_discPickerTrigger);
  if (!_discPickerTrigger) {
    _discPickerTrigger = document.querySelector(`[data-action="openDiscReactionPicker"][data-arg="${CSS.escape(String(postId))}"]`);
    _discPickerScopeRoot = _discScopeRoot(_discPickerTrigger);
  }

  let picker = document.getElementById("discReactionPicker");
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "discReactionPicker";
    picker.className = "disc-reaction-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Choose a reaction");
    document.body.appendChild(picker);
  }
  let pickerOverlay = document.getElementById("discReactionPickerOverlay");
  if (!pickerOverlay) {
    pickerOverlay = document.createElement("div");
    pickerOverlay.id = "discReactionPickerOverlay";
    pickerOverlay.className = "disc-reaction-picker-overlay";
    pickerOverlay.addEventListener("click", closeDiscReactionPicker);
    document.body.appendChild(pickerOverlay);
  }

  // Find user's current reaction for this post from the reactions bar
  const reactionsEl = _discPostInScope(_discPickerScopeRoot, postId)?.querySelector(".disc-reactions") || null;
  const userReaction = reactionsEl?.dataset?.userReaction || null;

  const reactionButtons = (keys) => keys.map((key) => {
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
  const quickButtons = reactionButtons(_REACTION_QUICK_PICKER_ORDER);
  const moreButtons = reactionButtons(_REACTION_MORE_PICKER_ORDER);

  const closeBtn = `<button class="disc-picker-close" data-action="closeDiscReactionPicker" aria-label="Close reaction picker">✕</button>`;
  setInnerHTML(picker,
    `<div class="disc-picker-head"><div><strong>React</strong><span>Choose a quick response</span></div>${closeBtn}</div>` +
    `<div class="disc-picker-grid" role="group" aria-label="Quick reactions">${quickButtons}</div>` +
    `<details class="disc-picker-more">` +
      `<summary>More reactions</summary>` +
      `<div class="disc-picker-grid" role="group" aria-label="More reactions">${moreButtons}</div>` +
    `</details>`);

  // Bottom sheet on very narrow screens; use fixed positioning throughout
  const useBottomSheet = window.innerWidth <= 480;
  picker.classList.toggle("is-bottom-sheet", useBottomSheet);
  picker.setAttribute("aria-modal", useBottomSheet ? "true" : "false");
  picker.setAttribute("aria-hidden", "false");
  pickerOverlay.setAttribute("aria-hidden", useBottomSheet ? "false" : "true");
  pickerOverlay.classList.toggle("visible", useBottomSheet);
  picker.classList.add("visible");
  if (useBottomSheet && typeof openLayer === "function") {
    // Phone reactions are a true blocking sheet. Keep the desktop picker a
    // lightweight anchored popover, but give the touch surface the same body
    // lock and focus behavior as every other mobile decision layer.
    openLayer(picker, {
      id: "discussion-reaction-picker",
      scrollElement: picker,
      blocking: true,
      exclusive: false,
      safeArea: false,
    });
  }

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
  if (typeof closeLayer === "function") {
    closeLayer(picker, { returnFocus: false });
  }
  picker?.classList.remove("visible");
  picker?.classList.remove("is-bottom-sheet");
  picker?.setAttribute("aria-modal", "false");
  picker?.setAttribute("aria-hidden", "true");
  const pickerOverlay = document.getElementById("discReactionPickerOverlay");
  pickerOverlay?.classList.remove("visible");
  pickerOverlay?.setAttribute("aria-hidden", "true");
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
  _discPickerScopeRoot = null;
}

async function selectDiscReaction(arg, el) {
  const trigger = _discPickerTrigger;
  closeDiscReactionPicker();
  await toggleDiscReaction(arg, trigger || el);
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
  const composer = el?.closest(".disc-composer");
  const isQuestion = el?.value === "question";
  const row = composer?.querySelector(".disc-q-category-row");
  if (row) row.hidden = !isQuestion;
  composer?.querySelectorAll(".disc-composer-mode-btn").forEach((button) => {
    const isActive = button.dataset.discType === (isQuestion ? "question" : "comment");
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

/**
 * Switch the root composer between a general comment and a coach question.
 * The native select remains the data source so the existing submit path stays
 * stable; these buttons are the fast, touch-friendly control surface.
 */
function switchDiscComposerType(arg) {
  const el = arguments[1];
  const value = String(arg || "");
  const sep = value.lastIndexOf("::");
  if (sep < 1) return;
  const playId = value.slice(0, sep);
  const type = value.slice(sep + 2) === "question" ? "question" : "comment";
  const scopeRoot = _discResolveScope(el, playId);
  const composer = _discRootComposer(scopeRoot);
  const select = composer?.querySelector(".disc-type-select") || null;
  if (!select) return;
  select.value = type;
  discToggleQCategory(select);
  const textarea = composer?.querySelector("textarea.disc-textarea") || null;
  if (textarea) {
    textarea.placeholder = type === "question"
      ? "What is your question?"
      : "Write a message…";
  }
}

function _discQStateBadge(state) {
  if (!state || state === "open") return "";
  const m = _Q_STATE_META[state] || { label: state, icon: "❓", cls: "open" };
  return `<span class="disc-q-state disc-q-state--${m.cls}">${m.icon} ${escapeHtml(m.label)}</span>`;
}

function _discRoleBadge(role) {
  if (!role || role === "player") return "";
  const label = { admin: "Admin", coach: "Coach", assistant: "Asst. Coach", assistant_coach: "Asst. Coach" }[role] || String(role);
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
let _discScopeSequence = 0;
// Discussion can be open in more than one surface at once. Keep the latest
// server snapshot in memory for an instant reopen, but always revalidate it.
// This is deliberately session-only: discussion content is authenticated and
// should not be left in persistent browser storage after logout.
const _discThreadCache = new Map();
const _discLoadControllers = new WeakMap();

// A play thread can legitimately be open in the playbook, Game Plan, and the
// swipe drawer at the same time.  Those surfaces used to share document-wide
// IDs, so an action in one surface could silently update the first matching
// copy elsewhere in the DOM.  Keep every interaction rooted in the body that
// rendered it instead of relying on document.getElementById().
function _discEnsureScope(container) {
  if (!container?.dataset) return "";
  if (!container.dataset.discScope) {
    const base = String(container.id || "discussion").replace(/[^a-zA-Z0-9_-]/g, "-");
    container.dataset.discScope = `${base}-${++_discScopeSequence}`;
  }
  return container.dataset.discScope;
}

function _discScopeRoot(el) {
  if (!(el instanceof Element)) return null;
  const root = el.closest("[data-disc-scope]");
  if (root && root.id !== "discReplySheet") return root;
  if (root?.id === "discReplySheet") {
    const sheetScope = root.dataset.discScope;
    return sheetScope
      ? Array.from(document.querySelectorAll("[data-disc-scope]")).find(
        (candidate) => candidate !== root && candidate.dataset.discScope === sheetScope,
      ) || null
      : null;
  }
  const sheetScope = el.closest("#discReplySheet")?.dataset?.discScope;
  return sheetScope
    ? document.querySelector(`[data-disc-scope="${CSS.escape(sheetScope)}"]`)
    : null;
}

function _discPostsRoot(scopeRoot) {
  return scopeRoot?.querySelector("[data-disc-posts]") || null;
}

function _discPostInScope(scopeRoot, postId) {
  if (!scopeRoot || !postId) return null;
  return Array.from(scopeRoot.querySelectorAll(".disc-post[data-post-id]")).find(
    (post) => post.dataset.postId === String(postId),
  ) || null;
}

function _discReplySlotInScope(scopeRoot, postId) {
  return Array.from(scopeRoot?.querySelectorAll("[data-disc-reply-slot]") || []).find(
    (slot) => slot.dataset.discReplySlot === String(postId),
  ) || null;
}

function _discRepliesInScope(scopeRoot, postId) {
  return Array.from(scopeRoot?.querySelectorAll("[data-disc-replies]") || []).find(
    (replies) => replies.dataset.discReplies === String(postId),
  ) || null;
}

function _discRootComposer(scopeRoot) {
  return scopeRoot?.querySelector(".disc-composer[data-disc-root-composer]") || null;
}

// Attachment drafts belong to a *visible composer*, not just a play. A coach
// can have the same play open in the playbook, Game Plan, and swipe view at
// once, so a play-only key would let one panel overwrite another panel's draft.
function _discComposerKey(composer) {
  if (!(composer instanceof Element)) return "";
  const scope = _discScopeRoot(composer)?.dataset?.discScope || "discussion";
  const token = composer.dataset.discComposerToken || "root";
  return `${scope}::${token}`;
}

function _discComposerForKey(composerKey) {
  return Array.from(document.querySelectorAll(".disc-composer")).find(
    (composer) => _discComposerKey(composer) === String(composerKey),
  ) || null;
}

function _discCountInScope(scopeRoot) {
  return scopeRoot?.closest(".disc-section")?.querySelector(".disc-count") || null;
}

function _discCacheKey(playId) {
  const user = _discAuthUser();
  return `${String(user?.username || user?.d1UserId || user?.label || "session")}::${String(playId || "")}`;
}

function _discInvalidateThreadCache(playId) {
  if (!playId) return;
  _discThreadCache.delete(_discCacheKey(playId));
}

function _discScopePlaySignature(scopeRoot, fallback = "") {
  return String(scopeRoot?.dataset?.discPlaySig || fallback || "");
}

function _discCurrentBodyForPlay(playId) {
  const bodies = Array.from(document.querySelectorAll(".disc-body[data-disc-play-id]"));
  return bodies.find((body) => body.dataset.discPlayId === String(playId)) || null;
}

function _discResolveScope(el, playId = "") {
  return _discScopeRoot(el) || _discCurrentBodyForPlay(playId);
}

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
    `<span class="disc-count"></span>` +
    `</div>` +
    `<div class="disc-body"><p class="disc-loading">Loading…</p></div>`;
  container.appendChild(section);

  await _discEnsureUserId();
  await _discLoadBody(playId, playSig, section.querySelector(".disc-body"));
}

async function _discLoadBody(playId, playSig, bodyEl) {
  if (!bodyEl) return;
  _discEnsureScope(bodyEl);
  bodyEl.dataset.discPlayId = String(playId);
  bodyEl.dataset.discPlaySig = String(playSig || "");

  // A panel can be destroyed or reused while a request is still in flight.
  // Abort its older request so a slow response can never repaint the wrong play.
  _discLoadControllers.get(bodyEl)?.abort();
  const controller = new AbortController();
  _discLoadControllers.set(bodyEl, controller);
  const cacheKey = _discCacheKey(playId);
  const cached = _discThreadCache.get(cacheKey) || null;

  if (cached?.data) {
    _discRenderBody(bodyEl, cached.data, playId, playSig);
    _discApplyDeepLink(playId, bodyEl);
  } else {
    setInnerHTML(bodyEl, `<p class="disc-loading">Loading…</p>`);
  }

  try {
    const headers = cached?.etag ? { "If-None-Match": cached.etag } : {};
    const res = await fetch(`/api/threads/${playId}`, { headers, signal: controller.signal });
    if (controller.signal.aborted || _discLoadControllers.get(bodyEl) !== controller || !bodyEl.isConnected) return;
    if (res.status === 304 && cached?.data) {
      _discApplyDeepLink(playId, bodyEl);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to load");

    _discThreadCache.set(cacheKey, {
      data,
      etag: res.headers.get("ETag") || "",
      receivedAt: Date.now(),
    });

    const countEl = _discCountInScope(bodyEl);
    if (countEl && data.thread) countEl.textContent = String(data.thread.total);

    _discRenderBody(bodyEl, data, playId, playSig);
    _discApplyDeepLink(playId, bodyEl);
  } catch (err) {
    if (err?.name === "AbortError" || controller.signal.aborted) return;
    // A cached thread is still useful if a quiet revalidation fails. Keep the
    // conversation readable instead of replacing it with a failure screen.
    if (cached?.data) return;
    setInnerHTML(
      bodyEl,
      `<p class="disc-error">Couldn't load discussion: ${escapeHtml(err.message)}</p>` +
      `<button class="btn btn-xs" data-action="retryDiscussion">Retry</button>`,
    );
  }
}

function _discRenderBody(container, data, playId, playSig) {
  const { thread, posts, hasMore } = data;
  _discEnsureScope(container);
  const isPresentationDrawer = container.id === "ppDiscDrawerBody";
  container.classList.toggle("pp-discussion-body", isPresentationDrawer);
  const isLocked = thread?.locked;
  const userRole = _discAuthUser()?.role;
  const isStaff = ["coach", "admin", "assistant", "assistant_coach"].includes(userRole);
  const canPost = !isLocked || isStaff;

  // Coach moderation queue banner
  const modBanner = isStaff
    ? `<div class="disc-mod-banner" data-disc-mod-banner style="display:none">` +
    `<span class="disc-mod-badge" data-disc-mod-count></span>` +
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
    `<div class="disc-posts" data-disc-posts role="feed" aria-label="Discussion thread">${postsHtml}</div>` +
    loadMore +
    askCoachBtn +
    composer +
    monitoringNotice +
    lockCtrl,
  );
  _discWireComposerAttachments(container);

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
    ? `<button class="disc-reply-btn" data-action="openDiscReplyComposer" data-arg="${escapeHtml(p.id)}::${escapeHtml(playId)}" title="Reply to ${escapeHtml(p.authorName)}"><span aria-hidden="true">↩</span> Reply</button>`
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
  const coachHighlight = (p.authorRole === "coach" || p.authorRole === "admin" || p.authorRole === "assistant" || p.authorRole === "assistant_coach") ? " disc-post--coach" : "";

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
    `<span aria-hidden="true">❓</span> Same question${sameQCount > 1 ? ` <span class="disc-same-q-count">· ${sameQCount}</span>` : ""}` +
    `</button>`
    : "";
  const canRewardDiscussion = isStaff && p.authorRole === "player" && !String(p.id || "").startsWith("opt-");
  const discussionRewardBtn = canRewardDiscussion && isQuestion && !isReply
    ? `<button class="disc-reward-btn" data-action="coachStageDiscussionReward" data-arg="${escapeHtml(p.id)}::question" title="Stage question points for approval">🏆 Question +</button>`
    : canRewardDiscussion && isReply
      ? `<button class="disc-reward-btn" data-action="coachStageDiscussionReward" data-arg="${escapeHtml(p.id)}::answer" title="Stage answer points for approval">🏆 Answer +</button>`
      : "";

  // ── Actions: Reply always visible; edit/delete/moderate in ⋯ more menu ──
  const inlineActions = replyBtn + sameQBtn + discussionRewardBtn;
  const moreItems = [resolveBtn, reopenBtn, pinBtn, copyLinkBtn, editBtn, deleteBtn].filter(Boolean).join("");
  const moreMenu = moreItems
    ? `<details class="disc-more-wrap">` +
    `<summary class="disc-more-btn" title="More options" aria-label="More options">⋯</summary>` +
    `<div class="disc-more-menu">${moreItems}</div></details>`
    : "";
  const actionsHtml = (inlineActions || moreMenu)
    ? `<div class="disc-post-actions">${inlineActions}${moreMenu}</div>`
    : "";

  // Render inline replies
  const replies = p.replies || [];
  const replyCount = p.replyCount || 0;
  const shownCount = replies.length;
  const hiddenCount = replyCount - shownCount;

  const repliesHtml = replies.length
    ? `<div class="disc-replies" data-disc-replies="${escapeHtml(p.id)}">` +
    replies.map((r) => _discPostHtml(r, playId, true)).join("") +
    (hiddenCount > 0
      ? `<button class="btn btn-xs disc-load-replies" data-action="loadMoreDiscReplies"` +
      ` data-arg="${escapeHtml(p.id)}" data-cursor="${escapeHtml(replies[replies.length - 1]?.id || "")}">` +
      `View ${hiddenCount} more repl${hiddenCount === 1 ? "y" : "ies"}…</button>`
      : "") +
    `</div>`
    : (replyCount > 0
      ? `<div class="disc-replies" data-disc-replies="${escapeHtml(p.id)}">` +
      `<button class="btn btn-xs disc-load-replies" data-action="loadMoreDiscReplies"` +
      ` data-arg="${escapeHtml(p.id)}" data-cursor="">` +
      `View ${replyCount} repl${replyCount === 1 ? "y" : "ies"}…</button>` +
      `</div>`
      : "");

  // Inline reply composer placeholder (rendered on demand)
  const replyComposerPlaceholder = !isReply
    ? `<div class="disc-reply-composer-slot" data-disc-reply-slot="${escapeHtml(p.id)}"></div>`
    : "";

  return (
    `<div class="disc-post${isResolved ? " disc-post--resolved" : ""}${isOfficial ? " disc-post--official" : ""}${coachHighlight}${isReply ? " disc-post--reply" : ""}"` +
    ` data-post-id="${escapeHtml(p.id)}"` +
    ` data-post-type="${escapeHtml(p.postType || "comment")}"` +
    (p.questionCategory ? ` data-q-category="${escapeHtml(p.questionCategory)}"` : "") +
    ` data-is-official="${isOfficial ? "1" : "0"}"` +
    ` role="article"` +
    ` data-author-name="${escapeHtml(p.authorName)}" data-author-role="${escapeHtml(p.authorRole || "")}" data-body-text="${escapeHtml((p.body || "").slice(0, 120))}">` +
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
    `<div class="disc-post-body">${bodyContent}</div>` +
    _discAttachmentsHtml(p.attachments) +
    `<div class="disc-post-footer">` +
    _discReactionsHtml(p.id, p.reactions, (isQuestion && !isReply) ? "same_question" : null) +
    actionsHtml +
    `</div>` +
    `</div>` +
    replyComposerPlaceholder +
    repliesHtml +
    `</div>`
  );
}

function setDiscFilter(arg, el) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const filter = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

  const container = _discScopeRoot(el) || null;
  const postsEl = _discPostsRoot(container);

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
      const replySlot = _discReplySlotInScope(container, pid);
      const replies = _discRepliesInScope(container, pid);
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

function setDiscQCategory(arg, el) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const cat = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

  const container = _discScopeRoot(el) || null;
  const postsEl = _discPostsRoot(container);
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
  const placeholder = isReply ? "Write a reply…" : "Write a message…";
  const composerToken = isReply ? `reply-${parentPostId}` : "root";
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
    ? `<select class="disc-type-select disc-type-select--reply" aria-label="Reply type">` +
    `<option value="comment">Reply</option>` +
    `<option value="coach_clarification">Clarification 📋</option>` +
    `</select>`
    : "";
  const rootComposerMode = !isReply
    ? `<div class="disc-composer-mode" role="group" aria-label="Choose message type">` +
      `<button type="button" class="disc-composer-mode-btn is-active" data-action="switchDiscComposerType"` +
      ` data-arg="${escapeHtml(playId)}::comment" data-disc-type="comment" aria-pressed="true"><span aria-hidden="true">💬</span> Comment</button>` +
      `<button type="button" class="disc-composer-mode-btn" data-action="switchDiscComposerType"` +
      ` data-arg="${escapeHtml(playId)}::question" data-disc-type="question" aria-pressed="false"><span aria-hidden="true">❓</span> Ask question</button>` +
      `</div>`
    : "";
  const typeSelect = isReply ? clarifySelect :
    `<select class="disc-type-select disc-type-select--native" aria-hidden="true" tabindex="-1"
      data-onchange="discToggleQCategory" data-pass="event">` +
    `<option value="comment">Comment</option>` +
    `<option value="question">Question ❓</option>` +
    `</select>`;
  const questionCategory = !isReply
    ? `<div class="disc-q-category-row" hidden>` +
    `<span class="disc-q-category-label">Question topic</span>` +
    `<select class="disc-cat-select" aria-label="Question category">` +
    `<option value="">General</option>` +
    `<option value="assignment">Assignment</option>` +
    `<option value="technique">Technique</option>` +
    `<option value="front">Front</option>` +
    `<option value="coverage">Coverage</option>` +
    `<option value="motion">Motion</option>` +
    `<option value="protection">Protection</option>` +
    `<option value="read">Read</option>` +
    `</select></div>`
    : "";

  // Coach-only attachment buttons (hidden input + markup overlay trigger)
  const attachBtns = isStaff
    ? `<div class="disc-composer-attach-row">` +
    `<button class="btn btn-xs disc-attach-btn" data-action="discOpenMarkupOverlay"` +
    ` data-play-id="${escapeHtml(playId)}" title="Annotate play diagram">` +
    `✏️ Mark Up Play</button>` +
    `<label class="btn btn-xs disc-attach-btn" title="Attach image">` +
    `📎 Image` +
    `<input type="file" accept="image/jpeg,image/png,image/webp" class="disc-img-file-input"` +
    ` data-play-id="${escapeHtml(playId)}" style="display:none">` +
    `</label>` +
    `<div class="disc-pending-attachment" data-disc-pending-attachment style="display:none">` +
    `<img class="disc-pending-thumb" alt="Pending attachment" src="">` +
    `<span class="disc-upload-spinner" aria-hidden="true"></span>` +
    `<button class="btn btn-xs disc-upload-retry-btn"` +
    ` style="display:none" data-action="discRetryAttachmentUpload">↺ Retry</button>` +
    `<button class="btn btn-xs disc-remove-attach-btn" data-action="discRemovePendingAttachment">✕</button>` +
    `</div>` +
    `</div>`
    : "";

  return (
    `<div class="disc-composer${isReply ? " disc-composer--reply" : ""}" data-disc-composer-token="${escapeHtml(composerToken)}"${isReply ? "" : " data-disc-root-composer"}>${posCtx}` +
    attachBtns +
    rootComposerMode +
    typeSelect +
    questionCategory +
    `<textarea class="disc-textarea"` +
    ` placeholder="${escapeHtml(placeholder)}" rows="2" maxlength="2000" aria-label="${escapeHtml(placeholder)}"></textarea>` +
    `<div class="disc-composer-actions">` +
    `<span class="disc-char-count">0 / 2000</span>` +
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

async function _discSendDurable(payload) {
  // The outbox writes first, then either delivers immediately or keeps the
  // exact post for a safe retry. The small fallback preserves discussion
  // posting if IndexedDB is unavailable in an unusually restricted browser.
  if (window.discussionOutbox?.send) return window.discussionOutbox.send(payload);
  const res = await fetch(`/api/threads/${encodeURIComponent(payload.playId)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body: payload.body,
      post_type: payload.postType,
      question_category: payload.questionCategory || null,
      play_signature: payload.playSig || "",
      parent_post_id: payload.parentPostId || null,
      attachment: payload.attachment || undefined,
      client_post_id: payload.id,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data.ok
    ? { sent: true, data }
    : { rejected: true, error: data.error || `HTTP ${res.status}`, data };
}

async function submitDiscPost(arg, el) {
  // When called from _ELEMENT_FNS with no data-arg, element is first param
  const btn = (el instanceof Element) ? el : (arg instanceof Element ? arg : null);
  const playId = btn?.dataset?.playId;
  const playSig = btn?.dataset?.playSig || "";
  if (!playId) return;

  const scopeRoot = _discResolveScope(btn, playId);
  const composer = _discRootComposer(scopeRoot);
  const textarea = composer?.querySelector("textarea.disc-textarea") || null;
  const typeSelect = composer?.querySelector(".disc-type-select") || null;
  if (!textarea) return;

  const body = textarea.value.trim();
  if (!body) { textarea.focus(); return; }

  btn.disabled = true;
  btn.textContent = "Posting…";

  // ── Optimistic render ──────────────────────────────────────────────────────
  const optimisticPost = {
    id: crypto.randomUUID(),
    body,
    postType: typeSelect?.value || "comment",
    questionCategory: composer?.querySelector(".disc-cat-select")?.value || "",
    authorName: _discAuthUser()?.name || _discAuthUser()?.username || "You",
    authorRole: _discAuthUser()?.role || "player",
    authorId: _discCurrentUserId || "me",
    reactions: [], replyCount: 0, replies: [],
    createdAt: new Date().toISOString(),
  };
  const list = _discPostsRoot(scopeRoot);
  let optimisticNode = null;
  if (list) {
    list.querySelector(".disc-empty")?.remove();
    const wrap = document.createElement("div");
    wrap.innerHTML = _discPostHtml(optimisticPost, playId);
    optimisticNode = wrap.firstElementChild;
    if (optimisticNode) {
      optimisticNode.classList.add("disc-post--pending");
      list.appendChild(optimisticNode);
      scrollElementWithinPanel(optimisticNode, { behavior: "smooth", block: "nearest" });
    }
  }
  // Clear composer immediately for snappy feel
  textarea.value = "";
  const charElOpt = composer?.querySelector(".disc-char-count") || null;
  if (charElOpt) { charElOpt.textContent = "0 / 2000"; charElOpt.classList.remove("disc-char-warn", "disc-char-limit"); }

  try {
    const composerKey = _discComposerKey(composer);
    const pendingAttach = _discPendingAttachments.get(composerKey) || null;
    const outcome = await _discSendDurable({
      id: optimisticPost.id,
      playId,
      body,
      postType: typeSelect?.value || "comment",
      questionCategory: composer?.querySelector(".disc-cat-select")?.value || null,
      playSig,
      attachment: pendingAttach || undefined,
    });
    if (outcome.queued) {
      _discPendingAttachments.delete(composerKey);
      _discClearPendingAttachmentUI(composerKey);
      optimisticNode?.classList.remove("disc-post--pending");
      optimisticNode?.classList.add("disc-post--queued");
      showToast("Saved on this device — it will send automatically.", { duration: 3500, type: "info" });
      return;
    }
    const data = outcome.data || {};
    if (outcome.rejected || !data.ok) {
      optimisticNode?.remove();
      // Restore composer text on hard failure
      if (textarea && !textarea.value) textarea.value = body;
      if (data.rateLimited) {
        showToast(data.error || "Too many flagged messages. Please try again later.", { duration: 6000, type: "error" });
      } else if (data.muted) {
        showToast(data.error || "You are temporarily unable to post.", { duration: 6000, type: "error" });
      } else {
        showToast(outcome.error || data.error || "Failed to post.", { duration: 3000, type: "error" });
      }
      return;
    }

    // Show moderation warning if content was held or warned
    const mod = data.moderation || {};
    if (mod.displayWarning) {
      showToast(mod.displayWarning, { duration: 5000, type: mod.outcome === "block" ? "error" : "warning" });
    }

    if (data.post?.moderationStatus === "approved") {
      _discInvalidateThreadCache(playId);
      // Clear pending attachment after successful post
      _discPendingAttachments.delete(composerKey);
      _discClearPendingAttachmentUI(composerKey);
      // Replace optimistic node with real post from server
      if (optimisticNode && list) {
        const realWrap = document.createElement("div");
        realWrap.innerHTML = _discPostHtml(data.post, playId);
        const realNode = realWrap.firstElementChild;
        if (realNode) list.replaceChild(realNode, optimisticNode);
        else optimisticNode.classList.remove("disc-post--pending");
      }
      const countEl = _discCountInScope(scopeRoot);
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

function _discCloseAllReplyComposers(scopeRoot = null) {
  // Close any open inline composers
  (scopeRoot || document).querySelectorAll(".disc-composer--reply").forEach((c) => c.remove());
  // Force-close bottom sheet without confirm (used when opening a new one)
  const sheet = document.getElementById("discReplySheet");
  const sameScope = !scopeRoot || sheet?.dataset?.discScope === scopeRoot.dataset.discScope;
  if (sheet?.classList.contains("visible") && sameScope) {
    const pid = sheet.dataset.parentPostId;
    if (typeof closeLayer === "function") {
      closeLayer(sheet, { returnFocus: false });
    }
    sheet.classList.remove("visible");
    sheet.setAttribute("aria-hidden", "true");
    const overlay = document.getElementById("discReplySheetOverlay");
    overlay?.classList.remove("visible");
    overlay?.setAttribute("aria-hidden", "true");
    _discRemoveVpListeners(sheet);
    if (pid) try { sessionStorage.removeItem(`disc-reply-draft-${pid}`); } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
    setTimeout(() => { sheet.innerHTML = ""; delete sheet.dataset.parentPostId; delete sheet.dataset.discScope; }, 220);
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
      const charEl = container.querySelector(".disc-char-count") || null;
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

function openDiscReplyComposer(arg, el) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const parentPostId = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

  const scopeRoot = _discResolveScope(el, playId);
  const playSig = _discScopePlaySignature(scopeRoot, _discLastPlaySig);
  const parentPostEl = _discPostInScope(scopeRoot, parentPostId);
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
    _discCloseAllReplyComposers(scopeRoot);
    _discReplyTrigger = el instanceof Element ? el : null;

    const slot = _discReplySlotInScope(scopeRoot, parentPostId);
    if (!slot) return;

    let overlay = document.getElementById("discReplySheetOverlay");
    let sheet = document.getElementById("discReplySheet");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "discReplySheetOverlay";
      overlay.className = "disc-reply-sheet-overlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.addEventListener("click", (event) => {
        if (event.target !== overlay) return;
        const currentSheet = document.getElementById("discReplySheet");
        const currentPostId = currentSheet?.dataset?.parentPostId || "";
        if (currentPostId) closeDiscReplyComposer(currentPostId);
      });
      document.body.appendChild(overlay);
    }
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "discReplySheet";
      sheet.className = "disc-reply-sheet";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.setAttribute("aria-label", "Reply composer");
      sheet.setAttribute("aria-hidden", "true");
      sheet.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        const currentPostId = sheet.dataset.parentPostId || "";
        if (currentPostId) closeDiscReplyComposer(currentPostId);
      });
      document.body.appendChild(sheet);
    }
    sheet.dataset.parentPostId = String(parentPostId);
    sheet.dataset.discScope = scopeRoot?.dataset?.discScope || "";
    sheet.innerHTML =
      `<div class="disc-reply-sheet-head">` +
      `<div class="disc-reply-sheet-handle" aria-hidden="true"></div>` +
      `<button type="button" class="disc-reply-sheet-close" data-action="closeDiscReplyComposer" data-arg="${escapeHtml(parentPostId)}" aria-label="Close reply">✕</button>` +
      `</div>` + bannerHtml + _discComposerHtml(playId, playSig, parentPostId);
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      sheet.classList.add("visible");
      sheet.setAttribute("aria-hidden", "false");
      if (typeof openLayer === "function") {
        openLayer(sheet, {
          id: "discussion-reply-sheet",
          scrollElement: sheet,
          blocking: true,
          exclusive: false,
          safeArea: false,
        });
      }
      sheet.querySelector("textarea.disc-textarea")?.focus();
    });
    _discWireReplyComposerDraft(sheet, parentPostId);
    _discWireComposerAttachments(sheet);
    return;
  }

  // Desktop/tablet: close other composers, render inline
  _discCloseAllReplyComposers(scopeRoot);
  const slot = _discReplySlotInScope(scopeRoot, parentPostId);
  if (!slot) return;
  slot.innerHTML = bannerHtml + _discComposerHtml(playId, playSig, parentPostId);
  _discWireReplyComposerDraft(slot, parentPostId);
  _discWireComposerAttachments(slot);
}

async function closeDiscReplyComposer(parentPostId, el) {
  const scopeRoot = _discResolveScope(el);
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
    if (typeof closeLayer === "function") {
      closeLayer(sheet, { returnFocus: false });
    }
    sheet.classList.remove("visible");
    sheet.setAttribute("aria-hidden", "true");
    const overlay = document.getElementById("discReplySheetOverlay");
    overlay?.classList.remove("visible");
    overlay?.setAttribute("aria-hidden", "true");
    try { sessionStorage.removeItem(`disc-reply-draft-${parentPostId}`); } catch (_) { /* benign: sessionStorage blocked (private mode) */ }
    setTimeout(() => { sheet.innerHTML = ""; delete sheet.dataset.parentPostId; delete sheet.dataset.discScope; }, 220);
    _discReplyTrigger?.focus?.();
    _discReplyTrigger = null;
    return;
  }
  // Handle inline slot mode
  const slot = _discReplySlotInScope(scopeRoot, parentPostId);
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

  const scopeRoot = _discResolveScope(btn, playId);
  const replyComposer = btn?.closest(".disc-composer") || scopeRoot?.querySelector(".disc-composer--reply");
  const textarea = replyComposer?.querySelector("textarea.disc-textarea") || null;
  if (!textarea) return;

  const body = textarea.value.trim();
  if (!body) { textarea.focus(); return; }

  btn.disabled = true;
  btn.textContent = "Posting…";

  // ── Optimistic reply render ────────────────────────────────────────────────
  const optimisticReply = {
    id: crypto.randomUUID(),
    body,
    postType: "comment",
    authorName: _discAuthUser()?.name || _discAuthUser()?.username || "You",
    authorRole: _discAuthUser()?.role || "player",
    authorId: _discCurrentUserId || "me",
    reactions: [], replyCount: 0, replies: [],
    createdAt: new Date().toISOString(),
  };
  let repliesEl = _discRepliesInScope(scopeRoot, parentPostId);
  if (!repliesEl) {
    repliesEl = document.createElement("div");
    repliesEl.className = "disc-replies";
    repliesEl.dataset.discReplies = String(parentPostId);
    const slot = _discReplySlotInScope(scopeRoot, parentPostId);
    slot?.insertAdjacentElement("beforebegin", repliesEl);
  }
  const optWrap = document.createElement("div");
  optWrap.innerHTML = _discPostHtml(optimisticReply, playId, true);
  let optimisticReplyNode = optWrap.firstElementChild;
  if (optimisticReplyNode) {
    optimisticReplyNode.classList.add("disc-post--pending");
    repliesEl.querySelector(".disc-load-replies")?.remove();
    repliesEl.appendChild(optimisticReplyNode);
    scrollElementWithinPanel(optimisticReplyNode, { behavior: "smooth", block: "nearest" });
  }

  // Close the reply composer immediately (clear text first to skip confirm)
  const _replyTa = textarea;
  if (_replyTa) _replyTa.value = "";
  closeDiscReplyComposer(parentPostId, btn);

  try {
    const composerKey = _discComposerKey(replyComposer);
    const pendingAttach = _discPendingAttachments.get(composerKey) || null;
    const replyTypeEl = replyComposer?.querySelector(".disc-type-select") || null;
    const replyPostType = replyTypeEl?.value === "coach_clarification" ? "coach_clarification" : "comment";
    const outcome = await _discSendDurable({
      id: optimisticReply.id,
      playId,
      body,
      postType: replyPostType,
      playSig,
      parentPostId,
      attachment: pendingAttach || undefined,
    });
    if (outcome.queued) {
      _discPendingAttachments.delete(composerKey);
      _discClearPendingAttachmentUI(composerKey);
      optimisticReplyNode?.classList.remove("disc-post--pending");
      optimisticReplyNode?.classList.add("disc-post--queued");
      showToast("Saved on this device — it will send automatically.", { duration: 3500, type: "info" });
      return;
    }
    const data = outcome.data || {};
    if (outcome.rejected || !data.ok) {
      optimisticReplyNode?.remove();
      showToast(outcome.error || data.error || "Failed to post.", { duration: 3000, type: "error" });
      return;
    }

    const mod = data.moderation || {};
    if (mod.displayWarning) {
      showToast(mod.displayWarning, { duration: 5000, type: mod.outcome === "block" ? "error" : "warning" });
    }

    if (data.post?.moderationStatus === "approved") {
      _discInvalidateThreadCache(playId);
      // Clear pending attachment
      _discPendingAttachments.delete(composerKey);
      _discClearPendingAttachmentUI(composerKey);
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

    const scopeRoot = _discResolveScope(btn);
    const repliesEl = _discRepliesInScope(scopeRoot, rootPostId);
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
    document.querySelectorAll("[data-disc-mod-banner]").forEach((banner) => {
      banner.style.display = count > 0 ? "flex" : "none";
    });
    document.querySelectorAll("[data-disc-mod-count]").forEach((countEl) => {
      countEl.textContent = `${count} post${count === 1 ? "" : "s"} pending review`;
    });
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
      _discInvalidateThreadCache(_discLastPlayId);
      const bodyEl = _discCurrentBodyForPlay(_discLastPlayId);
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

function startEditPost(postId, el) {
  if (_discEditState) _discCancelEdit();

  const scopeRoot = _discResolveScope(el, playId);
  const postEl = _discPostInScope(scopeRoot, postId);
  const bodyEl = postEl?.querySelector(".disc-post-body") || null;
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

  _discEditState = { postId, original, scopeRoot };

  saveBtn.addEventListener("click", () => _discSaveEdit(postId, textarea, actions));
  cancelBtn.addEventListener("click", () => _discCancelEdit());
}

function _discCancelEdit() {
  if (!_discEditState) return;
  const { postId, original, scopeRoot } = _discEditState;
  const postEl = _discPostInScope(scopeRoot, postId);
  const ta = postEl?.querySelector(".disc-edit-textarea");
  const actions = postEl?.querySelector(".disc-edit-actions");

  if (ta) {
    const div = document.createElement("div");
    div.className = "disc-post-body";
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
    div.textContent = data.post.body;
    textarea.replaceWith(div);
    actionsEl?.remove();

    const scopeRoot = _discEditState?.scopeRoot || _discScopeRoot(textarea);
    const meta = _discPostInScope(scopeRoot, postId)?.querySelector(".disc-post-meta");
    if (meta && !meta.querySelector(".disc-edited")) {
      const span = document.createElement("span");
      span.className = "disc-edited";
      span.textContent = "(edited)";
      meta.appendChild(span);
    }
    _discInvalidateThreadCache(scopeRoot?.dataset?.discPlayId || "");
    _discEditState = null;
  } catch (_) {
    showToast("Network error — try again.", { duration: 3000, type: "error" });
  }
}

async function deleteDiscPost(postId, el) {
  const playId = el?.dataset?.playId;
  const scopeRoot = _discResolveScope(el, playId);

  const ok = await showConfirm("Delete this post? This can't be undone.", {
    title: "Delete Post", icon: "🗑", confirmText: "Delete", danger: true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Delete failed.", { duration: 3000, type: "error" }); return; }

    _discPostInScope(scopeRoot, postId)?.remove();
    _discInvalidateThreadCache(playId || scopeRoot?.dataset?.discPlayId || "");

    const countEl = _discCountInScope(scopeRoot);
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

    const scopeRoot = _discScopeRoot(btn);
    const list = _discPostsRoot(scopeRoot);
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
function retryDiscussion(arg, el) {
  const bodyEl = _discResolveScope(el, _discLastPlayId);
  const playId = bodyEl?.dataset?.discPlayId || _discLastPlayId;
  const playSig = _discScopePlaySignature(bodyEl, _discLastPlaySig);
  if (!playId) return;
  if (bodyEl) {
    bodyEl.innerHTML = `<p class="disc-loading">Loading…</p>`;
    _discLoadBody(playId, playSig, bodyEl);
  }
}

// ── Reactions ─────────────────────────────────────────────────────────────────

async function toggleDiscReaction(arg, el) {
  const sep = String(arg || "").lastIndexOf("::");
  if (sep < 0) return;
  const postId = arg.slice(0, sep);
  const reactionKey = arg.slice(sep + 2);
  if (!postId || !reactionKey) return;

  const scopeRoot = _discResolveScope(el);
  const postEl = _discPostInScope(scopeRoot, postId);

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
    _discUpdateReactions(postId, data.reactions, scopeRoot);
    _discInvalidateThreadCache(scopeRoot?.dataset?.discPlayId || "");
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

function _discUpdateReactions(postId, reactions, scopeRoot = null) {
  // Replace the whole reactions bar with fresh HTML
  const postEl = _discPostInScope(scopeRoot, postId);
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

async function resolveDiscPost(arg, el) {
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
    _discUpdateQState(postId, data.questionState, _discScopeRoot(el));
    _discInvalidateThreadCache(_discScopeRoot(el)?.dataset?.discPlayId || "");
  } catch (_) {
    showToast("Network error.", { duration: 2500, type: "error" });
  }
}

function _discUpdateQState(postId, newState, scopeRoot = null) {
  const postEl = _discPostInScope(scopeRoot, postId);
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

async function markDiscPostOfficial(arg, el) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const postId = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);
  const postEl = _discPostInScope(_discResolveScope(el, playId), postId);
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

    _discInvalidateThreadCache(playId);

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

async function openDiscReactionBreakdown(postId, el) {
  if (!postId) return;
  const scopeRoot = _discResolveScope(el);
  const postEl = _discPostInScope(scopeRoot, postId);
  const playId = scopeRoot?.dataset?.discPlayId || postEl?.closest("[data-play-id]")?.dataset?.playId || _discLastPlayId;
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

async function toggleDiscThreadLock(arg, el) {
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
    const scopeRoot = _discResolveScope(el, playId);
    const btn = scopeRoot?.querySelector("[data-action='toggleDiscThreadLock']") || null;
    if (btn) {
      btn.textContent = isNowLocked ? "🔓 Unlock Thread" : "🔒 Lock Thread";
      btn.dataset.arg = `${playId}::${isNowLocked ? "0" : "1"}`;
    }

    // Toggle composer visibility
    const composerEl = _discRootComposer(scopeRoot);
    const lockedEl = scopeRoot?.querySelector(".disc-locked") || null;
    if (isNowLocked) {
      composerEl?.remove();
      if (!lockedEl) {
        const p = document.createElement("p");
        p.className = "disc-locked";
        p.textContent = "🔒 Thread is locked.";
        _discPostsRoot(scopeRoot)?.insertAdjacentElement("afterend", p);
      }
    } else {
      lockedEl?.remove();
      if (!composerEl && scopeRoot) {
        const playSig = _discScopePlaySignature(scopeRoot, _discLastPlaySig);
        const tmp = document.createElement("div");
        tmp.innerHTML = _discComposerHtml(playId, playSig);
        const newComposer = tmp.firstElementChild;
        const lockCtrlEl = scopeRoot.querySelector(".disc-thread-controls");
        if (lockCtrlEl) {
          lockCtrlEl.insertAdjacentElement("beforebegin", newComposer);
        } else {
          scopeRoot.appendChild(newComposer);
        }
        _discWireComposerAttachments(newComposer?.parentElement || document.body);
      }
    }

    _discInvalidateThreadCache(playId);

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
  if (!_discCanFetchRemote()) return;
  const badges = document.querySelectorAll("[data-disc-play-id]");
  if (!badges.length) return;

  const playIds = [...new Set([...badges].map((b) => b.dataset.discPlayId))];
  if (!playIds.length) return;

  try {
    const counts = await _discFetchBatchCounts(playIds);
    if (!counts) return;
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
  const play =
    typeof filteredPlays !== "undefined" && Array.isArray(filteredPlays)
      ? filteredPlays[idx]
      : typeof plays !== "undefined" && Array.isArray(plays)
        ? plays[idx]
        : null;
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

  await _discEnsureUserId();

  // Re-use the same cache-aware, abortable load path as the workflow panel.
  if (body) {
    await _discLoadBody(playId, playSig, body);
    const data = _discThreadCache.get(_discCacheKey(playId))?.data || null;
    if (btn && data?.thread) {
      if (data.thread.total > 0) btn.dataset.count = data.thread.total;
      else delete btn.dataset.count;
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
  discAskCoachQuestion(getPlayThreadId(play), document.getElementById("ppDiscDrawerBody"));
}

// ── Char count + keyboard shortcut ───────────────────────────────────────────

document.addEventListener("input", (e) => {
  const ta = e.target;
  if (!ta.classList.contains("disc-textarea") || ta.classList.contains("disc-edit-textarea")) return;
  const el = ta.closest(".disc-composer")?.querySelector(".disc-char-count") || null;
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
  if (!_discCanFetchRemote()) return;
  const els = document.querySelectorAll("#gameplan [data-disc-play-id]");
  if (!els.length) return;

  const playIds = [...new Set([...els].map((el) => el.dataset.discPlayId))];
  if (!playIds.length) return;

  try {
    const counts = await _discFetchBatchCounts(playIds);
    if (!counts) return;
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
  if (!_discCanFetchRemote()) return;
  const els = document.querySelectorAll("#callSheetGrid [data-disc-play-id]");
  if (!els.length) return;

  const playIds = [...new Set([...els].map((el) => el.dataset.discPlayId))];
  if (!playIds.length) return;

  try {
    const counts = await _discFetchBatchCounts(playIds);
    if (!counts) return;
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
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="disc-floating-panel" role="dialog" aria-modal="true" aria-label="Play Discussion">
        <div class="disc-floating-header">
          <span id="gpDiscModalTitle" class="disc-floating-title">💬 Discussion</span>
          <button class="disc-floating-close" data-action="closeGPDiscModal" aria-label="Close discussion">×</button>
        </div>
        <div id="gpDiscModalBody" class="disc-floating-body"></div>
      </div>`;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeGPDiscModal();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeGPDiscModal();
    });
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
  overlay.setAttribute("aria-hidden", "false");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "game-plan-discussion",
      scrollElement: body,
      blocking: true,
      exclusive: false,
      safeArea: true,
    });
  }

  await renderDiscussionSection(play, body);
}

function closeGPDiscModal() {
  const overlay = document.getElementById("gpDiscModalOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") closeLayer(overlay);
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
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
  overlay.setAttribute("aria-hidden", "false");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "game-plan-discussion",
      scrollElement: body,
      blocking: true,
      exclusive: false,
      safeArea: true,
    });
  }

  await renderDiscussionSection(play, body);
}

// ── Phase 9: Ask Coach & Question Links ──────────────────────────────────────

/**
 * Pre-select the question type in the root composer for a given play.
 * data-action="discAskCoachQuestion" data-arg="{playId}"
 */
function discAskCoachQuestion(playId, el) {
  const scopeRoot = _discResolveScope(el, playId);
  const composer = _discRootComposer(scopeRoot);
  const textarea = composer?.querySelector("textarea.disc-textarea") || null;
  switchDiscComposerType(`${playId}::question`, el);
  if (textarea) {
    textarea.placeholder = "What's your question? (Ctrl+Enter to post)";
    textarea.focus();
    scrollElementWithinPanel(textarea, { behavior: "smooth", block: "nearest" });
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

// In-app notification routing uses the same scoped highlight contract as a
// shared URL, without mutating browser history or leaking a stale target into
// a later discussion surface.
function setDiscussionDeepLink(playId, postId = "") {
  _discDeepLinkPlayId = String(playId || "") || null;
  _discDeepLinkPostId = String(postId || "") || null;
}

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
function _discApplyDeepLink(playId, bodyEl = null) {
  if (!_discDeepLinkPlayId || _discDeepLinkPlayId !== playId || !_discDeepLinkPostId) return;
  const targetEl = _discPostInScope(bodyEl || _discCurrentBodyForPlay(playId), _discDeepLinkPostId);
  if (!targetEl) return;
  targetEl.classList.add("disc-post--highlighted");
  scrollElementWithinPanel(targetEl, { behavior: "smooth", block: "center" });
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

// A queued post may finish after the phone has reconnected or after the app
// resumes. Replace only that optimistic card; never re-render the whole panel
// and risk throwing away a coach's reply draft.
document.addEventListener("discussion-outbox-delivered", (event) => {
  const job = event.detail?.job;
  const post = event.detail?.data?.post;
  if (!job?.id || !job.playId || !post) return;
  _discInvalidateThreadCache(job.playId);
  document.querySelectorAll(".disc-body[data-disc-play-id]").forEach((bodyEl) => {
    if (bodyEl.dataset.discPlayId !== String(job.playId)) return;
    const queuedNode = _discPostInScope(bodyEl, job.id);
    if (!queuedNode?.classList.contains("disc-post--queued")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = _discPostHtml(post, job.playId, Boolean(post.parentPostId));
    const realNode = wrap.firstElementChild;
    if (!realNode) return;
    queuedNode.replaceWith(realNode);
    const countEl = _discCountInScope(bodyEl);
    if (countEl && !post.parentPostId) {
      countEl.textContent = String(Math.max(0, parseInt(countEl.textContent || "0", 10) + 1));
    }
  });
});

document.addEventListener("discussion-outbox-rejected", (event) => {
  const job = event.detail?.job;
  if (!job?.id || !job?.playId) return;
  document.querySelectorAll(".disc-body[data-disc-play-id]").forEach((bodyEl) => {
    if (bodyEl.dataset.discPlayId !== String(job.playId)) return;
    _discPostInScope(bodyEl, job.id)?.remove();
  });
  showToast(event.detail?.error || "That saved message could not be posted.", { duration: 5000, type: "error" });
});

/**
 * Wire attachment-related inputs in new composer nodes.
 * Called from openDiscReplyComposer and renderDiscussionSection.
 */
function _discWireComposerAttachments(container) {
  if (!container) return;
  _discWireAttachmentInputs(container);
}
