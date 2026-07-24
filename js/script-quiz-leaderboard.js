// Reusable player and coach leaderboard list presentation. Profile lifecycle
// and the Quiz engine remain in script-quiz.js for now.

function _renderQuizLeaderRows(rows, player) {
  const safeRows = Array.isArray(rows) && rows.length
    ? rows
    : [{ name: player, points: 0, rank: 1, tier: _getQuizTier(0) }];
  return safeRows
    .map((row) => {
      const rowPoints = Number(row.points ?? row.totalPoints ?? 0);
      const achievement = _getQuizAchievementSummary(rowPoints);
      return `
        <button type="button" class="player-quiz-leader-row" data-action="openPlayerLeaderboardDetail" data-arg="${escapeAttr(row.name)}">
          <span class="player-quiz-rank">#${row.rank}</span>
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(row.tier)}</span>
          <span class="player-quiz-achievement${achievement.stars ? " has-stars" : ""}" aria-label="${escapeAttr(achievement.label)}">${escapeHtml(achievement.stars ? `${achievement.starText} ${achievement.shortLabel}` : "No stars")}</span>
          <b>${Math.round(rowPoints)} pts</b>
        </button>
      `;
    })
    .join("");
}

function _formatSignalSprintPace(ms) {
  const value = Number(ms || 0);
  return value > 0 ? `${(value / 1000).toFixed(1)}s` : "-";
}

function _renderSignalSprintLeaderboardRows(rows, player, variant = "player") {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length || safeRows.every((row) => row.empty)) {
    return `<div class="${variant === "coach" ? "coach-quiz-empty" : "player-leaderboard-empty"}">No Signal Sprint attempts yet. Run the 100 Second Sprint to set the first score.</div>`;
  }
  return safeRows.map((row) => {
    const isCurrent = _normalizeQuizPlayerName(row.name) === _normalizeQuizPlayerName(player || "");
    const attrs = variant === "coach"
      ? `data-action="selectCoachQuizLeaderboardPlayer" data-arg="${escapeAttr(row.name)}"`
      : `data-action="openPlayerLeaderboardDetail" data-arg="${escapeAttr(row.name)}"`;
    return `
      <button type="button" class="signal-sprint-leader-row${isCurrent ? " is-current" : ""}" ${attrs}>
        <span class="signal-sprint-rank">#${row.rank}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <span class="signal-sprint-score">${Math.round(row.correct || 0)} correct</span>
        <span>${Math.round(row.percent || 0)}%</span>
        <span>${escapeHtml(_formatSignalSprintPace(row.averageAnswerMs))} avg</span>
      </button>
    `;
  }).join("");
}

function _renderSignalBattleLeaderboardRows(rows, player, variant = "player") {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length || safeRows.every((row) => row.empty)) {
    return `<div class="${variant === "coach" ? "coach-quiz-empty" : "player-leaderboard-empty"}">No 6 Seconds of Battle attempts yet. Play a round to set the first score.</div>`;
  }
  return safeRows.map((row) => {
    const isCurrent = _normalizeQuizPlayerName(row.name) === _normalizeQuizPlayerName(player || "");
    const attrs = variant === "coach"
      ? `data-action="selectCoachQuizLeaderboardPlayer" data-arg="${escapeAttr(row.name)}"`
      : `data-action="openPlayerLeaderboardDetail" data-arg="${escapeAttr(row.name)}"`;
    return `
      <button type="button" class="signal-sprint-leader-row signal-battle-leader-row${isCurrent ? " is-current" : ""}" ${attrs}>
        <span class="signal-sprint-rank">#${row.rank}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <span class="signal-sprint-score">${Math.round(row.correct || 0)} correct</span>
        <span>${escapeHtml(_formatSignalSprintPace(row.averageReactionMs))} avg</span>
        <span>${Math.round(row.percent || 0)}%</span>
      </button>
    `;
  }).join("");
}

function _renderSignalHeatCheckLeaderboardRows(rows, player, variant = "player") {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length || safeRows.every((row) => row.empty)) {
    return `<div class="${variant === "coach" ? "coach-quiz-empty" : "player-leaderboard-empty"}">No Heat Check attempts yet. Start a streak to set the first score.</div>`;
  }
  return safeRows.map((row) => {
    const isCurrent = _normalizeQuizPlayerName(row.name) === _normalizeQuizPlayerName(player || "");
    const attrs = variant === "coach"
      ? `data-action="selectCoachQuizLeaderboardPlayer" data-arg="${escapeAttr(row.name)}"`
      : `data-action="openPlayerLeaderboardDetail" data-arg="${escapeAttr(row.name)}"`;
    return `
      <button type="button" class="signal-sprint-leader-row signal-heat-leader-row${isCurrent ? " is-current" : ""}" ${attrs}>
        <span class="signal-sprint-rank">#${row.rank}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <span class="signal-sprint-score">${Math.round(row.bestStreak || 0)} streak</span>
        <span>${Math.round(row.correct || 0)} correct</span>
        <span>${Math.round(row.percent || 0)}%</span>
      </button>
    `;
  }).join("");
}

function _getSignalLeaderboardConfig(mode = _signalLeaderboardMode) {
  const normalized = String(mode || "").trim();
  if (normalized === "signal-battle") {
    return {
      mode: "signal-battle",
      label: "6 Seconds",
      title: "6 Seconds of Battle",
      meta: "correct, reaction time",
      render: _renderSignalBattleLeaderboardRows,
    };
  }
  if (normalized === "signal-heat") {
    return {
      mode: "signal-heat",
      label: "Heat Check",
      title: "Heat Check",
      meta: "best streak, total correct",
      render: _renderSignalHeatCheckLeaderboardRows,
    };
  }
  return {
    mode: "signal-sprint",
    label: "Sprint",
    title: "100 Second Signal Sprint",
    meta: "correct, accuracy, speed",
    render: _renderSignalSprintLeaderboardRows,
  };
}

function _renderSignalLeaderboardTabs() {
  const modes = ["signal-sprint", "signal-battle", "signal-heat"];
  return `
    <div class="signal-leaderboard-tabs" role="group" aria-label="Signal leaderboard mode">
      ${modes.map((mode) => {
    const config = _getSignalLeaderboardConfig(mode);
    return `
          <button type="button"
            class="${config.mode === _signalLeaderboardMode ? "is-active" : ""}"
            data-action="setSignalLeaderboardMode"
            data-arg="${escapeAttr(config.mode)}">
            ${escapeHtml(config.label)}
          </button>
        `;
  }).join("")}
    </div>
  `;
}

function _getSignalLeaderboardRowsForMode(summary, isSeason, mode = _signalLeaderboardMode) {
  if (mode === "signal-battle") return isSeason ? summary.seasonSignalBattleRows : summary.weeklySignalBattleRows;
  if (mode === "signal-heat") return isSeason ? summary.seasonSignalHeatRows : summary.weeklySignalHeatRows;
  return isSeason ? summary.seasonSignalSprintRows : summary.weeklySignalSprintRows;
}

function setSignalLeaderboardMode(mode) {
  _signalLeaderboardMode = _getSignalLeaderboardConfig(mode).mode;
  if (typeof isQuizPageActive === "function" && isQuizPageActive()) {
    renderQuizPage();
  }
  if (document.getElementById("coachQuizSetupPage")?.offsetParent) {
    renderCoachQuizSetupPage();
  }
}
