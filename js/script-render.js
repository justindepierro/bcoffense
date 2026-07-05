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
let _quizSourceWeight = 1;
let _quizTitle = "Play Quiz";
let _quizPositionKey = "respQ";
let _quizFinished = false;
let _quizSavedAttemptId = "";

const SCRIPT_QUIZ_CHOICE_COLORS = ["blue", "red", "gold", "green"];
const PLAYER_QUIZ_WEEKLY_GOAL = 1000;
const PLAYER_QUIZ_SOURCE_WEIGHTS = {
  script: 1,
  gameplan: 1.25,
};
const PLAYER_QUIZ_TIERS = ["Champion", "Baller", "Starter", "Contributor", "Defense"];
const PLAYER_QUIZ_BADGES = [
  { min: 95, label: "Coaches List", bonus: 150 },
  { min: 90, label: "High Honor Roll", bonus: 100 },
  { min: 85, label: "Honor Roll", bonus: 50 },
];

function _getPlayerQuizStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_RESULTS
    ? STORAGE_KEYS.PLAYER_QUIZ_RESULTS
    : "playerQuizResults";
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
  return PLAYER_QUIZ_BADGES.find((badge) => percent >= badge.min) || {
    min: 0,
    label: "Keep Climbing",
    bonus: 0,
  };
}

function _getQuizTier(points) {
  if (points >= PLAYER_QUIZ_WEEKLY_GOAL) return "Champion";
  if (points >= 750) return "Baller";
  if (points >= 500) return "Starter";
  if (points >= 250) return "Contributor";
  return "Defense";
}

function _getQuizPlayerName() {
  if (typeof currentAuthUser !== "undefined" && currentAuthUser?.username) {
    return currentAuthUser.username;
  }
  return "You";
}

function _summarizeQuizAttempts() {
  const attempts = _getPlayerQuizAttempts();
  const now = new Date();
  const weekKey = _quizWeekKey(now);
  const player = _getQuizPlayerName();
  const playerAttempts = attempts.filter((attempt) => (attempt.player || "You") === player);
  const weeklyAttempts = playerAttempts.filter((attempt) => attempt.weekKey === weekKey);
  const weeklyPoints = weeklyAttempts.reduce((sum, attempt) => sum + Number(attempt.totalPoints || 0), 0);
  const seasonPoints = playerAttempts.reduce((sum, attempt) => sum + Number(attempt.totalPoints || 0), 0);
  const bestPercent = playerAttempts.reduce((best, attempt) => Math.max(best, Number(attempt.percent || 0)), 0);
  const bestBadge = _getQuizBadge(bestPercent);
  return {
    attempts,
    player,
    weekKey,
    weeklyAttempts,
    weeklyPoints,
    seasonPoints,
    bestPercent,
    bestBadge,
    tier: _getQuizTier(weeklyPoints),
  };
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
      if (item.play) {
        return {
          play: item.play,
          period: item.period || "",
          scriptIndex: item.scriptIndex ?? index,
          sourceBox: item.sourceBox || "",
        };
      }
      return {
        play: item,
        period: "",
        scriptIndex: index,
        sourceBox: "",
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

function _getPlayerQuizScriptOptions() {
  const savedScripts = typeof getSavedScripts === "function" ? getSavedScripts() : [];
  return (Array.isArray(savedScripts) ? savedScripts : [])
    .filter((savedScript) => savedScript && savedScript.id)
    .map((savedScript) => {
      const stats = typeof getSavedScriptStats === "function" ? getSavedScriptStats(savedScript) : null;
      return {
        id: String(savedScript.id),
        name: savedScript.name || "Published Practice",
        playCount: stats?.playCount || 0,
        date: savedScript.date || "",
      };
    });
}

function _renderPlayerQuizHub() {
  const summary = _summarizeQuizAttempts();
  const weeklyPointsEl = document.getElementById("playerQuizWeeklyPoints");
  if (weeklyPointsEl) {
    weeklyPointsEl.textContent = `${Math.round(summary.weeklyPoints)} / ${PLAYER_QUIZ_WEEKLY_GOAL}`;
  }
  const weeklyMetaEl = document.getElementById("playerQuizWeeklyMeta");
  if (weeklyMetaEl) {
    weeklyMetaEl.textContent = `${summary.weeklyAttempts.length} attempt${summary.weeklyAttempts.length === 1 ? "" : "s"} this week`;
  }
  const tierEl = document.getElementById("playerQuizCurrentTier");
  if (tierEl) tierEl.textContent = summary.tier;
  const tierMetaEl = document.getElementById("playerQuizTierMeta");
  if (tierMetaEl) {
    const remaining = Math.max(0, PLAYER_QUIZ_WEEKLY_GOAL - summary.weeklyPoints);
    tierMetaEl.textContent = remaining ? `${Math.round(remaining)} to Champion` : "Champion standard met";
  }
  const bestBadgeEl = document.getElementById("playerQuizBestBadge");
  if (bestBadgeEl) {
    bestBadgeEl.textContent = summary.bestPercent ? summary.bestBadge.label : "No attempts";
  }
  const badgeMetaEl = document.getElementById("playerQuizBadgeMeta");
  if (badgeMetaEl) {
    badgeMetaEl.textContent = summary.bestPercent
      ? `Best ${Math.round(summary.bestPercent)}% · season ${Math.round(summary.seasonPoints)} pts`
      : "85 / 90 / 95 unlock bonuses";
  }
  const leaderboardEl = document.getElementById("playerQuizLeaderboardPreview");
  if (leaderboardEl) {
    leaderboardEl.innerHTML = `
      <div class="player-quiz-leader-row">
        <span class="player-quiz-rank">#1</span>
        <strong>${escapeHtml(summary.player)}</strong>
        <span>${escapeHtml(summary.tier)}</span>
        <b>${Math.round(summary.weeklyPoints)} pts</b>
      </div>
    `;
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
  if (select) {
    const options = _getPlayerQuizScriptOptions();
    if (options.length) {
      select.innerHTML = options
        .map((option) => {
          const count = option.playCount ? ` · ${option.playCount} plays` : "";
          const date = option.date ? `${option.date} · ` : "";
          return `<option value="${escapeAttr(option.id)}">${escapeHtml(date + option.name + count)}</option>`;
        })
        .join("");
    } else {
      select.innerHTML = `<option value="">Current practice</option>`;
    }
  }
}

function openPlayerQuizHub() {
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
  _renderPlayerQuizHub();
}

function startPlayerQuizHubScript() {
  const select = document.getElementById("playerQuizScriptSelect");
  const id = select ? select.value : "";
  closePlayerQuizHub();
  if (typeof startPlayerScriptQuiz === "function") {
    startPlayerScriptQuiz(id || "");
    return;
  }
  startScriptQuiz({
    sourceType: "script",
    title: "Practice Script Quiz",
    positionKey: _quizPositionKey,
  });
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
  const items = _buildGamePlanQuizItems();
  if (!items.length) {
    showToast("Add plays to the Game Plan before starting this quiz.", { type: "warning" });
    return;
  }
  closePlayerQuizHub();
  startScriptQuiz({
    items,
    sourceType: "gameplan",
    title: "Game Plan Quiz",
    positionKey: _quizPositionKey,
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
}

function _quizItemKey(item) {
  if (!item || !item.play) return "";
  const sig = typeof playSignature === "function" ? playSignature(item.play) : "";
  return `${item.scriptIndex ?? _quizIndex}::${sig || _quizPlainCall(item.play)}`;
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

function _buildQuizQuestion(item) {
  const position = _getQuizPosition();
  const positionRule = _quizCleanText(position?.key ? item.play[position.key] : "");
  const rulePool = _quizUniqueChoices(
    _quizPlays.filter((candidate) => candidate?.play && candidate.play !== item.play),
    (candidate) => position?.key ? candidate.play[position.key] : "",
  );
  const callPool = _quizUniqueChoices(
    _quizPlays.filter((candidate) => candidate?.play && candidate !== item),
    (candidate) => _quizPlainCall(candidate.play),
  );
  const positionLabel = position?.label || "your";

  if (positionRule && rulePool.length >= 3 && _quizIndex % 3 !== 1) {
    return {
      type: "responsibility",
      prompt: `What's your ${positionLabel} responsibility?`,
      detailLabel: "Call",
      detailValue: _quizPlainCall(item.play),
      rule: positionRule,
      position,
    };
  }

  if (positionRule && callPool.length >= 1 && _quizIndex % 2 === 1) {
    return {
      type: "play_from_rule",
      prompt: `Which play has this ${positionLabel} rule?`,
      detailLabel: `${positionLabel} Rule`,
      detailValue: positionRule,
      rule: positionRule,
      position,
    };
  }

  return {
    type: "call",
    prompt: "What's the call?",
    detailLabel: "",
    detailValue: "",
    rule: positionRule,
    position,
  };
}

function _buildQuizChoices(item) {
  const questionKey = _quizItemKey(item);
  if (_quizChoiceCache.has(questionKey)) {
    const cached = _quizChoiceCache.get(questionKey);
    return Array.isArray(cached) ? cached : cached.choices || [];
  }

  const question = _buildQuizQuestion(item);
  const correctLabel = question.type === "responsibility"
    ? question.rule
    : _quizPlainCall(item.play);
  const correct = {
    key: `${_quizChoiceKey(item)}::${question.type}::correct`,
    play: item.play,
    label: correctLabel,
    correct: true,
    questionType: question.type,
  };
  const labels = new Set([correctLabel.toLowerCase()]);
  const pool = _quizShuffle(_quizPlays.filter((candidate) => candidate !== item && candidate?.play))
    .map((candidate) => {
      const label = question.type === "responsibility"
        ? _quizCleanText(question.position?.key ? candidate.play[question.position.key] : "")
        : _quizPlainCall(candidate.play);
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
      labels.add(labelKey);
      return true;
    });

  const choices = _quizShuffle([correct, ...pool.slice(0, 3)]).map((choice, idx) => ({
    ...choice,
    color: SCRIPT_QUIZ_CHOICE_COLORS[idx % SCRIPT_QUIZ_CHOICE_COLORS.length],
  }));
  const result = choices.length >= 2 ? choices : [];
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

function _quizCoachDetails(play) {
  const position = _getQuizPosition();
  const positionRule = position?.key ? play[position.key] : "";
  const ruleParts = [positionRule, play.respNotes].filter(Boolean);
  const noteParts = [play.playerNotes, play.notes].filter(Boolean);
  return { ruleParts, noteParts, position };
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

function _renderQuizFeedback(item, answer) {
  if (!answer) return "";
  const { play } = item;
  const fullCall = typeof getFullCall === "function"
    ? getFullCall(play, { showEmoji: false })
    : escapeHtml(_quizPlainCall(play));
  const defenseItems = [play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean);
  const { ruleParts, noteParts, position } = _quizCoachDetails(play);
  const resultText = answer.correct ? "Correct" : "Not this one";
  const resultClass = answer.correct ? "is-correct" : "is-wrong";
  return `
    <div class="sq-feedback ${resultClass}">
      <div class="sq-feedback-result">${resultText}</div>
      <div class="sq-answer-call">${fullCall}</div>
      ${defenseItems.length ? `<div class="sq-answer-defense">vs ${defenseItems.map(escapeHtml).join(" / ")}</div>` : ""}
      ${ruleParts.length ? `<div class="sq-answer-note"><strong>${escapeHtml(position?.label || "Your")} Rule:</strong> ${ruleParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${noteParts.length ? `<div class="sq-answer-note"><strong>Coach note:</strong> ${noteParts.map(escapeHtml).join(" ")}</div>` : ""}
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
  const normalizedItems = _normalizeQuizItems(items);
  if (!normalizedItems.length) {
    showToast("Add plays to the script before starting a quiz", { type: "warning" });
    return;
  }
  _quizShuffled = false;
  _quizSourceType = sourceType;
  _quizSourceWeight = PLAYER_QUIZ_SOURCE_WEIGHTS[sourceType] || 1;
  _quizTitle = opts.title || (sourceType === "gameplan" ? "Game Plan Quiz" : "Practice Script Quiz");
  if (opts.positionKey && _getQuizPositions().some((position) => position.key === opts.positionKey)) {
    _quizPositionKey = opts.positionKey;
  }
  _setQuizPlays(normalizedItems, false);
  _quizIndex = 0;
  _resetQuizGameState();

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
  if (_quizFinished) _renderPlayerQuizHub();
  if (typeof closeLayer === "function") {
    closeLayer(overlay);
  }
  overlay.classList.add("hidden");
}

function toggleScriptQuizShuffle() {
  _quizShuffled = !_quizShuffled;
  _setQuizPlays(_quizBasePlays, _quizShuffled);
  _quizIndex = 0;
  _resetQuizGameState();
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
  }
}

function prevScriptQuizPlay() {
  if (_quizIndex > 0) {
    _quizIndex--;
    renderScriptQuizPlay();
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
  if (correct) {
    _quizStreak += 1;
    _quizBestStreak = Math.max(_quizBestStreak, _quizStreak);
    _quizScore += Math.round((100 + Math.min(_quizStreak - 1, 4) * 25) * _quizSourceWeight);
  } else {
    _quizStreak = 0;
  }
  _quizAnswers.set(questionKey, { choiceKey, correct, questionType: selected.questionType || "call" });
  renderScriptQuizPlay();
}

function _buildQuizAttemptSummary() {
  const answers = Array.from(_quizAnswers.values());
  const answered = answers.length;
  const correct = answers.filter((answer) => answer.correct).length;
  const percent = answered ? Math.round((correct / answered) * 100) : 0;
  const badge = _getQuizBadge(percent);
  const bonusPoints = answered ? badge.bonus : 0;
  const totalPoints = _quizScore + bonusPoints;
  const now = new Date();
  return {
    id: _quizSavedAttemptId || `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    player: _getQuizPlayerName(),
    sourceType: _quizSourceType,
    title: _quizTitle,
    positionKey: _quizPositionKey,
    positionLabel: _getQuizPosition()?.label || "",
    score: _quizScore,
    bonusPoints,
    totalPoints,
    answered,
    correct,
    percent,
    badge: badge.label,
    bestStreak: _quizBestStreak,
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

function _renderQuizResults(summary) {
  const scenarioEl = document.getElementById("scriptQuizScenario");
  const answerEl = document.getElementById("scriptQuizAnswer");
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  const sourceLabel = summary.sourceType === "gameplan" ? "Game Plan" : "Script";
  const tierAfter = _getQuizTier(_summarizeQuizAttempts().weeklyPoints);
  if (scenarioEl) {
    setInnerHTML(scenarioEl, `
      <div class="sq-result-card">
        <div class="sq-result-kicker">${escapeHtml(sourceLabel)} Complete</div>
        <div class="sq-result-score">${summary.percent}%</div>
        <div class="sq-result-title">${escapeHtml(summary.badge)}</div>
        <div class="sq-result-grid">
          <span><strong>${summary.correct}</strong><small>Correct</small></span>
          <span><strong>${summary.answered}</strong><small>Answered</small></span>
          <span><strong>${summary.bestStreak}</strong><small>Best streak</small></span>
          <span><strong>${Math.round(summary.totalPoints)}</strong><small>Total points</small></span>
        </div>
        ${summary.bonusPoints ? `<div class="sq-result-bonus">+${summary.bonusPoints} bonus points · ${escapeHtml(summary.badge)}</div>` : ""}
        <div class="sq-result-tier">Weekly tier now: <strong>${escapeHtml(tierAfter)}</strong></div>
        <button type="button" class="btn btn-primary sq-result-close" data-action="closeScriptQuiz">Done</button>
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
  const position = _getQuizPosition();
  const positionRule = position?.key ? play[position.key] : "";
  const sourceLabel = _quizSourceType === "gameplan" ? "Game Plan" : "Script";
  const weightLabel = _quizSourceWeight === 1 ? "1.0x" : `${_quizSourceWeight}x`;
  const question = _quizCurrentQuestion || _buildQuizQuestion(item);
  const detailValue = _quizCleanText(question.detailValue);

  const situationParts = [downLabel && distLabel ? `${downLabel} ${distLabel}` : downLabel || distLabel, posLabel, hashLabel, situationLabel].filter(Boolean);
  const callContextParts = [sourceLabel, `${weightLabel} points`, personnelLabel, tempoLabel, typeLabel].filter(Boolean);
  const choicesHtml = gameMode
    ? `<div class="script-quiz-choices" role="group" aria-label="Answer choices">
        ${_quizCurrentChoices.map((choice) => _renderQuizChoice(choice, answer)).join("")}
      </div>`
    : "";

  const scenarioHtml = `
    ${gameMode ? `
    <div class="sq-game-topline">
      <span class="sq-game-pill">Score ${_quizScore}</span>
      <span class="sq-game-pill">Streak ${_quizStreak}</span>
      <span class="sq-game-pill">Best ${_quizBestStreak}</span>
      <span class="sq-game-pill">${escapeHtml(sourceLabel)} · ${escapeHtml(weightLabel)}</span>
      <span class="sq-game-pill">${escapeHtml(question.type === "responsibility" ? "Rule Match" : question.type === "play_from_rule" ? "Rule to Play" : "Call ID")}</span>
    </div>` : ""}
    ${detailValue ? `
    <div class="sq-scenario-block sq-scenario-block--quiz-detail">
      <div class="sq-scenario-label">${escapeHtml(question.detailLabel)}</div>
      <div class="sq-scenario-value">${escapeHtml(detailValue)}</div>
    </div>` : ""}
    <div class="sq-scenario-block">
      <div class="sq-scenario-label">Situation</div>
      <div class="sq-scenario-value sq-situation">${situationParts.length ? situationParts.map(escapeHtml).join(" · ") : "<em style='opacity:.5'>No situation set</em>"}</div>
    </div>
    ${callContextParts.length ? `
    <div class="sq-scenario-block">
      <div class="sq-scenario-label">Context</div>
      <div class="sq-scenario-value">${callContextParts.map(escapeHtml).join(" · ")}</div>
    </div>` : ""}
    ${play.practiceFront || play.practiceCoverage || play.practiceBlitz ? `
    <div class="sq-scenario-block">
      <div class="sq-scenario-label">Defense</div>
      <div class="sq-scenario-value sq-defense">${[play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean).map(escapeHtml).join(" / ")}</div>
    </div>` : ""}
    ${position ? `
    <div class="sq-scenario-block sq-scenario-block--position">
      <div class="sq-scenario-label">Your Spot</div>
      <div class="sq-scenario-value">${escapeHtml(position.label)}${positionRule ? ` · rule ready` : " · no rule yet"}</div>
    </div>` : ""}
    <div class="sq-scenario-hint">${escapeHtml(question.prompt)}</div>
    ${choicesHtml}
  `;
  const scenarioEl = document.getElementById("scriptQuizScenario");
  if (scenarioEl) setInnerHTML(scenarioEl, scenarioHtml);

  // Answer — hidden until revealed
  const fullCall = typeof getFullCall === "function" ? getFullCall(play, { showEmoji: false }) : escapeHtml([play.formation, play.play].filter(Boolean).join(" "));
  const defenseItems = [play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean);
  const answerHtml = `
    <div class="sq-answer-call">${fullCall}</div>
    ${defenseItems.length ? `<div class="sq-answer-defense">vs ${defenseItems.map(escapeHtml).join(" / ")}</div>` : ""}
    ${play.notes ? `<div class="sq-answer-notes">${escapeHtml(play.notes)}</div>` : ""}
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
