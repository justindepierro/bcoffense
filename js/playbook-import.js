function showUpload() {
  if (typeof canManageSettings === "function" && !canManageSettings()) {
    showToast("Admin access is required for settings and imports.", {
      type: "warning",
      duration: 3000,
    });
    return;
  }

  if (typeof setWorkspaceSurface === "function") {
    setWorkspaceSurface("upload");
  } else {
    document.getElementById("mainApp").classList.add("hidden");
    document.getElementById("uploadSection").classList.remove("hidden");
  }

  const backBtn = document.getElementById("backToAppBtn");
  if (backBtn && (plays.length > 0 || typeof isMobileStartupShell === "function" && isMobileStartupShell())) {
    backBtn.classList.remove("hidden");
  }
}

function backToApp() {
  if (plays.length > 0 || typeof isMobileStartupShell === "function" && isMobileStartupShell()) {
    if (typeof setWorkspaceSurface === "function") {
      setWorkspaceSurface("app", { initModules: plays.length === 0 });
      if (plays.length === 0 && typeof ensureMobileStartupSurface === "function") {
        ensureMobileStartupSurface();
      }
      return;
    }
    document.getElementById("uploadSection").classList.add("hidden");
    document.getElementById("mainApp").classList.remove("hidden");
  }
}

function showLoadingOverlay(message) {
  hideLoadingOverlay();
  const overlay = document.createElement("div");
  overlay.className = "loading-overlay";
  overlay.id = "globalLoadingOverlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "assertive");
  overlay.innerHTML = `
    <div class="loading-overlay-content">
      <div class="loading-spinner loading-spinner-lg"></div>
      <span class="loading-overlay-text">${escapeHtml(message || "Loading\u2026")}</span>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  return overlay;
}

function hideLoadingOverlay() {
  const el = document.getElementById("globalLoadingOverlay");
  if (el) el.remove();
}

const _CSV_COLUMN_MAP = {
  playtype: "type",
  type: "type",
  personnel: "personnel",
  formation: "formation",
  formtag1: "formTag1",
  formtag2: "formTag2",
  under: "under",
  back: "back",
  shift: "shift",
  motion: "motion",
  protection: "protection",
  linecall: "lineCall",
  play: "play",
  playtag1: "playTag1",
  playtag2: "playTag2",
  baseplay: "basePlay",
  oneword: "oneWord",
  preferredsituation: "preferredSituation",
  preferreddown: "preferredDown",
  preferreddistance: "preferredDistance",
  preferredhash: "preferredHash",
  preferredfieldposition: "preferredFieldPosition",
  tempo: "tempo",
  practicefront: "practiceFront",
  practicedefense: "practiceDefense",
  practicecoverage: "practiceCoverage",
  practiceblitz: "practiceBlitz",
  practicestunt: "practiceStunt",
  keyplayer1: "keyPlayer1",
  keyplayer2: "keyPlayer2",
  keyplayer3: "keyPlayer3",
  keyplayername1: "keyPlayerName1",
  keyplayername2: "keyPlayerName2",
  keyplayername3: "keyPlayerName3",
  constraint1: "constraint1",
  constraint2: "constraint2",
  constraint3: "constraint3",
  constrant1: "constraint1",
  constrant2: "constraint2",
  constrant3: "constraint3",
  hitchart1: "hitChart1",
  hitchart2: "hitChart2",
  hitchart3: "hitChart3",
  keyplayer1hitchart: "hitChart1",
  keyplayer2hitchart: "hitChart2",
  keyplayer3hitchart: "hitChart3",
  preferredsitutation: "preferredSituation",
  preferredsitution: "preferredSituation",
  deadvs: "deadVs",
  opponent: "opponent",
  notes: "notes",
  playernotes: "playerNotes",
  playernote: "playerNotes",
  coachnotes: "playerNotes",
  coachesnotes: "playerNotes",
};

const _CSV_POS_KEYS = [
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
  "playerNotes",
];

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  function parseLine(line) {
    const vals = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === "," && !inQ) {
        vals.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    vals.push(cur.trim());
    return vals;
  }

  const firstRow = parseLine(lines[0]);
  const norm = firstRow.map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  const hits = norm.filter((header) => _CSV_COLUMN_MAP[header]);
  const useHeaders = hits.length >= 3;

  let headerMap = null;
  let startLine = 1;

  if (useHeaders) {
    headerMap = {};
    norm.forEach((header, index) => {
      if (_CSV_COLUMN_MAP[header]) headerMap[index] = _CSV_COLUMN_MAP[header];
    });
  } else if (firstRow.length >= 10) {
    startLine = 0;
  }

  const result = [];
  const skippedRows = [];

  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line.trim()) continue;
    const values = parseLine(line);
    if (values.length < 3) {
      skippedRows.push({ line: lineIndex + 1, reason: "Too few columns" });
      continue;
    }

    const play = {};
    if (headerMap) {
      _CSV_POS_KEYS.forEach((key) => {
        play[key] = "";
      });
      Object.entries(headerMap).forEach(([index, key]) => {
        play[key] = values[index] || "";
      });
    } else {
      if (values.length < 10) {
        skippedRows.push({
          line: lineIndex + 1,
          reason: "Too few columns (" + values.length + ")",
        });
        continue;
      }
      _CSV_POS_KEYS.forEach((key, index) => {
        play[key] = values[index] || "";
      });
    }

    if (!play.formation && !play.play && !play.type) {
      skippedRows.push({
        line: lineIndex + 1,
        reason: "Missing formation, play, and type",
      });
      continue;
    }
    result.push(play);
  }

  if (skippedRows.length > 0) {
    console.warn(`parseCSV: skipped ${skippedRows.length} invalid row(s)`);
  }

  // #94: Build field-mapping summary for import preview
  const fieldMapping = {
    recognized: [],
    unrecognized: [],
    usedHeaders: useHeaders,
  };
  if (useHeaders) {
    norm.forEach((h) => {
      if (h === "") return;
      if (_CSV_COLUMN_MAP[h]) {
        fieldMapping.recognized.push(_CSV_COLUMN_MAP[h]);
      } else {
        fieldMapping.unrecognized.push(h);
      }
    });
  }

  return { plays: result, skipped: skippedRows, fieldMapping };
}

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
  "playerNotes",
];

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

function _mKey(play) {
  return (
    (play.formation || "").toLowerCase().trim() +
    "\0" +
    (play.play || "").toLowerCase().trim()
  );
}

function _mFullKey(play) {
  return (
    (play.type || "").toLowerCase().trim() +
    "\0" +
    (play.personnel || "").toLowerCase().trim() +
    "\0" +
    (play.formation || "").toLowerCase().trim() +
    "\0" +
    (play.play || "").toLowerCase().trim()
  );
}

function _smartMerge(existing, incoming) {
  const eMatched = new Uint8Array(existing.length);
  const nMatched = new Uint8Array(incoming.length);
  const pairs = [];

  const byFull = new Map();
  existing.forEach((play, index) => {
    const key = _mFullKey(play);
    if (!byFull.has(key)) byFull.set(key, []);
    byFull.get(key).push(index);
  });
  incoming.forEach((play, incomingIndex) => {
    const key = _mFullKey(play);
    const candidates = byFull.get(key);
    if (!candidates) return;
    for (const existingIndex of candidates) {
      if (!eMatched[existingIndex]) {
        eMatched[existingIndex] = 1;
        nMatched[incomingIndex] = 1;
        pairs.push({ ei: existingIndex, ni: incomingIndex });
        break;
      }
    }
  });

  const byPart = new Map();
  existing.forEach((play, index) => {
    if (eMatched[index]) return;
    const key = _mKey(play);
    if (!byPart.has(key)) byPart.set(key, []);
    byPart.get(key).push(index);
  });
  incoming.forEach((play, incomingIndex) => {
    if (nMatched[incomingIndex]) return;
    const key = _mKey(play);
    const candidates = byPart.get(key);
    if (!candidates) return;
    for (const existingIndex of candidates) {
      if (!eMatched[existingIndex]) {
        eMatched[existingIndex] = 1;
        nMatched[incomingIndex] = 1;
        pairs.push({ ei: existingIndex, ni: incomingIndex });
        break;
      }
    }
  });

  const updated = [];
  const unchanged = [];
  for (const pair of pairs) {
    const oldPlay = existing[pair.ei];
    const newPlay = incoming[pair.ni];
    const changes = [];
    for (const field of _MERGE_FIELDS) {
      const oldValue = (oldPlay[field] || "").trim();
      const newValue = (newPlay[field] || "").trim();
      if (oldValue !== newValue) {
        changes.push({ field, from: oldValue, to: newValue });
      }
    }
    (changes.length ? updated : unchanged).push({ ...pair, changes });
  }

  const added = [];
  incoming.forEach((_, index) => {
    if (!nMatched[index]) added.push(index);
  });
  const removed = [];
  existing.forEach((_, index) => {
    if (!eMatched[index]) removed.push(index);
  });

  const merged = existing.map((play) => ({ ...play }));
  for (const update of updated) {
    const target = merged[update.ei];
    const source = incoming[update.ni];
    for (const field of _MERGE_FIELDS) target[field] = source[field] || "";
  }
  const addedPlays = added.map((index) => ({ ...incoming[index] }));
  merged.push(...addedPlays);

  return {
    merged,
    report: {
      updated,
      unchanged,
      added,
      removed,
      addedPlays,
      removedPlays: removed.map((index) => existing[index]),
      totalExisting: existing.length,
      totalNew: incoming.length,
      totalMerged: merged.length,
    },
  };
}

function _mergeUpdateRefs(existing, incoming, report) {
  if (report.updated.length === 0) {
    return { wristbands: 0, scripts: 0, callsheet: 0 };
  }

  const updates = report.updated.map((update) => ({
    old: existing[update.ei],
    nw: incoming[update.ni],
  }));
  const updatesByKey = new Map();
  for (const update of updates) {
    const key = _mKey(update.old);
    if (!updatesByKey.has(key)) updatesByKey.set(key, []);
    updatesByKey.get(key).push(update);
  }

  let wristbandCount = 0;
  let scriptCount = 0;
  let callSheetCount = 0;

  function applyUpdate(ref) {
    const key = _mKey(ref);
    const candidates = updatesByKey.get(key);
    if (!candidates) return false;
    for (const candidate of candidates) {
      if (playsMatch(ref, candidate.old)) {
        for (const field of _MERGE_FIELDS) ref[field] = candidate.nw[field] || "";
        return true;
      }
    }
    return false;
  }

  function applyScriptUpdate(ref) {
    const key = _mKey(ref);
    const candidates = updatesByKey.get(key);
    if (!candidates) return false;
    for (const candidate of candidates) {
      if (playsMatch(ref, candidate.old)) {
        for (const field of _MERGE_FIELDS) {
          if (!_MERGE_KEEP.has(field)) ref[field] = candidate.nw[field] || "";
        }
        return true;
      }
    }
    return false;
  }

  const savedWristbands = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  let wristbandsDirty = false;
  for (const wristband of savedWristbands) {
    if (!wristband.cards) continue;
    for (const card of wristband.cards) {
      if (!card.data) continue;
      for (let index = 0; index < card.data.length; index++) {
        if (card.data[index] && applyUpdate(card.data[index])) {
          wristbandCount++;
          wristbandsDirty = true;
        }
      }
    }
  }
  if (wristbandsDirty) {
    storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, savedWristbands);
  }

  if (typeof wristbandCards !== "undefined" && Array.isArray(wristbandCards)) {
    for (const card of wristbandCards) {
      if (!card.data) continue;
      for (let index = 0; index < card.data.length; index++) {
        if (card.data[index] && applyUpdate(card.data[index])) {
          wristbandCount++;
        }
      }
    }
  }

  const savedScripts = getSavedScripts();
  let scriptsDirty = false;
  for (const savedScript of savedScripts) {
    if (!savedScript.plays) continue;
    for (const item of savedScript.plays) {
      if (item.isSeparator || item.isBlank) continue;
      if (applyScriptUpdate(item)) {
        scriptCount++;
        scriptsDirty = true;
      }
    }
  }
  if (scriptsDirty) {
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  }

  if (typeof script !== "undefined" && Array.isArray(script)) {
    for (const item of script) {
      if (item.isSeparator || item.isBlank) continue;
      if (applyScriptUpdate(item)) scriptCount++;
    }
  }

  const savedCallSheet = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
  let callSheetDirty = false;
  if (savedCallSheet) {
    for (const categoryId of Object.keys(savedCallSheet)) {
      const bucket = savedCallSheet[categoryId];
      for (const side of ["left", "right"]) {
        if (!bucket[side]) continue;
        for (const play of bucket[side]) {
          if (applyUpdate(play)) {
            callSheetCount++;
            callSheetDirty = true;
          }
        }
      }
    }
    if (callSheetDirty) {
      storageManager.set(STORAGE_KEYS.CALL_SHEET, savedCallSheet);
      callSheet = savedCallSheet;
    }
  }

  if (!callSheetDirty && typeof callSheet !== "undefined" && callSheet) {
    for (const categoryId of Object.keys(callSheet)) {
      const bucket = callSheet[categoryId];
      for (const side of ["left", "right"]) {
        if (!bucket[side]) continue;
        for (const play of bucket[side]) {
          if (applyUpdate(play)) callSheetCount++;
        }
      }
    }
  }

  return {
    wristbands: wristbandCount,
    scripts: scriptCount,
    callsheet: callSheetCount,
  };
}

function _buildMergeReportHtml(report, refCounts, existingPlays) {
  const { updated, unchanged, added, removed, addedPlays, removedPlays } =
    report;

  let html = '<div class="merge-report">';
  html += '<div class="merge-report-grid">';
  html += `<span>🔄</span><span><strong>${updated.length}</strong> play${updated.length !== 1 ? "s" : ""} updated</span>`;
  html += `<span>➕</span><span><strong>${added.length}</strong> new play${added.length !== 1 ? "s" : ""} added</span>`;
  html += `<span>📌</span><span><strong>${unchanged.length}</strong> play${unchanged.length !== 1 ? "s" : ""} unchanged</span>`;
  if (removed.length > 0) {
    html += `<span>📁</span><span><strong>${removed.length}</strong> play${removed.length !== 1 ? "s" : ""} only in old playbook (kept)</span>`;
  }
  html += "</div>";

  const totalRefs =
    refCounts.wristbands + refCounts.scripts + refCounts.callsheet;
  if (totalRefs > 0) {
    html += '<div class="merge-report-section">';
    html += `<strong>🔗 ${totalRefs} reference${totalRefs !== 1 ? "s" : ""} updated:</strong><br>`;
    const parts = [];
    if (refCounts.wristbands) parts.push(`${refCounts.wristbands} in wristbands`);
    if (refCounts.scripts) parts.push(`${refCounts.scripts} in scripts`);
    if (refCounts.callsheet) parts.push(`${refCounts.callsheet} in call sheet`);
    html += "&nbsp;&nbsp;" + parts.join(", ");
    html += "</div>";
  }

  if (updated.length > 0) {
    html += '<details class="merge-report-details"><summary class="merge-report-summary">Updated plays</summary>';
    html += '<div class="merge-report-list merge-report-list--tall">';
    const shown = updated.slice(0, 20);
    for (const update of shown) {
      const play = existingPlays[update.ei];
      const name = (play.formation || "?") + " " + (play.play || "?");
      const fields = update.changes
        .slice(0, 4)
        .map((change) => change.field)
        .join(", ");
      const more = update.changes.length > 4 ? ", …" : "";
      html += `<div class="merge-report-row">• <strong>${escapeHtml(name)}</strong> — ${update.changes.length} field${update.changes.length !== 1 ? "s" : ""} <span class="merge-report-muted">(${escapeHtml(fields)}${more})</span></div>`;
    }
    if (updated.length > 20) {
      html += `<div class="merge-report-muted">…and ${updated.length - 20} more</div>`;
    }
    html += "</div></details>";
  }

  if (added.length > 0) {
    html += '<details class="merge-report-details"><summary class="merge-report-summary">New plays added</summary>';
    html += '<div class="merge-report-list merge-report-list--medium">';
    const shown = addedPlays.slice(0, 20);
    for (const play of shown) {
      html += `<div class="merge-report-row">• ${escapeHtml((play.formation || "?") + " " + (play.play || "?"))} (${escapeHtml(play.type || "?")})</div>`;
    }
    if (added.length > 20) {
      html += `<div class="merge-report-muted">…and ${added.length - 20} more</div>`;
    }
    html += "</div></details>";
  }

  if (removed.length > 0) {
    html += '<details class="merge-report-details"><summary class="merge-report-summary">Plays only in old playbook</summary>';
    html += '<div class="merge-report-list merge-report-list--medium">';
    html += '<div class="merge-report-muted-gap">These plays were not in the new CSV but have been kept in your playbook.</div>';
    const shown = removedPlays.slice(0, 20);
    for (const play of shown) {
      html += `<div class="merge-report-row">• ${escapeHtml((play.formation || "?") + " " + (play.play || "?"))} (${escapeHtml(play.type || "?")})</div>`;
    }
    if (removed.length > 20) {
      html += `<div class="merge-report-muted">…and ${removed.length - 20} more</div>`;
    }
    html += "</div></details>";
  }

  html += "</div>";
  return html;
}

function handleFileUpload(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;

    showLoadingOverlay("Importing playbook…");
    const reader = new FileReader();
    reader.onload = async function (loadEvent) {
      try {
        const text = loadEvent.target.result;
        const csvResult = parseCSV(text);
        const parsed = csvResult.plays || csvResult;
        const skippedRows = csvResult.skipped || [];
        const fieldMapping = csvResult.fieldMapping || { recognized: [], unrecognized: [], usedHeaders: false };
        if (typeof ensurePlaybookPlayIds === "function") ensurePlaybookPlayIds(parsed);

        if (parsed.length === 0) {
          hideLoadingOverlay();
          showToast(
            "❌ No valid plays found in file. Check the CSV format.",
            4000,
          );
          return;
        }

        // #95: Detect duplicates within the imported CSV
        const _keyMap = {};
        parsed.forEach((p) => {
          const k = _mFullKey ? _mFullKey(p) : `${p.formation}|${p.play}`;
          _keyMap[k] = (_keyMap[k] || 0) + 1;
        });
        const internalDupCount = Object.values(_keyMap).filter((v) => v > 1).length;
        const dupNote = internalDupCount > 0
          ? ` <span style="color:var(--color-warning)">⚠️ ${internalDupCount} duplicate play${internalDupCount > 1 ? "s" : ""} detected within this CSV.</span>`
          : "";

        // #94: Field mapping preview
        const mappingNote = (fieldMapping.usedHeaders && fieldMapping.unrecognized.length > 0)
          ? `<br><small style="color:var(--color-text-muted)">⚠️ Unrecognized columns (ignored): ${fieldMapping.unrecognized.slice(0, 5).map((h) => escapeHtml(h)).join(", ")}${fieldMapping.unrecognized.length > 5 ? "…" : ""}</small>`
          : (fieldMapping.usedHeaders && fieldMapping.recognized.length > 0)
            ? `<br><small style="color:var(--color-text-muted)">✓ Mapped: ${fieldMapping.recognized.slice(0, 8).map((h) => escapeHtml(h)).join(", ")}${fieldMapping.recognized.length > 8 ? "…" : ""}</small>`
            : "";

        const sample = parsed
          .slice(0, 3)
          .map(
            (play) =>
              `• ${escapeHtml(play.formation || "?")} ${escapeHtml(play.play || "?")} (${escapeHtml(play.type || "?")})`,
          )
          .join("<br>");

        const hasExisting = plays.length > 0;

        if (hasExisting) {
          const skipNote =
            skippedRows.length > 0
              ? ` <strong>(${skippedRows.length} row${skippedRows.length === 1 ? "" : "s"} skipped)</strong>`
              : "";
          const choiceMsg =
            `Found <strong>${parsed.length}</strong> play${parsed.length === 1 ? "" : "s"} in new CSV.${skipNote}${dupNote}${mappingNote}<br>` +
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
            const preMerge = plays.map((play) => ({ ...play }));
            const { merged, report } = _smartMerge(preMerge, parsed);
            if (typeof ensurePlaybookPlayIds === "function") ensurePlaybookPlayIds(merged);
            const refCounts = _mergeUpdateRefs(preMerge, parsed, report);

            plays = merged;
            filteredPlays = [...plays];
            storageManager.setPlaybook(plays);
            invalidateFilterCache();
            if (typeof renderTeamSettings === "function") renderTeamSettings();

            if (typeof setWorkspaceSurface === "function") {
              setWorkspaceSurface("app");
            } else {
              document.getElementById("uploadSection").classList.add("hidden");
              document.getElementById("mainApp").classList.remove("hidden");
            }
            initAllModules();
            hideLoadingOverlay();

            const reportHtml = _buildMergeReportHtml(report, refCounts, preMerge);
            await showModal(reportHtml, {
              title: "Merge Complete",
              icon: "✅",
            });

            if (skippedRows.length > 0) {
              const skipMsg = skippedRows
                .slice(0, 5)
                .map((skipped) => `Row ${skipped.line}: ${escapeHtml(skipped.reason)}`)
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
          const msg = `Found <strong>${parsed.length}</strong> play${parsed.length === 1 ? "" : "s"}.${skippedRows.length > 0 ? " <strong>(" + skippedRows.length + " row" + (skippedRows.length === 1 ? "" : "s") + " skipped)</strong>" : ""}${dupNote}${mappingNote}<br><br><em>Sample:</em><br>${sample}${parsed.length > 3 ? "<br>…" : ""}<br><br>Import these plays?`;
          const ok = await showConfirm(msg, {
            title: "Confirm CSV Import",
            icon: "📋",
            confirmText: `Import ${parsed.length} Plays`,
          });
          if (!ok) return;
        }

        plays = parsed;
        if (typeof ensurePlaybookPlayIds === "function") ensurePlaybookPlayIds(plays);
        filteredPlays = [...plays];
        storageManager.setPlaybook(plays);
        invalidateFilterCache();
        if (typeof renderTeamSettings === "function") renderTeamSettings();

        if (typeof setWorkspaceSurface === "function") {
          setWorkspaceSurface("app");
        } else {
          document.getElementById("uploadSection").classList.add("hidden");
          document.getElementById("mainApp").classList.remove("hidden");
        }
        initAllModules();
        hideLoadingOverlay();

        if (skippedRows.length > 0) {
          const skipMsg = skippedRows
            .slice(0, 5)
            .map((skipped) => `Row ${skipped.line}: ${escapeHtml(skipped.reason)}`)
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
    ["PlayerNotes", "Coach note shown to players in Swipe View", ""],
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
    const rows = headers
      .map(([column, desc, req]) => {
        const badge = req ? '<span class="csv-tpl-req">Required</span>' : "";
        return `<tr><td class="csv-tpl-col">${column}</td><td class="csv-tpl-desc">${desc}</td><td class="csv-tpl-center">${badge}</td></tr>`;
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
        <button type="button" class="btn btn-primary custom-modal-btn" id="csvTplOk">OK</button>
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
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
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
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`⬇️ Downloaded ${filename}`);
  } catch (err) {
    console.error("downloadCSVTemplate error:", err);
    showToast("❌ Error creating template.", { duration: 3000, type: "error" });
  }
}
