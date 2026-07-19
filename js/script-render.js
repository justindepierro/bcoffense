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
          <details class="period-actions-menu">
            <summary aria-label="Actions for ${escapeHtml(periodLabel)}">
              <span aria-hidden="true">⋯</span> Period Actions
            </summary>
            <div class="period-actions-menu-panel" role="group" aria-label="Actions for ${escapeHtml(periodLabel)}">
              ${actions.map(([action, label, icon, title, extraClass = ""]) => renderPeriodActionButton(action, index, label, icon, title, extraClass)).join("")}
            </div>
          </details>
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

function renderScriptPlayControls(play, index, playLabel, reps, signalCount = 0) {
  const hasClip =
    typeof window.playClips !== "undefined" &&
    typeof window.playClips.hasForPlay === "function" &&
    window.playClips.hasForPlay(play);
  const clipBtn = hasClip
    ? `<button class="script-clip-btn" data-action="openScriptClipViewer" data-arg="${index}" title="Watch video clips" aria-label="Watch video clips for ${escapeHtml(playLabel)}">🎬</button>`
    : "";
  const signalBtn = signalCount
    ? `<button class="script-signal-btn" data-action="openScriptSignalSelector" data-arg="${index}" title="Watch signals" aria-label="Watch ${signalCount} signal clips for ${escapeHtml(playLabel)}">Signals</button>`
    : "";
  const discussionBtn = typeof getPlayThreadId === "function"
    ? `<button class="script-disc-btn" data-action="openScriptDiscussion" data-arg="${index}" title="View discussion" aria-label="Discussion for ${escapeHtml(playLabel)}">💬</button>`
    : "";
  const askCoachBtn = typeof getPlayThreadId === "function"
    ? `<button class="script-ask-coach-btn" data-action="scriptAskCoachQuestion" data-arg="${index}" title="Ask a question about this play" aria-label="Ask coach about ${escapeHtml(playLabel)}">❓</button>`
    : "";
  // Put the script-only personnel picker in the play's primary action strip.
  // It is intentionally beside the pencil so it is discoverable while the
  // pencil continues to mean "edit the source Playbook play."
  const personnelBtn = typeof renderScriptPersonnelOverrideButton === "function"
    ? renderScriptPersonnelOverrideButton(play, index, playLabel, { compact: true })
    : "";
  return `
      <div class="play-controls">
        <div class="play-control-fields">
          <input class="play-reps-input" type="number" value="${reps}" min="1" data-field="reps" data-idx="${index}" title="Reps" aria-label="Reps for ${escapeHtml(playLabel)}">
          <input class="play-notes-input" type="text" value="${escapeHtml(play.notes || "")}" placeholder="Notes" data-field="notes" data-idx="${index}" aria-label="Notes for ${escapeHtml(playLabel)}">
        </div>
        <div class="play-control-actions" aria-label="Actions for ${escapeHtml(playLabel)}">
          <div class="script-play-action-group script-play-action-group--study" aria-label="Study media">
            ${signalBtn}
            ${clipBtn}
            <button class="script-present-btn" data-action="openScriptPresentation" data-idx="${index}" title="Open player study view" aria-label="Open player study view for ${escapeHtml(playLabel)}">▶</button>
          </div>
          ${discussionBtn || askCoachBtn ? `<div class="script-play-action-group script-play-action-group--discussion" aria-label="Discussion">${discussionBtn}${askCoachBtn}</div>` : ""}
          ${personnelBtn ? `<div class="script-play-action-group script-play-action-group--personnel" aria-label="Script personnel">${personnelBtn}</div>` : ""}
          <div class="script-play-action-group script-play-action-group--edit" aria-label="Playbook and script actions">
            <button class="script-edit-play-btn" data-action="openPlayEditorFromScript" data-arg="${index}" title="Edit this play in the playbook" aria-label="Edit play ${escapeHtml(playLabel)}">✏️</button>
            <button class="dup-btn" data-action="duplicatePlay" data-idx="${index}" title="Duplicate this script play" aria-label="Duplicate ${escapeHtml(playLabel)}">⧉</button>
          </div>
          <div class="script-play-action-group script-play-action-group--remove" aria-label="Remove from script">
            <button class="remove" data-action="removeFromScript" data-idx="${index}" title="Remove from this script" aria-label="Remove ${escapeHtml(playLabel)}">✕</button>
          </div>
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
  const signalCount =
    !opts.printStyle && typeof getSignalCountForPlay === "function"
      ? getSignalCountForPlay(play)
      : 0;
  const itemClasses = [
    "script-item",
    `script-item--${availTypeSlug(play.type)}`,
    playNumber % 2 === 0 ? "script-item--alternate" : "",
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
    const signalAvailability =
      signalCount && typeof renderSignalAvailabilityForPlay === "function"
        ? renderSignalAvailabilityForPlay(play, {
          className: "signal-availability--script-player",
          title: "Signals for this play",
          action: "openScriptSignalSelector",
          arg: index,
          buttonLabel: "Watch",
        })
        : "";
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
            ${signalCount
        ? `<button class="script-player-signal-btn" data-action="openScriptSignalSelector"
            data-arg="${index}" title="Watch signals" aria-label="Watch ${signalCount} signal clips for ${escapeHtml(playLabel)}">Signals</button>`
        : ""
      }
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
        ${signalAvailability}
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
      <div class="play-num" aria-hidden="true"><span class="play-num-badge">${playNumber}</span>${wbBadge}</div>
      <div class="play-call">
        <div class="full-call">${fullCall}</div>
        <div class="call-meta">
          <span>${(() => {
      const typeKey = play.type ? play.type.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "") : "";
      const typeChip = play.type ? `<span class="script-type-chip" data-type="${typeKey}">${escapeHtml(play.type)}</span>` : "";
      const tempo = play.tempo ? `<span class="script-tempo-text">· ${escapeHtml(play.tempo)}</span>` : "";
      // The script-only personnel color control lives in the explicit
      // PERSONNEL line below. Keeping one control prevents duplicate buttons
      // and makes the scope of the override unambiguous.
      return `${typeChip}${tempo}`;
    })()}</span>
          ${playbookSigSet && playbookSigSet.has(playSignature(play)) ? `<button type="button" class="script-pb-chip" data-action="jumpToPlayInPlaybook" data-arg="${index}" title="View this play in the Playbook" aria-label="View ${escapeHtml(playLabel)} in Playbook">📖</button>` : ""}
          ${(() => {
      const gpSource = typeof getScriptGamePlanSourceDisplay === "function"
        ? getScriptGamePlanSourceDisplay(play)
        : (play._gpSource ? { label: "GP", title: "Added from Game Plan", jv: false } : null);
      return gpSource
        ? `<span class="script-gp-source-badge" title="${escapeHtml(gpSource.title)}">🎯 ${escapeHtml(gpSource.label)}</span>${gpSource.jv ? '<span class="script-gp-jv-badge" title="Marked JV in Game Plan">🟡 JV</span>' : ""}`
        : "";
    })()}
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
      ${renderScriptPlayControls(play, index, playLabel, reps, signalCount)}
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
        <div class="sch-select" aria-hidden="true"></div>
        <div class="sch-num">#</div>
        <div class="sch-play">Play Call</div>
        <div class="sch-hash">Hash</div>
        <div class="sch-scouting">Scouting: Front · Coverage · Stunt · Blitz</div>
        <div class="sch-controls">Reps, Notes &amp; Actions</div>
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
  // Normal scripts can legitimately take tens of milliseconds to render.
  // Keep detailed timing available when a coach/developer explicitly enables
  // performance diagnostics, without filling ordinary browser consoles.
  if (!window.perfMonitor || !window.perfMonitor.enabled) return;
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
    badge.textContent = `🏈 Game Plan: ${opp}`;
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
    const libraryLabel = activeScriptSaveId
      ? `Editing ${activeScriptSaveTitle || "saved script"}`
      : "Not in Script Library";
    el.textContent = countLabel
      ? `● Unsaved · ${libraryLabel} · ${countLabel}`
      : `● Unsaved · ${libraryLabel}`;
    el.className = "script-save-status dirty";
  } else {
    const destination = activeScriptSaveId
      ? `Saved to Script Library${activeScriptSaveTitle ? `: ${activeScriptSaveTitle}` : ""}`
      : "Recovery draft saved locally";
    el.textContent = countLabel ? `✓ ${destination} · ${countLabel}` : `✓ ${destination}`;
    el.className = "script-save-status clean";
  }
}
