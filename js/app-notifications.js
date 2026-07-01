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
const NOTIF_POLL_INTERVAL_MS = 60_000; // 60 s

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Call once after login is confirmed. Starts the unread poll and wires
 * the bell button.
 */
function initNotifications() {
  if (_notifInitialized) {
    // Already running — just trigger an immediate poll for fresh count
    _pollUnreadCount();
    return;
  }
  _notifInitialized = true;
  _pollUnreadCount();
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

async function _pollUnreadCount() {
  try {
    const res = await fetch("/api/notifications/count");
    if (!res.ok) return;
    const data = await res.json();
    _updateBellBadge(data.unread || 0);
  } catch (_) {
    // Silent — badge is optional
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

// ── Drawer open/close ─────────────────────────────────────────────────────────

async function openNotifDrawer() {
  const drawer = document.getElementById("notifDrawer");
  if (!drawer) return;
  _notifDrawerOpen = true;
  _notifOffset = 0;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.getElementById("notifBellBtn")?.setAttribute("aria-expanded", "true");
  await _loadNotifications(false);
}

function closeNotifDrawer() {
  const drawer = document.getElementById("notifDrawer");
  if (!drawer) return;
  _notifDrawerOpen = false;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  document.getElementById("notifBellBtn")?.setAttribute("aria-expanded", "false");
}

function toggleNotifDrawer() {
  _notifDrawerOpen ? closeNotifDrawer() : openNotifDrawer();
}

// ── Load notifications ─────────────────────────────────────────────────────────

async function _loadNotifications(append = false) {
  const listEl = document.getElementById("notifList");
  if (!listEl) return;

  if (!append) {
    listEl.innerHTML = `<p class="notif-loading">Loading…</p>`;
  }

  try {
    const res = await fetch(`/api/notifications?limit=25&offset=${_notifOffset}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to load");

    _notifHasMore = data.hasMore;
    _notifOffset += data.notifications.length;

    if (!append) {
      if (data.notifications.length === 0) {
        listEl.innerHTML = `<p class="notif-empty">You're all caught up! No notifications yet.</p>`;
      } else {
        listEl.innerHTML = data.notifications.map(_notifItemHtml).join("");
      }
    } else {
      listEl.querySelector(".notif-loading")?.remove();
      data.notifications.forEach((n) => {
        const tmp = document.createElement("div");
        tmp.innerHTML = _notifItemHtml(n);
        if (tmp.firstElementChild) listEl.appendChild(tmp.firstElementChild);
      });
    }

    // Update unread badge from fresh count
    _updateBellBadge(data.unread || 0);

    // Load More button
    const existingMore = document.getElementById("notifLoadMore");
    existingMore?.remove();
    if (_notifHasMore) {
      const btn = document.createElement("button");
      btn.id = "notifLoadMore";
      btn.className = "btn btn-xs notif-load-more";
      btn.textContent = "Load more";
      btn.dataset.action = "loadMoreNotifs";
      document.getElementById("notifDrawerBody")?.appendChild(btn);
    }
  } catch (err) {
    listEl.innerHTML =
      `<p class="notif-error">Couldn't load notifications.</p>` +
      `<button class="btn btn-xs" data-action="retryNotifs">Retry</button>`;
  }
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

const _NOTIF_ICONS = {
  coach_reply: "💬",
  question_resolved: "✅",
  script_published: "📋",
  new_quiz: "📝",
};

function _notifRelTime(unixSec) {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function _notifItemHtml(n) {
  const icon = _NOTIF_ICONS[n.type] || "🔔";
  const unreadCls = n.read ? "" : " notif-item--unread";
  const link = n.deepLink
    ? ` data-action="openNotifDeepLink" data-arg="${escapeHtml(n.id)}::${escapeHtml(n.deepLink)}"`
    : "";
  return (
    `<div class="notif-item${unreadCls}" id="notif-${escapeHtml(n.id)}"${link} role="button" tabindex="0">` +
    `<div class="notif-item-icon" aria-hidden="true">${icon}</div>` +
    `<div class="notif-item-content">` +
    `<div class="notif-item-title">${escapeHtml(n.title)}</div>` +
    (n.body ? `<div class="notif-item-body">${escapeHtml(n.body)}</div>` : "") +
    `<div class="notif-item-time">${escapeHtml(_notifRelTime(n.createdAt))}</div>` +
    `</div>` +
    (n.read ? "" : `<span class="notif-unread-dot" aria-hidden="true"></span>`) +
    `</div>`
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function openNotifDeepLink(arg) {
  const sep = String(arg || "").indexOf("::");
  if (sep < 0) return;
  const notifId = arg.slice(0, sep);
  const playId = arg.slice(sep + 2);

  // Mark read optimistically
  const itemEl = document.getElementById(`notif-${notifId}`);
  if (itemEl) {
    itemEl.classList.remove("notif-item--unread");
    itemEl.querySelector(".notif-unread-dot")?.remove();
  }
  fetch(`/api/notifications/${encodeURIComponent(notifId)}`, { method: "PATCH" }).catch(() => { });

  closeNotifDrawer();

  // Navigate to the play's discussion
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
    _updateBellBadge(0);
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
