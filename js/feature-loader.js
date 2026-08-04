/* feature-loader.js - Deferred loading for isolated, opt-in product surfaces.
 *
 * Keep the first paint path limited to the daily workspace. A feature may be
 * registered here only when it has no startup side effects and its public
 * action can wait for the feature script to finish loading. This is not a
 * replacement for the service worker: after its first successful use the
 * normal local-asset cache keeps the feature available offline.
 */

const deferredFeatureLoads = new Map();
// Deferred tools are not present in index.html, so they cannot inherit the
// normal cache-buster check by accident. Read this boot script's own version
// once and reuse it for every deferred asset instead of leaving a stale
// literal behind after a release.
const DEFERRED_FEATURE_ASSET_VERSION = (() => {
  try {
    return new URL(document.currentScript?.src || "", window.location.href)
      .searchParams.get("v") || "";
  } catch (_err) {
    return "";
  }
})();

function deferredFeatureSrc(path) {
  return DEFERRED_FEATURE_ASSET_VERSION ? `${path}?v=${DEFERRED_FEATURE_ASSET_VERSION}` : path;
}

function loadDeferredFeature(name, src) {
  if (deferredFeatureLoads.has(name)) return deferredFeatureLoads.get(name);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.deferredFeature = name;
    script.onload = () => resolve();
    script.onerror = () => {
      deferredFeatureLoads.delete(name);
      script.remove();
      reject(new Error(`${name} could not be loaded.`));
    };
    document.head.appendChild(script);
  });

  deferredFeatureLoads.set(name, promise);
  return promise;
}

async function openDeferredMediaInventory() {
  try {
    await loadDeferredFeature("media-inventory", deferredFeatureSrc("js/media-inventory.js"));
    if (typeof window.openMediaInventoryReport !== "function" || window.openMediaInventoryReport === openDeferredMediaInventory) {
      throw new Error("Media Inventory did not finish starting.");
    }
    return window.openMediaInventoryReport();
  } catch (err) {
    if (typeof showToast === "function") {
      showToast("Media Inventory is unavailable right now. Check your connection and try again.", { type: "error" });
    }
    console.error("Deferred Media Inventory load failed:", err);
    return null;
  }
}

async function openDeferredPrintStudio() {
  try {
    await loadDeferredFeature("print-studio", deferredFeatureSrc("js/print-studio.js"));
    if (typeof window.openPrintStudio !== "function" || window.openPrintStudio === openDeferredPrintStudio) {
      throw new Error("Print Studio did not finish starting.");
    }
    return window.openPrintStudio();
  } catch (err) {
    if (typeof showToast === "function") {
      showToast("Print Studio is unavailable right now. Check your connection and try again.", { type: "error" });
    }
    console.error("Deferred Print Studio load failed:", err);
    return null;
  }
}

// The delegated action remains stable while the implementation replaces this
// bridge after its script loads. That keeps existing controls and keyboard
// paths working without loading recovery tooling during every startup.
window.openMediaInventoryReport = openDeferredMediaInventory;
// Stable delegated-action bridge; the feature script replaces it when loaded.
window.openPrintStudio = openDeferredPrintStudio;
