import assert from "node:assert/strict";

const { sanitizeTeamWorkspace } = await import("../functions/workspace/revision.js");

const legacyWorkspace = {
  app: "BCOffense",
  version: 3,
  exportDate: "2026-07-19T04:38:27.036Z",
  playbook: "[]",
  savedScripts: "[]",
  callSheetDisplayOptions: "{}",
  callSheetNotes: "{}",
  theme: "dark",
  authSession: "{\"username\":\"admin\"}",
  playerQuizResults: "[]",
  callSheetCollapsed: "{}",
  playImages: { staleBrowserBlob: "data:image/png;base64,AA==" },
};

const sanitized = sanitizeTeamWorkspace(legacyWorkspace);
assert.equal(sanitized.ok, true, "known legacy browser fields are safely migratable");
assert.equal(sanitized.workspace.callSheetDisplayOptions, "{}", "actual call sheet team settings are retained");
assert.equal(sanitized.workspace.callSheetNotes, "{}", "actual call sheet notes are retained");
assert.equal(Object.hasOwn(sanitized.workspace, "theme"), false, "theme is never team data");
assert.equal(Object.hasOwn(sanitized.workspace, "authSession"), false, "auth state is never team data");
assert.equal(Object.hasOwn(sanitized.workspace, "playImages"), false, "browser blobs are never workspace data");
assert.deepEqual(
  sanitized.omittedKeys.sort(),
  ["authSession", "callSheetCollapsed", "playImages", "playerQuizResults", "theme"].sort(),
  "the repair is auditable and limited to known device-only fields",
);

const unclassified = sanitizeTeamWorkspace({ app: "BCOffense", playbook: "[]", futureBrowserKey: true });
assert.equal(unclassified.ok, false, "future fields require an explicit classification");
assert.match(unclassified.error, /unclassified field/, "unknown fields stay fail-closed");

console.log("workspace legacy sanitization contract passed");
