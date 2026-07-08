function openLoadWristbandToScriptModal() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);

  if (saved.length === 0) {
    showToast("No saved wristbands found — create one first");
    return;
  }

  const wristbandOptions = saved
    .map((wristband, index) => {
      const totalPlays = wristband.cards
        ? wristband.cards.reduce(
          (sum, card) => sum + (Array.isArray(card?.data) ? card.data.filter((play) => play !== null).length : 0),
          0,
        )
        : 0;
      return `<option value="${index}">${wristband.title} (${totalPlays} plays)</option>`;
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
  wristband.cards.forEach((card, cardIndex) => {
    if (cardChoice !== "all" && parseInt(cardChoice, 10) !== cardIndex + 1) {
      return;
    }
    if (!Array.isArray(card?.data)) return;
    card.data.forEach((play) => {
      if (play !== null) {
        playsToAdd.push(
          typeof copyPlayWithSourceIdentity === "function"
            ? copyPlayWithSourceIdentity(play, { id: Date.now() + Math.random() })
            : { ...play },
        );
      }
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
  if (opts.hidePersonnel) return [];

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

  let rowColor = "";
  if (opts.highlightHuddle && play.tempo && play.tempo.toLowerCase() === "huddle") {
    rowColor = `background: ${UI_COLORS.highlightHuddle};`;
  } else if (
    opts.highlightCandy &&
    play.tempo &&
    play.tempo.toLowerCase() === "candy"
  ) {
    rowColor = `background: ${UI_COLORS.highlightCandy};`;
  }

  const mainRow = `<tr class="script-print-play-row" style="${rowColor}">
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
        try {
          const restoreTitle = setPrintTitle("Practice Script", `${name} ${periodLabel}`);
          window.print();
          restoreTitle();
        } finally {
          cleanupScript();
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
            try {
              const restoreTitle = setPrintTitle("Practice Script", name || "");
              window.print();
              restoreTitle();
            } finally {
              cleanupScript();
            }
          },
          cleanupScript,
        );
      } else {
        try {
          const restoreTitle = setPrintTitle("Practice Script", name || "");
          window.print();
          restoreTitle();
        } finally {
          cleanupScript();
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

function openScriptPacketBuilder() {
  loadFullDayScriptList(true);
  const section = document.getElementById("fullDaySection");
  if (!section) return;
  section.classList.remove("hidden");
  requestAnimationFrame(() => {
    scrollElementWithinPanel(section, { behavior: "smooth", block: "center" });
    document.getElementById("scriptPacketTitle")?.focus({ preventScroll: true });
  });
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
  paperSize: "letter",
  orientation: "portrait",
  diagramDensity: "large",
  includeScriptTables: true,
  includeDiagrams: true,
  includeMissingImages: false,
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

function openScriptPacketPrintModal(selectedScripts = _getSelectedScriptPacketRecords()) {
  if (!selectedScripts.length) return Promise.resolve(false);
  const o = _scriptPacketPrintOptions;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="scriptPacketPrintTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🗂️</span>
          <h3 class="custom-modal-title" id="scriptPacketPrintTitle">Print Practice Script Packet</h3>
        </div>
        <div class="custom-modal-body">
          <p class="script-packet-print-summary">${escapeHtml(_scriptPacketOptionSummary(selectedScripts))}</p>
          <div class="script-packet-print-form">
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
            <div class="script-packet-print-row">
              <label for="scriptPacketDiagramDensity">Diagram size</label>
              <select id="scriptPacketDiagramDensity">
                <option value="large" ${o.diagramDensity === "large" ? "selected" : ""}>Large — 4 diagrams per page</option>
                <option value="compact" ${o.diagramDensity === "compact" ? "selected" : ""}>Compact — 8 diagrams per page</option>
                <option value="full" ${o.diagramDensity === "full" ? "selected" : ""}>Full page — 1 diagram per page</option>
              </select>
            </div>
            <div class="script-packet-print-row script-packet-print-toggles">
              <label><input type="checkbox" id="scriptPacketIncludeTables" ${o.includeScriptTables ? "checked" : ""}> Include detailed script tables</label>
              <label><input type="checkbox" id="scriptPacketIncludeDiagrams" ${o.includeDiagrams ? "checked" : ""}> Include play diagram pages</label>
              <label><input type="checkbox" id="scriptPacketMissingImages" ${o.includeMissingImages ? "checked" : ""}> Include placeholder cards for plays without images</label>
              <label><input type="checkbox" id="scriptPacketShowMeta" ${o.showMeta ? "checked" : ""}> Show formation, personnel, type, hash, and tempo</label>
              <label><input type="checkbox" id="scriptPacketShowDefense" ${o.showDefense ? "checked" : ""}> Show front, coverage, stunt, blitz, and reps</label>
              <label><input type="checkbox" id="scriptPacketShowCoaching" ${o.showCoaching ? "checked" : ""}> Show game-plan details (situation, key players, answers, hit chart, tags, and dead vs)</label>
              <label><input type="checkbox" id="scriptPacketShowNotes" ${o.showNotes ? "checked" : ""}> Show play notes</label>
              <label><input type="checkbox" id="scriptPacketNewPage" ${o.startScriptOnNewPage ? "checked" : ""}> Start each selected script on a new page</label>
              <label><input type="checkbox" id="scriptPacketFooter" ${o.showFooter ? "checked" : ""}> Show team, script, and page footer</label>
            </div>
          </div>
          <p class="script-packet-print-hint">Use Large or Full Page diagrams when Chalk exports or clipped screenshots need more space. Only images attached in the Playbook can be printed.</p>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel" id="scriptPacketPrintCancel">Cancel</button>
          <button type="button" class="btn btn-primary custom-modal-btn" id="scriptPacketPrintConfirm">Build Preview</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const close = (confirmed) => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(confirmed);
    };

    overlay.querySelector("#scriptPacketPrintCancel").addEventListener("click", () => close(false));
    overlay.querySelector("#scriptPacketPrintConfirm").addEventListener("click", () => {
      _scriptPacketPrintOptions = {
        paperSize: overlay.querySelector("#scriptPacketPaper").value || "letter",
        orientation: overlay.querySelector("#scriptPacketOrientation").value || "portrait",
        diagramDensity: overlay.querySelector("#scriptPacketDiagramDensity").value || "large",
        includeScriptTables: overlay.querySelector("#scriptPacketIncludeTables").checked,
        includeDiagrams: overlay.querySelector("#scriptPacketIncludeDiagrams").checked,
        includeMissingImages: overlay.querySelector("#scriptPacketMissingImages").checked,
        showMeta: overlay.querySelector("#scriptPacketShowMeta").checked,
        showDefense: overlay.querySelector("#scriptPacketShowDefense").checked,
        showCoaching: overlay.querySelector("#scriptPacketShowCoaching").checked,
        showNotes: overlay.querySelector("#scriptPacketShowNotes").checked,
        startScriptOnNewPage: overlay.querySelector("#scriptPacketNewPage").checked,
        showFooter: overlay.querySelector("#scriptPacketFooter").checked,
      };
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
  const entries = options.includeMissingImages
    ? allEntries
    : allEntries.filter((entry) => entry.imageUrl);
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
      document.getElementById("scriptPacketTitle")?.value.trim() ||
      "Practice Script Packet";
    if (options.includeDiagrams && window.playImages) {
      try {
        await window.playImages.prefetchAll();
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
        options.includeMissingImages
          ? "No script plays were available for diagram pages."
          : "No attached play diagrams found. Printing the detailed script tables only.",
        { type: "warning", duration: 4000 },
      );
    }

    if (!tableHtml && !diagramHtml) {
      await showModal(
        "This packet has no printable content. Include script tables, diagrams, or missing-image placeholders.",
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
      document.body.classList.add("print-script", "script-packet-printing");
      try {
        const restoreTitle = setPrintTitle("Practice Script Packet", packetTitle);
        window.print();
        restoreTitle();
      } finally {
        cleanupPacket();
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
