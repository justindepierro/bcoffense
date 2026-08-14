// Call Sheet Print Logic
// Owns: `printCallSheet`, `getCallSheetPrintOptions`,
// `setCallSheetPrintOptions`, `openCallSheetPrintModal`, `_csRunPrint`,
// `renderCallSheetPrintPage`, `renderPrintCategory`,
// `getCallSheetPrintDensityClass`, `renderPrintPlay`.
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
  pages: "both",             // "both" | "all" | "current" | "front" | "back" | "personnel"
  columns: 3,                // 2 | 3 | 4
  margin: "normal",          // "tight" | "normal" | "wide"
};

/* A print job has its own authority. Screen layout state can inform the
   coach's choice, but it must never silently change the rendered paper job. */
function normalizeCallSheetPrintOptions(opts = {}) {
  const raw = { ...CS_PRINT_DEFAULTS, ...(opts && typeof opts === "object" ? opts : {}) };
  return {
    paperSize: ["letter", "legal", "tabloid"].includes(raw.paperSize) ? raw.paperSize : CS_PRINT_DEFAULTS.paperSize,
    orientation: raw.orientation === "landscape" ? "landscape" : "portrait",
    pages: _csNormalizePrintPages(raw.pages),
    columns: [2, 3, 4].includes(Number(raw.columns)) ? Number(raw.columns) : CS_PRINT_DEFAULTS.columns,
    margin: ["tight", "normal", "wide"].includes(raw.margin) ? raw.margin : CS_PRINT_DEFAULTS.margin,
  };
}

function getCallSheetPrintOptions() {
  const stored = storageManager.get(STORAGE_KEYS.CALLSHEET_PRINT_OPTIONS, {});
  return normalizeCallSheetPrintOptions(stored);
}

function setCallSheetPrintOptions(opts) {
  const merged = normalizeCallSheetPrintOptions(opts);
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
  if (["both", "all", "front", "back", "personnel"].includes(pages)) return pages;
  return "current";
}

function _csGetPrintPages(pages) {
  const mode = _csNormalizePrintPages(pages);
  if (mode === "both") return ["front", "back"];
  if (mode === "all") return ["front", "back", "personnel"];
  if (mode === "front" || mode === "back" || mode === "personnel") return [mode];
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
  const printJob = normalizeCallSheetPrintOptions(opts);
  const pages = printJob.pages;
  const currentPage = normalizeCallSheetPage(callSheetSettings?.currentPage);
  const currentLabel = currentPage === "front" ? "Front" : currentPage === "back" ? "Back" : "Personnel";
  const pageLabel =
    pages === "both"
      ? "Front + Back, in order"
      : pages === "all"
        ? "Front + Back + Personnel, in order"
      : pages === "current"
        ? `Current page only (${currentLabel})`
        : pages === "front"
          ? "Front only"
          : pages === "back"
            ? "Back only"
            : "Personnel only";
  const paper = printJob.paperSize === "legal"
    ? "Legal"
    : printJob.paperSize === "tabloid"
      ? "Tabloid"
      : "Letter";
  const orientation = printJob.orientation;
  const columns = printJob.columns;
  const margin = printJob.margin === "tight"
    ? "tight margins"
    : printJob.margin === "wide"
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
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay cs-print-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="csPrintTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🖨️</span>
          <h3 class="custom-modal-title" id="csPrintTitle">Print Call Sheet</h3>
        </div>
        <div class="custom-modal-body">
          <div class="gp-print-form">
            <div class="gp-print-row">
              <label for="csPrintPaper">Paper</label>
              <select id="csPrintPaper" name="paperSize">
                <option value="letter" ${o.paperSize === "letter" ? "selected" : ""}>Letter (8.5×11)</option>
                <option value="legal" ${o.paperSize === "legal" ? "selected" : ""}>Legal (8.5×14)</option>
                <option value="tabloid" ${o.paperSize === "tabloid" ? "selected" : ""}>Tabloid (11×17)</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label for="csPrintOrientation">Orientation</label>
              <select id="csPrintOrientation" name="orientation">
                <option value="portrait" ${o.orientation === "portrait" ? "selected" : ""}>Portrait</option>
                <option value="landscape" ${o.orientation === "landscape" ? "selected" : ""}>Landscape</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label for="csPrintPages">Pages</label>
              <select id="csPrintPages" name="pages" title="Front first, then back for two-sided printing">
                <option value="both" ${_csNormalizePrintPages(o.pages) === "both" ? "selected" : ""}>Front + Back (2-sided)</option>
                <option value="all" ${_csNormalizePrintPages(o.pages) === "all" ? "selected" : ""}>Front + Back + Personnel (3 pages)</option>
                <option value="current" ${_csNormalizePrintPages(o.pages) === "current" ? "selected" : ""}>Current page only</option>
                <option value="front" ${_csNormalizePrintPages(o.pages) === "front" ? "selected" : ""}>Front only</option>
                <option value="back" ${_csNormalizePrintPages(o.pages) === "back" ? "selected" : ""}>Back only</option>
                <option value="personnel" ${_csNormalizePrintPages(o.pages) === "personnel" ? "selected" : ""}>Personnel only</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label for="csPrintColumns">Columns</label>
              <select id="csPrintColumns" name="columns" title="Fewer columns = larger, more legible text">
                <option value="2" ${o.columns === 2 ? "selected" : ""}>2 columns (largest text)</option>
                <option value="3" ${o.columns === 3 ? "selected" : ""}>3 columns (default)</option>
                <option value="4" ${o.columns === 4 ? "selected" : ""}>4 columns (most plays per page)</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label for="csPrintMargin">Margin</label>
              <select id="csPrintMargin" name="margin">
                <option value="tight" ${o.margin === "tight" ? "selected" : ""}>Tight</option>
                <option value="normal" ${o.margin === "normal" ? "selected" : ""}>Normal</option>
                <option value="wide" ${o.margin === "wide" ? "selected" : ""}>Wide</option>
              </select>
            </div>
            <p class="cs-print-hint" style="margin:10px 0 0;font-size:12px;color:var(--color-text-muted);">
              💡 <strong>Front + Back</strong> prints two pages in order. Choose the three-page option when you also want the Personnel reference sheet.
            </p>
            <div class="cs-print-preview-summary" id="csPrintPreviewSummary" role="status" aria-live="polite"></div>
          </div>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel" id="csPrintCancel">Cancel</button>
          <button class="btn btn-secondary custom-modal-btn" id="csPrintSmart" type="button" title="Reset to smart defaults: portrait, 2 columns">✨ Smart defaults</button>
          <button class="btn btn-secondary custom-modal-btn" id="csPrintPreview" type="button">Preview</button>
          <button type="button" class="btn btn-primary custom-modal-btn" id="csPrintConfirm">Print</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (result) => {
      if (typeof closeLayer === "function") closeLayer("cs-print-modal");
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    if (typeof openLayer === "function") {
      openLayer(overlay, {
        id: "cs-print-modal",
        scrollElement: overlay.querySelector(".custom-modal-body") || overlay.querySelector(".custom-modal") || overlay,
        blocking: true,
        exclusive: false,
        initialFocus: overlay.querySelector("#csPrintCancel") || overlay.querySelector(".custom-modal") || overlay,
        onEscape: () => close(null),
      });
    } else if (typeof trapFocus === "function") {
      trapFocus(overlay);
      overlay.querySelector("#csPrintCancel")?.focus();
    }
    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      // Custom overlays are deliberately hidden until this frame. Focus after
      // visibility changes so LayerManager's target is an eligible control.
      overlay.querySelector("#csPrintCancel")?.focus({ preventScroll: true });
    });
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
    overlay.querySelector("#csPrintPreview").addEventListener("click", () => {
      const previewJob = setCallSheetPrintOptions(readModalOptions());
      close(null);
      setTimeout(() => {
        try {
          openCallSheetPrintPreview(previewJob);
        } catch (error) {
          console.error("Call Sheet print preview could not be built:", error);
          showToast("Could not build the print preview. Your Call Sheet is still saved.", "error");
        }
      }, 50);
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

/* Preview uses the exact same print job and HTML renderer as the browser
   print flow. It is a coach-facing proof step, not a second output path. */
function openCallSheetPrintPreview(opts = {}) {
  const printJob = normalizeCallSheetPrintOptions(opts);
  const pagesToPreview = _csGetPrintPages(printJob.pages);
  const orientation = printJob.orientation;
  const columns = printJob.columns;
  const orientClass = orientation === "landscape" ? "print-landscape" : "print-portrait";
  const colsClass = `print-cs-cols-${columns}`;
  const printOptions = getCallSheetDisplayOptions();
  const summary = _csDescribePrintSelection(printJob);
  const pagesHtml = pagesToPreview.map((page) => renderCallSheetPrintPage(page, {
    columns,
    orientClass,
    colsClass,
    printOptions,
    printJob,
  })).join("");
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay cs-print-preview-overlay";
  overlay.innerHTML = `
    <div class="custom-modal cs-print-preview-modal" role="dialog" aria-modal="true" aria-labelledby="csPrintPreviewTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">👁️</span>
        <h3 class="custom-modal-title" id="csPrintPreviewTitle">Call Sheet Print Preview</h3>
      </div>
      <div class="cs-print-preview-meta">
        <strong>${escapeHtml(summary.title)}</strong>
        <span>${escapeHtml(summary.detail)}</span>
      </div>
      <div class="cs-print-preview-pages" data-cs-preview-orientation="${orientation}">
        ${pagesHtml}
      </div>
      <div class="custom-modal-actions">
        <button type="button" class="btn custom-modal-btn custom-modal-cancel" data-cs-preview-action="close">Back</button>
        <button type="button" class="btn btn-primary custom-modal-btn" data-cs-preview-action="print">Print this job</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    if (typeof closeLayer === "function") closeLayer("cs-print-preview");
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  };
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "cs-print-preview",
      scrollElement: overlay.querySelector(".cs-print-preview-pages") || overlay.querySelector(".custom-modal") || overlay,
      blocking: true,
      exclusive: false,
      initialFocus: overlay.querySelector('[data-cs-preview-action="close"]') || overlay.querySelector(".custom-modal") || overlay,
      onEscape: close,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
    overlay.querySelector('[data-cs-preview-action="close"]')?.focus();
  }
  requestAnimationFrame(() => {
    overlay.classList.add("visible");
    overlay.querySelector('[data-cs-preview-action="close"]')?.focus({ preventScroll: true });
  });
  overlay.querySelector('[data-cs-preview-action="close"]').addEventListener("click", close);
  overlay.querySelector('[data-cs-preview-action="print"]').addEventListener("click", () => {
    close();
    setTimeout(() => _csRunPrint(printJob), 50);
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
  });
}

function _csRunPrint(opts) {
  try {
    const printJob = normalizeCallSheetPrintOptions(opts);
    showToast("🖨️ Preparing call sheet…", 2500);
    const container = document.getElementById("callSheetPrint");
    const content = document.getElementById("callSheetPrintContent");

    const orientation = printJob.orientation;
    const columns = printJob.columns;
    const orientClass = orientation === "landscape" ? "print-landscape" : "print-portrait";
    const colsClass = `print-cs-cols-${columns}`;
    const pagesToPrint = _csGetPrintPages(printJob.pages);

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
          printJob,
        }),
      )
      .join("");

    content.innerHTML = html;
    container.classList.remove("hidden");
    document.body.dataset.printMode = "callsheet";

    const paper = printJob.paperSize;
    const printMargin = _csPrintMarginValue(orientation, printJob.margin);
    setupPrintPageStyle(
      `@media print { @page { size: ${paper} ${orientation}; margin: ${printMargin}; } }`,
    );

    setTimeout(() => {
      const pageLabel = pagesToPrint.join("-").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  if (safePage === "personnel") {
    const fontKey = typeof getCallSheetFontKey === "function"
      ? getCallSheetFontKey(opts.printOptions?.font)
      : "standard";
    return `<section class="cs-print-page cs-print-personnel ${opts.orientClass} ${opts.colsClass}" data-cs-print-page="personnel" data-callsheet-font="${fontKey}">
      <header class="cs-print-personnel-title">Personnel Call Sheet</header>
      ${renderPersonnelCallSheet(opts.printOptions)}
    </section>`;
  }
  const categories = getCallSheetCategoriesForPage(safePage);
  const columnGroups = buildCallSheetColumns(categories, opts.columns);
  const fontKey = typeof getCallSheetFontKey === "function"
    ? getCallSheetFontKey(opts.printOptions?.font)
    : "standard";
  let html = `<section class="cs-print-page ${opts.orientClass} ${opts.colsClass}" data-cs-print-page="${safePage}" data-callsheet-font="${fontKey}">`;

  html += '<div class="print-callsheet-grid">';

  columnGroups.forEach((column) => {
    html += '<div class="print-column">';
    column.forEach((cat) => {
      const data = callSheet[cat.id] || { left: [], right: [] };
      html += renderPrintCategory(cat, data, opts.printOptions, opts.printJob);
    });
    html += "</div>";
  });

  html += "</div></section>";
  return html;
}

/**
 * Render a category for print
 */
function renderPrintCategory(cat, data, options, printJob) {
  const leftPlays = data.left || [];
  const rightPlays = data.right || [];
  const columnMode = typeof getCallSheetCategoryColumnMode === "function"
    ? getCallSheetCategoryColumnMode(cat.id)
    : "hashes";
  const displayName = getCategoryDisplayName(cat);
  // options passed through from printCallSheet to avoid per-play DOM reads
  if (!options) options = getCallSheetDisplayOptions();

  const headerColor = getCategoryColor(cat);
  const textColor = getCategoryHeaderTextColor(headerColor);

  const note = csNotes[cat.id];

  let html = `
    <div class="print-category${columnMode === "single" ? " print-category--single" : ""}">
      <div class="print-category-header" style="background: ${headerColor}; color: ${textColor};">
        ${escapeHtml(displayName)}
      </div>`;

  if (note) {
    html += `<div class="print-cat-note">${escapeHtml(note)}</div>`;
  }

  if (columnMode === "single") {
    html += `
      <div class="print-hash-headers"><div>Scripted Calls</div></div>
      <div class="print-plays-grid"><div class="print-hash-column">`;
    [...leftPlays, ...rightPlays].forEach((play) => {
      html += renderPrintPlay(play, options, printJob);
    });
    return `${html}</div></div></div>`;
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
    html += renderPrintPlay(play, options, printJob);
  });

  html += '</div><div class="print-hash-column">';

  rightPlays.forEach((play) => {
    html += renderPrintPlay(play, options, printJob);
  });

  html += "</div></div></div>";

  return html;
}

function getCallSheetPrintDensityClass(play, displayOptions, playText, printJob) {
  const plainText = String(playText || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const isLandscapePrint = normalizeCallSheetPrintOptions(printJob).orientation === "landscape";

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
function renderPrintPlay(play, options, printJob) {
  // Blank cells are intentional layout spacers. Preserve their row height in
  // preview and print so a one-sided call can stay aligned with its opposite.
  if (play?._blank) {
    return '<div class="print-play print-play--blank" aria-hidden="true">&nbsp;</div>';
  }
  if (typeof getCallSheetEffectivePlay === "function") {
    play = getCallSheetEffectivePlay(play);
  }
  if (!options) options = getCallSheetDisplayOptions();
  const displayOptions = getCallSheetPlayDisplayOptions(play, options);
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
    printJob,
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

  // Keep preview rendering self-contained. Print rendering can be invoked before
  // the interactive Call Sheet renderer is available (for example, during a
  // restored session), so it must not depend on that renderer's helper.
  const personnel = String(play?.personnel || "").trim();
  const personnelMarker = typeof getPersonnelEmoji === "function" ? getPersonnelEmoji(personnel) : "";
  const personnelCode = typeof getPersonnelCode === "function" ? getPersonnelCode(personnel) : personnel;
  const personnelHtml = displayOptions.showPersonnel && personnel
    ? (personnelMarker
      ? `<span class="print-inline-code cs-personnel-marker" title="${escapeHtml(personnel)}">${personnelMarker}</span>`
      : `<span class="print-inline-code" style="background: ${getPersonnelBgColor(personnel)}; color: ${getPersonnelTextColor(personnel)};">${escapeHtml(personnelCode)}</span>`)
    : "";
  const additionalPersonnelHtml = displayOptions.showPersonnel && typeof renderCallSheetAdditionalPersonnel === "function"
    ? renderCallSheetAdditionalPersonnel(play, "print-extra-personnel")
    : "";
  const wristbandHtml = displayOptions.showNumbers && play.wristbandNumber
    ? `<span class="print-wristband-number">#${escapeHtml(play.wristbandNumber)}</span>`
    : "";

  const noteHtml = play.cellNote
    ? `<span class="print-cell-note">[${escapeHtml(play.cellNote)}]</span>`
    : "";

  return `
    <div class="print-play ${highlightClass} ${tempoClass} ${densityClass}" style="${styles.join(" ")}">
      <span class="print-play-text">${wristbandHtml}${personnelHtml}${additionalPersonnelHtml}${playText.trim()}${noteHtml}</span>
    </div>
  `;
}
