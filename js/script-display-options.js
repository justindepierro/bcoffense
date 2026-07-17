const SCRIPT_DISPLAY_CHECKBOX_IDS = [
  "scriptShowEmoji",
  "scriptUseSquares",
  "scriptUnderEmoji",
  "scriptBoldShifts",
  "scriptRedShifts",
  "scriptItalicMotions",
  "scriptRedMotions",
  "scriptRemoveVowels",
  "scriptForceUppercase",
  "scriptShowLineCall",
  "scriptShowOneWordOnly",
  "scriptHighlightHuddle",
  "scriptHighlightCandy",
  "scriptShowWbNum",
  "scriptHidePersonnel",
  "scriptHideLinemen",
  "scriptPrintStyle",
  "scriptShowPrintPreview",
];

function normalizeScriptLayoutMode(layoutMode) {
  return layoutMode === "compact" ? "compact" : "detail";
}

// The root marker is the CSS authority for the selected coach layout. The
// radios remain the accessible control and storage stays in display options.
function applyScriptLayoutMode(layoutMode) {
  const normalized = normalizeScriptLayoutMode(layoutMode);
  const scriptPanel = document.getElementById("script");
  if (scriptPanel) scriptPanel.dataset.layoutMode = normalized;

  const modeEl = document.querySelector(
    `input[name="scriptLayoutMode"][value="${normalized}"]`,
  );
  if (modeEl) modeEl.checked = true;
  return normalized;
}

function setScriptLayoutMode(layoutMode) {
  applyScriptLayoutMode(layoutMode);
  saveScriptDisplayOptions();
  requestRenderScript();
}

function saveScriptDisplayOptions() {
  const opts = {};
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) opts[id] = el.checked;
  });
  opts.layoutMode = applyScriptLayoutMode(
    document.querySelector('input[name="scriptLayoutMode"]:checked')?.value,
  );
  opts.filtersCollapsed = filtersCollapsed;
  opts.coachGridLibraryVersion = 1;
  opts.playRailCollapsed = scriptPlayRailCollapsed;
  opts.libraryPinned = scriptLibraryPinned;
  // Preview rows are now a deliberate, preview-only surface. This marker lets
  // existing saved display settings return to the normal editing grid once.
  opts.previewRowsVersion = 2;
  opts.lastSortField = document.getElementById("scriptSortField")?.value || "";
  storageManager.set(STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS, opts);
}

function restoreScriptDisplayOptions() {
  const opts = storageManager.get(STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS, null);
  if (!opts) {
    applyScriptLayoutMode("detail");
    applyScriptPlayRailState();
    applyScriptLibraryPinState();
    closeScriptToolsDrawer();
    return;
  }
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && opts[id] !== undefined) el.checked = opts[id];
  });
  applyScriptLayoutMode(opts.layoutMode);
  const needsCoachGridLibraryDefault = opts.coachGridLibraryVersion !== 1;
  filtersCollapsed = needsCoachGridLibraryDefault ? true : Boolean(opts.filtersCollapsed);
  if (needsCoachGridLibraryDefault) opts.coachGridLibraryVersion = 1;
  scriptPlayRailCollapsed = Boolean(opts.playRailCollapsed);
  scriptLibraryPinned = Boolean(opts.libraryPinned);
  let shouldSaveUpdatedOptions = needsCoachGridLibraryDefault;
  if (opts.previewRowsVersion !== 2) {
    const previewRows = document.getElementById("scriptShowPrintPreview");
    if (previewRows) previewRows.checked = false;
    opts.previewRowsVersion = 2;
    shouldSaveUpdatedOptions = true;
  }
  if (opts.lastSortField) {
    const sortSel = document.getElementById("scriptSortField");
    if (sortSel) sortSel.value = opts.lastSortField;
  }
  if (shouldSaveUpdatedOptions) storageManager.set(STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS, opts);
  applyScriptFiltersCollapsedState();
  applyScriptPlayRailState();
  applyScriptLibraryPinState();
  closeScriptToolsDrawer();
}

function getScriptDisplayOptions() {
  const opts = {
    showEmoji: document.getElementById("scriptShowEmoji")?.checked || false,
    useSquares: document.getElementById("scriptUseSquares")?.checked || false,
    underEmoji: document.getElementById("scriptUnderEmoji")?.checked || false,
    boldShifts:
      document.getElementById("scriptBoldShifts")?.checked || false,
    redShifts: document.getElementById("scriptRedShifts")?.checked || false,
    italicMotions:
      document.getElementById("scriptItalicMotions")?.checked || false,
    redMotions:
      document.getElementById("scriptRedMotions")?.checked || false,
    noVowels:
      document.getElementById("scriptRemoveVowels")?.checked || false,
    forceUppercase:
      document.getElementById("scriptForceUppercase")?.checked || false,
    showLineCall:
      document.getElementById("scriptShowLineCall")?.checked !== false,
    showOneWordOnly:
      document.getElementById("scriptShowOneWordOnly")?.checked || false,
    highlightHuddle:
      document.getElementById("scriptHighlightHuddle")?.checked || false,
    highlightCandy:
      document.getElementById("scriptHighlightCandy")?.checked || false,
    showWbNum: document.getElementById("scriptShowWbNum")?.checked !== false,
    hidePersonnel:
      document.getElementById("scriptHidePersonnel")?.checked || false,
    hideLinemen:
      document.getElementById("scriptHideLinemen")?.checked || false,
    printStyle:
      document.getElementById("scriptPrintStyle")?.checked || false,
    layoutMode: applyScriptLayoutMode(
      document.querySelector('input[name="scriptLayoutMode"]:checked')?.value,
    ),
  };
  const currentUser =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (currentUser?.role !== "player") return opts;

  return {
    ...opts,
    showLineCall: true,
    showOneWordOnly: false,
    showWbNum: true,
    hidePersonnel: true,
    hideLinemen: false,
    printStyle: false,
    layoutMode: "detail",
  };
}

function selectAllScriptOptions() {
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });
  const oneWordOnlyEl = document.getElementById("scriptShowOneWordOnly");
  if (oneWordOnlyEl) oneWordOnlyEl.checked = false;
  saveScriptDisplayOptions();
  requestRenderScript();
}

function clearAllScriptOptions() {
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  const detailEl = document.querySelector(
    'input[name="scriptLayoutMode"][value="detail"]',
  );
  if (detailEl) detailEl.checked = true;
  applyScriptLayoutMode("detail");
  saveScriptDisplayOptions();
  requestRenderScript();
}

function applyScriptDisplayPreset(presetName = "coach") {
  const presetMap = {
    coach: {
      layoutMode: "detail",
      checked: ["scriptShowLineCall", "scriptShowWbNum"],
    },
    compact: {
      layoutMode: "compact",
      checked: [
        "scriptShowLineCall",
        "scriptShowWbNum",
        "scriptHideLinemen",
        "scriptPrintStyle",
      ],
    },
    "print-match": {
      layoutMode: "detail",
      checked: [
        "scriptShowLineCall",
        "scriptShowWbNum",
        "scriptPrintStyle",
      ],
    },
  };

  const preset =
    presetMap[String(presetName || "coach").trim().toLowerCase()] ||
    presetMap.coach;
  const enabled = new Set(preset.checked);

  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = enabled.has(id);
  });

  applyScriptLayoutMode(preset.layoutMode);

  saveScriptDisplayOptions();
  requestRenderScript();
  showToast(`Script preset: ${presetName}`);
}

function setScriptDisplayPanelTriggerState(isOpen) {
  ["scriptDisplayFab", "scriptDisplayToggle"].forEach((id) => {
    const trigger = document.getElementById(id);
    if (!trigger) return;
    trigger.classList.toggle("active", isOpen);
    trigger.classList.toggle("is-active", isOpen);
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

function setScriptDisplayPanelOpen(isOpen) {
  const overlay = document.getElementById("scriptDisplayOverlay");
  if (!overlay) return;
  if (isOpen) {
    overlay.removeAttribute("inert");
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("visible");
    if (typeof closeScriptToolsDrawer === "function") closeScriptToolsDrawer();
    setScriptDisplayPanelTriggerState(true);
    return;
  }
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  setScriptDisplayPanelTriggerState(false);
}

function toggleScriptDisplayPanel() {
  const overlay = document.getElementById("scriptDisplayOverlay");
  setScriptDisplayPanelOpen(!overlay?.classList.contains("visible"));
}

function closeScriptDisplayPanel(event) {
  if (event && event.target !== event.currentTarget) return;
  setScriptDisplayPanelOpen(false);
}
