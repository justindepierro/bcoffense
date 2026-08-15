// App session state helpers: draft restore gating, dirty flags, and unload protection.

let scriptDirty = false;
let wristbandDirty = false;
const draftRestoreChecksRun = new Set();
const draftRestoreChecksPending = new Set();

// Legacy per-tab drafts were allowed to overwrite the current primary record
// during normal startup. Recovery must be an explicit review operation, never
// an automatic prompt that competes with today's saved workspace.
const LEGACY_DRAFT_AUTO_RESTORE_ENABLED = false;

// These records predate the current save/publish lifecycle. They are kept
// only as quarantined evidence until a coach reviews or discards them; they
// must never be applied by startup, tab navigation, or an autosave callback.
const LEGACY_RECOVERY_DRAFTS = [
  { key: "SCRIPT_DRAFT", label: "Practice Script", icon: "📋" },
  { key: "WRISTBAND_DRAFT", label: "Wristband", icon: "🃏" },
  { key: "CALLSHEET_DRAFT", label: "Call Sheet", icon: "📞" },
  { key: "TENDENCIES_DRAFT", label: "Opponent Scout", icon: "📊" },
];

function legacyRecoveryDraftSummary(key, draft) {
  if (key === "SCRIPT_DRAFT") {
    const plays = Array.isArray(draft?.plays)
      ? draft.plays.filter((item) => !item?.isSeparator).length
      : 0;
    return `${plays} play${plays === 1 ? "" : "s"}${draft?.name ? ` · ${draft.name}` : ""}`;
  }
  if (key === "WRISTBAND_DRAFT") {
    const cards = Array.isArray(draft?.cards) ? draft.cards : [];
    const plays = cards.reduce((total, card) => total + (Array.isArray(card?.data)
      ? card.data.filter((play) => play !== null).length
      : 0), 0);
    return `${plays} play${plays === 1 ? "" : "s"} across ${cards.length} card${cards.length === 1 ? "" : "s"}`;
  }
  if (key === "CALLSHEET_DRAFT") {
    const categories = Object.values(draft?.callSheet || {}).filter((bucket) =>
      Array.isArray(bucket?.left) || Array.isArray(bucket?.right),
    );
    const indexCards = Array.isArray(draft?.settings?.indexCards)
      ? draft.settings.indexCards.length
      : 0;
    return `${categories.length} category record${categories.length === 1 ? "" : "s"}${indexCards ? ` · ${indexCards} index card${indexCards === 1 ? "" : "s"}` : ""}`;
  }
  if (key === "TENDENCIES_DRAFT") {
    const filled = Object.values(draft?.play || {}).filter((value) =>
      typeof value === "string" ? value.trim() : Boolean(value),
    ).length;
    return `${filled} filled field${filled === 1 ? "" : "s"}`;
  }
  return "Legacy browser draft";
}

function getLegacyRecoveryCandidates() {
  if (typeof storageManager === "undefined" || typeof STORAGE_KEYS === "undefined") return [];
  return LEGACY_RECOVERY_DRAFTS.map((entry) => {
    const storageKey = STORAGE_KEYS[entry.key];
    const draft = storageKey ? storageManager.get(storageKey, null) : null;
    if (!draft || typeof draft !== "object" || !getDraftTimestamp(draft)) return null;
    return {
      ...entry,
      storageKey,
      draft,
      expired: isDraftExpired(draft),
      savedAt: formatDraftSavedAt(draft, undefined, {
        fallback: "unknown time",
        formatOptions: { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
      }),
      summary: legacyRecoveryDraftSummary(entry.key, draft),
    };
  }).filter(Boolean);
}

function closeRecoveryCenter() {
  const overlay = document.getElementById("recoveryCenterOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 160);
}

function discardLegacyRecoveryCandidate(key) {
  const candidate = getLegacyRecoveryCandidates().find((item) => item.key === key);
  if (!candidate) return;
  discardDraftData(candidate.storageKey);
  openRecoveryCenter();
  if (typeof showToast === "function") showToast(`${candidate.label} legacy draft discarded.`, { type: "success" });
}

function discardAllLegacyRecoveryCandidates() {
  const candidates = getLegacyRecoveryCandidates();
  candidates.forEach((candidate) => discardDraftData(candidate.storageKey));
  openRecoveryCenter();
  if (typeof showToast === "function") showToast("Legacy recovery drafts discarded.", { type: "success" });
}

function openRecoveryCenter() {
  closeRecoveryCenter();
  const candidates = getLegacyRecoveryCandidates();
  const overlay = document.createElement("div");
  overlay.id = "recoveryCenterOverlay";
  overlay.className = "custom-modal-overlay";
  overlay.setAttribute("data-action", "closeRecoveryCenterOverlay");
  const candidateMarkup = candidates.length
    ? candidates.map((candidate) => `
      <article class="cloud-sync-flow-card" style="align-items:flex-start; gap:6px;">
        <div><span>${candidate.icon} ${escapeHtml(candidate.label)}</span><strong>${escapeHtml(candidate.summary)}</strong></div>
        <small>Saved locally ${escapeHtml(candidate.savedAt)}${candidate.expired ? " · older than the 24-hour recovery window" : ""}</small>
        <small>This is a legacy browser-only snapshot. It is quarantined and cannot overwrite the current workspace.</small>
        <button type="button" class="btn btn-secondary custom-modal-btn" data-action="discardLegacyRecoveryCandidate" data-arg="${escapeHtml(candidate.key)}">Discard this draft</button>
      </article>
    `).join("")
    : `<div class="cloud-sync-modal-status cloud-sync-modal-status-info">No legacy recovery drafts are stored on this device.</div>`;
  overlay.innerHTML = `
    <div class="custom-modal custom-modal-wide cloud-sync-modal" role="dialog" aria-modal="true" aria-labelledby="recoveryCenterTitle">
      <div class="custom-modal-header"><span class="custom-modal-icon">🛟</span><h3 class="custom-modal-title" id="recoveryCenterTitle">Review Legacy Recovery</h3></div>
      <div class="custom-modal-body cloud-sync-body">
        <p>These are old, device-only draft records from the retired per-tab recovery system. They do not have a trusted base revision, so restoring one could replace newer work.</p>
        <p class="cloud-sync-warning">They are review-and-discard only. Current recovery uses saved libraries and immutable cloud history—for example, an Index Card can be recovered from its own card menu without touching the rest of the Call Sheet.</p>
        <div class="cloud-sync-flow-grid" aria-label="Legacy recovery candidates">${candidateMarkup}</div>
      </div>
      <div class="custom-modal-actions cloud-sync-actions">
        <button type="button" class="btn custom-modal-btn custom-modal-cancel" data-action="closeRecoveryCenter">Close</button>
        ${candidates.length ? '<button type="button" class="btn btn-secondary custom-modal-btn" data-action="discardAllLegacyRecoveryCandidates">Discard all legacy drafts</button>' : ""}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  overlay.querySelector("button")?.focus();
}

function runDraftRestoreCheckForTab(tabName) {
  if (!LEGACY_DRAFT_AUTO_RESTORE_ENABLED) {
    draftRestoreChecksRun.add(tabName);
    return;
  }

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
  updateSaveStatus("unsaved", "script");
  if (typeof updateScriptArtifactStatus === "function") updateScriptArtifactStatus();
}

function markScriptClean() {
  scriptDirty = false;
  updateSaveStatus("saved", "script");
  if (typeof updateScriptArtifactStatus === "function") updateScriptArtifactStatus();
}

function markWristbandDirty() {
  wristbandDirty = true;
  updateSaveStatus("unsaved", "wristband");
  if (typeof updateWristbandSaveChrome === "function") {
    updateWristbandSaveChrome();
  }
}

function markWristbandClean() {
  wristbandDirty = false;
  updateSaveStatus("saved", "wristband");
  if (typeof updateWristbandSaveChrome === "function") {
    updateWristbandSaveChrome();
  }
}

// Script and Wristband editor state is intentionally browser-local, but its
// dirty flags are only meaningful for the authenticated workspace that set
// them.  A secure account transition already resets the sync queue; clear
// these volatile flags as well so Team B never inherits Team A's save warning
// while its own workspace is being hydrated.
window.addEventListener("bc-auth-context-changed", () => {
  // A debounce belongs to the prior authenticated workspace. Never let its
  // callback write after a shared-device account or team transition.
  if (typeof resetActiveScriptIdentity === "function") resetActiveScriptIdentity();
  if (typeof resetActiveWristbandIdentity === "function") resetActiveWristbandIdentity();
  scriptDirty = false;
  wristbandDirty = false;
});

// iPadOS can freeze or terminate a backgrounded page without a reliable
// beforeunload turn. Named artifacts already have an exact local destination,
// so make their pending short debounce durable as soon as the page leaves the
// foreground. Unnamed work remains explicitly dirty because it has no safe
// automatic destination.
function flushActiveArtifactAutosavesForLifecycle() {
  const scriptFlushed = typeof flushPendingScriptAutosaveBeforeWorkspaceChange !== "function" ||
    flushPendingScriptAutosaveBeforeWorkspaceChange();
  const wristbandFlushed = typeof flushPendingWristbandAutosaveBeforeWorkspaceChange !== "function" ||
    flushPendingWristbandAutosaveBeforeWorkspaceChange();
  return Boolean(scriptFlushed && wristbandFlushed);
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
  if (document.visibilityState === "hidden") {
    flushActiveArtifactAutosavesForLifecycle();
    return;
  }
  if (document.visibilityState !== "visible") return;
  if (document.body?.getAttribute("data-auth-role") !== "player") return;
  if (typeof renderPlayerDashboardHome === "function") renderPlayerDashboardHome();
});

window.addEventListener("pagehide", () => {
  flushActiveArtifactAutosavesForLifecycle();
}, { passive: true });
