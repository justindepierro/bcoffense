// Utility functions for the Practice Script & Playbook app

// ============ Global Constants ============
const AUTOSAVE_DEBOUNCE_MS = 3000;
const DRAFT_EXPIRY_MS = 86400000; // 24 hours
const WB_ROWS = 20;
const CELLS_PER_CARD = 40;
const MAX_CARDS = 5;
const WRISTBAND_OFFSET = 11;
const PICKER_LIMIT = 150;
const TOOLTIP_DELAY_MS = 200;

function getWristbandRecordCellCount(record) {
  return record?.wristbandType === "player" ? WB_ROWS : CELLS_PER_CARD;
}

// ============ Shared Color Tokens ============
// Mirrors CSS custom properties for use in JS-generated inline styles
const UI_COLORS = {
  periodDefault: "#333333",
  highlightHuddle: "#fff59d",
  highlightCandy: "#f8bbd9",
  textBlack: "#000",
  textWhite: "#fff",
  textDark: "#333",
  textMuted: "#666",
  textLight: "#888",
  borderLight: "#eee",
  bgSubtle: "#fafafa",
  bgDarkNav: "#1a1a2e",
  accentBlue: "#667eea",
  scoreGreen: "#4caf50",
  scoreRed: "#f44336",
};

// ============ Custom Modal System ============
// Replaces native alert(), confirm(), prompt() with styled modals

/**
 * Show an undo toast for destructive actions (replaces confirm + delete pattern)
 * @param {string} message - What happened (e.g. "Script cleared")
 * @param {Function} undoCallback - Called if user clicks Undo within the window
 * @param {number} duration - Time window in ms (default 5000)
 */
function showUndoToast(message, undoCallback, duration) {
  duration = duration || 5000;
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast toast-warning show";
  toast.style.setProperty("--toast-duration", duration + "ms");
  toast.innerHTML =
    escapeHtml(message) +
    ' <button class="btn btn-sm btn-ghost-current btn-inline-offset">Undo</button>';
  document.body.appendChild(toast);

  let undone = false;
  toast.querySelector("button").addEventListener("click", () => {
    undone = true;
    undoCallback();
    toast.remove();
    showToast("↩️ Action undone");
  });

  setTimeout(() => {
    if (!undone) {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

/**
 * Show a print preview modal before printing
 * @param {HTMLElement} contentEl - The content to preview
 * @param {Function} onPrint - Called when user clicks Print
 * @param {Function} [onCancel] - Called when user cancels (close/escape/backdrop)
 */
function showPrintPreview(contentEl, onPrint, onCancel) {
  document.querySelectorAll(".print-preview-overlay").forEach((existingOverlay) => {
    existingOverlay.remove();
  });

  const overlay = document.createElement("div");
  overlay.className = "print-preview-overlay";
  overlay.innerHTML =
    '<div class="print-preview-frame">' +
    '<div class="print-preview-toolbar">' +
    "<strong>🖨️ Print Preview</strong>" +
    '<span class="flex-spacer"></span>' +
    '<button class="btn btn-primary btn-sm" id="ppPrintBtn">🖨️ Print</button>' +
    '<button class="btn btn-sm" id="ppCancelBtn">Cancel</button>' +
    "</div>" +
    '<div class="print-preview-content"><div id="ppContent"></div></div>' +
    "</div>";
  document.body.appendChild(overlay);

  const previewClone = contentEl.cloneNode(true);
  if (previewClone.id) previewClone.removeAttribute("id");
  previewClone.querySelectorAll("[id]").forEach((element) => {
    element.removeAttribute("id");
  });

  document.getElementById("ppContent").appendChild(previewClone);
  const cancel = () => {
    overlay.remove();
    if (onCancel) onCancel();
  };
  document.getElementById("ppPrintBtn").addEventListener("click", () => {
    overlay.remove();
    onPrint();
  });
  document.getElementById("ppCancelBtn").addEventListener("click", cancel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cancel();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
  });
}

/**
 * Show a styled alert modal (replaces alert())
 * @param {string} message - The message to display
 * @param {object} opts - Options: { title, icon }
 * @returns {Promise<void>}
 */
let _modalIdCounter = 0;

function showModal(message, opts = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const title = opts.title || "Notice";
    const icon = opts.icon || "ℹ️";
    const mid = ++_modalIdCounter;
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle${mid}" aria-describedby="modalBody${mid}">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${escapeHtml(icon)}</span>
          <h3 class="custom-modal-title" id="modalTitle${mid}">${escapeHtml(title)}</h3>
        </div>
        <div class="custom-modal-body" id="modalBody${mid}">${formatModalMessage(message)}</div>
        <div class="custom-modal-actions">
          <button class="btn btn-primary custom-modal-btn" id="modalOkBtn${mid}">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const okBtn = overlay.querySelector(`#modalOkBtn${mid}`);
    okBtn.focus();

    function close() {
      overlay.classList.remove("visible");
      overlay.style.pointerEvents = "none";
      overlay.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        overlay.remove();
        if (previouslyFocused && previouslyFocused.focus)
          previouslyFocused.focus();
      }, 200);
      resolve();
    }

    okBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        close();
      }
    });
  });
}

/**
 * Show a toast notification
 * @param {string} message - Text to display
 * @param {number|object} durationOrOpts - Duration in ms, or options object
 *   Options: {
 *     duration: 2000,
 *     type: 'success'|'error'|'warning'|'info',
 *     actionLabel: 'Reload',
 *     action: 'reloadPage'
 *   }
 */
function showToast(message, durationOrOpts = 2000) {
  let duration = 2000;
  let type = null;
  let actionLabel = "";
  let action = "";

  if (typeof durationOrOpts === "object") {
    duration = durationOrOpts.duration || 2000;
    type = durationOrOpts.type || null;
    actionLabel = String(durationOrOpts.actionLabel || "");
    action = String(durationOrOpts.action || "");
  } else {
    duration = durationOrOpts;
  }

  // Remove existing toast
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  if (type) toast.classList.add("toast-" + type);

  toast.textContent = String(message || "");
  if (actionLabel && action) {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "btn btn-sm btn-ghost-current btn-inline-offset-sm";
    actionButton.dataset.action = action;
    actionButton.textContent = actionLabel;
    toast.append(" ", actionButton);
  }
  document.body.appendChild(toast);

  // Announce to screen readers via live region
  const announcer = document.getElementById("liveAnnouncer");
  if (announcer) {
    announcer.textContent = String(message || "");
  }

  // Trigger animation
  toast.style.setProperty("--toast-duration", duration + "ms");
  toast.addEventListener(
    "click",
    () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    },
    { once: true },
  );
  setTimeout(() => toast.classList.add("show"), 10);

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Show a styled confirm modal (replaces confirm())
 * @param {string} message - The message to display
 * @param {object} opts - Options: { title, icon, confirmText, cancelText, danger }
 * @returns {Promise<boolean>}
 */
function showConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const title = opts.title || "Confirm";
    const icon = opts.icon || "❓";
    const confirmText = opts.confirmText || "OK";
    const cancelText = opts.cancelText || "Cancel";
    const danger = opts.danger || false;
    const mid = ++_modalIdCounter;

    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle${mid}" aria-describedby="modalBody${mid}">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${escapeHtml(icon)}</span>
          <h3 class="custom-modal-title" id="modalTitle${mid}">${escapeHtml(title)}</h3>
        </div>
        <div class="custom-modal-body" id="modalBody${mid}">${formatModalMessage(message)}</div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="modalCancelBtn${mid}">${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"} custom-modal-btn" id="modalConfirmBtn${mid}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const confirmBtn = overlay.querySelector(`#modalConfirmBtn${mid}`);
    const cancelBtn = overlay.querySelector(`#modalCancelBtn${mid}`);
    confirmBtn.focus();

    function close(result) {
      overlay.classList.remove("visible");
      overlay.style.pointerEvents = "none";
      overlay.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        overlay.remove();
        if (previouslyFocused && previouslyFocused.focus)
          previouslyFocused.focus();
      }, 200);
      resolve(result);
    }

    confirmBtn.addEventListener("click", () => close(true));
    cancelBtn.addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    });
  });
}

/**
 * Show a styled prompt modal (replaces prompt())
 * @param {string} message - The prompt message
 * @param {string} defaultValue - Default input value
 * @param {object} opts - Options: { title, icon, placeholder, confirmText }
 * @returns {Promise<string|null>} The entered value or null if cancelled
 */
function showPrompt(message, defaultValue = "", opts = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const title = opts.title || "Input";
    const icon = opts.icon || "✏️";
    const placeholder = opts.placeholder || "";
    const confirmText = opts.confirmText || "OK";
    const mid = ++_modalIdCounter;

    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle${mid}" aria-describedby="modalBody${mid}">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${escapeHtml(icon)}</span>
          <h3 class="custom-modal-title" id="modalTitle${mid}">${escapeHtml(title)}</h3>
        </div>
        <div class="custom-modal-body" id="modalBody${mid}">${formatModalMessage(message)}</div>
        <div class="custom-modal-input-wrap">
          <input type="text" class="custom-modal-input" id="modalInput${mid}"
                 value="${escapeAttr(defaultValue)}" placeholder="${escapeAttr(placeholder)}">
        </div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="modalCancelBtn${mid}">Cancel</button>
          <button class="btn btn-primary custom-modal-btn" id="modalConfirmBtn${mid}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const input = overlay.querySelector(`#modalInput${mid}`);
    const confirmBtn = overlay.querySelector(`#modalConfirmBtn${mid}`);
    const cancelBtn = overlay.querySelector(`#modalCancelBtn${mid}`);
    input.focus();
    input.select();

    function close(value) {
      overlay.classList.remove("visible");
      overlay.style.pointerEvents = "none";
      overlay.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        overlay.remove();
        if (previouslyFocused && previouslyFocused.focus)
          previouslyFocused.focus();
      }, 200);
      resolve(value);
    }

    confirmBtn.addEventListener("click", () => close(input.value));
    cancelBtn.addEventListener("click", () => close(null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        close(input.value);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    });
  });
}

/**
 * Show a choice modal — confirm with custom labels for two choices
 * Like confirm but with descriptive button labels instead of OK/Cancel
 * @param {string} message
 * @param {object} opts - { title, icon, option1, option2 }
 * @returns {Promise<string|null>} "option1", "option2", or null if dismissed
 */
function showChoice(message, opts = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const title = opts.title || "Choose";
    const icon = opts.icon || "🔀";

    // Support two APIs:
    // 1. Legacy: { option1: "Label", option2: "Label" } → returns "option1" / "option2"
    // 2. New:    { choices: [{ label, value, icon? }] } → returns the chosen value
    const choices = opts.choices || null;

    let buttonsHtml = "";
    if (choices && Array.isArray(choices)) {
      buttonsHtml = choices
        .map((c, i) => {
          const btnClass =
            i === 0
              ? "btn-primary"
              : c.value === "cancel"
                ? "custom-modal-cancel"
                : "btn-secondary";
          const iconStr = c.icon ? `${escapeHtml(c.icon)} ` : "";
          return `<button class="btn ${btnClass} custom-modal-btn custom-modal-btn-full" data-choice-value="${escapeAttr(c.value)}">${iconStr}${escapeHtml(c.label)}</button>`;
        })
        .join("");
    } else {
      const option1 = opts.option1 || "Option 1";
      const option2 = opts.option2 || "Option 2";
      buttonsHtml = `
        <button class="btn btn-primary custom-modal-btn custom-modal-btn-full" data-choice-value="option1">${escapeHtml(option1)}</button>
        <button class="btn btn-secondary custom-modal-btn custom-modal-btn-full" data-choice-value="option2">${escapeHtml(option2)}</button>
      `;
    }

    const mid = ++_modalIdCounter;
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle${mid}" aria-describedby="modalBody${mid}">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${escapeHtml(icon)}</span>
          <h3 class="custom-modal-title" id="modalTitle${mid}">${escapeHtml(title)}</h3>
        </div>
        <div class="custom-modal-body" id="modalBody${mid}">${formatModalMessage(message)}</div>
        <div class="custom-modal-actions custom-modal-actions-stacked">
          ${buttonsHtml}
          ${choices ? "" : '<button class="btn custom-modal-btn custom-modal-cancel custom-modal-btn-full" data-choice-value="__cancel__">Cancel</button>'}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const firstBtn = overlay.querySelector("[data-choice-value]");
    if (firstBtn) firstBtn.focus();

    function close(val) {
      overlay.classList.remove("visible");
      setTimeout(() => {
        overlay.remove();
        if (previouslyFocused && previouslyFocused.focus)
          previouslyFocused.focus();
      }, 200);
      resolve(val === "__cancel__" ? null : val);
    }

    // Attach click handlers to all choice buttons
    overlay.querySelectorAll("[data-choice-value]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-choice-value");
        close(val);
      });
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    });
  });
}

/**
 * Show a list-picker modal (replaces prompt-based selection lists)
 * @param {string} message - Description text
 * @param {Array<{label: string, sublabel?: string, value: any}>} items
 * @param {object} opts - { title, icon }
 * @returns {Promise<any|null>} The selected item's value or null
 */
function showListPicker(message, items, opts = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const title = opts.title || "Select";
    const icon = opts.icon || "📋";
    const modalClass = opts.modalClass ? ` ${escapeAttr(opts.modalClass)}` : "";

    const itemsHtml = items
      .map((item, i) => {
        const itemClasses = [
          "custom-modal-list-item",
          item.recommended ? "is-recommended" : "",
        ].filter(Boolean).join(" ");

        return `
      <div class="${itemClasses}" data-index="${i}" role="button" tabindex="0" aria-label="${escapeAttr(item.ariaLabel || item.label)}">
        <span class="custom-modal-list-num">${i + 1}</span>
        <div class="custom-modal-list-text">
          ${item.eyebrow ? `<span class="custom-modal-list-eyebrow">${escapeHtml(item.eyebrow)}</span>` : ""}
          <span class="custom-modal-list-label">${escapeHtml(item.label)}</span>
          ${item.sublabel ? `<span class="custom-modal-list-sub">${escapeHtml(item.sublabel)}</span>` : ""}
          ${item.meta ? `<span class="custom-modal-list-meta">${escapeHtml(item.meta)}</span>` : ""}
        </div>
        ${(item.badge || item.ctaLabel)
            ? `<div class="custom-modal-list-side">
              ${item.badge ? `<span class="custom-modal-list-badge">${escapeHtml(item.badge)}</span>` : ""}
              ${item.ctaLabel ? `<span class="custom-modal-list-cta">${escapeHtml(item.ctaLabel)}</span>` : ""}
            </div>`
            : ""}
      </div>
    `;
      })
      .join("");

    const mid = ++_modalIdCounter;
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal custom-modal-wide${modalClass}" role="dialog" aria-modal="true" aria-labelledby="modalTitle${mid}">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${escapeHtml(icon)}</span>
          <h3 class="custom-modal-title" id="modalTitle${mid}">${escapeHtml(title)}</h3>
        </div>
        ${message ? `<div class="custom-modal-body">${formatModalMessage(message)}</div>` : ""}
        <div class="custom-modal-list">${itemsHtml}</div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="modalCancelBtn">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    function close(val) {
      overlay.classList.remove("visible");
      setTimeout(() => {
        overlay.remove();
        if (previouslyFocused && previouslyFocused.focus)
          previouslyFocused.focus();
      }, 200);
      resolve(val);
    }

    overlay.querySelectorAll(".custom-modal-list-item").forEach((el) => {
      const handleSelect = () => {
        const idx = parseInt(el.dataset.index, 10);
        close(items[idx].value);
      };

      el.addEventListener("click", handleSelect);
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        handleSelect();
      });
    });

    overlay
      .querySelector("#modalCancelBtn")
      .addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    });
  });
}

const SHARED_CUSTOM_TAG_DISPLAY_MODES = {
  full: { label: "Full", shortLabel: "Full" },
  "no-vowels": { label: "No Vowels", shortLabel: "NV" },
  initial: { label: "First Letter", shortLabel: "1L" },
};

function normalizeSharedCustomTagDisplayMode(mode) {
  return SHARED_CUSTOM_TAG_DISPLAY_MODES[mode] ? mode : "full";
}

function normalizeSharedCustomTagValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSharedCustomTagEntry(entry) {
  const rawValue = typeof entry === "string" ? entry : entry?.value || "";
  const value = normalizeSharedCustomTagValue(rawValue);
  if (!value) return null;
  return {
    value,
    display: normalizeSharedCustomTagDisplayMode(entry?.display),
  };
}

function getSharedCustomTagEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSharedCustomTagEntry(entry)).filter(Boolean);
  }
  return String(value)
    .split(/[;,|]+/)
    .map((item) => normalizeSharedCustomTagEntry(item))
    .filter(Boolean);
}

function formatSharedCustomTagEntryText(entry) {
  const normalizedEntry = normalizeSharedCustomTagEntry(entry);
  if (!normalizedEntry) return "";

  if (normalizedEntry.display === "no-vowels") {
    return removeVowels(normalizedEntry.value) || normalizedEntry.value.charAt(0);
  }
  if (normalizedEntry.display === "initial") {
    return normalizedEntry.value.charAt(0).toUpperCase();
  }
  return normalizedEntry.value;
}

function getSharedCustomTagModeMeta(mode) {
  return SHARED_CUSTOM_TAG_DISPLAY_MODES[normalizeSharedCustomTagDisplayMode(mode)];
}

function showCustomTagEditorModal(opts = {}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const title = opts.title || "Edit Tags";
    const icon = opts.icon || "🏷️";
    const message = opts.message || "";
    const placeholder = opts.placeholder || "Add a tag";
    let entries = getSharedCustomTagEntries(opts.initialEntries);
    const mid = ++_modalIdCounter;
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal custom-modal-wide custom-tag-editor-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle${mid}">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${escapeHtml(icon)}</span>
          <h3 class="custom-modal-title" id="modalTitle${mid}">${escapeHtml(title)}</h3>
        </div>
        ${message ? `<div class="custom-modal-body">${formatModalMessage(message)}</div>` : ""}
        <div class="custom-tag-editor-input-row">
          <input type="text" class="custom-modal-input custom-tag-editor-input" id="customTagEditorInput${mid}" placeholder="${escapeHtml(placeholder)}" />
          <button type="button" class="btn btn-primary custom-modal-btn" id="customTagEditorAdd${mid}">Add</button>
        </div>
        <div class="custom-tag-editor-helper">Click a mode pill to cycle Full, NV, and 1L for each tag.</div>
        <div class="custom-tag-editor-list" id="customTagEditorList${mid}"></div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="customTagEditorCancel${mid}">Cancel</button>
          <button class="btn btn-primary custom-modal-btn" id="customTagEditorSave${mid}">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    trapFocus(overlay);

    const listEl = overlay.querySelector(`#customTagEditorList${mid}`);
    const inputEl = overlay.querySelector(`#customTagEditorInput${mid}`);

    const renderEntries = () => {
      if (!entries.length) {
        listEl.innerHTML = '<div class="custom-tag-editor-empty">No tags added yet.</div>';
        return;
      }

      listEl.innerHTML = entries
        .map((entry, index) => {
          const modeMeta = getSharedCustomTagModeMeta(entry.display);
          return `
            <div class="custom-tag-editor-chip">
              <span class="custom-tag-editor-value">${escapeHtml(entry.value)}</span>
              <button type="button" class="custom-tag-editor-mode" data-index="${index}" data-action="cycle" title="Display mode: ${escapeHtml(modeMeta.label)}">${escapeHtml(modeMeta.shortLabel)}</button>
              <button type="button" class="custom-tag-editor-remove" data-index="${index}" data-action="remove" aria-label="Remove ${escapeHtml(entry.value)}">×</button>
            </div>
          `;
        })
        .join("");
    };

    const addEntry = () => {
      const nextValue = normalizeSharedCustomTagValue(inputEl.value);
      if (!nextValue) return;
      if (!entries.some((entry) => entry.value === nextValue)) {
        entries.push({ value: nextValue, display: "full" });
      }
      inputEl.value = "";
      inputEl.focus();
      renderEntries();
    };

    const close = (value) => {
      overlay.classList.remove("visible");
      setTimeout(() => {
        overlay.remove();
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      }, 200);
      resolve(value);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      const index = parseInt(btn.dataset.index, 10);
      if (!Number.isInteger(index) || !entries[index]) return;
      if (btn.dataset.action === "remove") {
        entries = entries.filter((_, idx) => idx !== index);
      } else if (btn.dataset.action === "cycle") {
        const current = entries[index];
        const nextDisplay =
          current.display === "full"
            ? "no-vowels"
            : current.display === "no-vowels"
              ? "initial"
              : "full";
        entries[index] = { ...current, display: nextDisplay };
      }
      renderEntries();
    });

    overlay.querySelector(`#customTagEditorAdd${mid}`).addEventListener("click", addEntry);
    overlay.querySelector(`#customTagEditorCancel${mid}`).addEventListener("click", () => close(null));
    overlay.querySelector(`#customTagEditorSave${mid}`).addEventListener("click", () => close(entries));
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
      }
      if (event.key === "Enter" && document.activeElement === inputEl) {
        event.preventDefault();
        addEntry();
      }
    });

    renderEntries();
    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      inputEl.focus();
    });
  });
}

/**
 * Format message text for modal — converts \n to <br> and wraps in <p>
 */
function formatModalMessage(msg) {
  if (!msg) return "";
  const html = String(msg)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p>${line}</p>`)
    .join("");
  return typeof sanitizeHTML === "function"
    ? sanitizeHTML(html)
    : `<p>${escapeHtml(msg).replace(/\n+/g, "</p><p>")}</p>`;
}

const TEAM_ASSIGNMENT_SLOTS = [
  { key: "qb", defaultLabel: "QB", row: 0 },
  { key: "rb", defaultLabel: "RB", row: 0 },
  { key: "h", defaultLabel: "H", row: 0 },
  { key: "x", defaultLabel: "X", row: 0 },
  { key: "z", defaultLabel: "Z", row: 0 },
  { key: "y", defaultLabel: "Y", row: 1 },
  { key: "lt", defaultLabel: "LT", row: 1 },
  { key: "lg", defaultLabel: "LG", row: 1 },
  { key: "c", defaultLabel: "C", row: 1 },
  { key: "rg", defaultLabel: "RG", row: 1 },
  { key: "rt", defaultLabel: "RT", row: 1 },
];

function normalizeTeamAssignmentLabelMap(labelMap = {}, fallbackMap = null) {
  const normalized = {};
  TEAM_ASSIGNMENT_SLOTS.forEach((slot) => {
    const value = String(
      labelMap?.[slot.key] || fallbackMap?.[slot.key] || "",
    )
      .trim()
      .toUpperCase();
    normalized[slot.key] = value || slot.defaultLabel;
  });
  return normalized;
}

function getLegacyTeamAssignmentLabelMap() {
  const stored = storageManager.get(STORAGE_KEYS.TEAM_ASSIGNMENT_LABELS, {});
  return normalizeTeamAssignmentLabelMap(stored);
}

function getTeamAssignmentLabelMap(personnel = "") {
  const legacyLabels = getLegacyTeamAssignmentLabelMap();
  const normalizedPersonnel = String(personnel || "").trim();
  if (!normalizedPersonnel) return legacyLabels;

  const storedPackages = storageManager.get(STORAGE_KEYS.TEAM_PERSONNEL_PACKAGES, []);
  if (!Array.isArray(storedPackages)) return legacyLabels;
  const match = storedPackages.find(
    (pkg) =>
      String(pkg?.personnel || "").trim().toLowerCase() ===
      normalizedPersonnel.toLowerCase(),
  );
  return match
    ? normalizeTeamAssignmentLabelMap(match.labels, legacyLabels)
    : legacyLabels;
}

function saveTeamAssignmentLabelMap(labelMap, personnel = "") {
  const normalizedPersonnel = String(personnel || "").trim();
  if (!normalizedPersonnel) {
    const normalized = normalizeTeamAssignmentLabelMap(labelMap);
    storageManager.set(STORAGE_KEYS.TEAM_ASSIGNMENT_LABELS, normalized);
    updateTeamSettingsAutosaveStatus();
    return normalized;
  }

  const packages = getTeamPersonnelPackages();
  const packageIndex = packages.findIndex(
    (pkg) => pkg.personnel.toLowerCase() === normalizedPersonnel.toLowerCase(),
  );
  const nextLabels = normalizeTeamAssignmentLabelMap(
    labelMap,
    getTeamAssignmentLabelMap(normalizedPersonnel),
  );
  if (packageIndex >= 0) {
    packages[packageIndex].labels = nextLabels;
  } else {
    packages.push(
      normalizePersonnelPackage({
        personnel: normalizedPersonnel,
        assignments: {},
        labels: nextLabels,
      }),
    );
  }
  saveTeamPersonnelPackages(packages);
  return nextLabels;
}

function getTeamAssignmentSlots(personnel = "") {
  const labelMap = getTeamAssignmentLabelMap(personnel);
  return TEAM_ASSIGNMENT_SLOTS.map((slot) => ({
    ...slot,
    label: labelMap[slot.key] || slot.defaultLabel,
  }));
}

function getPlaybookPersonnelValues() {
  if (typeof plays === "undefined" || !Array.isArray(plays)) return [];
  return [...new Set(
    plays
      .map((play) => String(play?.personnel || "").trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function normalizeTeamPlayer(player = {}) {
  const id = String(player.id || `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const name = String(player.name || "").trim();
  const number = String(player.number || "").trim();
  const position = String(player.position || "").trim().toUpperCase();
  const positionGroup = ["skill", "linemen"].includes(String(player.positionGroup || "").trim().toLowerCase())
    ? String(player.positionGroup || "").trim().toLowerCase()
    : "";
  const personnel = Array.isArray(player.personnel)
    ? player.personnel.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  return {
    id,
    name,
    number,
    position,
    positionGroup,
    personnel,
  };
}

function getTeamRoster() {
  const stored = storageManager.get(STORAGE_KEYS.TEAM_ROSTER, []);
  return Array.isArray(stored)
    ? stored.map((player) => normalizeTeamPlayer(player)).filter((player) => player.name)
    : [];
}

function saveTeamRoster(roster) {
  const normalized = Array.isArray(roster)
    ? roster.map((player) => normalizeTeamPlayer(player)).filter((player) => player.name)
    : [];
  storageManager.set(STORAGE_KEYS.TEAM_ROSTER, normalized);
  updateTeamSettingsAutosaveStatus();
  return normalized;
}

function normalizeTeamDepthChart(depthChart = {}, fallbackAssignments = {}) {
  const normalized = {};
  TEAM_ASSIGNMENT_SLOTS.forEach((slot) => {
    const rawValue = depthChart?.[slot.key];
    const values = Array.isArray(rawValue)
      ? rawValue
      : rawValue
        ? [rawValue]
        : fallbackAssignments?.[slot.key]
          ? [fallbackAssignments[slot.key]]
          : [];
    const cleaned = [...new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    )];
    if (cleaned.length) normalized[slot.key] = cleaned;
  });
  return normalized;
}

function getPrimaryAssignmentsFromDepthChart(depthChart = {}) {
  const normalized = {};
  TEAM_ASSIGNMENT_SLOTS.forEach((slot) => {
    const primary = Array.isArray(depthChart?.[slot.key])
      ? String(depthChart[slot.key][0] || "").trim()
      : "";
    if (primary) normalized[slot.key] = primary;
  });
  return normalized;
}

function getTeamDepthChartForSlot(depthChart = {}, slotKey = "") {
  return Array.isArray(depthChart?.[slotKey])
    ? depthChart[slotKey]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
    : [];
}

function normalizePersonnelPackage(pkg = {}) {
  const personnel = String(pkg.personnel || "").trim();
  const depthChart = normalizeTeamDepthChart(pkg.depthChart, pkg.assignments);
  const assignments = getPrimaryAssignmentsFromDepthChart(depthChart);
  const labels = normalizeTeamAssignmentLabelMap(
    pkg.labels,
    getTeamAssignmentLabelMap(personnel),
  );

  return {
    personnel,
    assignments,
    depthChart,
    labels,
  };
}

function normalizeTeamSwapGroup(group = {}) {
  const id = String(
    group.id || `swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const name = String(group.name || "").trim();
  const personnel = String(group.personnel || "").trim();
  const depthChart = normalizeTeamDepthChart(group.depthChart, group.assignments);

  return {
    id,
    name,
    personnel,
    assignments: getPrimaryAssignmentsFromDepthChart(depthChart),
    depthChart,
  };
}

function getTeamPersonnelPackages() {
  const stored = storageManager.get(STORAGE_KEYS.TEAM_PERSONNEL_PACKAGES, []);
  const playbookPersonnel = getPlaybookPersonnelValues();
  const normalizedStored = Array.isArray(stored)
    ? stored
      .map((pkg) => normalizePersonnelPackage(pkg))
      .filter((pkg) => pkg.personnel)
    : [];
  const byPersonnel = new Map(
    normalizedStored.map((pkg) => [pkg.personnel.toLowerCase(), pkg]),
  );
  const autoPackages = playbookPersonnel.map((personnel) => {
    const existing = byPersonnel.get(personnel.toLowerCase());
    return existing
      ? { ...existing, isAutoPrepared: false }
      : {
        ...normalizePersonnelPackage({
          personnel,
          assignments: {},
          labels: getTeamAssignmentLabelMap(personnel),
        }),
        isAutoPrepared: true,
      };
  });
  const extras = normalizedStored.filter(
    (pkg) => !playbookPersonnel.some((personnel) => personnel.toLowerCase() === pkg.personnel.toLowerCase()),
  ).map((pkg) => ({ ...pkg, isAutoPrepared: false }));
  return [...autoPackages, ...extras];
}

function saveTeamPersonnelPackages(packages) {
  const normalized = Array.isArray(packages)
    ? packages
      .map((pkg) => normalizePersonnelPackage(pkg))
      .filter((pkg) => pkg.personnel)
    : [];
  storageManager.set(STORAGE_KEYS.TEAM_PERSONNEL_PACKAGES, normalized);
  updateTeamSettingsAutosaveStatus();
  return normalized;
}

function getTeamSwapGroups() {
  const stored = storageManager.get(STORAGE_KEYS.TEAM_SWAP_GROUPS, []);
  return Array.isArray(stored)
    ? stored
      .map((group) => normalizeTeamSwapGroup(group))
      .filter((group) => group.name)
    : [];
}

function saveTeamSwapGroups(groups) {
  const normalized = Array.isArray(groups)
    ? groups
      .map((group) => normalizeTeamSwapGroup(group))
      .filter((group) => group.name)
    : [];
  storageManager.set(STORAGE_KEYS.TEAM_SWAP_GROUPS, normalized);
  updateTeamSettingsAutosaveStatus();
  return normalized;
}

function getPersonnelPackageAssignments(personnel) {
  const normalizedPersonnel = String(personnel || "").trim();
  if (!normalizedPersonnel) return {};
  const match = getTeamPersonnelPackages().find(
    (pkg) => pkg.personnel.toLowerCase() === normalizedPersonnel.toLowerCase(),
  );
  return match
    ? safeDeepClone(getPrimaryAssignmentsFromDepthChart(match.depthChart || match.assignments))
    : {};
}

function getPersonnelPackageDepthChart(personnel) {
  const normalizedPersonnel = String(personnel || "").trim();
  if (!normalizedPersonnel) return {};
  const match = getTeamPersonnelPackages().find(
    (pkg) => pkg.personnel.toLowerCase() === normalizedPersonnel.toLowerCase(),
  );
  return match ? safeDeepClone(match.depthChart || {}) : {};
}

function normalizePlayerAssignments(assignments = {}) {
  const normalized = {};
  getTeamAssignmentSlots().forEach((slot) => {
    const value = String(assignments?.[slot.key] || "").trim();
    if (value) normalized[slot.key] = value;
  });
  return normalized;
}

function getTeamSwapGroupAssignments(groupId, personnel) {
  const normalizedGroupId = String(groupId || "").trim();
  if (!normalizedGroupId) return {};

  const normalizedPersonnel = String(personnel || "").trim().toLowerCase();
  const match = getTeamSwapGroups().find((group) => {
    if (group.id !== normalizedGroupId) return false;
    if (!group.personnel) return true;
    return group.personnel.toLowerCase() === normalizedPersonnel;
  });

  return match
    ? safeDeepClone(getPrimaryAssignmentsFromDepthChart(match.depthChart || match.assignments))
    : {};
}

function getTeamSwapGroupDepthChart(groupId, personnel) {
  const normalizedGroupId = String(groupId || "").trim();
  if (!normalizedGroupId) return {};

  const normalizedPersonnel = String(personnel || "").trim().toLowerCase();
  const match = getTeamSwapGroups().find((group) => {
    if (group.id !== normalizedGroupId) return false;
    if (!group.personnel) return true;
    return group.personnel.toLowerCase() === normalizedPersonnel;
  });

  return match ? safeDeepClone(match.depthChart || {}) : {};
}

function getPlaySubPackageId(play) {
  return String(play?.playerSubPackageId || play?.subPackageId || "").trim();
}

function getPlaySubPackageAssignments(play) {
  const groupId = getPlaySubPackageId(play);
  if (!groupId) return {};
  return getTeamSwapGroupAssignments(groupId, play?.personnel);
}

function getPlaySubPackageDepthChart(play) {
  const groupId = getPlaySubPackageId(play);
  if (!groupId) return {};
  return getTeamSwapGroupDepthChart(groupId, play?.personnel);
}

function getApplicableTeamSwapGroups(personnel) {
  const normalizedPersonnel = String(personnel || "").trim().toLowerCase();
  return getTeamSwapGroups().filter((group) => {
    if (!group.personnel) return true;
    return group.personnel.toLowerCase() === normalizedPersonnel;
  });
}

function getBasePlayerAssignments(play) {
  const packageAssignments = getPersonnelPackageAssignments(play?.personnel);
  return normalizePlayerAssignments(packageAssignments);
}

function getBasePlayerDepthChart(play) {
  const packageDepthChart = getPersonnelPackageDepthChart(play?.personnel);
  return normalizeTeamDepthChart(packageDepthChart);
}

function getPlayerAssignmentBaseline(play) {
  return normalizePlayerAssignments({
    ...getBasePlayerAssignments(play),
    ...getPlaySubPackageAssignments(play),
  });
}

function getResolvedPlayerDepthChart(play) {
  const baseDepthChart = getBasePlayerDepthChart(play);
  const subPackageDepthChart = getPlaySubPackageDepthChart(play);
  const manualAssignments = normalizePlayerAssignments(play?.playerAssignments);
  const resolved = normalizeTeamDepthChart(baseDepthChart);

  TEAM_ASSIGNMENT_SLOTS.forEach((slot) => {
    const subDepth = getTeamDepthChartForSlot(subPackageDepthChart, slot.key);
    if (!subDepth.length) return;
    const baseDepth = getTeamDepthChartForSlot(resolved, slot.key);
    const mergedDepth = [...new Set([...subDepth, ...baseDepth])];
    if (mergedDepth.length) resolved[slot.key] = mergedDepth;
  });

  TEAM_ASSIGNMENT_SLOTS.forEach((slot) => {
    const manualPlayerId = String(manualAssignments[slot.key] || "").trim();
    if (!manualPlayerId) return;
    const slotDepth = getTeamDepthChartForSlot(resolved, slot.key).filter(
      (playerId) => playerId !== manualPlayerId,
    );
    resolved[slot.key] = [manualPlayerId, ...slotDepth];
  });

  return resolved;
}

function getResolvedPlayerAssignments(play) {
  return {
    ...getPlayerAssignmentBaseline(play),
    ...normalizePlayerAssignments(play?.playerAssignments),
  };
}

function formatTeamPlayerLabel(player) {
  const bits = [];
  if (player.number) bits.push(`#${player.number}`);
  if (player.name) bits.push(player.name);
  if (player.position) bits.push(`(${player.position})`);
  if (player.positionGroup) bits.push(player.positionGroup === "linemen" ? "[Linemen]" : "[Skill]");
  return bits.join(" ") || "Unnamed Player";
}

function getTeamPlayerById(playerId) {
  if (!playerId) return null;
  return getTeamRoster().find((player) => player.id === playerId) || null;
}

function getTeamPlayerSelectionDisplay(playerId) {
  const player = getTeamPlayerById(playerId);
  return player ? formatTeamPlayerLabel(player) : "Open slot";
}

function formatTeamDepthChartDisplay(playerIds = []) {
  const ids = Array.isArray(playerIds)
    ? playerIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return "Open slot";
  return ids
    .map((playerId, index) => `${index === 0 ? "Starter" : `Sub ${index}`}: ${getTeamPlayerSelectionDisplay(playerId)}`)
    .join(" | ");
}

function buildTeamPlayerOptionMarkup(selectedId = "", includeBlank = true) {
  const roster = getTeamRoster();
  const blankOption = includeBlank
    ? `<option value="">${roster.length ? "Open" : "Add roster first"}</option>`
    : "";
  return blankOption + roster
    .map((player) => {
      const selected = player.id === selectedId ? " selected" : "";
      return `<option value="${escapeAttr(player.id)}"${selected}>${escapeHtml(formatTeamPlayerLabel(player))}</option>`;
    })
    .join("");
}

function buildTeamSwapGroupOptionMarkup(
  selectedId = "",
  personnel = "",
  includeBlank = true,
) {
  const groups = getApplicableTeamSwapGroups(personnel);
  const blankOption = includeBlank
    ? `<option value="">${groups.length ? "No sub package" : "Add sub packages first"}</option>`
    : "";

  return blankOption + groups
    .map((group) => {
      const selected = group.id === selectedId ? " selected" : "";
      const suffix = group.personnel ? ` (${group.personnel})` : "";
      return `<option value="${escapeAttr(group.id)}"${selected}>${escapeHtml(group.name + suffix)}</option>`;
    })
    .join("");
}

function formatPlayerAssignmentSummary(assignments = {}, options = {}) {
  const includeSlotLabels = options.includeSlotLabels !== false;
  const personnel = String(options.personnel || "").trim();
  const roster = getTeamRoster();
  const rosterMap = new Map(roster.map((player) => [player.id, player]));
  const normalizedAssignments = normalizePlayerAssignments(assignments);

  return getTeamAssignmentSlots(personnel).map((slot) => {
    const playerId = normalizedAssignments[slot.key];
    if (!playerId) return "";
    const player = rosterMap.get(playerId);
    const label = player ? formatTeamPlayerLabel(player) : playerId;
    return includeSlotLabels ? `${slot.label}: ${label}` : label;
  })
    .filter(Boolean)
    .join(", ");
}

/**
 * Toggle a collapsible panel section (display options, integration, etc.)
 * Used across script, wristband, and callsheet modules.
 */
function toggleCollapsiblePanel(headerEl) {
  const content = headerEl.nextElementSibling;
  if (!content) return;
  content.classList.toggle("collapsed");
  const isCollapsed = content.classList.contains("collapsed");

  const panelKey = headerEl.dataset.panelKey;
  if (panelKey) {
    setTeamSettingsPanelCollapsed(panelKey, isCollapsed);
  }

  if (headerEl.hasAttribute("aria-expanded")) {
    headerEl.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
  }

  const icon = headerEl.querySelector(".toggle-icon");
  if (icon) icon.textContent = isCollapsed ? "▶" : "▼";
}

/**
 * Escape HTML for safe insertion — shared across all modules
 */
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build checkbox filter HTML for a container.
 * Eliminates duplicate checkbox-generation blocks across modules.
 * @param {string} containerId - DOM element id to populate
 * @param {string[]} values - Sorted unique filter values
 * @param {string} filterType - Key passed to the toggle function (e.g. 'type', 'tempo')
 * @param {string} toggleFnName - Global toggle function name (e.g. 'toggleScriptCheckbox')
 */
function buildCheckboxFilterGroup(
  containerId,
  values,
  filterType,
  toggleFnName,
) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = values
    .map(
      (v) => `
        <label data-action="${toggleFnName}" data-filter-type="${filterType}" data-filter-value="${escapeHtml(v)}">
          <input type="checkbox" value="${escapeHtml(v)}"> ${escapeHtml(v)}
        </label>
      `,
    )
    .join("");
}

/**
 * Debounce — returns a function that delays invoking fn until after wait ms
 * have elapsed since the last invocation. Useful for search inputs, resize, etc.
 */
function debounce(fn, wait = 150) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ============ Lightweight Performance Instrumentation ============
const perfMonitor = (() => {
  const samples = [];
  const MAX_SAMPLES = 120;
  const SLOW_MS = 32;

  function enabled() {
    try {
      return (
        localStorage.getItem("bcoPerf") === "1" ||
        new URLSearchParams(window.location.search).has("perf")
      );
    } catch (_e) {
      return false;
    }
  }

  function record(name, durationMs, meta = {}) {
    if (!enabled() || typeof performance === "undefined") return null;
    const sample = {
      name,
      durationMs: Math.round(durationMs * 100) / 100,
      at: new Date().toISOString(),
      ...meta,
    };
    samples.push(sample);
    if (samples.length > MAX_SAMPLES) samples.shift();
    if (sample.durationMs >= SLOW_MS) {
      console.debug("[perf]", sample.name, sample.durationMs + "ms", meta);
    }
    return sample;
  }

  function measure(name, fn, meta = {}) {
    if (!enabled() || typeof performance === "undefined") return fn();
    const startedAt = performance.now();
    try {
      const result = fn();
      if (result && typeof result.then === "function") {
        return result.finally(() => {
          record(name, performance.now() - startedAt, meta);
        });
      }
      record(name, performance.now() - startedAt, meta);
      return result;
    } catch (err) {
      record(name, performance.now() - startedAt, { ...meta, error: true });
      throw err;
    }
  }

  function getSamples(name = "") {
    return name ? samples.filter((sample) => sample.name === name) : [...samples];
  }

  function clear() {
    samples.length = 0;
  }

  function report() {
    const grouped = getSamples().reduce((acc, sample) => {
      const row = acc[sample.name] || {
        name: sample.name,
        count: 0,
        totalMs: 0,
        maxMs: 0,
      };
      row.count += 1;
      row.totalMs += sample.durationMs;
      row.maxMs = Math.max(row.maxMs, sample.durationMs);
      acc[sample.name] = row;
      return acc;
    }, {});
    const rows = Object.values(grouped).map((row) => ({
      name: row.name,
      count: row.count,
      avgMs: Math.round((row.totalMs / row.count) * 100) / 100,
      maxMs: Math.round(row.maxMs * 100) / 100,
    }));
    console.table(rows);
    return rows;
  }

  return {
    get enabled() {
      return enabled();
    },
    record,
    measure,
    getSamples,
    clear,
    report,
  };
})();

if (typeof window !== "undefined") {
  window.perfMonitor = perfMonitor;
}

// ============ RAF Render Coalescing ============
/**
 * Create a render function that coalesces multiple calls within the same frame
 * into a single execution via requestAnimationFrame.
 * @param {Function} renderFn - The render function to wrap
 * @returns {Function} Coalesced render function
 */
function createRAFRenderer(renderFn) {
  let scheduled = false;
  let lastArgs = null;
  let lastThis = null;
  return function (...args) {
    lastArgs = args;
    lastThis = this;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const callArgs = lastArgs || [];
      const callThis = lastThis;
      lastArgs = null;
      lastThis = null;
      const label = `render:${renderFn.name || "anonymous"}`;
      perfMonitor.measure(label, () => renderFn.apply(callThis, callArgs), {
        args: callArgs.length,
      });
    });
  };
}

/**
 * Safe JSON parse with fallback — use instead of raw JSON.parse on external data
 */
function safeJSONParse(str, fallback) {
  if (str === null || str === undefined) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn("safeJSONParse failed:", e.message);
    return fallback;
  }
}

/**
 * Safe deep clone — uses native structuredClone (faster, handles more types)
 * Falls back to JSON round-trip for older browsers.
 */
function safeDeepClone(obj) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.warn("safeDeepClone failed:", e.message);
    if (Array.isArray(obj)) return [...obj];
    if (obj && typeof obj === "object") return { ...obj };
    return obj;
  }
}

/**
 * Get emoji for personnel grouping
 * @param {string} personnel - Personnel grouping (color name like "Red", "Blue", etc.)
 * @param {boolean} useSquares - Use square emojis instead of circles
 * @returns {string} Emoji representation
 */
function getPersonnelEmoji(personnel, useSquares = false) {
  if (!personnel) return "";

  const p = String(personnel).toLowerCase().trim();

  const circleMap = {
    red: "🔴",
    blue: "🔵",
    green: "🟢",
    yellow: "🟡",
    orange: "🟠",
    purple: "🟣",
    brown: "🟤",
    white: "⚪",
    black: "⚫",
    star: "⭐",
  };

  const squareMap = {
    red: "🟥",
    blue: "🟦",
    green: "🟩",
    yellow: "🟨",
    orange: "🟧",
    purple: "🟪",
    brown: "🟫",
    white: "⬜",
    black: "⬛",
    star: "⭐",
  };

  const map = useSquares ? squareMap : circleMap;
  return map[p] || "";
}

/**
 * Remove vowels from a string (for abbreviated display)
 * @param {string} str - Input string
 * @returns {string} String with vowels removed (keeps first letter)
 */
function removeVowels(str) {
  if (!str) return "";
  // Keep first letter, remove vowels from rest
  return str[0] + str.slice(1).replace(/[aeiouAEIOU]/g, "");
}

/**
 * Get the full play call string with optional formatting
 * @param {Object} play - Play object
 * @param {Object} options - Formatting options
 * @returns {string} Formatted play call string
 */
function getFullCall(play, options = {}) {
  const {
    showEmoji = false,
    useSquares = false,
    underEmoji = false,
    boldShifts = false,
    redShifts = false,
    italicMotions = false,
    redMotions = false,
    noVowels = false,
    showLineCall = true,
    hideProtection = false,
    highlightHuddle = false,
    highlightCandy = false,
  } = options;

  // Check if play has "Under" - check the under column or legacy formTag locations
  const hasUnder =
    (play.under && play.under.trim() !== "") ||
    (play.formTag1 && play.formTag1.toLowerCase() === "under") ||
    (play.formTag2 && play.formTag2.toLowerCase() === "under");

  let parts = [];

  // Build full call — escape all user-provided values for safe HTML injection
  if (play.formation) parts.push(escapeHtml(play.formation));
  if (play.formTag1 && !(underEmoji && play.formTag1.toLowerCase() === "under"))
    parts.push(escapeHtml(play.formTag1));
  if (play.formTag2 && !(underEmoji && play.formTag2.toLowerCase() === "under"))
    parts.push(escapeHtml(play.formTag2));
  // Add Under (if not using emoji display for it)
  if (play.under && !(underEmoji && play.under.trim() !== ""))
    parts.push(escapeHtml(play.under));
  if (play.back) parts.push(escapeHtml(play.back));

  // Handle shift with bold/red options
  if (play.shift) {
    let shiftHtml = escapeHtml(play.shift);
    if (boldShifts) shiftHtml = `<b>${shiftHtml}</b>`;
    if (redShifts) shiftHtml = `<span class="text-danger">${shiftHtml}</span>`;
    parts.push(shiftHtml);
  }

  // Handle motion with italic/red options
  if (play.motion) {
    let motionHtml = escapeHtml(play.motion);
    if (italicMotions) motionHtml = `<i>${motionHtml}</i>`;
    if (redMotions) motionHtml = `<span class="text-danger">${motionHtml}</span>`;
    parts.push(motionHtml);
  }

  if (!hideProtection && play.protection) parts.push(escapeHtml(play.protection));
  if (play.play) parts.push(escapeHtml(play.play));
  if (play.playTag1) parts.push(escapeHtml(play.playTag1));
  if (play.playTag2) parts.push(escapeHtml(play.playTag2));

  let fullCall = parts.join(" ");

  // Remove vowels if requested (but preserve HTML tags)
  if (noVowels) {
    fullCall = fullCall.replace(/([^<>]+)(?=<|$)/g, (match) =>
      removeVowels(match),
    );
  }

  // Add line call in brackets
  if (showLineCall && play.lineCall) {
    const rawLc = noVowels ? removeVowels(play.lineCall) : play.lineCall;
    const lc = escapeHtml(rawLc);
    fullCall += ` <span class="line-call">[${lc}]</span>`;
  }

  // Add emoji prefix
  let prefix = "";
  if (showEmoji && play.personnel) {
    prefix += `${getPersonnelEmoji(play.personnel, useSquares)} `;
  }
  if (underEmoji && hasUnder) {
    prefix += "🍑 ";
  }

  if (prefix) fullCall = prefix + fullCall;

  return fullCall.trim();
}

const PLAY_IDENTITY_FIELDS = {
  name: ["formation", "play"],
  core: ["formation", "play", "personnel"],
  tag: ["formation", "play", "personnel", "type"],
  gameplan: [
    "type",
    "personnel",
    "formation",
    "formTag1",
    "formTag2",
    "under",
    "back",
    "shift",
    "motion",
    "protection",
    "lineCall",
    "play",
    "playTag1",
    "playTag2",
    "basePlay",
    "oneWord",
    "preferredSituation",
    "preferredDown",
    "preferredDistance",
    "preferredHash",
    "preferredFieldPosition",
    "tempo",
    "practiceFront",
    "practiceDefense",
    "practiceCoverage",
    "practiceBlitz",
    "practiceStunt",
    "keyPlayer1",
    "keyPlayer2",
    "keyPlayer3",
    "keyPlayerName1",
    "keyPlayerName2",
    "keyPlayerName3",
    "constraint1",
    "constraint2",
    "constraint3",
    "hitChart1",
    "hitChart2",
    "hitChart3",
    "deadVs",
    "opponent",
    "notes",
  ],
};

function normalizePlayIdentityValue(value, options = {}) {
  const raw = value == null ? "" : String(value);
  const trimmed = options.trim === false ? raw : raw.trim();
  return options.normalizeCase ? trimmed.toLowerCase() : trimmed;
}

function getPlayIdentityKey(play, mode = "core", options = {}) {
  if (!play) return "";
  const fields = Array.isArray(mode)
    ? mode
    : PLAY_IDENTITY_FIELDS[mode] || PLAY_IDENTITY_FIELDS.core;
  return fields
    .map((field) => normalizePlayIdentityValue(play[field], options))
    .join("|");
}

function createPlayId(prefix = "play") {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

function ensurePlaybookPlayIds(list) {
  if (!Array.isArray(list)) return 0;
  const used = new Set();
  let changed = 0;
  list.forEach((play) => {
    if (!play || typeof play !== "object") return;
    const current = play.id == null ? "" : String(play.id).trim();
    if (current && !used.has(current)) {
      play.id = current;
      used.add(current);
      return;
    }
    let next = createPlayId();
    while (used.has(next)) next = createPlayId();
    play.id = next;
    used.add(next);
    changed += 1;
  });
  return changed;
}

let _playbookRuntimeIndex = null;
let _playbookRuntimeIndexSource = null;

const PLAYBOOK_RUNTIME_SEARCH_FIELDS = [
  "type",
  "personnel",
  "formation",
  "formTag1",
  "formTag2",
  "under",
  "back",
  "shift",
  "motion",
  "protection",
  "lineCall",
  "play",
  "playTag1",
  "playTag2",
  "basePlay",
  "oneWord",
  "tempo",
  "preferredDown",
  "preferredDistance",
  "preferredSituation",
  "preferredFieldPosition",
  "preferredHash",
  "practiceFront",
  "practiceDefense",
  "practiceCoverage",
  "practiceBlitz",
  "practiceStunt",
  "keyPlayer1",
  "keyPlayer2",
  "keyPlayer3",
  "keyPlayerName1",
  "keyPlayerName2",
  "keyPlayerName3",
  "constraint1",
  "constraint2",
  "constraint3",
  "hitChart1",
  "hitChart2",
  "hitChart3",
  "deadVs",
  "opponent",
  "notes",
];

function invalidatePlaybookRuntimeIndex() {
  _playbookRuntimeIndex = null;
  _playbookRuntimeIndexSource = null;
}

function getPlaybookRuntimeIndex() {
  const list = Array.isArray(plays) ? plays : [];
  if (_playbookRuntimeIndex && _playbookRuntimeIndexSource === list) {
    return _playbookRuntimeIndex;
  }
  const byId = new Map();
  const byGamePlanSig = new Map();
  const byTagSig = new Map();
  const byPlay = new WeakMap();
  list.forEach((play, index) => {
    if (!play) return;
    const gpSig = getPlayIdentityKey(play, "gameplan", { trim: false });
    const tagSig = playSignature(play);
    const searchText = PLAYBOOK_RUNTIME_SEARCH_FIELDS
      .map((field) => play[field])
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const entry = { play, index, gpSig, tagSig, searchText };
    byPlay.set(play, entry);
    if (play.id) byId.set(String(play.id), entry);
    if (gpSig && !byGamePlanSig.has(gpSig)) byGamePlanSig.set(gpSig, entry);
    if (tagSig && !byTagSig.has(tagSig)) byTagSig.set(tagSig, entry);
  });
  _playbookRuntimeIndex = { byId, byGamePlanSig, byTagSig, byPlay, size: list.length };
  _playbookRuntimeIndexSource = list;
  return _playbookRuntimeIndex;
}

function findPlayByGamePlanSignature(sig) {
  if (!sig) return null;
  const hit = getPlaybookRuntimeIndex().byGamePlanSig.get(sig);
  return hit ? hit.play : null;
}

function playsHaveSameIdentity(p1, p2, mode = "core", options = {}) {
  return getPlayIdentityKey(p1, mode, options) === getPlayIdentityKey(p2, mode, options);
}

/**
 * Compare two plays to determine if they match
 * @param {Object} p1 - First play object
 * @param {Object} p2 - Second play object
 * @returns {boolean} True if plays match
 */
function playsMatch(p1, p2) {
  if (!p1 || !p2) return false;

  // Preserve the historic matching order while sharing the key builder.
  if (playsHaveSameIdentity(p1, p2, "core", { trim: false })) return true;
  if (playsHaveSameIdentity(p1, p2, "name", { trim: false })) return true;
  return playsHaveSameIdentity(p1, p2, "name", { normalizeCase: true });
}

// ============ Defense Taxonomy / Normalization ============
// Coaches call the same concept by many names. This system groups
// defensive terms into families so analysis can compare apples to apples.

const DEFENSE_TAXONOMY = {
  // ── Coverage Families ──
  // Each key is a canonical family name; the array lists all synonyms.
  // The first entry is the display name for that family.
  coverageFamilies: {
    MAN: {
      label: "Man",
      members: [
        "Cover 0",
        "Cov 0",
        "C0",
        "Cover 1",
        "Cov 1",
        "C1",
        "Man",
        "Man Free",
        "Man Under",
        "2-Man",
        "2 Man",
        "2-Man Under",
        "Straight Man",
        "Press Man",
      ],
    },
    ZONE: {
      label: "Zone",
      members: [
        "Zone",
        "Soft Zone",
        "Match Zone",
        "Pattern Match",
        "Spot Drop",
      ],
    },
    COV2: {
      label: "Cover 2",
      members: [
        "Cover 2",
        "Cov 2",
        "C2",
        "Tampa 2",
        "Tampa Two",
        "2-Read",
        "Palms",
        "Sky",
        "Cover 2 Sink",
      ],
    },
    COV3: {
      label: "Cover 3",
      members: [
        "Cover 3",
        "Cov 3",
        "C3",
        "3-Deep",
        "3 Deep",
        "Buzz",
        "Cloud",
        "Cover 3 Sky",
        "Cover 3 Buzz",
        "3 Match",
      ],
    },
    COV4: {
      label: "Cover 4",
      members: [
        "Cover 4",
        "Cov 4",
        "C4",
        "Quarters",
        "Quarter Quarter Half",
        "Cover 6",
        "Cov 6",
        "C6",
        "Quarter",
        "Qtrs",
      ],
    },
    ROBBER: {
      label: "Robber/Special",
      members: ["Robber", "Rat", "Hole", "Trap", "Cover 1 Robber", "Bracket"],
    },
  },

  // ── Front Families ──
  frontFamilies: {
    FOUR_DOWN: {
      label: "4-Down",
      members: [
        "4-3",
        "4-2-5",
        "4-2",
        "Nickel",
        "Over",
        "Under",
        "Even",
        "4-4",
        "46",
        "4i",
        "Double Eagle",
      ],
    },
    THREE_DOWN: {
      label: "3-Down",
      members: [
        "3-4",
        "3-3-5",
        "Odd",
        "3-3 Stack",
        "3-4 Stack",
        "Tite",
        "30 Front",
        "50 Front",
      ],
    },
    LIGHT_BOX: {
      label: "Light Box",
      members: [
        "Dime",
        "Quarter",
        "Dollar",
        "Empty Defense",
        "Sub",
        "Sub Package",
      ],
    },
    HEAVY_BOX: {
      label: "Heavy Box",
      members: [
        "Bear",
        "5-2",
        "5-3",
        "6-1",
        "6-2",
        "Jumbo",
        "Goal Line",
        "Heavy",
        "Big",
      ],
    },
  },

  // ── Blitz Families ──
  blitzFamilies: {
    NONE: {
      label: "No Blitz",
      members: ["None", "No Blitz", "Base", "4 Rush", "Rush 4", "Standard"],
    },
    ZONE: {
      label: "Zone Blitz",
      members: [
        "Zone Blitz",
        "Fire Zone",
        "Sim Pressure",
        "Simulated Pressure",
        "Zone Pressure",
        "Fire",
      ],
    },
    MAN: {
      label: "Man Blitz",
      members: [
        "Man Blitz",
        "All-Out",
        "Zero Blitz",
        "Pressure",
        "Overload",
        "Blitz",
      ],
    },
    CONTAIN: {
      label: "Contain/Edge",
      members: [
        "Edge",
        "Contain",
        "DB Blitz",
        "Corner Blitz",
        "Safety Blitz",
        "Nickel Blitz",
      ],
    },
  },

  // ── Stunt Families ──
  stuntFamilies: {
    NONE: {
      label: "No Stunt",
      members: ["None", "No Stunt", "Base", "Straight Rush"],
    },
    TWIST: {
      label: "Twist/Game",
      members: ["Twist", "Loop", "Games", "Game", "ET", "TE", "TEX"],
    },
    PINCH: {
      label: "Pinch/Squeeze",
      members: ["Pinch", "Squeeze", "Crash", "Spike"],
    },
    WIDE: {
      label: "Wide/Spread",
      members: ["Wide", "Spread", "Wide Rush", "Exchange"],
    },
  },
};

/**
 * Normalize a defensive term to its canonical family.
 * @param {string} term     – The raw input (e.g. "Cov 3", "Tampa 2", "nickel")
 * @param {string} category – "coverage", "front", "blitz", or "stunt"
 * @returns {{ family: string, label: string } | null}
 */
function normalizeDefense(term, category) {
  if (!term || !term.trim()) return null;
  const t = term.trim().toLowerCase();

  const familyMap = {
    coverage: DEFENSE_TAXONOMY.coverageFamilies,
    front: DEFENSE_TAXONOMY.frontFamilies,
    blitz: DEFENSE_TAXONOMY.blitzFamilies,
    stunt: DEFENSE_TAXONOMY.stuntFamilies,
  };

  const families = familyMap[category];
  if (!families) return null;

  for (const [familyKey, familyDef] of Object.entries(families)) {
    for (const member of familyDef.members) {
      if (member.toLowerCase() === t) {
        return { family: familyKey, label: familyDef.label };
      }
    }
  }
  // No exact match — try substring/partial matching
  for (const [familyKey, familyDef] of Object.entries(families)) {
    for (const member of familyDef.members) {
      if (
        t.includes(member.toLowerCase()) ||
        member.toLowerCase().includes(t)
      ) {
        return { family: familyKey, label: familyDef.label };
      }
    }
  }
  return null;
}

/**
 * Check if a play's deadVs field conflicts with a defensive look.
 * @param {Object} play           – Playbook play with .deadVs field
 * @param {string} defCoverage    – Defensive coverage term to check
 * @param {string} defFront       – Defensive front term to check (optional)
 * @returns {{ isDead: boolean, reasons: string[] }}
 */
function checkDeadVs(play, defCoverage, defFront) {
  if (!play || !play.deadVs || !play.deadVs.trim())
    return { isDead: false, reasons: [] };
  const reasons = [];
  // Parse deadVs — can be comma-separated: "Man, Cover 0, Bear"
  const deadTerms = play.deadVs
    .split(/[,;\/]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (defCoverage) {
    const covNorm = normalizeDefense(defCoverage, "coverage");
    for (const deadTerm of deadTerms) {
      // Direct string match
      if (deadTerm === defCoverage.toLowerCase()) {
        reasons.push(`Dead vs ${defCoverage}`);
        continue;
      }
      // Family match — if deadVs says "Man" and coverage is "Cover 0" (same family)
      const deadNorm = normalizeDefense(deadTerm, "coverage");
      if (covNorm && deadNorm && covNorm.family === deadNorm.family) {
        reasons.push(`Dead vs ${deadNorm.label} (${defCoverage})`);
      }
    }
  }

  if (defFront) {
    const frontNorm = normalizeDefense(defFront, "front");
    for (const deadTerm of deadTerms) {
      if (deadTerm === defFront.toLowerCase()) {
        reasons.push(`Dead vs ${defFront}`);
        continue;
      }
      const deadNorm = normalizeDefense(deadTerm, "front");
      if (frontNorm && deadNorm && frontNorm.family === deadNorm.family) {
        reasons.push(`Dead vs ${deadNorm.label} (${defFront})`);
      }
    }
  }

  return { isDead: reasons.length > 0, reasons };
}

// ============ Game Week / Active Opponent ============
// Central concept that ties tendencies data to script, call sheet, and dashboard.

/**
 * Get the current game week configuration
 * @returns {{ opponentName: string|null, opponentIndex: number|null, weekLabel: string, notes: string }}
 */
function getGameWeek() {
  return storageManager.get(STORAGE_KEYS.GAME_WEEK, {
    opponentName: null,
    opponentIndex: null,
    weekLabel: "",
    notes: "",
  });
}

/**
 * Set the active game week opponent
 * @param {number|null} opponentIndex – Index into tendenciesOpponents array
 * @param {string} [weekLabel]        – e.g. "Week 3"
 */
function setGameWeek(opponentIndex, weekLabel) {
  const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
  const opp = opponentIndex !== null ? opponents[opponentIndex] : null;
  const gw = getGameWeek();
  gw.opponentIndex = opponentIndex;
  gw.opponentName = opp ? opp.name : null;
  if (weekLabel !== undefined) gw.weekLabel = weekLabel;
  storageManager.set(STORAGE_KEYS.GAME_WEEK, gw);
  // Invalidate script's scouting cache so next render fetches fresh data
  if (typeof invalidateScoutCache === "function") invalidateScoutCache();
}

/**
 * Get the active opponent's tendencies data
 * @returns {{ name: string, plays: Array }|null}
 */
function getActiveOpponent() {
  const gw = getGameWeek();
  if (gw.opponentIndex === null) return null;
  const opponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
  return opponents[gw.opponentIndex] || null;
}

// ============ Schedule Manager ============

/**
 * Get the season schedule
 * @returns {Array<{week: string, date: string, opponent: string, location: string}>}
 */
function getSchedule() {
  return storageManager.get(STORAGE_KEYS.SCHEDULE, []);
}

/**
 * Save the season schedule
 */
function saveSchedule(schedule) {
  storageManager.set(STORAGE_KEYS.SCHEDULE, schedule);
}

// ============ Game Plan Tags ============
// Tag plays for specific opponents so coaches can mark "this play is in our game plan for Week 4 vs Alabama"

/**
 * Generate a stable signature for a play (used as key for game plan tags)
 */
function playSignature(play) {
  // Use stable unique play ID if available (ensured by ensurePlaybookPlayIds on every load/import).
  // Fall back to field-based key only for plays that somehow lack an ID.
  if (play && play.id) return play.id;
  return getPlayIdentityKey(play, "tag");
}

/**
 * Get all game plan tags: { opponentName: [sig1, sig2, ...], ... }
 */
function getGamePlanTags() {
  return storageManager.get(STORAGE_KEYS.GAME_PLAN_TAGS, {});
}

/**
 * Check if a play is tagged for the given opponent
 */
function isPlayTaggedForOpponent(play, opponentName) {
  if (!opponentName) return false;
  const tags = getGamePlanTags();
  const sigs = tags[opponentName] || [];
  return sigs.includes(playSignature(play));
}

/**
 * Toggle a play's game plan tag for an opponent
 * @returns {boolean} new tagged state
 */
function togglePlayGamePlanTag(play, opponentName) {
  if (!opponentName) return false;
  const tags = getGamePlanTags();
  if (!tags[opponentName]) tags[opponentName] = [];
  const sig = playSignature(play);
  const idx = tags[opponentName].indexOf(sig);
  if (idx >= 0) {
    tags[opponentName].splice(idx, 1);
    storageManager.set(STORAGE_KEYS.GAME_PLAN_TAGS, tags);
    return false;
  } else {
    tags[opponentName].push(sig);
    storageManager.set(STORAGE_KEYS.GAME_PLAN_TAGS, tags);
    return true;
  }
}

/**
 * Get count of plays tagged for a given opponent
 */
function getGamePlanCount(opponentName) {
  if (!opponentName) return 0;
  const tags = getGamePlanTags();
  return (tags[opponentName] || []).length;
}

function clearGamePlanTagsForOpponent(opponentName) {
  if (!opponentName) return 0;
  const tags = getGamePlanTags();
  const existing = Array.isArray(tags[opponentName]) ? tags[opponentName] : [];
  const count = existing.length;
  if (!(opponentName in tags)) return 0;
  delete tags[opponentName];
  storageManager.set(STORAGE_KEYS.GAME_PLAN_TAGS, tags);
  return count;
}

/**
 * Check if a play is tagged for the active game week opponent
 */
function isPlayInGamePlan(play) {
  const gw = getGameWeek();
  return isPlayTaggedForOpponent(play, gw.opponentName);
}

// ============ Tendencies Query Engine ============
// Lets any module ask: "What does this opponent do in situation X?"

/**
 * Maps call sheet category contexts to tendencies filter criteria.
 * This is how the call sheet categories "talk to" the tendencies data.
 */
const SITUATION_TO_TENDENCIES = {
  // Down-based
  "1st-down": { down: ["1"] },
  "2nd-medium": { down: ["2"], distRange: [4, 6] },
  "2nd-long": { down: ["2"], distRange: [7, 99] },
  "3rd-short-1-3": { down: ["3"], distRange: [1, 3] },
  "3rd-short-2down": { down: ["3"], distRange: [1, 3] },
  "3rd-medium": { down: ["3"], distRange: [4, 7] },
  "3rd-long": { down: ["3"], distRange: [7, 99] },
  "4th-down": { down: ["4"] },

  // Situation-based
  "short-yardage": { situation: ["3rd & Short", "Goal Line"] },
  "2-minute": { situation: ["2-Minute"] },
  "4-minute": { situation: ["4-Minute"] },
  "backed-up": {
    situation: ["Backed Up"],
    fieldPos: "own",
    yardRange: [1, 10],
  },
  "rz-20": { situation: ["Red Zone"], fieldPos: "opp", yardRange: [11, 20] },
  "rz-10": { situation: ["Red Zone"], fieldPos: "opp", yardRange: [6, 10] },
  "rz-5": {
    situation: ["Red Zone", "Goal Line"],
    fieldPos: "opp",
    yardRange: [1, 5],
  },
  "goal-line": { situation: ["Goal Line"], fieldPos: "opp", yardRange: [1, 3] },
  saigon: { situation: ["Backed Up"] },

  // Back page — play-type categories (use overall filters; scouting shows what D does overall)
  openers: { down: ["1"] },
  "perimeter-screens": {},
  screen: {},
  "base-run": {},
  "run-options": {},
  "base-pass": {},
  quick: {},
  "play-action": {},
  rpos: {},
  movement: {},
};

/**
 * Query tendencies data for a specific context.
 * @param {Object} opponent   – Opponent object with .plays array
 * @param {Object} filters    – { down: ["3"], distRange: [7,99], situation: ["Red Zone"], etc. }
 * @returns {{ plays: Array, topFront: {term,count,pct}[], topCoverage: {term,count,pct}[], topBlitz: {term,count,pct}[], blitzRate: number, summary: string }}
 */
function queryTendencies(opponent, filters) {
  if (!opponent || !opponent.plays || opponent.plays.length === 0) {
    return {
      plays: [],
      topFront: [],
      topCoverage: [],
      topBlitz: [],
      topStunt: [],
      blitzRate: 0,
      summary: "No data",
    };
  }

  let matched = opponent.plays.filter((p) => {
    // Down filter
    if (filters.down && filters.down.length > 0) {
      if (!filters.down.includes(p.down)) return false;
    }
    // Distance range filter
    if (filters.distRange) {
      const dist = parseFloat(p.distance);
      if (isNaN(dist)) return false;
      if (dist < filters.distRange[0] || dist > filters.distRange[1])
        return false;
    }
    // Situation filter
    if (filters.situation && filters.situation.length > 0) {
      if (!filters.situation.includes(p.situation)) return false;
    }
    // Field position
    if (filters.fieldPos) {
      const fp = (p.fieldPosition || "").toLowerCase();
      if (fp !== filters.fieldPos) return false;
    }
    // Yard range
    if (filters.yardRange) {
      const yl = parseInt(p.yardLine, 10);
      if (isNaN(yl)) return false;
      if (yl < filters.yardRange[0] || yl > filters.yardRange[1]) return false;
    }
    // Offense formation filter (for smart suggestions)
    if (filters.offenseFormation) {
      if (
        (p.offenseFormation || "").toLowerCase() !==
        filters.offenseFormation.toLowerCase()
      )
        return false;
    }
    return true;
  });

  const total = matched.length;

  // Count distributions
  function topN(field, n) {
    const counts = {};
    matched.forEach((p) => {
      const val = p[field];
      if (val && val !== "None") counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([term, count]) => ({
        term,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        family: normalizeDefense(
          term,
          field === "defFront"
            ? "front"
            : field === "defCoverage"
              ? "coverage"
              : field === "defBlitz"
                ? "blitz"
                : "stunt",
        ),
      }));
  }

  const topFront = topN("defFront", 5);
  const topCoverage = topN("defCoverage", 5);
  const topBlitz = topN("defBlitz", 5);
  const topStunt = topN("defStunt", 5);
  const blitzCount = matched.filter(
    (p) => p.defBlitz && p.defBlitz !== "None",
  ).length;
  const blitzRate = total > 0 ? Math.round((blitzCount / total) * 100) : 0;

  // Build human-readable summary
  let summary = "";
  if (total === 0) {
    summary = "No data for this situation";
  } else {
    const parts = [];
    if (topFront.length > 0)
      parts.push(`Front: ${topFront[0].term} (${topFront[0].pct}%)`);
    if (topCoverage.length > 0)
      parts.push(`Cov: ${topCoverage[0].term} (${topCoverage[0].pct}%)`);
    if (blitzRate > 0) parts.push(`Blitz: ${blitzRate}%`);
    summary = `${total} plays — ${parts.join(" • ")}`;
  }

  return {
    plays: matched,
    topFront,
    topCoverage,
    topBlitz,
    topStunt,
    blitzRate,
    summary,
    total,
  };
}

/**
 * Get tendencies intel for a specific call sheet category.
 * @param {string} categoryId – e.g. "3rd-long", "rz-10"
 * @returns {Object|null} queryTendencies result or null if no opponent
 */
function getTendenciesForCategory(categoryId) {
  const opp = getActiveOpponent();
  if (!opp) return null;
  const filters = SITUATION_TO_TENDENCIES[categoryId];
  if (!filters) return null;
  return queryTendencies(opp, filters);
}

/**
 * Get the best defensive look for a play context (used by Script auto-fill).
 * Matches the play's preferred fields to tendencies data.
 * @param {Object} play – Playbook play with preferredDown, preferredDistance, preferredSituation, etc.
 * @returns {{ defFront: string, defCoverage: string, defBlitz: string, defStunt: string, confidence: number }|null}
 */
function getBestDefensiveLook(play) {
  const opp = getActiveOpponent();
  if (!opp) return null;

  // Build filters from play's preferred fields
  const filters = {};
  if (play.preferredDown) {
    filters.down = play.preferredDown
      .toString()
      .split(/[,\/]/)
      .map((s) => s.trim());
  }
  if (play.preferredDistance) {
    const dist = play.preferredDistance.toLowerCase().trim();
    if (dist === "short") filters.distRange = [1, 3];
    else if (dist === "medium") filters.distRange = [4, 6];
    else if (dist === "long") filters.distRange = [7, 99];
  }
  if (play.preferredSituation) {
    const sits = play.preferredSituation
      .split(/[,\/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sits.length > 0) filters.situation = sits;
  }

  const result = queryTendencies(opp, filters);
  if (result.total === 0) {
    // Fall back to broader query with just down
    if (filters.down) {
      const broadResult = queryTendencies(opp, { down: filters.down });
      if (broadResult.total > 0) {
        return {
          defFront: broadResult.topFront[0]?.term || "",
          defCoverage: broadResult.topCoverage[0]?.term || "",
          defBlitz: broadResult.topBlitz[0]?.term || "",
          defStunt: "",
          confidence: broadResult.total,
          note: `Based on ${broadResult.total} plays (broad match)`,
        };
      }
    }
    return null;
  }

  return {
    defFront: result.topFront[0]?.term || "",
    defCoverage: result.topCoverage[0]?.term || "",
    defBlitz: result.topBlitz[0]?.term || "",
    defStunt: "",
    confidence: result.total,
    note: `Based on ${result.total} plays`,
  };
}

/**
 * Score a play for a given situation — used by smart suggestions.
 * Higher score = better fit. Accounts for preferred tags + dead-vs.
 * @param {Object} play       – Playbook play
 * @param {Object} category   – Call sheet category definition
 * @param {Object|null} intel – queryTendencies result for the category
 * @returns {{ score: number, reasons: string[], warnings: string[] }}
 */
function scorePlayForSituation(play, category, intel) {
  let score = 0;
  const reasons = [];
  const warnings = [];

  // 1. Preferred down match
  if (category.down && play.preferredDown) {
    const downs = play.preferredDown
      .toString()
      .split(/[,\/]/)
      .map((s) => s.trim());
    if (downs.includes(category.down)) {
      score += 30;
      reasons.push(
        `Preferred for ${category.down}${category.down === "1" ? "st" : category.down === "2" ? "nd" : category.down === "3" ? "rd" : "th"} down`,
      );
    }
  }

  // 2. Preferred distance match
  if (category.distance && play.preferredDistance) {
    const dist = play.preferredDistance.toLowerCase().trim();
    const catDist = category.distance.toLowerCase().trim();
    if (dist === catDist) {
      score += 20;
      reasons.push(`Preferred for ${catDist} distance`);
    }
  }

  // 3. Preferred situation match
  if (category.situation && play.preferredSituation) {
    const sits = play.preferredSituation
      .split(/[,\/]/)
      .map((s) => s.trim().toLowerCase());
    if (sits.includes(category.situation.toLowerCase())) {
      score += 25;
      reasons.push(`Preferred for ${category.situation}`);
    }
  }

  // 4. Preferred field position match
  if (category.position && play.preferredFieldPosition) {
    const positions = play.preferredFieldPosition
      .split(/[,\/]/)
      .map((s) => s.trim().toLowerCase());
    const catPos = category.position.toLowerCase();
    if (positions.includes(catPos)) {
      score += 15;
      reasons.push(`Preferred for ${category.position}`);
    }
  }

  // 5. Dead-vs check — penalize if dead vs opponent's common look
  if (intel && intel.total > 0 && play.deadVs) {
    // Check against top coverage
    if (intel.topCoverage.length > 0) {
      const { isDead, reasons: deadReasons } = checkDeadVs(
        play,
        intel.topCoverage[0].term,
        null,
      );
      if (isDead) {
        const penalty = intel.topCoverage[0].pct >= 30 ? -40 : -20;
        score += penalty;
        deadReasons.forEach((r) =>
          warnings.push(`⚠️ ${r} (${intel.topCoverage[0].pct}% of the time)`),
        );
      }
    }
    // Check against top front
    if (intel.topFront.length > 0) {
      const { isDead, reasons: deadReasons } = checkDeadVs(
        play,
        null,
        intel.topFront[0].term,
      );
      if (isDead) {
        const penalty = intel.topFront[0].pct >= 30 ? -30 : -15;
        score += penalty;
        deadReasons.forEach((r) =>
          warnings.push(`⚠️ ${r} (${intel.topFront[0].pct}% of the time)`),
        );
      }
    }
  }

  return { score, reasons, warnings };
}

/**
 * Get smart play suggestions for a call sheet category.
 * @param {string} categoryId – e.g. "3rd-long"
 * @param {number} [limit]    – Max suggestions to return (default 20)
 * @returns {Array<{ play: Object, score: number, reasons: string[], warnings: string[] }>}
 */
function getSmartSuggestions(categoryId, limit = 20) {
  const category = [
    ...(typeof CALLSHEET_FRONT !== "undefined" ? CALLSHEET_FRONT : []),
    ...(typeof CALLSHEET_BACK !== "undefined" ? CALLSHEET_BACK : []),
  ].find((c) => c.id === categoryId);
  if (!category) return [];

  const intel = getTendenciesForCategory(categoryId);

  // Score every play in the playbook
  const scored = (typeof plays !== "undefined" ? plays : []).map((play) => {
    const { score, reasons, warnings } = scorePlayForSituation(
      play,
      category,
      intel,
    );
    return { play, score, reasons, warnings };
  });

  // Sort by score descending, then by play name
  scored.sort(
    (a, b) =>
      b.score - a.score || (a.play.play || "").localeCompare(b.play.play || ""),
  );

  // Return top N with score > 0 (or all if none match)
  const filtered = scored.filter((s) => s.score > 0);
  return filtered.length > 0
    ? filtered.slice(0, limit)
    : scored.slice(0, limit);
}

// ============ Smart Print Title ============

/**
 * Set document.title to a smart PDF filename before printing.
 * The browser uses document.title as the default "Save As" filename.
 * Returns a restore function to call after printing.
 *
 * @param {string} type - "Practice Script", "Wristband", "Game Plan", "Full Practice Day"
 * @param {string} [customName] - Optional custom name (e.g. script name, wristband name)
 * @returns {Function} Call this to restore the original title
 */
function setupPrintPageStyle(cssText) {
  let el = document.getElementById("appPrintStyle");
  if (!el) {
    el = document.createElement("style");
    el.id = "appPrintStyle";
    document.head.appendChild(el);
  }
  el.textContent = cssText;
  return el;
}

function setPrintTitle(type, customName) {
  const originalTitle = document.title;

  if (typeof buildPrintStudioFilename === "function") {
    document.title = buildPrintStudioFilename(type, customName);
    return function restoreTitle() {
      document.title = originalTitle;
    };
  }

  // Build date/time stamp
  const now = new Date();
  const datePart = now
    .toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");
  const timePart = now
    .toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/:/g, "");

  // Build filename parts
  let parts = [type];
  if (customName && customName.trim()) {
    parts.push(customName.trim());
  }
  parts.push(datePart);
  parts.push(timePart);

  // Clean filename (remove characters not safe for filenames)
  const title = parts.join(" - ").replace(/[<>:"\/|?*]/g, "_");
  document.title = title;

  return function restoreTitle() {
    document.title = originalTitle;
  };
}

/**
 * Get the configured team name (used in call sheet headers, game plan, etc.)
 * @returns {string}
 */
function getTeamName() {
  return storageManager.get(STORAGE_KEYS.TEAM_NAME, "My Team Football");
}

/**
 * Set the configured team name
 * @param {string} name
 */
function setTeamName(name) {
  storageManager.set(STORAGE_KEYS.TEAM_NAME, name);
  updateTeamSettingsAutosaveStatus();
  // Update header subtitle
  const teamSub = document.getElementById("teamSubtitle");
  if (teamSub) {
    teamSub.textContent = name && name !== "My Team Football" ? name : "";
  }
}

/**
 * Escape a string for safe use in HTML attribute values.
 * Defined here so it's available before installation.js loads.
 */
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
    .replace(/`/g, "&#96;");
}

// ============ Team Color Presets ============
// 12 named schemes inspired by college football programs.
// primary = header/accent bg; text = text on primary; accent = secondary stripe color.

const TEAM_COLOR_PRESETS = [
  { id: "subway-alumni", label: "Subway Alumni", primary: "#0C2340", text: "#FFFFFF", accent: "#C99700" },
  { id: "iron-tide", label: "Iron Tide", primary: "#9E1B32", text: "#FFFFFF", accent: "#BBBCBC" },
  { id: "war-eagles", label: "War Eagles", primary: "#03244D", text: "#FFFFFF", accent: "#E87722" },
  { id: "canes-unit", label: "Canes Unit", primary: "#005030", text: "#FFFFFF", accent: "#F47321" },
  { id: "skull-session", label: "Skull Session", primary: "#BB0000", text: "#FFFFFF", accent: "#808080" },
  { id: "big-house", label: "Big House", primary: "#00274C", text: "#FFFFFF", accent: "#FFCB05" },
  { id: "dawg-pound", label: "Dawg Pound", primary: "#BA0C2F", text: "#FFFFFF", accent: "#000000" },
  { id: "forty-acres", label: "Forty Acres", primary: "#BF5700", text: "#FFFFFF", accent: "#FFFFFF" },
  { id: "duck-hunt", label: "Duck Hunt", primary: "#154733", text: "#FFFFFF", accent: "#FEE123" },
  { id: "happy-valley", label: "Happy Valley", primary: "#041E42", text: "#FFFFFF", accent: "#FFFFFF" },
  { id: "death-valley", label: "Death Valley", primary: "#461D7C", text: "#FFFFFF", accent: "#FDD023" },
  { id: "sooner-magic", label: "Sooner Magic", primary: "#841617", text: "#FFFFFF", accent: "#FDF9D0" },
];

function getActiveColorPreset() {
  const id = storageManager.get(STORAGE_KEYS.COLOR_PRESET, "");
  if (!id) return null;
  return TEAM_COLOR_PRESETS.find(function (p) { return p.id === id; }) || null;
}

function setActiveColorPreset(id) {
  storageManager.set(STORAGE_KEYS.COLOR_PRESET, id || "");
}
