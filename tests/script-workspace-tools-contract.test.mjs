import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [css, actions, shared, index] = await Promise.all([
  readFile(new URL("css/script.css", `file://${root}/`), "utf8"),
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/script-shared.js", `file://${root}/`), "utf8"),
  readFile(new URL("index.html", `file://${root}/`), "utf8"),
]);

assert.match(
  css,
  /\.script-tools-drawer\s*\{[\s\S]*?top:\s*50%;[\s\S]*?left:\s*50%;[\s\S]*?width:\s*min\(760px, calc\(100vw - 48px\)\);[\s\S]*?max-height:\s*min\(760px, calc\(var\(--app-layer-usable-height/,
  "Script Tools uses a bounded centered modal rather than a persistent side drawer",
);
assert.match(index, /<aside class="script-tools-drawer"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?<h3 id="scriptToolsDrawerTitle">Workspace tools<\/h3>[\s\S]*?Save, organize, share, and print this script\./, "workspace tools is an accessible dialog with an explicit purpose");
assert.match(index, /data-script-tools-section="manage" open/, "only the primary Manage section opens by default");
assert.match(shared, /function initScriptToolsDrawerSections\(\)[\s\S]*?\.script-drawer-section\[open\]/, "opening a workspace section closes its peers for a scannable command drawer");
assert.match(shared, /function setScriptToolsDrawerOpen\(isOpen\)[\s\S]*?openLayer\(drawer, \{[\s\S]*?id: "scriptToolsWorkspaceModal"[\s\S]*?blocking: true,[\s\S]*?scrollElement: drawer\.querySelector\("\.script-tools-drawer-body"\)[\s\S]*?initialFocus: drawer\.querySelector\("\.script-tools-drawer-close"\)[\s\S]*?onEscape: closeScriptToolsDrawer/, "Script Tools uses LayerManager with owned scrolling, focus, and Escape");
assert.match(css, /script-tools-drawer \.script-action-cluster\[data-cluster="output"\] \.btn:first-child[\s\S]*?grid-column: 1 \/ -1/, "print remains the primary full-width action while secondary output actions fit a compact grid");
assert.match(
  actions,
  /label: "Workspace Tools", sublabel: "Organize, packet, send & more", postCloseDelayMs: 200, run: \(\) => _paCall\("openScriptToolsDrawer"\)/,
  "Workspace Tools is the one advanced Script entry in the Actions hub",
);
assert.match(
  actions,
  /setTimeout\(execute, Math\.max\(0, Number\(postCloseDelayMs\) \|\| 0\)\);/,
  "the shared Actions executor waits for the sheet transition before opening a layered Script drawer",
);

console.log("script workspace tools contract: 2 assertions passed");
