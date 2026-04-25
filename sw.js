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

const CACHE_NAME = "bcoffense-v173";

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
  "./css/installation.css",
  "./css/print.css",
  "./css/responsive.css",
  // JS
  "./js/utils.js",
  "./js/playbook.js",
  "./js/script.js",
  "./js/wristband.js",
  "./js/callsheet.js",
  "./js/constraints.js",
  "./js/tendencies.js",
  "./js/installation.js",
  "./js/offensebuilder.js",
  "./js/help.js",
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
        .catch(() => caches.match(event.request)),
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
          const cached = await caches.match(event.request);
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("./offline.html");
          }
          return undefined;
        })
      : caches.match(event.request).then((cached) => {
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
