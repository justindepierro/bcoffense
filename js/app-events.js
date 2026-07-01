document.addEventListener("click", (e) => {
  if (!e.target.closest(".more-tools-wrap")) {
    document
      .querySelectorAll(".more-tools-wrap.open")
      .forEach((el) => el.classList.remove("open"));
  }
  // Close generic tool-menu dropdowns
  if (!e.target.closest(".tool-menu-wrap")) {
    document.querySelectorAll(".tool-menu-wrap.open").forEach((el) => {
      el.classList.remove("open");
      const trigger = el.querySelector("[data-action='toggleParentOpen']");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (el.hasAttribute("data-anchored") && typeof resetAnchoredMenu === "function") {
        resetAnchoredMenu(el);
      }
    });
  } else if (e.target.closest(".tool-menu")) {
    // Clicking an action inside a tool-menu closes that specific dropdown
    const wrap = e.target.closest(".tool-menu-wrap");
    if (wrap) {
      wrap.classList.remove("open");
      const trigger = wrap.querySelector("[data-action='toggleParentOpen']");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (wrap.hasAttribute("data-anchored") && typeof resetAnchoredMenu === "function") {
        resetAnchoredMenu(wrap);
      }
    }
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
  "quickPlayReadinessScriptScore",
  "updatePlayReadinessReportScore",
  "deletePlayReadinessReport",
  "moveSortCriteria",
  "removeScheduleGame",
  "setScheduleActive",
  "openTendenciesPlayMenu",
  "moveInstallItemUp",
  "moveInstallItemDown",
  "toggleIdentityCard",
]);
const _BOOL_FNS = new Set(["toggleAllPbPrintOptions", "csSelectAllFields"]);

const ACTION_TRACE_ACTIONS = new Set([
  "loadPublishedPlayerScript",
  "presentPublishedPlayerScript",
  "openPlayerCurrentScriptPresentation",
  "openScriptPresentation",
  "openPlaybookPresentation",
  "openSelectedPlaybookPresentation",
  "showTab",
]);

function isAppActionFullTraceEnabled() {
  try {
    return window.BC_ACTION_TRACE === true || localStorage.getItem("bcActionTrace") === "1";
  } catch (_err) {
    return window.BC_ACTION_TRACE === true;
  }
}

function getAppActionHitDiagnostics(element) {
  if (!(element instanceof Element)) return {};
  const rect = element.getBoundingClientRect();
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  const centerX = Math.max(0, Math.min(width - 1, rect.left + rect.width / 2));
  const centerY = Math.max(0, Math.min(height - 1, rect.top + rect.height / 2));
  const topElement =
    width > 0 && height > 0 ? document.elementFromPoint(centerX, centerY) : null;
  const computed = window.getComputedStyle(element);
  return {
    actionRect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    actionStyle: {
      display: computed.display,
      visibility: computed.visibility,
      pointerEvents: computed.pointerEvents,
      opacity: computed.opacity,
    },
    topElement: topElement
      ? {
        tag: topElement.tagName.toLowerCase(),
        id: topElement.id || "",
        action: topElement.closest("[data-action]")?.dataset.action || "",
        className: String(topElement.className || "").slice(0, 120),
        receivesPoint:
          topElement === element ||
          element.contains(topElement) ||
          topElement.closest("[data-action]") === element,
      }
      : null,
    hitStack: getAppElementsFromPointDiagnostics(centerX, centerY),
  };
}

function getAppActionTracePayload(el, extra = {}) {
  const element = el instanceof Element ? el : null;
  const includeHitDiagnostics =
    extra.includeHitDiagnostics || isAppActionFullTraceEnabled();
  return {
    action: element?.dataset?.action || "",
    arg: element?.dataset?.arg,
    idx: element?.dataset?.idx,
    sid: element?.dataset?.sid,
    id: element?.id || "",
    className: element?.className || "",
    text: String(element?.textContent || "").trim().slice(0, 80),
    disabled: Boolean(element?.disabled),
    hidden: Boolean(element?.hidden),
    authRole: document.body?.dataset.authRole || "",
    activeTab:
      typeof currentActiveTab !== "undefined"
        ? currentActiveTab
        : document.body?.dataset.activeTab || "",
    ...(includeHitDiagnostics ? getAppActionHitDiagnostics(element) : {}),
    ...extra,
  };
}

function shouldTraceAppAction(action) {
  if (isAppActionFullTraceEnabled()) return true;
  try {
    const targeted = Array.isArray(window.BC_ACTION_TRACE_ACTIONS)
      ? window.BC_ACTION_TRACE_ACTIONS
      : [];
    return targeted.includes(action);
  } catch (_err) {
    return false;
  }
}

function traceAppAction(phase, elOrPayload, extra = {}, level = "info") {
  const payload =
    elOrPayload instanceof Element
      ? getAppActionTracePayload(elOrPayload, extra)
      : { ...(elOrPayload || {}), ...extra };
  const action = payload.action || payload.phaseAction || "";
  if (!shouldTraceAppAction(action) && level === "info") return;
  const logger =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  logger.call(console, `[BC action trace] ${phase}`, payload);
  window.__bcLastActionTrace = {
    phase,
    payload,
    timestamp: new Date().toISOString(),
  };
}

function getAppElementDescriptor(element) {
  if (!(element instanceof Element)) return null;
  const computed = window.getComputedStyle(element);
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || "",
    action: element.closest("[data-action]")?.dataset.action || "",
    className: String(element.className || "").slice(0, 140),
    display: computed.display,
    visibility: computed.visibility,
    pointerEvents: computed.pointerEvents,
    opacity: computed.opacity,
    position: computed.position,
    zIndex: computed.zIndex,
  };
}

function getAppElementsFromPointDiagnostics(x, y) {
  if (!document.elementsFromPoint) return [];
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  const safeX = Math.max(0, Math.min(width - 1, Math.round(Number(x) || 0)));
  const safeY = Math.max(0, Math.min(height - 1, Math.round(Number(y) || 0)));
  return document
    .elementsFromPoint(safeX, safeY)
    .slice(0, 10)
    .map(getAppElementDescriptor)
    .filter(Boolean);
}

function getAppEventClientPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  return {
    x: Math.round(touch?.clientX ?? event.clientX ?? 0),
    y: Math.round(touch?.clientY ?? event.clientY ?? 0),
  };
}

function traceAppInputEvent(phase, event) {
  if (!isAppActionFullTraceEnabled()) return;
  const target =
    event.target instanceof Element ? event.target.closest("[data-action]") : null;
  const point = getAppEventClientPoint(event);
  const payload = target
    ? getAppActionTracePayload(target, {
      eventType: event.type,
      eventPhase: event.eventPhase,
      pointerType: event.pointerType || "",
      isTrusted: event.isTrusted,
      defaultPrevented: event.defaultPrevented,
      clientX: point.x,
      clientY: point.y,
      includeHitDiagnostics: true,
    })
    : {
      action: "",
      eventType: event.type,
      eventPhase: event.eventPhase,
      pointerType: event.pointerType || "",
      isTrusted: event.isTrusted,
      defaultPrevented: event.defaultPrevented,
      clientX: point.x,
      clientY: point.y,
      hitStack: getAppElementsFromPointDiagnostics(point.x, point.y),
    };
  traceAppAction(phase, payload);
}

function getAppScrollAncestry(targetOrSelector = "#script") {
  const start =
    typeof targetOrSelector === "string"
      ? document.querySelector(targetOrSelector)
      : targetOrSelector;
  const rows = [];
  let element = start instanceof Element ? start : null;
  while (element) {
    const computed = window.getComputedStyle(element);
    rows.push({
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      className: String(element.className || "").slice(0, 120),
      overflowX: computed.overflowX,
      overflowY: computed.overflowY,
      position: computed.position,
      height: Math.round(element.getBoundingClientRect().height),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
    });
    element = element.parentElement;
  }
  return rows;
}

if (typeof window !== "undefined") {
  window.bcDebugHitTest = function bcDebugHitTest(x, y) {
    const point =
      Number.isFinite(Number(x)) && Number.isFinite(Number(y))
        ? { x: Number(x), y: Number(y) }
        : {
          x: Math.round((window.innerWidth || 0) / 2),
          y: Math.round((window.innerHeight || 0) / 2),
        };
    const rows = getAppElementsFromPointDiagnostics(point.x, point.y);
    console.table(rows);
    return rows;
  };
  window.bcDebugScrollAncestry = function bcDebugScrollAncestry(targetOrSelector) {
    const rows = getAppScrollAncestry(targetOrSelector || "#script");
    console.table(rows);
    return rows;
  };
}

["pointerdown", "pointerup", "touchstart", "touchend", "click"].forEach(
  (eventName) => {
    document.addEventListener(
      eventName,
      (event) => traceAppInputEvent(`${eventName} capture`, event),
      { capture: true, passive: true },
    );
  },
);

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  traceAppAction("click received", el, {
    nativeEvent: e.type,
    isTrusted: e.isTrusted,
    defaultPrevented: e.defaultPrevented,
    includeHitDiagnostics: window.BC_ACTION_TRACE === true,
  });

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
    const willOpen = !wrap.classList.contains("open");
    wrap.classList.toggle("open");
    const triggerBtn = wrap.querySelector("[data-action='toggleParentOpen']");
    if (triggerBtn) triggerBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (wrap.hasAttribute("data-anchored")) {
      if (willOpen && typeof positionAnchoredMenu === "function") positionAnchoredMenu(wrap);
      else if (!willOpen && typeof resetAnchoredMenu === "function") resetAnchoredMenu(wrap);
    }
    return;
  }
  if (action === "removeParentOpen") {
    const wrap = el.parentElement;
    wrap.classList.remove("open");
    const triggerBtn = wrap.querySelector("[data-action='toggleParentOpen']");
    if (triggerBtn) triggerBtn.setAttribute("aria-expanded", "false");
    if (wrap.hasAttribute("data-anchored") && typeof resetAnchoredMenu === "function") {
      resetAnchoredMenu(wrap);
    }
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
    case "loadPublishedPlayerScript":
      traceAppAction("dispatch loadPublishedPlayerScript", el);
      loadPublishedPlayerScript(el.dataset.arg);
      return;
    case "presentPublishedPlayerScript":
      traceAppAction("dispatch presentPublishedPlayerScript", el);
      presentPublishedPlayerScript(el.dataset.arg);
      return;
    case "openPlayerCurrentScriptPresentation":
      traceAppAction("dispatch openPlayerCurrentScriptPresentation", el);
      openPlayerCurrentScriptPresentation(el.dataset.arg || "");
      return;
    case "openScriptPresentation": {
      const idx = parseInt(el.dataset.idx, 10);
      traceAppAction("dispatch openScriptPresentation", el, { idx });
      openScriptPresentation(Number.isNaN(idx) ? undefined : idx);
      return;
    }
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
    case "selectTendenciesOpponent":
      selectTendenciesOpponent(parseInt(el.dataset.idx, 10));
      return;
    case "renameTendenciesOpponent":
      renameTendenciesOpponent(parseInt(el.dataset.idx, 10));
      return;
    case "deleteTendenciesOpponent":
      deleteTendenciesOpponent(parseInt(el.dataset.idx, 10));
      return;
    case "exportSingleOpponentCSV":
      exportSingleOpponentCSV(parseInt(el.dataset.idx, 10));
      return;
    case "setAsActiveOpponent":
      setAsActiveOpponent(parseInt(el.dataset.idx, 10));
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

  // Don't fire toggleCollapsiblePanel when the click originated inside a
  // form control (e.g. the preset <select> inside .cs-unified-header).
  if (action === "toggleCollapsiblePanel" && e.target !== el &&
    e.target.closest("select, input, textarea")) {
    return;
  }

  const fn = window[action];
  if (typeof fn !== "function") {
    traceAppAction(
      "missing action handler",
      getAppActionTracePayload(el, { handlerType: typeof fn }),
      {},
      "warn",
    );
    return;
  }

  const arg = el.dataset.arg;
  let result;
  if (arg !== undefined && _ELEMENT_FNS.has(action)) {
    result = fn(arg, el);
  } else if (arg !== undefined && _BOOL_FNS.has(action)) {
    result = fn(arg === "true");
  } else if (arg !== undefined) {
    result = fn(arg);
  } else if (_ELEMENT_FNS.has(action)) {
    result = fn(el);
  } else {
    result = fn();
  }

  if (result === false || result === null) {
    traceAppAction(
      "action returned no-op",
      el,
      { result },
      "warn",
    );
  } else {
    traceAppAction("action dispatched", el, { result });
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

document.addEventListener("DOMContentLoaded", () => {
  if (typeof initScriptEvents === "function") {
    initScriptEvents();
  }

  const pbBody = document.querySelector("#playbookTable tbody");
  if (pbBody) {
    pbBody.addEventListener("click", (e) => {
      const presentBtn = e.target.closest(
        "[data-action='openPlaybookPresentation']",
      );
      if (presentBtn) {
        e.stopPropagation();
        openPlaybookPresentation(parseInt(presentBtn.dataset.idx, 10));
        return;
      }
      const gpBtn = e.target.closest("[data-action='togglePlaybookGamePlan']");
      if (gpBtn) {
        e.stopPropagation();
        togglePlaybookGamePlan(parseInt(gpBtn.dataset.idx, 10));
        return;
      }
      const clipBtn = e.target.closest("[data-action='openPlaybookClipViewer']");
      if (clipBtn) {
        e.stopPropagation();
        if (typeof openPlaybookClipViewer === "function") {
          openPlaybookClipViewer(clipBtn.dataset.arg);
        }
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
        openPlaybookPresentation(rowIdx);
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
  document.body.addEventListener("dragend", (e) => {
    const el = e.target.closest("[data-drag='pbSort']");
    if (el && typeof _pbSortDragEnd === "function") {
      _pbSortDragEnd(e);
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
  if (
    typeof getCurrentAuthUser === "function" &&
    getCurrentAuthUser()?.role === "player"
  ) {
    return;
  }
  const play = script[idx];
  const hasCustomTags =
    getSharedCustomTagEntries(play.scriptFormationTags).length > 0 ||
    getSharedCustomTagEntries(play.scriptBackTags).length > 0;
  const menuItems = [
    {
      label: "▶ Present Play",
      action: () => openScriptPresentation(idx),
    },
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
    {
      label: "📖 View in Playbook",
      action: () => {
        if (typeof jumpToPlayInPlaybook === "function") jumpToPlayInPlaybook(idx);
      },
    },
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
  const menu = [
    {
      label: "▶ Present Play",
      action: () => openPlaybookPresentation(filteredIdx),
    },
    { label: "📋 Copy Play Name", action: () => copyPlayName(play.play) },
  ];

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
  const fns = raw.split(";").map((name) => name.trim()).filter(Boolean);
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
