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

function checkSevenOnSevenTemplate() {
  const snapshots = read("js/gameplan-snapshots.js");
  const print = read("js/gameplan-print.js");
  const gameplan = read("js/gameplan.js");
  const css = read("css/gameplan.css");
  const boxes = snapshots.match(
    /const GP_SEVEN_ON_SEVEN_BOXES\s*=\s*\[([\s\S]*?)\n\];/,
  )?.[1] || "";
  const boxCount = [...boxes.matchAll(/\bid:\s*"7on7-/g)].length;
  if (boxCount !== 6) {
    fail(`7-on-7 template must define 6 one-page buckets; found ${boxCount}`);
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
    !/gp-print-one-page/.test(css)
  ) {
    fail("7-on-7 one-page print preset is incomplete");
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
  console.log("7-on-7 template and game plan contracts ok");
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
checkWristbandTypography();
checkSevenOnSevenTemplate();
checkCacheBusters();
checkServiceWorkerLifecycle();
checkServiceWorkerCachePolicy();
checkTopLevelSymbolOwnership();
checkWristbandConstantUsage();
checkGuideContracts();

if (process.exitCode) process.exit(process.exitCode);
console.log("smoke-check passed");
