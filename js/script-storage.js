function getScriptWorkspaceCheckboxState() {
  const checkboxState = {};
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) checkboxState[id] = Boolean(el.checked);
  });
  return checkboxState;
}

let scriptAutosaveTimer = null;

function getScriptWorkspaceState() {
  const wbSelect = document.getElementById("scriptWristbandSelect");
  const formationFilter = document.getElementById("scriptFilterFormation");
  const basePlayFilter = document.getElementById("scriptFilterBasePlay");
  const searchInput = document.getElementById("scriptSearchPlay");

  return {
    version: 1,
    displayOptions: getScriptWorkspaceCheckboxState(),
    filters: {
      selectedTypes: [...scriptSelectedTypes],
      selectedSituation: [...scriptSelectedSituation],
      selectedDown: [...scriptSelectedDown],
      selectedDistance: [...scriptSelectedDistance],
      selectedHash: [...scriptSelectedHash],
      selectedFieldPos: [...scriptSelectedFieldPos],
      selectedPersonnel: [...scriptSelectedPersonnel],
      formation: formationFilter?.value || "",
      basePlay: basePlayFilter?.value || "",
      search: searchInput?.value || "",
      filtersCollapsed,
    },
    linkedWristbandId: wbSelect?.value ? parseInt(wbSelect.value, 10) || null : null,
    collapsedPeriodIds: script
      .filter((item) => item.isSeparator && collapsedPeriods.has(item.id))
      .map((item) => item.id),
  };
}

function setScriptWristbandSelection(wristbandId, shouldRender = true) {
  const select = document.getElementById("scriptWristbandSelect");
  const infoDiv = document.getElementById("scriptWristbandInfo");
  if (!select || !infoDiv) return;

  const normalizedId = Number.isFinite(wristbandId) ? wristbandId : null;
  select.value = normalizedId ? String(normalizedId) : "";

  if (!normalizedId) {
    scriptWristband = null;
    infoDiv.textContent = "";
    if (shouldRender) renderScript();
    return;
  }

  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved.find((item) => item.id === normalizedId);
  if (!wb) {
    scriptWristband = null;
    infoDiv.textContent = "";
    select.value = "";
    if (shouldRender) renderScript();
    return;
  }

  scriptWristband = wb;
  const totalPlays = wb.cards
    ? wb.cards.reduce(
      (sum, card) => sum + card.data.filter((play) => play !== null).length,
      0,
    )
    : 0;
  infoDiv.textContent = `Loaded: ${wb.title} • ${wb.cards ? wb.cards.length : 1} card(s) • ${totalPlays} plays`;

  if (shouldRender) renderScript();
}

function restoreSavedScriptWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object") return;

  const displayOptions =
    workspace.displayOptions && typeof workspace.displayOptions === "object"
      ? workspace.displayOptions
      : null;
  if (displayOptions) {
    Object.entries(displayOptions).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(value);
    });
    saveScriptDisplayOptions();
  }

  const filters = workspace.filters && typeof workspace.filters === "object"
    ? workspace.filters
    : null;
  if (filters) {
    scriptSelectedTypes = Array.isArray(filters.selectedTypes)
      ? [...filters.selectedTypes]
      : [];
    scriptSelectedSituation = Array.isArray(filters.selectedSituation)
      ? [...filters.selectedSituation]
      : [];
    scriptSelectedDown = Array.isArray(filters.selectedDown)
      ? [...filters.selectedDown]
      : [];
    scriptSelectedDistance = Array.isArray(filters.selectedDistance)
      ? [...filters.selectedDistance]
      : [];
    scriptSelectedHash = Array.isArray(filters.selectedHash)
      ? [...filters.selectedHash]
      : [];
    scriptSelectedFieldPos = Array.isArray(filters.selectedFieldPos)
      ? [...filters.selectedFieldPos]
      : [];
    scriptSelectedPersonnel = Array.isArray(filters.selectedPersonnel)
      ? [...filters.selectedPersonnel]
      : [];

    const formationFilter = document.getElementById("scriptFilterFormation");
    const basePlayFilter = document.getElementById("scriptFilterBasePlay");
    const searchInput = document.getElementById("scriptSearchPlay");
    if (formationFilter) formationFilter.value = filters.formation || "";
    if (basePlayFilter) basePlayFilter.value = filters.basePlay || "";
    if (searchInput) searchInput.value = filters.search || "";

    if (typeof filters.filtersCollapsed === "boolean") {
      filtersCollapsed = filters.filtersCollapsed;
      applyScriptFiltersCollapsedState();
    }

    syncScriptCheckboxFilterSelections();
    syncScriptSearchClearButton();
    updateActiveFilterCount();
    _scheduleRenderAvailable();
  }

  collapsedPeriods = new Set(
    Array.isArray(workspace.collapsedPeriodIds)
      ? workspace.collapsedPeriodIds.filter((id) =>
        script.some((item) => item.isSeparator && item.id === id),
      )
      : [],
  );

  setScriptWristbandSelection(workspace.linkedWristbandId || null, false);
}

function scheduleScriptAutosave() {
  scriptAutosaveTimer = queueAutosave(
    scriptAutosaveTimer,
    () => {
      const playCount = script.filter((item) => !item?.isSeparator).length;
      if (playCount === 0) {
        discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
        if (typeof updateSaveStatus === "function") updateSaveStatus("saved");
        return;
      }

      persistDraftData(STORAGE_KEYS.SCRIPT_DRAFT, {
        name: document.getElementById("scriptName")?.value || "",
        date: document.getElementById("scriptDate")?.value || "",
        plays: script,
        workspace: getScriptWorkspaceState(),
      });
      if (typeof updateSaveStatus === "function") updateSaveStatus("saved");
    },
    {
      delay: AUTOSAVE_DEBOUNCE_MS,
      onQueue: () => {
        if (typeof updateSaveStatus === "function") updateSaveStatus("saving");
      },
    },
  );
}

function saveScriptState() {
  historyManager.saveState("script", script);
  markScriptDirty();
  scheduleScriptAutosave();
}

const debouncedSaveScriptState = debounce(saveScriptState, 400);

function resetScriptForNewDraft() {
  script = [];
  bulkSelectedIndices = [];
  selectedAvailablePlays = [];
  collapsedPeriods = new Set();
  lastScriptTargetPeriodId = null;
  scriptAvailPage = 0;

  const scriptNameEl = document.getElementById("scriptName");
  if (scriptNameEl) scriptNameEl.value = "Practice Script";
  const dateEl = document.getElementById("scriptDate");
  if (dateEl) dateEl.value = new Date().toISOString().split("T")[0];

  ensureFirstPeriod();
  renderScript();
  renderAvailablePlays();
  markScriptClean();
  discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
}

async function newScript() {
  const hasPlays = script.some((play) => !play.isSeparator);
  const currentName = document.getElementById("scriptName")?.value || "";
  const isNamedScript = currentName.trim() && currentName.trim() !== "Practice Script";
  const shouldPrompt = hasPlays || isNamedScript || scriptDirty;

  if (shouldPrompt) {
    const choice = await showChoice(
      "Start a fresh script? You can save the current one first or begin a new unsaved script.",
      {
        title: "New Script",
        icon: "✨",
        option1: "💾 Save & New",
        option2: "✨ New Without Saving",
      },
    );

    if (choice === null) return;
    if (choice === "option1") {
      const saved = await saveScript();
      if (!saved) return;
    }
  }

  resetScriptForNewDraft();
  showToast("✨ Started a new script");
}

async function clearScript() {
  return newScript();
}

async function checkScriptDraft() {
  try {
    const draft = storageManager.get(STORAGE_KEYS.SCRIPT_DRAFT, null);
    if (!draft || !draft.plays || draft.plays.length === 0) return;

    const draftPlayCount = draft.plays.filter((item) => !item?.isSeparator).length;
    if (draftPlayCount === 0) {
      discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
      return;
    }

    if (isDraftExpired(draft)) {
      discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
      return;
    }

    const currentPlayCount = script.filter((item) => !item.isSeparator).length;
    if (currentPlayCount > 0) return;
    const savedTime = formatDraftSavedAt(draft, undefined, {
      fallback: "unknown time",
      formatOptions: {
        hour: "numeric",
        minute: "2-digit",
      },
    });

    const doRestore = await showConfirm(
      `Found unsaved script draft!\n\n"${draft.name || "Untitled"}" — ${draftPlayCount} plays\nLast edited: ${savedTime}\n\nRestore it?`,
      {
        title: "📋 Draft Found",
        icon: "📋",
        confirmText: "Restore",
        cancelText: "Discard",
      },
    );

    if (doRestore) {
      const scriptNameInput = document.getElementById("scriptName");
      const scriptDateInput = document.getElementById("scriptDate");
      if (draft.name && scriptNameInput) scriptNameInput.value = draft.name;
      if (draft.date && scriptDateInput) scriptDateInput.value = draft.date;

      script = draft.plays;
      restoreSavedScriptWorkspace(draft.workspace);
      renderScript();
      markScriptDirty();
      showToast("📋 Draft restored");
    } else {
      discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
    }
  } catch (err) {
    console.error("checkScriptDraft error:", err);
    showToast("❌ Error restoring script draft.", {
      duration: 3000,
      type: "error",
    });
  }
}

async function saveScript() {
  try {
    const name = document.getElementById("scriptName").value;
    const date = document.getElementById("scriptDate").value;

    if (!name) {
      showToast("⚠️ Please enter a script name", { type: "warning" });
      return false;
    }

    const savedScripts = getSavedScripts();
    const existing = savedScripts.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const choice = await showChoice(
        `A script named "${existing.name}" already exists.`,
        {
          title: "Duplicate Name",
          icon: "⚠️",
          option1: "💾 Overwrite",
          option2: "➕ Save as Copy",
        },
      );
      if (choice === "option1") {
        existing.name = name;
        existing.date = date;
        existing.plays = safeDeepClone(script);
        existing.workspace = getScriptWorkspaceState();
        existing.savedAt = new Date().toISOString();
        storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
        loadSavedScriptsList();
        markScriptClean();
        discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
        showToast(`✅ "${name}" updated!`);
        return true;
      }

      if (choice !== "option2") {
        return false;
      }
    }

    const scriptData = {
      id: Date.now(),
      name,
      date,
      period: "",
      tempo: "",
      plays: safeDeepClone(script),
      workspace: getScriptWorkspaceState(),
      savedAt: new Date().toISOString(),
    };

    savedScripts.push(scriptData);
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
    loadSavedScriptsList();
    markScriptClean();
    discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
    showToast(`✅ "${name}" saved!`);
    return true;
  } catch (err) {
    console.error("saveScript error:", err);
    showToast("❌ Error saving script.", { duration: 4000, type: "error" });
    return false;
  }
}

function normalizeSavedScriptRecord(record, index = 0) {
  const normalized = record && typeof record === "object" ? record : {};
  return {
    id: normalized.id ?? Date.now() + index,
    name: String(normalized.name || `Saved Script ${index + 1}`),
    date: String(normalized.date || ""),
    period: String(normalized.period || ""),
    tempo: String(normalized.tempo || ""),
    plays: Array.isArray(normalized.plays) ? normalized.plays : [],
    workspace:
      normalized.workspace && typeof normalized.workspace === "object"
        ? normalized.workspace
        : null,
    savedAt: normalized.savedAt || "",
  };
}

function getSavedScripts() {
  const stored = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
  const rawScripts = Array.isArray(stored)
    ? stored
    : stored && typeof stored === "object"
      ? Object.values(stored)
      : [];
  const normalizedScripts = rawScripts.map((record, index) =>
    normalizeSavedScriptRecord(record, index),
  );
  const needsRepair =
    !Array.isArray(stored) ||
    rawScripts.some((record, index) => {
      const normalized = normalizedScripts[index];
      return (
        normalized.id !== record?.id ||
        normalized.name !== record?.name ||
        normalized.date !== (record?.date || "") ||
        normalized.period !== (record?.period || "") ||
        normalized.tempo !== (record?.tempo || "") ||
        normalized.plays !== record?.plays ||
        normalized.workspace !== record?.workspace ||
        normalized.savedAt !== (record?.savedAt || "")
      );
    });

  if (needsRepair) {
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, normalizedScripts);
  }

  return normalizedScripts;
}

function loadSavedScriptsList() {
  const savedScripts = getSavedScripts();
  const container = document.getElementById("savedScriptsList");
  const section = document.getElementById("savedScriptsSection");

  if (savedScripts.length === 0) {
    section.classList.add("hidden");
    document.getElementById("fullDaySection").classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = savedScripts
    .map((savedScript) => {
      const playCount = savedScript.plays.filter((play) => !play.isSeparator).length;
      const periodCount = savedScript.plays.filter((play) => play.isSeparator).length;
      const totalReps = savedScript.plays.reduce(
        (sum, play) => sum + (!play.isSeparator ? play.reps || 1 : 0),
        0,
      );
      const runCount = savedScript.plays.filter(
        (play) => !play.isSeparator && play.type === "Run",
      ).length;
      const passCount = savedScript.plays.filter(
        (play) => !play.isSeparator && play.type === "Pass",
      ).length;
      const periods = savedScript.plays
        .filter((play) => play.isSeparator)
        .map((play) => play.label)
        .join(", ");
      const dateStr = savedScript.date
        ? new Date(savedScript.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
        : "No date";
      const savedTime = savedScript.savedAt
        ? new Date(savedScript.savedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
        : "";
      const restoresWorkspace = Boolean(savedScript.workspace);
      const isCurrent =
        (document.getElementById("scriptName")?.value || "") === savedScript.name &&
        (document.getElementById("scriptDate")?.value || "") === (savedScript.date || "");

      return `
            <div class="saved-script-card">
                <div class="saved-card-main">
                  <div class="saved-card-title-row">
                    <div class="saved-card-title">${escapeHtml(savedScript.name)}</div>
                    ${isCurrent ? '<span class="saved-card-badge">Current</span>' : ""}
                  </div>
                  <div class="saved-card-meta">
                    <span>📅 ${dateStr}</span>
                    <span>📝 ${playCount} plays</span>
                    <span>🔁 ${totalReps} reps</span>
                    ${periodCount > 0 ? `<span>📂 ${periodCount} periods</span>` : ""}
                  </div>
                  <div class="saved-card-meta saved-card-meta-secondary">
                    <span>🏃 ${runCount} run</span>
                    <span>🎯 ${passCount} pass</span>
                    ${restoresWorkspace ? '<span>🧭 Restores workspace</span>' : ""}
                    ${savedTime ? `<span>💾 ${savedTime}</span>` : ""}
                  </div>
                  ${periods ? `<div class="saved-card-periods">${escapeHtml(periods)}</div>` : ""}
                </div>
                <div class="saved-card-actions">
                    <button class="saved-load-btn" data-action="loadScript" data-sid="${savedScript.id}" title="Load this script">Load</button>
                    <button class="saved-rename-btn" data-action="renameSavedScript" data-sid="${savedScript.id}" title="Rename script">✏️</button>
                    <button class="saved-overwrite-btn" data-action="overwriteSavedScript" data-sid="${savedScript.id}" title="Overwrite with current script">Update</button>
                    <button class="saved-del-btn" data-action="deleteSavedScript" data-sid="${savedScript.id}" title="Delete script">✕</button>
                </div>
            </div>
        `;
    })
    .join("");

  loadFullDayScriptList();
}

function loadScript(id) {
  try {
    const savedScripts = getSavedScripts();
    const scriptData = savedScripts.find((savedScript) => savedScript.id === id);
    if (!scriptData) return;

    document.getElementById("scriptName").value = scriptData.name;
    document.getElementById("scriptDate").value = scriptData.date;
    script = scriptData.plays;

    const hasPlays = script.some((play) => !play.isSeparator);
    const hasSeparator = script.some((play) => play.isSeparator);
    if (hasPlays && !hasSeparator) {
      script.unshift({
        isSeparator: true,
        label: scriptData.period || scriptData.name || "Period 1",
        minutes: 0,
        color: UI_COLORS.periodDefault,
        id: Date.now() + Math.random(),
      });
    }

    restoreSavedScriptWorkspace(scriptData.workspace);
    renderScript();
    renderAvailablePlays();
    markScriptClean();
    discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
    showToast(`Loaded "${scriptData.name}"`);
  } catch (err) {
    console.error("loadScript error:", err);
    showToast("❌ Error loading script.", { duration: 4000, type: "error" });
  }
}

async function deleteSavedScript(id) {
  const savedScripts = getSavedScripts();
  const target = savedScripts.find((savedScript) => savedScript.id === id);
  if (!target) return;
  const ok = await showConfirm(`Delete "${target.name}"?`, {
    title: "Delete Script",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  const filtered = savedScripts.filter((savedScript) => savedScript.id !== id);
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, filtered);
  loadSavedScriptsList();
  showToast(`"${target.name}" deleted`);
}

async function renameSavedScript(id) {
  const savedScripts = getSavedScripts();
  const savedScript = savedScripts.find((candidate) => candidate.id === id);
  if (!savedScript) return;
  const newName = await showPrompt("Rename script:", savedScript.name, {
    title: "Rename",
    icon: "✏️",
  });
  if (newName && newName.trim()) {
    savedScript.name = newName.trim();
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
    loadSavedScriptsList();
    showToast(`Renamed to "${savedScript.name}"`);
  }
}

async function overwriteSavedScript(id) {
  const savedScripts = getSavedScripts();
  const savedScript = savedScripts.find((candidate) => candidate.id === id);
  if (!savedScript) return;
  const ok = await showConfirm(
    `Overwrite "${savedScript.name}" with the current script?`,
    { title: "Overwrite", icon: "⚠️", confirmText: "Overwrite", danger: true },
  );
  if (!ok) return;

  savedScript.name = document.getElementById("scriptName").value || savedScript.name;
  savedScript.date = document.getElementById("scriptDate").value || savedScript.date;
  savedScript.plays = safeDeepClone(script);
  savedScript.workspace = getScriptWorkspaceState();
  savedScript.savedAt = new Date().toISOString();
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  loadSavedScriptsList();
  markScriptClean();
  discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
  showToast(`"${savedScript.name}" updated!`);
}

function normalizeScriptTemplateRecord(record, index = 0) {
  const source = record && typeof record === "object" ? record : {};
  const rows = Array.isArray(source.rows)
    ? source.rows
    : Array.isArray(source.plays)
      ? source.plays
      : [];
  const periodCount = rows.filter((item) => item?.isSeparator).length;
  const playCount = rows.filter((item) => item && !item.isSeparator).length;
  return {
    id: source.id ?? `script-template-${Date.now()}-${index}`,
    name: String(source.name || `Script Template ${index + 1}`),
    savedAt: source.savedAt || "",
    includePlays: Boolean(source.includePlays),
    periodCount: Number(source.periodCount || periodCount) || periodCount,
    playCount: Number(source.playCount || playCount) || playCount,
    rows,
    displayOptions:
      source.displayOptions && typeof source.displayOptions === "object"
        ? source.displayOptions
        : null,
  };
}

function getScriptTemplates() {
  const stored = storageManager.get(STORAGE_KEYS.SCRIPT_TEMPLATES, []);
  const rawTemplates = Array.isArray(stored)
    ? stored
    : stored && typeof stored === "object"
      ? Object.values(stored)
      : [];
  const normalizedTemplates = rawTemplates.map((record, index) =>
    normalizeScriptTemplateRecord(record, index),
  );
  const needsRepair =
    !Array.isArray(stored) ||
    rawTemplates.some((record, index) => {
      const normalized = normalizedTemplates[index];
      return (
        normalized.id !== record?.id ||
        normalized.name !== record?.name ||
        normalized.savedAt !== (record?.savedAt || "") ||
        normalized.includePlays !== Boolean(record?.includePlays) ||
        normalized.periodCount !== (Number(record?.periodCount || normalized.periodCount) || normalized.periodCount) ||
        normalized.playCount !== (Number(record?.playCount || normalized.playCount) || normalized.playCount) ||
        normalized.rows !== record?.rows ||
        normalized.displayOptions !== record?.displayOptions
      );
    });

  if (needsRepair) {
    storageManager.set(STORAGE_KEYS.SCRIPT_TEMPLATES, normalizedTemplates);
  }

  return normalizedTemplates;
}

function _saveScriptTemplates(templates) {
  storageManager.set(
    STORAGE_KEYS.SCRIPT_TEMPLATES,
    Array.isArray(templates) ? templates : [],
  );
}

function _cloneScriptTemplateRows(includePlays) {
  const sourceRows = includePlays
    ? script
    : script.filter((item) => item?.isSeparator);
  return safeDeepClone(sourceRows).map((item, index) => {
    if (!item?.isSeparator) return item;
    return {
      ...item,
      id: Date.now() + index + Math.random(),
    };
  });
}

function _buildScriptTemplate(name, includePlays) {
  const rows = _cloneScriptTemplateRows(includePlays);
  const periodCount = rows.filter((item) => item?.isSeparator).length;
  const playCount = rows.filter((item) => item && !item.isSeparator).length;
  return {
    id: `script-template-${Date.now()}`,
    name: name.trim(),
    savedAt: new Date().toISOString(),
    includePlays: Boolean(includePlays),
    periodCount,
    playCount,
    rows,
    displayOptions: getScriptWorkspaceCheckboxState(),
  };
}

function _scriptTemplateLabel(template) {
  const savedTime = template.savedAt
    ? new Date(template.savedAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : "Unknown date";
  const playText = template.includePlays
    ? `${template.playCount || 0} plays`
    : "structure only";
  return `${template.name} • ${template.periodCount || 0} periods • ${playText} • ${savedTime}`;
}

async function saveScriptTemplate() {
  ensureFirstPeriod();
  const playCount = script.filter((item) => item && !item.isSeparator).length;
  const periodCount = script.filter((item) => item?.isSeparator).length;
  const defaultName = document.getElementById("scriptName")?.value || "Practice Day";
  const name = await showPrompt("Name this script template:", defaultName, {
    title: "Save Script Template",
    icon: "📁",
    placeholder: "e.g. Monday install, Thursday polish",
  });
  if (!name || !name.trim()) return;

  let includePlays = false;
  if (playCount > 0) {
    const choice = await showChoice(
      "Save only the period structure, or include the drafted plays too?",
      {
        title: "Template Contents",
        icon: "📁",
        option1: "Structure only",
        option2: `Include ${playCount} plays`,
      },
    );
    if (!choice) return;
    includePlays = choice === "option2";
  }

  const templates = getScriptTemplates();
  const existingIdx = templates.findIndex(
    (template) => template.name.toLowerCase() === name.trim().toLowerCase(),
  );
  const nextTemplate = _buildScriptTemplate(name, includePlays);
  nextTemplate.periodCount = periodCount;

  if (existingIdx >= 0) {
    const ok = await showConfirm(
      `Replace existing template <strong>${escapeHtml(templates[existingIdx].name)}</strong>?`,
      {
        title: "Replace Template",
        icon: "📁",
        confirmText: "Replace",
        danger: true,
      },
    );
    if (!ok) return;
    nextTemplate.id = templates[existingIdx].id || nextTemplate.id;
    templates.splice(existingIdx, 1, nextTemplate);
  } else {
    templates.unshift(nextTemplate);
  }

  _saveScriptTemplates(templates);
  showToast(`Saved template "${nextTemplate.name}"`, { type: "success" });
}

async function openScriptTemplatesMenu() {
  const templates = getScriptTemplates();
  if (templates.length === 0) {
    showToast("No script templates yet. Use Save Day Template first.", {
      type: "info",
      duration: 3500,
    });
    return;
  }

  const choice = await showListPicker(
    "Pick a reusable script template:",
    templates.map((template) => ({
      value: String(template.id),
      label: _scriptTemplateLabel(template),
    })),
    { title: "📁 Script Templates", icon: "📁" },
  );
  if (!choice) return;

  const action = await showChoice(
    "What do you want to do with this template?",
    {
      title: "Script Template",
      icon: "📁",
      option1: "Load as new draft",
      option2: "Delete",
    },
  );
  if (!action) return;
  if (action === "option1") await _loadScriptTemplate(choice);
  else if (action === "option2") await _deleteScriptTemplate(choice);
}

async function _loadScriptTemplate(templateId) {
  const templates = getScriptTemplates();
  const template = templates.find((item) => String(item.id) === String(templateId));
  if (!template) return;
  const ok = await showConfirm(
    `Load <strong>${escapeHtml(template.name)}</strong> as a new script draft? This replaces the current script workspace.`,
    {
      title: "Load Template",
      icon: "📁",
      confirmText: "Load",
      danger: true,
    },
  );
  if (!ok) return;

  saveScriptState();
  const scriptNameEl = document.getElementById("scriptName");
  const scriptDateEl = document.getElementById("scriptDate");
  if (scriptNameEl) scriptNameEl.value = template.name;
  if (scriptDateEl) scriptDateEl.value = new Date().toISOString().split("T")[0];

  script = _cloneTemplateRowsForLoad(template);
  bulkSelectedIndices = [];
  selectedAvailablePlays = [];
  collapsedPeriods = new Set();
  lastScriptTargetPeriodId = null;
  scriptAvailPage = 0;

  if (template.displayOptions) {
    Object.entries(template.displayOptions).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(value);
    });
    saveScriptDisplayOptions();
  }

  ensureFirstPeriod();
  renderScript();
  renderAvailablePlays();
  markScriptDirty();
  scheduleScriptAutosave();
  showToast(`Loaded template "${template.name}"`, { type: "success" });
}

function _cloneTemplateRowsForLoad(template) {
  return safeDeepClone(template.rows || []).map((item, index) => {
    if (!item?.isSeparator) return item;
    return {
      ...item,
      id: Date.now() + index + Math.random(),
    };
  });
}

async function _deleteScriptTemplate(templateId) {
  const templates = getScriptTemplates();
  const template = templates.find((item) => String(item.id) === String(templateId));
  if (!template) return;
  const ok = await showConfirm(
    `Delete template <strong>${escapeHtml(template.name)}</strong>?`,
    {
      title: "Delete Template",
      icon: "🗑️",
      confirmText: "Delete",
      danger: true,
    },
  );
  if (!ok) return;
  _saveScriptTemplates(templates.filter((item) => String(item.id) !== String(templateId)));
  showToast("Template deleted", { type: "success" });
}

function _parseScriptUsageDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function _getScriptUsageWeekRange(anchorDate) {
  const date = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
    ? new Date(anchorDate)
    : new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const mondayOffset = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function _scriptUsageWeekLabel(range) {
  if (!range?.start || !range?.end) return "current week";
  const opts = { month: "short", day: "numeric" };
  return `${range.start.toLocaleDateString("en-US", opts)}-${range.end.toLocaleDateString("en-US", opts)}`;
}

function _scriptUsageKeys(play) {
  if (!play || play.isSeparator) return [];
  const keys = [];
  if (play.id) keys.push(`id:${String(play.id)}`);
  if (typeof getPlayIdentityKey === "function") {
    const core = getPlayIdentityKey(play, "core", { trim: false });
    if (core) keys.push(`core:${core}`);
    const name = getPlayIdentityKey(play, "name", { normalizeCase: true });
    if (name) keys.push(`name:${name}`);
  } else if (play.play || play.formation) {
    keys.push(`name:${String(play.formation || "").toLowerCase()}|${String(play.play || "").toLowerCase()}`);
  }
  return [...new Set(keys)];
}

function _scriptUsageRepCount(play) {
  const reps = Number(play?.reps);
  return Number.isFinite(reps) && reps > 0 ? reps : 1;
}

function _addScriptUsageCounts(map, play, amount) {
  _scriptUsageKeys(play).forEach((key) => {
    map.set(key, (map.get(key) || 0) + amount);
  });
}

function _getScriptUsageScopeMax(map, play) {
  return _scriptUsageKeys(play).reduce(
    (max, key) => Math.max(max, map.get(key) || 0),
    0,
  );
}

function getPlayUsageIndex() {
  const scriptMap = new Map();
  const weekMap = new Map();
  const seasonMap = new Map();
  const currentDateValue = document.getElementById("scriptDate")?.value || new Date().toISOString().slice(0, 10);
  const currentDate = _parseScriptUsageDate(currentDateValue) || new Date();
  const weekRange = _getScriptUsageWeekRange(currentDate);
  const currentName = document.getElementById("scriptName")?.value || "";

  const addRows = (rows, map) => {
    if (!Array.isArray(rows)) return;
    rows.forEach((play) => {
      if (!play || play.isSeparator) return;
      _addScriptUsageCounts(map, play, _scriptUsageRepCount(play));
    });
  };

  addRows(script, scriptMap);
  addRows(script, weekMap);
  addRows(script, seasonMap);

  getSavedScripts().forEach((savedScript) => {
    const sameCurrentDraft =
      currentName &&
      savedScript.name === currentName &&
      savedScript.date === currentDateValue;
    if (sameCurrentDraft) return;

    const savedDate = _parseScriptUsageDate(savedScript.date);
    const inCurrentWeek =
      savedDate &&
      savedDate >= weekRange.start &&
      savedDate <= weekRange.end;

    if (inCurrentWeek) addRows(savedScript.plays, weekMap);
    addRows(savedScript.plays, seasonMap);
  });

  return {
    weekLabel: _scriptUsageWeekLabel(weekRange),
    get(play) {
      return {
        script: _getScriptUsageScopeMax(scriptMap, play),
        week: _getScriptUsageScopeMax(weekMap, play),
        season: _getScriptUsageScopeMax(seasonMap, play),
      };
    },
  };
}

function populateScriptWristbandSelect() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const select = document.getElementById("scriptWristbandSelect");
  if (!select) return;

  select.innerHTML =
    '<option value="">-- No Wristband --</option>' +
    saved
      .map((wristband) => {
        const totalPlays = wristband.cards
          ? wristband.cards.reduce(
            (sum, card) => sum + card.data.filter((play) => play !== null).length,
            0,
          )
          : 0;
        return `<option value="${wristband.id}">${escapeHtml(wristband.title)} (${totalPlays} plays)</option>`;
      })
      .join("");
}

function initScriptWorkspace() {
  renderAvailablePlays();
  loadSavedScriptsList();
  populateScriptWristbandSelect();
  restoreScriptDisplayOptions();
  ensureFirstPeriod();
  if (typeof refreshPeriodTemplateQuickPick === "function") {
    refreshPeriodTemplateQuickPick();
  }
  renderScript();
}

function loadWristbandForScript() {
  const select = document.getElementById("scriptWristbandSelect");
  if (!select) return;
  setScriptWristbandSelection(parseInt(select.value, 10), true);
}

function findPlayOnWristband(play) {
  if (!scriptWristband || !scriptWristband.cards) return null;

  for (let cardIdx = 0; cardIdx < scriptWristband.cards.length; cardIdx++) {
    const card = scriptWristband.cards[cardIdx];
    const cardOffset = cardIdx * 40;
    for (let cellIdx = 0; cellIdx < card.data.length; cellIdx++) {
      const wristbandPlay = card.data[cellIdx];
      if (wristbandPlay && playsMatch(play, wristbandPlay)) {
        return cellIdx + 11 + cardOffset;
      }
    }
  }
  return null;
}
