import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [session, callSheet, render] = await Promise.all([
  readFile(new URL("js/app-session.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet.js", `file://${root}/`), "utf8"),
  readFile(new URL("js/callsheet-render.js", `file://${root}/`), "utf8"),
]);

assert.match(
  session,
  /const LEGACY_DRAFT_AUTO_RESTORE_ENABLED = false;/,
  "legacy draft recovery cannot auto-prompt on normal tab startup",
);
assert.match(
  session,
  /function runDraftRestoreCheckForTab\(tabName\) \{\s*if \(!LEGACY_DRAFT_AUTO_RESTORE_ENABLED\) \{\s*draftRestoreChecksRun\.add\(tabName\);\s*return;/,
  "startup exits before calling a legacy draft restore handler",
);
assert.match(
  callSheet,
  /function retireCallSheetRecoveryDraft\(\)[\s\S]*?discardDraftData\(\s*STORAGE_KEYS\.CALLSHEET_DRAFT/,
  "Call Sheet owns a single helper for retiring stale whole-page recovery data",
);
assert.match(
  callSheet,
  /function saveCallSheet\(\)[\s\S]*?storageManager\.set\(STORAGE_KEYS\.CALL_SHEET, callSheet\);[\s\S]*?retireCallSheetRecoveryDraft\(\);/,
  "a canonical Call Sheet save retires an older recovery draft",
);
assert.doesNotMatch(
  callSheet,
  /function scheduleCallSheetAutosave\(/,
  "Call Sheet no longer continuously creates a second full-page draft record",
);
assert.match(
  render,
  /function saveCallSheetSettings\(\)[\s\S]*?storageManager\.set\(STORAGE_KEYS\.CALL_SHEET_SETTINGS, callSheetSettings\);[\s\S]*?retireCallSheetRecoveryDraft\(\);/,
  "a settings-only save cannot leave an old draft eligible to overwrite Index Card state",
);

console.log("draft recovery safety contract: passed");
