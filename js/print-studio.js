/* =========================================================================
   Print and Export Studio
   Unified production hub for existing print/export surfaces.
   ========================================================================= */

const PRINT_STUDIO_DEFAULTS = {
  density: "staff",
  columns: "auto",
};

function getPrintStudioStorageKey() {
  return STORAGE_KEYS.PRINT_STUDIO_SETTINGS;
}

function getPrintStudioSettings() {
  const stored = storageManager.get(getPrintStudioStorageKey(), {});
  return {
    ...PRINT_STUDIO_DEFAULTS,
    ...(stored && typeof stored === "object" ? stored : {}),
  };
}

function setPrintStudioSettings(nextSettings = {}) {
  const merged = {
    ...getPrintStudioSettings(),
    ...(nextSettings || {}),
  };
  storageManager.set(getPrintStudioStorageKey(), merged);
  return merged;
}

function _psCleanToken(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function _psToday() {
  return new Date().toISOString().slice(0, 10);
}

function _psGameWeekParts() {
  const gw = typeof getGameWeek === "function" ? getGameWeek() : {};
  return {
    team: typeof getTeamName === "function" ? getTeamName() : "BCOffense",
    opponent: gw?.opponentName || "",
    week: gw?.weekLabel || "",
  };
}

function buildPrintStudioFilename(kind = "Material", customName = "", extension = "") {
  const parts = _psGameWeekParts();
  const seen = new Set();
  const tokens = [
    parts.team || "BCOffense",
    parts.opponent ? `vs-${parts.opponent}` : "",
    parts.week,
    customName,
    kind,
    _psToday(),
  ]
    .map(_psCleanToken)
    .filter(Boolean)
    .filter((token) => {
      const key = token.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const base = tokens.join("_") || "BCOffense";
  const ext = _psCleanToken(extension).replace(/^\./, "");
  return ext ? `${base}.${ext}` : base;
}

function getPrintStudioExportName(kind, customName, extension) {
  return buildPrintStudioFilename(kind, customName, extension);
}

function _psWarningsStatus(warnings) {
  if (warnings.some((warning) => warning.level === "error")) return "error";
  if (warnings.length) return "warn";
  return "ready";
}

function _psStatusLabel(status) {
  if (status === "error") return "Needs work";
  if (status === "warn") return "Check";
  return "Ready";
}

function _psMetric(label, value) {
  return { label, value: String(value ?? "-") };
}

function _psScriptStats() {
  const items = Array.isArray(script) ? script : [];
  const periods = items.filter((item) => item?.isSeparator);
  const plays = items.filter((item) => item && !item.isSeparator);
  const notes = items.filter((item) => String(item?.notes || "").trim()).length;
  const displayOpts =
    typeof getScriptDisplayOptions === "function" ? getScriptDisplayOptions() : {};
  const personnelRows =
    !displayOpts.hidePersonnel && typeof getScriptVisiblePlayerLineup === "function"
      ? plays.filter((play) => getScriptVisiblePlayerLineup(play, displayOpts).length > 0).length
      : 0;
  const estimatedRows = plays.length + periods.length + notes + personnelRows;
  const warnings = [];

  if (!plays.length) {
    warnings.push({ level: "error", text: "No script plays are ready to print." });
  }
  if (!periods.length) {
    warnings.push({ level: "warn", text: "Add periods so the printed script has practice structure." });
  }
  if (estimatedRows > 58) {
    warnings.push({ level: "warn", text: "This script may run long on letter paper. Use compact density or split by period." });
  }

  return {
    metrics: [
      _psMetric("Plays", plays.length),
      _psMetric("Periods", periods.length),
      _psMetric("Rows", estimatedRows),
    ],
    warnings,
    filename: buildPrintStudioFilename(
      "Practice-Script",
      document.getElementById("scriptName")?.value || "",
      "pdf",
    ),
    disabled: plays.length === 0,
  };
}

function _psCallSheetStats() {
  const categories = typeof CALLSHEET_CATEGORIES !== "undefined" ? CALLSHEET_CATEGORIES : [];
  let playCount = 0;
  let filledCategories = 0;
  let maxBucket = 0;

  categories.forEach((cat) => {
    const bucket = callSheet?.[cat.id];
    const count =
      (Array.isArray(bucket?.left) ? bucket.left.length : 0) +
      (Array.isArray(bucket?.right) ? bucket.right.length : 0);
    if (count > 0) {
      filledCategories += 1;
      playCount += count;
      maxBucket = Math.max(maxBucket, count);
    }
  });

  const opts =
    typeof getCallSheetPrintOptions === "function" ? getCallSheetPrintOptions() : { columns: 3 };
  const warnings = [];
  if (!playCount) {
    warnings.push({ level: "error", text: "Call sheet is empty." });
  }
  if (maxBucket > 18) {
    warnings.push({ level: "warn", text: "One or more buckets may overflow. Reduce plays or use more columns." });
  }
  if (filledCategories > (opts.columns || 3) * 8) {
    warnings.push({ level: "warn", text: "Many filled buckets are competing for space on the printed page." });
  }

  return {
    metrics: [
      _psMetric("Calls", playCount),
      _psMetric("Buckets", filledCategories),
      _psMetric("Columns", opts.columns || 3),
    ],
    warnings,
    filename: buildPrintStudioFilename("Call-Sheet", "", "pdf"),
    disabled: playCount === 0,
  };
}

function _psWristbandStats() {
  const cards = Array.isArray(wristbandCards) ? wristbandCards : [];
  const cellsPerCard =
    typeof getActiveWristbandCellCount === "function"
      ? getActiveWristbandCellCount()
      : CELLS_PER_CARD;
  const filled = cards.reduce((sum, card) => {
    const cells = Array.isArray(card?.data)
      ? card.data
      : Array.isArray(card)
        ? card
        : [];
    return sum + cells.slice(0, cellsPerCard).filter(Boolean).length;
  }, 0);
  const capacity = cards.length * cellsPerCard;
  const warnings = [];

  if (!filled) {
    warnings.push({ level: "error", text: "No wristband plays are filled." });
  }
  if (capacity > 0 && capacity - filled > 20) {
    warnings.push({ level: "warn", text: "Several wristband cells are empty." });
  }

  return {
    metrics: [
      _psMetric("Cards", cards.length),
      _psMetric("Filled", filled),
      _psMetric("Open", Math.max(capacity - filled, 0)),
      _psMetric(
        "Print Size",
        typeof WRISTBAND_PRINT_SIZE_LABEL !== "undefined"
          ? WRISTBAND_PRINT_SIZE_LABEL
          : "4.5 x 2.6 in",
      ),
    ],
    warnings,
    filename: buildPrintStudioFilename("Wristband", "", "pdf"),
    disabled: filled === 0,
  };
}

function _psGamePlanStats() {
  let board = null;
  try {
    board = typeof _gpEnsureBoard === "function" ? _gpEnsureBoard() : null;
  } catch (_err) {
    board = null;
  }

  const assignments = board?.assignments || {};
  const boxes = Object.values(assignments).filter((list) => Array.isArray(list) && list.length > 0);
  const playCount = boxes.reduce((sum, list) => sum + list.length, 0);
  const opts = typeof _gpPrintOptions !== "undefined" ? _gpPrintOptions : { columns: 2 };
  const warnings = [];

  if (!playCount) {
    warnings.push({ level: "error", text: "Game plan has no assigned plays." });
  }
  if (playCount > (opts.columns || 2) * 28) {
    warnings.push({ level: "warn", text: "Game plan is dense. Use more columns or hide notes for staff handouts." });
  }

  return {
    metrics: [
      _psMetric("Plays", playCount),
      _psMetric("Boxes", boxes.length),
      _psMetric("Columns", opts.columns || 2),
    ],
    warnings,
    filename: buildPrintStudioFilename("Game-Plan", "", "pdf"),
    disabled: playCount === 0,
  };
}

function _psScoutingStats() {
  const opponent = typeof getActiveOpponent === "function" ? getActiveOpponent() : null;
  const playCount = Array.isArray(opponent?.plays) ? opponent.plays.length : 0;
  const warnings = [];

  if (!opponent) {
    warnings.push({ level: "error", text: "No active opponent is selected on the Dashboard." });
  } else if (!playCount) {
    warnings.push({ level: "error", text: "Active opponent has no charted plays." });
  }
  if (playCount > 140) {
    warnings.push({ level: "warn", text: "Scouting report is large. Filter before printing if you need a tighter handout." });
  }

  return {
    metrics: [
      _psMetric("Opponent", opponent?.name || "-"),
      _psMetric("Charted", playCount),
      _psMetric("Week", getGameWeek()?.weekLabel || "-"),
    ],
    warnings,
    filename: buildPrintStudioFilename("Scouting-Report", opponent?.name || "", "pdf"),
    disabled: !opponent || playCount === 0,
  };
}

function _psArtifacts() {
  return [
    {
      id: "script",
      title: "Practice Script",
      kind: "Script",
      stats: _psScriptStats(),
      actions: [
        ["script-print", "Print", true],
        ["script-packet", "Packet", false],
        ["script-text", "Text", true],
        ["script-csv", "CSV", true],
        ["go-script", "Open", false],
      ],
    },
    {
      id: "callsheet",
      title: "Call Sheet",
      kind: "Game Day",
      stats: _psCallSheetStats(),
      actions: [
        ["callsheet-print", "Print", true],
        ["callsheet-csv", "CSV", true],
        ["go-callsheet", "Open", false],
      ],
    },
    {
      id: "wristband",
      title: "Wristband",
      kind: "Players",
      stats: _psWristbandStats(),
      actions: [
        ["wristband-print", "Print", true],
        ["wristband-csv", "CSV", true],
        ["go-wristband", "Open", false],
      ],
    },
    {
      id: "gameplan",
      title: "Game Plan",
      kind: "Staff",
      stats: _psGamePlanStats(),
      actions: [
        ["gameplan-print", "Board Print", true],
        ["dashboard-gameplan-print", "Full Packet", false],
        ["go-gameplan", "Open", false],
      ],
    },
    {
      id: "scouting",
      title: "Scouting Report",
      kind: "Defense",
      stats: _psScoutingStats(),
      actions: [
        ["scouting-print", "Print", true],
        ["go-tendencies", "Open", false],
      ],
    },
  ];
}

function _psRenderMetrics(metrics) {
  return metrics
    .map(
      (metric) => `
        <span class="print-studio-metric">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
        </span>`,
    )
    .join("");
}

function _psRenderWarnings(warnings) {
  if (!warnings.length) {
    return '<div class="print-studio-check print-studio-check--ready">No print-safe issues found.</div>';
  }
  return warnings
    .map(
      (warning) => `
        <div class="print-studio-check print-studio-check--${escapeHtml(warning.level)}">
          ${escapeHtml(warning.text)}
        </div>`,
    )
    .join("");
}

function _psRenderActions(artifact) {
  const actionButtons = artifact.actions
    .map(([action, label, needsContent]) => {
      const disabled = needsContent && artifact.stats.disabled ? "disabled" : "";
      const primary = action.endsWith("-print") ? "btn-primary" : "";
      return `<button class="btn btn-sm ${primary}" data-action="runPrintStudioAction" data-arg="${escapeHtml(action)}" ${disabled}>${escapeHtml(label)}</button>`;
    })
    .join("");
  return `
    <div class="print-studio-actions">
      ${actionButtons}
      <button class="btn btn-sm" data-action="copyPrintStudioFilename" data-arg="${escapeHtml(artifact.id)}">Copy Name</button>
    </div>`;
}

function _psRenderCard(artifact, profile) {
  const status = _psWarningsStatus(artifact.stats.warnings);
  return `
    <section class="print-studio-card print-studio-card--${status}">
      <div class="print-studio-card-head">
        <div>
          <span class="print-studio-kind">${escapeHtml(artifact.kind)}</span>
          <h4>${escapeHtml(artifact.title)}</h4>
        </div>
        <span class="print-studio-status">${_psStatusLabel(status)}</span>
      </div>
      <div class="print-studio-preview-page" aria-label="${escapeHtml(artifact.title)} preview shell">
        <div class="print-studio-preview-brand">
          <strong>${escapeHtml(profile.team)}</strong>
          <span>${escapeHtml(profile.context)}</span>
        </div>
        <div class="print-studio-preview-title">${escapeHtml(artifact.title)}</div>
        <div class="print-studio-preview-lines" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="print-studio-filename">${escapeHtml(artifact.stats.filename)}</div>
      </div>
      <div class="print-studio-metrics">${_psRenderMetrics(artifact.stats.metrics)}</div>
      <div class="print-studio-checks">${_psRenderWarnings(artifact.stats.warnings)}</div>
      ${_psRenderActions(artifact)}
    </section>`;
}

function renderPrintStudio() {
  const body = document.getElementById("printStudioBody");
  if (!body) return;

  const settings = getPrintStudioSettings();
  const weekParts = _psGameWeekParts();
  const profile = {
    team: weekParts.team || "BCOffense",
    context: [weekParts.week, weekParts.opponent ? `vs ${weekParts.opponent}` : ""]
      .filter(Boolean)
      .join(" | ") || "Game week not set",
  };

  body.innerHTML = `
    <div class="print-studio-controls">
      <label>
        <span>Team branding</span>
        <input type="text" id="printStudioTeamName" value="${escapeHtml(profile.team)}" data-onchange="updatePrintStudioSetting" data-key="teamName" data-pass="value" aria-label="Team name for print branding">
      </label>
      <label>
        <span>Density</span>
        <select id="printStudioDensity" data-onchange="updatePrintStudioSetting" data-key="density" data-pass="value" aria-label="Print density preset">
          <option value="comfortable" ${settings.density === "comfortable" ? "selected" : ""}>Comfortable</option>
          <option value="staff" ${settings.density === "staff" ? "selected" : ""}>Staff standard</option>
          <option value="compact" ${settings.density === "compact" ? "selected" : ""}>Compact</option>
        </select>
      </label>
      <label>
        <span>Columns</span>
        <select id="printStudioColumns" data-onchange="updatePrintStudioSetting" data-key="columns" data-pass="value" aria-label="Print column preset">
          <option value="auto" ${settings.columns === "auto" ? "selected" : ""}>Smart</option>
          <option value="2" ${settings.columns === "2" ? "selected" : ""}>2 columns</option>
          <option value="3" ${settings.columns === "3" ? "selected" : ""}>3 columns</option>
          <option value="4" ${settings.columns === "4" ? "selected" : ""}>4 columns</option>
        </select>
      </label>
      <button class="btn btn-primary" data-action="applyPrintStudioPresets">Apply Presets</button>
    </div>
    <div class="print-studio-context">
      <span>${escapeHtml(profile.context)}</span>
      <span>Names use team, opponent, week, material, and date.</span>
    </div>
    <div class="print-studio-grid">
      ${_psArtifacts().map((artifact) => _psRenderCard(artifact, profile)).join("")}
    </div>`;
}

function openPrintStudio() {
  document.getElementById("printStudioOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "printStudioOverlay";
  overlay.className = "print-studio-overlay";
  overlay.dataset.action = "closePrintStudioOverlay";
  overlay.dataset.mobileLockAllow = "true";
  overlay.innerHTML = `
    <section class="print-studio" role="dialog" aria-modal="true" aria-labelledby="printStudioTitle">
      <div class="print-studio-head">
        <div>
          <span class="print-studio-eyebrow">Production</span>
          <h3 id="printStudioTitle">Print and Export Studio</h3>
          <p>Preview, check, name, print, and export staff/player materials from one place.</p>
        </div>
        <button class="print-studio-close" data-action="closePrintStudio" aria-label="Close print studio">x</button>
      </div>
      <div id="printStudioBody" class="print-studio-body"></div>
    </section>`;
  document.body.appendChild(overlay);
  renderPrintStudio();
  if (typeof trapFocus === "function") trapFocus(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

function closePrintStudio() {
  const overlay = document.getElementById("printStudioOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function updatePrintStudioSetting(key, value) {
  if (key === "teamName") {
    if (typeof setTeamName === "function") setTeamName(value || "");
    renderPrintStudio();
    return;
  }
  if (key === "density" || key === "columns") {
    setPrintStudioSettings({ [key]: value });
    renderPrintStudio();
  }
}

function _psColumnCount(kind, settings) {
  const explicit = parseInt(settings.columns, 10);
  if ([2, 3, 4].includes(explicit)) return explicit;
  if (kind === "callsheet") return settings.density === "compact" ? 4 : 2;
  if (kind === "gameplan") return settings.density === "compact" ? 4 : 2;
  return 2;
}

function applyPrintStudioPresets() {
  const settings = getPrintStudioSettings();
  const scriptPreset = settings.density === "compact" ? "compact" : "print-match";
  if (typeof applyScriptDisplayPreset === "function") {
    applyScriptDisplayPreset(scriptPreset);
  }
  if (typeof setCallSheetPrintOptions === "function") {
    setCallSheetPrintOptions({
      columns: _psColumnCount("callsheet", settings),
      margin: settings.density === "compact" ? "tight" : "normal",
      orientation: settings.density === "compact" ? "landscape" : "portrait",
      pages: "both",
      paperSize: "letter",
    });
  }
  if (typeof _gpPrintOptions !== "undefined") {
    _gpPrintOptions = {
      ..._gpPrintOptions,
      columns: _psColumnCount("gameplan", settings),
      showNotes: settings.density !== "compact",
      showDetail: settings.density === "comfortable",
      orientation: settings.density === "compact" ? "landscape" : "portrait",
    };
  }
  showToast("Print Studio presets applied.", { type: "success" });
  renderPrintStudio();
}

function _psCloseAndRun(fn) {
  closePrintStudio();
  setTimeout(fn, 80);
}

function _psSelectActiveTendenciesOpponent() {
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  if (!gw || gw.opponentIndex === null) return false;
  if (!Array.isArray(tendenciesOpponents) || !tendenciesOpponents[gw.opponentIndex]) {
    tendenciesOpponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
  }
  if (!tendenciesOpponents[gw.opponentIndex]) return false;
  tendenciesCurrentOpponent = gw.opponentIndex;
  tdFilters = {};
  tdSearchText = "";
  tdSortColumn = null;
  tdSortDirection = "asc";
  return true;
}

function runPrintStudioAction(action) {
  switch (action) {
    case "script-print":
      _psCloseAndRun(() => generatePDF());
      return;
    case "script-packet":
      closePrintStudio();
      showTab("script");
      setTimeout(() => openScriptPacketBuilder(), 100);
      return;
    case "script-text":
      exportScriptAsText();
      renderPrintStudio();
      return;
    case "script-csv":
      exportScriptCSV();
      renderPrintStudio();
      return;
    case "callsheet-print":
      _psCloseAndRun(() => printCallSheet());
      return;
    case "callsheet-csv":
      exportCallSheetCSV();
      return;
    case "wristband-print":
      _psCloseAndRun(() => printWristband());
      return;
    case "wristband-csv":
      exportWristbandCSV();
      return;
    case "gameplan-print":
      _psCloseAndRun(() => openGamePlanPrintModal());
      return;
    case "dashboard-gameplan-print":
      _psCloseAndRun(() => printFullGamePlan());
      return;
    case "scouting-print":
      if (!_psSelectActiveTendenciesOpponent()) {
        showToast("Select an active opponent before printing scouting.", { type: "warning" });
        return;
      }
      _psCloseAndRun(() => printTendencies());
      return;
    case "go-script":
      closePrintStudio();
      showTab("script");
      return;
    case "go-callsheet":
      closePrintStudio();
      showTab("callsheet");
      return;
    case "go-wristband":
      closePrintStudio();
      showTab("wristband");
      return;
    case "go-gameplan":
      closePrintStudio();
      showTab("gameplan");
      return;
    case "go-tendencies":
      closePrintStudio();
      showTab("tendencies");
      return;
  }
}

function copyPrintStudioFilename(artifactId) {
  const artifact = _psArtifacts().find((item) => item.id === artifactId);
  if (!artifact) return;
  const filename = artifact.stats.filename;
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    showToast(filename, { duration: 5000 });
    return;
  }
  navigator.clipboard
    .writeText(filename)
    .then(() => showToast("Filename copied.", { type: "success" }))
    .catch(() => showToast(filename, { duration: 5000 }));
}
