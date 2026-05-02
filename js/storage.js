function getDraftTimestamp(draft) {
  if (!draft || typeof draft !== "object") return 0;
  if (typeof draft.timestamp === "number" && Number.isFinite(draft.timestamp)) {
    return draft.timestamp;
  }
  if (!draft.savedAt) return 0;

  const parsed = new Date(draft.savedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDraftExpired(draft, maxAgeMs = DRAFT_EXPIRY_MS) {
  const timestamp = getDraftTimestamp(draft);
  if (!timestamp) return true;
  return Date.now() - timestamp > maxAgeMs;
}

function formatDraftSavedAt(draft, locale = "en-US", opts = {}) {
  const timestamp = getDraftTimestamp(draft);
  if (!timestamp) return opts.fallback || "unknown time";

  const formatOptions = opts.formatOptions || {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };

  return new Date(timestamp).toLocaleString(locale, formatOptions);
}

function queueAutosave(existingTimer, saveDraft, opts = {}) {
  if (existingTimer) clearTimeout(existingTimer);
  if (typeof opts.onQueue === "function") opts.onQueue();
  return setTimeout(saveDraft, opts.delay || AUTOSAVE_DEBOUNCE_MS);
}

function persistDraftData(storageKey, draft, opts = {}) {
  if (!storageKey || !draft || typeof draft !== "object") return draft;

  const timestampField = opts.timestampField || "savedAt";
  const payload = {
    ...draft,
    [timestampField]:
      draft[timestampField] ||
      (timestampField === "timestamp" ? Date.now() : new Date().toISOString()),
  };

  storageManager.set(storageKey, payload);
  return payload;
}

function discardDraftData(storageKey, timerId = null) {
  if (timerId) clearTimeout(timerId);
  storageManager.remove(storageKey);
  return null;
}

const STORAGE_VERSION = 2;

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
  PLAY_COLLECTIONS: "playCollections",
  CALLSHEET_CONSTRAINTS: "callSheetConstraints",
  OB_PLAY_RATINGS: "ob_playRatings",
  LAST_ACTIVE_TAB: "lastActiveTab",
  THEME: "theme",
  SCHEDULE: "schedule",
  GAME_PLAN_TAGS: "gamePlanTags",
  WRISTBAND_SORT_CRITERIA: "wristbandSortCriteria",
  WRISTBAND_FAVORITES: "wristbandFavorites",
  TEAM_ROSTER: "teamRoster",
  TEAM_PERSONNEL_PACKAGES: "teamPersonnelPackages",
  TEAM_SWAP_GROUPS: "teamSwapGroups",
  TEAM_ASSIGNMENT_LABELS: "teamAssignmentLabels",
  TEAM_SETTINGS_COLLAPSED: "teamSettingsCollapsed",
};

const MIGRATIONS = {
  // Example: version 1 → 2 migration (no-op, initial schema)
  // 2: () => { /* transform data from v1 → v2 */ },
};

function runMigrations() {
  const saved = parseInt(localStorage.getItem("_storageVersion") || "0", 10);
  if (saved >= STORAGE_VERSION) return;
  for (let v = saved + 1; v <= STORAGE_VERSION; v++) {
    if (typeof MIGRATIONS[v] === "function") {
      try {
        MIGRATIONS[v]();
        console.debug(`Storage migration v${v} applied`);
      } catch (e) {
        console.error(`Storage migration v${v} failed:`, e);
        break;
      }
    }
  }
  localStorage.setItem("_storageVersion", String(STORAGE_VERSION));
}

const storageManager = {
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

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Error writing ${key} to localStorage:`, e);
      if (e.name === "QuotaExceededError") {
        showModal(
          "Storage is full! Please export a backup and clear some saved data.",
          { title: "Storage Full", icon: "⚠️" },
        );
      }
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  getAllData() {
    const data = {
      version: STORAGE_VERSION,
      exportDate: new Date().toISOString(),
    };

    Object.values(STORAGE_KEYS).forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        data[key] = value;
      }
    });

    return data;
  },

  async restoreAllData(backup, options = { confirmOverwrite: true }) {
    if (!backup || typeof backup !== "object") {
      throw new Error("Invalid backup format");
    }

    const hasData =
      backup.playbook || backup.savedScripts || backup.savedWristbands;
    if (!hasData) {
      throw new Error("No data found in backup");
    }

    if (options.confirmOverwrite) {
      const msg = `This will replace your current data with the backup from ${backup.exportDate
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

    Object.values(STORAGE_KEYS).forEach((key) => {
      if (backup[key] !== undefined) {
        const value =
          typeof backup[key] === "string"
            ? backup[key]
            : JSON.stringify(backup[key]);
        localStorage.setItem(key, value);
      }
    });

    return true;
  },

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

  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  },

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

(function initCrossTabProtection() {
  let _crossTabToastShown = false;
  window.addEventListener("storage", (e) => {
    if (!e.key || !Object.values(STORAGE_KEYS).includes(e.key)) return;
    if (_crossTabToastShown) return;
    _crossTabToastShown = true;
    showToast(
      '⚠️ Data changed in another tab. <button data-action="reloadPage" class="btn btn-sm btn-ghost-current btn-inline-offset-sm">Reload</button>',
      8000,
    );
    setTimeout(() => {
      _crossTabToastShown = false;
    }, 9000);
  });
})();

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

function importCompleteBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const backup = safeJSONParse(e.target.result, null);
      if (!backup) throw new Error("Invalid JSON");

      if (await storageManager.restoreAllData(backup)) {
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

function reloadAppFromStorage() {
  const storedPlaybook = storageManager.get(STORAGE_KEYS.PLAYBOOK, null);
  if (storedPlaybook) {
    plays = storedPlaybook;
    filteredPlays = [...plays];
  }

  if (typeof savedSortPresets !== "undefined") {
    savedSortPresets = storageManager.get(STORAGE_KEYS.SORT_PRESETS, {});
  }

  if (typeof periodTemplates !== "undefined") {
    periodTemplates = storageManager.get(STORAGE_KEYS.PERIOD_TEMPLATES, []);
  }

  if (typeof wbCustomSortOrders !== "undefined") {
    wbCustomSortOrders = storageManager.get(
      STORAGE_KEYS.CUSTOM_SORT_ORDERS,
      {},
    );
  }

  if (typeof callSheet !== "undefined") {
    const cs = storageManager.get(STORAGE_KEYS.CALL_SHEET, null);
    if (cs) callSheet = cs;
  }

  if (typeof callSheetSettings !== "undefined") {
    const css = storageManager.get(STORAGE_KEYS.CALL_SHEET_SETTINGS, null);
    if (css) callSheetSettings = css;
  }

  if (typeof scriptCustomSortOrders !== "undefined") {
    scriptCustomSortOrders = storageManager.get(
      STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
      {},
    );
  }

  if (typeof tendenciesOpponents !== "undefined") {
    tendenciesOpponents = storageManager.get(
      STORAGE_KEYS.DEFENSIVE_TENDENCIES,
      [],
    );
  }

  if (typeof csScoutingOverlayOn !== "undefined") {
    csScoutingOverlayOn = storageManager.get(
      STORAGE_KEYS.CS_SCOUTING_OVERLAY,
      false,
    );
  }

  if (typeof restoreCallSheetDisplayOptions === "function") {
    restoreCallSheetDisplayOptions();
  }

  if (typeof restoreScriptDisplayOptions === "function") {
    restoreScriptDisplayOptions();
  }

  if (typeof restoreColumnVisibility === "function") {
    restoreColumnVisibility();
  }

  if (typeof restorePlaybookState === "function") {
    restorePlaybookState();
  }
}

function showStorageInfo() {
  const info = storageManager.getStorageInfo();

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
  } catch (e) { }

  let itemsHtml = "";
  Object.entries(info.itemSizes).forEach(([key, size]) => {
    const name = friendlyNames[key] || key;
    const sizeStr = storageManager.formatBytes(size);
    const countStr = counts[key] !== undefined ? ` (${counts[key]} items)` : "";
    itemsHtml += `<tr><td class="si-td">${escapeHtml(name)}${escapeHtml(countStr)}</td><td class="si-td si-td-right">${escapeHtml(sizeStr)}</td></tr>`;
  });

  const body = `
    <div class="si-summary">
      <strong>Total Storage Used:</strong> ${escapeHtml(info.totalSizeFormatted)}
      <div class="si-hint">localStorage limit is typically 5-10 MB per domain</div>
    </div>
    <table class="si-table">
      <thead><tr class="si-thead-row"><th class="si-th">Data Type</th><th class="si-th si-th-right">Size</th></tr></thead>
      <tbody>${itemsHtml || '<tr><td colspan="2" class="si-empty">No data stored</td></tr>'}</tbody>
    </table>
    <div class="si-actions">
      <button id="siExportBtn" class="btn btn-primary">📥 Export Backup</button>
      <button id="siClearBtn" class="btn btn-danger">🗑️ Clear All Data</button>
    </div>`;

  showModal(body, { title: "💾 Storage Information", confirmText: "Close" });

  setTimeout(() => {
    document
      .getElementById("siExportBtn")
      ?.addEventListener("click", () => exportBackup());
    document.getElementById("siClearBtn")?.addEventListener("click", () => {
      if (storageManager.clearAll()) location.reload();
    });
  }, 0);
}