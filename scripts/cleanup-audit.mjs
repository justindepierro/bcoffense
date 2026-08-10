#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

function walk(dir, out = []) {
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.isFile()) out.push(rel);
  });
  return out;
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function extractAll(text, regex, group = 1) {
  return [...text.matchAll(regex)].map((match) => match[group]).filter(Boolean);
}

function getHtmlAssets(html) {
  const scripts = extractAll(html, /<script[^>]+src="([^"]+)"/g).map((src) =>
    src.split("?")[0],
  );
  const styles = extractAll(html, /<link[^>]+href="([^"]+\.css)(?:\?[^"]*)?"/g);
  return { scripts: unique(scripts), styles: unique(styles) };
}

function getDeferredFeatureAssets(featureLoader) {
  // Deferred features are deliberately absent from the startup shell and its
  // precache. Treat their registered script URLs as runtime references so this
  // audit does not report supported, lazy-loaded features as dead files.
  return unique([
    ...extractAll(
      featureLoader,
      /loadDeferredFeature\([^,]+,\s*(?:deferredFeatureSrc\(\s*)?["'](js\/[^"'?]+\.js)(?:\?[^"']*)?["']\s*\)?\s*\)/g,
    ),
    // registerDeferredActions("name", "js/x.js", [...]) bridges.
    ...extractAll(
      featureLoader,
      /registerDeferredActions\(\s*["'][^"']+["']\s*,\s*["'](js\/[^"'?]+\.js)["']/g,
    ),
  ]);
}

function getServiceWorkerAssets(sw) {
  const assetsMatch = sw.match(/const LOCAL_ASSETS = \[([\s\S]*?)\];/);
  if (!assetsMatch) return [];
  return unique(
    extractAll(assetsMatch[1], /"\.\/([^"]+)"/g).filter((asset) => asset !== ""),
  );
}

function getCallableGlobals(files) {
  const callable = new Set();
  files.forEach((file) => {
    const text = read(file);
    extractAll(text, /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g).forEach(
      (name) => callable.add(name),
    );
    extractAll(text, /window\.([A-Za-z_$][\w$]*)\s*=/g).forEach((name) => callable.add(name));
  });
  return callable;
}

function getLocallyHandledActions(files) {
  const handled = new Set();
  files.forEach((file) => {
    const text = read(file);
    extractAll(text, /case\s+["']([^"']+)["']\s*:/g).forEach((name) => handled.add(name));
    extractAll(text, /(?:action|fmt|cmd)\s*={2,3}\s*["']([^"']+)["']/g).forEach((name) =>
      handled.add(name),
    );
    extractAll(text, /closest\(\s*["']\[data-action=["']([^"']+)["']\]/g).forEach((name) =>
      handled.add(name),
    );
  });
  return handled;
}

function getDeclarativeHandlers(files) {
  const actions = [];
  const inputHandlers = [];

  files.forEach((file) => {
    const text = read(file);
    extractAll(text, /data-action=["']([^"']+)["']/g).forEach((action) => {
      actions.push({ file, name: action });
    });
    extractAll(text, /data-on(?:change|input)=["']([^"']+)["']/g).forEach((list) => {
      list.split(";").map((name) => name.trim()).filter(Boolean).forEach((name) => {
        inputHandlers.push({ file, name });
      });
    });
  });

  return { actions, inputHandlers };
}

function audit() {
  const html = read("index.html");
  const sw = read("sw.js");
  const htmlAssets = getHtmlAssets(html);
  const deferredJs = getDeferredFeatureAssets(read("js/feature-loader.js"));
  const swAssets = getServiceWorkerAssets(sw);
  const jsFiles = walk("js").filter((file) => file.endsWith(".js")).sort();
  const cssFiles = walk("css").filter((file) => file.endsWith(".css")).sort();
  const scannedFiles = ["index.html", ...jsFiles];
  const callable = getCallableGlobals(jsFiles);
  const locallyHandledActions = getLocallyHandledActions(jsFiles);
  const { actions, inputHandlers } = getDeclarativeHandlers(scannedFiles);

  const actionBuiltins = new Set([
    "closeModalOverlay",
    "closePromptOverlay",
    "closeChoiceOverlay",
    "closeListPickerOverlay",
    "closeStorageOverlay",
    "reloadPage",
    "removeParentOpen",
    "toggleParentOpen",
    "triggerClick",
  ]);

  const missingActions = unique(
    actions
      .map(({ name }) => {
        if (name === "fnName") return "";
        if (!/^[A-Za-z_$][\w$-]*$/.test(name)) return "";
        if (actionBuiltins.has(name)) return "";
        if (callable.has(name) || locallyHandledActions.has(name)) return "";
        const overlayTarget = name.endsWith("Overlay") ? name.slice(0, -7) : "";
        return overlayTarget && callable.has(overlayTarget) ? "" : name;
      })
      .filter(Boolean),
  );

  const missingInputHandlers = unique(
    inputHandlers
      .map(({ name }) => (callable.has(name) ? "" : name))
      .filter(Boolean),
  );

  const loadedJs = new Set(htmlAssets.scripts.filter((asset) => asset.startsWith("js/")));
  const linkedCss = new Set(htmlAssets.styles.filter((asset) => asset.startsWith("css/")));
  const cachedAssets = new Set(swAssets);

  const runtimeJs = new Set([...loadedJs, ...deferredJs]);
  const jsNotInIndex = jsFiles.filter((file) => !runtimeJs.has(file));
  const cssNotLinked = cssFiles.filter((file) => !linkedCss.has(file));
  const indexAssetsMissing = [...htmlAssets.scripts, ...htmlAssets.styles].filter(
    (asset) => !exists(asset),
  );
  const loadedAssetsNotCached = [...htmlAssets.scripts, ...htmlAssets.styles].filter(
    (asset) => !cachedAssets.has(asset),
  );
  const cachedAssetsMissing = swAssets.filter((asset) => asset && !exists(asset));

  return {
    counts: {
      jsFiles: jsFiles.length,
      cssFiles: cssFiles.length,
      dataActions: unique(actions.map(({ name }) => name)).length,
      declarativeHandlers: unique(inputHandlers.map(({ name }) => name)).length,
    },
    deferredJs,
    missingActions,
    missingInputHandlers,
    jsNotInIndex,
    cssNotLinked,
    indexAssetsMissing,
    loadedAssetsNotCached,
    cachedAssetsMissing,
  };
}

function printList(label, values) {
  console.log(`\n${label}: ${values.length}`);
  values.forEach((value) => console.log(`  - ${value}`));
}

const result = audit();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("BCOffense cleanup audit");
  console.log(
    `JS ${result.counts.jsFiles} | CSS ${result.counts.cssFiles} | actions ${result.counts.dataActions} | declarative handlers ${result.counts.declarativeHandlers}`,
  );
  printList("Missing data-action handlers", result.missingActions);
  printList("Missing data-oninput/data-onchange handlers", result.missingInputHandlers);
  printList("JS files not loaded by index.html", result.jsNotInIndex);
  printList("CSS files not linked by index.html", result.cssNotLinked);
  printList("Index assets missing on disk", result.indexAssetsMissing);
  printList("Loaded assets not listed in service worker cache", result.loadedAssetsNotCached);
  printList("Service worker cached assets missing on disk", result.cachedAssetsMissing);
}
