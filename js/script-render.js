let scriptRenderProfilingEnabled = false;
let scriptRenderProfileHistory = [];

const SCRIPT_RENDER_PROFILE_HISTORY_LIMIT = 12;
const SCRIPT_PERIOD_ACTION_SHORTCUTS = {
  selectPeriodPlays: { aria: "Alt+Shift+S", hint: "Alt+Shift+S" },
  openPeriodReorderModal: { aria: "Alt+Shift+M", hint: "Alt+Shift+M" },
  sortPeriod: { aria: "Alt+Shift+O", hint: "Alt+Shift+O" },
  reversePeriod: { aria: "Alt+Shift+R", hint: "Alt+Shift+R" },
  applyPreferredForPeriod: { aria: "Alt+Shift+P", hint: "Alt+Shift+P" },
};

function buildPeriodStatsMap(scriptItems) {
  const statsBySeparatorIndex = new Map();
  let activeSeparatorIndex = null;

  scriptItems.forEach((item, index) => {
    if (item.isSeparator) {
      activeSeparatorIndex = index;
      statsBySeparatorIndex.set(index, { playCount: 0, periodReps: 0, runCount: 0, passCount: 0 });
      return;
    }

    if (activeSeparatorIndex === null) return;

    const stats = statsBySeparatorIndex.get(activeSeparatorIndex);
    if (!stats) return;

    stats.playCount += 1;
    stats.periodReps += item.reps || 1;
    if (item.type === "Run") stats.runCount += 1;
    else if (item.type === "Pass") stats.passCount += 1;
  });

  return statsBySeparatorIndex;
}

function buildScriptRenderSummary(scriptItems) {
  const summary = {
    hasPlays: false,
    playCount: 0,
    totalReps: 0,
    runCount: 0,
    passCount: 0,
    totalTime: 0,
    periods: [],
  };

  scriptItems.forEach((item) => {
    if (item.isSeparator) {
      summary.periods.push(item);
      if (item.minutes) summary.totalTime += item.minutes;
      return;
    }

    summary.hasPlays = true;
    summary.playCount += 1;
    summary.totalReps += item.reps || 1;
    if (item.type === "Run") summary.runCount += 1;
    else if (item.type === "Pass") summary.passCount += 1;
  });

  return summary;
}

function getPeriodStats(separatorIndex, periodStatsMap) {
  if (periodStatsMap && periodStatsMap.has(separatorIndex)) {
    return periodStatsMap.get(separatorIndex);
  }

  const stats = { playCount: 0, periodReps: 0, runCount: 0, passCount: 0 };
  for (let index = separatorIndex + 1; index < script.length; index++) {
    const item = script[index];
    if (item.isSeparator) break;
    stats.playCount += 1;
    stats.periodReps += item.reps || 1;
    if (item.type === "Run") stats.runCount += 1;
    else if (item.type === "Pass") stats.passCount += 1;
  }

  return stats;
}

function formatPeriodMetaText(playCount, periodReps, minutes, runCount, passCount) {
  const timeDisplay = minutes ? `${minutes} min` : "";
  const runPass =
    runCount != null && passCount != null && (runCount || passCount)
      ? ` • ${runCount}R/${passCount}P`
      : "";
  return `${playCount} plays • ${periodReps} reps${timeDisplay ? ` • ${timeDisplay}` : ""}${runPass}`;
}

function getScriptPlayDom(index) {
  const row = document.querySelector(`.script-item[data-idx="${index}"]`);
  const previewRow = row?.nextElementSibling?.classList.contains("print-preview-row")
    ? row.nextElementSibling
    : null;
  return { row, previewRow };
}

function updatePeriodMetaDisplay(separatorIndex) {
  if (separatorIndex < 0 || !script[separatorIndex]?.isSeparator) return;

  const wrapper = document.querySelector(
    `.period-header-wrapper[data-separator-id="${script[separatorIndex].id}"]`,
  );
  const metaEl = wrapper?.querySelector(".ph-meta-span");
  if (!metaEl) return;

  const { playCount, periodReps, runCount, passCount } = getPeriodStats(separatorIndex);
  metaEl.textContent = formatPeriodMetaText(
    playCount,
    periodReps,
    script[separatorIndex].minutes,
    runCount,
    passCount,
  );
}

function updateScriptPreviewField(index, fieldClass, value) {
  const { previewRow } = getScriptPlayDom(index);
  const fieldEl = previewRow?.querySelector(`.preview-field.${fieldClass}`);
  if (fieldEl) fieldEl.textContent = value || "-";
}

function updateScriptPreviewReps(index, reps) {
  const { previewRow } = getScriptPlayDom(index);
  const repsEl = previewRow?.querySelector(".preview-field.reps");
  if (repsEl) repsEl.textContent = `×${reps}`;
}

function buildDefenseOptions(standardOptions, preferredValue, currentValue) {
  let options = `<option value="" ${!currentValue ? "selected" : ""}>-</option>`;

  if (preferredValue && preferredValue.trim()) {
    const pref = preferredValue.trim();
    const isSelected = currentValue === pref;
    options += `<option value="${pref}" ${isSelected ? "selected" : ""} class="preferred-option">★ ${pref}</option>`;
  }

  standardOptions.forEach((opt) => {
    if (preferredValue && preferredValue.trim() === opt) return;
    const isSelected = currentValue === opt;
    options += `<option value="${opt}" ${isSelected ? "selected" : ""}>${opt}</option>`;
  });

  if (
    currentValue &&
    currentValue !== preferredValue?.trim() &&
    !standardOptions.includes(currentValue)
  ) {
    options += `<option value="${currentValue}" selected>${currentValue}</option>`;
  }

  return options;
}

function updateScriptRowFieldValue(index, field, value) {
  const { row } = getScriptPlayDom(index);
  const inputEl = row?.querySelector(`[data-field="${field}"]`);
  if (!inputEl) return;

  if (inputEl.tagName === "SELECT") {
    inputEl.innerHTML = buildDefenseOptions(
      ["L", "M", "R"],
      script[index]?.preferredHash,
      value,
    );
  }

  inputEl.value = value || "";
}

function syncScriptPlayMetadataFields(index) {
  if (!script[index] || script[index].isSeparator) return;

  updateScriptRowFieldValue(index, "hash", script[index].hash || "");
  updateScriptRowFieldValue(index, "defFront", script[index].defFront || "");
  updateScriptRowFieldValue(index, "defCoverage", script[index].defCoverage || "");
  updateScriptRowFieldValue(index, "defStunt", script[index].defStunt || "");
  updateScriptRowFieldValue(index, "defBlitz", script[index].defBlitz || "");

  updateScriptPreviewField(index, "hash", script[index].hash || "");
  updateScriptPreviewField(index, "front", script[index].defFront || "");
  updateScriptPreviewField(index, "cov", script[index].defCoverage || "");
  updateScriptPreviewField(index, "stunt", script[index].defStunt || "");
  updateScriptPreviewField(index, "blitz", script[index].defBlitz || "");
}

function updatePeriodHeaderLabelDisplay(index) {
  if (!script[index]?.isSeparator) return;

  const periodLabel = script[index].label || "Period";
  const wrapper = document.querySelector(
    `.period-header-wrapper[data-separator-id="${script[index].id}"]`,
  );
  const header = wrapper?.querySelector(".script-item.period-header") ||
    document.querySelector(`.script-item.period-header .ph-label-input[data-idx="${index}"]`)?.closest(".script-item.period-header");

  if (wrapper) {
    wrapper.setAttribute("aria-label", `${periodLabel} period`);
  }
  if (!header) return;

  const colorInput = header.querySelector(".ph-color-input");
  if (colorInput) colorInput.setAttribute("aria-label", `Color for ${periodLabel}`);

  const labelInput = header.querySelector(".ph-label-input");
  if (labelInput) labelInput.setAttribute("aria-label", `Name for ${periodLabel}`);

  const minutesInput = header.querySelector(".ph-minutes-input");
  if (minutesInput) minutesInput.setAttribute("aria-label", `Minutes for ${periodLabel}`);

  const notesInput = header.querySelector(".ph-notes-input");
  if (notesInput) notesInput.setAttribute("aria-label", `Notes for ${periodLabel}`);

  const collapseBtn = header.querySelector(".ph-collapse-btn");
  if (collapseBtn) {
    const expanded = collapseBtn.getAttribute("aria-expanded") !== "false";
    collapseBtn.setAttribute(
      "aria-label",
      `${expanded ? "Collapse" : "Expand"} ${periodLabel}`,
    );
  }

  const buttons = [
    ["[data-action=\"movePeriod\"][data-dir=\"-1\"]", `Move ${periodLabel} up`],
    ["[data-action=\"movePeriod\"][data-dir=\"1\"]", `Move ${periodLabel} down`],
    ["[data-action=\"duplicatePeriod\"]", `Duplicate ${periodLabel}`],
    ["[data-action=\"savePeriodAsTemplate\"]", `Save ${periodLabel} as a template`],
    [
      "[data-action=\"togglePeriodProtection\"]",
      `${script[index].hideProtection ? "Show" : "Hide"} protection for ${periodLabel}`,
    ],
    ["[data-action=\"removeFromScript\"]", `Delete ${periodLabel}`],
  ];

  buttons.forEach(([selector, label]) => {
    const btn = header.querySelector(selector);
    if (btn) btn.setAttribute("aria-label", label);
  });
}

function renderScriptEmptyPeriodHeaders() {
  let periodHeaders = "";
  script.forEach((period, index) => {
    if (!period.isSeparator) return;
    const periodColor = period.color || UI_COLORS.periodDefault;
    const periodLabel = period.label || "Period";
    const periodNotes = period.notes || "";
    const protectionButtonLabel = period.hideProtection ? "Prot Off" : "Prot On";
    const protectionButtonTitle = period.hideProtection
      ? `Show protection for ${periodLabel}`
      : `Hide protection for ${periodLabel}`;
    periodHeaders += `
      <div class="script-item period-header" style="background: ${periodColor}; color: white;" role="group" aria-label="${escapeHtml(periodLabel)} period header">
        <div class="ph-top">
          <textarea class="ph-notes-input" data-field="periodNotes" data-idx="${index}" rows="2" placeholder="Period notes" aria-label="Notes for ${escapeHtml(periodLabel)}">${escapeHtml(periodNotes)}</textarea>
        </div>
        <div class="ph-main">
          <div class="ph-left">
            <input type="color" class="ph-color-input" value="${periodColor}" data-field="periodColor" data-idx="${index}" title="Period color" aria-label="Color for ${escapeHtml(periodLabel)}">
            <input type="text" class="ph-label-input" value="${escapeHtml(periodLabel)}" data-field="periodLabel" data-idx="${index}" placeholder="Period name" aria-label="Name for ${escapeHtml(periodLabel)}">
            <input type="number" class="ph-minutes-input" value="${period.minutes || ""}" data-field="periodMinutes" data-idx="${index}" placeholder="min" title="Time in minutes" aria-label="Minutes for ${escapeHtml(periodLabel)}">
          </div>
          <div class="ph-right">
            <button class="ph-btn ph-period-setting ${period.hideProtection ? "ph-btn-active" : ""}" data-action="togglePeriodProtection" data-idx="${index}" title="${escapeHtml(protectionButtonTitle)}" aria-label="${escapeHtml(protectionButtonTitle)}">${protectionButtonLabel}</button>
            <button class="remove btn-inline-offset" data-action="removeFromScript" data-idx="${index}" aria-label="Delete ${escapeHtml(periodLabel)}">✕</button>
          </div>
        </div>
      </div>
    `;
  });
  return periodHeaders;
}

function renderPeriodActionButton(action, index, label, icon, title, extraClass = "") {
  const shortcut = SCRIPT_PERIOD_ACTION_SHORTCUTS[action] || null;
  const titleText = shortcut ? `${title} (${shortcut.hint})` : title;
  const shortcutAttr = shortcut ? ` aria-keyshortcuts="${shortcut.aria}"` : "";

  return `<button class="pat-btn ${extraClass}" data-action="${action}" data-idx="${index}" title="${escapeHtml(titleText)}" aria-label="${escapeHtml(title)}"${shortcutAttr}><span class="pat-btn-icon" aria-hidden="true">${icon}</span><span class="pat-btn-label">${escapeHtml(label)}</span></button>`;
}

function renderPeriodActionsToolbar(index, periodLabel) {
  const actions = [
    ["selectPeriodPlays", "Select", "☑", `Select or deselect plays in ${periodLabel}`],
    ["openPeriodReorderModal", "Reorder", "🗂️", `Reorder plays in ${periodLabel}`],
    ["sortPeriod", "Sort", "⬍", `Sort plays in ${periodLabel}`],
    ["reversePeriod", "Reverse", "↕", `Reverse play order in ${periodLabel}`],
    ["openSmartScriptForPeriod", "Smart", "🧠", `Run Smart Script on ${periodLabel}`, "pat-btn-smart"],
    ["applyPreferredForPeriod", "Preferred", "★", `Apply preferred metadata to ${periodLabel}`],
    ["pushPeriodToCallSheet", "To Call Sheet", "📋", `Push ${periodLabel} to call sheet`, "pat-btn-callsheet"],
    ["importFromCallSheet", "From Call Sheet", "📥", `Import call sheet plays into ${periodLabel}`, "pat-btn-import-cs"],
    ["copyPeriodAsText", "Copy", "📄", `Copy ${periodLabel} as text`],
  ];

  return `
        <div class="period-actions-toolbar">
          ${actions.map(([action, label, icon, title, extraClass = ""]) => renderPeriodActionButton(action, index, label, icon, title, extraClass)).join("")}
        </div>`;
}

function renderScriptPeriodHeader(separator, index, renderContext) {
  const isCollapsed = collapsedPeriods.has(separator.id);
  const collapseIcon = isCollapsed ? "▶" : "▼";
  const { playCount, periodReps, runCount, passCount } = getPeriodStats(
    index,
    renderContext?.periodStatsBySeparatorIndex,
  );
  const periodColor = separator.color || UI_COLORS.periodDefault;
  const periodLabel = separator.label || "Period";
  const periodNotes = separator.notes || "";
  const metaText = formatPeriodMetaText(playCount, periodReps, separator.minutes, runCount, passCount);
  const protectionButtonLabel = separator.hideProtection ? "Prot Off" : "Prot On";
  const protectionButtonTitle = separator.hideProtection
    ? `Show protection for ${periodLabel}`
    : `Hide protection for ${periodLabel}`;

  return `
    <div class="period-header-wrapper" data-separator-id="${separator.id}" data-period-index="${index}" style="border-left: 4px solid ${periodColor};" role="region" aria-label="${escapeHtml(periodLabel)} period">
      <div class="script-item period-header" style="background: ${periodColor}; color: white;">
        <div class="ph-top">
          <textarea class="ph-notes-input" data-field="periodNotes" data-idx="${index}" rows="2" placeholder="Period notes" aria-label="Notes for ${escapeHtml(periodLabel)}">${escapeHtml(periodNotes)}</textarea>
        </div>
        <div class="ph-main">
          <div class="ph-left">
            <button class="ph-collapse-btn" data-action="togglePeriodCollapse" data-period-id="${separator.id}" title="${isCollapsed ? "Expand" : "Collapse"}" aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(periodLabel)}" aria-expanded="${isCollapsed ? "false" : "true"}">${collapseIcon}</button>
            <input type="color" class="ph-color-input" value="${periodColor}" data-field="periodColor" data-idx="${index}" title="Period color" aria-label="Color for ${escapeHtml(periodLabel)}">
            <input type="text" class="ph-label-input" value="${escapeHtml(periodLabel)}" data-field="periodLabel" data-idx="${index}" aria-label="Name for ${escapeHtml(periodLabel)}">
            <input type="number" class="ph-minutes-input" value="${separator.minutes || ""}" data-field="periodMinutes" data-idx="${index}" placeholder="min" title="Time in minutes" aria-label="Minutes for ${escapeHtml(periodLabel)}">
            <span class="ph-meta-span">${metaText}</span>
          </div>
          <div class="ph-right">
            <button class="ph-btn" data-action="movePeriod" data-idx="${index}" data-dir="-1" title="Move period up" aria-label="Move ${escapeHtml(periodLabel)} up">▲</button>
            <button class="ph-btn" data-action="movePeriod" data-idx="${index}" data-dir="1" title="Move period down" aria-label="Move ${escapeHtml(periodLabel)} down">▼</button>
            <button class="ph-btn" data-action="duplicatePeriod" data-idx="${index}" title="Duplicate period" aria-label="Duplicate ${escapeHtml(periodLabel)}">⧉</button>
            <button class="ph-btn" data-action="savePeriodAsTemplate" data-idx="${index}" title="Save as template" aria-label="Save ${escapeHtml(periodLabel)} as a template">💾</button>
            <button class="ph-btn ph-period-setting ${separator.hideProtection ? "ph-btn-active" : ""}" data-action="togglePeriodProtection" data-idx="${index}" title="${escapeHtml(protectionButtonTitle)}" aria-label="${escapeHtml(protectionButtonTitle)}">${protectionButtonLabel}</button>
            <button class="remove btn-inline-offset" data-action="removeFromScript" data-idx="${index}" aria-label="Delete ${escapeHtml(periodLabel)}">✕</button>
          </div>
        </div>
      </div>
      ${!isCollapsed && playCount > 0 ? renderPeriodActionsToolbar(index, periodLabel) : ""}
    </div>
  `;
}

function renderScriptDefenseInputs(play, index, playLabel, defenseDatalistState) {
  const frontListId = defenseDatalistState.preferredFrontIdsByValue.get((play.practiceFront || "").trim()) || "dl-front-shared";
  const coverageListId = defenseDatalistState.preferredCoverageIdsByValue.get((play.practiceCoverage || "").trim()) || "dl-cov-shared";
  const stuntListId = defenseDatalistState.preferredStuntIdsByValue.get((play.practiceStunt || "").trim()) || "dl-stunt-shared";
  const blitzListId = defenseDatalistState.preferredBlitzIdsByValue.get((play.practiceBlitz || "").trim()) || "dl-blitz-shared";

  return `
      <div class="defense-inputs">
        <input type="text" list="${frontListId}" value="${escapeHtml(play.defFront || "")}" placeholder="Front" data-field="defFront" data-idx="${index}" title="Defensive Front" class="def-input" aria-label="Defensive front for ${escapeHtml(playLabel)}">
        <input type="text" list="${coverageListId}" value="${escapeHtml(play.defCoverage || "")}" placeholder="Cov" data-field="defCoverage" data-idx="${index}" title="Coverage" class="def-input" aria-label="Coverage for ${escapeHtml(playLabel)}">
        <input type="text" list="${stuntListId}" value="${escapeHtml(play.defStunt || "")}" placeholder="Stunt" data-field="defStunt" data-idx="${index}" title="Stunt" class="def-input" aria-label="Stunt for ${escapeHtml(playLabel)}">
        <input type="text" list="${blitzListId}" value="${escapeHtml(play.defBlitz || "")}" placeholder="Blitz" data-field="defBlitz" data-idx="${index}" title="Blitz" class="def-input" aria-label="Blitz for ${escapeHtml(playLabel)}">
      </div>`;
}

function renderScriptPlayControls(play, index, playLabel, reps) {
  return `
      <div class="play-controls">
        <div class="play-control-fields">
          <input class="play-reps-input" type="number" value="${reps}" min="1" data-field="reps" data-idx="${index}" title="Reps" aria-label="Reps for ${escapeHtml(playLabel)}">
          <input class="play-notes-input" type="text" value="${escapeHtml(play.notes || "")}" placeholder="Notes" data-field="notes" data-idx="${index}" aria-label="Notes for ${escapeHtml(playLabel)}">
        </div>
        <div class="play-control-actions">
          <button class="dup-btn" data-action="duplicatePlay" data-idx="${index}" title="Duplicate" aria-label="Duplicate ${escapeHtml(playLabel)}">⧉</button>
          <button class="remove" data-action="removeFromScript" data-idx="${index}" aria-label="Remove ${escapeHtml(playLabel)}">✕</button>
        </div>
      </div>`;
}

function renderScriptPrintPreviewRow(play, playNumber, fullCall, playerSummary, reps) {
  return `
      <div class="print-preview-row">
        <span class="preview-label">Print:</span>
        <span class="preview-field"><b>#${playNumber}</b></span>
        <span class="preview-field hash">${escapeHtml(play.hash || "-")}</span>
        <span class="preview-field tempo">${escapeHtml(play.tempo || "-")}</span>
        <span class="preview-field call">${fullCall}</span>
        <span class="preview-field type">${escapeHtml(play.type)}</span>
        <span class="preview-field front">${escapeHtml(play.defFront || "-")}</span>
        <span class="preview-field cov">${escapeHtml(play.defCoverage || "-")}</span>
        <span class="preview-field stunt">${escapeHtml(play.defStunt || "-")}</span>
        <span class="preview-field blitz">${escapeHtml(play.defBlitz || "-")}</span>
        <span class="preview-field reps">×${reps}</span>
        <span class="preview-field players">${escapeHtml(playerSummary || "-")}</span>
      </div>`;
}

function renderScriptPlayRow(play, index, playNumber, renderContext) {
  const {
    opts,
    callOptions,
    showPrintPreview,
    getCachedFullCall,
    getCachedSummaryText,
    getCachedHashOptions,
    getCachedWristbandNumber,
    getCachedPlayerSummary,
    defenseDatalistState,
  } = renderContext;
  const fullCall = getCachedFullCall(play, Boolean(callOptions?.hideProtection));
  const isSelected = bulkSelectedIndices.includes(index);
  const hashOptions = getCachedHashOptions(play);
  const playLabel = getCachedSummaryText(play);
  const shouldRenderAssignmentGrid = !opts.hidePersonnel;
  const playerSummary = showPrintPreview ? getCachedPlayerSummary(play) : "";
  const playerPersonnelMarkup = shouldRenderAssignmentGrid
    ? buildScriptPlayerAssignmentGrid(play, index, playLabel, opts)
    : "";
  const reps = play.reps ?? 1;
  const itemClasses = [
    "script-item",
    isSelected ? "bulk-selected" : "",
    opts.layoutMode === "compact" ? "script-item--compact" : "script-item--detail",
    opts.printStyle ? "script-item--printlike" : "",
  ].filter(Boolean).join(" ");

  let wbBadge = "";
  if (scriptWristband && opts.showWbNum) {
    const wbNum = getCachedWristbandNumber(play);
    if (wbNum !== null) {
      wbBadge = `<span class="wb-badge">#${wbNum}</span>`;
    }
  }

  return `
    <div class="${itemClasses}" draggable="true" data-drag="scriptStart" data-idx="${index}" role="group" aria-label="Draggable play ${playNumber}: ${escapeHtml(playLabel)}">
      <div class="script-select-tools">
        <input type="checkbox" class="bulk-select-cb" data-index="${index}" ${isSelected ? "checked" : ""} data-field="bulkSelect" data-idx="${index}" title="Select for bulk edit" aria-label="Select play ${playNumber} for bulk edit">
        <button type="button" class="script-move-menu-btn" data-action="openScriptMoveMenu" data-idx="${index}" title="Move options" aria-label="Open move options for ${escapeHtml(playLabel)}">↕</button>
      </div>
      <div class="play-num" aria-hidden="true">${playNumber}${wbBadge}</div>
      <div class="play-call">
        <div class="full-call">${fullCall}</div>
        <div class="call-meta">${escapeHtml(play.type)} ${play.tempo ? "• " + escapeHtml(play.tempo) : ""}</div>
      </div>
      <div class="hash-input">
        <select data-field="hash" data-idx="${index}" title="Hash" aria-label="Hash for ${escapeHtml(playLabel)}">
          ${hashOptions}
        </select>
      </div>
      ${renderScriptDefenseInputs(play, index, playLabel, defenseDatalistState)}
      ${renderScriptPlayControls(play, index, playLabel, reps)}
      ${playerPersonnelMarkup}
    </div>
    ${showPrintPreview ? renderScriptPrintPreviewRow(play, playNumber, fullCall, playerSummary, reps) : ""}
  `;
}

function renderScriptRows(renderContext) {
  let playNumber = 0;
  let skipPlays = false;
  let currentSeparator = null;

  return script
    .map((play, index) => {
      if (play.isSeparator) {
        currentSeparator = play;
        skipPlays = collapsedPeriods.has(play.id);
        return renderScriptPeriodHeader(play, index, renderContext);
      }

      if (skipPlays) return "";

      playNumber += 1;
      return renderScriptPlayRow(play, index, playNumber, {
        ...renderContext,
        callOptions: getPeriodCallDisplayOptions(currentSeparator, renderContext.opts),
      });
    })
    .join("");
}

function renderScriptColumnHeaders() {
  return `
      <div class="script-column-headers">
        <div class="sch-spacer"></div>
        <div class="sch-num">#</div>
        <div class="sch-play">Play Call</div>
        <div class="sch-hash">Hash</div>
        <div class="sch-def">Front</div>
        <div class="sch-def">Cov</div>
        <div class="sch-def">Stunt</div>
        <div class="sch-def">Blitz</div>
        <div class="sch-controls">Controls</div>
      </div>
    `;
}

function renderScriptGuidedEmptyState() {
  return `
      <div class="script-empty-guide">
        <div class="seg-icon">📋</div>
        <div class="seg-text">Add plays from the left panel to start building this period</div>
        <div class="seg-hint">Click <strong>+ Add</strong> on any play, or check multiple and use <strong>Add Selected</strong></div>
      </div>
    `;
}

function createScriptRenderContext(opts, showPrintPreview) {
  const fullCallCache = new Map();
  const summaryTextCache = new Map();
  const playerSummaryCache = new Map();
  const hashOptionsCache = new Map();
  const wristbandNumberCache = new Map();
  const playerSummaryContext = {
    slotCache: new Map(),
    baseAssignmentCache: new Map(),
    playerLabelCache: new Map(),
  };
  const defenseDatalistState = buildScriptDefenseDatalistState(script);
  const periodStatsBySeparatorIndex = buildPeriodStatsMap(script);
  const renderSummary = buildScriptRenderSummary(script);

  return {
    opts,
    showPrintPreview,
    defenseDatalistState,
    periodStatsBySeparatorIndex,
    renderSummary,
    getCachedFullCall(play, hideProtection = false) {
      if (!play) return "";
      let variants = fullCallCache.get(play);
      if (!variants) {
        variants = new Map();
        fullCallCache.set(play, variants);
      }
      const variantKey = hideProtection ? "hideProtection" : "default";
      if (variants.has(variantKey)) return variants.get(variantKey);
      const rendered = getFullCall(
        getScriptDisplayPlay(play),
        hideProtection ? { ...opts, hideProtection: true } : opts,
      );
      variants.set(variantKey, rendered);
      return rendered;
    },
    getCachedSummaryText(play) {
      if (!play) return "play";
      if (summaryTextCache.has(play)) return summaryTextCache.get(play);
      const summary = getScriptPlaySummaryText(play);
      summaryTextCache.set(play, summary);
      return summary;
    },
    getCachedPlayerSummary(play) {
      if (!play) return "";
      if (playerSummaryCache.has(play)) return playerSummaryCache.get(play);
      const summary = buildScriptCompactPlayerSummary(
        play,
        opts,
        playerSummaryContext,
      );
      playerSummaryCache.set(play, summary);
      return summary;
    },
    getCachedHashOptions(play) {
      if (!play) return "";
      if (hashOptionsCache.has(play)) return hashOptionsCache.get(play);
      const hashOptions = buildDefenseOptions(
        ["L", "M", "R"],
        play.preferredHash,
        play.hash,
      );
      hashOptionsCache.set(play, hashOptions);
      return hashOptions;
    },
    getCachedWristbandNumber(play) {
      if (!play || !scriptWristband || !opts.showWbNum) return null;
      if (wristbandNumberCache.has(play)) return wristbandNumberCache.get(play);
      const wbNum = findPlayOnWristband(play);
      wristbandNumberCache.set(play, wbNum);
      return wbNum;
    },
  };
}

function renderScriptContent(container, renderContext) {
  const hasPlays = renderContext.renderSummary.hasPlays;

  if (script.length === 0) {
    container.innerHTML = "";
    container.classList.add("empty");
    return;
  }

  if (!hasPlays) {
    container.classList.remove("empty");
    container.innerHTML =
      renderScriptEmptyPeriodHeaders() +
      renderScriptGuidedEmptyState();
    return;
  }

  container.classList.remove("empty");
  container.innerHTML =
    renderContext.defenseDatalistState.html +
    renderScriptColumnHeaders() +
    renderScriptRows(renderContext);
}

function updateJumpToPeriodOptions(renderSummary) {
  const jumpSel = document.getElementById("jumpToPeriod");
  if (!jumpSel) return;

  const periods = renderSummary?.periods || script.filter((play) => play.isSeparator);
  if (periods.length > 1) {
    jumpSel.innerHTML =
      `<option value="">⬇ Jump</option>` +
      periods
        .map(
          (period) =>
            `<option value="${period.id}">${escapeHtml(period.label || "Period")}</option>`,
        )
        .join("");
    jumpSel.style.display = "";
  } else {
    jumpSel.style.display = "none";
  }
}

function jumpToPeriod(periodId) {
  if (!periodId) return;

  const periodHeader = document.querySelector(`[data-separator-id="${periodId}"]`);
  if (periodHeader) {
    periodHeader.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const jumpSelect = document.getElementById("jumpToPeriod");
  if (jumpSelect) {
    setTimeout(() => {
      jumpSelect.value = "";
    }, 300);
  }
}

function updateRunPassRatio() {
  const runEl = document.getElementById("statRun");
  const passEl = document.getElementById("statPass");
  const ratioEl = document.getElementById("statRatio");
  if (!ratioEl) return;

  const run = parseInt(runEl?.textContent, 10) || 0;
  const pass = parseInt(passEl?.textContent, 10) || 0;

  if (run === 0 && pass === 0) {
    ratioEl.textContent = "-";
    ratioEl.title = "";
  } else if (pass === 0) {
    ratioEl.textContent = "∞";
    ratioEl.title = `${run} Run, 0 Pass`;
  } else {
    const ratio = (run / pass).toFixed(1);
    ratioEl.textContent = ratio;
    ratioEl.title = `${run} Run, ${pass} Pass (R:P = ${ratio})`;
  }
}

function filterScriptItems() {
  const searchTerm =
    document.getElementById("scriptSearchBox")?.value.toLowerCase() || "";
  const items = document.querySelectorAll(
    "#scriptPlays .script-item:not(.period-header)",
  );

  items.forEach((item) => {
    let haystack = item._cachedSearchHaystack;
    if (haystack === undefined) {
      haystack = (item.textContent || "").toLowerCase();
      item._cachedSearchHaystack = haystack;
    }
    if (searchTerm === "" || haystack.includes(searchTerm)) {
      item.classList.remove("hidden");
      item.classList.remove("search-hidden");
    } else {
      item.classList.add("hidden");
      item.classList.add("search-hidden");
    }
  });

  const visible = document.querySelectorAll(
    "#scriptPlays .script-item:not(.period-header):not(.search-hidden)",
  ).length;
  const total = items.length;
  const countEl = document.getElementById("scriptSearchCount");
  if (!countEl) return;

  if (searchTerm) {
    countEl.textContent = `Search: ${visible}/${total}`;
    countEl.style.display = "inline";
  } else {
    countEl.textContent = "";
    countEl.style.display = "none";
  }
}

const debouncedFilterScriptItems =
  typeof debounce === "function" ? debounce(filterScriptItems, 80) : filterScriptItems;

function updateScriptStats(renderSummary) {
  const summary = renderSummary || buildScriptRenderSummary(script);
  const { playCount, totalReps, runCount, passCount, totalTime } = summary;

  const el = (id) => document.getElementById(id);
  if (el("scriptCount")) el("scriptCount").textContent = playCount;
  if (el("statPlays")) el("statPlays").textContent = playCount;
  if (el("statReps")) el("statReps").textContent = totalReps;
  if (el("statRun")) el("statRun").textContent = runCount;
  if (el("statPass")) el("statPass").textContent = passCount;
  if (el("statTime")) {
    if (totalTime >= 60) {
      const h = Math.floor(totalTime / 60);
      const m = totalTime % 60;
      el("statTime").textContent = `${h}:${String(m).padStart(2, "0")}h`;
    } else {
      el("statTime").textContent = totalTime;
    }
  }
  updateRunPassRatio();
  updateScriptHealthBadge();
}

function computeScriptHealthIssues() {
  const issues = [];
  if (!Array.isArray(script) || script.length === 0) return issues;

  let activeSeparatorIndex = -1;
  let activePlayCount = 0;
  let seenInPeriod = null;

  const flushPeriod = () => {
    if (activeSeparatorIndex < 0) return;
    if (activePlayCount === 0) {
      const sep = script[activeSeparatorIndex];
      issues.push({
        severity: "warn",
        type: "empty-period",
        index: activeSeparatorIndex,
        label: `Empty period: ${sep.label || "Period"}`,
      });
    }
  };

  for (let i = 0; i < script.length; i++) {
    const item = script[i];
    if (item.isSeparator) {
      flushPeriod();
      activeSeparatorIndex = i;
      activePlayCount = 0;
      seenInPeriod = new Map();
      if (!item.minutes) {
        issues.push({
          severity: "info",
          type: "no-minutes",
          index: i,
          label: `${item.label || "Period"}: no minutes set`,
        });
      }
      continue;
    }
    activePlayCount += 1;

    if (!item.play && !item.formation && !item.basePlay && !item.oneWord) {
      issues.push({
        severity: "error",
        type: "incomplete",
        index: i,
        label: `Row ${i + 1}: missing play call`,
      });
    }

    if (!item.personnel) {
      issues.push({
        severity: "info",
        type: "no-personnel",
        index: i,
        label: `Row ${i + 1}: no personnel set`,
      });
    }

    const dedupeKey = `${(item.formation || "").trim().toLowerCase()}|${(item.play || "").trim().toLowerCase()}|${(item.oneWord || "").trim().toLowerCase()}`;
    if ((item.play || item.oneWord) && seenInPeriod && seenInPeriod.has(dedupeKey)) {
      issues.push({
        severity: "warn",
        type: "duplicate",
        index: i,
        label: `Row ${i + 1}: duplicate of row ${seenInPeriod.get(dedupeKey) + 1} in this period`,
      });
    } else if (seenInPeriod) {
      seenInPeriod.set(dedupeKey, i);
    }
  }
  flushPeriod();

  return issues;
}

function updateScriptHealthBadge() {
  const btn = document.getElementById("statHealthBtn");
  const valueEl = document.getElementById("statHealth");
  if (!btn || !valueEl) return;
  const issues = computeScriptHealthIssues();
  const count = issues.length;
  if (count === 0) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  valueEl.textContent = String(count);
  const hasError = issues.some((i) => i.severity === "error");
  const hasWarn = issues.some((i) => i.severity === "warn");
  btn.classList.toggle("stat-health-error", hasError);
  btn.classList.toggle("stat-health-warn", !hasError && hasWarn);
  btn.title = `${count} script health issue${count === 1 ? "" : "s"} \u2014 click to review`;
}

async function showScriptHealthIssues() {
  const issues = computeScriptHealthIssues();
  if (issues.length === 0) {
    showToast("No script health issues \u2014 looks good", { type: "success" });
    return;
  }
  const items = issues.map((issue, i) => {
    const icon =
      issue.severity === "error" ? "\u26A0\uFE0F" :
      issue.severity === "warn" ? "\u26A1" : "\u2139\uFE0F";
    return { value: i, label: `${icon} ${issue.label}` };
  });
  const choice = await showListPicker(
    `${issues.length} script health issue${issues.length === 1 ? "" : "s"}`,
    items,
    { title: "Script Health", icon: "\uD83E\uDE7A" },
  );
  if (choice == null) return;
  const issue = issues[Number(choice)];
  if (!issue || issue.index == null) return;
  const target = document.querySelector(`.script-item[data-idx="${issue.index}"], .period-header-wrapper[data-period-index="${issue.index}"]`);
  if (target && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("script-health-flash");
    setTimeout(() => target.classList.remove("script-health-flash"), 2000);
  }
}

const SCRIPT_KEYBOARD_SHORTCUTS = [
  { keys: "1 \u2013 8", desc: "Switch tabs (Playbook, Script, Wristband, Tendencies, Call Sheet, Installation, Builder, Dashboard)" },
  { keys: "Ctrl/Cmd + Z", desc: "Undo last script change" },
  { keys: "Ctrl/Cmd + Y / Shift+Z", desc: "Redo" },
  { keys: "Ctrl/Cmd + A", desc: "Select all script rows (when focused on script)" },
  { keys: "Ctrl/Cmd + Shift + A", desc: "Clear selection" },
  { keys: "Alt + Shift + C", desc: "Collapse all periods" },
  { keys: "Alt + Shift + E", desc: "Expand all periods" },
  { keys: "Alt + Shift + P", desc: "Apply preferred fields to focused period" },
  { keys: "?", desc: "Open this shortcuts reference" },
  { keys: "Esc", desc: "Close any open overlay" },
];

function showScriptShortcutsModal() {
  if (document.getElementById("scriptShortcutsModal")) return;
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "scriptShortcutsModal";
  const rows = SCRIPT_KEYBOARD_SHORTCUTS
    .map((s) => `<tr><td><kbd>${escapeHtml(s.keys)}</kbd></td><td>${escapeHtml(s.desc)}</td></tr>`)
    .join("");
  setInnerHTML(
    overlay,
    `
    <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="scriptShortcutsTitle" style="max-width:560px;">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">\u2328\uFE0F</span>
        <h3 class="custom-modal-title" id="scriptShortcutsTitle">Script Keyboard Shortcuts</h3>
      </div>
      <div class="custom-modal-body">
        <table class="script-shortcuts-table">
          <thead><tr><th>Key</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-primary custom-modal-btn" id="scriptShortcutsCloseBtn">Close</button>
      </div>
    </div>
  `,
  );
  document.body.appendChild(overlay);
  trapFocus(overlay);
  const close = () => {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 180);
  };
  overlay.querySelector("#scriptShortcutsCloseBtn")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); }
  });
  overlay.querySelector("#scriptShortcutsCloseBtn")?.focus();
}

function recordScriptRenderProfileSample(sample) {
  scriptRenderProfileHistory.push(sample);
  if (scriptRenderProfileHistory.length > SCRIPT_RENDER_PROFILE_HISTORY_LIMIT) {
    scriptRenderProfileHistory.shift();
  }
}

function summarizeScriptRenderProfileSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const keys = [
    "totalMs",
    "contextMs",
    "contentMs",
    "bulkUiMs",
    "statsMs",
    "jumpMenuMs",
    "historyButtonsMs",
    "longPressMs",
    "badgeMs",
  ];
  const latestSample = samples[samples.length - 1];
  const summary = {
    samples: samples.length,
    playCount: latestSample.playCount,
    periodCount: latestSample.periodCount,
  };

  keys.forEach((key) => {
    const total = samples.reduce(
      (sum, sample) => sum + (sample[key] || 0),
      0,
    );
    summary[key] = Number((total / samples.length).toFixed(2));
  });

  return summary;
}

function summarizeScriptRenderProfileHistory() {
  return summarizeScriptRenderProfileSamples(scriptRenderProfileHistory);
}

function printScriptRenderProfileSummary() {
  const summary = summarizeScriptRenderProfileHistory();
  if (!summary) {
    console.info("Script render profiling: no samples collected yet.");
    return null;
  }

  console.table([summary]);
  return summary;
}

function enableScriptRenderProfiling() {
  scriptRenderProfilingEnabled = true;
  scriptRenderProfileHistory = [];
  console.info(
    "Script render profiling enabled. Use printScriptRenderProfileSummary() after interacting with the script tab.",
  );
}

function disableScriptRenderProfiling() {
  scriptRenderProfilingEnabled = false;
  console.info("Script render profiling disabled.");
}

function getScriptRenderProfileHistory() {
  return scriptRenderProfileHistory.slice();
}

function runScriptRenderProfileBenchmark(iterations = 20) {
  const runCount = Math.max(1, Number(iterations) || 1);
  const wasEnabled = scriptRenderProfilingEnabled;
  const benchmarkSamples = [];

  scriptRenderProfilingEnabled = true;
  scriptRenderProfileHistory = [];

  for (let index = 0; index < runCount; index++) {
    renderScript();
    const latestSample = scriptRenderProfileHistory[scriptRenderProfileHistory.length - 1];
    if (latestSample) benchmarkSamples.push(latestSample);
  }

  const summary = summarizeScriptRenderProfileSamples(benchmarkSamples);
  scriptRenderProfilingEnabled = wasEnabled;
  if (!summary) {
    console.info("Script render profiling: no samples collected yet.");
    return null;
  }

  console.table([summary]);
  if (summary.playCount === 0 || summary.periodCount <= 1) {
    console.warn(
      "Script render benchmark used a very small script. Load a larger script before using these timings to choose optimization work.",
    );
  }
  console.info(
    `Script render benchmark captured ${benchmarkSamples.length} sample(s). Use getScriptRenderProfileHistory() to inspect the rolling history buffer.`,
  );
  return summary;
}

function renderScript() {
  try {
    const container = document.getElementById("scriptPlays");
    const profile = scriptRenderProfilingEnabled
      ? {
        startedAt: performance.now(),
        playCount: script.filter((item) => !item.isSeparator).length,
        periodCount: script.filter((item) => item.isSeparator).length,
      }
      : null;
    const opts = getScriptDisplayOptions();
    const showPrintPreview =
      document.getElementById("scriptShowPrintPreview")?.checked || false;

    let stageStart = profile ? performance.now() : 0;
    const renderContext = createScriptRenderContext(opts, showPrintPreview);
    if (profile) {
      profile.contextMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    renderScriptContent(container, renderContext);
    if (profile) {
      profile.contentMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    updateBulkSelectUI();
    if (profile) {
      profile.bulkUiMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    updateScriptStats(renderContext.renderSummary);
    if (profile) {
      profile.statsMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    updateJumpToPeriodOptions(renderContext.renderSummary);
    if (profile) {
      profile.jumpMenuMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    historyManager.updateButtons("script");
    if (profile) {
      profile.historyButtonsMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    if (typeof _showScriptPlayContextMenu === "function") {
      container
        .querySelectorAll(".script-item:not(.period-header)")
        .forEach((el) => {
          const idx = parseInt(el.dataset.idx, 10);
          if (!isNaN(idx) && script[idx] && !script[idx].isSeparator) {
            addLongPress(el, (ev) => _showScriptPlayContextMenu(ev, idx));
          }
        });
    }
    if (profile) {
      profile.longPressMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    if (typeof updateTabBadges === "function") updateTabBadges();
    if (profile) {
      profile.badgeMs = performance.now() - stageStart;
      profile.totalMs = performance.now() - profile.startedAt;
      delete profile.startedAt;
      recordScriptRenderProfileSample(profile);
    }
  } catch (err) {
    console.error("renderScript error:", err);
    showToast("❌ Error rendering script.", { duration: 3000, type: "error" });
  }
}

const _scheduleRenderScript = createRAFRenderer(renderScript);

// ============ Script Play Field Updaters ============
// Wired via app-events.js delegated change/input handlers (data-field).

function updateReps(index, reps) {
  if (!script[index] || script[index].isSeparator) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit("reps", parseInt(reps, 10) || 1);
    return;
  }
  script[index].reps = parseInt(reps, 10) || 1;
  updateScriptPreviewReps(index, script[index].reps);
  if (typeof findOwningPeriodIndex === "function") {
    updatePeriodMetaDisplay(findOwningPeriodIndex(index));
  }
  updateScriptStats();
  saveScriptState();
}

function updateNotes(index, notes) {
  if (!script[index] || script[index].isSeparator) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit("notes", notes);
    return;
  }
  script[index].notes = notes;
  debouncedSaveScriptState();
}

function updateHash(index, value) {
  if (!script[index] || script[index].isSeparator) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit("hash", value);
    return;
  }
  script[index].hash = value;
  updateScriptPreviewField(index, "hash", value);
  debouncedSaveScriptState();
}

function updateDefField(index, field, value) {
  if (!script[index] || script[index].isSeparator) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit(field, value);
    return;
  }
  script[index][field] = value;
  const previewClassMap = {
    defFront: "front",
    defCoverage: "cov",
    defStunt: "stunt",
    defBlitz: "blitz",
  };
  updateScriptPreviewField(index, previewClassMap[field], value);
  debouncedSaveScriptState();
}
