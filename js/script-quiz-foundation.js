// Player quiz engine and UI runtime extracted from script-render.js. State lives
// in script-quiz-state.js; progress and leaderboard presentation are split out.

function _quizPerfNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function _quizPerfMeta(extra = {}) {
  return {
    sourceType: _quizSourceType,
    mode: _quizMode,
    count: _quizPlays.length,
    index: _quizIndex,
    ...extra,
  };
}

function _quizPerfMark(name, meta = {}) {
  if (typeof appDiagnostics !== "undefined" && typeof appDiagnostics.mark === "function") {
    appDiagnostics.mark(`quiz:${name}`, _quizPerfMeta(meta));
  }
}

function _quizPerfRecord(name, startedAt, meta = {}) {
  if (typeof window === "undefined" || !window.perfMonitor || typeof window.perfMonitor.record !== "function") return;
  window.perfMonitor.record(`quiz:${name}`, _quizPerfNow() - startedAt, _quizPerfMeta(meta));
}
const PLAYER_QUIZ_TIER_DEFAULTS = [
  { key: "champion", label: "Champion" },
  { key: "baller", label: "Baller" },
  { key: "starter", label: "Starter" },
  { key: "contributor", label: "Contributor" },
  { key: "defense", label: "Defense" },
];
const PLAYER_QUIZ_TIERS = PLAYER_QUIZ_TIER_DEFAULTS.map((tier) => tier.label);
const PLAYER_QUIZ_DEFAULT_TIER_NAMES = PLAYER_QUIZ_TIER_DEFAULTS.reduce((acc, tier) => {
  acc[tier.key] = tier.label;
  return acc;
}, {});
const PLAYER_QUIZ_BADGES = [
  { min: 95, label: "Coaches List", bonus: 75 },
  { min: 90, label: "High Honor Roll", bonus: 50 },
  { min: 85, label: "Honor Roll", bonus: 30 },
];
const PLAYER_QUIZ_REWARD_POINT_DEFAULTS = {
  question: 15,
  answer: 25,
  gift: 50,
};
const PLAYER_QUIZ_DEFAULT_SETTINGS = {
  weeklyGoal: PLAYER_QUIZ_WEEKLY_GOAL,
  baseCorrectPoints: PLAYER_QUIZ_BASE_CORRECT_POINTS,
  scriptWeight: PLAYER_QUIZ_SOURCE_WEIGHTS.script,
  gameplanWeight: PLAYER_QUIZ_SOURCE_WEIGHTS.gameplan,
  honorRollMin: 85,
  honorRollBonus: 30,
  highHonorRollMin: 90,
  highHonorRollBonus: 50,
  coachesListMin: 95,
  coachesListBonus: 75,
  minBonusAnswers: PLAYER_QUIZ_MIN_BONUS_ANSWERS,
  questionPoints: PLAYER_QUIZ_REWARD_POINT_DEFAULTS.question,
  answerPoints: PLAYER_QUIZ_REWARD_POINT_DEFAULTS.answer,
  giftPoints: PLAYER_QUIZ_REWARD_POINT_DEFAULTS.gift,
  dailyRewardCap: 125,
  weeklyRewardCap: 350,
  enabledQuestionTypes: ["responsibility", "play_from_rule", "diagram", "signal", "call"],
  tierNames: { ...PLAYER_QUIZ_DEFAULT_TIER_NAMES },
};
const PLAYER_QUIZ_QUESTION_TYPES = ["responsibility", "play_from_rule", "diagram", "signal", "call"];
const DEFAULT_PLAYER_HELMET_STICKER_TYPES = [
  { key: "sure-hands", label: "Sure Hands", icon: "🤲", color: "green", description: "Caught the ball, finished the rep, or protected possession." },
  { key: "do-your-job", label: "Do Your Job", icon: "🧠", color: "blue", description: "Handled the assignment without needing extra coaching." },
  { key: "big-hit", label: "Big Hit", icon: "💥", color: "red", description: "Brought physicality and set the tone in practice." },
  { key: "explosive-play", label: "Explosive Play", icon: "⚡", color: "gold", description: "Created a chunk play, fast finish, or game-changing rep." },
  { key: "great-teammate", label: "Great Teammate", icon: "🤝", color: "purple", description: "Helped another player learn, line up, or compete." },
  { key: "trust-process", label: "Trust the Process", icon: "🏅", color: "navy", description: "Stacked good habits and stayed locked into the plan." },
];
let _leaderboardSelectedPlayer = "";
let _playerLeaderboardView = "week";
let _signalLeaderboardMode = "signal-sprint";
let _coachQuizLeaderboardView = "week";
let _playerQuizSelectedScriptId = "";

function _getPlayerQuizStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_RESULTS
    ? STORAGE_KEYS.PLAYER_QUIZ_RESULTS
    : "playerQuizResults";
}

function _getPlayerQuizDraftStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_DRAFT
    ? STORAGE_KEYS.PLAYER_QUIZ_DRAFT
    : "playerQuizDraft";
}

function _getPlayerQuizSettingsStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_SETTINGS
    ? STORAGE_KEYS.PLAYER_QUIZ_SETTINGS
    : "playerQuizSettings";
}

function _getPlayerQuizSourceSettingsStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS
    ? STORAGE_KEYS.PLAYER_QUIZ_SOURCE_SETTINGS
    : "playerQuizSourceSettings";
}

function _getPlayerGamePlanQuizStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_GAME_PLAN_QUIZ
    ? STORAGE_KEYS.PLAYER_GAME_PLAN_QUIZ
    : "playerGamePlanQuiz";
}

function _isPlayerQuizReleaseRuntime() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return user?.role === "player";
}

function _getReleasedGamePlanQuizSource() {
  if (!_isPlayerQuizReleaseRuntime() || typeof storageManager === "undefined") return null;
  const source = storageManager.get(_getPlayerGamePlanQuizStorageKey(), null);
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  if (!String(source.id || "").trim() || !Array.isArray(source.items)) return null;
  return source;
}

function _getPlayerSignalGameSettingsStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_SIGNAL_GAME_SETTINGS
    ? STORAGE_KEYS.PLAYER_SIGNAL_GAME_SETTINGS
    : "playerSignalGameSettings";
}

function _getPlayerRewardStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_REWARD_EVENTS
    ? STORAGE_KEYS.PLAYER_REWARD_EVENTS
    : "playerRewardEvents";
}

function _clampQuizNumber(value, fallback, min, max, opts = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.max(min, Math.min(max, parsed));
  return opts.integer ? Math.round(clamped) : Number(clamped.toFixed(opts.decimals ?? 2));
}

function _normalizeQuizTierNames(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return PLAYER_QUIZ_TIER_DEFAULTS.reduce((acc, tier) => {
    const label = String(src[tier.key] ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
    acc[tier.key] = label || tier.label;
    return acc;
  }, {});
}

function _normalizePlayerQuizSettings(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const defaults = PLAYER_QUIZ_DEFAULT_SETTINGS;
  const enabled = Array.isArray(src.enabledQuestionTypes)
    ? src.enabledQuestionTypes.filter((type) => PLAYER_QUIZ_QUESTION_TYPES.includes(type))
    : defaults.enabledQuestionTypes;
  return {
    weeklyGoal: _clampQuizNumber(src.weeklyGoal, defaults.weeklyGoal, 250, 5000, { integer: true }),
    baseCorrectPoints: _clampQuizNumber(src.baseCorrectPoints, defaults.baseCorrectPoints, 1, 50, { integer: true }),
    scriptWeight: _clampQuizNumber(src.scriptWeight, defaults.scriptWeight, 0.25, 5),
    gameplanWeight: _clampQuizNumber(src.gameplanWeight, defaults.gameplanWeight, 0.25, 5),
    honorRollMin: _clampQuizNumber(src.honorRollMin, defaults.honorRollMin, 50, 100, { integer: true }),
    honorRollBonus: _clampQuizNumber(src.honorRollBonus, defaults.honorRollBonus, 0, 500, { integer: true }),
    highHonorRollMin: _clampQuizNumber(src.highHonorRollMin, defaults.highHonorRollMin, 50, 100, { integer: true }),
    highHonorRollBonus: _clampQuizNumber(src.highHonorRollBonus, defaults.highHonorRollBonus, 0, 500, { integer: true }),
    coachesListMin: _clampQuizNumber(src.coachesListMin, defaults.coachesListMin, 50, 100, { integer: true }),
    coachesListBonus: _clampQuizNumber(src.coachesListBonus, defaults.coachesListBonus, 0, 500, { integer: true }),
    minBonusAnswers: _clampQuizNumber(src.minBonusAnswers, defaults.minBonusAnswers, 1, 50, { integer: true }),
    questionPoints: _clampQuizNumber(src.questionPoints, defaults.questionPoints, 0, 250, { integer: true }),
    answerPoints: _clampQuizNumber(src.answerPoints, defaults.answerPoints, 0, 250, { integer: true }),
    giftPoints: _clampQuizNumber(src.giftPoints, defaults.giftPoints, 0, 500, { integer: true }),
    dailyRewardCap: _clampQuizNumber(src.dailyRewardCap, defaults.dailyRewardCap, 0, 1000, { integer: true }),
    weeklyRewardCap: _clampQuizNumber(src.weeklyRewardCap, defaults.weeklyRewardCap, 0, 3000, { integer: true }),
    enabledQuestionTypes: enabled.length ? Array.from(new Set(enabled)) : ["call"],
    tierNames: _normalizeQuizTierNames(src.tierNames || defaults.tierNames),
  };
}

function _getPlayerQuizSettings() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") {
    return _normalizePlayerQuizSettings(PLAYER_QUIZ_DEFAULT_SETTINGS);
  }
  return _normalizePlayerQuizSettings(storageManager.get(_getPlayerQuizSettingsStorageKey(), PLAYER_QUIZ_DEFAULT_SETTINGS));
}

function _savePlayerQuizSettings(settings) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return _getPlayerQuizSettings();
  const normalized = _normalizePlayerQuizSettings(settings);
  storageManager.set(_getPlayerQuizSettingsStorageKey(), normalized);
  return normalized;
}

function _getQuizWeeklyGoal() {
  return _getPlayerQuizSettings().weeklyGoal;
}

function _getQuizTierName(key, settings = _getPlayerQuizSettings()) {
  const names = _normalizeQuizTierNames(settings?.tierNames);
  return names[key] || PLAYER_QUIZ_DEFAULT_TIER_NAMES[key] || String(key || "");
}

function _getQuizSourceWeight(sourceType = _quizSourceType) {
  const settings = _getPlayerQuizSettings();
  if (sourceType === "gameplan") return settings.gameplanWeight;
  if (sourceType === "assignment") return settings.scriptWeight;
  if (!sourceType || sourceType === "script") return settings.scriptWeight;
  return PLAYER_QUIZ_SOURCE_WEIGHTS[sourceType] || settings.scriptWeight;
}

function _getQuizSourceLabel(sourceType = _quizSourceType, variant = "title") {
  const normalized = String(sourceType || "").trim();
  if (normalized === "gameplan") return variant === "sentence" ? "game plan" : "Game Plan";
  if (normalized === "signal") return variant === "sentence" ? "signal set" : "Signals";
  if (normalized === "assignment") return variant === "sentence" ? "homework quiz" : "Homework";
  return variant === "sentence" ? "script" : "Script";
}

function _isSignalSprintMode(mode = _quizMode) {
  return String(mode || "") === "signal-sprint";
}

function _isSignalBattleMode(mode = _quizMode) {
  return String(mode || "") === "signal-battle";
}

function _isSignalHeatCheckMode(mode = _quizMode) {
  return String(mode || "") === "signal-heat";
}

function _isSignalFullCallMode(mode = _quizMode) {
  return String(mode || "") === "signal-full-call";
}

function _isTimedSignalGameMode(mode = _quizMode) {
  return _isSignalSprintMode(mode) || _isSignalBattleMode(mode);
}

function _isSignalAutoAdvanceMode(mode = _quizMode) {
  return _isTimedSignalGameMode(mode) || _isSignalHeatCheckMode(mode);
}

function _normalizeSignalGameCategories(categories) {
  const allowed = new Set(SIGNAL_GAME_CATEGORY_OPTIONS.map((category) => category.id));
  const selected = Array.isArray(categories) ? categories : [];
  const clean = selected
    .map((category) => String(category || "").trim().toUpperCase())
    .filter((category) => allowed.has(category));
  return Array.from(new Set(clean));
}

function _clampSignalGameMinClipCount(value) {
  return _clampQuizNumber(value, SIGNAL_GAME_DEFAULT_SETTINGS.minClipCount, 2, 50, { integer: true });
}

function _normalizeSignalGameSettings(raw = {}, status = null) {
  const src = raw && typeof raw === "object" ? raw : {};
  const allCategories = SIGNAL_GAME_CATEGORY_OPTIONS.map((category) => category.id);
  const available = new Set(
    (Array.isArray(status?.categories) ? status.categories : [])
      .filter((category) => Number(category.count || 0) > 0)
      .map((category) => String(category.id || "").trim().toUpperCase())
      .filter(Boolean),
  );
  const eligibleCategories = _normalizeSignalGameCategories(src.eligibleCategories).length
    ? _normalizeSignalGameCategories(src.eligibleCategories)
    : allCategories;
  const selectable = eligibleCategories.filter((id) => !available.size || available.has(id));
  const fallbackCategories = selectable.length ? selectable : eligibleCategories;
  const categories = _normalizeSignalGameCategories(src.categories)
    .filter((id) => eligibleCategories.includes(id))
    .filter((id) => !available.size || available.has(id));
  return {
    categories: categories.length ? categories : fallbackCategories,
    eligibleCategories,
    minClipCount: _clampSignalGameMinClipCount(src.minClipCount),
    includeDraftForStaff: src.includeDraftForStaff === true,
  };
}

function _getSignalGameSettings(status = null) {
  const raw = typeof storageManager !== "undefined" && typeof storageManager.get === "function"
    ? storageManager.get(_getPlayerSignalGameSettingsStorageKey(), {})
    : {};
  return _normalizeSignalGameSettings(raw, status);
}

function _saveSignalGameSettings(settings = {}) {
  const current = _getSignalGameSettings();
  const normalized = _normalizeSignalGameSettings({ ...current, ...settings });
  if (typeof storageManager !== "undefined" && typeof storageManager.set === "function") {
    storageManager.set(_getPlayerSignalGameSettingsStorageKey(), normalized);
  }
  return normalized;
}

function _canUseStaffSignalClips(settings = _getSignalGameSettings()) {
  return Boolean(settings.includeDraftForStaff && typeof canEditUser === "function" && canEditUser());
}

function _getSignalCategoryMultiplier(categories = _quizSignalCategories, eligibleCategories = SIGNAL_GAME_DEFAULT_SETTINGS.eligibleCategories) {
  const count = _normalizeSignalGameCategories(categories).length;
  const eligibleCount = Math.max(1, _normalizeSignalGameCategories(eligibleCategories).length || SIGNAL_GAME_CATEGORY_OPTIONS.length);
  if (count >= eligibleCount) return 2;
  if (count <= 1) return 1;
  return Number((1 + ((count - 1) * 0.25)).toFixed(2));
}

function _formatSignalCategories(categories = _quizSignalCategories) {
  const selected = _normalizeSignalGameCategories(categories);
  if (selected.length >= SIGNAL_GAME_CATEGORY_OPTIONS.length) return "All categories";
  return SIGNAL_GAME_CATEGORY_OPTIONS
    .filter((category) => selected.includes(category.id))
    .map((category) => category.label)
    .join(" + ") || "No categories";
}

function _clearQuizTimer() {
  if (_quizTimerId) {
    clearInterval(_quizTimerId);
    _quizTimerId = 0;
  }
}

function _clearStandardQuizAdvance() {
  if (_quizStandardAdvanceTimer) {
    clearTimeout(_quizStandardAdvanceTimer);
    _quizStandardAdvanceTimer = 0;
  }
}

function _clearQuizRoundTimer() {
  if (_quizRoundTimerId) {
    clearInterval(_quizRoundTimerId);
    _quizRoundTimerId = 0;
  }
}

function _resetQuizRoundState() {
  _clearQuizRoundTimer();
  _quizRoundQuestionKey = "";
  _quizRoundStartedAt = 0;
  _quizRoundClipUntil = 0;
  _quizRoundAnswerUntil = 0;
  _quizRoundPhase = "";
}

function _getQuizElapsedMs() {
  if (!_quizStartedAt) return 0;
  const end = _quizFinishedAt || Date.now();
  return Math.max(0, end - _quizStartedAt);
}

function _getQuizRemainingMs() {
  if (!_quizTimeLimitMs) return 0;
  return Math.max(0, _quizTimeLimitMs - _getQuizElapsedMs());
}

function _formatQuizClock(ms) {
  return `${Math.max(0, Math.ceil(Number(ms || 0) / 1000))}s`;
}

function _getSignalBattlePhase() {
  if (!_isSignalBattleMode() || !_quizRoundQuestionKey) return "";
  const now = Date.now();
  if (now < _quizRoundClipUntil) return "clip";
  if (now < _quizRoundAnswerUntil) return "answer";
  return "expired";
}

function _getSignalBattleRemainingMs() {
  if (!_isSignalBattleMode() || !_quizRoundQuestionKey) return 0;
  const phase = _getSignalBattlePhase();
  const target = phase === "clip" ? _quizRoundClipUntil : _quizRoundAnswerUntil;
  return Math.max(0, target - Date.now());
}

function _formatSignalBattleLabel() {
  const phase = _getSignalBattlePhase();
  if (phase === "clip") return `Watch · ${_formatQuizClock(_getSignalBattleRemainingMs())}`;
  if (phase === "answer") return `Answer · ${_formatQuizClock(_getSignalBattleRemainingMs())}`;
  return "Answer";
}

function _syncQuizTimerUi() {
  if (_quizFinished) return;
  const remaining = _quizTimeLimitMs ? _getQuizRemainingMs() : _getSignalBattleRemainingMs();
  const clockLabel = _isSignalBattleMode() ? _formatSignalBattleLabel() : _formatQuizClock(remaining);
  const progressEl = document.getElementById("scriptQuizProgress");
  if (progressEl) {
    progressEl.textContent = `${_quizIndex + 1} / ${_quizPlays.length} · ${clockLabel}`;
  }
  const scoreEl = document.getElementById("scriptQuizScore");
  if (scoreEl) {
    scoreEl.textContent = `Score ${_quizScore} · Streak ${_quizStreak} · ${clockLabel}`;
  }
  const timerPill = document.getElementById("scriptQuizTimerPill");
  if (timerPill) timerPill.textContent = clockLabel;
}

function _getQuizAverageAnswerMs() {
  const answers = Array.from(_quizAnswers.values()).filter((answer) => Number(answer.elapsedMs || 0) > 0);
  if (!answers.length) return 0;
  const first = Math.max(0, Number(answers[0].elapsedMs || 0));
  const last = Math.max(first, Number(answers[answers.length - 1].elapsedMs || 0));
  return Math.round((last - first || last) / answers.length);
}

function _getQuizAverageReactionMs() {
  const answers = Array.from(_quizAnswers.values()).filter((answer) => Number(answer.reactionMs || 0) > 0);
  if (!answers.length) return 0;
  const total = answers.reduce((sum, answer) => sum + Number(answer.reactionMs || 0), 0);
  return Math.round(total / answers.length);
}

function _startQuizTimerIfNeeded() {
  _clearQuizTimer();
  if (!_quizTimeLimitMs) return;
  _quizTimerId = setInterval(() => {
    if (_quizFinished) {
      _clearQuizTimer();
      return;
    }
    if (_getQuizRemainingMs() <= 0) {
      finishScriptQuiz({ timedOut: true });
      return;
    }
    _syncQuizTimerUi();
  }, 500);
}

function _recordSignalBattleTimeout(questionKey = _quizRoundQuestionKey) {
  if (!_isSignalBattleMode() || _quizFinished || !questionKey || _quizAnswers.has(questionKey)) return false;
  const item = _quizPlays[_quizIndex];
  if (!item || _quizItemKey(item) !== questionKey) return false;
  const choices = _quizCurrentChoices.length ? _quizCurrentChoices : _getQuizQuestionAndChoices(item).choices;
  const correctChoice = choices.find((choice) => choice.correct);
  const position = _quizCurrentQuestion?.position || _getQuizPositionForItem(item);
  _quizStreak = 0;
  _quizAnswers.set(questionKey, {
    choiceKey: "__timeout__",
    correct: false,
    questionType: correctChoice?.questionType || _quizCurrentQuestion?.type || "signal",
    positionKey: position?.key || item.positionKey || _quizPositionKey,
    positionLabel: position?.label || "",
    selectedLabel: "Timed out",
    correctLabel: correctChoice?.label || "",
    prompt: _quizCurrentQuestion?.prompt || "",
    playCall: _quizPlainCall(item.play),
    streakAfter: 0,
    momentLabel: "",
    elapsedMs: _getQuizElapsedMs(),
    reactionMs: SIGNAL_BATTLE_ANSWER_MS,
    timedOut: true,
    answeredAt: new Date().toISOString(),
  });
  _resetQuizRoundState();
  renderScriptQuizPlay();
  _advanceSignalGameAfterAnswer(questionKey);
  return true;
}

function _startSignalBattleRound(questionKey) {
  _resetQuizRoundState();
  _quizRoundQuestionKey = questionKey;
  _quizRoundStartedAt = Date.now();
  _quizRoundClipUntil = _quizRoundStartedAt + SIGNAL_BATTLE_CLIP_MS;
  _quizRoundAnswerUntil = _quizRoundClipUntil + SIGNAL_BATTLE_ANSWER_MS;
  _quizRoundPhase = "clip";
  _quizRoundTimerId = setInterval(() => {
    if (_quizFinished || !_isSignalBattleMode()) {
      _resetQuizRoundState();
      return;
    }
    const phase = _getSignalBattlePhase();
    if (phase === "expired") {
      _recordSignalBattleTimeout(questionKey);
      return;
    }
    if (phase !== _quizRoundPhase) {
      _quizRoundPhase = phase;
      renderScriptQuizPlay();
      return;
    }
    _syncQuizTimerUi();
  }, 250);
}

function _ensureSignalBattleRound(questionKey, answer) {
  if (!_isSignalBattleMode() || answer || _quizFinished) return { phase: "", remainingMs: 0 };
  if (_quizRoundQuestionKey !== questionKey) {
    _startSignalBattleRound(questionKey);
  }
  const phase = _getSignalBattlePhase();
  return {
    phase,
    remainingMs: _getSignalBattleRemainingMs(),
    locked: phase === "clip",
    expired: phase === "expired",
  };
}

function _getQuizBadges() {
  const settings = _getPlayerQuizSettings();
  return [
    { min: settings.coachesListMin, label: "Coaches List", bonus: settings.coachesListBonus },
    { min: settings.highHonorRollMin, label: "High Honor Roll", bonus: settings.highHonorRollBonus },
    { min: settings.honorRollMin, label: "Honor Roll", bonus: settings.honorRollBonus },
  ].sort((a, b) => b.min - a.min);
}

function _getQuizRewardDefaults() {
  const settings = _getPlayerQuizSettings();
  return {
    question: settings.questionPoints,
    answer: settings.answerPoints,
    gift: settings.giftPoints,
  };
}

function _quizSourceKey(kind, id) {
  return `${kind}:${String(id || "").trim() || "__current__"}`;
}

function _normalizeQuizSourceState(value, fallback = "available") {
  const state = String(value || fallback || "available").trim().toLowerCase();
  return ["available", "locked", "coach"].includes(state) ? state : fallback;
}

function _getPlayerQuizSourceSettings() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return {};
  const raw = storageManager.get(_getPlayerQuizSourceSettingsStorageKey(), {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function _savePlayerQuizSourceSettings(settings) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const clean = {};
  Object.entries(settings && typeof settings === "object" ? settings : {}).forEach(([key, value]) => {
    const state = _normalizeQuizSourceState(value?.state || value, "");
    if (!state) return;
    clean[key] = {
      state,
      updatedAt: value?.updatedAt || new Date().toISOString(),
    };
  });
  storageManager.set(_getPlayerQuizSourceSettingsStorageKey(), clean);
}

function _getQuizSourceSetting(kind, id) {
  const settings = _getPlayerQuizSourceSettings();
  const entry = settings[_quizSourceKey(kind, id)];
  return entry && typeof entry === "object" ? entry : {};
}

function _setQuizSourceState(kind, id, state) {
  const updatedAt = new Date().toISOString();
  const settings = _getPlayerQuizSourceSettings();
  settings[_quizSourceKey(kind, id)] = {
    state: _normalizeQuizSourceState(state),
    updatedAt,
  };
  _savePlayerQuizSourceSettings(settings);
  if (typeof recordPlayerPublishStatus === "function") {
    recordPlayerPublishStatus("quizzes", {
      updatedAt,
      label: `${kind === "gameplan" ? "Game Plan" : "Script"} quiz set to ${state === "coach" ? "coach-only" : state}`,
    });
  }
}

function _getQuizSourceState(kind, source = {}) {
  const setting = _getQuizSourceSetting(kind, source.id);
  if (setting.state) return _normalizeQuizSourceState(setting.state);
  if (kind === "script") return source.playerVisible ? "available" : "coach";
  return "available";
}

// The final player-side launch guard must resolve the released script record,
// not just an ID.  An ID-only check loses `playerVisible` whenever a coach has
// not created an optional quiz-source setting, which made a coach-visible
// “Available” source reject players at Start Quiz.
function getPlayerQuizSourceAvailability(kind, id, source = null) {
  const sourceKind = String(kind || "").trim().toLowerCase();
  const sourceId = String(id || "").trim();
  let record = source && typeof source === "object" ? source : { id: sourceId };

  if (sourceKind === "script" && !Array.isArray(record?.plays)) {
    const savedScripts = typeof getSavedScripts === "function" ? getSavedScripts() : [];
    record = (Array.isArray(savedScripts) ? savedScripts : [])
      .find((savedScript) => String(savedScript?.id || "") === sourceId) || record;
  }

  const state = _getQuizSourceState(sourceKind, record || { id: sourceId });
  if (state !== "available") {
    return { available: false, state, reason: state === "locked" ? "locked" : "coach-only", source: record || null };
  }
  if (sourceKind !== "script") return { available: true, state, reason: "", source: record || null };
  if (!record?.playerVisible) {
    return { available: false, state: "coach", reason: "not-player-visible", source: record || null };
  }

  // Two distinct calls are the minimum fair fallback: they give Call ID an
  // answer plus a real distractor even when diagrams or player rules are thin.
  const items = typeof _normalizeQuizItems === "function" ? _normalizeQuizItems(record.plays || []) : [];
  const calls = new Set(items.map((item) => _quizShortCall(item.play).toLowerCase()).filter(Boolean));
  if (items.length < 2 || calls.size < 2) {
    return { available: false, state, reason: "needs-question-pair", source: record };
  }
  return { available: true, state, reason: "", source: record };
}

function _quizSourceStateLabel(state, stats = null) {
  if (state === "available" && stats && stats.score < 40) return { label: "Available · Thin", tone: "thin" };
  if (state === "available") return { label: "Available", tone: "ready" };
  if (state === "locked") return { label: "Locked", tone: "locked" };
  return { label: "Coach-only", tone: "coach" };
}

function isPlayerQuizSourceAvailable(kind, id) {
  return getPlayerQuizSourceAvailability(kind, id).available;
}

function _getPlayerHelmetStickerStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_HELMET_STICKERS
    ? STORAGE_KEYS.PLAYER_HELMET_STICKERS
    : "playerHelmetStickers";
}

function _getPlayerHelmetStickerTypesStorageKey() {
  return typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES
    ? STORAGE_KEYS.PLAYER_HELMET_STICKER_TYPES
    : "playerHelmetStickerTypes";
}

function _getPlayerQuizAttempts() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return [];
  const attempts = storageManager.get(_getPlayerQuizStorageKey(), []);
  return Array.isArray(attempts) ? attempts.filter((attempt) => attempt && typeof attempt === "object") : [];
}

function _savePlayerQuizAttempts(attempts) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const normalized = (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => attempt && typeof attempt === "object")
    .slice(-150);
  storageManager.set(_getPlayerQuizStorageKey(), normalized);
  if (typeof window !== "undefined" && typeof window.queuePlayerLeaderboardSync === "function") {
    window.queuePlayerLeaderboardSync("attempts");
  }
}

function _getPlayerRewardEvents() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return [];
  const events = storageManager.get(_getPlayerRewardStorageKey(), []);
  return Array.isArray(events) ? events.filter((event) => event && typeof event === "object") : [];
}

function _savePlayerRewardEvents(events) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const normalized = (Array.isArray(events) ? events : [])
    .filter((event) => event && typeof event === "object")
    .slice(-400);
  storageManager.set(_getPlayerRewardStorageKey(), normalized);
  if (typeof window !== "undefined" && typeof window.queuePlayerLeaderboardSync === "function") {
    window.queuePlayerLeaderboardSync("rewards");
  }
}

function _getPlayerHelmetStickers() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return [];
  const stickers = storageManager.get(_getPlayerHelmetStickerStorageKey(), []);
  return Array.isArray(stickers) ? stickers.filter((sticker) => sticker && typeof sticker === "object") : [];
}

function _savePlayerHelmetStickers(stickers) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const normalized = (Array.isArray(stickers) ? stickers : [])
    .filter((sticker) => sticker && typeof sticker === "object")
    .slice(-500);
  storageManager.set(_getPlayerHelmetStickerStorageKey(), normalized);
  if (typeof window !== "undefined" && typeof window.queuePlayerLeaderboardSync === "function") {
    window.queuePlayerLeaderboardSync("stickers");
  }
}

function _normalizeHelmetStickerType(sticker = {}, fallback = {}) {
  const label = String(sticker.label || fallback.label || "Helmet Sticker").trim() || "Helmet Sticker";
  const key = String(sticker.key || fallback.key || label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `sticker-${Date.now()}`;
  const color = ["green", "blue", "red", "gold", "purple", "navy"].includes(String(sticker.color || fallback.color || "").trim())
    ? String(sticker.color || fallback.color).trim()
    : "blue";
  return {
    key,
    label,
    icon: String(sticker.icon || fallback.icon || "🏅").trim().slice(0, 8) || "🏅",
    color,
    description: String(sticker.description || fallback.description || "").trim(),
    custom: Boolean(sticker.custom || fallback.custom),
  };
}

function _getPlayerHelmetStickerTypes() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") {
    return DEFAULT_PLAYER_HELMET_STICKER_TYPES.map((sticker) => _normalizeHelmetStickerType(sticker));
  }
  const custom = storageManager.get(_getPlayerHelmetStickerTypesStorageKey(), []);
  const merged = [
    ...DEFAULT_PLAYER_HELMET_STICKER_TYPES,
    ...(Array.isArray(custom) ? custom : []),
  ];
  const byKey = new Map();
  merged.forEach((sticker) => {
    const normalized = _normalizeHelmetStickerType(sticker);
    byKey.set(normalized.key, normalized);
  });
  return Array.from(byKey.values());
}

function _savePlayerHelmetStickerTypes(stickers) {
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return;
  const defaultKeys = new Set(DEFAULT_PLAYER_HELMET_STICKER_TYPES.map((sticker) => sticker.key));
  const normalized = (Array.isArray(stickers) ? stickers : [])
    .map((sticker) => _normalizeHelmetStickerType({ ...sticker, custom: true }))
    .filter((sticker) => sticker.label && !defaultKeys.has(sticker.key))
    .slice(-40);
  storageManager.set(_getPlayerHelmetStickerTypesStorageKey(), normalized);
}

function _getPlayerHelmetStickerType(stickerKey = "", fallbackLabel = "") {
  const key = String(stickerKey || "").trim();
  const label = String(fallbackLabel || "").trim().toLowerCase();
  return _getPlayerHelmetStickerTypes().find((sticker) => (
    (key && sticker.key === key) ||
    (label && sticker.label.toLowerCase() === label)
  )) || null;
}

function _getPlayerQuizDraft() {
  if (typeof storageManager === "undefined" || typeof storageManager.get !== "function") return null;
  const draft = storageManager.get(_getPlayerQuizDraftStorageKey(), null);
  return draft && typeof draft === "object" && Array.isArray(draft.plays) ? draft : null;
}

let _quizDraftSaveTimer = null;
const QUIZ_DRAFT_SAVE_DEBOUNCE_MS = 1200;

// Debounced draft persistence. The full draft (basePlays + plays + answers) is
// JSON+LZ-compressed by storageManager.set, so firing it on every answer/nav
// janks the player between questions on a phone. Coalesce rapid saves; the
// pagehide/visibility flush below guarantees the latest progress is persisted
// even if the player backgrounds or closes the tab mid-question.
function _schedulePlayerQuizDraftSave() {
  clearTimeout(_quizDraftSaveTimer);
  _quizDraftSaveTimer = setTimeout(() => {
    _quizDraftSaveTimer = null;
    _savePlayerQuizDraft();
  }, QUIZ_DRAFT_SAVE_DEBOUNCE_MS);
}

function _flushPlayerQuizDraftSave() {
  if (!_quizDraftSaveTimer) return;
  clearTimeout(_quizDraftSaveTimer);
  _quizDraftSaveTimer = null;
  _savePlayerQuizDraft();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", _flushPlayerQuizDraftSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") _flushPlayerQuizDraftSave();
  });
}

function _savePlayerQuizDraft() {
  if (!_quizPlays.length || _quizFinished) return null;
  if (_quizTimeLimitMs || _isSignalAutoAdvanceMode()) return null;
  if (typeof storageManager === "undefined" || typeof storageManager.set !== "function") return null;
  const draft = {
    savedAt: new Date().toISOString(),
    title: _quizTitle,
    sourceType: _quizSourceType,
    sourceId: _quizSourceId,
    assignmentId: _quizAssignmentId,
    allowedQuestionTypes: _quizAllowedQuestionTypes,
    sourceWeight: _quizSourceWeight,
    signalCategories: _quizSignalCategories,
    signalCategoryMultiplier: _quizSignalMultiplier,
    quizMode: _quizMode,
    positionKey: _quizPositionKey,
    positionMode: _quizPositionMode,
    shuffled: _quizShuffled,
    index: _quizIndex,
    score: _quizScore,
    streak: _quizStreak,
    bestStreak: _quizBestStreak,
    basePlays: _quizBasePlays,
    plays: _quizPlays,
    answers: Array.from(_quizAnswers.entries()),
  };
  storageManager.set(_getPlayerQuizDraftStorageKey(), draft);
  return draft;
}

function _clearPlayerQuizDraft() {
  clearTimeout(_quizDraftSaveTimer);
  _quizDraftSaveTimer = null;
  if (typeof storageManager === "undefined" || typeof storageManager.remove !== "function") return;
  storageManager.remove(_getPlayerQuizDraftStorageKey());
}

function _formatQuizDraftMeta(draft) {
  if (!draft) return "";
  const answers = Array.isArray(draft.answers) ? draft.answers : [];
  const total = Array.isArray(draft.plays) ? draft.plays.length : 0;
  const remaining = Math.max(0, total - answers.length);
  const saved = draft.savedAt ? new Date(draft.savedAt) : null;
  const savedLabel = saved && !Number.isNaN(saved.getTime())
    ? saved.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "recently";
  return `${answers.length}/${total} answered · ${remaining} left · saved ${savedLabel}`;
}

function _quizDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function _quizAddDaysKey(dateKey, days = 1) {
  const date = dateKey ? new Date(`${dateKey}T12:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return _quizDateKey(new Date());
  date.setDate(date.getDate() + Number(days || 0));
  return _quizDateKey(date);
}

function _quizWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function _getQuizBadge(percent) {
  return _getQuizBadges().find((badge) => percent >= badge.min) || {
    min: 0,
    label: "Keep Climbing",
    bonus: 0,
  };
}

function _getQuizCorrectAnswerPoints(streak, sourceWeight = _quizSourceWeight) {
  const settings = _getPlayerQuizSettings();
  const streakBonus = Math.min(
    Math.max(0, Number(streak || 1) - 1),
    PLAYER_QUIZ_MAX_STREAK_BONUS,
  ) * PLAYER_QUIZ_STREAK_STEP_POINTS;
  return Math.round((settings.baseCorrectPoints + streakBonus) * (Number(sourceWeight) || 1));
}

function _getQuizBonusPoints(badge, answered, partial = false) {
  if (partial || !badge || Number(answered || 0) < _getPlayerQuizSettings().minBonusAnswers) return 0;
  return Number(badge.bonus || 0);
}

function _quizScriptAttemptMatches(attempt, scriptOption) {
  if (!attempt || attempt.sourceType !== "script" || !scriptOption) return false;
  if (attempt.sourceId && scriptOption.id) return String(attempt.sourceId) === String(scriptOption.id);
  return String(attempt.title || "").trim() === String(scriptOption.name || "").trim();
}

function _getQuizScriptProgress(scriptOption) {
  const attempts = _getPlayerQuizAttempts()
    .filter((attempt) => _quizScriptAttemptMatches(attempt, scriptOption))
    .sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  const latest = attempts[0] || null;
  const bestPercent = attempts.reduce((best, attempt) => Math.max(best, Number(attempt.percent || 0)), 0);
  const total = latest ? Number(latest.totalQuestions || scriptOption.playCount || 0) : Number(scriptOption.playCount || 0);
  const answered = latest ? Number(latest.answered || 0) : 0;
  const pct = total ? Math.min(100, Math.round((answered / total) * 100)) : 0;
  let icon = "";
  let label = "Not attempted";
  if (latest) {
    if (latest.completed === false) {
      label = `${pct}% done`;
    } else if (Number(latest.percent || 0) >= 100) {
      icon = "🏆";
      label = "Aced";
    } else if (Number(latest.percent || 0) >= 80) {
      icon = "🎖️";
      label = `${Math.round(Number(latest.percent || 0))}%`;
    } else if (latest.completed !== false) {
      icon = "🎗️";
      label = "Complete";
    } else {
      label = `${pct}% done`;
    }
  }
  return {
    latest,
    attempts,
    bestPercent,
    total,
    answered,
    pct,
    icon,
    label,
    points: latest ? Math.round(Number(latest.totalPoints || 0)) : 0,
  };
}

function getPlayerQuizScriptProgress(scriptId = "", scriptName = "", playCount = 0) {
  return _getQuizScriptProgress({
    id: String(scriptId || ""),
    name: String(scriptName || ""),
    playCount: Number(playCount || 0),
  });
}

function _getQuizTier(points, settings = _getPlayerQuizSettings()) {
  const goal = Math.max(1, Number(settings.weeklyGoal || PLAYER_QUIZ_WEEKLY_GOAL || 1000));
  if (points >= goal) return _getQuizTierName("champion", settings);
  if (points >= goal * 0.75) return _getQuizTierName("baller", settings);
  if (points >= goal * 0.5) return _getQuizTierName("starter", settings);
  if (points >= goal * 0.25) return _getQuizTierName("contributor", settings);
  return _getQuizTierName("defense", settings);
}

function _getQuizAchievementSummary(points, settings = _getPlayerQuizSettings()) {
  const goal = Math.max(1, Number(settings.weeklyGoal || PLAYER_QUIZ_WEEKLY_GOAL || 1000));
  const championName = _getQuizTierName("champion", settings);
  const total = Math.max(0, Math.round(Number(points || 0)));
  const overGoal = Math.max(0, total - goal);
  const starStep = Math.max(100, Math.round(goal * 0.25));
  const stars = Math.min(5, Math.floor(overGoal / starStep));
  const starLabels = [
    `${championName} Star`,
    `Two-Star ${championName}`,
    `Three-Star ${championName}`,
    `Four-Star ${championName}`,
    `Five-Star ${championName}`,
  ];
  const nextAt = stars >= 5 ? null : goal + (stars + 1) * starStep;
  return {
    stars,
    overGoal,
    label: stars ? starLabels[stars - 1] : "No stars yet",
    shortLabel: stars ? `${championName} +${stars}` : "No stars",
    starText: stars ? "★".repeat(stars) : "☆",
    nextAt,
    nextRemaining: nextAt ? Math.max(0, nextAt - total) : 0,
  };
}

function _normalizeQuizIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function _getQuizRosterPlayers() {
  if (typeof getTeamRoster === "function") return getTeamRoster();
  if (typeof storageManager !== "undefined" && typeof storageManager.get === "function" && typeof STORAGE_KEYS !== "undefined") {
    const stored = storageManager.get(STORAGE_KEYS.TEAM_ROSTER, []);
    return Array.isArray(stored)
      ? stored
        .map((player) => ({
          ...player,
          name: String(player?.name || "").trim(),
          number: String(player?.number || "").trim(),
          position: String(player?.position || "").trim().toUpperCase(),
          accountUsername: String(player?.accountUsername || player?.username || "").trim().toLowerCase(),
        }))
        .filter((player) => player.name)
      : [];
  }
  return [];
}

function _quizRosterPlayerMatches(player, value = "") {
  const target = _normalizeQuizIdentity(value);
  if (!player || !target) return false;
  return [
    player.id,
    player.name,
    player.accountUsername,
    player.username,
  ].some((candidate) => _normalizeQuizIdentity(candidate) === target);
}

function _getQuizRosterPlayerByName(value = "") {
  return _getQuizRosterPlayers().find((player) => _quizRosterPlayerMatches(player, value)) || null;
}

function _getQuizRosterPlayerForCurrentUser() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : (typeof currentAuthUser !== "undefined" ? currentAuthUser : null);
  const username = user?.username || user?.label || "";
  return _getQuizRosterPlayers().find((player) => _normalizeQuizIdentity(player.accountUsername) === _normalizeQuizIdentity(username))
    || _getQuizRosterPlayerByName(username);
}

function _formatQuizRosterMeta(player) {
  if (!player) return "";
  const bits = [];
  if (player.number) bits.push(`#${player.number}`);
  if (player.position) bits.push(player.position);
  if (player.accountUsername) bits.push(`@${player.accountUsername}`);
  return bits.join(" · ");
}

function _buildCoachQuizRosterHealthSummary() {
  const roster = _getQuizRosterPlayers();
  const attempts = _getPlayerQuizAttempts();
  const rewards = _getPlayerRewardEvents();
  const stickers = _getPlayerHelmetStickers();
  const linked = roster.filter((player) => _normalizeQuizIdentity(player.accountUsername));
  const unlinked = roster.filter((player) => !_normalizeQuizIdentity(player.accountUsername));
  const accountMap = new Map();
  roster.forEach((player) => {
    const account = _normalizeQuizIdentity(player.accountUsername);
    if (!account) return;
    if (!accountMap.has(account)) accountMap.set(account, []);
    accountMap.get(account).push(player);
  });
  const duplicateAccounts = Array.from(accountMap.entries())
    .filter(([, players]) => players.length > 1)
    .map(([account, players]) => ({ account, players }));
  const knownRosterIds = new Set();
  roster.forEach((player) => {
    [player.id, player.name, player.accountUsername, player.username].forEach((value) => {
      const normalized = _normalizeQuizIdentity(value);
      if (normalized) knownRosterIds.add(normalized);
    });
  });
  const activeRosterNames = new Set();
  const unknownMap = new Map();
  const addKnownOrUnknown = (kind, rawName, event = {}) => {
    const name = String(rawName || "").trim();
    if (!name) return;
    const rosterPlayer = _getQuizRosterPlayerByName(name);
    if (rosterPlayer) {
      activeRosterNames.add(_normalizeQuizIdentity(rosterPlayer.name));
      return;
    }
    const key = _normalizeQuizIdentity(name);
    if (!key || knownRosterIds.has(key)) return;
    if (!unknownMap.has(key)) {
      unknownMap.set(key, {
        name,
        attempts: 0,
        rewards: 0,
        stickers: 0,
        points: 0,
        latest: "",
      });
    }
    const row = unknownMap.get(key);
    if (kind === "attempt") {
      row.attempts += 1;
      row.points += Number(event.totalPoints || 0);
    } else if (kind === "reward") {
      row.rewards += 1;
      row.points += Number(event.points || 0);
    } else if (kind === "sticker") {
      row.stickers += 1;
    }
    row.latest = _formatQuizProfileDate(event) || row.latest;
  };
  attempts.forEach((attempt) => addKnownOrUnknown("attempt", attempt.player, attempt));
  rewards.forEach((event) => addKnownOrUnknown("reward", event.player, event));
  stickers.forEach((sticker) => addKnownOrUnknown("sticker", sticker.player, sticker));
  const inactive = roster.filter((player) => !activeRosterNames.has(_normalizeQuizIdentity(player.name)));
  const unknownActivity = Array.from(unknownMap.values())
    .sort((a, b) => (b.points - a.points) || a.name.localeCompare(b.name));
  const issueCount = unlinked.length + duplicateAccounts.length + unknownActivity.length;
  return {
    roster,
    attempts,
    rewards,
    stickers,
    linked,
    unlinked,
    duplicateAccounts,
    unknownActivity,
    inactive,
    issueCount,
    status: roster.length ? (issueCount ? "warning" : "good") : "empty",
  };
}

function _renderCoachQuizRosterHealthRows(items, emptyText, rowRenderer, limit = 6) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="coach-quiz-roster-health-empty">${escapeHtml(emptyText)}</div>`;
  }
  const visible = items.slice(0, limit).map(rowRenderer).join("");
  const remaining = items.length > limit
    ? `<div class="coach-quiz-roster-health-more">+${items.length - limit} more</div>`
    : "";
  return `${visible}${remaining}`;
}

function _renderCoachQuizRosterHealthPanel(summary = _buildCoachQuizRosterHealthSummary()) {
  const statusText = summary.status === "good"
    ? "Roster links look clean"
    : summary.status === "empty"
      ? "No roster loaded"
      : `${summary.issueCount} issue${summary.issueCount === 1 ? "" : "s"} to clean up`;
  const playerRow = (player) => `
    <div class="coach-quiz-roster-health-row">
      <strong>${escapeHtml(player.name)}</strong>
      <small>${escapeHtml(_formatQuizRosterMeta(player) || "No linked login")}</small>
    </div>
  `;
  const duplicateRow = (item) => `
    <div class="coach-quiz-roster-health-row">
      <strong>@${escapeHtml(item.account)}</strong>
      <small>${escapeHtml(item.players.map((player) => player.name).join(" · "))}</small>
    </div>
  `;
  const unknownRow = (item) => {
    const parts = [];
    if (item.attempts) parts.push(`${item.attempts} attempt${item.attempts === 1 ? "" : "s"}`);
    if (item.rewards) parts.push(`${item.rewards} reward${item.rewards === 1 ? "" : "s"}`);
    if (item.stickers) parts.push(`${item.stickers} sticker${item.stickers === 1 ? "" : "s"}`);
    if (item.points) parts.push(`${Math.round(item.points)} pts`);
    return `
      <div class="coach-quiz-roster-health-row">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(parts.join(" · ") || "Activity")} · ${escapeHtml(item.latest || "Recently")}</small>
      </div>
    `;
  };
  return `
    <section class="coach-quiz-setup-section coach-quiz-roster-health-panel">
      <div class="coach-quiz-section-head">
        <div><h3>Roster link health</h3><span>${summary.linked.length}/${summary.roster.length || 0} linked · ${escapeHtml(statusText)}</span></div>
        <button type="button" class="btn btn-sm btn-outline" data-action="openPlayersAdmin">Resolve links</button>
      </div>
      <div class="coach-quiz-roster-health-summary">
        <span class="${summary.linked.length ? "is-good" : ""}"><strong>${summary.linked.length}</strong><small>Linked accounts</small></span>
        <span class="${summary.unlinked.length ? "is-warning" : "is-good"}"><strong>${summary.unlinked.length}</strong><small>Unlinked roster</small></span>
        <span class="${summary.duplicateAccounts.length ? "is-danger" : "is-good"}"><strong>${summary.duplicateAccounts.length}</strong><small>Duplicate logins</small></span>
        <span class="${summary.unknownActivity.length ? "is-danger" : "is-good"}"><strong>${summary.unknownActivity.length}</strong><small>Unknown activity</small></span>
      </div>
      <div class="coach-quiz-roster-health-grid">
        <article>
          <div class="coach-quiz-roster-health-head">
            <strong>Unlinked roster</strong>
            <span>Needs account</span>
          </div>
          ${_renderCoachQuizRosterHealthRows(summary.unlinked, "Every roster player has a linked login.", playerRow)}
        </article>
        <article>
          <div class="coach-quiz-roster-health-head">
            <strong>Duplicate logins</strong>
            <span>Resolve before scoring</span>
          </div>
          ${_renderCoachQuizRosterHealthRows(summary.duplicateAccounts, "No duplicate roster logins.", duplicateRow)}
        </article>
        <article>
          <div class="coach-quiz-roster-health-head">
            <strong>Unknown activity</strong>
            <span>Not on active roster</span>
          </div>
          ${_renderCoachQuizRosterHealthRows(summary.unknownActivity, "All quiz activity maps to roster players.", unknownRow)}
        </article>
        <article>
          <div class="coach-quiz-roster-health-head">
            <strong>No quiz activity</strong>
            <span>Follow up</span>
          </div>
          ${_renderCoachQuizRosterHealthRows(summary.inactive, "Every roster player has quiz, question, or sticker activity.", playerRow)}
        </article>
      </div>
    </section>
  `;
}

function _formatCoachAwardDate(event = {}) {
  const label = _formatQuizProfileDate(event);
  const coach = String(event.awardedBy || "").trim();
  return coach ? `${label} · ${coach}` : label;
}

function _renderCoachQuizAwardHistoryRows(items, emptyText, rowRenderer) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="coach-quiz-award-history-empty">${escapeHtml(emptyText)}</div>`;
  }
  return items
    .slice()
    .sort((a, b) => _quizEventTimestamp(b) - _quizEventTimestamp(a))
    .slice(0, 12)
    .map(rowRenderer)
    .join("");
}

function _renderCoachQuizAwardHistoryPanel(rewardEvents = [], stickerEvents = []) {
  const pointRows = _renderCoachQuizAwardHistoryRows(
    rewardEvents,
    "No point awards this week.",
    (event) => {
      const pending = !_isQuizRewardApproved(event);
      const typeLabel = _formatQuizQuestionType(event.type || "reward");
      const playerName = _normalizeQuizPlayerName(event.player);
      return `
        <div class="coach-quiz-award-history-row${pending ? " is-pending" : ""}">
          <span class="coach-quiz-award-history-icon" aria-hidden="true">+${Math.round(Number(event.points || 0))}</span>
          <span class="coach-quiz-award-history-main">
            <strong>${escapeHtml(playerName)}</strong>
            <small>${escapeHtml(typeLabel)} · ${Math.round(Number(event.points || 0))} pts${event.note ? ` · ${escapeHtml(event.note)}` : ""}</small>
          </span>
          <span class="coach-quiz-award-status${pending ? " is-pending" : " is-approved"}">${pending ? "Pending approval" : "Approved"}</span>
          <span class="coach-quiz-award-history-meta">${escapeHtml(_formatCoachAwardDate(event))}</span>
          ${pending ? `<button type="button"
            class="btn btn-xs btn-primary"
            data-action="coachApproveQuizReward"
            data-arg="${escapeAttr(event.id || "")}"
            aria-label="Approve ${escapeAttr(typeLabel)} reward for ${escapeAttr(playerName)}">
            Approve
          </button>` : ""}
          <button type="button"
            class="btn btn-xs btn-danger"
            data-action="coachRevokeQuizReward"
            data-arg="${escapeAttr(event.id || "")}"
            aria-label="Revoke ${escapeAttr(typeLabel)} reward from ${escapeAttr(playerName)}">
            Revoke
          </button>
        </div>
      `;
    }
  );
  const stickerRows = _renderCoachQuizAwardHistoryRows(
    stickerEvents,
    "No helmet stickers this week.",
    (sticker) => `
      <div class="coach-quiz-award-history-row">
        <span class="coach-quiz-award-history-icon" aria-hidden="true">${escapeHtml(sticker.icon || "🏅")}</span>
        <span class="coach-quiz-award-history-main">
          <strong>${escapeHtml(_normalizeQuizPlayerName(sticker.player))}</strong>
          <small>${escapeHtml(sticker.label || "Helmet Sticker")}${sticker.note ? ` · ${escapeHtml(sticker.note)}` : ""}</small>
        </span>
        <span class="coach-quiz-award-history-meta">${escapeHtml(_formatCoachAwardDate(sticker))}</span>
        <button type="button"
          class="btn btn-xs btn-danger"
          data-action="coachRevokeHelmetStickerAward"
          data-arg="${escapeAttr(sticker.id || "")}"
          aria-label="Revoke ${escapeAttr(sticker.label || "Helmet Sticker")} sticker from ${escapeAttr(_normalizeQuizPlayerName(sticker.player))}">
          Revoke
        </button>
      </div>
    `
  );
  return `
    <section class="coach-quiz-setup-section coach-quiz-award-history-panel">
      <div class="coach-quiz-section-head">
        <h3>Award history</h3>
        <span>${rewardEvents.length} point awards · ${stickerEvents.length} stickers this week</span>
      </div>
      <div class="coach-quiz-award-history-grid">
        <article>
          <div class="coach-quiz-award-history-head">
            <strong>Point awards</strong>
            <span>Questions, answers, gifts</span>
          </div>
          ${pointRows}
        </article>
        <article>
          <div class="coach-quiz-award-history-head">
            <strong>Helmet stickers</strong>
            <span>Practice awards</span>
          </div>
          ${stickerRows}
        </article>
      </div>
    </section>
  `;
}

function _getQuizPlayerName() {
  const rosterPlayer = _getQuizRosterPlayerForCurrentUser();
  if (rosterPlayer?.name) return rosterPlayer.name;
  if (typeof getCurrentAuthUser === "function") {
    const user = getCurrentAuthUser();
    if (user?.username) return user.username;
  }
  if (typeof currentAuthUser !== "undefined" && currentAuthUser?.username) {
    return currentAuthUser.username;
  }
  return "You";
}

function _normalizeQuizPlayerName(name) {
  const raw = String(name || "").trim();
  if (raw) {
    const rosterPlayer = _getQuizRosterPlayerByName(raw);
    return rosterPlayer?.name || raw;
  }
  return _getQuizPlayerName();
}

function _quizEventId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function _quizCurrentCoachName() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return user?.username || user?.label || _getQuizPlayerName();
}

function _getQuizRewardsForPlayer(player, weekKey = "") {
  const target = _normalizeQuizPlayerName(player);
  return _getPlayerRewardEvents().filter((event) => {
    if (!_isQuizRewardApproved(event)) return false;
    if (_normalizeQuizPlayerName(event.player) !== target) return false;
    return weekKey ? event.weekKey === weekKey : true;
  });
}

function _getQuizStickersForPlayer(player) {
  const target = _normalizeQuizPlayerName(player);
  return _getPlayerHelmetStickers().filter((sticker) => _normalizeQuizPlayerName(sticker.player) === target);
}

function _sumQuizRewards(events, type = "") {
  return (Array.isArray(events) ? events : [])
    .filter((event) => _isQuizRewardApproved(event) && (!type || event.type === type))
    .reduce((sum, event) => sum + Number(event.points || 0), 0);
}

function _isQuizRewardApproved(event = {}) {
  return !event.status || event.status === "approved";
}

function _quizPlayerNameFromAttempt(attempt, fallback = "") {
  return _normalizeQuizPlayerName(attempt?.player || fallback || _getQuizPlayerName());
}

function _quizEventDateKey(event) {
  if (event?.dateKey) return String(event.dateKey);
  const raw = event?.completedAt || event?.savedAt || event?.createdAt || event?.awardedAt || event?.date;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? _quizDateKey(date) : "";
}

function _quizDateFromWeekKey(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() + 1 - day);
  return simple;
}

function _quizPreviousDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - 1);
  return _quizDateKey(date);
}

function _quizPreviousWeekKey(weekKey) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!match) return "";
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week > 1) return `${year}-W${String(week - 1).padStart(2, "0")}`;
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() - 7);
  return _quizWeekKey(date);
}

function _quizCurrentStreak(keys, currentKey, previousKeyFn) {
  const activeKeys = new Set(Array.from(keys || []).filter(Boolean));
  if (!activeKeys.size) return 0;
  const sortedKeys = Array.from(activeKeys).sort();
  let cursor = activeKeys.has(currentKey) ? currentKey : sortedKeys.at(-1);
  let streak = 0;
  while (cursor && activeKeys.has(cursor)) {
    streak += 1;
    cursor = previousKeyFn(cursor);
  }
  return streak;
}

function _quizActivityDateKeys(attempts, rewards, player) {
  const target = _normalizeQuizPlayerName(player);
  const keys = new Set();
  (Array.isArray(attempts) ? attempts : []).forEach((attempt) => {
    if (_quizPlayerNameFromAttempt(attempt, player) !== target) return;
    const key = _quizEventDateKey(attempt);
    if (key) keys.add(key);
  });
  (Array.isArray(rewards) ? rewards : []).forEach((event) => {
    if (!_isQuizRewardApproved(event)) return;
    if (_normalizeQuizPlayerName(event.player) !== target) return;
    const key = _quizEventDateKey(event);
    if (key) keys.add(key);
  });
  return keys;
}

function _quizActivityWeekKeys(attempts, rewards, player) {
  const target = _normalizeQuizPlayerName(player);
  const keys = new Set();
  (Array.isArray(attempts) ? attempts : []).forEach((attempt) => {
    if (_quizPlayerNameFromAttempt(attempt, player) !== target) return;
    if (attempt.weekKey) keys.add(String(attempt.weekKey));
  });
  (Array.isArray(rewards) ? rewards : []).forEach((event) => {
    if (!_isQuizRewardApproved(event)) return;
    if (_normalizeQuizPlayerName(event.player) !== target) return;
    if (event.weekKey) keys.add(String(event.weekKey));
  });
  return keys;
}

function _buildQuizLeaderboardRows(attempts, rewards, player, weekKey = "") {
  const settings = _getPlayerQuizSettings();
  const totals = new Map();
  const addPoints = (name, points) => {
    const playerName = _normalizeQuizPlayerName(name);
    totals.set(playerName, (totals.get(playerName) || 0) + Number(points || 0));
  };
  const mergeRemotePoints = (name, points) => {
    const playerName = _normalizeQuizPlayerName(name);
    totals.set(playerName, Math.max(totals.get(playerName) || 0, Number(points || 0)));
  };
  (Array.isArray(attempts) ? attempts : []).forEach((attempt) => {
    if (weekKey && attempt.weekKey !== weekKey) return;
    addPoints(attempt.player || player, attempt.totalPoints || 0);
  });
  (Array.isArray(rewards) ? rewards : []).forEach((event) => {
    if (!_isQuizRewardApproved(event)) return;
    if (weekKey && event.weekKey !== weekKey) return;
    addPoints(event.player || player, event.points || 0);
  });
  const remoteRows = typeof window !== "undefined" && typeof window.getRemotePlayerLeaderboardRows === "function"
    ? window.getRemotePlayerLeaderboardRows(weekKey ? "week" : "season")
    : [];
  remoteRows.forEach((row) => {
    mergeRemotePoints(row.name || row.player, row.points ?? row.totalPoints ?? 0);
  });
  _getQuizRosterPlayers().forEach((rosterPlayer) => addPoints(rosterPlayer.name, 0));
  if (!totals.size) totals.set(_normalizeQuizPlayerName(player), 0);
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, points], idx) => ({ name, points, rank: idx + 1, tier: _getQuizTier(points, settings) }));
}

function _isSignalSprintAttempt(attempt = {}) {
  return attempt?.sourceType === "signal" && attempt?.quizMode === "signal-sprint";
}

function _isSignalBattleAttempt(attempt = {}) {
  return attempt?.sourceType === "signal" && attempt?.quizMode === "signal-battle";
}

function _isSignalHeatCheckAttempt(attempt = {}) {
  return attempt?.sourceType === "signal" && attempt?.quizMode === "signal-heat";
}

function _signalAttemptMatchesMode(attempt = {}, mode = _signalLeaderboardMode) {
  const normalized = String(mode || "").trim();
  if (normalized === "signal-battle") return _isSignalBattleAttempt(attempt);
  if (normalized === "signal-heat") return _isSignalHeatCheckAttempt(attempt);
  return _isSignalSprintAttempt(attempt);
}

function _getSignalSprintAttemptAverageMs(attempt = {}) {
  const direct = Number(attempt.averageAnswerMs || attempt.review?.gameStats?.averageAnswerMs || 0);
  if (direct > 0) return direct;
  const duration = Number(attempt.durationMs || attempt.review?.gameStats?.durationMs || 0);
  const answered = Number(attempt.answered || 0);
  return duration > 0 && answered > 0 ? Math.round(duration / answered) : 0;
}

function _getSignalBattleAttemptReactionMs(attempt = {}) {
  const direct = Number(attempt.averageReactionMs || attempt.review?.gameStats?.averageReactionMs || 0);
  if (direct > 0) return direct;
  return _getSignalSprintAttemptAverageMs(attempt);
}

function _compareSignalSprintRows(a, b) {
  return (
    Number(b.correct || 0) - Number(a.correct || 0) ||
    Number(b.percent || 0) - Number(a.percent || 0) ||
    Number(a.averageAnswerMs || Number.MAX_SAFE_INTEGER) - Number(b.averageAnswerMs || Number.MAX_SAFE_INTEGER) ||
    Number(b.answered || 0) - Number(a.answered || 0) ||
    _quizEventTimestamp(b.attempt || b) - _quizEventTimestamp(a.attempt || a) ||
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}

function _compareSignalBattleRows(a, b) {
  return (
    Number(b.correct || 0) - Number(a.correct || 0) ||
    Number(a.averageReactionMs || Number.MAX_SAFE_INTEGER) - Number(b.averageReactionMs || Number.MAX_SAFE_INTEGER) ||
    Number(b.percent || 0) - Number(a.percent || 0) ||
    _quizEventTimestamp(b.attempt || b) - _quizEventTimestamp(a.attempt || a) ||
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}

function _compareSignalHeatCheckRows(a, b) {
  return (
    Number(b.bestStreak || 0) - Number(a.bestStreak || 0) ||
    Number(b.correct || 0) - Number(a.correct || 0) ||
    Number(b.percent || 0) - Number(a.percent || 0) ||
    _quizEventTimestamp(b.attempt || b) - _quizEventTimestamp(a.attempt || a) ||
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}

function _buildSignalSprintLeaderboardRows(attempts, player, weekKey = "") {
  const bestByPlayer = new Map();
  (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => _isSignalSprintAttempt(attempt))
    .filter((attempt) => !weekKey || attempt.weekKey === weekKey)
    .forEach((attempt) => {
      const name = _quizPlayerNameFromAttempt(attempt, player);
      const answered = Math.max(0, Number(attempt.answered || 0));
      const correct = Math.max(0, Number(attempt.correct || 0));
      const percent = answered ? Math.round((correct / answered) * 100) : 0;
      const row = {
        name,
        attempt,
        attempts: 1,
        answered,
        correct,
        wrong: Math.max(0, answered - correct),
        percent,
        averageAnswerMs: _getSignalSprintAttemptAverageMs(attempt),
        durationMs: Number(attempt.durationMs || attempt.review?.gameStats?.durationMs || 0),
        completedAt: attempt.completedAt || "",
      };
      const existing = bestByPlayer.get(name);
      if (!existing || _compareSignalSprintRows(row, existing) < 0) {
        row.attempts = (existing?.attempts || 0) + 1;
        bestByPlayer.set(name, row);
      } else if (existing) {
        existing.attempts += 1;
      }
    });
  if (!bestByPlayer.size) {
    const name = _normalizeQuizPlayerName(player || _getQuizPlayerName());
    return [{
      name,
      rank: 1,
      attempts: 0,
      answered: 0,
      correct: 0,
      wrong: 0,
      percent: 0,
      averageAnswerMs: 0,
      durationMs: 0,
      empty: true,
    }];
  }
  return Array.from(bestByPlayer.values())
    .sort(_compareSignalSprintRows)
    .slice(0, 10)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function _buildSignalHeatCheckLeaderboardRows(attempts, player, weekKey = "") {
  const bestByPlayer = new Map();
  (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => _isSignalHeatCheckAttempt(attempt))
    .filter((attempt) => !weekKey || attempt.weekKey === weekKey)
    .forEach((attempt) => {
      const name = _quizPlayerNameFromAttempt(attempt, player);
      const answered = Math.max(0, Number(attempt.answered || 0));
      const correct = Math.max(0, Number(attempt.correct || 0));
      const row = {
        name,
        attempt,
        attempts: 1,
        answered,
        correct,
        wrong: Math.max(0, answered - correct),
        percent: answered ? Math.round((correct / answered) * 100) : 0,
        bestStreak: Math.max(0, Number(attempt.bestStreak || 0)),
        multiplier: Number(attempt.signalCategoryMultiplier || 1),
        completedAt: attempt.completedAt || "",
      };
      const existing = bestByPlayer.get(name);
      if (!existing || _compareSignalHeatCheckRows(row, existing) < 0) {
        row.attempts = (existing?.attempts || 0) + 1;
        bestByPlayer.set(name, row);
      } else if (existing) {
        existing.attempts += 1;
      }
    });
  if (!bestByPlayer.size) {
    const name = _normalizeQuizPlayerName(player || _getQuizPlayerName());
    return [{
      name,
      rank: 1,
      attempts: 0,
      answered: 0,
      correct: 0,
      wrong: 0,
      percent: 0,
      bestStreak: 0,
      empty: true,
    }];
  }
  return Array.from(bestByPlayer.values())
    .sort(_compareSignalHeatCheckRows)
    .slice(0, 10)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function _buildSignalBattleLeaderboardRows(attempts, player, weekKey = "") {
  const bestByPlayer = new Map();
  (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => _isSignalBattleAttempt(attempt))
    .filter((attempt) => !weekKey || attempt.weekKey === weekKey)
    .forEach((attempt) => {
      const name = _quizPlayerNameFromAttempt(attempt, player);
      const answered = Math.max(0, Number(attempt.answered || 0));
      const correct = Math.max(0, Number(attempt.correct || 0));
      const percent = answered ? Math.round((correct / answered) * 100) : 0;
      const row = {
        name,
        attempt,
        attempts: 1,
        answered,
        correct,
        wrong: Math.max(0, answered - correct),
        percent,
        averageReactionMs: _getSignalBattleAttemptReactionMs(attempt),
        completedAt: attempt.completedAt || "",
      };
      const existing = bestByPlayer.get(name);
      if (!existing || _compareSignalBattleRows(row, existing) < 0) {
        row.attempts = (existing?.attempts || 0) + 1;
        bestByPlayer.set(name, row);
      } else if (existing) {
        existing.attempts += 1;
      }
    });
  if (!bestByPlayer.size) {
    const name = _normalizeQuizPlayerName(player || _getQuizPlayerName());
    return [{
      name,
      rank: 1,
      attempts: 0,
      answered: 0,
      correct: 0,
      wrong: 0,
      percent: 0,
      averageReactionMs: 0,
      empty: true,
    }];
  }
  return Array.from(bestByPlayer.values())
    .sort(_compareSignalBattleRows)
    .slice(0, 10)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function _quizFilteredAttemptsForView(attempts, weekKey, season = false) {
  return (Array.isArray(attempts) ? attempts : []).filter((attempt) => {
    if (!attempt || typeof attempt !== "object") return false;
    return season || attempt.weekKey === weekKey;
  });
}

function _quizFilteredRewardsForView(rewards, weekKey, season = false) {
  return (Array.isArray(rewards) ? rewards : []).filter((event) => {
    if (!event || typeof event !== "object") return false;
    if (!_isQuizRewardApproved(event)) return false;
    return season || event.weekKey === weekKey;
  });
}

function _formatQuizQuestionType(type) {
  if (type === "responsibility") return "Responsibility";
  if (type === "play_from_rule") return "Rule to Play";
  if (type === "call") return "Call ID";
  return String(type || "Question").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function _summarizeQuizQuestionBreakdown(answers) {
  const summary = {};
  (Array.isArray(answers) ? answers : []).forEach((answer) => {
    const type = answer?.questionType || "call";
    if (!summary[type]) summary[type] = { total: 0, correct: 0, wrong: 0 };
    summary[type].total += 1;
    if (answer.correct) {
      summary[type].correct += 1;
    } else {
      summary[type].wrong += 1;
    }
  });
  return summary;
}

function _quizAddQuestionBreakdown(target, breakdown) {
  Object.entries(breakdown || {}).forEach(([type, stats]) => {
    if (!target[type]) target[type] = { total: 0, correct: 0, wrong: 0 };
    target[type].total += Number(stats?.total || 0);
    target[type].correct += Number(stats?.correct || 0);
    target[type].wrong += Number(stats?.wrong || 0);
  });
}

function _renderPlayerQuizResumeCard(draft, variant = "hub") {
  if (!draft) return "";
  const title = draft.title || "Quiz in progress";
  const meta = _formatQuizDraftMeta(draft);
  const source = _getQuizSourceLabel(draft.sourceType);
  const modeLabel = draft.quizMode && draft.quizMode !== "full"
    ? (_getPlayerQuizModes().find((mode) => mode.key === draft.quizMode)?.label || "Quiz")
    : "";
  return `
    <div class="player-quiz-resume-card player-quiz-resume-card--${escapeAttr(variant)}">
      <div>
        <span class="player-quiz-resume-kicker">Pick up where you left off</span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml([source, modeLabel, meta].filter(Boolean).join(" · "))}</small>
      </div>
      <div class="player-quiz-resume-actions">
        <button type="button" class="btn btn-primary" data-action="resumePlayerQuizDraft">Resume</button>
        <button type="button" class="btn btn-outline" data-action="discardPlayerQuizDraft">End Quiz</button>
      </div>
    </div>
  `;
}

function _renderPlayerQuizResumeSlot() {
  const slot = document.getElementById("playerQuizResumeSlot");
  if (!slot) return;
  const draft = _getPlayerQuizDraft();
  slot.hidden = !draft;
  slot.innerHTML = draft ? _renderPlayerQuizResumeCard(draft, "hub") : "";
}

function _quizEventTimestamp(event = {}) {
  const raw = event.completedAt || event.savedAt || event.createdAt || event.awardedAt || event.date || event.dateKey || "";
  const date = raw ? new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00`) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function _formatQuizProfileDate(event = {}) {
  const key = _quizEventDateKey(event);
  if (key) {
    const date = new Date(`${key}T12:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }
  return event.weekKey ? `Week ${event.weekKey}` : "Recently";
}

function _getPlayerLeaderboardProfileData(player, summary) {
  const name = _normalizeQuizPlayerName(player || summary.player);
  const isSeason = _playerLeaderboardView === "season";
  const leaderboardRows = isSeason ? summary.seasonLeaderboardRows : summary.weeklyLeaderboardRows;
  const row = leaderboardRows.find((item) => _normalizeQuizPlayerName(item.name) === name) || {
    rank: leaderboardRows.length + 1,
    tier: _getQuizTier(0),
    points: 0,
  };
  const rosterPlayer = _getQuizRosterPlayerByName(name);
  const rosterMeta = _formatQuizRosterMeta(rosterPlayer);
  const playerAttempts = summary.attempts.filter((attempt) => _quizPlayerNameFromAttempt(attempt, summary.player) === name);
  const viewAttempts = playerAttempts.filter((attempt) => isSeason || attempt.weekKey === summary.weekKey);
  const seasonRewards = _getQuizRewardsForPlayer(name);
  const viewRewards = isSeason ? seasonRewards : seasonRewards.filter((event) => event.weekKey === summary.weekKey);
  const stickers = _getQuizStickersForPlayer(name);
  const viewStickers = stickers.filter((sticker) => isSeason || sticker.weekKey === summary.weekKey);
  const quizPoints = viewAttempts.reduce((sum, attempt) => sum + Number(attempt.totalPoints || 0), 0);
  const questionPoints = _sumQuizRewards(viewRewards, "question");
  const answerPoints = _sumQuizRewards(viewRewards, "answer");
  const giftPoints = _sumQuizRewards(viewRewards, "gift");
  const bestAttempt = playerAttempts
    .slice()
    .sort((a, b) => (
      Number(b.percent || 0) - Number(a.percent || 0) ||
      Number(b.totalPoints || 0) - Number(a.totalPoints || 0) ||
      _quizEventTimestamp(b) - _quizEventTimestamp(a)
    ))[0] || null;
  const questionTotals = {};
  playerAttempts.forEach((attempt) => _quizAddQuestionBreakdown(questionTotals, attempt.questionBreakdown || {}));
  const weakAreas = Object.entries(questionTotals)
    .map(([type, stats]) => ({
      type,
      label: _formatQuizQuestionType(type),
      total: Number(stats.total || 0),
      correct: Number(stats.correct || 0),
      wrong: Number(stats.wrong || 0),
      percent: stats.total ? Math.round((Number(stats.correct || 0) / Number(stats.total || 0)) * 100) : 0,
    }))
    .filter((item) => item.total > 0 && (item.percent < 85 || item.wrong > 0))
    .sort((a, b) => a.percent - b.percent || b.wrong - a.wrong)
    .slice(0, 4);
  const weekTotals = new Map();
  const addWeekPoints = (weekKey, points) => {
    const key = String(weekKey || summary.weekKey || "Current");
    weekTotals.set(key, (weekTotals.get(key) || 0) + Number(points || 0));
  };
  playerAttempts.forEach((attempt) => addWeekPoints(attempt.weekKey, attempt.totalPoints));
  seasonRewards.forEach((event) => addWeekPoints(event.weekKey, event.points));
  if (!weekTotals.size) weekTotals.set(summary.weekKey, 0);
  const trend = Array.from(weekTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-5)
    .map(([weekKey, points]) => ({ weekKey, points: Math.round(points) }));
  const trendMax = Math.max(1, ...trend.map((item) => item.points));
  const recentActivity = [
    ...playerAttempts.map((attempt) => ({ kind: "quiz", event: attempt, points: Number(attempt.totalPoints || 0) })),
    ...seasonRewards.map((event) => ({ kind: event.type || "reward", event, points: Number(event.points || 0) })),
    ...stickers.map((sticker) => ({ kind: "sticker", event: sticker, points: 0 })),
  ].sort((a, b) => _quizEventTimestamp(b.event) - _quizEventTimestamp(a.event)).slice(0, 8);
  const achievement = _getQuizAchievementSummary(row.points || quizPoints + questionPoints + answerPoints + giftPoints);
  return {
    name,
    isSeason,
    row,
    rosterPlayer,
    rosterMeta,
    playerAttempts,
    viewAttempts,
    viewRewards,
    stickers,
    viewStickers,
    quizPoints,
    questionPoints,
    answerPoints,
    giftPoints,
    totalPoints: quizPoints + questionPoints + answerPoints + giftPoints,
    detailLabel: isSeason ? "this season" : "this week",
    bestAttempt,
    weakAreas,
    trend,
    trendMax,
    recentActivity,
    achievement,
  };
}

function _renderPlayerLeaderboardStickerList(stickers, emptyText = "No helmet stickers yet.") {
  return stickers.length
    ? stickers.map((sticker) => {
      const stickerType = _getPlayerHelmetStickerType(sticker.stickerKey, sticker.label);
      const description = String(sticker.description || stickerType?.description || sticker.note || "").trim();
      const title = [sticker.label || "Sticker", description, sticker.note ? `Coach note: ${sticker.note}` : ""].filter(Boolean).join(" - ");
      return `
        <span class="player-leaderboard-sticker player-leaderboard-sticker--${escapeAttr(sticker.color || stickerType?.color || "blue")}" title="${escapeAttr(title)}">
          <b aria-hidden="true">${escapeHtml(sticker.icon || stickerType?.icon || "🏅")}</b>
          <span>
            <strong>${escapeHtml(sticker.label || stickerType?.label || "Sticker")}</strong>
            ${description ? `<small>${escapeHtml(description)}</small>` : ""}
          </span>
        </span>
      `;
    }).join("")
    : `<span class="player-leaderboard-no-stickers">${escapeHtml(emptyText)}</span>`;
}

function _renderPlayerLeaderboardDetail(player, summary) {
  const profile = _getPlayerLeaderboardProfileData(player, summary);
  const stickers = profile.viewStickers.slice(-12).reverse();
  return `
    <section class="player-leaderboard-detail" id="playerLeaderboardDetail" aria-label="${escapeAttr(profile.name)} leaderboard detail">
      <div class="player-leaderboard-section-head">
        <div>
          <h3>${escapeHtml(profile.name)}</h3>
          ${profile.rosterMeta ? `<p>${escapeHtml(profile.rosterMeta)}</p>` : ""}
        </div>
        <span>${Math.round(profile.totalPoints)} pts ${escapeHtml(profile.detailLabel)}</span>
      </div>
      <div class="player-leaderboard-profile-grid">
        <span><strong>#${Math.round(profile.row.rank || 1)}</strong><small>Rank</small></span>
        <span><strong>${escapeHtml(profile.row.tier || _getQuizTier(profile.row.points || 0))}</strong><small>Tier</small></span>
        <span><strong>${profile.viewAttempts.length}</strong><small>Quiz tries</small></span>
        <span><strong>${stickers.length}</strong><small>Stickers</small></span>
      </div>
      <div class="player-leaderboard-breakdown">
        <span><strong>${Math.round(profile.quizPoints)}</strong><small>Quiz</small></span>
        <span><strong>${Math.round(profile.questionPoints)}</strong><small>Questions</small></span>
        <span><strong>${Math.round(profile.answerPoints)}</strong><small>Answers</small></span>
        <span><strong>${Math.round(profile.giftPoints)}</strong><small>Gifted</small></span>
      </div>
      <div class="player-leaderboard-stickers">${_renderPlayerLeaderboardStickerList(stickers)}</div>
    </section>
  `;
}

function _renderPlayerLeaderboardProfileModal(profile) {
  const settings = _getPlayerQuizSettings();
  const championName = _getQuizTierName("champion", settings);
  const best = profile.bestAttempt;
  const bestHtml = best
    ? `
      <article class="player-profile-card player-profile-card--best">
        <span>Best quiz</span>
        <strong>${escapeHtml(best.title || "Quiz")}</strong>
        <p>${Math.round(Number(best.percent || 0))}% · ${Number(best.correct || 0)}/${Number(best.answered || 0)} right · ${Math.round(Number(best.totalPoints || 0))} pts</p>
      </article>
    `
    : `
      <article class="player-profile-card player-profile-card--best">
        <span>Best quiz</span>
        <strong>No attempts yet</strong>
        <p>Start with a script or game plan quiz to build the profile.</p>
      </article>
    `;
  const weakHtml = profile.weakAreas.length
    ? profile.weakAreas.map((area) => `
      <div class="player-profile-weak-row">
        <strong>${escapeHtml(area.label)}</strong>
        <span>${area.percent}%</span>
        <small>${area.wrong} miss${area.wrong === 1 ? "" : "es"} on ${area.total} question${area.total === 1 ? "" : "s"}</small>
      </div>
    `).join("")
    : `<div class="player-profile-empty">No weak trend yet. Keep stacking reps.</div>`;
  const trendHtml = profile.trend.map((item) => `
    <span class="player-profile-trend-bar" data-height="${Math.max(8, Math.round((item.points / profile.trendMax) * 100))}">
      <i></i>
      <b>${item.points}</b>
      <small>${escapeHtml(item.weekKey.replace(/^\\d{4}-W/, "W"))}</small>
    </span>
  `).join("");
  const rewardHistory = profile.viewRewards.slice().sort((a, b) => _quizEventTimestamp(b) - _quizEventTimestamp(a)).slice(0, 8);
  const rewardHtml = rewardHistory.length
    ? rewardHistory.map((event) => `
      <div class="player-profile-history-row">
        <strong>${escapeHtml(_formatQuizQuestionType(event.type || "reward"))}</strong>
        <span>${Math.round(Number(event.points || 0))} pts</span>
        <small>${escapeHtml(_formatQuizProfileDate(event))}${event.note ? ` · ${escapeHtml(event.note)}` : ""}</small>
      </div>
    `).join("")
    : `<div class="player-profile-empty">No question or answer rewards ${escapeHtml(profile.detailLabel)}.</div>`;
  const activityHtml = profile.recentActivity.length
    ? profile.recentActivity.map((item) => {
      const event = item.event || {};
      let label = "Activity";
      let detail = "";
      if (item.kind === "quiz") {
        label = event.completed === false ? "Ended quiz" : "Quiz";
        detail = `${event.title || "Quiz"} · ${Number(event.correct || 0)}/${Number(event.answered || 0)} right`;
      } else if (item.kind === "sticker") {
        label = "Helmet sticker";
        detail = `${event.icon || "🏅"} ${event.label || "Sticker"}${event.note ? ` · ${event.note}` : ""}`;
      } else {
        label = _formatQuizQuestionType(item.kind);
        detail = `${Math.round(Number(item.points || 0))} points`;
      }
      return `
        <div class="player-profile-activity-row">
          <strong>${escapeHtml(label)}</strong>
          <span>${item.points ? `${Math.round(item.points)} pts` : escapeHtml(_formatQuizProfileDate(event))}</span>
          <small>${escapeHtml(detail)}</small>
        </div>
      `;
    }).join("")
    : `<div class="player-profile-empty">No recent profile activity.</div>`;
  return `
    <div class="player-leaderboard-profile-panel" id="playerLeaderboardProfilePanel" role="document">
      <header class="player-profile-header">
        <div>
          <span class="player-leaderboard-kicker">Player profile</span>
          <h2>${escapeHtml(profile.name)}</h2>
          ${profile.rosterMeta ? `<p>${escapeHtml(profile.rosterMeta)}</p>` : ""}
        </div>
        <button type="button" class="modal-close" data-action="closePlayerLeaderboardProfile" aria-label="Close player profile">×</button>
      </header>
      <div class="player-profile-body">
        <section class="player-profile-summary" aria-label="Player leaderboard summary">
          <span><strong>#${Math.round(profile.row.rank || 1)}</strong><small>Rank</small></span>
          <span><strong>${escapeHtml(profile.row.tier || _getQuizTier(profile.row.points || 0))}</strong><small>Tier</small></span>
          <span><strong>${Math.round(profile.totalPoints)}</strong><small>Points ${escapeHtml(profile.detailLabel)}</small></span>
          <span><strong>${escapeHtml(profile.achievement.stars ? profile.achievement.starText : String(profile.stickers.length))}</strong><small>${profile.achievement.stars ? "Stars" : "Stickers"}</small></span>
        </section>
        <section class="player-profile-grid">
          <article class="player-profile-card player-profile-card--achievement">
            <span>${escapeHtml(championName)} stars</span>
            <strong>${escapeHtml(profile.achievement.label)}</strong>
            <p>${profile.achievement.stars ? `${Math.round(profile.achievement.overGoal)} points above ${escapeHtml(championName)}. ${profile.achievement.nextRemaining ? `${Math.round(profile.achievement.nextRemaining)} to the next star.` : "Max local star level reached."}` : `Reach ${settings.weeklyGoal} weekly points, then keep going to earn stars.`}</p>
          </article>
          ${bestHtml}
          <article class="player-profile-card">
            <span>Season trend</span>
            <div class="player-profile-trend">${trendHtml}</div>
          </article>
          <article class="player-profile-card">
            <span>Weak areas</span>
            <div class="player-profile-weak-list">${weakHtml}</div>
          </article>
          <article class="player-profile-card">
            <span>Reward history</span>
            <div class="player-profile-history">${rewardHtml}</div>
          </article>
          <article class="player-profile-card player-profile-card--wide">
            <span>Helmet stickers</span>
            <div class="player-leaderboard-stickers">${_renderPlayerLeaderboardStickerList(profile.stickers.slice(-16).reverse(), "No helmet stickers yet.")}</div>
          </article>
          <article class="player-profile-card player-profile-card--wide">
            <span>Recent activity</span>
            <div class="player-profile-history">${activityHtml}</div>
          </article>
        </section>
      </div>
    </div>
  `;
}

function openPlayerLeaderboardProfile(playerName) {
  const summary = _summarizeQuizAttempts();
  const profile = _getPlayerLeaderboardProfileData(playerName, summary);
  let overlay = document.getElementById("playerLeaderboardProfileOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "playerLeaderboardProfileOverlay";
    overlay.className = "player-leaderboard-profile-overlay";
    overlay.dataset.action = "closePlayerLeaderboardProfileOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Player leaderboard profile");
    document.body.appendChild(overlay);
  }
  setInnerHTML(overlay, _renderPlayerLeaderboardProfileModal(profile));
  overlay.querySelectorAll(".player-profile-trend-bar").forEach((bar) => {
    const height = Math.max(8, Math.min(100, Number(bar.dataset.height || 0)));
    const fill = bar.querySelector("i");
    if (fill) fill.style.height = `${height}%`;
  });
  overlay.hidden = false;
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "player-leaderboard-profile",
      scrollElement: "playerLeaderboardProfilePanel",
      blocking: true,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
  }
  overlay.querySelector("[data-action='closePlayerLeaderboardProfile']")?.focus();
}

function closePlayerLeaderboardProfile() {
  const overlay = document.getElementById("playerLeaderboardProfileOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") {
    closeLayer("player-leaderboard-profile");
  }
  overlay.hidden = true;
}

function openPlayerLeaderboardDetail(playerName) {
  _leaderboardSelectedPlayer = _normalizeQuizPlayerName(playerName);
  renderPlayerLeaderboardPage();
  openPlayerLeaderboardProfile(_leaderboardSelectedPlayer);
}

function setPlayerLeaderboardView(view) {
  _playerLeaderboardView = view === "season" ? "season" : "week";
  renderPlayerLeaderboardPage();
}

function renderPlayerLeaderboardPage() {
  const page = document.getElementById("playerLeaderboardPage");
  if (!page) return;
  const summary = _summarizeQuizAttempts();
  const settings = _getPlayerQuizSettings();
  const draft = _getPlayerQuizDraft();
  if (!_leaderboardSelectedPlayer) _leaderboardSelectedPlayer = summary.player;
  const isSeason = _playerLeaderboardView === "season";
  const viewLabel = isSeason ? "Season" : `Week ${summary.weekKey}`;
  const viewAttempts = isSeason ? summary.playerAttempts : summary.weeklyAttempts;
  const viewQuizPoints = isSeason ? summary.seasonQuizPoints : summary.weeklyQuizPoints;
  const viewQuestionPoints = isSeason ? summary.seasonQuestionPoints : summary.weeklyQuestionPoints;
  const viewAnswerPoints = isSeason ? summary.seasonAnswerPoints : summary.weeklyAnswerPoints;
  const viewGiftPoints = isSeason ? summary.seasonGiftPoints : summary.weeklyGiftPoints;
  const viewPoints = isSeason ? summary.seasonPoints : summary.weeklyPoints;
  const viewRows = isSeason ? summary.seasonLeaderboardRows : summary.weeklyLeaderboardRows;
  const signalConfig = _getSignalLeaderboardConfig();
  const signalRows = _getSignalLeaderboardRowsForMode(summary, isSeason, signalConfig.mode);
  const viewTier = _getQuizTier(viewPoints, settings);
  const achievement = _getQuizAchievementSummary(summary.weeklyPoints, settings);
  const championName = _getQuizTierName("champion", settings);
  const recentAttempts = viewAttempts.slice(-5).reverse();
  const goalPct = Math.min(100, Math.round((summary.weeklyPoints / settings.weeklyGoal) * 100));
  const remaining = Math.max(0, settings.weeklyGoal - summary.weeklyPoints);
  const badgeFloor = Math.min(settings.honorRollMin, settings.highHonorRollMin, settings.coachesListMin);
  const syncMeta = typeof window !== "undefined" && typeof window.getRemotePlayerLeaderboardMeta === "function"
    ? window.getRemotePlayerLeaderboardMeta()
    : null;
  const syncLabel = syncMeta?.synced
    ? "Team synced"
    : "Local board";
  const recentHtml = recentAttempts.length
    ? recentAttempts.map((attempt) => `
        <div class="player-leaderboard-attempt${attempt.completed === false ? " is-partial" : ""}">
          <div>
            <strong>${escapeHtml(attempt.title || "Quiz")}</strong>
            <small>${escapeHtml(_getQuizSourceLabel(attempt.sourceType))} · ${attempt.correct}/${attempt.answered} right${attempt.remaining ? ` · ${attempt.remaining} left` : ""}</small>
          </div>
          <span>${Math.round(attempt.totalPoints || 0)} pts</span>
        </div>
      `).join("")
    : `<div class="player-leaderboard-empty">No quiz attempts yet. Start with your current practice or game plan.</div>`;

  setInnerHTML(page, `
    <div class="player-leaderboard-shell">
      <section class="player-leaderboard-hero">
        <div>
          <span class="player-leaderboard-kicker">Quiz progress</span>
          <h2>${isSeason ? "Season points and weekly pace" : "Quiz points and weekly standard"}</h2>
          <p>${isSeason ? "Track the whole season while still chasing the weekly standard." : `Get to ${settings.weeklyGoal} points this week. Game Plan quizzes count ${settings.gameplanWeight}x.`}</p>
        </div>
      </section>
      ${draft ? _renderPlayerQuizResumeCard(draft, "page") : ""}
      <div class="player-leaderboard-view-toggle" role="group" aria-label="Leaderboard view">
        <button type="button" class="${!isSeason ? "is-active" : ""}" data-action="setPlayerLeaderboardView" data-arg="week">Week</button>
        <button type="button" class="${isSeason ? "is-active" : ""}" data-action="setPlayerLeaderboardView" data-arg="season">Season</button>
      </div>
      <section class="player-leaderboard-grid" aria-label="Quiz progress">
        <article class="player-leaderboard-card player-leaderboard-card--goal">
          <span>${isSeason ? "Season Points" : "Weekly Goal"}</span>
          <strong>${isSeason ? Math.round(summary.seasonPoints) : `${Math.round(summary.weeklyPoints)} / ${settings.weeklyGoal}`}</strong>
          <div class="player-leaderboard-meter" aria-hidden="true"><i class="player-leaderboard-meter-fill"></i></div>
          <small>${isSeason ? `${Math.round(summary.weeklyPoints)} / ${settings.weeklyGoal} this week` : (remaining ? `${Math.round(remaining)} points to ${escapeHtml(championName)}` : (achievement.stars ? `${escapeHtml(achievement.shortLabel)} · ${Math.round(achievement.overGoal)} above` : `${escapeHtml(championName)} standard met`))}</small>
        </article>
        <article class="player-leaderboard-card player-leaderboard-card--tier">
          <span>Current Tier</span>
          <strong>${escapeHtml(viewTier)}</strong>
          <small>${viewAttempts.length} attempt${viewAttempts.length === 1 ? "" : "s"} ${isSeason ? "this season" : "this week"}</small>
        </article>
        <article class="player-leaderboard-card player-leaderboard-card--achievement">
          <span>${escapeHtml(championName)} Stars</span>
          <strong>${escapeHtml(achievement.stars ? achievement.starText : "0")}</strong>
          <small>${achievement.stars ? `${escapeHtml(achievement.shortLabel)}${achievement.nextRemaining ? ` · ${Math.round(achievement.nextRemaining)} to next` : ""}` : `${Math.round(settings.weeklyGoal + Math.max(100, settings.weeklyGoal * 0.25))} unlocks star 1`}</small>
        </article>
        <article class="player-leaderboard-card player-leaderboard-card--badge">
          <span>Best Badge</span>
          <strong>${summary.bestPercent ? escapeHtml(summary.bestBadge.label) : "No attempts"}</strong>
          <small>${summary.bestPercent ? `${Math.round(summary.bestPercent)}% best score` : `${badgeFloor}% unlocks bonuses`}</small>
        </article>
        <article class="player-leaderboard-card player-leaderboard-card--streak">
          <span>Streaks</span>
          <strong>${summary.dailyStreak} day${summary.dailyStreak === 1 ? "" : "s"}</strong>
          <small>${summary.weeklyStreak} week${summary.weeklyStreak === 1 ? "" : "s"} active</small>
        </article>
      </section>
      <section class="player-leaderboard-board">
        <div class="player-leaderboard-section-head">
          <h3>Point sources</h3>
          <span>${escapeHtml(viewLabel)}</span>
        </div>
        <div class="player-leaderboard-breakdown">
          <span><strong>${Math.round(viewQuizPoints)}</strong><small>Quiz</small></span>
          <span><strong>${Math.round(viewQuestionPoints)}</strong><small>Questions</small></span>
          <span><strong>${Math.round(viewAnswerPoints)}</strong><small>Answers</small></span>
          <span><strong>${Math.round(viewGiftPoints)}</strong><small>Gifted</small></span>
        </div>
      </section>
      <section class="player-leaderboard-board">
        <div class="player-leaderboard-section-head">
          <h3>${isSeason ? "Season board" : "Weekly board"}</h3>
          <span>${escapeHtml(syncLabel)} · tap a name for stickers</span>
        </div>
        <div class="player-quiz-leaderboard-preview">${_renderQuizLeaderRows(viewRows, summary.player)}</div>
      </section>
      <section class="player-leaderboard-board player-signal-leaderboard-board">
        <div class="player-leaderboard-section-head">
          <h3>Signal Leaderboard</h3>
          <span>${escapeHtml(viewLabel)} · ${escapeHtml(signalConfig.meta)}</span>
        </div>
        ${_renderSignalLeaderboardTabs()}
        <div class="signal-sprint-leaderboard signal-leaderboard-list signal-leaderboard-list--${escapeAttr(signalConfig.mode)}">${signalConfig.render(signalRows, summary.player)}</div>
      </section>
      ${_renderPlayerLeaderboardDetail(_leaderboardSelectedPlayer, summary)}
      <section class="player-leaderboard-board">
        <div class="player-leaderboard-section-head">
          <h3>${isSeason ? "Season attempts" : "Recent attempts"}</h3>
          <span>Completed and ended quizzes</span>
        </div>
        <div class="player-leaderboard-attempts">${recentHtml}</div>
      </section>
    </div>
  `);
  const meterFill = page.querySelector(".player-leaderboard-meter-fill");
  if (meterFill) meterFill.style.width = `${goalPct}%`;
}

function _isPlayerQuizWorkspace() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return user?.role === "player" || (user?.role === "coach" && user?.managedCoach === true);
}

function isQuizPageActive() {
  return document.getElementById("quiz")?.classList.contains("active") === true;
}

function renderQuizPage() {
  const page = document.getElementById("quizPage");
  if (!page) return;
  const playerWorkspace = _isPlayerQuizWorkspace();
  page.classList.toggle("quiz-page--player", playerWorkspace);
  page.classList.toggle("quiz-page--coach", !playerWorkspace);

  if (playerWorkspace) {
    const playerPage = document.getElementById("playerQuizPage");
    const hub = document.getElementById("playerQuizHubOverlay");
    if (playerPage && hub && hub.parentElement !== playerPage) playerPage.appendChild(hub);
    if (hub) {
      hub.classList.remove("hidden");
      hub.setAttribute("role", "region");
      hub.removeAttribute("aria-modal");
      hub.setAttribute("aria-label", "Quiz setup");
    }
    _syncPlayerQuizPositionDefault();
    _renderPlayerQuizHub();
    renderPlayerLeaderboardPage();
    return;
  }
  renderCoachQuizSetupPage();
}

function _quizUniquePlaysFromList(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter((play) => play && !play.isSeparator)
    .filter((play, idx) => {
      const sig = typeof playSignature === "function"
        ? playSignature(play)
        : `${_quizPlainCall(play)}::${idx}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
}

function _quizCompletenessStats(playList) {
  const playsForSource = _quizUniquePlaysFromList(playList);
  const totals = {
    playCount: playsForSource.length,
    diagrams: 0,
    rules: 0,
    notes: 0,
    situation: 0,
    defense: 0,
    calls: 0,
    formations: 0,
    playTypes: 0,
  };
  const callSet = new Set();
  const formationSet = new Set();
  const typeSet = new Set();
  playsForSource.forEach((play) => {
    const call = _quizPlainCall(play).toLowerCase();
    if (call) callSet.add(call);
    const formation = _quizFormationLabel(play).toLowerCase();
    if (formation) formationSet.add(formation);
    const playType = _quizCleanText(play.type).toLowerCase();
    if (playType) typeSet.add(playType);
    if (
      window.playImages &&
      typeof window.playImages.hasForPlay === "function" &&
      window.playImages.hasForPlay(play)
    ) {
      totals.diagrams += 1;
    }
    if (_getQuizPositions().some((position) => String(play[position.key] || "").trim())) {
      totals.rules += 1;
    }
    if (String(play.playerNotes || play.respNotes || play.notes || "").trim()) {
      totals.notes += 1;
    }
    if (
      String(play.preferredDown || "").trim() ||
      String(play.preferredDistance || "").trim() ||
      String(play.preferredFieldPosition || "").trim() ||
      String(play.preferredHash || "").trim() ||
      String(play.preferredSituation || "").trim()
    ) {
      totals.situation += 1;
    }
    if (
      String(play.practiceFront || "").trim() ||
      String(play.practiceDefense || "").trim() ||
      String(play.practiceCoverage || "").trim() ||
      String(play.practiceBlitz || "").trim() ||
      String(play.practiceStunt || "").trim()
    ) {
      totals.defense += 1;
    }
  });
  totals.calls = callSet.size;
  totals.formations = formationSet.size;
  totals.playTypes = typeSet.size;
  const pct = (value) => totals.playCount ? Math.round((value / totals.playCount) * 100) : 0;
  const choicePct = (value, fullAt = 4) => totals.playCount ? Math.min(100, Math.round((Number(value || 0) / fullAt) * 100)) : 0;
  const funScore = totals.playCount
    ? Math.round(
      pct(totals.diagrams) * 0.42 +
      choicePct(totals.formations, 3) * 0.24 +
      choicePct(totals.playTypes, 3) * 0.16 +
      (totals.calls >= 2 ? 100 : 0) * 0.18,
    )
    : 0;
  const learningScore = totals.playCount
    ? Math.round(pct(totals.rules) * 0.55 + pct(totals.notes) * 0.35 + (totals.playCount >= 2 ? 100 : 35) * 0.10)
    : 0;
  const contextScore = totals.playCount
    ? Math.round(pct(totals.situation) * 0.50 + pct(totals.defense) * 0.50)
    : 0;
  const score = totals.playCount
    ? Math.round(
      pct(totals.diagrams) * 0.22 +
      pct(totals.rules) * 0.30 +
      pct(totals.notes) * 0.16 +
      pct(totals.situation) * 0.16 +
      pct(totals.defense) * 0.16,
    )
    : 0;
  return {
    ...totals,
    diagramPct: pct(totals.diagrams),
    rulePct: pct(totals.rules),
    notePct: pct(totals.notes),
    situationPct: pct(totals.situation),
    defensePct: pct(totals.defense),
    callChoicePct: choicePct(totals.calls, 4),
    formationChoicePct: choicePct(totals.formations, 3),
    typeChoicePct: choicePct(totals.playTypes, 3),
    funScore,
    learningScore,
    contextScore,
    score,
  };
}

function _quizCompletenessChipItems(stats = {}) {
  const total = Number(stats.playCount || 0);
  const chip = (key, label, value, pct, readyAt = 70) => ({
    key,
    label,
    value: `${Number(value || 0)}/${total}`,
    tone: !total ? "empty" : Number(pct || 0) >= readyAt ? "ready" : Number(value || 0) ? "partial" : "missing",
  });
  return [
    chip("diagrams", "Diagrams", stats.diagrams, stats.diagramPct, 70),
    chip("rules", "Rules", stats.rules, stats.rulePct, 80),
    chip("notes", "Notes", stats.notes, stats.notePct, 50),
    chip("defense", "Defense", stats.defense, stats.defensePct, 60),
    chip("metadata", "Metadata", stats.situation, stats.situationPct, 70),
  ];
}

function _renderQuizCompletenessChips(stats = {}, className = "quiz-completeness-chips") {
  return `
    <div class="${escapeAttr(className)}" aria-label="Quiz source completeness">
      ${_quizCompletenessChipItems(stats).map((item) => `
        <span class="quiz-completeness-chip quiz-completeness-chip--${escapeAttr(item.tone)}">
          <strong>${escapeHtml(item.label)}</strong>
          <small>${escapeHtml(item.value)}</small>
        </span>
      `).join("")}
    </div>
  `;
}

function _readinessTone(score) {
  const value = Number(score || 0);
  if (value >= 80) return "ready";
  if (value >= 55) return "partial";
  if (value > 0) return "missing";
  return "empty";
}

function _renderCoachQuizReadinessSplit(stats = {}) {
  const items = [
    {
      label: "Fun readiness",
      score: stats.funScore,
      detail: `${stats.diagrams}/${stats.playCount} diagrams · ${stats.formations || 0} formations · ${stats.playTypes || 0} types`,
    },
    {
      label: "Learning readiness",
      score: stats.learningScore,
      detail: `${stats.rules}/${stats.playCount} rules · ${stats.notes}/${stats.playCount} notes`,
    },
    {
      label: "Context readiness",
      score: stats.contextScore,
      detail: `${stats.situation}/${stats.playCount} situations · ${stats.defense}/${stats.playCount} defense tags`,
    },
  ];
  return `
    <div class="coach-quiz-readiness-split" aria-label="Split quiz source readiness">
      ${items.map((item) => `
        <span class="coach-quiz-readiness-split-item coach-quiz-readiness-split-item--${escapeAttr(_readinessTone(item.score))}">
          <strong>${Math.round(Number(item.score || 0))}</strong>
          <b>${escapeHtml(item.label)}</b>
          <small>${escapeHtml(item.detail)}</small>
        </span>
      `).join("")}
    </div>
  `;
}

function _quizReadinessLabel(score) {
  if (score >= 88) return { label: "Player ready", tone: "ready" };
  if (score >= 68) return { label: "Close", tone: "close" };
  if (score >= 40) return { label: "Needs work", tone: "needs" };
  return { label: "Thin", tone: "thin" };
}

function _quizReadinessActions(stats, extras = {}) {
  const actions = [];
  if (!stats.playCount) actions.push("Add plays before publishing a quiz.");
  if (stats.diagramPct < 70) actions.push("Add 3 diagrams to the first uncovered calls.");
  if (stats.rulePct < 80) actions.push("Add Q/H/Y rules for the plays players will quiz.");
  if (stats.notePct < 50) actions.push("Add coach notes to missed or high-value plays.");
  if ((stats.calls || 0) < 2 || stats.callChoicePct < 50) actions.push("Simplify long calls and add distinct answer choices.");
  if (stats.situationPct < 70 || stats.defensePct < 60) actions.push("Add context tags after the fun and learning gaps are handled.");
  if (extras.needsVisibility) actions.push("Turn on Player login for this script.");
  if (extras.bucketCount !== undefined && extras.bucketCount < 2) actions.push("Add plays to more Game Plan buckets.");
  return actions.slice(0, 4);
}

function _quizMetric(label, value, total) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `
    <div class="coach-quiz-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${value}/${total}</strong>
      <i aria-hidden="true"><b data-pct="${pct}"></b></i>
    </div>
  `;
}

function _getCoachQuizGamePlanSources() {
  const boards = typeof _gpLoadBoards === "function"
    ? _gpLoadBoards()
    : storageManager.get(STORAGE_KEYS.GAME_PLAN_BOARDS, {});
  return Object.entries(boards && typeof boards === "object" ? boards : {})
    .map(([key, board]) => {
      const assignments = board?.assignments && typeof board.assignments === "object" ? board.assignments : {};
      const playsForBoard = [];
      let bucketCount = 0;
      Object.entries(assignments).forEach(([boxId, list]) => {
        if (boxId === "__holding" || boxId === "holding") return;
        const clean = Array.isArray(list) ? list.filter((play) => play && !play.isSeparator) : [];
        if (clean.length) bucketCount += 1;
        clean.forEach((play) => playsForBoard.push(play));
      });
      const title = board?.sheetTitle || key || "Game Plan";
      return {
        id: key,
        title,
        subtitle: key === "__unassigned__" ? "Unassigned board" : key,
        plays: playsForBoard,
        bucketCount,
      };
    })
    .filter((source) => source.plays.length || source.id !== "__unassigned__");
}

function _getCoachQuizScriptSources() {
  return (typeof getSavedScripts === "function" ? getSavedScripts() : [])
    .map((savedScript) => {
      const stats = typeof getSavedScriptStats === "function" ? getSavedScriptStats(savedScript) : {};
      return {
        id: String(savedScript.id || ""),
        title: savedScript.name || "Saved Script",
        subtitle: savedScript.date || stats.dateStr || "No date",
        plays: savedScript.plays || [],
        playerVisible: typeof isSavedScriptPlayerVisible === "function"
          ? isSavedScriptPlayerVisible(savedScript)
          : Boolean(savedScript.playerVisible),
        playCount: stats.playCount || 0,
        periodCount: stats.periodCount || 0,
      };
    });
}

function _findCoachQuizPlaybookTarget(play) {
  if (!play || !Array.isArray(plays)) return { play: null, index: -1, match: "" };
  const source = typeof findPlaybookSourceForPlay === "function"
    ? findPlaybookSourceForPlay(play, plays)
    : null;
  if (source) return { play: source, index: plays.indexOf(source), match: "source-id" };

  const matchIdx = plays.findIndex((candidate) => candidate === play || (typeof playsMatch === "function" && playsMatch(candidate, play)));
  if (matchIdx >= 0) return { play: plays[matchIdx], index: matchIdx, match: "call-match" };
  return { play: null, index: -1, match: "" };
}

function _coachQuizPlayRepairIssues(play) {
  const issues = [];
  const sourceStatus = typeof getPlaySourceStatus === "function"
    ? getPlaySourceStatus(play, plays)
    : { state: "local" };
  const target = _findCoachQuizPlaybookTarget(play);
  const hasDiagram = Boolean(
    window.playImages &&
    typeof window.playImages.hasForPlay === "function" &&
    (window.playImages.hasForPlay(play) || (target.play && window.playImages.hasForPlay(target.play)))
  );

  if (!hasDiagram) issues.push({ label: "Missing diagram", tone: "danger" });
  if (!_getQuizPositions().some((position) => String(play?.[position.key] || "").trim())) {
    issues.push({ label: "Missing player rules", tone: "warning" });
  }
  if (!String(play?.playerNotes || play?.respNotes || play?.notes || "").trim()) {
    issues.push({ label: "Missing coach note", tone: "warning" });
  }
  if (!String(play?.preferredDown || play?.preferredDistance || play?.preferredFieldPosition || play?.preferredHash || play?.preferredSituation || "").trim()) {
    issues.push({ label: "Missing situation", tone: "muted" });
  }
  if (!String(play?.practiceFront || play?.practiceDefense || play?.practiceCoverage || play?.practiceBlitz || play?.practiceStunt || "").trim()) {
    issues.push({ label: "Missing defense", tone: "muted" });
  }
  if (sourceStatus.state === "missing") {
    issues.unshift({ label: "Source missing", tone: "danger" });
  } else if (sourceStatus.state === "changed") {
    issues.unshift({ label: "Source updated", tone: "warning" });
  } else if (!target.play) {
    issues.unshift({ label: "No playbook match", tone: "danger" });
  } else if (target.match === "call-match") {
    issues.push({ label: "Matched by call", tone: "muted" });
  }
  return issues;
}

function _renderCoachQuizRepairRow(play, idx) {
  const target = _findCoachQuizPlaybookTarget(play);
  const issues = _coachQuizPlayRepairIssues(play);
  const issueHtml = issues.length
    ? issues.map((issue) => `<span class="coach-quiz-repair-chip coach-quiz-repair-chip--${escapeAttr(issue.tone)}">${escapeHtml(issue.label)}</span>`).join("")
    : `<span class="coach-quiz-repair-chip coach-quiz-repair-chip--ready">Ready</span>`;
  const call = _quizShortCall(play);
  const masterCall = target.play ? _quizShortCall(target.play) : "";
  return `
    <article class="coach-quiz-repair-row">
      <div class="coach-quiz-repair-row-main">
        <strong>${escapeHtml(call)}</strong>
        <small>${target.play
      ? `Edits save to Playbook${masterCall && masterCall !== call ? `: ${masterCall}` : ""}.`
      : "This script copy is not linked to a playbook play."}</small>
        <div class="coach-quiz-repair-chip-row">${issueHtml}</div>
      </div>
      <button type="button"
        class="btn btn-sm ${target.play ? "btn-primary" : "btn-outline"}"
        data-action="openCoachQuizRepairPlayEditor"
        data-arg="${escapeAttr(String(target.index))}"
        ${target.play ? "" : "disabled"}>
        Edit Playbook
      </button>
    </article>
  `;
}

function _renderCoachQuizSourceRepairBody(source) {
  const stats = _quizCompletenessStats(source?.plays || []);
  const readiness = _quizReadinessLabel(stats.score);
  const sourcePlays = _quizUniquePlaysFromList(source?.plays || []);
  return `
    <div class="coach-quiz-repair-summary">
      <span><strong>${stats.score}</strong><small>${escapeHtml(readiness.label)}</small></span>
      <span><strong>${stats.diagrams}/${stats.playCount}</strong><small>Diagrams</small></span>
      <span><strong>${stats.rules}/${stats.playCount}</strong><small>Rules</small></span>
      <span><strong>${stats.notes}/${stats.playCount}</strong><small>Notes</small></span>
    </div>
    <p class="coach-quiz-repair-note">Open a play below to fix the master Playbook record. Saved script copies may still need to be republished if they were captured before the playbook was cleaned up.</p>
    <div class="coach-quiz-repair-list">
      ${sourcePlays.length
      ? sourcePlays.map((play, idx) => _renderCoachQuizRepairRow(play, idx)).join("")
      : `<div class="coach-quiz-empty">No plays found in this script source.</div>`}
    </div>
  `;
}

let _coachQuizRepairSourceArg = "";

function _getCoachQuizSourceFromArg(arg = "") {
  const [kind, ...rest] = String(arg || "").split(":");
  const id = rest.join(":");
  if (kind === "script") {
    return { kind, source: _getCoachQuizScriptSources().find((source) => String(source.id) === id) || null };
  }
  if (kind === "gameplan") {
    return { kind, source: _getCoachQuizGamePlanSources().find((source) => String(source.id) === id) || null };
  }
  return { kind: "", source: null };
}

function openCoachQuizSourceRepair(arg = "") {
  const { kind, source } = _getCoachQuizSourceFromArg(arg);
  if (kind !== "script" || !source) {
    showToast("Open a saved script source to repair quiz plays.", { type: "warning" });
    return;
  }
  _coachQuizRepairSourceArg = `script:${source.id}`;
  document.getElementById("coachQuizRepairOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "coachQuizRepairOverlay";
  overlay.className = "custom-modal-overlay visible coach-quiz-repair-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "coachQuizRepairTitle");
  overlay.dataset.action = "closeCoachQuizSourceRepairOverlay";
  setInnerHTML(overlay, `
    <div class="custom-modal coach-quiz-repair-modal">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🧩</span>
        <div>
          <h3 class="custom-modal-title" id="coachQuizRepairTitle">Fix quiz source plays</h3>
          <p class="coach-quiz-repair-subtitle">${escapeHtml(source.title)} · ${escapeHtml(source.subtitle || "")}</p>
        </div>
        <button type="button" class="btn btn-sm" data-action="closeCoachQuizSourceRepair" aria-label="Close quiz source repair">✕</button>
      </div>
      <div class="custom-modal-body coach-quiz-repair-body" id="coachQuizRepairBody">
        ${_renderCoachQuizSourceRepairBody(source)}
      </div>
      <div class="custom-modal-actions">
        <button type="button" class="btn" data-action="closeCoachQuizSourceRepair">Done</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closeCoachQuizSourceRepair() {
  const overlay = document.getElementById("coachQuizRepairOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function openCoachQuizRepairPlayEditor(masterIdxStr = "") {
  const masterIdx = parseInt(masterIdxStr, 10);
  if (!Number.isFinite(masterIdx) || !Array.isArray(plays) || !plays[masterIdx]) {
    showToast("Could not find that play in the playbook.", { type: "warning" });
    return;
  }
  const play = plays[masterIdx];
  let filteredIdx = Array.isArray(filteredPlays) ? filteredPlays.indexOf(play) : -1;
  if (filteredIdx < 0) {
    filteredPlays = [...plays];
    filteredIdx = filteredPlays.indexOf(play);
  }
  if (filteredIdx < 0 || typeof openPlayEditor !== "function") return;

  const repairOverlay = document.getElementById("coachQuizRepairOverlay");
  if (repairOverlay) repairOverlay.classList.remove("visible");

  if (typeof window.closePlayEditor === "function" && !window.closePlayEditor.__coachQuizRepairWrapped) {
    const originalClose = window.closePlayEditor;
    const wrapped = function coachQuizRepairPatchedClosePlayEditor(...args) {
      const result = originalClose.apply(this, args);
      window.closePlayEditor = originalClose;
      try {
        renderCoachQuizSetupPage();
        const overlay = document.getElementById("coachQuizRepairOverlay");
        const body = document.getElementById("coachQuizRepairBody");
        const { source } = _getCoachQuizSourceFromArg(_coachQuizRepairSourceArg);
        if (overlay && body && source) {
          setInnerHTML(body, _renderCoachQuizSourceRepairBody(source));
          overlay.classList.add("visible");
          if (typeof trapFocus === "function") trapFocus(overlay);
        }
      } catch (_e) { /* keep editor close resilient */ }
      return result;
    };
    wrapped.__coachQuizRepairWrapped = true;
    window.closePlayEditor = wrapped;
  }

  requestAnimationFrame(() => {
    openPlayEditor(filteredIdx);
    requestAnimationFrame(() => {
      const body = document.getElementById("playEditorBody");
      const respBody = body?.querySelector(".pb-resp-body");
      const respToggle = body?.querySelector(".pb-resp-toggle");
      if (respBody) respBody.classList.remove("collapsed");
      if (respToggle) {
        respToggle.setAttribute("aria-expanded", "true");
        const icon = respToggle.querySelector(".toggle-icon");
        if (icon) icon.textContent = "▼";
      }
      const firstRule = document.getElementById("pe-respQ");
      if (firstRule) scrollElementWithinPanel(firstRule, { block: "center" });
    });
  });
}

function _coachQuizQuestionPreviewStats(playList) {
  const sourcePlays = _quizUniquePlaysFromList(playList);
  const position = _getQuizPosition();
  const positionKey = position?.key || "";
  const positionLabel = position?.label || "Player";
  const calls = new Set();
  const rules = new Set();
  let playsWithRule = 0;
  let playsWithDiagram = 0;
  let playsWithSignals = 0;
  const signalAnswers = new Set();
  sourcePlays.forEach((play) => {
    const call = _quizPlainCall(play).toLowerCase();
    if (call) calls.add(call);
    const rule = _quizCleanText(positionKey ? play[positionKey] : "");
    if (rule) {
      playsWithRule += 1;
      rules.add(rule.toLowerCase());
    }
    if (
      window.playImages &&
      typeof window.playImages.hasForPlay === "function" &&
      window.playImages.hasForPlay(play)
    ) {
      playsWithDiagram += 1;
    }
    const signalRecords = _quizSignalRecordsForPlay(play);
    if (signalRecords.length) {
      playsWithSignals += 1;
      signalRecords.forEach((record) => {
        const label = _quizSignalAnswerLabel(record).toLowerCase();
        if (label) signalAnswers.add(label);
      });
    }
  });
  const responsibilityReady = rules.size >= 4 ? playsWithRule : 0;
  const playFromRuleReady = playsWithRule && calls.size >= 2 ? playsWithRule : 0;
  const signalReady = playsWithSignals && signalAnswers.size >= 2 ? playsWithSignals : 0;
  return {
    positionLabel,
    playCount: sourcePlays.length,
    calls: calls.size,
    playsWithRule,
    uniqueRules: rules.size,
    playsWithDiagram,
    playsWithSignals,
    uniqueSignals: signalAnswers.size,
    responsibilityReady,
    playFromRuleReady,
    signalReady,
    callIdReady: sourcePlays.length,
  };
}

function _coachQuizPreviewRow(label, count, note, tone = "") {
  return `
    <div class="coach-quiz-preview-row${tone ? ` coach-quiz-preview-row--${escapeAttr(tone)}` : ""}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(String(count))}</span>
      <small>${escapeHtml(note)}</small>
    </div>
  `;
}

function _getCoachQuizModeRecommendation(source, kind = "script") {
  const playList = source?.plays || [];
  const stats = _quizCompletenessStats(playList);
  const preview = _coachQuizQuestionPreviewStats(playList);
  if (!stats.playCount) {
    return {
      label: "Add plays first",
      tone: "needs",
      detail: "This source needs at least one play before a player mode can run.",
      support: [],
    };
  }
  if (kind === "gameplan") {
    return {
      label: "Game Plan Check",
      tone: stats.playCount >= 2 ? "ready" : "planned",
      detail: stats.playCount >= 2
        ? "Best fit because players are studying this week's plan."
        : "Usable, but add one more call for better choices.",
      support: [
        `${stats.playCount} game-plan call${stats.playCount === 1 ? "" : "s"}`,
        stats.rules ? `${stats.rules} with player rules` : "rules optional",
      ],
    };
  }
  if (preview.playsWithDiagram) {
    return {
      label: "Diagram Drill",
      tone: stats.diagramPct >= 50 ? "ready" : "planned",
      detail: "Best fit because visual questions are the clearest player rep.",
      support: [
        `${preview.playsWithDiagram}/${preview.playCount} with diagrams`,
        preview.playsWithRule ? `${preview.playsWithRule} with ${preview.positionLabel} rules` : "rule fallback available",
      ],
    };
  }
  if (preview.playsWithRule) {
    return {
      label: "Know Your Job",
      tone: preview.uniqueRules >= 2 ? "ready" : "planned",
      detail: `Best fit because ${preview.positionLabel} responsibilities are present.`,
      support: [
        `${preview.playsWithRule}/${preview.playCount} with ${preview.positionLabel} rules`,
        preview.uniqueRules >= 4 ? "multiple-choice ready" : `${preview.uniqueRules} unique rule${preview.uniqueRules === 1 ? "" : "s"}`,
      ],
    };
  }
  return {
    label: "Quick Hits",
    tone: stats.playCount >= 2 ? "planned" : "needs",
    detail: "Use easy mixed reps until diagrams or player rules are added.",
    support: [
      `${stats.playCount} call${stats.playCount === 1 ? "" : "s"}`,
      stats.playCount >= 2 ? "can run short recognition reps" : "add another call for choices",
    ],
  };
}

function _renderCoachQuizModeRecommendation(source, kind) {
  const recommendation = _getCoachQuizModeRecommendation(source, kind);
  return `
    <div class="coach-quiz-mode-recommendation coach-quiz-mode-recommendation--${escapeAttr(recommendation.tone)}">
      <span>Recommended mode</span>
      <strong>${escapeHtml(recommendation.label)}</strong>
      <small>${escapeHtml(recommendation.detail)}</small>
      ${recommendation.support.length
      ? `<div>${recommendation.support.map((item) => `<b>${escapeHtml(item)}</b>`).join("")}</div>`
      : ""}
    </div>
  `;
}

function _coachQuizModeKeyFromRecommendation(recommendation = {}, kind = "script") {
  if (kind === "gameplan") return "gameplan";
  const label = String(recommendation.label || "").toLowerCase();
  if (label.includes("diagram")) return "diagram";
  if (label.includes("job")) return "job";
  return "quick";
}

function _coachQuizGeneratorPreview(source, kind = "script") {
  const sourceItems = _normalizeQuizItems(source?.plays || []);
  const recommendation = _getCoachQuizModeRecommendation(source, kind);
  const modeKey = _coachQuizModeKeyFromRecommendation(recommendation, kind);
  const sampleItems = _prepareQuizItemsForMode(sourceItems, modeKey).slice(0, 6);
  const original = {
    plays: _quizPlays,
    basePlays: _quizBasePlays,
    index: _quizIndex,
    mode: _quizMode,
    choiceCache: _quizChoiceCache,
    currentChoices: _quizCurrentChoices,
    currentQuestion: _quizCurrentQuestion,
  };
  const counts = {};
  const examples = [];
  try {
    _quizMode = modeKey;
    _quizPlays = sampleItems;
    _quizBasePlays = sampleItems;
    _quizChoiceCache = new Map();
    sampleItems.forEach((item, idx) => {
      _quizIndex = idx;
      const data = _getQuizQuestionAndChoices(item);
      const type = data?.question?.type || "study_card";
      counts[type] = (counts[type] || 0) + 1;
      if (examples.length < 3) {
        const correctLabel = _quizQuestionChoiceLabel(item, data.question);
        examples.push({
          type,
          label: _quizQuestionTypeLabel(type),
          prompt: data?.question?.prompt || "Study this one.",
          answer: correctLabel || _quizShortCall(item.play),
          playable: Array.isArray(data?.choices) && data.choices.length >= 2,
        });
      }
    });
  } finally {
    _quizPlays = original.plays;
    _quizBasePlays = original.basePlays;
    _quizIndex = original.index;
    _quizMode = original.mode;
    _quizChoiceCache = original.choiceCache;
    _quizCurrentChoices = original.currentChoices;
    _quizCurrentQuestion = original.currentQuestion;
  }
  const total = sampleItems.length;
  const studyCards = Number(counts.study_card || 0);
  const studyCardPct = total ? Math.round((studyCards / total) * 100) : 0;
  const bestQuestionType = examples.find((example) => example.playable)?.label || examples[0]?.label || "Study Card";
  return {
    recommendation,
    modeKey,
    total,
    counts,
    examples,
    studyCards,
    studyCardPct,
    mostlyStudyCards: total > 0 && studyCardPct >= 50,
    bestQuestionType,
  };
}

function _renderCoachQuizQuestionPreview(source, kind = "script") {
  const preview = _coachQuizQuestionPreviewStats(source.plays);
  const actual = _coachQuizGeneratorPreview(source, kind);
  const responsibilityNote = preview.responsibilityReady
    ? `${preview.positionLabel} rules are varied enough for multiple-choice responsibility questions.`
    : preview.playsWithRule
      ? `Needs 4 unique ${preview.positionLabel} rules; currently ${preview.uniqueRules}.`
      : `No ${preview.positionLabel} rules found yet.`;
  const ruleToPlayNote = preview.playFromRuleReady
    ? "Players can match a responsibility rule back to the right call."
    : "Needs player rules plus at least 2 distinct calls.";
  const diagramNote = preview.playsWithDiagram
    ? "Redacted diagram questions can fill in when player rules are missing."
    : "Add diagrams before visual questions can work.";
  const signalNote = preview.signalReady
    ? "Players can identify published formation, motion, tag, or play signals."
    : preview.playsWithSignals
      ? `Needs at least 2 distinct signal answers; currently ${preview.uniqueSignals}.`
      : "Publish signal clips before signal questions can work.";
  const actualRows = actual.examples.length
    ? actual.examples.map((example) => _coachQuizPreviewRow(
      example.label,
      example.playable ? "Play" : "Study",
      `${example.prompt}${example.answer ? ` Answer: ${example.answer}.` : ""}`,
      example.playable ? "ready" : "needs",
    )).join("")
    : _coachQuizPreviewRow("Study Card", "Study", "No fair generated examples yet.", "needs");
  return `
    <div class="coach-quiz-question-preview">
      <div class="coach-quiz-question-preview-head">
        <strong>Question preview</strong>
        <span>Best next: ${escapeHtml(actual.bestQuestionType)} · ${escapeHtml(preview.positionLabel)} position</span>
      </div>
      ${actual.mostlyStudyCards ? `
        <div class="coach-quiz-study-card-warning">
          Mostly Study Cards: ${actual.studyCardPct}% of sampled reps are not fair multiple-choice yet.
        </div>
      ` : ""}
      <div class="coach-quiz-preview-grid coach-quiz-preview-grid--actual">
        ${actualRows}
      </div>
      <div class="coach-quiz-preview-grid">
        ${_coachQuizPreviewRow("Responsibility", preview.responsibilityReady, responsibilityNote, preview.responsibilityReady ? "ready" : "needs")}
        ${_coachQuizPreviewRow("Rule → Play", preview.playFromRuleReady, ruleToPlayNote, preview.playFromRuleReady ? "ready" : "needs")}
        ${_coachQuizPreviewRow("Signal ID", preview.signalReady, signalNote, preview.signalReady ? "ready" : "needs")}
        ${_coachQuizPreviewRow("Call ID", preview.callIdReady, "Fallback for thin sources; works with distinct calls.", preview.callIdReady ? "ready" : "needs")}
        ${_coachQuizPreviewRow("Diagram ID", preview.playsWithDiagram, diagramNote, preview.playsWithDiagram ? "ready" : "needs")}
      </div>
    </div>
  `;
}

function _renderCoachQuizSourceControls(source, kind, stats) {
  const state = _getQuizSourceState(kind, source);
  const status = _quizSourceStateLabel(state, stats);
  const sourceArg = `${kind}:${source.id}`;
  const button = (nextState, label) => `
    <button type="button"
      class="btn btn-xs ${state === nextState ? "btn-primary" : "btn-outline"}"
      data-action="setCoachQuizSourceState"
      data-arg="${escapeAttr(`${sourceArg}:${nextState}`)}"
      aria-pressed="${state === nextState ? "true" : "false"}">
      ${escapeHtml(label)}
    </button>
  `;
  const helper = state === "available"
    ? "Players can choose this quiz source."
    : state === "locked"
      ? "Players can see this is locked, but cannot start it yet."
      : "Hidden from player quiz choices.";
  return `
    <div class="coach-quiz-source-controls">
      <span class="coach-quiz-source-status coach-quiz-source-status--${escapeAttr(status.tone)}">${escapeHtml(status.label)}</span>
      <div class="coach-quiz-source-control-actions" role="group" aria-label="${escapeAttr(source.title)} quiz publishing">
        ${button("available", "Available")}
        ${button("locked", "Locked")}
        ${button("coach", "Coach-only")}
      </div>
      <small>${escapeHtml(helper)}</small>
    </div>
  `;
}

function _renderCoachQuizSourceCard(source, kind) {
  const stats = _quizCompletenessStats(source.plays);
  const readiness = _quizReadinessLabel(stats.score);
  const actions = _quizReadinessActions(stats, {
    needsVisibility: kind === "script" && !source.playerVisible,
    bucketCount: kind === "gameplan" ? source.bucketCount : undefined,
  });
  const meta = kind === "script"
    ? `${source.playCount || stats.playCount} plays · ${source.periodCount || 0} periods · ${source.playerVisible ? "Player visible" : "Not player visible"}`
    : `${stats.playCount} plays · ${source.bucketCount || 0} populated buckets`;
  const canRepair = kind === "script" && ["needs", "thin"].includes(readiness.tone);
  const scoreRing = canRepair
    ? `<button type="button"
        class="coach-quiz-score-ring coach-quiz-score-ring-btn"
        data-tone="${escapeAttr(readiness.tone)}"
        data-action="openCoachQuizSourceRepair"
        data-arg="${escapeAttr(`${kind}:${source.id}`)}"
        aria-label="Open ${escapeAttr(readiness.label)} play repair list for ${escapeAttr(source.title)}">
        <strong>${stats.score}</strong>
        <span>${escapeHtml(readiness.label)}</span>
      </button>`
    : `<div class="coach-quiz-score-ring" data-tone="${escapeAttr(readiness.tone)}">
        <strong>${stats.score}</strong>
        <span>${escapeHtml(readiness.label)}</span>
      </div>`;
  return `
    <article class="coach-quiz-source-card coach-quiz-source-card--${escapeAttr(readiness.tone)}">
      <div class="coach-quiz-source-head">
        <div>
          <span class="coach-quiz-source-kind">${kind === "gameplan" ? "Game Plan" : "Practice Script"}</span>
          <h3>${escapeHtml(source.title)}</h3>
          <p>${escapeHtml(source.subtitle || meta)}</p>
        </div>
        ${scoreRing}
      </div>
      <div class="coach-quiz-source-meta">${escapeHtml(meta)}</div>
      ${_renderCoachQuizSourceControls(source, kind, stats)}
      ${_renderCoachQuizModeRecommendation(source, kind)}
      ${_renderCoachQuizReadinessSplit(stats)}
      ${_renderQuizCompletenessChips(stats, "quiz-completeness-chips coach-quiz-completeness-chips")}
      <div class="coach-quiz-metrics">
        ${_quizMetric("Diagrams", stats.diagrams, stats.playCount)}
        ${_quizMetric("Rules", stats.rules, stats.playCount)}
        ${_quizMetric("Notes", stats.notes, stats.playCount)}
        ${_quizMetric("Situation", stats.situation, stats.playCount)}
        ${_quizMetric("Defense", stats.defense, stats.playCount)}
      </div>
      ${_renderCoachQuizQuestionPreview(source, kind)}
      <div class="coach-quiz-next-actions">
        <strong>Make this quiz better</strong>
        ${actions.length
      ? `<ul>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>`
      : `<p>This source is ready for player quizzes.</p>`}
        <div class="coach-quiz-next-action-buttons">
          ${canRepair ? `<button type="button" class="btn btn-sm btn-outline" data-action="openCoachQuizSourceRepair" data-arg="${escapeAttr(`${kind}:${source.id}`)}">Review plays</button>` : ""}
          <button type="button" class="btn btn-sm btn-primary" data-action="openQuizAssignmentForSource" data-arg="${escapeAttr(`${kind}|${encodeURIComponent(source.id)}`)}">Assign homework</button>
        </div>
      </div>
    </article>
  `;
}

function _renderCoachStickerButtons() {
  return _getPlayerHelmetStickerTypes().map((sticker) => `
    <button type="button"
      class="coach-quiz-sticker-btn coach-quiz-sticker-btn--${escapeAttr(sticker.color)}"
      data-action="coachAwardHelmetSticker"
      data-arg="${escapeAttr(sticker.key)}">
      <span aria-hidden="true">${escapeHtml(sticker.icon)}</span>
      <strong>${escapeHtml(sticker.label)}</strong>
      ${sticker.description ? `<small>${escapeHtml(sticker.description)}</small>` : ""}
    </button>
  `).join("");
}

function _getCustomHelmetStickerTypes() {
  return _getPlayerHelmetStickerTypes().filter((sticker) => sticker.custom);
}

function _renderCoachCustomStickerManager() {
  const customStickers = _getCustomHelmetStickerTypes();
  if (!customStickers.length) {
    return `
      <div class="coach-quiz-custom-sticker-empty">
        Custom stickers will appear here after you add one.
      </div>
    `;
  }
  return `
    <div class="coach-quiz-custom-sticker-manager" aria-label="Custom helmet sticker library">
      <span class="coach-quiz-custom-sticker-title">Custom sticker library</span>
      ${customStickers.map((sticker) => `
        <div class="coach-quiz-custom-sticker-row">
          <span class="coach-quiz-custom-sticker-icon" aria-hidden="true">${escapeHtml(sticker.icon)}</span>
          <span class="coach-quiz-custom-sticker-copy">
            <strong>${escapeHtml(sticker.label)}</strong>
            ${sticker.description ? `<small>${escapeHtml(sticker.description)}</small>` : ""}
          </span>
          <span class="coach-quiz-custom-sticker-actions">
            <button type="button" class="btn btn-xs btn-outline" data-action="coachEditHelmetSticker" data-arg="${escapeAttr(sticker.key)}" aria-label="Edit ${escapeAttr(sticker.label)}">Edit</button>
            <button type="button" class="btn btn-xs btn-danger" data-action="coachDeleteHelmetSticker" data-arg="${escapeAttr(sticker.key)}" aria-label="Delete ${escapeAttr(sticker.label)}">Delete</button>
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function _renderCoachQuizSettingsPanel(settings = _getPlayerQuizSettings()) {
  const enabled = new Set(settings.enabledQuestionTypes || []);
  const signalSettings = _getSignalGameSettings();
  const signalEligible = new Set(signalSettings.eligibleCategories);
  const signalStats = typeof getSignalQuizStats === "function"
    ? getSignalQuizStats({
      categories: signalSettings.eligibleCategories,
      includeDraft: _canUseStaffSignalClips(signalSettings),
    })
    : { total: 0, categories: [] };
  const signalCountByCategory = new Map(
    (Array.isArray(signalStats.categories) ? signalStats.categories : [])
      .map((category) => [String(category.id || "").trim().toUpperCase(), Number(category.count || 0)]),
  );
  const field = (id, label, value, attrs = "") => `
    <label class="coach-quiz-setting-field" for="${escapeAttr(id)}">
      <span>${escapeHtml(label)}</span>
      <input id="${escapeAttr(id)}" type="number" value="${escapeAttr(value)}" ${attrs}>
    </label>
  `;
  const textField = (id, label, value, attrs = "") => `
    <label class="coach-quiz-setting-field" for="${escapeAttr(id)}">
      <span>${escapeHtml(label)}</span>
      <input id="${escapeAttr(id)}" type="text" value="${escapeAttr(value)}" ${attrs}>
    </label>
  `;
  const toggle = (id, label, value, note) => `
    <label class="coach-quiz-type-toggle" for="${escapeAttr(id)}">
      <input id="${escapeAttr(id)}" type="checkbox" value="${escapeAttr(value)}" ${enabled.has(value) ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(note)}</small>
      </span>
    </label>
  `;
  const signalToggle = (category) => {
    const count = signalCountByCategory.get(category.id) || 0;
    return `
      <label class="coach-quiz-type-toggle" for="coachSignalCategory${escapeAttr(category.id)}">
        <input id="coachSignalCategory${escapeAttr(category.id)}" type="checkbox" value="${escapeAttr(category.id)}" ${signalEligible.has(category.id) ? "checked" : ""}>
        <span>
          <strong>${escapeHtml(category.label)}</strong>
          <small>${count} playable clip${count === 1 ? "" : "s"}</small>
        </span>
      </label>
    `;
  };
  return `
    <section class="coach-quiz-setup-section coach-quiz-settings-panel" aria-label="Quiz settings">
      <div class="coach-quiz-section-head">
        <h3>Quiz settings</h3>
        <span>${settings.weeklyGoal} point goal · Script ${settings.scriptWeight}x · Game Plan ${settings.gameplanWeight}x</span>
      </div>
      <div class="coach-quiz-settings-grid">
        <article>
          <span>Goals and pacing</span>
          <div class="coach-quiz-setting-fields">
            ${field("coachQuizWeeklyGoal", "Weekly goal", settings.weeklyGoal, 'min="250" max="5000" step="50"')}
            ${field("coachQuizBaseCorrectPoints", "Correct answer points", settings.baseCorrectPoints, 'min="1" max="50" step="1"')}
            ${field("coachQuizMinBonusAnswers", "Min answers for bonus", settings.minBonusAnswers, 'min="1" max="50" step="1"')}
          </div>
        </article>
        <article>
          <span>Tier names</span>
          <div class="coach-quiz-setting-fields coach-quiz-setting-fields--pairs">
            ${textField("coachQuizTierChampion", "100% goal", _getQuizTierName("champion", settings), 'maxlength="32" autocomplete="off"')}
            ${textField("coachQuizTierBaller", "75% goal", _getQuizTierName("baller", settings), 'maxlength="32" autocomplete="off"')}
            ${textField("coachQuizTierStarter", "50% goal", _getQuizTierName("starter", settings), 'maxlength="32" autocomplete="off"')}
            ${textField("coachQuizTierContributor", "25% goal", _getQuizTierName("contributor", settings), 'maxlength="32" autocomplete="off"')}
            ${textField("coachQuizTierDefense", "Below 25%", _getQuizTierName("defense", settings), 'maxlength="32" autocomplete="off"')}
          </div>
        </article>
        <article>
          <span>Source weights</span>
          <div class="coach-quiz-setting-fields">
            ${field("coachQuizScriptWeight", "Script weight", settings.scriptWeight, 'min="0.25" max="5" step="0.05"')}
            ${field("coachQuizGameplanWeight", "Game Plan weight", settings.gameplanWeight, 'min="0.25" max="5" step="0.05"')}
          </div>
        </article>
        <article class="coach-quiz-signal-settings-card">
          <span>Signal games</span>
          <div class="coach-quiz-setting-fields">
            ${field("coachSignalMinClipCount", "Minimum clips to unlock", signalSettings.minClipCount, 'min="2" max="50" step="1"')}
            <label class="coach-quiz-type-toggle coach-quiz-type-toggle--wide" for="coachSignalIncludeDraft">
              <input id="coachSignalIncludeDraft" type="checkbox" ${signalSettings.includeDraftForStaff ? "checked" : ""}>
              <span>
                <strong>Staff testing includes draft clips</strong>
                <small>Players still only get published clips.</small>
              </span>
            </label>
          </div>
          <div class="coach-quiz-signal-category-settings">
            ${SIGNAL_GAME_CATEGORY_OPTIONS.map(signalToggle).join("")}
          </div>
        </article>
        <article>
          <span>Honor bonuses</span>
          <div class="coach-quiz-setting-fields coach-quiz-setting-fields--pairs">
            ${field("coachQuizHonorRollMin", "Honor Roll %", settings.honorRollMin, 'min="50" max="100" step="1"')}
            ${field("coachQuizHonorRollBonus", "Honor Roll pts", settings.honorRollBonus, 'min="0" max="500" step="5"')}
            ${field("coachQuizHighHonorRollMin", "High Honor %", settings.highHonorRollMin, 'min="50" max="100" step="1"')}
            ${field("coachQuizHighHonorRollBonus", "High Honor pts", settings.highHonorRollBonus, 'min="0" max="500" step="5"')}
            ${field("coachQuizCoachesListMin", "Coaches List %", settings.coachesListMin, 'min="50" max="100" step="1"')}
            ${field("coachQuizCoachesListBonus", "Coaches List pts", settings.coachesListBonus, 'min="0" max="500" step="5"')}
          </div>
        </article>
        <article>
          <span>Reward points and caps</span>
          <div class="coach-quiz-setting-fields coach-quiz-setting-fields--pairs">
            ${field("coachQuizQuestionPoints", "Question pts", settings.questionPoints, 'min="0" max="250" step="5"')}
            ${field("coachQuizAnswerPoints", "Answer pts", settings.answerPoints, 'min="0" max="250" step="5"')}
            ${field("coachQuizGiftPoints", "Gift pts", settings.giftPoints, 'min="0" max="500" step="5"')}
            ${field("coachQuizDailyRewardCap", "Daily cap", settings.dailyRewardCap, 'min="0" max="1000" step="25"')}
            ${field("coachQuizWeeklyRewardCap", "Weekly cap", settings.weeklyRewardCap, 'min="0" max="3000" step="25"')}
          </div>
        </article>
      </div>
      <div class="coach-quiz-question-type-settings">
        ${toggle("coachQuizTypeResponsibility", "Responsibility", "responsibility", "Player matches their rule on a known call.")}
        ${toggle("coachQuizTypeRuleToPlay", "Rule to Play", "play_from_rule", "Player sees a rule and picks the call.")}
        ${toggle("coachQuizTypeDiagram", "Diagram ID", "diagram", "Player sees a redacted diagram and picks the call.")}
        ${toggle("coachQuizTypeSignal", "Signal ID", "signal", "Player identifies a formation, motion, tag, or play signal.")}
        ${toggle("coachQuizTypeCall", "Call ID", "call", "Fallback that keeps thin sources usable.")}
      </div>
      <div class="coach-quiz-settings-actions">
        <button type="button" class="btn btn-primary" data-action="coachSaveQuizSettings">Save Settings</button>
        <button type="button" class="btn btn-outline" data-action="coachResetQuizSettings">Reset Defaults</button>
      </div>
    </section>
  `;
}

function _renderCoachQuizPositionPicker() {
  const current = _getQuizPosition();
  return `
    <section class="coach-quiz-preview-toolbar">
      <div>
        <span class="coach-quiz-kicker">Question Preview</span>
        <h3>Preview by player position</h3>
        <p>Use this to catch sources that will only create call-ID questions because player rules are missing for a position.</p>
      </div>
      <div class="coach-quiz-position-picker" role="group" aria-label="Question preview position">
        ${_getQuizPositions().map((position) => `
          <button type="button"
            class="coach-quiz-position-btn${position.key === current?.key ? " is-active" : ""}"
            data-action="setCoachQuizPreviewPosition"
            data-arg="${escapeAttr(position.key)}"
            aria-pressed="${position.key === current?.key ? "true" : "false"}">
            ${escapeHtml(position.label)}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function setCoachQuizPreviewPosition(key) {
  const next = _getQuizPositions().find((position) => position.key === key);
  if (!next) return;
  _quizPositionKey = next.key;
  renderCoachQuizSetupPage();
}

function setCoachQuizLeaderboardView(view) {
  _coachQuizLeaderboardView = view === "season" ? "season" : "week";
  renderCoachQuizSetupPage();
}

function selectCoachQuizLeaderboardPlayer(playerName) {
  _leaderboardSelectedPlayer = _normalizeQuizPlayerName(playerName);
  renderCoachQuizSetupPage();
}

function _renderCoachQuizLeaderboardRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return `<div class="coach-quiz-empty">No quiz attempts yet. Player results will appear here after they take quizzes.</div>`;
  }
  return rows.slice(0, 10).map((row) => {
    const selected = _normalizeQuizPlayerName(row.name) === _normalizeQuizPlayerName(_leaderboardSelectedPlayer || "");
    const achievement = _getQuizAchievementSummary(row.totalPoints || 0);
    return `
      <button type="button"
        class="coach-quiz-leader-row${selected ? " is-selected" : ""}"
        data-action="selectCoachQuizLeaderboardPlayer"
        data-arg="${escapeAttr(row.name)}">
        <span class="coach-quiz-leader-rank">#${row.rank}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.tier)} · ${row.percent || 0}%</span>
        <span class="coach-quiz-achievement${achievement.stars ? " has-stars" : ""}">${escapeHtml(achievement.stars ? `${achievement.starText} ${achievement.shortLabel}` : "No stars")}</span>
        <b>${Math.round(row.totalPoints)} pts</b>
      </button>
    `;
  }).join("");
}

function _renderCoachQuizWeakList(items, emptyText) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="coach-quiz-weak-empty">${escapeHtml(emptyText)}</div>`;
  }
  return items.map((item) => `
    <div class="coach-quiz-weak-row">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${Math.round(item.percent || 0)}%</span>
      <small>${Math.round(item.correct || 0)}/${Math.round(item.total || item.answered || 0)} correct · ${Math.round(item.wrong || 0)} miss${Number(item.wrong || 0) === 1 ? "" : "es"}</small>
    </div>
  `).join("");
}

function _renderCoachQuizCommonMissedPlays(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="coach-quiz-weak-empty">No common missed plays yet.</div>`;
  }
  return items.map((item) => `
    <div class="coach-quiz-common-miss-row">
      <strong>${escapeHtml(item.label)}</strong>
      <span>${Math.round(item.misses || 0)} miss${Number(item.misses || 0) === 1 ? "" : "es"}</span>
      <small>${Math.round(item.players || 0)} player${Number(item.players || 0) === 1 ? "" : "s"} · ${escapeHtml((item.questionTypes || []).join(", ") || "Quiz review")}</small>
    </div>
  `).join("");
}

function _renderCoachQuizLeaderboardPanel(summary) {
  const topPlayer = summary.rows[0];
  const selectedPlayer = _leaderboardSelectedPlayer || topPlayer?.name || "";
  const selected = summary.rows.find((row) => _normalizeQuizPlayerName(row.name) === _normalizeQuizPlayerName(selectedPlayer));
  const signalConfig = _getSignalLeaderboardConfig();
  const signalRows = signalConfig.mode === "signal-battle"
    ? summary.signalBattleRows
    : signalConfig.mode === "signal-heat"
      ? summary.signalHeatRows
      : summary.signalSprintRows;
  const selectedMeta = selected
    ? `${selected.attempts} attempt${selected.attempts === 1 ? "" : "s"} · ${Math.round(selected.quizPoints)} quiz pts · ${Math.round(selected.rewardPoints)} reward pts`
    : "Select a player to stage reward prompts faster.";
  return `
    <section class="coach-quiz-setup-section coach-quiz-leaderboard-panel">
      <div class="coach-quiz-section-head">
        <h3>Leaderboard review</h3>
        <span>${escapeHtml(summary.label)} · ${summary.totals.players} players · ${summary.totals.attempts} attempts</span>
      </div>
      <div class="coach-quiz-leaderboard-toolbar">
        <div class="coach-quiz-view-toggle" role="group" aria-label="Coach leaderboard view">
          <button type="button" class="${!summary.isSeason ? "is-active" : ""}" data-action="setCoachQuizLeaderboardView" data-arg="week">Week</button>
          <button type="button" class="${summary.isSeason ? "is-active" : ""}" data-action="setCoachQuizLeaderboardView" data-arg="season">Season</button>
        </div>
        <div class="coach-quiz-selected-player">
          <strong>${selected ? escapeHtml(selected.name) : "No player selected"}</strong>
          <span>${escapeHtml(selectedMeta)}</span>
        </div>
      </div>
      <div class="coach-quiz-leaderboard-summary">
        <span><strong>${Math.round(summary.totals.quizPoints)}</strong><small>Quiz pts</small></span>
        <span><strong>${Math.round(summary.totals.questionPoints)}</strong><small>Question pts</small></span>
        <span><strong>${Math.round(summary.totals.answerPoints)}</strong><small>Answer pts</small></span>
        <span><strong>${Math.round(summary.totals.giftPoints)}</strong><small>Gift pts</small></span>
        <span><strong>${Math.round(summary.totals.stickers)}</strong><small>Stickers</small></span>
      </div>
      <div class="coach-quiz-leaderboard-grid">
        <div class="coach-quiz-leaderboard-list">${_renderCoachQuizLeaderboardRows(summary.rows)}</div>
        <div class="coach-quiz-weak-card">
          <div class="coach-quiz-weak-head">
            <strong>Weak positions</strong>
            <span>Under 85%</span>
          </div>
          ${_renderCoachQuizWeakList(summary.weakPositions, "No weak position trend yet.")}
        </div>
        <div class="coach-quiz-weak-card">
          <div class="coach-quiz-weak-head">
            <strong>Weak question types</strong>
            <span>Under 85%</span>
          </div>
          ${_renderCoachQuizWeakList(summary.weakQuestionTypes, "No weak question-type trend yet.")}
        </div>
        <div class="coach-quiz-weak-card coach-quiz-common-miss-card">
          <div class="coach-quiz-weak-head">
            <strong>Common missed plays</strong>
            <span>Re-teach targets</span>
          </div>
          ${_renderCoachQuizCommonMissedPlays(summary.commonMissedPlays)}
        </div>
        <div class="coach-quiz-weak-card coach-quiz-signal-sprint-card">
          <div class="coach-quiz-weak-head">
            <strong>Signal Leaderboard</strong>
            <span>${escapeHtml(signalConfig.meta)}</span>
          </div>
          ${_renderSignalLeaderboardTabs()}
          <div class="signal-sprint-leaderboard signal-sprint-leaderboard--coach">
            ${signalConfig.render(signalRows, selectedPlayer, "coach")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function _showCoachRosterRewardPicker(defaultName = "") {
  return new Promise((resolve) => {
    const roster = _getQuizRosterPlayers();
    if (!roster.length) {
      resolve(null);
      return;
    }
    const previouslyFocused = document.activeElement;
    const defaultPlayer = _getQuizRosterPlayerByName(defaultName);
    const modalId = `coachRosterRewardPicker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sortedRoster = roster
      .map((player) => ({
        ...player,
        isRecommended: Boolean(defaultPlayer && player.id === defaultPlayer.id),
      }))
      .sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended) || a.name.localeCompare(b.name));
    const rowsHtml = sortedRoster.map((player) => {
      const meta = _formatQuizRosterMeta(player) || "Roster player";
      const search = [
        player.name,
        player.number,
        player.position,
        player.accountUsername,
        player.positionGroup,
      ].join(" ").toLowerCase();
      return `
        <button type="button"
          class="coach-roster-picker-row${player.isRecommended ? " is-recommended" : ""}"
          data-player-name="${escapeAttr(player.name)}"
          data-search="${escapeAttr(search)}">
          <span class="coach-roster-picker-avatar">${escapeHtml(player.number ? `#${player.number}` : "ID")}</span>
          <span class="coach-roster-picker-main">
            <strong>${escapeHtml(player.name)}</strong>
            <small>${escapeHtml(meta)}</small>
          </span>
          ${player.isRecommended ? '<span class="coach-roster-picker-badge">Selected</span>' : ""}
        </button>
      `;
    }).join("");
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay";
    overlay.innerHTML = `
      <div class="custom-modal custom-modal-wide coach-roster-picker-modal" role="dialog" aria-modal="true" aria-labelledby="${modalId}-title">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">👤</span>
          <h3 class="custom-modal-title" id="${modalId}-title">Award Roster Player</h3>
        </div>
        <div class="coach-roster-picker-body">
          <p>Search the active roster. Rewards and stickers can only attach to these linked roster names.</p>
          <input type="search"
            class="coach-roster-picker-search"
            placeholder="Search name, #, POS, or login"
            aria-label="Search active roster players" />
          <div class="coach-roster-picker-list">${rowsHtml}</div>
          <div class="coach-roster-picker-empty" hidden>No active roster player matches that search.</div>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn custom-modal-btn custom-modal-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector(".coach-roster-picker-search");
    const rows = Array.from(overlay.querySelectorAll(".coach-roster-picker-row"));
    const empty = overlay.querySelector(".coach-roster-picker-empty");

    function close(value) {
      overlay.classList.remove("visible");
      setTimeout(() => {
        overlay.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === "function") {
          previouslyFocused.focus();
        }
      }, 200);
      resolve(value);
    }

    function updateFilter() {
      const query = String(searchInput?.value || "").trim().toLowerCase();
      let visibleCount = 0;
      rows.forEach((row) => {
        const matches = !query || String(row.dataset.search || "").includes(query);
        row.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      if (empty) empty.hidden = visibleCount > 0;
    }

    rows.forEach((row) => {
      row.addEventListener("click", () => close(_normalizeQuizPlayerName(row.dataset.playerName || "")));
    });
    searchInput?.addEventListener("input", updateFilter);
    searchInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const firstVisible = rows.find((row) => !row.hidden);
      if (!firstVisible) return;
      event.preventDefault();
      close(_normalizeQuizPlayerName(firstVisible.dataset.playerName || ""));
    });
    overlay.querySelector(".custom-modal-cancel")?.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
      }
    });

    if (typeof trapFocus === "function") trapFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    setTimeout(() => searchInput?.focus(), 0);
  });
}

async function _coachPromptRewardPlayer(defaultName = "") {
  const roster = _getQuizRosterPlayers();
  if (roster.length) {
    return _showCoachRosterRewardPicker(defaultName);
  }
  if (typeof showModal === "function") {
    await showModal("Add players to the active roster first, then assign stickers and points from that roster.", {
      title: "Roster Required",
      icon: "📋",
    });
  } else if (typeof showToast === "function") {
    showToast("Add active roster players before awarding points.", { type: "warning" });
  }
  return null;
}

async function coachCreateHelmetSticker() {
  if (typeof showPrompt !== "function") return;
  const label = await showPrompt("Name this helmet sticker.", "", {
    title: "Sticker Label",
    icon: "🏅",
    placeholder: "Film Junkie",
  });
  if (label === null) return;
  const safeLabel = String(label || "").trim();
  if (!safeLabel) {
    showToast("Sticker needs a name.", { type: "warning" });
    return;
  }
  const icon = await showPrompt("Choose one emoji for the sticker.", "🏅", {
    title: safeLabel,
    icon: "😀",
    placeholder: "🏅",
  });
  if (icon === null) return;
  const description = await showPrompt("What does this sticker mean?", "", {
    title: "Sticker Description",
    icon: String(icon || "🏅").trim() || "🏅",
    placeholder: "Watched film and asked sharp questions.",
  });
  if (description === null) return;
  const colorChoices = ["blue", "green", "gold", "red", "purple", "navy"].map((color) => ({
    label: color.charAt(0).toUpperCase() + color.slice(1),
    value: color,
  }));
  const color = typeof showListPicker === "function"
    ? await showListPicker("Choose how this sticker should pop on the leaderboard.", colorChoices, {
      title: "Sticker Color",
      icon: String(icon || "🏅").trim() || "🏅",
    })
    : "blue";
  if (color === null) return;
  const currentTypes = _getPlayerHelmetStickerTypes();
  const customTypes = currentTypes.filter((sticker) => sticker.custom);
  const normalized = _normalizeHelmetStickerType({
    label: safeLabel,
    icon,
    description,
    color,
    custom: true,
  });
  const duplicate = currentTypes.find((sticker) => sticker.key === normalized.key);
  if (duplicate) {
    showToast("That sticker already exists.", { type: "warning" });
    return;
  }
  customTypes.push(normalized);
  _savePlayerHelmetStickerTypes(customTypes);
  renderCoachQuizSetupPage();
  showToast(`${safeLabel} sticker added.`, { type: "success" });
}

async function coachEditHelmetSticker(stickerKey = "") {
  if (typeof showPrompt !== "function") return;
  const currentTypes = _getPlayerHelmetStickerTypes();
  const customTypes = currentTypes.filter((sticker) => sticker.custom);
  const sticker = customTypes.find((item) => item.key === stickerKey);
  if (!sticker) {
    showToast("Only custom stickers can be edited.", { type: "warning" });
    return;
  }
  const label = await showPrompt("Update the sticker name.", sticker.label, {
    title: "Edit Sticker Label",
    icon: sticker.icon || "🏅",
    placeholder: "Film Junkie",
    confirmText: "Save",
  });
  if (label === null) return;
  const safeLabel = String(label || "").trim();
  if (!safeLabel) {
    showToast("Sticker needs a name.", { type: "warning" });
    return;
  }
  const icon = await showPrompt("Choose one emoji for the sticker.", sticker.icon || "🏅", {
    title: safeLabel,
    icon: "😀",
    placeholder: "🏅",
    confirmText: "Save",
  });
  if (icon === null) return;
  const description = await showPrompt("Update what this sticker means.", sticker.description || "", {
    title: "Edit Sticker Description",
    icon: String(icon || sticker.icon || "🏅").trim() || "🏅",
    placeholder: "Watched film and asked sharp questions.",
    confirmText: "Save",
  });
  if (description === null) return;
  const colorChoices = ["blue", "green", "gold", "red", "purple", "navy"].map((color) => ({
    label: color.charAt(0).toUpperCase() + color.slice(1),
    value: color,
    recommended: color === sticker.color,
  }));
  const color = typeof showListPicker === "function"
    ? await showListPicker("Choose how this sticker should pop on the leaderboard.", colorChoices, {
      title: "Edit Sticker Color",
      icon: String(icon || sticker.icon || "🏅").trim() || "🏅",
    })
    : sticker.color || "blue";
  if (color === null) return;
  const updated = _normalizeHelmetStickerType({
    ...sticker,
    label: safeLabel,
    icon,
    description,
    color,
    custom: true,
  });
  const duplicate = currentTypes.find((item) => item.key !== sticker.key && item.label.toLowerCase() === updated.label.toLowerCase());
  if (duplicate) {
    showToast("A sticker with that name already exists.", { type: "warning" });
    return;
  }
  _savePlayerHelmetStickerTypes(customTypes.map((item) => (item.key === sticker.key ? updated : item)));
  renderCoachQuizSetupPage();
  showToast(`${updated.label} sticker updated.`, { type: "success" });
}

async function coachDeleteHelmetSticker(stickerKey = "") {
  const customTypes = _getCustomHelmetStickerTypes();
  const sticker = customTypes.find((item) => item.key === stickerKey);
  if (!sticker) {
    showToast("Only custom stickers can be deleted.", { type: "warning" });
    return;
  }
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Delete "${sticker.label}" from future sticker awards? Existing player awards stay in history.`, {
      title: "Delete Sticker",
      icon: sticker.icon || "🏅",
      confirmText: "Delete",
      cancelText: "Keep",
      danger: true,
    })
    : false;
  if (!ok) return;
  _savePlayerHelmetStickerTypes(customTypes.filter((item) => item.key !== sticker.key));
  renderCoachQuizSetupPage();
  showToast(`${sticker.label} removed from custom stickers.`, { type: "success" });
}

function _readCoachQuizSettingNumber(id) {
  const el = document.getElementById(id);
  return el ? el.value : undefined;
}

function _readCoachQuizSettingText(id) {
  const el = document.getElementById(id);
  return el ? el.value : undefined;
}

function coachSaveQuizSettings() {
  const enabledQuestionTypes = [
    ["coachQuizTypeResponsibility", "responsibility"],
    ["coachQuizTypeRuleToPlay", "play_from_rule"],
    ["coachQuizTypeDiagram", "diagram"],
    ["coachQuizTypeSignal", "signal"],
    ["coachQuizTypeCall", "call"],
  ]
    .filter(([id]) => document.getElementById(id)?.checked)
    .map(([, value]) => value);
  const settings = _savePlayerQuizSettings({
    weeklyGoal: _readCoachQuizSettingNumber("coachQuizWeeklyGoal"),
    baseCorrectPoints: _readCoachQuizSettingNumber("coachQuizBaseCorrectPoints"),
    minBonusAnswers: _readCoachQuizSettingNumber("coachQuizMinBonusAnswers"),
    scriptWeight: _readCoachQuizSettingNumber("coachQuizScriptWeight"),
    gameplanWeight: _readCoachQuizSettingNumber("coachQuizGameplanWeight"),
    honorRollMin: _readCoachQuizSettingNumber("coachQuizHonorRollMin"),
    honorRollBonus: _readCoachQuizSettingNumber("coachQuizHonorRollBonus"),
    highHonorRollMin: _readCoachQuizSettingNumber("coachQuizHighHonorRollMin"),
    highHonorRollBonus: _readCoachQuizSettingNumber("coachQuizHighHonorRollBonus"),
    coachesListMin: _readCoachQuizSettingNumber("coachQuizCoachesListMin"),
    coachesListBonus: _readCoachQuizSettingNumber("coachQuizCoachesListBonus"),
    questionPoints: _readCoachQuizSettingNumber("coachQuizQuestionPoints"),
    answerPoints: _readCoachQuizSettingNumber("coachQuizAnswerPoints"),
    giftPoints: _readCoachQuizSettingNumber("coachQuizGiftPoints"),
    dailyRewardCap: _readCoachQuizSettingNumber("coachQuizDailyRewardCap"),
    weeklyRewardCap: _readCoachQuizSettingNumber("coachQuizWeeklyRewardCap"),
    enabledQuestionTypes,
    tierNames: {
      champion: _readCoachQuizSettingText("coachQuizTierChampion"),
      baller: _readCoachQuizSettingText("coachQuizTierBaller"),
      starter: _readCoachQuizSettingText("coachQuizTierStarter"),
      contributor: _readCoachQuizSettingText("coachQuizTierContributor"),
      defense: _readCoachQuizSettingText("coachQuizTierDefense"),
    },
  });
  const eligibleCategories = SIGNAL_GAME_CATEGORY_OPTIONS
    .filter((category) => document.getElementById(`coachSignalCategory${category.id}`)?.checked)
    .map((category) => category.id);
  const signalSettings = _saveSignalGameSettings({
    eligibleCategories: eligibleCategories.length ? eligibleCategories : SIGNAL_GAME_DEFAULT_SETTINGS.eligibleCategories,
    minClipCount: _readCoachQuizSettingNumber("coachSignalMinClipCount"),
    includeDraftForStaff: document.getElementById("coachSignalIncludeDraft")?.checked === true,
  });
  renderCoachQuizSetupPage();
  _renderPlayerQuizHub();
  if (isQuizPageActive()) renderQuizPage();
  showToast(`Quiz settings saved. Weekly goal is ${settings.weeklyGoal}; signal games unlock at ${signalSettings.minClipCount} clips.`, { type: "success" });
}

async function coachResetQuizSettings() {
  const ok = typeof showConfirm === "function"
    ? await showConfirm("Reset quiz goals, scoring, rewards, signal game controls, tiers, and question types to defaults?", {
      title: "Reset Quiz Settings",
      icon: "⚙️",
      confirmText: "Reset",
      cancelText: "Keep",
      danger: false,
    })
    : true;
  if (!ok) return;
  _savePlayerQuizSettings(PLAYER_QUIZ_DEFAULT_SETTINGS);
  _saveSignalGameSettings(SIGNAL_GAME_DEFAULT_SETTINGS);
  renderCoachQuizSetupPage();
  _renderPlayerQuizHub();
  if (isQuizPageActive()) renderQuizPage();
  showToast("Quiz settings reset.", { type: "success" });
}

async function setCoachQuizSourceState(arg = "") {
  const [kind, ...rest] = String(arg || "").split(":");
  const state = rest.pop();
  const id = rest.join(":");
  if (!["script", "gameplan"].includes(kind) || !id || !["available", "locked", "coach"].includes(state)) {
    showToast("Could not update quiz source.", { type: "warning" });
    return;
  }
  _setQuizSourceState(kind, id, state);
  if (kind === "script" && typeof getSavedScripts === "function" && typeof storageManager !== "undefined") {
    const saved = getSavedScripts();
    const target = saved.find((scriptRecord) => String(scriptRecord?.id || "") === id);
    if (target) {
      target.playerVisible = state !== "coach";
      if (target.playerVisible) {
        target.playerPublishedAt = new Date().toISOString();
      } else {
        target.playerUnpublishedAt = new Date().toISOString();
      }
      storageManager.set(STORAGE_KEYS.SAVED_SCRIPTS, saved);
      if (typeof recordPlayerPublishStatus === "function") {
        await recordPlayerPublishStatus("scripts", {
          updatedAt: target.playerVisible ? target.playerPublishedAt : target.playerUnpublishedAt,
          label: target.playerVisible
            ? (target.name || "Practice script")
            : `${target.name || "Practice script"} removed from player logins`,
          id: target.id || "",
          visibility: target.playerVisible ? "published" : "unpublished",
        }, { awaitCompletion: true });
      }
      if (typeof loadSavedScriptsList === "function") loadSavedScriptsList();
      if (typeof renderPlayerScriptLauncher === "function") renderPlayerScriptLauncher();
    }
  }
  renderCoachQuizSetupPage();
  _renderPlayerQuizHub();
  showToast(`Quiz source set to ${state === "coach" ? "coach-only" : state}.`, { type: "success" });
}

async function coachAwardQuestionPoints(type = "question") {
  const safeType = ["question", "answer", "gift"].includes(type) ? type : "question";
  const player = await _coachPromptRewardPlayer(_leaderboardSelectedPlayer || "");
  if (!player) return;
  const settings = _getPlayerQuizSettings();
  const now = new Date();
  const events = _getPlayerRewardEvents();
  const dateKey = _quizDateKey(now);
  const weekKey = _quizWeekKey(now);
  const playerEvents = events.filter((event) => _normalizeQuizPlayerName(event.player) === _normalizeQuizPlayerName(player));
  const dailyUsed = _sumQuizRewards(playerEvents.filter((event) => event.dateKey === dateKey));
  const weeklyUsed = _sumQuizRewards(playerEvents.filter((event) => event.weekKey === weekKey));
  const dailyRemaining = settings.dailyRewardCap ? Math.max(0, settings.dailyRewardCap - dailyUsed) : 500;
  const weeklyRemaining = settings.weeklyRewardCap ? Math.max(0, settings.weeklyRewardCap - weeklyUsed) : 500;
  const capRemaining = Math.min(500, dailyRemaining, weeklyRemaining);
  if (capRemaining <= 0) {
    showToast(`${player} is at the reward point cap.`, { type: "warning" });
    return;
  }
  const rewardDefaults = _getQuizRewardDefaults();
  const defaultPoints = Math.min(capRemaining, rewardDefaults[safeType] || 25);
  const rawPoints = typeof showPrompt === "function"
    ? await showPrompt("How many points?", String(defaultPoints), {
      title: "Award Points",
      icon: "🏆",
      placeholder: String(defaultPoints),
    })
    : String(defaultPoints);
  if (rawPoints === null) return;
  const requestedPoints = Math.max(0, Math.min(500, Math.round(Number(rawPoints) || defaultPoints)));
  const points = Math.min(requestedPoints, capRemaining);
  if (points <= 0) {
    showToast("No points were awarded.", { type: "info" });
    return;
  }
  const note = typeof showPrompt === "function"
    ? await showPrompt("Optional note for the player", "", {
      title: "Reward Note",
      icon: "✍️",
      placeholder: safeType === "question" ? "Great question in install." : "Helped a teammate understand the rule.",
    })
    : "";
  if (note === null) return;
  events.push({
    id: _quizEventId("reward"),
    player,
    type: safeType,
    label: safeType === "gift" ? "Coach Gift" : safeType === "answer" ? "Teammate Answer" : "Football Question",
    points,
    note: String(note || "").trim(),
    awardedBy: _quizCurrentCoachName(),
    createdAt: now.toISOString(),
    dateKey,
    weekKey,
  });
  _savePlayerRewardEvents(events);
  _leaderboardSelectedPlayer = player;
  renderCoachQuizSetupPage();
  if (isQuizPageActive()) renderQuizPage();
  showToast(`${player} earned ${points} points${points < requestedPoints ? " after cap" : ""}.`, { type: "success" });
}

function _quizRewardCapRemainingForPlayer(player, dateKey, weekKey) {
  const settings = _getPlayerQuizSettings();
  const playerEvents = _getPlayerRewardEvents()
    .filter((event) => _isQuizRewardApproved(event))
    .filter((event) => _normalizeQuizPlayerName(event.player) === _normalizeQuizPlayerName(player));
  const dailyUsed = _sumQuizRewards(playerEvents.filter((event) => event.dateKey === dateKey));
  const weeklyUsed = _sumQuizRewards(playerEvents.filter((event) => event.weekKey === weekKey));
  const dailyRemaining = settings.dailyRewardCap ? Math.max(0, settings.dailyRewardCap - dailyUsed) : 500;
  const weeklyRemaining = settings.weeklyRewardCap ? Math.max(0, settings.weeklyRewardCap - weeklyUsed) : 500;
  return Math.min(500, dailyRemaining, weeklyRemaining);
}

async function coachStageDiscussionReward(arg = "") {
  const [postId, rawType] = String(arg || "").split("::");
  const safeType = rawType === "answer" ? "answer" : "question";
  const postEl = document.getElementById(`disc-post-${postId}`);
  if (!postEl || typeof _discIsStaff !== "function" || !_discIsStaff()) {
    showToast("Could not stage that discussion reward.", { type: "warning" });
    return;
  }
  const authorName = postEl.dataset.authorName || "";
  const rosterPlayer = _getQuizRosterPlayerByName(authorName);
  const player = rosterPlayer?.name || await _coachPromptRewardPlayer(authorName);
  if (!player) return;
  const existing = _getPlayerRewardEvents().find((event) =>
    event.source === "discussion" &&
    String(event.sourcePostId || "") === String(postId || "") &&
    event.type === safeType
  );
  if (existing) {
    showToast(existing.status === "pending_approval" ? "That reward is already pending approval." : "That discussion reward is already recorded.", { type: "info" });
    return;
  }
  const defaults = _getQuizRewardDefaults();
  const points = Math.max(0, Math.round(Number(defaults[safeType] || 0)));
  if (!points) {
    showToast("That reward type is set to 0 points.", { type: "warning" });
    return;
  }
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Stage ${points} ${safeType === "answer" ? "answer" : "question"} points for ${player}? Approval is required before it counts on the leaderboard.`, {
      title: "Stage Discussion Reward",
      icon: "🏆",
      confirmText: "Stage",
      cancelText: "Cancel",
      danger: false,
    })
    : true;
  if (!ok) return;
  const now = new Date();
  const playId = postEl.closest("[data-play-id]")?.dataset?.playId || "";
  const events = _getPlayerRewardEvents();
  events.push({
    id: _quizEventId("reward"),
    player,
    type: safeType,
    label: safeType === "answer" ? "Discussion Answer" : "Discussion Question",
    points,
    note: (postEl.dataset.bodyText || "").slice(0, 120),
    awardedBy: _quizCurrentCoachName(),
    source: "discussion",
    sourcePostId: postId,
    sourcePlayId: playId,
    status: "pending_approval",
    createdAt: now.toISOString(),
    dateKey: _quizDateKey(now),
    weekKey: _quizWeekKey(now),
  });
  _savePlayerRewardEvents(events);
  _leaderboardSelectedPlayer = player;
  postEl.classList.add("disc-post--reward-pending");
  showToast(`${player}'s ${safeType} reward is pending approval.`, { type: "success" });
  if (document.getElementById("coachQuizSetupPage")?.offsetParent !== null) renderCoachQuizSetupPage();
}

async function coachApproveQuizReward(rewardId = "") {
  const events = _getPlayerRewardEvents();
  const reward = events.find((event) => String(event.id || "") === String(rewardId || ""));
  if (!reward) {
    showToast("That reward is no longer available.", { type: "warning" });
    return;
  }
  if (_isQuizRewardApproved(reward)) {
    showToast("That reward is already approved.", { type: "info" });
    return;
  }
  const remaining = _quizRewardCapRemainingForPlayer(reward.player, reward.dateKey, reward.weekKey);
  if (remaining <= 0) {
    showToast(`${_normalizeQuizPlayerName(reward.player)} is at the reward point cap.`, { type: "warning" });
    return;
  }
  const originalPoints = Math.round(Number(reward.points || 0));
  const approvedPoints = Math.min(originalPoints, remaining);
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Approve ${approvedPoints} points for ${_normalizeQuizPlayerName(reward.player)}?`, {
      title: "Approve Reward",
      icon: "✅",
      confirmText: "Approve",
      cancelText: "Keep Pending",
      danger: false,
    })
    : true;
  if (!ok) return;
  reward.status = "approved";
  reward.points = approvedPoints;
  reward.approvedAt = new Date().toISOString();
  reward.approvedBy = _quizCurrentCoachName();
  _savePlayerRewardEvents(events);
  _leaderboardSelectedPlayer = _normalizeQuizPlayerName(reward.player);
  renderCoachQuizSetupPage();
  if (isQuizPageActive()) renderQuizPage();
  showToast(`Approved ${approvedPoints} points for ${_normalizeQuizPlayerName(reward.player)}${approvedPoints < originalPoints ? " after cap" : ""}.`, { type: "success" });
}

async function coachRevokeQuizReward(rewardId = "") {
  const events = _getPlayerRewardEvents();
  const reward = events.find((event) => String(event.id || "") === String(rewardId || ""));
  if (!reward) {
    showToast("That reward is no longer available.", { type: "warning" });
    return;
  }
  const player = _normalizeQuizPlayerName(reward.player);
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Remove ${Math.round(Number(reward.points || 0))} ${_formatQuizQuestionType(reward.type || "reward").toLowerCase()} points from ${player}?`, {
      title: "Revoke Reward",
      icon: "↩️",
      confirmText: "Revoke",
      cancelText: "Keep",
      danger: true,
    })
    : false;
  if (!ok) return;
  _savePlayerRewardEvents(events.filter((event) => String(event.id || "") !== String(rewardId || "")));
  _leaderboardSelectedPlayer = player;
  renderCoachQuizSetupPage();
  if (isQuizPageActive()) renderQuizPage();
  showToast(`Reward removed for ${player}.`, { type: "success" });
}

async function coachAwardHelmetSticker(stickerKey = "") {
  const sticker = _getPlayerHelmetStickerType(stickerKey) || _getPlayerHelmetStickerTypes()[0];
  const player = await _coachPromptRewardPlayer(_leaderboardSelectedPlayer || "");
  if (!player) return;
  const note = typeof showPrompt === "function"
    ? await showPrompt("Optional sticker note", "", {
      title: sticker.label,
      icon: sticker.icon,
      placeholder: "Why did they earn it?",
    })
    : "";
  if (note === null) return;
  const now = new Date();
  const stickers = _getPlayerHelmetStickers();
  stickers.push({
    id: _quizEventId("sticker"),
    player,
    stickerKey: sticker.key,
    label: sticker.label,
    icon: sticker.icon,
    color: sticker.color,
    description: sticker.description || "",
    note: String(note || "").trim(),
    awardedBy: _quizCurrentCoachName(),
    context: "Practice",
    createdAt: now.toISOString(),
    dateKey: _quizDateKey(now),
    weekKey: _quizWeekKey(now),
  });
  _savePlayerHelmetStickers(stickers);
  _leaderboardSelectedPlayer = player;
  renderCoachQuizSetupPage();
  if (isQuizPageActive()) renderQuizPage();
  showToast(`${player} earned ${sticker.label}.`, { type: "success" });
}

async function coachRevokeHelmetStickerAward(stickerId = "") {
  const stickers = _getPlayerHelmetStickers();
  const sticker = stickers.find((event) => String(event.id || "") === String(stickerId || ""));
  if (!sticker) {
    showToast("That sticker award is no longer available.", { type: "warning" });
    return;
  }
  const player = _normalizeQuizPlayerName(sticker.player);
  const ok = typeof showConfirm === "function"
    ? await showConfirm(`Remove "${sticker.label || "Helmet Sticker"}" from ${player}'s profile?`, {
      title: "Revoke Sticker",
      icon: sticker.icon || "🏅",
      confirmText: "Revoke",
      cancelText: "Keep",
      danger: true,
    })
    : false;
  if (!ok) return;
  _savePlayerHelmetStickers(stickers.filter((event) => String(event.id || "") !== String(stickerId || "")));
  _leaderboardSelectedPlayer = player;
  renderCoachQuizSetupPage();
  if (isQuizPageActive()) renderQuizPage();
  showToast(`${sticker.label || "Sticker"} removed for ${player}.`, { type: "success" });
}

function renderCoachQuizSetupPage() {
  const page = document.getElementById("coachQuizSetupPage");
  if (!page) return;
  const currentUser = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  if (currentUser?.role === "player") {
    page.innerHTML = "";
    return;
  }
  if (window.playImages && typeof window.playImages.loadKeys === "function") {
    window.playImages.loadKeys().catch(() => { });
  }
  const scripts = _getCoachQuizScriptSources();
  const gamePlans = _getCoachQuizGamePlanSources();
  const allStats = [...scripts.map((s) => _quizCompletenessStats(s.plays)), ...gamePlans.map((g) => _quizCompletenessStats(g.plays))];
  const avgScore = allStats.length
    ? Math.round(allStats.reduce((sum, stats) => sum + stats.score, 0) / allStats.length)
    : 0;
  const readyCount = allStats.filter((stats) => stats.score >= 88).length;
  const rewardEvents = _getPlayerRewardEvents();
  const stickers = _getPlayerHelmetStickers();
  const weekKey = _quizWeekKey(new Date());
  const weeklyRewardEvents = rewardEvents.filter((event) => event.weekKey === weekKey);
  const weeklyStickerEvents = stickers.filter((event) => event.weekKey === weekKey);
  const leaderboardSummary = _buildCoachQuizLeaderboardSummary();
  const quizSettings = _getPlayerQuizSettings();
  const rosterHealthSummary = _buildCoachQuizRosterHealthSummary();
  if (!_leaderboardSelectedPlayer && leaderboardSummary.rows[0]?.name) {
    _leaderboardSelectedPlayer = leaderboardSummary.rows[0].name;
  }

  setInnerHTML(page, `
    <div class="coach-quiz-setup-shell">
      <section class="coach-quiz-setup-hero">
        <div>
          <span class="coach-quiz-kicker">Set Up Quizzes</span>
          <h2>Make every quiz source player-ready</h2>
          <p>Check whether scripts and game plans have enough diagrams, rules, notes, and metadata for kids to learn from the quiz instead of guessing.</p>
        </div>
        <div class="coach-quiz-hero-score">
          <strong>${avgScore}</strong>
          <span>${readyCount}/${allStats.length || 0} ready</span>
        </div>
      </section>
      ${_renderCoachQuizSettingsPanel(quizSettings)}
      ${typeof renderCoachQuizAssignmentsPanel === "function" ? renderCoachQuizAssignmentsPanel() : ""}
      ${_renderCoachQuizRosterHealthPanel(rosterHealthSummary)}
      <section class="coach-quiz-reward-panel">
        <article>
          <span>Question points</span>
          <strong>Incentivize asking</strong>
          <p>Award weekly points for good questions so players learn that asking is part of preparation.</p>
          <button type="button" class="btn btn-primary" data-action="coachAwardQuestionPoints" data-arg="question">Award Question</button>
        </article>
        <article>
          <span>Gifted points</span>
          <strong>Reward teammates</strong>
          <p>Give answer or bonus points when a player helps a teammate understand a call, rule, or adjustment.</p>
          <div class="coach-quiz-reward-actions">
            <button type="button" class="btn btn-outline" data-action="coachAwardQuestionPoints" data-arg="answer">Answer Points</button>
            <button type="button" class="btn btn-outline" data-action="coachAwardQuestionPoints" data-arg="gift">Gift Points</button>
          </div>
        </article>
        <article>
          <span>Helmet stickers</span>
          <strong>Post-practice awards</strong>
          <p>Award stickers after practice. Players see them when their leaderboard name is opened.</p>
          <button type="button" class="btn btn-outline coach-quiz-custom-sticker-btn" data-action="coachCreateHelmetSticker">+ Custom Sticker</button>
          <div class="coach-quiz-sticker-grid">${_renderCoachStickerButtons()}</div>
          ${_renderCoachCustomStickerManager()}
        </article>
      </section>
      <section class="coach-quiz-setup-section">
        <div class="coach-quiz-section-head">
          <h3>This week's rewards</h3>
          <span>${weeklyRewardEvents.length} point awards · ${weeklyStickerEvents.length} stickers</span>
        </div>
        <div class="coach-quiz-reward-summary">
          <span><strong>${Math.round(_sumQuizRewards(weeklyRewardEvents, "question"))}</strong><small>Question pts</small></span>
          <span><strong>${Math.round(_sumQuizRewards(weeklyRewardEvents, "answer"))}</strong><small>Answer pts</small></span>
          <span><strong>${Math.round(_sumQuizRewards(weeklyRewardEvents, "gift"))}</strong><small>Gift pts</small></span>
          <span><strong>${weeklyStickerEvents.length}</strong><small>Stickers</small></span>
        </div>
      </section>
      ${_renderCoachQuizAwardHistoryPanel(weeklyRewardEvents, weeklyStickerEvents)}
      ${_renderCoachQuizLeaderboardPanel(leaderboardSummary)}
      ${_renderCoachQuizPositionPicker()}
      <section class="coach-quiz-setup-section">
        <div class="coach-quiz-section-head">
          <h3>Practice scripts</h3>
          <span>${scripts.length} saved</span>
        </div>
        <div class="coach-quiz-source-grid">
          ${scripts.length
      ? scripts.map((source) => _renderCoachQuizSourceCard(source, "script")).join("")
      : `<div class="coach-quiz-empty">No saved practice scripts yet.</div>`}
        </div>
      </section>
      <section class="coach-quiz-setup-section">
        <div class="coach-quiz-section-head">
          <h3>Game plans</h3>
          <span>${gamePlans.length} boards</span>
        </div>
        <div class="coach-quiz-source-grid">
          ${gamePlans.length
      ? gamePlans.map((source) => _renderCoachQuizSourceCard(source, "gameplan")).join("")
      : `<div class="coach-quiz-empty">No game plans with plays yet.</div>`}
        </div>
      </section>
    </div>
  `);
  page.querySelectorAll(".coach-quiz-metric i b").forEach((bar) => {
    const width = bar.dataset.pct || "0";
    bar.style.width = `${Math.max(0, Math.min(100, Number(width) || 0))}%`;
  });
}
