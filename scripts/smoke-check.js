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
  const files = [...walk("js"), "sw.js"];
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
  const missing = assets.filter((asset) => asset !== "" && !fs.existsSync(path.join(root, asset)));
  if (missing.length) fail(`missing LOCAL_ASSETS entries: ${missing.join(", ")}`);

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
  const html = read("index.html");
  if (/\son[a-z]+=/i.test(html)) {
    fail("inline event handler attributes found in index.html");
  }

  const ids = [...html.matchAll(/\sid=(["'])(.*?)\1/g)].map((match) => match[2]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) {
    fail(`duplicate ids in index.html: ${[...new Set(duplicateIds)].join(", ")}`);
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
    fail(`buttons without accessible names: ${unnamedButtons.join(" | ")}`);
  }

  const imagesWithoutAlt = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => !/\salt=(["']).*?\1/i.test(tag));
  if (imagesWithoutAlt.length) {
    fail(`images without alt text: ${imagesWithoutAlt.map((tag) => tag.slice(0, 120)).join(" | ")}`);
  }

  console.log("accessibility basics ok");
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

  console.log("service worker lifecycle preserves active work");
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
checkCacheBusters();
checkServiceWorkerLifecycle();
checkTopLevelSymbolOwnership();
checkWristbandConstantUsage();
checkGuideContracts();

if (process.exitCode) process.exit(process.exitCode);
console.log("smoke-check passed");
