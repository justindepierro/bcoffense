/**
 * Service Worker — Cache-first for offline PWA support
 * Practice Script & Playbook (bcoffense)
 *
 * Strategy:
 *   - Pre-cache all local assets on install
 *   - Cache-first for local files (fast + offline)
 *   - Network-first for external resources (Google Fonts)
 *   - Stale-while-revalidate: serve cached, then update cache in background
 */

const CACHE_NAME = "bcoffense-v512";

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

// Allow the app to trigger a cache refresh
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});

const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./PRODUCT_ROADMAP.md",
  // CSS
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/playbook.css",
  "./css/script.css",
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
  "./js/history.js",
  "./js/dom-helpers.js",
  "./js/storage.js",
  "./js/storage-ui.js",
  "./js/play-images.js",
  "./js/cloud-sync.js",
  "./js/auth.js",
  "./js/vision.js",
  "./js/team-settings.js",
  "./js/playbook.js",
  "./js/playbook-collections.js",
  "./js/playbook-print.js",
  "./js/playbook-editor.js",
  "./js/playbook-import.js",
  "./js/playbook-export.js",
  "./js/playbook-chrome.js",
  "./js/playbook-state.js",
  "./js/playbook-filters.js",
  "./js/playbook-navigation.js",
  "./js/playbook-actions.js",
  "./js/playbook-render.js",
  "./js/playbook-sanitize.js",
  "./js/script-state.js",
  "./js/script-shared.js",
  "./js/script-players.js",
  "./js/script-display-options.js",
  "./js/script-add.js",
  "./js/script-sort.js",
  "./js/script-export.js",
  "./js/script-available.js",
  "./js/script-selection.js",
  "./js/script-render.js",
  "./js/script-periods.js",
  "./js/script-period-sync.js",
  "./js/script-smart.js",
  "./js/script-storage.js",
  "./js/wristband.js",
  "./js/wristband-library.js",
  "./js/wristband-render.js",
  "./js/wristband-cards.js",
  "./js/wristband-export.js",
  "./js/wristband-search.js",
  "./js/wristband-modals.js",
  "./js/wristband-cell-popup.js",
  "./js/wristband-cell-actions.js",
  "./js/wristband-sort.js",
  "./js/wristband-storage.js",
  "./js/wristband-runtime.js",
  "./js/callsheet.js",
  "./js/callsheet-categories.js",
  "./js/callsheet-metadata.js",
  "./js/callsheet-layout.js",
  "./js/callsheet-picker-runtime.js",
  "./js/callsheet-gameplan-drawer.js",
  "./js/constraints.js",
  "./js/script-vision.js",
  "./js/tendencies.js",
  "./js/installation.js",
  "./js/identity.js",
  "./js/offensebuilder.js",
  "./js/help.js",
  "./js/dashboard.js",
  "./js/gameplan.js",
  "./js/gameplan-render.js",
  "./js/gameplan-dnd.js",
  "./js/gameplan-actions.js",
  "./js/gameplan-smart.js",
  "./js/gameplan-print.js",
  "./js/gameplan-integrations.js",
  "./js/gameplan-snapshots.js",
  "./js/print-studio.js",
  "./js/app-events.js",
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

// Install: pre-cache all local assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(LOCAL_ASSETS)),
  );
  self.skipWaiting();
});

// Activate: clean up old caches
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
      ),
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for local, network-first for external
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Skip non-http(s) schemes (e.g. chrome-extension://) — can't be cached
  if (!event.request.url.startsWith("http")) return;

  // External resources (fonts, CDNs): network-first with cache fallback
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
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
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("./offline.html");
          }
          return undefined;
        })
      : caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            const clone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone));
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })),
  );
});
