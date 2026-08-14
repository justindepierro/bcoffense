import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("js/offensebuilder.js", `file://${root}/`), "utf8");
const css = await readFile(new URL("css/offense-builder.css", `file://${root}/`), "utf8");
const shell = await readFile(new URL("js/app-shell.js", `file://${root}/`), "utf8");

assert.match(
  source,
  /const OB_SEARCH_DEBOUNCE_MS = 120;[\s\S]*?const debouncedObSearchRender = debounce\([\s\S]*?obSearchTerm = String\(value \|\| ""\);[\s\S]*?obRenderPlayList\(\)/,
  "Offense Builder owns one bounded text-search render path",
);
assert.match(
  source,
  /searchInput\.addEventListener\("input", function \(\) \{[\s\S]*?debouncedObSearchRender\(this\.value\);/,
  "typing uses the debounced render path",
);
assert.match(
  source,
  /filterSelect\.addEventListener\("change", function \(\) \{[\s\S]*?obRenderPlayList\(\)/,
  "select filters remain immediate",
);
assert.match(
  source,
  /function obRenderPlayList\(\)[\s\S]*?const conceptKeysLower = new Set\([\s\S]*?Array\.from\(_obConceptMap\.keys\(\), \(key\) => String\(key\)\.toLowerCase\(\)\)[\s\S]*?conceptKeysLower\.has\(c\.toLowerCase\(\)\)/,
  "Offense Builder computes one normalized concept lookup for its gap badges",
);
const playListSource = source.slice(
  source.indexOf("function obRenderPlayList"),
  source.indexOf("function obRenderStarPicker"),
);
assert.doesNotMatch(
  playListSource,
  /Array\.from\(_obConceptMap\.keys\(\)\)\.some/,
  "gap badges do not rescan concept keys once per constraint",
);

assert.match(
  playListSource,
  /<button type="button" class="ob-card-select"[\s\S]*?data-ob-select-play=[\s\S]*?aria-label="Open details for/,
  "each Offense Builder play card exposes a native labeled selection button",
);
assert.match(
  playListSource,
  /const cardSelect = e\.target\.closest\("\.ob-card-select\[data-ob-select-play\]"\);[\s\S]*?obSelectPlay\(cardSelect\.dataset\.obSelectPlay\);/,
  "the play-list action delegation routes native card controls through one selection path",
);
assert.match(
  source,
  /function obRenderStarPicker\(playName, current\)[\s\S]*?<button type="button" class="ob-star [\s\S]*?aria-pressed=[\s\S]*?<button type="button" class="ob-star-clear"/,
  "ratings use native pressed-state star and clear buttons instead of clickable spans",
);
assert.match(
  source,
  /<button type="button" class="[\s\S]*?ob-constraint-chip[\s\S]*?data-concept=[\s\S]*?<button type="button" class="ob-constraint-chip ob-constraint-found ob-related-chip" data-related-play=/,
  "detail concept and related-play actions are native buttons",
);
assert.match(
  css,
  /body\.shell-tablet\.is-mobile-screen\.is-staff-mobile-shell\.is-landscape-screen:not\(\[data-auth-role="player"\]\)[\s\S]*?\.ob-body \{[\s\S]*?grid-template-columns: minmax\(240px, 280px\) minmax\(0, 1fr\);/,
  "staff tablet landscape gives Offense Builder a strict compact source rail",
);
assert.match(
  css,
  /\.ob-play-list,[\s\S]*?\.ob-sidebar \{[\s\S]*?overflow-y: auto;[\s\S]*?\.ob-card-select \{[\s\S]*?min-height: 44px;/,
  "the landscape Builder keeps deliberate pane scrolling and a 44px card control",
);
assert.match(
  shell,
  /obActivePlayName = names\[nextIndex\];[\s\S]*?obRenderPlayList\(\);[\s\S]*?document\.querySelector\(\s*"#obPlayList \.ob-card\.ob-card-active",?\s*\)/,
  "Arrow-key play selection scrolls the rendered active card into the current scroll owner",
);

console.log("Offense Builder search, semantic-control, and tablet-rail contract passed");
