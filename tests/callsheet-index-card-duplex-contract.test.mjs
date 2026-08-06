import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const indexCards = await readFile(new URL("js/callsheet-index-cards.js", `file://${root}/`), "utf8");

assert.match(
  indexCards,
  /function renderCallSheetIndexCardPrintPages[\s\S]*?sides\.map\(\(side\) =>[\s\S]*?data-card-side="\$\{side\}"/,
  "index-card print pages retain their explicit Front then Back card-side sequence",
);
assert.match(
  indexCards,
  /function previewCurrentCallSheetIndexCard\(\)[\s\S]*?openCallSheetIndexCardPrintPreview\(\{ cards: "current", sides: "both", copies: 1 \}\)/,
  "quick Preview creates a paired duplex job rather than a one-side-only job",
);
assert.match(indexCards, /Flip on long edge/, "the print dialog guidance uses portrait long-edge duplex binding");

console.log("call sheet index-card duplex contract: passed");
