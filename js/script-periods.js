let periodTemplates = [];
periodTemplates = storageManager.get(STORAGE_KEYS.PERIOD_TEMPLATES, []);
let selectedPeriodTemplateIndex = -1;
let templateModalMode = "insert";
let templateModalSearchTerm = "";

const SCRIPT_PERIOD_COLOR_PALETTE = [
  // Alternate color families by row so adjacent choices are easy to distinguish
  // during a fast sideline scan. Custom color remains available for exceptions.
  { name: "Navy", value: "#0b2f63" }, { name: "Gold", value: "#b77900" },
  { name: "Teal", value: "#007c7a" }, { name: "Red", value: "#c62828" },
  { name: "Blue", value: "#1f5fe0" }, { name: "Orange", value: "#d95f02" },
  { name: "Green", value: "#218739" }, { name: "Purple", value: "#7a36b8" },
  { name: "Cyan", value: "#007aab" }, { name: "Brown", value: "#8c4a18" },
  { name: "Lime", value: "#5a8f00" }, { name: "Pink", value: "#c2256a" },
  { name: "Slate", value: "#536574" }, { name: "Yellow", value: "#c99c00" },
  { name: "Charcoal", value: "#26323f" }, { name: "Crimson", value: "#8e1c3c" },
];

function renderScriptPeriodPaletteButtons(selectedColor, attributeName, attributeValue = "") {
  const normalized = String(selectedColor || "").trim().toLowerCase();
  return SCRIPT_PERIOD_COLOR_PALETTE.map((color) => `
    <button type="button" class="script-period-color-swatch${normalized === color.value ? " is-selected" : ""}" ${attributeName}="${attributeValue}" data-period-color="${color.value}" title="${color.name}" aria-label="${color.name}">
      <span style="background: ${color.value};" aria-hidden="true"></span>
      <strong>${color.name}</strong>
    </button>`).join("");
}

function getScriptPeriodTextColor(color) {
  return typeof isColorDark === "function" && isColorDark(color)
    ? UI_COLORS.textWhite
    : UI_COLORS.textDark;
}

function renderScriptPeriodColorControl(index, color, label) {
  return `
    <button type="button" class="ph-color-palette-btn" data-action="openScriptPeriodColorPalette" data-idx="${index}" title="Choose from 16 standard period colors" aria-label="Choose color for ${escapeHtml(label)}" style="--period-color-swatch: ${color};"><span aria-hidden="true"></span></button>
    <input type="color" class="ph-color-input" value="${color}" data-field="periodColor" data-idx="${index}" tabindex="-1" aria-hidden="true">
  `;
}

function ensureFirstPeriod() {
  const hasSeparator = script.some((item) => item?.isSeparator);
  if (hasSeparator) return;

  var _presetColor = (typeof getActiveColorPreset === "function" && getActiveColorPreset()?.primary) || UI_COLORS.periodDefault;
  script.push({
    isSeparator: true,
    label: "Period 1",
    minutes: 10,
    color: _presetColor,
    id: Date.now() + Math.random(),
  });
}

function addSeparator() {
  const defaultColor = (typeof getActiveColorPreset === "function" && getActiveColorPreset()?.primary) || UI_COLORS.periodDefault;
  const overlay = document.createElement("div");
  overlay.className = "period-create-overlay";
  overlay.innerHTML = `
    <div class="period-create-modal" role="dialog" aria-modal="true" aria-labelledby="newPeriodModalTitle">
      <h4 id="newPeriodModalTitle">➕ New Period</h4>
      <div class="period-create-fields">
        <div class="pcf-row">
          <label>Period Name</label>
          <input type="text" id="newPeriodName" value="" placeholder="e.g., Indy, Team Run, 7-on-7" autofocus />
        </div>
        <div class="pcf-row">
          <label>Time (minutes)</label>
          <input type="number" id="newPeriodMinutes" value="10" min="0" max="60" />
        </div>
        <div class="pcf-row">
          <label>Color</label>
          <input type="hidden" id="newPeriodColor" value="${defaultColor}">
          <div class="script-period-color-palette script-period-color-palette--create" aria-label="Choose a standard period color">
            ${renderScriptPeriodPaletteButtons(defaultColor, "data-period-create-color")}
          </div>
          <label class="script-period-custom-color">Custom <input type="color" value="${defaultColor}" aria-label="Custom period color"></label>
        </div>
      </div>
      <div class="period-create-presets">
        <span class="pcf-presets-label">Quick:</span>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Indy">Indy</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Team Run">Team Run</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Team Pass">Team Pass</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="7-on-7">7-on-7</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Red Zone">Red Zone</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="2-Minute">2-Minute</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Short Yardage">Short Yardage</button>
        <button class="pcf-preset" data-action="setPeriodPreset" data-preset="Goal Line">Goal Line</button>
      </div>
      <div class="period-create-actions">
        <button class="btn btn-success" data-action="confirmAddPeriod">✓ Add Period</button>
        <button class="btn" data-action="closePeriodOverlay">Cancel</button>
      </div>
    </div>
  `;
  wireScriptOverlayDismiss(overlay);
  document.body.appendChild(overlay);
  const createColorInput = overlay.querySelector("#newPeriodColor");
  const setCreateColor = (color) => {
    if (!createColorInput) return;
    createColorInput.value = color;
    overlay.querySelectorAll(".script-period-color-swatch").forEach((swatch) => {
      swatch.classList.toggle("is-selected", swatch.dataset.periodColor === color);
    });
  };
  overlay.querySelectorAll("[data-period-create-color]").forEach((swatch) => {
    swatch.addEventListener("click", () => setCreateColor(swatch.dataset.periodColor));
  });
  overlay.querySelector(".script-period-custom-color input")?.addEventListener("input", (event) => setCreateColor(event.target.value));
  setTimeout(() => document.getElementById("newPeriodName")?.focus(), 50);
}

function confirmAddPeriod() {
  const nameInput = document.getElementById("newPeriodName");
  const minutesInput = document.getElementById("newPeriodMinutes");
  const colorInput = document.getElementById("newPeriodColor");
  if (!nameInput || !minutesInput || !colorInput) return;

  const name = nameInput.value.trim();
  const minutes = parseInt(minutesInput.value, 10) || 0;
  const color = colorInput.value || UI_COLORS.periodDefault;

  if (!name) {
    nameInput.classList.add("input-error");
    nameInput.focus();
    showToast("Period name is required", { type: "warning" });
    return;
  }

  saveScriptState();
  script.push({
    isSeparator: true,
    label: name,
    minutes,
    color,
    id: Date.now() + Math.random(),
  });
  markScriptDirty();
  requestRenderScript();
  showToast(`Added period "${name}"`);
  announceScriptA11y(`Added period ${name}`);
  document.querySelector(".period-create-overlay")?.remove();
}

function togglePeriodCollapse(periodId) {
  const separator = script.find((play) => play.isSeparator && play.id === periodId);
  if (collapsedPeriods.has(periodId)) {
    collapsedPeriods.delete(periodId);
    announceScriptA11y(`${separator?.label || "Period"} expanded`);
  } else {
    collapsedPeriods.add(periodId);
    announceScriptA11y(`${separator?.label || "Period"} collapsed`);
  }
  requestRenderScript();
}

function collapseAllPeriods() {
  script
    .filter((play) => play.isSeparator)
    .forEach((play) => collapsedPeriods.add(play.id));
  requestRenderScript();
  announceScriptA11y("All periods collapsed");
}

function expandAllPeriods() {
  collapsedPeriods.clear();
  requestRenderScript();
  announceScriptA11y("All periods expanded");
}

function updatePeriodColor(index, el) {
  setScriptPeriodColor(index, el?.value);
}

function setScriptPeriodColor(index, color) {
  if (!script[index] || !script[index].isSeparator || !color || script[index].color === color) return;
  saveScriptState();
  script[index].color = color;
  const header = document.querySelector(`.period-header .ph-color-input[data-idx="${index}"]`)?.closest(".period-header");
  if (header) {
    header.style.background = color;
    header.style.color = getScriptPeriodTextColor(color);
  }
  const wrapper = header?.closest(".period-header-wrapper");
  if (wrapper) wrapper.style.borderLeftColor = color;
  document.querySelectorAll(`.ph-color-input[data-idx="${index}"]`).forEach((input) => { input.value = color; });
  document.querySelectorAll(`.ph-color-palette-btn[data-idx="${index}"]`).forEach((button) => { button.style.setProperty("--period-color-swatch", color); });
  // Clear the color scheme preset — user has set a custom period color
  setActiveColorPreset("");
  const schemeSelect = document.getElementById("scriptColorSchemeSelect");
  if (schemeSelect) schemeSelect.value = "";
  if (typeof refreshScriptTimeline === "function") refreshScriptTimeline();
  announceScriptA11y(`Updated color for ${script[index]?.label || "period"}`);
}

function openScriptPeriodColorPalette(index) {
  const period = script[index];
  if (!period?.isSeparator) return;
  closeScriptPeriodColorPalette({ returnFocus: false });
  const currentColor = period.color || UI_COLORS.periodDefault;
  const overlay = document.createElement("div");
  overlay.id = "scriptPeriodColorModalOverlay";
  overlay.className = "modal-overlay show";
  overlay.innerHTML = `
    <div class="modal-content modal-content-sm script-period-color-modal" role="dialog" aria-modal="true" aria-labelledby="scriptPeriodColorTitle">
      <div class="modal-header-row">
        <h3 class="modal-title" id="scriptPeriodColorTitle">${escapeHtml(period.label || "Period")} color</h3>
        <button type="button" class="modal-close-btn" aria-label="Close">✕</button>
      </div>
      <p>High-contrast coaching colors. Header text adjusts automatically for readability.</p>
      <div class="script-period-color-palette" aria-label="Standard period colors">${renderScriptPeriodPaletteButtons(currentColor, "data-period-palette-color")}</div>
      <label class="script-period-custom-color">Custom color <input type="color" value="${currentColor}" aria-label="Custom period color"></label>
    </div>`;
  overlay.querySelector(".modal-close-btn")?.addEventListener("click", closeScriptPeriodColorPalette);
  overlay.querySelectorAll("[data-period-palette-color]").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      setScriptPeriodColor(index, swatch.dataset.periodColor);
      closeScriptPeriodColorPalette();
    });
  });
  overlay.querySelector(".script-period-custom-color input")?.addEventListener("change", (event) => {
    setScriptPeriodColor(index, event.target.value);
    closeScriptPeriodColorPalette();
  });
  wireScriptOverlayDismiss(overlay);
  document.body.appendChild(overlay);
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "scriptPeriodColorModalOverlay",
      scrollElement: overlay.querySelector(".modal-content") || overlay,
      blocking: true,
    });
  }
}

function closeScriptPeriodColorPalette(options = {}) {
  const overlay = document.getElementById("scriptPeriodColorModalOverlay");
  if (typeof closeLayer === "function") {
    closeLayer("scriptPeriodColorModalOverlay", options);
  }
  overlay?.remove();
}

function updatePeriodLabel(index, label, live = false) {
  if (!script[index] || !script[index].isSeparator) return;
  if (script[index].label === label) return;
  if (live) beginScriptEdit();
  else saveScriptState();
  script[index].label = label;
  updatePeriodHeaderLabelDisplay(index);
  updateJumpToPeriodOptions();
  if (typeof refreshScriptTimeline === "function") refreshScriptTimeline();
}

function updatePeriodMinutes(index, el) {
  const minutes = parseInt(el.value, 10) || 0;
  if (!script[index] || script[index].minutes === minutes) return;
  saveScriptState();
  script[index].minutes = minutes;
  updatePeriodMetaDisplay(index);
  updateScriptStats();
  if (typeof refreshScriptTimeline === "function") refreshScriptTimeline();
}

function updatePeriodNotes(index, notes, live = false) {
  if (!script[index] || !script[index].isSeparator) return;
  if ((script[index].notes || "") === notes) return;
  if (live) beginScriptEdit();
  else saveScriptState();
  script[index].notes = notes;
  if (typeof refreshScriptTimeline === "function") refreshScriptTimeline();
}

function togglePeriodProtection(idx) {
  const separatorIndex = parseInt(idx, 10);
  const separator = script[separatorIndex];
  if (!separator || !separator.isSeparator) return;

  saveScriptState();
  separator.hideProtection = !separator.hideProtection;
  markScriptDirty();
  requestRenderScript();

  const label = separator.label || "Period";
  const stateLabel = separator.hideProtection ? "hidden" : "shown";
  showToast(`Protection ${stateLabel} for "${label}"`);
  announceScriptA11y(`Protection ${stateLabel} for ${label}`);
}

function getPeriodPlayIndexes(separatorIndex) {
  const indexes = [];
  const start = parseInt(separatorIndex, 10);
  if (!Number.isInteger(start) || !script[start]?.isSeparator) return indexes;

  for (let index = start + 1; index < script.length; index++) {
    if (script[index]?.isSeparator) break;
    if (script[index]) indexes.push(index);
  }
  return indexes;
}

function getPeriodPersonnelVisibilityState(separatorIndex) {
  const playIndexes = getPeriodPlayIndexes(separatorIndex);
  const visible = playIndexes.filter((index) => !script[index]?.scriptHidePersonnel).length;
  const total = playIndexes.length;
  return {
    total,
    visible,
    hidden: total - visible,
    mode: total === 0 ? "empty" : visible === total ? "shown" : visible === 0 ? "hidden" : "mixed",
  };
}

function setPeriodPersonnelVisibility(separatorIndex, showPersonnel) {
  const parsedIndex = parseInt(separatorIndex, 10);
  const separator = script[parsedIndex];
  if (!separator?.isSeparator) return;

  const shouldShow = showPersonnel === true || showPersonnel === "true";
  const playIndexes = getPeriodPlayIndexes(parsedIndex);
  if (!playIndexes.length) {
    showToast("This period does not have any plays yet.", { type: "warning" });
    return;
  }

  const changedIndexes = playIndexes.filter((index) =>
    shouldShow ? Boolean(script[index]?.scriptHidePersonnel) : !script[index]?.scriptHidePersonnel,
  );
  if (!changedIndexes.length) {
    showToast(`Lineup assignments are already ${shouldShow ? "shown" : "hidden"} for every play in "${separator.label || "Period"}".`);
    return;
  }

  saveScriptState();
  changedIndexes.forEach((index) => {
    if (shouldShow) delete script[index].scriptHidePersonnel;
    else script[index].scriptHidePersonnel = true;
  });
  requestRenderScript();

  const label = separator.label || "Period";
  const stateLabel = shouldShow ? "shown" : "hidden";
  showToast(`Lineup assignments ${stateLabel} for all ${playIndexes.length} plays in "${label}".`);
  announceScriptA11y(`Lineup assignments ${stateLabel} for all plays in ${label}`);
}

function togglePeriodPersonnelVisibility(separatorIndex) {
  const state = getPeriodPersonnelVisibilityState(separatorIndex);
  if (!state.total) return;
  // A mixed period resolves to "show all". Hiding every play is the next,
  // deliberate click, which keeps the compact timeline control safe to use.
  setPeriodPersonnelVisibility(separatorIndex, state.mode !== "shown");
}

function copyPeriodAsText(idx) {
  const sepIdx = parseInt(idx, 10);
  const separator = script[sepIdx];
  if (!separator || !separator.isSeparator) return;

  const periodPlays = getPeriodPlays(sepIdx);
  if (periodPlays.length === 0) {
    showToast("⚠️ No plays in this period", { type: "warning" });
    return;
  }

  const header = separator.label || "Period";
  const callOptions = getPeriodCallDisplayOptions(separator);
  const lines = [header, "─".repeat(header.length)];
  periodPlays.forEach((play, index) => {
    const call = getScriptFullCall(play, callOptions);
    const meta = [play.type, play.hash, play.tempo].filter(Boolean).join(" | ");
    lines.push(`${index + 1}. ${call}${meta ? "  [" + meta + "]" : ""}`);
  });

  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => showToast(`📋 ${periodPlays.length} plays copied`))
    .catch(() => showToast("❌ Clipboard not available", { type: "error" }));
}

async function copyPeriodToClipboard() {
  const separators = script
    .map((play, index) => ({ ...play, idx: index }))
    .filter((play) => play.isSeparator);

  if (separators.length === 0) {
    await showModal("No periods in script.", {
      title: "Copy Period",
      icon: "📋",
    });
    return;
  }

  const items = separators.map((separator, index) => ({
    label: separator.label,
    value: index,
  }));
  const pickedIdx = await showListPicker("Select period to copy:", items, {
    title: "Copy Period",
    icon: "📋",
  });
  if (pickedIdx === null) return;

  if (pickedIdx < 0 || pickedIdx >= separators.length) {
    await showModal("Invalid selection.", { title: "Error", icon: "⚠️" });
    return;
  }

  copyPeriodAsText(separators[pickedIdx].idx);
}

function getPeriodPlays(separatorIndex) {
  const plays = [];
  for (let index = separatorIndex + 1; index < script.length; index++) {
    if (script[index].isSeparator) break;
    plays.push({ ...script[index], id: Date.now() + Math.random() + index });
  }
  return plays;
}

let scriptPeriodDragId = null;

function getPeriodBlockBounds(separatorIndex) {
  if (!script[separatorIndex]?.isSeparator) return null;

  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex]?.isSeparator) {
    endIndex++;
  }

  return {
    startIndex: separatorIndex,
    endIndex,
    length: endIndex - separatorIndex,
    separator: script[separatorIndex],
  };
}

function findPeriodIndexById(periodId) {
  const normalizedId = String(periodId);
  return script.findIndex((item) => item?.isSeparator && String(item.id) === normalizedId);
}

function getPeriodSelectorId(periodId) {
  const normalizedId = String(periodId || "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(normalizedId);
  }
  return normalizedId.replace(/["\\]/g, "\\$&");
}

function clearPeriodDropIndicators() {
  document
    .querySelectorAll(".period-drop-before, .period-drop-after, .period-dragging")
    .forEach((el) => {
      el.classList.remove("period-drop-before", "period-drop-after", "period-dragging");
    });
}

function getPeriodDropPosition(event, targetEl) {
  const rect = targetEl.getBoundingClientRect();
  if (targetEl.closest(".script-timeline-track")) {
    const track = targetEl.closest(".script-timeline-track");
    const columns = getComputedStyle(track).gridTemplateColumns
      .split(" ")
      .filter(Boolean).length;
    if (columns > 1) {
      return event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    }
  }
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function setPeriodDropIndicator(event, targetEl) {
  if (!targetEl || !scriptPeriodDragId) return;
  const targetPeriodId = targetEl.dataset.periodDropId || targetEl.dataset.periodId;
  if (!targetPeriodId || String(targetPeriodId) === scriptPeriodDragId) {
    clearPeriodDropIndicators();
    document
      .querySelectorAll(`[data-period-drop-id="${getPeriodSelectorId(targetPeriodId)}"]`)
      .forEach((el) => el.classList.add("period-dragging"));
    return;
  }

  const position = getPeriodDropPosition(event, targetEl);
  clearPeriodDropIndicators();
  targetEl.classList.add(position === "before" ? "period-drop-before" : "period-drop-after");
  document
    .querySelectorAll(`[data-period-drop-id="${getPeriodSelectorId(scriptPeriodDragId)}"]`)
    .forEach((el) => el.classList.add("period-dragging"));
}

function reorderPeriodById(sourcePeriodId, targetPeriodId, position = "before") {
  const sourceIndex = findPeriodIndexById(sourcePeriodId);
  const targetIndex = findPeriodIndexById(targetPeriodId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;

  const sourceBounds = getPeriodBlockBounds(sourceIndex);
  const targetBounds = getPeriodBlockBounds(targetIndex);
  if (!sourceBounds || !targetBounds) return false;

  const periodItems = script.slice(sourceBounds.startIndex, sourceBounds.endIndex);
  let insertIndex = position === "after"
    ? targetBounds.endIndex
    : targetBounds.startIndex;

  if (sourceBounds.startIndex < insertIndex) {
    insertIndex -= sourceBounds.length;
  }

  if (insertIndex === sourceBounds.startIndex) return false;

  const sourceLabel = sourceBounds.separator.label || "Period";
  const targetLabel = targetBounds.separator.label || "period";
  saveScriptState();
  script.splice(sourceBounds.startIndex, sourceBounds.length);
  script.splice(insertIndex, 0, ...periodItems);
  renderScript();

  const directionLabel = position === "after" ? "after" : "before";
  setScriptToolbarStatus(
    `Moved ${sourceLabel} ${directionLabel} ${targetLabel}`,
    "success",
    AUTOSAVE_DEBOUNCE_MS,
  );
  announceScriptA11y(`Moved ${sourceLabel} ${directionLabel} ${targetLabel}`);
  return true;
}

function _getScriptPeriodManagerEntries() {
  return script
    .map((item, index) => {
      if (!item?.isSeparator) return null;
      const bounds = getPeriodBlockBounds(index);
      return {
        id: String(item.id),
        index,
        label: item.label || "Untitled Period",
        minutes: Number(item.minutes) || 0,
        playCount: bounds ? Math.max(0, bounds.endIndex - bounds.startIndex - 1) : 0,
      };
    })
    .filter(Boolean);
}

function openScriptPeriodManager() {
  const existing = document.getElementById("scriptPeriodManagerModal");
  if (existing) closeScriptPeriodManager({ returnFocus: false });

  document.body.insertAdjacentHTML("beforeend", `
    <div id="scriptPeriodManagerModal" class="modal-overlay show" data-action="closeScriptPeriodManagerOverlay">
      <div class="modal-content modal-content-md script-period-manager-modal" role="dialog" aria-modal="true" aria-labelledby="scriptPeriodManagerTitle">
        <div class="modal-header-row">
          <div>
            <h3 class="modal-title" id="scriptPeriodManagerTitle">🗂️ Organize Practice Periods</h3>
            <p class="modal-helper-text">Move whole periods, change a period’s play order, duplicate it, or remove it with its plays.</p>
          </div>
          <button type="button" class="modal-close-btn script-period-manager-close" data-action="closeScriptPeriodManager" aria-label="Close period organizer">✕</button>
        </div>
        <div id="scriptPeriodManagerList" class="script-period-manager-list"></div>
        <div class="modal-action-row mt-md">
          <button class="btn btn-primary script-period-manager-footer-action" data-action="openScriptPeriodCreatorFromManager">＋ Add Period</button>
          <button class="btn script-period-manager-footer-action script-period-manager-done" data-action="closeScriptPeriodManager">Done</button>
        </div>
      </div>
    </div>
  `);
  renderScriptPeriodManager();
  const overlay = document.getElementById("scriptPeriodManagerModal");
  if (typeof openLayer === "function" && overlay) {
    const closeButton = overlay.querySelector(".script-period-manager-close");
    openLayer(overlay, {
      id: "scriptPeriodManagerModal",
      scrollElement: overlay.querySelector(".script-period-manager-list") || overlay,
      blocking: true,
      initialFocus: closeButton || overlay,
      onEscape: () => closeScriptPeriodManager(),
    });
  }
}

function closeScriptPeriodManager(eventOrOptions = {}) {
  const isEvent = eventOrOptions && typeof eventOrOptions.target !== "undefined";
  if (isEvent && eventOrOptions.target.id !== "scriptPeriodManagerModal") return;
  const overlay = document.getElementById("scriptPeriodManagerModal");
  if (typeof closeLayer === "function") {
    closeLayer("scriptPeriodManagerModal", isEvent ? {} : eventOrOptions);
  }
  overlay?.remove();
}

function openScriptPeriodCreatorFromManager() {
  closeScriptPeriodManager();
  addSeparator();
}

function renderScriptPeriodManager() {
  const list = document.getElementById("scriptPeriodManagerList");
  if (!list) return;
  const periods = _getScriptPeriodManagerEntries();
  if (!periods.length) {
    list.innerHTML = '<div class="script-period-manager-empty">No periods yet. Add one to start building this practice.</div>';
    return;
  }

  list.innerHTML = periods.map((period, index) => `
    <article class="script-period-manager-item">
      <div class="script-period-manager-order" aria-label="Period ${index + 1}">${index + 1}</div>
      <div class="script-period-manager-main">
        <strong>${escapeHtml(period.label)}</strong>
        <span>${period.playCount} play${period.playCount === 1 ? "" : "s"} · ${period.minutes} min</span>
      </div>
      <div class="script-period-manager-actions" aria-label="Actions for ${escapeHtml(period.label)}">
        <button class="btn btn-sm script-period-manager-action" data-action="moveScriptPeriodFromManager" data-arg="${escapeHtml(period.id)}:up" ${index === 0 ? "disabled" : ""} title="Move ${escapeHtml(period.label)} up" aria-label="Move ${escapeHtml(period.label)} up">↑</button>
        <button class="btn btn-sm script-period-manager-action" data-action="moveScriptPeriodFromManager" data-arg="${escapeHtml(period.id)}:down" ${index === periods.length - 1 ? "disabled" : ""} title="Move ${escapeHtml(period.label)} down" aria-label="Move ${escapeHtml(period.label)} down">↓</button>
        <button class="btn btn-sm script-period-manager-action" data-action="reorderScriptPeriodFromManager" data-arg="${escapeHtml(period.id)}" title="Arrange plays in ${escapeHtml(period.label)}">↕ Plays</button>
        <button class="btn btn-sm script-period-manager-action" data-action="duplicateScriptPeriodFromManager" data-arg="${escapeHtml(period.id)}" title="Duplicate ${escapeHtml(period.label)}" aria-label="Duplicate ${escapeHtml(period.label)}">⧉</button>
        <button class="btn btn-sm btn-danger script-period-manager-action script-period-manager-delete" data-action="deleteScriptPeriodFromManager" data-arg="${escapeHtml(period.id)}" title="Delete ${escapeHtml(period.label)} and its plays" aria-label="Delete ${escapeHtml(period.label)} and its plays">✕</button>
      </div>
    </article>
  `).join("");
}

function moveScriptPeriodFromManager(value) {
  const [periodId, direction] = String(value || "").split(":");
  const periods = _getScriptPeriodManagerEntries();
  const sourceIndex = periods.findIndex((period) => period.id === periodId);
  const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= periods.length) return;
  const target = periods[targetIndex];
  const moved = reorderPeriodById(periodId, target.id, direction === "up" ? "before" : "after");
  if (moved) renderScriptPeriodManager();
}

function reorderScriptPeriodFromManager(periodId) {
  const entry = _getScriptPeriodManagerEntries().find((period) => period.id === String(periodId));
  if (!entry) return;
  closeScriptPeriodManager();
  openPeriodReorderModal(entry.index);
}

function duplicateScriptPeriodFromManager(periodId) {
  const entry = _getScriptPeriodManagerEntries().find((period) => period.id === String(periodId));
  if (!entry) return;
  duplicatePeriod(entry.index);
  renderScriptPeriodManager();
}

async function deleteScriptPeriodFromManager(periodId) {
  const entry = _getScriptPeriodManagerEntries().find((period) => period.id === String(periodId));
  if (!entry) return;
  await removeFromScript(entry.index);
  renderScriptPeriodManager();
}

function handlePeriodDragStart(event, periodId) {
  if (typeof isAdminUser === "function" && !isAdminUser()) {
    event.preventDefault();
    return;
  }

  const separatorIndex = findPeriodIndexById(periodId);
  const separator = script[separatorIndex];
  if (!separator) return;

  scriptPeriodDragId = String(separator.id);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("source", "scriptPeriod");
  event.dataTransfer.setData("periodId", scriptPeriodDragId);
  document.body?.classList.add("script-period-drag-active");
  document
    .querySelectorAll(`[data-period-drop-id="${getPeriodSelectorId(scriptPeriodDragId)}"]`)
    .forEach((el) => el.classList.add("period-dragging"));
  announceScriptA11y(`Dragging period ${separator.label || "Period"}`);
}

function handlePeriodDragOver(event, targetEl) {
  if (!scriptPeriodDragId || !targetEl) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  setPeriodDropIndicator(event, targetEl);
}

function handlePeriodDrop(event, targetEl) {
  const source = event.dataTransfer.getData("source");
  if (source !== "scriptPeriod" || !targetEl) return false;

  event.preventDefault();
  const sourcePeriodId = event.dataTransfer.getData("periodId") || scriptPeriodDragId;
  const targetPeriodId = targetEl.dataset.periodDropId || targetEl.dataset.periodId;
  const position = getPeriodDropPosition(event, targetEl);
  const moved = reorderPeriodById(sourcePeriodId, targetPeriodId, position);
  handlePeriodDragEnd();
  return moved;
}

function handlePeriodDragEnd() {
  scriptPeriodDragId = null;
  document.body?.classList.remove("script-period-drag-active");
  clearPeriodDropIndicators();
}

function duplicatePeriod(separatorIndex) {
  separatorIndex = parseInt(separatorIndex, 10);
  if (Number.isNaN(separatorIndex) || !script[separatorIndex]?.isSeparator) return;

  saveScriptState();
  const separator = script[separatorIndex];
  const plays = getPeriodPlays(separatorIndex);

  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) {
    endIndex++;
  }

  const newSeparator = {
    ...separator,
    label: separator.label + " (Copy)",
    id: Date.now() + Math.random(),
  };

  script.splice(endIndex, 0, newSeparator, ...plays);
  requestRenderScript();
}

function movePeriod(separatorIndex, direction) {
  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) {
    endIndex++;
  }

  const periodItems = script.slice(separatorIndex, endIndex);

  if (direction === -1) {
    let prevSepIdx = separatorIndex - 1;
    while (prevSepIdx >= 0 && !script[prevSepIdx].isSeparator) {
      prevSepIdx--;
    }
    if (prevSepIdx < 0) return;

    saveScriptState();
    script.splice(separatorIndex, endIndex - separatorIndex);
    script.splice(prevSepIdx, 0, ...periodItems);
  } else {
    if (endIndex >= script.length) return;

    let nextEndIdx = endIndex + 1;
    while (nextEndIdx < script.length && !script[nextEndIdx].isSeparator) {
      nextEndIdx++;
    }

    saveScriptState();
    script.splice(separatorIndex, endIndex - separatorIndex);
    const insertAt = nextEndIdx - (endIndex - separatorIndex);
    script.splice(insertAt, 0, ...periodItems);
  }

  requestRenderScript();
}

async function savePeriodAsTemplate(separatorIndex) {
  separatorIndex = parseInt(separatorIndex, 10);
  if (Number.isNaN(separatorIndex) || !script[separatorIndex]?.isSeparator) return;

  const separator = script[separatorIndex];
  const plays = getPeriodPlays(separatorIndex);

  const name = await showPrompt("Template name:", separator.label, {
    title: "Save Template",
    icon: "💾",
  });
  if (!name) return;

  const template = {
    id: Date.now(),
    name,
    minutes: separator.minutes || 0,
    notes: separator.notes || "",
    hideProtection: Boolean(separator.hideProtection),
    plays: plays.map((play) => ({ ...play, id: null })),
  };

  periodTemplates.push(template);
  storageManager.set(STORAGE_KEYS.PERIOD_TEMPLATES, periodTemplates);
  refreshPeriodTemplateQuickPick();
  showToast(`Template "${name}" saved!`);
  announceScriptA11y(`Saved ${name} as a period template`);
}

function refreshPeriodTemplateQuickPick() {
  const select = document.getElementById("periodTemplateQuickPick");
  if (!select) return;
  if (!Array.isArray(periodTemplates) || periodTemplates.length === 0) {
    select.hidden = true;
    select.innerHTML = '<option value="">📋 Quick Insert…</option>';
    return;
  }
  select.hidden = false;
  const options = ['<option value="">📋 Quick Insert…</option>'];
  periodTemplates.forEach((tpl, idx) => {
    const playCount = Array.isArray(tpl.plays) ? tpl.plays.length : 0;
    const label = `${tpl.name} (${playCount})`;
    options.push(`<option value="${idx}">${escapeHtml(label)}</option>`);
  });
  select.innerHTML = options.join("");
  select.value = "";
}

function quickInsertPeriodTemplate(value) {
  const idx = parseInt(value, 10);
  const select = document.getElementById("periodTemplateQuickPick");
  if (select) select.value = "";
  if (Number.isNaN(idx) || idx < 0 || idx >= periodTemplates.length) return;
  doInsertTemplate(idx);
}

function getTemplatePreviewLines(template) {
  if (!template || !Array.isArray(template.plays)) return [];
  return template.plays.slice(0, 5).map((play) => getScriptPlaySummaryText(play));
}

function getFilteredPeriodTemplates() {
  const search = templateModalSearchTerm.trim().toLowerCase();
  return periodTemplates
    .map((template, index) => ({ template, index }))
    .filter(({ template }) => {
      if (!search) return true;
      const haystack = [
        template.name,
        ...template.plays.map((play) => getScriptPlaySummaryText(play)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
}

function ensureSelectedTemplateIndex(visibleTemplates) {
  if (!visibleTemplates.length) {
    selectedPeriodTemplateIndex = -1;
    return;
  }

  const stillVisible = visibleTemplates.some(
    ({ index }) => index === selectedPeriodTemplateIndex,
  );
  if (!stillVisible) {
    selectedPeriodTemplateIndex = visibleTemplates[0].index;
  }
}

function buildTemplatePickerListMarkup(visibleTemplates) {
  if (!visibleTemplates.length) {
    return `
      <div class="template-empty-state">
        <div class="template-empty-title">No templates match this search</div>
        <div class="template-empty-copy">Try a different name or clear the search to see all saved period templates.</div>
      </div>
    `;
  }

  return visibleTemplates
    .map(({ template, index }) => {
      const isSelected = index === selectedPeriodTemplateIndex;
      return `
        <button
          type="button"
          class="template-picker-item${isSelected ? " is-selected" : ""}"
          data-action="previewPeriodTemplate"
          data-arg="${index}"
          aria-pressed="${isSelected ? "true" : "false"}"
          aria-label="Preview template ${escapeHtml(template.name)}"
        >
          <div class="template-picker-main">
            <div class="tpi-name">${escapeHtml(template.name)}</div>
            <div class="tpi-meta">${template.plays.length} plays • ${template.minutes || 0} min</div>
          </div>
          ${isSelected ? '<span class="template-picker-check" aria-hidden="true">✓</span>' : ""}
        </button>
      `;
    })
    .join("");
}

function buildTemplatePreviewMarkup(template) {
  if (!template) {
    return `
      <div class="template-preview-empty">
        <div class="template-empty-title">No template selected</div>
        <div class="template-empty-copy">Choose a saved period template to preview its plays and actions.</div>
      </div>
    `;
  }

  const previewLines = getTemplatePreviewLines(template);
  const extraCount = Math.max((template.plays?.length || 0) - previewLines.length, 0);

  return `
    <div class="template-preview-card">
      <div class="template-preview-header">
        <div>
          <div class="template-preview-title">${escapeHtml(template.name)}</div>
          <div class="template-preview-meta">${template.plays.length} plays • ${template.minutes || 0} min</div>
        </div>
        <span class="template-preview-badge">${templateModalMode === "manage" ? "Manage" : "Ready"}</span>
      </div>
      <div class="template-preview-list">
        ${previewLines.length
      ? previewLines
        .map((line, idx) => `<div class="template-preview-line"><span class="template-preview-line-num">${idx + 1}</span><span>${line}</span></div>`)
        .join("")
      : '<div class="template-empty-copy">This template is empty.</div>'}
      </div>
      ${extraCount > 0 ? `<div class="template-preview-more">+${extraCount} more play${extraCount === 1 ? "" : "s"}</div>` : ""}
    </div>
  `;
}

function updatePeriodTemplateModalContent() {
  const overlay = document.querySelector(".period-create-overlay.template-picker-overlay");
  if (!overlay) return;

  const visibleTemplates = getFilteredPeriodTemplates();
  ensureSelectedTemplateIndex(visibleTemplates);
  const activeTemplate =
    selectedPeriodTemplateIndex >= 0 ? periodTemplates[selectedPeriodTemplateIndex] : null;

  const titleEl = overlay.querySelector("#periodTemplateModalTitle");
  const countEl = overlay.querySelector("#templatePickerCount");
  const listEl = overlay.querySelector("#templatePickerList");
  const previewEl = overlay.querySelector("#templatePreviewPane");
  const actionsEl = overlay.querySelector("#templatePickerActions");
  const searchEl = overlay.querySelector("#templateSearchInput");

  if (titleEl) {
    titleEl.textContent =
      templateModalMode === "manage" ? "🗑 Manage Period Templates" : "📋 Insert from Template";
  }
  if (countEl) {
    countEl.textContent = `${visibleTemplates.length} shown`;
  }
  if (searchEl && searchEl.value !== templateModalSearchTerm) {
    searchEl.value = templateModalSearchTerm;
  }
  if (listEl) {
    listEl.innerHTML = buildTemplatePickerListMarkup(visibleTemplates);
  }
  if (previewEl) {
    previewEl.innerHTML = buildTemplatePreviewMarkup(activeTemplate);
  }
  if (actionsEl) {
    actionsEl.innerHTML =
      templateModalMode === "manage"
        ? `
          <button class="btn btn-sm" data-action="returnToTemplateInsert">← Back to Insert</button>
          <button class="btn btn-danger btn-sm" data-action="deleteSelectedTemplate" ${activeTemplate ? "" : "disabled"}>Delete Selected</button>
          <button class="btn" data-action="closePeriodOverlay">Done</button>
        `
        : `
          <button class="btn btn-secondary btn-sm" data-action="manageTemplates">🗑 Manage</button>
          <button class="btn" data-action="closePeriodOverlay">Cancel</button>
          <button class="btn btn-primary" data-action="insertSelectedTemplate" ${activeTemplate ? "" : "disabled"}>Insert Selected</button>
        `;
  }
}

function renderPeriodTemplateModal() {
  let overlay = document.querySelector(".period-create-overlay.template-picker-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "period-create-overlay template-picker-overlay";
    wireScriptOverlayDismiss(overlay);
    overlay.innerHTML = `
      <div class="period-create-modal template-picker-modal" role="dialog" aria-modal="true" aria-labelledby="periodTemplateModalTitle">
        <h4 id="periodTemplateModalTitle"></h4>
        <div class="template-picker-toolbar">
          <input
            id="templateSearchInput"
            type="text"
            class="template-search-input"
            placeholder="Search templates or plays"
            data-oninput="filterPeriodTemplates"
            data-pass="value"
            aria-label="Search period templates"
          >
          <span id="templatePickerCount" class="template-picker-count" role="status" aria-live="polite"></span>
        </div>
        <div class="template-picker-layout">
          <div id="templatePickerList" class="template-picker-list" role="listbox" aria-label="Saved period templates"></div>
          <div id="templatePreviewPane" class="template-preview-pane"></div>
        </div>
        <div id="templatePickerActions" class="period-create-actions template-picker-actions"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  updatePeriodTemplateModalContent();
}

function filterPeriodTemplates(value) {
  templateModalSearchTerm = value || "";
  updatePeriodTemplateModalContent();
}

function previewPeriodTemplate(idx) {
  const parsedIndex = parseInt(idx, 10);
  if (Number.isNaN(parsedIndex) || !periodTemplates[parsedIndex]) return;
  selectedPeriodTemplateIndex = parsedIndex;
  updatePeriodTemplateModalContent();
  announceScriptA11y(`Previewing template ${periodTemplates[parsedIndex].name}`);
}

function returnToTemplateInsert() {
  templateModalMode = "insert";
  updatePeriodTemplateModalContent();
}

function insertSelectedTemplate() {
  if (selectedPeriodTemplateIndex < 0 || !periodTemplates[selectedPeriodTemplateIndex]) return;
  doInsertTemplate(selectedPeriodTemplateIndex);
  document.querySelector(".period-create-overlay.template-picker-overlay")?.remove();
}

async function deleteSelectedTemplate() {
  if (selectedPeriodTemplateIndex < 0 || !periodTemplates[selectedPeriodTemplateIndex]) return;
  await doDeleteTemplate(selectedPeriodTemplateIndex);
}

function insertPeriodFromTemplate() {
  if (periodTemplates.length === 0) {
    showToast("No templates saved yet — use 💾 on a period header first");
    return;
  }

  templateModalMode = "insert";
  templateModalSearchTerm = "";
  selectedPeriodTemplateIndex = 0;
  renderPeriodTemplateModal();
}

function doInsertTemplate(idx) {
  if (idx < 0 || idx >= periodTemplates.length) return;
  const template = periodTemplates[idx];
  saveScriptState();

  const newSeparator = {
    isSeparator: true,
    label: template.name,
    minutes: template.minutes,
    notes: template.notes || "",
    hideProtection: Boolean(template.hideProtection),
    id: Date.now() + Math.random(),
  };

  const newPlays = template.plays.map((play) => ({
    ...play,
    id: Date.now() + Math.random(),
  }));

  script.push(newSeparator, ...newPlays);
  markScriptDirty();
  requestRenderScript();
  showToast(`Inserted "${template.name}" (${template.plays.length} plays)`);
  announceScriptA11y(`Inserted template ${template.name}`);
}

function manageTemplates() {
  if (periodTemplates.length === 0) {
    showToast("No templates to manage");
    return;
  }

  templateModalMode = "manage";
  if (selectedPeriodTemplateIndex < 0 && periodTemplates.length > 0) {
    selectedPeriodTemplateIndex = 0;
  }
  renderPeriodTemplateModal();
}

async function doDeleteTemplate(idx) {
  const name = periodTemplates[idx].name;
  const ok = await showConfirm(`Delete template "${name}"?`, {
    title: "Delete Template",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  periodTemplates.splice(idx, 1);
  storageManager.set(STORAGE_KEYS.PERIOD_TEMPLATES, periodTemplates);
  refreshPeriodTemplateQuickPick();
  selectedPeriodTemplateIndex = Math.min(idx, periodTemplates.length - 1);
  if (periodTemplates.length > 0) {
    updatePeriodTemplateModalContent();
  } else {
    document.querySelector(".period-create-overlay.template-picker-overlay")?.remove();
  }
  showToast(`Deleted template "${name}"`);
}

// Alias needed because the delegated Overlay-close check strips the suffix
function closePeriod() {
  document.querySelector(".period-create-overlay")?.remove();
}
