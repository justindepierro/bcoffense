import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("js/offensebuilder.js", `file://${root}/`), "utf8");

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

console.log("Offense Builder search debounce contract passed");
