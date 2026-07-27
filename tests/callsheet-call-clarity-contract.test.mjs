import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const render = await readFile(new URL("js/callsheet-render.js", `file://${root}/`), "utf8");
const print = await readFile(new URL("js/callsheet-print.js", `file://${root}/`), "utf8");
const css = await readFile(new URL("css/callsheet.css", `file://${root}/`), "utf8");
const callSheet = await readFile(new URL("js/callsheet.js", `file://${root}/`), "utf8");

assert.match(render, /const wristbandHtml = displayOptions\.showNumbers[\s\S]*?cs-wristband-number[\s\S]*?\$\{wristbandHtml\}[\s\S]*?\$\{personnelHtml\}/, "screen rows render wristband number before personnel and call text");
assert.match(print, /const wristbandHtml = displayOptions\.showNumbers[\s\S]*?print-wristband-number[\s\S]*?\$\{wristbandHtml\}\$\{personnelHtml\}/, "print rows preserve wristband-first order");
assert.match(render, /cs-one-word-call[\s\S]*?cs-one-word-full-call[\s\S]*?\(\$\{fullPlayName\}\)/, "one-word calls retain the full play name in parentheses");
assert.match(css, /\.print-wristband-number \{[\s\S]*?background: transparent !important;[\s\S]*?color: #111827 !important;/, "printed wristband numbers remain visible without printed backgrounds");
assert.match(callSheet, /function getCallSheetLoadedWristbandSummary\(\)[\s\S]*?loaded: Boolean\(name && plays\.length\)/, "loaded wristband state has one persisted source of truth");
assert.doesNotMatch(callSheet, /getElementById\("loadedWristbandDisplay"\)/, "source status and Finalize never scrape wristband state from rendered text");
assert.match(render, /const wristbandNumber = play\.wristbandNumber \|\| \([\s\S]*?getWristbandNumberForPlay\(play\)/, "Personnel page resolves wristband numbers from the loaded wristband mapping");
console.log("call sheet call clarity contract: wristband-first and one-word full-call passed");
