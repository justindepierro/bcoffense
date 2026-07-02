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
      { icon: "⚙️", label: "Display", run: () => _paCall("toggleScriptDisplayPanel") },
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
    html += `<button type="button" class="page-actions-tile" data-action="runPageAction" data-arg="verb:${index}">
      <span class="page-actions-tile__icon" aria-hidden="true">${verb.icon || ""}</span>
      <span class="page-actions-tile__label">${escapeHtml(verb.label)}</span>
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
