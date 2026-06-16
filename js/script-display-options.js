const SCRIPT_DISPLAY_CHECKBOX_IDS = [
  "scriptShowEmoji",
  "scriptUseSquares",
  "scriptUnderEmoji",
  "scriptBoldShifts",
  "scriptRedShifts",
  "scriptItalicMotions",
  "scriptRedMotions",
  "scriptRemoveVowels",
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

function saveScriptDisplayOptions() {
  const opts = {};
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) opts[id] = el.checked;
  });
  opts.layoutMode =
    document.querySelector('input[name="scriptLayoutMode"]:checked')?.value ||
    "detail";
  opts.filtersCollapsed = filtersCollapsed;
  storageManager.set(STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS, opts);
}

function restoreScriptDisplayOptions() {
  const opts = storageManager.get(STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS, null);
  if (!opts) return;
  SCRIPT_DISPLAY_CHECKBOX_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && opts[id] !== undefined) el.checked = opts[id];
  });
  const layoutMode = opts.layoutMode === "compact" ? "compact" : "detail";
  const modeEl = document.querySelector(
    `input[name="scriptLayoutMode"][value="${layoutMode}"]`,
  );
  if (modeEl) modeEl.checked = true;
  filtersCollapsed = Boolean(opts.filtersCollapsed);
  applyScriptFiltersCollapsedState();
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
    layoutMode:
      document.querySelector('input[name="scriptLayoutMode"]:checked')?.value ||
      "detail",
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
        "scriptShowPrintPreview",
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

  const modeEl = document.querySelector(
    `input[name="scriptLayoutMode"][value="${preset.layoutMode}"]`,
  );
  if (modeEl) modeEl.checked = true;

  saveScriptDisplayOptions();
  requestRenderScript();
  showToast(`Script preset: ${presetName}`);
}
function toggleScriptDisplayPanel() {
  const overlay = document.getElementById("scriptDisplayOverlay");
  const trigger = document.getElementById("scriptDisplayFab");
  if (!overlay) return;
  const isOpen = overlay.classList.contains("visible");
  if (isOpen) {
    overlay.classList.remove("visible");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("inert", "");
    trigger?.classList.remove("active");
    return;
  }
  overlay.removeAttribute("inert");
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("visible");
  trigger?.classList.add("active");
}

function closeScriptDisplayPanel(event) {
  if (event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById("scriptDisplayOverlay");
  const trigger = document.getElementById("scriptDisplayFab");
  if (!overlay) return;
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  trigger?.classList.remove("active");
}
