// ── push-notifications.js ─────────────────────────────────────────────────────
// Web Push subscription management for player accounts.
// Adds an "Enable Push" footer to the notification drawer.
//
// Requires: utils.js (showToast, escapeHtml), app-notifications.js (drawer HTML)

let _pushInitialized = false;
let _vapidPublicKey = null; // base64url string, fetched once
let _pushConnectionListenersBound = false;

// ── Init ─────────────────────────────────────────────────────────────────────

async function initPushNotifications() {
  if (_pushInitialized) return;
  _pushInitialized = true;

  _injectPushFooter();
  _bindPushConnectionListeners();
  await _refreshPushUI();
}

// ── DOM injection ─────────────────────────────────────────────────────────────

function _injectPushFooter() {
  const drawer = document.querySelector(".notif-drawer-inner");
  if (!drawer || document.getElementById("pushNotifFooter")) return;

  const footer = document.createElement("footer");
  footer.id = "pushNotifFooter";
  footer.className = "push-notif-footer";
  footer.innerHTML = `<div id="pushNotifStatus" class="push-notif-status"></div>`;
  drawer.appendChild(footer);
}

// ── UI state ─────────────────────────────────────────────────────────────────

async function _refreshPushUI() {
  const el = document.getElementById("pushNotifStatus");
  if (!el) return;

  if (document.body?.dataset?.authRole && document.body.dataset.authRole !== "player") {
    el.innerHTML = "";
    document.getElementById("pushNotifFooter")?.setAttribute("hidden", "hidden");
    return;
  }
  document.getElementById("pushNotifFooter")?.removeAttribute("hidden");

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    _setPushStatus({
      icon: "📱",
      title: "Alerts are not supported in this browser",
      body: "You can still check Home before practice for anything coach posts.",
      tone: "muted",
    });
    return;
  }

  if (navigator.onLine === false) {
    _setPushStatus({
      icon: "📵",
      title: "Alert settings need internet",
      body: "Your loaded practice still works offline. Come back here when you reconnect.",
      tone: "warning",
    });
    return;
  }

  const permission = Notification.permission;

  if (permission === "denied") {
    _setPushStatus({
      icon: "🔕",
      title: "Alerts are blocked",
      body: "You can still use Home for updates. To get alerts, allow notifications in your browser settings.",
      tone: "blocked",
    });
    return;
  }

  _setPushStatus({
    icon: "⏳",
    title: "Checking alert settings",
    body: "One second while we check this device.",
    tone: "muted",
  });

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) {
    _setPushStatus({
      icon: "📱",
      title: "Alerts are not ready on this device",
      body: "Home and Practice still work normally. Try again after the app finishes loading.",
      tone: "muted",
    });
    return;
  }

  const existing = await registration.pushManager.getSubscription().catch(() => null);

  if (existing) {
    _setPushStatus({
      icon: "🔔",
      title: "Practice alerts are on",
      body: "Coach posts and replies can reach this device.",
      tone: "on",
      action: "disablePushNotifications",
      actionLabel: "Turn Off",
      actionClass: "push-notif-off-btn",
    });
  } else {
    _setPushStatus({
      icon: "🔔",
      title: "Practice alerts",
      body: "Get a heads-up when coach publishes practice or replies to a question.",
      tone: "ready",
      action: "enablePushNotifications",
      actionLabel: "Enable Alerts",
      actionClass: "btn-primary push-notif-enable-btn",
    });
  }
}

// ── Enable ────────────────────────────────────────────────────────────────────

async function enablePushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    await _refreshPushUI();
    return;
  }
  if (navigator.onLine === false) {
    await _refreshPushUI();
    return;
  }

  // Ensure permission is granted
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    await _refreshPushUI();
    if (permission === "denied") {
      showToast("Push notifications blocked. Allow them in browser settings.", { type: "error", duration: 4000 });
    }
    return;
  }

  // Fetch VAPID public key (cached)
  if (!_vapidPublicKey) {
    try {
      const res = await fetch("/api/push/vapid-key");
      const data = await res.json();
      if (!data.ok || !data.publicKey) {
        _setPushStatus({
          icon: "🛠️",
          title: "Team alerts are not fully configured yet",
          body: "You can still check Home for practices and replies.",
          tone: "warning",
        });
        showToast("Team alerts are not fully configured yet.", { type: "info" });
        return;
      }
      _vapidPublicKey = data.publicKey;
    } catch {
      _setPushStatus({
        icon: "📵",
        title: "Couldn’t reach the alert service",
        body: "Your practice is still available. Try again when the connection is stronger.",
        tone: "warning",
      });
      showToast("Could not reach alert service. Try again.", { type: "error" });
      return;
    }
  }

  // Convert base64url VAPID public key to Uint8Array
  const applicationServerKey = _b64uToUint8Array(_vapidPublicKey);

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    // Save subscription to server
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    const data = await res.json();

    if (data.ok) {
      showToast("Push notifications enabled.", { type: "success" });
    } else if (data.skipped) {
      showToast("Push is for player accounts only.", { duration: 3000 });
    } else {
      _setPushStatus({
        icon: "🛠️",
        title: "Couldn’t save alert settings",
        body: "Practice still works. Try enabling alerts again later.",
        tone: "warning",
      });
      showToast(data.error || "Failed to save subscription.", { type: "error" });
    }
  } catch (err) {
    console.error("[push] Subscribe error:", err);
    _setPushStatus({
      icon: "⚠️",
      title: "Couldn’t enable alerts",
      body: "No problem. Use Home before practice and try alerts again later.",
      tone: "warning",
    });
    showToast("Could not enable push notifications.", { type: "error" });
  }

  await _refreshPushUI();
}

// ── Disable ───────────────────────────────────────────────────────────────────

async function disablePushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      await _refreshPushUI();
      return;
    }

    // Remove from server first
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => { });

    // Unsubscribe from browser
    await subscription.unsubscribe();
    showToast("Push notifications disabled.", { duration: 2000 });
  } catch (err) {
    console.error("[push] Unsubscribe error:", err);
    showToast("Could not disable push notifications.", { type: "error" });
  }

  await _refreshPushUI();
}

// ── Utility ───────────────────────────────────────────────────────────────────

function _b64uToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function _bindPushConnectionListeners() {
  if (_pushConnectionListenersBound) return;
  _pushConnectionListenersBound = true;
  window.addEventListener("online", () => _refreshPushUI());
  window.addEventListener("offline", () => _refreshPushUI());
}

function _setPushStatus({ icon, title, body, tone = "", action = "", actionLabel = "", actionClass = "" }) {
  const el = document.getElementById("pushNotifStatus");
  if (!el) return;
  const actionMarkup = action
    ? `<button class="btn btn-xs ${escapeHtml(actionClass || "btn-secondary")}" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>`
    : "";
  el.innerHTML = `
    <span class="push-notif-status__icon" aria-hidden="true">${icon}</span>
    <span class="push-notif-copy push-notif-copy--${escapeHtml(tone)}">
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(body)}</small>
    </span>
    ${actionMarkup}`;
}
