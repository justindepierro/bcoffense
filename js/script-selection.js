let bulkSelectedIndices = [];
let scriptKeyboardShortcutsInitialized = false;

function toggleBulkSelect(index) {
  const selectedIndex = bulkSelectedIndices.indexOf(index);
  const play = script[index];
  const playLabel = getScriptPlaySummaryText(play);
  if (selectedIndex > -1) {
    bulkSelectedIndices.splice(selectedIndex, 1);
    announceScriptA11y(`${playLabel} deselected`);
  } else {
    bulkSelectedIndices.push(index);
    announceScriptA11y(`${playLabel} selected`);
  }
  updateBulkSelectUI();
}

function selectAllScriptItems() {
  const selectAll = document.getElementById("bulkSelectAll");
  if (selectAll && selectAll.checked) {
    bulkSelectedIndices = script
      .map((play, index) => (play.isSeparator ? -1 : index))
      .filter((index) => index >= 0);
    announceScriptA11y(`Selected all ${bulkSelectedIndices.length} plays`);
  } else {
    bulkSelectedIndices = [];
    announceScriptA11y("Cleared script selection");
  }
  updateBulkSelectUI();
}

function selectPeriodPlays(separatorIndex) {
  const periodPlayIndices = [];
  for (let index = separatorIndex + 1; index < script.length; index++) {
    if (script[index].isSeparator) break;
    periodPlayIndices.push(index);
  }
  if (periodPlayIndices.length === 0) return;

  const allSelected = periodPlayIndices.every((index) =>
    bulkSelectedIndices.includes(index),
  );

  if (allSelected) {
    bulkSelectedIndices = bulkSelectedIndices.filter(
      (index) => !periodPlayIndices.includes(index),
    );
    announceScriptA11y(`Cleared selection for ${script[separatorIndex].label || "period"}`);
  } else {
    periodPlayIndices.forEach((index) => {
      if (!bulkSelectedIndices.includes(index)) {
        bulkSelectedIndices.push(index);
      }
    });
    announceScriptA11y(
      `Selected ${periodPlayIndices.length} plays in ${script[separatorIndex].label || "period"}`,
    );
  }

  updateBulkSelectUI();
}

function updateBulkSelectUI() {
  document.querySelectorAll(".bulk-select-cb").forEach((checkbox) => {
    checkbox.checked = bulkSelectedIndices.includes(
      parseInt(checkbox.dataset.index, 10),
    );
  });

  const selectAll = document.getElementById("bulkSelectAll");
  const playCount = script.filter((play) => !play.isSeparator).length;
  if (selectAll) {
    selectAll.checked = bulkSelectedIndices.length === playCount && playCount > 0;
    selectAll.indeterminate =
      bulkSelectedIndices.length > 0 && bulkSelectedIndices.length < playCount;
  }

  const count = bulkSelectedIndices.length;
  const indicator = document.getElementById("bulkEditIndicator");
  if (indicator) {
    if (count > 0) {
      indicator.classList.add("active");
      indicator.textContent = `${count} selected`;
    } else {
      indicator.classList.remove("active");
      indicator.textContent = "";
    }
  }
}

function applyBulkEdit(field, value) {
  if (bulkSelectedIndices.length <= 1) return false;

  saveScriptState();
  bulkSelectedIndices.forEach((index) => {
    if (script[index] && !script[index].isSeparator) {
      script[index][field] = value;
    }
  });

  clearBulkSelection();
  return true;
}

function clearBulkSelection() {
  bulkSelectedIndices = [];
  const selectAll = document.getElementById("bulkSelectAll");
  if (selectAll) selectAll.checked = false;
  updateBulkSelectUI();
  requestRenderScript();
  announceScriptA11y("Selection cleared");
}

function getScriptReorderDisplayLabel(play, orderIndex) {
  const prefix = `${orderIndex + 1}.`;
  const summary = getScriptPlaySummaryText(play);
  const meta = [play.type, play.hash, play.tempo].filter(Boolean).join(" • ");
  return `${prefix} ${summary}${meta ? ` — ${meta}` : ""}`;
}

function openPlayReorderModal(startIndex, endIndex, title, successMessage) {
  const sliceStart = Math.max(0, startIndex);
  const sliceEnd = Math.min(script.length, endIndex);
  const playsToReorder = script
    .slice(sliceStart, sliceEnd)
    .filter((item) => item && !item.isSeparator);

  if (playsToReorder.length < 2) {
    setScriptToolbarStatus("Need at least 2 plays to reorder", "error");
    return;
  }

  const reorderEntries = playsToReorder.map((play, index) => ({
    label: getScriptReorderDisplayLabel(play, index),
    play,
  }));

  showReorderModal(reorderEntries.map((entry) => entry.label), {
    title,
    note: "Drag plays into the exact order you want, then apply the new sequence.",
    saveLabel: "✅ Apply Order",
    onSave(order) {
      saveScriptState();
      const reorderedPlays = order
        .map((label) => {
          const originalIndex = parseInt(label, 10) - 1;
          return reorderEntries[originalIndex]?.play;
        })
        .filter(Boolean);

      script.splice(sliceStart, playsToReorder.length, ...reorderedPlays);
      requestRenderScript();
      setScriptToolbarStatus(successMessage, "success", AUTOSAVE_DEBOUNCE_MS);
    },
  });
}

function openPeriodReorderModal(separatorIndex) {
  const sepIdx = parseInt(separatorIndex, 10);
  const separator = script[sepIdx];
  if (!separator || !separator.isSeparator) return;

  let endIndex = sepIdx + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) endIndex++;

  const periodLabel = separator.label || "Period";
  openPlayReorderModal(
    sepIdx + 1,
    endIndex,
    `Reorder ${periodLabel}`,
    `${periodLabel} reordered`,
  );
}

async function openScriptReorderModal() {
  const periodChoices = script
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item?.isSeparator)
    .map(({ item, index }) => {
      let playCount = 0;
      for (
        let cursor = index + 1;
        cursor < script.length && !script[cursor].isSeparator;
        cursor++
      ) {
        playCount++;
      }
      return {
        label: item.label || `Period ${index + 1}`,
        sublabel: `${playCount} plays`,
        value: index,
      };
    })
    .filter((choice) => !choice.sublabel.startsWith("0 plays"));

  if (!periodChoices.length) {
    openPlayReorderModal(0, script.length, "Reorder Script", "Script reordered");
    return;
  }

  if (periodChoices.length === 1) {
    openPeriodReorderModal(periodChoices[0].value);
    return;
  }

  const selectedPeriod = await showListPicker(
    "Choose the period you want to reorder.",
    periodChoices,
    { title: "🗂️ Reorder Plays", icon: "🗂️" },
  );

  if (selectedPeriod === null) return;
  openPeriodReorderModal(selectedPeriod);
}

function undoScript() {
  const previousState = historyManager.undo("script", script);
  if (!previousState) return;

  script = previousState;
  requestRenderScript();
}

function redoScript() {
  const futureState = historyManager.redo("script", script);
  if (!futureState) return;

  script = futureState;
  requestRenderScript();
}

function initScriptKeyboard() {
  const container = document.getElementById("scriptPlays");
  if (!container) return;

  container.setAttribute("tabindex", "0");

  function isTypingTarget(target) {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable
    );
  }

  function isScriptTabActive() {
    if (typeof currentActiveTab === "string") {
      return currentActiveTab === "script";
    }

    const tabPanel = document.getElementById("script");
    return !tabPanel?.classList.contains("hidden");
  }

  function getFocusedPeriodIndex(target) {
    if (!(target instanceof Element)) return null;
    const wrapper = target.closest(".period-header-wrapper");
    if (!wrapper) return null;
    const periodIndex = parseInt(wrapper.dataset.periodIndex || "", 10);
    return Number.isInteger(periodIndex) ? periodIndex : null;
  }

  function runPeriodKeyboardShortcut(periodIndex, key) {
    const separator = script[periodIndex];
    if (!separator || !separator.isSeparator) return false;

    const periodLabel = separator.label || "Period";
    switch (key) {
      case "s":
        selectPeriodPlays(periodIndex);
        setScriptToolbarStatus(`${periodLabel} selection updated`, "success");
        return true;
      case "m":
        openPeriodReorderModal(periodIndex);
        return true;
      case "o":
        sortPeriod(periodIndex);
        return true;
      case "r":
        reversePeriod(periodIndex);
        return true;
      case "p":
        applyPreferredForPeriod(periodIndex);
        return true;
      default:
        return false;
    }
  }

  container.addEventListener("keydown", (event) => {
    const target = event.target;
    const targetIsTyping = isTypingTarget(target);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      if (targetIsTyping) return;
      event.preventDefault();
      bulkSelectedIndices = script
        .map((play, index) => (play.isSeparator ? -1 : index))
        .filter((index) => index >= 0);
      updateBulkSelectUI();
      _scheduleRenderScript();
      showToast(`Selected ${bulkSelectedIndices.length} play${bulkSelectedIndices.length === 1 ? "" : "s"}`);
      announceScriptA11y(`Selected all ${bulkSelectedIndices.length} plays`);
      return;
    }

    if (event.key === "Escape" && bulkSelectedIndices.length > 0) {
      event.preventDefault();
      clearBulkSelection();
      showToast("Selection cleared");
      announceScriptA11y("Selection cleared");
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      if (bulkSelectedIndices.length > 0) {
        event.preventDefault();
        showConfirm(`Delete ${bulkSelectedIndices.length} selected plays?`, {
          title: "Delete Plays",
          icon: "🗑️",
          confirmText: "Delete",
          danger: true,
        }).then((ok) => {
          if (ok) {
            saveScriptState();
            bulkSelectedIndices
              .sort((a, b) => b - a)
              .forEach((index) => {
                script.splice(index, 1);
              });
            bulkSelectedIndices = [];
            requestRenderScript();
          }
        });
      }
    }
  });

  ["scriptSearchBox", "scriptSearchPlay"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value) {
        event.preventDefault();
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (id === "scriptSearchBox") filterScriptItems();
        else {
          filterScriptPlays();
          const clearBtn = document.getElementById("clearSearchPlay");
          if (clearBtn) clearBtn.style.display = "none";
        }
      }
    });
  });

  if (scriptKeyboardShortcutsInitialized) return;
  scriptKeyboardShortcutsInitialized = true;

  document.addEventListener("keydown", (event) => {
    if (!isScriptTabActive()) return;
    if (isTypingTarget(event.target)) return;

    const key = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "a") {
      event.preventDefault();
      bulkSelectedIndices = script
        .map((play, index) => (play.isSeparator ? -1 : index))
        .filter((index) => index >= 0);
      updateBulkSelectUI();
      _scheduleRenderScript();
      showToast(`Selected ${bulkSelectedIndices.length} play${bulkSelectedIndices.length === 1 ? "" : "s"}`);
      announceScriptA11y(`Selected all ${bulkSelectedIndices.length} plays`);
      return;
    }

    if (event.key === "Escape" && bulkSelectedIndices.length > 0) {
      event.preventDefault();
      clearBulkSelection();
      showToast("Selection cleared");
      announceScriptA11y("Selection cleared");
      return;
    }

    if (!(event.altKey && event.shiftKey)) return;

    if (key === "c") {
      event.preventDefault();
      collapseAllPeriods();
      setScriptToolbarStatus("All periods collapsed", "success");
      announceScriptA11y("All periods collapsed");
      return;
    }

    if (key === "e") {
      event.preventDefault();
      expandAllPeriods();
      setScriptToolbarStatus("All periods expanded", "success");
      announceScriptA11y("All periods expanded");
      return;
    }

    const periodIndex = getFocusedPeriodIndex(event.target);
    if (periodIndex === null) return;

    if (runPeriodKeyboardShortcut(periodIndex, key)) {
      event.preventDefault();
    }
  });
}
/**
 * Compute the indices to act on for a row's "↕ Move" menu.
 * If the row is part of a multi-select bulk selection, return all
 * non-separator selected indices; otherwise return just the row index.
 */
function getScriptMoveSelection(index) {
  if (
    bulkSelectedIndices.length > 1 &&
    bulkSelectedIndices.includes(index)
  ) {
    return [...new Set(bulkSelectedIndices)]
      .filter((idx) => script[idx] && !script[idx].isSeparator)
      .sort((a, b) => a - b);
  }
  return script[index] && !script[index].isSeparator ? [index] : [];
}

function getScriptMoveSelectionCountLabel(indices) {
  return `${indices.length} play${indices.length === 1 ? "" : "s"}`;
}

function getScriptMoveSelectionPeriodIndex(indices) {
  if (!indices.length) return -1;
  const firstPeriodIndex = findOwningPeriodIndex(indices[0]);
  return indices.every((idx) => findOwningPeriodIndex(idx) === firstPeriodIndex)
    ? firstPeriodIndex
    : -1;
}

function moveScriptSelectionWithinPeriod(indices, direction) {
  const sortedIndices = [...indices].sort((a, b) => a - b);
  if (!sortedIndices.length) return false;

  const periodIndex = getScriptMoveSelectionPeriodIndex(sortedIndices);
  if (periodIndex < 0) return false;

  const { lowerBound, upperBound } = getPlayMoveBounds(sortedIndices[0]);
  const selectedSet = new Set(sortedIndices);
  const periodIndices = [];
  const periodItems = [];

  for (let idx = lowerBound; idx <= upperBound; idx++) {
    periodIndices.push(idx);
    periodItems.push(script[idx]);
  }

  const selectedFlags = periodIndices.map((idx) => selectedSet.has(idx));
  const selectedItems = [];
  const unselectedItems = [];

  periodItems.forEach((item, itemIndex) => {
    if (selectedFlags[itemIndex]) selectedItems.push(item);
    else unselectedItems.push(item);
  });

  let nextPeriodItems = [...periodItems];
  if (direction === "top") {
    if (selectedFlags.every((isSelected, idx) => !isSelected || idx < selectedItems.length)) {
      return false;
    }
    nextPeriodItems = [...selectedItems, ...unselectedItems];
  } else if (direction === "bottom") {
    if (
      selectedFlags.every(
        (isSelected, idx) => !isSelected || idx >= periodItems.length - selectedItems.length,
      )
    ) {
      return false;
    }
    nextPeriodItems = [...unselectedItems, ...selectedItems];
  } else if (Number(direction) === -1) {
    if (selectedFlags[0]) return false;
    for (let idx = 1; idx < nextPeriodItems.length; idx++) {
      if (selectedFlags[idx] && !selectedFlags[idx - 1]) {
        [nextPeriodItems[idx - 1], nextPeriodItems[idx]] = [
          nextPeriodItems[idx],
          nextPeriodItems[idx - 1],
        ];
        [selectedFlags[idx - 1], selectedFlags[idx]] = [
          selectedFlags[idx],
          selectedFlags[idx - 1],
        ];
      }
    }
  } else if (Number(direction) === 1) {
    if (selectedFlags[selectedFlags.length - 1]) return false;
    for (let idx = nextPeriodItems.length - 2; idx >= 0; idx--) {
      if (selectedFlags[idx] && !selectedFlags[idx + 1]) {
        [nextPeriodItems[idx], nextPeriodItems[idx + 1]] = [
          nextPeriodItems[idx + 1],
          nextPeriodItems[idx],
        ];
        [selectedFlags[idx], selectedFlags[idx + 1]] = [
          selectedFlags[idx + 1],
          selectedFlags[idx],
        ];
      }
    }
  } else {
    return false;
  }

  if (nextPeriodItems.every((item, idx) => item === periodItems[idx])) return false;

  saveScriptState();
  nextPeriodItems.forEach((item, idx) => {
    script[periodIndices[idx]] = item;
  });
  requestRenderScript();
  return true;
}

function moveScriptSelectionToPeriodIndex(indices, targetSeparatorIndex) {
  const sortedIndices = [...indices].sort((a, b) => a - b);
  const selectedPlays = sortedIndices
    .map((idx) => script[idx])
    .filter((play) => play && !play.isSeparator);
  const targetSeparator = script[targetSeparatorIndex];
  if (!selectedPlays.length || !targetSeparator?.isSeparator) return false;

  const targetAlreadyOwnsAll = sortedIndices.every(
    (idx) => findOwningPeriodIndex(idx) === targetSeparatorIndex,
  );
  if (targetAlreadyOwnsAll) return false;

  saveScriptState();
  for (let idx = sortedIndices.length - 1; idx >= 0; idx--) {
    script.splice(sortedIndices[idx], 1);
  }

  const removedBeforeTarget = sortedIndices.filter((idx) => idx < targetSeparatorIndex).length;
  const adjustedTargetSeparatorIndex = targetSeparatorIndex - removedBeforeTarget;
  let insertAt = adjustedTargetSeparatorIndex + 1;
  while (insertAt < script.length && !script[insertAt].isSeparator) insertAt++;

  script.splice(insertAt, 0, ...selectedPlays);
  requestRenderScript();
  return true;
}

async function moveScriptSelectionToPeriod(index) {
  const indices = getScriptMoveSelection(index);
  if (!indices.length) return;

  const currentPeriodIndex = getScriptMoveSelectionPeriodIndex(indices);
  const periodChoices = getScriptPeriodChoices(currentPeriodIndex);
  if (!periodChoices.length) {
    setScriptToolbarStatus("Need another period before moving this selection", "error");
    return;
  }

  const selectionLabel = getScriptMoveSelectionCountLabel(indices);
  const selectedPeriod = await showListPicker(
    `Choose the period that should receive ${selectionLabel}.`,
    periodChoices,
    { title: "↔ Move Selection To Period", icon: "↔" },
  );

  if (selectedPeriod === null) return;
  if (!moveScriptSelectionToPeriodIndex(indices, selectedPeriod)) {
    setScriptToolbarStatus("Could not move that selection to the chosen period", "error");
    return;
  }

  const periodLabel = script[selectedPeriod]?.label || "selected period";
  setScriptToolbarStatus(
    `Moved ${selectionLabel} to ${periodLabel}`,
    "success",
    AUTOSAVE_DEBOUNCE_MS,
  );
}

function openScriptMoveMenu(event, index) {
  const play = script[index];
  if (!play || play.isSeparator) return;

  const indices = getScriptMoveSelection(index);
  if (!indices.length) return;

  const selectionLabel = getScriptMoveSelectionCountLabel(indices);
  const sharedPeriodIndex = getScriptMoveSelectionPeriodIndex(indices);
  const canReorderWithinPeriod = sharedPeriodIndex >= 0;
  const menuItems = [
    {
      label: `↔ Move ${selectionLabel} to another period`,
      action: () => moveScriptSelectionToPeriod(index),
    },
    { separator: true },
    {
      label: `⤒ Move ${selectionLabel} to top`,
      action: () => {
        if (!moveScriptSelectionWithinPeriod(indices, "top")) {
          setScriptToolbarStatus("Could not move that selection to the top", "error");
          return;
        }
        setScriptToolbarStatus(
          `Moved ${selectionLabel} to top`,
          "success",
          AUTOSAVE_DEBOUNCE_MS,
        );
      },
      disabled: !canReorderWithinPeriod,
    },
    {
      label: `▲ Move ${selectionLabel} up`,
      action: () => {
        if (!moveScriptSelectionWithinPeriod(indices, -1)) {
          setScriptToolbarStatus("Could not move that selection up", "error");
          return;
        }
        setScriptToolbarStatus(
          `Moved ${selectionLabel} up`,
          "success",
          AUTOSAVE_DEBOUNCE_MS,
        );
      },
      disabled: !canReorderWithinPeriod,
    },
    {
      label: `▼ Move ${selectionLabel} down`,
      action: () => {
        if (!moveScriptSelectionWithinPeriod(indices, 1)) {
          setScriptToolbarStatus("Could not move that selection down", "error");
          return;
        }
        setScriptToolbarStatus(
          `Moved ${selectionLabel} down`,
          "success",
          AUTOSAVE_DEBOUNCE_MS,
        );
      },
      disabled: !canReorderWithinPeriod,
    },
    {
      label: `⤓ Move ${selectionLabel} to bottom`,
      action: () => {
        if (!moveScriptSelectionWithinPeriod(indices, "bottom")) {
          setScriptToolbarStatus("Could not move that selection to the bottom", "error");
          return;
        }
        setScriptToolbarStatus(
          `Moved ${selectionLabel} to bottom`,
          "success",
          AUTOSAVE_DEBOUNCE_MS,
        );
      },
      disabled: !canReorderWithinPeriod,
    },
  ];

  const menu = document.createElement("div");
  menu.className = "cs-context-menu script-move-menu";
  menuItems.forEach((item) => {
    if (item.separator) {
      const divider = document.createElement("div");
      divider.className = "cs-ctx-divider";
      menu.appendChild(divider);
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = item.danger ? "cs-ctx-item cs-ctx-clear" : "cs-ctx-item";
    button.textContent = item.label;
    button.disabled = Boolean(item.disabled);
    button.addEventListener("click", async () => {
      menu.remove();
      await item.action();
    });
    menu.appendChild(button);
  });

  showContextMenu(event, menu);
}

/**
 * Toggle a single available-play row's bulk-select checkbox.
 * Wired through app-events.js change delegation on #availablePlays.
 */
function toggleAvailablePlaySelect(playIndex) {
  playIndex = parseInt(playIndex, 10);
  if (!Number.isInteger(playIndex)) return;
  const idx = selectedAvailablePlays.indexOf(playIndex);
  if (idx > -1) {
    selectedAvailablePlays.splice(idx, 1);
  } else {
    selectedAvailablePlays.push(playIndex);
  }
  normalizeSelectedAvailablePlays();
  renderAvailablePlays();
}
