function getScriptWorkspaceCheckboxState() {
  const checkboxState = {};
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) checkboxState[id] = Boolean(el.checked);
  });
  return checkboxState;
}

let scriptAutosaveTimer = null;
let scriptEditHistoryTimer = null;

function resetActiveScriptIdentity() {
  activeScriptSaveId = null;
  activeScriptSaveTitle = "";
  activeScriptSavedAt = "";
}

function finalizeScriptSave(record) {
  if (record) {
    activeScriptSaveId = record.id;
    activeScriptSaveTitle = record.name || "Practice Script";
    activeScriptSavedAt = record.savedAt || new Date().toISOString();
  }
  markScriptClean();
  discardDraftData(STORAGE_KEYS.SCRIPT_DRAFT);
  if (typeof recordArtifactModified === "function") recordArtifactModified("script");
  if (typeof updateScriptArtifactStatus === "function") updateScriptArtifactStatus();
}

async function confirmScriptHandoffPersistence(summary) {
  const choice = await showChoice(
    `<p>${escapeHtml(summary)}</p><p>This is currently a local recovery draft. Save it to the Script Library so it appears in Load Scripts and remains part of the workflow.</p>`,
    {
      title: "Save Script Destination?",
      icon: "💾",
      option1: "Save to Script Library",
      option2: "Keep recovery draft",
    },
  );
  if (choice === "option1") return saveScript();
  if (choice === "option2") {
    showToast("Script kept as a local recovery draft. Use Save to add it to the Script Library.", {
      type: "info",
      duration: 4500,
    });
  }
  return false;
}

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
        activeSaveId: activeScriptSaveId,
        activeTitle: activeScriptSaveTitle,
        activeSavedAt: activeScriptSavedAt,
      });
      if (typeof updateSaveStatus === "function") updateSaveStatus("draft");
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
  endScriptEditHistoryWindow();
  historyManager.saveState("script", script);
  markScriptDirty();
  scheduleScriptAutosave();
}

function endScriptEditHistoryWindow() {
  if (!scriptEditHistoryTimer) return;
  clearTimeout(scriptEditHistoryTimer);
  scriptEditHistoryTimer = null;
}

function beginScriptEdit() {
  if (!scriptEditHistoryTimer) {
    historyManager.saveState("script", script);
  } else {
    clearTimeout(scriptEditHistoryTimer);
  }
  scriptEditHistoryTimer = setTimeout(() => {
    scriptEditHistoryTimer = null;
  }, 400);
  markScriptDirty();
  scheduleScriptAutosave();
}

function resetScriptForNewDraft() {
  endScriptEditHistoryWindow();
  historyManager.clear("script");
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
  resetActiveScriptIdentity();
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
      activeScriptSaveId = draft.activeSaveId ?? null;
      activeScriptSaveTitle = draft.activeTitle || "";
      activeScriptSavedAt = draft.activeSavedAt || "";

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
    const active = savedScripts.find(
      (s) => String(s.id) === String(activeScriptSaveId),
    );
    const existing = active || savedScripts.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      if (active) {
        existing.name = name;
        existing.date = date;
        existing.plays = safeDeepClone(script);
        existing.workspace = getScriptWorkspaceState();
        existing.savedAt = new Date().toISOString();
        if (typeof isSavedScriptPlayerVisible === "function"
          ? isSavedScriptPlayerVisible(existing)
          : Boolean(existing.playerVisible)) {
          existing.playerPublishedAt = existing.savedAt;
          if (typeof recordPlayerPublishStatus === "function") {
            recordPlayerPublishStatus("scripts", {
              updatedAt: existing.playerPublishedAt,
              label: existing.name || "Practice script",
              id: existing.id || "",
            });
          }
        }
        storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
        loadSavedScriptsList();
        finalizeScriptSave(existing);
        showToast(`✅ "${name}" updated in Script Library.`);
        return true;
      }
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
        if (typeof isSavedScriptPlayerVisible === "function"
          ? isSavedScriptPlayerVisible(existing)
          : Boolean(existing.playerVisible)) {
          existing.playerPublishedAt = existing.savedAt;
          if (typeof recordPlayerPublishStatus === "function") {
            recordPlayerPublishStatus("scripts", {
              updatedAt: existing.playerPublishedAt,
              label: existing.name || "Practice script",
              id: existing.id || "",
            });
          }
        }
        storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
        loadSavedScriptsList();
        finalizeScriptSave(existing);
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
      playerVisible: false,
      plays: safeDeepClone(script),
      workspace: getScriptWorkspaceState(),
      savedAt: new Date().toISOString(),
    };

    savedScripts.push(scriptData);
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
    loadSavedScriptsList();
    finalizeScriptSave(scriptData);
    showToast(`✅ "${name}" saved!`);
    return true;
  } catch (err) {
    console.error("saveScript error:", err);
    showToast("❌ Error saving script.", { duration: 4000, type: "error" });
    return false;
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
  if (String(activeScriptSaveId) === String(id)) {
    resetActiveScriptIdentity();
    markScriptDirty();
  }
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
    savedScript.savedAt = new Date().toISOString();
    storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
    if (String(activeScriptSaveId) === String(id)) {
      activeScriptSaveTitle = savedScript.name;
      activeScriptSavedAt = savedScript.savedAt;
      if (typeof updateScriptArtifactStatus === "function") updateScriptArtifactStatus();
    }
    if (typeof recordArtifactModified === "function") recordArtifactModified("script");
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
  if (typeof isSavedScriptPlayerVisible === "function"
    ? isSavedScriptPlayerVisible(savedScript)
    : Boolean(savedScript.playerVisible)) {
    savedScript.playerPublishedAt = savedScript.savedAt;
    if (typeof recordPlayerPublishStatus === "function") {
      recordPlayerPublishStatus("scripts", {
        updatedAt: savedScript.playerPublishedAt,
        label: savedScript.name || "Practice script",
        id: savedScript.id || "",
      });
    }
  }
  storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, savedScripts);
  loadSavedScriptsList();
  finalizeScriptSave(savedScript);
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
    if (typeof getPlayCompareKey === "function") {
      const compareCore = getPlayCompareKey(play, "core");
      if (compareCore) keys.push(`ccore:${compareCore}`);
      const compareName = getPlayCompareKey(play, "name");
      if (compareName) keys.push(`cname:${compareName}`);
    }
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
  if (typeof initScriptControlsMode === "function") {
    initScriptControlsMode();
  }
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

  const cellsPerCard = getWristbandRecordCellCount(scriptWristband);
  for (let cardIdx = 0; cardIdx < scriptWristband.cards.length; cardIdx++) {
    const card = scriptWristband.cards[cardIdx];
    const cardOffset = cardIdx * cellsPerCard;
    for (
      let cellIdx = 0;
      cellIdx < Math.min(card.data.length, cellsPerCard);
      cellIdx++
    ) {
      const wristbandPlay = card.data[cellIdx];
      if (wristbandPlay && playsMatch(play, wristbandPlay)) {
        return cellIdx + WRISTBAND_OFFSET + cardOffset;
      }
    }
  }
  return null;
}
