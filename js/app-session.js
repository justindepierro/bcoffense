// App session state helpers: draft restore gating, dirty flags, and unload protection.

let scriptDirty = false;
let wristbandDirty = false;
const draftRestoreChecksRun = new Set();
const draftRestoreChecksPending = new Set();

function runDraftRestoreCheckForTab(tabName) {
  const tabDraftCheckMap = {
    script: window.checkScriptDraft,
    wristband: window.checkWristbandDraft,
    callsheet: window.checkCallSheetDraft,
    tendencies: window.checkTendenciesDraft,
  };

  const draftCheck = tabDraftCheckMap[tabName];
  if (typeof draftCheck !== "function") return;
  if (
    draftRestoreChecksRun.has(tabName) ||
    draftRestoreChecksPending.has(tabName)
  ) {
    return;
  }

  draftRestoreChecksPending.add(tabName);
  Promise.resolve()
    .then(() => draftCheck())
    .catch((err) => {
      console.error(`draft restore check failed for ${tabName}:`, err);
    })
    .finally(() => {
      draftRestoreChecksPending.delete(tabName);
      draftRestoreChecksRun.add(tabName);
    });
}

function markScriptDirty() {
  scriptDirty = true;
  updateSaveStatus("unsaved");
}

function markScriptClean() {
  scriptDirty = false;
  updateSaveStatus("saved");
}

function markWristbandDirty() {
  wristbandDirty = true;
  updateSaveStatus("unsaved");
}

function markWristbandClean() {
  wristbandDirty = false;
  updateSaveStatus("saved");
}

window.addEventListener("beforeunload", (e) => {
  if (scriptDirty || wristbandDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});