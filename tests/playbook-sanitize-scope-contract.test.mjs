import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("js/playbook-sanitize.js", `file://${root}/`), "utf8");

assert.match(
  source,
  /let _sanitizeFilteredSnapshot = null;[\s\S]*?function _captureSanitizeFilteredSnapshot\(\)[\s\S]*?\[\.\.\.filteredPlays\]/,
  "filtered sanitation captures the original review set",
);
assert.match(
  source,
  /if \(_sanitizeUseFiltered\) \{[\s\S]*?source = Array\.isArray\(_sanitizeFilteredSnapshot\)[\s\S]*?_sanitizeFilteredSnapshot[\s\S]*?: \[\];/,
  "an empty locked sanitation set does not fall back to every play",
);
assert.match(
  source,
  /function _persistSanitizeChanges\(\)[\s\S]*?invalidateFilterCache[\s\S]*?_sanitizeHasPendingPlaybookRender = true;/,
  "sanitation invalidates indexes without rerendering the live playbook mid-review",
);
assert.match(
  source,
  /function closePlaybookSanitize\(\)[\s\S]*?_sanitizeHasPendingPersist[\s\S]*?_sanitizeHasPendingPlaybookRender[\s\S]*?filterPlays\(\)[\s\S]*?renderPlaybook\(\)/,
  "closing sanitation flushes pending writes and refreshes the visible playbook once",
);

console.log("playbook sanitation contract: locked scope and deferred refresh passed");
