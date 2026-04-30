const _CSV_HEADERS = [
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

const _CSV_KEYS = [
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

function _csvEscape(val) {
  const s = val == null ? "" : String(val);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function exportPlaybookCSV() {
  if (!plays || plays.length === 0) {
    showToast("No plays to export", { duration: 3000, type: "error" });
    return;
  }

  const rows = [_CSV_HEADERS.join(",")];
  plays.forEach((play) => {
    rows.push(_CSV_KEYS.map((key) => _csvEscape(play[key])).join(","));
  });

  const csv = rows.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "playbook_export.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast(`📥 Exported ${plays.length} plays to CSV`, {
    duration: 3000,
    type: "success",
  });
}