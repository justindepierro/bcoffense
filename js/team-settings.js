let teamSettingsAutosaveTimer = null;
let teamDepthDragState = null;
let teamSettingsViewState = null;

function normalizeTeamSettingsCollapsedState(state = {}) {
  return {
    roster: Boolean(state?.roster),
    packages: Boolean(state?.packages),
    swaps: Boolean(state?.swaps),
  };
}

function getTeamSettingsCollapsedState() {
  return normalizeTeamSettingsCollapsedState(
    storageManager.get(STORAGE_KEYS.TEAM_SETTINGS_COLLAPSED, {}),
  );
}

function saveTeamSettingsCollapsedState(state) {
  const normalized = normalizeTeamSettingsCollapsedState(state);
  storageManager.set(STORAGE_KEYS.TEAM_SETTINGS_COLLAPSED, normalized);
  return normalized;
}

function setTeamSettingsPanelCollapsed(panelKey, isCollapsed) {
  const state = getTeamSettingsCollapsedState();
  state[panelKey] = Boolean(isCollapsed);
  saveTeamSettingsCollapsedState(state);
}

function formatTeamCountLabel(count, singular, plural = null) {
  return `${count} ${count === 1 ? singular : (plural || `${singular}s`)}`;
}

function captureTeamSettingsViewState() {
  const section = document.querySelector(".team-settings-section");
  if (!section) return null;

  const activeEl = document.activeElement;
  const hasTeamFocus = Boolean(activeEl && section.contains(activeEl));
  const focus = hasTeamFocus
    ? {
      id: activeEl.id || "",
      field: activeEl.dataset.field || "",
      playerId: activeEl.dataset.playerId || "",
      packageIndex: activeEl.dataset.packageIndex || "",
      groupIndex: activeEl.dataset.groupIndex || "",
      itemIndex: activeEl.dataset.itemIndex || "",
      slot: activeEl.dataset.slot || "",
      depthIndex: activeEl.dataset.depthIndex || "",
      selectionStart:
        typeof activeEl.selectionStart === "number" ? activeEl.selectionStart : null,
      selectionEnd:
        typeof activeEl.selectionEnd === "number" ? activeEl.selectionEnd : null,
    }
    : null;

  return {
    scrollY: window.scrollY,
    focus,
  };
}

function findTeamSettingsFocusTarget(focus) {
  if (!focus) return null;
  if (focus.id) {
    const byId = document.getElementById(focus.id);
    if (byId) return byId;
  }

  const selectors = [];
  if (focus.field) selectors.push(`[data-field="${escapeAttr(focus.field)}"]`);
  if (focus.playerId) selectors.push(`[data-player-id="${escapeAttr(focus.playerId)}"]`);
  if (focus.packageIndex) selectors.push(`[data-package-index="${escapeAttr(focus.packageIndex)}"]`);
  if (focus.groupIndex) selectors.push(`[data-group-index="${escapeAttr(focus.groupIndex)}"]`);
  if (focus.itemIndex) selectors.push(`[data-item-index="${escapeAttr(focus.itemIndex)}"]`);
  if (focus.slot) selectors.push(`[data-slot="${escapeAttr(focus.slot)}"]`);
  if (focus.depthIndex) selectors.push(`[data-depth-index="${escapeAttr(focus.depthIndex)}"]`);
  if (!selectors.length) return null;
  return document.querySelector(selectors.join(""));
}

function restoreTeamSettingsViewState(state) {
  if (!state) return;
  requestAnimationFrame(() => {
    if (typeof state.scrollY === "number") window.scrollTo(0, state.scrollY);
    const target = findTeamSettingsFocusTarget(state.focus);
    if (!target) return;
    target.focus({ preventScroll: true });
    if (
      typeof state.focus?.selectionStart === "number" &&
      typeof state.focus?.selectionEnd === "number" &&
      typeof target.setSelectionRange === "function"
    ) {
      target.setSelectionRange(state.focus.selectionStart, state.focus.selectionEnd);
    }
  });
}

function buildTeamSettingsRosterSummary(roster) {
  if (!roster.length) return "No roster loaded yet.";
  const positionCounts = new Map();
  roster.forEach((player) => {
    const key = String(player.position || "UNASSIGNED").trim() || "UNASSIGNED";
    positionCounts.set(key, (positionCounts.get(key) || 0) + 1);
  });
  const topPositions = [...positionCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([position, count]) => `${position} ${count}`)
    .join(" | ");
  return `${formatTeamCountLabel(roster.length, "player")} | ${topPositions}`;
}

function buildTeamSettingsPackagesSummary(packages) {
  if (!packages.length) return "No personnel packages configured yet.";
  const autoPrepared = packages.filter((pkg) => pkg.isAutoPrepared).length;
  const subCount = packages.reduce(
    (sum, pkg) => sum + Object.values(normalizeTeamDepthChart(pkg.depthChart, pkg.assignments))
      .reduce((slotSum, playerIds) => slotSum + Math.max(playerIds.length - 1, 0), 0),
    0,
  );
  const labels = packages.slice(0, 4).map((pkg) => pkg.personnel).filter(Boolean).join(", ");
  return `${formatTeamCountLabel(packages.length, "package")} | ${formatTeamCountLabel(autoPrepared, "auto-prepped", "auto-prepped")} | ${formatTeamCountLabel(subCount, "sub")} | ${labels}`;
}

function buildTeamSettingsSwapSummary(groups) {
  if (!groups.length) return "No sub packages configured yet.";
  const assignedCount = groups.reduce(
    (sum, group) => sum + Object.values(normalizeTeamDepthChart(group.depthChart, group.assignments))
      .filter((playerIds) => playerIds.length > 0).length,
    0,
  );
  const backupCount = groups.reduce(
    (sum, group) => sum + Object.values(normalizeTeamDepthChart(group.depthChart, group.assignments))
      .reduce((slotSum, playerIds) => slotSum + Math.max(playerIds.length - 1, 0), 0),
    0,
  );
  const names = groups.slice(0, 3).map((group) => group.name).filter(Boolean).join(", ");
  return `${formatTeamCountLabel(groups.length, "sub package")} | ${formatTeamCountLabel(assignedCount, "assigned slot")} | ${formatTeamCountLabel(backupCount, "backup")} | ${names}`;
}

function applyTeamSettingsCollapsedState() {
  const state = getTeamSettingsCollapsedState();
  document
    .querySelectorAll(".team-settings-panel-header--toggle[data-panel-key]")
    .forEach((headerEl) => {
      const panelKey = headerEl.dataset.panelKey;
      const content = headerEl.nextElementSibling;
      if (!panelKey || !content) return;
      const isCollapsed = Boolean(state[panelKey]);
      content.classList.toggle("collapsed", isCollapsed);
      headerEl.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      const icon = headerEl.querySelector(".toggle-icon");
      if (icon) icon.textContent = isCollapsed ? "▶" : "▼";
    });
}

function updateTeamSettingsAutosaveStatus() {
  const el = document.getElementById("teamSettingsSaveStatus");
  if (!el) return;

  el.className = "team-settings-chip team-settings-chip--status is-saved";
  el.textContent = "Autosaved just now";

  clearTimeout(teamSettingsAutosaveTimer);
  teamSettingsAutosaveTimer = setTimeout(() => {
    const nextEl = document.getElementById("teamSettingsSaveStatus");
    if (!nextEl) return;
    nextEl.className = "team-settings-chip team-settings-chip--status";
    nextEl.textContent = "Autosave on";
  }, 2200);
}

function refreshTeamSettingsSelectionUI() {
  document
    .querySelectorAll(".team-slot-player-select")
    .forEach((selectEl) => {
      const currentValue = selectEl.value;
      selectEl.innerHTML = buildTeamPlayerOptionMarkup(currentValue);

      const slotEl = selectEl.closest(".team-package-slot");
      const previewEl = slotEl?.querySelector(".team-slot-selection");
      if (previewEl) {
        const depthValues = Array.from(
          slotEl.querySelectorAll(".team-slot-player-select"),
        )
          .map((el) => el.value)
          .filter(Boolean);
        previewEl.textContent = formatTeamDepthChartDisplay(depthValues);
      }
    });
}

function importTeamRosterFromText(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  return lines
    .map((line) => {
      const parts = line.split(/[\t,|]/).map((part) => part.trim());
      if (parts.length >= 3) {
        return normalizeTeamPlayer({
          number: parts[0],
          name: parts[1],
          position: parts[2],
        });
      }
      if (parts.length === 2) {
        return normalizeTeamPlayer({
          name: parts[0],
          position: parts[1],
        });
      }
      return normalizeTeamPlayer({ name: line });
    })
    .filter((player) => player.name);
}

function syncTeamSettingsDependents() {
  renderTeamSettings();
  if (typeof renderScript === "function") {
    renderScript();
  }
}

function renderTeamSettings() {
  teamSettingsViewState = captureTeamSettingsViewState();
  const rosterContainer = document.getElementById("teamRosterList");
  const packageContainer = document.getElementById("teamPersonnelPackages");
  const swapContainer = document.getElementById("teamSwapGroups");
  if (!rosterContainer || !packageContainer || !swapContainer) return;

  const roster = getTeamRoster();
  const packages = getTeamPersonnelPackages();
  const swapGroups = getTeamSwapGroups();
  const rosterBadge = document.getElementById("teamRosterCountBadge");
  const packagesBadge = document.getElementById("teamPackagesCountBadge");
  const swapGroupsBadge = document.getElementById("teamSwapGroupsCountBadge");
  const rosterSummary = document.getElementById("teamRosterSummary");
  const packagesSummary = document.getElementById("teamPackagesSummary");
  const swapGroupsSummary = document.getElementById("teamSwapGroupsSummary");
  const totalPackageSubs = packages.reduce(
    (sum, pkg) => sum + Object.values(normalizeTeamDepthChart(pkg.depthChart, pkg.assignments))
      .reduce((slotSum, playerIds) => slotSum + Math.max(playerIds.length - 1, 0), 0),
    0,
  );
  const totalSwapAssignments = swapGroups.reduce(
    (sum, group) => sum + Object.values(normalizeTeamDepthChart(group.depthChart, group.assignments))
      .filter((playerIds) => playerIds.length > 0).length,
    0,
  );
  const totalSwapBackups = swapGroups.reduce(
    (sum, group) => sum + Object.values(normalizeTeamDepthChart(group.depthChart, group.assignments))
      .reduce((slotSum, playerIds) => slotSum + Math.max(playerIds.length - 1, 0), 0),
    0,
  );

  if (rosterBadge) {
    rosterBadge.textContent = formatTeamCountLabel(roster.length, "player");
  }
  if (packagesBadge) {
    packagesBadge.textContent = `${formatTeamCountLabel(packages.length, "package")} | ${formatTeamCountLabel(totalPackageSubs, "sub")}`;
  }
  if (swapGroupsBadge) {
    swapGroupsBadge.textContent = `${formatTeamCountLabel(swapGroups.length, "preset")} | ${formatTeamCountLabel(totalSwapAssignments, "slot")} | ${formatTeamCountLabel(totalSwapBackups, "backup")}`;
  }
  if (rosterSummary) rosterSummary.textContent = buildTeamSettingsRosterSummary(roster);
  if (packagesSummary) packagesSummary.textContent = buildTeamSettingsPackagesSummary(packages);
  if (swapGroupsSummary) swapGroupsSummary.textContent = buildTeamSettingsSwapSummary(swapGroups);
  const renderAssignmentRow = (
    slots,
    assignments,
    fieldName,
    itemIndex,
    label,
    options = {},
  ) => `
    <div class="team-package-grid ${slots.length === 5 ? "team-package-grid--five" : "team-package-grid--six"}">
      ${slots.map((slot) => `
        <label class="team-package-slot ${options.editableLabels ? "team-package-slot--editable" : ""}">
          <span class="team-package-slot-eyebrow">${slot.defaultLabel}</span>
          ${options.editableLabels
      ? `<input
                type="text"
                class="team-slot-label-input"
                value="${escapeAttr(slot.label)}"
                data-field="${options.labelField || ""}"
                data-item-index="${itemIndex}"
                data-slot="${slot.key}"
                maxlength="4"
                aria-label="${escapeHtml(label)} ${slot.defaultLabel} label"
              />`
      : `<span class="team-package-slot-label">${slot.label}</span>`}
          ${(() => {
      const playerIds = options.depthChart
        ? getTeamDepthChartForSlot(assignments, slot.key)
        : [assignments[slot.key] || ""].filter(Boolean);
      const selectIds = playerIds.length ? playerIds : [""];
      const selectsMarkup = selectIds.map((playerId, depthIndex) => `
            <div class="team-slot-player-row ${options.depthChart ? "team-slot-player-row--depth" : ""}" ${options.depthChart ? `draggable="true" data-depth-kind="${options.depthKind || "package"}" data-item-index="${itemIndex}" data-slot="${slot.key}" data-depth-index="${depthIndex}"` : ""}>
              ${options.depthChart ? `<button type="button" class="team-slot-drag-handle" aria-label="Reorder ${escapeHtml(slot.label)} ${depthIndex === 0 ? "starter" : `sub ${depthIndex}`}" title="Drag to reorder">::</button>` : ""}
              <select class="team-slot-player-select" data-field="${fieldName}" data-item-index="${itemIndex}" data-slot="${slot.key}" data-depth-index="${depthIndex}" aria-label="${escapeHtml(label)} ${slot.label}${depthIndex === 0 ? " starter" : ` sub ${depthIndex}`} ">
                ${buildTeamPlayerOptionMarkup(playerId)}
              </select>
              ${options.depthChart && depthIndex > 0
          ? `<button type="button" class="btn btn-xs btn-danger team-slot-sub-remove" data-action="${options.removeSubAction || "removeTeamPackageSub"}" data-item-index="${itemIndex}" data-slot="${slot.key}" data-depth-index="${depthIndex}" aria-label="Remove ${escapeHtml(slot.label)} sub ${depthIndex}">Remove</button>`
          : ""}
            </div>
          `).join("");
      const addSubButton = options.depthChart
        ? `<button type="button" class="btn btn-xs team-slot-sub-add" data-action="${options.addSubAction || "addTeamPackageSub"}" data-item-index="${itemIndex}" data-slot="${slot.key}">Add sub</button>`
        : "";
      return `${selectsMarkup}<span class="team-slot-selection">${escapeHtml(formatTeamDepthChartDisplay(playerIds))}</span>${addSubButton}`;
    })()}
        </label>
      `).join("")}
    </div>
  `;

  rosterContainer.innerHTML = roster.length
    ? roster.map((player) => `
        <div class="team-roster-row" data-player-id="${escapeAttr(player.id)}">
          <input type="text" class="team-roster-cell team-roster-cell--num" value="${escapeAttr(player.number)}" data-field="teamPlayerNumber" data-player-id="${escapeAttr(player.id)}" placeholder="#" aria-label="Number for ${escapeHtml(player.name)}" />
          <input type="text" class="team-roster-cell team-roster-cell--name" value="${escapeAttr(player.name)}" data-field="teamPlayerName" data-player-id="${escapeAttr(player.id)}" placeholder="Player name" aria-label="Name for ${escapeHtml(player.name)}" />
          <input type="text" class="team-roster-cell team-roster-cell--pos" value="${escapeAttr(player.position)}" data-field="teamPlayerPosition" data-player-id="${escapeAttr(player.id)}" placeholder="POS" aria-label="Position for ${escapeHtml(player.name)}" />
          <select class="team-roster-cell team-roster-cell--group" data-field="teamPlayerPositionGroup" data-player-id="${escapeAttr(player.id)}" aria-label="Position group for ${escapeHtml(player.name)}">
            <option value="" ${player.positionGroup ? "" : "selected"}>Role type</option>
            <option value="skill" ${player.positionGroup === "skill" ? "selected" : ""}>Skill</option>
            <option value="linemen" ${player.positionGroup === "linemen" ? "selected" : ""}>Linemen</option>
          </select>
          <button type="button" class="btn btn-sm btn-danger" data-action="removeTeamPlayer" data-player-id="${escapeAttr(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">✕</button>
        </div>
      `).join("")
    : '<div class="team-settings-empty">No roster yet. Add players one at a time or paste a roster below.</div>';

  packageContainer.innerHTML = packages.length
    ? packages.map((pkg, pkgIndex) => {
      const packageSlots = getTeamAssignmentSlots(pkg.personnel);
      const rowOne = packageSlots.filter((slot) => slot.row === 0);
      const rowTwo = packageSlots.filter((slot) => slot.row === 1);
      const depthChart = normalizeTeamDepthChart(pkg.depthChart, pkg.assignments);
      const starterCount = Object.values(depthChart).filter((playerIds) => playerIds.length > 0).length;
      const subCount = Object.values(depthChart).reduce(
        (sum, playerIds) => sum + Math.max(playerIds.length - 1, 0),
        0,
      );
      return `
        <div class="team-package-card" data-package-index="${pkgIndex}">
          <div class="team-package-head">
            <div class="team-package-meta">
              <div class="team-package-meta-top">
                <input type="text" class="team-package-name" value="${escapeAttr(pkg.personnel)}" data-field="teamPackagePersonnel" data-package-index="${pkgIndex}" placeholder="11" aria-label="Personnel package name" />
                ${pkg.isAutoPrepared ? '<span class="team-package-status">Playbook Ready</span>' : ""}
                <span class="team-package-count">${formatTeamCountLabel(starterCount, "starter")}</span>
                <span class="team-package-count">${formatTeamCountLabel(subCount, "sub")}</span>
              </div>
              <p class="team-package-copy">Set players and rename the slot tags for ${escapeHtml(pkg.personnel || "this package")}.</p>
            </div>
            <button type="button" class="btn btn-sm btn-danger" data-action="removeTeamPersonnelPackage" data-package-index="${pkgIndex}" aria-label="Remove ${escapeHtml(pkg.personnel)} package">✕</button>
          </div>
              ${renderAssignmentRow(rowOne, depthChart, "teamPackageSlot", pkgIndex, pkg.personnel || "Package", { editableLabels: true, labelField: "teamPackageLabel", depthChart: true, depthKind: "package" })}
              ${renderAssignmentRow(rowTwo, depthChart, "teamPackageSlot", pkgIndex, pkg.personnel || "Package", { editableLabels: true, labelField: "teamPackageLabel", depthChart: true, depthKind: "package" })}
        </div>
      `;
    }).join("")
    : '<div class="team-settings-empty">No personnel packages yet. Add one to preload script lineups by personnel.</div>';

  swapContainer.innerHTML = swapGroups.length
    ? swapGroups.map((group, groupIndex) => {
      const groupSlots = getTeamAssignmentSlots(group.personnel);
      const rowOne = groupSlots.filter((slot) => slot.row === 0);
      const rowTwo = groupSlots.filter((slot) => slot.row === 1);
      const depthChart = normalizeTeamDepthChart(group.depthChart, group.assignments);
      const starterCount = Object.values(depthChart).filter((playerIds) => playerIds.length > 0).length;
      const subCount = Object.values(depthChart).reduce(
        (sum, playerIds) => sum + Math.max(playerIds.length - 1, 0),
        0,
      );
      const personnelCopy = group.personnel
        ? `Available on ${group.personnel} script rows.`
        : "Available on every script row.";
      return `
        <div class="team-package-card team-sub-package-card" data-group-index="${groupIndex}">
          <div class="team-package-head">
            <div class="team-package-meta">
              <div class="team-package-meta-top team-package-meta-top--stacked">
                <input type="text" class="team-package-name" value="${escapeAttr(group.name)}" data-field="teamSwapGroupName" data-group-index="${groupIndex}" placeholder="Sub package name" aria-label="Sub package name" />
                <input type="text" class="team-package-name team-package-name--short" value="${escapeAttr(group.personnel)}" data-field="teamSwapGroupPersonnel" data-group-index="${groupIndex}" placeholder="Personnel optional" aria-label="Personnel for ${escapeHtml(group.name || "sub package")}" />
                <span class="team-package-count">${formatTeamCountLabel(starterCount, "slot")}</span>
                <span class="team-package-count">${formatTeamCountLabel(subCount, "backup")}</span>
              </div>
              <p class="team-package-copy">${escapeHtml(personnelCopy)}</p>
            </div>
            <button type="button" class="btn btn-sm btn-danger" data-action="removeTeamSwapGroup" data-group-index="${groupIndex}" aria-label="Remove ${escapeHtml(group.name)} sub package">✕</button>
          </div>
              ${renderAssignmentRow(rowOne, depthChart, "teamSwapGroupSlot", groupIndex, group.name || "Sub package", { depthChart: true, depthKind: "swap", addSubAction: "addTeamSwapGroupSub", removeSubAction: "removeTeamSwapGroupSub" })}
              ${renderAssignmentRow(rowTwo, depthChart, "teamSwapGroupSlot", groupIndex, group.name || "Sub package", { depthChart: true, depthKind: "swap", addSubAction: "addTeamSwapGroupSub", removeSubAction: "removeTeamSwapGroupSub" })}
        </div>
      `;
    }).join("")
    : '<div class="team-settings-empty">No sub packages yet. Add one to apply preset substitutions from the script.</div>';

  applyTeamSettingsCollapsedState();
  restoreTeamSettingsViewState(teamSettingsViewState);
}

function getTeamDepthChartCollection(kind) {
  return kind === "swap" ? getTeamSwapGroups() : getTeamPersonnelPackages();
}

function saveTeamDepthChartCollection(kind, collection) {
  if (kind === "swap") return saveTeamSwapGroups(collection);
  return saveTeamPersonnelPackages(collection);
}

function updateTeamDepthChartSlot(kind, itemIndex, slotKey, depthIndex, playerId) {
  if (!slotKey || !Number.isInteger(itemIndex)) return false;
  const collection = getTeamDepthChartCollection(kind);
  if (!collection[itemIndex]) return false;

  const depthChart = normalizeTeamDepthChart(
    collection[itemIndex].depthChart,
    collection[itemIndex].assignments,
  );
  const slotDepth = getTeamDepthChartForSlot(depthChart, slotKey);
  if (playerId) slotDepth[depthIndex] = playerId;
  else slotDepth.splice(depthIndex, 1);

  const cleanedDepth = [...new Set(
    slotDepth.map((value) => String(value || "").trim()).filter(Boolean),
  )];
  if (cleanedDepth.length) depthChart[slotKey] = cleanedDepth;
  else delete depthChart[slotKey];

  collection[itemIndex].depthChart = depthChart;
  collection[itemIndex].assignments = getPrimaryAssignmentsFromDepthChart(depthChart);
  saveTeamDepthChartCollection(kind, collection);
  return true;
}

function addTeamDepthChartSub(kind, itemIndex, slotKey) {
  if (!slotKey || !Number.isInteger(itemIndex)) return false;
  const collection = getTeamDepthChartCollection(kind);
  if (!collection[itemIndex]) return false;

  const depthChart = normalizeTeamDepthChart(
    collection[itemIndex].depthChart,
    collection[itemIndex].assignments,
  );
  const slotDepth = getTeamDepthChartForSlot(depthChart, slotKey);
  const fallbackPlayer = getTeamRoster().find(
    (player) => !slotDepth.includes(player.id),
  );
  if (!fallbackPlayer) {
    showToast("Add another roster player first", { duration: 2500, type: "warning" });
    return false;
  }

  slotDepth.push(fallbackPlayer.id);
  depthChart[slotKey] = slotDepth;
  collection[itemIndex].depthChart = depthChart;
  collection[itemIndex].assignments = getPrimaryAssignmentsFromDepthChart(depthChart);
  saveTeamDepthChartCollection(kind, collection);
  return true;
}

function removeTeamDepthChartSub(kind, itemIndex, slotKey, depthIndex) {
  if (!slotKey || !Number.isInteger(itemIndex) || depthIndex <= 0) return false;
  const collection = getTeamDepthChartCollection(kind);
  if (!collection[itemIndex]) return false;

  const depthChart = normalizeTeamDepthChart(
    collection[itemIndex].depthChart,
    collection[itemIndex].assignments,
  );
  const slotDepth = getTeamDepthChartForSlot(depthChart, slotKey);
  slotDepth.splice(depthIndex, 1);
  if (slotDepth.length) depthChart[slotKey] = slotDepth;
  else delete depthChart[slotKey];

  collection[itemIndex].depthChart = depthChart;
  collection[itemIndex].assignments = getPrimaryAssignmentsFromDepthChart(depthChart);
  saveTeamDepthChartCollection(kind, collection);
  return true;
}

function reorderTeamDepthChartEntry(kind, itemIndex, slotKey, fromIndex, toIndex) {
  if (!slotKey || fromIndex === toIndex) return false;
  const collection = getTeamDepthChartCollection(kind);
  if (!collection[itemIndex]) return false;

  const depthChart = normalizeTeamDepthChart(
    collection[itemIndex].depthChart,
    collection[itemIndex].assignments,
  );
  const slotDepth = getTeamDepthChartForSlot(depthChart, slotKey);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= slotDepth.length ||
    toIndex >= slotDepth.length
  ) {
    return false;
  }

  const [movedPlayer] = slotDepth.splice(fromIndex, 1);
  slotDepth.splice(toIndex, 0, movedPlayer);
  depthChart[slotKey] = slotDepth;
  collection[itemIndex].depthChart = depthChart;
  collection[itemIndex].assignments = getPrimaryAssignmentsFromDepthChart(depthChart);

  saveTeamDepthChartCollection(kind, collection);
  return true;
}

function addTeamPlayer() {
  const nameEl = document.getElementById("teamPlayerNameInput");
  const numberEl = document.getElementById("teamPlayerNumberInput");
  const positionEl = document.getElementById("teamPlayerPositionInput");
  const positionGroupEl = document.getElementById("teamPlayerPositionGroupInput");
  const player = normalizeTeamPlayer({
    name: nameEl?.value,
    number: numberEl?.value,
    position: positionEl?.value,
    positionGroup: positionGroupEl?.value,
  });

  if (!player.name) {
    showToast("Enter a player name first", { duration: 2500, type: "warning" });
    return;
  }

  const roster = getTeamRoster();
  roster.push(player);
  saveTeamRoster(roster);

  if (nameEl) nameEl.value = "";
  if (numberEl) numberEl.value = "";
  if (positionEl) positionEl.value = "";
  if (positionGroupEl) positionGroupEl.value = "";

  syncTeamSettingsDependents();
  showToast(`${player.name} added to roster`);
}

function importTeamRoster() {
  const textarea = document.getElementById("teamRosterBulkInput");
  const imported = importTeamRosterFromText(textarea?.value || "");
  if (!imported.length) {
    showToast("Paste roster lines first", { duration: 2500, type: "warning" });
    return;
  }

  saveTeamRoster([...getTeamRoster(), ...imported]);
  if (textarea) textarea.value = "";
  syncTeamSettingsDependents();
  showToast(`Imported ${imported.length} player${imported.length === 1 ? "" : "s"}`);
}

async function importTeamRosterFile(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  try {
    const rawText = await file.text();
    const imported = importTeamRosterFromText(rawText);
    if (!imported.length) {
      showToast("No players found in roster file", { duration: 2500, type: "warning" });
      return;
    }

    saveTeamRoster([...getTeamRoster(), ...imported]);
    syncTeamSettingsDependents();
    showToast(`Imported ${imported.length} player${imported.length === 1 ? "" : "s"} from file`);
  } catch (error) {
    console.error("Roster import failed:", error);
    showToast("Could not read roster file", { duration: 3000, type: "error" });
  } finally {
    if (event?.target) event.target.value = "";
  }
}

function addTeamPersonnelPackage() {
  const input = document.getElementById("teamPackagePersonnelInput");
  const personnel = String(input?.value || "").trim();
  if (!personnel) {
    showToast("Enter a personnel group first", { duration: 2500, type: "warning" });
    return;
  }

  const packages = getTeamPersonnelPackages();
  if (packages.some((pkg) => pkg.personnel.toLowerCase() === personnel.toLowerCase())) {
    showToast(`${personnel} is already in Team Settings`, { duration: 2500, type: "info" });
    return;
  }
  packages.push({ personnel, assignments: {} });
  saveTeamPersonnelPackages(packages);
  if (input) input.value = "";
  syncTeamSettingsDependents();
  showToast(`${personnel} package added`);
}

function addTeamSwapGroup() {
  const nameEl = document.getElementById("teamSwapGroupNameInput");
  const personnelEl = document.getElementById("teamSwapGroupPersonnelInput");
  const group = normalizeTeamSwapGroup({
    name: nameEl?.value,
    personnel: personnelEl?.value,
    assignments: {},
  });

  if (!group.name) {
    showToast("Enter a sub package name first", { duration: 2500, type: "warning" });
    return;
  }

  const groups = getTeamSwapGroups();
  groups.push(group);
  saveTeamSwapGroups(groups);
  if (nameEl) nameEl.value = "";
  if (personnelEl) personnelEl.value = "";
  syncTeamSettingsDependents();
  showToast(`${group.name} sub package added`);
}

function removeTeamPlayer(playerId) {
  if (!playerId) return;
  const roster = getTeamRoster().filter((player) => player.id !== playerId);
  saveTeamRoster(roster);

  const packages = getTeamPersonnelPackages().map((pkg) => {
    const depthChart = normalizeTeamDepthChart(pkg.depthChart, pkg.assignments);
    Object.keys(depthChart).forEach((slotKey) => {
      depthChart[slotKey] = depthChart[slotKey].filter((value) => value !== playerId);
      if (!depthChart[slotKey].length) delete depthChart[slotKey];
    });
    return { ...pkg, depthChart, assignments: getPrimaryAssignmentsFromDepthChart(depthChart) };
  });
  saveTeamPersonnelPackages(packages);

  const swapGroups = getTeamSwapGroups().map((group) => {
    const depthChart = normalizeTeamDepthChart(group.depthChart, group.assignments);
    Object.keys(depthChart).forEach((slotKey) => {
      depthChart[slotKey] = depthChart[slotKey].filter((value) => value !== playerId);
      if (!depthChart[slotKey].length) delete depthChart[slotKey];
    });
    return { ...group, depthChart, assignments: getPrimaryAssignmentsFromDepthChart(depthChart) };
  });
  saveTeamSwapGroups(swapGroups);

  syncTeamSettingsDependents();
  showToast("Player removed from roster");
}

function removeTeamPersonnelPackage(packageIndex) {
  if (!Number.isInteger(packageIndex)) return;
  const packages = getTeamPersonnelPackages();
  if (!packages[packageIndex]) return;
  packages.splice(packageIndex, 1);
  saveTeamPersonnelPackages(packages);
  syncTeamSettingsDependents();
  showToast("Personnel package removed");
}

function removeTeamSwapGroup(groupIndex) {
  if (!Number.isInteger(groupIndex)) return;
  const groups = getTeamSwapGroups();
  if (!groups[groupIndex]) return;
  groups.splice(groupIndex, 1);
  saveTeamSwapGroups(groups);
  syncTeamSettingsDependents();
  showToast("Sub package removed");
}

function bindTeamDepthChartDragHandlers(container) {
  if (!container) return;

  container.addEventListener("dragstart", (event) => {
    const row = event.target.closest(".team-slot-player-row--depth");
    if (!row) return;
    teamDepthDragState = {
      kind: row.dataset.depthKind,
      itemIndex: parseInt(row.dataset.itemIndex, 10),
      slotKey: row.dataset.slot,
      fromIndex: parseInt(row.dataset.depthIndex, 10),
    };
    row.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", JSON.stringify(teamDepthDragState));
    }
  });

  container.addEventListener("dragover", (event) => {
    const row = event.target.closest(".team-slot-player-row--depth");
    if (!row || !teamDepthDragState) return;
    if (
      row.dataset.depthKind !== teamDepthDragState.kind ||
      parseInt(row.dataset.itemIndex, 10) !== teamDepthDragState.itemIndex ||
      row.dataset.slot !== teamDepthDragState.slotKey
    ) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    row.classList.add("is-drop-target");
  });

  container.addEventListener("dragleave", (event) => {
    const row = event.target.closest(".team-slot-player-row--depth");
    if (row) row.classList.remove("is-drop-target");
  });

  container.addEventListener("drop", (event) => {
    const row = event.target.closest(".team-slot-player-row--depth");
    if (!row || !teamDepthDragState) return;
    event.preventDefault();
    row.classList.remove("is-drop-target");
    const toIndex = parseInt(row.dataset.depthIndex, 10);
    if (
      reorderTeamDepthChartEntry(
        teamDepthDragState.kind,
        teamDepthDragState.itemIndex,
        teamDepthDragState.slotKey,
        teamDepthDragState.fromIndex,
        toIndex,
      )
    ) {
      renderTeamSettings();
      if (typeof renderScript === "function") renderScript();
    }
    teamDepthDragState = null;
  });

  container.addEventListener("dragend", (event) => {
    event.target.closest(".team-slot-player-row--depth")?.classList.remove("is-dragging");
    container
      .querySelectorAll(".team-slot-player-row--depth.is-drop-target")
      .forEach((row) => row.classList.remove("is-drop-target"));
    teamDepthDragState = null;
  });
}

function initTeamSettings() {
  const rosterContainer = document.getElementById("teamRosterList");
  const packageContainer = document.getElementById("teamPersonnelPackages");
  const swapContainer = document.getElementById("teamSwapGroups");
  if (
    !rosterContainer ||
    !packageContainer ||
    !swapContainer ||
    rosterContainer.dataset.bound === "true"
  ) {
    renderTeamSettings();
    return;
  }

  rosterContainer.dataset.bound = "true";
  packageContainer.dataset.bound = "true";
  swapContainer.dataset.bound = "true";

  document
    .querySelectorAll(".team-settings-panel-header--toggle[data-panel-key]")
    .forEach((headerEl) => {
      if (headerEl.dataset.bound === "true") return;
      headerEl.dataset.bound = "true";
      headerEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleCollapsiblePanel(headerEl);
      });
    });

  applyTeamSettingsCollapsedState();

  rosterContainer.addEventListener("input", (event) => {
    const input = event.target.closest("[data-player-id][data-field]");
    if (!input) return;
    const playerId = input.dataset.playerId;
    const field = input.dataset.field;
    const roster = getTeamRoster();
    const player = roster.find((entry) => entry.id === playerId);
    if (!player) return;

    if (field === "teamPlayerNumber") player.number = input.value;
    if (field === "teamPlayerName") player.name = input.value;
    if (field === "teamPlayerPosition") player.position = input.value.toUpperCase();
    if (field === "teamPlayerPositionGroup") player.positionGroup = input.value;

    saveTeamRoster(roster);
    refreshTeamSettingsSelectionUI();
    if (typeof currentActiveTab === "string" && currentActiveTab === "script" && typeof renderScript === "function") {
      renderScript();
    }
  });

  rosterContainer.addEventListener("change", () => {
    renderTeamSettings();
  });

  packageContainer.addEventListener("input", (event) => {
    const input = event.target.closest('[data-field="teamPackagePersonnel"], [data-field="teamPackageLabel"]');
    if (!input) return;
    const packageIndex = parseInt(
      input.dataset.packageIndex || input.dataset.itemIndex,
      10,
    );
    if (!Number.isInteger(packageIndex)) return;
    const packages = getTeamPersonnelPackages();
    if (!packages[packageIndex]) return;
    if (input.dataset.field === "teamPackagePersonnel") {
      packages[packageIndex].personnel = input.value;
    }
    if (input.dataset.field === "teamPackageLabel") {
      const slotKey = input.dataset.slot;
      const nextLabels = { ...(packages[packageIndex].labels || {}) };
      if (slotKey) nextLabels[slotKey] = input.value;
      packages[packageIndex].labels = nextLabels;
    }
    saveTeamPersonnelPackages(packages);
    refreshTeamSettingsSelectionUI();
    if (typeof renderScript === "function") renderScript();
  });

  packageContainer.addEventListener("change", (event) => {
    const select = event.target.closest('[data-field="teamPackageSlot"]');
    if (!select) {
      renderTeamSettings();
      if (typeof renderPlaybook === "function") renderPlaybook();
      return;
    }
    const packageIndex = parseInt(select.dataset.itemIndex, 10);
    const slotKey = select.dataset.slot;
    const depthIndex = parseInt(select.dataset.depthIndex || "0", 10);
    if (updateTeamDepthChartSlot("package", packageIndex, slotKey, depthIndex, select.value)) {
      syncTeamSettingsDependents();
    }
  });

  packageContainer.addEventListener("click", (event) => {
    const addButton = event.target.closest('[data-action="addTeamPackageSub"]');
    if (addButton) {
      const packageIndex = parseInt(addButton.dataset.itemIndex, 10);
      const slotKey = addButton.dataset.slot;
      if (addTeamDepthChartSub("package", packageIndex, slotKey)) {
        renderTeamSettings();
      }
      return;
    }

    const removeButton = event.target.closest('[data-action="removeTeamPackageSub"]');
    if (!removeButton) return;
    const packageIndex = parseInt(removeButton.dataset.itemIndex, 10);
    const slotKey = removeButton.dataset.slot;
    const depthIndex = parseInt(removeButton.dataset.depthIndex || "0", 10);
    if (removeTeamDepthChartSub("package", packageIndex, slotKey, depthIndex)) {
      renderTeamSettings();
    }
  });

  swapContainer.addEventListener("input", (event) => {
    const input = event.target.closest('[data-field="teamSwapGroupName"], [data-field="teamSwapGroupPersonnel"]');
    if (!input) return;
    const groupIndex = parseInt(input.dataset.groupIndex, 10);
    if (!Number.isInteger(groupIndex)) return;
    const groups = getTeamSwapGroups();
    if (!groups[groupIndex]) return;
    if (input.dataset.field === "teamSwapGroupName") {
      groups[groupIndex].name = input.value;
    }
    if (input.dataset.field === "teamSwapGroupPersonnel") {
      groups[groupIndex].personnel = input.value;
    }
    saveTeamSwapGroups(groups);
    refreshTeamSettingsSelectionUI();
    if (typeof renderScript === "function") renderScript();
  });

  swapContainer.addEventListener("change", (event) => {
    const select = event.target.closest('[data-field="teamSwapGroupSlot"]');
    if (!select) {
      renderTeamSettings();
      return;
    }
    const groupIndex = parseInt(select.dataset.itemIndex, 10);
    const slotKey = select.dataset.slot;
    const depthIndex = parseInt(select.dataset.depthIndex || "0", 10);
    if (updateTeamDepthChartSlot("swap", groupIndex, slotKey, depthIndex, select.value)) {
      syncTeamSettingsDependents();
    }
  });

  swapContainer.addEventListener("click", (event) => {
    const addButton = event.target.closest('[data-action="addTeamSwapGroupSub"]');
    if (addButton) {
      const groupIndex = parseInt(addButton.dataset.itemIndex, 10);
      const slotKey = addButton.dataset.slot;
      if (addTeamDepthChartSub("swap", groupIndex, slotKey)) {
        renderTeamSettings();
        if (typeof renderScript === "function") renderScript();
      }
      return;
    }

    const removeButton = event.target.closest('[data-action="removeTeamSwapGroupSub"]');
    if (!removeButton) return;
    const groupIndex = parseInt(removeButton.dataset.itemIndex, 10);
    const slotKey = removeButton.dataset.slot;
    const depthIndex = parseInt(removeButton.dataset.depthIndex || "0", 10);
    if (removeTeamDepthChartSub("swap", groupIndex, slotKey, depthIndex)) {
      renderTeamSettings();
      if (typeof renderScript === "function") renderScript();
    }
  });

  bindTeamDepthChartDragHandlers(packageContainer);
  bindTeamDepthChartDragHandlers(swapContainer);

  renderTeamSettings();
}
