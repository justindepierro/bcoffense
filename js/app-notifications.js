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
let _notifItems = [];
let _notifFilter = "all";
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
  _notifItems = [];
  _notifFilter = "all";
  _syncNotifFilterButtons();
  if (backdrop) backdrop.hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  drawer.setAttribute("aria-modal", "true");
  // Notifications are a real modal surface on phones. Register it with the
  // shared layer manager so focus, the browser back/escape behavior, and body
  // scroll stay consistent with the player portal and presentation overlay.
  if (typeof openLayer === "function") {
    openLayer(drawer, {
      id: "notification-drawer",
      scrollElement: "notifDrawerBody",
      safeArea: false,
      blocking: true,
    });
  }
  document.getElementById("notifBellBtn")?.setAttribute("aria-expanded", "true");
  drawer.querySelector(".notif-close-btn")?.focus();
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
  drawer.setAttribute("aria-modal", "false");
  if (typeof closeLayer === "function") closeLayer("notification-drawer");
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

    _notifItems = append ? [..._notifItems, ...notifications] : notifications;
    _renderNotificationList(listEl);

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
  player_comment: "💬",
  player_question: "❓",
  player_reply: "↩️",
  coach_reply: "💬",
  question_resolved: "✅",
  official_answer: "✅",
  reply: "💬",
  visual_reply: "🖼️",
  script_published: "📋",
  new_quiz: "📝",
  quiz_homework: "📚",
  media_update: "🎞️",
  team_update: "🏈",
  team_announcement: "📣",
  moderation_alert: "⚠️",
};

const _NOTIF_LABELS = {
  player_comment: "Player message",
  player_question: "Player question",
  player_reply: "Player reply",
  coach_reply: "Coach reply",
  question_resolved: "Question resolved",
  official_answer: "Official answer",
  reply: "New reply",
  visual_reply: "Coach markup",
  script_published: "Practice ready",
  new_quiz: "New quiz",
  quiz_homework: "Homework assigned",
  media_update: "Media updated",
  team_update: "Team update",
  team_announcement: "Announcement",
  moderation_alert: "Needs review",
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

// Conversations are always shown one-by-one. Mechanical publish activity is
// grouped so one busy save session cannot bury a player asking for help.
const _NOTIF_CONVERSATION_TYPES = new Set([
  "player_comment", "player_question", "player_reply", "coach_reply",
  "question_resolved", "official_answer", "reply", "visual_reply",
]);
const _NOTIF_PRACTICE_TYPES = new Set([
  "team_update", "script_published", "new_quiz", "quiz_homework", "media_update", "team_announcement",
]);
const _NOTIF_GROUPABLE_TYPES = new Set(["team_update", "script_published", "new_quiz", "media_update"]);

function _notifBucket(item) {
  if (_NOTIF_CONVERSATION_TYPES.has(item?.type)) return "conversation";
  if (_NOTIF_PRACTICE_TYPES.has(item?.type)) return "practice";
  return "other";
}

function _notifGroupItems(items) {
  const grouped = [];
  const byKey = new Map();
  for (const item of items) {
    const key = _NOTIF_GROUPABLE_TYPES.has(item?.type)
      ? `${item.type}|${item.deepLink || ""}`
      : "";
    const existing = key ? byKey.get(key) : null;
    if (existing) {
      existing.notificationIds.push(String(item.id));
      existing.groupCount += 1;
      // A grouped card is unread until every underlying receipt is read.
      // That keeps a quiet older update from disappearing behind a newer read one.
      existing.read = Boolean(existing.read && item.read);
      continue;
    }
    const next = { ...item, notificationIds: [String(item.id)], groupCount: 1 };
    grouped.push(next);
    if (key) byKey.set(key, next);
  }
  return grouped;
}

function _syncNotifFilterButtons() {
  document.querySelectorAll(".notif-filter-btn").forEach((btn) => {
    const active = String(btn.dataset.arg || "all") === _notifFilter;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function _renderNotificationList(listEl = document.getElementById("notifList")) {
  if (!listEl) return;
  const notifications = _notifGroupItems(_notifItems)
    .filter((item) => _notifFilter === "all" || _notifBucket(item) === _notifFilter);
  if (!notifications.length) {
    const hasItems = _notifItems.length > 0;
    listEl.innerHTML = _notifStateHtml({
      icon: hasItems ? "🗂️" : "✅",
      title: hasItems ? "Nothing in this view" : (_isPlayerNotificationUser() ? "No new practice updates" : "All caught up"),
      body: hasItems
        ? "Try All to see every update."
        : (_isPlayerNotificationUser()
          ? "When coach publishes a practice, replies to a question, or sends a quiz, it will land here."
          : "New messages and practice updates will show here when there is something to review."),
      action: hasItems ? "setNotifFilter" : (_isPlayerNotificationUser() ? "showTab" : ""),
      actionArg: hasItems ? "all" : (_isPlayerNotificationUser() ? "script" : ""),
      actionLabel: hasItems ? "Show all" : (_isPlayerNotificationUser() ? "Open Practice" : ""),
      tone: "empty",
    });
    return;
  }
  listEl.innerHTML = notifications.map(_notifItemHtml).join("");
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
  const label = _NOTIF_LABELS[n.type] || "Team update";
  const unreadCls = n.read ? "" : " notif-item--unread";
  const typeCls = n.type ? ` notif-item--${escapeHtml(String(n.type).replace(/[^a-z0-9_-]/gi, "-"))}` : "";
  const notificationIds = Array.isArray(n.notificationIds) && n.notificationIds.length
    ? n.notificationIds
    : [n.id];
  const link = n.deepLink
    ? ` data-action="openNotifDeepLink" data-arg="${escapeHtml(notificationIds.join(","))}::${escapeHtml(n.deepLink)}"`
    : "";
  const grouped = Number(n.groupCount || 1) > 1;
  const groupLabel = grouped
    ? `<div class="notif-item-group">${escapeHtml(String(n.groupCount))} similar practice updates</div>`
    : "";
  return (
    `<li class="notif-item${unreadCls}${typeCls}${grouped ? " notif-item--grouped" : ""}" id="notif-${escapeHtml(n.id)}"${link} role="button" tabindex="0">` +
    `<div class="notif-item-icon" aria-hidden="true">${icon}</div>` +
    `<div class="notif-item-content">` +
    `<div class="notif-item-kicker">${escapeHtml(label)}${n.read ? "" : `<span>New</span>`}</div>` +
    `<div class="notif-item-title">${escapeHtml(n.title)}</div>` +
    (n.body ? `<div class="notif-item-body">${escapeHtml(n.body)}</div>` : "") +
    groupLabel +
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
  const notifIds = arg.slice(0, sep).split(",").map((id) => id.trim()).filter(Boolean);
  const deepLink = arg.slice(sep + 2);

  // A grouped practice item may represent several noisy publish receipts.
  // Opening it acknowledges each receipt, while conversation alerts always
  // remain individual and therefore never get collapsed.
  const itemEl = document.getElementById(`notif-${notifIds[0] || ""}`);
  if (itemEl) {
    itemEl.classList.remove("notif-item--unread");
    itemEl.querySelector(".notif-unread-dot")?.remove();
  }
  Promise.all(notifIds.map((notifId) =>
    fetch(`/api/notifications/${encodeURIComponent(notifId)}`, { method: "PATCH" }).catch(() => null),
  )).finally(() => _pollUnreadCount({ render: false }));

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

  if (deepLink === "dashboard") {
    if (typeof showTab === "function") showTab("dashboard");
    return;
  }

  if (deepLink.startsWith("quiz-assignment:")) {
    const assignmentId = deepLink.slice("quiz-assignment:".length);
    if (typeof refreshQuizAssignments === "function") await refreshQuizAssignments({ quiet: true });
    if (assignmentId && typeof startPlayerQuizAssignment === "function") {
      startPlayerQuizAssignment(assignmentId);
    } else if (typeof openPlayerQuizHub === "function") {
      openPlayerQuizHub();
    }
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
  _notifItems = [];
  _loadNotifications(false);
}

function setNotifFilter(filter = "all") {
  _notifFilter = ["all", "conversation", "practice"].includes(filter) ? filter : "all";
  _syncNotifFilterButtons();
  _renderNotificationList();
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
  if (["scripts", "quizzes", "diagrams", "clips", "signals"].includes(kind)) {
    const body = kind === "scripts"
      ? (label ? `${label} is ready to review.` : "A practice is ready to review.")
      : kind === "quizzes"
        ? (label || "New quiz work is ready in Player Home.")
        : (label || "Practice media updated — new diagrams, videos, or signals are ready.");
    return {
      type: "team_update",
      title: "Team practice updated",
      body,
      deepLink: "dashboard",
      tag: "team-practice-update",
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

function _discussionPlayMatchesId(play, playId) {
  if (!play || !playId) return false;
  const target = String(playId);
  const decoded = (() => {
    try { return decodeURIComponent(target); } catch (_) { return target; }
  })();
  if (typeof getPlayThreadId === "function" && getPlayThreadId(play) === target) return true;
  if (play._id && (String(play._id) === decoded || encodeURIComponent(play._id) === target)) return true;
  return [play.personnel, play.formation, play.play].map((value) => String(value || "")).join("::") === decoded;
}

function _openPlayerDiscussionForPlayId(playId) {
  const locateInLoadedScript = () => typeof script !== "undefined" && Array.isArray(script)
    ? script.findIndex((entry) => entry && !entry.isSeparator && _discussionPlayMatchesId(entry, playId))
    : -1;

  let scriptIndex = locateInLoadedScript();
  if (scriptIndex < 0 && typeof getPlayerPublishedScripts === "function") {
    const savedScript = getPlayerPublishedScripts().find((candidate) =>
      Array.isArray(candidate?.plays) && candidate.plays.some((entry) =>
        entry && !entry.isSeparator && _discussionPlayMatchesId(entry, playId),
      ),
    );
    if (savedScript && typeof loadPublishedPlayerScript === "function") {
      loadPublishedPlayerScript(savedScript.id, { skipToast: true });
      scriptIndex = locateInLoadedScript();
    }
  }
  if (scriptIndex < 0 || typeof openScriptPresentation !== "function") return false;

  if (typeof showTab === "function") showTab("script");
  window.setTimeout(() => {
    if (typeof setPlayPresentationMode === "function") setPlayPresentationMode("player");
    if (!openScriptPresentation(scriptIndex)) return;
    window.setTimeout(() => {
      if (typeof openPresentationDiscussion === "function") openPresentationDiscussion();
    }, 180);
  }, 0);
  return true;
}

/**
 * Called when a notification deep link targets a play ID. Players reopen the
 * exact published practice and thread; staff retain the richer editor flow.
 */
function openDiscussionForPlayId(playId) {
  if (!playId) return;

  if (_isPlayerNotificationUser()) {
    if (_openPlayerDiscussionForPlayId(playId)) return;
    // A practice may have been retired after an alert was delivered. The
    // player's question hub is the useful, non-destructive fallback.
    if (typeof openPlayerPortal === "function") openPlayerPortal();
    return;
  }

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
