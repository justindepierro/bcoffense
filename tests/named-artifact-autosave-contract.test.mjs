import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const scriptStorage = fs.readFileSync("js/script-storage.js", "utf8");
const scriptPlayer = fs.readFileSync("js/script-player.js", "utf8");
const wristbandStorage = fs.readFileSync("js/wristband-storage.js", "utf8");
const wristband = fs.readFileSync("js/wristband.js", "utf8");
const appShell = fs.readFileSync("js/app-shell.js", "utf8");
const appSession = fs.readFileSync("js/app-session.js", "utf8");
const auth = fs.readFileSync("js/auth.js", "utf8");

function getFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist.`);
  const functionStart = source.slice(Math.max(0, start - 6), start) === "async "
    ? start - 6
    : start;
  const signatureEnd = source.indexOf(")", start);
  const opening = source.indexOf("{", signatureEnd);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(functionStart, index + 1);
  }
  assert.fail(`${name} should have a complete function body.`);
}

const scriptTarget = getFunctionBody(scriptStorage, "getActiveSavedScriptForAutosave");
const scriptAutosave = getFunctionBody(scriptStorage, "autosaveActiveSavedScript");
const scriptScheduler = getFunctionBody(scriptStorage, "scheduleScriptAutosave");
const wristbandTarget = getFunctionBody(wristbandStorage, "getActiveSavedWristbandForAutosave");
const wristbandAutosave = getFunctionBody(wristbandStorage, "autosaveActiveSavedWristband");
const wristbandScheduler = getFunctionBody(wristbandStorage, "scheduleActiveWristbandAutosave");
const wristbandBridge = getFunctionBody(wristband, "scheduleWristbandAutosave");
const scriptUnnamedCheck = getFunctionBody(scriptStorage, "hasUnsavedScriptWithoutAutosaveDestination");
const scriptUnnamedGuard = getFunctionBody(scriptStorage, "confirmUnnamedScriptBeforeLibraryLoad");
const wristbandUnnamedCheck = getFunctionBody(wristbandStorage, "hasUnsavedWristbandWithoutAutosaveDestination");
const wristbandUnnamedGuard = getFunctionBody(wristbandStorage, "confirmUnnamedWristbandBeforeLibraryLoad");
const localSaveSource = getFunctionBody(appShell, "getLocalArtifactSaveSource");
const aggregateLocalSaveState = getFunctionBody(appShell, "getAggregateLocalSaveState");
const updateSaveStatus = getFunctionBody(appShell, "updateSaveStatus");
const markScriptDirty = getFunctionBody(appSession, "markScriptDirty");
const markScriptClean = getFunctionBody(appSession, "markScriptClean");
const markWristbandDirty = getFunctionBody(appSession, "markWristbandDirty");
const markWristbandClean = getFunctionBody(appSession, "markWristbandClean");
const lifecycleFlush = getFunctionBody(appSession, "flushActiveArtifactAutosavesForLifecycle");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runScriptAutosave({ records, activeId, editorName = "August 17 Script", setResult = true, expectedId = null }) {
  const writes = [];
  const state = { resets: 0, finalized: 0, listed: 0 };
  const sandbox = {
    seedRecords: records,
    seedActiveId: activeId,
    seedEditorName: editorName,
    STORAGE_KEYS: { SAVED_SCRIPTS: "savedScripts" },
    script: [{ id: "changed-play", call: "Quick" }],
    document: {
      getElementById(id) {
        if (id === "scriptName") return { value: sandbox.seedEditorName };
        if (id === "scriptDate") return { value: "2026-08-17" };
        return null;
      },
    },
    getSavedScripts: () => sandbox.seedRecords,
    safeDeepClone: clone,
    getScriptWorkspaceState: () => ({ activePeriod: "team" }),
    isSavedScriptPlayerVisible: (record) => Boolean(record.playerVisible),
    storageManager: {
      set(key, value) {
        writes.push({ key, value: clone(value) });
        return setResult;
      },
    },
    resetActiveScriptIdentity() {
      state.resets += 1;
    },
    updateScriptArtifactStatus() {},
    loadSavedScriptsList() {
      state.listed += 1;
    },
    finalizeScriptSave() {
      state.finalized += 1;
    },
  };
  vm.runInNewContext([
    "var activeScriptSaveId = seedActiveId;",
    "var activeScriptSaveTitle = '';",
    "var activeScriptSavedAt = '';",
    scriptTarget,
    scriptAutosave,
    `var autosaveResult = autosaveActiveSavedScript(${expectedId === null ? "" : JSON.stringify({ expectedId })});`,
  ].join("\n"), sandbox);
  return { result: sandbox.autosaveResult, writes, state, records };
}

function runWristbandAutosave({ records, activeId, setResult = true, expectedId = null }) {
  const writes = [];
  const state = { resets: 0, finalized: 0, builds: [] };
  const sandbox = {
    seedRecords: records,
    seedActiveId: activeId,
    STORAGE_KEYS: { SAVED_WRISTBANDS: "savedWristbands" },
    storageManager: {
      get() {
        return sandbox.seedRecords;
      },
      set(key, value) {
        writes.push({ key, value: clone(value) });
        return setResult;
      },
    },
    resetActiveWristbandIdentity() {
      state.resets += 1;
    },
    buildWristbandSaveRecord(title, opts) {
      state.builds.push({ title, opts: clone(opts) });
      return {
        id: opts.id,
        title,
        cards: [{ name: "Card 1", data: ["updated"] }],
        savedAt: "2026-08-17T12:00:00.000Z",
      };
    },
    finalizeWristbandSave() {
      state.finalized += 1;
    },
  };
  vm.runInNewContext([
    "var activeWristbandSaveId = seedActiveId;",
    "var activeWristbandTitle = '';",
    "var activeWristbandSavedAt = '';",
    wristbandTarget,
    wristbandAutosave,
    `var autosaveResult = autosaveActiveSavedWristband(${expectedId === null ? "" : JSON.stringify({ expectedId })});`,
  ].join("\n"), sandbox);
  return { result: sandbox.autosaveResult, writes, state, records };
}

async function runUnnamedLibraryGuard({ type, dirty, hasDestination, choice = null }) {
  const isScript = type === "script";
  const prompts = [];
  const toasts = [];
  const sandbox = {
    scriptDirty: isScript ? dirty : false,
    wristbandDirty: isScript ? false : dirty,
    getActiveSavedScriptForAutosave() {
      return hasDestination ? { active: { id: "saved-script" } } : null;
    },
    getActiveSavedWristbandForAutosave() {
      return hasDestination ? { active: { id: "saved-wristband" } } : null;
    },
    showChoice: async (message, opts) => {
      prompts.push({ message, opts });
      return choice;
    },
    showToast(message, opts) {
      toasts.push({ message, opts });
    },
  };
  const check = isScript ? scriptUnnamedCheck : wristbandUnnamedCheck;
  const guard = isScript ? scriptUnnamedGuard : wristbandUnnamedGuard;
  vm.runInNewContext([
    check,
    guard,
    "var guardResult = confirmUnnamed" + (isScript ? "Script" : "Wristband") + "BeforeLibraryLoad();",
  ].join("\n"), sandbox);
  return {
    result: await sandbox.guardResult,
    prompts,
    toasts,
  };
}

function runSharedLocalStatus(actions) {
  const saveStatus = { className: "", textContent: "" };
  const workspaceCalls = [];
  const sandbox = {
    document: {
      getElementById(id) {
        return id === "saveStatus" ? saveStatus : null;
      },
    },
    window: {
      setWorkspaceSyncStatus(channel, state, opts) {
        workspaceCalls.push({ channel, state, opts });
      },
    },
  };
  vm.runInNewContext([
    "var scriptDirty = false;",
    "var wristbandDirty = false;",
    "var localArtifactSaveStates = { script: 'idle', wristband: 'idle', generic: 'idle' };",
    localSaveSource,
    aggregateLocalSaveState,
    updateSaveStatus,
    markScriptDirty,
    markScriptClean,
    markWristbandDirty,
    markWristbandClean,
    actions,
  ].join("\n"), sandbox);
  return { saveStatus, workspaceCalls, sandbox };
}

function runLifecycleFlush({ scriptResult = true, wristbandResult = true } = {}) {
  const calls = [];
  const sandbox = {
    flushPendingScriptAutosaveBeforeWorkspaceChange() {
      calls.push("script");
      return scriptResult;
    },
    flushPendingWristbandAutosaveBeforeWorkspaceChange() {
      calls.push("wristband");
      return wristbandResult;
    },
  };
  vm.runInNewContext([
    lifecycleFlush,
    "var lifecycleResult = flushActiveArtifactAutosavesForLifecycle();",
  ].join("\n"), sandbox);
  return { calls, result: sandbox.lifecycleResult };
}

// Existing named Scripts save their changed contents in place without using
// the version-history helper that is reserved for explicit recovery points.
const savedScript = [{
  id: "script-1",
  name: "August 16 Script",
  plays: [{ id: "old-play" }],
  versions: [{ versionId: "manual-save" }],
  playerVisible: true,
}];
const updatedScript = runScriptAutosave({ records: savedScript, activeId: "script-1" });
assert.equal(updatedScript.result, true, "an active named Script persists automatically");
assert.equal(updatedScript.writes.length, 1, "an active Script produces one local write");
assert.equal(updatedScript.writes[0].key, "savedScripts", "Script autosave writes the canonical library collection");
assert.equal(updatedScript.writes[0].value.length, 1, "Script autosave updates in place instead of appending a copy");
assert.equal(updatedScript.writes[0].value[0].id, "script-1", "Script autosave preserves the active record identity");
assert.equal(updatedScript.writes[0].value[0].name, "August 17 Script", "Script autosave keeps an intentional non-empty rename");
assert.equal(updatedScript.writes[0].value[0].updatedAt, updatedScript.writes[0].value[0].savedAt, "Script autosave advances the record timestamp");
assert.equal(updatedScript.writes[0].value[0].playerPublishedAt, updatedScript.writes[0].value[0].savedAt, "player-visible Script autosaves keep their release timestamp current");
assert.equal(savedScript[0].versions.length, 1, "routine Script autosave does not churn the bounded version archive");
assert.equal(updatedScript.state.finalized, 1, "a successful Script write completes the normal local-first lifecycle");

for (const [label, options] of [
  ["new unnamed script", { records: [], activeId: null }],
  ["missing saved script", { records: [], activeId: "missing" }],
  ["deleted saved script", { records: [{ id: "deleted", name: "Deleted", deletedAt: "2026-08-17T00:00:00.000Z" }], activeId: "deleted" }],
  ["blank saved script title", { records: [{ id: "blank", name: "" }], activeId: "blank" }],
  ["blank editor title", { records: [{ id: "editor-blank", name: "Original" }], activeId: "editor-blank", editorName: "" }],
]) {
  const result = runScriptAutosave(options);
  assert.equal(result.result, false, `${label} cannot be silently saved`);
  assert.equal(result.writes.length, 0, `${label} cannot create or overwrite a Script record`);
  assert.equal(result.state.finalized, 0, `${label} remains dirty instead of claiming a save`);
}

const failedScriptWrite = runScriptAutosave({
  records: [{ id: "write-fail", name: "Original" }],
  activeId: "write-fail",
  setResult: false,
});
assert.equal(failedScriptWrite.result, false, "a failed local Script write does not report success");
assert.equal(failedScriptWrite.state.finalized, 0, "a failed local Script write does not mark the editor clean");

const staleScriptTimer = runScriptAutosave({
  records: [{ id: "script-b", name: "Second Script" }],
  activeId: "script-b",
  expectedId: "script-a",
});
assert.equal(staleScriptTimer.result, null, "a Script timer from another library record becomes a no-op");
assert.equal(staleScriptTimer.writes.length, 0, "a stale Script timer cannot overwrite the newly loaded record");
assert.match(
  scriptPlayer,
  /function loadSavedScriptRecord\([\s\S]*?flushPendingScriptAutosaveBeforeWorkspaceChange/,
  "loading another Script flushes the current named autosave before replacing the editor",
);
assert.match(
  scriptPlayer,
  /async function loadScript\([\s\S]*?await confirmUnnamedScriptBeforeLibraryLoad\(\)[\s\S]*?loadSavedScriptRecord/,
  "a Library Script load asks before replacing unnamed dirty work",
);
assert.match(
  scriptPlayer,
  /async function duplicateSavedScript\([\s\S]*?await confirmUnnamedScriptBeforeLibraryLoad\(/,
  "opening a duplicated Script also protects unnamed dirty work before creating the copy",
);

const savedWristband = [{
  id: "wristband-1",
  title: "Friday Wristband",
  cards: [{ name: "Card 1", data: ["old"] }],
}];
const updatedWristband = runWristbandAutosave({ records: savedWristband, activeId: "wristband-1" });
assert.equal(updatedWristband.result, true, "an active named Wristband persists automatically");
assert.equal(updatedWristband.writes.length, 1, "an active Wristband produces one local write");
assert.equal(updatedWristband.writes[0].key, "savedWristbands", "Wristband autosave writes the canonical library collection");
assert.equal(updatedWristband.writes[0].value.length, 1, "Wristband autosave updates in place instead of appending a copy");
assert.equal(updatedWristband.writes[0].value[0].id, "wristband-1", "Wristband autosave preserves the active record identity");
assert.deepEqual(updatedWristband.state.builds, [{ title: "Friday Wristband", opts: { id: "wristband-1" } }], "Wristband autosave uses the existing title and id without prompting");
assert.equal(updatedWristband.state.finalized, 1, "a successful Wristband write completes the normal local-first lifecycle");

const staleWristbandTimer = runWristbandAutosave({
  records: [{ id: "wristband-b", title: "Second Wristband" }],
  activeId: "wristband-b",
  expectedId: "wristband-a",
});
assert.equal(staleWristbandTimer.result, null, "a Wristband timer from another library record becomes a no-op");
assert.equal(staleWristbandTimer.writes.length, 0, "a stale Wristband timer cannot overwrite the newly loaded record");
assert.match(
  wristbandStorage,
  /function loadWristband\([\s\S]*?flushPendingWristbandAutosaveBeforeWorkspaceChange/,
  "loading another Wristband flushes the current named autosave before replacing the editor",
);
assert.match(
  wristbandStorage,
  /async function loadWristband\([\s\S]*?await confirmUnnamedWristbandBeforeLibraryLoad\(\)[\s\S]*?flushPendingWristbandAutosaveBeforeWorkspaceChange/,
  "a Library Wristband load asks before replacing unnamed dirty work",
);

for (const [label, options] of [
  ["new unnamed wristband", { records: [], activeId: null }],
  ["missing saved wristband", { records: [], activeId: "missing" }],
  ["blank saved wristband title", { records: [{ id: "blank", title: "" }], activeId: "blank" }],
  ["malformed saved wristband collection", { records: { id: "not-an-array" }, activeId: "not-an-array" }],
]) {
  const result = runWristbandAutosave(options);
  assert.equal(result.result, false, `${label} cannot be silently saved`);
  assert.equal(result.writes.length, 0, `${label} cannot create or overwrite a Wristband record`);
  assert.equal(result.state.finalized, 0, `${label} remains dirty instead of claiming a save`);
}

const failedWristbandWrite = runWristbandAutosave({
  records: [{ id: "write-fail", title: "Friday Wristband" }],
  activeId: "write-fail",
  setResult: false,
});
assert.equal(failedWristbandWrite.result, false, "a failed local Wristband write does not report success");
assert.equal(failedWristbandWrite.state.finalized, 0, "a failed local Wristband write does not mark the editor clean");

assert.match(scriptStorage, /const SCRIPT_ACTIVE_SAVE_AUTOSAVE_DEBOUNCE_MS = 800;/, "Script uses a fast dedicated local artifact debounce");
assert.match(wristbandStorage, /const WRISTBAND_ACTIVE_SAVE_AUTOSAVE_DEBOUNCE_MS = 800;/, "Wristband uses a fast dedicated local artifact debounce");
assert.match(scriptStorage, /const SCRIPT_ACTIVE_SAVE_AUTOSAVE_MAX_HOLD_MS = 3500;/, "Script forces a bounded local checkpoint during continuous edits");
assert.match(wristbandStorage, /const WRISTBAND_ACTIVE_SAVE_AUTOSAVE_MAX_HOLD_MS = 3500;/, "Wristband forces a bounded local checkpoint during continuous edits");
assert.match(scriptScheduler, /Math\.min\(SCRIPT_ACTIVE_SAVE_AUTOSAVE_DEBOUNCE_MS, SCRIPT_ACTIVE_SAVE_AUTOSAVE_MAX_HOLD_MS - elapsed\)/, "Script coalesces briefly without deferring a durable write forever");
assert.match(wristbandScheduler, /Math\.min\(WRISTBAND_ACTIVE_SAVE_AUTOSAVE_DEBOUNCE_MS, WRISTBAND_ACTIVE_SAVE_AUTOSAVE_MAX_HOLD_MS - elapsed\)/, "Wristband coalesces briefly without deferring a durable write forever");
assert.match(wristbandBridge, /scheduleActiveWristbandAutosave\(wristbandAutosaveTimer\)/, "all Wristband editor mutations reach the named-record scheduler");
assert.doesNotMatch(scriptAutosave, /markSavedScriptUpdated\(/, "routine Script autosave does not snapshot version history");
assert.doesNotMatch(scriptAutosave, /savedScripts\.push\(|saveScript\(/, "routine Script autosave cannot create a new library entry");
assert.doesNotMatch(wristbandAutosave, /saved\.push\(|saveWristband(?:As)?\(/, "routine Wristband autosave cannot create a new library entry");

for (const type of ["script", "wristband"]) {
  const named = await runUnnamedLibraryGuard({ type, dirty: true, hasDestination: true });
  assert.equal(named.result, true, `a named dirty ${type} stays on the fast automatic load path`);
  assert.equal(named.prompts.length, 0, `a named dirty ${type} does not show a handoff prompt`);

  const clean = await runUnnamedLibraryGuard({ type, dirty: false, hasDestination: false });
  assert.equal(clean.result, true, `a clean unnamed ${type} can load from Library without a prompt`);
  assert.equal(clean.prompts.length, 0, `a clean unnamed ${type} does not show a handoff prompt`);

  const keep = await runUnnamedLibraryGuard({ type, dirty: true, hasDestination: false, choice: "keep" });
  assert.equal(keep.result, false, `Keep locally cancels the ${type} Library replacement`);
  assert.equal(keep.prompts.length, 1, `unnamed dirty ${type} work gets an explicit choice`);
  assert.deepEqual(
    Array.from(keep.prompts[0].opts.choices, (entry) => entry.label),
    ["Keep locally", "Discard & Load", "Cancel"],
    `${type} handoff uses the safe keep/discard/cancel choices`,
  );
  assert.equal(keep.toasts.length, 1, `keeping unnamed ${type} work confirms it remains open`);

  const discard = await runUnnamedLibraryGuard({ type, dirty: true, hasDestination: false, choice: "discard" });
  assert.equal(discard.result, true, `Discard & Load permits the selected ${type} to replace unnamed work`);
  assert.equal(discard.toasts.length, 0, `discarding unnamed ${type} work does not imply it was saved`);

  const cancelled = await runUnnamedLibraryGuard({ type, dirty: true, hasDestination: false, choice: "cancel" });
  assert.equal(cancelled.result, false, `Cancel leaves unnamed ${type} work in place`);
  assert.equal(cancelled.toasts.length, 0, `Cancel does not imply unnamed ${type} work was saved or discarded`);
}
assert.doesNotMatch(scriptUnnamedGuard, /saveScript\(|storageManager|persistDraftData/, "Script handoff never creates a surprise library or recovery record");
assert.doesNotMatch(wristbandUnnamedGuard, /saveWristband(?:As)?\(|storageManager|persistDraftData/, "Wristband handoff never creates a surprise library or recovery record");

const wristbandStillDirty = runSharedLocalStatus("markWristbandDirty(); markScriptClean();");
assert.equal(wristbandStillDirty.saveStatus.textContent, "● Unsaved", "a clean Script cannot mask unsaved Wristband work");
assert.deepEqual(
  JSON.parse(JSON.stringify(wristbandStillDirty.workspaceCalls.at(-1))),
  { channel: "local", state: "dirty", opts: { label: "Unsaved local changes" } },
  "the shared workspace status stays dirty while Wristband work remains unsaved",
);

const scriptStillDirty = runSharedLocalStatus("markScriptDirty(); markWristbandClean();");
assert.equal(scriptStillDirty.saveStatus.textContent, "● Unsaved", "a clean Wristband cannot mask unsaved Script work");

const savingAfterOtherEditor = runSharedLocalStatus("updateSaveStatus('saving', 'script'); markWristbandDirty(); markWristbandClean();");
assert.equal(savingAfterOtherEditor.saveStatus.textContent, "⏳ Saving…", "a separate clean editor cannot replace an in-progress Script autosave with Saved");
assert.deepEqual(
  JSON.parse(JSON.stringify(savingAfterOtherEditor.workspaceCalls.at(-1))),
  { channel: "local", state: "saving", opts: { label: "Saving workspace..." } },
  "the shared workspace status accurately retains the active Script save");

const lifecycleSuccess = runLifecycleFlush();
assert.deepEqual(lifecycleSuccess.calls, ["script", "wristband"], "background lifecycle flushes both named artifact destinations");
assert.equal(lifecycleSuccess.result, true, "both successful local lifecycle flushes report success");
const lifecycleFailure = runLifecycleFlush({ wristbandResult: false });
assert.equal(lifecycleFailure.result, false, "a failed local lifecycle flush never reports a safe checkpoint");
assert.match(appSession, /visibilityState === "hidden"[\s\S]*?flushActiveArtifactAutosavesForLifecycle\(\)/, "backgrounding iPad flushes named artifact autosaves before suspension");
assert.match(appSession, /pagehide[\s\S]*?flushActiveArtifactAutosavesForLifecycle\(\)/, "pagehide repeats the local durability checkpoint for iPad termination paths");
assert.match(appSession, /bc-auth-context-changed[\s\S]*?resetActiveScriptIdentity\(\)[\s\S]*?resetActiveWristbandIdentity\(\)/, "account changes cancel prior editor destinations before clearing dirty state");
assert.match(auth, /async function logoutAuth\(\)[\s\S]*?flushActiveArtifactAutosavesForLifecycle\(\)[\s\S]*?fetch\("\/auth\/logout"/, "sign-out flushes the current named artifact before its secure session is removed");
assert.match(auth, /function handleExpiredServerSession[\s\S]*?flushActiveArtifactAutosavesForLifecycle\(\)/, "session expiry performs the same local checkpoint before the workspace locks");

console.log("named artifact autosave contract: fast bounded local persistence and cross-artifact safety passed");
