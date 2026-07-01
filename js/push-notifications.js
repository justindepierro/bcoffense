// ── push-notifications.js ─────────────────────────────────────────────────────
// Web Push subscription management for player accounts.
// Adds an "Enable Push" footer to the notification drawer.
//
// Requires: utils.js (showToast, escapeHtml), app-notifications.js (drawer HTML)

let _pushInitialized = false;
let _vapidPublicKey = null; // base64url string, fetched once

// ── Init ─────────────────────────────────────────────────────────────────────

async function initPushNotifications() {
  if (_pushInitialized) return;
  _pushInitialized = true;

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // Browser doesn't support push — render nothing
    return;
  }

  _injectPushFooter();
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

  const permission = Notification.permission;

  if (permission === "denied") {
    el.innerHTML = `<span class="push-notif-blocked">🔕 Push blocked — allow notifications in browser settings to enable.</span>`;
    return;
  }

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return;

  const existing = await registration.pushManager.getSubscription().catch(() => null);

  if (existing) {
    el.innerHTML = `
      <span class="push-notif-on">🔔 Push notifications on</span>
      <button class="btn btn-xs push-notif-off-btn" data-action="disablePushNotifications">Turn off</button>`;
  } else {
    el.innerHTML = `
      <button class="btn btn-xs btn-primary push-notif-enable-btn" data-action="enablePushNotifications">
        Enable push notifications
      </button>`;
  }
}

// ── Enable ────────────────────────────────────────────────────────────────────

async function enablePushNotifications() {
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
        showToast("Push not configured on server.", { type: "error" });
        return;
      }
      _vapidPublicKey = data.publicKey;
    } catch {
      showToast("Could not reach server. Try again.", { type: "error" });
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
      showToast(data.error || "Failed to save subscription.", { type: "error" });
    }
  } catch (err) {
    console.error("[push] Subscribe error:", err);
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
    }).catch(() => {});

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
