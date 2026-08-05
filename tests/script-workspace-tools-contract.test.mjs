import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [css, actions] = await Promise.all([
  readFile(new URL("css/script.css", `file://${root}/`), "utf8"),
  readFile(new URL("js/page-actions.js", `file://${root}/`), "utf8"),
]);

assert.match(
  css,
  /body:not\(\.is-mobile-screen\):not\(\[data-auth-role="player"\]\) #script \.script-tools-drawer\.open\s*\{\s*transform: translateX\(0\);/,
  "desktop Script Tools open state overrides the off-canvas Coach Grid drawer transform",
);
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
