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
  if (typeof updateScriptArtifactStatus === "function") updateScriptArtifactStatus();
}

function markScriptClean() {
  scriptDirty = false;
  updateSaveStatus("saved");
  if (typeof updateScriptArtifactStatus === "function") updateScriptArtifactStatus();
}

function markWristbandDirty() {
  wristbandDirty = true;
  updateSaveStatus("unsaved");
  if (typeof updateWristbandSaveChrome === "function") {
    updateWristbandSaveChrome();
  }
}

function markWristbandClean() {
  wristbandDirty = false;
  updateSaveStatus("saved");
  if (typeof updateWristbandSaveChrome === "function") {
    updateWristbandSaveChrome();
  }
}

// One completion boundary for normal artifact Save actions. Storage remains
// module-owned, but clean state, draft retirement, and revision tracking do
// not drift among the coach workspaces.
function completeArtifactSaveLifecycle(type, opts = {}) {
  const artifact = String(type || "");
  if (artifact === "script" && opts.markClean !== false) markScriptClean();
  if (artifact === "wristband" && opts.markClean !== false) markWristbandClean();
  if (opts.discardDraftKey && typeof discardDraftData === "function") discardDraftData(opts.discardDraftKey);
  if (opts.recordModified !== false && typeof recordArtifactModified === "function") recordArtifactModified(artifact);
  return artifact;
}

window.addEventListener("beforeunload", (e) => {
  const workspaceSyncPending =
    typeof window.hasWorkspaceSyncWork === "function" &&
    window.hasWorkspaceSyncWork();
  if (scriptDirty || wristbandDirty || workspaceSyncPending) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// Item 33: re-render player dashboard when the page returns to foreground
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (document.body?.getAttribute("data-auth-role") !== "player") return;
  if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
});
