function applyWristbandDisplaySettings(displaySettings) {
  if (!displaySettings) return;

  const setCheckbox = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  };

  setCheckbox("wbShowEmoji", displaySettings.showEmoji);
  setCheckbox("wbUseSquares", displaySettings.useSquares);
  setCheckbox("wbUnderEmoji", displaySettings.underEmoji);
  setCheckbox("wbBoldShifts", displaySettings.boldShifts);
  setCheckbox("wbRedShifts", displaySettings.redShifts);
  setCheckbox("wbItalicMotions", displaySettings.italicMotions);
  setCheckbox("wbRedMotions", displaySettings.redMotions);
  setCheckbox("wbRemoveVowels", displaySettings.noVowels || displaySettings.removeVowels);
  setCheckbox("wbShowLineCall", displaySettings.showLineCall);
  setCheckbox("wbLineCallOnly", displaySettings.lineCallOnly);
  setCheckbox("wbCadenceReminder", displaySettings.cadenceReminder);
  setCheckbox("wbHighlightHuddle", displaySettings.highlightHuddle);
  setCheckbox("wbHighlightCandy", displaySettings.highlightCandy);
  if (typeof syncWristbandLineCallOnlyControls === "function") {
    syncWristbandLineCallOnlyControls("classic");
  }
  if (typeof syncWbDisplayPresetSelection === "function") {
    syncWbDisplayPresetSelection();
  }
}

function syncWristbandHeaderColorPicker() {
  document.querySelectorAll(".color-btn").forEach((button) => {
    const isTransparentBtn = button.classList.contains("color-btn-transparent");
    const isMatch =
      wristbandHeaderColor === "transparent"
        ? isTransparentBtn
        : button.style.background === wristbandHeaderColor ||
        button.style.backgroundColor === wristbandHeaderColor;
    button.classList.toggle("active", isMatch);
  });
}

function hydrateWristbandState(source, opts = {}) {
  if (source?.wristbandType === "player" || source?.wristbandType === "classic") {
    wristbandType = source.wristbandType;
    wbPlayerCardMode = wristbandType === "player";
  }
  wristbandHeaderColor = source?.headerColor || "transparent";

  if (Array.isArray(source?.cards) && source.cards.length > 0) {
    wristbandCards = safeDeepClone(source.cards);
  } else if (Array.isArray(source?.data)) {
    wristbandCards = [{ name: "Card 1", data: safeDeepClone(source.data) }];
  } else {
    wristbandCards = [{ name: "Card 1", data: Array(CELLS_PER_CARD).fill(null) }];
  }

  cellCustomizations = source?.cellStyles ? safeDeepClone(source.cellStyles) : {};
  wbFavorites = normalizeWbFavorites(
    opts.preserveFavorites
      ? storageManager.get(STORAGE_KEYS.WRISTBAND_FAVORITES, [])
      : source?.favorites ||
      storageManager.get(STORAGE_KEYS.WRISTBAND_FAVORITES, []),
  );
  storageManager.set(STORAGE_KEYS.WRISTBAND_FAVORITES, wbFavorites);
  currentCardIndex = Number.isInteger(source?.currentCardIndex)
    ? Math.max(0, Math.min(source.currentCardIndex, wristbandCards.length - 1))
    : 0;

  applyWristbandDisplaySettings(source?.displaySettings);
  syncWristbandHeaderColorPicker();
  refreshWristbandEditorView({ updateCardColorPicker: true });

  if (opts.markDirty) {
    markWristbandDirty();
  } else {
    markWristbandClean();
  }

  if (opts.discardDraft) {
    discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
  }
}

function buildWristbandSaveRecord(title, opts = {}) {
  return {
    id: opts.id ?? Date.now(),
    title,
    wristbandType: wristbandType || "classic",
    headerColor: wristbandHeaderColor,
    cards: safeDeepClone(wristbandCards),
    cellStyles: safeDeepClone(cellCustomizations),
    favorites: safeDeepClone(wbFavorites),
    displaySettings: getWristbandDisplayOptions(),
    savedAt: opts.savedAt || new Date().toISOString(),
  };
}

function finalizeWristbandSave() {
  refreshWristbandSavedReferences();
  markWristbandClean();
  discardDraftData(STORAGE_KEYS.WRISTBAND_DRAFT);
}

async function saveWristband() {
  try {
    const cellsPerCard = getActiveWristbandCellCount();
    const totalPlays = wristbandCards.reduce(
      (sum, c) =>
        sum + c.data.slice(0, cellsPerCard).filter((p) => p !== null).length,
      0,
    );
    if (totalPlays === 0) {
      const proceed = await showConfirm("All cards are empty. Save anyway?", {
        title: "Empty Wristband",
        icon: "⚠️",
        confirmText: "Save Empty",
      });
      if (!proceed) return;
    }

    const name = await showPrompt(
      "Name for this wristband set:",
      `Wristband Set ${new Date().toLocaleDateString()}`,
      { title: "Save Wristband", icon: "💾" },
    );
    if (!name) return;
    const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);

    const existing = saved.find(
      (s) => s.title.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const choice = await showChoice(
        `A wristband named "${existing.title}" already exists.`,
        {
          title: "Duplicate Name",
          icon: "⚠️",
          option1: "💾 Overwrite",
          option2: "➕ Save as Copy",
        },
      );
      if (choice === "option1") {
        Object.assign(
          existing,
          buildWristbandSaveRecord(name, { id: existing.id }),
        );
        storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
        finalizeWristbandSave();
        showToast(`✅ "${name}" updated!`);
        return;
      }
      if (choice !== "option2") {
        return;
      }
    }

    saved.push(buildWristbandSaveRecord(name));
    storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
    finalizeWristbandSave();
    showToast(`✅ "${name}" saved!`);
  } catch (err) {
    console.error("saveWristband error:", err);
    showToast("❌ Error saving wristband.", { duration: 4000, type: "error" });
  }
}

const WRISTBAND_TEMPLATES_KEY = STORAGE_KEYS.WRISTBAND_TEMPLATES;

function _emptyWristbandCardData() {
  return Array(CELLS_PER_CARD).fill(null);
}

function _countWristbandRecordPlays(record) {
  const cellsPerCard = getWristbandRecordCellCount(record);
  if (Array.isArray(record?.cards)) {
    return record.cards.reduce(
      (sum, card) =>
        sum +
        (Array.isArray(card?.data)
          ? card.data.slice(0, cellsPerCard).filter((play) => play !== null).length
          : 0),
      0,
    );
  }
  if (Array.isArray(record?.data)) {
    return record.data.slice(0, cellsPerCard).filter((play) => play !== null).length;
  }
  return 0;
}

function _normalizeWristbandTemplateGroup(value) {
  const group = String(value || "").trim().replace(/\s+/g, " ");
  return group || "All";
}

function _defaultWristbandTemplateGroup() {
  const cardName = wristbandCards[currentCardIndex]?.name || "";
  const match = cardName.match(
    /\b(QB|RB|WR|TE|OL|DL|LB|DB|ST|JV|Varsity|Scout|Skill)\b/i,
  );
  if (!match) return "All";
  return match[1].length <= 3 ? match[1].toUpperCase() : match[1];
}

function _cloneWristbandTemplateCards(includePlays) {
  const cards =
    Array.isArray(wristbandCards) && wristbandCards.length
      ? wristbandCards
      : [{ name: "Card 1", data: _emptyWristbandCardData() }];
  return safeDeepClone(cards).map((card, index) => ({
    ...card,
    name: card?.name || `Card ${index + 1}`,
    data:
      includePlays && Array.isArray(card?.data)
        ? safeDeepClone(card.data)
        : _emptyWristbandCardData(),
  }));
}

function normalizeWristbandTemplateRecord(record, index = 0) {
  const source = record && typeof record === "object" ? record : {};
  const normalizedType = source.wristbandType === "player" ? "player" : "classic";
  const cards =
    Array.isArray(source.cards) && source.cards.length
      ? safeDeepClone(source.cards)
      : Array.isArray(source.data)
        ? [{ name: "Card 1", data: safeDeepClone(source.data) }]
        : [{ name: "Card 1", data: _emptyWristbandCardData() }];
  const countedPlays = _countWristbandRecordPlays({
    cards,
    wristbandType: normalizedType,
  });
  const includePlays =
    source.includePlays !== undefined
      ? Boolean(source.includePlays)
      : countedPlays > 0;

  return {
    id: source.id ?? `wbt-${Date.now()}-${index}`,
    name: String(
      source.name || source.title || `Wristband Template ${index + 1}`,
    ),
    group: _normalizeWristbandTemplateGroup(source.group || source.positionGroup),
    savedAt: source.savedAt || "",
    wristbandType: normalizedType,
    includePlays,
    cardCount: Number(source.cardCount || cards.length) || cards.length,
    playCount: includePlays
      ? Number(source.playCount || countedPlays) || countedPlays
      : 0,
    headerColor: source.headerColor || "transparent",
    cards,
    cellStyles:
      source.cellStyles && typeof source.cellStyles === "object"
        ? safeDeepClone(source.cellStyles)
        : {},
    favorites: Array.isArray(source.favorites) ? safeDeepClone(source.favorites) : [],
    displaySettings:
      source.displaySettings && typeof source.displaySettings === "object"
        ? safeDeepClone(source.displaySettings)
        : null,
    currentCardIndex: Number.isInteger(source.currentCardIndex)
      ? Math.max(0, Math.min(source.currentCardIndex, cards.length - 1))
      : 0,
  };
}

function getWristbandTemplates() {
  const stored = storageManager.get(WRISTBAND_TEMPLATES_KEY, []);
  const rawTemplates = Array.isArray(stored)
    ? stored
    : stored && typeof stored === "object"
      ? Object.values(stored)
      : [];
  const templates = rawTemplates.map((record, index) =>
    normalizeWristbandTemplateRecord(record, index),
  );
  const needsRepair =
    !Array.isArray(stored) ||
    rawTemplates.some(
      (record) =>
        !record ||
        typeof record !== "object" ||
        !record.id ||
        !record.name ||
        !Array.isArray(record.cards) ||
        record.group === undefined ||
        record.wristbandType === undefined,
    );

  if (needsRepair) {
    storageManager.set(WRISTBAND_TEMPLATES_KEY, templates);
  }

  return templates;
}

function _saveWristbandTemplates(templates) {
  storageManager.set(
    WRISTBAND_TEMPLATES_KEY,
    Array.isArray(templates) ? templates : [],
  );
}

function _buildWristbandTemplate(name, group, includePlays) {
  const cards = _cloneWristbandTemplateCards(includePlays);
  const templateType = wristbandType || "classic";
  return {
    id: `wbt-${Date.now()}`,
    name: name.trim(),
    group: _normalizeWristbandTemplateGroup(group),
    savedAt: new Date().toISOString(),
    wristbandType: templateType,
    includePlays: Boolean(includePlays),
    cardCount: cards.length,
    playCount: includePlays
      ? _countWristbandRecordPlays({ cards, wristbandType: templateType })
      : 0,
    headerColor: wristbandHeaderColor,
    cards,
    cellStyles: safeDeepClone(cellCustomizations),
    displaySettings: getWristbandDisplayOptions(),
    currentCardIndex,
  };
}

function _wristbandTemplateMeta(template) {
  const savedTime = template.savedAt
    ? new Date(template.savedAt).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : "Unknown date";
  const playText = template.includePlays
    ? `${template.playCount || _countWristbandRecordPlays(template)} plays`
    : "structure only";

  return {
    savedTime,
    playText,
    cardText: `${template.cardCount || template.cards?.length || 1} card(s)`,
  };
}

async function saveWristbandTemplate() {
  try {
    const totalPlays = _countWristbandRecordPlays({
      cards: wristbandCards,
      wristbandType: wristbandType || "classic",
    });
    const defaultName = wristbandCards[currentCardIndex]?.name
      ? `${wristbandCards[currentCardIndex].name} Template`
      : "Wristband Template";
    const name = await showPrompt("Name this wristband template:", defaultName, {
      title: "Save Wristband Template",
      icon: "📁",
      placeholder: "e.g. QB game day, WR tags, OL scout",
    });
    if (!name || !name.trim()) return;

    const group = await showPrompt(
      "Position or group for this template:",
      _defaultWristbandTemplateGroup(),
      {
        title: "Template Group",
        icon: "🏷️",
        placeholder: "e.g. QB, WR, OL, Varsity",
      },
    );
    if (group === null) return;

    let includePlays = false;
    if (totalPlays > 0) {
      const choice = await showChoice(
        "Save only the card structure, or include the filled plays too?",
        {
          title: "Template Contents",
          icon: "📁",
          option1: "Structure only",
          option2: `Include ${totalPlays} plays`,
        },
      );
      if (!choice) return;
      includePlays = choice === "option2";
    }

    const templates = getWristbandTemplates();
    const nextTemplate = _buildWristbandTemplate(name, group, includePlays);
    const existingIdx = templates.findIndex(
      (template) =>
        template.name.toLowerCase() === nextTemplate.name.toLowerCase() &&
        _normalizeWristbandTemplateGroup(template.group).toLowerCase() ===
        nextTemplate.group.toLowerCase(),
    );

    if (existingIdx >= 0) {
      const ok = await showConfirm(
        `Replace existing <strong>${escapeHtml(templates[existingIdx].group)}</strong> template <strong>${escapeHtml(templates[existingIdx].name)}</strong>?`,
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

    _saveWristbandTemplates(templates);
    showToast(`Saved ${nextTemplate.group} template "${nextTemplate.name}"`, {
      type: "success",
    });
  } catch (err) {
    console.error("saveWristbandTemplate error:", err);
    showToast("❌ Error saving wristband template.", {
      duration: 4000,
      type: "error",
    });
  }
}

async function openWristbandTemplatesMenu() {
  const templates = getWristbandTemplates();
  if (templates.length === 0) {
    showToast("No wristband templates yet. Use Template to save one.", {
      type: "info",
      duration: 3500,
    });
    return;
  }

  const choice = await showListPicker(
    "Pick a reusable wristband template:",
    templates.map((template) => {
      const meta = _wristbandTemplateMeta(template);
      return {
        value: String(template.id),
        eyebrow: template.group || "All",
        label: template.name || "Untitled Template",
        sublabel: `${meta.cardText} • ${meta.playText}`,
        meta: meta.savedTime,
        badge: template.includePlays ? "Plays" : "Structure",
      };
    }),
    { title: "📁 Wristband Templates", icon: "📁" },
  );
  if (!choice) return;

  const action = await showChoice("What do you want to do with this template?", {
    title: "Wristband Template",
    icon: "📁",
    option1: "Load as new wristband",
    option2: "Delete",
  });
  if (!action) return;
  if (action === "option1") await _loadWristbandTemplate(choice);
  else if (action === "option2") await _deleteWristbandTemplate(choice);
}

async function _loadWristbandTemplate(templateId) {
  const templates = getWristbandTemplates();
  const template = templates.find(
    (item) => String(item.id) === String(templateId),
  );
  if (!template) return;
  const playCount = template.playCount || _countWristbandRecordPlays(template);
  const playCopy = template.includePlays
    ? ` This also loads ${playCount} saved play${playCount === 1 ? "" : "s"}.`
    : " Cells will start empty.";
  const ok = await showConfirm(
    `Load <strong>${escapeHtml(template.name)}</strong> for <strong>${escapeHtml(template.group)}</strong>? This replaces the current wristband workspace.${playCopy}`,
    {
      title: "Load Template",
      icon: "📁",
      confirmText: "Load",
      danger: true,
    },
  );
  if (!ok) return;

  saveWristbandState();
  hydrateWristbandState(template, { markDirty: true, preserveFavorites: true });
  if (template.wristbandType === "player") {
    startPlayerWristband();
  } else {
    startClassicWristband();
  }
  scheduleWristbandAutosave();
  showToast(`Loaded template "${template.name}"`, { type: "success" });
}

async function _deleteWristbandTemplate(templateId) {
  const templates = getWristbandTemplates();
  const template = templates.find(
    (item) => String(item.id) === String(templateId),
  );
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

  _saveWristbandTemplates(
    templates.filter((item) => String(item.id) !== String(templateId)),
  );
  showToast("Template deleted", { type: "success" });
}

function loadSavedWristbandsList() {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const container = document.getElementById("savedWristbandsList");
  const section = document.getElementById("savedWristbandsSection");

  if (saved.length === 0) {
    setWristbandSavedSectionVisibility(section, false);
    return;
  }
  if (!container) return;

  setWristbandSavedSectionVisibility(section, true);
  const totalPlays = (wb) => _countWristbandRecordPlays(wb);
  const cardCount = (wb) => (wb.cards ? wb.cards.length : 1);
  const favoriteCount = (wb) =>
    Array.isArray(wb.favorites) ? normalizeWbFavorites(wb.favorites).length : 0;
  container.innerHTML = saved
    .map((s) => {
      const savedTime = s.savedAt
        ? new Date(s.savedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
        : "";
      return `
        <div class="saved-script-card">
          <div class="saved-card-main">
            <div class="saved-card-title">${escapeHtml(s.title)}</div>
            <div class="saved-card-meta">
              <span>${s.wristbandType === "player" ? "🃏 Player" : "📋 Classic"}</span>
              <span>🃏 ${cardCount(s)} card(s)</span>
              <span>📝 ${totalPlays(s)} plays</span>
              ${favoriteCount(s) > 0 ? `<span>⭐ ${favoriteCount(s)} pinned</span>` : ""}
              ${savedTime ? `<span>💾 ${savedTime}</span>` : ""}
            </div>
          </div>
          <div class="saved-card-actions">
            <button class="saved-load-btn" data-action="loadWristband" data-idx="${s.id}" title="Load this wristband">Load</button>
            <button class="saved-rename-btn" data-action="renameSavedWristband" data-idx="${s.id}" title="Rename">✏️</button>
            <button class="saved-overwrite-btn" data-action="overwriteSavedWristband" data-idx="${s.id}" title="Overwrite with current wristband">⬆️</button>
            <button class="saved-del-btn" data-action="deleteSavedWristband" data-idx="${s.id}" title="Delete">✕</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function refreshWristbandSavedReferences() {
  loadSavedWristbandsList();
  populateScriptWristbandSelect();
  populateWristbandHighlightDropdown();
}

function setWristbandSavedSectionVisibility(section, isVisible) {
  if (!section) return;
  section.classList.toggle("hidden", !isVisible);
  section.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function loadWristband(id) {
  try {
    const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
    const wb = saved.find((s) => s.id === id);
    if (!wb) return;

    hydrateWristbandState(wb, { discardDraft: true });
    historyManager.clear("wristband");

    // Dismiss the type-choice overlay and activate the correct wristband mode.
    // Without this, loading from the landing screen leaves the overlay visible.
    if (wb.wristbandType === "player") {
      startPlayerWristband();
    } else {
      startClassicWristband();
    }

    showToast(`Loaded "${wb.title}"`);
  } catch (err) {
    console.error("loadWristband error:", err);
    showToast("❌ Error loading wristband.", { duration: 4000, type: "error" });
  }
}

async function deleteSavedWristband(id) {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const target = saved.find((s) => s.id === id);
  if (!target) return;
  const ok = await showConfirm(`Delete "${target.title}"?`, {
    title: "Delete Wristband",
    icon: "🗑️",
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;

  const filtered = saved.filter((s) => s.id !== id);
  storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, filtered);
  refreshWristbandSavedReferences();
  showToast(`"${target.title}" deleted`);

  if (scriptWristband && scriptWristband.id === id) {
    scriptWristband = null;
    const wbSelect = document.getElementById("scriptWristbandSelect");
    const wbInfo = document.getElementById("scriptWristbandInfo");
    if (wbSelect) wbSelect.value = "";
    if (wbInfo) wbInfo.textContent = "";
    renderScript();
  }
}

async function renameSavedWristband(id) {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved.find((s) => s.id === id);
  if (!wb) return;
  const newName = await showPrompt("Rename wristband:", wb.title, {
    title: "Rename",
    icon: "✏️",
  });
  if (newName && newName.trim()) {
    wb.title = newName.trim();
    storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
    refreshWristbandSavedReferences();
    showToast(`Renamed to "${wb.title}"`);
  }
}

async function overwriteSavedWristband(id) {
  const saved = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
  const wb = saved.find((s) => s.id === id);
  if (!wb) return;
  const ok = await showConfirm(
    `Overwrite "${wb.title}" with the current wristband?`,
    { title: "Overwrite", icon: "⚠️", confirmText: "Overwrite", danger: true },
  );
  if (!ok) return;

  Object.assign(wb, buildWristbandSaveRecord(wb.title, { id: wb.id }));
  storageManager.set(STORAGE_KEYS.SAVED_WRISTBANDS, saved);
  finalizeWristbandSave();
  showToast(`"${wb.title}" updated!`);
}
