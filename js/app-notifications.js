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
let _pushDeepLinkRoutingBound = false;
let _pendingPushDeepLink = "";
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
  initPushDeepLinkRouting();
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

function initPushDeepLinkRouting() {
  if (_pushDeepLinkRoutingBound) return;
  _pushDeepLinkRoutingBound = true;

  const route = (deepLink) => {
    const target = String(deepLink || "").trim();
    if (!target) return;
    _pendingPushDeepLink = target;
    _consumePendingPushDeepLink();
  };

  try {
    const url = new URL(window.location.href);
    const deepLink = url.searchParams.get("push") || "";
    if (deepLink) {
      url.searchParams.delete("push");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      route(deepLink);
    }
  } catch (_) { /* A malformed address must never block the app shell. */ }

  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "PUSH_NOTIFICATION_CLICK") route(event.data.deepLink);
  });
}

async function _consumePendingPushDeepLink() {
  const deepLink = _pendingPushDeepLink;
  if (!deepLink) return;
  const user = typeof whenAuthReady === "function"
    ? await whenAuthReady()
    : (typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null);
  if (!user) return;
  _pendingPushDeepLink = "";
  // Reuse the normal, role-restricted notification router. There is no inbox
  // record to mark read here; the next inbox refresh reconciles that state.
  await openNotifDeepLink(`::${deepLink}`);
}

// ── Badge ─────────────────────────────────────────────────────────────────────

async function _pollUnreadCount(opts = {}) {
  // The shell can mount before auth.js completes its secure-cookie check.
  // A notification poll without a verified identity is neither useful nor a
  // failure, so skip it and let the authenticated render start polling.
  const authUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (!authUser) return;
  if (typeof window.workspaceSync?.canAttemptBackgroundRequest === "function" &&
      !window.workspaceSync.canAttemptBackgroundRequest("notification-count")) return;
  try {
    const res = await fetch("/api/notifications/count", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) return;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || `Alert request failed with ${res.status}`);
      err.status = res.status;
      err.data = data;
      err.retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      window.workspaceSync?.recordBackgroundRequestFailure?.("notification-count", err);
      _setNotificationState({
        checkedAt: new Date().toISOString(),
        error: err.retryable ? "Alerts will reconnect automatically." : "Could not check alerts.",
        online: typeof navigator === "undefined" || navigator.onLine !== false,
      }, opts);
      return;
    }
    const data = await res.json();
    window.workspaceSync?.recordBackgroundRequestSuccess?.("notification-count");
    _setNotificationState({
      unread: data.unread || 0,
      checkedAt: new Date().toISOString(),
      error: "",
      online: typeof navigator === "undefined" || navigator.onLine !== false,
    }, opts);
  } catch (err) {
    window.workspaceSync?.recordBackgroundRequestFailure?.("notification-count", err);
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
  _syncNotifDrawerRoleLabels();
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
      onEscape: () => closeNotifDrawer(),
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
    const res = await fetch(`/api/notifications?limit=25&offset=${_notifOffset}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
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
const _NOTIF_STAFF_INBOX_TYPES = new Set(["player_comment", "player_question", "player_reply"]);

function _notifNeedsStaffReply(item) {
  return _isStaffNotificationUser() && _NOTIF_STAFF_INBOX_TYPES.has(item?.type);
}

function _notifBucket(item) {
  if (_isPlayerNotificationUser()) {
    if (item?.type === "new_quiz" || item?.type === "quiz_homework" || String(item?.deepLink || "").startsWith("quiz")) return "quiz";
    if (_NOTIF_CONVERSATION_TYPES.has(item?.type) || String(item?.deepLink || "").startsWith("play:")) return "questions";
    if (item?.type === "script_published" || String(item?.deepLink || "").startsWith("script")) return "practice";
    return "updates";
  }
  if (item?.inboxGroup) return "inbox";
  if (_NOTIF_CONVERSATION_TYPES.has(item?.type)) return "conversation";
  if (_NOTIF_PRACTICE_TYPES.has(item?.type)) return "practice";
  return "other";
}

function _notifGroupItems(items) {
  const grouped = [];
  const byKey = new Map();
  for (const item of items) {
    const inbox = _notifNeedsStaffReply(item);
    const key = _NOTIF_GROUPABLE_TYPES.has(item?.type)
      ? `${item.type}|${item.deepLink || ""}`
      : (inbox ? `coach-inbox|${item.deepLink || ""}` : "");
    const existing = key ? byKey.get(key) : null;
    if (existing) {
      existing.notificationIds.push(String(item.id));
      existing.groupCount += 1;
      // A grouped card is unread until every underlying receipt is read.
      // That keeps a quiet older update from disappearing behind a newer read one.
      existing.read = Boolean(existing.read && item.read);
      existing.inboxGroup = Boolean(existing.inboxGroup || inbox);
      if (inbox) {
        existing.title = `${existing.groupCount} player updates need review`;
        existing.body = "Open this play conversation to respond or follow up.";
      }
      continue;
    }
    const next = { ...item, notificationIds: [String(item.id)], groupCount: 1, inboxGroup: inbox };
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

function _syncNotifDrawerRoleLabels() {
  const player = _isPlayerNotificationUser();
  const labels = player
    ? [["inbox", "Questions", "questions"], ["conversation", "Quiz", "quiz"], ["practice", "Practice", "practice"]]
    : [["inbox", "Coach inbox", "inbox"], ["conversation", "Messages", "conversation"], ["practice", "Practice", "practice"]];
  labels.forEach(([slot, label, filter]) => {
    const button = document.querySelector(`.notif-filter-btn[data-slot="${slot}"]`);
    if (!button) return;
    button.textContent = label;
    button.dataset.arg = filter;
  });
}

function _notifDestination(item) {
  const deepLink = String(item?.deepLink || "");
  if (deepLink.startsWith("script") || item?.type === "script_published") return "Open practice";
  if (deepLink.startsWith("quiz") || item?.type === "new_quiz" || item?.type === "quiz_homework") return "Open quiz";
  if (deepLink.startsWith("play:") || _NOTIF_CONVERSATION_TYPES.has(item?.type)) return "Open question";
  if (deepLink === "dashboard") return "Open Player Home";
  if (deepLink === "questions") return "Open questions";
  return "Open update";
}

function _notifSectionLabel(bucket) {
  return ({ practice: "Practice", quiz: "Quiz", questions: "Questions", updates: "Team updates" })[bucket] || "Updates";
}

function _renderNotificationList(listEl = document.getElementById("notifList")) {
  if (!listEl) return;
  const notifications = _notifGroupItems(_notifItems)
    .filter((item) => _notifFilter === "all" || _notifBucket(item) === _notifFilter || (_notifFilter === "conversation" && _NOTIF_CONVERSATION_TYPES.has(item?.type)));
  if (!notifications.length) {
    const hasItems = _notifItems.length > 0;
    listEl.innerHTML = _notifStateHtml({
      icon: hasItems ? "🗂️" : "✅",
      title: hasItems ? (_notifFilter === "inbox" ? "No coach follow-ups" : "Nothing in this view") : (_isPlayerNotificationUser() ? "No new practice updates" : "All caught up"),
      body: hasItems
        ? (_notifFilter === "inbox" ? "Player comments and questions that need attention will appear here." : "Try All to see every update.")
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
  if (!_isPlayerNotificationUser()) {
    listEl.innerHTML = notifications.map(_notifItemHtml).join("");
    return;
  }
  const groups = new Map();
  notifications.forEach((item) => {
    const bucket = _notifBucket(item);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(item);
  });
  const order = ["practice", "quiz", "questions", "updates"];
  listEl.innerHTML = order.filter((bucket) => groups.has(bucket)).map((bucket) =>
    `<li class="notif-section-label" aria-hidden="true">${_notifSectionLabel(bucket)}</li>${groups.get(bucket).map(_notifItemHtml).join("")}`,
  ).join("");
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
  const inbox = Boolean(n.inboxGroup);
  const groupLabel = grouped
    ? `<div class="notif-item-group">${inbox ? `${escapeHtml(String(n.groupCount))} player updates in this conversation` : `${escapeHtml(String(n.groupCount))} similar practice updates`}</div>`
    : "";
  const inboxLabel = inbox ? `<div class="notif-item-priority">Coach follow-up</div>` : "";
  return (
    `<li class="notif-item${unreadCls}${typeCls}${grouped ? " notif-item--grouped" : ""}${inbox ? " notif-item--inbox" : ""}" id="notif-${escapeHtml(n.id)}"${link} role="button" tabindex="0">` +
    `<div class="notif-item-icon" aria-hidden="true">${icon}</div>` +
    `<div class="notif-item-content">` +
    `<div class="notif-item-kicker">${escapeHtml(label)}${n.read ? "" : `<span>New</span>`}</div>` +
    inboxLabel +
    `<div class="notif-item-title">${escapeHtml(n.title)}</div>` +
    (n.body ? `<div class="notif-item-body">${escapeHtml(n.body)}</div>` : "") +
    groupLabel +
    (n.deepLink ? `<div class="notif-item-destination">${escapeHtml(_notifDestination(n))}<span aria-hidden="true">→</span></div>` : "") +
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
    const rawScriptId = deepLink.includes(":") ? deepLink.slice(deepLink.indexOf(":") + 1) : "";
    const scriptId = (() => {
      try { return decodeURIComponent(rawScriptId); } catch (_) { return rawScriptId; }
    })();
    // A notification can arrive while the device still has yesterday's
    // release. Refresh the narrow player projection before resolving the
    // script ID so the alert, library, and destination stay in lockstep.
    const authUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    if (authUser?.role === "player" && typeof refreshPlayerRelease === "function") {
      await refreshPlayerRelease({ force: true, navigate: false }).catch(() => null);
    }
    if (scriptId && _isPlayerNotificationUser() && typeof presentPublishedPlayerScript === "function") {
      // A player alert is an invitation to study, so open the exact released
      // practice directly in Swipe View rather than leaving the player on a
      // generic script landing page.
      presentPublishedPlayerScript(scriptId);
    } else if (scriptId && typeof loadPublishedPlayerScript === "function") {
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

  const discussionTarget = _parseNotificationDiscussionTarget(deepLink);
  const playId = discussionTarget.playId;
  if (playId) {
    openDiscussionForPlayId(playId, { postId: discussionTarget.postId });
  }
}

function _parseNotificationDiscussionTarget(deepLink) {
  const raw = String(deepLink || "");
  const value = raw.startsWith("play:") ? raw.slice(5) : raw;
  const marker = value.indexOf("?post=");
  const rawPlayId = marker >= 0 ? value.slice(0, marker) : value;
  const rawPostId = marker >= 0 ? value.slice(marker + "?post=".length) : "";
  const decode = (part) => {
    try { return decodeURIComponent(part); } catch (_) { return part; }
  };
  return { playId: decode(rawPlayId), postId: decode(rawPostId) };
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
  const allowed = _isPlayerNotificationUser()
    ? ["all", "questions", "quiz", "practice"]
    : ["all", "inbox", "conversation", "practice"];
  _notifFilter = allowed.includes(filter) ? filter : "all";
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
  const scriptId = String(details.id || "").trim();
  const isPublishedScript = kind === "scripts" && details.visibility !== "unpublished" && scriptId;
  if (isPublishedScript) {
    return {
      type: "script_published",
      title: "New practice ready",
      body: label ? `${label} is ready to review.` : "A practice is ready to review.",
      deepLink: `script:${encodeURIComponent(scriptId)}`,
      tag: `script-published-${scriptId}`,
    };
  }
  if (kind === "quizzes") {
    return {
      type: "new_quiz",
      title: "New quiz ready",
      body: label || "New quiz work is ready to start.",
      deepLink: "quiz",
      tag: "team-quiz-update",
    };
  }
  if (["scripts", "diagrams", "clips", "signals"].includes(kind)) {
    const body = kind === "scripts"
      ? (label ? `${label} is ready to review.` : "A practice is ready to review.")
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

async function _openPlayerDiscussionForPlayId(playId, opts = {}) {
  // The notification can precede the release payload already held by this
  // device. Resolve against the freshly checked player projection, never an
  // arbitrary script that happened to be open before the phone slept.
  if (typeof refreshPlayerRelease === "function") {
    await refreshPlayerRelease({ force: true, navigate: false }).catch(() => null);
  }
  if (opts.postId && typeof setDiscussionDeepLink === "function") {
    setDiscussionDeepLink(playId, opts.postId);
  }
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
async function openDiscussionForPlayId(playId, opts = {}) {
  if (!playId) return;

  if (_isPlayerNotificationUser()) {
    if (await _openPlayerDiscussionForPlayId(playId, opts)) return;
    // A practice may have been retired after an alert was delivered. The
    // player's question hub is the useful, non-destructive fallback.
    if (typeof openPlayerPortal === "function") openPlayerPortal();
    return;
  }

  // Switch to playbook tab
  if (typeof showTab === "function") showTab("playbook");

  // Attempt to find and open the workflow panel for the play. Notification
  // parsing decodes the deep link, while discussion IDs are URL-safe, so use
  // both forms and the canonical thread-ID helper instead of guessing fields.
  if (typeof plays === "undefined" || !Array.isArray(plays)) return;

  const decoded = (() => { try { return decodeURIComponent(playId); } catch (_) { return playId; } })();
  const encoded = encodeURIComponent(decoded);
  const matchIndex = plays.findIndex((play) => {
    if (!play) return false;
    if (typeof getPlayThreadId === "function" && getPlayThreadId(play) === encoded) return true;
    return String(play._id || "") === decoded ||
      [play.personnel, play.formation, play.play].map((value) => String(value || "")).join("::") === decoded;
  });

  if (matchIndex >= 0 && typeof openPlayWorkflowPanel === "function") {
    if (opts.postId && typeof setDiscussionDeepLink === "function") {
      setDiscussionDeepLink(encoded, opts.postId);
    }
    // Scroll to the play in the table first
    setTimeout(() => {
      openPlayWorkflowPanel(matchIndex);
      // Scroll to discussion section inside the panel
      setTimeout(() => {
        const discussion = document.querySelector(".disc-body[data-disc-play-id]");
        if (discussion) scrollElementWithinPanel(discussion, { behavior: "smooth", block: "start" });
      }, 400);
    }, 300);
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && _notifDrawerOpen) closeNotifDrawer();
});
