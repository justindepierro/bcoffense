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
  const canPost = !isLocked || userRole === "coach" || userRole === "admin";

  const postsHtml = posts.length
    ? posts.map((p) => _discPostHtml(p, playId)).join("")
    : `<p class="disc-empty">No comments yet.</p>`;

  const loadMore = hasMore && posts.length
    ? `<button class="btn btn-xs disc-load-more"
         data-action="loadMoreDiscussion"
         data-play-id="${escapeHtml(playId)}"
         data-cursor="${escapeHtml(posts[posts.length - 1]?.id || "")}">Load more…</button>`
    : "";

  const composer = canPost ? _discComposerHtml(playId, playSig) : `<p class="disc-locked">Thread is locked.</p>`;

  setInnerHTML(
    container,
    `<div class="disc-posts" id="discPosts-${escapeHtml(playId)}">${postsHtml}</div>` +
    loadMore +
    composer,
  );
}

function _discPostHtml(p, playId) {
  const mine = p.authorId === _discCurrentUserId;
  const isStaff = window.currentAuthUser?.role === "coach" || window.currentAuthUser?.role === "admin";
  const canAct = mine || isStaff;
  const typeIcon = p.postType === "question" ? "❓ " : "";

  const editBtn = canAct
    ? `<button class="disc-action-btn" data-action="startEditPost" data-arg="${escapeHtml(p.id)}" title="Edit">✏️</button>`
    : "";
  const deleteBtn = canAct
    ? `<button class="disc-action-btn disc-action-btn--danger" data-action="deleteDiscPost" data-arg="${escapeHtml(p.id)}" data-play-id="${escapeHtml(playId)}" title="Delete">🗑</button>`
    : "";

  return (
    `<div class="disc-post" id="disc-post-${escapeHtml(p.id)}" data-post-id="${escapeHtml(p.id)}">` +
    `<div class="disc-post-avatar" style="background:${_DISC_ROLE_COLORS[p.authorRole] || "var(--color-text-muted)"}" aria-hidden="true">${escapeHtml(_discInitials(p.authorName))}</div>` +
    `<div class="disc-post-content">` +
    `<div class="disc-post-meta">` +
    `<span class="disc-author">${escapeHtml(p.authorName)}</span>` +
    _discRoleBadge(p.authorRole) +
    (typeIcon ? `<span class="disc-type-icon">${typeIcon}</span>` : "") +
    `<span class="disc-time" title="${escapeHtml(_discExactTime(p.createdAt))}">${escapeHtml(_discRelTime(p.createdAt))}</span>` +
    (p.editedAt ? `<span class="disc-edited">(edited)</span>` : "") +
    `</div>` +
    `<div class="disc-post-body" id="disc-body-${escapeHtml(p.id)}">${escapeHtml(p.body)}</div>` +
    (canAct ? `<div class="disc-post-actions">${editBtn}${deleteBtn}</div>` : "") +
    `</div></div>`
  );
}

function _discComposerHtml(playId, playSig) {
  return (
    `<div class="disc-composer">` +
    `<textarea class="disc-textarea" id="discCompose-${escapeHtml(playId)}"` +
    ` placeholder="Add a comment… (Ctrl+Enter to post)" rows="2" maxlength="2000" aria-label="Write a comment"></textarea>` +
    `<div class="disc-composer-actions">` +
    `<select class="disc-type-select" id="discType-${escapeHtml(playId)}" aria-label="Post type">` +
    `<option value="comment">Comment</option>` +
    `<option value="question">Question ❓</option>` +
    `</select>` +
    `<span class="disc-char-count" id="discChars-${escapeHtml(playId)}">0 / 2000</span>` +
    `<button class="btn btn-sm btn-primary" data-action="submitDiscPost"` +
    ` data-play-id="${escapeHtml(playId)}" data-play-sig="${escapeHtml(playSig)}">Post</button>` +
    `</div></div>`
  );
}

// ── Global actions ────────────────────────────────────────────────────────────
// submitDiscPost, deleteDiscPost, loadMoreDiscussion are in _ELEMENT_FNS
// so they receive (arg, element).  startEditPost receives (arg) only.

async function submitDiscPost(arg, el) {
  const playId = el?.dataset?.playId;
  const playSig = el?.dataset?.playSig || "";
  if (!playId) return;

  const textarea = document.getElementById(`discCompose-${playId}`);
  const typeSelect = document.getElementById(`discType-${playId}`);
  if (!textarea) return;

  const body = textarea.value.trim();
  if (!body) { textarea.focus(); return; }

  el.disabled = true;
  el.textContent = "Posting…";

  try {
    const res = await fetch(`/api/threads/${playId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, post_type: typeSelect?.value || "comment", play_signature: playSig }),
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Failed to post.", { duration: 3000, type: "error" }); return; }

    textarea.value = "";
    const charEl = document.getElementById(`discChars-${playId}`);
    if (charEl) charEl.textContent = "0 / 2000";

    const list = document.getElementById(`discPosts-${playId}`);
    if (list) {
      list.querySelector(".disc-empty")?.remove();
      const wrap = document.createElement("div");
      // We need to add the HTML safely — use a DocumentFragment approach
      wrap.innerHTML = _discPostHtml(data.post, playId);
      const node = wrap.firstElementChild;
      if (node) {
        list.appendChild(node);
        node.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    const countEl = document.getElementById("discCount");
    if (countEl) countEl.textContent = String(Math.max(0, parseInt(countEl.textContent || "0", 10) + 1));
  } catch (_) {
    showToast("Network error — try again.", { duration: 3000, type: "error" });
  } finally {
    el.disabled = false;
    el.textContent = "Post";
  }
}

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
  const playId = el?.dataset?.playId;
  const cursor = el?.dataset?.cursor;
  if (!playId) return;

  el.disabled = true;
  el.textContent = "Loading…";

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
      el.dataset.cursor = data.posts[data.posts.length - 1]?.id || cursor;
      el.disabled = false;
      el.textContent = "Load more…";
    } else {
      el.remove();
    }
  } catch (_) {
    el.disabled = false;
    el.textContent = "Load more…";
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

