let periodTemplates = [];
periodTemplates = storageManager.get(STORAGE_KEYS.PERIOD_TEMPLATES, []);
let selectedPeriodTemplateIndex = -1;
let templateModalMode = "insert";
let templateModalSearchTerm = "";

function ensureFirstPeriod() {
  const hasSeparator = script.some((item) => item?.isSeparator);
  if (hasSeparator) return;

  script.push({
    isSeparator: true,
    label: "Period 1",
    minutes: 10,
    color: UI_COLORS.periodDefault,
    id: Date.now() + Math.random(),
  });
}

function addSeparator() {
  const overlay = document.createElement("div");
  overlay.className = "period-create-overlay";
  overlay.innerHTML = `
    <div class="period-create-modal">
      <h4>➕ New Period</h4>
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
          <input type="color" id="newPeriodColor" value="#333333" />
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
  renderScript();
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
  renderScript();
}

function collapseAllPeriods() {
  script
    .filter((play) => play.isSeparator)
    .forEach((play) => collapsedPeriods.add(play.id));
  renderScript();
  announceScriptA11y("All periods collapsed");
}

function expandAllPeriods() {
  collapsedPeriods.clear();
  renderScript();
  announceScriptA11y("All periods expanded");
}

function updatePeriodColor(index, el) {
  script[index].color = el.value;
  const header = el.closest(".period-header");
  if (header) header.style.background = el.value;
  const wrapper = el.closest(".period-header-wrapper");
  if (wrapper) wrapper.style.borderLeftColor = el.value;
  saveScriptState();
  announceScriptA11y(`Updated color for ${script[index]?.label || "period"}`);
}

function updatePeriodLabel(index, label, live = false) {
  if (!script[index] || !script[index].isSeparator) return;
  script[index].label = label;
  updatePeriodHeaderLabelDisplay(index);
  updateJumpToPeriodOptions();
  if (live) {
    debouncedSaveScriptState();
  } else {
    saveScriptState();
  }
}

function updatePeriodMinutes(index, el) {
  script[index].minutes = parseInt(el.value, 10) || 0;
  updatePeriodMetaDisplay(index);
  saveScriptState();
  updateScriptStats();
}

function updatePeriodNotes(index, notes, live = false) {
  if (!script[index] || !script[index].isSeparator) return;
  script[index].notes = notes;
  if (live) {
    debouncedSaveScriptState();
  } else {
    saveScriptState();
  }
}

function togglePeriodProtection(idx) {
  const separatorIndex = parseInt(idx, 10);
  const separator = script[separatorIndex];
  if (!separator || !separator.isSeparator) return;

  saveScriptState();
  separator.hideProtection = !separator.hideProtection;
  markScriptDirty();
  renderScript();

  const label = separator.label || "Period";
  const stateLabel = separator.hideProtection ? "hidden" : "shown";
  showToast(`Protection ${stateLabel} for "${label}"`);
  announceScriptA11y(`Protection ${stateLabel} for ${label}`);
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

function duplicatePeriod(separatorIndex) {
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
  renderScript();
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

  renderScript();
}

async function savePeriodAsTemplate(separatorIndex) {
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
  showToast(`Template "${name}" saved!`);
  announceScriptA11y(`Saved ${name} as a period template`);
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
      <div class="period-create-modal template-picker-modal">
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
  renderScript();
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