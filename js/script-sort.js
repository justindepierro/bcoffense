let scriptCustomSortOrders = {};
scriptCustomSortOrders = storageManager.get(
  STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
  {},
);

const SCRIPT_SORT_FIELDS = [
  { value: "personnel", label: "Personnel" },
  { value: "preferredSituation", label: "Situation" },
  { value: "type", label: "Play Type" },
  { value: "formation", label: "Formation" },
  { value: "preferredDown", label: "Down" },
  { value: "preferredDistance", label: "Distance" },
  { value: "preferredHash", label: "Hash" },
  { value: "preferredFieldPosition", label: "Field Position" },
];

function sortScript() {
  const fieldSelect = document.getElementById("scriptSortField");
  const field = fieldSelect.value;

  if (!field) {
    setScriptToolbarStatus("Select a sort field first", "error");
    return;
  }

  const playsToSort = script.filter((item) => !item.isSeparator);
  if (playsToSort.length === 0) {
    setScriptToolbarStatus("No plays to sort", "error");
    return;
  }

  saveScriptState();

  const customOrder = scriptCustomSortOrders[field] || [];
  const hasCustomOrder = customOrder.length > 0;
  const fieldLabel =
    SCRIPT_SORT_FIELDS.find((sortField) => sortField.value === field)?.label ||
    field;

  const compareWithCustomOrder = (a, b) => {
    const aVal = (a[field] || "").toString().trim();
    const bVal = (b[field] || "").toString().trim();

    if (hasCustomOrder) {
      const aIdx = customOrder.indexOf(aVal);
      const bIdx = customOrder.indexOf(bVal);

      if (aIdx !== -1 && bIdx !== -1) {
        return aIdx - bIdx;
      }
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
    }

    return aVal.toLowerCase().localeCompare(bVal.toLowerCase());
  };

  const result = [];
  let currentPeriodPlays = [];

  script.forEach((item) => {
    if (item.isSeparator) {
      if (currentPeriodPlays.length > 0) {
        currentPeriodPlays.sort(compareWithCustomOrder);
        result.push(...currentPeriodPlays);
        currentPeriodPlays = [];
      }
      result.push(item);
    } else {
      currentPeriodPlays.push(item);
    }
  });

  if (currentPeriodPlays.length > 0) {
    currentPeriodPlays.sort(compareWithCustomOrder);
    result.push(...currentPeriodPlays);
  }

  script = result;
  renderScript();

  const orderType = hasCustomOrder ? "custom order" : "A-Z";
  setScriptToolbarStatus(
    `Sorted by ${fieldLabel} • ${orderType}`,
    "success",
    AUTOSAVE_DEBOUNCE_MS,
  );
}

function sortPeriod(separatorIndex) {
  const fieldSelect = document.getElementById("scriptSortField");
  const field = fieldSelect ? fieldSelect.value : "";

  if (!field) {
    setScriptToolbarStatus("Select a sort field first", "error");
    return;
  }

  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) {
    endIndex++;
  }
  const periodPlays = script.slice(separatorIndex + 1, endIndex);
  if (periodPlays.length < 2) return;

  saveScriptState();

  const customOrder = scriptCustomSortOrders[field] || [];
  const hasCustomOrder = customOrder.length > 0;

  periodPlays.sort((a, b) => {
    const aVal = (a[field] || "").toString().trim();
    const bVal = (b[field] || "").toString().trim();
    if (hasCustomOrder) {
      const aIdx = customOrder.indexOf(aVal);
      const bIdx = customOrder.indexOf(bVal);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
    }
    return aVal.toLowerCase().localeCompare(bVal.toLowerCase());
  });

  script.splice(
    separatorIndex + 1,
    endIndex - separatorIndex - 1,
    ...periodPlays,
  );
  renderScript();

  const fieldLabel =
    SCRIPT_SORT_FIELDS.find((sortField) => sortField.value === field)?.label ||
    field;
  const periodLabel = script[separatorIndex].label || "Period";
  setScriptToolbarStatus(
    `${periodLabel} sorted by ${fieldLabel}`,
    "success",
    AUTOSAVE_DEBOUNCE_MS,
  );
}

function reversePeriod(separatorIndex) {
  let endIndex = separatorIndex + 1;
  while (endIndex < script.length && !script[endIndex].isSeparator) {
    endIndex++;
  }

  const periodPlays = script.slice(separatorIndex + 1, endIndex);
  if (periodPlays.length < 2) return;

  saveScriptState();
  periodPlays.reverse();
  script.splice(
    separatorIndex + 1,
    endIndex - separatorIndex - 1,
    ...periodPlays,
  );
  renderScript();

  const periodLabel = script[separatorIndex].label || "Period";
  setScriptToolbarStatus(`${periodLabel} reversed`, "success");
}

function reverseScriptSort() {
  const playsToSort = script.filter((item) => !item.isSeparator);

  if (playsToSort.length === 0) {
    setScriptToolbarStatus("No plays to reverse", "error");
    return;
  }

  saveScriptState();

  const result = [];
  let currentPeriodPlays = [];

  script.forEach((item) => {
    if (item.isSeparator) {
      if (currentPeriodPlays.length > 0) {
        currentPeriodPlays.reverse();
        result.push(...currentPeriodPlays);
        currentPeriodPlays = [];
      }
      result.push(item);
    } else {
      currentPeriodPlays.push(item);
    }
  });

  if (currentPeriodPlays.length > 0) {
    currentPeriodPlays.reverse();
    result.push(...currentPeriodPlays);
  }

  script = result;
  renderScript();
  setScriptToolbarStatus("Play order reversed", "success");
}

function shuffleScript() {
  const playsToShuffle = script.filter((item) => !item.isSeparator);
  if (playsToShuffle.length === 0) {
    setScriptToolbarStatus("No plays to shuffle", "error");
    return;
  }

  saveScriptState();

  const result = [];
  let currentPeriodPlays = [];

  script.forEach((item) => {
    if (item.isSeparator) {
      if (currentPeriodPlays.length > 0) {
        for (let index = currentPeriodPlays.length - 1; index > 0; index--) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [currentPeriodPlays[index], currentPeriodPlays[swapIndex]] = [
            currentPeriodPlays[swapIndex],
            currentPeriodPlays[index],
          ];
        }
        result.push(...currentPeriodPlays);
        currentPeriodPlays = [];
      }
      result.push(item);
    } else {
      currentPeriodPlays.push(item);
    }
  });

  if (currentPeriodPlays.length > 0) {
    for (let index = currentPeriodPlays.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [currentPeriodPlays[index], currentPeriodPlays[swapIndex]] = [
        currentPeriodPlays[swapIndex],
        currentPeriodPlays[index],
      ];
    }
    result.push(...currentPeriodPlays);
  }

  script = result;
  renderScript();
  setScriptToolbarStatus("Shuffled within periods", "success", AUTOSAVE_DEBOUNCE_MS);
}

function getScriptUniqueValuesForField(field) {
  const values = new Set();
  script.forEach((item) => {
    if (!item.isSeparator && item[field]) {
      values.add(String(item[field]).trim());
    }
  });
  return Array.from(values).sort();
}

async function openScriptCustomOrderModal() {
  const field = document.getElementById("scriptSortField").value;

  if (!field) {
    await showModal(
      "Please select a field to sort by first, then click the gear to customize its order.",
      { title: "No Field Selected", icon: "⚙️" },
    );
    return;
  }

  const fieldLabel =
    SCRIPT_SORT_FIELDS.find((sortField) => sortField.value === field)?.label ||
    field;
  const uniqueValues = getScriptUniqueValuesForField(field);

  if (uniqueValues.length === 0) {
    await showModal(
      `No values found for "${fieldLabel}" in your script. Add some plays first.`,
      { title: "No Values", icon: "⚠️" },
    );
    return;
  }

  let orderedValues = scriptCustomSortOrders[field] || [];
  uniqueValues.forEach((value) => {
    if (!orderedValues.includes(value)) orderedValues.push(value);
  });
  orderedValues = orderedValues.filter((value) => uniqueValues.includes(value));

  showReorderModal(orderedValues, {
    title: `Custom Sort Order: ${fieldLabel}`,
    onSave(order) {
      scriptCustomSortOrders[field] = order;
      storageManager.set(
        STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
        scriptCustomSortOrders,
      );
      setScriptToolbarStatus(
        `Custom order saved for ${fieldLabel}`,
        "success",
        AUTOSAVE_DEBOUNCE_MS,
      );
    },
    onClear() {
      delete scriptCustomSortOrders[field];
      storageManager.set(
        STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
        scriptCustomSortOrders,
      );
      setScriptToolbarStatus(
        `Custom order cleared for ${fieldLabel}`,
        "success",
        AUTOSAVE_DEBOUNCE_MS,
      );
    },
  });
}