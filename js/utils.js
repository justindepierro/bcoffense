// Utility functions for the Practice Script & Playbook app

// ============ Custom Modal System ============
// Replaces native alert(), confirm(), prompt() with styled modals

/**
 * Show a styled alert modal (replaces alert())
 * @param {string} message - The message to display
 * @param {object} opts - Options: { title, icon }
 * @returns {Promise<void>}
 */
function showModal(message, opts = {}) {
  return new Promise((resolve) => {
    const title = opts.title || "Notice";
    const icon = opts.icon || "ℹ️";
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${icon}</span>
          <h3 class="custom-modal-title">${title}</h3>
        </div>
        <div class="custom-modal-body">${formatModalMessage(message)}</div>
        <div class="custom-modal-actions">
          <button class="btn btn-primary custom-modal-btn" id="modalOkBtn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const okBtn = overlay.querySelector("#modalOkBtn");
    okBtn.focus();

    function close() {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
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
 * Show a styled confirm modal (replaces confirm())
 * @param {string} message - The message to display
 * @param {object} opts - Options: { title, icon, confirmText, cancelText, danger }
 * @returns {Promise<boolean>}
 */
function showConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    const title = opts.title || "Confirm";
    const icon = opts.icon || "❓";
    const confirmText = opts.confirmText || "OK";
    const cancelText = opts.cancelText || "Cancel";
    const danger = opts.danger || false;

    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${icon}</span>
          <h3 class="custom-modal-title">${title}</h3>
        </div>
        <div class="custom-modal-body">${formatModalMessage(message)}</div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="modalCancelBtn">${cancelText}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"} custom-modal-btn" id="modalConfirmBtn">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const confirmBtn = overlay.querySelector("#modalConfirmBtn");
    const cancelBtn = overlay.querySelector("#modalCancelBtn");
    confirmBtn.focus();

    function close(result) {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
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
    const title = opts.title || "Input";
    const icon = opts.icon || "✏️";
    const placeholder = opts.placeholder || "";
    const confirmText = opts.confirmText || "OK";

    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${icon}</span>
          <h3 class="custom-modal-title">${title}</h3>
        </div>
        <div class="custom-modal-body">${formatModalMessage(message)}</div>
        <div class="custom-modal-input-wrap">
          <input type="text" class="custom-modal-input" id="modalInput"
                 value="${defaultValue.replace(/"/g, "&quot;")}" placeholder="${placeholder}">
        </div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="modalCancelBtn">Cancel</button>
          <button class="btn btn-primary custom-modal-btn" id="modalConfirmBtn">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const input = overlay.querySelector("#modalInput");
    const confirmBtn = overlay.querySelector("#modalConfirmBtn");
    const cancelBtn = overlay.querySelector("#modalCancelBtn");
    input.focus();
    input.select();

    function close(value) {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
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
          const iconStr = c.icon ? c.icon + " " : "";
          return `<button class="btn ${btnClass} custom-modal-btn custom-modal-btn-full" data-choice-value="${c.value}">${iconStr}${c.label}</button>`;
        })
        .join("");
    } else {
      const option1 = opts.option1 || "Option 1";
      const option2 = opts.option2 || "Option 2";
      buttonsHtml = `
        <button class="btn btn-primary custom-modal-btn custom-modal-btn-full" data-choice-value="option1">${option1}</button>
        <button class="btn btn-secondary custom-modal-btn custom-modal-btn-full" data-choice-value="option2">${option2}</button>
      `;
    }

    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${icon}</span>
          <h3 class="custom-modal-title">${title}</h3>
        </div>
        <div class="custom-modal-body">${formatModalMessage(message)}</div>
        <div class="custom-modal-actions custom-modal-actions-stacked">
          ${buttonsHtml}
          ${choices ? "" : '<button class="btn custom-modal-btn custom-modal-cancel custom-modal-btn-full" data-choice-value="__cancel__">Cancel</button>'}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const firstBtn = overlay.querySelector("[data-choice-value]");
    if (firstBtn) firstBtn.focus();

    function close(val) {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
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
    const title = opts.title || "Select";
    const icon = opts.icon || "📋";

    const itemsHtml = items
      .map(
        (item, i) => `
      <div class="custom-modal-list-item" data-index="${i}">
        <span class="custom-modal-list-num">${i + 1}</span>
        <div class="custom-modal-list-text">
          <span class="custom-modal-list-label">${item.label}</span>
          ${item.sublabel ? `<span class="custom-modal-list-sub">${item.sublabel}</span>` : ""}
        </div>
      </div>
    `,
      )
      .join("");

    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal custom-modal-wide">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">${icon}</span>
          <h3 class="custom-modal-title">${title}</h3>
        </div>
        ${message ? `<div class="custom-modal-body">${formatModalMessage(message)}</div>` : ""}
        <div class="custom-modal-list">${itemsHtml}</div>
        <div class="custom-modal-actions">
          <button class="btn custom-modal-btn custom-modal-cancel" id="modalCancelBtn">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    function close(val) {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(val);
    }

    overlay.querySelectorAll(".custom-modal-list-item").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.index);
        close(items[idx].value);
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

/**
 * Format message text for modal — converts \n to <br> and wraps in <p>
 */
function formatModalMessage(msg) {
  if (!msg) return "";
  return msg
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p>${line}</p>`)
    .join("");
}

// ============ Centralized Storage Manager ============
const STORAGE_VERSION = 2;

// All localStorage keys used by the app
const STORAGE_KEYS = {
  PLAYBOOK: "playbook",
  SAVED_SCRIPTS: "savedScripts",
  SAVED_WRISTBANDS: "savedWristbands",
  SORT_PRESETS: "sortPresets",
  CUSTOM_SORT_ORDERS: "customSortOrders",
  SCRIPT_CUSTOM_SORT_ORDERS: "scriptCustomSortOrders",
  PERIOD_TEMPLATES: "periodTemplates",
  CALL_SHEET: "callSheet",
  CALL_SHEET_SETTINGS: "callSheetSettings",
  COLUMN_VISIBILITY: "columnVisibility",
  PLAYBOOK_STATE: "playbookState",
  SCRIPT_DISPLAY_OPTIONS: "scriptDisplayOptions",
  SCRIPT_DRAFT: "scriptDraft",
  WRISTBAND_DRAFT: "wristbandDraft",
  CALLSHEET_DISPLAY_OPTIONS: "callSheetDisplayOptions",
  CALLSHEET_DISPLAY_PRESETS: "callSheetDisplayPresets",
  CALLSHEET_DRAFT: "callSheetDraft",
  CALLSHEET_TEMPLATES: "callSheetTemplates",
  CALLSHEET_CATEGORY_ORDER: "callSheetCategoryOrder",
  CALLSHEET_NOTES: "callSheetNotes",
  CALLSHEET_TARGETS: "callSheetTargets",
  CALLSHEET_COLLAPSED: "callSheetCollapsed",
  DEFENSIVE_TENDENCIES: "defensiveTendencies",
  TENDENCIES_DRAFT: "tendenciesDraft",
  TENDENCIES_SETTINGS: "tendenciesSettings",
  GAME_WEEK: "gameWeek",
  INSTALLATION: "installationData",
  CS_SCOUTING_OVERLAY: "csScoutingOverlay",
};

/**
 * Storage Manager - centralized storage operations
 */
const storageManager = {
  /**
   * Get a value from localStorage with default
   */
  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return defaultValue;
      return JSON.parse(value);
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return defaultValue;
    }
  },

  /**
   * Set a value in localStorage
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Error writing ${key} to localStorage:`, e);
      // Handle quota exceeded
      if (e.name === "QuotaExceededError") {
        showModal(
          "Storage is full! Please export a backup and clear some saved data.",
          { title: "Storage Full", icon: "⚠️" },
        );
      }
      return false;
    }
  },

  /**
   * Remove a key from localStorage
   */
  remove(key) {
    localStorage.removeItem(key);
  },

  /**
   * Get all data for backup
   */
  getAllData() {
    const data = {
      version: STORAGE_VERSION,
      exportDate: new Date().toISOString(),
    };

    // Include all storage keys
    Object.values(STORAGE_KEYS).forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        data[key] = value;
      }
    });

    return data;
  },

  /**
   * Restore all data from backup
   */
  async restoreAllData(backup, options = { confirmOverwrite: true }) {
    // Validate backup
    if (!backup || typeof backup !== "object") {
      throw new Error("Invalid backup format");
    }

    // Check for essential data
    const hasData =
      backup.playbook || backup.savedScripts || backup.savedWristbands;
    if (!hasData) {
      throw new Error("No data found in backup");
    }

    // Confirm if needed
    if (options.confirmOverwrite) {
      const msg = `This will replace your current data with the backup from ${
        backup.exportDate
          ? new Date(backup.exportDate).toLocaleDateString()
          : "unknown date"
      }. Continue?`;
      const ok = await showConfirm(msg, {
        title: "Restore Backup",
        icon: "📥",
        confirmText: "Restore",
      });
      if (!ok) return false;
    }

    // Restore all known keys
    Object.values(STORAGE_KEYS).forEach((key) => {
      if (backup[key] !== undefined) {
        // Handle both raw JSON strings and parsed objects
        const value =
          typeof backup[key] === "string"
            ? backup[key]
            : JSON.stringify(backup[key]);
        localStorage.setItem(key, value);
      }
    });

    return true;
  },

  /**
   * Get storage usage info
   */
  getStorageInfo() {
    let totalSize = 0;
    const itemSizes = {};

    Object.values(STORAGE_KEYS).forEach((key) => {
      const value = localStorage.getItem(key);
      if (value) {
        const size = new Blob([value]).size;
        itemSizes[key] = size;
        totalSize += size;
      }
    });

    return {
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      itemSizes,
      itemCount: Object.keys(itemSizes).length,
    };
  },

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  },

  /**
   * Clear all app data
   */
  async clearAll(confirmFirst = true) {
    if (confirmFirst) {
      const ok = await showConfirm(
        "⚠️ This will delete ALL your saved data including playbook, scripts, wristbands, and settings. This cannot be undone!\n\nAre you sure?",
        {
          title: "Clear All Data",
          icon: "⚠️",
          confirmText: "Delete Everything",
          danger: true,
        },
      );
      if (!ok) {
        return false;
      }
    }

    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });

    return true;
  },
};

/**
 * Export complete backup to JSON file
 */
function exportCompleteBackup() {
  const backup = storageManager.getAllData();

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const date = new Date().toISOString().split("T")[0];
  a.download = `playbook-complete-backup-${date}.json`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const info = storageManager.getStorageInfo();
  showModal(
    `Complete backup exported!\n\nBackup size: ${info.totalSizeFormatted}\nItems saved: ${info.itemCount}`,
    { title: "Backup Complete", icon: "✅" },
  );
}

/**
 * Import complete backup from JSON file
 */
function importCompleteBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const backup = JSON.parse(e.target.result);

      if (await storageManager.restoreAllData(backup)) {
        // Reload app state from storage
        reloadAppFromStorage();
        await showModal("Backup restored successfully! Refreshing...", {
          title: "Restored",
          icon: "✅",
        });
        location.reload();
      }
    } catch (err) {
      await showModal("Error reading backup file: " + err.message, {
        title: "Import Error",
        icon: "❌",
      });
    }
  };
  reader.readAsText(file);

  event.target.value = "";
}

/**
 * Reload global app state from localStorage
 * Called after importing a backup
 */
function reloadAppFromStorage() {
  // Reload playbook
  const storedPlaybook = localStorage.getItem(STORAGE_KEYS.PLAYBOOK);
  if (storedPlaybook) {
    try {
      plays = JSON.parse(storedPlaybook);
      filteredPlays = [...plays];
    } catch (e) {}
  }

  // Reload sort presets
  const storedPresets = localStorage.getItem(STORAGE_KEYS.SORT_PRESETS);
  if (storedPresets && typeof savedSortPresets !== "undefined") {
    try {
      savedSortPresets = JSON.parse(storedPresets);
    } catch (e) {}
  }

  // Reload period templates
  const storedTemplates = localStorage.getItem(STORAGE_KEYS.PERIOD_TEMPLATES);
  if (storedTemplates && typeof periodTemplates !== "undefined") {
    try {
      periodTemplates = JSON.parse(storedTemplates);
    } catch (e) {}
  }

  // Reload custom sort orders (wristband)
  const storedCustomOrders = localStorage.getItem(
    STORAGE_KEYS.CUSTOM_SORT_ORDERS,
  );
  if (storedCustomOrders && typeof wbCustomSortOrders !== "undefined") {
    try {
      wbCustomSortOrders = JSON.parse(storedCustomOrders);
    } catch (e) {}
  }

  // Reload call sheet
  const storedCallSheet = localStorage.getItem(STORAGE_KEYS.CALL_SHEET);
  if (storedCallSheet && typeof callSheet !== "undefined") {
    try {
      callSheet = JSON.parse(storedCallSheet);
    } catch (e) {}
  }

  // Reload call sheet settings
  const storedSettings = localStorage.getItem(STORAGE_KEYS.CALL_SHEET_SETTINGS);
  if (storedSettings && typeof callSheetSettings !== "undefined") {
    try {
      callSheetSettings = JSON.parse(storedSettings);
    } catch (e) {}
  }

  // Reload script custom sort orders
  const storedScriptSortOrders = localStorage.getItem(
    STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
  );
  if (storedScriptSortOrders && typeof scriptCustomSortOrders !== "undefined") {
    try {
      scriptCustomSortOrders = JSON.parse(storedScriptSortOrders);
    } catch (e) {}
  }

  // Reload defensive tendencies
  if (typeof tendenciesOpponents !== "undefined") {
    try {
      tendenciesOpponents = storageManager.get(STORAGE_KEYS.DEFENSIVE_TENDENCIES, []);
    } catch (e) {}
  }

  // Reload scouting overlay state
  if (typeof csScoutingOverlayOn !== "undefined") {
    try {
      csScoutingOverlayOn = storageManager.get(STORAGE_KEYS.CS_SCOUTING_OVERLAY, false);
    } catch (e) {}
  }

  // Restore call sheet display options
  if (typeof restoreCallSheetDisplayOptions === "function") {
    restoreCallSheetDisplayOptions();
  }

  // Restore script display options
  if (typeof restoreScriptDisplayOptions === "function") {
    restoreScriptDisplayOptions();
  }

  // Restore column visibility
  if (typeof restoreColumnVisibility === "function") {
    restoreColumnVisibility();
  }

  // Restore playbook filter/sort state
  if (typeof restorePlaybookState === "function") {
    restorePlaybookState();
  }
}

/**
 * Show storage info modal with usage details
 */
function showStorageInfo() {
  const info = storageManager.getStorageInfo();

  // Map keys to friendly names
  const friendlyNames = {
    playbook: "Playbook",
    savedScripts: "Saved Scripts",
    savedWristbands: "Saved Wristbands",
    sortPresets: "Sort Presets",
    customSortOrders: "Custom Sort Orders",
    scriptCustomSortOrders: "Script Sort Orders",
    periodTemplates: "Period Templates",
    callSheet: "Call Sheet",
    callSheetSettings: "Call Sheet Settings",
    columnVisibility: "Column Visibility",
    playbookState: "Playbook Filter State",
    scriptDisplayOptions: "Script Display Options",
    scriptDraft: "Script Autosave Draft",
    wristbandDraft: "Wristband Autosave Draft",
  };

  // Get counts where applicable
  const counts = {};
  try {
    const playbook = storageManager.get(STORAGE_KEYS.PLAYBOOK, []);
    counts.playbook = Array.isArray(playbook) ? playbook.length : 0;

    const scripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
    counts.savedScripts = Array.isArray(scripts)
      ? scripts.length
      : Object.keys(scripts).length;

    const wristbands = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
    counts.savedWristbands = Array.isArray(wristbands) ? wristbands.length : 0;

    const presets = storageManager.get(STORAGE_KEYS.SORT_PRESETS, {});
    counts.sortPresets =
      typeof presets === "object" ? Object.keys(presets).length : 0;

    const templates = storageManager.get(STORAGE_KEYS.PERIOD_TEMPLATES, []);
    counts.periodTemplates = Array.isArray(templates) ? templates.length : 0;
  } catch (e) {}

  // Build items table
  let itemsHtml = "";
  Object.entries(info.itemSizes).forEach(([key, size]) => {
    const name = friendlyNames[key] || key;
    const sizeStr = storageManager.formatBytes(size);
    const countStr = counts[key] !== undefined ? ` (${counts[key]} items)` : "";
    itemsHtml += `
      <tr>
        <td style="padding: 5px 10px;">${name}${countStr}</td>
        <td style="padding: 5px 10px; text-align: right;">${sizeStr}</td>
      </tr>
    `;
  });

  const modalHtml = `
    <div id="storageInfoModal" class="modal-overlay" style="display: flex;" onclick="closeStorageInfoModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
          <h3 style="margin: 0;">💾 Storage Information</h3>
          <button onclick="closeStorageInfoModal()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">✕</button>
        </div>
        
        <div style="margin-bottom: 15px; padding: 10px; background: #f0f7ff; border-radius: 8px;">
          <strong>Total Storage Used:</strong> ${info.totalSizeFormatted}
          <div style="font-size: 11px; color: #666; margin-top: 5px;">
            localStorage limit is typically 5-10 MB per domain
          </div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px 10px; text-align: left;">Data Type</th>
              <th style="padding: 8px 10px; text-align: right;">Size</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || '<tr><td colspan="2" style="padding: 10px; text-align: center; color: #666;">No data stored</td></tr>'}
          </tbody>
        </table>
        
        <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button onclick="exportBackup()" class="btn btn-primary" style="padding: 8px 16px;">
            📥 Export Backup
          </button>
          <button onclick="if(storageManager.clearAll()) location.reload();" class="btn btn-danger" style="padding: 8px 16px;">
            🗑️ Clear All Data
          </button>
          <button onclick="closeStorageInfoModal()" class="btn" style="padding: 8px 16px;">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

/**
 * Close storage info modal
 */
function closeStorageInfoModal(event) {
  if (event && event.target.id !== "storageInfoModal") return;
  const modal = document.getElementById("storageInfoModal");
  if (modal) modal.remove();
}

// History management for undo/redo (max 50 states)
const historyManager = {
  script: { past: [], future: [] },
  wristband: { past: [], future: [] },
  tendencies: { past: [], future: [] },
  maxHistory: 50,

  // Save current state before making changes
  saveState(type, state) {
    const history = this[type];
    // Deep clone the state
    const stateCopy = JSON.parse(JSON.stringify(state));
    history.past.push(stateCopy);
    // Clear future on new action
    history.future = [];
    // Limit history size
    if (history.past.length > this.maxHistory) {
      history.past.shift();
    }
    this.updateButtons(type);
  },

  // Undo last action
  undo(type, currentState) {
    const history = this[type];
    if (history.past.length === 0) return null;

    // Save current state to future
    history.future.push(JSON.parse(JSON.stringify(currentState)));
    // Get previous state
    const previousState = history.past.pop();
    this.updateButtons(type);
    return previousState;
  },

  // Redo last undone action
  redo(type, currentState) {
    const history = this[type];
    if (history.future.length === 0) return null;

    // Save current state to past
    history.past.push(JSON.parse(JSON.stringify(currentState)));
    // Get future state
    const futureState = history.future.pop();
    this.updateButtons(type);
    return futureState;
  },

  // Clear history
  clear(type) {
    this[type].past = [];
    this[type].future = [];
    this.updateButtons(type);
  },

  // Update button states
  updateButtons(type) {
    const history = this[type];
    const undoBtn = document.getElementById(`${type}UndoBtn`);
    const redoBtn = document.getElementById(`${type}RedoBtn`);

    if (undoBtn) {
      undoBtn.disabled = history.past.length === 0;
      undoBtn.title =
        history.past.length > 0
          ? `Undo (${history.past.length})`
          : "Nothing to undo";
    }
    if (redoBtn) {
      redoBtn.disabled = history.future.length === 0;
      redoBtn.title =
        history.future.length > 0
          ? `Redo (${history.future.length})`
          : "Nothing to redo";
    }
  },

  canUndo(type) {
    return this[type].past.length > 0;
  },

  canRedo(type) {
    return this[type].future.length > 0;
  },
};

/**
 * Parse CSV text into an array of play objects
 * @param {string} text - Raw CSV text content
 * @returns {Array} Array of play objects
 */
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const result = [];

  // Skip the first row (headers)
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    // Map CSV columns to play object
    // Columns: PlayType, Personnel, Formation, FormTag1, FormTag2, Under, Back, Shift, Motion, Protection, LineCall, Play, PlayTag1, PlayTag2, BasePlay, OneWord, PreferredSituation, PreferredDown, PreferredDistance, PreferredHash, PreferredFieldPosition, Tempo, PracticeFront, PracticeDefense, PracticeCoverage, PracticeBlitz, PracticeStunt, KeyPlayer1, KeyPlayer2, KeyPlayer3, HitChart1, HitChart2, HitChart3, Constraint1, Constraint2, Constraint3, DeadVs, Opponent, Notes
    if (values.length >= 10) {
      result.push({
        type: values[0] || "",
        personnel: values[1] || "",
        formation: values[2] || "",
        formTag1: values[3] || "",
        formTag2: values[4] || "",
        under: values[5] || "",
        back: values[6] || "",
        shift: values[7] || "",
        motion: values[8] || "",
        protection: values[9] || "",
        lineCall: values[10] || "",
        play: values[11] || "",
        playTag1: values[12] || "",
        playTag2: values[13] || "",
        basePlay: values[14] || "",
        oneWord: values[15] || "",
        preferredSituation: values[16] || "",
        preferredDown: values[17] || "",
        preferredDistance: values[18] || "",
        preferredHash: values[19] || "",
        preferredFieldPosition: values[20] || "",
        tempo: values[21] || "",
        practiceFront: values[22] || "",
        practiceDefense: values[23] || "",
        practiceCoverage: values[24] || "",
        practiceBlitz: values[25] || "",
        practiceStunt: values[26] || "",
        keyPlayer1: values[27] || "",
        keyPlayer2: values[28] || "",
        keyPlayer3: values[29] || "",
        hitChart1: values[30] || "",
        hitChart2: values[31] || "",
        hitChart3: values[32] || "",
        constraint1: values[33] || "",
        constraint2: values[34] || "",
        constraint3: values[35] || "",
        deadVs: values[36] || "",
        opponent: values[37] || "",
        notes: values[38] || "",
      });
    }
  }
  return result;
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
    highlightHuddle = false,
    highlightCandy = false,
  } = options;

  // Check if play has "Under" - check the under column or legacy formTag locations
  const hasUnder =
    (play.under && play.under.trim() !== "") ||
    (play.formTag1 && play.formTag1.toLowerCase() === "under") ||
    (play.formTag2 && play.formTag2.toLowerCase() === "under");

  let parts = [];

  // Build full call
  if (play.formation) parts.push(play.formation);
  if (play.formTag1 && !(underEmoji && play.formTag1.toLowerCase() === "under"))
    parts.push(play.formTag1);
  if (play.formTag2 && !(underEmoji && play.formTag2.toLowerCase() === "under"))
    parts.push(play.formTag2);
  // Add Under (if not using emoji display for it)
  if (play.under && !(underEmoji && play.under.trim() !== ""))
    parts.push(play.under);
  if (play.back) parts.push(play.back);

  // Handle shift with bold/red options
  if (play.shift) {
    let shiftHtml = play.shift;
    if (boldShifts) shiftHtml = `<b>${shiftHtml}</b>`;
    if (redShifts) shiftHtml = `<span style="color:red">${shiftHtml}</span>`;
    parts.push(shiftHtml);
  }

  // Handle motion with italic/red options
  if (play.motion) {
    let motionHtml = play.motion;
    if (italicMotions) motionHtml = `<i>${motionHtml}</i>`;
    if (redMotions) motionHtml = `<span style="color:red">${motionHtml}</span>`;
    parts.push(motionHtml);
  }

  if (play.protection) parts.push(play.protection);
  if (play.play) parts.push(play.play);
  if (play.playTag1) parts.push(play.playTag1);
  if (play.playTag2) parts.push(play.playTag2);

  let fullCall = parts.join(" ");

  // Remove vowels if requested (but preserve HTML tags)
  if (noVowels) {
    fullCall = fullCall.replace(/([^<>]+)(?=<|$)/g, (match) =>
      removeVowels(match),
    );
  }

  // Add line call in brackets
  if (showLineCall && play.lineCall) {
    const lc = noVowels ? removeVowels(play.lineCall) : play.lineCall;
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

/**
 * Compare two plays to determine if they match
 * @param {Object} p1 - First play object
 * @param {Object} p2 - Second play object
 * @returns {boolean} True if plays match
 */
function playsMatch(p1, p2) {
  if (!p1 || !p2) return false;

  // First try exact match on key fields
  if (
    p1.formation === p2.formation &&
    p1.play === p2.play &&
    p1.personnel === p2.personnel
  ) {
    return true;
  }

  // Try match without personnel
  if (p1.formation === p2.formation && p1.play === p2.play) {
    return true;
  }

  // Try case-insensitive match
  const f1 = (p1.formation || "").toLowerCase().trim();
  const f2 = (p2.formation || "").toLowerCase().trim();
  const n1 = (p1.play || "").toLowerCase().trim();
  const n2 = (p2.play || "").toLowerCase().trim();

  return f1 === f2 && n1 === n2;
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

const GAME_WEEK_KEY = "gameWeek";

/**
 * Get the current game week configuration
 * @returns {{ opponentName: string|null, opponentIndex: number|null, weekLabel: string, notes: string }}
 */
function getGameWeek() {
  return storageManager.get(GAME_WEEK_KEY, {
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
  const opponents = storageManager.get("defensiveTendencies", []);
  const opp = opponentIndex !== null ? opponents[opponentIndex] : null;
  const gw = getGameWeek();
  gw.opponentIndex = opponentIndex;
  gw.opponentName = opp ? opp.name : null;
  if (weekLabel !== undefined) gw.weekLabel = weekLabel;
  storageManager.set(GAME_WEEK_KEY, gw);
}

/**
 * Get the active opponent's tendencies data
 * @returns {{ name: string, plays: Array }|null}
 */
function getActiveOpponent() {
  const gw = getGameWeek();
  if (gw.opponentIndex === null) return null;
  const opponents = storageManager.get("defensiveTendencies", []);
  return opponents[gw.opponentIndex] || null;
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
      const yl = parseInt(p.yardLine);
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
function setPrintTitle(type, customName) {
  const originalTitle = document.title;

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
