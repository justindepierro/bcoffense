// Main application logic for Practice Script & Playbook

// Global state
let plays = [];
let script = [];
let scriptWristband = null;
let filteredPlays = [];

// Dirty tracking — marks when working data has unsaved changes
let scriptDirty = false;
let wristbandDirty = false;

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

  let h = '<div style="text-align:left;font-size:0.95rem;line-height:1.7">';

  // Summary grid
  h +=
    '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin-bottom:12px">';
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
    h +=
      '<div style="border-top:1px solid var(--color-border-light);padding-top:8px;margin-bottom:10px">';
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
    h +=
      '<details style="margin-bottom:6px"><summary style="cursor:pointer;font-weight:600;font-size:0.9rem">Updated plays</summary>';
    h +=
      '<div style="font-size:0.82rem;margin-top:4px;max-height:200px;overflow-y:auto">';
    const show = updated.slice(0, 20);
    for (const u of show) {
      const p = existingPlays[u.ei];
      const name = (p.formation || "?") + " " + (p.play || "?");
      const flds = u.changes
        .slice(0, 4)
        .map((c) => c.field)
        .join(", ");
      const more = u.changes.length > 4 ? ", …" : "";
      h += `<div style="margin-bottom:2px">• <strong>${escapeHtml(name)}</strong> — ${u.changes.length} field${u.changes.length !== 1 ? "s" : ""} <span style="color:var(--color-text-muted)">(${escapeHtml(flds)}${more})</span></div>`;
    }
    if (updated.length > 20)
      h += `<div style="color:var(--color-text-muted)">…and ${updated.length - 20} more</div>`;
    h += "</div></details>";
  }

  // Expandable detail: added plays
  if (added.length > 0) {
    h +=
      '<details style="margin-bottom:6px"><summary style="cursor:pointer;font-weight:600;font-size:0.9rem">New plays added</summary>';
    h +=
      '<div style="font-size:0.82rem;margin-top:4px;max-height:150px;overflow-y:auto">';
    const show = addedPlays.slice(0, 20);
    for (const p of show) {
      h += `<div style="margin-bottom:2px">• ${escapeHtml((p.formation || "?") + " " + (p.play || "?"))} (${escapeHtml(p.type || "?")})</div>`;
    }
    if (added.length > 20)
      h += `<div style="color:var(--color-text-muted)">…and ${added.length - 20} more</div>`;
    h += "</div></details>";
  }

  // Expandable detail: removed / orphaned plays
  if (removed.length > 0) {
    h +=
      '<details style="margin-bottom:6px"><summary style="cursor:pointer;font-weight:600;font-size:0.9rem">Plays only in old playbook</summary>';
    h +=
      '<div style="font-size:0.82rem;margin-top:4px;max-height:150px;overflow-y:auto">';
    h +=
      '<div style="color:var(--color-text-muted);margin-bottom:4px">These plays were not in the new CSV but have been kept in your playbook.</div>';
    const show = removedPlays.slice(0, 20);
    for (const p of show) {
      h += `<div style="margin-bottom:2px">• ${escapeHtml((p.formation || "?") + " " + (p.play || "?"))} (${escapeHtml(p.type || "?")})</div>`;
    }
    if (removed.length > 20)
      h += `<div style="color:var(--color-text-muted)">…and ${removed.length - 20} more</div>`;
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
        showToast("❌ Error reading file. Check format and try again.", 4000);
      }
    };
    reader.readAsText(file);
  } catch (err) {
    hideLoadingOverlay();
    console.error("handleFileUpload error:", err);
    showToast("❌ Error uploading file.", 4000);
  }
}

/**
 * Initialize the application
 */
function initApp() {
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

      // Check for unsaved drafts
      checkScriptDraft();
      if (typeof checkWristbandDraft === "function") checkWristbandDraft();
      if (typeof checkCallSheetDraft === "function") checkCallSheetDraft();

      // Restore last active tab
      const lastTab = storageManager.get(STORAGE_KEYS.LAST_ACTIVE_TAB);
      if (
        lastTab &&
        lastTab !== "installation" &&
        TAB_INDEX_MAP[lastTab] !== undefined
      ) {
        showTab(lastTab);
      }

      // Restore call sheet display options
      if (typeof restoreCallSheetDisplayOptions === "function") {
        restoreCallSheetDisplayOptions();
      }
    }

    // Set up drag and drop for file upload
    const uploadBox = document.querySelector(".upload-box");
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

    // Set up drag and drop for script container
    const scriptContainer = document.getElementById("scriptPlays");
    scriptContainer.addEventListener("dragover", handleDragOver);
    scriptContainer.addEventListener("dragleave", handleDragLeave);
    scriptContainer.addEventListener("drop", handleDrop);

    // Set today's date as default
    document.getElementById("scriptDate").valueAsDate = new Date();

    // Initialize team name input with stored value
    const teamNameInput = document.getElementById("teamNameInput");
    if (teamNameInput) {
      teamNameInput.value = getTeamName();
    }

    // Populate header subtitle with team name
    const teamSub = document.getElementById("teamSubtitle");
    if (teamSub) {
      const name = getTeamName();
      teamSub.textContent = name && name !== "My Team Football" ? name : "";
    }

    // Initialize swatch handlers for wristband
    initSwatchHandlers();

    // Initialize script keyboard shortcuts
    initScriptKeyboard();
  } catch (err) {
    console.error("initApp error:", err);
    showToast("❌ Error initializing app. Try refreshing.", 5000);
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

// ============ Game Week Dashboard ============

/**
 * Render the Game Week Dashboard panel
 */
function renderDashboard() {
  try {
    // Populate opponent dropdown
    const select = document.getElementById("dashOpponentSelect");
    const weekInput = document.getElementById("dashWeekLabel");
    const badge = document.getElementById("dashActiveOpponentBadge");

    if (!select) return;

    const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
    const gw = getGameWeek();

    // Build opponent options
    let optHtml = '<option value="">— Select Opponent —</option>';
    opponents.forEach((opp, idx) => {
      const sel = gw.opponentIndex === idx ? "selected" : "";
      optHtml += `<option value="${idx}" ${sel}>${escapeHtml(opp.name)} (${opp.plays.length} plays)</option>`;
    });
    select.innerHTML = optHtml;

    if (weekInput) weekInput.value = gw.weekLabel || "";
    // Populate notes
    const notesArea = document.getElementById("dashNotesArea");
    if (notesArea && notesArea !== document.activeElement) {
      notesArea.value = gw.notes || "";
    }

    if (badge) {
      badge.innerHTML = gw.opponentName
        ? `<span class="dash-opp-active">🏈 ${escapeHtml(gw.opponentName)}${gw.weekLabel ? " — " + escapeHtml(gw.weekLabel) : ""}</span>`
        : '<span class="dash-opp-none">No opponent selected</span>';
    }

    // Build status cards
    const cardsEl = document.getElementById("dashCards");
    if (cardsEl) {
      const playCount = typeof plays !== "undefined" ? plays.length : 0;
      const scriptCount = script.filter((p) => !p.isSeparator).length;
      const savedScripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
      const savedScriptCount = Array.isArray(savedScripts)
        ? savedScripts.length
        : Object.keys(savedScripts).length;
      const wristbandCount =
        typeof wristbandCards !== "undefined" ? wristbandCards.length : 0;
      const savedWristbands = storageManager.get(
        STORAGE_KEYS.SAVED_WRISTBANDS,
        [],
      );

      // Count call sheet plays
      let csPlayCount = 0;
      let csCatsFilled = 0;
      if (typeof callSheet !== "undefined") {
        Object.values(callSheet).forEach((data) => {
          const count = (data.left || []).length + (data.right || []).length;
          if (count > 0) {
            csPlayCount += count;
            csCatsFilled++;
          }
        });
      }

      const oppPlays = gw.opponentName
        ? opponents[gw.opponentIndex]?.plays?.length || 0
        : 0;

      const activeScriptName =
        document.getElementById("scriptName")?.value?.trim() ||
        "Practice Script";

      cardsEl.innerHTML = `
      <div class="dash-card dash-card-playbook">
        <div class="dash-card-icon">📖</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${playCount}</div>
          <div class="dash-card-label">Plays Loaded</div>
          <button class="dash-card-link" data-action="showTab" data-arg="playbook">Open →</button>
        </div>
      </div>
      <div class="dash-card dash-card-script">
        <div class="dash-card-icon">📋</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${scriptCount}</div>
          <div class="dash-card-label">On Script</div>
          <div class="dash-card-sub">📄 ${escapeHtml(activeScriptName)} • ${savedScriptCount} saved</div>
          <button class="dash-card-link" data-action="showTab" data-arg="script">Open →</button>
        </div>
      </div>
      <div class="dash-card dash-card-wristband">
        <div class="dash-card-icon">⌚</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${wristbandCount}</div>
          <div class="dash-card-label">Wristband Cards</div>
          <div class="dash-card-sub">${savedWristbands.length} saved</div>
          <button class="dash-card-link" data-action="showTab" data-arg="wristband">Open →</button>
        </div>
      </div>
      <div class="dash-card dash-card-tendencies">
        <div class="dash-card-icon">🎯</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${oppPlays}</div>
          <div class="dash-card-label">Scouting Plays</div>
          <div class="dash-card-sub">${opponents.length} opponent${opponents.length !== 1 ? "s" : ""}</div>
          <button class="dash-card-link" data-action="showTab" data-arg="tendencies">Open →</button>
        </div>
      </div>
      <div class="dash-card dash-card-callsheet">
        <div class="dash-card-icon">🗂️</div>
        <div class="dash-card-info">
          <div class="dash-card-value">${csPlayCount}</div>
          <div class="dash-card-label">On Call Sheet</div>
          <div class="dash-card-sub">${csCatsFilled} categories</div>
          <button class="dash-card-link" data-action="showTab" data-arg="callsheet">Open →</button>
        </div>
      </div>
    `;

      // Animate card values
      cardsEl.querySelectorAll(".dash-card-value").forEach((el) => {
        const n = parseInt(el.textContent, 10);
        if (!isNaN(n) && n > 0) _animateCountUp(el, n, 600);
      });

      // Refresh tab badges when dashboard renders
      updateTabBadges();
    }

    // Build scouting summary
    const scoutEl = document.getElementById("dashScoutingSection");
    if (scoutEl) {
      const opp = getActiveOpponent();
      if (opp && opp.plays.length > 0) {
        const overall = queryTendencies(opp, {});
        const thirdDown = queryTendencies(opp, { down: ["3"] });
        const rz = queryTendencies(opp, { situation: ["Red Zone"] });

        scoutEl.innerHTML = `
        <h3 class="dash-section-title">🎯 Scouting Summary — ${escapeHtml(opp.name)}</h3>
        <div class="dash-scout-grid">
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">Overall (${overall.total} plays)</div>
            <div class="dash-scout-items">
              ${overall.topFront
                .slice(0, 3)
                .map(
                  (f) =>
                    `<div class="dash-scout-row"><span>Front:</span> <b>${escapeHtml(f.term)}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
                )
                .join("")}
              ${overall.topCoverage
                .slice(0, 3)
                .map(
                  (c) =>
                    `<div class="dash-scout-row"><span>Cov:</span> <b>${escapeHtml(c.term)}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
                )
                .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${overall.blitzRate}%</b></div>
            </div>
          </div>
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">3rd Down (${thirdDown.total} plays)</div>
            <div class="dash-scout-items">
              ${thirdDown.topFront
                .slice(0, 2)
                .map(
                  (f) =>
                    `<div class="dash-scout-row"><span>Front:</span> <b>${escapeHtml(f.term)}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
                )
                .join("")}
              ${thirdDown.topCoverage
                .slice(0, 2)
                .map(
                  (c) =>
                    `<div class="dash-scout-row"><span>Cov:</span> <b>${escapeHtml(c.term)}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
                )
                .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${thirdDown.blitzRate}%</b></div>
            </div>
          </div>
          <div class="dash-scout-card">
            <div class="dash-scout-card-title">Red Zone (${rz.total} plays)</div>
            <div class="dash-scout-items">
              ${rz.topFront
                .slice(0, 2)
                .map(
                  (f) =>
                    `<div class="dash-scout-row"><span>Front:</span> <b>${escapeHtml(f.term)}</b> <span class="dash-scout-pct">${f.pct}%</span></div>`,
                )
                .join("")}
              ${rz.topCoverage
                .slice(0, 2)
                .map(
                  (c) =>
                    `<div class="dash-scout-row"><span>Cov:</span> <b>${escapeHtml(c.term)}</b> <span class="dash-scout-pct">${c.pct}%</span></div>`,
                )
                .join("")}
              <div class="dash-scout-row"><span>Blitz Rate:</span> <b>${rz.blitzRate}%</b></div>
            </div>
          </div>
        </div>
      `;
      } else {
        scoutEl.innerHTML = `
        <div class="dash-no-scouting">
          <p>📊 Select an opponent above to see scouting intel here</p>
          <p class="dash-hint">Go to the <strong>Def Tendencies</strong> tab to add opponents and chart plays</p>
        </div>
      `;
      }
    }

    // Build quick links
    const linksEl = document.getElementById("dashQuickLinks");
    if (linksEl) {
      linksEl.innerHTML = `
      <h3 class="dash-section-title">⚡ Quick Actions</h3>
      <div class="dash-links-grid">
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="script">📋 Build Script</button>
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="callsheet">🗂️ Edit Call Sheet</button>
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="installation">📦 Installation</button>
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="tendencies">🎯 Chart Tendencies</button>
        <button class="dash-link-btn" data-action="dashGoToTab" data-arg="wristband">⌚ Wristband Maker</button>
        <button class="dash-link-btn dash-link-print" data-action="printFullGamePlan">🖨️ Print Game Plan</button>
        <button class="dash-link-btn" data-action="showStorageInfo">💾 Storage Info</button>
      </div>
    `;
    }

    // Render schedule table
    renderSchedule();

    // Render game plan summary
    renderGamePlanSummary();
  } catch (err) {
    console.error("renderDashboard error:", err);
    showToast("❌ Error loading dashboard.", 3000);
  }
}

/**
 * Handle game week notes change
 */
let _dashNotesTimer = null;
function onDashNotesChange(value) {
  // Debounce saves
  clearTimeout(_dashNotesTimer);
  _dashNotesTimer = setTimeout(() => {
    const gw = getGameWeek();
    gw.notes = value;
    storageManager.set(STORAGE_KEYS.GAME_WEEK, gw);
  }, 400);
}

// ============ Season Schedule Manager ============

/**
 * Render the schedule table in the dashboard
 */
function renderSchedule() {
  const body = document.getElementById("dashScheduleBody");
  if (!body) return;
  const schedule = getSchedule();
  const gw = getGameWeek();

  if (schedule.length === 0) {
    body.innerHTML = `<div class="dash-schedule-empty">
      <p>No games scheduled yet. Add your season schedule to quickly set the active opponent each week.</p>
    </div>`;
    return;
  }

  let html = '<table class="dash-schedule-table"><thead><tr>';
  html += "<th>Week</th><th>Date</th><th>Opponent</th><th>Location</th><th></th>";
  html += "</tr></thead><tbody>";
  schedule.forEach((game, i) => {
    const isActive = gw.opponentName && gw.opponentName === game.opponent && gw.weekLabel === game.week;
    const activeClass = isActive ? " dash-schedule-active" : "";
    html += `<tr class="${activeClass}">
      <td>${escapeHtml(game.week)}</td>
      <td>${escapeHtml(game.date)}</td>
      <td><strong>${escapeHtml(game.opponent)}</strong></td>
      <td>${escapeHtml(game.location)}</td>
      <td class="dash-schedule-actions">
        <button class="btn btn-sm btn-primary" data-action="setScheduleActive" data-idx="${i}" title="Set as active game week">🏈</button>
        <button class="btn btn-sm btn-danger" data-action="removeScheduleGame" data-idx="${i}" title="Remove">✕</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table>";
  body.innerHTML = html;
}

/**
 * Add a game to the schedule via prompt
 */
async function addScheduleGame() {
  const week = await showPrompt("Week label:", "", {
    title: "Add Game", icon: "📅", placeholder: "e.g., Week 1"
  });
  if (!week) return;
  const opponent = await showPrompt("Opponent name:", "", {
    title: "Add Game", icon: "🏈", placeholder: "e.g., Alabama"
  });
  if (!opponent) return;
  const date = await showPrompt("Game date (optional):", "", {
    title: "Add Game", icon: "📆", placeholder: "e.g., Sep 6"
  });
  const location = await showPrompt("Location (optional):", "", {
    title: "Add Game", icon: "📍", placeholder: "e.g., Home / @ Away"
  });

  const schedule = getSchedule();
  schedule.push({
    week: week.trim(),
    date: (date || "").trim(),
    opponent: opponent.trim(),
    location: (location || "").trim(),
  });
  saveSchedule(schedule);
  renderSchedule();
  showToast("📅 Game added to schedule", { duration: 2000, type: "success" });
}

/**
 * Remove a game from the schedule
 */
async function removeScheduleGame(element) {
  const idx = parseInt(element.dataset.idx, 10);
  const schedule = getSchedule();
  if (idx < 0 || idx >= schedule.length) return;
  const game = schedule[idx];
  const ok = await showConfirm(
    `Remove <strong>${escapeHtml(game.week)} vs ${escapeHtml(game.opponent)}</strong> from the schedule?`,
    { title: "Remove Game", icon: "🗑️", confirmText: "Remove", danger: true }
  );
  if (!ok) return;
  schedule.splice(idx, 1);
  saveSchedule(schedule);
  renderSchedule();
  showToast("Game removed", { duration: 2000 });
}

/**
 * Set a scheduled game as the active game week
 */
function setScheduleActive(element) {
  const idx = parseInt(element.dataset.idx, 10);
  const schedule = getSchedule();
  if (idx < 0 || idx >= schedule.length) return;
  const game = schedule[idx];

  // Try to find this opponent in the tendencies opponents list
  const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
  let oppIdx = opponents.findIndex(
    (o) => o.name.toLowerCase().trim() === game.opponent.toLowerCase().trim()
  );

  // If opponent not found in tendencies, create a new one
  if (oppIdx < 0) {
    opponents.push({ name: game.opponent.trim(), plays: [] });
    storageManager.set(STORAGE_KEYS.DEFENSIVE_TENDENCIES, opponents);
    oppIdx = opponents.length - 1;
  }

  setGameWeek(oppIdx, game.week);
  renderDashboard();
  showToast(`🏈 Active: ${escapeHtml(game.week)} vs ${escapeHtml(game.opponent)}`, { duration: 2500, type: "success" });
}

// ============ Game Plan Dashboard Section ============

/**
 * Render game plan summary in the dashboard
 */
function renderGamePlanSummary() {
  const section = document.getElementById("dashGamePlanSection");
  if (!section) return;
  const gw = getGameWeek();

  if (!gw.opponentName) {
    section.innerHTML = "";
    return;
  }

  const tags = getGamePlanTags();
  const tagged = tags[gw.opponentName] || [];
  const taggedCount = tagged.length;

  if (taggedCount === 0) {
    section.innerHTML = `<div class="dash-gameplan-card">
      <h3 class="dash-section-title">🎯 Game Plan — ${escapeHtml(gw.opponentName)}</h3>
      <p class="dash-gameplan-empty">No plays tagged for this opponent yet. Open the <strong>Playbook</strong>, double-click a play, and check <strong>In Game Plan</strong> to start building your game plan.</p>
    </div>`;
    return;
  }

  // Build breakdown by type
  const typeCounts = {};
  const matchedPlays = (typeof plays !== "undefined" ? plays : []).filter((p) => {
    if (tagged.includes(playSignature(p))) {
      const t = p.type || "Other";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      return true;
    }
    return false;
  });

  let breakdownHtml = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `<div class="dash-gp-row"><span>${escapeHtml(type)}</span><strong>${count}</strong></div>`)
    .join("");

  section.innerHTML = `<div class="dash-gameplan-card">
    <h3 class="dash-section-title">🎯 Game Plan — ${escapeHtml(gw.opponentName)}</h3>
    <div class="dash-gp-summary">
      <div class="dash-gp-total">
        <div class="dash-gp-total-num">${taggedCount}</div>
        <div class="dash-gp-total-label">Plays Tagged</div>
      </div>
      <div class="dash-gp-breakdown">
        <div class="dash-gp-breakdown-title">By Type</div>
        ${breakdownHtml}
      </div>
    </div>
    <button class="btn btn-sm btn-primary" data-action="filterPlaybookToGamePlan">📖 View in Playbook</button>
  </div>`;
}

/**
 * Switch to playbook tab with game plan filter active
 */
function filterPlaybookToGamePlan() {
  showTab("playbook");
  // Activate the game plan filter
  const toggle = document.getElementById("pbGamePlanFilter");
  if (toggle && !toggle.checked) {
    toggle.checked = true;
    filterPlays();
  }
}

/**
 * Print Full Game Plan — consolidated print with scouting, call sheet, and notes
 */
function printFullGamePlan() {
  try {
    const gw = getGameWeek();
    const opp = getActiveOpponent();

    // Build the print content
    let html = '<div class="gp-print-wrap">';

    // Header
    html += `<div class="gp-print-header">
    <h1>🏈 Game Plan${gw.opponentName ? " — vs. " + escapeHtml(gw.opponentName) : ""}${gw.weekLabel ? " (" + escapeHtml(gw.weekLabel) + ")" : ""}</h1>
    <p class="gp-print-date">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
  </div>`;

    // Game Week Notes
    if (gw.notes && gw.notes.trim()) {
      html += `<div class="gp-print-section">
      <h2 class="gp-print-section-title">📝 Game Week Notes</h2>
      <div class="gp-print-notes">${escapeHtml(gw.notes).replace(/\n/g, "<br>")}</div>
    </div>`;
    }

    // Scouting Summary
    if (opp && opp.plays.length > 0) {
      const overall = queryTendencies(opp, {});
      const thirdDown = queryTendencies(opp, { down: ["3"] });
      const rz = queryTendencies(opp, { situation: ["Red Zone"] });

      html += `<div class="gp-print-section">
      <h2 class="gp-print-section-title">🎯 Scouting Report — ${escapeHtml(opp.name)} (${overall.total} charted plays)</h2>
      <div class="gp-scout-grid">`;

      const sections = [
        { label: "Overall", data: overall },
        { label: "3rd Down", data: thirdDown },
        { label: "Red Zone", data: rz },
      ];

      sections.forEach((s) => {
        html += `<div class="gp-scout-col">
        <h3>${s.label} (${s.data.total})</h3>
        <table class="gp-scout-table">
          <tr><th>Fronts</th><th>%</th></tr>
          ${s.data.topFront
            .slice(0, 4)
            .map(
              (f) =>
                `<tr><td>${escapeHtml(f.term)}</td><td>${f.pct}%</td></tr>`,
            )
            .join("")}
        </table>
        <table class="gp-scout-table">
          <tr><th>Coverages</th><th>%</th></tr>
          ${s.data.topCoverage
            .slice(0, 4)
            .map(
              (c) =>
                `<tr><td>${escapeHtml(c.term)}</td><td>${c.pct}%</td></tr>`,
            )
            .join("")}
        </table>
        <p class="gp-blitz-line">Blitz Rate: <strong>${s.data.blitzRate}%</strong></p>
        ${s.data.topStunt && s.data.topStunt.length > 0 ? `<p class="gp-stunt-line">Top Stunt: ${escapeHtml(s.data.topStunt[0].term)} (${s.data.topStunt[0].pct}%)</p>` : ""}
      </div>`;
      });

      html += `</div></div>`;
    }

    // Call Sheet Summary (both pages)
    if (typeof CALLSHEET_FRONT !== "undefined") {
      ["Front", "Back"].forEach((pageName) => {
        const cats = pageName === "Front" ? CALLSHEET_FRONT : CALLSHEET_BACK;
        const filledCats = cats.filter((cat) => {
          const data = callSheet[cat.id];
          return (
            data && (data.left || []).length + (data.right || []).length > 0
          );
        });
        if (filledCats.length === 0) return;

        html += `<div class="gp-print-section gp-cs-section">
        <h2 class="gp-print-section-title">🗂️ Call Sheet — ${pageName} Page</h2>
        <div class="gp-cs-grid">`;

        filledCats.forEach((cat) => {
          const data = callSheet[cat.id] || { left: [], right: [] };
          const displayName =
            typeof getCategoryDisplayName === "function"
              ? getCategoryDisplayName(cat)
              : cat.name;
          const allPlays = [...(data.left || []), ...(data.right || [])];
          const textColor =
            cat.color === CS_COLORS.yellow || cat.color === "#f8f9fa"
              ? UI_COLORS.textBlack
              : UI_COLORS.textWhite;

          html += `<div class="gp-cs-cat">
          <div class="gp-cs-cat-header" style="background:${cat.color};color:${textColor}">${displayName} (${allPlays.length})</div>
          <div class="gp-cs-cat-plays">`;

          // Show left hash
          if ((data.left || []).length > 0) {
            html += `<div class="gp-cs-hash-group"><span class="gp-cs-hash-label">L:</span> `;
            html += (data.left || [])
              .map(
                (p) =>
                  `<span class="gp-cs-play">${typeof getFullCall === "function" ? getFullCall(p) : escapeHtml(p.play || p.name || "?")}</span>`,
              )
              .join(", ");
            html += `</div>`;
          }
          // Show right hash
          if ((data.right || []).length > 0) {
            html += `<div class="gp-cs-hash-group"><span class="gp-cs-hash-label">R:</span> `;
            html += (data.right || [])
              .map(
                (p) =>
                  `<span class="gp-cs-play">${typeof getFullCall === "function" ? getFullCall(p) : escapeHtml(p.play || p.name || "?")}</span>`,
              )
              .join(", ");
            html += `</div>`;
          }

          html += `</div></div>`;
        });

        html += `</div></div>`;
      });
    }

    html += "</div>";

    // Use the call sheet print container
    const container = document.getElementById("callSheetPrint");
    const content = document.getElementById("callSheetPrintContent");
    content.innerHTML = html;
    container.classList.remove("hidden");
    document.body.dataset.printMode = "gameplan";

    // Print style
    let printStyle = document.getElementById("wristbandPrintStyle");
    if (!printStyle) {
      printStyle = document.createElement("style");
      printStyle.id = "wristbandPrintStyle";
      document.head.appendChild(printStyle);
    }
    printStyle.textContent =
      "@media print { @page { size: letter; margin: 0.4in; } }";

    setTimeout(() => {
      const restoreTitle = setPrintTitle("Game Plan", gw.opponentName || "");
      window.print();
      restoreTitle();
      container.classList.add("hidden");
      delete document.body.dataset.printMode;
    }, 100);
  } catch (err) {
    console.error("printFullGamePlan error:", err);
    showToast("❌ Error generating game plan print.", 4000);
  }
}

/**
 * Handle opponent selection change on dashboard
 */
function onDashOpponentChange(value) {
  const idx = value === "" ? null : parseInt(value, 10);
  const weekLabel = document.getElementById("dashWeekLabel")?.value || "";
  setGameWeek(idx, weekLabel);
  renderDashboard();
  const gw = getGameWeek();
  if (gw.opponentName) {
    showToast(`🏈 Active opponent: ${gw.opponentName}`);
  } else {
    showToast("Opponent cleared");
  }
}

/**
 * Handle week label change on dashboard
 */
function onDashWeekLabelChange(value) {
  const gw = getGameWeek();
  gw.weekLabel = value;
  storageManager.set(STORAGE_KEYS.GAME_WEEK, gw);
  renderDashboard();
}

/**
 * Navigate to a tab from the dashboard quick links
 */
function dashGoToTab(tabName) {
  const tabs = document.querySelectorAll(".tab");
  const idx = TAB_INDEX_MAP[tabName];
  if (idx !== undefined && tabs[idx]) {
    tabs[idx].click();
  }
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
    showToast("❌ Error creating template.", 3000);
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
  if (inInput) return;

  const mod = e.ctrlKey || e.metaKey;

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

  // Undo: Ctrl+Z / Cmd+Z
  if (e.key === "z" && !e.shiftKey) {
    if (currentActiveTab === "script" && typeof undoScript === "function") {
      e.preventDefault();
      undoScript();
    }
    return;
  }

  // Redo: Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z
  if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
    if (currentActiveTab === "script" && typeof redoScript === "function") {
      e.preventDefault();
      redoScript();
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
        badge.className = "tab-badge";
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

// ── Count-up animation for dashboard cards ──
function _animateCountUp(el, target, duration) {
  duration = duration || 600;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  (function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * ease);
    if (p < 1) requestAnimationFrame(tick);
  })(start);
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
document.addEventListener("click", (e) => {
  if (!e.target.closest(".more-tools-wrap")) {
    document
      .querySelectorAll(".more-tools-wrap.open")
      .forEach((el) => el.classList.remove("open"));
  }
});

/* ── Delegated click handler ─────────────────────────────────────
 * Replaces all inline onclick= attributes in index.html.
 * Each interactive element uses data-action="fnName" (and optionally
 * data-arg / data-target) instead of inline JS.
 * ────────────────────────────────────────────────────────────────── */
const _ELEMENT_FNS = new Set([
  "toggleFilterSection",
  "toggleCollapsiblePanel",
  "setHeaderColor",
  "switchDisplayTab",
  "csPickerAddPlay",
  "toggleSirCollapse",
  "toggleScriptCheckbox",
  "toggleWbCheckbox",
  "moveSortCriteria",
  "removeScheduleGame",
  "setScheduleActive",
]);
const _BOOL_FNS = new Set(["toggleAllPbPrintOptions", "csSelectAllFields"]);

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  // Overlay close: only fire when clicking the overlay bg itself
  if (action.endsWith("Overlay")) {
    if (e.target !== el) return;
    const fn = window[action.slice(0, -7)];
    if (typeof fn === "function") fn();
    return;
  }

  // Click proxy: trigger click on another element
  if (action === "triggerClick") {
    const t = el.dataset.target;
    if (t) document.getElementById(t)?.click();
    return;
  }

  // Inline DOM toggles
  if (action === "toggleParentOpen") {
    el.parentElement.classList.toggle("open");
    return;
  }
  if (action === "removeParentOpen") {
    el.parentElement.classList.remove("open");
    return;
  }
  if (action === "reloadPage") {
    location.reload();
    return;
  }

  // ── Actions from dynamically-rendered HTML (overlays & panels) ──
  // These use data-idx / data-sid / data-layer etc. instead of data-arg,
  // so they must be dispatched explicitly before the generic fallback.
  switch (action) {
    case "setPeriodPreset": {
      const input = document.getElementById("newPeriodName");
      if (input) input.value = el.dataset.preset;
      return;
    }
    case "closePeriodOverlay": {
      const ov = el.closest(".period-create-overlay");
      if (ov) ov.remove();
      return;
    }
    case "doInsertTemplate": {
      doInsertTemplate(parseInt(el.dataset.idx, 10));
      const ov = el.closest(".period-create-overlay");
      if (ov) ov.remove();
      return;
    }
    case "doDeleteTemplate":
      doDeleteTemplate(parseInt(el.dataset.idx, 10));
      return;
    case "doImportFromCallSheet": {
      const modal = el.closest(".cs-import-modal");
      if (modal) doImportFromCallSheet(parseInt(el.dataset.idx, 10), modal);
      return;
    }
    case "csImportSelectAll": {
      const modal = el.closest(".cs-import-modal");
      if (modal)
        modal
          .querySelectorAll(".cs-import-cat-cb")
          .forEach((cb) => (cb.checked = true));
      return;
    }
    case "csImportClearAll": {
      const modal = el.closest(".cs-import-modal");
      if (modal)
        modal
          .querySelectorAll(".cs-import-cat-cb")
          .forEach((cb) => (cb.checked = false));
      return;
    }
    case "loadScript":
      loadScript(parseInt(el.dataset.sid, 10));
      return;
    case "renameSavedScript":
      renameSavedScript(parseInt(el.dataset.sid, 10));
      return;
    case "overwriteSavedScript":
      overwriteSavedScript(parseInt(el.dataset.sid, 10));
      return;
    case "deleteSavedScript":
      deleteSavedScript(parseInt(el.dataset.sid, 10));
      return;
    case "removeFilter":
      removeFilter(el.dataset.layer, el.dataset.filterValue);
      return;
    case "openCustomOrderModal":
      openCustomOrderModal(el.dataset.sortField || el.dataset.arg);
      return;
    case "loadCollection":
      loadCollection(parseInt(el.dataset.idx, 10));
      return;
    case "sendCollectionToScript":
      sendCollectionToScript(parseInt(el.dataset.idx, 10));
      return;
    case "sendCollectionToCallSheet":
      sendCollectionToCallSheet(parseInt(el.dataset.idx, 10));
      return;
    case "deleteCollection":
      deleteCollection(parseInt(el.dataset.idx, 10));
      return;
    case "_pbSortToggleDir":
      _pbSortToggleDir(parseInt(el.dataset.idx, 10));
      return;
    case "_pbSortRemove":
      _pbSortRemove(parseInt(el.dataset.idx, 10));
      return;
    // ── Callsheet delegation ──
    case "swapPlayHash":
      swapPlayHash(
        el.dataset.category,
        el.dataset.hash,
        parseInt(el.dataset.index, 10),
      );
      return;
    case "removeCallSheetPlay":
      removeCallSheetPlay(
        el.dataset.category,
        el.dataset.hash,
        parseInt(el.dataset.index, 10),
      );
      return;
    case "openCallSheetPlayPicker":
      openCallSheetPlayPicker(el.dataset.cat, el.dataset.hash);
      return;
    case "openCategoryMenu":
      openCategoryMenu(e, el.dataset.arg);
      return;
    case "csPickerAddPlay":
      csPickerAddPlay(el);
      return;
    case "deleteDisplayPreset":
      deleteDisplayPreset(parseInt(el.dataset.idx, 10));
      return;
    case "loadTemplate":
      loadTemplate(parseInt(el.dataset.idx, 10));
      return;
    case "deleteTemplate":
      deleteTemplate(parseInt(el.dataset.idx, 10));
      return;
    case "toggleCsSortDirection":
      toggleCsSortDirection(parseInt(el.dataset.idx, 10));
      return;
    case "removeCsSortCriteria":
      removeCsSortCriteria(parseInt(el.dataset.idx, 10));
      return;
    case "addSuggestionToSheet":
      addSuggestionToSheet(
        el.dataset.cat,
        el.dataset.hash,
        parseInt(el.dataset.idx, 10),
      );
      return;
    // ── Tendencies delegation ──
    case "editTendenciesPlay":
      editTendenciesPlay(parseInt(el.dataset.idx, 10));
      return;
    case "duplicateTendenciesPlay":
      duplicateTendenciesPlay(parseInt(el.dataset.idx, 10));
      return;
    case "deleteTendenciesPlay":
      deleteTendenciesPlay(parseInt(el.dataset.idx, 10));
      return;
    case "toggleTdFilter":
      toggleTdFilter(el.dataset.key, el.dataset.val);
      return;
    case "goToWizardStep":
      goToWizardStep(parseInt(el.dataset.idx, 10));
      return;
    case "setWizardField":
      setWizardField(el.dataset.key, el.dataset.val, el);
      return;
    // ── Wristband delegation ──
    case "switchCard":
      switchCard(parseInt(el.dataset.idx, 10));
      return;
    case "toggleSortDirection":
      toggleSortDirection(parseInt(el.dataset.idx, 10));
      return;
    case "removeSortCriteria":
      removeSortCriteria(parseInt(el.dataset.idx, 10));
      return;
    case "selectPlayForCell":
      selectPlayForCell(parseInt(el.dataset.idx, 10));
      return;
    case "loadWristband":
      loadWristband(parseInt(el.dataset.idx, 10));
      return;
    case "renameSavedWristband":
      renameSavedWristband(parseInt(el.dataset.idx, 10));
      return;
    case "overwriteSavedWristband":
      overwriteSavedWristband(parseInt(el.dataset.idx, 10));
      return;
    case "deleteSavedWristband":
      deleteSavedWristband(parseInt(el.dataset.idx, 10));
      return;
  }

  // General function dispatch
  const fn = window[action];
  if (typeof fn !== "function") return;

  const arg = el.dataset.arg;
  if (arg !== undefined && _ELEMENT_FNS.has(action)) {
    fn(arg, el);
  } else if (arg !== undefined && _BOOL_FNS.has(action)) {
    fn(arg === "true");
  } else if (arg !== undefined) {
    fn(arg);
  } else if (_ELEMENT_FNS.has(action)) {
    fn(el);
  } else {
    fn();
  }

  // Auto-close context menu if flagged
  if (el.dataset.ctxClose) {
    el.closest(".cs-context-menu")?.remove();
  }
});

/* ── Delegated listeners for dynamically-rendered HTML ────────────
 * Covers #scriptPlays, #availablePlays, #playbookTable, and
 * document-level actions from dynamically-created overlays.
 * ─────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  /* ---------- Script container: click ---------- */
  const scriptEl = document.getElementById("scriptPlays");
  if (scriptEl) {
    scriptEl.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      const idx = parseInt(el.dataset.idx, 10);
      const dir = parseInt(el.dataset.dir, 10);
      switch (action) {
        case "movePlay":
          movePlay(idx, dir);
          break;
        case "removeFromScript":
          removeFromScript(idx);
          break;
        case "duplicatePlay":
          duplicatePlay(idx);
          break;
        case "togglePeriodCollapse":
          togglePeriodCollapse(el.dataset.periodId);
          break;
        case "movePeriod":
          movePeriod(idx, dir);
          break;
        case "duplicatePeriod":
          duplicatePeriod(idx);
          break;
        case "savePeriodAsTemplate":
          savePeriodAsTemplate(idx);
          break;
        case "selectPeriodPlays":
          selectPeriodPlays(idx);
          break;
        case "sortPeriod":
          sortPeriod(idx);
          break;
        case "reversePeriod":
          reversePeriod(idx);
          break;
        case "openSmartScriptForPeriod":
          openSmartScriptForPeriod(idx);
          break;
        case "applyPreferredForPeriod":
          applyPreferredForPeriod(idx);
          break;
        case "pushPeriodToCallSheet":
          pushPeriodToCallSheet(idx);
          break;
        case "importFromCallSheet":
          importFromCallSheet(idx);
          break;
        case "copyPeriodAsText":
          copyPeriodAsText(idx);
          break;
        default:
          return; // let it bubble for unhandled actions
      }
      e.stopPropagation();
    });

    /* ---------- Script container: change ---------- */
    scriptEl.addEventListener("change", (e) => {
      const el = e.target;
      const field = el.dataset.field;
      if (!field) return;
      const idx = parseInt(el.dataset.idx, 10);
      switch (field) {
        case "hash":
          updateHash(idx, el.value);
          break;
        case "defFront":
          updateDefField(idx, "defFront", el.value);
          break;
        case "defCoverage":
          updateDefField(idx, "defCoverage", el.value);
          break;
        case "defStunt":
          updateDefField(idx, "defStunt", el.value);
          break;
        case "defBlitz":
          updateDefField(idx, "defBlitz", el.value);
          break;
        case "reps":
          updateReps(idx, el.value);
          break;
        case "notes":
          updateNotes(idx, el.value);
          break;
        case "bulkSelect":
          toggleBulkSelect(idx);
          break;
        case "periodColor":
          updatePeriodColor(idx, el);
          break;
        case "periodLabel":
          script[idx].label = el.value;
          saveScriptState();
          break;
        case "periodMinutes":
          updatePeriodMinutes(idx, el);
          break;
      }
    });

    /* ---------- Script container: dragstart/dragend ---------- */
    scriptEl.addEventListener("dragstart", (e) => {
      const el = e.target.closest("[data-drag]");
      if (!el) return;
      if (el.dataset.drag === "scriptStart") {
        handleScriptDragStart(e, parseInt(el.dataset.idx, 10));
      }
    });
    scriptEl.addEventListener("dragend", (e) => {
      if (e.target.closest("[data-drag]")) handleDragEnd(e);
    });
  }

  /* ---------- Available plays container: click + change ---------- */
  const availEl = document.getElementById("availablePlays");
  if (availEl) {
    availEl.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      if (el.dataset.action === "addToScript") {
        addToScript(parseInt(el.dataset.idx, 10));
        e.stopPropagation();
      }
    });
    availEl.addEventListener("change", (e) => {
      if (e.target.dataset.field === "availableSelect") {
        toggleAvailablePlaySelect(parseInt(e.target.dataset.idx, 10));
      }
    });
    availEl.addEventListener("dragstart", (e) => {
      const el = e.target.closest("[data-drag]");
      if (el && el.dataset.drag === "availStart") {
        handleDragStart(e, parseInt(el.dataset.idx, 10));
      }
    });
  }

  /* ---------- Playbook table: click + mouseover ---------- */
  const pbBody = document.querySelector("#playbookTable tbody");
  if (pbBody) {
    pbBody.addEventListener("click", (e) => {
      // Game plan toggle
      const gpBtn = e.target.closest("[data-action='togglePlaybookGamePlan']");
      if (gpBtn) {
        e.stopPropagation();
        togglePlaybookGamePlan(parseInt(gpBtn.dataset.idx, 10));
        return;
      }
      const row = e.target.closest("tr[data-action]");
      if (!row) return;
      const idx = parseInt(row.dataset.idx, 10);
      // Copy play name from play-cell click
      const cell = e.target.closest("[data-action='copyPlayName']");
      if (cell) {
        e.stopPropagation();
        copyPlayName(cell.dataset.play);
        return;
      }
      selectPlaybookRow(idx);
      e.stopPropagation();
    });
    pbBody.addEventListener("dblclick", (e) => {
      const row = e.target.closest("tr[data-idx]");
      if (!row) return;
      const rowIdx = parseInt(row.dataset.idx, 10);
      if (typeof openPlayEditor === "function") {
        openPlayEditor(rowIdx);
      }
      e.stopPropagation();
    });
    pbBody.addEventListener(
      "mouseenter",
      (e) => {
        const row = e.target.closest("tr[data-preview]");
        if (row) showPlayPreview(e, parseInt(row.dataset.preview, 10));
      },
      true,
    );
    pbBody.addEventListener(
      "mouseleave",
      (e) => {
        const row = e.target.closest("tr[data-preview]");
        if (row) hidePlayPreview();
      },
      true,
    );
  }

  /* ---------- Playbook sort: drag delegation ---------- */
  document.body.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[data-drag='pbSort']");
    if (el && typeof _pbSortDragStart === "function")
      _pbSortDragStart(e, parseInt(el.dataset.idx, 10));
  });
  document.body.addEventListener("dragover", (e) => {
    const el = e.target.closest("[data-drag='pbSort']");
    if (el && typeof _pbSortDragOver === "function") _pbSortDragOver(e);
  });
  document.body.addEventListener("drop", (e) => {
    const el = e.target.closest("[data-drag='pbSort']");
    if (el && typeof _pbSortDrop === "function")
      _pbSortDrop(e, parseInt(el.dataset.idx, 10));
  });
});

/* ── Delegated change / input handler ────────────────────────────
 * Replaces all inline onchange= and oninput= attributes in index.html.
 * Each element uses data-onchange="fnName" or data-oninput="fnName"
 * (semicolon-separated for compound calls).
 * Optional: data-pass="value" → pass el.value,
 *           data-pass="event" → pass the event,
 *           data-arg="x"     → pass the string x.
 * ─────────────────────────────────────────────────────────────── */
function _dispatchDataHandler(e, attr) {
  const el = e.target;
  const raw = el.dataset[attr]; // "onchange" → el.dataset.onchange
  if (!raw) return;
  const fns = raw.split(";");
  const pass = el.dataset.pass;
  const arg = el.dataset.arg;
  const key = el.dataset.key;
  for (const name of fns) {
    const fn = window[name];
    if (typeof fn !== "function") continue;
    if (key !== undefined && pass === "value") fn(key, el.value);
    else if (pass === "value") fn(el.value);
    else if (pass === "event") fn(e);
    else if (arg !== undefined) fn(arg);
    else fn();
  }
}
document.addEventListener("change", (e) => _dispatchDataHandler(e, "onchange"));
document.addEventListener("input", (e) => _dispatchDataHandler(e, "oninput"));

// ── PWA shortcut URL: ?tab=<name> → switch to that tab on load ──
(function _handleTabParam() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab && typeof showTab === "function") {
    // Defer until after init so the tab panels exist
    document.addEventListener("DOMContentLoaded", () => showTab(tab), {
      once: true,
    });
  }
})();
