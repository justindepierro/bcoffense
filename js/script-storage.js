function getScriptWorkspaceCheckboxState() {
  const checkboxState = {};
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) checkboxState[id] = Boolean(el.checked);
  });
  return checkboxState;
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