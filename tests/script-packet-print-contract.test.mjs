import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [utils, scriptExport, printCss] = await Promise.all([
  source("js/utils.js"),
  source("js/script-export.js"),
  source("css/print.css"),
]);

assert.match(
  utils,
  /function printIsolatedArtifact\(contentEl, options = \{\}\)[\s\S]*?const bodyClass = String\(options\.bodyClass \|\| ""\)[\s\S]*?<body class="print-script print-isolated-artifact \$\{escapeAttr\(bodyClass\)\}">/,
  "the isolated print helper supports artifact-specific print mode classes",
);
assert.match(
  scriptExport,
  /function _renderScriptPacketAndPrint\(selectedScripts\)[\s\S]*?printIsolatedArtifact\(host, \{[\s\S]*?bodyClass: "script-packet-printing",[\s\S]*?onAfterPrint: finishPacket/,
  "packet printing uses the isolated artifact flow rather than the live app shell",
);
assert.match(
  scriptExport,
  /async function openScriptPacketBuilder\(\)[\s\S]*openScriptPacketPrintModal\(\[currentScript\]\)/,
  "the primary Print Packet action opens the current script's packet setup directly",
);
assert.match(
  scriptExport,
  /value="two"[\s\S]*Two-up — 2 diagrams per page[\s\S]*Four-up — 4 diagrams per page[\s\S]*Eight-up — 8 diagrams per page/,
  "packet setup offers direct 2-up, 4-up, and 8-up diagram layouts",
);
assert.match(
  scriptExport,
  /if \(density === "two"\) return \{ perPage: 2, cols: 1, rows: 2 \}/,
  "the two-up selection maps to an actual two-card page layout",
);
assert.match(
  printCss,
  /body\.script-packet-printing > \.script-packet-print-root[\s\S]*?body\.script-packet-printing \.script-packet-print-root \*\s*\{/,
  "packet print CSS targets the portable artifact class instead of a live-page ID",
);

console.log("script packet isolated print contracts passed");
