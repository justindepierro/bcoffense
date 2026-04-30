async function applyPreferredForPeriod(separatorIndex) {
  const periodPlayIndices = [];
  for (let index = separatorIndex + 1; index < script.length; index++) {
    if (script[index].isSeparator) break;
    periodPlayIndices.push(index);
  }

  if (periodPlayIndices.length === 0) {
    showToast("No plays in this period");
    return;
  }

  const periodLabel = script[separatorIndex].label || "Period";
  const ok = await showConfirm(
    `Apply preferred metadata to ${periodPlayIndices.length} play(s) in ${periodLabel}?\n\nThis will fill in Hash, Front, Coverage, Stunt, and Blitz from each play's metadata.`,
    { title: "Apply Preferred", icon: "⭐", confirmText: "Apply" },
  );
  if (!ok) {
    return;
  }

  saveScriptState();
  let updatedCount = 0;

  periodPlayIndices.forEach((index) => {
    const play = script[index];
    if (applyPreferredMetadataToPlay(play)) {
      syncScriptPlayMetadataFields(index);
      updatedCount++;
    }
  });

  setScriptToolbarStatus(`${periodLabel}: ${updatedCount} play(s) updated`, "success", AUTOSAVE_DEBOUNCE_MS);
}

async function pushPeriodToCallSheet(separatorIndex) {
  const periodPlays = [];
  for (let index = separatorIndex + 1; index < script.length; index++) {
    if (script[index].isSeparator) break;
    periodPlays.push(script[index]);
  }
  if (periodPlays.length === 0) {
    showToast("No plays in this period");
    return;
  }

  const periodLabel = script[separatorIndex].label || "Period";

  const ok = await showConfirm(
    `Push ${periodPlays.length} play(s) from <b>${periodLabel}</b> to matching call sheet categories?\n\nPlays will be placed using their preferred metadata (down, distance, situation, hash). Plays already on the sheet will be skipped.`,
    { title: "📋 Push to Call Sheet", icon: "📋", confirmText: "Push" },
  );
  if (!ok) return;

  if (
    typeof initCallSheet === "function" &&
    Object.keys(callSheet).length === 0
  ) {
    initCallSheet();
  }

  let placed = 0;
  let skipped = 0;
  let noMatch = 0;

  periodPlays.forEach((play) => {
    const matches =
      typeof findMatchingCategories === "function"
        ? findMatchingCategories(play)
        : [];
    if (matches.length === 0) {
      noMatch++;
      return;
    }

    matches.forEach((catId) => {
      if (!callSheet[catId]) callSheet[catId] = { left: [], right: [] };

      const data = callSheet[catId];
      const alreadyThere = [...(data.left || []), ...(data.right || [])].some(
        (existing) => playsMatch(existing, play),
      );
      if (alreadyThere) {
        skipped++;
        return;
      }

      const hash = (play.hash || play.preferredHash || "").toUpperCase();
      const side = hash === "R" ? "right" : "left";

      const csPlay = {
        ...play,
        playType: play.type,
        wristbandNumber: null,
        highlighted: false,
        borderColor: null,
        cellBg: null,
        cellTextColor: null,
        cellBold: false,
        cellItalic: false,
        cellUnderline: false,
        cellStrikethrough: false,
        cellFontSize: null,
        cellNote: null,
      };

      callSheet[catId][side].push(csPlay);
      placed++;
    });
  });

  if (typeof saveCallSheet === "function") saveCallSheet();
  showToast(
    `📋 Pushed from ${periodLabel}: ${placed} placed, ${skipped} already on sheet, ${noMatch} no match`,
  );
}

async function importFromCallSheet(separatorIndex) {
  if (
    typeof initCallSheet === "function" &&
    Object.keys(callSheet).length === 0
  ) {
    initCallSheet();
  }

  const categories =
    typeof CALLSHEET_CATEGORIES !== "undefined" ? CALLSHEET_CATEGORIES : [];
  const filledCats = categories.filter((cat) => {
    const data = callSheet[cat.id];
    if (!data) return false;
    return (data.left || []).length + (data.right || []).length > 0;
  });

  if (filledCats.length === 0) {
    showToast("Call sheet is empty — add plays to the call sheet first");
    return;
  }

  const periodLabel = script[separatorIndex].label || "Period";
  const overlay = document.createElement("div");
  overlay.className = "period-create-overlay";
  wireScriptOverlayDismiss(overlay);

  const catListHtml = filledCats
    .map((cat) => {
      const data = callSheet[cat.id] || { left: [], right: [] };
      const count = (data.left || []).length + (data.right || []).length;
      const displayName =
        typeof getCategoryDisplayName === "function"
          ? getCategoryDisplayName(cat)
          : cat.name;
      return `
      <label class="cs-import-cat-item">
        <input type="checkbox" value="${cat.id}" class="cs-import-cat-cb">
        <span class="cs-import-cat-color" style="background:${cat.color}"></span>
        <span class="cs-import-cat-name">${displayName}</span>
        <span class="cs-import-cat-count">${count}</span>
      </label>`;
    })
    .join("");

  overlay.innerHTML = `
    <div class="period-create-modal cs-import-modal">
      <h4>📋 Import from Call Sheet → ${periodLabel}</h4>
      <p class="cs-import-hint">Select categories to import plays from. Duplicates will be skipped.</p>
      <div class="cs-import-actions-top">
        <button class="btn btn-sm" data-action="csImportSelectAll">Select All</button>
        <button class="btn btn-sm" data-action="csImportClearAll">Clear</button>
      </div>
      <div class="cs-import-cat-list">
        ${catListHtml}
      </div>
      <div class="period-create-actions mt-md">
        <button class="btn btn-primary" data-action="doImportFromCallSheet" data-idx="${separatorIndex}">Import Selected</button>
        <button class="btn" data-action="closePeriodOverlay">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function doImportFromCallSheet(separatorIndex, modal) {
  const checked = modal.querySelectorAll(".cs-import-cat-cb:checked");
  const selectedIds = Array.from(checked).map((cb) => cb.value);

  if (selectedIds.length === 0) {
    showToast("Select at least one category");
    return;
  }

  const existingPlays = getPeriodPlays(separatorIndex);

  let imported = 0;
  let skipped = 0;
  const insertAt = findPeriodEndIndex(separatorIndex);

  selectedIds.forEach((catId) => {
    const data = callSheet[catId] || { left: [], right: [] };
    const allPlays = [...(data.left || []), ...(data.right || [])];

    allPlays.forEach((csPlay) => {
      const isDupe = existingPlays.some((existingPlay) => playsMatch(existingPlay, csPlay));
      if (isDupe) {
        skipped++;
        return;
      }

      const scriptPlay = {
        ...csPlay,
        type: csPlay.playType || csPlay.type || "",
        hash: csPlay.hash || "",
        tempo: csPlay.tempo || "",
        defFront: csPlay.defFront || "",
        defCoverage: csPlay.defCoverage || "",
        defStunt: csPlay.defStunt || "",
        defBlitz: csPlay.defBlitz || "",
        reps: csPlay.reps || 1,
        notes: csPlay.cellNote || csPlay.notes || "",
      };

      delete scriptPlay.highlighted;
      delete scriptPlay.borderColor;
      delete scriptPlay.cellBg;
      delete scriptPlay.cellTextColor;
      delete scriptPlay.cellBold;
      delete scriptPlay.cellItalic;
      delete scriptPlay.cellUnderline;
      delete scriptPlay.cellStrikethrough;
      delete scriptPlay.cellFontSize;
      delete scriptPlay.cellNote;
      delete scriptPlay.wristbandNumber;

      script.splice(insertAt + imported, 0, scriptPlay);
      imported++;
    });
  });

  modal.closest(".period-create-overlay").remove();

  markScriptDirty();
  renderScript();
  showToast(
    `📋 Imported ${imported} play(s) from call sheet${skipped > 0 ? `, ${skipped} duplicates skipped` : ""}`,
  );
}

function findPeriodEndIndex(separatorIndex) {
  for (let index = separatorIndex + 1; index < script.length; index++) {
    if (script[index].isSeparator) return index;
  }
  return script.length;
}