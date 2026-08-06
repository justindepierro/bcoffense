import assert from "node:assert/strict";
import fs from "node:fs";

const session = fs.readFileSync("js/app-session.js", "utf8");
const cloudSync = fs.readFileSync("js/cloud-sync.js", "utf8");
const scriptStorage = fs.readFileSync("js/script-storage.js", "utf8");
const wristband = fs.readFileSync("js/wristband.js", "utf8");
const callSheet = fs.readFileSync("js/callsheet.js", "utf8");
const tendencies = fs.readFileSync("js/tendencies.js", "utf8");

assert.match(session, /function openRecoveryCenter\(\)/, "Recovery Center must be explicitly available.");
assert.match(session, /Review Legacy Recovery/, "Recovery Center must identify legacy drafts clearly.");
assert.match(session, /cannot overwrite the current workspace/, "Recovery Center must explain that drafts are quarantined.");
assert.match(session, /discardLegacyRecoveryCandidate/, "Recovery Center must support targeted discard.");
assert.match(session, /discardAllLegacyRecoveryCandidates/, "Recovery Center must support bulk discard.");
assert.match(cloudSync, /data-action="openRecoveryCenter"/, "Admin Recovery Tools must link to Recovery Center.");

for (const [label, source, functionName, key] of [
  ["script", scriptStorage, "scheduleScriptAutosave", "SCRIPT_DRAFT"],
  ["wristband", wristband, "scheduleWristbandAutosave", "WRISTBAND_DRAFT"],
  ["tendencies", tendencies, "scheduleTendenciesAutosave", "TENDENCIES_DRAFT"],
]) {
  const fnStart = source.indexOf(`function ${functionName}()`);
  assert.notEqual(fnStart, -1, `${label} autosave function should exist.`);
  const opening = source.indexOf("{", fnStart);
  const legacyRetirement = source.indexOf(`discardDraftData(STORAGE_KEYS.${key}`, opening);
  const earlyReturn = source.indexOf("return;", opening);
  assert(legacyRetirement > opening && earlyReturn > legacyRetirement, `${label} must retire legacy drafts before scheduling a write.`);
}

for (const [label, source, functionName] of [
  ["script", scriptStorage, "checkScriptDraft"],
  ["wristband", wristband, "checkWristbandDraft"],
  ["call sheet", callSheet, "checkCallSheetDraft"],
  ["tendencies", tendencies, "checkTendenciesDraft"],
]) {
  const start = source.indexOf(`function ${functionName}()`);
  assert.notEqual(start, -1, `${label} legacy recovery compatibility function should remain callable.`);
  const guard = source.indexOf("if (!LEGACY_DRAFT_AUTO_RESTORE_ENABLED) return;", start);
  assert(guard > start && guard < start + 500, `${label} must make legacy restoration a no-op.`);
}

console.log("recovery-center-contract: ok");
