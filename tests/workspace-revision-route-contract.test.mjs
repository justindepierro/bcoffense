import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(new URL("functions/workspace/revision.js", `file://${root}/`), "utf8");

assert.match(source, /commitWorkspaceAndPlayerRelease/, "daily workspace route uses the atomic D1\/R2 commit helper");
assert.match(source, /X-BC-Expected-Workspace-Revision/, "daily workspace route accepts an explicit CAS revision");
assert.match(source, /workspaceError\([^\n]+, 428/, "daily workspace route rejects a blind write over an existing head");
assert.match(source, /buildPlayerRelease\(workspace/, "player release is built before the shared head moves");
assert.match(source, /TEAM_WORKSPACE_KEYS/, "daily workspace route uses a strict team-data allowlist");
assert.match(source, /LEGACY_DEVICE_ONLY_KEYS/, "daily workspace route recognizes only an explicit legacy browser-field migration set");
assert.match(source, /unclassified field/, "daily workspace route rejects unclassified future fields");
assert.match(source, /opts\.allowLegacyRepair !== false/, "staff reads repair a recognized legacy workspace once");
assert.match(source, /expectedWorkspaceRevision: current\.pointer\.workspaceRevision/, "legacy repair uses the current workspace head as its CAS base");
assert.doesNotMatch(source, /sync\/backup/, "daily workspace route never delegates to raw recovery backup");
assert.match(source, /readCurrentWorkspaceRevision/, "coach workspace reads use the immutable pointer");

console.log("workspace revision route contract: 10 assertions passed");
