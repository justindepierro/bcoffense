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

const STORAGE_VERSION = 3;

const STORAGE_KEYS = {
  PLAYBOOK: "playbook",
  SAVED_SCRIPTS: "savedScripts",
  SAVED_WRISTBANDS: "savedWristbands",
  WRISTBAND_TEMPLATES: "wristbandTemplates",
  SORT_PRESETS: "sortPresets",
  CUSTOM_SORT_ORDERS: "customSortOrders",
  SCRIPT_CUSTOM_SORT_ORDERS: "scriptCustomSortOrders",
  PERIOD_TEMPLATES: "periodTemplates",
  SCRIPT_TEMPLATES: "scriptTemplates",
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
  MOBILE_COACH_LOCK: "mobileCoachLock",
  INSTALLATION: "installationData",
  CS_SCOUTING_OVERLAY: "csScoutingOverlay",
  PLAY_COLLECTIONS: "playCollections",
  CALLSHEET_CONSTRAINTS: "callSheetConstraints",
  OB_PLAY_RATINGS: "ob_playRatings",
  LAST_ACTIVE_TAB: "lastActiveTab",
  THEME: "theme",
  VISION_MODE: "visionMode",
  SCHEDULE: "schedule",
  GAME_PLAN_TAGS: "gamePlanTags",
  PRINT_STUDIO_SETTINGS: "printStudioSettings",
  WRISTBAND_SORT_CRITERIA: "wristbandSortCriteria",
  WRISTBAND_FAVORITES: "wristbandFavorites",
  TEAM_ROSTER: "teamRoster",
  TEAM_NAME: "teamName",
  TEAM_PERSONNEL_PACKAGES: "teamPersonnelPackages",
  TEAM_SWAP_GROUPS: "teamSwapGroups",
  TEAM_ASSIGNMENT_LABELS: "teamAssignmentLabels",
  TEAM_SETTINGS_COLLAPSED: "teamSettingsCollapsed",
  GAME_PLAN_BOARDS: "gamePlanBoards",
  GAME_PLAN_TEMPLATES: "gamePlanTemplates",
  CALLSHEET_PRINT_OPTIONS: "callSheetPrintOptions",
  CLOUD_SYNC_SETTINGS: "cloudSyncSettings",
};

const MIGRATIONS = {
  // Example: version 1 → 2 migration (no-op, initial schema)
  // 2: () => { /* transform data from v1 → v2 */ },
  3: () => {
    const raw = localStorage.getItem(STORAGE_KEYS.PLAYBOOK);
    const stored = safeJSONParse(raw, null);
    if (!Array.isArray(stored)) return;
    const changed = ensurePlaybookPlayIds(stored);
    if (changed > 0) {
      localStorage.setItem(STORAGE_KEYS.PLAYBOOK, JSON.stringify(stored));
    }
  },
};

function validateBackupPayload(backup) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    itemCount: 0,
    imageCount: 0,
    exportDate: backup && backup.exportDate ? backup.exportDate : "",
  };

  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    result.valid = false;
    result.errors.push("Backup must be a JSON object.");
    return result;
  }

  const knownKeys = Object.values(STORAGE_KEYS);
  knownKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(backup, key)) return;
    const value = backup[key];
    if (value === undefined) return;
    result.itemCount += 1;
    if (typeof value === "string") {
      try {
        JSON.parse(value);
      } catch (_err) {
        result.valid = false;
        result.errors.push(`${key} is not valid JSON.`);
      }
      return;
    }
    try {
      JSON.stringify(value);
    } catch (_err) {
      result.valid = false;
      result.errors.push(`${key} cannot be serialized.`);
    }
  });

  if (Object.prototype.hasOwnProperty.call(backup, "playImages")) {
    const imageMap = backup.playImages;
    if (!imageMap || typeof imageMap !== "object" || Array.isArray(imageMap)) {
      result.valid = false;
      result.errors.push("playImages must be an object.");
    } else {
      const imageEntries = Object.entries(imageMap);
      result.imageCount = imageEntries.length;
      const invalidImage = imageEntries
        .slice(0, 50)
        .find(([, value]) => typeof value !== "string" || !value.startsWith("data:image/"));
      if (invalidImage) {
        result.valid = false;
        result.errors.push("playImages contains a non-image data URL.");
      }
    }
  }

  if (result.itemCount === 0 && result.imageCount === 0) {
    result.valid = false;
    result.errors.push("No BCOffense data was found in the backup.");
  }

  if (!backup.version) {
    result.warnings.push("Backup does not include a storage version.");
  }
  if (backup.exportDate && Number.isNaN(new Date(backup.exportDate).getTime())) {
    result.warnings.push("Backup export date could not be read.");
  }

  return result;
}

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
  _lastPressureWarningAt: 0,

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
      const serialized = JSON.stringify(value);
      const previous = localStorage.getItem(key);
      localStorage.setItem(key, serialized);
      this.maybeWarnStoragePressure();
      if (
        previous !== serialized &&
        typeof window !== "undefined" &&
        typeof window.queueCloudAutoPush === "function"
      ) {
        window.queueCloudAutoPush(key, "set");
      }
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
    const hadValue = localStorage.getItem(key) !== null;
    localStorage.removeItem(key);
    if (
      hadValue &&
      typeof window !== "undefined" &&
      typeof window.queueCloudAutoPush === "function"
    ) {
      window.queueCloudAutoPush(key, "remove");
    }
  },

  getAllData() {
    const data = {
      app: "BCOffense",
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

  validateBackup(backup) {
    return validateBackupPayload(backup);
  },

  async restoreAllData(backup, options = { confirmOverwrite: true }) {
    const validation = this.validateBackup(backup);
    if (!validation.valid) {
      throw new Error(validation.errors.join(" "));
    }

    if (options.confirmOverwrite) {
      const warningText = validation.warnings.length
        ? `\n\nWarnings:\n- ${validation.warnings.join("\n- ")}`
        : "";
      const msg = `This will replace your current data with the backup from ${backup.exportDate
        ? new Date(backup.exportDate).toLocaleDateString()
        : "unknown date"
        }.\n\nItems: ${validation.itemCount}${validation.imageCount ? `\nImages: ${validation.imageCount}` : ""}${warningText}\n\nContinue?`;
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

    const estimatedQuotaBytes = 5 * 1024 * 1024;
    const usageRatio = totalSize / estimatedQuotaBytes;
    return {
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      itemSizes,
      itemCount: Object.keys(itemSizes).length,
      estimatedQuotaBytes,
      estimatedQuotaFormatted: this.formatBytes(estimatedQuotaBytes),
      usageRatio,
      warningLevel:
        usageRatio >= 0.9 ? "danger" : usageRatio >= 0.75 ? "warning" : "ok",
    };
  },

  maybeWarnStoragePressure() {
    const now = Date.now();
    if (now - this._lastPressureWarningAt < 10 * 60 * 1000) return;
    const info = this.getStorageInfo();
    if (info.warningLevel === "ok") return;
    this._lastPressureWarningAt = now;
    const message =
      info.warningLevel === "danger"
        ? "Storage is almost full. Export a backup and clear old data soon."
        : "Storage is getting full. Consider exporting a backup.";
    showToast(message, { type: "warning", duration: 6000 });
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

function reloadAppFromStorage() {
  const storedPlaybook = storageManager.get(STORAGE_KEYS.PLAYBOOK, null);
  if (storedPlaybook) {
    plays = storedPlaybook;
    if (typeof ensurePlaybookPlayIds === "function") {
      const changed = ensurePlaybookPlayIds(plays);
      if (changed > 0) storageManager.set(STORAGE_KEYS.PLAYBOOK, plays);
    }
    if (typeof invalidatePlaybookRuntimeIndex === "function") invalidatePlaybookRuntimeIndex();
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
