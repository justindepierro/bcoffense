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
  const stamps = [
    ...html.matchAll(/(?:src|href)="(?:js|css)\/[^"?]+\.(?:js|css)\?v=(\d+)"/g),
  ].map((match) => match[1]);
  const unique = [...new Set(stamps)];
  if (unique.length !== 1) {
    fail(`index.html has inconsistent asset cache busters: ${unique.join(", ")}`);
  }
  console.log(`cache busters ok (v${unique[0] || "unknown"})`);
}

checkJsSyntax();
checkServiceWorkerAssets();
checkIndexReferences();
checkCssGuardrails();
checkAccessibilityBasics();
checkCacheBusters();

if (process.exitCode) process.exit(process.exitCode);
console.log("smoke-check passed");
