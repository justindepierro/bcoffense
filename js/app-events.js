document.addEventListener("click", (e) => {
  if (!e.target.closest(".more-tools-wrap")) {
    document
      .querySelectorAll(".more-tools-wrap.open")
      .forEach((el) => el.classList.remove("open"));
  }
  // Close generic tool-menu dropdowns
  if (!e.target.closest(".tool-menu-wrap")) {
    document
      .querySelectorAll(".tool-menu-wrap.open")
      .forEach((el) => el.classList.remove("open"));
  } else if (e.target.closest(".tool-menu")) {
    // Clicking an action inside a tool-menu closes that specific dropdown
    const wrap = e.target.closest(".tool-menu-wrap");
    if (wrap) wrap.classList.remove("open");
  }
});

/* ── Delegated click handler ─────────────────────────────────────
 * Replaces all inline onclick= attributes in index.html.
 * Each interactive element uses data-action="fnName" (and optionally
 * data-arg / data-target) instead of inline JS.
 * ────────────────────────────────────────────────────────────────── */
const _ELEMENT_FNS = new Set([
  "toggleFilterSection",
  "toggleCollapsiblePanel",
  "setHeaderColor",
  "setCardColor",
  "csPickerAddPlay",
  "toggleSirCollapse",
  "toggleScriptCheckbox",
  "toggleWbCheckbox",
  "moveSortCriteria",
  "removeScheduleGame",
  "setScheduleActive",
]);
const _BOOL_FNS = new Set(["toggleAllPbPrintOptions", "csSelectAllFields"]);

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  if (action.endsWith("Overlay")) {
    if (e.target !== el) return;
    const fn = window[action.slice(0, -7)];
    if (typeof fn === "function") fn();
    return;
  }

  if (action === "triggerClick") {
    const t = el.dataset.target;
    if (t) document.getElementById(t)?.click();
    return;
  }

  if (action === "toggleParentOpen") {
    const wrap = el.parentElement;
    wrap.classList.toggle("open");
    // Position fixed dropdowns to escape overflow-clipping toolbar containers
    if (wrap.classList.contains("open")) {
      const menu = wrap.querySelector(".tool-menu, .more-tools-menu");
      if (menu) {
        const rect = el.getBoundingClientRect();
        const isUp =
          wrap.classList.contains("tool-menu-up") ||
          wrap.classList.contains("more-tools-wrap");
        if (isUp) {
          menu.style.top = "auto";
          menu.style.bottom = window.innerHeight - rect.top + 4 + "px";
        } else {
          menu.style.top = rect.bottom + 4 + "px";
          menu.style.bottom = "auto";
        }
        // Right-align tool menus; left-align more-tools menus
        const menuW = menu.offsetWidth || 200;
        let left;
        if (wrap.classList.contains("tool-menu-wrap")) {
          left = rect.right - menuW;
        } else {
          left = rect.left;
        }
        left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
        menu.style.left = left + "px";
        menu.style.right = "auto";
      }
    }
    return;
  }
  if (action === "removeParentOpen") {
    el.parentElement.classList.remove("open");
    return;
  }
  if (action === "reloadPage") {
    location.reload();
    return;
  }

  switch (action) {
    case "setPeriodPreset": {
      const input = document.getElementById("newPeriodName");
      if (input) input.value = el.dataset.preset;
      return;
    }
    case "closePeriodOverlay": {
      const ov = el.closest(".period-create-overlay");
      if (ov) ov.remove();
      return;
    }
    case "doInsertTemplate": {
      doInsertTemplate(parseInt(el.dataset.idx, 10));
      const ov = el.closest(".period-create-overlay");
      if (ov) ov.remove();
      return;
    }
    case "doDeleteTemplate":
      doDeleteTemplate(parseInt(el.dataset.idx, 10));
      return;
    case "doImportFromCallSheet": {
      const modal = el.closest(".cs-import-modal");
      if (modal) doImportFromCallSheet(parseInt(el.dataset.idx, 10), modal);
      return;
    }
    case "csImportSelectAll": {
      const modal = el.closest(".cs-import-modal");
      if (modal)
        modal
          .querySelectorAll(".cs-import-cat-cb")
          .forEach((cb) => (cb.checked = true));
      return;
    }
    case "csImportClearAll": {
      const modal = el.closest(".cs-import-modal");
      if (modal)
        modal
          .querySelectorAll(".cs-import-cat-cb")
          .forEach((cb) => (cb.checked = false));
      return;
    }
    case "loadScript":
      loadScript(parseInt(el.dataset.sid, 10));
      return;
    case "renameSavedScript":
      renameSavedScript(parseInt(el.dataset.sid, 10));
      return;
    case "overwriteSavedScript":
      overwriteSavedScript(parseInt(el.dataset.sid, 10));
      return;
    case "deleteSavedScript":
      deleteSavedScript(parseInt(el.dataset.sid, 10));
      return;
    case "removeFilter":
      removeFilter(el.dataset.layer, el.dataset.filterValue);
      return;
    case "openCustomOrderModal":
      openCustomOrderModal(el.dataset.sortField || el.dataset.arg);
      return;
    case "loadCollection":
      loadCollection(parseInt(el.dataset.idx, 10));
      return;
    case "sendCollectionToScript":
      sendCollectionToScript(parseInt(el.dataset.idx, 10));
      return;
    case "sendCollectionToCallSheet":
      sendCollectionToCallSheet(parseInt(el.dataset.idx, 10));
      return;
    case "deleteCollection":
      deleteCollection(parseInt(el.dataset.idx, 10));
      return;
    case "_pbSortToggleDir":
      _pbSortToggleDir(parseInt(el.dataset.idx, 10));
      return;
    case "_pbSortRemove":
      _pbSortRemove(parseInt(el.dataset.idx, 10));
      return;
    case "swapPlayHash":
      swapPlayHash(
        el.dataset.category,
        el.dataset.hash,
        parseInt(el.dataset.index, 10),
      );
      return;
    case "removeCallSheetPlay":
      removeCallSheetPlay(
        el.dataset.category,
        el.dataset.hash,
        parseInt(el.dataset.index, 10),
      );
      return;
    case "openCallSheetPlayPicker":
      openCallSheetPlayPicker(el.dataset.cat, el.dataset.hash);
      return;
    case "openCategoryMenu":
      openCategoryMenu(e, el.dataset.arg);
      return;
    case "csPickerAddPlay":
      csPickerAddPlay(el);
      return;
    case "deleteDisplayPreset":
      deleteDisplayPreset(parseInt(el.dataset.idx, 10));
      return;
    case "loadTemplate":
      loadTemplate(parseInt(el.dataset.idx, 10));
      return;
    case "deleteTemplate":
      deleteTemplate(parseInt(el.dataset.idx, 10));
      return;
    case "toggleCsSortDirection":
      toggleCsSortDirection(parseInt(el.dataset.idx, 10));
      return;
    case "removeCsSortCriteria":
      removeCsSortCriteria(parseInt(el.dataset.idx, 10));
      return;
    case "addSuggestionToSheet":
      addSuggestionToSheet(
        el.dataset.cat,
        el.dataset.hash,
        parseInt(el.dataset.idx, 10),
      );
      return;
    case "editTendenciesPlay":
      editTendenciesPlay(parseInt(el.dataset.idx, 10));
      return;
    case "duplicateTendenciesPlay":
      duplicateTendenciesPlay(parseInt(el.dataset.idx, 10));
      return;
    case "deleteTendenciesPlay":
      deleteTendenciesPlay(parseInt(el.dataset.idx, 10));
      return;
    case "toggleTdFilter":
      toggleTdFilter(el.dataset.key, el.dataset.val);
      return;
    case "goToWizardStep":
      goToWizardStep(parseInt(el.dataset.idx, 10));
      return;
    case "setWizardField":
      setWizardField(el.dataset.key, el.dataset.val, el);
      return;
    case "switchCard":
      switchCard(parseInt(el.dataset.idx, 10));
      return;
    case "toggleSortDirection":
      toggleSortDirection(parseInt(el.dataset.idx, 10));
      return;
    case "removeSortCriteria":
      removeSortCriteria(parseInt(el.dataset.idx, 10));
      return;
    case "selectPlayForCell":
      selectPlayForCell(parseInt(el.dataset.idx, 10));
      return;
    case "loadWristband":
      loadWristband(parseInt(el.dataset.idx, 10));
      return;
    case "renameSavedWristband":
      renameSavedWristband(parseInt(el.dataset.idx, 10));
      return;
    case "overwriteSavedWristband":
      overwriteSavedWristband(parseInt(el.dataset.idx, 10));
      return;
    case "deleteSavedWristband":
      deleteSavedWristband(parseInt(el.dataset.idx, 10));
      return;
    case "toggleWbFavorite":
      toggleWbFavorite(parseInt(el.dataset.idx, 10));
      return;
    case "removeTeamPlayer":
      removeTeamPlayer(el.dataset.playerId);
      return;
    case "removeTeamPersonnelPackage":
      removeTeamPersonnelPackage(parseInt(el.dataset.packageIndex, 10));
      return;
    case "removeTeamSwapGroup":
      removeTeamSwapGroup(parseInt(el.dataset.groupIndex, 10));
      return;
  }

  const fn = window[action];
  if (typeof fn !== "function") return;

  const arg = el.dataset.arg;
  if (arg !== undefined && _ELEMENT_FNS.has(action)) {
    fn(arg, el);
  } else if (arg !== undefined && _BOOL_FNS.has(action)) {
    fn(arg === "true");
  } else if (arg !== undefined) {
    fn(arg);
  } else if (_ELEMENT_FNS.has(action)) {
    fn(el);
  } else {
    fn();
  }

  if (el.dataset.ctxClose) {
    el.closest(".cs-context-menu")?.remove();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest(
    "[data-action='toggleCollapsiblePanel'][role='button']",
  );
  if (!el) return;
  e.preventDefault();
  toggleCollapsiblePanel(el);
});

function _wireScriptPeriodDrag(container) {
  if (!container) return;

  container.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[data-drag]");
    if (!el || el.dataset.drag !== "periodStart") return;
    handlePeriodDragStart(e, el.dataset.periodId);
  });

  container.addEventListener("dragover", (e) => {
    const target = e.target.closest("[data-period-drop-id]");
    if (!target || !container.contains(target)) return;
    handlePeriodDragOver(e, target);
  });

  container.addEventListener("drop", (e) => {
    const target = e.target.closest("[data-period-drop-id]");
    if (!target || !container.contains(target)) return;
    if (handlePeriodDrop(e, target)) {
      e.stopImmediatePropagation();
    }
  });

  container.addEventListener("dragend", (e) => {
    const el = e.target.closest("[data-drag]");
    if (el?.dataset.drag === "periodStart") handlePeriodDragEnd();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const scriptEl = document.getElementById("scriptPlays");
  if (scriptEl) {
    scriptEl.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      const idx = parseInt(el.dataset.idx, 10);
      const rawDir = el.dataset.dir;
      const dir = parseInt(rawDir, 10);
      switch (action) {
        case "openScriptMoveMenu":
          openScriptMoveMenu(e, idx);
          break;
        case "movePlay":
          movePlay(idx, Number.isNaN(dir) ? rawDir : dir);
          break;
        case "movePlayToPeriod":
          movePlayToPeriod(idx);
          break;
        case "removeFromScript":
          removeFromScript(idx);
          break;
        case "duplicatePlay":
          duplicatePlay(idx);
          break;
        case "togglePeriodCollapse":
          togglePeriodCollapse(el.dataset.periodId);
          break;
        case "movePeriod":
          movePeriod(idx, dir);
          break;
        case "duplicatePeriod":
          duplicatePeriod(idx);
          break;
        case "savePeriodAsTemplate":
          savePeriodAsTemplate(idx);
          break;
        case "togglePeriodProtection":
          togglePeriodProtection(idx);
          break;
        case "selectPeriodPlays":
          selectPeriodPlays(idx);
          break;
        case "openPeriodReorderModal":
          openPeriodReorderModal(idx);
          break;
        case "sortPeriod":
          sortPeriod(idx);
          break;
        case "reversePeriod":
          reversePeriod(idx);
          break;
        case "openSmartScriptForPeriod":
          openSmartScriptForPeriod(idx);
          break;
        case "applyPreferredForPeriod":
          applyPreferredForPeriod(idx);
          break;
        case "pushPeriodToCallSheet":
          pushPeriodToCallSheet(idx);
          break;
        case "promoteScriptDepthPlayer":
          promoteScriptDepthPlayer(idx, el.dataset.slot, el.dataset.playerId);
          break;
        case "resetScriptPlayerOverrides":
          resetScriptPlayerOverrides(idx);
          break;
        case "importFromCallSheet":
          importFromCallSheet(idx);
          break;
        case "copyPeriodAsText":
          copyPeriodAsText(idx);
          break;
        default:
          return;
      }
      e.stopPropagation();
    });

    scriptEl.addEventListener("change", (e) => {
      const el = e.target;
      const field = el.dataset.field;
      if (!field) return;
      const idx = parseInt(el.dataset.idx, 10);
      switch (field) {
        case "hash":
          updateHash(idx, el.value);
          break;
        case "defFront":
          updateDefField(idx, "defFront", el.value);
          break;
        case "defCoverage":
          updateDefField(idx, "defCoverage", el.value);
          break;
        case "defStunt":
          updateDefField(idx, "defStunt", el.value);
          break;
        case "defBlitz":
          updateDefField(idx, "defBlitz", el.value);
          break;
        case "shift":
          updateScriptCallField(idx, "shift", el.value);
          break;
        case "motion":
          updateScriptCallField(idx, "motion", el.value);
          break;
        case "reps":
          updateReps(idx, el.value);
          break;
        case "notes":
          updateNotes(idx, el.value);
          break;
        case "playerAssignment":
          updateScriptPlayerAssignment(idx, el.dataset.slot, el.value);
          break;
        case "scriptSubPackage":
          applyScriptSubPackage(idx, el.value);
          break;
        case "bulkSelect":
          toggleBulkSelect(idx);
          break;
        case "periodColor":
          updatePeriodColor(idx, el);
          break;
        case "periodLabel":
          updatePeriodLabel(idx, el.value, false);
          break;
        case "periodNotes":
          updatePeriodNotes(idx, el.value, false);
          break;
        case "periodMinutes":
          updatePeriodMinutes(idx, el);
          break;
      }
    });

    scriptEl.addEventListener("input", (e) => {
      const el = e.target;
      const field = el.dataset.field;
      if (!field) return;
      const idx = parseInt(el.dataset.idx, 10);
      if (Number.isNaN(idx)) return;

      const isBulkContext =
        bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(idx);

      switch (field) {
        case "notes":
          if (!isBulkContext) updateNotes(idx, el.value);
          break;
        case "defFront":
          if (!isBulkContext) updateDefField(idx, "defFront", el.value);
          break;
        case "defCoverage":
          if (!isBulkContext) updateDefField(idx, "defCoverage", el.value);
          break;
        case "defStunt":
          if (!isBulkContext) updateDefField(idx, "defStunt", el.value);
          break;
        case "defBlitz":
          if (!isBulkContext) updateDefField(idx, "defBlitz", el.value);
          break;
        case "shift":
          if (!isBulkContext) updateScriptCallField(idx, "shift", el.value);
          break;
        case "motion":
          if (!isBulkContext) updateScriptCallField(idx, "motion", el.value);
          break;
        case "periodLabel":
          updatePeriodLabel(idx, el.value, true);
          break;
        case "periodNotes":
          updatePeriodNotes(idx, el.value, true);
          break;
      }
    });

    scriptEl.addEventListener("dragstart", (e) => {
      const el = e.target.closest("[data-drag]");
      if (!el) return;
      if (el.dataset.drag === "periodStart") {
        handlePeriodDragStart(e, el.dataset.periodId);
      } else if (el.dataset.drag === "scriptStart") {
        handleScriptDragStart(e, parseInt(el.dataset.idx, 10));
      }
    });
    scriptEl.addEventListener("dragend", (e) => {
      const el = e.target.closest("[data-drag]");
      if (!el) return;
      if (el.dataset.drag === "periodStart") handlePeriodDragEnd();
      else handleDragEnd(e);
    });
    scriptEl.addEventListener("dragover", (e) => {
      const target = e.target.closest("[data-period-drop-id]");
      if (!target || !scriptEl.contains(target)) return;
      handlePeriodDragOver(e, target);
    });
    scriptEl.addEventListener("drop", (e) => {
      const target = e.target.closest("[data-period-drop-id]");
      if (!target || !scriptEl.contains(target)) return;
      if (handlePeriodDrop(e, target)) {
        e.stopImmediatePropagation();
      }
    });

    scriptEl.addEventListener("contextmenu", (e) => {
      const playEl = e.target.closest(".script-item:not(.period-header)");
      if (!playEl) return;
      const idx = parseInt(playEl.dataset.idx, 10);
      if (isNaN(idx) || !script[idx] || script[idx].isSeparator) return;
      e.preventDefault();
      _showScriptPlayContextMenu(e, idx);
    });
  }

  _wireScriptPeriodDrag(document.getElementById("scriptTimeline"));

  const availEl = document.getElementById("availablePlays");
  if (availEl) {
    availEl.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      if (el.dataset.action === "openAvailableAddMenu") {
        openAvailableAddMenu(e, parseInt(el.dataset.idx, 10));
        e.stopPropagation();
        return;
      }
      if (el.dataset.action === "addToScript") {
        addToScript(parseInt(el.dataset.idx, 10));
        e.stopPropagation();
      }
    });
    availEl.addEventListener("change", (e) => {
      if (e.target.dataset.field === "availableSelect") {
        toggleAvailablePlaySelect(parseInt(e.target.dataset.idx, 10));
      }
    });
    availEl.addEventListener("dragstart", (e) => {
      const el = e.target.closest("[data-drag]");
      if (el && el.dataset.drag === "availStart") {
        handleDragStart(e, parseInt(el.dataset.idx, 10));
      }
    });
  }

  const pbBody = document.querySelector("#playbookTable tbody");
  if (pbBody) {
    pbBody.addEventListener("click", (e) => {
      const gpBtn = e.target.closest("[data-action='togglePlaybookGamePlan']");
      if (gpBtn) {
        e.stopPropagation();
        togglePlaybookGamePlan(parseInt(gpBtn.dataset.idx, 10));
        return;
      }
      const row = e.target.closest("tr[data-action]");
      if (!row) return;
      const idx = parseInt(row.dataset.idx, 10);
      const cell = e.target.closest("[data-action='copyPlayName']");
      if (cell) {
        e.stopPropagation();
        copyPlayName(cell.dataset.play);
        return;
      }
      selectPlaybookRow(idx);
      e.stopPropagation();
    });
    pbBody.addEventListener("dblclick", (e) => {
      const row = e.target.closest("tr[data-idx]");
      if (!row) return;
      const rowIdx = parseInt(row.dataset.idx, 10);
      if (typeof isAdminUser === "function" && !isAdminUser()) {
        selectPlaybookRow(rowIdx);
        e.stopPropagation();
        return;
      }
      if (typeof openPlayEditor === "function") {
        openPlayEditor(rowIdx);
      }
      e.stopPropagation();
    });
    pbBody.addEventListener(
      "mouseenter",
      (e) => {
        const row = e.target.closest("tr[data-preview]");
        if (row) showPlayPreview(e, parseInt(row.dataset.preview, 10));
      },
      true,
    );
    pbBody.addEventListener(
      "mouseleave",
      (e) => {
        const row = e.target.closest("tr[data-preview]");
        if (row) hidePlayPreview();
      },
      true,
    );
    pbBody.addEventListener("contextmenu", (e) => {
      const row = e.target.closest("tr[data-idx]");
      if (!row) return;
      const filteredIdx = parseInt(row.dataset.idx, 10);
      if (isNaN(filteredIdx)) return;
      e.preventDefault();
      _showPlaybookRowContextMenu(e, filteredIdx);
    });
    if (typeof addLongPress === "function") {
      addLongPress(pbBody, (ev) => {
        const row = ev.target?.closest && ev.target.closest("tr[data-idx]");
        if (!row) return;
        const filteredIdx = parseInt(row.dataset.idx, 10);
        if (isNaN(filteredIdx)) return;
        _showPlaybookRowContextMenu(ev, filteredIdx);
      });
    }
  }

  document.body.addEventListener("dragstart", (e) => {
    const el = e.target.closest("[data-drag='pbSort']");
    if (el && typeof _pbSortDragStart === "function") {
      _pbSortDragStart(e, parseInt(el.dataset.idx, 10));
    }
  });
  document.body.addEventListener("dragover", (e) => {
    const el = e.target.closest("[data-drag='pbSort']");
    if (el && typeof _pbSortDragOver === "function") _pbSortDragOver(e);
  });
  document.body.addEventListener("drop", (e) => {
    const el = e.target.closest("[data-drag='pbSort']");
    if (el && typeof _pbSortDrop === "function") {
      _pbSortDrop(e, parseInt(el.dataset.idx, 10));
    }
  });

  const tdContent = document.getElementById("tendenciesContent");
  if (tdContent) {
    tdContent.addEventListener("contextmenu", (e) => {
      const row = e.target.closest("tr[data-orig]");
      if (!row) return;
      e.preventDefault();
      const origIdx = parseInt(row.dataset.orig, 10);
      if (isNaN(origIdx)) return;
      _showTdPlayContextMenu(e, origIdx);
    });
  }

  const obContent = document.getElementById("offenseBuilderContent");
  if (obContent) {
    obContent.addEventListener("contextmenu", (e) => {
      const card = e.target.closest(".ob-card[data-play]");
      if (!card) return;
      e.preventDefault();
      _showObCardContextMenu(e, card.dataset.play);
    });
  }

  ["searchPlay", "wbSearchPlay"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && input.value) {
        e.preventDefault();
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });
});

function _showScriptPlayContextMenu(e, idx) {
  if (isNaN(idx) || !script[idx] || script[idx].isSeparator) return;
  const play = script[idx];
  const hasCustomTags =
    getSharedCustomTagEntries(play.scriptFormationTags).length > 0 ||
    getSharedCustomTagEntries(play.scriptBackTags).length > 0;
  const menuItems = [
    { label: "📋 Duplicate Play", action: () => duplicatePlay(idx) },
    {
      label: "⬆️ Move Up",
      action: () => movePlay(idx, -1),
      disabled: idx === 0,
    },
    {
      label: "⬇️ Move Down",
      action: () => movePlay(idx, 1),
      disabled: idx === script.length - 1,
    },
    { separator: true },
    {
      label: "🏷️ Edit Formation Tags",
      action: async () => {
        const currentPlay = script[idx];
        if (!currentPlay || currentPlay.isSeparator) return;
        const entries = await showCustomTagEditorModal({
          title: "Script Formation Tags",
          icon: "🏷️",
          message: "Add formation-tag options and set each one to Full, NV, or 1L.",
          placeholder: "Open",
          initialEntries: currentPlay.scriptFormationTags,
        });
        if (entries === null) return;
        saveScriptState();
        currentPlay.scriptFormationTags = entries.length ? entries : undefined;
        markScriptDirty();
        renderScript();
        showToast(entries.length ? "Formation tags saved" : "Formation tags removed");
      },
    },
    {
      label: "🏷️ Edit Back Tags",
      action: async () => {
        const currentPlay = script[idx];
        if (!currentPlay || currentPlay.isSeparator) return;
        const entries = await showCustomTagEditorModal({
          title: "Script Back Tags",
          icon: "🏷️",
          message: "Add back-tag options and set each one to Full, NV, or 1L.",
          placeholder: "Pistol",
          initialEntries: currentPlay.scriptBackTags,
        });
        if (entries === null) return;
        saveScriptState();
        currentPlay.scriptBackTags = entries.length ? entries : undefined;
        markScriptDirty();
        renderScript();
        showToast(entries.length ? "Back tags saved" : "Back tags removed");
      },
    },
    {
      label: "🚫 Clear Custom Tags",
      action: () => {
        const currentPlay = script[idx];
        if (!currentPlay || currentPlay.isSeparator) return;
        saveScriptState();
        delete currentPlay.scriptFormationTags;
        delete currentPlay.scriptBackTags;
        markScriptDirty();
        renderScript();
        showToast("Custom tags removed");
      },
      disabled: !hasCustomTags,
    },
    { separator: true },
    { label: "🗑️ Remove", action: () => removeFromScript(idx), danger: true },
  ];

  const menu = document.createElement("div");
  menu.className = "cs-context-menu";

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

  showContextMenu(e, menu);
}

function _showPlaybookRowContextMenu(e, filteredIdx) {
  const play = filteredPlays[filteredIdx];
  if (!play) return;
  const masterIdx = plays.indexOf(play);
  const canEditPlaybook = typeof isAdminUser !== "function" || isAdminUser();
  const menu = [{ label: "📋 Copy Play Name", action: () => copyPlayName(play.play) }];

  if (canEditPlaybook && typeof openPlayEditor === "function") {
    menu.unshift({ label: "✏️ Edit Play", action: () => openPlayEditor(filteredIdx) });
  }

  if (canEditPlaybook && typeof addToScript === "function") {
    menu.push({
      label: "📝 Add to Script",
      action: () => {
        if (masterIdx >= 0) {
          addToScript(masterIdx);
          showToast("Added to script");
        }
      },
    });
  }
  if (canEditPlaybook && typeof togglePlaybookGamePlan === "function") {
    menu.push({
      label: play.opponent ? "⭐ Remove from Game Plan" : "⭐ Add to Game Plan",
      action: () => togglePlaybookGamePlan(filteredIdx),
    });
  }
  showContextMenu(e, menu);
}

function _showTdPlayContextMenu(e, origIdx) {
  const menu = [
    {
      label: "✏️ Edit Play",
      action: () => {
        if (typeof editTendenciesPlay === "function") editTendenciesPlay(origIdx);
      },
    },
    {
      label: "⧉ Duplicate Play",
      action: () => {
        if (typeof duplicateTendenciesPlay === "function") {
          duplicateTendenciesPlay(origIdx);
        }
      },
    },
    { separator: true },
    {
      label: "🗑️ Delete Play",
      action: () => {
        if (typeof deleteTendenciesPlay === "function") deleteTendenciesPlay(origIdx);
      },
      danger: true,
    },
  ];
  showContextMenu(e, menu);
}

function _showObCardContextMenu(e, playName) {
  if (!playName) return;
  const menu = [
    {
      label: "📝 Add to Script",
      action: () => {
        const idx = plays.findIndex((p) => p.play === playName);
        if (idx >= 0 && typeof addToScript === "function") {
          addToScript(idx);
          showToast("Added to script");
        }
      },
    },
    {
      label: "⭐ Rate 5 Stars",
      action: () => {
        if (typeof obSetRating === "function") obSetRating(playName, 5);
      },
    },
    {
      label: "🚫 Clear Rating",
      action: () => {
        if (typeof obSetRating === "function") obSetRating(playName, 0);
      },
    },
  ];
  showContextMenu(e, menu);
}

function _dispatchDataHandler(e, attr) {
  const el = e.target;
  const raw = el.dataset[attr];
  if (!raw) return;
  const fns = raw.split(";");
  const pass = el.dataset.pass;
  const arg = el.dataset.arg;
  const key = el.dataset.key;
  for (const name of fns) {
    const fn = window[name];
    if (typeof fn !== "function") continue;
    if (key !== undefined && pass === "value") fn(key, el.value);
    else if (arg !== undefined && pass === "value") fn(arg, el.value);
    else if (arg !== undefined && pass === "event") fn(arg, e);
    else if (pass === "value") fn(el.value);
    else if (pass === "event") fn(e);
    else if (arg !== undefined) fn(arg);
    else fn();
  }
}
document.addEventListener("change", (e) => _dispatchDataHandler(e, "onchange"));
document.addEventListener("input", (e) => _dispatchDataHandler(e, "oninput"));

(function _handleTabParam() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab && typeof showTab === "function") {
    document.addEventListener("DOMContentLoaded", () => showTab(tab), {
      once: true,
    });
  }
})();
