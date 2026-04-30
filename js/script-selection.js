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
  renderScript();
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
      renderScript();
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
            renderScript();
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