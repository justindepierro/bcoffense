/**
 * Service Worker — offline PWA support with freshness-aware caching
 * Practice Script & Playbook (bcoffense)
 *
 * Strategy:
 *   - Pre-cache all local assets on install
 *   - Let updates activate after existing app tabs close
 *   - Network-first for navigations and app-shell HTML/CSS/JS
 *   - Network-first for external resources (Google Fonts)
 *   - Stale-while-revalidate for other same-origin assets
 */

const CACHE_NAME = "bcoffense-v1423";

const NETWORK_FIRST_PATTERNS = [
  /\/index\.html$/,
  /\/manifest\.json$/,
  /\/offline\.html$/,
  /\/css\/.*\.css$/,
  /\/js\/.*\.js$/,
];

function shouldUseNetworkFirst(request, url) {
  if (request.mode === "navigate") return true;
  return NETWORK_FIRST_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

function isPrivateDataRoute(url) {
  // Cloudflare Functions below these prefixes return authenticated, team- or
  // user-scoped data. They must bypass Cache Storage entirely—even if a future
  // route accidentally omits a no-store header—so a device can never replay
  // another session's or an older workspace's response.
  return [
    "/admin/",
    "/api/",
    "/auth/",
    "/clips/",
    "/images/",
    "/media/",
    "/player/",
    "/sync/",
    "/workspace/",
  ].some((prefix) => url.pathname.startsWith(prefix));
}

function isCacheableResponse(response, allowOpaque = false) {
  if (!response) return false;
  // Partial (206) responses from Range requests (e.g. video streaming) cannot
  // be stored in the Cache API and must never be cached.
  if (response.status === 206) return false;
  if (!response.ok && !(allowOpaque && response.type === "opaque")) return false;
  const cacheControl = response.headers.get("Cache-Control") || "";
  return !/\bno-store\b/i.test(cacheControl);
}

// Fire-and-forget cache write that never surfaces an uncaught rejection.
// cache.put can reject (e.g. 206 partial responses, quota errors); swallow it.
function cachePut(request, response) {
  return caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, response))
    .catch(() => { });
}

function safePushTarget(rawUrl) {
  try {
    const url = new URL(rawUrl || "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : `${self.location.origin}/`;
  } catch (_) {
    return `${self.location.origin}/`;
  }
}

// Web Push: preserve a server-authorized in-app destination from the encrypted
// payload through both a cold app launch and an already-open app window.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: "BCOffense", body: event.data.text() }; }
  const title = payload.title || "BCOffense";
  const options = {
    body: payload.body || "New practice update from your coach.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: payload.tag || "practice-update",
    renotify: true,
    data: { url: safePushTarget(payload.url), deepLink: String(payload.deepLink || "") },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePushTarget(event.notification.data?.url);
  const deepLink = String(event.notification.data?.deepLink || "");
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.postMessage({ type: "PUSH_NOTIFICATION_CLICK", deepLink });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});

const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  // CSS
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/playbook.css",
  "./css/discussion.css",
  "./css/signals.css",
  "./css/script.css",
  "./css/script-quiz.css",
  "./css/play-presentation.css",
  "./css/wristband.css",
  "./css/callsheet.css",
  "./css/tendencies.css",
  "./css/offense-builder.css",
  "./css/dashboard.css",
  "./css/gameplan.css",
  "./css/installation.css",
  "./css/identity.css",
  "./css/print.css",
  "./css/responsive.css",
  // JS
  "./js/utils.js",
  "./js/app-diagnostics.js",
  "./js/feature-loader.js",
  "./js/startup-orchestrator.js",
  "./js/history.js",
  "./js/dom-helpers.js",
  "./js/lz-string.min.js",
  "./js/storage.js",
  "./js/storage-ui.js",
  "./js/workspace-sync.js",
  "./js/media-upload-outbox.js",
  "./js/play-images.js",
  "./js/play-clips.js",
  "./js/signals.js",
  "./js/cloud-sync.js",
  "./js/staged-restore.js",
  "./js/auth.js",
  "./js/vision.js",
  "./js/team-settings.js",
  "./js/players-admin.js",
  "./js/coach-access.js",
  "./js/discussion-outbox.js",
  "./js/play-discussion.js",
  "./js/discussion-media.js",
  "./js/playbook.js",
  "./js/playbook-collections.js",
  "./js/playbook-print.js",
  "./js/playbook-editor.js",
  "./js/playbook-import.js",
  "./js/playbook-export.js",
  "./js/playbook-chrome.js",
  "./js/playbook-reports.js",
  "./js/playbook-reports-identity.js",
  "./js/playbook-state.js",
  "./js/playbook-filters.js",
  "./js/playbook-navigation.js",
  "./js/playbook-actions.js",
  "./js/playbook-render.js",
  "./js/playbook-sanitize.js",
  "./js/playbook-analytics.js",
  "./js/playbook-analytics-render.js",
  "./js/playbook-identity.js",
  "./js/script-state.js",
  "./js/script-shared.js",
  "./js/script-players.js",
  "./js/script-display-options.js",
  "./js/play-readiness.js",
  "./js/script-add.js",
  "./js/script-sort.js",
  "./js/script-export.js",
  "./js/script-available.js",
  "./js/script-selection.js",
  "./js/script-timeline.js",
  "./js/script-render.js",
  "./js/script-quiz-state.js",
  "./js/script-quiz-foundation.js",
  "./js/script-quiz.js",
  "./js/script-quiz-media.js",
  "./js/script-quiz-progress.js",
  "./js/script-quiz-leaderboard.js",
  "./js/player-quiz-sync.js",
  "./js/script-quiz-assignments.js",
  "./js/script-health.js",
  "./js/script-periods.js",
  "./js/script-period-sync.js",
  "./js/script-smart.js",
  "./js/script-storage.js",
  "./js/script-player.js",
  "./js/script-integrations.js",
  "./js/play-presentation.js",
  "./js/wristband.js",
  "./js/wristband-library.js",
  "./js/wristband-render.js",
  "./js/wristband-cards.js",
  "./js/wristband-export.js",
  "./js/wristband-chrome.js",
  "./js/wristband-logo.js",
  "./js/wristband-search.js",
  "./js/wristband-modals.js",
  "./js/wristband-cell-popup.js",
  "./js/wristband-cell-actions.js",
  "./js/wristband-sort.js",
  "./js/wristband-storage.js",
  "./js/wristband-runtime.js",
  "./js/callsheet-render.js",
  "./js/callsheet.js",
  "./js/callsheet-print.js",
  "./js/callsheet-sort.js",
  "./js/callsheet-filters.js",
  "./js/callsheet-smart.js",
  "./js/callsheet-export.js",
  "./js/callsheet-display.js",
  "./js/callsheet-categories.js",
  "./js/callsheet-metadata.js",
  "./js/callsheet-layout.js",
  "./js/callsheet-templates.js",
  "./js/callsheet-picker-runtime.js",
  "./js/callsheet-gameplan-drawer.js",
  "./js/constraints.js",
  "./js/constraints-ui.js",
  "./js/script-vision.js",
  "./js/tendencies-render.js",
  "./js/tendencies.js",
  "./js/tendencies-print.js",
  "./js/installation-render.js",
  "./js/installation.js",
  "./js/installation-print.js",
  "./js/identity.js",
  "./js/offensebuilder.js",
  "./js/help.js",
  "./js/dashboard-render.js",
  "./js/dashboard.js",
  "./js/dashboard-questions.js",
  "./js/gameplan.js",
  "./js/gameplan-render.js",
  "./js/gameplan-dnd.js",
  "./js/gameplan-actions.js",
  "./js/gameplan-smart.js",
  "./js/gameplan-health.js",
  "./js/gameplan-print.js",
  "./js/gameplan-integrations.js",
  "./js/gameplan-snapshots.js",
  "./js/script-events.js",
  "./js/anchored-menu.js",
  "./js/app-events.js",
  "./js/app-command.js",
  "./js/page-actions.js",
  "./js/app-notifications.js",
  "./js/push-notifications.js",
  "./js/player-portal.js",
  "./js/app-shell.js",
  "./js/app-session.js",
  "./js/app-navigation.js",
  "./js/app-module-init.js",
  "./js/app-bootstrap.js",
  "./js/app-init.js",
  "./js/app.js",
  // Icons
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // Offline fallback
  "./offline.html",
];

// Install: pre-cache assets resiliently, but do not take over an active tab.
// A waiting worker is applied only through the app's explicit update action,
// which prevents a live coach workspace from running mixed old/new code.
async function precacheLocalAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(
    LOCAL_ASSETS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch (_err) {
        // One optional/offline asset must not block an install.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheLocalAssets());
});

// Activate: clean up old caches and notify any newly controlled tabs.
async function activateCurrentCache() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key !== CACHE_NAME)
      .map((key) => caches.delete(key)),
  );
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) =>
    client.postMessage({ type: "SW_ACTIVATED", version: CACHE_NAME }),
  );
}

self.addEventListener("activate", (event) => {
  event.waitUntil(activateCurrentCache());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

// Fetch: network-first for app-shell/external resources, SWR for other local assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Skip non-http(s) schemes (e.g. chrome-extension://) — can't be cached
  if (!event.request.url.startsWith("http")) return;

  // Every authenticated Cloudflare data endpoint is network-only. This is a
  // deliberate second boundary after the server's no-store headers: cached
  // assets stay fast offline, while workspace, media, notification, quiz, and
  // account reads always reflect the current authenticated team.
  if (isPrivateDataRoute(url)) return;

  // External resources (fonts, CDNs): network-first with cache fallback
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (isCacheableResponse(response, true)) {
            const clone = response.clone();
            cachePut(event.request, clone);
          }
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true })),
    );
    return;
  }

  // App shell assets: network-first to avoid serving stale HTML/JS/CSS after updates
  event.respondWith(
    (shouldUseNetworkFirst(event.request, url)
      ? fetch(event.request)
        .then((response) => {
          if (isCacheableResponse(response)) {
            const clone = response.clone();
            cachePut(event.request, clone);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("./offline.html");
          }
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
      : caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (isCacheableResponse(response)) {
              const clone = response.clone();
              cachePut(event.request, clone);
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })),
  );
});
