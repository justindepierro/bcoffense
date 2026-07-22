/**
 * Shell cleanup contract.
 *
 * The app uses global deferred scripts, so every runtime file must be loaded
 * once by index.html and pre-cached once by the service worker. This also
 * prevents proven-dead compatibility aliases from quietly returning.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");
const sort = (items) => [...items].sort();

const [indexHtml, serviceWorker, identitySource, playbookSource, scriptCss, scriptQuizCss, jsEntries, cssEntries] = await Promise.all([
  source("index.html"),
  source("sw.js"),
  source("js/playbook-identity.js"),
  source("js/playbook.js"),
  source("css/script.css"),
  source("css/script-quiz.css"),
  readdir(new URL("js/", `file://${root}/`)),
  readdir(new URL("css/", `file://${root}/`)),
]);

const shellScripts = [...indexHtml.matchAll(/src="(js\/[^"?]+\.js)(?:\?[^\"]*)?"/g)].map((match) => match[1]);
const cachedScripts = [...serviceWorker.matchAll(/["']\.\/(js\/[^"']+\.js)["']/g)].map((match) => match[1]);
const runtimeFiles = jsEntries.filter((name) => name.endsWith(".js")).map((name) => `js/${name}`);
const shellStyles = [...indexHtml.matchAll(/href="(css\/[^"?]+\.css)(?:\?[^\"]*)?"/g)].map((match) => match[1]);
const cachedStyles = [...serviceWorker.matchAll(/["']\.\/(css\/[^"']+\.css)["']/g)].map((match) => match[1]);
const runtimeStyles = cssEntries.filter((name) => name.endsWith(".css")).map((name) => `css/${name}`);

assert.equal(new Set(shellScripts).size, shellScripts.length, "index.html loads each global runtime script once");
assert.equal(new Set(cachedScripts).size, cachedScripts.length, "sw.js pre-caches each global runtime script once");
assert.deepEqual(sort(shellScripts), sort(runtimeFiles), "every runtime JS file is loaded by the app shell");
assert.deepEqual(sort(cachedScripts), sort(runtimeFiles), "every runtime JS file is cached by the service worker");
assert.equal(
  shellScripts.indexOf("js/script-quiz-foundation.js"),
  shellScripts.indexOf("js/script-quiz-state.js") + 1,
  "quiz foundation loads immediately after quiz state",
);
assert.equal(
  shellScripts.indexOf("js/script-quiz.js"),
  shellScripts.indexOf("js/script-quiz-foundation.js") + 1,
  "player quiz runtime loads immediately after its foundation",
);
assert.equal(new Set(shellStyles).size, shellStyles.length, "index.html loads each stylesheet once");
assert.equal(new Set(cachedStyles).size, cachedStyles.length, "sw.js pre-caches each stylesheet once");
assert.deepEqual(sort(shellStyles), sort(runtimeStyles), "every stylesheet is loaded by the app shell");
assert.deepEqual(sort(cachedStyles), sort(runtimeStyles), "every stylesheet is cached by the service worker");

assert.doesNotMatch(identitySource, /setPlaybookCategoryCleanupHide/, "the retired category-cleanup no-op shim stays removed");
assert.match(
  playbookSource,
  /group\.dataset\.chipListenerBound === "true"/,
  "playbook filter-chip listeners remain idempotent across workspace hydration",
);
for (const selector of [
  "play-readiness-badge--trusted",
  "play-readiness-badge--ready",
  "pr-confidence--trusted",
  "pr-confidence--ready",
  "pr-confidence--needs",
  "pr-confidence--risk",
  "play-readiness-widget--trusted",
  "play-readiness-widget--ready",
  "play-readiness-widget--needs",
  "play-readiness-widget--risk",
]) {
  assert.equal(
    `${scriptCss}\n${scriptQuizCss}`.includes(selector),
    false,
    `${selector} was a proven-unused readiness alias and stays retired`,
  );
}

console.log("shell cleanup contract: runtime asset inventory and retired aliases passed");
