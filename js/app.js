// Main application logic for Practice Script & Playbook

// Global state
let plays = [];
let script = [];
let scriptWristband = null;
let filteredPlays = [];

// Dirty tracking — marks when working data has unsaved changes
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

/**
 * Mark the working script as having unsaved changes
 */
function markScriptDirty() {
  scriptDirty = true;
  updateSaveStatus("unsaved");
}

/**
 * Mark the working script as clean (just saved or freshly loaded)
 */
function markScriptClean() {
  scriptDirty = false;
  updateSaveStatus("saved");
}

/**
 * Mark the working wristband as having unsaved changes
 */
function markWristbandDirty() {
  wristbandDirty = true;
  updateSaveStatus("unsaved");
}

/**
 * Mark the working wristband as clean
 */
function markWristbandClean() {
  wristbandDirty = false;
  updateSaveStatus("saved");
}

// Warn before closing tab with unsaved work
window.addEventListener("beforeunload", (e) => {
  if (scriptDirty || wristbandDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/**
 * Show a specific tab panel
 * @param {string} tabName - Name of the tab to show
 */
// Tab name → index map (single source of truth)
const TAB_INDEX_MAP = {
  playbook: 0,
  script: 1,
  wristband: 2,
  tendencies: 3,
  callsheet: 4,
  installation: 5,
  offensebuilder: 6,
  dashboard: 7,
};

function showTab(tabName) {
  // Track active tab for help panel
  currentActiveTab = tabName;

  // Hide all panels
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));

  // Show selected panel
  document.getElementById(tabName).classList.add("active");

  // Update tab buttons
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((t) => {
    t.classList.remove("active");
    t.setAttribute("aria-selected", "false");
  });
  const idx = TAB_INDEX_MAP[tabName];
  if (idx !== undefined && tabs[idx]) {
    tabs[idx].classList.add("active");
    tabs[idx].setAttribute("aria-selected", "true");
  }

  // Initialize tab-specific content
  if (tabName === "installation") {
    initInstallation();
  } else if (tabName === "wristband") {
    if (wristbandCards.length === 0) {
      initWristband();
    } else {
      populateWristbandCheckboxFilters();
      renderWristbandPlays();
      renderCardTabs();
    }
  } else if (tabName === "tendencies") {
    initTendencies();
  } else if (tabName === "callsheet") {
    if (Object.keys(callSheet).length === 0) {
      initCallSheet();
    }
    renderCallSheet();
  } else if (tabName === "offensebuilder") {
    initOffenseBuilder();
  } else if (tabName === "dashboard") {
    renderDashboard();
  }

  runDraftRestoreCheckForTab(tabName);

  // Update browser tab title to reflect current module
  const TAB_TITLES = {
    playbook: "Playbook",
    script: "Script Builder",
    wristband: "Wristband",
    tendencies: "Tendencies",
    callsheet: "Call Sheet",
    installation: "Installation",
    offensebuilder: "Offense Builder",
    dashboard: "Dashboard",
  };
  document.title = `${TAB_TITLES[tabName] || tabName} — Practice Script & Playbook`;

  // Remember last active tab (skip installation — not a "real" tab to restore to)
  if (tabName !== "installation") {
    storageManager.set(STORAGE_KEYS.LAST_ACTIVE_TAB, tabName);
  }
}

// ============ Floating Help Panel ============

let currentActiveTab = "playbook";

function toggleHelpPanel() {
  const overlay = document.getElementById("helpOverlay");
  const fab = document.getElementById("helpFab");
  if (!overlay) return;
  const isOpen = overlay.classList.contains("visible");
  if (isOpen) {
    overlay.classList.remove("visible");
    fab.classList.remove("help-fab-active");
  } else {
    renderHelpContent();
    overlay.classList.add("visible");
    fab.classList.add("help-fab-active");
  }
}

function closeHelpPanel(e) {
  if (e.target === e.currentTarget) toggleHelpPanel();
}

function renderHelpContent() {
  const title = document.getElementById("helpPanelTitle");
  const body = document.getElementById("helpPanelBody");
  if (!body) return;

  const helpData = getHelpDataForTab(currentActiveTab);
  title.textContent = helpData.title;

  let html = "";
  helpData.sections.forEach((sec) => {
    html += `<div class="help-section">`;
    html += `<div class="help-section-title">${sec.icon} ${sec.name}</div>`;
    html += `<div class="help-items">`;
    sec.items.forEach((item) => {
      const keyHtml = item.key
        ? `<span class="help-key">${item.key}</span>`
        : "";
      html += `<div class="help-item">${keyHtml}<span class="help-desc">${item.desc}</span></div>`;
    });
    html += `</div></div>`;
  });
  body.innerHTML = html;
}

// getHelpDataForTab() lives in js/help.js

/**
 * Show the upload section to load a new CSV
 */
function showUpload() {
  document.getElementById("mainApp").classList.add("hidden");
  document.getElementById("uploadSection").classList.remove("hidden");

  // Show back button if we have data
  const backBtn = document.getElementById("backToAppBtn");
  if (backBtn && plays.length > 0) {
    backBtn.classList.remove("hidden");
  }
}

/**
 * Go back to the main app from upload screen
 */
function backToApp() {
  if (plays.length > 0) {
    document.getElementById("uploadSection").classList.add("hidden");
    document.getElementById("mainApp").classList.remove("hidden");
  }
}

/**
 * Handle CSV file upload
 * @param {Event} event - File input change event
 */
/**
 * Shared initialization for all modules after playbook data is loaded.
 * Called by both handleFileUpload() and initApp().
 */
function initAllModules() {
  // Show skeleton loading in playbook table while data loads
  const _tbody = document.querySelector("#playbookTable tbody");
  if (_tbody && _tbody.children.length === 0) {
    _tbody.innerHTML = Array(8)
      .fill('<tr><td colspan="10"><div class="skeleton-row"></div></td></tr>')
      .join("");
  }

  // ── Critical path: render the visible UI ──
  populateFilters();
  initChipListeners();
  if (typeof initPlaybookSearch === "function") initPlaybookSearch();
  restoreColumnVisibility();
  filterPlays();

  // ── Deferred: non-blocking init for secondary features ──
  const _idle =
    typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (cb) => setTimeout(cb, 50);

  _idle(
    () => {
      initCollections();
      initPlaybookKeyboard();
      updateStatsBar();
      renderAvailablePlays();
      loadSavedScriptsList();
      populateScriptWristbandSelect();
      restoreScriptDisplayOptions();
      ensureFirstPeriod();
      renderScript();

      // Load call sheet data if stored
      const storedCallSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
      if (storedCallSheet) {
        callSheet = storedCallSheet;
      }

      // Update tab badge counts
      updateTabBadges();
    },
    { timeout: 2000 },
  );
}

// ── Smart CSV Merge System ──────────────────────────────────────

/** All 41 play CSV field keys */
const _MERGE_FIELDS = [
  "type",
  "personnel",
  "formation",
  "formTag1",
  "formTag2",
  "under",
  "back",
  "shift",
  "motion",
  "protection",
  "lineCall",
  "play",
  "playTag1",
  "playTag2",
  "basePlay",
  "oneWord",
  "preferredSituation",
  "preferredDown",
  "preferredDistance",
  "preferredHash",
  "preferredFieldPosition",
  "tempo",
  "practiceFront",
  "practiceDefense",
  "practiceCoverage",
  "practiceBlitz",
  "practiceStunt",
  "keyPlayer1",
  "keyPlayer2",
  "keyPlayer3",
  "keyPlayerName1",
  "keyPlayerName2",
  "keyPlayerName3",
  "constraint1",
  "constraint2",
  "constraint3",
  "hitChart1",
  "hitChart2",
  "hitChart3",
  "deadVs",
  "opponent",
  "notes",
];

/** Script-item fields to preserve during reference update */
const _MERGE_KEEP = new Set([
  "reps",
  "notes",
  "hash",
  "defFront",
  "defCoverage",
  "defStunt",
  "defBlitz",
  "id",
  "isSeparator",
  "label",
  "isBlank",
]);

/** Partial match key: formation + play (case-insensitive) */
function _mKey(p) {
  return (
    (p.formation || "").toLowerCase().trim() +
    "\0" +
    (p.play || "").toLowerCase().trim()
  );
}

/** Full match key: type + personnel + formation + play */
function _mFullKey(p) {
  return (
    (p.type || "").toLowerCase().trim() +
    "\0" +
    (p.personnel || "").toLowerCase().trim() +
    "\0" +
    (p.formation || "").toLowerCase().trim() +
    "\0" +
    (p.play || "").toLowerCase().trim()
  );
}

/**
 * Smart merge: match new CSV plays against existing playbook.
 * Pass 1 — exact key (type+personnel+formation+play)
 * Pass 2 — partial key (formation+play) for remaining
 * Matched plays get all fields updated from the new CSV.
 * Unmatched existing plays are kept. New plays are appended.
 * @param {Array} existing - Current playbook
 * @param {Array} incoming - Newly parsed CSV plays
 * @returns {{ merged: Array, report: Object }}
 */
function _smartMerge(existing, incoming) {
  const eMatched = new Uint8Array(existing.length);
  const nMatched = new Uint8Array(incoming.length);
  const pairs = [];

  // Pass 1: exact key (type + personnel + formation + play)
  const byFull = new Map();
  existing.forEach((p, i) => {
    const k = _mFullKey(p);
    if (!byFull.has(k)) byFull.set(k, []);
    byFull.get(k).push(i);
  });
  incoming.forEach((np, ni) => {
    const k = _mFullKey(np);
    const cands = byFull.get(k);
    if (!cands) return;
    for (const ei of cands) {
      if (!eMatched[ei]) {
        eMatched[ei] = 1;
        nMatched[ni] = 1;
        pairs.push({ ei, ni });
        break;
      }
    }
  });

  // Pass 2: partial key (formation + play) for remaining
  const byPart = new Map();
  existing.forEach((p, i) => {
    if (eMatched[i]) return;
    const k = _mKey(p);
    if (!byPart.has(k)) byPart.set(k, []);
    byPart.get(k).push(i);
  });
  incoming.forEach((np, ni) => {
    if (nMatched[ni]) return;
    const k = _mKey(np);
    const cands = byPart.get(k);
    if (!cands) return;
    for (const ei of cands) {
      if (!eMatched[ei]) {
        eMatched[ei] = 1;
        nMatched[ni] = 1;
        pairs.push({ ei, ni });
        break;
      }
    }
  });

  // Classify matches
  const updated = [];
  const unchanged = [];
  for (const pr of pairs) {
    const op = existing[pr.ei],
      np = incoming[pr.ni];
    const changes = [];
    for (const f of _MERGE_FIELDS) {
      const ov = (op[f] || "").trim(),
        nv = (np[f] || "").trim();
      if (ov !== nv) changes.push({ field: f, from: ov, to: nv });
    }
    (changes.length ? updated : unchanged).push({ ...pr, changes: changes });
  }

  const added = [];
  incoming.forEach((_, ni) => {
    if (!nMatched[ni]) added.push(ni);
  });
  const removed = [];
  existing.forEach((_, ei) => {
    if (!eMatched[ei]) removed.push(ei);
  });

  // Build merged array: copy existing, apply updates, append new
  const merged = existing.map((p) => ({ ...p }));
  for (const u of updated) {
    const t = merged[u.ei],
      s = incoming[u.ni];
    for (const f of _MERGE_FIELDS) t[f] = s[f] || "";
  }
  const addedPlays = added.map((ni) => ({ ...incoming[ni] }));
  merged.push(...addedPlays);

  return {
    merged,
    report: {
      updated,
      unchanged,
      added,
      removed,
      addedPlays,
      removedPlays: removed.map((i) => existing[i]),
      totalExisting: existing.length,
      totalNew: incoming.length,
      totalMerged: merged.length,
    },
  };
}

/**
 * Update play references in saved wristbands, scripts, and call sheet
 * so they reflect the field changes from the merge.
 * @param {Array} existing - Pre-merge playbook
 * @param {Array} incoming - New CSV plays
 * @param {Object} report  - Report from _smartMerge
 * @returns {{ wristbands: number, scripts: number, callsheet: number }}
 */
function _mergeUpdateRefs(existing, incoming, report) {
  if (report.updated.length === 0) {
    return { wristbands: 0, scripts: 0, callsheet: 0 };
  }

  // Build update lookup keyed by partial key for fast matching
  const ups = report.updated.map((u) => ({
    old: existing[u.ei],
    nw: incoming[u.ni],
  }));
  const upsByKey = new Map();
  for (const u of ups) {
    const k = _mKey(u.old);
    if (!upsByKey.has(k)) upsByKey.set(k, []);
    upsByKey.get(k).push(u);
  }

  let wbCount = 0,
    scCount = 0,
    csCount = 0;

  /** Try to update a play-object reference (wristband / callsheet) */
  function applyUpdate(ref) {
    const k = _mKey(ref);
    const cands = upsByKey.get(k);
    if (!cands) return false;
    for (const c of cands) {
      if (playsMatch(ref, c.old)) {
        for (const f of _MERGE_FIELDS) ref[f] = c.nw[f] || "";
        return true;
      }
    }
    return false;
  }

  /** Same but preserves script-specific metadata fields */
  function applyScriptUpdate(ref) {
    const k = _mKey(ref);
    const cands = upsByKey.get(k);
    if (!cands) return false;
    for (const c of cands) {
      if (playsMatch(ref, c.old)) {
        for (const f of _MERGE_FIELDS) {
          if (!_MERGE_KEEP.has(f)) ref[f] = c.nw[f] || "";
        }
        return true;
      }
    }
    return false;
  }

  // ── Saved wristbands ──
  const savedWB = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  let wbDirty = false;
  for (const wb of savedWB) {
    if (!wb.cards) continue;
    for (const card of wb.cards) {
      if (!card.data) continue;
      for (let i = 0; i < card.data.length; i++) {
        if (card.data[i] && applyUpdate(card.data[i])) {
          wbCount++;
          wbDirty = true;
        }
      }
    }
  }
  if (wbDirty) storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, savedWB);

  // Active wristband cards (in-memory)
  if (typeof wristbandCards !== "undefined" && Array.isArray(wristbandCards)) {
    for (const card of wristbandCards) {
      if (!card.data) continue;
      for (let i = 0; i < card.data.length; i++) {
        if (card.data[i] && applyUpdate(card.data[i])) wbCount++;
      }
    }
  }

  // ── Saved scripts ──
  const savedSC = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  let scDirty = false;
  for (const sc of savedSC) {
    if (!sc.plays) continue;
    for (const item of sc.plays) {
      if (item.isSeparator || item.isBlank) continue;
      if (applyScriptUpdate(item)) {
        scCount++;
        scDirty = true;
      }
    }
  }
  if (scDirty) storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedSC);

  // Active script (in-memory)
  if (typeof script !== "undefined" && Array.isArray(script)) {
    for (const item of script) {
      if (item.isSeparator || item.isBlank) continue;
      if (applyScriptUpdate(item)) scCount++;
    }
  }

  // ── Call sheet (stored) ──
  const savedCS = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
  let csDirty = false;
  if (savedCS) {
    for (const catId of Object.keys(savedCS)) {
      const bucket = savedCS[catId];
      for (const side of ["left", "right"]) {
        if (!bucket[side]) continue;
        for (const p of bucket[side]) {
          if (applyUpdate(p)) {
            csCount++;
            csDirty = true;
          }
        }
      }
    }
    if (csDirty) {
      storageManager.set(STORAGE_KEYS.CALL_SHEET, savedCS);
      callSheet = savedCS;
    }
  }

  // Call sheet in-memory (if not already synced from stored)
  if (!csDirty && typeof callSheet !== "undefined" && callSheet) {
    for (const catId of Object.keys(callSheet)) {
      const bucket = callSheet[catId];
      for (const side of ["left", "right"]) {
        if (!bucket[side]) continue;
        for (const p of bucket[side]) {
          if (applyUpdate(p)) csCount++;
        }
      }
    }
  }

  return { wristbands: wbCount, scripts: scCount, callsheet: csCount };
}

/**
 * Build HTML for the merge report modal.
 * @returns {string} HTML content
 */
function _buildMergeReportHtml(report, refCounts, existingPlays) {
  const { updated, unchanged, added, removed, addedPlays, removedPlays } =
    report;

  let h = '<div class="merge-report">';

  // Summary grid
  h += '<div class="merge-report-grid">';
  h += `<span>🔄</span><span><strong>${updated.length}</strong> play${updated.length !== 1 ? "s" : ""} updated</span>`;
  h += `<span>➕</span><span><strong>${added.length}</strong> new play${added.length !== 1 ? "s" : ""} added</span>`;
  h += `<span>📌</span><span><strong>${unchanged.length}</strong> play${unchanged.length !== 1 ? "s" : ""} unchanged</span>`;
  if (removed.length > 0) {
    h += `<span>📁</span><span><strong>${removed.length}</strong> play${removed.length !== 1 ? "s" : ""} only in old playbook (kept)</span>`;
  }
  h += "</div>";

  // Reference update counts
  const totalRefs =
    refCounts.wristbands + refCounts.scripts + refCounts.callsheet;
  if (totalRefs > 0) {
    h += '<div class="merge-report-section">';
    h += `<strong>🔗 ${totalRefs} reference${totalRefs !== 1 ? "s" : ""} updated:</strong><br>`;
    const parts = [];
    if (refCounts.wristbands)
      parts.push(`${refCounts.wristbands} in wristbands`);
    if (refCounts.scripts) parts.push(`${refCounts.scripts} in scripts`);
    if (refCounts.callsheet) parts.push(`${refCounts.callsheet} in call sheet`);
    h += "&nbsp;&nbsp;" + parts.join(", ");
    h += "</div>";
  }

  // Expandable detail: updated plays
  if (updated.length > 0) {
    h += '<details class="merge-report-details"><summary class="merge-report-summary">Updated plays</summary>';
    h += '<div class="merge-report-list merge-report-list--tall">';
    const show = updated.slice(0, 20);
    for (const u of show) {
      const p = existingPlays[u.ei];
      const name = (p.formation || "?") + " " + (p.play || "?");
      const flds = u.changes
        .slice(0, 4)
        .map((c) => c.field)
        .join(", ");
      const more = u.changes.length > 4 ? ", …" : "";
      h += `<div class="merge-report-row">• <strong>${escapeHtml(name)}</strong> — ${u.changes.length} field${u.changes.length !== 1 ? "s" : ""} <span class="merge-report-muted">(${escapeHtml(flds)}${more})</span></div>`;
    }
    if (updated.length > 20)
      h += `<div class="merge-report-muted">…and ${updated.length - 20} more</div>`;
    h += "</div></details>";
  }

  // Expandable detail: added plays
  if (added.length > 0) {
    h += '<details class="merge-report-details"><summary class="merge-report-summary">New plays added</summary>';
    h += '<div class="merge-report-list merge-report-list--medium">';
    const show = addedPlays.slice(0, 20);
    for (const p of show) {
      h += `<div class="merge-report-row">• ${escapeHtml((p.formation || "?") + " " + (p.play || "?"))} (${escapeHtml(p.type || "?")})</div>`;
    }
    if (added.length > 20)
      h += `<div class="merge-report-muted">…and ${added.length - 20} more</div>`;
    h += "</div></details>";
  }

  // Expandable detail: removed / orphaned plays
  if (removed.length > 0) {
    h += '<details class="merge-report-details"><summary class="merge-report-summary">Plays only in old playbook</summary>';
    h += '<div class="merge-report-list merge-report-list--medium">';
    h += '<div class="merge-report-muted-gap">These plays were not in the new CSV but have been kept in your playbook.</div>';
    const show = removedPlays.slice(0, 20);
    for (const p of show) {
      h += `<div class="merge-report-row">• ${escapeHtml((p.formation || "?") + " " + (p.play || "?"))} (${escapeHtml(p.type || "?")})</div>`;
    }
    if (removed.length > 20)
      h += `<div class="merge-report-muted">…and ${removed.length - 20} more</div>`;
    h += "</div></details>";
  }

  h += "</div>";
  return h;
}

// ── File Upload (with Smart Merge support) ──────────────────

function handleFileUpload(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;

    showLoadingOverlay("Importing playbook\u2026");
    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const text = e.target.result;
        const csvResult = parseCSV(text);
        const parsed = csvResult.plays || csvResult;
        const skippedRows = csvResult.skipped || [];

        if (parsed.length === 0) {
          hideLoadingOverlay();
          showToast(
            "❌ No valid plays found in file. Check the CSV format.",
            4000,
          );
          return;
        }

        const sample = parsed
          .slice(0, 3)
          .map(
            (p) =>
              `• ${escapeHtml(p.formation || "?")} ${escapeHtml(p.play || "?")} (${escapeHtml(p.type || "?")})`,
          )
          .join("<br>");

        const hasExisting = plays.length > 0;

        if (hasExisting) {
          // ── Re-import: offer Smart Merge vs Full Replace ──
          const skipNote =
            skippedRows.length > 0
              ? ` <strong>(${skippedRows.length} row${skippedRows.length === 1 ? "" : "s"} skipped)</strong>`
              : "";
          const choiceMsg =
            `Found <strong>${parsed.length}</strong> play${parsed.length === 1 ? "" : "s"} in new CSV.${skipNote}<br>` +
            `Current playbook has <strong>${plays.length}</strong> plays.<br><br>` +
            `<em>Sample:</em><br>${sample}${parsed.length > 3 ? "<br>…" : ""}<br><br>` +
            `<strong>🔄 Smart Merge</strong> — Matches plays by name, updates changed fields, adds new plays. ` +
            `Keeps your wristband, script, and call sheet references in sync.<br><br>` +
            `<strong>🔁 Full Replace</strong> — Replaces entire playbook. Saved wristbands, scripts, and call sheets keep their old play data.`;

          const choice = await showChoice(choiceMsg, {
            title: "Import Playbook CSV",
            icon: "📋",
            choices: [
              { label: "Smart Merge", value: "merge", icon: "🔄" },
              { label: "Full Replace", value: "replace", icon: "🔁" },
              { label: "Cancel", value: "cancel" },
            ],
          });
          if (choice === "cancel" || !choice) return;

          if (choice === "merge") {
            // Capture pre-merge playbook for reference matching
            const preMerge = plays.map((p) => ({ ...p }));
            const { merged, report } = _smartMerge(preMerge, parsed);
            const refCounts = _mergeUpdateRefs(preMerge, parsed, report);

            plays = merged;
            filteredPlays = [...plays];
            storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
            invalidateFilterCache();
            if (typeof renderTeamSettings === "function") renderTeamSettings();

            document.getElementById("uploadSection").classList.add("hidden");
            document.getElementById("mainApp").classList.remove("hidden");
            initAllModules();
            hideLoadingOverlay();

            // Show merge report
            const reportHtml = _buildMergeReportHtml(
              report,
              refCounts,
              preMerge,
            );
            await showModal(reportHtml, {
              title: "Merge Complete",
              icon: "✅",
            });

            // Show skipped rows after report is dismissed
            if (skippedRows.length > 0) {
              const skipMsg = skippedRows
                .slice(0, 5)
                .map((s) => `Row ${s.line}: ${escapeHtml(s.reason)}`)
                .join("<br>");
              const extra =
                skippedRows.length > 5
                  ? "<br>…and " + (skippedRows.length - 5) + " more"
                  : "";
              showModal(
                skippedRows.length +
                " row(s) were skipped:<br><br>" +
                skipMsg +
                extra,
                { title: "⚠️ Import Warnings", icon: "⚠️" },
              );
            }
            return;
          }

          // Full Replace: confirm destructive action
          const replaceOk = await showConfirm(
            `This will <strong>replace all ${plays.length} existing plays</strong> with ${parsed.length} new plays from the CSV.<br><br>` +
            `Saved wristbands, scripts, and call sheets will keep their old play data.<br><br>Continue?`,
            {
              title: "⚠️ Full Replace",
              icon: "⚠️",
              confirmText: "Replace All",
              danger: true,
            },
          );
          if (!replaceOk) return;
        } else {
          // ── First-time import: simple confirm ──
          const msg = `Found <strong>${parsed.length}</strong> play${parsed.length === 1 ? "" : "s"}.${skippedRows.length > 0 ? " <strong>(" + skippedRows.length + " row" + (skippedRows.length === 1 ? "" : "s") + " skipped)</strong>" : ""}<br><br><em>Sample:</em><br>${sample}${parsed.length > 3 ? "<br>…" : ""}<br><br>Import these plays?`;
          const ok = await showConfirm(msg, {
            title: "Confirm CSV Import",
            icon: "📋",
            confirmText: `Import ${parsed.length} Plays`,
          });
          if (!ok) return;
        }

        // Apply (first-time or full replace)
        plays = parsed;
        filteredPlays = [...plays];
        storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
        invalidateFilterCache();
        if (typeof renderTeamSettings === "function") renderTeamSettings();

        document.getElementById("uploadSection").classList.add("hidden");
        document.getElementById("mainApp").classList.remove("hidden");
        initAllModules();
        hideLoadingOverlay();

        // Show validation report for skipped rows
        if (skippedRows.length > 0) {
          const skipMsg = skippedRows
            .slice(0, 5)
            .map((s) => `Row ${s.line}: ${escapeHtml(s.reason)}`)
            .join("<br>");
          const extra =
            skippedRows.length > 5
              ? "<br>…and " + (skippedRows.length - 5) + " more"
              : "";
          showModal(
            skippedRows.length +
            " row(s) were skipped:<br><br>" +
            skipMsg +
            extra,
            { title: "⚠️ Import Warnings", icon: "⚠️" },
          );
        }
      } catch (err) {
        hideLoadingOverlay();
        console.error("handleFileUpload reader.onload error:", err);
        showToast("❌ Error reading file. Check format and try again.", {
          duration: 4000,
          type: "error",
        });
      }
    };
    reader.readAsText(file);
  } catch (err) {
    hideLoadingOverlay();
    console.error("handleFileUpload error:", err);
    showToast("❌ Error uploading file.", { duration: 4000, type: "error" });
  }
}

/**
 * Initialize the application
 */
function initApp() {
  const runOptionalInit = (label, callback) => {
    try {
      callback();
    } catch (err) {
      console.error(`initApp optional step failed: ${label}`, err);
    }
  };

  try {
    // Run storage migrations before loading any data
    runMigrations();

    // Check for stored playbook
    const storedPlaybook = storageManager.get(STORAGE_KEYS.PLAYBOOK, null);
    if (storedPlaybook) {
      plays = storedPlaybook;
      filteredPlays = [...plays];
      document.getElementById("uploadSection").classList.add("hidden");
      document.getElementById("mainApp").classList.remove("hidden");

      // Restore playbook-specific state before shared init
      restorePlaybookState();

      initAllModules();

      // Sync sort UI from restored state
      _syncSortUI();

      // Restore last active tab
      const lastTab = storageManager.get(STORAGE_KEYS.LAST_ACTIVE_TAB);
      if (
        lastTab &&
        lastTab !== "installation" &&
        TAB_INDEX_MAP[lastTab] !== undefined
      ) {
        showTab(lastTab);
      } else {
        runDraftRestoreCheckForTab(currentActiveTab);
      }

      // Restore call sheet display options
      if (typeof restoreCallSheetDisplayOptions === "function") {
        restoreCallSheetDisplayOptions();
      }
    }

    // Set up drag and drop for file upload
    const uploadBox = document.querySelector(".upload-box");
    if (uploadBox) {
      uploadBox.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadBox.classList.add("dragover");
      });
      uploadBox.addEventListener("dragleave", () => {
        uploadBox.classList.remove("dragover");
      });
      uploadBox.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadBox.classList.remove("dragover");
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith(".csv")) {
          document.getElementById("csvFile").files = e.dataTransfer.files;
          handleFileUpload({ target: { files: [file] } });
        }
      });
    }

    // Set up drag and drop for script container
    const scriptContainer = document.getElementById("scriptPlays");
    if (scriptContainer) {
      scriptContainer.addEventListener("dragover", handleDragOver);
      scriptContainer.addEventListener("dragleave", handleDragLeave);
      scriptContainer.addEventListener("drop", handleDrop);
    }

    // Set today's date as default
    const scriptDateInput = document.getElementById("scriptDate");
    if (scriptDateInput) {
      const today = new Date();
      try {
        scriptDateInput.valueAsDate = today;
      } catch (err) {
        scriptDateInput.value = today.toISOString().slice(0, 10);
      }
    }

    // Initialize team name input with stored value
    const teamNameInput = document.getElementById("teamNameInput");
    if (teamNameInput) {
      teamNameInput.value = getTeamName();
    }

    runOptionalInit("initTeamSettings", () => initTeamSettings());

    // Populate header subtitle with team name
    const teamSub = document.getElementById("teamSubtitle");
    if (teamSub) {
      const name = getTeamName();
      teamSub.textContent = name && name !== "My Team Football" ? name : "";
    }

    // Initialize swatch handlers for wristband
    runOptionalInit("initSwatchHandlers", () => initSwatchHandlers());

    // Initialize script keyboard shortcuts
    runOptionalInit("initScriptKeyboard", () => initScriptKeyboard());
  } catch (err) {
    console.error("initApp error:", err);
    showToast("❌ Error initializing app. Try refreshing.", {
      duration: 5000,
      type: "error",
    });
  }
}

/**
 * Export all data to a JSON backup file
 * Uses centralized storage manager for complete backup
 */
function exportBackup() {
  exportCompleteBackup();
}

/**
 * Import data from a JSON backup file
 * Uses centralized storage manager for complete restore
 */
function importBackup(event) {
  importCompleteBackup(event);
}

// ============ CSV Template Modal ============

function showCSVTemplateModal() {
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay";

  const offenseHeaders = [
    ["PlayType", "Run / Pass / RPO / Screen", "Yes"],
    ["Personnel", "Personnel grouping (e.g. Blue, Red)", "Yes"],
    ["Formation", "Formation name", "Yes"],
    ["FormTag1", "Formation tag 1 (e.g. Rt, Lt)", ""],
    ["FormTag2", "Formation tag 2", ""],
    ["Under", "Under center / Shotgun / Pistol", ""],
    ["Back", "Backfield set (e.g. Strong, Weak)", ""],
    ["Shift", "Pre-snap shift", ""],
    ["Motion", "Motion call", ""],
    ["Protection", "Protection scheme", ""],
    ["LineCall", "O-Line call", ""],
    ["Play", "Full play call name", "Yes"],
    ["PlayTag1", "Play tag / modifier 1", ""],
    ["PlayTag2", "Play tag / modifier 2", ""],
    ["BasePlay", "Base concept (e.g. Inside Zone, Counter)", ""],
    ["OneWord", "One-word wristband call", ""],
    ["PreferredSituation", "Situation tag (e.g. Openers, Red Zone)", ""],
    ["PreferredDown", "Down preference (1, 2, 3, 4)", ""],
    ["PreferredDistance", "Distance preference (Short, Med, Long)", ""],
    ["PreferredHash", "Hash preference (L, M, R)", ""],
    ["PreferredFieldPosition", "Field position preference", ""],
    ["Tempo", "Tempo call (e.g. Freeze, Sugar, Fire)", ""],
    ["PracticeFront", "Practice rep front", ""],
    ["PracticeDefense", "Practice rep defense look", ""],
    ["PracticeCoverage", "Practice rep coverage", ""],
    ["PracticeBlitz", "Practice rep blitz", ""],
    ["PracticeStunt", "Practice rep stunt", ""],
    ["KeyPlayer1", "Key player to watch 1", ""],
    ["KeyPlayer2", "Key player to watch 2", ""],
    ["KeyPlayer3", "Key player to watch 3", ""],
    ["KeyPlayerName1", "Key player name 1", ""],
    ["KeyPlayerName2", "Key player name 2", ""],
    ["KeyPlayerName3", "Key player name 3", ""],
    ["Constraint1", "Constraint / complement 1", ""],
    ["Constraint2", "Constraint / complement 2", ""],
    ["Constraint3", "Constraint / complement 3", ""],
    ["HitChart1", "Hit chart tag 1", ""],
    ["HitChart2", "Hit chart tag 2", ""],
    ["HitChart3", "Hit chart tag 3", ""],
    ["DeadVs", "Killed vs this defense", ""],
    ["Opponent", "Opponent tag", ""],
    ["Notes", "Free-form notes", ""],
  ];

  const defenseHeaders = [
    ["Opponent", "Opponent name", "Yes"],
    ["Week", "Week number", ""],
    ["Game", "Game number or name", ""],
    ["Quarter", "Quarter (1-4, OT)", ""],
    ["Time", "Game clock time", ""],
    ["Down", "Down (1-4)", "Yes"],
    ["Distance", "Distance to go", "Yes"],
    ["Hash", "Hash (L, M, R)", ""],
    ["Field Position", "Field position zone", ""],
    ["Yard Line", "Yard line number", ""],
    ["Situation", "Situation tag (e.g. Red Zone, 2-min)", ""],
    ["Offense Play Type", "Off. play type scouted", ""],
    ["Offense Formation", "Off. formation scouted", ""],
    ["Def Front", "Defensive front called", "Yes"],
    ["Def Coverage", "Coverage called", "Yes"],
    ["Def Stunt", "Stunt called", ""],
    ["Def Blitz", "Blitz called", ""],
    ["Blitzer 1", "Blitzing player 1", ""],
    ["Blitzer 2", "Blitzing player 2", ""],
    ["Blitzer 3", "Blitzing player 3", ""],
    ["Tackler 1", "Tackler 1", ""],
    ["Tackler 2", "Tackler 2", ""],
    ["Tackler 3", "Tackler 3", ""],
    ["Front Strength Direction", "Direction of front strength", ""],
    ["Coverage Strength Direction", "Direction of coverage strength", ""],
    ["Person Of Interest 1 Direction", "POI 1 alignment direction", ""],
    ["Person of Interest 2 Direction", "POI 2 alignment direction", ""],
    ["Person of Interest 3 Direction", "POI 3 alignment direction", ""],
    ["Turnover", "Turnover (Y/N)", ""],
    ["Turnover Forcer", "Player who forced turnover", ""],
    ["Turnover Player", "Player who committed turnover", ""],
    ["Tackle for Loss Player", "TFL player", ""],
    ["Penalty", "Penalty (Y/N)", ""],
    ["Penalty Player", "Penalty player", ""],
    ["Notes", "Free-form notes", ""],
  ];

  function buildTable(headers) {
    let rows = headers
      .map(([col, desc, req]) => {
        const badge = req ? '<span class="csv-tpl-req">Required</span>' : "";
        return `<tr><td class="csv-tpl-col">${col}</td><td class="csv-tpl-desc">${desc}</td><td class="csv-tpl-center">${badge}</td></tr>`;
      })
      .join("");
    return `<table class="csv-tpl-table">
      <thead><tr><th>Column Header</th><th>Description</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  overlay.innerHTML = `
    <div class="custom-modal csv-tpl-modal" role="dialog" aria-modal="true" aria-labelledby="csvTplTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">📋</span>
        <h3 class="custom-modal-title" id="csvTplTitle">CSV Column Templates</h3>
      </div>
      <div class="custom-modal-body csv-tpl-body">
        <div class="csv-tpl-section">
          <div class="csv-tpl-section-header">
            <h4>🏈 Offensive Playbook</h4>
            <button class="btn btn-sm btn-primary" data-action="downloadCSVTemplate" data-arg="offense">⬇ Download Template</button>
          </div>
          <p class="csv-tpl-note">39 columns — used by Playbook, Script, Wristband, Call Sheet & Installation.</p>
          ${buildTable(offenseHeaders)}
        </div>
        <div class="csv-tpl-section">
          <div class="csv-tpl-section-header">
            <h4>🛡️ Defensive Tendencies</h4>
            <button class="btn btn-sm btn-primary" data-action="downloadCSVTemplate" data-arg="defense">⬇ Download Template</button>
          </div>
          <p class="csv-tpl-note">35 columns — imported on the Def Tendencies tab.</p>
          ${buildTable(defenseHeaders)}
        </div>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-primary custom-modal-btn" id="csvTplOk">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  const okBtn = overlay.querySelector("#csvTplOk");
  okBtn.focus();

  function close() {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  }
  okBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      close();
    }
  });
}

function downloadCSVTemplate(type) {
  try {
    let headers;
    let filename;
    if (type === "offense") {
      headers = [
        "PlayType",
        "Personnel",
        "Formation",
        "FormTag1",
        "FormTag2",
        "Under",
        "Back",
        "Shift",
        "Motion",
        "Protection",
        "LineCall",
        "Play",
        "PlayTag1",
        "PlayTag2",
        "BasePlay",
        "OneWord",
        "PreferredSituation",
        "PreferredDown",
        "PreferredDistance",
        "PreferredHash",
        "PreferredFieldPosition",
        "Tempo",
        "PracticeFront",
        "PracticeDefense",
        "PracticeCoverage",
        "PracticeBlitz",
        "PracticeStunt",
        "KeyPlayer1",
        "KeyPlayer2",
        "KeyPlayer3",
        "KeyPlayerName1",
        "KeyPlayerName2",
        "KeyPlayerName3",
        "Constraint1",
        "Constraint2",
        "Constraint3",
        "HitChart1",
        "HitChart2",
        "HitChart3",
        "DeadVs",
        "Opponent",
        "Notes",
      ];
      filename = "offensive_playbook_template.csv";
    } else {
      headers = [
        "Opponent",
        "Week",
        "Game",
        "Quarter",
        "Time",
        "Down",
        "Distance",
        "Hash",
        "Field Position",
        "Yard Line",
        "Situation",
        "Offense Play Type",
        "Offense Formation",
        "Def Front",
        "Def Coverage",
        "Def Stunt",
        "Def Blitz",
        "Blitzer 1",
        "Blitzer 2",
        "Blitzer 3",
        "Tackler 1",
        "Tackler 2",
        "Tackler 3",
        "Front Strength Direction",
        "Coverage Strength Direction",
        "Person Of Interest 1 Direction",
        "Person of Interest 2 Direction",
        "Person of Interest 3 Direction",
        "Turnover",
        "Turnover Forcer",
        "Turnover Player",
        "Tackle for Loss Player",
        "Penalty",
        "Penalty Player",
        "Notes",
      ];
      filename = "defensive_tendencies_template.csv";
    }
    const csv = headers.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`⬇️ Downloaded ${filename}`);
  } catch (err) {
    console.error("downloadCSVTemplate error:", err);
    showToast("❌ Error creating template.", { duration: 3000, type: "error" });
  }
}

// ── Dark mode toggle ──
function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", isDark ? "" : "dark");
  storageManager.set(STORAGE_KEYS.THEME, isDark ? "light" : "dark");
  const icon = document.getElementById("darkModeIcon");
  if (icon) icon.textContent = isDark ? "🌙" : "☀️";
}
// Restore theme on load
(function _restoreTheme() {
  const saved =
    storageManager.get(STORAGE_KEYS.THEME) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    const icon = document.getElementById("darkModeIcon");
    if (icon) icon.textContent = "☀️";
  }
})();

// Runtime OS theme change (only when user hasn't set a manual preference)
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    if (!storageManager.get(STORAGE_KEYS.THEME)) {
      document.documentElement.setAttribute(
        "data-theme",
        e.matches ? "dark" : "",
      );
      const icon = document.getElementById("darkModeIcon");
      if (icon) icon.textContent = e.matches ? "☀️" : "🌙";
    }
  });

// ── Global keyboard shortcuts: Undo/Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Y / Shift+Z) ──
document.addEventListener("keydown", (e) => {
  const inInput =
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.isContentEditable;

  const mod = e.ctrlKey || e.metaKey;

  // Offense Builder shortcuts (when on OB tab)
  if (
    currentActiveTab === "offensebuilder" &&
    !mod &&
    !e.altKey &&
    !e.shiftKey
  ) {
    // "/" focus search
    if (e.key === "/" && !inInput) {
      e.preventDefault();
      const searchInput = document.getElementById("obSearchInput");
      if (searchInput) searchInput.focus();
      return;
    }
    // Escape: blur search / deselect play
    if (e.key === "Escape") {
      if (inInput) {
        const searchInput = document.getElementById("obSearchInput");
        if (searchInput && document.activeElement === searchInput) {
          if (searchInput.value) {
            searchInput.value = "";
            obSearchTerm = "";
            obRenderPlayList();
          } else {
            searchInput.blur();
          }
        }
      } else if (obActivePlayName) {
        obActivePlayName = null;
        obRenderPlayList();
        obRenderSidebar();
      }
      return;
    }
    // "r" toggle rated only
    if (e.key === "r" && !inInput) {
      e.preventDefault();
      const cb = document.getElementById("obShowRated");
      if (cb) {
        cb.checked = !cb.checked;
        obShowRatedOnly = cb.checked;
        obRenderPlayList();
      }
      return;
    }
    // Arrow up/down: navigate play cards
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !inInput) {
      e.preventDefault();
      const cards = document.querySelectorAll("#obPlayList .ob-card");
      if (!cards.length) return;
      const names = Array.from(cards).map((c) => c.dataset.play);
      const idx = obActivePlayName ? names.indexOf(obActivePlayName) : -1;
      let next;
      if (e.key === "ArrowDown") {
        next = idx < names.length - 1 ? idx + 1 : 0;
      } else {
        next = idx > 0 ? idx - 1 : names.length - 1;
      }
      obActivePlayName = names[next];
      obRenderPlayList();
      obRenderSidebar();
      const activeCard = document.querySelector("#obPlayList .ob-card.active");
      if (activeCard) activeCard.scrollIntoView({ block: "nearest" });
      return;
    }
  }

  if (inInput) return;

  // Number keys 1-8: switch tabs (no modifier, no alt)
  if (!mod && !e.altKey && !e.shiftKey && e.key >= "1" && e.key <= "8") {
    const tabNames = [
      "playbook",
      "script",
      "wristband",
      "tendencies",
      "callsheet",
      "installation",
      "offensebuilder",
      "dashboard",
    ];
    const tab = tabNames[parseInt(e.key, 10) - 1];
    if (tab) {
      e.preventDefault();
      showTab(tab);
    }
    return;
  }

  if (!mod) return;

  // Cmd+K: Quick search (wristband tab)
  if (
    e.key === "k" &&
    currentActiveTab === "wristband" &&
    typeof openWbQuickSearch === "function"
  ) {
    e.preventDefault();
    openWbQuickSearch();
    return;
  }

  // Undo: Ctrl+Z / Cmd+Z
  if (e.key === "z" && !e.shiftKey) {
    if (currentActiveTab === "script" && typeof undoScript === "function") {
      e.preventDefault();
      undoScript();
    } else if (
      currentActiveTab === "wristband" &&
      typeof undoWristband === "function"
    ) {
      e.preventDefault();
      undoWristband();
    } else if (
      currentActiveTab === "tendencies" &&
      typeof undoTendencies === "function"
    ) {
      e.preventDefault();
      undoTendencies();
    }
    return;
  }

  // Redo: Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z
  if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
    if (currentActiveTab === "script" && typeof redoScript === "function") {
      e.preventDefault();
      redoScript();
    } else if (
      currentActiveTab === "wristband" &&
      typeof redoWristband === "function"
    ) {
      e.preventDefault();
      redoWristband();
    } else if (
      currentActiveTab === "tendencies" &&
      typeof redoTendencies === "function"
    ) {
      e.preventDefault();
      redoTendencies();
    }
  }
});

// ── Autosave status indicator ──
function updateSaveStatus(state) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.className = "save-status " + state;
  el.textContent =
    state === "saved"
      ? "✓ Saved"
      : state === "saving"
        ? "⏳ Saving…"
        : "● Unsaved";
}

// ── Offline connectivity banner ──
(function _initOfflineBanner() {
  const banner = document.createElement("div");
  banner.className = "offline-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.textContent =
    "📡 You\u2019re offline \u2014 changes are saved locally and will sync when reconnected";
  document.body.prepend(banner);
  const update = () => banner.classList.toggle("visible", !navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
})();

// ── Tab badge counts ──
function updateTabBadges() {
  const badges = {
    "tab-playbook": typeof plays !== "undefined" ? plays.length : 0,
    "tab-script": Array.isArray(script)
      ? script.filter((p) => !p.isSeparator).length
      : 0,
    "tab-wristband":
      typeof wristbandCards !== "undefined"
        ? wristbandCards.reduce(
          (s, c) => s + (c.data ? c.data.filter(Boolean).length : 0),
          0,
        )
        : 0,
    "tab-tendencies":
      typeof tendenciesOpponents !== "undefined"
        ? tendenciesOpponents.length
        : 0,
  };
  Object.entries(badges).forEach(([id, count]) => {
    const tab = document.getElementById(id);
    if (!tab) return;
    let badge = tab.querySelector(".tab-badge");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge badge-muted tab-badge";
        tab.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
}

// ── Scroll-to-top FAB ──
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}
const _scrollFab = document.getElementById("scrollTopFab");
if (_scrollFab) {
  window.addEventListener(
    "scroll",
    () => _scrollFab.classList.toggle("visible", window.scrollY > 400),
    { passive: true },
  );
}

// ── Tab bar scroll-fade indicator ──
const _tabBar = document.querySelector(".tabs");
if (_tabBar) {
  const _checkTabScroll = () => {
    const atEnd =
      _tabBar.scrollLeft + _tabBar.clientWidth >= _tabBar.scrollWidth - 2;
    _tabBar.classList.toggle("scrolled-end", atEnd);
  };
  _tabBar.addEventListener("scroll", _checkTabScroll, { passive: true });
  _checkTabScroll();
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initApp);

// Global error handlers — surface silent failures to the user
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
  showToast("\u26a0\ufe0f Something went wrong. Check console.", {
    duration: 4000,
    type: "error",
  });
});
window.addEventListener("error", (e) => {
  console.error("Uncaught error:", e.error || e.message);
});

// Tab bar arrow-key navigation (WCAG 2.1.1)
document.addEventListener("DOMContentLoaded", () => {
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;
  // Set tabindex: active=0, inactive=-1
  tablist.querySelectorAll('[role="tab"]').forEach((t) => {
    t.setAttribute(
      "tabindex",
      t.getAttribute("aria-selected") === "true" ? "0" : "-1",
    );
  });
  tablist.addEventListener("keydown", (e) => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const idx = tabs.indexOf(e.target);
    if (idx < 0) return;
    let next;
    if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
    else if (e.key === "ArrowLeft")
      next = tabs[(idx - 1 + tabs.length) % tabs.length];
    if (next) {
      e.preventDefault();
      tabs.forEach((t) => t.setAttribute("tabindex", "-1"));
      next.setAttribute("tabindex", "0");
      next.focus();
      next.click();
    }
  });
});

// Close any open dropdowns when clicking outside
