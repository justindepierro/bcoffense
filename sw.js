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

const CACHE_NAME = "bcoffense-v1071";

// Item 40: in-memory TTL tracker for /auth/me short-term cache
let _authMeCacheTime = 0;

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

// Item 47: Web Push scaffolding (Phase 2 — requires VAPID keys + server endpoint)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: "BCOffense", body: event.data.text() }; }
  const title = payload.title || "BCOffense";
  const options = {
    body: payload.body || "New practice update from your coach.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "practice-update",
    renotify: true,
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
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
  "./css/signals.css",
  "./css/script.css",
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
  "./js/startup-orchestrator.js",
  "./js/history.js",
  "./js/dom-helpers.js",
  "./js/lz-string.min.js",
  "./js/storage.js",
  "./js/storage-ui.js",
  "./js/workspace-sync.js",
  "./js/play-images.js",
  "./js/play-clips.js",
  "./js/signals.js",
  "./js/cloud-sync.js",
  "./js/auth.js",
  "./js/vision.js",
  "./js/team-settings.js",
  "./js/players-admin.js",
  "./js/play-discussion.js",
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
  "./js/player-quiz-sync.js",
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
  "./js/print-studio.js",
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

// Install: let an updated worker wait until existing app tabs close. Pre-cache
// assets resiliently — one failure won't block.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        LOCAL_ASSETS.map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => { if (res.ok) cache.put(url, res); })
            .catch(() => { /* skip missing/failed assets silently */ }),
        ),
      ),
    ),
  );
});

// Activate: clean up old caches and notify any newly controlled tabs.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => {
        // Notify open tabs that the active worker version changed.
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((client) =>
            client.postMessage({ type: "SW_ACTIVATED", version: CACHE_NAME }),
          );
        });
      }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: network-first for app-shell/external resources, SWR for other local assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Skip non-http(s) schemes (e.g. chrome-extension://) — can't be cached
  if (!event.request.url.startsWith("http")) return;

  // Video clips stream from R2 via Range requests — let them bypass the worker
  // entirely so the browser handles partial (206) responses directly.
  if (url.pathname.startsWith("/clips/")) return;

  // Item 40: serve /auth/me from cache for up to 30s to unblock slow-network PWA opens
  if (url.pathname === "/auth/me") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        if (Date.now() - _authMeCacheTime < 30000) {
          const cached = await cache.match(event.request);
          if (cached) return cached;
        }
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            _authMeCacheTime = Date.now();
            cachePut(event.request, response.clone());
          }
          return response;
        } catch {
          return (
            (await cache.match(event.request)) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })()
    );
    return;
  }

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
