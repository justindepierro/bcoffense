const PB_PRINT_SORT_FIELDS = [
  { value: "personnel", label: "Personnel" },
  { value: "type", label: "Play Type" },
  { value: "tempo", label: "Tempo" },
  { value: "formation", label: "Formation" },
  { value: "basePlay", label: "Base Play" },
  { value: "play", label: "Play Name" },
  { value: "back", label: "Back" },
  { value: "protection", label: "Protection" },
  { value: "motion", label: "Motion" },
];

let pbPrintSortCriteria = [{ field: "formation", direction: "asc" }];
let _pbSortDragged = null;

function renderPbPrintSort() {
  const container = document.getElementById("pbPrintSortList");
  if (!container) return;

  container.innerHTML = pbPrintSortCriteria
    .map((criterion, idx) => {
      const fieldOpts = PB_PRINT_SORT_FIELDS.map(
        (field) =>
          `<option value="${field.value}" ${criterion.field === field.value ? "selected" : ""}>${field.label}</option>`,
      ).join("");

      const dirIcon = criterion.direction === "asc" ? "↑" : "↓";
      const dirTitle =
        criterion.direction === "asc"
          ? "Ascending (A→Z)"
          : "Descending (Z→A)";

      const hasCustom =
        wbCustomSortOrders[criterion.field] &&
        wbCustomSortOrders[criterion.field].length > 0;
      const customIcon = hasCustom ? "🎨" : "⚙️";
      const customTitle = hasCustom
        ? "Custom order set - click to edit"
        : "Set custom value order";

      return `
      <div class="sort-criteria-item" draggable="true" data-idx="${idx}"
           data-drag="pbSort">
        <span class="drag-handle">☰</span>
        <select data-onchange="_pbSortUpdateField" data-key="${idx}" data-pass="value">${fieldOpts}</select>
        <button class="sort-dir-btn" data-action="_pbSortToggleDir" data-idx="${idx}" title="${dirTitle}">${dirIcon}</button>
        <button class="custom-order-btn custom-order-btn-compact" data-action="openCustomOrderModal" data-sort-field="${criterion.field}" title="${customTitle}">${customIcon}</button>
        <button class="remove-sort-btn" data-action="_pbSortRemove" data-idx="${idx}">✕</button>
      </div>`;
    })
    .join("");
}

function addPbPrintSortField() {
  const used = pbPrintSortCriteria.map((criterion) => criterion.field);
  const next = PB_PRINT_SORT_FIELDS.find((field) => !used.includes(field.value));
  if (next) {
    pbPrintSortCriteria.push({ field: next.value, direction: "asc" });
    renderPbPrintSort();
  } else {
    showToast("All sort fields are already in use");
  }
}

function _pbSortRemove(idx) {
  if (pbPrintSortCriteria.length <= 1) {
    showToast("Need at least one sort field");
    return;
  }
  pbPrintSortCriteria.splice(idx, 1);
  renderPbPrintSort();
}

function _pbSortUpdateField(idx, val) {
  pbPrintSortCriteria[idx].field = val;
  renderPbPrintSort();
}

function _pbSortToggleDir(idx) {
  pbPrintSortCriteria[idx].direction =
    pbPrintSortCriteria[idx].direction === "asc" ? "desc" : "asc";
  renderPbPrintSort();
}

function _pbSortDragStart(e, idx) {
  _pbSortDragged = idx;
  e.target.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function _pbSortDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function _pbSortDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  if (_pbSortDragged === null || _pbSortDragged === targetIdx) return;
  const [moved] = pbPrintSortCriteria.splice(_pbSortDragged, 1);
  pbPrintSortCriteria.splice(targetIdx, 0, moved);
  _pbSortDragged = null;
  renderPbPrintSort();
}

function _pbSortDragEnd(e) {
  e.target.classList.remove("dragging");
  _pbSortDragged = null;
  document
    .querySelectorAll("#pbPrintSortList .drag-over")
    .forEach((el) => el.classList.remove("drag-over"));
}

function _applyPbPrintSort(playsArr) {
  if (!pbPrintSortCriteria.length) return playsArr;
  return [...playsArr].sort((a, b) => {
    for (const criterion of pbPrintSortCriteria) {
      const valA = String(a[criterion.field] || "").trim();
      const valB = String(b[criterion.field] || "").trim();
      const cmp = compareWithCustomOrder(
        valA,
        valB,
        criterion.field,
        criterion.direction,
      );
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

function togglePrintOptionsPanel() {
  const panel = document.getElementById("pbPrintPanel");
  if (!panel) return;
  const wasOpen = panel.classList.contains("open");
  panel.classList.toggle("open");
  if (!wasOpen) renderPbPrintSort();
}

function _getPbPrintOptions() {
  return {
    showEmoji: document.getElementById("pbShowEmoji")?.checked || false,
    useSquares: document.getElementById("pbUseSquares")?.checked || false,
    underEmoji: document.getElementById("pbUnderEmoji")?.checked || false,
    boldShifts: document.getElementById("pbBoldShifts")?.checked || false,
    redShifts: document.getElementById("pbRedShifts")?.checked || false,
    italicMotions: document.getElementById("pbItalicMotions")?.checked || false,
    redMotions: document.getElementById("pbRedMotions")?.checked || false,
    noVowels: document.getElementById("pbRemoveVowels")?.checked || false,
    showLineCall: document.getElementById("pbShowLineCall")?.checked || false,
    highlightHuddle:
      document.getElementById("pbHighlightHuddle")?.checked || false,
    highlightCandy:
      document.getElementById("pbHighlightCandy")?.checked || false,
  };
}

function syncFromWristbandOptions() {
  const mappings = [
    ["wbShowEmoji", "pbShowEmoji"],
    ["wbUseSquares", "pbUseSquares"],
    ["wbUnderEmoji", "pbUnderEmoji"],
    ["wbBoldShifts", "pbBoldShifts"],
    ["wbRedShifts", "pbRedShifts"],
    ["wbItalicMotions", "pbItalicMotions"],
    ["wbRedMotions", "pbRedMotions"],
    ["wbRemoveVowels", "pbRemoveVowels"],
    ["wbShowLineCall", "pbShowLineCall"],
    ["wbHighlightHuddle", "pbHighlightHuddle"],
    ["wbHighlightCandy", "pbHighlightCandy"],
  ];

  mappings.forEach(([src, dst]) => {
    const srcEl = document.getElementById(src);
    const dstEl = document.getElementById(dst);
    if (srcEl && dstEl) dstEl.checked = srcEl.checked;
  });
  showToast("Synced formatting options from Wristband tab");
}

function toggleAllPbPrintOptions(state) {
  const ids = [
    "pbShowEmoji",
    "pbUseSquares",
    "pbUnderEmoji",
    "pbBoldShifts",
    "pbRedShifts",
    "pbItalicMotions",
    "pbRedMotions",
    "pbShowLineCall",
    "pbHighlightHuddle",
    "pbHighlightCandy",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = state;
  });
}

function printFilteredPlays() {
  if (!filteredPlays || filteredPlays.length === 0) {
    showToast("No plays to print — adjust your filters first.");
    return;
  }

  try {
    showToast("🖨️ Preparing playbook print…", 2500);
    const opts = _getPbPrintOptions();
    const { highlightHuddle, highlightCandy } = opts;
    const container = document.getElementById("playbookPrintCards");
    const sortedPlays = _applyPbPrintSort(filteredPlays);

    const total = sortedPlays.length;
    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    let html =
      `<div class="pb-print-title">Playbook — ${escapeHtml(total + "")} Plays</div>` +
      `<div class="pb-print-meta">${escapeHtml(dateStr)}</div>`;

    html += '<ul class="pb-print-list">';

    sortedPlays.forEach((play, idx) => {
      const isHuddle =
        highlightHuddle && play.tempo && play.tempo.toLowerCase() === "huddle";
      const isCandy =
        highlightCandy && play.tempo && play.tempo.toLowerCase() === "candy";
      const bgStyle = isHuddle
        ? ` style="background:${UI_COLORS.highlightHuddle};"`
        : isCandy
          ? ` style="background:${UI_COLORS.highlightCandy};"`
          : "";

      html += `<li${bgStyle}><span class="pb-print-num">${idx + 1}.</span><span class="pb-print-call">${getFullCall(play, opts)}</span></li>`;
    });

    html += "</ul>";
    container.innerHTML = html;

    document.getElementById("playbookPrint").classList.remove("hidden");
    document.body.dataset.printMode = "playbook";

    setupPrintPageStyle(
      "@media print { @page { size: letter portrait; margin: 0.35in 0.4in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Playbook");
        window.print();
        restoreTitle();
      } finally {
        document.getElementById("playbookPrint").classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 100);
  } catch (err) {
    console.error("printFilteredPlays error:", err);
    document.getElementById("playbookPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing playbook.", {
      duration: 4000,
      type: "error",
    });
  }
}