let scriptRenderProfilingEnabled = false;
let scriptRenderProfileHistory = [];
let scriptDerivedUiSignature = "";

const SCRIPT_RENDER_PROFILE_HISTORY_LIMIT = 12;
const SCRIPT_RENDER_WARN_TOTAL_MS = 45;
const SCRIPT_RENDER_WARN_COOLDOWN_MS = 15000;
let scriptRenderWarnLastAt = 0;
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

function buildScriptDerivedUiSignature(scriptItems) {
  if (!Array.isArray(scriptItems) || scriptItems.length === 0) return "empty";

  return scriptItems
    .map((item) => {
      if (!item) return "x";
      if (item.isSeparator) {
        return [
          "s",
          item.id || "",
          item.label || "",
          item.minutes || 0,
          item.color || "",
          item.notes || "",
          item.hideProtection ? "1" : "0",
        ].join("~");
      }

      return [
        "p",
        item.id || "",
        item.reps || 1,
        item.type || "",
        item.tempo || "",
        item.personnel || "",
        item.preferredSituation || "",
        item.preferredDown || "",
        item.preferredDistance || "",
        item.preferredFieldPosition || "",
      ].join("~");
    })
    .join("|");
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

  const ratioBar = wrapper?.querySelector(".ph-ratio-bar");
  if (ratioBar) {
    const total = runCount + passCount;
    if (total > 0) {
      ratioBar.style.display = "";
      const runEl = ratioBar.querySelector(".ratio-bar-run");
      if (runEl) runEl.style.width = `${Math.round((runCount / total) * 100)}%`;
    } else {
      ratioBar.style.display = "none";
    }
  }
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
    ["[data-drag=\"periodStart\"]", `Drag ${periodLabel} to reorder`],
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
  const playerRole = isPlayerScriptRole();
  const periodStatsBySeparatorIndex = playerRole ? buildPeriodStatsMap(script) : null;
  script.forEach((period, index) => {
    if (!period.isSeparator) return;
    if (playerRole) {
      periodHeaders += renderPlayerScriptPeriodHeader(period, index, {
        periodStatsBySeparatorIndex,
      });
      return;
    }
    const periodColor = period.color || UI_COLORS.periodDefault;
    const periodLabel = period.label || "Period";
    const periodNotes = period.notes || "";
    const periodId = escapeHtml(String(period.id));
    const protectionButtonLabel = period.hideProtection ? "Prot Off" : "Prot On";
    const protectionButtonTitle = period.hideProtection
      ? `Show protection for ${periodLabel}`
      : `Hide protection for ${periodLabel}`;
    periodHeaders += `
      <div class="script-item period-header" data-period-id="${periodId}" data-period-drop-id="${periodId}" style="background: ${periodColor}; color: var(--color-text-inverse);" role="group" aria-label="${escapeHtml(periodLabel)} period header">
        <div class="ph-top">
          <textarea class="ph-notes-input" data-field="periodNotes" data-idx="${index}" rows="2" placeholder="Period notes" aria-label="Notes for ${escapeHtml(periodLabel)}">${escapeHtml(periodNotes)}</textarea>
        </div>
        <div class="ph-main">
          <div class="ph-left">
            <button type="button" class="ph-drag-handle" draggable="true" data-drag="periodStart" data-period-id="${periodId}" data-idx="${index}" title="Drag to reorder period" aria-label="Drag ${escapeHtml(periodLabel)} to reorder">☰</button>
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

function isPlayerScriptRole() {
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return currentUser?.role === "player";
}

function getPlayerScriptMetaItems(play, reps) {
  const items = [
    play.type,
    play.tempo,
    play.hash || play.preferredHash
      ? `${play.hash || play.preferredHash} hash`
      : "",
    reps > 1 ? `${reps} reps` : "1 rep",
  ];
  if (play.oneWord) items.push(`One Word ${play.oneWord}`);
  return items.filter(Boolean);
}

function renderPlayerScriptPeriodHeader(separator, index, renderContext) {
  const { playCount, periodReps, runCount, passCount } = getPeriodStats(
    index,
    renderContext?.periodStatsBySeparatorIndex,
  );
  const periodColor = separator.color || UI_COLORS.periodDefault;
  const periodLabel = separator.label || "Period";
  const periodNotes = separator.notes || "";
  const metaText = formatPeriodMetaText(
    playCount,
    periodReps,
    separator.minutes,
    runCount,
    passCount,
  );
  const periodId = escapeHtml(String(separator.id));

  return `
    <div class="period-header-wrapper period-header-wrapper--player" data-separator-id="${periodId}"
      data-period-id="${periodId}" data-period-index="${index}" role="region"
      aria-label="${escapeHtml(periodLabel)} period">
      <div class="script-item period-header period-header--player"
        style="border-left: 4px solid ${periodColor};">
        <div class="period-header-player__eyebrow">Practice Block</div>
        <div class="period-header-player__title-row">
          <div class="period-header-player__title">${escapeHtml(periodLabel)}</div>
          <div class="period-header-player__meta">${escapeHtml(metaText)}</div>
        </div>
        ${periodNotes
      ? `<div class="period-header-player__notes">${escapeHtml(periodNotes)}</div>`
      : ""
    }
      </div>
    </div>
  `;
}

function renderScriptPeriodHeader(separator, index, renderContext) {
  if (isPlayerScriptRole()) {
    return renderPlayerScriptPeriodHeader(separator, index, renderContext);
  }
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
  const periodId = escapeHtml(String(separator.id));

  return `
    <div class="period-header-wrapper" data-separator-id="${periodId}" data-period-id="${periodId}" data-period-drop-id="${periodId}" data-period-index="${index}" style="border-left: 4px solid ${periodColor};" role="region" aria-label="${escapeHtml(periodLabel)} period">
      <div class="script-item period-header" style="background: ${periodColor}; color: var(--color-text-inverse);">
        <div class="ph-top">
          <textarea class="ph-notes-input" data-field="periodNotes" data-idx="${index}" rows="2" placeholder="Period notes" aria-label="Notes for ${escapeHtml(periodLabel)}">${escapeHtml(periodNotes)}</textarea>
        </div>
        <div class="ph-main">
          <div class="ph-left">
            <button type="button" class="ph-drag-handle" draggable="true" data-drag="periodStart" data-period-id="${periodId}" data-idx="${index}" title="Drag to reorder period" aria-label="Drag ${escapeHtml(periodLabel)} to reorder">☰</button>
            <button class="ph-collapse-btn" data-action="togglePeriodCollapse" data-period-id="${periodId}" title="${isCollapsed ? "Expand" : "Collapse"}" aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(periodLabel)}" aria-expanded="${isCollapsed ? "false" : "true"}">${collapseIcon}</button>
            <input type="color" class="ph-color-input" value="${periodColor}" data-field="periodColor" data-idx="${index}" title="Period color" aria-label="Color for ${escapeHtml(periodLabel)}">
            <input type="text" class="ph-label-input" value="${escapeHtml(periodLabel)}" data-field="periodLabel" data-idx="${index}" aria-label="Name for ${escapeHtml(periodLabel)}">
            <input type="number" class="ph-minutes-input" value="${separator.minutes || ""}" data-field="periodMinutes" data-idx="${index}" placeholder="min" title="Time in minutes" aria-label="Minutes for ${escapeHtml(periodLabel)}">
            <span class="ph-meta-span">${metaText}</span>
            ${(runCount || passCount) ? `<div class="ph-ratio-bar ratio-bar-wrap" aria-hidden="true"><div class="ratio-bar-run" style="width:${runCount + passCount > 0 ? Math.round((runCount / (runCount + passCount)) * 100) : 50}%"></div><div class="ratio-bar-pass"></div></div>` : ""}
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
  const hasClip =
    typeof window.playClips !== "undefined" &&
    typeof window.playClips.hasForPlay === "function" &&
    window.playClips.hasForPlay(play);
  const clipBtn = hasClip
    ? `<button class="script-clip-btn" data-action="openScriptClipViewer" data-arg="${index}" title="Watch video clips" aria-label="Watch video clips for ${escapeHtml(playLabel)}">🎬</button>`
    : "";
  const discBtn = typeof getPlayThreadId === "function"
    ? `<button class="script-disc-btn" data-action="openScriptDiscussion" data-arg="${index}" title="View discussion" aria-label="Discussion for ${escapeHtml(playLabel)}">💬</button>` +
    `<button class="script-ask-coach-btn" data-action="scriptAskCoachQuestion" data-arg="${index}" title="Ask a question about this play" aria-label="Ask coach about ${escapeHtml(playLabel)}">❓</button>`
    : "";
  return `
      <div class="play-controls">
        <div class="play-control-fields">
          <input class="play-reps-input" type="number" value="${reps}" min="1" data-field="reps" data-idx="${index}" title="Reps" aria-label="Reps for ${escapeHtml(playLabel)}">
          <input class="play-notes-input" type="text" value="${escapeHtml(play.notes || "")}" placeholder="Notes" data-field="notes" data-idx="${index}" aria-label="Notes for ${escapeHtml(playLabel)}">
        </div>
        <div class="play-control-actions">
          ${clipBtn}
          ${discBtn}
          <button class="script-present-btn" data-action="openScriptPresentation" data-idx="${index}" title="Present this play" aria-label="Present ${escapeHtml(playLabel)}">▶</button>
          <button class="script-edit-play-btn" data-action="openPlayEditorFromScript" data-arg="${index}" title="Edit this play in the playbook" aria-label="Edit play ${escapeHtml(playLabel)}">✏️</button>
          <button class="dup-btn" data-action="duplicatePlay" data-idx="${index}" title="Duplicate" aria-label="Duplicate ${escapeHtml(playLabel)}">⧉</button>
          <button class="remove" data-action="removeFromScript" data-idx="${index}" aria-label="Remove ${escapeHtml(playLabel)}">✕</button>
        </div>
      </div>`;
}

function renderScriptInlineCallEdits(play, index, playLabel) {
  return `
      <div class="script-call-edits" aria-label="Inline call edits for ${escapeHtml(playLabel)}">
        <label class="script-call-edit-field">
          <span>Shift</span>
          <input type="text" value="${escapeHtml(play.shift || "")}" placeholder="Shift" data-field="shift" data-idx="${index}" aria-label="Shift for ${escapeHtml(playLabel)}">
        </label>
        <label class="script-call-edit-field">
          <span>Motion</span>
          <input type="text" value="${escapeHtml(play.motion || "")}" placeholder="Motion" data-field="motion" data-idx="${index}" aria-label="Motion for ${escapeHtml(playLabel)}">
        </label>
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
    selectedIndexSet,
    playbookSigSet,
  } = renderContext;
  const fullCall = getCachedFullCall(play, Boolean(callOptions?.hideProtection));
  const isSelected = selectedIndexSet.has(index);
  const hashOptions = getCachedHashOptions(play);
  const playLabel = getCachedSummaryText(play);
  const shouldRenderAssignmentGrid = !opts.hidePersonnel;
  const playerSummary = showPrintPreview ? getCachedPlayerSummary(play) : "";
  const playerPersonnelMarkup = shouldRenderAssignmentGrid
    ? buildScriptPlayerAssignmentGrid(play, index, playLabel, opts)
    : "";
  const readinessSummary =
    typeof getPlayReadinessSummary === "function" &&
      typeof isPlayReadinessCoachRole === "function" &&
      isPlayReadinessCoachRole() &&
      !opts.printStyle
      ? getPlayReadinessSummary(play)
      : null;
  const readinessMarkup =
    typeof renderPlayReadinessScriptWidget === "function"
      ? renderPlayReadinessScriptWidget(play, index, {
        ...opts,
        readinessSummary,
      })
      : "";
  const readinessBadge =
    typeof renderPlayReadinessCompactBadgeFromSummary === "function" && readinessSummary
      ? renderPlayReadinessCompactBadgeFromSummary(readinessSummary, {
        variant: "script",
        detail: true,
        scriptIdx: index,
      })
      : "";
  const sourceStatusBadge =
    !opts.printStyle && typeof renderPlaySourceStatusBadge === "function"
      ? renderPlaySourceStatusBadge(play)
      : "";
  const reps = play.reps ?? 1;
  const itemClasses = [
    "script-item",
    `script-item--${availTypeSlug(play.type)}`,
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

  if (isPlayerScriptRole()) {
    const metaItems = getPlayerScriptMetaItems(play, reps);
    const focusText = String(play.respNotes || play.notes || "").trim();
    const playerItemClasses = [
      "script-item",
      "script-item--player",
      opts.printStyle ? "script-item--printlike" : "",
    ].filter(Boolean).join(" ");

    return `
      <article class="${playerItemClasses}" data-idx="${index}" role="group"
        aria-label="Play ${playNumber}: ${escapeHtml(playLabel)}">
        <div class="script-player-card-head">
          <div class="script-player-card-badge">Play ${playNumber}${wbBadge}</div>
          <div class="script-player-card-actions">
            ${typeof window.playClips !== "undefined" &&
        typeof window.playClips.hasForPlay === "function" &&
        window.playClips.hasForPlay(play)
        ? `<button class="script-player-clip-btn" data-action="openScriptClipViewer"
            data-arg="${index}" title="Watch video clips" aria-label="Watch video clips for ${escapeHtml(playLabel)}">🎬 Watch</button>`
        : ""
      }
            ${(() => {
        const discPlayId = typeof getPlayThreadId === "function" ? getPlayThreadId(play) : null;
        return discPlayId
          ? `<button class="script-player-disc-btn" data-action="openScriptDiscussion" data-arg="${index}" data-disc-play-id="${escapeHtml(discPlayId)}" title="Discussion" aria-label="View discussion for ${escapeHtml(playLabel)}">💬</button>`
          : "";
      })()}
            <button class="script-player-open-btn" data-action="openScriptPresentation"
              data-idx="${index}" title="Open ${escapeHtml(playLabel)} in swipe view"
              aria-label="Open ${escapeHtml(playLabel)} in swipe view">
              Open Rules
            </button>
          </div>
        </div>
        <div class="script-player-card-call">${fullCall}</div>
        ${metaItems.length
        ? `<div class="script-player-card-meta">${metaItems
          .map((item) => `<span class="script-player-card-chip">${escapeHtml(item)}</span>`)
          .join("")}</div>`
        : ""
      }
        ${focusText
        ? `<div class="script-player-card-note">
                <strong>Focus</strong>
                <span>${escapeHtml(focusText)}</span>
              </div>`
        : ""
      }
      </article>
      ${showPrintPreview ? renderScriptPrintPreviewRow(play, playNumber, fullCall, playerSummary, reps) : ""}
    `;
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
        <div class="call-meta">
          <span>${(() => {
      const typeKey = play.type ? play.type.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "") : "";
      const typeChip = play.type ? `<span class="script-type-chip" data-type="${typeKey}">${escapeHtml(play.type)}</span>` : "";
      const tempo = play.tempo ? `<span class="script-tempo-text">· ${escapeHtml(play.tempo)}</span>` : "";
      return `${typeChip}${tempo}`;
    })()}</span>
          ${playbookSigSet && playbookSigSet.has(playSignature(play)) ? `<button type="button" class="script-pb-chip" data-action="jumpToPlayInPlaybook" data-arg="${index}" title="View this play in the Playbook" aria-label="View ${escapeHtml(playLabel)} in Playbook">📖</button>` : ""}
          ${play._gpSource ? `<span class="script-gp-source-badge" title="Added from Game Plan">🎯 GP</span>` : ""}
          ${sourceStatusBadge}
          ${readinessBadge}
          ${(() => {
      if (opts.printStyle) return "";
      const discPlayId = typeof getPlayThreadId === "function" ? getPlayThreadId(play) : null;
      return discPlayId
        ? `<button class="script-disc-badge" data-action="openScriptDiscussion" data-arg="${index}" data-disc-play-id="${escapeHtml(discPlayId)}" title="View discussion" aria-label="Discussion for ${escapeHtml(playLabel)}">💬 <span class="script-disc-count"></span></button>`
        : "";
    })()}
        </div>
        ${renderScriptInlineCallEdits(play, index, playLabel)}
      </div>
      <div class="hash-input">
        <select data-field="hash" data-idx="${index}" title="Hash" aria-label="Hash for ${escapeHtml(playLabel)}">
          ${hashOptions}
        </select>
      </div>
      ${renderScriptDefenseInputs(play, index, playLabel, defenseDatalistState)}
      ${renderScriptPlayControls(play, index, playLabel, reps)}
      ${readinessMarkup}
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
  if (isPlayerScriptRole()) {
    return `
      <div class="empty-state">
        <span class="empty-state__icon">📲</span>
        <p class="empty-state__text">Choose a published practice script above to start your day.</p>
        <p class="empty-state__hint">Once it loads, use <strong>Swipe View</strong> to move play-to-play and see your rule.</p>
      </div>
    `;
  }
  return `
      <div class="empty-state">
        <span class="empty-state__icon">📋</span>
        <p class="empty-state__text">Add plays from the left panel to start building this period</p>
        <p class="empty-state__hint">Click <strong>+ Add</strong> on any play, or check multiple and use <strong>Add Selected</strong></p>
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
  const selectedIndexSet = new Set(bulkSelectedIndices);
  const playbookSigSet = plays.length ? new Set(plays.map(playSignature)) : new Set();

  return {
    opts,
    showPrintPreview,
    selectedIndexSet,
    playbookSigSet,
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
      const rendered = getScriptFullCall(
        play,
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
  const playerRole = isPlayerScriptRole();
  const scriptPanel = document.getElementById("script");
  if (scriptPanel) {
    scriptPanel.classList.toggle("script-player-awaiting-load", playerRole && !hasPlays);
  }

  if (script.length === 0) {
    container.innerHTML = "";
    container.classList.add("empty");
    return;
  }

  if (!hasPlays) {
    if (playerRole) {
      container.classList.add("empty");
      container.innerHTML = "";
      return;
    }
    container.classList.remove("empty");
    container.innerHTML =
      renderScriptEmptyPeriodHeaders() +
      renderScriptGuidedEmptyState();
    return;
  }

  container.classList.remove("empty");
  container.innerHTML =
    (playerRole ? "" : renderContext.defenseDatalistState.html) +
    (playerRole ? "" : renderScriptColumnHeaders()) +
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
    periodHeader.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  let visible = 0;

  items.forEach((item) => {
    let haystack = item._cachedSearchHaystack;
    if (haystack === undefined) {
      haystack = (item.textContent || "").toLowerCase();
      item._cachedSearchHaystack = haystack;
    }
    const showItem = searchTerm === "" || haystack.includes(searchTerm);
    if (showItem) {
      item.classList.remove("hidden");
      item.classList.remove("search-hidden");
      visible += 1;
    } else {
      item.classList.add("hidden");
      item.classList.add("search-hidden");
    }

    const previewRow = item.nextElementSibling;
    if (previewRow && previewRow.classList.contains("print-preview-row")) {
      previewRow.classList.toggle("hidden", !showItem);
      previewRow.classList.toggle("search-hidden", !showItem);
    }
  });

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
window.debouncedFilterScriptItems = debouncedFilterScriptItems;

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

function recordScriptRenderProfileSample(sample) {
  scriptRenderProfileHistory.push(sample);
  if (scriptRenderProfileHistory.length > SCRIPT_RENDER_PROFILE_HISTORY_LIMIT) {
    scriptRenderProfileHistory.shift();
  }
}

function maybeWarnSlowScriptRender(totalMs, playCount, periodCount) {
  const now = Date.now();
  if (totalMs < SCRIPT_RENDER_WARN_TOTAL_MS) return;
  if (now - scriptRenderWarnLastAt < SCRIPT_RENDER_WARN_COOLDOWN_MS) return;

  scriptRenderWarnLastAt = now;
  console.warn(
    `Slow script render detected: ${totalMs.toFixed(1)}ms (plays: ${playCount}, periods: ${periodCount}).`,
  );
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

function jumpToPlayInPlaybook(idxOrStr) {
  const idx = parseInt(idxOrStr, 10);
  const scriptPlay = script[idx];
  if (!scriptPlay || scriptPlay.isSeparator) return;
  let fIdx = filteredPlays.findIndex((p) => playsMatch(p, scriptPlay));
  if (fIdx < 0 && typeof clearFilters === "function") {
    clearFilters();
    fIdx = filteredPlays.findIndex((p) => playsMatch(p, scriptPlay));
  }
  if (fIdx < 0) {
    showToast("Play not found in playbook", { type: "warning" });
    return;
  }
  if (typeof showTab === "function") showTab("playbook");
  requestAnimationFrame(() => {
    if (typeof selectPlaybookRow === "function") selectPlaybookRow(fIdx);
    const row = document.querySelector(`#playbookTable tr[data-idx="${fIdx}"]`);
    if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function renderScript() {
  // Guard against early renders firing before app.js has declared the `script`
  // global (where the identifier would otherwise resolve to the #script DOM
  // element); a proper render follows once the app finishes initializing.
  if (typeof script === "undefined" || !Array.isArray(script)) return;
  updateScriptOpponentBadge();
  if (typeof updateScriptReconcileStatus === "function") updateScriptReconcileStatus();
  if (typeof updateScriptArtifactStatus === "function") updateScriptArtifactStatus();
  try {
    const renderStartedAt = performance.now();
    const container = document.getElementById("scriptPlays");
    // Single pass — avoids two separate .filter() iterations over the full array.
    let playCount = 0, periodCount = 0;
    for (const item of script) { if (item.isSeparator) periodCount++; else playCount++; }
    const profile = scriptRenderProfilingEnabled
      ? {
        startedAt: performance.now(),
        playCount,
        periodCount,
      }
      : null;
    const opts = getScriptDisplayOptions();
    const showPrintPreview =
      !isPlayerScriptRole() &&
      (document.getElementById("scriptShowPrintPreview")?.checked || false);

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

    const nextDerivedUiSignature = buildScriptDerivedUiSignature(script);
    const shouldRefreshDerivedUi =
      nextDerivedUiSignature !== scriptDerivedUiSignature;

    if (shouldRefreshDerivedUi) {
      renderScriptTimeline(renderContext);
      if (profile) {
        profile.timelineMs = performance.now() - stageStart;
        stageStart = performance.now();
      }

      updateScriptStats(renderContext.renderSummary);
      if (typeof renderPlayerLoadedScriptBar === "function") {
        renderPlayerLoadedScriptBar();
      }
      if (profile) {
        profile.statsMs = performance.now() - stageStart;
        stageStart = performance.now();
      }

      updateJumpToPeriodOptions(renderContext.renderSummary);
      if (profile) {
        profile.jumpMenuMs = performance.now() - stageStart;
        stageStart = performance.now();
      }

      scriptDerivedUiSignature = nextDerivedUiSignature;
    } else if (profile) {
      profile.timelineMs = 0;
      profile.statsMs = 0;
      profile.jumpMenuMs = 0;
    }

    if (!shouldRefreshDerivedUi && typeof renderPlayerLoadedScriptBar === "function") {
      renderPlayerLoadedScriptBar();
    }

    if (profile) {
      // If derived UI was skipped, stageStart still points to the prior stage.
      // Reset it so profiling around later stages remains accurate.
      stageStart = performance.now();
    }

    updateBulkSelectUI();
    if (profile) {
      profile.bulkUiMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    historyManager.updateButtons("script");
    if (profile) {
      profile.historyButtonsMs = performance.now() - stageStart;
      stageStart = performance.now();
    }

    // Defer long-press wiring to after the current frame — it doesn't need to
    // block the render timing measurement and has no visible effect until the
    // user initiates a long-press gesture.
    (window.requestIdleCallback || window.requestAnimationFrame || setTimeout)(
      () => wireScriptLongPressMenus(container)
    );
    if (profile) {
      profile.longPressMs = 0; // deferred — excluded from synchronous timing
      stageStart = performance.now();
    }

    if (typeof updateTabBadges === "function") updateTabBadges();
    if (typeof loadScriptDiscussionCounts === "function") loadScriptDiscussionCounts();
    if (typeof renderScriptVisionPanel === "function") {
      try {
        renderScriptVisionPanel();
      } catch (err) {
        console.error("renderScriptVisionPanel error:", err);
      }
    }
    if (profile) {
      profile.badgeMs = performance.now() - stageStart;
      profile.totalMs = performance.now() - profile.startedAt;
      delete profile.startedAt;
      recordScriptRenderProfileSample(profile);
    }

    const totalRenderMs = performance.now() - renderStartedAt;
    maybeWarnSlowScriptRender(totalRenderMs, playCount, periodCount);
  } catch (err) {
    console.error("renderScript error:", err);
    showToast("❌ Error rendering script.", { duration: 3000, type: "error" });
  }
}

function wireScriptLongPressMenus(container) {
  if (
    !container ||
    typeof _showScriptPlayContextMenu !== "function" ||
    isPlayerScriptRole()
  ) {
    return;
  }

  container.querySelectorAll(".script-item:not(.period-header)").forEach((el) => {
    if (el.dataset.longPressBound === "true") return;

    const idx = parseInt(el.dataset.idx, 10);
    if (isNaN(idx) || !script[idx] || script[idx].isSeparator) return;

    addLongPress(el, (ev) => _showScriptPlayContextMenu(ev, idx));
    el.dataset.longPressBound = "true";
  });
}

const _scheduleRenderScript = createRAFRenderer(renderScript);

function scheduleRenderScript() {
  _scheduleRenderScript();
}

function requestRenderScript() {
  _scheduleRenderScript();
}

// ============ Script Play Field Updaters ============
// Wired via app-events.js delegated change/input handlers (data-field).

function updateReps(index, reps) {
  if (!script[index] || script[index].isSeparator) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit("reps", parseInt(reps, 10) || 1);
    return;
  }
  const nextReps = parseInt(reps, 10) || 1;
  if ((script[index].reps || 1) === nextReps) return;
  saveScriptState();
  script[index].reps = nextReps;
  updateScriptPreviewReps(index, script[index].reps);
  if (typeof findOwningPeriodIndex === "function") {
    updatePeriodMetaDisplay(findOwningPeriodIndex(index));
  }
  refreshScriptTimeline();
  updateScriptStats();
}

function updateNotes(index, notes) {
  if (!script[index] || script[index].isSeparator) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit("notes", notes);
    return;
  }
  if ((script[index].notes || "") === notes) return;
  beginScriptEdit();
  script[index].notes = notes;
  const { row, previewRow } = getScriptPlayDom(index);
  const notesInput = row?.querySelector('[data-field="notes"]');
  if (notesInput && notesInput.value !== notes) {
    notesInput.value = notes;
  }
  const previewNotes = previewRow?.querySelector(".preview-field.notes");
  if (previewNotes) {
    previewNotes.textContent = notes || "-";
  }
}

function updateScriptCallDisplay(index) {
  const play = script[index];
  if (!play || play.isSeparator) return;
  const { row, previewRow } = getScriptPlayDom(index);
  const opts = typeof getScriptDisplayOptions === "function" ? getScriptDisplayOptions() : {};
  const periodIndex = typeof findOwningPeriodIndex === "function"
    ? findOwningPeriodIndex(index)
    : -1;
  const separator = periodIndex >= 0 ? script[periodIndex] : null;
  const callOptions =
    typeof getPeriodCallDisplayOptions === "function"
      ? getPeriodCallDisplayOptions(separator, opts)
      : opts;
  const fullCall = getScriptFullCall(play, callOptions);
  const callEl = row?.querySelector(".full-call");
  if (callEl) callEl.innerHTML = fullCall;
  const previewCallEl = previewRow?.querySelector(".preview-field.call");
  if (previewCallEl) previewCallEl.innerHTML = fullCall;
}

function updateScriptCallField(index, field, value) {
  if (!script[index] || script[index].isSeparator) return;
  if (!["shift", "motion"].includes(field)) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit(field, value);
    return;
  }
  if ((script[index][field] || "") === value) return;
  beginScriptEdit();
  script[index][field] = value;
  updateScriptCallDisplay(index);
}

function updateHash(index, value) {
  if (!script[index] || script[index].isSeparator) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit("hash", value);
    return;
  }
  if ((script[index].hash || "") === value) return;
  beginScriptEdit();
  script[index].hash = value;
  updateScriptPreviewField(index, "hash", value);
}

function updateDefField(index, field, value) {
  if (!script[index] || script[index].isSeparator) return;
  if (bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(index)) {
    applyBulkEdit(field, value);
    return;
  }
  if ((script[index][field] || "") === value) return;
  beginScriptEdit();
  script[index][field] = value;
  const previewClassMap = {
    defFront: "front",
    defCoverage: "cov",
    defStunt: "stunt",
    defBlitz: "blitz",
  };
  updateScriptPreviewField(index, previewClassMap[field], value);
}

// #132: Active-opponent badge in script workspace header
function updateScriptOpponentBadge() {
  const badge = document.getElementById("scriptOpponentBadge");
  if (!badge) return;
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  const opp = gw && gw.opponentName ? gw.opponentName : "";
  if (opp) {
    badge.textContent = `vs ${opp}`;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// ─── #144: Artifact status bar ────────────────────────────────────────────────
function updateScriptArtifactStatus() {
  const el = document.getElementById("scriptSaveStatus");
  if (!el) return;
  // Single pass — avoids two .filter() calls over the same array.
  let playCount = 0, periodCount = 0;
  if (Array.isArray(script)) {
    for (const s of script) { if (s.isSeparator) periodCount++; else playCount++; }
  }
  const countLabel = playCount
    ? `${playCount} play${playCount !== 1 ? "s" : ""}${periodCount ? ` · ${periodCount} period${periodCount !== 1 ? "s" : ""}` : ""}`
    : "";
  if (scriptDirty) {
    el.textContent = countLabel ? `● Unsaved · ${countLabel}` : "● Unsaved changes";
    el.className = "script-save-status dirty";
  } else {
    el.textContent = countLabel ? `✓ Saved · ${countLabel}` : "✓ Saved";
    el.className = "script-save-status clean";
  }
}

// ─── #142: Script Play Quiz ───────────────────────────────────────────────────
let _quizPlays = [];     // [{ play, period }]
let _quizIndex = 0;
let _quizShuffled = false;
let _quizRevealed = false;
let _quizAnswers = new Map();
let _quizChoiceCache = new Map();
let _quizCurrentChoices = [];
let _quizCurrentQuestion = null;
let _quizScore = 0;
let _quizStreak = 0;
let _quizBestStreak = 0;
let _quizBasePlays = [];
let _quizSourceType = "script";
let _quizSourceId = "";
let _quizSourceWeight = 1;
let _quizTitle = "Play Quiz";
let _quizMode = "quick";
let _playerQuizSelectedMode = "quick";
let _quizPositionKey = "respQ";
let _quizPositionMode = "primary";
let _quizFinished = false;
let _quizSavedAttemptId = "";
let _quizExitSummaryOpen = false;

const SCRIPT_QUIZ_CHOICE_COLORS = ["blue", "red", "gold", "green"];
const PLAYER_QUIZ_WEEKLY_GOAL = 1000;
const PLAYER_QUIZ_BASE_CORRECT_POINTS = 10;
const PLAYER_QUIZ_STREAK_STEP_POINTS = 1;
const PLAYER_QUIZ_MAX_STREAK_BONUS = 4;
const PLAYER_QUIZ_MIN_BONUS_ANSWERS = 5;
const PLAYER_QUIZ_SOURCE_WEIGHTS = {
  script: 1,
  gameplan: 1.25,
};
const PLAYER_QUIZ_TIER_DEFAULTS = [
  { key: "champion", label: "Champion" },
  { key: "baller", label: "Baller" },
  { key: "starter", label: "Starter" },
  { key: "contributor", label: "Contributor" },
  { key: "defense", label: "Defense" },
];
const PLAYER_QUIZ_TIERS = PLAYER_QUIZ_TIER_DEFAULTS.map((tier) => tier.label);
const PLAYER_QUIZ_DEFAULT_TIER_NAMES = PLAYER_QUIZ_TIER_DEFAULTS.reduce((acc, tier) => {
  acc[tier.key] = tier.label;
  return acc;
}, {});
const PLAYER_QUIZ_BADGES = [
  { min: 95, label: "Coaches List", bonus: 75 },
  { min: 90, label: "High Honor Roll", bonus: 50 },
  { min: 85, label: "Honor Roll", bonus: 30 },
];
const PLAYER_QUIZ_REWARD_POINT_DEFAULTS = {
  question: 15,
  answer: 25,
  gift: 50,
};
const PLAYER_QUIZ_DEFAULT_SETTINGS = {
  weeklyGoal: PLAYER_QUIZ_WEEKLY_GOAL,
  baseCorrectPoints: PLAYER_QUIZ_BASE_CORRECT_POINTS,
  scriptWeight: PLAYER_QUIZ_SOURCE_WEIGHTS.script,
  gameplanWeight: PLAYER_QUIZ_SOURCE_WEIGHTS.gameplan,
  honorRollMin: 85,
  honorRollBonus: 30,
  highHonorRollMin: 90,
  highHonorRollBonus: 50,
  coachesListMin: 95,
  coachesListBonus: 75,
  minBonusAnswers: PLAYER_QUIZ_MIN_BONUS_ANSWERS,
  questionPoints: PLAYER_QUIZ_REWARD_POINT_DEFAULTS.question,
  answerPoints: PLAYER_QUIZ_REWARD_POINT_DEFAULTS.answer,
  giftPoints: PLAYER_QUIZ_REWARD_POINT_DEFAULTS.gift,
  dailyRewardCap: 125,
  weeklyRewardCap: 350,
  enabledQuestionTypes: ["responsibility", "play_from_rule", "diagram", "call"],
  tierNames: { ...PLAYER_QUIZ_DEFAULT_TIER_NAMES },
};
const DEFAULT_PLAYER_HELMET_STICKER_TYPES = [
  { key: "sure-hands", label: "Sure Hands", icon: "🤲", color: "green", description: "Caught the ball, finished the rep, or protected possession." },
  { key: "do-your-job", label: "Do Your Job", icon: "🧠", color: "blue", description: "Handled the assignment without needing extra coaching." },
  { key: "big-hit", label: "Big Hit", icon: "💥", color: "red", description: "Brought physicality and set the tone in practice." },
  { key: "explosive-play", label: "Explosive Play", icon: "⚡", color: "gold", description: "Created a chunk play, fast finish, or game-changing rep." },
  { key: "great-teammate", label: "Great Teammate", icon: "🤝", color: "purple", description: "Helped another player learn, line up, or compete." },
  { key: "trust-process", label: "Trust the Process", icon: "🏅", color: "navy", description: "Stacked good habits and stayed locked into the plan." },
];
let _leaderboardSelectedPlayer = "";
let _playerLeaderboardView = "week";
let _coachQuizLeaderboardView = "week";
let _playerQuizSelectedScriptId = "";

function _getPlayerQuizStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_RESULTS
    ? STORAGE_KEYS.PLAYER_QUIZ_RESULTS
    : "playerQuizResults";
}

function _getPlayerQuizDraftStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_DRAFT
    ? STORAGE_KEYS.PLAYER_QUIZ_DRAFT
    : "playerQuizDraft";
}

function _getPlayerQuizSettingsStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_SETTINGS
    ? STORAGE_KEYS.PLAYER_QUIZ_SETTINGS
    : "playerQuizSettings";
}

function _getPlayerQuizSourceSettingsStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS
    ? STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS
    : "playerQuizSourceSettings";
}

function _getPlayerRewardStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_REWARD_EVENTS
    ? STORAGE_KEYS.PLAYER_REWARD_EVENTS
    : "playerRewardEvents";
}

function _clampQuizNumber(value, fallback, min, max, opts = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.max(min, Math.min(max, parsed));
  return opts.integer ? Math.round(clamped) : Number(clamped.toFixed(opts.decimals ?? 2));
}

function _normalizeQuizTierNames(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return PLAYER_QUIZ_TIER_DEFAULTS.reduce((acc, tier) => {
    const label = String(src[tier.key] ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
    acc[tier.key] = label || tier.label;
    return acc;
  }, {});
}

function _normalizePlayerQuizSettings(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const defaults = PLAYER_QUIZ_DEFAULT_SETTINGS;
  const enabled = Array.isArray(src.enabledQuestionTypes)
    ? src.enabledQuestionTypes.filter((type) => ["responsibility", "play_from_rule", "diagram", "call"].includes(type))
    : defaults.enabledQuestionTypes;
  return {
    weeklyGoal: _clampQuizNumber(src.weeklyGoal, defaults.weeklyGoal, 250, 5000, { integer: true }),
    baseCorrectPoints: _clampQuizNumber(src.baseCorrectPoints, defaults.baseCorrectPoints, 1, 50, { integer: true }),
    scriptWeight: _clampQuizNumber(src.scriptWeight, defaults.scriptWeight, 0.25, 5),
    gameplanWeight: _clampQuizNumber(src.gameplanWeight, defaults.gameplanWeight, 0.25, 5),
    honorRollMin: _clampQuizNumber(src.honorRollMin, defaults.honorRollMin, 50, 100, { integer: true }),
    honorRollBonus: _clampQuizNumber(src.honorRollBonus, defaults.honorRollBonus, 0, 500, { integer: true }),
    highHonorRollMin: _clampQuizNumber(src.highHonorRollMin, defaults.highHonorRollMin, 50, 100, { integer: true }),
    highHonorRollBonus: _clampQuizNumber(src.highHonorRollBonus, defaults.highHonorRollBonus, 0, 500, { integer: true }),
    coachesListMin: _clampQuizNumber(src.coachesListMin, defaults.coachesListMin, 50, 100, { integer: true }),
    coachesListBonus: _clampQuizNumber(src.coachesListBonus, defaults.coachesListBonus, 0, 500, { integer: true }),
    minBonusAnswers: _clampQuizNumber(src.minBonusAnswers, defaults.minBonusAnswers, 1, 50, { integer: true }),
    questionPoints: _clampQuizNumber(src.questionPoints, defaults.questionPoints, 0, 250, { integer: true }),
    answerPoints: _clampQuizNumber(src.answerPoints, defaults.answerPoints, 0, 250, { integer: true }),
    giftPoints: _clampQuizNumber(src.giftPoints, defaults.giftPoints, 0, 500, { integer: true }),
    dailyRewardCap: _clampQuizNumber(src.dailyRewardCap, defaults.dailyRewardCap, 0, 1000, { integer: true }),
    weeklyRewardCap: _clampQuizNumber(src.weeklyRewardCap, defaults.weeklyRewardCap, 0, 3000, { integer: true }),
    enabledQuestionTypes: enabled.length ? Array.from(new Set(enabled)) : ["call"],
    tierNames: _normalizeQuizTierNames(src.tierNames || defaults.tierNames),
  };
}

function _getPlayerQuizSettings() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") {
    return _normalizePlayerQuizSettings(PLAYER_QUIZ_DEFAULT_SETTINGS);
  }
  return _normalizePlayerQuizSettings(storageManager.get(_getPlayerQuizSettingsStorageKey(), PLAYER_QUIZ_DEFAULT_SETTINGS));
}

function _savePlayerQuizSettings(settings) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return _getPlayerQuizSettings();
  const normalized = _normalizePlayerQuizSettings(settings);
  storageManager.set(_getPlayerQuizSettingsStorageKey(), normalized);
  return normalized;
}

function _getQuizWeeklyGoal() {
  return _getPlayerQuizSettings().weeklyGoal;
}

function _getQuizTierName(key, settings = _getPlayerQuizSettings()) {
  const names = _normalizeQuizTierNames(settings?.tierNames);
  return names[key] || PLAYER_QUIZ_DEFAULT_TIER_NAMES[key] || String(key || "");
}

function _getQuizSourceWeight(sourceType = _quizSourceType) {
  const settings = _getPlayerQuizSettings();
  return sourceType === "gameplan" ? settings.gameplanWeight : settings.scriptWeight;
}

function _getQuizBadges() {
  const settings = _getPlayerQuizSettings();
  return [
    { min: settings.coachesListMin, label: "Coaches List", bonus: settings.coachesListBonus },
    { min: settings.highHonorRollMin, label: "High Honor Roll", bonus: settings.highHonorRollBonus },
    { min: settings.honorRollMin, label: "Honor Roll", bonus: settings.honorRollBonus },
  ].sort((a, b) => b.min - a.min);
}

function _getQuizRewardDefaults() {
  const settings = _getPlayerQuizSettings();
  return {
    question: settings.questionPoints,
    answer: settings.answerPoints,
    gift: settings.giftPoints,
  };
}

function _quizSourceKey(kind, id) {
  return `${kind}:${String(id || "").trim() || "__current__"}`;
}

function _normalizeQuizSourceState(value, fallback = "available") {
  const state = String(value || fallback || "available").trim().toLowerCase();
  return ["available", "locked", "coach"].includes(state) ? state : fallback;
}

function _getPlayerQuizSourceSettings() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return {};
  const raw = storageManager.get(_getPlayerQuizSourceSettingsStorageKey(), {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function _savePlayerQuizSourceSettings(settings) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const clean = {};
  Object.entries(settings && typeof settings === "object" ? settings : {}).forEach(([key, value]) => {
    const state = _normalizeQuizSourceState(value?.state || value, "");
    if (!state) return;
    clean[key] = {
      state,
      updatedAt: value?.updatedAt || new Date().toISOString(),
    };
  });
  storageManager.set(_getPlayerQuizSourceSettingsStorageKey(), clean);
}

function _getQuizSourceSetting(kind, id) {
  const settings = _getPlayerQuizSourceSettings();
  const entry = settings[_quizSourceKey(kind, id)];
  return entry && typeof entry === "object" ? entry : {};
}

function _setQuizSourceState(kind, id, state) {
  const settings = _getPlayerQuizSourceSettings();
  settings[_quizSourceKey(kind, id)] = {
    state: _normalizeQuizSourceState(state),
    updatedAt: new Date().toISOString(),
  };
  _savePlayerQuizSourceSettings(settings);
}

function _getQuizSourceState(kind, source = {}) {
  const setting = _getQuizSourceSetting(kind, source.id);
  if (setting.state) return _normalizeQuizSourceState(setting.state);
  if (kind === "script") return source.playerVisible ? "available" : "coach";
  return "available";
}

function _quizSourceStateLabel(state, stats = null) {
  if (state === "available" && stats && stats.score < 40) return { label: "Available · Thin", tone: "thin" };
  if (state === "available") return { label: "Available", tone: "ready" };
  if (state === "locked") return { label: "Locked", tone: "locked" };
  return { label: "Coach-only", tone: "coach" };
}

function isPlayerQuizSourceAvailable(kind, id) {
  const state = _getQuizSourceState(kind, { id });
  return state === "available";
}

function _getPlayerHelmetStickerStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_HELMET_STICKERS
    ? STORAGE_KEYS.PLAYER_HELMET_STICKERS
    : "playerHelmetStickers";
}

function _getPlayerHelmetStickerTypesStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES
    ? STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES
    : "playerHelmetStickerTypes";
}

function _getPlayerQuizAttempts() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return [];
  const attempts = storageManager.get(_getPlayerQuizStorageKey(), []);
  return Array.isArray(attempts) ? attempts.filter((attempt) => attempt && typeof attempt === "object") : [];
}

function _savePlayerQuizAttempts(attempts) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const normalized = (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => attempt && typeof attempt === "object")
    .slice(-150);
  storageManager.set(_getPlayerQuizStorageKey(), normalized);
  if (typeof window !== "undefined" && typeof window.queuePlayerLeaderboardSync === "function") {
    window.queuePlayerLeaderboardSync("attempts");
  }
}

function _getPlayerRewardEvents() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return [];
  const events = storageManager.get(_getPlayerRewardStorageKey(), []);
  return Array.isArray(events) ? events.filter((event) => event && typeof event === "object") : [];
}

function _savePlayerRewardEvents(events) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const normalized = (Array.isArray(events) ? events : [])
    .filter((event) => event && typeof event === "object")
    .slice(-400);
  storageManager.set(_getPlayerRewardStorageKey(), normalized);
  if (typeof window !== "undefined" && typeof window.queuePlayerLeaderboardSync === "function") {
    window.queuePlayerLeaderboardSync("rewards");
  }
}

function _getPlayerHelmetStickers() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return [];
  const stickers = storageManager.get(_getPlayerHelmetStickerStorageKey(), []);
  return Array.isArray(stickers) ? stickers.filter((sticker) => sticker && typeof sticker === "object") : [];
}

function _savePlayerHelmetStickers(stickers) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const normalized = (Array.isArray(stickers) ? stickers : [])
    .filter((sticker) => sticker && typeof sticker === "object")
    .slice(-500);
  storageManager.set(_getPlayerHelmetStickerStorageKey(), normalized);
  if (typeof window !== "undefined" && typeof window.queuePlayerLeaderboardSync === "function") {
    window.queuePlayerLeaderboardSync("stickers");
  }
}

function _normalizeHelmetStickerType(sticker = {}, fallback = {}) {
  const label = String(sticker.label || fallback.label || "Helmet Sticker").trim() || "Helmet Sticker";
  const key = String(sticker.key || fallback.key || label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `sticker-${Date.now()}`;
  const color = ["green", "blue", "red", "gold", "purple", "navy"].includes(String(sticker.color || fallback.color || "").trim())
    ? String(sticker.color || fallback.color).trim()
    : "blue";
  return {
    key,
    label,
    icon: String(sticker.icon || fallback.icon || "🏅").trim().slice(0, 8) || "🏅",
    color,
    description: String(sticker.description || fallback.description || "").trim(),
    custom: Boolean(sticker.custom || fallback.custom),
  };
}

function _getPlayerHelmetStickerTypes() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") {
    return DEFAULT_PLAYER_HELMET_STICKER_TYPES.map((sticker) => _normalizeHelmetStickerType(sticker));
  }
  const custom = storageManager.get(_getPlayerHelmetStickerTypesStorageKey(), []);
  const merged = [
    ...DEFAULT_PLAYER_HELMET_STICKER_TYPES,
    ...(Array.isArray(custom) ? custom : []),
  ];
  const byKey = new Map();
  merged.forEach((sticker) => {
    const normalized = _normalizeHelmetStickerType(sticker);
    byKey.set(normalized.key, normalized);
  });
  return Array.from(byKey.values());
}

function _savePlayerHelmetStickerTypes(stickers) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const defaultKeys = new Set(DEFAULT_PLAYER_HELMET_STICKER_TYPES.map((sticker) => sticker.key));
  const normalized = (Array.isArray(stickers) ? stickers : [])
    .map((sticker) => _normalizeHelmetStickerType({ ...sticker, custom: true }))
    .filter((sticker) => sticker.label && !defaultKeys.has(sticker.key))
    .slice(-40);
  storageManager.set(_getPlayerHelmetStickerTypesStorageKey(), normalized);
}

function _getPlayerHelmetStickerType(stickerKey = "", fallbackLabel = "") {
  const key = String(stickerKey || "").trim();
  const label = String(fallbackLabel || "").trim().toLowerCase();
  return _getPlayerHelmetStickerTypes().find((sticker) => (
    (key && sticker.key === key) ||
    (label && sticker.label.toLowerCase() === label)
  )) || null;
}

function _getPlayerQuizDraft() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return null;
  const draft = storageManager.get(_getPlayerQuizDraftStorageKey(), null);
  return draft && typeof draft === "object" && Array.isArray(draft.plays) ? draft : null;
}

function _savePlayerQuizDraft() {
  if (!_quizPlays.length || _quizFinished) return null;
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return null;
  const draft = {
    savedAt: new Date().toISOString(),
    title: _quizTitle,
    sourceType: _quizSourceType,
    sourceId: _quizSourceId,
    sourceWeight: _quizSourceWeight,
    quizMode: _quizMode,
    positionKey: _quizPositionKey,
    positionMode: _quizPositionMode,
    shuffled: _quizShuffled,
    index: _quizIndex,
    score: _quizScore,
    streak: _quizStreak,
    bestStreak: _quizBestStreak,
    basePlays: _quizBasePlays,
    plays: _quizPlays,
    answers: Array.from(_quizAnswers.entries()),
  };
  storageManager.set(_getPlayerQuizDraftStorageKey(), draft);
  return draft;
}

function _clearPlayerQuizDraft() {
  if (typeof storageManager === "undefined" || typeof storageManager.remove !== "function") return;
  storageManager.remove(_getPlayerQuizDraftStorageKey());
}

function _formatQuizDraftMeta(draft) {
  if (!draft) return "";
  const answers = Array.isArray(draft.answers) ? draft.answers : [];
  const total = Array.isArray(draft.plays) ? draft.plays.length : 0;
  const remaining = Math.max(0, total - answers.length);
  const saved = draft.savedAt ? new Date(draft.savedAt) : null;
  const savedLabel = saved && !Number.isNaN(saved.getTime())
    ? saved.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "recently";
  return `${answers.length}/${total} answered · ${remaining} left · saved ${savedLabel}`;
}

function _quizDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function _quizWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function _getQuizBadge(percent) {
  return _getQuizBadges().find((badge) => percent >= badge.min) || {
    min: 0,
    label: "Keep Climbing",
    bonus: 0,
  };
}

function _getQuizCorrectAnswerPoints(streak, sourceWeight = _quizSourceWeight) {
  const settings = _getPlayerQuizSettings();
  const streakBonus = Math.min(
    Math.max(0, Number(streak || 1) - 1),
    PLAYER_QUIZ_MAX_STREAK_BONUS,
  ) * PLAYER_QUIZ_STREAK_STEP_POINTS;
  return Math.round((settings.baseCorrectPoints + streakBonus) * (Number(sourceWeight) || 1));
}

function _getQuizBonusPoints(badge, answered, partial = false) {
  if (partial || !badge || Number(answered || 0) < _getPlayerQuizSettings().minBonusAnswers) return 0;
  return Number(badge.bonus || 0);
}

function _quizScriptAttemptMatches(attempt, scriptOption) {
  if (!attempt || attempt.sourceType !== "script" || !scriptOption) return false;
  if (attempt.sourceId && scriptOption.id) return String(attempt.sourceId) === String(scriptOption.id);
  return String(attempt.title || "").trim() === String(scriptOption.name || "").trim();
}

function _getQuizScriptProgress(scriptOption) {
  const attempts = _getPlayerQuizAttempts()
    .filter((attempt) => _quizScriptAttemptMatches(attempt, scriptOption))
    .sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  const latest = attempts[0] || null;
  const bestPercent = attempts.reduce((best, attempt) => Math.max(best, Number(attempt.percent || 0)), 0);
  const total = latest ? Number(latest.totalQuestions || scriptOption.playCount || 0) : Number(scriptOption.playCount || 0);
  const answered = latest ? Number(latest.answered || 0) : 0;
  const pct = total ? Math.min(100, Math.round((answered / total) * 100)) : 0;
  let icon = "";
  let label = "No quiz yet";
  if (latest) {
    if (latest.completed === false) {
      label = `${pct}% done`;
    } else if (Number(latest.percent || 0) >= 100) {
      icon = "🏆";
      label = "Aced";
    } else if (Number(latest.percent || 0) >= 80) {
      icon = "🎖️";
      label = `${Math.round(Number(latest.percent || 0))}%`;
    } else if (latest.completed !== false) {
      icon = "🎗️";
      label = "Complete";
    } else {
      label = `${pct}% done`;
    }
  }
  return {
    latest,
    attempts,
    bestPercent,
    total,
    answered,
    pct,
    icon,
    label,
    points: latest ? Math.round(Number(latest.totalPoints || 0)) : 0,
  };
}

function getPlayerQuizScriptProgress(scriptId = "", scriptName = "", playCount = 0) {
  return _getQuizScriptProgress({
    id: String(scriptId || ""),
    name: String(scriptName || ""),
    playCount: Number(playCount || 0),
  });
}

function _getQuizTier(points, settings = _getPlayerQuizSettings()) {
  const goal = Math.max(1, Number(settings.weeklyGoal || PLAYER_QUIZ_WEEKLY_GOAL || 1000));
  if (points >= goal) return _getQuizTierName("champion", settings);
  if (points >= goal * 0.75) return _getQuizTierName("baller", settings);
  if (points >= goal * 0.5) return _getQuizTierName("starter", settings);
  if (points >= goal * 0.25) return _getQuizTierName("contributor", settings);
  return _getQuizTierName("defense", settings);
}

function _getQuizAchievementSummary(points, settings = _getPlayerQuizSettings()) {
  const goal = Math.max(1, Number(settings.weeklyGoal || PLAYER_QUIZ_WEEKLY_GOAL || 1000));
  const championName = _getQuizTierName("champion", settings);
  const total = Math.max(0, Math.round(Number(points || 0)));
  const overGoal = Math.max(0, total - goal);
  const starStep = Math.max(100, Math.round(goal * 0.25));
  const stars = Math.min(5, Math.floor(overGoal / starStep));
  const starLabels = [
    `${championName} Star`,
    `Two-Star ${championName}`,
    `Three-Star ${championName}`,
    `Four-Star ${championName}`,
    `Five-Star ${championName}`,
  ];
  const nextAt = stars >= 5 ? null : goal + (stars + 1) * starStep;
  return {
    stars,
    overGoal,
    label: stars ? starLabels[stars - 1] : "No stars yet",
    shortLabel: stars ? `${championName} +${stars}` : "No stars",
    starText: stars ? "★".repeat(stars) : "☆",
    nextAt,
    nextRemaining: nextAt ? Math.max(0, nextAt - total) : 0,
  };
}

function _normalizeQuizIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function _getQuizRosterPlayers() {
  if (typeof getTeamRoster === "function") return getTeamRoster();
  if (typeof storageManager !== "undefined" && typeof storageManager.get === "function" && typeof STORAGE_KEYS !== "undefined") {
    const stored = storageManager.get(STORAGE_KEYS.TEAM_ROSTER, []);
    return Array.isArray(stored)
      ? stored
        .map((player) => ({
          ...player,
          name: String(player?.name || "").trim(),
          number: String(player?.number || "").trim(),
          position: String(player?.position || "").trim().toUpperCase(),
          accountUsername: String(player?.accountUsername || player?.username || "").trim().toLowerCase(),
        }))
        .filter((player) => player.name)
      : [];
  }
  return [];
}

function _quizRosterPlayerMatches(player, value = "") {
  const target = _normalizeQuizIdentity(value);
  if (!player || !target) return false;
  return [
    player.id,
    player.name,
    player.accountUsername,
    player.username,
  ].some((candidate) => _normalizeQuizIdentity(candidate) === target);
}

function _getQuizRosterPlayerByName(value = "") {
  return _getQuizRosterPlayers().find((player) => _quizRosterPlayerMatches(player, value)) || null;
}

function _getQuizRosterPlayerForCurrentUser() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : (typeof currentAuthUser !== "undefined" ? currentAuthUser : null);
  const username = user?.username || user?.label || "";
  return _getQuizRosterPlayers().find((player) => _normalizeQuizIdentity(player.accountUsername) === _normalizeQuizIdentity(username))
    || _getQuizRosterPlayerByName(username);
}

function _formatQuizRosterMeta(player) {
  if (!player) return "";
  const bits = [];
  if (player.number) bits.push(`#${player.number}`);
  if (player.position) bits.push(player.position);
  if (player.accountUsername) bits.push(`@${player.accountUsername}`);
  return bits.join(" · ");
}

function _buildCoachQuizRosterHealthSummary() {
  const roster = _getQuizRosterPlayers();
  const attempts = _getPlayerQuizAttempts();
  const rewards = _getPlayerRewardEvents();
  const stickers = _getPlayerHelmetStickers();
  const linked = roster.filter((player) => _normalizeQuizIdentity(player.accountUsername));
  const unlinked = roster.filter((player) => !_normalizeQuizIdentity(player.accountUsername));
  const accountMap = new Map();
  roster.forEach((player) => {
    const account = _normalizeQuizIdentity(player.accountUsername);
    if (!account) return;
    if (!accountMap.has(account)) accountMap.set(account, []);
    accountMap.get(account).push(player);
  });
  const duplicateAccounts = Array.from(accountMap.entries())
    .filter(([, players]) => players.length > 1)
    .map(([account, players]) => ({ account, players }));
  const knownRosterIds = new Set();
  roster.forEach((player) => {
    [player.id, player.name, player.accountUsername, player.username].forEach((value) => {
      const normalized = _normalizeQuizIdentity(value);
      if (normalized) knownRosterIds.add(normalized);
    });
  });
  const activeRosterNames = new Set();
  const unknownMap = new Map();
  const addKnownOrUnknown = (kind, rawName, event = {}) => {
    const name = String(rawName || "").trim();
    if (!name) return;
    const rosterPlayer = _getQuizRosterPlayerByName(name);
    if (rosterPlayer) {
      activeRosterNames.add(_normalizeQuizIdentity(rosterPlayer.name));
      return;
    }
    const key = _normalizeQuizIdentity(name);
    if (!key || knownRosterIds.has(key)) return;
    if (!unknownMap.has(key)) {
      unknownMap.set(key, {
        name,
        attempts: 0,
        rewards: 0,
        stickers: 0,
        points: 0,
        latest: "",
      });
    }
    const row = unknownMap.get(key);
    if (kind === "attempt") {
      row.attempts += 1;
      row.points += Number(event.totalPoints || 0);
    } else if (kind === "reward") {
      row.rewards += 1;
      row.points += Number(event.points || 0);
    } else if (kind === "sticker") {
      row.stickers += 1;
    }
    row.latest = _formatQuizProfileDate(event) || row.latest;
  };
  attempts.forEach((attempt) => addKnownOrUnknown("attempt", attempt.player, attempt));
  rewards.forEach((event) => addKnownOrUnknown("reward", event.player, event));
  stickers.forEach((sticker) => addKnownOrUnknown("sticker", sticker.player, sticker));
  const inactive = roster.filter((player) => !activeRosterNames.has(_normalizeQuizIdentity(player.name)));
  const unknownActivity = Array.from(unknownMap.values())
    .sort((a, b) => (b.points - a.points) || a.name.localeCompare(b.name));
  const issueCount = unlinked.length + duplicateAccounts.length + unknownActivity.length;
  return {
    roster,
    attempts,
    rewards,
    stickers,
    linked,
    unlinked,
    duplicateAccounts,
    unknownActivity,
    inactive,
    issueCount,
    status: roster.length ? (issueCount ? "warning" : "good") : "empty",
  };
}

function _renderCoachQuizRosterHealthRows(items, emptyText, rowRenderer, limit = 6) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="coach-quiz-roster-health-empty">${escapeHtml(emptyText)}</div>`;
  }
  const visible = items.slice(0, limit).map(rowRenderer).join("");
  const remaining = items.length > limit
    ? `<div class="coach-quiz-roster-health-more">+${items.length - limit} more</div>`
    : "";
  return `${visible}${remaining}`;
}

function _renderCoachQuizRosterHealthPanel(summary = _buildCoachQuizRosterHealthSummary()) {
  const statusText = summary.status === "good"
    ? "Roster links look clean"
    : summary.status === "empty"
      ? "No roster loaded"
      : `${summary.issueCount} issue${summary.issueCount === 1 ? "" : "s"} to clean up`;
  const playerRow = (player) => `
    <div class="coach-quiz-roster-health-row">
      <strong>${escapeHtml(player.name)}</strong>
      <small>${escapeHtml(_formatQuizRosterMeta(player) || "No linked login")}</small>
    </div>
  `;
  const duplicateRow = (item) => `
    <div class="coach-quiz-roster-health-row">
      <strong>@${escapeHtml(item.account)}</strong>
      <small>${escapeHtml(item.players.map((player) => player.name).join(" · "))}</small>
    </div>
  `;
  const unknownRow = (item) => {
    const parts = [];
    if (item.attempts) parts.push(`${item.attempts} attempt${item.attempts === 1 ? "" : "s"}`);
    if (item.rewards) parts.push(`${item.rewards} reward${item.rewards === 1 ? "" : "s"}`);
    if (item.stickers) parts.push(`${item.stickers} sticker${item.stickers === 1 ? "" : "s"}`);
    if (item.points) parts.push(`${Math.round(item.points)} pts`);
    return `
      <div class="coach-quiz-roster-health-row">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(parts.join(" · ") || "Activity")} · ${escapeHtml(item.latest || "Recently")}</small>
      </div>
    `;
  };
  return `
    <section class="coach-quiz-setup-section coach-quiz-roster-health-panel">
      <div class="coach-quiz-section-head">
        <h3>Roster link health</h3>
        <span>${summary.linked.length}/${summary.roster.length || 0} linked · ${escapeHtml(statusText)}</span>
      </div>
      <div class="coach-quiz-roster-health-summary">
        <span class="${summary.linked.length ? "is-good" : ""}"><strong>${summary.linked.length}</strong><small>Linked accounts</small></span>
        <span class="${summary.unlinked.length ? "is-warning" : "is-good"}"><strong>${summary.unlinked.length}</strong><small>Unlinked roster</small></span>
        <span class="${summary.duplicateAccounts.length ? "is-danger" : "is-good"}"><strong>${summary.duplicateAccounts.length}</strong><small>Duplicate logins</small></span>
        <span class="${summary.unknownActivity.length ? "is-danger" : "is-good"}"><strong>${summary.unknownActivity.length}</strong><small>Unknown activity</small></span>
      </div>
      <div class="coach-quiz-roster-health-grid">
        <article>
          <div class="coach-quiz-roster-health-head">
            <strong>Unlinked roster</strong>
            <span>Needs account</span>
          </div>
          ${_renderCoachQuizRosterHealthRows(summary.unlinked, "Every roster player has a linked login.", playerRow)}
        </article>
        <article>
          <div class="coach-quiz-roster-health-head">
            <strong>Duplicate logins</strong>
            <span>Resolve before scoring</span>
          </div>
          ${_renderCoachQuizRosterHealthRows(summary.duplicateAccounts, "No duplicate roster logins.", duplicateRow)}
        </article>
        <article>
          <div class="coach-quiz-roster-health-head">
            <strong>Unknown activity</strong>
            <span>Not on active roster</span>
          </div>
          ${_renderCoachQuizRosterHealthRows(summary.unknownActivity, "All quiz activity maps to roster players.", unknownRow)}
        </article>
        <article>
          <div class="coach-quiz-roster-health-head">
            <strong>No quiz activity</strong>
            <span>Follow up</span>
          </div>
          ${_renderCoachQuizRosterHealthRows(summary.inactive, "Every roster player has quiz, question, or sticker activity.", playerRow)}
        </article>
      </div>
    </section>
  `;
}

function _formatCoachAwardDate(event = {}) {
  const label = _formatQuizProfileDate(event);
  const coach = String(event.awardedBy || "").trim();
  return coach ? `${label} · ${coach}` : label;
}

function _renderCoachQuizAwardHistoryRows(items, emptyText, rowRenderer) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="coach-quiz-award-history-empty">${escapeHtml(emptyText)}</div>`;
  }
  return items
    .slice()
    .sort((a, b) => _quizEventTimestamp(b) - _quizEventTimestamp(a))
    .slice(0, 12)
    .map(rowRenderer)
    .join("");
}

function _renderCoachQuizAwardHistoryPanel(rewardEvents = [], stickerEvents = []) {
  const pointRows = _renderCoachQuizAwardHistoryRows(
    rewardEvents,
    "No point awards this week.",
    (event) => {
      const pending = !_isQuizRewardApproved(event);
      const typeLabel = _formatQuizQuestionType(event.type || "reward");
      const playerName = _normalizeQuizPlayerName(event.player);
      return `
        <div class="coach-quiz-award-history-row${pending ? " is-pending" : ""}">
          <span class="coach-quiz-award-history-icon" aria-hidden="true">+${Math.round(Number(event.points || 0))}</span>
          <span class="coach-quiz-award-history-main">
            <strong>${escapeHtml(playerName)}</strong>
            <small>${escapeHtml(typeLabel)} · ${Math.round(Number(event.points || 0))} pts${event.note ? ` · ${escapeHtml(event.note)}` : ""}</small>
          </span>
          <span class="coach-quiz-award-status${pending ? " is-pending" : " is-approved"}">${pending ? "Pending approval" : "Approved"}</span>
          <span class="coach-quiz-award-history-meta">${escapeHtml(_formatCoachAwardDate(event))}</span>
          ${pending ? `<button type="button"
            class="btn btn-xs btn-primary"
            data-action="coachApproveQuizReward"
            data-arg="${escapeAttr(event.id || "")}"
            aria-label="Approve ${escapeAttr(typeLabel)} reward for ${escapeAttr(playerName)}">
            Approve
          </button>` : ""}
          <button type="button"
            class="btn btn-xs btn-danger"
            data-action="coachRevokeQuizReward"
            data-arg="${escapeAttr(event.id || "")}"
            aria-label="Revoke ${escapeAttr(typeLabel)} reward from ${escapeAttr(playerName)}">
            Revoke
          </button>
        </div>
      `;
    }
  );
  const stickerRows = _renderCoachQuizAwardHistoryRows(
    stickerEvents,
    "No helmet stickers this week.",
    (sticker) => `
      <div class="coach-quiz-award-history-row">
        <span class="coach-quiz-award-history-icon" aria-hidden="true">${escapeHtml(sticker.icon || "🏅")}</span>
        <span class="coach-quiz-award-history-main">
          <strong>${escapeHtml(_normalizeQuizPlayerName(sticker.player))}</strong>
          <small>${escapeHtml(sticker.label || "Helmet Sticker")}${sticker.note ? ` · ${escapeHtml(sticker.note)}` : ""}</small>
        </span>
        <span class="coach-quiz-award-history-meta">${escapeHtml(_formatCoachAwardDate(sticker))}</span>
        <button type="button"
          class="btn btn-xs btn-danger"
          data-action="coachRevokeHelmetStickerAward"
          data-arg="${escapeAttr(sticker.id || "")}"
          aria-label="Revoke ${escapeAttr(sticker.label || "Helmet Sticker")} sticker from ${escapeAttr(_normalizeQuizPlayerName(sticker.player))}">
          Revoke
        </button>
      </div>
    `
  );
  return `
    <section class="coach-quiz-setup-section coach-quiz-award-history-panel">
      <div class="coach-quiz-section-head">
        <h3>Award history</h3>
        <span>${rewardEvents.length} point awards · ${stickerEvents.length} stickers this week</span>
      </div>
      <div class="coach-quiz-award-history-grid">
        <article>
          <div class="coach-quiz-award-history-head">
            <strong>Point awards</strong>
            <span>Questions, answers, gifts</span>
          </div>
          ${pointRows}
        </article>
        <article>
          <div class="coach-quiz-award-history-head">
            <strong>Helmet stickers</strong>
            <span>Practice awards</span>
          </div>
          ${stickerRows}
        </article>
      </div>
    </section>
  `;
}

function _getQuizPlayerName() {
  const rosterPlayer = _getQuizRosterPlayerForCurrentUser();
  if (rosterPlayer?.name) return rosterPlayer.name;
  if (typeof getCurrentAuthUser === "function") {
    const user = getCurrentAuthUser();
    if (user?.username) return user.username;
  }
  if (typeof currentAuthUser !== "undefined" && currentAuthUser?.username) {
    return currentAuthUser.username;
  }
  return "You";
}

function _normalizeQuizPlayerName(name) {
  const raw = String(name || "").trim();
  if (raw) {
    const rosterPlayer = _getQuizRosterPlayerByName(raw);
    return rosterPlayer?.name || raw;
  }
  return _getQuizPlayerName();
}

function _quizEventId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function _quizCurrentCoachName() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return user?.username || user?.label || _getQuizPlayerName();
}

function _getQuizRewardsForPlayer(player, weekKey = "") {
  const target = _normalizeQuizPlayerName(player);
  return _getPlayerRewardEvents().filter((event) => {
    if (!_isQuizRewardApproved(event)) return false;
    if (_normalizeQuizPlayerName(event.player) !== target) return false;
    return weekKey ? event.weekKey === weekKey : true;
  });
}

function _getQuizStickersForPlayer(player) {
  const target = _normalizeQuizPlayerName(player);
  return _getPlayerHelmetStickers().filter((sticker) => _normalizeQuizPlayerName(sticker.player) === target);
}

function _sumQuizRewards(events, type = "") {
  return (Array.isArray(events) ? events : [])
    .filter((event) => _isQuizRewardApproved(event) && (!type || event.type === type))
    .reduce((sum, event) => sum + Number(event.points || 0), 0);
}

function _isQuizRewardApproved(event = {}) {
  return !event.status || event.status === "approved";
}

function _quizPlayerNameFromAttempt(attempt, fallback = "") {
  return _normalizeQuizPlayerName(attempt?.player || fallback || _getQuizPlayerName());
}

function _quizEventDateKey(event) {
  if (event?.dateKey) return String(event.dateKey);
  const raw = event?.completedAt || event?.savedAt || event?.createdAt || event?.awardedAt || event?.date;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? _quizDateKey(date) : "";
}

function _quizDateFromWeekKey(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() + 1 - day);
  return simple;
}

function _quizPreviousDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - 1);
  return _quizDateKey(date);
}

function _quizPreviousWeekKey(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!match) return "";
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week > 1) return `${year}-W${String(week - 1).padStart(2, "0")}`;
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() - 7);
  return _quizWeekKey(date);
}

function _quizCurrentStreak(keys, currentKey, previousKeyFn) {
  const activeKeys = new Set(Array.from(keys || []).filter(Boolean));
  if (!activeKeys.size) return 0;
  const sortedKeys = Array.from(activeKeys).sort();
  let cursor = activeKeys.has(currentKey) ? currentKey : sortedKeys.at(-1);
  let streak = 0;
  while (cursor && activeKeys.has(cursor)) {
    streak += 1;
    cursor = previousKeyFn(cursor);
  }
  return streak;
}

function _quizActivityDateKeys(attempts, rewards, player) {
  const target = _normalizeQuizPlayerName(player);
  const keys = new Set();
  (Array.isArray(attempts) ? attempts : []).forEach((attempt) => {
    if (_quizPlayerNameFromAttempt(attempt, player) !== target) return;
    const key = _quizEventDateKey(attempt);
    if (key) keys.add(key);
  });
  (Array.isArray(rewards) ? rewards : []).forEach((event) => {
    if (!_isQuizRewardApproved(event)) return;
    if (_normalizeQuizPlayerName(event.player) !== target) return;
    const key = _quizEventDateKey(event);
    if (key) keys.add(key);
  });
  return keys;
}

function _quizActivityWeekKeys(attempts, rewards, player) {
  const target = _normalizeQuizPlayerName(player);
  const keys = new Set();
  (Array.isArray(attempts) ? attempts : []).forEach((attempt) => {
    if (_quizPlayerNameFromAttempt(attempt, player) !== target) return;
    if (attempt.weekKey) keys.add(String(attempt.weekKey));
  });
  (Array.isArray(rewards) ? rewards : []).forEach((event) => {
    if (!_isQuizRewardApproved(event)) return;
    if (_normalizeQuizPlayerName(event.player) !== target) return;
    if (event.weekKey) keys.add(String(event.weekKey));
  });
  return keys;
}

function _buildQuizLeaderboardRows(attempts, rewards, player, weekKey = "") {
  const settings = _getPlayerQuizSettings();
  const totals = new Map();
  const addPoints = (name, points) => {
    const playerName = _normalizeQuizPlayerName(name);
    totals.set(playerName, (totals.get(playerName) || 0) + Number(points || 0));
  };
  const mergeRemotePoints = (name, points) => {
    const playerName = _normalizeQuizPlayerName(name);
    totals.set(playerName, Math.max(totals.get(playerName) || 0, Number(points || 0)));
  };
  (Array.isArray(attempts) ? attempts : []).forEach((attempt) => {
    if (weekKey && attempt.weekKey !== weekKey) return;
    addPoints(attempt.player || player, attempt.totalPoints || 0);
  });
  (Array.isArray(rewards) ? rewards : []).forEach((event) => {
    if (!_isQuizRewardApproved(event)) return;
    if (weekKey && event.weekKey !== weekKey) return;
    addPoints(event.player || player, event.points || 0);
  });
  const remoteRows = typeof window !== "undefined" && typeof window.getRemotePlayerLeaderboardRows === "function"
    ? window.getRemotePlayerLeaderboardRows(weekKey ? "week" : "season")
    : [];
  remoteRows.forEach((row) => {
    mergeRemotePoints(row.name || row.player, row.points ?? row.totalPoints ?? 0);
  });
  _getQuizRosterPlayers().forEach((rosterPlayer) => addPoints(rosterPlayer.name, 0));
  if (!totals.size) totals.set(_normalizeQuizPlayerName(player), 0);
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, points], idx) => ({ name, points, rank: idx + 1, tier: _getQuizTier(points, settings) }));
}

function _quizFilteredAttemptsForView(attempts, weekKey, season = false) {
  return (Array.isArray(attempts) ? attempts : []).filter((attempt) => {
    if (!attempt || typeof attempt !== "object") return false;
    return season || attempt.weekKey === weekKey;
  });
}

function _quizFilteredRewardsForView(rewards, weekKey, season = false) {
  return (Array.isArray(rewards) ? rewards : []).filter((event) => {
    if (!event || typeof event !== "object") return false;
    if (!_isQuizRewardApproved(event)) return false;
    return season || event.weekKey === weekKey;
  });
}

function _formatQuizQuestionType(type) {
  if (type === "responsibility") return "Responsibility";
  if (type === "play_from_rule") return "Rule to Play";
  if (type === "call") return "Call ID";
  return String(type || "Question").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function _summarizeQuizQuestionBreakdown(answers) {
  const summary = {};
  (Array.isArray(answers) ? answers : []).forEach((answer) => {
    const type = answer?.questionType || "call";
    if (!summary[type]) summary[type] = { total: 0, correct: 0, wrong: 0 };
    summary[type].total += 1;
    if (answer.correct) {
      summary[type].correct += 1;
    } else {
      summary[type].wrong += 1;
    }
  });
  return summary;
}

function _quizAddQuestionBreakdown(target, breakdown) {
  Object.entries(breakdown || {}).forEach(([type, stats]) => {
    if (!target[type]) target[type] = { total: 0, correct: 0, wrong: 0 };
    target[type].total += Number(stats?.total || 0);
    target[type].correct += Number(stats?.correct || 0);
    target[type].wrong += Number(stats?.wrong || 0);
  });
}

function _buildCoachQuizLeaderboardSummary() {
  const attempts = _getPlayerQuizAttempts();
  const rewards = _getPlayerRewardEvents();
  const settings = _getPlayerQuizSettings();
  const weekKey = _quizWeekKey(new Date());
  const isSeason = _coachQuizLeaderboardView === "season";
  const viewAttempts = _quizFilteredAttemptsForView(attempts, weekKey, isSeason);
  const viewRewards = _quizFilteredRewardsForView(rewards, weekKey, isSeason);
  const rows = new Map();
  const positionTotals = new Map();
  const questionTotals = {};
  const ensureRow = (name) => {
    const playerName = _normalizeQuizPlayerName(name || "Player");
    if (!rows.has(playerName)) {
      rows.set(playerName, {
        name: playerName,
        quizPoints: 0,
        rewardPoints: 0,
        questionPoints: 0,
        answerPoints: 0,
        giftPoints: 0,
        attempts: 0,
        answered: 0,
        correct: 0,
        stickers: 0,
      });
    }
    return rows.get(playerName);
  };

  viewAttempts.forEach((attempt) => {
    const row = ensureRow(attempt.player || "Player");
    row.quizPoints += Number(attempt.totalPoints || 0);
    row.attempts += 1;
    row.answered += Number(attempt.answered || 0);
    row.correct += Number(attempt.correct || 0);
    const posKey = attempt.positionKey || "unknown";
    const posLabel = attempt.positionLabel || _getQuizPositions().find((position) => position.key === posKey)?.label || "Unknown";
    if (!positionTotals.has(posKey)) {
      positionTotals.set(posKey, { key: posKey, label: posLabel, attempts: 0, answered: 0, correct: 0 });
    }
    const pos = positionTotals.get(posKey);
    pos.attempts += 1;
    pos.answered += Number(attempt.answered || 0);
    pos.correct += Number(attempt.correct || 0);
    _quizAddQuestionBreakdown(questionTotals, attempt.questionBreakdown || {});
  });

  viewRewards.forEach((event) => {
    const row = ensureRow(event.player || "Player");
    const points = Number(event.points || 0);
    row.rewardPoints += points;
    if (event.type === "question") row.questionPoints += points;
    if (event.type === "answer") row.answerPoints += points;
    if (event.type === "gift") row.giftPoints += points;
  });

  _getPlayerHelmetStickers()
    .filter((sticker) => isSeason || sticker.weekKey === weekKey)
    .forEach((sticker) => {
      ensureRow(sticker.player || "Player").stickers += 1;
    });
  const remoteRows = typeof window !== "undefined" && typeof window.getRemotePlayerLeaderboardRows === "function"
    ? window.getRemotePlayerLeaderboardRows(isSeason ? "season" : "week")
    : [];
  remoteRows.forEach((remote) => {
    const row = ensureRow(remote.name || remote.player || "Player");
    const remoteTotal = Number(remote.totalPoints ?? remote.points ?? 0);
    const remoteQuiz = Number(remote.quizPoints ?? 0);
    const remoteReward = Number(remote.rewardPoints ?? Math.max(0, remoteTotal - remoteQuiz));
    row.quizPoints = Math.max(row.quizPoints, remoteQuiz || Math.max(0, remoteTotal - remoteReward));
    row.rewardPoints = Math.max(row.rewardPoints, remoteReward);
    row.questionPoints = Math.max(row.questionPoints, Number(remote.questionPoints || 0));
    row.answerPoints = Math.max(row.answerPoints, Number(remote.answerPoints || 0));
    row.giftPoints = Math.max(row.giftPoints, Number(remote.giftPoints || 0));
    row.attempts = Math.max(row.attempts, Number(remote.attempts || 0));
    row.answered = Math.max(row.answered, Number(remote.answered || 0));
    row.correct = Math.max(row.correct, Number(remote.correct || 0));
    row.stickers = Math.max(row.stickers, Number(remote.stickers || 0));
  });
  _getQuizRosterPlayers().forEach((player) => ensureRow(player.name));

  const leaderboardRows = Array.from(rows.values())
    .map((row) => {
      const totalPoints = row.quizPoints + row.rewardPoints;
      const percent = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
      return { ...row, totalPoints, percent, tier: _getQuizTier(totalPoints, settings) };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.percent - a.percent || a.name.localeCompare(b.name))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));

  const weakPositions = Array.from(positionTotals.values())
    .filter((item) => item.answered > 0 && Math.round((item.correct / item.answered) * 100) < 85)
    .map((item) => ({
      ...item,
      percent: Math.round((item.correct / item.answered) * 100),
      wrong: item.answered - item.correct,
    }))
    .sort((a, b) => a.percent - b.percent || b.wrong - a.wrong)
    .slice(0, 4);

  const weakQuestionTypes = Object.entries(questionTotals)
    .map(([type, stats]) => ({
      type,
      label: _formatQuizQuestionType(type),
      total: Number(stats.total || 0),
      correct: Number(stats.correct || 0),
      wrong: Number(stats.wrong || 0),
      percent: stats.total ? Math.round((Number(stats.correct || 0) / Number(stats.total || 0)) * 100) : 0,
    }))
    .filter((item) => item.total > 0 && item.percent < 85)
    .sort((a, b) => a.percent - b.percent || b.wrong - a.wrong)
    .slice(0, 4);

  return {
    isSeason,
    weekKey,
    label: isSeason ? "Season" : `Week ${weekKey}`,
    attempts: viewAttempts,
    rewards: viewRewards,
    rows: leaderboardRows,
    weakPositions,
    weakQuestionTypes,
    totals: {
      players: leaderboardRows.length,
      attempts: viewAttempts.length,
      quizPoints: leaderboardRows.reduce((sum, row) => sum + row.quizPoints, 0),
      questionPoints: leaderboardRows.reduce((sum, row) => sum + row.questionPoints, 0),
      answerPoints: leaderboardRows.reduce((sum, row) => sum + row.answerPoints, 0),
      giftPoints: leaderboardRows.reduce((sum, row) => sum + row.giftPoints, 0),
      stickers: leaderboardRows.reduce((sum, row) => sum + row.stickers, 0),
    },
  };
}

function _summarizeQuizAttempts() {
  const attempts = _getPlayerQuizAttempts();
  const rewards = _getPlayerRewardEvents();
  const settings = _getPlayerQuizSettings();
  const now = new Date();
  const weekKey = _quizWeekKey(now);
  const todayKey = _quizDateKey(now);
  const player = _getQuizPlayerName();
  const playerAttempts = attempts.filter((attempt) => _quizPlayerNameFromAttempt(attempt, player) === player);
  const weeklyAttempts = playerAttempts.filter((attempt) => attempt.weekKey === weekKey);
  const playerRewards = rewards.filter((event) => _normalizeQuizPlayerName(event.player) === player);
  const weeklyRewards = playerRewards.filter((event) => event.weekKey === weekKey);
  const weeklyQuizPoints = weeklyAttempts.reduce((sum, attempt) => sum + Number(attempt.totalPoints || 0), 0);
  const weeklyRewardPoints = _sumQuizRewards(weeklyRewards);
  const weeklyQuestionPoints = _sumQuizRewards(weeklyRewards, "question");
  const weeklyAnswerPoints = _sumQuizRewards(weeklyRewards, "answer");
  const weeklyGiftPoints = _sumQuizRewards(weeklyRewards, "gift");
  const weeklyPoints = weeklyQuizPoints + weeklyRewardPoints;
  const seasonQuizPoints = playerAttempts.reduce((sum, attempt) => sum + Number(attempt.totalPoints || 0), 0);
  const seasonRewardPoints = _sumQuizRewards(playerRewards);
  const seasonQuestionPoints = _sumQuizRewards(playerRewards, "question");
  const seasonAnswerPoints = _sumQuizRewards(playerRewards, "answer");
  const seasonGiftPoints = _sumQuizRewards(playerRewards, "gift");
  const seasonPoints = seasonQuizPoints + seasonRewardPoints;
  const dailyStreak = _quizCurrentStreak(_quizActivityDateKeys(playerAttempts, playerRewards, player), todayKey, _quizPreviousDateKey);
  const weeklyStreak = _quizCurrentStreak(_quizActivityWeekKeys(playerAttempts, playerRewards, player), weekKey, _quizPreviousWeekKey);
  const bestPercent = playerAttempts.reduce((best, attempt) => Math.max(best, Number(attempt.percent || 0)), 0);
  const bestBadge = _getQuizBadge(bestPercent);
  return {
    attempts,
    rewards,
    player,
    weekKey,
    playerAttempts,
    playerRewards,
    weeklyAttempts,
    weeklyRewards,
    weeklyQuizPoints,
    weeklyRewardPoints,
    weeklyQuestionPoints,
    weeklyAnswerPoints,
    weeklyGiftPoints,
    weeklyPoints,
    seasonQuizPoints,
    seasonRewardPoints,
    seasonQuestionPoints,
    seasonAnswerPoints,
    seasonGiftPoints,
    seasonPoints,
    dailyStreak,
    weeklyStreak,
    bestPercent,
    bestBadge,
    tier: _getQuizTier(weeklyPoints, settings),
    weeklyLeaderboardRows: _buildQuizLeaderboardRows(attempts, rewards, player, weekKey),
    seasonLeaderboardRows: _buildQuizLeaderboardRows(attempts, rewards, player),
  };
}

function _renderPlayerQuizResumeCard(draft, variant = "hub") {
  if (!draft) return "";
  const title = draft.title || "Quiz in progress";
  const meta = _formatQuizDraftMeta(draft);
  const source = draft.sourceType === "gameplan" ? "Game Plan" : "Practice Script";
  const modeLabel = draft.quizMode && draft.quizMode !== "full"
    ? (_getPlayerQuizModes().find((mode) => mode.key === draft.quizMode)?.label || "Quiz")
    : "";
  return `
    <div class="player-quiz-resume-card player-quiz-resume-card--${escapeAttr(variant)}">
      <div>
        <span class="player-quiz-resume-kicker">Pick up where you left off</span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml([source, modeLabel, meta].filter(Boolean).join(" · "))}</small>
      </div>
      <div class="player-quiz-resume-actions">
        <button type="button" class="btn btn-primary" data-action="resumePlayerQuizDraft">Resume</button>
        <button type="button" class="btn btn-outline" data-action="discardPlayerQuizDraft">End Quiz</button>
      </div>
    </div>
  `;
}

function _renderPlayerQuizResumeSlot() {
  const slot = document.getElementById("playerQuizResumeSlot");
  if (!slot) return;
  const draft = _getPlayerQuizDraft();
  slot.hidden = !draft;
  slot.innerHTML = draft ? _renderPlayerQuizResumeCard(draft, "hub") : "";
}

function _renderQuizLeaderRows(rows, player) {
  const safeRows = Array.isArray(rows) && rows.length
    ? rows
    : [{ name: player, points: 0, rank: 1, tier: _getQuizTier(0) }];
  return safeRows
    .map((row) => {
      const rowPoints = Number(row.points ?? row.totalPoints ?? 0);
      const achievement = _getQuizAchievementSummary(rowPoints);
      return `
        <button type="button" class="player-quiz-leader-row" data-action="openPlayerLeaderboardDetail" data-arg="${escapeAttr(row.name)}">
          <span class="player-quiz-rank">#${row.rank}</span>
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(row.tier)}</span>
          <span class="player-quiz-achievement${achievement.stars ? " has-stars" : ""}" aria-label="${escapeAttr(achievement.label)}">${escapeHtml(achievement.stars ? `${achievement.starText} ${achievement.shortLabel}` : "No stars")}</span>
          <b>${Math.round(rowPoints)} pts</b>
        </button>
      `;
    })
    .join("");
}

function _quizEventTimestamp(event = {}) {
  const raw = event.completedAt || event.savedAt || event.createdAt || event.awardedAt || event.date || event.dateKey || "";
  const date = raw ? new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00`) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function _formatQuizProfileDate(event = {}) {
  const key = _quizEventDateKey(event);
  if (key) {
    const date = new Date(`${key}T12:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }
  return event.weekKey ? `Week ${event.weekKey}` : "Recently";
}

function _getPlayerLeaderboardProfileData(player, summary) {
  const name = _normalizeQuizPlayerName(player || summary.player);
  const isSeason = _playerLeaderboardView === "season";
  const leaderboardRows = isSeason ? summary.seasonLeaderboardRows : summary.weeklyLeaderboardRows;
  const row = leaderboardRows.find((item) => _normalizeQuizPlayerName(item.name) === name) || {
    rank: leaderboardRows.length + 1,
    tier: _getQuizTier(0),
    points: 0,
  };
  const rosterPlayer = _getQuizRosterPlayerByName(name);
  const rosterMeta = _formatQuizRosterMeta(rosterPlayer);
  const playerAttempts = summary.attempts.filter((attempt) => _quizPlayerNameFromAttempt(attempt, summary.player) === name);
  const viewAttempts = playerAttempts.filter((attempt) => isSeason || attempt.weekKey === summary.weekKey);
  const seasonRewards = _getQuizRewardsForPlayer(name);
  const viewRewards = isSeason ? seasonRewards : seasonRewards.filter((event) => event.weekKey === summary.weekKey);
  const stickers = _getQuizStickersForPlayer(name);
  const viewStickers = stickers.filter((sticker) => isSeason || sticker.weekKey === summary.weekKey);
  const quizPoints = viewAttempts.reduce((sum, attempt) => sum + Number(attempt.totalPoints || 0), 0);
  const questionPoints = _sumQuizRewards(viewRewards, "question");
  const answerPoints = _sumQuizRewards(viewRewards, "answer");
  const giftPoints = _sumQuizRewards(viewRewards, "gift");
  const bestAttempt = playerAttempts
    .slice()
    .sort((a, b) => (
      Number(b.percent || 0) - Number(a.percent || 0) ||
      Number(b.totalPoints || 0) - Number(a.totalPoints || 0) ||
      _quizEventTimestamp(b) - _quizEventTimestamp(a)
    ))[0] || null;
  const questionTotals = {};
  playerAttempts.forEach((attempt) => _quizAddQuestionBreakdown(questionTotals, attempt.questionBreakdown || {}));
  const weakAreas = Object.entries(questionTotals)
    .map(([type, stats]) => ({
      type,
      label: _formatQuizQuestionType(type),
      total: Number(stats.total || 0),
      correct: Number(stats.correct || 0),
      wrong: Number(stats.wrong || 0),
      percent: stats.total ? Math.round((Number(stats.correct || 0) / Number(stats.total || 0)) * 100) : 0,
    }))
    .filter((item) => item.total > 0 && (item.percent < 85 || item.wrong > 0))
    .sort((a, b) => a.percent - b.percent || b.wrong - a.wrong)
    .slice(0, 4);
  const weekTotals = new Map();
  const addWeekPoints = (weekKey, points) => {
    const key = String(weekKey || summary.weekKey || "Current");
    weekTotals.set(key, (weekTotals.get(key) || 0) + Number(points || 0));
  };
  playerAttempts.forEach((attempt) => addWeekPoints(attempt.weekKey, attempt.totalPoints));
  seasonRewards.forEach((event) => addWeekPoints(event.weekKey, event.points));
  if (!weekTotals.size) weekTotals.set(summary.weekKey, 0);
  const trend = Array.from(weekTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-5)
    .map(([weekKey, points]) => ({ weekKey, points: Math.round(points) }));
  const trendMax = Math.max(1, ...trend.map((item) => item.points));
  const recentActivity = [
    ...playerAttempts.map((attempt) => ({ kind: "quiz", event: attempt, points: Number(attempt.totalPoints || 0) })),
    ...seasonRewards.map((event) => ({ kind: event.type || "reward", event, points: Number(event.points || 0) })),
    ...stickers.map((sticker) => ({ kind: "sticker", event: sticker, points: 0 })),
  ].sort((a, b) => _quizEventTimestamp(b.event) - _quizEventTimestamp(a.event)).slice(0, 8);
  const achievement = _getQuizAchievementSummary(row.points || quizPoints + questionPoints + answerPoints + giftPoints);
  return {
    name,
    isSeason,
    row,
    rosterPlayer,
    rosterMeta,
    playerAttempts,
    viewAttempts,
    viewRewards,
    stickers,
    viewStickers,
    quizPoints,
    questionPoints,
    answerPoints,
    giftPoints,
    totalPoints: quizPoints + questionPoints + answerPoints + giftPoints,
    detailLabel: isSeason ? "this season" : "this week",
    bestAttempt,
    weakAreas,
    trend,
    trendMax,
    recentActivity,
    achievement,
  };
}

function _renderPlayerLeaderboardStickerList(stickers, emptyText = "No helmet stickers yet.") {
  return stickers.length
    ? stickers.map((sticker) => {
      const stickerType = _getPlayerHelmetStickerType(sticker.stickerKey, sticker.label);
      const description = String(sticker.description || stickerType?.description || sticker.note || "").trim();
      const title = [sticker.label || "Sticker", description, sticker.note ? `Coach note: ${sticker.note}` : ""].filter(Boolean).join(" - ");
      return `
        <span class="player-leaderboard-sticker player-leaderboard-sticker--${escapeAttr(sticker.color || stickerType?.color || "blue")}" title="${escapeAttr(title)}">
          <b aria-hidden="true">${escapeHtml(sticker.icon || stickerType?.icon || "🏅")}</b>
          <span>
            <strong>${escapeHtml(sticker.label || stickerType?.label || "Sticker")}</strong>
            ${description ? `<small>${escapeHtml(description)}</small>` : ""}
          </span>
        </span>
      `;
    }).join("")
    : `<span class="player-leaderboard-no-stickers">${escapeHtml(emptyText)}</span>`;
}

function _renderPlayerLeaderboardDetail(player, summary) {
  const profile = _getPlayerLeaderboardProfileData(player, summary);
  const stickers = profile.viewStickers.slice(-12).reverse();
  return `
    <section class="player-leaderboard-detail" id="playerLeaderboardDetail" aria-label="${escapeAttr(profile.name)} leaderboard detail">
      <div class="player-leaderboard-section-head">
        <div>
          <h3>${escapeHtml(profile.name)}</h3>
          ${profile.rosterMeta ? `<p>${escapeHtml(profile.rosterMeta)}</p>` : ""}
        </div>
        <span>${Math.round(profile.totalPoints)} pts ${escapeHtml(profile.detailLabel)}</span>
      </div>
      <div class="player-leaderboard-profile-grid">
        <span><strong>#${Math.round(profile.row.rank || 1)}</strong><small>Rank</small></span>
        <span><strong>${escapeHtml(profile.row.tier || _getQuizTier(profile.row.points || 0))}</strong><small>Tier</small></span>
        <span><strong>${profile.viewAttempts.length}</strong><small>Quiz tries</small></span>
        <span><strong>${stickers.length}</strong><small>Stickers</small></span>
      </div>
      <div class="player-leaderboard-breakdown">
        <span><strong>${Math.round(profile.quizPoints)}</strong><small>Quiz</small></span>
        <span><strong>${Math.round(profile.questionPoints)}</strong><small>Questions</small></span>
        <span><strong>${Math.round(profile.answerPoints)}</strong><small>Answers</small></span>
        <span><strong>${Math.round(profile.giftPoints)}</strong><small>Gifted</small></span>
      </div>
      <div class="player-leaderboard-stickers">${_renderPlayerLeaderboardStickerList(stickers)}</div>
    </section>
  `;
}

function _renderPlayerLeaderboardProfileModal(profile) {
  const settings = _getPlayerQuizSettings();
  const championName = _getQuizTierName("champion", settings);
  const best = profile.bestAttempt;
  const bestHtml = best
    ? `
      <article class="player-profile-card player-profile-card--best">
        <span>Best quiz</span>
        <strong>${escapeHtml(best.title || "Quiz")}</strong>
        <p>${Math.round(Number(best.percent || 0))}% · ${Number(best.correct || 0)}/${Number(best.answered || 0)} right · ${Math.round(Number(best.totalPoints || 0))} pts</p>
      </article>
    `
    : `
      <article class="player-profile-card player-profile-card--best">
        <span>Best quiz</span>
        <strong>No attempts yet</strong>
        <p>Start with a script or game plan quiz to build the profile.</p>
      </article>
    `;
  const weakHtml = profile.weakAreas.length
    ? profile.weakAreas.map((area) => `
      <div class="player-profile-weak-row">
        <strong>${escapeHtml(area.label)}</strong>
        <span>${area.percent}%</span>
        <small>${area.wrong} miss${area.wrong === 1 ? "" : "es"} on ${area.total} question${area.total === 1 ? "" : "s"}</small>
      </div>
    `).join("")
    : `<div class="player-profile-empty">No weak trend yet. Keep stacking reps.</div>`;
  const trendHtml = profile.trend.map((item) => `
    <span class="player-profile-trend-bar" data-height="${Math.max(8, Math.round((item.points / profile.trendMax) * 100))}">
      <i></i>
      <b>${item.points}</b>
      <small>${escapeHtml(item.weekKey.replace(/^\\d{4}-W/, "W"))}</small>
    </span>
  `).join("");
  const rewardHistory = profile.viewRewards.slice().sort((a, b) => _quizEventTimestamp(b) - _quizEventTimestamp(a)).slice(0, 8);
  const rewardHtml = rewardHistory.length
    ? rewardHistory.map((event) => `
      <div class="player-profile-history-row">
        <strong>${escapeHtml(_formatQuizQuestionType(event.type || "reward"))}</strong>
        <span>${Math.round(Number(event.points || 0))} pts</span>
        <small>${escapeHtml(_formatQuizProfileDate(event))}${event.note ? ` · ${escapeHtml(event.note)}` : ""}</small>
      </div>
    `).join("")
    : `<div class="player-profile-empty">No question or answer rewards ${escapeHtml(profile.detailLabel)}.</div>`;
  const activityHtml = profile.recentActivity.length
    ? profile.recentActivity.map((item) => {
      const event = item.event || {};
      let label = "Activity";
      let detail = "";
      if (item.kind === "quiz") {
        label = event.completed === false ? "Ended quiz" : "Quiz";
        detail = `${event.title || "Quiz"} · ${Number(event.correct || 0)}/${Number(event.answered || 0)} right`;
      } else if (item.kind === "sticker") {
        label = "Helmet sticker";
        detail = `${event.icon || "🏅"} ${event.label || "Sticker"}${event.note ? ` · ${event.note}` : ""}`;
      } else {
        label = _formatQuizQuestionType(item.kind);
        detail = `${Math.round(Number(item.points || 0))} points`;
      }
      return `
        <div class="player-profile-activity-row">
          <strong>${escapeHtml(label)}</strong>
          <span>${item.points ? `${Math.round(item.points)} pts` : escapeHtml(_formatQuizProfileDate(event))}</span>
          <small>${escapeHtml(detail)}</small>
        </div>
      `;
    }).join("")
    : `<div class="player-profile-empty">No recent profile activity.</div>`;
  return `
    <div class="player-leaderboard-profile-panel" id="playerLeaderboardProfilePanel" role="document">
      <header class="player-profile-header">
        <div>
          <span class="player-leaderboard-kicker">Player profile</span>
          <h2>${escapeHtml(profile.name)}</h2>
          ${profile.rosterMeta ? `<p>${escapeHtml(profile.rosterMeta)}</p>` : ""}
        </div>
        <button type="button" class="modal-close" data-action="closePlayerLeaderboardProfile" aria-label="Close player profile">×</button>
      </header>
      <div class="player-profile-body">
        <section class="player-profile-summary" aria-label="Player leaderboard summary">
          <span><strong>#${Math.round(profile.row.rank || 1)}</strong><small>Rank</small></span>
          <span><strong>${escapeHtml(profile.row.tier || _getQuizTier(profile.row.points || 0))}</strong><small>Tier</small></span>
          <span><strong>${Math.round(profile.totalPoints)}</strong><small>Points ${escapeHtml(profile.detailLabel)}</small></span>
          <span><strong>${escapeHtml(profile.achievement.stars ? profile.achievement.starText : String(profile.stickers.length))}</strong><small>${profile.achievement.stars ? "Stars" : "Stickers"}</small></span>
        </section>
        <section class="player-profile-grid">
          <article class="player-profile-card player-profile-card--achievement">
            <span>${escapeHtml(championName)} stars</span>
            <strong>${escapeHtml(profile.achievement.label)}</strong>
            <p>${profile.achievement.stars ? `${Math.round(profile.achievement.overGoal)} points above ${escapeHtml(championName)}. ${profile.achievement.nextRemaining ? `${Math.round(profile.achievement.nextRemaining)} to the next star.` : "Max local star level reached."}` : `Reach ${settings.weeklyGoal} weekly points, then keep going to earn stars.`}</p>
          </article>
          ${bestHtml}
          <article class="player-profile-card">
            <span>Season trend</span>
            <div class="player-profile-trend">${trendHtml}</div>
          </article>
          <article class="player-profile-card">
            <span>Weak areas</span>
            <div class="player-profile-weak-list">${weakHtml}</div>
          </article>
          <article class="player-profile-card">
            <span>Reward history</span>
            <div class="player-profile-history">${rewardHtml}</div>
          </article>
          <article class="player-profile-card player-profile-card--wide">
            <span>Helmet stickers</span>
            <div class="player-leaderboard-stickers">${_renderPlayerLeaderboardStickerList(profile.stickers.slice(-16).reverse(), "No helmet stickers yet.")}</div>
          </article>
          <article class="player-profile-card player-profile-card--wide">
            <span>Recent activity</span>
            <div class="player-profile-history">${activityHtml}</div>
          </article>
        </section>
      </div>
    </div>
  `;
}

function openPlayerLeaderboardProfile(playerName) {
  const summary = _summarizeQuizAttempts();
  const profile = _getPlayerLeaderboardProfileData(playerName, summary);
  let overlay = document.getElementById("playerLeaderboardProfileOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "playerLeaderboardProfileOverlay";
    overlay.className = "player-leaderboard-profile-overlay";
    overlay.dataset.action = "closePlayerLeaderboardProfileOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Player leaderboard profile");
    document.body.appendChild(overlay);
  }
  setInnerHTML(overlay, _renderPlayerLeaderboardProfileModal(profile));
  overlay.querySelectorAll(".player-profile-trend-bar").forEach((bar) => {
    const height = Math.max(8, Math.min(100, Number(bar.dataset.height || 0)));
    const fill = bar.querySelector("i");
    if (fill) fill.style.height = `${height}%`;
  });
  overlay.hidden = false;
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "player-leaderboard-profile",
      scrollElement: "playerLeaderboardProfilePanel",
      blocking: true,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
  }
  overlay.querySelector("[data-action='closePlayerLeaderboardProfile']")?.focus();
}

function closePlayerLeaderboardProfile() {
  const overlay = document.getElementById("playerLeaderboardProfileOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") {
    closeLayer("player-leaderboard-profile");
  }
  overlay.hidden = true;
}

function openPlayerLeaderboardDetail(playerName) {
  _leaderboardSelectedPlayer = _normalizeQuizPlayerName(playerName);
  renderPlayerLeaderboardPage();
  openPlayerLeaderboardProfile(_leaderboardSelectedPlayer);
}

function setPlayerLeaderboardView(view) {
  _playerLeaderboardView = view === "season" ? "season" : "week";
  renderPlayerLeaderboardPage();
}

function renderPlayerLeaderboardPage() {
  const page = document.getElementById("playerLeaderboardPage");
  if (!page) return;
  const summary = _summarizeQuizAttempts();
  const settings = _getPlayerQuizSettings();
  const draft = _getPlayerQuizDraft();
  if (!_leaderboardSelectedPlayer) _leaderboardSelectedPlayer = summary.player;
  const isSeason = _playerLeaderboardView === "season";
  const viewLabel = isSeason ? "Season" : `Week ${summary.weekKey}`;
  const viewAttempts = isSeason ? summary.playerAttempts : summary.weeklyAttempts;
  const viewQuizPoints = isSeason ? summary.seasonQuizPoints : summary.weeklyQuizPoints;
  const viewQuestionPoints = isSeason ? summary.seasonQuestionPoints : summary.weeklyQuestionPoints;
  const viewAnswerPoints = isSeason ? summary.seasonAnswerPoints : summary.weeklyAnswerPoints;
  const viewGiftPoints = isSeason ? summary.seasonGiftPoints : summary.weeklyGiftPoints;
  const viewPoints = isSeason ? summary.seasonPoints : summary.weeklyPoints;
  const viewRows = isSeason ? summary.seasonLeaderboardRows : summary.weeklyLeaderboardRows;
  const viewTier = _getQuizTier(viewPoints, settings);
  const achievement = _getQuizAchievementSummary(summary.weeklyPoints, settings);
  const championName = _getQuizTierName("champion", settings);
  const recentAttempts = viewAttempts.slice(-5).reverse();
  const goalPct = Math.min(100, Math.round((summary.weeklyPoints / settings.weeklyGoal) * 100));
  const remaining = Math.max(0, settings.weeklyGoal - summary.weeklyPoints);
  const badgeFloor = Math.min(settings.honorRollMin, settings.highHonorRollMin, settings.coachesListMin);
  const syncMeta = typeof window !== "undefined" && typeof window.getRemotePlayerLeaderboardMeta === "function"
    ? window.getRemotePlayerLeaderboardMeta()
    : null;
  const syncLabel = syncMeta?.synced
    ? "Team synced"
    : "Local board";
  const recentHtml = recentAttempts.length
    ? recentAttempts.map((attempt) => `
        <div class="player-leaderboard-attempt${attempt.completed === false ? " is-partial" : ""}">
          <div>
            <strong>${escapeHtml(attempt.title || "Quiz")}</strong>
            <small>${escapeHtml(attempt.sourceType === "gameplan" ? "Game Plan" : "Script")} · ${attempt.correct}/${attempt.answered} right${attempt.remaining ? ` · ${attempt.remaining} left` : ""}</small>
          </div>
          <span>${Math.round(attempt.totalPoints || 0)} pts</span>
        </div>
      `).join("")
    : `<div class="player-leaderboard-empty">No quiz attempts yet. Start with your current practice or game plan.</div>`;

  setInnerHTML(page, `
    <div class="player-leaderboard-shell">
      <section class="player-leaderboard-hero">
        <div>
          <span class="player-leaderboard-kicker">Leaderboard</span>
          <h2>${isSeason ? "Season points and weekly pace" : "Quiz points and weekly standard"}</h2>
          <p>${isSeason ? "Track the whole season while still chasing the weekly standard." : `Get to ${settings.weeklyGoal} points this week. Game Plan quizzes count ${settings.gameplanWeight}x.`}</p>
        </div>
        <button type="button" class="btn btn-primary" data-action="openPlayerQuizHub">Start Quiz</button>
      </section>
      ${draft ? _renderPlayerQuizResumeCard(draft, "page") : ""}
      <div class="player-leaderboard-view-toggle" role="group" aria-label="Leaderboard view">
        <button type="button" class="${!isSeason ? "is-active" : ""}" data-action="setPlayerLeaderboardView" data-arg="week">Week</button>
        <button type="button" class="${isSeason ? "is-active" : ""}" data-action="setPlayerLeaderboardView" data-arg="season">Season</button>
      </div>
      <section class="player-leaderboard-grid" aria-label="Quiz progress">
        <article class="player-leaderboard-card player-leaderboard-card--goal">
          <span>${isSeason ? "Season Points" : "Weekly Goal"}</span>
          <strong>${isSeason ? Math.round(summary.seasonPoints) : `${Math.round(summary.weeklyPoints)} / ${settings.weeklyGoal}`}</strong>
          <div class="player-leaderboard-meter" aria-hidden="true"><i class="player-leaderboard-meter-fill"></i></div>
          <small>${isSeason ? `${Math.round(summary.weeklyPoints)} / ${settings.weeklyGoal} this week` : (remaining ? `${Math.round(remaining)} points to ${escapeHtml(championName)}` : (achievement.stars ? `${escapeHtml(achievement.shortLabel)} · ${Math.round(achievement.overGoal)} above` : `${escapeHtml(championName)} standard met`))}</small>
        </article>
        <article class="player-leaderboard-card player-leaderboard-card--tier">
          <span>Current Tier</span>
          <strong>${escapeHtml(viewTier)}</strong>
          <small>${viewAttempts.length} attempt${viewAttempts.length === 1 ? "" : "s"} ${isSeason ? "this season" : "this week"}</small>
        </article>
        <article class="player-leaderboard-card player-leaderboard-card--achievement">
          <span>${escapeHtml(championName)} Stars</span>
          <strong>${escapeHtml(achievement.stars ? achievement.starText : "0")}</strong>
          <small>${achievement.stars ? `${escapeHtml(achievement.shortLabel)}${achievement.nextRemaining ? ` · ${Math.round(achievement.nextRemaining)} to next` : ""}` : `${Math.round(settings.weeklyGoal + Math.max(100, settings.weeklyGoal * 0.25))} unlocks star 1`}</small>
        </article>
        <article class="player-leaderboard-card player-leaderboard-card--badge">
          <span>Best Badge</span>
          <strong>${summary.bestPercent ? escapeHtml(summary.bestBadge.label) : "No attempts"}</strong>
          <small>${summary.bestPercent ? `${Math.round(summary.bestPercent)}% best score` : `${badgeFloor}% unlocks bonuses`}</small>
        </article>
        <article class="player-leaderboard-card player-leaderboard-card--streak">
          <span>Streaks</span>
          <strong>${summary.dailyStreak} day${summary.dailyStreak === 1 ? "" : "s"}</strong>
          <small>${summary.weeklyStreak} week${summary.weeklyStreak === 1 ? "" : "s"} active</small>
        </article>
      </section>
      <section class="player-leaderboard-board">
        <div class="player-leaderboard-section-head">
          <h3>Point sources</h3>
          <span>${escapeHtml(viewLabel)}</span>
        </div>
        <div class="player-leaderboard-breakdown">
          <span><strong>${Math.round(viewQuizPoints)}</strong><small>Quiz</small></span>
          <span><strong>${Math.round(viewQuestionPoints)}</strong><small>Questions</small></span>
          <span><strong>${Math.round(viewAnswerPoints)}</strong><small>Answers</small></span>
          <span><strong>${Math.round(viewGiftPoints)}</strong><small>Gifted</small></span>
        </div>
      </section>
      <section class="player-leaderboard-board">
        <div class="player-leaderboard-section-head">
          <h3>${isSeason ? "Season board" : "Weekly board"}</h3>
          <span>${escapeHtml(syncLabel)} · tap a name for stickers</span>
        </div>
        <div class="player-quiz-leaderboard-preview">${_renderQuizLeaderRows(viewRows, summary.player)}</div>
      </section>
      ${_renderPlayerLeaderboardDetail(_leaderboardSelectedPlayer, summary)}
      <section class="player-leaderboard-board">
        <div class="player-leaderboard-section-head">
          <h3>${isSeason ? "Season attempts" : "Recent attempts"}</h3>
          <span>Completed and ended quizzes</span>
        </div>
        <div class="player-leaderboard-attempts">${recentHtml}</div>
      </section>
    </div>
  `);
  const meterFill = page.querySelector(".player-leaderboard-meter-fill");
  if (meterFill) meterFill.style.width = `${goalPct}%`;
}

function _quizUniquePlaysFromList(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter((play) => play && !play.isSeparator)
    .filter((play, idx) => {
      const sig = typeof playSignature === "function"
        ? playSignature(play)
        : `${_quizPlainCall(play)}::${idx}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
}

function _quizCompletenessStats(playList) {
  const playsForSource = _quizUniquePlaysFromList(playList);
  const totals = {
    playCount: playsForSource.length,
    diagrams: 0,
    rules: 0,
    notes: 0,
    situation: 0,
    defense: 0,
  };
  playsForSource.forEach((play) => {
    if (
      window.playImages &&
      typeof window.playImages.hasForPlay === "function" &&
      window.playImages.hasForPlay(play)
    ) {
      totals.diagrams += 1;
    }
    if (_getQuizPositions().some((position) => String(play[position.key] || "").trim())) {
      totals.rules += 1;
    }
    if (String(play.playerNotes || play.respNotes || play.notes || "").trim()) {
      totals.notes += 1;
    }
    if (
      String(play.preferredDown || "").trim() ||
      String(play.preferredDistance || "").trim() ||
      String(play.preferredFieldPosition || "").trim() ||
      String(play.preferredHash || "").trim() ||
      String(play.preferredSituation || "").trim()
    ) {
      totals.situation += 1;
    }
    if (
      String(play.practiceFront || "").trim() ||
      String(play.practiceDefense || "").trim() ||
      String(play.practiceCoverage || "").trim() ||
      String(play.practiceBlitz || "").trim() ||
      String(play.practiceStunt || "").trim()
    ) {
      totals.defense += 1;
    }
  });
  const pct = (value) => totals.playCount ? Math.round((value / totals.playCount) * 100) : 0;
  const score = totals.playCount
    ? Math.round(
      pct(totals.diagrams) * 0.22 +
      pct(totals.rules) * 0.30 +
      pct(totals.notes) * 0.16 +
      pct(totals.situation) * 0.16 +
      pct(totals.defense) * 0.16,
    )
    : 0;
  return {
    ...totals,
    diagramPct: pct(totals.diagrams),
    rulePct: pct(totals.rules),
    notePct: pct(totals.notes),
    situationPct: pct(totals.situation),
    defensePct: pct(totals.defense),
    score,
  };
}

function _quizCompletenessChipItems(stats = {}) {
  const total = Number(stats.playCount || 0);
  const chip = (key, label, value, pct, readyAt = 70) => ({
    key,
    label,
    value: `${Number(value || 0)}/${total}`,
    tone: !total ? "empty" : Number(pct || 0) >= readyAt ? "ready" : Number(value || 0) ? "partial" : "missing",
  });
  return [
    chip("diagrams", "Diagrams", stats.diagrams, stats.diagramPct, 70),
    chip("rules", "Rules", stats.rules, stats.rulePct, 80),
    chip("notes", "Notes", stats.notes, stats.notePct, 50),
    chip("defense", "Defense", stats.defense, stats.defensePct, 60),
    chip("metadata", "Metadata", stats.situation, stats.situationPct, 70),
  ];
}

function _renderQuizCompletenessChips(stats = {}, className = "quiz-completeness-chips") {
  return `
    <div class="${escapeAttr(className)}" aria-label="Quiz source completeness">
      ${_quizCompletenessChipItems(stats).map((item) => `
        <span class="quiz-completeness-chip quiz-completeness-chip--${escapeAttr(item.tone)}">
          <strong>${escapeHtml(item.label)}</strong>
          <small>${escapeHtml(item.value)}</small>
        </span>
      `).join("")}
    </div>
  `;
}

function _quizReadinessLabel(score) {
  if (score >= 88) return { label: "Player ready", tone: "ready" };
  if (score >= 68) return { label: "Close", tone: "close" };
  if (score >= 40) return { label: "Needs work", tone: "needs" };
  return { label: "Thin", tone: "thin" };
}

function _quizReadinessActions(stats, extras = {}) {
  const actions = [];
  if (!stats.playCount) actions.push("Add plays before publishing a quiz.");
  if (stats.rulePct < 80) actions.push("Write more player rules by position.");
  if (stats.diagramPct < 70) actions.push("Attach diagrams so visual questions can work.");
  if (stats.notePct < 50) actions.push("Add coach notes for teaching feedback.");
  if (stats.situationPct < 70) actions.push("Fill down, distance, field zone, or hash metadata.");
  if (stats.defensePct < 60) actions.push("Add defensive front/coverage tags for context.");
  if (extras.needsVisibility) actions.push("Turn on Player login for this script.");
  if (extras.bucketCount !== undefined && extras.bucketCount < 2) actions.push("Add plays to more Game Plan buckets.");
  return actions.slice(0, 4);
}

function _quizMetric(label, value, total) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `
    <div class="coach-quiz-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${value}/${total}</strong>
      <i aria-hidden="true"><b data-pct="${pct}"></b></i>
    </div>
  `;
}

function _getCoachQuizGamePlanSources() {
  const boards = typeof _gpLoadBoards === "function"
    ? _gpLoadBoards()
    : storageManager.get(STORAGE_KEYS.GAME_PLAN_BOARDS, {});
  return Object.entries(boards && typeof boards === "object" ? boards : {})
    .map(([key, board]) => {
      const assignments = board?.assignments && typeof board.assignments === "object" ? board.assignments : {};
      const playsForBoard = [];
      let bucketCount = 0;
      Object.entries(assignments).forEach(([boxId, list]) => {
        if (boxId === "holding") return;
        const clean = Array.isArray(list) ? list.filter((play) => play && !play.isSeparator) : [];
        if (clean.length) bucketCount += 1;
        clean.forEach((play) => playsForBoard.push(play));
      });
      const title = board?.sheetTitle || key || "Game Plan";
      return {
        id: key,
        title,
        subtitle: key === "__unassigned__" ? "Unassigned board" : key,
        plays: playsForBoard,
        bucketCount,
      };
    })
    .filter((source) => source.plays.length || source.id !== "__unassigned__");
}

function _getCoachQuizScriptSources() {
  return (typeof getSavedScripts === "function" ? getSavedScripts() : [])
    .map((savedScript) => {
      const stats = typeof getSavedScriptStats === "function" ? getSavedScriptStats(savedScript) : {};
      return {
        id: String(savedScript.id || ""),
        title: savedScript.name || "Saved Script",
        subtitle: savedScript.date || stats.dateStr || "No date",
        plays: savedScript.plays || [],
        playerVisible: typeof isSavedScriptPlayerVisible === "function"
          ? isSavedScriptPlayerVisible(savedScript)
          : Boolean(savedScript.playerVisible),
        playCount: stats.playCount || 0,
        periodCount: stats.periodCount || 0,
      };
    });
}

function _findCoachQuizPlaybookTarget(play) {
  if (!play || !Array.isArray(plays)) return { play: null, index: -1, match: "" };
  const source = typeof findPlaybookSourceForPlay === "function"
    ? findPlaybookSourceForPlay(play, plays)
    : null;
  if (source) return { play: source, index: plays.indexOf(source), match: "source-id" };

  const matchIdx = plays.findIndex((candidate) => candidate === play || (typeof playsMatch === "function" && playsMatch(candidate, play)));
  if (matchIdx >= 0) return { play: plays[matchIdx], index: matchIdx, match: "call-match" };
  return { play: null, index: -1, match: "" };
}

function _coachQuizPlayRepairIssues(play) {
  const issues = [];
  const sourceStatus = typeof getPlaySourceStatus === "function"
    ? getPlaySourceStatus(play, plays)
    : { state: "local" };
  const target = _findCoachQuizPlaybookTarget(play);
  const hasDiagram = Boolean(
    window.playImages &&
    typeof window.playImages.hasForPlay === "function" &&
    (window.playImages.hasForPlay(play) || (target.play && window.playImages.hasForPlay(target.play)))
  );

  if (!hasDiagram) issues.push({ label: "Missing diagram", tone: "danger" });
  if (!_getQuizPositions().some((position) => String(play?.[position.key] || "").trim())) {
    issues.push({ label: "Missing player rules", tone: "warning" });
  }
  if (!String(play?.playerNotes || play?.respNotes || play?.notes || "").trim()) {
    issues.push({ label: "Missing coach note", tone: "warning" });
  }
  if (!String(play?.preferredDown || play?.preferredDistance || play?.preferredFieldPosition || play?.preferredHash || play?.preferredSituation || "").trim()) {
    issues.push({ label: "Missing situation", tone: "muted" });
  }
  if (!String(play?.practiceFront || play?.practiceDefense || play?.practiceCoverage || play?.practiceBlitz || play?.practiceStunt || "").trim()) {
    issues.push({ label: "Missing defense", tone: "muted" });
  }
  if (sourceStatus.state === "missing") {
    issues.unshift({ label: "Source missing", tone: "danger" });
  } else if (sourceStatus.state === "changed") {
    issues.unshift({ label: "Source updated", tone: "warning" });
  } else if (!target.play) {
    issues.unshift({ label: "No playbook match", tone: "danger" });
  } else if (target.match === "call-match") {
    issues.push({ label: "Matched by call", tone: "muted" });
  }
  return issues;
}

function _renderCoachQuizRepairRow(play, idx) {
  const target = _findCoachQuizPlaybookTarget(play);
  const issues = _coachQuizPlayRepairIssues(play);
  const issueHtml = issues.length
    ? issues.map((issue) => `<span class="coach-quiz-repair-chip coach-quiz-repair-chip--${escapeAttr(issue.tone)}">${escapeHtml(issue.label)}</span>`).join("")
    : `<span class="coach-quiz-repair-chip coach-quiz-repair-chip--ready">Ready</span>`;
  const call = _quizShortCall(play);
  const masterCall = target.play ? _quizShortCall(target.play) : "";
  return `
    <article class="coach-quiz-repair-row">
      <div class="coach-quiz-repair-row-main">
        <strong>${escapeHtml(call)}</strong>
        <small>${target.play
    ? `Edits save to Playbook${masterCall && masterCall !== call ? `: ${masterCall}` : ""}.`
    : "This script copy is not linked to a playbook play."}</small>
        <div class="coach-quiz-repair-chip-row">${issueHtml}</div>
      </div>
      <button type="button"
        class="btn btn-sm ${target.play ? "btn-primary" : "btn-outline"}"
        data-action="openCoachQuizRepairPlayEditor"
        data-arg="${escapeAttr(String(target.index))}"
        ${target.play ? "" : "disabled"}>
        Edit Playbook
      </button>
    </article>
  `;
}

function _renderCoachQuizSourceRepairBody(source) {
  const stats = _quizCompletenessStats(source?.plays || []);
  const readiness = _quizReadinessLabel(stats.score);
  const sourcePlays = _quizUniquePlaysFromList(source?.plays || []);
  return `
    <div class="coach-quiz-repair-summary">
      <span><strong>${stats.score}</strong><small>${escapeHtml(readiness.label)}</small></span>
      <span><strong>${stats.diagrams}/${stats.playCount}</strong><small>Diagrams</small></span>
      <span><strong>${stats.rules}/${stats.playCount}</strong><small>Rules</small></span>
      <span><strong>${stats.notes}/${stats.playCount}</strong><small>Notes</small></span>
    </div>
    <p class="coach-quiz-repair-note">Open a play below to fix the master Playbook record. Saved script copies may still need to be republished if they were captured before the playbook was cleaned up.</p>
    <div class="coach-quiz-repair-list">
      ${sourcePlays.length
    ? sourcePlays.map((play, idx) => _renderCoachQuizRepairRow(play, idx)).join("")
    : `<div class="coach-quiz-empty">No plays found in this script source.</div>`}
    </div>
  `;
}

let _coachQuizRepairSourceArg = "";

function _getCoachQuizSourceFromArg(arg = "") {
  const [kind, ...rest] = String(arg || "").split(":");
  const id = rest.join(":");
  if (kind === "script") {
    return { kind, source: _getCoachQuizScriptSources().find((source) => String(source.id) === id) || null };
  }
  if (kind === "gameplan") {
    return { kind, source: _getCoachQuizGamePlanSources().find((source) => String(source.id) === id) || null };
  }
  return { kind: "", source: null };
}

function openCoachQuizSourceRepair(arg = "") {
  const { kind, source } = _getCoachQuizSourceFromArg(arg);
  if (kind !== "script" || !source) {
    showToast("Open a saved script source to repair quiz plays.", { type: "warning" });
    return;
  }
  _coachQuizRepairSourceArg = `script:${source.id}`;
  document.getElementById("coachQuizRepairOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "coachQuizRepairOverlay";
  overlay.className = "custom-modal-overlay visible coach-quiz-repair-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "coachQuizRepairTitle");
  overlay.dataset.action = "closeCoachQuizSourceRepairOverlay";
  setInnerHTML(overlay, `
    <div class="custom-modal coach-quiz-repair-modal">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🧩</span>
        <div>
          <h3 class="custom-modal-title" id="coachQuizRepairTitle">Fix quiz source plays</h3>
          <p class="coach-quiz-repair-subtitle">${escapeHtml(source.title)} · ${escapeHtml(source.subtitle || "")}</p>
        </div>
        <button type="button" class="btn btn-sm" data-action="closeCoachQuizSourceRepair" aria-label="Close quiz source repair">✕</button>
      </div>
      <div class="custom-modal-body coach-quiz-repair-body" id="coachQuizRepairBody">
        ${_renderCoachQuizSourceRepairBody(source)}
      </div>
      <div class="custom-modal-actions">
        <button type="button" class="btn" data-action="closeCoachQuizSourceRepair">Done</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closeCoachQuizSourceRepair() {
  const overlay = document.getElementById("coachQuizRepairOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function openCoachQuizRepairPlayEditor(masterIdxStr = "") {
  const masterIdx = parseInt(masterIdxStr, 10);
  if (!Number.isFinite(masterIdx) || !Array.isArray(plays) || !plays[masterIdx]) {
    showToast("Could not find that play in the playbook.", { type: "warning" });
    return;
  }
  const play = plays[masterIdx];
  let filteredIdx = Array.isArray(filteredPlays) ? filteredPlays.indexOf(play) : -1;
  if (filteredIdx < 0) {
    filteredPlays = [...plays];
    filteredIdx = filteredPlays.indexOf(play);
  }
  if (filteredIdx < 0 || typeof openPlayEditor !== "function") return;

  const repairOverlay = document.getElementById("coachQuizRepairOverlay");
  if (repairOverlay) repairOverlay.classList.remove("visible");

  if (typeof window.closePlayEditor === "function" && !window.closePlayEditor.__coachQuizRepairWrapped) {
    const originalClose = window.closePlayEditor;
    const wrapped = function coachQuizRepairPatchedClosePlayEditor(...args) {
      const result = originalClose.apply(this, args);
      window.closePlayEditor = originalClose;
      try {
        renderCoachQuizSetupPage();
        const overlay = document.getElementById("coachQuizRepairOverlay");
        const body = document.getElementById("coachQuizRepairBody");
        const { source } = _getCoachQuizSourceFromArg(_coachQuizRepairSourceArg);
        if (overlay && body && source) {
          setInnerHTML(body, _renderCoachQuizSourceRepairBody(source));
          overlay.classList.add("visible");
          if (typeof trapFocus === "function") trapFocus(overlay);
        }
      } catch (_e) { /* keep editor close resilient */ }
      return result;
    };
    wrapped.__coachQuizRepairWrapped = true;
    window.closePlayEditor = wrapped;
  }

  requestAnimationFrame(() => {
    openPlayEditor(filteredIdx);
    requestAnimationFrame(() => {
      const body = document.getElementById("playEditorBody");
      const respBody = body?.querySelector(".pb-resp-body");
      const respToggle = body?.querySelector(".pb-resp-toggle");
      if (respBody) respBody.classList.remove("collapsed");
      if (respToggle) {
        respToggle.setAttribute("aria-expanded", "true");
        const icon = respToggle.querySelector(".toggle-icon");
        if (icon) icon.textContent = "▼";
      }
      const firstRule = document.getElementById("pe-respQ");
      if (firstRule) firstRule.scrollIntoView({ block: "center" });
    });
  });
}

function _coachQuizQuestionPreviewStats(playList) {
  const sourcePlays = _quizUniquePlaysFromList(playList);
  const position = _getQuizPosition();
  const positionKey = position?.key || "";
  const positionLabel = position?.label || "Player";
  const calls = new Set();
  const rules = new Set();
  let playsWithRule = 0;
  let playsWithDiagram = 0;
  sourcePlays.forEach((play) => {
    const call = _quizPlainCall(play).toLowerCase();
    if (call) calls.add(call);
    const rule = _quizCleanText(positionKey ? play[positionKey] : "");
    if (rule) {
      playsWithRule += 1;
      rules.add(rule.toLowerCase());
    }
    if (
      window.playImages &&
      typeof window.playImages.hasForPlay === "function" &&
      window.playImages.hasForPlay(play)
    ) {
      playsWithDiagram += 1;
    }
  });
  const responsibilityReady = rules.size >= 4 ? playsWithRule : 0;
  const playFromRuleReady = playsWithRule && calls.size >= 2 ? playsWithRule : 0;
  return {
    positionLabel,
    playCount: sourcePlays.length,
    calls: calls.size,
    playsWithRule,
    uniqueRules: rules.size,
    playsWithDiagram,
    responsibilityReady,
    playFromRuleReady,
    callIdReady: sourcePlays.length,
  };
}

function _coachQuizPreviewRow(label, count, note, tone = "") {
  return `
    <div class="coach-quiz-preview-row${tone ? ` coach-quiz-preview-row--${escapeAttr(tone)}` : ""}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(String(count))}</span>
      <small>${escapeHtml(note)}</small>
    </div>
  `;
}

function _getCoachQuizModeRecommendation(source, kind = "script") {
  const playList = source?.plays || [];
  const stats = _quizCompletenessStats(playList);
  const preview = _coachQuizQuestionPreviewStats(playList);
  if (!stats.playCount) {
    return {
      label: "Add plays first",
      tone: "needs",
      detail: "This source needs at least one play before a player mode can run.",
      support: [],
    };
  }
  if (kind === "gameplan") {
    return {
      label: "Game Plan Check",
      tone: stats.playCount >= 2 ? "ready" : "planned",
      detail: stats.playCount >= 2
        ? "Best fit because players are studying this week's plan."
        : "Usable, but add one more call for better choices.",
      support: [
        `${stats.playCount} game-plan call${stats.playCount === 1 ? "" : "s"}`,
        stats.rules ? `${stats.rules} with player rules` : "rules optional",
      ],
    };
  }
  if (preview.playsWithDiagram) {
    return {
      label: "Diagram Drill",
      tone: stats.diagramPct >= 50 ? "ready" : "planned",
      detail: "Best fit because visual questions are the clearest player rep.",
      support: [
        `${preview.playsWithDiagram}/${preview.playCount} with diagrams`,
        preview.playsWithRule ? `${preview.playsWithRule} with ${preview.positionLabel} rules` : "rule fallback available",
      ],
    };
  }
  if (preview.playsWithRule) {
    return {
      label: "Know Your Job",
      tone: preview.uniqueRules >= 2 ? "ready" : "planned",
      detail: `Best fit because ${preview.positionLabel} responsibilities are present.`,
      support: [
        `${preview.playsWithRule}/${preview.playCount} with ${preview.positionLabel} rules`,
        preview.uniqueRules >= 4 ? "multiple-choice ready" : `${preview.uniqueRules} unique rule${preview.uniqueRules === 1 ? "" : "s"}`,
      ],
    };
  }
  return {
    label: "Quick Hits",
    tone: stats.playCount >= 2 ? "planned" : "needs",
    detail: "Use easy mixed reps until diagrams or player rules are added.",
    support: [
      `${stats.playCount} call${stats.playCount === 1 ? "" : "s"}`,
      stats.playCount >= 2 ? "can run short recognition reps" : "add another call for choices",
    ],
  };
}

function _renderCoachQuizModeRecommendation(source, kind) {
  const recommendation = _getCoachQuizModeRecommendation(source, kind);
  return `
    <div class="coach-quiz-mode-recommendation coach-quiz-mode-recommendation--${escapeAttr(recommendation.tone)}">
      <span>Recommended mode</span>
      <strong>${escapeHtml(recommendation.label)}</strong>
      <small>${escapeHtml(recommendation.detail)}</small>
      ${recommendation.support.length
    ? `<div>${recommendation.support.map((item) => `<b>${escapeHtml(item)}</b>`).join("")}</div>`
    : ""}
    </div>
  `;
}

function _renderCoachQuizQuestionPreview(source) {
  const preview = _coachQuizQuestionPreviewStats(source.plays);
  const responsibilityNote = preview.responsibilityReady
    ? `${preview.positionLabel} rules are varied enough for multiple-choice responsibility questions.`
    : preview.playsWithRule
      ? `Needs 4 unique ${preview.positionLabel} rules; currently ${preview.uniqueRules}.`
      : `No ${preview.positionLabel} rules found yet.`;
  const ruleToPlayNote = preview.playFromRuleReady
    ? "Players can match a responsibility rule back to the right call."
    : "Needs player rules plus at least 2 distinct calls.";
  const diagramNote = preview.playsWithDiagram
    ? "Redacted diagram questions can fill in when player rules are missing."
    : "Add diagrams before visual questions can work.";
  return `
    <div class="coach-quiz-question-preview">
      <div class="coach-quiz-question-preview-head">
        <strong>Question preview</strong>
        <span>${escapeHtml(preview.positionLabel)} position</span>
      </div>
      <div class="coach-quiz-preview-grid">
        ${_coachQuizPreviewRow("Responsibility", preview.responsibilityReady, responsibilityNote, preview.responsibilityReady ? "ready" : "needs")}
        ${_coachQuizPreviewRow("Rule → Play", preview.playFromRuleReady, ruleToPlayNote, preview.playFromRuleReady ? "ready" : "needs")}
        ${_coachQuizPreviewRow("Call ID", preview.callIdReady, "Fallback for thin sources; works with distinct calls.", preview.callIdReady ? "ready" : "needs")}
        ${_coachQuizPreviewRow("Diagram ID", preview.playsWithDiagram, diagramNote, preview.playsWithDiagram ? "ready" : "needs")}
      </div>
    </div>
  `;
}

function _renderCoachQuizSourceControls(source, kind, stats) {
  const state = _getQuizSourceState(kind, source);
  const status = _quizSourceStateLabel(state, stats);
  const sourceArg = `${kind}:${source.id}`;
  const button = (nextState, label) => `
    <button type="button"
      class="btn btn-xs ${state === nextState ? "btn-primary" : "btn-outline"}"
      data-action="setCoachQuizSourceState"
      data-arg="${escapeAttr(`${sourceArg}:${nextState}`)}"
      aria-pressed="${state === nextState ? "true" : "false"}">
      ${escapeHtml(label)}
    </button>
  `;
  const helper = state === "available"
    ? "Players can choose this quiz source."
    : state === "locked"
      ? "Players can see this is locked, but cannot start it yet."
      : "Hidden from player quiz choices.";
  return `
    <div class="coach-quiz-source-controls">
      <span class="coach-quiz-source-status coach-quiz-source-status--${escapeAttr(status.tone)}">${escapeHtml(status.label)}</span>
      <div class="coach-quiz-source-control-actions" role="group" aria-label="${escapeAttr(source.title)} quiz publishing">
        ${button("available", "Available")}
        ${button("locked", "Locked")}
        ${button("coach", "Coach-only")}
      </div>
      <small>${escapeHtml(helper)}</small>
    </div>
  `;
}

function _renderCoachQuizSourceCard(source, kind) {
  const stats = _quizCompletenessStats(source.plays);
  const readiness = _quizReadinessLabel(stats.score);
  const actions = _quizReadinessActions(stats, {
    needsVisibility: kind === "script" && !source.playerVisible,
    bucketCount: kind === "gameplan" ? source.bucketCount : undefined,
  });
  const meta = kind === "script"
    ? `${source.playCount || stats.playCount} plays · ${source.periodCount || 0} periods · ${source.playerVisible ? "Player visible" : "Not player visible"}`
    : `${stats.playCount} plays · ${source.bucketCount || 0} populated buckets`;
  const canRepair = kind === "script" && ["needs", "thin"].includes(readiness.tone);
  const scoreRing = canRepair
    ? `<button type="button"
        class="coach-quiz-score-ring coach-quiz-score-ring-btn"
        data-tone="${escapeAttr(readiness.tone)}"
        data-action="openCoachQuizSourceRepair"
        data-arg="${escapeAttr(`${kind}:${source.id}`)}"
        aria-label="Open ${escapeAttr(readiness.label)} play repair list for ${escapeAttr(source.title)}">
        <strong>${stats.score}</strong>
        <span>${escapeHtml(readiness.label)}</span>
      </button>`
    : `<div class="coach-quiz-score-ring" data-tone="${escapeAttr(readiness.tone)}">
        <strong>${stats.score}</strong>
        <span>${escapeHtml(readiness.label)}</span>
      </div>`;
  return `
    <article class="coach-quiz-source-card coach-quiz-source-card--${escapeAttr(readiness.tone)}">
      <div class="coach-quiz-source-head">
        <div>
          <span class="coach-quiz-source-kind">${kind === "gameplan" ? "Game Plan" : "Practice Script"}</span>
          <h3>${escapeHtml(source.title)}</h3>
          <p>${escapeHtml(source.subtitle || meta)}</p>
        </div>
        ${scoreRing}
      </div>
      <div class="coach-quiz-source-meta">${escapeHtml(meta)}</div>
      ${_renderCoachQuizSourceControls(source, kind, stats)}
      ${_renderCoachQuizModeRecommendation(source, kind)}
      ${_renderQuizCompletenessChips(stats, "quiz-completeness-chips coach-quiz-completeness-chips")}
      <div class="coach-quiz-metrics">
        ${_quizMetric("Diagrams", stats.diagrams, stats.playCount)}
        ${_quizMetric("Rules", stats.rules, stats.playCount)}
        ${_quizMetric("Notes", stats.notes, stats.playCount)}
        ${_quizMetric("Situation", stats.situation, stats.playCount)}
        ${_quizMetric("Defense", stats.defense, stats.playCount)}
      </div>
      ${_renderCoachQuizQuestionPreview(source)}
      <div class="coach-quiz-next-actions">
        <strong>Next best work</strong>
        ${actions.length
      ? `<ul>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>`
      : `<p>This source is ready for player quizzes.</p>`}
        ${canRepair ? `<button type="button" class="btn btn-sm btn-outline" data-action="openCoachQuizSourceRepair" data-arg="${escapeAttr(`${kind}:${source.id}`)}">Review plays</button>` : ""}
      </div>
    </article>
  `;
}

function _renderCoachStickerButtons() {
  return _getPlayerHelmetStickerTypes().map((sticker) => `
    <button type="button"
      class="coach-quiz-sticker-btn coach-quiz-sticker-btn--${escapeAttr(sticker.color)}"
      data-action="coachAwardHelmetSticker"
      data-arg="${escapeAttr(sticker.key)}">
      <span aria-hidden="true">${escapeHtml(sticker.icon)}</span>
      <strong>${escapeHtml(sticker.label)}</strong>
      ${sticker.description ? `<small>${escapeHtml(sticker.description)}</small>` : ""}
    </button>
  `).join("");
}

function _getCustomHelmetStickerTypes() {
  return _getPlayerHelmetStickerTypes().filter((sticker) => sticker.custom);
}

function _renderCoachCustomStickerManager() {
  const customStickers = _getCustomHelmetStickerTypes();
  if (!customStickers.length) {
    return `
      <div class="coach-quiz-custom-sticker-empty">
        Custom stickers will appear here after you add one.
      </div>
    `;
  }
  return `
    <div class="coach-quiz-custom-sticker-manager" aria-label="Custom helmet sticker library">
      <span class="coach-quiz-custom-sticker-title">Custom sticker library</span>
      ${customStickers.map((sticker) => `
        <div class="coach-quiz-custom-sticker-row">
          <span class="coach-quiz-custom-sticker-icon" aria-hidden="true">${escapeHtml(sticker.icon)}</span>
          <span class="coach-quiz-custom-sticker-copy">
            <strong>${escapeHtml(sticker.label)}</strong>
            ${sticker.description ? `<small>${escapeHtml(sticker.description)}</small>` : ""}
          </span>
          <span class="coach-quiz-custom-sticker-actions">
            <button type="button" class="btn btn-xs btn-outline" data-action="coachEditHelmetSticker" data-arg="${escapeAttr(sticker.key)}" aria-label="Edit ${escapeAttr(sticker.label)}">Edit</button>
            <button type="button" class="btn btn-xs btn-danger" data-action="coachDeleteHelmetSticker" data-arg="${escapeAttr(sticker.key)}" aria-label="Delete ${escapeAttr(sticker.label)}">Delete</button>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function _renderCoachQuizSettingsPanel(settings = _getPlayerQuizSettings()) {
  const enabled = new Set(settings.enabledQuestionTypes || []);
  const field = (id, label, value, attrs = "") => `
    <label class="coach-quiz-setting-field" for="${escapeAttr(id)}">
      <span>${escapeHtml(label)}</span>
      <input id="${escapeAttr(id)}" type="number" value="${escapeAttr(value)}" ${attrs}>
    </label>
  `;
  const textField = (id, label, value, attrs = "") => `
    <label class="coach-quiz-setting-field" for="${escapeAttr(id)}">
      <span>${escapeHtml(label)}</span>
      <input id="${escapeAttr(id)}" type="text" value="${escapeAttr(value)}" ${attrs}>
    </label>
  `;
  const toggle = (id, label, value, note) => `
    <label class="coach-quiz-type-toggle" for="${escapeAttr(id)}">
      <input id="${escapeAttr(id)}" type="checkbox" value="${escapeAttr(value)}" ${enabled.has(value) ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(note)}</small>
      </span>
    </label>
  `;
  return `
    <section class="coach-quiz-setup-section coach-quiz-settings-panel" aria-label="Quiz settings">
      <div class="coach-quiz-section-head">
        <h3>Quiz settings</h3>
        <span>${settings.weeklyGoal} point goal · Script ${settings.scriptWeight}x · Game Plan ${settings.gameplanWeight}x</span>
      </div>
      <div class="coach-quiz-settings-grid">
        <article>
          <span>Goals and pacing</span>
          <div class="coach-quiz-setting-fields">
            ${field("coachQuizWeeklyGoal", "Weekly goal", settings.weeklyGoal, 'min="250" max="5000" step="50"')}
            ${field("coachQuizBaseCorrectPoints", "Correct answer points", settings.baseCorrectPoints, 'min="1" max="50" step="1"')}
            ${field("coachQuizMinBonusAnswers", "Min answers for bonus", settings.minBonusAnswers, 'min="1" max="50" step="1"')}
          </div>
        </article>
        <article>
          <span>Tier names</span>
          <div class="coach-quiz-setting-fields coach-quiz-setting-fields--pairs">
            ${textField("coachQuizTierChampion", "100% goal", _getQuizTierName("champion", settings), 'maxlength="32" autocomplete="off"')}
            ${textField("coachQuizTierBaller", "75% goal", _getQuizTierName("baller", settings), 'maxlength="32" autocomplete="off"')}
            ${textField("coachQuizTierStarter", "50% goal", _getQuizTierName("starter", settings), 'maxlength="32" autocomplete="off"')}
            ${textField("coachQuizTierContributor", "25% goal", _getQuizTierName("contributor", settings), 'maxlength="32" autocomplete="off"')}
            ${textField("coachQuizTierDefense", "Below 25%", _getQuizTierName("defense", settings), 'maxlength="32" autocomplete="off"')}
          </div>
        </article>
        <article>
          <span>Source weights</span>
          <div class="coach-quiz-setting-fields">
            ${field("coachQuizScriptWeight", "Script weight", settings.scriptWeight, 'min="0.25" max="5" step="0.05"')}
            ${field("coachQuizGameplanWeight", "Game Plan weight", settings.gameplanWeight, 'min="0.25" max="5" step="0.05"')}
          </div>
        </article>
        <article>
          <span>Honor bonuses</span>
          <div class="coach-quiz-setting-fields coach-quiz-setting-fields--pairs">
            ${field("coachQuizHonorRollMin", "Honor Roll %", settings.honorRollMin, 'min="50" max="100" step="1"')}
            ${field("coachQuizHonorRollBonus", "Honor Roll pts", settings.honorRollBonus, 'min="0" max="500" step="5"')}
            ${field("coachQuizHighHonorRollMin", "High Honor %", settings.highHonorRollMin, 'min="50" max="100" step="1"')}
            ${field("coachQuizHighHonorRollBonus", "High Honor pts", settings.highHonorRollBonus, 'min="0" max="500" step="5"')}
            ${field("coachQuizCoachesListMin", "Coaches List %", settings.coachesListMin, 'min="50" max="100" step="1"')}
            ${field("coachQuizCoachesListBonus", "Coaches List pts", settings.coachesListBonus, 'min="0" max="500" step="5"')}
          </div>
        </article>
        <article>
          <span>Reward points and caps</span>
          <div class="coach-quiz-setting-fields coach-quiz-setting-fields--pairs">
            ${field("coachQuizQuestionPoints", "Question pts", settings.questionPoints, 'min="0" max="250" step="5"')}
            ${field("coachQuizAnswerPoints", "Answer pts", settings.answerPoints, 'min="0" max="250" step="5"')}
            ${field("coachQuizGiftPoints", "Gift pts", settings.giftPoints, 'min="0" max="500" step="5"')}
            ${field("coachQuizDailyRewardCap", "Daily cap", settings.dailyRewardCap, 'min="0" max="1000" step="25"')}
            ${field("coachQuizWeeklyRewardCap", "Weekly cap", settings.weeklyRewardCap, 'min="0" max="3000" step="25"')}
          </div>
        </article>
      </div>
      <div class="coach-quiz-question-type-settings">
        ${toggle("coachQuizTypeResponsibility", "Responsibility", "responsibility", "Player matches their rule on a known call.")}
        ${toggle("coachQuizTypeRuleToPlay", "Rule to Play", "play_from_rule", "Player sees a rule and picks the call.")}
        ${toggle("coachQuizTypeDiagram", "Diagram ID", "diagram", "Player sees a redacted diagram and picks the call.")}
        ${toggle("coachQuizTypeCall", "Call ID", "call", "Fallback that keeps thin sources usable.")}
      </div>
      <div class="coach-quiz-settings-actions">
        <button type="button" class="btn btn-primary" data-action="coachSaveQuizSettings">Save Settings</button>
        <button type="button" class="btn btn-outline" data-action="coachResetQuizSettings">Reset Defaults</button>
      </div>
    </section>
  `;
}

function _renderCoachQuizPositionPicker() {
  const current = _getQuizPosition();
  return `
    <section class="coach-quiz-preview-toolbar">
      <div>
        <span class="coach-quiz-kicker">Question Preview</span>
        <h3>Preview by player position</h3>
        <p>Use this to catch sources that will only create call-ID questions because player rules are missing for a position.</p>
      </div>
      <div class="coach-quiz-position-picker" role="group" aria-label="Question preview position">
        ${_getQuizPositions().map((position) => `
          <button type="button"
            class="coach-quiz-position-btn${position.key === current?.key ? " is-active" : ""}"
            data-action="setCoachQuizPreviewPosition"
            data-arg="${escapeAttr(position.key)}"
            aria-pressed="${position.key === current?.key ? "true" : "false"}">
            ${escapeHtml(position.label)}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function setCoachQuizPreviewPosition(key) {
  const next = _getQuizPositions().find((position) => position.key === key);
  if (!next) return;
  _quizPositionKey = next.key;
  renderCoachQuizSetupPage();
}

function setCoachQuizLeaderboardView(view) {
  _coachQuizLeaderboardView = view === "season" ? "season" : "week";
  renderCoachQuizSetupPage();
}

function selectCoachQuizLeaderboardPlayer(playerName) {
  _leaderboardSelectedPlayer = _normalizeQuizPlayerName(playerName);
  renderCoachQuizSetupPage();
}

function _renderCoachQuizLeaderboardRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return `<div class="coach-quiz-empty">No quiz attempts yet. Player results will appear here after they take quizzes.</div>`;
  }
  return rows.slice(0, 10).map((row) => {
    const selected = _normalizeQuizPlayerName(row.name) === _normalizeQuizPlayerName(_leaderboardSelectedPlayer || "");
    const achievement = _getQuizAchievementSummary(row.totalPoints || 0);
    return `
      <button type="button"
        class="coach-quiz-leader-row${selected ? " is-selected" : ""}"
        data-action="selectCoachQuizLeaderboardPlayer"
        data-arg="${escapeAttr(row.name)}">
        <span class="coach-quiz-leader-rank">#${row.rank}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.tier)} · ${row.percent || 0}%</span>
        <span class="coach-quiz-achievement${achievement.stars ? " has-stars" : ""}">${escapeHtml(achievement.stars ? `${achievement.starText} ${achievement.shortLabel}` : "No stars")}</span>
        <b>${Math.round(row.totalPoints)} pts</b>
      </button>
    `;
  }).join("");
}

function _renderCoachQuizWeakList(items, emptyText) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="coach-quiz-weak-empty">${escapeHtml(emptyText)}</div>`;
  }
  return items.map((item) => `
    <div class="coach-quiz-weak-row">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${Math.round(item.percent || 0)}%</span>
      <small>${Math.round(item.correct || 0)}/${Math.round(item.total || item.answered || 0)} correct · ${Math.round(item.wrong || 0)} miss${Number(item.wrong || 0) === 1 ? "" : "es"}</small>
    </div>
  `).join("");
}

function _renderCoachQuizLeaderboardPanel(summary) {
  const topPlayer = summary.rows[0];
  const selectedPlayer = _leaderboardSelectedPlayer || topPlayer?.name || "";
  const selected = summary.rows.find((row) => _normalizeQuizPlayerName(row.name) === _normalizeQuizPlayerName(selectedPlayer));
  const selectedMeta = selected
    ? `${selected.attempts} attempt${selected.attempts === 1 ? "" : "s"} · ${Math.round(selected.quizPoints)} quiz pts · ${Math.round(selected.rewardPoints)} reward pts`
    : "Select a player to stage reward prompts faster.";
  return `
    <section class="coach-quiz-setup-section coach-quiz-leaderboard-panel">
      <div class="coach-quiz-section-head">
        <h3>Leaderboard review</h3>
        <span>${escapeHtml(summary.label)} · ${summary.totals.players} players · ${summary.totals.attempts} attempts</span>
      </div>
      <div class="coach-quiz-leaderboard-toolbar">
        <div class="coach-quiz-view-toggle" role="group" aria-label="Coach leaderboard view">
          <button type="button" class="${!summary.isSeason ? "is-active" : ""}" data-action="setCoachQuizLeaderboardView" data-arg="week">Week</button>
          <button type="button" class="${summary.isSeason ? "is-active" : ""}" data-action="setCoachQuizLeaderboardView" data-arg="season">Season</button>
        </div>
        <div class="coach-quiz-selected-player">
          <strong>${selected ? escapeHtml(selected.name) : "No player selected"}</strong>
          <span>${escapeHtml(selectedMeta)}</span>
        </div>
      </div>
      <div class="coach-quiz-leaderboard-summary">
        <span><strong>${Math.round(summary.totals.quizPoints)}</strong><small>Quiz pts</small></span>
        <span><strong>${Math.round(summary.totals.questionPoints)}</strong><small>Question pts</small></span>
        <span><strong>${Math.round(summary.totals.answerPoints)}</strong><small>Answer pts</small></span>
        <span><strong>${Math.round(summary.totals.giftPoints)}</strong><small>Gift pts</small></span>
        <span><strong>${Math.round(summary.totals.stickers)}</strong><small>Stickers</small></span>
      </div>
      <div class="coach-quiz-leaderboard-grid">
        <div class="coach-quiz-leaderboard-list">${_renderCoachQuizLeaderboardRows(summary.rows)}</div>
        <div class="coach-quiz-weak-card">
          <div class="coach-quiz-weak-head">
            <strong>Weak positions</strong>
            <span>Under 85%</span>
          </div>
          ${_renderCoachQuizWeakList(summary.weakPositions, "No weak position trend yet.")}
        </div>
        <div class="coach-quiz-weak-card">
          <div class="coach-quiz-weak-head">
            <strong>Weak question types</strong>
            <span>Under 85%</span>
          </div>
          ${_renderCoachQuizWeakList(summary.weakQuestionTypes, "No weak question-type trend yet.")}
        </div>
      </div>
    </section>
  `;
}

function _showCoachRosterRewardPicker(defaultName = "") {
  return new Promise((resolve) => {
    const roster = _getQuizRosterPlayers();
    if (!roster.length) {
      resolve(null);
      return;
    }
    const previouslyFocused = document.activeElement;
    const defaultPlayer = _getQuizRosterPlayerByName(defaultName);
    const modalId = `coachRosterRewardPicker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sortedRoster = roster
      .map((player) => ({
        ...player,
        isRecommended: Boolean(defaultPlayer && player.id === defaultPlayer.id),
      }))
      .sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended) || a.name.localeCompare(b.name));
    const rowsHtml = sortedRoster.map((player) => {
      const meta = _formatQuizRosterMeta(player) || "Roster player";
      const search = [
        player.name,
        player.number,
        player.position,
        player.accountUsername,
        player.positionGroup,
      ].join(" ").toLowerCase();
      return `
        <button type="button"
          class="coach-roster-picker-row${player.isRecommended ? " is-recommended" : ""}"
          data-player-name="${escapeAttr(player.name)}"
          data-search="${escapeAttr(search)}">
          <span class="coach-roster-picker-avatar">${escapeHtml(player.number ? `#${player.number}` : "ID")}</span>
          <span class="coach-roster-picker-main">
            <strong>${escapeHtml(player.name)}</strong>
            <small>${escapeHtml(meta)}</small>
          </span>
          ${player.isRecommended ? '<span class="coach-roster-picker-badge">Selected</span>' : ""}
        </button>
      `;
    }).join("");
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal custom-modal-wide coach-roster-picker-modal" role="dialog" aria-modal="true" aria-labelledby="${modalId}-title">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">👤</span>
          <h3 class="custom-modal-title" id="${modalId}-title">Award Roster Player</h3>
        </div>
        <div class="coach-roster-picker-body">
          <p>Search the active roster. Rewards and stickers can only attach to these linked roster names.</p>
          <input type="search"
            class="coach-roster-picker-search"
            placeholder="Search name, #, POS, or login"
            aria-label="Search active roster players" />
          <div class="coach-roster-picker-list">${rowsHtml}</div>
          <div class="coach-roster-picker-empty" hidden>No active roster player matches that search.</div>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector(".coach-roster-picker-search");
    const rows = Array.from(overlay.querySelectorAll(".coach-roster-picker-row"));
    const empty = overlay.querySelector(".coach-roster-picker-empty");

    function close(value) {
      overlay.classList.remove("visible");
      setTimeout(() => {
        overlay.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === "function") {
          previouslyFocused.focus();
        }
      }, 200);
      resolve(value);
    }

    function updateFilter() {
      const query = String(searchInput?.value || "").trim().toLowerCase();
      let visibleCount = 0;
      rows.forEach((row) => {
        const matches = !query || String(row.dataset.search || "").includes(query);
        row.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      if (empty) empty.hidden = visibleCount > 0;
    }

    rows.forEach((row) => {
      row.addEventListener("click", () => close(_normalizeQuizPlayerName(row.dataset.playerName || "")));
    });
    searchInput?.addEventListener("input", updateFilter);
    searchInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const firstVisible = rows.find((row) => !row.hidden);
      if (!firstVisible) return;
      event.preventDefault();
      close(_normalizeQuizPlayerName(firstVisible.dataset.playerName || ""));
    });
    overlay.querySelector(".custom-modal-cancel")?.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
      }
    });

    if (typeof trapFocus === "function") trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    setTimeout(() => searchInput?.focus(), 0);
  });
}

async function _coachPromptRewardPlayer(defaultName = "") {
  const roster = _getQuizRosterPlayers();
  if (roster.length) {
    return _showCoachRosterRewardPicker(defaultName);
  }
  if (typeof showModal === "function") {
    await showModal("Add players to the active roster first, then assign stickers and points from that roster.", {
      title: "Roster Required",
      icon: "📋",
    });
  } else if (typeof showToast === "function") {
    showToast("Add active roster players before awarding points.", { type: "warning" });
  }
  return null;
}

async function coachCreateHelmetSticker() {
  if (typeof showPrompt !== "function") return;
  const label = await showPrompt("Name this helmet sticker.", "", {
    title: "Sticker Label",
    icon: "🏅",
    placeholder: "Film Junkie",
  });
  if (label === null) return;
  const safeLabel = String(label || "").trim();
  if (!safeLabel) {
    showToast("Sticker needs a name.", { type: "warning" });
    return;
  }
  const icon = await showPrompt("Choose one emoji for the sticker.", "🏅", {
    title: safeLabel,
    icon: "😀",
    placeholder: "🏅",
  });
  if (icon === null) return;
  const description = await showPrompt("What does this sticker mean?", "", {
    title: "Sticker Description",
    icon: String(icon || "🏅").trim() || "🏅",
    placeholder: "Watched film and asked sharp questions.",
  });
  if (description === null) return;
  const colorChoices = ["blue", "green", "gold", "red", "purple", "navy"].map((color) => ({
    label: color.charAt(0).toUpperCase() + color.slice(1),
    value: color,
  }));
  const color = typeof showListPicker === "function"
    ? await showListPicker("Choose how this sticker should pop on the leaderboard.", colorChoices, {
      title: "Sticker Color",
      icon: String(icon || "🏅").trim() || "🏅",
    })
    : "blue";
  if (color === null) return;
  const currentTypes = _getPlayerHelmetStickerTypes();
  const customTypes = currentTypes.filter((sticker) => sticker.custom);
  const normalized = _normalizeHelmetStickerType({
    label: safeLabel,
    icon,
    description,
    color,
    custom: true,
  });
  const duplicate = currentTypes.find((sticker) => sticker.key === normalized.key);
  if (duplicate) {
    showToast("That sticker already exists.", { type: "warning" });
    return;
  }
  customTypes.push(normalized);
  _savePlayerHelmetStickerTypes(customTypes);
  renderCoachQuizSetupPage();
  showToast(`${safeLabel} sticker added.`, { type: "success" });
}

async function coachEditHelmetSticker(stickerKey = "") {
  if (typeof showPrompt !== "function") return;
  const currentTypes = _getPlayerHelmetStickerTypes();
  const customTypes = currentTypes.filter((sticker) => sticker.custom);
  const sticker = customTypes.find((item) => item.key === stickerKey);
  if (!sticker) {
    showToast("Only custom stickers can be edited.", { type: "warning" });
    return;
  }
  const label = await showPrompt("Update the sticker name.", sticker.label, {
    title: "Edit Sticker Label",
    icon: sticker.icon || "🏅",
    placeholder: "Film Junkie",
    confirmText: "Save",
  });
  if (label === null) return;
  const safeLabel = String(label || "").trim();
  if (!safeLabel) {
    showToast("Sticker needs a name.", { type: "warning" });
    return;
  }
  const icon = await showPrompt("Choose one emoji for the sticker.", sticker.icon || "🏅", {
    title: safeLabel,
    icon: "😀",
    placeholder: "🏅",
    confirmText: "Save",
  });
  if (icon === null) return;
  const description = await showPrompt("Update what this sticker means.", sticker.description || "", {
    title: "Edit Sticker Description",
    icon: String(icon || sticker.icon || "🏅").trim() || "🏅",
    placeholder: "Watched film and asked sharp questions.",
    confirmText: "Save",
  });
  if (description === null) return;
  const colorChoices = ["blue", "green", "gold", "red", "purple", "navy"].map((color) => ({
    label: color.charAt(0).toUpperCase() + color.slice(1),
    value: color,
    recommended: color === sticker.color,
  }));
  const color = typeof showListPicker === "function"
    ? await showListPicker("Choose how this sticker should pop on the leaderboard.", colorChoices, {
      title: "Edit Sticker Color",
      icon: String(icon || sticker.icon || "🏅").trim() || "🏅",
    })
    : sticker.color || "blue";
  if (color === null) return;
  const updated = _normalizeHelmetStickerType({
    ...sticker,
    label: safeLabel,
    icon,
    description,
    color,
    custom: true,
  });
  const duplicate = currentTypes.find((item) => item.key !== sticker.key && item.label.toLowerCase() === updated.label.toLowerCase());
  if (duplicate) {
    showToast("A sticker with that name already exists.", { type: "warning" });
    return;
  }
  _savePlayerHelmetStickerTypes(customTypes.map((item) => (item.key === sticker.key ? updated : item)));
  renderCoachQuizSetupPage();
  showToast(`${updated.label} sticker updated.`, { type: "success" });
}

async function coachDeleteHelmetSticker(stickerKey = "") {
  const customTypes = _getCustomHelmetStickerTypes();
  const sticker = customTypes.find((item) => item.key === stickerKey);
  if (!sticker) {
    showToast("Only custom stickers can be deleted.", { type: "warning" });
    return;
  }
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Delete "${sticker.label}" from future sticker awards? Existing player awards stay in history.`, {
      title: "Delete Sticker",
      icon: sticker.icon || "🏅",
      confirmText: "Delete",
      cancelText: "Keep",
      danger: true,
    })
    : false;
  if (!ok) return;
  _savePlayerHelmetStickerTypes(customTypes.filter((item) => item.key !== sticker.key));
  renderCoachQuizSetupPage();
  showToast(`${sticker.label} removed from custom stickers.`, { type: "success" });
}

function _readCoachQuizSettingNumber(id) {
  const el = document.getElementById(id);
  return el ? el.value : undefined;
}

function _readCoachQuizSettingText(id) {
  const el = document.getElementById(id);
  return el ? el.value : undefined;
}

function coachSaveQuizSettings() {
  const enabledQuestionTypes = [
    ["coachQuizTypeResponsibility", "responsibility"],
    ["coachQuizTypeRuleToPlay", "play_from_rule"],
    ["coachQuizTypeDiagram", "diagram"],
    ["coachQuizTypeCall", "call"],
  ]
    .filter(([id]) => document.getElementById(id)?.checked)
    .map(([, value]) => value);
  const settings = _savePlayerQuizSettings({
    weeklyGoal: _readCoachQuizSettingNumber("coachQuizWeeklyGoal"),
    baseCorrectPoints: _readCoachQuizSettingNumber("coachQuizBaseCorrectPoints"),
    minBonusAnswers: _readCoachQuizSettingNumber("coachQuizMinBonusAnswers"),
    scriptWeight: _readCoachQuizSettingNumber("coachQuizScriptWeight"),
    gameplanWeight: _readCoachQuizSettingNumber("coachQuizGameplanWeight"),
    honorRollMin: _readCoachQuizSettingNumber("coachQuizHonorRollMin"),
    honorRollBonus: _readCoachQuizSettingNumber("coachQuizHonorRollBonus"),
    highHonorRollMin: _readCoachQuizSettingNumber("coachQuizHighHonorRollMin"),
    highHonorRollBonus: _readCoachQuizSettingNumber("coachQuizHighHonorRollBonus"),
    coachesListMin: _readCoachQuizSettingNumber("coachQuizCoachesListMin"),
    coachesListBonus: _readCoachQuizSettingNumber("coachQuizCoachesListBonus"),
    questionPoints: _readCoachQuizSettingNumber("coachQuizQuestionPoints"),
    answerPoints: _readCoachQuizSettingNumber("coachQuizAnswerPoints"),
    giftPoints: _readCoachQuizSettingNumber("coachQuizGiftPoints"),
    dailyRewardCap: _readCoachQuizSettingNumber("coachQuizDailyRewardCap"),
    weeklyRewardCap: _readCoachQuizSettingNumber("coachQuizWeeklyRewardCap"),
    enabledQuestionTypes,
    tierNames: {
      champion: _readCoachQuizSettingText("coachQuizTierChampion"),
      baller: _readCoachQuizSettingText("coachQuizTierBaller"),
      starter: _readCoachQuizSettingText("coachQuizTierStarter"),
      contributor: _readCoachQuizSettingText("coachQuizTierContributor"),
      defense: _readCoachQuizSettingText("coachQuizTierDefense"),
    },
  });
  renderCoachQuizSetupPage();
  _renderPlayerQuizHub();
  if (document.getElementById("leaderboard")?.classList.contains("active")) renderPlayerLeaderboardPage();
  showToast(`Quiz settings saved. Weekly goal is ${settings.weeklyGoal}.`, { type: "success" });
}

async function coachResetQuizSettings() {
  const ok = typeof showConfirm === "function"
    ? await showConfirm("Reset quiz goals, scoring, rewards, tiers, and question types to defaults?", {
      title: "Reset Quiz Settings",
      icon: "⚙️",
      confirmText: "Reset",
      cancelText: "Keep",
      danger: false,
    })
    : true;
  if (!ok) return;
  _savePlayerQuizSettings(PLAYER_QUIZ_DEFAULT_SETTINGS);
  renderCoachQuizSetupPage();
  _renderPlayerQuizHub();
  if (document.getElementById("leaderboard")?.classList.contains("active")) renderPlayerLeaderboardPage();
  showToast("Quiz settings reset.", { type: "success" });
}

function setCoachQuizSourceState(arg = "") {
  const [kind, ...rest] = String(arg || "").split(":");
  const state = rest.pop();
  const id = rest.join(":");
  if (!["script", "gameplan"].includes(kind) || !id || !["available", "locked", "coach"].includes(state)) {
    showToast("Could not update quiz source.", { type: "warning" });
    return;
  }
  _setQuizSourceState(kind, id, state);
  if (kind === "script" && typeof getSavedScripts === "function" && typeof storageManager !== "undefined") {
    const saved = getSavedScripts();
    const target = saved.find((scriptRecord) => String(scriptRecord?.id || "") === id);
    if (target) {
      target.playerVisible = state !== "coach";
      storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, saved);
      if (typeof loadSavedScriptsList === "function") loadSavedScriptsList();
      if (typeof renderPlayerScriptLauncher === "function") renderPlayerScriptLauncher();
    }
  }
  renderCoachQuizSetupPage();
  _renderPlayerQuizHub();
  showToast(`Quiz source set to ${state === "coach" ? "coach-only" : state}.`, { type: "success" });
}

async function coachAwardQuestionPoints(type = "question") {
  const safeType = ["question", "answer", "gift"].includes(type) ? type : "question";
  const player = await _coachPromptRewardPlayer(_leaderboardSelectedPlayer || "");
  if (!player) return;
  const settings = _getPlayerQuizSettings();
  const now = new Date();
  const events = _getPlayerRewardEvents();
  const dateKey = _quizDateKey(now);
  const weekKey = _quizWeekKey(now);
  const playerEvents = events.filter((event) => _normalizeQuizPlayerName(event.player) === _normalizeQuizPlayerName(player));
  const dailyUsed = _sumQuizRewards(playerEvents.filter((event) => event.dateKey === dateKey));
  const weeklyUsed = _sumQuizRewards(playerEvents.filter((event) => event.weekKey === weekKey));
  const dailyRemaining = settings.dailyRewardCap ? Math.max(0, settings.dailyRewardCap - dailyUsed) : 500;
  const weeklyRemaining = settings.weeklyRewardCap ? Math.max(0, settings.weeklyRewardCap - weeklyUsed) : 500;
  const capRemaining = Math.min(500, dailyRemaining, weeklyRemaining);
  if (capRemaining <= 0) {
    showToast(`${player} is at the reward point cap.`, { type: "warning" });
    return;
  }
  const rewardDefaults = _getQuizRewardDefaults();
  const defaultPoints = Math.min(capRemaining, rewardDefaults[safeType] || 25);
  const rawPoints = typeof showPrompt === "function"
    ? await showPrompt("How many points?", String(defaultPoints), {
      title: "Award Points",
      icon: "🏆",
      placeholder: String(defaultPoints),
    })
    : String(defaultPoints);
  if (rawPoints === null) return;
  const requestedPoints = Math.max(0, Math.min(500, Math.round(Number(rawPoints) || defaultPoints)));
  const points = Math.min(requestedPoints, capRemaining);
  if (points <= 0) {
    showToast("No points were awarded.", { type: "info" });
    return;
  }
  const note = typeof showPrompt === "function"
    ? await showPrompt("Optional note for the player", "", {
      title: "Reward Note",
      icon: "✍️",
      placeholder: safeType === "question" ? "Great question in install." : "Helped a teammate understand the rule.",
    })
    : "";
  if (note === null) return;
  events.push({
    id: _quizEventId("reward"),
    player,
    type: safeType,
    label: safeType === "gift" ? "Coach Gift" : safeType === "answer" ? "Teammate Answer" : "Football Question",
    points,
    note: String(note || "").trim(),
    awardedBy: _quizCurrentCoachName(),
    createdAt: now.toISOString(),
    dateKey,
    weekKey,
  });
  _savePlayerRewardEvents(events);
  _leaderboardSelectedPlayer = player;
  renderCoachQuizSetupPage();
  if (document.getElementById("leaderboard")?.classList.contains("active")) renderPlayerLeaderboardPage();
  showToast(`${player} earned ${points} points${points < requestedPoints ? " after cap" : ""}.`, { type: "success" });
}

function _quizRewardCapRemainingForPlayer(player, dateKey, weekKey) {
  const settings = _getPlayerQuizSettings();
  const playerEvents = _getPlayerRewardEvents()
    .filter((event) => _isQuizRewardApproved(event))
    .filter((event) => _normalizeQuizPlayerName(event.player) === _normalizeQuizPlayerName(player));
  const dailyUsed = _sumQuizRewards(playerEvents.filter((event) => event.dateKey === dateKey));
  const weeklyUsed = _sumQuizRewards(playerEvents.filter((event) => event.weekKey === weekKey));
  const dailyRemaining = settings.dailyRewardCap ? Math.max(0, settings.dailyRewardCap - dailyUsed) : 500;
  const weeklyRemaining = settings.weeklyRewardCap ? Math.max(0, settings.weeklyRewardCap - weeklyUsed) : 500;
  return Math.min(500, dailyRemaining, weeklyRemaining);
}

async function coachStageDiscussionReward(arg = "") {
  const [postId, rawType] = String(arg || "").split("::");
  const safeType = rawType === "answer" ? "answer" : "question";
  const postEl = document.getElementById(`disc-post-${postId}`);
  if (!postEl || typeof _discIsStaff !== "function" || !_discIsStaff()) {
    showToast("Could not stage that discussion reward.", { type: "warning" });
    return;
  }
  const authorName = postEl.dataset.authorName || "";
  const rosterPlayer = _getQuizRosterPlayerByName(authorName);
  const player = rosterPlayer?.name || await _coachPromptRewardPlayer(authorName);
  if (!player) return;
  const existing = _getPlayerRewardEvents().find((event) =>
    event.source === "discussion" &&
    String(event.sourcePostId || "") === String(postId || "") &&
    event.type === safeType
  );
  if (existing) {
    showToast(existing.status === "pending_approval" ? "That reward is already pending approval." : "That discussion reward is already recorded.", { type: "info" });
    return;
  }
  const defaults = _getQuizRewardDefaults();
  const points = Math.max(0, Math.round(Number(defaults[safeType] || 0)));
  if (!points) {
    showToast("That reward type is set to 0 points.", { type: "warning" });
    return;
  }
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Stage ${points} ${safeType === "answer" ? "answer" : "question"} points for ${player}? Approval is required before it counts on the leaderboard.`, {
      title: "Stage Discussion Reward",
      icon: "🏆",
      confirmText: "Stage",
      cancelText: "Cancel",
      danger: false,
    })
    : true;
  if (!ok) return;
  const now = new Date();
  const playId = postEl.closest("[data-play-id]")?.dataset?.playId || "";
  const events = _getPlayerRewardEvents();
  events.push({
    id: _quizEventId("reward"),
    player,
    type: safeType,
    label: safeType === "answer" ? "Discussion Answer" : "Discussion Question",
    points,
    note: (postEl.dataset.bodyText || "").slice(0, 120),
    awardedBy: _quizCurrentCoachName(),
    source: "discussion",
    sourcePostId: postId,
    sourcePlayId: playId,
    status: "pending_approval",
    createdAt: now.toISOString(),
    dateKey: _quizDateKey(now),
    weekKey: _quizWeekKey(now),
  });
  _savePlayerRewardEvents(events);
  _leaderboardSelectedPlayer = player;
  postEl.classList.add("disc-post--reward-pending");
  showToast(`${player}'s ${safeType} reward is pending approval.`, { type: "success" });
  if (document.getElementById("coachQuizSetupPage")?.offsetParent !== null) renderCoachQuizSetupPage();
}

async function coachApproveQuizReward(rewardId = "") {
  const events = _getPlayerRewardEvents();
  const reward = events.find((event) => String(event.id || "") === String(rewardId || ""));
  if (!reward) {
    showToast("That reward is no longer available.", { type: "warning" });
    return;
  }
  if (_isQuizRewardApproved(reward)) {
    showToast("That reward is already approved.", { type: "info" });
    return;
  }
  const remaining = _quizRewardCapRemainingForPlayer(reward.player, reward.dateKey, reward.weekKey);
  if (remaining <= 0) {
    showToast(`${_normalizeQuizPlayerName(reward.player)} is at the reward point cap.`, { type: "warning" });
    return;
  }
  const originalPoints = Math.round(Number(reward.points || 0));
  const approvedPoints = Math.min(originalPoints, remaining);
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Approve ${approvedPoints} points for ${_normalizeQuizPlayerName(reward.player)}?`, {
      title: "Approve Reward",
      icon: "✅",
      confirmText: "Approve",
      cancelText: "Keep Pending",
      danger: false,
    })
    : true;
  if (!ok) return;
  reward.status = "approved";
  reward.points = approvedPoints;
  reward.approvedAt = new Date().toISOString();
  reward.approvedBy = _quizCurrentCoachName();
  _savePlayerRewardEvents(events);
  _leaderboardSelectedPlayer = _normalizeQuizPlayerName(reward.player);
  renderCoachQuizSetupPage();
  if (document.getElementById("leaderboard")?.classList.contains("active")) renderPlayerLeaderboardPage();
  showToast(`Approved ${approvedPoints} points for ${_normalizeQuizPlayerName(reward.player)}${approvedPoints < originalPoints ? " after cap" : ""}.`, { type: "success" });
}

async function coachRevokeQuizReward(rewardId = "") {
  const events = _getPlayerRewardEvents();
  const reward = events.find((event) => String(event.id || "") === String(rewardId || ""));
  if (!reward) {
    showToast("That reward is no longer available.", { type: "warning" });
    return;
  }
  const player = _normalizeQuizPlayerName(reward.player);
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Remove ${Math.round(Number(reward.points || 0))} ${_formatQuizQuestionType(reward.type || "reward").toLowerCase()} points from ${player}?`, {
      title: "Revoke Reward",
      icon: "↩️",
      confirmText: "Revoke",
      cancelText: "Keep",
      danger: true,
    })
    : false;
  if (!ok) return;
  _savePlayerRewardEvents(events.filter((event) => String(event.id || "") !== String(rewardId || "")));
  _leaderboardSelectedPlayer = player;
  renderCoachQuizSetupPage();
  if (document.getElementById("leaderboard")?.classList.contains("active")) renderPlayerLeaderboardPage();
  showToast(`Reward removed for ${player}.`, { type: "success" });
}

async function coachAwardHelmetSticker(stickerKey = "") {
  const sticker = _getPlayerHelmetStickerType(stickerKey) || _getPlayerHelmetStickerTypes()[0];
  const player = await _coachPromptRewardPlayer(_leaderboardSelectedPlayer || "");
  if (!player) return;
  const note = typeof showPrompt === "function"
    ? await showPrompt("Optional sticker note", "", {
      title: sticker.label,
      icon: sticker.icon,
      placeholder: "Why did they earn it?",
    })
    : "";
  if (note === null) return;
  const now = new Date();
  const stickers = _getPlayerHelmetStickers();
  stickers.push({
    id: _quizEventId("sticker"),
    player,
    stickerKey: sticker.key,
    label: sticker.label,
    icon: sticker.icon,
    color: sticker.color,
    description: sticker.description || "",
    note: String(note || "").trim(),
    awardedBy: _quizCurrentCoachName(),
    context: "Practice",
    createdAt: now.toISOString(),
    dateKey: _quizDateKey(now),
    weekKey: _quizWeekKey(now),
  });
  _savePlayerHelmetStickers(stickers);
  _leaderboardSelectedPlayer = player;
  renderCoachQuizSetupPage();
  if (document.getElementById("leaderboard")?.classList.contains("active")) renderPlayerLeaderboardPage();
  showToast(`${player} earned ${sticker.label}.`, { type: "success" });
}

async function coachRevokeHelmetStickerAward(stickerId = "") {
  const stickers = _getPlayerHelmetStickers();
  const sticker = stickers.find((event) => String(event.id || "") === String(stickerId || ""));
  if (!sticker) {
    showToast("That sticker award is no longer available.", { type: "warning" });
    return;
  }
  const player = _normalizeQuizPlayerName(sticker.player);
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Remove "${sticker.label || "Helmet Sticker"}" from ${player}'s profile?`, {
      title: "Revoke Sticker",
      icon: sticker.icon || "🏅",
      confirmText: "Revoke",
      cancelText: "Keep",
      danger: true,
    })
    : false;
  if (!ok) return;
  _savePlayerHelmetStickers(stickers.filter((event) => String(event.id || "") !== String(stickerId || "")));
  _leaderboardSelectedPlayer = player;
  renderCoachQuizSetupPage();
  if (document.getElementById("leaderboard")?.classList.contains("active")) renderPlayerLeaderboardPage();
  showToast(`${sticker.label || "Sticker"} removed for ${player}.`, { type: "success" });
}

function renderCoachQuizSetupPage() {
  const page = document.getElementById("coachQuizSetupPage");
  if (!page) return;
  const currentUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (currentUser?.role === "player") {
    page.innerHTML = "";
    return;
  }
  if (window.playImages && typeof window.playImages.loadKeys === "function") {
    window.playImages.loadKeys().catch(() => { });
  }
  const scripts = _getCoachQuizScriptSources();
  const gamePlans = _getCoachQuizGamePlanSources();
  const allStats = [...scripts.map((s) => _quizCompletenessStats(s.plays)), ...gamePlans.map((g) => _quizCompletenessStats(g.plays))];
  const avgScore = allStats.length
    ? Math.round(allStats.reduce((sum, stats) => sum + stats.score, 0) / allStats.length)
    : 0;
  const readyCount = allStats.filter((stats) => stats.score >= 88).length;
  const rewardEvents = _getPlayerRewardEvents();
  const stickers = _getPlayerHelmetStickers();
  const weekKey = _quizWeekKey(new Date());
  const weeklyRewardEvents = rewardEvents.filter((event) => event.weekKey === weekKey);
  const weeklyStickerEvents = stickers.filter((event) => event.weekKey === weekKey);
  const leaderboardSummary = _buildCoachQuizLeaderboardSummary();
  const quizSettings = _getPlayerQuizSettings();
  const rosterHealthSummary = _buildCoachQuizRosterHealthSummary();
  if (!_leaderboardSelectedPlayer && leaderboardSummary.rows[0]?.name) {
    _leaderboardSelectedPlayer = leaderboardSummary.rows[0].name;
  }

  setInnerHTML(page, `
    <div class="coach-quiz-setup-shell">
      <section class="coach-quiz-setup-hero">
        <div>
          <span class="coach-quiz-kicker">Set Up Quizzes</span>
          <h2>Make every quiz source player-ready</h2>
          <p>Check whether scripts and game plans have enough diagrams, rules, notes, and metadata for kids to learn from the quiz instead of guessing.</p>
        </div>
        <div class="coach-quiz-hero-score">
          <strong>${avgScore}</strong>
          <span>${readyCount}/${allStats.length || 0} ready</span>
        </div>
      </section>
      ${_renderCoachQuizSettingsPanel(quizSettings)}
      ${_renderCoachQuizRosterHealthPanel(rosterHealthSummary)}
      <section class="coach-quiz-reward-panel">
        <article>
          <span>Question points</span>
          <strong>Incentivize asking</strong>
          <p>Award weekly points for good questions so players learn that asking is part of preparation.</p>
          <button type="button" class="btn btn-primary" data-action="coachAwardQuestionPoints" data-arg="question">Award Question</button>
        </article>
        <article>
          <span>Gifted points</span>
          <strong>Reward teammates</strong>
          <p>Give answer or bonus points when a player helps a teammate understand a call, rule, or adjustment.</p>
          <div class="coach-quiz-reward-actions">
            <button type="button" class="btn btn-outline" data-action="coachAwardQuestionPoints" data-arg="answer">Answer Points</button>
            <button type="button" class="btn btn-outline" data-action="coachAwardQuestionPoints" data-arg="gift">Gift Points</button>
          </div>
        </article>
        <article>
          <span>Helmet stickers</span>
          <strong>Post-practice awards</strong>
          <p>Award stickers after practice. Players see them when their leaderboard name is opened.</p>
          <button type="button" class="btn btn-outline coach-quiz-custom-sticker-btn" data-action="coachCreateHelmetSticker">+ Custom Sticker</button>
          <div class="coach-quiz-sticker-grid">${_renderCoachStickerButtons()}</div>
          ${_renderCoachCustomStickerManager()}
        </article>
      </section>
      <section class="coach-quiz-setup-section">
        <div class="coach-quiz-section-head">
          <h3>This week's rewards</h3>
          <span>${weeklyRewardEvents.length} point awards · ${weeklyStickerEvents.length} stickers</span>
        </div>
        <div class="coach-quiz-reward-summary">
          <span><strong>${Math.round(_sumQuizRewards(weeklyRewardEvents, "question"))}</strong><small>Question pts</small></span>
          <span><strong>${Math.round(_sumQuizRewards(weeklyRewardEvents, "answer"))}</strong><small>Answer pts</small></span>
          <span><strong>${Math.round(_sumQuizRewards(weeklyRewardEvents, "gift"))}</strong><small>Gift pts</small></span>
          <span><strong>${weeklyStickerEvents.length}</strong><small>Stickers</small></span>
        </div>
      </section>
      ${_renderCoachQuizAwardHistoryPanel(weeklyRewardEvents, weeklyStickerEvents)}
      ${_renderCoachQuizLeaderboardPanel(leaderboardSummary)}
      ${_renderCoachQuizPositionPicker()}
      <section class="coach-quiz-setup-section">
        <div class="coach-quiz-section-head">
          <h3>Practice scripts</h3>
          <span>${scripts.length} saved</span>
        </div>
        <div class="coach-quiz-source-grid">
          ${scripts.length
      ? scripts.map((source) => _renderCoachQuizSourceCard(source, "script")).join("")
      : `<div class="coach-quiz-empty">No saved practice scripts yet.</div>`}
        </div>
      </section>
      <section class="coach-quiz-setup-section">
        <div class="coach-quiz-section-head">
          <h3>Game plans</h3>
          <span>${gamePlans.length} boards</span>
        </div>
        <div class="coach-quiz-source-grid">
          ${gamePlans.length
      ? gamePlans.map((source) => _renderCoachQuizSourceCard(source, "gameplan")).join("")
      : `<div class="coach-quiz-empty">No game plans with plays yet.</div>`}
        </div>
      </section>
    </div>
  `);
  page.querySelectorAll(".coach-quiz-metric i b").forEach((bar) => {
    const width = bar.dataset.pct || "0";
    bar.style.width = `${Math.max(0, Math.min(100, Number(width) || 0))}%`;
  });
}

function _buildQuizPlays(shuffled) {
  const items = [];
  let currentPeriod = "";
  script.forEach((item, scriptIndex) => {
    if (item.isSeparator) {
      currentPeriod = item.label || "";
    } else {
      items.push({ play: item, period: currentPeriod, scriptIndex });
    }
  });
  if (shuffled) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
  return items;
}

function _normalizeQuizItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      if (!item) return null;
      if (item.play && typeof item.play === "object") {
        return {
          play: item.play,
          period: item.period || "",
          scriptIndex: item.scriptIndex ?? index,
          sourceBox: item.sourceBox || "",
          positionKey: item.positionKey || "",
        };
      }
      return {
        play: item,
        period: "",
        scriptIndex: index,
        sourceBox: "",
        positionKey: "",
      };
    })
    .filter((item) => item && item.play && !item.play.isSeparator);
}

function _setQuizPlays(items, shuffled = false) {
  _quizBasePlays = _normalizeQuizItems(items);
  _quizPlays = shuffled ? _quizShuffle(_quizBasePlays) : _quizBasePlays.slice();
}

function _getQuizPositions() {
  if (typeof getPlayPresentationPositions === "function") {
    return getPlayPresentationPositions();
  }
  return [
    { key: "respQ", label: "Q" },
    { key: "respT", label: "T" },
    { key: "respH", label: "H" },
    { key: "respZ", label: "Z" },
    { key: "respX", label: "X" },
    { key: "respY", label: "Y" },
    { key: "respLT", label: "LT" },
    { key: "respLG", label: "LG" },
    { key: "respC", label: "C" },
    { key: "respRG", label: "RG" },
    { key: "respRT", label: "RT" },
  ];
}

function _getQuizPosition(key = _quizPositionKey) {
  return _getQuizPositions().find((position) => position.key === key) || _getQuizPositions()[0];
}

function _normalizeQuizPositionMode(mode = "") {
  const value = String(mode || "").trim();
  return ["primary", "secondary", "mix", "random-skill", "random-line", "manual"].includes(value)
    ? value
    : "primary";
}

function _quizRosterPositionToKey(position = "") {
  const raw = String(position || "").trim().toUpperCase();
  const aliases = {
    QB: "respQ",
    Q: "respQ",
    RB: "respT",
    T: "respT",
    TB: "respT",
    HB: "respT",
    FB: "respH",
    H: "respH",
    Z: "respZ",
    X: "respX",
    Y: "respY",
    LT: "respLT",
    LG: "respLG",
    C: "respC",
    RG: "respRG",
    RT: "respRT",
  };
  const key = aliases[raw] || "";
  return _getQuizPositions().some((positionOption) => positionOption.key === key) ? key : "";
}

function _quizPositionKeyIsLine(key = "") {
  return ["respLT", "respLG", "respC", "respRG", "respRT"].includes(String(key || ""));
}

function _quizUniquePositionKeys(keys = []) {
  const available = new Set(_getQuizPositions().map((position) => position.key));
  return [...new Set(keys.map((key) => String(key || "").trim()).filter((key) => available.has(key)))];
}

function _getCurrentQuizRosterPositionKeys() {
  const rosterPlayer = _getQuizRosterPlayerForCurrentUser();
  const primary = _quizRosterPositionToKey(rosterPlayer?.primaryPosition || rosterPlayer?.position || "");
  const secondary = _quizRosterPositionToKey(rosterPlayer?.secondaryPosition || "");
  return { primary, secondary };
}

function _getQuizPositionModeOptions() {
  const rosterKeys = _getCurrentQuizRosterPositionKeys();
  const primaryLabel = rosterKeys.primary ? _getQuizPosition(rosterKeys.primary)?.label : "Primary";
  const secondaryLabel = rosterKeys.secondary ? _getQuizPosition(rosterKeys.secondary)?.label : "";
  return [
    {
      value: "primary",
      label: rosterKeys.primary ? `Roster primary (${primaryLabel})` : "Roster primary",
      hint: rosterKeys.primary ? "Use the primary position linked to your roster account." : "Link this account to a roster player to auto-fill primary.",
    },
    {
      value: "secondary",
      label: rosterKeys.secondary ? `Roster secondary (${secondaryLabel})` : "Roster secondary",
      hint: rosterKeys.secondary ? "Use the secondary position linked to your roster account." : "Add a secondary position on the roster to unlock this.",
      disabled: !rosterKeys.secondary,
    },
    {
      value: "mix",
      label: rosterKeys.secondary ? `Mix ${primaryLabel} + ${secondaryLabel}` : "Mix primary + secondary",
      hint: rosterKeys.secondary ? "Rotate questions between both roster positions." : "Needs a secondary roster position; falls back to primary.",
    },
    {
      value: "random-skill",
      label: "Random skill",
      hint: "Shuffle between Q, T/RB, H, X, Z, and Y rules.",
    },
    {
      value: "random-line",
      label: "Random line",
      hint: "Shuffle between LT, LG, C, RG, and RT rules.",
    },
    {
      value: "manual",
      label: "Manual chips",
      hint: "Tap a position chip below to lock the quiz to one rule column.",
    },
  ];
}

function _getQuizPositionModeLabel(mode = _quizPositionMode) {
  const normalized = _normalizeQuizPositionMode(mode);
  const option = _getQuizPositionModeOptions().find((entry) => entry.value === normalized);
  return option?.label || _getQuizPosition()?.label || "Position";
}

function _resolveQuizPositionKeysForMode(mode = _quizPositionMode) {
  const normalized = _normalizeQuizPositionMode(mode);
  const rosterKeys = _getCurrentQuizRosterPositionKeys();
  const allKeys = _getQuizPositions().map((position) => position.key);
  const lineKeys = allKeys.filter(_quizPositionKeyIsLine);
  const skillKeys = allKeys.filter((key) => !_quizPositionKeyIsLine(key));
  if (normalized === "secondary") {
    return _quizUniquePositionKeys([rosterKeys.secondary, rosterKeys.primary, _quizPositionKey]);
  }
  if (normalized === "mix") {
    return _quizUniquePositionKeys([rosterKeys.primary, rosterKeys.secondary, _quizPositionKey]);
  }
  if (normalized === "random-skill") return skillKeys;
  if (normalized === "random-line") return lineKeys;
  if (normalized === "manual") return _quizUniquePositionKeys([_quizPositionKey]);
  return _quizUniquePositionKeys([rosterKeys.primary, _quizPositionKey]);
}

function _syncPlayerQuizPositionDefault() {
  _quizPositionMode = _normalizeQuizPositionMode(_quizPositionMode);
  const keys = _resolveQuizPositionKeysForMode(_quizPositionMode);
  if (keys.length) _quizPositionKey = keys[0];
}

function _prepareQuizItemsForPositionMode(items, mode = _quizPositionMode) {
  const normalizedMode = _normalizeQuizPositionMode(mode);
  const candidates = _resolveQuizPositionKeysForMode(normalizedMode);
  const fallback = _getQuizPosition(_quizPositionKey)?.key || "respQ";
  const keys = candidates.length ? candidates : [fallback];
  const randomMode = normalizedMode === "random-skill" || normalizedMode === "random-line";
  const prepared = _normalizeQuizItems(items).map((item, index) => {
    const keysWithRules = keys.filter((key) => _quizCleanText(item.play?.[key] || ""));
    const pool = keysWithRules.length ? keysWithRules : keys;
    const positionKey = randomMode
      ? pool[Math.floor(Math.random() * pool.length)]
      : pool[index % pool.length];
    return { ...item, positionKey };
  });
  if (prepared[0]?.positionKey) _quizPositionKey = prepared[0].positionKey;
  return prepared;
}

function _getQuizPositionForItem(item) {
  return _getQuizPosition(item?.positionKey || _quizPositionKey);
}

function _getPlayerQuizScriptOptions() {
  const savedScripts = typeof getSavedScripts === "function" ? getSavedScripts() : [];
  return (Array.isArray(savedScripts) ? savedScripts : [])
    .filter((savedScript) => savedScript && savedScript.id)
    .map((savedScript) => {
      const stats = typeof getSavedScriptStats === "function" ? getSavedScriptStats(savedScript) : null;
      const quizStats = _quizCompletenessStats(savedScript.plays || []);
      const state = _getQuizSourceState("script", savedScript);
      const option = {
        id: String(savedScript.id),
        name: savedScript.name || "Published Practice",
        playCount: stats?.playCount || 0,
        periodCount: stats?.periodCount || 0,
        totalReps: stats?.totalReps || 0,
        date: savedScript.date || "",
        dateStr: stats?.dateStr || savedScript.date || "No date",
        state,
        quizStats,
        readiness: _quizReadinessLabel(quizStats.score),
        playerSelectable: savedScript.playerVisible && state === "available",
        playerVisible: Boolean(savedScript.playerVisible),
      };
      return {
        ...option,
        progress: _getQuizScriptProgress(option),
      };
    })
    .filter((option) => option.playerVisible && option.state !== "coach");
}

function _getPlayerQuizSelectedScriptRecord() {
  const id = String(_playerQuizSelectedScriptId || "");
  const savedScripts = typeof getSavedScripts === "function" ? getSavedScripts() : [];
  return (Array.isArray(savedScripts) ? savedScripts : []).find((savedScript) => String(savedScript?.id || "") === id) || null;
}

function _quizItemHasDiagram(itemOrPlay) {
  const play = itemOrPlay?.play || itemOrPlay;
  return Boolean(
    play &&
    window.playImages &&
    typeof window.playImages.hasForPlay === "function" &&
    window.playImages.hasForPlay(play)
  );
}

function _quizItemHasPositionRule(itemOrPlay, key = _quizPositionKey) {
  const play = itemOrPlay?.play || itemOrPlay;
  const keys = _resolveQuizPositionKeysForMode(_quizPositionMode);
  const candidates = key ? [key, ...keys] : keys;
  return candidates.some((positionKey) => _quizCleanText(play?.[positionKey] || ""));
}

function _getRecentMissedQuizItems(limit = 5) {
  const attempts = _getPlayerQuizAttempts()
    .filter((attempt) => _quizPlayerNameFromAttempt(attempt, _getQuizPlayerName()) === _getQuizPlayerName())
    .sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  const sourcePlays = [
    ...(_getPlayerQuizSelectedScriptRecord()?.plays || []),
    ..._buildGamePlanQuizItems().map((item) => item.play),
    ...((Array.isArray(script) ? script : []).filter((play) => play && !play.isSeparator)),
    ...((Array.isArray(plays) ? plays : [])),
  ];
  const seen = new Set();
  const out = [];
  attempts.forEach((attempt) => {
    (Array.isArray(attempt.reviewRows) ? attempt.reviewRows : []).forEach((row) => {
      if (row.correct) return;
      const call = _quizCleanText(row.playCall || row.correctLabel || "");
      if (!call || seen.has(call.toLowerCase())) return;
      const match = sourcePlays.find((play) => play && _quizPlainCall(play).toLowerCase() === call.toLowerCase());
      if (!match) return;
      seen.add(call.toLowerCase());
      out.push({ play: match, period: "Missed Plays", scriptIndex: out.length });
    });
  });
  return out.slice(0, limit);
}

function _getPlayerQuizModes(context = {}) {
  const scriptSource = context.scriptSource || _getPlayerQuizSelectedScriptRecord();
  const scriptItems = _normalizeQuizItems(scriptSource?.plays || []);
  const gamePlanStatus = context.gamePlanStatus || _getActiveGamePlanQuizStatus();
  const hasDiagram = scriptItems.some(_quizItemHasDiagram);
  const hasRules = scriptItems.some((item) => _quizItemHasPositionRule(item));
  const missedItems = _getRecentMissedQuizItems(5);
  return [
    {
      key: "quick",
      label: "Quick Hits",
      time: "5 plays",
      note: "Fast mixed reps from the selected source.",
      source: "script",
      disabled: !scriptItems.length,
    },
    {
      key: "diagram",
      label: "Diagram Drill",
      time: hasDiagram ? "Visual" : "Fallback",
      note: hasDiagram ? "Start with plays that have diagrams." : "No diagrams yet; falls back to mixed reps.",
      source: "script",
      disabled: !scriptItems.length,
    },
    {
      key: "job",
      label: "Know Your Job",
      time: hasRules ? "Rules" : "Fallback",
      note: hasRules ? "Focus on your position responsibilities." : "No position rules yet; falls back to easier reps.",
      source: "script",
      disabled: !scriptItems.length,
    },
    {
      key: "gameplan",
      label: "Game Plan Check",
      time: `${gamePlanStatus.stats?.playCount || 0} calls`,
      note: "Mixed questions from this week's plan.",
      source: "gameplan",
      disabled: !gamePlanStatus.available,
    },
    {
      key: "missed",
      label: "Missed Plays",
      time: `${missedItems.length || 0} due`,
      note: "Retry recent misses after feedback.",
      source: "script",
      disabled: !missedItems.length,
    },
  ];
}

function _getPlayerQuizMode(key = _playerQuizSelectedMode) {
  return _getPlayerQuizModes().find((mode) => mode.key === key) || _getPlayerQuizModes()[0];
}

function _renderPlayerQuizModeCards() {
  const modes = _getPlayerQuizModes();
  if (!modes.some((mode) => mode.key === _playerQuizSelectedMode && !mode.disabled)) {
    _playerQuizSelectedMode = modes.find((mode) => !mode.disabled)?.key || "quick";
  }
  return modes.map((mode) => `
    <button type="button"
      class="player-quiz-mode-card${mode.key === _playerQuizSelectedMode ? " is-selected" : ""}${mode.disabled ? " is-disabled" : ""}"
      data-action="setPlayerQuizMode"
      data-arg="${escapeAttr(mode.key)}"
      aria-pressed="${mode.key === _playerQuizSelectedMode ? "true" : "false"}"
      ${mode.disabled ? "disabled" : ""}>
      <span>${escapeHtml(mode.time)}</span>
      <strong>${escapeHtml(mode.label)}</strong>
      <small>${escapeHtml(mode.note)}</small>
    </button>
  `).join("");
}

function _prepareQuizItemsForMode(items, modeKey = _quizMode) {
  const normalized = _normalizeQuizItems(items);
  const mode = String(modeKey || "quick");
  if (mode === "diagram") {
    const withDiagrams = normalized.filter(_quizItemHasDiagram);
    return (withDiagrams.length ? withDiagrams : normalized).slice(0, 8);
  }
  if (mode === "job") {
    const withRules = normalized.filter((item) => _quizItemHasPositionRule(item));
    return (withRules.length ? withRules : normalized).slice(0, 8);
  }
  if (mode === "missed") {
    const missed = _getRecentMissedQuizItems(5);
    return missed.length ? missed : normalized.slice(0, 5);
  }
  if (mode === "quick") return normalized.slice(0, 5);
  return normalized;
}

function _quizModeTitle(baseTitle, modeKey = _playerQuizSelectedMode) {
  const mode = _getPlayerQuizModes().find((entry) => entry.key === modeKey);
  if (!mode || mode.key === "quick") return baseTitle;
  return `${mode.label}: ${baseTitle}`;
}

function _renderPlayerQuizScriptPicker(options) {
  if (!Array.isArray(options) || !options.length) {
    return `<div class="player-quiz-script-empty">Current practice only. Published scripts will appear here when your coach posts them.</div>`;
  }
  const selectable = options.filter((option) => option.playerSelectable);
  if (!_playerQuizSelectedScriptId || !selectable.some((option) => option.id === _playerQuizSelectedScriptId)) {
    _playerQuizSelectedScriptId = selectable[0]?.id || "";
  }
  return options.map((option) => {
    const selected = option.id === _playerQuizSelectedScriptId;
    const progress = option.progress || _getQuizScriptProgress(option);
    const progressText = progress.points ? `${progress.label} · ${progress.points} pts` : progress.label;
    const locked = !option.playerSelectable;
    const stateLabel = option.state === "locked"
      ? "Locked"
      : option.state === "coach"
        ? "Coach-only"
        : option.quizStats?.score < 40
          ? "Thin"
          : "";
    return `
      <button type="button"
        class="player-quiz-script-option${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}"
        data-action="setPlayerQuizScriptSource"
        data-arg="${escapeAttr(option.id)}"
        aria-pressed="${selected ? "true" : "false"}"
        ${locked ? "disabled" : ""}>
        <span class="player-quiz-script-option__main">
          <strong>${escapeHtml(option.name)}</strong>
          <small>${escapeHtml(option.dateStr)} · ${option.playCount} plays${option.periodCount ? ` · ${option.periodCount} periods` : ""}</small>
          ${_renderQuizCompletenessChips(option.quizStats, "quiz-completeness-chips player-quiz-source-chips")}
        </span>
        <span class="player-quiz-script-option__status">
          <b class="player-quiz-progress-badge${progress.icon ? " has-icon" : ""}">${escapeHtml(stateLabel || progressText)}</b>
        </span>
      </button>
    `;
  }).join("");
}

function _renderPlayerQuizHub() {
  const summary = _summarizeQuizAttempts();
  const settings = _getPlayerQuizSettings();
  const badgeFloor = Math.min(settings.honorRollMin, settings.highHonorRollMin, settings.coachesListMin);
  const weeklyPointsEl = document.getElementById("playerQuizWeeklyPoints");
  if (weeklyPointsEl) {
    weeklyPointsEl.textContent = `${Math.round(summary.weeklyPoints)} / ${settings.weeklyGoal}`;
  }
  const weeklyMetaEl = document.getElementById("playerQuizWeeklyMeta");
  if (weeklyMetaEl) {
    weeklyMetaEl.textContent = `${summary.weeklyAttempts.length} attempt${summary.weeklyAttempts.length === 1 ? "" : "s"} this week`;
  }
  const tierEl = document.getElementById("playerQuizCurrentTier");
  if (tierEl) tierEl.textContent = summary.tier;
  const tierMetaEl = document.getElementById("playerQuizTierMeta");
  if (tierMetaEl) {
    const remaining = Math.max(0, settings.weeklyGoal - summary.weeklyPoints);
    const achievement = _getQuizAchievementSummary(summary.weeklyPoints, settings);
    const championName = _getQuizTierName("champion", settings);
    tierMetaEl.textContent = remaining
      ? `${Math.round(remaining)} to ${championName}`
      : (achievement.stars ? `${achievement.shortLabel} · ${Math.round(achievement.overGoal)} above` : `${championName} standard met`);
  }
  const bestBadgeEl = document.getElementById("playerQuizBestBadge");
  if (bestBadgeEl) {
    bestBadgeEl.textContent = summary.bestPercent ? summary.bestBadge.label : "No attempts";
  }
  const badgeMetaEl = document.getElementById("playerQuizBadgeMeta");
  if (badgeMetaEl) {
    badgeMetaEl.textContent = summary.bestPercent
      ? `Best ${Math.round(summary.bestPercent)}% · season ${Math.round(summary.seasonPoints)} pts`
      : `${badgeFloor} / ${settings.highHonorRollMin} / ${settings.coachesListMin} unlock bonuses`;
  }
  const leaderboardEl = document.getElementById("playerQuizLeaderboardPreview");
  if (leaderboardEl) {
    leaderboardEl.innerHTML = _renderQuizLeaderRows(summary.weeklyLeaderboardRows, summary.player);
  }
  _renderPlayerQuizResumeSlot();

  const modeSelect = document.getElementById("playerQuizPositionModeSelect");
  const modeHint = document.getElementById("playerQuizPositionHint");
  if (modeSelect) {
    const modeOptions = _getQuizPositionModeOptions();
    if (!modeOptions.some((option) => option.value === _quizPositionMode && !option.disabled)) {
      _quizPositionMode = "primary";
      _syncPlayerQuizPositionDefault();
    }
    modeSelect.innerHTML = modeOptions.map((option) => `
      <option value="${escapeAttr(option.value)}"${option.value === _quizPositionMode ? " selected" : ""}${option.disabled ? " disabled" : ""}>
        ${escapeHtml(option.label)}
      </option>
    `).join("");
    modeSelect.value = _quizPositionMode;
    if (modeHint) {
      const selectedOption = modeOptions.find((option) => option.value === _quizPositionMode) || modeOptions[0];
      modeHint.textContent = selectedOption?.hint || "Choose the rule column for this quiz.";
    }
  }

  const picker = document.getElementById("playerQuizPositionPicker");
  if (picker) {
    picker.innerHTML = _getQuizPositions()
      .map((position) => `
        <button type="button"
          class="player-quiz-position-btn${position.key === _quizPositionKey ? " is-active" : ""}"
          data-action="setPlayerQuizPosition"
          data-arg="${escapeAttr(position.key)}"
          aria-pressed="${position.key === _quizPositionKey ? "true" : "false"}">
          ${escapeHtml(position.label)}
        </button>
      `)
      .join("");
  }

  const select = document.getElementById("playerQuizScriptSelect");
  const scriptPicker = document.getElementById("playerQuizScriptPicker");
  const scriptStartBtn = document.getElementById("playerQuizStartScriptBtn");
  if (select) {
    const options = _getPlayerQuizScriptOptions();
    const selectableOptions = options.filter((option) => option.playerSelectable);
    if (selectableOptions.length) {
      if (!_playerQuizSelectedScriptId || !selectableOptions.some((option) => option.id === _playerQuizSelectedScriptId)) {
        _playerQuizSelectedScriptId = selectableOptions[0].id;
      }
      select.innerHTML = selectableOptions
        .map((option) => {
          const count = option.playCount ? ` · ${option.playCount} plays` : "";
          const date = option.dateStr ? `${option.dateStr} · ` : "";
          return `<option value="${escapeAttr(option.id)}">${escapeHtml(date + option.name + count)}</option>`;
        })
        .join("");
      select.value = _playerQuizSelectedScriptId;
    } else {
      select.innerHTML = `<option value="">Current practice</option>`;
      _playerQuizSelectedScriptId = "";
    }
    select.hidden = true;
  }

  const gamePlanStatus = _getActiveGamePlanQuizStatus();
  const modeGrid = document.getElementById("playerQuizModeGrid");
  if (modeGrid) {
    modeGrid.innerHTML = _renderPlayerQuizModeCards();
  }

  if (scriptStartBtn) {
    const hasScriptOption = _getPlayerQuizScriptOptions().some((option) => option.playerSelectable);
    const mode = _getPlayerQuizMode();
    const modeNeedsGamePlan = mode?.source === "gameplan";
    scriptStartBtn.disabled = !hasScriptOption || modeNeedsGamePlan;
    scriptStartBtn.textContent = !hasScriptOption
      ? "Script Quiz Locked"
      : modeNeedsGamePlan
        ? "Use Game Plan"
        : `Start ${mode?.label || "Script Quiz"}`;
  }
  if (scriptPicker) {
    scriptPicker.innerHTML = _renderPlayerQuizScriptPicker(_getPlayerQuizScriptOptions());
  }

  const gamePlanBtn = document.getElementById("playerQuizStartGamePlanBtn");
  const gamePlanStatusEl = document.getElementById("playerQuizGamePlanStatus");
  if (gamePlanBtn) {
    const mode = _getPlayerQuizMode();
    gamePlanBtn.disabled = !gamePlanStatus.available;
    gamePlanBtn.textContent = gamePlanStatus.available
      ? `Start ${mode?.key === "gameplan" ? mode.label : "Game Plan Quiz"}`
      : gamePlanStatus.label;
  }
  if (gamePlanStatusEl) {
    setInnerHTML(gamePlanStatusEl, `
      <span>${escapeHtml(gamePlanStatus.detail)}</span>
      ${_renderQuizCompletenessChips(gamePlanStatus.stats, "quiz-completeness-chips player-quiz-source-chips")}
    `);
    gamePlanStatusEl.hidden = !gamePlanStatus.detail;
  }

  if (document.getElementById("leaderboard")?.classList.contains("active")) {
    renderPlayerLeaderboardPage();
  }
}

function openPlayerQuizHub() {
  _syncPlayerQuizPositionDefault();
  _renderPlayerQuizHub();
  const overlay = document.getElementById("playerQuizHubOverlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "playerQuizHubOverlay",
      scrollElement: "playerQuizHubPanel",
      blocking: true,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
  }
}

function closePlayerQuizHub() {
  const overlay = document.getElementById("playerQuizHubOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") {
    closeLayer(overlay);
  }
  overlay.classList.add("hidden");
}

function setPlayerQuizPosition(key) {
  const next = _getQuizPositions().find((position) => position.key === key);
  if (!next) return;
  _quizPositionKey = next.key;
  _quizPositionMode = "manual";
  _renderPlayerQuizHub();
}

function setPlayerQuizPositionMode(mode) {
  _quizPositionMode = _normalizeQuizPositionMode(mode);
  _syncPlayerQuizPositionDefault();
  _renderPlayerQuizHub();
}

function setPlayerQuizMode(modeKey) {
  const mode = _getPlayerQuizModes().find((entry) => entry.key === String(modeKey || ""));
  if (!mode || mode.disabled) return;
  _playerQuizSelectedMode = mode.key;
  _renderPlayerQuizHub();
}

function setPlayerQuizScriptSource(id) {
  const target = _getPlayerQuizScriptOptions().find((option) => option.id === String(id || ""));
  if (target && !target.playerSelectable) return;
  _playerQuizSelectedScriptId = target ? target.id : "";
  const select = document.getElementById("playerQuizScriptSelect");
  if (select) select.value = _playerQuizSelectedScriptId;
  _renderPlayerQuizHub();
}

function startPlayerQuizHubScript() {
  const select = document.getElementById("playerQuizScriptSelect");
  const id = _playerQuizSelectedScriptId || (select ? select.value : "");
  const selected = _getPlayerQuizScriptOptions().find((option) => option.id === id);
  if (!selected || !selected.playerSelectable) {
    showToast("Coach has not opened that script quiz yet.", { type: "warning" });
    return;
  }
  const mode = _getPlayerQuizMode();
  if (mode?.source === "gameplan") {
    showToast("Use the Game Plan button for that challenge.", { type: "info" });
    return;
  }
  closePlayerQuizHub();
  _quizMode = mode?.key || "quick";
  if (typeof startPlayerScriptQuiz === "function") {
    startPlayerScriptQuiz(id || "", {
      mode: _quizMode,
      items: mode?.key === "missed" ? _prepareQuizItemsForMode([], "missed") : undefined,
      title: _quizModeTitle(selected.name || "Practice Script Quiz", _quizMode),
    });
    return;
  }
  startScriptQuiz({
    items: mode?.key === "missed" ? _prepareQuizItemsForMode([], "missed") : undefined,
    sourceType: "script",
    sourceId: id || "",
    title: _quizModeTitle("Practice Script Quiz", _quizMode),
    positionKey: _quizPositionKey,
    positionMode: _quizPositionMode,
    mode: _quizMode,
  });
}

function _getActiveGamePlanQuizSourceId() {
  if (typeof _gpActiveOpponentKey === "function") return _gpActiveOpponentKey();
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  return gw?.opponentName || "__unassigned__";
}

function _getActiveGamePlanQuizStatus() {
  const id = _getActiveGamePlanQuizSourceId();
  const state = _getQuizSourceState("gameplan", { id });
  const items = _buildGamePlanQuizItems();
  const stats = _quizCompletenessStats(items.map((item) => item.play));
  if (state === "coach") {
    return {
      id,
      state,
      available: false,
      label: "Game Plan Coach-only",
      detail: "Coach has not opened this Game Plan quiz to players.",
      stats,
    };
  }
  if (state === "locked") {
    return {
      id,
      state,
      available: false,
      label: "Game Plan Locked",
      detail: "Coach locked this Game Plan quiz for now.",
      stats,
    };
  }
  if (!items.length) {
    return {
      id,
      state,
      available: false,
      label: "No Game Plan Quiz",
      detail: "No Game Plan calls are ready for quiz yet.",
      stats,
    };
  }
  const thinText = stats.score < 40 ? " Thin source: expect mostly call-ID questions." : "";
  return {
    id,
    state,
    available: true,
    label: "Start Game Plan Quiz",
    detail: `${items.length} Game Plan call${items.length === 1 ? "" : "s"} ready.${thinText}`,
    stats,
  };
}

function _buildGamePlanQuizItems() {
  if (typeof _gpEnsureBoard !== "function") return [];
  const board = _gpEnsureBoard();
  const seen = new Set();
  const items = [];
  Object.entries(board.assignments || {}).forEach(([boxId, list]) => {
    (Array.isArray(list) ? list : []).forEach((play, rawIdx) => {
      if (!play) return;
      const sig = typeof _gpPlaySignature === "function"
        ? _gpPlaySignature(play)
        : `${_quizPlainCall(play)}::${rawIdx}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      items.push({
        play,
        period: board.boxLabels?.[boxId] || boxId,
        scriptIndex: items.length,
        sourceBox: boxId,
      });
    });
  });
  return items;
}

function startPlayerQuizHubGamePlan() {
  const status = _getActiveGamePlanQuizStatus();
  if (!status.available) {
    showToast(status.detail || "Game Plan quiz is not open yet.", { type: "warning" });
    return;
  }
  const items = _buildGamePlanQuizItems();
  if (!items.length) {
    showToast("Add plays to the Game Plan before starting this quiz.", { type: "warning" });
    return;
  }
  closePlayerQuizHub();
  _quizMode = _playerQuizSelectedMode === "gameplan" ? "gameplan" : "quick";
  startScriptQuiz({
    items: _prepareQuizItemsForMode(items, _quizMode),
    sourceType: "gameplan",
    title: _quizModeTitle("Game Plan Quiz", _quizMode),
    positionKey: _quizPositionKey,
    positionMode: _quizPositionMode,
    mode: _quizMode,
  });
}

function _resetQuizGameState() {
  _quizRevealed = false;
  _quizAnswers = new Map();
  _quizChoiceCache = new Map();
  _quizCurrentChoices = [];
  _quizCurrentQuestion = null;
  _quizScore = 0;
  _quizStreak = 0;
  _quizBestStreak = 0;
  _quizFinished = false;
  _quizSavedAttemptId = "";
  _quizExitSummaryOpen = false;
}

function _quizItemKey(item) {
  if (!item || !item.play) return "";
  const sig = typeof playSignature === "function" ? playSignature(item.play) : "";
  return `${item.scriptIndex ?? _quizIndex}::${item.positionKey || _quizPositionKey}::${sig || _quizPlainCall(item.play)}`;
}

function _quizChoiceKey(item) {
  return _quizItemKey(item);
}

function _quizCleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function _quizPlainCall(play) {
  if (!play) return "Unnamed Play";
  const parts = [
    play.personnel,
    play.formation,
    play.formTag1,
    play.formTag2,
    play.shift,
    play.motion,
    play.protection,
    play.play,
    play.playTag1,
    play.playTag2,
  ]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim() || "Unnamed Play";
}

function _quizShuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function _quizUniqueChoices(items, getLabel) {
  const seen = new Set();
  return items
    .map((item) => ({ item, label: _quizCleanText(getLabel(item)) }))
    .filter((entry) => {
      const key = entry.label.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function _quizFormationLabel(play) {
  return _quizCleanText([
    play?.personnel,
    play?.formation,
    play?.formTag1,
    play?.formTag2,
  ].filter(Boolean).join(" "));
}

function _quizShortCall(play) {
  return _quizCleanText([
    play?.personnel,
    play?.formation,
    play?.play,
    play?.playTag1,
  ].filter(Boolean).join(" ")) || _quizPlainCall(play);
}

function _quizQuestionChoiceLabel(item, question) {
  const play = item?.play || item;
  if (!play) return "";
  switch (question?.type) {
    case "responsibility":
      return _quizCleanText(question.position?.key ? play[question.position.key] : "");
    case "diagram_formation":
      return _quizFormationLabel(play);
    case "play_type":
      return _quizCleanText(play.type);
    case "play_from_rule":
    case "diagram":
    case "formation_to_play":
    case "call":
      return _quizShortCall(play);
    default:
      return _quizShortCall(play);
  }
}

function _quizQuestionDistractorItems(item, question) {
  const source = _quizPlays.filter((candidate) => candidate && candidate !== item && candidate?.play);
  if (question?.type === "formation_to_play") {
    const correctFormation = _quizFormationLabel(item?.play).toLowerCase();
    return source.filter((candidate) => _quizFormationLabel(candidate.play).toLowerCase() !== correctFormation);
  }
  return source;
}

function _quizChoiceQuality(label, questionType = "call") {
  const text = _quizCleanText(label);
  if (!text) return { ok: false, reason: "blank" };
  const maxLength = questionType === "responsibility" ? 120 : questionType === "call" ? 72 : 90;
  if (text.length > maxLength) return { ok: false, reason: "too-long" };
  return { ok: true, reason: "" };
}

function _quizQuestionQuality(question, item, opts = {}) {
  if (!question || !item?.play) return { state: "study_only", reason: "missing-question" };
  if (question.type === "study_card") return { state: "study_only", reason: "study-card" };

  const correctLabel = _quizQuestionChoiceLabel(item, question);
  const correctQuality = _quizChoiceQuality(correctLabel, question.type);
  if (!correctQuality.ok) return { state: "study_only", reason: correctQuality.reason };

  const pool = _quizUniqueChoices(
    _quizQuestionDistractorItems(item, question),
    (candidate) => _quizQuestionChoiceLabel(candidate, question),
  ).filter((entry) => _quizChoiceQuality(entry.label, question.type).ok);
  const minimumDistractors = Number(opts.minimumDistractors ?? (question.type === "responsibility" ? 3 : 1));
  if (pool.length < minimumDistractors) {
    return { state: "study_only", reason: "not-enough-choices", choices: pool.length };
  }
  return {
    state: pool.length >= 3 ? "playable" : "thin",
    reason: "",
    choices: pool.length,
  };
}

function _buildQuizStudyCardQuestion(item, position, reason = "") {
  const diagramUrl = _quizDiagramUrl(item?.play);
  return {
    type: "study_card",
    prompt: "Study this one.",
    detailLabel: "No fair multiple choice",
    detailValue: reason === "not-enough-choices"
      ? "Not enough clean answer choices yet. Review the play, then keep going."
      : "Review the call, diagram, and rule without guessing.",
    diagramUrl,
    rule: _quizCleanText(position?.key ? item?.play?.[position.key] : ""),
    position,
    quality: { state: "study_only", reason },
  };
}

function _selectQuizQuestion(candidates, item) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const quality = _quizQuestionQuality(candidate, item, {
      minimumDistractors: candidate.type === "responsibility" ? 3 : 1,
    });
    if (quality.state !== "study_only") {
      return { ...candidate, quality };
    }
  }
  return null;
}

function _buildQuizQuestion(item) {
  const position = _getQuizPositionForItem(item);
  const enabledTypes = new Set(_getPlayerQuizSettings().enabledQuestionTypes || ["responsibility", "play_from_rule", "diagram", "call"]);
  const positionRule = _quizCleanText(position?.key ? item.play[position.key] : "");
  const positionLabel = position?.label || "your";
  const diagramUrl = _quizDiagramUrl(item.play);
  const canAskRules = enabledTypes.has("responsibility") && positionRule;
  const canAskRuleToPlay = enabledTypes.has("play_from_rule") && positionRule;
  const canAskVisual = enabledTypes.has("diagram") && diagramUrl;
  const canAskRecognition = enabledTypes.has("call");
  const ruleQuestion = canAskRules ? {
    type: "responsibility",
    prompt: `What's your ${positionLabel} responsibility?`,
    detailLabel: "Call",
    detailValue: _quizPlainCall(item.play),
    rule: positionRule,
    position,
  } : null;
  const diagramQuestion = canAskVisual ? {
    type: "diagram",
    prompt: "What play is this diagram?",
    detailLabel: "",
    detailValue: "",
    diagramUrl,
    rule: positionRule,
    position,
  } : null;
  const ruleToPlayQuestion = canAskRuleToPlay ? {
    type: "play_from_rule",
    prompt: `Which play has this ${positionLabel} rule?`,
    detailLabel: `${positionLabel} Rule`,
    detailValue: positionRule,
    rule: positionRule,
    position,
  } : null;
  const diagramFormationQuestion = canAskVisual && _quizFormationLabel(item.play) ? {
    type: "diagram_formation",
    prompt: "What formation is this diagram?",
    detailLabel: "",
    detailValue: "",
    diagramUrl,
    rule: positionRule,
    position,
  } : null;
  const formationQuestion = canAskRecognition && _quizFormationLabel(item.play) ? {
    type: "formation_to_play",
    prompt: "Which play starts from this formation?",
    detailLabel: "Formation",
    detailValue: _quizFormationLabel(item.play),
    rule: positionRule,
    position,
  } : null;
  const typeQuestion = canAskRecognition && _quizCleanText(item.play.type) ? {
    type: "play_type",
    prompt: "What type of play is this?",
    detailLabel: "Call clue",
    detailValue: _quizShortCall(item.play),
    rule: positionRule,
    position,
  } : null;
  const callQuestion = canAskRecognition ? {
    type: "call",
    prompt: "What's the call?",
    detailLabel: "",
    detailValue: "",
    rule: positionRule,
    position,
  } : null;

  const candidates = [];
  if (_quizMode === "diagram") {
    candidates.push(diagramQuestion, diagramFormationQuestion, formationQuestion, typeQuestion, callQuestion, ruleQuestion, ruleToPlayQuestion);
  } else if (_quizMode === "job") {
    candidates.push(ruleQuestion, ruleToPlayQuestion, diagramQuestion, diagramFormationQuestion, formationQuestion, typeQuestion, callQuestion);
  } else {
    if (_quizIndex % 3 !== 1) candidates.push(ruleQuestion);
    if (_quizIndex % 4 === 0 || !positionRule) candidates.push(diagramQuestion, diagramFormationQuestion);
    if (_quizIndex % 2 === 1) candidates.push(ruleToPlayQuestion);
    candidates.push(diagramQuestion, diagramFormationQuestion, formationQuestion, typeQuestion, callQuestion, ruleQuestion, ruleToPlayQuestion);
  }

  const selected = _selectQuizQuestion(candidates, item);
  if (selected) return selected;

  const attempted = candidates.filter(Boolean)[0];
  const reason = attempted ? _quizQuestionQuality(attempted, item).reason : "no-candidates";
  return _buildQuizStudyCardQuestion(item, position, reason);
}

function _buildQuizChoices(item) {
  const questionKey = _quizItemKey(item);
  if (_quizChoiceCache.has(questionKey)) {
    const cached = _quizChoiceCache.get(questionKey);
    return Array.isArray(cached) ? cached : cached.choices || [];
  }

  const question = _buildQuizQuestion(item);
  const correctLabel = _quizQuestionChoiceLabel(item, question);
  if (question.type === "study_card") {
    _quizChoiceCache.set(questionKey, { question, choices: [] });
    return [];
  }
  const correct = {
    key: `${_quizChoiceKey(item)}::${question.type}::correct`,
    play: item.play,
    label: correctLabel,
    correct: true,
    questionType: question.type,
  };
  const labels = new Set([correctLabel.toLowerCase()]);
  const pool = _quizShuffle(_quizQuestionDistractorItems(item, question))
    .map((candidate) => {
      const label = _quizQuestionChoiceLabel(candidate, question);
      return {
        key: `${_quizChoiceKey(candidate)}::${question.type}`,
        play: candidate.play,
        label,
        correct: false,
        questionType: question.type,
      };
    })
    .filter((choice) => {
      const labelKey = choice.label.toLowerCase();
      if (!labelKey || labels.has(labelKey)) return false;
      if (!_quizChoiceQuality(choice.label, question.type).ok) return false;
      labels.add(labelKey);
      return true;
    });

  const choices = _quizShuffle([correct, ...pool.slice(0, 3)]).map((choice, idx) => ({
    ...choice,
    color: SCRIPT_QUIZ_CHOICE_COLORS[idx % SCRIPT_QUIZ_CHOICE_COLORS.length],
  }));
  const result = choices.length >= 2 && _quizChoiceQuality(correctLabel, question.type).ok ? choices : [];
  _quizChoiceCache.set(questionKey, { question, choices: result });
  return result;
}

function _getQuizQuestionAndChoices(item) {
  const questionKey = _quizItemKey(item);
  const cached = _quizChoiceCache.get(questionKey);
  if (cached && Array.isArray(cached.choices)) return cached;
  const choices = _buildQuizChoices(item);
  const next = _quizChoiceCache.get(questionKey);
  if (next && Array.isArray(next.choices)) return next;
  return { question: _buildQuizQuestion(item), choices };
}

function _quizCoachDetails(itemOrPlay) {
  const item = itemOrPlay?.play ? itemOrPlay : null;
  const play = item ? item.play : itemOrPlay;
  const position = _getQuizPositionForItem(item);
  const positionRule = position?.key ? play[position.key] : "";
  const ruleParts = [positionRule, play.respNotes].filter(Boolean);
  const noteParts = [play.playerNotes, play.notes].filter(Boolean);
  return { ruleParts, noteParts, position };
}

function _quizQuestionTypeLabel(type) {
  const labels = {
    responsibility: "Responsibility",
    play_from_rule: "Rule to Play",
    diagram: "Diagram ID",
    diagram_formation: "Formation ID",
    formation_to_play: "Formation Match",
    play_type: "Play Type",
    study_card: "Study Card",
    call: "Call ID",
  };
  return labels[type] || "Quiz";
}

function _getQuizAnswerContext(item, answer) {
  if (!item || !answer) return null;
  const data = _getQuizQuestionAndChoices(item);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const selected = choices.find((choice) => choice.key === answer.choiceKey) || null;
  const correctChoice = choices.find((choice) => choice.correct) || null;
  const question = data.question || _buildQuizQuestion(item);
  return {
    question,
    selected,
    correctChoice,
    questionType: answer.questionType || question?.type || "call",
  };
}

function _quizDiagramUrl(play) {
  if (!play) return "";
  if (typeof window.getPlayImageUrl === "function") {
    return window.getPlayImageUrl(play) || "";
  }
  if (window.playImages && typeof window.playImages.urlForPlay === "function") {
    return window.playImages.urlForPlay(play) || "";
  }
  return "";
}

function _renderQuizRedactedDiagram(play, diagramUrl = _quizDiagramUrl(play)) {
  if (!diagramUrl) return "";
  const label = _quizPlainCall(play);
  return `
    <figure class="sq-diagram-prompt" aria-label="Redacted play diagram">
      <div class="sq-diagram-prompt__stage">
        <img src="${escapeAttr(diagramUrl)}" alt="Redacted diagram for quiz question" loading="lazy">
        <span class="sq-diagram-redaction-band" aria-hidden="true"></span>
      </div>
      <figcaption>Top title band hidden for quiz</figcaption>
      <span class="sr-only">Diagram for ${escapeHtml(label)} with title area redacted.</span>
    </figure>
  `;
}

function _renderQuizWrongReview(item, answer) {
  const context = _getQuizAnswerContext(item, answer);
  if (!context || answer.correct) return "";
  const { play } = item;
  const { ruleParts, noteParts, position } = _quizCoachDetails(item);
  const diagramUrl = _quizDiagramUrl(play);
  const correctLabel = context.correctChoice?.label || _quizPlainCall(play);
  const selectedLabel = context.selected?.label || "That answer";
  const sourceHint = context.questionType === "responsibility"
    ? `Study the ${position?.label || "your"} rule and connect it back to the call.`
    : context.questionType === "play_from_rule"
      ? "Match the rule language back to the full call."
      : context.questionType === "diagram_formation"
        ? "Use the formation picture, alignment, and personnel clues."
        : context.questionType === "formation_to_play"
          ? "Connect the formation clue back to the play name."
          : context.questionType === "play_type"
            ? "Sort the call into run, pass, screen, RPO, or another play family."
            : "Use the formation, personnel, and tags to identify the call.";
  return `
    <div class="sq-review-card" role="note" aria-label="Wrong answer review">
      <div class="sq-review-kicker">Review this one</div>
      <div class="sq-review-main">
        <span><strong>You picked</strong><small>${escapeHtml(selectedLabel)}</small></span>
        <span><strong>Correct answer</strong><small>${escapeHtml(correctLabel)}</small></span>
      </div>
      ${ruleParts.length ? `<div class="sq-review-detail"><strong>${escapeHtml(position?.label || "Your")} Rule:</strong> ${ruleParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${noteParts.length ? `<div class="sq-review-detail"><strong>Coach note:</strong> ${noteParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${diagramUrl ? `
        <figure class="sq-review-diagram">
          <img src="${escapeAttr(diagramUrl)}" alt="Correct play diagram" loading="lazy">
          <figcaption>Diagram to study</figcaption>
        </figure>
      ` : ""}
      <div class="sq-review-next">${escapeHtml(sourceHint)}</div>
    </div>
  `;
}

function _renderQuizChoice(choice, answer) {
  const answered = Boolean(answer);
  const selected = answer && answer.choiceKey === choice.key;
  const stateClass = answered && choice.correct
    ? " is-correct"
    : answered && selected
      ? " is-wrong"
      : "";
  const selectedAttr = selected ? ' aria-pressed="true"' : ' aria-pressed="false"';
  const disabledAttr = answered ? " disabled" : "";
  const icon = choice.color === "blue" ? "▲" : choice.color === "red" ? "◆" : choice.color === "gold" ? "●" : "■";
  return `
    <button type="button"
      class="script-quiz-choice script-quiz-choice--${escapeAttr(choice.color)}${stateClass}"
      data-action="answerScriptQuizChoice"
      data-arg="${escapeAttr(choice.key)}"
      ${selectedAttr}${disabledAttr}>
      <span class="sq-choice-icon" aria-hidden="true">${icon}</span>
      <span class="sq-choice-label">${escapeHtml(choice.label)}</span>
    </button>
  `;
}

function _getQuizChoiceLengthTone(choices) {
  const maxLength = (Array.isArray(choices) ? choices : []).reduce((max, choice) => (
    Math.max(max, _quizCleanText(choice?.label || "").length)
  ), 0);
  if (maxLength >= 86) return "very-long";
  if (maxLength >= 48) return "long";
  return "";
}

function _renderQuizFeedback(item, answer) {
  if (!answer) return "";
  const { play } = item;
  const fullCall = typeof getFullCall === "function"
    ? getFullCall(play, { showEmoji: false })
    : escapeHtml(_quizPlainCall(play));
  const defenseItems = [play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean);
  const { ruleParts, noteParts, position } = _quizCoachDetails(item);
  const resultText = answer.correct ? "Correct" : "Not this one";
  const resultClass = answer.correct ? "is-correct" : "is-wrong";
  return `
    <div class="sq-feedback ${resultClass}">
      <div class="sq-feedback-result">${resultText}</div>
      <div class="sq-answer-call">${fullCall}</div>
      ${defenseItems.length ? `<div class="sq-answer-defense">vs ${defenseItems.map(escapeHtml).join(" / ")}</div>` : ""}
      ${ruleParts.length ? `<div class="sq-answer-note"><strong>${escapeHtml(position?.label || "Your")} Rule:</strong> ${ruleParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${noteParts.length ? `<div class="sq-answer-note"><strong>Coach note:</strong> ${noteParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${_renderQuizWrongReview(item, answer)}
    </div>
  `;
}

function isScriptQuizAwaitingAnswer() {
  const item = _quizPlays[_quizIndex];
  if (!item) return false;
  const choices = _quizCurrentChoices.length ? _quizCurrentChoices : _getQuizQuestionAndChoices(item).choices;
  return choices.length >= 2 && !_quizAnswers.has(_quizItemKey(item));
}

function startScriptQuiz(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const sourceType = opts.sourceType === "gameplan" ? "gameplan" : "script";
  const items = Array.isArray(opts.items) ? opts.items : _buildQuizPlays(false);
  _quizMode = String(opts.mode || "full");
  const normalizedItems = opts.mode
    ? _prepareQuizItemsForMode(items, _quizMode)
    : _normalizeQuizItems(items);
  if (!normalizedItems.length) {
    showToast("Add plays to the script before starting a quiz", { type: "warning" });
    return;
  }
  _quizShuffled = false;
  _quizSourceType = sourceType;
  _quizSourceId = String(opts.sourceId || "");
  _quizSourceWeight = _getQuizSourceWeight(sourceType);
  _quizTitle = opts.title || (sourceType === "gameplan" ? "Game Plan Quiz" : "Practice Script Quiz");
  if (opts.positionMode) {
    _quizPositionMode = _normalizeQuizPositionMode(opts.positionMode);
  }
  if (opts.positionKey && _getQuizPositions().some((position) => position.key === opts.positionKey)) {
    _quizPositionKey = opts.positionKey;
    if (!opts.positionMode) _quizPositionMode = "manual";
  }
  _syncPlayerQuizPositionDefault();
  _setQuizPlays(_prepareQuizItemsForPositionMode(normalizedItems, _quizPositionMode), false);
  _quizIndex = 0;
  _resetQuizGameState();
  _clearPlayerQuizDraft();

  const overlay = document.getElementById("scriptQuizOverlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "scriptQuizOverlay",
      scrollElement: "scriptQuizCard",
      blocking: true,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
  }
  renderScriptQuizPlay();
}

function closeScriptQuiz() {
  const overlay = document.getElementById("scriptQuizOverlay");
  if (!overlay) return;
  if (!_quizFinished && _quizPlays.length && !_quizExitSummaryOpen) {
    _savePlayerQuizDraft();
    _renderQuizExitSummary();
    return;
  }
  if (_quizFinished) _renderPlayerQuizHub();
  if (typeof closeLayer === "function") {
    closeLayer(overlay);
  }
  overlay.classList.add("hidden");
  _quizExitSummaryOpen = false;
  if (document.getElementById("leaderboard")?.classList.contains("active")) {
    renderPlayerLeaderboardPage();
  }
}

function toggleScriptQuizShuffle() {
  _quizShuffled = !_quizShuffled;
  _setQuizPlays(_quizBasePlays, _quizShuffled);
  _quizIndex = 0;
  _resetQuizGameState();
  _clearPlayerQuizDraft();
  const btn = document.getElementById("scriptQuizShuffleBtn");
  if (btn) btn.classList.toggle("active", _quizShuffled);
  renderScriptQuizPlay();
  showToast(_quizShuffled ? "Quiz shuffled" : "Quiz in script order", { type: "info" });
}

function revealScriptQuizAnswer() {
  if (isScriptQuizAwaitingAnswer()) {
    showToast("Pick an answer first.", { type: "warning" });
    return;
  }
  _quizRevealed = true;
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  const answerEl = document.getElementById("scriptQuizAnswer");
  if (revealRow) revealRow.classList.add("hidden");
  if (answerEl) answerEl.classList.remove("hidden");
}

function nextScriptQuizPlay() {
  if (isScriptQuizAwaitingAnswer()) {
    showToast("Pick an answer first.", { type: "warning" });
    return;
  }
  if (_quizIndex >= _quizPlays.length - 1) {
    finishScriptQuiz();
    return;
  }
  if (_quizIndex < _quizPlays.length - 1) {
    _quizIndex++;
    renderScriptQuizPlay();
    _savePlayerQuizDraft();
  }
}

function prevScriptQuizPlay() {
  if (_quizIndex > 0) {
    _quizIndex--;
    renderScriptQuizPlay();
    _savePlayerQuizDraft();
  }
}

function answerScriptQuizChoice(choiceKey) {
  const item = _quizPlays[_quizIndex];
  if (!item) return;
  const questionKey = _quizItemKey(item);
  if (_quizAnswers.has(questionKey)) return;
  const choices = _quizCurrentChoices.length ? _quizCurrentChoices : _getQuizQuestionAndChoices(item).choices;
  const selected = choices.find((choice) => choice.key === choiceKey);
  if (!selected) return;
  const correct = Boolean(selected.correct);
  const position = _quizCurrentQuestion?.position || _getQuizPositionForItem(item);
  if (correct) {
    _quizStreak += 1;
    _quizBestStreak = Math.max(_quizBestStreak, _quizStreak);
    _quizScore += _getQuizCorrectAnswerPoints(_quizStreak);
  } else {
    _quizStreak = 0;
  }
  _quizAnswers.set(questionKey, {
    choiceKey,
    correct,
    questionType: selected.questionType || "call",
    positionKey: position?.key || item.positionKey || _quizPositionKey,
    positionLabel: position?.label || "",
    selectedLabel: selected.label || "",
    correctLabel: choices.find((choice) => choice.correct)?.label || "",
    prompt: _quizCurrentQuestion?.prompt || "",
    playCall: _quizPlainCall(item.play),
  });
  renderScriptQuizPlay();
  _savePlayerQuizDraft();
}

function _getQuizAnswerReviewRows() {
  return _quizPlays
    .map((item) => {
      const answer = _quizAnswers.get(_quizItemKey(item));
      if (!answer) return null;
      const context = _getQuizAnswerContext(item, answer);
      const correctLabel = context?.correctChoice?.label || answer.correctLabel || _quizPlainCall(item.play);
      const selectedLabel = context?.selected?.label || answer.selectedLabel || "";
      return {
        item,
        answer,
        correct: Boolean(answer.correct),
        questionType: answer.questionType || context?.questionType || "call",
        questionLabel: _quizQuestionTypeLabel(answer.questionType || context?.questionType || "call"),
        positionKey: answer.positionKey || item.positionKey || "",
        positionLabel: answer.positionLabel || context?.question?.position?.label || "",
        prompt: context?.question?.prompt || answer.prompt || "",
        selectedLabel,
        correctLabel,
        playCall: _quizPlainCall(item.play),
      };
    })
    .filter(Boolean);
}

function _summarizeQuizReviewRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const misses = list.filter((row) => !row.correct);
  const strengths = list.filter((row) => row.correct);
  const missTypes = [...new Set(misses.map((row) => row.questionLabel).filter(Boolean))];
  const strengthTypes = [...new Set(strengths.map((row) => row.questionLabel).filter(Boolean))];
  return {
    misses,
    strengths,
    missTypes,
    strengthTypes,
    nextReview: misses[0]?.playCall || "",
  };
}

function _renderQuizResultReview(summary, review) {
  const data = review || _summarizeQuizReviewRows(_getQuizAnswerReviewRows());
  const sourceLabel = summary.sourceType === "gameplan" ? "game plan" : "script";
  if (!data.misses.length) {
    const strengthText = data.strengthTypes.length
      ? `You were strongest on ${data.strengthTypes.slice(0, 2).join(" and ")} questions.`
      : `You handled every answered ${sourceLabel} question.`;
    return `
      <div class="sq-result-review sq-result-review--clean">
        <strong>Clean finish</strong>
        <span>${escapeHtml(strengthText)} Keep reviewing the next ${sourceLabel} before practice.</span>
      </div>
    `;
  }
  const missText = data.missTypes.length
    ? `Missed area${data.missTypes.length === 1 ? "" : "s"}: ${data.missTypes.slice(0, 3).join(", ")}.`
    : "Missed area: review the call and rule language.";
  return `
    <div class="sq-result-review">
      <strong>Review next: ${escapeHtml(data.nextReview || sourceLabel)}</strong>
      <span>${escapeHtml(missText)}</span>
      <div class="sq-result-miss-list">
        ${data.misses.slice(0, 3).map((row) => `
          <span>
            <b>${escapeHtml(row.questionLabel)}</b>
            <small>${escapeHtml(row.correctLabel)}</small>
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

function _buildQuizAttemptSummary(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const partial = Boolean(opts.partial);
  const answers = Array.from(_quizAnswers.values());
  const answered = answers.length;
  const correct = answers.filter((answer) => answer.correct).length;
  const wrong = answered - correct;
  const questionBreakdown = _summarizeQuizQuestionBreakdown(answers);
  const percent = answered ? Math.round((correct / answered) * 100) : 0;
  const badge = _getQuizBadge(percent);
  const bonusPoints = answered ? _getQuizBonusPoints(badge, answered, partial) : 0;
  const totalPoints = _quizScore + bonusPoints;
  const totalQuestions = _quizPlays.length;
  const remaining = Math.max(0, totalQuestions - answered);
  const now = new Date();
  const reviewRows = _getQuizAnswerReviewRows();
  const review = _summarizeQuizReviewRows(reviewRows);
  return {
    id: _quizSavedAttemptId || `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    player: _getQuizPlayerName(),
    sourceType: _quizSourceType,
    sourceId: _quizSourceId,
    title: _quizTitle,
    quizMode: _quizMode,
    quizModeLabel: _quizMode === "full"
      ? "Full Quiz"
      : (_getPlayerQuizModes().find((mode) => mode.key === _quizMode)?.label || "Quiz"),
    positionKey: _quizPositionKey,
    positionMode: _quizPositionMode,
    positionLabel: _getQuizPositionModeLabel(_quizPositionMode),
    score: _quizScore,
    bonusPoints,
    totalPoints,
    answered,
    correct,
    wrong,
    questionBreakdown,
    totalQuestions,
    remaining,
    percent,
    badge: badge.label,
    bestStreak: _quizBestStreak,
    review: {
      missedCount: review.misses.length,
      missTypes: review.missTypes,
      strengthTypes: review.strengthTypes,
      nextReview: review.nextReview,
    },
    reviewRows,
    completed: !partial,
    completedAt: now.toISOString(),
    dateKey: _quizDateKey(now),
    weekKey: _quizWeekKey(now),
  };
}

function _saveQuizAttempt(summary) {
  if (!summary || !summary.answered) return null;
  if (_quizSavedAttemptId) return summary;
  const attempts = _getPlayerQuizAttempts();
  attempts.push(summary);
  _savePlayerQuizAttempts(attempts);
  _quizSavedAttemptId = summary.id;
  return summary;
}

function _setScriptQuizOverlayOpen(open) {
  const overlay = document.getElementById("scriptQuizOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !open);
  if (open) {
    if (typeof openLayer === "function") {
      openLayer(overlay, {
        id: "scriptQuizOverlay",
        scrollElement: "scriptQuizCard",
        blocking: true,
      });
    } else if (typeof trapFocus === "function") {
      trapFocus(overlay);
    }
  } else if (typeof closeLayer === "function") {
    closeLayer(overlay);
  }
}

function _renderQuizExitSummary() {
  _quizExitSummaryOpen = true;
  const summary = _buildQuizAttemptSummary({ partial: true });
  const scenarioEl = document.getElementById("scriptQuizScenario");
  const answerEl = document.getElementById("scriptQuizAnswer");
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  const progressEl = document.getElementById("scriptQuizProgress");
  const scoreEl = document.getElementById("scriptQuizScore");
  const prevBtn = document.getElementById("scriptQuizPrevBtn");
  const nextBtn = document.getElementById("scriptQuizNextBtn");
  if (progressEl) progressEl.textContent = "Paused";
  if (scoreEl) scoreEl.textContent = `${Math.round(summary.totalPoints)} pts · ${summary.correct} right · ${summary.wrong} wrong`;
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = "Paused";
  }
  if (answerEl) answerEl.classList.add("hidden");
  if (revealRow) revealRow.classList.add("hidden");
  if (scenarioEl) {
    setInnerHTML(scenarioEl, `
      <div class="sq-exit-card">
        <div class="sq-exit-kicker">Quiz paused</div>
        <h3>You scored ${Math.round(summary.totalPoints)} points</h3>
        <p>${summary.correct} right · ${summary.wrong} wrong · ${summary.remaining} question${summary.remaining === 1 ? "" : "s"} left in this ${summary.sourceType === "gameplan" ? "game plan" : "script"}.</p>
        <div class="sq-exit-grid">
          <span><strong>${summary.answered}</strong><small>Answered</small></span>
          <span><strong>${summary.totalQuestions}</strong><small>Total</small></span>
          <span><strong>${summary.bestStreak}</strong><small>Best streak</small></span>
          <span><strong>${Math.round(summary.totalPoints)}</strong><small>Points</small></span>
        </div>
        <div class="sq-exit-actions">
          <button type="button" class="btn btn-primary" data-action="resumeScriptQuiz">Pick up where left off</button>
          <button type="button" class="btn btn-outline" data-action="saveAndCloseScriptQuiz">Save &amp; Close</button>
          <button type="button" class="btn btn-danger" data-action="endScriptQuiz">End Quiz</button>
        </div>
      </div>
    `);
  }
}

function resumeScriptQuiz() {
  if (!_quizPlays.length) return;
  _quizExitSummaryOpen = false;
  renderScriptQuizPlay();
}

function saveAndCloseScriptQuiz() {
  _savePlayerQuizDraft();
  _quizExitSummaryOpen = false;
  _setScriptQuizOverlayOpen(false);
  _renderPlayerQuizHub();
  if (document.getElementById("leaderboard")?.classList.contains("active")) {
    renderPlayerLeaderboardPage();
  }
}

function endScriptQuiz() {
  if (_quizFinished) return;
  const summary = _buildQuizAttemptSummary({ partial: true });
  _saveQuizAttempt(summary);
  _clearPlayerQuizDraft();
  _quizFinished = true;
  _quizExitSummaryOpen = false;
  _renderQuizResults(summary);
  _renderPlayerQuizHub();
}

function resumePlayerQuizDraft() {
  const draft = _getPlayerQuizDraft();
  if (!draft) {
    showToast("No quiz in progress.", { type: "info" });
    return false;
  }
  const playsFromDraft = _normalizeQuizItems(draft.plays);
  if (!playsFromDraft.length) {
    _clearPlayerQuizDraft();
    showToast("That saved quiz is no longer available.", { type: "warning" });
    return false;
  }
  _quizBasePlays = _normalizeQuizItems(draft.basePlays?.length ? draft.basePlays : draft.plays);
  _quizPlays = playsFromDraft;
  _quizIndex = Math.max(0, Math.min(Number(draft.index || 0), _quizPlays.length - 1));
  _quizShuffled = Boolean(draft.shuffled);
  _quizSourceType = draft.sourceType === "gameplan" ? "gameplan" : "script";
  _quizSourceId = String(draft.sourceId || "");
  _quizSourceWeight = Number(draft.sourceWeight || 0) || _getQuizSourceWeight(_quizSourceType);
  _quizTitle = draft.title || (_quizSourceType === "gameplan" ? "Game Plan Quiz" : "Practice Script Quiz");
  _quizMode = String(draft.quizMode || "full");
  _quizPositionMode = _normalizeQuizPositionMode(draft.positionMode || "manual");
  if (draft.positionKey && _getQuizPositions().some((position) => position.key === draft.positionKey)) {
    _quizPositionKey = draft.positionKey;
  }
  _quizAnswers = new Map(Array.isArray(draft.answers) ? draft.answers : []);
  _quizChoiceCache = new Map();
  _quizCurrentChoices = [];
  _quizCurrentQuestion = null;
  _quizScore = Number(draft.score || 0);
  _quizStreak = Number(draft.streak || 0);
  _quizBestStreak = Number(draft.bestStreak || 0);
  _quizFinished = false;
  _quizSavedAttemptId = "";
  _quizExitSummaryOpen = false;
  closePlayerQuizHub();
  _setScriptQuizOverlayOpen(true);
  renderScriptQuizPlay();
  return true;
}

function discardPlayerQuizDraft() {
  _clearPlayerQuizDraft();
  _renderPlayerQuizHub();
  if (document.getElementById("leaderboard")?.classList.contains("active")) {
    renderPlayerLeaderboardPage();
  }
  showToast("Saved quiz ended.", { type: "info" });
}

function _renderQuizResults(summary) {
  const scenarioEl = document.getElementById("scriptQuizScenario");
  const answerEl = document.getElementById("scriptQuizAnswer");
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  const sourceLabel = summary.sourceType === "gameplan" ? "Game Plan" : "Script";
  const statusLabel = summary.completed === false ? `${sourceLabel} Ended` : `${sourceLabel} Complete`;
  const tierAfter = _getQuizTier(_summarizeQuizAttempts().weeklyPoints);
  const review = _summarizeQuizReviewRows(_getQuizAnswerReviewRows());
  if (scenarioEl) {
    setInnerHTML(scenarioEl, `
      <div class="sq-result-card">
        <div class="sq-result-kicker">${escapeHtml(statusLabel)}</div>
        <div class="sq-result-score">${summary.percent}%</div>
        <div class="sq-result-title">${escapeHtml(summary.badge)}</div>
        <div class="sq-result-grid">
          <span><strong>${summary.correct}</strong><small>Correct</small></span>
          <span><strong>${summary.wrong || 0}</strong><small>Wrong</small></span>
          <span><strong>${summary.bestStreak}</strong><small>Best streak</small></span>
          <span><strong>${Math.round(summary.totalPoints)}</strong><small>Total points</small></span>
        </div>
        ${summary.remaining ? `<div class="sq-result-tier">${summary.remaining} question${summary.remaining === 1 ? "" : "s"} left in this ${summary.sourceType === "gameplan" ? "game plan" : "script"}.</div>` : ""}
        ${summary.bonusPoints ? `<div class="sq-result-bonus">+${summary.bonusPoints} bonus points · ${escapeHtml(summary.badge)}</div>` : ""}
        ${_renderQuizResultReview(summary, review)}
        <div class="sq-result-tier">Weekly tier now: <strong>${escapeHtml(tierAfter)}</strong></div>
        <div class="sq-result-actions">
          <button type="button" class="btn btn-primary sq-result-close" data-action="closeScriptQuiz">Done</button>
          <button type="button" class="btn btn-outline sq-result-close" data-action="closeScriptQuizToHub">Quiz Center</button>
        </div>
      </div>
    `);
  }
  if (answerEl) answerEl.classList.add("hidden");
  if (revealRow) revealRow.classList.add("hidden");
}

function finishScriptQuiz() {
  if (_quizFinished) return;
  _quizFinished = true;
  const summary = _buildQuizAttemptSummary();
  _saveQuizAttempt(summary);
  _clearPlayerQuizDraft();
  const progressEl = document.getElementById("scriptQuizProgress");
  if (progressEl) progressEl.textContent = "Complete";
  const periodEl = document.getElementById("scriptQuizPeriod");
  if (periodEl) {
    periodEl.textContent = "";
    periodEl.className = "script-quiz-period hidden";
  }
  const prevBtn = document.getElementById("scriptQuizPrevBtn");
  const nextBtn = document.getElementById("scriptQuizNextBtn");
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = "Complete";
  }
  const scoreEl = document.getElementById("scriptQuizScore");
  if (scoreEl) {
    scoreEl.textContent = summary.answered
      ? `${Math.round(summary.totalPoints)} pts · ${summary.badge}`
      : "Review complete";
  }
  _renderQuizResults(summary);
  _renderPlayerQuizHub();
}

function closeScriptQuizToHub() {
  closeScriptQuiz();
  openPlayerQuizHub();
}

function renderScriptQuizPlay() {
  const item = _quizPlays[_quizIndex];
  if (!item) return;
  if (_quizFinished) {
    _renderQuizResults(_buildQuizAttemptSummary());
    return;
  }
  const { play, period } = item;
  const questionKey = _quizItemKey(item);
  const answer = _quizAnswers.get(questionKey) || null;
  const questionData = _getQuizQuestionAndChoices(item);
  _quizCurrentQuestion = questionData.question;
  _quizCurrentChoices = questionData.choices;
  const gameMode = _quizCurrentChoices.length >= 2;
  _quizRevealed = Boolean(answer);

  const titleEl = document.getElementById("scriptQuizTitle");
  if (titleEl) titleEl.textContent = _quizTitle;

  // Progress
  const progressEl = document.getElementById("scriptQuizProgress");
  if (progressEl) progressEl.textContent = `${_quizIndex + 1} / ${_quizPlays.length}`;

  // Period label
  const periodEl = document.getElementById("scriptQuizPeriod");
  if (periodEl) {
    periodEl.textContent = period ? period : "";
    periodEl.className = period ? "script-quiz-period" : "script-quiz-period hidden";
  }

  // Nav buttons
  const prevBtn = document.getElementById("scriptQuizPrevBtn");
  const nextBtn = document.getElementById("scriptQuizNextBtn");
  if (prevBtn) prevBtn.disabled = _quizIndex === 0;
  if (nextBtn) {
    nextBtn.disabled = gameMode && !answer;
    nextBtn.textContent = _quizIndex === _quizPlays.length - 1 ? "Finish" : "Next ▶";
  }

  // Score / context
  const scoreEl = document.getElementById("scriptQuizScore");
  if (scoreEl) {
    scoreEl.textContent = gameMode
      ? `Score ${_quizScore} · Streak ${_quizStreak}`
      : `Play ${_quizIndex + 1} of ${_quizPlays.length}`;
  }

  // Scenario — show the SITUATION without revealing the call
  const downLabel = play.preferredDown ? `${_ordinalDown(play.preferredDown)} Down` : "";
  const distLabel = play.preferredDistance ? `& ${play.preferredDistance}` : "";
  const posLabel = play.preferredFieldPosition ? play.preferredFieldPosition : "";
  const hashLabel = play.preferredHash ? play.preferredHash : "";
  const situationLabel = play.preferredSituation ? play.preferredSituation : "";
  const personnelLabel = play.personnel ? play.personnel : "";
  const tempoLabel = play.tempo ? play.tempo : "";
  const typeLabel = play.type ? play.type : "";
  const sourceLabel = _quizSourceType === "gameplan" ? "Game Plan" : "Script";
  const weightLabel = _quizSourceWeight === 1 ? "1.0x" : `${_quizSourceWeight}x`;
  const question = _quizCurrentQuestion || _buildQuizQuestion(item);
  const detailValue = _quizCleanText(question.detailValue);
  const diagramPromptHtml = ["diagram", "diagram_formation", "study_card"].includes(question.type)
    ? _renderQuizRedactedDiagram(play, question.diagramUrl)
    : "";

  const situationParts = [downLabel && distLabel ? `${downLabel} ${distLabel}` : downLabel || distLabel, posLabel, hashLabel, situationLabel].filter(Boolean);
  const callContextParts = [personnelLabel, tempoLabel, typeLabel].filter(Boolean);
  const choicesHtml = gameMode
    ? `<div class="script-quiz-choices" role="group" aria-label="Answer choices">
        ${_quizCurrentChoices.map((choice) => _renderQuizChoice(choice, answer)).join("")}
      </div>`
    : "";
  const choiceLengthTone = gameMode ? _getQuizChoiceLengthTone(_quizCurrentChoices) : "";
  const scenarioClasses = [
    "script-quiz-scenario",
    gameMode ? "script-quiz-scenario--game" : "",
    choiceLengthTone ? `script-quiz-scenario--${choiceLengthTone}-choices` : "",
  ].filter(Boolean).join(" ");

  const scenarioHtml = `
    ${gameMode ? `
    <div class="sq-game-topline">
      <span class="sq-game-pill">Score ${_quizScore}</span>
      <span class="sq-game-pill">Streak ${_quizStreak}</span>
      <span class="sq-game-pill">${escapeHtml(sourceLabel)} · ${escapeHtml(weightLabel)}</span>
      <span class="sq-game-pill">${escapeHtml(_quizQuestionTypeLabel(question.type))}</span>
    </div>` : ""}
    <div class="sq-scenario-hint">${escapeHtml(question.prompt)}</div>
    ${diagramPromptHtml}
    ${detailValue ? `
    <div class="sq-scenario-block sq-scenario-block--quiz-detail">
      <div class="sq-scenario-label">${escapeHtml(question.detailLabel)}</div>
      <div class="sq-scenario-value">${escapeHtml(detailValue)}</div>
    </div>` : ""}
    <div class="sq-scenario-block sq-scenario-block--situation">
      <div class="sq-scenario-label">Situation</div>
      <div class="sq-scenario-value sq-situation">${situationParts.length ? situationParts.map(escapeHtml).join(" · ") : "<em style='opacity:.5'>No situation set</em>"}</div>
    </div>
    ${callContextParts.length ? `
    <div class="sq-scenario-block sq-scenario-block--call-meta">
      <div class="sq-scenario-label">Tags</div>
      <div class="sq-scenario-value">${callContextParts.map(escapeHtml).join(" · ")}</div>
    </div>` : ""}
    ${play.practiceFront || play.practiceCoverage || play.practiceBlitz ? `
    <div class="sq-scenario-block sq-scenario-block--defense">
      <div class="sq-scenario-label">Defense</div>
      <div class="sq-scenario-value sq-defense">${[play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean).map(escapeHtml).join(" / ")}</div>
    </div>` : ""}
    ${choicesHtml}
  `;
  const scenarioEl = document.getElementById("scriptQuizScenario");
  if (scenarioEl) {
    scenarioEl.className = scenarioClasses;
    setInnerHTML(scenarioEl, scenarioHtml);
  }

  // Answer — hidden until revealed
  const fullCall = typeof getFullCall === "function" ? getFullCall(play, { showEmoji: false }) : escapeHtml([play.formation, play.play].filter(Boolean).join(" "));
  const defenseItems = [play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean);
  const { ruleParts, noteParts, position } = _quizCoachDetails(item);
  const answerHtml = `
    <div class="sq-answer-call">${fullCall}</div>
    ${defenseItems.length ? `<div class="sq-answer-defense">vs ${defenseItems.map(escapeHtml).join(" / ")}</div>` : ""}
    ${ruleParts.length ? `<div class="sq-answer-note"><strong>${escapeHtml(position?.label || "Your")} Rule:</strong> ${ruleParts.map(escapeHtml).join(" ")}</div>` : ""}
    ${noteParts.length ? `<div class="sq-answer-note"><strong>Coach note:</strong> ${noteParts.map(escapeHtml).join(" ")}</div>` : ""}
  `;
  const answerEl = document.getElementById("scriptQuizAnswer");
  if (answerEl) {
    setInnerHTML(answerEl, gameMode ? _renderQuizFeedback(item, answer) : answerHtml);
    answerEl.classList.toggle("hidden", gameMode ? !answer : true);
  }
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  if (revealRow) revealRow.classList.toggle("hidden", gameMode);
}

function _ordinalDown(n) {
  const map = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th" };
  return map[String(n)] || `${n}th`;
}
