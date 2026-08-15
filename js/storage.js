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
  SCRIPT_CONTROLS_MODE: "scriptControlsMode",
  PLAY_READINESS: "playReadiness",
  SCRIPT_DRAFT: "scriptDraft",
  WRISTBAND_DRAFT: "wristbandDraft",
  CALLSHEET_DISPLAY_OPTIONS: "callSheetDisplayOptions",
  CALLSHEET_DISPLAY_PRESETS: "callSheetDisplayPresets",
  CALLSHEET_DRAFT: "callSheetDraft",
  CALLSHEET_TEMPLATES: "callSheetTemplates",
  CALLSHEET_INDEX_CARD_LIBRARY: "callSheetIndexCardLibrary",
  CALLSHEET_CATEGORY_ORDER: "callSheetCategoryOrder",
  CALLSHEET_NOTES: "callSheetNotes",
  CALLSHEET_TARGETS: "callSheetTargets",
  CALLSHEET_COLLAPSED: "callSheetCollapsed",
  CALLSHEET_QUICK_ACTIONS_OPEN: "csQuickActionsOpen",
  CALLSHEET_SNAPSHOTS: "callSheetSnapshots",
  PAGE_HELP_OPEN: "pageHelpOpen",
  DEFENSIVE_TENDENCIES: "defensiveTendencies",
  TENDENCIES_DRAFT: "tendenciesDraft",
  TENDENCIES_SETTINGS: "tendenciesSettings",
  GAME_WEEK: "gameWeek",
  MOBILE_COACH_LOCK: "mobileCoachLock",
  INSTALLATION: "installationData",
  INSTALLATION_TEMPLATES: "installationTemplates",
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
  PRESENTATION_SETUP: "presentationSetup",
  PRESENTATION_IPAD_HELP_DISMISSED: "presentationIpadHelpDismissed",
  WRISTBAND_SORT_CRITERIA: "wristbandSortCriteria",
  WRISTBAND_FAVORITES: "wristbandFavorites",
  WRISTBAND_RECENT_PLAYS: "wristbandRecentPlays",
  WRISTBAND_LOGO_CARD: "wristbandLogoCard",
  TEAM_ROSTER: "teamRoster",
  TEAM_NAME: "teamName",
  TEAM_PERSONNEL_PACKAGES: "teamPersonnelPackages",
  TEAM_SWAP_GROUPS: "teamSwapGroups",
  TEAM_ASSIGNMENT_LABELS: "teamAssignmentLabels",
  TEAM_SETTINGS_COLLAPSED: "teamSettingsCollapsed",
  GAME_PLAN_BOARDS: "gamePlanBoards",
  GAME_PLAN_SNAPSHOTS: "gamePlanSnapshots",
  GAME_PLAN_TEMPLATES: "gamePlanTemplates",
  CALLSHEET_PRINT_OPTIONS: "callSheetPrintOptions",
  CLOUD_SYNC_SETTINGS: "cloudSyncSettings",
  PUBLISH_ACTIVITY_LOG: "publishActivityLog",
  COLOR_PRESET: "colorPreset",
  AUTH_SESSION: "authSession",
  A2HS_DISMISSED: "a2hsDismissed",
  // Tier 6 — coach-to-player features
  MOTD: "motd",
  PLAYER_READY: "playerReady",
  PLAYER_PORTAL_BRANDING: "playerPortalBranding",
  PLAYER_QUIZ_RESULTS: "playerQuizResults",
  PLAYER_QUIZ_DRAFT: "playerQuizDraft",
  PLAYER_QUIZ_SETTINGS: "playerQuizSettings",
  PLAYER_QUIZ_SOURCE_SETTINGS: "playerQuizSourceSettings",
  QUIZ_ASSIGNMENT_TEMPLATES: "quizAssignmentTemplates",
  PLAYER_GAME_PLAN_QUIZ: "playerGamePlanQuiz",
  PLAYER_SIGNAL_GAME_SETTINGS: "playerSignalGameSettings",
  PLAYER_PUBLISH_STATUS: "playerPublishStatus",
  SIGNALS: "signals",
  PLAYER_REWARD_EVENTS: "playerRewardEvents",
  PLAYER_HELMET_STICKER_TYPES: "playerHelmetStickerTypes",
  PLAYER_HELMET_STICKERS: "playerHelmetStickers",
  PLAYER_LEADERBOARD_REMOTE: "playerLeaderboardRemote",
  PLAYER_RELEASE_STATE: "playerReleaseState",
  PLAYER_DEVICE_OWNER: "playerDeviceOwner",
  DIAGRAM_UPLOAD_QUEUE: "diagramUploadQueue",
  CLIP_UPLOAD_QUEUE: "clipUploadQueue",
  GAME_WEEK_ARCHIVE: "gameWeekArchive",
  TENDENCIES_REPORTS: "tendenciesReports",
  FIRST_USE_DISMISSED: "firstUseDismissed",
};

// A player release is a server-issued projection, not a browser backup. These
// are the only shared values a player refresh may replace. Everything else is
// either coach-only or player/device-private and is scrubbed or preserved by
// replacePlayerReleaseData() below.
const PLAYER_RELEASE_REMOTE_STORAGE_KEYS = new Set([
  STORAGE_KEYS.SAVED_SCRIPTS,
  STORAGE_KEYS.TEAM_NAME,
  STORAGE_KEYS.MOTD,
  STORAGE_KEYS.PLAYER_PORTAL_BRANDING,
  STORAGE_KEYS.PLAYER_QUIZ_SETTINGS,
  STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS,
  STORAGE_KEYS.PLAYER_GAME_PLAN_QUIZ,
  STORAGE_KEYS.PLAYER_SIGNAL_GAME_SETTINGS,
  STORAGE_KEYS.PLAYER_PUBLISH_STATUS,
  STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES,
  STORAGE_KEYS.SIGNALS,
  STORAGE_KEYS.PLAYER_RELEASE_STATE,
]);

const PLAYER_DEVICE_PRIVATE_STORAGE_KEYS = new Set([
  STORAGE_KEYS.PLAYER_READY,
  STORAGE_KEYS.PLAYER_QUIZ_RESULTS,
  STORAGE_KEYS.PLAYER_QUIZ_DRAFT,
  STORAGE_KEYS.PLAYER_REWARD_EVENTS,
  STORAGE_KEYS.PLAYER_HELMET_STICKERS,
  STORAGE_KEYS.PLAYER_LEADERBOARD_REMOTE,
]);

// A player release is a distinct local data product. Keep its projected
// values under a private browser prefix so signing in as a player on a shared
// coach device cannot overwrite the editable coach workspace. The public
// storageManager API routes only allow-listed release fields to this prefix
// while the authenticated role is player.
const PLAYER_RELEASE_STORAGE_PREFIX = "_bcPlayerRelease:";

function _isPlayerStorageRuntime() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return user?.role === "player";
}

function _isPlayerReleaseStorageActive(key) {
  return Boolean(_isPlayerStorageRuntime() && PLAYER_RELEASE_REMOTE_STORAGE_KEYS.has(key));
}

function _localStorageKeyFor(key) {
  return _isPlayerReleaseStorageActive(key)
    ? `${PLAYER_RELEASE_STORAGE_PREFIX}${key}`
    : key;
}

function _clearPlayerReleaseStorageValues() {
  PLAYER_RELEASE_REMOTE_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(`${PLAYER_RELEASE_STORAGE_PREFIX}${key}`);
  });
}

function _storageKeysForCurrentRole(includePlayerPrivate = false) {
  if (!_isPlayerStorageRuntime()) return Object.values(STORAGE_KEYS);
  const keys = [...PLAYER_RELEASE_REMOTE_STORAGE_KEYS];
  if (includePlayerPrivate) keys.push(...PLAYER_DEVICE_PRIVATE_STORAGE_KEYS);
  return [...new Set(keys)];
}

// Browser recovery snapshots must not copy credentials, drafts, queues, or a
// specific player's progress to another device. The next architecture phase
// replaces the whole snapshot with immutable team revisions; this list closes
// the most harmful leakage in the transitional format immediately.
const TEAM_BACKUP_EXCLUDED_KEYS = new Set([
  STORAGE_KEYS.AUTH_SESSION,
  STORAGE_KEYS.CLOUD_SYNC_SETTINGS,
  STORAGE_KEYS.PUBLISH_ACTIVITY_LOG,
  STORAGE_KEYS.PLAYER_RELEASE_STATE,
  STORAGE_KEYS.PLAYER_GAME_PLAN_QUIZ,
  STORAGE_KEYS.PLAYER_DEVICE_OWNER,
  STORAGE_KEYS.SCRIPT_DRAFT,
  STORAGE_KEYS.WRISTBAND_DRAFT,
  STORAGE_KEYS.CALLSHEET_DRAFT,
  STORAGE_KEYS.TENDENCIES_DRAFT,
  STORAGE_KEYS.DIAGRAM_UPLOAD_QUEUE,
  STORAGE_KEYS.CLIP_UPLOAD_QUEUE,
  STORAGE_KEYS.PLAYER_READY,
  STORAGE_KEYS.PLAYER_QUIZ_RESULTS,
  STORAGE_KEYS.PLAYER_QUIZ_DRAFT,
  STORAGE_KEYS.PLAYER_REWARD_EVENTS,
  STORAGE_KEYS.PLAYER_HELMET_STICKERS,
  STORAGE_KEYS.PLAYER_LEADERBOARD_REMOTE,
  STORAGE_KEYS.CALLSHEET_COLLAPSED,
  STORAGE_KEYS.CALLSHEET_QUICK_ACTIONS_OPEN,
  STORAGE_KEYS.PAGE_HELP_OPEN,
  STORAGE_KEYS.MOBILE_COACH_LOCK,
  STORAGE_KEYS.CS_SCOUTING_OVERLAY,
  STORAGE_KEYS.PRESENTATION_IPAD_HELP_DISMISSED,
  STORAGE_KEYS.FIRST_USE_DISMISSED,
  STORAGE_KEYS.LAST_ACTIVE_TAB,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.VISION_MODE,
  STORAGE_KEYS.COLOR_PRESET,
  STORAGE_KEYS.A2HS_DISMISSED,
]);

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

function _isPlainStorageObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const BACKUP_ARRAY_KEYS = new Set([
  STORAGE_KEYS.PLAYBOOK,
  STORAGE_KEYS.SAVED_SCRIPTS,
  STORAGE_KEYS.SAVED_WRISTBANDS,
  STORAGE_KEYS.WRISTBAND_TEMPLATES,
  STORAGE_KEYS.PERIOD_TEMPLATES,
  STORAGE_KEYS.SCRIPT_TEMPLATES,
  STORAGE_KEYS.CALLSHEET_TEMPLATES,
  STORAGE_KEYS.CALLSHEET_INDEX_CARD_LIBRARY,
  STORAGE_KEYS.CALLSHEET_COLLAPSED,
  STORAGE_KEYS.CALLSHEET_SNAPSHOTS,
  STORAGE_KEYS.DEFENSIVE_TENDENCIES,
  STORAGE_KEYS.INSTALLATION_TEMPLATES,
  STORAGE_KEYS.SCHEDULE,
  STORAGE_KEYS.WRISTBAND_SORT_CRITERIA,
  STORAGE_KEYS.WRISTBAND_FAVORITES,
  STORAGE_KEYS.WRISTBAND_RECENT_PLAYS,
  STORAGE_KEYS.TEAM_ROSTER,
  STORAGE_KEYS.TEAM_PERSONNEL_PACKAGES,
  STORAGE_KEYS.TEAM_SWAP_GROUPS,
  STORAGE_KEYS.GAME_PLAN_SNAPSHOTS,
  STORAGE_KEYS.GAME_PLAN_TEMPLATES,
  STORAGE_KEYS.PLAYER_QUIZ_RESULTS,
  STORAGE_KEYS.PLAYER_REWARD_EVENTS,
  STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES,
  STORAGE_KEYS.PLAYER_HELMET_STICKERS,
  STORAGE_KEYS.QUIZ_ASSIGNMENT_TEMPLATES,
  STORAGE_KEYS.SIGNALS,
  STORAGE_KEYS.GAME_WEEK_ARCHIVE,
  STORAGE_KEYS.TENDENCIES_REPORTS,
]);

const BACKUP_OBJECT_KEYS = new Set([
  STORAGE_KEYS.SORT_PRESETS,
  STORAGE_KEYS.CUSTOM_SORT_ORDERS,
  STORAGE_KEYS.SCRIPT_CUSTOM_SORT_ORDERS,
  STORAGE_KEYS.CALL_SHEET,
  STORAGE_KEYS.CALL_SHEET_SETTINGS,
  STORAGE_KEYS.COLUMN_VISIBILITY,
  STORAGE_KEYS.PLAYBOOK_STATE,
  STORAGE_KEYS.SCRIPT_DISPLAY_OPTIONS,
  STORAGE_KEYS.PLAY_READINESS,
  STORAGE_KEYS.SCRIPT_DRAFT,
  STORAGE_KEYS.WRISTBAND_DRAFT,
  STORAGE_KEYS.CALLSHEET_DISPLAY_OPTIONS,
  STORAGE_KEYS.CALLSHEET_DISPLAY_PRESETS,
  STORAGE_KEYS.CALLSHEET_DRAFT,
  STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER,
  STORAGE_KEYS.CALLSHEET_NOTES,
  STORAGE_KEYS.CALLSHEET_TARGETS,
  STORAGE_KEYS.PAGE_HELP_OPEN,
  STORAGE_KEYS.TENDENCIES_DRAFT,
  STORAGE_KEYS.TENDENCIES_SETTINGS,
  STORAGE_KEYS.GAME_WEEK,
  STORAGE_KEYS.INSTALLATION,
  STORAGE_KEYS.PLAY_COLLECTIONS,
  STORAGE_KEYS.CALLSHEET_CONSTRAINTS,
  STORAGE_KEYS.OB_PLAY_RATINGS,
  STORAGE_KEYS.GAME_PLAN_TAGS,
  STORAGE_KEYS.PRINT_STUDIO_SETTINGS,
  STORAGE_KEYS.PRESENTATION_SETUP,
  STORAGE_KEYS.WRISTBAND_LOGO_CARD,
  STORAGE_KEYS.TEAM_ASSIGNMENT_LABELS,
  STORAGE_KEYS.TEAM_SETTINGS_COLLAPSED,
  STORAGE_KEYS.GAME_PLAN_BOARDS,
  STORAGE_KEYS.CALLSHEET_PRINT_OPTIONS,
  STORAGE_KEYS.CLOUD_SYNC_SETTINGS,
  STORAGE_KEYS.AUTH_SESSION,
  STORAGE_KEYS.PLAYER_READY,
  STORAGE_KEYS.PLAYER_PORTAL_BRANDING,
  STORAGE_KEYS.PLAYER_QUIZ_DRAFT,
  STORAGE_KEYS.PLAYER_QUIZ_SETTINGS,
  STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS,
  STORAGE_KEYS.PLAYER_GAME_PLAN_QUIZ,
  STORAGE_KEYS.PLAYER_SIGNAL_GAME_SETTINGS,
  STORAGE_KEYS.PLAYER_PUBLISH_STATUS,
  STORAGE_KEYS.PLAYER_LEADERBOARD_REMOTE,
]);

const BACKUP_BOOLEAN_KEYS = new Set([
  STORAGE_KEYS.CALLSHEET_QUICK_ACTIONS_OPEN,
  STORAGE_KEYS.MOBILE_COACH_LOCK,
  STORAGE_KEYS.CS_SCOUTING_OVERLAY,
  STORAGE_KEYS.PRESENTATION_IPAD_HELP_DISMISSED,
  STORAGE_KEYS.FIRST_USE_DISMISSED,
]);

const BACKUP_STRING_KEYS = new Set([
  STORAGE_KEYS.SCRIPT_CONTROLS_MODE,
  STORAGE_KEYS.LAST_ACTIVE_TAB,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.VISION_MODE,
  STORAGE_KEYS.TEAM_NAME,
  STORAGE_KEYS.COLOR_PRESET,
  STORAGE_KEYS.MOTD,
]);

const BACKUP_NUMBER_KEYS = new Set([
  STORAGE_KEYS.A2HS_DISMISSED,
]);

function _restoreWarning(warnings, message) {
  if (Array.isArray(warnings) && !warnings.includes(message)) {
    warnings.push(message);
  }
}

function _normalizeRestoredArrayValue(key, value, warnings) {
  if (Array.isArray(value)) {
    if (key === STORAGE_KEYS.PLAYBOOK) {
      const playsOnly = value.filter((item) => _isPlainStorageObject(item));
      if (playsOnly.length !== value.length) {
        _restoreWarning(
          warnings,
          `${key} contained invalid play records that will be skipped.`,
        );
      }
      return playsOnly;
    }
    return value;
  }

  if (
    _isPlainStorageObject(value) &&
    (
      key === STORAGE_KEYS.SAVED_SCRIPTS ||
      key === STORAGE_KEYS.SAVED_WRISTBANDS ||
      key === STORAGE_KEYS.WRISTBAND_TEMPLATES ||
      key === STORAGE_KEYS.SCRIPT_TEMPLATES ||
      key === STORAGE_KEYS.GAME_PLAN_TEMPLATES
    )
  ) {
    _restoreWarning(warnings, `${key} used legacy object storage and will be converted.`);
    return Object.values(value);
  }

  _restoreWarning(warnings, `${key} was not an array and will be reset.`);
  return [];
}

function normalizeBackupValueForRestore(key, value, warnings = []) {
  if (value === undefined) return { value, repaired: false };

  if (BACKUP_ARRAY_KEYS.has(key)) {
    const normalized = _normalizeRestoredArrayValue(key, value, warnings);
    return { value: normalized, repaired: normalized !== value };
  }

  if (BACKUP_OBJECT_KEYS.has(key)) {
    if (_isPlainStorageObject(value)) return { value, repaired: false };
    _restoreWarning(warnings, `${key} was not an object and will be reset.`);
    return { value: {}, repaired: true };
  }

  if (BACKUP_BOOLEAN_KEYS.has(key)) {
    if (typeof value === "boolean") return { value, repaired: false };
    if (value === "true" || value === 1 || value === "1") {
      _restoreWarning(warnings, `${key} was normalized to a boolean.`);
      return { value: true, repaired: true };
    }
    if (value === "false" || value === 0 || value === "0" || value === null) {
      _restoreWarning(warnings, `${key} was normalized to a boolean.`);
      return { value: false, repaired: true };
    }
    _restoreWarning(warnings, `${key} was not a boolean and will be reset.`);
    return { value: false, repaired: true };
  }

  if (BACKUP_NUMBER_KEYS.has(key)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return { value, repaired: false };
    }
    const numeric = Number(value || 0);
    if (Number.isFinite(numeric)) {
      _restoreWarning(warnings, `${key} was normalized to a number.`);
      return { value: numeric, repaired: true };
    }
    _restoreWarning(warnings, `${key} was not a number and will be reset.`);
    return { value: 0, repaired: true };
  }

  if (BACKUP_STRING_KEYS.has(key)) {
    if (typeof value === "string") return { value, repaired: false };
    _restoreWarning(warnings, `${key} was normalized to text.`);
    return { value: value == null ? "" : String(value), repaired: true };
  }

  return { value, repaired: false };
}

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
    let parsedValue = value;
    if (typeof value === "string") {
      try {
        parsedValue = JSON.parse(value);
      } catch (err) {
        result.valid = false;
        result.errors.push(`${key} is not valid JSON.`);
        parsedValue = undefined;
      }
    } else {
      try {
        JSON.stringify(value);
      } catch (_err) {
        result.valid = false;
        result.errors.push(`${key} cannot be serialized.`);
        parsedValue = undefined;
      }
    }

    if (parsedValue === undefined) return;

    try {
      const beforeWarnings = result.warnings.length;
      normalizeBackupValueForRestore(key, parsedValue, result.warnings);
      if (result.warnings.length > beforeWarnings) {
        result.warnings.push(`${key} will be normalized during restore.`);
      }
    } catch (_err) {
      result.valid = false;
      result.errors.push(`${key} could not be normalized.`);
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
  if (saved >= STORAGE_VERSION) return true;
  for (let v = saved + 1; v <= STORAGE_VERSION; v++) {
    try {
      if (typeof MIGRATIONS[v] === "function") {
        MIGRATIONS[v]();
        console.debug(`Storage migration v${v} applied`);
      }
      localStorage.setItem("_storageVersion", String(v));
    } catch (e) {
      console.error(`Storage migration v${v} failed:`, e);
      return false;
    }
  }
  return true;
}

// ── LZ-String compression helpers ─────────────────────────────────────────
// Values written to localStorage are LZ-compressed and prefixed with "LZS:"
// so that existing uncompressed values can still be read without errors.
const _LZS_PREFIX = "LZS:";

function _lzsCompress(jsonString) {
  if (typeof LZString === "undefined") return jsonString;
  try {
    return _LZS_PREFIX + LZString.compressToUTF16(jsonString);
  } catch (e) {
    return jsonString;
  }
}

function _lzsDecompress(raw) {
  if (!raw) return raw;
  if (typeof LZString === "undefined") return raw;
  if (!raw.startsWith(_LZS_PREFIX)) return raw; // legacy uncompressed value
  try {
    return LZString.decompressFromUTF16(raw.slice(_LZS_PREFIX.length));
  } catch (e) {
    return raw; // graceful fallback — parse will fail safely downstream
  }
}

function _isLzsEncoded(raw) {
  return typeof raw === "string" && raw.startsWith(_LZS_PREFIX);
}

function _storageByteSize(value) {
  return new Blob([value || ""]).size;
}

function _parseStoredJson(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;
  return safeJSONParse(_lzsDecompress(raw), fallback);
}

function _storedJsonValue(value) {
  return _lzsCompress(JSON.stringify(value));
}

function _isDraftStorageKey(key) {
  return (
    key === STORAGE_KEYS.SCRIPT_DRAFT ||
    key === STORAGE_KEYS.WRISTBAND_DRAFT ||
    key === STORAGE_KEYS.CALLSHEET_DRAFT ||
    key === STORAGE_KEYS.TENDENCIES_DRAFT
  );
}
// ──────────────────────────────────────────────────────────────────────────

// ── IndexedDB Playbook Storage ─────────────────────────────────────────────
// The playbook array is the single largest localStorage consumer (~1-2 MB).
// Moving it to IndexedDB removes it from the 5 MB quota entirely, with a
// transparent localStorage fallback for private browsing or IDB errors.

const _PB_DB_NAME = "bcoffense-playbook";
const _PB_DB_VERSION = 1;
const _PB_STORE = "playbook";
const _PB_KEY = "current";
let _pbDbPromise = null;
let _pbEstimatedBytes = 0; // cached byte size for getStorageInfo()

// A normal team workspace is deliberately kept in the existing browser
// stores. Its small pending-sync journal is different: it is device-only,
// must not enter a portable backup, and needs a true cross-tab mutation
// boundary. localStorage offers no compare-and-swap operation, so two tabs
// updating one JSON map can lose an otherwise durable retry intent. Keep one
// independently transactioned record per team in this tiny IndexedDB database
// instead. It is intentionally separate from the playbook database so this
// safety upgrade cannot block or migrate the large editor store.
const _WORKSPACE_SYNC_LEDGER_DB_NAME = "bcoffense-workspace-sync-ledger";
const _WORKSPACE_SYNC_LEDGER_DB_VERSION = 1;
const _WORKSPACE_SYNC_LEDGER_STORE = "pendingWorkspaceSync";
const _WORKSPACE_SYNC_LEDGER_META_STORE = "metadata";
const _WORKSPACE_SYNC_LEDGER_LEGACY_MIGRATION_KEY = "legacy-map-v1-migrated";
let _workspaceSyncLedgerDbPromise = null;

// Player releases use a separate IDB database from the editable coach
// workspace. A player-facing active pointer is advanced only after its exact
// server revision has been staged, so a shared device can never interpret the
// coach database's `current` record as a player release.
const _PLAYER_RELEASE_DB_NAME = "bcoffense-player-release";
const _PLAYER_RELEASE_DB_VERSION = 1;
const _PLAYER_RELEASE_STORE = "releases";
let _playerReleaseDbPromise = null;

function _openPlaybookDB() {
  if (_pbDbPromise) return _pbDbPromise;
  _pbDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(_PB_DB_NAME, _PB_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_PB_STORE)) {
        db.createObjectStore(_PB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
  return _pbDbPromise;
}

function _normalizeWorkspaceSyncLedgerTeamId(value) {
  const teamId = String(value || "").trim();
  if (
    !teamId ||
    teamId.length > 160 ||
    teamId === "__proto__" ||
    teamId === "prototype" ||
    teamId === "constructor"
  ) return "";
  return teamId;
}

function _openWorkspaceSyncLedgerDB() {
  if (_workspaceSyncLedgerDbPromise) return _workspaceSyncLedgerDbPromise;
  _workspaceSyncLedgerDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available for the pending team-sync journal."));
      return;
    }
    const req = indexedDB.open(_WORKSPACE_SYNC_LEDGER_DB_NAME, _WORKSPACE_SYNC_LEDGER_DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(_WORKSPACE_SYNC_LEDGER_STORE)) {
        db.createObjectStore(_WORKSPACE_SYNC_LEDGER_STORE, { keyPath: "teamId" });
      }
      if (!db.objectStoreNames.contains(_WORKSPACE_SYNC_LEDGER_META_STORE)) {
        db.createObjectStore(_WORKSPACE_SYNC_LEDGER_META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        _workspaceSyncLedgerDbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      _workspaceSyncLedgerDbPromise = null;
      reject(req.error || new Error("Could not open the pending team-sync journal."));
    };
  });
  return _workspaceSyncLedgerDbPromise;
}

function _workspaceSyncLedgerError(message, cause = null) {
  const err = new Error(message);
  err.code = "BC_WORKSPACE_SYNC_LEDGER_UNAVAILABLE";
  if (cause) err.cause = cause;
  return err;
}

function _workspaceSyncLedgerClone(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    return null;
  }
}

async function _getWorkspaceSyncLedgerRecord(teamId) {
  const normalizedTeamId = _normalizeWorkspaceSyncLedgerTeamId(teamId);
  if (!normalizedTeamId) return null;
  try {
    const db = await _openWorkspaceSyncLedgerDB();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(_WORKSPACE_SYNC_LEDGER_STORE, "readonly")
        .objectStore(_WORKSPACE_SYNC_LEDGER_STORE)
        .get(normalizedTeamId);
      request.onsuccess = () => resolve(_workspaceSyncLedgerClone(request.result));
      request.onerror = () => reject(request.error || new Error("Could not read the pending team-sync journal."));
    });
  } catch (err) {
    throw _workspaceSyncLedgerError("This browser could not protect the pending team-sync journal.", err);
  }
}

async function _mutateWorkspaceSyncLedgerRecord(teamId, mutate) {
  const normalizedTeamId = _normalizeWorkspaceSyncLedgerTeamId(teamId);
  if (!normalizedTeamId || typeof mutate !== "function") return null;
  try {
    const db = await _openWorkspaceSyncLedgerDB();
    return await new Promise((resolve, reject) => {
      let result = null;
      let mutationError = null;
      const tx = db.transaction(_WORKSPACE_SYNC_LEDGER_STORE, "readwrite");
      const store = tx.objectStore(_WORKSPACE_SYNC_LEDGER_STORE);
      const request = store.get(normalizedTeamId);
      request.onsuccess = () => {
        try {
          const current = _workspaceSyncLedgerClone(request.result);
          const next = mutate(current);
          if (next === null || next === undefined) {
            store.delete(normalizedTeamId);
            result = null;
            return;
          }
          const normalized = _workspaceSyncLedgerClone(next);
          if (!normalized) throw new Error("Pending team-sync journal data is invalid.");
          result = { ...normalized, teamId: normalizedTeamId };
          store.put(result);
        } catch (err) {
          mutationError = err;
          try { tx.abort(); } catch (_abortErr) { /* transaction will report its failure */ }
        }
      };
      request.onerror = () => {
        mutationError = request.error || new Error("Could not read the pending team-sync journal.");
        try { tx.abort(); } catch (_abortErr) { /* transaction will report its failure */ }
      };
      tx.oncomplete = () => resolve(_workspaceSyncLedgerClone(result));
      tx.onerror = () => reject(mutationError || tx.error || new Error("Could not update the pending team-sync journal."));
      tx.onabort = () => reject(mutationError || tx.error || new Error("Could not update the pending team-sync journal."));
    });
  } catch (err) {
    throw _workspaceSyncLedgerError("This browser could not protect the pending team-sync journal.", err);
  }
}

// v1 kept every team's retry intent inside cloudSyncSettings. Copy those
// records once into the transactional ledger before new writes begin. The
// migration marker lives in the same IndexedDB transaction, so a later clean
// publish cannot resurrect an old map entry after it has been consumed.
async function _migrateWorkspaceSyncLedgerRecords(legacyRecords = []) {
  const rawCandidates = Array.isArray(legacyRecords)
    ? legacyRecords
      .map((record) => _workspaceSyncLedgerClone(record))
      .filter((record) => _normalizeWorkspaceSyncLedgerTeamId(record?.teamId))
    : [];
  const candidatesByTeam = new Map();
  rawCandidates.forEach((record) => {
    const teamId = _normalizeWorkspaceSyncLedgerTeamId(record.teamId);
    if (teamId && !candidatesByTeam.has(teamId)) candidatesByTeam.set(teamId, { ...record, teamId });
  });
  const candidates = [...candidatesByTeam.values()];
  try {
    const db = await _openWorkspaceSyncLedgerDB();
    return await new Promise((resolve, reject) => {
      let migrated = false;
      let migrationError = null;
      const tx = db.transaction(
        [_WORKSPACE_SYNC_LEDGER_STORE, _WORKSPACE_SYNC_LEDGER_META_STORE],
        "readwrite",
      );
      const intents = tx.objectStore(_WORKSPACE_SYNC_LEDGER_STORE);
      const metadata = tx.objectStore(_WORKSPACE_SYNC_LEDGER_META_STORE);
      const marker = metadata.get(_WORKSPACE_SYNC_LEDGER_LEGACY_MIGRATION_KEY);
      marker.onsuccess = () => {
        if (marker.result) return;
        if (!candidates.length) {
          metadata.put({ key: _WORKSPACE_SYNC_LEDGER_LEGACY_MIGRATION_KEY, migratedAt: new Date().toISOString() });
          migrated = true;
          return;
        }
        let remaining = candidates.length;
        candidates.forEach((candidate) => {
          const teamId = _normalizeWorkspaceSyncLedgerTeamId(candidate.teamId);
          const current = intents.get(teamId);
          current.onsuccess = () => {
            if (!current.result) intents.put({ ...candidate, teamId });
            remaining -= 1;
            if (remaining === 0) {
              metadata.put({ key: _WORKSPACE_SYNC_LEDGER_LEGACY_MIGRATION_KEY, migratedAt: new Date().toISOString() });
              migrated = true;
            }
          };
          current.onerror = () => {
            migrationError = current.error || new Error("Could not migrate the pending team-sync journal.");
            try { tx.abort(); } catch (_abortErr) { /* transaction will report its failure */ }
          };
        });
      };
      marker.onerror = () => {
        migrationError = marker.error || new Error("Could not read the pending team-sync journal migration.");
        try { tx.abort(); } catch (_abortErr) { /* transaction will report its failure */ }
      };
      tx.oncomplete = () => resolve({ migrated });
      tx.onerror = () => reject(migrationError || tx.error || new Error("Could not migrate the pending team-sync journal."));
      tx.onabort = () => reject(migrationError || tx.error || new Error("Could not migrate the pending team-sync journal."));
    });
  } catch (err) {
    throw _workspaceSyncLedgerError("This browser could not migrate the pending team-sync journal.", err);
  }
}

async function _clearWorkspaceSyncLedgerRecords() {
  try {
    const db = await _openWorkspaceSyncLedgerDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(
        [_WORKSPACE_SYNC_LEDGER_STORE, _WORKSPACE_SYNC_LEDGER_META_STORE],
        "readwrite",
      );
      tx.objectStore(_WORKSPACE_SYNC_LEDGER_STORE).clear();
      tx.objectStore(_WORKSPACE_SYNC_LEDGER_META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Could not clear the pending team-sync journal."));
      tx.onabort = () => reject(tx.error || new Error("Could not clear the pending team-sync journal."));
    });
    return true;
  } catch (err) {
    throw _workspaceSyncLedgerError("This browser could not clear the pending team-sync journal.", err);
  }
}

function _idbGetPlaybook() {
  return _openPlaybookDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction(_PB_STORE, "readonly")
          .objectStore(_PB_STORE)
          .get(_PB_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function _idbSetPlaybook(data) {
  return _openPlaybookDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction(_PB_STORE, "readwrite")
          .objectStore(_PB_STORE)
          .put(data, _PB_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function _idbClearPlaybook() {
  return _openPlaybookDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction(_PB_STORE, "readwrite")
          .objectStore(_PB_STORE)
          .delete(_PB_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

function _openPlayerReleaseDB() {
  if (_playerReleaseDbPromise) return _playerReleaseDbPromise;
  _playerReleaseDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(_PLAYER_RELEASE_DB_NAME, _PLAYER_RELEASE_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_PLAYER_RELEASE_STORE)) {
        db.createObjectStore(_PLAYER_RELEASE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Player release IndexedDB open failed"));
  });
  return _playerReleaseDbPromise;
}

function _playerReleaseRecordKey(teamId, revision) {
  return `${String(teamId || "").trim()}:${String(revision || "").trim()}`;
}

function _idbGetPlayerReleasePlaybook(recordKey) {
  return _openPlayerReleaseDB().then(
    (db) => new Promise((resolve, reject) => {
      const req = db.transaction(_PLAYER_RELEASE_STORE, "readonly")
        .objectStore(_PLAYER_RELEASE_STORE)
        .get(recordKey);
      req.onsuccess = () => {
        const value = req.result;
        resolve(Array.isArray(value?.playbook) ? value.playbook : null);
      };
      req.onerror = () => reject(req.error);
    }),
  );
}

function _idbSetPlayerReleasePlaybook(recordKey, release) {
  return _openPlayerReleaseDB().then(
    (db) => new Promise((resolve, reject) => {
      const req = db.transaction(_PLAYER_RELEASE_STORE, "readwrite")
        .objectStore(_PLAYER_RELEASE_STORE)
        .put(release, recordKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}

function _idbClearPlayerReleasePlaybooks() {
  return _openPlayerReleaseDB().then(
    (db) => new Promise((resolve, reject) => {
      const req = db.transaction(_PLAYER_RELEASE_STORE, "readwrite")
        .objectStore(_PLAYER_RELEASE_STORE)
        .clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}
// ──────────────────────────────────────────────────────────────────────────

const storageManager = {
  _lastPressureWarningAt: 0,
  _compactedThisSession: false,

  // Device-only durable retry ledger for automatic canonical workspace
  // publishes. These methods deliberately bypass storageManager.set(): the
  // records are neither team content nor backup data, and IndexedDB gives the
  // compare-and-swap-like transaction semantics localStorage lacks across
  // two open tabs. Cloud sync owns the intent schema and passes a synchronous
  // mutation function so the read/mutate/write stays inside one transaction.
  getPendingWorkspaceSyncLedger(teamId) {
    return _getWorkspaceSyncLedgerRecord(teamId);
  },

  mutatePendingWorkspaceSyncLedger(teamId, mutate) {
    return _mutateWorkspaceSyncLedgerRecord(teamId, mutate);
  },

  migratePendingWorkspaceSyncLedger(legacyRecords) {
    return _migrateWorkspaceSyncLedgerRecords(legacyRecords);
  },

  clearPendingWorkspaceSyncLedger() {
    return _clearWorkspaceSyncLedgerRecords();
  },

  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(_localStorageKeyFor(key));
      if (raw === null) return defaultValue;
      const value = _lzsDecompress(raw);
      return JSON.parse(value);
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return defaultValue;
    }
  },

  set(key, value, options = {}) {
    try {
      const serialized = _lzsCompress(JSON.stringify(value));
      const storageKey = _localStorageKeyFor(key);
      const playerReleaseValue = _isPlayerReleaseStorageActive(key);
      const previous = localStorage.getItem(storageKey);
      localStorage.setItem(storageKey, serialized);
      this.maybeWarnStoragePressure();
      if (
        previous !== serialized &&
        !playerReleaseValue &&
        typeof window !== "undefined" &&
        typeof window.queueCloudAutoPush === "function"
      ) {
        // Some values share a record with team data while carrying a small
        // device-only view preference (for example, an opponent's last open
        // tab). Persist that preference locally without turning a navigation
        // click into a full canonical workspace publish.
        if (options?.skipCloudAutoPush !== true) {
          window.queueCloudAutoPush(key, "set");
        }
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
    const storageKey = _localStorageKeyFor(key);
    const playerReleaseValue = _isPlayerReleaseStorageActive(key);
    const hadValue = localStorage.getItem(storageKey) !== null;
    localStorage.removeItem(storageKey);
    if (
      hadValue &&
      !playerReleaseValue &&
      typeof window !== "undefined" &&
      typeof window.queueCloudAutoPush === "function"
    ) {
      window.queueCloudAutoPush(key, "remove");
    }
  },

  // ── Playbook (IndexedDB) ────────────────────────────────────────────────
  // Reads the stored playbook. On first call after v517→v518 upgrade, auto-
  // migrates data from localStorage to IDB and removes the localStorage copy.
  async getPlaybook() {
    const authUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    if (authUser?.role === "player") {
      const state = this.get(STORAGE_KEYS.PLAYER_RELEASE_STATE, null);
      const teamId = String(authUser.teamId || "").trim();
      if (
        !teamId ||
        !state ||
        state.schema !== "bcoffense.player-release/v1" ||
        state.teamId !== teamId ||
        !state.revision ||
        !state.releaseKey
      ) {
        // A player must never fall through to the editable coach database.
        return null;
      }
      try {
        return await _idbGetPlayerReleasePlaybook(String(state.releaseKey));
      } catch (err) {
        console.error("getPlaybook player release IDB error:", err);
        return null;
      }
    }
    try {
      let data = await _idbGetPlaybook();
      if (data === null) {
        // First run or IDB empty — migrate from localStorage if data exists there.
        const raw = localStorage.getItem(STORAGE_KEYS.PLAYBOOK);
        if (raw !== null) {
          const json = _lzsDecompress(raw);
          const parsed = safeJSONParse(json, null);
          if (Array.isArray(parsed)) {
            data = parsed;
            await _idbSetPlaybook(data);
            localStorage.removeItem(STORAGE_KEYS.PLAYBOOK);
            _pbEstimatedBytes = new Blob([JSON.stringify(data)]).size;
            console.debug(
              `Playbook migrated to IndexedDB (${this.formatBytes(_pbEstimatedBytes)})`,
            );
          }
        }
      } else {
        _pbEstimatedBytes = new Blob([JSON.stringify(data)]).size;
      }
      return Array.isArray(data) ? data : null;
    } catch (err) {
      console.error("getPlaybook IDB error, falling back to localStorage:", err);
      return this.get(STORAGE_KEYS.PLAYBOOK, null);
    }
  },

  // Writes the playbook to IndexedDB asynchronously (fire-and-forget).
  // Falls back to localStorage if IDB fails.
  setPlaybook(data, opts = {}) {
    // Variant normalization is additive: legacy plays without the field are
    // untouched, while any present variant records are made safe before every
    // local, restore, and cloud-boundary write.
    if (typeof ensurePlaybookPersonnelVariants === "function") {
      ensurePlaybookPersonnelVariants(data);
    }
    const authUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    const playerState = this.get(STORAGE_KEYS.PLAYER_RELEASE_STATE, null);
    const isCurrentPlayerRelease = Boolean(
      authUser?.role === "player" &&
      playerState?.schema === "bcoffense.player-release/v1" &&
      playerState?.teamId === String(authUser.teamId || "").trim() &&
      playerState?.releaseKey,
    );
    if (isCurrentPlayerRelease) {
      if (opts.preservePlayerRelease !== true) {
        console.warn("Blocked an attempted player write to the coach playbook store.");
        return false;
      }
      _idbSetPlayerReleasePlaybook(String(playerState.releaseKey), {
        playbook: Array.isArray(data) ? data : [],
        teamId: playerState.teamId,
        revision: playerState.revision,
        stagedAt: new Date().toISOString(),
      }).catch((err) => console.error("setPlaybook player release IDB error:", err));
      return true;
    }
    // All normal editor/import/restore writes invalidate the player-release
    // marker. The release applicator writes IDB directly, and the one
    // normalization path below opts in explicitly after it has already proved
    // its data came from the scoped server release.
    if (opts.preservePlayerRelease !== true) {
      localStorage.removeItem(STORAGE_KEYS.PLAYER_RELEASE_STATE);
    }
    _pbEstimatedBytes = new Blob([JSON.stringify(data)]).size;
    _idbSetPlaybook(data)
      .then(() => {
        // Remove legacy localStorage copy if still present.
        if (localStorage.getItem(STORAGE_KEYS.PLAYBOOK) !== null) {
          localStorage.removeItem(STORAGE_KEYS.PLAYBOOK);
        }
        if (typeof window.queueCloudAutoPush === "function") {
          window.queueCloudAutoPush(STORAGE_KEYS.PLAYBOOK, "set");
        }
      })
      .catch((err) => {
        console.error("setPlaybook IDB error, falling back to localStorage:", err);
        this.set(STORAGE_KEYS.PLAYBOOK, data);
      });
  },

  hasPlayerReleaseCache() {
    const state = this.get(STORAGE_KEYS.PLAYER_RELEASE_STATE, null);
    return Boolean(
      state &&
      typeof state === "object" &&
      state.schema === "bcoffense.player-release/v1" &&
      state.teamId &&
      state.revision &&
      state.releaseKey,
    );
  },

  hasPlayerReleaseCacheForTeam(teamId) {
    const expectedTeamId = String(teamId || "").trim();
    const state = this.get(STORAGE_KEYS.PLAYER_RELEASE_STATE, null);
    return Boolean(
      expectedTeamId &&
      state &&
      typeof state === "object" &&
      state.schema === "bcoffense.player-release/v1" &&
      state.teamId === expectedTeamId &&
      state.revision &&
      state.releaseKey,
    );
  },

  // Player-specific quiz/reward data must never move between people when a
  // shared phone or tablet signs in to another account. The released team
  // workspace is safe to reuse for a same-team player; only the private
  // progress/cache keys are cleared on an owner change.
  preparePlayerDeviceForUser(user) {
    if (!user || String(user.role || "") !== "player") return { changed: false };
    const teamId = String(user.teamId || "").trim();
    const subject = String(user.d1UserId || user.username || "").trim();
    if (!teamId || !subject) return { changed: false, unresolved: true };
    const owner = `${teamId}:${subject}`;
    const previous = this.get(STORAGE_KEYS.PLAYER_DEVICE_OWNER, null);
    const previousOwner = previous && typeof previous === "object" ? String(previous.owner || "") : "";
    const changed = Boolean(previousOwner && previousOwner !== owner);
    if (changed) {
      PLAYER_DEVICE_PRIVATE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    }
    localStorage.setItem(STORAGE_KEYS.PLAYER_DEVICE_OWNER, _storedJsonValue({
      owner,
      teamId,
      updatedAt: new Date().toISOString(),
    }));
    return { changed, owner };
  },

  // Atomically enough for browser storage: write the new safe playbook and
  // player-facing values first, then remove every coach-only key from this
  // device. This intentionally bypasses regular storageManager.set(), because
  // applying a server release must never queue a player-side cloud publish.
  async replacePlayerReleaseData(release) {
    const source = release && typeof release === "object" ? release : null;
    const teamId = String(source?.release?.teamId || "").trim();
    const revision = String(source?.release?.revision || "").trim();
    const playbook = Array.isArray(source?.playbook) ? source.playbook : null;
    if (!source || source.schema !== "bcoffense.player-release/v1" || !teamId || !revision || !playbook) {
      throw new Error("Player release is incomplete or invalid.");
    }

    const authUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
    this.preparePlayerDeviceForUser(authUser);

    const team = source.team && typeof source.team === "object" ? source.team : {};
    const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
    const releaseKey = _playerReleaseRecordKey(teamId, revision);
    const releaseValues = {
      [STORAGE_KEYS.SAVED_SCRIPTS]: Array.isArray(source.scripts) ? source.scripts : [],
      [STORAGE_KEYS.TEAM_NAME]: String(team.name || ""),
      [STORAGE_KEYS.MOTD]: String(team.motd || ""),
      [STORAGE_KEYS.PLAYER_PORTAL_BRANDING]: team.branding && typeof team.branding === "object" ? team.branding : {},
      [STORAGE_KEYS.PLAYER_QUIZ_SETTINGS]: settings.playerQuizSettings && typeof settings.playerQuizSettings === "object" ? settings.playerQuizSettings : {},
      [STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS]: settings.playerQuizSourceSettings && typeof settings.playerQuizSourceSettings === "object" ? settings.playerQuizSourceSettings : {},
      [STORAGE_KEYS.PLAYER_GAME_PLAN_QUIZ]: source.gamePlanQuiz && typeof source.gamePlanQuiz === "object" ? source.gamePlanQuiz : null,
      [STORAGE_KEYS.PLAYER_SIGNAL_GAME_SETTINGS]: settings.playerSignalGameSettings && typeof settings.playerSignalGameSettings === "object" ? settings.playerSignalGameSettings : {},
      [STORAGE_KEYS.PLAYER_PUBLISH_STATUS]: settings.playerPublishStatus && typeof settings.playerPublishStatus === "object" ? settings.playerPublishStatus : {},
      [STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES]: Array.isArray(settings.playerHelmetStickerTypes) ? settings.playerHelmetStickerTypes : [],
      [STORAGE_KEYS.SIGNALS]: Array.isArray(source.signals) ? source.signals : [],
      [STORAGE_KEYS.PLAYER_RELEASE_STATE]: {
        schema: source.schema,
        teamId,
        revision,
        releaseKey,
        updatedAt: String(source.release?.updatedAt || ""),
        diagramCount: Array.isArray(source.media?.diagramMediaIds) ? source.media.diagramMediaIds.length : 0,
        appliedAt: new Date().toISOString(),
      },
    };

    // Stage the entire immutable player revision before moving the active
    // pointer in localStorage. A failed IDB write leaves the previous release
    // active instead of showing a half-applied workspace.
    await _idbSetPlayerReleasePlaybook(releaseKey, {
      teamId,
      revision,
      playbook,
      stagedAt: new Date().toISOString(),
    });
    Object.entries(releaseValues).forEach(([key, value]) => {
      localStorage.setItem(_localStorageKeyFor(key), _storedJsonValue(value));
    });

    // Do not scrub generic localStorage here. It can belong to a coach who
    // later signs back into this shared browser; player release values are
    // isolated by the prefix above and the player playbook/diagram caches use
    // their own IndexedDB databases.
    return releaseValues[STORAGE_KEYS.PLAYER_RELEASE_STATE];
  },
  // ──────────────────────────────────────────────────────────────────────────

  async getAllData() {
    const data = {
      app: "BCOffense",
      version: STORAGE_VERSION,
      exportDate: new Date().toISOString(),
    };

    _storageKeysForCurrentRole(true).forEach((key) => {
      if (TEAM_BACKUP_EXCLUDED_KEYS.has(key)) return;
      const raw = localStorage.getItem(_localStorageKeyFor(key));
      if (raw !== null) {
        // Always store decompressed JSON strings in backups for portability.
        // This ensures backups are readable and restorable on older app versions.
        data[key] = _lzsDecompress(raw);
      }
    });

    // Resolve through the active role-aware store. A player export can never
    // reach the separate editable coach database on a shared browser.
    try {
      const pb = await this.getPlaybook();
      if (Array.isArray(pb)) {
        data[STORAGE_KEYS.PLAYBOOK] = JSON.stringify(pb);
      }
    } catch (err) {
      console.warn("getAllData: could not read playbook from IDB:", err);
    }

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

    const restoreWarnings = [...validation.warnings];

    // A coach recovery snapshot is deliberately broader than a player
    // release. Never leave a release marker behind that could bless its
    // restored IndexedDB playbook on a shared device.
    localStorage.removeItem(STORAGE_KEYS.PLAYER_RELEASE_STATE);
    _clearPlayerReleaseStorageValues();
    try {
      await _idbClearPlayerReleasePlaybooks();
    } catch (err) {
      console.warn("restoreAllData: player release cache clear failed:", err);
    }

    // Recovery normally merges a portable browser backup, but a staged team
    // workspace recovery needs exact replacement semantics for its explicitly
    // allowlisted keys. This is what makes the pre-restore snapshot a real
    // rollback point: data which exists only in the incoming workspace is
    // removed again when rolling back to a snapshot that does not contain it.
    const replaceMissingKeys = Array.isArray(options.replaceMissingKeys)
      ? new Set(options.replaceMissingKeys.map((key) => String(key || "")).filter(Boolean))
      : null;
    if (replaceMissingKeys) {
      replaceMissingKeys.forEach((key) => {
        if (key === STORAGE_KEYS.PLAYBOOK) return;
        if (!Object.prototype.hasOwnProperty.call(backup, key)) {
          localStorage.removeItem(_localStorageKeyFor(key));
        }
      });
    }

    Object.values(STORAGE_KEYS).forEach((key) => {
      if (key === STORAGE_KEYS.PLAYBOOK) return; // stored in IDB below
      if (backup[key] !== undefined) {
        const value =
          typeof backup[key] === "string"
            ? safeJSONParse(backup[key], undefined)
            : backup[key];
        if (value !== undefined) {
          const normalized = normalizeBackupValueForRestore(key, value, restoreWarnings);
          localStorage.setItem(key, _storedJsonValue(normalized.value));
        }
      }
    });

    // Restore playbook to IndexedDB.
    if (backup[STORAGE_KEYS.PLAYBOOK] !== undefined) {
      try {
        const raw = backup[STORAGE_KEYS.PLAYBOOK];
        const parsed = typeof raw === "string" ? safeJSONParse(raw, null) : raw;
        const normalized = normalizeBackupValueForRestore(
          STORAGE_KEYS.PLAYBOOK,
          parsed,
          restoreWarnings,
        );
        if (Array.isArray(normalized.value)) {
          await _idbSetPlaybook(normalized.value);
          _pbEstimatedBytes = new Blob([JSON.stringify(normalized.value)]).size;
          localStorage.removeItem(STORAGE_KEYS.PLAYBOOK);
        }
      } catch (err) {
        console.error("restoreAllData: IDB playbook write failed:", err);
      }
    } else if (replaceMissingKeys?.has(STORAGE_KEYS.PLAYBOOK)) {
      try {
        await _idbSetPlaybook([]);
        _pbEstimatedBytes = 0;
        localStorage.removeItem(STORAGE_KEYS.PLAYBOOK);
      } catch (err) {
        console.error("restoreAllData: IDB playbook clear failed:", err);
      }
    }

    if (restoreWarnings.length && typeof appDiagnostics !== "undefined") {
      appDiagnostics.mark("storage-restore:normalized", {
        warningCount: restoreWarnings.length,
      });
    }

    this.compactLocalStorage({ removeExpiredDrafts: true });
    return true;
  },

  getStorageInfo() {
    let totalSize = 0;
    const itemSizes = {};

    _storageKeysForCurrentRole(true).forEach((key) => {
      if (key === STORAGE_KEYS.PLAYBOOK) return; // stored in IDB, not localStorage
      const value = localStorage.getItem(_localStorageKeyFor(key));
      if (value) {
        const size = new Blob([value]).size;
        itemSizes[key] = size;
        totalSize += size;
      }
    });

    const estimatedQuotaBytes = 5 * 1024 * 1024;
    const usageRatio = totalSize / estimatedQuotaBytes;
    const largestItems = Object.entries(itemSizes)
      .map(([key, size]) => ({ key, size }))
      .sort((a, b) => b.size - a.size);
    return {
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      itemSizes,
      largestItems,
      itemCount: Object.keys(itemSizes).length,
      estimatedQuotaBytes,
      estimatedQuotaFormatted: this.formatBytes(estimatedQuotaBytes),
      usageRatio,
      warningLevel:
        usageRatio >= 0.9 ? "danger" : usageRatio >= 0.75 ? "warning" : "ok",
      playbookIDBBytes: _pbEstimatedBytes,
      playbookIDBFormatted: this.formatBytes(_pbEstimatedBytes),
    };
  },

  compactLocalStorage(opts = {}) {
    const removeExpiredDrafts = opts.removeExpiredDrafts !== false;
    let beforeBytes = 0;
    let afterBytes = 0;
    let compressedCount = 0;
    let removedDrafts = 0;
    let skippedCount = 0;

    _storageKeysForCurrentRole(true).forEach((key) => {
      if (key === STORAGE_KEYS.PLAYBOOK) return; // playbook belongs in IndexedDB
      const storageKey = _localStorageKeyFor(key);
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return;

      beforeBytes += _storageByteSize(raw);
      const parsed = _parseStoredJson(raw, undefined);
      if (parsed === undefined) {
        afterBytes += _storageByteSize(raw);
        skippedCount += 1;
        return;
      }

      if (
        removeExpiredDrafts &&
        _isDraftStorageKey(key) &&
        isDraftExpired(parsed)
      ) {
        localStorage.removeItem(storageKey);
        removedDrafts += 1;
        return;
      }

      const next = _storedJsonValue(parsed);
      if (next !== raw) {
        try {
          localStorage.setItem(storageKey, next);
          if (!_isLzsEncoded(raw) && _isLzsEncoded(next)) compressedCount += 1;
          afterBytes += _storageByteSize(next);
        } catch (err) {
          console.warn(`Storage compaction skipped ${key}:`, err);
          afterBytes += _storageByteSize(raw);
          skippedCount += 1;
        }
        return;
      }

      afterBytes += _storageByteSize(raw);
    });

    this._compactedThisSession = true;
    const savedBytes = Math.max(0, beforeBytes - afterBytes);
    return {
      beforeBytes,
      afterBytes,
      savedBytes,
      savedFormatted: this.formatBytes(savedBytes),
      compressedCount,
      removedDrafts,
      skippedCount,
    };
  },

  maybeWarnStoragePressure() {
    const now = Date.now();
    if (now - this._lastPressureWarningAt < 10 * 60 * 1000) return;
    if (!this._compactedThisSession) {
      this.compactLocalStorage({ removeExpiredDrafts: true });
    }
    const info = this.getStorageInfo();
    if (info.warningLevel === "ok") return;
    this._lastPressureWarningAt = now;
    const largest = info.largestItems && info.largestItems[0];
    const largestText = largest
      ? ` Largest: ${largest.key} (${this.formatBytes(largest.size)}).`
      : "";
    const message =
      info.warningLevel === "danger"
        ? `Storage is almost full: ${info.totalSizeFormatted} of ${info.estimatedQuotaFormatted}.${largestText}`
        : `Storage is getting full: ${info.totalSizeFormatted} of ${info.estimatedQuotaFormatted}.${largestText}`;
    showToast(message, {
      type: "warning",
      duration: 9000,
      actionLabel: "Review",
      action: "showStorageInfo",
    });
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

    if (_isPlayerStorageRuntime()) {
      _clearPlayerReleaseStorageValues();
      PLAYER_DEVICE_PRIVATE_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } else {
      Object.values(STORAGE_KEYS).forEach((key) => {
        localStorage.removeItem(key);
      });
      _clearPlayerReleaseStorageValues();
    }

    // Also clear the playbook from IndexedDB.
    try {
      await _idbClearPlaybook();
      _pbEstimatedBytes = 0;
    } catch (err) {
      console.error("clearAll: IDB playbook clear failed:", err);
    }
    try {
      await _idbClearPlayerReleasePlaybooks();
    } catch (err) {
      console.error("clearAll: player release IDB clear failed:", err);
    }
    if (!_isPlayerStorageRuntime()) {
      try {
        await this.clearPendingWorkspaceSyncLedger();
      } catch (err) {
        // Clear All should still remove the editable workspace even if a
        // browser refuses the small device-only journal database. Surface the
        // diagnostic rather than pretending the journal was removed.
        console.error("clearAll: pending team-sync journal clear failed:", err);
      }
    }

    return true;
  },
};

// Supports the CSP-safe integrity probe in app-shell.js. The lexical const
// remains the canonical API; this mirrors its existing cross-file contract.
window.STORAGE_KEYS = STORAGE_KEYS;
window.storageManager = storageManager;

(function initCrossTabProtection() {
  let _crossTabToastShown = false;
  window.addEventListener("storage", (e) => {
    if (!e.key || !Object.values(STORAGE_KEYS).includes(e.key)) return;
    if (_crossTabToastShown) return;
    _crossTabToastShown = true;
    showToast("⚠️ Data changed in another tab.", {
      duration: 8000,
      actionLabel: "Reload",
      action: "reloadPage",
    });
    setTimeout(() => {
      _crossTabToastShown = false;
    }, 9000);
  });
})();

async function reloadAppFromStorage(opts = {}) {
  const run = () => _reloadAppFromStorageInternal(opts);
  if (
    window.appStartup &&
    typeof window.appStartup.runCritical === "function"
  ) {
    return window.appStartup.runCritical("storage-reload", run, {
      suppressCloudAutoPush: true,
    });
  }
  return run();
}

async function _reloadAppFromStorageInternal(opts = {}) {
  const runReloadStep = async (label, callback) => {
    const run = () => callback();
    try {
      return typeof appDiagnostics !== "undefined"
        ? await appDiagnostics.measure(`storage-reload:${label}`, run)
        : await run();
    } catch (err) {
      console.error(`reloadAppFromStorage step failed: ${label}`, err);
      if (typeof appDiagnostics !== "undefined") {
        appDiagnostics.mark("storage-reload:step-failed", {
          label,
          message: err?.message || String(err),
        });
      }
      return null;
    }
  };

  if (typeof appDiagnostics !== "undefined") appDiagnostics.mark("storage-reload:start");

  const storedPlaybook = await runReloadStep("get-playbook", () =>
    storageManager.getPlaybook(),
  );
  await runReloadStep("playbook-state", async () => {
    if (Array.isArray(storedPlaybook)) {
      plays = storedPlaybook;
      if (typeof ensurePlaybookPlayIds === "function") {
        const changed = ensurePlaybookPlayIds(plays);
        if (changed > 0) {
          const preservePlayerRelease = typeof getCurrentAuthUser === "function" &&
            getCurrentAuthUser()?.role === "player" &&
            storageManager.hasPlayerReleaseCacheForTeam(getCurrentAuthUser()?.teamId);
          await storageManager.setPlaybook(plays, { preservePlayerRelease });
        }
      }
      if (typeof invalidatePlaybookRuntimeIndex === "function") invalidatePlaybookRuntimeIndex();
      filteredPlays = [...plays];
    }
  });

  await runReloadStep("module-state", () => {
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
      if (css) {
        callSheetSettings =
          typeof normalizeCallSheetSettings === "function"
            ? normalizeCallSheetSettings(css)
            : css;
      }
    }

    if (typeof rebuildCallSheetCategoryRegistry === "function") {
      rebuildCallSheetCategoryRegistry();
    }
    if (typeof syncCallSheetCategoryData === "function") {
      syncCallSheetCategoryData();
    }
    if (typeof csCategoryOrder !== "undefined") {
      csCategoryOrder =
        typeof normalizeCallSheetCategoryOrder === "function"
          ? normalizeCallSheetCategoryOrder(
            storageManager.get(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, null),
          )
          : storageManager.get(STORAGE_KEYS.CALLSHEET_CATEGORY_ORDER, {});
    }
    if (typeof csNotes !== "undefined") {
      csNotes = storageManager.get(STORAGE_KEYS.CALLSHEET_NOTES, {});
    }
    if (typeof csTargets !== "undefined") {
      csTargets = storageManager.get(STORAGE_KEYS.CALLSHEET_TARGETS, {});
    }
    if (typeof csCollapsed !== "undefined") {
      const collapsed = storageManager.get(
        STORAGE_KEYS.CALLSHEET_COLLAPSED,
        [],
      );
      csCollapsed = new Set(Array.isArray(collapsed) ? collapsed : []);
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
  });

  await runReloadStep("restore-display-state", () => {
    if (typeof restoreCallSheetDisplayOptions === "function") {
      restoreCallSheetDisplayOptions();
    }
    if (typeof resetCallSheetHistoryBaseline === "function") {
      resetCallSheetHistoryBaseline();
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
  });

  await runReloadStep("refresh-derived-state", () => {
    if (typeof populateFilters === "function") {
      populateFilters();
    }
    if (typeof filterPlays === "function") {
      filterPlays();
    } else if (Array.isArray(plays)) {
      filteredPlays = [...plays];
    }
    if (typeof updateGameWeekBar === "function") {
      updateGameWeekBar();
    }
    if (typeof updateTabBadges === "function") {
      updateTabBadges();
    }
  });

  const requestedTab = String(opts.targetTab || "").trim();
  const canUseRequestedTab =
    requestedTab &&
    (typeof canAccessTab !== "function" || canAccessTab(requestedTab));
  const activeTab = canUseRequestedTab
    ? requestedTab
    : (typeof currentActiveTab !== "undefined"
        ? currentActiveTab
        : document.body?.dataset.activeTab);
  await runReloadStep("render-active-surfaces", () => {
    if (opts.refreshActiveTab !== false && activeTab && typeof showTab === "function") {
      showTab(activeTab);
    } else {
      if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
      if (typeof requestRenderGamePlan === "function") requestRenderGamePlan();
      if (typeof requestRenderDashboard === "function" && activeTab === "dashboard") {
        requestRenderDashboard();
      }
    }
  });

  if (typeof appDiagnostics !== "undefined") {
    appDiagnostics.mark("storage-reload:done", {
      activeTab: activeTab || "",
      playCount: Array.isArray(plays) ? plays.length : 0,
    });
  }
}
