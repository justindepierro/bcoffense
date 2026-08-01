function openLoadWristbandToScriptModal() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);

  if (saved.length === 0) {
    showToast("No saved wristbands found — create one first");
    return;
  }

  const wristbandOptions = saved
    .map((wristband, index) => {
      const cellsPerCard = getWristbandRecordCellCount(wristband);
      const totalPlays = Array.isArray(wristband.cards)
        ? wristband.cards.reduce((sum, card) => {
          const cellData = Array.isArray(card?.data) ? card.data : card;
          return sum + (Array.isArray(cellData)
            ? cellData.slice(0, cellsPerCard).filter((play) => play && typeof play === "object").length
            : 0);
        }, 0)
        : 0;
      return `<option value="${index}">${escapeHtml(wristband.title)} (${totalPlays} plays)</option>`;
    })
    .join("");

  const modalHtml = `
    <div id="loadWbToScriptModal" class="modal-overlay show" data-action="closeLoadWbToScriptModalOverlay">
      <div class="modal-content modal-content-sm" role="dialog" aria-modal="true" aria-labelledby="loadWbToScriptTitle">
        <div class="modal-header-row">
          <h3 class="modal-title" id="loadWbToScriptTitle">➕ Load Wristband Plays to Script</h3>
          <button data-action="closeLoadWbToScriptModal" class="modal-close-btn" aria-label="Close load wristband modal">✕</button>
        </div>

        <div class="mb-md">
          <label class="modal-field-label">Select Wristband:</label>
          <select id="wbToScriptSelect" class="modal-field-input">
            ${wristbandOptions}
          </select>
        </div>

        <div class="mb-md">
          <label class="modal-field-label">Add to:</label>
          <select id="wbToScriptDestination" class="modal-field-input">
            <option value="new">New Period (from wristband)</option>
            <option value="current">Current Period / End of Script</option>
          </select>
        </div>

        <div class="mb-md">
          <label class="modal-field-label">Card(s) to load:</label>
          <select id="wbToScriptCards" class="modal-field-input">
            <option value="all">All Cards</option>
            <option value="1">Card 1 Only</option>
            <option value="2">Card 2 Only</option>
            <option value="3">Card 3 Only</option>
            <option value="4">Card 4 Only</option>
            <option value="5">Card 5 Only</option>
          </select>
        </div>

        <div class="modal-action-row mt-md">
          <button data-action="executeLoadWbToScript" class="btn btn-primary modal-btn-lg">
            ✅ Load Plays
          </button>
          <button data-action="closeLoadWbToScriptModal" class="btn modal-btn-lg">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

function closeLoadWbToScriptModal(event) {
  if (event && event.target.id !== "loadWbToScriptModal") return;
  const modal = document.getElementById("loadWbToScriptModal");
  if (modal) modal.remove();
}

function executeLoadWbToScript() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wristbandIndex = parseInt(
    document.getElementById("wbToScriptSelect").value,
    10,
  );
  const destination = document.getElementById("wbToScriptDestination").value;
  const cardChoice = document.getElementById("wbToScriptCards").value;

  if (
    Number.isNaN(wristbandIndex) ||
    wristbandIndex < 0 ||
    wristbandIndex >= saved.length
  ) {
    showToast("⚠️ Could not load wristband", { type: "warning" });
    return;
  }
  const wristband = saved[wristbandIndex];
  if (!wristband || !wristband.cards) {
    showToast("⚠️ Could not load wristband", { type: "warning" });
    return;
  }

  saveScriptState();

  const playsToAdd = [];
  const cellsPerCard = getWristbandRecordCellCount(wristband);
  wristband.cards.forEach((card, cardIndex) => {
    if (cardChoice !== "all" && parseInt(cardChoice, 10) !== cardIndex + 1) {
      return;
    }
    // Saved classic cards use card.data; accept the legacy array-shaped card
    // as well. Player cards intentionally expose only their active rows.
    const cellData = Array.isArray(card?.data) ? card.data : card;
    if (!Array.isArray(cellData)) return;
    cellData.slice(0, cellsPerCard).forEach((play) => {
      if (!play || typeof play !== "object") return;
      playsToAdd.push(
        typeof copyPlayWithSourceIdentity === "function"
          ? copyPlayWithSourceIdentity(play, { id: Date.now() + Math.random() })
          : { ...play, id: Date.now() + Math.random() },
      );
    });
  });

  if (playsToAdd.length === 0) {
    showToast("⚠️ No plays found in selected card(s)", { type: "warning" });
    return;
  }

  if (destination === "new") {
    script.push({
      isSeparator: true,
      label: wristband.title || "Wristband",
      minutes: 0,
      color: UI_COLORS.periodDefault,
      id: Date.now() + Math.random(),
    });
    playsToAdd.forEach((play) => script.push(play));
  } else {
    playsToAdd.forEach((play) => script.push(play));
  }

  closeLoadWbToScriptModal();
  renderScript();

  showToast(`✅ Added ${playsToAdd.length} plays from "${wristband.title}"`);
}

function getScriptVisiblePlayerLineup(play, opts = {}) {
  if (opts.hidePersonnel || play?.scriptHidePersonnel) return [];

  return getTeamAssignmentSlots(play?.personnel)
    .filter((slot) => {
      if (!opts.hideLinemen) return true;
      return !["lt", "lg", "c", "rg", "rt"].includes(slot.key);
    })
    .map((slot) => {
      const playerId = String(getScriptPlayerAssignments(play)?.[slot.key] || "").trim();
      if (!playerId) return null;
      return {
        key: slot.key,
        label: slot.label,
        playerName: getTeamPlayerSelectionDisplay(playerId),
      };
    })
    .filter(Boolean);
}

function getScriptPrintColumns(opts = {}) {
  const widths = opts.showWbNum
    ? {
      num: "3.5%",
      hash: "4.5%",
      tempo: "6%",
      wb: "5%",
      call: "42%",
      type: "8%",
      front: "8%",
      cov: "6%",
      stunt: "7%",
      blitz: "6%",
      reps: "4%",
    }
    : {
      num: "3.5%",
      hash: "4.5%",
      tempo: "6%",
      call: "47%",
      type: "8%",
      front: "8%",
      cov: "6%",
      stunt: "7%",
      blitz: "6%",
      reps: "4%",
    };
  const columns = [
    {
      key: "num",
      label: "#",
      width: widths.num,
      render: (_play, displayNum) => `<strong>${displayNum}</strong>`,
    },
    {
      key: "hash",
      label: "Hash",
      width: widths.hash,
      render: (play) => escapeHtml(play.hash || "-"),
    },
    {
      key: "tempo",
      label: "Tempo",
      width: widths.tempo,
      render: (play) => escapeHtml(play.tempo || "-"),
    },
  ];

  if (opts.showWbNum) {
    columns.push({
      key: "wb",
      label: "WB#",
      width: widths.wb,
      render: (play) => {
        const wristbandNumber = typeof findPlayOnWristband === "function"
          ? findPlayOnWristband(play)
          : null;
        return wristbandNumber === null ? "-" : `#${wristbandNumber}`;
      },
    });
  }

  columns.push(
    {
      key: "call",
      label: "Play Call",
      width: widths.call,
      render: (play) => getScriptFullCall(play, opts),
    },
    {
      key: "type",
      label: "Type",
      width: widths.type,
      render: (play) => escapeHtml(play.type || "-"),
    },
    {
      key: "front",
      label: "Front",
      width: widths.front,
      render: (play) => escapeHtml(play.defFront || "-"),
    },
    {
      key: "cov",
      label: "Cov",
      width: widths.cov,
      render: (play) => escapeHtml(play.defCoverage || "-"),
    },
    {
      key: "stunt",
      label: "Stunt",
      width: widths.stunt,
      render: (play) => escapeHtml(play.defStunt || "-"),
    },
    {
      key: "blitz",
      label: "Blitz",
      width: widths.blitz,
      render: (play) => escapeHtml(play.defBlitz || "-"),
    },
    {
      key: "reps",
      label: "Reps",
      width: widths.reps,
      render: (play) => `×${escapeHtml(String(play.reps ?? 1))}`,
    },
  );

  return columns;
}

function buildScriptPlayRow(play, displayNum, opts = {}) {
  const columns = getScriptPrintColumns(opts);
  const visibleLineup = getScriptVisiblePlayerLineup(play, opts);
  const noteText = String(play.notes || "").trim();

  // Chrome can paint a scroll-gutter/backdrop through a transparent final
  // table cell in native print preview. Give every printed play row an
  // explicit cell background (white unless a coaching highlight applies),
  // rather than relying on the table behind it.
  let rowBackground = "#ffffff";
  if (opts.highlightHuddle && play.tempo && play.tempo.toLowerCase() === "huddle") {
    rowBackground = UI_COLORS.highlightHuddle;
  } else if (
    opts.highlightCandy &&
    play.tempo &&
    play.tempo.toLowerCase() === "candy"
  ) {
    rowBackground = UI_COLORS.highlightCandy;
  }

  const rowStyle = `--script-print-row-bg: ${rowBackground}; background: ${rowBackground};`;

  const mainRow = `<tr class="script-print-play-row" style="${rowStyle}">
    ${columns
      .map(
        (column) => {
          return `<td class="script-table-cell script-table-cell--${column.key}">${column.render(play, displayNum)}</td>`;
        },
      )
      .join("")}
  </tr>`;

  const noteRow = noteText
    ? `<tr class="script-print-play-note-row">
    <td class="script-print-play-note-cell" colspan="${columns.length}">
      <span class="script-print-note-label">Note</span>
      <span class="script-print-note-text">${escapeHtml(noteText)}</span>
    </td>
  </tr>`
    : "";

  const personnelRow = visibleLineup.length
    ? `<tr class="script-print-personnel-row">
    <td class="script-print-personnel-cell" colspan="${columns.length}">
      <div class="script-print-personnel-grid" style="grid-template-columns: repeat(${visibleLineup.length}, minmax(0, 1fr));">
        ${visibleLineup
      .map(
        (entry) => `
          <div class="script-print-personnel-pill">
            <span class="script-print-personnel-pos">${escapeHtml(entry.label)}</span>
            <span class="script-print-personnel-name">${escapeHtml(entry.playerName)}</span>
          </div>
        `,
      )
      .join("")}
      </div>
    </td>
  </tr>`
    : "";

  return `${mainRow}${noteRow}${personnelRow}`;
}

function buildScriptPrintBodyMarkup(playsToRender, opts = {}, options = {}) {
  const columns = getScriptPrintColumns(opts);
  let bodyHtml = "";
  if (options.scriptHeaderMarkup) {
    const headerGroupClass = [
      "print-script-header-group",
      options.scriptHeaderGroupClass || "",
    ]
      .filter(Boolean)
      .join(" ");
    bodyHtml += `<tbody class="${headerGroupClass}">${options.scriptHeaderMarkup}</tbody>`;
  }

  // Group plays by period so each group lives in its own <tbody>. The CSS
  // rule `.print-period-group { break-inside: avoid }` then keeps the period
  // header and its plays on the same printed page when they fit.
  const groups = [];
  let current = { separator: null, plays: [] };
  playsToRender.forEach((play) => {
    if (play.isSeparator) {
      if (current.separator || current.plays.length) groups.push(current);
      current = { separator: play, plays: [] };
    } else {
      current.plays.push(play);
    }
  });
  if (current.separator || current.plays.length) groups.push(current);

  groups.forEach((group) => {
    let groupHtml = "";
    if (group.separator) {
      const sep = group.separator;
      const playCount = group.plays.length;
      const metaParts = [];
      if (sep.minutes) metaParts.push(`${sep.minutes} min`);
      if (playCount) metaParts.push(`${playCount} play${playCount === 1 ? "" : "s"}`);
      const metaMarkup = metaParts.length
        ? `<span class="print-period-meta">${escapeHtml(metaParts.join(" • "))}</span>`
        : "";
      const periodNotes = String(sep.notes || "").trim();
      const periodColor = sep.color || (typeof UI_COLORS !== "undefined" ? UI_COLORS.periodDefault : "#333333");
      const textColor = typeof isColorDark === "function" && isColorDark(periodColor) ? "#ffffff" : "#111111";
      const headerStyle = `background: ${periodColor} !important; color: ${textColor} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;`;
      groupHtml += `
        <tr class="print-period-header" style="${headerStyle}">
          <td colspan="${columns.length}" style="${headerStyle}">
            <div class="script-print-period-block" style="color: ${textColor} !important;">
              <span class="print-period-title" style="color: ${textColor} !important;">${escapeHtml(sep.label || "Period")}</span>
              ${metaMarkup}
            </div>
          </td>
        </tr>`;
      if (periodNotes) {
        groupHtml += `
        <tr class="print-period-notes-row">
          <td class="print-period-notes-cell" colspan="${columns.length}">
            <span class="script-print-note-label">Period Notes</span>
            <span class="script-print-note-text">${escapeHtml(periodNotes)}</span>
          </td>
        </tr>`;
      }
    }
    // Per-period numbering: each period restarts at 1.
    let displayNum = 0;
    group.plays.forEach((play) => {
      displayNum += 1;
      groupHtml += buildScriptPlayRow(play, displayNum, opts);
    });
    bodyHtml += `<tbody class="print-period-group">${groupHtml}</tbody>`;
  });

  return bodyHtml;
}

/**
 * Apply the active team color preset to the preview container (screen + print).
 * Sets CSS custom properties for the on-screen preview and returns extra
 * @media print CSS to append to setupPrintPageStyle so the header row
 * gets the right background when printed.
 *
 * @param {HTMLElement} previewEl - #previewContainer element
 * @returns {string} CSS text (may be empty string if no preset is active)
 */
function _applyScriptColorPreset(previewEl) {
  var preset = typeof getActiveColorPreset === "function" ? getActiveColorPreset() : null;
  // Always clear previously applied inline colors first
  previewEl.querySelectorAll(".script-table th").forEach(function (th) {
    th.style.removeProperty("color");
    th.style.removeProperty("border-bottom-color");
  });
  var teamNameEl = previewEl.querySelector(".preview-team-name");
  if (teamNameEl) teamNameEl.style.removeProperty("color");
  previewEl.style.removeProperty("--cp-hdr");

  if (preset) {
    // Set --cp-hdr on the container (used by the screen-preview CSS rule in components.css)
    previewEl.style.setProperty("--cp-hdr", preset.primary);
    // Apply inline !important directly to each th — this beats any stylesheet
    // `!important` rule (inline important outranks author-stylesheet important in
    // the CSS cascade). It also survives cloneNode(true) in showPrintPreview, so
    // the preview modal shows the team color without needing ID-based CSS.
    previewEl.querySelectorAll(".script-table th").forEach(function (th) {
      th.style.setProperty("color", preset.primary, "important");
      th.style.setProperty("border-bottom-color", preset.primary, "important");
    });
    if (teamNameEl) teamNameEl.style.setProperty("color", preset.primary, "important");
    // Also override the CSS custom properties as a belt-and-suspenders fallback for print
    return (
      "@media print {" +
      " body.print-script .script-preview {" +
      " --script-print-ink: " + preset.primary + ";" +
      " --script-print-grid: " + preset.primary + ";" +
      " }" +
      "}"
    );
  }
  return "";
}

function setScriptColorScheme(presetId) {
  setActiveColorPreset(presetId || "");
  var preset = presetId
    ? TEAM_COLOR_PRESETS.find(function (p) { return p.id === presetId; })
    : null;
  var newColor = preset ? preset.primary : UI_COLORS.periodDefault;

  // Sync all period separators to the new color (or default when clearing)
  var changed = script.some(function (item) {
    return item.isSeparator && item.color !== newColor;
  });
  if (changed) saveScriptState();
  script.forEach(function (item) {
    if (item.isSeparator) item.color = newColor;
  });

  // Directly update DOM for instant visual feedback (no RAF delay)
  document.querySelectorAll("#scriptPlays .period-header").forEach(function (el) {
    el.style.background = newColor;
  });
  document.querySelectorAll("#scriptPlays .period-header-wrapper").forEach(function (el) {
    el.style.borderLeftColor = newColor;
  });
  document.querySelectorAll("#scriptPlays .ph-color-input").forEach(function (el) {
    el.value = newColor;
  });

  if (changed) requestRenderScript();

  showToast(preset ? "\uD83C\uDFA8 Scheme: " + preset.label : "Color scheme cleared.", 2000);
}

function buildScriptPrintTableMarkup(opts = {}, bodyMarkup = "") {
  const columns = getScriptPrintColumns(opts);
  const colgroupMarkup = `<colgroup>${columns
    .map((column) => `<col class="script-col-${column.key}" style="width: ${column.width || "auto"};">`)
    .join("")}</colgroup>`;
  const theadMarkup = `<thead><tr>${columns
    .map((column) => `<th class="col-${column.key}">${escapeHtml(column.label)}</th>`)
    .join("")}</tr></thead>`;
  // bodyMarkup already wraps each period in <tbody class="print-period-group">.
  // Fall back to a single tbody if the markup didn't open one (shouldn't
  // happen, but keep the table well-formed).
  const tbodyMarkup = bodyMarkup.includes("<tbody")
    ? bodyMarkup
    : `<tbody id="previewBody">${bodyMarkup}</tbody>`;
  return colgroupMarkup + theadMarkup + tbodyMarkup;
}

function renderScriptPrintTable(opts = {}, bodyMarkup = "") {
  const table = document.getElementById("previewTable");
  if (!table) return;

  // Direct innerHTML is safe — getFullCall/escapeHtml already escape user
  // content. setInnerHTML would drop orphan table nodes outside table context.
  table.innerHTML = buildScriptPrintTableMarkup(opts, bodyMarkup);
}

function exportScriptCSV() {
  const playsToExport = script.filter((item) => !item.isSeparator);
  if (playsToExport.length === 0) {
    showToast("No plays in script to export.");
    return;
  }

  const headers = [
    "Period",
    "Order",
    "Formation",
    "Protection",
    "Play",
    "Type",
    "Back",
    "Motion",
    "Tempo",
    "Personnel",
    "Reps",
    "Hash",
    "Situation",
    "Down",
    "Distance",
    "Field Position",
    "Def Front",
    "Def Coverage",
    "Def Stunt",
    "Def Blitz",
    "Players",
    "Notes",
  ];

  let currentPeriod = "";
  let playOrder = 0;
  const rows = [];
  script.forEach((item) => {
    if (item.isSeparator) {
      currentPeriod = item.label || "Period";
      playOrder = 0;
      return;
    }
    playOrder++;
    const esc = (value) => {
      const stringValue = String(value ?? "");
      return stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
        ? '"' + stringValue.replace(/"/g, '""') + '"'
        : stringValue;
    };
    rows.push([
      esc(currentPeriod),
      playOrder,
      esc(item.formation),
      esc(item.protection),
      esc(item.play),
      esc(item.type),
      esc(item.back),
      esc(item.motion),
      esc(item.tempo),
      esc(item.personnel),
      item.reps ?? 1,
      esc(item.hash),
      esc(item.preferredSituation),
      esc(item.preferredDown),
      esc(item.preferredDistance),
      esc(item.preferredFieldPosition),
      esc(item.defFront),
      esc(item.defCoverage),
      esc(item.defStunt),
      esc(item.defBlitz),
      esc(getScriptVisiblePlayerSummary(item, getScriptDisplayOptions())),
      esc(item.notes),
    ]);
  });

  const csv =
    headers.join(",") + "\n" + rows.map((row) => row.join(",")).join("\n");
  const scriptName =
    document.getElementById("scriptName")?.value || "Practice Script";
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = typeof getPrintStudioExportName === "function"
    ? getPrintStudioExportName("Practice-Script", scriptName, "csv")
    : `${scriptName.replace(/\s+/g, "_")}_${dateStr}.csv`;

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`✅ Exported ${playsToExport.length} plays to ${filename}`);
}

function exportScriptAsText() {
  if (script.length === 0) {
    showToast("No plays in script to export.");
    return;
  }
  const lines = [];
  const scriptName =
    document.getElementById("scriptName")?.value || "Practice Script";
  const dateStr =
    document.getElementById("scriptDate")?.value ||
    new Date().toISOString().slice(0, 10);
  lines.push(`${scriptName} — ${dateStr}`);
  lines.push("=".repeat(50));
  let playOrder = 0;
  let inPeriod = false;
  let currentPeriodCallOptions = {};
  script.forEach((item) => {
    if (item.isSeparator) {
      if (inPeriod) lines.push("");
      inPeriod = true;
      playOrder = 0;
      currentPeriodCallOptions = getPeriodCallDisplayOptions(item);
      const periodMins = item.minutes ? ` (${item.minutes} min)` : "";
      lines.push(`\n[${item.label || "Period"}]${periodMins}`);
      lines.push("-".repeat(30));
    } else {
      playOrder++;
      const call = getScriptFullCall(item, currentPeriodCallOptions);
      const type = item.type ? ` [${item.type}]` : "";
      const notes = item.notes ? ` — ${item.notes}` : "";
      const reps = (item.reps || 1) > 1 ? ` ×${item.reps}` : "";
      const players = getScriptVisiblePlayerSummary(
        item,
        getScriptDisplayOptions(),
      );
      const playerText = players ? ` — Players: ${players}` : "";
      lines.push(
        `${String(playOrder).padStart(3, " ")}. ${call}${type}${reps}${notes}${playerText}`,
      );
    }
  });
  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = typeof getPrintStudioExportName === "function"
    ? getPrintStudioExportName("Practice-Script", scriptName, "txt")
    : `${scriptName.replace(/\s+/g, "_")}_${dateStr}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("✅ Script exported as text file", { type: "success" });
}

function printPeriod(separatorIndex) {
  separatorIndex = parseInt(separatorIndex, 10);
  const separator = script[separatorIndex];
  if (Number.isNaN(separatorIndex) || !separator?.isSeparator) return;

  try {
    const name = document.getElementById("scriptName")?.value || "Practice Script";
    const date = document.getElementById("scriptDate")?.value;
    const teamName = getTeamName();
    const periodLabel = separator.label || "Period";
    const periodItems = [separator, ...getPeriodPlays(separatorIndex)];
    const periodPlayCount = Math.max(0, periodItems.length - 1);
    const displayOpts = getScriptDisplayOptions();
    const dateStr = date
      ? new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
      : "";

    document.getElementById("previewTeamName").textContent = teamName || "";
    document.getElementById("previewTitle").textContent = `${name} - ${periodLabel}`;
    document.getElementById("previewMeta").textContent = dateStr;
    document.getElementById("previewPeriodSummary").innerHTML = `
      <div class="preview-summary-bar">
        <span><strong>${periodPlayCount}</strong> plays</span>
        ${separator.minutes ? `<span><strong>${separator.minutes}</strong> min</span>` : ""}
        ${separator.notes ? `<span>${escapeHtml(separator.notes)}</span>` : ""}
      </div>
    `;

    renderScriptPrintTable(
      displayOpts,
      buildScriptPrintBodyMarkup(periodItems, displayOpts),
    );

    document.getElementById("previewContainer").classList.remove("hidden");
    document.getElementById("wristbandPrint").classList.add("hidden");
    document.body.classList.add("print-script");

    const _periodColorCSS = _applyScriptColorPreset(document.getElementById("previewContainer"));
    setupPrintPageStyle(
      "@media print { @page { size: letter; margin: 0.25in; } }" + _periodColorCSS,
    );

    setTimeout(() => {
      const previewEl = document.getElementById("previewContainer");
      const cleanupScript = () => {
        previewEl.classList.add("hidden");
        document.body.classList.remove("print-script");
      };
      const printNow = () => {
        const restoreTitle = setPrintTitle("Practice Script", `${name} ${periodLabel}`);
        const finishPrint = () => {
          restoreTitle();
          cleanupScript();
        };
        if (typeof printIsolatedArtifact === "function" && printIsolatedArtifact(previewEl, {
          title: document.title,
          onAfterPrint: finishPrint,
        })) {
          return;
        }
        try {
          window.print();
        } finally {
          finishPrint();
        }
      };
      if (typeof showPrintPreview === "function") {
        showPrintPreview(previewEl, printNow, cleanupScript);
      } else {
        printNow();
      }
    }, 100);
  } catch (err) {
    console.error("printPeriod error:", err);
    document.getElementById("previewContainer")?.classList?.add("hidden");
    document.body.classList.remove("print-script");
    showToast("❌ Error printing period.", {
      duration: 4000,
      type: "error",
    });
  }
}

function generatePDF() {
  try {
    const name = document.getElementById("scriptName").value;
    const date = document.getElementById("scriptDate").value;
    const teamName = getTeamName();

    const dateStr = date
      ? new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
      : "";
    document.getElementById("previewTeamName").textContent = teamName || "";
    document.getElementById("previewTitle").textContent =
      name || "Practice Script";
    document.getElementById("previewMeta").textContent = dateStr;

    const periods = script.filter((play) => play.isSeparator);
    const summaryEl = document.getElementById("previewPeriodSummary");
    if (periods.length > 0) {
      const totalPlays = script.filter((play) => !play.isSeparator).length;
      const totalTime = periods.reduce(
        (sum, play) => sum + (play.minutes || 0),
        0,
      );
      summaryEl.innerHTML = `
      <div class="preview-summary-bar">
        <span><strong>${totalPlays}</strong> plays</span>
        <span><strong>${periods.length}</strong> periods</span>
        ${totalTime > 0 ? `<span><strong>${totalTime}</strong> min total</span>` : ""}
      </div>
    `;
    } else {
      summaryEl.innerHTML = "";
    }

    const displayOpts = getScriptDisplayOptions();
    renderScriptPrintTable(
      displayOpts,
      buildScriptPrintBodyMarkup(script, displayOpts),
    );

    document.getElementById("previewContainer").classList.remove("hidden");
    document.getElementById("wristbandPrint").classList.add("hidden");
    document.body.classList.add("print-script");

    const _pdfColorCSS = _applyScriptColorPreset(document.getElementById("previewContainer"));
    setupPrintPageStyle(
      "@media print { @page { size: letter; margin: 0.25in; } }" + _pdfColorCSS,
    );

    setTimeout(() => {
      const previewEl = document.getElementById("previewContainer");
      const cleanupScript = () => {
        previewEl.classList.add("hidden");
        document.body.classList.remove("print-script");
      };
      if (typeof showPrintPreview === "function") {
        showPrintPreview(
          previewEl,
          () => {
            const restoreTitle = setPrintTitle("Practice Script", name || "");
            const finishPrint = () => {
              restoreTitle();
              cleanupScript();
            };
            if (typeof printIsolatedArtifact === "function" && printIsolatedArtifact(previewEl, {
              title: document.title,
              onAfterPrint: finishPrint,
            })) {
              return;
            }
            try {
              window.print();
            } finally {
              finishPrint();
            }
          },
          cleanupScript,
        );
      } else {
        const restoreTitle = setPrintTitle("Practice Script", name || "");
        const finishPrint = () => {
          restoreTitle();
          cleanupScript();
        };
        if (typeof printIsolatedArtifact === "function" && printIsolatedArtifact(previewEl, {
          title: document.title,
          onAfterPrint: finishPrint,
        })) {
          return;
        }
        try {
          window.print();
        } finally {
          finishPrint();
        }
      }
    }, 100);
  } catch (err) {
    console.error("generatePDF error:", err);
    document.getElementById("previewContainer")?.classList?.add("hidden");
    document.body.classList.remove("print-script");
    showToast("❌ Error generating print preview.", {
      duration: 4000,
      type: "error",
    });
  }
}

function _getCurrentScriptPacketRecord() {
  return {
    sourceKey: "current",
    name: document.getElementById("scriptName")?.value || "Current Script",
    date: document.getElementById("scriptDate")?.value || "",
    plays: Array.isArray(script) ? script : [],
    isCurrent: true,
  };
}

function _getScriptPacketRecords() {
  const savedScripts = getSavedScripts();
  return [
    _getCurrentScriptPacketRecord(),
    ...savedScripts.map((savedScript) => ({
      ...savedScript,
      sourceKey: `saved:${String(savedScript.id)}`,
      isCurrent: false,
    })),
  ];
}

function _getScriptPacketRecordStats(record) {
  const rows = Array.isArray(record?.plays) ? record.plays : [];
  const playCount = rows.filter((play) => play && !play.isSeparator).length;
  const periodRows = rows.filter((play) => play?.isSeparator);
  return {
    playCount,
    periodCount: periodRows.length,
    totalMinutes: periodRows.reduce(
      (sum, period) => sum + (Number(period.minutes) || 0),
      0,
    ),
    periods: periodRows
      .map((period) => String(period.label || "").trim())
      .filter(Boolean),
  };
}

function updateScriptPacketSummary() {
  const checked = Array.from(
    document.querySelectorAll(".day-script-checkbox:checked:not(:disabled)"),
  );
  const scriptCount = checked.length;
  const playCount = checked.reduce(
    (sum, checkbox) => sum + (Number(checkbox.dataset.playCount) || 0),
    0,
  );
  const periodCount = checked.reduce(
    (sum, checkbox) => sum + (Number(checkbox.dataset.periodCount) || 0),
    0,
  );
  const summary = document.getElementById("scriptPacketSelectionSummary");
  if (summary) {
    summary.textContent = scriptCount
      ? `${scriptCount} script${scriptCount === 1 ? "" : "s"} • ${playCount} plays • ${periodCount} periods`
      : "Select at least one script";
  }
  const printButton = document.getElementById("printScriptPacketBtn");
  if (printButton) printButton.disabled = scriptCount === 0;
}

function loadFullDayScriptList(forceShow = false) {
  const records = _getScriptPacketRecords();
  const container = document.getElementById("fullDayScriptList");
  const section = document.getElementById("fullDaySection");
  if (!container || !section) return;

  const existingTitle = document.getElementById("scriptPacketTitle")?.value || "";
  const selectedKeys = new Set(
    Array.from(document.querySelectorAll(".day-script-checkbox:checked")).map(
      (checkbox) => checkbox.value,
    ),
  );
  const printableRecords = records.filter(
    (record) => _getScriptPacketRecordStats(record).playCount > 0,
  );

  if (printableRecords.length === 0 && !forceShow) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  const hasPreviousSelection = selectedKeys.size > 0;
  const defaultKey = printableRecords.some((record) => record.isCurrent)
    ? "current"
    : printableRecords[0]?.sourceKey || "";

  container.innerHTML = records
    .map((record) => {
      const stats = _getScriptPacketRecordStats(record);
      const disabled = stats.playCount === 0;
      const checked =
        !disabled &&
        (selectedKeys.has(record.sourceKey) ||
          (!hasPreviousSelection && record.sourceKey === defaultKey));
      const dateStr = record.date
        ? new Date(record.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        : "";
      const periodsStr = stats.periods.join(", ");
      return `
      <label class="full-day-item">
        <input type="checkbox" class="day-script-checkbox" value="${escapeHtml(record.sourceKey)}"
          data-play-count="${stats.playCount}" data-period-count="${stats.periodCount}"
          data-onchange="updateScriptPacketSummary" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
        <div class="full-day-item-info">
          <span class="full-day-item-name">
            ${escapeHtml(record.name)}
            ${record.isCurrent ? '<span class="script-packet-current-badge">Current draft</span>' : ""}
          </span>
          <span class="full-day-item-meta">
            ${stats.playCount} plays${stats.periodCount ? ` • ${stats.periodCount} periods` : ""}${stats.totalMinutes ? ` • ${stats.totalMinutes} min` : ""}${dateStr ? ` • ${dateStr}` : ""}
            ${periodsStr ? ` (${escapeHtml(periodsStr)})` : ""}
            ${disabled ? " • Empty" : ""}
          </span>
        </div>
      </label>
    `;
    })
    .join("");

  const titleInput = document.getElementById("scriptPacketTitle");
  if (titleInput && existingTitle) titleInput.value = existingTitle;
  updateScriptPacketSummary();
}

async function openScriptPacketBuilder() {
  // “Print Packet” is a current-script action. The old route only revealed a
  // buried multi-script panel in the tools drawer, which made the diagram
  // controls effectively unreachable. Keep that full-day picker below for
  // advanced use, but take this primary action straight to its setup modal.
  const currentScript = _getCurrentScriptPacketRecord();
  if (_getScriptPacketRecordStats(currentScript).playCount === 0) {
    await showModal("Add at least one play before building a diagram packet.", {
      title: "Practice Script Packet",
      icon: "🗂️",
    });
    return;
  }
  _scriptPacketPrintOptions = {
    ..._scriptPacketPrintOptions,
    packetTitle: `${currentScript.name || "Practice Script"} Diagram Packet`,
    includeScriptTables: false,
    includeDiagrams: true,
    // A packet is a script handout, not a diagram-only report. Never let an
    // older local preference silently drop plays that have not resolved a
    // diagram yet.
    includeMissingImages: true,
    showMeta: true,
    showDefense: false,
    showCoaching: false,
    showNotes: false,
  };
  const confirmed = await openScriptPacketPrintModal([currentScript]);
  if (!confirmed) return;
  return _renderScriptPacketAndPrint([currentScript]);
}

function selectAllDayScripts() {
  document
    .querySelectorAll(".day-script-checkbox:not(:disabled)")
    .forEach((checkbox) => (checkbox.checked = true));
  updateScriptPacketSummary();
}

function clearDayScripts() {
  document
    .querySelectorAll(".day-script-checkbox")
    .forEach((checkbox) => (checkbox.checked = false));
  updateScriptPacketSummary();
}

function _getSelectedScriptPacketRecords() {
  const recordsByKey = new Map(
    _getScriptPacketRecords().map((record) => [record.sourceKey, record]),
  );
  return Array.from(
    document.querySelectorAll(".day-script-checkbox:checked:not(:disabled)"),
  )
    .map((checkbox) => recordsByKey.get(checkbox.value))
    .filter(Boolean);
}

let _scriptPacketPrintOptions = {
  packetTitle: "",
  paperSize: "letter",
  orientation: "portrait",
  diagramDensity: "large",
  includeScriptTables: false,
  includeDiagrams: true,
  // Kept for backwards compatibility with saved option objects. Packet
  // rendering deliberately includes every play regardless of this value.
  includeMissingImages: true,
  showMeta: true,
  showDefense: true,
  showCoaching: true,
  showNotes: true,
  startScriptOnNewPage: true,
  showFooter: true,
};

function _scriptPacketOptionSummary(selectedScripts) {
  const totals = selectedScripts.reduce(
    (summary, record) => {
      const stats = _getScriptPacketRecordStats(record);
      summary.plays += stats.playCount;
      summary.periods += stats.periodCount;
      summary.minutes += stats.totalMinutes;
      return summary;
    },
    { plays: 0, periods: 0, minutes: 0 },
  );
  return `${selectedScripts.length} script${selectedScripts.length === 1 ? "" : "s"} • ${totals.plays} plays • ${totals.periods} periods${totals.minutes ? ` • ${totals.minutes} min` : ""}`;
}

function _scriptPacketCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function _scriptPacketLayoutChoices(selectedDensity = "large") {
  const choices = [
    { value: "two", title: "2-up", detail: "Big diagrams · install / film" },
    { value: "large", title: "4-up", detail: "Balanced · staff standard" },
    { value: "compact", title: "8-up", detail: "Quick reference · most compact" },
    { value: "full", title: "Full", detail: "One diagram per page" },
  ];
  return choices.map((choice) => `
    <button type="button" class="script-packet-layout-choice${choice.value === selectedDensity ? " is-selected" : ""}"
      data-packet-density="${choice.value}" aria-pressed="${choice.value === selectedDensity ? "true" : "false"}">
      <strong>${choice.title}</strong><span>${choice.detail}</span>
    </button>`).join("");
}

function _scriptPacketOptionsFromOverlay(overlay, selectedDensity) {
  return {
    packetTitle: overlay.querySelector("#scriptPacketTitleInput").value.trim() || "Practice Script Diagram Packet",
    paperSize: overlay.querySelector("#scriptPacketPaper").value || "letter",
    orientation: overlay.querySelector("#scriptPacketOrientation").value || "portrait",
    diagramDensity: selectedDensity,
    includeScriptTables: overlay.querySelector("#scriptPacketIncludeTables").checked,
    includeDiagrams: overlay.querySelector("#scriptPacketIncludeDiagrams").checked,
    // Packet integrity is an invariant: a play with no diagram receives a
    // clearly marked card instead of quietly disappearing from the handout.
    includeMissingImages: true,
    showMeta: overlay.querySelector("#scriptPacketShowMeta").checked,
    showDefense: overlay.querySelector("#scriptPacketShowDefense").checked,
    showCoaching: overlay.querySelector("#scriptPacketShowCoaching").checked,
    showNotes: overlay.querySelector("#scriptPacketShowNotes").checked,
    startScriptOnNewPage: overlay.querySelector("#scriptPacketNewPage").checked,
    showFooter: overlay.querySelector("#scriptPacketFooter").checked,
  };
}

function _scriptPacketDiagramCoverage(selectedScripts, state = {}) {
  const entries = (Array.isArray(selectedScripts) ? selectedScripts : [])
    .flatMap((record) => _scriptPacketPlayEntries(record));
  const coverage = {
    total: entries.length,
    diagrams: 0,
    missing: 0,
    unavailable: 0,
    checking: 0,
  };
  entries.forEach((entry) => {
    if (entry.imageUrl) {
      coverage.diagrams += 1;
      return;
    }
    if (state.loading) {
      coverage.checking += 1;
      return;
    }
    const remote = window.playImages?.getCachedRemoteManifestForPlay?.(entry.play);
    if (remote?.published) {
      coverage.unavailable += 1;
    } else if (remote?.status === "unpublished") {
      coverage.missing += 1;
    } else {
      coverage.unavailable += 1;
    }
  });
  return {
    ...coverage,
  };
}

function _scriptPacketCoverageMarkup(coverage) {
  if (!coverage.total) return "<span>No script plays</span>";
  const parts = [
    `${coverage.total}/${coverage.total} plays accounted for`,
  ];
  if (coverage.checking) {
    parts.push(`Checking ${coverage.checking} diagram${coverage.checking === 1 ? "" : "s"}…`);
  } else {
    parts.push(`${coverage.diagrams} diagram${coverage.diagrams === 1 ? "" : "s"} ready`);
  }
  if (coverage.missing) {
    parts.push(`${coverage.missing} marked diagram needed`);
  }
  if (coverage.unavailable) {
    parts.push(`${coverage.unavailable} need a retry`);
  }
  return parts.map((part, index) => `<span class="${index === 2 ? "is-warning" : ""}">${escapeHtml(part)}</span>`).join("");
}

function _scriptPacketLivePreviewMarkup(selectedScripts, options, state = {}) {
  const scriptData = selectedScripts[0];
  if (!scriptData) return "";
  const layout = _scriptPacketDiagramLayout(options);
  const dimensions = _scriptPacketPaperDimensions(options);
  const allEntries = _scriptPacketPlayEntries(scriptData);
  // Do not filter plays by media availability. A missing-diagram card is what
  // makes a packet trustworthy when it is handed to staff.
  const entries = allEntries;
  const coverage = _scriptPacketDiagramCoverage([scriptData], state);
  const sampleEntries = entries.slice(0, layout.perPage);
  const pageCount = Math.max(1, Math.ceil(entries.length / layout.perPage));
  const ratio = (dimensions.width - 0.6) / (dimensions.height - 0.6);
  const detailLabels = [
    options.includeScriptTables ? "Script table" : "",
    options.includeDiagrams ? "Diagram pages" : "",
    options.showMeta ? "Play info" : "",
    options.showDefense ? "Defense" : "",
    options.showCoaching ? "Coaching" : "",
    options.showNotes ? "Notes" : "",
  ].filter(Boolean);
  const pageMarkup = state.loading
    ? `<section class="script-packet-page script-packet-live-preview-page script-packet-live-preview-empty">
        ${_scriptPacketPageHeader(options.packetTitle, scriptData, "Sample page")}
        <div class="script-packet-live-preview-empty-copy">
          <strong>Checking attached diagrams…</strong>
          <span>Loading the same approved cloud diagrams that the final packet will use.</span>
        </div>
        ${_scriptPacketPageFooter(scriptData, 1, 1, options)}
      </section>`
    : options.includeDiagrams && sampleEntries.length
    ? `<section class="script-packet-page script-packet-diagram-page script-packet-live-preview-page">
        ${_scriptPacketPageHeader(options.packetTitle, scriptData, `Diagrams 1/${pageCount}`)}
        <div class="script-packet-diagram-grid">
          ${sampleEntries.map((entry) => _scriptPacketDiagramCard(entry, options)).join("")}
        </div>
        ${_scriptPacketPageFooter(scriptData, 1, pageCount, options)}
      </section>`
    : `<section class="script-packet-page script-packet-live-preview-page script-packet-live-preview-empty">
        ${_scriptPacketPageHeader(options.packetTitle, scriptData, "Sample page")}
        <div class="script-packet-live-preview-empty-copy">
          <strong>${options.includeDiagrams ? "No eligible diagram was found" : "Diagram pages are turned off"}</strong>
          <span>${options.includeScriptTables ? "Detailed script tables will print before any diagram pages." : "Turn on diagram pages or detailed script tables to add printable content."}</span>
        </div>
        ${_scriptPacketPageFooter(scriptData, 1, 1, options)}
      </section>`;
  return `<section class="script-packet-live-preview" aria-live="polite">
    <div class="script-packet-live-preview-heading">
      <div><strong>Live page sample</strong><span>Updates as you change the packet.</span></div>
      <span>${escapeHtml(`${options.paperSize} · ${options.orientation} · ${layout.perPage}-up`)}</span>
    </div>
    <div class="script-packet-live-preview-includes">${detailLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("") || "<span>No content selected</span>"}</div>
    <div class="script-packet-live-preview-coverage">${_scriptPacketCoverageMarkup(coverage)}</div>
    <div class="script-packet-live-preview-stage">
      <div class="script-packet-live-preview-scale">
        <div class="script-packet-live-preview-sheet script-packet-diagrams-${escapeAttr(options.diagramDensity || "large")}" style="--script-packet-preview-ratio:${ratio};--script-packet-diagram-cols:${layout.cols};--script-packet-diagram-rows:${layout.rows};">
          ${pageMarkup}
        </div>
      </div>
    </div>
  </section>`;
}

function _scriptPacketPlayList(selectedScripts) {
  return (Array.isArray(selectedScripts) ? selectedScripts : [])
    .flatMap((record) => Array.isArray(record?.plays) ? record.plays : [])
    .filter((play) => play && !play.isSeparator);
}

async function _warmScriptPacketMedia(selectedScripts) {
  if (!window.playImages) return;
  const playsForPacket = _scriptPacketPlayList(selectedScripts);
  if (!playsForPacket.length) return;
  // Resolve only this packet's media as the blocking path. Loading every
  // archived IndexedDB blob delayed cold-device packet previews and made a
  // subsequent layout change look like the operation that found diagrams.
  const packetMedia = await window.playImages.prefetchForPlays?.(playsForPacket);
  // A full local warm is useful for later navigation, but must never delay or
  // affect the authoritative result for the packet currently being built.
  const backgroundWarm = window.playImages.prefetchAll?.();
  backgroundWarm?.catch(() => { /* packet media is already resolved */ });
  return packetMedia;
}

function _scriptPacketCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 1) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return y;
  let line = "";
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    context.fillText(line, x, y);
    lines += 1;
    if (lines >= maxLines) return y + lineHeight;
    y += lineHeight;
    line = word;
  }
  if (line && lines < maxLines) context.fillText(line, x, y);
  return y + lineHeight;
}

function _scriptPacketLoadPreviewImage(source) {
  if (!source) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function _saveScriptPacketSampleImage(selectedScripts, options) {
  await _warmScriptPacketMedia(selectedScripts);
  const scriptData = selectedScripts[0];
  if (!scriptData) return;
  const layout = _scriptPacketDiagramLayout(options);
  const dimensions = _scriptPacketPaperDimensions(options);
  const allEntries = _scriptPacketPlayEntries(scriptData);
  const entries = allEntries.slice(0, layout.perPage);
  if (!options.includeDiagrams || !entries.length) {
    showToast("Turn on diagram pages and choose a script with at least one play to save a page image.", { type: "warning", duration: 3500 });
    return;
  }

  const pageWidth = 1536;
  const pageHeight = Math.round(pageWidth * ((dimensions.height - 0.6) / (dimensions.width - 0.6)));
  const margin = 42;
  const canvas = document.createElement("canvas");
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pageWidth, pageHeight);

  context.fillStyle = "#475569";
  context.font = "700 18px system-ui, sans-serif";
  context.fillText(String(typeof getTeamName === "function" ? getTeamName() : "Practice Script").toUpperCase(), margin, margin);
  context.fillStyle = "#111827";
  context.font = "800 28px system-ui, sans-serif";
  context.fillText(options.packetTitle, margin, margin + 32);
  context.font = "600 17px system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText(scriptData.name || "Practice script", pageWidth - margin, margin + 16);
  context.fillStyle = "#64748b";
  context.font = "600 14px system-ui, sans-serif";
  context.fillText(`Diagram sample · ${layout.perPage}-up`, pageWidth - margin, margin + 38);
  context.textAlign = "left";
  context.fillStyle = "#111827";
  context.fillRect(margin, margin + 52, pageWidth - margin * 2, 3);

  const headerHeight = 78;
  const footerHeight = options.showFooter ? 32 : 0;
  const gap = 16;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2 - headerHeight - footerHeight;
  const cardWidth = (usableWidth - gap * (layout.cols - 1)) / layout.cols;
  const cardHeight = (usableHeight - gap * (layout.rows - 1)) / layout.rows;
  const imageResults = await Promise.all(entries.map((entry) => _scriptPacketLoadPreviewImage(entry.imageUrl)));

  entries.forEach((entry, index) => {
    const column = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    const x = margin + column * (cardWidth + gap);
    const y = margin + headerHeight + row * (cardHeight + gap);
    const pad = Math.max(10, Math.round(cardWidth * .03));
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#94a3b8";
    context.lineWidth = 1.5;
    context.fillRect(x, y, cardWidth, cardHeight);
    context.strokeRect(x, y, cardWidth, cardHeight);
    context.fillStyle = "#64748b";
    context.font = "700 12px system-ui, sans-serif";
    context.fillText(`${entry.period} · Play ${entry.periodPlayNumber}`, x + pad, y + pad + 10);

    const infoHeight = options.showMeta || options.showDefense || options.showCoaching || options.showNotes
      ? Math.min(cardHeight * .30, 150)
      : Math.min(cardHeight * .16, 72);
    const imageBox = { x: x + pad, y: y + pad + 22, width: cardWidth - pad * 2, height: Math.max(36, cardHeight - infoHeight - pad * 3 - 22) };
    context.fillStyle = "#f8fafc";
    context.fillRect(imageBox.x, imageBox.y, imageBox.width, imageBox.height);
    const image = imageResults[index];
    if (image) {
      const scale = Math.min(imageBox.width / image.naturalWidth, imageBox.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, imageBox.x + (imageBox.width - width) / 2, imageBox.y + (imageBox.height - height) / 2, width, height);
    } else {
      context.fillStyle = "#64748b";
      context.font = "700 14px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText("No attached diagram", imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height / 2);
      context.textAlign = "left";
    }

    let textY = imageBox.y + imageBox.height + pad + 15;
    context.fillStyle = "#111827";
    context.font = "800 16px system-ui, sans-serif";
    textY = _scriptPacketCanvasText(context, entry.play.play || "Play", x + pad, textY, cardWidth - pad * 2, 18, 2);
    context.fillStyle = "#475569";
    context.font = "600 12px system-ui, sans-serif";
    if (options.showMeta) textY = _scriptPacketCanvasText(context, [entry.play.personnel, entry.play.formation, entry.play.type].filter(Boolean).join(" · "), x + pad, textY + 2, cardWidth - pad * 2, 14, 1);
    if (options.showDefense) textY = _scriptPacketCanvasText(context, [entry.play.defFront && `Front ${entry.play.defFront}`, entry.play.defCoverage && `Cov ${entry.play.defCoverage}`, entry.play.defBlitz && `Blitz ${entry.play.defBlitz}`].filter(Boolean).join(" · "), x + pad, textY + 2, cardWidth - pad * 2, 14, 1);
    if (options.showNotes) _scriptPacketCanvasText(context, entry.play.notes || "", x + pad, textY + 2, cardWidth - pad * 2, 14, 1);
  });

  if (options.showFooter) {
    context.strokeStyle = "#94a3b8";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(margin, pageHeight - margin - 18);
    context.lineTo(pageWidth - margin, pageHeight - margin - 18);
    context.stroke();
    context.fillStyle = "#64748b";
    context.font = "600 12px system-ui, sans-serif";
    context.fillText(scriptData.name || "Practice script", margin, pageHeight - margin);
    context.textAlign = "right";
    context.fillText("Page sample · 1", pageWidth - margin, pageHeight - margin);
    context.textAlign = "left";
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the page image");
  const filename = `${String(options.packetTitle || "practice-script-packet").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "practice-script-packet"}-sample.png`;
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ files: [file], title: options.packetTitle, text: "Practice script packet sample" });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Saved the packet page image.", { type: "success" });
}

function openScriptPacketPrintModal(selectedScripts = _getSelectedScriptPacketRecords()) {
  if (!selectedScripts.length) return Promise.resolve(false);
  const o = _scriptPacketPrintOptions;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal script-packet-print-modal" role="dialog" aria-modal="true" aria-labelledby="scriptPacketPrintTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🗂️</span>
          <h3 class="custom-modal-title" id="scriptPacketPrintTitle">Diagram packet</h3>
        </div>
        <div class="custom-modal-body">
          <p class="script-packet-print-summary">${escapeHtml(_scriptPacketOptionSummary(selectedScripts))} · Play diagrams, names, and the details you choose.</p>
          <div class="script-packet-print-workbench">
          <div class="script-packet-print-form">
            <div class="script-packet-print-row script-packet-print-row--wide">
              <label for="scriptPacketTitleInput">Packet title</label>
              <input id="scriptPacketTitleInput" type="text" maxlength="120" value="${escapeAttr(o.packetTitle || "Practice Script Diagram Packet")}" />
            </div>
            <fieldset class="script-packet-layout-picker">
              <legend>Choose a diagram layout</legend>
              <div class="script-packet-layout-choices" role="group" aria-label="Diagram layout">
                ${_scriptPacketLayoutChoices(o.diagramDensity || "large")}
              </div>
            </fieldset>
            <div class="script-packet-print-row">
              <label for="scriptPacketPaper">Paper</label>
              <select id="scriptPacketPaper">
                <option value="letter" ${o.paperSize === "letter" ? "selected" : ""}>Letter (8.5×11)</option>
                <option value="legal" ${o.paperSize === "legal" ? "selected" : ""}>Legal (8.5×14)</option>
                <option value="tabloid" ${o.paperSize === "tabloid" ? "selected" : ""}>Tabloid (11×17)</option>
              </select>
            </div>
            <div class="script-packet-print-row">
              <label for="scriptPacketOrientation">Orientation</label>
              <select id="scriptPacketOrientation">
                <option value="portrait" ${o.orientation === "portrait" ? "selected" : ""}>Portrait</option>
                <option value="landscape" ${o.orientation === "landscape" ? "selected" : ""}>Landscape</option>
              </select>
            </div>
            <div class="script-packet-print-row script-packet-print-toggles">
              <span class="script-packet-options-label">Include</span>
              <label><input type="checkbox" id="scriptPacketIncludeTables" ${o.includeScriptTables ? "checked" : ""}> Include detailed script tables</label>
              <label><input type="checkbox" id="scriptPacketIncludeDiagrams" ${o.includeDiagrams ? "checked" : ""}> Include play diagram pages</label>
              <div class="script-packet-integrity-note"><strong>Every script play stays in the packet.</strong><span>Plays without a diagram get a clear “No attached diagram” card.</span></div>
              <label><input type="checkbox" id="scriptPacketShowMeta" ${o.showMeta ? "checked" : ""}> Light play information</label>
              <label><input type="checkbox" id="scriptPacketShowDefense" ${o.showDefense ? "checked" : ""}> Defensive look and reps</label>
              <label><input type="checkbox" id="scriptPacketShowCoaching" ${o.showCoaching ? "checked" : ""}> Game-plan coaching details</label>
              <label><input type="checkbox" id="scriptPacketShowNotes" ${o.showNotes ? "checked" : ""}> Play notes</label>
              <label><input type="checkbox" id="scriptPacketNewPage" ${o.startScriptOnNewPage ? "checked" : ""}> Start each selected script on a new page</label>
              <label><input type="checkbox" id="scriptPacketFooter" ${o.showFooter ? "checked" : ""}> Show team, script, and page footer</label>
            </div>
          </div>
          <div id="scriptPacketLivePreview" class="script-packet-live-preview-slot"></div>
          </div>
          <p class="script-packet-print-hint">Four-up is the normal staff handout. Use two-up for install, eight-up for a fast call sheet, and Full when a diagram needs room. On a phone, <strong>Save page image</strong> opens your share sheet; <strong>Build Preview</strong> is the path to Print / Save as PDF. Every script play is included; only Playbook-attached diagrams can render as an image.</p>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel" id="scriptPacketPrintCancel">Cancel</button>
          <button type="button" class="btn custom-modal-btn" id="scriptPacketSaveSample">Save page image</button>
          <button type="button" class="btn btn-primary custom-modal-btn" id="scriptPacketPrintConfirm">Build Preview</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    let selectedDensity = o.diagramDensity || "large";
    let previewMediaLoading = Boolean(o.includeDiagrams);
    const renderLivePreview = () => {
      const slot = overlay.querySelector("#scriptPacketLivePreview");
      if (slot) slot.innerHTML = _scriptPacketLivePreviewMarkup(
        selectedScripts,
        _scriptPacketOptionsFromOverlay(overlay, selectedDensity),
        { loading: previewMediaLoading },
      );
    };
    const setPacketActionAvailability = () => {
      overlay.querySelector("#scriptPacketPrintConfirm").disabled = previewMediaLoading;
      overlay.querySelector("#scriptPacketSaveSample").disabled = previewMediaLoading;
    };
    const setDensity = (density) => {
      selectedDensity = density;
      overlay.querySelectorAll("[data-packet-density]").forEach((button) => {
        const selected = button.dataset.packetDensity === density;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      renderLivePreview();
    };
    overlay.querySelectorAll("[data-packet-density]").forEach((button) => {
      button.addEventListener("click", () => setDensity(button.dataset.packetDensity || "large"));
    });
    overlay.querySelectorAll("#scriptPacketTitleInput, #scriptPacketPaper, #scriptPacketOrientation, .script-packet-print-toggles input")
      .forEach((control) => {
        control.addEventListener("input", renderLivePreview);
        control.addEventListener("change", renderLivePreview);
      });
    renderLivePreview();
    setPacketActionAvailability();
    _warmScriptPacketMedia(selectedScripts)
      .catch((error) => console.warn("Packet diagram warm failed:", error))
      .finally(() => {
        previewMediaLoading = false;
        renderLivePreview();
        setPacketActionAvailability();
      });

    overlay.querySelector("#scriptPacketSaveSample").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Preparing…";
      try {
        await _saveScriptPacketSampleImage(
          selectedScripts,
          _scriptPacketOptionsFromOverlay(overlay, selectedDensity),
        );
      } catch (error) {
        if (error?.name !== "AbortError") {
          showToast("Could not save the packet page image. Try Build Preview and use your device's print/share menu.", { type: "warning", duration: 4500 });
        }
      } finally {
        button.disabled = false;
        button.textContent = "Save page image";
      }
    });

    const close = (confirmed) => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(confirmed);
    };

    overlay.querySelector("#scriptPacketPrintCancel").addEventListener("click", () => close(false));
    overlay.querySelector("#scriptPacketPrintConfirm").addEventListener("click", () => {
      _scriptPacketPrintOptions = _scriptPacketOptionsFromOverlay(overlay, selectedDensity);
      close(true);
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(false);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    });
  });
}

function _scriptPacketPlayEntries(scriptData) {
  const entries = [];
  let period = "Unassigned";
  let periodPlayNumber = 0;

  (Array.isArray(scriptData?.plays) ? scriptData.plays : []).forEach((item) => {
    if (item?.isSeparator) {
      period = item.label || "Period";
      periodPlayNumber = 0;
      return;
    }
    if (!item) return;
    periodPlayNumber += 1;
    const imageUrl =
      typeof getPlayImageUrl === "function"
        ? getPlayImageUrl(item)
        : null;
    entries.push({
      play: item,
      period,
      periodPlayNumber,
      imageUrl,
    });
  });

  return entries;
}

function _scriptPacketCompactValues(values) {
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function _scriptPacketDetailRow(label, values, className = "") {
  const parts = _scriptPacketCompactValues(Array.isArray(values) ? values : [values]);
  if (!parts.length) return "";
  return `<div class="script-packet-diagram-detail ${className}">
    <strong>${escapeHtml(label)}</strong>
    <span>${parts.map(escapeHtml).join(" • ")}</span>
  </div>`;
}

function _scriptPacketMetaMarkup(play) {
  return [
    _scriptPacketDetailRow("Set", [play.personnel, play.formation, play.type]),
    _scriptPacketDetailRow("Ops", [
      play.hash || play.preferredHash,
      play.tempo,
      play.reps ? `${play.reps} rep${Number(play.reps) === 1 ? "" : "s"}` : "",
    ]),
  ].join("");
}

function _scriptPacketDefenseMarkup(play) {
  const front = play.defFront || play.practiceFront;
  const coverage = play.defCoverage || play.practiceCoverage;
  const stunt = play.defStunt || play.practiceStunt;
  const blitz = play.defBlitz || play.practiceBlitz;
  return _scriptPacketDetailRow("Defense", [
    front ? `Front ${front}` : "",
    coverage ? `Cov ${coverage}` : "",
    stunt ? `Stunt ${stunt}` : "",
    blitz ? `Blitz ${blitz}` : "",
  ]);
}

function _scriptPacketCoachingMarkup(play) {
  const keyPlayers = [1, 2, 3].map((number) => {
    const position = String(play[`keyPlayer${number}`] || "").trim();
    const name = String(play[`keyPlayerName${number}`] || "").trim();
    return [position, name].filter(Boolean).join(" ");
  });
  return [
    _scriptPacketDetailRow("Situation", [
      play.preferredSituation,
      play.preferredDown ? `${play.preferredDown} Down` : "",
      play.preferredDistance,
      play.preferredFieldPosition,
    ]),
    _scriptPacketDetailRow("Key", keyPlayers),
    _scriptPacketDetailRow("Answers", [
      play.constraint1,
      play.constraint2,
      play.constraint3,
    ]),
    _scriptPacketDetailRow("Hit", [play.hitChart1, play.hitChart2, play.hitChart3]),
    _scriptPacketDetailRow("Tags", [
      play.oneWord,
      play.basePlay,
      play.playTag1,
      play.playTag2,
    ]),
    _scriptPacketDetailRow(
      "Dead vs",
      play.deadVs,
      "script-packet-diagram-detail--warning",
    ),
  ].join("");
}

function _scriptPacketDiagramCard(entry, options) {
  const play = entry.play;
  const displayOpts =
    typeof getScriptDisplayOptions === "function" ? getScriptDisplayOptions() : {};
  const callHtml =
    typeof getScriptFullCall === "function"
      ? getScriptFullCall(play, displayOpts)
      : typeof getFullCall === "function"
        ? getFullCall(play, { showLineCall: true })
        : escapeHtml(play.play || "");
  const imageHtml = entry.imageUrl
    ? `<img src="${escapeAttr(entry.imageUrl)}" alt="Play diagram for ${escapeAttr(play.play || "play")}" />`
    : `<div class="script-packet-diagram-missing">No attached diagram</div>`;
  const metaHtml = options.showMeta ? _scriptPacketMetaMarkup(play) : "";
  const defenseHtml = options.showDefense ? _scriptPacketDefenseMarkup(play) : "";
  const coachingHtml = options.showCoaching ? _scriptPacketCoachingMarkup(play) : "";
  const notes = String(play.notes || "").trim();
  const notesHtml =
    options.showNotes && notes
      ? _scriptPacketDetailRow(
        "Note",
        notes,
        "script-packet-diagram-detail--notes",
      )
      : "";

  return `<article class="script-packet-diagram-card">
    <div class="script-packet-diagram-kicker">
      <span>${escapeHtml(entry.period)}</span>
      <span>Play ${entry.periodPlayNumber}</span>
    </div>
    <div class="script-packet-diagram-image">${imageHtml}</div>
    <div class="script-packet-diagram-info">
      <div class="script-packet-diagram-call">${callHtml}</div>
      ${metaHtml}
      ${defenseHtml}
      ${coachingHtml}
      ${notesHtml}
    </div>
  </article>`;
}

function _scriptPacketPageHeader(packetTitle, scriptData, pageLabel) {
  const teamName = typeof getTeamName === "function" ? getTeamName() : "";
  const dateStr = scriptData.date
    ? new Date(scriptData.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    : "";
  return `<header class="script-packet-page-header">
    <div>
      <span class="script-packet-page-team">${escapeHtml(teamName || "Practice Script")}</span>
      <strong>${escapeHtml(packetTitle)}</strong>
    </div>
    <div class="script-packet-page-context">
      <strong>${escapeHtml(scriptData.name)}</strong>
      <span>${[dateStr, pageLabel].filter(Boolean).map(escapeHtml).join(" • ")}</span>
    </div>
  </header>`;
}

function _scriptPacketPageFooter(scriptData, pageNumber, pageCount, options) {
  if (!options.showFooter) return "";
  const teamName = typeof getTeamName === "function" ? getTeamName() : "";
  return `<footer class="script-packet-page-footer">
    <span>${escapeHtml(teamName || "")}</span>
    <span>${escapeHtml(scriptData.name)}</span>
    <span>${pageNumber} / ${pageCount}</span>
  </footer>`;
}

function _scriptPacketDiagramPages(scriptData, packetTitle, options) {
  const allEntries = _scriptPacketPlayEntries(scriptData);
  // Preserve the script order and every period's play count. Missing media is
  // represented by the card renderer rather than removed from packet output.
  const entries = allEntries;
  if (!entries.length) return "";

  const layout = _scriptPacketDiagramLayout(options);
  const chunks = [];
  for (let index = 0; index < entries.length; index += layout.perPage) {
    chunks.push(entries.slice(index, index + layout.perPage));
  }
  return chunks
    .map((chunk, pageIndex) => {
      const pageNumber = pageIndex + 1;
      return `<section class="script-packet-page script-packet-diagram-page">
        ${_scriptPacketPageHeader(packetTitle, scriptData, `Diagrams ${pageNumber}/${chunks.length}`)}
        <div class="script-packet-diagram-grid">
          ${chunk.map((entry) => _scriptPacketDiagramCard(entry, options)).join("")}
        </div>
        ${_scriptPacketPageFooter(scriptData, pageNumber, chunks.length, options)}
      </section>`;
    })
    .join("");
}

function _scriptPacketDiagramLayout(options) {
  const density = options.diagramDensity || "large";
  if (density === "full") return { perPage: 1, cols: 1, rows: 1 };
  if (density === "two") return { perPage: 2, cols: 1, rows: 2 };
  if (density === "compact") {
    return options.orientation === "landscape"
      ? { perPage: 8, cols: 4, rows: 2 }
      : { perPage: 8, cols: 2, rows: 4 };
  }
  return { perPage: 4, cols: 2, rows: 2 };
}

function _scriptPacketTableSection(scriptData, packetTitle, displayOpts, index, options) {
  const stats = _getScriptPacketRecordStats(scriptData);
  const bodyMarkup = buildScriptPrintBodyMarkup(scriptData.plays, displayOpts);
  const tableMarkup = buildScriptPrintTableMarkup(displayOpts, bodyMarkup);
  const breakClass =
    index > 0 && options.startScriptOnNewPage ? "script-packet-break-before" : "";
  return `<section class="script-packet-table-section ${breakClass}">
    ${_scriptPacketPageHeader(
    packetTitle,
    scriptData,
    `${_scriptPacketCountLabel(stats.playCount, "play")}${stats.periodCount ? ` • ${_scriptPacketCountLabel(stats.periodCount, "period")}` : ""}${stats.totalMinutes ? ` • ${stats.totalMinutes} min` : ""}`,
  )}
    <table class="script-table">${tableMarkup}</table>
  </section>`;
}

function _scriptPacketPaperDimensions(options) {
  const sizes = {
    letter: [8.5, 11],
    legal: [8.5, 14],
    tabloid: [11, 17],
  };
  const selected = sizes[options.paperSize] || sizes.letter;
  return options.orientation === "landscape"
    ? { width: selected[1], height: selected[0] }
    : { width: selected[0], height: selected[1] };
}

async function _waitForScriptPacketImages(host) {
  const images = Array.from(host.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      if (typeof image.decode === "function") return image.decode().catch(() => { });
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }),
  );
}

async function _renderScriptPacketAndPrint(selectedScripts) {
  try {
    const options = _scriptPacketPrintOptions;
    const displayOpts = getScriptDisplayOptions();
    const packetTitle =
      String(options.packetTitle || "").trim() ||
      document.getElementById("scriptPacketTitle")?.value.trim() ||
      "Practice Script Packet";
    if (options.includeDiagrams && window.playImages) {
      try {
        await _warmScriptPacketMedia(selectedScripts);
      } catch (_error) {
        showToast("Some play diagrams could not be loaded.", { type: "warning" });
      }
    }

    let host = document.getElementById("scriptPacketPrintRoot");
    if (!host) {
      host = document.createElement("div");
      host.id = "scriptPacketPrintRoot";
      document.body.appendChild(host);
    }

    const dimensions = _scriptPacketPaperDimensions(options);
    host.className = [
      "script-packet-print-root",
      `script-packet-${options.paperSize}`,
      `script-packet-${options.orientation}`,
      `script-packet-diagrams-${options.diagramDensity || "large"}`,
    ].join(" ");
    host.style.setProperty("--script-packet-page-width", `${dimensions.width - 0.6}in`);
    host.style.setProperty("--script-packet-page-height", `${dimensions.height - 0.6}in`);
    const diagramLayout = _scriptPacketDiagramLayout(options);
    host.style.setProperty("--script-packet-diagram-cols", diagramLayout.cols);
    host.style.setProperty("--script-packet-diagram-rows", diagramLayout.rows);

    const tableHtml = options.includeScriptTables
      ? selectedScripts
        .map((record, index) =>
          _scriptPacketTableSection(record, packetTitle, displayOpts, index, options),
        )
        .join("")
      : "";
    const diagramHtml = options.includeDiagrams
      ? selectedScripts
        .map((record) => _scriptPacketDiagramPages(record, packetTitle, options))
        .join("")
      : "";
    if (options.includeDiagrams && !diagramHtml && tableHtml) {
      showToast(
        "No script plays were available for diagram pages.",
        { type: "warning", duration: 4000 },
      );
    }

    if (!tableHtml && !diagramHtml) {
      await showModal(
        "This packet has no printable content. Include script tables or diagram pages.",
        { title: "Practice Script Packet", icon: "🗂️" },
      );
      return;
    }

    host.innerHTML = tableHtml + diagramHtml;
    await _waitForScriptPacketImages(host);

    const pageColorCSS = _applyScriptColorPreset(host);
    setupPrintPageStyle(
      `@media print { @page { size: ${options.paperSize} ${options.orientation}; margin: 0.3in; } }${pageColorCSS}`,
    );

    const cleanupPacket = () => {
      document.body.classList.remove("print-script", "script-packet-printing");
    };
    const printNow = () => {
      const restoreTitle = setPrintTitle("Practice Script Packet", packetTitle);
      const finishPacket = () => {
        restoreTitle();
        cleanupPacket();
      };
      if (typeof printIsolatedArtifact === "function" && printIsolatedArtifact(host, {
        title: document.title,
        bodyClass: "script-packet-printing",
        onAfterPrint: finishPacket,
      })) {
        return;
      }
      document.body.classList.add("print-script", "script-packet-printing");
      try {
        window.print();
      } finally {
        finishPacket();
      }
    };

    if (typeof showPrintPreview === "function") {
      showPrintPreview(host, printNow, cleanupPacket);
    } else {
      printNow();
    }
  } catch (err) {
    console.error("_renderScriptPacketAndPrint error:", err);
    document.body.classList.remove("print-script", "script-packet-printing");
    showToast("❌ Error printing script packet.", {
      duration: 4000,
      type: "error",
    });
  }
}

async function printScriptPacket() {
  const selectedScripts = _getSelectedScriptPacketRecords();
  if (!selectedScripts.length) {
    await showModal("Please select at least one script to print.", {
      title: "Practice Script Packet",
      icon: "🖨️",
    });
    return;
  }
  const confirmed = await openScriptPacketPrintModal(selectedScripts);
  if (!confirmed) return;
  return _renderScriptPacketAndPrint(selectedScripts);
}

function printFullDay() {
  return printScriptPacket();
}
