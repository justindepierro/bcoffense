// tendencies-print.js — Tendencies print, export, and import
// Extracted from tendencies.js

function printTendencies() {
  if (tendenciesCurrentOpponent === null) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp || opp.plays.length === 0) {
    showModal("No plays to print.", { title: "Print", icon: "🖨️" });
    return;
  }

  try {
    showToast("🖨️ Preparing tendencies…", 2500);

    const container = document.getElementById("tendenciesPrint");
    const content = document.getElementById("tendenciesPrintContent");

    const total = opp.plays.length;
    const runP = opp.plays.filter((p) =>
      ["Run", "Draw", "QB Run", "Option"].includes(p.offensePlayType),
    ).length;
    const passP = opp.plays.filter((p) =>
      ["Pass", "Screen", "PA"].includes(p.offensePlayType),
    ).length;
    const blitzP = opp.plays.filter(
      (p) => p.defBlitz && p.defBlitz !== "None",
    ).length;

    const frontDist = {},
      covDist = {};
    opp.plays.forEach((p) => {
      if (p.defFront) frontDist[p.defFront] = (frontDist[p.defFront] || 0) + 1;
      if (p.defCoverage)
        covDist[p.defCoverage] = (covDist[p.defCoverage] || 0) + 1;
    });

    const topFronts = Object.entries(frontDist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${v} (${Math.round((v / total) * 100)}%)`)
      .join(", ");
    const topCovs = Object.entries(covDist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${v} (${Math.round((v / total) * 100)}%)`)
      .join(", ");

    const filtered = getFilteredPlays();
    const rows = filtered
      .map(
        (p, i) => `
      <tr>
        <td>${i + 1}</td><td>${escapeHtml(p.quarter || "")}</td>
        <td>${escapeHtml(p.down || "")}${p.distance ? "&amp;" + escapeHtml(p.distance) : ""}</td>
        <td>${escapeHtml(p.hash || "")}</td>
        <td>${escapeHtml((p.fieldPosition || "") + " " + (p.yardLine || ""))}</td>
        <td>${escapeHtml(p.situation || "")}</td><td>${escapeHtml(p.offenseFormation || "")}</td>
        <td>${escapeHtml(p.offensePlayType || "")}</td>
        <td><strong>${escapeHtml(p.defFront || "")}</strong></td>
        <td><strong>${escapeHtml(p.defCoverage || "")}</strong></td>
        <td>${p.defBlitz && p.defBlitz !== "None" ? escapeHtml(p.defBlitz) : ""}</td>
        <td>${p.defStunt && p.defStunt !== "None" ? escapeHtml(p.defStunt) : ""}</td>
        <td class="td-print-notes">${escapeHtml(p.notes || "")}</td>
      </tr>
    `,
      )
      .join("");

    content.innerHTML = `
      <h1 class="td-print-title">🎯 ${escapeHtml(opp.name)} — Scouting Report</h1>
      <div class="td-print-stats">
        <span>Plays: <strong>${total}</strong></span>
        <span>Run: <strong>${runP}</strong> (${total > 0 ? Math.round((runP / total) * 100) : 0}%)</span>
        <span>Pass: <strong>${passP}</strong> (${total > 0 ? Math.round((passP / total) * 100) : 0}%)</span>
        <span>Blitz: <strong>${blitzP}</strong> (${total > 0 ? Math.round((blitzP / total) * 100) : 0}%)</span>
      </div>
      <div class="td-print-dist"><strong>Top Fronts:</strong> ${topFronts}</div>
      <div class="td-print-dist"><strong>Top Coverages:</strong> ${topCovs}</div>
      <table class="td-print-table">
        <thead><tr><th>#</th><th>Qtr</th><th>D&amp;D</th><th>Hash</th><th>FP</th><th>Sit</th><th>Form</th><th>Type</th><th>Front</th><th>Cov</th><th>Blitz</th><th>Stunt</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    container.classList.remove("hidden");
    document.body.dataset.printMode = "tendencies";

    setupPrintPageStyle(
      "@media print { @page { size: letter landscape; margin: 0.3in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Tendencies", opp.name);
        window.print();
        restoreTitle();
      } finally {
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 100);
  } catch (err) {
    console.error("printTendencies error:", err);
    document.getElementById("tendenciesPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing tendencies.", {
      duration: 4000,
      type: "error",
    });
  }
}

function playToCSVRow(opponentName, play) {
  const values = TENDENCIES_CSV_HEADERS.map((header) => {
    if (header === "Opponent") return opponentName;
    const key = Object.entries(KEY_TO_CSV).find(([, v]) => v === header)?.[0];
    const val = key ? play[key] || "" : "";
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  });
  return values.join(",");
}

async function exportTendenciesCSV() {
  if (tendenciesOpponents.length === 0) {
    await showModal("No data to export.", { title: "Export", icon: "📄" });
    return;
  }
  let csv = TENDENCIES_CSV_HEADERS.join(",") + "\n";
  tendenciesOpponents.forEach((opp) => {
    opp.plays.forEach((play) => {
      csv += playToCSVRow(opp.name, play) + "\n";
    });
  });
  downloadFile(csv, "defensive_tendencies.csv", "text/csv");
  showToast("📄 CSV exported");
}

async function exportSingleOpponentCSV(idx) {
  const opp = tendenciesOpponents[idx];
  if (!opp || opp.plays.length === 0) {
    await showModal("No plays to export.", { title: "Export", icon: "📄" });
    return;
  }
  let csv = TENDENCIES_CSV_HEADERS.join(",") + "\n";
  opp.plays.forEach((play) => {
    csv += playToCSVRow(opp.name, play) + "\n";
  });
  const safeName = opp.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  downloadFile(csv, `tendencies_${safeName}.csv`, "text/csv");
  showToast("📄 CSV exported");
}

async function exportTendenciesJSON() {
  if (tendenciesOpponents.length === 0) {
    await showModal("No data to export.", { title: "Export", icon: "💾" });
    return;
  }
  const data = JSON.stringify(tendenciesOpponents, null, 2);
  downloadFile(data, "defensive_tendencies.json", "application/json");
  showToast("💾 JSON exported");
}

function importTendenciesJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = safeJSONParse(ev.target.result, null);
        if (!data || !Array.isArray(data)) throw new Error("Invalid format");
        data.forEach((opp) => {
          if (!opp.name || !Array.isArray(opp.plays))
            throw new Error("Invalid opponent structure");
        });
        const mode = await showConfirm(
          `Import ${data.length} opponent(s)?\n\nThis will merge with your existing data.`,
          { title: "Import", icon: "📥", confirmText: "Import" },
        );
        if (!mode) return;
        data.forEach((imported) => {
          const existing = tendenciesOpponents.find(
            (o) => o.name.toLowerCase() === imported.name.toLowerCase(),
          );
          if (existing) {
            existing.plays.push(...imported.plays);
          } else {
            tendenciesOpponents.push(imported);
          }
        });
        saveTendencies();
        renderTendenciesHome();
        showToast("📥 Import complete!");
      } catch (err) {
        await showModal("Error importing file: " + err.message, {
          title: "Import Error",
          icon: "❌",
        });
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function importTendenciesCSV() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.trim().split("\n");
        if (lines.length < 2)
          throw new Error(
            "CSV must have a header row and at least one data row",
          );

        const headers = parseCSVLine(lines[0]);
        const oppIdx = headers.findIndex(
          (h) => h.toLowerCase().trim() === "opponent",
        );

        const plays = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length === 0) continue;
          const play = createEmptyPlay();
          headers.forEach((header, j) => {
            const trimH = header.trim();
            const key = CSV_TO_KEY[trimH];
            if (key && values[j] !== undefined) {
              play[key] = values[j].trim();
            }
          });
          const oppName =
            oppIdx >= 0 ? (values[oppIdx] || "").trim() : "Imported";
          plays.push({ oppName, play });
        }

        if (plays.length === 0) throw new Error("No valid rows found");

        const grouped = {};
        plays.forEach(({ oppName, play }) => {
          if (!grouped[oppName]) grouped[oppName] = [];
          grouped[oppName].push(play);
        });

        const oppCount = Object.keys(grouped).length;
        const ok = await showConfirm(
          `Import ${plays.length} play(s) across ${oppCount} opponent(s)?\n\nThis will merge with existing data.`,
          { title: "CSV Import", icon: "📥", confirmText: "Import" },
        );
        if (!ok) return;

        Object.entries(grouped).forEach(([name, oppPlays]) => {
          const existing = tendenciesOpponents.find(
            (o) => o.name.toLowerCase() === name.toLowerCase(),
          );
          if (existing) {
            existing.plays.push(...oppPlays);
          } else {
            tendenciesOpponents.push({ name, plays: oppPlays });
          }
        });

        saveTendencies();
        renderTendenciesHome();
        showToast(`📥 Imported ${plays.length} plays`);
      } catch (err) {
        await showModal("Error importing CSV: " + err.message, {
          title: "Import Error",
          icon: "❌",
        });
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        values.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  values.push(current);
  return values;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Print a one-page Scout Report Summary (#96) — overview stats, top fronts,
 * coverages, and tendency bars without the raw play-by-play table.
 */
function printScoutSummary() {
  if (tendenciesCurrentOpponent === null) return;
  const opp = tendenciesOpponents[tendenciesCurrentOpponent];
  if (!opp || opp.plays.length === 0) {
    showModal("No plays to summarise.", { title: "Scout Report", icon: "🖨️" });
    return;
  }

  try {
    showToast("🖨️ Building scout summary…", 2500);

    const plays = opp.plays;
    const total = plays.length;

    // Run/Pass split
    const runTypes = new Set(["Run", "Draw", "QB Run", "Option"]);
    const passTypes = new Set(["Pass", "Screen", "PA"]);
    const runP = plays.filter((p) => runTypes.has(p.offensePlayType)).length;
    const passP = plays.filter((p) => passTypes.has(p.offensePlayType)).length;
    const blitzP = plays.filter((p) => p.defBlitz && p.defBlitz !== "None").length;
    const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);

    // Distribution helpers
    const dist = (field) => {
      const map = {};
      plays.forEach((p) => { if (p[field]) map[p[field]] = (map[p[field]] || 0) + 1; });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };

    const barHtml = (entries, cap = 8) =>
      entries
        .slice(0, cap)
        .map(([k, v]) => {
          const w = pct(v);
          return `<div class="sr-bar-row">
            <span class="sr-bar-label">${escapeHtml(k)}</span>
            <div class="sr-bar-track"><div class="sr-bar-fill" style="width:${w}%"></div></div>
            <span class="sr-bar-count">${v} (${w}%)</span>
          </div>`;
        })
        .join("");

    const frontDist = dist("defFront");
    const covDist = dist("defCoverage");
    const blitzDist = dist("defBlitz").filter(([k]) => k && k !== "None");
    const downDist = dist("down");
    const formDist = dist("offenseFormation");

    const gw = getGameWeek();
    const weekLabel = gw.weekLabel ? ` — ${escapeHtml(gw.weekLabel)}` : "";

    const container = document.getElementById("tendenciesPrint");
    const content = document.getElementById("tendenciesPrintContent");
    if (!container || !content) return;

    content.innerHTML = `
      <div class="td-print-summary">
        <div class="td-print-header">
          <h1>${escapeHtml(opp.name)} Scout Report${weekLabel}</h1>
          <p class="td-print-meta">${total} plays charted &nbsp;|&nbsp; Generated ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="sr-split-row">
          <div class="sr-stat-box">
            <div class="sr-stat-num">${runP}</div>
            <div class="sr-stat-label">Run Plays</div>
            <div class="sr-stat-pct">${pct(runP)}%</div>
          </div>
          <div class="sr-stat-box">
            <div class="sr-stat-num">${passP}</div>
            <div class="sr-stat-label">Pass Plays</div>
            <div class="sr-stat-pct">${pct(passP)}%</div>
          </div>
          <div class="sr-stat-box">
            <div class="sr-stat-num">${blitzP}</div>
            <div class="sr-stat-label">Blitz</div>
            <div class="sr-stat-pct">${pct(blitzP)}%</div>
          </div>
          <div class="sr-stat-box">
            <div class="sr-stat-num">${total}</div>
            <div class="sr-stat-label">Total Plays</div>
            <div class="sr-stat-pct">&nbsp;</div>
          </div>
        </div>

        <div class="sr-section-grid">
          <div class="sr-section">
            <h2>Defensive Fronts</h2>
            ${frontDist.length ? barHtml(frontDist) : "<p>No data</p>"}
          </div>
          <div class="sr-section">
            <h2>Coverage Shell</h2>
            ${covDist.length ? barHtml(covDist) : "<p>No data</p>"}
          </div>
          <div class="sr-section">
            <h2>Blitz Packages</h2>
            ${blitzDist.length ? barHtml(blitzDist) : "<p>None recorded</p>"}
          </div>
          <div class="sr-section">
            <h2>Down Distribution</h2>
            ${downDist.length ? barHtml(downDist, 4) : "<p>No data</p>"}
          </div>
          <div class="sr-section">
            <h2>Offense Formations Faced</h2>
            ${formDist.length ? barHtml(formDist) : "<p>No data</p>"}
          </div>
        </div>
      </div>`;

    document.body.dataset.printMode = "scout-summary";
    container.classList.remove("hidden");

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Scout Summary", opp.name);
        window.print();
        restoreTitle();
      } finally {
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 100);
  } catch (err) {
    console.error("printScoutSummary error:", err);
    document.getElementById("tendenciesPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing scout summary.", { duration: 4000, type: "error" });
  }
}
