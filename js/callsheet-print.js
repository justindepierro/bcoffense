// Call Sheet Print Logic
// Owns: print modal, print option persistence, print rendering (live and print paths)
// Depends on: callsheet.js globals (callSheet, callSheetSettings, CALLSHEET_CATEGORIES,
//             getCallSheetCategoriesForPage, buildCallSheetColumns, buildCallSheetPlayParts,
//             getCallSheetPlayDisplayOptions, getCallSheetDisplayOptions, getPersonnelCode,
//             getPersonnelBgColor, getPersonnelTextColor, getCategoryDisplayName,
//             getCategoryColor, getCategoryHeaderTextColor, getCallSheetHighlightConfig,
//             getPlayBorderColor, normalizeCallSheetPage)
//             storage.js (storageManager, STORAGE_KEYS)
//             print-studio.js (setupPrintPageStyle, setPrintTitle)
//             utils.js (trapFocus, showToast, escapeHtml)

/**
 * Print call sheet — opens an options modal first (paper, orientation,
 * columns, margin) so the user can pick a 2-column portrait layout for
 * better legibility, then renders and prints.
 */
async function printCallSheet() {
  const choice = await openCallSheetPrintModal();
  if (!choice) return;
  _csRunPrint(choice);
}

const CS_PRINT_DEFAULTS = {
  paperSize: "letter",       // "letter" | "legal" | "tabloid"
  orientation: "portrait",   // "portrait" | "landscape"
  pages: "both",             // "both" | "current" | "front" | "back"
  columns: 3,                // 2 | 3 | 4
  margin: "normal",          // "tight" | "normal" | "wide"
};

function getCallSheetPrintOptions() {
  const stored = storageManager.get(STORAGE_KEYS.CALLSHEET_PRINT_OPTIONS, {});
  return { ...CS_PRINT_DEFAULTS, ...(stored && typeof stored === "object" ? stored : {}) };
}

function setCallSheetPrintOptions(opts) {
  const merged = { ...CS_PRINT_DEFAULTS, ...(opts || {}) };
  storageManager.set(STORAGE_KEYS.CALLSHEET_PRINT_OPTIONS, merged);
  return merged;
}

function _csApplyPrintSmartDefaults() {
  return setCallSheetPrintOptions({
    paperSize: "letter",
    orientation: "portrait",
    pages: "both",
    columns: 2,
    margin: "normal",
  });
}

function _csNormalizePrintPages(pages) {
  if (pages === "both" || pages === "front" || pages === "back") return pages;
  return "current";
}

function _csGetPrintPages(pages) {
  const mode = _csNormalizePrintPages(pages);
  if (mode === "both") return ["front", "back"];
  if (mode === "front" || mode === "back") return [mode];
  return [normalizeCallSheetPage(callSheetSettings.currentPage)];
}

function _csPrintMarginValue(orientation, margin) {
  // Per-orientation defaults match the legacy values
  const base = orientation === "landscape" ? 0.14 : 0.16;
  if (margin === "tight") return `${(base - 0.04).toFixed(2)}in`;
  if (margin === "wide") return `${(base + 0.14).toFixed(2)}in`;
  return `${base.toFixed(2)}in`;
}

function _csDescribePrintSelection(opts = {}) {
  const pages = _csNormalizePrintPages(opts.pages);
  const currentPage = normalizeCallSheetPage(callSheetSettings?.currentPage);
  const currentLabel = currentPage === "front" ? "Front" : "Back";
  const pageLabel =
    pages === "both"
      ? "Front + Back, in order"
      : pages === "current"
        ? `Current page only (${currentLabel})`
        : pages === "front"
          ? "Front only"
          : "Back only";
  const paper = opts.paperSize === "legal"
    ? "Legal"
    : opts.paperSize === "tabloid"
      ? "Tabloid"
      : "Letter";
  const orientation = opts.orientation === "landscape" ? "landscape" : "portrait";
  const columns = [2, 3, 4].includes(opts.columns) ? opts.columns : 3;
  const margin = opts.margin === "tight"
    ? "tight margins"
    : opts.margin === "wide"
      ? "wide margins"
      : "normal margins";
  return {
    pages,
    title: pageLabel,
    detail: `${paper} ${orientation} · ${columns} columns · ${margin}`,
  };
}

async function openCallSheetPrintModal() {
  const o = getCallSheetPrintOptions();
  // Default the modal to current orientation toggle if user already set one
  if (callSheetSettings && callSheetSettings.orientation) {
    o.orientation = callSheetSettings.orientation === "landscape" ? "landscape" : "portrait";
  }
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="csPrintTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🖨️</span>
          <h3 class="custom-modal-title" id="csPrintTitle">Print Call Sheet</h3>
        </div>
        <div class="custom-modal-body">
          <div class="gp-print-form">
            <div class="gp-print-row">
              <label>Paper</label>
              <select id="csPrintPaper">
                <option value="letter" ${o.paperSize === "letter" ? "selected" : ""}>Letter (8.5×11)</option>
                <option value="legal" ${o.paperSize === "legal" ? "selected" : ""}>Legal (8.5×14)</option>
                <option value="tabloid" ${o.paperSize === "tabloid" ? "selected" : ""}>Tabloid (11×17)</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Orientation</label>
              <select id="csPrintOrientation">
                <option value="portrait" ${o.orientation === "portrait" ? "selected" : ""}>Portrait</option>
                <option value="landscape" ${o.orientation === "landscape" ? "selected" : ""}>Landscape</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Pages</label>
              <select id="csPrintPages" title="Front first, then back for two-sided printing">
                <option value="both" ${_csNormalizePrintPages(o.pages) === "both" ? "selected" : ""}>Front + Back (2-sided)</option>
                <option value="current" ${_csNormalizePrintPages(o.pages) === "current" ? "selected" : ""}>Current page only</option>
                <option value="front" ${_csNormalizePrintPages(o.pages) === "front" ? "selected" : ""}>Front only</option>
                <option value="back" ${_csNormalizePrintPages(o.pages) === "back" ? "selected" : ""}>Back only</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Columns</label>
              <select id="csPrintColumns" title="Fewer columns = larger, more legible text">
                <option value="2" ${o.columns === 2 ? "selected" : ""}>2 columns (largest text)</option>
                <option value="3" ${o.columns === 3 ? "selected" : ""}>3 columns (default)</option>
                <option value="4" ${o.columns === 4 ? "selected" : ""}>4 columns (most plays per page)</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Margin</label>
              <select id="csPrintMargin">
                <option value="tight" ${o.margin === "tight" ? "selected" : ""}>Tight</option>
                <option value="normal" ${o.margin === "normal" ? "selected" : ""}>Normal</option>
                <option value="wide" ${o.margin === "wide" ? "selected" : ""}>Wide</option>
              </select>
            </div>
            <p class="cs-print-hint" style="margin:10px 0 0;font-size:12px;color:var(--color-text-muted);">
              💡 <strong>Front + Back</strong> prints two pages in order. Turn on two-sided printing in the print dialog to laminate one sheet.
            </p>
            <div class="cs-print-preview-summary" id="csPrintPreviewSummary" role="status" aria-live="polite"></div>
          </div>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel" id="csPrintCancel">Cancel</button>
          <button class="btn btn-secondary custom-modal-btn" id="csPrintSmart" type="button" title="Reset to smart defaults: portrait, 2 columns">✨ Smart defaults</button>
          <button type="button" class="btn btn-primary custom-modal-btn" id="csPrintConfirm">Print</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    if (typeof openLayer === "function")
      openLayer(overlay, {
        id: "cs-print-modal",
        exclusive: false,
        trapFocus: false,
      });
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const close = (result) => {
      if (typeof closeLayer === "function") closeLayer("cs-print-modal");
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    overlay.querySelector("#csPrintCancel").addEventListener("click", () => close(null));
    overlay.querySelector("#csPrintSmart").addEventListener("click", () => {
      _csApplyPrintSmartDefaults();
      close(null);
      setTimeout(() => printCallSheet(), 50);
    });
    overlay.querySelector("#csPrintConfirm").addEventListener("click", () => {
      const opts = setCallSheetPrintOptions({
        paperSize: overlay.querySelector("#csPrintPaper").value,
        orientation: overlay.querySelector("#csPrintOrientation").value,
        pages: overlay.querySelector("#csPrintPages").value,
        columns: parseInt(overlay.querySelector("#csPrintColumns").value, 10) || 3,
        margin: overlay.querySelector("#csPrintMargin").value,
      });
      close(opts);
    });
    const readModalOptions = () => ({
      paperSize: overlay.querySelector("#csPrintPaper")?.value || o.paperSize,
      orientation: overlay.querySelector("#csPrintOrientation")?.value || o.orientation,
      pages: overlay.querySelector("#csPrintPages")?.value || o.pages,
      columns: parseInt(overlay.querySelector("#csPrintColumns")?.value, 10) || o.columns,
      margin: overlay.querySelector("#csPrintMargin")?.value || o.margin,
    });
    const updateSummary = () => {
      const summary = _csDescribePrintSelection(readModalOptions());
      const target = overlay.querySelector("#csPrintPreviewSummary");
      if (!target) return;
      target.innerHTML = `
        <strong>${escapeHtml(summary.title)}</strong>
        <span>${escapeHtml(summary.detail)}</span>
        ${summary.pages === "both" ? "<small>Set the browser print dialog to two-sided if you want one laminated sheet.</small>" : ""}
      `;
    };
    overlay.querySelectorAll("#csPrintPaper, #csPrintOrientation, #csPrintPages, #csPrintColumns, #csPrintMargin").forEach((select) => {
      select.addEventListener("change", updateSummary);
    });
    updateSummary();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(null); }
    });
  });
}

function _csRunPrint(opts) {
  try {
    showToast("🖨️ Preparing call sheet…", 2500);
    const container = document.getElementById("callSheetPrint");
    const content = document.getElementById("callSheetPrintContent");

    const orientation = opts.orientation === "landscape" ? "landscape" : "portrait";
    const columns = [2, 3, 4].includes(opts.columns) ? opts.columns : 3;
    const orientClass = orientation === "landscape" ? "print-landscape" : "print-portrait";
    const colsClass = `print-cs-cols-${columns}`;
    const pagesToPrint = _csGetPrintPages(opts.pages);

    // Hoist display options once — avoids re-reading checkboxes per play
    const printOptions = getCallSheetDisplayOptions();

    // Build print HTML
    const html = pagesToPrint
      .map((page) =>
        renderCallSheetPrintPage(page, {
          columns,
          orientClass,
          colsClass,
          printOptions,
        }),
      )
      .join("");

    content.innerHTML = html;
    container.classList.remove("hidden");
    document.body.dataset.printMode = "callsheet";

    const paper = ["letter", "legal", "tabloid"].includes(opts.paperSize) ? opts.paperSize : "letter";
    const printMargin = _csPrintMarginValue(orientation, opts.margin);
    setupPrintPageStyle(
      `@media print { @page { size: ${paper} ${orientation}; margin: ${printMargin}; } }`,
    );

    setTimeout(() => {
      const pageLabel =
        pagesToPrint.length > 1
          ? "Front-Back"
          : pagesToPrint[0] === "front"
            ? "Front"
            : "Back";
      const restoreTitle = setPrintTitle("Call Sheet", pageLabel);
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try {
          restoreTitle();
        } catch (_) { /* benign: title already restored */ }
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      // Safety net: if the browser never fires afterprint (older browsers,
      // or the user cancels in a way that suppresses it), restore after 60s.
      setTimeout(cleanup, 60000);
      try {
        window.print();
      } catch (e) {
        cleanup();
        throw e;
      }
    }, 100);
  } catch (err) {
    console.error("printCallSheet error:", err);
    document.getElementById("callSheetPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing call sheet.", {
      duration: 4000,
      type: "error",
    });
  }
}

function renderCallSheetPrintPage(page, opts) {
  const safePage = normalizeCallSheetPage(page);
  const categories = getCallSheetCategoriesForPage(safePage);
  const columnGroups = buildCallSheetColumns(categories, opts.columns);
  let html = `<section class="cs-print-page ${opts.orientClass} ${opts.colsClass}" data-cs-print-page="${safePage}">`;

  html += '<div class="print-callsheet-grid">';

  columnGroups.forEach((column) => {
    html += '<div class="print-column">';
    column.forEach((cat) => {
      const data = callSheet[cat.id] || { left: [], right: [] };
      html += renderPrintCategory(cat, data, opts.printOptions);
    });
    html += "</div>";
  });

  html += "</div></section>";
  return html;
}

/**
 * Render a category for print
 */
function renderPrintCategory(cat, data, options) {
  const leftPlays = data.left || [];
  const rightPlays = data.right || [];
  const displayName = getCategoryDisplayName(cat);
  // options passed through from printCallSheet to avoid per-play DOM reads
  if (!options) options = getCallSheetDisplayOptions();

  const headerColor = getCategoryColor(cat);
  const textColor = getCategoryHeaderTextColor(headerColor);

  const note = csNotes[cat.id];

  let html = `
    <div class="print-category">
      <div class="print-category-header" style="background: ${headerColor}; color: ${textColor};">
        ${escapeHtml(displayName)}
      </div>`;

  if (note) {
    html += `<div class="print-cat-note">${escapeHtml(note)}</div>`;
  }

  html += `
      <div class="print-hash-headers">
        <div>Left Hash</div>
        <div>Right Hash</div>
      </div>
      <div class="print-plays-grid">
        <div class="print-hash-column">
  `;

  leftPlays.forEach((play) => {
    html += renderPrintPlay(play, options);
  });

  html += '</div><div class="print-hash-column">';

  rightPlays.forEach((play) => {
    html += renderPrintPlay(play, options);
  });

  html += "</div></div></div>";

  return html;
}

function getCallSheetPrintDensityClass(play, displayOptions, playText) {
  const plainText = String(playText || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const isLandscapePrint = callSheetSettings?.orientation === "landscape";

  let densityScore = plainText.length;
  if (displayOptions.showFormationTags) densityScore += 5;
  if (displayOptions.showTags) densityScore += 5;
  if (displayOptions.showLineCall) densityScore += 6;
  if (displayOptions.showMotion) densityScore += 4;
  if (displayOptions.showProtection) densityScore += 4;
  if (displayOptions.showBack) densityScore += 3;
  if (displayOptions.showPersonnel) densityScore += 3;
  if (play.cellNote) densityScore += Math.min(String(play.cellNote).length, 10);

  if (displayOptions.showOneWordOnly) densityScore -= 18;
  if (play.cellUseOneWord) densityScore -= 10;
  if (isLandscapePrint) densityScore -= 8;

  if (densityScore >= (isLandscapePrint ? 74 : 68)) return "print-play--micro";
  if (densityScore >= (isLandscapePrint ? 63 : 57)) return "print-play--dense";
  if (densityScore >= (isLandscapePrint ? 51 : 46)) return "print-play--compact";
  return "";
}

/**
 * Render a play for print - matches screen display formatting
 */
function renderPrintPlay(play, options) {
  if (!options) options = getCallSheetDisplayOptions();
  const displayOptions = getCallSheetPlayDisplayOptions(play, options);
  const code = getPersonnelCode(play.personnel);
  const bgColor = getPersonnelBgColor(play.personnel);
  const textColor = getPersonnelTextColor(play.personnel);
  const highlightConfig = getCallSheetHighlightConfig(play);
  const isHighlighted = Boolean(highlightConfig);
  const borderColor = getPlayBorderColor(play, options);

  const tempo = (play.tempo || "").toLowerCase();
  let tempoClass = "";
  if (options.highlightHuddle && tempo === "huddle")
    tempoClass = "tempo-huddle";
  else if (options.highlightCandy && tempo === "candy")
    tempoClass = "tempo-candy";

  const playParts = buildCallSheetPlayParts(play, displayOptions);
  const playText = playParts.join(" ");
  const densityClass = getCallSheetPrintDensityClass(
    play,
    displayOptions,
    playText,
  );

  let styles = [];
  const highlightClass = isHighlighted ? "highlighted" : "";
  if (highlightConfig) {
    styles.push(`--cs-highlight-bg: ${highlightConfig.bg};`);
    styles.push(`--cs-highlight-border: ${highlightConfig.border};`);
  }
  if (!isHighlighted && play.cellBg) styles.push(`background: ${play.cellBg};`);
  if (borderColor) styles.push(`border: 2px solid ${borderColor};`);
  if (play.cellTextColor) styles.push(`color: ${play.cellTextColor};`);
  if (play.cellFontSize) styles.push(`font-size: ${play.cellFontSize};`);
  if (play.cellBold) styles.push("font-weight: bold;");
  if (play.cellItalic) styles.push("font-style: italic;");
  let textDeco = [];
  if (play.cellUnderline) textDeco.push("underline");
  if (play.cellStrikethrough) textDeco.push("line-through");
  if (textDeco.length) styles.push(`text-decoration: ${textDeco.join(" ")};`);

  const personnelHtml = displayOptions.showPersonnel
    ? `<span class="print-inline-code" style="background: ${bgColor}; color: ${textColor};">${code}</span>`
    : "";

  const noteHtml = play.cellNote
    ? `<span class="print-cell-note">[${escapeHtml(play.cellNote)}]</span>`
    : "";

  return `
    <div class="print-play ${highlightClass} ${tempoClass} ${densityClass}" style="${styles.join(" ")}">
      <span class="print-play-text">${personnelHtml}${playText.trim()}${noteHtml}</span>
    </div>
  `;
}
