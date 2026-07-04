// ============================================================
// page-actions.js — shared "Actions" hub for content pages.
//
// One consistent Load / Save / Print / Display surface per page.
// Each page registers verbs that call EXISTING global functions —
// this is routing, not a rebuild.
//
// Public globals (data-action):
//   openPageActions()            open the hub for the active page
//   closePageActions()           close it (also backdrop via *Overlay)
//   runPageAction(arg)           run a verb by "verb:i" / "extra:i"
//   pageActionsBack()            return to the root verb grid
//   loadScriptFromActions(id)    load a saved script + close
//   openScriptDayTemplatesFromActions()
//
// Loaded after app-command.js. Reads currentActiveTab / body.dataset.
// ============================================================

const PAGE_ACTIONS_CONFIG = {
  script: {
    title: "Practice Script",
    verbs: [
      { icon: "📂", label: "Load", keepOpen: true, run: openScriptLoadView },
      { icon: "💾", label: "Save", run: () => _paCall("saveScript") },
      { icon: "🖨️", label: "Print", run: () => _paCall("generatePDF") },
      { icon: "⚙️", label: "Display", sublabel: _paScriptDisplayStatus, run: () => _paCall("toggleScriptDisplayPanel") },
    ],
    extras: [
      { icon: "🗂️", label: "Print Packet", run: () => _paCall("openScriptPacketBuilder") },
      { icon: "▶️", label: "Present", run: () => _paCall("openScriptPresentation") },
      { icon: "🎯", label: "Send to Game Plan", run: () => _paCall("sendScriptToGamePlan") },
      { icon: "🃏", label: "Send to Wristband", run: () => _paCall("sendScriptToWristband") },
      { icon: "📄", label: "Send to Call Sheet", run: () => _paCall("sendScriptToCallSheet") },
      { icon: "🖨️", label: "Print Studio", run: () => _paCall("openPrintStudio") },
    ],
  },

  callsheet: {
    title: "Call Sheet",
    verbs: [
      { icon: "📂", label: "Load", run: () => _paCall("openLoadCallSheetModal") },
      { icon: "💾", label: "Save", run: () => _paCall("saveCallSheetTemplate") },
      { icon: "🖨️", label: "Print", run: () => _paCall("printCallSheet") },
      { icon: "⚙️", label: "Display", sublabel: _paCallsheetDisplayStatus, run: () => _paCall("openDisplayPanel") },
    ],
    extras: [
      { icon: "⚡", label: "Auto-Populate", run: () => _paCall("autoPopulateCallSheet") },
      { icon: "📁", label: "Saved Call Sheets", run: () => _paCall("openTemplatesModal", "manage") },
      { icon: "📋", label: "Load Wristband", run: () => _paCall("openLoadWristbandModal") },
      { icon: "🎯", label: "Scouting Intel", run: () => _paCall("toggleScoutingOverlay") },
      { icon: "📋", label: "Sideline View", run: () => _paCall("toggleCsSidelineMode") },
      { icon: "📄", label: "Export CSV", run: () => _paCall("exportCallSheetCSV") },
      { icon: "🗑️", label: "Clear Sheet", run: () => _paCall("clearCallSheet") },
    ],
  },

  wristband: {
    title: "Wristband",
    verbs: [
      { icon: "📂", label: "Load", run: () => _paCall("openSavedWristbandManager") },
      { icon: "💾", label: "Save", run: () => _paCall("saveWristband") },
      { icon: "🖨️", label: "Print", run: () => _paCall("printWristband") },
      { icon: "🎨", label: "Appearance", sublabel: _paWristbandDisplayStatus, run: () => openWristbandAppearance() },
      { icon: "⚙️", label: "Display Options", run: () => openWbDisplayPanel() },
      { icon: "🔀", label: "Sort & Organize", run: () => openWbSortPanel() },
    ],
    extras: [
      { icon: "⚡", label: "Auto-Fill", run: () => _paCall("autoFillWristband") },
      { icon: "🧠", label: "Smart Fill", run: () => _paCall("smartFillBySituation") },
      { icon: "🔍", label: "Find/Replace", run: () => _paCall("openWbFindReplaceModal") },
      { icon: "🃏", label: "Player Wristband", run: () => _paCall("startPlayerWristband") },
      { icon: "🎯", label: "Create from Game Plan", run: () => _paCall("createWristbandCardFromGamePlan") },
      { icon: "📋", label: "Create from Script", run: () => _paCall("createWristbandCardFromScript") },
      { icon: "🔄", label: "Reconcile with Source", run: () => _paCall("reconcileWristbandWithSource") },
      { icon: "📂", label: "Load Templates", run: () => _paCall("openWristbandTemplatesMenu") },
      { icon: "💾", label: "Save Template", run: () => _paCall("saveWristbandTemplate") },
      { icon: "💾", label: "Save As", run: () => _paCall("saveWristbandAs") },
      { icon: "📄", label: "Send to Call Sheet", run: () => _paCall("sendWristbandToCallSheet") },
      { icon: "🎯", label: "Send to Game Plan", run: () => _paCall("sendWristbandToGamePlan") },
      { icon: "🖼️", label: "Logo Card", run: () => _paCall("openWbLogoCardModal") },
      { icon: "📊", label: "Export CSV", run: () => _paCall("exportWristbandCSV") },
      { icon: "🗑️", label: "Clear", run: () => _paCall("clearWristband") },
      { icon: "❓", label: "Help", run: () => _paCall("showWbShortcutHelp") },
    ],
  },

  gameplan: {
    title: "Game Plan",
    verbs: [
      { icon: "📂", label: "Load", run: () => _paCall("openGamePlanSnapshotsMenu") },
      { icon: "💾", label: "Save", run: () => _paCall("saveGamePlanSnapshot") },
      { icon: "🖨️", label: "Print", run: () => _paCall("openGamePlanPrintModal") },
      { icon: "⚙️", label: "Density", run: () => _paCall("cycleGamePlanDensity") },
    ],
    extras: [
      { icon: "🧠", label: "Build Plan", run: () => _paCall("openSmartGamePlanBuilder") },
      { icon: "➡️", label: "Send to Call Sheet", run: () => _paCall("pushGamePlanToCallSheet") },
      { icon: "📋", label: "Send to Script", run: () => _paCall("pushGamePlanToScript") },
      { icon: "🃏", label: "Send to Wristband", run: () => _paCall("pushGamePlanToWristband") },
      { icon: "📋", label: "Create Script", run: () => _paCall("createScriptFromGamePlan") },
      { icon: "🛡️", label: "Constraints", run: () => _paCall("runConstraintCheck") },
      { icon: "💾", label: "Save Template", run: () => _paCall("saveGamePlanTemplate") },
      { icon: "📂", label: "Templates", run: () => _paCall("openGamePlanTemplatesMenu") },
      { icon: "🔁", label: "Compare Plans", run: () => _paCall("openGamePlanCompare") },
      { icon: "📊", label: "Variety", run: () => _paCall("openGamePlanStats") },
      { icon: "🗺️", label: "Coverage", run: () => _paCall("openGamePlanCoverageMatrix") },
      { icon: "🎯", label: "vs Defense", run: () => _paCall("openGamePlanTendencyMirror") },
      { icon: "➕", label: "Add Bucket", run: () => _paCall("openGamePlanAddBucket") },
      { icon: "🔀", label: "Reorder Boxes", run: () => _paCall("openGamePlanReorderBoxes") },
      { icon: "👁️", label: "Manage Boxes", run: () => _paCall("openGamePlanManageBoxes") },
      { icon: "�", label: "Build WB Card", run: () => _paCall("sendGamePlanToWristbandCard") },
      { icon: "⌨️", label: "Shortcuts", run: () => _paCall("openGamePlanShortcutsHelp") },
      { icon: "�🗑️", label: "Clear Board", run: () => _paCall("clearGamePlanBoard") },
    ],
  },
};

function _paCall(name, ...args) {
  if (typeof window[name] === "function") return window[name](...args);
  return undefined;
}

function getActivePageActionsKey() {
  const fromBody = document.body?.dataset?.activeTab || "";
  if (fromBody) return fromBody;
  return typeof currentActiveTab !== "undefined" ? currentActiveTab : "";
}

function openPageActions() {
  const key = getActivePageActionsKey();
  const config = PAGE_ACTIONS_CONFIG[key];
  const overlay = document.getElementById("pageActionsSheet");
  if (!overlay) return;
  if (!config) {
    if (typeof showToast === "function") {
      showToast("No quick actions on this page yet.");
    }
    return;
  }
  renderPageActionsRoot(config);
  overlay.hidden = false;
  overlay.removeAttribute("inert");
  overlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => overlay.classList.add("visible"));
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closePageActions() {
  const overlay = document.getElementById("pageActionsSheet");
  if (!overlay) return;
  overlay.classList.remove("visible");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("inert", "");
  setTimeout(() => {
    overlay.hidden = true;
  }, 180);
}

function renderPageActionsRoot(config) {
  const titleEl = document.getElementById("pageActionsTitle");
  const bodyEl = document.getElementById("pageActionsBody");
  if (titleEl) titleEl.textContent = `${config.title} actions`;
  if (!bodyEl) return;

  let html = '<div class="page-actions-grid">';
  (config.verbs || []).forEach((verb, index) => {
    let sub = "";
    if (typeof verb.sublabel === "function") {
      try {
        sub = verb.sublabel() || "";
      } catch (e) {
        sub = "";
      }
    }
    html += `<button type="button" class="page-actions-tile" data-action="runPageAction" data-arg="verb:${index}">
      <span class="page-actions-tile__icon" aria-hidden="true">${verb.icon || ""}</span>
      <span class="page-actions-tile__label">${escapeHtml(verb.label)}</span>
      ${sub ? `<span class="page-actions-tile__sub">${escapeHtml(sub)}</span>` : ""}
    </button>`;
  });
  html += "</div>";

  if ((config.extras || []).length) {
    html += '<div class="page-actions-extra-label">More</div>';
    html += '<div class="page-actions-extra">';
    config.extras.forEach((verb, index) => {
      html += `<button type="button" class="page-actions-extra__item" data-action="runPageAction" data-arg="extra:${index}">
        <span aria-hidden="true">${verb.icon || ""}</span> ${escapeHtml(verb.label)}
      </button>`;
    });
    html += "</div>";
  }

  // Direct innerHTML: content contains <button> which sanitizeHTML would strip.
  // All interpolated labels are escaped above.
  bodyEl.innerHTML = html;
}

function runPageAction(arg) {
  const config = PAGE_ACTIONS_CONFIG[getActivePageActionsKey()];
  if (!config || !arg) return;
  const [kind, idxStr] = String(arg).split(":");
  const index = parseInt(idxStr, 10);
  const list = kind === "extra" ? config.extras : config.verbs;
  const verb = list && list[index];
  if (!verb || typeof verb.run !== "function") return;

  if (verb.keepOpen) {
    verb.run();
    return;
  }
  closePageActions();
  // Let the sheet close before running (some verbs open their own overlay).
  setTimeout(() => verb.run(), 60);
}

function pageActionsBack() {
  const config = PAGE_ACTIONS_CONFIG[getActivePageActionsKey()];
  if (config) renderPageActionsRoot(config);
}

// ── Script "Load" submenu ─────────────────────────────────────────────────
function openScriptLoadView() {
  const titleEl = document.getElementById("pageActionsTitle");
  const bodyEl = document.getElementById("pageActionsBody");
  if (!bodyEl) return;
  if (titleEl) titleEl.textContent = "Load practice script";

  const scripts =
    typeof getSavedScripts === "function" ? getSavedScripts() : [];

  let html =
    '<button type="button" class="page-actions-back" data-action="pageActionsBack">← Back</button>';

  if (!scripts.length) {
    html +=
      '<div class="page-actions-empty">No saved scripts yet. Save one first with 💾 Save.</div>';
  } else {
    html += '<div class="page-actions-list">';
    scripts.forEach((savedScript) => {
      const stats =
        typeof getSavedScriptStats === "function"
          ? getSavedScriptStats(savedScript)
          : {};
      const metaParts = [];
      if (stats.dateStr || savedScript.date) {
        metaParts.push(escapeHtml(stats.dateStr || savedScript.date));
      }
      if (stats.playCount != null) metaParts.push(`${stats.playCount} plays`);
      if (stats.periodCount) metaParts.push(`${stats.periodCount} periods`);
      html += `<button type="button" class="page-actions-list__item" data-action="loadScriptFromActions" data-arg="${escapeHtml(String(savedScript.id))}">
        <span class="page-actions-list__title">${escapeHtml(savedScript.name || "Untitled")}</span>
        <span class="page-actions-list__meta">${metaParts.join(" • ")}</span>
      </button>`;
    });
    html += "</div>";
  }

  html +=
    '<div class="page-actions-extra"><button type="button" class="page-actions-extra__item" data-action="openScriptDayTemplatesFromActions">📁 Day Templates…</button></div>';

  bodyEl.innerHTML = html;
}

function loadScriptFromActions(id) {
  closePageActions();
  setTimeout(() => {
    if (typeof loadScript !== "function") return;
    const scripts =
      typeof getSavedScripts === "function" ? getSavedScripts() : [];
    const match = scripts.find((s) => String(s.id) === String(id));
    loadScript(match ? match.id : id);
  }, 60);
}

function openScriptDayTemplatesFromActions() {
  closePageActions();
  setTimeout(() => {
    if (typeof openScriptTemplatesMenu === "function") openScriptTemplatesMenu();
  }, 60);
}

// ── Wristband “Appearance” → open the appearance popover ──────────────────────
function openWristbandAppearance() {
  closePageActions();
  setTimeout(() => {
    const panel = document.querySelector(".wb-appearance-panel");
    if (!panel) return;
    panel.open = true;
    // Scroll directly within .wristband-preview (not scrollIntoView which
    // would propagate to #mainApp and push the tab bar out of view).
    const preview = document.querySelector(".wristband-preview");
    if (preview) {
      const rect = panel.getBoundingClientRect();
      const pRect = preview.getBoundingClientRect();
      preview.scrollTo({ top: Math.max(0, preview.scrollTop + rect.top - pRect.top - 8), behavior: "smooth" });
    }
  }, 80);
}

// ── Wristband “Display Options” → expand and scroll to display panel ──────────
function openWbDisplayPanel() {
  closePageActions();
  setTimeout(() => {
    const panel = document.querySelector(".display-options-panel.wb-display-panel");
    if (!panel) return;
    const content = panel.querySelector(".display-options-content");
    const icon = panel.querySelector(".toggle-icon");
    if (content?.classList.contains("collapsed")) {
      content.classList.remove("collapsed");
      if (icon) icon.textContent = "▼";
    }
    const preview = document.querySelector(".wristband-preview");
    if (preview) {
      const rect = panel.getBoundingClientRect();
      const pRect = preview.getBoundingClientRect();
      preview.scrollTo({ top: Math.max(0, preview.scrollTop + rect.top - pRect.top - 8), behavior: "smooth" });
    }
  }, 80);
}

// ── Wristband “Sort & Organize” → expand and scroll to sort panel ────────────
function openWbSortPanel() {
  closePageActions();
  setTimeout(() => {
    const panel = document.querySelector(".wb-sort-panel");
    if (!panel) return;
    const content = panel.querySelector(".wb-sort-content");
    const icon = panel.querySelector(".toggle-icon");
    if (content?.classList.contains("collapsed")) {
      content.classList.remove("collapsed");
      if (icon) icon.textContent = "▼";
    }
    const preview = document.querySelector(".wristband-preview");
    if (preview) {
      const rect = panel.getBoundingClientRect();
      const pRect = preview.getBoundingClientRect();
      preview.scrollTo({ top: Math.max(0, preview.scrollTop + rect.top - pRect.top - 8), behavior: "smooth" });
    }
  }, 80);
}

// ── Display state readers (Phase 3: show current display state on the tile) ──
function _paScriptDisplayStatus() {
  const mode = document.querySelector(
    'input[name="scriptLayoutMode"]:checked',
  )?.value;
  return mode === "compact" ? "Compact view" : "Detailed view";
}

function _paCallsheetDisplayStatus() {
  const ids = [
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
  ];
  let on = 0;
  let total = 0;
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      total += 1;
      if (el.checked) on += 1;
    }
  });
  return total ? `${on} of ${total} fields` : "";
}

function _paWristbandDisplayStatus() {
  const preset = document.querySelector(
    'input[name="wbDisplayPreset"]:checked',
  )?.value;
  const presetName = preset
    ? preset.charAt(0).toUpperCase() + preset.slice(1)
    : "Standard";
  const sel = document.getElementById("wbColorSchemeSelect");
  const scheme = sel && sel.value ? sel.options[sel.selectedIndex]?.text : "";
  return scheme ? `${presetName} · ${scheme}` : presetName;
}

// ── Command palette integration (Phase 5) ──────────────────────────────────
// Feed every hub verb into the universal command palette so typing
// "load" / "save" / "print" / "display" jumps straight to the action.
function getPageActionsCommandItems() {
  if (typeof PAGE_ACTIONS_CONFIG !== "object" || !PAGE_ACTIONS_CONFIG) {
    return [];
  }
  const activeKey = getActivePageActionsKey();
  const items = [];
  Object.keys(PAGE_ACTIONS_CONFIG).forEach((key) => {
    const config = PAGE_ACTIONS_CONFIG[key];
    (config.verbs || []).forEach((verb, index) => {
      items.push({
        kind: "Action",
        title: `${config.title}: ${verb.label}`,
        subtitle: `Jump to ${config.title} and ${verb.label.toLowerCase()}`,
        keywords: `${verb.label} ${config.title} ${key} actions hub ${verb.label.toLowerCase()}`,
        priority: (key === activeKey ? 12 : 42) + index,
        run: () => _runPageActionsCommand(key, verb),
      });
    });
  });
  return items;
}

function _runPageActionsCommand(key, verb) {
  if (typeof showTab === "function") showTab(key);
  requestAnimationFrame(() => {
    try {
      if (verb.keepOpen) {
        openPageActions();
        verb.run();
      } else {
        verb.run();
      }
    } catch (e) {
      /* verb target unavailable — ignore */
    }
  });
}

// ── Play library (📚 Library button) ────────────────────────────────────────
// Toggles the active page's play library pane so it can be closed for more room
// and reopened to add plays. Script / Wristband / Game Plan each have a pane.
function openPlayLibrary() {
  const key = getActivePageActionsKey();
  const isMobile = document.body?.classList.contains("is-mobile-screen");
  if (key === "script") {
    // The script play rail already toggles collapse/expand.
    if (typeof toggleScriptPlayRail === "function") toggleScriptPlayRail();
  } else if (key === "wristband") {
    if (isMobile && typeof setWristbandMobileView === "function") {
      setWristbandMobileView("library");
    } else {
      _paToggleLibraryPane("wristband", "wb-library-collapsed");
    }
  } else if (key === "gameplan") {
    _paToggleLibraryPane("gameplan", "gp-library-collapsed");
  } else if (typeof showToast === "function") {
    showToast("No play library on this page.");
  }
}

function _paToggleLibraryPane(panelId, collapsedClass) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.classList.toggle(collapsedClass);
}

function _paRevealLibrary(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  requestAnimationFrame(() =>
    el.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
}
