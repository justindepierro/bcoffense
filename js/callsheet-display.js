// ============================================================
// callsheet-display.js — call sheet display options panel + presets
//
// Owns: csSelectAllFields, BUILTIN_PRESETS, loadDisplayPreset,
// saveDisplayPreset, refreshPresetDropdown, manageDisplayPresets,
// deleteDisplayPreset, saveCallSheetDisplayOptions,
// restoreCallSheetDisplayOptions, openDisplayPanel, closeDisplayPanel.
//
// Loaded after callsheet.js and callsheet-render.js.
// ============================================================

// ============ Display Panel (side drawer) ============

function openDisplayPanel() {
  const overlay = document.getElementById("csDisplayPanel");
  if (!overlay) return;
  overlay.classList.add("visible");
  const btn = document.getElementById("csDisplayPanelBtn");
  if (btn) btn.classList.add("active");
  if (typeof openLayer === "function") {
    openLayer(overlay, { id: "cs-display-panel", exclusive: false });
  }
  // Trap focus inside the panel
  const closeBtn = overlay.querySelector(".cs-display-panel-close");
  if (closeBtn) closeBtn.focus();
}

function closeDisplayPanel() {
  const overlay = document.getElementById("csDisplayPanel");
  if (!overlay) return;
  overlay.classList.remove("visible");
  if (typeof closeLayer === "function") closeLayer("cs-display-panel");
  const btn = document.getElementById("csDisplayPanelBtn");
  if (btn) btn.classList.remove("active");
}

// ============ Unified Display Bar Helpers ============

/**
 * Select All / Deselect All field checkboxes
 */
function csSelectAllFields(selectAll) {
  const fieldIds = [
    "callsheetShowNumbers",
    "callsheetShowPersonnel",
    "callsheetShowFormation",
    "callsheetShowFormationTags",
    "callsheetShowBack",
    "callsheetShowProtection",
    "callsheetShowPlayName",
    "callsheetShowTags",
    "callsheetShowMotion",
    "callsheetShowLineCall",
    "callsheetShowEmoji",
    "callsheetUseSquares",
    "callsheetUnderEmoji",
    "callsheetBoldShifts",
    "callsheetRedShifts",
    "callsheetItalicMotions",
    "callsheetRedMotions",
    "callsheetRemoveVowels",
    "callsheetHighlightHuddle",
    "callsheetHighlightCandy",
  ];
  fieldIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = selectAll;
  });
  const oneWordOnlyEl = document.getElementById("callsheetShowOneWordOnly");
  if (oneWordOnlyEl) oneWordOnlyEl.checked = false;
  requestRenderCallSheet();
}

// ============ Display Presets ============

const BUILTIN_PRESETS = {
  __all: {
    name: "Show All Fields",
    opts: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: true,
      callsheetShowBack: true,
      callsheetShowOneWordOnly: false,
      callsheetShowProtection: true,
      callsheetShowPlayName: true,
      callsheetShowTags: true,
      callsheetShowMotion: true,
      callsheetShowLineCall: true,
      callsheetShowEmoji: false,
      callsheetUseSquares: false,
      callsheetUnderEmoji: false,
      callsheetBoldShifts: false,
      callsheetRedShifts: false,
      callsheetItalicMotions: false,
      callsheetRedMotions: false,
      callsheetRemoveVowels: false,
      callsheetHighlightHuddle: false,
      callsheetHighlightCandy: false,
      callsheetRedBorder: "",
      callsheetBlueBorder: "",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "",
      callsheetPurpleBorder: "",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
  __minimal: {
    name: "Minimal",
    opts: {
      callsheetShowNumbers: false,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowOneWordOnly: false,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: false,
      callsheetShowLineCall: false,
      callsheetShowEmoji: true,
      callsheetUseSquares: false,
      callsheetUnderEmoji: false,
      callsheetBoldShifts: false,
      callsheetRedShifts: false,
      callsheetItalicMotions: false,
      callsheetRedMotions: false,
      callsheetRemoveVowels: true,
      callsheetHighlightHuddle: false,
      callsheetHighlightCandy: false,
      callsheetRedBorder: "",
      callsheetBlueBorder: "",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "",
      callsheetPurpleBorder: "",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
  __gameday: {
    name: "Game Day",
    opts: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: true,
      callsheetShowBack: true,
      callsheetShowOneWordOnly: false,
      callsheetShowProtection: true,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: true,
      callsheetShowLineCall: true,
      callsheetShowEmoji: true,
      callsheetUseSquares: true,
      callsheetUnderEmoji: true,
      callsheetBoldShifts: true,
      callsheetRedShifts: false,
      callsheetItalicMotions: true,
      callsheetRedMotions: false,
      callsheetRemoveVowels: false,
      callsheetHighlightHuddle: true,
      callsheetHighlightCandy: true,
      callsheetRedBorder: "run",
      callsheetBlueBorder: "pass",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "rpo",
      callsheetPurpleBorder: "screen",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
  __print_friendly: {
    name: "Print Friendly",
    opts: {
      callsheetShowNumbers: true,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: true,
      callsheetShowBack: true,
      callsheetShowOneWordOnly: false,
      callsheetShowProtection: true,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: true,
      callsheetShowLineCall: true,
      callsheetShowEmoji: false,
      callsheetUseSquares: false,
      callsheetUnderEmoji: false,
      callsheetBoldShifts: true,
      callsheetRedShifts: false,
      callsheetItalicMotions: true,
      callsheetRedMotions: false,
      callsheetRemoveVowels: false,
      callsheetHighlightHuddle: false,
      callsheetHighlightCandy: false,
      callsheetRedBorder: "",
      callsheetBlueBorder: "",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "",
      callsheetPurpleBorder: "",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
  __print_large_3col: {
    name: "Large Print 3-Column",
    opts: {
      callsheetShowNumbers: false,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowOneWordOnly: false,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: false,
      callsheetShowLineCall: true,
      callsheetShowEmoji: false,
      callsheetUseSquares: false,
      callsheetUnderEmoji: false,
      callsheetBoldShifts: false,
      callsheetRedShifts: false,
      callsheetItalicMotions: false,
      callsheetRedMotions: false,
      callsheetRemoveVowels: false,
      callsheetHighlightHuddle: false,
      callsheetHighlightCandy: false,
      callsheetRedBorder: "",
      callsheetBlueBorder: "",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "",
      callsheetPurpleBorder: "",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
  __print_ultra_tight: {
    name: "Print Ultra Tight",
    opts: {
      callsheetShowNumbers: false,
      callsheetShowPersonnel: true,
      callsheetShowFormation: true,
      callsheetShowFormationTags: false,
      callsheetShowBack: false,
      callsheetShowOneWordOnly: false,
      callsheetShowProtection: false,
      callsheetShowPlayName: true,
      callsheetShowTags: false,
      callsheetShowMotion: false,
      callsheetShowLineCall: true,
      callsheetShowEmoji: false,
      callsheetUseSquares: false,
      callsheetUnderEmoji: false,
      callsheetBoldShifts: false,
      callsheetRedShifts: false,
      callsheetItalicMotions: false,
      callsheetRedMotions: false,
      callsheetRemoveVowels: true,
      callsheetHighlightHuddle: false,
      callsheetHighlightCandy: false,
      callsheetRedBorder: "",
      callsheetBlueBorder: "",
      callsheetGreenBorder: "",
      callsheetOrangeBorder: "",
      callsheetPurpleBorder: "",
      callsheetPersonnelBorder: "",
      callsheetPersonnelBorderColor: CS_COLORS.red,
    },
  },
};

/**
 * Load a display preset (built-in or user-saved)
 */
function loadDisplayPreset(presetKey) {
  if (!presetKey) return;

  // Handle manage presets action
  if (presetKey === "__manage") {
    const sel = document.getElementById("csDisplayPreset");
    if (sel) sel.value = "";
    manageDisplayPresets();
    return;
  }

  let opts;
  if (BUILTIN_PRESETS[presetKey]) {
    opts = BUILTIN_PRESETS[presetKey].opts;
  } else {
    // User-saved preset
    const userPresets = storageManager.get(
      STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
      [],
    );
    const preset = userPresets.find((p) => p.key === presetKey);
    if (!preset) {
      showToast("⚠️ Preset not found", { type: "warning" });
      return;
    }
    opts = preset.opts;
  }

  // Apply all options
  CALLSHEET_DISPLAY_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const value =
      opts[id] !== undefined ? opts[id] : CALLSHEET_DISPLAY_DEFAULTS[id];
    if (value === undefined) return;
    if (el.type === "checkbox") {
      el.checked = value;
    } else {
      el.value = value;
    }
  });

  requestRenderCallSheet();

  // Reset the select
  const sel = document.getElementById("csDisplayPreset");
  if (sel) sel.value = "";

  const name = BUILTIN_PRESETS[presetKey]?.name || presetKey;
  showToast(`✅ Loaded "${name}" preset`);
}

/**
 * Save current display options as a named preset
 */
function saveDisplayPreset() {
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Preset name...";
  nameInput.className = "cs-template-name-input";

  const overlay = document.createElement("div");
  overlay.className = "cs-target-popup";
  overlay.innerHTML = `<label><strong>💾 Save Display Preset</strong></label>`;
  overlay.appendChild(nameInput);

  const actions = document.createElement("div");
  actions.className = "cs-target-actions";
  actions.innerHTML = `
    <button class="btn btn-sm btn-primary cs-preset-do-save">Save</button>
    <button class="btn btn-sm cs-preset-do-cancel">Cancel</button>
  `;
  overlay.appendChild(actions);
  document.body.appendChild(overlay);
  nameInput.focus();

  const close = () => overlay.remove();

  const doSave = () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast("⚠️ Enter a name", { type: "warning" });
      return;
    }

    const opts = {};
    CALLSHEET_DISPLAY_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      opts[id] = el.type === "checkbox" ? el.checked : el.value;
    });

    const presets = storageManager.get(
      STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
      [],
    );
    const key = `user_${Date.now()}`;
    presets.push({ key, name, opts, savedAt: new Date().toISOString() });
    storageManager.set(STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS, presets);

    refreshPresetDropdown();
    close();
    showToast(`💾 Saved preset "${name}"`);
  };

  actions.querySelector(".cs-preset-do-save").addEventListener("click", doSave);
  actions
    .querySelector(".cs-preset-do-cancel")
    .addEventListener("click", close);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSave();
    if (e.key === "Escape") close();
  });
}

/**
 * Refresh the preset dropdown to include user-saved presets
 */
function refreshPresetDropdown() {
  const sel = document.getElementById("csDisplayPreset");
  if (!sel) return;

  // Keep built-in options, remove user ones
  const builtInValues = [
    "",
    "__all",
    "__minimal",
    "__gameday",
    "__print_friendly",
    "__print_ultra_tight",
  ];
  [...sel.options].forEach((opt) => {
    if (!builtInValues.includes(opt.value)) opt.remove();
  });

  // Add user presets
  const userPresets = storageManager.get(
    STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
    [],
  );
  if (userPresets.length > 0) {
    const divider = document.createElement("option");
    divider.disabled = true;
    divider.textContent = "── Custom ──";
    sel.appendChild(divider);

    userPresets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = `⭐ ${p.name}`;
      sel.appendChild(opt);
    });

    // Add a "Manage..." option
    const manage = document.createElement("option");
    manage.value = "__manage";
    manage.textContent = "🗑️ Manage Presets...";
    sel.appendChild(manage);
  }

  sel.value = "";
}

/**
 * Open manage presets modal to delete user presets
 */
function manageDisplayPresets() {
  const presets = storageManager.get(
    STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
    [],
  );
  if (presets.length === 0) {
    showToast("No custom presets to manage");
    return;
  }

  const listHtml = presets
    .map((p, idx) => {
      const date = new Date(p.savedAt).toLocaleDateString();
      return `<div class="cs-template-item">
      <div class="cs-template-info"><strong>${escapeHtml(p.name)}</strong><span class="cs-template-date">${date}</span></div>
      <button class="btn btn-sm btn-danger" data-action="deleteDisplayPreset" data-idx="${idx}">✕</button>
    </div>`;
    })
    .join("");

  const overlay = document.createElement("div");
  overlay.id = "csManagePresetsOverlay";
  overlay.className = "cs-sort-overlay";
  overlay.innerHTML = `
    <div class="cs-sort-modal cs-sort-modal-sm">
      <div class="cs-sort-header">
        <h3>🗑️ Manage Display Presets</h3>
        <button class="cs-sort-close" data-action="closeCsManagePresets">&times;</button>
      </div>
      <div class="cs-sort-body"><div class="cs-template-list">${listHtml}</div></div>
      <div class="cs-sort-actions">
        <button class="btn btn-sm" data-action="closeCsManagePresets">Close</button>
      </div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}

function deleteDisplayPreset(idx) {
  const presets = storageManager.get(
    STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
    [],
  );
  const name = presets[idx]?.name || "preset";
  presets.splice(idx, 1);
  storageManager.set(STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS, presets);
  refreshPresetDropdown();
  // Refresh the manage modal
  const overlay = document.getElementById("csManagePresetsOverlay");
  if (overlay) {
    overlay.remove();
    manageDisplayPresets();
  }
  showToast(`🗑️ Deleted "${name}"`);
}

/**
 * Save call sheet display option states to localStorage
 */
function saveCallSheetDisplayOptions() {
  storageManager.set(
    STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS,
    captureCallSheetDisplayState(),
  );
}

/**
 * Restore call sheet display option states from localStorage
 */
function restoreCallSheetDisplayOptions() {
  const opts = storageManager.get(STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS, null);
  applyCallSheetDisplayState(opts);
}

// ── Sideline Mode (#170) ─────────────────────────────────────
// Toggles a read-only presentation view: larger text, editing controls hidden.
let _csSidelineMode = false;

function toggleCsSidelineMode() {
  _csSidelineMode = !_csSidelineMode;
  const panel = document.getElementById("callsheet");
  const btn = document.getElementById("csSidelineModeBtn");
  if (panel) panel.classList.toggle("cs-sideline-mode", _csSidelineMode);
  if (btn) {
    btn.classList.toggle("btn-primary", _csSidelineMode);
    btn.title = _csSidelineMode
      ? "Exit sideline view"
      : "Toggle sideline read-only view (larger text, no editing controls)";
    btn.textContent = _csSidelineMode ? "✏️ Edit View" : "📋 Sideline View";
  }
}
