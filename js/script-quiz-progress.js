// Player quiz progress aggregation. Rendering remains in script-quiz.js so
// delegated UI actions keep their existing public contracts.

function _buildCoachQuizLeaderboardSummary() {
  const attempts = _getPlayerQuizAttempts();
  const rewards = _getPlayerRewardEvents();
  const settings = _getPlayerQuizSettings();
  const weekKey = _quizWeekKey(new Date());
  const isSeason = _coachQuizLeaderboardView === "season";
  const viewAttempts = _quizFilteredAttemptsForView(attempts, weekKey, isSeason);
  const viewRewards = _quizFilteredRewardsForView(rewards, weekKey, isSeason);
  const rows = new Map();
  const positionTotals = new Map();
  const questionTotals = {};
  const missedPlayTotals = new Map();
  const ensureRow = (name) => {
    const playerName = _normalizeQuizPlayerName(name || "Player");
    if (!rows.has(playerName)) {
      rows.set(playerName, {
        name: playerName,
        quizPoints: 0,
        rewardPoints: 0,
        questionPoints: 0,
        answerPoints: 0,
        giftPoints: 0,
        attempts: 0,
        answered: 0,
        correct: 0,
        stickers: 0,
      });
    }
    return rows.get(playerName);
  };

  viewAttempts.forEach((attempt) => {
    const row = ensureRow(attempt.player || "Player");
    row.quizPoints += Number(attempt.totalPoints || 0);
    row.attempts += 1;
    row.answered += Number(attempt.answered || 0);
    row.correct += Number(attempt.correct || 0);
    const posKey = attempt.positionKey || "unknown";
    const posLabel = attempt.positionLabel || _getQuizPositions().find((position) => position.key === posKey)?.label || "Unknown";
    if (!positionTotals.has(posKey)) {
      positionTotals.set(posKey, { key: posKey, label: posLabel, attempts: 0, answered: 0, correct: 0 });
    }
    const pos = positionTotals.get(posKey);
    pos.attempts += 1;
    pos.answered += Number(attempt.answered || 0);
    pos.correct += Number(attempt.correct || 0);
    _quizAddQuestionBreakdown(questionTotals, attempt.questionBreakdown || {});
    (Array.isArray(attempt.reviewRows) ? attempt.reviewRows : []).forEach((row) => {
      if (!row || row.correct) return;
      const label = _quizCleanText(row.playCall || row.correctLabel || "Unknown play");
      const key = label.toLowerCase();
      if (!key) return;
      if (!missedPlayTotals.has(key)) {
        missedPlayTotals.set(key, {
          label,
          misses: 0,
          players: new Set(),
          questionTypes: new Set(),
        });
      }
      const entry = missedPlayTotals.get(key);
      entry.misses += 1;
      entry.players.add(row.player || attempt.player || "Player");
      entry.questionTypes.add(row.questionLabel || _formatQuizQuestionType(row.questionType || "call"));
    });
  });

  viewRewards.forEach((event) => {
    const row = ensureRow(event.player || "Player");
    const points = Number(event.points || 0);
    row.rewardPoints += points;
    if (event.type === "question") row.questionPoints += points;
    if (event.type === "answer") row.answerPoints += points;
    if (event.type === "gift") row.giftPoints += points;
  });

  _getPlayerHelmetStickers()
    .filter((sticker) => isSeason || sticker.weekKey === weekKey)
    .forEach((sticker) => {
      ensureRow(sticker.player || "Player").stickers += 1;
    });
  const remoteRows = typeof window !== "undefined" && typeof window.getRemotePlayerLeaderboardRows === "function"
    ? window.getRemotePlayerLeaderboardRows(isSeason ? "season" : "week")
    : [];
  remoteRows.forEach((remote) => {
    const row = ensureRow(remote.name || remote.player || "Player");
    const remoteTotal = Number(remote.totalPoints ?? remote.points ?? 0);
    const remoteQuiz = Number(remote.quizPoints ?? 0);
    const remoteReward = Number(remote.rewardPoints ?? Math.max(0, remoteTotal - remoteQuiz));
    row.quizPoints = Math.max(row.quizPoints, remoteQuiz || Math.max(0, remoteTotal - remoteReward));
    row.rewardPoints = Math.max(row.rewardPoints, remoteReward);
    row.questionPoints = Math.max(row.questionPoints, Number(remote.questionPoints || 0));
    row.answerPoints = Math.max(row.answerPoints, Number(remote.answerPoints || 0));
    row.giftPoints = Math.max(row.giftPoints, Number(remote.giftPoints || 0));
    row.attempts = Math.max(row.attempts, Number(remote.attempts || 0));
    row.answered = Math.max(row.answered, Number(remote.answered || 0));
    row.correct = Math.max(row.correct, Number(remote.correct || 0));
    row.stickers = Math.max(row.stickers, Number(remote.stickers || 0));
  });
  _getQuizRosterPlayers().forEach((player) => ensureRow(player.name));

  const leaderboardRows = Array.from(rows.values())
    .map((row) => {
      const totalPoints = row.quizPoints + row.rewardPoints;
      const percent = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
      return { ...row, totalPoints, percent, tier: _getQuizTier(totalPoints, settings) };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.percent - a.percent || a.name.localeCompare(b.name))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));

  const weakPositions = Array.from(positionTotals.values())
    .filter((item) => item.answered > 0 && Math.round((item.correct / item.answered) * 100) < 85)
    .map((item) => ({
      ...item,
      percent: Math.round((item.correct / item.answered) * 100),
      wrong: item.answered - item.correct,
    }))
    .sort((a, b) => a.percent - b.percent || b.wrong - a.wrong)
    .slice(0, 4);

  const weakQuestionTypes = Object.entries(questionTotals)
    .map(([type, stats]) => ({
      type,
      label: _formatQuizQuestionType(type),
      total: Number(stats.total || 0),
      correct: Number(stats.correct || 0),
      wrong: Number(stats.wrong || 0),
      percent: stats.total ? Math.round((Number(stats.correct || 0) / Number(stats.total || 0)) * 100) : 0,
    }))
    .filter((item) => item.total > 0 && item.percent < 85)
    .sort((a, b) => a.percent - b.percent || b.wrong - a.wrong)
    .slice(0, 4);

  const commonMissedPlays = Array.from(missedPlayTotals.values())
    .map((item) => ({
      label: item.label,
      misses: item.misses,
      players: item.players.size,
      questionTypes: Array.from(item.questionTypes).filter(Boolean).slice(0, 3),
    }))
    .sort((a, b) => b.misses - a.misses || b.players - a.players || a.label.localeCompare(b.label))
    .slice(0, 5);

  return {
    isSeason,
    weekKey,
    label: isSeason ? "Season" : `Week ${weekKey}`,
    attempts: viewAttempts,
    rewards: viewRewards,
    rows: leaderboardRows,
    weakPositions,
    weakQuestionTypes,
    commonMissedPlays,
    signalSprintRows: _buildSignalSprintLeaderboardRows(viewAttempts, _getQuizPlayerName()),
    signalBattleRows: _buildSignalBattleLeaderboardRows(viewAttempts, _getQuizPlayerName()),
    signalHeatRows: _buildSignalHeatCheckLeaderboardRows(viewAttempts, _getQuizPlayerName()),
    totals: {
      players: leaderboardRows.length,
      attempts: viewAttempts.length,
      quizPoints: leaderboardRows.reduce((sum, row) => sum + row.quizPoints, 0),
      questionPoints: leaderboardRows.reduce((sum, row) => sum + row.questionPoints, 0),
      answerPoints: leaderboardRows.reduce((sum, row) => sum + row.answerPoints, 0),
      giftPoints: leaderboardRows.reduce((sum, row) => sum + row.giftPoints, 0),
      stickers: leaderboardRows.reduce((sum, row) => sum + row.stickers, 0),
    },
  };
}

function _summarizeQuizAttempts() {
  const attempts = _getPlayerQuizAttempts();
  const rewards = _getPlayerRewardEvents();
  const settings = _getPlayerQuizSettings();
  const now = new Date();
  const weekKey = _quizWeekKey(now);
  const todayKey = _quizDateKey(now);
  const player = _getQuizPlayerName();
  const playerAttempts = attempts.filter((attempt) => _quizPlayerNameFromAttempt(attempt, player) === player);
  const weeklyAttempts = playerAttempts.filter((attempt) => attempt.weekKey === weekKey);
  const playerRewards = rewards.filter((event) => _normalizeQuizPlayerName(event.player) === player);
  const weeklyRewards = playerRewards.filter((event) => event.weekKey === weekKey);
  const weeklyQuizPoints = weeklyAttempts.reduce((sum, attempt) => sum + Number(attempt.totalPoints || 0), 0);
  const weeklyRewardPoints = _sumQuizRewards(weeklyRewards);
  const weeklyQuestionPoints = _sumQuizRewards(weeklyRewards, "question");
  const weeklyAnswerPoints = _sumQuizRewards(weeklyRewards, "answer");
  const weeklyGiftPoints = _sumQuizRewards(weeklyRewards, "gift");
  const weeklyPoints = weeklyQuizPoints + weeklyRewardPoints;
  const seasonQuizPoints = playerAttempts.reduce((sum, attempt) => sum + Number(attempt.totalPoints || 0), 0);
  const seasonRewardPoints = _sumQuizRewards(playerRewards);
  const seasonQuestionPoints = _sumQuizRewards(playerRewards, "question");
  const seasonAnswerPoints = _sumQuizRewards(playerRewards, "answer");
  const seasonGiftPoints = _sumQuizRewards(playerRewards, "gift");
  const seasonPoints = seasonQuizPoints + seasonRewardPoints;
  const dailyStreak = _quizCurrentStreak(_quizActivityDateKeys(playerAttempts, playerRewards, player), todayKey, _quizPreviousDateKey);
  const weeklyStreak = _quizCurrentStreak(_quizActivityWeekKeys(playerAttempts, playerRewards, player), weekKey, _quizPreviousWeekKey);
  const bestPercent = playerAttempts.reduce((best, attempt) => Math.max(best, Number(attempt.percent || 0)), 0);
  const bestBadge = _getQuizBadge(bestPercent);
  return {
    attempts,
    rewards,
    player,
    weekKey,
    playerAttempts,
    playerRewards,
    weeklyAttempts,
    weeklyRewards,
    weeklyQuizPoints,
    weeklyRewardPoints,
    weeklyQuestionPoints,
    weeklyAnswerPoints,
    weeklyGiftPoints,
    weeklyPoints,
    seasonQuizPoints,
    seasonRewardPoints,
    seasonQuestionPoints,
    seasonAnswerPoints,
    seasonGiftPoints,
    seasonPoints,
    dailyStreak,
    weeklyStreak,
    bestPercent,
    bestBadge,
    tier: _getQuizTier(weeklyPoints, settings),
    weeklyLeaderboardRows: _buildQuizLeaderboardRows(attempts, rewards, player, weekKey),
    seasonLeaderboardRows: _buildQuizLeaderboardRows(attempts, rewards, player),
    weeklySignalSprintRows: _buildSignalSprintLeaderboardRows(attempts, player, weekKey),
    seasonSignalSprintRows: _buildSignalSprintLeaderboardRows(attempts, player),
    weeklySignalBattleRows: _buildSignalBattleLeaderboardRows(attempts, player, weekKey),
    seasonSignalBattleRows: _buildSignalBattleLeaderboardRows(attempts, player),
    weeklySignalHeatRows: _buildSignalHeatCheckLeaderboardRows(attempts, player, weekKey),
    seasonSignalHeatRows: _buildSignalHeatCheckLeaderboardRows(attempts, player),
  };
}

function _getPlayerQuizWeakAreaCards(summary = _summarizeQuizAttempts()) {
  const attempts = Array.isArray(summary.playerAttempts) ? summary.playerAttempts : [];
  const questionTotals = {};
  const positionTotals = new Map();
  attempts.forEach((attempt) => {
    _quizAddQuestionBreakdown(questionTotals, attempt.questionBreakdown || {});
    const rows = Array.isArray(attempt.reviewRows) ? attempt.reviewRows : [];
    rows.forEach((row) => {
      const key = row.positionKey || attempt.positionKey || "unknown";
      const label = row.positionLabel || attempt.positionLabel || _getQuizPositions().find((position) => position.key === key)?.label || "Position";
      if (!positionTotals.has(key)) {
        positionTotals.set(key, { key, label, total: 0, correct: 0, wrong: 0 });
      }
      const total = positionTotals.get(key);
      total.total += 1;
      if (row.correct) {
        total.correct += 1;
      } else {
        total.wrong += 1;
      }
    });
  });
  const toCard = (item, kind) => ({
    ...item,
    kind,
    percent: item.total ? Math.round((Number(item.correct || 0) / Number(item.total || 0)) * 100) : 0,
  });
  return [
    ...Object.entries(questionTotals).map(([type, stats]) => toCard({
      key: type,
      label: _formatQuizQuestionType(type),
      total: Number(stats.total || 0),
      correct: Number(stats.correct || 0),
      wrong: Number(stats.wrong || 0),
    }, "Question")),
    ...Array.from(positionTotals.values()).map((item) => toCard(item, "Position")),
  ]
    .filter((item) => item.total > 0 && item.wrong > 0)
    .sort((a, b) => a.percent - b.percent || b.wrong - a.wrong || b.total - a.total)
    .slice(0, 4);
}

function _renderPlayerQuizWeakAreaPanel(summary = _summarizeQuizAttempts()) {
  const cards = _getPlayerQuizWeakAreaCards(summary);
  if (!cards.length) {
    return `
      <section class="player-quiz-hub-section player-quiz-weak-area-panel">
        <div class="player-quiz-hub-section-head">
          <h3>Review focus</h3>
          <span>No weak trend yet. Missed Plays will unlock after quiz attempts.</span>
        </div>
        <div class="player-quiz-weak-area-empty">Take a quiz to build your personal review plan.</div>
      </section>
    `;
  }
  return `
    <section class="player-quiz-hub-section player-quiz-weak-area-panel">
      <div class="player-quiz-hub-section-head">
        <h3>Review focus</h3>
        <span>Personal weak-area cards from your quiz misses.</span>
      </div>
      <div class="player-quiz-weak-area-grid">
        ${cards.map((card) => `
          <article class="player-quiz-weak-area-card">
            <span>${escapeHtml(card.kind)}</span>
            <strong>${escapeHtml(card.label)}</strong>
            <small>${Math.round(card.percent)}% · ${Math.round(card.wrong)} miss${Number(card.wrong) === 1 ? "" : "es"} on ${Math.round(card.total)} reps</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}
