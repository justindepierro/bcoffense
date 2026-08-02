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
  /function openScriptToolsFromPageActions\(\)[\s\S]*?closePageActions\(\);[\s\S]*?setTimeout\(\(\) => _paCall\("openScriptToolsDrawer"\), 200\);/,
  "Workspace Tools waits for Actions to finish closing before opening the drawer",
);

console.log("script workspace tools contract: 2 assertions passed");
