/**
 * app-notifications.js
 * In-app notification center: bell badge, drawer, polling, deep links.
 *
 * Phase 13 — ROADMAP_TWO_OMG
 */

// ── State ─────────────────────────────────────────────────────────────────────

let _notifPollInterval = null;
let _notifInitialized = false;
let _notifDrawerOpen = false;
let _notifOffset = 0;
let _notifHasMore = false;
let _notifLastCheckedAt = "";
let _notifLastError = "";
let _notifLastUnread = 0;
const _notifRecentBroadcasts = new Map();
const NOTIF_POLL_INTERVAL_MS = 60_000; // 60 s
const NOTIF_BROADCAST_DEDUPE_MS = 45_000;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Call once after login is confirmed. Starts the unread poll and wires
 * the bell button.
 */
function initNotifications(opts = {}) {
  if (_notifInitialized) {
    // Already running — just trigger an immediate poll for fresh count
    if (!opts.deferFirstPoll) _pollUnreadCount();
    return;
  }
  _notifInitialized = true;
  if (!opts.deferFirstPoll) _pollUnreadCount();
  clearInterval(_notifPollInterval);
  _notifPollInterval = setInterval(_pollUnreadCount, NOTIF_POLL_INTERVAL_MS);

  // Stop polling when tab is hidden, resume when visible
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(_notifPollInterval);
    } else {
      _pollUnreadCount();
      _notifPollInterval = setInterval(_pollUnreadCount, NOTIF_POLL_INTERVAL_MS);
    }
  });
}

// ── Badge ─────────────────────────────────────────────────────────────────────

async function _pollUnreadCount(opts = {}) {
  try {
    const res = await fetch("/api/notifications/count");
    if (!res.ok) return;
    const data = await res.json();
    _setNotificationState({
      unread: data.unread || 0,
      checkedAt: new Date().toISOString(),
      error: "",
      online: typeof navigator === "undefined" || navigator.onLine !== false,
    }, opts);
  } catch (_) {
    _setNotificationState({
      checkedAt: new Date().toISOString(),
      error: "Could not check alerts.",
      online: typeof navigator === "undefined" || navigator.onLine !== false,
    }, opts);
  }
}

function _updateBellBadge(count) {
  const btn = document.getElementById("notifBellBtn");
  if (!btn) return;
  if (count > 0) {
    btn.setAttribute("data-count", Math.min(count, 99));
  } else {
    btn.removeAttribute("data-count");
  }
  btn.setAttribute("aria-label", count > 0 ? `Notifications — ${count} unread` : "Notifications");
}

function _setNotificationState(state = {}, opts = {}) {
  if (Object.prototype.hasOwnProperty.call(state, "unread")) {
    _notifLastUnread = Math.max(0, Number(state.unread) || 0);
    _updateBellBadge(_notifLastUnread);
  }
  if (state.checkedAt) _notifLastCheckedAt = state.checkedAt;
  if (Object.prototype.hasOwnProperty.call(state, "error")) _notifLastError = state.error || "";
  window.playerNotificationState = {
    unread: _notifLastUnread,
    checkedAt: _notifLastCheckedAt,
    error: _notifLastError,
    online: state.online ?? (typeof navigator === "undefined" || navigator.onLine !== false),
  };
  if (
    opts.render !== false &&
    document.body?.dataset?.authRole === "player" &&
    typeof renderPlayerDashboardHome === "function"
  ) {
    renderPlayerDashboardHome();
  }
}

// ── Drawer open/close ─────────────────────────────────────────────────────────

async function openNotifDrawer() {
  const drawer = document.getElementById("notifDrawer");
  if (!drawer) return;
  const backdrop = document.getElementById("notifBackdrop");
  _notifDrawerOpen = true;
  _notifOffset = 0;
  if (backdrop) backdrop.hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.getElementById("notifBellBtn")?.setAttribute("aria-expanded", "true");
  if (typeof _refreshPushUI === "function") _refreshPushUI();
  await _loadNotifications(false);
}

function closeNotifDrawer() {
  const drawer = document.getElementById("notifDrawer");
  if (!drawer) return;
  const backdrop = document.getElementById("notifBackdrop");
  _notifDrawerOpen = false;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  if (backdrop) backdrop.hidden = true;
  document.getElementById("notifBellBtn")?.setAttribute("aria-expanded", "false");
}

function toggleNotifDrawer() {
  _notifDrawerOpen ? closeNotifDrawer() : openNotifDrawer();
}

// ── Load notifications ─────────────────────────────────────────────────────────

async function _loadNotifications(append = false) {
  const listEl = document.getElementById("notifList");
  if (!listEl) return;

  document.getElementById("notifLoadMore")?.remove();

  if (!append) {
    listEl.innerHTML = _notifStateHtml({
      icon: "⏳",
      title: "Checking updates",
      body: "Looking for new practice notes, coach replies, and quizzes.",
      tone: "loading",
    });
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    _setNotificationState({
      checkedAt: new Date().toISOString(),
      error: "Offline",
      online: false,
    });
    listEl.innerHTML = _notifStateHtml({
      icon: "📵",
      title: "Offline practice is available",
      body: _isPlayerNotificationUser()
        ? "Your loaded practice still works. New coach replies and published practices will show here after you reconnect."
        : "Local work is still available. New notifications will show when you reconnect.",
      action: "retryNotifs",
      actionLabel: "Check again",
      tone: "offline",
    });
    return;
  }

  try {
    const res = await fetch(`/api/notifications?limit=25&offset=${_notifOffset}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to load");
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];

    _notifHasMore = Boolean(data.hasMore || data.has_more);
    _notifOffset += notifications.length;

    if (!append) {
      if (notifications.length === 0) {
        listEl.innerHTML = _notifStateHtml({
          icon: "✅",
          title: _isPlayerNotificationUser() ? "No new practice updates" : "All caught up",
          body: _isPlayerNotificationUser()
            ? "When coach publishes a practice, replies to a question, or sends a quiz, it will land here."
            : "New updates will show here when there is something to review.",
          action: _isPlayerNotificationUser() ? "showTab" : "",
          actionArg: _isPlayerNotificationUser() ? "script" : "",
          actionLabel: _isPlayerNotificationUser() ? "Open Practice" : "",
          tone: "empty",
        });
      } else {
        listEl.innerHTML = notifications.map(_notifItemHtml).join("");
      }
    } else {
      listEl.querySelector(".notif-loading")?.remove();
      notifications.forEach((n) => {
        const tmp = document.createElement("div");
        tmp.innerHTML = _notifItemHtml(n);
        if (tmp.firstElementChild) listEl.appendChild(tmp.firstElementChild);
      });
    }

    // Update unread badge from fresh count
    _setNotificationState({
      unread: data.unread || 0,
      checkedAt: new Date().toISOString(),
      error: "",
      online: true,
    });

    // Load More button
    if (_notifHasMore) {
      const btn = document.createElement("button");
      btn.id = "notifLoadMore";
      btn.className = "btn btn-xs notif-load-more";
      btn.textContent = "Load more";
      btn.dataset.action = "loadMoreNotifs";
      document.getElementById("notifDrawerBody")?.appendChild(btn);
    }
  } catch (err) {
    _setNotificationState({
      checkedAt: new Date().toISOString(),
      error: "Could not load alerts.",
      online: typeof navigator === "undefined" || navigator.onLine !== false,
    });
    const unavailable = /\b(?:503|404)\b/.test(String(err?.message || ""));
    listEl.innerHTML = _notifStateHtml({
      icon: unavailable ? "🛠️" : "📵",
      title: unavailable ? "Alerts are not set up here yet" : "Updates paused",
      body: unavailable
        ? "Practice, Playbook, Swipe View, and Questions still work. Alerts will appear once the team notification service is available."
        : "This does not affect your saved practice. Try again when your connection is stronger.",
      action: "retryNotifs",
      actionLabel: "Retry",
      tone: "error",
    });
  }
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

const _NOTIF_ICONS = {
  coach_reply: "💬",
  question_resolved: "✅",
  official_answer: "✅",
  reply: "💬",
  visual_reply: "🖼️",
  script_published: "📋",
  new_quiz: "📝",
  media_update: "🎞️",
  team_announcement: "📣",
  moderation_alert: "⚠️",
};

function _notifRelTime(unixSec) {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function _isPlayerNotificationUser() {
  return document.body?.dataset?.authRole === "player";
}

function _notifStateHtml({ icon, title, body, action = "", actionArg = "", actionLabel = "", tone = "" }) {
  const actionAttrs = action
    ? ` data-action="${escapeHtml(action)}"${actionArg ? ` data-arg="${escapeHtml(actionArg)}"` : ""}`
    : "";
  return (
    `<li class="notif-state${tone ? ` notif-state--${escapeHtml(tone)}` : ""}">` +
    `<span class="notif-state__icon" aria-hidden="true">${icon}</span>` +
    `<strong>${escapeHtml(title)}</strong>` +
    `<span>${escapeHtml(body)}</span>` +
    (action && actionLabel
      ? `<button type="button" class="btn btn-xs btn-secondary notif-state__action"${actionAttrs}>${escapeHtml(actionLabel)}</button>`
      : "") +
    `</li>`
  );
}

function _notifItemHtml(n) {
  const icon = _NOTIF_ICONS[n.type] || "🔔";
  const unreadCls = n.read ? "" : " notif-item--unread";
  const typeCls = n.type ? ` notif-item--${escapeHtml(String(n.type).replace(/[^a-z0-9_-]/gi, "-"))}` : "";
  const link = n.deepLink
    ? ` data-action="openNotifDeepLink" data-arg="${escapeHtml(n.id)}::${escapeHtml(n.deepLink)}"`
    : "";
  return (
    `<li class="notif-item${unreadCls}${typeCls}" id="notif-${escapeHtml(n.id)}"${link} role="button" tabindex="0">` +
    `<div class="notif-item-icon" aria-hidden="true">${icon}</div>` +
    `<div class="notif-item-content">` +
    `<div class="notif-item-title">${escapeHtml(n.title)}</div>` +
    (n.body ? `<div class="notif-item-body">${escapeHtml(n.body)}</div>` : "") +
    `<div class="notif-item-time">${escapeHtml(_notifRelTime(n.createdAt))}</div>` +
    `</div>` +
    (n.read ? "" : `<span class="notif-unread-dot" aria-hidden="true"></span>`) +
    `</li>`
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function openNotifDeepLink(arg) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const notifId = arg.slice(0, sep);
  const deepLink = arg.slice(sep + 2);

  // Mark read optimistically
  const itemEl = document.getElementById(`notif-${notifId}`);
  if (itemEl) {
    itemEl.classList.remove("notif-item--unread");
    itemEl.querySelector(".notif-unread-dot")?.remove();
  }
  fetch(`/api/notifications/${encodeURIComponent(notifId)}`, { method: "PATCH" }).catch(() => { });

  closeNotifDrawer();

  if (deepLink === "script" || deepLink.startsWith("script:")) {
    const scriptId = deepLink.includes(":") ? deepLink.slice(deepLink.indexOf(":") + 1) : "";
    if (scriptId && typeof loadPublishedPlayerScript === "function") {
      loadPublishedPlayerScript(scriptId);
    } else if (typeof showTab === "function") {
      showTab("script");
    }
    return;
  }

  if (deepLink === "quiz") {
    if (typeof openPlayerQuizHub === "function") openPlayerQuizHub();
    else if (typeof showTab === "function") showTab("dashboard");
    return;
  }

  if (deepLink === "questions") {
    if (typeof openPlayerPortal === "function") openPlayerPortal();
    return;
  }

  const playId = deepLink.startsWith("play:") ? deepLink.slice(5) : deepLink;
  if (playId && typeof openDiscussionForPlayId === "function") {
    openDiscussionForPlayId(playId);
  }
}

async function markAllNotifsRead() {
  try {
    await fetch("/api/notifications", { method: "POST" });
    // Clear all unread indicators
    document.querySelectorAll(".notif-item--unread").forEach((el) => {
      el.classList.remove("notif-item--unread");
      el.querySelector(".notif-unread-dot")?.remove();
    });
    _setNotificationState({
      unread: 0,
      checkedAt: new Date().toISOString(),
      error: "",
      online: typeof navigator === "undefined" || navigator.onLine !== false,
    });
  } catch (_) {
    showToast("Couldn't mark as read.", { duration: 2500, type: "error" });
  }
}

async function loadMoreNotifs() {
  document.getElementById("notifLoadMore")?.remove();
  const loadingEl = document.createElement("p");
  loadingEl.className = "notif-loading";
  loadingEl.textContent = "Loading…";
  document.getElementById("notifList")?.appendChild(loadingEl);
  await _loadNotifications(true);
}

function retryNotifs() {
  _notifOffset = 0;
  _loadNotifications(false);
}

async function openPlayerNotificationSettings() {
  if (typeof initPushNotifications === "function") await initPushNotifications();
  await openNotifDrawer();
  const footer = document.getElementById("pushNotifFooter");
  if (!footer) return;
  const drawerBody = document.getElementById("notifDrawerBody");
  if (drawerBody) drawerBody.scrollTop = drawerBody.scrollHeight;
  footer.querySelector("button")?.focus();
}

async function refreshNotificationStatus(opts = {}) {
  await _pollUnreadCount(opts);
  return window.playerNotificationState || null;
}

function _isStaffNotificationUser() {
  const role = document.body?.dataset?.authRole || "";
  return role === "admin" || role === "coach" || role === "assistant" || role === "assistant_coach";
}

function _notificationPayloadForPublish(kind, details = {}) {
  const label = String(details.label || details.name || "").trim();
  const id = String(details.id || details.scriptId || "").trim();
  if (kind === "scripts") {
    return {
      type: "script_published",
      title: label ? `Practice ready: ${label}` : "A practice is ready",
      body: "Open it to review your calls, signals, and quiz work.",
      deepLink: id ? `script:${id}` : "script",
      tag: id ? `script-published-${id}` : "script-published",
    };
  }
  if (kind === "quizzes") {
    return {
      type: "new_quiz",
      title: "Quiz work is available",
      body: label || "Open Quiz from Player Home when you are ready.",
      deepLink: "quiz",
      tag: "new-quiz",
    };
  }
  if (kind === "diagrams" || kind === "clips") {
    return {
      type: "media_update",
      title: "Practice media updated",
      body: label || "New diagrams or videos are ready in your current practice.",
      deepLink: "script",
      tag: "practice-media",
    };
  }
  if (kind === "announcements") {
    return {
      type: "team_announcement",
      title: "Coach posted an announcement",
      body: label || "Open Player Home to read the message.",
      deepLink: "script",
      tag: "team-announcement",
    };
  }
  return null;
}

async function notifyPlayersOfTeamUpdate(kind, details = {}) {
  if (!_isStaffNotificationUser()) return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  if (details.notify === false) return null;

  const payload = _notificationPayloadForPublish(kind, details);
  if (!payload) return null;

  const key = `${payload.type}|${payload.deepLink}|${payload.body}`;
  const now = Date.now();
  const last = _notifRecentBroadcasts.get(key) || 0;
  if (now - last < NOTIF_BROADCAST_DEDUPE_MS) return null;
  _notifRecentBroadcasts.set(key, now);

  try {
    const res = await fetch("/api/notifications/broadcast", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "Notification broadcast failed.");
    return data;
  } catch (err) {
    console.warn("[notifications] broadcast skipped", err);
    return null;
  }
}

// ── Deep link handler ─────────────────────────────────────────────────────────

/**
 * Called when a notification deep link targets a play ID.
 * Navigates to the Playbook tab and opens the play's discussion.
 */
function openDiscussionForPlayId(playId) {
  if (!playId) return;

  // Switch to playbook tab
  if (typeof showTab === "function") showTab("playbook");

  // Attempt to find and open the workflow panel for the play
  // The play ID format is encodeURIComponent("personnel::formation::play")
  // We can try to match against the current plays array
  if (typeof plays === "undefined" || !Array.isArray(plays)) return;

  const decoded = (() => { try { return decodeURIComponent(playId); } catch (_) { return playId; } })();
  const parts = decoded.split("::");

  // Try matching by _id first
  let match = plays.find((p) => p && p._id && encodeURIComponent(p._id) === playId);

  // Fallback: match by personnel::formation::play
  if (!match && parts.length >= 3) {
    const [personnel, formation, play] = parts;
    match = plays.find(
      (p) => p &&
        String(p.personnel || "") === personnel &&
        String(p.formation || "") === formation &&
        String(p.play || "") === play,
    );
  }

  if (match && typeof openPlayWorkflowPanel === "function") {
    // Scroll to the play in the table first
    setTimeout(() => {
      openPlayWorkflowPanel(match);
      // Scroll to discussion section inside the panel
      setTimeout(() => {
        document.getElementById("discBody")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
    }, 300);
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && _notifDrawerOpen) closeNotifDrawer();
});
