/**
 * D1 helpers for team-wide player quiz leaderboard sync.
 */

import { getTeamId } from "./d1-threads.js";

const MAX_STAFF_NOTE_LENGTH = 1000;
const MAX_STAFF_POINTS = 500;
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const REWARD_TYPES = new Set(["question", "answer", "gift"]);
const STICKER_COLORS = new Set(["green", "blue", "red", "gold", "purple", "navy"]);

// The client stores rich review data with an attempt, so this must leave room
// for a normal offline queue while still bounding a Function request body.
export const MAX_LEADERBOARD_PAYLOAD_BYTES = 128 * 1024;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function requiredText(value, name, max) {
  if (typeof value !== "string") throw new TypeError(`${name} must be text.`);
  const text = value.trim();
  if (!text) throw new TypeError(`${name} is required.`);
  if (text.length > max) throw new RangeError(`${name} is too long.`);
  return text;
}

function optionalText(value, name, max) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new TypeError(`${name} must be text.`);
  const text = value.trim();
  if (text.length > max) throw new RangeError(`${name} is too long.`);
  return text;
}

function requiredId(value, name = "Record ID") {
  const id = requiredText(value, name, 128);
  if (!ATTEMPT_ID_PATTERN.test(id)) {
    throw new TypeError(`${name} must be a stable client-generated ID.`);
  }
  return id;
}

function boundedInteger(value, name, min, max, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be an integer.`);
  }
  if (value < min || value > max) throw new RangeError(`${name} is out of range.`);
  return value;
}

function summaryInt(value, min = 0, max = 1000000) {
  const number = Math.round(Number(value || 0));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function safeParseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function currentWeekKey(date = new Date()) {
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

/** Read a finite JSON object without buffering an unbounded request body. */
export async function readLeaderboardPayload(request) {
  const advertisedLength = String(request.headers.get("content-length") || "").trim();
  if (/^\d+$/.test(advertisedLength) && Number(advertisedLength) > MAX_LEADERBOARD_PAYLOAD_BYTES) {
    throw new RangeError("Leaderboard payload is too large.");
  }

  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_LEADERBOARD_PAYLOAD_BYTES) {
      throw new RangeError("Leaderboard payload is too large.");
    }
    chunks.push(value);
  }

  if (!size) return {};
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  if (!isPlainObject(payload)) throw new TypeError("Leaderboard payload must be an object.");
  return payload;
}

function payloadArray(payload, key, max) {
  const value = payload[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${key} must be a list.`);
  if (value.length > max) throw new RangeError(`${key} has too many records.`);
  if (!value.every(isPlainObject)) throw new TypeError(`${key} contains an invalid record.`);
  return value;
}

function canonicalDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function canonicalPlayerName(user) {
  return cleanText(user?.display_name, 120) || "Player";
}

async function resolveSessionPlayer(db, teamId, session) {
  const userId = requiredText(session?.d1UserId, "Player account", 128);
  const player = await db.prepare(
    `SELECT id AS user_id, display_name
       FROM users
      WHERE id = ? AND team_id = ? AND role = 'player' AND status = 'active'
      LIMIT 1`,
  ).bind(userId, teamId).first();
  if (!player) throw new Error("The active player account could not be resolved.");
  return { userId: String(player.user_id), playerName: canonicalPlayerName(player) };
}

function normalizeStaffTarget(input) {
  const target = isPlainObject(input?.target) ? input.target : {};
  return {
    userId: optionalText(target.userId, "target.userId", 128),
    email: optionalText(target.email, "target.email", 320).toLowerCase(),
    name: optionalText(target.name || input?.player || input?.playerName, "target.name", 120),
  };
}

async function resolveActiveTeamPlayer(db, teamId, target) {
  if (target.userId) {
    return db.prepare(
      `SELECT id AS user_id, display_name
         FROM users
        WHERE id = ? AND team_id = ? AND role = 'player' AND status = 'active'
        LIMIT 1`,
    ).bind(target.userId, teamId).first();
  }
  if (target.email) {
    const matches = await db.prepare(
      `SELECT id AS user_id, display_name
         FROM users
        WHERE LOWER(email) = ? AND team_id = ? AND role = 'player' AND status = 'active'
        LIMIT 2`,
    ).bind(target.email, teamId).all();
    return (matches.results || []).length === 1 ? matches.results[0] : null;
  }
  if (!target.name) throw new TypeError("An active player target is required.");
  const matches = await db.prepare(
    `SELECT DISTINCT u.id AS user_id, u.display_name
       FROM users u
       LEFT JOIN roster_players r ON r.user_id = u.id AND r.team_id = u.team_id
      WHERE u.team_id = ? AND u.role = 'player' AND u.status = 'active'
        AND (LOWER(u.display_name) = LOWER(?) OR LOWER(r.display_name) = LOWER(?))
      LIMIT 2`,
  ).bind(teamId, target.name, target.name).all();
  if ((matches.results || []).length !== 1) {
    throw new Error("The active player target could not be resolved uniquely.");
  }
  return matches.results[0];
}

async function requireActiveTeamPlayer(db, teamId, target) {
  const player = await resolveActiveTeamPlayer(db, teamId, target);
  if (!player) throw new Error("The active player target could not be resolved uniquely.");
  return player;
}

function staffActorName(session) {
  return cleanText(session?.label || session?.username, 120) || "Coach";
}

function normalizeRewardForCreate(input, target, session, now) {
  const type = requiredText(input.type, "reward type", 40).toLowerCase();
  if (!REWARD_TYPES.has(type)) throw new TypeError("Unsupported reward type.");
  const status = input.status === undefined ? "approved" : requiredText(input.status, "reward status", 40);
  if (status !== "approved" && status !== "pending_approval") {
    throw new TypeError("Unsupported reward status.");
  }
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    id: requiredId(input.id, "Reward ID"),
    userId: String(target.user_id),
    playerName: canonicalPlayerName(target),
    type,
    label: requiredText(input.label, "reward label", 160),
    points: boundedInteger(input.points, "reward points", 0, MAX_STAFF_POINTS, 0),
    note: optionalText(input.note, "reward note", MAX_STAFF_NOTE_LENGTH),
    awardedBy: staffActorName(session),
    source: optionalText(input.source, "reward source", 80),
    sourcePostId: optionalText(input.sourcePostId || input.postId, "sourcePostId", 160),
    sourcePlayId: optionalText(input.sourcePlayId || input.playId, "sourcePlayId", 160),
    status,
    dateKey: canonicalDateKey(now),
    weekKey: currentWeekKey(now),
    createdAt: timestamp,
    approvedAt: status === "approved" ? timestamp : null,
    approvedBy: status === "approved" ? staffActorName(session) : null,
  };
}

function normalizeStickerForCreate(input, target, session, now) {
  const color = requiredText(input.color, "sticker color", 40).toLowerCase();
  if (!STICKER_COLORS.has(color)) throw new TypeError("Unsupported sticker color.");
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    id: requiredId(input.id, "Sticker ID"),
    userId: String(target.user_id),
    playerName: canonicalPlayerName(target),
    stickerKey: requiredText(input.stickerKey || input.key, "sticker key", 80),
    label: requiredText(input.label, "sticker label", 160),
    icon: requiredText(input.icon, "sticker icon", 24),
    color,
    description: optionalText(input.description, "sticker description", 800),
    note: optionalText(input.note, "sticker note", MAX_STAFF_NOTE_LENGTH),
    awardedBy: staffActorName(session),
    context: optionalText(input.context, "sticker context", 160),
    dateKey: canonicalDateKey(now),
    weekKey: currentWeekKey(now),
    createdAt: timestamp,
  };
}

function mapRewardRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    player: row.player_name,
    targetUserId: row.user_id,
    type: row.type,
    label: row.label,
    points: Number(row.points || 0),
    note: row.note || "",
    awardedBy: row.awarded_by || "",
    source: row.source || "",
    sourcePostId: row.source_post_id || "",
    sourcePlayId: row.source_play_id || "",
    status: row.status || "approved",
    dateKey: row.date_key || "",
    weekKey: row.week_key || "",
    createdAt: row.created_at_client ? new Date(Number(row.created_at_client) * 1000).toISOString() : "",
    approvedAt: row.approved_at ? new Date(Number(row.approved_at) * 1000).toISOString() : "",
    approvedBy: row.approved_by || "",
  };
}

function mapStickerRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    player: row.player_name,
    targetUserId: row.user_id,
    stickerKey: row.sticker_key,
    label: row.label,
    icon: row.icon,
    color: row.color,
    description: row.description || "",
    note: row.note || "",
    awardedBy: row.awarded_by || "",
    context: row.context || "",
    dateKey: row.date_key || "",
    weekKey: row.week_key || "",
    createdAt: row.created_at_client ? new Date(Number(row.created_at_client) * 1000).toISOString() : "",
  };
}

async function getTeamReward(db, teamId, id) {
  return db.prepare(
    `SELECT * FROM player_reward_events WHERE team_id = ? AND id = ? LIMIT 1`,
  ).bind(teamId, id).first();
}

async function getTeamSticker(db, teamId, id) {
  return db.prepare(
    `SELECT * FROM player_helmet_stickers WHERE team_id = ? AND id = ? LIMIT 1`,
  ).bind(teamId, id).first();
}

async function requireActiveRecordTarget(db, teamId, row) {
  // Older leaderboard rows may predate user_id. A staff member can still
  // revoke those records only when the stored display name maps to exactly
  // one current active player on this team; ambiguity is deliberately denied.
  const target = await requireActiveTeamPlayer(db, teamId, row?.user_id
    ? { userId: String(row.user_id) }
    : { name: String(row?.player_name || "") });
  return target;
}

/**
 * Player sync is now a summary refresh only. Browser-generated scores are
 * deliberately rejected: verified attempt rows can be created only by the
 * server-authoritative quiz completion transaction.
 */
export async function syncLeaderboardPayload(db, teamId, session, payload = {}) {
  if (session?.role !== "player" || !session?.d1UserId) {
    throw new Error("Player account required for quiz attempt sync.");
  }
  const rewards = payloadArray(payload, "rewards", 0);
  const stickers = payloadArray(payload, "stickers", 0);
  if (rewards.length || stickers.length) {
    throw new TypeError("Player quiz sync cannot submit rewards or stickers.");
  }
  const attempts = payloadArray(payload, "attempts", 150);
  if (attempts.length) {
    throw new TypeError("Browser-submitted quiz attempts are no longer accepted.");
  }
  // Re-resolve the active principal even though no row is written. This keeps
  // the summary-refresh route fail-closed if a named player was disabled or
  // moved to another team after their signed session was issued.
  await resolveSessionPlayer(db, teamId, session);
  return { attempts: 0, duplicates: 0, rewards: 0, stickers: 0, refreshOnly: true };
}

/**
 * Staff records are single, idempotent mutations rather than an untrusted
 * browser snapshot. Create, approve, and revoke all resolve the target inside
 * the active team before D1 is changed.
 */
export async function mutateStaffLeaderboardRecord(db, teamId, session, payload = {}) {
  if (!session || !["admin", "coach"].includes(session.role)) {
    throw new Error("Staff account required for leaderboard awards.");
  }
  if (!isPlainObject(payload)) throw new TypeError("Award request must be an object.");
  const kind = requiredText(payload.kind, "award kind", 20);
  const action = requiredText(payload.action, "award action", 20);
  if (!new Set(["reward", "sticker"]).has(kind)) throw new TypeError("Unsupported award kind.");
  if (!new Set(["create", "approve", "revoke"]).has(action)) throw new TypeError("Unsupported award action.");
  if (kind === "sticker" && action === "approve") throw new TypeError("Stickers cannot be approved.");
  const record = isPlainObject(payload.record) ? payload.record : {};
  const id = requiredId(record.id || payload.id, `${kind === "reward" ? "Reward" : "Sticker"} ID`);
  const now = new Date();
  const timestamp = Math.floor(now.getTime() / 1000);

  if (kind === "reward" && action === "create") {
    const target = await requireActiveTeamPlayer(db, teamId, normalizeStaffTarget({ ...record, target: payload.target }));
    const reward = normalizeRewardForCreate(record, target, session, now);
    await db.prepare(
      `INSERT INTO player_reward_events (
        id, team_id, user_id, player_name, type, label, points, note,
        awarded_by, source, source_post_id, source_play_id, status,
        reward_origin, date_key, week_key, created_at_client, approved_at, approved_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, id) DO NOTHING`,
    ).bind(
      reward.id, teamId, reward.userId, reward.playerName, reward.type, reward.label, reward.points, reward.note,
      reward.awardedBy, reward.source, reward.sourcePostId, reward.sourcePlayId, reward.status,
      "staff", reward.dateKey, reward.weekKey, reward.createdAt, reward.approvedAt, reward.approvedBy, timestamp,
    ).run();
    return { kind, action, record: mapRewardRecord(await getTeamReward(db, teamId, reward.id)) };
  }

  if (kind === "sticker" && action === "create") {
    const target = await requireActiveTeamPlayer(db, teamId, normalizeStaffTarget({ ...record, target: payload.target }));
    const sticker = normalizeStickerForCreate(record, target, session, now);
    await db.prepare(
      `INSERT INTO player_helmet_stickers (
        id, team_id, user_id, player_name, sticker_key, label, icon, color,
        description, note, awarded_by, context, date_key, week_key,
        sticker_origin, created_at_client, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(team_id, id) DO NOTHING`,
    ).bind(
      sticker.id, teamId, sticker.userId, sticker.playerName, sticker.stickerKey, sticker.label, sticker.icon, sticker.color,
      sticker.description, sticker.note, sticker.awardedBy, sticker.context, sticker.dateKey, sticker.weekKey,
      "staff", sticker.createdAt, timestamp,
    ).run();
    return { kind, action, record: mapStickerRecord(await getTeamSticker(db, teamId, sticker.id)) };
  }

  if (kind === "reward") {
    const reward = await getTeamReward(db, teamId, id);
    if (!reward) return { kind, action, id, deleted: action === "revoke", record: null };
    await requireActiveRecordTarget(db, teamId, reward);
    if (action === "approve" && reward.status !== "approved") {
      const approvedPoints = record.points === undefined
        ? Number(reward.points || 0)
        : boundedInteger(record.points, "reward points", 0, MAX_STAFF_POINTS, 0);
      await db.prepare(
        `UPDATE player_reward_events
            SET points = ?, status = 'approved', approved_at = ?, approved_by = ?, updated_at = ?
          WHERE team_id = ? AND id = ?`,
      ).bind(approvedPoints, timestamp, staffActorName(session), timestamp, teamId, id).run();
    }
    if (action === "revoke") {
      await db.prepare("DELETE FROM player_reward_events WHERE team_id = ? AND id = ?")
        .bind(teamId, id).run();
      return { kind, action, id, deleted: true, record: null };
    }
    return { kind, action, record: mapRewardRecord(await getTeamReward(db, teamId, id)) };
  }

  const sticker = await getTeamSticker(db, teamId, id);
  if (!sticker) return { kind, action, id, deleted: true, record: null };
  await requireActiveRecordTarget(db, teamId, sticker);
  await db.prepare("DELETE FROM player_helmet_stickers WHERE team_id = ? AND id = ?")
    .bind(teamId, id).run();
  return { kind, action, id, deleted: true, record: null };
}

function mergeRows(attemptRows = [], rewardRows = [], stickerRows = []) {
  const rows = new Map();
  const ensure = (row) => {
    const playerName = cleanText(row?.player_name, 120) || "Player";
    const identity = cleanText(row?.player_identity, 180) || `name:${playerName.toLowerCase()}`;
    if (!rows.has(identity)) {
      rows.set(identity, {
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
    return rows.get(identity);
  };

  attemptRows.forEach((row) => {
    const target = ensure(row);
    target.quizPoints += summaryInt(row.quiz_points);
    target.attempts += summaryInt(row.attempts);
    target.answered += summaryInt(row.answered);
    target.correct += summaryInt(row.correct);
    target.wrong += summaryInt(row.wrong);
  });

  rewardRows.forEach((row) => {
    const target = ensure(row);
    const points = summaryInt(row.reward_points, -1000000, 1000000);
    target.rewardPoints += points;
    target.questionPoints += summaryInt(row.question_points, -1000000, 1000000);
    target.answerPoints += summaryInt(row.answer_points, -1000000, 1000000);
    target.giftPoints += summaryInt(row.gift_points, -1000000, 1000000);
  });

  stickerRows.forEach((row) => {
    ensure(row).stickers += summaryInt(row.stickers);
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
  // Historic browser-origin rows stay in D1 for audit/recovery, but never
  // contribute to verified standings. 0028 stamps the only eligible quiz rows
  // during authoritative completion and staff-created award records during the
  // protected award mutation.
  const attemptWhere = season
    ? "team_id = ? AND score_origin = 'server'"
    : "team_id = ? AND week_key = ? AND score_origin = 'server'";
  const attemptBinds = season ? [teamId] : [teamId, weekKey];
  const rewardWhere = season
    ? `team_id = ? AND reward_origin = 'staff' AND ${activeRewardClause()}`
    : `team_id = ? AND week_key = ? AND reward_origin = 'staff' AND ${activeRewardClause()}`;
  const rewardBinds = season ? [teamId] : [teamId, weekKey];
  const stickerWhere = season
    ? "team_id = ? AND sticker_origin = 'staff'"
    : "team_id = ? AND week_key = ? AND sticker_origin = 'staff'";
  const stickerBinds = season ? [teamId] : [teamId, weekKey];

  const attempts = await db.prepare(
    `SELECT COALESCE(user_id, 'legacy:' || LOWER(player_name)) AS player_identity,
        MAX(player_name) AS player_name,
        SUM(total_points) AS quiz_points,
        COUNT(*) AS attempts,
        SUM(answered) AS answered,
        SUM(correct) AS correct,
        SUM(wrong) AS wrong
     FROM player_quiz_attempts
     WHERE ${attemptWhere}
     GROUP BY COALESCE(user_id, 'legacy:' || LOWER(player_name))`,
  ).bind(...attemptBinds).all();

  const rewards = await db.prepare(
    `SELECT COALESCE(user_id, 'legacy:' || LOWER(player_name)) AS player_identity,
        MAX(player_name) AS player_name,
        SUM(points) AS reward_points,
        SUM(CASE WHEN type = 'question' THEN points ELSE 0 END) AS question_points,
        SUM(CASE WHEN type = 'answer' THEN points ELSE 0 END) AS answer_points,
        SUM(CASE WHEN type = 'gift' THEN points ELSE 0 END) AS gift_points
     FROM player_reward_events
     WHERE ${rewardWhere}
     GROUP BY COALESCE(user_id, 'legacy:' || LOWER(player_name))`,
  ).bind(...rewardBinds).all();

  const stickers = await db.prepare(
    `SELECT COALESCE(user_id, 'legacy:' || LOWER(player_name)) AS player_identity,
        MAX(player_name) AS player_name, COUNT(*) AS stickers
     FROM player_helmet_stickers
     WHERE ${stickerWhere}
     GROUP BY COALESCE(user_id, 'legacy:' || LOWER(player_name))`,
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
