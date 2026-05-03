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
      <div class="modal-content modal-content-sm">
        <div class="modal-header-row">
          <h3 class="modal-title">➕ Load Wristband Plays to Script</h3>
          <button data-action="closeLoadWbToScriptModal" class="modal-close-btn">✕</button>
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
        playsToAdd.push({ ...play });
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
  const columns = [
    {
      key: "num",
      label: "#",
      render: (_play, displayNum) => `<strong>${displayNum}</strong>`,
    },
    {
      key: "hash",
      label: "Hash",
      render: (play) => escapeHtml(play.hash || "-"),
    },
    {
      key: "tempo",
      label: "Tempo",
      render: (play) => escapeHtml(play.tempo || "-"),
    },
  ];

  if (opts.showWbNum) {
    columns.push({
      key: "wb",
      label: "WB#",
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
      render: (play) => getFullCall(play, opts),
    },
    {
      key: "type",
      label: "Type",
      render: (play) => escapeHtml(play.type || "-"),
    },
    {
      key: "front",
      label: "Front",
      render: (play) => escapeHtml(play.defFront || "-"),
    },
    {
      key: "cov",
      label: "Cov",
      render: (play) => escapeHtml(play.defCoverage || "-"),
    },
    {
      key: "stunt",
      label: "Stunt",
      render: (play) => escapeHtml(play.defStunt || "-"),
    },
    {
      key: "blitz",
      label: "Blitz",
      render: (play) => escapeHtml(play.defBlitz || "-"),
    },
    {
      key: "reps",
      label: "Reps",
      render: (play) => `×${escapeHtml(String(play.reps ?? 1))}`,
    },
  );

  columns.push({
    key: "notes",
    label: "Notes",
    render: (play) => escapeHtml(play.notes || "-"),
  });

  return columns;
}

function buildScriptPlayRow(play, displayNum, opts = {}) {
  const columns = getScriptPrintColumns(opts);
  const visibleLineup = getScriptVisiblePlayerLineup(play, opts);
  const wrapCellKeys = new Set(["notes"]);

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

  const mainRow = `<tr style="${rowColor}">
    ${columns
      .map(
        (column) => {
          const wrapStyle = wrapCellKeys.has(column.key)
            ? ' style="white-space: normal; overflow: visible; overflow-wrap: anywhere; word-break: break-word; vertical-align: top;"'
            : "";
          return `<td class="script-table-cell script-table-cell--${column.key}"${wrapStyle}>${column.render(play, displayNum)}</td>`;
        },
      )
      .join("")}
  </tr>`;

  if (!visibleLineup.length) return mainRow;

  return `${mainRow}
  <tr class="script-print-personnel-row">
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
  </tr>`;
}

function buildScriptPrintBodyMarkup(playsToRender, opts = {}, options = {}) {
  const columns = getScriptPrintColumns(opts);
  let bodyHtml = "";
  if (options.scriptHeaderMarkup) {
    bodyHtml += `<tbody class="print-script-header-group">${options.scriptHeaderMarkup}</tbody>`;
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

function renderScriptPrintTable(opts = {}, bodyMarkup = "") {
  const table = document.getElementById("previewTable");
  if (!table) return;

  const columns = getScriptPrintColumns(opts);
  // Rebuild the entire table so we can emit multiple <tbody> groups (one per
  // period). Direct innerHTML is safe — getFullCall/escapeHtml already
  // escape user content. setInnerHTML would drop orphan <tr>/<tbody> nodes
  // because DOMParser strips them outside a <table> context.
  const theadMarkup = `<thead><tr>${columns
    .map((column) => `<th class="col-${column.key}">${escapeHtml(column.label)}</th>`)
    .join("")}</tr></thead>`;
  // bodyMarkup already wraps each period in <tbody class="print-period-group">.
  // Fall back to a single tbody if the markup didn't open one (shouldn't
  // happen, but keep the table well-formed).
  const tbodyMarkup = bodyMarkup.includes("<tbody")
    ? bodyMarkup
    : `<tbody id="previewBody">${bodyMarkup}</tbody>`;
  table.innerHTML = theadMarkup + tbodyMarkup;
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
  const filename = `${scriptName.replace(/\s+/g, "_")}_${dateStr}.csv`;

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
  link.download = `${scriptName.replace(/\s+/g, "_")}_${dateStr}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("✅ Script exported as text file", { type: "success" });
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

    setupPrintPageStyle(
      "@media print { @page { size: letter; margin: 0.5in; } }",
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

function loadFullDayScriptList() {
  const savedScripts = getSavedScripts();
  const container = document.getElementById("fullDayScriptList");
  const section = document.getElementById("fullDaySection");
  if (!container || !section) return;

  if (savedScripts.length < 2) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = savedScripts
    .map((savedScript, index) => {
      const playCount = savedScript.plays.filter((play) => !play.isSeparator)
        .length;
      const periodCount = savedScript.plays.filter((play) => play.isSeparator)
        .length;
      const periodsStr = savedScript.plays
        .filter((play) => play.isSeparator)
        .map((play) => play.label)
        .join(", ");
      return `
      <label class="full-day-item">
        <input type="checkbox" class="day-script-checkbox" value="${savedScript.id}" data-order="${index}">
        <div class="full-day-item-info">
          <span class="full-day-item-name">${escapeHtml(savedScript.name)}</span>
          <span class="full-day-item-meta">${playCount} plays${periodCount > 0 ? " • " + periodCount + " periods" : ""}${periodsStr ? " (" + escapeHtml(periodsStr) + ")" : ""}</span>
        </div>
      </label>
    `;
    })
    .join("");
}

function selectAllDayScripts() {
  document
    .querySelectorAll(".day-script-checkbox")
    .forEach((checkbox) => (checkbox.checked = true));
}

function clearDayScripts() {
  document
    .querySelectorAll(".day-script-checkbox")
    .forEach((checkbox) => (checkbox.checked = false));
}

async function printFullDay() {
  try {
    const savedScripts = getSavedScripts();
    const selectedIds = Array.from(
      document.querySelectorAll(".day-script-checkbox:checked"),
    ).map((checkbox) => parseInt(checkbox.value, 10));

    if (selectedIds.length === 0) {
      await showModal("Please select at least one script to print.", {
        title: "Print",
        icon: "🖨️",
      });
      return;
    }

    const displayOpts = getScriptDisplayOptions();
    const printColumnCount = getScriptPrintColumns(displayOpts).length;
    const teamName = getTeamName();

    let globalPlayNum = 0;
    const bodySections = [];

    selectedIds.forEach((id) => {
      const scriptData = savedScripts.find((savedScript) => savedScript.id === id);
      if (!scriptData) return;

      const scriptPlayCount = scriptData.plays.filter(
        (play) => !play.isSeparator,
      ).length;
      globalPlayNum += scriptPlayCount;

      const dateStr = scriptData.date
        ? new Date(scriptData.date + "T00:00:00").toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
        : "";
      const scriptHeaderMarkup = `
      <tr class="script-section-header">
        <td colspan="${printColumnCount}" style="background: ${UI_COLORS.bgDarkNav}; color: white; font-weight: bold; padding: 10px; text-align: center; font-size: 13px; letter-spacing: 0.5px; border-top: 3px solid ${UI_COLORS.accentBlue};">
          📋 ${escapeHtml(scriptData.name.toUpperCase())} ${dateStr ? "&nbsp;•&nbsp; " + dateStr : ""} <span style="opacity:0.6;font-weight:normal;font-size:11px;">(${scriptPlayCount} plays)</span>
        </td>
      </tr>
    `;
      bodySections.push(
        buildScriptPrintBodyMarkup(scriptData.plays, displayOpts, {
          scriptHeaderMarkup,
          isFullDay: true,
        }),
      );
    });

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    document.getElementById("previewTeamName").textContent = teamName || "";
    document.getElementById("previewTitle").textContent = "Full Practice Day";
    document.getElementById("previewMeta").textContent = today;

    const summaryEl = document.getElementById("previewPeriodSummary");
    summaryEl.innerHTML = `
    <div class="preview-summary-bar">
      <span><strong>${selectedIds.length}</strong> scripts</span>
      <span><strong>${globalPlayNum}</strong> total plays</span>
    </div>
  `;

    renderScriptPrintTable(displayOpts, bodySections.join(""));

    document.getElementById("previewContainer").classList.remove("hidden");
    document.getElementById("wristbandPrint").classList.add("hidden");
    document.body.classList.add("print-script");

    setupPrintPageStyle(
      "@media print { @page { size: letter; margin: 0.25in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Full Practice Day");
        window.print();
        restoreTitle();
      } finally {
        document.getElementById("previewContainer").classList.add("hidden");
        document.body.classList.remove("print-script");
      }
    }, 100);
  } catch (err) {
    console.error("printFullDay error:", err);
    document.getElementById("previewContainer")?.classList?.add("hidden");
    document.body.classList.remove("print-script");
    showToast("❌ Error printing full day.", {
      duration: 4000,
      type: "error",
    });
  }
}