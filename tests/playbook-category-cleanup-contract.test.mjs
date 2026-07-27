import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("js/playbook-identity.js", `file://${root}/`), "utf8");

assert.match(
  source,
  /let _catCleanupFilteredSnapshot = null;[\s\S]*?function _captureCatCleanupFilteredSnapshot\(\)[\s\S]*?\[\.\.\.filteredPlays\]/,
  "filtered cleanup captures the original play set",
);
assert.match(
  source,
  /if \(_catCleanupScope === "filtered"\) \{[\s\S]*?source = Array\.isArray\(_catCleanupFilteredSnapshot\)[\s\S]*?_catCleanupFilteredSnapshot[\s\S]*?: \[\];/,
  "an empty filtered set remains empty instead of falling back to all plays",
);
assert.match(
  source,
  /function _persistCatCleanupChanges\(\)[\s\S]*?invalidateFilterCache[\s\S]*?_catCleanupHasPendingPlaybookRender = true;/,
  "cleanup writes invalidate metadata indexes without immediately rerendering the playbook",
);
assert.match(
  source,
  /function closePlaybookCategoryCleanup\(\)[\s\S]*?_catCleanupHasPendingPlaybookRender[\s\S]*?filterPlays\(\)[\s\S]*?renderPlaybook\(\)/,
  "the visible playbook refreshes once after cleanup closes",
);

console.log("playbook category cleanup contract: locked filtered workset passed");
