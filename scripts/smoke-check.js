#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const fail = (message) => {
  console.error(`smoke-check: ${message}`);
  process.exitCode = 1;
};

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const unique = (values) => [...new Set(values)];

function walk(dir, out = []) {
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.isFile()) out.push(rel);
  });
  return out;
}

function checkJsSyntax() {
  const files = [
    ...walk("js"),
    ...walk("functions").filter((file) => file.endsWith(".js")),
    "sw.js",
  ];
  files.forEach((file) => {
    const result = spawnSync(process.execPath, ["--check", file], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      fail(`${file} failed node --check\n${result.stderr || result.stdout}`);
    }
  });
  console.log(`syntax ok (${files.length} files)`);
}

function checkServiceWorkerAssets() {
  const sw = read("sw.js");
  const assetsMatch = sw.match(/const LOCAL_ASSETS = \[([\s\S]*?)\];/);
  if (!assetsMatch) {
    fail("LOCAL_ASSETS array not found in sw.js");
    return;
  }
  const assets = [...assetsMatch[1].matchAll(/"(\.\/[^"]+)"/g)]
    .map((match) => match[1].replace(/^\.\//, ""))
    .filter(Boolean);
  const duplicateAssets = assets.filter(
    (asset, index) => assets.indexOf(asset) !== index,
  );
  if (duplicateAssets.length) {
    fail(`duplicate LOCAL_ASSETS entries: ${unique(duplicateAssets).join(", ")}`);
  }
  if (!assets.includes("offline.html")) {
    fail("offline.html is not pre-cached for navigation fallback");
  }
  const missing = assets.filter((asset) => asset !== "" && !fs.existsSync(path.join(root, asset)));
  if (missing.length) fail(`missing LOCAL_ASSETS entries: ${missing.join(", ")}`);

  const deployScript = read("scripts/deploy-cloudflare.sh");
  const deploySourceLine = deployScript.match(
    /rsync -a ([^\n]+) "\$tmpdir\/public\/"/,
  )?.[1] || "";
  const deploySources = deploySourceLine.split(/\s+/).filter(Boolean);
  const missingFromDeploy = assets.filter((asset) => {
    if (!asset) return false;
    return !deploySources.some(
      (source) => asset === source || asset.startsWith(`${source}/`),
    );
  });
  if (missingFromDeploy.length) {
    fail(`LOCAL_ASSETS omitted from Cloudflare deploy: ${missingFromDeploy.join(", ")}`);
  }

  const html = read("index.html");
  const indexAssets = [
    ...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="((?:js|css)\/[^"]+)"/g),
  ].map((match) => match[1].split("?")[0]);
  const cachedCodeAssets = assets.filter((asset) => /^(?:js|css)\//.test(asset));
  const missingFromCache = indexAssets.filter((asset) => !cachedCodeAssets.includes(asset));
  const missingFromIndex = cachedCodeAssets.filter((asset) => !indexAssets.includes(asset));
  if (missingFromCache.length || missingFromIndex.length) {
    fail(
      `index/sw code asset mismatch; missing from cache: ${missingFromCache.join(", ") || "none"}; ` +
      `missing from index: ${missingFromIndex.join(", ") || "none"}`,
    );
  }
  console.log(`service worker assets ok (${assets.length} entries)`);
}

function checkIndexReferences() {
  const html = read("index.html");
  const refs = [
    ...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g),
  ].map((match) => match[1])
    .filter((ref) => !ref.startsWith("http") && !ref.startsWith("data:"))
    .map((ref) => ref.split("?")[0]);
  const missing = refs.filter((ref) => !fs.existsSync(path.join(root, ref)));
  if (missing.length) fail(`missing index references: ${missing.join(", ")}`);

  const scripts = [...html.matchAll(/<script\b[^>]+src="([^"]+)"/g)]
    .map((match) => match[1].split("?")[0]);
  const duplicates = scripts.filter((script, index) => scripts.indexOf(script) !== index);
  if (duplicates.length) fail(`duplicate script tags: ${[...new Set(duplicates)].join(", ")}`);
  console.log(`index references ok (${refs.length} assets)`);
}

function checkCssGuardrails() {
  const files = walk("css").filter((file) => file.endsWith(".css"));
  files.forEach((file) => {
    const source = read(file);
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0;
    let minDepth = 0;
    for (const ch of withoutComments) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      minDepth = Math.min(minDepth, depth);
    }
    if (depth !== 0 || minDepth < 0) {
      fail(`${file} has unbalanced CSS braces`);
    }
    if (/letter-spacing:\s*-\d/i.test(source)) {
      fail(`${file} uses negative letter spacing`);
    }
    if (/font-size:\s*(?:clamp\(|[^;]*vw)/i.test(source)) {
      fail(`${file} scales font size with viewport width`);
    }
  });
  console.log(`css guardrails ok (${files.length} files)`);
}

function attrValue(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=(["'])(.*?)\\1`, "i"));
  return match ? match[2].trim() : "";
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function checkAccessibilityBasics() {
  ["index.html", "offline.html"].forEach((file) => {
    const html = read(file);
    if (/\son[a-z]+=/i.test(html)) {
      fail(`inline event handler attributes found in ${file}`);
    }

    const ids = [...html.matchAll(/\sid=(["'])(.*?)\1/g)].map((match) => match[2]);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length) {
      fail(`duplicate ids in ${file}: ${[...new Set(duplicateIds)].join(", ")}`);
    }

    const unnamedButtons = [];
    [...html.matchAll(/<button\b([\s\S]*?)>([\s\S]*?)<\/button>/gi)].forEach((match) => {
      const tag = `<button${match[1]}>`;
      const name =
        stripTags(match[2]) ||
        attrValue(tag, "aria-label") ||
        attrValue(tag, "title");
      if (!name) unnamedButtons.push(tag.replace(/\s+/g, " ").slice(0, 120));
    });
    if (unnamedButtons.length) {
      fail(`${file} buttons without accessible names: ${unnamedButtons.join(" | ")}`);
    }

    const imagesWithoutAlt = [...html.matchAll(/<img\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => !/\salt=(["']).*?\1/i.test(tag));
    if (imagesWithoutAlt.length) {
      fail(
        `${file} images without alt text: ` +
        imagesWithoutAlt.map((tag) => tag.slice(0, 120)).join(" | "),
      );
    }
  });

  console.log("accessibility basics ok");
}

function collectGlobalCallables() {
  const callables = new Set();
  walk("js")
    .filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"))
    .forEach((file) => {
      const source = read(file);
      [...source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)]
        .forEach((match) => callables.add(match[1]));
      [...source.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)]
        .forEach((match) => callables.add(match[1]));
    });
  return callables;
}

function checkDeclarativeHandlers() {
  const callables = collectGlobalCallables();
  const sourceFiles = [
    ...walk("js").filter(
      (file) => file.endsWith(".js") && !file.endsWith(".min.js"),
    ),
    "index.html",
  ];
  const handledActions = new Set();
  sourceFiles.forEach((file) => {
    const source = read(file);
    [...source.matchAll(/case\s+["']([^"']+)["']/g)]
      .forEach((match) => handledActions.add(match[1]));
    [...source.matchAll(/action\s*===\s*["']([^"']+)["']/g)]
      .forEach((match) => handledActions.add(match[1]));
    [...source.matchAll(/closest\(\s*["']\[data-action=["']([^"']+)["']\]["']\s*\)/g)]
      .forEach((match) => handledActions.add(match[1]));
  });
  const missing = [];
  const handlerPattern =
    /\bdata-(onchange|oninput)=(["'])((?:[A-Za-z_$][\w$]*)(?:\s*;\s*[A-Za-z_$][\w$]*)*)\2/g;
  const actionPattern = /\bdata-action=(["'])([A-Za-z_$][\w$]*)\1/g;

  sourceFiles.forEach((file) => {
    const source = read(file);
    [...source.matchAll(handlerPattern)].forEach((match) => {
      match[3].split(";").map((name) => name.trim()).forEach((name) => {
        if (!callables.has(name)) missing.push(`${file}: data-${match[1]}="${name}"`);
      });
    });

    [...source.matchAll(actionPattern)].forEach((match) => {
      const action = match[2];
      if (action === "fnName") return;
      const overlayAction = action.endsWith("Overlay")
        ? action.slice(0, -"Overlay".length)
        : "";
      if (
        !callables.has(action) &&
        !handledActions.has(action) &&
        !(overlayAction && callables.has(overlayAction))
      ) {
        missing.push(`${file}: data-action="${action}"`);
      }
    });
  });

  const combinedSource = sourceFiles.map((file) => read(file)).join("\n");
  ["dblaction", "drag", "drop"].forEach((attribute) => {
    const values = new Set();
    const valuePattern = new RegExp(
      `\\bdata-${attribute}=(["'])([A-Za-z_$][\\w$-]*)\\1`,
      "g",
    );
    sourceFiles.forEach((file) => {
      [...read(file).matchAll(valuePattern)]
        .forEach((match) => values.add(match[2]));
    });

    const handled = new Set();
    const datasetPattern = new RegExp(
      `dataset\\.${attribute}\\s*(?:===|!==)\\s*["']([^"']+)["']`,
      "g",
    );
    const selectorPattern = new RegExp(
      `\\[data-${attribute}=["']([^"']+)["']\\]`,
      "g",
    );
    [...combinedSource.matchAll(datasetPattern)]
      .forEach((match) => handled.add(match[1]));
    [...combinedSource.matchAll(selectorPattern)]
      .forEach((match) => handled.add(match[1]));
    if (attribute === "dblaction") {
      handledActions.forEach((action) => handled.add(action));
    }

    [...values].forEach((value) => {
      if (!handled.has(value)) {
        missing.push(`data-${attribute}="${value}" has no delegated handler`);
      }
    });
  });

  if (missing.length) {
    fail(`declarative handlers missing global dispatch targets: ${unique(missing).join(" | ")}`);
  }
  console.log("declarative handlers ok");
}

function checkStorageKeyUsage() {
  const violations = [];
  walk("js")
    .filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"))
    .forEach((file) => {
      const source = read(file);
      [...source.matchAll(/storageManager\.(?:get|set|remove)\(\s*(["'])([^"']+)\1/g)]
        .forEach((match) => {
          const line = source.slice(0, match.index).split("\n").length;
          violations.push(`${file}:${line} (${match[2]})`);
        });
    });
  if (violations.length) {
    fail(`literal storageManager keys bypass STORAGE_KEYS: ${violations.join(", ")}`);
  }

  const cloudSync = read("js/cloud-sync.js");
  if (!cloudSync.includes("STORAGE_KEYS.GAME_PLAN_SNAPSHOTS")) {
    fail("cloud sync omits saved game plan snapshots");
  }
  console.log("storage key usage ok");
}

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  if (start < 0) return "";
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) return "";
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function checkMigrationRetry() {
  const source = extractFunctionSource(read("js/storage.js"), "runMigrations");
  if (!source) {
    fail("runMigrations function not found");
    return;
  }

  const values = new Map([["_storageVersion", "0"]]);
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  let shouldFail = true;
  const migrations = {
    2: () => {
      if (shouldFail) throw new Error("expected migration failure");
    },
  };
  const build = new Function(
    "localStorage",
    "MIGRATIONS",
    "STORAGE_VERSION",
    `${source}; return runMigrations;`,
  );
  const run = build(localStorage, migrations, 3);
  const originalConsoleError = console.error;
  console.error = () => {};
  const failed = run();
  console.error = originalConsoleError;
  if (failed !== false || values.get("_storageVersion") !== "1") {
    fail("failed migrations advance the stored schema version");
    return;
  }

  shouldFail = false;
  const retried = run();
  if (retried !== true || values.get("_storageVersion") !== "3") {
    fail("failed migrations are not retried from the last successful version");
    return;
  }
  console.log("migration retry behavior ok");
}

function checkSafeUiRendering() {
  const utils = read("js/utils.js");
  if (/toast\.innerHTML\s*=\s*message/.test(utils)) {
    fail("showToast renders caller messages as raw HTML");
  }
  const formatter = utils.match(
    /function formatModalMessage\([^)]*\)\s*\{([\s\S]*?)\n\}/,
  )?.[1] || "";
  if (!/sanitizeHTML\(/.test(formatter)) {
    fail("modal message rendering does not sanitize rich text");
  }
  console.log("shared UI rendering safety ok");
}

function checkHistoryContracts() {
  const scriptStorage = read("js/script-storage.js");
  const callsheet = read("js/callsheet.js");
  if (/debouncedSaveScriptState/.test(scriptStorage + read("js/script-render.js"))) {
    fail("script edits still save history after mutation through debouncedSaveScriptState");
  }
  if (!/historyManager\.saveState\("callsheet",\s*callSheetHistoryBaseline\)/.test(callsheet)) {
    fail("call sheet history does not preserve the pre-mutation baseline");
  }
  console.log("history contracts ok");
}

function checkConflictContracts() {
  const utils = read("js/utils.js");
  const scriptRender = read("js/script-render.js");
  const scriptVision = read("js/script-vision.js");
  const callSheet = read("js/callsheet.js");
  const callSheetDrawer = read("js/callsheet-gameplan-drawer.js");
  const gameplan = read("js/gameplan.js");
  const dashboard = read("js/dashboard.js");
  const tendencies = read("js/tendencies.js");
  const printStudio = read("js/print-studio.js");
  const storage = read("js/storage.js");
  const appEvents = read("js/app-events.js");
  const gameplanActions = read("js/gameplan-actions.js");
  const playbookActions = read("js/playbook-actions.js");
  const constraints = read("js/constraints.js");

  if (
    /window\.script\b/.test(scriptVision) ||
    /window\.renderScript\s*=/.test(scriptVision)
  ) {
    fail("script vision reads lexical state through window or replaces renderScript");
  }
  if (!/renderScriptVisionPanel\(\)/.test(scriptRender)) {
    fail("script rendering does not explicitly refresh the Vision panel");
  }
  if (
    /window\.renderCallSheet\s*=/.test(callSheetDrawer) ||
    !/refreshCallSheetGamePlanDrawer\(\)/.test(callSheet)
  ) {
    fail("call sheet drawer still replaces the shared render function");
  }
  if (
    !/addEventListener\("dragend"[\s\S]*?_pbSortDragEnd\(e\)/.test(
      appEvents,
    )
  ) {
    fail("playbook print sorting does not clean up canceled drags");
  }
  if (
    /function (?:addGamePlanCustomBox|renameGamePlanBox)\(/.test(
      gameplanActions,
    ) ||
    /function startInlineEdit\(/.test(playbookActions) ||
    /function _renderTouchDistribution\(/.test(constraints) ||
    /function saveTemplate\(/.test(callSheet)
  ) {
    fail("superseded call sheet, game plan, playbook, or constraint handlers remain");
  }

  const splitCoverageSource = extractFunctionSource(
    utils,
    "splitCoverageValues",
  );
  if (!splitCoverageSource) {
    fail("shared coverage splitting helper is missing");
  } else {
    const splitCoverageValues = new Function(
      `${splitCoverageSource}; return splitCoverageValues;`,
    )();
    const values = splitCoverageValues("Cov 0/1, Tampa 2");
    if (
      !values.includes("cover 0") ||
      !values.includes("cover 1") ||
      !values.includes("tampa 2")
    ) {
      fail("combined coverage labels do not expand consistently");
    }
  }
  if (
    !/splitCoverageValues\(play\.practiceCoverage\)/.test(callSheet) ||
    !/splitCoverageValues\(play\.practiceCoverage\)/.test(gameplan)
  ) {
    fail("game plan and call sheet do not share coverage splitting");
  }

  const resolveSource = extractFunctionSource(
    utils,
    "resolveGameWeekOpponent",
  );
  if (!resolveSource) {
    fail("game-week opponent resolver is missing");
  } else {
    const resolveGameWeekOpponent = new Function(
      `${resolveSource}; return resolveGameWeekOpponent;`,
    )();
    const opponents = [{ name: "Alpha" }, { name: "Bravo" }];
    const resolved = resolveGameWeekOpponent(opponents, {
      opponentName: "Bravo",
      opponentIndex: 0,
    });
    if (resolved.index !== 1 || resolved.opponent !== opponents[1]) {
      fail("game-week resolution trusts a stale opponent index over its name");
    }
  }
  if (
    !/ensureTendenciesOpponent\(game\.opponent\)/.test(dashboard) ||
    !/function ensureTendenciesOpponent\(/.test(tendencies) ||
    !/function ensureTendenciesOpponent\([\s\S]*?STORAGE_KEYS\.DEFENSIVE_TENDENCIES/.test(
      tendencies,
    ) ||
    !/resolveGameWeekOpponent\(tendenciesOpponents, gw\)/.test(printStudio)
  ) {
    fail("opponent creation or consumers bypass the shared live-state resolver");
  }
  if (
    !/normalizeCallSheetSettings\(css\)/.test(storage) ||
    !/rebuildCallSheetCategoryRegistry\(\)/.test(storage) ||
    !/normalizeCallSheetCategoryOrder\(/.test(storage)
  ) {
    fail("storage reload does not rebuild normalized call sheet runtime state");
  }

  console.log("cross-module conflict contracts ok");
}

function checkWristbandTypography() {
  const css = read("css/wristband.css");
  const printCss = read("css/print.css");
  const responsiveCss = read("css/responsive.css");
  const cellPlay = css.match(
    /\.wristband-cell \.cell-play\s*\{([\s\S]*?)\n\}/,
  )?.[1] || "";
  if (!/font-weight:\s*500/.test(cellPlay)) {
    fail("wristband play calls still use blanket bold typography");
  }
  if (!/font-size:\s*var\(--font-size-xs\)/.test(cellPlay)) {
    fail("wristband play calls do not use the larger readable screen size");
  }
  if (!/\.wristband-play-name\s*\{[\s\S]*?font-weight:\s*600/.test(css)) {
    fail("wristband play names do not have restrained semantic emphasis");
  }
  if (!/\.wristband-print \.wristband-cell[\s\S]*?font-family:\s*var\(--font-sans\)/.test(printCss)) {
    fail("printed wristbands do not use the readable sans-serif font");
  }
  if (
    /\.wristband-cell \.cell-play\s*\{[\s\S]*?font-size:\s*var\(--font-size-3xs\)/.test(
      responsiveCss,
    )
  ) {
    fail("responsive wristband styles shrink play calls below the readable size");
  }
  console.log("wristband typography ok");
}

function checkPlayPresentationContracts() {
  const html = read("index.html");
  const presenter = read("js/play-presentation.js");
  const playImages = read("js/play-images.js");
  const playbookRender = read("js/playbook-render.js");
  const playbookEditor = read("js/playbook-editor.js");
  const scriptRender = read("js/script-render.js");
  const scriptAdd = read("js/script-add.js");
  const scriptExport = read("js/script-export.js");
  const gameplanPrint = read("js/gameplan-print.js");
  const appEvents = read("js/app-events.js");
  const auth = read("js/auth.js");
  const css = read("css/play-presentation.css");
  const sw = read("sw.js");

  if (
    !/id="playPresentationOverlay"/.test(html) ||
    !/data-presentation-mode="minimum"/.test(html) ||
    !/data-presentation-mode="player"/.test(html) ||
    !/data-presentation-mode="coaches"/.test(html) ||
    !/data-action="openSelectedPlaybookPresentation"/.test(html) ||
    !/data-action="openScriptPresentation"/.test(html)
  ) {
    fail("shared play presentation shell or launch controls are incomplete");
  }
  if (
    !/function getPlayPresentationItemsFromPlaybook\(/.test(presenter) ||
    !/function getPlayPresentationItemsFromScript\(/.test(presenter) ||
    !/function openPlaybookPresentation\(/.test(presenter) ||
    !/function openScriptPresentation\(/.test(presenter) ||
    !/function renderPlayPresentation\(/.test(presenter)
  ) {
    fail("play presentation source adapters or shared renderer are incomplete");
  }
  if (
    /window\.script\b/.test(presenter) ||
    !/await window\.ensurePlayImageUrl\(play\)/.test(presenter) ||
    !/function getPlayPresentationContentBounds\(image\)/.test(presenter) ||
    !/function getPlayPresentationAspectCrop\(/.test(presenter) ||
    !/PLAY_PRESENTATION_MAX_RENDER_PIXELS/.test(presenter) ||
    !/context\.imageSmoothingQuality = "high"/.test(presenter) ||
    !/new ResizeObserver\(/.test(presenter) ||
    !/canvas\.dataset\.smartFit/.test(presenter) ||
    !/requestFullscreen/.test(presenter) ||
    !/screen\.orientation\.lock\("landscape"\)/.test(presenter) ||
    !/function syncPlayPresentationMobileLandscape\(/.test(presenter) ||
    !/function handlePlayPresentationTouchStart\(/.test(presenter) ||
    !/function handlePlayPresentationTouchEnd\(/.test(presenter) ||
    !/PLAY_PRESENTATION_SWIPE_MIN_DISTANCE/.test(presenter) ||
    !/window\.visualViewport\?\.addEventListener\("resize", queuePlayPresentationViewportSync\)/.test(
      presenter,
    ) ||
    !/setInnerHTML\(body, markup\)/.test(presenter)
  ) {
    fail("play presentation image, landscape, safety, or lexical-state contracts are incomplete");
  }
  if (
    !/data-action="openPlaybookPresentation"/.test(playbookRender) ||
    !/data-action="openScriptPresentation"/.test(scriptRender) ||
    !/case "openScriptPresentation"/.test(appEvents) ||
    !/openPlaybookPresentation\(parseInt\(presentBtn\.dataset\.idx/.test(
      appEvents,
    )
  ) {
    fail("playbook or script presentation row actions are not delegated correctly");
  }
  [
    "openSelectedPlaybookPresentation",
    "openPlaybookPresentation",
    "openScriptPresentation",
    "setPlayPresentationMode",
    "setPlayPresentationPosition",
    "togglePlayPresentationPositionLock",
    "movePlayPresentation",
  ].forEach((action) => {
    if (!new RegExp(`["']${action}["']`).test(auth)) {
      fail(`read-only roles cannot use play presentation action ${action}`);
    }
  });
  if (
    !/function signaturesForPlay\(play\)/.test(playImages) ||
    !/play\.playbookId/.test(playImages) ||
    !/getPlayIdentityKey\(sourcePlay, "tag"\)/.test(playImages) ||
    !/async function ensureUrlForPlay\(play\)/.test(playImages) ||
    !/function storedSignatureForPlay\(play\)/.test(playImages) ||
    !/return ensureUrlForPlay\(play\)/.test(playImages) ||
    !/playbookId: play\.playbookId \|\| play\.sourcePlayId \|\| play\.id/.test(
      scriptAdd,
    ) ||
    !/window\.playImages\.storedSignatureForPlay\(play\)/.test(
      playbookRender,
    ) ||
    !/window\.deletePlayImage\(play\)/.test(playbookEditor) ||
    !/getPlayImageUrl\(item\)/.test(scriptExport) ||
    !/getPlayImageUrl\(play\)/.test(gameplanPrint)
  ) {
    fail("play image compatibility resolution is incomplete across presentation surfaces");
  }
  if (
    !/opts\.maxDim \|\| 2400/.test(playImages) ||
    !/file\.type === "image\/png"/.test(playImages) ||
    !/"image\/webp"/.test(playImages) ||
    !/ctx\.imageSmoothingQuality = "high"/.test(playImages) ||
    !/maxDim: 2400/.test(playbookEditor) ||
    !/quality: 0\.92/.test(playbookEditor) ||
    /900px JPEG/.test(playbookEditor)
  ) {
    fail("presentation-grade play image optimization contracts are incomplete");
  }
  if (
    !/positionLocked:\s*false/.test(presenter) ||
    !/function togglePlayPresentationPositionLock\(\)/.test(presenter) ||
    !/function syncPlayPresentationPlayerPosition\(item\)/.test(presenter) ||
    !/function getPreferredPlayPresentationPosition\(play\)/.test(presenter) ||
    !/function hydratePlayPresentationPlayerControls\(\)/.test(presenter) ||
    !/document\.createElement\("button"\)/.test(presenter) ||
    !/button\.dataset\.action = "setPlayPresentationPosition"/.test(
      presenter,
    ) ||
    !/lockButton\.dataset\.action = "togglePlayPresentationPositionLock"/.test(
      presenter,
    ) ||
    !/event\.key\.toLowerCase\(\) === "l"/.test(presenter) ||
    !/\.pp-position-lock-btn/.test(css) ||
    !/["']togglePlayPresentationPositionLock["']/.test(auth)
  ) {
    fail("player presentation position-lock contracts are incomplete");
  }
  if (
    !/function getPlayPresentationCoachSection\(title, subtitle, rows, className\)/.test(
      presenter,
    ) ||
    !/function getPlayPresentationCoachNotesMarkup\(play\)/.test(presenter) ||
    !/pp-coach-section-call/.test(presenter) ||
    !/pp-coach-section-situation/.test(presenter) ||
    !/pp-coach-section-defense/.test(presenter) ||
    !/pp-coach-section-tools/.test(presenter) ||
    !/pp-coach-section-rules/.test(presenter) ||
    !/pp-coach-note-list/.test(presenter) ||
    !/\.pp-coach-section\b/.test(css) ||
    !/\.pp-coach-section-head/.test(css) ||
    !/\.pp-coach-note-card/.test(css)
  ) {
    fail("coach presentation sections are not separated into digestible panels");
  }
  if (
    !/function getAllowedPlayPresentationModes\(\)/.test(presenter) ||
    !/function syncPlayPresentationRoleUi\(\)/.test(presenter) ||
    !/1 Minimum · 2 Plays/.test(presenter) ||
    !/data-presentation-mode="coaches"[^>]*data-auth-player-hide="true"/.test(
      html,
    ) ||
    !/id="playPresentationFooterHint"/.test(html)
  ) {
    fail("player presentation role limits are incomplete");
  }
  if (
    !/\.play-presentation-overlay:fullscreen/.test(css) ||
    !/body\.play-presentation-force-landscape/.test(css) ||
    !/\.play-presentation-overlay\.pp-force-landscape/.test(css) ||
    !/@media \(orientation: portrait\)/.test(css) ||
    !/\.pp-layout-minimum\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/s.test(
      css,
    ) ||
    !/class="pp-minimum-top"/.test(presenter) ||
    !/class="pp-diagram-panel pp-minimum-diagram"/.test(presenter) ||
    !/class="pp-minimum-bottom"/.test(presenter) ||
    !/\.pp-layout-player/.test(css) ||
    !/\.pp-layout-coaches/.test(css)
  ) {
    fail("play presentation landscape and information-mode styling is incomplete");
  }
  if (
    !/"\.\/css\/play-presentation\.css"/.test(sw) ||
    !/"\.\/js\/play-presentation\.js"/.test(sw)
  ) {
    fail("play presentation assets are missing from the service worker");
  }

  console.log("play presentation contracts ok");
}

function checkScriptPlayerPublishingContracts() {
  const html = read("index.html");
  const scriptStorage = read("js/script-storage.js");
  const scriptRender = read("js/script-render.js");
  const scriptDisplay = read("js/script-display-options.js");
  const appEvents = read("js/app-events.js");
  const auth = read("js/auth.js");
  const css = read("css/script.css");

  if (
    !/playerVisible:\s*false/.test(scriptStorage) ||
    !/function renderPlayerScriptLauncher\(\)/.test(scriptStorage) ||
    !/function renderPlayerLoadedScriptBar\(\)/.test(scriptStorage) ||
    !/function loadPublishedPlayerScript\(id,\s*opts = \{\}\)/.test(
      scriptStorage,
    ) ||
    !/function presentPublishedPlayerScript\(id\)/.test(scriptStorage) ||
    !/function togglePlayerScriptAccess\(id,\s*event\)/.test(scriptStorage) ||
    !/data-onchange="togglePlayerScriptAccess"/.test(scriptStorage) ||
    !/data-action="loadPublishedPlayerScript"/.test(scriptStorage) ||
    !/data-action="presentPublishedPlayerScript"/.test(scriptStorage) ||
    !/case "loadPublishedPlayerScript"/.test(appEvents) ||
    !/case "presentPublishedPlayerScript"/.test(appEvents)
  ) {
    fail("player script publishing runtime is incomplete");
  }
  if (
    !/id="playerScriptLauncherSection"/.test(html) ||
    !/id="playerScriptLauncherList"/.test(html) ||
    !/id="playerScriptNowBar"/.test(html) ||
    !/class="play-list" data-auth-player-hide="true"/.test(html) ||
    !/id="mobileScriptCoachNow"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/id="savedScriptsSection"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/Open Swipe View/.test(html)
  ) {
    fail("player script launcher markup is incomplete");
  }
  if (
    !/currentUser\?\.role !== "player"/.test(scriptDisplay) ||
    !/hidePersonnel:\s*true/.test(scriptDisplay) ||
    !/layoutMode:\s*"detail"/.test(scriptDisplay) ||
    !/function renderPlayerScriptPeriodHeader\(/.test(scriptRender) ||
    !/script-item--player/.test(scriptRender) ||
    !/Open Rules/.test(scriptRender) ||
    !/renderPlayerLoadedScriptBar\(\)/.test(scriptRender) ||
    !/typeof getCurrentAuthUser === "function"[\s\S]*getCurrentAuthUser\(\)\?\.role === "player"[\s\S]*return;/.test(
      appEvents,
    )
  ) {
    fail("player script role rendering is incomplete");
  }
  [
    "loadPublishedPlayerScript",
    "presentPublishedPlayerScript",
  ].forEach((action) => {
    if (!new RegExp(`["']${action}["']`).test(auth)) {
      fail(`read-only roles cannot use player script action ${action}`);
    }
  });
  if (
    !/\.player-script-launcher/.test(css) ||
    !/\.player-script-now/.test(css) ||
    !/\.script-item--player/.test(css) ||
    !/\.period-header--player/.test(css) ||
    !/body\[data-auth-role="player"\] \.script-builder/.test(css) ||
    !/\.saved-player-toggle/.test(css)
  ) {
    fail("player script launcher styles are incomplete");
  }

  console.log("player script publishing contracts ok");
}

function checkPlayerPortalContracts() {
  const html = read("index.html");
  const auth = read("js/auth.js");
  const dashboard = read("js/dashboard.js");
  const componentsCss = read("css/components.css");
  const layoutCss = read("css/layout.css");
  const responsiveCss = read("css/responsive.css");
  const dashboardCss = read("css/dashboard.css");
  const presentation = read("js/play-presentation.js");
  const presentationCss = read("css/play-presentation.css");

  if (
    !/player:\s*\["dashboard",\s*"playbook",\s*"script"\]/.test(auth) ||
    !/player:\s*"dashboard"/.test(auth) ||
    !/function syncPlayerPortalChrome\(\)/.test(auth) ||
    !/auth-login-shell/.test(auth) ||
    !/authPasswordToggle/.test(auth)
  ) {
    fail("player auth shell or tab permissions are incomplete");
  }
  if (
    !/data-player-label="Playbook"/.test(html) ||
    !/data-player-label="Practice"/.test(html) ||
    !/data-player-label="Home"/.test(html) ||
    !/id="playerPlaybookSummary"/.test(html) ||
    !/id="playerDashboardHome"/.test(html) ||
    !/id="commandPaletteBtn"[^>]*data-auth-player-hide="true"/.test(html) ||
    !/id="quickTools"[^>]*data-auth-player-hide="true"/.test(html)
  ) {
    fail("player portal markup is incomplete");
  }
  if (
    !/function renderPlayerDashboardHome\(\)/.test(dashboard) ||
    !/Player Portal/.test(dashboard) ||
    !/loadPublishedPlayerScript/.test(dashboard) ||
    !/presentPublishedPlayerScript/.test(dashboard) ||
    !/Open Playbook/.test(dashboard)
  ) {
    fail("player dashboard home is incomplete");
  }
  if (
    !/\.auth-login-shell/.test(componentsCss) ||
    !/\.auth-login-hero/.test(componentsCss) ||
    !/body\[data-auth-role="player"\] \.auth-user-badge/.test(componentsCss) ||
    !/body\[data-auth-role="player"\] \.tabs/.test(layoutCss) ||
    !/body\.is-mobile-screen\[data-auth-role="player"\] \.tabs/.test(
      responsiveCss,
    ) ||
    !/body\[data-auth-role="player"\] #playbook\.panel/.test(layoutCss) ||
    !/\.player-home-hero/.test(dashboardCss) ||
    !/\.player-home-grid/.test(dashboardCss) ||
    !/\.pb-player-summary/.test(read("css/playbook.css"))
  ) {
    fail("player portal styling is incomplete");
  }
  if (
    !/pp-player-overview/.test(presentation) ||
    !/pp-player-controls-card/.test(presentation) ||
    !/\.pp-player-overview/.test(presentationCss) ||
    !/\.pp-player-controls-card/.test(presentationCss)
  ) {
    fail("player presentation polish is incomplete");
  }

  console.log("player portal contracts ok");
}

function checkWristbandWorkspaceContracts() {
  const html = read("index.html");
  const wristband = read("js/wristband.js");
  const library = read("js/wristband-library.js");
  const render = read("js/wristband-render.js");
  const actions = read("js/wristband-cell-actions.js");
  const runtime = read("js/wristband-runtime.js");
  const storage = read("js/wristband-storage.js");
  const playerRuntime = read("js/wristband-export.js");
  const css = read("css/wristband.css");
  const printCss = read("css/print.css");
  const responsiveCss = read("css/responsive.css");
  const appStorage = read("js/storage.js");
  const cloudSync = read("js/cloud-sync.js");

  if (
    !/class="wb-page-header"/.test(html) ||
    !/id="wbLibraryStatus"/.test(html) ||
    !/class="wb-appearance-panel"/.test(html) ||
    !/data-oninput="scheduleWristbandPlayFilter"/.test(html) ||
    !/data-wb-mobile-view="library"/.test(html) ||
    !/id="wbLoadMore"/.test(html) ||
    !/id="wbActiveSaveTitle"/.test(html) ||
    !/id="wbCardViewport"/.test(html) ||
    !/id="wbSavedManagerOverlay"/.test(html) ||
    !/id="wbPrintPreviewOverlay"/.test(html) ||
    !/id="wbLogoCardOverlay"/.test(html) ||
    !/data-action="openWbLogoCardModal"/.test(html)
  ) {
    fail("wristband workspace hierarchy or progressive controls are incomplete");
  }
  if (
    !/const favoriteSet = new Set\(wbFavorites\)/.test(library) ||
    !/\.map\(\(play, index\) => \(\{ play, index \}\)\)/.test(library) ||
    !/data-action="addPlayToNextEmpty"/.test(library) ||
    !/function getWristbandPlayUsageMap\(/.test(library) ||
    !/function loadMoreWristbandPlays\(/.test(library) ||
    !/wbPreventDuplicates && isDuplicate/.test(library) ||
    !/WRISTBAND_RECENT_PLAYS/.test(wristband)
  ) {
    fail("wristband play library pagination, recent plays, or duplicate protection is incomplete");
  }
  if (
    !/function finalizeWristbandGridRender\(/.test(render) ||
    !/finalizeWristbandGridRender\(grid, cardData, CELLS_PER_CARD\)/.test(render) ||
    !/finalizeWristbandGridRender\(grid, card\.data, WB_ROWS\)/.test(playerRuntime) ||
    !/role="gridcell" tabindex="0"/.test(render) ||
    !/e\.key === "ArrowDown"/.test(runtime) ||
    !/e\.key === "Delete"/.test(runtime)
  ) {
    fail("wristband shared rendering or keyboard navigation is incomplete");
  }
  if (
    !/function toggleWbSelectionMode\(/.test(actions) ||
    !/function moveSelectedWbCellsToCard\(/.test(actions) ||
    !/function clearSelectedWbCells\(/.test(actions) ||
    !/function setWristbandZoom\(/.test(render) ||
    !/function toggleWristbandFullscreen\(/.test(render)
  ) {
    fail("wristband selection mode, batch movement, or zoom controls are incomplete");
  }
  if (
    !/function updateWristbandSaveChrome\(/.test(storage) ||
    !/function saveWristbandAs\(/.test(storage) ||
    !/function openSavedWristbandManager\(/.test(storage) ||
    !/function duplicateSavedWristband\(/.test(storage) ||
    !/activeSaveId:\s*activeWristbandSaveId/.test(wristband)
  ) {
    fail("wristband active-save workflow or saved manager is incomplete");
  }
  if (
    !/function openWristbandPrintPreview\(/.test(playerRuntime) ||
    !/function executeWristbandPrintPreview\(/.test(playerRuntime) ||
    !/function _getWbDefaultPrintCardIndexes\(/.test(playerRuntime) ||
    !/function _getWbPrintScriptPageMeta\(/.test(playerRuntime) ||
    !/const WRISTBAND_PRINT_PROFILES = Object\.freeze/.test(playerRuntime) ||
    !/flag:\s*Object\.freeze\(\{[\s\S]*?width:\s*"4\.4in"[\s\S]*?height:\s*"2\.1in"[\s\S]*?cardsPerSheet:\s*4/.test(
      playerRuntime,
    ) ||
    !/function _getSelectedWbPrintProfile\(/.test(playerRuntime) ||
    !/function openWbLogoCardModal\(/.test(playerRuntime) ||
    !/function handleWbLogoCardUpload\(/.test(playerRuntime) ||
    !/function setWbLogoSmartCenter\(/.test(playerRuntime) ||
    !/function _createWbSmartCenteredLogoDataUrl\(/.test(playerRuntime) ||
    !/function printWbLogoCardThree\(/.test(playerRuntime) ||
    !/STORAGE_KEYS\.WRISTBAND_LOGO_CARD/.test(playerRuntime) ||
    !/WRISTBAND_LOGO_CARD:\s*"wristbandLogoCard"/.test(appStorage) ||
    !/STORAGE_KEYS\.WRISTBAND_LOGO_CARD/.test(cloudSync) ||
    !/id="wbPrintCardLegend"/.test(html) ||
    !/id="wbPrintSizeMode"/.test(html) ||
    !/data-action="selectCurrentWbPrintCard"/.test(html) ||
    !/_executeClassicWristbandPrint\(cardIndexes, "one-per-page", printProfile\.id\)/.test(
      playerRuntime,
    ) ||
    !/_executePrintAllPlayerCards\(cardIndexes, positionKeys,\s*\{[\s\S]*?blankRules,[\s\S]*?printSize:\s*printProfile\.id/.test(
      playerRuntime,
    )
  ) {
    fail("wristband print preview or one-per-page execution is incomplete");
  }
  if (
    !/#wristband\.wb-mobile-view-builder \.wristband-plays/.test(css) ||
    !/#wristband\.wb-mobile-view-library \.wristband-preview/.test(css) ||
    !/\.wb-print-preview-layout/.test(css) ||
    !/\.wb-print-preview-modal\s*\{[\s\S]*?max-width:\s*min\(1120px/.test(css) ||
    !/\.wb-print-preview-canvas \.pc-print-card-wrap/.test(css) ||
    !/\.wb-print-preview-canvas\[data-wb-print-size="flag"\] \.pc-print-card-wrap/.test(css) ||
    !/body\[data-wb-print-size="flag"\] \.pc-print-card-wrap \.wristband-grid/.test(css) ||
    !/body\[data-wb-print-size="flag"\] \.wristband-print \.wristband-grid/.test(printCss) ||
    !/\.wb-logo-card-modal/.test(css) ||
    !/\.wb-logo-print-card/.test(css) ||
    !/\.wb-logo-print-card\.wb-logo-smart-centered img/.test(css) ||
    !/\.wb-logo-print-page \.wb-logo-print-card/.test(css)
  ) {
    fail("wristband mobile view or print preview styling is incomplete");
  }
  if (
    /\.wristband-(?:container|card|grid|cell)|\.wb-stats-bar/.test(responsiveCss)
  ) {
    fail("wristband responsive layout has leaked back into shared responsive.css");
  }

  console.log("wristband workspace contracts ok");
}

function checkPlayerWristbandRuleOverrides() {
  const wristband = read("js/wristband.js");
  const playerRuntime = read("js/wristband-export.js");
  const popup = read("js/wristband-cell-popup.js");
  const html = read("index.html");
  const css = read("css/wristband.css");

  if (
    !/playerRuleSources:\s*normalizePlayerRuleSources/.test(wristband) ||
    !/playerAssignmentOverrides:\s*normalizePlayerAssignmentOverrides/.test(
      wristband,
    ) ||
    !/getPlayerAssignmentText\(play,\s*custom,\s*posKey\)/.test(playerRuntime)
  ) {
    fail("player wristband rule overrides are not stored and printed through cell customizations");
  }
  if (
    !/class="pc-rule-select/.test(playerRuntime) ||
    !/delete custom\.playerRuleSources\[basePosition\]/.test(playerRuntime) ||
    !/delete custom\.playerAssignmentOverrides\[basePosition\]/.test(
      playerRuntime,
    )
  ) {
    fail("player wristband rule source selection or reset behavior is incomplete");
  }
  if (
    !/pendingPlayerRuleSources/.test(popup) ||
    !/pendingPlayerAssignmentOverrides/.test(popup)
  ) {
    fail("cell popup edits can discard player wristband rule overrides");
  }
  if (
    !/data-action="printOnePlayerCard"/.test(html) ||
    !/data-action="printThreePlayerCardCopies"/.test(html) ||
    !/id="wbBlankPlayerRules"/.test(html) ||
    !/id="pcBlankPlayerRules"/.test(html) ||
    !/id="wbPrintBlankRules"/.test(html) ||
    !/wbBlankPlayerRules/.test(wristband) ||
    !/handlePlayerBlankRulesChange/.test(wristband) ||
    !/blankPlayerRules/.test(read("js/wristband-render.js")) ||
    !/pc-print-page pc-print-single/.test(playerRuntime) ||
    !/_getWbPrintBlankRules/.test(playerRuntime) ||
    !/pc-assignment-blank/.test(playerRuntime) ||
    !/pc-print-assignment-blank/.test(playerRuntime) ||
    !/blankRules/.test(playerRuntime) ||
    !/\.pc-assignment-cell\.pc-assignment-blank/.test(css) ||
    !/\.pc-print-assignment-blank/.test(css) ||
    !/\.pc-print-single\s*\{[\s\S]*?justify-content:\s*center/.test(css)
  ) {
    fail("player wristband one-per-page and three-copy print modes are incomplete");
  }

  console.log("player wristband rule override and print contracts ok");
}

function checkSevenOnSevenTemplate() {
  const snapshots = read("js/gameplan-snapshots.js");
  const print = read("js/gameplan-print.js");
  const gameplan = read("js/gameplan.js");
  const smart = read("js/gameplan-smart.js");
  const callsheet = read("js/callsheet.js");
  const callsheetPicker = read("js/callsheet-picker-runtime.js");
  const css = read("css/gameplan.css");
  const boxes = snapshots.match(
    /const GP_SEVEN_ON_SEVEN_BOXES\s*=\s*\[([\s\S]*?)\n\];/,
  )?.[1] || "";
  const boxCount = [...boxes.matchAll(/\bid:\s*"7on7-/g)].length;
  if (boxCount !== 19) {
    fail(`7-on-7 template must define 19 tournament buckets; found ${boxCount}`);
  }
  [
    "1st Down",
    "3rd & Long",
    "Marco",
    "Skro Bros",
    "Cov 0/1 Beaters",
    "Man 2 Beaters",
    "Pass Plays on Wristband",
    "Two-Point Conversion",
  ].forEach((label) => {
    if (!boxes.includes(`label: "${label}"`)) {
      fail(`7-on-7 template is missing the ${label} bucket`);
    }
  });
  if (
    !snapshots.includes('wristbandAutoBoxId: "7on7-wristband-passes"') ||
    !/function _gpSyncLoadedWristbandBox\(/.test(gameplan)
  ) {
    fail("7-on-7 wristband passing-play auto-sync is incomplete");
  }
  if (
    !snapshots.includes('printPreset: "sevenOnSeven"') ||
    !snapshots.includes("allowedPlayTypes: [...GP_PASSING_PLAY_TYPES]")
  ) {
    fail("7-on-7 template is missing passing-only or print-preset metadata");
  }
  if (
    !/function _gpApplySevenOnSevenPrintDefaults\(/.test(print) ||
    !/onePage:\s*true/.test(print) ||
    !/columns:\s*4/.test(print) ||
    !/gp-print-one-page/.test(css)
  ) {
    fail("7-on-7 one-page print preset is incomplete");
  }
  if (
    !/const GP_COVERAGE_CHOICES/.test(gameplan) ||
    !/function _gpKeywordMatchesPlay\(/.test(gameplan) ||
    !/_gpPlayMatchesCriteria\(play, meta\.criteria\)/.test(smart)
  ) {
    fail("7-on-7 coverage, keyword, or smart-suggestion matching is incomplete");
  }
  if (
    !/function _gpGetBoardBoxes\(/.test(gameplan) ||
    !/_gpGetBoardBoxes\(board/.test(print)
  ) {
    fail("game plan print does not share screen box visibility/order rules");
  }
  if (!/if \(changed\) _gpSaveBoards\(all\)/.test(gameplan)) {
    fail("game plan reads still rewrite unchanged board storage");
  }

  const callSheetCategories = callsheet.match(
    /const CS_SEVEN_ON_SEVEN_CATEGORIES\s*=\s*\[([\s\S]*?)\n\];/,
  )?.[1] || "";
  const callSheetCategoryCount = [
    ...callSheetCategories.matchAll(/\bid:\s*"cs-7on7-/g),
  ].length;
  if (callSheetCategoryCount !== 19) {
    fail(
      `7-on-7 call sheet template must define 19 tournament buckets; found ${callSheetCategoryCount}`,
    );
  }
  [
    "Openers",
    "3rd & Long",
    "Marco",
    "Skro Bros",
    "Cov 0/1 Beaters",
    "Man 2 Beaters",
    "Pass Plays on Wristband",
    "Two-Point Conversion",
  ].forEach((label) => {
    if (!callSheetCategories.includes(`name: "${label}"`)) {
      fail(`7-on-7 call sheet template is missing the ${label} bucket`);
    }
  });
  if (
    !callsheet.includes(
      'wristbandAutoCategoryId: "cs-7on7-wristband-passes"',
    ) ||
    !/function syncLoadedWristbandToCallSheetCategory\(/.test(callsheetPicker)
  ) {
    fail("7-on-7 call sheet wristband passing-play auto-sync is incomplete");
  }
  if (
    !/hiddenCategoryIds:\s*\[[\s\S]*BASE_CALLSHEET_FRONT[\s\S]*BASE_CALLSHEET_BACK/.test(
      callsheet,
    ) ||
    !/allowedPlayTypes:\s*\[\.\.\.CS_PASSING_PLAY_TYPES\]/.test(callsheet)
  ) {
    fail("7-on-7 call sheet template does not isolate its passing-only categories");
  }
  if (
    !/function callSheetPlayMatchesCriteria\(/.test(callsheet) ||
    !/function callSheetCoverageMatches\(/.test(callsheet) ||
    !/function callSheetKeywordMatches\(/.test(callsheet)
  ) {
    fail("7-on-7 call sheet criteria matching is incomplete");
  }
  if (
    !/pages:\s*"front"/.test(callsheet) ||
    !/columns:\s*4/.test(callsheet) ||
    !/data-action="loadBuiltInCallSheetTemplate"/.test(callsheet) ||
    !callsheet.includes('id: "builtin-standard-callsheet"')
  ) {
    fail("7-on-7 call sheet template is missing print, reset, or template-library integration");
  }
  console.log("7-on-7 game plan and call sheet contracts ok");
}

function checkCacheBusters() {
  const html = read("index.html");
  const refs = [
    ...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+\.(?:js|css)(?:\?v=(\d+))?)"/g),
  ];
  const unversioned = refs.filter((match) => !match[2]).map((match) => match[1]);
  if (unversioned.length) {
    fail(`index.html has unversioned code assets: ${unversioned.join(", ")}`);
  }

  const stamps = refs.map((match) => match[2]).filter(Boolean);
  const versions = unique(stamps);
  if (versions.length !== 1) {
    fail(`index.html has inconsistent asset cache busters: ${versions.join(", ")}`);
  }

  const sw = read("sw.js");
  const swVersion = sw.match(/const CACHE_NAME = "bcoffense-v(\d+)"/)?.[1];
  if (!swVersion) {
    fail("service worker cache version not found");
  } else if (versions[0] !== swVersion) {
    fail(`asset cache buster v${versions[0] || "unknown"} does not match SW v${swVersion}`);
  }
  console.log(`cache busters ok (v${versions[0] || "unknown"})`);
}

function checkServiceWorkerLifecycle() {
  const html = read("index.html");
  const sw = read("sw.js");
  const registrationBlock = html.match(
    /<!-- Service Worker Registration -->([\s\S]*?)<\/script>/,
  )?.[1] || "";
  const installBlock = sw.match(
    /self\.addEventListener\("install"[\s\S]*?\n\}\);/,
  )?.[0] || "";

  if (/postMessage\(\s*["']skipWaiting["']/.test(registrationBlock)) {
    fail("service worker registration automatically activates waiting updates");
  }
  if (/controllerchange[\s\S]*?location\.reload/.test(registrationBlock)) {
    fail("service worker controller changes force a page reload");
  }
  if (/skipWaiting\(\)/.test(installBlock)) {
    fail("service worker install forces takeover of active app tabs");
  }
  if (!/function isCacheableResponse\(/.test(sw)) {
    fail("service worker does not guard cache writes by response status/policy");
  }
  if (/return undefined;/.test(sw)) {
    fail("service worker fetch fallback can resolve without a Response");
  }

  console.log("service worker lifecycle preserves active work");
}

function checkServiceWorkerCachePolicy() {
  const source = extractFunctionSource(read("sw.js"), "isCacheableResponse");
  if (!source) {
    fail("isCacheableResponse function not found");
    return;
  }

  const isCacheable = new Function(
    `${source}; return isCacheableResponse;`,
  )();
  const response = (ok, cacheControl = "", type = "basic") => ({
    ok,
    type,
    headers: {
      get: (name) =>
        name.toLowerCase() === "cache-control" ? cacheControl : null,
    },
  });

  if (!isCacheable(response(true))) {
    fail("service worker rejects successful cacheable responses");
  }
  if (isCacheable(response(false))) {
    fail("service worker caches unsuccessful responses");
  }
  if (isCacheable(response(true, "private, no-store"))) {
    fail("service worker caches no-store responses");
  }
  if (!isCacheable(response(false, "", "opaque"), true)) {
    fail("service worker rejects allowed opaque external responses");
  }
  if (isCacheable(response(false, "", "opaque"))) {
    fail("service worker caches opaque responses without explicit permission");
  }

  console.log("service worker cache policy ok");
}

function checkTopLevelSymbolOwnership() {
  const locations = new Map();
  walk("js")
    .filter((file) => file.endsWith(".js") && !file.endsWith(".min.js"))
    .forEach((file) => {
      const source = read(file);
      const declarations = [
        ...source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm),
        ...source.matchAll(/^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)\b/gm),
      ];
      declarations.forEach((match) => {
        const line = source.slice(0, match.index).split("\n").length;
        const entries = locations.get(match[1]) || [];
        entries.push({ file, location: `${file}:${line}` });
        locations.set(match[1], entries);
      });
    });

  const duplicates = [...locations.entries()].filter(
    ([, entries]) => unique(entries.map((entry) => entry.file)).length > 1,
  );
  if (duplicates.length) {
    fail(
      `duplicate cross-file top-level symbols: ${duplicates
        .map(([name, entries]) =>
          `${name} (${entries.map((entry) => entry.location).join(", ")})`,
        )
        .join(" | ")}`,
    );
  }
  console.log(`top-level symbol ownership ok (${locations.size} symbols)`);
}

function checkWristbandConstantUsage() {
  const files = [
    ...walk("js").filter((file) => /^js\/wristband.*\.js$/.test(file)),
    "js/callsheet-picker-runtime.js",
    "js/gameplan.js",
    "js/script-storage.js",
  ];
  const violations = [];

  files.forEach((file) => {
    const source = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const patterns = [
      /Array\(\s*40\s*\)/g,
      /\b(?:cardIdx|currentCardIndex)\s*\*\s*40\b/g,
      /\bcellIdx\s*<\s*40\b/g,
      /\bcellIdx\s*\+\s*11\b/g,
    ];
    patterns.forEach((pattern) => {
      [...source.matchAll(pattern)].forEach((match) => {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${file}:${line} (${match[0]})`);
      });
    });
  });

  if (violations.length) {
    fail(`wristband capacity/offset literals found: ${violations.join(", ")}`);
  }
  console.log("wristband constant usage ok");
}

function checkGuideContracts() {
  const html = read("index.html");
  const guide = read("AGENTS.md");
  const scripts = [...html.matchAll(/<script\b[^>]+src="(js\/[^"]+)"/g)]
    .map((match) => match[1].split("?")[0]);
  const loadOrderBlock = guide.match(
    /All scripts use `defer`[\s\S]*?```\n([\s\S]*?)```/,
  );
  const documentedScripts = loadOrderBlock
    ? [...loadOrderBlock[1].matchAll(/^\d+\.\s+(js\/[^\s]+)/gm)].map((match) => match[1])
    : [];
  if (scripts.join("\n") !== documentedScripts.join("\n")) {
    fail("AGENTS.md script load order does not match index.html");
  }

  const appEvents = read("js/app-events.js");
  const readSetValues = (source, setName) => {
    const block = source.match(
      new RegExp(`const ${setName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`),
    );
    return block
      ? [...block[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1])
      : [];
  };
  ["_ELEMENT_FNS", "_BOOL_FNS"].forEach((setName) => {
    const runtimeValues = readSetValues(appEvents, setName);
    const documentedValues = readSetValues(guide, setName);
    if (runtimeValues.join("\n") !== documentedValues.join("\n")) {
      fail(`AGENTS.md ${setName} does not match js/app-events.js`);
    }
  });

  const storage = read("js/storage.js");
  const storageObject = storage.match(/const STORAGE_KEYS\s*=\s*\{([\s\S]*?)\n\};/);
  const runtimeKeys = storageObject
    ? [...storageObject[1].matchAll(/^\s*([A-Z0-9_]+):/gm)].map((match) => match[1])
    : [];
  const storageGuideBlock = guide.match(
    /### STORAGE_KEYS \(complete list\)[\s\S]*?```js\n([\s\S]*?)```/,
  );
  const documentedKeys = storageGuideBlock
    ? [...storageGuideBlock[1].matchAll(/^([A-Z0-9_]+)\s+/gm)].map((match) => match[1])
    : [];
  if (runtimeKeys.join("\n") !== documentedKeys.join("\n")) {
    fail("AGENTS.md STORAGE_KEYS list does not match js/storage.js");
  }

  const callsheet = read("js/callsheet.js");
  const countCategoryIds = (name) => {
    const block = callsheet.match(
      new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`),
    );
    return block ? (block[1].match(/\bid\s*:/g) || []).length : 0;
  };
  const frontCount = countCategoryIds("CALLSHEET_FRONT");
  const backCount = countCategoryIds("CALLSHEET_BACK");
  const documentedFront = Number(
    guide.match(/\*\*CALLSHEET_FRONT\*\*\s+—\s+(\d+)/)?.[1],
  );
  const documentedBack = Number(
    guide.match(/\*\*CALLSHEET_BACK\*\*\s+—\s+(\d+)/)?.[1],
  );
  const documentedTotal = Number(
    guide.match(/CALLSHEET_CATEGORIES = \[\]; \/\/ All (\d+) base category definitions/)?.[1],
  );
  if (
    frontCount !== documentedFront ||
    backCount !== documentedBack ||
    frontCount + backCount !== documentedTotal
  ) {
    fail(
      `AGENTS.md call sheet counts do not match runtime ` +
      `(runtime ${frontCount}/${backCount}/${frontCount + backCount}, ` +
      `guide ${documentedFront}/${documentedBack}/${documentedTotal})`,
    );
  }

  console.log(
    `guide contracts ok (${scripts.length} scripts, ${runtimeKeys.length} storage keys, ` +
    `${frontCount + backCount} call sheet categories)`,
  );
}

checkJsSyntax();
checkServiceWorkerAssets();
checkIndexReferences();
checkCssGuardrails();
checkAccessibilityBasics();
checkDeclarativeHandlers();
checkStorageKeyUsage();
checkMigrationRetry();
checkSafeUiRendering();
checkHistoryContracts();
checkConflictContracts();
checkWristbandTypography();
checkPlayPresentationContracts();
checkScriptPlayerPublishingContracts();
checkPlayerPortalContracts();
checkWristbandWorkspaceContracts();
checkPlayerWristbandRuleOverrides();
checkSevenOnSevenTemplate();
checkCacheBusters();
checkServiceWorkerLifecycle();
checkServiceWorkerCachePolicy();
checkTopLevelSymbolOwnership();
checkWristbandConstantUsage();
checkGuideContracts();

if (process.exitCode) process.exit(process.exitCode);
console.log("smoke-check passed");
