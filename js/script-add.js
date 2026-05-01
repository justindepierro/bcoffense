function createScriptPlayFromPlaybook(play) {
  return {
    ...play,
    reps: 1,
    notes: "",
    hash: "",
    defFront: "",
    defCoverage: "",
    defStunt: "",
    defBlitz: "",
    playerAssignments: createScriptPlayerAssignments(play),
    id: Date.now() + Math.random(),
  };
}

function getScriptPeriodChoices(excludeSeparatorIndex = null) {
  return script
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item, index }) => item?.isSeparator && index !== excludeSeparatorIndex,
    )
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
    });
}

function getPreferredTargetPeriodIndex() {
  const periodChoices = getScriptPeriodChoices();
  if (!periodChoices.length) return null;

  const lastUsedChoice = periodChoices.find(
    (choice) => script[choice.value]?.id === lastScriptTargetPeriodId,
  );
  return lastUsedChoice ? lastUsedChoice.value : periodChoices[0].value;
}

function buildAvailableTargetPeriodSelectMarkup(playIndex) {
  const periodChoices = getScriptPeriodChoices();
  if (!periodChoices.length) return "";

  const preferredTarget = getPreferredTargetPeriodIndex();
  const optionsHtml = periodChoices
    .map((choice) => {
      const optionLabel = `${choice.label} (${choice.sublabel})`;
      const selected = choice.value === preferredTarget ? " selected" : "";
      return `<option value="${escapeAttr(choice.value)}"${selected}>${escapeHtml(optionLabel)}</option>`;
    })
    .join("");

  return `
    <label class="available-target-picker" aria-label="Target period for this play">
      <span class="available-target-picker-label">To</span>
      <select class="available-target-select" data-field="availableTargetPeriod" data-idx="${playIndex}" aria-label="Target period for play ${playIndex + 1}">
        ${optionsHtml}
      </select>
    </label>
  `;
}

function getAvailableAddSelection(playIndex) {
  normalizeSelectedAvailablePlays();
  if (
    selectedAvailablePlays.length > 1 &&
    selectedAvailablePlays.includes(playIndex)
  ) {
    return [...selectedAvailablePlays].sort((a, b) => a - b);
  }
  return Number.isInteger(playIndex) ? [playIndex] : [];
}

function insertPlaysIntoPeriod(targetSeparatorIndex, playsToInsert) {
  if (!Array.isArray(playsToInsert) || playsToInsert.length === 0) return [];
  const separator = script[targetSeparatorIndex];
  if (!separator || !separator.isSeparator) return [];

  let insertAt = targetSeparatorIndex + 1;
  while (insertAt < script.length && !script[insertAt].isSeparator) insertAt++;

  script.splice(insertAt, 0, ...playsToInsert);
  return playsToInsert.map((_, offset) => insertAt + offset);
}

function addAvailableSelectionToScript(playIndices, targetSeparatorIndex) {
  const validIndices = playIndices
    .filter((idx) => Number.isInteger(idx) && plays[idx])
    .sort((a, b) => a - b);
  if (!validIndices.length || !script[targetSeparatorIndex]?.isSeparator) return [];

  lastScriptTargetPeriodId =
    script[targetSeparatorIndex]?.id || lastScriptTargetPeriodId;
  saveScriptState();
  const insertedIndices = insertPlaysIntoPeriod(
    targetSeparatorIndex,
    validIndices
      .map((playIndex) => plays[playIndex])
      .filter(Boolean)
      .map((play) => createScriptPlayFromPlaybook(play)),
  );

  if (selectedAvailablePlays.length) {
    selectedAvailablePlays = selectedAvailablePlays.filter(
      (idx) => !validIndices.includes(idx),
    );
  }

  renderScript();
  renderAvailablePlays();
  if (insertedIndices.length) flashScriptPlayAtIndex(insertedIndices[0]);
  return insertedIndices;
}

function handleDragStart(event, playIndex) {
  event.dataTransfer.setData("playIndex", playIndex);
  event.dataTransfer.setData("source", "available");
}

function handleScriptDragStart(event, scriptIndex) {
  event.target.classList.add("dragging");
  event.dataTransfer.setData("scriptIndex", scriptIndex);
  event.dataTransfer.setData("source", "script");
  announceScriptA11y(`Dragging ${getScriptPlaySummaryText(script[scriptIndex])}`);
}

function handleDragEnd(event) {
  event.target.classList.remove("dragging");
}

function handleDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");

  const source = event.dataTransfer.getData("source");

  if (source === "available") {
    const playIndex = parseInt(event.dataTransfer.getData("playIndex"), 10);
    if (isNaN(playIndex)) return;
    addToScript(playIndex);
    return;
  }

  if (source !== "script") return;

  const fromIndex = parseInt(event.dataTransfer.getData("scriptIndex"), 10);
  if (isNaN(fromIndex)) return;

  const items = document.querySelectorAll(".script-item");
  let toIndex = script.length;

  items.forEach((item, index) => {
    const rect = item.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2 && toIndex === script.length) {
      toIndex = index;
    }
  });

  if (fromIndex === toIndex || fromIndex === toIndex - 1) return;

  saveScriptState();
  const moved = script.splice(fromIndex, 1)[0];
  if (toIndex > fromIndex) toIndex--;
  script.splice(toIndex, 0, moved);
  renderScript();
  const movedTo = script.indexOf(moved) + 1;
  announceScriptA11y(`Moved ${getScriptPlaySummaryText(moved)} to position ${movedTo}`);
}

function openAvailableAddMenu(event, playIndex) {
  const indices = getAvailableAddSelection(playIndex);
  if (!indices.length) return;

  const hadPeriod = script.some((item) => item?.isSeparator);
  ensureFirstPeriod();
  if (!hadPeriod) renderScript();

  const periodChoices = getScriptPeriodChoices();
  if (!periodChoices.length) return;

  const selectionLabel = `${indices.length} play${indices.length === 1 ? "" : "s"}`;
  const preferredTarget = getPreferredTargetPeriodIndex();
  const menu = document.createElement("div");
  menu.className = "cs-context-menu available-add-menu";

  periodChoices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cs-ctx-item";
    button.textContent = `${choice.value === preferredTarget ? "⭐ " : ""}Add ${selectionLabel} to ${choice.label} (${choice.sublabel})`;
    button.addEventListener("click", () => {
      menu.remove();
      const insertedIndices = addAvailableSelectionToScript(indices, choice.value);
      if (!insertedIndices.length) {
        setScriptToolbarStatus("Could not add plays to that period", "error");
        return;
      }
      setScriptToolbarStatus(
        `Added ${selectionLabel} to ${script[choice.value]?.label || "selected period"}`,
        "success",
        AUTOSAVE_DEBOUNCE_MS,
      );
    });
    menu.appendChild(button);
  });

  showContextMenu(event, menu);
}

async function pickTargetPeriodForAdd(playCount) {
  ensureFirstPeriod();
  const periodChoices = getScriptPeriodChoices().map((choice) => {
    const separator = script[choice.value];
    const isLastUsed = separator?.id && separator.id === lastScriptTargetPeriodId;
    const minutes = separator?.minutes
      ? `${separator.minutes} min block`
      : "No time set";
    return {
      ...choice,
      eyebrow: isLastUsed ? "Last used" : "Period destination",
      meta: minutes,
      badge: choice.sublabel,
      ctaLabel: isLastUsed ? "Add again" : "Add here",
      recommended: isLastUsed,
      ariaLabel: `${choice.label}, ${choice.sublabel}, ${minutes}`,
    };
  });
  if (!periodChoices.length) return null;
  if (periodChoices.length === 1) {
    lastScriptTargetPeriodId = script[periodChoices[0].value]?.id || null;
    return periodChoices[0].value;
  }

  const selectedPeriod = await showListPicker(
    `Choose where ${playCount === 1 ? "this play" : `these ${playCount} plays`} should go. New plays land at the end of the period you pick.`,
    periodChoices,
    {
      title: "➕ Add To Period",
      icon: "➕",
      modalClass: "custom-modal-add-period",
    },
  );

  if (selectedPeriod !== null) {
    lastScriptTargetPeriodId = script[selectedPeriod]?.id || null;
  }

  return selectedPeriod;
}

function flashScriptPlayAtIndex(scriptIndex) {
  if (!Number.isInteger(scriptIndex) || scriptIndex < 0) return;

  const items = document.querySelectorAll(
    "#scriptPlays .script-item:not(.period-header)",
  );
  const rowIndex =
    script
      .slice(0, scriptIndex + 1)
      .filter((item) => item && !item.isSeparator).length - 1;
  const targetItem = items[rowIndex];

  if (!targetItem) return;

  targetItem.classList.add("just-added");
  targetItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
  setTimeout(() => targetItem.classList.remove("just-added"), 950);
}

async function addToScript(playIndex, targetSeparatorIndex = null) {
  const play = plays[playIndex];
  if (!play) return;

  let resolvedTargetIndex = Number.isInteger(targetSeparatorIndex)
    ? targetSeparatorIndex
    : parseInt(targetSeparatorIndex, 10);

  if (
    !Number.isInteger(resolvedTargetIndex) ||
    !script[resolvedTargetIndex]?.isSeparator
  ) {
    resolvedTargetIndex = await pickTargetPeriodForAdd(1);
  }
  if (resolvedTargetIndex === null) return;

  lastScriptTargetPeriodId =
    script[resolvedTargetIndex]?.id || lastScriptTargetPeriodId;

  saveScriptState();
  const insertedIndices = insertPlaysIntoPeriod(resolvedTargetIndex, [
    createScriptPlayFromPlaybook(play),
  ]);
  renderScript();
  flashScriptPlayAtIndex(insertedIndices[0]);
  setScriptToolbarStatus(
    `Added play to ${script[resolvedTargetIndex]?.label || "selected period"}`,
    "success",
    AUTOSAVE_DEBOUNCE_MS,
  );
}

async function addAllFilteredToScript() {
  const filteredIndices = currentFilteredPlayIndices || [];
  if (filteredIndices.length === 0) {
    showToast("No plays to add — adjust your filters");
    return;
  }

  const ok = await showConfirm(
    `Add all ${filteredIndices.length} filtered plays to the script?`,
    { title: "Add All Plays", icon: "➕", confirmText: "Add All" },
  );
  if (!ok) {
    return;
  }

  const targetSeparatorIndex = await pickTargetPeriodForAdd(
    filteredIndices.length,
  );
  if (targetSeparatorIndex === null) return;

  saveScriptState();
  insertPlaysIntoPeriod(
    targetSeparatorIndex,
    filteredIndices
      .map((playIndex) => plays[playIndex])
      .filter(Boolean)
      .map((play) => createScriptPlayFromPlaybook(play)),
  );
  renderScript();
  setScriptToolbarStatus(
    `Added ${filteredIndices.length} play${filteredIndices.length === 1 ? "" : "s"} to ${script[targetSeparatorIndex]?.label || "selected period"}`,
    "success",
    AUTOSAVE_DEBOUNCE_MS,
  );
}

async function addSelectedToScript() {
  normalizeSelectedAvailablePlays();
  if (selectedAvailablePlays.length === 0) {
    showToast("No plays selected — check the boxes first");
    return;
  }

  const targetSeparatorIndex = await pickTargetPeriodForAdd(
    selectedAvailablePlays.length,
  );
  if (targetSeparatorIndex === null) return;

  saveScriptState();
  insertPlaysIntoPeriod(
    targetSeparatorIndex,
    selectedAvailablePlays
      .map((playIndex) => plays[playIndex])
      .filter(Boolean)
      .map((play) => createScriptPlayFromPlaybook(play)),
  );

  const addedCount = selectedAvailablePlays.length;
  selectedAvailablePlays = [];
  renderAvailablePlays();
  renderScript();
  setScriptToolbarStatus(
    `Added ${addedCount} play${addedCount === 1 ? "" : "s"} to ${script[targetSeparatorIndex]?.label || "selected period"}`,
    "success",
    AUTOSAVE_DEBOUNCE_MS,
  );
}

async function compareScripts() {
  const savedScripts = getSavedScripts();

  if (savedScripts.length < 2) {
    await showModal("Need at least 2 saved scripts to compare.", {
      title: "Compare Scripts",
      icon: "📊",
    });
    return;
  }

  const items = savedScripts.map((scriptItem, index) => ({
    label: scriptItem.name,
    sublabel: `${scriptItem.plays.filter((play) => !play.isSeparator).length} plays`,
    value: index,
  }));

  const idx1 = await showListPicker("Select first script:", items, {
    title: "Compare Scripts",
    icon: "📊",
  });
  if (idx1 === null) return;

  const idx2 = await showListPicker(
    "Select second script:",
    items.filter((item) => item.value !== idx1),
    { title: "Compare Scripts", icon: "📊" },
  );
  if (idx2 === null) return;

  const s1 = savedScripts[idx1];
  const s2 = savedScripts[idx2];
  const plays1 = s1.plays.filter((play) => !play.isSeparator);
  const plays2 = s2.plays.filter((play) => !play.isSeparator);

  const set1 = new Set(plays1.map((play) => `${play.formation}|${play.play}`));
  const set2 = new Set(plays2.map((play) => `${play.formation}|${play.play}`));

  const onlyIn1 = plays1.filter(
    (play) => !set2.has(`${play.formation}|${play.play}`),
  );
  const onlyIn2 = plays2.filter(
    (play) => !set1.has(`${play.formation}|${play.play}`),
  );
  const common = plays1.filter((play) =>
    set2.has(`${play.formation}|${play.play}`),
  );

  let report = `📊 SCRIPT COMPARISON\n\n`;
  report += `"${s1.name}" vs "${s2.name}"\n`;
  report += `${"=".repeat(40)}\n\n`;
  report += `Total Plays: ${plays1.length} vs ${plays2.length}\n`;
  report += `Common: ${common.length}\n`;
  report += `Only in "${s1.name}": ${onlyIn1.length}\n`;
  report += `Only in "${s2.name}": ${onlyIn2.length}\n\n`;

  if (onlyIn1.length > 0) {
    report += `\n--- Only in "${s1.name}" ---\n`;
    onlyIn1
      .slice(0, 10)
      .forEach((play) => (report += `• ${play.formation} ${play.play}\n`));
    if (onlyIn1.length > 10) {
      report += `... and ${onlyIn1.length - 10} more\n`;
    }
  }

  if (onlyIn2.length > 0) {
    report += `\n--- Only in "${s2.name}" ---\n`;
    onlyIn2
      .slice(0, 10)
      .forEach((play) => (report += `• ${play.formation} ${play.play}\n`));
    if (onlyIn2.length > 10) {
      report += `... and ${onlyIn2.length - 10} more\n`;
    }
  }

  await showModal(report, { title: "📊 Script Comparison", icon: "📊" });
}

async function mergeFromScript() {
  const savedScripts = getSavedScripts();

  if (savedScripts.length === 0) {
    await showModal("No saved scripts to merge from.", {
      title: "Merge",
      icon: "🔀",
    });
    return;
  }

  const items = savedScripts.map((scriptItem, index) => ({
    label: scriptItem.name,
    sublabel: `${scriptItem.plays.filter((play) => !play.isSeparator).length} plays`,
    value: index,
  }));
  const idx = await showListPicker("Select script to merge plays FROM:", items, {
    title: "Merge From Script",
    icon: "🔀",
  });
  if (idx === null) return;

  if (idx < 0 || idx >= savedScripts.length) {
    await showModal("Invalid selection.", { title: "Error", icon: "⚠️" });
    return;
  }

  const sourceScript = savedScripts[idx];
  const sourcePlays = sourceScript.plays.filter((play) => !play.isSeparator);

  const mergeChoice = await showChoice(
    `Merge options for "${sourceScript.name}" (${sourcePlays.length} plays):`,
    {
      title: "Merge Options",
      icon: "🔀",
      option1: `Merge ALL (${sourcePlays.length})`,
      option2: "Only unique plays",
    },
  );
  if (!mergeChoice) return;

  saveScriptState();

  let playsToAdd = [];
  if (mergeChoice === "option1") {
    playsToAdd = sourcePlays;
  } else if (mergeChoice === "option2") {
    const currentSet = new Set(
      script
        .filter((play) => !play.isSeparator)
        .map((play) => `${play.formation}|${play.play}`),
    );
    playsToAdd = sourcePlays.filter(
      (play) => !currentSet.has(`${play.formation}|${play.play}`),
    );
  } else {
    return;
  }

  playsToAdd.forEach((play) => {
    script.push({
      ...play,
      id: Date.now() + Math.random(),
    });
  });

  renderScript();
  showToast(`Merged ${playsToAdd.length} plays from "${sourceScript.name}"`);
}

function findOwningPeriodIndex(scriptIndex) {
  for (let index = scriptIndex - 1; index >= 0; index--) {
    if (script[index]?.isSeparator) return index;
  }
  return -1;
}

function movePlayToPeriodIndex(index, targetSeparatorIndex) {
  const play = script[index];
  if (!play || play.isSeparator) return false;

  const currentSeparatorIndex = findOwningPeriodIndex(index);
  const targetSeparator = script[targetSeparatorIndex];
  if (!targetSeparator || !targetSeparator.isSeparator) return false;
  if (currentSeparatorIndex === targetSeparatorIndex) return false;

  saveScriptState();
  const [movedPlay] = script.splice(index, 1);
  const adjustedTargetSeparatorIndex =
    index < targetSeparatorIndex ? targetSeparatorIndex - 1 : targetSeparatorIndex;

  let insertAt = adjustedTargetSeparatorIndex + 1;
  while (insertAt < script.length && !script[insertAt].isSeparator) insertAt++;

  script.splice(insertAt, 0, movedPlay);
  renderScript();
  return true;
}

async function movePlayToPeriod(index) {
  const play = script[index];
  if (!play || play.isSeparator) return;

  const currentSeparatorIndex = findOwningPeriodIndex(index);
  const periodChoices = getScriptPeriodChoices(currentSeparatorIndex);
  if (!periodChoices.length) {
    setScriptToolbarStatus("Need another period before moving this play", "error");
    return;
  }

  const selectedPeriod = await showListPicker(
    "Choose the period that should receive this play.",
    periodChoices,
    { title: "↔ Move Play To Period", icon: "↔" },
  );

  if (selectedPeriod === null) return;
  if (!movePlayToPeriodIndex(index, selectedPeriod)) {
    setScriptToolbarStatus("Could not move play to that period", "error");
    return;
  }

  const periodLabel = script[selectedPeriod]?.label || "selected period";
  setScriptToolbarStatus(
    `Moved play to ${periodLabel}`,
    "success",
    AUTOSAVE_DEBOUNCE_MS,
  );
}