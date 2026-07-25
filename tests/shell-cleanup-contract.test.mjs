/**
 * Shell cleanup contract.
 *
 * The app uses global deferred scripts plus an explicit inventory of deferred
 * opt-in features. Every runtime file must belong to exactly one of those
 * paths. Only the startup shell is pre-cached; a deferred feature is cached
 * normally after first successful use. This also prevents proven-dead
 * compatibility aliases from quietly returning.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");
const sort = (items) => [...items].sort();

const panelScrollSources = [
  "js/app-command.js",
  "js/app-notifications.js",
  "js/play-discussion.js",
  "js/playbook-render.js",
  "js/script-add.js",
  "js/script-player.js",
  "js/script-quiz-foundation.js",
  "js/script-render.js",
  "js/tendencies.js",
  "js/wristband-cell-popup.js",
  "js/wristband-search.js",
];

const [indexHtml, serviceWorker, identitySource, playbookSource, scriptCss, scriptQuizCss, appShell, panelScrollOwners, jsEntries, cssEntries] = await Promise.all([
  source("index.html"),
  source("sw.js"),
  source("js/playbook-identity.js"),
  source("js/playbook.js"),
  source("css/script.css"),
  source("css/script-quiz.css"),
  source("js/app-shell.js"),
  Promise.all(panelScrollSources.map(async (path) => ({ path, content: await source(path) }))),
  readdir(new URL("js/", `file://${root}/`)),
  readdir(new URL("css/", `file://${root}/`)),
]);

const shellScripts = [...indexHtml.matchAll(/src="(js\/[^"?]+\.js)(?:\?[^\"]*)?"/g)].map((match) => match[1]);
const cachedScripts = [...serviceWorker.matchAll(/["']\.\/(js\/[^"']+\.js)["']/g)].map((match) => match[1]);
const runtimeFiles = jsEntries.filter((name) => name.endsWith(".js")).map((name) => `js/${name}`);
const deferredScripts = [...(await source("js/feature-loader.js")).matchAll(/loadDeferredFeature\("[^"]+", "(js\/[^"?]+\.js)(?:\?[^\"]*)?"\)/g)].map((match) => match[1]);
const shellStyles = [...indexHtml.matchAll(/href="(css\/[^"?]+\.css)(?:\?[^\"]*)?"/g)].map((match) => match[1]);
const cachedStyles = [...serviceWorker.matchAll(/["']\.\/(css\/[^"']+\.css)["']/g)].map((match) => match[1]);
const runtimeStyles = cssEntries.filter((name) => name.endsWith(".css")).map((name) => `css/${name}`);

assert.equal(new Set(shellScripts).size, shellScripts.length, "index.html loads each global runtime script once");
assert.equal(new Set(cachedScripts).size, cachedScripts.length, "sw.js pre-caches each global runtime script once");
assert.equal(new Set(deferredScripts).size, deferredScripts.length, "each deferred feature is registered once");
assert.deepEqual(sort([...shellScripts, ...deferredScripts]), sort(runtimeFiles), "every runtime JS file belongs to either the startup shell or an explicit deferred feature");
assert.deepEqual(sort(cachedScripts), sort(shellScripts), "the service worker pre-caches the complete startup shell only");
for (const deferredScript of deferredScripts) {
  assert.equal(shellScripts.includes(deferredScript), false, `${deferredScript} is not eagerly loaded by the startup shell`);
  assert.equal(cachedScripts.includes(deferredScript), false, `${deferredScript} is not pre-cached before its first use`);
}
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
assert.equal(
  shellScripts.indexOf("js/script-quiz-media.js"),
  shellScripts.indexOf("js/script-quiz.js") + 1,
  "quiz media preparation loads immediately after the player quiz runtime",
);
assert.equal(
  shellScripts.indexOf("js/script-quiz-progress.js"),
  shellScripts.indexOf("js/script-quiz-media.js") + 1,
  "quiz progress loads after media preparation is ready",
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
assert.match(
  appShell,
  /function openMobilePrimaryMore\(\)[\s\S]*?openLayer\(overlay, \{[\s\S]*?id: "mobile-primary-more"[\s\S]*?blocking: true[\s\S]*?sheet\?\.focus/,
  "the phone More sheet owns one blocking layer with a visible focus target",
);
assert.match(
  appShell,
  /function closeMobilePrimaryMore\(\)[\s\S]*?closeLayer\("mobile-primary-more"\)[\s\S]*?overlay\.remove\(\)/,
  "closing phone More releases shared scroll and focus ownership before removing the sheet",
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

assert.match(
  appShell,
  /function scrollElementWithinPanel\(el, opts = \{\}\)/,
  "the app shell owns the one safe panel-scroll primitive",
);
for (const { path, content } of panelScrollOwners) {
  assert.doesNotMatch(
    content,
    /\.scrollIntoView\(/,
    `${path} must use scrollElementWithinPanel so it cannot move desktop app chrome`,
  );
  assert.match(
    content,
    /scrollElementWithinPanel\(/,
    `${path} retains its scoped in-panel navigation behavior`,
  );
}
assert.doesNotMatch(
  appShell,
  /activeCard\.scrollIntoView|row\?\.scrollIntoView/,
  "app-shell keyboard and coach-mode navigation must use scoped panel scrolling",
);
const callSheetSmart = await source("js/callsheet-smart.js");
const callSheetPickerRuntime = await source("js/callsheet-picker-runtime.js");
const callSheetDisplay = await source("js/callsheet-display.js");
const playPresentation = await source("js/play-presentation.js");
assert.doesNotMatch(callSheetSmart, /function toggleScouting\(/, "the unused Call Sheet scouting alias stays retired");
assert.doesNotMatch(callSheetPickerRuntime, /function closeCsSuggestOverlay\(/, "smart-suggestion dismissal belongs to the Smart Suggestions owner");
assert.doesNotMatch(callSheetPickerRuntime, /function closeCsManagePresets\(/, "display-preset dismissal belongs to the Display owner");
assert.match(callSheetSmart, /function closeCsSuggest\(options = \{\}\)/, "Smart Suggestions owns its direct close action without an overlay-suffix alias");
assert.match(callSheetDisplay, /function closeCsManagePresets\(options = \{\}\)/, "Display presets own their direct close action");
assert.doesNotMatch(appShell, /_initPlayerSwipeNav|PLAYER_TABS = \["dashboard", "playbook", "script"\]/, "mobile page swipes never change player tabs");
assert.match(playPresentation, /function handlePlayPresentationTouchStart\(event\)/, "Swipe View retains its dedicated play-navigation touch handler");
assert.match(playPresentation, /PLAY_PRESENTATION_SWIPE_MIN_DISTANCE/, "only Swipe View owns horizontal swipe thresholds");
assert.match(playPresentation, /function getPlayPresentationHeaderTitle\(item\)/, "Swipe View owns a plain-text pinned play title for portrait study");
assert.match(playPresentation, /nextIndex >= itemCount[\s\S]*playPresentationState\.source === "script"[\s\S]*playPresentationState\.index = 0/, "finishing a script restarts that same packet instead of escaping into another source");
assert.match(indexHtml, /id="playPresentationTitle" class="pp-header-play-title"/, "presentation markup reserves a persistent header title outside the scrollable study body");

console.log("shell cleanup contract: runtime asset inventory and retired aliases passed");
