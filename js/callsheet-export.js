// ============================================================
// callsheet-export.js — call sheet export + play location helpers
//
// Owns: `isPlayOnCallSheet`, `getCallSheetPlayLocations`,
// `exportCallSheetCSV`.
//
// Loaded after callsheet.js.
// ============================================================

/**
 * Check if a play is already in a category on the call sheet
 */
function isPlayOnCallSheet(play, categoryId) {
  const data = callSheet[categoryId];
  if (!data) return false;
  const checkArr = (arr) => arr.some((p) => playsMatch(p, play));
  return checkArr(data.left || []) || checkArr(data.right || []);
}

function getCallSheetPlayLocations(play) {
  const locations = [];

  CALLSHEET_CATEGORIES.forEach((cat) => {
    const data = callSheet[cat.id];
    if (!data) return;

    if ((data.left || []).some((entry) => playsMatch(entry, play))) {
      locations.push(`${getCategoryDisplayName(cat)} - Left`);
    }
    if ((data.right || []).some((entry) => playsMatch(entry, play))) {
      locations.push(`${getCategoryDisplayName(cat)} - Right`);
    }
  });

  return locations;
}

/**
 * Export the entire call sheet to CSV — one row per play, grouped by bucket.
 */
function exportCallSheetCSV() {
  const hasPlays = CALLSHEET_CATEGORIES.some((cat) => {
    const bucket = callSheet[cat.id];
    return bucket && (bucket.left?.length || bucket.right?.length);
  });
  if (!hasPlays) {
    showToast("Call sheet is empty — nothing to export.", { type: "error" });
    return;
  }

  const esc = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };

  const headers = [
    "Category",
    "Side",
    "Formation",
    "Back",
    "Shift",
    "Motion",
    "Protection",
    "Play",
    "Type",
    "Personnel",
    "OneWord",
    "Tempo",
    "Notes",
  ];
  const rows = [headers.join(",")];

  CALLSHEET_CATEGORIES.forEach((cat) => {
    const bucket = callSheet[cat.id];
    if (!bucket) return;
    const catName = getCategoryDisplayName(cat);
    ["left", "right"].forEach((side) => {
      (bucket[side] || []).forEach((p) => {
        if (!p || p._blank) return;
        rows.push(
          [
            esc(catName),
            side === "left" ? "L" : "R",
            esc(p.formation),
            esc(p.back),
            esc(p.shift),
            esc(p.motion),
            esc(p.protection),
            esc(p.play),
            esc(p.type),
            esc(p.personnel),
            esc(p.oneWord),
            esc(p.tempo),
            esc(p.notes),
          ].join(","),
        );
      });
    });
  });

  const csv = rows.join("\n");
  const dateStr = new Date().toISOString().slice(0, 10);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = typeof getPrintStudioExportName === "function"
    ? getPrintStudioExportName("Call-Sheet", "", "csv")
    : `call_sheet_${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`📥 Exported call sheet to CSV`, {
    duration: 3000,
    type: "success",
  });
}
