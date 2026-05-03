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
  wristbandHeaderColor = source?.headerColor || "transparent";

  if (Array.isArray(source?.cards) && source.cards.length > 0) {
    wristbandCards = safeDeepClone(source.cards);
  } else if (Array.isArray(source?.data)) {
    wristbandCards = [{ name: "Card 1", data: safeDeepClone(source.data) }];
  } else {
    wristbandCards = [{ name: "Card 1", data: Array(40).fill(null) }];
  }

  cellCustomizations = source?.cellStyles ? safeDeepClone(source.cellStyles) : {};
  wbFavorites = normalizeWbFavorites(
    source?.favorites || storageManager.get(STORAGE_KEYS.WRISTBAND_FAVORITES, []),
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
    const totalPlays = wristbandCards.reduce(
      (sum, c) => sum + c.data.filter((p) => p !== null).length,
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
  const totalPlays = (wb) => {
    if (wb.cards) {
      return wb.cards.reduce(
        (sum, c) => sum + (Array.isArray(c.data) ? c.data.filter((p) => p !== null).length : 0),
        0,
      );
    }
    if (wb.data) return wb.data.filter((p) => p !== null).length;
    return 0;
  };
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
