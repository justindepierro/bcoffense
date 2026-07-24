import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (relativePath) => readFile(new URL(relativePath, `file://${root}/`), "utf8");

const [utils, scriptExport, printCss, componentsCss] = await Promise.all([
  source("js/utils.js"),
  source("js/script-export.js"),
  source("css/print.css"),
  source("css/components.css"),
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
  /function _scriptPacketDiagramPages\(scriptData, packetTitle, options\)[\s\S]*?const entries = allEntries;/,
  "diagram packet pages preserve every play rather than filtering unresolved diagrams",
);
assert.match(
  scriptExport,
  /function _scriptPacketDiagramCoverage\(selectedScripts\)[\s\S]*?plays accounted for[\s\S]*?marked diagram needed/,
  "packet setup reports exactly how many script plays and diagrams are accounted for",
);
assert.match(
  scriptExport,
  /Every script play stays in the packet\.[\s\S]*?No attached diagram/,
  "the packet UI explains that no-diagram plays remain visible instead of being dropped",
);
assert.match(
  scriptExport,
  /function _scriptPacketLayoutChoices[\s\S]*?value: "two", title: "2-up"[\s\S]*?value: "large", title: "4-up"[\s\S]*?value: "compact", title: "8-up"/,
  "packet setup offers direct 2-up, 4-up, and 8-up diagram layouts",
);
assert.match(
  scriptExport,
  /data-packet-density="\$\{choice\.value\}"[\s\S]*?function _scriptPacketOptionsFromOverlay\(overlay, selectedDensity\)[\s\S]*?diagramDensity: selectedDensity/,
  "the visual layout chooser persists the selected diagram density",
);
assert.match(
  scriptExport,
  /function _scriptPacketLivePreviewMarkup\(selectedScripts, options, state = \{\}\)[\s\S]*?_scriptPacketDiagramCard\(entry, options\)[\s\S]*?Live page sample/,
  "packet setup renders a live sample from the selected script's real play cards",
);
assert.match(
  scriptExport,
  /async function _warmScriptPacketMedia\(selectedScripts\)[\s\S]*?prefetchAll[\s\S]*?prefetchForPlays/,
  "packet previews warm both local and canonical cloud media before declaring diagrams unavailable",
);
assert.match(
  scriptExport,
  /const renderLivePreview = \(\) => \{[\s\S]*?_scriptPacketOptionsFromOverlay\(overlay, selectedDensity\)[\s\S]*?control\.addEventListener\("change", renderLivePreview\)/,
  "packet sample updates as the print options change",
);
assert.match(
  scriptExport,
  /async function _saveScriptPacketSampleImage\(selectedScripts, options\)[\s\S]*?new File\(\[blob\], filename, \{ type: "image\/png" \}\)[\s\S]*?navigator\.share/,
  "coaches can save or share a real packet page image from a phone",
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
assert.match(
  utils,
  /previewClone\.classList\.contains\("script-packet-print-root"\)[\s\S]*?print-preview-content--packet/,
  "packet previews opt into their own print-faithful geometry",
);
assert.match(
  componentsCss,
  /\.print-preview-content--packet \.script-packet-page[\s\S]*?width: var\(--script-packet-page-width[\s\S]*?height: var\(--script-packet-page-height/,
  "the packet preview uses the same physical page dimensions as the printed artifact",
);

console.log("script packet isolated print contracts passed");
