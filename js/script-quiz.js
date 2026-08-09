function _buildQuizPlays(shuffled) {
  const items = [];
  let currentPeriod = "";
  script.forEach((item, scriptIndex) => {
    if (item.isSeparator) {
      currentPeriod = item.label || "";
    } else {
      items.push({ play: item, period: currentPeriod, scriptIndex });
    }
  });
  if (shuffled) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
  return items;
}

function _normalizeQuizItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      if (!item) return null;
      if (item.play && typeof item.play === "object") {
        return {
          play: item.play,
          period: item.period || "",
          scriptIndex: item.scriptIndex ?? index,
          sourceBox: item.sourceBox || "",
          positionKey: item.positionKey || "",
          signalRecord: item.signalRecord || null,
          customQuestion: item.customQuestion || null,
        };
      }
      return {
        play: item,
        period: "",
        scriptIndex: index,
        sourceBox: "",
        positionKey: "",
      };
    })
    .filter((item) => item && item.play && !item.play.isSeparator);
}

function _setQuizPlays(items, shuffled = false) {
  _quizBasePlays = _normalizeQuizItems(items);
  _quizPlays = shuffled ? _quizShuffle(_quizBasePlays) : _quizBasePlays.slice();
}

function _getQuizPositions() {
  if (typeof getPlayPresentationPositions === "function") {
    return getPlayPresentationPositions();
  }
  return [
    { key: "respQ", label: "Q" },
    { key: "respT", label: "T" },
    { key: "respH", label: "H" },
    { key: "respZ", label: "Z" },
    { key: "respX", label: "X" },
    { key: "respY", label: "Y" },
    { key: "respLT", label: "LT" },
    { key: "respLG", label: "LG" },
    { key: "respC", label: "C" },
    { key: "respRG", label: "RG" },
    { key: "respRT", label: "RT" },
  ];
}

function _getQuizPosition(key = _quizPositionKey) {
  return _getQuizPositions().find((position) => position.key === key) || _getQuizPositions()[0];
}

function _normalizeQuizPositionMode(mode = "") {
  const value = String(mode || "").trim();
  return ["primary", "secondary", "mix", "random-skill", "random-line", "manual"].includes(value)
    ? value
    : "primary";
}

function _quizRosterPositionToKey(position = "") {
  const raw = String(position || "").trim().toUpperCase();
  const aliases = {
    QB: "respQ",
    Q: "respQ",
    RB: "respT",
    T: "respT",
    TB: "respT",
    HB: "respT",
    FB: "respH",
    H: "respH",
    Z: "respZ",
    X: "respX",
    Y: "respY",
    LT: "respLT",
    LG: "respLG",
    C: "respC",
    RG: "respRG",
    RT: "respRT",
  };
  const key = aliases[raw] || "";
  return _getQuizPositions().some((positionOption) => positionOption.key === key) ? key : "";
}

function _quizPositionKeyIsLine(key = "") {
  return ["respLT", "respLG", "respC", "respRG", "respRT"].includes(String(key || ""));
}

function _quizUniquePositionKeys(keys = []) {
  const available = new Set(_getQuizPositions().map((position) => position.key));
  return [...new Set(keys.map((key) => String(key || "").trim()).filter((key) => available.has(key)))];
}

function _getCurrentQuizRosterPositionKeys() {
  const rosterPlayer = _getQuizRosterPlayerForCurrentUser();
  const primary = _quizRosterPositionToKey(rosterPlayer?.primaryPosition || rosterPlayer?.position || "");
  const secondary = _quizRosterPositionToKey(rosterPlayer?.secondaryPosition || "");
  return { primary, secondary };
}

function _getQuizPositionModeOptions() {
  const rosterKeys = _getCurrentQuizRosterPositionKeys();
  const primaryLabel = rosterKeys.primary ? _getQuizPosition(rosterKeys.primary)?.label : "Primary";
  const secondaryLabel = rosterKeys.secondary ? _getQuizPosition(rosterKeys.secondary)?.label : "";
  return [
    {
      value: "primary",
      label: rosterKeys.primary ? `Roster primary (${primaryLabel})` : "Roster primary",
      hint: rosterKeys.primary ? "Use the primary position linked to your roster account." : "Link this account to a roster player to auto-fill primary.",
    },
    {
      value: "secondary",
      label: rosterKeys.secondary ? `Roster secondary (${secondaryLabel})` : "Roster secondary",
      hint: rosterKeys.secondary ? "Use the secondary position linked to your roster account." : "Add a secondary position on the roster to unlock this.",
      disabled: !rosterKeys.secondary,
    },
    {
      value: "mix",
      label: rosterKeys.secondary ? `Mix ${primaryLabel} + ${secondaryLabel}` : "Mix primary + secondary",
      hint: rosterKeys.secondary ? "Rotate questions between both roster positions." : "Needs a secondary roster position; falls back to primary.",
    },
    {
      value: "random-skill",
      label: "Random skill",
      hint: "Shuffle between Q, T/RB, H, X, Z, and Y rules.",
    },
    {
      value: "random-line",
      label: "Random line",
      hint: "Shuffle between LT, LG, C, RG, and RT rules.",
    },
    {
      value: "manual",
      label: "Manual chips",
      hint: "Tap a position chip below to lock the quiz to one rule column.",
    },
  ];
}

function _getQuizPositionModeLabel(mode = _quizPositionMode) {
  const normalized = _normalizeQuizPositionMode(mode);
  const option = _getQuizPositionModeOptions().find((entry) => entry.value === normalized);
  return option?.label || _getQuizPosition()?.label || "Position";
}

function _resolveQuizPositionKeysForMode(mode = _quizPositionMode) {
  const normalized = _normalizeQuizPositionMode(mode);
  const rosterKeys = _getCurrentQuizRosterPositionKeys();
  const allKeys = _getQuizPositions().map((position) => position.key);
  const lineKeys = allKeys.filter(_quizPositionKeyIsLine);
  const skillKeys = allKeys.filter((key) => !_quizPositionKeyIsLine(key));
  if (normalized === "secondary") {
    return _quizUniquePositionKeys([rosterKeys.secondary, rosterKeys.primary, _quizPositionKey]);
  }
  if (normalized === "mix") {
    return _quizUniquePositionKeys([rosterKeys.primary, rosterKeys.secondary, _quizPositionKey]);
  }
  if (normalized === "random-skill") return skillKeys;
  if (normalized === "random-line") return lineKeys;
  if (normalized === "manual") return _quizUniquePositionKeys([_quizPositionKey]);
  return _quizUniquePositionKeys([rosterKeys.primary, _quizPositionKey]);
}

function _syncPlayerQuizPositionDefault() {
  _quizPositionMode = _normalizeQuizPositionMode(_quizPositionMode);
  const keys = _resolveQuizPositionKeysForMode(_quizPositionMode);
  if (keys.length) _quizPositionKey = keys[0];
}

function _prepareQuizItemsForPositionMode(items, mode = _quizPositionMode) {
  const normalizedMode = _normalizeQuizPositionMode(mode);
  const candidates = _resolveQuizPositionKeysForMode(normalizedMode);
  const fallback = _getQuizPosition(_quizPositionKey)?.key || "respQ";
  const keys = candidates.length ? candidates : [fallback];
  const randomMode = normalizedMode === "random-skill" || normalizedMode === "random-line";
  const prepared = _normalizeQuizItems(items).map((item, index) => {
    if (item.customQuestion) return { ...item, positionKey: "" };
    const keysWithRules = keys.filter((key) => _quizCleanText(item.play?.[key] || ""));
    const pool = keysWithRules.length ? keysWithRules : keys;
    const positionKey = randomMode
      ? pool[Math.floor(Math.random() * pool.length)]
      : pool[index % pool.length];
    return { ...item, positionKey };
  });
  if (prepared[0]?.positionKey) _quizPositionKey = prepared[0].positionKey;
  return prepared;
}

function _getQuizPositionForItem(item) {
  return _getQuizPosition(item?.positionKey || _quizPositionKey);
}

function _getPlayerQuizScriptOptions() {
  const savedScripts = typeof getSavedScripts === "function" ? getSavedScripts() : [];
  return (Array.isArray(savedScripts) ? savedScripts : [])
    .filter((savedScript) => savedScript && savedScript.id)
    .map((savedScript) => {
      const stats = typeof getSavedScriptStats === "function" ? getSavedScriptStats(savedScript) : null;
      const quizStats = _quizCompletenessStats(savedScript.plays || []);
      const availability = typeof getPlayerQuizSourceAvailability === "function"
        ? getPlayerQuizSourceAvailability("script", savedScript.id, savedScript)
        : { available: savedScript.playerVisible && _getQuizSourceState("script", savedScript) === "available" };
      const state = availability.state || _getQuizSourceState("script", savedScript);
      const option = {
        id: String(savedScript.id),
        name: savedScript.name || "Published Practice",
        playCount: stats?.playCount || 0,
        periodCount: stats?.periodCount || 0,
        totalReps: stats?.totalReps || 0,
        date: savedScript.date || "",
        dateStr: stats?.dateStr || savedScript.date || "No date",
        state,
        availabilityReason: availability.reason || "",
        quizStats,
        readiness: _quizReadinessLabel(quizStats.score),
        playerSelectable: Boolean(availability.available),
        playerVisible: Boolean(savedScript.playerVisible),
      };
      return {
        ...option,
        progress: _getQuizScriptProgress(option),
      };
    })
    .filter((option) => option.playerVisible && option.state !== "coach");
}

function _getPlayerQuizSelectedScriptRecord() {
  const id = String(_playerQuizSelectedScriptId || "");
  const savedScripts = typeof getSavedScripts === "function" ? getSavedScripts() : [];
  return (Array.isArray(savedScripts) ? savedScripts : []).find((savedScript) => String(savedScript?.id || "") === id) || null;
}

function _quizItemHasDiagram(itemOrPlay) {
  const play = itemOrPlay?.play || itemOrPlay;
  return Boolean(
    play &&
    window.playImages &&
    typeof window.playImages.hasForPlay === "function" &&
    window.playImages.hasForPlay(play)
  );
}

// A player can legitimately have a published diagram that has not been cached
// on this particular phone yet.  Local IndexedDB is therefore not allowed to
// decide whether Diagram Flash Cards exist; it only tells us whether the image
// is already warm. The launch preflight below verifies the cloud copy before a
// flash-card round begins.
function _quizItemMayHaveDiagram(itemOrPlay) {
  const play = itemOrPlay?.play || itemOrPlay;
  if (!play) return false;
  if (_quizItemHasDiagram(play)) return true;
  const mediaId = typeof getPlayMediaId === "function"
    ? getPlayMediaId(play)
    : String(play.mediaId || "").trim();
  const cached = window.playImages && typeof window.playImages.getCachedRemoteManifestForPlay === "function"
    ? window.playImages.getCachedRemoteManifestForPlay(play)
    : null;
  return Boolean(cached?.published || mediaId);
}

async function _resolveDiagramFlashItems(items) {
  const candidates = _normalizeQuizItems(items).filter(_quizItemMayHaveDiagram);
  if (!candidates.length || !window.playImages || typeof window.playImages.ensureDisplayReadinessForPlay !== "function") {
    return [];
  }
  const settled = await Promise.allSettled(candidates.map(async (item) => {
    const readiness = await window.playImages.ensureDisplayReadinessForPlay(item.play);
    return readiness?.url ? item : null;
  }));
  return settled.map((result) => result.status === "fulfilled" ? result.value : null).filter(Boolean).slice(0, 8);
}

function _quizItemHasPositionRule(itemOrPlay, key = _quizPositionKey) {
  const play = itemOrPlay?.play || itemOrPlay;
  const keys = _resolveQuizPositionKeysForMode(_quizPositionMode);
  const candidates = key ? [key, ...keys] : keys;
  return candidates.some((positionKey) => _quizCleanText(play?.[positionKey] || ""));
}

function _getRecentMissedQuizItems(limit = 5, options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const dueOnly = opts.dueOnly !== false;
  const todayKey = opts.todayKey || _quizDateKey(new Date());
  const attempts = _getPlayerQuizAttempts()
    .filter((attempt) => _quizPlayerNameFromAttempt(attempt, _getQuizPlayerName()) === _getQuizPlayerName())
    .sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  const sourcePlays = [
    ...(_getPlayerQuizSelectedScriptRecord()?.plays || []),
    ..._buildGamePlanQuizItems().map((item) => item.play),
    ...((Array.isArray(script) ? script : []).filter((play) => play && !play.isSeparator)),
    ...((Array.isArray(plays) ? plays : [])),
  ];
  const seen = new Set();
  const out = [];
  attempts.forEach((attempt) => {
    const completedDate = attempt.completedAt ? new Date(attempt.completedAt) : null;
    const attemptDateKey = attempt.dateKey || (completedDate && !Number.isNaN(completedDate.getTime()) ? _quizDateKey(completedDate) : todayKey);
    const dueDateKey = _quizAddDaysKey(attemptDateKey, 1);
    if (dueOnly && dueDateKey > todayKey) return;
    (Array.isArray(attempt.reviewRows) ? attempt.reviewRows : []).forEach((row) => {
      if (row.correct) return;
      const call = _quizCleanText(row.playCall || row.correctLabel || "");
      if (!call || seen.has(call.toLowerCase())) return;
      const match = sourcePlays.find((play) => play && _quizPlainCall(play).toLowerCase() === call.toLowerCase());
      if (!match) return;
      seen.add(call.toLowerCase());
      out.push({ play: match, period: dueOnly ? "Spaced Review" : "Missed Plays", scriptIndex: out.length, dueDateKey });
    });
  });
  return out.slice(0, limit);
}

function _getPlayerQuizModes(context = {}) {
  const scriptSource = context.scriptSource || _getPlayerQuizSelectedScriptRecord();
  const scriptItems = _normalizeQuizItems(scriptSource?.plays || []);
  const gamePlanStatus = context.gamePlanStatus || _getActiveGamePlanQuizStatus();
  const signalStatus = context.signalStatus || _getSignalQuizStatus();
  const signalFullCallCount = Number(signalStatus.fullCallCount || 0);
  const hasDiagram = scriptItems.some(_quizItemMayHaveDiagram);
  const hasRules = scriptItems.some((item) => _quizItemHasPositionRule(item));
  const missedItems = _getRecentMissedQuizItems(5);
  return [
    {
      key: "quick",
      label: "Quick Hits",
      time: "5 plays",
      note: "Fast mixed reps from the selected source.",
      source: "script",
      disabled: !scriptItems.length,
    },
    {
      key: "diagram",
      label: "Diagram Drill",
      time: hasDiagram ? "Visual" : "Fallback",
      note: hasDiagram ? "Start with plays that have diagrams." : "No diagrams yet; falls back to mixed reps.",
      source: "script",
      disabled: !scriptItems.length,
    },
    {
      key: "diagram-flash",
      label: "Diagram Flash Cards",
      time: hasDiagram ? "Flip" : "Needs diagrams",
      note: hasDiagram ? "See the redacted diagram, name the call, then flip to check yourself. Published media is verified before the round begins." : "Add and publish diagrams to this script to unlock flash cards.",
      source: "script",
      disabled: !hasDiagram,
    },
    {
      key: "job",
      label: "Know Your Job",
      time: hasRules ? "Rules" : "Fallback",
      note: hasRules ? "Focus on your position responsibilities." : "No position rules yet; falls back to easier reps.",
      source: "script",
      disabled: !scriptItems.length,
    },
    {
      key: "gameplan",
      label: "Game Plan Check",
      time: `${gamePlanStatus.stats?.playCount || 0} calls`,
      note: "Mixed questions from this week's plan.",
      source: "gameplan",
      disabled: !gamePlanStatus.available,
    },
    {
      key: "missed",
      label: "Missed Plays",
      time: `${missedItems.length || 0} due`,
      note: "Retry recent misses after feedback.",
      source: "script",
      disabled: !missedItems.length,
    },
    {
      key: "signal-study",
      label: "Signal Study",
      time: `${signalStatus.count || 0} clips`,
      note: "Watch a short signal clip and identify the component.",
      source: "signal",
      disabled: !signalStatus.available,
    },
    {
      key: "signal-sprint",
      label: "100 Second Sprint",
      time: "100s",
      note: "Answer as many signal clips as you can before the clock expires.",
      source: "signal",
      disabled: !signalStatus.available,
    },
    {
      key: "signal-battle",
      label: "6 Seconds of Battle",
      time: "6s",
      note: "Watch the clip, then answer after it turns off.",
      source: "signal",
      disabled: !signalStatus.available,
    },
    {
      key: "signal-heat",
      label: "Heat Check",
      time: "Streak",
      note: "Keep answering signal clips until the first miss.",
      source: "signal",
      disabled: !signalStatus.available,
    },
    {
      key: "signal-full-call",
      label: "Full Play Call",
      time: `${signalFullCallCount} calls`,
      note: "Read a sequence of component signals and identify the full call.",
      source: "signal",
      disabled: !signalStatus.available || signalFullCallCount < 2,
    },
  ];
}

function _getPlayerQuizMode(key = _playerQuizSelectedMode) {
  return _getPlayerQuizModes().find((mode) => mode.key === key) || _getPlayerQuizModes()[0];
}

function _renderPlayerQuizModeCards() {
  const selectedSource = ["script", "gameplan", "signal"].includes(_playerQuizSelectedSource)
    ? _playerQuizSelectedSource
    : "script";
  const modes = _getPlayerQuizModes().filter((mode) => mode.source === selectedSource);
  if (!modes.some((mode) => mode.key === _playerQuizSelectedMode && !mode.disabled)) {
    _playerQuizSelectedMode = modes.find((mode) => !mode.disabled)?.key || "quick";
  }
  const visibleModes = modes.filter((mode) => !mode.disabled);
  return visibleModes.map((mode) => `
    <button type="button"
      class="player-quiz-mode-card${mode.key === _playerQuizSelectedMode ? " is-selected" : ""}${mode.disabled ? " is-disabled" : ""}"
      data-action="setPlayerQuizMode"
      data-arg="${escapeAttr(mode.key)}"
      aria-pressed="${mode.key === _playerQuizSelectedMode ? "true" : "false"}"
      ${mode.disabled ? "disabled" : ""}>
      <span>${escapeHtml(mode.time)}</span>
      <strong>${escapeHtml(mode.label)}</strong>
      <small>${escapeHtml(mode.note)}</small>
    </button>
  `).join("");
}

function _getPlayerQuizRecommendation(options = _getPlayerQuizScriptOptions()) {
  const selected = options.find((option) => option.id === _playerQuizSelectedScriptId && option.playerSelectable) ||
    options.find((option) => option.playerSelectable) || null;
  if (!selected) return null;
  const modes = _getPlayerQuizModes({ scriptSource: _getPlayerQuizSelectedScriptRecord() });
  const quick = modes.find((mode) => mode.key === "quick" && !mode.disabled);
  const mode = quick;
  if (!mode) return null;
  return {
    script: selected,
    mode,
    title: "Best next rep: Quick Hits",
    detail: `${selected.name} is ready for a fast five-play check. Choose another challenge type below if you want a focused rep.`,
    actionLabel: "Use Quick Hits",
  };
}

function startRecommendedPlayerQuiz() {
  const recommendation = _getPlayerQuizRecommendation();
  if (!recommendation) {
    showToast("Coach has not opened a practice quiz yet.", { type: "info" });
    return;
  }
  _playerQuizSelectedScriptId = recommendation.script.id;
  _playerQuizSelectedSource = "script";
  _playerQuizSelectedMode = recommendation.mode.key;
  _renderPlayerQuizHub();
}

function _renderSignalGameCategorySelector(status = _getSignalQuizStatus()) {
  const settings = _getSignalGameSettings(status);
  const eligibleOptions = SIGNAL_GAME_CATEGORY_OPTIONS.filter((category) => settings.eligibleCategories.includes(category.id));
  const selected = new Set(settings.categories);
  const selectedCount = selected.size;
  const multiplier = _getSignalCategoryMultiplier(settings.categories, settings.eligibleCategories);
  const countByCategory = new Map(
    (Array.isArray(status?.categories) ? status.categories : [])
      .map((category) => [String(category.id || "").trim().toUpperCase(), Number(category.count || 0)]),
  );
  const allSelected = eligibleOptions.length > 0 && selectedCount >= eligibleOptions.length;
  return `
    <div class="signal-game-category-panel" aria-label="Signal game categories">
      <div class="signal-game-category-head">
        <strong>Signal categories</strong>
        <span>${selectedCount || 0} selected · ${multiplier.toFixed(2)}x</span>
      </div>
      <div class="signal-game-category-grid">
        <button type="button"
          class="signal-game-category-chip signal-game-category-chip--all${allSelected ? " is-selected" : ""}"
          data-action="toggleSignalGameCategory"
          data-arg="ALL"
          aria-pressed="${allSelected ? "true" : "false"}">
          <span>All</span>
          <small>2x</small>
        </button>
        ${eligibleOptions.map((category) => {
    const checked = selected.has(category.id);
    const count = countByCategory.get(category.id) || 0;
    return `
            <button type="button"
              class="signal-game-category-chip${checked ? " is-selected" : ""}${!count ? " is-empty" : ""}"
              data-action="toggleSignalGameCategory"
              data-arg="${escapeAttr(category.id)}"
              aria-pressed="${checked ? "true" : "false"}">
              <span>${escapeHtml(category.label)}</span>
              <small>${count} clip${count === 1 ? "" : "s"}</small>
            </button>
          `;
  }).join("")}
      </div>
    </div>
  `;
}

function toggleSignalGameCategory(categoryId) {
  const id = String(categoryId || "").trim().toUpperCase();
  const current = _getSignalGameSettings(_getSignalQuizStatus());
  const eligible = current.eligibleCategories.length
    ? current.eligibleCategories
    : SIGNAL_GAME_CATEGORY_OPTIONS.map((category) => category.id);
  let categories = _normalizeSignalGameCategories(current.categories);
  if (id === "ALL") {
    categories = categories.length >= eligible.length
      ? [eligible[eligible.length - 1]]
      : eligible;
  } else {
    const allowed = eligible.includes(id);
    if (!allowed) return;
    categories = categories.includes(id)
      ? categories.filter((category) => category !== id)
      : [...categories, id];
    if (!categories.length) categories = [id];
  }
  _saveSignalGameSettings({ categories });
  _renderPlayerQuizHub();
}

function _prepareQuizItemsForMode(items, modeKey = _quizMode) {
  const normalized = _normalizeQuizItems(items);
  const mode = String(modeKey || "quick");
  if (mode === "diagram" || mode === "diagram-flash") {
    const withDiagrams = normalized.filter(_quizItemMayHaveDiagram);
    if (mode === "diagram-flash") return withDiagrams;
    return (withDiagrams.length ? withDiagrams : normalized).slice(0, 8);
  }
  if (mode === "job") {
    const withRules = normalized.filter((item) => _quizItemHasPositionRule(item));
    return (withRules.length ? withRules : normalized).slice(0, 8);
  }
  if (mode === "missed") {
    const missed = _getRecentMissedQuizItems(5);
    return missed.length ? missed : normalized.slice(0, 5);
  }
  if (mode === "quick") {
    const coachWritten = normalized.filter((item) => item.customQuestion);
    return [...normalized.filter((item) => !item.customQuestion).slice(0, 5), ...coachWritten];
  }
  return normalized;
}

function _quizModeTitle(baseTitle, modeKey = _playerQuizSelectedMode) {
  const mode = _getPlayerQuizModes().find((entry) => entry.key === modeKey);
  if (!mode || mode.key === "quick") return baseTitle;
  return `${mode.label}: ${baseTitle}`;
}

function _renderPlayerQuizScriptPicker(options) {
  if (!Array.isArray(options) || !options.length) {
    return `<div class="player-quiz-script-empty player-study-state">Current practice only. Published scripts will appear here when your coach posts them.</div>`;
  }
  const selectable = options.filter((option) => option.playerSelectable);
  if (!_playerQuizSelectedScriptId || !selectable.some((option) => option.id === _playerQuizSelectedScriptId)) {
    _playerQuizSelectedScriptId = selectable[0]?.id || "";
  }
  return options.map((option) => {
    const selected = option.id === _playerQuizSelectedScriptId;
    const progress = option.progress || _getQuizScriptProgress(option);
    const progressText = progress.points ? `${progress.label} · ${progress.points} pts` : progress.label;
    const locked = !option.playerSelectable;
    const stateLabel = option.state === "locked"
      ? "Locked"
      : option.state === "coach"
        ? "Coach-only"
        : option.availabilityReason === "needs-question-pair"
          ? "Needs 2 calls"
        : option.quizStats?.score < 40
          ? "Thin"
          : "";
    return `
      <button type="button"
        class="player-quiz-script-option${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}"
        data-action="setPlayerQuizScriptSource"
        data-arg="${escapeAttr(option.id)}"
        aria-pressed="${selected ? "true" : "false"}"
        ${locked ? "disabled" : ""}>
        <span class="player-quiz-script-option__main">
          <strong>${escapeHtml(option.name)}</strong>
          <small>${escapeHtml(option.dateStr)} · ${option.playCount} plays${option.periodCount ? ` · ${option.periodCount} periods` : ""}</small>
          ${_renderQuizCompletenessChips(option.quizStats, "quiz-completeness-chips player-quiz-source-chips")}
        </span>
        <span class="player-quiz-script-option__status">
          <b class="player-quiz-progress-badge${progress.icon ? " has-icon" : ""}">${escapeHtml(stateLabel || progressText)}</b>
        </span>
      </button>
    `;
  }).join("");
}

function _renderPlayerQuizHub() {
  const summary = _summarizeQuizAttempts();
  const settings = _getPlayerQuizSettings();
  const badgeFloor = Math.min(settings.honorRollMin, settings.highHonorRollMin, settings.coachesListMin);
  const weeklyPointsEl = document.getElementById("playerQuizWeeklyPoints");
  if (weeklyPointsEl) {
    weeklyPointsEl.textContent = `${Math.round(summary.weeklyPoints)} / ${settings.weeklyGoal}`;
  }
  const weeklyMetaEl = document.getElementById("playerQuizWeeklyMeta");
  if (weeklyMetaEl) {
    weeklyMetaEl.textContent = `${summary.weeklyAttempts.length} practice attempt${summary.weeklyAttempts.length === 1 ? "" : "s"} this week`;
  }
  const tierEl = document.getElementById("playerQuizCurrentTier");
  if (tierEl) tierEl.textContent = summary.tier;
  const tierMetaEl = document.getElementById("playerQuizTierMeta");
  if (tierMetaEl) {
    const remaining = Math.max(0, settings.weeklyGoal - summary.weeklyPoints);
    const achievement = _getQuizAchievementSummary(summary.weeklyPoints, settings);
    const championName = _getQuizTierName("champion", settings);
    tierMetaEl.textContent = remaining
      ? `Practice pace: ${Math.round(remaining)} to ${championName}`
      : (achievement.stars ? `Practice: ${achievement.shortLabel} · ${Math.round(achievement.overGoal)} above` : `Practice ${championName} standard met`);
  }
  const bestBadgeEl = document.getElementById("playerQuizBestBadge");
  if (bestBadgeEl) {
    bestBadgeEl.textContent = summary.bestPercent ? summary.bestBadge.label : "No practice attempts";
  }
  const badgeMetaEl = document.getElementById("playerQuizBadgeMeta");
  if (badgeMetaEl) {
    badgeMetaEl.textContent = summary.bestPercent
      ? `Practice best ${Math.round(summary.bestPercent)}% · season ${Math.round(summary.seasonPoints)} pts`
      : `${badgeFloor} / ${settings.highHonorRollMin} / ${settings.coachesListMin} practice bonuses`;
  }
  const leaderboardEl = document.getElementById("playerQuizLeaderboardPreview");
  if (leaderboardEl) {
    leaderboardEl.innerHTML = _renderQuizLeaderRows(summary.weeklyLeaderboardRows, summary.player);
  }
  _renderPlayerQuizResumeSlot();

  const modeSelect = document.getElementById("playerQuizPositionModeSelect");
  const modeHint = document.getElementById("playerQuizPositionHint");
  if (modeSelect) {
    const modeOptions = _getQuizPositionModeOptions();
    if (!modeOptions.some((option) => option.value === _quizPositionMode && !option.disabled)) {
      _quizPositionMode = "primary";
      _syncPlayerQuizPositionDefault();
    }
    modeSelect.innerHTML = modeOptions.map((option) => `
      <option value="${escapeAttr(option.value)}"${option.value === _quizPositionMode ? " selected" : ""}${option.disabled ? " disabled" : ""}>
        ${escapeHtml(option.label)}
      </option>
    `).join("");
    modeSelect.value = _quizPositionMode;
    if (modeHint) {
      const selectedOption = modeOptions.find((option) => option.value === _quizPositionMode) || modeOptions[0];
      modeHint.textContent = selectedOption?.hint || "Choose the rule column for this quiz.";
    }
  }

  const picker = document.getElementById("playerQuizPositionPicker");
  if (picker) {
    picker.innerHTML = _getQuizPositions()
      .map((position) => `
        <button type="button"
          class="player-quiz-position-btn${position.key === _quizPositionKey ? " is-active" : ""}"
          data-action="setPlayerQuizPosition"
          data-arg="${escapeAttr(position.key)}"
          aria-pressed="${position.key === _quizPositionKey ? "true" : "false"}">
          ${escapeHtml(position.label)}
        </button>
      `)
      .join("");
  }

  const select = document.getElementById("playerQuizScriptSelect");
  const scriptPicker = document.getElementById("playerQuizScriptPicker");
  const scriptSourceBtn = document.getElementById("playerQuizSelectScriptBtn");
  const gamePlanSourceBtn = document.getElementById("playerQuizSelectGamePlanBtn");
  const signalSourceBtn = document.getElementById("playerQuizSelectSignalsBtn");
  const startBtn = document.getElementById("playerQuizStartSelectedBtn");
  if (select) {
    const options = _getPlayerQuizScriptOptions();
    const selectableOptions = options.filter((option) => option.playerSelectable);
    if (selectableOptions.length) {
      if (!_playerQuizSelectedScriptId || !selectableOptions.some((option) => option.id === _playerQuizSelectedScriptId)) {
        _playerQuizSelectedScriptId = selectableOptions[0].id;
      }
      select.innerHTML = selectableOptions
        .map((option) => {
          const count = option.playCount ? ` · ${option.playCount} plays` : "";
          const date = option.dateStr ? `${option.dateStr} · ` : "";
          return `<option value="${escapeAttr(option.id)}">${escapeHtml(date + option.name + count)}</option>`;
        })
        .join("");
      select.value = _playerQuizSelectedScriptId;
    } else {
      select.innerHTML = `<option value="">Current practice</option>`;
      _playerQuizSelectedScriptId = "";
    }
    select.hidden = true;
  }

  const gamePlanStatus = _getActiveGamePlanQuizStatus();
  const modeGrid = document.getElementById("playerQuizModeGrid");
  if (modeGrid) {
    modeGrid.innerHTML = _renderPlayerQuizModeCards();
  }

  if (scriptSourceBtn) {
    const hasScriptOption = _getPlayerQuizScriptOptions().some((option) => option.playerSelectable);
    scriptSourceBtn.disabled = !hasScriptOption;
    scriptSourceBtn.textContent = hasScriptOption
      ? (_playerQuizSelectedSource === "script" ? "Selected" : "Choose practice script")
      : "Script Quiz Locked";
    scriptSourceBtn.setAttribute("aria-pressed", String(_playerQuizSelectedSource === "script"));
  }
  if (scriptPicker) {
    scriptPicker.innerHTML = _renderPlayerQuizScriptPicker(_getPlayerQuizScriptOptions());
  }
  const recommendationEl = document.getElementById("playerQuizRecommended");
  if (recommendationEl) {
    const recommendation = _getPlayerQuizRecommendation(_getPlayerQuizScriptOptions());
    recommendationEl.hidden = !recommendation;
    recommendationEl.innerHTML = recommendation ? `
      <div class="player-quiz-recommended__copy">
        <span>Today’s study</span>
        <strong>${escapeHtml(recommendation.title)}</strong>
        <small>${escapeHtml(recommendation.detail)}</small>
      </div>
      <button type="button" class="btn btn-primary" data-action="startRecommendedPlayerQuiz">${escapeHtml(recommendation.actionLabel)}</button>
    ` : "";
  }

  const weakSlot = document.getElementById("playerQuizWeakAreaSlot");
  if (weakSlot) {
    setInnerHTML(weakSlot, _renderPlayerQuizWeakAreaPanel(summary));
  }

  const gamePlanStatusEl = document.getElementById("playerQuizGamePlanStatus");
  const signalStatus = _getSignalQuizStatus();
  const signalStatusEl = document.getElementById("playerQuizSignalsStatus");
  if (gamePlanSourceBtn) {
    gamePlanSourceBtn.disabled = !gamePlanStatus.available;
    gamePlanSourceBtn.textContent = gamePlanStatus.available
      ? (_playerQuizSelectedSource === "gameplan" ? "Selected" : "Choose game plan")
      : gamePlanStatus.label;
    gamePlanSourceBtn.setAttribute("aria-pressed", String(_playerQuizSelectedSource === "gameplan"));
  }
  if (gamePlanStatusEl) {
    setInnerHTML(gamePlanStatusEl, `
      <span>${escapeHtml(gamePlanStatus.detail)}</span>
      ${_renderQuizCompletenessChips(gamePlanStatus.stats, "quiz-completeness-chips player-quiz-source-chips")}
    `);
    gamePlanStatusEl.hidden = !gamePlanStatus.detail;
  }
  if (signalSourceBtn) {
    signalSourceBtn.disabled = !signalStatus.available;
    signalSourceBtn.textContent = signalStatus.available
      ? (_playerQuizSelectedSource === "signal" ? "Selected" : "Choose signals")
      : signalStatus.label;
    signalSourceBtn.setAttribute("aria-pressed", String(_playerQuizSelectedSource === "signal"));
  }
  if (signalStatusEl) {
    const categoryChips = signalStatus.categories.length
      ? `<div class="quiz-completeness-chips player-quiz-source-chips">
          ${signalStatus.categories.map((category) => `
            <span class="quiz-completeness-chip quiz-completeness-chip--ready">
              <strong>${escapeHtml(category.label || category.id)}</strong>
              <small>${Number(category.count || 0)} clips</small>
            </span>`).join("")}
        </div>`
      : "";
    setInnerHTML(signalStatusEl, `
      <span>${escapeHtml(signalStatus.detail)}</span>
      ${categoryChips}
      ${signalStatus.available ? _renderSignalGameCategorySelector(signalStatus) : ""}
    `);
    signalStatusEl.hidden = !signalStatus.detail;
  }

  if (startBtn) {
    const mode = _getPlayerQuizMode();
    const sourceReady = _playerQuizSelectedSource === "gameplan"
      ? gamePlanStatus.available
      : _playerQuizSelectedSource === "signal"
        ? signalStatus.available
        : _getPlayerQuizScriptOptions().some((option) => option.id === _playerQuizSelectedScriptId && option.playerSelectable);
    startBtn.disabled = !sourceReady || !mode || mode.disabled;
    startBtn.textContent = !sourceReady
      ? "Choose an available quiz source"
      : `Start ${mode?.label || "Quiz"}`;
  }

  // This function owns refreshes inside the existing hub. Re-entering the page
  // renderer from here calls this function again and can lock the Quiz tab in
  // a recursive render loop.
}

function openPlayerQuizHub() {
  if (typeof showTab === "function") showTab("quiz");
  else if (typeof renderQuizPage === "function") renderQuizPage();
}

// Leaderboard launchers use the same source/mode chooser as every other
// entry point. Keeping one hub prevents the quiz configuration from drifting
// between the dashboard, homework, and leaderboard.
function openPlayerQuizHubWithMode(modeKey = "") {
  const mode = _getPlayerQuizModes().find((entry) => entry.key === String(modeKey || ""));
  if (mode && !mode.disabled) {
    _playerQuizSelectedSource = mode.source;
    _playerQuizSelectedMode = mode.key;
  }
  openPlayerQuizHub();
}

// Every player-facing Quiz button lands in the same setup screen first. This
// keeps position and quiz mode visible before the first question instead of
// silently launching with whichever default happened to be active.
function openPlayerQuizHubForScript(id = "") {
  const target = _getPlayerQuizScriptOptions().find((option) => option.id === String(id || "") && option.playerSelectable);
  if (!target) {
    showToast("Coach has not opened that script quiz yet.", { type: "warning" });
    return;
  }
  _playerQuizSelectedScriptId = target.id;
  _playerQuizSelectedSource = "script";
  openPlayerQuizHub();
}

// The current-practice shortcut is intentionally kept on the same setup path
// as every card in the player launcher.  Resolving the loaded packet first
// prevents an older default script from silently replacing the practice a
// player is currently studying.
function openPlayerQuizHubForCurrentScript() {
  const currentName = document.getElementById("scriptName")?.value || "";
  const currentDate = document.getElementById("scriptDate")?.value || "";
  const options = _getPlayerQuizScriptOptions();
  // The loaded Script Library record is the source of truth. Names and dates
  // are coach-facing display fields and can legitimately be duplicated.
  // Keep the older display-based fallbacks only for an unsaved legacy draft.
  const activeId = String(typeof activeScriptSaveId !== "undefined" ? activeScriptSaveId || "" : "");
  const target = options.find((option) => option.playerSelectable && option.id === activeId)
    || options.find((option) => option.playerSelectable && option.name === currentName && option.date === currentDate)
    || options.find((option) => option.playerSelectable && option.name === currentName)
    || options.find((option) => option.playerSelectable)
    || null;
  if (!target) {
    showToast("Coach has not opened a practice quiz yet.", { type: "warning" });
    return;
  }
  _playerQuizSelectedScriptId = target.id;
  _playerQuizSelectedSource = "script";
  openPlayerQuizHub();
}

function closePlayerQuizHub(options = {}) {
  if (options.keepQuizPage) return;
  if (typeof showTab === "function") showTab("dashboard");
}

function setPlayerQuizPosition(key) {
  const next = _getQuizPositions().find((position) => position.key === key);
  if (!next) return;
  _quizPositionKey = next.key;
  _quizPositionMode = "manual";
  _renderPlayerQuizHub();
}

function setPlayerQuizPositionMode(mode) {
  _quizPositionMode = _normalizeQuizPositionMode(mode);
  _syncPlayerQuizPositionDefault();
  _renderPlayerQuizHub();
}

function setPlayerQuizMode(modeKey) {
  const mode = _getPlayerQuizModes().find((entry) => entry.key === String(modeKey || ""));
  if (!mode || mode.disabled) return;
  _playerQuizSelectedSource = mode.source;
  _playerQuizSelectedMode = mode.key;
  _renderPlayerQuizHub();
}

function setPlayerQuizSource(source = "script") {
  const next = String(source || "").trim().toLowerCase();
  if (!["script", "gameplan", "signal"].includes(next)) return;
  _playerQuizSelectedSource = next;
  const firstAvailable = _getPlayerQuizModes().find((mode) => mode.source === next && !mode.disabled);
  if (firstAvailable) _playerQuizSelectedMode = firstAvailable.key;
  _renderPlayerQuizHub();
}

function startPlayerQuizHubSelection() {
  const mode = _getPlayerQuizMode();
  if (!mode || mode.disabled) {
    showToast("Choose a quiz type before you start.", { type: "warning" });
    return;
  }
  if (mode.source === "gameplan") return startPlayerQuizHubGamePlan();
  if (mode.source === "signal") return startPlayerQuizHubSignals();
  startPlayerQuizHubScript();
}

function setPlayerQuizScriptSource(id) {
  const target = _getPlayerQuizScriptOptions().find((option) => option.id === String(id || ""));
  if (target && !target.playerSelectable) return;
  _playerQuizSelectedScriptId = target ? target.id : "";
  if (target) _playerQuizSelectedSource = "script";
  const select = document.getElementById("playerQuizScriptSelect");
  if (select) select.value = _playerQuizSelectedScriptId;
  _renderPlayerQuizHub();
}

function startPlayerQuizHubScript() {
  const select = document.getElementById("playerQuizScriptSelect");
  const id = _playerQuizSelectedScriptId || (select ? select.value : "");
  const selected = _getPlayerQuizScriptOptions().find((option) => option.id === id);
  if (!selected || !selected.playerSelectable) {
    showToast("Coach has not opened that script quiz yet.", { type: "warning" });
    return;
  }
  const mode = _getPlayerQuizMode();
  if (mode?.source === "signal") {
    startPlayerQuizHubSignals();
    return;
  }
  if (mode?.source === "gameplan") {
    showToast("Use the Game Plan button for that challenge.", { type: "info" });
    return;
  }
  closePlayerQuizHub({ keepQuizPage: true });
  _quizMode = mode?.key || "quick";
  if (typeof startPlayerScriptQuiz === "function") {
    startPlayerScriptQuiz(id || "", {
      mode: _quizMode,
      items: mode?.key === "missed" ? _prepareQuizItemsForMode([], "missed") : undefined,
      title: _quizModeTitle(selected.name || "Practice Script Quiz", _quizMode),
      positionKey: _quizPositionKey,
      positionMode: _quizPositionMode,
      // Load the source packet, but keep the player on the Quiz page.
      keepCurrentTab: true,
      returnDestination: "quiz",
    });
    return;
  }
  startScriptQuiz({
    items: mode?.key === "missed" ? _prepareQuizItemsForMode([], "missed") : undefined,
    sourceType: "script",
    sourceId: id || "",
    title: _quizModeTitle("Practice Script Quiz", _quizMode),
    positionKey: _quizPositionKey,
    positionMode: _quizPositionMode,
    mode: _quizMode,
  });
}

function _buildSignalSprintItems(items, targetCount = SIGNAL_SPRINT_TARGET_REPS) {
  const source = _normalizeQuizItems(items).filter((item) => item.signalRecord);
  if (!source.length) return [];
  const out = [];
  let guard = 0;
  while (out.length < targetCount && guard < targetCount * 2) {
    const round = _quizShuffle(source);
    round.forEach((item) => {
      if (out.length >= targetCount) return;
      out.push({
        ...item,
        scriptIndex: out.length,
      });
    });
    guard += round.length || 1;
  }
  return out;
}

function _buildSignalBattleItems(items, targetCount = SIGNAL_BATTLE_TARGET_REPS) {
  return _buildSignalSprintItems(items, targetCount);
}

function _buildSignalHeatCheckItems(items, targetCount = SIGNAL_HEAT_CHECK_TARGET_REPS) {
  return _buildSignalSprintItems(items, targetCount);
}

async function startPlayerQuizHubSignals() {
  const status = _getSignalQuizStatus();
  if (!status.available) {
    showToast(status.detail || "Signal Study is not ready yet.", { type: "warning" });
    return;
  }
  const button = document.getElementById("playerQuizStartSelectedBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Loading Signals...";
  }
  try {
    const mode = _getPlayerQuizMode();
    const signalMode = ["signal-sprint", "signal-battle", "signal-heat", "signal-full-call"].includes(mode?.key) ? mode.key : "signal-study";
    const signalSettings = status.settings || _getSignalGameSettings(status);
    const signalCategories = signalSettings.categories;
    const signalMultiplier = _getSignalCategoryMultiplier(signalCategories, signalSettings.eligibleCategories);
    let items = [];
    if (signalMode === "signal-full-call") {
      items = await _buildSignalFullCallItems(signalSettings);
    } else if (typeof getSignalQuizItems === "function") {
      items = await getSignalQuizItems({
        requireClip: true,
        categories: signalCategories,
        includeDraft: _canUseStaffSignalClips(signalSettings),
      });
    }
    const minimumItems = signalMode === "signal-full-call" ? 2 : signalSettings.minClipCount;
    if (!Array.isArray(items) || items.length < minimumItems) {
      showToast(signalMode === "signal-full-call"
        ? "Full Play Call needs at least two playable calls with signal clips."
        : `That signal category selection needs at least ${signalSettings.minClipCount} playable clips.`, { type: "warning" });
      return;
    }
    let quizItems = items;
    if (signalMode === "signal-sprint") {
      quizItems = _buildSignalSprintItems(items);
    } else if (signalMode === "signal-battle") {
      quizItems = _buildSignalBattleItems(items);
    } else if (signalMode === "signal-heat") {
      quizItems = _buildSignalHeatCheckItems(items);
    } else if (signalMode === "signal-full-call") {
      quizItems = _quizShuffle(items).slice(0, 12);
    }
    const titleByMode = {
      "signal-sprint": "100 Second Signal Sprint",
      "signal-battle": "6 Seconds of Battle",
      "signal-heat": "Heat Check",
      "signal-full-call": "Full Play Call",
    };
    closePlayerQuizHub({ keepQuizPage: true });
    _quizMode = signalMode;
    startScriptQuiz({
      items: quizItems,
      sourceType: "signal",
      sourceId: "signals",
      title: titleByMode[signalMode] || "Signal Study",
      positionKey: _quizPositionKey,
      positionMode: _quizPositionMode,
      timeLimitMs: signalMode === "signal-sprint" ? SIGNAL_SPRINT_DURATION_MS : 0,
      signalCategories,
      signalCategoryMultiplier: signalMultiplier,
      mode: _quizMode,
      returnDestination: "quiz",
    });
  } catch (err) {
    showToast(err?.message || "Could not start Signal Study.", { type: "error", duration: 3500 });
  } finally {
    if (button) {
      const nextStatus = _getSignalQuizStatus();
      button.disabled = !nextStatus.available;
      button.textContent = nextStatus.available
        ? `Start ${_getPlayerQuizMode()?.source === "signal" ? _getPlayerQuizMode().label : "Signal Study"}`
        : nextStatus.label;
    }
  }
}

function _getActiveGamePlanQuizSourceId() {
  const released = _getReleasedGamePlanQuizSource();
  if (_isPlayerQuizReleaseRuntime()) return String(released?.id || "__player-release-pending__");
  if (typeof _gpActiveOpponentKey === "function") return _gpActiveOpponentKey();
  const gw = typeof getGameWeek === "function" ? getGameWeek() : null;
  return gw?.opponentName || "__unassigned__";
}

function _getSignalQuizStatus() {
  const settings = _getSignalGameSettings();
  const includeDraft = _canUseStaffSignalClips(settings);
  const stats = typeof getSignalQuizStats === "function"
    ? getSignalQuizStats({
      categories: settings.eligibleCategories,
      includeDraft,
    })
    : { total: 0, categories: [] };
  const count = Number(stats?.total || 0);
  const categories = Array.isArray(stats?.categories)
    ? stats.categories.filter((category) => Number(category.count || 0) > 0)
    : [];
  const categoryLabel = categories.length
    ? categories.map((category) => `${category.label || category.id}: ${category.count}`).join(" · ")
    : "";
  return {
    count,
    categories,
    fullCallCount: _countSignalFullCallCandidates(settings),
    settings,
    includeDraft,
    minClipCount: settings.minClipCount,
    available: count >= settings.minClipCount && typeof getSignalQuizItems === "function",
    label: count >= settings.minClipCount ? "Start Signal Study" : "Signals Need Clips",
    detail: count >= settings.minClipCount
      ? `${count} ${includeDraft ? "staff-test" : "published"} signal clip${count === 1 ? "" : "s"} ready. ${categoryLabel}`
      : `Publish at least ${settings.minClipCount} eligible signal clips to unlock Signal Study.`,
  };
}

function _getActiveGamePlanQuizStatus() {
  const id = _getActiveGamePlanQuizSourceId();
  const released = _getReleasedGamePlanQuizSource();
  const state = _getQuizSourceState("gameplan", { id });
  const items = _buildGamePlanQuizItems();
  const stats = _quizCompletenessStats(items.map((item) => item.play));
  if (_isPlayerQuizReleaseRuntime() && !released) {
    return {
      id,
      state: "coach",
      available: false,
      label: "Game Plan Updating",
      detail: "Coach's active Game Plan quiz will appear after the next automatic team save.",
      stats,
    };
  }
  if (state === "coach") {
    return {
      id,
      state,
      available: false,
      label: "Game Plan Coach-only",
      detail: "Coach has not opened this Game Plan quiz to players.",
      stats,
    };
  }
  if (state === "locked") {
    return {
      id,
      state,
      available: false,
      label: "Game Plan Locked",
      detail: "Coach locked this Game Plan quiz for now.",
      stats,
    };
  }
  if (!items.length) {
    return {
      id,
      state,
      available: false,
      label: "No Game Plan Quiz",
      detail: "No Game Plan calls are ready for quiz yet.",
      stats,
    };
  }
  const thinText = stats.score < 40 ? " Thin source: expect mostly call-ID questions." : "";
  return {
    id,
    state,
    available: true,
    label: "Start Game Plan Quiz",
    detail: `${items.length} Game Plan call${items.length === 1 ? "" : "s"} ready.${thinText}`,
    stats,
  };
}

function _buildGamePlanQuizItems() {
  const released = _getReleasedGamePlanQuizSource();
  if (_isPlayerQuizReleaseRuntime()) {
    return _normalizeQuizItems(released?.items || []);
  }
  if (typeof _gpEnsureBoard !== "function") return [];
  const board = _gpEnsureBoard();
  const seen = new Set();
  const items = [];
  Object.entries(board.assignments || {}).forEach(([boxId, list]) => {
    if (boxId === "__holding" || boxId === "holding") return;
    (Array.isArray(list) ? list : []).forEach((play, rawIdx) => {
      if (!play) return;
      const sig = typeof _gpPlaySignature === "function"
        ? _gpPlaySignature(play)
        : `${_quizPlainCall(play)}::${rawIdx}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      items.push({
        play,
        period: board.boxLabels?.[boxId] || boxId,
        scriptIndex: items.length,
        sourceBox: boxId,
      });
    });
  });
  return items;
}

function startPlayerQuizHubGamePlan() {
  const status = _getActiveGamePlanQuizStatus();
  if (!status.available) {
    showToast(status.detail || "Game Plan quiz is not open yet.", { type: "warning" });
    return;
  }
  const items = _buildGamePlanQuizItems();
  if (!items.length) {
    showToast("Add plays to the Game Plan before starting this quiz.", { type: "warning" });
    return;
  }
  closePlayerQuizHub({ keepQuizPage: true });
  _quizMode = _playerQuizSelectedMode === "gameplan" ? "gameplan" : "quick";
  startScriptQuiz({
    items: _prepareQuizItemsForMode(items, _quizMode),
    sourceType: "gameplan",
    sourceId: status.id,
    title: _quizModeTitle("Game Plan Quiz", _quizMode),
    positionKey: _quizPositionKey,
    positionMode: _quizPositionMode,
    mode: _quizMode,
    returnDestination: "quiz",
  });
}

function _resetQuizGameState() {
  _clearQuizTimer();
  _clearStandardQuizAdvance();
  _resetQuizRoundState();
  _quizRevealed = false;
  _quizAnswers = new Map();
  _quizChoiceCache = new Map();
  _quizCurrentChoices = [];
  _quizCurrentQuestion = null;
  _quizScore = 0;
  _quizStreak = 0;
  _quizBestStreak = 0;
  _quizFinished = false;
  _quizSavedAttemptId = "";
  _quizExitSummaryOpen = false;
  _quizTimeLimitMs = 0;
  _quizStartedAt = 0;
  _quizFinishedAt = 0;
  _quizSignalCategories = [];
  _quizSignalMultiplier = 1;
}

function _quizItemKey(item) {
  if (!item || !item.play) return "";
  if (item.customQuestion?.prompt) return `custom::${item.scriptIndex ?? _quizIndex}::${item.customQuestion.prompt}`;
  if (item.signalRecord?.id) {
    return `signal::${item.scriptIndex ?? _quizIndex}::${item.signalRecord.id}::${item.signalRecord.clipId || item.signalRecord.clipSig || ""}`;
  }
  const sig = typeof playSignature === "function" ? playSignature(item.play) : "";
  return `${item.scriptIndex ?? _quizIndex}::${item.positionKey || _quizPositionKey}::${sig || _quizPlainCall(item.play)}`;
}

function _quizChoiceKey(item) {
  return _quizItemKey(item);
}

function _quizCleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function _quizPlainCall(play) {
  if (!play) return "Unnamed Play";
  const parts = [
    play.personnel,
    play.formation,
    play.formTag1,
    play.formTag2,
    play.shift,
    play.motion,
    play.protection,
    play.play,
    play.playTag1,
    play.playTag2,
  ]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim() || "Unnamed Play";
}

function _quizShuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function _quizUniqueChoices(items, getLabel) {
  const seen = new Set();
  return items
    .map((item) => ({ item, label: _quizCleanText(getLabel(item)) }))
    .filter((entry) => {
      const key = entry.label.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function _quizFormationLabel(play) {
  return _quizCleanText([
    play?.personnel,
    play?.formation,
    play?.formTag1,
    play?.formTag2,
  ].filter(Boolean).join(" "));
}

function _quizShortCall(play) {
  return _quizCleanText([
    play?.personnel,
    play?.formation,
    play?.play,
    play?.playTag1,
  ].filter(Boolean).join(" ")) || _quizPlainCall(play);
}

function _quizQuestionChoiceLabel(item, question) {
  const play = item?.play || item;
  if (!play) return "";
  switch (question?.type) {
    case "custom_multiple_choice":
      return _quizCleanText(question.custom?.options?.[Number(question.custom?.correctIndex)] || "");
    case "responsibility":
      return _quizCleanText(question.position?.key ? play[question.position.key] : "");
    case "diagram_formation":
      return _quizFormationLabel(play);
    case "signal":
      if (item?.signalRecord) return _quizSignalAnswerLabel(item.signalRecord);
      return _quizSignalAnswerLabel(_quizSignalRecordForQuestion(play, question));
    case "signal_full_call":
      return _quizPlainCall(play);
    case "play_type":
      return _quizCleanText(play.type);
    case "play_from_rule":
    case "diagram":
    case "formation_to_play":
    case "call":
      return _quizShortCall(play);
    default:
      return _quizShortCall(play);
  }
}

function _quizSignalRecordsForPlay(play) {
  if (!play || typeof resolveSignalsForPlay !== "function") return [];
  const groups = resolveSignalsForPlay(play);
  const categories =
    typeof SIGNAL_CATEGORIES !== "undefined" && Array.isArray(SIGNAL_CATEGORIES)
      ? SIGNAL_CATEGORIES
      : Object.keys(groups || {}).map((id) => ({ id, label: id }));
  const records = [];
  categories.forEach((category) => {
    (groups?.[category.id] || []).forEach((record) => {
      records.push({
        ...record,
        groupLabel: category.label || record.category || "",
      });
    });
  });
  return records;
}

function _quizSignalAnswerLabel(record) {
  return _quizCleanText(record?.value || record?.componentValue || record?.compareKey || "");
}

function _getSignalFullCallSourceItems() {
  const pools = [
    ...(_getPlayerQuizSelectedScriptRecord()?.plays || []),
    ..._buildGamePlanQuizItems().map((item) => item.play),
    ...((Array.isArray(script) ? script : []).filter((play) => play && !play.isSeparator)),
  ];
  const seen = new Set();
  const items = [];
  pools.forEach((play) => {
    if (!play || play.isSeparator) return;
    const sig = typeof playSignature === "function" ? playSignature(play) : _quizPlainCall(play);
    const key = String(sig || _quizPlainCall(play)).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push({
      play,
      period: "Full Play Call",
      scriptIndex: items.length,
      sourceBox: "signal-full-call",
    });
  });
  return items;
}

function _getSignalFullCallRecordsForPlay(play, settings = _getSignalGameSettings()) {
  if (!play || typeof resolveSignalsForPlay !== "function") return [];
  const groups = resolveSignalsForPlay(play, {
    categories: settings.categories,
    includeDraft: _canUseStaffSignalClips(settings),
  });
  const categories =
    typeof SIGNAL_CATEGORIES !== "undefined" && Array.isArray(SIGNAL_CATEGORIES)
      ? SIGNAL_CATEGORIES
      : Object.keys(groups || {}).map((id) => ({ id, label: id }));
  const records = [];
  categories.forEach((category) => {
    (groups?.[category.id] || []).forEach((record) => {
      records.push({
        ...record,
        groupLabel: category.label || record.category || "",
      });
    });
  });
  return records;
}

function _countSignalFullCallCandidates(settings = _getSignalGameSettings()) {
  return _getSignalFullCallSourceItems()
    .filter((item) => _getSignalFullCallRecordsForPlay(item.play, settings).length > 0)
    .length;
}

async function _getQuizSignalClipMap(keys) {
  const startedAt = _quizPerfNow();
  const clipKeys = [...new Set(
    (Array.isArray(keys) ? keys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean),
  )];
  const clipMap = Object.create(null);
  if (!clipKeys.length || !window.playClips) {
    _quizPerfRecord("clip-manifest", startedAt, { requested: clipKeys.length, resolved: 0, method: "none" });
    return clipMap;
  }
  if (typeof window.playClips.listForSigs === "function") {
    try {
      const batchMap = await window.playClips.listForSigs(clipKeys);
      _quizPerfRecord("clip-manifest", startedAt, {
        requested: clipKeys.length,
        resolved: Object.values(batchMap || {}).filter((clips) => Array.isArray(clips) && clips.length).length,
        method: "batch",
      });
      return batchMap;
    } catch (_err) {
      // Fall back to the one-at-a-time API below.
    }
  }
  if (typeof window.playClips.listForSig !== "function") {
    _quizPerfRecord("clip-manifest", startedAt, { requested: clipKeys.length, resolved: 0, method: "unavailable" });
    return clipMap;
  }
  await Promise.all(clipKeys.map(async (clipKey) => {
    try {
      clipMap[clipKey] = await window.playClips.listForSig(clipKey);
    } catch (_err) {
      clipMap[clipKey] = [];
    }
  }));
  _quizPerfRecord("clip-manifest", startedAt, {
    requested: clipKeys.length,
    resolved: Object.values(clipMap).filter((clips) => Array.isArray(clips) && clips.length).length,
    method: "fallback",
  });
  return clipMap;
}

async function _buildSignalFullCallItems(settings = _getSignalGameSettings()) {
  const candidates = _getSignalFullCallSourceItems()
    .map((item) => ({
      item,
      records: _getSignalFullCallRecordsForPlay(item.play, settings),
    }))
    .filter((entry) => entry.records.length > 0);
  const clipMap = await _getQuizSignalClipMap(
    candidates.flatMap((entry) => entry.records.map((record) => record.clipKey)),
  );
  const items = [];
  for (const { item, records } of candidates) {
    const clips = [];
    for (const record of records.slice(0, 5)) {
      const list = Array.isArray(clipMap[record.clipKey]) ? clipMap[record.clipKey] : [];
      const clip = list[0] || null;
      if (!clip?.url) continue;
      clips.push({
        ...record,
        clipUrl: clip.url,
        clipId: clip.id || "",
        answerLabel: _quizSignalAnswerLabel(record),
      });
    }
    if (!clips.length) continue;
    items.push({
      ...item,
      scriptIndex: items.length,
      signalFullCallClips: clips,
    });
  }
  return items;
}

// General distractor plausibility score. Higher = the candidate play looks more
// like the correct play (same formation/personnel/type family) so it makes a
// believable-but-wrong multiple choice answer. Used to rank recognition-style
// question distractors ahead of random plays.
function _quizPlayDistractorScore(correctPlay, candidatePlay) {
  if (!correctPlay || !candidatePlay) return 0;
  const same = (field) => {
    const value = _quizCleanText(correctPlay[field]).toLowerCase();
    return value && value === _quizCleanText(candidatePlay[field]).toLowerCase();
  };
  let score = 0;
  if (same("type")) score += 3;
  if (same("personnel")) score += 2;
  if (same("formation")) score += 4;
  if (same("formTag1")) score += 1;
  if (same("basePlay")) score += 2;
  if (same("protection")) score += 1;
  if (same("preferredDown")) score += 1;
  if (same("preferredDistance")) score += 1;
  if (same("preferredFieldPosition")) score += 1;
  return score;
}

function _signalFullCallDistractorScore(correctPlay, candidatePlay) {
  if (!correctPlay || !candidatePlay) return 0;
  const same = (field) => _quizCleanText(correctPlay[field]).toLowerCase() &&
    _quizCleanText(correctPlay[field]).toLowerCase() === _quizCleanText(candidatePlay[field]).toLowerCase();
  let score = 0;
  if (same("personnel")) score += 2;
  if (same("formation")) score += 4;
  if (same("formTag1")) score += 1;
  if (same("formTag2")) score += 1;
  if (same("shift")) score += 3;
  if (same("motion")) score += 3;
  if (same("protection")) score += 2;
  if (same("play")) score += 3;
  if (same("playTag1")) score += 1;
  if (same("type")) score += 1;
  return score;
}

function _quizPickSignalRecord(item) {
  if (item?.signalRecord) return item.signalRecord;
  const records = _quizSignalRecordsForPlay(item?.play || item);
  if (!records.length) return null;
  const priority = ["MOTIONS", "TAGS", "CORE", "BLOCKING"];
  const sorted = records.slice().sort((a, b) => {
    const aPriority = priority.indexOf(a.category);
    const bPriority = priority.indexOf(b.category);
    return (aPriority < 0 ? 99 : aPriority) - (bPriority < 0 ? 99 : bPriority);
  });
  return sorted[_quizIndex % sorted.length] || sorted[0];
}

function _quizSignalRecordForQuestion(play, question) {
  const target = question?.signal || {};
  if (target.record) return target.record;
  return _quizSignalRecordsForPlay(play).find((record) => {
    if (target.componentType && record.componentType !== target.componentType) return false;
    return true;
  }) || null;
}

// Build lightweight quiz candidates from the full signal library so that a
// signal question can always offer same-type wrong answers, even when few of
// those signals have filmed clips in the current quiz pool.
function _quizSignalLibraryCandidates(componentType, excludeCompareKey) {
  if (!componentType || typeof getSignalDistractorValues !== "function") return [];
  const values = getSignalDistractorValues(componentType, excludeCompareKey);
  return values.map((value, idx) => ({
    play: { type: "Signal", play: value },
    scriptIndex: `siglib-${componentType}-${idx}`,
    signalRecord: {
      id: `siglib::${componentType}::${String(value).toLowerCase()}`,
      componentType,
      value,
    },
  }));
}

function _quizQuestionDistractorItems(item, question) {
  const source = _quizPlays.filter((candidate) => candidate && candidate !== item && candidate?.play);
  if (question?.type === "formation_to_play") {
    const correctFormation = _quizFormationLabel(item?.play).toLowerCase();
    return source
      .filter((candidate) => _quizFormationLabel(candidate.play).toLowerCase() !== correctFormation)
      .sort((a, b) =>
        _quizPlayDistractorScore(item.play, b.play) -
        _quizPlayDistractorScore(item.play, a.play));
  }
  if (question?.type === "signal") {
    const correctLabel = _quizQuestionChoiceLabel(item, question).toLowerCase();
    const differs = (candidate) => {
      const candidateLabel = _quizQuestionChoiceLabel(candidate, question).toLowerCase();
      return candidateLabel && candidateLabel !== correctLabel;
    };
    // Keep distractors in the SAME signal component type as the answer (a
    // formation question gets other formations, not a random motion/shift/play)
    // so the correct choice is never obvious by category. Supplement from the
    // full signal library — including signals with no filmed clip — so short
    // categories still get 3 believable wrong answers.
    const correctRecord =
      item?.signalRecord || _quizSignalRecordForQuestion(item?.play, question);
    const correctType = correctRecord?.componentType || "";
    if (correctType) {
      const sameType = source.filter(
        (candidate) =>
          differs(candidate) &&
          (candidate?.signalRecord?.componentType || "") === correctType,
      );
      const library = _quizSignalLibraryCandidates(
        correctType,
        correctRecord?.compareKey,
      ).filter(differs);
      const combined = [...sameType, ...library];
      if (combined.length) return combined;
    }
    return source.filter(differs);
  }
  if (question?.type === "signal_full_call") {
    const correctLabel = _quizQuestionChoiceLabel(item, question).toLowerCase();
    return source
      .filter((candidate) => {
        const candidateLabel = _quizQuestionChoiceLabel(candidate, question).toLowerCase();
        return candidateLabel && candidateLabel !== correctLabel;
      })
      .sort((a, b) => (
        _signalFullCallDistractorScore(item.play, b.play) -
        _signalFullCallDistractorScore(item.play, a.play)
      ));
  }
  // "What type of play is this?" wants a spread of DIFFERENT types as wrong
  // answers, so leave the pool unranked (dedup keeps them distinct).
  if (question?.type === "play_type") {
    return source;
  }
  // Recognition / rule questions (call, diagram, play_from_rule,
  // responsibility): rank believable look-alikes first so wrong answers come
  // from the same formation/personnel/type family instead of random plays.
  return source
    .slice()
    .sort((a, b) =>
      _quizPlayDistractorScore(item.play, b.play) -
      _quizPlayDistractorScore(item.play, a.play));
}

function _quizChoiceQuality(label, questionType = "call") {
  const text = _quizCleanText(label);
  if (!text) return { ok: false, reason: "blank" };
  const maxLength = questionType === "responsibility" || questionType === "signal_full_call"
    ? 120
    : questionType === "call"
      ? 72
      : 90;
  if (text.length > maxLength) return { ok: false, reason: "too-long" };
  return { ok: true, reason: "" };
}

function _quizQuestionQuality(question, item, opts = {}) {
  if (!question || !item?.play) return { state: "study_only", reason: "missing-question" };
  if (question.type === "study_card") return { state: "study_only", reason: "study-card" };

  const correctLabel = _quizQuestionChoiceLabel(item, question);
  const correctQuality = _quizChoiceQuality(correctLabel, question.type);
  if (!correctQuality.ok) return { state: "study_only", reason: correctQuality.reason };

  const pool = _quizUniqueChoices(
    _quizQuestionDistractorItems(item, question),
    (candidate) => _quizQuestionChoiceLabel(candidate, question),
  ).filter((entry) => _quizChoiceQuality(entry.label, question.type).ok);
  const minimumDistractors = Number(opts.minimumDistractors ?? (question.type === "responsibility" ? 3 : 1));
  if (pool.length < minimumDistractors) {
    return { state: "study_only", reason: "not-enough-choices", choices: pool.length };
  }
  return {
    state: pool.length >= 3 ? "playable" : "thin",
    reason: "",
    choices: pool.length,
  };
}

function _buildQuizStudyCardQuestion(item, position, reason = "") {
  const diagramUrl = _quizDiagramUrl(item?.play);
  return {
    type: "study_card",
    prompt: "Study this one.",
    detailLabel: "No fair multiple choice",
    detailValue: reason === "not-enough-choices"
      ? "Not enough clean answer choices yet. Review the play, then keep going."
      : "Review the call, diagram, and rule without guessing.",
    diagramUrl,
    rule: _quizCleanText(position?.key ? item?.play?.[position.key] : ""),
    position,
    quality: { state: "study_only", reason },
  };
}

function _selectQuizQuestion(candidates, item) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const quality = _quizQuestionQuality(candidate, item, {
      minimumDistractors: candidate.type === "responsibility" ? 3 : 1,
    });
    if (quality.state !== "study_only") {
      return { ...candidate, quality };
    }
  }
  return null;
}

function _buildQuizQuestion(item) {
  if (item?.customQuestion?.prompt) {
    return {
      type: "custom_multiple_choice",
      prompt: _quizCleanText(item.customQuestion.prompt),
      detailLabel: "Coach question",
      detailValue: "",
      position: null,
      custom: item.customQuestion,
    };
  }
  const position = _getQuizPositionForItem(item);
  const enabledTypes = new Set(_quizAllowedQuestionTypes.length
    ? _quizAllowedQuestionTypes
    : (_getPlayerQuizSettings().enabledQuestionTypes || PLAYER_QUIZ_DEFAULT_SETTINGS.enabledQuestionTypes));
  const positionRule = _quizCleanText(position?.key ? item.play[position.key] : "");
  const positionLabel = position?.label || "your";
  const diagramUrl = _quizDiagramUrl(item.play);
  const forceSignalQuestion =
    _quizSourceType === "signal" ||
    _quizMode === "signal-study" ||
    _isSignalAutoAdvanceMode() ||
    Boolean(item.signalRecord);
  const signalRecord = enabledTypes.has("signal") || forceSignalQuestion
    ? _quizPickSignalRecord(item)
    : null;
  const canAskRules = enabledTypes.has("responsibility") && positionRule;
  const canAskRuleToPlay = enabledTypes.has("play_from_rule") && positionRule;
  const canAskVisual = (_quizMode === "diagram-flash" || enabledTypes.has("diagram")) && diagramUrl;
  const canAskSignal = Boolean(signalRecord);
  const canAskRecognition = enabledTypes.has("call");
  const ruleQuestion = canAskRules ? {
    type: "responsibility",
    prompt: `What's your ${positionLabel} responsibility?`,
    detailLabel: "Call",
    detailValue: _quizPlainCall(item.play),
    rule: positionRule,
    position,
  } : null;
  const diagramQuestion = canAskVisual ? {
    type: "diagram",
    prompt: "What play is this diagram?",
    detailLabel: "",
    detailValue: "",
    diagramUrl,
    rule: positionRule,
    position,
  } : null;
  // Flash cards are recognition reps, not scored guesses: players name the
  // redacted diagram mentally, then flip to the exact practice-script call.
  if (_quizMode === "diagram-flash") {
    return canAskVisual
      ? {
        type: "diagram_flash",
        prompt: "Name this play, then flip to check.",
        detailLabel: "",
        detailValue: "",
        diagramUrl,
        rule: positionRule,
        position,
      }
      : _buildQuizStudyCardQuestion(item, position, "diagram-required");
  }
  const ruleToPlayQuestion = canAskRuleToPlay ? {
    type: "play_from_rule",
    prompt: `Which play has this ${positionLabel} rule?`,
    detailLabel: `${positionLabel} Rule`,
    detailValue: positionRule,
    rule: positionRule,
    position,
  } : null;
  const diagramFormationQuestion = canAskVisual && _quizFormationLabel(item.play) ? {
    type: "diagram_formation",
    prompt: "What formation is this diagram?",
    detailLabel: "",
    detailValue: "",
    diagramUrl,
    rule: positionRule,
    position,
  } : null;
  const formationQuestion = canAskRecognition && _quizFormationLabel(item.play) ? {
    type: "formation_to_play",
    prompt: "Which play starts from this formation?",
    detailLabel: "Formation",
    detailValue: _quizFormationLabel(item.play),
    rule: positionRule,
    position,
  } : null;
  const typeQuestion = canAskRecognition && _quizCleanText(item.play.type) ? {
    type: "play_type",
    prompt: "What type of play is this?",
    detailLabel: "Call clue",
    detailValue: _quizShortCall(item.play),
    rule: positionRule,
    position,
  } : null;
  const signalQuestion = canAskSignal ? {
    type: "signal",
    prompt: _quizMode === "signal-study" || _isSignalAutoAdvanceMode()
      ? `Which ${signalRecord.label || signalRecord.componentType || "signal"} is shown?`
      : `Which ${signalRecord.label || signalRecord.componentType || "signal"} belongs to this play?`,
    detailLabel: `${signalRecord.groupLabel || signalRecord.category || "Signal"} Signal`,
    detailValue: _quizMode === "signal-study" || _isSignalAutoAdvanceMode()
      ? signalRecord.groupLabel || signalRecord.category || "Signal"
      : signalRecord.label || signalRecord.componentType || "",
    rule: positionRule,
    position,
    signalClipUrl: signalRecord.clipUrl || "",
    signal: {
      category: signalRecord.category || "",
      componentType: signalRecord.componentType || "",
      label: signalRecord.label || "",
      record: signalRecord,
    },
  } : null;
  const signalFullCallQuestion = _isSignalFullCallMode() && Array.isArray(item.signalFullCallClips) && item.signalFullCallClips.length ? {
    type: "signal_full_call",
    prompt: "What is the full play call?",
    detailLabel: "Signal sequence",
    detailValue: item.signalFullCallClips
      .map((record) => `${record.label || record.componentType || "Signal"}: ${_quizSignalAnswerLabel(record)}`)
      .filter(Boolean)
      .join(" · "),
    rule: positionRule,
    position,
    signalClips: item.signalFullCallClips,
  } : null;
  const callQuestion = canAskRecognition ? {
    type: "call",
    prompt: "What's the call?",
    detailLabel: "",
    detailValue: "",
    rule: positionRule,
    position,
  } : null;

  const candidates = [];
  if (_isSignalFullCallMode()) {
    candidates.push(signalFullCallQuestion);
  } else if (_quizMode === "signal-study" || _isSignalAutoAdvanceMode()) {
    candidates.push(signalQuestion);
  } else if (_quizMode === "diagram") {
    candidates.push(diagramQuestion, diagramFormationQuestion, formationQuestion, signalQuestion, typeQuestion, callQuestion, ruleQuestion, ruleToPlayQuestion);
  } else if (_quizMode === "job") {
    candidates.push(ruleQuestion, ruleToPlayQuestion, signalQuestion, diagramQuestion, diagramFormationQuestion, formationQuestion, typeQuestion, callQuestion);
  } else {
    if (_quizIndex % 3 !== 1) candidates.push(ruleQuestion);
    if (_quizIndex % 4 === 0 || !positionRule) candidates.push(diagramQuestion, diagramFormationQuestion);
    if (_quizIndex % 5 === 2) candidates.push(signalQuestion);
    if (_quizIndex % 2 === 1) candidates.push(ruleToPlayQuestion);
    candidates.push(diagramQuestion, diagramFormationQuestion, formationQuestion, signalQuestion, typeQuestion, callQuestion, ruleQuestion, ruleToPlayQuestion);
  }

  const selected = _selectQuizQuestion(candidates, item);
  if (selected) return selected;

  const attempted = candidates.filter(Boolean)[0];
  const reason = attempted ? _quizQuestionQuality(attempted, item).reason : "no-candidates";
  return _buildQuizStudyCardQuestion(item, position, reason);
}

function _buildQuizChoices(item) {
  const questionKey = _quizItemKey(item);
  if (_quizChoiceCache.has(questionKey)) {
    const cached = _quizChoiceCache.get(questionKey);
    return Array.isArray(cached) ? cached : cached.choices || [];
  }

  const question = _buildQuizQuestion(item);
  if (question.type === "custom_multiple_choice") {
    const choices = (question.custom?.options || []).map((label, index) => ({
      key: `${_quizChoiceKey(item)}::custom::${index}`,
      play: item.play,
      label: _quizCleanText(label),
      correct: Number(question.custom?.correctIndex) === index,
      questionType: question.type,
      color: SCRIPT_QUIZ_CHOICE_COLORS[index % SCRIPT_QUIZ_CHOICE_COLORS.length],
    })).filter((choice) => choice.label);
    _quizChoiceCache.set(questionKey, { question, choices });
    return choices;
  }
  const correctLabel = _quizQuestionChoiceLabel(item, question);
  if (question.type === "study_card") {
    _quizChoiceCache.set(questionKey, { question, choices: [] });
    return [];
  }
  const correct = {
    key: `${_quizChoiceKey(item)}::${question.type}::correct`,
    play: item.play,
    label: correctLabel,
    correct: true,
    questionType: question.type,
  };
  const labels = new Set([correctLabel.toLowerCase()]);
  // Preserve the similarity ranking from _quizQuestionDistractorItems (most
  // believable look-alikes first) instead of shuffling the whole pool. Take a
  // plausibility window, then shuffle within it so wrong answers stay
  // convincing while repeated quizzes still vary which ones appear.
  const pool = _quizQuestionDistractorItems(item, question)
    .map((candidate) => {
      const label = _quizQuestionChoiceLabel(candidate, question);
      return {
        key: `${_quizChoiceKey(candidate)}::${question.type}`,
        play: candidate.play,
        label,
        correct: false,
        questionType: question.type,
      };
    })
    .filter((choice) => {
      const labelKey = choice.label.toLowerCase();
      if (!labelKey || labels.has(labelKey)) return false;
      if (!_quizChoiceQuality(choice.label, question.type).ok) return false;
      labels.add(labelKey);
      return true;
    });

  const distractors = _quizShuffle(pool.slice(0, QUIZ_DISTRACTOR_WINDOW)).slice(0, 3);
  const choices = _quizShuffle([correct, ...distractors]).map((choice, idx) => ({
    ...choice,
    color: SCRIPT_QUIZ_CHOICE_COLORS[idx % SCRIPT_QUIZ_CHOICE_COLORS.length],
  }));
  const result = choices.length >= 2 && _quizChoiceQuality(correctLabel, question.type).ok ? choices : [];
  _quizChoiceCache.set(questionKey, { question, choices: result });
  return result;
}

function _getQuizQuestionAndChoices(item) {
  const questionKey = _quizItemKey(item);
  const cached = _quizChoiceCache.get(questionKey);
  if (cached && Array.isArray(cached.choices)) return cached;
  const choices = _buildQuizChoices(item);
  const next = _quizChoiceCache.get(questionKey);
  if (next && Array.isArray(next.choices)) return next;
  return { question: _buildQuizQuestion(item), choices };
}

function _quizCoachDetails(itemOrPlay) {
  const item = itemOrPlay?.play ? itemOrPlay : null;
  const play = item ? item.play : itemOrPlay;
  const position = _getQuizPositionForItem(item);
  const positionRule = position?.key ? play[position.key] : "";
  const ruleParts = [positionRule, play.respNotes].filter(Boolean);
  const noteParts = [play.playerNotes, play.notes].filter(Boolean);
  return { ruleParts, noteParts, position };
}

function _quizQuestionTypeLabel(type) {
  const labels = {
    responsibility: "Responsibility",
    play_from_rule: "Rule to Play",
    diagram: "Diagram ID",
    diagram_formation: "Formation ID",
    formation_to_play: "Formation Match",
    signal: "Signal ID",
    signal_full_call: "Full Play Call",
    play_type: "Play Type",
    study_card: "Study Card",
    call: "Call ID",
    custom_multiple_choice: "Coach Question",
  };
  return labels[type] || "Quiz";
}

function _getQuizAnswerContext(item, answer) {
  if (!item || !answer) return null;
  const data = _getQuizQuestionAndChoices(item);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const selected = choices.find((choice) => choice.key === answer.choiceKey) || null;
  const correctChoice = choices.find((choice) => choice.correct) || null;
  const question = data.question || _buildQuizQuestion(item);
  return {
    question,
    selected,
    correctChoice,
    questionType: answer.questionType || question?.type || "call",
  };
}

function _quizDiagramUrl(play) {
  if (!play) return "";
  if (typeof window.getPlayImageUrl === "function") {
    return window.getPlayImageUrl(play) || "";
  }
  if (window.playImages && typeof window.playImages.urlForPlay === "function") {
    return window.playImages.urlForPlay(play) || "";
  }
  return "";
}

function _renderQuizRedactedDiagram(play, diagramUrl = _quizDiagramUrl(play)) {
  if (!diagramUrl) return "";
  return `
    <figure class="sq-diagram-prompt" aria-label="Redacted play diagram">
      <div class="sq-diagram-prompt__stage">
        <img src="${escapeAttr(diagramUrl)}" alt="Redacted diagram for quiz question" loading="lazy" decoding="async" data-smart-diagram="true" data-smart-diagram-keep-visible="true">
        <span class="sq-diagram-redaction-band" aria-hidden="true"></span>
      </div>
      <figcaption>Top title band hidden for quiz</figcaption>
      <span class="sr-only">Play diagram with the title area hidden until you reveal the answer.</span>
    </figure>
  `;
}

function _renderQuizWrongReview(item, answer) {
  const context = _getQuizAnswerContext(item, answer);
  if (!context || answer.correct) return "";
  const { play } = item;
  const { ruleParts, noteParts, position } = _quizCoachDetails(item);
  const diagramUrl = _quizDiagramUrl(play);
  const correctLabel = context.correctChoice?.label || _quizPlainCall(play);
  const selectedLabel = context.selected?.label || "That answer";
  const sourceHint = context.questionType === "responsibility"
    ? `Study the ${position?.label || "your"} rule and connect it back to the call.`
    : context.questionType === "play_from_rule"
      ? "Match the rule language back to the full call."
      : context.questionType === "diagram_formation"
        ? "Use the formation picture, alignment, and personnel clues."
        : context.questionType === "formation_to_play"
          ? "Connect the formation clue back to the play name."
          : context.questionType === "signal"
            ? "Connect the play component to the short signal clip you studied."
            : context.questionType === "signal_full_call"
              ? "Read the signal sequence as a full call: formation or board cue, motion, tag, protection, and play name together."
              : context.questionType === "play_type"
                ? "Sort the call into run, pass, screen, RPO, or another play family."
                : "Use the formation, personnel, and tags to identify the call.";
  return `
    <div class="sq-review-card" role="note" aria-label="Wrong answer review">
      <div class="sq-review-kicker">Review this one</div>
      <div class="sq-review-main">
        <span><strong>You picked</strong><small>${escapeHtml(selectedLabel)}</small></span>
        <span><strong>Correct answer</strong><small>${escapeHtml(correctLabel)}</small></span>
      </div>
      ${ruleParts.length ? `<div class="sq-review-detail"><strong>${escapeHtml(position?.label || "Your")} Rule:</strong> ${ruleParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${noteParts.length ? `<div class="sq-review-detail"><strong>Coach note:</strong> ${noteParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${diagramUrl ? `
        <figure class="sq-review-diagram">
          <img src="${escapeAttr(diagramUrl)}" alt="Correct play diagram" loading="lazy" decoding="async" data-smart-diagram="true" data-smart-diagram-keep-visible="true">
          <figcaption>Diagram to study</figcaption>
        </figure>
      ` : ""}
      <div class="sq-review-next">${escapeHtml(sourceHint)}</div>
    </div>
  `;
}

function _renderQuizChoice(choice, answer) {
  const answered = Boolean(answer);
  const selected = answer && answer.choiceKey === choice.key;
  const stateClass = answered && choice.correct
    ? " is-correct"
    : answered && selected
      ? " is-wrong"
      : "";
  const selectedAttr = selected ? ' aria-pressed="true"' : ' aria-pressed="false"';
  const disabledAttr = answered ? " disabled" : "";
  const icon = choice.color === "blue" ? "▲" : choice.color === "red" ? "◆" : choice.color === "gold" ? "●" : "■";
  return `
    <button type="button"
      class="script-quiz-choice script-quiz-choice--${escapeAttr(choice.color)}${stateClass}"
      data-action="answerScriptQuizChoice"
      data-arg="${escapeAttr(choice.key)}"
      ${selectedAttr}${disabledAttr}>
      <span class="sq-choice-icon" aria-hidden="true">${icon}</span>
      <span class="sq-choice-label">${escapeHtml(choice.label)}</span>
    </button>
  `;
}

function _getQuizChoiceLengthTone(choices) {
  const maxLength = (Array.isArray(choices) ? choices : []).reduce((max, choice) => (
    Math.max(max, _quizCleanText(choice?.label || "").length)
  ), 0);
  if (maxLength >= 86) return "very-long";
  if (maxLength >= 48) return "long";
  return "";
}

function _getQuizCorrectMomentLabel(answer = {}) {
  const type = answer.questionType || "";
  if (type === "diagram" || type === "diagram_formation") return "Clean read";
  if (type === "responsibility" || type === "play_from_rule") return "Locked in";
  if (type === "formation_to_play" || type === "play_type") return "Great memory";
  return "Nice rep";
}

function _getQuizStreakMoment(streak = 0) {
  const count = Number(streak || 0);
  if (count >= 10) return { label: "10 in a row", detail: "Playbook locked in.", hot: true };
  if (count >= 5) return { label: "5 in a row", detail: "Hot streak.", hot: true };
  if (count >= 3) return { label: "3 in a row", detail: "Keep stacking clean answers.", hot: true };
  return null;
}

function _renderQuizInlineFeedback(item, answer) {
  if (!item || !answer || _quizSourceType !== "signal") return "";
  const correct = Boolean(answer.correct);
  const correctLabel = answer.correctLabel || _quizPlainCall(item.play);
  const selectedLabel = answer.selectedLabel || "";
  const continueLabel = _quizIndex >= _quizPlays.length - 1 ? "Finish quiz" : "Continue to next question";
  // Signal Study is intentionally self-paced. Its footer navigation can be
  // visually distant (and is disabled while the answer state settles on some
  // mobile browsers), so keep a first-class continuation beside the feedback.
  const continueHtml = !_isSignalAutoAdvanceMode()
    ? `<button type="button" class="btn btn-primary sq-feedback-continue" data-action="nextScriptQuizPlay">${escapeHtml(continueLabel)} <span aria-hidden="true">→</span></button>`
    : "";
  const detail = correct
    ? answer.momentLabel || _getQuizCorrectMomentLabel(answer)
    : `Answer: ${correctLabel}`;
  return `
    <div class="sq-answer-flash ${correct ? "is-correct" : "is-wrong"}" role="status" aria-live="polite">
      <strong>${correct ? "Correct" : "Incorrect"}</strong>
      <span>${escapeHtml(detail)}</span>
      ${!correct && selectedLabel ? `<small>You picked ${escapeHtml(selectedLabel)}</small>` : ""}
      ${continueHtml}
    </div>
  `;
}

function _renderQuizFeedback(item, answer, options = {}) {
  if (!answer) return "";
  const includeContinue = options.includeContinue !== false;
  const { play } = item;
  const fullCall = typeof getFullCall === "function"
    ? getFullCall(play, { showEmoji: false })
    : escapeHtml(_quizPlainCall(play));
  const defenseItems = [play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean);
  const { ruleParts, noteParts, position } = _quizCoachDetails(item);
  const resultText = answer.correct ? "Correct" : "Review this rep";
  const resultClass = answer.correct ? "is-correct" : "is-wrong";
  const momentLabel = answer.correct ? (answer.momentLabel || _getQuizCorrectMomentLabel(answer)) : "";
  const streakMoment = answer.correct ? _getQuizStreakMoment(answer.streakAfter) : null;
  const reviewPrompt = answer.correct ? "" : "No problem. Study the call, rule, and coach note, then try it again later.";
  const continueLabel = _quizIndex >= _quizPlays.length - 1 ? "Finish quiz" : "Continue to next question";
  return `
    <div class="sq-feedback ${resultClass}${streakMoment?.hot ? " is-hot-streak" : ""}">
      <div class="sq-feedback-result">${escapeHtml(resultText)}</div>
      ${reviewPrompt ? `<div class="sq-feedback-calm">${escapeHtml(reviewPrompt)}</div>` : ""}
      ${momentLabel ? `<div class="sq-feedback-moment">${escapeHtml(momentLabel)}</div>` : ""}
      ${streakMoment ? `
        <div class="sq-feedback-streak">
          <strong>${escapeHtml(streakMoment.label)}</strong>
          <span>${escapeHtml(streakMoment.detail)}</span>
        </div>` : ""}
      <div class="sq-answer-call">${fullCall}</div>
      ${defenseItems.length ? `<div class="sq-answer-defense">vs ${defenseItems.map(escapeHtml).join(" / ")}</div>` : ""}
      ${ruleParts.length ? `<div class="sq-answer-note"><strong>${escapeHtml(position?.label || "Your")} Rule:</strong> ${ruleParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${noteParts.length ? `<div class="sq-answer-note"><strong>Coach note:</strong> ${noteParts.map(escapeHtml).join(" ")}</div>` : ""}
      ${_renderQuizWrongReview(item, answer)}
      ${includeContinue ? `<button type="button" class="btn btn-primary sq-feedback-continue" data-action="nextScriptQuizPlay">${escapeHtml(continueLabel)} <span aria-hidden="true">→</span></button>` : ""}
    </div>
  `;
}

function isScriptQuizAwaitingAnswer() {
  const item = _quizPlays[_quizIndex];
  if (!item) return false;
  const choices = _quizCurrentChoices.length ? _quizCurrentChoices : _getQuizQuestionAndChoices(item).choices;
  return choices.length >= 2 && !_quizAnswers.has(_quizItemKey(item));
}

// The choices are re-rendered for every rep. Keep their critical answer/next
// route owned by the quiz overlay instead of depending solely on the app-wide
// delegated router, which may be intercepted by other modal or mobile layers.
// Authentication still runs first in its document capture handler.
function initScriptQuizInteractionRouting() {
  const overlay = document.getElementById("scriptQuizOverlay");
  if (!overlay || overlay.dataset.quizInteractionRouting === "true") return;
  overlay.dataset.quizInteractionRouting = "true";
  overlay.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target || !overlay.contains(target) || target.disabled) return;
    const action = target.dataset.action;
    if (action !== "answerScriptQuizChoice" && action !== "nextScriptQuizPlay") return;
    if (typeof isActionAllowedForRole === "function" && !isActionAllowedForRole(action)) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "answerScriptQuizChoice") {
      answerScriptQuizChoice(target.dataset.arg || "");
      return;
    }
    nextScriptQuizPlay();
  }, true);
}

document.addEventListener("DOMContentLoaded", initScriptQuizInteractionRouting);

async function startScriptQuiz(options = {}) {
  const launchStartedAt = _quizPerfNow();
  const opts = options && typeof options === "object" ? options : {};
  const requestedSourceType = String(opts.sourceType || "").trim();
  const sourceType = ["gameplan", "signal", "assignment"].includes(requestedSourceType) ? requestedSourceType : "script";
  const items = Array.isArray(opts.items) ? opts.items : _buildQuizPlays(false);
  _quizMode = String(opts.mode || "full");
  const playerQuiz = typeof _isPlayerQuizWorkspace === "function" && _isPlayerQuizWorkspace();
  _quizReturnDestination = ["quiz", "practice", "stay"].includes(opts.returnDestination)
    ? opts.returnDestination
    : playerQuiz
      ? "quiz"
      : "stay";
  let normalizedItems = opts.mode
    ? _prepareQuizItemsForMode(items, _quizMode)
    : _normalizeQuizItems(items);
  if (_quizMode === "diagram-flash") {
    normalizedItems = await _resolveDiagramFlashItems(normalizedItems);
    if (!normalizedItems.length) {
      showToast("No published diagrams are ready for this practice yet. Ask your coach to publish the diagram media, then try again.", { type: "warning", duration: 4500 });
      return;
    }
  }
  if (!normalizedItems.length) {
    showToast("Add plays to the script before starting a quiz", { type: "warning" });
    return;
  }
  _quizShuffled = false;
  _quizSourceType = sourceType;
  _quizSourceId = String(opts.sourceId || "");
  _quizAssignmentId = sourceType === "assignment" ? String(opts.assignmentId || opts.sourceId || "") : "";
  _quizAllowedQuestionTypes = Array.isArray(opts.questionTypes)
    ? opts.questionTypes.filter((type) => ["responsibility", "diagram", "signal", "call", "play_from_rule"].includes(String(type)))
    : [];
  _quizSignalCategories = sourceType === "signal" ? _normalizeSignalGameCategories(opts.signalCategories) : [];
  _quizSignalMultiplier = sourceType === "signal"
    ? _getSignalCategoryMultiplier(_quizSignalCategories, _getSignalGameSettings().eligibleCategories)
    : 1;
  if (sourceType === "signal" && Number(opts.signalCategoryMultiplier || 0) > 0) {
    _quizSignalMultiplier = Number(opts.signalCategoryMultiplier);
  }
  _quizSourceWeight = _getQuizSourceWeight(sourceType) * _quizSignalMultiplier;
  _quizTitle = opts.title || (sourceType === "gameplan" ? "Game Plan Quiz" : sourceType === "signal" ? "Signal Study" : sourceType === "assignment" ? "Homework Quiz" : "Practice Script Quiz");
  if (opts.positionMode) {
    _quizPositionMode = _normalizeQuizPositionMode(opts.positionMode);
  }
  if (opts.positionKey && _getQuizPositions().some((position) => position.key === opts.positionKey)) {
    _quizPositionKey = opts.positionKey;
    if (!opts.positionMode) _quizPositionMode = "manual";
  }
  _syncPlayerQuizPositionDefault();
  _setQuizPlays(_prepareQuizItemsForPositionMode(normalizedItems, _quizPositionMode), false);
  _quizIndex = 0;
  _resetQuizGameState();
  _quizTimeLimitMs = Math.max(0, Number(opts.timeLimitMs || 0));
  _quizStartedAt = 0;
  _quizFinishedAt = 0;
  _clearPlayerQuizDraft();
  const mediaPrepToken = ++_quizMediaPrepToken;
  _quizLaunchStartedAt = launchStartedAt;
  _quizFirstQuestionVisibleRecorded = false;
  _quizPerfMark("launch-start", {
    requestedSourceType: sourceType,
    requestedMode: _quizMode,
    normalizedCount: normalizedItems.length,
  });

  const overlay = document.getElementById("scriptQuizOverlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  const titleEl = document.getElementById("scriptQuizTitle");
  if (titleEl) titleEl.textContent = _quizTitle;
  const progressEl = document.getElementById("scriptQuizProgress");
  if (progressEl) progressEl.textContent = "Preparing first rep...";
  const scenarioEl = document.getElementById("scriptQuizScenario");
  if (scenarioEl) {
    scenarioEl.className = "script-quiz-scenario";
    setInnerHTML(scenarioEl, `
      <div class="sq-scenario-block">
        <div class="sq-scenario-label">Quiz</div>
        <div class="sq-scenario-value">Loading first rep...</div>
      </div>`);
  }
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "scriptQuizOverlay",
      scrollElement: "scriptQuizCard",
      blocking: true,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
  }
  await _prepareQuizMedia(_quizPlays, { signalWindow: SIGNAL_QUIZ_PRELOAD_WINDOW });
  if (mediaPrepToken !== _quizMediaPrepToken) return;
  _quizPerfRecord("launch-to-ready", launchStartedAt);
  _quizStartedAt = _quizTimeLimitMs || _isSignalAutoAdvanceMode() ? Date.now() : 0;
  _startQuizTimerIfNeeded();
  _preloadUpcomingQuizSignalMedia(0);
  renderScriptQuizPlay();
}

function closeScriptQuiz() {
  const overlay = document.getElementById("scriptQuizOverlay");
  if (!overlay) return;
  if (!_quizFinished && (_quizTimeLimitMs || _isSignalAutoAdvanceMode()) && _quizPlays.length) {
    endScriptQuiz();
    return;
  }
  if (!_quizFinished && _quizPlays.length && !_quizExitSummaryOpen) {
    _clearStandardQuizAdvance();
    _savePlayerQuizDraft();
    _renderQuizExitSummary();
    return;
  }
  _closeScriptQuizOverlayTo(_quizReturnDestination);
}

function _closeScriptQuizOverlayTo(destination = "stay") {
  _clearStandardQuizAdvance();
  const overlay = document.getElementById("scriptQuizOverlay");
  if (overlay) {
    if (typeof closeLayer === "function") closeLayer(overlay);
    overlay.classList.add("hidden");
  }
  _quizExitSummaryOpen = false;
  const playerQuiz = typeof _isPlayerQuizWorkspace === "function" && _isPlayerQuizWorkspace();
  if (!playerQuiz) {
    if (typeof isQuizPageActive === "function" && isQuizPageActive()) renderQuizPage();
    return;
  }
  _renderPlayerQuizHub();
  if (destination === "practice") {
    if (typeof showTab === "function") showTab("script");
    return;
  }
  if (destination === "quiz") {
    if (typeof showTab === "function") showTab("quiz");
    if (typeof renderQuizPage === "function") renderQuizPage();
    return;
  }
  if (typeof isQuizPageActive === "function" && isQuizPageActive()) renderQuizPage();
}

function toggleScriptQuizShuffle() {
  if (_quizTimeLimitMs || _isSignalAutoAdvanceMode()) {
    showToast("Signal games stay in fixed order.", { type: "info" });
    return;
  }
  _quizShuffled = !_quizShuffled;
  _setQuizPlays(_quizBasePlays, _quizShuffled);
  _quizIndex = 0;
  _resetQuizGameState();
  _clearPlayerQuizDraft();
  const btn = document.getElementById("scriptQuizShuffleBtn");
  if (btn) btn.classList.toggle("active", _quizShuffled);
  renderScriptQuizPlay();
  showToast(_quizShuffled ? "Quiz shuffled" : "Quiz in script order", { type: "info" });
}

function revealScriptQuizAnswer() {
  if (isScriptQuizAwaitingAnswer()) {
    showToast("Pick an answer first.", { type: "warning" });
    return;
  }
  _quizRevealed = true;
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  const answerEl = document.getElementById("scriptQuizAnswer");
  if (revealRow) revealRow.classList.add("hidden");
  if (answerEl) answerEl.classList.remove("hidden");
}

function nextScriptQuizPlay() {
  if (isScriptQuizAwaitingAnswer()) {
    showToast("Pick an answer first.", { type: "warning" });
    return;
  }
  if (_quizCurrentQuestion?.type === "diagram_flash" && !_quizRevealed) {
    showToast("Flip the card to check the call first.", { type: "info" });
    return;
  }
  if (_quizIndex >= _quizPlays.length - 1) {
    _clearStandardQuizAdvance();
    finishScriptQuiz();
    return;
  }
  if (_quizIndex < _quizPlays.length - 1) {
    _clearStandardQuizAdvance();
    _quizIndex++;
    renderScriptQuizPlay();
    _schedulePlayerQuizDraftSave();
  }
}

function prevScriptQuizPlay() {
  if (_quizIndex > 0) {
    _clearStandardQuizAdvance();
    _quizIndex--;
    renderScriptQuizPlay();
    _schedulePlayerQuizDraftSave();
  }
}

function _advanceSignalGameAfterAnswer(questionKey) {
  if (!_isSignalAutoAdvanceMode() || _quizFinished) return;
  if (_isSignalSprintMode() && _getQuizRemainingMs() <= 0) {
    finishScriptQuiz({ timedOut: true });
    return;
  }
  const answer = _quizAnswers.get(questionKey);
  const advanceDelay = answer?.correct ? SIGNAL_QUIZ_CORRECT_ADVANCE_MS : SIGNAL_QUIZ_WRONG_FEEDBACK_MS;
  if (_isSignalHeatCheckMode() && answer && !answer.correct) {
    setTimeout(() => {
      if (_quizFinished) return;
      finishScriptQuiz();
    }, SIGNAL_QUIZ_HEAT_MISS_FINISH_MS);
    return;
  }
  if (_quizIndex >= _quizPlays.length - 1) {
    setTimeout(() => {
      if (!_quizFinished) finishScriptQuiz();
    }, advanceDelay);
    return;
  }
  setTimeout(() => {
    if (!_isSignalAutoAdvanceMode() || _quizFinished) return;
    const item = _quizPlays[_quizIndex];
    if (!item || _quizItemKey(item) !== questionKey) return;
    if (_isSignalSprintMode() && _getQuizRemainingMs() <= 0) {
      finishScriptQuiz({ timedOut: true });
      return;
    }
    if (_isSignalHeatCheckMode()) {
      const latest = _quizAnswers.get(questionKey);
      if (latest && !latest.correct) {
        finishScriptQuiz();
        return;
      }
    }
    _quizIndex++;
    _resetQuizRoundState();
    renderScriptQuizPlay();
  }, advanceDelay);
}

// Every scored standard question gets a bounded feedback-to-next transition.
// Misses used to remain in place, which looked exactly like a broken answer
// button on touch devices. Flash-card study reps remain deliberately manual.
function _celebrateCorrectQuizChoice(questionKey) {
  const scenarioEl = document.getElementById("scriptQuizScenario");
  if (!scenarioEl || scenarioEl.dataset.quizKey !== questionKey) return;
  const correctBtn = scenarioEl.querySelector(".script-quiz-choice.is-correct");
  if (correctBtn && !correctBtn.querySelector(".sq-choice-burst")) {
    correctBtn.classList.add("is-celebrating");
    const burst = document.createElement("span");
    burst.className = "sq-choice-burst";
    burst.setAttribute("aria-hidden", "true");
    burst.textContent = "✓";
    correctBtn.appendChild(burst);
  }
  const flash = scenarioEl.querySelector(".sq-answer-flash.is-correct");
  if (flash) flash.classList.add("is-celebrating");
}

function _maybeAutoAdvanceQuizAfterAnswer(questionKey) {
  // Every non-timed quiz is intentionally player-paced after an answer.
  // A previous delayed advance raced the visible Continue control, especially
  // on phones where a delayed render can land after the player has tapped.
  // Timed signal modes advance through _advanceSignalGameAfterAnswer instead.
  if (_isSignalAutoAdvanceMode() || _quizFinished) return;
  const answer = _quizAnswers.get(questionKey);
  if (!answer) return;
  if (answer.correct) _celebrateCorrectQuizChoice(questionKey);
  _clearStandardQuizAdvance();
}

function _focusQuizContinuation() {
  if (_isSignalAutoAdvanceMode()) return;
  requestAnimationFrame(() => {
    const continueButton = document.querySelector(
      _quizSourceType === "signal"
        ? "#scriptQuizScenario .sq-feedback-continue"
        : "#scriptQuizAnswer .sq-feedback-continue",
    );
    if (!(continueButton instanceof HTMLButtonElement) || continueButton.disabled) return;
    // Keep the next safe action in view after the answer state expands (wrong
    // answers can include a rule and diagram), without a jump back to page top.
    continueButton.scrollIntoView({ block: "nearest", behavior: "smooth" });
    try { continueButton.focus({ preventScroll: true }); } catch (_err) { continueButton.focus(); }
  });
}

function answerScriptQuizChoice(choiceKey) {
  const item = _quizPlays[_quizIndex];
  if (!item) return;
  const questionKey = _quizItemKey(item);
  if (_quizAnswers.has(questionKey)) return;
  if (_isSignalBattleMode()) {
    const phase = _getSignalBattlePhase();
    if (phase === "clip") {
      showToast("Watch the signal first.", { type: "info", duration: 1000 });
      return;
    }
    if (phase === "expired") {
      _recordSignalBattleTimeout(questionKey);
      return;
    }
  }
  const choices = _quizCurrentChoices.length ? _quizCurrentChoices : _getQuizQuestionAndChoices(item).choices;
  const selected = choices.find((choice) => choice.key === choiceKey);
  if (!selected) return;
  const correct = Boolean(selected.correct);
  const position = _quizCurrentQuestion?.position || _getQuizPositionForItem(item);
  const questionType = selected.questionType || "call";
  if (correct) {
    _quizStreak += 1;
    _quizBestStreak = Math.max(_quizBestStreak, _quizStreak);
    _quizScore += _getQuizCorrectAnswerPoints(_quizStreak);
  } else {
    _quizStreak = 0;
  }
  const reactionMs = _isSignalBattleMode()
    ? Math.max(0, Math.min(SIGNAL_BATTLE_ANSWER_MS, Date.now() - _quizRoundClipUntil))
    : 0;
  _quizAnswers.set(questionKey, {
    choiceKey,
    correct,
    questionType,
    positionKey: position?.key || item.positionKey || _quizPositionKey,
    positionLabel: position?.label || "",
    selectedLabel: selected.label || "",
    correctLabel: choices.find((choice) => choice.correct)?.label || "",
    prompt: _quizCurrentQuestion?.prompt || "",
    playCall: _quizPlainCall(item.play),
    streakAfter: correct ? _quizStreak : 0,
    momentLabel: correct ? _getQuizCorrectMomentLabel({ questionType }) : "",
    elapsedMs: _getQuizElapsedMs(),
    reactionMs,
    answeredAt: new Date().toISOString(),
  });
  if (_isSignalBattleMode()) _resetQuizRoundState();
  renderScriptQuizPlay();
  _schedulePlayerQuizDraftSave();
  _focusQuizContinuation();
  _advanceSignalGameAfterAnswer(questionKey);
  _maybeAutoAdvanceQuizAfterAnswer(questionKey);
}

// app-events routes declarative actions through window[action]. These are
// player-safe quiz controls, so explicitly publish the two dynamic controls
// rather than relying on browser-specific top-level declaration behavior.
if (typeof window !== "undefined") {
  window.answerScriptQuizChoice = answerScriptQuizChoice;
  window.nextScriptQuizPlay = nextScriptQuizPlay;
}

function _getQuizAnswerReviewRows() {
  return _quizPlays
    .map((item) => {
      const answer = _quizAnswers.get(_quizItemKey(item));
      if (!answer) return null;
      const context = _getQuizAnswerContext(item, answer);
      const correctLabel = context?.correctChoice?.label || answer.correctLabel || _quizPlainCall(item.play);
      const selectedLabel = context?.selected?.label || answer.selectedLabel || "";
      return {
        item,
        answer,
        correct: Boolean(answer.correct),
        questionType: answer.questionType || context?.questionType || "call",
        questionLabel: _quizQuestionTypeLabel(answer.questionType || context?.questionType || "call"),
        positionKey: answer.positionKey || item.positionKey || "",
        positionLabel: answer.positionLabel || context?.question?.position?.label || "",
        prompt: context?.question?.prompt || answer.prompt || "",
        selectedLabel,
        correctLabel,
        playCall: _quizPlainCall(item.play),
      };
    })
    .filter(Boolean);
}

function _summarizeQuizReviewRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const misses = list.filter((row) => !row.correct);
  const strengths = list.filter((row) => row.correct);
  const missTypes = [...new Set(misses.map((row) => row.questionLabel).filter(Boolean))];
  const strengthTypes = [...new Set(strengths.map((row) => row.questionLabel).filter(Boolean))];
  return {
    misses,
    strengths,
    missTypes,
    strengthTypes,
    nextReview: misses[0]?.playCall || "",
  };
}

function _renderQuizResultReview(summary, review) {
  const data = review || _summarizeQuizReviewRows(_getQuizAnswerReviewRows());
  const sourceLabel = _getQuizSourceLabel(summary.sourceType, "sentence");
  if (!data.misses.length) {
    const strengthText = data.strengthTypes.length
      ? `You were strongest on ${data.strengthTypes.slice(0, 2).join(" and ")} questions.`
      : `You handled every answered ${sourceLabel} question.`;
    return `
      <div class="sq-result-review sq-result-review--clean">
        <strong>Clean finish</strong>
        <span>${escapeHtml(strengthText)} Keep reviewing the next ${sourceLabel} before practice.</span>
      </div>
    `;
  }
  const missText = data.missTypes.length
    ? `Missed area${data.missTypes.length === 1 ? "" : "s"}: ${data.missTypes.slice(0, 3).join(", ")}.`
    : "Missed area: review the call and rule language.";
  return `
    <div class="sq-result-review">
      <strong>Review next: ${escapeHtml(data.nextReview || sourceLabel)}</strong>
      <span>${escapeHtml(missText)}</span>
      <div class="sq-result-miss-list">
        ${data.misses.slice(0, 3).map((row) => `
          <span>
            <b>${escapeHtml(row.questionLabel)}</b>
            <small>${escapeHtml(row.correctLabel)}</small>
          </span>
        `).join("")}
      </div>
      <button type="button" class="btn btn-sm btn-primary sq-result-retry-btn" data-action="startQuizMissRetryFromResult">
        Retry 3 now
      </button>
    </div>
  `;
}

function startQuizMissRetryFromResult() {
  const missedRows = _getQuizAnswerReviewRows().filter((row) => !row.correct).slice(0, 3);
  if (!missedRows.length) {
    showToast("No missed plays to retry from this result.", { type: "info" });
    return;
  }
  const retryItems = missedRows
    .map((row, idx) => ({
      play: row.item?.play,
      period: "3-question retry",
      scriptIndex: idx,
      positionKey: row.positionKey || _quizPositionKey,
    }))
    .filter((item) => item.play);
  if (!retryItems.length) {
    showToast("Those missed plays are no longer available.", { type: "warning" });
    return;
  }
  startScriptQuiz({
    items: retryItems,
    sourceType: _quizSourceType,
    sourceId: _quizSourceId,
    title: "3-Question Retry",
    positionKey: retryItems[0]?.positionKey || _quizPositionKey,
    positionMode: "manual",
    mode: "retry",
  });
}

function _getQuizResultRewardMoment(summary = {}) {
  if (!summary || summary.completed === false || !Number(summary.answered || 0)) return null;
  if (Number(summary.bonusPoints || 0) > 0) {
    return {
      icon: "⭐",
      label: `${summary.badge || "Quiz"} reward`,
      detail: `+${Math.round(summary.bonusPoints)} bonus points added to your week.`,
    };
  }
  if (Number(summary.percent || 0) >= 95 && summary.badge && summary.badge !== "Keep Climbing") {
    return {
      icon: "🏅",
      label: `${summary.badge} finish`,
      detail: "Badge posted to your quiz profile.",
    };
  }
  if (Number(summary.bestStreak || 0) >= 5) {
    return {
      icon: "🔥",
      label: `${summary.bestStreak}-answer streak`,
      detail: "That streak is on your attempt summary.",
    };
  }
  return null;
}

function _renderQuizResultRewardMoment(summary = {}) {
  const moment = _getQuizResultRewardMoment(summary);
  if (!moment) return "";
  return `
    <div class="sq-result-reward-moment">
      <span aria-hidden="true">${escapeHtml(moment.icon)}</span>
      <strong>${escapeHtml(moment.label)}</strong>
      <small>${escapeHtml(moment.detail)}</small>
    </div>
  `;
}

function _getQuizResultReadyMoment(summary = {}) {
  if (!summary || summary.completed === false || Number(summary.answered || 0) < 3) return null;
  const percent = Number(summary.percent || 0);
  const wrong = Number(summary.wrong || 0);
  if (percent >= 95 && wrong === 0) {
    return {
      tone: "locked",
      label: "Practice ready",
      detail: "Clean finish. Take this confidence into the next script.",
    };
  }
  if (percent >= 85) {
    return {
      tone: "ready",
      label: "Ready to roll",
      detail: wrong ? "Good finish. Hit the missed call once more before practice." : "Strong finish. Keep the call speed high.",
    };
  }
  if (percent >= 70) {
    return {
      tone: "review",
      label: "Close to ready",
      detail: "Run the missed reps once more, then retest.",
    };
  }
  return {
    tone: "study",
    label: "Study target set",
    detail: "Start with the misses below before the next quiz.",
  };
}

function _renderQuizResultReadyMoment(summary = {}) {
  const moment = _getQuizResultReadyMoment(summary);
  if (!moment) return "";
  return `
    <div class="sq-result-ready-moment sq-result-ready-moment--${escapeHtml(moment.tone)}" role="status" aria-live="polite">
      <span>${escapeHtml(moment.label)}</span>
      <strong>${escapeHtml(moment.detail)}</strong>
    </div>
  `;
}

function _renderQuizSprintStats(summary = {}) {
  if (summary.quizMode !== "signal-sprint") return "";
  const duration = _formatQuizClock(summary.durationMs || 0);
  const pace = summary.averageAnswerMs ? `${(summary.averageAnswerMs / 1000).toFixed(1)}s` : "-";
  const finishLabel = summary.timedOut ? "Timed out" : "Ended";
  return `
    <div class="sq-result-sprint">
      <span><strong>${summary.answered}</strong><small>Answered</small></span>
      <span><strong>${duration}</strong><small>${escapeHtml(finishLabel)}</small></span>
      <span><strong>${pace}</strong><small>Avg pace</small></span>
      <span><strong>${summary.correct}</strong><small>Sprint score</small></span>
    </div>
  `;
}

function _renderQuizBattleStats(summary = {}) {
  if (summary.quizMode !== "signal-battle") return "";
  const reaction = summary.averageReactionMs ? `${(summary.averageReactionMs / 1000).toFixed(1)}s` : "-";
  return `
    <div class="sq-result-sprint sq-result-sprint--battle">
      <span><strong>${summary.correct}</strong><small>Battle score</small></span>
      <span><strong>${summary.answered}</strong><small>Answered</small></span>
      <span><strong>${reaction}</strong><small>Avg reaction</small></span>
      <span><strong>${summary.percent}%</strong><small>Accuracy</small></span>
    </div>
  `;
}

function _renderQuizHeatCheckStats(summary = {}) {
  if (summary.quizMode !== "signal-heat") return "";
  return `
    <div class="sq-result-sprint sq-result-sprint--heat">
      <span><strong>${summary.bestStreak}</strong><small>Best streak</small></span>
      <span><strong>${summary.correct}</strong><small>Total correct</small></span>
      <span><strong>${summary.answered}</strong><small>Answered</small></span>
      <span><strong>${Number(summary.signalCategoryMultiplier || 1).toFixed(2)}x</strong><small>${escapeHtml(summary.signalCategoryLabel || "Signals")}</small></span>
    </div>
  `;
}

function _buildQuizAttemptSummary(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const partial = Boolean(opts.partial);
  const timedOut = Boolean(opts.timedOut);
  const answers = Array.from(_quizAnswers.values());
  const answered = answers.length;
  const correct = answers.filter((answer) => answer.correct).length;
  const wrong = answered - correct;
  const questionBreakdown = _summarizeQuizQuestionBreakdown(answers);
  const percent = answered ? Math.round((correct / answered) * 100) : 0;
  const badge = _getQuizBadge(percent);
  const bonusPoints = answered ? _getQuizBonusPoints(badge, answered, partial) : 0;
  const totalPoints = _quizScore + bonusPoints;
  const totalQuestions = _quizPlays.length;
  const remaining = Math.max(0, totalQuestions - answered);
  const now = new Date();
  const reviewRows = _getQuizAnswerReviewRows();
  const review = _summarizeQuizReviewRows(reviewRows);
  const durationMs = _getQuizElapsedMs();
  const timeLimitMs = _quizTimeLimitMs;
  const timeRemainingMs = _getQuizRemainingMs();
  const averageAnswerMs = _getQuizAverageAnswerMs() || (answered ? Math.round(durationMs / answered) : 0);
  const averageReactionMs = _getQuizAverageReactionMs();
  const gameStats = {
    durationMs,
    timeLimitMs,
    timeRemainingMs,
    timedOut,
    averageAnswerMs,
    averageReactionMs,
  };
  return {
    // A stable cryptographic ID lets the server make retrying this saved
    // attempt idempotent without ever accepting a later score rewrite.
    id: _quizSavedAttemptId || _quizEventId("quiz"),
    player: _getQuizPlayerName(),
    sourceType: _quizSourceType,
    sourceId: _quizSourceId,
    title: _quizTitle,
    quizMode: _quizMode,
    quizModeLabel: _quizMode === "full"
      ? "Full Quiz"
      : (_getPlayerQuizModes().find((mode) => mode.key === _quizMode)?.label || "Quiz"),
    positionKey: _quizPositionKey,
    positionMode: _quizPositionMode,
    positionLabel: _getQuizPositionModeLabel(_quizPositionMode),
    score: _quizScore,
    sourceWeight: _quizSourceWeight,
    signalCategories: _quizSignalCategories,
    signalCategoryLabel: _formatSignalCategories(_quizSignalCategories),
    signalCategoryMultiplier: _quizSignalMultiplier,
    bonusPoints,
    totalPoints,
    answered,
    correct,
    wrong,
    questionBreakdown,
    totalQuestions,
    remaining,
    durationMs,
    timeLimitMs,
    timeRemainingMs,
    timedOut,
    averageAnswerMs,
    averageReactionMs,
    percent,
    badge: badge.label,
    bestStreak: _quizBestStreak,
    review: {
      missedCount: review.misses.length,
      missTypes: review.missTypes,
      strengthTypes: review.strengthTypes,
      nextReview: review.nextReview,
      gameStats,
      signalGame: _quizSourceType === "signal" ? {
        mode: _quizMode,
        categories: _quizSignalCategories,
        categoryLabel: _formatSignalCategories(_quizSignalCategories),
        multiplier: _quizSignalMultiplier,
      } : null,
    },
    reviewRows,
    completed: !partial,
    completedAt: now.toISOString(),
    dateKey: _quizDateKey(now),
    weekKey: _quizWeekKey(now),
  };
}

function _saveQuizAttempt(summary) {
  if (!summary || !summary.answered) return null;
  if (_quizSavedAttemptId) return summary;
  const attempts = _getPlayerQuizAttempts();
  attempts.push(summary);
  _savePlayerQuizAttempts(attempts);
  _quizSavedAttemptId = summary.id;
  if (_quizAssignmentId && typeof recordQuizAssignmentAttempt === "function") {
    Promise.resolve(recordQuizAssignmentAttempt(_quizAssignmentId, summary)).catch(() => { });
  }
  return summary;
}

function _setScriptQuizOverlayOpen(open) {
  const overlay = document.getElementById("scriptQuizOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !open);
  if (open) {
    if (typeof openLayer === "function") {
      openLayer(overlay, {
        id: "scriptQuizOverlay",
        scrollElement: "scriptQuizCard",
        blocking: true,
      });
    } else if (typeof trapFocus === "function") {
      trapFocus(overlay);
    }
  } else if (typeof closeLayer === "function") {
    closeLayer(overlay);
  }
}

function _renderQuizExitSummary() {
  _clearStandardQuizAdvance();
  _quizExitSummaryOpen = true;
  const summary = _buildQuizAttemptSummary({ partial: true });
  const scenarioEl = document.getElementById("scriptQuizScenario");
  const answerEl = document.getElementById("scriptQuizAnswer");
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  const progressEl = document.getElementById("scriptQuizProgress");
  const scoreEl = document.getElementById("scriptQuizScore");
  const prevBtn = document.getElementById("scriptQuizPrevBtn");
  const nextBtn = document.getElementById("scriptQuizNextBtn");
  if (progressEl) progressEl.textContent = "Paused";
  if (scoreEl) scoreEl.textContent = `${Math.round(summary.totalPoints)} pts · ${summary.correct} right · ${summary.wrong} wrong`;
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = "Paused";
  }
  if (answerEl) answerEl.classList.add("hidden");
  if (revealRow) revealRow.classList.add("hidden");
  if (scenarioEl) {
    setInnerHTML(scenarioEl, `
      <div class="sq-exit-card">
        <div class="sq-exit-kicker">Quiz paused</div>
        <h3>You scored ${Math.round(summary.totalPoints)} points</h3>
        <p>${summary.correct} right · ${summary.wrong} wrong · ${summary.remaining} question${summary.remaining === 1 ? "" : "s"} left in this ${escapeHtml(_getQuizSourceLabel(summary.sourceType, "sentence"))}.</p>
        <div class="sq-exit-grid">
          <span><strong>${summary.answered}</strong><small>Answered</small></span>
          <span><strong>${summary.totalQuestions}</strong><small>Total</small></span>
          <span><strong>${summary.bestStreak}</strong><small>Best streak</small></span>
          <span><strong>${Math.round(summary.totalPoints)}</strong><small>Points</small></span>
        </div>
        <div class="sq-exit-actions">
          <button type="button" class="btn btn-primary" data-action="resumeScriptQuiz">Pick up where left off</button>
          <button type="button" class="btn btn-outline" data-action="saveAndCloseScriptQuiz">Save &amp; Close</button>
          <button type="button" class="btn btn-danger" data-action="endScriptQuiz">End Quiz</button>
        </div>
      </div>
    `);
  }
}

function resumeScriptQuiz() {
  if (!_quizPlays.length) return;
  _clearStandardQuizAdvance();
  _quizExitSummaryOpen = false;
  renderScriptQuizPlay();
}

function saveAndCloseScriptQuiz() {
  if ((_quizTimeLimitMs || _isSignalAutoAdvanceMode()) && !_quizFinished) {
    endScriptQuiz();
    return;
  }
  _savePlayerQuizDraft();
  _closeScriptQuizOverlayTo(_quizReturnDestination);
}

function endScriptQuiz() {
  if (_quizFinished) return;
  _clearStandardQuizAdvance();
  _quizFinishedAt = Date.now();
  _clearQuizTimer();
  _resetQuizRoundState();
  const summary = _buildQuizAttemptSummary({ partial: true });
  _saveQuizAttempt(summary);
  _clearPlayerQuizDraft();
  _quizFinished = true;
  _quizExitSummaryOpen = false;
  _renderQuizResults(summary);
  _renderPlayerQuizHub();
}

function resumePlayerQuizDraft() {
  const draft = _getPlayerQuizDraft();
  if (!draft) {
    showToast("No quiz in progress.", { type: "info" });
    return false;
  }
  const playsFromDraft = _normalizeQuizItems(draft.plays);
  if (!playsFromDraft.length) {
    _clearPlayerQuizDraft();
    showToast("That saved quiz is no longer available.", { type: "warning" });
    return false;
  }
  _quizBasePlays = _normalizeQuizItems(draft.basePlays?.length ? draft.basePlays : draft.plays);
  _quizPlays = playsFromDraft;
  _quizIndex = Math.max(0, Math.min(Number(draft.index || 0), _quizPlays.length - 1));
  _quizShuffled = Boolean(draft.shuffled);
  _quizSourceType = ["gameplan", "signal", "assignment"].includes(draft.sourceType) ? draft.sourceType : "script";
  _quizSourceId = String(draft.sourceId || "");
  _quizAssignmentId = _quizSourceType === "assignment" ? String(draft.assignmentId || draft.sourceId || "") : "";
  _quizAllowedQuestionTypes = Array.isArray(draft.allowedQuestionTypes) ? draft.allowedQuestionTypes : [];
  _quizSourceWeight = Number(draft.sourceWeight || 0) || _getQuizSourceWeight(_quizSourceType);
  _quizSignalCategories = _quizSourceType === "signal" ? _normalizeSignalGameCategories(draft.signalCategories) : [];
  _quizSignalMultiplier = _quizSourceType === "signal"
    ? Number(draft.signalCategoryMultiplier || 0) || _getSignalCategoryMultiplier(_quizSignalCategories, _getSignalGameSettings().eligibleCategories)
    : 1;
  _quizTitle = draft.title || (_quizSourceType === "gameplan" ? "Game Plan Quiz" : _quizSourceType === "signal" ? "Signal Study" : _quizSourceType === "assignment" ? "Homework Quiz" : "Practice Script Quiz");
  _quizMode = String(draft.quizMode || "full");
  _quizPositionMode = _normalizeQuizPositionMode(draft.positionMode || "manual");
  if (draft.positionKey && _getQuizPositions().some((position) => position.key === draft.positionKey)) {
    _quizPositionKey = draft.positionKey;
  }
  _quizAnswers = new Map(Array.isArray(draft.answers) ? draft.answers : []);
  _quizChoiceCache = new Map();
  _quizCurrentChoices = [];
  _quizCurrentQuestion = null;
  _quizScore = Number(draft.score || 0);
  _quizStreak = Number(draft.streak || 0);
  _quizBestStreak = Number(draft.bestStreak || 0);
  _quizFinished = false;
  _quizSavedAttemptId = "";
  _quizExitSummaryOpen = false;
  _quizReturnDestination = "quiz";
  _clearQuizTimer();
  _clearStandardQuizAdvance();
  _resetQuizRoundState();
  _quizTimeLimitMs = 0;
  _quizStartedAt = 0;
  _quizFinishedAt = 0;
  closePlayerQuizHub({ keepQuizPage: true });
  _setScriptQuizOverlayOpen(true);
  renderScriptQuizPlay();
  return true;
}

function discardPlayerQuizDraft() {
  _clearPlayerQuizDraft();
  _renderPlayerQuizHub();
  if (typeof isQuizPageActive === "function" && isQuizPageActive()) {
    renderQuizPage();
  }
  showToast("Saved quiz ended.", { type: "info" });
}

function _renderQuizResults(summary) {
  const scenarioEl = document.getElementById("scriptQuizScenario");
  const answerEl = document.getElementById("scriptQuizAnswer");
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  const sourceLabel = _getQuizSourceLabel(summary.sourceType);
  const statusLabel = summary.completed === false ? `${sourceLabel} Ended` : `${sourceLabel} Complete`;
  const tierAfter = _getQuizTier(_summarizeQuizAttempts().weeklyPoints);
  const review = _summarizeQuizReviewRows(_getQuizAnswerReviewRows());
  if (scenarioEl) {
    setInnerHTML(scenarioEl, `
      <div class="sq-result-card">
        <div class="sq-result-kicker">${escapeHtml(statusLabel)}</div>
        <div class="sq-result-score">${summary.percent}%</div>
        <div class="sq-result-title">${escapeHtml(summary.badge)}</div>
        <div class="sq-result-grid">
          <span><strong>${summary.correct}</strong><small>Correct</small></span>
          <span><strong>${summary.wrong || 0}</strong><small>Wrong</small></span>
          <span><strong>${summary.bestStreak}</strong><small>Best streak</small></span>
          <span><strong>${Math.round(summary.totalPoints)}</strong><small>Total points</small></span>
        </div>
        ${_renderQuizSprintStats(summary)}
        ${_renderQuizBattleStats(summary)}
        ${_renderQuizHeatCheckStats(summary)}
        ${summary.remaining ? `<div class="sq-result-tier">${summary.remaining} question${summary.remaining === 1 ? "" : "s"} left in this ${escapeHtml(_getQuizSourceLabel(summary.sourceType, "sentence"))}.</div>` : ""}
        ${summary.bonusPoints ? `<div class="sq-result-bonus">+${summary.bonusPoints} bonus points · ${escapeHtml(summary.badge)}</div>` : ""}
        ${_renderQuizResultRewardMoment(summary)}
        ${_renderQuizResultReadyMoment(summary)}
        ${_renderQuizResultReview(summary, review)}
        <div class="sq-result-tier">Weekly tier now: <strong>${escapeHtml(tierAfter)}</strong></div>
        <div class="sq-result-actions">
          <button type="button" class="btn btn-primary sq-result-close" data-action="closeScriptQuizToHub">Quiz Center</button>
          ${typeof _isPlayerQuizWorkspace === "function" && _isPlayerQuizWorkspace()
      ? '<button type="button" class="btn btn-outline sq-result-close" data-action="closeScriptQuizToPractice">Practice</button>'
      : '<button type="button" class="btn btn-outline sq-result-close" data-action="closeScriptQuiz">Done</button>'}
        </div>
      </div>
    `);
  }
  if (answerEl) answerEl.classList.add("hidden");
  if (revealRow) revealRow.classList.add("hidden");
}

function finishScriptQuiz(options = {}) {
  return _finishScriptQuizInternal(options);
}

function _finishScriptQuizInternal(options = {}) {
  if (_quizFinished) return;
  _clearStandardQuizAdvance();
  _quizFinished = true;
  _quizFinishedAt = Date.now();
  _clearQuizTimer();
  _resetQuizRoundState();
  const summary = _buildQuizAttemptSummary({ timedOut: Boolean(options?.timedOut) });
  _saveQuizAttempt(summary);
  _clearPlayerQuizDraft();
  const progressEl = document.getElementById("scriptQuizProgress");
  if (progressEl) progressEl.textContent = "Complete";
  const periodEl = document.getElementById("scriptQuizPeriod");
  if (periodEl) {
    periodEl.textContent = "";
    periodEl.className = "script-quiz-period hidden";
  }
  const prevBtn = document.getElementById("scriptQuizPrevBtn");
  const nextBtn = document.getElementById("scriptQuizNextBtn");
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = "Complete";
  }
  const scoreEl = document.getElementById("scriptQuizScore");
  if (scoreEl) {
    scoreEl.textContent = summary.answered
      ? `${Math.round(summary.totalPoints)} pts · ${summary.badge}`
      : "Review complete";
  }
  _renderQuizResults(summary);
  _renderPlayerQuizHub();
}

function closeScriptQuizToHub() {
  _closeScriptQuizOverlayTo("quiz");
}

function closeScriptQuizToPractice() {
  _closeScriptQuizOverlayTo("practice");
}

function renderScriptQuizPlay() {
  const renderStartedAt = _quizPerfNow();
  const item = _quizPlays[_quizIndex];
  if (!item) return;
  if (_quizFinished) {
    _renderQuizResults(_buildQuizAttemptSummary());
    return;
  }
  if (_quizTimeLimitMs && _getQuizRemainingMs() <= 0) {
    finishScriptQuiz({ timedOut: true });
    return;
  }
  const { play, period } = item;
  const questionKey = _quizItemKey(item);
  const answer = _quizAnswers.get(questionKey) || null;
  const questionData = _getQuizQuestionAndChoices(item);
  _quizCurrentQuestion = questionData.question;
  _quizCurrentChoices = questionData.choices;
  // Navigation needs the question type to decide whether the card must be
  // flipped before advancing. Define it before rendering those controls.
  const question = _quizCurrentQuestion || _buildQuizQuestion(item);
  _preloadUpcomingQuizSignalMedia(_quizIndex);
  const gameMode = _quizCurrentChoices.length >= 2;
  _quizRevealed = Boolean(answer);
  const battleState = _ensureSignalBattleRound(questionKey, answer);
  const battleLocked = _isSignalBattleMode() && !answer && battleState.locked;
  const clockLabel = _isSignalBattleMode()
    ? _formatSignalBattleLabel()
    : _quizTimeLimitMs
      ? _formatQuizClock(_getQuizRemainingMs())
      : "";

  const titleEl = document.getElementById("scriptQuizTitle");
  if (titleEl) titleEl.textContent = _quizTitle;

  // Progress
  const progressEl = document.getElementById("scriptQuizProgress");
  if (progressEl) {
    progressEl.textContent = _quizTimeLimitMs || _isSignalAutoAdvanceMode()
      ? `${_quizIndex + 1} / ${_quizPlays.length} · ${clockLabel}`
      : `${_quizIndex + 1} / ${_quizPlays.length}`;
  }

  // Period label
  const periodEl = document.getElementById("scriptQuizPeriod");
  if (periodEl) {
    periodEl.textContent = period ? period : "";
    periodEl.className = period ? "script-quiz-period" : "script-quiz-period hidden";
  }

  // Nav buttons
  const prevBtn = document.getElementById("scriptQuizPrevBtn");
  const nextBtn = document.getElementById("scriptQuizNextBtn");
  if (prevBtn) prevBtn.disabled = _quizIndex === 0 || _isSignalAutoAdvanceMode();
  if (nextBtn) {
    nextBtn.disabled = _isSignalAutoAdvanceMode() || (gameMode && !answer) || (question.type === "diagram_flash" && !_quizRevealed);
    nextBtn.textContent = _isSignalBattleMode()
      ? (battleLocked ? "Watch" : "Battle")
      : _isSignalHeatCheckMode()
        ? "Heat Check"
        : _quizIndex === _quizPlays.length - 1 ? "Finish" : "Next ▶";
  }
  const shuffleBtn = document.getElementById("scriptQuizShuffleBtn");
  if (shuffleBtn) {
    shuffleBtn.disabled = Boolean(_quizTimeLimitMs || _isSignalAutoAdvanceMode());
    shuffleBtn.classList.toggle("active", _quizShuffled && !_quizTimeLimitMs && !_isSignalAutoAdvanceMode());
  }

  // Score / context
  const scoreEl = document.getElementById("scriptQuizScore");
  if (scoreEl) {
    scoreEl.textContent = gameMode
      ? `Score ${_quizScore} · Streak ${_quizStreak}${clockLabel ? ` · ${clockLabel}` : ""}`
      : `Play ${_quizIndex + 1} of ${_quizPlays.length}`;
  }

  // Scenario — show the SITUATION without revealing the call
  const downLabel = play.preferredDown ? `${_ordinalDown(play.preferredDown)} Down` : "";
  const distLabel = play.preferredDistance ? `& ${play.preferredDistance}` : "";
  const posLabel = play.preferredFieldPosition ? play.preferredFieldPosition : "";
  const hashLabel = play.preferredHash ? play.preferredHash : "";
  const situationLabel = play.preferredSituation ? play.preferredSituation : "";
  const personnelLabel = play.personnel ? play.personnel : "";
  const tempoLabel = play.tempo ? play.tempo : "";
  const typeLabel = play.type ? play.type : "";
  const sourceLabel = _getQuizSourceLabel(_quizSourceType);
  const weightLabel = _quizSourceWeight === 1 ? "1.0x" : `${_quizSourceWeight}x`;
  const detailValue = _quizCleanText(question.detailValue);
  const diagramPromptHtml = ["diagram", "diagram_formation", "diagram_flash", "study_card"].includes(question.type)
    ? _renderQuizRedactedDiagram(play, question.diagramUrl)
    : "";
  const signalPromptHtml = question.type === "signal" && question.signalClipUrl
    ? `
      <figure class="sq-signal-prompt${_isSignalBattleMode() && !battleLocked ? " is-hidden" : ""}" aria-label="Signal video prompt">
        ${_isSignalBattleMode() && !battleLocked
      ? `<div class="sq-signal-hidden">Signal hidden</div>`
      : `<video src="${escapeAttr(question.signalClipUrl)}" autoplay loop muted playsinline preload="auto" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>`}
        <figcaption>${escapeHtml(_isSignalBattleMode() && !battleLocked ? "Answer window" : question.signal?.label || "Signal clip")}</figcaption>
      </figure>`
    : question.type === "signal_full_call" && Array.isArray(question.signalClips) && question.signalClips.length
      ? `
        <figure class="sq-signal-sequence-prompt" aria-label="Full play signal sequence">
          <div class="sq-signal-sequence-grid">
            ${question.signalClips.map((clip, idx) => `
              <span class="sq-signal-sequence-item">
                <video src="${escapeAttr(clip.clipUrl)}" autoplay loop muted playsinline preload="auto" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>
                <b>${idx + 1}</b>
                <small>${escapeHtml(clip.label || clip.componentType || "Signal")}</small>
              </span>
            `).join("")}
          </div>
          <figcaption>Read the signal sequence, then pick the full play call.</figcaption>
        </figure>`
      : "";

  const situationParts = [downLabel && distLabel ? `${downLabel} ${distLabel}` : downLabel || distLabel, posLabel, hashLabel, situationLabel].filter(Boolean);
  const callContextParts = [personnelLabel, tempoLabel, typeLabel].filter(Boolean);
  const choicesHtml = gameMode
    ? `<div class="script-quiz-choices${battleLocked ? " is-battle-locked" : ""}" role="group" aria-label="Answer choices">
        ${_quizCurrentChoices.map((choice) => _renderQuizChoice(choice, answer)).join("")}
      </div>`
    : "";
  const inlineFeedbackHtml = gameMode && answer ? _renderQuizInlineFeedback(item, answer) : "";
  const choiceLengthTone = gameMode ? _getQuizChoiceLengthTone(_quizCurrentChoices) : "";
  const scenarioClasses = [
    "script-quiz-scenario",
    gameMode ? "script-quiz-scenario--game" : "",
    question.type === "signal" ? "script-quiz-scenario--signal-video" : "",
    question.type === "signal_full_call" ? "script-quiz-scenario--signal-sequence" : "",
    question.type === "diagram_flash" ? "script-quiz-scenario--diagram-flash" : "",
    choiceLengthTone ? `script-quiz-scenario--${choiceLengthTone}-choices` : "",
  ].filter(Boolean).join(" ");

  const scenarioHtml = `
    ${gameMode ? `
    <div class="sq-game-topline">
      <span class="sq-game-pill">Score ${_quizScore}</span>
      <span class="sq-game-pill">Streak ${_quizStreak}</span>
      ${clockLabel ? `<span class="sq-game-pill sq-game-pill--timer" id="scriptQuizTimerPill">${escapeHtml(clockLabel)}</span>` : ""}
      <span class="sq-game-pill">${escapeHtml(sourceLabel)} · ${escapeHtml(weightLabel)}</span>
      ${_quizSourceType === "signal" && _quizSignalCategories.length ? `<span class="sq-game-pill">${escapeHtml(_formatSignalCategories(_quizSignalCategories))}</span>` : ""}
      <span class="sq-game-pill">${escapeHtml(_quizQuestionTypeLabel(question.type))}</span>
    </div>` : ""}
    <div class="sq-scenario-hint">${escapeHtml(question.prompt)}</div>
    ${diagramPromptHtml}
    ${signalPromptHtml}
    ${detailValue ? `
    <div class="sq-scenario-block sq-scenario-block--quiz-detail">
      <div class="sq-scenario-label">${escapeHtml(question.detailLabel)}</div>
      <div class="sq-scenario-value">${escapeHtml(detailValue)}</div>
    </div>` : ""}
    <div class="sq-scenario-block sq-scenario-block--situation">
      <div class="sq-scenario-label">Situation</div>
      <div class="sq-scenario-value sq-situation">${situationParts.length ? situationParts.map(escapeHtml).join(" · ") : "<em style='opacity:.5'>No situation set</em>"}</div>
    </div>
    ${callContextParts.length ? `
    <div class="sq-scenario-block sq-scenario-block--call-meta">
      <div class="sq-scenario-label">Tags</div>
      <div class="sq-scenario-value">${callContextParts.map(escapeHtml).join(" · ")}</div>
    </div>` : ""}
    ${play.practiceFront || play.practiceCoverage || play.practiceBlitz ? `
    <div class="sq-scenario-block sq-scenario-block--defense">
      <div class="sq-scenario-label">Defense</div>
      <div class="sq-scenario-value sq-defense">${[play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean).map(escapeHtml).join(" / ")}</div>
    </div>` : ""}
    ${choicesHtml}
    ${inlineFeedbackHtml}
  `;
  const scenarioEl = document.getElementById("scriptQuizScenario");
  if (scenarioEl) {
    scenarioEl.className = scenarioClasses;
    // Pool the previous render's signal <video> elements instead of letting
    // setInnerHTML destroy and recreate them. Reusing the decoder element (and
    // only swapping src when it actually changes) means:
    //   • same-question re-render (answer reveal) → src unchanged → the clip
    //     keeps playing, no reload/restart/re-decode;
    //   • next question → reuse the element + swap src → no create/destroy
    //     churn or decoder teardown, which hitches on cheap phones.
    // Only pool when the video count matches so signal ↔ signal-sequence ↔
    // diagram transitions never cross-wire elements.
    const pooledVideos = Array.from(scenarioEl.querySelectorAll("video"));
    pooledVideos.forEach((video) => video.remove());
    setInnerHTML(scenarioEl, scenarioHtml);
    scenarioEl.dataset.quizKey = questionKey;
    const freshVideos = Array.from(scenarioEl.querySelectorAll("video"));
    if (pooledVideos.length && pooledVideos.length === freshVideos.length) {
      freshVideos.forEach((freshVideo, i) => {
        const pooled = pooledVideos[i];
        const freshSrc = freshVideo.getAttribute("src") || "";
        if ((pooled.getAttribute("src") || "") !== freshSrc) {
          pooled.setAttribute("src", freshSrc);
          try { pooled.load(); } catch (_e) { /* ignore */ }
        }
        freshVideo.replaceWith(pooled);
      });
    }
    if (window.playImages && typeof window.playImages.hydrateSmartDiagramImages === "function") {
      requestAnimationFrame(() => window.playImages.hydrateSmartDiagramImages(scenarioEl));
    }
    _configureQuizSignalVideos(scenarioEl);
    requestAnimationFrame(() => _configureQuizSignalVideos(scenarioEl));
  }

  // Answer — hidden until revealed
  const fullCall = typeof getFullCall === "function" ? getFullCall(play, { showEmoji: false }) : escapeHtml([play.formation, play.play].filter(Boolean).join(" "));
  const defenseItems = [play.practiceFront, play.practiceCoverage, play.practiceBlitz, play.practiceStunt].filter(Boolean);
  const { ruleParts, noteParts, position } = _quizCoachDetails(item);
  const answerHtml = `
    ${question.type === "diagram_flash" ? '<div class="sq-flashcard-answer-label">Practice script call</div>' : ""}
    <div class="sq-answer-call">${fullCall}</div>
    ${defenseItems.length ? `<div class="sq-answer-defense">vs ${defenseItems.map(escapeHtml).join(" / ")}</div>` : ""}
    ${ruleParts.length ? `<div class="sq-answer-note"><strong>${escapeHtml(position?.label || "Your")} Rule:</strong> ${ruleParts.map(escapeHtml).join(" ")}</div>` : ""}
    ${noteParts.length ? `<div class="sq-answer-note"><strong>Coach note:</strong> ${noteParts.map(escapeHtml).join(" ")}</div>` : ""}
  `;
  const answerEl = document.getElementById("scriptQuizAnswer");
  if (answerEl) {
    // Standard Signal Study keeps its single Continue button next to the
    // answered choices. Other quiz sources retain the detailed feedback CTA.
    setInnerHTML(answerEl, gameMode
      ? _renderQuizFeedback(item, answer, { includeContinue: _quizSourceType !== "signal" || _isSignalAutoAdvanceMode() })
      : answerHtml);
    answerEl.classList.toggle("hidden", gameMode ? !answer : true);
    if (window.playImages && typeof window.playImages.hydrateSmartDiagramImages === "function") {
      requestAnimationFrame(() => window.playImages.hydrateSmartDiagramImages(answerEl));
    }
  }
  const revealRow = document.querySelector(".script-quiz-reveal-row");
  if (revealRow) revealRow.classList.toggle("hidden", gameMode);
  const revealButton = document.getElementById("scriptQuizRevealBtn");
  if (revealButton) {
    const isFlashcard = question.type === "diagram_flash";
    revealButton.textContent = isFlashcard ? "Flip Card" : "Show Play Call";
    revealButton.setAttribute("aria-label", isFlashcard ? "Flip card to reveal the practice script call" : "Show play call");
    revealButton.classList.toggle("is-flashcard", isFlashcard);
  }
  _quizPerfRecord("render-question", renderStartedAt, {
    questionType: question.type,
    hasDiagram: Boolean(diagramPromptHtml),
    hasSignal: Boolean(signalPromptHtml),
  });
  if (!_quizFirstQuestionVisibleRecorded && _quizLaunchStartedAt && _quizIndex === 0) {
    _quizFirstQuestionVisibleRecorded = true;
    _quizPerfRecord("first-question-visible", _quizLaunchStartedAt, {
      questionType: question.type,
      hasDiagram: Boolean(diagramPromptHtml),
      hasSignal: Boolean(signalPromptHtml),
    });
    _quizPerfMark("first-question-visible", {
      questionType: question.type,
      hasDiagram: Boolean(diagramPromptHtml),
      hasSignal: Boolean(signalPromptHtml),
    });
  }
}

function _ordinalDown(n) {
  const map = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th" };
  return map[String(n)] || `${n}th`;
}
