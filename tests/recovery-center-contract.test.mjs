import assert from "node:assert/strict";
import fs from "node:fs";

const session = fs.readFileSync("js/app-session.js", "utf8");
const cloudSync = fs.readFileSync("js/cloud-sync.js", "utf8");
const scriptStorage = fs.readFileSync("js/script-storage.js", "utf8");
const wristband = fs.readFileSync("js/wristband.js", "utf8");
const wristbandStorage = fs.readFileSync("js/wristband-storage.js", "utf8");
const callSheet = fs.readFileSync("js/callsheet.js", "utf8");
const tendencies = fs.readFileSync("js/tendencies.js", "utf8");

function getFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist.`);
  const opening = source.indexOf("{", start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} should have a complete function body.`);
}

assert.match(session, /function openRecoveryCenter\(\)/, "Recovery Center must be explicitly available.");
assert.match(session, /Review Legacy Recovery/, "Recovery Center must identify legacy drafts clearly.");
assert.match(session, /cannot overwrite the current workspace/, "Recovery Center must explain that drafts are quarantined.");
assert.match(session, /discardLegacyRecoveryCandidate/, "Recovery Center must support targeted discard.");
assert.match(session, /discardAllLegacyRecoveryCandidates/, "Recovery Center must support bulk discard.");
assert.match(cloudSync, /data-action="openRecoveryCenter"/, "Admin Recovery Tools must link to Recovery Center.");

const scriptAutosave = getFunctionBody(scriptStorage, "scheduleScriptAutosave");
assert.match(scriptAutosave, /discardDraftData\(STORAGE_KEYS\.SCRIPT_DRAFT/, "Script autosave retires a legacy recovery draft first.");
assert.match(scriptAutosave, /getActiveSavedScriptForAutosave\(\)/, "Script autosave writes only to an active named record.");
assert.match(scriptAutosave, /queueAutosave\(/, "Script autosave retains its debounced persistence path.");
assert.doesNotMatch(scriptAutosave, /persistDraftData\(/, "Script autosave cannot create another legacy recovery draft.");

const wristbandAutosave = getFunctionBody(wristband, "scheduleWristbandAutosave");
assert.match(wristbandAutosave, /scheduleActiveWristbandAutosave\(/, "Wristband mutations delegate to the named-record autosave path.");
assert.doesNotMatch(wristbandAutosave, /persistDraftData\(/, "Wristband mutations cannot create another legacy recovery draft.");

const namedWristbandAutosave = getFunctionBody(wristbandStorage, "scheduleActiveWristbandAutosave");
assert.match(namedWristbandAutosave, /discardDraftData\(STORAGE_KEYS\.WRISTBAND_DRAFT/, "Named Wristband autosave retires a legacy recovery draft first.");
assert.match(namedWristbandAutosave, /getActiveSavedWristbandForAutosave\(\)/, "Named Wristband autosave writes only to an active saved record.");
assert.match(namedWristbandAutosave, /queueAutosave\(/, "Named Wristband autosave remains debounced.");

const tendenciesAutosave = getFunctionBody(tendencies, "scheduleTendenciesAutosave");
const tendenciesRetirement = tendenciesAutosave.indexOf("discardDraftData(STORAGE_KEYS.TENDENCIES_DRAFT");
const tendenciesEarlyReturn = tendenciesAutosave.indexOf("return;");
assert(tendenciesRetirement >= 0 && tendenciesEarlyReturn > tendenciesRetirement, "Tendencies must retire legacy drafts before scheduling a write.");

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
