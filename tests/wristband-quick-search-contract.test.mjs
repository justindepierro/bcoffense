import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("js/wristband-search.js", `file://${root}/`), "utf8");
const renderSource = source.slice(source.indexOf("function renderQuickSearchResults"));

assert.match(
  source,
  /const results = document\.getElementById\("wbQuickSearchResults"\);[\s\S]*?results\.addEventListener\("click",[\s\S]*?event\.target\.closest\("\.wb-quicksearch-item\[data-play-idx\]"\)[\s\S]*?addPlayToNextEmpty\(playIdx\)[\s\S]*?closeWbQuickSearch\(\)/,
  "quick-search results use one stable delegated click handler",
);
assert.doesNotMatch(
  renderSource,
  /addEventListener\("click"/,
  "re-rendering quick-search results does not create one click handler per row",
);

console.log("wristband quick-search listener contract passed");
