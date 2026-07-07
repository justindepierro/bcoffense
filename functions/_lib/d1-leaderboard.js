/**
 * D1 helpers for team-wide player quiz leaderboard sync.
 */

import { getTeamId } from "./d1-threads.js";

const MAX_ATTEMPTS_PER_SYNC = 150;
const MAX_REWARDS_PER_SYNC = 400;
const MAX_STICKERS_PER_SYNC = 500;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function cleanText(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanId(value) {
  const id = cleanText(value, 128);
  return id || crypto.randomUUID();
}

function cleanPlayerName(value, session) {
  return cleanText(value || session?.label || session?.username || "Player", 120) || "Player";
}

function intValue(value, min = 0, max = 1000000) {
  const number = Math.round(Number(value || 0));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function unixValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Number.isFinite(Number(value))) {
    const number = Number(value);
    return number > 100000000000 ? Math.floor(number / 1000) : Math.floor(number);
  }
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? Math.floor(time / 1000) : null;
}

function jsonText(value, max = 8000) {
  if (!value) return null;
  try {
    return JSON.stringify(value).slice(0, max);
  } catch (_) {
    return null;
  }
}

function safeParseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function currentWeekKey() {
  const date = new Date();
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function activeRewardClause() {
  return "(status IS NULL OR status = '' OR status = 'approved')";
}

export async function getLeaderboardTeamId(db, session) {
  return getTeamId(db, session);
}

function normalizeAttempt(input, teamId, session) {
  return {
    id: cleanId(input.id),
    teamId,
    userId: session?.d1UserId || null,
    playerName: cleanPlayerName(input.player || input.playerName, session),
    sourceType: cleanText(input.sourceType, 40),
    sourceId: cleanText(input.sourceId, 160),
    title: cleanText(input.title, 180),
    positionKey: cleanText(input.positionKey, 40),
    positionLabel: cleanText(input.positionLabel, 80),
    score: intValue(input.score),
    bonusPoints: intValue(input.bonusPoints),
    totalPoints: intValue(input.totalPoints),
    answered: intValue(input.answered, 0, 500),
    correct: intValue(input.correct, 0, 500),
    wrong: intValue(input.wrong, 0, 500),
    totalQuestions: intValue(input.totalQuestions, 0, 500),
    remaining: intValue(input.remaining, 0, 500),
    percent: intValue(input.percent, 0, 100),
    badge: cleanText(input.badge, 80),
    bestStreak: intValue(input.bestStreak, 0, 500),
    questionBreakdown: jsonText(input.questionBreakdown),
    review: jsonText(input.review),
    completed: input.completed === false ? 0 : 1,
    dateKey: cleanText(input.dateKey, 20),
    weekKey: cleanText(input.weekKey, 20),
    completedAt: unixValue(input.completedAt || input.finishedAt || input.createdAt),
    clientUpdatedAt: unixValue(input.updatedAt || input.savedAt || input.createdAt),
  };
}

function normalizeReward(input, teamId, session) {
  const status = cleanText(input.status || "approved", 40) || "approved";
  return {
    id: cleanId(input.id),
    teamId,
    userId: session?.d1UserId || null,
    playerName: cleanPlayerName(input.player || input.playerName, session),
    type: cleanText(input.type, 40),
    label: cleanText(input.label, 160),
    points: intValue(input.points, -100000, 100000),
    note: cleanText(input.note, 1000),
    awardedBy: cleanText(input.awardedBy || session?.label || session?.username, 120),
    source: cleanText(input.source, 80),
    sourcePostId: cleanText(input.sourcePostId || input.postId, 160),
    sourcePlayId: cleanText(input.sourcePlayId || input.playId, 160),
    status,
    dateKey: cleanText(input.dateKey, 20),
    weekKey: cleanText(input.weekKey, 20),
    createdAtClient: unixValue(input.createdAt),
    approvedAt: unixValue(input.approvedAt),
    approvedBy: cleanText(input.approvedBy, 120),
  };
}

function normalizeSticker(input, teamId, session) {
  return {
    id: cleanId(input.id),
    teamId,
    userId: session?.d1UserId || null,
    playerName: cleanPlayerName(input.player || input.playerName, session),
    stickerKey: cleanText(input.stickerKey || input.key, 80),
    label: cleanText(input.label, 160),
    icon: cleanText(input.icon, 24),
    color: cleanText(input.color, 40),
    description: cleanText(input.description, 800),
    note: cleanText(input.note, 1000),
    awardedBy: cleanText(input.awardedBy || session?.label || session?.username, 120),
    context: cleanText(input.context, 160),
    dateKey: cleanText(input.dateKey, 20),
    weekKey: cleanText(input.weekKey, 20),
    createdAtClient: unixValue(input.createdAt),
  };
}

export async function syncLeaderboardPayload(db, teamId, session, payload = {}) {
  const now = nowUnix();
  const attempts = Array.isArray(payload.attempts) ? payload.attempts.slice(-MAX_ATTEMPTS_PER_SYNC) : [];
  const rewards = Array.isArray(payload.rewards) ? payload.rewards.slice(-MAX_REWARDS_PER_SYNC) : [];
  const stickers = Array.isArray(payload.stickers) ? payload.stickers.slice(-MAX_STICKERS_PER_SYNC) : [];
  let attemptCount = 0;
  let rewardCount = 0;
  let stickerCount = 0;

  for (const item of attempts) {
    if (!item || typeof item !== "object") continue;
    const a = normalizeAttempt(item, teamId, session);
    await db.prepare(
      `INSERT INTO player_quiz_attempts (
        id, team_id, user_id, player_name, source_type, source_id, title,
        position_key, position_label, score, bonus_points, total_points,
        answered, correct, wrong, total_questions, remaining, percent,
        badge, best_streak, question_breakdown, review, completed,
        date_key, week_key, completed_at, client_updated_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, id) DO UPDATE SET
        user_id = excluded.user_id,
        player_name = excluded.player_name,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        title = excluded.title,
        position_key = excluded.position_key,
        position_label = excluded.position_label,
        score = excluded.score,
        bonus_points = excluded.bonus_points,
        total_points = excluded.total_points,
        answered = excluded.answered,
        correct = excluded.correct,
        wrong = excluded.wrong,
        total_questions = excluded.total_questions,
        remaining = excluded.remaining,
        percent = excluded.percent,
        badge = excluded.badge,
        best_streak = excluded.best_streak,
        question_breakdown = excluded.question_breakdown,
        review = excluded.review,
        completed = excluded.completed,
        date_key = excluded.date_key,
        week_key = excluded.week_key,
        completed_at = excluded.completed_at,
        client_updated_at = excluded.client_updated_at,
        updated_at = excluded.updated_at`,
    )
      .bind(
        a.id, a.teamId, a.userId, a.playerName, a.sourceType, a.sourceId, a.title,
        a.positionKey, a.positionLabel, a.score, a.bonusPoints, a.totalPoints,
        a.answered, a.correct, a.wrong, a.totalQuestions, a.remaining, a.percent,
        a.badge, a.bestStreak, a.questionBreakdown, a.review, a.completed,
        a.dateKey, a.weekKey, a.completedAt, a.clientUpdatedAt, now,
      )
      .run();
    attemptCount += 1;
  }

  for (const item of rewards) {
    if (!item || typeof item !== "object") continue;
    const r = normalizeReward(item, teamId, session);
    await db.prepare(
      `INSERT INTO player_reward_events (
        id, team_id, user_id, player_name, type, label, points, note,
        awarded_by, source, source_post_id, source_play_id, status,
        date_key, week_key, created_at_client, approved_at, approved_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, id) DO UPDATE SET
        user_id = excluded.user_id,
        player_name = excluded.player_name,
        type = excluded.type,
        label = excluded.label,
        points = excluded.points,
        note = excluded.note,
        awarded_by = excluded.awarded_by,
        source = excluded.source,
        source_post_id = excluded.source_post_id,
        source_play_id = excluded.source_play_id,
        status = excluded.status,
        date_key = excluded.date_key,
        week_key = excluded.week_key,
        created_at_client = excluded.created_at_client,
        approved_at = excluded.approved_at,
        approved_by = excluded.approved_by,
        updated_at = excluded.updated_at`,
    )
      .bind(
        r.id, r.teamId, r.userId, r.playerName, r.type, r.label, r.points, r.note,
        r.awardedBy, r.source, r.sourcePostId, r.sourcePlayId, r.status,
        r.dateKey, r.weekKey, r.createdAtClient, r.approvedAt, r.approvedBy, now,
      )
      .run();
    rewardCount += 1;
  }

  for (const item of stickers) {
    if (!item || typeof item !== "object") continue;
    const s = normalizeSticker(item, teamId, session);
    await db.prepare(
      `INSERT INTO player_helmet_stickers (
        id, team_id, user_id, player_name, sticker_key, label, icon, color,
        description, note, awarded_by, context, date_key, week_key,
        created_at_client, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, id) DO UPDATE SET
        user_id = excluded.user_id,
        player_name = excluded.player_name,
        sticker_key = excluded.sticker_key,
        label = excluded.label,
        icon = excluded.icon,
        color = excluded.color,
        description = excluded.description,
        note = excluded.note,
        awarded_by = excluded.awarded_by,
        context = excluded.context,
        date_key = excluded.date_key,
        week_key = excluded.week_key,
        created_at_client = excluded.created_at_client,
        updated_at = excluded.updated_at`,
    )
      .bind(
        s.id, s.teamId, s.userId, s.playerName, s.stickerKey, s.label, s.icon, s.color,
        s.description, s.note, s.awardedBy, s.context, s.dateKey, s.weekKey,
        s.createdAtClient, now,
      )
      .run();
    stickerCount += 1;
  }

  return { attempts: attemptCount, rewards: rewardCount, stickers: stickerCount };
}

function mergeRows(attemptRows = [], rewardRows = [], stickerRows = []) {
  const rows = new Map();
  const ensure = (name) => {
    const playerName = cleanPlayerName(name, null);
    if (!rows.has(playerName)) {
      rows.set(playerName, {
        name: playerName,
        player: playerName,
        quizPoints: 0,
        rewardPoints: 0,
        questionPoints: 0,
        answerPoints: 0,
        giftPoints: 0,
        attempts: 0,
        answered: 0,
        correct: 0,
        wrong: 0,
        stickers: 0,
      });
    }
    return rows.get(playerName);
  };

  attemptRows.forEach((row) => {
    const target = ensure(row.player_name);
    target.quizPoints += intValue(row.quiz_points);
    target.attempts += intValue(row.attempts);
    target.answered += intValue(row.answered);
    target.correct += intValue(row.correct);
    target.wrong += intValue(row.wrong);
  });

  rewardRows.forEach((row) => {
    const target = ensure(row.player_name);
    const points = intValue(row.reward_points, -1000000, 1000000);
    target.rewardPoints += points;
    target.questionPoints += intValue(row.question_points, -1000000, 1000000);
    target.answerPoints += intValue(row.answer_points, -1000000, 1000000);
    target.giftPoints += intValue(row.gift_points, -1000000, 1000000);
  });

  stickerRows.forEach((row) => {
    ensure(row.player_name).stickers += intValue(row.stickers);
  });

  return Array.from(rows.values())
    .map((row) => {
      const totalPoints = row.quizPoints + row.rewardPoints;
      const percent = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
      return { ...row, totalPoints, points: totalPoints, percent };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.percent - a.percent || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function loadSummaryRows(db, teamId, weekKey = "", season = false) {
  const attemptWhere = season ? "team_id = ?" : "team_id = ? AND week_key = ?";
  const attemptBinds = season ? [teamId] : [teamId, weekKey];
  const rewardWhere = season ? `team_id = ? AND ${activeRewardClause()}` : `team_id = ? AND week_key = ? AND ${activeRewardClause()}`;
  const rewardBinds = season ? [teamId] : [teamId, weekKey];
  const stickerWhere = season ? "team_id = ?" : "team_id = ? AND week_key = ?";
  const stickerBinds = season ? [teamId] : [teamId, weekKey];

  const attempts = await db.prepare(
    `SELECT player_name,
        SUM(total_points) AS quiz_points,
        COUNT(*) AS attempts,
        SUM(answered) AS answered,
        SUM(correct) AS correct,
        SUM(wrong) AS wrong
     FROM player_quiz_attempts
     WHERE ${attemptWhere}
     GROUP BY player_name`,
  ).bind(...attemptBinds).all();

  const rewards = await db.prepare(
    `SELECT player_name,
        SUM(points) AS reward_points,
        SUM(CASE WHEN type = 'question' THEN points ELSE 0 END) AS question_points,
        SUM(CASE WHEN type = 'answer' THEN points ELSE 0 END) AS answer_points,
        SUM(CASE WHEN type = 'gift' THEN points ELSE 0 END) AS gift_points
     FROM player_reward_events
     WHERE ${rewardWhere}
     GROUP BY player_name`,
  ).bind(...rewardBinds).all();

  const stickers = await db.prepare(
    `SELECT player_name, COUNT(*) AS stickers
     FROM player_helmet_stickers
     WHERE ${stickerWhere}
     GROUP BY player_name`,
  ).bind(...stickerBinds).all();

  return mergeRows(attempts.results || [], rewards.results || [], stickers.results || []);
}

function summarizeTotals(rows) {
  return rows.reduce((totals, row) => {
    totals.players += 1;
    totals.points += row.totalPoints || row.points || 0;
    totals.quizPoints += row.quizPoints || 0;
    totals.rewardPoints += row.rewardPoints || 0;
    totals.questionPoints += row.questionPoints || 0;
    totals.answerPoints += row.answerPoints || 0;
    totals.giftPoints += row.giftPoints || 0;
    totals.attempts += row.attempts || 0;
    totals.answered += row.answered || 0;
    totals.correct += row.correct || 0;
    totals.stickers += row.stickers || 0;
    return totals;
  }, {
    players: 0,
    points: 0,
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

export async function getLeaderboardSummary(db, teamId, options = {}) {
  const weekKey = cleanText(options.weekKey, 20) || currentWeekKey();
  const weekRows = await loadSummaryRows(db, teamId, weekKey, false);
  const seasonRows = await loadSummaryRows(db, teamId, weekKey, true);
  return {
    weekKey,
    updatedAt: new Date().toISOString(),
    week: {
      rows: weekRows,
      totals: summarizeTotals(weekRows),
    },
    season: {
      rows: seasonRows,
      totals: summarizeTotals(seasonRows),
    },
  };
}

export function parseStoredAttemptReview(row) {
  return safeParseJson(row?.review, null);
}
