// Script-specific delegated events extracted from app-events.js.
// Keeps global app-events focused on cross-module routing.

function wireScriptPeriodDrag(container) {
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

function initScriptEvents() {
  const scriptEl = document.getElementById("scriptPlays");
  if (scriptEl) {
    const SCRIPT_FIELD_DEBOUNCE_MS = 120;
    const scriptInputTimers = new Map();
    const queueScriptFieldUpdate = (idx, field, fn) => {
      const key = `${idx}:${field}`;
      clearTimeout(scriptInputTimers.get(key));
      scriptInputTimers.set(
        key,
        setTimeout(() => {
          scriptInputTimers.delete(key);
          fn();
        }, SCRIPT_FIELD_DEBOUNCE_MS),
      );
    };
    const flushScriptFieldUpdate = (idx, field) => {
      const key = `${idx}:${field}`;
      clearTimeout(scriptInputTimers.get(key));
      scriptInputTimers.delete(key);
    };

    const scriptChangeFieldHandlers = {
      hash: ({ idx, el }) => updateHash(idx, el.value),
      defFront: ({ idx, el }) => updateDefField(idx, "defFront", el.value),
      defCoverage: ({ idx, el }) => updateDefField(idx, "defCoverage", el.value),
      defStunt: ({ idx, el }) => updateDefField(idx, "defStunt", el.value),
      defBlitz: ({ idx, el }) => updateDefField(idx, "defBlitz", el.value),
      shift: ({ idx, el }) => updateScriptCallField(idx, "shift", el.value),
      motion: ({ idx, el }) => updateScriptCallField(idx, "motion", el.value),
      reps: ({ idx, el }) => updateReps(idx, el.value),
      notes: ({ idx, el }) => updateNotes(idx, el.value),
      playerAssignment: ({ idx, el }) =>
        updateScriptPlayerAssignment(idx, el.dataset.slot, el.value),
      scriptSubPackage: ({ idx, el }) => applyScriptSubPackage(idx, el.value),
      bulkSelect: ({ idx }) => toggleBulkSelect(idx),
      periodColor: ({ idx, el }) => updatePeriodColor(idx, el),
      periodLabel: ({ idx, el }) => updatePeriodLabel(idx, el.value, false),
      periodNotes: ({ idx, el }) => updatePeriodNotes(idx, el.value, false),
      periodMinutes: ({ idx, el }) => updatePeriodMinutes(idx, el),
    };

    const scriptLiveFieldHandlers = {
      notes: ({ idx, el }) => updateNotes(idx, el.value),
      defFront: ({ idx, el }) => updateDefField(idx, "defFront", el.value),
      defCoverage: ({ idx, el }) => updateDefField(idx, "defCoverage", el.value),
      defStunt: ({ idx, el }) => updateDefField(idx, "defStunt", el.value),
      defBlitz: ({ idx, el }) => updateDefField(idx, "defBlitz", el.value),
      shift: ({ idx, el }) => updateScriptCallField(idx, "shift", el.value),
      motion: ({ idx, el }) => updateScriptCallField(idx, "motion", el.value),
      periodLabel: ({ idx, el }) => updatePeriodLabel(idx, el.value, true),
      periodNotes: ({ idx, el }) => updatePeriodNotes(idx, el.value, true),
    };

    scriptEl.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      const idx = parseInt(el.dataset.idx, 10);
      const rawDir = el.dataset.dir;
      const dir = parseInt(rawDir, 10);
      switch (action) {
        case "openScriptPresentation":
          traceAppAction("script row open presentation", el, { idx });
          openScriptPresentation(idx);
          break;
        case "openScriptMoveMenu":
          openScriptMoveMenu(e, idx);
          break;
        case "openScriptPersonnelOverrideModal":
          // A button inside the native <summary> must not also toggle the
          // assignment details while it opens the script-only color picker.
          e.preventDefault();
          openScriptPersonnelOverrideModal(idx);
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
      if (Number.isNaN(idx)) return;
      flushScriptFieldUpdate(idx, field);
      const handler = scriptChangeFieldHandlers[field];
      if (!handler) return;
      handler({ idx, el });
    });

    scriptEl.addEventListener("input", (e) => {
      const el = e.target;
      const field = el.dataset.field;
      if (!field) return;
      const idx = parseInt(el.dataset.idx, 10);
      if (Number.isNaN(idx)) return;

      const isBulkContext =
        bulkSelectedIndices.length > 1 && bulkSelectedIndices.includes(idx);

      if (
        isBulkContext &&
        ["notes", "defFront", "defCoverage", "defStunt", "defBlitz", "shift", "motion"].includes(field)
      ) {
        return;
      }

      const handler = scriptLiveFieldHandlers[field];
      if (!handler) return;
      queueScriptFieldUpdate(idx, field, () => handler({ idx, el }));
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

  wireScriptPeriodDrag(document.getElementById("scriptTimeline"));

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
}

window.initScriptEvents = initScriptEvents;
