import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [dnd, render, css] = await Promise.all([
  readFile(new URL("js/gameplan-dnd.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/gameplan-render.js", `file://${root}/`), "utf8"),
  readFile(new URL("css/gameplan.css", `file://${root}/`), "utf8"),
]);

assert.match(
  dnd,
  /let toIdx = Number\.isFinite\(targetIdx\) \? targetIdx : arr\.length;[\s\S]*?if \(fromIdx < toIdx\) toIdx -= 1;[\s\S]*?toIdx = Math\.max\(0, Math\.min\(arr\.length, toIdx\)\);/,
  "intra-bucket drops shift the pre-removal target before clamping, including a bottom drop",
);
assert.match(dnd, /is-drag-source/, "dragging a box play exposes a source-state affordance");
assert.match(render, /gp-box-play-grip/, "box plays render a dedicated reorder grip");
assert.match(css, /\.gp-box-play\.is-drag-source[\s\S]*?\.gp-box-play-grip/, "the reorder grip and drag source have visible feedback");

console.log("game plan drag-drop contract: passed");
