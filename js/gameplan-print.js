/* =========================================================================
   Game Plan — print modal + print render
   Split out of gameplan.js — see AGENTS.md for ownership map.
   ========================================================================= */

/* -------------------------------------------------------------------------
   Print
   ------------------------------------------------------------------------- */

function printGamePlan() {
  // Rely on print.css scoping; just trigger native print.
  window.print();
}
/* -------------------------------------------------------------------------
   Print View
   ------------------------------------------------------------------------- */

let _gpPrintOptions = {
  paperSize: "letter",
  orientation: "portrait",
  columns: 2,
  showHash: true,
  showNotes: true,
  showProgress: true,
  showMeta: true,
  showHolding: false,
  showEmpty: false,
  bucketPerPage: false,
  showPageNumbers: true,
  showFooter: true,
  showDetail: false,
  playerHandout: false,
  showWristbandNumber: true,
  jvOnly: false,
  imageAppendix: false,
  sortMode: "perBox", // primary tier; "perBox" honors each box's own setting
  sortMode2: "",       // secondary tier (ignored when sortMode is perBox)
  sortMode3: "",       // tertiary tier (ignored when sortMode is perBox)
};

// Smart preset: portrait, 2-col, no bucket splits, single-line plays.
function _gpApplySmartPrintDefaults() {
  _gpPrintOptions = {
    ..._gpPrintOptions,
    paperSize: "letter",
    orientation: "portrait",
    columns: 2,
    showMeta: true,
    showHash: true,
    showProgress: true,
    showNotes: false,
    showHolding: false,
    showEmpty: false,
    bucketPerPage: false,
    showPageNumbers: true,
    showFooter: true,
    showDetail: false,
    playerHandout: false,
    showWristbandNumber: true,
  };
}

async function openGamePlanPrintModal() {
  const o = _gpPrintOptions;
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">🖨️</span>
          <h3 class="custom-modal-title">Print Game Plan</h3>
        </div>
        <div class="custom-modal-body">
          <div class="gp-print-form">
            <div class="gp-print-row">
              <label>Paper</label>
              <select id="gpPrintPaper">
                <option value="letter" ${o.paperSize === "letter" ? "selected" : ""}>Letter (8.5×11)</option>
                <option value="legal" ${o.paperSize === "legal" ? "selected" : ""}>Legal (8.5×14)</option>
                <option value="tabloid" ${o.paperSize === "tabloid" ? "selected" : ""}>Tabloid (11×17)</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Orientation</label>
              <select id="gpPrintOrientation">
                <option value="portrait" ${o.orientation === "portrait" ? "selected" : ""}>Portrait</option>
                <option value="landscape" ${o.orientation === "landscape" ? "selected" : ""}>Landscape</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Columns</label>
              <select id="gpPrintColumns">
                <option value="2" ${o.columns === 2 ? "selected" : ""}>2</option>
                <option value="3" ${o.columns === 3 ? "selected" : ""}>3</option>
                <option value="4" ${o.columns === 4 ? "selected" : ""}>4</option>
                <option value="5" ${o.columns === 5 ? "selected" : ""}>5</option>
              </select>
            </div>
            <div class="gp-print-row">
              <label>Sort all buckets</label>
              <select id="gpPrintSort" title="Override per-box sort for printing">
                <option value="perBox" ${o.sortMode === "perBox" ? "selected" : ""}>Per-box (use each bucket's setting)</option>
                <option value="manual" ${o.sortMode === "manual" ? "selected" : ""}>Manual order</option>
                <option value="type" ${o.sortMode === "type" ? "selected" : ""}>Type</option>
                <option value="formation" ${o.sortMode === "formation" ? "selected" : ""}>Formation</option>
                <option value="personnel" ${o.sortMode === "personnel" ? "selected" : ""}>Personnel</option>
                <option value="basePlay" ${o.sortMode === "basePlay" ? "selected" : ""}>Base Play</option>
                <option value="hash" ${o.sortMode === "hash" ? "selected" : ""}>Hash (L/M/R)</option>
                <option value="down" ${o.sortMode === "down" ? "selected" : ""}>Down</option>
                <option value="distance" ${o.sortMode === "distance" ? "selected" : ""}>Distance</option>
                <option value="situation" ${o.sortMode === "situation" ? "selected" : ""}>Situation</option>
                <option value="field" ${o.sortMode === "field" ? "selected" : ""}>Field Position</option>
                <option value="play" ${o.sortMode === "play" ? "selected" : ""}>Play Name</option>
              </select>
            </div>
            <div class="gp-print-row" id="gpPrintSortTierRow">
              <label>Then by</label>
              <select id="gpPrintSort2" title="Secondary sort tier">
                <option value="" ${!o.sortMode2 ? "selected" : ""}>— none —</option>
                <option value="type" ${o.sortMode2 === "type" ? "selected" : ""}>Type</option>
                <option value="formation" ${o.sortMode2 === "formation" ? "selected" : ""}>Formation</option>
                <option value="personnel" ${o.sortMode2 === "personnel" ? "selected" : ""}>Personnel</option>
                <option value="basePlay" ${o.sortMode2 === "basePlay" ? "selected" : ""}>Base Play</option>
                <option value="hash" ${o.sortMode2 === "hash" ? "selected" : ""}>Hash (L/M/R)</option>
                <option value="down" ${o.sortMode2 === "down" ? "selected" : ""}>Down</option>
                <option value="distance" ${o.sortMode2 === "distance" ? "selected" : ""}>Distance</option>
                <option value="situation" ${o.sortMode2 === "situation" ? "selected" : ""}>Situation</option>
                <option value="field" ${o.sortMode2 === "field" ? "selected" : ""}>Field Position</option>
                <option value="play" ${o.sortMode2 === "play" ? "selected" : ""}>Play Name</option>
              </select>
              <select id="gpPrintSort3" title="Tertiary sort tier">
                <option value="" ${!o.sortMode3 ? "selected" : ""}>— none —</option>
                <option value="type" ${o.sortMode3 === "type" ? "selected" : ""}>Type</option>
                <option value="formation" ${o.sortMode3 === "formation" ? "selected" : ""}>Formation</option>
                <option value="personnel" ${o.sortMode3 === "personnel" ? "selected" : ""}>Personnel</option>
                <option value="basePlay" ${o.sortMode3 === "basePlay" ? "selected" : ""}>Base Play</option>
                <option value="hash" ${o.sortMode3 === "hash" ? "selected" : ""}>Hash (L/M/R)</option>
                <option value="down" ${o.sortMode3 === "down" ? "selected" : ""}>Down</option>
                <option value="distance" ${o.sortMode3 === "distance" ? "selected" : ""}>Distance</option>
                <option value="situation" ${o.sortMode3 === "situation" ? "selected" : ""}>Situation</option>
                <option value="field" ${o.sortMode3 === "field" ? "selected" : ""}>Field Position</option>
                <option value="play" ${o.sortMode3 === "play" ? "selected" : ""}>Play Name</option>
              </select>
            </div>
            <div class="gp-print-row gp-print-toggles">
              <label><input type="checkbox" id="gpPrintMeta" ${o.showMeta ? "checked" : ""}> Show formation/personnel</label>
              <label><input type="checkbox" id="gpPrintHash" ${o.showHash ? "checked" : ""}> Show hash bar</label>
              <label><input type="checkbox" id="gpPrintProgress" ${o.showProgress ? "checked" : ""}> Show targets</label>
              <label><input type="checkbox" id="gpPrintNotes" ${o.showNotes ? "checked" : ""}> Show notes</label>
              <label><input type="checkbox" id="gpPrintHolding" ${o.showHolding ? "checked" : ""}> Include Holding box</label>
              <label><input type="checkbox" id="gpPrintEmpty" ${o.showEmpty ? "checked" : ""}> Include empty boxes</label>
              <label><input type="checkbox" id="gpPrintWBNum" ${o.showWristbandNumber ? "checked" : ""}> Show wristband number (when loaded)</label>
              <label><input type="checkbox" id="gpPrintBucketPerPage" ${o.bucketPerPage ? "checked" : ""}> One bucket per page</label>
              <label><input type="checkbox" id="gpPrintPageNumbers" ${o.showPageNumbers ? "checked" : ""}> Page numbers</label>
              <label><input type="checkbox" id="gpPrintFooter" ${o.showFooter ? "checked" : ""}> Footer (team · opponent · date)</label>
              <label><input type="checkbox" id="gpPrintDetail" ${o.showDetail ? "checked" : ""}> Show bucket detail (touches, type, D&D)</label>
              <label><input type="checkbox" id="gpPrintHandout" ${o.playerHandout ? "checked" : ""}> 👦 <strong>Player handout</strong> (key players · complements · hit chart · notes)</label>
              <label><input type="checkbox" id="gpPrintJvOnly" ${o.jvOnly ? "checked" : ""}> 🟡 <strong>JV only</strong> (only plays marked JV)</label>
              <label><input type="checkbox" id="gpPrintImgAppendix" ${o.imageAppendix ? "checked" : ""}> 🖼️ <strong>Image appendix</strong> (extra pages with attached play diagrams)</label>
            </div>
          </div>
        </div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="gpPrintCancel">Cancel</button>
          <button class="btn btn-secondary custom-modal-btn" id="gpPrintSmart" type="button" title="Reset to smart defaults: portrait, 2 columns, no bucket overflow">✨ Smart defaults</button>
          <button class="btn btn-primary custom-modal-btn" id="gpPrintConfirm">Print</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const close = (ok) => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(ok);
    };
    overlay.querySelector("#gpPrintCancel").addEventListener("click", () => close(false));
    overlay.querySelector("#gpPrintSmart").addEventListener("click", () => {
      _gpApplySmartPrintDefaults();
      close(false);
      // Re-open the modal so the user sees the new values applied.
      setTimeout(() => openGamePlanPrintModal(), 50);
    });
    // Show/hide tier row based on primary selection
    const tierRow = overlay.querySelector("#gpPrintSortTierRow");
    const primarySel = overlay.querySelector("#gpPrintSort");
    const syncTierVis = () => {
      const v = primarySel.value;
      tierRow.style.display = (v === "perBox" || v === "manual") ? "none" : "";
    };
    syncTierVis();
    primarySel.addEventListener("change", syncTierVis);
    overlay.querySelector("#gpPrintConfirm").addEventListener("click", () => {
      _gpPrintOptions = {
        paperSize: overlay.querySelector("#gpPrintPaper").value,
        orientation: overlay.querySelector("#gpPrintOrientation").value,
        columns: parseInt(overlay.querySelector("#gpPrintColumns").value, 10) || 3,
        sortMode: overlay.querySelector("#gpPrintSort").value || "perBox",
        sortMode2: overlay.querySelector("#gpPrintSort2").value || "",
        sortMode3: overlay.querySelector("#gpPrintSort3").value || "",
        showMeta: overlay.querySelector("#gpPrintMeta").checked,
        showHash: overlay.querySelector("#gpPrintHash").checked,
        showProgress: overlay.querySelector("#gpPrintProgress").checked,
        showNotes: overlay.querySelector("#gpPrintNotes").checked,
        showHolding: overlay.querySelector("#gpPrintHolding").checked,
        showEmpty: overlay.querySelector("#gpPrintEmpty").checked,
        showWristbandNumber: overlay.querySelector("#gpPrintWBNum").checked,
        bucketPerPage: overlay.querySelector("#gpPrintBucketPerPage").checked,
        showPageNumbers: overlay.querySelector("#gpPrintPageNumbers").checked,
        showFooter: overlay.querySelector("#gpPrintFooter").checked,
        showDetail: overlay.querySelector("#gpPrintDetail").checked,
        playerHandout: overlay.querySelector("#gpPrintHandout").checked,
        jvOnly: overlay.querySelector("#gpPrintJvOnly").checked,
        imageAppendix: overlay.querySelector("#gpPrintImgAppendix").checked,
      };
      close(true);
      _gpRenderPrintViewAndPrint();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
    });
  });
}

function _gpRenderPrintViewAndPrint() {
  const board = _gpEnsureBoard();
  const o = _gpPrintOptions;
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opponent = gw && gw.opponentName ? gw.opponentName : "";
  const weekLabel = gw && gw.weekLabel ? gw.weekLabel : "";

  let allBoxes = [...GP_DEFAULT_BOXES, ...(board.customBoxes || [])];
  if (o.showHolding) allBoxes = [GP_HOLDING_BOX, ...allBoxes];
  const _isJvPlay = (p) => (typeof _gpHasFlag === "function" && _gpHasFlag(p, "jv"));
  const _boxListFor = (id) => {
    const list = board.assignments[id] || [];
    return o.jvOnly ? list.filter(_isJvPlay) : list;
  };
  if (!o.showEmpty || o.jvOnly) {
    allBoxes = allBoxes.filter((b) => _boxListFor(b.id).length > 0);
  }

  const boxesHtml = allBoxes.map((b) => _gpRenderPrintBox(b, board)).join("");
  let totalAssigned = _gpAllAssignedSigs(board).size;
  if (o.jvOnly) {
    const jvSigs = new Set();
    Object.values(board.assignments || {}).forEach((arr) => {
      (arr || []).forEach((p) => { if (_isJvPlay(p)) jvSigs.add(_gpPlaySignature(p)); });
    });
    totalAssigned = jvSigs.size;
  }
  const headerHtml = `
    <div class="gp-print-header">
      <div class="gp-print-title">
        <span class="gp-print-team">${typeof getTeamName === "function" ? escapeHtml(getTeamName() || "Game Plan") : "Game Plan"}</span>
        ${opponent ? `<span class="gp-print-opp">vs ${escapeHtml(opponent)}</span>` : ""}
      </div>
      <div class="gp-print-meta">
        ${weekLabel ? `<span>${escapeHtml(weekLabel)}</span>` : ""}
        <span>${totalAssigned} plays drafted</span>
        ${board.loadedWristband && o.showWristbandNumber ? `<span>📋 ${escapeHtml(board.loadedWristband.name || "")}</span>` : ""}
        <span>${new Date().toLocaleDateString()}</span>
      </div>
    </div>`;

  // Build the print container; written into a hidden host that print CSS unhides
  let host = document.getElementById("gpPrintRoot");
  if (!host) {
    host = document.createElement("div");
    host.id = "gpPrintRoot";
    document.body.appendChild(host);
  }
  const rootClasses = [
    "gp-print-root",
    `gp-print-${o.paperSize}`,
    `gp-print-${o.orientation}`,
    o.bucketPerPage ? "gp-print-bucket-per-page" : "",
    o.showFooter ? "gp-print-with-footer" : "",
    o.playerHandout ? "gp-print-handout" : "",
  ].filter(Boolean).join(" ");
  host.className = rootClasses;
  host.style.setProperty("--gp-print-cols", String(o.columns));
  const footerHtml = o.showFooter ? `
    <div class="gp-print-footer">
      <span>${typeof getTeamName === "function" ? escapeHtml(getTeamName() || "") : ""}</span>
      <span>${opponent ? `vs ${escapeHtml(opponent)}` : ""}</span>
      <span>${new Date().toLocaleDateString()}</span>
    </div>` : "";
  const appendixHtml = o.imageAppendix ? _gpRenderPrintImageAppendix(allBoxes, board) : "";
  host.innerHTML = headerHtml + `<div class="gp-print-grid">${boxesHtml}</div>` + appendixHtml + footerHtml;
  document.body.classList.add("gp-printing");
  // Set @page size hint via style tag (one-shot)
  let pageStyle = document.getElementById("gpPrintPageStyle");
  if (!pageStyle) {
    pageStyle = document.createElement("style");
    pageStyle.id = "gpPrintPageStyle";
    document.head.appendChild(pageStyle);
  }
  const pageNumRule = o.showPageNumbers
    ? `@page { @bottom-right { content: counter(page) " / " counter(pages); font-family: ${"'Inter', sans-serif"}; font-size: 8pt; color: #555; } }`
    : "";
  pageStyle.textContent = `@page { size: ${o.paperSize} ${o.orientation}; margin: 0.45in 0.4in 0.5in; } ${pageNumRule}`;
  // Print, then clean up
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove("gp-printing");
    }, 500);
  }, 100);
}

function _gpRenderPrintBox(box, board) {
  const o = _gpPrintOptions;
  let rawList = (board.assignments[box.id] || []).slice();
  if (o.jvOnly) {
    rawList = rawList.filter((p) => typeof _gpHasFlag === "function" && _gpHasFlag(p, "jv"));
  }
  let effectiveSort;
  if (o.sortMode === "perBox") {
    effectiveSort = (board.sort && board.sort[box.id]) || "manual";
  } else {
    effectiveSort = [o.sortMode, o.sortMode2, o.sortMode3].filter(Boolean);
  }
  const list = _gpSortedBoxList(rawList, effectiveSort);
  const target = Number(board.targets && board.targets[box.id]) || 0;
  const note = (board.notes && board.notes[box.id]) || "";
  const accent = GP_BOX_ACCENTS[box.id] || "";
  const accentStyle = accent ? `style="--gp-box-accent:${accent}"` : "";
  const targetLabel = o.showProgress && target > 0 ? `<span class="gp-print-target">${list.length}/${target}</span>` : `<span class="gp-print-target">${list.length}</span>`;
  const noteHtml = o.showNotes && note ? `<div class="gp-print-note">${escapeHtml(note)}</div>` : "";
  const hashHtml = o.showHash ? _gpRenderBoxHashBar(list) : "";
  const detailHtml = o.showDetail && list.length > 0 ? _gpRenderPrintBoxDetail(box, list) : "";
  const playsHtml = list.length === 0
    ? `<div class="gp-print-empty">— empty —</div>`
    : list.map((p) => _gpRenderPrintPlay(p)).join("");
  return `
    <div class="gp-print-box" ${accentStyle}>
      <div class="gp-print-box-head">
        <span class="gp-print-box-label">${escapeHtml(box.label)}</span>
        ${targetLabel}
      </div>
      ${hashHtml}
      ${noteHtml}
      ${detailHtml}
      <ol class="gp-print-plays">${playsHtml}</ol>
    </div>`;
}

function _gpRenderPrintBoxDetail(box, list) {
  const stats = _gpComputeBoxStats(list);
  const desc = GP_BOX_DESCRIPTIONS[box.id];
  const fmtRow = (label, entries, limit) => {
    const onlyReal = entries.filter(([k]) => k && k !== "—");
    if (onlyReal.length === 0) return "";
    const top = onlyReal.slice(0, limit || 5).map(([k, n]) => `${escapeHtml(k)}\u00a0${n}`).join(" · ");
    return `<div class="gp-print-detail-row"><span class="gp-print-detail-label">${escapeHtml(label)}</span><span class="gp-print-detail-val">${top}</span></div>`;
  };
  const intentHtml = desc ? `<div class="gp-print-detail-intent">${escapeHtml(desc.intent)}</div>` : "";
  return `
    <div class="gp-print-detail">
      ${intentHtml}
      ${fmtRow("Touches", stats.touches, 6)}
      ${fmtRow("Type", stats.type, 6)}
      ${fmtRow("Formation", stats.formation, 5)}
      ${fmtRow("Personnel", stats.personnel, 5)}
      ${fmtRow("D&D", stats.downDistance, 6)}
      ${fmtRow("Situation", stats.situation, 4)}
      ${fmtRow("Field", stats.fieldPos, 4)}
    </div>`;
}

function _gpRenderPrintPlay(play) {
  const o = _gpPrintOptions;
  const callHtml = typeof getFullCall === "function"
    ? getFullCall(play, { showLineCall: false, showEmoji: o.showMeta, useSquares: true })
    : escapeHtml(play.play || "");
  let wbNumHtml = "";
  if (o.showWristbandNumber) {
    const num = _gpWristbandNumberFor(play);
    if (num != null) {
      wbNumHtml = `<span class="gp-print-wb-num">${escapeHtml(String(num))}</span>`;
    }
  }
  const meta = [];
  if (o.showMeta) {
    if (play.formation) meta.push(escapeHtml(play.formation));
    if (play.personnel) meta.push(escapeHtml(play.personnel));
    if (play.preferredHash) {
      const norm = (typeof _gpNormalizeHash === "function" ? _gpNormalizeHash(play.preferredHash) : play.preferredHash) || "";
      const letter = norm === "Left" ? "L" : norm === "Right" ? "R" : norm === "Middle" ? "M" : String(play.preferredHash).trim().charAt(0).toUpperCase();
      const cls = letter === "L" ? "gp-hash-chip-l" : letter === "R" ? "gp-hash-chip-r" : letter === "M" ? "gp-hash-chip-m" : "";
      meta.push(`<span class="gp-print-hash-chip ${cls}">${escapeHtml(letter)}</span>`);
    }
  }
  const metaHtml = meta.length > 0 ? `<span class="gp-print-play-meta">${meta.join(" · ")}</span>` : "";

  // Player-handout extras: full coaching detail per play so a kid can read
  // their assignment, the partner/complement, hit chart targets, and notes.
  let handoutHtml = "";
  if (o.playerHandout) {
    const rows = [];
    // Key players with names + positions (1-3)
    const kpParts = [];
    for (let i = 1; i <= 3; i++) {
      const pos = play[`keyPlayer${i}`];
      const nm = play[`keyPlayerName${i}`];
      if (pos || nm) {
        kpParts.push(`${pos ? `<strong>${escapeHtml(pos)}</strong>` : ""}${pos && nm ? " " : ""}${nm ? escapeHtml(nm) : ""}`);
      }
    }
    if (kpParts.length) rows.push(`<div class="gp-handout-row"><span class="gp-handout-label">Key</span><span class="gp-handout-val">${kpParts.join(" · ")}</span></div>`);

    // Complements (constraint plays)
    const complements = [play.constraint1, play.constraint2, play.constraint3].filter(Boolean);
    if (complements.length) {
      rows.push(`<div class="gp-handout-row"><span class="gp-handout-label">If they…</span><span class="gp-handout-val">${complements.map(escapeHtml).join(" · ")}</span></div>`);
    }

    // Hit chart targets
    const hits = [play.hitChart1, play.hitChart2, play.hitChart3].filter(Boolean);
    if (hits.length) {
      rows.push(`<div class="gp-handout-row"><span class="gp-handout-label">Hit</span><span class="gp-handout-val">${hits.map(escapeHtml).join(" · ")}</span></div>`);
    }

    // Tags / one-word
    const tags = [play.oneWord, play.playTag1, play.playTag2, play.basePlay].filter(Boolean);
    if (tags.length) {
      rows.push(`<div class="gp-handout-row"><span class="gp-handout-label">Tags</span><span class="gp-handout-val">${tags.map(escapeHtml).join(" · ")}</span></div>`);
    }

    // Avoid (deadVs)
    if (play.deadVs) {
      rows.push(`<div class="gp-handout-row gp-handout-warn"><span class="gp-handout-label">Dead vs</span><span class="gp-handout-val">${escapeHtml(play.deadVs)}</span></div>`);
    }

    // Notes
    if (play.notes) {
      rows.push(`<div class="gp-handout-row"><span class="gp-handout-label">Notes</span><span class="gp-handout-val">${escapeHtml(play.notes)}</span></div>`);
    }

    if (rows.length) handoutHtml = `<div class="gp-handout-detail">${rows.join("")}</div>`;
  }

  return `<li class="gp-print-play">${wbNumHtml}${callHtml}${metaHtml}${handoutHtml}</li>`;
}

/* Image appendix: extra pages grouped by box, showing each play's attached
   image (when one exists). Renders nothing if no plays in the included
   boxes have images. */
function _gpRenderPrintImageAppendix(allBoxes, board) {
  if (typeof window.playImages === "undefined" || typeof playSignature !== "function") return "";
  const o = _gpPrintOptions;
  const _isJvPlay = (p) => (typeof _gpHasFlag === "function" && _gpHasFlag(p, "jv"));
  const sections = [];
  let totalImages = 0;
  for (const box of allBoxes) {
    let list = (board.assignments[box.id] || []).slice();
    if (o.jvOnly) list = list.filter(_isJvPlay);
    const items = [];
    for (const play of list) {
      const sig = playSignature(play);
      const url = window.playImages.urlFor(sig);
      if (!url) continue;
      const callHtml = (typeof getFullCall === "function")
        ? getFullCall(play, { showLineCall: false })
        : escapeHtml(play.play || "");
      items.push(`<figure class="gp-print-img-card">
          <img src="${url}" alt="Play diagram" />
          <figcaption>${callHtml}</figcaption>
        </figure>`);
      totalImages++;
    }
    if (items.length) {
      sections.push(`<section class="gp-print-img-section">
        <h3 class="gp-print-img-title">${escapeHtml(box.label || box.id)}</h3>
        <div class="gp-print-img-grid">${items.join("")}</div>
      </section>`);
    }
  }
  if (!totalImages) return "";
  return `<div class="gp-print-appendix">
    <h2 class="gp-print-appendix-title">🖼️ Play Diagrams</h2>
    ${sections.join("")}
  </div>`;
}
