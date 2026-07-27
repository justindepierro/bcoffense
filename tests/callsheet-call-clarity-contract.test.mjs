import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const render = await readFile(new URL("js/callsheet-render.js", `file://${root}/`), "utf8");
const print = await readFile(new URL("js/callsheet-print.js", `file://${root}/`), "utf8");

assert.match(render, /const wristbandHtml = displayOptions\.showNumbers[\s\S]*?cs-wristband-number[\s\S]*?\$\{wristbandHtml\}[\s\S]*?\$\{personnelHtml\}/, "screen rows render wristband number before personnel and call text");
assert.match(print, /const wristbandHtml = displayOptions\.showNumbers[\s\S]*?print-wristband-number[\s\S]*?\$\{wristbandHtml\}\$\{personnelHtml\}/, "print rows preserve wristband-first order");
assert.match(render, /cs-one-word-call[\s\S]*?cs-one-word-full-call[\s\S]*?\(\$\{fullPlayName\}\)/, "one-word calls retain the full play name in parentheses");
console.log("call sheet call clarity contract: wristband-first and one-word full-call passed");
